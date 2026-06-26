// styles.js
// Единое место для всех CSS-стилей интерфейса.
// Раньше эти правила были раскиданы по <style>-блокам внутри menu.js,
// bottom-menu.js и ingame-menu.js и нагромождали логику. Теперь весь CSS
// здесь, а компоненты лишь один раз вызывают injectGameStyles().
//
// Инъекция идемпотентна: повторные вызовы ничего не делают.

const STYLE_ID = 'game-styles';

const GAME_CSS = `
/* ===== Главное меню / выбор сервера ===== */
    .menu-btn {
      display: block; width: 300px; margin: 20px auto; padding: 20px;
      font-size: 18px; background: #3a2f1e; color: #ffcc80; border: 2px solid #8B5A2B;
      border-radius: 8px; cursor: pointer; transition: all 0.2s;
    }
    .menu-btn:hover { background: #5c4a2f; transform: scale(1.05); }

    .server-name-input {
      background: #2a1f0f; border: 2px solid #8B5A2B; color: #ffcc80;
      font-size: 28px; font-weight: bold; text-align: center;
      padding: 10px 20px; border-radius: 10px; outline: none; width: 300px;
    }
    .server-name-input:focus { border-color: #ffcc80; box-shadow: 0 0 10px rgba(255, 204, 128, 0.5); }

    .server-name-display {
      margin: 0 0 30px 0; color: #ffcc80; cursor: pointer; font-size: 32px;
      display: inline-block; padding: 10px 20px; border-radius: 10px; transition: all 0.2s;
    }
    .server-name-display:hover { background: rgba(255, 204, 128, 0.2); transform: scale(1.05); }

    .settings-grid {
      width: 100%;
      box-sizing: border-box;
    }
    .settings-grid > div {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .settings-grid label {
      font-size: 14px;
      line-height: 1.4;
      color: #e8d8b0;
    }
    .settings-grid input[type="range"] {
      width: 100%;
      min-width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }
    
    .delete-server-btn {
      background: rgba(139, 0, 0, 0.6);
      color: #ffaaaa;
      border: none;
      border-radius: 4px;
      padding: 2px 8px;
      margin-left: 10px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.2s;
    }
    .delete-server-btn:hover {
      background: rgba(200, 0, 0, 0.8);
      color: white;
    }
  
#ce-size::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#111;border:2px solid #555;cursor:pointer;} #ce-size::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#111;border:2px solid #555;cursor:pointer;}

/* ===== Внутриигровое меню (ESC) ===== */
    .ingame-btn {
      display: block; width: 260px; margin: 12px auto; padding: 12px;
      font-size: 17px; background: #3a2f1e; color: #ffcc80; border: 2px solid #8B5A2B;
      border-radius: 8px; cursor: pointer;
    }
    .ingame-btn:hover { background: #5c4a2f; transform: scale(1.05); }
  

/* ===== Нижнее меню и панели (потребности, навыки, приёмы) ===== */
    #bottom-menu-bar {
      position: fixed;
      bottom: 14px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 13px;
      z-index: 150;
      font-family: Arial, sans-serif;
    }

    .bottom-menu-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 72px;
      cursor: pointer;
      user-select: none;
      transition: transform 0.15s ease;
    }
    .bottom-menu-btn:hover {
      transform: translateY(-4px) scale(1.06);
    }

    .bottom-menu-icon-wrap {
      width: 58px;
      height: 58px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 10px rgba(0,0,0,0.5);
      transition: box-shadow 0.15s ease;
      border: 2px solid transparent;
    }
    .bottom-menu-btn.active .bottom-menu-icon-wrap {
      border-color: #ffcc80;
      box-shadow: 0 0 12px rgba(255, 204, 128, 0.7), 0 4px 10px rgba(0,0,0,0.6);
    }

    .bottom-menu-icon {
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: 50%;
    }

    .bottom-menu-label {
      margin-top: 6px;
      font-size: 13px;
      font-weight: bold;
      color: #ffe8a0;
      font-family: 'Ink Free','Segoe Print',cursive;
      text-align: center;
      line-height: 1.25;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.9), 0 0 4px rgba(255,200,80,0.3);
    }

    #bottom-menu-panel {
      position: fixed;
      right: 16px;
      top: 50%;
      transform: translateY(-50%);
      width: 400px;
      height: 600px;
      max-height: 92vh;
      background: url('/assets/menu/needs.png') center/100% 100% no-repeat;
      border: none;
      border-radius: 14px;
      color: #e8d8b0;
      z-index: 149;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
      animation: bottom-menu-panel-in 0.18s ease-out;
    }

    @keyframes bottom-menu-panel-in {
      from { opacity: 0; transform: translate(20px, -50%); }
      to   { opacity: 1; transform: translate(0, -50%); }
    }

    .bottom-menu-panel-header {
      padding: 10px 12px;
      font-size: 28px;
      font-weight: bold;
      color: #ffe8a0;
      font-family: 'Ink Free','Segoe Print',cursive;
      text-shadow: 2px 2px 0 #3a2410, 0 0 8px rgba(255,200,80,0.4);
      background: url('/assets/menu/knopka2.png') center/100% 100% no-repeat;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
      min-height: 56px;
    }

    .bottom-menu-panel-close {
      cursor: pointer;
      font-size: 16px;
      color: #ffaaaa;
      padding: 2px 8px;
      border-radius: 4px;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .bottom-menu-panel-close:hover {
      background: rgba(200,0,0,0.5);
      color: #fff;
    }

    .bottom-menu-panel-content {
      padding: 12px;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .bottom-menu-empty {
      color: #c9bda0;
      font-style: italic;
      text-align: center;
      padding: 30px 0;
    }

    .about-subtabs {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .about-subtab {
      padding: 8px 16px;
      font-size: 14px;
      font-family: 'Ink Free','Segoe Print',cursive;
      color: #ffcc80;
      text-shadow: 1px 1px 0 #3a2410;
      cursor: pointer;
      border: none;
      border-radius: 0;
      background: url('/assets/menu/knopka2.png') center/100% 100% no-repeat;
      transition: filter 0.15s ease;
      user-select: none;
      min-height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .about-subtab:hover {
      filter: brightness(1.15);
    }

    .about-subtab.active {
      filter: brightness(1.25);
      color: #fff;
      font-weight: bold;
    }

    .map-time-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      background: url('/assets/menu/knopka2.png') center/100% 100% no-repeat;
      border: none;
      border-radius: 0;
      padding: 12px 16px;
      margin-bottom: 16px;
      min-height: 48px;
      font-family: 'Ink Free','Segoe Print',cursive;
    }

    .map-time-current {
      font-size: 16px;
      font-weight: bold;
      color: #ffcc80;
      text-shadow: 1px 1px 0 #3a2410;
    }

    .map-time-next {
      font-size: 14px;
      color: #ffcc80;
      text-shadow: 1px 1px 0 #3a2410;
    }

    .character-info-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .character-info-row {
      display: grid;
      grid-template-columns: 140px 1fr;
      align-items: center;
      gap: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(139, 90, 43, 0.4);
    }

    .character-info-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .character-info-label {
      font-size: 14px;
      font-weight: bold;
      color: #ffcc80;
    }

    .character-info-value {
      font-size: 14px;
      color: #e8d8b0;
    }

    /* Подвкладки "Потребности" / "Умения" */
    .ns-subtabs {
      display: flex;
      gap: 6px;
      margin-bottom: 12px;
    }
    .ns-subtab {
      flex: 1;
      text-align: center;
      font-size: 12px;
      font-family: 'Ink Free','Segoe Print',cursive;
      color: #ffcc80;
      text-shadow: 1px 1px 0 #3a2410;
      padding: 6px 4px;
      border: none;
      border-radius: 0;
      background: url('/assets/menu/knopka2.png') center/100% 100% no-repeat;
      cursor: pointer;
      min-height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: filter 0.15s ease;
    }
    .ns-subtab:hover { filter: brightness(1.15); }
    .ns-subtab.active {
      filter: brightness(1.3);
      color: #fff;
      font-weight: bold;
    }

    /* Список потребностей (одна колонка): значение/максимум на шкале, % справа */
    .needs-list { display: flex; flex-direction: column; gap: 12px; }

    .need-row { display: flex; flex-direction: column; gap: 3px; }

    .need-label {
      font-size: 24px;
      font-weight: bold;
      color: #ffe8a0;
      font-family: 'Ink Free','Segoe Print',cursive;
      text-shadow: 1px 1px 0 #3a2410, 0 0 6px rgba(255,200,80,0.3);
    }

    .need-bar-line {
      display: grid;
      grid-template-columns: 1fr 38px;
      align-items: center;
      gap: 8px;
    }

    .need-bar-track {
      position: relative;
      height: 16px;
      background: rgba(0,0,0,0.4);
      border: 1px solid #8B5A2B;
      border-radius: 8px;
      overflow: hidden;
    }
    .need-bar-fill {
      position: absolute;
      top: 0; left: 0; bottom: 0;
      height: 100%;
      border-radius: 8px;
      transition: width 0.3s ease, background 0.3s ease;
    }
    .need-bar-text {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: bold;
      color: #fff;
      text-shadow: 0 0 3px rgba(0,0,0,0.95);
    }
    .need-pct {
      text-align: right;
      font-size: 12px;
      color: #ffcc80;
    }

    @media (max-width: 640px) {
      #bottom-menu-bar { gap: 10px; }
      .bottom-menu-btn { width: 54px; }
      .bottom-menu-icon-wrap { width: 44px; height: 44px; }
      .bottom-menu-label { font-size: 10px; }

      .needs-skills-wrapper {
        grid-template-columns: 1fr;
        gap: 20px;
      }

      .need-row,
      .skill-row {
        grid-template-columns: 20px 100px 1fr 50px;
      }

      .character-info-row {
        grid-template-columns: 1fr;
        gap: 2px;
      }

      .moves-grid {
        grid-template-columns: 1fr;
      }
    }

    /* === Шкала опыта / звания === */
    .xp-row {
      display: grid;
      grid-template-columns: 92px 1fr;
      gap: 10px;
      align-items: center;
      margin-bottom: 4px;
    }

    .xp-rank-badge {
      background: rgba(139, 90, 43, 0.3);
      border: 1px solid #8B5A2B;
      border-radius: 8px;
      padding: 6px 8px;
      text-align: center;
    }

    .xp-rank-name {
      font-size: 13px;
      font-weight: bold;
      color: #ffcc80;
    }

    .xp-rank-num {
      font-size: 10px;
      color: #c9a876;
      margin-top: 1px;
    }

    .xp-bar-track {
      position: relative;
      height: 20px;
      background: rgba(0,0,0,0.4);
      border: 1px solid #8B5A2B;
      border-radius: 10px;
      overflow: hidden;
      cursor: help;
    }

    .xp-bar-fill {
      height: 100%;
      border-radius: 10px;
      background: #c88b3a;
      transition: width 0.3s ease;
    }

    .xp-bar-label {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: bold;
      color: #ffcc80;
      text-shadow: 0 0 4px rgba(0,0,0,0.9);
    }

    /* === Вкладка "Боевые приёмы" === */
    /* Боевые умения (звание + прогресс) */
    .combat-skill { margin-bottom: 14px; }
    .combat-skill-title {
      font-size: 15px; font-weight: bold; color: #ffe8a0;
      letter-spacing: 0.3px; margin-bottom: 4px;
      text-shadow: 0 0 4px rgba(255,200,80,0.3);
    }
    .combat-skill-rank {
      font-size: 13px; color: #e8d8b0; margin-bottom: 6px;
    }

    /* Блок "Боевые приёмы" со скрытыми уровнями (аккордеоны) */
    .moves-block-title {
      font-size: 15px; font-weight: bold; color: #e8a840;
      border-top: 1px solid #7a6040; padding-top: 10px; margin-bottom: 8px;
      text-shadow: 0 0 4px rgba(255,180,50,0.3);
    }
    .moves-acc { margin-bottom: 6px; }
    .moves-acc-header {
      display: flex; align-items: center; gap: 6px;
      font-size: 13px; font-weight: bold; color: #ffe8a0;
      background: rgba(139,90,43,0.40);
      border: 1px solid #c88b3a; border-radius: 6px;
      padding: 7px 9px; cursor: pointer; user-select: none;
      transition: background 0.15s ease;
      text-shadow: 0 0 4px rgba(255,200,80,0.3);
    }
    .moves-acc-header:hover { background: rgba(139,90,43,0.58); }
    .moves-acc-arrow { font-size: 10px; color: #c88b3a; width: 10px; }
    .moves-acc-body { padding: 8px 2px 2px; }

    .moves-lock-note {
      font-size: 12px;
      color: #b09060;
      font-style: italic;
      margin-bottom: 8px;
    }

    .moves-grid {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .move-card {
      background: rgba(60,35,10,0.75);
      border: 1px solid #a07040;
      border-radius: 8px;
      padding: 10px 12px;
      cursor: pointer;
      transition: border-color 0.15s ease, background 0.15s ease;
    }

    .move-card[data-clickable="1"]:hover {
      border-color: #c88b3a;
      background: rgba(139, 90, 43, 0.2);
    }

    .move-card.in-progress {
      border-color: #ffcc80;
      background: rgba(60, 50, 10, 0.4);
      cursor: default;
    }

    .move-card.done {
      border-color: #4a8a28;
      background: rgba(20, 50, 10, 0.35);
      cursor: default;
    }

    .move-card.locked {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .move-card.disabled-other {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .move-selected-note {
      font-size: 10px;
      font-style: italic;
      color: #ffcc80;
      margin-top: 4px;
    }

    .move-name {
      font-size: 14px;
      font-weight: bold;
      color: #ffe8a0;
      text-shadow: 0 0 4px rgba(255,200,80,0.3);
    }

    .move-desc {
      font-size: 11px;
      color: #c8a870;
      margin-top: 3px;
      line-height: 1.4;
    }

    .move-tasks {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid rgba(92, 74, 47, 0.5);
    }

    .move-task-line {
      font-size: 11px;
      color: #e8d8b0;
      margin-bottom: 3px;
    }

    .move-task-desc {
      color: #c09860;
    }

    .move-progress-track {
      height: 5px;
      background: rgba(0,0,0,0.4);
      border-radius: 3px;
      margin-top: 6px;
      overflow: hidden;
    }

    .move-progress-fill {
      height: 100%;
      background: #c88b3a;
      border-radius: 3px;
      transition: width 0.3s ease;
    }

    .move-status {
      font-size: 11px;
      margin-top: 6px;
      color: #8fd14f;
    }

    .move-card.locked .move-status {
      color: #7a6040;
    }

    .move-card.in-progress .move-status {
      color: #ffcc80;
    }

    .move-reward {
      font-size: 10px;
      color: #9fd460;
      margin-top: 5px;
      line-height: 1.4;
    }
  
`;

export function injectGameStyles() {
  let style = document.getElementById(STYLE_ID);
  if (style) return style;

  style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = GAME_CSS;
  document.head.appendChild(style);

  return style;
}