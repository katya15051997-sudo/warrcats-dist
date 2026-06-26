const http                = require('http');
const { WebSocketServer } = require('ws');
const bcrypt              = require('bcrypt');
const jwt                 = require('jsonwebtoken');
const Room                = require('./room');
const db                  = require('./db');

const PORT       = process.env.PORT       || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'warrcats_dev_secret_change_in_prod';

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

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url.split('?')[0];

  if (url === '/health' && req.method === 'GET') {
    res.writeHead(200); res.end('ok'); return;
  }

  if (url === '/api/register' && req.method === 'POST') {
    return send(res, 403, { error: 'Регистрация временно закрыта' });
  }

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

  if (url === '/api/me' && req.method === 'GET') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });

    const characters = db.getCharactersByUser(payload.userId);
    return send(res, 200, { userId: payload.userId, username: payload.username, characters });
  }

  if (url === '/api/servers' && req.method === 'GET') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });

    const servers = db.getAllServers().map(s => ({
      ...s,
      players: room.getPlayerCountInServer?.(s.id) ?? 0,
    }));
    return send(res, 200, { servers });
  }

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

  const deleteSrvMatch = url.match(/^\/api\/servers\/([^/]+)$/);
  if (deleteSrvMatch && req.method === 'DELETE') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });
    db.deleteServerDB(deleteSrvMatch[1], payload.userId);
    return send(res, 200, { ok: true });
  }

  if (url === '/api/characters' && req.method === 'POST') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });

    const body = await readBody(req);

    if (body.id) {
      const existing = db.getCharacter(body.id);
      if (!existing || existing.user_id !== payload.userId)
        return send(res, 403, { error: 'Нет доступа' });

      db.updateCharacterAppearance(body.id, payload.userId, {
        tribe:      body.tribe      ?? existing.tribe,
        build:      body.build      ?? existing.build,
        size:       body.size       ?? existing.size,
        appearance: body.appearance ?? existing.appearance,
      });
      const saved = db.getCharacter(body.id);
      console.log(`[char] внешность обновлена: ${saved.name} (${saved.id}) → ${payload.username}`);
      return send(res, 200, { character: saved });
    }

    const id    = genId('char');
    const max_h = body.max_h ?? 30;
    db.insertCharacter({
      id,
      user_id:          payload.userId,
      name:             (body.name ?? 'Безымянный').toString().slice(0, 40),
      tribe:            body.tribe,
      role:             body.role ?? 'Котёнок',
      age_moons: Number(body.age_moons ?? body.age ?? 0),
      last_moon_update: Math.floor(Date.now() / 1000),
      build:            body.build ?? 'lean',
      size:             body.size  ?? 0.7,
      appearance:       body.appearance ?? null,
      h:                max_h,
      max_h:            max_h,
      max_health:       max_h,
      e:                100,
      food:             100,
      thirst:           100,
      ss:               100,
      toilet:           0,
      xp:               0,
      move_states:      null,
      sleep_bonuses:    null,
      parents:          null,
      mate:             null,
      kittens:          null,
      inventory:        [],
      achievements:     [],
    });
    const saved = db.getCharacter(id);
    console.log(`[char] создан: ${saved.name} (${saved.id}) → ${payload.username}`);
    return send(res, 200, { character: saved });
  }

  const charIdMatch = url.match(/^\/api\/characters\/([^/]+)$/);

  if (charIdMatch && req.method === 'GET') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });

    const char = db.getCharacter(charIdMatch[1]);
    if (!char || char.user_id !== payload.userId)
      return send(res, 403, { error: 'Нет доступа' });

    return send(res, 200, { character: char });
  }

  if (charIdMatch && req.method === 'DELETE') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });
    db.deleteCharacterDB(charIdMatch[1], payload.userId);
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: 'Not found' });
});

const wss  = new WebSocketServer({ server, path: '/ws' });
const room = new Room();

wss.on('connection', (ws, req) => {
  console.log(`[ws] подключение от ${req.socket.remoteAddress}`);
  let player = null;

  ws.once('message', (raw) => {
    let hello = null;
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'hello' && msg.payload) hello = msg.payload;
    } catch {}

    if (!hello?.token) {
      ws.close(4001, 'Нет авторизации');
      return;
    }

    let userPayload;
    try { userPayload = jwt.verify(hello.token, JWT_SECRET); }
    catch { ws.close(4001, 'Токен невалиден или истёк'); return; }

    const charId = hello.charId;
    if (!charId) {
      ws.close(4002, 'Не выбран персонаж');
      return;
    }

    const char = db.getCharacter(charId);
    if (!char || char.user_id !== userPayload.userId) {
      ws.close(4003, 'Персонаж не найден или нет доступа');
      return;
    }

    player = room.addPlayer(ws, char);

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
