/**
 * AutoPrint Pitombo — app.js (Renderer process)
 * 
 * Handles: pairing flow, SSE connection, print job processing, UI state
 */

let serverUrl = '';
let deviceToken = '';
let deviceId = null;
let sseConnection = null;
let heartbeatTimer = null;
let setoresDoServidor = [];
let setoresAtivos = new Set();
let localPrinters = [];
let selectedPrinter = '';
const logEntries = [];

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════
(async function init() {
  console.log('[renderer] window.autoprint =', window.autoprint);
  if (!window.autoprint) {
    const el = document.getElementById('login-status');
    if (el) el.textContent = 'Erro fatal: bridge Electron indisponível. Reinstale o app.';
    return;
  }
  serverUrl   = (await window.autoprint.getConfig('serverUrl')) || '';
  deviceToken = (await window.autoprint.getConfig('deviceToken')) || '';
  deviceId    = (await window.autoprint.getConfig('deviceId')) || null;
  selectedPrinter = (await window.autoprint.getConfig('selectedPrinter')) || '';

  const savedSetores = (await window.autoprint.getConfig('setoresAtivos')) || [];
  setoresAtivos = new Set(savedSetores);

  if (serverUrl && deviceToken) {
    document.getElementById('server-url').value = serverUrl;
    showDashboard();
  }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SCREENS
// ═══════════════════════════════════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showDashboard() {
  showScreen('screen-dashboard');
  document.getElementById('server-display').textContent = serverUrl;
  connectSSE();
  startHeartbeat();
  refreshPrinters();
  loadSetores();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAIRING
// ═══════════════════════════════════════════════════════════════════════════════
async function doPairing() {
  const btn = document.getElementById('btn-pair');
  const statusEl = document.getElementById('login-status');

  if (!window.autoprint) {
    statusEl.textContent = 'Erro: window.autoprint indisponível (preload não carregado)';
    return;
  }

  const urlInput = document.getElementById('server-url').value.trim().replace(/\/+$/, '');
  const code = document.getElementById('pair-code').value.trim().toUpperCase();

  if (!urlInput) { statusEl.textContent = 'Informe o endereço do servidor'; return; }
  if (!code || code.length < 4) { statusEl.textContent = 'Código inválido'; return; }

  btn.disabled = true;
  btn.textContent = '⏳ Pareando...';
  statusEl.textContent = '';
  statusEl.classList.remove('ok');

  try {
    const result = await window.autoprint.pairDevice({ server: urlInput, code });

    if (!result || !result.ok) {
      statusEl.textContent = (result && result.error) || 'Código inválido ou expirado';
      return;
    }

    serverUrl = result.server;
    deviceToken = result.device_token;
    deviceId = result.device?.id || null;

    statusEl.textContent = '✅ Pareado com sucesso!';
    statusEl.classList.add('ok');

    setTimeout(() => showDashboard(), 800);
  } catch (e) {
    statusEl.textContent = 'Erro: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '🔗 Parear com o servidor';
  }
}
// Expose to onclick
window.doPairing = doPairing;

// ═══════════════════════════════════════════════════════════════════════════════
// SSE — Receive print jobs
// ═══════════════════════════════════════════════════════════════════════════════
function connectSSE() {
  if (sseConnection) { sseConnection.close(); sseConnection = null; }
  if (!serverUrl || !deviceToken) return;

  const badge = document.getElementById('conn-badge');
  badge.className = 'badge offline';
  badge.textContent = '● Conectando...';

  const url = `${serverUrl}/api/print-jobs/stream?token=${encodeURIComponent(deviceToken)}`;
  sseConnection = new EventSource(url);

  sseConnection.onopen = () => {
    badge.className = 'badge online';
    badge.textContent = '● Conectado';
    addLog('Conectado ao servidor');
  };

  sseConnection.addEventListener('job.new', (e) => {
    try {
      const job = JSON.parse(e.data);
      addLog(`Job #${job.id} recebido — setor: ${job.setor || 'geral'}`);
      processJob(job);
    } catch (err) {
      addLog('Erro ao processar job: ' + err.message, true);
    }
  });

  sseConnection.addEventListener('heartbeat', () => {
    // SSE keepalive, ignore
  });

  sseConnection.onerror = () => {
    badge.className = 'badge offline';
    badge.textContent = '● Desconectado';
    addLog('Conexão perdida — reconectando em 5s...', true);
    setTimeout(() => connectSSE(), 5000);
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEARTBEAT
// ═══════════════════════════════════════════════════════════════════════════════
function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, 60000); // every 60s
}

async function sendHeartbeat() {
  if (!serverUrl || !deviceToken) return;
  try {
    await fetch(`${serverUrl}/api/devices/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Token': deviceToken
      },
      body: JSON.stringify({})
    });
    document.getElementById('heartbeat-display').textContent =
      'Último heartbeat: ' + new Date().toLocaleTimeString('pt-BR');
  } catch (_) {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRINTERS
// ═══════════════════════════════════════════════════════════════════════════════
async function refreshPrinters() {
  const container = document.getElementById('printers-list');
  container.innerHTML = '<div class="empty">Detectando impressoras...</div>';

  localPrinters = await window.autoprint.getPrinters();

  if (!localPrinters.length) {
    container.innerHTML = '<div class="empty">Nenhuma impressora detectada no Windows</div>';
    return;
  }

  container.innerHTML = localPrinters.map(p => {
    const isSelected = p.Name === selectedPrinter;
    return `
    <div class="printer-item" style="${isSelected ? 'border:1px solid #4ade80;' : ''}">
      <span class="name">${p.Name}</span>
      <span class="port">${p.PortName || ''}</span>
      <button class="btn-sm ${isSelected ? 'primary' : ''}" onclick="selectPrinter('${p.Name.replace(/'/g, "\\'")}')">
        ${isSelected ? '✅ Selecionada' : 'Selecionar'}
      </button>
      <button class="btn-sm" onclick="testPrint('${p.Name.replace(/'/g, "\\'")}')">🖨️ Teste</button>
    </div>`;
  }).join('');
}
window.refreshPrinters = refreshPrinters;

async function selectPrinter(name) {
  selectedPrinter = name;
  await window.autoprint.setConfig('selectedPrinter', name);
  refreshPrinters();
  addLog(`Impressora selecionada: ${name}`);
}
window.selectPrinter = selectPrinter;

async function testPrint(name) {
  addLog(`Teste de impressão → ${name}`);
  const text = [
    '================================',
    '    AUTOPRINT PITOMBO',
    '    Teste de Impressão',
    '================================',
    '',
    `Impressora: ${name}`,
    `Data: ${new Date().toLocaleString('pt-BR')}`,
    '',
    '  Se este texto apareceu,',
    '  a impressora funciona!',
    '',
    '================================',
    '',
    '',
  ].join('\n');

  const result = await window.autoprint.printTest({ printer: name, text });
  if (result.ok) {
    addLog(`✅ Teste impresso em ${name}`);
  } else {
    addLog(`❌ Falha no teste: ${result.error}`, true);
  }
}
window.testPrint = testPrint;

// ═══════════════════════════════════════════════════════════════════════════════
// SETORES
// ═══════════════════════════════════════════════════════════════════════════════
async function loadSetores() {
  const container = document.getElementById('setores-config');
  if (!serverUrl || !deviceToken) {
    container.innerHTML = '<div class="empty">Conecte-se primeiro</div>';
    return;
  }

  try {
    const res = await fetch(`${serverUrl}/api/setores`, {
      headers: { 'Authorization': `DeviceToken ${deviceToken}` }
    });
    setoresDoServidor = await res.json();

    if (!setoresDoServidor.length) {
      container.innerHTML = '<div class="empty">Nenhum setor configurado no servidor</div>';
      return;
    }

    container.innerHTML = setoresDoServidor.map(s => {
      const isActive = setoresAtivos.has(s.nome);
      return `<div class="setor-chip ${isActive ? 'active' : ''}" onclick="toggleSetor('${s.nome.replace(/'/g, "\\'")}')">${isActive ? '✅ ' : ''}${s.nome}</div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = `<div class="empty" style="color:#fca5a5;">Erro: ${e.message}</div>`;
  }
}

