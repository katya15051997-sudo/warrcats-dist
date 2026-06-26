import * as PIXI from 'pixi.js';
import { send, getMyId } from '../net/network.js';
import { addXp, applyMoveEffects, getLearnedMoves, progressMoveTasks } from './skills.js';
import { gainEnergy } from './player-system.js';
import { showToast } from '../ui/notify.js';

let _sparring = null;
let _pendingInvite = null;

const BAR_WIDTH       = 120;
const BAR_HEIGHT      = 8;
const STAMINA_PER_HIT = 10;

let _world        = null;
let _app          = null;
let _myCharSprite = null;

export function initSparring(world, app, myCharSprite) {
  _world        = world;
  _app          = app;
  _myCharSprite = myCharSprite;
}

export function setSparringCharSprite(sprite) {
  _myCharSprite = sprite;
}

export function sendSparringInvite(targetId, targetName) {
  if (_sparring) { showToast('Тренировка уже идёт!'); return; }
  send('sparring_invite', { targetId });
  showToast(`Приглашение на тренировку отправлено → ${targetName}`);
}

export function handleSparringInvite(fromId, fromName, myCharSprite) {
  if (_sparring) { send('sparring_reject', { fromId }); return; }

  _clearInviteLabel();

  const sprite = myCharSprite ?? _myCharSprite;
  if (!sprite || !_world) return;

  const label = new PIXI.Text(
    `${fromName} предлагает тренировку.\nГотовы? Y/N`,
    { fontSize: 14, fill: 0xffee88, fontFamily: 'Arial', stroke: 0x000000, strokeThickness: 3, align: 'center' }
  );
  label.anchor.set(0.5, 1);
  label.x = sprite.x;
  label.y = sprite.y - 160;
  _world.addChild(label);

  const yBtn = new PIXI.Text('Y', { fontSize: 18, fill: 0x88ff88, fontFamily: 'Arial', stroke: 0x000000, strokeThickness: 3 });
  yBtn.anchor.set(0.5, 1);
  yBtn.x = sprite.x - 20;
  yBtn.y = sprite.y - 130;
  yBtn.eventMode = 'static';
  yBtn.cursor = 'pointer';
  yBtn.on('pointerdown', () => _acceptInvite(fromId));
  _world.addChild(yBtn);

  const nBtn = new PIXI.Text('N', { fontSize: 18, fill: 0xff8888, fontFamily: 'Arial', stroke: 0x000000, strokeThickness: 3 });
  nBtn.anchor.set(0.5, 1);
  nBtn.x = sprite.x + 20;
  nBtn.y = sprite.y - 130;
  nBtn.eventMode = 'static';
  nBtn.cursor = 'pointer';
  nBtn.on('pointerdown', () => _declineInvite(fromId));
  _world.addChild(nBtn);

  const keyHandler = (e) => {
    if (e.key === 'y' || e.key === 'Y') _acceptInvite(fromId);
    if (e.key === 'n' || e.key === 'N') _declineInvite(fromId);
  };
  window.addEventListener('keydown', keyHandler);

  const timeout = setTimeout(() => _clearInviteLabel(), 30000);
  _pendingInvite = { fromId, fromName, label, yBtn, nBtn, keyHandler, timeout };

  if (_app) {
    const ticker = () => {
      const sp = _myCharSprite;
      if (!sp || !_pendingInvite) { _app.ticker.remove(ticker); return; }
      label.x = sp.x; label.y = sp.y - 160;
      yBtn.x  = sp.x - 20; yBtn.y  = sp.y - 130;
      nBtn.x  = sp.x + 20; nBtn.y  = sp.y - 130;
    };
    _app.ticker.add(ticker);
    _pendingInvite._ticker = ticker;
  }
}

function _acceptInvite(fromId) {
  _clearInviteLabel();
  send('sparring_accept', { fromId });
}

function _declineInvite(fromId) {
  _clearInviteLabel();
  send('sparring_reject', { fromId });
  showToast('Тренировка отклонена.');
}

function _clearInviteLabel() {
  if (!_pendingInvite) return;
  const { label, yBtn, nBtn, keyHandler, timeout, _ticker } = _pendingInvite;
  if (label.parent) label.parent.removeChild(label);
  if (yBtn.parent)  yBtn.parent.removeChild(yBtn);
  if (nBtn.parent)  nBtn.parent.removeChild(nBtn);
  label.destroy(); yBtn.destroy(); nBtn.destroy();
  window.removeEventListener('keydown', keyHandler);
  clearTimeout(timeout);
  if (_ticker && _app) _app.ticker.remove(_ticker);
  _pendingInvite = null;
}

