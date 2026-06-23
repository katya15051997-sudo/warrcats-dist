// world-objects.js
// Интерактивные объекты мира: вода, дерево, пень.
// ПКМ по объекту открывает меню действий; выбранное действие
// длится 30 секунд и наращивает соответствующую потребность.

import * as PIXI from 'pixi.js';
import { setDrinking, setSharpening, doTraining } from './menu/needs-system.js';
import { addXp, progressMoveTasks } from './menu/xp-system.js';
import { refreshActivePanel, getNeedValue } from './menu/bottom-menu.js';
import { showToast } from './notify.js';

// Длительность действий с объектами мира (питьё/точение когтей)
const ACTION_DURATION_MS = 30000;
// Длительность тренировки — короче остальных действий
const TRAIN_DURATION_MS = 10000;

// === Конфигурация объектов мира ===
// x, y — координаты в МИРОВЫХ координатах (внутри контейнера world).
// anchor.set(0.5, 1) -> точка (x, y) это нижняя середина картинки ("ножки" объекта на земле).
// ПОДКОРРЕКТИРУЙ координаты под свою карту!
const OBJECTS_CONFIG = [
  {
    type: 'water',
    texture: '/assets/fon/water.png',
    x: 2000,
    y: 700,
    scale: 1,
    actions: [
      {
        id: 'drink',
        label: 'Пить воду',
        start: () => setDrinking(true),
        stop: () => setDrinking(false),
      },
    ],
  },
  {
    type: 'tree',
    texture: '/assets/fon/tree.png',
    x: 700,
    y: 900,
    scale: 1,
    actions: [
      {
        id: 'sharpen_tree',
        label: 'Точить когти',
        start: () => setSharpening(true),
        stop: () => setSharpening(false),
      },
      {
        id: 'train_tree',
        label: 'Потренироваться',
        start: () => {},
        stop: () => {},
        // Награда выдаётся только при завершении полного цикла (30 сек),
        // а не при прерывании движением персонажа
        onComplete: () => {
          doTraining(); // -16% бодрости (или −10% от звания Воин+, см. needs-system.js)
          addXp('train'); // +0.3 xp за тренировку
          progressMoveTasks('train'); // прогресс заданий приёмов ("Потренироваться N раз")
          refreshActivePanel();
        },
      },
    ],
  },
  {
    type: 'stump',
    texture: '/assets/fon/stump.png',
    x: 300,
    y: 1100,
    scale: 1,
    actions: [
      {
        id: 'sharpen_stump',
        label: 'Точить когти',
        start: () => setSharpening(true),
        stop: () => setSharpening(false),
      },
      {
        id: 'train_stump',
        label: 'Потренироваться',
        start: () => {},
        stop: () => {},
        onComplete: () => {
          doTraining(); // -16% бодрости (или −10% от звания Воин+)
          addXp('train'); // +0.3 xp за тренировку
          progressMoveTasks('train');
          refreshActivePanel();
        },
      },
    ],
  },
];

let menuEl = null;
let progressEl = null;
let activeAction = null; // { timeoutId, stop }

// === Публичная функция: создать объекты и добавить их в мир ===
export async function createWorldObjects(world) {
  const sprites = [];

  for (const cfg of OBJECTS_CONFIG) {
    const texture = await PIXI.Assets.load(cfg.texture);
    const sprite = new PIXI.Sprite(texture);

    sprite.anchor.set(0.5, 1);
    sprite.x = cfg.x;
    sprite.y = cfg.y;
    if (cfg.scale) sprite.scale.set(cfg.scale);

    sprite.eventMode = 'static';
    sprite.cursor = 'pointer';

    // ПКМ по объекту -> открыть меню действий
    sprite.on('rightclick', (e) => {
      e.stopPropagation();
      showActionMenu(e, cfg);
    });

    world.addChild(sprite);
    sprites.push(sprite);
  }

  // Закрытие меню по клику вне его
  document.addEventListener('mousedown', handleOutsideClick);

  // Отключаем стандартное контекстное меню браузера над canvas
  document.addEventListener('contextmenu', handleContextMenu);

  return sprites;
}

function handleOutsideClick(e) {
  if (!menuEl) return;
  if (menuEl.contains(e.target)) return;
  closeMenu();
}

function handleContextMenu(e) {
  if (e.target.tagName === 'CANVAS') {
    e.preventDefault();
  }
}

