// server/gameLoop.js
// Игровой тик: 20 раз в секунду рассылает снапшот позиций игроков.
// Дичь рассылается реже (каждые 200мс) — её позиции менее критичны.
// Смена суток синхронизирована с day-night-cycle.js (1.5ч × 4 = 6ч = реальное время).

const { MSG } = require('./protocol');

const TICK_MS      = 50;   // 20 тиков/сек
const PREY_TICK_MS = 200;  // 5 тиков/сек для дичи
const PERIOD_MS    = 1.5 * 60 * 60 * 1000; // 1.5 реальных часа = 1 период суток

const PERIODS = ['morning', 'day', 'evening', 'night'];

class GameLoop {
  constructor(room) {
    this.room = room;
    this._tickInterval  = null;
    this._preyInterval  = null;
    this._periodIndex   = 0;
    this._periodStart   = Date.now();
  }

  start() {
    // Основной тик — позиции игроков
    this._tickInterval = setInterval(() => this._tick(), TICK_MS);
    // Тик дичи — реже
    this._preyInterval = setInterval(() => this._preyTick(), PREY_TICK_MS);
  }

  stop() {
    clearInterval(this._tickInterval);
    clearInterval(this._preyInterval);
  }

  _tick() {
    const room = this.room;

    // Проверяем смену суток
    if (Date.now() - this._periodStart >= PERIOD_MS) {
      this._periodIndex = (this._periodIndex + 1) % PERIODS.length;
      this._periodStart = Date.now();
      room.broadcast({ type: MSG.DAY_PERIOD, payload: { period: PERIODS[this._periodIndex] } });
    }

    // Рассылаем снапшот позиций всех игроков
    const snapshot = room.getPlayersSnapshot();
    if (snapshot.length > 0) {
      room.broadcast({ type: MSG.STATE, payload: snapshot });
    }
  }

  _preyTick() {
    // Двигаем дичь на сервере и рассылаем её позиции
    this.room.tickPrey();
    const prey = this.room.getPreySnapshot();
    if (prey.length > 0) {
      this.room.broadcast({ type: MSG.PREY_STATE, payload: prey });
    }
  }

  getCurrentPeriod() {
    return PERIODS[this._periodIndex];
  }
}

module.exports = { GameLoop };
