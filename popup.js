// popup.js v4.2 — Bibi

let port = null;
let isRunning = false;
let currentPlanSteps = [];
let pendingAttachment = null; // { type:'image'|'pdf', data:base64, mimeType, name, previewUrl }

const chat    = document.getElementById('chat');
const input   = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');

// ─── Auto-resize textarea
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 100) + 'px';
});

// ─── Mostrar ações ao focar no input
const macrosBar = document.querySelector('.macros-bar');
input.addEventListener('focus', () => macrosBar.classList.add('visible'));
input.addEventListener('blur', () => {
  setTimeout(() => macrosBar.classList.remove('visible'), 200);
});

// Enter envia, Shift+Enter quebra linha
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
btnSend.addEventListener('click', send);

function send() {
  const text = input.value.trim();
  if ((!text && !pendingAttachment) || isRunning) return;
  addUserMsg(text, pendingAttachment);
  const att = pendingAttachment;
  pendingAttachment = null;
  document.getElementById('__attach_prev__')?.remove();
  input.value = '';
  input.style.height = 'auto';
  chrome.runtime.sendMessage({ action: 'COMMAND', text, attachment: att });
}

// ─── Scroll
function scrollDown() {
  requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
}

// ─── Mensagem do usuário
function addUserMsg(text, att) {
  const wrap = document.createElement('div');
  wrap.className = 'msg user';
  const attHtml = att?.previewUrl
    ? `<img src="${att.previewUrl}" class="msg-img" alt="${escHtml(att.name)}">`
    : att ? `<div style="font-size:11px;color:var(--dim);margin-top:3px">📄 ${escHtml(att.name)}</div>` : '';
  wrap.innerHTML = `
    <div class="msg-avatar">👤</div>
    <div class="msg-bubble">${text ? escHtml(text) : ''}${attHtml}</div>
  `;
  chat.appendChild(wrap);
  scrollDown();
}

// ─── Mensagem da Bibi
function addBibiMsg(text) {
  const wrap = document.createElement('div');
  wrap.className = 'msg bibi';
  wrap.innerHTML = `
    <div class="msg-avatar">
      <img src="icons/avatar-bruxinha.png" alt="Bibi"
           onerror="this.style.display='none';this.parentElement.textContent='✦'">
    </div>
    <div class="msg-bubble">${escHtml(text)}</div>
  `;
  chat.appendChild(wrap);
  scrollDown();
  return wrap;
}

// ─── "Pensando..."
function addThinking() {
  const wrap = document.createElement('div');
  wrap.className = 'msg bibi';
  wrap.id = '__thinking__';
  wrap.innerHTML = `
    <div class="msg-avatar">
      <img src="icons/avatar-bruxinha.png" alt="Bibi"
           onerror="this.style.display='none';this.parentElement.textContent='✦'">
    </div>
    <div class="msg-bubble thinking">
      Pensando<span class="dots"><span></span><span></span><span></span></span>
    </div>
  `;
  chat.appendChild(wrap);
  scrollDown();
}
function removeThinking() {
  document.getElementById('__thinking__')?.remove();
}

// ─── Pill de status inline
function addInline(text, type = '') {
  const el = document.createElement('div');
  el.className = `msg-inline ${type}`;
  el.textContent = text;
  chat.appendChild(el);
  scrollDown();
  return el;
}

