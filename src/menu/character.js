import * as PIXI from 'pixi.js';
import 'pixi-spine';

export let idleChar, walkChar;
export let idleAnim, walkAnim;

export async function createCharacters(app) {
  const resource = await PIXI.Assets.load('/assets/spine/Catt.json');

  const { Spine } = await import('pixi-spine');

  const char = new Spine(resource.spineData);

  // Находим анимации stay и walk по имени
  const animNames = resource.spineData.animations.map(a => a.name);
  const stayAnim = animNames.find(n => n === 'stay') ?? animNames[0];
  const walkAnimName = animNames.find(n => n === 'walk') ?? animNames[0];

  // Для обратной совместимости с main.js — экспортируем как раньше
  idleAnim = stayAnim;
  walkAnim = walkAnimName;

  applyCharacterBuild(char, 'lean');

  char.state.setAnimation(0, stayAnim, true);
  hidePoseSlots(char.skeleton);

  const startX = app.screen.width / 2;
  const startY = app.screen.height / 2;
  const baseScale = 0.7;

  char.position.set(startX, startY);
  char.scale.set(baseScale);
  // НЕ добавляем в app.stage здесь — main.js добавит char в world-контейнер

  // Для обратной совместимости с main.js — idleChar и walkChar ссылаются на один объект
  idleChar = char;
  walkChar = char;

  char._idleAnim = stayAnim;
  char._walkAnim = walkAnimName;
  char._baseScale = baseScale;

  // slot.color напрямую), игра не ломается.
  let eyeSprite = null;
  try {
    const assets = await buildEyeSpriteAssets(app, resource, Spine);
    if (assets) {
      eyeSprite = new PIXI.Sprite(assets.texture);
      eyeSprite.anchor.set(assets.anchorX, assets.anchorY);
      eyeSprite.eventMode = 'none';
    }
  } catch (e) {
    console.warn('buildEyeSpriteAssets:', e);
    eyeSprite = null;
  }

  if (eyeSprite) {
    char._eyeSprite = eyeSprite;
    app.ticker.add(() => syncEyeSprite(char, eyeSprite));
  }

  let isWalk = false;
  let facingLeft = false;

  function updateFlip() {

    // что и давало растягивание персонажа при нестандартном размере.
    const currentScale = Math.abs(char.scale.y) || Math.abs(char.scale.x) || baseScale;
    char.scale.x = facingLeft ? currentScale : -currentScale;
    char.scale.y = currentScale;
  }

  function setWalking(walk) {
    if (walk === isWalk) return;
    isWalk = walk;
    char.state.setAnimation(0, walk ? walkAnimName : stayAnim, true);
    char.state.timeScale = walk ? 1.5 : 1.0;
    updateFlip();
  }

  function setFacing(left) {
    if (facingLeft === left) return;
    facingLeft = left;
    updateFlip();
  }

  return {
    idleChar: char,
    walkChar: char,
    eyeSprite,
    setWalking,
    setFacing,
    getFacingLeft: () => facingLeft
  };
}

// ─── Спрайт-слой глаз (вместо второго Spine-объекта) ──────────────────────

// Кость, к которой жёстко привязан меш слота "eyes2" (см. Catt.json:
// slots → eyes2 → "bone": "bone21", все вершины с весом 1.0 к ней же).
const EYES_BONE_NAME = 'bone21';
const EYES_SLOT_NAME = 'eyes2';

const EYE_MESH_LOCAL_POINTS = [
  { x: 14.92, y: -13.43 },
  { x: 7.62,  y: -9 },
  { x: 11.74, y: -2.22 },
  { x: 18.17, y: -1.93 },
  { x: 23.44, y: -5.14 },
  { x: 19.84, y: -11.06 },
  { x: 15.33, y: -13.68 },
];

