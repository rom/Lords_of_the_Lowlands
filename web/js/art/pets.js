// Ambient pets and farm animals around settlements: purely cosmetic and
// client-side (never in the game state, never selectable or blocking).
// Everything is deterministic: what lives at a building and where it
// wanders follow from the building id and the clock.
import { TEAM, shade } from '../util.js';

const TAU = Math.PI * 2;
const OL = 'rgba(18,12,8,0.8)';
const SC = new Map();
function sh(c, f) { const k = c + f; let v = SC.get(k); if (v === undefined) { v = shade(c, f); if (SC.size < 600) SC.set(k, v); } return v; }
function hsh(a, b) { let h = Math.imul((a | 0) ^ 0x9e3779b9, 2654435761) ^ Math.imul((b | 0) + 0x7f4a7c15, 2246822519); h = Math.imul(h ^ (h >>> 15), 2246822519); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; }
function circ(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
function ell(ctx, x, y, rx, ry, rot, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fill(); }
function seg(ctx, x0, y0, x1, y1, w, c) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
function shadow(ctx, rx, ry) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0.6, 0, rx, ry, 0, 0, TAU); ctx.fill(); }

const DOG = ['#8a5a30', '#2a2420', '#d8c8a8', '#a87840', '#5a4a3a', '#c89a60'];
const CAT = ['#e09040', '#3a3a3a', '#8a8a8a', '#f0ece0', '#6a5040'];
const HEN = ['#f2ece0', '#a8683a', '#2a2622', '#c88a4a'];

// Which animals live at a building: [{kind, mode, dx, dy, r, period, col, seed}]
// (dx, dy: offset of the home spot from the building centre, in tiles).
export function petsFor(type, size, era, id, o) {
  if (o < 0) return [];
  const fut = era === 'future' || era === 'space', early = era === 'stone' || era === 'bronze' || era === 'iron';
  const modern = era === 'industrial' || era === 'modern';
  const out = [], s2 = size / 2;
  const h = (k) => hsh(id, k);
  // a spot just outside the building on one of its two front faces
  const edge = (k, out = 0.45) => { const a = (h(k) - 0.5) * size * 0.8; return h(k + 1) < 0.5 ? [s2 + out, a] : [a, s2 + out]; };
  const add = (kind, mode, d, r, period, col, k) => out.push({ kind, mode, dx: d[0], dy: d[1], r, period, col, seed: h(k) * 97 });
  switch (type) {
    case 'house': {
      const v = h(1);
      if (fut) { if (v < 0.4) add('robodog', 'wander', edge(2), 1.1, 7, '#dfe6ee', 3); else if (v < 0.65) add('drone', 'hover', edge(2, 0.2), 0.8, 5, '#c8d0da', 3); }
      else if (v < 0.4) add('dog', h(4) < 0.6 ? 'lie' : 'sit', edge(2, 0.35), 0, 1, DOG[(h(5) * DOG.length) | 0], 3);
      else if (v < 0.7 && era !== 'stone') add('cat', h(4) < 0.5 ? 'sit' : 'groom', edge(2, 0.3), 0, 1, CAT[(h(5) * CAT.length) | 0], 3);
      if (!fut && !modern && h(9) < 0.3) for (let i = 0; i < 2; i++) add('hen', 'peck', edge(10 + i * 2, 0.8), 0.6, 3.2, HEN[(h(14 + i) * HEN.length) | 0], 20 + i);
      break;
    }
    case 'farm': {
      if (fut) { add('drone', 'hover', [0, 0], size * 0.35, 6, '#c8d0da', 3); break; }
      const n = 2 + ((h(1) * 3) | 0);
      if (era !== 'stone') for (let i = 0; i < n; i++) add(h(30 + i) < 0.18 && !modern ? 'goose' : 'hen', 'peck', edge(2 + i * 3, 0.25 + h(40 + i) * 0.4), 0.7, 2.6 + h(50 + i), HEN[(h(60 + i) * HEN.length) | 0], 70 + i);
      if (early || era === 'classical' || era === 'medieval') {
        const m = 1 + ((h(80) * 2) | 0), goat = early ? h(81) < 0.5 : h(81) < 0.25;
        for (let i = 0; i < m; i++) add(goat ? 'goat' : 'sheep', 'graze', edge(90 + i * 3, 0.9), 0.9, 9 + h(95 + i) * 4, goat ? (h(97 + i) < 0.5 ? '#8a6a4a' : '#e8e0d0') : '#ece6d8', 100 + i);
      }
      if (h(120) < 0.35) add('dog', 'lie', edge(121, 0.5), 0, 1, DOG[(h(122) * DOG.length) | 0], 123);
      break;
    }
    case 'granary': case 'mill':
      if (fut) { if (h(1) < 0.5) add('robodog', 'wander', edge(2), 1.2, 8, '#dfe6ee', 3); break; }
      if (h(1) < 0.75) for (let i = 0; i < 3; i++) add('hen', 'peck', edge(2 + i * 3, 0.4 + h(30 + i) * 0.4), 0.6, 2.8 + h(40 + i), HEN[(h(50 + i) * HEN.length) | 0], 60 + i);
      if (era !== 'stone' && h(70) < 0.4) add('cat', 'sit', edge(71, 0.3), 0, 1, CAT[(h(72) * CAT.length) | 0], 73);
      break;
    case 'town_center':
      if (fut) { add('robodog', 'wander', edge(2, 0.8), 1.8, 9, '#dfe6ee', 3); add('drone', 'hover', edge(5, 0.3), 1.6, 7, '#c8d0da', 6); break; }
      add('dog', 'wander', edge(2, 0.9), 1.6, 8 + h(3) * 3, DOG[(h(4) * DOG.length) | 0], 5);
      if ((era === 'classical' || era === 'medieval' || era === 'gunpowder') && h(6) < 0.6) for (let i = 0; i < 2; i++) add('goose', 'peck', edge(7 + i * 3, 1), 0.8, 3.4, '#f4f0e6', 20 + i);
      break;
    case 'dock':
      if (!fut && era !== 'stone' && h(1) < 0.55) add('cat', h(2) < 0.5 ? 'sit' : 'groom', edge(3, 0.2), 0, 1, CAT[(h(4) * CAT.length) | 0], 5);
      break;
    case 'barracks': case 'stable':
      if (!fut && h(1) < 0.3) add('dog', 'sit', edge(2, 0.4), 0, 1, DOG[(h(3) * DOG.length) | 0], 4);
      break;
  }
  return out;
}

