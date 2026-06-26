import { getActiveCharacter, patchActiveState } from '../character/character-save.js';
import { addNeedBonus, gainEnergy, getNeedPenalties } from '../systems/player-system.js';

export const PLAYER_BASE_DAMAGE_MIN = 3;
export const PLAYER_BASE_DAMAGE_MAX = 7;

export const RANKS = [
  { name: 'Котёнок',    min: 0,    max: 150,      lvl: 1, dam: 1.0, bonus: '—' },
  { name: 'Оруженосец', min: 150,  max: 300,      lvl: 2, dam: 1.3, bonus: 'Скорость +10%' },
  { name: 'Воитель',    min: 300,  max: 700,      lvl: 3, dam: 1.6, bonus: 'Тренировка −10% энергии, +10 макс. бодрости' },
  { name: 'Страж',      min: 700,  max: 1000,     lvl: 4, dam: 2.0, bonus: 'Радиус поимки +30%' },
  { name: 'Легенда',    min: 1000, max: Infinity, lvl: 5, dam: 2.5, bonus: 'Лечение +1%/сутки' },
];

export const XP_REWARDS = {
  train:     0.3,
  hunt:      0.5,
  battleWin: 10,
};

export const PREY_CATEGORIES = {
  small:  ['кролик', 'мышь', 'ёж', 'окунь'],
  medium: ['белка', 'змея', 'карась'],
  large:  ['бобёр', 'тетерев'],
};

