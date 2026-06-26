import * as PIXI from 'pixi.js';
import { setDrinking, doTraining, getNeed, sharpenClaws } from '../systems/player-system.js';
import { addXp, progressMoveTasks } from '../systems/skills.js';
import { refreshActivePanel } from '../ui/bottom-menu.js';
import { showToast } from '../ui/notify.js';

const ACTION_DURATION_MS = 30000;

const TRAIN_DURATION_MS = 10000;

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
        start: () => {},
        stop:  () => {},
        onComplete: () => sharpenClaws(),
      },
      {
        id: 'train_tree',
        label: 'Потренироваться',
        start: () => {},
        stop: () => {},
        
        
        onComplete: () => {
          doTraining(); 
          addXp('train'); 
          progressMoveTasks('train'); 
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
        start: () => {},
        stop:  () => {},
        onComplete: () => sharpenClaws(),
      },
      {
        id: 'train_stump',
        label: 'Потренироваться',
        start: () => {},
        stop: () => {},
        onComplete: () => {
          doTraining(); 
          addXp('train'); 
          progressMoveTasks('train');
          refreshActivePanel();
        },
      },
    ],
  },
];

let menuEl = null;
let progressEl = null;
let activeAction = null; 

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

    
    sprite.on('rightclick', (e) => {
      e.stopPropagation();
      showActionMenu(e, cfg);
    });

    world.addChild(sprite);
    sprites.push(sprite);
  }

  
  document.addEventListener('mousedown', handleOutsideClick);

  
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

export function showContextMenu(e, items) {
  closeMenu();

  
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

  
  const last = menuEl.lastElementChild;
  if (last) last.style.borderBottom = 'none';

  document.body.appendChild(menuEl);

  
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

export function hasStamina() {
  return (getNeed('e') ?? 0) > 0;
}

function showNoStaminaWarning() {
  _worldToast('😮‍💨 Бодрости не осталось — нужно отдохнуть');
}

export function runTimedAction(action, durationMs = ACTION_DURATION_MS) {
  
  stopActiveAction();

  action.start();
  showProgressIndicator(action.label, durationMs);

  const timeoutId = setTimeout(() => {
    action.stop();
    
    
    if (action.onComplete) action.onComplete();
    removeProgressIndicator();
    activeAction = null;
  }, durationMs);

  activeAction = { timeoutId, stop: action.stop };
}

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
    isDynamic: !!intervalId, 
  };
}
function startAction(action) {
  
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

export function isActionActive() {
  return !!activeAction;
}

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
