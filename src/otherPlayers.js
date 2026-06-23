// otherPlayers.js
// Управляет Spine-спрайтами других игроков на карте.
// Каждый другой игрок — полноценный Spine-объект с анимацией и цветом,
// точно такой же как свой персонаж.

import * as PIXI from 'pixi.js';
import { getMyId } from './network.js';
import { applyCharacterBuild, applyCharacterColors, applyEyeColor, setCharacterPose } from './menu/character.js';

const others = new Map(); // connId → { spine, nameText, hpBg, hpFill, name, targetX, targetY, facingLeft, h, max_h, walking }
let _world    = null;
let _resource = null; // spineData — загружается один раз

// Проинициализировать (вызывать один раз при старте игры)
export async function initOtherPlayers(world) {
  _world = world;
  try {
    _resource = await PIXI.Assets.load('/assets/spine/Catt.json');
  } catch (e) {
    console.warn('[otherPlayers] не удалось загрузить Spine:', e);
  }
}

// Применить снапшот от сервера (вызывать из обработчика 'state')
export function applySnapshot(players) {
  const myId = getMyId();
  const seen  = new Set();

  for (const p of players) {
    if (p.id === myId) continue;
    seen.add(p.id);
    if (!others.has(p.id)) {
      _createOther(p);
    } else {
      _updateTarget(p);
    }
  }

  for (const [id] of others) {
    if (!seen.has(id)) _removeOther(id);
  }
}

// Плавное движение + разворот (вызывать каждый кадр)
export function updateOtherPlayers() {
  for (const other of others.values()) {
    const LERP = 0.25;
    const prevX = other.spine.x;
    other.spine.x += (other.targetX - other.spine.x) * LERP;
    other.spine.y += (other.targetY - other.spine.y) * LERP;

    // Анимация: ходьба или стойка
    const moving = Math.abs(other.targetX - other.spine.x) > 1 || other.walking;
    _setWalking(other, moving);

    // Разворот — используем сохранённый размер
    const sc = other.size ?? 0.7;
    other.spine.scale.x = other.facingLeft ? sc : -sc;
    other.spine.scale.y = sc;

    // Имя над головой
    other.nameText.x = other.spine.x;
    other.nameText.y = other.spine.y - 110;

    // HP
    _updateHealthBar(other);
  }
}

export function addOtherPlayer(p) {
  if (p.id === getMyId()) return;
  if (!others.has(p.id)) _createOther(p);
}

export function removeOtherPlayer(id) {
  _removeOther(id);
}

export function getOtherSprite(id) {
  return others.get(id)?.spine ?? null;
}

export function getAllOthers() {
  return [...others.entries()].map(([id, o]) => ({ id, name: o.name, sprite: o.spine }));
}

// ─── Внутреннее ──────────────────────────────────────────────────────────────

