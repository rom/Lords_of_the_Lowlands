// Procedural art: terrain palettes, buildings, resources, units and icons.
// Everything is drawn with canvas paths so no image assets are needed.
import { TW, TH, ZH, TEAM, hexToRgb, shade, mix, rgb, hash2 } from './util.js';
import { recStart, recStop, castShadows, setGround } from './art/kit.js';
import { drawShip } from './art/naval.js';
import { drawBuildingBody, drawConstruction, drawAnim, hasAnim } from './art/buildings.js';

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
  const key = stage < 3 ? `${type}|${era}|-|${size}|${stage}|0` : `${type}|${era}|${team}|${size}|${stage}|${live && hasAnim(type, era) ? 1 : 0}`;
  let c = bcache.get(key);
  if (c) return c;
  const padL = 44, padR = 150, top = 220, bottom = 24 + (type === 'dock' ? 60 : 0);
  const w = size * TW + padL + padR, h = size * TH + top + bottom;
  const ox = size * TW / 2 + padL, oy = top;
  const W2 = w * 2, H2 = h * 2;
  if (!scratch || scratch.g.width < W2 || scratch.g.height < H2) scratch = { g: layer(W2, H2), b: layer(W2, H2), c: layer(W2, H2) };
  const gctx = scratch.g.getContext('2d'), bctx = scratch.b.getContext('2d'), ctx = scratch.c.getContext('2d', { willReadFrequently: true });
  for (const c2 of [gctx, bctx, ctx]) { c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, c2.canvas.width, c2.canvas.height); }
  for (const c2 of [gctx, bctx]) c2.setTransform(2, 0, 0, 2, ox * 2, oy * 2);
  setGround(gctx); recStart();
  try {
    if (stage < 3) drawConstruction(bctx, type, era, size, stage);
    else drawBuildingBody(bctx, type, era, team, size, 0, live);
  } finally { setGround(null); }
  const vols = recStop();
  ctx.drawImage(scratch.g, 0, 0, W2, H2, 0, 0, W2, H2);
  ctx.setTransform(2, 0, 0, 2, ox * 2, oy * 2);
  castShadows(ctx, vols, type === 'farm' ? 0.2 : 0.36);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(scratch.b, 0, 0, W2, H2, 0, 0, W2, H2);
  // crop to the drawn content to keep the cache small
  let x0 = 0, y0 = 0, x1 = W2, y1 = H2;
  try {
    const d = ctx.getImageData(0, 0, W2, H2).data;
    x0 = W2; y0 = H2; x1 = 0; y1 = 0;
    for (let y = 0; y < H2; y += 2) { const row = y * W2 * 4; for (let x = 0; x < W2; x += 2) if (d[row + x * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (x1 < x0) { x0 = 0; y0 = 0; x1 = 2; y1 = 2; }
    x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(W2, x1 + 4); y1 = Math.min(H2, y1 + 4);
  } catch (e) { /* keep full size */ }
  x0 &= ~1; y0 &= ~1; x1 = Math.min(W2, x1 + (x1 & 1)); y1 = Math.min(H2, y1 + (y1 & 1));
  const cv = layer(x1 - x0, y1 - y0);
  cv.getContext('2d').drawImage(scratch.c, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
  c = { canvas: cv, ox: ox - x0 / 2, oy: oy - y0 / 2, w: (x1 - x0) / 2, h: (y1 - y0) / 2 };
  bcache.set(key, c);
  return c;
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

export function resourceSprite(type, themeName, variant) {
  const key = `${type}|${themeName}|${variant}`;
  let c = rcache.get(key);
  if (c) return c;
  const w = 96, h = 120;
  const cv = document.createElement('canvas');
  cv.width = w * 2; cv.height = h * 2;
  const ctx = cv.getContext('2d');
  ctx.scale(2, 2);
  ctx.translate(w / 2, h - 22);
  drawResource(ctx, type, theme(themeName).tree, variant);
  c = { canvas: cv, ox: w / 2, oy: h - 22, w, h };
  rcache.set(key, c);
  return c;
}

function blob(ctx, x, y, r, col, hl) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
  g.addColorStop(0, hl); g.addColorStop(1, col);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

function drawResource(ctx, type, treeStyle, v) {
  const rnd = (i) => hash2(v, i, 99);
  if (type === 'fish') { drawFish(ctx, treeStyle, v); return; }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(4, 2, 16, 7, 0, 0, 7); ctx.fill();
  switch (type) {
    case 'tree': {
      const style = treeStyle === 'mixed' ? (rnd(1) < 0.5 ? 'oak' : 'pine') : treeStyle;
      const sc = 0.85 + rnd(2) * 0.35;
      ctx.save(); ctx.scale(sc, sc);
      if (style === 'oak') {
        // trunk with bark shading and two limbs
        const tg = ctx.createLinearGradient(-3, 0, 3, 0); tg.addColorStop(0, '#7a5434'); tg.addColorStop(1, '#3a2414');
        ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(-3.2, 0); ctx.lineTo(-2, -26); ctx.lineTo(2, -26); ctx.lineTo(3.2, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#3a2414'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(-6, -27); ctx.moveTo(0, -21); ctx.lineTo(5, -29); ctx.stroke();
        const base = [[42, 92, 30], [58, 110, 36], [74, 128, 44]][Math.floor(rnd(3) * 3)];
        const bl = [];
        for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28 + rnd(4), r = 8 + rnd(5 + i) * 5; bl.push([Math.cos(a) * 9, -36 + Math.sin(a) * 6.5 - rnd(9 + i) * 6, r]); }
        bl.push([0, -43, 11]); bl.push([-3, -48, 8]);
        // dark outline pass, then lit blobs from back to front
        ctx.fillStyle = 'rgba(16,28,10,0.85)';
        for (const [x, y, r] of bl) { ctx.beginPath(); ctx.arc(x, y, r + 1.2, 0, 7); ctx.fill(); }
        bl.sort((p, q) => p[1] - q[1]);
        for (const [x, y, r] of bl) blob(ctx, x, y, r, rgb(base[0] * 0.62, base[1] * 0.66, base[2] * 0.62), rgb(base[0] * 1.45, base[1] * 1.38, base[2] * 1.2));
        // leaf speckle and a shaded underside
        for (let i = 0; i < 26; i++) { const x = (rnd(100 + i) - 0.5) * 30, y = -50 + rnd(130 + i) * 24; ctx.fillStyle = rnd(160 + i) < 0.5 ? 'rgba(255,255,200,0.18)' : 'rgba(0,20,0,0.22)'; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill(); }
      } else if (style === 'pine' || style === 'snowpine') {
        ctx.fillStyle = '#4a2f1a'; ctx.fillRect(-2, -14, 4, 14);
        for (let i = 0; i < 4; i++) {
          const y = -12 - i * 11, w = 15 - i * 3;
          ctx.fillStyle = shade([30, 78, 44], 0.85 + i * 0.1);
          ctx.beginPath(); ctx.moveTo(-w, y); ctx.quadraticCurveTo(0, y + 3, w, y); ctx.lineTo(0, y - 18); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(10,26,14,0.8)'; ctx.lineWidth = 0.9; ctx.stroke();
          ctx.strokeStyle = 'rgba(160,220,150,0.25)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-w * 0.8, y - 1); ctx.lineTo(-1, y - 16); ctx.stroke();
          ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.lineTo(0, y - 18); ctx.closePath(); ctx.fill();
          if (style === 'snowpine') { ctx.fillStyle = 'rgba(245,250,255,0.92)'; ctx.beginPath(); ctx.moveTo(-w * 0.7, y - 4); ctx.lineTo(w * 0.3, y - 6); ctx.lineTo(0, y - 18); ctx.closePath(); ctx.fill(); }
        }
      } else if (style === 'palm' || style === 'jungle') {
        ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = 3.5;
        const lean = (rnd(6) - 0.5) * 10;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(lean * 0.3, -22, lean, -44); ctx.stroke();
        ctx.strokeStyle = 'rgba(60,40,20,0.6)'; ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(-2 + lean * i / 8, -i * 5.5); ctx.lineTo(2 + lean * i / 8, -i * 5.5 - 1); ctx.stroke(); }
        const g = style === 'jungle' ? [40, 120, 40] : [70, 130, 50];
        for (let i = 0; i < 7; i++) {
          const a = i / 7 * 6.28;
          ctx.fillStyle = shade(g, 0.8 + rnd(10 + i) * 0.4);
          ctx.beginPath(); ctx.moveTo(lean, -44);
          ctx.quadraticCurveTo(lean + Math.cos(a) * 14, -54 + Math.sin(a) * 4, lean + Math.cos(a) * 24, -40 + Math.sin(a) * 8);
          ctx.quadraticCurveTo(lean + Math.cos(a) * 12, -46 + Math.sin(a) * 4, lean, -44); ctx.fill();
        }
        if (style === 'jungle') blob(ctx, -8, -14, 9, '#2a6a28', '#5aa048');
      } else { // crystal spires (off-world "wood")
        const hue = [[120, 80, 220], [60, 200, 200], [200, 90, 200]][Math.floor(rnd(7) * 3)];
        for (let i = 0; i < 4; i++) {
          const x = (rnd(20 + i) - 0.5) * 18, hh = 18 + rnd(30 + i) * 30, w = 4 + rnd(40 + i) * 3;
          ctx.fillStyle = shade(hue, 0.6); ctx.beginPath(); ctx.moveTo(x - w, 0); ctx.lineTo(x, -hh); ctx.lineTo(x, 0); ctx.fill();
          ctx.fillStyle = shade(hue, 1.2); ctx.beginPath(); ctx.moveTo(x + w, 0); ctx.lineTo(x, -hh); ctx.lineTo(x, 0); ctx.fill();
        }
        ctx.fillStyle = `rgba(${hue[0]},${hue[1]},${hue[2]},0.25)`; ctx.beginPath(); ctx.arc(0, -20, 18, 0, 7); ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'berry': {
      const space = treeStyle === 'crystal';
      for (let i = 0; i < 5; i++) blob(ctx, (rnd(i) - 0.5) * 16, -6 - rnd(10 + i) * 8, 7, space ? '#2a6a50' : '#2f5e26', space ? '#7cf0b0' : '#5e9c44');
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = space ? '#c0ff80' : (i % 3 ? '#c4223a' : '#7a2a8a');
        ctx.beginPath(); ctx.arc((rnd(30 + i) - 0.5) * 22, -4 - rnd(60 + i) * 16, 1.8, 0, 7); ctx.fill();
      }
      break;
    }
    case 'gold': case 'stone': case 'crystal': {
      const base = type === 'gold' ? [140, 120, 90] : type === 'stone' ? [130, 128, 124] : [60, 70, 90];
      for (let i = 0; i < 5; i++) {
        const x = (rnd(i) - 0.5) * 22, y = -3 - rnd(10 + i) * 6, r = 6 + rnd(20 + i) * 5;
        ctx.fillStyle = shade(base, 0.7);
        ctx.beginPath(); ctx.moveTo(x - r, y + 2); ctx.lineTo(x - r * 0.6, y - r); ctx.lineTo(x + r * 0.5, y - r * 1.1); ctx.lineTo(x + r, y + 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = shade(base, 1.1);
        ctx.beginPath(); ctx.moveTo(x - r * 0.6, y - r); ctx.lineTo(x + r * 0.5, y - r * 1.1); ctx.lineTo(x + r * 0.2, y - r * 0.3); ctx.lineTo(x - r * 0.4, y - r * 0.2); ctx.closePath(); ctx.fill();
      }
      if (type === 'gold') for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? '#ffd84a' : '#ffef9a'; ctx.beginPath(); ctx.arc((rnd(70 + i) - 0.5) * 22, -4 - rnd(80 + i) * 12, 1.6 + rnd(90 + i), 0, 7); ctx.fill(); }
      if (type === 'crystal') for (let i = 0; i < 5; i++) {
        const x = (rnd(50 + i) - 0.5) * 20, hh = 10 + rnd(55 + i) * 16;
        const g = ctx.createLinearGradient(x, 0, x, -hh); g.addColorStop(0, '#1a7aa8'); g.addColorStop(1, '#bff6ff');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 3, -4); ctx.lineTo(x, -4 - hh); ctx.lineTo(x + 3, -4); ctx.closePath(); ctx.fill();
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
// Unit drawing is done live every frame. (x, y) is the screen position of
// the unit's feet. anim: {walk, act, t}, dir: -1/1 horizontal facing.
const SKIN = ['#e0b48c', '#c68e62', '#8d5a3a', '#f1c9a2'];

function headgear(ctx, era, sprite, col, hx, hy) {
  ctx.fillStyle = col;
  switch (era) {
    case 'stone': ctx.fillStyle = '#3a2614'; ctx.beginPath(); ctx.arc(hx, hy - 1, 3.4, Math.PI, 0); ctx.fill(); break;
    case 'bronze': case 'iron': ctx.fillStyle = '#b08a3a'; ctx.beginPath(); ctx.arc(hx, hy - 0.5, 3.5, Math.PI, 0); ctx.fill(); ctx.fillRect(hx - 0.6, hy - 6, 1.2, 2.5); break;
    case 'classical': ctx.fillStyle = '#c29a3c'; ctx.beginPath(); ctx.arc(hx, hy - 0.5, 3.6, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#b02a20'; ctx.fillRect(hx - 3, hy - 7, 6, 2.2); break;
    case 'medieval': ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.arc(hx, hy, 3.6, Math.PI, 0); ctx.fill(); ctx.fillRect(hx - 3.6, hy - 0.5, 7.2, 1.2); break;
    case 'gunpowder': ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.ellipse(hx, hy - 3, 5, 1.6, 0, 0, 7); ctx.fill(); ctx.fillRect(hx - 2.6, hy - 6, 5.2, 3); break;
    case 'industrial': ctx.fillStyle = '#3e4a3a'; ctx.fillRect(hx - 3, hy - 5, 6, 3.4); ctx.fillRect(hx - 3, hy - 2, 5.5, 1); break;
    case 'modern': ctx.fillStyle = '#4c5a3a'; ctx.beginPath(); ctx.arc(hx, hy - 0.5, 3.9, Math.PI, 0); ctx.fill(); break;
    case 'future': case 'space':
      ctx.fillStyle = '#d6dde6'; ctx.beginPath(); ctx.arc(hx, hy, 4.1, 0, 7); ctx.fill();
      ctx.fillStyle = era === 'space' ? '#ffb84a' : '#39d4ff'; ctx.beginPath(); ctx.ellipse(hx + 1.2, hy, 2.6, 1.6, 0, 0, 7); ctx.fill(); break;
  }
}

function weapon(ctx, sprite, era, hx, hy, act, carry) {
  // hand position near (hx, hy)
  ctx.lineCap = 'round';
  const swing = Math.sin(act * Math.PI) * 1.2;
  ctx.save(); ctx.translate(hx, hy);
  switch (sprite) {
    case 'club': ctx.rotate(-0.9 + swing); ctx.strokeStyle = '#6b4424'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -9); ctx.stroke(); break;
    case 'axe': ctx.rotate(-0.9 + swing); ctx.strokeStyle = '#6b4424'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -9); ctx.stroke(); ctx.fillStyle = '#b87333'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(4, -10); ctx.lineTo(4, -5); ctx.closePath(); ctx.fill(); break;
    case 'sword': case 'greatsword': case 'templar': {
      ctx.rotate(-0.8 + swing);
      ctx.strokeStyle = sprite === 'templar' ? '#6ff' : era === 'bronze' ? '#d29a4a' : '#d8dde4'; ctx.lineWidth = sprite === 'greatsword' ? 2 : 1.6;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, sprite === 'greatsword' ? -13 : -10); ctx.stroke();
      ctx.strokeStyle = '#5a3a1a'; ctx.beginPath(); ctx.moveTo(-2, -1); ctx.lineTo(2, -1); ctx.stroke(); break;
    }
    case 'spear': case 'hoplite': case 'pike': {
      const L = sprite === 'pike' ? 26 : 17;
      ctx.rotate(-1.35 + swing * 0.3); ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(-L * 0.25, 0); ctx.lineTo(L * 0.75, 0); ctx.stroke();
      ctx.fillStyle = era === 'stone' ? '#777' : '#ccc'; ctx.beginPath(); ctx.moveTo(L * 0.75, -1.5); ctx.lineTo(L * 0.75 + 4, 0); ctx.lineTo(L * 0.75, 1.5); ctx.fill(); break;
    }
    case 'throw': case 'sling':
      ctx.rotate(-1.5 + swing * 2); ctx.strokeStyle = '#8a6a44'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -7); ctx.stroke();
      ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(0, -7, 1.6, 0, 7); ctx.fill(); break;
    case 'bow': case 'longbow': case 'crossbow': {
      const L = sprite === 'longbow' ? 11 : 8;
      ctx.strokeStyle = '#6b4424'; ctx.lineWidth = 1.4;
      if (sprite === 'crossbow') { ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(7, -1); ctx.stroke(); ctx.beginPath(); ctx.moveTo(6, -5); ctx.quadraticCurveTo(8, -1, 6, 3); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(1, -1, L * 0.6, -1.3, 1.3); ctx.stroke(); ctx.strokeStyle = 'rgba(230,230,230,0.8)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(1 + Math.cos(-1.3) * L * 0.6, -1 + Math.sin(-1.3) * L * 0.6); ctx.lineTo(1 - act * 3, -1); ctx.lineTo(1 + Math.cos(1.3) * L * 0.6, -1 + Math.sin(1.3) * L * 0.6); ctx.stroke(); }
      break;
    }
    case 'musket': case 'bayonet': case 'rifle': case 'smg': case 'mg': case 'grenadier': case 'bazooka': case 'railgun': case 'plasma': case 'exo': case 'marine': {
      const L = sprite === 'musket' || sprite === 'bayonet' ? 15 : sprite === 'smg' ? 8 : sprite === 'mg' ? 12 : 11;
      ctx.rotate(-0.15 - act * 0.05);
      const col = sprite === 'plasma' || sprite === 'railgun' ? '#cfd8e0' : sprite === 'exo' || sprite === 'marine' ? '#aab4c0' : era === 'gunpowder' ? '#6b4424' : '#2a2a2a';
      ctx.strokeStyle = col; ctx.lineWidth = sprite === 'bazooka' ? 3.2 : sprite === 'mg' ? 2.4 : 1.8;
      ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(L - 3, -1); ctx.stroke();
      if (sprite === 'bayonet') { ctx.strokeStyle = '#ddd'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(L - 3, -1); ctx.lineTo(L + 2, -1.3); ctx.stroke(); }
      if (sprite === 'plasma' || sprite === 'railgun' || sprite === 'marine' || sprite === 'exo') { ctx.fillStyle = sprite === 'plasma' ? '#ff7cf0' : '#7cf1ff'; ctx.fillRect(L - 5, -2, 2, 2); }
      break;
    }
  }
  ctx.restore();
  if (carry != null && carry >= 0) {
    ctx.fillStyle = RES_COLORS[carry];
    ctx.beginPath(); ctx.arc(hx - 5, hy - 2, 2.4, 0, 7); ctx.fill();
  }
}

const ARMOR = { stone: '#7a5a3a', bronze: '#b8904a', iron: '#6e7278', classical: '#c8a048', medieval: '#a0a6ae', gunpowder: null, industrial: null, modern: '#5c6a46', future: '#dfe6ee', space: '#8a96a8' };
const OL = 'rgba(18,12,8,0.8)';
export function drawHuman(ctx, x, y, o) {
  const { team, era, sprite, dir, walk, act, busy, carry, cls } = o;
  const tc = TEAM[team] || '#bbb';
  const fut = era === 'future' || era === 'space';
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  if (!o.noShadow) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0.5, 0, 6.5, 2.6, 0, 0, 7); ctx.fill(); }
  const big = sprite === 'exo' || sprite === 'marine' || sprite === 'templar' ? 1.2 : 1;
  ctx.scale(big, big);
  const step = Math.sin(walk * Math.PI * 2);
  const bob = Math.abs(step) * 0.8;
  const worker = cls === 'worker' || cls === 'crew';
  // palette
  const legCol = era === 'stone' ? '#8a5a3a' : fut ? (era === 'space' ? '#6a7688' : '#b8c2ce') : era === 'modern' ? '#4c5838' : era === 'gunpowder' || era === 'industrial' ? (worker ? '#4a3a2a' : '#e8e2d4') : '#5a4630';
  const boot = fut ? '#3a4048' : era === 'stone' ? '#6a4428' : '#2a2018';
  let body;
  if (worker) body = era === 'stone' ? '#9a6e44' : fut ? '#e0e6ec' : era === 'modern' ? '#d88a2a' : era === 'industrial' ? '#5a6a7a' : '#a8885a';
  else body = ARMOR[era] || shade(tc, 0.9);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // legs
  if (o.legs !== false) {
    const lx = [[-1.3, -1.3 + step * 2.6], [1.3, 1.3 - step * 2.6]];
    for (const [hx, fx] of lx) { ctx.strokeStyle = OL; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(hx, -7); ctx.lineTo(fx, -0.5); ctx.stroke(); }
    for (const [hx, fx] of lx) { ctx.strokeStyle = legCol; ctx.lineWidth = 2.1; ctx.beginPath(); ctx.moveTo(hx, -7); ctx.lineTo(fx, -1.2); ctx.stroke(); ctx.strokeStyle = boot; ctx.lineWidth = 2.3; ctx.beginPath(); ctx.moveTo(fx, -1.6); ctx.lineTo(fx + 0.8, -0.4); ctx.stroke(); }
  }
  const bodyY = -15 - bob;
  // back arm
  ctx.strokeStyle = OL; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-2.8, bodyY + 1.5); ctx.lineTo(-3.6 - step * 1.2, bodyY + 7); ctx.stroke();
  ctx.strokeStyle = shade(body, 0.7); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-2.8, bodyY + 1.5); ctx.lineTo(-3.6 - step * 1.2, bodyY + 7); ctx.stroke();
  // torso
  const torso = () => { ctx.beginPath(); ctx.moveTo(-3.6, bodyY + 0.6); ctx.quadraticCurveTo(0, bodyY - 1.2, 3.6, bodyY + 0.6); ctx.lineTo(4.1, -6.2 - bob); ctx.quadraticCurveTo(0, -5.2 - bob, -4.1, -6.2 - bob); ctx.closePath(); };
  torso();
  const g = ctx.createLinearGradient(-4, 0, 4, 0); g.addColorStop(0, shade(body, 1.18)); g.addColorStop(0.55, shade(body, 0.95)); g.addColorStop(1, shade(body, 0.68));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.save(); torso(); ctx.clip();
  if (worker) {
    // team sash / collar
    ctx.strokeStyle = tc; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-3.6, bodyY + 1); ctx.lineTo(3.6, bodyY + 6); ctx.stroke();
    ctx.fillStyle = shade(body, 0.6); ctx.fillRect(-4.5, -8 - bob, 9, 1.1);
  } else if (era === 'gunpowder' || era === 'industrial') {
    ctx.fillStyle = shade(tc, 1.0); ctx.fillRect(-5, bodyY - 2, 10, 12); // uniform coat
    ctx.fillStyle = shade(tc, 0.75); ctx.fillRect(1.5, bodyY - 2, 4, 12);
    if (era === 'gunpowder') { ctx.strokeStyle = '#f0ece0'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-3.5, bodyY); ctx.lineTo(3.5, -7 - bob); ctx.moveTo(3.5, bodyY); ctx.lineTo(-3.5, -7 - bob); ctx.stroke(); }
    else { ctx.fillStyle = '#3a3020'; ctx.fillRect(-5, -8.4 - bob, 10, 1.2); }
  } else {
    // tabard in team colour over the armour
    ctx.fillStyle = tc; ctx.beginPath(); ctx.moveTo(-1.9, bodyY); ctx.lineTo(1.9, bodyY); ctx.lineTo(2.3, -5 - bob); ctx.lineTo(-2.3, -5 - bob); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0.5, bodyY, 2, 10);
    if (era === 'medieval') { ctx.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < 4; i++) ctx.fillRect(-4, bodyY + 1 + i * 2, 8, 0.5); }
    if (fut) { ctx.fillStyle = era === 'space' ? '#ffb84a' : '#39d4ff'; ctx.fillRect(-4, bodyY + 4, 8, 0.8); }
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(-5, -8.2 - bob, 10, 1.1); // belt
  }
  ctx.restore();
  // shield (team coloured with rim and boss)
  if (sprite === 'hoplite' || sprite === 'axe' || (sprite === 'sword' && era !== 'medieval') || (sprite === 'spear' && era !== 'stone') || (sprite === 'sword' && era === 'medieval')) {
    const sx = -4.2, sy = bodyY + 5.5;
    ctx.beginPath();
    if (era === 'medieval') { ctx.moveTo(sx - 3.5, sy - 4); ctx.lineTo(sx + 3.5, sy - 4); ctx.quadraticCurveTo(sx + 3.5, sy + 2, sx, sy + 5); ctx.quadraticCurveTo(sx - 3.5, sy + 2, sx - 3.5, sy - 4); }
    else ctx.ellipse(sx, sy, 4.2, 4.6, 0, 0, 7);
    const sg = ctx.createLinearGradient(sx - 4, sy - 4, sx + 4, sy + 4); sg.addColorStop(0, shade(sprite === 'hoplite' ? '#d8b048' : tc, 1.2)); sg.addColorStop(1, shade(sprite === 'hoplite' ? '#d8b048' : tc, 0.65));
    ctx.fillStyle = sg; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.strokeStyle = sprite === 'hoplite' ? tc : '#d8c08a'; ctx.lineWidth = 0.8; ctx.beginPath(); if (era === 'medieval') { ctx.moveTo(sx, sy - 3.5); ctx.lineTo(sx, sy + 4); ctx.moveTo(sx - 3, sy - 1); ctx.lineTo(sx + 3, sy - 1); } else ctx.arc(sx, sy, 2.6, 0, 7); ctx.stroke();
    if (era !== 'medieval') { ctx.fillStyle = '#e8d8a0'; ctx.beginPath(); ctx.arc(sx, sy, 1, 0, 7); ctx.fill(); }
  }
  // head
  const hx = 0.5, hy = bodyY - 3.6;
  const skin = SKIN[(o.id || 0) % SKIN.length];
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = OL; ctx.lineWidth = 0.7; ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.arc(hx + 0.9, hy + 0.3, 2.4, -0.9, 1.6); ctx.fill();
  ctx.fillStyle = '#1a120c'; ctx.fillRect(hx + 1.3, hy - 0.6, 0.9, 0.9);
  if (worker || era === 'stone') { ctx.fillStyle = ['#3a2416', '#6a4424', '#1a1410', '#a87a3a'][(o.id || 0) % 4]; ctx.beginPath(); ctx.arc(hx - 0.4, hy - 0.8, 3, Math.PI * 0.95, Math.PI * 2.05); ctx.fill(); }
  if (worker) {
    if (era === 'modern' || era === 'industrial') { ctx.fillStyle = era === 'modern' ? '#f2c230' : '#4a4a3a'; ctx.beginPath(); ctx.arc(hx, hy - 0.6, 3.4, Math.PI, 0); ctx.fill(); ctx.fillRect(hx - 3.8, hy - 0.9, 7.6, 0.9); }
    else if (era === 'medieval' || era === 'gunpowder') { ctx.fillStyle = '#c8b078'; ctx.beginPath(); ctx.ellipse(hx, hy - 2, 4.6, 1.3, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(hx, hy - 2.2, 2.4, Math.PI, 0); ctx.fill(); }
    else if (fut) { ctx.fillStyle = 'rgba(160,230,255,0.45)'; ctx.beginPath(); ctx.arc(hx, hy, 4, 0, 7); ctx.fill(); ctx.strokeStyle = '#d8e0e8'; ctx.lineWidth = 0.7; ctx.stroke(); }
  } else headgear(ctx, era, sprite, tc, hx, hy);
  // front arm + tool / weapon
  const a = busy ? act : 0;
  if (cls === 'crew') { ctx.restore(); return; }
  if (worker) {
    ctx.save(); ctx.translate(2.6, bodyY + 2); ctx.rotate(-1.2 + Math.sin(a * Math.PI) * 1.6);
    ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(0, -8); ctx.stroke();
    ctx.fillStyle = era === 'stone' ? '#8a8680' : '#b8c0c8'; ctx.beginPath(); ctx.moveTo(-2.6, -8.6); ctx.lineTo(2.6, -9.4); ctx.lineTo(2, -7.4); ctx.lineTo(-2.2, -7.2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.restore();
    if (carry >= 0) {
      ctx.fillStyle = RES_COLORS[carry]; ctx.strokeStyle = OL; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.ellipse(-3.2, bodyY + 1.5, 3, 2.6, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(-4, bodyY + 0.6, 1, 0, 7); ctx.fill();
    }
  } else {
    weapon(ctx, sprite, era, 2.5, bodyY + 3, a, null);
  }
  // front arm / hand
  ctx.strokeStyle = OL; ctx.lineWidth = 2.8; ctx.beginPath(); ctx.moveTo(2.6, bodyY + 1.2); ctx.lineTo(2.8, bodyY + 3.2); ctx.stroke();
  ctx.strokeStyle = shade(worker ? body : (ARMOR[era] || tc), 0.95); ctx.lineWidth = 1.7; ctx.stroke();
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(2.7, bodyY + 3.4, 1.1, 0, 7); ctx.fill();
  ctx.restore();
}

function quadruped(ctx, o, col, sc, kind) {
  const step = Math.sin(o.walk * Math.PI * 2);
  ctx.save(); ctx.scale(sc, sc);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, 0, 10, 3.5, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = shade(col, 0.6); ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, -7); ctx.lineTo(-6 + step * 2.5, 0); ctx.moveTo(-4, -7); ctx.lineTo(-4 - step * 2.5, 0);
  ctx.moveTo(5, -7); ctx.lineTo(5 - step * 2.5, 0); ctx.moveTo(7, -7); ctx.lineTo(7 + step * 2.5, 0); ctx.stroke();
  const g = ctx.createLinearGradient(0, -14, 0, -5); g.addColorStop(0, shade(col, 1.2)); g.addColorStop(1, shade(col, 0.75));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -9.5, 9, 4.5, 0, 0, 7); ctx.strokeStyle = 'rgba(18,12,8,0.7)'; ctx.lineWidth = 0.8; ctx.stroke(); ctx.fill();
  // neck & head
  ctx.beginPath(); ctx.moveTo(6, -11); ctx.lineTo(10, -17); ctx.lineTo(13, -16); ctx.lineTo(9, -9); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(12.5, -16.5, 3.4, 2, 0.4, 0, 7); ctx.fill();
  if (kind === 'deer') { ctx.strokeStyle = '#d8c8a0'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(11, -18); ctx.lineTo(9, -23); ctx.lineTo(7, -24); ctx.moveTo(9.5, -21.5); ctx.lineTo(11.5, -24); ctx.stroke(); }
  if (kind === 'boar') { ctx.strokeStyle = '#eee'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(14, -15); ctx.lineTo(16, -17); ctx.stroke(); }
  if (kind === 'horse') { ctx.fillStyle = '#2a1a10'; ctx.beginPath(); ctx.moveTo(7, -13); ctx.lineTo(10, -18); ctx.lineTo(9, -12); ctx.fill(); ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-9, -10); ctx.quadraticCurveTo(-12, -6, -11, -3); ctx.stroke(); }
  ctx.restore();
}

