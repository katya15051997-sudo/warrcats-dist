// bunny.js
// Кролик — добыча, которая бегает по карте.
// Появляется из норы (gree.png). Убивается ударом (клавиша E, см. input.js) —
// удар по кролику всегда удачный, здоровье кролика не отображается на экране.
// После 10 очков здоровья кролик погибает: на месте остаётся тушка,
// сам кролик прячется в нору и появится там снова через RESPAWN_DELAY_MS.
// ПКМ по тушке -> "Съесть" -> +10% сытости + 0.5 xp.

import * as PIXI from 'pixi.js';
import { huntPrey, spendSleepForStrike } from '../systems/needs-system.js';
import { showContextMenu } from './world-objects.js';
import { addXp, progressMoveTasks } from '../systems/xp-system.js';
import { refreshActivePanel, getNeedValue } from '../ui/bottom-menu.js';

const BUNNY_TEXTURE = '/assets/bunny.png';
const DEN_TEXTURE = '/assets/gree.png';

const BUNNY_SPEED = 2.5;          // скорость бега кролика (px/тик)
const RESPAWN_DELAY_MS = 8000;  // через сколько кролик появится снова из норы
const SCALE = 1;

// Здоровье кролика — не отображается на экране, удары по нему всегда удачны
export const BUNNY_MAX_HEALTH = 15;
const BUNNY_DAMAGE_PER_HIT = 5; // удар сразу убивает (можно уменьшить для нескольких ударов)

// Радиус, в пределах которого клавиша E наносит удар кролику
export const BUNNY_STRIKE_RADIUS = 90;

// Позиция норы (куст gree.png), откуда появляется кролик.
// ПОДКОРРЕКТИРУЙ координаты под свою карту!
const DEN_POSITION = { x: 1000, y: 1000 };

// Границы блуждания по карте (по умолчанию — переопределяются в createBunny)
let bounds = { minX: 100, maxX: 2800, minY: 100, maxY: 1800 };

let world = null;
let bunnySprite = null;
let direction = { x: 0, y: 0 };
let directionChangeTimer = 0;
let caught = false;
let bunnyHealth = BUNNY_MAX_HEALTH;

// === Создание кролика, норы и добавление их в мир ===
// worldBounds — { minX, maxX, minY, maxY } область, по которой бегает кролик
export async function createBunny(worldContainer, worldBounds) {
  world = worldContainer;
  if (worldBounds) bounds = worldBounds;

  const [bunnyTexture, denTexture] = await Promise.all([
    PIXI.Assets.load(BUNNY_TEXTURE),
    PIXI.Assets.load(DEN_TEXTURE),
  ]);

  // Нора/куст — статичный декор, кролик появляется и прячется здесь
  const den = new PIXI.Sprite(denTexture);
  den.anchor.set(0.5, 1);
  den.x = DEN_POSITION.x;
  den.y = DEN_POSITION.y;
  world.addChild(den);

  // Сам кролик
  bunnySprite = new PIXI.Sprite(bunnyTexture);
  bunnySprite.anchor.set(0.5);
  bunnySprite.scale.set(SCALE);

  spawnAtDen();
  pickNewDirection();

  world.addChild(bunnySprite);

  return bunnySprite;
}

// Выбрать новое случайное направление движения
function pickNewDirection() {
  const angle = Math.random() * Math.PI * 2;
  direction.x = Math.cos(angle);
  direction.y = Math.sin(angle);
  // через сколько тиков снова сменить направление (~1-3 сек при 60 fps)
  directionChangeTimer = 60 + Math.random() * 120;
}

// Появление кролика из норы
function spawnAtDen() {
  if (!bunnySprite) return;
  bunnySprite.x = DEN_POSITION.x;
  bunnySprite.y = DEN_POSITION.y;
  bunnySprite.visible = true;
  caught = false;
  bunnyHealth = BUNNY_MAX_HEALTH;
  pickNewDirection();
}

