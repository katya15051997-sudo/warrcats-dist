import { currentSettings } from '../config/game-settings.js';
import { getProfile, getMaxHealth, getHealth, setHealth } from '../character/character-profile.js';
import { getCurrentPeriod, getTimeUntilNextPeriod } from '../systems/day-night-cycle.js';
import { getXp, getRank, RANKS, MOVES, getMoveState, isTierUnlocked, startLearningMove, getCalculatedDamage, getSelectedMoveId } from '../systems/xp-system.js';
import { getMaxSleep } from '../systems/needs-system.js';
import { getCharacterStorageKey } from '../character/character-save.js';
import { injectGameStyles } from '../styles.js';

const STORAGE_KEY_BASE = 'warrcats_needs_skills';

function getStorageKey() {
  return getCharacterStorageKey(STORAGE_KEY_BASE);
}

const ICON_SRC = '/assets/knop.png';

const TABS = [
  { id: 'needs',   label: 'Потребности и знания' },
  { id: 'about',   label: 'О котике' },
  { id: 'map',     label: 'Окружающий мир' },
  { id: 'achievements', label: 'Достижения' },
  { id: 'info',    label: 'Личная информация' },
];

const needs = [
  { key: 'h', icon: '', label: 'Здоровье',         value: 100 },
  { key: 'food', icon: '', label: 'Сытость',          value: 80  },
  { key: 'toilet', icon: '', label: 'Нужда',            value: 0   },
  { key: 'thirst', icon: '', label: 'Жажда',            value: 70  },
  { key: 'e', icon: '', label: 'Бодрость',         value: 100 },
  { key: 'ss', icon: '', label: 'Цап-царап',   value: 50  },
];

const DEFAULT_NEED_VALUES = needs.reduce((acc, n) => { acc[n.key] = n.value; return acc; }, {});

const skills = [
  { key: 'smell', icon: '', label: 'Нюх', value: 0, max: 100 },
  { key: 'healing',  icon: '✨', label: 'Целительство',  value: 0, max: 100 },
];

const ABOUT_SUBTABS = [
  { id: 'character', label: 'Ваш котик' },
  { id: 'inventory', label: 'Инвентарь' },
  { id: 'tribe',     label: 'Племя' },
];

let activeAboutSubTab = 'character';

let activeNeedsSubTab = 'needs';

const expandedTiers = { 1: false, 2: false };

let barContainer = null;
let panelContainer = null;
let activeTabId = null;
let stylesInjected = false;

export function initBottomMenu() {
  if (barContainer) return;

  loadNeedsAndSkills();

  
  
  const healthNeed = needs.find(n => n.key === 'h');
  if (healthNeed) {
    healthNeed.value = getHealth();
  }

  injectStyles();

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
    btn.addEventListener('click', () => togglePanel(tab.id));
    barContainer.appendChild(btn);
  });

  document.body.appendChild(barContainer);

  
  document.addEventListener('mousedown', handleOutsideClick);
  
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panelContainer) {
      closePanel();
    }
  }, true); 
}

export function hideBottomMenu() {
  closePanel();
  if (barContainer) {
    barContainer.remove();
    barContainer = null;
  }
  document.removeEventListener('mousedown', handleOutsideClick);
}

function getNeedMax(need) {
  if (need.key === 'h') {
    return getMaxHealth();
  }
  if (need.key === 'e') {
    return getMaxSleep();
  }
  return 100;
}

export function setNeedValue(key, value) {
  const need = needs.find(n => n.key === key);
  if (!need) return;
  const max = getNeedMax(need);
  need.value = Math.max(0, Math.min(max, value));

  
  if (key === 'h') {
    setHealth(need.value);
  }

  saveNeedsAndSkills();
  refreshActivePanel();
}

export function getNeedValue(key) {
  const need = needs.find(n => n.key === key);
  return need ? need.value : null;
}

function getSkillMax(skill) {
  if (skill.key === 'strength') {
    return currentSettings?.maxStrength ?? 50;
  }
  return skill.max ?? 100;
}

