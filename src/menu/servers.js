// servers.js
// Хранилище серверов с их настройками

// Ключ для localStorage
const STORAGE_KEY = 'warrcats_servers';

// Базовые настройки по умолчанию
export const defaultSettings = {
  maxHealth: 100,
  maxStrength: 50,
  moonFrequency: 3,
  healthPerMoon: 15,
  strengthPerTrain: 8,
  maxAge: 60,
  grassGrowthRate: 30,
  meatDecayDays: 7,
  grassDecayDays: 30,
  selectedMap: "forest"
};

// Начальные серверы (для демонстрации)
const initialServers = [
  {
    id: "server_4",
    name: "Солнечная Поляна",
    players: 5,
    moons: 78,
    settings: {
      maxHealth: 100,
      maxStrength: 50,
      moonFrequency: 3,
      healthPerMoon: 15,
      strengthPerTrain: 8,
      maxAge: 60,
      grassGrowthRate: 30,
      meatDecayDays: 7,
      grassDecayDays: 30,
      selectedMap: "sunny"
    }
  }
];

// Загрузка всех серверов из localStorage
export function loadServers() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const servers = JSON.parse(saved);
      // Проверяем, что массив не пустой
      if (servers && servers.length > 0) {
        return servers;
      }
    } catch (e) {
      console.error('Ошибка загрузки серверов:', e);
    }
  }
  
  // Если ничего нет, сохраняем начальные серверы
  saveServers(initialServers);
  return [...initialServers];
}

// Сохранение всех серверов
export function saveServers(servers) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
}

// Добавление нового сервера
export function addServer(name, settings) {
  const servers = loadServers();
  const newServer = {
    id: `server_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    name: name,
    players: 0,
    moons: 0,
    settings: { ...settings }
  };
  servers.push(newServer);
  saveServers(servers);
  return newServer;
}

// Обновление сервера
export function updateServer(serverId, updates) {
  const servers = loadServers();
  const index = servers.findIndex(s => s.id === serverId);
  if (index !== -1) {
    servers[index] = { ...servers[index], ...updates };
    saveServers(servers);
    return servers[index];
  }
  return null;
}

// Удаление сервера
export function deleteServer(serverId) {
  const servers = loadServers();
  const filtered = servers.filter(s => s.id !== serverId);
  saveServers(filtered);
  return filtered;
}

// Получение сервера по ID
export function getServer(serverId) {
  const servers = loadServers();
  return servers.find(s => s.id === serverId) || null;
}

// Загрузка сервера (возвращает настройки для начала игры)
export function loadServer(serverId, callback) {
  const server = getServer(serverId);
  if (server && callback) {
    callback(server.settings);
    return server.settings;
  }
  return null;
}