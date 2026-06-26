import { currentSettings } from '../config/game-settings.js';
import { getProfile, getNeed, getMaxNeed } from '../systems/player-system.js';
import { getCurrentPeriod, getTimeUntilNextPeriod } from '../systems/day-night-cycle.js';
import {
  getXp, getRank, RANKS, MOVES, ALL_BUFFS,
  getMoveState, isTierUnlocked, startLearningMove,
  getCalculatedDamage, getSelectedMoveId, isMoveLearned,
} from '../systems/skills.js';
import { injectGameStyles } from '../styles.js';

const ICON_SRC = '/assets/knop.png';

const TABS = [
  { id: 'needs',        label: 'Потребности и знания' },
  { id: 'about',        label: 'О котике' },
  { id: 'map',          label: 'Окружающий мир' },
  { id: 'achievements', label: 'Достижения' },
  { id: 'info',         label: 'Личная информация' },
];

const NEED_DEFS = [
  { key: 'h',      label: 'Здоровье' },
  { key: 'food',   label: 'Сытость' },
  { key: 'toilet', label: 'Нужда' },
  { key: 'thirst', label: 'Жажда' },
  { key: 'e',      label: 'Бодрость' },
  { key: 'ss',     label: 'Цап-царап' },
];

const ABOUT_SUBTABS = [
  { id: 'character', label: 'Ваш котик' },
  { id: 'inventory', label: 'Инвентарь' },
  { id: 'tribe',     label: 'Племя' },
];

let activeAboutSubTab = 'character';
let activeNeedsSubTab = 'needs';
const expandedTiers   = { 1: false, 2: false };

let barContainer   = null;
let panelContainer = null;
let activeTabId    = null;
let stylesInjected = false;

export function reloadForActiveCharacter() {
  refreshActivePanel();
}

export function initBottomMenu() {
  if (barContainer) return;
  _injectStyles();

  barContainer = document.createElement('div');
  barContainer.id = 'bottom-menu-bar';

  TABS.forEach(tab => {
    const btn = document.createElement('div');
    btn.className = 'bottom-menu-btn';
    btn.dataset.tabId = tab.id;
    btn.innerHTML = `
      <div class="bottom-menu-icon-wrap">
        <img src="${ICON_SRC}" class="bottom-menu-icon" alt="">
      </div>
      <span class="bottom-menu-label">${tab.label}</span>
    `;
    btn.addEventListener('click', () => _togglePanel(tab.id));
    barContainer.appendChild(btn);
  });

  document.body.appendChild(barContainer);
  document.addEventListener('mousedown', _handleOutsideClick);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panelContainer) _closePanel();
  }, true);
}

export function hideBottomMenu() {
  _closePanel();
  if (barContainer) { barContainer.remove(); barContainer = null; }
  document.removeEventListener('mousedown', _handleOutsideClick);
}

export function refreshActivePanel() {
  if (!panelContainer) return;
  const content = panelContainer.querySelector('.bottom-menu-panel-content');
  if (content) _renderAndBind(activeTabId, content);
}

function _handleOutsideClick(e) {
  if (!panelContainer) return;
  if (panelContainer.contains(e.target)) return;
  if (barContainer && barContainer.contains(e.target)) return;
  _closePanel();
}

function _togglePanel(tabId) {
  if (activeTabId === tabId) { _closePanel(); return; }
  _openPanel(tabId);
}

function _openPanel(tabId) {
  _closePanel();
  activeTabId = tabId;
  const tab = TABS.find(t => t.id === tabId);

  panelContainer = document.createElement('div');
  panelContainer.id = 'bottom-menu-panel';
  panelContainer.innerHTML = `
    <div class="bottom-menu-panel-header">
      <span>${tab.label}</span>
      <span class="bottom-menu-panel-close" title="Закрыть">✕</span>
    </div>
    <div class="bottom-menu-panel-content"></div>
  `;

  document.body.appendChild(panelContainer);

  const content = panelContainer.querySelector('.bottom-menu-panel-content');
  _renderAndBind(tabId, content);
  panelContainer.querySelector('.bottom-menu-panel-close').addEventListener('click', _closePanel);

  barContainer.querySelectorAll('.bottom-menu-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tabId === tabId);
  });
}

