// Live-drawn unit figures: people (per era kit, gait, attack and gather
// poses, carried loads), animals and horses, vehicles, siege engines and
// aircraft. Drawn every frame, so everything here is plain paths with a
// small colour cache; light comes from the upper left like the buildings.
import { TEAM, ZH, hexToRgb, shade, hash2 } from '../util.js';
import { P, face } from './kit.js';

const SC = new Map();
// memoised shade(): units call it a lot every frame
export function sh(c, f) {
  const k = c + f;
  let v = SC.get(k);
  if (v === undefined) { v = shade(c, f); if (SC.size < 6000) SC.set(k, v); }
  return v;
}
const OL = 'rgba(18,12,8,0.82)';
// gradients in local coordinates, cached by key (applied after a translate)
const GC = new Map();
function grad(ctx, key, make) { let g = GC.get(key); if (!g) { g = make(); if (GC.size > 500) GC.clear(); GC.set(key, g); } return g; }
function fillAt(ctx, x, y, g) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = g; ctx.fill(); ctx.restore(); }
const SKIN = ['#e6bc94', '#c68e62', '#8d5a3a', '#f3cfa8', '#b07850', '#6a4228', '#d8a87c'];
const HAIR = ['#3a2416', '#6a4424', '#1a1410', '#a87a3a', '#5a3018', '#7a7470', '#c89a58'];
export const RESC = ['#d9603b', '#8b5a2b', '#9aa0a6', '#f2c230', '#43d2ff'];
const ARMOR = { stone: '#7a5a3a', bronze: '#b8904a', iron: '#6e7278', classical: '#c8a048', medieval: '#a0a6ae', gunpowder: null, industrial: null, modern: '#5c6a46', future: '#dfe6ee', space: '#8a96a8' };
const TAU = Math.PI * 2;

function seg(ctx, x0, y0, x1, y1, w, col) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
function limb(ctx, a, b, c, w, col) { // two-segment limb with outline
  ctx.strokeStyle = OL; ctx.lineWidth = w + 1.3; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
}
function circ(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
function ell(ctx, x, y, rx, ry, rot, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fill(); }

// soft contact shadow (ambient occlusion blob + light-direction offset)
// (soft outer penumbra via a cached radial gradient, darker core under the feet)
export function contactShadow(ctx, x, y, rx, ry, a = 0.32) {
  const g = grad(ctx, 'cs' + a, () => { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, `rgba(0,0,0,${a * 1.25})`); g.addColorStop(0.55, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); return g; });
  ctx.save(); ctx.translate(x + rx * 0.15, y); ctx.scale(rx * 1.15, ry * 1.15); ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
}

// ----------------------------------------------------------------- people
function melee(sprite) { return sprite === 'club' || sprite === 'axe' || sprite === 'sword' || sprite === 'greatsword' || sprite === 'templar' || sprite === 'sabre'; }
function polearm(sprite) { return sprite === 'spear' || sprite === 'hoplite' || sprite === 'pike' || sprite === 'lance'; }
function bowish(sprite) { return sprite === 'bow' || sprite === 'longbow'; }
const GUNS = new Set(['musket', 'bayonet', 'rifle', 'smg', 'mg', 'grenadier', 'bazooka', 'railgun', 'plasma', 'exo', 'marine']);
function gun(sprite) { return GUNS.has(sprite); }

// per-person look from the unit id: skin, hair colour and style, beard,
// garment and hat variant (stable for the unit's lifetime)
const LOOKS = new Map();
function looks(id) {
  let v = LOOKS.get(id);
  if (v) return v;
  const h = Math.imul((id | 0) + 7, 2654435761) >>> 0, h2 = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  v = { skin: SKIN[h % SKIN.length], hair: HAIR[(h >>> 4) % HAIR.length], style: (h >>> 8) % 5, beard: (h2 >>> 3) % 4, garb: (h2 >>> 7) % 6, hat: (h2 >>> 11) % 4 };
  if (LOOKS.size > 5000) LOOKS.clear();
  LOOKS.set(id, v);
  return v;
}

// melee / chopping pose over the attack cycle: [arm rotation, weapon angle]
// (arm 0 = hanging down, + = back/up; weapon 0 = upright, + = forward)
const POSE_M = [[0, -0.5, 0.3], [0.45, 2.5, -1.0], [0.6, -1.3, 1.9], [1, -0.5, 0.3]];
const POSE_W = [[0, -0.6, 0.2], [0.45, 2.1, -0.7], [0.6, -1.0, 1.7], [1, -0.6, 0.2]];
// harvesting food: low sweeping sickle cut / picking
const POSE_H = [[0, -0.1, 0.9], [0.5, 1.0, -0.1], [0.68, 0.0, 1.2], [1, -0.1, 0.9]];
// mining: high overhead pick swing
const POSE_X = [[0, -0.7, 0.3], [0.45, 2.6, -1.0], [0.58, -1.25, 1.95], [1, -0.7, 0.3]];
function pose(a, K) {
  for (let i = 1; i < K.length; i++) if (a <= K[i][0]) {
    let k = (a - K[i - 1][0]) / (K[i][0] - K[i - 1][0]);
    k = i === 2 ? k * k : k * k * (3 - 2 * k); // strike accelerates
    return [K[i - 1][1] + (K[i][1] - K[i - 1][1]) * k, K[i - 1][2] + (K[i][2] - K[i - 1][2]) * k];
  }
  return [K[0][1], K[0][2]];
}

