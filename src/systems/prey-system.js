// prey-system.js
// Универсальная система дичи. Каждый вид дичи привязан к объекту-спавнеру
// на карте (картинка из /assets/fon). Объект выпускает зверька с заданной
// периодичностью, но ТОЛЬКО если в радиусе SPAWN_BLOCK_RADIUS нет персонажа.
//
// У каждого объекта есть «поголовье»: каждая поимка истощает место, и оно
// какое-то время восстанавливается (см. SIZE_DEPLETION) — выгодно чередовать
// точки охоты, а не выбивать одну.
//
// Дичь блуждает по карте. Удар клавишей E (см. main.js -> strikeNearestPrey)
// наносит урон; при достижении 0 здоровья зверёк погибает — на месте остаётся
// тушка. ПКМ по тушке -> "Съесть" -> прибавка сытости.
//
// Картинки дичи лежат в /assets/prey/<тип>.png
// Картинки объектов-спавнеров — в /assets/fon/<id>.png

import * as PIXI from 'pixi.js';
import { showContextMenu } from '../world/world-objects.js';
import {
  addXp,
  progressMoveTasks,
  getDamageMultiplier,
  PLAYER_BASE_DAMAGE_MIN,
  PLAYER_BASE_DAMAGE_MAX,
} from './xp-system.js';
import { spendSleepForStrike, gainFood } from './needs-system.js';
import { refreshActivePanel, getNeedValue } from '../ui/bottom-menu.js';
import { showToast } from '../ui/notify.js';

// === Параметры видов дичи ===
// food   — сколько % сытости даёт при поедании тушки
// health — запас здоровья (сколько урона нужно нанести, чтобы убить)
// size   — категория для опыта и заданий приёмов: small | medium | large
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

// Награда за поимку по категории дичи (опыт + ключ прогресса заданий приёмов)
const SIZE_REWARD = {
  small:  { xp: 0.5, taskKey: 'small'  }, // хилая дичь
  medium: { xp: 1.0, taskKey: 'medium' }, // средняя дичь
  large:  { xp: 1.5, taskKey: 'large'  }, // упитанная дичь
};

// === Истощение и восстановление спавна ===
// У каждого объекта есть «поголовье» (stock) — сколько ещё зверьков можно с него
// поймать. Каждая поимка уменьшает stock на 1. Когда stock доходит до 0, место
// истощено: новая дичь там не появляется, пока поголовье не восстановится.
// Восстановление идёт постоянно и плавно: +1 единица за regenMs.
//
// capacity — максимальный запас (мелкой дичи много, крупной — мало)
// regenMs  — за сколько восстанавливается ОДНА единица поголовья
// Подбор значений: мелочь выбивается надолго не сразу, крупная дичь истощается
// быстро и восстанавливается дольше — выгодно чередовать места охоты.
const SIZE_DEPLETION = {
  small:  { capacity: 6, regenMs: 90  * 1000 }, // полностью восстановится за ~9 мин
  medium: { capacity: 4, regenMs: 150 * 1000 }, // ~10 мин
  large:  { capacity: 3, regenMs: 240 * 1000 }, // ~12 мин
};

const MIN = 60 * 1000;

// === Объекты-спавнеры ===
// id      — имя файла объекта в /assets/fon (без .png) и его идентификатор
// prey    — какой вид дичи выпускает (ключ PREY_CONFIG)
// everyMs — период появления (новый зверёк появляется через everyMs после
//           того, как предыдущего поймали; первый — почти сразу при старте)
// x, y    — координаты объекта в мировых координатах.
// ВАЖНО: подкорректируй x/y под свою карту!
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

// Радиус (px), в пределах которого спавн блокируется присутствием персонажа
const SPAWN_BLOCK_RADIUS = 200;
// Радиус (px), в пределах которого клавиша E попадает по дичи
export const PREY_STRIKE_RADIUS = 90;