// rotated 3D box for vehicles: l along facing, w across, z0..z1
function vbox(ctx, ang, l, w, z0, z1, col, ox = 0, oy = 0) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const pts = [[l / 2, w / 2], [l / 2, -w / 2], [-l / 2, -w / 2], [-l / 2, w / 2]].map(([a, b]) => [ox + a * c - b * s, oy + a * s + b * c]);
  const cc = hexToRgb(col);
  for (let i = 0; i < 4; i++) {
    const p = pts[i], q = pts[(i + 1) % 4];
    const nx = (q[1] - p[1]), ny = -(q[0] - p[0]);
    if (nx + ny <= 0) continue;
    const len = Math.hypot(nx, ny) || 1;
    const l2 = 0.62 + 0.3 * ((ny - nx) / len * 0.5 + 0.5);
    face(ctx, [[p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]], shade(cc, l2));
  }
  face(ctx, pts.map(p => [p[0], p[1], z1]), shade(cc, 1.05));
}

function barrel(ctx, ang, len, z, ox, oy, col, width = 2.5) {
  const a = P(ox, oy, z), b = P(ox + Math.cos(ang) * len, oy + Math.sin(ang) * len, z);
  ctx.strokeStyle = col; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
  return b;
}

export function drawUnit(ctx, x, y, o) {
  // o: {type, def, team, era, face(angle), walk, act, busy, carry, id, t}
  const d = o.def;
  const sprite = d.sprite;
  const ang = o.face || 0;
  const [dx] = P(Math.cos(ang), Math.sin(ang));
  const dir = dx < 0 ? -1 : 1;
  const tc = TEAM[o.team] || '#bbb';
  const era = d.era || o.era;
  if (d.naval || d.class === 'naval') {
    drawShip(ctx, x, y, { ...o, era, moving: o.moving ?? (o.walk > 0) }, drawHuman);
    return;
  }
  if (d.class === 'animal') {
    ctx.save(); ctx.translate(x, y); ctx.scale(dir * 1.25, 1.25);
    if (sprite === 'mammoth') {
      quadruped(ctx, o, '#6a4a30', 1.7, 'mammoth');
      ctx.strokeStyle = '#f0e6d0'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(21, -26); ctx.quadraticCurveTo(28, -18, 22, -12); ctx.stroke();
    } else quadruped(ctx, o, sprite === 'deer' ? '#a8784a' : '#4a3a30', sprite === 'deer' ? 0.9 : 0.85, sprite);
    ctx.restore();
    return;
  }
  ctx.save(); ctx.translate(x, y); ctx.scale(1.3, 1.3);
  switch (sprite) {
    case 'horse': case 'knight': case 'donkey': {
      ctx.save(); ctx.scale(dir, 1);
      quadruped(ctx, o, sprite === 'donkey' ? '#8a7a6a' : sprite === 'knight' ? '#e8e0d0' : '#7a4a2a', sprite === 'donkey' ? 0.9 : 1.05, 'horse');
      if (sprite === 'knight') { ctx.fillStyle = tc; ctx.beginPath(); ctx.moveTo(-8, -12); ctx.lineTo(8, -12); ctx.lineTo(9, -5); ctx.lineTo(-9, -5); ctx.fill(); }
      ctx.restore();
      drawHuman(ctx, 0, -9, { team: o.team, era, sprite: o.def.projectile ? 'musket' : sprite === 'knight' ? 'spear' : 'sword', dir, walk: 0, act: o.act, busy: o.busy, carry: -1, cls: 'mounted', id: o.id });
      break;
    }
    case 'chariot': {
      ctx.save(); ctx.scale(dir, 1); ctx.translate(8, 0); quadruped(ctx, o, '#6a3a1a', 0.85, 'horse'); ctx.restore();
      ctx.save(); ctx.scale(dir, 1);
      ctx.fillStyle = '#8a6a3a'; ctx.fillRect(-10, -10, 10, 6);
      ctx.strokeStyle = '#4a3018'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(-5, -3, 4, 0, 7); ctx.stroke();
      ctx.restore();
      drawHuman(ctx, -5 * dir, -6, { team: o.team, era, sprite: 'bow', dir, walk: 0, act: o.act, busy: o.busy, carry: -1, cls: 'ranged', id: o.id });
      break;
    }
    case 'tank_old': case 'tank': case 'hover': case 'rocket_truck': case 'artillery': {
      const hover = sprite === 'hover';
      const zb = hover ? 0.25 + Math.sin(o.t * 3) * 0.04 : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 2, 18, 7, 0, 0, 7); ctx.fill();
      if (hover) { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16); g.addColorStop(0, 'rgba(120,240,255,0.7)'); g.addColorStop(1, 'rgba(120,240,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 16, 8, 0, 0, 7); ctx.fill(); }
      const hull = sprite === 'tank_old' ? '#6a6a4a' : era === 'future' ? '#c8d0da' : sprite === 'rocket_truck' ? '#5a6248' : '#5b6a46';
      if (!hover && sprite !== 'rocket_truck') vbox(ctx, ang, 0.95, 0.62, 0, 0.12, '#2a2a28');
      if (sprite === 'rocket_truck' || sprite === 'artillery') {
        vbox(ctx, ang, 0.95, 0.5, 0.06, 0.24, hull);
        vbox(ctx, ang, 0.28, 0.48, 0.24, 0.45, shade(hull, 1.1), Math.cos(ang) * 0.3, Math.sin(ang) * 0.3);
        if (sprite === 'rocket_truck') vbox(ctx, ang, 0.45, 0.4, 0.3, 0.5, '#3a3e34', -Math.cos(ang) * 0.18, -Math.sin(ang) * 0.18);
        else barrel(ctx, ang, 0.9, 0.42, -Math.cos(ang) * 0.1, -Math.sin(ang) * 0.1, '#333', 3);
        for (const w of [-0.3, 0.3]) for (const s2 of [-1, 1]) { const p = P(Math.cos(ang) * w - Math.sin(ang) * 0.27 * s2, Math.sin(ang) * w + Math.cos(ang) * 0.27 * s2, 0.06); ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.ellipse(p[0], p[1], 3.2, 2.4, 0, 0, 7); ctx.fill(); }
      } else {
        vbox(ctx, ang, sprite === 'tank_old' ? 1.0 : 0.9, 0.55, 0.1 + zb, 0.3 + zb, hull);
        if (sprite === 'tank_old') { barrel(ctx, ang + 1.57, 0.32, 0.22, 0, 0, '#333', 2); barrel(ctx, ang - 1.57, 0.32, 0.22, 0, 0, '#333', 2); }
        else {
          vbox(ctx, ang, 0.42, 0.38, 0.3 + zb, 0.45 + zb, shade(hull, 1.12), -Math.cos(ang) * 0.06, -Math.sin(ang) * 0.06);
          const tip = barrel(ctx, ang, 0.65, 0.38 + zb, 0, 0, hover ? '#9ab' : '#2a2a2a', hover ? 2.2 : 3);
          if (hover) { ctx.fillStyle = '#7cf1ff'; ctx.beginPath(); ctx.arc(tip[0], tip[1], 1.6, 0, 7); ctx.fill(); }
        }
      }
      // team marking
      const m = P(0, 0, 0.31 + zb); ctx.fillStyle = tc; ctx.beginPath(); ctx.arc(m[0], m[1] - 1, 2.6, 0, 7); ctx.fill();
      break;
    }
    case 'fighter': case 'drone': case 'frigate': case 'dreadnought': {
      const sc = sprite === 'dreadnought' ? 2.2 : sprite === 'frigate' ? 1.5 : sprite === 'drone' ? 1.2 : 0.9;
      const alt = 1.3 + Math.sin(o.t * 2 + o.id) * 0.08;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 3, 12 * sc, 5 * sc, 0, 0, 7); ctx.fill();
      const c = Math.cos(ang), s = Math.sin(ang);
      const pt = (a, b, z) => P(a * c - b * s, a * s + b * c, z);
      const hull = sprite === 'dreadnought' ? '#5a6270' : '#c5ced8';
      const shapePts = sprite === 'fighter' ? [[0.6, 0], [-0.4, 0.45], [-0.25, 0], [-0.4, -0.45]] :
        sprite === 'drone' ? [[0.35, 0.35], [-0.35, 0.35], [-0.35, -0.35], [0.35, -0.35]] :
          [[0.7, 0], [0.2, 0.3], [-0.6, 0.32], [-0.6, -0.32], [0.2, -0.3]];
      ctx.beginPath();
      shapePts.forEach(([a, b], i) => { const p = pt(a * sc, b * sc, alt); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
      ctx.closePath();
      const g = ctx.createLinearGradient(-10 * sc, -alt * ZH - 6, 10 * sc, -alt * ZH + 6); g.addColorStop(0, shade(hull, 1.3)); g.addColorStop(1, shade(hull, 0.6));
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = shade(hull, 0.5); ctx.lineWidth = 0.8; ctx.stroke();
      // team stripe and engines
      const st = pt(0, 0, alt); ctx.fillStyle = tc; ctx.beginPath(); ctx.arc(st[0], st[1], 2.2 * sc, 0, 7); ctx.fill();
      const eng = pt(-0.55 * sc, 0, alt);
      const eg = ctx.createRadialGradient(eng[0], eng[1], 0, eng[0], eng[1], 6 * sc); eg.addColorStop(0, '#fff'); eg.addColorStop(0.4, sprite === 'dreadnought' ? '#ff9a3a' : '#7cf1ff'); eg.addColorStop(1, 'rgba(0,200,255,0)');
      ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(eng[0], eng[1], 6 * sc, 0, 7); ctx.fill();
      if (sprite === 'dreadnought' || sprite === 'frigate') for (let i = 0; i < 4; i++) { const w = pt((0.3 - i * 0.25) * sc, 0.12 * sc, alt + 0.05); ctx.fillStyle = '#ffe9a0'; ctx.fillRect(w[0] - 0.8, w[1] - 0.8, 1.6, 1.6); }
      break;
    }
    case 'ram': case 'catapult': case 'trebuchet': case 'ballista': case 'cannon': {
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, 1, 14, 5, 0, 0, 7); ctx.fill();
      const wood = '#7a5530';
      if (sprite === 'ram') {
        vbox(ctx, ang, 0.9, 0.5, 0.08, 0.32, wood);
        const c = Math.cos(ang), s = Math.sin(ang);
        face(ctx, [[0.45 * c - 0.3 * s, 0.45 * s + 0.3 * c, 0.32], [-0.45 * c - 0.3 * s, -0.45 * s + 0.3 * c, 0.32], [-0.45 * c, -0.45 * s, 0.55], [0.45 * c, 0.45 * s, 0.55]], '#6a4a2a');
        face(ctx, [[0.45 * c + 0.3 * s, 0.45 * s - 0.3 * c, 0.32], [-0.45 * c + 0.3 * s, -0.45 * s - 0.3 * c, 0.32], [-0.45 * c, -0.45 * s, 0.55], [0.45 * c, 0.45 * s, 0.55]], '#8a6a3a');
        barrel(ctx, ang, 0.65, 0.22, 0, 0, '#b08040', 3.5);
      } else if (sprite === 'cannon') {
        for (const s2 of [-1, 1]) { const p = P(-Math.sin(ang) * 0.22 * s2, Math.cos(ang) * 0.22 * s2, 0.12); ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 3, 4, 4, 0, 0, 7); ctx.stroke(); }
        barrel(ctx, ang, 0.7, 0.22, -Math.cos(ang) * 0.2, -Math.sin(ang) * 0.2, era === 'gunpowder' ? '#3a3a3a' : '#2e3a2a', 4);
      } else {
        vbox(ctx, ang, 0.8, 0.55, 0.05, 0.18, wood);
        const c = Math.cos(ang), s = Math.sin(ang);
        if (sprite === 'ballista') { barrel(ctx, ang, 0.5, 0.3, 0, 0, '#5a3a1a', 2); const a2 = P(0.15 * c - 0.35 * s, 0.15 * s + 0.35 * c, 0.3), b2 = P(0.15 * c + 0.35 * s, 0.15 * s - 0.35 * c, 0.3); ctx.strokeStyle = '#4a2a10'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...a2); ctx.quadraticCurveTo(...P(0.35 * c, 0.35 * s, 0.3), ...b2); ctx.stroke(); }
        else {
          const tall = sprite === 'trebuchet' ? 1.4 : 0.6;
          ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2;
          const f1 = P(-0.2 * s, 0.2 * c, 0.15), f2 = P(0.2 * s, -0.2 * c, 0.15), top = P(0, 0, tall);
          ctx.beginPath(); ctx.moveTo(...f1); ctx.lineTo(...top); ctx.lineTo(...f2); ctx.stroke();
          const sw = o.busy ? Math.sin(o.act * Math.PI) : 0;
          const armA = -0.6 + sw * 2.2;
          const tip = P(Math.cos(ang) * Math.cos(armA) * 0.9 * -1, Math.sin(ang) * Math.cos(armA) * 0.9 * -1, tall + Math.sin(armA) * 0.9);
          ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(...top); ctx.lineTo(...tip); ctx.stroke();
          ctx.fillStyle = '#777'; ctx.beginPath(); ctx.arc(tip[0], tip[1], 2.5, 0, 7); ctx.fill();
        }
      }
      break;
    }
    default:
      drawHuman(ctx, 0, 0, { team: o.team, era, sprite, dir, walk: o.walk, act: o.act, busy: o.busy, carry: o.carry, cls: d.class, id: o.id });
  }
  ctx.restore();
}

