// character-save.js
// Сохранение и загрузка персонажей — все настройки редактора.
//
// Что изменилось по сравнению с предыдущей версией:
//   • Список персонажей и активный персонаж кэшируются в памяти модуля —
//     loadCharacters/getActiveCharacter больше не парсят JSON из localStorage
//     при каждом вызове. saveCharacter делает ровно один setItem вместо
//     read-parse-modify-stringify-write.
//   • Глубокое копирование app через structuredClone, без JSON-туда-обратно.
//   • getCharacterStorageKey читает активного персонажа один раз, а не два.
//   • mergeServerCharacters(list) — массовый импорт с сервера: один merge,
//     один write. Заменяет цикл `forEach(saveCharacter)`, который раньше
//     делал N полных read+write по localStorage.
//   • deleteCharacter возвращает оставшийся список — вызывающему коду больше
//     не нужно повторно loadCharacters() сразу после удаления.
//   • Слушаем storage-event, чтобы при правках из другой вкладки кэш
//     инвалидировался и мы не перетёрли свежие данные.

const STORAGE_KEY = 'warrcats_characters';
const ACTIVE_KEY  = 'warrcats_active_character';

// ─── Внутренние кэши ────────────────────────────────────────────────────────
let _charsCache = null;          // массив; null = ещё не читали из localStorage
let _activeCache = null;         // объект или null; используем флаг ниже,
let _activeLoaded = false;       // чтобы отличать «не загружали» от «нет активного»
let _guestSessionId = null;

// structuredClone есть везде, где работает Pixi.js (Chrome 98+/FF 94+/Safari 15.4+).
// Оставляем фолбэк на JSON-копию для совсем старых окружений (старые тесты и т.п.).
const _deepClone = typeof structuredClone === 'function'
  ? structuredClone
  : (v => JSON.parse(JSON.stringify(v)));

// Если другая вкладка изменила хранилище — сбросим кэш, иначе мы могли бы
// при следующем write перетереть свежие данные устаревшим in-memory снимком.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) _charsCache = null;
    if (e.key === ACTIVE_KEY)  { _activeCache = null; _activeLoaded = false; }
  });
}

// ─── Внутренние хелперы list ────────────────────────────────────────────────
function _readChars() {
  if (_charsCache !== null) return _charsCache;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) { _charsCache = parsed; return _charsCache; }
    }
  } catch (e) {
    console.error('Ошибка загрузки персонажей:', e);
  }
  _charsCache = [];
  return _charsCache;
}

function _writeChars() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_charsCache));
  } catch (e) {
    console.error('Ошибка сохранения персонажей:', e);
  }
}

// ─── Публичный API: список персонажей ───────────────────────────────────────
export function loadCharacters() {
  // Возвращаем поверхностную копию массива, чтобы внешние filter/splice/sort
  // у вызывающего кода не портили внутренний кэш.
  return _readChars().slice();
}

// Генератор гарантированно уникального id (Date.now() может совпасть при
// быстрых повторных вызовах в одну и ту же миллисекунду — это раньше могло
// приводить к коллизии id у разных персонажей и, как следствие, к «общим»
// потребностям/умениям, хранящимся под одним и тем же ключом).
let idCounter = 0;
function generateCharacterId() {
  idCounter += 1;
  return 'char_' + Date.now() + '_' + idCounter + '_' + Math.random().toString(36).slice(2, 8);
}

export function saveCharacter(charData) {
  const chars = _readChars();

  // Если у переданных данных есть id существующего персонажа — обновляем
  // запись на месте, не создавая нового id (иначе при каждом сохранении
  // персонаж клонировался бы под новым id, а старые потребности/умения/опыт
  // оставались бы привязаны к прежнему, уже неиспользуемому id).
  const existingIndex = charData.id ? chars.findIndex(c => c.id === charData.id) : -1;

  const char = {
    id:      existingIndex >= 0 ? charData.id : generateCharacterId(),
    savedAt: Date.now(),
    name:    charData.name,
    tribe:   charData.tribe,
    role:    charData.role,
    age:     charData.age,
    size:    charData.size,
    build:   charData.build,
    app:     charData.app ? _deepClone(charData.app) : charData.app,
  };

  if (existingIndex >= 0) chars[existingIndex] = char;
  else chars.push(char);

  _writeChars();
  return char;
}

