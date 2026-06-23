// xp-system.js
// Система опыта, званий и боевых приёмов.
//
// Опыт (xp) копится за тренировки, охоту и победы в бою.
// Звания: Котёнок -> Оруженосец -> Воин -> Страж -> Легенда.
// Каждое звание даёт пассивный бонус и множитель силы удара.
// При повышении звания персонаж получает +30 к максимальному здоровью
// и +10 к максимальной бодрости (шкала "Сон"); начиная со звания Воин,
// дополнительно действует пассивный бонус +10 к максимальной бодрости.
//
// С Оруженосца открывается изучение боевых приёмов: у каждого приёма есть
// 1-2 задания (поймать дичь определённого вида, потренироваться и т.д.),
// которые нужно выполнить, чтобы приём считался изученным. Выученные приёмы
// дают пассивные эффекты, применяемые в бою (см. applyMoveEffects).

import { addMaxHealthBonus } from './character-profile.js';
import { addMaxSleepBonus, gainEnergy } from './needs-system.js';
import { getCharacterStorageKey } from './character-save.js';

const STORAGE_KEY_BASE = 'warrcats_xp_system';

function getStorageKey() {
  return getCharacterStorageKey(STORAGE_KEY_BASE);
}

const HEALTH_BONUS_PER_LEVEL = 30;
const SLEEP_BONUS_PER_LEVEL = 10;
const SLEEP_BONUS_RANK3_EXTRA = 10;

// Базовый случайный урон удара (до бонусов звания/приёмов) — единый источник
// истины для enemy-fox.js (бой) и отображения "Урон" в "О персонаже".
export const PLAYER_BASE_DAMAGE_MIN = 3;
export const PLAYER_BASE_DAMAGE_MAX = 7;

export const RANKS = [
  { name: 'Котёнок',    min: 0,    max: 150,      lvl: 1, dam: 1.0, bonus: '—' },
  { name: 'Оруженосец', min: 150,  max: 300,      lvl: 2, dam: 1.3, bonus: 'Скорость +10%' },
  { name: 'Воитель',       min: 300,  max: 700,      lvl: 3, dam: 1.6, bonus: 'Тренировка −10% сна, +10 макс. бодрости' },
  { name: 'Страж',      min: 700,  max: 1000,     lvl: 4, dam: 2.0, bonus: 'Радиус поимки +30%' },
  { name: 'Легенда',    min: 1000, max: Infinity, lvl: 5, dam: 2.5, bonus: 'Лечение +1%/сутки' },
];

export const XP_REWARDS = {
  train: 0.3,
  hunt: 0.5,
  battleWin: 10,
};

export const PREY_CATEGORIES = {
  small:  ['кролик', 'мышь', 'ёж', 'окунь'],
  medium: ['белка', 'змея', 'карась'],
  large:  ['бобёр', 'тетерев'],
};

