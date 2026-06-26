import * as PIXI from 'pixi.js';
import { showContextMenu } from '../world/world-objects.js';
import {
  addXp, progressMoveTasks,
  getDamageMultiplier,
  PLAYER_BASE_DAMAGE_MIN,
  PLAYER_BASE_DAMAGE_MAX,
} from './skills.js';
import { spendEnergyForStrike, gainFood, getNeed } from './player-system.js';
import { refreshActivePanel } from '../ui/bottom-menu.js';
import { showToast } from '../ui/notify.js';

const PREY_CONFIG = {
  bunny:    { label: 'Кролик',  food: 10, health: 10, size: 'small'  },
  mouse:    { label: 'Мышь',    food: 10, health: 10, size: 'small'  },
  hedgehog: { label: 'Ёж',      food: 10, health: 10, size: 'small'  },
  perch:    { label: 'Окунь',   food: 10, health: 10, size: 'small'  },
  squirrel: { label: 'Белка',   food: 20, health: 20, size: 'medium' },
  snake:    { label: 'Змея',    food: 20, health: 20, size: 'medium' },
  crucian:  { label: 'Карась',  food: 20, health: 20, size: 'medium' },
  grouse:   { label: 'Тетерев', food: 30, health: 30, size: 'large'  },
  beaver:   { label: 'Бобёр',   food: 30, health: 30, size: 'large'  },
  hare:     { label: 'Заяц',    food: 30, health: 30, size: 'large'  },
};

const SIZE_REWARD = {
  small:  { xp: 0.5, taskKey: 'small'  },
  medium: { xp: 1.0, taskKey: 'medium' },
  large:  { xp: 1.5, taskKey: 'large'  },
};

const SIZE_DEPLETION = {
  small:  { capacity: 6, regenMs: 90  * 1000 },
  medium: { capacity: 4, regenMs: 150 * 1000 },
  large:  { capacity: 3, regenMs: 240 * 1000 },
};

const MIN = 60 * 1000;

const SPAWNERS = [
  { id: 'gree_spawn_bunny',     prey: 'bunny',    everyMs: 2 * MIN, x: 500,  y: 400 },
  { id: 'gree_spawn_mouse',     prey: 'mouse',    everyMs: 2 * MIN, x: 850,  y: 350 },
  { id: 'stone_spawn_hedgehog', prey: 'hedgehog', everyMs: 2 * MIN, x: 1200, y: 500 },
  { id: 'stone_spawn_snake',    prey: 'snake',    everyMs: 3 * MIN, x: 1350, y: 600 },
  { id: 'tree_spawn_grouse',    prey: 'grouse',   everyMs: 5 * MIN, x: 700,  y: 900 },
  { id: 'tree_spawn_squirrel',  prey: 'squirrel', everyMs: 3 * MIN, x: 950,  y: 950 },
  { id: 'burrow_spawn_hare',    prey: 'hare',     everyMs: 5 * MIN, x: 1500, y: 800 },
  { id: 'water_spawn_beaver',   prey: 'beaver',   everyMs: 5 * MIN, x: 2000, y: 700 },
  { id: 'water_spawn_crucian',  prey: 'crucian',  everyMs: 3 * MIN, x: 2070, y: 760 },
  { id: 'water_spawn_perch',    prey: 'perch',    everyMs: 2 * MIN, x: 1930, y: 760 },
];

const SPAWN_BLOCK_RADIUS = 200;
export const PREY_STRIKE_RADIUS = 90;

const PREY_SPEED = 2.2;
const PREY_SCALE = 1;

let world   = null;
let bounds  = { minX: 100, maxX: 2200, minY: 100, maxY: 1100 };
const preyTextures = {};
let spawners    = [];
let activePrey  = [];
let lastTickTime = 0;
const carried   = [];

export function getCarriedPrey() {
  return carried.slice();
}

