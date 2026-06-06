// popup.js v4.2 — Bibi

let port = null;
let isRunning = false;
let currentPlanSteps = [];
let pendingAttachment = null; // { type:'image'|'pdf', data:base64, mimeType, name, previewUrl }

const chat    = document.getElementById('chat');
const input   = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');

// ─── Tema claro/escuro
(function initTheme() {
  const saved = localStorage.getItem('bibi_theme') || 'light';
  applyTheme(saved);
})();

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('bibi_theme', theme);
}

document.getElementById('btn-theme').addEventListener('click', () => {
  const isDark = document.body.classList.contains('dark');
  applyTheme(isDark ? 'light' : 'dark');
});

// ─── Auto-resize textarea
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 100) + 'px';
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

// ─── Upload de arquivo
document.getElementById('file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  const reader = new FileReader();

  if (file.type.startsWith('image/')) {
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      pendingAttachment = { type: 'image', data: base64, mimeType: file.type, name: file.name, previewUrl: reader.result };
      showAttachPreview(file.name, '🖼️', reader.result);
    };
    reader.readAsDataURL(file);
  } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    reader.onload = () => {
      const base64 = btoa(String.fromCharCode(...new Uint8Array(reader.result)));
      pendingAttachment = { type: 'pdf', data: base64, mimeType: 'application/pdf', name: file.name };
      showAttachPreview(file.name, '📄', null);
    };
    reader.readAsArrayBuffer(file);
  }
});

function showAttachPreview(name, icon, previewUrl) {
  document.getElementById('__attach_prev__')?.remove();
  const div = document.createElement('div');
  div.id = '__attach_prev__';
  div.className = 'attach-preview';
  div.innerHTML = `
    ${previewUrl ? `<img src="${previewUrl}" class="msg-img" style="height:36px;border-radius:5px">` : `<span style="font-size:20px">${icon}</span>`}
    <span class="attach-name">${escHtml(name)}</span>
    <span class="attach-remove" id="__rem_att__">✕</span>
  `;
  document.querySelector('.input-box').before(div);
  document.getElementById('__rem_att__').onclick = () => {
    pendingAttachment = null;
    div.remove();
  };
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
      <img src="icons/icon128.png" alt="Bibi"
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
      <img src="icons/icon128.png" alt="Bibi"
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
      <img src="icons/icon128.png" alt="Bibi"
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

// ─── Atualizar barra de grupo
function refreshGroupTabs() {
  chrome.runtime.sendMessage({ action: 'GET_GROUP_TABS' }, res => {
    const el = document.getElementById('group-tabs-info');
    if (!res?.tabs?.length) {
      el.innerHTML = '<span style="color:var(--dim);font-size:10px">Nenhuma aba no grupo</span>';
      return;
    }
    el.innerHTML = res.tabs.map(t => {
      const label = (t.title || new URL(t.url).hostname).slice(0, 22);
      return `<span class="tab-pill">${escHtml(label)}</span>`;
    }).join('');
  });
}

document.getElementById('btn-group').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'CREATE_GROUP' }, res => {
    if (res?.success) {
      addInline(res.existing ? '✓ Grupo Bibi já está ativo' : '✓ Grupo Bibi criado! Adicione as abas que quiser.', 'ok');
      refreshGroupTabs();
    } else {
      addInline('✗ Erro: ' + (res?.error || ''), 'err');
    }
  });
});

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
        refreshGroupTabs();
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
    icon: '🔴',
    label: 'Sem retorno',
    cmd: 'Na planilha de parcerias, preencha "Sem retorno" na coluna de hoje para os leads: '
  },
  {
    icon: '📊',
    label: 'Ver pendentes',
    cmd: 'Leia a planilha de parcerias e me mostre todos os meus leads ativos de hoje que ainda não têm atualização na coluna de hoje'
  },
  {
    icon: '✅',
    label: 'Follow enviado',
    cmd: 'Na planilha de parcerias, preencha "Follow enviado" na coluna de hoje para os leads: '
  },
  {
    icon: '📅',
    label: 'Reagendado',
    cmd: 'Na planilha de parcerias, preencha "Reagendado ' + new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) + '" na coluna de hoje para o lead: '
  },
  {
    icon: '🏆',
    label: 'Ganho',
    cmd: 'Na planilha de parcerias, preencha "Ganho" na coluna de hoje e mude o Status para "Ganho" para o lead: '
  },
  {
    icon: '❌',
    label: 'Perdido',
    cmd: 'Na planilha de parcerias, preencha "Perdido" na coluna de hoje e mude o Status para "Perdido" para o lead: '
  },
  {
    icon: '🔍',
    label: 'Buscar número',
    cmd: 'Na planilha de parcerias, qual é o número de telefone do lead: '
  },
  {
    icon: '📸',
    label: 'Ler print',
    cmd: '(Anexe um print da planilha com 📎) Leia a imagem e preencha a coluna de hoje conforme o status de cada lead'
  }
];

function initMacros() {
  const list = document.getElementById('macros-list');
  if (!list) return;
  MACROS.forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'macro-chip';
    btn.textContent = m.icon + ' ' + m.label;
    btn.title = m.cmd;
    btn.addEventListener('click', () => {
      input.value = m.cmd;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
      input.focus();
      // Posiciona cursor no final
      input.selectionStart = input.selectionEnd = m.cmd.length;
    });
    list.appendChild(btn);
  });
}

// ─── Init
window.addEventListener('load', () => {
  connectBackground();
  refreshGroupTabs();
  initMacros();
  addBibiMsg('Olá! Sou a Bibi ✨\nDiga o que quer que eu faça nas abas do grupo Bibi.\nSe ainda não criou o grupo, clique em **+ Grupo** acima.');
});