export const MOVES = [
  {
    id: 'm1', tier: 1,
    name: 'Удар сзади',
    eff: 'Неожиданная атака задними лапами в голову.',
    tasks: [
      { label: 'Потренироваться 5 раз', desc: 'у дерева или пня', need: 5, key: 'train' },
      { label: 'Поймать 5 хилой дичи', desc: 'мышь, кролик, ёж, окунь', need: 5, key: 'small' },
    ],
    rewardXp: 8, // +8 xp
    rewardText: 'Награда «Выносливость»: +5 к здоровью, +10 к бодрости',
    effect: { type: 'damageMult', value: 1.5 },
    healthBonus: 5,  // +5h к максимальному здоровью
    sleepBonus: 10,  // +10e к максимальной бодрости
  },
  {
    id: 'm2', tier: 1,
    name: 'Прочёс живота',
    eff: 'Полосните противника по животу.',
    tasks: [
      { label: 'Поймать 3 средней дичи', desc: 'белка, змея, карась', need: 3, key: 'medium' },
      { label: 'Потренироваться 7 раз', desc: 'у дерева или пня', need: 7, key: 'train' },
    ],
    rewardXp: 10, // +10 xp
    rewardText: 'Награда: +5 к здоровью. Пассив «Кровотечение» — −8 здоровья за 2 с (шанс 5%)',
    // bleed: с шансом chance наносит damage урона за durationMs (см. applyMoveEffects)
    effect: { type: 'bleed', chance: 0.05, damage: 8, durationMs: 2000 },
    healthBonus: 5, // +5h к максимальному здоровью
  },
  {
    id: 'm3', tier: 1,
    name: 'Удар передней лапой',
    eff: 'Сильный удар по голове со втянутыми когтями.',
    tasks: [
      { label: 'Потренироваться с котом 3 раза', desc: 'совместная тренировка', need: 3, key: 'sparring' },
      { label: 'Потренироваться у дерева 5 раз', desc: 'у дерева или пня', need: 5, key: 'train' },
      { label: 'Поймать 3 средней дичи', desc: 'белка, змея, карась', need: 3, key: 'medium' },
    ],
    rewardXp: 12,
    rewardText: '+5 энергии. Пассив «Оглушение» — шанс 2%: противник не может бить 3 сек',
    effect: { type: 'stun', chance: 0.02, durationMs: 3000 },
    energyReward: 5, // +5 бодрости сейчас (не к максимуму)
  },
  {
    id: 'm4', tier: 1,
    name: 'Скользящий удар',
    eff: 'Полосующий удар по противнику.',
    tasks: [
      { label: 'Потренироваться с котом 3 раза', desc: 'совместная тренировка', need: 3, key: 'sparring' },
      { label: 'Потренироваться у дерева/пня 8 раз', desc: 'у дерева или пня', need: 8, key: 'train' },
      { label: 'Поймать тетерева, бобра или зайца', desc: 'тетерев, бобёр, заяц', need: 1, key: 'large' },
    ],
    rewardXp: 14,
    rewardText: '+5 здоровья, +3 силы. Пассив «Царапина» — шанс 10%: −10 здоровья противнику за 5 сек',
    effect: { type: 'scratch', chance: 0.10, damage: 10, durationMs: 5000 },
    healthBonus: 5, // +5h к максимальному здоровью
    strengthBonus: 3, // +3 к силе (множитель урона)
  },
  {
    id: 'm5', tier: 1,
    name: 'Мёртвая хватка',
    eff: 'Захват шеи зубами. Иммобилизует противника на 2 секунды.',
    tasks: [
      { label: 'Потренироваться с другим котом 5 раз', desc: 'совместная тренировка', need: 5, key: 'sparring' },
      { label: 'Поймать 4 средней дичи', desc: 'хорёк, белка, жаба, змея, зяблик, карась', need: 4, key: 'medium' },
    ],
    rewardXp: 15,
    rewardText: 'Бонус «Сталь» — длительность хватки +0.5 с на каждый уровень Силы',
    effect: { type: 'immobilize', value: 2 },
  },
  {
    id: 'm6', tier: 2,
    name: 'Прыжок с зацепом',
    eff: 'Прыжок на спину с захватом когтями. Невозможно сбросить первые 1.5 с.',
    tasks: [
      { label: 'Поймать 6 средней дичи', desc: 'хорёк, белка, жаба, змея, зяблик', need: 6, key: 'medium' },
      { label: 'Поймать 2 упитанной дичи', desc: 'выдра, тетерев, фазан, лесная куница', need: 2, key: 'large' },
    ],
    rewardXp: 20,
    rewardText: 'Навык «Акробат» — высота прыжка +25%, чаще удаётся запрыгнуть',
    effect: { type: 'jumpBoost', value: 0.25 },
  },
  {
    id: 'm7', tier: 2,
    name: 'Встряска',
    eff: 'Встряхивание захваченного — дезориентирует и снимает защиту.',
    tasks: [
      { label: 'Поймать 8 средней дичи', desc: 'хорёк, белка, жаба, змея, зяблик', need: 8, key: 'medium' },
      { label: 'Победить песца', desc: 'как минимум 1 раз', need: 1, key: 'arctic_fox' },
    ],
    rewardXp: 18,
    rewardText: 'Пассивный эффект «Дезориентация» — защита противника −20% на 3 с, +10 к здоровью',
    effect: { type: 'defenseShred', value: 0.2 },
    healthBonus: 10,
  },
  {
    id: 'm8', tier: 2,
    name: 'Вертикальный бросок',
    eff: 'Бросок противника вверх и удар при падении. Максимальный урон в игре.',
    tasks: [
      { label: 'Поймать 5 упитанной дичи', desc: 'выдра, тетерев, фазан, лесная куница', need: 5, key: 'large' },
      { label: 'Победить лису', desc: 'как минимум 1 раз', need: 1, key: 'fox' },
    ],
    rewardXp: 25,
    rewardText: 'Бонус «Земной удар» — урон x2.2 при броске + оглушение 1 с',
    effect: { type: 'damageMult', value: 2.2, stun: 1 },
  },
  {
    id: 'm9', tier: 2,
    name: 'Бросок на плечи',
    eff: 'Захват и бросок через себя. Противник теряет половину очков позиции.',
    tasks: [
      { label: 'Поймать 4 упитанной дичи', desc: 'выдра, тетерев, фазан, лесная куница', need: 4, key: 'large' },
      { label: 'Победить песца', desc: 'как минимум 1 раз', need: 1, key: 'arctic_fox' },
    ],
    rewardXp: 22,
    rewardText: 'Навык «Рычаг» — отбрасывание противника увеличено в 1.5 раза, +10 к здоровью',
    effect: { type: 'knockback', value: 1.5 },
    healthBonus: 10,
  },
  {
    id: 'm10', tier: 2,
    name: 'Перекатывание',
    eff: 'Уход перекатом в атаку. Полностью избегает встречного удара.',
    tasks: [
      { label: 'Поймать 6 средней дичи', desc: 'хорёк, белка, жаба, змея, зяблик', need: 6, key: 'medium' },
      { label: 'Победить лису', desc: 'как минимум 1 раз', need: 1, key: 'fox' },
    ],
    rewardXp: 20,
    rewardText: 'Пассивный эффект «Гибкость» — шанс 30% перейти в контратаку после переката',
    effect: { type: 'counterChance', value: 0.3 },
  },
];