async function buildEyeSpriteAssets(app, resource, Spine) {
  if (!app || !app.renderer || !resource || !Spine) return null;

  const tmp = new Spine(resource.spineData);
  tmp.skeleton.setToSetupPose();
  tmp.skeleton.updateWorldTransform();

  tmp.skeleton.slots.forEach(slot => {
    if (slot.data.name === EYES_SLOT_NAME) return;
    if (!slot.color) return;
    if (typeof slot.color.set === 'function') {
      slot.color.set(slot.color.r, slot.color.g, slot.color.b, 0);
    } else {
      slot.color.a = 0;
    }
  });

  const bone = tmp.skeleton.findBone(EYES_BONE_NAME);
  if (!bone) {
    tmp.destroy({ children: true });
    return null;
  }

  const worldPts = EYE_MESH_LOCAL_POINTS.map(p => ({
    x: bone.a * p.x + bone.c * p.y + bone.worldX,
    y: bone.b * p.x + bone.d * p.y + bone.worldY,
  }));
  const xs = worldPts.map(p => p.x);
  const ys = worldPts.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX;
  const h = maxY - minY;

  if (!(w > 0) || !(h > 0)) {
    tmp.destroy({ children: true });
    return null;
  }

  // Небольшой запас по краям, чтобы при ресайзе/антиалиасинге картинка не обрезалась
  const pad = Math.max(w, h) * 0.15;
  const region = new PIXI.Rectangle(minX - pad, minY - pad, w + pad * 2, h + pad * 2);

  let texture = null;
  try {
    texture = app.renderer.generateTexture(tmp, { region, resolution: 4 });
  } catch (e) {
    console.warn('buildEyeSpriteAssets: generateTexture не сработал:', e);
  }

  tmp.destroy({ children: true });

  if (!texture) return null;

  return {
    texture,
    anchorX: (bone.worldX - region.x) / region.width,
    anchorY: (bone.worldY - region.y) / region.height,
  };
}

// проигрывание анимаций или копирование костей не требуется.
function syncEyeSprite(char, sprite) {
  if (!char || !sprite || !char.skeleton) return;

  const bone = char.skeleton.findBone(EYES_BONE_NAME);
  const slot = char.skeleton.findSlot(EYES_SLOT_NAME);
  if (!bone || !slot) {
    sprite.visible = false;
    return;
  }

  // Показываем спрайт ровно тогда, когда у основного слота есть attachment
  // (например, в позе "сон" eyes2 скрывается — sit/normal показывают).
  sprite.visible = !!slot.attachment && char.visible;
  if (!sprite.visible) return;

  const sx = char.scale.x;
  const sy = char.scale.y;

  const m = new PIXI.Matrix(
    bone.a * sx, bone.b * sy,
    bone.c * sx, bone.d * sy,
    char.position.x + sx * bone.worldX,
    char.position.y + sy * bone.worldY
  );
  sprite.transform.setFromMatrix(m);
}

function resolveBuildKeys(build) {
  if (build === 'large') {
    return { skinName: 'Lean', bodyKey: 'massive', neckKey: 'neck_massive' };
  }
  if (build === 'fat') {
    return { skinName: 'fat', bodyKey: 'fat', neckKey: 'neck_fat' };
  }
  return { skinName: 'default', bodyKey: 'body', neckKey: 'neck' };
}

export function applyCharacterBuild(spine, build) {
  if (!spine || !spine.skeleton) return;

  const skeleton = spine.skeleton;
  const skeletonData = skeleton.data;

  const { skinName, bodyKey, neckKey } = resolveBuildKeys(build);

  const bodySlotIndex = skeletonData.findSlotIndex('body');
  const neckSlotIndex = skeletonData.findSlotIndex('neck');

  const skin = skeletonData.findSkin(skinName);
  if (!skin) {
    console.warn('applyCharacterBuild: скин "' + skinName + '" не найден');
    return;
  }

  function applySlot(slotIndex, slotName, attKey) {
    if (slotIndex < 0) {
      console.warn('applyCharacterBuild: слот "' + slotName + '" не найден');
      return;
    }
    const attachment = skin.getAttachment(slotIndex, attKey);
    if (!attachment) {
      console.warn('applyCharacterBuild: attachment "' + attKey + '" не найден в скине "' + skinName + '"');
      return;
    }
    const slot = skeleton.slots[slotIndex];
    slot.setAttachment(attachment);
    // Сбрасываем накопленную деформацию предыдущего телосложения, иначе при
    // переключении (massive↔fat↔lean) на новой меш-сетке остаются вершины от
    // старой, и тело/шея отображаются искажённо. Деформация нужного скина
    // применится заново на следующем кадре анимации.
    if (Array.isArray(slot.deform) && slot.deform.length) slot.deform.length = 0;
  }

  applySlot(bodySlotIndex, 'body', bodyKey);
  applySlot(neckSlotIndex, 'neck', neckKey);

  spine._charBuild = build;


  if (spine.state && typeof spine.state.apply === 'function') {
    try { spine.state.apply(skeleton); } catch (e) {}
  }

  skeleton.setBonesToSetupPose();
  skeleton.updateWorldTransform();
}