export async function createPreySystem(worldContainer, worldBounds) {
  world = worldContainer;
  if (worldBounds) bounds = worldBounds;
  activePrey = [];
  carried.length = 0;

  for (const [type] of Object.entries(PREY_CONFIG)) {
    try {
      preyTextures[type] = await PIXI.Assets.load(`/assets/prey/${type}.png`);
    } catch (e) {
      console.warn(`Не удалось загрузить текстуру дичи: /assets/prey/${type}.png`, e);
    }
  }

  spawners = [];
  for (const cfg of SPAWNERS) {
    let sprite = null;
    try {
      const tex = await PIXI.Assets.load(`/assets/fon/${cfg.id}.png`);
      sprite = new PIXI.Sprite(tex);
      sprite.anchor.set(0.5, 1);
      sprite.x = cfg.x;
      sprite.y = cfg.y;
      sprite.eventMode = 'none';
      world.addChild(sprite);
    } catch (e) {
      console.warn(`Не удалось загрузить объект-спавнер: /assets/fon/${cfg.id}.png`, e);
    }

    const size = PREY_CONFIG[cfg.prey].size;
    const dep  = SIZE_DEPLETION[size];

    spawners.push({
      ...cfg,
      sprite,
      current:   null,
      cooldown:  0,
      capacity:  dep.capacity,
      regenRate: 1 / dep.regenMs,
      stock:     dep.capacity,
      depleted:  false,
    });
  }

  lastTickTime = Date.now();
}

export function updatePreySystem(activeChar) {
  const now = Date.now();
  const dt  = Math.min(now - lastTickTime, 1000);
  lastTickTime = now;

  const charX = activeChar ? activeChar.x : null;
  const charY = activeChar ? activeChar.y : null;

  for (const sp of spawners) {
    if (sp.stock < sp.capacity) {
      sp.stock = Math.min(sp.capacity, sp.stock + sp.regenRate * dt);
    }
    _updateSpawnerState(sp);

    if (sp.current) continue;
    sp.cooldown -= dt;
    if (sp.cooldown > 0) continue;
    if (Math.floor(sp.stock) < 1) { sp.cooldown = 0; continue; }
    if (charX !== null && _isNear(sp.x, sp.y, charX, charY, SPAWN_BLOCK_RADIUS)) { sp.cooldown = 0; continue; }

    _spawnPrey(sp);
    sp.cooldown = sp.everyMs;
  }

  for (const p of activePrey) {
    p.dirTimer--;
    if (p.dirTimer <= 0) _pickDirection(p);

    p.sprite.x += p.dir.x * PREY_SPEED;
    p.sprite.y += p.dir.y * PREY_SPEED;

    if (p.sprite.x < bounds.minX) { p.sprite.x = bounds.minX; p.dir.x *= -1; }
    else if (p.sprite.x > bounds.maxX) { p.sprite.x = bounds.maxX; p.dir.x *= -1; }

    if (p.sprite.y < bounds.minY) { p.sprite.y = bounds.minY; p.dir.y *= -1; }
    else if (p.sprite.y > bounds.maxY) { p.sprite.y = bounds.maxY; p.dir.y *= -1; }

    p.sprite.scale.x = p.dir.x < 0 ? -PREY_SCALE : PREY_SCALE;
  }
}

export function strikeNearestPrey(charX, charY) {
  let target   = null;
  let bestDist = Infinity;

  for (const p of activePrey) {
    const dx   = p.sprite.x - charX;
    const dy   = p.sprite.y - charY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= PREY_STRIKE_RADIUS && dist < bestDist) {
      bestDist = dist;
      target   = p;
    }
  }

  if (!target) return false;

  if ((getNeed('e') ?? 0) <= 0) {
    showToast('Котик слишком устал. Поспим?');
    return true;
  }

  spendEnergyForStrike(5);

  const base   = PLAYER_BASE_DAMAGE_MIN + Math.random() * (PLAYER_BASE_DAMAGE_MAX - PLAYER_BASE_DAMAGE_MIN);
  const damage = Math.max(1, Math.round(base * getDamageMultiplier()));

  target.health = Math.max(0, target.health - damage);

  if (target.health <= 0) {
    _killPrey(target);
  } else {
    showToast(`${target.cfg.label}: удар! Осталось здоровья: ${target.health}`);
  }
  return true;
}

