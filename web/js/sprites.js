// Procedural art: terrain palettes, buildings, resources, units and icons.
// Everything is drawn with canvas paths so no image assets are needed.
import { TW, TH, ZH, TEAM, hexToRgb, shade, mix, rgb, hash2 } from './util.js';

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

function flag(ctx, x, y, z, h, team, t = 0) {
  const [bx, by] = P(x, y, z);
  ctx.strokeStyle = '#3a2c1c'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by - h * ZH); ctx.stroke();
  const w = Math.sin(t * 4 + x) * 2;
  ctx.fillStyle = TEAM[team] || '#888';
  ctx.beginPath(); ctx.moveTo(bx, by - h * ZH); ctx.quadraticCurveTo(bx + 7, by - h * ZH + 1 + w, bx + 13, by - h * ZH + 3);
  ctx.lineTo(bx + 13, by - h * ZH + 10); ctx.quadraticCurveTo(bx + 7, by - h * ZH + 8 + w, bx, by - h * ZH + 8); ctx.closePath(); ctx.fill();
}

function groundShadow(ctx, s, k = 0.25) {
  ctx.fillStyle = `rgba(0,0,0,${k})`;
  face(ctx, [[0.15, 0.25, 0], [s + 0.45, 0.25, 0], [s + 0.45, s + 0.35, 0], [0.15, s + 0.35, 0]], ctx.fillStyle);
}

// ------------------------------------------------------------- buildings
// Era style palettes.
const ERA = {
  stone: { wall: '#7a5a3a', roof: '#8d6c45', trim: '#4a3520', stone: '#8f8a80' },
  bronze: { wall: '#c9a676', roof: '#a8865a', trim: '#7a5a34', stone: '#b9a27e' },
  iron: { wall: '#7b5b3b', roof: '#b39556', trim: '#4b3620', stone: '#8d8678' },
  classical: { wall: '#e9e2d0', roof: '#b4553a', trim: '#cfc4a8', stone: '#d8d0bc' },
  medieval: { wall: '#9d978c', roof: '#7a3b2b', trim: '#5a3a24', stone: '#8c877d' },
  gunpowder: { wall: '#a8553c', roof: '#4c5560', trim: '#e0d8c8', stone: '#9e978b' },
  industrial: { wall: '#8e4434', roof: '#3e3e44', trim: '#c8b89a', stone: '#7a7674' },
  modern: { wall: '#b9bcc0', roof: '#5d6266', trim: '#3f86c6', stone: '#9ea2a6' },
  future: { wall: '#dfe6ee', roof: '#8fa2b8', trim: '#39d4ff', stone: '#c5ccd6' },
  space: { wall: '#8792a3', roof: '#4c5666', trim: '#7cf1ff', stone: '#6f7a8a' },
};

const bcache = new Map();

// Returns a cached canvas for a building and its anchor (screen offset of
// the footprint's top tile corner).
export function buildingSprite(type, era, team, size, stage) {
  const key = `${type}|${era}|${team}|${stage}`;
  let c = bcache.get(key);
  if (c) return c;
  const w = size * TW + 40, h = size * TH + 190;
  const cv = document.createElement('canvas');
  cv.width = w * 2; cv.height = h * 2;
  const ctx = cv.getContext('2d');
  ctx.scale(2, 2);
  // origin: footprint top corner at (w/2, 170)
  ctx.translate(w / 2, 170);
  if (stage < 3) drawFoundation(ctx, size, stage, era);
  else drawBuilding(ctx, type, era, team, size, 0);
  c = { canvas: cv, ox: w / 2, oy: 170, w, h };
  bcache.set(key, c);
  return c;
}

function drawFoundation(ctx, s, stage, era) {
  const e = ERA[era] || ERA.medieval;
  face(ctx, [[0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0]], 'rgba(120,96,64,0.75)');
  ctx.strokeStyle = 'rgba(60,40,20,0.6)';
  for (let i = 0; i <= s; i++) {
    let [a, b] = [P(i, 0), P(i, s)]; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
    [a, b] = [P(0, i), P(s, i)]; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
  }
  if (stage >= 1) box(ctx, 0.15, 0.15, s - 0.15, s - 0.15, 0, 0.25 + stage * 0.25, e.stone, { noTop: false });
  // scaffolding poles
  ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 2;
  const hz = 0.6 + stage * 0.5;
  for (const [x, y] of [[0.1, s - 0.1], [s - 0.1, s - 0.1], [s - 0.1, 0.1], [s / 2, s - 0.1], [s - 0.1, s / 2]]) {
    const a = P(x, y, 0), b = P(x, y, hz); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
  }
  ctx.lineWidth = 1.2;
  for (const z of [hz * 0.5, hz]) {
    const pts = [P(0.1, s - 0.1, z), P(s - 0.1, s - 0.1, z), P(s - 0.1, 0.1, z)];
    ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.lineTo(...pts[1]); ctx.lineTo(...pts[2]); ctx.stroke();
  }
}

