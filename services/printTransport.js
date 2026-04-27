/**
 * services/printTransport.js
 * Pub/sub SSE em memória por device_id. Cada device pode ter N streams
 * (improvável mas seguro). Usado por routes/print-jobs#GET /stream.
 */
const EventEmitter = require('events');

const _bus = new EventEmitter();
_bus.setMaxListeners(0);

/** Envia evento a um device específico. */
function publishToDevice(deviceId, event, data) {
  _bus.emit(`device:${deviceId}`, { event, data });
}

/** Broadcast para todos os devices de uma loja (ex: setores que viraram invalid). */
function publishToLoja(lojaId, event, data) {
  _bus.emit(`loja:${lojaId}`, { event, data });
}

/**
 * Inscreve um listener para um device. Retorna função para cancelar.
 */
function subscribeDevice(deviceId, lojaId, listener) {
  const devChan = `device:${deviceId}`;
  const lojaChan = `loja:${lojaId}`;
  _bus.on(devChan, listener);
  _bus.on(lojaChan, listener);
  return () => {
    _bus.off(devChan, listener);
    _bus.off(lojaChan, listener);
  };
}

module.exports = { publishToDevice, publishToLoja, subscribeDevice };