function _closePanel() {
  _stopMapTicker();
  if (panelContainer) { panelContainer.remove(); panelContainer = null; }
  activeTabId = null;
  if (barContainer) {
    barContainer.querySelectorAll('.bottom-menu-btn').forEach(btn => btn.classList.remove('active'));
  }
}

function _renderAndBind(tabId, contentEl) {
  contentEl.innerHTML = _renderTab(tabId);
  if (tabId === 'about') _bindAboutHandlers(contentEl);
  if (tabId === 'needs') _bindNeedsHandlers(contentEl);
  if (tabId === 'map')   _startMapTicker();
  else                   _stopMapTicker();
}

function _renderTab(tabId) {
  if (tabId === 'needs') return _renderNeedsTab();
  if (tabId === 'about') return _renderAboutTab();
  if (tabId === 'map')   return _renderMapTab();
  return `<div class="bottom-menu-empty">Раздел в разработке...</div>`;
}

function _renderNeedsTab() {
  const sub = activeNeedsSubTab === 'skills' ? 'skills' : 'needs';
  return `
    <div class="ns-subtabs">
      <div class="ns-subtab ${sub === 'needs'  ? 'active' : ''}" data-ns="needs">Потребности</div>
      <div class="ns-subtab ${sub === 'skills' ? 'active' : ''}" data-ns="skills">Знания</div>
    </div>
    <div class="ns-subcontent">
      ${sub === 'needs' ? _renderNeeds() : _renderSkills()}
    </div>
  `;
}

