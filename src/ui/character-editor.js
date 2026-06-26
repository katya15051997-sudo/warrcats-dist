// character-editor.js
// Редактор персонажа. Вынесен из menu.js (который мы удаляем) без изменений
// логики — переписана только сигнатура функции:
//   showCharacterEditor(initial = null, onSaved = null)
// landing.js уже передаёт onSaved-callback, но прежняя версия его игнорировала
// (функция была объявлена без параметров).
//
// initial — существующий персонаж для редактирования (можно null для нового).
//           Сейчас не используется в теле редактора (стартовое состояние всегда
//           дефолтное); параметр оставлен для будущей реализации "редактировать".
// onSaved — вызывается с сохранённым персонажем после успешного "Сохранить".

import * as PIXI from 'pixi.js';
import { createCharacter, setActiveCharacter } from '../character/character-save.js';
import { applyCharacterBuild, applyCharacterColors, applyEyeColor } from '../character/character.js';
import { buildImg, bodyToFilter } from '../character/character-preview.js';
import { injectGameStyles } from '../styles.js';

export function showCharacterEditor(initial = null, onSaved = null) {
  
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

        
        
        

        
        
        bodySpine.skeleton.setToSetupPose();
        eyesSpine.skeleton.setToSetupPose();

        
        ['Sit','sleep','eyes'].forEach(n => {
          const s = bodySpine.skeleton.findSlot(n);
          if (s) s.setAttachment(null);
        });
        
        eyesSpine.skeleton.slots.forEach(sl => {
          if (sl.data.name !== 'eyes') sl.setAttachment(null);
        });

        bodySpine.scale.set(PREVIEW_SCALE);
        eyesSpine.scale.set(PREVIEW_SCALE);

        bodySpine.skeleton.updateWorldTransform();
        eyesSpine.skeleton.updateWorldTransform();

        previewApp.stage.addChild(bodySpine);
        previewApp.stage.addChild(eyesSpine); 

        previewBodySpine = bodySpine;
        previewEyesSpine = eyesSpine;
        _lastPreviewBuild = null;

        updatePreview();        
        layoutPreview();        
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
      
      const offX = (-gb.x * PREVIEW_SCALE) + (W - gb.width * PREVIEW_SCALE) / 2;
      const offY = (-gb.y * PREVIEW_SCALE) + (H - gb.height * PREVIEW_SCALE) - 8;
      previewBodySpine.position.set(offX, offY);
      previewEyesSpine.position.set(offX, offY);
    } catch (e) {  }
  }

  
  function updatePreview(){
    if (previewBodySpine) {
      if (st.build !== _lastPreviewBuild) {
        applyCharacterBuild(previewBodySpine, st.build);
        _lastPreviewBuild = st.build;
        layoutPreview(); 
      }
      
      applyCharacterColors(previewBodySpine, st.app);
      
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

  
  const overlay = document.createElement('div');
  overlay.id = 'char-editor-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(10,18,10,0.97);z-index:300;display:flex;flex-direction:column;font-family:Arial,sans-serif;';

  injectGameStyles();

  const box = document.createElement('div');
  box.style.cssText = 'background:transparent;color:#e8d8b0;width:100%;height:100%;overflow:hidden;display:flex;flex-direction:column;';
  overlay.appendChild(box);

  
  const topPanel = document.createElement('div');
  topPanel.style.cssText = 'background:url(/assets/menu/klick.png) center/cover no-repeat;padding:14px 32px;display:flex;gap:20px;align-items:center;position:relative;flex-shrink:0;height:220px;box-sizing:border-box;overflow:hidden;';
  box.appendChild(topPanel);

  
  const tabBar = document.createElement('div');
  tabBar.style.cssText = 'display:flex;gap:2px;padding:10px 32px 0;background:rgba(10,18,10,0.98);flex-shrink:0;';
  box.appendChild(tabBar);

  
  const slidersArea = document.createElement('div');
  slidersArea.style.cssText = 'background:rgba(12,22,12,0.98);border-top:1px solid #8B5A2B;display:flex;flex:1;min-height:0;overflow:hidden;';
  box.appendChild(slidersArea);

  
  const leftCol = document.createElement('div');
  leftCol.style.cssText = 'flex:1;border-right:1px solid rgba(139,90,43,0.3);min-height:0;';
  slidersArea.appendChild(leftCol);

  
  const rightCol = document.createElement('div');
  rightCol.style.cssText = 'width:300px;flex-shrink:0;padding:14px 18px;overflow-y:auto;scrollbar-width:thin;';
  slidersArea.appendChild(rightCol);

  
  const footer = document.createElement('div');
  footer.style.cssText = 'position:absolute;bottom:16px;right:32px;display:flex;gap:10px;z-index:10;';
  footer.innerHTML = '<button id="ce-cancel" style="background:rgba(30,20,10,0.85);border:2px solid #8B5A2B;color:#c9bda0;border-radius:8px;padding:9px 20px;font-size:14px;cursor:pointer;">Отмена</button>'
    + '<button id="ce-save" style="background:rgba(58,47,30,0.85);border:2px solid #8B5A2B;color:#ffcc80;border-radius:8px;padding:9px 22px;font-size:14px;cursor:pointer;">Сохранить персонажа</button>';
  overlay.appendChild(footer);

  

  function renderTop(){
    const locked = getLockedSize(st.age);
    const effSize = locked !== null ? locked : st.size;
    const imgPct = Math.round((effSize/0.5)*80);

    topPanel.innerHTML = '';

    
    const roleIcon = document.createElement('div');
    roleIcon.style.cssText = 'width:160px;height:160px;border-radius:50%;overflow:hidden;border:3px solid #8B5A2B;flex-shrink:0;background:rgba(10,20,10,0.8);display:flex;align-items:center;justify-content:center;font-size:40px;';
    const roleImg = document.createElement('img');
    roleImg.src = '/assets/war.png';
    roleImg.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    roleImg.onerror = function(){ this.style.display='none'; roleIcon.textContent='🐱'; };
    roleIcon.appendChild(roleImg);
    topPanel.appendChild(roleIcon);

    
    const center = document.createElement('div');
    center.style.cssText = 'flex:1;min-width:0;position:relative;';
    topPanel.appendChild(center);

    
    const tribeBtn = document.createElement('div');
    tribeBtn.id = 'ce-tribe-trigger';
    tribeBtn.style.cssText = 'font-size:26px;font-weight:bold;color:#8fd14f;cursor:pointer;display:block;user-select:none;line-height:1.2;';
    tribeBtn.textContent = 'Племя ' + st.tribe.name + ' ▼';
    center.appendChild(tribeBtn);

    
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

    
    const previewWrap = document.createElement('div');
    previewWrap.style.cssText = 'flex-shrink:0;position:relative;display:flex;align-items:flex-end;margin-left:16px;height:192px;';
    previewWrap.appendChild(ensurePreviewHost());
    topPanel.appendChild(previewWrap);
    updatePreview();

    
    const closeBtn = document.createElement('button');
    closeBtn.id = 'ce-close-x';
    closeBtn.style.cssText = 'position:absolute;top:10px;right:12px;background:none;border:none;color:#ffaaaa;font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px;';
    closeBtn.textContent = '✕';
    topPanel.appendChild(closeBtn);

    
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

      
      const closeTribeHandler = (e) => {
        const p = document.getElementById('ce-tribe-popup');
        const trigger = document.getElementById('ce-tribe-trigger');
        if (p && !p.contains(e.target) && !trigger.contains(e.target)) {
          st.tribeOpen = false;
          renderTop();
          document.removeEventListener('mousedown', closeTribeHandler);
        }
      };
      
      setTimeout(() => document.addEventListener('mousedown', closeTribeHandler), 0);
    }
    const nameDisplay = center.querySelector('#ce-name-display');
    const nameInput   = center.querySelector('#ce-name-input');
    if(nameDisplay) nameDisplay.addEventListener('click', () => { st.editingName=true; renderTop(); });
    if(nameInput){
      nameInput.addEventListener('input',   (e) => { st.name = e.target.value; });
      nameInput.addEventListener('blur',    () => { if(!st.name.trim()) st.name='Без имени'; st.editingName=false; renderTop(); });
      nameInput.addEventListener('keydown', (e) => {
        e.stopPropagation(); 
        if(e.key==='Enter'||e.key==='Escape'){ if(!st.name.trim()) st.name='Без имени'; st.editingName=false; renderTop(); }
      });
    }
    roleSelect.addEventListener('change', (e) => { st.role=e.target.value; });
    ageInp.addEventListener('input', (e) => { st.age=Number(e.target.value); renderTop(); });
    sizeSlider.addEventListener('input', (e) => { st.size=Number(e.target.value); sizeVal.textContent=Number(e.target.value).toFixed(2); renderTopPreviewSize(); });
    closeBtn.addEventListener('click', () => { destroyPreview(); overlay.remove(); });
  }

  function renderTopPreviewSize(){  }

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

  
  footer.querySelector('#ce-cancel').addEventListener('click', () => { destroyPreview(); editorStyle.remove(); overlay.remove(); });
  footer.querySelector('#ce-save').addEventListener('click', async () => {
    const lockedSize = getLockedSize(st.age);
    if (lockedSize !== null) st.size = lockedSize;

    let saved;
    try {
      saved = await createCharacter({
        name:       st.name,
        tribe:      st.tribe,
        role:       st.role,
        build:      st.build,
        size:       st.size,
        appearance: st.app,
      });
    } catch (e) {
      console.warn('Сервер:', e);
      alert('Не удалось сохранить котика: ' + (e.message ?? e));
      return;
    }

    destroyPreview();
    editorStyle.remove();
    overlay.remove();

    const confirmBanner = document.createElement('div');
    confirmBanner.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(58,47,30,0.97);border:2px solid #8B5A2B;color:#ffcc80;padding:12px 28px;border-radius:10px;font-size:15px;z-index:9999;pointer-events:none;';
    confirmBanner.textContent = 'Котик «' + st.name + '» сохранён!';
    document.body.appendChild(confirmBanner);
    setTimeout(() => confirmBanner.remove(), 2000);

    if (typeof onSaved === 'function') onSaved(saved);
  });

  
  renderTop();
  renderTabs();
  renderSliders();

  document.body.appendChild(overlay);
}