// enemy-fox.js
// Лиса-противник — статичный враг на карте (координаты 400x400).
// Урон наносится клавишей E (см. main.js), когда персонаж находится
// в радиусе удара от лисы. Здоровье лисы отображается полоской над ней.
//
// При победе (здоровье лисы опускается до 0):
// - персонаж получает опыт за победу в бою (XP_REWARDS.battleWin)
// - засчитывается прогресс по заданиям приёмов с ключом 'fox'
// - лиса возрождается через RESPAWN_DELAY_MS

import * as PIXI from 'pixi.js';
import { addXp, getDamageMultiplier, getRankBonusText, getLearnedMoves, applyMoveEffects, progressMoveTasks, PLAYER_BASE_DAMAGE_MIN, PLAYER_BASE_DAMAGE_MAX } from './menu/xp-system.js';
import { damageHealth, spendSleepForStrike } from './menu/needs-system.js';
import { refreshActivePanel, getNeedValue } from './menu/bottom-menu.js';
import { showToast } from './notify.js';

const FOX_TEXTURE = '/assets/fox.png';
const FOX_SCALE = 0.5;
const FOX_POSITION = { x: 400, y: 400 };

// Радиус, в пределах которого клавиша E наносит удар лисе
export const FOX_STRIKE_RADIUS = 120;

const FOX_MAX_HEALTH = 60;
const RESPAWN_DELAY_MS = 15000; // лиса возрождается через 15 секунд после победы

// Урон, который лиса наносит персонажу в ответ на удар (контратака)
const FOX_COUNTER_DAMAGE_MIN = 5;
const FOX_COUNTER_DAMAGE_MAX = 15;
// Шанс, что лиса контратакует в ответ на удар игрока
const FOX_COUNTER_CHANCE = 0.5;

let world = null;
let foxSprite = null;
let foxHealth = FOX_MAX_HEALTH;
let foxAlive = true;
let healthBarBg = null;
let healthBarFill = null;

// === Создание лисы и добавление в мир ===
export async function createFoxEnemy(worldContainer) {
  world = worldContainer;

  const texture = await PIXI.Assets.load(FOX_TEXTURE);
  foxSprite = new PIXI.Sprite(texture);
  foxSprite.anchor.set(0.5, 1);
  foxSprite.x = FOX_POSITION.x;
  foxSprite.y = FOX_POSITION.y;
  foxSprite.scale.set(FOX_SCALE);

  world.addChild(foxSprite);

  createHealthBar();
  updateHealthBar();

  return foxSprite;
}

// === Текущая позиция лисы (для проверки радиуса удара в main.js) ===
export function getFoxPosition() {
  if (!foxSprite || !foxAlive) return null;
  return { x: foxSprite.x, y: foxSprite.y };
}

export function isFoxAlive() {
  return foxAlive;
}

// === Полоска здоровья над лисой ===
function createHealthBar() {
  healthBarBg = new PIXI.Graphics();
  healthBarFill = new PIXI.Graphics();
  world.addChild(healthBarBg);
  world.addChild(healthBarFill);
}

function updateHealthBar() {
  if (!healthBarBg || !healthBarFill || !foxSprite) return;

  const barWidth = 70;
  const barHeight = 8;
  const barX = foxSprite.x - barWidth / 2;
  const barY = foxSprite.y - foxSprite.height - 18;

  healthBarBg.clear();
  healthBarBg.beginFill(0x000000, 0.6);
  healthBarBg.drawRoundedRect(barX, barY, barWidth, barHeight, 4);
  healthBarBg.endFill();
  healthBarBg.visible = foxAlive;

  const pct = Math.max(0, foxHealth / FOX_MAX_HEALTH);
  healthBarFill.clear();
  healthBarFill.beginFill(pct > 0.4 ? 0xd85a30 : 0x991f1f);
  healthBarFill.drawRoundedRect(barX, barY, barWidth * pct, barHeight, 4);
  healthBarFill.endFill();
  healthBarFill.visible = foxAlive;
}