// Слоты тела, на которые ложится основной цвет персонажа. Глаза (eyes/eyes2)
// сюда НЕ входят — они красятся отдельно в applyEyeColor. Слоты поз Sit/sleep
// включены, чтобы цвет тела сохранялся при смене позы.
const BODY_COLOR_SLOTS = [
  'Paw PZ', 'Paw PP', 'tail', 'body', 'Paw LP',
  'neck', 'head', 'ear', 'Paw LZ', 'Sit', 'sleep',
];

/**
 * Строит RGB-цвет тела ([r,g,b] в 0..1) из ползунков редактора
 * (hue / saturation / brightness). Заменяет прежнюю CSS-цепочку
 * sepia/hue-rotate/saturate/brightness: цвет вычисляется напрямую через HSL,
 * а затем умножается на яркость — этот цвет потом ложится тинтом на слоты.
 */
function buildBodyColor(body) {
  if (!body) return [1, 1, 1];

  // Та же раскладка оттенка, что в редакторе: 0..70 → 0..60°, 70..100 → 180..240°
  const catHue = v => v <= 70 ? (v / 70) * 60 : 180 + ((v - 70) / 30) * 60;
  const hueDeg  = catHue(body.hue);
  const satFrac = Math.min(1, Math.max(0, body.saturation / 100));
  const brightF = 0.3 + ((body.brightness - 10) / 80) * 1.3; // 0.3..1.6

  // Ненасыщенные значения → серый/белый/чёрный (без рыжего оттенка sepia).
  if (body.saturation <= 15) {
    const v = Math.min(1, Math.max(0, brightF));
    return [v, v, v];
  }

  let [r, g, b] = hslToRgb(hueDeg, satFrac, 0.5);
  r = Math.min(1, Math.max(0, r * brightF));
  g = Math.min(1, Math.max(0, g * brightF));
  b = Math.min(1, Math.max(0, b * brightF));
  return [r, g, b];
}

/**
 * Красит тело Spine-персонажа ПО СЛОТАМ (slot.color), без ColorMatrixFilter.
 * color — [r, g, b] в диапазоне 0..1. Альфа каждого слота сохраняется.
 */
function applyBodyColor(spine, color) {
  if (!spine || !spine.skeleton || !Array.isArray(color)) return;

  const [r, g, b] = color;
  const skeleton = spine.skeleton;

  BODY_COLOR_SLOTS.forEach(name => {
    const slot = skeleton.findSlot(name);
    if (!slot || !slot.color) return;
    if (typeof slot.color.set === 'function') {
      slot.color.set(r, g, b, slot.color.a ?? 1);
    } else {
      slot.color.r = r;
      slot.color.g = g;
      slot.color.b = b;
    }
  });
}

/**
 * Красит Spine-персонажа ПО СЛОТАМ (slot.color), без ColorMatrixFilter.
 * Основной цвет тела вычисляется из ползунков редактора (hue/saturation/
 * brightness) и ложится тинтом на слоты тела; цвет глаз красится отдельно.
 */
