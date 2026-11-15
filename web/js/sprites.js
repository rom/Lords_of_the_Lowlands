// Procedural art: terrain palettes, buildings, resources, units and icons.
// Everything is drawn with canvas paths so no image assets are needed.
import { TW, TH, ZH, TEAM, hexToRgb, shade, mix, rgb, hash2 } from './util.js';
import { recStart, recStop, castShadows, setGround, flagCapture, drawFlagCloth } from './art/kit.js';
import { drawShip } from './art/naval.js';
import { drawBuildingBody, drawConstruction, drawAnim, hasAnim } from './art/buildings.js';
import { drawHuman, drawUnitFig } from './art/units.js';
import { drawTree, TREE_VARIANTS } from './art/flora.js';

export { TREE_VARIANTS };

// ---------------------------------------------------------------- palettes
// terrain: grass, dirt, sand, water, mountain, shallow, road
export const THEMES = {
  temperate: { t: [[84, 128, 48], [124, 100, 62], [205, 186, 132], [34, 82, 120], [112, 106, 98], [72, 128, 140], [150, 136, 110]], tree: 'mixed', sky: '#9ec3dd', fog: [12, 16, 10] },
  desert: { t: [[190, 162, 98], [160, 118, 72], [226, 200, 146], [38, 108, 136], [154, 112, 78], [80, 150, 160], [176, 150, 112]], tree: 'palm', sky: '#e8d2a4', fog: [20, 14, 8] },
  winter: { t: [[226, 232, 238], [150, 148, 152], [200, 206, 214], [52, 86, 118], [122, 126, 138], [130, 170, 196], [176, 170, 164]], tree: 'snowpine', sky: '#c7d6e4', fog: [12, 14, 18] },
  tropical: { t: [[58, 128, 46], [118, 88, 50], [232, 216, 162], [24, 132, 150], [88, 96, 78], [64, 172, 178], [150, 130, 96]], tree: 'jungle', sky: '#a9dbe6', fog: [8, 16, 10] },
  moon: { t: [[148, 148, 150], [112, 112, 116], [178, 178, 180], [16, 16, 22], [78, 78, 84], [96, 96, 104], [130, 136, 148]], tree: 'crystal', sky: '#05060c', fog: [4, 4, 8] },
  mars: { t: [[184, 96, 56], [146, 70, 42], [206, 136, 88], [52, 26, 22], [118, 58, 40], [140, 86, 66], [170, 120, 100]], tree: 'crystal', sky: '#d9a070', fog: [16, 6, 4] },
  space: { t: [[66, 76, 92], [52, 58, 72], [88, 94, 110], [4, 4, 14], [88, 80, 74], [60, 90, 120], [72, 110, 140]], tree: 'crystal', sky: '#020208', fog: [2, 2, 6] },
};

export function theme(name) { return THEMES[name] || THEMES.temperate; }

export const RES_COLORS = ['#d9603b', '#8b5a2b', '#9aa0a6', '#f2c230', '#43d2ff'];

// ------------------------------------------------------------ 3D helpers
// local coordinates in tile units: (x, y) ground, z height (1 = ZH px)
export function P(x, y, z = 0) { return [(x - y) * TW / 2, (x + y) * TH / 2 - z * ZH]; }

export function face(ctx, pts, fill, stroke) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [sx, sy] = P(pts[i][0], pts[i][1], pts[i][2]);
    if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
  }
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

// axis aligned box; visible faces are +x (right) and +y (left) and top.
export function box(ctx, x0, y0, x1, y1, z0, z1, col, opt = {}) {
  const c = hexToRgb(col);
  const L = opt.left ?? 0.82, R = opt.right ?? 0.62, T = opt.top ?? 1.05;
  face(ctx, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], shade(c, L), opt.edge);
  face(ctx, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], shade(c, R), opt.edge);
  if (!opt.noTop) face(ctx, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], shade(c, T), opt.edge);
}

// gable roof along x (ridge parallel to x) or y
export function gable(ctx, x0, y0, x1, y1, z, h, col, alongX = true, over = 0.08) {
  const c = hexToRgb(col);
  x0 -= over; y0 -= over; x1 += over; y1 += over;
  if (alongX) {
    const ym = (y0 + y1) / 2;
    face(ctx, [[x0, y0, z], [x1, y0, z], [x1, ym, z + h], [x0, ym, z + h]], shade(c, 1.1));
    face(ctx, [[x0, y1, z], [x1, y1, z], [x1, ym, z + h], [x0, ym, z + h]], shade(c, 0.78));
    face(ctx, [[x1, y0, z], [x1, y1, z], [x1, ym, z + h]], shade(c, 0.55));
  } else {
    const xm = (x0 + x1) / 2;
    face(ctx, [[x0, y0, z], [x0, y1, z], [xm, y1, z + h], [xm, y0, z + h]], shade(c, 1.1));
    face(ctx, [[x1, y0, z], [x1, y1, z], [xm, y1, z + h], [xm, y0, z + h]], shade(c, 0.62));
    face(ctx, [[x0, y1, z], [x1, y1, z], [xm, y1, z + h]], shade(c, 0.8));
  }
}

export function pyramid(ctx, x0, y0, x1, y1, z, h, col) {
  const c = hexToRgb(col), xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
  face(ctx, [[x0, y0, z], [x1, y0, z], [xm, ym, z + h]], shade(c, 1.1));
  face(ctx, [[x0, y0, z], [x0, y1, z], [xm, ym, z + h]], shade(c, 1.0));
  face(ctx, [[x0, y1, z], [x1, y1, z], [xm, ym, z + h]], shade(c, 0.8));
  face(ctx, [[x1, y0, z], [x1, y1, z], [xm, ym, z + h]], shade(c, 0.6));
}

export function cone(ctx, cx, cy, z, r, h, col, segs = 14) {
  const c = hexToRgb(col);
  const top = P(cx, cy, z + h);
  for (let i = 0; i < segs; i++) {
    const a0 = i / segs * Math.PI * 2, a1 = (i + 1) / segs * Math.PI * 2;
    const nx = Math.cos((a0 + a1) / 2), ny = Math.sin((a0 + a1) / 2);
    if (nx + ny < -0.3) continue;
    const l = 0.62 + 0.38 * ((ny - nx) * 0.5 + 0.5);
    const p0 = P(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z), p1 = P(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z);
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(top[0], top[1]); ctx.closePath();
    ctx.fillStyle = shade(c, l); ctx.fill();
  }
}