// === Вызывать каждый кадр (app.ticker), передавая активного персонажа ===
export function updateBunny(activeChar) {
  if (!bunnySprite || caught) return;

  // Смена направления время от времени, чтобы кролик "блуждал"
  directionChangeTimer--;
  if (directionChangeTimer <= 0) pickNewDirection();

  bunnySprite.x += direction.x * BUNNY_SPEED;
  bunnySprite.y += direction.y * BUNNY_SPEED;

  // Отражение от границ области блуждания
  if (bunnySprite.x < bounds.minX) {
    bunnySprite.x = bounds.minX;
    direction.x *= -1;
  } else if (bunnySprite.x > bounds.maxX) {
    bunnySprite.x = bounds.maxX;
    direction.x *= -1;
  }

  if (bunnySprite.y < bounds.minY) {
    bunnySprite.y = bounds.minY;
    direction.y *= -1;
  } else if (bunnySprite.y > bounds.maxY) {
    bunnySprite.y = bounds.maxY;
    direction.y *= -1;
  }

  // Разворот спрайта по направлению движения
  bunnySprite.scale.x = direction.x < 0 ? -SCALE : SCALE;
}

// === Получить текущую позицию кролика (для проверки радиуса удара в main.js) ===
export function getBunnyPosition() {
  if (!bunnySprite || caught) return null;
  return { x: bunnySprite.x, y: bunnySprite.y };
}

export function isBunnyCaught() {
  return caught;
}

// Удар по кролику (клавиша E) — всегда удачный, здоровье не отображается.
// Тратит 5 бодрости персонажа. При нулевой бодрости удар не происходит.
// Вызывается из main.js, когда персонаж находится в радиусе удара от кролика.
export function strikeBunny() {
  if (!bunnySprite || caught) return false;

  if ((getNeedValue('sleep') ?? 0) <= 0) {
    showCatchNotification('😮‍💨 Бодрости не осталось — нельзя ударить');
    return false;
  }

  spendSleepForStrike(5); // удар тратит 5 бодрости

  bunnyHealth = Math.max(0, bunnyHealth - BUNNY_DAMAGE_PER_HIT);

  if (bunnyHealth <= 0) {
    catchBunny();
  }
  return true;
}

// Кролик убит: оставляем тушку на месте, сам кролик прячется в нору
// и появится там снова через RESPAWN_DELAY_MS.
// Опыт начисляется здесь — в момент убийства, а не поедания тушки —
// чтобы он всегда засчитывался, даже если тушку не съели.
function catchBunny() {
  caught = true;

  createCarcass(bunnySprite.x, bunnySprite.y);

  bunnySprite.visible = false;
  showCatchNotification('Кролик пойман!');

  addXp(0.5); // +0.5 xp за убийство кролика
  progressMoveTasks('small'); // засчитать кролика для выбранного изучаемого приёма
  refreshActivePanel();

  setTimeout(spawnAtDen, RESPAWN_DELAY_MS);
}

// === Тушка пойманного кролика ===
function createCarcass(x, y) {
  const carcass = new PIXI.Sprite(bunnySprite.texture);
  carcass.anchor.set(0.5);
  carcass.scale.set(SCALE);
  carcass.rotation = Math.PI / 2; // лежит на боку
  carcass.x = x;
  carcass.y = y;
  carcass.eventMode = 'static';
  carcass.cursor = 'pointer';

  carcass.on('rightclick', (e) => {
    e.stopPropagation();
    showContextMenu(e, [
      {
        label: 'Съесть',
        onClick: () => eatCarcass(carcass),
      },
    ]);
  });

  world.addChild(carcass);
}

// Съесть тушку: +10% сытости, тушка убирается с карты (опыт уже начислен
// в момент убийства кролика — см. catchBunny)
function eatCarcass(carcass) {
  huntPrey('rabbit');
  showCatchNotification('Вы съели кролика! Сытость +10%');

  if (carcass.parent) {
    carcass.parent.removeChild(carcass);
  }
  carcass.destroy();
}

// Небольшое всплывающее уведомление
function showCatchNotification(text) {
  const note = document.createElement('div');
  note.textContent = text;
  note.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: rgba(15, 25, 15, 0.92); border: 2px solid #8B5A2B; border-radius: 8px;
    color: #ffcc80; font-family: Arial, sans-serif; font-size: 15px; z-index: 250;
    padding: 8px 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    opacity: 0; transition: opacity 0.3s ease;
  `;
  document.body.appendChild(note);

  requestAnimationFrame(() => {
    note.style.opacity = '1';
  });

  setTimeout(() => {
    note.style.opacity = '0';
    setTimeout(() => note.remove(), 300);
  }, 1800);
}

