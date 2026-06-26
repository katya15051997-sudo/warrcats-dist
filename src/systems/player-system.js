import { getActiveCharacter, patchActiveState } from '../character/character-save.js';
import { currentSettings } from '../config/game-settings.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const REFERENCE_BOUNDARY_UTC = Date.UTC(1970, 0, 4, 21, 0, 0, 0);

export let DAY_DURATION_MS = 6 * 60 * 60 * 1000;
export function setDayDuration(ms) { DAY_DURATION_MS = ms; }

const BASE_MAX_HEALTH = 30;
const BASE_MAX_ENERGY = 100;

const DAILY_CHANGE = {
  food:   -10,
  e:      -10,
  thirst: -10,
  toilet: +10,
};

let isDrinking   = false;
let isSleeping   = false;
let isSharpening = false;

let lastTickTime   = null;
let tickIntervalId = null;

function _a() {
  return getActiveCharacter();
}

function _needBonuses() {
  const a = _a();
  if (!a) return {};
  if (!a.need_bonuses || typeof a.need_bonuses !== 'object') a.need_bonuses = {};
  return a.need_bonuses;
}

function _sumBonuses(key) {
  const bonuses = _needBonuses();
  const group = bonuses[key];
  if (!group || typeof group !== 'object') return 0;
  return Object.values(group).reduce((sum, v) => sum + (v || 0), 0);
}

export function addNeedBonus(needKey, amount, bonusKey) {
  if (!amount) return;
  const a = _a();
  if (!a) return;
  if (!a.need_bonuses) a.need_bonuses = {};
  if (!a.need_bonuses[needKey]) a.need_bonuses[needKey] = {};

  if (bonusKey) {
    if (a.need_bonuses[needKey][bonusKey] !== undefined) return;
    a.need_bonuses[needKey][bonusKey] = amount;
  }

  patchActiveState({ need_bonuses: a.need_bonuses });

  const current = getNeed(needKey);
  if (current !== null) setNeed(needKey, current + amount);
}

export function getMaxNeed(key) {
  if (key === 'h')  return BASE_MAX_HEALTH + _sumBonuses('h');
  if (key === 'e')  return BASE_MAX_ENERGY + _sumBonuses('e');
  return 100;
}

export function getNeed(key) {
  const a = _a();
  if (!a) return null;
  const v = a[key];
  return v === undefined || v === null ? null : v;
}

export function setNeed(key, value) {
  const a = _a();
  if (!a) return;
  const max = getMaxNeed(key);
  const clamped = Math.max(0, Math.min(max, value));
  a[key] = clamped;
  if (key === 'h') {
    a.max_h   = getMaxNeed('h');
    a.maxHealth = a.max_h;
  }
  patchActiveState({ [key]: clamped });
}

function changeNeed(key, delta) {
  const current = getNeed(key);
  if (current === null) return;
  setNeed(key, current + delta);
}

export function startNeedsSystem() {
  if (tickIntervalId) return;
  lastTickTime = Date.now();
  tickIntervalId = setInterval(_tick, 1000);
}

export function stopNeedsSystem() {
  if (tickIntervalId) { clearInterval(tickIntervalId); tickIntervalId = null; }
  isDrinking   = false;
  isSleeping   = false;
  isSharpening = false;
}

function _tick() {
  const now      = Date.now();
  const deltaMs  = now - lastTickTime;
  lastTickTime   = now;

  const dayFraction = deltaMs / DAY_DURATION_MS;

  for (const [key, dailyChange] of Object.entries(DAILY_CHANGE)) {
    changeNeed(key, dailyChange * dayFraction);
  }

  if (isDrinking) {
    changeNeed('thirst', (deltaMs / 10000) * 10);
    changeNeed('toilet', (deltaMs / 60000) * 20);
  }
  if (isSleeping)   changeNeed('e',  (deltaMs / 60000) * 10);
  if (isSharpening) changeNeed('ss', (deltaMs / 10000) * 10);

  changeNeed('h', getMaxNeed('h') * 0.005 * dayFraction);
}

export function setDrinking(v)         { isDrinking   = !!v; }
export function setSleeping(v)         { isSleeping   = !!v; }
export function isCurrentlySleeping()  { return isSleeping; }
export function setSharpening(v)       { isSharpening = !!v; }