// additive soft glow (energy weapons, embers); cached unit gradient
function glow(ctx, x, y, r, c, a = 1) {
  const g = grad(ctx, 'gl' + c, () => { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.28, `rgba(${c},0.8)`); g.addColorStop(1, `rgba(${c},0)`); return g; });
  ctx.save(); ctx.globalAlpha *= a; ctx.globalCompositeOperation = 'lighter'; ctx.translate(x, y); ctx.scale(r, r); ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
}
// metal sheen: short bright stroke
function sheen(ctx, x0, y0, x1, y1, w = 0.45, a = 0.7) { seg(ctx, x0, y0, x1, y1, w, `rgba(255,255,255,${a})`); }
// helmet dome with light from the upper left
function dome(ctx, hx, hy, r, col, ry = r) {
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(hx, hy, r, ry, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = OL; ctx.lineWidth = 0.55; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.beginPath(); ctx.ellipse(hx - r * 0.3, hy - ry * 0.55, r * 0.38, ry * 0.22, -0.35, 0, TAU); ctx.fill();
}

// helmets and hats of soldiers (workers: workerHat)
function headgear(ctx, era, sprite, uid, tc, hx, hy, skin, lo, t) {
  switch (era) {
    case 'stone':
      if (sprite === 'club' || sprite === 'spear') { // fur hood with a bone pin
        ctx.fillStyle = '#6a4a2a'; ctx.beginPath(); ctx.arc(hx - 0.3, hy - 0.6, 3.5, Math.PI * 0.85, Math.PI * 2.1); ctx.fill();
        ctx.strokeStyle = 'rgba(40,24,10,0.6)'; ctx.lineWidth = 0.4; ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(hx - 3 + i * 1.6, hy - 3.6 + Math.abs(i - 1.5) * 0.5); ctx.lineTo(hx - 3.4 + i * 1.6, hy - 2.4); } ctx.stroke();
        ctx.fillStyle = '#8a6a44'; ctx.fillRect(hx - 3.4, hy - 1.6, 1.4, 4.5);
        seg(ctx, hx - 1.5, hy - 4.2, hx + 1.4, hy - 3.6, 0.6, '#ece0c4');
      } else { // headband in team colour with a feather
        ctx.strokeStyle = tc; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(hx - 0.2, hy - 0.4, 3.05, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
        ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(hx - 2.5, hy - 2.6); ctx.quadraticCurveTo(hx - 4.4, hy - 5, hx - 3.4, hy - 7); ctx.stroke();
        seg(ctx, hx - 2.8, hy - 3.4, hx - 3.4, hy - 6.4, 0.3, '#8a6a44');
      }
      break;
    case 'bronze': case 'iron': {
      if (sprite === 'bow') { // archers: linen cap or leather cap with a team band
        if (era === 'bronze') { ctx.fillStyle = '#e8e0cc'; ctx.beginPath(); ctx.arc(hx - 0.3, hy - 0.8, 3.3, Math.PI, 0); ctx.fill(); ctx.fillRect(hx - 3.6, hy - 1, 1.6, 4.2); seg(ctx, hx - 3.4, hy - 1, hx + 3, hy - 1, 0.8, tc); }
        else { dome(ctx, hx, hy - 0.6, 3.4, '#6a4a2c'); seg(ctx, hx - 3.4, hy - 0.8, hx + 3.4, hy - 0.8, 0.9, tc); }
        break;
      }
      const met = era === 'bronze' ? '#c0943e' : '#8a9098';
      dome(ctx, hx, hy - 0.5, 3.7, met, 3.9);
      ctx.fillStyle = met; ctx.fillRect(hx - 3.6, hy - 0.8, 1.6, 3.4); // cheek guard
      ctx.fillStyle = sh(met, 0.7); ctx.fillRect(hx - 3.7, hy - 0.9, 7.4, 0.7); // brow band
      if (era === 'bronze') { // horsehair crest in team colour
        ctx.fillStyle = tc; ctx.beginPath(); ctx.moveTo(hx - 3.4, hy - 3.4); ctx.quadraticCurveTo(hx - 0.4, hy - 8.4, hx + 3, hy - 3.6); ctx.lineTo(hx, hy - 4.6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = OL; ctx.lineWidth = 0.4; ctx.stroke();
      } else { ctx.fillStyle = '#5a5e64'; ctx.fillRect(hx - 0.6, hy - 6.2, 1.2, 2.5); circ(ctx, hx, hy - 6.4, 0.9, '#7a7e86'); }
      break;
    }
    case 'classical': {
      if (sprite === 'bow') { // Phrygian cap in team colour
        ctx.fillStyle = tc; ctx.beginPath(); ctx.moveTo(hx - 3.4, hy); ctx.quadraticCurveTo(hx - 3.6, hy - 4.6, hx + 0.4, hy - 4.4); ctx.quadraticCurveTo(hx + 3.4, hy - 4.8, hx + 2.4, hy - 2.2); ctx.lineTo(hx + 3.2, hy - 0.6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = OL; ctx.lineWidth = 0.5; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(hx - 2.6, hy - 3.6, 1.2, 2.6);
        break;
      }
      if (sprite === 'lance') { // conical helm with mail aventail
        ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.moveTo(hx - 3.6, hy - 0.4); ctx.lineTo(hx, hy - 6); ctx.lineTo(hx + 3.6, hy - 0.4); ctx.closePath(); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.5; ctx.stroke();
        ctx.fillStyle = '#7a8088'; ctx.fillRect(hx - 3.6, hy - 0.4, 2.6, 3.8); sheen(ctx, hx - 1.4, hy - 3.8, hx - 0.6, hy - 5.2);
        break;
      }
      // Corinthian helmet with a team-coloured transverse crest
      dome(ctx, hx, hy - 0.5, 3.8, '#c29a3c', 4);
      ctx.fillStyle = '#c29a3c'; ctx.fillRect(hx - 3.8, hy - 0.8, 2, 3.8); ctx.fillRect(hx + 1.6, hy - 0.8, 1.2, 1.6); ctx.fillRect(hx + 1.2, hy + 1.2, 1.4, 1.6);
      ctx.fillStyle = '#1a120a'; ctx.fillRect(hx + 1.4, hy - 0.4, 1.6, 0.6); // eye slit
      ctx.fillStyle = tc; ctx.beginPath(); ctx.moveTo(hx - 4.4, hy - 2.6); ctx.quadraticCurveTo(hx - 1, hy - 9, hx + 3.4, hy - 3.6); ctx.quadraticCurveTo(hx, hy - 5.6, hx - 4.4, hy - 2.6); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.45; ctx.beginPath(); ctx.moveTo(hx - 3, hy - 4); ctx.quadraticCurveTo(hx - 0.5, hy - 7.8, hx + 2.4, hy - 4.2); ctx.stroke();
      ctx.strokeStyle = OL; ctx.lineWidth = 0.35; ctx.beginPath(); for (let i = 0; i < 5; i++) { const k = i / 4; ctx.moveTo(hx - 3.8 + k * 6.6, hy - 3 - Math.sin(k * Math.PI) * 4.6); ctx.lineTo(hx - 3.2 + k * 6, hy - 3.8 - Math.sin(k * Math.PI) * 2.2); } ctx.stroke();
      break;
    }
    case 'medieval': {
      if (sprite === 'greatsword' || sprite === 'templar' || sprite === 'lance') { // great helm with a crest plume
        ctx.fillStyle = '#a8aeb6'; ctx.beginPath(); ctx.moveTo(hx - 3.7, hy + 2.9); ctx.lineTo(hx - 3.7, hy - 2); ctx.quadraticCurveTo(hx, hy - 5.3, hx + 3.7, hy - 2); ctx.lineTo(hx + 3.7, hy + 2.9); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = OL; ctx.lineWidth = 0.55; ctx.stroke();
        ctx.fillStyle = '#d8dde4'; ctx.fillRect(hx - 3, hy - 2.4, 1.6, 5);
        ctx.fillStyle = '#1a1a1e'; ctx.fillRect(hx + 0.3, hy - 0.9, 3.4, 0.9); // vision slit
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; for (let i = 0; i < 3; i++) ctx.fillRect(hx + 1.6 + i * 0.7, hy + 1, 0.35, 0.35); // breaths
        seg(ctx, hx + 2, hy - 3.4, hx + 2, hy + 2.8, 0.5, '#c8a048'); // brass cross
        ctx.fillStyle = tc; ctx.beginPath(); ctx.moveTo(hx - 0.6, hy - 4.4); ctx.quadraticCurveTo(hx - 3.8, hy - 8.4 + Math.sin(t * 3) * 0.3, hx - 5.2, hy - 5.4); ctx.quadraticCurveTo(hx - 2.6, hy - 6, hx + 0.8, hy - 4.2); ctx.fill();
      } else if (sprite === 'crossbow') { // kettle hat
        dome(ctx, hx, hy - 1, 3.2, '#9aa0a8', 3.4);
        ctx.fillStyle = '#868c94'; ctx.beginPath(); ctx.ellipse(hx, hy - 1.1, 5, 1.2, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.45; ctx.stroke();
        sheen(ctx, hx - 4, hy - 1.5, hx - 1, hy - 1.9, 0.4, 0.6);
      } else if (sprite === 'longbow') { // hood with liripipe
        const hc = '#5a6a3a';
        ctx.strokeStyle = hc; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx - 3, hy - 2); ctx.quadraticCurveTo(hx - 6, hy - 1, hx - 6, hy + 3); ctx.stroke();
        hood(ctx, hx, hy, hc);
        seg(ctx, hx - 3.4, hy + 3.2, hx + 0.4, hy + 3.4, 0.8, tc);
      } else { // nasal helm over a mail coif
        ctx.fillStyle = '#80868e'; ctx.fillRect(hx - 3.7, hy - 0.4, 2.6, 3.8);
        ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.moveTo(hx - 3.7, hy); ctx.quadraticCurveTo(hx - 3.1, hy - 5.6, hx + 0.2, hy - 5.7); ctx.quadraticCurveTo(hx + 3.7, hy - 4.1, hx + 3.7, hy); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = OL; ctx.lineWidth = 0.5; ctx.stroke();
        ctx.fillStyle = '#d8dde4'; ctx.fillRect(hx - 2.6, hy - 4, 1.3, 3);
        ctx.fillStyle = '#7a8088'; ctx.fillRect(hx + 1.6, hy - 0.6, 0.9, 2.6); // nasal
        if (!lo) { ctx.fillStyle = 'rgba(255,255,255,0.2)'; for (let i = 0; i < 3; i++) ctx.fillRect(hx - 3.5, hy + 0.4 + i * 1.1, 2.2, 0.35); }
      }
      break;
    }
    case 'gunpowder': {
      if (sprite === 'pike' || uid === 'arquebusier' || sprite === 'sabre') { // morion / pot helmet
        ctx.fillStyle = '#a4aab2'; ctx.beginPath(); ctx.moveTo(hx - 5, hy - 0.6); ctx.quadraticCurveTo(hx - 2.6, hy - 1.6, hx - 2.8, hy - 3); ctx.quadraticCurveTo(hx, hy - 6.2, hx + 2.8, hy - 3); ctx.quadraticCurveTo(hx + 2.6, hy - 1.6, hx + 5, hy - 0.6); ctx.quadraticCurveTo(hx, hy - 2.2, hx - 5, hy - 0.6); ctx.fill();
        ctx.strokeStyle = OL; ctx.lineWidth = 0.5; ctx.stroke();
        if (sprite !== 'sabre') { ctx.fillStyle = '#8a9098'; ctx.beginPath(); ctx.moveTo(hx - 2.2, hy - 3.6); ctx.quadraticCurveTo(hx, hy - 7.2, hx + 2.2, hy - 3.6); ctx.fill(); } // comb
        else { ctx.fillStyle = '#8a9098'; ctx.fillRect(hx - 3.6, hy - 2, 1.4, 4.4); for (let i = 0; i < 3; i++) seg(ctx, hx + 1.4, hy - 2 + i * 0.4, hx + 1.4, hy + 2, 0.3, '#5a6068'); }
        sheen(ctx, hx - 1.6, hy - 3.6, hx - 0.4, hy - 4.6);
        if (uid === 'arquebusier') { ctx.fillStyle = tc; ctx.beginPath(); ctx.moveTo(hx - 1.6, hy - 4); ctx.quadraticCurveTo(hx - 5.6, hy - 7 + Math.sin(t * 2.4) * 0.4, hx - 6.4, hy - 3.6); ctx.quadraticCurveTo(hx - 4, hy - 4.8, hx - 1.2, hy - 3.2); ctx.fill(); }
      } else if (sprite === 'grenadier') { // mitre cap in team colour with a brass plate
        ctx.fillStyle = tc; ctx.beginPath(); ctx.moveTo(hx - 3.2, hy - 1.4); ctx.lineTo(hx - 1.6, hy - 8.4); ctx.quadraticCurveTo(hx + 0.6, hy - 8.6, hx + 0.8, hy - 7.6); ctx.lineTo(hx + 3.2, hy - 1.4); ctx.closePath(); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.5; ctx.stroke();
        ctx.fillStyle = '#d8b04a'; ctx.beginPath(); ctx.moveTo(hx - 0.2, hy - 1.6); ctx.lineTo(hx + 0.4, hy - 6.6); ctx.lineTo(hx + 2.8, hy - 1.6); ctx.closePath(); ctx.fill();
        circ(ctx, hx - 1.3, hy - 8.2, 0.8, '#f0e8d8');
        ctx.fillStyle = '#f0ece0'; ctx.fillRect(hx - 3.2, hy - 2, 6.4, 0.7);
      } else { // tricorne with lace trim and cockade
        ctx.fillStyle = '#222'; ctx.beginPath(); ctx.moveTo(hx - 5, hy - 2.4); ctx.quadraticCurveTo(hx, hy - 0.6, hx + 5, hy - 2.4); ctx.lineTo(hx + 3, hy - 5.6); ctx.quadraticCurveTo(hx, hy - 7.2, hx - 3, hy - 5.6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#e8d8a0'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(hx - 5, hy - 2.4); ctx.quadraticCurveTo(hx, hy - 0.6, hx + 5, hy - 2.4); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.moveTo(hx - 3, hy - 5.4); ctx.quadraticCurveTo(hx, hy - 6.8, hx + 2.4, hy - 5.4); ctx.lineTo(hx + 1.6, hy - 4.6); ctx.quadraticCurveTo(hx, hy - 5.6, hx - 2.4, hy - 4.6); ctx.fill();
        circ(ctx, hx + 1.5, hy - 3.4, 1, tc); circ(ctx, hx + 1.5, hy - 3.4, 0.4, '#f0ece0');
      }
      break;
    }
    case 'industrial': {
      if (sprite === 'bayonet') { // spiked leather helmet
        dome(ctx, hx, hy - 0.8, 3.5, '#2a2622', 3.6);
        ctx.fillStyle = '#2a2622'; ctx.beginPath(); ctx.moveTo(hx + 1.6, hy - 1); ctx.lineTo(hx + 4.6, hy - 0.6); ctx.lineTo(hx + 1.6, hy - 0.2); ctx.fill();
        ctx.fillStyle = '#d0a848'; ctx.beginPath(); ctx.moveTo(hx - 0.8, hy - 4.2); ctx.lineTo(hx, hy - 7.4); ctx.lineTo(hx + 0.8, hy - 4.2); ctx.closePath(); ctx.fill(); circ(ctx, hx + 0.6, hy - 2.4, 0.9, tc);
      } else if (sprite === 'smg') { // coal-scuttle steel helmet
        ctx.fillStyle = '#5c6458'; ctx.beginPath(); ctx.moveTo(hx - 4.4, hy + 1.6); ctx.lineTo(hx - 3.6, hy - 1); ctx.quadraticCurveTo(hx - 3, hy - 5, hx + 0.4, hy - 5); ctx.quadraticCurveTo(hx + 3.8, hy - 4.6, hx + 3.6, hy - 0.8); ctx.lineTo(hx + 4.6, hy - 0.4); ctx.lineTo(hx + 3.4, hy + 0.2); ctx.lineTo(hx - 2.4, hy - 0.2); ctx.lineTo(hx - 3, hy + 1.6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = OL; ctx.lineWidth = 0.5; ctx.stroke(); sheen(ctx, hx - 2, hy - 3.6, hx - 0.4, hy - 4.4, 0.5, 0.35); circ(ctx, hx - 1.4, hy - 1.6, 0.6, '#3a4038');
        ctx.fillStyle = tc; ctx.fillRect(hx - 2.8, hy - 2.6, 1.2, 1.2);
      } else if (sprite === 'mg') { // wide-brimmed steel helmet
        ctx.fillStyle = '#6a6a4a'; ctx.beginPath(); ctx.ellipse(hx, hy - 1.2, 5.2, 1.4, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.45; ctx.stroke();
        dome(ctx, hx, hy - 1.4, 3, '#727252', 3.2); ctx.fillStyle = tc; ctx.fillRect(hx - 1, hy - 2.8, 2, 0.8);
      } else if (sprite === 'lance') { // lancer's square-topped cap
        ctx.fillStyle = '#2a2420'; ctx.fillRect(hx - 2.6, hy - 3.6, 5.2, 1.8);
        ctx.fillStyle = tc; ctx.beginPath(); ctx.moveTo(hx - 2.4, hy - 3.6); ctx.lineTo(hx - 3.8, hy - 7); ctx.lineTo(hx + 3.8, hy - 7); ctx.lineTo(hx + 2.4, hy - 3.6); ctx.closePath(); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.45; ctx.stroke();
        ctx.fillStyle = '#e8d8a0'; ctx.fillRect(hx - 3.8, hy - 7.4, 7.6, 0.6); ctx.fillStyle = '#1a1612'; ctx.beginPath(); ctx.moveTo(hx + 1, hy - 1.9); ctx.lineTo(hx + 4.8, hy - 1.4); ctx.lineTo(hx + 1, hy - 1); ctx.fill();
        circ(ctx, hx - 2.6, hy - 8.2, 0.9, '#f0ece0');
      } else { // peaked kepi
        ctx.fillStyle = '#3e4a3a'; ctx.beginPath(); ctx.moveTo(hx - 3.2, hy - 1.6); ctx.lineTo(hx - 2.8, hy - 5.6); ctx.lineTo(hx + 2.6, hy - 5); ctx.lineTo(hx + 3, hy - 1.6); ctx.closePath(); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.45; ctx.stroke();
        ctx.fillStyle = '#1e241c'; ctx.beginPath(); ctx.moveTo(hx + 1, hy - 1.8); ctx.lineTo(hx + 5, hy - 1.2); ctx.lineTo(hx + 1, hy - 0.9); ctx.fill();
        ctx.fillStyle = tc; ctx.fillRect(hx - 3, hy - 2.6, 6, 0.9); circ(ctx, hx + 1.2, hy - 3.6, 0.5, '#d8b04a');
      }
      break;
    }
    case 'modern': {
      if (uid === 'special_forces') { // balaclava, goggles and a team beret
        ctx.fillStyle = '#26282a'; ctx.beginPath(); ctx.arc(hx, hy, 3.1, 0, TAU); ctx.fill();
        ctx.fillStyle = skin; ctx.fillRect(hx + 0.6, hy - 1.2, 2.5, 1.5);
        ctx.fillStyle = '#111'; ctx.fillRect(hx + 0.9, hy - 1.1, 2.4, 1.1); ctx.fillStyle = '#5ad0ff'; ctx.fillRect(hx + 2, hy - 1, 0.9, 0.4);
        ctx.fillStyle = tc; ctx.beginPath(); ctx.ellipse(hx - 0.6, hy - 2.6, 3.6, 1.5, -0.15, 0, TAU); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.4; ctx.stroke();
        circ(ctx, hx - 2.4, hy - 2.6, 0.5, '#d8b04a');
        break;
      }
      // combat helmet with net cover, goggles and chin strap
      ctx.fillStyle = '#4c5a3a'; ctx.beginPath(); ctx.ellipse(hx, hy - 1, 4.1, 3.6, 0, Math.PI, 0); ctx.fill(); ctx.fillRect(hx - 4.3, hy - 1.4, 8.6, 1);
      ctx.strokeStyle = OL; ctx.lineWidth = 0.45; ctx.beginPath(); ctx.ellipse(hx, hy - 1, 4.1, 3.6, 0, Math.PI, 0); ctx.stroke();
      if (!lo) { ctx.strokeStyle = 'rgba(20,28,14,0.6)'; ctx.lineWidth = 0.4; ctx.beginPath(); for (let i = -3; i <= 3; i += 1.5) { ctx.moveTo(hx + i, hy - 1); ctx.lineTo(hx + i + 1.5, hy - 4.2); ctx.moveTo(hx + i + 1.5, hy - 1); ctx.lineTo(hx + i, hy - 4.2); } ctx.stroke(); }
      ctx.fillStyle = '#2a2a24'; ctx.fillRect(hx - 3.8, hy - 2.6, 7, 0.9); ctx.fillStyle = '#7aa0b0'; ctx.fillRect(hx + 1.4, hy - 2.5, 1.6, 0.7);
      seg(ctx, hx + 2, hy - 0.6, hx + 1.2, hy + 2.6, 0.5, '#2a2a1e');
      ctx.fillStyle = tc; ctx.fillRect(hx - 3.2, hy - 3.6, 1.4, 1.1);
      break;
    }
    case 'future': case 'space': {
      const g = grad(ctx, 'helm' + era, () => { const g = ctx.createRadialGradient(-1.2, -1.6, 0.4, 0, 0, 4.4); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, era === 'space' ? '#b8c2d0' : '#d6dde6'); g.addColorStop(1, era === 'space' ? '#56606e' : '#8a96a4'); return g; });
      ctx.beginPath(); ctx.arc(hx, hy, 4.2, 0, TAU); fillAt(ctx, hx, hy, g);
      ctx.strokeStyle = OL; ctx.lineWidth = 0.5; ctx.stroke();
      const vc = sprite === 'templar' ? '#7cf1ff' : era === 'space' ? '#ffb84a' : '#39d4ff';
      if (sprite === 'templar') { // hooded helm with a glowing slit
        ctx.fillStyle = '#3a3048'; ctx.beginPath(); ctx.arc(hx - 0.4, hy - 0.4, 4.6, Math.PI * 0.7, Math.PI * 2.02); ctx.lineTo(hx - 3.6, hy + 3.6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = vc; ctx.fillRect(hx + 0.4, hy - 0.8, 3.6, 0.9); if (!lo) glow(ctx, hx + 2.4, hy - 0.4, 3.2, '120,240,255', 0.55);
      } else {
        ctx.fillStyle = vc; ctx.beginPath(); ctx.ellipse(hx + 1.4, hy - 0.2, 2.6, 1.5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(hx + 0.6, hy - 1.1, 1.4, 0.5);
        if (sprite === 'marine' || sprite === 'exo') { ctx.fillStyle = sh(era === 'space' ? '#8a96a8' : '#c8d0da', 0.75); ctx.fillRect(hx - 1, hy + 1.6, 4, 1.6); ctx.fillStyle = 'rgba(0,0,0,0.4)'; for (let i = 0; i < 3; i++) ctx.fillRect(hx - 0.4 + i * 1.2, hy + 2, 0.5, 0.9); }
        seg(ctx, hx - 3.4, hy - 2, hx - 4.6, hy - 6.2, 0.4, '#5a6470'); circ(ctx, hx - 4.6, hy - 6.4, 0.5, ((t * 2) | 0) % 2 ? '#ff5050' : '#702020'); // antenna
      }
      ctx.fillStyle = tc; ctx.fillRect(hx - 3.6, hy - 1.2, 1.2, 2.4);
      break;
    }
  }
}

// hood framing the face (open at the front)
function hood(ctx, hx, hy, c) {
  ctx.fillStyle = c; ctx.beginPath(); ctx.arc(hx - 0.5, hy - 0.3, 3.75, Math.PI * 0.6, Math.PI * 1.9); ctx.quadraticCurveTo(hx + 1.6, hy - 1.9, hx + 0.2, hy - 0.6);
  ctx.quadraticCurveTo(hx - 0.8, hy + 1.4, hx + 0.6, hy + 3.5); ctx.lineTo(hx - 3.6, hy + 3.7); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = OL; ctx.lineWidth = 0.45; ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(hx + 2.6, hy - 1.6); ctx.quadraticCurveTo(hx + 0.6, hy - 1.4, hx + 0.1, hy + 0.4); ctx.stroke();
}
// workers' hats, varied per person and era
function workerHat(ctx, era, L, tc, hx, hy) {
  const v = L.hat;
  const scarf = (c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(hx - 0.3, hy - 0.6, 3.4, Math.PI * 0.8, Math.PI * 1.93); ctx.lineTo(hx + 0.8, hy - 1.5); ctx.quadraticCurveTo(hx - 1.4, hy + 0.2, hx - 4.4, hy + 2.8); ctx.closePath(); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.4; ctx.stroke(); seg(ctx, hx - 3, hy - 2.4, hx + 2, hy - 3, 0.4, 'rgba(0,0,0,0.2)'); circ(ctx, hx - 3.4, hy + 1.4, 0.8, sh(c, 0.85)); };
  const straw = (w, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(hx, hy - 2, w, 1.3, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(hx, hy - 2.2, 2.4, Math.PI, 0); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.ellipse(hx, hy - 2, w, 1.3, 0, 0, TAU); ctx.stroke(); seg(ctx, hx - 2.4, hy - 2.3, hx + 2.4, hy - 2.3, 0.6, sh(c, 0.6)); };
  switch (era) {
    case 'stone':
      if (v === 1) { seg(ctx, hx - 3, hy - 1.4, hx + 3, hy - 1.8, 0.8, tc); ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(hx - 2.6, hy - 2); ctx.quadraticCurveTo(hx - 4.2, hy - 4.6, hx - 3, hy - 6.2); ctx.stroke(); }
      else if (v === 2) { ctx.fillStyle = '#7a5a3a'; ctx.beginPath(); ctx.arc(hx - 0.3, hy - 0.8, 3.4, Math.PI, 0); ctx.fill(); ctx.fillStyle = 'rgba(255,240,210,0.25)'; ctx.fillRect(hx - 3.4, hy - 1.2, 6.6, 0.7); }
      break;
    case 'bronze':
      if (v === 0 || v === 3) scarf(v ? sh(tc, 1.25) : '#e8e0cc');
      else if (v === 2) seg(ctx, hx - 3, hy - 1.5, hx + 3, hy - 1.8, 0.8, tc);
      break;
    case 'iron': case 'classical':
      if (v === 0) straw(4.8, '#d8c088'); else if (v === 2) scarf('#d8d0bc');
      else if (v === 3) { ctx.fillStyle = '#7a5a3a'; ctx.beginPath(); ctx.moveTo(hx - 3.2, hy - 0.6); ctx.quadraticCurveTo(hx - 3, hy - 4.6, hx + 0.6, hy - 4.4); ctx.quadraticCurveTo(hx + 2.8, hy - 4.4, hx + 2, hy - 2); ctx.lineTo(hx + 3, hy - 0.8); ctx.closePath(); ctx.fill(); }
      break;
    case 'medieval':
      if (v === 0) straw(4.6, '#c8b078');
      else if (v === 1) { ctx.fillStyle = '#ece4d0'; ctx.beginPath(); ctx.arc(hx - 0.3, hy - 0.5, 3.3, Math.PI * 0.85, Math.PI * 1.92); ctx.lineTo(hx + 0.6, hy - 0.6); ctx.lineTo(hx + 0.2, hy + 2.8); ctx.lineTo(hx - 2.6, hy + 2.6); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.4; ctx.stroke(); seg(ctx, hx + 0.2, hy + 2.6, hx + 1.6, hy + 3, 0.4, '#ece4d0'); }
      else if (v === 2) hood(ctx, hx, hy, sh(tc, 0.8));
      else scarf('#d8c8b0');
      break;
    case 'gunpowder':
      if (v === 0) { ctx.fillStyle = '#3a2e26'; ctx.beginPath(); ctx.ellipse(hx, hy - 2, 4.6, 1.1, 0, 0, TAU); ctx.fill(); ctx.fillRect(hx - 2.4, hy - 4.8, 4.8, 2.8); seg(ctx, hx - 2.4, hy - 2.6, hx + 2.4, hy - 2.6, 0.6, tc); }
      else if (v === 1) straw(4.8, '#d0b880'); else if (v === 2) scarf(sh(tc, 1.3));
      else { ctx.fillStyle = '#ece4d0'; ctx.beginPath(); ctx.arc(hx - 0.2, hy - 1, 3.4, Math.PI * 0.95, Math.PI * 2.05); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.5; ctx.stroke(); }
      break;
    case 'industrial':
      if (v === 1) { ctx.fillStyle = '#1e1c1a'; ctx.beginPath(); ctx.ellipse(hx, hy - 1.6, 4.2, 1, 0, 0, TAU); ctx.fill(); dome(ctx, hx, hy - 1.8, 2.7, '#24221f', 2.8); }
      else if (v === 2) scarf('#8a5a4a');
      else { const c = v ? '#6a5a44' : '#4a4a46'; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(hx - 0.4, hy - 0.8, 3.4, Math.PI, 0); ctx.fill(); ctx.beginPath(); ctx.moveTo(hx + 0.6, hy - 1.4); ctx.quadraticCurveTo(hx + 4.6, hy - 1.6, hx + 4.6, hy - 0.8); ctx.lineTo(hx + 0.6, hy - 0.6); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(hx - 2.4, hy - 3.4, 2, 0.6); }
      break;
    case 'modern': {
      const c = ['#f2c230', '#f4f4ee', '#ee7a22', '#f2c230'][v];
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(hx, hy - 0.6, 3.4, Math.PI, 0); ctx.fill(); ctx.fillRect(hx - 3.6, hy - 0.9, 7.6, 0.9);
      ctx.strokeStyle = OL; ctx.lineWidth = 0.4; ctx.stroke(); seg(ctx, hx, hy - 4, hx, hy - 1, 0.6, sh(c, 0.8));
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(hx - 1.8, hy - 3.4, 1.3, 0.7);
      break;
    }
    case 'future': case 'space':
      ctx.fillStyle = 'rgba(160,230,255,0.35)'; ctx.beginPath(); ctx.arc(hx, hy, 4, 0, TAU); ctx.fill(); ctx.strokeStyle = '#d8e0e8'; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fillRect(hx - 2, hy - 2.8, 1.6, 0.7); ctx.fillStyle = tc; ctx.fillRect(hx - 4.2, hy - 0.6, 1, 1.4);
      break;
  }
}

// weapon in the front hand; local frame at the hand, pointing forward (+x)
function weapon(ctx, sprite, era, uid, busy, t, lo) {
  ctx.lineCap = 'round';
  switch (sprite) {
    case 'club': { // knotted club with a lashed stone
      ctx.strokeStyle = OL; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 1.4); ctx.lineTo(0.2, -8.6); ctx.stroke();
      ctx.strokeStyle = '#7a4e28'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, 1.2); ctx.lineTo(0.1, -5); ctx.stroke();
      ctx.fillStyle = '#6b4424'; ctx.beginPath(); ctx.moveTo(-0.8, -4.6); ctx.quadraticCurveTo(-1.8, -9, 0, -10.6); ctx.quadraticCurveTo(2.2, -9.4, 1.2, -4.6); ctx.closePath(); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.5; ctx.stroke();
      circ(ctx, 1.4, -8.4, 1.5, '#8a8680'); circ(ctx, 1, -8.8, 0.5, '#c8c4bc');
      seg(ctx, -0.6, -7.2, 1.6, -7.6, 0.5, '#c8a878'); seg(ctx, -0.4, -6.4, 1.4, -6.8, 0.5, '#c8a878');
      if (!lo) { circ(ctx, -0.9, -6, 0.5, '#5a3818'); sheen(ctx, -0.5, -9.4, -0.6, -6, 0.4, 0.3); }
      break;
    }
    case 'axe': {
      seg(ctx, 0, 2.2, 0, -9.6, 1.9, OL); seg(ctx, 0, 2, 0, -9.4, 1.2, '#7a5030');
      ctx.beginPath();
      if (era === 'stone') { ctx.moveTo(-0.2, -9.6); ctx.lineTo(3.4, -10.6); ctx.lineTo(4.8, -7.6); ctx.lineTo(3.6, -5.4); ctx.lineTo(-0.2, -6.8); ctx.fillStyle = '#7a7670'; }
      else if (era === 'bronze') { ctx.moveTo(0, -9.6); ctx.quadraticCurveTo(3, -10, 4.6, -12); ctx.quadraticCurveTo(5.6, -7.8, 4.6, -3.8); ctx.quadraticCurveTo(3, -6, 0, -6.4); ctx.fillStyle = '#c8843a'; } // crescent
      else { ctx.moveTo(0, -9.8); ctx.lineTo(2.6, -10.2); ctx.quadraticCurveTo(5, -10.6, 5.4, -11.4); ctx.quadraticCurveTo(5.8, -6.4, 4.2, -3.6); ctx.quadraticCurveTo(3.4, -6.4, 0, -6.8); ctx.fillStyle = '#a8b0b8'; } // bearded
      ctx.closePath(); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.55; ctx.stroke();
      if (era === 'stone') { seg(ctx, -0.6, -9.2, 0.8, -7, 0.6, '#c8a878'); seg(ctx, 0.8, -9.4, -0.6, -7.2, 0.6, '#c8a878'); }
      else { ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(5, -10.6); ctx.quadraticCurveTo(5.5, -7.4, 4.3, -4.4); ctx.stroke(); }
      break;
    }
    case 'sword': case 'greatsword': case 'templar': case 'sabre': {
      if (sprite === 'sabre') { // curved cavalry sabre with a stirrup guard
        ctx.fillStyle = '#dfe3e8'; ctx.beginPath(); ctx.moveTo(-0.8, -1.6); ctx.quadraticCurveTo(-1, -7, 1.4, -11.6); ctx.quadraticCurveTo(0.4, -6.6, 0.8, -1.6); ctx.closePath(); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.4; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(-0.3, -2.4); ctx.quadraticCurveTo(-0.5, -7, 1, -10.6); ctx.stroke();
        ctx.strokeStyle = '#c8a048'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-1.6, -1.4); ctx.quadraticCurveTo(1.6, -1.8, 1.4, 1.8); ctx.stroke();
        seg(ctx, 0, -1.2, 0, 1.8, 1.3, '#2a1a10'); circ(ctx, 0, 2.1, 0.6, '#c8a048');
        break;
      }
      const L = sprite === 'greatsword' ? 14 : sprite === 'templar' ? 12.5 : era === 'classical' ? 8 : era === 'bronze' ? 9 : 10.5;
      const blade = sprite === 'templar' ? '#bffaff' : era === 'bronze' ? '#d29a4a' : '#d8dde4';
      if (sprite === 'templar' && !lo) { glow(ctx, 0, -L * 0.55, L * 0.42, '100,240,255', 0.32 + Math.sin(t * 9) * 0.08); }
      ctx.beginPath();
      if (era === 'bronze' && sprite === 'sword') { ctx.moveTo(-0.7, -1.5); ctx.quadraticCurveTo(-1.6, -L * 0.6, 0, -L); ctx.quadraticCurveTo(1.6, -L * 0.6, 0.7, -1.5); } // leaf blade
      else if (era === 'classical') { ctx.moveTo(-1.1, -1.5); ctx.lineTo(-1.1, -L + 2.4); ctx.lineTo(0, -L); ctx.lineTo(1.1, -L + 2.4); ctx.lineTo(1.1, -1.5); } // gladius
      else { ctx.moveTo(-0.9, -1.5); ctx.lineTo(-0.7, -L + 1.5); ctx.lineTo(0, -L); ctx.lineTo(0.7, -L + 1.5); ctx.lineTo(0.9, -1.5); }
      ctx.closePath(); ctx.fillStyle = blade; ctx.fill(); ctx.strokeStyle = sprite === 'templar' ? 'rgba(80,220,255,0.9)' : OL; ctx.lineWidth = 0.4; ctx.stroke();
      seg(ctx, 0.25, -2.2, 0.25, -L + 1.6, 0.4, 'rgba(255,255,255,0.75)'); // edge glint
      if (era === 'medieval' || sprite === 'greatsword') seg(ctx, -0.2, -2, -0.15, -L * 0.7, 0.35, 'rgba(60,70,80,0.55)'); // fuller
      const guard = sprite === 'templar' ? '#5a6a7a' : era === 'bronze' || era === 'classical' ? '#8a6a2a' : '#7a7e86';
      if (era === 'medieval' || sprite === 'greatsword') { seg(ctx, -2.9, -1.4, 2.9, -1.4, 1, guard); circ(ctx, -2.9, -1.4, 0.55, guard); circ(ctx, 2.9, -1.4, 0.55, guard); }
      else seg(ctx, -1.8, -1.4, 1.8, -1.4, 1.1, guard);
      seg(ctx, 0, -1.2, 0, sprite === 'greatsword' ? 3.4 : 1.6, 1.3, sprite === 'templar' ? '#2a2a3a' : '#4a2a14');
      circ(ctx, 0, sprite === 'greatsword' ? 3.8 : 2, 0.85, sprite === 'templar' ? '#7cf1ff' : '#c8a048');
      break;
    }
    default: break;
  }
}

// shields: era/unit-specific shape, team-coloured field, rim, boss and emblem
function shieldKind(sprite, era, cls) {
  if (cls === 'worker' || cls === 'crew') return null;
  if (cls === 'mounted') return sprite === 'lance' && era === 'medieval' ? 'kite' : sprite === 'spear' ? 'round' : sprite === 'sword' && era === 'medieval' ? 'heater' : null;
  switch (sprite) {
    case 'hoplite': return 'aspis';
    case 'spear': return era === 'stone' ? 'hide' : 'round';
    case 'axe': return era === 'stone' ? 'hide' : 'round';
    case 'sword': return era === 'medieval' ? 'heater' : era === 'classical' ? 'scutum' : era === 'iron' ? 'oval' : era === 'bronze' ? 'round' : null;
  }
  return null;
}
function shieldPath(ctx, k, sx, sy) {
  ctx.beginPath();
  switch (k) {
    case 'heater': ctx.moveTo(sx - 3.4, sy - 4); ctx.lineTo(sx + 3.4, sy - 4); ctx.quadraticCurveTo(sx + 3.6, sy + 2, sx, sy + 5); ctx.quadraticCurveTo(sx - 3.6, sy + 2, sx - 3.4, sy - 4); break;
    case 'kite': ctx.moveTo(sx, sy - 5.4); ctx.quadraticCurveTo(sx + 3.6, sy - 5, sx + 3.2, sy - 1); ctx.quadraticCurveTo(sx + 2, sy + 4, sx, sy + 7.4); ctx.quadraticCurveTo(sx - 2, sy + 4, sx - 3.2, sy - 1); ctx.quadraticCurveTo(sx - 3.6, sy - 5, sx, sy - 5.4); break;
    case 'scutum': ctx.moveTo(sx - 3.2, sy - 5); ctx.quadraticCurveTo(sx, sy - 5.8, sx + 3.2, sy - 5); ctx.lineTo(sx + 3.2, sy + 5); ctx.quadraticCurveTo(sx, sy + 5.8, sx - 3.2, sy + 5); ctx.closePath(); break;
    case 'oval': ctx.ellipse(sx, sy, 3.3, 5.6, 0, 0, TAU); break;
    case 'aspis': ctx.arc(sx, sy, 5, 0, TAU); break;
    case 'hide': ctx.ellipse(sx, sy, 3.6, 4.8, 0.15, 0, TAU); break;
    default: ctx.arc(sx, sy, 4.3, 0, TAU);
  }
}
function drawShield(ctx, k, tc, team, sx, sy, lo) {
  const base = k === 'aspis' ? '#cfa244' : k === 'hide' ? '#a07a50' : tc;
  shieldPath(ctx, k, sx, sy);
  const sg = grad(ctx, 'shield' + base, () => { const g = ctx.createLinearGradient(-4, -5, 4, 5); g.addColorStop(0, sh(base, 1.3)); g.addColorStop(0.5, base); g.addColorStop(1, sh(base, 0.58)); return g; });
  fillAt(ctx, sx, sy, sg); ctx.strokeStyle = OL; ctx.lineWidth = 0.8; ctx.stroke();
  const rim = k === 'hide' ? '#5a3a1e' : k === 'aspis' ? '#e8c060' : k === 'heater' || k === 'kite' ? '#d8c08a' : '#b8bcc4';
  switch (k) {
    case 'hide': // stitched hide with painted team stripes
      ctx.strokeStyle = rim; ctx.lineWidth = 0.5; ctx.setLineDash([0.8, 0.8]); ctx.beginPath(); ctx.ellipse(sx, sy, 2.9, 4.1, 0.15, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      seg(ctx, sx - 2.2, sy - 1, sx + 2.2, sy - 1.6, 0.9, tc); seg(ctx, sx - 2, sy + 1.2, sx + 2, sy + 0.6, 0.9, tc);
      break;
    case 'aspis': { // bronze rim, team field with an emblem
      ctx.fillStyle = tc; ctx.beginPath(); ctx.arc(sx, sy, 3.7, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,190,0.55)'; ctx.lineWidth = 0.45; ctx.beginPath(); ctx.arc(sx, sy, 4.5, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
      ctx.strokeStyle = '#f2e6c4'; ctx.fillStyle = '#f2e6c4'; ctx.lineWidth = 0.8;
      switch (team & 3) {
        case 0: ctx.beginPath(); ctx.moveTo(sx - 1.8, sy + 2); ctx.lineTo(sx, sy - 2.2); ctx.lineTo(sx + 1.8, sy + 2); ctx.stroke(); break; // lambda
        case 1: ctx.beginPath(); ctx.arc(sx, sy, 2.1, 0.6, Math.PI * 2 - 0.6); ctx.arc(sx + 0.9, sy, 1.6, Math.PI * 2 - 0.9, 0.9, true); ctx.fill(); break; // crescent
        case 2: ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.9 : 2.2; ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); break; // star
        default: ctx.beginPath(); ctx.arc(sx, sy, 1.9, 0, TAU); ctx.stroke(); circ(ctx, sx, sy, 0.7, '#f2e6c4'); // eye
      }
      break;
    }
    case 'heater': case 'kite': // heraldic charge: cross, chevron, bend or pale
      ctx.save(); shieldPath(ctx, k, sx, sy); ctx.clip();
      ctx.fillStyle = (team & 1) ? '#f2ead6' : '#e8c860';
      switch (team & 3) {
        case 0: ctx.fillRect(sx - 0.7, sy - 6, 1.4, 14); ctx.fillRect(sx - 4, sy - 1.6, 8, 1.4); break;
        case 1: ctx.beginPath(); ctx.moveTo(sx - 4, sy + 2.4); ctx.lineTo(sx, sy - 1.6); ctx.lineTo(sx + 4, sy + 2.4); ctx.lineTo(sx + 4, sy + 4.2); ctx.lineTo(sx, sy + 0.2); ctx.lineTo(sx - 4, sy + 4.2); ctx.fill(); break;
        case 2: ctx.beginPath(); ctx.moveTo(sx - 4, sy - 5); ctx.lineTo(sx - 1.8, sy - 5); ctx.lineTo(sx + 4, sy + 3); ctx.lineTo(sx + 4, sy + 5.4); ctx.closePath(); ctx.fill(); break;
        default: ctx.fillRect(sx - 1.2, sy - 6, 2.4, 14);
      }
      ctx.restore();
      shieldPath(ctx, k, sx, sy); ctx.strokeStyle = rim; ctx.lineWidth = 0.55; ctx.stroke();
      break;
    case 'scutum': // curved legionary shield: rim, spine, boss and wings
      ctx.strokeStyle = '#e8c860'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(sx, sy - 5); ctx.lineTo(sx, sy + 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx - 2.4, sy - 3); ctx.quadraticCurveTo(sx - 1, sy - 1, sx - 2.4, sy + 0.2); ctx.moveTo(sx + 2.4, sy - 3); ctx.quadraticCurveTo(sx + 1, sy - 1, sx + 2.4, sy + 0.2); ctx.stroke();
      break;
    case 'oval': // Celtic: wooden spine and painted swirl
      seg(ctx, sx, sy - 5.2, sx, sy + 5.2, 0.9, '#6a4a2a');
      if (!lo) { ctx.strokeStyle = 'rgba(255,245,220,0.6)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(sx, sy - 2.6, 1.6, 0, Math.PI * 1.4); ctx.arc(sx, sy + 2.6, 1.6, Math.PI, Math.PI * 2.4); ctx.stroke(); }
      break;
    default: // round: rim ring and painted band
      ctx.strokeStyle = rim; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(sx, sy, 3.9, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,245,220,0.55)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(sx, sy, 2.6, 0, TAU); ctx.stroke();
  }
  if (k !== 'heater' && k !== 'kite' && k !== 'hide') { circ(ctx, sx, sy, k === 'aspis' ? 0.9 : 1.2, '#e8d8a0'); circ(ctx, sx - 0.35, sy - 0.35, 0.45, '#fff'); }
  if (!lo) { // metal / varnish sheen along the upper-left edge
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 0.5; ctx.beginPath();
    if (k === 'heater' || k === 'kite' || k === 'scutum') { ctx.moveTo(sx - 2.8, sy - 3.6); ctx.lineTo(sx + 1.6, sy - 3.8); } else ctx.ellipse(sx, sy, k === 'aspis' ? 4.6 : 3.4, k === 'oval' ? 5.1 : k === 'aspis' ? 4.6 : 3.9, 0, Math.PI * 1.1, Math.PI * 1.55);
    ctx.stroke();
  }
}

function quiver(ctx, x, y, kind) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.45);
  if (kind === 'crossbow') { ctx.fillStyle = '#5a3a1e'; ctx.fillRect(-1.6, -3, 3.2, 7); ctx.strokeStyle = OL; ctx.lineWidth = 0.45; ctx.strokeRect(-1.6, -3, 3.2, 7); ctx.fillStyle = '#ccc'; for (let i = 0; i < 3; i++) ctx.fillRect(-1.2 + i * 1.1, -4.2, 0.6, 1.4); }
  else {
    ctx.fillStyle = '#6a4224'; ctx.beginPath(); ctx.moveTo(-1.8, -4); ctx.lineTo(1.8, -4); ctx.lineTo(1.4, 5); ctx.lineTo(-1.4, 5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OL; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,230,190,0.18)'; ctx.fillRect(-1.6, -3.6, 1, 8);
    ctx.fillStyle = '#a07040'; ctx.fillRect(-1.8, -3, 3.6, 0.8); ctx.fillRect(-1.6, 2.6, 3.2, 0.7);
    ctx.strokeStyle = '#d8c8a0'; ctx.lineWidth = 0.5; ctx.beginPath(); for (let i = 0; i < 4; i++) { const fx = -1.3 + i * 0.85; ctx.moveTo(fx, -4); ctx.lineTo(fx, -6); } ctx.stroke();
    for (let i = 0; i < 4; i++) { const fx = -1.3 + i * 0.85; ctx.fillStyle = i % 2 ? '#e8e0d0' : '#b83a2a'; ctx.fillRect(fx - 0.5, -7.4, 1, 1.8); }
  }
  ctx.restore();
}
// pavise (tall team-painted shield) slung on a crossbowman's back
function pavise(ctx, x, y, tc) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.2); ctx.scale(0.85, 0.85);
  ctx.beginPath(); ctx.moveTo(-2.6, -6); ctx.quadraticCurveTo(0, -7, 2.6, -6); ctx.lineTo(2.4, 6); ctx.lineTo(-2.4, 6); ctx.closePath();
  ctx.fillStyle = sh(tc, 0.85); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.6; ctx.stroke();
  ctx.fillStyle = '#f0e8d4'; ctx.fillRect(-0.7, -6.2, 1.4, 12.2);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-2.3, -5.6, 1, 11);
  ctx.restore();
}

function load(ctx, res, by, era, back) {
  const fut = era === 'future' || era === 'space';
  if (back) {
    switch (res) {
      case 0: { // basket of berries / meat
        ctx.fillStyle = '#9a7040'; ctx.beginPath(); ctx.moveTo(-7.6, by + 1); ctx.lineTo(-2.2, by + 1); ctx.lineTo(-3, by + 7.5); ctx.lineTo(-7, by + 7.5); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#6a4a24'; ctx.lineWidth = 0.5; ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(-7.5 + i * 0.1, by + 2.4 + i * 1.5); ctx.lineTo(-2.4 - i * 0.2, by + 2.4 + i * 1.5); } ctx.stroke();
        ctx.strokeStyle = OL; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-7.6, by + 1); ctx.lineTo(-2.2, by + 1); ctx.lineTo(-3, by + 7.5); ctx.lineTo(-7, by + 7.5); ctx.closePath(); ctx.stroke();
        for (const [col, set] of [['#c4223a', [0, 3, 4]], ['#e04050', [1, 5]], ['#7a2a8a', [2, 6]]]) { ctx.beginPath(); for (const i of set) { const bx = -7 + (i % 4) * 1.5 + (i > 3 ? 0.7 : 0), byy = by + 0.4 - (i > 3 ? 1.2 : 0); ctx.moveTo(bx + 1, byy); ctx.arc(bx, byy, 1, 0, TAU); } ctx.fillStyle = col; ctx.fill(); }
        circ(ctx, -6.4, by - 0.6, 0.35, 'rgba(255,255,255,0.7)');
        break;
      }
      case 1: { // logs across the shoulder
        for (let i = 0; i < 3; i++) {
          const yy = by - 0.6 - i * 1.9 + (i === 2 ? 0.6 : 0), x0 = -9 + (i % 2) * 1.2, x1 = 4.5 - (i === 2 ? 2 : 0);
          ctx.fillStyle = i === 1 ? '#7a5030' : '#8a5a34'; ctx.beginPath(); ctx.moveTo(x0, yy - 1); ctx.lineTo(x1, yy - 1.2); ctx.lineTo(x1, yy + 0.9); ctx.lineTo(x0, yy + 1); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = OL; ctx.lineWidth = 0.5; ctx.stroke();
          seg(ctx, x0 + 2, yy - 0.3, x1 - 3, yy - 0.5, 0.35, 'rgba(40,20,8,0.6)');
          ell(ctx, x0, yy, 0.8, 1.05, 0, '#d8b080'); ctx.strokeStyle = '#8a6030'; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.ellipse(x0, yy, 0.45, 0.6, 0, 0, TAU); ctx.stroke();
        }
        break;
      }
      case 2: { // stone blocks in a rope sling
        ctx.fillStyle = '#8a8884'; ctx.beginPath(); ctx.moveTo(-8, by + 1); ctx.lineTo(-3, by); ctx.lineTo(-2.4, by + 5.6); ctx.lineTo(-7.6, by + 6.4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#b4b2ac'; ctx.beginPath(); ctx.moveTo(-8, by + 1); ctx.lineTo(-3, by); ctx.lineTo(-4.2, by - 1.6); ctx.lineTo(-8.6, by - 0.8); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = OL; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(-8.6, by - 0.8); ctx.lineTo(-4.2, by - 1.6); ctx.lineTo(-2.4, by + 5.6); ctx.lineTo(-7.6, by + 6.4); ctx.closePath(); ctx.stroke();
        seg(ctx, -5.2, by - 1.2, -5, by + 6, 0.6, '#a08050');
        break;
      }
      case 3: { // sack of ore with nuggets
        ctx.fillStyle = '#b89a66'; ctx.beginPath(); ctx.moveTo(-6.5, by - 0.5); ctx.quadraticCurveTo(-9.6, by + 3, -7.8, by + 7); ctx.lineTo(-2.6, by + 7); ctx.quadraticCurveTo(-1.4, by + 3, -3.6, by - 0.5); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = OL; ctx.lineWidth = 0.5; ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.moveTo(-3.6, by + 1); ctx.quadraticCurveTo(-1.8, by + 4, -2.6, by + 7); ctx.lineTo(-4, by + 7); ctx.closePath(); ctx.fill();
        circ(ctx, -5.6, by - 0.7, 1.1, '#ffd84a'); circ(ctx, -4.3, by - 1.2, 0.9, '#f2c230'); circ(ctx, -4.8, by - 1.6, 0.35, '#fff6c0');
        seg(ctx, -6.6, by + 0.4, -3.4, by + 0.4, 0.6, '#6a4a24');
        break;
      }
      case 4: { // energy cell
        ctx.fillStyle = '#4a5260'; ctx.fillRect(-7.6, by, 4.6, 7);
        ctx.fillStyle = '#43d2ff'; ctx.fillRect(-6.8, by + 1, 3, 5);
        ctx.fillStyle = 'rgba(200,250,255,0.85)'; ctx.fillRect(-6.4, by + 1.4, 0.8, 4.2);
        break;
      }
    }
  } else if (!fut) { // empty: small bedroll / satchel
    ctx.fillStyle = era === 'stone' ? '#8a6a44' : '#a08a5a'; ctx.beginPath(); ctx.ellipse(-4.4, by + 4.2, 1.8, 2.6, 0.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = OL; ctx.lineWidth = 0.4; ctx.stroke();
  }
}

// worker tool for the current job (res: resource being gathered, state 5 = building)

// worker tool for the current job (res: resource being gathered, state 5 = building)
function tool(ctx, res, state, era, busy, act) {
  const fut = era === 'future' || era === 'space';
  const metal = era === 'stone' ? '#8a8680' : era === 'bronze' ? '#c8843a' : fut ? '#dde4ec' : '#b8c0c8';
  const haft = fut ? '#4a5260' : '#6a4424';
  if (state === 5) { // mallet / hammer
    seg(ctx, 0, 1.9, 0, -7.2, 1.9, OL); seg(ctx, 0, 1.7, 0, -7, 1.2, haft);
    if (era === 'stone') { ctx.fillStyle = '#8a8680'; ctx.beginPath(); ctx.ellipse(0, -8.2, 2.9, 1.8, 0.1, 0, TAU); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.5; ctx.stroke(); seg(ctx, -1, -7.2, 1, -7.4, 0.6, '#c8a878'); }
    else if (era === 'bronze' || era === 'iron' || era === 'classical' || era === 'medieval') { ctx.fillStyle = '#8a6040'; ctx.fillRect(-2.9, -9.6, 5.8, 2.9); ctx.strokeStyle = OL; ctx.lineWidth = 0.5; ctx.strokeRect(-2.9, -9.6, 5.8, 2.9); ctx.fillStyle = 'rgba(255,230,190,0.3)'; ctx.fillRect(-2.9, -9.6, 5.8, 0.7); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-2.9, -7.4, 5.8, 0.7); }
    else {
      ctx.fillStyle = fut ? '#d8e0e8' : '#5a5a5e'; ctx.fillRect(-1.2, -9.2, 4, 2.2); ctx.strokeStyle = OL; ctx.lineWidth = 0.45; ctx.strokeRect(-1.2, -9.2, 4, 2.2);
      ctx.strokeStyle = fut ? '#d8e0e8' : '#5a5a5e'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-1, -8.4); ctx.quadraticCurveTo(-3, -8.6, -3.4, -6.6); ctx.stroke(); // claw
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-1.2, -9.2, 4, 0.5);
      if (fut) { ctx.fillStyle = '#39d4ff'; ctx.fillRect(2, -9, 0.8, 1.8); if (busy && act > 0.55 && act < 0.72) glow(ctx, 3, -8, 4, '120,230,255', 0.9); }
    }
    if (busy && act > 0.58 && act < 0.68 && !fut) { ctx.fillStyle = '#fff6c0'; ctx.fillRect(2.6, -9.6, 1, 1); ctx.fillRect(3.4, -8, 0.8, 0.8); }
  } else if (res === 0) { // sickle
    seg(ctx, 0, 1.6, 0, -3.6, 1.8, OL); seg(ctx, 0, 1.5, 0, -3.5, 1.2, haft);
    ctx.fillStyle = metal; ctx.beginPath(); ctx.arc(2.2, -4.4, 2.9, Math.PI * 0.98, Math.PI * 1.98); ctx.arc(2.7, -4.1, 2.1, Math.PI * 1.9, Math.PI * 1.02, true); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OL; ctx.lineWidth = 0.35; ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.arc(2.2, -4.4, 2.6, Math.PI * 1.15, Math.PI * 1.6); ctx.stroke();
  } else if (res === 2 || res === 3 || res === 4) { // pickaxe
    seg(ctx, 0, 1.9, 0, -8, 1.9, OL); seg(ctx, 0, 1.7, 0, -7.8, 1.2, haft);
    ctx.fillStyle = metal; ctx.beginPath(); ctx.moveTo(-4.4, -5.6); ctx.quadraticCurveTo(-2, -8.6, 0, -8.8); ctx.quadraticCurveTo(2, -8.6, 4.4, -5.6); ctx.quadraticCurveTo(2, -7.4, 0, -7.4); ctx.quadraticCurveTo(-2, -7.4, -4.4, -5.6); ctx.fill();
    ctx.strokeStyle = OL; ctx.lineWidth = 0.4; ctx.stroke(); sheen(ctx, -2.4, -7.8, 1.4, -8.4, 0.35, 0.65);
    if (fut && res === 4) glow(ctx, 4.2, -5.8, 2.4, '120,230,255', 0.7);
  } else { // felling axe
    seg(ctx, 0, 1.9, 0, -8.6, 1.9, OL); seg(ctx, 0, 1.7, 0, -8.5, 1.2, haft);
    ctx.fillStyle = metal; ctx.beginPath(); ctx.moveTo(0, -8.8); ctx.lineTo(3.8, -9.9); ctx.quadraticCurveTo(4.6, -7.6, 3.8, -5.5); ctx.lineTo(0, -6.6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OL; ctx.lineWidth = 0.45; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.45; ctx.beginPath(); ctx.moveTo(4, -9.4); ctx.quadraticCurveTo(4.5, -7.6, 3.9, -6); ctx.stroke();
  }
}