export function applyCharacterColors(spine, appData) {
  if (!spine || !appData) return;

  try {
    const body = appData.body;
    if (!body) return;

    // Фильтр тела больше не используется — снимаем его, если он остался.
    if (spine.filters) spine.filters = null;

    // Основной цвет тела — тинтом по слотам тела (глаза не трогаем).
    applyBodyColor(spine, buildBodyColor(body));

    // Цвет глаз красится отдельно поверх тела. Если у персонажа есть
    // отдельный слой глаз (_eyeSprite) — красим его, иначе слот "eyes".
    const eyesSection = appData.eyes && typeof appData.eyes === 'object'
      ? Object.values(appData.eyes)[0]
      : null;
    applyEyeColor(spine, eyesSection);
  } catch (e) {
    console.warn('applyCharacterColors:', e);
  }
}

// ─── Отдельная окраска глаз ────────────────────────────────────────────────

// HSL → RGB (0..1). h в градусах, s и l в долях (0..1).
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return [r + m, g + m, b + m];
}

function buildEyeColor(eyeData) {
  if (!eyeData) return [1, 1, 1];
  const hueDeg  = (eyeData.hue / 100) * 360;
  const satFrac = (eyeData.saturation / 100) * 0.9; // 0..0.9, как eyeSat() в редакторе
  const brightF = 0.3 + ((eyeData.brightness - 10) / 80) * 1.3;

  let [r, g, b] = hslToRgb(hueDeg, satFrac, 0.5);
  r = Math.min(1, Math.max(0, r * brightF));
  g = Math.min(1, Math.max(0, g * brightF));
  b = Math.min(1, Math.max(0, b * brightF));
  return [r, g, b];
}

/**
 * чтобы не трогать setCharacterPose/NORMAL_SLOTS), они полностью
 * заслоняются спрайтом сверху.
 *
 * Если спрайт создать не удалось (createEyeSprite вернул null) — работает
 * прежняя схема: красим slot.color "eyes"/"eyes2" напрямую, как было
 * изначально (с поправкой на то, что body-фильтр может перекрывать цвет).
 */
export function applyEyeColor(spine, eyeData) {
  if (!spine || !spine.skeleton) return;

  const [r, g, b] = buildEyeColor(eyeData);
  const sprite = spine._eyeSprite;

  if (sprite) {
    const toByte = v => Math.round(Math.min(1, Math.max(0, v)) * 255);
    sprite.tint = (toByte(r) << 16) | (toByte(g) << 8) | toByte(b);

    const mainSlots = [
      spine.skeleton.findSlot('eyes'),
      spine.skeleton.findSlot('eyes2')
    ].filter(Boolean);

    mainSlots.forEach(slot => {
      if (!slot.color) return;
      if (typeof slot.color.set === 'function') {
        slot.color.set(slot.color.r, slot.color.g, slot.color.b, 0);
      } else {
        slot.color.a = 0;
      }
    });
    return;
  }

  const skeleton = spine.skeleton;
  const slots = [
    skeleton.findSlot('eyes'),
    skeleton.findSlot('eyes2')
  ].filter(Boolean);

  slots.forEach(slot => {
    if (!slot.color) return;

    if (typeof slot.color.set === 'function') {
      slot.color.set(r, g, b, slot.color.a ?? 1);
    } else {
      slot.color.r = r;
      slot.color.g = g;
      slot.color.b = b;
    }
  });
}

/**
 * Применяет все настройки персонажа (телосложение + цвета) к Spine-объекту.
 * Вызывается из main.js после createCharacters.
 */
export function applyCharacterData(spine, charData) {
  if (!charData) return;
  applyCharacterBuild(spine, charData.build);
  applyCharacterColors(spine, charData.app);

  // Масштаб по размеру (size 0..1, базовый масштаб 0.7)
  if (charData.size !== undefined) {
    spine.scale.set(charData.size);
  }
}

// ─── Переключение позы персонажа (Сесть / Поспать) ────────────────────────

// Слоты, видимые в обычном состоянии (анимация stay/walk)
const NORMAL_SLOTS = ['Paw PZ', 'Paw PP', 'tail', 'body', 'Paw LP', 'neck', 'head', 'eyes', 'eyes2', 'ear', 'Paw LZ'];
const SIT_SLOT = 'Sit';
const SLEEP_SLOT = 'sleep';

