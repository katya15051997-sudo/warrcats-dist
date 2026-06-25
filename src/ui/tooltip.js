let tooltipElement = null;
let settingsTooltipElement = null;

export function initTooltip() {
  if (tooltipElement) return;

  tooltipElement = document.createElement('div');
  tooltipElement.id = 'custom-tooltip';
  tooltipElement.style.cssText = `
    position: absolute;
    background: rgba(20, 25, 15, 0.98);
    color: #e8d8b0;
    border: 2px solid #8B5A2B;
    border-radius: 8px;
    padding: 12px 16px;
    max-width: 280px;
    font-size: 14px;
    line-height: 1.4;
    pointer-events: none;
    z-index: 300;
    box-shadow: 0 4px 12px rgba(0,0,0,0.6);
    display: none;
  `;
  document.body.appendChild(tooltipElement);
  
  // Создаём отдельный тултип для настроек сервера (с более широким содержимым)
  settingsTooltipElement = document.createElement('div');
  settingsTooltipElement.id = 'settings-tooltip';
  settingsTooltipElement.style.cssText = `
    position: absolute;
    background: rgba(20, 25, 15, 0.98);
    color: #e8d8b0;
    border: 2px solid #ffcc80;
    border-radius: 10px;
    padding: 15px;
    min-width: 260px;
    max-width: 320px;
    font-size: 13px;
    line-height: 1.5;
    pointer-events: none;
    z-index: 300;
    box-shadow: 0 6px 20px rgba(0,0,0,0.7);
    display: none;
    backdrop-filter: blur(2px);
  `;
  document.body.appendChild(settingsTooltipElement);
}

export function showTooltip(e, text) {
  if (!tooltipElement) initTooltip();

  tooltipElement.textContent = text;
  tooltipElement.style.display = 'block';

  const tooltipWidth = tooltipElement.offsetWidth;
  const tooltipHeight = tooltipElement.offsetHeight;

  let left = e.pageX - tooltipWidth - 20;
  let top = e.pageY - tooltipHeight / 2;

  if (left < 10) left = e.pageX + 20;
  if (top < 10) top = 10;
  if (top + tooltipHeight > window.innerHeight - 10) {
    top = window.innerHeight - tooltipHeight - 10;
  }

  tooltipElement.style.left = left + 'px';
  tooltipElement.style.top = top + 'px';
}

export function hideTooltip() {
  if (tooltipElement) {
    tooltipElement.style.display = 'none';
  }
  if (settingsTooltipElement) {
    settingsTooltipElement.style.display = 'none';
  }
}

// Новая функция: показать подсказку с настройками сервера
export function showServerSettingsTooltip(e, serverName, settings) {
  if (!settingsTooltipElement) initTooltip();
  
  // Формируем HTML с настройками
  settingsTooltipElement.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #ffcc80; padding-bottom: 6px; color: #ffcc80;">
      📊 Настройки сервера «${serverName}»
    </div>
    <div style="display: grid; gap: 8px;">
      <div> <span style="color:#ff8888;">Макс. здоровье:</span> ${settings.maxHealth}</div>
      <div> <span style="color:#88ff88;">Макс. сила:</span> ${settings.maxStrength}</div>
      <div> <span style="color:#ffcc88;">Смена лун:</span> каждые ${settings.moonFrequency} дня</div>
      <div> <span style="color:#88ffcc;">Здоровье за луну:</span> +${settings.healthPerMoon}</div>
      <div> <span style="color:#ffaa88;">Сила за тренировку:</span> +${settings.strengthPerTrain}</div>
      <div> <span style="color:#88ff88;">Рост травы:</span> ${settings.grassGrowthRate} шт/неделю</div>
      <div> <span style="color:#ffaa88;">Гниение мяса:</span> через ${settings.meatDecayDays} дней</div>
      <div> <span style="color:#88ff88;">Порча травы:</span> через ${settings.grassDecayDays} дней</div>
      <div> <span style="color:#ffcc88;">Макс. возраст:</span> ${settings.maxAge} лун</div>
    </div>
  `;
  
  settingsTooltipElement.style.display = 'block';
  
  // Позиционируем подсказку справа от элемента
  const rect = e.target.getBoundingClientRect();
  let left = rect.right + 15;
  let top = rect.top + window.scrollY;
  
  // Проверяем, не выходит ли за правый край
  const tooltipWidth = settingsTooltipElement.offsetWidth;
  if (left + tooltipWidth > window.innerWidth - 10) {
    left = rect.left - tooltipWidth - 15;
  }
  
  // Проверяем, не выходит ли за нижний край
  const tooltipHeight = settingsTooltipElement.offsetHeight;
  if (top + tooltipHeight > window.innerHeight + window.scrollY - 10) {
    top = window.innerHeight + window.scrollY - tooltipHeight - 10;
  }
  if (top < window.scrollY + 10) {
    top = window.scrollY + 10;
  }
  
  settingsTooltipElement.style.left = left + 'px';
  settingsTooltipElement.style.top = top + 'px';
}