// content_executor.js v4.0 — Bibi
if (!window.__BIBI_EXEC__) {
  window.__BIBI_EXEC__ = true;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ─── Cursor roxo animado
  const Cursor = {
    el: null,
    init() {
      if (this.el) return;
      if (!document.getElementById('__bibi_style__')) {
        const s = document.createElement('style');
        s.id = '__bibi_style__';
        s.textContent = `
          @keyframes __bibi_pulse__ {
            0%,100% { filter: drop-shadow(0 0 6px rgba(139,92,246,.9)) drop-shadow(0 0 12px rgba(139,92,246,.4)); }
            50%      { filter: drop-shadow(0 0 9px rgba(236,72,153,1))  drop-shadow(0 0 18px rgba(236,72,153,.5)); }
          }
          #__bibi_cursor__ {
            animation: __bibi_pulse__ 1.5s ease-in-out infinite;
            transition: left .42s cubic-bezier(.25,.46,.45,.94), top .42s cubic-bezier(.25,.46,.45,.94), opacity .3s;
          }
        `;
        document.head.appendChild(s);
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="32" viewBox="0 0 28 32">
        <defs><linearGradient id="__bibi_g__" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#ec4899"/>
        </linearGradient></defs>
        <path d="M2,2 L2,22 L7,17 L11,26 L15,24 L11,15 L18,15 Z"
              fill="url(#__bibi_g__)" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>`;
      this.el = document.createElement('div');
      this.el.id = '__bibi_cursor__';
      this.el.style.cssText = 'position:fixed;width:28px;height:32px;pointer-events:none;z-index:2147483647;left:50%;top:50%;opacity:0;';
      this.el.innerHTML = svg;
      document.body.appendChild(this.el);
      requestAnimationFrame(() => this.el && (this.el.style.opacity = '1'));
    },
    async moveTo(el) {
      if (!el) return; this.init();
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      await sleep(220);
      const r = el.getBoundingClientRect();
      this.el.style.left = (r.left + r.width / 2) + 'px';
      this.el.style.top  = (r.top  + r.height / 2) + 'px';
      await sleep(460);
    },
    async click(el) {
      if (!el) return; await this.moveTo(el);
      this.el.style.filter = 'brightness(2.2)'; await sleep(70);
      this.el.style.filter = ''; el.click(); await sleep(150);
    },
    async typeIn(el, text) {
      await this.moveTo(el); el.focus();
      // Limpar campo
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      // Colar via clipboard sintético
      const dt = new DataTransfer(); dt.setData('text/plain', text);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      await sleep(100);
      // Fallback para campos que ignoram paste
      if (!(el.value || el.textContent || '').trim()) {
        document.execCommand('insertText', false, text);
      }
      if (el.tagName === 'INPUT' && !el.value) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(el, text);
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(150);
    },
    hide() {
      if (!this.el) return;
      this.el.style.opacity = '0';
      setTimeout(() => { this.el?.remove(); this.el = null; }, 300);
    }
  };

  // ─── HUD flutuante
  const HUD = {
    el: null,
    show(msg) {
      if (!this.el) {
        this.el = document.createElement('div');
        Object.assign(this.el.style, {
          position: 'fixed', bottom: '60px', right: '22px', zIndex: '2147483647',
          background: 'linear-gradient(135deg,#7c3aed,#ec4899)',
          color: 'white', fontSize: '12px', fontWeight: '700',
          fontFamily: '-apple-system,sans-serif',
          padding: '8px 15px', borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(124,58,237,.55)',
          pointerEvents: 'none', opacity: '0', transition: 'opacity .3s'
        });
        document.body.appendChild(this.el);
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

  // ─── Localizar elemento por texto visível ou seletor CSS
  function findEl(target) {
    if (!target) return null;
    // Tentar como seletor CSS primeiro
    try { const el = document.querySelector(target); if (el?.offsetParent) return el; } catch(_) {}
    // Buscar por texto visível
    const TAGS = 'button,a,label,[role="button"],[role="tab"],[role="menuitem"],span,li,div';
    const lower = target.toLowerCase();
    const all = [...document.querySelectorAll(TAGS)];
    return (
      all.find(e => e.textContent.trim().toLowerCase() === lower && e.offsetParent) ||
      all.find(e => e.textContent.trim().toLowerCase().startsWith(lower) && e.offsetParent) ||
      all.find(e => e.children.length <= 3 && e.textContent.trim().toLowerCase().includes(lower) && e.offsetParent) ||
      null
    );
  }

  // ─── Localizar input/textarea por label ou placeholder
  function findInput(target) {
    if (!target) return document.querySelector('input:not([type=hidden]),textarea,[contenteditable=true]');
    const q = target.toLowerCase();
    return (
      document.querySelector(`input[placeholder*="${target}" i],textarea[placeholder*="${target}" i]`) ||
      [...document.querySelectorAll('label')].find(l => l.textContent.toLowerCase().includes(q))?.querySelector('input,textarea') ||
      document.querySelector(`input[aria-label*="${target}" i],textarea[aria-label*="${target}" i],[contenteditable][aria-label*="${target}" i]`) ||
      document.querySelector('[contenteditable="true"]') ||
      null
    );
  }

  // ─── Google Sheets: Name Box
  function getNameBox() {
    return (
      document.querySelector('.waffle-name-box input') ||
      document.querySelector('[aria-label="Name Box"]') ||
      document.querySelector('#t-name-box')
    );
  }

  async function goToCell(addr) {
    const nb = getNameBox();
    if (!nb) throw new Error('Name Box não encontrado — está numa planilha Google Sheets?');
    await Cursor.moveTo(nb);
    nb.click(); nb.focus(); nb.select();
    nb.value = addr;
    nb.dispatchEvent(new Event('input', { bubbles: true }));
    nb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    await sleep(280);
  }

  async function fillCell(addr, value) {
    await goToCell(addr);
    await sleep(180);
    // Copiar para clipboard real e colar
    const ta = document.createElement('textarea');
    ta.style.cssText = 'position:fixed;opacity:0;left:-9999px;top:0';
    ta.value = String(value);
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    document.execCommand('copy');
    ta.remove();
    await sleep(90);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true }));
    await sleep(280);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true }));
    await sleep(180);
  }

  // ─── Executar um step
  async function executeStep(step) {
    Cursor.init();
    HUD.show(step.description || step.action);
    try {
      switch (step.action) {

        case 'click': {
          const el = findEl(step.target);
          if (!el) return { success: false, error: `Elemento não encontrado: "${step.target}"` };
          await Cursor.click(el);
          return { success: true };
        }

        case 'type': {
          const el = findInput(step.target);
          if (!el) return { success: false, error: `Campo não encontrado: "${step.target}"` };
          await Cursor.typeIn(el, step.value || '');
          return { success: true };
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

        case 'scroll': {
          window.scrollBy({ top: step.direction === 'up' ? -400 : 400, behavior: 'smooth' });
          await sleep(500);
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
    if (msg.action === 'PING') { sendResponse({ pong: true }); return; }
    if (msg.action === 'EXECUTE_STEP') {
      executeStep(msg.step).then(sendResponse);
      return true;
    }
  });
}