function loadNeedsAndSkills() {
  try {
    const saved = localStorage.getItem(getStorageKey());
    if (!saved) return;
    const parsed = JSON.parse(saved);
    if (parsed?.needs && Array.isArray(parsed.needs)) {
      parsed.needs.forEach(savedNeed => {
        const need = needs.find(n => n.key === savedNeed.key);
        if (need) {
          need.value = Math.max(0, Math.min(getNeedMax(need), savedNeed.value));
        }
      });
    }
    if (parsed?.skills && Array.isArray(parsed.skills)) {
      parsed.skills.forEach(savedSkill => {
        const skill = skills.find(s => s.key === savedSkill.key);
        if (skill) {
          skill.value = Math.max(0, Math.min(getSkillMax(skill), savedSkill.value));
        }
      });
    }
  } catch (e) {
    console.error('Ошибка загрузки потребностей и знаний:', e);
  }
}

function saveNeedsAndSkills() {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify({ needs, skills }));
  } catch (e) {
    console.error('Ошибка сохранения потребностей и знаний:', e);
  }
}

export function reloadForActiveCharacter() {
  needs.forEach(n => { n.value = DEFAULT_NEED_VALUES[n.key]; });
  skills.forEach(s => { s.value = 0; });

  loadNeedsAndSkills();

  const healthNeed = needs.find(n => n.key === 'h');
  if (healthNeed) {
    healthNeed.value = getHealth();
  }

  refreshActivePanel();
}

export function setSkillValue(key, value) {
  const skill = skills.find(s => s.key === key);
  if (!skill) return;
  const max = getSkillMax(skill);
  skill.value = Math.max(0, Math.min(max, value));

  saveNeedsAndSkills();
  refreshActivePanel();
}

export function addSkillValue(key, delta) {
  const skill = skills.find(s => s.key === key);
  if (!skill) return;
  setSkillValue(key, skill.value + delta);
}

export function getSkillValue(key) {
  const skill = skills.find(s => s.key === key);
  return skill ? skill.value : null;
}

export function refreshActivePanel() {
  if (!panelContainer) return;
  const content = panelContainer.querySelector('.bottom-menu-panel-content');
  if (content) renderAndBindTabContent(activeTabId, content);
}

function handleOutsideClick(e) {
  if (!panelContainer) return;
  if (panelContainer.contains(e.target)) return;
  if (barContainer && barContainer.contains(e.target)) return;
  closePanel();
}

function togglePanel(tabId) {
  if (activeTabId === tabId) {
    closePanel();
    return;
  }
  openPanel(tabId);
}

function openPanel(tabId) {
  closePanel();
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
  renderAndBindTabContent(tabId, content);

  panelContainer.querySelector('.bottom-menu-panel-close')
    .addEventListener('click', closePanel);

  
  barContainer.querySelectorAll('.bottom-menu-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tabId === tabId);
  });
}

function closePanel() {
  stopMapTicker();

  if (panelContainer) {
    panelContainer.remove();
    panelContainer = null;
  }
  activeTabId = null;
  if (barContainer) {
    barContainer.querySelectorAll('.bottom-menu-btn').forEach(btn => {
      btn.classList.remove('active');
    });
  }
}

function renderTabContent(tabId) {
  if (tabId === 'needs') {
    return renderNeedsAndSkills();
  }
  if (tabId === 'about') {
    return renderAboutTab();
  }
  if (tabId === 'map') {
    return renderMapTab();
  }
  
  return `<div class="bottom-menu-empty">Раздел в разработке...</div>`;
}

function renderAndBindTabContent(tabId, contentEl) {
  contentEl.innerHTML = renderTabContent(tabId);

  if (tabId === 'about') {
    bindAboutSubTabHandlers(contentEl);
  }

  if (tabId === 'needs') {
    bindNeedsTabHandlers(contentEl);
  }

  if (tabId === 'map') {
    startMapTicker();
  } else {
    stopMapTicker();
  }
}

