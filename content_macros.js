// content_macros.js — Bibi text expander
(function () {
  if (window.__BIBI_MACROS__) return;
  window.__BIBI_MACROS__ = true;

  let macros = [];
  let activeEl = null;
  let dropdown = null;
  let selectedIdx = 0;

  // ── Carrega macros do storage
  function syncMacros() {
    chrome.storage.local.get('bibiMacros', ({ bibiMacros }) => {
      macros = bibiMacros || [];
    });
  }
  syncMacros();
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.bibiMacros) macros = changes.bibiMacros.newValue || [];
  });

  // ── Helpers
  function isEditable(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.isContentEditable) return true;
    if (el.tagName === 'INPUT') {
      const skip = ['checkbox', 'radio', 'file', 'hidden', 'button', 'submit', 'reset', 'range', 'color'];
      return !skip.includes(el.type);
    }
    return false;
  }

  function getCaretInfo(el) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      return { text: el.value, pos: el.selectionStart };
    }
    const sel = window.getSelection();
    if (!sel?.rangeCount) return { text: '', pos: 0 };
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    return {
      text: node.nodeType === 3 ? node.textContent : el.textContent,
      pos: range.startOffset,
    };
  }

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Heurísticas de variáveis para busca de especialista
  const LEAD_NAME_KEYS = ['nome', 'lead', 'cliente'];
  const TIME_KEYS = ['horario', 'horário', 'hora', 'data'];

  function findVarByKeys(vars, keys) {
    const lower = vars.map(v => v.toLowerCase());
    for (const k of keys) {
      const idx = lower.indexOf(k);
      if (idx >= 0) return vars[idx];
    }
    for (const k of keys) {
      const idx = lower.findIndex(v => v.includes(k));
      if (idx >= 0) return vars[idx];
    }
    return null;
  }

  // ── Detecção de plano a partir da conversa visível (Kommo)
  const PLAN_KEYWORDS = ['mesas', 'delivery', 'premium'];
  const PERIOD_KEYWORDS = ['anual', 'semestral', 'trimestral', 'mensal'];
  const CHAT_MSG_SELECTOR = '[class*="feed__item"],[class*="chat-message"],[class*="msg-item"],[class*="bubble"]';

  function normalizeSimple(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function lastKeywordMatch(text, keywords) {
    let best = null, bestIdx = -1;
    for (const kw of keywords) {
      const idx = text.lastIndexOf(kw);
      if (idx > bestIdx) { bestIdx = idx; best = kw; }
    }
    return best;
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Lê só as mensagens já renderizadas na tela (sem rolar o histórico)
  function detectPlanFromConversation() {
    const nodes = document.querySelectorAll(CHAT_MSG_SELECTOR);
    if (!nodes.length) return null;
    const text = normalizeSimple([...nodes].map(n => n.textContent).join(' \n '));
    const plan = lastKeywordMatch(text, PLAN_KEYWORDS);
    if (!plan) return null;
    const period = lastKeywordMatch(text, PERIOD_KEYWORDS);
    return period ? `${capitalize(plan)} ${capitalize(period)}` : capitalize(plan);
  }

  // ── Monitoramento de input
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!isEditable(el)) return;
    activeEl = el;
    const { text, pos } = getCaretInfo(el);
    const before = text.slice(0, pos);
    const match = before.match(/\/(\w*)$/);
    if (match) {
      showDropdown(el, match[1].toLowerCase());
    } else {
      hideDropdown();
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (!dropdown) return;
    const items = [...dropdown.querySelectorAll('.bm-item')];
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault(); e.stopPropagation();
      selectedIdx = (selectedIdx + 1) % items.length;
      highlightItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      selectedIdx = (selectedIdx - 1 + items.length) % items.length;
      highlightItem(items);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      const item = items[selectedIdx];
      if (item) {
        e.preventDefault(); e.stopPropagation();
        const macro = macros.find(m => m.id === item.dataset.id);
        if (macro) triggerExpand(macro);
        hideDropdown();
      }
    } else if (e.key === 'Escape') {
      hideDropdown();
    }
  }, true);

  document.addEventListener('focusin', (e) => {
    if (isEditable(e.target)) activeEl = e.target;
  }, true);

  document.addEventListener('click', (e) => {
    if (dropdown && !dropdown.contains(e.target)) hideDropdown();
  }, true);

  // ── Dropdown
  function showDropdown(el, query) {
    const filtered = macros.filter(m =>
      m.shortcut.toLowerCase().startsWith(query) ||
      (query.length >= 2 && m.label.toLowerCase().includes(query))
    );

    if (!filtered.length) { hideDropdown(); return; }

    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = '__bibi_dd__';
      document.documentElement.appendChild(dropdown);
    }

    const rect = el.getBoundingClientRect();
    const left = Math.max(6, Math.min(rect.left, window.innerWidth - 340));
    // Ancora pelo campo: se tiver espaço em cima, o menu cresce pra cima
    // (fica colado no "/" digitado); senão cai pra baixo do campo.
    const spaceAbove = rect.top;
    const openAbove = spaceAbove > 160;
    const posRule = openAbove
      ? `bottom: ${window.innerHeight - rect.top + 6}px !important; top: auto !important;`
      : `top: ${rect.bottom + 6}px !important; bottom: auto !important;`;

    dropdown.style.cssText = `
      all: initial;
      position: fixed !important;
      z-index: 2147483647 !important;
      ${posRule}
      left: ${left}px !important;
      background: #fff !important;
      border: 1.5px solid #ddd4f5 !important;
      border-radius: 14px !important;
      box-shadow: 0 8px 40px rgba(109,40,217,.22) !important;
      padding: 6px !important;
      min-width: 240px !important;
      max-width: 340px !important;
      max-height: ${Math.max(160, spaceAbove - 20)}px !important;
      overflow-y: auto !important;
      font-family: -apple-system, 'Segoe UI', sans-serif !important;
    `;

    selectedIdx = 0;
    dropdown.innerHTML =
      `<div style="all:unset;display:block;padding:4px 10px 7px;font-size:10px;font-weight:700;color:#9b8cbf;letter-spacing:.07em;text-transform:uppercase;font-family:inherit">✦ Macros da Bibi</div>` +
      filtered.slice(0, 8).map((m, i) => `
        <div class="bm-item" data-id="${escHtml(m.id)}" style="
          display:flex;align-items:center;gap:10px;
          padding:8px 10px;border-radius:9px;cursor:pointer;
          background:${i === 0 ? '#f7f3ff' : 'transparent'};
        ">
          <span style="font-size:16px;width:24px;text-align:center;flex-shrink:0">${escHtml(m.icon || '⚡')}</span>
          <div style="min-width:0;flex:1">
            <div style="font-size:12px;font-weight:700;color:#1A1333;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <span style="color:#6D28D9">/${escHtml(m.shortcut)}</span>
              <span style="font-weight:400;color:#9b8cbf">— ${escHtml(m.label)}</span>
              ${m.aiEnhanced ? '<span style="font-size:9px;background:#f7f3ff;border:1px solid #ddd4f5;border-radius:4px;padding:1px 5px;color:#6D28D9">✨ IA</span>' : ''}
            </div>
            <div style="font-size:10px;color:#9b8cbf;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;max-width:220px">
              ${escHtml((m.aiEnhanced ? '📝 ' : '') + m.content.slice(0, 60))}${m.content.length > 60 ? '…' : ''}
            </div>
          </div>
        </div>
      `).join('');

    dropdown.querySelectorAll('.bm-item').forEach((item, i) => {
      item.addEventListener('mouseover', () => {
        selectedIdx = i;
        highlightItem([...dropdown.querySelectorAll('.bm-item')]);
      });
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const macro = macros.find(m => m.id === item.dataset.id);
        if (macro) triggerExpand(macro);
        hideDropdown();
      });
    });
  }

  function highlightItem(items) {
    items.forEach((item, i) => {
      item.style.background = i === selectedIdx ? '#f7f3ff' : 'transparent';
    });
  }

  function hideDropdown() {
    dropdown?.remove();
    dropdown = null;
  }

  // ── Expansão
  function triggerExpand(macro) {
    if (!activeEl) return;
    const el = activeEl;

    if (macro.aiEnhanced) {
      replaceMacro(el, '⏳ Bibi gerando...');
      chrome.runtime.sendMessage({
        action: 'EXPAND_MACRO_AI',
        instruction: macro.content,
        context: document.title + ' — ' + location.hostname
      }).then(res => {
        if (res?.text) replaceExact(el, '⏳ Bibi gerando...', res.text);
      }).catch(() => {
        replaceExact(el, '⏳ Bibi gerando...', macro.content);
      });
    } else {
      const vars = [...new Set([...macro.content.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))];
      if (vars.length > 0) {
        showVarModal(el, macro, vars);
      } else {
        replaceMacro(el, macro.content);
      }
    }
  }

  // Substitui /atalho pelo texto expandido
  function replaceMacro(el, text) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const pos = el.selectionStart;
      const val = el.value;
      const before = val.slice(0, pos);
      const slashIdx = before.lastIndexOf('/');
      if (slashIdx < 0) return;
      const newVal = before.slice(0, slashIdx) + text + val.slice(pos);
      const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) { setter.call(el, newVal); } else { el.value = newVal; }
      el.selectionStart = el.selectionEnd = slashIdx + text.length;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // contenteditable
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType !== 3) return;
      const pos = range.startOffset;
      const before = node.textContent.slice(0, pos);
      const slashIdx = before.lastIndexOf('/');
      if (slashIdx < 0) return;
      node.textContent = node.textContent.slice(0, slashIdx) + text + node.textContent.slice(pos);
      const newRange = document.createRange();
      newRange.setStart(node, slashIdx + text.length);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
  }

  // Troca um texto específico no campo (para placeholder de IA)
  function replaceExact(el, search, replacement) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const val = el.value;
      const idx = val.indexOf(search);
      if (idx < 0) return;
      const newVal = val.slice(0, idx) + replacement + val.slice(idx + search.length);
      const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) { setter.call(el, newVal); } else { el.value = newVal; }
      el.selectionStart = el.selectionEnd = idx + replacement.length;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const text = el.textContent;
      const idx = text.indexOf(search);
      if (idx < 0) { el.textContent += replacement; return; }
      el.textContent = text.slice(0, idx) + replacement + text.slice(idx + search.length);
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
  }

  // ── Modal de variáveis
  function showVarModal(el, macro, vars) {
    document.getElementById('__bibi_vars__')?.remove();

    const overlay = document.createElement('div');
    overlay.id = '__bibi_vars__';
    overlay.style.cssText = `
      all: initial;
      position: fixed !important;
      inset: 0 !important;
      z-index: 2147483647 !important;
      background: rgba(0,0,0,.48) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-family: -apple-system, 'Segoe UI', sans-serif !important;
    `;

    const sheet = document.createElement('div');
    sheet.style.cssText = `
      background: #fff;
      border-radius: 18px;
      padding: 22px 20px;
      min-width: 280px;
      max-width: 380px;
      width: 90vw;
      box-shadow: 0 20px 60px rgba(109,40,217,.28);
    `;
    const leadVarName = findVarByKeys(vars, LEAD_NAME_KEYS);
    const timeVarName = findVarByKeys(vars, TIME_KEYS);

    sheet.innerHTML = `
      <div style="font-size:15px;font-weight:700;color:#1A1333;margin-bottom:2px">${escHtml(macro.icon || '⚡')} ${escHtml(macro.label)}</div>
      <div style="font-size:11px;color:#9b8cbf;margin-bottom:18px">Preencha as variáveis</div>
      ${vars.map((v, i) => {
        const isEspecialista = /^especialista$/i.test(v);
        const isPlano = /^plano$/i.test(v);
        return `
        <div style="margin-bottom:12px">
          <div style="font-size:10px;font-weight:700;color:#9b8cbf;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">${escHtml(v)}</div>
          <div style="display:flex;gap:6px;align-items:center">
            <input data-var="${escHtml(v)}" type="text" placeholder="${escHtml(v)}..." autocomplete="off"
              ${i === 0 ? 'autofocus' : ''}
              style="flex:1;min-width:0;padding:9px 11px;border:1.5px solid #ddd4f5;border-radius:9px;font-size:13px;font-family:inherit;color:#1A1333;outline:none;box-sizing:border-box;">
            ${isEspecialista ? `
              <button type="button" id="__bv_find_specialist__" title="Buscar especialista na agenda"
                style="flex-shrink:0;white-space:nowrap;padding:9px 10px;border-radius:9px;border:1.5px solid #6D28D9;background:#f7f3ff;color:#6D28D9;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;">
                🔎 Buscar
              </button>` : ''}
            ${isPlano ? `
              <button type="button" id="__bv_detect_plan__" title="Detectar plano na conversa"
                style="flex-shrink:0;white-space:nowrap;padding:9px 10px;border-radius:9px;border:1.5px solid #6D28D9;background:#f7f3ff;color:#6D28D9;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;">
                🔎 Detectar
              </button>` : ''}
          </div>
          ${isEspecialista ? `<div id="__bv_specialist_msg__" style="font-size:10px;color:#c0392b;margin-top:4px;min-height:13px"></div>` : ''}
          ${isPlano ? `<div id="__bv_plan_msg__" style="font-size:10px;color:#c0392b;margin-top:4px;min-height:13px"></div>` : ''}
        </div>
      `;
      }).join('')}
      <div style="display:flex;gap:8px;margin-top:6px">
        <button id="__bv_cancel__" style="flex:1;padding:9px;border-radius:10px;border:1.5px solid #ddd4f5;background:transparent;color:#9b8cbf;font-size:12px;font-family:inherit;cursor:pointer;">Cancelar</button>
        <button id="__bv_ok__" style="flex:2;padding:9px;border-radius:10px;border:none;background:#6D28D9;color:#fff;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;box-shadow:0 4px 16px rgba(109,40,217,.35);">Inserir ✦</button>
      </div>
    `;

    overlay.appendChild(sheet);
    document.documentElement.appendChild(overlay);

    sheet.querySelectorAll('input[data-var]').forEach(input => {
      input.addEventListener('focus', () => { input.style.borderColor = '#6D28D9'; input.style.boxShadow = '0 0 0 3px rgba(109,40,217,.1)'; });
      input.addEventListener('blur', () => { input.style.borderColor = '#ddd4f5'; input.style.boxShadow = 'none'; });
    });

    const findBtn = sheet.querySelector('#__bv_find_specialist__');
    if (findBtn) {
      findBtn.addEventListener('click', async () => {
        const msgEl = sheet.querySelector('#__bv_specialist_msg__');
        const especialistaInput = [...sheet.querySelectorAll('input[data-var]')]
          .find(inp => /^especialista$/i.test(inp.getAttribute('data-var')));
        const leadInput = leadVarName ? sheet.querySelector(`input[data-var="${leadVarName}"]`) : null;
        const timeInput = timeVarName ? sheet.querySelector(`input[data-var="${timeVarName}"]`) : null;

        msgEl.style.color = '#c0392b';
        msgEl.textContent = '';

        const leadName = leadInput?.value.trim();
        const whenText = timeInput?.value.trim();

        if (!leadName || !whenText) {
          msgEl.textContent = (leadVarName && timeVarName)
            ? `Preencha "${leadVarName}" e "${timeVarName}" antes de buscar.`
            : 'Preencha o nome do lead e o horário antes de buscar.';
          return;
        }

        findBtn.disabled = true;
        const originalLabel = findBtn.innerHTML;
        findBtn.textContent = '⏳ Buscando...';
        findBtn.style.opacity = '0.7';
        findBtn.style.cursor = 'wait';

        try {
          const res = await chrome.runtime.sendMessage({ action: 'FIND_SPECIALIST', leadName, whenText });
          if (res?.error) {
            msgEl.textContent = res.error;
          } else if (res?.result?.name) {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            if (setter) setter.call(especialistaInput, res.result.name); else especialistaInput.value = res.result.name;
            especialistaInput.dispatchEvent(new Event('input', { bubbles: true }));
            msgEl.style.color = '#2e7d32';
            msgEl.textContent = `Encontrado: ${res.result.eventSummary}`;
          } else {
            msgEl.textContent = 'Não foi possível identificar o especialista.';
          }
        } catch (e) {
          msgEl.textContent = 'Erro ao buscar: ' + (e.message || 'falha desconhecida');
        } finally {
          findBtn.disabled = false;
          findBtn.innerHTML = originalLabel;
          findBtn.style.opacity = '1';
          findBtn.style.cursor = 'pointer';
        }
      });
    }

    const detectBtn = sheet.querySelector('#__bv_detect_plan__');
    if (detectBtn) {
      detectBtn.addEventListener('click', () => {
        const msgEl = sheet.querySelector('#__bv_plan_msg__');
        const planoInput = [...sheet.querySelectorAll('input[data-var]')]
          .find(inp => /^plano$/i.test(inp.getAttribute('data-var')));

        const detected = detectPlanFromConversation();
        if (detected) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(planoInput, detected); else planoInput.value = detected;
          planoInput.dispatchEvent(new Event('input', { bubbles: true }));
          msgEl.style.color = '#2e7d32';
          msgEl.textContent = `Detectado: ${detected}`;
        } else {
          msgEl.style.color = '#c0392b';
          msgEl.textContent = 'Não identifiquei o plano na conversa visível. Digite manualmente.';
        }
      });
    }

    function doInsert() {
      let expanded = macro.content;
      sheet.querySelectorAll('input[data-var]').forEach(input => {
        expanded = expanded.replaceAll(`{{${input.getAttribute('data-var')}}}`, input.value);
      });
      overlay.remove();
      replaceMacro(el, expanded);
      el.focus();
    }

    sheet.querySelector('#__bv_cancel__').addEventListener('click', () => {
      overlay.remove();
      replaceMacro(el, '');
      el.focus();
    });
    sheet.querySelector('#__bv_ok__').addEventListener('click', doInsert);
    sheet.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doInsert(); }
      if (e.key === 'Escape') { overlay.remove(); replaceMacro(el, ''); el.focus(); }
    });
    overlay.addEventListener('click', e => {
      if (e.target === overlay) { overlay.remove(); replaceMacro(el, ''); el.focus(); }
    });

    setTimeout(() => sheet.querySelector('input[data-var]')?.focus(), 60);
  }
})();
