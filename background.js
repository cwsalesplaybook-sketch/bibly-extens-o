// background.js v4.0 — Bibi

async function getGeminiUrl() {
  const { geminiKey } = await chrome.storage.local.get('geminiKey');
  if (!geminiKey) throw new Error('Chave da API não configurada. Abra as Configurações (⚙) no popup e cole sua chave do Google AI Studio.');
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
}

let popupPort   = null;
let isRunning   = false;
let pendingPlan = null;

chrome.runtime.onInstalled.addListener(() => console.log('[Bibi v4.0] Instalado'));

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
    handleCommand(msg.text);
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
    chrome.storage.local.set({ geminiKey: msg.key }, () => sendResponse({ ok: true }));
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
async function handleCommand(text) {
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
    const plan = await generatePlan(text, tabs);
    if (!plan?.steps?.length) {
      broadcast({
        action: 'BIBI_MSG',
        text: plan?.plan_description || 'Não consegui montar um plano. Tente descrever melhor o que quer fazer.',
        unlock: true
      });
      return;
    }
    pendingPlan = { steps: plan.steps, tabs };
    broadcast({ action: 'PLAN', plan });
  } catch(e) {
    broadcast({ action: 'BIBI_MSG', text: '✗ Erro ao processar: ' + e.message, unlock: true });
  }
}

// ─── Gemini API
async function generatePlan(command, tabs) {
  const url = await getGeminiUrl();
  const tabsDesc = tabs.map(t => `• "${t.title}" → ${t.url}`).join('\n');

  const prompt = `Você é Bibi, assistente pessoal de automação de browser. Receba o comando do usuário e gere um plano de execução em JSON.

ABAS DISPONÍVEIS (grupo Bibi — você SOMENTE pode trabalhar nelas):
${tabsDesc}

COMANDO:
"${command}"

AÇÕES DISPONÍVEIS:
- navigate: navegar uma aba para uma URL (tab_url: aba de destino, value: url final)
- click: clicar num elemento visível (target: texto do botão/link, tab_url: aba)
- type: digitar em um campo (target: placeholder ou label do campo, value: texto, tab_url: aba)
- fill_cell: preencher célula no Google Sheets (cell: ex "B3", value: texto, tab_url: url da planilha)
- goto_cell: mover cursor para célula Sheets (cell: ex "A1", tab_url: url da planilha)
- read_page: ler conteúdo de uma aba (tab_url: aba) — retorna texto para análise
- wait: aguardar (ms: millisegundos)
- scroll: rolar página (direction: "down" ou "up", tab_url: aba)

Responda SOMENTE com JSON válido, sem markdown, sem texto fora do JSON:
{
  "plan_description": "Resumo legível do que vou fazer",
  "steps": [
    {
      "id": 1,
      "action": "tipo_da_ação",
      "tab_url": "url da aba (obrigatório quando action não é wait)",
      "target": "texto do elemento ou seletor CSS",
      "value": "valor a inserir",
      "cell": "endereço da célula ex B3",
      "ms": 1000,
      "description": "descrição legível e curta deste passo"
    }
  ]
}

Regras:
- Use SOMENTE as abas listadas acima
- Para Sheets: prefira fill_cell e goto_cell
- Se o comando não for possível com as abas disponíveis, retorne steps: [] e explique em plan_description
- Seja direto nas descriptions (o usuário verá cada passo)`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    const parsed = JSON.parse(err).error?.message || err.slice(0, 200);
    throw new Error(`Gemini ${res.status}: ${parsed}`);
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim();

  try { return JSON.parse(cleaned); }
  catch(_) { throw new Error('Resposta da IA inválida. Tente reformular o comando.'); }
}

// ─── Executar plano step a step
async function executePlan({ steps, tabs }) {
  isRunning = true;
  pendingPlan = null;
  broadcast({ action: 'EXECUTING' });

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      broadcast({ action: 'STEP_START', index: i });

      try {
        if (step.action === 'wait') {
          await sleep(Math.min(step.ms || 1000, 10000));
          broadcast({ action: 'STEP_DONE', index: i, ok: true });
          continue;
        }
        if (step.action === 'navigate') {
          const tab = findTab(tabs, step.tab_url);
          if (!tab) throw new Error('Aba não encontrada');
          await chrome.tabs.update(tab.id, { url: step.value || step.tab_url });
          await sleep(2000);
          broadcast({ action: 'STEP_DONE', index: i, ok: true });
          continue;
        }
        const tab = findTab(tabs, step.tab_url);
        if (!tab) throw new Error('Aba não encontrada: ' + step.tab_url);
        await chrome.tabs.update(tab.id, { active: true });
        await sleep(500);
        const result = await sendToExecutor(tab.id, step);
        broadcast({ action: 'STEP_DONE', index: i, ok: result.success, error: result.error });
      } catch(e) {
        broadcast({ action: 'STEP_DONE', index: i, ok: false, error: e.message });
      }
      await sleep(200);
    }
  } finally {
    isRunning = false;
    broadcast({ action: 'DONE' });
    broadcast({ action: 'BIBI_MSG', text: '✅ Tudo pronto! Algo mais?', unlock: false });
  }
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
