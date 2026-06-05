// content_sheets.js v3.1 — Bibly
if (!window.__BIBLY_SHEETS__) {
  window.__BIBLY_SHEETS__ = true;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const BiblyCursor = {
    el: null,
    init() {
      if (this.el) return;
      if (!document.getElementById('__bibly_cursor_style__')) {
        const s = document.createElement('style');
        s.id = '__bibly_cursor_style__';
        s.textContent = `@keyframes __bibly_pulse__{0%,100%{box-shadow:0 0 16px rgba(139,92,246,.9),0 0 32px rgba(139,92,246,.4)}50%{box-shadow:0 0 24px rgba(236,72,153,1),0 0 48px rgba(236,72,153,.5)}}`;
        document.head.appendChild(s);
      }
      this.el = document.createElement('div');
      this.el.id = '__bibly_cursor__';
      Object.assign(this.el.style, {
        position:'fixed', width:'26px', height:'26px', borderRadius:'50%',
        background:'linear-gradient(135deg,#8b5cf6,#ec4899)',
        pointerEvents:'none', zIndex:'2147483647',
        transform:'translate(-50%,-50%)',
        animation:'__bibly_pulse__ 1.5s ease-in-out infinite',
        transition:'left .5s cubic-bezier(.25,.46,.45,.94),top .5s cubic-bezier(.25,.46,.45,.94)',
        opacity:'0', left:'50%', top:'50%'
      });
      document.body.appendChild(this.el);
      requestAnimationFrame(() => this.el && (this.el.style.opacity = '1'));
    },
    async moveTo(el) {
      if (!el) return;
      this.init();
      el.scrollIntoView({ block:'center', behavior:'smooth' });
      await sleep(200);
      const r = el.getBoundingClientRect();
      this.el.style.left = (r.left + r.width/2) + 'px';
      this.el.style.top  = (r.top  + r.height/2) + 'px';
      await sleep(550);
    },
    hide() {
      if (!this.el) return;
      this.el.style.opacity='0';
      setTimeout(()=>{ this.el?.remove(); this.el=null; },300);
    }
  };

  const HUD = {
    el: null,
    show(msg) {
      if (!this.el) {
        this.el = document.createElement('div');
        this.el.id = '__bibly_hud__';
        Object.assign(this.el.style, {
          position:'fixed', bottom:'60px', right:'24px', zIndex:'2147483647',
          background:'linear-gradient(135deg,#8b5cf6,#ec4899)',
          color:'white', fontSize:'12px', fontWeight:'700',
          fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',
          padding:'9px 16px', borderRadius:'12px',
          boxShadow:'0 4px 20px rgba(139,92,246,.6)',
          pointerEvents:'none', opacity:'0', transition:'opacity .3s'
        });
        document.body.appendChild(this.el);
        requestAnimationFrame(() => this.el && (this.el.style.opacity = '1'));
      }
      this.el.textContent = '✦ Bibly — ' + msg;
    },
    hide() {
      if (this.el) { this.el.style.opacity='0'; setTimeout(()=>{ this.el?.remove(); this.el=null; },350); }
    }
  };

  function getNameBox() {
    return document.querySelector('.waffle-name-box input') ||
           document.querySelector('[aria-label="Name Box"]') ||
           document.querySelector('#t-name-box') ||
           document.querySelector('[class*="cell-address"] input');
  }

  async function goToCell(address) {
    const nb = getNameBox();
    if (!nb) throw new Error('Name Box não encontrado');
    if (BiblyCursor.el) await BiblyCursor.moveTo(nb);
    nb.click(); nb.focus(); nb.select();
    nb.value = address;
    nb.dispatchEvent(new Event('input', { bubbles:true }));
    nb.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true}));
    nb.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',bubbles:true}));
    await sleep(250);
  }

  function getCurrentCell() { return getNameBox()?.value || ''; }

  function getCellValue() {
    const SELS = ['.formula-bar-content','#t-formula-bar-input',
      '[class*="formula-bar"] textarea','[class*="formula-bar"] input',
      '[class*="formulaBarInput"]','.docs-formula-bar-input'];
    for (const sel of SELS) {
      const el = document.querySelector(sel);
      const v = el?.value ?? el?.textContent;
      if (v !== undefined) return v;
    }
    return '';
  }

  // Copia texto para a área de transferência REAL e cola com Ctrl+V
  // (o Google Sheets rejeita ClipboardEvent sintético, mas aceita Ctrl+V normal)
  async function pasteIntoCell(text) {
    const str = String(text);
    // Copia para clipboard via textarea trick
    const ta = document.createElement('textarea');
    ta.style.cssText = 'position:fixed;opacity:0;left:-9999px;top:0;';
    ta.value = str;
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    ta.remove();
    await sleep(100);
    // Cola com Ctrl+V
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'v',ctrlKey:true,bubbles:true,cancelable:true}));
    await sleep(300);
    // Tab para confirmar e avançar
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',keyCode:9,bubbles:true}));
    await sleep(200);
  }

  // Mantido para compatibilidade — usa pasteIntoCell
  async function writeCellValue(text) {
    await pasteIntoCell(text);
  }

  async function findLeadRow(searchTerm) {
    HUD.show('Buscando na planilha...');
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true,cancelable:true}));
    await sleep(600);

    const FIND_SELS = [
      '.docs-find-bar-input input','[class*="search-input"] input',
      '[class*="find-input"] input','input[placeholder*="Pesquisar" i]',
      'input[placeholder*="Search" i]','[class*="FindBar"] input'
    ];
    let findInput = null;
    for (const sel of FIND_SELS) { findInput = document.querySelector(sel); if (findInput) break; }
    if (!findInput) {
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      return { found:false };
    }

    findInput.value = '';
    const dt = new DataTransfer(); dt.setData('text/plain', searchTerm);
    findInput.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true}));
    findInput.dispatchEvent(new Event('input',{bubbles:true}));
    await sleep(400);
    findInput.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    await sleep(400);
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await sleep(300);

    const addr = getCurrentCell();
    if (!addr || addr.toUpperCase() === 'A1') return { found:false };
    const rowMatch = addr.match(/\d+/);
    if (!rowMatch) return { found:false };
    return { found:true, row:parseInt(rowMatch[0]), addr };
  }

  async function upsertLead(lead, etapa, checkOnly, config) {
    BiblyCursor.init();
    const phoneCol = (config?.phoneCol||'D').toUpperCase();
    const etapaCol = (config?.etapaCol||'F').toUpperCase();
    const nameCol  = (config?.nameCol ||'C').toUpperCase();

    const cleanPhone = (lead.phone||'').replace(/\D/g,'').slice(-9);
    const searchTerm = cleanPhone || lead.name?.split(' ')[0] || '';
    if (!searchTerm) return { success:false, error:'Sem dados para buscar' };

    const found = await findLeadRow(searchTerm);

    if (found.found) {
      await goToCell(`${etapaCol}${found.row}`);
      await sleep(400);
      const currentValue = getCellValue().trim();

      if (currentValue) {
        BiblyCursor.hide(); HUD.hide();
        return { success:true, alreadyDone:true, currentValue };
      }
      if (checkOnly) { BiblyCursor.hide(); HUD.hide(); return { success:true, alreadyDone:false }; }

      HUD.show(`Escrevendo "${etapa}"...`);
      await writeCellValue(etapa);
      BiblyCursor.hide(); HUD.hide();
      return { success:true, action:`Linha ${found.row} → ${etapa}`, row:found.row };
    } else {
      if (checkOnly) { BiblyCursor.hide(); HUD.hide(); return { success:true, alreadyDone:false }; }

      HUD.show('Adicionando novo lead...');
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'End',ctrlKey:true,bubbles:true}));
      await sleep(400);
      const lastRow = parseInt((getCurrentCell()||'').match(/\d+/)?.[0]||'100');
      const newRow = lastRow + 1;

      await goToCell(`${nameCol}${newRow}`); await sleep(250); await writeCellValue(lead.name||'');
      await goToCell(`${phoneCol}${newRow}`); await sleep(250); await writeCellValue(cleanPhone);
      await goToCell(`${etapaCol}${newRow}`); await sleep(250); await writeCellValue(etapa);

      BiblyCursor.hide(); HUD.hide();
      return { success:true, action:`Novo lead linha ${newRow}: ${lead.name} | ${etapa}`, newRow };
    }
  }

  // ─── Adicionar nova linha (Pesquisa): cola tudo de uma vez com tab-separated
  async function addPesquisaRow(lead, status) {
    BiblyCursor.init();

    try {
      const today = new Date().toLocaleDateString('pt-BR');
      const cleanPhone = (lead.phone||'').replace(/\D/g,'');

      // Monta string com tab entre colunas (A→F) — cola em 6 células de uma vez
      const rowData = [
        'Gabrielly Oliveira',
        lead.agente || '',
        lead.name   || '',
        cleanPhone,
        today,
        status,
      ].join('\t');

      // 1. Copia todos os dados para o clipboard real
      const ta = document.createElement('textarea');
      ta.style.cssText = 'position:fixed;opacity:0;left:-9999px;top:0;';
      ta.value = rowData;
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      document.execCommand('copy');
      ta.remove();
      await sleep(150);

      HUD.show('Navegando para A1...');
      // 2. Ir para A1 para ter referência
      await goToCell('A1');
      await sleep(400);

      // 3. Ctrl+Down para chegar na última linha preenchida da coluna A
      HUD.show('Localizando última linha...');
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',ctrlKey:true,bubbles:true}));
      await sleep(600);

      const lastCell = getCurrentCell();
      const lastRow = parseInt((lastCell||'A1').match(/\d+/)?.[0]||'1');
      const newRow = lastRow + 1;

      HUD.show(`Colando na linha ${newRow}...`);

      // 4. Navegar para A{newRow}
      await goToCell(`A${newRow}`);
      await sleep(400);

      // 5. Ctrl+V — cola os 6 valores separados por tab nas 6 colunas de uma vez
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'v',ctrlKey:true,bubbles:true,cancelable:true}));
      await sleep(800);

      // 6. Enter para confirmar
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true}));
      await sleep(300);

      BiblyCursor.hide(); HUD.hide();
      return { success:true, action:`Linha ${newRow}: ${lead.name} | ${status}`, newRow };

    } catch(e) {
      BiblyCursor.hide(); HUD.hide();
      return { success:false, error:e.message };
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'PING') { sendResponse({ pong:true }); return; }
    if (msg.action === 'UPSERT_LEAD') {
      upsertLead(msg.lead, msg.etapa, msg.checkOnly, msg.config).then(sendResponse); return true;
    }
    if (msg.action === 'ADD_PESQUISA_ROW') {
      addPesquisaRow(msg.lead, msg.status).then(sendResponse); return true;
    }
  });
}