// === Контекстное меню (универсальное) ===
// items: [{ label, onClick }]
export function showContextMenu(e, items) {
  closeMenu();

  // nativeEvent даёт реальные координаты мыши на странице
  const native = e.nativeEvent || e;
  const pageX = native.pageX ?? native.clientX ?? 0;
  const pageY = native.pageY ?? native.clientY ?? 0;

  menuEl = document.createElement('div');
  menuEl.id = 'world-object-menu';
  menuEl.style.cssText = `
    position: fixed; left: ${pageX}px; top: ${pageY}px;
    background: rgba(15, 25, 15, 0.97); border: 2px solid #8B5A2B; border-radius: 8px;
    color: #ffcc80; font-family: Arial, sans-serif; font-size: 14px; z-index: 250;
    min-width: 180px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.6);
  `;

  items.forEach((item) => {
    const el = document.createElement('div');
    el.textContent = item.label;
    el.style.cssText = `
      padding: 10px 16px; cursor: pointer;
      border-bottom: 1px solid #8B5A2B;
    `;
    el.addEventListener('mouseenter', () => (el.style.background = '#5c4a2f'));
    el.addEventListener('mouseleave', () => (el.style.background = 'transparent'));
    el.addEventListener('click', () => {
      item.onClick();
      closeMenu();
    });
    menuEl.appendChild(el);
  });

  // убираем нижнюю границу у последнего пункта
  const last = menuEl.lastElementChild;
  if (last) last.style.borderBottom = 'none';

  document.body.appendChild(menuEl);

  // Корректировка, если меню вышло за правый/нижний край экрана
  requestAnimationFrame(() => {
    const rect = menuEl.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menuEl.style.left = (window.innerWidth - rect.width - 10) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      menuEl.style.top = (window.innerHeight - rect.height - 10) + 'px';
    }
  });
}

// Меню действий для объектов мира (вода/дерево/пень)
function showActionMenu(e, cfg) {
  const items = cfg.actions.map((action) => ({
    label: action.label,
    onClick: () => startAction(action),
  }));
  showContextMenu(e, items);
}

function closeMenu() {
  if (menuEl) {
    menuEl.remove();
    menuEl = null;
  }
}

// При нулевой бодрости нельзя бить и тренироваться (вызывается отсюда и из
// main.js перед ударом клавишей E)
export function hasStamina() {
  return (getNeedValue('e') ?? 0) > 0;
}

function showNoStaminaWarning() {
  _worldToast('😮‍💨 Бодрости не осталось — нужно отдохнуть');
}

// === Запуск действия длительностью ACTION_DURATION_MS (30 сек) ===

export function runTimedAction(action, durationMs = ACTION_DURATION_MS) {
  // если уже выполняется какое-то действие — прерываем его
  stopActiveAction();

  action.start();
  showProgressIndicator(action.label, durationMs);

  const timeoutId = setTimeout(() => {
    action.stop();
    // onComplete срабатывает только при естественном завершении действия,
    // а не при его прерывании (например, началом движения персонажа)
    if (action.onComplete) action.onComplete();
    removeProgressIndicator();
    activeAction = null;
  }, durationMs);

  activeAction = { timeoutId, stop: action.stop };
}

// === Динамическое действие: выполняется, пока getCurrentValue() не достигнет
// getMaxValue() (например, "Поспать" — пока бодрость не дойдёт до 100%).
// Прогресс-бар отражает реальное текущее значение потребности, а не
// фиксированное время — обновляется каждые 100 мс.
export function runDynamicAction({ label, start, stop, getCurrentValue, getMaxValue, onComplete }) {
  stopActiveAction();

  start();
  showDynamicProgressIndicator(label, getCurrentValue, getMaxValue);

  const checkIntervalId = setInterval(() => {
    if (getCurrentValue() >= getMaxValue()) {
      stop();
      if (onComplete) onComplete();
      removeProgressIndicator();
      activeAction = null;
      clearInterval(checkIntervalId);
    }
  }, 200);

  activeAction = {
    timeoutId: checkIntervalId,
    stop,
    isDynamic: true,
  };
}

// === Бессрочное действие: выполняется, пока его не прервут движением или
// другим действием (например, "Сесть" — персонаж сидит сколько угодно).
// Не имеет таймера/прогресс-бара — просто держит start() активным до stop().
export function runIndefiniteAction({ label, start, stop, tick, tickIntervalMs = 1000 }) {
  stopActiveAction();

  start();

  let intervalId = null;
  if (tick) {
    intervalId = setInterval(tick, tickIntervalMs);
  }

  activeAction = {
    timeoutId: intervalId,
    stop: () => {
      if (intervalId) clearInterval(intervalId);
      stop();
    },
    isDynamic: !!intervalId, // переиспользуем тот же путь очистки (clearInterval)
  };
}
function startAction(action) {
  // Тренировка требует ненулевой бодрости
  if (action.id === 'train_tree' || action.id === 'train_stump') {
    if (!hasStamina()) {
      showNoStaminaWarning();
      return;
    }
    runTimedAction(action, TRAIN_DURATION_MS);
    return;
  }
  runTimedAction(action);
}

