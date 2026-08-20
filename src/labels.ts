import * as THREE from 'three';

/** Billboard text label; heightFt controls on-screen size in world feet. */
export function makeTextSprite(text: string, heightFt = 3, color = '#3d4750'): THREE.Sprite {
  const fontPx = 64;
  const pad = 12;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = `600 ${fontPx}px system-ui, sans-serif`;
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width) + pad * 2;
  canvas.height = fontPx + pad * 2;
  // Resizing the canvas resets its context state, so set the font again.
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, pad, canvas.height / 2);
  ctx.fillStyle = color;
  ctx.fillText(text, pad, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  sprite.scale.set(heightFt * (canvas.width / canvas.height), heightFt, 1);
  return sprite;
}