// ------------------------------------------------------------------ icons
export function resIcon(ctx, r, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 20, s / 20);
  switch (r) {
    case 0: // food: meat + wheat
      ctx.fillStyle = '#c0583a'; ctx.beginPath(); ctx.ellipse(-1, 1, 7, 5.5, -0.6, 0, 7); ctx.fill();
      ctx.fillStyle = '#f0e0c0'; ctx.fillRect(3, -7, 3, 6); ctx.beginPath(); ctx.arc(4.5, -7.5, 2.4, 0, 7); ctx.fill(); break;
    case 1: // wood: logs
      for (let i = 0; i < 3; i++) { ctx.fillStyle = '#7b4f2a'; ctx.fillRect(-8, -6 + i * 5, 14, 4.5); ctx.fillStyle = '#d5b07a'; ctx.beginPath(); ctx.arc(6, -3.8 + i * 5, 2.3, 0, 7); ctx.fill(); } break;
    case 2: ctx.fillStyle = '#9aa0a6'; ctx.beginPath(); ctx.moveTo(-8, 6); ctx.lineTo(-5, -4); ctx.lineTo(2, -7); ctx.lineTo(8, 0); ctx.lineTo(6, 6); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#c8ccd0'; ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(2, -7); ctx.lineTo(0, -1); ctx.fill(); break;
    case 3: ctx.fillStyle = '#d7a52a'; ctx.beginPath(); ctx.arc(-3, 2, 5.5, 0, 7); ctx.fill(); ctx.fillStyle = '#f7d24a'; ctx.beginPath(); ctx.arc(3, -1, 5.5, 0, 7); ctx.fill(); ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(2, -3, 1.5, 0, 7); ctx.fill(); break;
    case 4: ctx.fillStyle = '#43d2ff'; ctx.beginPath(); ctx.moveTo(2, -9); ctx.lineTo(-6, 1); ctx.lineTo(-1, 1); ctx.lineTo(-3, 9); ctx.lineTo(6, -2); ctx.lineTo(1, -2); ctx.closePath(); ctx.fill(); break;
    case 5: // population
      ctx.fillStyle = '#e8d8b8'; ctx.beginPath(); ctx.arc(0, -4, 3.5, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(-6, 8); ctx.quadraticCurveTo(0, -4, 6, 8); ctx.fill(); break;
  }
  ctx.restore();
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
  b.bbox = [x0 / 2, y0 / 2, (x1 + 2) / 2, (y1 + 2) / 2];
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
    ctx.drawImage(b.canvas, bb[0] * 2, bb[1] * 2, bw * 2, bh * 2, (size - bw * sc) / 2, (size - bh * sc) / 2 + 1, bw * sc, bh * sc);
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
