import { setNeedValue } from '../ui/bottom-menu.js';
import { currentSettings } from '../config/game-settings.js';
import { getActiveCharacter, patchActiveState } from './character-save.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const REFERENCE_BOUNDARY_UTC = Date.UTC(1970, 0, 4, 21, 0, 0, 0);

const FALLBACK = {
  name: 'Без имени', tribe: '—', role: 'Котёнок',
  ageMoons: 0, parents: '—', mate: '—', kittens: '—',
  maxHealth: 30, health: 30,
};

function _a() { return getActiveCharacter(); }

export function reloadForActiveCharacter() {}

export function getProfile() {
  const a = _a();
  if (!a) return { ...FALLBACK };
  return {
    name:      a.name ?? FALLBACK.name,
    tribe:     a.tribe ?? FALLBACK.tribe,
    role:      a.role ?? FALLBACK.role,
    ageMoons:  a.age_moons ?? 0,
    parents:   a.parents ?? '—',
    mate:      a.mate ?? '—',
    kittens:   a.kittens ?? '—',
    maxHealth: a.max_h ?? 30,
    health:    a.h ?? 30,
  };
}

export function getAgeMoons() { return _a()?.age_moons ?? 0; }
export function getMaxHealth() { return _a()?.max_h ?? 30; }
export function getHealth()    { return _a()?.h ?? 30; }

export function setHealth(value) {
  const a = _a();
  if (!a) return;
  const max = a.max_h ?? 30;
  const v = Math.max(0, Math.min(max, value));
  a.h = v;
  patchActiveState({ h: v });
}

export function addMaxHealthBonus(amount) {
  if (!amount) return;
  const a = _a();
  if (!a) return;
  a.max_h = (a.max_h ?? 30) + amount;
  a.h = (a.h ?? 30) + amount;
  a.maxHealth = a.max_h;
  patchActiveState({ max_h: a.max_h, h: a.h });
  setNeedValue('h', a.h);
}

export function setProfileField(key, value) {
  const a = _a();
  if (!a) return;
  const map = {
    name: 'name', tribe: 'tribe', role: 'role',
    parents: 'parents', mate: 'mate', kittens: 'kittens',
  };
  const field = map[key];
  if (!field) return;
  a[field] = value;
  patchActiveState({ [field]: value });
}

function moonBoundariesBetween(fromMs, toMs) {
  if (toMs <= fromMs) return 0;
  const fromIndex = Math.floor((fromMs - REFERENCE_BOUNDARY_UTC) / WEEK_MS);
  const toIndex   = Math.floor((toMs   - REFERENCE_BOUNDARY_UTC) / WEEK_MS);
  return Math.max(0, toIndex - fromIndex);
}

function growHealthIfNeeded() {
  const a = _a();
  if (!a) return;
  if ((a.age_moons ?? 0) % 3 !== 0) return;

  const serverCap = currentSettings?.maxHealth ?? 100;
  const newMax = Math.min(serverCap, (a.max_h ?? 30) * 1.04);
  const delta  = newMax - (a.max_h ?? 30);
  if (delta <= 0) return;

  a.max_h = newMax;
  a.h = Math.min(newMax, (a.h ?? 30) + delta);
  a.maxHealth = newMax;
  patchActiveState({ max_h: a.max_h, h: a.h });
  setNeedValue('h', a.h);
}

function addMoons(n) {
  const a = _a();
  if (!a) return;
  for (let i = 0; i < n; i++) {
    a.age_moons = (a.age_moons ?? 0) + 1;
    growHealthIfNeeded();
  }
  a.age = a.age_moons;
  patchActiveState({ age_moons: a.age_moons });
}

export function syncAge() {
  const a = _a();
  if (!a) return;
  const nowSec = Math.floor(Date.now() / 1000);
  const lastSec = a.last_moon_update;

  if (!lastSec) {
    a.last_moon_update = nowSec;
    patchActiveState({ last_moon_update: nowSec });
    return;
  }

  const newMoons = moonBoundariesBetween(lastSec * 1000, nowSec * 1000);
  if (newMoons > 0) {
    addMoons(newMoons);
    a.last_moon_update = nowSec;
    patchActiveState({ last_moon_update: nowSec });
  }
}

export function addMoon() {
  addMoons(1);
}