export const MOVES = [
  {
    id: 'm1', tier: 1, name: 'Удар сзади',
    eff: 'Неожиданная атака задними лапами в голову.',
    tasks: [
      { label: 'Потренироваться 5 раз',  desc: 'у дерева или пня',          need: 5, key: 'train' },
      { label: 'Поймать 5 хилой дичи',   desc: 'мышь, кролик, ёж, окунь',  need: 5, key: 'small' },
    ],
    rewardXp: 8, rewardText: 'Награда «Выносливость»: +5 к здоровью, +10 к бодрости',
    effect: { type: 'damageMult', value: 1.5 },
    healthBonus: 5, energyBonus: 10,
  },
  {
    id: 'm2', tier: 1, name: 'Прочёс живота',
    eff: 'Полосните противника по животу.',
    tasks: [
      { label: 'Поймать 3 средней дичи', desc: 'белка, змея, карась',       need: 3, key: 'medium' },
      { label: 'Потренироваться 7 раз',  desc: 'у дерева или пня',          need: 7, key: 'train' },
    ],
    rewardXp: 10, rewardText: '+5 к здоровью. Пассив «Кровотечение» — −8 за 2 с (шанс 5%)',
    effect: { type: 'bleed', chance: 0.05, damage: 8, durationMs: 2000 },
    healthBonus: 5,
  },
  {
    id: 'm3', tier: 1, name: 'Удар передней лапой',
    eff: 'Сильный удар по голове со втянутыми когтями.',
    tasks: [
      { label: 'Потренироваться с котом 3 раза',  desc: 'совместная тренировка', need: 3, key: 'sparring' },
      { label: 'Потренироваться у дерева 5 раз',  desc: 'у дерева или пня',      need: 5, key: 'train'    },
      { label: 'Поймать 3 средней дичи',          desc: 'белка, змея, карась',   need: 3, key: 'medium'   },
    ],
    rewardXp: 12, rewardText: '+5 энергии. Пассив «Оглушение» — шанс 2%: противник не бьёт 3 с',
    effect: { type: 'stun', chance: 0.02, durationMs: 3000 },
    energyReward: 5,
  },
  {
    id: 'm4', tier: 1, name: 'Скользящий удар',
    eff: 'Полосующий удар по противнику.',
    tasks: [
      { label: 'Потренироваться с котом 3 раза',         desc: 'совместная тренировка',    need: 3, key: 'sparring' },
      { label: 'Потренироваться у дерева/пня 8 раз',     desc: 'у дерева или пня',         need: 8, key: 'train'    },
      { label: 'Поймать тетерева, бобра или зайца',      desc: 'тетерев, бобёр, заяц',     need: 1, key: 'large'    },
    ],
    rewardXp: 14, rewardText: '+5 здоровья, +3 силы. Пассив «Царапина» — шанс 10%: −10 за 5 с',
    effect: { type: 'scratch', chance: 0.10, damage: 10, durationMs: 5000 },
    healthBonus: 5, strengthBonus: 3,
  },
  {
    id: 'm5', tier: 1, name: 'Мёртвая хватка',
    eff: 'Захват шеи зубами. Иммобилизация на 2 с.',
    tasks: [
      { label: 'Потренироваться с другим котом 5 раз', desc: 'совместная тренировка',             need: 5, key: 'sparring' },
      { label: 'Поймать 4 средней дичи',               desc: 'хорёк, белка, жаба, змея, карась', need: 4, key: 'medium'   },
    ],
    rewardXp: 15, rewardText: 'Бонус «Сталь» — длительность хватки +0.5 с на каждый уровень Силы',
    effect: { type: 'immobilize', value: 2 },
  },
  {
    id: 'm6', tier: 2, name: 'Прыжок с зацепом',
    eff: 'Прыжок на спину с захватом когтями.',
    tasks: [
      { label: 'Поймать 6 средней дичи',   desc: 'хорёк, белка, жаба, змея, зяблик',        need: 6, key: 'medium' },
      { label: 'Поймать 2 упитанной дичи', desc: 'выдра, тетерев, фазан, лесная куница',    need: 2, key: 'large'  },
    ],
    rewardXp: 20, rewardText: 'Навык «Акробат» — высота прыжка +25%',
    effect: { type: 'jumpBoost', value: 0.25 },
  },
  {
    id: 'm7', tier: 2, name: 'Встряска',
    eff: 'Встряхивание захваченного — дезориентирует и снимает защиту.',
    tasks: [
      { label: 'Поймать 8 средней дичи', desc: 'хорёк, белка, жаба, змея, зяблик', need: 8, key: 'medium'     },
      { label: 'Победить песца',         desc: 'как минимум 1 раз',                 need: 1, key: 'arctic_fox' },
    ],
    rewardXp: 18, rewardText: 'Пассив «Дезориентация» — защита противника −20% на 3 с, +10 к здоровью',
    effect: { type: 'defenseShred', value: 0.2 },
    healthBonus: 10,
  },
  {
    id: 'm8', tier: 2, name: 'Вертикальный бросок',
    eff: 'Бросок противника вверх и удар при падении.',
    tasks: [
      { label: 'Поймать 5 упитанной дичи', desc: 'выдра, тетерев, фазан, лесная куница', need: 5, key: 'large' },
      { label: 'Победить лису',            desc: 'как минимум 1 раз',                    need: 1, key: 'fox'   },
    ],
    rewardXp: 25, rewardText: 'Бонус «Земной удар» — урон x2.2 + оглушение 1 с',
    effect: { type: 'damageMult', value: 2.2, stun: 1 },
  },
  {
    id: 'm9', tier: 2, name: 'Бросок на плечи',
    eff: 'Захват и бросок через себя.',
    tasks: [
      { label: 'Поймать 4 упитанной дичи', desc: 'выдра, тетерев, фазан, лесная куница', need: 4, key: 'large'     },
      { label: 'Победить песца',            desc: 'как минимум 1 раз',                   need: 1, key: 'arctic_fox' },
    ],
    rewardXp: 22, rewardText: 'Навык «Рычаг» — отбрасывание увеличено в 1.5 раза, +10 к здоровью',
    effect: { type: 'knockback', value: 1.5 },
    healthBonus: 10,
  },
  {
    id: 'm10', tier: 2, name: 'Перекатывание',
    eff: 'Уход перекатом в атаку.',
    tasks: [
      { label: 'Поймать 6 средней дичи', desc: 'хорёк, белка, жаба, змея, зяблик', need: 6, key: 'medium' },
      { label: 'Победить лису',          desc: 'как минимум 1 раз',                 need: 1, key: 'fox'    },
    ],
    rewardXp: 20, rewardText: 'Пассив «Гибкость» — шанс 30% перейти в контратаку',
    effect: { type: 'counterChance', value: 0.3 },
  },
];