// ─── Card de plano
function addPlanCard(plan) {
  removeThinking();
  currentPlanSteps = [];

  const wrap = document.createElement('div');
  wrap.className = 'msg bibi';

  const stepsHtml = plan.steps.map((s, i) => `
    <div class="plan-step" id="__step__${i}">
      <span class="step-num">${i + 1}</span>
      <span>${escHtml(s.description)}</span>
    </div>
  `).join('');

  wrap.innerHTML = `
    <div class="msg-avatar">
      <img src="icons/avatar-bruxinha.png" alt="Bibi"
           onerror="this.style.display='none';this.parentElement.textContent='✦'">
    </div>
    <div class="plan-card">
      <div class="plan-title">🗺 ${escHtml(plan.plan_description)}</div>
      <div class="plan-steps">${stepsHtml}</div>
      <div class="plan-actions" id="__plan_actions__">
        <button class="btn-confirm" id="__btn_confirm__">✓ Confirmar e executar</button>
        <button class="btn-deny" id="__btn_deny__">Cancelar</button>
      </div>
    </div>
  `;

  chat.appendChild(wrap);

  plan.steps.forEach((_, i) => {
    currentPlanSteps.push(document.getElementById(`__step__${i}`));
  });

  document.getElementById('__btn_confirm__').addEventListener('click', () => {
    document.getElementById('__plan_actions__')?.remove();
    chrome.runtime.sendMessage({ action: 'CONFIRM_PLAN' });
  });
  document.getElementById('__btn_deny__').addEventListener('click', () => {
    document.getElementById('__plan_actions__')?.remove();
    chrome.runtime.sendMessage({ action: 'CANCEL_PLAN' });
  });

  scrollDown();
}

// ─── Atualizar step (0-based)
function setStepState(index, state) {
  const el = currentPlanSteps[index];
  if (!el) return;
  el.className = `plan-step ${state}`;
  const num = el.querySelector('.step-num');
  if (!num) return;
  if (state === 'done')    num.textContent = '✓';
  else if (state === 'error')   num.textContent = '✗';
  else if (state === 'running') num.textContent = '●';
  scrollDown();
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// ─── Conexão com background
function connectBackground() {
  try { port = chrome.runtime.connect({ name: 'bibi_popup' }); }
  catch(_) { setTimeout(connectBackground, 1000); return; }

  port.onMessage.addListener(msg => {
    switch (msg.action) {

      case 'INIT':
        isRunning = msg.isRunning;
        btnSend.disabled = isRunning;
        break;

      case 'THINKING':
        isRunning = true;
        btnSend.disabled = true;
        addThinking();
        break;

      case 'PLAN':
        addPlanCard(msg.plan);
        break;

      case 'EXECUTING':
        isRunning = true;
        btnSend.disabled = true;
        addInline('⚡ Executando...', 'info');
        break;

      case 'STEP_START':
        setStepState(msg.index, 'running');
        break;

      case 'STEP_DONE':
        setStepState(msg.index, msg.ok ? 'done' : 'error');
        break;

      case 'DONE':
        isRunning = false;
        btnSend.disabled = false;
        break;

      case 'BULK_PROGRESS':
        addInline(`📤 ${msg.current}/${msg.total} — ${msg.number}`, 'info');
        break;

      case 'BULK_DONE':
        isRunning = false;
        btnSend.disabled = false;
        break;

      case 'BIBI_MSG':
        removeThinking();
        addBibiMsg(msg.text);
        if (msg.unlock) {
          isRunning = false;
          btnSend.disabled = false;
        }
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(connectBackground, 1000);
  });
}

// ─── Configurações (API key)
document.getElementById('settings-toggle').addEventListener('click', () => {
  document.getElementById('settings-panel').classList.toggle('open');
});

document.getElementById('btn-save-key').addEventListener('click', () => {
  const key = document.getElementById('cfg-key').value.trim();
  if (!key) return;
  chrome.runtime.sendMessage({ action: 'SAVE_KEY', key }, () => {
    addInline('✓ Chave salva!', 'ok');
    document.getElementById('settings-panel').classList.remove('open');
    document.getElementById('cfg-key').value = '';
  });
});

// Pré-preenche o campo se já tiver chave salva
chrome.storage.local.get('groqKey', ({ groqKey }) => {
  if (groqKey) {
    document.getElementById('cfg-key').placeholder = '••••••• (já configurada)';
  }
});

// ─── Macros rápidas (SDR Parcerias)
const MACROS = [
  {
    icon: '🔴', label: 'Sem retorno', desc: 'Marcar sem retorno',
    bg: 'rgba(220,38,38,.13)',
    cmd: 'Na planilha de parcerias, preencha "Sem retorno" na coluna de hoje para os leads: '
  },
  {
    icon: '📊', label: 'Ver pendentes', desc: 'Ver atendimentos',
    bg: 'rgba(109,40,217,.13)',
    cmd: 'Leia a planilha de parcerias e me mostre todos os meus leads ativos de hoje que ainda não têm atualização na coluna de hoje'
  },
  {
    icon: '✅', label: 'Follow enviado', desc: 'Marcar follow-up',
    bg: 'rgba(5,150,105,.13)',
    cmd: 'Na planilha de parcerias, preencha "Follow enviado" na coluna de hoje para os leads: '
  },
  {
    icon: '📅', label: 'Reagendado', desc: 'Reagendar lead',
    bg: 'rgba(217,119,6,.13)',
    cmd: 'Na planilha de parcerias, preencha "Reagendado ' + new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) + '" na coluna de hoje para o lead: '
  },
  {
    icon: '🏆', label: 'Ganho', desc: 'Marcar como ganho',
    bg: 'rgba(5,150,105,.13)',
    cmd: 'Na planilha de parcerias, preencha "Ganho" na coluna de hoje e mude o Status para "Ganho" para o lead: '
  },
  {
    icon: '❌', label: 'Perdido', desc: 'Marcar como perdido',
    bg: 'rgba(220,38,38,.13)',
    cmd: 'Na planilha de parcerias, preencha "Perdido" na coluna de hoje e mude o Status para "Perdido" para o lead: '
  },
  {
    icon: '🔍', label: 'Buscar número', desc: 'Achar telefone',
    bg: 'rgba(109,40,217,.13)',
    cmd: 'Na planilha de parcerias, qual é o número de telefone do lead: '
  }
];

// ─── Modal Reativar Leads
const modalOverlay  = document.getElementById('modal-reativar');
const modalNumbers  = document.getElementById('modal-numbers');
const modalMessage  = document.getElementById('modal-message');
const modalCounter  = document.getElementById('modal-counter');
const btnModalSend  = document.getElementById('btn-modal-send');
const btnModalCancel = document.getElementById('btn-modal-cancel');

function openReativarModal() { modalOverlay.classList.add('open'); }
function closeReativarModal() { modalOverlay.classList.remove('open'); }

modalNumbers.addEventListener('input', () => {
  const count = modalNumbers.value.split('\n').map(n => n.trim()).filter(Boolean).length;
  modalCounter.textContent = count + ' número' + (count !== 1 ? 's' : '');
});

btnModalCancel.addEventListener('click', closeReativarModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeReativarModal(); });

