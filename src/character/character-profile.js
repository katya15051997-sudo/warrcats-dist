// character-profile.js
// Профиль персонажа для вкладки "О персонаже": имя, племя, должность,
// возраст, родители, пара, котята.
//
// Возраст растёт в "лунах": 1 реальная неделя = 1 луна.
// Обновление происходит в понедельник 00:00 по МСК (UTC+3).
// Каждые 3 луны здоровье персонажа увеличивается на +4% от текущего значения
// (с учётом максимума "Максимальное здоровье" из настроек сервера).

import { setNeedValue } from '../ui/bottom-menu.js';
import { currentSettings } from '../config/game-settings.js';
import { getCharacterStorageKey } from './character-save.js';

const STORAGE_KEY_BASE = 'warrcats_character_profile';

function getStorageKey() {
  return getCharacterStorageKey(STORAGE_KEY_BASE);
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Граница "понедельник 00:00 МСК" == "воскресенье 21:00 UTC" (МСК = UTC+3, без DST).
// 4 января 1970 — воскресенье, значит 4 января 1970, 21:00 UTC соответствует
// понедельнику 00:00 МСК (5 января 1970). Берём это как опорную точку отсчёта.
const REFERENCE_BOUNDARY_UTC = Date.UTC(1970, 0, 4, 21, 0, 0, 0);

// Профиль персонажа по умолчанию (для новой/незаполненной кошки)
const defaultProfile = {
  name: 'Без имени',
  tribe: '—',
  role: 'Котёнок',
  ageMoons: 0,
  parents: '—',
  mate: '—',
  kittens: '—',
  lastMoonUpdate: null, // timestamp последнего пересчёта лун

  // Здоровье персонажа: maxHealth — текущий "потолок" здоровья
  // (растёт +4% каждые 3 луны, ограничен настройкой сервера "Максимальное
  // здоровье", которая сама не отображается — она лишь предел на всю жизнь).
  // health — текущее значение здоровья (0..maxHealth).
  maxHealth: 30,
  health: 30,
};

let profile = loadProfile();

// Перечитать профиль из localStorage для текущего активного персонажа.
// Вызывать при смене активного персонажа / перед стартом игры, чтобы
// данные предыдущего персонажа (хранящиеся в памяти модуля) не "утекли"
// в нового персонажа.
export function reloadForActiveCharacter() {
  profile = loadProfile();
}

function loadProfile() {
  try {
    const saved = localStorage.getItem(getStorageKey());
    if (saved) {
      return { ...defaultProfile, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Ошибка загрузки профиля персонажа:', e);
  }
  return { ...defaultProfile };
}

function saveProfile() {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(profile));
  } catch (e) {
    console.error('Ошибка сохранения профиля персонажа:', e);
  }
}

// Сколько границ "понедельник 00:00 МСК" прошло между fromMs и toMs
function moonBoundariesBetween(fromMs, toMs) {
  if (toMs <= fromMs) return 0;
  const fromIndex = Math.floor((fromMs - REFERENCE_BOUNDARY_UTC) / WEEK_MS);
  const toIndex = Math.floor((toMs - REFERENCE_BOUNDARY_UTC) / WEEK_MS);
  return Math.max(0, toIndex - fromIndex);
}

// Каждые 3 луны "потолок" здоровья (maxHealth) растёт на +4%,
// но не выше абсолютного предела из настроек сервера (maxHealth сервера —
// он нигде не показывается, это лишь предел на всю жизнь персонажа).
// Текущее здоровье растёт вместе с потолком на ту же величину.
function growHealthIfNeeded() {
  if (profile.ageMoons % 3 !== 0) return;

  const serverCap = currentSettings?.maxHealth ?? 100;
  const newMax = Math.min(serverCap, profile.maxHealth * 1.04);
  const delta = newMax - profile.maxHealth;
  if (delta <= 0) return;

  profile.maxHealth = newMax;
  profile.health = Math.min(newMax, profile.health + delta);

  // Синхронизируем отображаемое значение здоровья (если панель открыта)
  setNeedValue('h', profile.health);
}

// Прибавить n лун, проверяя рост здоровья на каждой
function addMoons(n) {
  for (let i = 0; i < n; i++) {
    profile.ageMoons += 1;
    growHealthIfNeeded();
  }
}

// Пересчитать возраст по реальному времени.
// Вызывать один раз при старте игры — добавит столько лун,
// сколько понедельников 00:00 МСК прошло с прошлого запуска.
export function syncAge() {
  const now = Date.now();

  if (!profile.lastMoonUpdate) {
    profile.lastMoonUpdate = now;
    saveProfile();
    return;
  }

  const newMoons = moonBoundariesBetween(profile.lastMoonUpdate, now);
  if (newMoons > 0) {
    addMoons(newMoons);
    profile.lastMoonUpdate = now;
    saveProfile();
  }
}

// Прибавить 1 луну вручную (например, по клавише L)
export function addMoon() {
  addMoons(1);
  saveProfile();
}

// Получить копию текущего профиля персонажа
export function getProfile() {
  return { ...profile };
}

// Текущий возраст в лунах
export function getAgeMoons() {
  return profile.ageMoons;
}

// Текущий "потолок" здоровья персонажа (растёт с возрастом, не показывается
// напрямую — используется как максимум в шкале здоровья "X / maxHealth")
export function getMaxHealth() {
  return profile.maxHealth;
}

// Текущее значение здоровья персонажа
export function getHealth() {
  return profile.health;
}

// Установить текущее значение здоровья (вызывается из bottom-menu.js при
// изменении потребности "health") и сохранить в localStorage
export function setHealth(value) {
  profile.health = value;
  saveProfile();
}

// Прибавить бонус к максимальному здоровью (например, +30 за повышение
// звания силы). Текущее здоровье растёт вместе с потолком на ту же величину.
// Бонус НЕ ограничивается серверным maxHealth — это отдельный источник роста
// помимо естественного роста по лунам.
export function addMaxHealthBonus(amount) {
  if (!amount) return;
  profile.maxHealth += amount;
  profile.health += amount;
  saveProfile();
  setNeedValue('h', profile.health);
}

// Изменить поле профиля (имя, племя, должность, родители, пара, котята)
export function setProfileField(key, value) {
  if (!(key in defaultProfile) || key === 'ageMoons' || key === 'lastMoonUpdate') return;
  profile[key] = value;
  saveProfile();
}
