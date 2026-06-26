import * as PIXI from 'pixi.js';
import { createCharacters } from './character/character.js';
import { setupInput, keys, setStrikeHandler } from './input.js';
import { LargeFloor, loadBackground } from './fon/textures.js';
import { currentSettings } from './config/game-settings.js';
import { showInGameMenu, hideInGameMenu } from './ui/ingame-menu.js';
import { initBottomMenu, hideBottomMenu, refreshActivePanel } from './ui/bottom-menu.js';
import { startNeedsSystem, stopNeedsSystem, getNeed, syncAge, reloadForActiveCharacter as reloadPlayerSystem, gainFood, damageHealth, spendEnergyForStrike, removeVignette, getNeedPenalties, registerPeriodGetter } from './systems/player-system.js';
import { reloadForActiveCharacter as reloadSkills, progressMoveTasks, addXp } from './systems/skills.js';
import { createWorldObjects, stopActiveAction, isActionActive } from './world/world-objects.js';
import { createPreySystem, updatePreySystem, strikeNearestPrey } from './systems/prey-system.js';
import { createFoxEnemy, strikeFox, getFoxPosition, FOX_STRIKE_RADIUS } from './world/enemy-fox.js';
import { setupCharacterActions, updateCharacterActions, resetCharacterPose } from './character/character-actions.js';
import { createDayNightOverlay, updateDayNightCycle, setPeriod, getCurrentPeriod } from './systems/day-night-cycle.js';
import { applyCharacterData } from './character/character.js';
import { getActiveCharacter } from './character/character-save.js';
import { showToast } from './ui/notify.js';
import {
  initSparring, setSparringCharSprite,
  handleSparringInvite, startSparring,
  handleSparringHit, handleSparringOpponentHit,
  handleSparringEnd, isSparringActive, sparringStrike,
} from './systems/sparring.js';
import { initLanding } from './ui/landing.js';
import {
  connect, disconnect, send, on as netOn,
  getMyId, isConnected, setNeedsGetter,
} from './net/network.js';
import {
  initOtherPlayers, applySnapshot, updateOtherPlayers,
  addOtherPlayer, removeOtherPlayer, getAllOthers, getOtherSprite,
} from './world/otherPlayers.js';
import { initChat, receiveMessage, loadHistory, hideChatOverlay, showChatOverlay } from './ui/chat.js';

const MOVE_SEND_MS   = 50;
const PERIOD_SYNC_MS = 500;

;(async () => {
  const app = new PIXI.Application({
    resizeTo: window,
    backgroundAlpha: 0,
  });

  document.getElementById('pixi-container').appendChild(app.view);

  window.startGameCallback = (serverId, serverSettings) => {
    startGame(app, serverSettings ?? {});
  };

  window.showGameMenu = () => initLanding(window.startGameCallback);

  await initLanding(window.startGameCallback);
})();

let _activeTicker = null;

