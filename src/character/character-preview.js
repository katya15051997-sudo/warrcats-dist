export const BUILD_IMGS = {
  lean:  '/assets/spine/Cat_lean.png',
  large: '/assets/spine/Cat_massive.png',
  fat:   '/assets/spine/Cat_fat.png',
};

export function buildImg(build) {
  return BUILD_IMGS[build] || BUILD_IMGS.lean;
}

export function bodyToFilter(body) {
  if (!body) return '';
  const catHue = v => v <= 70
    ? Math.round((v / 70) * 60)
    : Math.round(180 + ((v - 70) / 30) * 60);
  const hslH      = catHue(body.hue);
  const hueRotate = hslH - 38;
  const satPct    = Math.round(10 + (Math.round(body.saturation) / 100) * 350);
  const brightF   = (0.3 + ((body.brightness - 10) / 80) * 1.3).toFixed(2);
  return `sepia(1) hue-rotate(${hueRotate}deg) saturate(${satPct}%) brightness(${brightF})`;
}