const PREY_SPEED = 2.2;   // скорость блуждания дичи (px/тик при 60fps)
const PREY_SCALE = 1;

const preyTexture    = (type) => `/assets/prey/${type}.png`;
const spawnerTexture = (id)   => `/assets/fon/${id}.png`;

let world = null;
let bounds = { minX: 100, maxX: 2200, minY: 100, maxY: 1100 };
const preyTextures = {}; // type -> PIXI.Texture
let spawners = [];       // рабочие копии SPAWNERS с состоянием
let activePrey = [];     // живые зверьки на карте: { sprite, cfg, type, spawner, health, dir, dirTimer }
let lastTickTime = 0;
const carried = [];      // подобранные тушки: { type, label, food }

// Список подобранной добычи (для вкладки «Инвентарь» или отладки)
export function getCarriedPrey() {
  return carried.slice();
}

// === Создание системы дичи ===
// worldContainer — контейнер мира (PIXI.Container)
// worldBounds    — { minX, maxX, minY, maxY } область блуждания дичи
export async function createPreySystem(worldContainer, worldBounds) {
  world = worldContainer;
  if (worldBounds) bounds = worldBounds;
  activePrey = [];
  carried.length = 0;

  // Загружаем текстуры дичи (по одной на тип). Если файла нет — пропускаем
  // тип, чтобы одна отсутствующая картинка не ломала всю игру.
  for (const [type] of Object.entries(PREY_CONFIG)) {
    try {
      preyTextures[type] = await PIXI.Assets.load(preyTexture(type));
    } catch (e) {
      console.warn(`Не удалось загрузить текстуру дичи: ${preyTexture(type)}`, e);
    }
  }

  // Создаём объекты-спавнеры и их состояние
  spawners = [];
  for (const cfg of SPAWNERS) {
    let sprite = null;
    try {
      const tex = await PIXI.Assets.load(spawnerTexture(cfg.id));
      sprite = new PIXI.Sprite(tex);
      sprite.anchor.set(0.5, 1); // «ножки» объекта на земле в точке (x, y)
      sprite.x = cfg.x;
      sprite.y = cfg.y;
      sprite.eventMode = 'none'; // декор: не перехватывает клики (иначе блокирует меню персонажа)
      world.addChild(sprite);
    } catch (e) {
      console.warn(`Не удалось загрузить объект-спавнер: ${spawnerTexture(cfg.id)}`, e);
    }

    const size = PREY_CONFIG[cfg.prey].size;
    const dep = SIZE_DEPLETION[size];

    spawners.push({
      ...cfg,
      sprite,
      current: null,              // ссылка на живого зверька этого спавнера (или null)
      cooldown: 0,                // мс до следующей попытки спавна (0 -> можно спавнить)
      capacity: dep.capacity,     // максимальный запас поголовья
      regenRate: 1 / dep.regenMs, // восстановление единиц поголовья в мс
      stock: dep.capacity,        // текущий запас (float); floor(stock) -> доступно поимок
      depleted: false,            // флаг «истощён» (для разового уведомления)
    });
  }

  lastTickTime = Date.now();
}

