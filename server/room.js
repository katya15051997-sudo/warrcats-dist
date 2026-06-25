// server/room.js
// Игровая комната: держит всех подключённых игроков, обрабатывает
// сообщения, управляет спаррингом и делегирует бою/дичи.

const { MSG }       = require('./protocol');
const { GameLoop }  = require('./gameLoop');
const { PreyServer} = require('./preyServer');
const { saveCharacter, logChat, getRecentChat } = require('./db');

const STRIKE_RADIUS     = 120; // px — радиус удара по игроку
const SAVE_INTERVAL_MS  = 30 * 1000; // сохраняем каждые 30 сек
const SPARRING_TIMEOUT  = 15 * 1000; // 15 сек на принятие приглашения
const SPARRING_ENERGY_COST = 5;      // −5 бодрости каждому за спарринг

let nextConnId = 1;

class Room {
  constructor() {
    this.players  = new Map(); // connId → player
    this.prey     = new PreyServer(this);
    this.loop     = new GameLoop(this);
    this.loop.start();

    // Периодическое сохранение всех игроков в БД
    setInterval(() => this._saveAll(), SAVE_INTERVAL_MS);
  }

  // ─── Подключение / отключение ────────────────────────────────────────────

  addPlayer(ws, charData) {
    const id = nextConnId++;

    const player = {
      id,
      ws,
      // Данные персонажа (приходят с клиента при подключении)
      charId:   charData?.id    ?? `anon_${id}`,
      name:     charData?.name  ?? `Кот ${id}`,
      build:    charData?.build ?? 'lean',
      appearance: charData?.appearance ?? null,
      // Игровое состояние
      x:        charData?.x     ?? 400,
      y:        charData?.y     ?? 400,
      facingLeft: false,
      walking:  false,
      h:        charData?.h     ?? 100,
      max_h:    charData?.max_h ?? 30,
      e:        charData?.e     ?? 100,
      food:     charData?.food  ?? 100,
      thirst:   charData?.thirst?? 100,
      ss:       charData?.ss    ?? 100,
      xp:       charData?.xp   ?? 0,
      size:     charData?.size ?? 0.7,
      pose:     'normal',
      // Спарринг
      sparringPending: null, // { fromId, timeoutHandle }
    };

    this.players.set(id, player);

    // Отправляем новому игроку его id + снапшот мира + историю чата
    this._send(ws, {
      type: MSG.INIT,
      payload: {
        myId:    id,
        players: this.getPlayersSnapshot(),
        prey:    this.prey.getSnapshot(),
        period:  this.loop.getCurrentPeriod(),
        chat:    getRecentChat().slice(-50),
      },
    });

    // Всем остальным — что вошёл новый
    this.broadcast(
      { type: MSG.PLAYER_JOIN, payload: this._playerDTO(player) },
      ws
    );

    console.log(`[room] +${player.name} (id=${id}), всего: ${this.players.size}`);
    return player;
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return;

    // Сохраняем перед выходом
    saveCharacter(this._toDBRecord(player));

    this.players.delete(id);
    this.broadcast({ type: MSG.PLAYER_LEAVE, payload: { id } });
    console.log(`[room] −id=${id}, осталось: ${this.players.size}`);
  }

  // ─── Обработка входящих сообщений ────────────────────────────────────────

  handleMessage(player, msg) {
    switch (msg.type) {

      case MSG.MOVE:
        // Доверяем клиенту позицию (авторитетный клиент для движения).
        // При читерстве — добавить серверную валидацию скорости.
        player.x          = msg.payload.x          ?? player.x;
        player.y          = msg.payload.y          ?? player.y;
        player.facingLeft = msg.payload.facingLeft  ?? player.facingLeft;
        player.walking    = msg.payload.walking     ?? player.walking;
        break;

      case MSG.STRIKE:
        this._handleStrike(player, msg.payload);
        break;

      case MSG.CHAT:
        this._handleChat(player, msg.payload);
        break;

      case MSG.SPARRING_INVITE:
        this._handleSparringInvite(player, msg.payload.targetId);
        break;

      case MSG.SPARRING_ACCEPT:
        this._handleSparringAccept(player, msg.payload.fromId);
        break;

      case MSG.SPARRING_REJECT:
        this._handleSparringReject(player, msg.payload.fromId);
        break;

      case 'sparring_hit':
        this._handleSparringHit(player, msg.payload.damage ?? 10);
        break;

      case MSG.NEEDS_SYNC:
        // Клиент периодически сообщает актуальные потребности (для сохранения)
        player.h      = msg.payload.h      ?? player.h;
        player.e      = msg.payload.e      ?? player.e;
        player.food   = msg.payload.food   ?? player.food;
        player.thirst = msg.payload.thirst ?? player.thirst;
        player.ss     = msg.payload.ss     ?? player.ss;
        break;

      case 'pose':
        player.pose = msg.payload.pose ?? 'normal';
        break;

      default:
        break;
    }
  }

  // ─── Бой ─────────────────────────────────────────────────────────────────

