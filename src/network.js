// network.js
// WebSocket-клиент. Всё общение с сервером через этот модуль.
// При подключении передаёт токен авторизации в hello-сообщении.

const WS_URL = (() => {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const host  = location.hostname === 'localhost' ? 'localhost:8080' : location.host;
  return `${proto}://${host}/ws`;
})();

const RECONNECT_DELAY_MS = 3000;
const NEEDS_SYNC_MS      = 5000;

let _ws             = null;
let _myId           = null;
let _handlers       = {};
let _reconnectTimer = null;
let _needsSyncTimer = null;
let _needsGetter    = null;
let _charData       = null;

// ─── Публичный API ────────────────────────────────────────────────────────────

export function connect(charData) {
  _charData = charData;
  _open();
}

export function disconnect() {
  if (_reconnectTimer) clearTimeout(_reconnectTimer);
  if (_needsSyncTimer) clearInterval(_needsSyncTimer);
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

export function setNeedsGetter(fn) { _needsGetter = fn; }

// ─── Внутренние функции ───────────────────────────────────────────────────────

function _open() {
  if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) return;

  console.log(`[net] подключаемся к ${WS_URL}`);
  _ws = new WebSocket(WS_URL);

  _ws.onopen = () => {
    console.log('[net] соединение установлено');

    // Добавляем токен авторизации в hello-сообщение
    const token = localStorage.getItem('warrcats_token');
    _ws.send(JSON.stringify({
      type: 'hello',
      payload: { ...(_charData ?? {}), token },
    }));

    if (_needsSyncTimer) clearInterval(_needsSyncTimer);
    _needsSyncTimer = setInterval(_syncNeeds, NEEDS_SYNC_MS);
  };

  _ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }

    if (msg.type === 'init') {
      _myId = msg.payload?.myId ?? null;
    }

    const fn = _handlers[msg.type];
    if (fn) fn(msg.payload);
  };

  _ws.onclose = (e) => {
    console.warn(`[net] закрыто (code=${e.code}), переподключение через ${RECONNECT_DELAY_MS}мс`);
    if (_needsSyncTimer) clearInterval(_needsSyncTimer);
    _reconnectTimer = setTimeout(_open, RECONNECT_DELAY_MS);
  };

  _ws.onerror = (e) => {
    console.error('[net] ошибка WebSocket', e);
    _ws.close();
  };
}

function _syncNeeds() {
  if (!_needsGetter) return;
  const needs = _needsGetter();
  if (needs) send('needs_sync', needs);
}
