// background.js v3.2 — Bibly
// Toda a automação roda aqui (independente do popup)

let isRunning = false;
let cancelRequested = false;
let currentLead = null;
let statusLog = [];
let currentStatus = { msg: 'Pronto', type: '' };
let runningMsg = '';
let popupPort = null;

chrome.runtime.onInstalled.addListener(() => console.log('[Bibly v3.2] Instalado'));

// Popup conecta via porta persistente para receber updates em tempo real
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'bibly_popup') return;
  popupPort = port;
  // Envia estado atual para o popup recém-aberto
  port.postMessage({
    action: 'INIT',
    status: currentStatus,
    runningMsg,
    log: statusLog,
    lead: currentLead,
    isRunning
  });
  port.onDisconnect.addListener(() => { popupPort = null; });
});

// Mensagens one-shot do popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'START_FLOW') {
    if (isRunning) { sendResponse({ already: true }); return; }
    startFlow(msg.flowType);
    sendResponse({ started: true });
    return;
  }
  if (msg.action === 'CANCEL_FLOW') {
    cancelRequested = true;
    sendResponse({ ok: true });
    return;
  }
  if (msg.action === 'CREATE_GROUP') {
    createTabGroup(msg.sheetUrl, msg.kommoUrl).then(sendResponse);
    return true;
  }
});

function broadcast(msg) {
  if (popupPort) { try { popupPort.postMessage(msg); } catch(_) {} }
  if (msg.action === 'LOG') {
    statusLog.push({ msg: msg.msg, type: msg.type, t: new Date().toLocaleTimeString('pt-BR') });
    if (statusLog.length > 80) statusLog.shift();
  }
  if (msg.action === 'STATUS') currentStatus = { msg: msg.msg, type: msg.type };
  if (msg.action === 'RUNNING') runningMsg = msg.msg;
  if (msg.action === 'LEAD') currentLead = msg.lead;
}

const log     = (msg, type='') => broadcast({ action:'LOG', msg, type });
const setStatus = (msg, type='') => broadcast({ action:'STATUS', msg, type });
const setRun  = (msg)          => broadcast({ action:'RUNNING', msg });
const sleep   = ms => new Promise(r => setTimeout(r, ms));

async function getTab(pattern) {
  return (await chrome.tabs.query({ url: pattern }))[0] || null;
}
async function focusTab(tab) {
  if (!tab) return;
  await chrome.tabs.update(tab.id, { active: true });
  await sleep(500);
}
async function safeSend(tabId, msg, file) {
  try { return await chrome.tabs.sendMessage(tabId, msg); }
  catch(_) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
      await sleep(700);
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch(e2) { return { success: false, error: 'Script não conectou: ' + e2.message }; }
  }
}

// ─── Fluxo principal
async function startFlow(type) {
  isRunning = true;
  cancelRequested = false;
  broadcast({ action: 'LOCK' });

  const label = type === 'pesquisa' ? 'Pesquisa' : 'Social Points';
  setStatus(`Iniciando ${label}...`, 'spin');
  log(`⚡ Iniciando ${label}...`, 'info');

  try {
    // 1. Meetime: filtrar + executar
    const meetTab = await getTab('https://meetime.com.br/*');
    if (!meetTab) { log('✗ Abra a Meetime primeiro', 'err'); setStatus('Meetime não aberta', 'err'); return; }

    await focusTab(meetTab);
    setRun('Meetime: filtrando atividades...');

    const meetRes = await safeSend(meetTab.id,
      { action: 'FILTER_AND_EXECUTE', activityType: type },
      'content_meetime.js'
    );

    if (!meetRes?.success) {
      log('✗ Meetime: ' + (meetRes?.error || 'falha'), 'err');
      setStatus('Erro na Meetime', 'err'); return;
    }
    if (cancelRequested) { log('✗ Cancelado', 'warn'); setStatus('Cancelado', ''); return; }

    const lead = meetRes.lead;
    broadcast({ action: 'LEAD', lead });
    log(`✓ ${lead.name} | ${lead.phone || 'sem tel'} | ${lead.templateKey}`, 'ok');
    await sleep(1000);

    const { phoneCol, etapaCol, nameCol } = await chrome.storage.local.get(['phoneCol','etapaCol','nameCol']);
    const sheetCfg = { phoneCol: phoneCol||'D', etapaCol: etapaCol||'F', nameCol: nameCol||'C' };

    if (cancelRequested) { log('✗ Cancelado', 'warn'); setStatus('Cancelado', ''); return; }

    if (lead.activityType === 'pesquisa') {
      await runPesquisaFlow(lead, sheetCfg);
    } else {
      await runSocialPointsFlow(lead, sheetCfg);
    }

    setStatus('Concluído! ✓', 'ok');
    log('✅ Feito!', 'ok');

  } catch(e) {
    setStatus('Erro', 'err');
    log('✗ ' + e.message, 'err');
  } finally {
    isRunning = false;
    broadcast({ action: 'UNLOCK' });
  }
}

