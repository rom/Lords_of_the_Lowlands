// Effect sprites: soft, lumpy smoke / dust puffs and additive glows,
// pre-rendered once and stamped with drawImage (cheaper and much softer than
// filling flat circles every frame), plus shockwave rings for explosions.
import { hash2 } from '../util.js';

const cache = new Map();
const S = 64; // sprite size (px); drawn scaled to the particle radius

function canvas(n) { const c = document.createElement('canvas'); c.width = n; c.height = n; return c; }

// Soft puff of smoke / dust in colour rgb ([r,g,b]); v = shape variant 0..3.
// Lit from the upper left with a darker underside so the puffs read as volume.
export function puffSprite(rgb, v = 0) {
  const key = 'p' + rgb.join(',') + '|' + v;
  let c = cache.get(key);
  if (c) return c;
  c = canvas(S);
  const ctx = c.getContext('2d');
  const [r, g, b] = rgb;
  const blobs = [[0, 0, 0.62]];
  for (let i = 0; i < 6; i++) {
    const a = hash2(v, i, 41) * 6.28, d = 0.18 + hash2(v, i, 42) * 0.2;
    blobs.push([Math.cos(a) * d, Math.sin(a) * d * 0.85, 0.3 + hash2(v, i, 43) * 0.18]);
  }
  for (const [bx, by, br] of blobs) {
    const x = S / 2 + bx * S / 2, y = S / 2 + by * S / 2, R = br * S / 2;
    const gr = ctx.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.05, x, y, R);
    gr.addColorStop(0, `rgba(${Math.min(255, r * 1.25) | 0},${Math.min(255, g * 1.25) | 0},${Math.min(255, b * 1.25) | 0},0.55)`);
    gr.addColorStop(0.55, `rgba(${r},${g},${b},0.38)`);
    gr.addColorStop(1, `rgba(${(r * 0.7) | 0},${(g * 0.7) | 0},${(b * 0.7) | 0},0)`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
  }
  cache.set(key, c);
  return c;
}

// Additive glow: white-hot core fading through rgb to transparent.
export function glowSprite(rgb, core = 1) {
  const key = 'g' + rgb.join(',') + '|' + core;
  let c = cache.get(key);
  if (c) return c;
  c = canvas(S);
  const ctx = c.getContext('2d');
  const [r, g, b] = rgb;
  const gr = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, `rgba(255,250,225,${core})`);
  gr.addColorStop(0.22, `rgba(${Math.min(255, r + 40)},${Math.min(255, g + 40)},${Math.min(255, b + 30)},0.85)`);
  gr.addColorStop(0.55, `rgba(${r},${g},${b},0.35)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, S, S);
  cache.set(key, c);
  return c;
}

// draw a sprite centred on (x, y) with radius rad
export function stamp(ctx, spr, x, y, rad, alpha) {
  if (alpha <= 0.005 || rad <= 0.2) return;
  ctx.globalAlpha = alpha > 1 ? 1 : alpha;
  ctx.drawImage(spr, x - rad, y - rad, rad * 2, rad * 2);
  ctx.globalAlpha = 1;
}

// Expanding ground shockwave of an explosion: k = 0..1 progress, R = max
// radius in px. A dust ring with a bright leading edge, flattened to the ground.
export function shockwave(ctx, x, y, k, R, dusty = true) {
  const r = R * (0.15 + 0.85 * (1 - (1 - k) * (1 - k)));
  const a = (1 - k);
  ctx.save();
  ctx.translate(x, y); ctx.scale(1, 0.5);
  if (dusty) {
    ctx.lineWidth = 3 + 7 * (1 - k);
    ctx.strokeStyle = `rgba(150,128,96,${0.35 * a})`;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, 7); ctx.stroke();
  }
  ctx.lineWidth = 1.5 + 1.5 * (1 - k);
  ctx.strokeStyle = `rgba(255,236,190,${0.75 * a * a})`;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
  ctx.restore();
}