btnModalSend.addEventListener('click', () => {
  const numbers = modalNumbers.value.split('\n').map(n => n.trim()).filter(Boolean);
  const message = modalMessage.value.trim();
  if (!numbers.length || !message) return;

  closeReativarModal();
  isRunning = true;
  btnSend.disabled = true;
  addInline(`📲 Enviando para ${numbers.length} número${numbers.length !== 1 ? 's' : ''}...`, 'info');
  chrome.runtime.sendMessage({ action: 'SEND_WHATSAPP_BULK', numbers, message });
});

function makeMacroBtn(m) {
  const btn = document.createElement('button');
  btn.className = 'macro-btn';
  btn.innerHTML = `
    <div class="macro-icon" style="background:${m.bg}">${m.icon}</div>
    <div class="macro-info">
      <div class="macro-label">${m.label}</div>
      <div class="macro-desc">${m.desc}</div>
    </div>
  `;
  btn.addEventListener('click', () => {
    if (m.type === 'modal') { openReativarModal(); return; }
    input.value = m.cmd;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    input.focus();
    input.selectionStart = input.selectionEnd = m.cmd.length;
  });
  return btn;
}

function initMacros() {
  const list  = document.getElementById('macros-list');
  const extra = document.getElementById('macros-extra');
  if (!list) return;

  // 3 botões principais
  MACROS.slice(0, 3).forEach(m => list.appendChild(makeMacroBtn(m)));

  // Botão "Mais ações"
  const moreBtn = document.createElement('button');
  moreBtn.className = 'macro-btn more';
  moreBtn.innerHTML = `
    <div class="macro-icon" style="background:var(--surface2)">➕</div>
    <div class="macro-info">
      <div class="macro-label">Mais ações</div>
      <div class="macro-desc">Outras opções</div>
    </div>
  `;
  let open = false;
  moreBtn.addEventListener('click', () => {
    open = !open;
    extra.classList.toggle('open', open);
    moreBtn.querySelector('.macro-icon').textContent = open ? '➖' : '➕';
  });
  list.appendChild(moreBtn);

  // Ações extras (ocultas por padrão) — Reativar leads primeiro
  const reativarBtn = makeMacroBtn({
    icon: '📲', label: 'Reativar leads', desc: 'Envio em massa',
    bg: 'rgba(5,150,105,.13)', type: 'modal'
  });
  extra.appendChild(reativarBtn);
  MACROS.slice(3).forEach(m => extra.appendChild(makeMacroBtn(m)));
}