// Узнать, выполняется ли сейчас какое-то действие с объектом мира
export function isActionActive() {
  return !!activeAction;
}

// Принудительно прервать текущее действие 
export function stopActiveAction() {
  if (activeAction) {
    if (activeAction.isDynamic) {
      clearInterval(activeAction.timeoutId);
    } else {
      clearTimeout(activeAction.timeoutId);
    }
    activeAction.stop();
    activeAction = null;
  }
  removeProgressIndicator();
  closeMenu();
}

// === Индикатор прогресса действия (полоска над нижним меню) ===
function showProgressIndicator(label, durationMs = ACTION_DURATION_MS) {
  removeProgressIndicator();

  progressEl = document.createElement('div');
  progressEl.id = 'action-progress';
  progressEl.style.cssText = `
    position: fixed; bottom: 110px; left: 50%; transform: translateX(-50%);
    background: rgba(15, 25, 15, 0.92); border: 2px solid #8B5A2B; border-radius: 8px;
    color: #ffcc80; font-family: Arial, sans-serif; font-size: 14px; z-index: 160;
    padding: 8px 16px; text-align: center; min-width: 220px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  `;
  progressEl.innerHTML = `
    <div style="margin-bottom: 6px;">${label}…</div>
    <div style="height: 8px; background: rgba(0,0,0,0.4); border-radius: 4px; overflow: hidden; border: 1px solid #8B5A2B;">
      <div id="action-progress-fill" style="height: 100%; width: 0%; background: #8fd14f; transition: width 0.2s linear;"></div>
    </div>
  `;
  document.body.appendChild(progressEl);

  const fill = progressEl.querySelector('#action-progress-fill');
  const startTime = Date.now();
  const interval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const pct = Math.min(100, (elapsed / durationMs) * 100);
    if (fill) fill.style.width = pct + '%';
    if (pct >= 100) clearInterval(interval);
  }, 100);

  progressEl._interval = interval;
}

function removeProgressIndicator() {
  if (progressEl) {
    if (progressEl._interval) clearInterval(progressEl._interval);
    progressEl.remove();
    progressEl = null;
  }
}

// Небольшое всплывающее уведомление (используется для предупреждений вроде


// === Индикатор прогресса для динамических действий (например, "Поспать") ===
// Полоска отражает реальное текущее значение потребности относительно
// её текущего максимума (а не фиксированное время).
function showDynamicProgressIndicator(label, getCurrentValue, getMaxValue) {
  removeProgressIndicator();

  progressEl = document.createElement('div');
  progressEl.id = 'action-progress';
  progressEl.style.cssText = `
    position: fixed; bottom: 110px; left: 50%; transform: translateX(-50%);
    background: rgba(15, 25, 15, 0.92); border: 2px solid #8B5A2B; border-radius: 8px;
    color: #ffcc80; font-family: Arial, sans-serif; font-size: 14px; z-index: 160;
    padding: 8px 16px; text-align: center; min-width: 220px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  `;
  progressEl.innerHTML = `
    <div style="margin-bottom: 6px;" id="action-progress-label">${label}…</div>
    <div style="height: 8px; background: rgba(0,0,0,0.4); border-radius: 4px; overflow: hidden; border: 1px solid #8B5A2B;">
      <div id="action-progress-fill" style="height: 100%; width: 0%; background: #8fd14f; transition: width 0.2s linear;"></div>
    </div>
  `;
  document.body.appendChild(progressEl);

  const fill = progressEl.querySelector('#action-progress-fill');
  const labelEl = progressEl.querySelector('#action-progress-label');

  const interval = setInterval(() => {
    const current = getCurrentValue();
    const max = getMaxValue();
    const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
    if (fill) fill.style.width = pct + '%';
    if (labelEl) labelEl.textContent = `${label}… ${Math.round(pct)}%`;
    if (pct >= 100) clearInterval(interval);
  }, 100);

  progressEl._interval = interval;
}

function _worldToast(text) {
  showToast(text, { fontSize: 14 });
}

// ============================================================
// СОВМЕСТНАЯ ТРЕНИРОВКА (спарринг с другим котом / ПКМ по игроку)
// ============================================================
//
// Как работает:
//   1. ПКМ по спрайту другого игрока → показывается пункт «Потренироваться»
//   2. У второго игрока всплывает баннер-запрос согласия (кнопки Да / Нет)
//   3. Если оба согласились → обоим тратится 16% бодрости и засчитывается
//      прогресс задания 'sparring' + тренировочный xp
//   4. Отклонение / таймаут — тренировка не засчитывается
//
// Для одиночной игры (один браузер) баннер появляется сразу и игрок сам
// нажимает «Да» — это нормально, механика засчитывается.

