// server/index.js
// Точка входа. HTTP API (регистрация, логин, серверы) + WebSocket игра.
//
// Запуск:  node server/index.js
// Dev:     npx nodemon server/index.js
// Prod:    pm2 start server/index.js --name warrcats
//
// Переменные окружения:
//   PORT        — порт (по умолчанию 8080)
//   JWT_SECRET  — секрет для токенов (ОБЯЗАТЕЛЬНО задать на проде!)

const http              = require('http');
const { WebSocketServer } = require('ws');
const bcrypt            = require('bcrypt');
const jwt               = require('jsonwebtoken');
const Room              = require('./room');
const db                = require('./db');

const PORT       = process.env.PORT       || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'warrcats_dev_secret_change_in_prod';

// ─────────────────────────────────────────────────────────────────────────────
// Вспомогательные функции
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// HTTP-сервер
// ─────────────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS — разрешаем запросы с клиента (нужно для dev и для продакшна с другим доменом)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split('?')[0]; // убираем query string

  // ── Health-check ────────────────────────────────────────────────────────────
  if (url === '/health' && req.method === 'GET') {
    res.writeHead(200);
    res.end('ok');
    return;
  }

  // ── POST /api/register ──────────────────────────────────────────────────────
  // Регистрация временно закрыта
  if (url === '/api/register' && req.method === 'POST') {
    return send(res, 403, { error: 'Регистрация временно закрыта' });
  }

  // ── POST /api/login ─────────────────────────────────────────────────────────
  if (url === '/api/login' && req.method === 'POST') {
    const { username, password } = await readBody(req);

    if (!username || !password)
      return send(res, 400, { error: 'username и password обязательны' });

    const user = db.getUserByUsername(username);
    if (!user)
      return send(res, 401, { error: 'Неверное имя или пароль' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok)
      return send(res, 401, { error: 'Неверное имя или пароль' });

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    console.log(`[auth] вошёл: ${username}`);
    return send(res, 200, { token, userId: user.id, username: user.username });
  }

  // ── GET /api/me ─────────────────────────────────────────────────────────────
  // Проверка токена + список персонажей текущего пользователя
  if (url === '/api/me' && req.method === 'GET') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });

    const characters = db.getCharactersByUser(payload.userId);
    return send(res, 200, {
      userId:     payload.userId,
      username:   payload.username,
      characters,
    });
  }

  // ── GET /api/servers ────────────────────────────────────────────────────────
  if (url === '/api/servers' && req.method === 'GET') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });

    // Добавляем текущее число игроков из памяти
    const servers = db.getAllServers().map(s => ({
      ...s,
      players: room.getPlayerCountInServer?.(s.id) ?? 0,
    }));
    return send(res, 200, { servers });
  }

  // ── POST /api/servers ───────────────────────────────────────────────────────
  if (url === '/api/servers' && req.method === 'POST') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });

    const { name, settings } = await readBody(req);
    if (!name || !name.trim())
      return send(res, 400, { error: 'Нужно указать название сервера' });

    const id = genId('srv');
    const server = db.createServer(id, payload.userId, name.trim(), settings ?? {});
    console.log(`[server] создан: ${name} (${id}) владелец: ${payload.username}`);
    return send(res, 200, { server });
  }

  // ── DELETE /api/servers/:id ─────────────────────────────────────────────────
  const deleteMatch = url.match(/^\/api\/servers\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });

    const serverId = deleteMatch[1];
    db.deleteServerDB(serverId, payload.userId);
    return send(res, 200, { ok: true });
  }

  // ── POST /api/characters ────────────────────────────────────────────────────
  // Сохранить/обновить персонажа (вызывается с клиента при редактировании)
  if (url === '/api/characters' && req.method === 'POST') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });

    const charData = await readBody(req);
    if (!charData.id) charData.id = genId('char');
    charData.user_id = payload.userId;
    db.saveCharacter(charData);
    return send(res, 200, { character: db.getCharacter(charData.id) });
  }

  // ── DELETE /api/characters/:id ──────────────────────────────────────────────
  const deleteCharMatch = url.match(/^\/api\/characters\/([^/]+)$/);
  if (deleteCharMatch && req.method === 'DELETE') {
    const payload = verifyToken(req);
    if (!payload) return send(res, 401, { error: 'Нет авторизации' });

    db.deleteCharacterDB(deleteCharMatch[1], payload.userId);
    return send(res, 200, { ok: true });
  }

  // 404
  send(res, 404, { error: 'Not found' });
});

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket
// ─────────────────────────────────────────────────────────────────────────────

const wss  = new WebSocketServer({ server, path: '/ws' });
const room = new Room();

wss.on('connection', (ws, req) => {
  console.log(`[ws] подключение от ${req.socket.remoteAddress}`);

  let player = null;

  ws.once('message', (raw) => {
    let charData = null;
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'hello' && msg.payload) {
        charData = msg.payload; // { token, id, name, build, appearance, h, e, food, ... }
      }
    } catch {}

    // Верифицируем токен если передан — привязываем userId к игроку
    if (charData?.token) {
      try {
        const p = jwt.verify(charData.token, JWT_SECRET);
        charData.userId   = p.userId;
        charData.username = p.username;
      } catch {
        // токен протух или невалидный — играем как гость
      }
      delete charData.token; // не храним токен в памяти
    }

    player = room.addPlayer(ws, charData);

    ws.on('message', (raw2) => {
      try {
        const msg = JSON.parse(raw2);
        room.handleMessage(player, msg);
      } catch (e) {
        console.warn('[ws] плохое сообщение:', e.message);
      }
    });
  });

  ws.on('close', () => {
    if (player) room.removePlayer(player.id);
  });

  ws.on('error', (err) => {
    console.warn('[ws] ошибка сокета:', err.message);
    ws.terminate();
  });

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
