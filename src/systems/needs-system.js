import { setNeedValue, getNeedValue } from '../ui/bottom-menu.js';
import { getMaxHealth } from '../character/character-profile.js';
import { getCharacterStorageKey } from '../character/character-save.js';

const STORAGE_KEY_BASE = 'warrcats_max_sleep_bonuses';

function getStorageKey() {
  return getCharacterStorageKey(STORAGE_KEY_BASE);
}

export let DAY_DURATION_MS = 6 * 60 * 60 * 1000;

export function setDayDuration(ms) {
  DAY_DURATION_MS = ms;
}

const BASE_MAX_SLEEP = 100;
let appliedSleepBonusKeys = loadAppliedSleepBonusKeys();
let maxSleepBonusTotal = sumAppliedBonuses();

function loadAppliedSleepBonusKeys() {
  try {
    const saved = localStorage.getItem(getStorageKey());
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Ошибка загрузки бонусов бодрости:', e);
  }
  return {};
}

function saveAppliedSleepBonusKeys() {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(appliedSleepBonusKeys));
  } catch (e) {
    console.error('Ошибка сохранения бонусов бодрости:', e);
  }
}

function sumAppliedBonuses() {
  return Object.values(appliedSleepBonusKeys).reduce((a, b) => a + b, 0);
}

export function reloadForActiveCharacter() {
  appliedSleepBonusKeys = loadAppliedSleepBonusKeys();
  maxSleepBonusTotal = sumAppliedBonuses();
}

export function addMaxSleepBonus(amount, key) {
  if (!amount) return;
  if (key && appliedSleepBonusKeys[key] !== undefined) return;

  if (key) {
    appliedSleepBonusKeys[key] = amount;
    saveAppliedSleepBonusKeys();
  }
  maxSleepBonusTotal += amount;

  const current = getNeedValue('e');
  if (current !== null) {
    setNeedValue('e', current + amount);
  }
}

export function getMaxSleep() {
  return BASE_MAX_SLEEP + maxSleepBonusTotal;
}

const DAILY_CHANGE = {
  food:   -10, 
  ss:  -10,
  thirst: -10,
  toilet: +10,
};

let isDrinking = false;
let isSleeping = false;
let isSharpening = false;

let lastTickTime = null;
let tickIntervalId = null;

export function startNeedsSystem() {
  if (tickIntervalId) return;
  lastTickTime = Date.now();
  tickIntervalId = setInterval(tick, 1000);
}

export function stopNeedsSystem() {
  if (tickIntervalId) {
    clearInterval(tickIntervalId);
    tickIntervalId = null;
  }
  isDrinking = false;
  isSleeping = false;
  isSharpening = false;
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

  if (isSleeping) {
    changeNeed('e', (deltaMs / 60000) * 10);
  }

  if (isSharpening) {
    changeNeed('ss', (deltaMs / 10000) * 10);
  }

  changeNeed('h', getMaxHealth() * 0.005 * dayFraction);
}

function changeNeed(key, delta) {
  const current = getNeedValue(key);
  if (current === null) return;
  setNeedValue(key, current + delta);
}

const HUNT_FOOD = {
  mouse: 10,
  otter: 30,
  eagle: 50,
  rabbit: 10, 
};

export function huntPrey(type) {
  const amount = HUNT_FOOD[type];
  if (amount === undefined) {
    console.warn(`Неизвестный тип добычи: ${type}`);
    return;
  }
  changeNeed('food', amount);
}
export function gainFood(amount) {
  changeNeed('food', amount);
}
export function setDrinking(state) {
  isDrinking = !!state;
}
export function setSleeping(state) {
  isSleeping = !!state;
}
export function isCurrentlySleeping() {
  return isSleeping;
}
export function setSharpening(state) {
  isSharpening = !!state;
}
export function doTraining() {
  changeNeed('e', -3);
}
export function damageHealth(amount) {
  changeNeed('h', -amount);
}
export function healPercent(percent) {
  changeNeed('h', getMaxHealth() * (percent / 100));
}
export function restSleep(amount = 5) {
  changeNeed('e', amount);
}
export function sharpenClaws(amount = 100) {
  changeNeed('ss', amount);
  changeNeed('e', -5);
}
export function gainEnergy(amount) {
  changeNeed('e', amount);
}
export function spendSleepForStrike(amount = 5) {
  changeNeed('e', -amount);
}
export function relieveNeed() {
  const current = getNeedValue('toilet');
  if (current === null || current <= 0) {
    return false;
  }
  changeNeed('toilet', -20);
  return true;
}