async function toggleSetor(nome) {
  if (setoresAtivos.has(nome)) {
    setoresAtivos.delete(nome);
  } else {
    setoresAtivos.add(nome);
  }
  await window.autoprint.setConfig('setoresAtivos', [...setoresAtivos]);
  loadSetores();
  addLog(`Setores ativos: ${[...setoresAtivos].join(', ') || 'nenhum'}`);
}
window.toggleSetor = toggleSetor;

// ═══════════════════════════════════════════════════════════════════════════════
// PROCESS PRINT JOB
// ═══════════════════════════════════════════════════════════════════════════════
async function processJob(job) {
  // Check if this job's setor is in our active set
  const jobSetor = job.setor || 'geral';
  if (setoresAtivos.size > 0 && !setoresAtivos.has(jobSetor)) {
    addLog(`Job #${job.id} ignorado (setor "${jobSetor}" não ativo neste device)`);
    return;
  }

  if (!selectedPrinter) {
    addLog(`⚠ Job #${job.id} — nenhuma impressora selecionada!`, true);
    ackJob(job.id, 'failed', 'Nenhuma impressora selecionada');
    return;
  }

  // Acknowledge receipt
  ackJob(job.id, 'delivered');

  // Build ticket text
  const text = job.payload || job.conteudo || buildDefaultTicket(job);

  addLog(`Imprimindo job #${job.id} em ${selectedPrinter}...`);
  const result = await window.autoprint.printTest({ printer: selectedPrinter, text });

  if (result.ok) {
    addLog(`✅ Job #${job.id} impresso`);
    ackJob(job.id, 'printed');
  } else {
    addLog(`❌ Job #${job.id} falhou: ${result.error}`, true);
    ackJob(job.id, 'failed', result.error);
  }
}

