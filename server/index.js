// server/index.js
// Точка входа. HTTP API + WebSocket игра.
//
// Переменные окружения:
//   PORT        — порт (по умолчанию 8080)
//   JWT_SECRET  — секрет для токенов (ОБЯЗАТЕЛЬНО задать на проде!)
//   CLEAR_CHARS — если '1', очищает таблицу characters при старте (разовая миграция)

const http                = require('http');
const { WebSocketServer } = require('ws');
const bcrypt              = require('bcrypt');
const jwt                 = require('jsonwebtoken');
const Room                = require('./room');
const db                  = require('./db');

const PORT       = process.env.PORT       || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'warrcats_dev_secret_change_in_prod';

// ─── Разовая очистка тестовых данных ─────────────────────────────────────────
// Запусти один раз с CLEAR_CHARS=1:  CLEAR_CHARS=1 pm2 restart warrcats --update-env
// После перезапуска убери переменную.
if (process.env.CLEAR_CHARS === '1') {
  const Database = require('better-sqlite3');
  const path     = require('path');
  const _db = new Database(path.join(__dirname, '..', 'warrcats.db'));
  const info = _db.prepare('DELETE FROM characters').run();
  _db.close();
  console.log(`[startup] CLEAR_CHARS: удалено ${info.changes} персонажей`);
}

// ─── Вспомогательные функции ─────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function verifyToken(req) {
  const auth = req.headers['authorization'] ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

function genId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── HTTP-сервер ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url.split('?')[0];

  // ── Health ───────────────────────────────────────────────────────────────────
  if (url === '/health' && req.method === 'GET') {
    res.writeHead(200); res.end('ok'); return;
  }

  // ── POST /api/register ───────────────────────────────────────────────────────
  if (url === '/api/register' && req.method === 'POST') {
    return send(res, 403, { error: 'Регистрация временно закрыта' });
  }

  // ── POST /api/login ──────────────────────────────────────────────────────────
  if (url === '/api/login' && req.method === 'POST') {
    const { username, password } = await readBody(req);
    if (!username || !password)
      return send(res, 400, { error: 'username и password обязательны' });

    const user = db.getUserByUsername(username);
    if (!user) return send(res, 401, { error: 'Неверное имя или пароль' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return send(res, 401, { error: 'Неверное имя или пароль' });

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    console.log(`[auth] вошёл: ${username}`);
    return send(res, 200, { token, userId: user.id, username: user.username });
  }

  // ── GET /api/me ──────────────────────────────────────────────────────────────
  if (url === '/api/me' && req.method === 'GET') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });

    const characters = db.getCharactersByUser(payload.userId);
    return send(res, 200, { userId: payload.userId, username: payload.username, characters });
  }

  // ── GET /api/servers ─────────────────────────────────────────────────────────
  if (url === '/api/servers' && req.method === 'GET') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });

    const servers = db.getAllServers().map(s => ({
      ...s,
      players: room.getPlayerCountInServer?.(s.id) ?? 0,
    }));
    return send(res, 200, { servers });
  }

  // ── POST /api/servers ────────────────────────────────────────────────────────
  if (url === '/api/servers' && req.method === 'POST') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });

    const { name, settings } = await readBody(req);
    if (!name?.trim()) return send(res, 400, { error: 'Нужно указать название сервера' });

    const id  = genId('srv');
    const srv = db.createServer(id, payload.userId, name.trim(), settings ?? {});
    console.log(`[server] создан: ${name} (${id}) владелец: ${payload.username}`);
    return send(res, 200, { server: srv });
  }

  // ── DELETE /api/servers/:id ──────────────────────────────────────────────────
  const deleteSrvMatch = url.match(/^\/api\/servers\/([^/]+)$/);
  if (deleteSrvMatch && req.method === 'DELETE') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });

    db.deleteServerDB(deleteSrvMatch[1], payload.userId);
    return send(res, 200, { ok: true });
  }

  // ── POST /api/characters ─────────────────────────────────────────────────────
  // Создание или полное обновление персонажа (из редактора).
  // Запрещаем менять name/role/age_moons если персонаж уже существует.
  if (url === '/api/characters' && req.method === 'POST') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });

    const body = await readBody(req);
    const isNew = !body.id;

    // Клиент хранит возраст в поле `age`, сервер — в `age_moons`. Маппируем.
    const incomingMoons = body.age_moons ?? body.age ?? 0;

    if (isNew) {
      body.id               = genId('char');
      body.user_id          = payload.userId;
      body.age_moons        = incomingMoons;
      body.last_moon_update = Math.floor(Date.now() / 1000);
      body.h                = body.max_h ?? 30;
      body.max_health       = body.max_h ?? 30;
      body.e                = 100;
      body.food             = 100;
      body.thirst           = 100;
      body.ss               = 100;
      body.xp               = 0;
    } else {
      const existing = db.getCharacter(body.id);
      if (!existing || existing.user_id !== payload.userId)
        return send(res, 403, { error: 'Нет доступа' });

      body.name             = existing.name;
      body.role             = existing.role;
      body.age_moons        = incomingMoons;
      body.last_moon_update = existing.last_moon_update;
      body.user_id          = payload.userId;
    }

    db.saveCharacter(body);
    const saved = db.getCharacter(body.id);
    console.log(`[char] ${isNew ? 'создан' : 'обновлён'}: ${saved.name} (${saved.id}) → ${payload.username}`);
    return send(res, 200, { character: saved });
  }

  // ── PATCH /api/characters/:id ────────────────────────────────────────────────
  // Частичный флаш игрового состояния (xp, нужды, здоровье).
  // Вызывается debounced-тикером раз в 3 сек и при выходе из игры.
  const charIdMatch = url.match(/^\/api\/characters\/([^/]+)$/);

  if (charIdMatch && req.method === 'PATCH') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });

    const state = await readBody(req);
    db.patchCharacterState(charIdMatch[1], payload.userId, state);
    return send(res, 200, { ok: true });
  }

  // ── GET /api/characters/:id ──────────────────────────────────────────────────
  // Получить одного персонажа (нужно клиенту при старте игры, чтобы загрузить
  // актуальное состояние с сервера вместо чтения из localStorage).
  if (charIdMatch && req.method === 'GET') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });

    const char = db.getCharacter(charIdMatch[1]);
    if (!char || char.user_id !== payload.userId)
      return send(res, 403, { error: 'Нет доступа' });

    return send(res, 200, { character: char });
  }

  // ── DELETE /api/characters/:id ───────────────────────────────────────────────
  if (charIdMatch && req.method === 'DELETE') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });

    db.deleteCharacterDB(charIdMatch[1], payload.userId);
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: 'Not found' });
});

