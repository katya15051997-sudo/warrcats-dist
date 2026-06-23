import * as PIXI from 'pixi.js';
import { createCharacters } from './menu/character.js';
import { setupInput, keys, setStrikeHandler } from './input.js';
import { LargeFloor, loadBackground } from './fon/textures.js';
import { showMainMenu, currentSettings } from './menu/menu.js';
import { showInGameMenu, hideInGameMenu } from './menu/ingame-menu.js';
import { initBottomMenu, hideBottomMenu, getNeedValue } from './menu/bottom-menu.js';
import { startNeedsSystem, stopNeedsSystem } from './menu/needs-system.js';
import { createWorldObjects, stopActiveAction, isActionActive, setupSparringAction } from './world-objects.js';
import { createPreySystem, updatePreySystem, strikeNearestPrey } from './prey-system.js';
import { createFoxEnemy, strikeFox, getFoxPosition, FOX_STRIKE_RADIUS } from './enemy-fox.js';
import { setupCharacterActions, updateCharacterActions, resetCharacterPose } from './character-actions.js';
import { syncAge, reloadForActiveCharacter as reloadProfile } from './menu/character-profile.js';
import { reloadForActiveCharacter as reloadXpSystem } from './menu/xp-system.js';
import { reloadForActiveCharacter as reloadNeedsSystem } from './menu/needs-system.js';
import { reloadForActiveCharacter as reloadNeedsAndSkills } from './menu/bottom-menu.js';
import { createDayNightOverlay, updateDayNightCycle, setPeriod } from './day-night-cycle.js';
import { applyCharacterData } from './menu/character.js';
import { getActiveCharacter } from './menu/character-save.js';
import { progressMoveTasks, addXp } from './menu/xp-system.js';
import { spendSleepForStrike, gainFood } from './menu/needs-system.js';
import { showToast } from './notify.js';
import { refreshActivePanel } from './menu/bottom-menu.js';

// ─── Авторизация ─────────────────────────────────────────────────────────────
import { requireAuth } from './auth.js';

// ─── Мультиплеер ─────────────────────────────────────────────────────────────
import {
  connect, disconnect, send, on as netOn,
  getMyId, isConnected, setNeedsGetter,
} from './network.js';
import {
  initOtherPlayers, applySnapshot, updateOtherPlayers,
  addOtherPlayer, removeOtherPlayer, getAllOthers, getOtherSprite,
} from './otherPlayers.js';
import { initChat, receiveMessage, loadHistory, hideChatOverlay, showChatOverlay } from './chat.js';

// ─── Константы ───────────────────────────────────────────────────────────────
const MOVE_SEND_MS   = 50;  // как часто шлём свою позицию (20 раз/сек)
const PERIOD_SYNC_MS = 500; // задержка применения смены суток с сервера

;(async () => {
  const app = new PIXI.Application({
    resizeTo: window,
    backgroundAlpha: 0,
  });

  document.getElementById('pixi-container').appendChild(app.view);

  // Проверяем / запрашиваем авторизацию перед показом меню
  const user = await requireAuth();
  window.currentUser = user; // { userId, username, characters }

  window.startGameCallback = (settings) => startGame(app, settings);
  showMainMenu(app, window.startGameCallback);
})();

let _activeTicker = null;

