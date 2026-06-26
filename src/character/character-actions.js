import * as PIXI from 'pixi.js';
import { showContextMenu, runDynamicAction, runIndefiniteAction, runTimedAction, stopActiveAction } from '../world/world-objects.js';
import { setSleeping, getMaxNeed, getNeed, healPercent, relieveToilet, markTerritory } from '../systems/player-system.js';
import { setCharacterPose } from './character.js';
import { send } from '../net/network.js';
import { showToast } from '../ui/notify.js';

const ICON_DURATION_MS  = 3000;
const ICON_OFFSET_Y     = 140;
const GROOM_DURATION_MS = 4000;
const GROOM_LIMIT_PER_DAY = 2;

let world          = null;
let iconText       = null;
let iconTimeoutId  = null;
let lastActiveChar = null;
let charSpritesRef = [];

let _groomCount    = 0;
let _groomDayStart = _getDayKey();

function _getDayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function _checkGroomLimit() {
  const today = _getDayKey();
  if (_groomDayStart !== today) {
    _groomDayStart = today;
    _groomCount = 0;
  }
  return _groomCount < GROOM_LIMIT_PER_DAY;
}

export function setupCharacterActions(worldContainer, charSprites) {
  world          = worldContainer;
  charSpritesRef = charSprites;

  charSprites.forEach((sprite) => {
    sprite.eventMode = 'static';
    sprite.cursor    = 'pointer';

    sprite.on('rightclick', (e) => {
      e.stopPropagation();
      showContextMenu(e, [
        { label: 'Сесть',            onClick: _actionSit },
        { label: 'Спать',            onClick: _actionSleep },
        { label: 'Зализать раны',    onClick: _actionGroom },
        { label: 'Справить нужду',   onClick: _actionRelieve },
        { label: 'Поставить метку',  onClick: _actionMark },
        { label: 'Мурлыкнуть',      onClick: () => _showIcon('❤️') },
        { label: 'Зашипеть',        onClick: () => _showIcon('😠') },
      ]);
    });
  });
}

export function updateCharacterActions(activeChar) {
  lastActiveChar = activeChar;
  if (iconText && lastActiveChar) {
    iconText.x = lastActiveChar.x;
    iconText.y = lastActiveChar.y - ICON_OFFSET_Y;
  }
}

export function resetCharacterPose() {
  charSpritesRef.forEach(s => setCharacterPose(s, 'normal'));
  send('pose', { pose: 'normal' });
}

function _actionSit() {
  runIndefiniteAction({
    label: 'Сесть',
    start: () => {
      charSpritesRef.forEach(s => setCharacterPose(s, 'sit'));
      send('pose', { pose: 'sit' });
    },
    stop: () => {
      charSpritesRef.forEach(s => setCharacterPose(s, 'normal'));
      send('pose', { pose: 'normal' });
    },
  });
}

function _actionSleep() {
  runDynamicAction({
    label: 'Поспать',
    start: () => {
      setSleeping(true);
      charSpritesRef.forEach(s => setCharacterPose(s, 'sleep'));
      send('pose', { pose: 'sleep' });
    },
    stop: () => {
      setSleeping(false);
      charSpritesRef.forEach(s => setCharacterPose(s, 'normal'));
      send('pose', { pose: 'normal' });
    },
    getCurrentValue: () => getNeed('e') ?? 0,
    getMaxValue:     () => getMaxNeed('e'),
  });
}

function _actionGroom() {
  if (!_checkGroomLimit()) {
    showToast(`Вылизываться можно не более ${GROOM_LIMIT_PER_DAY} раз в день`);
    return;
  }
  runTimedAction({
    id: 'groom',
    label: 'Вылизаться',
    start:      () => {},
    stop:       () => {},
    onComplete: () => {
      _groomCount++;
      healPercent(2);
      const left = GROOM_LIMIT_PER_DAY - _groomCount;
      showToast(`Здоровье +2%${left > 0 ? ` (осталось раз сегодня: ${left})` : ' (лимит на сегодня исчерпан)'}`);
    },
  }, GROOM_DURATION_MS);
}

function _actionRelieve() {
  const ok = relieveToilet();
  if (!ok) showToast('Нужда и так пуста');
}

function _actionMark() {
  const ok = markTerritory();
  if (!ok) showToast('Нечем ставить метку');
}

function _showIcon(emoji) {
  _removeIcon();
  iconText = new PIXI.Text(emoji, { fontSize: 36 });
  iconText.anchor.set(0.5, 1);
  if (lastActiveChar) {
    iconText.x = lastActiveChar.x;
    iconText.y = lastActiveChar.y - ICON_OFFSET_Y;
  }
  world.addChild(iconText);
  iconTimeoutId = setTimeout(_removeIcon, ICON_DURATION_MS);
}

function _removeIcon() {
  if (iconTimeoutId) { clearTimeout(iconTimeoutId); iconTimeoutId = null; }
  if (iconText) {
    if (iconText.parent) iconText.parent.removeChild(iconText);
    iconText.destroy();
    iconText = null;
  }
}
