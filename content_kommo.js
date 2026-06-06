// content_kommo.js v3.3 — Bibly
if (!window.__BIBLY_KOMMO__) {
  window.__BIBLY_KOMMO__ = true;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function waitForAny(selectors, timeout=5000) {
    return new Promise((resolve,reject) => {
      const check = () => { for(const s of selectors){const e=document.querySelector(s);if(e&&e.offsetParent!==null)return e;}return null; };
      const found=check(); if(found)return resolve(found);
      const obs=new MutationObserver(()=>{const e=check();if(e){obs.disconnect();resolve(e);}});
      obs.observe(document.body,{childList:true,subtree:true});
      setTimeout(()=>{obs.disconnect();reject(new Error(`[${selectors[0]}] timeout`));},timeout);
    });
  }

  const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="32" viewBox="0 0 28 32"><defs><linearGradient id="__bg__" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#ec4899"/></linearGradient></defs><path d="M2,2 L2,22 L7,17 L11,26 L15,24 L11,15 L18,15 Z" fill="url(#__bg__)" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

  const BiblyCursor = {
    el: null,
    init() {
      if (this.el) return;
      if (!document.getElementById('__bcs__')) {
        const s=document.createElement('style'); s.id='__bcs__';
        s.textContent=`@keyframes __bcp__{0%,100%{filter:drop-shadow(0 0 5px rgba(139,92,246,.9)) drop-shadow(0 0 10px rgba(139,92,246,.4))}50%{filter:drop-shadow(0 0 8px rgba(236,72,153,1)) drop-shadow(0 0 16px rgba(236,72,153,.5))}} #__bibly_cursor__{animation:__bcp__ 1.5s ease-in-out infinite;transition:left .45s cubic-bezier(.25,.46,.45,.94),top .45s cubic-bezier(.25,.46,.45,.94),opacity .3s}`;
        document.head.appendChild(s);
      }
      this.el=document.createElement('div'); this.el.id='__bibly_cursor__';
      this.el.style.cssText=`position:fixed;width:28px;height:32px;pointer-events:none;z-index:2147483647;left:50%;top:50%;opacity:0;`;
      this.el.innerHTML=CURSOR_SVG; document.body.appendChild(this.el);
      requestAnimationFrame(()=>this.el&&(this.el.style.opacity='1'));
    },
    async moveTo(el) {
      if(!el)return; this.init();
      el.scrollIntoView({block:'center',behavior:'smooth'}); await sleep(250);
      const r=el.getBoundingClientRect();
      this.el.style.left=(r.left+r.width/2)+'px'; this.el.style.top=(r.top+r.height/2)+'px';
      await sleep(500);
    },
    async click(el) {
      if(!el)return; await this.moveTo(el);
      this.el.style.filter='brightness(2)'; await sleep(70);
      this.el.style.filter=''; el.click(); await sleep(150);
    },
    async typeIn(el, text) {
      await this.moveTo(el); el.focus();
      document.execCommand('selectAll',false,null); document.execCommand('delete',false,null);
      const dt=new DataTransfer(); dt.setData('text/plain',text);
      el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
      await sleep(100);
      if(!(el.textContent||el.value||'').trim()) document.execCommand('insertText',false,text);
      if(el.tagName==='INPUT'&&!(el.value||'').trim()){
        const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
        if(setter)setter.call(el,text);
      }
      el.dispatchEvent(new Event('input',{bubbles:true})); await sleep(150);
    },
    hide() { if(!this.el)return; this.el.style.opacity='0'; setTimeout(()=>{this.el?.remove();this.el=null;},300); }
  };

  const HUD = {
    el: null,
    show(msg) {
      if(!this.el){
        this.el=document.createElement('div'); this.el.id='__bibly_hud__';
        Object.assign(this.el.style,{position:'fixed',bottom:'60px',right:'24px',zIndex:'2147483647',background:'linear-gradient(135deg,#8b5cf6,#ec4899)',color:'white',fontSize:'12px',fontWeight:'700',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',padding:'9px 16px',borderRadius:'12px',boxShadow:'0 4px 20px rgba(139,92,246,.6)',pointerEvents:'none',opacity:'0',transition:'opacity .3s'});
        document.body.appendChild(this.el);
        requestAnimationFrame(()=>this.el&&(this.el.style.opacity='1'));
      }
      this.el.textContent='✦ Bibly — '+msg;
    },
    hide(){if(this.el){this.el.style.opacity='0';setTimeout(()=>{this.el?.remove();this.el=null;},350);}}
  };

  // ─── Buscar lead por telefone e encontrar o da Gabrielly
  async function searchAndOpenGabriellyLead(phone) {
    const clean = phone.replace(/\D/g,'');

    // Achar a barra de busca (global search do Kommo)
    const SEARCH_SELS = [
      'input[placeholder*="Buscar"]','input[placeholder*="buscar"]','input[placeholder*="Search"]',
      '[class*="global-search"] input','[class*="GlobalSearch"] input',
      '[class*="search-input"] input','[class*="SearchInput"] input',
      'input[type="search"]'
    ];

    HUD.show(`Buscando ${phone}...`);
    let searchInput=null;
    // Tenta clicar no ícone de busca para abrir o campo
    const searchIcon = document.querySelector('[class*="search-icon"],[class*="SearchIcon"],[data-icon="search"]');
    if (searchIcon) { await BiblyCursor.click(searchIcon); await sleep(500); }

    for (const sel of SEARCH_SELS) {
      searchInput=document.querySelector(sel);
      if(searchInput&&searchInput.offsetParent)break;
    }
    if(!searchInput) return {success:false,error:'Campo de busca não encontrado no Kommo'};

    await BiblyCursor.typeIn(searchInput, clean);
    await sleep(2000);

    // Resultados de LEADS — pegar todos os itens
    const RESULT_SELS = [
      '[class*="search-result"] [class*="lead"]',
      '[class*="SearchResult"] li',
      '[class*="results"] [class*="item"]',
      '[class*="leads"] [class*="item"]',
      '[class*="lead-item"]','[class*="result-item"]',
      '[class*="suggestion"]'
    ];

    let resultItems = [];
    for (const sel of RESULT_SELS) {
      resultItems = [...document.querySelectorAll(sel)].filter(el=>el.offsetParent);
      if(resultItems.length)break;
    }

    if(!resultItems.length) return {success:false,error:'Nenhum lead encontrado para este número'};

    // Clicar em cada resultado e verificar se é da Gabrielly
    for (const item of resultItems) {
      HUD.show('Verificando responsável...');
      await BiblyCursor.click(item);
      await sleep(1500);

      // Verificar se "Gabrielly Oliveira" aparece como responsável no painel
      const panelText = document.body.textContent;
      if (/Gabrielly\s+Oliveira/i.test(panelText)) {
        HUD.show('Lead da Gabrielly encontrado ✓');
        await sleep(500);
        return {success:true};
      }
    }

    // Fallback: usar o último resultado clicado (pelo menos encontramos algo)
    return {success:true, warning:'Não confirmou responsável Gabrielly, usando último resultado'};
  }

  // ─── Clicar no telefone comercial (abre lista de números)
  async function clickTelComercialAndSelect(phone) {
    HUD.show('Clicando no telefone comercial...');
    const clean = phone.replace(/\D/g,'');

    // Buscar link de telefone no painel de detalhes
    // No Kommo: "Tel. comercial + +55 75 99184-3508" aparece como link
    const phoneLinks = [...document.querySelectorAll('a,span,[class*="phone"],[class*="tel"]')]
      .filter(el => {
        const t = (el.textContent||'').replace(/\D/g,'');
        return t.length>=8 && (t.includes(clean)||t.includes(clean.slice(-8))) && el.offsetParent;
      });

    if(!phoneLinks.length) return {success:false, error:'Número de telefone não encontrado no painel do lead'};

    await BiblyCursor.click(phoneLinks[0]);
    await sleep(800);

    // Verifica se abriu uma lista de números para selecionar
    const numList = [...document.querySelectorAll('li,[role="option"],[class*="phone-option"],[class*="number-item"]')]
      .filter(el=>el.offsetParent&&el.textContent.replace(/\D/g,'').length>=8);

    if(numList.length>0) {
      HUD.show('Selecionando número...');
      // Selecionar o número que bate com o phone do lead
      const target = numList.find(el=>el.textContent.replace(/\D/g,'').includes(clean.slice(-8))) || numList[0];
      await BiblyCursor.click(target);
      await sleep(800);
    }

    return {success:true};
  }

  // ─── Selecionar "Gabrielly Oliveira" no modal de canal
  async function selectGabrielly() {
    await sleep(600);
    const all = [...document.querySelectorAll('button,li,div,span,a,label,[role="option"],[role="menuitem"]')]
      .filter(el=>el.children.length<=2&&el.offsetParent);
    let target = all.find(el=>el.textContent.trim().includes('Gabrielly Oliveira')) ||
                 all.find(el=>el.textContent.trim().includes('Gabrielly'));
    if(target){ HUD.show('Selecionando Gabrielly Oliveira...'); await BiblyCursor.click(target); await sleep(1500); return {success:true}; }
    try {
      const res=document.evaluate("//*[contains(text(),'Gabrielly')]",document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null);
      const el=res.singleNodeValue;
      if(el){ await BiblyCursor.click(el); await sleep(1500); return {success:true}; }
    }catch(_){}
    return {success:false, error:'"Gabrielly Oliveira" não encontrado no modal'};
  }

  // ─── Digitar trigger e selecionar template
  async function typeTemplateAndSelect(trigger, followNumber) {
    HUD.show(`Digitando ${trigger}...`);
    const MSELS=['[contenteditable="true"]','[class*="chat-input"] [contenteditable]','[class*="message-input"] [contenteditable]','textarea[class*="message"]'];
    let input;
    try { input=await waitForAny(MSELS,4000); } catch(e){return {success:false,error:'Campo de mensagem não encontrado'};}

    await BiblyCursor.typeIn(input,trigger);
    await sleep(1500);

    // Selecionar template pelo follow number
    HUD.show(`Selecionando Follow ${followNumber}...`);
    const TSELS=['[class*="macros-dropdown"] li','[class*="macros-item"]','[class*="template-list"] li','[class*="slash-command"] li','[class*="autocomplete-item"]','[role="option"]','[role="listbox"] li'];
    let items=[];
    for(const s of TSELS){items=[...document.querySelectorAll(s)];if(items.length)break;}
    if(!items.length){await sleep(800);for(const s of TSELS){items=[...document.querySelectorAll(s)];if(items.length)break;}}
    if(!items.length)return {success:false,error:'Picker de templates não apareceu'};

    const fn=String(followNumber);
    const target=items.find(el=>new RegExp(`[Ff]ollow\\s*[-._]?\\s*${fn}|[Ff][Uu]${fn}|SP\\s*${fn}|\\b${fn}\\b`,'i').test(el.textContent))||items[0];
    await BiblyCursor.click(target); await sleep(800);
    return {success:true,template:target.textContent.trim().slice(0,60),input};
  }

  // ─── Enviar mensagem
  async function sendMessage(msgInput) {
    HUD.show('Enviando...');
    const SELS=['[class*="chat-footer"] button[type="submit"]','button[class*="send"]','[class*="message-send"]','button[data-action="send"]','[title*="nvi" i]','[aria-label*="nvi" i]'];
    for(const s of SELS){const b=document.querySelector(s);if(b&&b.offsetParent){await BiblyCursor.click(b);await sleep(600);return {success:true};}}
    if(msgInput){msgInput.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));await sleep(300);return {success:true};}
    return {success:false,error:'Botão enviar não encontrado'};
  }

  // ─── Verificar se houve resposta (para Pesquisa)
  async function readConversationStatus() {
    await sleep(500);
    const allMsgs = document.querySelectorAll('[class*="feed__item"],[class*="chat-message"],[class*="msg-item"],[class*="bubble"]');
    if(!allMsgs.length) return {success:true,status:'Sem mensagens na conversa',hasResponse:false};

    const last=allMsgs[allMsgs.length-1];
    const cls=(last.className||'')+' '+(last.getAttribute('data-type')||'');
    const isOut=/out\b|sent|outgoing|me\b|mine/i.test(cls);
    const isIn=/\bin\b|received|incoming|client|lead/i.test(cls);
    let hasResponse=false,status='Aguardando resposta';
    if(isIn&&!isOut){hasResponse=true;status='Lead respondeu';}
    else if(!isOut){
      const r=last.getBoundingClientRect();
      hasResponse=(r.left+r.width/2)<(window.innerWidth/2);
      status=hasResponse?'Lead respondeu':'Aguardando resposta';
    }
    return {success:true,status,hasResponse};
  }

  // ─── SOCIAL POINTS: buscar lead → telefone → canal → template → enviar
  async function sendWhatsApp(phone, templateTrigger, followNumber) {
    BiblyCursor.init();
    try {
      const sr=await searchAndOpenGabriellyLead(phone);
      if(!sr.success){BiblyCursor.hide();HUD.hide();return sr;}

      const tr=await clickTelComercialAndSelect(phone);
      if(!tr.success){BiblyCursor.hide();HUD.hide();return tr;}

      await selectGabrielly(); // pode não ter modal, tudo bem
      await sleep(1000);

      const tplR=await typeTemplateAndSelect(templateTrigger,followNumber);
      if(!tplR.success){BiblyCursor.hide();HUD.hide();return tplR;}

      const sendR=await sendMessage(tplR.input);

      BiblyCursor.hide();HUD.hide();
      return {success:sendR.success,template:tplR.template||'',error:sendR.error};
    }catch(e){BiblyCursor.hide();HUD.hide();return {success:false,error:e.message};}
  }

  // ─── PESQUISA: buscar lead → verificar conversa
  async function checkResponse(phone, name) {
    BiblyCursor.init();
    try {
      const sr=await searchAndOpenGabriellyLead(phone||(name||''));
      if(!sr.success){BiblyCursor.hide();HUD.hide();return sr;}

      const convStatus=await readConversationStatus();
      BiblyCursor.hide();HUD.hide();
      return convStatus;
    }catch(e){BiblyCursor.hide();HUD.hide();return {success:false,status:e.message,hasResponse:false};}
  }

  chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
    if(msg.action==='PING'){sendResponse({pong:true});return;}
    if(msg.action==='SEND_WHATSAPP'){sendWhatsApp(msg.phone,msg.templateTrigger||'/[SDR][PAR]',msg.followNumber||1).then(sendResponse);return true;}
    if(msg.action==='CHECK_RESPONSE'){checkResponse(msg.phone,msg.name).then(sendResponse);return true;}
  });
}
