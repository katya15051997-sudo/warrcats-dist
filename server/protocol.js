const MSG = {
  MOVE:            'move',
  STRIKE:          'strike',
  CHAT:            'chat',
  SPARRING_INVITE: 'sparring_invite',
  SPARRING_ACCEPT: 'sparring_accept',
  SPARRING_REJECT: 'sparring_reject',
  STATE_SYNC:      'state_sync',
  ACTION:          'action',

  INIT:            'init',
  SELF_STRIKE_RES: 'self_strike_res',

  STATE:           'state',
  PLAYER_JOIN:     'player_join',
  PLAYER_LEAVE:    'player_leave',
  STRIKE_RESULT:   'strike_result',
  CHAT_MSG:        'chat_msg',
  SPARRING_REQ:    'sparring_req',
  SPARRING_DONE:   'sparring_done',
  SPARRING_CANCEL: 'sparring_cancel',
  PREY_SPAWN:      'prey_spawn',
  PREY_KILLED:     'prey_killed',
  PREY_STATE:      'prey_state',
  DAY_PERIOD:      'day_period',
  ERROR:           'error',
};

if (typeof module !== 'undefined') module.exports = { MSG };