export function cylinder(ctx, cx, cy, z0, z1, r, col, segs = 16) {
  const c = hexToRgb(col);
  for (let i = 0; i < segs; i++) {
    const a0 = i / segs * Math.PI * 2, a1 = (i + 1) / segs * Math.PI * 2;
    const nx = Math.cos((a0 + a1) / 2), ny = Math.sin((a0 + a1) / 2);
    if (nx + ny < -0.05) continue;
    const l = 0.6 + 0.4 * ((ny - nx) * 0.5 + 0.5);
    face(ctx, [[cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z0], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z0],
      [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z1], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z1]], shade(c, l));
  }
  // top ellipse
  ctx.beginPath();
  for (let i = 0; i <= segs; i++) {
    const a = i / segs * Math.PI * 2;
    const p = P(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z1);
    if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
  }
  ctx.fillStyle = shade(c, 1.08); ctx.fill();
}

export function dome(ctx, cx, cy, z, r, col, glow) {
  const [sx, sy] = P(cx, cy, z);
  const rx = r * TW / 2 * 1.41, ry = rx * 0.5;
  const g = ctx.createRadialGradient(sx - rx * 0.35, sy - ry * 1.6, rx * 0.1, sx, sy - ry, rx * 1.2);
  g.addColorStop(0, shade(col, 1.5)); g.addColorStop(0.6, shade(col, 0.95)); g.addColorStop(1, shade(col, 0.55));
  ctx.beginPath();
  ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI);
  ctx.ellipse(sx, sy, rx, rx * 0.95, 0, Math.PI, 0);
  ctx.fillStyle = g; ctx.fill();
  if (glow) { ctx.strokeStyle = glow; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI); ctx.stroke(); }
}

// detail on the +y (left) face: u along x, v height
function leftPt(x0, y1, u, v) { return P(x0 + u, y1, v); }
function rightPt(x1, y0, u, v) { return P(x1, y0 + u, v); }
export function winL(ctx, x0, y1, u, v, w, h, col) {
  const a = leftPt(x0, y1, u, v), b = leftPt(x0, y1, u + w, v), c = leftPt(x0, y1, u + w, v + h), d = leftPt(x0, y1, u, v + h);
  ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.lineTo(...d); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
}
export function winR(ctx, x1, y0, u, v, w, h, col) {
  const a = rightPt(x1, y0, u, v), b = rightPt(x1, y0, u + w, v), c = rightPt(x1, y0, u + w, v + h), d = rightPt(x1, y0, u, v + h);
  ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.lineTo(...d); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
}

