import * as PIXI from 'pixi.js';
import { initTooltip, showTooltip, hideTooltip, showServerSettingsTooltip } from './tooltip.js';
import { loadServers, addServer, deleteServer, defaultSettings, loadServer } from './servers.js';
import { saveCharacter, loadCharacters, deleteCharacter, setActiveCharacter, getActiveCharacter, resetAllCharacters } from './character-save.js';
import { applyCharacterBuild, applyCharacterColors, applyEyeColor } from './character.js';
import { injectGameStyles } from '../styles.js';

// Картинки-превью на каждое телосложение.
const BUILD_IMGS = {
  lean:  '/assets/spine/Cat_lean.png',
  large: '/assets/spine/Cat_massive.png',
  fat:   '/assets/spine/Cat_fat.png',
};
function buildImg(build){ return BUILD_IMGS[build] || BUILD_IMGS.lean; }

export let currentSettings = {
  serverName: "Новый Сервер",
  moonFrequency: 3,
  maxHealth: 100,
  maxStrength: 50,
  healthPerMoon: 15,
  strengthPerTrain: 8,
  maxAge: 60,
  grassGrowthRate: 30,
  meatDecayDays: 7,
  grassDecayDays: 30,
  selectedMap: "forest"
};

let menuContainer = null;
let isEditingServerName = false;
let serverNameInput = null;
let serversList = [];

// Загружаем серверы при старте
let servers = loadServers();

export function showMainMenu(app, startGameCallback) {
  if (menuContainer) menuContainer.remove();

  window.startGameCallback = startGameCallback;
  initTooltip();
  servers = loadServers();

  menuContainer = document.createElement('div');
  menuContainer.id = 'game-menu';
  menuContainer.className = 'wc-menu';
  document.body.appendChild(menuContainer);

  injectGameStyles();
  injectMenuSkin();

  menuContainer.innerHTML = `
    <img class="wc-title-img wc-title-left" src="/assets/menu/warrcats.png" alt="WarrCats">
    <img class="wc-title-img wc-title-right" src="/assets/menu/news.png" alt="News">

    <div class="wc-panel wc-panel-left">
      <div class="wc-btns">
        <button class="wc-btn" id="btn-start">Продолжить играть</button>
        <button class="wc-btn" id="btn-load-char">Создать / загрузить котика</button>
        <button class="wc-btn" id="btn-server">Создать / загрузить сервер</button>
      </div>
    </div>

    <div class="wc-panel wc-panel-right">
      <div class="wc-news-list" id="news-list"></div>
    </div>
  `;

  const btnStart = document.getElementById('btn-start');
  const btnLoad = document.getElementById('btn-load-char');
  const btnServer = document.getElementById('btn-server');

  if (btnStart) btnStart.onclick = () => {
    hideMenu();
    if (startGameCallback) startGameCallback(currentSettings);
  };
  if (btnLoad) btnLoad.onclick = () => showCharacterSelectScreen();
  if (btnServer) btnServer.onclick = () => showServerMenu();

  renderNews();
}

function showServerMenu() {
  if (!menuContainer) return;
  
  isEditingServerName = false;
  
  // Обновляем список серверов
  servers = loadServers();

  menuContainer.innerHTML = `
    <div style="display: flex; gap: 30px; background: rgba(15, 25, 15, 0.95); padding: 40px; border-radius: 15px; max-width: 1200px; border: 3px solid #8B5A2B;">
      <!-- Левая часть -->
      <div style="flex: 1; min-width: 500px;">
        <div id="server-name-container" style="margin-bottom: 20px;">
          <div id="server-name-display" class="server-name-display">
            ${currentSettings.serverName || "Введите название"}
          </div>
        </div>
        <h2>Настройки сервера</h2>
        <div class="settings-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; text-align: left; max-height: 420px; overflow-y: auto; padding-right: 10px;"></div>
        
        <div style="margin-top: 30px;">
          <button class="menu-btn" id="btn-back">Назад в главное меню</button>
          <button class="menu-btn" id="btn-create-server">Создать сервер</button>
        </div>
      </div>

      <!-- Правая часть -->
      <div style="width: 340px; border-left: 2px solid #8B5A2B; padding-left: 25px;">
        <h2 style="margin-top: 0;">Доступные серверы</h2>
        <div id="servers-list" style="max-height: 420px; overflow-y: auto; text-align: left;"></div>
      </div>
    </div>
  `;

  const grid = document.querySelector('.settings-grid');

  const slidersConfig = [
    { label: "Частота смены лун (дней)", key: "moonFrequency", min: 2, max: 7, step: 1, tooltip: "Сколько дней длится одна луна в игре." },
    { label: "Максимальное здоровье", key: "maxHealth", min: 0, max: 400, step: 5, tooltip: "Максимальное количество здоровья у персонажей." },
    { label: "Максимальная сила", key: "maxStrength", min: 0, max: 200, step: 5, tooltip: "Максимальная сила, которую может набрать персонаж." },
    { label: "Здоровье за луну", key: "healthPerMoon", min: 0, max: 30, step: 1, tooltip: "Сколько здоровья прибавляется за каждую луну." },
    { label: "Прибавка силы за тренировку", key: "strengthPerTrain", min: 0, max: 20, step: 1, tooltip: "Сколько силы даёт действие 'Потренироваться'." },
    { label: "Максимальный возраст (лун)", key: "maxAge", min: 0, max: 180, step: 5, tooltip: "Максимальный возраст персонажа в лунах." },
    { label: "Частота роста трав (шт/неделю)", key: "grassGrowthRate", min: 0, max: 180, step: 5, tooltip: "Количество новой травы, которая вырастает за неделю." },
    { label: "Время сгнивания дичи (дней)", key: "meatDecayDays", min: 5, max: 14, step: 1, tooltip: "Через сколько дней портится добыча." },
    { label: "Время порчи трав (дней)", key: "grassDecayDays", min: 0, max: 180, step: 5, tooltip: "Через сколько дней трава загневает." },
  ];

  slidersConfig.forEach(s => {
    const div = document.createElement('div');
    div.innerHTML = `
      <label>${s.label}: <span class="value">${currentSettings[s.key]}</span></label>
      <input type="range" min="${s.min}" max="${s.max}" value="${currentSettings[s.key]}" step="${s.step}">
    `;

    const input = div.querySelector('input');
    const valueSpan = div.querySelector('.value');

    // Подсказка для слайдеров
    div.style.cursor = 'help';
    div.onmouseenter = (e) => showTooltip(e, s.tooltip);
    div.onmouseleave = hideTooltip;

    input.oninput = () => {
      currentSettings[s.key] = parseFloat(input.value);
      valueSpan.textContent = input.value;
    };

    grid.appendChild(div);
  });

  // Функция создания элемента сервера с подсказкой настроек
  function createServerItem(server) {
    const div = document.createElement('div');
    div.style.cssText = `
      background: rgba(40,50,40,0.6);
      padding: 12px;
      margin-bottom: 8px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    
    const contentDiv = document.createElement('div');
    contentDiv.style.flex = 1;
    contentDiv.innerHTML = `
      <strong>${server.name}</strong><br>
      <small>Онлайн: ${server.players} | Лун: ${server.moons}</small>
    `;
    
    // Кнопка удаления
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '✕';
    deleteBtn.className = 'delete-server-btn';
    deleteBtn.title = 'Удалить сервер';
    
    div.appendChild(contentDiv);
    div.appendChild(deleteBtn);
    
    // При наведении показываем подсказку с настройками
    div.onmouseenter = (e) => {
      showServerSettingsTooltip(e, server.name, server.settings);
      div.style.background = 'rgba(80,90,80,0.8)';
    };
    
    div.onmouseleave = () => {
      hideTooltip();
      div.style.background = 'rgba(40,50,40,0.6)';
    };
    
    // Загрузка сервера при клике
    contentDiv.onclick = () => {
      if (confirm(`Загрузить сервер «${server.name}»? Текущие настройки будут заменены.`)) {
        // Загружаем настройки сервера
        Object.assign(currentSettings, server.settings);
        currentSettings.serverName = server.name;
        
        // Обновляем отображение
        const serverNameDisplay = document.getElementById('server-name-display');
        if (serverNameDisplay) {
          serverNameDisplay.textContent = server.name;
        }
        
        const mainNameEl = document.getElementById('main-server-name');
        if (mainNameEl) {
          mainNameEl.textContent = server.name;
        }
        
        alert(`Сервер «${server.name}» загружен!`);
      }
    };
    
    // Удаление сервера
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Удалить сервер «${server.name}»?`)) {
        servers = deleteServer(server.id);
        showServerMenu(); // Обновляем список
      }
    };
    
    return div;
  }
  
  // Заполняем список серверов
  const serversListDiv = document.getElementById('servers-list');
  serversListDiv.innerHTML = '';
  
  servers.forEach(server => {
    serversListDiv.appendChild(createServerItem(server));
  });

  // Кнопка назад
  const btnBack = document.getElementById('btn-back');
  if (btnBack) btnBack.onclick = () => showMainMenu(null, window.startGameCallback);

  // Кнопка создания сервера
  const btnCreate = document.getElementById('btn-create-server');
  if (btnCreate) {
    btnCreate.onclick = () => {
      const name = currentSettings.serverName || `Новый сервер ${Date.now()}`;
      const newServer = addServer(name, { ...currentSettings });
      alert(`Сервер «${name}» создан!`);
      showServerMenu(); // Обновляем список
    };
  }

  // Inline-редактирование названия сервера в экране настроек
  const serverDisplayEl = document.getElementById('server-name-display');
  if (serverDisplayEl) {
    serverDisplayEl.style.cursor = 'text';
    const startInlineEditServer = (el) => {
      if (el.isContentEditable) return;
      el.contentEditable = 'true';
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      el.focus();
    };
    const commitServer = () => {
      serverDisplayEl.contentEditable = 'false';
      const name = serverDisplayEl.textContent.trim();
      if (name !== '') currentSettings.serverName = name;
      else serverDisplayEl.textContent = currentSettings.serverName;
      const mainName = document.getElementById('main-server-name');
      if (mainName) mainName.textContent = currentSettings.serverName;
    };
    serverDisplayEl.addEventListener('click', () => startInlineEditServer(serverDisplayEl));
    serverDisplayEl.addEventListener('blur', commitServer);
    serverDisplayEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); serverDisplayEl.blur(); }
      if (e.key === 'Escape') { 
        e.stopPropagation(); 
        serverDisplayEl.textContent = currentSettings.serverName; 
        serverDisplayEl.blur(); 
      }
    });
  }
}

