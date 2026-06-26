const Database = require('better-sqlite3');
const path     = require('path');

const db = new Database(path.join(__dirname, '..', 'warrcats.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

if (process.env.RESET_CHAR_SCHEMA === '1') {
  db.exec('DROP TABLE IF EXISTS characters');
  console.log('[db] таблица characters удалена (RESET_CHAR_SCHEMA=1)');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    username    TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    email       TEXT,
    created_at  INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS characters (
    id               TEXT PRIMARY KEY,
    user_id          TEXT REFERENCES users(id) ON DELETE CASCADE,
    name             TEXT NOT NULL DEFAULT 'Безымянный',
    tribe            TEXT,
    role             TEXT,
    age_moons        INTEGER DEFAULT 0,
    last_moon_update INTEGER,
    build            TEXT DEFAULT 'lean',
    size             REAL DEFAULT 0.7,
    appearance       TEXT,
    h                REAL DEFAULT 30,
    max_h            REAL DEFAULT 30,
    max_health       REAL DEFAULT 30,
    e                REAL DEFAULT 100,
    food             REAL DEFAULT 100,
    thirst           REAL DEFAULT 100,
    ss               REAL DEFAULT 100,
    toilet           REAL DEFAULT 0,
    xp               REAL DEFAULT 0,
    move_states      TEXT,
    sleep_bonuses    TEXT,
    parents          TEXT,
    mate             TEXT,
    kittens          TEXT,
    inventory        TEXT,
    achievements     TEXT,
    created_at       INTEGER DEFAULT (strftime('%s','now')),
    updated_at       INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS servers (
    id          TEXT PRIMARY KEY,
    owner_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    moons       INTEGER DEFAULT 0,
    settings    TEXT NOT NULL DEFAULT '{}',
    created_at  INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS chat_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id   TEXT,
    sender_name TEXT,
    text        TEXT,
    ts          INTEGER DEFAULT (strftime('%s','now'))
  );
`);

function toText(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function parseJSON(s) {
  if (s === null || s === undefined) return null;
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return s; }
}

const stmtUserInsert     = db.prepare('INSERT INTO users (id, username, password, email) VALUES (?, ?, ?, ?)');
const stmtUserByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const stmtUserById       = db.prepare('SELECT id, username, created_at FROM users WHERE id = ?');

function registerUser(id, username, passwordHash, email = null) {
  stmtUserInsert.run(id, username, passwordHash, email);
}
function getUserByUsername(username) { return stmtUserByUsername.get(username) ?? null; }
function getUserById(id) { return stmtUserById.get(id) ?? null; }

const stmtCharGet    = db.prepare('SELECT * FROM characters WHERE id = ?');
const stmtCharByUser = db.prepare('SELECT * FROM characters WHERE user_id = ? ORDER BY updated_at DESC');
const stmtCharDelete = db.prepare('DELETE FROM characters WHERE id = ? AND user_id = ?');

const stmtCharInsert = db.prepare(`
  INSERT INTO characters (
    id, user_id, name, tribe, role, age_moons, last_moon_update,
    build, size, appearance,
    h, max_h, max_health, e, food, thirst, ss, toilet,
    xp, move_states, sleep_bonuses,
    parents, mate, kittens, inventory, achievements
  ) VALUES (
    @id, @user_id, @name, @tribe, @role, @age_moons, @last_moon_update,
    @build, @size, @appearance,
    @h, @max_h, @max_health, @e, @food, @thirst, @ss, @toilet,
    @xp, @move_states, @sleep_bonuses,
    @parents, @mate, @kittens, @inventory, @achievements
  )
`);

const stmtCharUpdateAppearance = db.prepare(`
  UPDATE characters SET
    tribe = @tribe, build = @build, size = @size, appearance = @appearance,
    updated_at = strftime('%s','now')
  WHERE id = @id AND user_id = @user_id
`);

const stmtCharPatchState = db.prepare(`
  UPDATE characters SET
    h = @h, max_h = @max_h, max_health = @max_health,
    e = @e, food = @food, thirst = @thirst, ss = @ss, toilet = @toilet,
    xp = @xp, move_states = @move_states, sleep_bonuses = @sleep_bonuses,
    age_moons = @age_moons, last_moon_update = @last_moon_update,
    parents = @parents, mate = @mate, kittens = @kittens,
    inventory = @inventory, achievements = @achievements,
    updated_at = strftime('%s','now')
  WHERE id = @id AND user_id = @user_id
`);

const stmtMoonTick = db.prepare(`
  UPDATE characters SET
    age_moons = age_moons + 1,
    last_moon_update = strftime('%s','now'),
    updated_at = strftime('%s','now')
`);

function _parseChar(row) {
  if (!row) return null;
  return {
    ...row,
    tribe:         parseJSON(row.tribe),
    appearance:    parseJSON(row.appearance),
    move_states:   parseJSON(row.move_states),
    sleep_bonuses: parseJSON(row.sleep_bonuses),
    parents:       parseJSON(row.parents),
    mate:          parseJSON(row.mate),
    kittens:       parseJSON(row.kittens),
    inventory:     parseJSON(row.inventory),
    achievements:  parseJSON(row.achievements),
  };
}

function getCharacter(id) { return _parseChar(stmtCharGet.get(id)); }
function getCharactersByUser(userId) { return stmtCharByUser.all(userId).map(_parseChar); }

function insertCharacter(char) {
  stmtCharInsert.run({
    id:               char.id,
    user_id:          char.user_id,
    name:             char.name ?? 'Безымянный',
    tribe:            toText(char.tribe),
    role:             typeof char.role === 'string' ? char.role : toText(char.role),
    age_moons:        char.age_moons ?? 0,
    last_moon_update: char.last_moon_update ?? Math.floor(Date.now() / 1000),
    build:            char.build ?? 'lean',
    size:             char.size ?? 0.7,
    appearance:       toText(char.appearance),
    h:                char.h ?? 30,
    max_h:            char.max_h ?? 30,
    max_health:       char.max_health ?? 30,
    e:                char.e ?? 100,
    food:             char.food ?? 100,
    thirst:           char.thirst ?? 100,
    ss:               char.ss ?? 100,
    toilet:           char.toilet ?? 0,
    xp:               char.xp ?? 0,
    move_states:      toText(char.move_states),
    sleep_bonuses:    toText(char.sleep_bonuses),
   parents: toText(char.parents),
mate:    toText(char.mate),
kittens: toText(char.kittens),
    inventory:        toText(char.inventory),
    achievements:     toText(char.achievements),
  });
}

function updateCharacterAppearance(charId, userId, data) {
  stmtCharUpdateAppearance.run({
    id:         charId,
    user_id:    userId,
    tribe:      toText(data.tribe),
    build:      data.build ?? 'lean',
    size:       data.size ?? 0.7,
    appearance: toText(data.appearance),
  });
}

function patchCharacterState(charId, userId, state) {
  stmtCharPatchState.run({
    id:               charId,
    user_id:          userId,
    h:                state.h ?? 30,
    max_h:            state.max_h ?? 30,
    max_health:       state.max_health ?? 30,
    e:                state.e ?? 100,
    food:             state.food ?? 100,
    thirst:           state.thirst ?? 100,
    ss:               state.ss ?? 100,
    toilet:           state.toilet ?? 0,
    xp:               state.xp ?? 0,
    move_states:      toText(state.move_states),
    sleep_bonuses:    toText(state.sleep_bonuses),
    age_moons:        state.age_moons ?? 0,
    last_moon_update: state.last_moon_update ?? null,
    parents:          toText(state.parents),
    mate:             toText(state.mate),
    kittens:          toText(state.kittens),
    inventory:        toText(state.inventory),
    achievements:     toText(state.achievements),
  });
}

function deleteCharacterDB(charId, userId) { stmtCharDelete.run(charId, userId); }

function tickMoonsForAll() {
  const info = stmtMoonTick.run();
  console.log(`[moons] +1 луна всем (затронуто ${info.changes} персонажей)`);
}

const stmtServerAll    = db.prepare('SELECT * FROM servers ORDER BY created_at DESC');
const stmtServerGet    = db.prepare('SELECT * FROM servers WHERE id = ?');
const stmtServerInsert = db.prepare(`INSERT INTO servers (id, owner_id, name, moons, settings) VALUES (@id, @owner_id, @name, @moons, @settings)`);
const stmtServerUpdate = db.prepare(`UPDATE servers SET name=@name, moons=@moons, settings=@settings WHERE id=@id`);
const stmtServerDelete = db.prepare('DELETE FROM servers WHERE id = ? AND owner_id = ?');
const stmtServerMoons  = db.prepare('UPDATE servers SET moons = moons + 1 WHERE id = ?');

function _parseServer(row) {
  if (!row) return null;
  return { ...row, settings: parseJSON(row.settings) ?? {} };
}

function getAllServers()           { return stmtServerAll.all().map(_parseServer); }
function getServerDB(id)           { return _parseServer(stmtServerGet.get(id)); }
function deleteServerDB(sid, uid)  { stmtServerDelete.run(sid, uid); }
function incrementServerMoons(id)  { stmtServerMoons.run(id); }

function createServer(id, ownerId, name, settings) {
  stmtServerInsert.run({ id, owner_id: ownerId, name, moons: 0, settings: JSON.stringify(settings ?? {}) });
  return getServerDB(id);
}

function updateServerDB(id, name, moons, settings) {
  stmtServerUpdate.run({ id, name, moons, settings: JSON.stringify(settings ?? {}) });
}

const stmtChatInsert = db.prepare('INSERT INTO chat_log (sender_id, sender_name, text) VALUES (?, ?, ?)');
const stmtChatRecent = db.prepare('SELECT * FROM chat_log ORDER BY id DESC LIMIT 100');

function logChat(senderId, senderName, text) { stmtChatInsert.run(senderId, senderName, text); }
function getRecentChat() { return stmtChatRecent.all().reverse(); }

let lastMoonTickWeek = -1;

function _checkMoonTick() {
  const now = new Date();
  const utcDay  = now.getUTCDay();
  const utcHour = now.getUTCHours();
  const utcMin  = now.getUTCMinutes();
  if (utcDay === 0 && utcHour === 21 && utcMin === 0) {
    const weekNum = Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
    if (weekNum !== lastMoonTickWeek) {
      lastMoonTickWeek = weekNum;
      tickMoonsForAll();
    }
  }
}

setInterval(_checkMoonTick, 60_000);
console.log('[moons] тикер запущен — +1 луна в понедельник 00:00 МСК');

module.exports = {
  registerUser, getUserByUsername, getUserById,
  getCharacter, getCharactersByUser,
  insertCharacter, updateCharacterAppearance, patchCharacterState,
  deleteCharacterDB, tickMoonsForAll,
  getAllServers, getServerDB, createServer, updateServerDB, deleteServerDB,
  incrementServerMoons,
  logChat, getRecentChat,
};