// ------------------------------------------------------------- buildings
// Buildings are drawn by ./art/buildings.js with textured, lit planes, in
// three layers (ground patch, soft cast shadows, body) and cached at 2x.
const bcache = new Map();
let scratch = null;
function layer(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

// Returns a cached canvas for a building and its anchor (screen offset of
// the footprint's top corner). live=true leaves out parts that
// drawBuildingAnim animates (windmill sails, glows) so they can be drawn live.
export function buildingSprite(type, era, team, size, stage, live = false) {
  const key = stage < 3 ? `${type}|${era}|-|${size}|${stage}|0` : `${type}|${era}|${team}|${size}|${stage}|${live ? 1 : 0}`;
  let c = bcache.get(key);
  if (c) return c;
  // backing-store scale: 2x, 3x on high-density displays (zoom goes up to 2)
  const K = spriteScale();
  const padL = 44, padR = 150, top = 220, bottom = 24 + (type === 'dock' ? 60 : 0);
  const w = size * TW + padL + padR, h = size * TH + top + bottom;
  const ox = size * TW / 2 + padL, oy = top;
  const W2 = w * K, H2 = h * K;
  if (!scratch || scratch.g.width < W2 || scratch.g.height < H2) scratch = { g: layer(W2, H2), b: layer(W2, H2), c: layer(W2, H2), o: layer(W2, H2) };
  const gctx = scratch.g.getContext('2d'), bctx = scratch.b.getContext('2d'), ctx = scratch.c.getContext('2d', { willReadFrequently: true }), octx = scratch.o.getContext('2d');
  for (const c2 of [gctx, bctx, ctx, octx]) { c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, c2.canvas.width, c2.canvas.height); }
  for (const c2 of [gctx, bctx]) c2.setTransform(K, 0, 0, K, ox * K, oy * K);
  setGround(gctx); recStart();
  const flags = stage === 3 && live ? [] : null;
  flagCapture(flags);
  try {
    if (stage < 3) drawConstruction(bctx, type, era, size, stage);
    else drawBuildingBody(bctx, type, era, team, size, 0, live);
  } finally { setGround(null); flagCapture(null); }
  const vols = recStop();
  // soft dark silhouette outline around the body for readability
  const ow = K * 0.6;
  for (const [dx, dy] of [[-ow, 0], [ow, 0], [0, -ow], [0, ow]]) octx.drawImage(scratch.b, 0, 0, W2, H2, dx, dy, W2, H2);
  octx.globalCompositeOperation = 'source-in'; octx.fillStyle = 'rgba(18,14,12,0.5)'; octx.fillRect(0, 0, W2, H2); octx.globalCompositeOperation = 'source-over';
  ctx.drawImage(scratch.g, 0, 0, W2, H2, 0, 0, W2, H2);
  ctx.setTransform(K, 0, 0, K, ox * K, oy * K);
  castShadows(ctx, vols, type === 'farm' ? 0.2 : 0.36);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (type !== 'farm') ctx.drawImage(scratch.o, 0, 0, W2, H2, 0, 0, W2, H2);
  ctx.drawImage(scratch.b, 0, 0, W2, H2, 0, 0, W2, H2);
  // crop to the drawn content to keep the cache small
  let x0 = 0, y0 = 0, x1 = W2, y1 = H2;
  try {
    const d = ctx.getImageData(0, 0, W2, H2).data;
    x0 = W2; y0 = H2; x1 = 0; y1 = 0;
    for (let y = 0; y < H2; y += 2) { const row = y * W2 * 4; for (let x = 0; x < W2; x += 2) if (d[row + x * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (x1 < x0) { x0 = 0; y0 = 0; x1 = K; y1 = K; }
    x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(W2, x1 + 4); y1 = Math.min(H2, y1 + 4);
  } catch (e) { /* keep full size */ }
  // align the crop to whole logical pixels
  x0 -= x0 % K; y0 -= y0 % K; x1 = Math.min(W2, x1 + (K - x1 % K) % K); y1 = Math.min(H2, y1 + (K - y1 % K) % K);
  const cv = layer(x1 - x0, y1 - y0);
  cv.getContext('2d').drawImage(scratch.c, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
  c = { canvas: cv, ox: ox - x0 / K, oy: oy - y0 / K, w: (x1 - x0) / K, h: (y1 - y0) / K, flags };
  bcache.set(key, c);
  return c;
}
let SPK = 0;
function spriteScale() {
  if (!SPK) SPK = (typeof window !== 'undefined' && (window.devicePixelRatio || 1) >= 1.5) ? 3 : 2;
  return SPK;
}
// approximate bytes held by the cached building sprites (for diagnostics)
export function spriteCacheBytes() {
  let n = 0;
  for (const c of bcache.values()) n += c.canvas.width * c.canvas.height * 4;
  for (const c of dcache.values()) n += c.canvas.width * c.canvas.height * 4;
  return { buildings: bcache.size, damaged: dcache.size, bytes: n };
}

// Waving flag cloths of a live building sprite (sp.flags, recorded when the
// sprite was built with live=true); origin = footprint top corner.
export function drawBuildingFlags(ctx, sp, t) {
  const f = sp && sp.flags;
  if (!f) return;
  for (let i = 0; i < f.length; i++) { const q = f[i]; drawFlagCloth(ctx, q[0], q[1], q[2], q[3], t, q[4]); }
}

// true when drawBuildingAnim has something to animate for this building
export function buildingAnimated(type, era) { return hasAnim(type, era); }
// Draws the live (animated) overlay of a building; origin = footprint top corner.
export function drawBuildingAnim(ctx, type, era, team, s, t) { if (hasAnim(type, era)) drawAnim(ctx, type, era, team, s, t); }

// Draws a finished building into ctx with origin at the footprint top corner.
export function drawBuilding(ctx, type, era, team, s, t) {
  const sp = buildingSprite(type, era, team, s, 3, true);
  ctx.drawImage(sp.canvas, -sp.ox, -sp.oy, sp.w, sp.h);
  drawBuildingAnim(ctx, type, era, team, s, t || 0);
  drawBuildingFlags(ctx, sp, t || 0);
}

// Damaged variant of a cached building sprite (level 1: soot and cracks,
// 2: heavy scorching and holes). Painted with source-atop so the marks stay
// on the building's own pixels; cached per sprite and level.
const dcache = new Map();
export function damageSprite(sp, level, key) {
  const k = key + '|' + level + '|' + sp.w + 'x' + sp.h;
  let c = dcache.get(k);
  if (c) return c;
  const W = sp.canvas.width, H = sp.canvas.height;
  const cv = layer(W, H), ctx = cv.getContext('2d');
  ctx.drawImage(sp.canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  let seed = 0; for (let i = 0; i < k.length; i++) seed = (seed * 31 + k.charCodeAt(i)) | 0;
  const rnd = (i) => hash2(seed & 1023, i, 61);
  const nS = level === 1 ? 4 : 9;
  for (let i = 0; i < nS; i++) {
    const x = W * (0.15 + rnd(i) * 0.7), y = H * (0.3 + rnd(20 + i) * 0.62), r = Math.min(W, H) * (0.08 + rnd(40 + i) * (level === 1 ? 0.1 : 0.16));
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(16,10,6,${level === 1 ? 0.5 : 0.75})`); g.addColorStop(1, 'rgba(16,10,6,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // cracks: dark jagged lines with a lit lower edge
  const nC = level === 1 ? 4 : 7;
  for (let i = 0; i < nC; i++) {
    let x = W * (0.2 + rnd(60 + i) * 0.6), y = H * (0.45 + rnd(70 + i) * 0.4);
    const pts = [[x, y]];
    for (let j = 0; j < 4; j++) { x += (rnd(80 + i * 7 + j) - 0.5) * 7; y += 2.5 + rnd(90 + i * 7 + j) * 4; pts.push([x, y]); }
    ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(20,14,10,0.7)'; ctx.beginPath(); pts.forEach((p, j) => j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
    ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(255,240,220,0.2)'; ctx.beginPath(); pts.forEach((p, j) => j ? ctx.lineTo(p[0] + 1, p[1] + 1) : ctx.moveTo(p[0] + 1, p[1] + 1)); ctx.stroke();
  }
  if (level === 2) for (let i = 0; i < 3; i++) { // charred holes with ember glow
    const x = W * (0.25 + rnd(120 + i) * 0.5), y = H * (0.45 + rnd(130 + i) * 0.35), r = 5 + rnd(140 + i) * 6;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
    g.addColorStop(0, 'rgba(255,110,30,0.75)'); g.addColorStop(0.35, 'rgba(60,20,8,0.9)'); g.addColorStop(1, 'rgba(10,6,4,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2);
  }
  // fire anchors: just below the silhouette's upper edge (roof lines), for live flames
  let fire = [];
  if (level === 2) {
    try {
      const d = ctx.getImageData(0, 0, W, H).data;
      for (let i = 0; i < 4; i++) {
        const x = Math.floor(W * (0.2 + rnd(170 + i) * 0.6));
        for (let y = 0; y < H; y += 2) if (d[(y * W + x) * 4 + 3] > 200) { fire.push([x * sp.w / W, y * sp.h / H + 4]); break; }
      }
    } catch (e) { fire = []; }
  }
  ctx.globalCompositeOperation = 'source-over';
  c = { canvas: cv, ox: sp.ox, oy: sp.oy, w: sp.w, h: sp.h, fire };
  if (dcache.size > 200) dcache.clear();
  dcache.set(k, c);
  return c;
}

// rubble left by a collapsed building (size s tiles, variant v); anchor = centre
const rubcache = new Map();
export function rubbleSprite(s, v, themeName) {
  const key = `${s}|${v}|${themeName}`;
  let c = rubcache.get(key);
  if (c) return c;
  const w = s * TW + 24, h = s * TH + 40;
  const cv = layer(w * 2, h * 2), ctx = cv.getContext('2d');
  ctx.scale(2, 2); ctx.translate(w / 2, h - s * TH / 2 - 8);
  const rnd = (i) => hash2(v * 13 + s, i, 71);
  const off = themeName === 'space' || themeName === 'moon' || themeName === 'mars';
  // dusty base
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * TW * 0.5);
  g.addColorStop(0, 'rgba(60,48,36,0.55)'); g.addColorStop(1, 'rgba(60,48,36,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, s * TW * 0.5, s * TH * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  const n = 10 + s * 10;
  const items = [];
  for (let i = 0; i < n; i++) { const a = rnd(i) * 6.28, d = Math.sqrt(rnd(100 + i)) * 0.45 * s; items.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, i }); }
  items.sort((p, q) => (p.x + p.y) - (q.x + q.y));
  for (const { x, y, i } of items) {
    const [px, py] = P(x, y, 0);
    const hgt = (1 - Math.hypot(x, y) / (0.5 * s + 0.01)) * 8 * Math.min(2, s);
    const kind = rnd(200 + i);
    if (kind < 0.22 && !off) { // charred beam
      const a = rnd(300 + i) * 3.14, L = 6 + rnd(310 + i) * 10;
      ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px - Math.cos(a) * L / 2, py - hgt - Math.sin(a) * L / 4); ctx.lineTo(px + Math.cos(a) * L / 2, py - hgt + Math.sin(a) * L / 4); ctx.stroke();
      ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 1; ctx.stroke();
    } else { // masonry chunk
      const r = 2 + rnd(400 + i) * 3.5, col = off ? [120, 124, 132] : rnd(410 + i) < 0.5 ? [150, 140, 124] : [124, 96, 80];
      ctx.fillStyle = shade(col, 1.1); ctx.beginPath(); ctx.moveTo(px - r, py - hgt); ctx.lineTo(px, py - hgt - r * 0.6); ctx.lineTo(px + r, py - hgt); ctx.lineTo(px, py - hgt + r * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(col, 0.75); ctx.beginPath(); ctx.moveTo(px - r, py - hgt); ctx.lineTo(px, py - hgt + r * 0.5); ctx.lineTo(px, py - hgt + r * 1.1); ctx.lineTo(px - r, py - hgt + r * 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(col, 0.55); ctx.beginPath(); ctx.moveTo(px + r, py - hgt); ctx.lineTo(px, py - hgt + r * 0.5); ctx.lineTo(px, py - hgt + r * 1.1); ctx.lineTo(px + r, py - hgt + r * 0.6); ctx.closePath(); ctx.fill();
    }
  }
  c = { canvas: cv, ox: w / 2, oy: h - s * TH / 2 - 8, w, h };
  rubcache.set(key, c);
  return c;
}

// chimneys emitting smoke: [x, y, z] in footprint-local tile units
export function smokePoints(type, era, s) {
  switch (type) {
    case 'house':
      if (era === 'stone') return [[0.95, 0.95, 1.25]];
      if (era === 'iron') return [[1.0, 1.0, 1.35]];
      if (era === 'medieval') return [[1.4, 0.75, 1.82]];
      if (era === 'gunpowder') return [[0.45, 1.0, 2.22], [1.55, 1.0, 2.22]];
      if (era === 'industrial') return [[0.5, 0.6, 2.37], [1.4, 0.6, 2.37]];
      return [];
    case 'town_center':
      if (era === 'iron') return [[1.5, 1.5, 1.6]];
      if (era === 'gunpowder') return [[0.7, 1.0, 2.07], [2.3, 1.0, 2.07]];
      return [];
    case 'generator': return era === 'industrial' ? [[1.5, 1.4, 2.75], [1.1, 1.55, 2.35]] : [];
    case 'barracks': return era === 'industrial' ? [[0.55, 0.6, 2.55]] : [];
    case 'workshop': return era === 'industrial' || era === 'gunpowder' ? [[0.55, 0.6, 2.45]] : [];
    case 'lumber_camp': return era === 'industrial' || era === 'modern' ? [[0.4, 0.4, 1.95]] : [];
    case 'mining_camp': return era === 'industrial' || era === 'modern' ? [[0.45, 0.45, 2.05]] : [];
    case 'dock': return era === 'industrial' ? [[0.5, 0.5, 2.05]] : [];
  }
  return [];
}

// ------------------------------------------------------------- resources
const rcache = new Map();

// level (optional, 1..4): how much is left; berries and ore piles shrink.
export function resourceSprite(type, themeName, variant, level = 4) {
  if (type !== 'berry' && type !== 'gold' && type !== 'stone' && type !== 'crystal') level = 4;
  const key = `${type}|${themeName}|${variant}|${level}`;
  let c = rcache.get(key);
  if (c) return c;
  const tree = type === 'tree';
  const w = tree ? 128 : 96, h = tree ? 136 : 120, ax = tree ? 50 : w / 2, ay = tree ? 114 : h - 22;
  const cv = document.createElement('canvas');
  cv.width = w * 2; cv.height = h * 2;
  const ctx = cv.getContext('2d');
  ctx.scale(2, 2);
  ctx.translate(ax, ay);
  if (tree) drawTree(ctx, theme(themeName).tree, themeName, variant);
  else drawResource(ctx, type, theme(themeName).tree, variant, level);
  c = { canvas: cv, ox: ax, oy: ay, w, h };
  rcache.set(key, c);
  return c;
}

function blob(ctx, x, y, r, col, hl) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
  g.addColorStop(0, hl); g.addColorStop(1, col);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

function drawResource(ctx, type, treeStyle, v, level = 4) {
  const rnd = (i) => hash2(v, i, 99);
  if (type === 'fish') { drawFish(ctx, treeStyle, v); return; }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(4, 2, 16, 7, 0, 0, 7); ctx.fill();
  switch (type) {
    case 'berry': {
      const space = treeStyle === 'crystal';
      const leafD = space ? '#2a6a50' : '#2f5e26', leafL = space ? '#7cf0b0' : '#5e9c44';
      // woody stems, then a layered leaf mound with speckle, then fruit clusters
      ctx.strokeStyle = '#4a3420'; ctx.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo((rnd(200 + i) - 0.5) * 6, 0); ctx.lineTo((rnd(210 + i) - 0.5) * 18, -8 - rnd(220 + i) * 6); ctx.stroke(); }
      ctx.fillStyle = 'rgba(14,30,10,0.8)';
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc((rnd(i) - 0.5) * 18, -6 - rnd(10 + i) * 8, 7.6, 0, 7); ctx.fill(); }
      for (let i = 0; i < 6; i++) blob(ctx, (rnd(i) - 0.5) * 18, -6 - rnd(10 + i) * 8, 6.6, leafD, leafL);
      for (let i = 0; i < 30; i++) { ctx.fillStyle = rnd(300 + i) < 0.5 ? 'rgba(220,255,180,0.22)' : 'rgba(0,24,0,0.25)'; ctx.beginPath(); ctx.ellipse((rnd(310 + i) - 0.5) * 24, -3 - rnd(320 + i) * 16, 1.5, 0.9, rnd(330 + i) * 3, 0, 7); ctx.fill(); }
      const nb = [0, 4, 9, 14, 20][level];
      for (let i = 0; i < nb; i++) {
        const bx = (rnd(30 + i) - 0.5) * 22, by = -3 - rnd(60 + i) * 15;
        const c = space ? '#c0ff80' : (i % 4 === 3 ? '#6a2a8a' : i % 3 ? '#c4223a' : '#e0405a');
        for (let k = 0; k < 3; k++) { ctx.fillStyle = shade(c, 0.75 + k * 0.12); ctx.beginPath(); ctx.arc(bx + (k - 1) * 1.6, by + (k === 1 ? -1.2 : 0), 1.5, 0, 7); ctx.fill(); }
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(bx - 0.6, by - 1.8, 0.8, 0.8);
      }
      break;
    }
    case 'gold': case 'stone': case 'crystal': {
      const base = type === 'gold' ? [128, 112, 88] : type === 'stone' ? [140, 138, 132] : [60, 70, 90];
      const n = [0, 2, 3, 5, 6][level];
      const rocks = [];
      for (let i = 0; i < n; i++) rocks.push({ x: (rnd(i) - 0.5) * 24, y: -1 - rnd(10 + i) * 7, r: (6 + rnd(20 + i) * 5) * (0.7 + level * 0.075), i });
      rocks.sort((p, q) => p.y - q.y);
      if (type === 'stone' && level >= 3) { // quarried blocks
        for (let i = 0; i < 2; i++) { const bx = -12 + i * 16 + rnd(400 + i) * 4, by = 2 - i; ctx.fillStyle = shade(base, 1.15); ctx.beginPath(); ctx.moveTo(bx, by - 5); ctx.lineTo(bx + 5, by - 7.5); ctx.lineTo(bx + 10, by - 5); ctx.lineTo(bx + 5, by - 2.5); ctx.closePath(); ctx.fill(); ctx.fillStyle = shade(base, 0.85); ctx.beginPath(); ctx.moveTo(bx, by - 5); ctx.lineTo(bx + 5, by - 2.5); ctx.lineTo(bx + 5, by + 1); ctx.lineTo(bx, by - 1.5); ctx.closePath(); ctx.fill(); ctx.fillStyle = shade(base, 0.62); ctx.beginPath(); ctx.moveTo(bx + 5, by - 2.5); ctx.lineTo(bx + 10, by - 5); ctx.lineTo(bx + 10, by - 1.5); ctx.lineTo(bx + 5, by + 1); ctx.closePath(); ctx.fill(); }
      }
      for (const { x, y, r, i } of rocks) {
        // faceted boulder: outline, lit top-left facet, mid front, dark right
        const pk = [x - r * 0.15 + (rnd(500 + i) - 0.5) * r * 0.4, y - r * 1.15];
        ctx.fillStyle = 'rgba(20,18,16,0.75)';
        ctx.beginPath(); ctx.moveTo(x - r - 0.8, y + 2.6); ctx.lineTo(x - r * 0.7, y - r * 0.6); ctx.lineTo(pk[0], pk[1] - 0.9); ctx.lineTo(x + r * 0.75, y - r * 0.7); ctx.lineTo(x + r + 0.8, y + 2.6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = shade(base, 1.12); ctx.beginPath(); ctx.moveTo(x - r, y + 2); ctx.lineTo(x - r * 0.7, y - r * 0.6); ctx.lineTo(pk[0], pk[1]); ctx.lineTo(x - r * 0.05, y - r * 0.2); ctx.lineTo(x - r * 0.25, y + 2.2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = shade(base, 0.86); ctx.beginPath(); ctx.moveTo(x - r * 0.25, y + 2.2); ctx.lineTo(x - r * 0.05, y - r * 0.2); ctx.lineTo(pk[0], pk[1]); ctx.lineTo(x + r * 0.75, y - r * 0.7); ctx.lineTo(x + r * 0.45, y + 2.4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = shade(base, 0.6); ctx.beginPath(); ctx.moveTo(x + r * 0.45, y + 2.4); ctx.lineTo(x + r * 0.75, y - r * 0.7); ctx.lineTo(x + r, y + 2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 0.6); ctx.lineTo(pk[0], pk[1]); ctx.stroke();
        ctx.strokeStyle = shade(base, 0.45); ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 0.1); ctx.lineTo(x - r * 0.2, y - r * 0.35); ctx.lineTo(x + r * 0.1, y + 0.5); ctx.stroke();
        if (type === 'gold') { // veins
          ctx.strokeStyle = '#f2c230'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(x - r * 0.75, y - r * 0.1); ctx.lineTo(x - r * 0.35, y - r * 0.45); ctx.lineTo(x - r * 0.1, y - r * 0.2); ctx.lineTo(x + r * 0.35, y - r * 0.55); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,250,200,0.9)'; ctx.lineWidth = 0.4; ctx.stroke();
        }
      }
      if (type === 'gold') for (let i = 0; i < 3 + level * 2; i++) { const gx = (rnd(70 + i) - 0.5) * 24, gy = -1 - rnd(80 + i) * 12; ctx.fillStyle = i % 2 ? '#e8b020' : '#ffe070'; ctx.beginPath(); ctx.arc(gx, gy, 1.1 + rnd(90 + i) * 0.9, 0, 7); ctx.fill(); ctx.fillStyle = '#fffbe0'; ctx.fillRect(gx - 0.5, gy - 0.8, 0.7, 0.7); }
      if (type === 'gold' && level >= 3 && v % 2 === 0) { // miner's timber prop and a pick
        ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-15, 3); ctx.lineTo(-14, -11); ctx.moveTo(-6, 4); ctx.lineTo(-6.5, -10); ctx.stroke();
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-16, -11); ctx.lineTo(-5, -11.5); ctx.stroke();
        ctx.strokeStyle = '#6a4424'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(10, 2); ctx.lineTo(14, -7); ctx.stroke();
        ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(11, -8); ctx.quadraticCurveTo(14, -9, 17, -6); ctx.stroke();
      }
      if (type === 'crystal') for (let i = 0; i < 1 + level; i++) {
        const x = (rnd(50 + i) - 0.5) * 20, hh = 10 + rnd(55 + i) * 16;
        const g = ctx.createLinearGradient(x - 3, 0, x + 3, -hh); g.addColorStop(0, '#1a7aa8'); g.addColorStop(1, '#bff6ff');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 3, -4); ctx.lineTo(x, -4 - hh); ctx.lineTo(x + 3, -4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.moveTo(x - 1.6, -5); ctx.lineTo(x, -4 - hh); ctx.lineTo(x - 0.2, -5); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'carcass': {
      ctx.fillStyle = '#6a3a24'; ctx.beginPath(); ctx.ellipse(0, -3, 11, 5, 0.2, 0, 7); ctx.fill();
      ctx.fillStyle = '#a8584a'; ctx.beginPath(); ctx.ellipse(-2, -4, 6, 3, 0.2, 0, 7); ctx.fill();
      ctx.strokeStyle = '#e8dcc8'; ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-4 + i * 4, -6); ctx.lineTo(-5 + i * 4, -10); ctx.stroke(); }
      break;
    }
  }
}

// a school of fish under the surface: dark shadows, glints and ripples
function drawFish(ctx, treeStyle, v) {
  const rnd = (i) => hash2(v, i, 77);
  const alien = treeStyle === 'crystal';
  // darker, deeper patch
  const g = ctx.createRadialGradient(0, -2, 2, 0, -2, 22);
  g.addColorStop(0, alien ? 'rgba(80,40,120,0.35)' : 'rgba(0,30,50,0.32)'); g.addColorStop(1, 'rgba(0,30,50,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -2, 24, 12, 0, 0, 7); ctx.fill();
  for (let i = 0; i < 7; i++) {
    const x = (rnd(i) - 0.5) * 30, y = -2 + (rnd(i + 10) - 0.5) * 13, a = rnd(i + 20) * 6.28, l = 4 + rnd(i + 30) * 3;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.55); ctx.rotate(a);
    ctx.fillStyle = alien ? 'rgba(60,20,90,0.55)' : 'rgba(10,30,40,0.5)';
    ctx.beginPath(); ctx.ellipse(0, 0, l, l * 0.38, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-l * 0.8, 0); ctx.lineTo(-l * 1.5, -l * 0.4); ctx.lineTo(-l * 1.5, l * 0.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = alien ? 'rgba(200,140,255,0.55)' : 'rgba(200,230,240,0.45)'; ctx.beginPath(); ctx.ellipse(l * 0.2, -l * 0.12, l * 0.45, l * 0.12, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(235,250,255,0.55)'; ctx.lineWidth = 0.8;
  for (let i = 0; i < 3; i++) { const x = (rnd(40 + i) - 0.5) * 22, y = -2 + (rnd(50 + i) - 0.5) * 9, r = 3 + rnd(60 + i) * 5; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.45, 0, 0, 7); ctx.stroke(); }
  for (let i = 0; i < 5; i++) { const x = (rnd(70 + i) - 0.5) * 26, y = -2 + (rnd(80 + i) - 0.5) * 11; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x, y, 1.6, 0.8); }
  // a leaping fish
  const lx = (rnd(90) - 0.5) * 12;
  ctx.fillStyle = alien ? '#c8a0ff' : '#b8ccd8'; ctx.beginPath(); ctx.ellipse(lx, -9, 3.2, 1.3, -0.5, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(lx - 2.6, -7.6); ctx.lineTo(lx - 4.6, -7.6); ctx.lineTo(lx - 3.8, -5.6); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(lx + 1, -1.5, 4, 1.6, 0, 0, 7); ctx.stroke();
}

// ------------------------------------------------------------------ units
// Unit drawing is done live every frame (see ./art/units.js). (x, y) is the
// screen position of the unit's feet.
export { drawHuman };
export function drawUnit(ctx, x, y, o) {
  // o: {def, team, era, face(angle), walk, act, busy, carry, id, t, moving,
  //     res (optional: resource being gathered), state (optional: order)}
  const d = o.def;
  const era = d.era || o.era;
  if (d.naval || d.class === 'naval') {
    drawShip(ctx, x, y, { ...o, era, moving: o.moving ?? (o.walk > 0) }, drawHuman);
    return;
  }
  drawUnitFig(ctx, x, y, o);
}

// ------------------------------------------------------------------ icons
// resource / population icon in a 20x20 box centred on (x, y), drawn at
// size s: outlined shapes with a light top-left highlight so they stay crisp
// on any HUD background
export function resIcon(ctx, r, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 20, s / 20);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const OLC = 'rgba(16,10,6,0.9)';
  const out = (w = 1.4) => { ctx.strokeStyle = OLC; ctx.lineWidth = w; ctx.stroke(); };
  switch (r) {
    case 0: { // food: wheat ear behind a roast drumstick
      ctx.strokeStyle = OLC; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(-5, 8); ctx.lineTo(4, -8); ctx.stroke();
      ctx.strokeStyle = '#d8b040'; ctx.lineWidth = 1.2; ctx.stroke();
      for (let i = 0; i < 4; i++) { const k = 0.35 + i * 0.17, gx = -5 + 9 * k, gy = 8 - 16 * k; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(gx + sd * 1.3, gy + 0.6, 1.1, 1.9, sd * 0.6 + 0.5, 0, 7); ctx.fillStyle = '#f2cf5a'; ctx.fill(); ctx.strokeStyle = '#8a6a1a'; ctx.lineWidth = 0.5; ctx.stroke(); } }
      ctx.beginPath(); ctx.ellipse(-1.6, 2.4, 6.2, 4.6, -0.7, 0, 7); ctx.fillStyle = '#b8502e'; ctx.fill(); out();
      ctx.beginPath(); ctx.ellipse(-2.6, 1.2, 3.4, 1.8, -0.7, 0, 7); ctx.fillStyle = 'rgba(255,190,140,0.55)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(1.6, -0.4); ctx.lineTo(5.4, -4.2); ctx.strokeStyle = OLC; ctx.lineWidth = 3.4; ctx.stroke(); ctx.strokeStyle = '#f4ecd8'; ctx.lineWidth = 2; ctx.stroke();
      for (const [bx, by] of [[5.2, -5.6], [6.8, -4]]) { ctx.beginPath(); ctx.arc(bx, by, 1.5, 0, 7); ctx.fillStyle = '#f4ecd8'; ctx.fill(); out(0.9); }
      break;
    }
    case 1: // wood: three stacked logs with end grain
      for (const [lx, ly] of [[-4, 3.6], [4, 3.6], [0, -3.4]]) {
        ctx.beginPath(); ctx.rect(lx - 7.4, ly - 3.2, 9, 6.4); ctx.fillStyle = '#7b4f2a'; ctx.fill(); out(1.2);
        ctx.fillStyle = 'rgba(255,220,170,0.25)'; ctx.fillRect(lx - 7.2, ly - 2.9, 8.6, 1.4);
        ctx.beginPath(); ctx.ellipse(lx + 1.6, ly, 3, 3.2, 0, 0, 7); ctx.fillStyle = '#e2bf88'; ctx.fill(); out(1.2);
        ctx.beginPath(); ctx.ellipse(lx + 1.6, ly, 1.6, 1.8, 0, 0, 7); ctx.strokeStyle = '#9a6a38'; ctx.lineWidth = 0.6; ctx.stroke();
      }
      break;
    case 2: // stone: two faceted blocks
      for (const [bx, by, k] of [[-3.4, 2.6, 1], [3.6, 3.4, 0.86]]) {
        ctx.save(); ctx.translate(bx, by); ctx.scale(k, k);
        ctx.beginPath(); ctx.moveTo(-5.6, 4.6); ctx.lineTo(-6, -1.6); ctx.lineTo(-2, -5.6); ctx.lineTo(5, -4.2); ctx.lineTo(6, 3.6); ctx.lineTo(1, 5.6); ctx.closePath(); ctx.fillStyle = '#8f959c'; ctx.fill(); out(1.3 / k);
        ctx.beginPath(); ctx.moveTo(-6, -1.6); ctx.lineTo(-2, -5.6); ctx.lineTo(5, -4.2); ctx.lineTo(0.6, -0.6); ctx.closePath(); ctx.fillStyle = '#c8ced4'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(0.6, -0.6); ctx.lineTo(5, -4.2); ctx.lineTo(6, 3.6); ctx.lineTo(1, 5.6); ctx.closePath(); ctx.fillStyle = '#6c7278'; ctx.fill();
        ctx.restore();
      }
      break;
    case 3: // gold: coin stack and a bright coin
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(-3, 6 - i * 2.6, 5.4, 2.2, 0, 0, 7); ctx.fillStyle = i === 2 ? '#f7d24a' : '#c8951e'; ctx.fill(); out(1.1); }
      ctx.beginPath(); ctx.arc(3.6, -1.6, 5.6, 0, 7); ctx.fillStyle = '#f2c230'; ctx.fill(); out(1.3);
      ctx.beginPath(); ctx.arc(3.6, -1.6, 3.8, 0, 7); ctx.strokeStyle = '#b8861a'; ctx.lineWidth = 0.9; ctx.stroke();
      ctx.beginPath(); ctx.arc(2.4, -3, 1.6, 0, 7); ctx.fillStyle = '#fff6c0'; ctx.fill();
      break;
    case 4: { // energy: glowing bolt
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 10); g.addColorStop(0, 'rgba(120,230,255,0.55)'); g.addColorStop(1, 'rgba(120,230,255,0)');
      ctx.fillStyle = g; ctx.fillRect(-10, -10, 20, 20);
      ctx.beginPath(); ctx.moveTo(2.4, -9); ctx.lineTo(-6, 1.4); ctx.lineTo(-0.8, 1.4); ctx.lineTo(-3, 9); ctx.lineTo(6.2, -2.2); ctx.lineTo(0.8, -2.2); ctx.closePath();
      ctx.fillStyle = '#43d2ff'; ctx.fill(); out(1.3);
      ctx.beginPath(); ctx.moveTo(1.6, -6.6); ctx.lineTo(-3.6, 0.2); ctx.lineTo(-1.6, 0.2); ctx.closePath(); ctx.fillStyle = '#d8f8ff'; ctx.fill();
      break;
    }
    case 5: // population: two people
      for (const [px, c, k] of [[3.4, '#a89c88', 0.85], [-1.6, '#efe2c4', 1]]) {
        ctx.save(); ctx.translate(px, 1); ctx.scale(k, k);
        ctx.beginPath(); ctx.moveTo(-6, 8.6); ctx.quadraticCurveTo(-6, 0, 0, 0); ctx.quadraticCurveTo(6, 0, 6, 8.6); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); out(1.3 / k);
        ctx.beginPath(); ctx.arc(0, -4.4, 3.6, 0, 7); ctx.fillStyle = c; ctx.fill(); out(1.3 / k);
        ctx.restore();
      }
      break;
  }
  ctx.restore();
}

// small stat icons for the selection panel, as cached data URLs (for <img>)
const STATIC = new Map();
export function statIcon(kind, size = 16) {
  const key = kind + size;
  let u = STATIC.get(key);
  if (u) return u;
  const cv = document.createElement('canvas'); cv.width = cv.height = size * 2;
  const c = cv.getContext('2d'); c.scale(size / 5, size / 5); c.translate(5, 5);
  c.lineCap = 'round'; c.lineJoin = 'round';
  const O = 'rgba(16,10,6,0.95)';
  const st = (w, col) => { c.strokeStyle = O; c.lineWidth = w + 1; c.stroke(); c.strokeStyle = col; c.lineWidth = w; c.stroke(); };
  switch (kind) {
    case 'attack': for (const s of [-1, 1]) { c.beginPath(); c.moveTo(-3.6 * s, 3.6); c.lineTo(3.4 * s, -3.4); st(1.1, '#e8eef4'); c.beginPath(); c.moveTo(-3.6 * s + 1.6 * s, 1.2); c.lineTo(-1.2 * s, 3.6); st(0.9, '#c8a048'); } break;
    case 'armor': c.beginPath(); c.moveTo(-3.6, -3.4); c.lineTo(3.6, -3.4); c.quadraticCurveTo(3.6, 1.6, 0, 4.2); c.quadraticCurveTo(-3.6, 1.6, -3.6, -3.4); c.closePath(); c.fillStyle = '#7a8a9a'; c.fill(); c.strokeStyle = O; c.lineWidth = 0.9; c.stroke(); c.beginPath(); c.moveTo(0, -3); c.lineTo(0, 3.4); c.strokeStyle = '#d8e0e8'; c.lineWidth = 0.8; c.stroke(); break;
    case 'range': c.beginPath(); c.arc(0, 0, 3.8, 0, 7); c.fillStyle = '#e8e0cc'; c.fill(); c.strokeStyle = O; c.lineWidth = 0.8; c.stroke(); c.beginPath(); c.arc(0, 0, 2.4, 0, 7); c.fillStyle = '#c8402e'; c.fill(); c.beginPath(); c.arc(0, 0, 1, 0, 7); c.fillStyle = '#e8e0cc'; c.fill(); c.beginPath(); c.moveTo(4.6, -4.6); c.lineTo(0, 0); st(0.7, '#6a4a2a'); break;
    case 'speed': c.beginPath(); c.moveTo(-4, -1.6); c.lineTo(1, -1.6); c.lineTo(1, -3.6); c.lineTo(4.4, 0); c.lineTo(1, 3.6); c.lineTo(1, 1.6); c.lineTo(-4, 1.6); c.closePath(); c.fillStyle = '#9ad0ff'; c.fill(); c.strokeStyle = O; c.lineWidth = 0.8; c.stroke(); break;
    case 'hp': c.beginPath(); c.moveTo(0, 3.8); c.bezierCurveTo(-5, 0, -3.6, -4.6, 0, -2); c.bezierCurveTo(3.6, -4.6, 5, 0, 0, 3.8); c.fillStyle = '#e04a3a'; c.fill(); c.strokeStyle = O; c.lineWidth = 0.8; c.stroke(); break;
    case 'carry': c.beginPath(); c.moveTo(-1.6, -3.4); c.quadraticCurveTo(-4.4, 0, -3.4, 3.8); c.lineTo(3.4, 3.8); c.quadraticCurveTo(4.4, 0, 1.6, -3.4); c.closePath(); c.fillStyle = '#c8a46a'; c.fill(); c.strokeStyle = O; c.lineWidth = 0.8; c.stroke(); c.beginPath(); c.moveTo(-1.8, -2.4); c.lineTo(1.8, -2.4); c.strokeStyle = '#6a4a24'; c.lineWidth = 0.7; c.stroke(); break;
    case 'build': c.beginPath(); c.moveTo(-3.6, 3.6); c.lineTo(1.4, -1.4); st(1.1, '#8a6040'); c.beginPath(); c.rect(-0.2, -4.4, 4.6, 2.4); c.fillStyle = '#9aa0a8'; c.fill(); c.strokeStyle = O; c.lineWidth = 0.7; c.stroke(); break;
  }
  u = cv.toDataURL('image/png');
  STATIC.set(key, u);
  return u;
}

// tight bounding box (in sprite px) of a cached building sprite, ignoring
// the soft shadow (alpha < 0.5)
function spriteBBox(b) {
  if (b.bbox) return b.bbox;
  const W = b.canvas.width, H = b.canvas.height;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  try {
    const d = b.canvas.getContext('2d').getImageData(0, 0, W, H).data;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 200) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  } catch (e) { x0 = 0; y0 = 0; x1 = W; y1 = H; }
  if (x1 <= x0) { x0 = 0; y0 = 0; x1 = W; y1 = H; }
  const k = W / b.w;
  b.bbox = [x0 / k, y0 / k, (x1 + 2) / k, (y1 + 2) / k];
  return b.bbox;
}

// Renders a small portrait/icon canvas for an entity type.
export function iconCanvas(kind, type, def, era, team, themeName, size = 44) {
  const cv = document.createElement('canvas');
  cv.width = size * 2; cv.height = size * 2;
  const ctx = cv.getContext('2d');
  ctx.scale(2, 2);
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#3a4a5a'); g.addColorStop(1, '#1a2028');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  if (kind === 'unit') {
    const naval = def.naval || def.class === 'naval';
    ctx.save(); ctx.translate(size / 2, size * (naval ? 0.66 : 0.86)); const s = naval ? size / 60 : def.class === 'mounted' || def.class === 'siege' || def.class === 'animal' ? 1.1 : 1.32; ctx.scale(s, s);
    const fly = def.flying ? 1.3 * ZH : 0;
    drawUnit(ctx, 0, fly * 0.5, { def, team, era, face: 0.4, walk: 0.15, act: 0.3, busy: false, carry: -1, id: 1, t: 0 });
    ctx.restore();
  } else if (kind === 'building') {
    const b = buildingSprite(type, era, team, def.size || 2, 3);
    const bb = spriteBBox(b);
    const bw = bb[2] - bb[0], bh = bb[3] - bb[1];
    const sc = Math.min((size - 4) / bw, (size - 4) / bh);
    const k = b.canvas.width / b.w;
    ctx.drawImage(b.canvas, bb[0] * k, bb[1] * k, bw * k, bh * k, (size - bw * sc) / 2, (size - bh * sc) / 2 + 1, bw * sc, bh * sc);
  } else if (kind === 'resource') {
    const r = resourceSprite(type, themeName, 1);
    if (type === 'fish') { const wg = ctx.createLinearGradient(0, 0, 0, size); wg.addColorStop(0, '#2d6f96'); wg.addColorStop(1, '#1a4a6a'); ctx.fillStyle = wg; ctx.fillRect(0, 0, size, size); }
    // crop around the object: 56x56 px above the anchor
    const cw = type === 'tree' ? 64 : 44;
    ctx.drawImage(r.canvas, (r.ox - cw / 2) * 2, (r.oy - cw * 0.85) * 2, cw * 2, cw * 2, 0, 0, size, size);
  }
  return cv;
}

export function techIcon(kind, age, size = 44) {
  const cv = document.createElement('canvas');
  cv.width = size * 2; cv.height = size * 2;
  const ctx = cv.getContext('2d'); ctx.scale(2, 2);
  const g = ctx.createLinearGradient(0, 0, 0, size);
  const base = { gather: '#3d6a3a', attack: '#7a2a2a', armor: '#4a5a7a', hp: '#6a5a2a', age: '#7a5a1a' }[kind] || '#444';
  g.addColorStop(0, shade(base, 1.3)); g.addColorStop(1, shade(base, 0.6));
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = '#f0e2c0'; ctx.fillStyle = '#f0e2c0'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  switch (kind) {
    case 'gather': ctx.beginPath(); ctx.moveTo(-10, 10); ctx.lineTo(6, -6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(2, -12); ctx.quadraticCurveTo(14, -10, 10, 2); ctx.lineTo(4, -4); ctx.closePath(); ctx.fill(); break;
    case 'attack': ctx.beginPath(); ctx.moveTo(-10, 10); ctx.lineTo(10, -10); ctx.moveTo(10, 10); ctx.lineTo(-10, -10); ctx.stroke(); break;
    case 'armor': ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(10, -7); ctx.quadraticCurveTo(9, 7, 0, 12); ctx.quadraticCurveTo(-9, 7, -10, -7); ctx.closePath(); ctx.fill(); break;
    case 'hp': ctx.fillRect(-3, -11, 6, 22); ctx.fillRect(-11, -3, 22, 6); break;
    case 'age': ctx.font = 'bold 16px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(romanNum(age), 0, 1); break;
  }
  return cv;
}

export function romanNum(n) {
  const m = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of m) while (n >= v) { s += r; n -= v; }
  return s || '0';
}

export function cmdIcon(kind, size = 44) {
  const cv = document.createElement('canvas');
  cv.width = size * 2; cv.height = size * 2;
  const ctx = cv.getContext('2d'); ctx.scale(2, 2);
  ctx.fillStyle = '#2a3038'; ctx.fillRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2); ctx.strokeStyle = '#e8d8b0'; ctx.fillStyle = '#e8d8b0'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  switch (kind) {
    case 'stop': ctx.fillStyle = '#b83a2a'; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28 + 0.39; ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12); } ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-7, -2, 14, 4); break;
    case 'delete': ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(9, 9); ctx.moveTo(9, -9); ctx.lineTo(-9, 9); ctx.strokeStyle = '#e04030'; ctx.lineWidth = 4; ctx.stroke(); break;
    case 'build': ctx.beginPath(); ctx.moveTo(-9, 10); ctx.lineTo(5, -4); ctx.stroke(); ctx.fillRect(0, -12, 12, 7); break;
    case 'military': ctx.beginPath(); ctx.moveTo(-9, 10); ctx.lineTo(9, -10); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-6, -3); ctx.lineTo(3, 6); ctx.stroke(); break;
    case 'back': ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-8, 0); ctx.moveTo(-2, -6); ctx.lineTo(-8, 0); ctx.lineTo(-2, 6); ctx.stroke(); break;
    case 'amove': ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(8, 0); ctx.moveTo(2, -6); ctx.lineTo(8, 0); ctx.lineTo(2, 6); ctx.stroke(); ctx.beginPath(); ctx.arc(-6, -6, 3, 0, 7); ctx.fill(); break;
    case 'repair': ctx.beginPath(); ctx.arc(0, 0, 9, 0.6, 5.5); ctx.stroke(); break;
  }
  return cv;
}
