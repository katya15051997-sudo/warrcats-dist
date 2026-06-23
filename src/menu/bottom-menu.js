import { currentSettings } from './menu.js';
import { getProfile, getMaxHealth, getHealth, setHealth } from './character-profile.js';
import { getCurrentPeriod, getTimeUntilNextPeriod } from '../day-night-cycle.js';
import { getXp, getRank, RANKS, MOVES, getMoveState, isTierUnlocked, startLearningMove, getCalculatedDamage, getSelectedMoveId } from './xp-system.js';
import { getMaxSleep } from './needs-system.js';
import { getCharacterStorageKey } from './character-save.js';
import { injectGameStyles } from '../styles.js';

const STORAGE_KEY_BASE = 'warrcats_needs_skills';

function getStorageKey() {
  return getCharacterStorageKey(STORAGE_KEY_BASE);
}

const ICON_SRC = '/assets/knop.png';

// Список вкладок (порядок соответствует макету)
const TABS = [
  { id: 'needs',   label: 'Потребности и знания' },
  { id: 'about',   label: 'О котике' },
  { id: 'map',     label: 'Окружающий мир' },
  { id: 'achievements', label: 'Достижения' },
  { id: 'info',    label: 'Личная информация' },
];

// Текущие значения потребностей (0-100%, кроме "Сон" — у него динамический максимум, см. getNeedMax)
// Можно менять извне через setNeedValue()
const needs = [
  { key: 'h', icon: '', label: 'Здоровье',         value: 100 },
  { key: 'food', icon: '', label: 'Сытость',          value: 80  },
  { key: 'toilet', icon: '', label: 'Нужда',            value: 0   },
  { key: 'thirst', icon: '', label: 'Жажда',            value: 70  },
  { key: 'e', icon: '', label: 'Бодрость',         value: 100 },
  { key: 'ss', icon: '', label: 'Цап-царап',   value: 50  },
];

// Значения по умолчанию (для сброса при смене персонажа, до загрузки
// сохранённых данных нового персонажа)
const DEFAULT_NEED_VALUES = needs.reduce((acc, n) => { acc[n.key] = n.value; return acc; }, {});

// Текущие значения умений (Сила заменена системой опыта/званий — см. renderSkills).
const skills = [
  { key: 'smell', icon: '', label: 'Нюх', value: 0, max: 100 },
  { key: 'healing',  icon: '✨', label: 'Целительство',  value: 0, max: 100 },
];

// Подвкладки внутри "О персонаже"
const ABOUT_SUBTABS = [
  { id: 'character', label: 'Ваш котик' },
  { id: 'inventory', label: 'Инвентарь' },
  { id: 'tribe',     label: 'Племя' },
];

let activeAboutSubTab = 'character';

// Подвкладка внутри "Потребности и умения": 'needs' | 'skills'
let activeNeedsSubTab = 'needs';
// Развёрнутость аккордеонов боевых приёмов (по тиру)
const expandedTiers = { 1: false, 2: false };

let barContainer = null;
let panelContainer = null;
let activeTabId = null;
let stylesInjected = false;

// === Публичные функции ===

export function initBottomMenu() {
  if (barContainer) return;

  loadNeedsAndSkills();

  // Здоровье персонажа — берём сохранённое значение из профиля
  // (изначально 30/30, дальше растёт вместе с лунами и пассивным лечением)
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

  // Закрытие панели по клику вне её и вне меню
  document.addEventListener('mousedown', handleOutsideClick);
  
  // Закрытие панели по нажатию ESC
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

// Максимальное значение потребности.
// Для "Здоровья" — текущий "потолок" персонажа (растёт +4% каждые 3 луны,
// для "Сон"/бодрости — динамический потолок, растущий с уровнями силы)
function getNeedMax(need) {
  if (need.key === 'h') {
    return getMaxHealth();
  }
  if (need.key === 'e') {
    return getMaxSleep();
  }
  return 100;
}

// Обновить значение конкретной потребности и перерисовать,если открыта панель "Потребности и умения"
export function setNeedValue(key, value) {
  const need = needs.find(n => n.key === key);
  if (!need) return;
  const max = getNeedMax(need);
  need.value = Math.max(0, Math.min(max, value));

  // Здоровье персистится в профиле персонажа (сохраняется между сессиями)
  if (key === 'h') {
    setHealth(need.value);
  }

  saveNeedsAndSkills();
  refreshActivePanel();
}

// Получить текущее значение потребности (0-100) или null, если не найдена
export function getNeedValue(key) {
  const need = needs.find(n => n.key === key);
  return need ? need.value : null;
}

// Максимальное значение умения.
// Для "Силы" — берётся из настроек сервера (maxStrength).
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

// Перечитать потребности и умения из localStorage для текущего активного
// персонажа. Сбрасывает значения к умолчаниям, затем загружает сохранённые
// (если есть), и синхронизирует "Здоровье" с профилем персонажа.
// Вызывать при смене активного персонажа / перед стартом игры.
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

// Установить значение умения (ограничивается [0, max]) и перерисовать, если открыта панель "Потребности и умения"
export function setSkillValue(key, value) {
  const skill = skills.find(s => s.key === key);
  if (!skill) return;
  const max = getSkillMax(skill);
  skill.value = Math.max(0, Math.min(max, value));

  saveNeedsAndSkills();
  refreshActivePanel();
}

// Прибавить (или вычесть, при отрицательном delta) значение умения
export function addSkillValue(key, delta) {
  const skill = skills.find(s => s.key === key);
  if (!skill) return;
  setSkillValue(key, skill.value + delta);
}

// Получить текущее значение умения или null, если не найдено
export function getSkillValue(key) {
  const skill = skills.find(s => s.key === key);
  return skill ? skill.value : null;
}

// Перерисовать содержимое текущей открытой вкладки панели
export function refreshActivePanel() {
  if (!panelContainer) return;
  const content = panelContainer.querySelector('.bottom-menu-panel-content');
  if (content) renderAndBindTabContent(activeTabId, content);
}

// === Внутренняя логика ===

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

  // Подсветка активной кнопки
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
  // Остальные вкладки пока пусты
  return `<div class="bottom-menu-empty">Раздел в разработке...</div>`;
}