// Удар по лисе (клавиша E, см. main.js — вызывается, когда персонаж в радиусе).
// Тратит 5 бодрости персонажа. При нулевой бодрости удар не происходит.
export function strikeFox() {
  if (!foxAlive) return false;

  if ((getNeedValue('e') ?? 0) <= 0) {
    _combat('Вам надо поспать.');
    return false;
  }

  spendSleepForStrike(5); // удар тратит 5 бодрости

  // Базовый случайный урон
  const baseDamage = randRange(PLAYER_BASE_DAMAGE_MIN, PLAYER_BASE_DAMAGE_MAX);

  // Множитель силы удара от текущего звания
  const rankMultiplier = getDamageMultiplier();
  let damage = baseDamage * rankMultiplier;

  // Применяем эффекты изученных боевых приёмов
  const learned = getLearnedMoves();
  const moveResult = applyMoveEffects(damage, learned);
  damage = moveResult.damage; // applyMoveEffects уже округляет до целого

  foxHealth = Math.max(0, foxHealth - damage);
  updateHealthBar();

  _combat(
    `🦊 Удар! Урон: ${damage} (звание x${rankMultiplier.toFixed(1)})`
    + (moveResult.log.length ? '\n' + moveResult.log.join(', ') : '')
  );

  // Кровотечение от приёма «Прочёс живота» / «Царапина» — урон по времени
  if (foxHealth > 0 && moveResult.bleed) {
    applyBleedToFox(moveResult.bleed);
  }

  // Контратака лисы — блокируется оглушением (stunMs > 0)
  if (foxHealth > 0 && moveResult.stunMs <= 0 && Math.random() < FOX_COUNTER_CHANCE) {
    const counterDamage = Math.round(randRange(FOX_COUNTER_DAMAGE_MIN, FOX_COUNTER_DAMAGE_MAX));
    damageHealth(counterDamage);
    _combat(`Лиса укусила в ответ: -${counterDamage} здоровья`);
  } else if (foxHealth > 0 && moveResult.stunMs > 0) {
    _combat(`Лиса оглушена на ${moveResult.stunMs / 1000} сек — не может контратаковать!`);
  }

  if (foxHealth <= 0) {
    handleFoxDefeated();
  }

  return true;
}

// === Победа над лисой ===
function handleFoxDefeated() {
  foxAlive = false;
  foxSprite.alpha = 0.35;
  foxSprite.tint = 0x888888;
  healthBarBg.visible = false;
  healthBarFill.visible = false;

  const result = addXp('battleWin');
  const completed = progressMoveTasks('fox');

  let msg = `Лиса повержена! +${result.gained} xp`;
  if (result.leveledUp) {
    msg += `\nНовое звание: ${result.rank.name}! Бонус: ${getRankBonusText()}`;
  }
  completed.forEach(c => {
    msg += `\n✓ Приём «${c.move.name}» изучен! +${c.xpResult.gained} xp`;
  });
  _combat(msg);
  refreshActivePanel();

  setTimeout(respawnFox, RESPAWN_DELAY_MS);
}

// Кровотечение: наносит bleed.damage урона лисе, растянутого на bleed.durationMs
// (двумя шагами). Останавливается, если лиса уже погибла/возродилась.
function applyBleedToFox(bleed) {
  const ticks = 2;
  const perTick = bleed.damage / ticks;
  let done = 0;

  const intervalId = setInterval(() => {
    if (!foxAlive) { clearInterval(intervalId); return; }

    done++;
    foxHealth = Math.max(0, foxHealth - perTick);
    updateHealthBar();
    _combat(`🩸 Кровотечение: −${Math.round(perTick)} здоровья`);

    if (foxHealth <= 0) {
      clearInterval(intervalId);
      handleFoxDefeated();
      return;
    }
    if (done >= ticks) clearInterval(intervalId);
  }, bleed.durationMs / ticks);
}

function respawnFox() {
  foxHealth = FOX_MAX_HEALTH;
  foxAlive = true;
  foxSprite.alpha = 1;
  foxSprite.tint = 0xffffff;
  updateHealthBar();
  _combat('Лиса вернулась на своё место.');
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function _combat(text) {
  showToast(text, { duration: 2400, fontSize: 14, multiline: true });
}