// position of a pet at time t: wanderers walk between hashed spots around
// their home and pause there; returns [dx, dy, moving, facing(+1/-1), phase]
export function petPos(p, t) {
  if (p.mode === 'lie' || p.mode === 'sit' || p.mode === 'groom') return [0, 0, false, p.seed % 2 < 1 ? 1 : -1, 0];
  const P = p.period, k = t / P + p.seed, n = Math.floor(k), f = k - n;
  const spot = (i) => [(hsh(i, p.seed * 131) - 0.5) * 2 * p.r, (hsh(i + 7, p.seed * 131) - 0.5) * 2 * p.r];
  const a = spot(n - 1), b = spot(n);
  const mf = p.mode === 'graze' ? 0.3 : p.mode === 'hover' ? 0.6 : 0.4;
  const m = Math.min(1, f / mf), e = m * m * (3 - 2 * m);
  const sdx = (b[0] - b[1]) - (a[0] - a[1]);
  return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, f < mf, sdx >= 0 ? 1 : -1, f];
}

// draw at screen (x, y); dir +1 faces right; t: clock; mv: moving
export function drawPet(ctx, p, x, y, dir, mv, t, f, team) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir * 1.25, 1.25);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const s = p.seed;
  switch (p.kind) {
    case 'dog': dog(ctx, p, mv, t, s); break;
    case 'cat': cat(ctx, p, mv, t, s); break;
    case 'hen': hen(ctx, p, mv, t, s, f); break;
    case 'goose': goose(ctx, p, mv, t, s, f); break;
    case 'sheep': case 'goat': grazer(ctx, p, mv, t, s, f); break;
    case 'robodog': robodog(ctx, p, mv, t, s, team); break;
    case 'drone': drone(ctx, p, mv, t, s, team); break;
  }
  ctx.restore();
}

