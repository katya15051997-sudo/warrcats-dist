import { checkSession, openAuthModal } from './auth.js';
import { clearSession } from '../net/api.js';
import { loadServers, addServer, defaultSettings } from '../config/servers.js';
import { loadCharactersFromServer, getCharacters, getActiveCharacter, setActiveCharacter, deleteCharacter } from '../character/character-save.js';
import { showCharacterEditor } from './character-editor.js';
import { applyServerSettings } from '../config/game-settings.js';

const NEWS = [
  {
    title: 'Открытие сайта',
    date: '25 июня 2026',
    text: 'Сегодня открылся сайт WarrCats New! Я горжусь, что проект продвинулся на эту ступень. Это открывает новые возможности для продвижения.'
  },
  {
    title: 'Система боевых приёмов и новая моделька',
    date: '20 июня 2026',
    text: 'Отрисованы новые модельки персонажа (худой, толстый и массивный), добавлена анимация и окрашивание. Боевая система становится шире - появляются приёмы для изучения, создаются баффы и возможности прокачки персонажа разными способами.'
  },
  {
    title: 'Цикл дня и ночи и другие нововведения',
    date: '15 июня 2026',
    text: 'Теперь в игре сменяются рассвет, день, закат и ночь (1 день=6 часов). В будущем - каждый период влияет на активность животных. Персонажи теперь испытывают жажду, голод, усталость, нужду, желание поточить когти. Начало боевой системы и взаимодействий.'
  },
  {
    title: 'Первая запись',
    date: '9 июня 2026',
    text: 'В сообществе ВКонтакте была создана группа, посвящённая игре, а также написана первая запись на стене!'
  },
];