// ─── Init
window.addEventListener('load', () => {
  connectBackground();
  chrome.runtime.sendMessage({ action: 'CREATE_GROUP' });
  initMacros();
  addBibiMsg('Oi! Sou a Bibi\nSua assistente virtual. O que vamos fazer hoje?');
  loadMacrosData();
  initMacrosTab();
});

// ════════════════════════════════════════════
// ATALHOS (text expander)
// ════════════════════════════════════════════

let bibMacros = [];
let editingMacroId = null;

const ICONS = ['⚡','📝','👋','📞','🤝','💼','📋','✅','❌','🔴','🟢','📊','🔍','💡','🎯','📧','💬','🚀','🎉','⭐'];

function getDefaultMacros() {
  return [
    {
      id: 'def_1',
      icon: '👋',
      shortcut: 'oi',
      label: 'Saudação inicial',
      content: 'Olá {{nome}}, tudo bem? Passando para retomar nosso contato! 😊',
      aiEnhanced: false
    },
    {
      id: 'def_2',
      icon: '📞',
      shortcut: 'followup',
      label: 'Follow-up IA',
      content: 'Escreva uma mensagem de follow-up comercial calorosa e profissional para um lead de parceria que ainda não respondeu. Tom: amigável e direto. Máximo 3 linhas.',
      aiEnhanced: true
    },
    {
      id: 'def_3',
      icon: '📋',
      shortcut: 'proposta',
      label: 'Proposta comercial',
      content: '{{nome}}, conforme conversamos, segue nossa proposta:\n\n{{descricao}}\n\nFico à disposição para tirar qualquer dúvida! 🚀',
      aiEnhanced: false
    }
  ];
}

function loadMacrosData() {
  chrome.storage.local.get('bibiMacros', ({ bibiMacros }) => {
    if (!bibiMacros) {
      bibMacros = getDefaultMacros();
      chrome.storage.local.set({ bibiMacros: bibMacros });
    } else {
      bibMacros = bibiMacros;
    }
  });
}

function saveMacrosData() {
  chrome.storage.local.set({ bibiMacros: bibMacros });
}

