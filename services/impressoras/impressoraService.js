/**
 * services/impressoras/impressoraService.js
 * Comunicação real com impressoras térmicas ESC/POS
 *
 * BUGS corrigidos vs versão anterior:
 * 1. ESC/POS enviava strings literais tipo '\\x1B\\x40' em vez de bytes reais.
 *    Fix: usar Buffer.from([0x1B, 0x40]) para cada comando.
 * 2. WMIC era parseado com split('\\n') (2 chars) em vez de /\r?\n/ (newline real).
 *    Fix: usar format:csv e regex correto.
 * Novo: escanearRedeLocal() — varre subnet local por IP, porta 9100.
 * Novo: testarIpDireto() — testa IP antes de salvar no banco.
 */

const net  = require('net');
const os   = require('os');
const { exec } = require('child_process');

// ─── ESC/POS byte constants ───────────────────────────────────────────────────
const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

// ─── Detect local subnet from network interfaces ──────────────────────────────
function getLocalSubnet() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.');
        return { subnet: parts.slice(0, 3).join('.') + '.', myIp: iface.address };
      }
    }
  }
  return { subnet: '192.168.1.', myIp: null };
}

// ─── Probe a single IP:port (fast, low timeout) ───────────────────────────────
function _probePort(ip, porta, timeoutMs) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(timeoutMs);
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.on('error',   () => { s.destroy(); resolve(false); });
    s.connect(porta, ip);
  });
}

// ─── 1. Ping / test a network printer by IP:port ─────────────────────────────
function pingImpressoraRede(ip, porta = 9100, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      socket.destroy();
      resolve({ ok: true, status: 'online', message: `Conexão TCP OK com ${ip}:${porta}` });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ok: false, status: 'offline', message: `Timeout: ${ip}:${porta} não respondeu em ${timeoutMs}ms` });
    });
    socket.on('error', (err) => {
      socket.destroy();
      resolve({ ok: false, status: 'erro', message: `Erro TCP: ${err.message}` });
    });
    socket.connect(parseInt(porta, 10) || 9100, ip);
  });
}

// ─── 2. Test arbitrary IP:port without DB (used by modal "Testar antes de salvar") ──
function testarIpDireto(ip, porta = 9100) {
  return pingImpressoraRede(ip, parseInt(porta, 10) || 9100, 4000);
}

// ─── 3. Scan local subnet for ESC/POS printers ───────────────────────────────
// Probes IPs .1 through .254 in batches of 40 concurrent connections.
// Timeout per probe: 800ms. Full scan of 254 IPs ≈ 5-7 seconds.
async function escanearRedeLocal(faixaManual, porta = 9100) {
  const { subnet, myIp } = getLocalSubnet();
  const base = faixaManual || subnet;
  const portaInt = parseInt(porta, 10) || 9100;

  console.log(`[ImpressoraService] Scan iniciado: ${base}1-254 porta ${portaInt}`);

  const encontradas = [];
  const BATCH = 40;

  for (let i = 1; i <= 254; i += BATCH) {
    const wave = [];
    for (let j = i; j < Math.min(i + BATCH, 255); j++) {
      const ip = base + j;
      wave.push(_probePort(ip, portaInt, 800).then(ok => ok ? ip : null));
    }
    const results = await Promise.all(wave);
    results.filter(Boolean).forEach(ip => encontradas.push(ip));
  }

  console.log(`[ImpressoraService] Scan concluído — encontradas: [${encontradas.join(', ') || 'nenhuma'}]`);

  return {
    ok: true,
    subnet: base,
    myIp,
    porta: portaInt,
    encontradas,
    total: encontradas.length,
    message: encontradas.length
      ? `${encontradas.length} impressora(s) encontrada(s) na rede`
      : `Nenhuma impressora encontrada na faixa ${base}1-254 (porta ${portaInt})`,
  };
}

// ─── 4. Scan Windows printers via WMIC / PowerShell ──────────────────────────
function scanImpressorasWindows() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      return resolve({ ok: false, impressoras: [], message: 'Auto-scan USB só disponível no Windows.' });
    }

    // Try WMIC CSV first (more reliable than /value format)
    exec('wmic printer get Name,PortName,PrinterStatus /format:csv', { timeout: 10000 }, (err, stdout) => {
      if (!err && stdout && stdout.includes(',')) {
        const printers = _parseWmicCsv(stdout);
        if (printers.length > 0) return resolve({ ok: true, impressoras: printers });
      }

      // Fallback: PowerShell Get-Printer
      const psCmd = 'powershell -NoProfile -Command "Get-Printer | Select-Object Name,PortName,PrinterStatus | ConvertTo-Csv -NoTypeInformation"';
      exec(psCmd, { timeout: 12000 }, (err2, out2) => {
        if (err2) {
          return resolve({ ok: false, impressoras: [], message: 'Falha no WMIC e PowerShell. Execute o servidor como administrador.' });
        }
        const printers = _parsePowershellCsv(out2);
        resolve({ ok: true, impressoras: printers });
      });
    });
  });
}

