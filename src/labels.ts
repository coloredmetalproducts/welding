import * as THREE from 'three';

/**
 * Billboard text label. Accepts '\n' for multiple lines; `heightFt` sets the
 * per-line size in world feet so labels stay legible in both camera modes.
 */
export function makeTextSprite(text: string, heightFt = 3, color = '#3d4750'): THREE.Sprite {
  const lines = text.split('\n');
  const fontPx = 64;
  const lineGap = 1.25;
  const pad = 14;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = `600 ${fontPx}px system-ui, sans-serif`;

  ctx.font = font;
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  canvas.width = Math.ceil(widest) + pad * 2;
  canvas.height = Math.ceil(fontPx * lineGap * lines.length) + pad * 2;

  // Resizing the canvas resets its context state, so restore the font after.
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  lines.forEach((line, i) => {
    const y = pad + fontPx * lineGap * (i + 0.5);
    ctx.strokeText(line, canvas.width / 2, y);
    ctx.fillStyle = color;
    ctx.fillText(line, canvas.width / 2, y);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  // Callouts sit outside the shell, so draw them over everything rather than
  // letting a wall between camera and label clip them mid-line.
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    }),
  );
  sprite.renderOrder = 10;
  const totalHeight = heightFt * lines.length * lineGap;
  sprite.scale.set(totalHeight * (canvas.width / canvas.height), totalHeight, 1);
  return sprite;
}

/** Format decimal feet as feet-inches, e.g. 3.5 -> 3'-6". */
export function formatFeet(value: number): string {
  const feet = Math.floor(value);
  const inches = Math.round((value - feet) * 12);
  return inches === 12 ? `${feet + 1}'-0"` : `${feet}'-${inches}"`;
}
