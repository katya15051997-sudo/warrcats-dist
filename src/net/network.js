import { getCurrentStateSnapshot } from '../character/character-save.js';

const WS_URL = (() => {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const host  = location.hostname === 'localhost' ? 'localhost:8080' : location.host;
  return `${proto}://${host}/ws`;
})();

const RECONNECT_DELAY_MS = 3000;
const STATE_SYNC_MS      = 3000;

let _ws             = null;
let _myId           = null;
let _handlers       = {};
let _reconnectTimer = null;
let _syncTimer      = null;
let _charId         = null;

export function connect(charIdOrObj) {
  if (typeof charIdOrObj === 'string')      _charId = charIdOrObj;
  else if (charIdOrObj && charIdOrObj.id)   _charId = charIdOrObj.id;
  else                                      _charId = null;
  _open();
}

export function disconnect() {
  if (_reconnectTimer) clearTimeout(_reconnectTimer);
  if (_syncTimer)      clearInterval(_syncTimer);
  if (_ws) { _ws.onclose = null; _ws.close(); _ws = null; }
  _myId = null;
}

export function on(type, fn)  { _handlers[type] = fn; }
export function off(type)     { delete _handlers[type]; }

export function send(type, payload = {}) {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) return false;
  _ws.send(JSON.stringify({ type, payload }));
  return true;
}

export function getMyId()     { return _myId; }
export function isConnected() { return _ws?.readyState === WebSocket.OPEN; }

export function setStateGetter() {}
export function setNeedsGetter() {}

function _open() {
  if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) return;

  if (!_charId) {
    console.warn('[net] нет charId — подключение отменено');
    return;
  }

  console.log(`[net] подключаемся к ${WS_URL}`);
  _ws = new WebSocket(WS_URL);

  _ws.onopen = () => {
    console.log('[net] соединение установлено');
    const token = localStorage.getItem('warrcats_token');
    _ws.send(JSON.stringify({ type: 'hello', payload: { token, charId: _charId } }));

    if (_syncTimer) clearInterval(_syncTimer);
    _syncTimer = setInterval(_syncState, STATE_SYNC_MS);
  };

  _ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }

    if (msg.type === 'init') _myId = msg.payload?.myId ?? null;

    const fn = _handlers[msg.type];
    if (fn) fn(msg.payload);
  };

  _ws.onclose = (e) => {
    console.warn(`[net] закрыто (code=${e.code}), переподключение через ${RECONNECT_DELAY_MS}мс`);
    if (_syncTimer) clearInterval(_syncTimer);
    _reconnectTimer = setTimeout(_open, RECONNECT_DELAY_MS);
  };

  _ws.onerror = (e) => {
    console.error('[net] ошибка WebSocket', e);
    _ws.close();
  };
}

function _syncState() {
  try {
    const state = getCurrentStateSnapshot();
    if (state) send('state_sync', state);
  } catch (e) {
    console.warn('[net] не удалось собрать snapshot:', e.message);
  }
}