function buildDefaultTicket(job) {
  const lines = [
    '================================',
    `    PEDIDO #${job.pedido_id || '?'}`,
    '================================',
    `Setor: ${job.setor || 'geral'}`,
    `Hora: ${new Date().toLocaleString('pt-BR')}`,
    '--------------------------------',
  ];

  if (job.itens && Array.isArray(job.itens)) {
    job.itens.forEach(item => {
      lines.push(`${item.qtd || 1}x ${item.nome || item.name}`);
      if (item.obs) lines.push(`   obs: ${item.obs}`);
    });
  }

  lines.push('--------------------------------');
  lines.push('');
  lines.push('');
  return lines.join('\n');
}

async function ackJob(jobId, status, errorMsg) {
  if (!serverUrl || !deviceToken) return;
  try {
    const pathMap = {
      'delivered': 'ack',
      'printed':   'printed',
      'failed':    'failed',
    };
    const endpoint = pathMap[status];
    if (!endpoint) return;

    await fetch(`${serverUrl}/api/print-jobs/${jobId}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Token': deviceToken
      },
      body: JSON.stringify({ mensagem: errorMsg })
    });
  } catch (_) {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════════════════════════════════════════════
async function doLogout() {
  if (!confirm('Desconectar este device do servidor?')) return;
  if (sseConnection) sseConnection.close();
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  await window.autoprint.deleteConfig('serverUrl');
  await window.autoprint.deleteConfig('deviceToken');
  await window.autoprint.deleteConfig('deviceId');
  serverUrl = '';
  deviceToken = '';
  deviceId = null;
  showScreen('screen-login');
}
window.doLogout = doLogout;

// ═══════════════════════════════════════════════════════════════════════════════
// LOG
// ═══════════════════════════════════════════════════════════════════════════════
function addLog(msg, isError = false) {
  const now = new Date().toLocaleTimeString('pt-BR');
  logEntries.unshift({ time: now, msg, isError });
  if (logEntries.length > 50) logEntries.pop();

  const container = document.getElementById('print-log');
  if (!container) return;
  container.innerHTML = logEntries.map(e =>
    `<div class="log-entry ${e.isError ? 'error' : ''}"><span class="time">${e.time}</span>${e.msg}</div>`
  ).join('');
}
