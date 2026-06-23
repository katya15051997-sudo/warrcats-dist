// otherPlayers.js  (рядом с main.js)
// Управляет спрайтами других игроков на карте.
// Получает снапшоты из network.js (type: 'state') и интерполирует позиции.

import * as PIXI from 'pixi.js';
import { getMyId } from './network.js';

// Текстуры по телосложению (те же, что у createCharacters)
const BUILD_TEXTURES = {
  lean:  '/assets/spine/Cat_lean.png',
  large: '/assets/spine/Cat_massive.png',
  fat:   '/assets/spine/Cat_fat.png',
};

// CSS-фильтр цвета (аналог ingame-menu.js / menu.js)
function bodyToFilter(body) {
  if (!body) return '';
  const catHue = v => v <= 70 ? Math.round((v / 70) * 60) : Math.round(180 + ((v - 70) / 30) * 60);
  const catSat = v => Math.round((v / 100) * 100);
  const hslH = catHue(body.hue ?? 0);
  const hueRotate = hslH - 38;
  const satPct = Math.round(10 + (catSat(body.saturation ?? 50) / 100) * 350);
  const brightF = (0.3 + ((body.brightness ?? 50 - 10) / 80) * 1.3).toFixed(2);
  return `sepia(1) hue-rotate(${hueRotate}deg) saturate(${satPct}%) brightness(${brightF})`;
}

// Карта: connId → { sprite, nameText, healthBar, target{x,y}, ... }
const others = new Map();
let _world = null;
const _texCache = {}; // build → PIXI.Texture

// Проинициализировать (вызывать один раз при старте игры)
export async function initOtherPlayers(world) {
  _world = world;
  // Предзагрузка текстур
  for (const [build, url] of Object.entries(BUILD_TEXTURES)) {
    try { _texCache[build] = await PIXI.Assets.load(url); } catch {}
  }
}

// Применить снапшот от сервера (вызывать из обработчика 'state')
export function applySnapshot(players) {
  const myId = getMyId();
  const seen = new Set();

  for (const p of players) {
    if (p.id === myId) continue; // себя не рисуем
    seen.add(p.id);

    if (!others.has(p.id)) {
      _createOther(p);
    } else {
      _updateTarget(p);
    }
  }

  // Удаляем ушедших
  for (const [id] of others) {
    if (!seen.has(id)) _removeOther(id);
  }
}

// Плавное движение к целевой позиции (интерполяция).
// Вызывать каждый кадр из app.ticker.
export function updateOtherPlayers() {
  for (const other of others.values()) {
    const LERP = 0.25;
    other.sprite.x += (other.targetX - other.sprite.x) * LERP;
    other.sprite.y += (other.targetY - other.sprite.y) * LERP;

    // Разворот
    const sc = Math.abs(other.sprite.scale.x);
    other.sprite.scale.x = other.facingLeft ? sc : -sc;

    // Имя над головой
    other.nameText.x = other.sprite.x;
    other.nameText.y = other.sprite.y - 90;

    // Полоска HP
    _updateHealthBar(other);
  }
}

// Добавить игрока по событию player_join
export function addOtherPlayer(p) {
  if (p.id === getMyId()) return;
  if (!others.has(p.id)) _createOther(p);
}

// Убрать игрока по событию player_leave
export function removeOtherPlayer(id) {
  _removeOther(id);
}

// Получить спрайт другого игрока (для спарринга — чтобы повесить ПКМ)
export function getOtherSprite(id) {
  return others.get(id)?.sprite ?? null;
}

// Получить список всех других игроков { id, name, sprite }
export function getAllOthers() {
  return [...others.entries()].map(([id, o]) => ({ id, name: o.name, sprite: o.sprite }));
}

// ─── Внутреннее ──────────────────────────────────────────────────────────────

function _createOther(p) {
  if (!_world) return;

  const tex = _texCache[p.build] ?? _texCache['lean'];
  const sprite = new PIXI.Sprite(tex);
  sprite.anchor.set(0.5, 1);
  sprite.x = p.x;
  sprite.y = p.y;

  // Применяем цвет персонажа
  if (p.appearance?.body) {
    // Для PIXI используем ColorMatrixFilter или просто tint
    // Тут упрощённо — tint по hue
    const body = p.appearance.body;
    const hue  = Math.round(((body.hue ?? 0) / 100) * 360);
    sprite.tint = PIXI.utils.rgb2hex([
      0.5 + 0.5 * Math.cos((hue) * Math.PI / 180),
      0.5 + 0.5 * Math.cos((hue - 120) * Math.PI / 180),
      0.5 + 0.5 * Math.cos((hue - 240) * Math.PI / 180),
    ]);
  }

  // Имя
  const nameText = new PIXI.Text(p.name, {
    fontSize: 14,
    fill: 0xffcc80,
    fontFamily: 'Arial',
    stroke: 0x000000,
    strokeThickness: 3,
  });
  nameText.anchor.set(0.5, 1);
  nameText.x = p.x;
  nameText.y = p.y - 90;

  // Полоска HP
  const hpBg   = new PIXI.Graphics();
  const hpFill = new PIXI.Graphics();

  _world.addChild(sprite);
  _world.addChild(nameText);
  _world.addChild(hpBg);
  _world.addChild(hpFill);

  others.set(p.id, {
    sprite, nameText, hpBg, hpFill,
    name: p.name,
    targetX: p.x, targetY: p.y,
    facingLeft: p.facingLeft ?? false,
    h: p.h ?? 100, max_h: p.max_h ?? 100,
  });
}

function _updateTarget(p) {
  const other = others.get(p.id);
  if (!other) return;
  other.targetX     = p.x;
  other.targetY     = p.y;
  other.facingLeft  = p.facingLeft ?? other.facingLeft;
  other.h           = p.h    ?? other.h;
  other.max_h       = p.max_h ?? other.max_h;
}

function _removeOther(id) {
  const other = others.get(id);
  if (!other) return;
  [other.sprite, other.nameText, other.hpBg, other.hpFill].forEach(obj => {
    if (obj?.parent) obj.parent.removeChild(obj);
    obj?.destroy?.();
  });
  others.delete(id);
}

function _updateHealthBar(other) {
  const W = 50, H = 6;
  const x = other.sprite.x - W / 2;
  const y = other.sprite.y - other.sprite.height - 12;
  const pct = Math.max(0, Math.min(1, other.h / (other.max_h || 100)));

  other.hpBg.clear();
  other.hpBg.beginFill(0x000000, 0.5);
  other.hpBg.drawRoundedRect(x, y, W, H, 3);
  other.hpBg.endFill();

  other.hpFill.clear();
  other.hpFill.beginFill(pct > 0.4 ? 0x8fd14f : 0xd85a30);
  other.hpFill.drawRoundedRect(x, y, W * pct, H, 3);
  other.hpFill.endFill();
}
