// server/protocol.js
// Единый источник истины для всех типов сообщений WS.
// Импортируется и сервером, и клиентом (network.js).

const MSG = {
  // Клиент → сервер
  MOVE:            'move',            // { x, y, facingLeft, walking }
  STRIKE:          'strike',          // { targetId, type: 'fox'|'prey'|'player' }
  CHAT:            'chat',            // { text }
  SPARRING_INVITE: 'sparring_invite', // { targetId }
  SPARRING_ACCEPT: 'sparring_accept', // { fromId }
  SPARRING_REJECT: 'sparring_reject', // { fromId }
  NEEDS_SYNC:      'needs_sync',      // { h, e, food, ss, thirst } — периодически
  ACTION:          'action',          // { actionId } — сесть/поспать/вылизаться

  // Сервер → клиент (конкретному игроку)
  INIT:            'init',            // { myId, players[], prey[], period }
  SELF_STRIKE_RES: 'self_strike_res', // { damage, stunMs, bleed } — результат своего удара

  // Сервер → всем в комнате (broadcast)
  STATE:           'state',           // { players[] } — снапшот каждые 50мс
  PLAYER_JOIN:     'player_join',     // { player }
  PLAYER_LEAVE:    'player_leave',    // { id }
  STRIKE_RESULT:   'strike_result',   // { attackerId, targetId, damage, stunMs }
  CHAT_MSG:        'chat_msg',        // { senderId, name, text }
  SPARRING_REQ:    'sparring_req',    // { fromId, fromName } — запрос к target
  SPARRING_DONE:   'sparring_done',   // { p1Id, p2Id } — оба потратили энергию
  SPARRING_CANCEL: 'sparring_cancel', // { fromId } — отклонено/таймаут
  PREY_SPAWN:      'prey_spawn',      // { prey } — дичь появилась
  PREY_KILLED:     'prey_killed',     // { preyId, killerId }
  PREY_STATE:      'prey_state',      // { prey[] } — позиции дичи каждые 200мс
  DAY_PERIOD:      'day_period',      // { period: 'morning'|'day'|'evening'|'night' }
  ERROR:           'error',           // { code, text }
};

// Для Node.js (CommonJS) и ESM-клиента
if (typeof module !== 'undefined') module.exports = { MSG };
