// character-save.js
// Сохранение и загрузка персонажей — все настройки редактора
 
const STORAGE_KEY = 'warrcats_characters';
 
// Структура сохранённого персонажа:
// {
//   id: string,
//   savedAt: number (timestamp),
//   name, tribe, role, age, size, build,
//   app: { body, markings, fur_body, fur_head, eyes }
// }
 
export function loadCharacters() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const chars = JSON.parse(saved);
      if (Array.isArray(chars)) return chars;
    }
  } catch (e) {
    console.error('Ошибка загрузки персонажей:', e);
  }
  return [];
}
 
// Генерирует гарантированно уникальный id (Date.now() может совпасть при
// быстрых повторных вызовах в одну и ту же миллисекунду, что раньше могло
// приводить к коллизии id у разных персонажей и, как следствие, к "общим"
// потребностям/умениям, хранящимся под одним и тем же ключом).
let idCounter = 0;
function generateCharacterId() {
  idCounter += 1;
  return 'char_' + Date.now() + '_' + idCounter + '_' + Math.random().toString(36).slice(2, 8);
}
 
export function saveCharacter(charData) {
  const chars = loadCharacters();
 
  // Если у переданных данных уже есть id существующего персонажа —
  // обновляем его запись на месте, не создавая нового id (иначе при
  // каждом сохранении/редактировании персонаж "клонировался" бы под новым
  // id, а старые потребности/умения/опыт оставались бы привязаны к
  // прежнему, уже неиспользуемому id).
  const existingIndex = charData.id ? chars.findIndex(c => c.id === charData.id) : -1;
 
  const char = {
    id: existingIndex >= 0 ? charData.id : generateCharacterId(),
    savedAt: Date.now(),
    name:  charData.name,
    tribe: charData.tribe,
    role:  charData.role,
    age:   charData.age,
    size:  charData.size,
    build: charData.build,
    app:   JSON.parse(JSON.stringify(charData.app)), // deep copy
  };
 
  if (existingIndex >= 0) {
    chars[existingIndex] = char;
  } else {
    chars.push(char);
  }
 
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chars));
  } catch (e) {
    console.error('Ошибка сохранения персонажа:', e);
  }
  return char;
}
 
export function deleteCharacter(id) {
  const chars = loadCharacters().filter(c => c.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chars));
  } catch (e) {
    console.error('Ошибка удаления персонажа:', e);
  }
}
 
// Активный персонаж — тот, что будет применён при старте игры
const ACTIVE_KEY = 'warrcats_active_character';
 
export function setActiveCharacter(charData) {
  if (charData && !charData.id) {
    console.warn('setActiveCharacter: у персонажа нет id — потребности/умения будут использовать общий ключ "_default" и общими для всех таких персонажей. Пересохраните персонажа.');
  }
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(charData));
  } catch (e) {
    console.error('Ошибка сохранения активного персонажа:', e);
  }
}
 
export function getActiveCharacter() {
  try {
    const saved = localStorage.getItem(ACTIVE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Ошибка загрузки активного персонажа:', e);
  }
  return null;
}
 
export function getActiveCharacterId() {
  const active = getActiveCharacter();
  return active?.id ?? null;
}
 
export function getCharacterStorageKey(baseKey) {
  const id = getActiveCharacterId();
  return id ? `${baseKey}_${id}` : `${baseKey}_default`;
}
 
// Полный сброс ВСЕХ персонажей и связанных с ними данных (опыт, навыки,
// потребности, профиль). Удаляет из localStorage все ключи с префиксом
// "warrcats_", кроме списка серверов (warrcats_servers), который к
// персонажам не привязан. Необратимо — использовать с подтверждением в UI.
export function resetAllCharacters() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('warrcats_') && k !== 'warrcats_servers')
      .forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.error('Ошибка сброса всех персонажей:', e);
  }
}