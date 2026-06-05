// popup.js v3.2 — Bibly (UI apenas — automação roda no background)

let port = null;
let isRunning = false;
let currentLead = null;

// ─── Cursor animado no popup
const cursor = document.getElementById('cursor');
const cursorDot = document.getElementById('cursor-dot');
document.addEventListener('mousemove', e => {
  cursor.style.left = e.clientX + 'px';
  cursor.style.top  = e.clientY + 'px';
  cursorDot.style.left = e.clientX + 'px';
  cursorDot.style.top  = e.clientY + 'px';
});
document.addEventListener('mousedown', () => cursor.style.transform = 'scale(.7)');
document.addEventListener('mouseup',   () => cursor.style.transform = 'scale(1)');

// ─── Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ─── Follow override manual
document.querySelectorAll('.follow-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.follow-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (currentLead) {
      currentLead.followNumber = parseInt(btn.dataset.fn);
      const badge = document.querySelector('.follow-badge');
      if (badge) badge.textContent = `Follow ${currentLead.followNumber}`;
    }
  });
});

function setActiveFollow(n) {
  document.querySelectorAll('.follow-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.fn) === n)
  );
}

// ─── UI helpers
const dot = document.getElementById('dot');
const statusMsg = document.getElementById('status-msg');
const runningIndicator = document.getElementById('running-indicator');
const runningMsg = document.getElementById('running-msg');
const logList = document.getElementById('log-list');

function setStatus(msg, type = '') {
  statusMsg.textContent = msg;
  dot.className = 'dot ' + type;
}
function setRunningMsg(msg) {
  if (msg) { runningMsg.textContent = msg; runningIndicator.classList.add('visible'); }
  else { runningIndicator.classList.remove('visible'); }
}
function logDirect(line, type = '') {
  const el = document.createElement('div');
  el.className = 'log-item ' + type;
  el.textContent = line;
  logList.appendChild(el);
  logList.scrollTop = logList.scrollHeight;
}
function log(msg, type = '') {
  const t = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  logDirect(`${t} ${msg}`, type);
}
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderLeadCard(lead) {
  currentLead = lead;
  const isSP = lead.activityType === 'social_points';
  const fn = lead.followNumber || 1;
  const card = document.getElementById('lead-card');
  card.className = 'lead-card has-data';
  card.innerHTML = `
    <div class="lead-name">${escHtml(lead.name)}</div>
    ${lead.phone ? `<div class="lead-phone">📱 ${escHtml(lead.phone)}</div>` : ''}
    <div class="tags">
      ${lead.partner ? `<span class="tag">🤝 ${escHtml(lead.partner)}</span>` : ''}
      ${isSP ? `<span class="follow-badge">Follow ${fn}</span>` : ''}
    </div>
    <div class="activity-badge ${isSP ? 'sp' : 'pesq'}">
      ${isSP ? '💬 Social Points' : '🔍 Pesquisa'}
    </div>
  `;
  const followRow = document.getElementById('follow-row');
  if (isSP) { followRow.style.display = 'block'; setActiveFollow(fn); }
  else { followRow.style.display = 'none'; }
}

function lockUI() {
  isRunning = true;
  document.getElementById('btn-sp').disabled = true;
  document.getElementById('btn-pesquisa').disabled = true;
  document.getElementById('btn-cancel').classList.add('visible');
}
function unlockUI() {
  isRunning = false;
  document.getElementById('btn-sp').disabled = false;
  document.getElementById('btn-pesquisa').disabled = false;
  document.getElementById('btn-cancel').classList.remove('visible');
  setRunningMsg(null);
}

// ─── Conectar ao background (automação persiste mesmo com popup fechado)
function connectBackground() {
  try { port = chrome.runtime.connect({ name: 'bibly_popup' }); }
  catch(_) { setTimeout(connectBackground, 1000); return; }

  port.onMessage.addListener(msg => {
    if (msg.action === 'INIT') {
      setStatus(msg.status.msg, msg.status.type);
      if (msg.isRunning) { lockUI(); } else { unlockUI(); }
      if (msg.runningMsg) setRunningMsg(msg.runningMsg);
      if (msg.lead) renderLeadCard(msg.lead);
      // Restaura log
      msg.log.forEach(e => logDirect(`${e.t} ${e.msg}`, e.type));
      return;
    }
    if (msg.action === 'LOG')     { log(msg.msg, msg.type); return; }
    if (msg.action === 'STATUS')  { setStatus(msg.msg, msg.type); return; }
    if (msg.action === 'RUNNING') { setRunningMsg(msg.msg); return; }
    if (msg.action === 'LEAD')    { renderLeadCard(msg.lead); return; }
    if (msg.action === 'LOCK')    { lockUI(); return; }
    if (msg.action === 'UNLOCK')  { unlockUI(); return; }
  });

  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(connectBackground, 1000);
  });
}