// === Вызывать каждый кадр из app.ticker, передавая активного персонажа ===
export function updatePreySystem(activeChar) {
  const now = Date.now();
  const dt = Math.min(now - lastTickTime, 1000); // защита от больших скачков (вкладка в фоне)
  lastTickTime = now;

  const charX = activeChar ? activeChar.x : null;
  const charY = activeChar ? activeChar.y : null;

  // Спавн и восстановление поголовья: проходим по объектам
  for (const sp of spawners) {
    // Поголовье постоянно восстанавливается до capacity
    if (sp.stock < sp.capacity) {
      sp.stock = Math.min(sp.capacity, sp.stock + sp.regenRate * dt);
    }
    updateSpawnerState(sp); // «насыщенность» объекта + уведомления об истощении/возврате

    // У спавнера уже есть живой зверёк — ждём, пока его поймают
    if (sp.current) continue;

    sp.cooldown -= dt;
    if (sp.cooldown > 0) continue;

    // Истощён — пока поголовье не накопит хотя бы 1 единицу, дичь не появляется
    if (Math.floor(sp.stock) < 1) {
      sp.cooldown = 0;
      continue;
    }

    // Время пришло. Спавним только если рядом нет персонажа.
    if (charX !== null && isNear(sp.x, sp.y, charX, charY, SPAWN_BLOCK_RADIUS)) {
      sp.cooldown = 0; // персонаж рядом — повторим попытку на следующих кадрах
      continue;
    }

    spawnPrey(sp);
    sp.cooldown = sp.everyMs; // следующий зверёк появится не раньше, чем через everyMs
  }

  // Движение живой дичи (блуждание)
  for (const p of activePrey) {
    p.dirTimer--;
    if (p.dirTimer <= 0) pickDirection(p);

    p.sprite.x += p.dir.x * PREY_SPEED;
    p.sprite.y += p.dir.y * PREY_SPEED;

    if (p.sprite.x < bounds.minX) { p.sprite.x = bounds.minX; p.dir.x *= -1; }
    else if (p.sprite.x > bounds.maxX) { p.sprite.x = bounds.maxX; p.dir.x *= -1; }

    if (p.sprite.y < bounds.minY) { p.sprite.y = bounds.minY; p.dir.y *= -1; }
    else if (p.sprite.y > bounds.maxY) { p.sprite.y = bounds.maxY; p.dir.y *= -1; }

    // Разворот спрайта по направлению движения
    p.sprite.scale.x = p.dir.x < 0 ? -PREY_SCALE : PREY_SCALE;
  }
}

// === Удар по ближайшей дичи в радиусе (клавиша E из main.js) ===
// Возвращает true, если в радиусе была дичь (цель найдена и обработана),
// false — если рядом дичи нет (main.js может попробовать другую цель).
export function strikeNearestPrey(charX, charY) {
  let target = null;
  let bestDist = Infinity;

  for (const p of activePrey) {
    const dx = p.sprite.x - charX;
    const dy = p.sprite.y - charY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= PREY_STRIKE_RADIUS && dist < bestDist) {
      bestDist = dist;
      target = p;
    }
  }

  if (!target) return false; // дичи в радиусе нет

  // Без бодрости ударить нельзя
  if ((getNeedValue('e') ?? 0) <= 0) {
    showToast('Котик слишком устал. Поспим?');
    return true;
  }

  spendSleepForStrike(5); // удар тратит 5 бодрости

  // Урон с учётом звания (как у боя с лисой)
  const base = PLAYER_BASE_DAMAGE_MIN + Math.random() * (PLAYER_BASE_DAMAGE_MAX - PLAYER_BASE_DAMAGE_MIN);
  const damage = Math.max(1, Math.round(base * getDamageMultiplier()));

  target.health = Math.max(0, target.health - damage);

  if (target.health <= 0) {
    killPrey(target);
  } else {
    showToast(`${target.cfg.label}: удар! Осталось здоровья: ${target.health}`);
  }
  return true;
}

// === Внутреннее ===

function spawnPrey(sp) {
  const tex = preyTextures[sp.prey];
  if (!tex) return; // текстура не загрузилась — не спавним

  const cfg = PREY_CONFIG[sp.prey];

  const sprite = new PIXI.Sprite(tex);
  sprite.anchor.set(0.5);
  sprite.scale.set(PREY_SCALE);
  sprite.x = sp.x;
  sprite.y = sp.y - 20; // чуть выше «земли» объекта
  sprite.eventMode = 'none'; // бегущая дичь не перехватывает ПКМ (иначе ломает меню персонажа)

  world.addChild(sprite);

  const prey = {
    sprite,
    cfg,
    type: sp.prey,
    spawner: sp,
    health: cfg.health,
    dir: { x: 0, y: 0 },
    dirTimer: 0,
  };
  pickDirection(prey);

  sp.current = prey;
  activePrey.push(prey);
}