let xp = 0;
let moveStates = {};
let selectedMoveId = null;

function defaultMoveStates() {
  const states = {};
  MOVES.forEach(m => {
    states[m.id] = { status: 'locked', prog: {} };
    m.tasks.forEach(t => { states[m.id].prog[t.key] = 0; });
  });
  return states;
}

function loadState() {
  try {
    const saved = localStorage.getItem(getStorageKey());
    if (saved) {
      const parsed = JSON.parse(saved);
      xp = parsed.xp ?? 0;
      moveStates = { ...defaultMoveStates(), ...(parsed.moveStates ?? {}) };
      selectedMoveId = parsed.selectedMoveId ?? null;
      strengthBonusTotal = parsed.strengthBonusTotal ?? 0;
      appliedStrengthBonusKeys = parsed.appliedStrengthBonusKeys ?? {};
      if (selectedMoveId && (!moveStates[selectedMoveId] || moveStates[selectedMoveId].status !== 'inprogress')) {
        selectedMoveId = null;
      }
      if (!selectedMoveId) {
        selectedMoveId = Object.keys(moveStates).find(id => moveStates[id]?.status === 'inprogress') || null;
      }
      return;
    }
  } catch (e) {
    console.error('Ошибка загрузки системы опыта:', e);
  }
  xp = 0;
  moveStates = defaultMoveStates();
  selectedMoveId = null;
}

function saveState() {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify({ xp, moveStates, selectedMoveId, strengthBonusTotal, appliedStrengthBonusKeys }));
  } catch (e) {
    console.error('Ошибка сохранения системы опыта:', e);
  }
}

loadState();

// Перечитать систему опыта/приёмов из localStorage для текущего активного
// персонажа. Вызывать при смене активного персонажа / перед стартом игры.
export function reloadForActiveCharacter() {
  loadState();
  applyRank3SleepBonusIfNeeded();
}

applyRank3SleepBonusIfNeeded();

function applyRank3SleepBonusIfNeeded() {
  if (getRank().lvl >= 3) {
    addMaxSleepBonus(SLEEP_BONUS_RANK3_EXTRA, 'rank3_passive');
  }
}

export function getXp() {
  return Math.round(xp * 10) / 10;
}

export function getRank(value = xp) {
  return RANKS.slice().reverse().find(r => value >= r.min) || RANKS[0];
}

export function addXp(sourceOrAmount) {
  const amount = typeof sourceOrAmount === 'number'
    ? sourceOrAmount
    : (XP_REWARDS[sourceOrAmount] ?? 0);

  if (amount <= 0) return { gained: 0, leveledUp: false, rank: getRank() };

  const oldRank = getRank();
  xp = Math.round((xp + amount) * 10) / 10;
  const newRank = getRank();

  const leveledUp = newRank.lvl > oldRank.lvl;

  if (leveledUp) {
    for (let lvl = oldRank.lvl + 1; lvl <= newRank.lvl; lvl++) {
      addMaxHealthBonus(HEALTH_BONUS_PER_LEVEL);
      addMaxSleepBonus(SLEEP_BONUS_PER_LEVEL, `level_${lvl}`);
      if (lvl === 3) {
        addMaxSleepBonus(SLEEP_BONUS_RANK3_EXTRA, 'rank3_passive');
      }
    }
  }

  saveState();

  return { gained: amount, leveledUp, rank: newRank };
}

