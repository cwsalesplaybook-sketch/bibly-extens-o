// background.js v4.5 — Bibi (Groq) — sheetsFind + fillCell fix

async function callGroq(prompt) {
  const { groqKey } = await chrome.storage.local.get('groqKey');
  if (!groqKey) throw new Error('Chave Groq não configurada. Abra as Configurações (⚙) e cole sua chave de console.groq.com.');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${groqKey}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 2048,
      response_format: { type: 'json_object' }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    let msg;
    try { msg = JSON.parse(err).error?.message || err.slice(0, 200); }
    catch(_) { msg = err.slice(0, 200); }
    throw new Error(`Groq ${res.status}: ${msg}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

let popupPort   = null;
let isRunning   = false;
let pendingPlan = null;

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Bibi v4.5] Instalado');
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(e => console.error('[Bibi] sidePanel:', e));
});

chrome.action.onClicked.addListener(tab => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// ─── Porta persistente com popup
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'bibi_popup') return;
  popupPort = port;
  port.postMessage({ action: 'INIT', isRunning });
  port.onDisconnect.addListener(() => { popupPort = null; });
});

// ─── Mensagens one-shot
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'COMMAND') {
    handleCommand(msg.text, msg.attachment);
    sendResponse({ ok: true });
    return;
  }
  if (msg.action === 'CONFIRM_PLAN') {
    if (pendingPlan) executePlan(pendingPlan);
    sendResponse({ ok: true });
    return;
  }
  if (msg.action === 'CANCEL_PLAN') {
    pendingPlan = null;
    broadcast({ action: 'BIBI_MSG', text: 'Cancelado. O que mais posso fazer?', unlock: true });
    sendResponse({ ok: true });
    return;
  }
  if (msg.action === 'CREATE_GROUP') {
    createBibiGroup().then(sendResponse);
    return true;
  }
  if (msg.action === 'GET_GROUP_TABS') {
    getBibiGroupTabs().then(tabs => sendResponse({ tabs }));
    return true;
  }
  if (msg.action === 'SAVE_KEY') {
    chrome.storage.local.set({ groqKey: msg.key }, () => sendResponse({ ok: true }));
    return true;
  }
});

// ─── Broadcast para popup
function broadcast(msg) {
  if (popupPort) { try { popupPort.postMessage(msg); } catch(_) {} }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Abas do grupo Bibi
async function getBibiGroupTabs() {
  try {
    const groups = await chrome.tabGroups.query({ title: 'Bibi' });
    if (!groups.length) return [];
    return await chrome.tabs.query({ groupId: groups[0].id });
  } catch(_) { return []; }
}

// ─── Receber comando do usuário
async function handleCommand(text, attachment) {
  if (isRunning) return;

  const tabs = await getBibiGroupTabs();
  if (!tabs.length) {
    broadcast({
      action: 'BIBI_MSG',
      text: '⚠ Nenhuma aba no grupo Bibi ainda.\nClique em "+ Grupo" para criar o grupo e adicione as abas onde quero trabalhar.',
      unlock: true
    });
    return;
  }

  broadcast({ action: 'THINKING' });

  try {
    const plan = await generatePlan(text, tabs, attachment);
    if (!plan?.steps?.length) {
      broadcast({
        action: 'BIBI_MSG',
        text: plan?.plan_description || 'Não consegui montar um plano. Tente descrever melhor o que quer fazer.',
        unlock: true
      });
      return;
    }
    pendingPlan = { steps: plan.steps, tabs, command: text };
    broadcast({ action: 'PLAN', plan });
  } catch(e) {
    broadcast({ action: 'BIBI_MSG', text: '✗ Erro ao processar: ' + e.message, unlock: true });
  }
}

// ─── Groq / Llama API
// Calcula a coluna do Sheets para o dia de hoje no acompanhamento mensal
// Colunas de datas começam em K (dia 01), L (dia 02), etc.
function getTodaySheetColumn() {
  const day = new Date().getDate();
  const colCode = 'K'.charCodeAt(0) + (day - 1);
  if (colCode <= 'Z'.charCodeAt(0)) return String.fromCharCode(colCode);
  // Além de Z: AA, AB...
  const first = String.fromCharCode('A'.charCodeAt(0) + Math.floor((colCode - 'A'.charCodeAt(0)) / 26) - 1);
  const second = String.fromCharCode('A'.charCodeAt(0) + ((colCode - 'A'.charCodeAt(0)) % 26));
  return first + second;
}

async function generatePlan(command, tabs, attachment) {
  const tabsDesc = tabs.map(t => `• "${t.title}" → ${t.url}`).join('\n');

  const today = new Date();
  const todayStr = today.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
  const todayShort = today.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
  const todayCol = getTodaySheetColumn();

  const prompt = `Você é Bibi, assistente pessoal de automação de browser. Receba o comando do usuário e gere um plano de execução em JSON.

DATA DE HOJE: ${todayStr} (${todayShort})
COLUNA DE HOJE NO SHEETS DE ACOMPANHAMENTO: ${todayCol}
(As colunas de data começam em K=01/06, L=02/06, M=03/06... ${todayCol}=${todayShort})

ABAS DISPONÍVEIS (grupo Bibi — você SOMENTE pode trabalhar nelas):
${tabsDesc}

COMANDO:
"${command}"

AÇÕES DISPONÍVEIS:
- navigate      : navegar aba para URL       (tab_url, value: url)
- click         : clicar elemento            (tab_url, target: texto/aria-label)
- type          : digitar em campo           (tab_url, target: label/aria-label, value: texto)
- press_key     : pressionar tecla           (tab_url, key: "Enter"|"Tab"|"Escape"|"ArrowDown")
- fill_cell     : preencher célula Sheets    (tab_url, cell: "B3", value: texto)
- goto_cell     : ir para célula Sheets      (tab_url, cell: "A1")
- find_in_sheet : busca lead pelo nome       (tab_url, value: "Nome do Lead") → retorna linha ex: "D6"
- read_page     : ler conteúdo da aba        (tab_url) → retorna texto
- wait          : aguardar                   (ms: número)
- scroll        : rolar página               (tab_url, direction: "down"|"up")

═══ RECEITAS PRONTAS ══════════════════════════════════════

📱 WHATSAPP WEB — enviar mensagem para contato:
  1. click       target="Pesquisar ou começar"
  2. type        target="pesquisar"  value="Nome do Contato"
  3. wait        ms=800
  4. press_key   key="ArrowDown"
  5. press_key   key="Enter"
  6. wait        ms=600
  7. type        target="mensagem"  value="texto da mensagem"
  8. press_key   key="Enter"

📊 GOOGLE SHEETS — marcar follow/status de leads (FLUXO OBRIGATÓRIO):

  PASSO 1 (faz UMA VEZ): descobre qual coluna é a data de hoje lendo o cabeçalho
    find_in_sheet  value="${todayShort}"   ← pesquisa a data de hoje no cabeçalho

  PASSO 2 (repete para cada lead): busca o lead e preenche
    find_in_sheet  value="Nome do Lead"
    fill_cell      cell="auto"  value="Sem retorno"

  EXEMPLO para 3 leads:
  1. find_in_sheet  value="${todayShort}"       ← descobre coluna (faz só 1x)
  2. find_in_sheet  value="Bruna"
  3. fill_cell      cell="auto"  value="Sem retorno"
  4. find_in_sheet  value="Sergio"
  5. fill_cell      cell="auto"  value="Sem retorno"
  6. find_in_sheet  value="Débora Lanches"
  7. fill_cell      cell="auto"  value="Sem retorno"

  REGRA: cell="auto" significa que Bibi combina a coluna da data + a linha do lead automaticamente.
  NUNCA use endereço fixo como "P6" — use sempre "auto" após find_in_sheet.

📧 GMAIL — compor e enviar email:
  1. click       target="Escrever"
  2. wait        ms=1000
  3. type        target="Para"     value="email@exemplo.com"
  4. type        target="Assunto"  value="Meu assunto"
  5. type        target="Corpo"    value="Texto do email"
  6. click       target="Enviar"

═══════════════════════════════════════════════════════════

REGRAS CRÍTICAS:
- NUNCA retorne steps:[] dizendo que não é possível. Se não souber como fazer, use read_page primeiro para entender o contexto e tente.
- Se faltar informação, gere um plano que COMEÇA com read_page para descobrir o dado, e use o que encontrar nos próximos passos.
- Quando o usuário disser "pesquise manualmente", isso significa: use read_page ou goto_cell para navegar pela planilha e encontrar o valor.
- Use SOMENTE as abas listadas acima.
- Para WhatsApp: sempre use press_key Enter para enviar.
- Para Sheets: use fill_cell para preencher, read_page para ler.

Responda SOMENTE com JSON válido, sem markdown:
{
  "plan_description": "Resumo do que vou fazer",
  "steps": [
    {
      "id": 1,
      "action": "tipo_da_ação",
      "tab_url": "url da aba (obrigatório exceto em wait)",
      "target": "texto do elemento ou aria-label",
      "value": "valor a inserir",
      "cell": "ex: B3",
      "key": "Enter",
      "ms": 1000,
      "description": "descrição curta do passo"
    }
  ]
}`;

  // ── Com imagem → usa modelo de visão Llama 4
  if (attachment?.type === 'image') {
    return await generatePlanWithVision(prompt, attachment);
  }

  // ── Com PDF → extrai texto e inclui no prompt
  if (attachment?.type === 'pdf') {
    const pdfText = await extractPdfText(attachment.data);
    const promptWithPdf = prompt + `\n\nCONTEÚDO DO PDF ANEXADO:\n"""\n${pdfText}\n"""\nUse o conteúdo do PDF para preencher os dados corretos.`;
    const raw = await callGroq(promptWithPdf);
    return parseGroqJson(raw);
  }

  // ── Texto simples
  const raw = await callGroq(prompt);
  return parseGroqJson(raw);
}

function parseGroqJson(raw) {
  const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim();
  try { return JSON.parse(cleaned); }
  catch(_) { throw new Error('Resposta da IA inválida. Tente reformular o comando.'); }
}

async function generatePlanWithVision(prompt, attachment) {
  const { groqKey } = await chrome.storage.local.get('groqKey');
  if (!groqKey) throw new Error('Chave Groq não configurada.');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{
        role: 'user',
        content: [
          { type: 'text',      text: prompt },
          { type: 'image_url', image_url: { url: `data:${attachment.mimeType};base64,${attachment.data}` } }
        ]
      }],
      temperature: 0.1,
      max_tokens: 3000,
      response_format: { type: 'json_object' }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    let msg;
    try { msg = JSON.parse(err).error?.message || err.slice(0, 200); }
    catch(_) { msg = err.slice(0, 200); }
    throw new Error(`Groq Vision ${res.status}: ${msg}`);
  }

  const data = await res.json();
  return parseGroqJson(data.choices[0].message.content);
}

async function extractPdfText(base64Data) {
  try {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const raw = new TextDecoder('latin-1').decode(bytes);

    // ── Tentativa 1: BT/ET direto (PDFs simples sem compressão)
    const direct = [];
    const btRe = /BT[\s\S]*?ET/g;
    let m;
    while ((m = btRe.exec(raw)) !== null) {
      const block = m[0];
      const tRe = /\(([^)]{1,300})\)/g;
      let t;
      while ((t = tRe.exec(block)) !== null) {
        const txt = t[1].replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))).trim();
        if (txt.length > 1 && /[A-Za-z0-9À-ÿ]/.test(txt)) direct.push(txt);
      }
    }
    if (direct.length > 10) return direct.join(' ').slice(0, 6000);

    // ── Tentativa 2: Descomprime streams FlateDecode (Google Sheets exporta assim)
    const decomp = [];
    const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    while ((m = streamRe.exec(raw)) !== null) {
      try {
        const sStr = m[1];
        const sBytes = new Uint8Array(sStr.length);
        for (let i = 0; i < sStr.length; i++) sBytes[i] = sStr.charCodeAt(i) & 0xff;
        if (sBytes.length < 4) continue;
        try {
          const ds = new DecompressionStream('deflate-raw');
          const w = ds.writable.getWriter();
          const r = ds.readable.getReader();
          w.write(sBytes.slice(2)); // pula header zlib (2 bytes)
          w.close();
          const chunks = [];
          while (true) {
            const {done, value} = await r.read();
            if (done) break;
            chunks.push(value);
          }
          const total = chunks.reduce((s, c) => s + c.length, 0);
          const out = new Uint8Array(total);
          let off = 0;
          for (const c of chunks) { out.set(c, off); off += c.length; }
          decomp.push(new TextDecoder('latin-1').decode(out));
        } catch (_) {}
      } catch (_) {}
    }

    const all = decomp.join('\n');
    if (!all) return '(PDF sem texto legível — envie como screenshot/imagem)';

    // ── Tentativa 3: Constrói mapa glyph→Unicode a partir dos CMaps
    const gmap = new Map();
    const cmapRe = /begincmap([\s\S]*?)endcmap/g;
    while ((m = cmapRe.exec(all)) !== null) {
      const cb = m[1];
      // beginbfchar: <src> <dst>
      const bfRe = /<([0-9A-Fa-f]{2,8})>\s*<([0-9A-Fa-f]{2,8})>/g;
      let p;
      while ((p = bfRe.exec(cb)) !== null) {
        const src = parseInt(p[1], 16), dst = parseInt(p[2], 16);
        if (dst > 31) gmap.set(src, String.fromCodePoint(dst));
      }
      // beginbfrange: <start> <end> <base>
      const brRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
      while ((p = brRe.exec(cb)) !== null) {
        const start = parseInt(p[1], 16), end = parseInt(p[2], 16);
        let uni = parseInt(p[3], 16);
        for (let i = start; i <= Math.min(end, start + 255); i++, uni++) {
          if (uni > 31) gmap.set(i, String.fromCodePoint(uni));
        }
      }
    }

    // ── Tentativa 4: Extrai texto dos BT/ET descomprimidos com o CMap
    const textLines = [];
    const dbtRe = /BT([\s\S]*?)ET/g;
    while ((m = dbtRe.exec(all)) !== null) {
      const block = m[1];
      let line = '';
      // Hex strings: <XXXX>
      const hexRe = /<([0-9A-Fa-f]{2,})>/g;
      let h;
      while ((h = hexRe.exec(block)) !== null) {
        const hex = h[1];
        for (let i = 0; i < hex.length; i += 4) {
          const g = parseInt(hex.substr(i, Math.min(4, hex.length - i)), 16);
          if (gmap.has(g)) line += gmap.get(g);
          else if (g > 31 && g < 127) line += String.fromCharCode(g);
        }
      }
      // Strings em parênteses
      const pRe = /\(([^)]{1,200})\)/g;
      let pm;
      while ((pm = pRe.exec(block)) !== null) {
        const s = pm[1].replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))).trim();
        if (s.length > 0 && /[A-Za-z0-9À-ÿ]/.test(s)) line += ' ' + s;
      }
      if (line.trim().length > 1) textLines.push(line.trim());
    }

    if (textLines.length > 3) return textLines.join('\n').slice(0, 6000);

    // ── Fallback: qualquer texto legível nas streams descomprimidas
    const fallback = (all.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9\s\-\/\:\(\)\.]{4,}/g) || [])
      .filter(s => /[A-Za-zÀ-ÿ]{3}/.test(s) && !/^(Font|Type|CID|begin|end|stream|Alpha|Device)/i.test(s))
      .join(' ').slice(0, 6000);

    return fallback || '(PDF com codificação especial — envie como screenshot/imagem)';
  } catch(e) {
    return '(Erro ao extrair PDF: ' + e.message + ')';
  }
}

// ─── Executar plano step a step (com re-planejamento após read_page)
async function executePlan({ steps, tabs, command }) {
  isRunning = true;
  pendingPlan = null;
  broadcast({ action: 'EXECUTING' });

  // Fila dinâmica: permite adicionar passos após read_page
  const queue = [...steps];
  let displayIdx = 0;
  let lastFoundRow = null; // linha do lead (ex: 11)
  let lastFoundCol = null; // coluna da data de hoje (ex: "P")

  try {
    while (queue.length > 0) {
      const step = queue.shift();

      // ── Resolve cell="auto" ou cell="P0" usando lastFoundCol + lastFoundRow
      if (step.action === 'fill_cell' && step.cell) {
        if (step.cell === 'auto') {
          if (lastFoundCol && lastFoundRow) {
            step.cell = lastFoundCol + lastFoundRow;
            broadcast({ action: 'BIBI_MSG', text: `🎯 Preenchendo célula ${step.cell}` });
          } else {
            // Ainda não achamos col ou linha — reporta erro mas continua
            broadcast({ action: 'STEP_START',  index: displayIdx });
            broadcast({ action: 'STEP_DONE',   index: displayIdx, ok: false, error: 'Célula "auto" não resolvida: precisa de find_in_sheet antes.' });
            displayIdx++;
            continue;
          }
        } else if (lastFoundRow && /^([A-Za-z]+)(0|\?\??)$/.test(step.cell)) {
          step.cell = step.cell.replace(/^([A-Za-z]+)(0|\?\??)$/, `$1${lastFoundRow}`);
        }
      }

      broadcast({ action: 'STEP_START', index: displayIdx });

      try {
        if (step.action === 'wait') {
          await sleep(Math.min(step.ms || 1000, 10000));
          broadcast({ action: 'STEP_DONE', index: displayIdx, ok: true });
          displayIdx++;
          continue;
        }
        if (step.action === 'navigate') {
          const tab = findTab(tabs, step.tab_url);
          if (!tab) throw new Error('Aba não encontrada');
          await chrome.tabs.update(tab.id, { url: step.value || step.tab_url });
          await sleep(2000);
          broadcast({ action: 'STEP_DONE', index: displayIdx, ok: true });
          displayIdx++;
          continue;
        }

        const tab = findTab(tabs, step.tab_url);
        if (!tab) throw new Error('Aba não encontrada: ' + step.tab_url);
        await chrome.tabs.update(tab.id, { active: true });
        await sleep(500);
        const result = await sendToExecutor(tab.id, step);
        broadcast({ action: 'STEP_DONE', index: displayIdx, ok: result.success, error: result.error });

        // ── Captura col/linha do find_in_sheet
        if (step.action === 'find_in_sheet' && result.success) {
          if (result.row && result.row > 5) {
            // Linha > 5 = dados (lead)
            lastFoundRow = result.row;
            broadcast({ action: 'BIBI_MSG', text: `📍 Lead na linha ${result.row}` });
          } else if (result.row && result.row <= 5) {
            // Linha ≤ 5 = cabeçalho (data de hoje)
            lastFoundCol = result.col;
            broadcast({ action: 'BIBI_MSG', text: `📅 Coluna de hoje: ${result.col}` });
          }
        }

        // ── Leitura de página: usa conteúdo para gerar próximos passos
        if (step.action === 'read_page' && result.success && result.content && command && queue.length === 0) {
          broadcast({ action: 'BIBI_MSG', text: '📖 Lendo conteúdo... analisando o que fazer.' });
          try {
            const followUp = await generatePlanFromContent(command, result.content, tabs);
            if (followUp?.steps?.length) {
              broadcast({ action: 'BIBI_MSG', text: '✦ ' + (followUp.plan_description || 'Continuando...') });
              queue.push(...followUp.steps);
            } else {
              broadcast({ action: 'BIBI_MSG', text: followUp?.plan_description || 'Li a página mas não encontrei o dado. Pode me dar mais detalhes de onde está a informação?' });
            }
          } catch(e) {
            broadcast({ action: 'BIBI_MSG', text: '✗ Erro ao analisar conteúdo: ' + e.message });
          }
        }

      } catch(e) {
        broadcast({ action: 'STEP_DONE', index: displayIdx, ok: false, error: e.message });
      }

      await sleep(step.action === 'click' ? 900 : 250);
      displayIdx++;
    }
  } finally {
    isRunning = false;
    broadcast({ action: 'DONE' });
    broadcast({ action: 'BIBI_MSG', text: '✅ Tudo pronto! Algo mais?', unlock: false });
  }
}

// ─── Re-planejar após ler conteúdo da página
async function generatePlanFromContent(originalCommand, pageContent, tabs) {
  const tabsDesc = tabs.map(t => `• "${t.title}" → ${t.url}`).join('\n');

  const prompt = `Você é Bibi, assistente de automação. O usuário pediu:
"${originalCommand}"

Você acabou de LER o conteúdo da página e encontrou o seguinte:
"""
${pageContent.slice(0, 3500)}
"""

Com base no conteúdo acima, gere os próximos passos para completar o pedido do usuário.

ABAS DISPONÍVEIS:
${tabsDesc}

AÇÕES DISPONÍVEIS:
- click       (tab_url, target)
- type        (tab_url, target, value)
- press_key   (tab_url, key)
- fill_cell   (tab_url, cell, value)
- goto_cell   (tab_url, cell)
- read_page   (tab_url)
- wait        (ms)
- scroll      (tab_url, direction)

REGRAS:
- Use os dados encontrados na leitura para agir. Ex: se leu um número de telefone, use-o para pesquisar no WhatsApp.
- NUNCA retorne steps:[] — se não achou o dado, gere pelo menos um scroll ou goto_cell para continuar procurando.
- Se encontrou exatamente o que o usuário precisava, gere os passos de ação agora.

Responda SOMENTE com JSON válido:
{
  "plan_description": "O que encontrei e o que vou fazer",
  "steps": [...]
}`;

  const raw = await callGroq(prompt);
  return parseGroqJson(raw);
}

async function sendToExecutor(tabId, step) {
  try {
    return await chrome.tabs.sendMessage(tabId, { action: 'EXECUTE_STEP', step });
  } catch(_) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content_executor.js'] });
      await sleep(600);
      return await chrome.tabs.sendMessage(tabId, { action: 'EXECUTE_STEP', step });
    } catch(e2) { return { success: false, error: e2.message }; }
  }
}

function findTab(tabs, url) {
  if (!url) return tabs[0];
  const norm = s => s.replace(/https?:\/\//, '').split('?')[0].split('#')[0].replace(/\/$/, '');
  const target = norm(url);
  return tabs.find(t => {
    const tu = norm(t.url);
    return tu.includes(target) || target.includes(tu.split('/')[0]);
  }) || tabs[0];
}

// ─── Criar grupo Bibi
async function createBibiGroup() {
  try {
    const existing = await chrome.tabGroups.query({ title: 'Bibi' });
    if (existing.length) return { success: true, existing: true };
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const gid = await chrome.tabs.group({ tabIds: [currentTab.id] });
    await chrome.tabGroups.update(gid, { title: 'Bibi', color: 'purple' });
    return { success: true, existing: false };
  } catch(e) { return { success: false, error: e.message }; }
}
