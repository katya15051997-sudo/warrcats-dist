const STORAGE_KEY = 'warrcats_servers';
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

export function loadServers() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const servers = JSON.parse(saved);
      if (servers && servers.length > 0) {
        return servers;
      }
    } catch (e) {
      console.error('Ошибка загрузки серверов:', e);
    }
  }
  saveServers(initialServers);
  return [...initialServers];
}

export function saveServers(servers) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
}

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

export function deleteServer(serverId) {
  const servers = loadServers();
  const filtered = servers.filter(s => s.id !== serverId);
  saveServers(filtered);
  return filtered;
}

export function getServer(serverId) {
  const servers = loadServers();
  return servers.find(s => s.id === serverId) || null;
}

export function loadServer(serverId, callback) {
  const server = getServer(serverId);
  if (server && callback) {
    callback(server.settings);
    return server.settings;
  }
  return null;
}