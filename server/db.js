// server/db.js
// Хранилище: персонажи, пользователи, серверы, чат.
// SQLite (better-sqlite3) — файл warrcats.db создаётся автоматически.
//
// npm install better-sqlite3 bcrypt jsonwebtoken

const Database = require('better-sqlite3');
const path     = require('path');

const db = new Database(path.join(__dirname, '..', 'warrcats.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─────────────────────────────────────────────────────────────────────────────
// Схема
// ─────────────────────────────────────────────────────────────────────────────
db.exec(`
  -- Аккаунты
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    username    TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,           -- bcrypt-хэш
    created_at  INTEGER DEFAULT (strftime('%s','now'))
  );

  -- Персонажи (привязаны к аккаунту)
  CREATE TABLE IF NOT EXISTS characters (
    id          TEXT PRIMARY KEY,
    user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT 'Безымянный',
    tribe       TEXT,
    role        TEXT,
    age_moons   INTEGER DEFAULT 0,
    build       TEXT DEFAULT 'lean',
    appearance  TEXT,          -- JSON
    xp          REAL DEFAULT 0,
    move_states TEXT,          -- JSON
    h           REAL DEFAULT 100,
    max_h       REAL DEFAULT 30,
    e           REAL DEFAULT 100,
    food        REAL DEFAULT 100,
    thirst      REAL DEFAULT 100,
    ss          REAL DEFAULT 100,
    updated_at  INTEGER DEFAULT (strftime('%s','now'))
  );

  -- Игровые серверы (комнаты) — общие для всех
  CREATE TABLE IF NOT EXISTS servers (
    id          TEXT PRIMARY KEY,
    owner_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    moons       INTEGER DEFAULT 0,
    settings    TEXT NOT NULL DEFAULT '{}',   -- JSON
    created_at  INTEGER DEFAULT (strftime('%s','now'))
  );

  -- Чат
  CREATE TABLE IF NOT EXISTS chat_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id   TEXT,
    sender_name TEXT,
    text        TEXT,
    ts          INTEGER DEFAULT (strftime('%s','now'))
  );
`);

// ─────────────────────────────────────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────────────────────────────────────

const stmtUserInsert      = db.prepare('INSERT INTO users (id, username, password) VALUES (?, ?, ?)');
const stmtUserByUsername  = db.prepare('SELECT * FROM users WHERE username = ?');
const stmtUserById        = db.prepare('SELECT id, username, created_at FROM users WHERE id = ?');

function registerUser(id, username, passwordHash) {
  stmtUserInsert.run(id, username, passwordHash);
}

function getUserByUsername(username) {
  return stmtUserByUsername.get(username) ?? null;
}

function getUserById(id) {
  return stmtUserById.get(id) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Characters
// ─────────────────────────────────────────────────────────────────────────────

const stmtCharGet    = db.prepare('SELECT * FROM characters WHERE id = ?');
const stmtCharByUser = db.prepare('SELECT * FROM characters WHERE user_id = ?');
const stmtCharUpsert = db.prepare(`
  INSERT INTO characters (id, user_id, name, tribe, role, age_moons, build, appearance,
    xp, move_states, h, max_h, e, food, thirst, ss, updated_at)
  VALUES (@id, @user_id, @name, @tribe, @role, @age_moons, @build, @appearance,
    @xp, @move_states, @h, @max_h, @e, @food, @thirst, @ss, strftime('%s','now'))
  ON CONFLICT(id) DO UPDATE SET
    name        = excluded.name,
    tribe       = excluded.tribe,
    role        = excluded.role,
    age_moons   = excluded.age_moons,
    build       = excluded.build,
    appearance  = excluded.appearance,
    xp          = excluded.xp,
    move_states = excluded.move_states,
    h           = excluded.h,
    max_h       = excluded.max_h,
    e           = excluded.e,
    food        = excluded.food,
    thirst      = excluded.thirst,
    ss          = excluded.ss,
    updated_at  = strftime('%s','now')
`);
const stmtCharDelete = db.prepare('DELETE FROM characters WHERE id = ? AND user_id = ?');

function _parseChar(row) {
  if (!row) return null;
  return {
    ...row,
    appearance:  row.appearance  ? JSON.parse(row.appearance)  : null,
    move_states: row.move_states ? JSON.parse(row.move_states) : null,
  };
}

function getCharacter(id) {
  return _parseChar(stmtCharGet.get(id));
}

function getCharactersByUser(userId) {
  return stmtCharByUser.all(userId).map(_parseChar);
}

function saveCharacter(char) {
  stmtCharUpsert.run({
    id:          char.id,
    user_id:     char.user_id     ?? null,
    name:        char.name        ?? 'Безымянный',
    tribe:       char.tribe       ?? null,
    role:        char.role        ?? null,
    age_moons:   char.age_moons   ?? 0,
    build:       char.build       ?? 'lean',
    appearance:  char.appearance  ? JSON.stringify(char.appearance)  : null,
    xp:          char.xp          ?? 0,
    move_states: char.move_states ? JSON.stringify(char.move_states) : null,
    h:           char.h           ?? 100,
    max_h:       char.max_h       ?? 30,
    e:           char.e           ?? 100,
    food:        char.food        ?? 100,
    thirst:      char.thirst      ?? 100,
    ss:          char.ss          ?? 100,
  });
}

function deleteCharacterDB(charId, userId) {
  stmtCharDelete.run(charId, userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Servers (игровые комнаты)
// ─────────────────────────────────────────────────────────────────────────────

const stmtServerAll    = db.prepare('SELECT * FROM servers ORDER BY created_at DESC');
const stmtServerGet    = db.prepare('SELECT * FROM servers WHERE id = ?');
const stmtServerInsert = db.prepare(`
  INSERT INTO servers (id, owner_id, name, moons, settings)
  VALUES (@id, @owner_id, @name, @moons, @settings)
`);
const stmtServerUpdate = db.prepare(`
  UPDATE servers SET name=@name, moons=@moons, settings=@settings WHERE id=@id
`);
const stmtServerDelete = db.prepare('DELETE FROM servers WHERE id = ? AND owner_id = ?');
const stmtServerMoons  = db.prepare('UPDATE servers SET moons = moons + 1 WHERE id = ?');

function _parseServer(row) {
  if (!row) return null;
  return { ...row, settings: row.settings ? JSON.parse(row.settings) : {} };
}

function getAllServers() {
  return stmtServerAll.all().map(_parseServer);
}

function getServerDB(id) {
  return _parseServer(stmtServerGet.get(id));
}

function createServer(id, ownerId, name, settings) {
  stmtServerInsert.run({
    id,
    owner_id: ownerId,
    name,
    moons: 0,
    settings: JSON.stringify(settings ?? {}),
  });
  return getServerDB(id);
}

function updateServerDB(id, name, moons, settings) {
  stmtServerUpdate.run({ id, name, moons, settings: JSON.stringify(settings ?? {}) });
}

function deleteServerDB(serverId, ownerId) {
  stmtServerDelete.run(serverId, ownerId);
}

function incrementServerMoons(serverId) {
  stmtServerMoons.run(serverId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat log
// ─────────────────────────────────────────────────────────────────────────────

const stmtChatInsert = db.prepare('INSERT INTO chat_log (sender_id, sender_name, text) VALUES (?, ?, ?)');
const stmtChatRecent = db.prepare('SELECT * FROM chat_log ORDER BY id DESC LIMIT 100');

function logChat(senderId, senderName, text) {
  stmtChatInsert.run(senderId, senderName, text);
}

function getRecentChat() {
  return stmtChatRecent.all().reverse();
}

module.exports = {
  // users
  registerUser, getUserByUsername, getUserById,
  // characters
  getCharacter, getCharactersByUser, saveCharacter, deleteCharacterDB,
  // servers
  getAllServers, getServerDB, createServer, updateServerDB, deleteServerDB, incrementServerMoons,
  // chat
  logChat, getRecentChat,
};
