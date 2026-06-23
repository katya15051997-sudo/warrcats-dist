// server/preyServer.js
// Серверная сторона системы дичи.
// Зеркалит логику prey-system.js клиента, но авторитетна:
// клиент отображает позиции, сервер считает их и решает убийства.

const { MSG } = require('./protocol');

const PREY_CONFIG = {
  bunny:    { label: 'Кролик',  food: 10, health: 10, size: 'small'  },
  mouse:    { label: 'Мышь',    food: 10, health: 10, size: 'small'  },
  hedgehog: { label: 'Ёж',      food: 10, health: 10, size: 'small'  },
  perch:    { label: 'Окунь',   food: 10, health: 10, size: 'small'  },
  squirrel: { label: 'Белка',   food: 20, health: 20, size: 'medium' },
  snake:    { label: 'Змея',    food: 20, health: 20, size: 'medium' },
  crucian:  { label: 'Карась',  food: 20, health: 20, size: 'medium' },
  grouse:   { label: 'Тетерев', food: 30, health: 30, size: 'large'  },
  beaver:   { label: 'Бобёр',   food: 30, health: 30, size: 'large'  },
  hare:     { label: 'Заяц',    food: 30, health: 30, size: 'large'  },
};

const SPAWNERS = [
  { id: 's1', prey: 'bunny',    everyMs: 2*60*1000, x: 500,  y: 400 },
  { id: 's2', prey: 'mouse',    everyMs: 2*60*1000, x: 850,  y: 350 },
  { id: 's3', prey: 'hedgehog', everyMs: 2*60*1000, x: 1200, y: 500 },
  { id: 's4', prey: 'snake',    everyMs: 3*60*1000, x: 1350, y: 600 },
  { id: 's5', prey: 'grouse',   everyMs: 5*60*1000, x: 700,  y: 900 },
  { id: 's6', prey: 'squirrel', everyMs: 3*60*1000, x: 950,  y: 950 },
  { id: 's7', prey: 'hare',     everyMs: 5*60*1000, x: 1500, y: 800 },
  { id: 's8', prey: 'beaver',   everyMs: 5*60*1000, x: 2000, y: 700 },
  { id: 's9', prey: 'crucian',  everyMs: 3*60*1000, x: 2070, y: 760 },
  { id: 's10',prey: 'perch',    everyMs: 2*60*1000, x: 1930, y: 760 },
];

const PREY_SPEED  = 2.2;
const STRIKE_RADIUS = 90;
const BOUNDS = { minX: 100, maxX: 2200, minY: 100, maxY: 1100 };

let nextPreyId = 1;

class PreyServer {
  constructor(room) {
    this.room = room;
    this.activePrey = new Map(); // id → prey object
    this.spawners = SPAWNERS.map(cfg => ({
      ...cfg,
      current: null,
      cooldown: Math.random() * cfg.everyMs, // разброс первого спавна
    }));
    this._lastTick = Date.now();
  }

  // Вызывается из GameLoop каждые 200мс
  tick() {
    const now = Date.now();
    const dt  = Math.min(now - this._lastTick, 1000);
    this._lastTick = now;

    // Двигаем дичь
    for (const p of this.activePrey.values()) {
      p.dirTimer -= dt;
      if (p.dirTimer <= 0) this._pickDir(p);

      p.x += p.dx * PREY_SPEED * (dt / 50);
      p.y += p.dy * PREY_SPEED * (dt / 50);

      if (p.x < BOUNDS.minX) { p.x = BOUNDS.minX; p.dx *= -1; }
      else if (p.x > BOUNDS.maxX) { p.x = BOUNDS.maxX; p.dx *= -1; }
      if (p.y < BOUNDS.minY) { p.y = BOUNDS.minY; p.dy *= -1; }
      else if (p.y > BOUNDS.maxY) { p.y = BOUNDS.maxY; p.dy *= -1; }
    }

    // Спавн
    for (const sp of this.spawners) {
      if (sp.current) continue;
      sp.cooldown -= dt;
      if (sp.cooldown > 0) continue;
      sp.cooldown = sp.everyMs;
      this._spawnAt(sp);
    }
  }

  _spawnAt(sp) {
    const cfg = PREY_CONFIG[sp.prey];
    const id  = nextPreyId++;
    const prey = {
      id, type: sp.prey, spawner: sp.id,
      x: sp.x, y: sp.y - 20,
      health: cfg.health,
      dx: 0, dy: 0, dirTimer: 0,
    };
    this._pickDir(prey);
    sp.current = id;
    this.activePrey.set(id, prey);

    this.room.broadcast({ type: MSG.PREY_SPAWN, payload: this._preyDTO(prey) });
  }

  _pickDir(prey) {
    const angle = Math.random() * Math.PI * 2;
    prey.dx = Math.cos(angle);
    prey.dy = Math.sin(angle);
    prey.dirTimer = 1000 + Math.random() * 2000;
  }

  // Удар по дичи от игрока. Возвращает null или { preyId, cfg, killed }
  strike(player, charX, charY) {
    let target = null, bestDist = Infinity;
    for (const p of this.activePrey.values()) {
      const dx = p.x - charX, dy = p.y - charY;
      const d  = Math.sqrt(dx*dx + dy*dy);
      if (d <= STRIKE_RADIUS && d < bestDist) { bestDist = d; target = p; }
    }
    if (!target) return null;

    const base = 3 + Math.random() * 4;
    const dmg  = Math.max(1, Math.round(base));
    target.health = Math.max(0, target.health - dmg);

    if (target.health <= 0) {
      return this._killPrey(target, player.id);
    }
    return { preyId: target.id, killed: false };
  }

  _killPrey(prey, killerId) {
    const cfg = PREY_CONFIG[prey.type];
    const sp  = this.spawners.find(s => s.id === prey.spawner);
    if (sp) sp.current = null;
    this.activePrey.delete(prey.id);
    this.room.broadcast({ type: MSG.PREY_KILLED, payload: { preyId: prey.id, killerId, cfg } });
    return { preyId: prey.id, killed: true, cfg };
  }

  getSnapshot() {
    return [...this.activePrey.values()].map(this._preyDTO);
  }

  _preyDTO(p) {
    return { id: p.id, type: p.type, x: Math.round(p.x), y: Math.round(p.y), health: p.health };
  }
}

module.exports = { PreyServer };