export function startSparring(opponentId, opponentName, opponentSprite) {
  if (_sparring || !_world || !_app) return;

  showToast('Тренировка начинается! Сбейте выносливость напарника!');

  const headerText = new PIXI.Text(
    '⚔ Сбейте выносливость напарника, чтобы победить! ⚔',
    { fontSize: 16, fill: 0xffffff, fontFamily: 'Arial', stroke: 0x000000, strokeThickness: 4, align: 'center' }
  );
  headerText.anchor.set(0.5, 0);
  _positionHeader(headerText);
  _world.addChild(headerText);

  const myBar       = _makeBar(0x9966ff);
  const opponentBar = _makeBar(0xaa44ff);
  _world.addChild(myBar);
  _world.addChild(opponentBar);

  const myLabel       = _makeBarLabel('Ты');
  const opponentLabel = _makeBarLabel(opponentName);
  _world.addChild(myLabel);
  _world.addChild(opponentLabel);

  _sparring = {
    myStamina: 100, opponentStamina: 100,
    opponentId, opponentName,
    myBar, opponentBar, myLabel, opponentLabel, headerText,
    opponentSprite,
    stunned: false, stunTimeout: null,
  };

  const ticker = () => _updateBars();
  _app.ticker.add(ticker);
  _sparring._ticker = ticker;
}

function _positionHeader(text) {
  if (_myCharSprite) {
    text.x = _myCharSprite.x;
    text.y = _myCharSprite.y - 350;
  }
}

function _makeBar(color) {
  const g = new PIXI.Graphics();
  g.beginFill(color);
  g.drawRect(0, 0, BAR_WIDTH, BAR_HEIGHT);
  g.endFill();
  return g;
}

function _makeBarLabel(name) {
  return new PIXI.Text(name + ' 100%', {
    fontSize: 11, fill: 0xffffff, fontFamily: 'Arial', stroke: 0x000000, strokeThickness: 2,
  });
}

function _updateBars() {
  if (!_sparring) return;
  const sp = _myCharSprite;
  const op = _sparring.opponentSprite;

  if (sp) {
    const w = (BAR_WIDTH * _sparring.myStamina) / 100;
    _sparring.myBar.clear();
    _sparring.myBar.beginFill(0x9966ff);
    _sparring.myBar.drawRect(0, 0, Math.max(0, w), BAR_HEIGHT);
    _sparring.myBar.endFill();
    _sparring.myBar.x       = sp.x - BAR_WIDTH / 2;
    _sparring.myBar.y       = sp.y + 20;
    _sparring.myLabel.x     = sp.x - BAR_WIDTH / 2;
    _sparring.myLabel.y     = sp.y + 30;
    _sparring.myLabel.text  = `Ты ${Math.round(_sparring.myStamina)}%`;
    _sparring.headerText.x  = sp.x;
    _sparring.headerText.y  = sp.y - 350;
  }

  if (op) {
    const w = (BAR_WIDTH * _sparring.opponentStamina) / 100;
    _sparring.opponentBar.clear();
    _sparring.opponentBar.beginFill(0xaa44ff);
    _sparring.opponentBar.drawRect(0, 0, Math.max(0, w), BAR_HEIGHT);
    _sparring.opponentBar.endFill();
    _sparring.opponentBar.x      = op.x - BAR_WIDTH / 2;
    _sparring.opponentBar.y      = op.y + 20;
    _sparring.opponentLabel.x    = op.x - BAR_WIDTH / 2;
    _sparring.opponentLabel.y    = op.y + 30;
    _sparring.opponentLabel.text = `${_sparring.opponentName} ${Math.round(_sparring.opponentStamina)}%`;
  }
}

export function isSparringActive() {
  return !!_sparring;
}

export function sparringStrike() {
  if (!_sparring) return;
  if (_sparring.stunned) { showToast('Оглушён!'); return; }

  const dodgeMoves = getLearnedMoves().filter(m => m.effect?.type === 'dodgeChance');
  const { dodged } = applyMoveEffects(10, dodgeMoves);

  if (dodged) { showToast('Противник уклонился!'); return; }

  send('sparring_hit', { damage: STAMINA_PER_HIT });
}

export function handleSparringHit(damage) {
  if (!_sparring) return;
  _sparring.myStamina = Math.max(0, _sparring.myStamina - damage);
  if (_sparring.myStamina <= 0) _endSparring(false);
}

export function handleSparringOpponentHit(damage) {
  if (!_sparring) return;
  _sparring.opponentStamina = Math.max(0, _sparring.opponentStamina - damage);
  if (_sparring.opponentStamina <= 0) _endSparring(true);
}

function _endSparring(iWon) {
  if (!_sparring) return;

  const xpGain = iWon ? 5 : 2.5;
  addXp(xpGain);
  gainEnergy(-5);
  progressMoveTasks('sparring');

  showToast(iWon
    ? `🏆 Победа! +${xpGain} xp. −5 энергии.`
    : `😿 Поражение. +${xpGain} xp. −5 энергии.`
  );

  _cleanupSparring();
}

export function handleSparringEnd() {
  _cleanupSparring();
}

function _cleanupSparring() {
  if (!_sparring) return;
  const { myBar, opponentBar, myLabel, opponentLabel, headerText, _ticker, stunTimeout } = _sparring;
  [myBar, opponentBar, myLabel, opponentLabel, headerText].forEach(obj => {
    if (obj?.parent) obj.parent.removeChild(obj);
    obj?.destroy?.();
  });
  if (_ticker && _app) _app.ticker.remove(_ticker);
  if (stunTimeout) clearTimeout(stunTimeout);
  _sparring = null;
}