function _parseWmicCsv(csv) {
  // WMIC CSV format: Node,Name,PortName,PrinterStatus
  const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('Node,Node'));
  const result = [];
  for (const line of lines) {
    if (!line || line.startsWith('Node')) continue;
    const parts = line.split(',');
    // parts: [node, name, portname, status] — positions may vary, skip header
    if (parts.length < 3) continue;
    const nome = parts[1]?.trim();
    const portaWin = parts[2]?.trim();
    const status = parts[3]?.trim();
    if (!nome || nome === 'Name') continue;
    const isNetworkPort = /^IP_|^\d{1,3}\.\d{1,3}/.test(portaWin || '');
    result.push({
      nome,
      portaWindows: portaWin || '',
      tipo_conexao: isNetworkPort ? 'rede' : 'windows',
      status: status === '3' ? 'online' : 'desconhecido',
    });
  }
  return result;
}

function _parsePowershellCsv(csv) {
  const lines = csv.split(/\r?\n/).map(l => l.replace(/"/g, '').trim()).filter(l => l);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.toLowerCase());
  const nameIdx = headers.indexOf('name');
  const portIdx = headers.indexOf('portname');
  if (nameIdx === -1) return [];
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    const nome = cols[nameIdx]?.trim() || '';
    const portaWin = cols[portIdx]?.trim() || '';
    if (!nome) return null;
    const isNetworkPort = /^IP_|^\d{1,3}\.\d{1,3}/.test(portaWin);
    return { nome, portaWindows: portaWin, tipo_conexao: isNetworkPort ? 'rede' : 'windows', status: 'desconhecido' };
  }).filter(Boolean);
}

// ─── 5. Build ESC/POS test ticket as binary Buffer ───────────────────────────
// Uses real binary bytes — NOT string escape sequences.
function _buildTestTicket(larguraMm = 80) {
  const cols = larguraMm === 58 ? 32 : 48;
  const sep  = '-'.repeat(cols);
  const now  = new Date().toLocaleString('pt-BR');

  return Buffer.concat([
    Buffer.from([ESC, 0x40]),             // ESC @ — initialize
    Buffer.from([ESC, 0x61, 0x01]),        // ESC a 1 — center align
    Buffer.from([ESC, 0x45, 0x01]),        // ESC E 1 — bold on
    Buffer.from('PITOMBO LANCHES\n'),
    Buffer.from([ESC, 0x45, 0x00]),        // ESC E 0 — bold off
    Buffer.from('* TICKET DE TESTE *\n\n'),
    Buffer.from([ESC, 0x61, 0x00]),        // ESC a 0 — left align
    Buffer.from(sep + '\n'),
    Buffer.from(`Data: ${now}\n`),
    Buffer.from(`Largura: ${larguraMm}mm | Porta TCP: 9100\n`),
    Buffer.from('Impressora configurada com sucesso!\n'),
    Buffer.from('Pitombo Lanches - PDV Local\n'),
    Buffer.from(sep + '\n'),
    Buffer.from([LF, LF, LF]),             // feed 3 lines before cut
    Buffer.from([GS, 0x56, 0x00]),         // GS V 0 — full cut
  ]);
}

// ─── 6. Send test ticket via TCP (ESC/POS raw, port 9100) ────────────────────
function enviarTesteRede(ip, porta = 9100, larguraMm = 80) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.on('connect', () => {
      const ticket = _buildTestTicket(parseInt(larguraMm, 10) || 80);
      socket.write(ticket, () => {
        // Brief pause so printer can process before we close the socket
        setTimeout(() => {
          socket.destroy();
          resolve({ ok: true, message: `Ticket enviado para ${ip}:${porta} via TCP com sucesso.` });
        }, 800);
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ok: false, message: `Timeout: ${ip}:${porta} não respondeu em 5 segundos.` });
    });

    socket.on('error', (err) => {
      socket.destroy();
      resolve({ ok: false, message: `Erro TCP: ${err.message}` });
    });

    socket.connect(parseInt(porta, 10) || 9100, ip);
  });
}

// ─── 7. Send test print via Windows Spooler (USB/LPT) ────────────────────────
function enviarTesteWindows(printerName) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      return resolve({ ok: false, message: 'Spooler local requer Windows.' });
    }
    const fs   = require('fs');
    const path = require('path');
    const osSys = require('os');

    const ticketFile = path.join(osSys.tmpdir(), 'pitombo_teste_print.txt');
    const conteudo = [
      '',
      '      PITOMBO LANCHES',
      '      TICKET DE TESTE',
      '--------------------------------',
      'Data: ' + new Date().toLocaleString('pt-BR'),
      'Impressora: ' + printerName,
      '',
      'Comunicacao via Windows Spooler',
      'estabelecida com sucesso!',
      '--------------------------------',
      '', '', '',
    ].join('\r\n');

    try {
      fs.writeFileSync(ticketFile, conteudo, 'utf8');
      // Escape single quotes for PowerShell
      const safeName = printerName.replace(/'/g, "''");
      const cmd = `powershell -NoProfile -Command "Get-Content '${ticketFile}' | Out-Printer -Name '${safeName}'"`;
      exec(cmd, { timeout: 15000 }, (err) => {
        if (err) return resolve({ ok: false, message: 'PowerShell Out-Printer: ' + err.message });
        resolve({ ok: true, message: `Teste enviado para fila Windows: ${printerName}` });
      });
    } catch (e) {
      resolve({ ok: false, message: 'Erro ao criar buffer local: ' + e.message });
    }
  });
}

module.exports = {
  pingImpressoraRede,
  testarIpDireto,
  escanearRedeLocal,
  scanImpressorasWindows,
  enviarTesteRede,
  enviarTesteWindows,
  getLocalSubnet,
};