// long arms and launchers in a frame at the back (trigger) hand pointing at
// the target (+x); returns the muzzle distance
function firearm(ctx, sprite, uid, era, busy, act, t, lo, mounted) {
  const W = '#6a3a1a', ST = '#3c3e42';
  const outline = () => { ctx.strokeStyle = OL; ctx.lineWidth = 0.45; ctx.stroke(); };
  switch (sprite) {
    case 'crossbow': {
      seg(ctx, -3, 0.3, 8.6, 0, 2.4, OL); seg(ctx, -3, 0.3, 8.6, 0, 1.6, '#7a4e28');
      ctx.fillStyle = '#5a3a1e'; ctx.fillRect(-0.4, 0.6, 0.9, 1.8); // trigger lever
      const dr = busy && act > 0.2 ? 0 : 2.4;
      ctx.strokeStyle = OL; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(7.4, -4.8); ctx.quadraticCurveTo(9.2, 0, 7.4, 4.8); ctx.stroke();
      ctx.strokeStyle = era === 'medieval' ? '#8a9098' : '#4a3a2a'; ctx.lineWidth = 1.1; ctx.stroke(); // steel prod
      ctx.strokeStyle = 'rgba(235,235,225,0.9)'; ctx.lineWidth = 0.45; ctx.beginPath(); ctx.moveTo(7.4, -4.8); ctx.lineTo(7.2 - dr - 1, 0); ctx.lineTo(7.4, 4.8); ctx.stroke();
      ctx.strokeStyle = '#6a6e74'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(9.4, 0, 1, 1.2, 0, 0, TAU); ctx.stroke(); // stirrup
      if (dr) { seg(ctx, 7.2 - dr - 1, -0.6, 10, -0.6, 0.6, '#d8c8a0'); ctx.fillStyle = '#c8ccd0'; ctx.beginPath(); ctx.moveTo(10, -1.3); ctx.lineTo(11.4, -0.6); ctx.lineTo(10, 0.1); ctx.fill(); }
      return 10;
    }
    case 'musket': case 'grenadier': {
      const L = mounted ? 12 : 16;
      ctx.fillStyle = W; ctx.beginPath(); ctx.moveTo(-4.2, -0.3); ctx.lineTo(-1, -0.7); ctx.lineTo(L * 0.72, -0.2); ctx.lineTo(L * 0.72, 0.7); ctx.lineTo(1, 1); ctx.lineTo(-1.2, 1.2); ctx.lineTo(-4.4, 2.2); ctx.closePath(); ctx.fill(); outline();
      seg(ctx, 0.6, -0.6, L, -0.6, 1.1, ST); sheen(ctx, 1.6, -0.95, L - 0.6, -0.95, 0.35, 0.5);
      ctx.fillStyle = '#c8a048'; ctx.fillRect(L * 0.42, -1.2, 0.6, 1.9); ctx.fillRect(L * 0.66, -1.2, 0.6, 1.9); ctx.fillRect(-4.4, -0.4, 0.6, 2.6);
      ctx.fillStyle = '#8a8e94'; ctx.fillRect(0.4, -1.5, 1.8, 1); // lock
      if (uid === 'arquebusier') { // smouldering match in the serpentine
        seg(ctx, 0.6, -1, -0.2, -2.6, 0.45, '#4a3a2a'); circ(ctx, -0.2, -2.7, 0.45, '#ff8a2a');
        if (!lo) { glow(ctx, -0.2, -2.7, 1.1, '255,140,40', 0.45 + Math.sin(t * 11) * 0.15); for (let i = 0; i < 3; i++) { const k = ((t * 0.9 + i / 3) % 1); circ(ctx, -0.2 + Math.sin(t * 2 + i * 2) * 0.6 * k - k * 1.2, -3.2 - k * 5, 0.4 + k * 0.9, `rgba(215,215,210,${0.32 * (1 - k)})`); } }
      }
      if (busy && act > 0.04 && act < 0.55 && !lo) { const k = act / 0.55; for (let i = 0; i < 3; i++) circ(ctx, L + 1.5 + i * 1.6 + k * 3, -0.8 - i * 0.6 - k * 2, 1.2 + k * 2.2 + i * 0.4, `rgba(228,226,220,${0.55 * (1 - k)})`); }
      return L;
    }
    case 'bayonet': case 'rifle': {
      if (era === 'modern') { // assault rifle: polymer furniture, curved magazine, optic
        const sf = uid === 'special_forces', L = 12, c = '#26282a';
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-4, -0.4); ctx.lineTo(-0.6, -0.8); ctx.lineTo(-0.6, -1.2); ctx.lineTo(7, -1.2); ctx.lineTo(7, 0.8); ctx.lineTo(-0.4, 0.8); ctx.lineTo(-4, 1.8); ctx.closePath(); ctx.fill(); outline();
        ctx.fillStyle = sf ? '#3a3c34' : '#4a4c3e'; ctx.fillRect(4, -1, 3.6, 1.8); // handguard
        seg(ctx, 7.6, -0.2, L, -0.2, 0.9, '#1a1a1a');
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(2.2, 0.8); ctx.quadraticCurveTo(2.4, 3, 3.6, 3.8); ctx.lineTo(4.4, 3.2); ctx.quadraticCurveTo(3.6, 2.4, 3.6, 0.8); ctx.closePath(); ctx.fill(); // magazine
        ctx.fillRect(0.2, 0.8, 0.9, 1.6); // grip
        ctx.fillStyle = '#18181a'; ctx.fillRect(1, -2.4, 3, 1.2); ctx.fillStyle = sf ? '#5ad0ff' : '#c84a3a'; ctx.fillRect(3.6, -2.2, 0.5, 0.7); // optic
        sheen(ctx, 0, -1.05, 6.6, -1.05, 0.3, 0.3);
        if (sf) { seg(ctx, L, -0.2, L + 3.6, -0.2, 1.6, '#1e1e20'); return L + 3.6; } // suppressor
        return L;
      }
      // bolt-action rifle (with bayonet for fusiliers)
      const L = 15;
      ctx.fillStyle = '#7a4a24'; ctx.beginPath(); ctx.moveTo(-4.2, -0.2); ctx.lineTo(-0.8, -0.6); ctx.lineTo(L * 0.8, -0.3); ctx.lineTo(L * 0.8, 0.6); ctx.lineTo(0.6, 0.8); ctx.lineTo(-0.6, 1.4); ctx.lineTo(-4.4, 1.9); ctx.closePath(); ctx.fill(); outline();
      seg(ctx, 0, -0.65, L, -0.6, 0.9, ST); sheen(ctx, 1, -0.95, L - 1, -0.9, 0.3, 0.5);
      circ(ctx, 1.4, -1.4, 0.5, '#8a8e94'); seg(ctx, 1.4, -1, 1.2, -1.4, 0.4, '#8a8e94'); // bolt
      ctx.strokeStyle = 'rgba(70,46,24,0.85)'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(-2.6, 1.6); ctx.quadraticCurveTo(4, 4, 10, 0.6); ctx.stroke(); // sling
      if (sprite === 'bayonet') { ctx.fillStyle = '#dfe3e8'; ctx.beginPath(); ctx.moveTo(L - 0.6, -1); ctx.lineTo(L + 5.6, -0.7); ctx.lineTo(L - 0.6, -0.1); ctx.closePath(); ctx.fill(); sheen(ctx, L, -0.85, L + 4.6, -0.75, 0.3, 0.8); return L + 5.6; }
      return L;
    }
    case 'smg': { // trench sub-machine gun with a perforated jacket and drum
      const L = 9.5;
      ctx.fillStyle = '#6a4224'; ctx.beginPath(); ctx.moveTo(-4, -0.2); ctx.lineTo(-0.4, -0.6); ctx.lineTo(3, -0.6); ctx.lineTo(3, 0.8); ctx.lineTo(-0.4, 0.8); ctx.lineTo(-4, 1.8); ctx.closePath(); ctx.fill(); outline();
      seg(ctx, 2.6, -0.2, L, -0.2, 1.8, '#2e3032'); ctx.fillStyle = '#111'; for (let i = 0; i < 4; i++) ctx.fillRect(3.6 + i * 1.3, -0.6, 0.5, 0.5);
      circ(ctx, 1.4, -2, 1.4, '#2a2c2e'); circ(ctx, 1.1, -2.3, 0.5, 'rgba(255,255,255,0.3)');
      return L;
    }
    case 'mg': { // water-cooled machine gun with an ammunition belt
      const L = 13;
      ctx.fillStyle = '#3a3c36'; ctx.fillRect(-2.6, -1.6, 4, 3); seg(ctx, -3.4, -0.6, -3.4, 1.2, 0.8, '#2a2a26');
      seg(ctx, 1.2, -0.2, L - 2, -0.2, 3.2, OL); seg(ctx, 1.2, -0.2, L - 2, -0.2, 2.6, '#4e5248');
      if (!lo) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 0; i < 4; i++) ctx.fillRect(2.4 + i * 2, -1.4, 0.4, 2.4); }
      sheen(ctx, 1.4, -1, L - 2.4, -1, 0.4, 0.35);
      ctx.fillStyle = '#2a2c28'; ctx.beginPath(); ctx.moveTo(L - 2, -1.2); ctx.lineTo(L + 0.6, -0.6); ctx.lineTo(L + 0.6, 0.2); ctx.lineTo(L - 2, 0.8); ctx.fill();
      ctx.strokeStyle = '#b8902a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 1.2); ctx.quadraticCurveTo(-1, 4, -3.4, 4.8); ctx.stroke();
      if (!lo) { ctx.fillStyle = '#e8c860'; for (let i = 0; i < 4; i++) { const k = i / 4; ctx.fillRect(-0.2 - k * 3, 1.6 + k * 3 - (k * k) * 0.4, 0.5, 0.5); } }
      return L + 0.6;
    }
    case 'bazooka': {
      const at = uid === 'at_team', L = at ? 13 : 14, col = at ? '#6a6448' : '#4a5434', r = at ? 2.2 : 1.8;
      ctx.translate(0, -1.6);
      ctx.fillStyle = col; ctx.beginPath(); ctx.rect(-6, -r, L + 1, r * 2); ctx.fill(); outline();
      ctx.fillStyle = sh(col, 0.7); ctx.beginPath(); ctx.moveTo(-6, -r); ctx.lineTo(-7.6, -r - 0.8); ctx.lineTo(-7.6, r + 0.8); ctx.lineTo(-6, r); ctx.fill(); // rear flare
      sheen(ctx, -5, -r + 0.5, L - 6, -r + 0.5, 0.5, 0.3);
      ctx.fillStyle = '#2a2a1e'; ctx.fillRect(L - 5.2, -r - 0.4, 1.4, r * 2 + 0.8); ctx.fillRect(1, r - 0.2, 1.3, 2.6);
      if (at) { ctx.fillStyle = '#2a2a26'; ctx.fillRect(0.4, -r - 1.8, 3.2, 1.8); ctx.fillStyle = '#5ad0ff'; ctx.fillRect(3.2, -r - 1.4, 0.5, 0.8); }
      else { ctx.fillStyle = '#2a2a1e'; ctx.fillRect(3, -r - 1.2, 0.5, 1.2); }
      if (busy && act < 0.12 && !lo) circ(ctx, -9, 0, 3.4, 'rgba(210,210,200,0.6)');
      return L - 4;
    }
    case 'railgun': { // twin rails with arcing charge
      const L = 15;
      ctx.fillStyle = '#d6dde6'; ctx.beginPath(); ctx.moveTo(-4, -0.6); ctx.lineTo(4.4, -1.6); ctx.lineTo(4.4, 1.4); ctx.lineTo(-0.4, 1.2); ctx.lineTo(-4, 1.8); ctx.closePath(); ctx.fill(); outline();
      seg(ctx, 4, -1.2, L, -1.2, 0.8, '#4a5260'); seg(ctx, 4, 0.9, L, 0.9, 0.8, '#4a5260');
      ctx.fillStyle = '#39d4ff'; ctx.fillRect(0.4, -0.9, 2.6, 0.8);
      if (!lo) { const f = 0.5 + Math.sin(t * 17) * 0.3; ctx.strokeStyle = `rgba(150,240,255,${f})`; ctx.lineWidth = 0.4; ctx.beginPath(); for (let i = 0; i < 4; i++) { const xx = 6 + i * 2.3; ctx.moveTo(xx, -1.1); ctx.lineTo(xx + 0.8, 0); ctx.lineTo(xx + 0.2, 0.8); } ctx.stroke(); glow(ctx, 1.7, -0.5, 2.4, '120,240,255', 0.6); }
      return L;
    }
    case 'plasma': case 'marine': case 'exo': {
      const ion = uid === 'ion_lancer', heavy = sprite !== 'plasma', L = ion ? 16 : heavy ? 13 : 12;
      const body = sprite === 'marine' ? '#5a6270' : '#dfe6ee', gc = sprite === 'exo' || ion ? (ion ? '170,140,255' : '120,240,255') : '255,110,240';
      const gcol = `rgb(${gc})`;
      ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-4, -0.4); ctx.lineTo(-0.6, -1.8); ctx.lineTo(7.2, -1.8); ctx.quadraticCurveTo(8.6, -0.2, 7.2, 1.4); ctx.lineTo(0.4, 1.4); ctx.lineTo(-4, 2); ctx.closePath(); ctx.fill(); outline();
      ctx.fillStyle = sh(body, 0.7); ctx.fillRect(0.6, 1.2, 1.2, 1.8); // grip
      seg(ctx, 7.6, -0.3, L, -0.3, ion ? 1 : heavy ? 1.8 : 1.4, sh(body, 0.65));
      ctx.fillStyle = gcol; for (let i = 0; i < 3; i++) ctx.fillRect(1.6 + i * 1.8, -1.6, 0.8, 2.8); // coils
      sheen(ctx, -0.2, -1.5, 6.8, -1.5, 0.35, 0.6);
      if (ion) { circ(ctx, L, -0.3, 1.1, gcol); }
      if (!lo) { glow(ctx, 3.4, -0.2, 3.6, gc, 0.45 + Math.sin(t * 6) * 0.15); if (ion) glow(ctx, L, -0.3, 3, gc, 0.7); }
      return L;
    }
  }
  return 12;
}

