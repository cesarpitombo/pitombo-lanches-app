/**
 * preload.js — Bridge between Electron main and renderer
 */
const { contextBridge, ipcRenderer } = require('electron');

console.log('[preload] loading autoprint bridge...');

try {
  contextBridge.exposeInMainWorld('autoprint', {
  // Config store
  getConfig:    (key) => ipcRenderer.invoke('store:get', key),
  setConfig:    (key, val) => ipcRenderer.invoke('store:set', key, val),
  deleteConfig: (key) => ipcRenderer.invoke('store:delete', key),

  // Pairing / device API (server-talking lives in main)
  pairDevice:  (data) => ipcRenderer.invoke('autoprint:pair-device', data),
  getPrinters: () => ipcRenderer.invoke('autoprint:get-printers'),
  printTest:   (data) => ipcRenderer.invoke('autoprint:print-test', data),
  onStatus:    (cb) => ipcRenderer.on('autoprint:status', (_e, data) => cb(data)),

  // Backward-compat aliases
  listPrinters: () => ipcRenderer.invoke('autoprint:get-printers'),
  print:        (printerName, text) => ipcRenderer.invoke('autoprint:print-test', { printer: printerName, text }),

  // System info
  getHostname: () => ipcRenderer.invoke('sys:hostname'),
  });
  console.log('[preload] autoprint bridge exposed OK');
} catch (err) {
  console.error('[preload] FAILED to expose autoprint bridge:', err);
}
