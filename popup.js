// popup.js v4.0 — Bibi

let port = null;
let isRunning = false;
let currentPlanSteps = [];

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
  if (!text || isRunning) return;
  addUserMsg(text);
  input.value = '';
  input.style.height = 'auto';
  chrome.runtime.sendMessage({ action: 'COMMAND', text });
}

// ─── Scroll
function scrollDown() {
  requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
}

// ─── Mensagem do usuário
function addUserMsg(text) {
  const wrap = document.createElement('div');
  wrap.className = 'msg user';
  wrap.innerHTML = `
    <div class="msg-avatar">👤</div>
    <div class="msg-bubble">${escHtml(text)}</div>
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
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
chrome.storage.local.get('geminiKey', ({ geminiKey }) => {
  if (geminiKey) {
    document.getElementById('cfg-key').placeholder = '••••••• (já configurada)';
  }
});

// ─── Init
window.addEventListener('load', () => {
  connectBackground();
  refreshGroupTabs();
  addBibiMsg('Olá! Sou a Bibi ✦\nDiga o que quer que eu faça nas abas do grupo Bibi.\nSe ainda não criou o grupo, clique em "+ Grupo" acima.');
});