// hair under hats / on bare heads (style from looks(); 2 = shaved)
function hair(ctx, Lk, hx, hy) {
  ctx.fillStyle = Lk.hair;
  if (Lk.style === 2) { ctx.fillStyle = 'rgba(40,28,20,0.3)'; ctx.beginPath(); ctx.arc(hx - 0.4, hy - 0.8, 3, Math.PI * 0.95, Math.PI * 2.05); ctx.fill(); return; }
  ctx.beginPath(); ctx.arc(hx - 0.4, hy - 0.8, 3.05, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
  switch (Lk.style) {
    case 1: ctx.beginPath(); ctx.moveTo(hx - 3.4, hy - 1); ctx.quadraticCurveTo(hx - 4.4, hy + 2.6, hx - 2.8, hy + 4.4); ctx.lineTo(hx - 1.2, hy + 1.4); ctx.closePath(); ctx.fill(); break; // long
    case 3: circ(ctx, hx - 3.3, hy - 2, 1.4, Lk.hair); break; // bun
    case 4: for (let i = 0; i < 4; i++) circ(ctx, hx - 3 + i * 1.6, hy - 3 + Math.abs(i - 1.5) * 0.5, 1.1, Lk.hair); break; // curls
  }
  ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(hx - 2.2, hy - 3.3, 1.6, 0.5);
}

// o: {team, era, sprite, dir, walk, act, busy, carry, cls, id, noShadow, legs,
//     res (resource being gathered), state (order), t, lod, uid (unit type id)}
const WORKER_GARB = { stone: ['#9a6e44', '#8a5e3a', '#a8804e'], bronze: ['#ddd2b6', '#b89a6a', '#a8885a', '#c8b48a'], iron: ['#8a7a5a', '#6a7a5a', '#9a7a5a', '#7a6a6a'], classical: ['#e4dccb', '#b8a07a', '#9aa08a', '#c89a7a'],
  medieval: ['#a8885a', '#8a6a4a', '#7a8a5a', '#9a7a6a', '#6a7a8a', '#8a5a4a'], gunpowder: ['#8a6a4a', '#6a7a8a', '#a88a5a', '#7a5a5a', '#5a6a5a'], industrial: ['#5a6a7a', '#6a5a4a', '#4a5a6a', '#7a6a5a'], modern: ['#e88a2a', '#d8d02a', '#e86a2a'], future: ['#e0e6ec', '#d4dce6'], space: ['#d0d6de', '#c4ccd8'] };
export function drawHuman(ctx, x, y, o) {
  const { team, era, sprite, dir, walk, carry, cls } = o;
  const busy = !!o.busy, act = busy ? o.act || 0 : 0;
  const tc = TEAM[team] || '#bbb';
  const fut = era === 'future' || era === 'space';
  const id = o.id || 0, lo = !!o.lod, uid = o.uid || '', tt = o.t || 0;
  const Lk = looks(id), skin = Lk.skin;
  const mounted = o.legs === false;
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  if (!o.noShadow) contactShadow(ctx, 0.5, 0, 6.5, 2.7, 0.34);
  const big = sprite === 'exo' || sprite === 'marine' || sprite === 'templar' ? 1.2 : 1;
  if (big !== 1) ctx.scale(big, big);
  const moving = walk > 0;
  const ph = walk * TAU;
  const step = moving ? Math.sin(ph) : 0, cph = Math.cos(ph);
  const bob = moving ? cph * cph * 1.0 - 0.35 : 0; // smooth double-frequency bob
  const worker = cls === 'worker' || cls === 'crew';
  const idle = !moving && !busy;
  const breath = idle ? Math.sin(tt * 2.2 + id * 0.7) * 0.32 : 0;
  const sway = idle && !mounted && !worker ? Math.sin(tt * 0.41 + id * 1.3) * 0.35 : 0; // weight shift
  const lookAt = idle && !lo && Math.sin(tt * 0.33 + id * 2.1) > 0.8; // glances towards the viewer
  const throwing = sprite === 'grenadier' && busy;
  const legCol = era === 'stone' ? '#8a5a3a' : fut ? (era === 'space' ? '#6a7688' : '#b8c2ce') : era === 'modern' ? (worker ? '#3a4458' : '#4c5838') : era === 'gunpowder' || era === 'industrial' ? (worker ? '#4a3a2a' : era === 'industrial' ? '#4a4a3e' : '#e8e2d4') : era === 'classical' || era === 'bronze' ? '#c49a74' : '#5a4630';
  const boot = fut ? '#3a4048' : era === 'stone' || era === 'bronze' || era === 'classical' ? '#6a4428' : '#2a2018';
  let body;
  if (worker) { const gl = WORKER_GARB[era] || WORKER_GARB.medieval; body = gl[Lk.garb % gl.length]; }
  else body = ARMOR[era] || sh(tc, 0.9);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const meleeAtk = busy && (melee(sprite) || polearm(sprite));
  const crouch = meleeAtk ? Math.sin(Math.min(1, act / 0.7) * Math.PI) * 0.7 : 0;
  const bodyY = -15 - bob - breath * 0.5 + crouch;
  let lean = melee(sprite) && busy ? Math.sin(Math.min(1, act / 0.6) * Math.PI) * 0.9 : (worker && busy ? (o.res === 0 && o.state !== 5 ? 1.3 : 0.6) : moving ? 0.35 : 0);
  if (polearm(sprite) && busy) lean += Math.max(0, Math.sin(Math.min(1, act / 0.5) * Math.PI)) * 0.8;
  // ---- legs (far leg first)
  if (!mounted) {
    const stance = !moving && !worker ? (busy ? 1.3 : 0.8) : 0;
    for (let i = 0; i < 2; i++) {
      const hx = i ? 1.1 : -1.1, s = i ? step : -step;
      const lift = moving ? Math.max(0, Math.sin(ph + (i ? 0 : Math.PI) + 1.2)) * 1.5 : 0;
      const fx = hx + s * 2.9 + (i ? stance : -stance) + sway * 0.5, fy = -0.4 - lift;
      const kx = (hx + fx) / 2 + 0.9 + lift * 0.5 + crouch * 0.6, ky = -3.8 - lift * 0.6 + crouch * 0.4;
      const col = i ? legCol : sh(legCol, 0.76);
      limb(ctx, [hx + lean * 0.3 + sway, -7.2 - bob * 0.5 + crouch], [kx, ky], [fx, fy], 2.1, col);
      ctx.strokeStyle = OL; ctx.lineWidth = 3.1; ctx.beginPath(); ctx.moveTo(fx - 0.4, fy - 1.4); ctx.lineTo(fx + 1.3, fy - 0.1); ctx.stroke();
      ctx.strokeStyle = i ? boot : sh(boot, 0.8); ctx.lineWidth = 2.3; ctx.stroke();
      if (!lo && i) seg(ctx, fx - 0.2, fy - 1.6, fx + 0.5, fy - 1, 0.4, 'rgba(255,255,255,0.22)');
      if (era === 'classical' || era === 'bronze') { seg(ctx, kx - 0.6, ky + 0.6, fx - 0.2, fy - 1.6, 1.4, i ? '#c8a048' : '#a8843a'); if (i && !lo) seg(ctx, kx - 0.9, ky + 1, fx - 0.6, fy - 2, 0.35, 'rgba(255,240,190,0.7)'); }
      else if (!worker && era === 'medieval' && (sprite === 'greatsword' || sprite === 'sword')) seg(ctx, kx - 0.3, ky + 0.4, fx - 0.2, fy - 1.6, 1.2, i ? '#9aa0a8' : '#7a8088');
      else if (era === 'industrial' && !worker) seg(ctx, kx - 0.2, ky + 0.8, fx - 0.3, fy - 1.4, 1.6, i ? '#6a6450' : '#565040'); // puttees
    }
  }
  ctx.save(); ctx.translate(lean + sway, 0);
  const sY = bodyY + 1.4; // shoulder line
  const by = -6.4 - bob + crouch; // waist
  // ---- things on the back (behind the torso)
  const cloak = !worker && !fut && (era === 'classical' || era === 'medieval' || (era === 'iron' && sprite === 'sword') || cls === 'mounted' && era !== 'gunpowder' && era !== 'industrial' && era !== 'modern');
  if (cloak) {
    const fl = moving ? 1.6 + Math.sin(ph * 2) * 0.6 : 0.3 + Math.sin(tt * 1.3 + id) * 0.15;
    const cc = era === 'classical' ? '#a8261c' : sh(tc, 0.7);
    const cb = mounted ? -8.2 : -3.2 + crouch;
    ctx.fillStyle = cc; ctx.beginPath(); ctx.moveTo(-2.8, sY - 1); ctx.quadraticCurveTo(-5 - fl, sY + 5, -5.5 - fl * 1.6, cb); ctx.lineTo(-1.2 - fl * 0.6, cb - 1.2); ctx.lineTo(1, sY + 2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OL; ctx.lineWidth = 0.6; ctx.stroke();
    if (!lo) { seg(ctx, -3.6, sY + 2, -4.4 - fl, cb - 1.2, 0.5, 'rgba(0,0,0,0.25)'); seg(ctx, -2.6, sY + 3, -2.8 - fl * 0.5, cb - 1.6, 0.4, 'rgba(255,255,255,0.12)'); }
  }
  const blade = sprite === 'sword' || sprite === 'greatsword' || sprite === 'sabre';
  if (blade && !worker) { // scabbard at the hip
    const sy0 = mounted ? by - 1.4 : by - 1, len = sprite === 'greatsword' ? 9 : 6.6;
    seg(ctx, -1, sy0, -1 - len * 0.6, sy0 + len * 0.8, 1.9, OL); seg(ctx, -1, sy0, -1 - len * 0.6, sy0 + len * 0.8, 1.2, sprite === 'sabre' ? '#2a2a2e' : '#5a3a1e');
    circ(ctx, -1 - len * 0.6, sy0 + len * 0.8, 0.7, '#c8a048'); seg(ctx, -1.4, sy0 + 0.6, -1.9, sy0 + 1.3, 1.4, '#c8a048');
  }
  if (sprite === 'crossbow') pavise(ctx, -4.6, sY + 3.6, tc);
  if (bowish(sprite) || sprite === 'crossbow') quiver(ctx, sprite === 'crossbow' ? -2.2 : -3.6, sY + (sprite === 'crossbow' ? 7.5 : 3.5), sprite);
  if (throwing && !lo) { seg(ctx, -4.6, sY + 8, 1.6, sY - 4, 1.8, OL); seg(ctx, -4.6, sY + 8, 1.6, sY - 4, 1.1, '#6a3a1a'); } // musket slung while throwing
  if (worker && cls !== 'crew') load(ctx, carry, sY, era, carry >= 0);
  if (fut && !worker && cls !== 'crew') { ctx.fillStyle = sh(body, 0.6); ctx.fillRect(-5.6, sY, 2.6, 6.5); ctx.strokeStyle = OL; ctx.lineWidth = 0.45; ctx.strokeRect(-5.6, sY, 2.6, 6.5); ctx.fillStyle = era === 'space' ? '#ffb84a' : '#39d4ff'; ctx.fillRect(-5.2, sY + 5.4, 1.8, 1.4); if (!lo && moving) glow(ctx, -4.3, sY + 7.6, 2.6, era === 'space' ? '255,180,80' : '90,220,255', 0.6); } // jetpack/backpack
  if ((era === 'modern' || era === 'industrial') && !worker && cls !== 'crew' && cls !== 'mounted') {
    ctx.fillStyle = era === 'modern' ? '#55603e' : '#6a5a3a'; ctx.fillRect(-5.8, sY + 0.6, 2.8, 5.4); ctx.strokeStyle = OL; ctx.lineWidth = 0.45; ctx.strokeRect(-5.8, sY + 0.6, 2.8, 5.4);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-5.8, sY + 3.4, 2.8, 0.6);
    if (era === 'industrial') { ell(ctx, -4.4, sY + 0.2, 2.2, 1.1, 0, '#7a6a52'); seg(ctx, -5.6, sY + 0.2, -3.2, sY + 0.2, 0.3, 'rgba(0,0,0,0.3)'); } // blanket roll
  }
  // ---- arm pose
  // back arm: shoulder (-2.4, sY); front arm: shoulder (2.4, sY)
  let backHand, frontHand, frontAng = null, frontR = null;
  const swing = moving ? step * 2.4 : 0;
  backHand = [-2.8 - swing * 0.7, sY + 6.2 + Math.abs(swing) * 0.15];
  frontHand = [2.6 + swing * 0.7, sY + 6 + Math.abs(swing) * 0.15];
  const twoHand = (gun(sprite) || sprite === 'crossbow') && !throwing;
  let recoil = 0;
  if (cls === 'crew') { backHand = [-1.6, sY + 4]; frontHand = [3.6, sY + 3.4 + Math.sin(act * TAU) * 1.2]; }
  else if (worker) {
    if (busy) {
      const r = o.res, build = o.state === 5;
      [frontR, frontAng] = pose(act, build ? POSE_W : r === 0 ? POSE_H : r === 2 || r === 3 || r === 4 ? POSE_X : POSE_W);
      backHand = !build && r === 0 ? [3.2, sY + 7] : [1.6, sY + 4.5];
    }
    else { frontR = -0.5 - step * 0.2 + breath * 0.1; frontAng = 0.2; }
  } else if (melee(sprite) || throwing) { if (busy) [frontR, frontAng] = pose(act, POSE_M); else { frontR = -0.5 - step * 0.3 + breath * 0.1; frontAng = 0.3; } }
  else if (polearm(sprite)) {
    const thrust = busy ? Math.max(0, Math.sin(Math.min(1, act / 0.5) * Math.PI)) * (sprite === 'lance' ? 3 : 4) : 0;
    frontHand = [3.2 + thrust, sY + 4.2]; backHand = [-0.4 + thrust * 0.8, sY + 4.6];
  } else if (bowish(sprite)) {
    const draw = busy ? (act < 0.75 ? act / 0.75 : 0) : 0;
    frontHand = busy ? [6.6, sY + 0.6] : [3.6 + swing * 0.3, sY + 5.6];
    backHand = busy ? [3.8 - draw * 4.6, sY + 0.8] : [-2.4 - swing * 0.6, sY + 6];
  } else if (twoHand) {
    recoil = busy && act < 0.18 ? (1 - act / 0.18) * 1.8 : 0;
    const aimY = sprite === 'bazooka' ? sY - 0.6 : sY + 2.2;
    frontHand = [5.6 - recoil, aimY + 0.6]; backHand = [1.4 - recoil, aimY + 1.4];
    if (!busy && (moving || idle) && sprite !== 'bazooka') { frontHand = [5, sY + 3.4 + breath * 0.3]; backHand = [0.8, sY + 4.6 + breath * 0.3]; } // port arms
  } else if (sprite === 'throw' || sprite === 'sling') {
    if (busy) [frontR, frontAng] = pose(act, POSE_M); else { frontR = -0.4 - step * 0.3; frontAng = 0; }
  }
  // sleeve / glove colours
  const armCol = worker ? body : fut ? '#c8d0da' : era === 'gunpowder' || era === 'industrial' ? tc : era === 'stone' ? skin : era === 'classical' || era === 'bronze' ? skin : sh(body, 0.95);
  const hand = worker ? (fut ? '#c8d0da' : skin) : fut ? '#8a96a8' : era === 'medieval' ? '#a8aeb6' : era === 'modern' ? '#3a3a30' : skin;
  const band = !worker && (era === 'stone' || era === 'iron' || era === 'modern');
  // back arm (behind torso)
  {
    const sx = -2.4, sy2 = sY;
    const ex = (sx + backHand[0]) / 2 - 0.6, ey = (sy2 + backHand[1]) / 2 + 0.4;
    limb(ctx, [sx, sy2], [ex, ey], backHand, 1.7, sh(armCol, 0.72));
    circ(ctx, backHand[0], backHand[1], 0.95, sh(hand, 0.8));
  }
  // ---- torso: tapered chest with a gradient from the light side
  const torso = () => { ctx.beginPath(); ctx.moveTo(-3.9, bodyY + 0.9); ctx.quadraticCurveTo(0, bodyY - 1.3, 3.9, bodyY + 0.9); ctx.quadraticCurveTo(4.4, bodyY + 4.6, 3.8, by); ctx.quadraticCurveTo(0, by + 0.9, -3.8, by); ctx.quadraticCurveTo(-4.4, bodyY + 4.6, -3.9, bodyY + 0.9); ctx.closePath(); };
  torso();
  ctx.fillStyle = grad(ctx, 'torso' + body, () => { const g = ctx.createLinearGradient(-4, 0, 4, 0); g.addColorStop(0, sh(body, 1.22)); g.addColorStop(0.55, sh(body, 0.95)); g.addColorStop(1, sh(body, 0.64)); return g; });
  ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.save(); torso(); ctx.clip();
  const cloth = worker || era === 'stone' || era === 'gunpowder' || era === 'industrial' || era === 'modern';
  if (worker) {
    if (era === 'stone') { for (let i = 0; i < 4; i++) circ(ctx, -2.4 + i * 1.6, bodyY + 3 + (i % 2) * 2.4, 0.8, 'rgba(60,36,16,0.45)'); seg(ctx, -4, bodyY + 1.2, 4, bodyY + 0.4, 0.8, '#d8c8a0'); }
    else if (era === 'modern') { ctx.fillStyle = '#e8e8e0'; ctx.fillRect(-5, bodyY + 4.2, 10, 0.9); ctx.fillRect(-5, bodyY + 6.4, 10, 0.9); ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(-0.3, bodyY, 0.6, 10); }
    else if (era === 'industrial') { if (Lk.garb % 2) { ctx.fillStyle = '#3a3428'; ctx.fillRect(-1.6, bodyY + 0.4, 5.6, 8); ctx.fillStyle = '#c8b070'; ctx.fillRect(0.2, bodyY + 2, 0.5, 0.5); ctx.fillRect(0.2, bodyY + 4, 0.5, 0.5); } else { seg(ctx, -2, bodyY, -2, by, 1, '#3a3020'); seg(ctx, 2, bodyY, 2, by, 1, '#3a3020'); } } // waistcoat or braces
    else if (fut) { ctx.fillStyle = era === 'space' ? '#ffb84a' : '#39d4ff'; ctx.fillRect(-4, bodyY + 4, 8, 0.8); ctx.fillStyle = 'rgba(40,50,60,0.25)'; ctx.fillRect(-4, bodyY + 1.4, 8, 0.5); }
    else { ctx.fillStyle = 'rgba(255,240,210,0.28)'; ctx.beginPath(); ctx.moveTo(-0.4, bodyY - 0.4); ctx.lineTo(2.2, bodyY - 0.4); ctx.lineTo(0.9, bodyY + 3); ctx.fill(); seg(ctx, 0.9, bodyY + 0.6, 1.4, bodyY + 1.2, 0.3, 'rgba(60,40,20,0.5)'); } // shirt opening with lacing
    if (Lk.garb === 0 && (era === 'medieval' || era === 'gunpowder' || era === 'industrial' || era === 'iron' || era === 'classical')) { ctx.fillStyle = '#7a5434'; ctx.fillRect(0.2, bodyY + 3.4, 5, 8); seg(ctx, 0.6, bodyY + 3.4, -0.8, bodyY - 0.6, 0.5, '#5a3a20'); } // leather apron bib
    ctx.strokeStyle = tc; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-3.6, bodyY + 1); ctx.lineTo(3.6, bodyY + 6); ctx.stroke(); // team sash
    if (!lo) { ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(-3.6, bodyY + 0.4); ctx.lineTo(3.6, bodyY + 5.4); ctx.stroke(); }
    ctx.fillStyle = sh(body, 0.5); ctx.fillRect(-4.5, by - 1.8, 9, 1.1);
  } else if (era === 'gunpowder' || era === 'industrial') {
    ctx.fillStyle = tc; ctx.fillRect(-5, bodyY - 2, 10, 12);
    ctx.fillStyle = sh(tc, 0.72); ctx.fillRect(1.6, bodyY - 2, 4, 12);
    if (era === 'gunpowder') {
      ctx.fillStyle = '#f0ece0'; ctx.fillRect(1.2, bodyY + 0.2, 1.4, by - bodyY - 1); // facings
      ctx.strokeStyle = '#f0ece0'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-3.5, bodyY); ctx.lineTo(3.5, by - 0.6); ctx.moveTo(3.5, bodyY); ctx.lineTo(-3.5, by - 0.6); ctx.stroke();
      ctx.fillStyle = '#ffe8a0'; for (let i = 0; i < 3; i++) ctx.fillRect(2.8, bodyY + 1.5 + i * 2, 0.8, 0.8);
      ctx.fillStyle = sh(tc, 0.5); ctx.fillRect(-4.6, bodyY - 0.5, 9, 1.1); // collar
      if (sprite === 'pike' || uid === 'arquebusier') { ctx.fillStyle = '#a4aab2'; ctx.fillRect(-3.4, bodyY + 0.6, 6.4, 5.6); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-2.6, bodyY + 1, 1.2, 4.6); seg(ctx, 0, bodyY + 0.8, 0, bodyY + 6, 0.4, 'rgba(0,0,0,0.3)'); } // breastplate
    } else { ctx.fillStyle = '#3a3020'; ctx.fillRect(-5, by - 2, 10, 1.2); ctx.fillStyle = '#4a4028'; ctx.fillRect(-3.6, by - 3.2, 1.8, 1.4); ctx.fillRect(1, by - 3.2, 1.8, 1.4); ctx.fillStyle = '#c8b070'; for (let i = 0; i < 3; i++) ctx.fillRect(0.6, bodyY + 1.2 + i * 1.8, 0.6, 0.6); seg(ctx, -3.6, bodyY, 3, by - 2, 0.8, '#3a3020'); }
  } else if (era === 'modern') {
    circ(ctx, -1.6, bodyY + 2.6, 1.4, 'rgba(40,50,26,0.65)'); circ(ctx, 2, bodyY + 5.4, 1.2, 'rgba(110,100,60,0.6)'); circ(ctx, -2.4, bodyY + 6.6, 1, 'rgba(30,34,20,0.6)');
    ctx.fillStyle = '#3e4a30'; ctx.fillRect(-3.6, bodyY + 3.6, 2.2, 2); ctx.fillRect(-1, bodyY + 3.6, 2.2, 2); ctx.fillRect(1.6, bodyY + 3.6, 2.2, 2); // pouches
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-3.6, bodyY + 3.6, 7.4, 0.5);
    ctx.fillStyle = '#2a2a1e'; ctx.fillRect(-5, by - 1.4, 10, 1.1);
  } else if (fut) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0.6, bodyY, 4, 10);
    ctx.strokeStyle = 'rgba(40,50,60,0.6)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(-4, bodyY + 3.6); ctx.lineTo(4, bodyY + 3.6); ctx.moveTo(0, bodyY); ctx.lineTo(0, by); ctx.stroke();
    ctx.fillStyle = era === 'space' ? '#ffb84a' : '#39d4ff'; ctx.fillRect(-4, bodyY + 5.6, 8, 0.8);
    ctx.fillStyle = tc; ctx.fillRect(-3.4, bodyY + 1, 2.4, 2.2);
    if (!lo) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-3.4, bodyY + 0.6, 1.4, 0.5); }
  } else {
    if (era === 'medieval') { ctx.fillStyle = 'rgba(255,255,255,0.16)'; for (let i = 0; i < 5; i++) ctx.fillRect(-4, bodyY + 1 + i * 1.8, 8, 0.45); }
    if (era === 'classical' || era === 'bronze') { // muscle cuirass highlights
      ctx.strokeStyle = 'rgba(90,60,10,0.55)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(-1.2, bodyY + 3, 1.6, 0.2, 2.8); ctx.arc(1.6, bodyY + 3, 1.6, 0.3, 2.9); ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,180,0.35)'; ctx.fillRect(-3, bodyY + 0.6, 1.5, 5);
    }
    if (era === 'iron' && !lo) { ctx.beginPath(); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const px = -3 + c * 2 + (r % 2), py = bodyY + 1.5 + r * 2; ctx.moveTo(px + 0.55, py); ctx.arc(px, py, 0.55, 0, TAU); } ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill(); }
    if (era === 'stone') { ctx.fillStyle = '#5a3a20'; ctx.beginPath(); for (let i = 0; i < 5; i++) { ctx.moveTo(-4.6 + i * 2, by); ctx.lineTo(-3.6 + i * 2, by + 2.4); ctx.lineTo(-2.6 + i * 2, by); } ctx.fill(); for (let i = 0; i < 3; i++) circ(ctx, -2 + i * 1.8, bodyY + 3 + (i % 2) * 2, 0.7, 'rgba(50,30,14,0.5)'); seg(ctx, -3.8, bodyY + 0.6, 3.6, bodyY + 6.4, 1, '#c8a878'); /* bone-bead strap */ }
    else {
      // tabard / chiton panel in team colour
      ctx.fillStyle = tc; ctx.beginPath(); ctx.moveTo(-1.9, bodyY); ctx.lineTo(1.9, bodyY); ctx.lineTo(2.3, by + 1.2); ctx.lineTo(-2.3, by + 1.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0.5, bodyY, 2, 10);
      if (era === 'medieval') { ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(-0.4, bodyY + 1.6, 0.8, 3.6); ctx.fillRect(-1.4, bodyY + 2.6, 2.8, 0.8); }
    }
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(-5, by - 1.8, 10, 1.1); // belt
    ctx.fillStyle = '#c8a048'; ctx.fillRect(-0.6, by - 1.9, 1.2, 1.3);
  }
  if (cloth && !lo && !fut) { // cloth folds
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.45; ctx.beginPath();
    ctx.moveTo(-1.8, by - 2.2); ctx.quadraticCurveTo(-1.2, by - 4, -1.6, by - 5.4); ctx.moveTo(1.4, by - 2); ctx.quadraticCurveTo(2.1, by - 3.6, 1.6, by - 5); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.moveTo(-2.6, bodyY + 1.4); ctx.quadraticCurveTo(-3.2, bodyY + 4, -2.8, by - 2); ctx.stroke();
  }
  ctx.restore();
  // below the waist: tunic hems, pteruges, mail skirts, coat tails, aprons
  if (!mounted) {
    const sk = step * 0.6;
    if (worker && !fut && era !== 'modern' && era !== 'industrial') {
      const hc = sh(body, 0.86);
      ctx.fillStyle = hc; ctx.beginPath(); ctx.moveTo(-3.8, by - 0.6); ctx.lineTo(3.8, by - 0.6); ctx.lineTo(4.2 + sk, by + 2.8); ctx.quadraticCurveTo(0, by + 3.4, -4.2 + sk, by + 2.8); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = OL; ctx.lineWidth = 0.55; ctx.stroke();
      if (!lo) { ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(-1.2, by); ctx.lineTo(-1.4 + sk, by + 3); ctx.moveTo(1.6, by); ctx.lineTo(1.8 + sk, by + 2.9); ctx.stroke(); }
      if (Lk.garb === 0 && era !== 'stone' && era !== 'bronze') { ctx.fillStyle = '#7a5434'; ctx.beginPath(); ctx.moveTo(0.4, by - 0.8); ctx.lineTo(4.4, by - 0.8); ctx.lineTo(4.8 + sk, by + 3.8); ctx.lineTo(1 + sk, by + 4); ctx.closePath(); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.45; ctx.stroke(); }
    } else if (!worker && (era === 'classical' || era === 'bronze' || era === 'iron')) {
      for (let i = 0; i < 5; i++) { const px = -3.6 + i * 1.7; ctx.fillStyle = i % 2 ? sh(tc, 0.8) : '#d8c8a0'; ctx.fillRect(px + sk * 0.3, by - 0.2, 1.5, 3); }
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(-3.6, by + 2.8); ctx.lineTo(4.9, by + 2.8); ctx.stroke();
    } else if (!worker && era === 'medieval') {
      ctx.fillStyle = '#8a9098'; ctx.beginPath(); ctx.moveTo(-4, by - 0.4); ctx.lineTo(4, by - 0.4); ctx.lineTo(4.4 + sk, by + 2.4); ctx.lineTo(-4.4 + sk, by + 2.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = tc; ctx.fillRect(-2 + sk * 0.5, by - 0.4, 4, 2.8);
    } else if (!worker && era === 'gunpowder') {
      ctx.fillStyle = sh(tc, 0.78); ctx.beginPath(); ctx.moveTo(-4, by - 0.6); ctx.lineTo(-4.8 + sk, by + 4); ctx.lineTo(-1.6 + sk, by + 3.6); ctx.lineTo(-0.6, by - 0.6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#f0ece0'; ctx.lineWidth = 0.45; ctx.stroke();
    }
  }
  // belt pouch
  if (!fut && !lo && cls !== 'crew' && (worker ? era !== 'stone' && era !== 'modern' : era !== 'stone')) { ctx.fillStyle = worker ? '#6a4a2a' : '#4a3420'; ctx.fillRect(2.4, by - 1.8, 1.8, 2.2); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(2.4, by - 1.8, 1.8, 0.6); }
  // pauldrons
  if (!lo && !worker && (era === 'medieval' || fut || sprite === 'greatsword' || sprite === 'sabre' || uid === 'arquebusier')) { ell(ctx, 2.6, sY + 0.2, 2, 1.5, 0.3, sh(fut ? body : '#a0a6ae', 1.1)); ctx.strokeStyle = OL; ctx.lineWidth = 0.5; ctx.stroke(); sheen(ctx, 1.8, sY - 0.6, 3.2, sY - 0.4, 0.4, 0.6); }
  // shield (team coloured) on the back arm
  const shk = shieldKind(sprite, era, cls);
  if (shk) drawShield(ctx, shk, tc, team | 0, -3.6, bodyY + 6.2, lo);
  // ---- head: neck, face, hair, beard, headgear
  const hx = 0.5 + lean * 0.4, hy = bodyY - 3.6;
  const helmeted = fut && !worker;
  if (!helmeted) {
    ctx.fillStyle = sh(skin, 0.8); ctx.fillRect(hx - 1.1, hy + 2, 2.2, 1.9);
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx, hy, 3, 0, TAU); ctx.fill();
    ctx.strokeStyle = OL; ctx.lineWidth = 0.7; ctx.stroke();
    if (!lo) { ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.beginPath(); ctx.arc(hx + 0.9, hy + 0.3, 2.4, -0.9, 1.6); ctx.fill(); ell(ctx, hx - 0.6, hy + 0.3, 0.7, 1, 0, sh(skin, 0.82)); }
    if (lookAt) { ctx.fillStyle = '#1a120c'; ctx.fillRect(hx - 0.3, hy - 0.7, 0.8, 0.8); ctx.fillRect(hx + 1.5, hy - 0.7, 0.8, 0.8); }
    else {
      ctx.fillStyle = '#1a120c'; ctx.fillRect(hx + 1.4, hy - 0.7, 0.9, 0.9);
      if (!lo) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(hx + 2.3, hy - 0.7, 0.4, 0.5); ctx.fillStyle = sh(skin, 0.8); ctx.fillRect(hx + 2.6, hy - 0.1, 0.8, 1); }
    }
    if (!lo) { seg(ctx, hx + 0.9, hy - 1.6, hx + 2.5, hy - 1.75, 0.45, sh(Lk.hair, 0.8)); seg(ctx, hx + 1.5, hy + 1.35, hx + 2.3, hy + 1.25, 0.35, 'rgba(110,50,40,0.75)'); }
    const beardOk = Lk.style !== 3 && Lk.style !== 1 && !(worker && Lk.hat === 0 && (era === 'bronze' || era === 'medieval'));
    if (!lo && beardOk && Lk.beard && (era !== 'modern' || worker) && sprite !== 'greatsword') {
      if (Lk.beard === 1) { ctx.fillStyle = 'rgba(40,28,18,0.28)'; ctx.beginPath(); ctx.arc(hx + 0.6, hy + 0.6, 2.6, 0.05, 2.5); ctx.fill(); }
      else if (Lk.beard === 2) { ctx.fillStyle = Lk.hair; ctx.beginPath(); ctx.arc(hx + 0.6, hy + 1.2, 2.4, 0.1, 2.4); ctx.fill(); }
      else { ctx.fillStyle = Lk.hair; ctx.fillRect(hx + 1.4, hy + 0.7, 1.7, 0.6); }
    }
  }
  if (worker) { hair(ctx, Lk, hx, hy); workerHat(ctx, era, Lk, tc, hx, hy); }
  else if (cls !== 'crew') {
    if (era === 'stone' || (sprite === 'bow' && era !== 'iron')) hair(ctx, Lk, hx, hy);
    headgear(ctx, era, sprite, uid, tc, hx, hy, skin, lo, tt);
  } else hair(ctx, Lk, hx, hy);
  if (cls === 'crew') { // rower: front arm only
    limb(ctx, [2.4, sY], [3.6, sY + 2.4], frontHand, 1.7, armCol); circ(ctx, frontHand[0], frontHand[1], 1, skin);
    ctx.restore(); ctx.restore(); return;
  }
  // ---- front arm + weapon / tool
  if (frontAng !== null) {
    // rotate the forearm and the held item around the shoulder
    ctx.save(); ctx.translate(2.4, sY);
    const r = frontR;
    ctx.rotate(r);
    const hp = [0.4, 6];
    ctx.save(); ctx.translate(hp[0], hp[1]); ctx.rotate(frontAng - r);
    if (worker) tool(ctx, o.res ?? carry, o.state, era, busy, act);
    else if (throwing) { if (act < 0.62) { circ(ctx, 0, -1.6, 1.5, '#1e1e1e'); circ(ctx, -0.4, -2, 0.5, 'rgba(255,255,255,0.35)'); seg(ctx, 0.6, -2.8, 1.2, -3.8, 0.4, '#8a6a44'); circ(ctx, 1.3, -4, 0.5, ((tt * 20) | 0) % 2 ? '#fff6a0' : '#ff8a2a'); } }
    else if (sprite === 'throw' || sprite === 'sling') {
      if (sprite === 'sling') {
        if (busy && act < 0.45) { const a = tt * 24 + id; ctx.strokeStyle = 'rgba(140,110,70,0.35)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(0, -2, 5, 2.2, 0, 0, TAU); ctx.stroke(); const px = Math.cos(a) * 5, py = -2 + Math.sin(a) * 2.2; seg(ctx, 0, 0, px, py, 0.5, '#8a6a44'); circ(ctx, px, py, 1.1, '#888'); }
        else { seg(ctx, 0, 0, 0, 5, 0.6, '#8a6a44'); ell(ctx, 0, 5.4, 1, 1.3, 0, '#7a5a3a'); if (!busy || act > 0.75) circ(ctx, 0, 5.4, 0.8, '#999'); }
      } else if (!busy || act < 0.7) { circ(ctx, 0, -1.6, 1.6, '#8a8680'); circ(ctx, -0.5, -2.1, 0.5, '#c8c4bc'); }
    } else weapon(ctx, sprite, era, uid, busy, tt, lo);
    ctx.restore();
    limb(ctx, [0, 0], [0.9, 3], hp, 1.7, armCol);
    if (band) seg(ctx, 0.25, 1, 0.55, 2.1, 2, tc);
    circ(ctx, hp[0], hp[1], 1.1, hand);
    ctx.restore();
    // swing trail at the strike
    if (!lo && busy && melee(sprite) && act > 0.42 && act < 0.66) {
      const k = (act - 0.42) / 0.24;
      const R0 = sprite === 'greatsword' ? 15 : 12, a1 = -1.7 + k * 2.6, a0 = Math.max(-1.7, a1 - 1.3);
      ctx.fillStyle = sprite === 'templar' ? `rgba(140,250,255,${0.6 * (1 - Math.abs(k - 0.5) * 1.6)})` : `rgba(255,255,240,${0.5 * (1 - Math.abs(k - 0.5) * 1.6)})`;
      ctx.beginPath(); ctx.arc(2.4, sY + 2, R0, a0, a1); ctx.arc(2.4, sY + 2, R0 - 3.5, a1, a0, true); ctx.closePath(); ctx.fill();
    }
  } else {
    // posed hands: polearm, bow, guns
    if (polearm(sprite)) {
      const lance = sprite === 'lance';
      const L = sprite === 'pike' ? 30 : lance ? 27 : 19;
      const up = busy ? (lance ? 0.06 : 0.18) : moving ? (lance ? -0.45 : -0.9) : (lance ? -1.25 : -1.1);
      const c = Math.cos(up), s = Math.sin(up);
      const bx = backHand[0], byy = backHand[1];
      const tail = [bx - c * L * 0.3, byy - s * L * 0.3], tip = [bx + c * L * 0.7, byy + s * L * 0.7];
      seg(ctx, tail[0], tail[1], tip[0], tip[1], 2, OL); seg(ctx, tail[0], tail[1], tip[0], tip[1], 1.3, lance && era === 'medieval' ? sh(tc, 1.2) : '#7a5a34');
      if (!lo) seg(ctx, tail[0] - s * 0.3, tail[1] + c * 0.3 - 0.3, tip[0] - s * 0.3, tip[1] - 0.3, 0.35, 'rgba(255,240,210,0.35)');
      const head = era === 'stone' ? '#8a8680' : era === 'bronze' || era === 'classical' ? '#d0a050' : '#d4d8de';
      const hl = sprite === 'pike' ? 6.5 : lance ? 4.5 : era === 'stone' ? 4.6 : 5.2, hw = sprite === 'pike' ? 1 : era === 'stone' ? 1.8 : 1.6;
      ctx.fillStyle = head; ctx.beginPath(); ctx.moveTo(tip[0] - s * hw, tip[1] + c * hw); ctx.quadraticCurveTo(tip[0] + c * hl * 0.45 - s * hw * 1.1, tip[1] + s * hl * 0.45 + c * hw * 1.1, tip[0] + c * hl, tip[1] + s * hl); ctx.quadraticCurveTo(tip[0] + c * hl * 0.45 + s * hw * 1.1, tip[1] + s * hl * 0.45 - c * hw * 1.1, tip[0] + s * hw, tip[1] - c * hw); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = OL; ctx.lineWidth = 0.4; ctx.stroke();
      if (era !== 'stone') sheen(ctx, tip[0] + c * 0.6, tip[1] + s * 0.6 - 0.3, tip[0] + c * hl * 0.8, tip[1] + s * hl * 0.8 - 0.2, 0.35, 0.7);
      else { seg(ctx, tip[0] - c * 1.4 - s, tip[1] - s * 1.4 + c, tip[0] - c * 0.2 + s, tip[1] - s * 0.2 - c, 0.6, '#c8a878'); }
      if (sprite === 'hoplite') { ctx.fillStyle = '#c8a048'; ctx.beginPath(); ctx.moveTo(tail[0] - s * 0.8, tail[1] + c * 0.8); ctx.lineTo(tail[0] - c * 3, tail[1] - s * 3); ctx.lineTo(tail[0] + s * 0.8, tail[1] - c * 0.8); ctx.fill(); } // sauroter
      if (sprite === 'pike') { seg(ctx, tip[0] - c * 0.5 - s * 1.3, tip[1] - s * 0.5 + c * 1.3, tip[0] - c * 0.5 + s * 1.3, tip[1] - s * 0.5 - c * 1.3, 0.7, '#333'); ctx.fillStyle = tc; ctx.beginPath(); ctx.arc(tip[0] - c * 1.6, tip[1] - s * 1.6 + 0.8, 0.9, 0, TAU); ctx.fill(); }
      if (lance) {
        if (era === 'medieval') { const vx = bx + c * 3.6, vy = byy + s * 3.6; ctx.fillStyle = '#a8aeb6'; ctx.beginPath(); ctx.moveTo(vx - s * 2.2, vy + c * 2.2); ctx.lineTo(vx + c * 3, vy + s * 3); ctx.lineTo(vx + s * 2.2, vy - c * 2.2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.4; ctx.stroke(); } // vamplate
        if (era !== 'classical') { // swallow-tail pennon behind the tip
          const px = tip[0] - c * 2.4, py = tip[1] - s * 2.4, fl = Math.sin(tt * 7 + id) * 0.8 + (moving ? 1 : 0);
          ctx.fillStyle = tc; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - c * 5.5 + s * 0.2, py - s * 5.5 - 2.4 + fl * 0.3); ctx.lineTo(px - c * 4 - s * 0.2, py - s * 4 - 1.3 + fl * 0.5); ctx.lineTo(px - c * 5.5, py - s * 5.5 - 0.4 + fl * 0.6); ctx.lineTo(px - c * 0.2, py - s * 0.2 - 2.2 * 0 + 0.1); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.35; ctx.stroke();
        }
      }
      frontHand = [bx + c * 4, byy + s * 4];
    } else if (bowish(sprite)) {
      const comp = uid === 'composite_archer' || (!uid && era === 'bronze');
      const Lb = sprite === 'longbow' ? 13.5 : comp ? 9 : 10;
      const [fx, fy] = frontHand;
      const draw = busy ? (act < 0.75 ? act / 0.75 : 0) : 0;
      const tilt = busy ? 0 : -0.5;
      ctx.save(); ctx.translate(fx, fy); ctx.rotate(tilt);
      const k = draw * 0.9, ty0 = -Lb / 2, ty1 = Lb / 2, tx = -1.2 - k;
      const wood = sprite === 'longbow' ? '#a8804a' : comp ? '#4a2a14' : '#6a3c1c';
      ctx.beginPath();
      if (comp) { ctx.moveTo(-0.2 - k, ty0 - 1.2); ctx.quadraticCurveTo(-1.8 - k, ty0 - 0.2, tx, ty0 + 1.2); ctx.quadraticCurveTo(2.4 + draw, -1.6, 0.4, 0); ctx.quadraticCurveTo(2.4 + draw, 1.6, tx, ty1 - 1.2); ctx.quadraticCurveTo(-1.8 - k, ty1 + 0.2, -0.2 - k, ty1 + 1.2); }
      else { ctx.moveTo(tx, ty0); ctx.quadraticCurveTo(2.8 + draw, 0, tx, ty1); }
      ctx.strokeStyle = OL; ctx.lineWidth = 2.2; ctx.stroke(); ctx.strokeStyle = wood; ctx.lineWidth = 1.4; ctx.stroke();
      if (comp && !lo) { ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(tx + 0.2, ty0 + 1.6); ctx.quadraticCurveTo(1.8 + draw, -1.4, 0.6, -0.6); ctx.stroke(); } // horn belly
      if (sprite === 'longbow' && !lo) { ctx.strokeStyle = 'rgba(255,240,200,0.45)'; ctx.lineWidth = 0.45; ctx.beginPath(); ctx.moveTo(tx + 0.3, ty0 + 1); ctx.quadraticCurveTo(2 + draw, 0, tx + 0.3, ty1 - 1); ctx.stroke(); }
      ctx.fillStyle = '#d8c8a0'; ctx.fillRect(0, -0.9, 1, 1.8); // grip
      const sx = busy ? backHand[0] - fx : tx, ay = comp ? 1.2 : 0;
      ctx.strokeStyle = 'rgba(235,235,225,0.9)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(tx, ty0 + ay); ctx.lineTo(Math.min(tx, sx), busy ? backHand[1] - fy : 0); ctx.lineTo(tx, ty1 - ay); ctx.stroke();
      if (busy && act < 0.75) { seg(ctx, sx, backHand[1] - fy, 3.4, 0, 0.7, '#d8c8a0'); ctx.fillStyle = era === 'stone' || era === 'bronze' ? '#a8a098' : '#ccd0d4'; ctx.beginPath(); ctx.moveTo(3.2, -0.9); ctx.lineTo(5.4, 0); ctx.lineTo(3.2, 0.9); ctx.fill(); ctx.fillStyle = '#b83a2a'; ctx.fillRect(sx - 0.2, backHand[1] - fy - 0.7, 1.8, 1.4); }
      ctx.restore();
    } else if (twoHand) {
      const [fx, fy] = frontHand, [bx, byy] = backHand;
      const ang = Math.atan2(fy - byy, fx - bx);
      ctx.save(); ctx.translate(bx, byy); ctx.rotate(ang);
      const mz = firearm(ctx, sprite, uid, era, busy, act, tt, lo, mounted);
      // muzzle flash right after the shot
      if (busy && act < 0.08 && sprite !== 'crossbow') {
        const fc = sprite === 'plasma' || sprite === 'marine' ? (uid === 'ion_lancer' ? '180,150,255' : '255,140,240') : sprite === 'railgun' || sprite === 'exo' ? '140,240,255' : '255,220,120';
        const g2 = ctx.createRadialGradient(mz, 0, 0, mz, 0, 5); g2.addColorStop(0, 'rgba(255,255,240,0.95)'); g2.addColorStop(0.4, `rgba(${fc},0.8)`); g2.addColorStop(1, `rgba(${fc},0)`);
        ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(mz, 0, 5, 0, TAU); ctx.fill();
        if (fc === '255,220,120') { ctx.fillStyle = 'rgba(255,240,180,0.9)'; ctx.beginPath(); ctx.moveTo(mz, -0.6); ctx.lineTo(mz + 4.6, 0); ctx.lineTo(mz, 0.6); ctx.fill(); }
      }
      ctx.restore();
    }
    // front arm to the posed hand
    const [fx, fy] = frontHand;
    const ex = (2.4 + fx) / 2 + 0.2, ey = (sY + fy) / 2 + 1.4;
    limb(ctx, [2.4, sY], [ex, ey], [fx, fy], 1.7, armCol);
    if (band) seg(ctx, 2.4 + (ex - 2.4) * 0.45, sY + (ey - sY) * 0.45 - 0.3, 2.4 + (ex - 2.4) * 0.8, sY + (ey - sY) * 0.8 - 0.3, 2, tc);
    circ(ctx, fx, fy, 1.1, hand);
  }
  ctx.restore();
  ctx.restore();
}