  _handleStrike(attacker, payload) {
    const { targetId, type } = payload;

    if (type === 'prey') {
      const result = this.prey.strike(attacker, attacker.x, attacker.y);
      if (result?.killed) {
        // Начислим сытость атакующему (сервер сообщает клиенту)
        this._send(attacker.ws, {
          type: MSG.SELF_STRIKE_RES,
          payload: { preyKilled: true, food: result.cfg.food },
        });
      }
      return;
    }

    if (type === 'player') {
      const target = this.players.get(targetId);
      if (!target) return;

      const dx = target.x - attacker.x;
      const dy = target.y - attacker.y;
      if (Math.sqrt(dx*dx + dy*dy) > STRIKE_RADIUS) return;

      const damage = 3 + Math.floor(Math.random() * 7); // 3–10
      target.h = Math.max(0, target.h - damage);

      this.broadcast({
        type: MSG.STRIKE_RESULT,
        payload: { attackerId: attacker.id, targetId, damage },
      });
      return;
    }

    // type === 'fox' — лиса на карте у каждого клиента своя (NPC, не серверный)
    // Можно перенести сюда при необходимости
  }

  // ─── Чат ─────────────────────────────────────────────────────────────────

  _handleChat(player, payload) {
    const text = String(payload.text ?? '').trim().slice(0, 200);
    if (!text) return;

    logChat(player.charId, player.name, text);

    this.broadcast({
      type: MSG.CHAT_MSG,
      payload: { senderId: player.id, name: player.name, text },
    });
  }

  // ─── Спарринг ────────────────────────────────────────────────────────────

  _handleSparringInvite(from, targetId) {
    const target = this.players.get(targetId);
    if (!target) return;

    // Отменяем старый запрос от этого игрока, если был
    if (from.sparringPending) {
      clearTimeout(from.sparringPending.timeoutHandle);
    }

    const timeoutHandle = setTimeout(() => {
      from.sparringPending = null;
      this._send(from.ws, {
        type: MSG.SPARRING_CANCEL,
        payload: { fromId: from.id, reason: 'timeout' },
      });
    }, SPARRING_TIMEOUT);

    from.sparringPending = { targetId, timeoutHandle };

    // Просим target дать согласие
    this._send(target.ws, {
      type: MSG.SPARRING_REQ,
      payload: { fromId: from.id, fromName: from.name },
    });
  }

  _handleSparringAccept(acceptor, fromId) {
    const initiator = this.players.get(fromId);
    if (!initiator || !initiator.sparringPending) return;
    if (initiator.sparringPending.targetId !== acceptor.id) return;

    clearTimeout(initiator.sparringPending.timeoutHandle);
    initiator.sparringPending = null;

    // Запускаем спарринг со шкалами выносливости
    // Сохраняем состояние активного спарринга
    initiator.activeSparring = acceptor.id;
    acceptor.activeSparring  = initiator.id;

    this._send(initiator.ws, {
      type: 'sparring_start',
      payload: { opponentId: acceptor.id, opponentName: acceptor.name },
    });
    this._send(acceptor.ws, {
      type: 'sparring_start',
      payload: { opponentId: initiator.id, opponentName: initiator.name },
    });
  }

  _handleSparringHit(from, damage) {
    if (!from.activeSparring) return;
    const opponent = this.players.get(from.activeSparring);
    if (!opponent) return;

    // Сообщаем сопернику что его ударили
    this._send(opponent.ws, {
      type: 'sparring_hit_me',
      payload: { damage },
    });
    // Сообщаем атакующему что удар прошёл
    this._send(from.ws, {
      type: 'sparring_hit_opponent',
      payload: { damage },
    });
  }

  _endSparring(p1Id, p2Id) {
    const p1 = this.players.get(p1Id);
    const p2 = this.players.get(p2Id);
    if (p1) { p1.activeSparring = null; p1.e = Math.max(0, (p1.e ?? 100) - 5); }
    if (p2) { p2.activeSparring = null; p2.e = Math.max(0, (p2.e ?? 100) - 5); }
  }

  _handleSparringReject(rejector, fromId) {
    const initiator = this.players.get(fromId);
    if (!initiator || !initiator.sparringPending) return;

    clearTimeout(initiator.sparringPending.timeoutHandle);
    initiator.sparringPending = null;

    this._send(initiator.ws, {
      type: MSG.SPARRING_CANCEL,
      payload: { fromId: rejector.id, reason: 'rejected' },
    });
  }

  // ─── Снапшоты / отправка ─────────────────────────────────────────────────

  getPlayersSnapshot() {
    return [...this.players.values()].map(this._playerDTO);
  }

  // GameLoop вызывает это для тика дичи
  tickPrey()        { this.prey.tick(); }
  getPreySnapshot() { return this.prey.getSnapshot(); }

  _playerDTO(p) {
    return {
      id: p.id, name: p.name, build: p.build, appearance: p.appearance,
      x: Math.round(p.x), y: Math.round(p.y),
      facingLeft: p.facingLeft, walking: p.walking,
      h: Math.round(p.h), max_h: Math.round(p.max_h), e: Math.round(p.e),
      pose: p.pose ?? 'normal',
      size: p.size ?? 0.7,
    };
  }

  _send(ws, msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  broadcast(msg, exceptWs = null) {
    const str = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.ws !== exceptWs && p.ws.readyState === 1) {
        p.ws.send(str);
      }
    }
  }

  // ─── Сохранение ──────────────────────────────────────────────────────────

  _saveAll() {
    for (const p of this.players.values()) {
      saveCharacter(this._toDBRecord(p));
    }
  }

  _toDBRecord(p) {
    return {
      id: p.charId, name: p.name, build: p.build,
      appearance: p.appearance,
      xp: p.xp,
      h: p.h, max_h: p.max_h, e: p.e,
      food: p.food, thirst: p.thirst, ss: p.ss,
    };
  }
}

module.exports = Room;
