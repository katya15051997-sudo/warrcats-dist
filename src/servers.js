// servers.js
// Работа с серверами (игровыми комнатами) через API.
// Серверы хранятся в БД на сервере — общие для всех игроков.

import { apiGet, apiPost, apiDelete, getApiBase } from './api.js';

export const defaultSettings = {
  maxHealth:        100,
  maxStrength:      50,
  moonFrequency:    3,
  healthPerMoon:    15,
  strengthPerTrain: 8,
  maxAge:           60,
  grassGrowthRate:  30,
  meatDecayDays:    7,
  grassDecayDays:   30,
  selectedMap:      'forest',
};

// Загрузить все серверы с сервера
export async function loadServers() {
  try {
    const data = await apiGet('/api/servers');
    return data.servers ?? [];
  } catch (e) {
    console.error('Ошибка загрузки серверов:', e);
    return [];
  }
}

// Создать сервер
export async function addServer(name, settings) {
  const data = await apiPost('/api/servers', { name, settings });
  return data.server;
}

// Удалить сервер (только владелец)
export async function deleteServer(serverId) {
  await apiDelete(`/api/servers/${serverId}`);
}

// Получить настройки сервера по id (локально из уже загруженного списка)
export function getServerSettings(server) {
  return server?.settings ?? { ...defaultSettings };
}