// Бонус к силе удара от изученных приёмов (аддитивный множитель к dam звания).
// Хранится отдельно: при loadState восстанавливается из saved.strengthBonusTotal.
let strengthBonusTotal = 0;
let appliedStrengthBonusKeys = {};

// Применить бонус к силе удара (однократно по ключу, защита от двойного начисления).
function applyStrengthBonus(amount, key) {
  if (!amount) return;
  if (key && appliedStrengthBonusKeys[key] !== undefined) return;
  if (key) appliedStrengthBonusKeys[key] = amount;
  strengthBonusTotal += amount;
}

export function getDamageMultiplier() {
  return getRank().dam + strengthBonusTotal * 0.01; // каждая единица силы = +1% к множителю
}

// Расчётный урон персонажа (диапазон min-max), с учётом множителя текущего
// звания, но без учёта случайных бонусов боевых приёмов (они срабатывают
// с шансом за удар). Используется для отображения строки "Урон" во вкладке
// "О персонаже".
export function getCalculatedDamage() {
  const mult = getDamageMultiplier();
  const min = Math.round(PLAYER_BASE_DAMAGE_MIN * mult);
  const max = Math.round(PLAYER_BASE_DAMAGE_MAX * mult);
  return { min, max };
}

export function getRankBonusText() {
  return getRank().bonus;
}

export function getMoveState(id) {
  return moveStates[id] ?? { status: 'locked', prog: {} };
}

export function getSelectedMoveId() {
  return selectedMoveId;
}

export function isMoveLearned(id) {
  return getMoveState(id).status === 'done';
}

export function getLearnedMoves() {
  return MOVES.filter(m => isMoveLearned(m.id));
}

export function isTierUnlocked(tier) {
  const rank = getRank();
  if (tier === 1) return rank.lvl >= 2;
  if (tier === 2) return rank.lvl >= 3;
  return false;
}

export function startLearningMove(id) {
  const move = MOVES.find(m => m.id === id);
  if (!move) return false;
  if (!isTierUnlocked(move.tier)) return false;

  const state = getMoveState(id);
  if (state.status === 'done') return false;

  // Нельзя начать изучение другого приёма, пока текущий не завершён.
  if (selectedMoveId && selectedMoveId !== id) {
    return false;
  }

  if (state.status !== 'inprogress') {
    moveStates[id] = { status: 'inprogress', prog: state.prog ?? {} };
    move.tasks.forEach(t => {
      if (moveStates[id].prog[t.key] === undefined) moveStates[id].prog[t.key] = 0;
    });
  }

  selectedMoveId = id;
  saveState();
  return true;
}

export function progressMoveTasks(key, amount = 1) {
  const completed = [];
  if (!selectedMoveId) {
    saveState();
    return completed;
  }

  const move = MOVES.find(m => m.id === selectedMoveId);
  const state = moveStates[selectedMoveId];
  if (!move || !state || state.status !== 'inprogress') {
    saveState();
    return completed;
  }

  const relevantTask = move.tasks.find(t => t.key === key);
  if (!relevantTask) {
    saveState();
    return completed;
  }

  const current = state.prog[key] ?? 0;
  if (current < relevantTask.need) {
    state.prog[key] = Math.min(relevantTask.need, current + amount);
  }

  const allDone = move.tasks.every(t => (state.prog[t.key] ?? 0) >= t.need);
  if (allDone) {
    state.status = 'done';
    selectedMoveId = null;
    const result = addXp(move.rewardXp);                                   // +xp
    if (move.healthBonus) addMaxHealthBonus(move.healthBonus);             // +Nh к макс. здоровью
    if (move.sleepBonus) addMaxSleepBonus(move.sleepBonus, `move_${move.id}_e`); // +Ne к макс. бодрости
    if (move.energyReward) gainEnergy(move.energyReward);                  // +Ne бодрости сейчас
    if (move.strengthBonus) applyStrengthBonus(move.strengthBonus, `move_${move.id}_str`); // +N к силе
    completed.push({ move, xpResult: result });
  }

  saveState();
  return completed;
}