// ------------------------------------------------------------- animals
// side-on quadruped facing +x; articulated legs with a walk/trot gait
// a pair of legs (front and back) batched into one path per colour
function legs(ctx, a, b, moving, len, w, col, hoof) {
  const pts = [a, b].map(([hipX, hipY, ph, back]) => {
    const sw = moving ? Math.sin(ph) : 0, lift = moving ? Math.max(0, Math.cos(ph)) : 0;
    const fx = hipX + sw * len * 0.42, fy = -lift * len * 0.22;
    const kx = hipX + sw * len * 0.18 + (back ? -1 : 1) * len * 0.12 * (0.4 + lift), ky = hipY + (fy - hipY) * 0.5 - lift * len * 0.1;
    return [hipX, hipY, kx, ky, fx, fy];
  });
  ctx.beginPath();
  for (const [hx, hy, kx, ky, fx, fy] of pts) { ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy - 0.6); }
  ctx.strokeStyle = OL; ctx.lineWidth = w + 1.1; ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  ctx.beginPath();
  for (const p of pts) { ctx.moveTo(p[4], p[5] - 1.1); ctx.lineTo(p[4] + 0.6, p[5]); }
  ctx.strokeStyle = hoof; ctx.lineWidth = w + 0.3; ctx.stroke();
}