function _renderNeeds() {
  return `
    <div class="needs-list">
      ${NEED_DEFS.map(n => {
        const value = getNeed(n.key) ?? 0;
        const max   = getMaxNeed(n.key);
        const pct   = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
        return `
          <div class="need-row">
            <div class="need-label">${n.label}</div>
            <div class="need-bar-line">
              <div class="need-bar-track">
                <div class="need-bar-fill" style="width:${pct}%; background:${_barColor(n.key, pct)};"></div>
                <span class="need-bar-text">${Math.round(value)} / ${Math.round(max)}</span>
              </div>
              <span class="need-pct">${pct}%</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function _renderSkills() {
  const rank  = getRank();
  const xp    = getXp();
  const isMax = rank.lvl === RANKS.length;
  const pct   = isMax ? 100 : Math.min(100, ((xp - rank.min) / (rank.max - rank.min)) * 100);
  const xpLabel = isMax ? `${xp} xp (макс.)` : `${xp} / ${rank.max} xp`;

  return `
    <div class="combat-skill">
      <div class="combat-skill-title">Боевые умения</div>
      <div class="combat-skill-rank">Ур. ${rank.lvl} «${rank.name}»</div>
      <div class="xp-bar-track" title="Сила удара: x${rank.dam.toFixed(1)} · Бонус: ${rank.bonus}">
        <div class="xp-bar-fill" style="width:${pct}%;"></div>
        <span class="xp-bar-label">${xpLabel}</span>
      </div>
    </div>
    <div class="moves-block">
      <div class="moves-block-title">Боевые приёмы</div>
      ${_renderMoveAccordion(1, 'Уровень Оруженосца')}
      ${_renderMoveAccordion(2, 'Уровень Воителя')}
      ${_renderBuffsAccordion()}
    </div>
  `;
}

function _renderMoveTier(tier) {
  const unlocked = isTierUnlocked(tier);
  const lockNote = unlocked ? '' : `<div class="moves-lock-note">Достигни звания ${tier === 1 ? 'Оруженосец' : 'Воитель'}, чтобы изучать эти приёмы</div>`;

  const cards = MOVES.filter(m => m.tier === tier).map(m => {
    const state       = getMoveState(m.id);
    const isDone      = state.status === 'done';
    const isInProgress = state.status === 'inprogress';
    const isSelected  = getSelectedMoveId() === m.id;
    const otherActive = getSelectedMoveId() && getSelectedMoveId() !== m.id;
    const clickable   = unlocked && !isDone && !isInProgress && !otherActive;

    let cls = 'move-card locked';
    if (unlocked) {
      if (isDone)        cls = 'move-card done';
      else if (isInProgress) cls = 'move-card in-progress';
      else if (otherActive)  cls = 'move-card disabled-other';
      else               cls = 'move-card';
    }

    let statusLine = 'Недоступен';
    let progressBar = '';
    if (unlocked) {
      if (isDone) {
        statusLine = 'Выучено!';
      } else if (isInProgress) {
        const total = m.tasks.reduce((a, t) => a + t.need, 0);
        const got   = m.tasks.reduce((a, t) => a + Math.min(t.need, state.prog[t.key] ?? 0), 0);
        const p     = Math.round((got / total) * 100);
        statusLine  = `Обучение: ${p}%` + (isSelected ? ' · Выбран для изучения' : '');
        progressBar = `<div class="move-progress-track"><div class="move-progress-fill" style="width:${p}%;"></div></div>`;
      } else if (otherActive) {
        statusLine = 'Сначала заверши текущий изучаемый приём';
      } else {
        statusLine = 'Нажми, чтобы начать обучение';
      }
    }

    const tasksHtml = m.tasks.map(t => {
      const got = Math.min(t.need, state.prog?.[t.key] ?? 0);
      return `<div class="move-task-line">${t.label} <span class="move-task-desc">(${t.desc})</span> — ${got} / ${t.need}</div>`;
    }).join('');

    const selNote = isSelected && !isDone ? '<div class="move-selected-note">Этот приём выбран для изучения</div>' : '';

    return `
      <div class="${cls}" data-move-id="${m.id}" ${clickable ? 'data-clickable="1"' : ''}>
        <div class="move-name">${m.name}</div>
        <div class="move-desc">${m.eff}</div>
        ${(isInProgress || isDone) ? `<div class="move-tasks">${tasksHtml}</div>` : ''}
        ${selNote}
        ${progressBar}
        <div class="move-status">${statusLine}</div>
        <div class="move-reward">Награда: +${m.rewardXp} xp · ${m.rewardText}</div>
      </div>
    `;
  }).join('');

  return `${lockNote}<div class="moves-grid">${cards}</div>`;
}

function _renderMoveAccordion(tier, label) {
  const open = expandedTiers[tier];
  return `
    <div class="moves-acc">
      <div class="moves-acc-header ${open ? 'open' : ''}" data-tier="${tier}">
        <span class="moves-acc-arrow">${open ? '▾' : '▸'}</span>
        <span>${label}</span>
      </div>
      <div class="moves-acc-body" ${open ? '' : 'hidden'}>
        ${open ? _renderMoveTier(tier) : ''}
      </div>
    </div>
  `;
}

function _renderBuffsAccordion() {
  const open = expandedTiers['buffs'];
  const body = ALL_BUFFS.map(b => {
    const learned = b.moveId ? isMoveLearned(b.moveId) : false;
    return `
      <div class="${learned ? 'buff-chip active' : 'buff-chip dimmed'}">
        <span class="buff-icon">${b.icon}</span>
        <span class="buff-name">${b.name}</span>
        ${learned ? '' : '<span class="buff-lock">🔒</span>'}
        <span class="buff-hint">?</span>
        <div class="buff-tooltip">${b.tooltip}${learned ? '' : '<br><span style=\'color:#c9bda0;font-size:10px;\'>Изучи приём, чтобы получить этот бафф</span>'}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="moves-acc">
      <div class="moves-acc-header ${open ? 'open' : ''}" data-tier="buffs">
        <span class="moves-acc-arrow">${open ? '▾' : '▸'}</span>
        <span>Все баффы</span>
      </div>
      <div class="moves-acc-body" ${open ? '' : 'hidden'}>
        <div class="buffs-grid">${body}</div>
      </div>
    </div>
  `;
}

function _renderAboutTab() {
  return `
    <div class="about-subtabs">
      ${ABOUT_SUBTABS.map(t => `
        <div class="about-subtab ${t.id === activeAboutSubTab ? 'active' : ''}" data-subtab="${t.id}">
          ${t.label}
        </div>
      `).join('')}
    </div>
    <div class="about-subtab-content">
      ${activeAboutSubTab === 'character' ? _renderCharacterInfo() : '<div class="bottom-menu-empty">Раздел в разработке...</div>'}
    </div>
  `;
}

function _renderCharacterInfo() {
  const profile  = getProfile();
  const health   = Math.round(getNeed('h') ?? 0);
  const maxHealth = Math.round(getMaxNeed('h'));
  const tribe    = typeof profile.tribe === 'object' ? (profile.tribe?.name ?? '—') : (profile.tribe ?? '—');

  const rows = [
    { label: 'Имя',       value: profile.name },
    { label: 'Племя',     value: tribe },
    { label: 'Должность', value: profile.role },
    { label: 'Возраст',   value: `${profile.ageMoons} ${_moonLabel(profile.ageMoons)}` },
    { label: 'Здоровье',  value: `${health} / ${maxHealth}` },
    { label: 'Урон',      value: _formatDamage() },
    { label: 'Родители',  value: profile.parents ?? '—' },
    { label: 'Пара',      value: profile.mate ?? '—' },
    { label: 'Котята',    value: profile.kittens ?? '—' },
  ];

  return `
    <div class="character-info-list">
      ${rows.map(r => `
        <div class="character-info-row">
          <span class="character-info-label">${r.label}</span>
          <span class="character-info-value">${r.value}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function _renderMapTab() {
  const period    = getCurrentPeriod();
  const remaining = _formatDuration(getTimeUntilNextPeriod());
  return `
    <div class="map-time-info">
      <span class="map-time-current">${period.label}</span>
      <span class="map-time-next">До смены: ${remaining}</span>
    </div>
    <div class="bottom-menu-empty">Карта в разработке...</div>
  `;
}

function _bindAboutHandlers(contentEl) {
  contentEl.querySelectorAll('.about-subtab').forEach(el => {
    el.addEventListener('click', () => {
      activeAboutSubTab = el.dataset.subtab;
      _renderAndBind('about', contentEl);
    });
  });
}

function _bindNeedsHandlers(contentEl) {
  const tabRow = contentEl.querySelector('.ns-subtabs');
  if (tabRow) {
    tabRow.addEventListener('click', (e) => {
      const tab = e.target.closest('.ns-subtab');
      if (!tab || activeNeedsSubTab === tab.dataset.ns) return;
      activeNeedsSubTab = tab.dataset.ns;
      _renderAndBind('needs', contentEl);
    });
  }

  contentEl.querySelectorAll('.moves-acc-header').forEach(el => {
    el.addEventListener('click', () => {
      const tier = el.dataset.tier === 'buffs' ? 'buffs' : Number(el.dataset.tier);
      expandedTiers[tier] = !expandedTiers[tier];
      _renderAndBind('needs', contentEl);
    });
  });

  contentEl.querySelectorAll('.move-card[data-clickable="1"]').forEach(el => {
    el.addEventListener('click', () => {
      if (startLearningMove(el.dataset.moveId)) _renderAndBind('needs', contentEl);
    });
  });
}

function _barColor(key, pct) {
  if (key === 'toilet') {
    if (pct > 60) return '#952424';
    if (pct > 30) return '#cf9236';
    return '#63a91d';
  }
  if (pct > 60) return '#63a91d';
  if (pct > 30) return '#cf9236';
  return '#952424';
}

function _moonLabel(n) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'лун';
  if (mod10 === 1) return 'луна';
  if (mod10 >= 2 && mod10 <= 4) return 'луны';
  return 'лун';
}

function _formatDamage() {
  const { min, max } = getCalculatedDamage();
  return min === max ? `${min}` : `${min} – ${max}`;
}

function _formatDuration(ms) {
  const total   = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

let mapTickIntervalId = null;

function _startMapTicker() {
  if (mapTickIntervalId) return;
  mapTickIntervalId = setInterval(() => refreshActivePanel(), 1000);
}

function _stopMapTicker() {
  if (mapTickIntervalId) { clearInterval(mapTickIntervalId); mapTickIntervalId = null; }
}

function _injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  injectGameStyles();
}
