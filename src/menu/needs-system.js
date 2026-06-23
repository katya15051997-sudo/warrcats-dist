// needs-system.js
// Система потребностей персонажа:
// - естественное снижение/рост со временем (раз в игровые сутки)
// - восполнение через действия игрока (охота, питьё, сон, точение когтей и т.д.)
//
// "Сон" фактически работает как шкала бодрости: изначально 0-100, со
// повышением звания Силы (xp-system.js) персонажу выдаётся +10 к максимуму
// бодрости за каждый уровень, а с уровня "Воин" дополнительно действует
// пассивный бонус +10 к максимуму (addMaxSleepBonus).

import { setNeedValue, getNeedValue } from './bottom-menu.js';
import { getMaxHealth } from './character-profile.js';
import { getCharacterStorageKey } from './character-save.js';

const STORAGE_KEY_BASE = 'warrcats_max_sleep_bonuses';

function getStorageKey() {
  return getCharacterStorageKey(STORAGE_KEY_BASE);
}

// === Настройка времени ===
// Длительность одних игровых суток в миллисекундах.
// 1 игровой день = 6 реальных часов.
export let DAY_DURATION_MS = 6 * 60 * 60 * 1000;

export function setDayDuration(ms) {
  DAY_DURATION_MS = ms;
}

// === Максимум бодрости (шкала "Сон") ===
// Базовое значение 100, плюс бонусы от уровней силы (хранятся по ключу,
// чтобы один и тот же бонус не применялся дважды при перезагрузке).
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

// Перечитать бонусы максимальной бодрости из localStorage для текущего
// активного персонажа. Вызывать при смене активного персонажа / перед
// стартом игры.
export function reloadForActiveCharacter() {
  appliedSleepBonusKeys = loadAppliedSleepBonusKeys();
  maxSleepBonusTotal = sumAppliedBonuses();
}

// Прибавить бонус к максимальной бодрости (шкала "Сон"). key — уникальный
// идентификатор источника бонуса (например, 'level_2', 'rank3_passive'),
// чтобы повторный вызов с тем же key не суммировался повторно (защита от
// двойного начисления при перезагрузке/повторной проверке звания).
export function addMaxSleepBonus(amount, key) {
  if (!amount) return;
  if (key && appliedSleepBonusKeys[key] !== undefined) return; // уже применён

  if (key) {
    appliedSleepBonusKeys[key] = amount;
    saveAppliedSleepBonusKeys();
  }
  maxSleepBonusTotal += amount;

  // Текущая бодрость растёт вместе с потолком на ту же величину
  const current = getNeedValue('e');
  if (current !== null) {
    setNeedValue('e', current + amount);
  }
}

// Текущий максимум бодрости (шкала "Сон"): 100 базово + бонусы от уровней
export function getMaxSleep() {
  return BASE_MAX_SLEEP + maxSleepBonusTotal;
}

// === Ежедневное изменение (% за игровые сутки) ===
const DAILY_CHANGE = {
  food:   -10, // Сытость падает
  ss:  -10, // Цап-царап падает
  thirst: -10, // Жажда падает
  toilet: +10, // Нужда растёт (чем выше — тем хуже)
};

// Флаги текущих процессов
let isDrinking = false;
let isSleeping = false;
let isSharpening = false; // Цап-царап (дерево/пень)

let lastTickTime = null;
let tickIntervalId = null;

// Запуск системы (вызывать один раз при старте игры)
export function startNeedsSystem() {
  if (tickIntervalId) return; // уже запущено
  lastTickTime = Date.now();
  tickIntervalId = setInterval(tick, 1000); // обновление раз в секунду
}