function renderMoveTier(tier) {
  const unlocked = isTierUnlocked(tier);
  const lockNote = unlocked ? '' : `<div class="moves-lock-note">Достигни звания ${tier === 1 ? 'Оруженосец' : 'Воитель'}, чтобы изучать эти приёмы</div>`;

  const cards = MOVES.filter(m => m.tier === tier).map(m => {
    const state = getMoveState(m.id);
    const isDone = state.status === 'done';
    const isInProgress = state.status === 'inprogress';
    const isSelected = getSelectedMoveId() === m.id;

    const otherMoveActivePre = getSelectedMoveId() && getSelectedMoveId() !== m.id;
    const cls = isDone ? 'move-card done' : isInProgress ? 'move-card in-progress' : unlocked ? (otherMoveActivePre ? 'move-card disabled-other' : 'move-card') : 'move-card locked';

    let statusLine = 'Недоступен';
    let progressBar = '';
    if (unlocked) {
      if (isDone) {
        statusLine = 'Выучено!';
      } else if (isInProgress) {
        const total = m.tasks.reduce((a, t) => a + t.need, 0);
        const got = m.tasks.reduce((a, t) => a + Math.min(t.need, state.prog[t.key] ?? 0), 0);
        const pct = Math.round((got / total) * 100);
        statusLine = `Обучение: ${pct}%` + (isSelected ? ' · Выбран для изучения' : '');
        progressBar = `<div class="move-progress-track"><div class="move-progress-fill" style="width:${pct}%;"></div></div>`;
      } else {
        statusLine = 'Нажми, чтобы начать обучение';
      }
    }

    const tasksHtml = m.tasks.map(t => {
      const got = Math.min(t.need, state.prog?.[t.key] ?? 0);
      return `<div class="move-task-line">${t.label} <span class="move-task-desc">(${t.desc})</span> — ${got} / ${t.need}</div>`;
    }).join('');

    const otherMoveActive = getSelectedMoveId() && getSelectedMoveId() !== m.id;
    const clickable = unlocked && !isDone && !isInProgress && !otherMoveActive;
    const selectionNote = isSelected && !isDone ? '<div class="move-selected-note">Этот приём выбран для изучения</div>' : '';
    if (unlocked && !isDone && !isInProgress && otherMoveActive) {
      statusLine = 'Сначала заверши текущий изучаемый приём';
    }

    return `
      <div class="${cls}" data-move-id="${m.id}" ${clickable ? 'data-clickable="1"' : ''}>
        <div class="move-name">${m.name}</div>
        <div class="move-desc">${m.eff}</div>
        ${(isInProgress || isDone) ? `<div class="move-tasks">${tasksHtml}</div>` : ''}
        ${selectionNote}
        ${progressBar}
        <div class="move-status">${statusLine}</div>
        <div class="move-reward">Награда: +${m.rewardXp} xp · ${m.rewardText}</div>
      </div>
    `;
  }).join('');

  return `${lockNote}<div class="moves-grid">${cards}</div>`;
}

function renderMoveAccordion(tier, label) {
  const open = expandedTiers[tier];
  return `
    <div class="moves-acc">
      <div class="moves-acc-header ${open ? 'open' : ''}" data-tier="${tier}">
        <span class="moves-acc-arrow">${open ? '▾' : '▸'}</span>
        <span>${label}</span>
      </div>
      <div class="moves-acc-body" ${open ? '' : 'hidden'}>
        ${open ? renderMoveTier(tier) : ''}
      </div>
    </div>
  `;
}

function bindNeedsTabHandlers(contentEl) {
  contentEl.querySelectorAll('.ns-subtab').forEach(el => {
    el.addEventListener('click', () => {
      activeNeedsSubTab = el.dataset.ns;
      renderAndBindTabContent('needs', contentEl);
    });
  });

  contentEl.querySelectorAll('.moves-acc-header').forEach(el => {
    el.addEventListener('click', () => {
      const tier = el.dataset.tier === 'buffs' ? 'buffs' : Number(el.dataset.tier);
      expandedTiers[tier] = !expandedTiers[tier];
      renderAndBindTabContent('needs', contentEl);
    });
  });

  contentEl.querySelectorAll('.move-card[data-clickable="1"]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.moveId;
      if (startLearningMove(id)) {
        renderAndBindTabContent('needs', contentEl);
      }
    });
  });
}

function renderMapTab() {
  const period = getCurrentPeriod();
  const remainingLabel = formatDuration(getTimeUntilNextPeriod());

  return `
    <div class="map-time-info">
      <span class="map-time-current">${period.label}</span>
      <span class="map-time-next">До смены: ${remainingLabel}</span>
    </div>
    <div class="bottom-menu-empty">Карта в разработке...</div>
  `;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
} 

let mapTickIntervalId = null;