function pickDirection(prey) {
  const angle = Math.random() * Math.PI * 2;
  prey.dir.x = Math.cos(angle);
  prey.dir.y = Math.sin(angle);
  prey.dirTimer = 60 + Math.random() * 120; // ~1–3 сек при 60fps
}

function killPrey(prey) {
  const { cfg, spawner } = prey;

  // Тушка на месте гибели
  createCarcass(prey.sprite.x, prey.sprite.y, prey.sprite.texture, cfg, prey.type);

  // Убираем живого зверька
  if (prey.sprite.parent) prey.sprite.parent.removeChild(prey.sprite);
  prey.sprite.destroy();
  activePrey = activePrey.filter((p) => p !== prey);

  // Освобождаем спавнер и тратим единицу поголовья. Следующий зверёк появится
  // через everyMs и только если место не истощено (stock не упал до 0).
  spawner.current = null;
  spawner.cooldown = spawner.everyMs;
  spawner.stock = Math.max(0, spawner.stock - 1);

  // Награда (опыт начисляется в момент убийства, а не поедания)
  const reward = SIZE_REWARD[cfg.size];
  addXp(reward.xp);
  progressMoveTasks(reward.taskKey);
  refreshActivePanel();

  showToast(`${cfg.label} пойман!`);
}

function createCarcass(x, y, texture, cfg, type) {
  const carcass = new PIXI.Sprite(texture);
  carcass.anchor.set(0.5);
  carcass.scale.set(PREY_SCALE);
  carcass.rotation = Math.PI / 2; // лежит на боку
  carcass.x = x;
  carcass.y = y;
  carcass.eventMode = 'static'; // тушку можно кликнуть (в отличие от живой дичи)
  carcass.cursor = 'pointer';

  carcass.on('rightclick', (e) => {
    e.stopPropagation();
    showContextMenu(e, [
      { label: 'Съесть',  onClick: () => eatCarcass(carcass, cfg) },
      { label: 'Поднять', onClick: () => pickUpCarcass(carcass, cfg, type) },
    ]);
  });

  world.addChild(carcass);
}

function eatCarcass(carcass, cfg) {
  gainFood(cfg.food);
  showToast(`Вы съели: ${cfg.label}! Сытость +${cfg.food}%`);

  if (carcass.parent) carcass.parent.removeChild(carcass);
  carcass.destroy();
}

// «Поднять» — убрать тушку с карты и положить в переноску (carried).
// Полноценного инвентаря в проекте пока нет, поэтому добыча копится в памяти;
// список доступен через getCarriedPrey() — его можно вывести во вкладке «Инвентарь».
function pickUpCarcass(carcass, cfg, type) {
  carried.push({ type, label: cfg.label, food: cfg.food });
  showToast(`Подобрано: ${cfg.label} (в переноске: ${carried.length})`);

  if (carcass.parent) carcass.parent.removeChild(carcass);
  carcass.destroy();
}

// Визуальное состояние спавнера: чем меньше поголовья, тем бледнее объект.
// Плюс разовое уведомление в момент истощения и в момент возврата дичи.
function updateSpawnerState(sp) {
  if (sp.sprite) {
    const frac = sp.capacity > 0 ? sp.stock / sp.capacity : 0;
    sp.sprite.alpha = 0.45 + 0.55 * frac;              // 0.45 (пусто) … 1.0 (полно)
    sp.sprite.tint = frac < 0.2 ? 0x888888 : 0xffffff; // приглушаем почти пустой объект
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

// Текущее состояние спавнеров (для отладки или будущего интерфейса)
export function getSpawnerStates() {
  return spawners.map((sp) => ({
    id: sp.id,
    prey: sp.prey,
    stock: Math.floor(sp.stock),
    capacity: sp.capacity,
    depleted: sp.depleted,
  }));
}

function isNear(ax, ay, bx, by, radius) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy <= radius * radius;
}