export const ALL_BUFFS = [
  { name: 'Урон x1.5',        icon: '⚔️',  moveId: 'm1',  tooltip: 'Приём «Удар сзади»: шанс 35% — следующий удар наносит в 1.5 раза больше урона.' },
  { name: 'Кровотечение',     icon: '🩸',  moveId: 'm2',  tooltip: 'Приём «Прочёс живота»: шанс 5% — противник теряет 8 HP за 2 секунды.' },
  { name: 'Оглушение',        icon: '💫',  moveId: 'm3',  tooltip: 'Приём «Удар передней лапой»: шанс 2% — противник не может атаковать 3 секунды.' },
  { name: 'Царапина',         icon: '🐾',  moveId: 'm4',  tooltip: 'Приём «Скользящий удар»: шанс 10% — противник теряет 10 HP за 5 секунд.' },
  { name: 'Иммобилизация',    icon: '🔒',  moveId: 'm5',  tooltip: 'Приём «Мёртвая хватка»: захват шеи зубами, противник обездвижен на 2 секунды.' },
  { name: 'Прыжок +25%',      icon: '🐆',  moveId: 'm6',  tooltip: 'Приём «Прыжок с зацепом»: высота прыжка увеличена на 25%.' },
  { name: 'Дезориентация',    icon: '🌀',  moveId: 'm7',  tooltip: 'Приём «Встряска»: защита противника снижается на 20% на 3 секунды.' },
  { name: 'Урон x2.2 + стан', icon: '💥',  moveId: 'm8',  tooltip: 'Приём «Вертикальный бросок»: урон x2.2 и оглушение на 1 секунду.' },
  { name: 'Отброс x1.5',      icon: '🌪️', moveId: 'm9',  tooltip: 'Приём «Бросок на плечи»: дальность отбрасывания увеличена в 1.5 раза.' },
  { name: 'Контратака 30%',   icon: '🔄',  moveId: 'm10', tooltip: 'Приём «Перекатывание»: шанс 30% — контратака с уроном x1.2.' },
];

function _defaultMoveStates() {
  const states = {};
  MOVES.forEach(m => {
    states[m.id] = { status: 'locked', prog: {} };
    m.tasks.forEach(t => { states[m.id].prog[t.key] = 0; });
  });
  return states;
}

function _ms() {
  const a = getActiveCharacter();
  if (!a) return null;

  if (!a.move_states || typeof a.move_states !== 'object') {
    a.move_states = {
      states: _defaultMoveStates(),
      selectedMoveId: null,
      strengthBonusTotal: 0,
      appliedStrengthBonusKeys: {},
    };
  }

  const ms = a.move_states;
  if (!ms.states)                   ms.states = _defaultMoveStates();
  if (ms.selectedMoveId === undefined) ms.selectedMoveId = null;
  if (!ms.strengthBonusTotal)       ms.strengthBonusTotal = 0;
  if (!ms.appliedStrengthBonusKeys) ms.appliedStrengthBonusKeys = {};

  if (ms.selectedMoveId && ms.states[ms.selectedMoveId]?.status !== 'inprogress') {
    ms.selectedMoveId = null;
  }
  if (!ms.selectedMoveId) {
    ms.selectedMoveId = Object.keys(ms.states).find(id => ms.states[id]?.status === 'inprogress') || null;
  }

  return ms;
}

function _save() {
  const a = getActiveCharacter();
  if (!a) return;
  patchActiveState({ xp: a.xp, move_states: a.move_states });
}