export function quadruped(ctx, o, col, sc, kind) {
  const moving = o.walk > 0;
  const ph = o.walk * TAU, t = o.t || 0, id = o.id || 0, lo = !!o.lod;
  ctx.save(); ctx.scale(sc, sc);
  if (!o.noShadow) contactShadow(ctx, 1, 0, 11, 3.6, 0.3);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const horse = kind === 'horse', deer = kind === 'deer', boar = kind === 'boar', mam = kind === 'mammoth';
  const H = horse ? 8.5 : boar ? 5.5 : mam ? 7 : 8; // leg length
  const bob = moving ? Math.abs(Math.sin(ph)) * 0.8 : 0;
  const by = -H - 2.5 - bob;
  const dark = sh(col, 0.62), hoof = horse ? '#2a2018' : '#3a2a20';
  // grazing / rooting: wild animals lower the head now and then while idle
  const gz = !moving && !horse && !mam ? Math.max(0, Math.min(1, (Math.sin(t * 0.45 + id * 1.7) - 0.15) * 2.4)) : 0;
  const lw = deer ? 1.4 : mam ? 3.2 : 1.8; // leg thickness
  // far legs
  legs(ctx, [-6.5, by + 1.5, ph + Math.PI * 0.5, true], [5.5, by + 1.5, ph + Math.PI * 1.5, false], moving, H, lw, dark, hoof);
  // tail
  const tw = moving ? Math.sin(ph * 2) * 1.2 : Math.sin(t * 1.7 + id) * 0.8;
  if (horse) { ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-9, by - 0.5); ctx.quadraticCurveTo(-13 - tw, by + 3, -11.5 - tw, by + 9); ctx.stroke(); }
  else if (deer) { ctx.fillStyle = '#f4eee0'; ctx.beginPath(); ctx.ellipse(-9.6, by - 1.4 - Math.max(0, tw) * 0.6, 1, 1.8, -0.5, 0, TAU); ctx.fill(); ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(-9.3, by - 2.4 - Math.max(0, tw) * 0.6, 0.7, 1.1, -0.5, 0, TAU); ctx.fill(); }
  else if (boar) { ctx.strokeStyle = dark; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-8.5, by - 1); ctx.quadraticCurveTo(-10.6, by - 0.4 + tw, -10.2, by + 3); ctx.stroke(); ell(ctx, -10.2, by + 3.4, 0.7, 1.1, 0, '#2a1e18'); }
  else { ctx.strokeStyle = dark; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-8.5, by); ctx.quadraticCurveTo(-11, by + 1 + tw, -10.5, by + 4); ctx.stroke(); }
  // body: barrel + chest + rump (boar: high shoulders; deer: slim; mammoth: shoulder hump)
  const g = grad(ctx, 'quad' + col, () => { const g = ctx.createLinearGradient(0, -5, 0, 4.5); g.addColorStop(0, sh(col, 1.25)); g.addColorStop(0.6, col); g.addColorStop(1, sh(col, 0.68)); return g; });
  ctx.beginPath();
  if (deer) { ctx.ellipse(0, by + 0.4, 8.6, 3.7, 0, 0, TAU); ctx.moveTo(-3.4, by); ctx.ellipse(-6.4, by - 0.4, 3.6, 3.9, 0, 0, TAU); ctx.moveTo(9.6, by); ctx.ellipse(5.8, by + 0.2, 3.8, 4.2, 0, 0, TAU); }
  else if (boar) { ctx.ellipse(-0.6, by + 0.6, 8.6, 4.4, 0, 0, TAU); ctx.moveTo(-4, by); ctx.ellipse(-6, by + 0.6, 3.8, 4, 0, 0, TAU); ctx.moveTo(11, by); ctx.ellipse(5.6, by - 0.6, 5.2, 5.4, 0, 0, TAU); }
  else if (mam) { ctx.ellipse(0, by + 0.2, 9.4, 5, 0, 0, TAU); ctx.moveTo(-3.2, by); ctx.ellipse(-6.6, by + 0.6, 4, 4.6, 0, 0, TAU); ctx.moveTo(11, by - 1); ctx.ellipse(5.4, by - 1.6, 5.4, 6, 0, 0, TAU); }
  else { ctx.ellipse(0, by + 0.2, 9, 4.4, 0, 0, TAU); ctx.moveTo(-4, by); ctx.ellipse(-6.2, by - 0.2, 4.2, 4.6, 0, 0, TAU); ctx.moveTo(10, by); ctx.ellipse(5.8, by + 0.2, 4.4, 4.8, 0, 0, TAU); }
  ctx.strokeStyle = OL; ctx.lineWidth = 1.4; ctx.stroke(); fillAt(ctx, 0, by, g);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(-1, by - 2.6, 6.5, 1.2, 0, 0, TAU); ctx.fill();
  if (deer) { // pale belly, dark dorsal line, white rump and dapples
    ctx.fillStyle = 'rgba(255,244,224,0.45)'; ctx.beginPath(); ctx.ellipse(0.4, by + 2.6, 7, 1.3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(250,246,236,0.8)'; ctx.beginPath(); ctx.ellipse(-8.4, by - 0.4, 1.5, 2.2, 0, 0, TAU); ctx.fill();
    if (!lo) { seg(ctx, -7, by - 3.4, 5, by - 3.6, 0.7, 'rgba(60,34,16,0.35)'); ctx.beginPath(); for (let i = 0; i < 5; i++) { const sx = -4 + i * 2, sy = by - 1.6 + (i % 2) * 0.8; ctx.moveTo(sx + 0.45, sy); ctx.arc(sx, sy, 0.45, 0, TAU); } ctx.fillStyle = 'rgba(255,250,230,0.55)'; ctx.fill(); }
  } else if (boar) { // bristled ridge and a darker underside
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0, by + 3, 7.4, 1.5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = sh(col, 0.45); ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < (lo ? 5 : 9); i++) { const k = i / (lo ? 4 : 8), bx = -6 + k * 13, ry = by - 4.2 - Math.sin(k * Math.PI) * 1.6 - (k > 0.6 ? 0.8 : 0); ctx.moveTo(bx, ry + 1.2); ctx.lineTo(bx + 0.5, ry - 1.2 - (i % 2) * 0.6); } ctx.stroke();
  } else if (mam) { // shaggy coat: hanging fringe in two tones over the belly and legs
    const sw = moving ? Math.sin(ph * 2) * 0.5 : Math.sin(t * 0.9 + id) * 0.25;
    ctx.fillStyle = sh(col, 0.72); ctx.beginPath(); ctx.moveTo(-10.4, by); for (let i = 0; i <= 12; i++) { const fx = -10.4 + i * 1.9, fy = by + 4.6 + (i % 2 ? 2.2 : 1) + (i > 3 && i < 10 ? 1 : 0); ctx.lineTo(fx + sw, fy); } ctx.lineTo(12, by - 1); ctx.closePath(); ctx.fill();
    if (!lo) { ctx.strokeStyle = 'rgba(30,18,8,0.5)'; ctx.lineWidth = 0.6; ctx.beginPath(); for (let i = 0; i < 14; i++) { const fx = -9.6 + i * 1.6; ctx.moveTo(fx, by + 1 + (i % 3)); ctx.lineTo(fx - 0.3 + sw, by + 5.6 + (i % 3) * 0.7); } ctx.stroke(); ctx.strokeStyle = 'rgba(255,220,170,0.22)'; ctx.beginPath(); for (let i = 0; i < 7; i++) { const fx = -7 + i * 2.6; ctx.moveTo(fx, by - 4); ctx.quadraticCurveTo(fx + 0.8, by - 2, fx + 0.2, by); } ctx.stroke(); }
  }
  // neck & head
  const nod = moving ? Math.sin(ph * 2) * (deer ? 0.9 : 0.6) : Math.sin(t * 0.8 + id) * 0.4;
  let headX, headY;
  if (boar) {
    const dn = gz * 3.2 + (gz > 0.9 ? Math.abs(Math.sin(t * 6 + id)) * 0.6 : 0); // rooting
    headX = 11; headY = by + 1.2 + nod + dn;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(7, by - 3.6); ctx.quadraticCurveTo(11, by - 3, 14.2, headY - 0.6); ctx.lineTo(14.2, headY + 2); ctx.quadraticCurveTo(11, headY + 3.4, 7.5, by + 3.6); ctx.closePath(); ctx.strokeStyle = OL; ctx.lineWidth = 1; ctx.stroke(); ctx.fill();
    ell(ctx, 14.4, headY + 0.7, 1.1, 1.5, 0, '#7a5050'); circ(ctx, 14.7, headY + 0.4, 0.3, '#2a1a1a'); circ(ctx, 14.7, headY + 1.1, 0.3, '#2a1a1a'); // snout disc
    ctx.strokeStyle = OL; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(12.6, headY + 1.9); ctx.quadraticCurveTo(15, headY + 1.4, 14.4, headY - 1.4); ctx.stroke();
    ctx.strokeStyle = '#f4ecdc'; ctx.lineWidth = 1; ctx.stroke(); // tusk
    ctx.fillStyle = sh(col, 0.75); ctx.beginPath(); ctx.moveTo(9, by - 3); ctx.lineTo(8.4, by - 5.6); ctx.lineTo(10.4, by - 3.2); ctx.fill(); // ear
    circ(ctx, 11, headY - 1.2, 0.6, '#111'); if (!lo) circ(ctx, 11.2, headY - 1.4, 0.2, 'rgba(255,255,255,0.8)');
  } else if (mam) { // domed skull, small ear, long curved tusks and a swaying trunk
    const hx = 11.6, hy = by - 5 + nod * 0.6; headX = hx; headY = hy;
    const tr = Math.sin(t * 1.3 + id) * 0.8 + (moving ? Math.sin(ph * 2) * 0.6 : 0);
    ctx.strokeStyle = sh(col, 1.05); ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(hx + 0.8, hy + 4.4); ctx.quadraticCurveTo(hx + 8.6, hy + 9, hx + 2.6, hy + 10.6); ctx.stroke(); // far tusk
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(hx, hy, 4.4, 5, -0.2, 0, TAU); ctx.moveTo(hx + 2, hy - 4); ctx.ellipse(hx - 0.6, hy - 3.6, 3, 2.8, 0, 0, TAU); ctx.strokeStyle = OL; ctx.lineWidth = 1.1; ctx.stroke(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.ellipse(hx - 1.2, hy - 4.4, 2, 1, -0.3, 0, TAU); ctx.fill();
    ell(ctx, hx - 2.6, hy + 0.4, 1.8, 2.4, 0.2, sh(col, 0.75)); // ear
    ctx.strokeStyle = OL; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(hx + 2.6, hy + 1.6); ctx.quadraticCurveTo(hx + 5.6 + tr, hy + 6, hx + 4 + tr * 1.4, hy + 11); ctx.quadraticCurveTo(hx + 3.4 + tr, hy + 12.4, hx + 4.6 + tr * 1.2, hy + 12.6); ctx.stroke();
    ctx.strokeStyle = sh(col, 0.9); ctx.lineWidth = 2.4; ctx.stroke(); // trunk
    if (!lo) { ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.4; ctx.beginPath(); for (let i = 1; i < 5; i++) { const k = i / 5, tx = hx + 2.6 + (3 + tr) * k * 1.1, ty = hy + 1.6 + 9.4 * k; ctx.moveTo(tx - 1, ty); ctx.lineTo(tx + 1, ty - 0.2); } ctx.stroke(); }
    ctx.strokeStyle = OL; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(hx + 1.6, hy + 3.2); ctx.quadraticCurveTo(hx + 10.6, hy + 8, hx + 5.6, hy + 9.6); ctx.stroke();
    ctx.strokeStyle = '#f2e8d2'; ctx.lineWidth = 1.7; ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(hx + 3, hy + 3.6); ctx.quadraticCurveTo(hx + 9.6, hy + 7, hx + 6.6, hy + 8.8); ctx.stroke(); // near tusk
    circ(ctx, hx + 1.4, hy - 0.8, 0.65, '#111'); if (!lo) circ(ctx, hx + 1.6, hy - 1, 0.22, 'rgba(255,255,255,0.8)');
  } else {
    const nx = horse ? 9.5 : 9, hx0 = horse ? 14 : 12.5, hy0 = by - (horse ? 9 : 8.4) + nod;
    const hx = hx0 - gz * 1, hy = hy0 + gz * (H + 2.2 + by + 8.4) * 0.92; // lowered to the grass when grazing
    headX = hx; headY = hy;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(5.5, by - 3.5); ctx.quadraticCurveTo(nx, by - 7 + gz * 6, hx - 1.5, hy - 1.2); ctx.lineTo(hx + 0.5, hy + 1.8); ctx.quadraticCurveTo(nx + 1, by - 1 + gz * 4, 8.5, by + 3); ctx.closePath();
    ctx.strokeStyle = OL; ctx.lineWidth = 1; ctx.stroke(); ctx.fill();
    if (deer) { ctx.fillStyle = 'rgba(255,244,224,0.5)'; ctx.beginPath(); ctx.moveTo(8.6, by + 2); ctx.quadraticCurveTo(nx + 1.2, by - 1.6 + gz * 4, hx + 0.2, hy + 1.4); ctx.lineTo(hx - 0.6, hy + 0.6); ctx.quadraticCurveTo(nx, by - 1 + gz * 4, 7.6, by + 1.6); ctx.fill(); } // throat
    // head: elongated with muzzle
    ctx.save(); ctx.translate(hx, hy); ctx.rotate((horse ? 0.75 : 0.45) + gz * 0.9);
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(1.6, 0, horse ? 4.4 : 3.6, horse ? 1.9 : deer ? 1.6 : 1.8, 0, 0, TAU); ctx.strokeStyle = OL; ctx.lineWidth = 0.9; ctx.stroke(); ctx.fill();
    ell(ctx, horse ? 5 : 4.6, 0.3, horse ? 1.3 : 1, horse ? 1.3 : 1, 0, deer ? '#2a1e18' : sh(col, 0.7));
    if (horse && (id % 3 === 0) && !lo) seg(ctx, 0.6, -1.4, 4.2, -0.6, 0.8, 'rgba(250,246,236,0.85)'); // blaze
    circ(ctx, 0.4, -0.7, 0.55, '#111'); if (!lo) circ(ctx, 0.55, -0.85, 0.18, 'rgba(255,255,255,0.8)');
    ctx.fillStyle = sh(col, 0.8); ctx.beginPath();
    if (deer) { const ew = Math.sin(t * 2.3 + id * 3) > 0.9 ? 0.6 : 0; ctx.ellipse(-1.6, -2.2 - ew, 0.9, 2, -0.7 - ew, 0, TAU); } // big flicking ears
    else { ctx.moveTo(-1.6, -1.4); ctx.lineTo(-2.6, -3.6); ctx.lineTo(-0.6, -1.8); }
    ctx.fill();
    if (deer && (id % 2 === 0)) { // stag: branching antlers (far one darker)
      for (const [ox, c] of [[1.2, '#a8987a'], [0, '#e0d2b0']]) {
        ctx.strokeStyle = OL; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-0.6 + ox, -1.4); ctx.quadraticCurveTo(-3 + ox, -5, -1.4 + ox, -8.6); ctx.moveTo(-1.8 + ox, -4.4); ctx.lineTo(0.6 + ox, -5.6); ctx.moveTo(-2.1 + ox, -6.4); ctx.lineTo(-4.4 + ox, -7.6); ctx.moveTo(-1.6 + ox, -7.4); ctx.lineTo(0.2 + ox, -9.4);
        ctx.stroke(); ctx.strokeStyle = c; ctx.lineWidth = 0.75; ctx.stroke();
      }
    }
    ctx.restore();
    if (horse) { // mane
      ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(5.5, by - 4); ctx.quadraticCurveTo(nx - 0.6, by - 7.8, hx - 1.8, hy - 1.8); ctx.stroke();
      if (!lo) { ctx.lineWidth = 0.8; ctx.beginPath(); for (let i = 0; i < 4; i++) { const k = i / 4, mx = 5.8 + (hx - 7.5) * k, my = by - 4.4 - (by - 4.4 - hy) * k * 0.9; ctx.moveTo(mx, my); ctx.lineTo(mx - 1.4, my + 1.2 + (moving ? Math.sin(ph * 2 + i) * 0.6 : 0)); } ctx.stroke(); }
    }
  }
  // near legs
  legs(ctx, [-5, by + 2, ph + Math.PI * 1.5, true], [7, by + 2, ph + Math.PI * 0.5, false], moving, H, lw + 0.3, col, hoof);
  if (mam && !lo) { ctx.fillStyle = sh(col, 0.6); for (const lx of [-5, 7]) { ctx.beginPath(); ctx.ellipse(lx + 0.2, by + 6.2, 2.4, 2.6, 0, 0, Math.PI); ctx.fill(); } } // fur over the near legs
  ctx.restore();
  return { by: by * sc, headX: headX * sc, headY: headY * sc };
}