// Draws a finished building into ctx with origin at the footprint top corner.
export function drawBuilding(ctx, type, era, team, s, t) {
  const e = ERA[era] || ERA.medieval;
  const tc = TEAM[team] || '#888';
  const m = 0.12;
  const x0 = m, y0 = m, x1 = s - m, y1 = s - m;
  groundShadow(ctx, s);
  const prim = era === 'stone';
  const ancient = era === 'bronze' || era === 'iron';
  const futur = era === 'future' || era === 'space';
  const dark = 'rgba(25,18,12,0.85)';
  const glass = futur ? 'rgba(90,230,255,0.9)' : era === 'modern' ? 'rgba(120,180,220,0.9)' : 'rgba(255,210,120,0.85)';
  switch (type) {
    case 'town_center': {
      if (prim) {
        // big hide tent with poles and a camp fire
        cone(ctx, s / 2 - 0.2, s / 2 - 0.2, 0, 1.2, 1.9, '#9a7448');
        ctx.strokeStyle = '#3d2a17'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
          const a = i * 1.3, p = P(s / 2 - 0.2 + Math.cos(a) * 0.25, s / 2 - 0.2 + Math.sin(a) * 0.25, 2.1), q = P(s / 2 - 0.2, s / 2 - 0.2, 1.6);
          ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.stroke();
        }
        winL(ctx, s / 2 - 0.5, s / 2 + 0.8, 0.3, 0, 0.35, 0.5, dark);
        cone(ctx, 0.6, s - 0.7, 0, 0.45, 0.8, '#86653f');
        cone(ctx, s - 0.7, 0.6, 0, 0.45, 0.8, '#86653f');
        // fire pit stones
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * 6.28, p = P(s - 0.6 + Math.cos(a) * 0.3, s - 0.6 + Math.sin(a) * 0.3, 0);
          ctx.fillStyle = '#777'; ctx.beginPath(); ctx.ellipse(p[0], p[1], 2.5, 1.5, 0, 0, 7); ctx.fill();
        }
        flag(ctx, 0.4, 0.4, 0, 2.2, team, t);
      } else if (ancient) {
        box(ctx, x0, y0, x1, y1, 0, 0.9, e.wall);
        box(ctx, 0.6, 0.6, s - 0.6, s - 0.6, 0.9, 1.6, e.wall);
        gable(ctx, 0.6, 0.6, s - 0.6, s - 0.6, 1.6, 0.6, e.roof, true);
        for (let i = 0; i < 4; i++) winL(ctx, x0, y1, 0.3 + i * 0.65, 0.25, 0.25, 0.4, dark);
        winR(ctx, x1, y0, 1.1, 0, 0.6, 0.7, dark);
        flag(ctx, s / 2, s / 2, 2.1, 1, team, t);
      } else if (era === 'classical') {
        box(ctx, x0, y0, x1, y1, 0, 0.25, e.stone);
        box(ctx, 0.4, 0.4, s - 0.3, s - 0.3, 0.25, 1.3, e.wall);
        for (let i = 0; i < 6; i++) cylinder(ctx, 0.35 + i * 0.47, s - 0.22, 0.25, 1.35, 0.09, '#f4efe2', 8);
        for (let i = 0; i < 6; i++) cylinder(ctx, s - 0.22, 0.35 + i * 0.47, 0.25, 1.35, 0.09, '#f4efe2', 8);
        box(ctx, 0.2, 0.2, s - 0.1, s - 0.1, 1.35, 1.5, e.trim);
        gable(ctx, 0.2, 0.2, s - 0.1, s - 0.1, 1.5, 0.55, e.roof, false, 0);
        dome(ctx, s / 2, s / 2, 2.0, 0.55, '#c9b98e');
        flag(ctx, 0.3, 0.3, 1.5, 1.1, team, t);
      } else if (era === 'medieval') {
        box(ctx, x0, y0, x1, y1, 0, 1.1, e.wall);
        for (let i = 0; i < 6; i++) box(ctx, x0 + i * 0.47, y1 - 0.18, x0 + i * 0.47 + 0.25, y1, 1.1, 1.3, e.wall);
        for (let i = 0; i < 6; i++) box(ctx, x1 - 0.18, y0 + i * 0.47, x1, y0 + i * 0.47 + 0.25, 1.1, 1.3, e.wall);
        box(ctx, 0.8, 0.8, 2.2, 2.2, 1.1, 2.4, shade(e.wall, 0.95));
        pyramid(ctx, 0.7, 0.7, 2.3, 2.3, 2.4, 0.9, e.roof);
        winL(ctx, x0, y1, 1.1, 0, 0.6, 0.75, '#3b2a1a');
        for (let i = 0; i < 3; i++) winL(ctx, 0.8, 2.2, 0.25 + i * 0.45, 1.6, 0.14, 0.35, dark);
        flag(ctx, 1.5, 1.5, 3.2, 0.9, team, t);
      } else if (era === 'gunpowder') {
        box(ctx, x0, y0, x1, y1, 0, 1.3, e.wall);
        gable(ctx, x0, y0, x1, y1, 1.3, 0.8, e.roof, true);
        box(ctx, 1.2, 1.2, 1.8, 1.8, 1.6, 2.6, e.trim);
        pyramid(ctx, 1.15, 1.15, 1.85, 1.85, 2.6, 0.8, '#3a6f5a');
        for (let i = 0; i < 5; i++) { winL(ctx, x0, y1, 0.25 + i * 0.55, 0.3, 0.22, 0.4, glass); winL(ctx, x0, y1, 0.25 + i * 0.55, 0.85, 0.22, 0.3, glass); }
        for (let i = 0; i < 5; i++) winR(ctx, x1, y0, 0.25 + i * 0.55, 0.5, 0.22, 0.45, glass);
        flag(ctx, 1.5, 1.5, 3.4, 0.8, team, t);
      } else if (era === 'industrial') {
        box(ctx, x0, y0, x1, y1, 0, 1.4, e.wall);
        box(ctx, x0, y0, x1, y1, 1.4, 1.55, e.trim);
        box(ctx, 1.1, 1.1, 1.9, 1.9, 1.55, 2.6, e.trim);
        dome(ctx, 1.5, 1.5, 2.6, 0.45, '#6f8f88');
        for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) winL(ctx, x0, y1, 0.2 + i * 0.46, 0.25 + r * 0.6, 0.2, 0.38, glass);
        for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) winR(ctx, x1, y0, 0.2 + i * 0.46, 0.25 + r * 0.6, 0.2, 0.38, glass);
        flag(ctx, 1.5, 1.5, 3.5, 0.7, team, t);
      } else if (era === 'modern') {
        box(ctx, x0, y0, x1, y1, 0, 0.8, e.wall);
        box(ctx, 0.5, 0.5, 2.0, 2.0, 0.8, 3.2, '#9fb6c8');
        for (let r = 0; r < 7; r++) { winL(ctx, 0.5, 2.0, 0.08, 0.95 + r * 0.32, 1.34, 0.18, glass); winR(ctx, 2.0, 0.5, 0.08, 0.95 + r * 0.32, 1.34, 0.18, glass); }
        ctx.strokeStyle = '#ccc'; const a = P(1.25, 1.25, 3.2), b = P(1.25, 1.25, 4); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
        flag(ctx, 2.6, 2.6, 0.8, 0.9, team, t);
      } else {
        // future / space: domed command nexus with glowing ring
        cylinder(ctx, s / 2, s / 2, 0, 0.5, 1.35, e.wall, 24);
        dome(ctx, s / 2, s / 2, 0.5, 1.15, era === 'space' ? '#8ea3c0' : '#e6eef6', e.trim);
        cylinder(ctx, s / 2, s / 2, 1.6, 2.8, 0.18, e.wall, 10);
        const [gx, gy] = P(s / 2, s / 2, 2.9);
        const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, 14); gr.addColorStop(0, '#fff'); gr.addColorStop(0.3, e.trim); gr.addColorStop(1, 'rgba(0,200,255,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(gx, gy, 14, 0, 7); ctx.fill();
        flag(ctx, 0.4, s - 0.4, 0, 1.4, team, t);
      }
      break;
    }
    case 'house': {
      if (prim) {
        cone(ctx, s / 2, s / 2, 0, 0.75, 1.3, '#8f6b40');
        winL(ctx, s / 2 - 0.2, s / 2 + 0.65, 0, 0, 0.3, 0.4, dark);
      } else if (ancient) {
        box(ctx, x0 + 0.1, y0 + 0.1, x1, y1, 0, 0.7, e.wall);
        if (era === 'iron') gable(ctx, x0 + 0.1, y0 + 0.1, x1, y1, 0.7, 0.6, e.roof, true);
        else box(ctx, x0 + 0.05, y0 + 0.05, x1 + 0.05, y1 + 0.05, 0.7, 0.78, e.trim);
        winL(ctx, x0 + 0.1, y1, 0.5, 0, 0.3, 0.45, dark);
      } else if (futur) {
        dome(ctx, s / 2, s / 2, 0, 0.75, e.wall, e.trim);
      } else if (era === 'modern' || era === 'industrial') {
        box(ctx, x0, y0, x1, y1, 0, era === 'modern' ? 1.6 : 1.1, e.wall);
        if (era === 'industrial') gable(ctx, x0, y0, x1, y1, 1.1, 0.4, e.roof, false);
        for (let r = 0; r < (era === 'modern' ? 4 : 2); r++) { winL(ctx, x0, y1, 0.2, 0.2 + r * 0.36, 0.3, 0.2, glass); winL(ctx, x0, y1, 0.9, 0.2 + r * 0.36, 0.3, 0.2, glass); winR(ctx, x1, y0, 0.2, 0.2 + r * 0.36, 0.3, 0.2, glass); winR(ctx, x1, y0, 0.9, 0.2 + r * 0.36, 0.3, 0.2, glass); }
      } else {
        box(ctx, x0 + 0.05, y0 + 0.05, x1, y1, 0, 0.75, e.wall);
        if (era === 'medieval') {
          ctx.strokeStyle = e.trim; ctx.lineWidth = 1.5;
          for (let i = 0; i <= 3; i++) { const a = P(x0 + 0.05 + i * 0.55, y1, 0), b = P(x0 + 0.05 + i * 0.55, y1, 0.75); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
        }
        gable(ctx, x0 + 0.05, y0 + 0.05, x1, y1, 0.75, 0.65, e.roof, true);
        winL(ctx, x0, y1, 0.3, 0, 0.3, 0.5, '#4a2f1a');
        winR(ctx, x1, y0, 0.6, 0.3, 0.3, 0.25, glass);
      }
      // team band
      face(ctx, [[x0 + 0.2, y1 + 0.02, 0.05], [x0 + 0.5, y1 + 0.02, 0.05], [x0 + 0.5, y1 + 0.02, 0.2], [x0 + 0.2, y1 + 0.02, 0.2]], tc);
      break;
    }
    case 'granary': case 'lumber_camp': case 'mining_camp': {
      const res = type === 'granary' ? 0 : type === 'lumber_camp' ? 1 : 2;
      if (prim) {
        // lean-to shelter with piles
        face(ctx, [[0.2, 0.3, 0], [1.6, 0.3, 0], [1.6, 0.3, 0.9], [0.2, 0.3, 0.9]], '#6d4c2c');
        face(ctx, [[0.2, 0.3, 0.9], [1.6, 0.3, 0.9], [1.6, 1.4, 0.2], [0.2, 1.4, 0.2]], '#9a7a4a');
      } else if (futur) {
        cylinder(ctx, 0.75, 0.75, 0, 0.9, 0.5, e.wall);
        dome(ctx, 0.75, 0.75, 0.9, 0.5, e.wall, e.trim);
        box(ctx, 1.2, 1.1, 1.85, 1.85, 0, 0.35, e.stone);
      } else {
        box(ctx, 0.15, 0.15, 1.3, 1.3, 0, 0.75, e.wall);
        if (type === 'granary' && (era === 'medieval' || era === 'gunpowder')) {
          cylinder(ctx, 0.75, 0.75, 0.75, 1.3, 0.45, e.wall);
          cone(ctx, 0.75, 0.75, 1.3, 0.55, 0.6, e.roof);
          // windmill sails
          const [mx, my] = P(1.3, 0.75, 1.15);
          ctx.strokeStyle = '#e9dcc0'; ctx.lineWidth = 2;
          for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + t * 1.2; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a) * 18, my + Math.sin(a) * 18); ctx.stroke(); }
        } else gable(ctx, 0.15, 0.15, 1.3, 1.3, 0.75, 0.45, e.roof, false);
        winL(ctx, 0.15, 1.3, 0.35, 0, 0.45, 0.55, dark);
      }
      // resource piles
      if (res === 0) { for (let i = 0; i < 3; i++) { const p = P(1.45 + i * 0.12, 1.55 - i * 0.2, 0); ctx.fillStyle = futur ? '#7ad36a' : '#d8b24a'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 4, 6, 5, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#8a6a2a'; ctx.stroke(); } }
      if (res === 1) { for (let i = 0; i < 4; i++) { const p = P(1.4, 1.2 + i * 0.15, 0.05 + (i % 2) * 0.12); ctx.fillStyle = '#7b4f2a'; ctx.beginPath(); ctx.ellipse(p[0], p[1], 9, 3, -0.45, 0, 7); ctx.fill(); ctx.fillStyle = '#d5b07a'; ctx.beginPath(); ctx.ellipse(p[0] + 8, p[1] - 4, 2.5, 2.5, 0, 0, 7); ctx.fill(); } }
      if (res === 2) { for (let i = 0; i < 5; i++) { const p = P(1.45 + (i % 2) * 0.2, 1.3 + i * 0.1, 0); ctx.fillStyle = i % 2 ? '#e6c24a' : '#9a9a9a'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 3, 4, 3, 0, 0, 7); ctx.fill(); } }
      flag(ctx, 0.2, 1.3, 0.75, 0.6, team, t);
      break;
    }
    case 'farm': {
      const soil = futur ? '#3d5560' : '#6e4e2e';
      face(ctx, [[0.05, 0.05, 0], [s - 0.05, 0.05, 0], [s - 0.05, s - 0.05, 0], [0.05, s - 0.05, 0]], soil);
      const crop = futur ? '#6cf08a' : era === 'stone' ? '#7aa03a' : '#c9b347';
      for (let r = 0; r < 7; r++) {
        for (let i = 0; i < 9; i++) {
          const x = 0.25 + r * 0.4, y = 0.2 + i * 0.3;
          const [px, py] = P(x, y, 0);
          ctx.fillStyle = shade(crop, 0.8 + hash2(r, i) * 0.4);
          ctx.beginPath(); ctx.ellipse(px, py - 2, 3, 2.5, 0, 0, 7); ctx.fill();
        }
      }
      if (futur) { box(ctx, 0, 0, s, 0.1, 0, 0.3, '#9ab'); box(ctx, 0, 0, 0.1, s, 0, 0.3, '#9ab'); }
      else { ctx.strokeStyle = '#5b3d22'; ctx.lineWidth = 1.2; const a = P(0, s), b = P(s, s), c = P(s, 0); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.stroke(); }
      break;
    }
    case 'barracks': case 'range': case 'stable': case 'workshop': case 'academy': {
      const h = type === 'academy' ? 1.2 : 1.0;
      if (prim) {
        // palisade camp with tents
        ctx.fillStyle = '#6b4a2a';
        for (let i = 0; i < 12; i++) { const p = P(0.1 + i * 0.24, s - 0.1, 0); ctx.fillRect(p[0] - 1.5, p[1] - 14, 3, 14); }
        for (let i = 0; i < 12; i++) { const p = P(s - 0.1, 0.1 + i * 0.24, 0); ctx.fillRect(p[0] - 1.5, p[1] - 14, 3, 14); }
        cone(ctx, 1.0, 1.0, 0, 0.6, 1.1, type === 'academy' ? '#7a5aa0' : '#8f6b40');
        cone(ctx, 2.0, 1.3, 0, 0.5, 0.9, '#9a7448');
        if (type === 'range') { const p = P(1.6, 2.2, 0.4); ctx.fillStyle = '#d8c090'; ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, 7); ctx.fill(); ctx.fillStyle = '#b33'; ctx.beginPath(); ctx.arc(p[0], p[1], 2.5, 0, 7); ctx.fill(); }
        if (type === 'academy') { const p = P(2.2, 2.2, 0); ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 8, 3, 8, 0, 0, 7); ctx.fill(); }
      } else if (futur) {
        box(ctx, x0, y0, x1, y1, 0, 0.6, e.wall);
        box(ctx, 0.4, 0.4, s - 0.4, s - 0.4, 0.6, 1.1, e.roof);
        face(ctx, [[x0, y1 + 0.01, 0.2], [x1, y1 + 0.01, 0.2], [x1, y1 + 0.01, 0.28], [x0, y1 + 0.01, 0.28]], e.trim);
        face(ctx, [[x1 + 0.01, y0, 0.2], [x1 + 0.01, y1, 0.2], [x1 + 0.01, y1, 0.28], [x1 + 0.01, y0, 0.28]], e.trim);
        if (type === 'stable') { const [px, py] = P(s / 2, s / 2, 1.12); ctx.strokeStyle = e.trim; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(px, py, 22, 11, 0, 0, 7); ctx.stroke(); }
        if (type === 'academy') dome(ctx, s / 2, s / 2, 1.1, 0.7, '#cfe8ff', e.trim);
        if (type === 'workshop') { box(ctx, 2.0, 0.3, 2.5, 0.8, 1.1, 2.0, e.stone); }
        winL(ctx, x0, y1, 0.9, 0, 1.0, 0.5, 'rgba(20,30,40,0.9)');
      } else {
        box(ctx, x0, y0, x1, y1, 0, h, e.wall);
        if (era === 'classical' && type === 'academy') {
          for (let i = 0; i < 6; i++) cylinder(ctx, 0.35 + i * 0.47, s - 0.22, 0, h + 0.1, 0.08, '#f4efe2', 8);
          gable(ctx, x0, y0, x1, y1, h + 0.1, 0.5, e.roof, false);
        } else if (era === 'industrial' || era === 'modern') {
          // saw-tooth factory roof
          for (let i = 0; i < 3; i++) {
            const xa = x0 + i * (x1 - x0) / 3, xb = xa + (x1 - x0) / 3;
            face(ctx, [[xa, y0, h], [xa, y1, h], [xb, y1, h + 0.45], [xb, y0, h + 0.45]], shade(e.roof, 1.05));
            face(ctx, [[xb, y0, h], [xb, y1, h], [xb, y1, h + 0.45]], shade(e.roof, 0.6));
            face(ctx, [[xa, y1, h], [xb, y1, h], [xb, y1, h + 0.45]], shade(e.roof, 0.8));
          }
          if (era === 'industrial') { cylinder(ctx, x0 + 0.4, y0 + 0.4, h, h + 1.6, 0.16, '#7a3a2c', 10); }
        } else {
          gable(ctx, x0, y0, x1, y1, h, 0.7, e.roof, type !== 'stable');
        }
        winL(ctx, x0, y1, 0.9, 0, 0.8, 0.65, type === 'stable' || type === 'workshop' ? '#2a1e14' : '#3b2a1a');
        for (let i = 0; i < 3; i++) winR(ctx, x1, y0, 0.3 + i * 0.85, 0.35, 0.3, 0.3, glass);
        if (type === 'range') { const p = P(x0 + 0.3, y1 + 0.3, 0.45); ctx.fillStyle = '#e8d7a8'; ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, 7); ctx.fill(); ctx.fillStyle = '#b22'; ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 7); ctx.fill(); }
        if (type === 'academy' && era !== 'classical') { box(ctx, 2.0, 0.3, 2.6, 0.9, h, h + 1.2, e.wall); pyramid(ctx, 1.95, 0.25, 2.65, 0.95, h + 1.2, 0.7, e.roof); }
        if (type === 'workshop' && era !== 'industrial') { ctx.strokeStyle = '#4b3420'; ctx.lineWidth = 2.5; const a = P(2.3, 2.4, 0), b = P(1.6, 2.6, 1.6); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
      }
      flag(ctx, x0 + 0.1, y0 + 0.1, prim ? 0 : h + 0.3, prim ? 1.6 : 0.8, team, t);
      break;
    }
    case 'tower': {
      if (prim) {
        ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = 2;
        for (const [x, y] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) { const a = P(x, y, 0), b = P(0.5 + (x - 0.5) * 0.6, 0.5 + (y - 0.5) * 0.6, 2); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
        box(ctx, 0.15, 0.15, 0.85, 0.85, 2, 2.15, '#8a6a42');
        pyramid(ctx, 0.1, 0.1, 0.9, 0.9, 2.15, 0.5, '#9a7a4a');
      } else if (futur) {
        cylinder(ctx, 0.5, 0.5, 0, 1.4, 0.32, e.wall);
        dome(ctx, 0.5, 0.5, 1.4, 0.35, e.roof, e.trim);
        const a = P(0.5, 0.5, 1.7), b = P(1.1, 1.1, 1.8); ctx.strokeStyle = '#555'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
        ctx.fillStyle = e.trim; ctx.beginPath(); ctx.arc(b[0], b[1], 2.5, 0, 7); ctx.fill();
      } else if (era === 'modern' || era === 'industrial') {
        box(ctx, 0.05, 0.05, 0.95, 0.95, 0, 0.7, '#8d9190');
        winL(ctx, 0.05, 0.95, 0.2, 0.35, 0.6, 0.12, '#111');
        winR(ctx, 0.95, 0.05, 0.2, 0.35, 0.6, 0.12, '#111');
      } else {
        const round = era === 'medieval' || era === 'classical';
        if (round) { cylinder(ctx, 0.5, 0.5, 0, 2.2, 0.42, e.stone); cone(ctx, 0.5, 0.5, 2.2, 0.5, 0.8, e.roof); }
        else { box(ctx, 0.1, 0.1, 0.9, 0.9, 0, 2.0, e.wall); pyramid(ctx, 0.05, 0.05, 0.95, 0.95, 2.0, 0.7, e.roof); }
        winL(ctx, 0.1, 0.92, 0.35, 1.3, 0.12, 0.3, dark);
      }
      flag(ctx, 0.5, 0.5, prim ? 2.6 : futur ? 2.0 : 2.4, 0.6, team, t);
      break;
    }
    case 'generator': {
      if (futur) {
        cylinder(ctx, 1, 1, 0, 0.5, 0.8, e.wall);
        const [gx, gy] = P(1, 1, 0.9);
        const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, 26); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#7cf1ff'); gr.addColorStop(1, 'rgba(0,180,255,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(gx, gy, 26, 0, 7); ctx.fill();
      } else if (era === 'modern') {
        // solar panels + transformer
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) face(ctx, [[0.15 + i * 0.9, 0.15 + j * 0.9, 0.25], [0.95 + i * 0.9, 0.15 + j * 0.9, 0.25], [0.95 + i * 0.9, 0.85 + j * 0.9, 0.55], [0.15 + i * 0.9, 0.85 + j * 0.9, 0.55]], '#20365a', '#7a9cc0');
      } else {
        box(ctx, 0.15, 0.15, 1.85, 1.6, 0, 1.0, e.wall);
        gable(ctx, 0.15, 0.15, 1.85, 1.6, 1.0, 0.4, e.roof, true);
        cylinder(ctx, 1.5, 1.4, 0, 2.6, 0.17, '#6e3428', 10);
        cylinder(ctx, 1.1, 1.5, 0, 2.2, 0.15, '#6e3428', 10);
      }
      break;
    }
    default:
      box(ctx, x0, y0, x1, y1, 0, 1, e.wall);
  }
}

