/**
 * AutoPrint Pitombo — main.js (Electron main process)
 * 
 * Handles: window creation, system tray, IPC bridge
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store({ name: 'autoprint-config' });

let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 700,
    minWidth: 420,
    minHeight: 600,
    resizable: true,
    title: 'AutoPrint Pitombo',
    backgroundColor: '#111111',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  if (process.env.AUTOPRINT_DEBUG === '1' || !app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Create a simple 16x16 tray icon programmatically
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMklEQVQ4T2NkoBAwUqifAWqA' +
      'IjYDUL2A1QCYIbhcgdUA0gyBuQLFAFwuwGoA2W4AAAB+xQwRH4GkIAAAAABJRU5ErkJggg==',
      'base64'
    )
  );
  try {
    tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Abrir AutoPrint', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Sair', click: () => { app.isQuitting = true; app.quit(); } }
  ]);

    tray.setToolTip('AutoPrint Pitombo');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => mainWindow?.show());
  } catch (e) {
    console.warn('Tray icon error (não crítico):', e.message);
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

// System info
ipcMain.handle('sys:hostname', () => require('os').hostname());

// Persist/load config
ipcMain.handle('store:get', (_, key) => store.get(key));
ipcMain.handle('store:set', (_, key, val) => store.set(key, val));
ipcMain.handle('store:delete', (_, key) => store.delete(key));

// List Windows printers via PowerShell
async function listWindowsPrinters() {
  const { execSync } = require('child_process');
  try {
    const raw = execSync(
      'powershell -Command "Get-Printer | Select-Object Name, PrinterStatus, PortName | ConvertTo-Json"',
      { encoding: 'utf-8', timeout: 10000 }
    );
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    console.error('Erro ao listar impressoras:', e.message);
    return [];
  }
}

async function printToWindows(printerName, text) {
  const { execSync } = require('child_process');
  const fs = require('fs');
  const os = require('os');
  const tmpFile = path.join(os.tmpdir(), `autoprint_${Date.now()}.txt`);
  try {
    fs.writeFileSync(tmpFile, text, 'utf-8');
    const cmd = `powershell -Command "Get-Content '${tmpFile}' | Out-Printer '${printerName}'"`;
    execSync(cmd, { timeout: 15000 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
}

ipcMain.handle('autoprint:get-printers', () => listWindowsPrinters());
ipcMain.handle('autoprint:print-test', (_e, payload = {}) => {
  const printer = payload.printer || payload.printerName;
  const text = payload.text || [
    '================================',
    '    AUTOPRINT PITOMBO',
    '    Teste de Impressão',
    '================================',
    '', `Impressora: ${printer}`,
    `Data: ${new Date().toLocaleString('pt-BR')}`,
    '', '', '',
  ].join('\n');
  if (!printer) return { ok: false, error: 'Impressora não informada' };
  return printToWindows(printer, text);
});

// Pair-device: fetch backend, save token to store
ipcMain.handle('autoprint:pair-device', async (_e, data = {}) => {
  try {
    const server = String(data.server || '').trim().replace(/\/+$/, '');
    const code = String(data.code || '').trim().toUpperCase();
    if (!server) return { ok: false, error: 'Endereço do servidor obrigatório' };
    if (!code || code.length < 4) return { ok: false, error: 'Código inválido' };

    const res = await fetch(`${server}/api/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo: code,
        nome: data.nome || require('os').hostname() || 'AutoPrint Desktop',
        sistema: 'Windows',
        versao: '1.0.0',
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.device_token) {
      return { ok: false, error: body.error || `HTTP ${res.status}` };
    }

    store.set('serverUrl', server);
    store.set('deviceToken', body.device_token);
    store.set('deviceId', body.device?.id || null);

    if (mainWindow) mainWindow.webContents.send('autoprint:status', { type: 'paired', device: body.device });
    return { ok: true, server, device_token: body.device_token, device: body.device };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // Don't quit on window close (tray keeps running)
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