export function forceCompleteMove(id) {
  const move = MOVES.find(m => m.id === id);
  if (!move) return false;
  moveStates[id] = { status: 'done', prog: {} };
  move.tasks.forEach(t => { moveStates[id].prog[t.key] = t.need; });
  saveState();
  addXp(move.rewardXp);
  if (move.healthBonus) addMaxHealthBonus(move.healthBonus);
  if (move.sleepBonus) addMaxSleepBonus(move.sleepBonus, `move_${move.id}_e`);
  if (move.strengthBonus) applyStrengthBonus(move.strengthBonus, `move_${move.id}_str`);
  return true;
}

export function resetXpSystem() {
  xp = 0;
  moveStates = defaultMoveStates();
  saveState();
}

// Принудительно повысить уровень силы (звание) на 1 ступень — начисляет
// ровно столько xp, сколько нужно для перехода на следующее звание.
// Используется по нажатию клавиши K (см. input.js). Если уже достигнуто
// максимальное звание (Легенда) — ничего не делает и возвращает null.
export function levelUpRank() {
  const current = getRank();
  const next = RANKS.find(r => r.lvl === current.lvl + 1);
  if (!next) return null;

  const needed = Math.max(0, next.min - xp);
  return addXp(needed);
}

export function applyMoveEffects(baseDamage, learnedMoves = getLearnedMoves()) {
  let damage = baseDamage;
  const log = [];
  let dodged = false;
  let stunMs = 0;
  let bleed = null; // { damage, durationMs } — урон по времени, если сработало кровотечение

  for (const move of learnedMoves) {
    const eff = move.effect;
    if (!eff) continue;

    switch (eff.type) {
      case 'damageMult':
        if (Math.random() < 0.35) {
          damage *= eff.value;
          log.push(`${move.name}: урон x${eff.value}`);
          if (eff.stun) stunMs += eff.stun * 1000;
        }
        break;

      case 'bleed': {
        // Кровотечение срабатывает с шансом eff.chance и наносит eff.damage
        // урона, растянутого на eff.durationMs (применяет вызывающий код — бой).
        const chance = eff.chance ?? 0.05;
        if (Math.random() < chance) {
          bleed = { damage: eff.damage ?? 8, durationMs: eff.durationMs ?? 2000 };
          log.push(`${move.name}: кровотечение −${bleed.damage} за ${bleed.durationMs / 1000} с`);
        }
        break;
      }

      case 'stun': {
        // Оглушение: шанс eff.chance — противник не может бить eff.durationMs мс.
        // Возвращаем stunMs вызывающему коду (enemy-fox.js) для блокировки контратаки.
        const stunChance = eff.chance ?? 0.02;
        if (Math.random() < stunChance) {
          stunMs += (eff.durationMs ?? 3000);
          log.push(`${move.name}: оглушение ${(eff.durationMs ?? 3000) / 1000} сек!`);
        }
        break;
      }

      case 'scratch': {
        // Царапина: шанс eff.chance — наносит eff.damage урона за eff.durationMs мс
        // (аналогично bleed, но отдельный тип чтобы лог был читаем).
        const scratchChance = eff.chance ?? 0.10;
        if (Math.random() < scratchChance) {
          bleed = { damage: eff.damage ?? 10, durationMs: eff.durationMs ?? 5000 };
          log.push(`${move.name}: царапина −${bleed.damage} за ${bleed.durationMs / 1000} с`);
        }
        break;
      }

      case 'knockback':
        log.push(`${move.name}: отброс ${eff.value}с`);
        break;

      case 'dodgeChance':
        if (Math.random() < eff.value) {
          dodged = true;
          log.push(`${move.name}: уклонение!`);
        }
        break;

      case 'immobilize':
        log.push(`${move.name}: иммобилизация ${eff.value}с`);
        break;

      case 'jumpBoost':
        break;

      case 'defenseShred':
        damage *= (1 + eff.value);
        log.push(`${move.name}: защита противника −${Math.round(eff.value * 100)}%`);
        break;

      case 'counterChance':
        if (Math.random() < eff.value) {
          log.push(`${move.name}: контратака!`);
          damage *= 1.2;
        }
        break;
    }
  }

  if (dodged) damage = 0;

  return { damage: Math.round(damage), log, dodged, stunMs, bleed };
}