function renderMacroList() {
  const container = document.getElementById('macro-list');
  if (!container) return;

  if (!bibMacros.length) {
    container.innerHTML = `
      <div class="mv-empty">
        Nenhum atalho criado ainda.<br>
        Clique em <b>+ Novo</b> para começar.<br><br>
        <b>/atalho</b> em qualquer campo expande automaticamente.
      </div>
    `;
    return;
  }

  container.innerHTML = bibMacros.map(m => `
    <div class="mitem" data-id="${escHtml(m.id)}">
      <div class="mitem-icon">${escHtml(m.icon || '⚡')}</div>
      <div class="mitem-info">
        <div class="mitem-shortcut">/${escHtml(m.shortcut)}${m.aiEnhanced ? '  ·  ✨ IA' : ''}</div>
        <div class="mitem-lbl">${escHtml(m.label)}</div>
        <div class="mitem-preview">${escHtml(m.content.slice(0, 64))}${m.content.length > 64 ? '…' : ''}</div>
      </div>
      <button class="mitem-del" data-id="${escHtml(m.id)}" title="Deletar">🗑</button>
    </div>
  `).join('');

  container.querySelectorAll('.mitem').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.mitem-del')) return;
      const macro = bibMacros.find(m => m.id === el.dataset.id);
      if (macro) openMacroEditor(macro);
    });
  });

  container.querySelectorAll('.mitem-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const m = bibMacros.find(m => m.id === btn.dataset.id);
      if (!m) return;
      if (!confirm(`Deletar /${m.shortcut}?`)) return;
      bibMacros = bibMacros.filter(x => x.id !== btn.dataset.id);
      saveMacrosData();
      renderMacroList();
    });
  });
}

function openMacroEditor(macro = null) {
  editingMacroId = macro?.id || null;
  document.getElementById('macro-modal-title').textContent = macro ? 'Editar atalho' : 'Novo atalho';
  document.getElementById('macro-icon-btn').textContent = macro?.icon || '⚡';
  document.getElementById('macro-shortcut').value = macro?.shortcut || '';
  document.getElementById('macro-label-inp').value = macro?.label || '';
  document.getElementById('macro-content').value = macro?.content || '';
  document.getElementById('macro-ai').checked = macro?.aiEnhanced || false;
  document.getElementById('modal-macro').classList.add('open');
}

function closeMacroEditor() {
  document.getElementById('modal-macro').classList.remove('open');
  editingMacroId = null;
}

function saveMacro() {
  const icon      = document.getElementById('macro-icon-btn').textContent.trim();
  const shortcut  = document.getElementById('macro-shortcut').value.trim().toLowerCase().replace(/[^\w-]/g, '');
  const label     = document.getElementById('macro-label-inp').value.trim();
  const content   = document.getElementById('macro-content').value.trim();
  const aiEnhanced = document.getElementById('macro-ai').checked;

  if (!shortcut || !content) {
    alert('Preencha o atalho e o conteúdo.');
    return;
  }

  if (editingMacroId) {
    const idx = bibMacros.findIndex(m => m.id === editingMacroId);
    if (idx !== -1) {
      bibMacros[idx] = { id: editingMacroId, icon, shortcut, label: label || shortcut, content, aiEnhanced };
    }
  } else {
    bibMacros.push({ id: 'macro_' + Date.now(), icon, shortcut, label: label || shortcut, content, aiEnhanced });
  }

  saveMacrosData();
  closeMacroEditor();
  renderMacroList();
}

function initMacrosTab() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.view;
      const chat = document.getElementById('view-chat');
      const macros = document.getElementById('view-macros');
      if (view === 'chat') {
        chat.style.display = 'flex';
        macros.style.display = 'none';
      } else {
        chat.style.display = 'none';
        macros.style.display = 'flex';
        renderMacroList();
      }
    });
  });

  // Icon picker (cicla pelos emojis)
  document.getElementById('macro-icon-btn')?.addEventListener('click', () => {
    const btn = document.getElementById('macro-icon-btn');
    const cur = btn.textContent.trim();
    const idx = ICONS.indexOf(cur);
    btn.textContent = ICONS[(idx + 1) % ICONS.length];
  });

  // Editor modal buttons
  document.getElementById('btn-add-macro')?.addEventListener('click', () => openMacroEditor());
  document.getElementById('btn-macro-cancel')?.addEventListener('click', closeMacroEditor);
  document.getElementById('btn-macro-save')?.addEventListener('click', saveMacro);
  document.getElementById('modal-macro')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-macro')) closeMacroEditor();
  });

  // Shortcut: permite só letras/números/underscore
  document.getElementById('macro-shortcut')?.addEventListener('input', e => {
    e.target.value = e.target.value.toLowerCase().replace(/[^\w-]/g, '');
  });
}