// ─── WebSocket ────────────────────────────────────────────────────────────────

const wss  = new WebSocketServer({ server, path: '/ws' });
const room = new Room();

wss.on('connection', (ws, req) => {
  console.log(`[ws] подключение от ${req.socket.remoteAddress}`);

  let player = null;

  ws.once('message', (raw) => {
    let charData = null;
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'hello' && msg.payload) charData = msg.payload;
    } catch {}

    // Гостевого режима нет — обязателен валидный JWT
    if (!charData?.token) {
      ws.close(4001, 'Нет авторизации');
      return;
    }

    try {
      const p = jwt.verify(charData.token, JWT_SECRET);
      charData.userId   = p.userId;
      charData.username = p.username;
    } catch {
      ws.close(4001, 'Токен невалиден или истёк');
      return;
    }
    delete charData.token;

    player = room.addPlayer(ws, charData);

    ws.on('message', (raw2) => {
      try { room.handleMessage(player, JSON.parse(raw2)); }
      catch (e) { console.warn('[ws] плохое сообщение:', e.message); }
    });
  });

  ws.on('close', () => { if (player) room.removePlayer(player.id); });
  ws.on('error', (err) => { console.warn('[ws] ошибка сокета:', err.message); ws.terminate(); });

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});

// Heartbeat
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 30_000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`✅ WarrCats server запущен на порту ${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`   API:       http://localhost:${PORT}/api`);
  console.log(`   Health:    http://localhost:${PORT}/health`);
  if (JWT_SECRET === 'warrcats_dev_secret_change_in_prod') {
    console.warn('⚠️  JWT_SECRET не задан! Установите переменную окружения JWT_SECRET на проде.');
  }
});