// --- dog: lies by the door, sits, or trots (also used for worker companions)
function dog(ctx, p, mv, t, s) {
  const c = p.col, d = sh(c, 0.65), wag = Math.sin(t * (mv ? 9 : 6) + s) * 1.2;
  shadow(ctx, 5, 1.6);
  if (p.mode === 'lie' && !mv) {
    const br = Math.sin(t * 2 + s) * 0.15;
    ctx.strokeStyle = d; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-4, -1.2); ctx.quadraticCurveTo(-6.4, -1 + wag * 0.4, -6.6, -2.4 + wag * 0.3); ctx.stroke();
    ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(-0.6, -1.5 - br, 4.4, 1.8 + br, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.5; ctx.stroke();
    seg(ctx, 2, -0.5, 5.2, -0.4, 1.1, d); // front paws
    head(ctx, 3.4, -3.2 - br, c, d, Math.sin(t * 0.4 + s) > 0.7 ? 0.5 : 0);
    return;
  }
  const sit = p.mode === 'sit' && !mv;
  const ph = t * 10 + s, a = mv ? Math.sin(ph) * 1.2 : 0, bob = mv ? Math.abs(Math.cos(ph)) * 0.4 : 0;
  const by = -4 - bob;
  ctx.strokeStyle = d; ctx.lineWidth = 0.9;
  if (sit) { ctx.beginPath(); ctx.moveTo(-1.6, -2); ctx.quadraticCurveTo(-4.4, -1.4 + wag * 0.3, -4.6, -0.6); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(-3.6, by - 0.4); ctx.quadraticCurveTo(-5.6, by - 2 + wag * 0.5, -5.4 + wag * 0.4, by - 3); ctx.stroke(); }
  // legs (far pair darker)
  const leg = (x0, y0, sw, col) => { ctx.strokeStyle = col; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + sw, -0.2); ctx.stroke(); };
  if (sit) { leg(2, -3, 0.2, d); leg(2.8, -3, 0.4, c); ell(ctx, -0.8, -1.6, 2.6, 1.6, 0, d); }
  else { leg(-2.6, by + 0.6, -a, d); leg(2.4, by + 0.6, a, d); leg(-2, by + 0.6, a, c); leg(3, by + 0.6, -a, c); }
  ctx.fillStyle = c; ctx.beginPath();
  if (sit) ctx.ellipse(0.6, -3.2, 2.8, 1.9, -0.7, 0, TAU); else ctx.ellipse(0, by, 4, 1.7, 0, 0, TAU);
  ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.5; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.ellipse(-0.4, (sit ? -4 : by - 0.8), 2.4, 0.5, sit ? -0.7 : 0, 0, TAU); ctx.fill();
  head(ctx, sit ? 2.6 : 4, sit ? -6 : by - 1.6, c, d, 0);
}
function head(ctx, x, y, c, d, tilt) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
  ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0, 1.7, 1.4, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.45; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(1.7, 0.5, 1.2, 0.75, 0.15, 0, TAU); ctx.fill();
  circ(ctx, 2.8, 0.4, 0.4, '#141010'); circ(ctx, 0.6, -0.3, 0.32, '#141010');
  ctx.fillStyle = d; ctx.beginPath(); ctx.ellipse(-0.8, 0.2, 0.6, 1.3, 0.3, 0, TAU); ctx.fill(); // floppy ear
  ctx.restore();
}

// --- cat: sits upright with a swishing tail, or grooms
function cat(ctx, p, mv, t, s) {
  const c = p.col, d = sh(c, 0.7), sw = Math.sin(t * 1.6 + s);
  shadow(ctx, 2.6, 1);
  ctx.strokeStyle = c; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-1.2, -0.6); ctx.quadraticCurveTo(-3.6, -0.2, -3.4 + sw * 0.6, -2.4 - Math.abs(sw)); ctx.stroke();
  ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, -1.8, 1.6, 2, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.4; ctx.stroke();
  if (c === '#e09040' || c === '#8a8a8a') { ctx.strokeStyle = d; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(-1, -2.6); ctx.lineTo(0, -2.4); ctx.moveTo(-1.2, -1.6); ctx.lineTo(-0.1, -1.5); ctx.stroke(); } // stripes
  const groom = p.mode === 'groom' && Math.sin(t * 0.5 + s) > -0.2;
  const hx = groom ? 1.2 : 0.6, hy = groom ? -2.6 + Math.abs(Math.sin(t * 5 + s)) * 0.3 : -4.2;
  ctx.fillStyle = c; ctx.beginPath(); ctx.arc(hx, hy, 1.15, 0, TAU); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.4; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(hx - 0.9, hy - 0.5); ctx.lineTo(hx - 0.7, hy - 1.7); ctx.lineTo(hx - 0.1, hy - 0.9); ctx.moveTo(hx + 0.2, hy - 0.9); ctx.lineTo(hx + 0.7, hy - 1.7); ctx.lineTo(hx + 0.9, hy - 0.5); ctx.fill();
  if (!groom) { circ(ctx, hx + 0.6, hy - 0.1, 0.25, '#7a9a2a'); circ(ctx, hx - 0.2, hy - 0.1, 0.25, '#7a9a2a'); }
  ctx.fillStyle = d; ctx.fillRect(0.4, -0.8, 0.5, 0.8); ctx.fillRect(1, -0.8, 0.5, 0.8); // front paws
}