function hidePoseSlots(skeleton) {
  if (!skeleton) return;
  [SIT_SLOT, SLEEP_SLOT].forEach(slotName => {
    const slot = skeleton.findSlot(slotName);
    if (slot) slot.setAttachment(null);
  });
}

// Переключить позу персонажа: 'normal' | 'sit' | 'sleep'
// spine — объект Spine (idleChar)
export function setCharacterPose(spine, pose) {
  if (!spine || !spine.skeleton) return;

  const skeleton = spine.skeleton;
  
  console.log(
  skeleton.slots.map(s => ({
    name: s.data.name,
    attachment: s.attachment?.name
  }))
);
  const skeletonData = skeleton.data;

  // Текущее телосложение, применённое через applyCharacterBuild — нужно,
  // чтобы при возврате в "normal" слоты "body"/"neck" получили ПРАВИЛЬНЫЙ
  // (а не дефолтный худой) attachment, соответствующему выбранному build.
  const { skinName, bodyKey, neckKey } = resolveBuildKeys(spine._charBuild);
  const buildSkin = skeletonData.findSkin(skinName);
  const BUILD_ATTACHMENT_KEYS = { body: bodyKey, neck: neckKey };

  const showNormal = (pose === 'normal');
  for (const slotName of NORMAL_SLOTS) {
    const slot = skeleton.findSlot(slotName);
    if (!slot) continue;

    const showThisSlot = showNormal || (pose === 'sit' && slotName === 'eyes2');
    if (showThisSlot) {
      let att = null;
      if (BUILD_ATTACHMENT_KEYS[slotName] && buildSkin) {
        const slotIndex = skeletonData.findSlotIndex(slotName);
        att = buildSkin.getAttachment(slotIndex, BUILD_ATTACHMENT_KEYS[slotName]);
      }
      if (!att) {
        const slotData = skeletonData.findSlot(slotName);
        const attName = slotData ? slotData.attachmentName : null;
        att = attName ? skeleton.getAttachmentByName(slotName, attName) : null;
      }
      slot.setAttachment(att);
    } else {
      slot.setAttachment(null);
    }
  }

  const sitSlot = skeleton.findSlot(SIT_SLOT);
  if (sitSlot) {
    if (pose === 'sit') {
      const sitAtt = skeleton.getAttachmentByName(SIT_SLOT, SIT_SLOT);
      if (!sitAtt) {
        console.warn('setCharacterPose: attachment "' + SIT_SLOT + '" не найден в слоте "' + SIT_SLOT + '" (skeleton.skin=', skeleton.skin, ', defaultSkin=', skeletonData.defaultSkin, ')');
      }
      sitSlot.setAttachment(sitAtt);
      if (spine.state && typeof spine.state.setAnimation === 'function') {
        spine.state.setAnimation(0, SIT_SLOT, true);
      }
    } else {
      sitSlot.setAttachment(null);
    }
  } else {
    console.warn('setCharacterPose: слот "' + SIT_SLOT + '" не найден на скелете');
  }

  const sleepSlot = skeleton.findSlot(SLEEP_SLOT);
  if (sleepSlot) {
    if (pose === 'sleep') {
      if (spine.state && typeof spine.state.clearTrack === 'function') {
        spine.state.clearTrack(0);
      }
      const sleepAtt = skeleton.getAttachmentByName(SLEEP_SLOT, SLEEP_SLOT);
      if (!sleepAtt) {
        console.warn('setCharacterPose: attachment "' + SLEEP_SLOT + '" не найден в слоте "' + SLEEP_SLOT + '"');
      }
      sleepSlot.setAttachment(sleepAtt);
    } else {
      sleepSlot.setAttachment(null);
    }
  } else {
    console.warn('setCharacterPose: слот "' + SLEEP_SLOT + '" не найден на скелете');
  }

  if (pose === 'normal' && spine.state && typeof spine.state.setAnimation === 'function') {
    spine.state.setAnimation(0, spine._idleAnim || 'stay', true);
  }

  skeleton.updateWorldTransform();
}