function _spawnPrey(sp) {
  const tex = preyTextures[sp.prey];
  if (!tex) return;

  const cfg    = PREY_CONFIG[sp.prey];
  const sprite = new PIXI.Sprite(tex);
  sprite.anchor.set(0.5);
  sprite.scale.set(PREY_SCALE);
  sprite.x = sp.x;
  sprite.y = sp.y - 20;
  sprite.eventMode = 'none';
  world.addChild(sprite);

  const prey = { sprite, cfg, type: sp.prey, spawner: sp, health: cfg.health, dir: { x: 0, y: 0 }, dirTimer: 0 };
  _pickDirection(prey);
  sp.current = prey;
  activePrey.push(prey);
}

function _pickDirection(prey) {
  const angle  = Math.random() * Math.PI * 2;
  prey.dir.x   = Math.cos(angle);
  prey.dir.y   = Math.sin(angle);
  prey.dirTimer = 60 + Math.random() * 120;
}

function _killPrey(prey) {
  const { cfg, spawner } = prey;

  _createCarcass(prey.sprite.x, prey.sprite.y, prey.sprite.texture, cfg, prey.type);

  if (prey.sprite.parent) prey.sprite.parent.removeChild(prey.sprite);
  prey.sprite.destroy();
  activePrey = activePrey.filter((p) => p !== prey);

  spawner.current  = null;
  spawner.cooldown = spawner.everyMs;
  spawner.stock    = Math.max(0, spawner.stock - 1);

  const reward = SIZE_REWARD[cfg.size];
  addXp(reward.xp);
  progressMoveTasks(reward.taskKey);
  refreshActivePanel();

  showToast(`${cfg.label} пойман!`);
}

function _createCarcass(x, y, texture, cfg, type) {
  const carcass      = new PIXI.Sprite(texture);
  carcass.anchor.set(0.5);
  carcass.scale.set(PREY_SCALE);
  carcass.rotation   = Math.PI / 2;
  carcass.x          = x;
  carcass.y          = y;
  carcass.eventMode  = 'static';
  carcass.cursor     = 'pointer';

  carcass.on('rightclick', (e) => {
    e.stopPropagation();
    showContextMenu(e, [
      { label: 'Съесть',  onClick: () => _eatCarcass(carcass, cfg) },
      { label: 'Поднять', onClick: () => _pickUpCarcass(carcass, cfg, type) },
    ]);
  });

  world.addChild(carcass);
}

function _eatCarcass(carcass, cfg) {
  gainFood(cfg.food);
  showToast(`Вы съели: ${cfg.label}! Сытость +${cfg.food}%`);
  if (carcass.parent) carcass.parent.removeChild(carcass);
  carcass.destroy();
}

function _pickUpCarcass(carcass, cfg, type) {
  carried.push({ type, label: cfg.label, food: cfg.food });
  showToast(`Подобрано: ${cfg.label} (в переноске: ${carried.length})`);
  if (carcass.parent) carcass.parent.removeChild(carcass);
  carcass.destroy();
}

function _updateSpawnerState(sp) {
  if (sp.sprite) {
    const frac       = sp.capacity > 0 ? sp.stock / sp.capacity : 0;
    sp.sprite.alpha  = 0.45 + 0.55 * frac;
    sp.sprite.tint   = frac < 0.2 ? 0x888888 : 0xffffff;
  }

  const empty = Math.floor(sp.stock) < 1;
  if (empty && !sp.depleted) {
    sp.depleted = true;
    showToast(`Место истощено — ${PREY_CONFIG[sp.prey].label.toLowerCase()} временно не водится`);
  } else if (!empty && sp.depleted) {
    sp.depleted = false;
    showToast(`Дичь вернулась: ${PREY_CONFIG[sp.prey].label.toLowerCase()}`);
  }
}

export function getSpawnerStates() {
  return spawners.map((sp) => ({
    id:       sp.id,
    prey:     sp.prey,
    stock:    Math.floor(sp.stock),
    capacity: sp.capacity,
    depleted: sp.depleted,
  }));
}

function _isNear(ax, ay, bx, by, radius) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy <= radius * radius;
}