// Отрисовать содержимое вкладки в переданный контейнер и привязать
// обработчики/таймеры (подвкладки "О персонаже", таймер вкладки "Карта")
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

// Рендер карточек приёмов одного тира (1 — Оруженосец, 2 — Воитель).
// Возвращает заметку о блокировке (если тир ещё не открыт) + карточки в столбик.
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

// Аккордеон одного уровня приёмов: заголовок-переключатель + тело (карточки).
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

// Привязать обработчики вкладки "Потребности и умения":
// переключение подвкладок, аккордеоны приёмов и клик по карточке (начать обучение).
function bindNeedsTabHandlers(contentEl) {
  contentEl.querySelectorAll('.ns-subtab').forEach(el => {
    el.addEventListener('click', () => {
      activeNeedsSubTab = el.dataset.ns;
      renderAndBindTabContent('needs', contentEl);
    });
  });

  contentEl.querySelectorAll('.moves-acc-header').forEach(el => {
    el.addEventListener('click', () => {
      const tier = Number(el.dataset.tier);
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

// Вкладка "Карта": текущее время суток и обратный отсчёт до смены.
// Сама карта пока не реализована.
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

// Форматирует миллисекунды как "MM:SS"
function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
} 

// Таймер обратного отсчёта для вкладки "Карта" (обновляет панель раз в секунду)
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

// Привязать клики по подвкладкам "О персонаже" / "Инвентарь" / "Племя"
function bindAboutSubTabHandlers(contentEl) {
  contentEl.querySelectorAll('.about-subtab').forEach(el => {
    el.addEventListener('click', () => {
      activeAboutSubTab = el.dataset.subtab;
      renderAndBindTabContent('about', contentEl);
    });
  });
}

// Рендер вкладки "О персонаже": переключатель подвкладок + содержимое
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
  // "Инвентарь" и "Племя" пока пустые
  return `<div class="bottom-menu-empty">Раздел в разработке...</div>`;
}

// Подвкладка "О персонаже": Имя, Племя, Должность, Возраст, Здоровье,
// Родители, Пара, Котята
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

// Простая русская плюрализация для "луна / луны / лун"
function moonLabel(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'лун';
  if (mod10 === 1) return 'луна';
  if (mod10 >= 2 && mod10 <= 4) return 'луны';
  return 'лун';
}

// Расчётный диапазон урона персонажа (с учётом множителя звания),
// для строки "Урон" во вкладке "О персонаже"
function formatDamageRange() {
  const { min, max } = getCalculatedDamage();
  return min === max ? `${min}` : `${min} – ${max}`;
}

// Вкладка "Потребности и умения" = две подвкладки: Потребности | Умения.
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

// Подвкладка "Потребности": на шкале — реальное значение/максимум, справа — проценты 0-100.
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

// Подвкладка "Умения": сверху "Боевые умения" (текущее звание + прогресс),
// ниже блок "Боевые приёмы" с двумя аккордеонами (Оруженосец / Воитель).
function renderSkillsSubTab() {
  const rank = getRank();
  const xp = getXp();
  const isMax = rank.lvl === RANKS.length;
  const pct = isMax ? 100 : Math.min(100, ((xp - rank.min) / (rank.max - rank.min)) * 100);
  const xpLabel = isMax ? `${xp} xp (макс.)` : `${xp} / ${rank.max} xp`;
  const tooltip = `Сила удара: x${rank.dam.toFixed(1)} · Бонус: ${rank.bonus}`;

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
    </div>
  `;
}


// Для большинства потребностей высокое значение — хорошо (зелёный),
// низкое — плохо (красный). Для "нужды" логика обратная:
// высокое значение — плохо (нужно справить нужду).
// pct — значение потребности в процентах от её максимума (0-100).
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
