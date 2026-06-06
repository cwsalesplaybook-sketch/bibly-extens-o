// content_meetime.js v3.3 — Bibly
if (!window.__BIBLY_MEETIME__) {
  window.__BIBLY_MEETIME__ = true;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="32" viewBox="0 0 28 32"><defs><linearGradient id="__bg__" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#ec4899"/></linearGradient></defs><path d="M2,2 L2,22 L7,17 L11,26 L15,24 L11,15 L18,15 Z" fill="url(#__bg__)" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

  const BiblyCursor = {
    el: null,
    init() {
      if (this.el) return;
      if (!document.getElementById('__bcs__')) {
        const s = document.createElement('style');
        s.id = '__bcs__';
        s.textContent = `@keyframes __bcp__{0%,100%{filter:drop-shadow(0 0 5px rgba(139,92,246,.9)) drop-shadow(0 0 10px rgba(139,92,246,.4))}50%{filter:drop-shadow(0 0 8px rgba(236,72,153,1)) drop-shadow(0 0 16px rgba(236,72,153,.5))}} #__bibly_cursor__{animation:__bcp__ 1.5s ease-in-out infinite;transition:left .45s cubic-bezier(.25,.46,.45,.94),top .45s cubic-bezier(.25,.46,.45,.94),opacity .3s}`;
        document.head.appendChild(s);
      }
      this.el = document.createElement('div');
      this.el.id = '__bibly_cursor__';
      this.el.style.cssText = `position:fixed;width:28px;height:32px;pointer-events:none;z-index:2147483647;left:50%;top:50%;opacity:0;`;
      this.el.innerHTML = CURSOR_SVG;
      document.body.appendChild(this.el);
      requestAnimationFrame(() => this.el && (this.el.style.opacity = '1'));
    },
    async moveTo(el) {
      if (!el) return; this.init();
      el.scrollIntoView({ block:'center', behavior:'smooth' }); await sleep(250);
      const r = el.getBoundingClientRect();
      this.el.style.left = (r.left+r.width/2)+'px'; this.el.style.top = (r.top+r.height/2)+'px';
      await sleep(500);
    },
    async click(el) {
      if (!el) return; await this.moveTo(el);
      this.el.style.filter='brightness(2)'; await sleep(70);
      this.el.style.filter=''; el.click(); await sleep(150);
    },
    hide() {
      if (!this.el) return; this.el.style.opacity='0';
      setTimeout(()=>{ this.el?.remove(); this.el=null; },300);
    }
  };

  const HUD = {
    el: null,
    show(msg) {
      if (!this.el) {
        this.el = document.createElement('div'); this.el.id='__bibly_hud__';
        Object.assign(this.el.style, {
          position:'fixed',bottom:'60px',right:'24px',zIndex:'2147483647',
          background:'linear-gradient(135deg,#8b5cf6,#ec4899)',
          color:'white',fontSize:'12px',fontWeight:'700',
          fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',
          padding:'9px 16px',borderRadius:'12px',
          boxShadow:'0 4px 20px rgba(139,92,246,.6)',
          pointerEvents:'none',opacity:'0',transition:'opacity .3s'
        });
        document.body.appendChild(this.el);
        requestAnimationFrame(()=>this.el&&(this.el.style.opacity='1'));
      }
      this.el.textContent = '✦ Bibly — ' + msg;
    },
    hide() { if(this.el){this.el.style.opacity='0';setTimeout(()=>{this.el?.remove();this.el=null;},350);} }
  };

  function byText(texts, selector='a,button,span,li,[role="menuitem"],[class*="nav"]') {
    const arr = Array.isArray(texts) ? texts : [texts];
    const els = [...document.querySelectorAll(selector)];
    for (const text of arr) {
      const found = els.find(el => {
        const t = el.textContent.trim();
        return (t===text||t.startsWith(text)||(text.length>3&&t.includes(text)))&&el.offsetParent;
      });
      if (found) return found;
    }
    return null;
  }

  async function navigateToExecution() {
    const onPage = document.body.textContent.includes('ATIVIDADES') ||
                   document.body.textContent.includes('Execução do cadência') ||
                   document.body.textContent.includes('Execução de cadência');
    if (onPage) return;

    HUD.show('Abrindo Prospecção...');
    const prospBtn = byText(['Prospecção','Prospeccao'],'a,button,span,[class*="nav"],[class*="menu"],[class*="header"]');
    if (!prospBtn) throw new Error('Menu "Prospecção" não encontrado');
    await BiblyCursor.click(prospBtn); await sleep(700);

    HUD.show('Abrindo Execução...');
    const execBtn = byText(['Execução de cadência','Execução do cadência','Execução'],'a,li,button,[role="menuitem"],[class*="dropdown"]');
    if (!execBtn) throw new Error('"Execução" não encontrado no dropdown');
    await BiblyCursor.click(execBtn); await sleep(2500);
  }

  async function applyAtividadeFilter(activityType) {
    HUD.show('Abrindo filtro Atividade...');
    const filterBtn = [...document.querySelectorAll('button,[class*="filter"],[class*="dropdown-btn"]')]
      .find(el => /[Aa]tividade/.test(el.textContent) && el.offsetParent);
    if (!filterBtn) throw new Error('Botão "Atividade" não encontrado');
    await BiblyCursor.click(filterBtn); await sleep(1000); // aguarda dropdown abrir

    const isPesquisa = activityType === 'pesquisa';
    // Texto exato conforme o dropdown do Meetime
    const targetText = isPesquisa ? 'Pesquisa' : 'Social Point';

    HUD.show(`Selecionando ${targetText}...`);

    // Estratégia 1: procurar label ou span que contenha exatamente o texto-alvo
    // e clicar no checkbox associado (input[type="checkbox"] irmão ou filho)
    let checkbox = null;

    // Busca por label cujo texto seja targetText
    const labels = [...document.querySelectorAll('label')].filter(el => {
      const t = el.textContent.trim();
      return (t === targetText || t.startsWith(targetText)) && el.offsetParent;
    });
    if (labels.length) {
      const lbl = labels[0];
      // Checkbox pode ser filho do label ou referenciado pelo atributo "for"
      checkbox = lbl.querySelector('input[type="checkbox"]');
      if (!checkbox && lbl.htmlFor) checkbox = document.getElementById(lbl.htmlFor);
      if (!checkbox) {
        // Clicar no label já marca o checkbox
        if (!lbl.querySelector('input[type="checkbox"]')) {
          await BiblyCursor.click(lbl); await sleep(2500);
          return; // filtro aplicado — sem botão Aplicar
        }
      }
    }

    // Estratégia 2: procurar input[type="checkbox"] cujo texto vizinho bate com targetText
    if (!checkbox) {
      const allCheckboxes = [...document.querySelectorAll('input[type="checkbox"]')]
        .filter(el => el.offsetParent);
      for (const cb of allCheckboxes) {
        const container = cb.closest('label,li,div,[class*="item"],[class*="option"]');
        if (container && container.textContent.trim().includes(targetText)) {
          checkbox = cb; break;
        }
      }
    }

    // Estratégia 3: qualquer elemento visível (li, span, div) com o texto exato
    if (!checkbox) {
      const candidates = [...document.querySelectorAll('li,span,div,[role="option"],[role="menuitem"]')]
        .filter(el => el.offsetParent && el.textContent.trim() === targetText && el.children.length <= 3);
      if (candidates.length) {
        await BiblyCursor.click(candidates[0]); await sleep(2500);
        return;
      }
      throw new Error(`Checkbox/opção "${targetText}" não encontrado no dropdown`);
    }

    // Marcar o checkbox se ainda não estiver marcado
    if (!checkbox.checked) {
      await BiblyCursor.click(checkbox);
    } else {
      HUD.show(`${targetText} já selecionado`);
    }

    // Meetime não tem botão "Aplicar" — filtra automaticamente
    await sleep(2500);
  }

  // ─── Aguardar o painel de execução aparecer
  async function waitForPanel(maxMs=5000) {
    const panelSelectors = [
      '[role="tablist"]','[class*="execution-panel"]','[class*="lead-panel"]',
      '[class*="side-panel"]','[class*="activity-detail"]'
    ];
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      for (const sel of panelSelectors) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent) return el;
      }
      await sleep(300);
    }
    return null;
  }

  // ─── Clicar na 1ª aba (pessoa/contato) do painel
  async function clickPersonTab() {
    HUD.show('Abrindo dados do contato...');
    // Aguarda o painel aparecer antes de tentar clicar nas abas
    await waitForPanel(4000);
    await sleep(400);

    let clicked = false;
    // Itera todos os conjuntos de abas visíveis, tentando a 1ª de cada
    const tabSelectors = [
      '[role="tablist"] [role="tab"]:first-child',
      '[role="tablist"] button:first-child',
      '[class*="tabs"] button:first-child',
      '[class*="tab-list"] button:first-child'
    ];
    for (const sel of tabSelectors) {
      const tab = document.querySelector(sel);
      if (tab && tab.offsetParent) { await BiblyCursor.click(tab); clicked = true; break; }
    }
    // Fallback: qualquer tab visível
    if (!clicked) {
      const anyTab = [...document.querySelectorAll('[role="tab"]')].find(t=>t.offsetParent);
      if (anyTab) { await BiblyCursor.click(anyTab); clicked = true; }
    }
    if (clicked) {
      await sleep(2000);
      // Se a aba clicada não trouxe telefone, tenta a segunda aba
      const hasPhone = [...document.querySelectorAll('input[type="tel"],input[placeholder*="Telefone" i]')]
        .some(el => (el.value||'').replace(/\D/g,'').length >= 8);
      if (!hasPhone) {
        const allTabs = [...document.querySelectorAll('[role="tab"],button[class*="tab"]')].filter(t=>t.offsetParent);
        if (allTabs.length > 1) {
          await BiblyCursor.click(allTabs[1]); await sleep(1500);
        }
      }
    }
  }

  // ─── Ler dados completos do painel após execução
  async function readLeadFromPanel(fallbackName='') {
    const body = document.body.innerText;

    // Nome
    let name = fallbackName;
    if (!name) {
      for (const sel of ['input[placeholder*="nome" i]','input[name*="name"]','[class*="lead-name"]','[class*="contact-name"]','[class*="execution"] h2','h2','h1']) {
        const el = document.querySelector(sel);
        const t = (el?.value||el?.textContent||'').trim();
        if (t&&t.length>1&&t.length<80&&el?.offsetParent) { name=t; break; }
      }
    }

    // Telefone — da seção TELEFONE(S)
    let phone = '';
    for (const sel of ['input[type="tel"]','input[placeholder*="Telefone" i]','[class*="phone"] input','[class*="telefone"] input','input[name*="phone"]','input[name*="telefone"]']) {
      const el = document.querySelector(sel);
      const v = (el?.value||'').trim();
      if (v.replace(/\D/g,'').length>=8) { phone=v; break; }
    }
    if (!phone) {
      // Buscar label "Telefone" e pegar input adjacente
      const lbl = [...document.querySelectorAll('label,strong,[class*="label"]')].find(el=>/^[*\s]*[Tt]elefone/.test(el.textContent.trim()));
      if (lbl) {
        const container = lbl.closest('tr,[class*="field"],[class*="row"],[class*="item"]');
        const val = container?.querySelector('input,td,[class*="value"]');
        if (val) phone=(val.value||val.textContent||'').trim();
      }
    }
    if (!phone) { const m=body.match(/\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/); if(m)phone=m[0]; }

    // Tipo
    let activityType = 'social_points', followNumber = 1;
    if (/\[TASK\]|pesquisa|comunicar ao time/i.test(body)) activityType='pesquisa';
    const pM = body.match(/[Pp]asso\s+(\d+)/); if(pM) followNumber=parseInt(pM[1]);

    // Agente de Parcerias — suporta "Agente de Parcerias: Nome" e "Agente de Parcerias\nNome"
    let agente = '';
    const agenteM = body.match(/[Aa]gente\s+de\s+[Pp]arcerias\s*[:\-]?\s*([^\n:]+)/);
    if (agenteM) agente = agenteM[1].trim().replace(/^[:\-\s]+/, '');

    // Parceiro
    let parceiro = '';
    const parcM = body.match(/\[ON\]\s*[Pp]arceiro[:\s\n]+([^\n]+)/);
    if (parcM) parceiro=parcM[1].trim();

    return { name, phone, activityType, followNumber, agente, parceiro,
      templateKey: activityType==='pesquisa'?'Pesquisa':`Follow ${followNumber}` };
  }

  async function clickExecutarAndReadLead() {
    const execBtns = [...document.querySelectorAll('button')]
      .filter(b=>b.textContent.trim()==='Executar'&&b.offsetParent);
    if (!execBtns.length) throw new Error('Nenhum "Executar" encontrado com esse filtro');

    // Nome da linha antes de clicar
    const firstRow = execBtns[0].closest('tr,[class*="activity-item"],[class*="row"],li');
    let preName = '';
    if (firstRow) preName = (firstRow.querySelector('[class*="lead"],[class*="contact"],td:last-of-type')?.textContent||'').trim();

    HUD.show('Clicando em Executar...');
    await BiblyCursor.click(execBtns[0]); await sleep(3000);

    // Clicar na aba pessoa para ver telefone e dados
    await clickPersonTab();

    return await readLeadFromPanel(preName);
  }

  async function doneActivity() {
    BiblyCursor.init(); HUD.show('Marcando como feito...');
    try {
      const btn = byText(['Marcar como feita','Marcar como feito','Concluir','Feito','Done'],'button,[role="button"]');
      if (btn) { await BiblyCursor.click(btn); BiblyCursor.hide(); HUD.hide(); return {success:true}; }
      BiblyCursor.hide(); HUD.hide();
      return {success:false,error:'Botão de concluir não encontrado'};
    } catch(e) { BiblyCursor.hide(); HUD.hide(); return {success:false,error:e.message}; }
  }

  async function filterAndExecute(activityType) {
    BiblyCursor.init();
    try {
      await navigateToExecution();
      await applyAtividadeFilter(activityType);
      const lead = await clickExecutarAndReadLead();
      BiblyCursor.hide(); HUD.hide();
      return {success:true, lead};
    } catch(e) {
      BiblyCursor.hide(); HUD.hide();
      return {success:false, error:e.message};
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action==='PING') { sendResponse({pong:true}); return; }
    if (msg.action==='FILTER_AND_EXECUTE') { filterAndExecute(msg.activityType).then(sendResponse); return true; }
    if (msg.action==='DONE_ACTIVITY') { doneActivity().then(sendResponse); return true; }
  });
}