const LANDING_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@600&display=swap');

  #landing {
    position: fixed;
    inset: 0;
    z-index: 100;
    font-family: 'Ink Free', 'Segoe Print', cursive;
    overflow: hidden;
  }

  #landing-bg {
    position: absolute;
    inset: 0; width: 100%; height: 100%;
    object-fit: cover; object-position: center;
    user-select: none; pointer-events: none; z-index: 0;
  }

  #landing-title {
    position: absolute;
    top: 9%; left: 38%;
    transform: translateX(-50%);
    z-index: 2;
    line-height: 1.05;
    user-select: none; pointer-events: none;
    text-align: center; white-space: nowrap;
  }
  #landing-title .t-warrcats {
    display: block;
    font-family: 'Oswald','Arial Black','Impact',sans-serif;
    font-weight: 600; font-size: 130px;
    color: #2b1d0e; letter-spacing: 2px;
  }
  #landing-title .t-new {
    display: block;
    font-family: 'Oswald','Arial Black','Impact',sans-serif;
    font-weight: 600; font-size: 72px;
    color: #2b1d0e; letter-spacing: 6px;
    margin-top: -10px; text-align: center;
  }

  #landing-buttons {
    position: absolute;
    top: calc(46% - 50px); left: 38%;
    transform: translateX(-50%);
    z-index: 2;
    display: flex; flex-direction: column;
    align-items: center; gap: 14px;
  }

  .landing-btn {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 280px; padding: 0 32px; height: 62px;
    background-image: url('/assets/menu/knopka.png');
    background-size: 100% 100%; background-repeat: no-repeat;
    background-color: transparent; border: none; cursor: pointer;
    color: #ffcc80;
    font-family: 'Ink Free','Segoe Print',cursive;
    font-size: 20px;
    text-shadow: 1px 1px 3px rgba(0,0,0,0.9);
    transition: transform 0.12s, filter 0.12s; user-select: none;
  }
  .landing-btn:hover  { transform: scale(1.05); filter: brightness(1.15); }
  .landing-btn:active { transform: scale(0.97); }

  #landing-username {
    color: #2b1d0e; font-size: 35px;
    text-shadow: 1px 1px 13px rgba(0,0,0,0.9);
    text-align: center; margin-bottom: 4px;
  }

  /* ── Блок новостей ── */
  #landing-news {
    position: absolute;
    top: 75%; left: 38%;
    transform: translate(-50%, -50%);
    z-index: 2;
    width: 300px;
    max-height: 220px;
    overflow-y: auto;
    background: rgba(8,16,6,0.72);
    border: 1.5px solid rgba(139,90,43,0.55);
    border-radius: 12px;
    padding: 10px 12px;
    scrollbar-width: thin;
    scrollbar-color: rgba(139,90,43,0.5) transparent;
  }
  #landing-news::-webkit-scrollbar { width: 4px; }
  #landing-news::-webkit-scrollbar-thumb { background: rgba(139,90,43,0.5); border-radius: 4px; }

  .news-item {
    padding: 8px 0;
    border-bottom: 1px solid rgba(139,90,43,0.25);
  }
  .news-item:last-child { border-bottom: none; padding-bottom: 0; }
  .news-item:first-child { padding-top: 0; }

  .news-title {
    color: #ffcc80; font-size: 13px; font-weight: 600;
    font-family: 'Ink Free','Segoe Print',cursive;
    margin-bottom: 3px; line-height: 1.3;
  }
  .news-date {
    color: rgba(200,180,140,0.6); font-size: 10px;
    font-family: Arial,sans-serif; margin-bottom: 4px;
  }
  .news-text {
    color: rgba(220,200,160,0.85); font-size: 11px;
    font-family: Arial,sans-serif; line-height: 1.4;
    display: -webkit-box; -webkit-line-clamp: 2;
    -webkit-box-orient: vertical; overflow: hidden;
  }
  .news-hint {
    color: rgba(139,90,43,0.7); font-size: 10px;
    text-align: center; padding-top: 6px;
    font-family: Arial,sans-serif;
  }

  /* ── Футер ── */
  #landing-footer {
    position: absolute; bottom: 18px; left: 20px;
    z-index: 3; display: flex; align-items: center; gap: 10px;
  }
  #landing-vk {
    width: 38px; height: 38px; object-fit: contain;
    cursor: pointer; transition: transform 0.15s;
    filter: drop-shadow(0 1px 3px rgba(0,0,0,0.6));
  }
  #landing-vk:hover { transform: scale(1.15); }
  #landing-dev-text {
    color: rgba(255,255,255,0.8); font-size: 13px;
    text-shadow: 1px 1px 3px rgba(0,0,0,0.9);
    font-family: 'Ink Free','Segoe Print',cursive;
  }

  /* ── Попапы ── */
  .lp-overlay {
    position: fixed; inset: 0; z-index: 9997;
    background: rgba(0,0,0,0.65);
    display: flex; align-items: center; justify-content: center;
  }
  .lp-modal {
    background: rgba(14,24,10,0.98);
    border: 2px solid #8B5A2B; border-radius: 14px;
    padding: 28px 32px; width: 560px;
    max-width: calc(100vw - 32px); max-height: 88vh;
    display: flex; flex-direction: column; gap: 14px;
    font-family: 'Ink Free','Segoe Print',cursive;
    position: relative; overflow: hidden;
  }
  .lp-modal h2 { color: #ffcc80; font-size: 18px; margin: 0; text-shadow: 1px 1px 0 #3a2410; }
  .lp-close {
    position: absolute; top: 10px; right: 14px;
    background: none; border: none; color: #9a8a6a; font-size: 18px;
    cursor: pointer; line-height: 1;
  }
  .lp-close:hover { color: #ffcc80; }

  #server-list {
    overflow-y: auto; flex: 1; display: flex;
    flex-direction: column; gap: 8px;
    max-height: 340px; padding-right: 4px;
  }
  .server-card {
    background: rgba(40,55,30,0.7); border: 1px solid rgba(139,90,43,0.4);
    border-radius: 8px; padding: 12px 14px;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
  }
  .server-card-info strong { color: #ffcc80; font-size: 14px; }
  .server-card-info small  { color: #9a8a6a; font-size: 12px; display: block; margin-top: 2px; }
  .server-card-join {
    background: rgba(139,90,43,0.55); border: 1.5px solid #8B5A2B;
    border-radius: 7px; color: #ffcc80;
    font-family: inherit; font-size: 13px; padding: 6px 16px;
    cursor: pointer; flex-shrink: 0; transition: background 0.15s;
  }
  .server-card-join:hover { background: rgba(139,90,43,0.85); }
  #server-picker-create {
    background: rgba(60,90,40,0.6); border: 1.5px solid #5a8a2b;
    border-radius: 9px; color: #c8ff90;
    font-family: inherit; font-size: 14px; padding: 10px;
    cursor: pointer; transition: all 0.15s; text-align: center; flex-shrink: 0;
  }
  #server-picker-create:hover { background: rgba(60,90,40,0.9); }
  .server-empty { color: #6a5a4a; font-size: 13px; text-align: center; padding: 24px 0; }

  #srv-editor-name {
    background: #0a160a; border: 1.5px solid #5a3a1a; border-radius: 7px;
    color: #ffcc80; font-size: 15px; padding: 8px 12px;
    outline: none; font-family: inherit; width: 100%; box-sizing: border-box;
  }
  #srv-editor-name:focus { border-color: #8B5A2B; }
  .srv-sliders { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; overflow-y: auto; max-height: 300px; padding-right: 4px; }
  .srv-slider-row label { font-size: 12px; color: #c9bda0; display: flex; justify-content: space-between; margin-bottom: 4px; }
  .srv-slider-row input[type=range] { width: 100%; accent-color: #8B5A2B; }
  .srv-editor-actions { display: flex; gap: 10px; }
  .srv-btn { flex: 1; background: rgba(139,90,43,0.55); border: 1.5px solid #8B5A2B; border-radius: 9px; color: #ffcc80; font-family: inherit; font-size: 14px; padding: 10px; cursor: pointer; transition: all 0.15s; }
  .srv-btn:hover { background: rgba(139,90,43,0.85); }
  .srv-btn.secondary { background: rgba(40,40,40,0.6); border-color: #5a4a3a; color: #9a8a6a; }
  .srv-btn.secondary:hover { background: rgba(60,60,60,0.8); color: #c9bda0; }
  .srv-error { color: #ff9090; font-size: 12px; text-align: center; display: none; }
  .srv-error.visible { display: block; }

  /* ── Экран персонажа ── */
  #char-screen {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(8,14,8,0.97);
    display: flex; flex-direction: column;
    align-items: center; justify-content: flex-start;
    font-family: Arial,sans-serif; overflow-y: auto;
  }
  .char-screen-header {
    width: 100%; max-width: 860px;
    padding: 28px 32px 0; box-sizing: border-box;
    display: flex; align-items: center; gap: 16px;
  }
  .char-screen-title { color: #ffcc80; margin: 0 0 4px; font-size: 26px; }
  .char-screen-sub { color: #c9bda0; font-size: 13px; }
  .char-screen-actions {
    width: 100%; max-width: 860px;
    padding: 16px 32px 24px; box-sizing: border-box;
    display: flex; gap: 12px; flex-wrap: wrap;
  }
  .cs-btn {
    padding: 10px 24px; border-radius: 9px; font-size: 15px;
    cursor: pointer; font-family: inherit; transition: all 0.15s;
  }
  .cs-btn-play {
    background: rgba(60,100,30,0.8); border: 1.5px solid #8fd14f;
    color: #c8ff90;
  }
  .cs-btn-play:hover { background: rgba(80,130,40,0.9); }
  .cs-btn-play:disabled { opacity: 0.4; cursor: not-allowed; }
  .cs-btn-back {
    background: rgba(40,30,20,0.7); border: 1.5px solid #8B5A2B;
    color: #ffcc80;
  }
  .cs-btn-back:hover { background: rgba(60,45,25,0.9); }
  .char-list-wrap {
    width: 100%; max-width: 860px;
    padding: 0 32px 32px; box-sizing: border-box;
    display: flex; flex-direction: column; gap: 10px;
  }
  .char-row {
    display: flex; align-items: center; gap: 12px;
    border-radius: 10px; padding: 12px 16px;
    border: 1px solid rgba(139,90,43,0.35);
    transition: border-color 0.15s;
  }
  .char-row.active-char {
    background: rgba(143,209,79,0.1);
    border-color: rgba(143,209,79,0.45);
  }
  .char-row:not(.active-char) { background: rgba(30,45,25,0.65); }
  .char-row-info { flex: 1; }
  .char-row-name { color: #ffcc80; font-size: 15px; font-weight: 600; margin-bottom: 3px; }
  .char-row-meta { color: #9a8a6a; font-size: 12px; }
  .char-row-select {
    padding: 7px 18px; border-radius: 7px; font-size: 13px;
    cursor: pointer; flex-shrink: 0;
  }
  .char-row-del {
    padding: 7px 11px; border-radius: 7px; font-size: 13px;
    cursor: pointer; flex-shrink: 0;
    background: rgba(100,0,0,0.45); border: 1px solid rgba(180,0,0,0.4); color: #ffaaaa;
  }
  .char-row-del:hover { background: rgba(140,0,0,0.65); }
  .cs-empty { color: #c9bda0; font-size: 15px; text-align: center; padding: 40px 0; }
  .cs-new-btn {
    margin: 4px 0; padding: 10px 20px; border-radius: 9px;
    background: rgba(40,70,25,0.7); border: 1.5px solid #5a8a2b;
    color: #c8ff90; font-size: 14px; cursor: pointer;
    font-family: inherit; transition: all 0.15s; text-align: center;
  }
  .cs-new-btn:hover { background: rgba(55,90,35,0.9); }
`;

const SLIDERS = [
  { label: 'Частота смены лун',     key: 'moonFrequency',    min: 2,  max: 7,   step: 1  },
  { label: 'Макс. здоровье',        key: 'maxHealth',        min: 0,  max: 400, step: 5  },
  { label: 'Макс. сила',            key: 'maxStrength',      min: 0,  max: 200, step: 5  },
  { label: 'Здоровье за луну',      key: 'healthPerMoon',    min: 0,  max: 30,  step: 1  },
  { label: 'Сила за тренировку',    key: 'strengthPerTrain', min: 0,  max: 20,  step: 1  },
  { label: 'Макс. возраст (лун)',   key: 'maxAge',           min: 0,  max: 180, step: 5  },
  { label: 'Рост трав (шт/неделю)', key: 'grassGrowthRate',  min: 0,  max: 180, step: 5  },
  { label: 'Сгнивание дичи (дней)', key: 'meatDecayDays',    min: 5,  max: 14,  step: 1  },
  { label: 'Порча трав (дней)',      key: 'grassDecayDays',   min: 0,  max: 180, step: 5  },
];

let _startGameCb  = null;
let _currentUser  = null;
let _pendingServer = null; 

export async function initLanding(startGameCb) {
  _startGameCb = startGameCb;
  _injectStyles();
  _renderLanding();

  const me = await checkSession();
  if (me) {
    _currentUser = me;
    window.currentUser = me;
    await loadCharactersFromServer();
    _setLoggedIn(me.username);
  }
}

function _injectStyles() {
  if (document.getElementById('landing-styles')) return;
  const s = document.createElement('style');
  s.id = 'landing-styles';
  s.textContent = LANDING_CSS;
  document.head.appendChild(s);
}

function _renderLanding() {
  if (document.getElementById('landing')) return;
  const el = document.createElement('div');
  el.id = 'landing';
  el.innerHTML = `
    <img id="landing-bg" src="/assets/menu/sait.jpeg" alt="">

    <div id="landing-title">
      <span class="t-warrcats">WARRCATS</span>
      <span class="t-new">NEW</span>
    </div>

    <div id="landing-buttons"></div>

    <div id="landing-news"></div>

    <div id="landing-footer">
      <img id="landing-vk" src="/assets/menu/vk.png" alt="ВКонтакте" title="Наша группа ВКонтакте">
      <span id="landing-dev-text">Игра находится в разработке.</span>
    </div>
  `;
  document.body.appendChild(el);

  el.querySelector('#landing-vk').addEventListener('click', () => {
    window.open('https://vk.com/warrcats_new', '_blank');
  });

  _renderNews();
  _setLoggedOut();
}

function _renderNews() {
  const box = document.getElementById('landing-news');
  if (!box) return;
  box.innerHTML = '';
  NEWS.forEach((n, i) => {
    const item = document.createElement('div');
    item.className = 'news-item';
    item.innerHTML = `
      <div class="news-title">${n.title}</div>
      <div class="news-date">${n.date}</div>
      <div class="news-text">${n.text}</div>
    `;
    box.appendChild(item);
  });
  if (NEWS.length > 2) {
    const hint = document.createElement('div');
    hint.className = 'news-hint';
    hint.textContent = '↓ листайте вниз';
    box.appendChild(hint);
  }
}

function _setLoggedOut() {
  const btns = document.getElementById('landing-buttons');
  if (!btns) return;
  btns.innerHTML = '';

  const loginBtn = _makeBtn('Войти / Зарегистрироваться');
  loginBtn.addEventListener('click', async () => {
    const me = await openAuthModal();
    if (!me) return;
    _currentUser = me;
    window.currentUser = me;
    await loadCharactersFromServer();
    _setLoggedIn(me.username);
  });
  btns.appendChild(loginBtn);
}

function _setLoggedIn(username) {
  const btns = document.getElementById('landing-buttons');
  if (!btns) return;
  btns.innerHTML = '';

  
  const nameEl = document.createElement('div');
  nameEl.id = 'landing-username';
  nameEl.textContent = `Привет, ${username}!`;
  btns.appendChild(nameEl);

  
  const row = document.createElement('div');
  row.style.cssText = 'display:flex; gap:16px; justify-content:center;';

  const playBtn = _makeBtn('▶ Играть');
  playBtn.style.minWidth = '0';
  playBtn.style.width = '185px';
  playBtn.addEventListener('click', () => _openServerPicker());
  row.appendChild(playBtn);

  const logoutBtn = _makeBtn('Выйти');
  logoutBtn.style.minWidth = '0';
  logoutBtn.style.width = '185px';
  logoutBtn.style.filter = 'sepia(1) hue-rotate(160deg) brightness(0.75)';
  logoutBtn.addEventListener('click', () => {
    clearSession();
    _currentUser = null;
    window.currentUser = null;
    _setLoggedOut();
  });
  row.appendChild(logoutBtn);

  btns.appendChild(row);
}

function _makeBtn(label) {
  const btn = document.createElement('button');
  btn.className = 'landing-btn';
  btn.textContent = label;
  return btn;
}

async function _openServerPicker() {
  if (document.getElementById('sp-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'lp-overlay';
  overlay.id = 'sp-overlay';

  const modal = document.createElement('div');
  modal.className = 'lp-modal';
  modal.innerHTML = `
    <button class="lp-close" title="Закрыть">✕</button>
    <h2>Выбор сервера</h2>
    <div id="server-list"><div class="server-empty">Загрузка…</div></div>
    <button id="server-picker-create">+ Создать новый сервер</button>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  modal.querySelector('.lp-close').addEventListener('click', () => overlay.remove());
  modal.querySelector('#server-picker-create').addEventListener('click', () => {
    overlay.remove();
    _openServerEditor();
  });

  const listEl = modal.querySelector('#server-list');
  try {
    const servers = await loadServers();
    listEl.innerHTML = '';
    if (!servers.length) {
      listEl.innerHTML = '<div class="server-empty">Нет серверов. Создайте первый!</div>';
      return;
    }
    servers.forEach(srv => {
      const card = document.createElement('div');
      card.className = 'server-card';
      card.innerHTML = `
        <div class="server-card-info">
          <strong>${_esc(srv.name)}</strong>
          <small>Онлайн: ${srv.players ?? 0} · Лун: ${srv.moons ?? 0}</small>
        </div>
      `;
      const joinBtn = document.createElement('button');
      joinBtn.className = 'server-card-join';
      joinBtn.textContent = 'Войти';
      joinBtn.addEventListener('click', () => {
        overlay.remove();
        _openCharScreen(srv); 
      });
      card.appendChild(joinBtn);
      listEl.appendChild(card);
    });
  } catch (e) {
    listEl.innerHTML = `<div class="server-empty">Ошибка: ${_esc(e.message)}</div>`;
  }
}

function _openServerEditor() {
  if (document.getElementById('se-overlay')) return;
  const draft = { ...defaultSettings };

  const overlay = document.createElement('div');
  overlay.className = 'lp-overlay';
  overlay.id = 'se-overlay';

  const modal = document.createElement('div');
  modal.className = 'lp-modal';
  modal.innerHTML = `
    <button class="lp-close" title="Закрыть">✕</button>
    <h2>Создание сервера</h2>
    <input id="srv-editor-name" type="text" placeholder="Название сервера" maxlength="48">
    <div class="srv-sliders"></div>
    <div class="srv-error" id="se-error"></div>
    <div class="srv-editor-actions">
      <button class="srv-btn secondary" id="se-cancel">Отмена</button>
      <button class="srv-btn" id="se-create">Создать сервер</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const slidersEl = modal.querySelector('.srv-sliders');
  SLIDERS.forEach(s => {
    const row = document.createElement('div');
    row.className = 'srv-slider-row';
    row.innerHTML = `
      <label>${_esc(s.label)}: <span>${draft[s.key] ?? s.min}</span></label>
      <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${draft[s.key] ?? s.min}">
    `;
    const input = row.querySelector('input');
    const span  = row.querySelector('span');
    input.addEventListener('input', () => { draft[s.key] = parseFloat(input.value); span.textContent = input.value; });
    slidersEl.appendChild(row);
  });

  const closeModal = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  modal.querySelector('.lp-close').addEventListener('click', closeModal);
  modal.querySelector('#se-cancel').addEventListener('click', closeModal);

  const errorEl   = modal.querySelector('#se-error');
  const createBtn = modal.querySelector('#se-create');
  const nameInput = modal.querySelector('#srv-editor-name');

  createBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) { errorEl.textContent = 'Введите название сервера'; errorEl.classList.add('visible'); return; }
    createBtn.disabled = true; createBtn.textContent = 'Создание…';
    errorEl.classList.remove('visible');
    try {
      const srv = await addServer(name, draft);
      closeModal();
      _openCharScreen({ ...srv, settings: draft });
    } catch (e) {
      errorEl.textContent = e.message ?? 'Ошибка создания сервера';
      errorEl.classList.add('visible');
      createBtn.disabled = false; createBtn.textContent = 'Создать сервер';
    }
  });

  nameInput.focus();
}

function _openCharScreen(server) {
  _pendingServer = server;
  if (document.getElementById('char-screen')) return;

  const screen = document.createElement('div');
  screen.id = 'char-screen';
  document.body.appendChild(screen);

  _renderCharScreen(screen);
}

function _renderCharScreen(screen) {
  screen.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'char-screen-header';
  header.innerHTML = `
    <div style="flex:1;">
      <h2 class="char-screen-title">Выбрать котика</h2>
      <div class="char-screen-sub">Выберите котика или создайте нового, затем нажмите «Начать играть»</div>
    </div>
  `;
  screen.appendChild(header);

  
  const actions = document.createElement('div');
  actions.className = 'char-screen-actions';

  const playBtn = document.createElement('button');
  playBtn.className = 'cs-btn cs-btn-play';
  playBtn.id = 'cs-play';
  playBtn.textContent = '▶ Начать играть';
  const active = getActiveCharacter();
  playBtn.disabled = !active;
  playBtn.addEventListener('click', () => {
    const ch = getActiveCharacter();
    if (!ch) return;
    screen.remove();
    _startGame(_pendingServer);
  });
  actions.appendChild(playBtn);

  const backBtn = document.createElement('button');
  backBtn.className = 'cs-btn cs-btn-back';
  backBtn.textContent = '← Выйти на главную';
  backBtn.addEventListener('click', () => {
    screen.remove();
    _pendingServer = null;
    
    if (!document.getElementById('landing')) {
      _renderLanding();
      if (_currentUser) _setLoggedIn(_currentUser.username);
    }
    _openServerPicker();
  });
  actions.appendChild(backBtn);

  screen.appendChild(actions);

  
  const listWrap = document.createElement('div');
  listWrap.className = 'char-list-wrap';

  const newBtn = document.createElement('button');
  newBtn.className = 'cs-new-btn';
  newBtn.textContent = '+ Создать нового котика';
  newBtn.addEventListener('click', () => {
    
    showCharacterEditor(null, () => _renderCharScreen(screen));
  });
  listWrap.appendChild(newBtn);

  
  const chars = getCharacters();

  if (chars.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'cs-empty';
    empty.textContent = 'Нет сохранённых котиков. Создайте первого!';
    listWrap.appendChild(empty);
  } else {
    chars.forEach(char => {
      const currentActive = getActiveCharacter();
      const isActive = currentActive && currentActive.id === char.id;

      const row = document.createElement('div');
      row.className = 'char-row' + (isActive ? ' active-char' : '');

      const info = document.createElement('div');
      info.className = 'char-row-info';
      info.innerHTML = `
        <div class="char-row-name">${_esc(char.name)}${isActive ? ' <span style="color:#8fd14f;font-size:12px;">✓ выбран</span>' : ''}</div>
        <div class="char-row-meta">${char.tribe?.name ?? '—'} · ${char.build ?? 'lean'} · ${char.age_moons ?? 0} лун</div>
      `;
      row.appendChild(info);

      if (!isActive) {
        const selBtn = document.createElement('button');
        selBtn.className = 'char-row-select';
        selBtn.textContent = 'Выбрать';
        selBtn.style.cssText = 'background:rgba(58,47,30,0.85);border:1px solid #8B5A2B;color:#ffcc80;';
        selBtn.addEventListener('click', () => {
          setActiveCharacter(char);
          _renderCharScreen(screen);
        });
        row.appendChild(selBtn);
      }

      const delBtn = document.createElement('button');
      delBtn.className = 'char-row-del';
      delBtn.textContent = '✕';
      delBtn.title = 'Удалить';
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Удалить котика ${char.name}?`)) return;
        await deleteCharacter(char.id);
        _renderCharScreen(screen);
      });
      row.appendChild(delBtn);

      listWrap.appendChild(row);
    });
  }

  screen.appendChild(listWrap);

  
  const playB = screen.querySelector('#cs-play');
  if (playB) playB.disabled = !getActiveCharacter();
}

function _startGame(server) {
  window.activeServerId = server.id;
  applyServerSettings(server);
  document.getElementById('landing')?.remove();
  if (_startGameCb) _startGameCb(server.id, server.settings ?? {});
}

function _esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