import { spendSleepForStrike, gainEnergy as _gainEnergy } from './menu/needs-system.js';
import { addXp as _addXp, progressMoveTasks as _progressMoveTasks } from './menu/xp-system.js';
import { refreshActivePanel as _refresh } from './menu/bottom-menu.js';

const SPARRING_TIMEOUT_MS = 15000; // 15 сек на принятие приглашения

let sparringRequestId = null;
let sparringTimeoutHandle = null;

// Вызывать из main.js, когда настраиваешь ПКМ по спрайту другого персонажа.
// otherCharSprite — PIXI.Sprite другого игрока, otherPlayerName — строка с именем.
export function setupSparringAction(otherCharSprite, otherPlayerName = 'другой кот') {
  if (!otherCharSprite) return;
  otherCharSprite.eventMode = 'static';
  otherCharSprite.cursor = 'pointer';

  otherCharSprite.on('rightclick', (e) => {
    e.stopPropagation();
    showContextMenu(e, [
      {
        label: `Потренироваться с ${otherPlayerName}`,
        onClick: () => sendSparringRequest(otherPlayerName),
      },
    ]);
  });
}

// Отправить запрос на тренировку (показывает баннер согласия)
function sendSparringRequest(otherName) {
  if (sparringRequestId) {
    showToast('Уже есть активный запрос на тренировку', { fontSize: 14 });
    return;
  }

  sparringRequestId = Date.now();
  showSparringConsentBanner(otherName, sparringRequestId);

  sparringTimeoutHandle = setTimeout(() => {
    cancelSparringRequest('Время вышло — тренировка отменена');
  }, SPARRING_TIMEOUT_MS);
}

function cancelSparringRequest(msg) {
  sparringRequestId = null;
  if (sparringTimeoutHandle) {
    clearTimeout(sparringTimeoutHandle);
    sparringTimeoutHandle = null;
  }
  if (msg) showToast(msg, { fontSize: 14 });
  removeSparringBanner();
}

// Баннер-запрос согласия (показывается «второму» игроку)
let sparringBannerEl = null;

function showSparringConsentBanner(otherName, reqId) {
  removeSparringBanner();

  sparringBannerEl = document.createElement('div');
  sparringBannerEl.style.cssText = `
    position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
    background: rgba(15,25,15,0.97); border: 2px solid #8B5A2B; border-radius: 10px;
    color: #ffcc80; font-family: 'Ink Free','Segoe Print',cursive;
    font-size: 16px; padding: 16px 24px; text-align: center;
    z-index: 9000; box-shadow: 0 6px 20px rgba(0,0,0,0.7);
    min-width: 280px;
  `;
  sparringBannerEl.innerHTML = `
    <div style="margin-bottom:12px;">⚔️ Потренироваться с <b>${otherName}</b>?<br>
      <span style="font-size:12px;color:#c9bda0;">Потратит −16% бодрости у обоих, оба получат xp и прогресс приёма</span>
    </div>
    <div style="display:flex;gap:10px;justify-content:center;">
      <button id="sparring-yes" style="
        padding:8px 22px;background:#3a2f1e;border:2px solid #8fd14f;color:#8fd14f;
        border-radius:8px;cursor:pointer;font-family:inherit;font-size:15px;
      ">✓ Да</button>
      <button id="sparring-no" style="
        padding:8px 22px;background:#3a2f1e;border:2px solid #ff6666;color:#ff6666;
        border-radius:8px;cursor:pointer;font-family:inherit;font-size:15px;
      ">✗ Нет</button>
    </div>
  `;

  document.body.appendChild(sparringBannerEl);

  sparringBannerEl.querySelector('#sparring-yes').addEventListener('click', () => {
    if (sparringRequestId !== reqId) return;
    completeSparring();
  });
  sparringBannerEl.querySelector('#sparring-no').addEventListener('click', () => {
    cancelSparringRequest('Тренировка отклонена');
  });
}

function removeSparringBanner() {
  if (sparringBannerEl) {
    sparringBannerEl.remove();
    sparringBannerEl = null;
  }
}

// Засчитываем спарринг: тратим бодрость, начисляем xp и прогресс задания
function completeSparring() {
  cancelSparringRequest(null);

  spendSleepForStrike(5);    // −5% бодрости своему персонажу
  _addXp('train');           // +0.3 xp
  _progressMoveTasks('sparring');
  _refresh();

  showToast('⚔️ Тренировка с котом завершена! +0.3 xp, −5% бодрости', { duration: 2400, fontSize: 14 });
}
