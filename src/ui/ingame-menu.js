import { initLanding } from './landing.js';
import { hideBottomMenu } from './bottom-menu.js';
import { stopNeedsSystem, reloadForActiveCharacter as reloadPlayer } from '../systems/player-system.js';
import { stopActiveAction } from '../world/world-objects.js';
import { getCharacters, setActiveCharacter, getActiveCharacter } from '../character/character-save.js';
import { idleChar, applyCharacterData } from '../character/character.js';
import { buildImg, bodyToFilter } from '../character/character-preview.js';
import { injectGameStyles } from '../styles.js';

let ingameMenuContainer = null;

export function showInGameMenu(app) {
  if (ingameMenuContainer) return;

  ingameMenuContainer = document.createElement('div');
  ingameMenuContainer.id = 'ingame-menu';
  ingameMenuContainer.style.cssText = `
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7); color: white; font-family: Arial, sans-serif;
    display: flex; align-items: center; justify-content: center; z-index: 200;
  `;

  ingameMenuContainer.innerHTML = `
    <div style="background: rgba(15, 25, 15, 0.95); padding: 40px 60px; border-radius: 12px; max-width: 900px; text-align: center; border: 3px solid #8B5A2B;">
      <h1 style="margin: 0 0 30px 0; color: #ffcc80; font-size: 48px; text-shadow: 3px 3px 0 #5c3a1e;">
        WarrCats
      </h1>
      
      <button class="ingame-btn" id="btn-resume">Продолжить игру</button>
      <button class="ingame-btn" id="btn-load-char">Загрузить котика</button>
      <button class="ingame-btn" id="btn-main-menu">Главное меню</button>
    </div>
  `;

  document.body.appendChild(ingameMenuContainer);

  injectGameStyles();

  document.getElementById('btn-resume').onclick = hideInGameMenu;
  
  document.getElementById('btn-load-char').onclick = () => {
    hideInGameMenu();
    showInGameCharacterSelect();
  };

  document.getElementById('btn-main-menu').onclick = () => {
    stopActiveAction();
    stopNeedsSystem();
    hideBottomMenu();
    hideInGameMenu();
    initLanding(window.startGameCallback);
  };
}

export function hideInGameMenu() {
  if (ingameMenuContainer) {
    ingameMenuContainer.remove();
    ingameMenuContainer = null;
  }
}

function showInGameCharacterSelect() {
  const BUILD_LABELS = { lean: 'Lean', large: 'Massive', fat: 'Fat' };

  const overlay = document.createElement('div');
  overlay.id = 'ingame-char-select';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(10,18,10,0.97);z-index:300;display:flex;flex-direction:column;align-items:center;overflow-y:auto;font-family:Arial,sans-serif;';

  function render() {
    overlay.innerHTML = '';

    const header = document.createElement('div');
    header.style.cssText = 'width:100%;max-width:800px;padding:28px 32px 0;box-sizing:border-box;display:flex;align-items:center;gap:16px;';
    header.innerHTML = `
      <div style="flex:1;"><h2 style="color:#ffcc80;margin:0 0 4px;font-size:24px;">Сменить котика</h2>
      <div style="color:#c9bda0;font-size:13px;">Телосложение и окраска применятся сразу; возраст и навыки — при следующем старте</div></div>
      <button id="igcs-close" style="background:none;border:2px solid #8B5A2B;color:#ffcc80;border-radius:8px;padding:8px 18px;font-size:14px;cursor:pointer;">✕ Закрыть</button>
    `;
    overlay.appendChild(header);

    const chars = getCharacters();
    const currentActive = getActiveCharacter();
    const listWrap = document.createElement('div');
    listWrap.style.cssText = 'width:100%;max-width:800px;padding:16px 32px;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;';

    if (chars.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#c9bda0;text-align:center;padding:40px 0;font-size:15px;';
      empty.textContent = 'Нет сохранённых котиков. Создайте их в главном меню.';
      listWrap.appendChild(empty);
    } else {
      chars.forEach(char => {
        const isActive = currentActive && currentActive.id === char.id;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:12px;background:' + (isActive ? 'rgba(143,209,79,0.13)' : 'rgba(40,55,40,0.7)') + ';'
          + 'border:1px solid ' + (isActive ? 'rgba(143,209,79,0.5)' : 'rgba(139,90,43,0.4)') + ';border-radius:10px;padding:10px 14px;';

        const img = document.createElement('img');
        img.src = buildImg(char.build);
        img.style.cssText = 'height:40px;width:auto;image-rendering:pixelated;flex-shrink:0;';
        if (char.app && char.app.body) img.style.filter = bodyToFilter(char.app.body);
        img.onerror = () => { img.style.display = 'none'; };
        row.appendChild(img);

        const info = document.createElement('div');
        info.style.cssText = 'flex:1;';
        info.innerHTML = `<div style="color:#ffcc80;font-weight:bold;font-size:15px;">${char.name}</div>
          <div style="color:#c9bda0;font-size:12px;">${char.tribe?.name ?? '—'} · ${BUILD_LABELS[char.build] ?? char.build} · ${char.age ?? 0} лун</div>`;
        row.appendChild(info);

        const btn = document.createElement('button');
        btn.textContent = isActive ? '✓ Активен' : 'Выбрать';
        btn.style.cssText = 'padding:6px 14px;border-radius:7px;font-size:13px;cursor:pointer;flex-shrink:0;'
          + 'background:' + (isActive ? 'rgba(143,209,79,0.2)' : 'rgba(58,47,30,0.85)') + ';'
          + 'border:1px solid ' + (isActive ? 'rgba(143,209,79,0.6)' : '#8B5A2B') + ';'
          + 'color:' + (isActive ? '#8fd14f' : '#ffcc80') + ';';
        btn.addEventListener('click', () => {
          setActiveCharacter(char);
          try { if (idleChar) applyCharacterData(idleChar, char); } catch (e) { console.warn(e); }
          reloadPlayer();
          render();
          const banner = document.createElement('div');
          banner.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(58,47,30,0.97);border:2px solid #8B5A2B;color:#ffcc80;padding:12px 28px;border-radius:10px;font-size:14px;z-index:9999;pointer-events:none;';
          banner.textContent = '✓ «' + char.name + '» активен';
          document.body.appendChild(banner);
          setTimeout(() => banner.remove(), 2500);
        });
        row.appendChild(btn);
        listWrap.appendChild(row);
      });
    }

    overlay.appendChild(listWrap);

    const closeBtn = overlay.querySelector('#igcs-close');
    if (closeBtn) closeBtn.addEventListener('click', () => overlay.remove());
  }

  render();
  document.body.appendChild(overlay);
}
