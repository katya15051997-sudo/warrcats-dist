// character-actions.js
// ПКМ по персонажу открывает меню действий: Сесть, Поспать, Вылизаться, Мурлыкать, Шипеть.
// "Сесть" — бессрочное действие: персонаж сидит и медленно восстанавливает
// бодрость, пока его не прервёт движение или другое действие.
// "Поспать" — динамическое действие: длится, пока бодрость не достигнет 100%
// от текущего максимума (см. getMaxSleep() в needs-system.js), прогресс
// отображается в реальном времени; прерывается движением или другим действием.
// "Вылизаться" — короткое действие, восполняет 2% здоровья.
// "Мурлыкать"/"Шипеть" — показывают эмодзи-иконку над персонажем на несколько секунд.

import * as PIXI from 'pixi.js';
import { showContextMenu, runDynamicAction, runIndefiniteAction, runTimedAction, stopActiveAction } from './world-objects.js';
import { setSleeping, restSleep, getMaxSleep, healPercent } from './menu/needs-system.js';
import { getNeedValue } from './menu/bottom-menu.js';
import { setCharacterPose } from './menu/character.js';

const ICON_DURATION_MS = 3000; // сколько показывать иконку мурлыканья/шипения
const ICON_OFFSET_Y = 140;     // насколько выше персонажа показывать иконку
const GROOM_DURATION_MS = 4000; // длительность "Вылизаться"

let world = null;
let iconText = null;
let iconTimeoutId = null;
let lastActiveChar = null; // текущий видимый спрайт персонажа (для позиции иконки)
let charSpritesRef = [];   // ссылки на спрайты персонажа (для смены позы Сесть/Поспать)

// Подключить меню действий к спрайтам персонажа.
// charSprites — массив спрайтов (idleChar, walkChar)
export function setupCharacterActions(worldContainer, charSprites) {
  world = worldContainer;
  charSpritesRef = charSprites;

  charSprites.forEach((sprite) => {
    sprite.eventMode = 'static';
    sprite.cursor = 'pointer';

    sprite.on('rightclick', (e) => {
      e.stopPropagation();
      showContextMenu(e, [
        { label: 'Сесть', onClick: actionSit },
        { label: 'Спать', onClick: actionSleep },
        { label: 'Зализать раны', onClick: actionGroom },
        { label: 'Мурлыкнуть', onClick: () => showIcon('❤️') },
        { label: 'Зашипеть', onClick: () => showIcon('😠') },
      ]);
    });
  });
}

// Вызывать каждый кадр (app.ticker), передавая текущего активного персонажа —
// иконка мурлыканья/шипения будет следовать за ним.
export function updateCharacterActions(activeChar) {
  lastActiveChar = activeChar;

  if (iconText && lastActiveChar) {
    iconText.x = lastActiveChar.x;
    iconText.y = lastActiveChar.y - ICON_OFFSET_Y;
  }
}

// Сбросить позу персонажа в нормальную (вызывать при движении из main.js).
// Также прерывает текущее бессрочное/динамическое действие (Сесть/Поспать),
// так как они привязаны к неподвижности персонажа.
export function resetCharacterPose() {
  charSpritesRef.forEach(s => {
    setCharacterPose(s, 'normal');
  });
}

// "Сесть" — бессрочный отдых: персонаж сидит и медленно восстанавливает
// действие (стартует заново, если выбрать другое действие из меню).
function actionSit() {
  runIndefiniteAction({
    label: 'Сесть',
    start: () => {
      charSpritesRef.forEach(s => setCharacterPose(s, 'sit'));
    },
    stop: () => {
      charSpritesRef.forEach(s => setCharacterPose(s, 'normal'));
    },

  });
}

// "Поспать" — динамическое действие: идёт, пока шкала "Сон"/бодрость не
// достигнет 100% от текущего максимума (растёт с уровнями силы — см.
// getMaxSleep() в needs-system.js). Прогресс-бар отображает реальное
// значение шкалы в реальном времени. Прерывается движением или другим
// действием (runDynamicAction/runIndefiniteAction сами вызывают stopActiveAction()).
function actionSleep() {
  runDynamicAction({
    label: 'Поспать',
    start: () => {
      setSleeping(true);
      charSpritesRef.forEach(s => setCharacterPose(s, 'sleep'));
    },
    stop: () => {
      setSleeping(false);
      charSpritesRef.forEach(s => setCharacterPose(s, 'normal'));
    },
    getCurrentValue: () => getNeedValue('e') ?? 0,
    getMaxValue: () => getMaxSleep(),
  });
}

// "Вылизаться" — короткое действие (4 сек), восполняет 2% здоровья по завершении
function actionGroom() {
  runTimedAction({
    id: 'groom',
    label: 'Вылизаться',
    start: () => {},
    stop: () => {},
    onComplete: () => {
      healPercent(2);
    },
  }, GROOM_DURATION_MS);
}

// Показать эмодзи-иконку над персонажем на ICON_DURATION_MS
function showIcon(emoji) {
  removeIcon();

  iconText = new PIXI.Text(emoji, { fontSize: 36 });
  iconText.anchor.set(0.5, 1);

  if (lastActiveChar) {
    iconText.x = lastActiveChar.x;
    iconText.y = lastActiveChar.y - ICON_OFFSET_Y;
  }

  world.addChild(iconText);

  iconTimeoutId = setTimeout(removeIcon, ICON_DURATION_MS);
}

function removeIcon() {
  if (iconTimeoutId) {
    clearTimeout(iconTimeoutId);
    iconTimeoutId = null;
  }
  if (iconText) {
    if (iconText.parent) iconText.parent.removeChild(iconText);
    iconText.destroy();
    iconText = null;
  }
}
