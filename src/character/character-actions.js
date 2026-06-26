import * as PIXI from 'pixi.js';
import { showContextMenu, runDynamicAction, runIndefiniteAction, runTimedAction, stopActiveAction } from '../world/world-objects.js';
import { setSleeping, getMaxNeed, getNeed, healPercent } from '../systems/player-system.js';
import { setCharacterPose } from './character.js';
import { send } from '../net/network.js';

const ICON_DURATION_MS = 3000;
const ICON_OFFSET_Y    = 140;
const GROOM_DURATION_MS = 4000;

let world         = null;
let iconText      = null;
let iconTimeoutId = null;
let lastActiveChar = null;
let charSpritesRef = [];

export function setupCharacterActions(worldContainer, charSprites) {
  world          = worldContainer;
  charSpritesRef = charSprites;

  charSprites.forEach((sprite) => {
    sprite.eventMode = 'static';
    sprite.cursor    = 'pointer';

    sprite.on('rightclick', (e) => {
      e.stopPropagation();
      showContextMenu(e, [
        { label: 'Сесть',         onClick: _actionSit },
        { label: 'Спать',         onClick: _actionSleep },
        { label: 'Зализать раны', onClick: _actionGroom },
        { label: 'Мурлыкнуть',   onClick: () => _showIcon('❤️') },
        { label: 'Зашипеть',     onClick: () => _showIcon('😠') },
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
  runTimedAction({
    id: 'groom',
    label: 'Вылизаться',
    start: () => {},
    stop:  () => {},
    onComplete: () => healPercent(2),
  }, GROOM_DURATION_MS);
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