// horse with tack; returns saddle height for the rider
function horseWithTack(ctx, o, col, sc, team, barding, era) {
  const r = quadruped(ctx, o, col, sc, 'horse');
  const tc = TEAM[team] || '#bbb';
  const by = r.by;
  ctx.save(); ctx.scale(sc, sc);
  const b = by / sc;
  if (barding) { // caparison in team colour
    ctx.fillStyle = tc; ctx.beginPath(); ctx.moveTo(-10, b - 2.5); ctx.lineTo(9, b - 3.5); ctx.lineTo(10.5, b + 5); ctx.quadraticCurveTo(0, b + 7.2, -11, b + 5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OL; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(2, b - 3, 8, 9);
    ctx.strokeStyle = '#e8d8a0'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-10.6, b + 4.4); ctx.quadraticCurveTo(0, b + 6.6, 10.2, b + 4.4); ctx.stroke();
    if (era === 'medieval') { ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.arc(r.headX / sc - 0.2, r.headY / sc + 0.4, 2.2, 0, TAU); ctx.fill(); }
  } else {
    ctx.fillStyle = tc; ctx.beginPath(); ctx.moveTo(-4.5, b - 3.8); ctx.lineTo(3, b - 4); ctx.lineTo(3.5, b + 1.5); ctx.lineTo(-5, b + 1.5); ctx.closePath(); ctx.fill(); // saddle cloth
    ctx.strokeStyle = '#e8d8a0'; ctx.lineWidth = 0.5; ctx.stroke();
  }
  ctx.fillStyle = '#4a2a14'; ctx.beginPath(); ctx.ellipse(-0.8, b - 4, 3.6, 1.4, 0, 0, TAU); ctx.fill(); // saddle
  ctx.strokeStyle = '#3a2210'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(0, b - 3); ctx.lineTo(0, b + 3.6); ctx.stroke(); // stirrup strap
  ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(1.2, b - 4.4); ctx.lineTo(r.headX / sc + 1, r.headY / sc + 1.2); ctx.stroke(); // reins
  ctx.restore();
  return by - 3.5 * sc;
}

// ------------------------------------------------------------- vehicles
function vbox(ctx, ang, l, w, z0, z1, col, ox = 0, oy = 0, top = true) {
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
  if (top) face(ctx, pts.map(p => [p[0], p[1], z1]), shade(cc, 1.06));
  return pts;
}
// sloped-front hull: top face smaller than base (glacis)
function hullShape(ctx, ang, l, w, z0, z1, col, slope = 0.12, ox = 0, oy = 0) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const R = (a, b) => [ox + a * c - b * s, oy + a * s + b * c];
  const lo = [[l / 2, w / 2], [l / 2, -w / 2], [-l / 2, -w / 2], [-l / 2, w / 2]].map(([a, b]) => R(a, b));
  const hi = [[l / 2 - slope, w / 2 - 0.03], [l / 2 - slope, -w / 2 + 0.03], [-l / 2 + slope * 0.5, -w / 2 + 0.03], [-l / 2 + slope * 0.5, w / 2 - 0.03]].map(([a, b]) => R(a, b));
  const cc = hexToRgb(col);
  const faces = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const p = lo[i], q = lo[j];
    const nx = (q[1] - p[1]), ny = -(q[0] - p[0]);
    const len = Math.hypot(nx, ny) || 1;
    faces.push({ d: nx + ny, pts: [[p[0], p[1], z0], [q[0], q[1], z0], [hi[j][0], hi[j][1], z1], [hi[i][0], hi[i][1], z1]], l: 0.62 + 0.3 * ((ny - nx) / len * 0.5 + 0.5) });
  }
  for (const f of faces) if (f.d > 0) face(ctx, f.pts, shade(cc, f.l));
  face(ctx, hi.map(p => [p[0], p[1], z1]), shade(cc, 1.06));
  return { R, hi };
}
// tank tracks with moving links and road wheels
function tracks(ctx, ang, l, w, h, phase, wheels = true, part = 0, col = '#2a2a26') {
  const c = Math.cos(ang), s = Math.sin(ang);
  const R = (a, b, z) => P(a * c - b * s, a * s + b * c, z);
  const near = c - s > 0 ? 1 : -1;
  for (const side of [-near, near]) {
    const b = side * (w / 2 - 0.06);
    const nx = -s * side, ny = c * side; // outward normal
    const visible = nx + ny > 0;
    if ((part === 1 && visible) || (part === 2 && !visible)) continue;
    vbox(ctx, ang, l, 0.13, 0, h, col, -s * b, c * b);
    if (!visible) continue;
    const lh = col === '#2a2a26' ? h : 0.07;
    if (lh !== h) { const p0 = R(-l / 2, side * w / 2, 0), p1 = R(l / 2, side * w / 2, 0), p2 = R(l / 2, side * w / 2, lh), p3 = R(-l / 2, side * w / 2, lh); ctx.fillStyle = '#2a2a26'; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.closePath(); ctx.fill(); }
    const bo = side * w / 2 + side * 0.001;
    // links
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 0.8; ctx.beginPath();
    const n = 9;
    for (let i = 0; i < n; i++) { const a = -l / 2 + ((i + phase) % n) / n * l; const p0 = R(a, bo, 0.01), p1 = R(a, bo, lh - 0.01); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); }
    ctx.stroke();
    // road wheels
    if (wheels) for (let i = 0; i < 4; i++) {
      const a = -l / 2 + 0.14 + i * (l - 0.28) / 3; const p = R(a, bo, h * 0.48);
      ctx.fillStyle = '#4a4a44'; ctx.beginPath(); ctx.ellipse(p[0], p[1], 2.6, 2.1, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6a6a62'; ctx.beginPath(); ctx.ellipse(p[0], p[1], 1, 0.8, 0, 0, TAU); ctx.fill();
    }
  }
}
function barrel(ctx, ang, len, z, ox, oy, col, width = 2.5) {
  const a = P(ox, oy, z), b = P(ox + Math.cos(ang) * len, oy + Math.sin(ang) * len, z);
  ctx.strokeStyle = OL; ctx.lineWidth = width + 1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = width; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = width * 0.35; ctx.beginPath(); ctx.moveTo(a[0], a[1] - width * 0.25); ctx.lineTo(b[0], b[1] - width * 0.25); ctx.stroke();
  return b;
}
function wheel(ctx, ang, a, b, z, r, col = '#4a3018', spokes = 6, rot = 0) {
  // spoked wheel on the side of a vehicle; ellipse projected along the facing
  const c = Math.cos(ang), s = Math.sin(ang);
  const p = P(a * c - b * s, a * s + b * c, z);
  const ax = P(c, s, 0), up = [0, -ZH];
  const k = r;
  const ux = ax[0] * k, uy = ax[1] * k, vx = up[0] * k, vy = up[1] * k;
  ctx.strokeStyle = col; ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) { const t = i / 16 * TAU; const x = p[0] + ux * Math.cos(t) + vx * Math.sin(t), y = p[1] + uy * Math.cos(t) + vy * Math.sin(t); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  ctx.lineWidth = 0.7; ctx.beginPath();
  for (let i = 0; i < spokes; i++) { const t = i / spokes * Math.PI + rot; ctx.moveTo(p[0] + ux * Math.cos(t) + vx * Math.sin(t), p[1] + uy * Math.cos(t) + vy * Math.sin(t)); ctx.lineTo(p[0] - ux * Math.cos(t) - vx * Math.sin(t), p[1] - uy * Math.cos(t) - vy * Math.sin(t)); }
  ctx.stroke();
  circ(ctx, p[0], p[1], 1, '#2a1a0c');
}