function hideMenu() {
  if (menuContainer) {
    menuContainer.remove();
    menuContainer = null;
  }
}

window.hideGameMenu = hideMenu;

// ============================================================
// Утилита: CSS-фильтр окраски по данным app.body
// Используется и в редакторе (превью), и в списке персонажей.
// ============================================================
function bodyToFilter(body) {
  if (!body) return '';
  const catHue = v => v <= 70 ? Math.round((v / 70) * 60) : Math.round(180 + ((v - 70) / 30) * 60);
  const catSat = v => Math.round((v / 100) * 100);
  const hslH = catHue(body.hue);
  const hueRotate = hslH - 38;
  const satPct = Math.round(10 + (catSat(body.saturation) / 100) * 350);
  const brightF = (0.3 + ((body.brightness - 10) / 80) * 1.3).toFixed(2);
  return `sepia(1) hue-rotate(${hueRotate}deg) saturate(${satPct}%) brightness(${brightF})`;
}

// ============================================================
// Редактор персонажа
// ============================================================
function showCharacterEditor() {
  // Не открывать повторно
  if (document.getElementById('char-editor-overlay')) return;

  const TRIBES = [
    {id:'warrcats', name:'Варркэтс',  color:'#4a7c59'},
    {id:'shadow',   name:'ТенеПлемя', color:'#5a4a7c'},
    {id:'river',    name:'РекаПлемя', color:'#4a6a7c'},
    {id:'wind',     name:'ВетерПлемя',color:'#7c7a4a'},
    {id:'loner',    name:'Одиночка',  color:'#7c4a4a'},
  ];
  const ROLES = ['Котёнок','Оруженосец','Воитель','Старейшина'];
  const MARKINGS_SEC = ['Голова','Шея','Тело','Хвост','Лапы'];
  const FUR_BODY_SEC = ['Тело','Шея','Хвост'];
  const FUR_HEAD_SEC = ['Шея','Голова'];
  const EYES_SEC     = ['Основной'];
  const TABS = [
    {id:'body',     label:'Телосложение'},
    {id:'markings', label:'Маркировки'},
    {id:'fur_body', label:'Шерсть (тело)'},
    {id:'fur_head', label:'Шерсть (голова)'},
    {id:'eyes',     label:'Цвет глаз'},
  ];

  function mkA(h,s,b){ return {hue:h,saturation:s,brightness:b}; }
  function mkSec(secs,h,s,b){ return Object.fromEntries(secs.map(k=>[k,mkA(h,s,b)])); }

  const st = {
    name:'Без имени', tribe:TRIBES[0], role:'Воитель',
    activeTab:'body', build:'lean', age:0, size:0.5,
    tribeOpen:false, editingName:false,
    app:{
      body:     mkA(30,20,45),
      markings: mkSec(MARKINGS_SEC,15,30,30),
      fur_body: mkSec(FUR_BODY_SEC,20,15,55),
      fur_head: mkSec(FUR_HEAD_SEC,20,15,55),
      eyes:     mkSec(EYES_SEC,40,65,55),
    }
  };

  // Цветовые утилиты
  // catHue: нелинейный маппинг — тёплые тона + голубой/синий:
  //   0..70  → 0..60°   (рыжий, оранжевый, жёлтый, коричневый)
  //   70..100 → 180..240° (голубой, синий)
  // Зелёный, фиолетовый, розовый исключены.
  function catHue(v){
    if(v <= 70) return Math.round((v / 70) * 60);
    return Math.round(180 + ((v - 70) / 30) * 60);
  }
  function catSat(v){ return Math.round((v / 100) * 100); }
  function eyeHue(v){ return Math.round((v/100)*360); }
  function eyeSat(v){ return Math.round((v/100)*100); }
  function catHueGrad(){
    const stops = [];
    for(let i=0;i<=10;i++) stops.push('hsl('+catHue(i*10)+',60%,45%) '+i*10+'%');
    return 'linear-gradient(to right,'+stops.join(',')+')';
  }
  function catSatGrad(hv){ const h=catHue(hv); return 'linear-gradient(to right,hsl('+h+',0%,55%),hsl('+h+',50%,45%),hsl('+h+',100%,40%))'; }
  function brightGrad(hv,sv,eye){ const h=eye?eyeHue(hv):catHue(hv),s=eye?eyeSat(sv):catSat(sv); return 'linear-gradient(to right,hsl('+h+','+s+'%,15%),hsl('+h+','+s+'%,55%),hsl('+h+','+s+'%,95%))'; }
  function eyeHueGrad(){
    // Полный спектр: плавная радуга по всему кругу (0..360°), насыщенные цвета.
    const stops = [];
    for(let i=0;i<=24;i++){
      const h = Math.round((i/24)*360);
      const pct = Math.round((i/24)*100);
      stops.push('hsl('+h+',100%,50%) '+pct+'%');
    }
    return 'linear-gradient(to right,'+stops.join(',')+')';
  }
  function eyeSatGrad(hv){ const h=eyeHue(hv); return 'linear-gradient(to right,hsl('+h+',0%,50%),hsl('+h+',90%,50%))'; }

  function getLockedSize(age){ const a=Number(age); if(a<=6) return 0.3; if(a<=9) return 0.4; if(a<=13) return 0.5; return null; }

  const PREVIEW_SCALE = 0.7;
  let previewHostEl = null;
  let previewApp = null;
  let previewBodySpine = null;
  let previewEyesSpine = null;
  let _lastPreviewBuild = null;

  function ensurePreviewHost(){
    if (previewHostEl) return previewHostEl;

    previewHostEl = document.createElement('div');
    previewHostEl.id = 'ce-preview-host';
    previewHostEl.style.cssText = 'width:170px;height:200px;display:flex;align-items:flex-end;justify-content:center;overflow:hidden;';

    try {
      previewApp = new PIXI.Application({ width:170, height:200, backgroundAlpha:0, antialias:true });
      const view = previewApp.view;
      view.style.cssText = 'width:170px;height:200px;display:block;';
      previewHostEl.appendChild(view);

      (async () => {
        const resource = await PIXI.Assets.load('/assets/spine/Catt.json');
        const { Spine } = await import('pixi-spine');

        const bodySpine = new Spine(resource.spineData);
        const eyesSpine = new Spine(resource.spineData);

        // Статичный персонаж: НЕ запускаем анимацию (остаётся в позе настройки).
        // autoUpdate оставляем включённым, чтобы pixi-меши перестраивались после
        // смены телосложения/цвета; без анимации персонаж при этом неподвижен.

        // Сначала поза настройки, ПОТОМ скрываем слоты (setToSetupPose иначе
        // вернул бы скрытым слотам их attachment'ы обратно).
        bodySpine.skeleton.setToSetupPose();
        eyesSpine.skeleton.setToSetupPose();

        // Нижний слой: прячем позы (Sit/sleep) и СЛОТ ГЛАЗ (глаза рисует верхний слой)
        ['Sit','sleep','eyes'].forEach(n => {
          const s = bodySpine.skeleton.findSlot(n);
          if (s) s.setAttachment(null);
        });
        // Верхний слой: оставляем ТОЛЬКО глаза
        eyesSpine.skeleton.slots.forEach(sl => {
          if (sl.data.name !== 'eyes') sl.setAttachment(null);
        });

        bodySpine.scale.set(PREVIEW_SCALE);
        eyesSpine.scale.set(PREVIEW_SCALE);

        bodySpine.skeleton.updateWorldTransform();
        eyesSpine.skeleton.updateWorldTransform();

        previewApp.stage.addChild(bodySpine);
        previewApp.stage.addChild(eyesSpine); // глаза поверх тела

        previewBodySpine = bodySpine;
        previewEyesSpine = eyesSpine;
        _lastPreviewBuild = null;

        updatePreview();        // применит телосложение + цвета
        layoutPreview();        // подгонит размер канваса и отцентрует
      })().catch(err => {
        console.warn('Не удалось создать живое превью персонажа:', err);
        previewHostEl.innerHTML = '';
        const img = document.createElement('img');
        img.src = buildImg(st.build);
        img.style.cssText = 'height:192px;width:auto;object-fit:contain;image-rendering:pixelated;';
        img.style.filter = bodyToFilter(st.app.body);
        img.onerror = function(){ this.style.display='none'; };
        previewHostEl.appendChild(img);
      });
    } catch (err) {
      console.warn('PIXI-превью недоступно, используем картинку:', err);
      const img = document.createElement('img');
      img.id = 'ce-build-preview';
      img.src = buildImg(st.build);
      img.style.cssText = 'height:192px;width:auto;object-fit:contain;image-rendering:pixelated;';
      img.style.filter = bodyToFilter(st.app.body);
      img.onerror = function(){ this.style.display='none'; };
      previewHostEl.appendChild(img);
    }

    return previewHostEl;
  }

  // Подгоняет размер канваса под персонажа (масштаб 0.7) и ставит его по центру/низу.
  function layoutPreview(){
    if (!previewApp || !previewBodySpine) return;
    try {
      previewBodySpine.position.set(0, 0);
      previewEyesSpine.position.set(0, 0);
      previewBodySpine.skeleton.updateWorldTransform();
      const gb = previewBodySpine.getLocalBounds();
      const W = Math.max(120, Math.ceil(gb.width * PREVIEW_SCALE) + 24);
      const H = Math.max(150, Math.ceil(gb.height * PREVIEW_SCALE) + 16);
      previewApp.renderer.resize(W, H);
      const view = previewApp.view;
      view.style.width = W + 'px'; view.style.height = H + 'px';
      previewHostEl.style.width = W + 'px'; previewHostEl.style.height = H + 'px';
      // Низ по центру: сдвигаем так, чтобы нижний-левый угол bounds лёг в канвас
      const offX = (-gb.x * PREVIEW_SCALE) + (W - gb.width * PREVIEW_SCALE) / 2;
      const offY = (-gb.y * PREVIEW_SCALE) + (H - gb.height * PREVIEW_SCALE) - 8;
      previewBodySpine.position.set(offX, offY);
      previewEyesSpine.position.set(offX, offY);
    } catch (e) { /* размеры по умолчанию */ }
  }

  // Обновить превью под текущее состояние редактора (st).
  function updatePreview(){
    if (previewBodySpine) {
      if (st.build !== _lastPreviewBuild) {
        applyCharacterBuild(previewBodySpine, st.build);
        _lastPreviewBuild = st.build;
        layoutPreview(); // разные телосложения — разная ширина, перецентровка
      }
      // Основной цвет тела (фильтр на нижнем слое; глаза там скрыты)
      applyCharacterColors(previewBodySpine, st.app);
      // Цвет глаз — на верхнем слое, поверх цвета тела
      const eyeSec = st.app.eyes && Object.values(st.app.eyes)[0];
      applyEyeColor(previewEyesSpine, eyeSec);
      previewEyesSpine.skeleton.updateWorldTransform();
    } else {
      const img = previewHostEl && previewHostEl.querySelector('img');
      if (img) { img.src = buildImg(st.build); img.style.filter = bodyToFilter(st.app.body); }
    }
  }

  function destroyPreview(){
    try { if (previewApp) previewApp.destroy(true, { children:true }); } catch(e){}
    previewApp = null; previewBodySpine = null; previewEyesSpine = null; previewHostEl = null;
  }

  // Создаём оверлей один раз — потом только обновляем innerHTML внутренних секций
  const overlay = document.createElement('div');
  overlay.id = 'char-editor-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(10,18,10,0.97);z-index:300;display:flex;flex-direction:column;font-family:Arial,sans-serif;';

  injectGameStyles();

  const box = document.createElement('div');
  box.style.cssText = 'background:transparent;color:#e8d8b0;width:100%;height:100%;overflow:hidden;display:flex;flex-direction:column;';
  overlay.appendChild(box);

  // --- Верхняя панель ---
  const topPanel = document.createElement('div');
  topPanel.style.cssText = 'background:url(/assets/menu/klick.png) center/cover no-repeat;padding:14px 32px;display:flex;gap:20px;align-items:center;position:relative;flex-shrink:0;height:220px;box-sizing:border-box;overflow:hidden;';
  box.appendChild(topPanel);

  // --- Строка вкладок ---
  const tabBar = document.createElement('div');
  tabBar.style.cssText = 'display:flex;gap:2px;padding:10px 32px 0;background:rgba(10,18,10,0.98);flex-shrink:0;';
  box.appendChild(tabBar);

  // --- Область (две колонки: левая пустая, правая с ползунками) ---
  const slidersArea = document.createElement('div');
  slidersArea.style.cssText = 'background:rgba(12,22,12,0.98);border-top:1px solid #8B5A2B;display:flex;flex:1;min-height:0;overflow:hidden;';
  box.appendChild(slidersArea);

  // Левая колонка — пустая, для будущего наполнения
  const leftCol = document.createElement('div');
  leftCol.style.cssText = 'flex:1;border-right:1px solid rgba(139,90,43,0.3);min-height:0;';
  slidersArea.appendChild(leftCol);

  // Правая колонка — ползунки
  const rightCol = document.createElement('div');
  rightCol.style.cssText = 'width:300px;flex-shrink:0;padding:14px 18px;overflow-y:auto;scrollbar-width:thin;';
  slidersArea.appendChild(rightCol);

  // --- Кнопки без панели — абсолютно позиционированы в правом нижнем углу ---
  const footer = document.createElement('div');
  footer.style.cssText = 'position:absolute;bottom:16px;right:32px;display:flex;gap:10px;z-index:10;';
  footer.innerHTML = '<button id="ce-cancel" style="background:rgba(30,20,10,0.85);border:2px solid #8B5A2B;color:#c9bda0;border-radius:8px;padding:9px 20px;font-size:14px;cursor:pointer;">Отмена</button>'
    + '<button id="ce-save" style="background:rgba(58,47,30,0.85);border:2px solid #8B5A2B;color:#ffcc80;border-radius:8px;padding:9px 22px;font-size:14px;cursor:pointer;">Сохранить персонажа</button>';
  overlay.appendChild(footer);

  // ---- Функции рендера отдельных секций ----

  function renderTop(){
    const locked = getLockedSize(st.age);
    const effSize = locked !== null ? locked : st.size;
    const imgPct = Math.round((effSize/0.5)*80);

    topPanel.innerHTML = '';

    // Иконка роли — увеличена
    const roleIcon = document.createElement('div');
    roleIcon.style.cssText = 'width:160px;height:160px;border-radius:50%;overflow:hidden;border:3px solid #8B5A2B;flex-shrink:0;background:rgba(10,20,10,0.8);display:flex;align-items:center;justify-content:center;font-size:40px;';
    const roleImg = document.createElement('img');
    roleImg.src = '/assets/war.png';
    roleImg.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    roleImg.onerror = function(){ this.style.display='none'; roleIcon.textContent='🐱'; };
    roleIcon.appendChild(roleImg);
    topPanel.appendChild(roleIcon);

    // Центральная колонка
    const center = document.createElement('div');
    center.style.cssText = 'flex:1;min-width:0;position:relative;';
    topPanel.appendChild(center);

    // Племя — крупный текст
    const tribeBtn = document.createElement('div');
    tribeBtn.id = 'ce-tribe-trigger';
    tribeBtn.style.cssText = 'font-size:26px;font-weight:bold;color:#8fd14f;cursor:pointer;display:block;user-select:none;line-height:1.2;';
    tribeBtn.textContent = 'Племя ' + st.tribe.name + ' ▼';
    center.appendChild(tribeBtn);

    // Попап племён
    if(st.tribeOpen){
      const popup = document.createElement('div');
      popup.id = 'ce-tribe-popup';
      popup.style.cssText = 'position:absolute;z-index:999;top:44px;left:0;background:rgba(10,20,10,0.98);border:2px solid #8B5A2B;border-radius:12px;padding:12px;display:flex;gap:10px;flex-wrap:wrap;max-width:340px;box-shadow:0 8px 24px rgba(0,0,0,0.8);';
      TRIBES.forEach(t => {
        const btn = document.createElement('div');
        btn.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;';
        btn.dataset.tribe = t.id;
        const circle = document.createElement('div');
        circle.style.cssText = 'width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;text-align:center;padding:4px;box-sizing:border-box;color:#fff;line-height:1.2;pointer-events:none;'
          + 'border:2px solid ' + (st.tribe.id===t.id?'#ffcc80':'rgba(255,204,128,0.3)') + ';'
          + 'background:' + t.color + 'cc;';
        circle.textContent = t.name;
        btn.appendChild(circle);
        popup.appendChild(btn);
      });
      center.appendChild(popup);
    }

    // Имя — строкой ниже племени
    if(st.editingName){
      const inp = document.createElement('input');
      inp.id = 'ce-name-input';
      inp.value = st.name;
      inp.style.cssText = 'background:rgba(20,35,20,0.9);border:2px solid #ffcc80;border-radius:8px;color:#ffcc80;font-size:22px;font-weight:bold;padding:4px 14px;outline:none;width:100%;box-sizing:border-box;margin-top:8px;display:block;';
      center.appendChild(inp);
      setTimeout(()=>{ inp.focus(); inp.select(); }, 0);
    } else {
      const nameDiv = document.createElement('div');
      nameDiv.id = 'ce-name-display';
      nameDiv.style.cssText = 'font-size:22px;font-weight:bold;color:#ffcc80;cursor:text;margin-top:8px;line-height:1.2;border-bottom:1px dashed rgba(139,90,43,0.5);display:inline-block;padding-bottom:2px;';
      nameDiv.textContent = st.name;
      center.appendChild(nameDiv);
    }

    // Должность + возраст
    const metaRow = document.createElement('div');
    metaRow.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;align-items:center;';

    const roleWrap = document.createElement('div');
    roleWrap.style.cssText = 'font-size:13px;color:#e8d8b0;';
    roleWrap.innerHTML = 'Должность:&nbsp;';
    const roleSelect = document.createElement('select');
    roleSelect.id = 'ce-role';
    roleSelect.style.cssText = 'background:rgba(20,35,20,0.9);border:1px solid #8B5A2B;color:#e8d8b0;border-radius:6px;padding:3px 7px;font-size:13px;outline:none;';
    ROLES.forEach(r => { const o=document.createElement('option'); o.value=r; o.textContent=r; if(r===st.role) o.selected=true; roleSelect.appendChild(o); });
    roleWrap.appendChild(roleSelect);
    metaRow.appendChild(roleWrap);

    const ageWrap = document.createElement('div');
    ageWrap.style.cssText = 'font-size:13px;color:#e8d8b0;display:flex;align-items:center;gap:6px;';
    ageWrap.innerHTML = 'Возраст:&nbsp;';
    const ageInp = document.createElement('input');
    ageInp.id = 'ce-age';
    ageInp.type = 'text';
    ageInp.inputMode = 'numeric';
    ageInp.pattern = '[0-9]*';
    ageInp.value = st.age;
    ageInp.style.cssText = 'background:rgba(20,35,20,0.9);border:1px solid #8B5A2B;border-radius:6px;color:#ffcc80;font-size:13px;font-weight:bold;padding:3px 8px;outline:none;width:52px;text-align:center;-moz-appearance:textfield;';
    ageWrap.appendChild(ageInp);
    const lunSpan = document.createElement('span');
    lunSpan.style.cssText = 'color:#8B5A2B;font-size:12px;';
    lunSpan.textContent = 'лун';
    ageWrap.appendChild(lunSpan);
    if(locked !== null){
      const lockSpan = document.createElement('span');
      lockSpan.style.cssText = 'font-size:10px;color:#ff8888;';
      lockSpan.textContent = '🔒 ' + locked.toFixed(2);
      ageWrap.appendChild(lockSpan);
    }
    metaRow.appendChild(ageWrap);
    center.appendChild(metaRow);

    // Рост — чёрный ползунок, в 2 раза крупнее предыдущего
    const sizeRow = document.createElement('div');
    sizeRow.style.cssText = 'margin-top:10px;display:flex;align-items:center;gap:8px;';
    const sizeLbl = document.createElement('span');
    sizeLbl.style.cssText = 'font-size:12px;color:#c9bda0;white-space:nowrap;';
    sizeLbl.textContent = 'Рост';
    const sizeSlider = document.createElement('input');
    sizeSlider.id = 'ce-size'; sizeSlider.type = 'range';
    sizeSlider.min = 0.3; sizeSlider.max = 0.7; sizeSlider.step = 0.01; sizeSlider.value = effSize;
    sizeSlider.disabled = locked !== null;
    sizeSlider.style.cssText = 'width:120px;height:6px;border-radius:3px;-webkit-appearance:none;outline:none;background:#111;border:1px solid #333;cursor:' + (locked!==null?'not-allowed':'pointer') + ';opacity:' + (locked!==null?0.4:1) + ';flex-shrink:0;';
    const sizeVal = document.createElement('span');
    sizeVal.style.cssText = 'font-size:11px;color:#ffcc80;min-width:28px;';
    sizeVal.textContent = effSize.toFixed(2);
    sizeRow.appendChild(sizeLbl); sizeRow.appendChild(sizeSlider); sizeRow.appendChild(sizeVal);
    center.appendChild(sizeRow);

    // Превью — живой Spine-персонаж (телосложение + цвет тела + цвет глаз)
    const previewWrap = document.createElement('div');
    previewWrap.style.cssText = 'flex-shrink:0;position:relative;display:flex;align-items:flex-end;margin-left:16px;height:192px;';
    previewWrap.appendChild(ensurePreviewHost());
    topPanel.appendChild(previewWrap);
    updatePreview();

    // Кнопка закрыть
    const closeBtn = document.createElement('button');
    closeBtn.id = 'ce-close-x';
    closeBtn.style.cssText = 'position:absolute;top:10px;right:12px;background:none;border:none;color:#ffaaaa;font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px;';
    closeBtn.textContent = '✕';
    topPanel.appendChild(closeBtn);

    // Навешиваем события на элементы верхней панели
    tribeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      st.tribeOpen = !st.tribeOpen;
      renderTop();
    });
    if(st.tribeOpen){
      const popup = document.getElementById('ce-tribe-popup');
      if (popup) {
        popup.querySelectorAll('[data-tribe]').forEach(el => {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            st.tribe = TRIBES.find(t => t.id === el.dataset.tribe);
            st.tribeOpen = false;
            renderTop();
          });
        });
      }

      // Закрыть попап кликом вне — через mousedown на document (один раз)
      const closeTribeHandler = (e) => {
        const p = document.getElementById('ce-tribe-popup');
        const trigger = document.getElementById('ce-tribe-trigger');
        if (p && !p.contains(e.target) && !trigger.contains(e.target)) {
          st.tribeOpen = false;
          renderTop();
          document.removeEventListener('mousedown', closeTribeHandler);
        }
      };
      // Добавляем с небольшой задержкой чтобы текущий клик не закрыл сразу
      setTimeout(() => document.addEventListener('mousedown', closeTribeHandler), 0);
    }
    const nameDisplay = center.querySelector('#ce-name-display');
    const nameInput   = center.querySelector('#ce-name-input');
    if(nameDisplay) nameDisplay.addEventListener('click', () => { st.editingName=true; renderTop(); });
    if(nameInput){
      nameInput.addEventListener('input',   (e) => { st.name = e.target.value; });
      nameInput.addEventListener('blur',    () => { if(!st.name.trim()) st.name='Без имени'; st.editingName=false; renderTop(); });
      nameInput.addEventListener('keydown', (e) => {
        e.stopPropagation(); // не пропускаем WASD/пробел в input.js
        if(e.key==='Enter'||e.key==='Escape'){ if(!st.name.trim()) st.name='Без имени'; st.editingName=false; renderTop(); }
      });
    }
    roleSelect.addEventListener('change', (e) => { st.role=e.target.value; });
    ageInp.addEventListener('input', (e) => { st.age=Number(e.target.value); renderTop(); });
    sizeSlider.addEventListener('input', (e) => { st.size=Number(e.target.value); sizeVal.textContent=Number(e.target.value).toFixed(2); renderTopPreviewSize(); });
    closeBtn.addEventListener('click', () => { destroyPreview(); overlay.remove(); });
  }

  function renderTopPreviewSize(){ /* превью теперь фиксированное — три иконки */ }

  function renderTabs(){
    tabBar.innerHTML = '';
    TABS.forEach(t => {
      const tab = document.createElement('div');
      const active = st.activeTab === t.id;
      tab.style.cssText = 'background:' + (active?'rgba(139,90,43,0.5)':'rgba(30,45,30,0.6)') + ';border:1px solid ' + (active?'#8B5A2B':'rgba(139,90,43,0.4)') + ';border-bottom:none;border-radius:8px 8px 0 0;color:' + (active?'#ffcc80':'#c9bda0') + ';cursor:pointer;font-size:10.5px;padding:6px 6px;flex:1;text-align:center;line-height:1.3;font-weight:' + (active?'bold':'normal') + ';user-select:none;';
      tab.textContent = t.label;
      tab.addEventListener('click', () => { st.activeTab = t.id; renderTabs(); renderSliders(); });
      tabBar.appendChild(tab);
    });
  }

  function renderSliders(){
    rightCol.innerHTML = '';
    const tab = st.activeTab;
    const isEye = tab === 'eyes';

    if(tab === 'body'){
      renderBodySliders();
    } else {
      const secMap = {markings:MARKINGS_SEC, fur_body:FUR_BODY_SEC, fur_head:FUR_HEAD_SEC, eyes:EYES_SEC};
      const secs = secMap[tab];
      secs.forEach(sec => {
        const title = document.createElement('div');
        title.style.cssText = 'font-size:10px;font-weight:bold;color:#8fd14f;text-transform:uppercase;letter-spacing:0.5px;margin:10px 0 6px;padding-bottom:3px;border-bottom:1px solid rgba(143,209,79,0.25);';
        title.textContent = sec;
        rightCol.appendChild(title);
        buildSliderElements(rightCol, sec, st.app[tab][sec], isEye, tab);
      });
    }
  }

  function renderBodySliders(){
    rightCol.innerHTML = '';

    const buildTitle = document.createElement('div');
    buildTitle.style.cssText = 'font-size:10px;font-weight:bold;color:#8fd14f;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;padding-bottom:3px;border-bottom:1px solid rgba(143,209,79,0.25);';
    buildTitle.textContent = 'Телосложение';
    rightCol.appendChild(buildTitle);

    const buildRow = document.createElement('div');
    buildRow.style.cssText = 'display:flex;gap:6px;margin-bottom:14px;';

    function refreshBuildBtns(){
      buildRow.innerHTML = '';
      [['lean','Lean'],['large','Massive'],['fat','Fat']].forEach(([id,lbl]) => {
        const btn = document.createElement('div');
        const active = st.build === id;
        btn.style.cssText = 'flex:1;padding:5px 4px;text-align:center;cursor:pointer;border-radius:6px;font-size:11px;user-select:none;'
          + 'background:' + (active?'rgba(139,90,43,0.55)':'rgba(30,45,30,0.7)') + ';'
          + 'border:1px solid ' + (active?'#8B5A2B':'rgba(139,90,43,0.4)') + ';'
          + 'color:' + (active?'#ffcc80':'#c9bda0') + ';'
          + 'font-weight:' + (active?'bold':'normal') + ';';
        btn.textContent = lbl;
        btn.addEventListener('click', () => {
          st.build = id;
          refreshBuildBtns();
          updatePreview();
        });
        buildRow.appendChild(btn);
      });
    }
    refreshBuildBtns();
    rightCol.appendChild(buildRow);

    const colorTitle = document.createElement('div');
    colorTitle.style.cssText = 'font-size:10px;font-weight:bold;color:#8fd14f;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;padding-bottom:3px;border-bottom:1px solid rgba(143,209,79,0.25);';
    colorTitle.textContent = 'Основной цвет';
    rightCol.appendChild(colorTitle);

    buildSliderElements(rightCol, '__body__', st.app.body, false, 'body');

    // Применяем цвет к превью сразу при открытии вкладки
    requestAnimationFrame(() => { updatePreview(); });
  }

  function buildSliderElements(container, secKey, appData, isEye, tab){
    const configs = [
      {key:'hue',         label:'Цвет шерсти/глаз',      min:0,  max:100},
      {key:'saturation',  label:'Интенсивность',  min:0,  max:100},
      {key:'brightness',  label:'Яркость',       min:20, max:100},
    ];
    configs.forEach(cfg => {
      const wrap = document.createElement('div');
      wrap.style.marginBottom = '8px';

      const labelRow = document.createElement('div');
      labelRow.style.cssText = 'font-size:11px;color:#c9bda0;margin-bottom:3px;display:flex;justify-content:space-between;';
      const labelText = document.createElement('span');
      labelText.textContent = cfg.label;
      const valSpan = document.createElement('span');
      valSpan.style.cssText = 'color:#ffcc80;font-weight:bold;';
      valSpan.textContent = appData[cfg.key];
      labelRow.appendChild(labelText);
      labelRow.appendChild(valSpan);
      wrap.appendChild(labelRow);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = cfg.min; slider.max = cfg.max; slider.step = 1;
      slider.value = appData[cfg.key];
      slider.style.cssText = 'width:100%;height:4px;border-radius:2px;cursor:pointer;-webkit-appearance:none;outline:none;border:1px solid rgba(139,90,43,0.5);';
      slider.style.background = getSliderBg(cfg.key, appData, isEye);

      slider.addEventListener('input', () => {
        const val = Number(slider.value);
        appData[cfg.key] = val;
        valSpan.textContent = val;
        container.querySelectorAll('input[type=range]').forEach(s => {
          s._refreshBg && s._refreshBg();
        });
        // Живое обновление превью: основной цвет тела и/или цвет глаз
        if (tab === 'body' || tab === 'eyes') {
          updatePreview();
        }
      });
      slider._refreshBg = () => { slider.style.background = getSliderBg(cfg.key, appData, isEye); };

      wrap.appendChild(slider);
      container.appendChild(wrap);
    });
  }

  function getSliderBg(key, a, isEye){
    if(key==='hue')        return isEye ? eyeHueGrad() : catHueGrad();
    if(key==='saturation') return isEye ? eyeSatGrad(a.hue) : catSatGrad(a.hue);
    if(key==='brightness') return brightGrad(a.hue, a.saturation, isEye);
    return 'rgba(139,90,43,0.35)';
  }

  // Кнопки футера
  footer.querySelector('#ce-cancel').addEventListener('click', () => { destroyPreview(); editorStyle.remove(); overlay.remove(); });
  footer.querySelector('#ce-save').addEventListener('click', () => {
    const saved = saveCharacter(st);
    setActiveCharacter(saved);
    // Обновляем профиль персонажа
    import('./character-profile.js').then(({ setProfileField }) => {
      setProfileField('name', st.name);
      setProfileField('tribe', st.tribe.name);
      setProfileField('role', st.role);
    }).catch(() => {});
    // Показываем подтверждение
    const confirmBanner = document.createElement('div');
    confirmBanner.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(58,47,30,0.97);border:2px solid #8B5A2B;color:#ffcc80;padding:12px 28px;border-radius:10px;font-size:15px;z-index:9999;pointer-events:none;';
    confirmBanner.textContent = 'Котик «' + st.name + '» сохранён и готов к игре!';
    document.body.appendChild(confirmBanner);
    setTimeout(() => confirmBanner.remove(), 2500);
    destroyPreview(); editorStyle.remove(); overlay.remove();
  });

  // Первичный рендер
  renderTop();
  renderTabs();
  renderSliders();

  document.body.appendChild(overlay);
}

