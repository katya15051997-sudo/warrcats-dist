// game-settings.js
// Единственный источник правды для текущих настроек игрового сервера.
// Раньше эти настройки жили в menu.js (`export let currentSettings = {...}`),
// который мы удаляем. Объект мутируется через applyServerSettings(server) —
// импортирующие модули (bottom-menu, character-profile, main) держат ссылку
// на тот же объект и видят свежие значения без необходимости перечитывать.
//
// landing.js при старте игры тоже зовёт applyServerSettings(server), чтобы
// клиент знал параметры выбранной комнаты.

import { defaultSettings } from './servers.js';

export const currentSettings = { ...defaultSettings };

// Заменить содержимое currentSettings на настройки выбранного сервера.
// Сохраняем тот же объект (мутация, не присвоение), чтобы прежние импорты
// продолжали указывать на актуальные данные.
export function applyServerSettings(server) {
  // Очищаем текущие ключи (но сам объект — тот же)
  for (const k of Object.keys(currentSettings)) delete currentSettings[k];
  Object.assign(currentSettings, defaultSettings, server?.settings ?? {});
  if (server?.name) currentSettings.serverName = server.name;
  // Дублируем в window для отладки и обратной совместимости со старым кодом
  if (typeof window !== 'undefined') window.currentSettings = currentSettings;
  return currentSettings;
}