// ─── Botões de fluxo
document.getElementById('btn-sp').addEventListener('click', () => {
  if (isRunning) return;
  chrome.runtime.sendMessage({ action: 'START_FLOW', flowType: 'social_points' });
  lockUI();
  setStatus('Iniciando Social Points...', 'spin');
});

document.getElementById('btn-pesquisa').addEventListener('click', () => {
  if (isRunning) return;
  chrome.runtime.sendMessage({ action: 'START_FLOW', flowType: 'pesquisa' });
  lockUI();
  setStatus('Iniciando Pesquisa...', 'spin');
});

document.getElementById('btn-cancel').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'CANCEL_FLOW' });
  log('✗ Cancelando...', 'warn');
});

// ─── Config
chrome.storage.local.get(['sheetId','kommoUrl','phoneCol','etapaCol','nameCol'], d => {
  if (d.sheetId)   document.getElementById('cfg-sheet-id').value   = d.sheetId;
  if (d.kommoUrl)  document.getElementById('cfg-kommo-url').value   = d.kommoUrl;
  if (d.phoneCol)  document.getElementById('cfg-phone-col').value   = d.phoneCol;
  if (d.etapaCol)  document.getElementById('cfg-etapa-col').value   = d.etapaCol;
  if (d.nameCol)   document.getElementById('cfg-name-col').value    = d.nameCol;
});
document.getElementById('btn-save-cfg').addEventListener('click', () => {
  chrome.storage.local.set({
    sheetId:  document.getElementById('cfg-sheet-id').value.trim(),
    kommoUrl: document.getElementById('cfg-kommo-url').value.trim(),
    phoneCol: (document.getElementById('cfg-phone-col').value.trim().toUpperCase()||'D'),
    etapaCol: (document.getElementById('cfg-etapa-col').value.trim().toUpperCase()||'F'),
    nameCol:  (document.getElementById('cfg-name-col').value.trim().toUpperCase() ||'C'),
  }, () => { log('✓ Config salva','ok'); setStatus('Salvo','ok'); });
});
document.getElementById('cfg-toggle').addEventListener('click', () =>
  document.getElementById('cfg-panel').classList.toggle('open')
);
document.getElementById('btn-clear-log').addEventListener('click', () => {
  logList.innerHTML = ''; log('Log limpo','');
});

// ─── Grupo de abas
document.getElementById('btn-create-group').addEventListener('click', async () => {
  const sheetUrl = 'https://docs.google.com/spreadsheets/d/1EyCf8dkvD8jLzvRTQ7NwiQ4Mo6TWE6ApXuWjHxtZpRg/edit?gid=221407979#gid=221407979&fvid=1329832222';
  const { kommoUrl } = await chrome.storage.local.get(['kommoUrl']);
  chrome.runtime.sendMessage({ action: 'CREATE_GROUP', sheetUrl, kommoUrl }, res => {
    if (res?.success) {
      document.getElementById('group-status').textContent = res.existing
        ? '✓ Grupo "Bibly" já ativo'
        : `✓ Grupo "Bibly" criado (${res.count} abas)`;
    } else {
      log('✗ Erro ao criar grupo: ' + res?.error, 'err');
    }
  });
});

// ─── Defaults + init
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1EyCf8dkvD8jLzvRTQ7NwiQ4Mo6TWE6ApXuWjHxtZpRg/edit?gid=221407979#gid=221407979&fvid=1329832222';
const DEFAULTS = {
  sheetId:  '1EyCf8dkvD8jLzvRTQ7NwiQ4Mo6TWE6ApXuWjHxtZpRg',
  kommoUrl: 'marketingcardapiowebcom.kommo.com',
  nameCol: 'C', phoneCol: 'D', etapaCol: 'F'
};

window.addEventListener('load', () => {
  connectBackground();

  chrome.storage.local.get(Object.keys(DEFAULTS), saved => {
    const toSet = {};
    for (const [k,v] of Object.entries(DEFAULTS)) { if (!saved[k]) toSet[k] = v; }
    if (Object.keys(toSet).length) chrome.storage.local.set(toSet);
  });

  // Auto grupo se não existir
  chrome.tabGroups.query({}).then(groups => {
    if (!groups.find(g => g.title === 'Bibly')) {
      document.getElementById('group-status').textContent = '';
    } else {
      document.getElementById('group-status').textContent = '✓ Grupo "Bibly" ativo';
    }
  }).catch(() => {});
});
