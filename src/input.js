import { cyclePeriod } from './day-night-cycle.js';
import { levelUpRank, getRank } from './menu/xp-system.js';
import { refreshActivePanel } from './menu/bottom-menu.js';

export const keys = { left: false, right: false, up: false, down: false, space: false };

// Флаг для гарантии что обработчик добавляется только один раз
let inputInitialized = false;

// Колбэк, вызываемый при нажатии клавиши E (удар по ближайшему врагу/добыче
// в радиусе) — устанавливается из main.js через setStrikeHandler()
let strikeHandler = null;
export function setStrikeHandler(handler) {
  strikeHandler = handler;
}

export function setupInput() {
  // Если обработчик уже добавлен, не добавляем его снова
  if (inputInitialized) return;
  inputInitialized = true;

  const keyMap = {
    ArrowLeft: 'left',  KeyA: 'left',
    ArrowRight:'right', KeyD: 'right',
    ArrowUp:   'up',    KeyW: 'up',
    ArrowDown: 'down',  KeyS: 'down',
    Space: 'space'
  };

  window.addEventListener('keydown', (e) => {
    // Не перехватываем клавиши если фокус в текстовом поле / select
    const tag = document.activeElement?.tagName;
    const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      || document.activeElement?.isContentEditable;

    const dir = keyMap[e.code];
    if (dir) {
      if (!isTyping) {
        keys[dir] = true;
        e.preventDefault();
      }
    }

    // Удар (по лисе / кролику в радиусе) по нажатию E
    if (e.code === 'KeyE' && !e.repeat && !isTyping) {
      if (strikeHandler) strikeHandler();
    }

    // Ручная смена времени суток по нажатию P
    if (e.code === 'KeyP' && !e.repeat && !isTyping) {
      cyclePeriod();
    }

    // Повышение уровня силы (звания) по нажатию K
    if (e.code === 'KeyK' && !e.repeat && !isTyping) {
      const result = levelUpRank();
      refreshActivePanel();
      if (result && result.leveledUp) {
        showLevelUpNotification(`⚔️ Новое звание: ${getRank().name}!`);
      } else {
        showLevelUpNotification('Достигнуто максимальное звание — Легенда');
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    const dir = keyMap[e.code];
    if (dir) keys[dir] = false;
  });
}

// Небольшое всплывающее уведомление о смене звания (по нажатию K)
function showLevelUpNotification(text) {
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);'
    + 'background:rgba(58,47,30,0.97);border:2px solid #8B5A2B;color:#ffcc80;'
    + 'padding:12px 28px;border-radius:10px;font-size:15px;z-index:9999;pointer-events:none;';
  banner.textContent = text;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 2000);
}