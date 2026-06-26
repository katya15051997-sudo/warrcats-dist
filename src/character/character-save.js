import { apiGet, apiPost, apiDelete } from '../net/api.js';

const ACTIVE_ID_KEY = 'warrcats_active_char_id';

let _characters = [];
let _activeId   = null;

function _enrich(char) {
  if (!char || typeof char !== 'object') return char;
  if (char.appearance !== undefined && char.app === undefined)       char.app = char.appearance;
  if (char.age_moons  !== undefined && char.age === undefined)       char.age = char.age_moons;
  if (char.max_h      !== undefined && char.maxHealth === undefined) char.maxHealth = char.max_h;
  return char;
}

export async function loadCharactersFromServer() {
  try {
    const data = await apiGet('/api/me');
    _characters = Array.isArray(data?.characters) ? data.characters.map(_enrich) : [];
  } catch (e) {
    console.warn('Не удалось загрузить персонажей:', e.message);
    _characters = [];
  }

  const savedId = localStorage.getItem(ACTIVE_ID_KEY);
  if (savedId && _characters.some(c => c.id === savedId)) {
    _activeId = savedId;
  } else if (_characters.length > 0) {
    _activeId = _characters[0].id;
    localStorage.setItem(ACTIVE_ID_KEY, _activeId);
  } else {
    _activeId = null;
    localStorage.removeItem(ACTIVE_ID_KEY);
  }

  return getCharacters();
}

export function getCharacters() {
  return _characters.slice();
}

export function getActiveCharacter() {
  if (!_activeId) return null;
  return _characters.find(c => c.id === _activeId) || null;
}

export function getActiveCharacterId() {
  return _activeId;
}

export function setActiveCharacter(charOrId) {
  if (!charOrId) {
    _activeId = null;
    localStorage.removeItem(ACTIVE_ID_KEY);
    return null;
  }
  const id = typeof charOrId === 'string' ? charOrId : charOrId.id;
  if (!id) return null;

  if (typeof charOrId === 'object' && charOrId.id) {
    _enrich(charOrId);
    const idx = _characters.findIndex(c => c.id === charOrId.id);
    if (idx >= 0) _characters[idx] = charOrId;
    else _characters.push(charOrId);
  }

  _activeId = id;
  localStorage.setItem(ACTIVE_ID_KEY, id);
  return getActiveCharacter();
}

export async function createCharacter(data) {
  const res  = await apiPost('/api/characters', data);
  const char = _enrich(res.character ?? res);

  if (!char?.id) throw new Error('Сервер не вернул персонажа');

  const existing = _characters.findIndex(c => c.id === char.id);
  if (existing >= 0) _characters[existing] = char;
  else _characters.push(char);

  _activeId = char.id;
  localStorage.setItem(ACTIVE_ID_KEY, char.id);

  return char;
}

export async function updateCharacterAppearance(charId, data) {
  const res  = await apiPost('/api/characters', { ...data, id: charId });
  const char = _enrich(res.character ?? res);

  const idx = _characters.findIndex(c => c.id === charId);
  if (idx >= 0) _characters[idx] = char;
  else _characters.push(char);

  return char;
}

export async function deleteCharacter(id) {
  try { await apiDelete(`/api/characters/${id}`); }
  catch (e) { console.warn('Не удалось удалить персонажа:', e.message); }

  _characters = _characters.filter(c => c.id !== id);

  if (_activeId === id) {
    _activeId = _characters[0]?.id ?? null;
    if (_activeId) localStorage.setItem(ACTIVE_ID_KEY, _activeId);
    else localStorage.removeItem(ACTIVE_ID_KEY);
  }

  return getCharacters();
}

export function patchActiveState(partial) {
  const active = getActiveCharacter();
  if (!active || !partial) return null;
  for (const [k, v] of Object.entries(partial)) {
    active[k] = v;
    if (k === 'appearance') active.app = v;
    if (k === 'age_moons')  active.age = v;
    if (k === 'max_h')      active.maxHealth = v;
  }
  return active;
}

export function replaceActiveCharacter(char) {
  if (!char?.id) return null;
  _enrich(char);
  const idx = _characters.findIndex(c => c.id === char.id);
  if (idx >= 0) _characters[idx] = char;
  else _characters.push(char);
  _activeId = char.id;
  localStorage.setItem(ACTIVE_ID_KEY, char.id);
  return char;
}

export function getCurrentStateSnapshot() {
  const a = getActiveCharacter();
  if (!a) return null;
  return {
    h: a.h, max_h: a.max_h,
    e: a.e, food: a.food, thirst: a.thirst, ss: a.ss, toilet: a.toilet,
    xp: a.xp,
    move_states:   a.move_states,
    need_bonuses:  a.need_bonuses,
    age_moons:     a.age_moons,
    last_moon_update: a.last_moon_update,
    parents: a.parents, mate: a.mate, kittens: a.kittens,
    inventory: a.inventory, achievements: a.achievements,
  };
}

export function getCharacterStorageKey(baseKey) {
  return `${baseKey}_${_activeId ?? 'none'}`;
}
