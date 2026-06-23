// chat.js  (рядом с main.js)
// Оверлей чата: поле ввода + история сообщений.
// Enter открывает/закрывает ввод. T — альтернативный триггер.
// Импортирует send из network.js для отправки.

import { send } from './network.js';
import { showToast } from './notify.js';

const MAX_MESSAGES = 80; // максимум в DOM

let _chatEl   = null; // обёртка чата
let _inputEl  = null; // поле ввода
let _logEl    = null; // список сообщений
let _isOpen   = false;

// Создать DOM-элемент чата (вызывать один раз при старте игры)
export function initChat() {
  if (_chatEl) return;

  _chatEl = document.createElement('div');
  _chatEl.id = 'chat-overlay';
  _chatEl.style.cssText = `
    position: fixed; left: 16px; bottom: 110px;
    width: 320px; z-index: 140;
    font-family: Arial, sans-serif; font-size: 13px;
    pointer-events: none;
  `;

  // История сообщений
  _logEl = document.createElement('div');
  _logEl.style.cssText = `
    max-height: 180px; overflow-y: auto;
    display: flex; flex-direction: column; gap: 3px;
    margin-bottom: 6px;
  `;

  // Поле ввода (скрыто пока не нажат Enter/T)
  _inputEl = document.createElement('input');
  _inputEl.type = 'text';
  _inputEl.placeholder = 'Написать… (Enter — отправить, Esc — закрыть)';
  _inputEl.maxLength = 200;
  _inputEl.style.cssText = `
    width: 100%; box-sizing: border-box;
    background: rgba(15,25,15,0.92); border: 2px solid #8B5A2B;
    border-radius: 8px; color: #ffcc80; padding: 7px 12px;
    font-size: 13px; font-family: Arial, sans-serif;
    outline: none; display: none; pointer-events: all;
  `;

  _inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      _sendMessage();
      e.preventDefault();
    }
    if (e.key === 'Escape') {
      _closeInput();
      e.preventDefault();
    }
    e.stopPropagation(); // не пропускаем в keys (движение персонажа)
  });

  _chatEl.appendChild(_logEl);
  _chatEl.appendChild(_inputEl);
  document.body.appendChild(_chatEl);

  // Клавиша Enter/T открывает ввод
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'Enter' || e.key === 't' || e.key === 'T') {
      if (!_isOpen) {
        _openInput();
        e.preventDefault();
      }
    }
  });
}

// Показать входящее сообщение (вызывается из обработчика 'chat_msg')
export function receiveMessage({ senderId, name, text }) {
  _appendMessage(name, text, false);
  // Тост если чат закрыт
  if (!_isOpen) {
    showToast(`${name}: ${text}`, { duration: 3000, fontSize: 13 });
  }
}

// Загрузить историю при подключении (из init.chat[])
export function loadHistory(messages) {
  messages.forEach(m => _appendMessage(m.sender_name, m.text, false));
}

function _openInput() {
  _isOpen = true;
  _inputEl.style.display = 'block';
  _inputEl.style.pointerEvents = 'all';
  _inputEl.focus();
}

function _closeInput() {
  _isOpen = false;
  _inputEl.style.display = 'none';
  _inputEl.value = '';
  _inputEl.blur();
}

function _sendMessage() {
  const text = _inputEl.value.trim();
  if (!text) { _closeInput(); return; }

  send('chat', { text });
  _appendMessage('Ты', text, true);
  _closeInput();
}

function _appendMessage(name, text, isSelf) {
  const el = document.createElement('div');
  el.style.cssText = `
    background: rgba(15,25,15,0.82); border-radius: 6px;
    padding: 4px 8px; color: ${isSelf ? '#8fd14f' : '#ffcc80'};
    max-width: 100%; word-break: break-word;
    border-left: 2px solid ${isSelf ? '#8fd14f' : '#8B5A2B'};
  `;
  el.innerHTML = `<b style="color:${isSelf ? '#8fd14f' : '#e8b060'}">${_esc(name)}</b>: ${_esc(text)}`;

  // Авто-скрытие сообщения через 30 сек
  setTimeout(() => {
    el.style.transition = 'opacity 1s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 1000);
  }, 30_000);

  _logEl.appendChild(el);

  // Ограничиваем количество DOM-элементов
  while (_logEl.children.length > MAX_MESSAGES) {
    _logEl.firstChild.remove();
  }

  // Прокрутка вниз
  _logEl.scrollTop = _logEl.scrollHeight;
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Скрыть/показать весь оверлей (например, когда открыто меню ESC)
export function hideChatOverlay()  { if (_chatEl) _chatEl.style.display = 'none';  }
export function showChatOverlay()  { if (_chatEl) _chatEl.style.display = 'block'; }