// --- hen / goose: pecking, scratching, short runs
function hen(ctx, p, mv, t, s, f) {
  const c = p.col, peck = !mv && Math.sin(t * 5 + s * 3) > 0.3;
  const lg = mv ? Math.sin(t * 22 + s) * 0.6 : 0;
  shadow(ctx, 1.8, 0.7);
  seg(ctx, -0.2, -1.2, -0.2 - lg, 0, 0.35, '#d8a030'); seg(ctx, 0.4, -1.2, 0.4 + lg, 0, 0.35, '#d8a030');
  ctx.fillStyle = sh(c, 0.75); ctx.beginPath(); ctx.moveTo(-1.4, -2.2); ctx.lineTo(-2.6, -3.8); ctx.lineTo(-2.2, -2); ctx.fill(); // tail
  ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, -2, 1.7, 1.2, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.35; ctx.stroke();
  ctx.fillStyle = sh(c, 0.8); ctx.beginPath(); ctx.ellipse(-0.3, -2, 0.9, 0.55, 0.2, 0, TAU); ctx.fill(); // wing
  const hx = peck ? 1.9 : 1.3, hy = peck ? -1 : -3.4;
  circ(ctx, hx, hy, 0.75, c); circ(ctx, hx - 0.1, hy - 0.8, 0.4, '#d8302a'); // comb
  ctx.fillStyle = '#e8b030'; ctx.beginPath(); ctx.moveTo(hx + 0.6, hy - 0.2); ctx.lineTo(hx + 1.3, hy + 0.1); ctx.lineTo(hx + 0.6, hy + 0.3); ctx.fill();
  circ(ctx, hx + 0.25, hy - 0.15, 0.17, '#111');
  void f;
}
function goose(ctx, p, mv, t, s) {
  const peck = !mv && Math.sin(t * 3 + s * 3) > 0.4, lg = mv ? Math.sin(t * 16 + s) * 0.6 : 0;
  shadow(ctx, 2.4, 0.9);
  seg(ctx, 0, -1.2, -lg, 0, 0.45, '#e8902a'); seg(ctx, 0.6, -1.2, 0.6 + lg, 0, 0.45, '#e8902a');
  ctx.fillStyle = p.col; ctx.beginPath(); ctx.ellipse(-0.2, -2.2, 2.4, 1.4, -0.1, 0, TAU); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.35; ctx.stroke();
  ctx.fillStyle = '#c8c4b8'; ctx.beginPath(); ctx.ellipse(-0.6, -2.3, 1.3, 0.6, 0.1, 0, TAU); ctx.fill();
  const hx = peck ? 3 : 2.2, hy = peck ? -1 : -5.2;
  ctx.strokeStyle = p.col; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(1.6, -2.6); ctx.quadraticCurveTo(peck ? 2.8 : 1.8, peck ? -2.4 : -4, hx, hy); ctx.stroke();
  circ(ctx, hx, hy, 0.7, p.col);
  ctx.fillStyle = '#e8902a'; ctx.beginPath(); ctx.moveTo(hx + 0.5, hy - 0.2); ctx.lineTo(hx + 1.6, hy + 0.1); ctx.lineTo(hx + 0.5, hy + 0.35); ctx.fill();
  circ(ctx, hx + 0.15, hy - 0.2, 0.17, '#111');
}