// ─── Social Points
async function runSocialPointsFlow(lead, sheetCfg) {
  const fn = lead.followNumber || 1;

  const kommoTab = await getTab('https://*.kommo.com/*');
  if (!kommoTab) { log('✗ Kommo não está aberta', 'err'); return; }

  await focusTab(kommoTab);
  setRun(`Kommo: enviando Follow ${fn}...`);
  log(`💬 Enviando Follow ${fn} no Kommo...`, 'info');

  if (cancelRequested) return;
  const kommoRes = await safeSend(kommoTab.id, {
    action: 'SEND_WHATSAPP',
    phone: lead.phone,
    templateTrigger: '/[SDR][PAR]',
    followNumber: fn
  }, 'content_kommo.js');

  log(
    kommoRes?.success
      ? `✓ Mensagem enviada${kommoRes.template ? ': '+kommoRes.template : ''}`
      : `✗ Kommo: ${kommoRes?.error||'falha'}`,
    kommoRes?.success ? 'ok' : 'err'
  );
  if (cancelRequested) return;

  const sheetTab = await getTab('https://docs.google.com/spreadsheets/*');
  if (!sheetTab) { log('⚠ Planilha não aberta', 'warn'); return; }

  await focusTab(sheetTab);
  setRun('Planilha: registrando...');
  log('📊 Registrando na planilha...', 'info');

  const etapa = `Follow ${fn}${kommoRes?.success ? ' enviado' : ' (erro)'}`;
  const sheetRes = await safeSend(sheetTab.id,
    { action: 'UPSERT_LEAD', lead, etapa, checkOnly: false, config: sheetCfg },
    'content_sheets.js'
  );
  log(
    sheetRes?.success ? `✓ ${sheetRes.action}` : `✗ Planilha: ${sheetRes?.error}`,
    sheetRes?.success ? 'ok' : 'err'
  );

  // Meetime: marcar atividade como feita — só se Kommo E planilha tiveram sucesso
  if (kommoRes?.success && sheetRes?.success) {
    if (cancelRequested) return;
    const meetTab = await getTab('https://meetime.com.br/*');
    if (meetTab) {
      await focusTab(meetTab);
      setRun('Meetime: marcando como feito...');
      const doneRes = await safeSend(meetTab.id, { action: 'DONE_ACTIVITY' }, 'content_meetime.js');
      log(doneRes?.success ? '✓ Atividade concluída' : '⚠ Clique "Concluir" manualmente na Meetime', doneRes?.success ? 'ok' : 'warn');
    }
  }
}

// ─── Pesquisa
async function runPesquisaFlow(lead, sheetCfg) {
  if (cancelRequested) return;

  // 1. Kommo: buscar lead → verificar conversa
  const kommoTab = await getTab('https://*.kommo.com/*');
  if (!kommoTab) { log('✗ Kommo não está aberta', 'err'); return; }

  await focusTab(kommoTab);
  setRun('Kommo: verificando retorno...');
  log('🔍 Verificando retorno no Kommo...', 'info');

  const kommoRes = await safeSend(kommoTab.id,
    { action: 'CHECK_RESPONSE', phone: lead.phone, name: lead.name },
    'content_kommo.js'
  );
  log(
    `${kommoRes?.hasResponse ? '✓' : '⚠'} ${kommoRes?.status || 'Sem resultado'}`,
    kommoRes?.hasResponse ? 'ok' : 'warn'
  );
  if (cancelRequested) return;

  // 2. Planilha: adicionar nova linha com todos os dados
  const sheetTab = await getTab('https://docs.google.com/spreadsheets/*');
  if (!sheetTab) { log('⚠ Planilha não aberta', 'warn'); return; }

  await focusTab(sheetTab);
  setRun('Planilha: adicionando linha...');
  log('📊 Adicionando linha na planilha...', 'info');

  const sheetRes = await safeSend(sheetTab.id,
    { action: 'ADD_PESQUISA_ROW', lead, status: kommoRes?.status || 'Verificado' },
    'content_sheets.js'
  );
  log(
    sheetRes?.success ? `✓ ${sheetRes.action}` : `✗ Planilha: ${sheetRes?.error}`,
    sheetRes?.success ? 'ok' : 'err'
  );

  // 3. Meetime: marcar como feito
  if (cancelRequested) return;
  const meetTab = await getTab('https://meetime.com.br/*');
  if (meetTab) {
    await focusTab(meetTab);
    setRun('Meetime: marcando como feito...');
    const doneRes = await safeSend(meetTab.id, { action: 'DONE_ACTIVITY' }, 'content_meetime.js');
    log(doneRes?.success ? '✓ Atividade concluída' : '⚠ Clique "Concluir" manualmente na Meetime', doneRes?.success ? 'ok' : 'warn');
  }
}

// ─── Criar grupo de abas
async function createTabGroup(sheetUrl, kommoUrl) {
  try {
    const groups = await chrome.tabGroups.query({});
    if (groups.find(g => g.title === 'Bibly')) return { success: true, existing: true };

    const urls = ['https://meetime.com.br/dashboard/prospector/leads'];
    if (kommoUrl) urls.push(`https://${kommoUrl}/chats/`);
    if (sheetUrl) urls.push(sheetUrl);

    const tabs = await Promise.all(urls.map(url => chrome.tabs.create({ url, active: false })));
    const gid  = await chrome.tabs.group({ tabIds: tabs.map(t => t.id) });
    await chrome.tabGroups.update(gid, { title: 'Bibly', color: 'purple' });
    return { success: true, count: urls.length };
  } catch(e) {
    return { success: false, error: e.message };
  }
}
