// content_executor.js v4.5 — Bibi (sheetsFind + fillCell rewrite)
if (!window.__BIBI_EXEC__) {
  window.__BIBI_EXEC__ = true;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ─── Cursor roxo — Shadow DOM (imune a z-index e stacking context do Gmail)
  const Cursor = {
    host: null, shadow: null, el: null,

    init() {
      if (this.el) return;
      if (document.getElementById('__bibi_host__')) {
        document.getElementById('__bibi_host__').remove();
      }
      this.host = document.createElement('div');
      this.host.id = '__bibi_host__';
      this.host.style.cssText =
        'all:unset;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
      document.documentElement.appendChild(this.host);
      this.shadow = this.host.attachShadow({ mode: 'open' });
      this.shadow.innerHTML = `
        <style>
          @keyframes bibi-pulse {
            0%,100%{ filter:drop-shadow(0 0 6px rgba(139,92,246,.9)) drop-shadow(0 0 14px rgba(139,92,246,.4)); }
            50%    { filter:drop-shadow(0 0 10px rgba(236,72,153,1)) drop-shadow(0 0 20px rgba(236,72,153,.5)); }
          }
          .cur {
            position:fixed; width:28px; height:32px;
            pointer-events:none; z-index:2147483647;
            transition:left .42s cubic-bezier(.25,.46,.45,.94),
                       top  .42s cubic-bezier(.25,.46,.45,.94),
                       opacity .25s, transform .1s;
            animation:bibi-pulse 1.5s ease-in-out infinite;
            left:50%; top:50%; opacity:0;
          }
        </style>
        <div class="cur" id="cur">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="32" viewBox="0 0 28 32">
            <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#8b5cf6"/>
              <stop offset="100%" stop-color="#ec4899"/>
            </linearGradient></defs>
            <path d="M2,2 L2,22 L7,17 L11,26 L15,24 L11,15 L18,15 Z"
                  fill="url(#g)" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
        </div>`;
      this.el = this.shadow.getElementById('cur');
      requestAnimationFrame(() => { if (this.el) this.el.style.opacity = '1'; });
    },

    async moveTo(el) {
      if (!el) return;
      this.init();
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      await sleep(280);
      const r = el.getBoundingClientRect();
      this.el.style.left = (r.left + r.width / 2) + 'px';
      this.el.style.top  = (r.top  + r.height / 2) + 'px';
      await sleep(480);
    },

    async click(el) {
      if (!el) return;
      await this.moveTo(el);
      this.el.style.transform = 'scale(0.78)';
      await sleep(90);
      this.el.style.transform = '';
      el.click();
      await sleep(200);
    },

    async typeIn(el, text, pressTab = false) {
      await this.moveTo(el);
      el.click();
      el.focus();
      await sleep(130);

      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        // Input padrão — usa native setter (funciona com React/Vue)
        el.select?.();
        const proto = el.tagName === 'INPUT'
          ? HTMLInputElement.prototype
          : HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) { setter.call(el, ''); setter.call(el, text); }
        else { el.value = text; }
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // contenteditable (corpo do Gmail, etc.)
        el.focus();
        document.execCommand('selectAll', false, null);
        await sleep(50);
        const ok = document.execCommand('insertText', false, text);
        if (!ok) {
          const dt = new DataTransfer();
          dt.setData('text/plain', text);
          el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
          await sleep(120);
          if (!el.textContent.trim()) {
            el.textContent = text;
            el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
          }
        }
      }

      await sleep(180);

      if (pressTab) {
        // Gmail precisa de Tab para confirmar o destinatário como chip
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
        el.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Tab', keyCode: 9, bubbles: true }));
        await sleep(250);
      }
    },

    hide() {
      if (!this.el) return;
      this.el.style.opacity = '0';
      setTimeout(() => {
        this.host?.remove();
        this.host = null; this.shadow = null; this.el = null;
      }, 320);
    }
  };

  // ─── HUD
  const HUD = {
    el: null,
    show(msg) {
      if (!this.el) {
        this.el = document.createElement('div');
        Object.assign(this.el.style, {
          position: 'fixed', bottom: '60px', right: '22px', zIndex: '2147483647',
          background: 'linear-gradient(135deg,#7c3aed,#ec4899)',
          color: 'white', fontSize: '12px', fontWeight: '700',
          fontFamily: '-apple-system,sans-serif', padding: '8px 15px',
          borderRadius: '12px', boxShadow: '0 4px 20px rgba(124,58,237,.55)',
          pointerEvents: 'none', opacity: '0', transition: 'opacity .3s'
        });
        document.documentElement.appendChild(this.el);
        requestAnimationFrame(() => this.el && (this.el.style.opacity = '1'));
      }
      this.el.textContent = '✦ Bibi — ' + msg;
    },
    hide() {
      if (!this.el) return;
      this.el.style.opacity = '0';
      setTimeout(() => { this.el?.remove(); this.el = null; }, 350);
    }
  };

  // ─── Retry: tenta encontrar elemento até N vezes
  async function waitFor(findFn, retries = 5, delay = 550) {
    for (let i = 0; i < retries; i++) {
      const el = findFn();
      if (el) return el;
      if (i < retries - 1) await sleep(delay);
    }
    return null;
  }

  // ─── Encontrar elemento clicável (botões, links, etc.)
  function findEl(target) {
    if (!target) return null;

    // CSS selector direto
    try { const e = document.querySelector(target); if (e) return e; } catch(_) {}

    const lower = target.toLowerCase();

    // Atributos específicos (Gmail usa data-tooltip para botões)
    const byAttr = document.querySelector([
      `[data-tooltip*="${target}" i]`,
      `[aria-label*="${target}" i]`,
      `[title*="${target}" i]`,
      `button[name*="${target}" i]`
    ].join(','));
    if (byAttr) return byAttr;

    // Texto visível
    const TAGS = 'button,a,[role="button"],[role="tab"],[role="menuitem"],label,span,div';
    const visible = el => {
      if (!el.offsetParent && el.getBoundingClientRect().width === 0) return false;
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
    };
    const all = [...document.querySelectorAll(TAGS)].filter(visible);
    return (
      all.find(e => e.textContent.trim().toLowerCase() === lower) ||
      all.find(e => e.textContent.trim().toLowerCase().startsWith(lower)) ||
      all.find(e => e.children.length <= 2 && e.textContent.trim().toLowerCase().includes(lower)) ||
      null
    );
  }

  // ─── Encontrar campo de entrada (input, textarea, contenteditable)
  function findInput(target) {
    if (!target) {
      return (
        document.querySelector('input:not([type=hidden]):not([type=search])') ||
        document.querySelector('textarea') ||
        document.querySelector('[contenteditable="true"]')
      );
    }

    const q = target.toLowerCase();

    // ── WhatsApp Web: caixas específicas
    if (q.includes('mensagem') || q.includes('message') || q.includes('msg')) {
      const waMsgBox =
        document.querySelector('div[contenteditable="true"][title*="mensagem" i]') ||
        document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
        document.querySelector('footer div[contenteditable="true"]');
      if (waMsgBox) return waMsgBox;
    }
    if (q.includes('pesqui') || q.includes('search') || q.includes('busca')) {
      const waSearch =
        document.querySelector('div[contenteditable="true"][title*="Pesquisar" i]') ||
        document.querySelector('div[contenteditable="true"][data-tab="2"]') ||
        document.querySelector('div[contenteditable="true"][data-tab="3"]');
      if (waSearch) return waSearch;
    }

    // 1. aria-label — Gmail usa isso para Para/Assunto/Corpo
    const byAria = document.querySelector(
      `[aria-label*="${target}" i]:is(input,textarea,[contenteditable])` +
      `,[aria-label*="${target}" i] input,[aria-label*="${target}" i] textarea`
    );
    if (byAria) {
      if (['INPUT','TEXTAREA'].includes(byAria.tagName) || byAria.isContentEditable) return byAria;
      const inner = byAria.querySelector('input,textarea,[contenteditable]');
      if (inner) return inner;
    }

    // 2. title attribute (WhatsApp usa title nos contenteditable)
    const byTitle = document.querySelector(
      `[title*="${target}" i]:is(input,textarea,[contenteditable])`
    );
    if (byTitle) return byTitle;

    // 3. placeholder
    const byPlaceholder = document.querySelector(
      `input[placeholder*="${target}" i],textarea[placeholder*="${target}" i]`
    );
    if (byPlaceholder) return byPlaceholder;

    // 4. name
    const byName = document.querySelector(`input[name*="${target}" i],textarea[name*="${target}" i]`);
    if (byName) return byName;

    // 5. label → input associado
    const label = [...document.querySelectorAll('label')].find(l =>
      l.textContent.toLowerCase().includes(q)
    );
    if (label) {
      const linked = label.htmlFor && document.getElementById(label.htmlFor);
      return linked || label.querySelector('input,textarea') || null;
    }

    // 6. contenteditable genérico
    const allEditable = [...document.querySelectorAll('[contenteditable="true"]')]
      .filter(e => {
        const r = e.getBoundingClientRect();
        return r.width > 30 && r.height > 10;
      });
    return allEditable[0] || null;
  }

  // ─── Google Sheets: Name Box
  function getNameBox() {
    return (
      document.querySelector('.waffle-name-box input') ||
      document.querySelector('[aria-label="Name Box"]') ||
      document.querySelector('[aria-label="Nome box"]') ||
      document.querySelector('#t-name-box')
    );
  }

  // Barra de fórmulas — em Sheets moderno é um div contenteditable, não input
  function getFormulaBar() {
    // Tenta ID direto primeiro
    const byId = document.querySelector('#t-formula-bar-input');
    if (byId) return byId;

    // Aria-labels comuns (EN/PT)
    const byAria = document.querySelector(
      '[aria-label*="formula" i],[aria-label*="fórmula" i],' +
      '[aria-label*="Conteúdo da célula" i],[aria-label*="Cell content" i]'
    );
    if (byAria) return byAria;

    // Busca contenteditable posicionado na faixa de topo (20-90px) — é a barra de fórmulas
    const all = [...document.querySelectorAll('[contenteditable]')];
    const topBar = all.find(el => {
      const r = el.getBoundingClientRect();
      return r.top > 15 && r.top < 90 && r.width > 80;
    });
    if (topBar) return topBar;

    return null;
  }

  // Editor in-cell (aparece após F2 ou duplo-clique)
  function getCellEditor() {
    // Primeiro candidato: dentro de .cell-input ou aria "Cell Editor"
    const direct =
      document.querySelector('.cell-input[contenteditable]') ||
      document.querySelector('[aria-label*="Cell Editor" i] [contenteditable]') ||
      document.querySelector('[aria-label*="Editor de célula" i] [contenteditable]');
    if (direct) return direct;

    // Qualquer contenteditable novo visível que NÃO seja barra de fórmulas
    return [...document.querySelectorAll('[contenteditable="true"]')].find(e => {
      const r = e.getBoundingClientRect();
      return r.top > 90 && r.width > 20 && r.height > 10 && !e.closest('[aria-hidden]');
    }) || null;
  }

  async function goToCell(addr) {
    const nb = await waitFor(getNameBox, 4, 500);
    if (!nb) throw new Error('Name Box não encontrado — está no Sheets?');
    await Cursor.moveTo(nb);
    nb.click(); nb.focus();
    await sleep(100);
    // Usa native setter para garantir que React/Vue processe
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) { setter.call(nb, ''); setter.call(nb, addr); }
    else { nb.value = addr; }
    nb.dispatchEvent(new Event('input',  { bubbles: true }));
    nb.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(80);
    nb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
    nb.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Enter', keyCode: 13, bubbles: true }));
    await sleep(400); // aguarda Sheets selecionar a célula
  }

  async function fillCell(addr, value) {
    const val = String(value);
    await goToCell(addr);
    await sleep(400);

    // ── Estratégia 0: navigator.clipboard + execCommand('paste') na barra de fórmulas
    //    (funciona com clipboardWrite/Read no manifest)
    try {
      await navigator.clipboard.writeText(val);
      await sleep(150);
      const fb0 = getFormulaBar();
      if (fb0) {
        await Cursor.moveTo(fb0);
        fb0.click(); fb0.focus();
        await sleep(120);
        document.execCommand('selectAll', false, null);
        await sleep(50);
        const pasted = document.execCommand('paste');
        if (pasted) {
          await sleep(200);
          fb0.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
          await sleep(400);
          return;
        }
      }
    } catch(_) { /* clipboard não disponível, tenta próxima */ }

    // ── Estratégia 1: Barra de fórmulas via execCommand insertText (contenteditable)
    const fb = getFormulaBar();
    if (fb) {
      await Cursor.moveTo(fb);
      fb.click(); fb.focus();
      await sleep(150);

      if (fb.tagName === 'INPUT' || fb.tagName === 'TEXTAREA') {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) { setter.call(fb, ''); setter.call(fb, val); }
        else fb.value = val;
        fb.dispatchEvent(new Event('input',  { bubbles: true }));
        fb.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // contenteditable — usa execCommand (funciona mesmo em content scripts)
        document.execCommand('selectAll', false, null);
        await sleep(40);
        document.execCommand('insertText', false, val);
      }

      await sleep(100);
      fb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
      fb.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Enter', keyCode: 13, bubbles: true }));
      await sleep(400);
      return;
    }

    // ── Estratégia 2: F2 → editor in-cell (contenteditable)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', keyCode: 113, code: 'F2', bubbles: true, cancelable: true }));
    await sleep(400);
    const editor = getCellEditor();
    if (editor) {
      editor.click(); editor.focus();
      await sleep(100);
      document.execCommand('selectAll', false, null);
      await sleep(40);
      const ok = document.execCommand('insertText', false, val);
      if (!ok) {
        // Fallback direto no DOM
        const range = document.createRange();
        range.selectNodeContents(editor);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
        sel.deleteFromDocument();
        editor.textContent = val;
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: val, inputType: 'insertText' }));
      }
      await sleep(100);
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
      await sleep(400);
      return;
    }

    // ── Estratégia 3: textarea visível + execCommand copy → Ctrl+V no grid
    const ta = document.createElement('textarea');
    ta.style.cssText = 'position:fixed;left:2px;top:2px;width:4px;height:4px;opacity:0.02;z-index:99999;';
    ta.value = val;
    document.documentElement.appendChild(ta);
    ta.focus(); ta.select();
    const copied = document.execCommand('copy');
    document.documentElement.removeChild(ta);
    await sleep(150);

    if (copied) {
      const grid =
        document.querySelector('#waffle-grid-container') ||
        document.querySelector('[class*="grid-container"]') ||
        document.querySelector('[class*="waffle"]') ||
        document.body;
      grid.click(); grid.focus();
      await sleep(100);
      grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, keyCode: 86, bubbles: true, cancelable: true }));
      await sleep(400);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      await sleep(300);
    }
  }

  // ─── Google Sheets: busca termo e retorna endereço da célula encontrada
  async function sheetsFind(term) {

    // ── Passo 0: garante que o grid do Sheets está focado
    //    (sem foco, o Ctrl+F vai pro browser, não pro Sheets)
    const grid =
      document.querySelector('canvas') ||                    // canvas principal do Sheets
      document.querySelector('#waffle-grid-container') ||
      document.querySelector('[class*="waffle-scrollable"]') ||
      document.querySelector('[class*="grid-scrollable"]') ||
      document.querySelector('[tabindex="0"]');

    if (grid) { grid.click(); await sleep(250); }

    // ── Passo 1: despacha Ctrl+F para o document
    const fireCtrlF = () =>
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'f', ctrlKey: true, keyCode: 70, code: 'KeyF',
        bubbles: true, cancelable: true
      }));

    fireCtrlF();
    await sleep(1000);

    // ── Passo 2: detecta a caixa de busca do Sheets
    //    Depois do Ctrl+F, se o Sheets abriu o Find bar, o input ESTARÁ focado
    let searchBox = null;

    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') &&
        (active.type === 'text' || !active.type || active.type === '')) {
      searchBox = active;   // ✓ foi o Sheets que abriu o Find bar
    }

    // Se activeElement não resolveu, tenta seletores conhecidos
    if (!searchBox) {
      searchBox =
        document.querySelector('input[aria-label*="Find" i]') ||
        document.querySelector('input[aria-label*="Pesquisa" i]') ||
        document.querySelector('input[aria-label*="Localizar" i]') ||
        document.querySelector('input[aria-label*="Search" i]') ||
        document.querySelector('.docs-find-bar-input input') ||
        document.querySelector('[class*="find-bar"] input') ||
        document.querySelector('[class*="FindBar"] input') ||
        document.querySelector('input.jfk-textinput') ||
        // Qualquer input que acabou de aparecer na faixa de topo (< 120px)
        [...document.querySelectorAll('input[type="text"]')].find(i => {
          const r = i.getBoundingClientRect();
          return r.width > 60 && r.width < 600 && r.top < 120 && r.top > 0;
        });
    }

    // ── Passo 3: segunda tentativa com foco forçado
    if (!searchBox) {
      // Pressiona Escape para garantir estado limpo, refoca e repete
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
      await sleep(300);
      if (grid) { grid.click(); await sleep(300); }
      fireCtrlF();
      await sleep(1000);

      const active2 = document.activeElement;
      if (active2 && (active2.tagName === 'INPUT' || active2.tagName === 'TEXTAREA')) {
        searchBox = active2;
      }
      if (!searchBox) {
        searchBox =
          document.querySelector('input[aria-label*="Find" i]') ||
          document.querySelector('input[aria-label*="Localizar" i]') ||
          [...document.querySelectorAll('input[type="text"]')].find(i => {
            const r = i.getBoundingClientRect();
            return r.width > 60 && r.top < 120;
          });
      }
    }

    // ── Passo 4: fallback — varre células visíveis no DOM acessível
    if (!searchBox) {
      return await findInVisibleCells(term);
    }

    // ── Digita o termo no campo de busca
    searchBox.focus();
    searchBox.click();
    await sleep(80);

    // Tenta execCommand (mais confiável — opera na seleção real do DOM)
    document.execCommand('selectAll', false, null);
    await sleep(30);
    const typed = document.execCommand('insertText', false, term);

    if (!typed) {
      // Fallback: native setter + disparo de evento input
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) { setter.call(searchBox, ''); setter.call(searchBox, term); }
      else searchBox.value = term;
      searchBox.dispatchEvent(new Event('input',  { bubbles: true }));
      searchBox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await sleep(500);

    // Enter → Sheets navega até o primeiro resultado encontrado
    searchBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    await sleep(900);

    // Fecha o Find bar (Escape) — a célula encontrada permanece selecionada
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await sleep(600);

    // Lê a posição atual pelo Name Box (com retry)
    let addr = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const nb = getNameBox();
      addr = nb?.value?.trim() || '';
      if (addr && /^[A-Za-z]+\d+$/.test(addr)) break;
      await sleep(300);
    }
    return addr || null;
  }

  // ── Fallback: encontra célula lendo o DOM visível do Sheets
  async function findInVisibleCells(term) {
    const lower = term.toLowerCase().trim();
    // Tenta células via role="gridcell" ou elementos com texto
    const candidates = [
      ...document.querySelectorAll('[role="gridcell"]'),
      ...document.querySelectorAll('[class*="cell-content"]'),
      ...document.querySelectorAll('[class*="waffle-cell"]'),
    ];
    for (const cell of candidates) {
      if (cell.textContent.trim().toLowerCase().includes(lower)) {
        await Cursor.click(cell);
        await sleep(400);
        const nb = getNameBox();
        const addr = nb?.value?.trim();
        if (addr) return addr;
      }
    }
    return null;
  }

  // ─── Converte endereço ex "D11" → { col:"D", row:11 }
  function parseCellAddr(addr) {
    const m = String(addr).match(/^([A-Za-z]+)(\d+)$/);
    if (!m) return null;
    return { col: m[1].toUpperCase(), row: parseInt(m[2]) };
  }

  // ─── Executar step
  async function executeStep(step) {
    HUD.show(step.description || step.action);
    try {
      switch (step.action) {

        case 'click': {
          const el = await waitFor(() => findEl(step.target), 5, 600);
          if (!el) return { success: false, error: `Elemento não encontrado: "${step.target}"` };
          await Cursor.click(el);
          return { success: true };
        }

        case 'type': {
          // Detecta campo de email (Para/To) — precisa de Tab para confirmar chip
          const isEmailDest =
            /^(para|to|destinat|recipient)/i.test(step.target || '') ||
            (step.value || '').includes('@');
          const el = await waitFor(() => findInput(step.target), 5, 600);
          if (!el) return { success: false, error: `Campo não encontrado: "${step.target}"` };
          await Cursor.typeIn(el, step.value || '', isEmailDest);
          return { success: true };
        }

        case 'find_in_sheet': {
          // Busca qualquer texto no Sheets e retorna a célula encontrada
          const term = step.value || step.target || '';
          const addr = await sheetsFind(term);
          if (!addr) return { success: false, error: `"${term}" não encontrado ou busca não abriu` };
          const parsed = parseCellAddr(addr);
          if (!parsed) return { success: false, error: `Endereço inválido: ${addr}` };
          const content = `"${term}" → célula ${addr} (linha ${parsed.row}, coluna ${parsed.col})`;
          return { success: true, content, cell: addr, row: parsed.row, col: parsed.col };
        }

        case 'fill_cell': {
          await fillCell(step.cell, step.value ?? '');
          return { success: true };
        }

        case 'goto_cell': {
          await goToCell(step.cell);
          return { success: true };
        }

        case 'read_page': {
          return { success: true, content: document.body.innerText.slice(0, 4000) };
        }

        case 'press_key': {
          const keyMap = { Enter:13, Tab:9, Escape:27, Space:32, ArrowDown:40, ArrowUp:38 };
          const key  = step.key || 'Enter';
          const code = keyMap[key] || 13;
          const target = step.target ? findEl(step.target) : document.activeElement || document.body;
          const el = target || document.body;
          ['keydown','keypress','keyup'].forEach(type =>
            el.dispatchEvent(new KeyboardEvent(type, { key, keyCode: code, which: code, bubbles: true, cancelable: true }))
          );
          await sleep(250);
          return { success: true };
        }

        case 'scroll': {
          window.scrollBy({ top: step.direction === 'up' ? -500 : 500, behavior: 'smooth' });
          await sleep(600);
          return { success: true };
        }

        default:
          return { success: false, error: `Ação desconhecida: ${step.action}` };
      }
    } catch(e) {
      return { success: false, error: e.message };
    } finally {
      Cursor.hide();
      HUD.hide();
    }
  }

  // ─── Listener
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'PING')         { sendResponse({ pong: true }); return; }
    if (msg.action === 'EXECUTE_STEP') { executeStep(msg.step).then(sendResponse); return true; }
  });
}