function tank(ctx, o, sprite, era, ang, tc) {
  const hover = sprite === 'hover', t = o.t || 0;
  const zb = hover ? 0.25 + Math.sin(t * 3 + (o.id || 0)) * 0.04 : 0;
  const busy = !!o.busy, act = busy ? o.act || 0 : 0;
  const recoil = busy && act < 0.2 ? (1 - act / 0.2) * 0.14 : 0;
  contactShadow(ctx, 0, 2, 17, 7, 0.32);
  if (hover) { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 18); g.addColorStop(0, 'rgba(120,240,255,0.65)'); g.addColorStop(1, 'rgba(120,240,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 18, 9, 0, 0, TAU); ctx.fill(); }
  const hull = sprite === 'tank_old' ? '#6a6a4a' : era === 'future' || era === 'space' ? '#c8d0da' : '#5b6a46';
  const phase = o.moving ? (t * 8) % 9 : 0;
  const c = Math.cos(ang), s = Math.sin(ang);
  if (sprite === 'tank_old') { // rhomboid WWI tank
    // far sponson first, then hull and tall rhomboid track frames, near sponson last
    const sp = (sd) => { vbox(ctx, ang, 0.26, 0.12, 0.1, 0.26, sh(hull, 0.9), -s * sd * 0.39, c * sd * 0.39); barrel(ctx, ang + sd * 0.6, 0.18, 0.2, -s * sd * 0.42 + c * 0.06, c * sd * 0.42 + s * 0.06, '#333', 1.8); };
    const nearSd = (-s + c) > 0 ? 1 : -1;
    sp(-nearSd);
    tracks(ctx, ang, 1.1, 0.66, 0.34, phase, false, 1, sh(hull, 0.85));
    hullShape(ctx, ang, 0.8, 0.5, 0.06, 0.3, hull, 0.06);
    tracks(ctx, ang, 1.1, 0.66, 0.34, phase, false, 2, sh(hull, 0.85));
    sp(nearSd);
    vbox(ctx, ang, 0.22, 0.2, 0.3, 0.4, sh(hull, 1.1), c * 0.12, s * 0.12);
    // rivets
    const top = P(0, 0, 0.37); ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (let i = -2; i <= 2; i++) ctx.fillRect(top[0] + i * 3, top[1] + 1, 0.8, 0.8);
  } else {
    if (!hover) tracks(ctx, ang, 0.98, 0.64, 0.16, phase);
    else { vbox(ctx, ang, 0.86, 0.56, 0.04 + zb, 0.12 + zb, '#5a6470'); const p = P(-c * 0.43, -s * 0.43, 0.08 + zb); const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 6); g.addColorStop(0, 'rgba(200,255,255,0.9)'); g.addColorStop(1, 'rgba(120,240,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, TAU); ctx.fill(); }
    hullShape(ctx, ang, 0.92, 0.56, 0.12 + zb, 0.3 + zb, hull, 0.14);
    // fenders / stowage boxes
    for (const sd of [-1, 1]) vbox(ctx, ang, 0.18, 0.08, 0.3 + zb, 0.35 + zb, sh(hull, 0.8), -c * 0.3 - s * sd * 0.22, -s * 0.3 + c * sd * 0.22);
    // turret
    const tx = -c * 0.06, ty = -s * 0.06;
    const tl = 0.42;
    hullShape(ctx, ang, tl, 0.38, 0.3 + zb, 0.46 + zb, sh(hull, 1.1), 0.08, tx, ty);
    const tip = barrel(ctx, ang, 0.66 - recoil, 0.4 + zb, tx + c * (0.18 - recoil), ty + s * (0.18 - recoil), hover ? '#9ab' : '#2e3228', hover ? 2.2 : 2.8);
    // muzzle brake, hatch, antenna
    ctx.fillStyle = hover ? '#7cf1ff' : '#222'; ctx.beginPath(); ctx.arc(tip[0], tip[1], hover ? 1.6 : 1.7, 0, TAU); ctx.fill();
    const hp = P(tx - c * 0.08 + s * 0.08, ty - s * 0.08 - c * 0.08, 0.47 + zb); ell(ctx, hp[0], hp[1], 2.2, 1.2, 0, sh(hull, 0.75)); ell(ctx, hp[0], hp[1] - 0.4, 1.6, 0.8, 0, sh(hull, 1.25));
    const ap = P(tx - c * 0.16 - s * 0.12, ty - s * 0.16 + c * 0.12, 0.46 + zb); ctx.strokeStyle = '#222'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(ap[0], ap[1]); ctx.quadraticCurveTo(ap[0] - 1 - (o.moving ? 1.5 : 0), ap[1] - 8, ap[0] - 2 - (o.moving ? 3 : 0), ap[1] - 15); ctx.stroke();
    if (busy && act < 0.1 && !hover) { const g = ctx.createRadialGradient(tip[0], tip[1], 0, tip[0], tip[1], 9); g.addColorStop(0, 'rgba(255,255,220,0.95)'); g.addColorStop(0.4, 'rgba(255,190,90,0.8)'); g.addColorStop(1, 'rgba(255,150,60,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tip[0], tip[1], 9, 0, TAU); ctx.fill(); }
  }
  // team marking on the hull side
  const m = P(-c * 0.25, -s * 0.25, 0.31 + zb); ctx.fillStyle = tc; ctx.beginPath(); ctx.arc(m[0], m[1] - 1, 2.4, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.6; ctx.stroke();
}

function truck(ctx, o, sprite, era, ang, tc) {
  const busy = !!o.busy, act = busy ? o.act || 0 : 0, t = o.t || 0;
  contactShadow(ctx, 0, 2, 17, 7, 0.32);
  const hull = sprite === 'rocket_truck' ? '#5a6248' : '#55603e';
  const c = Math.cos(ang), s = Math.sin(ang);
  const rot = o.moving ? t * 10 : 0;
  // far wheels first
  const wheels = [];
  for (const w of [-0.3, 0.05, 0.32]) for (const sd of [-1, 1]) wheels.push([w, sd * 0.27, -s * sd + c * sd]);
  for (const [a, b] of wheels) { const nx = -s * Math.sign(b), ny = c * Math.sign(b); if (nx + ny <= 0) tyre(ctx, ang, a, b, rot); }
  vbox(ctx, ang, 0.98, 0.48, 0.1, 0.22, '#2e3226');
  if (sprite === 'rocket_truck') {
    vbox(ctx, ang, 0.26, 0.48, 0.12, 0.44, sh(hull, 1.1), c * 0.34, s * 0.34);
    face(ctx, [[c * 0.47 - s * 0.24, s * 0.47 + c * 0.24, 0.3], [c * 0.47 + s * 0.24, s * 0.47 - c * 0.24, 0.3], [c * 0.47 + s * 0.24, s * 0.47 - c * 0.24, 0.42], [c * 0.47 - s * 0.24, s * 0.47 + c * 0.24, 0.42]], 'rgba(150,200,230,0.7)');
    // launcher rack, elevated
    const el = busy ? 0.18 : 0.08;
    const ox = -c * 0.16, oy = -s * 0.16;
    vbox(ctx, ang, 0.5, 0.4, 0.26 + el * 0.5, 0.42 + el, '#3a3e34', ox, oy);
    const tubes = P(ox + c * 0.25, oy + s * 0.25, 0.34 + el);
    ctx.fillStyle = '#1a1a16'; for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { ctx.beginPath(); ctx.arc(tubes[0] - 4 + i * 2.6, tubes[1] - 1 + j * 2.4, 0.9, 0, TAU); ctx.fill(); }
    if (busy && act < 0.15) for (let i = 0; i < 3; i++) { ctx.fillStyle = `rgba(220,220,210,${0.5 - i * 0.12})`; const bp = P(ox - c * (0.3 + i * 0.15), oy - s * (0.3 + i * 0.15), 0.36 + el); ctx.beginPath(); ctx.arc(bp[0], bp[1], 3 + i * 1.5, 0, TAU); ctx.fill(); }
  } else { // artillery / howitzer on a carriage
    vbox(ctx, ang, 0.7, 0.44, 0.22, 0.32, hull, -c * 0.05, -s * 0.05);
    vbox(ctx, ang, 0.3, 0.3, 0.32, 0.46, sh(hull, 1.1), -c * 0.1, -s * 0.1);
    const recoil = busy && act < 0.2 ? (1 - act / 0.2) * 0.12 : 0;
    const tip = barrel(ctx, ang, 0.85 - recoil, 0.46 + (busy ? 0.08 : 0), -c * 0.05, -s * 0.05, '#2e3228', 3);
    if (busy && act < 0.1) { const g = ctx.createRadialGradient(tip[0], tip[1], 0, tip[0], tip[1], 10); g.addColorStop(0, 'rgba(255,255,220,0.95)'); g.addColorStop(1, 'rgba(255,150,60,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tip[0], tip[1], 10, 0, TAU); ctx.fill(); }
  }
  for (const [a, b] of wheels) { const nx = -s * Math.sign(b), ny = c * Math.sign(b); if (nx + ny > 0) tyre(ctx, ang, a, b, rot); }
  const m = P(0, 0, 0.23); ctx.fillStyle = tc; ctx.fillRect(m[0] - 2.5, m[1] - 2, 5, 2.4);
}
function tyre(ctx, ang, a, b, rot) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const p = P(a * c - b * s, a * s + b * c, 0.09);
  ctx.fillStyle = '#161614'; ctx.beginPath(); ctx.ellipse(p[0], p[1], 3.4, 2.8, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5a5a50'; ctx.beginPath(); ctx.ellipse(p[0], p[1], 1.4, 1.1, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(p[0] + Math.cos(rot) * 2.6, p[1] + Math.sin(rot) * 2); ctx.lineTo(p[0] - Math.cos(rot) * 2.6, p[1] - Math.sin(rot) * 2); ctx.stroke();
}

function aircraft(ctx, o, sprite, ang, tc) {
  const t = o.t || 0, id = o.id || 0;
  const sc = sprite === 'dreadnought' ? 2.2 : sprite === 'frigate' ? 1.5 : sprite === 'drone' ? 1.2 : 0.9;
  const alt = 1.3 + Math.sin(t * 2 + id) * 0.08;
  const c = Math.cos(ang), s = Math.sin(ang);
  const pt = (a, b, z) => P(a * c - b * s, a * s + b * c, z);
  // ground shadow in the shape of the craft, offset with the light
  const shapePts = sprite === 'fighter' ? [[0.62, 0], [0.1, 0.12], [-0.25, 0.5], [-0.4, 0.46], [-0.3, 0.1], [-0.42, 0], [-0.3, -0.1], [-0.4, -0.46], [-0.25, -0.5], [0.1, -0.12]] :
    sprite === 'drone' ? [[0.35, 0.12], [0.12, 0.35], [-0.12, 0.35], [-0.35, 0.12], [-0.35, -0.12], [-0.12, -0.35], [0.12, -0.35], [0.35, -0.12]] :
      [[0.7, 0], [0.3, 0.2], [0.1, 0.34], [-0.6, 0.32], [-0.66, 0], [-0.6, -0.32], [0.1, -0.34], [0.3, -0.2]];
  ctx.save(); ctx.translate(alt * 6, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); shapePts.forEach(([a, b], i) => { const p = pt(a * sc, b * sc, 0); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.fill();
  ctx.restore();
  const hull = sprite === 'dreadnought' ? '#5a6270' : '#c5ced8';
  // engine trail when moving
  const eng = pt(-0.55 * sc, 0, alt);
  if (o.moving) {
    const tail = pt(-1.6 * sc, 0, alt);
    const g = ctx.createLinearGradient(eng[0], eng[1], tail[0], tail[1]);
    const ec = sprite === 'dreadnought' ? '255,160,80' : '140,240,255';
    g.addColorStop(0, `rgba(${ec},0.55)`); g.addColorStop(1, `rgba(${ec},0)`);
    ctx.strokeStyle = g; ctx.lineWidth = 3.5 * sc; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(eng[0], eng[1]); ctx.lineTo(tail[0], tail[1]); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
  }
  if (sprite === 'drone') { // rotors
    for (const [a, b] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) { const p = pt(a * sc, b * sc, alt + 0.05); ctx.fillStyle = 'rgba(200,210,220,0.35)'; ctx.beginPath(); ctx.ellipse(p[0], p[1], 5, 2.5, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(40,40,40,0.7)'; ctx.lineWidth = 0.8; const ra = t * 40 + a * 9; ctx.beginPath(); ctx.moveTo(p[0] - Math.cos(ra) * 4.6, p[1] - Math.sin(ra) * 2.2); ctx.lineTo(p[0] + Math.cos(ra) * 4.6, p[1] + Math.sin(ra) * 2.2); ctx.stroke(); }
  }
  // body: underside then lit top
  const drawShape = (z, fill) => { ctx.beginPath(); shapePts.forEach(([a, b], i) => { const p = pt(a * sc, b * sc, z); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  drawShape(alt - 0.06, sh(hull, 0.5));
  ctx.beginPath(); shapePts.forEach(([a, b], i) => { const p = pt(a * sc, b * sc, alt); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.closePath();
  const g = ctx.createLinearGradient(-10 * sc, -alt * ZH - 6, 10 * sc, -alt * ZH + 6); g.addColorStop(0, sh(hull, 1.3)); g.addColorStop(1, sh(hull, 0.62));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = sh(hull, 0.45); ctx.lineWidth = 0.8; ctx.stroke();
  // panel lines and spine
  const a0 = pt(0.55 * sc, 0, alt + 0.02), a1 = pt(-0.5 * sc, 0, alt + 0.02);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke();
  if (sprite === 'fighter') { const cp = pt(0.22 * sc, 0, alt + 0.06); ctx.fillStyle = '#3ac0ff'; ctx.beginPath(); ctx.ellipse(cp[0], cp[1], 3.2, 1.6, Math.atan2(a0[1] - a1[1], a0[0] - a1[0]), 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(cp[0] - 1, cp[1] - 0.8, 1.2, 0.5); }
  if (sprite === 'frigate' || sprite === 'dreadnought') { // bridge tower and turrets
    vbox(ctx, ang, 0.22 * sc, 0.2 * sc, alt, alt + 0.14 * sc, sh(hull, 1.05), -c * 0.2 * sc, -s * 0.2 * sc);
    for (const k of [0.3, 0.05]) { const tp = pt(k * sc, 0, alt + 0.03); ell(ctx, tp[0], tp[1], 2.2 * sc * 0.6, 1.2 * sc * 0.6, 0, sh(hull, 0.8)); const bb = pt((k + 0.18) * sc, 0, alt + 0.04); ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tp[0], tp[1]); ctx.lineTo(bb[0], bb[1]); ctx.stroke(); }
  }
  const st = pt(-0.1 * sc, 0, alt); ctx.fillStyle = tc; ctx.beginPath(); ctx.arc(st[0], st[1], 2 * sc, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.6; ctx.stroke();
  // wing tip lights
  if (sprite === 'fighter') { const l1 = pt(-0.3 * sc, 0.48 * sc, alt), l2 = pt(-0.3 * sc, -0.48 * sc, alt); const bl = Math.sin(t * 6 + id) > 0.6; circ(ctx, l1[0], l1[1], 0.9, bl ? '#ff5050' : '#802020'); circ(ctx, l2[0], l2[1], 0.9, bl ? '#50ff70' : '#208030'); }
  const eg = ctx.createRadialGradient(eng[0], eng[1], 0, eng[0], eng[1], 6 * sc); eg.addColorStop(0, '#fff'); eg.addColorStop(0.4, sprite === 'dreadnought' ? '#ff9a3a' : '#7cf1ff'); eg.addColorStop(1, 'rgba(0,200,255,0)');
  ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(eng[0], eng[1], 6 * sc * (0.85 + Math.sin(t * 20 + id) * 0.15), 0, TAU); ctx.fill();
  if (sprite === 'dreadnought' || sprite === 'frigate') for (let i = 0; i < 5; i++) { const w = pt((0.35 - i * 0.2) * sc, 0.2 * sc, alt + 0.03); ctx.fillStyle = '#ffe9a0'; ctx.fillRect(w[0] - 0.7, w[1] - 0.7, 1.4, 1.4); }
}

function siege(ctx, o, sprite, era, ang, tc) {
  const busy = !!o.busy, act = busy ? o.act || 0 : 0, t = o.t || 0;
  contactShadow(ctx, 0, 1, 14, 5.5, 0.3);
  const wood = '#7a5530', dark = '#4a3018';
  const c = Math.cos(ang), s = Math.sin(ang);
  const rot = o.moving ? t * 6 : 0;
  const wheelsFar = [], wheelsNear = [];
  const wl = sprite === 'ram' ? [-0.3, 0.3] : sprite === 'cannon' ? [0.05] : [-0.28, 0.28];
  const wb = sprite === 'cannon' ? 0.24 : 0.3;
  for (const a of wl) for (const sd of [-1, 1]) ((-s * sd + c * sd) > 0 ? wheelsNear : wheelsFar).push([a, sd * wb]);
  const wr = sprite === 'cannon' ? 0.17 : 0.13;
  for (const [a, b] of wheelsFar) wheel(ctx, ang, a, b, wr, wr, dark, 6, rot);
  if (sprite === 'ram') {
    vbox(ctx, ang, 0.95, 0.5, 0.1, 0.18, wood);
    // posts and hide roof
    for (const a of [-0.35, 0.35]) for (const sd of [-1, 1]) { const p0 = P(a * c - sd * 0.22 * s, a * s + sd * 0.22 * c, 0.18), p1 = P(a * c - sd * 0.22 * s, a * s + sd * 0.22 * c, 0.5); seg(ctx, p0[0], p0[1], p1[0], p1[1], 1.4, dark); }
    // swinging ram log
    const sw = busy ? Math.sin(act * TAU) * 0.12 : 0;
    const rp = barrel(ctx, ang, 0.62, 0.32, c * (-0.25 + sw), s * (-0.25 + sw), '#8a6030', 3.6);
    ctx.fillStyle = '#4a4a50'; ctx.beginPath(); ctx.arc(rp[0], rp[1], 2.6, 0, TAU); ctx.fill(); ctx.fillStyle = '#8a8a94'; ctx.beginPath(); ctx.arc(rp[0] - 0.6, rp[1] - 0.6, 1, 0, TAU); ctx.fill();
    const R = (a, b, z) => [a * c - b * s, a * s + b * c, z];
    const hideA = '#8a6a44', hideB = '#a8865a';
    face(ctx, [R(0.5, 0.3, 0.46), R(-0.5, 0.3, 0.46), R(-0.5, 0, 0.7), R(0.5, 0, 0.7)], (c + s) > 0 ? hideB : hideA);
    face(ctx, [R(0.5, -0.3, 0.46), R(-0.5, -0.3, 0.46), R(-0.5, 0, 0.7), R(0.5, 0, 0.7)], (c + s) > 0 ? hideA : hideB);
    // hide stitching
    ctx.strokeStyle = 'rgba(60,40,20,0.6)'; ctx.lineWidth = 0.6; ctx.beginPath();
    for (let i = -2; i <= 2; i++) { const a = P(...R(i * 0.2, 0.3, 0.46)), b = P(...R(i * 0.2, 0, 0.7)), d2 = P(...R(i * 0.2, -0.3, 0.46)); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d2[0], d2[1]); }
    ctx.stroke();
    const fl = P(...R(0, 0, 0.7)); seg(ctx, fl[0], fl[1], fl[0], fl[1] - 8, 0.8, dark); ctx.fillStyle = tc; ctx.beginPath(); ctx.moveTo(fl[0], fl[1] - 8); ctx.lineTo(fl[0] + 5, fl[1] - 6.6 + Math.sin(t * 4) * 0.6); ctx.lineTo(fl[0], fl[1] - 5); ctx.fill();
  } else if (sprite === 'cannon') {
    // trail and carriage cheeks
    const tr0 = P(0, 0, 0.12), tr1 = P(-c * 0.45, -s * 0.45, 0.01);
    seg(ctx, tr0[0], tr0[1], tr1[0], tr1[1], 3, dark);
    vbox(ctx, ang, 0.36, 0.3, 0.1, 0.22, era === 'gunpowder' ? wood : '#4a5236', -c * 0.04, -s * 0.04);
    const recoil = busy && act < 0.2 ? (1 - act / 0.2) * 0.1 : 0;
    const bc = era === 'gunpowder' ? '#3a3a3a' : '#2e3a2a';
    const tip = barrel(ctx, ang, 0.66 - recoil, 0.26, -c * (0.2 + recoil), -s * (0.2 + recoil), bc, 4.2);
    if (era === 'gunpowder') { const mid = P(c * 0.05, s * 0.05, 0.26); ctx.fillStyle = '#c8a048'; ctx.beginPath(); ctx.arc(mid[0], mid[1], 1, 0, TAU); ctx.fill(); }
    if (era !== 'gunpowder') { vbox(ctx, ang, 0.06, 0.42, 0.18, 0.36, '#4a5236', c * 0.08, s * 0.08); } // gun shield
    if (busy && act < 0.1) { const g = ctx.createRadialGradient(tip[0], tip[1], 0, tip[0], tip[1], 10); g.addColorStop(0, 'rgba(255,255,220,0.95)'); g.addColorStop(0.4, 'rgba(255,180,80,0.8)'); g.addColorStop(1, 'rgba(255,150,60,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tip[0], tip[1], 10, 0, TAU); ctx.fill(); }
  } else {
    vbox(ctx, ang, 0.82, 0.5, 0.1, 0.2, wood);
    // cross beams
    const R = (a, b, z) => P(a * c - b * s, a * s + b * c, z);
    if (sprite === 'ballista') {
      vbox(ctx, ang, 0.2, 0.16, 0.2, 0.32, sh(wood, 0.9));
      barrel(ctx, ang, 0.56, 0.36, -c * 0.16, -s * 0.16, '#5a3a1a', 2.2);
      const a2 = R(0.12, 0.38, 0.36), b2 = R(0.12, -0.38, 0.36), m2 = R(0.26, 0, 0.36);
      ctx.strokeStyle = dark; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(a2[0], a2[1]); ctx.quadraticCurveTo(m2[0], m2[1], b2[0], b2[1]); ctx.stroke();
      const pull = busy && act > 0.15 ? 0 : 0.18;
      const st = R(-0.05 - pull, 0, 0.36);
      ctx.strokeStyle = 'rgba(230,220,200,0.9)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(a2[0], a2[1]); ctx.lineTo(st[0], st[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke();
      if (!(busy && act < 0.15)) { const bt = R(0.4, 0, 0.38); seg(ctx, st[0], st[1], bt[0], bt[1], 1, '#c8b080'); }
    } else {
      const tall = sprite === 'trebuchet' ? 1.45 : 0.62;
      // A-frame uprights on both sides
      for (const sd of [-1, 1]) {
        const f1 = R(-0.25, sd * 0.2, 0.2), f2 = R(0.25, sd * 0.2, 0.2), top = R(0, sd * 0.2, tall);
        ctx.strokeStyle = OL; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(f1[0], f1[1]); ctx.lineTo(top[0], top[1]); ctx.lineTo(f2[0], f2[1]); ctx.stroke();
        ctx.strokeStyle = sd * (c + s) > 0 ? '#7a5530' : '#5a3a1a'; ctx.lineWidth = 2.2; ctx.stroke();
      }
      const axle0 = R(0, 0.22, tall), axle1 = R(0, -0.22, tall); seg(ctx, axle0[0], axle0[1], axle1[0], axle1[1], 1.6, '#3a2410');
      const ax = R(0, 0, tall);
      // throwing arm: rests back/down, swings up and over when firing
      const sw = busy ? (act < 0.25 ? act / 0.25 : act < 0.6 ? 1 : 1 - (act - 0.6) / 0.4) : 0;
      const armA = sprite === 'trebuchet' ? -0.95 + sw * 2.4 : -0.35 + sw * 1.7; // angle above horizontal, toward the rear
      const L = sprite === 'trebuchet' ? 1.25 : 0.62;
      const tip = R(-Math.cos(armA) * L, 0, tall + Math.sin(armA) * L);
      ctx.strokeStyle = OL; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(ax[0], ax[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      ctx.strokeStyle = '#8a6030'; ctx.lineWidth = 2.2; ctx.stroke();
      if (sprite === 'trebuchet') {
        const cw = R(Math.cos(armA) * 0.35, 0, tall - Math.sin(armA) * 0.35);
        ctx.fillStyle = '#4a3a2a'; ctx.fillRect(cw[0] - 3.5, cw[1], 7, 6); ctx.strokeStyle = OL; ctx.lineWidth = 0.6; ctx.strokeRect(cw[0] - 3.5, cw[1], 7, 6);
        seg(ctx, ax[0], ax[1], cw[0], cw[1], 1.8, '#8a6030');
        if (sw < 0.95) { ctx.strokeStyle = 'rgba(220,210,180,0.8)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(tip[0] + 2, tip[1] + 6); ctx.stroke(); circ(ctx, tip[0] + 2, tip[1] + 6.5, 1.8, '#8a8680'); }
      } else {
        ctx.fillStyle = '#5a3a1a'; ctx.beginPath(); ctx.ellipse(tip[0], tip[1], 2.8, 1.6, 0, 0, TAU); ctx.fill();
        if (sw < 0.95) circ(ctx, tip[0], tip[1] - 1, 1.8, '#8a8680');
        // torsion skein
        const sk = R(0.15, 0, 0.22); ctx.fillStyle = '#b89a66'; ctx.beginPath(); ctx.ellipse(sk[0], sk[1], 3.4, 1.6, 0, 0, TAU); ctx.fill();
      }
    }
  }
  for (const [a, b] of wheelsNear) wheel(ctx, ang, a, b, wr, wr, sprite === 'cannon' && era !== 'gunpowder' ? '#2a2a26' : '#5a3a1c', sprite === 'cannon' ? 8 : 6, rot);
}

// ------------------------------------------------------------- entry
// rider's weapon: couched lances for knights, lancers and cataphracts,
// sabres for later cavalry, carbines for dragoons
function riderWeapon(d, sprite, era) {
  if (d.projectile) return 'musket';
  if (sprite === 'knight') return era === 'gunpowder' ? 'sabre' : 'lance';
  if (d.id === 'lancer' || d.id === 'cataphract') return 'lance';
  if (era === 'gunpowder' || era === 'industrial') return 'sabre';
  return era === 'classical' || era === 'iron' || era === 'bronze' ? 'spear' : 'sword';
}
export function drawUnitFig(ctx, x, y, o) {
  const d = o.def;
  const sprite = d.sprite;
  const ang = o.face || 0;
  const [dx] = P(Math.cos(ang), Math.sin(ang));
  const dir = dx < 0 ? -1 : 1;
  const tc = TEAM[o.team] || '#bbb';
  const era = d.era || o.era;
  if (d.class === 'animal') {
    ctx.save(); ctx.translate(x, y); ctx.scale(dir * 1.25, 1.25);
    if (sprite === 'mammoth') quadruped(ctx, o, '#6a4a30', 1.6, 'mammoth');
    else quadruped(ctx, o, sprite === 'deer' ? '#a8784a' : '#4a3a30', sprite === 'deer' ? 0.9 : 0.85, sprite);
    ctx.restore();
    return;
  }
  ctx.save(); ctx.translate(x, y); ctx.scale(1.3, 1.3);
  switch (sprite) {
    case 'horse': case 'knight': case 'donkey': {
      ctx.save(); ctx.scale(dir, 1);
      const col = sprite === 'donkey' ? '#8a7a6a' : sprite === 'knight' ? '#e8e0d0' : ['#7a4a2a', '#5a3420', '#9a6a3a', '#3a2a20'][(o.id || 0) % 4];
      const seat = horseWithTack(ctx, o, col, sprite === 'donkey' ? 0.85 : 1.0, o.team, sprite === 'knight' || era === 'medieval', era);
      ctx.restore();
      const rs = riderWeapon(d, sprite, era);
      drawHuman(ctx, -0.5 * dir, seat + 7.5, { team: o.team, era, sprite: rs, dir, walk: 0, act: o.act, busy: o.busy, carry: -1, cls: 'mounted', id: o.id, noShadow: true, legs: false, t: o.t, lod: o.lod, uid: d.id });
      // rider's leg over the horse side
      ctx.save(); ctx.scale(dir, 1); limb(ctx, [0.5, seat + 1], [2.2, seat + 4], [1, seat + 7.5], 2, era === 'gunpowder' || era === 'industrial' ? '#e8e2d4' : '#5a4630'); ctx.restore();
      break;
    }
    case 'chariot': {
      ctx.save(); ctx.scale(dir, 1);
      ctx.save(); ctx.translate(9, 0); quadruped(ctx, o, '#6a3a1a', 0.8, 'horse'); ctx.restore();
      seg(ctx, 0, -6, 9, -8, 1.2, '#4a3018'); // shaft
      ctx.fillStyle = '#8a6a3a'; ctx.beginPath(); ctx.moveTo(-11, -12); ctx.lineTo(0, -12); ctx.lineTo(1, -4); ctx.lineTo(-11, -4); ctx.closePath(); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.fillStyle = TEAM[o.team] || '#888'; ctx.fillRect(-10, -10, 9, 2.4);
      const rot = o.moving ? (o.t || 0) * 8 : 0;
      ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(-5, -3.5, 4, 0, TAU); ctx.stroke();
      ctx.lineWidth = 0.6; ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = rot + i * 1.047; ctx.moveTo(-5 + Math.cos(a) * 4, -3.5 + Math.sin(a) * 4); ctx.lineTo(-5 - Math.cos(a) * 4, -3.5 - Math.sin(a) * 4); } ctx.stroke();
      ctx.restore();
      drawHuman(ctx, -5 * dir, -5, { team: o.team, era, sprite: 'bow', dir, walk: 0, act: o.act, busy: o.busy, carry: -1, cls: 'ranged', id: o.id, noShadow: true, legs: false, t: o.t, lod: o.lod });
      break;
    }
    case 'tank_old': case 'tank': case 'hover': tank(ctx, o, sprite, era, ang, tc); break;
    case 'rocket_truck': case 'artillery': truck(ctx, o, sprite, era, ang, tc); break;
    case 'fighter': case 'drone': case 'frigate': case 'dreadnought': aircraft(ctx, o, sprite, ang, tc); break;
    case 'ram': case 'catapult': case 'trebuchet': case 'ballista': case 'cannon': siege(ctx, o, sprite, era, ang, tc); break;
    default:
      drawHuman(ctx, 0, 0, { team: o.team, era, sprite, dir, walk: o.walk, act: o.act, busy: o.busy, carry: o.carry, cls: d.class, id: o.id, res: o.res, state: o.state, t: o.t, noShadow: o.noShadow, lod: o.lod, uid: d.id });
  }
  ctx.restore();
}

// is this unit drawn as a person (for death animations)?
export function isFootUnit(d) {
  return d && d.class !== 'animal' && !d.naval && d.class !== 'naval' && !d.flying && !['tank_old', 'tank', 'hover', 'rocket_truck', 'artillery', 'fighter', 'drone', 'frigate', 'dreadnought', 'ram', 'catapult', 'trebuchet', 'ballista', 'cannon', 'chariot'].includes(d.sprite);
}
void hash2;