async function startGame(app, settings) {
  console.log('🚀 Игра запущена с настройками:', settings);

  if (_activeTicker) {
    app.ticker.remove(_activeTicker);
    _activeTicker = null;
  }

  disconnect();
  app.stage.removeChildren();

  try {
    reloadPlayerSystem();
    reloadSkills();

    await loadBackground();

    const { idleChar, walkChar, eyeSprite, setWalking, setFacing, getFacingLeft } =
      await createCharacters(app);

    const activeCharData = getActiveCharacter();

    setupInput();
    initBottomMenu();
    startNeedsSystem();
    syncAge();

    const SPEED      = 5;
    const AIR_SPEED  = 4.5;
    const GRAVITY    = 0.5;
    const JUMP_POWER = -10;
    let verticalVelocity = 0;
    let isGrounded       = true;
    let originalGroundY  = null;
    let jumpRequested    = false;

    const world = new PIXI.Container();
    app.stage.addChild(world);

    createDayNightOverlay(world, LargeFloor.width, LargeFloor);
    registerPeriodGetter(() => getCurrentPeriod().id);

    world.addChild(LargeFloor);
    world.addChild(idleChar);
    if (eyeSprite) world.addChild(eyeSprite);

    if (app.stage.children.includes(idleChar)) {
      app.stage.removeChild(idleChar);
    }

    if (activeCharData && idleChar) {
      applyCharacterData(idleChar, activeCharData);
    }

    await createWorldObjects(world);

    const WORLD_WIDTH  = LargeFloor.width;
    const WORLD_HEIGHT = LargeFloor.height;

    await createPreySystem(world, {
      minX: 100, maxX: WORLD_WIDTH - 100,
      minY: 100, maxY: WORLD_HEIGHT - 100,
    });

    await createFoxEnemy(world);

    setStrikeHandler(() => {
      const active = idleChar;
      if (!active) return;

      if (isSparringActive()) {
        sparringStrike();
        return;
      }

      const others = getAllOthers();
      for (const other of others) {
        if (!other.sprite) continue;
        const dx = other.sprite.x - active.x;
        const dy = other.sprite.y - active.y;
        if (Math.sqrt(dx*dx + dy*dy) <= FOX_STRIKE_RADIUS) {
          send('strike', { targetId: other.id, type: 'player' });
          return;
        }
      }

      const foxPos = getFoxPosition();
      if (foxPos) {
        const dx = foxPos.x - active.x;
        const dy = foxPos.y - active.y;
        if (Math.sqrt(dx*dx + dy*dy) <= FOX_STRIKE_RADIUS) {
          strikeFox();
          return;
        }
      }

      const hit = strikeNearestPrey(active.x, active.y);
      if (hit) {
        send('strike', { type: 'prey', x: active.x, y: active.y });
      }
    });

    setupCharacterActions(world, [idleChar]);

    await initOtherPlayers(world);
    initSparring(world, app, idleChar);

    initChat();

    netOn('init', ({ myId, players, prey, period, chat }) => {
      console.log(`[net] я — игрок #${myId}, в комнате ${players.length} игроков`);
      applySnapshot(players);

      if (period) {
        const periodMap = { morning: 0, day: 1, evening: 2, night: 3 };
        if (periodMap[period] !== undefined) setPeriod(periodMap[period]);
      }

      if (chat?.length) loadHistory(chat);

      showToast('✅ Подключено к серверу', { duration: 2000 });
    });

    netOn('state', (players) => {
      applySnapshot(players);
    });

    netOn('player_join', (playerData) => {
      addOtherPlayer(playerData);
      showToast(`${playerData.name} вошёл на сервер`);
    });

    netOn('player_leave', ({ id }) => {
      removeOtherPlayer(id);
    });

    netOn('strike_result', ({ attackerId, targetId, damage }) => {
      if (targetId === getMyId()) {
        showToast(`⚔️ Тебя ударили! −${damage} здоровья`, { duration: 2000, fontSize: 14 });
        damageHealth(damage);
      }
    });

    netOn('self_strike_res', ({ preyKilled, food }) => {
      if (preyKilled && food) {
        gainFood(food);
        refreshActivePanel();
      }
    });

    netOn('chat_msg', receiveMessage);

    netOn('sparring_cancel', ({ reason }) => {
      showToast(reason === 'timeout' ? 'Время вышло — тренировка отменена' : 'Тренировка отклонена', { fontSize: 14 });
      handleSparringEnd();
    });

    netOn('sparring_req', ({ fromId, fromName }) => {
      handleSparringInvite(fromId, fromName, idleChar);
    });

    netOn('sparring_start', ({ opponentId, opponentName }) => {
      startSparring(opponentId, opponentName, getOtherSprite(opponentId));
    });

    netOn('sparring_hit_me',       ({ damage }) => handleSparringHit(damage));
    netOn('sparring_hit_opponent', ({ damage }) => handleSparringOpponentHit(damage));

    netOn('prey_killed', ({ preyId, killerId }) => {
      if (killerId !== getMyId()) showToast('Другой кот поймал добычу');
    });

    netOn('day_period', ({ period }) => {
      const periodMap = { morning: 0, day: 1, evening: 2, night: 3 };
      if (periodMap[period] !== undefined) setPeriod(periodMap[period]);
    });

    const charForServer = {
      id:         activeCharData?.id   ?? null,
      name:       activeCharData?.name ?? 'Безымянный',
      build:      activeCharData?.build ?? 'lean',
      appearance: activeCharData?.app  ?? null,
      size: (() => {
        const age = activeCharData?.age ?? 0;
        if (age <= 6)  return 0.3;
        if (age <= 9)  return 0.4;
        if (age <= 13) return 0.5;
        return activeCharData?.size ?? 0.7;
      })(),
      h:      getNeed('h')      ?? 100,
      max_h:  30,
      e:      getNeed('e')      ?? 100,
      food:   getNeed('food')   ?? 100,
      thirst: getNeed('thirst') ?? 100,
      ss:     getNeed('ss')     ?? 100,
    };

    setNeedsGetter(() => ({
      h:      getNeed('h')      ?? 0,
      e:      getNeed('e')      ?? 0,
      food:   getNeed('food')   ?? 0,
      thirst: getNeed('thirst') ?? 0,
      ss:     getNeed('ss')     ?? 0,
    }));

    connect(charForServer);

    let _lastMoveSend = 0;
    let cameraX = 0;
    let cameraY = 0;

    _activeTicker = () => {
      updateDayNightCycle();

      const moving = keys.left || keys.right || keys.up || keys.down;

      if (moving && isActionActive()) {
        stopActiveAction();
        resetCharacterPose();
      }

      setWalking(moving);
      if (keys.right) setFacing(false);
      else if (keys.left) setFacing(true);

      const active = idleChar;

      updatePreySystem(active);
      updateCharacterActions(active);
      updateOtherPlayers();

      if (originalGroundY === null) originalGroundY = active.y;

      if (keys.space && isGrounded && !jumpRequested) {
        verticalVelocity = JUMP_POWER;
        isGrounded    = false;
        jumpRequested = true;
      }
      if (!keys.space) jumpRequested = false;

      const { speedMult } = getNeedPenalties();
      const currentSpeed = (isGrounded ? SPEED : AIR_SPEED) * speedMult;

      if (keys.right) active.x += currentSpeed;
      if (keys.left)  active.x -= currentSpeed;
      if (keys.up)    active.y -= currentSpeed;
      if (keys.down)  active.y += currentSpeed;

      if (!isGrounded) {
        verticalVelocity += GRAVITY;
        active.y += verticalVelocity;
        if (active.y >= originalGroundY) {
          active.y = originalGroundY;
          verticalVelocity = 0;
          isGrounded = true;
        }
      }

      const hw = 60, hh = 60;
      active.x = Math.max(hw, Math.min(WORLD_WIDTH - hw, active.x));
      active.y = Math.max(hh, Math.min(WORLD_HEIGHT - hh, active.y));

      if (isGrounded) originalGroundY = active.y;

      const now = performance.now();
      if (now - _lastMoveSend >= MOVE_SEND_MS) {
        _lastMoveSend = now;
        send('move', {
          x:          Math.round(active.x),
          y:          Math.round(active.y),
          facingLeft: getFacingLeft(),
          walking:    moving,
        });
      }

      cameraX = active.x - app.screen.width  / 2;
      cameraY = active.y - app.screen.height / 2;
      cameraX = Math.max(0, Math.min(WORLD_WIDTH  - app.screen.width,  cameraX));
      cameraY = Math.max(0, Math.min(WORLD_HEIGHT - app.screen.height, cameraY));
      world.x = -cameraX;
      world.y = -cameraY;
    };

    app.ticker.add(_activeTicker);

    if (window._escHandler) window.removeEventListener('keydown', window._escHandler);
    window._escHandler = (e) => {
      if (e.key === 'Escape') {
        const existingMenu = document.getElementById('ingame-menu');
        if (existingMenu) {
          hideInGameMenu();
          showChatOverlay();
        } else {
          showInGameMenu(app);
          hideChatOverlay();
        }
      }
    };
    window.addEventListener('keydown', window._escHandler);

  } catch (error) {
    console.error('Ошибка запуска игры:', error);
  }
}