async function _createOther(p) {
  console.log('[createOther] id:', p.id, 'name:', p.name, 'size:', p.size);
  if (!_world) return;
  if (!_world) return;

  let spine = null;

  if (_resource) {
    try {
      const { Spine } = await import('pixi-spine');
      spine = new Spine(_resource.spineData);

      // Анимации
      const animNames  = _resource.spineData.animations.map(a => a.name);
      const stayAnim   = animNames.find(n => n === 'stay') ?? animNames[0];
      const walkAnim   = animNames.find(n => n === 'walk') ?? animNames[0];
      spine._idleAnim  = stayAnim;
      spine._walkAnim  = walkAnim;
      spine._isWalking = false;

      // Скрываем позы сидения/сна
      ['Sit', 'sleep'].forEach(name => {
        const slot = spine.skeleton.findSlot(name);
        if (slot) slot.setAttachment(null);
      });

      spine.state.setAnimation(0, stayAnim, true);

      // Телосложение
      applyCharacterBuild(spine, p.build ?? 'lean');

      // Цвета
      if (p.appearance) {
        applyCharacterColors(spine, p.appearance);
        const eyeSec = p.appearance.eyes
          ? Object.values(p.appearance.eyes)[0]
          : null;
        if (eyeSec) applyEyeColor(spine, eyeSec);
      }

      spine.scale.set(p.size ?? 0.7);
      spine.position.set(p.x, p.y);

    } catch (e) {
      console.warn('[otherPlayers] ошибка создания Spine, fallback на спрайт:', e);
      spine = null;
    }
  }

  // Fallback — статичный спрайт если Spine не загрузился
  if (!spine) {
    const BUILD_TEXTURES = {
      lean:  '/assets/spine/Cat_lean.png',
      large: '/assets/spine/Cat_massive.png',
      fat:   '/assets/spine/Cat_fat.png',
    };
    const url = BUILD_TEXTURES[p.build] ?? BUILD_TEXTURES.lean;
    let tex;
    try { tex = await PIXI.Assets.load(url); } catch { tex = PIXI.Texture.WHITE; }
    spine = new PIXI.Sprite(tex);
    spine.anchor.set(0.5, 1);
    spine.scale.set(0.7);
    spine.position.set(p.x, p.y);
    spine._idleAnim  = null;
    spine._walkAnim  = null;
    spine._isWalking = false;
  }

  // Имя
  const nameText = new PIXI.Text(p.name ?? 'Без имени', {
    fontSize: 14,
    fill: 0xffcc80,
    fontFamily: 'Arial',
    stroke: 0x000000,
    strokeThickness: 3,
  });
  nameText.anchor.set(0.5, 1);
  nameText.x = p.x;
  nameText.y = p.y - 110;

  // HP
  const hpBg   = new PIXI.Graphics();
  const hpFill = new PIXI.Graphics();

  _world.addChild(spine);
  _world.addChild(nameText);
  _world.addChild(hpBg);
  _world.addChild(hpFill);

  others.set(p.id, {
    spine, nameText, hpBg, hpFill,
    name:      p.name ?? 'Без имени',
    targetX:   p.x,
    targetY:   p.y,
    facingLeft: p.facingLeft ?? false,
    h:         p.h    ?? 100,
    max_h:     p.max_h ?? 100,
    walking:   false,
    pose:      'normal',
    size:      p.size ?? 0.7,
  });
}

function _setWalking(other, walking) {
  if (!other.spine.state || other._isWalking === walking) return;
  other._isWalking = walking;
  const anim = walking ? other.spine._walkAnim : other.spine._idleAnim;
  if (anim) {
    other.spine.state.setAnimation(0, anim, true);
    other.spine.state.timeScale = walking ? 1.5 : 1.0;
  }
}

function _updateTarget(p) {
  const other = others.get(p.id);
  if (!other) return;
  other.targetX    = p.x;
  other.targetY    = p.y;
  other.facingLeft = p.facingLeft ?? other.facingLeft;
  other.walking    = p.walking    ?? false;
  other.h          = p.h          ?? other.h;
  other.max_h      = p.max_h      ?? other.max_h;

  // Обновляем размер
  if (p.size && p.size !== other.size) {
    other.spine.scale.set(p.size);
    other.size = p.size;
  }

  // Применяем позу если изменилась
  const newPose = p.pose ?? 'normal';
  if (newPose !== other.pose && other.spine.state) {
    setCharacterPose(other.spine, newPose);
    other.pose = newPose;
    if (newPose === 'normal') other._isWalking = null;
  }
}

function _removeOther(id) {
  const other = others.get(id);
  if (!other) return;
  [other.spine, other.nameText, other.hpBg, other.hpFill].forEach(obj => {
    if (obj?.parent) obj.parent.removeChild(obj);
    obj?.destroy?.();
  });
  others.delete(id);
}

function _updateHealthBar(other) {
  const W = 50, H = 6;
  const x = other.spine.x - W / 2;
  const y = other.spine.y - (other.spine.height || 100) - 12;
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