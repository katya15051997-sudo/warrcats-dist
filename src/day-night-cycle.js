// day-night-cycle.js
// Смена времени суток: Утро / День / Вечер / Ночь.
//
// Клавиша P переключает период вручную (см. input.js).

import * as PIXI from 'pixi.js';
import { showToast } from './notify.js';

// Высота области "неба" в верхней части карты
export const SKY_HEIGHT = 400;

// Длительность одного периода суток (источник истины для синхронизации
// с игровым днём: 1.5ч × 4 периода = 6ч = DAY_DURATION_MS)
const PERIOD_DURATION_MS = 1.5 * 60 * 60 * 1000;

// Периоды суток: путь к картинке неба + тинт фона
const PERIODS = [
  {
    id: 'morning',
    label: 'Рождение Солнца',
    skyImage: '/assets/fon/morning.png',
    groundTint: 0xfff0cc,   // тёплый тон фона
  },
  {
    id: 'day',
    label: 'Пока Солнце живёт',
    skyImage: '/assets/fon/afternoon.png',
    groundTint: 0xffffff,   // фон без тинта
  },
  {
    id: 'evening',
    label: 'Тонущее Солнце',
    skyImage: '/assets/fon/evening.png',
    groundTint: 0xa9b8e0,   // холодный синеватый тон фона
  },
  {
    id: 'night',
    label: 'Власть Луны',
    skyImage: '/assets/fon/night.png',
    groundTint: 0x4a5570,   // тёмный сине-серый тон фона
  },
];

// Контейнер, в котором живут спрайты неба (один на период)
let skyContainer = null;
// Массив спрайтов — по одному на каждый период, индексы совпадают с PERIODS
let skySprites = [];
let background = null;
let skyWidth = 0;
let currentIndex = 0;
let periodStartTime = Date.now();

//
// ВАЖНО: вызывать ДО world.addChild(LargeFloor), чтобы небо оказалось
// позади фона по z-порядку.
export async function createDayNightOverlay(world, worldWidth, backgroundDisplayObject) {
  skyWidth = worldWidth;
  background = backgroundDisplayObject ?? null;

  // Сбрасываем цикл при каждом новом старте игры
  currentIndex = 0;
  periodStartTime = Date.now();

  skyContainer = new PIXI.Container();
  world.addChild(skyContainer);

  // Загружаем и создаём спрайт для каждого периода
  skySprites = await Promise.all(
    PERIODS.map(async (period) => {
      const texture = await PIXI.Assets.load(period.skyImage);
      const sprite = new PIXI.Sprite(texture);
      // Растягиваем картинку на всю ширину карты и высоту SKY_HEIGHT
      sprite.width = skyWidth;
      sprite.height = SKY_HEIGHT;
      sprite.x = 0;
      sprite.y = 0;
      sprite.visible = false;
      skyContainer.addChild(sprite);
      return sprite;
    })
  );

  redraw();
  return skyContainer;
}

function redraw() {
  const period = PERIODS[currentIndex];

  // Показываем только спрайт текущего периода
  skySprites.forEach((sprite, i) => {
    sprite.visible = (i === currentIndex);
  });

  applyGroundTint(background, period.groundTint);
}

// Рекурсивно применяет тинт ко всем объектам, у которых есть свойство tint
// (на случай если фон — это Container из нескольких спрайтов, а не один Sprite)
function applyGroundTint(target, color) {
  if (!target) return;

  if ('tint' in target) {
    target.tint = color;
  }

  if (Array.isArray(target.children)) {
    target.children.forEach(child => applyGroundTint(child, color));
  }
}

// Вызывать каждый кадр (app.ticker) — автоматически переключает период,
// когда истекает PERIOD_DURATION_MS реального времени
export function updateDayNightCycle() {
  const now = Date.now();
  if (now - periodStartTime >= PERIOD_DURATION_MS) {
    setPeriod(currentIndex + 1);
  }
}

// Установить период по индексу (с зацикливанием) и перерисовать оверлей
export function setPeriod(index) {
  currentIndex = ((index % PERIODS.length) + PERIODS.length) % PERIODS.length;
  periodStartTime = Date.now();
  redraw();
  showToast(PERIODS[currentIndex].label);
}

// Переключить на следующий период вручную (клавиша P)
export function cyclePeriod() {
  setPeriod(currentIndex + 1);
}

// Текущий период (для отображения во вкладке "Карта" и т.п.)
export function getCurrentPeriod() {
  return PERIODS[currentIndex];
}

// Сколько миллисекунд осталось до смены текущего периода на следующий
export function getTimeUntilNextPeriod() {
  const elapsed = Date.now() - periodStartTime;
  return Math.max(0, PERIOD_DURATION_MS - elapsed);
}

// Длительность одного периода (мс) — на случай если понадобится извне
export function getPeriodDurationMs() {
  return PERIOD_DURATION_MS;
}
