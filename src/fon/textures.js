import * as PIXI from 'pixi.js';

export let LargeFloor = null;

export async function loadBackground() {
  const texture = await PIXI.Assets.load('/assets/fon/pl.png');
  
  LargeFloor = new PIXI.Sprite(texture);
  LargeFloor.anchor.set(0, 0);
  
  // Размер фона (подставь реальные размеры твоего изображения или сделай больше)
  LargeFloor.width = 2300;
  LargeFloor.height = 1200;
  
  return LargeFloor;
}