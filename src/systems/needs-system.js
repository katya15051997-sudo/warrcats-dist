import { setNeedValue, getNeedValue } from '../ui/bottom-menu.js';
import { getMaxHealth } from '../character/character-profile.js';
import { getActiveCharacter, patchActiveState } from '../character/character-save.js';

export let DAY_DURATION_MS = 6 * 60 * 60 * 1000;

export function setDayDuration(ms) { DAY_DURATION_MS = ms; }

const BASE_MAX_SLEEP = 100;

function _bonuses() {
  const a = getActiveCharacter();
  if (!a) return {};
  if (!a.sleep_bonuses || typeof a.sleep_bonuses !== 'object') a.sleep_bonuses = {};
  return a.sleep_bonuses;
}

function _sumBonuses() {
  return Object.values(_bonuses()).reduce((a, b) => a + (b || 0), 0);
}

export function reloadForActiveCharacter() {}

export function addMaxSleepBonus(amount, key) {
  if (!amount) return;
  const obj = _bonuses();
  if (key) {
    if (obj[key] !== undefined) return;
    obj[key] = amount;
    patchActiveState({ sleep_bonuses: { ...obj } });
  }
  const current = getNeedValue('e');
  if (current !== null) setNeedValue('e', current + amount);
}

export function getMaxSleep() {
  return BASE_MAX_SLEEP + _sumBonuses();
}

const DAILY_CHANGE = { food: -10, ss: -10, thirst: -10, toilet: +10 };

let isDrinking   = false;
let isSleeping   = false;
let isSharpening = false;

let lastTickTime    = null;
let tickIntervalId  = null;

export function startNeedsSystem() {
  if (tickIntervalId) return;
  lastTickTime = Date.now();
  tickIntervalId = setInterval(tick, 1000);
}

export function stopNeedsSystem() {
  if (tickIntervalId) { clearInterval(tickIntervalId); tickIntervalId = null; }
  isDrinking = false; isSleeping = false; isSharpening = false;
}

function tick() {
  const now = Date.now();
  const deltaMs = now - lastTickTime;
  lastTickTime = now;

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

  changeNeed('h', getMaxHealth() * 0.005 * dayFraction);
}

function changeNeed(key, delta) {
  const current = getNeedValue(key);
  if (current === null) return;
  setNeedValue(key, current + delta);
}

const HUNT_FOOD = { mouse: 10, otter: 30, eagle: 50, rabbit: 10 };

export function huntPrey(type) {
  const amount = HUNT_FOOD[type];
  if (amount === undefined) { console.warn(`Неизвестный тип добычи: ${type}`); return; }
  changeNeed('food', amount);
}
export function gainFood(amount)         { changeNeed('food', amount); }
export function setDrinking(s)           { isDrinking   = !!s; }
export function setSleeping(s)           { isSleeping   = !!s; }
export function isCurrentlySleeping()    { return isSleeping; }
export function setSharpening(s)         { isSharpening = !!s; }
export function doTraining()             { changeNeed('e', -3); }
export function damageHealth(a)          { changeNeed('h', -a); }
export function healPercent(p)           { changeNeed('h', getMaxHealth() * (p / 100)); }
export function restSleep(a = 5)         { changeNeed('e', a); }
export function sharpenClaws(a = 100)    { changeNeed('ss', a); changeNeed('e', -5); }
export function gainEnergy(a)            { changeNeed('e', a); }
export function spendSleepForStrike(a=5) { changeNeed('e', -a); }
export function relieveNeed() {
  const current = getNeedValue('toilet');
  if (current === null || current <= 0) return false;
  changeNeed('toilet', -20);
  return true;
}