function startMapTicker() {
  if (mapTickIntervalId) return;
  mapTickIntervalId = setInterval(() => {
    refreshActivePanel();
  }, 1000);
}

function stopMapTicker() {
  if (mapTickIntervalId) {
    clearInterval(mapTickIntervalId);
    mapTickIntervalId = null;
  }
}

function bindAboutSubTabHandlers(contentEl) {
  contentEl.querySelectorAll('.about-subtab').forEach(el => {
    el.addEventListener('click', () => {
      activeAboutSubTab = el.dataset.subtab;
      renderAndBindTabContent('about', contentEl);
    });
  });
}

function renderAboutTab() {
  return `
    <div class="about-subtabs">
      ${ABOUT_SUBTABS.map(t => `
        <div class="about-subtab ${t.id === activeAboutSubTab ? 'active' : ''}" data-subtab="${t.id}">
          ${t.label}
        </div>
      `).join('')}
    </div>
    <div class="about-subtab-content">
      ${renderAboutSubTabContent(activeAboutSubTab)}
    </div>
  `;
}

function renderAboutSubTabContent(subTabId) {
  if (subTabId === 'character') {
    return renderCharacterInfo();
  }
  
  return `<div class="bottom-menu-empty">Раздел в разработке...</div>`;
}

function renderCharacterInfo() {
  const profile = getProfile();

  const healthNeed = needs.find(n => n.key === 'h');
  const healthValue = healthNeed ? Math.round(healthNeed.value) : 0;
  const healthMax = healthNeed ? Math.round(getNeedMax(healthNeed)) : 100;

  const rows = [
    { label: 'Имя', value: profile.name },
    { label: 'Племя', value: profile.tribe },
    { label: 'Должность', value: profile.role },
    { label: 'Возраст', value: `${profile.ageMoons} ${moonLabel(profile.ageMoons)}` },
    { label: 'Здоровье', value: `${healthValue} / ${healthMax}` },
    { label: 'Урон', value: formatDamageRange() },
    { label: 'Родители', value: profile.parents },
    { label: 'Пара', value: profile.mate },
    { label: 'Котята', value: profile.kittens },
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

function moonLabel(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'лун';
  if (mod10 === 1) return 'луна';
  if (mod10 >= 2 && mod10 <= 4) return 'луны';
  return 'лун';
}

function formatDamageRange() {
  const { min, max } = getCalculatedDamage();
  return min === max ? `${min}` : `${min} – ${max}`;
}

function renderNeedsAndSkills() {
  return `
    <div class="ns-subtabs">
      <div class="ns-subtab ${activeNeedsSubTab === 'needs' ? 'active' : ''}" data-ns="needs">Потребности</div>
      <div class="ns-subtab ${activeNeedsSubTab === 'skills' ? 'active' : ''}" data-ns="skills">Знания</div>
    </div>
    <div class="ns-subcontent">
      ${activeNeedsSubTab === 'needs' ? renderNeeds() : renderSkillsSubTab()}
    </div>
  `;
}

function renderNeeds() {
  return `
    <div class="needs-list">
      ${needs.map(n => {
        const max = getNeedMax(n);
        const pct = max > 0 ? Math.min(100, Math.round((n.value / max) * 100)) : 0;
        const valueText = `${Math.round(n.value)} / ${Math.round(max)}`;
        return `
          <div class="need-row">
            <div class="need-label">${n.label}</div>
            <div class="need-bar-line">
              <div class="need-bar-track">
                <div class="need-bar-fill" style="width:${pct}%; background:${getBarColor(n, pct)};"></div>
                <span class="need-bar-text">${valueText}</span>
              </div>
              <span class="need-pct">${pct}%</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderSkillsSubTab() {
  const rank = getRank();
  const xp = getXp();
  const isMax = rank.lvl === RANKS.length;
  const pct = isMax ? 100 : Math.min(100, ((xp - rank.min) / (rank.max - rank.min)) * 100);
  const xpLabel = isMax ? `${xp} xp (макс.)` : `${xp} / ${rank.max} xp`;
  const tooltip = `Сила удара: x${rank.dam.toFixed(1)} · Бонус: ${rank.bonus}`;

  const buffsHtml = renderBuffsAccordion(rank);

  return `
    <div class="combat-skill">
      <div class="combat-skill-title">Боевые умения</div>
      <div class="combat-skill-rank">Ур. ${rank.lvl} «${rank.name}»</div>
      <div class="xp-bar-track" title="${tooltip}">
        <div class="xp-bar-fill" style="width:${pct}%;"></div>
        <span class="xp-bar-label">${xpLabel}</span>
      </div>
    </div>

    <div class="moves-block">
      <div class="moves-block-title">Боевые приёмы</div>
      ${renderMoveAccordion(1, 'Уровень Оруженосца')}
      ${renderMoveAccordion(2, 'Уровень Воителя')}
      ${buffsHtml}
    </div>
  `;
}

const ALL_BUFFS = [
  { name: 'Урон x1.5',        icon: '⚔️', moveId: 'm1', tooltip: 'Приём «Удар сзади»: шанс 35% — следующий удар наносит в 1.5 раза больше урона.' },
  { name: 'Кровотечение',      icon: '🩸', moveId: 'm2', tooltip: 'Приём «Прочёс живота»: шанс 5% — противник теряет 8 HP за 2 секунды.' },
  { name: 'Оглушение',         icon: '💫', moveId: 'm3', tooltip: 'Приём «Удар передней лапой»: шанс 2% — противник не может атаковать 3 секунды.' },
  { name: 'Царапина',          icon: '🐾', moveId: 'm4', tooltip: 'Приём «Скользящий удар»: шанс 10% — противник теряет 10 HP за 5 секунд.' },
  { name: 'Иммобилизация',     icon: '🔒', moveId: 'm5', tooltip: 'Приём «Мёртвая хватка»: захват шеи зубами, противник обездвижен на 2 секунды.' },
  { name: 'Прыжок +25%',      icon: '🐆', moveId: 'm6', tooltip: 'Приём «Прыжок с зацепом»: высота прыжка увеличена на 25%, выше шанс запрыгнуть на противника.' },
  { name: 'Дезориентация',     icon: '🌀', moveId: 'm7', tooltip: 'Приём «Встряска»: защита противника снижается на 20% на 3 секунды.' },
  { name: 'Урон x2.2 + стан', icon: '💥', moveId: 'm8', tooltip: 'Приём «Вертикальный бросок»: бросок вверх — урон x2.2 и оглушение противника на 1 секунду.' },
  { name: 'Отброс x1.5',      icon: '🌪️', moveId: 'm9', tooltip: 'Приём «Бросок на плечи»: дальность отбрасывания противника увеличена в 1.5 раза.' },
  { name: 'Контратака 30%',   icon: '🔄', moveId: 'm10', tooltip: 'Приём «Перекатывание»: шанс 30% — после уклонения наносится контратака с уроном x1.2.' },
];

function renderBuffsAccordion(rank) {
  const open = expandedTiers['buffs'];
  const headerCls = open ? 'open' : '';

  
  const body = ALL_BUFFS.map(b => {
    const learned = b.moveId ? isMoveLearned(b.moveId) : false;
    const cls = learned ? 'buff-chip active' : 'buff-chip dimmed';
    const lockHint = learned ? '' : '<span class="buff-lock">🔒</span>';
    return `
      <div class="${cls}">
        <span class="buff-icon">${b.icon}</span>
        <span class="buff-name">${b.name}</span>
        ${lockHint}
        <span class="buff-hint">?</span>
        <div class="buff-tooltip">${b.tooltip}${learned ? '' : '<br><span style=\'color:#c9bda0;font-size:10px;\'>Изучи приём, чтобы получить этот бафф</span>'}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="moves-acc">
      <div class="moves-acc-header ${headerCls}" data-tier="buffs">
        <span class="moves-acc-arrow">${open ? '▾' : '▸'}</span>
        <span>Все баффы</span>
      </div>
      <div class="moves-acc-body" ${open ? '' : 'hidden'}>
        <div class="buffs-grid">${body}</div>
      </div>
    </div>
  `;
}

function getBarColor(need, pct) {
  if (need.key === 'toilet') {
    if (pct > 60) return '#952424';
    if (pct > 30) return '#cf9236';
    return '#63a91d';
  }

  if (pct > 60) return '#63a91d';
  if (pct > 30) return '#cf9236';
  return '#952424';
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  injectGameStyles();
}