async function startGame(app, settings) {
  console.log('🚀 Игра запущена с настройками:', settings);

  if (_activeTicker) {
    app.ticker.remove(_activeTicker);
    _activeTicker = null;
  }

  // Отключаем предыдущее WS-соединение (если был рестарт игры)
  disconnect();

  app.stage.removeChildren();

  try {
    reloadProfile();
    reloadXpSystem();
    reloadNeedsSystem();
    reloadNeedsAndSkills();

    await loadBackground();

    const { idleChar, walkChar, eyeSprite, setWalking, setFacing, getFacingLeft } =
      await createCharacters(app);

    const activeCharData = getActiveCharacter();

    setupInput();
    initBottomMenu();
    startNeedsSystem();
    syncAge();

    const SPEED     = 5;
    const AIR_SPEED = 4.5;
    const GRAVITY   = 0.5;
    const JUMP_POWER = -10;
    let verticalVelocity = 0;
    let isGrounded   = true;
    let originalGroundY = null;
    let jumpRequested   = false;

    // ─── Мир ───────────────────────────────────────────────────────────────
    const world = new PIXI.Container();
    app.stage.addChild(world);

    createDayNightOverlay(world, LargeFloor.width, LargeFloor);

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

    // Система дичи (локальная — для соло. В мультиплеере позиции заменятся серверными)
    await createPreySystem(world, {
      minX: 100, maxX: WORLD_WIDTH - 100,
      minY: 100, maxY: WORLD_HEIGHT - 100,
    });

    await createFoxEnemy(world);

    // ─── Удар E ────────────────────────────────────────────────────────────
    setStrikeHandler(() => {
      const active = idleChar;
      if (!active) return;

      // Удар по другому игроку (если рядом)
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

      // Удар по лисе
      const foxPos = getFoxPosition();
      if (foxPos) {
        const dx = foxPos.x - active.x;
        const dy = foxPos.y - active.y;
        if (Math.sqrt(dx*dx + dy*dy) <= FOX_STRIKE_RADIUS) {
          strikeFox();
          return;
        }
      }

      // Удар по дичи (сначала локально, потом уведомляем сервер)
      const hit = strikeNearestPrey(active.x, active.y);
      if (hit) {
        send('strike', { type: 'prey', x: active.x, y: active.y });
      }
    });

    setupCharacterActions(world, [idleChar]);

    // ─── Другие игроки ─────────────────────────────────────────────────────
    await initOtherPlayers(world);

    // ─── Чат ───────────────────────────────────────────────────────────────
    initChat();

    // ─── Сетевые обработчики ───────────────────────────────────────────────

    // Начальный снапшот мира при подключении
    netOn('init', ({ myId, players, prey, period, chat }) => {
      console.log(`[net] я — игрок #${myId}, в комнате ${players.length} игроков`);
      applySnapshot(players);

      // Спарринг: вешаем ПКМ на спрайты всех существующих игроков
      _bindSparringToAll();

      // Синхронизируем время суток
      if (period) {
        const periodMap = { morning: 0, day: 1, evening: 2, night: 3 };
        if (periodMap[period] !== undefined) setPeriod(periodMap[period]);
      }

      // История чата
      if (chat?.length) loadHistory(chat);

      showToast('✅ Подключено к серверу', { duration: 2000 });
    });

    // Обновление позиций каждые 50мс
    netOn('state', (players) => {
      applySnapshot(players);
    });

    // Новый игрок вошёл
    netOn('player_join', (playerData) => {
      addOtherPlayer(playerData);
      // Вешаем спарринг на нового игрока
      setTimeout(() => {
        const sprite = getOtherSprite(playerData.id);
        if (sprite) {
          setupSparringAction(sprite, playerData.name, playerData.id, (targetId) => {
            send('sparring_invite', { targetId });
          });
        }
      }, 300); // небольшой таймаут чтобы спрайт успел появиться
      showToast(`${playerData.name} вошёл на сервер`);
    });

    // Игрок вышел
    netOn('player_leave', ({ id }) => {
      removeOtherPlayer(id);
    });

    // Результат удара по игроку
    netOn('strike_result', ({ attackerId, targetId, damage }) => {
      const myId = getMyId();
      if (targetId === myId) {
        // По нам попали
        showToast(`⚔️ Тебя ударили! −${damage} здоровья`, { duration: 2000, fontSize: 14 });
        // damageHealth вызываем через needs-system
        import('./menu/needs-system.js').then(m => m.damageHealth(damage));
      }
    });

    // Результат нашего удара (сервер подтвердил убийство дичи)
    netOn('self_strike_res', ({ preyKilled, food }) => {
      if (preyKilled && food) {
        gainFood(food);
        refreshActivePanel();
      }
    });

    // Чат
    netOn('chat_msg', receiveMessage);

    // Запрос спарринга от другого игрока
    netOn('sparring_req', ({ fromId, fromName }) => {
      _showSparringBanner(fromId, fromName);
    });

    // Спарринг завершён (оба согласились)
    netOn('sparring_done', ({ p1Id, p2Id }) => {
      const myId = getMyId();
      if (p1Id === myId || p2Id === myId) {
        // Клиент сам тратит энергию (сервер уже потратил её у обоих,
        // но needs-system живёт на клиенте, поэтому синхронизируем вручную)
        spendSleepForStrike(5);
        addXp('train');
        progressMoveTasks('sparring');
        refreshActivePanel();
        showToast('⚔️ Тренировка завершена! +0.3 xp, −5 бодрости', { duration: 2400, fontSize: 14 });
      }
    });

    // Спарринг отменён / отклонён
    netOn('sparring_cancel', ({ reason }) => {
      const msg = reason === 'timeout' ? 'Время вышло — тренировка отменена'
                                       : 'Тренировка отклонена';
      showToast(msg, { fontSize: 14 });
    });

    // Серверная дичь убита (другим игроком)
    netOn('prey_killed', ({ preyId, killerId }) => {
      // Локальная система дичи сама обновится по prey_state
      if (killerId !== getMyId()) {
        showToast('Другой кот поймал добычу');
      }
    });

    // Смена суток с сервера
    netOn('day_period', ({ period }) => {
      const periodMap = { morning: 0, day: 1, evening: 2, night: 3 };
      if (periodMap[period] !== undefined) setPeriod(periodMap[period]);
    });

    // ─── Подключаемся к серверу ────────────────────────────────────────────
    // Передаём данные персонажа — сервер создаст запись или обновит существующую
    const charForServer = {
      id:         activeCharData?.id   ?? null,
      name:       activeCharData?.name ?? 'Безымянный',
      build:      activeCharData?.build ?? 'lean',
      appearance: activeCharData?.app  ?? null,
      h:    getNeedValue('h')    ?? 100,
      max_h: 30, // getMaxHealth() при желании
      e:    getNeedValue('e')    ?? 100,
      food: getNeedValue('food') ?? 100,
      thirst: getNeedValue('thirst') ?? 100,
      ss:   getNeedValue('ss')   ?? 100,
    };

    // Периодически шлём потребности серверу для сохранения
    setNeedsGetter(() => ({
      h:      getNeedValue('h')      ?? 0,
      e:      getNeedValue('e')      ?? 0,
      food:   getNeedValue('food')   ?? 0,
      thirst: getNeedValue('thirst') ?? 0,
      ss:     getNeedValue('ss')     ?? 0,
    }));

    connect(charForServer);

    // ─── Таймер отправки движения ──────────────────────────────────────────
    let _lastMoveSend = 0;

    // ─── Game loop ─────────────────────────────────────────────────────────
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
      updateOtherPlayers(); // интерполяция других игроков

      if (originalGroundY === null) originalGroundY = active.y;

      // Прыжок
      if (keys.space && isGrounded && !jumpRequested) {
        verticalVelocity = JUMP_POWER;
        isGrounded    = false;
        jumpRequested = true;
      }
      if (!keys.space) jumpRequested = false;

      const currentSpeed = isGrounded ? SPEED : AIR_SPEED;

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

      // Отправляем позицию серверу не чаще MOVE_SEND_MS
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

      // Камера
      cameraX = active.x - app.screen.width  / 2;
      cameraY = active.y - app.screen.height / 2;
      cameraX = Math.max(0, Math.min(WORLD_WIDTH  - app.screen.width,  cameraX));
      cameraY = Math.max(0, Math.min(WORLD_HEIGHT - app.screen.height, cameraY));
      world.x = -cameraX;
      world.y = -cameraY;
    };

    app.ticker.add(_activeTicker);

    // ─── ESC-меню ──────────────────────────────────────────────────────────
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

// ─── Вспомогательные функции ─────────────────────────────────────────────────

// Повесить спарринг-ПКМ на всех текущих других игроков
function _bindSparringToAll() {
  for (const other of getAllOthers()) {
    const sprite = getOtherSprite(other.id);
    if (sprite) {
      setupSparringAction(sprite, other.name, other.id, (targetId) => {
        send('sparring_invite', { targetId });
      });
    }
  }
}

// Баннер-запрос согласия на спарринг (входящий)
let _sparringBannerEl = null;

function _showSparringBanner(fromId, fromName) {
  _removeSparringBanner();

  _sparringBannerEl = document.createElement('div');
  _sparringBannerEl.style.cssText = `
    position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
    background: rgba(15,25,15,0.97); border: 2px solid #8B5A2B; border-radius: 10px;
    color: #ffcc80; font-family: 'Ink Free','Segoe Print',cursive;
    font-size: 16px; padding: 16px 24px; text-align: center;
    z-index: 9000; box-shadow: 0 6px 20px rgba(0,0,0,0.7); min-width: 280px;
  `;
  _sparringBannerEl.innerHTML = `
    <div style="margin-bottom:12px;">⚔️ <b>${_esc(fromName)}</b> зовёт потренироваться!<br>
      <span style="font-size:12px;color:#c9bda0;">−5 бодрости каждому, +0.3 xp и прогресс приёма</span>
    </div>
    <div style="display:flex;gap:10px;justify-content:center;">
      <button id="spar-yes" style="padding:8px 22px;background:#3a2f1e;border:2px solid #8fd14f;
        color:#8fd14f;border-radius:8px;cursor:pointer;font-family:inherit;font-size:15px;">✓ Да</button>
      <button id="spar-no"  style="padding:8px 22px;background:#3a2f1e;border:2px solid #ff6666;
        color:#ff6666;border-radius:8px;cursor:pointer;font-family:inherit;font-size:15px;">✗ Нет</button>
    </div>
  `;
  document.body.appendChild(_sparringBannerEl);

  _sparringBannerEl.querySelector('#spar-yes').addEventListener('click', () => {
    send('sparring_accept', { fromId });
    _removeSparringBanner();
  });
  _sparringBannerEl.querySelector('#spar-no').addEventListener('click', () => {
    send('sparring_reject', { fromId });
    _removeSparringBanner();
  });

  // Автоудаление через 15 сек
  setTimeout(_removeSparringBanner, 15_000);
}

function _removeSparringBanner() {
  if (_sparringBannerEl) {
    _sparringBannerEl.remove();
    _sparringBannerEl = null;
  }
}

function _esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