// ─── Экран выбора / загрузки персонажа ────────────────────────────────────────
function showCharacterSelectScreen() {
  if (document.getElementById('char-select-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'char-select-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(10,18,10,0.97);z-index:300;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;font-family:Arial,sans-serif;overflow-y:auto;';

  const BUILD_LABELS = { lean: 'Lean', large: 'Massive', fat: 'Fat' };
  const active = getActiveCharacter();

  function render() {
    overlay.innerHTML = '';

    // Заголовок
    const header = document.createElement('div');
    header.style.cssText = 'width:100%;max-width:860px;padding:28px 32px 0;box-sizing:border-box;display:flex;align-items:center;gap:16px;';
    header.innerHTML = `
      <div style="flex:1;">
        <h2 style="color:#ffcc80;margin:0 0 4px;font-size:26px;">Выбрать котика</h2>
        <div style="color:#c9bda0;font-size:13px;">Выберите котика или создайте нового</div>
      </div>
      <button id="cs-close" style="background:none;border:2px solid #8B5A2B;color:#ffcc80;border-radius:8px;padding:8px 18px;font-size:14px;cursor:pointer;">✕ Закрыть</button>
    `;
    overlay.appendChild(header);

    // Текущий активный персонаж
    const currentActive = getActiveCharacter();
    if (currentActive) {
      const activeBanner = document.createElement('div');
      activeBanner.style.cssText = 'width:100%;max-width:860px;padding:12px 32px;box-sizing:border-box;';
      activeBanner.innerHTML = `<div style="background:rgba(143,209,79,0.13);border:1px solid rgba(143,209,79,0.4);border-radius:8px;padding:10px 16px;color:#8fd14f;font-size:13px;">
        Сейчас в игре котик: <b>${currentActive.name}</b> · ${currentActive.tribe?.name ?? '—'} · ${BUILD_LABELS[currentActive.build] ?? currentActive.build}
      </div>`;
      overlay.appendChild(activeBanner);
    }

    // Список персонажей
    const chars = loadCharacters();
    const listWrap = document.createElement('div');
    listWrap.style.cssText = 'width:100%;max-width:750px;padding:16px 32px;box-sizing:border-box;display:flex;flex-direction:column;gap:30px;';

    if (chars.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#c9bda0;font-size:15px;text-align:center;padding:40px 0;';
      empty.textContent = 'Нет сохранённых котиков. Заведём нового?';
      listWrap.appendChild(empty);
    } else {
      chars.forEach(char => {
        const isActive = currentActive && currentActive.id === char.id;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:40px;background:' + (isActive ? 'rgba(143,209,79,0.13)' : 'rgba(40,55,40,0.7)') + ';'
          + 'border:1px solid ' + (isActive ? 'rgba(143,209,79,0.5)' : 'rgba(139,90,43,0.4)') + ';'
          + 'border-radius:10px;padding:20px 16px;transition:background 0.15s;';

        // Превью телосложения с окраской тела
        
        const imgWrap = document.createElement('div');
        imgWrap.style.cssText = 'width:120px;height:30px;flex-shrink:0;display:flex;align-items:center;justify-content:center;';
        const img = document.createElement('img');
        img.src = buildImg(char.build);
        img.style.cssText = 'height:80px;width:auto;image-rendering:pixelated;';
        if (char.app && char.app.body) img.style.filter = bodyToFilter(char.app.body);
        img.onerror = () => { img.style.display = 'none'; };
        imgWrap.appendChild(img);
        row.appendChild(imgWrap);

        // Информация
        const info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0;';
        const savedDate = new Date(char.savedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        info.innerHTML = `
          <div style="font-size:16px;font-weight:bold;color:#ffcc80;margin-bottom:2px;">${char.name}</div>
          <div style="font-size:13px;color:#c9bda0;">
            ${char.tribe?.name ?? '—'} · ${char.role ?? '—'} · ${BUILD_LABELS[char.build] ?? char.build} · ${char.age ?? 0} лун
          </div>
          <div style="font-size:11px;color:#8B5A2B;margin-top:2px;">Создан: ${savedDate}</div>
        `;
        row.appendChild(info);

        // Кнопка "Выбрать"
        const selectBtn = document.createElement('button');
        selectBtn.textContent = isActive ? 'В игре' : 'Этот котик';
        selectBtn.style.cssText = 'padding:7px 16px;border-radius:7px;font-size:13px;cursor:pointer;flex-shrink:0;'
          + 'background:' + (isActive ? 'rgba(143,209,79,0.2)' : 'rgba(58,47,30,0.85)') + ';'
          + 'border:1px solid ' + (isActive ? 'rgba(143,209,79,0.6)' : '#8B5A2B') + ';'
          + 'color:' + (isActive ? '#8fd14f' : '#ffcc80') + ';';
        selectBtn.addEventListener('click', () => {
          setActiveCharacter(char);
          // Обновляем профиль
          import('./character-profile.js').then(({ setProfileField }) => {
            setProfileField('name', char.name);
            setProfileField('tribe', char.tribe?.name ?? '—');
            setProfileField('role', char.role ?? '—');
          }).catch(() => {});
          render(); // перерисовываем
          // Баннер
          const banner = document.createElement('div');
          banner.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(58,47,30,0.97);border:2px solid #8B5A2B;color:#ffcc80;padding:12px 28px;border-radius:10px;font-size:15px;z-index:9999;pointer-events:none;';
          banner.textContent = 'Котик «' + char.name + '» выбран и готов к игре!';
          document.body.appendChild(banner);
          setTimeout(() => banner.remove(), 2000);
        });
        row.appendChild(selectBtn);

        // Кнопка удаления
        const delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.title = 'Удалить котика';
        delBtn.style.cssText = 'padding:7px 10px;border-radius:7px;font-size:13px;cursor:pointer;flex-shrink:0;background:rgba(100,0,0,0.5);border:1px solid rgba(180,0,0,0.5);color:#ffaaaa;';
        delBtn.addEventListener('click', () => {
          if (!confirm('Удалить котика ' + char.name + '?')) return;
          deleteCharacter(char.id);
          // Если удалили активного — сбрасываем
          const act = getActiveCharacter();
          if (act && act.id === char.id) {
            const remaining = loadCharacters().filter(c => c.id !== char.id);
            setActiveCharacter(remaining.length > 0 ? remaining[remaining.length - 1] : null);
          }
          render();
        });
        row.appendChild(delBtn);

        listWrap.appendChild(row);
      });
    }

    overlay.appendChild(listWrap);

    // Кнопка создать нового
    const createBtn = document.createElement('button');
    createBtn.textContent = '+ Создать нового котика';
    createBtn.style.cssText = 'margin:8px auto 32px;display:block;padding:12px 32px;font-size:15px;background:rgba(58,47,30,0.85);border:2px solid #8B5A2B;color:#ffcc80;border-radius:8px;cursor:pointer;';
    createBtn.addEventListener('click', () => {
      overlay.remove();
      showCharacterEditor();
    });
    overlay.appendChild(createBtn);

    // Навешиваем кнопку закрыть
    const closeBtn = overlay.querySelector('#cs-close');
    if (closeBtn) closeBtn.addEventListener('click', () => overlay.remove());
  }

  render();
  document.body.appendChild(overlay);
}

// ===== Оформление нового главного меню (картинки из /assets/menu) =====
function injectMenuSkin() {
  if (document.getElementById('wc-menu-style')) return;
  const st = document.createElement('style');
  st.id = 'wc-menu-style';
  st.textContent = `
  #game-menu.wc-menu {
    position:absolute; inset:0; width:100%; height:100%; z-index:100; overflow:hidden;
    background:url('/assets/menu/menu1.png') center/cover no-repeat;
    font-family:'Ink Free','Segoe Print',cursive;
  }
  .wc-title-img { position:absolute; top:3vh; height:17vh; width:auto; pointer-events:none; }
  .wc-title-left  { left:2.5vw; width:32vw; object-fit:contain; object-position:center; }
  .wc-title-right { left:81.5vw; right:auto; transform:translateX(-50%); }

  .wc-panel {
    position:absolute; top:24vh; width:32vw; height:62vh; box-sizing:border-box;
    background:url('/assets/menu/table.png') center/100% 100% no-repeat;
    padding:5% 6%;
  }
  .wc-panel-left  { left:2.5vw; }
  .wc-panel-right { right:2.5vw; display:flex; flex-direction:column; }

  .wc-btns { height:100%; display:flex; flex-direction:column; justify-content:center; gap:7.5%; }
  .wc-btn {
    font-family:'Ink Free','Segoe Print',cursive; font-size:30px;
    color:#ffcc80; text-shadow:1px 1px 0 #3a2410;
    background:url('/assets/menu/knopka.png') center/100% 100% no-repeat;
    border:none; cursor:pointer; width:100%; min-height:84px; padding:12px;
    transition:transform .08s ease, filter .15s ease;
  }
  .wc-btn:hover  { filter:brightness(1.12); }
  .wc-btn:active { transform:scale(.97); }

  .wc-news-head { flex:0 0 auto; display:flex; justify-content:flex-end; margin-bottom:8px; }
  .wc-btn-small { width:auto; min-height:0; padding:6px 14px; }

  .wc-news-list { width: 400px; align-self: center; flex:1 1 auto; overflow-y:auto; display:flex; flex-direction:column; gap:8px; padding-right:4px; }
  .wc-news-card {
    font-family:'Ink Free','Segoe Print',cursive; font-size:15px;
    color:#ffcc80; text-shadow:1px 1px 0 #3a2410;
    background:url('/assets/menu/knopka.png') center/100% 100% no-repeat;
    border:none; cursor:pointer; padding:10px 10px; min-height:90px;
    box-sizing:border-box; text-align:center; line-height:1.25;
    transition:transform .08s ease, filter .15s ease;
  }
  .wc-news-card:hover  { filter:brightness(1.12); }
  .wc-news-card:active { transform:scale(.97); }
  .wc-news-title   { font-size:inherit; margin-bottom:2px; }
  .wc-news-snippet { font-size:inherit; opacity:.85; }
  .wc-news-date    { font-size:inherit; opacity:.6; margin-top:4px; }
  .wc-news-empty   { color:#e8dcb8; opacity:.7; text-align:center; padding:20px; font-family:Arial,sans-serif; }

  .wc-modal-overlay {
    position:absolute; inset:0; background:rgba(0,0,0,.6);
    display:flex; align-items:center; justify-content:center; z-index:120;
  }
  .wc-modal {
    background:url('/assets/menu/table.png') center/100% 100% no-repeat, rgba(25,33,18,.97);
    min-width:420px; max-width:600px; width:50vw; max-height:80vh; overflow-y:auto;
    box-sizing:border-box; padding:32px 40px; color:#f0e6c8; font-family:Arial, sans-serif;
  }
  .wc-modal h2 { color:#ffcc80; margin:0 0 12px; font-family:'Ink Free','Segoe Print',cursive; }
  .wc-modal .wc-news-date { text-align:left; font-size:12px; margin:0 0 14px; }
  .wc-modal p { line-height:1.6; white-space:pre-wrap; }
  .wc-modal input, .wc-modal textarea {
    width:100%; box-sizing:border-box; margin-bottom:12px; padding:10px;
    background:rgba(0,0,0,.3); border:1px solid rgba(255,204,128,.4);
    border-radius:6px; color:#fff; font-family:Arial, sans-serif; font-size:14px;
  }
  .wc-modal textarea { min-height:160px; resize:vertical; }
  .wc-modal-actions { display:flex; gap:10px; justify-content:flex-end; margin-top:8px; flex-wrap:wrap; }
  `;
  document.head.appendChild(st);
}

// ===== Система новостей (правая панель) =====
const NEWS_KEY = 'warrcats_news_v1';

function loadNews() {
  try { const r = localStorage.getItem(NEWS_KEY); if (r) return JSON.parse(r); } catch (e) {}
  const now = Date.now();
  return [
    {
      id: 'n' + now,
      title: 'Разработка',
      body: 'Рисую, попутно разрабатывая плюшки.',
      date: new Date().toISOString(),
    },
    {
      id: 'n' + (now + 1),
      title: 'Добро пожаловать в WarrCats!',
      body: 'Тепер у нас есть меню! Большая часть новостей ждёт вас во ВКонтакте, нои здесь вы всегда сможете узнать о событиях!',
      date: new Date().toISOString(),
    },
  ];
}
function saveNews() { try { localStorage.setItem(NEWS_KEY, JSON.stringify(newsList)); } catch (e) {} }
let newsList = loadNews();

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function renderNews() {
  const wrap = document.getElementById('news-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  newsList.forEach(n => {
    const card = document.createElement('div');
    card.className = 'wc-news-card';
    const d = new Date(n.date);
    const snippet = n.body.length > 90 ? n.body.slice(0, 90) + '…' : n.body;
    card.innerHTML = `
      <div class="wc-news-title">${escapeHtml(n.title)}</div>
      <div class="wc-news-snippet">${escapeHtml(snippet)}</div>`;
    card.onclick = () => openNewsDetail(n.id);
    wrap.appendChild(card);
  });
}

function closeNewsModal() {
  const ex = document.getElementById('wc-news-modal');
  if (ex) ex.remove();
}

function openNewsDetail(id) {
  const n = newsList.find(x => x.id === id);
  if (!n) return;
  closeNewsModal();
  const d = new Date(n.date);
  const overlay = document.createElement('div');
  overlay.className = 'wc-modal-overlay';
  overlay.id = 'wc-news-modal';
  overlay.innerHTML = `
    <div class="wc-modal">
      <h2>${escapeHtml(n.title)}</h2>
      <div class="wc-news-date">${isNaN(d.getTime()) ? '' : d.toLocaleString()}</div>
      <p>${escapeHtml(n.body)}</p>
      <div class="wc-modal-actions">
        <button class="wc-btn wc-btn-small" id="news-del">Удалить</button>
        <button class="wc-btn wc-btn-small" id="news-close">Закрыть</button>
      </div>
    </div>`;
  overlay.onclick = (e) => { if (e.target === overlay) closeNewsModal(); };
  menuContainer.appendChild(overlay);
  document.getElementById('news-close').onclick = closeNewsModal;
  document.getElementById('news-del').onclick = () => {
    if (confirm('Удалить новость?')) {
      newsList = newsList.filter(x => x.id !== id);
      saveNews(); closeNewsModal(); renderNews();
    }
  };
}

function openNewsEditor() { /* отключено: создание и редактирование новостей убрано */ }