// chimneys emitting smoke (screen offsets relative to footprint corner)
export function smokePoints(type, era, s) {
  if (type === 'generator' && (era === 'industrial' || era === 'gunpowder' || era === 'medieval')) return [[1.5, 1.4, 2.7], [1.1, 1.5, 2.3]];
  if ((type === 'workshop' || type === 'barracks' || type === 'range' || type === 'academy' || type === 'stable') && era === 'industrial') return [[0.52, 0.52, 2.7]];
  if (type === 'house' && (era === 'medieval' || era === 'gunpowder' || era === 'iron')) return [[1, 1, 1.4]];
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
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(4, 2, 16, 7, 0, 0, 7); ctx.fill();
  switch (type) {
    case 'tree': {
      const style = treeStyle === 'mixed' ? (rnd(1) < 0.5 ? 'oak' : 'pine') : treeStyle;
      const sc = 0.85 + rnd(2) * 0.35;
      ctx.save(); ctx.scale(sc, sc);
      if (style === 'oak') {
        ctx.fillStyle = '#5a3b20'; ctx.fillRect(-2.5, -24, 5, 24);
        const base = [[42, 92, 30], [58, 110, 36], [74, 128, 44]][Math.floor(rnd(3) * 3)];
        for (let i = 0; i < 7; i++) {
          const a = i / 7 * 6.28 + rnd(4), r = 9 + rnd(5 + i) * 5;
          blob(ctx, Math.cos(a) * 8, -36 + Math.sin(a) * 6 - rnd(9 + i) * 6, r, rgb(base[0] * 0.75, base[1] * 0.75, base[2] * 0.75), rgb(base[0] * 1.35, base[1] * 1.3, base[2] * 1.2));
        }
        blob(ctx, 0, -42, 11, rgb(base[0], base[1], base[2]), rgb(base[0] * 1.5, base[1] * 1.4, base[2] * 1.3));
      } else if (style === 'pine' || style === 'snowpine') {
        ctx.fillStyle = '#4a2f1a'; ctx.fillRect(-2, -14, 4, 14);
        for (let i = 0; i < 4; i++) {
          const y = -12 - i * 11, w = 15 - i * 3;
          ctx.fillStyle = shade([30, 78, 44], 0.85 + i * 0.1);
          ctx.beginPath(); ctx.moveTo(-w, y); ctx.lineTo(w, y); ctx.lineTo(0, y - 18); ctx.closePath(); ctx.fill();
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

export function drawHuman(ctx, x, y, o) {
  const { team, era, sprite, dir, walk, act, busy, carry, cls } = o;
  const tc = TEAM[team] || '#bbb';
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, 0, 6, 2.6, 0, 0, 7); ctx.fill();
  const big = sprite === 'exo' || sprite === 'marine' || sprite === 'templar' ? 1.2 : 1;
  ctx.scale(big, big);
  const step = Math.sin(walk * Math.PI * 2);
  const bob = Math.abs(step) * 0.8;
  // legs
  ctx.strokeStyle = era === 'stone' ? '#8a5a3a' : shade(tc, 0.45); ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-1, -7); ctx.lineTo(-1 + step * 2.5, 0); ctx.moveTo(1, -7); ctx.lineTo(1 - step * 2.5, 0); ctx.stroke();
  // body
  const bodyY = -15 - bob;
  const cloth = cls === 'worker' ? mix(tc, '#b89a6a', 0.45) : tc;
  ctx.fillStyle = era === 'stone' && cls === 'worker' ? '#9a6e44' : cloth;
  ctx.beginPath(); ctx.moveTo(-3.5, bodyY); ctx.lineTo(3.5, bodyY); ctx.lineTo(4, -6 - bob); ctx.lineTo(-4, -6 - bob); ctx.closePath(); ctx.fill();
  if (era === 'medieval' && cls !== 'worker') { ctx.fillStyle = 'rgba(200,205,215,0.55)'; ctx.fillRect(-3.5, bodyY, 7, 4); }
  if (cls !== 'worker' && era === 'stone') { ctx.fillStyle = tc; ctx.fillRect(-3.5, bodyY + 3, 7, 2); }
  // shield
  if (sprite === 'hoplite' || sprite === 'axe' || (sprite === 'sword' && era !== 'medieval') || sprite === 'spear' && era !== 'stone') {
    ctx.fillStyle = sprite === 'hoplite' ? '#c29a3c' : shade(tc, 0.8);
    ctx.beginPath(); ctx.arc(-3.5, bodyY + 5, 4.2, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
  }
  // head
  const hx = 0.5, hy = bodyY - 3.5;
  ctx.fillStyle = SKIN[(o.id || 0) % SKIN.length];
  ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2); ctx.fill();
  headgear(ctx, era, sprite, tc, hx, hy);
  // arm + tool
  const a = busy ? act : 0;
  if (cls === 'worker') {
    ctx.save(); ctx.translate(2.5, bodyY + 2); ctx.rotate(-1.2 + Math.sin(a * Math.PI) * 1.6);
    ctx.strokeStyle = '#6b4424'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -8); ctx.stroke();
    ctx.fillStyle = era === 'stone' ? '#888' : '#aab'; ctx.fillRect(-2, -9, 4, 2);
    ctx.restore();
    if (carry >= 0) { ctx.fillStyle = RES_COLORS[carry]; ctx.beginPath(); ctx.arc(-3, bodyY + 1, 2.6, 0, 7); ctx.fill(); }
  } else {
    weapon(ctx, sprite, era, 2.5, bodyY + 3, a, null);
  }
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
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -9.5, 9, 4.5, 0, 0, 7); ctx.fill();
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
    ctx.save(); ctx.translate(size / 2, size * 0.86); const s = def.class === 'mounted' || def.class === 'siege' || def.class === 'animal' ? 1.15 : 1.6; ctx.scale(s, s);
    const fly = def.flying ? 1.3 * ZH : 0;
    drawUnit(ctx, 0, fly * 0.5, { def, team, era, face: 0.4, walk: 0.15, act: 0.3, busy: false, carry: -1, id: 1, t: 0 });
    ctx.restore();
  } else if (kind === 'building') {
    const b = buildingSprite(type, era, team, def.size, 3);
    const sc = Math.min(size / b.w, size / (b.h * 0.75)) * 1.1;
    ctx.drawImage(b.canvas, (size - b.w * sc) / 2, size - b.h * sc + 6, b.w * sc, b.h * sc);
  } else if (kind === 'resource') {
    const r = resourceSprite(type, themeName, 1);
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