// Остановка системы (например, при выходе в главное меню)
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

  // Ежедневное естественное изменение
  for (const [key, dailyChange] of Object.entries(DAILY_CHANGE)) {
    changeNeed(key, dailyChange * dayFraction);
  }

  // Питьё воды
  if (isDrinking) {
    // Жажда: +10% за 10 секунд
    changeNeed('thirst', (deltaMs / 10000) * 10);
    // Нужда: +20% за минуту
    changeNeed('toilet', (deltaMs / 60000) * 20);
  }

  // Сон (динамическое действие — выполняется, пока шкала не достигнет 100%
  // от текущего максимума; останавливается автоматически в main.js / вызовом
  // setSleeping(false), когда getNeedValue('e') достигает getMaxSleep())
  if (isSleeping) {
    // Сон: +10% от максимума за минуту
    changeNeed('e', (deltaMs / 60000) * 10);
  }

  // Цап-царап у дерева/пня: +10% за 10 секунд
  // (за полные 30 секунд действия шкала восполнится на 30%)
  if (isSharpening) {
    changeNeed('ss', (deltaMs / 10000) * 10);
  }

  // Пассивное лечение: +0.5% от текущего "потолка" здоровья за игровой день
  changeNeed('h', getMaxHealth() * 0.005 * dayFraction);
}

// Изменить значение потребности. Ограничение по диапазону (для здоровья —
// с учётом maxHealth из настроек сервера) выполняет setNeedValue.
function changeNeed(key, delta) {
  const current = getNeedValue(key);
  if (current === null) return;
  setNeedValue(key, current + delta);
}

// === Действия игрока ===

// Охота: восполняет сытость
// type: 'mouse' | 'otter' | 'eagle'
const HUNT_FOOD = {
  mouse: 10,
  otter: 30,
  eagle: 50,
  rabbit: 10, // Кролик с карты — восстанавливает 10% сытости
};

export function huntPrey(type) {
  const amount = HUNT_FOOD[type];
  if (amount === undefined) {
    console.warn(`Неизвестный тип добычи: ${type}`);
    return;
  }
  changeNeed('food', amount);
}

// Прибавить сытость на amount % напрямую.
// Используется системой дичи (prey-system.js), где у разных видов разное
// значение сытости (10 / 20 / 30%).
export function gainFood(amount) {
  changeNeed('food', amount);
}

// Начать/прекратить питьё воды (вызывать при взаимодействии с водой)
export function setDrinking(state) {
  isDrinking = !!state;
}

// Начать/прекратить сон (вызывать при входе/выходе из спального места).
// Действие "Сон" выполняется динамически, пока шкала "Сон" не достигнет
// 100% (см. getMaxSleep()) — остановку контролирует вызывающий код
// (main.js), сверяя getNeedValue('e') с getMaxSleep() каждый тик.
export function setSleeping(state) {
  isSleeping = !!state;
}

export function isCurrentlySleeping() {
  return isSleeping;
}

// Начать/прекратить точение когтей (вызывать при взаимодействии с деревом/пнём)
export function setSharpening(state) {
  isSharpening = !!state;
}

// Тренировка ("Потренироваться" у дерева/пня): тратит бодрость.
// Базовая стоимость 16%, но звание Воин+ снижает трату на 10%
// (см. bonus в RANKS — xp-system.js).
export function doTraining() {
  changeNeed('e', -16);
}

// Урон персонажу: уменьшает здоровье на amount
export function damageHealth(amount) {
  changeNeed('h', -amount);
}

// Восполнить здоровье на percent% от текущего максимума здоровья
// (используется действием "Вылизаться": +2%)
export function healPercent(percent) {
  changeNeed('h', getMaxHealth() * (percent / 100));
}

// Короткий отдых ("Сесть"): небольшое восстановление бодрости
export function restSleep(amount = 5) {
  changeNeed('e', amount);
}

// Цап-царап одноразово: восполняет коготь, тратит бодрость
// amount — на сколько восполнить (по умолчанию полностью)
export function sharpenClaws(amount = 100) {
  changeNeed('ss', amount);
  changeNeed('e', -5);
}

// Добавить бодрость на amount % (награда за изучение приёма)
export function gainEnergy(amount) {
  changeNeed('e', amount);
}

// Потратить бодрость за удар (клавиша E): -5 бодрости за каждый удар
export function spendSleepForStrike(amount = 5) {
  changeNeed('e', -amount);
}

// Справить нужду / поставить метку
// Возвращает true, если действие выполнено, false — если нужда уже на 0
export function relieveNeed() {
  const current = getNeedValue('toilet');
  if (current === null || current <= 0) {
    return false;
  }
  changeNeed('toilet', -20);
  return true;
}