// --- sheep / goat: graze with a nodding head, wander slowly
function grazer(ctx, p, mv, t, s) {
  const sheep = p.kind === 'sheep', c = p.col;
  const ph = t * 8 + s, a = mv ? Math.sin(ph) * 0.9 : 0;
  const graze = !mv && Math.sin(t * 0.6 + s) > -0.4, chew = graze ? Math.abs(Math.sin(t * 4 + s)) * 0.3 : 0;
  shadow(ctx, 4, 1.4);
  const lc = sheep ? '#2a2420' : sh(c, 0.6);
  const leg = (x0, sw, col) => { ctx.strokeStyle = col; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x0, -3); ctx.lineTo(x0 + sw, 0); ctx.stroke(); };
  leg(-2.2, -a, sh(lc, 0.7)); leg(2, a, sh(lc, 0.7)); leg(-1.6, a, lc); leg(2.6, -a, lc);
  if (sheep) { // woolly cloud
    ctx.fillStyle = sh(c, 0.82); ctx.beginPath(); for (const [x, y, r] of [[-2.4, -4.4, 1.7], [0, -5, 1.9], [2.2, -4.4, 1.7], [-1.2, -3.4, 1.6], [1.2, -3.4, 1.6]]) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); } ctx.fill();
    ctx.fillStyle = c; ctx.beginPath(); for (const [x, y, r] of [[-2.2, -4.8, 1.4], [0, -5.4, 1.6], [2, -4.8, 1.4]]) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); } ctx.fill();
  } else {
    ctx.strokeStyle = sh(c, 0.7); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-3.2, -4.4); ctx.lineTo(-4, -5.6 + Math.sin(t * 7 + s) * 0.4); ctx.stroke();
    ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, -4.2, 3.4, 1.7, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.45; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-2.4, -5.6, 4, 0.6);
  }
  const hx = graze ? 4 : 3.6, hy = graze ? -1.4 + chew : -5.8;
  ctx.strokeStyle = sheep ? '#3a3230' : c; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(2.6, -4.6); ctx.lineTo(hx - 0.4, hy); ctx.stroke();
  ctx.fillStyle = sheep ? '#3a3230' : c; ctx.beginPath(); ctx.ellipse(hx + 0.4, hy + 0.2, 1.3, 0.8, graze ? 1 : 0.4, 0, TAU); ctx.fill();
  ctx.fillStyle = sheep ? '#2a2420' : sh(c, 0.7); ctx.beginPath(); ctx.ellipse(hx - 0.6, hy - 0.2, 0.5, 0.25, -0.4, 0, TAU); ctx.fill(); // ear
  if (!sheep) { ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(hx - 0.2, hy - 0.5); ctx.quadraticCurveTo(hx - 1.2, hy - 2, hx - 2, hy - 1.4); ctx.stroke(); seg(ctx, hx + 0.8, hy + 0.8, hx + 0.6, hy + 1.6, 0.5, sh(c, 0.6)); } // horns, beard
  circ(ctx, hx + 0.3, hy - 0.2, 0.18, '#111');
}

// --- future: a robot dog and a hovering drone
function robodog(ctx, p, mv, t, s, team) {
  const ph = t * 12 + s, a = mv ? Math.sin(ph) * 0.9 : 0, c = p.col;
  shadow(ctx, 4.4, 1.4);
  const leg = (x0, sw, col) => { ctx.strokeStyle = col; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x0, -3.4); ctx.lineTo(x0 + 0.6 + sw, -1.6); ctx.lineTo(x0 + sw, 0); ctx.stroke(); };
  leg(-2.4, -a, '#5a6470'); leg(2.2, a, '#5a6470'); leg(-1.8, a, '#7a8490'); leg(2.8, -a, '#7a8490');
  ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-3.6, -5); ctx.lineTo(3, -5.2); ctx.lineTo(3.6, -3.4); ctx.lineTo(-3.4, -3.2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.45; ctx.stroke();
  ctx.fillStyle = TEAM[team] || '#888'; ctx.fillRect(-1.6, -4.9, 2, 0.6);
  ctx.fillStyle = '#4a5260'; ctx.fillRect(3, -6.8, 2.4, 1.8);
  const blink = ((t * 1.3 + s) % 3) < 0.15;
  ctx.fillStyle = blink ? '#1a2a30' : '#5ae8ff'; ctx.fillRect(4.4, -6.4, 0.9, 0.6);
  seg(ctx, 3.4, -6.8, 3, -8, 0.3, '#5a6470');
}
function drone(ctx, p, mv, t, s, team) {
  const alt = 9 + Math.sin(t * 2.2 + s) * 0.8;
  ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.beginPath(); ctx.ellipse(1.2, 0, 2.6, 0.9, 0, 0, TAU); ctx.fill();
  ctx.translate(0, -alt); ctx.rotate(mv ? 0.12 : Math.sin(t * 1.3 + s) * 0.04);
  for (const x of [-2.6, 2.6]) { ctx.fillStyle = 'rgba(210,220,230,0.35)'; ctx.beginPath(); ctx.ellipse(x, -0.8, 1.8, 0.45, 0, 0, TAU); ctx.fill(); seg(ctx, x, -0.6, x, 0, 0.35, '#5a6470'); }
  seg(ctx, -2.6, 0, 2.6, 0, 0.6, '#5a6470');
  ctx.fillStyle = p.col; ctx.beginPath(); ctx.ellipse(0, 0.2, 1.6, 0.9, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.35; ctx.stroke();
  circ(ctx, 0.9, 0.5, 0.35, ((t * 2 + s) % 1) < 0.5 ? '#ff4a3a' : (TEAM[team] || '#5ae8ff'));
}