// Массовый импорт персонажей с сервера. Заменяет шаблон
//   serverChars.forEach(c => saveCharacter(c));
// который делал N полных read+write-циклов localStorage. Здесь — один merge,
// один setItem, один JSON.stringify.
export function mergeServerCharacters(list) {
  if (!Array.isArray(list) || list.length === 0) return;
  const chars = _readChars();
  const indexById = new Map(chars.map((c, i) => [c.id, i]));
  const now = Date.now();

  for (const incoming of list) {
    const id = incoming.id ?? generateCharacterId();
    const merged = {
      id,
      savedAt: now,
      name:    incoming.name,
      tribe:   incoming.tribe,
      role:    incoming.role,
      age:     incoming.age,
      size:    incoming.size,
      build:   incoming.build,
      app:     incoming.app ? _deepClone(incoming.app) : incoming.app,
    };
    const idx = indexById.get(id);
    if (idx !== undefined) {
      chars[idx] = merged;
    } else {
      indexById.set(id, chars.length);
      chars.push(merged);
    }
  }

  _writeChars();
}

// Возвращает оставшийся список — вызывающему коду не нужно сразу после
// удаления делать ещё один loadCharacters().filter(...).
export function deleteCharacter(id) {
  const chars = _readChars();
  const idx = chars.findIndex(c => c.id === id);
  if (idx >= 0) {
    chars.splice(idx, 1);
    _writeChars();
  }
  return chars.slice();
}

// ─── Активный персонаж ──────────────────────────────────────────────────────
export function setActiveCharacter(charData) {
  if (charData && !charData.id) {
    // У персонажа нет id — генерируем его на месте, чтобы потребности/умения
    // НЕ свалились в общий ключ "_default" (что приводило бы к переносу
    // прогресса между персонажами).
    charData = { ...charData, id: generateCharacterId() };
  }
  _activeCache = charData ?? null;
  _activeLoaded = true;
  try {
    if (charData) localStorage.setItem(ACTIVE_KEY, JSON.stringify(charData));
    else          localStorage.removeItem(ACTIVE_KEY);
  } catch (e) {
    console.error('Ошибка сохранения активного персонажа:', e);
  }
}

export function getActiveCharacter() {
  if (_activeLoaded) return _activeCache;
  try {
    const saved = localStorage.getItem(ACTIVE_KEY);
    _activeCache = saved ? JSON.parse(saved) : null;
  } catch (e) {
    console.error('Ошибка загрузки активного персонажа:', e);
    _activeCache = null;
  }
  _activeLoaded = true;
  return _activeCache;
}

export function getActiveCharacterId() {
  return getActiveCharacter()?.id ?? null;
}

export function getCharacterStorageKey(baseKey) {
  // Одно чтение активного вместо двух (раньше getActiveCharacterId сам
  // лазил в localStorage, а потом ниже мы лезли туда же ещё раз).
  const active = getActiveCharacter();
  if (active?.id) return `${baseKey}_${active.id}`;

  if (active) {
    // У активного нет id — выдаём ему устойчивый, чтобы данные системы
    // не сваливались в общий бакет и не смешивались между персонажами.
    const newId = generateCharacterId();
    setActiveCharacter({ ...active, id: newId });
    return `${baseKey}_${newId}`;
  }

  // Совсем нет активного персонажа (гость без сохранений) — изолируем по
  // временному ключу сессии, который не переживёт перезапуск.
  if (!_guestSessionId) _guestSessionId = generateCharacterId();
  return `${baseKey}_${_guestSessionId}`;
}

// ─── Полный сброс ───────────────────────────────────────────────────────────
// Удаляет из localStorage все ключи с префиксом "warrcats_", кроме списка
// серверов (warrcats_servers). Необратимо — использовать с подтверждением в UI.
export function resetAllCharacters() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('warrcats_') && k !== 'warrcats_servers')
      .forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.error('Ошибка сброса всех персонажей:', e);
  }
  _charsCache = null;
  _activeCache = null;
  _activeLoaded = false;
}