export function reloadForActiveCharacter() {
  _ms();
  const rank = getRank();
  if (rank.lvl >= 3) addNeedBonus('e', 10, 'rank3_passive');
}

export function getXp() {
  const a = getActiveCharacter();
  return Math.round(((a?.xp ?? 0)) * 10) / 10;
}

export function getRank(value) {
  const a = getActiveCharacter();
  const v = value ?? a?.xp ?? 0;
  return RANKS.slice().reverse().find(r => v >= r.min) || RANKS[0];
}

export function addXp(sourceOrAmount) {
  const a = getActiveCharacter();
  if (!a) return { gained: 0, leveledUp: false, rank: getRank() };

  const amount = typeof sourceOrAmount === 'number'
    ? sourceOrAmount
    : (XP_REWARDS[sourceOrAmount] ?? 0);

  if (amount <= 0) return { gained: 0, leveledUp: false, rank: getRank() };

  const oldRank = getRank();
  a.xp = Math.round(((a.xp ?? 0) + amount) * 10) / 10;
  const newRank = getRank();
  const leveledUp = newRank.lvl > oldRank.lvl;

  if (leveledUp) {
    for (let lvl = oldRank.lvl + 1; lvl <= newRank.lvl; lvl++) {
      addNeedBonus('h', 30, `rank_h_${lvl}`);
      addNeedBonus('e', 10, `rank_e_${lvl}`);
      if (lvl === 3) addNeedBonus('e', 10, 'rank3_passive');
    }
  }

  _save();
  return { gained: amount, leveledUp, rank: newRank };
}

function _applyStrengthBonus(amount, key) {
  if (!amount) return;
  const ms = _ms();
  if (!ms) return;
  if (key && ms.appliedStrengthBonusKeys[key] !== undefined) return;
  if (key) ms.appliedStrengthBonusKeys[key] = amount;
  ms.strengthBonusTotal += amount;
}

export function getDamageMultiplier() {
  const ms = _ms();
  const base = getRank().dam + (ms?.strengthBonusTotal ?? 0) * 0.01;
  const { damageMult } = getNeedPenalties();
  return base * damageMult;
}

export function getCalculatedDamage() {
  const mult = getDamageMultiplier();
  return {
    min: Math.round(PLAYER_BASE_DAMAGE_MIN * mult),
    max: Math.round(PLAYER_BASE_DAMAGE_MAX * mult),
  };
}

export function canStrike() {
  return getNeedPenalties().canStrike;
}

export function getRankBonusText() { return getRank().bonus; }

export function getMoveState(id) {
  return _ms()?.states?.[id] ?? { status: 'locked', prog: {} };
}

export function getSelectedMoveId() {
  return _ms()?.selectedMoveId ?? null;
}

export function isMoveLearned(id) {
  return getMoveState(id).status === 'done';
}

export function getLearnedMoves() {
  return MOVES.filter(m => isMoveLearned(m.id));
}

export function isTierUnlocked(tier) {
  const lvl = getRank().lvl;
  if (tier === 1) return lvl >= 2;
  if (tier === 2) return lvl >= 3;
  return false;
}

export function startLearningMove(id) {
  const move = MOVES.find(m => m.id === id);
  if (!move || !isTierUnlocked(move.tier)) return false;

  const ms = _ms();
  if (!ms) return false;

  const state = ms.states[id] ?? { status: 'locked', prog: {} };
  if (state.status === 'done') return false;
  if (ms.selectedMoveId && ms.selectedMoveId !== id) return false;

  if (state.status !== 'inprogress') {
    ms.states[id] = { status: 'inprogress', prog: state.prog ?? {} };
    move.tasks.forEach(t => {
      if (ms.states[id].prog[t.key] === undefined) ms.states[id].prog[t.key] = 0;
    });
  }

  ms.selectedMoveId = id;
  _save();
  return true;
}