export function gainFood(amount)            { changeNeed('food',   amount); }
export function gainEnergy(amount)          { changeNeed('e',      amount); }
export function damageHealth(amount)        { changeNeed('h',     -amount); }
export function healPercent(pct)            { changeNeed('h', getMaxNeed('h') * (pct / 100)); }
export function doTraining()                { changeNeed('e', -3); }
export function spendEnergyForStrike(a = 5) { changeNeed('e', -a); }
export function sharpenClaws(a = 100)       { changeNeed('ss', a); changeNeed('e', -5); }

export function relieveToilet() {
  const current = getNeed('toilet');
  if (current === null || current <= 0) return false;
  changeNeed('toilet', -20);
  return true;
}

const HUNT_FOOD = { mouse: 10, otter: 30, eagle: 50, rabbit: 10 };

export function huntPrey(type) {
  const amount = HUNT_FOOD[type];
  if (amount === undefined) return;
  changeNeed('food', amount);
}

export function restoreFromRank(rankLvl) {
  const HEALTH_BONUS_PER_LEVEL = 30;
  const ENERGY_BONUS_PER_LEVEL = 10;
  const ENERGY_BONUS_RANK3     = 10;

  for (let lvl = 1; lvl <= rankLvl; lvl++) {
    addNeedBonus('h', HEALTH_BONUS_PER_LEVEL, `rank_h_${lvl}`);
    addNeedBonus('e', ENERGY_BONUS_PER_LEVEL,  `rank_e_${lvl}`);
    if (lvl === 3) addNeedBonus('e', ENERGY_BONUS_RANK3, 'rank3_passive');
  }
}

export function reloadForActiveCharacter() {
  syncAge();
}

function _moonsBetween(fromMs, toMs) {
  if (toMs <= fromMs) return 0;
  const fromIdx = Math.floor((fromMs - REFERENCE_BOUNDARY_UTC) / WEEK_MS);
  const toIdx   = Math.floor((toMs   - REFERENCE_BOUNDARY_UTC) / WEEK_MS);
  return Math.max(0, toIdx - fromIdx);
}

function _growHealthWithAge() {
  const a = _a();
  if (!a) return;
  if ((a.age_moons ?? 0) % 3 !== 0) return;

  const serverCap = currentSettings?.maxHealth ?? 100;
  const curMax    = getMaxNeed('h');
  const newMax    = Math.min(serverCap, curMax * 1.04);
  const delta     = newMax - curMax;
  if (delta <= 0) return;

  addNeedBonus('h', delta, `age_growth_${a.age_moons}`);
}

function _addMoons(n) {
  const a = _a();
  if (!a) return;
  for (let i = 0; i < n; i++) {
    a.age_moons = (a.age_moons ?? 0) + 1;
    _growHealthWithAge();
  }
  a.age = a.age_moons;
  patchActiveState({ age_moons: a.age_moons });
}

export function syncAge() {
  const a = _a();
  if (!a) return;
  const nowSec  = Math.floor(Date.now() / 1000);
  const lastSec = a.last_moon_update;

  if (!lastSec) {
    a.last_moon_update = nowSec;
    patchActiveState({ last_moon_update: nowSec });
    return;
  }

  const newMoons = _moonsBetween(lastSec * 1000, nowSec * 1000);
  if (newMoons > 0) {
    _addMoons(newMoons);
    a.last_moon_update = nowSec;
    patchActiveState({ last_moon_update: nowSec });
  }
}

export function addMoon() { _addMoons(1); }

export function getProfile() {
  const a = _a();
  if (!a) return { name: 'Без имени', tribe: '—', role: 'Котёнок', ageMoons: 0, parents: '—', mate: '—', kittens: '—' };
  return {
    name:      a.name      ?? 'Без имени',
    tribe:     a.tribe     ?? '—',
    role:      a.role      ?? 'Котёнок',
    ageMoons:  a.age_moons ?? 0,
    parents:   a.parents   ?? '—',
    mate:      a.mate      ?? '—',
    kittens:   a.kittens   ?? '—',
  };
}

export function setProfileField(key, value) {
  const a = _a();
  if (!a) return;
  const allowed = ['name', 'tribe', 'role', 'parents', 'mate', 'kittens'];
  if (!allowed.includes(key)) return;
  a[key] = value;
  patchActiveState({ [key]: value });
}

export function getMaxHealth() { return getMaxNeed('h'); }
export function getHealth()    { return getNeed('h') ?? 0; }
export function getMaxEnergy() { return getMaxNeed('e'); }
export function getEnergy()    { return getNeed('e') ?? 0; }
export function getAgeMoons()  { return _a()?.age_moons ?? 0; }
