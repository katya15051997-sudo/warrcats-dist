const { MSG }       = require('./protocol');
const { GameLoop }  = require('./gameLoop');
const { PreyServer} = require('./preyServer');
const { patchCharacterState, logChat, getRecentChat } = require('./db');

const STRIKE_RADIUS        = 120;
const SAVE_INTERVAL_MS     = 10 * 1000;
const SPARRING_TIMEOUT     = 15 * 1000;
const SPARRING_ENERGY_COST = 5;

let nextConnId = 1;

class Room {
  constructor() {
    this.players = new Map();
    this.prey    = new PreyServer(this);
    this.loop    = new GameLoop(this);
    this.loop.start();

    setInterval(() => this._saveAll(), SAVE_INTERVAL_MS);
  }

  addPlayer(ws, char) {
    const id = nextConnId++;

    const player = {
      id, ws,
      charId:    char.id,
      userId:    char.user_id,
      name:      char.name,
      tribe:     char.tribe,
      role:      char.role,
      age_moons: char.age_moons ?? 0,
      last_moon_update: char.last_moon_update ?? null,
      build:     char.build ?? 'lean',
      size:      char.size  ?? 0.7,
      appearance: char.appearance ?? null,
      x: 400, y: 400, facingLeft: false, walking: false,
      h:          char.h          ?? 30,
      max_h:      char.max_h      ?? 30,
      max_health: char.max_health ?? 30,
      e:          char.e          ?? 100,
      food:       char.food       ?? 100,
      thirst:     char.thirst     ?? 100,
      ss:         char.ss         ?? 100,
      toilet:     char.toilet     ?? 0,
      xp:         char.xp         ?? 0,
      move_states:   char.move_states   ?? null,
      sleep_bonuses: char.sleep_bonuses ?? null,
      parents:      char.parents      ?? null,
      mate:         char.mate         ?? null,
      kittens:      char.kittens      ?? null,
      inventory:    char.inventory    ?? null,
      achievements: char.achievements ?? null,
      pose: 'normal',
      sparringPending: null,
      activeSparring:  null,
    };

    this.players.set(id, player);

    this._send(ws, {
      type: MSG.INIT,
      payload: {
        myId:      id,
        character: this._fullCharForOwner(player),
        players:   this.getPlayersSnapshot(),
        prey:      this.prey.getSnapshot(),
        period:    this.loop.getCurrentPeriod(),
        chat:      getRecentChat().slice(-50),
      },
    });

    this.broadcast(
      { type: MSG.PLAYER_JOIN, payload: this._playerDTO(player) },
      ws
    );

    console.log(`[room] +${player.name} (id=${id}, char=${player.charId}), всего: ${this.players.size}`);
    return player;
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return;
    this._flushPlayer(player);
    this.players.delete(id);
    this.broadcast({ type: MSG.PLAYER_LEAVE, payload: { id } });
    console.log(`[room] −id=${id}, осталось: ${this.players.size}`);
  }

  handleMessage(player, msg) {
    switch (msg.type) {
      case MSG.MOVE:
        player.x          = msg.payload.x          ?? player.x;
        player.y          = msg.payload.y          ?? player.y;
        player.facingLeft = msg.payload.facingLeft ?? player.facingLeft;
        player.walking    = msg.payload.walking    ?? player.walking;
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

      case MSG.STATE_SYNC:
        this._handleStateSync(player, msg.payload);
        break;

      case 'pose':
        player.pose = msg.payload.pose ?? 'normal';
        break;

      default:
        break;
    }
  }

  _handleStateSync(p, payload) {
    if (!payload) return;
    const fields = [
      'h','max_h','max_health','e','food','thirst','ss','toilet',
      'xp','move_states','sleep_bonuses',
      'age_moons','last_moon_update',
      'parents','mate','kittens','inventory','achievements',
    ];
    for (const f of fields) {
      if (payload[f] !== undefined) p[f] = payload[f];
    }
  }

  _handleStrike(attacker, payload) {
    const { targetId, type } = payload;

    if (type === 'prey') {
      const result = this.prey.strike(attacker, attacker.x, attacker.y);
      if (result?.killed) {
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

      const damage = 3 + Math.floor(Math.random() * 7);
      target.h = Math.max(0, target.h - damage);

      this.broadcast({
        type: MSG.STRIKE_RESULT,
        payload: { attackerId: attacker.id, targetId, damage },
      });
      return;
    }
  }

  _handleChat(player, payload) {
    const text = String(payload.text ?? '').trim().slice(0, 200);
    if (!text) return;

    logChat(player.charId, player.name, text);

    this.broadcast({
      type: MSG.CHAT_MSG,
      payload: { senderId: player.id, name: player.name, text },
    });
  }

  _handleSparringInvite(from, targetId) {
    const target = this.players.get(targetId);
    if (!target) return;

    if (from.sparringPending) clearTimeout(from.sparringPending.timeoutHandle);

    const timeoutHandle = setTimeout(() => {
      from.sparringPending = null;
      this._send(from.ws, {
        type: MSG.SPARRING_CANCEL,
        payload: { fromId: from.id, reason: 'timeout' },
      });
    }, SPARRING_TIMEOUT);

    from.sparringPending = { targetId, timeoutHandle };

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

    this._send(opponent.ws, { type: 'sparring_hit_me',       payload: { damage } });
    this._send(from.ws,     { type: 'sparring_hit_opponent', payload: { damage } });
  }

  _endSparring(p1Id, p2Id) {
    const p1 = this.players.get(p1Id);
    const p2 = this.players.get(p2Id);
    if (p1) { p1.activeSparring = null; p1.e = Math.max(0, (p1.e ?? 100) - SPARRING_ENERGY_COST); }
    if (p2) { p2.activeSparring = null; p2.e = Math.max(0, (p2.e ?? 100) - SPARRING_ENERGY_COST); }
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

  getPlayersSnapshot() {
    return [...this.players.values()].map(this._playerDTO);
  }

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

  _fullCharForOwner(p) {
    return {
      id: p.charId, user_id: p.userId,
      name: p.name, tribe: p.tribe, role: p.role,
      age_moons: p.age_moons, last_moon_update: p.last_moon_update,
      build: p.build, size: p.size, appearance: p.appearance,
      h: p.h, max_h: p.max_h, max_health: p.max_health,
      e: p.e, food: p.food, thirst: p.thirst, ss: p.ss, toilet: p.toilet,
      xp: p.xp, move_states: p.move_states, sleep_bonuses: p.sleep_bonuses,
      parents: p.parents, mate: p.mate, kittens: p.kittens,
      inventory: p.inventory, achievements: p.achievements,
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

  _flushPlayer(p) {
    if (!p.charId || !p.userId) return;
    try {
      patchCharacterState(p.charId, p.userId, {
        h: p.h, max_h: p.max_h, max_health: p.max_health,
        e: p.e, food: p.food, thirst: p.thirst, ss: p.ss, toilet: p.toilet,
        xp: p.xp,
        move_states: p.move_states,
        sleep_bonuses: p.sleep_bonuses,
        age_moons: p.age_moons,
        last_moon_update: p.last_moon_update,
        parents: p.parents, mate: p.mate, kittens: p.kittens,
        inventory: p.inventory, achievements: p.achievements,
      });
    } catch (e) {
      console.warn(`[room] ошибка сохранения char=${p.charId}:`, e.message);
    }
  }

  _saveAll() {
    for (const p of this.players.values()) this._flushPlayer(p);
  }
}

module.exports = Room;