export function progressMoveTasks(key, amount = 1) {
  const completed = [];
  const ms = _ms();
  if (!ms || !ms.selectedMoveId) { _save(); return completed; }

  const move  = MOVES.find(m => m.id === ms.selectedMoveId);
  const state = ms.states[ms.selectedMoveId];
  if (!move || !state || state.status !== 'inprogress') { _save(); return completed; }

  const relevantTask = move.tasks.find(t => t.key === key);
  if (!relevantTask) { _save(); return completed; }

  const current = state.prog[key] ?? 0;
  if (current < relevantTask.need) {
    state.prog[key] = Math.min(relevantTask.need, current + amount);
  }

  const allDone = move.tasks.every(t => (state.prog[t.key] ?? 0) >= t.need);
  if (allDone) {
    state.status = 'done';
    ms.selectedMoveId = null;

    const xpResult = addXp(move.rewardXp);
    if (move.healthBonus)   addNeedBonus('h', move.healthBonus, `move_${move.id}_h`);
    if (move.energyBonus)   addNeedBonus('e', move.energyBonus, `move_${move.id}_e`);
    if (move.energyReward)  gainEnergy(move.energyReward);
    if (move.strengthBonus) _applyStrengthBonus(move.strengthBonus, `move_${move.id}_str`);

    completed.push({ move, xpResult });
  }

  _save();
  return completed;
}

export function forceCompleteMove(id) {
  const move = MOVES.find(m => m.id === id);
  if (!move) return false;
  const ms = _ms();
  if (!ms) return false;

  ms.states[id] = { status: 'done', prog: {} };
  move.tasks.forEach(t => { ms.states[id].prog[t.key] = t.need; });
  _save();

  addXp(move.rewardXp);
  if (move.healthBonus)   addNeedBonus('h', move.healthBonus, `move_${move.id}_h`);
  if (move.energyBonus)   addNeedBonus('e', move.energyBonus, `move_${move.id}_e`);
  if (move.strengthBonus) _applyStrengthBonus(move.strengthBonus, `move_${move.id}_str`);
  return true;
}

export function resetSkillsSystem() {
  const a = getActiveCharacter();
  if (!a) return;
  a.xp = 0;
  a.move_states = {
    states: _defaultMoveStates(),
    selectedMoveId: null,
    strengthBonusTotal: 0,
    appliedStrengthBonusKeys: {},
  };
  _save();
}

export function levelUpRank() {
  const a = getActiveCharacter();
  if (!a) return null;
  const current = getRank();
  const next = RANKS.find(r => r.lvl === current.lvl + 1);
  if (!next) return null;
  return addXp(Math.max(0, next.min - (a.xp ?? 0)));
}

export function applyMoveEffects(baseDamage, learnedMoves = getLearnedMoves()) {
  let damage = baseDamage;
  const log = [];
  let dodged = false;
  let stunMs = 0;
  let bleed  = null;

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

      case 'bleed':
        if (Math.random() < (eff.chance ?? 0.05)) {
          bleed = { damage: eff.damage ?? 8, durationMs: eff.durationMs ?? 2000 };
          log.push(`${move.name}: кровотечение −${bleed.damage} за ${bleed.durationMs / 1000} с`);
        }
        break;

      case 'stun':
        if (Math.random() < (eff.chance ?? 0.02)) {
          stunMs += (eff.durationMs ?? 3000);
          log.push(`${move.name}: оглушение ${(eff.durationMs ?? 3000) / 1000} сек!`);
        }
        break;

      case 'scratch':
        if (Math.random() < (eff.chance ?? 0.10)) {
          bleed = { damage: eff.damage ?? 10, durationMs: eff.durationMs ?? 5000 };
          log.push(`${move.name}: царапина −${bleed.damage} за ${bleed.durationMs / 1000} с`);
        }
        break;

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
          damage *= 1.2;
          log.push(`${move.name}: контратака!`);
        }
        break;
    }
  }

  if (dodged) damage = 0;
  return { damage: Math.round(damage), log, dodged, stunMs, bleed };
}
