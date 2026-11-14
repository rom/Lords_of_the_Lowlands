// Ships and boats. Drawn live each frame in tile space around the unit's
// position, rotated to its facing; they sit in the water (no ground shadow),
// bob gently and leave a wake when moving.
import { P, lightOf, shade, hexToRgb, TEAM, hash2, ZH } from './kit.js';

function mk(ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const R = (a, b) => [a * c - b * s, a * s + b * c];
  const Q = (a, b, z) => { const r = R(a, b); return P(r[0], r[1], z); };
  return { c, s, R, Q };
}

// hull outline (a along length, b across) for half-length L and half-beam B
function outline(L, B, bow = 0.45, stern = 0.75, n = 10) {
  const side = [];
  for (let i = 0; i <= n; i++) {
    const a = L - i * 2 * L / n;
    let w;
    if (a > L * (1 - bow)) { const k = (a - L * (1 - bow)) / (L * bow); w = B * Math.sqrt(Math.max(0, 1 - k * k)); }
    else if (a < -L * 0.7) { const k = (-a - L * 0.7) / (L * 0.3); w = B * (1 - (1 - stern) * k); }
    else w = B;
    side.push([a, w]);
  }
  const pts = side.map(([a, w]) => [a, w]);
  for (let i = side.length - 2; i >= 1; i--) pts.push([side[i][0], -side[i][1]]);
  if (stern < 0.99) pts.splice(n + 1, 0, [-L, -side[n][1]]);
  return pts;
}

function hull(ctx, m, pts, zd, col, opt = {}) {
  const sheer = opt.sheer || 0, L = opt.L || 1, zw = opt.zw ?? -0.02;
  const zAt = (a) => zd + sheer * Math.pow(Math.abs(a) / L, 2.2);
  const c = hexToRgb(col);
  const n = pts.length;
  // sides (back-face culled)
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const P0 = m.R(p[0], p[1]), P1 = m.R(q[0], q[1]);
    const nx = P1[1] - P0[1], ny = -(P1[0] - P0[0]);
    if (nx + ny <= 0) continue;
    const k = opt.tuck ?? 0.8;
    const a0 = m.Q(p[0], p[1] * k, zw), a1 = m.Q(q[0], q[1] * k, zw), b1 = m.Q(q[0], q[1], zAt(q[0])), b0 = m.Q(p[0], p[1], zAt(p[0]));
    ctx.beginPath(); ctx.moveTo(...a0); ctx.lineTo(...a1); ctx.lineTo(...b1); ctx.lineTo(...b0); ctx.closePath();
    ctx.fillStyle = shade(c, lightOf([nx, ny, 0.25])); ctx.fill();
    ctx.strokeStyle = shade(c, lightOf([nx, ny, 0.25])); ctx.lineWidth = 0.4; ctx.stroke();
    if (opt.planks) {
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.5; ctx.beginPath();
      for (const f of [0.35, 0.65]) { const u0 = m.Q(p[0], p[1] * (k + (1 - k) * f), zw + (zAt(p[0]) - zw) * f), u1 = m.Q(q[0], q[1] * (k + (1 - k) * f), zw + (zAt(q[0]) - zw) * f); ctx.moveTo(...u0); ctx.lineTo(...u1); }
      ctx.stroke();
    }
    if (opt.stripe) {
      const f = opt.stripeAt ?? 0.75, g = f + (opt.stripeW ?? 0.18);
      const u0 = m.Q(p[0], p[1] * (k + (1 - k) * f), zw + (zAt(p[0]) - zw) * f), u1 = m.Q(q[0], q[1] * (k + (1 - k) * f), zw + (zAt(q[0]) - zw) * f);
      const v0 = m.Q(p[0], p[1] * (k + (1 - k) * g), zw + (zAt(p[0]) - zw) * g), v1 = m.Q(q[0], q[1] * (k + (1 - k) * g), zw + (zAt(q[0]) - zw) * g);
      ctx.beginPath(); ctx.moveTo(...u0); ctx.lineTo(...u1); ctx.lineTo(...v1); ctx.lineTo(...v0); ctx.closePath(); ctx.fillStyle = shade(opt.stripe, lightOf([nx, ny, 0.25])); ctx.fill();
    }
    if (opt.boot) { // waterline paint
      const g = 0.22;
      const v0 = m.Q(p[0], p[1] * (k + (1 - k) * g), zw + (zAt(p[0]) - zw) * g), v1 = m.Q(q[0], q[1] * (k + (1 - k) * g), zw + (zAt(q[0]) - zw) * g);
      ctx.beginPath(); ctx.moveTo(...a0); ctx.lineTo(...a1); ctx.lineTo(...v1); ctx.lineTo(...v0); ctx.closePath(); ctx.fillStyle = shade(opt.boot, lightOf([nx, ny, 0.25])); ctx.fill();
    }
    if (opt.ports) {
      ctx.fillStyle = '#1a1410';
      for (let j = 1; j < 3; j++) { const f = j / 3; const a = p[0] + (q[0] - p[0]) * f, b = p[1] + (q[1] - p[1]) * f; if (a < -L * 0.75 || a > L * 0.6) continue; const pp = m.Q(a, b * 0.98, zAt(a) * 0.62); ctx.fillRect(pp[0] - 1, pp[1] - 1, 2, 2); }
    }
  }
  // deck
  ctx.beginPath(); pts.forEach(([a, b], i) => { const q = m.Q(a, b, zAt(a)); i ? ctx.lineTo(...q) : ctx.moveTo(...q); }); ctx.closePath();
  ctx.fillStyle = shade(opt.deck || '#a07a4a', lightOf([0, 0, 1])); ctx.fill();
  if (opt.deckPlanks) {
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(60,35,15,0.35)'; ctx.lineWidth = 0.5; ctx.beginPath();
    for (let b = -0.3; b <= 0.3; b += 0.045) { const u = m.Q(-L, b, zd), v = m.Q(L, b, zd); ctx.moveTo(...u); ctx.lineTo(...v); }
    ctx.stroke(); ctx.restore();
  }
  // gunwale rim
  ctx.beginPath(); pts.forEach(([a, b], i) => { const q = m.Q(a, b, zAt(a)); i ? ctx.lineTo(...q) : ctx.moveTo(...q); }); ctx.closePath();
  ctx.strokeStyle = opt.rim || shade(c, 0.55); ctx.lineWidth = opt.rimW || 1; ctx.stroke();
  return zAt;
}

// rotated box with lighting
function rbox(ctx, m, a0, a1, b0, b1, z0, z1, col, opt = {}) {
  const c = hexToRgb(col);
  const pts = [[a1, b1], [a1, b0], [a0, b0], [a0, b1]].map(([a, b]) => m.R(a, b));
  for (let i = 0; i < 4; i++) {
    const p = pts[i], q = pts[(i + 1) % 4];
    const nx = q[1] - p[1], ny = -(q[0] - p[0]);
    if (nx + ny <= 0) continue;
    ctx.beginPath(); ctx.moveTo(...P(p[0], p[1], z0)); ctx.lineTo(...P(q[0], q[1], z0)); ctx.lineTo(...P(q[0], q[1], z1)); ctx.lineTo(...P(p[0], p[1], z1)); ctx.closePath();
    ctx.fillStyle = shade(c, lightOf([nx, ny, 0])); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.4; ctx.stroke();
    if (opt.windows) {
      ctx.fillStyle = opt.winCol || 'rgba(30,40,50,0.9)';
      const n = Math.max(1, Math.round(Math.hypot(nx, ny) / 0.09));
      for (let k = 0; k < n; k++) { const f = (k + 0.5) / n; const w = P(p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, z0 + (z1 - z0) * 0.62); ctx.fillRect(w[0] - 0.8, w[1] - 0.8, 1.6, 1.4); }
    }
  }
  ctx.beginPath(); pts.forEach((p, i) => { const q = P(p[0], p[1], z1); i ? ctx.lineTo(...q) : ctx.moveTo(...q); }); ctx.closePath();
  ctx.fillStyle = shade(c, lightOf([0, 0, 1])); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.4; ctx.stroke();
}
function rcyl(ctx, m, a, b, z0, z1, r, col) {
  const [x, y] = m.R(a, b);
  const c = hexToRgb(col);
  const p0 = P(x, y, z0), p1 = P(x, y, z1), rx = r * 32 * 1.41, ry = rx * 0.5;
  const g = ctx.createLinearGradient(p0[0] - rx, 0, p0[0] + rx, 0); g.addColorStop(0, shade(c, 0.95)); g.addColorStop(0.35, shade(c, 1.15)); g.addColorStop(1, shade(c, 0.55));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(p0[0], p0[1], rx, ry, 0, 0, Math.PI); ctx.lineTo(p1[0] + rx, p1[1]); ctx.ellipse(p1[0], p1[1], rx, ry, 0, 0, Math.PI, true); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(c, 1.1); ctx.beginPath(); ctx.ellipse(p1[0], p1[1], rx, ry, 0, 0, 7); ctx.fill();
  return p1;
}
function line(ctx, a, b, col, w) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }

// square sail across the ship at position a; w half-width, z1..z2
function squareSail(ctx, m, a, w, z1, z2, col, team, opt = {}) {
  // yards are braced at an angle so the sail reads from every heading
  const br = opt.brace ?? 0.5, sb = Math.sin(br), cb = Math.cos(br);
  const bil = (opt.billow ?? 0.12) + 0.06;
  const S = (u, z, k = 0) => m.Q(a + u * sb + k * cb, u * cb - k * sb, z);
  const A = S(-w, z2), B = S(w, z2), C = S(w * 0.95, z1, bil * 0.4), D = S(-w * 0.95, z1, bil * 0.4);
  const Mb = S(0, z1 - 0.03, bil), Mt = S(0, z2 + 0.02, bil * 0.4), Ml = S(-w, (z1 + z2) / 2, bil * 0.8), Mr = S(w, (z1 + z2) / 2, bil * 0.8);
  // which side of the sail faces the camera
  const nx = cb, ny = -sb; const r = m.R(nx, ny);
  const front = r[0] + r[1] > 0;
  const lc = front ? 1.0 : 0.8;
  const path = () => { ctx.beginPath(); ctx.moveTo(...A); ctx.quadraticCurveTo(...Mt, ...B); ctx.quadraticCurveTo(...Mr, ...C); ctx.quadraticCurveTo(...Mb, ...D); ctx.quadraticCurveTo(...Ml, ...A); ctx.closePath(); };
  path();
  const g = ctx.createLinearGradient(A[0], A[1], C[0], C[1]);
  g.addColorStop(0, shade(col, 1.05 * lc)); g.addColorStop(0.5, shade(col, 0.86 * lc)); g.addColorStop(1, shade(col, 0.98 * lc));
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); path(); ctx.clip();
  const tc = TEAM[team] || '#888';
  if (opt.stripes) {
    ctx.fillStyle = tc;
    for (let k = -2; k <= 2; k += 2) { const u0 = k / 5 * w, u1 = (k + 1) / 5 * w; const p = [S(u0, z1 - 0.1, bil), S(u1, z1 - 0.1, bil), S(u1, z2 + 0.1, 0), S(u0, z2 + 0.1, 0)]; ctx.beginPath(); p.forEach((q, i) => i ? ctx.lineTo(...q) : ctx.moveTo(...q)); ctx.fill(); }
  } else if (opt.cross) {
    ctx.strokeStyle = tc; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(...S(0, z2, bil * 0.4)); ctx.quadraticCurveTo(...S(0, (z1 + z2) / 2, bil * 1.2), ...S(0, z1, bil * 0.6)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(...S(-w, (z1 + z2) / 2, bil * 0.8)); ctx.quadraticCurveTo(...S(0, (z1 + z2) / 2, bil * 1.2), ...S(w, (z1 + z2) / 2, bil * 0.8)); ctx.stroke();
  } else if (team != null && opt.band !== false) {
    const z = z1 + (z2 - z1) * 0.38, h = (z2 - z1) * 0.22;
    ctx.fillStyle = tc;
    ctx.beginPath(); ctx.moveTo(...S(-w * 1.1, z, bil)); ctx.quadraticCurveTo(...S(0, z, bil * 1.6), ...S(w * 1.1, z, bil)); ctx.lineTo(...S(w * 1.1, z + h, bil)); ctx.quadraticCurveTo(...S(0, z + h, bil * 1.6), ...S(-w * 1.1, z + h, bil)); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(60,40,20,0.25)'; ctx.lineWidth = 0.5; ctx.beginPath();
  for (let k = 1; k < 4; k++) { const z = z1 + (z2 - z1) * k / 4; ctx.moveTo(...S(-w, z, bil * 0.6)); ctx.quadraticCurveTo(...S(0, z, bil * 1.4), ...S(w, z, bil * 0.6)); }
  ctx.stroke();
  ctx.restore();
  path(); ctx.strokeStyle = 'rgba(70,55,35,0.6)'; ctx.lineWidth = 0.6; ctx.stroke();
  line(ctx, S(-w * 1.1, z2), S(w * 1.1, z2), '#4a3018', 1.3);
}
function mast(ctx, m, a, z0, z1, col = '#5a3a1a', w = 1.6) { const p = m.Q(a, 0, z0), q = m.Q(a, 0, z1); line(ctx, p, q, col, w); return q; }
function pennant(ctx, p, team, t, len = 8) {
  const w = Math.sin(t * 6) * 1.2;
  ctx.fillStyle = TEAM[team] || '#888'; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.quadraticCurveTo(p[0] + len * 0.5, p[1] + 1 + w, p[0] + len, p[1] + 2); ctx.lineTo(p[0], p[1] + 4); ctx.closePath(); ctx.fill();
}

// --------------------------------------------------------------- water fx
function waterFx(ctx, m, L, B, o, moving, glow) {
  // darker water under the hull
  ctx.save();
  const c = m.Q(0, 0, 0);
  const tip = m.Q(L, 0, 0);
  const dx = tip[0] - c[0], dy = tip[1] - c[1];
  const ang = Math.atan2(dy, dx), len = Math.hypot(dx, dy);
  ctx.translate(c[0], c[1]); ctx.rotate(ang);
  ctx.fillStyle = glow ? 'rgba(120,240,255,0.18)' : 'rgba(0,20,40,0.28)'; ctx.beginPath(); ctx.ellipse(0, 0, len * 1.12, Math.max(4, B * 40), 0, 0, 7); ctx.fill();
  ctx.restore();
  const t = o.t || 0;
  if (moving) {
    // V-wake: fading foam trails from the bow shoulders and churn at the stern
    for (const sg of [-1, 1]) for (let k = 0; k < 9; k++) {
      const f0 = k / 9, f1 = (k + 1) / 9;
      const p0 = m.Q(L * 0.6 - f0 * L * 3, sg * B * (1 + f0 * 2.6), 0), p1 = m.Q(L * 0.6 - f1 * L * 3, sg * B * (1 + f1 * 2.6), 0);
      ctx.strokeStyle = `rgba(235,248,255,${0.55 * (1 - f0)})`; ctx.lineWidth = 1.4 * (1 - f0 * 0.5);
      ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.stroke();
    }
    for (let k = 0; k < 3; k++) {
      const f = ((t * 1.2 + k / 3) % 1);
      const back = -L - f * L * 1.6, spread = B * (0.6 + f * 1.6);
      ctx.strokeStyle = `rgba(235,248,255,${0.4 * (1 - f)})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(...m.Q(back, -spread, 0)); ctx.quadraticCurveTo(...m.Q(back - 0.06, 0, 0), ...m.Q(back, spread, 0)); ctx.stroke();
    }
    for (let k = 0; k < 6; k++) { const q = m.Q(-L - 0.05 - hash2(k, 1, o.id || 0) * 0.3, (hash2(k, 2, o.id || 0) - 0.5) * B * 1.6, 0); ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.25 * Math.sin(t * 9 + k)})`; ctx.beginPath(); ctx.arc(q[0], q[1], 1.5, 0, 7); ctx.fill(); }
    const bw = m.Q(L * 1.02, 0, 0); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(bw[0], bw[1], 3, 1.6, 0, 0, 7); ctx.fill();
  } else {
    // idle ripples
    const k = (t * 0.6 + (o.id || 0) * 0.13) % 1;
    ctx.strokeStyle = `rgba(230,245,255,${0.35 * (1 - k)})`; ctx.lineWidth = 0.8;
    ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(ang); ctx.beginPath(); ctx.ellipse(0, 0, len * (1.1 + k * 0.5), Math.max(4, B * 40) * (1.2 + k * 0.6), 0, 0, 7); ctx.stroke(); ctx.restore();
  }
  // foam line where the hull meets the water
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
  ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(ang); ctx.beginPath(); ctx.ellipse(0, 0, len * 0.98, Math.max(3, B * 30), 0, 0, Math.PI); ctx.stroke(); ctx.restore();
}

function oars(ctx, m, n, a0, a1, B, zd, t, moving, side = [-1, 1], len = 0.32) {
  const ph = moving ? t * 5 : 0.6;
  for (const sg of side) for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * i / Math.max(1, n - 1);
    const sw = Math.sin(ph) * 0.12, lift = moving ? Math.max(0, Math.cos(ph)) * 0.08 : 0;
    const p = m.Q(a, sg * B * 0.95, zd), q = m.Q(a - sw, sg * (B + len), -0.02 + lift);
    line(ctx, p, q, '#7a5a34', 1);
    ctx.fillStyle = '#6a4a28'; ctx.beginPath(); ctx.ellipse(q[0], q[1], 1.6, 1, 0, 0, 7); ctx.fill();
  }
}
function crew(ctx, m, list, human, team, era, t, moving) {
  // list of [a, b, zd] positions; drawn in depth order
  const pts = list.map(([a, b, z]) => { const r = m.R(a, b); return { r, z, d: r[0] + r[1] }; }).sort((u, v) => u.d - v.d);
  if (!human) return;
  for (const p of pts) {
    const s = P(p.r[0], p.r[1], p.z);
    ctx.save(); ctx.translate(s[0], s[1]); ctx.scale(0.75, 0.75);
    human(ctx, 0, 0, { team, era, sprite: 'none', dir: m.c - m.s >= 0 ? 1 : -1, walk: 0, act: moving ? (t * 1.2) % 1 : 0, busy: moving, carry: -1, cls: 'crew', id: 1, noShadow: true, legs: false });
    ctx.restore();
  }
}

// --------------------------------------------------------------- ships
export function drawShip(ctx, x, y, o, human) {
  const d = o.def, sprite = d.sprite, era = d.era || o.era || 'stone';
  const team = o.team, tc = TEAM[team] || '#888', t = o.t || 0;
  const moving = o.moving ?? (o.walk > 0);
  const m = mk(o.face || 0);
  const bob = Math.sin(t * 2.1 + (o.id || 0)) * 0.025;
  ctx.save(); ctx.translate(x, y);
  const fut = era === 'future' || era === 'space';
  const ox = 0; void ox;
  switch (sprite) {
    case 'boat_fish': fishingBoat(ctx, m, era, team, tc, t, moving, bob, o, human); break;
    case 'ship_oar': oarShip(ctx, m, era, team, tc, t, moving, bob, o, human); break;
    case 'ship_sail': sailShip(ctx, m, era, team, tc, t, moving, bob, o); break;
    case 'ship_steam': steamShip(ctx, m, team, tc, t, moving, bob, o); break;
    case 'ship_modern': modernShip(ctx, m, team, tc, t, moving, bob, o); break;
    case 'ship_future': futureShip(ctx, m, team, tc, t, moving, bob, o, era); break;
    default:
      if (fut) futureShip(ctx, m, team, tc, t, moving, bob, o, era); else sailShip(ctx, m, era, team, tc, t, moving, bob, o);
  }
  ctx.restore();
}

function fishingBoat(ctx, m, era, team, tc, t, moving, bob, o, human) {
  const fut = era === 'future' || era === 'space';
  if (fut) {
    const L = 0.36, B = 0.13, z = 0.12 + bob;
    waterFx(ctx, m, L, B, o, moving, true);
    const pts = [[L, 0], [L * 0.2, B], [-L, B * 0.8], [-L, -B * 0.8], [L * 0.2, -B]];
    hull(ctx, m, pts.map(([a, b]) => [a, b]), z + 0.08, '#e8eef4', { zw: z, tuck: 0.9, deck: '#c8d2dc', stripe: tc, stripeAt: 0.2, stripeW: 0.4, L });
    rbox(ctx, m, -0.15, 0.08, -0.07, 0.07, z + 0.08, z + 0.2, '#9fd8f0');
    const e = m.Q(-L, 0, z + 0.06); const g = ctx.createRadialGradient(e[0], e[1], 0, e[0], e[1], 7); g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#7cf1ff'); g.addColorStop(1, 'rgba(0,200,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e[0], e[1], 7, 0, 7); ctx.fill();
    if (o.carry >= 0) fishPile(ctx, m, 0.18, 0, z + 0.1);
    return;
  }
  if (era === 'industrial' || era === 'modern') {
    const L = 0.42, B = 0.14, zd = 0.12 + bob;
    waterFx(ctx, m, L, B, o, moving);
    const zAt = hull(ctx, m, outline(L, B, 0.5, 0.85), zd, era === 'modern' ? '#e4e6e8' : '#3a4048', { boot: '#a83a2a', stripe: tc, stripeAt: 0.72, stripeW: 0.16, deck: '#8a8a80', sheer: 0.05, L });
    rbox(ctx, m, 0.0, 0.2, -0.08, 0.08, zAt(0.1), zAt(0.1) + 0.18, era === 'modern' ? '#f0f0f0' : '#d8d0c0', { windows: true });
    if (era === 'industrial') { const top = rcyl(ctx, m, -0.02, 0, zd + 0.1, zd + 0.38, 0.035, '#2a2a2a'); smoke(ctx, top, t, o.id); }
    else { line(ctx, m.Q(0.1, 0, zd + 0.3), m.Q(0.1, 0, zd + 0.5), '#ccc', 1); line(ctx, m.Q(-0.2, 0, zd + 0.05), m.Q(-0.25, 0, zd + 0.42), '#d8a030', 1.4); line(ctx, m.Q(-0.25, 0, zd + 0.42), m.Q(-0.5, 0.2, zd + 0.05), '#d8a030', 0.8); }
    if (o.carry >= 0) fishPile(ctx, m, -0.25, 0, zd);
    return;
  }
  if (era === 'stone' || era === 'bronze') {
    // dugout canoe / reed boat with a paddler
    const L = 0.34, B = 0.075, zd = 0.06 + bob;
    waterFx(ctx, m, L, B, o, moving);
    hull(ctx, m, outline(L, B, 0.4, 0.4), zd, era === 'stone' ? '#6a4424' : '#b8a060', { deck: '#3a2614', sheer: era === 'bronze' ? 0.08 : 0.02, L, rim: era === 'bronze' ? '#8a7440' : undefined });
    crew(ctx, m, [[-0.05, 0, zd - 0.03]], human, team, era, t, moving);
    if (moving) { const ph = t * 4; const a = m.Q(-0.05, 0.05, zd + 0.12), b = m.Q(-0.15 + Math.sin(ph) * 0.1, B + 0.2, -0.02); line(ctx, a, b, '#7a5a34', 1.1); }
    if (o.carry >= 0) fishPile(ctx, m, 0.15, 0, zd);
    return;
  }
  // rowing / sailing fishing boat (iron → gunpowder)
  const L = 0.4, B = 0.12, zd = 0.09 + bob;
  waterFx(ctx, m, L, B, o, moving);
  hull(ctx, m, outline(L, B, 0.5, 0.75), zd, era === 'classical' ? '#6a4a30' : '#5a3a20', { planks: true, deckPlanks: true, deck: '#9a7448', sheer: 0.05, L, stripe: tc, stripeAt: 0.78, stripeW: 0.14 });
  crew(ctx, m, [[-0.2, 0, zd - 0.03]], human, team, era, t, moving);
  if (o.carry >= 0) fishPile(ctx, m, 0.0, 0, zd);
  if (era === 'iron') { oars(ctx, m, 1, -0.05, -0.05, B, zd, t, moving, [-1, 1], 0.22); return; }
  mast(ctx, m, 0.1, zd, zd + 0.7);
  squareSail(ctx, m, 0.1, 0.17, zd + 0.22, zd + 0.62, '#efe6d0', team, { billow: moving ? 0.1 : 0.03 });
  // net hanging over the side
  ctx.strokeStyle = 'rgba(230,220,190,0.6)'; ctx.lineWidth = 0.5; const n0 = m.Q(-0.3, B, zd), n1 = m.Q(-0.5, B + 0.2, -0.01);
  ctx.beginPath(); ctx.moveTo(...n0); ctx.lineTo(...n1); ctx.moveTo(...m.Q(-0.2, B, zd)); ctx.lineTo(...m.Q(-0.4, B + 0.25, -0.01)); ctx.stroke();
}
function fishPile(ctx, m, a, b, z) {
  for (let k = 0; k < 4; k++) { const q = m.Q(a + (k % 2) * 0.05 - 0.02, b + (k - 1.5) * 0.025, z + 0.02); ctx.fillStyle = k % 2 ? '#b8c8d0' : '#8aa0ac'; ctx.beginPath(); ctx.ellipse(q[0], q[1] - 1, 2.2, 1, 0.4, 0, 7); ctx.fill(); }
}
function smoke(ctx, top, t, id) {
  for (let k = 0; k < 4; k++) {
    const f = ((t * 0.7 + k / 4 + (id || 0) * 0.17) % 1);
    ctx.fillStyle = `rgba(70,70,74,${0.45 * (1 - f)})`; ctx.beginPath(); ctx.arc(top[0] + f * 10, top[1] - 3 - f * 16, 2.5 + f * 5, 0, 7); ctx.fill();
  }
}

function oarShip(ctx, m, era, team, tc, t, moving, bob, o, human) {
  if (era === 'stone') {
    const L = 0.5, B = 0.09, zd = 0.07 + bob;
    waterFx(ctx, m, L, B, o, moving);
    hull(ctx, m, outline(L, B, 0.35, 0.35), zd, '#5a3a20', { deck: '#3a2614', sheer: 0.06, L, stripe: tc, stripeAt: 0.6, stripeW: 0.25 });
    crew(ctx, m, [[0.25, 0, zd - 0.03], [0.05, 0, zd - 0.03], [-0.15, 0, zd - 0.03], [-0.35, 0, zd - 0.03]], human, team, era, t, moving);
    oars(ctx, m, 4, 0.25, -0.35, B, zd + 0.06, t, moving, [1], 0.18);
    return;
  }
  const viking = era === 'medieval';
  const L = viking ? 0.62 : era === 'classical' ? 0.68 : 0.58, B = viking ? 0.15 : 0.14, zd = 0.12 + bob;
  waterFx(ctx, m, L, B, o, moving);
  const hullCol = viking ? '#6a4628' : era === 'classical' ? '#3a2c24' : '#6a4a2c';
  // oars on the far side first
  const farSide = (m.R(0, 1)[0] + m.R(0, 1)[1]) > 0 ? -1 : 1;
  oars(ctx, m, viking ? 6 : 8, L * 0.5, -L * 0.55, B, zd * 0.8, t, moving, [farSide], 0.34);
  const zAt = hull(ctx, m, outline(L, B, 0.4, 0.55), zd, hullCol, { planks: true, deckPlanks: true, deck: '#9a7448', sheer: viking ? 0.2 : 0.1, L, stripe: viking ? null : tc, stripeAt: 0.7, stripeW: 0.18 });
  // ram & eye (galleys), dragon prow (longship)
  if (!viking) {
    const r0 = m.Q(L * 0.95, 0, 0.0), r1 = m.Q(L * 1.18, 0, -0.01);
    line(ctx, r0, r1, era === 'classical' ? '#c09040' : '#7a5a34', 2.4);
    for (const sg of [-1, 1]) { const p = m.R(L * 0.8, sg * B * 0.45); const n = sg; if ((m.R(0, n)[0] + m.R(0, n)[1]) <= 0) continue; const e = P(p[0], p[1], zAt(L * 0.8) * 0.75); ctx.fillStyle = '#f0f0f0'; ctx.beginPath(); ctx.ellipse(e[0], e[1], 2, 1.2, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(e[0], e[1], 0.8, 0, 7); ctx.fill(); }
    // stern curl
    const s0 = m.Q(-L, 0, zAt(-L)), s1 = m.Q(-L - 0.06, 0, zAt(-L) + 0.18), s2 = m.Q(-L + 0.05, 0, zAt(-L) + 0.3);
    ctx.strokeStyle = shade(hullCol, 0.9); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(...s0); ctx.quadraticCurveTo(...s1, ...s2); ctx.stroke();
  } else {
    for (const [a, dir] of [[L, 1], [-L, -1]]) { const s0 = m.Q(a, 0, zAt(a)), s1 = m.Q(a + dir * 0.06, 0, zAt(a) + 0.2), s2 = m.Q(a - dir * 0.02, 0, zAt(a) + 0.3); ctx.strokeStyle = '#4a3018'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(...s0); ctx.quadraticCurveTo(...s1, ...s2); ctx.stroke(); if (dir > 0) { ctx.fillStyle = '#4a3018'; ctx.beginPath(); ctx.arc(s2[0] + 1, s2[1], 1.8, 0, 7); ctx.fill(); } }
    // shields along the near gunwale
    const near = -farSide;
    for (let i = 0; i < 7; i++) { const a = L * 0.5 - i * L * 0.16; const s = m.Q(a, near * B * 0.98, zAt(a) - 0.02); ctx.fillStyle = i % 2 ? tc : '#e8d8a8'; ctx.beginPath(); ctx.ellipse(s[0], s[1], 2.4, 2.4, 0, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.5; ctx.stroke(); ctx.fillStyle = '#888'; ctx.fillRect(s[0] - 0.6, s[1] - 0.6, 1.2, 1.2); }
  }
  // rowers
  const rows = [];
  for (let i = 0; i < 3; i++) rows.push([L * 0.35 - i * L * 0.32, 0, zd - 0.03]);
  crew(ctx, m, rows, human, team, era, t, moving);
  const top = mast(ctx, m, 0.0, zd, zd + (viking ? 0.95 : 0.85));
  squareSail(ctx, m, 0.0, viking ? 0.3 : 0.26, zd + 0.3, zd + (viking ? 0.88 : 0.8), viking ? '#e8dcc0' : '#efe4c8', team, { billow: moving ? 0.14 : 0.04, stripes: viking, band: !viking });
  pennant(ctx, top, team, t);
  oars(ctx, m, viking ? 6 : 8, L * 0.5, -L * 0.55, B, zd * 0.8, t, moving, [-farSide], 0.34);
}

function sailShip(ctx, m, era, team, tc, t, moving, bob, o) {
  const frig = era !== 'medieval';
  const L = frig ? 0.78 : 0.62, B = frig ? 0.17 : 0.19, zd = 0.16 + bob;
  waterFx(ctx, m, L, B, o, moving);
  const hullCol = frig ? '#3a2e26' : '#6a4a2c';
  const zAt = hull(ctx, m, outline(L, B, 0.45, 0.8), zd, hullCol, { planks: true, deckPlanks: true, deck: '#a8845a', sheer: 0.08, L, stripe: frig ? '#d8b048' : tc, stripeAt: frig ? 0.55 : 0.75, stripeW: frig ? 0.14 : 0.16, ports: frig, boot: frig ? '#d8d0c0' : null });
  // castles
  const parts = [];
  parts.push({ a: -L * 0.72, f: () => { rbox(ctx, m, -L * 0.95, -L * 0.5, -B * 0.82, B * 0.82, zAt(-L * 0.7), zAt(-L * 0.7) + (frig ? 0.12 : 0.2), frig ? '#4a3a2c' : '#7a5636', { windows: true, winCol: 'rgba(255,210,120,0.9)' }); } });
  if (!frig) parts.push({ a: L * 0.6, f: () => rbox(ctx, m, L * 0.45, L * 0.82, -B * 0.6, B * 0.6, zAt(L * 0.6), zAt(L * 0.6) + 0.14, '#7a5636') });
  // bowsprit
  parts.push({ a: L, f: () => line(ctx, m.Q(L * 0.8, 0, zAt(L) + 0.05), m.Q(L * 1.35, 0, zAt(L) + 0.22), '#4a3018', 1.3) });
  const masts = frig ? [[L * 0.45, 1.25, 0.28], [0, 1.45, 0.32], [-L * 0.45, 1.1, 0.25]] : [[L * 0.25, 1.15, 0.28], [-L * 0.3, 0.95, 0.22]];
  for (const [a, h, w] of masts) parts.push({ a, f: () => {
    const top = mast(ctx, m, a, zd, zd + h, '#4a3018', 1.8);
    squareSail(ctx, m, a, w, zd + h * 0.32, zd + h * 0.62, '#f2ead8', team, { billow: moving ? 0.12 : 0.04, cross: !frig, band: frig });
    squareSail(ctx, m, a, w * 0.8, zd + h * 0.66, zd + h * 0.9, '#f2ead8', team, { billow: moving ? 0.1 : 0.03, band: false });
    pennant(ctx, top, team, t + a);
  } });
  // stern ensign
  parts.push({ a: -L, f: () => { const p = m.Q(-L * 0.95, 0, zAt(-L) + 0.15), q = m.Q(-L * 1.05, 0, zAt(-L) + 0.5); line(ctx, p, q, '#4a3018', 1); ctx.fillStyle = tc; const w = Math.sin(t * 5) * 1; ctx.beginPath(); ctx.moveTo(...q); ctx.lineTo(q[0] - 8, q[1] + 1 + w); ctx.lineTo(q[0] - 8, q[1] + 6 + w); ctx.lineTo(q[0], q[1] + 5); ctx.closePath(); ctx.fill(); } });
  const order = (a) => { const r = m.R(a, 0); return r[0] + r[1]; };
  parts.sort((u, v) => order(u.a) - order(v.a)).forEach(p => p.f());
}

function steamShip(ctx, m, team, tc, t, moving, bob, o) {
  const L = 0.75, B = 0.17, zd = 0.1 + bob;
  waterFx(ctx, m, L, B, o, moving);
  const zAt = hull(ctx, m, outline(L, B, 0.4, 0.85), zd, '#3a3e44', { deck: '#6a5a48', deckPlanks: true, L, boot: '#7a2a20', rimW: 1.2 });
  const parts = [
    { a: 0.1, f: () => { rbox(ctx, m, -0.25, 0.3, -B * 0.7, B * 0.7, zd, zd + 0.14, '#4a4e56', { windows: true }); } },
    { a: 0.45, f: () => { rcyl(ctx, m, 0.45, 0, zd, zd + 0.13, 0.11, '#50545c'); line(ctx, m.Q(0.45, 0, zd + 0.09), m.Q(0.75, 0, zd + 0.1), '#222', 2.6); } },
    { a: 0.0, f: () => { const top = rcyl(ctx, m, 0.02, 0, zd + 0.14, zd + 0.55, 0.05, '#2a2a2c'); ctx.fillStyle = tc; const b = m.Q(0.02, 0, zd + 0.42); ctx.fillRect(b[0] - 3, b[1] - 2, 6, 3); smoke(ctx, top, t, o.id); } },
    { a: -0.4, f: () => { const top = mast(ctx, m, -0.4, zd, zd + 0.8, '#3a3a3a', 1.4); pennant(ctx, top, team, t); } },
  ];
  const order = (a) => { const r = m.R(a, 0); return r[0] + r[1]; };
  parts.sort((u, v) => order(u.a) - order(v.a)).forEach(p => p.f());
  void zAt;
}

function modernShip(ctx, m, team, tc, t, moving, bob, o) {
  const L = 0.9, B = 0.15, zd = 0.14 + bob;
  waterFx(ctx, m, L, B, o, moving);
  const grey = '#8a929a';
  const zAt = hull(ctx, m, outline(L, B, 0.5, 0.85), zd, grey, { deck: '#7a8088', L, boot: '#5a2a28', sheer: 0.05, rimW: 0.8 });
  // hull number
  { const nb = m.R(0, 1); const sg = nb[0] + nb[1] > 0 ? 1 : -1; const p = m.Q(L * 0.6, sg * B * 0.9, zd * 0.6); ctx.fillStyle = '#f0f0f0'; ctx.font = 'bold 5px sans-serif'; ctx.fillText(String(10 + (team || 0) * 7 + ((o.id || 0) % 7)), p[0] - 4, p[1] + 2); }
  const parts = [
    { a: 0.5, f: () => { rcyl(ctx, m, 0.52, 0, zAt(0.52), zAt(0.52) + 0.08, 0.07, '#9aa2aa'); line(ctx, m.Q(0.52, 0, zAt(0.52) + 0.05), m.Q(0.82, 0, zAt(0.52) + 0.07), '#4a4e54', 1.8); } },
    { a: 0.05, f: () => { rbox(ctx, m, -0.15, 0.3, -B * 0.7, B * 0.7, zd, zd + 0.18, '#a0a8b0', { windows: true }); rbox(ctx, m, 0.05, 0.25, -B * 0.5, B * 0.5, zd + 0.18, zd + 0.3, '#aab2ba', { windows: true, winCol: 'rgba(40,60,80,0.95)' }); } },
    { a: 0.12, f: () => { const b = m.Q(0.12, 0, zd + 0.3), tp = m.Q(0.12, 0, zd + 0.75); line(ctx, b, tp, '#5a6068', 1.2); line(ctx, m.Q(0.12, -0.08, zd + 0.6), m.Q(0.12, 0.08, zd + 0.6), '#5a6068', 1); const r = m.Q(0.12, 0, zd + 0.68); ctx.save(); ctx.translate(r[0], r[1]); ctx.rotate(t * 2); ctx.fillStyle = '#c8ccd0'; ctx.fillRect(-4, -0.8, 8, 1.6); ctx.restore(); pennant(ctx, tp, team, t, 7); } },
    { a: -0.3, f: () => { rbox(ctx, m, -0.45, -0.15, -B * 0.55, B * 0.55, zd, zd + 0.15, '#a0a8b0'); rbox(ctx, m, -0.36, -0.24, -0.05, 0.05, zd + 0.15, zd + 0.3, '#7a828a'); const c = m.Q(-0.3, 0, zd + 0.3); ctx.fillStyle = tc; ctx.fillRect(c[0] - 3, c[1] - 1, 6, 2.4); } },
    { a: -0.65, f: () => { rbox(ctx, m, -0.75, -0.55, -0.06, 0.06, zAt(-0.65), zAt(-0.65) + 0.08, '#6a7078'); } },
  ];
  const order = (a) => { const r = m.R(a, 0); return r[0] + r[1]; };
  parts.sort((u, v) => order(u.a) - order(v.a)).forEach(p => p.f());
}

function futureShip(ctx, m, team, tc, t, moving, bob, o, era) {
  const L = 0.85, B = 0.2, z = 0.2 + bob * 1.5;
  const glow = era === 'space' ? '#b090ff' : '#7cf1ff';
  waterFx(ctx, m, L, B, o, moving, true);
  // glow under the hull
  { const c = m.Q(0, 0, 0); const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], 34); g.addColorStop(0, era === 'space' ? 'rgba(176,144,255,0.45)' : 'rgba(124,241,255,0.45)'); g.addColorStop(1, 'rgba(0,200,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c[0], c[1], 34, 17, 0, 0, 7); ctx.fill(); }
  const pts = [[L, 0], [L * 0.3, B * 0.7], [-L * 0.4, B], [-L, B * 0.75], [-L, -B * 0.75], [-L * 0.4, -B], [L * 0.3, -B * 0.7]];
  const zAt = hull(ctx, m, pts, z + 0.1, era === 'space' ? '#8a96aa' : '#e6ecf2', { zw: z - 0.02, tuck: 0.75, deck: era === 'space' ? '#6a768a' : '#c8d4e0', L, stripe: tc, stripeAt: 0.45, stripeW: 0.2 });
  rbox(ctx, m, -0.35, 0.25, -B * 0.45, B * 0.45, z + 0.1, z + 0.22, era === 'space' ? '#7a869a' : '#d8e0ea');
  { const p = [m.Q(0.25, -B * 0.4, z + 0.22), m.Q(0.4, 0, z + 0.14), m.Q(0.25, B * 0.4, z + 0.22)]; ctx.fillStyle = glow; ctx.globalAlpha = 0.85; ctx.beginPath(); p.forEach((q, i) => i ? ctx.lineTo(...q) : ctx.moveTo(...q)); ctx.fill(); ctx.globalAlpha = 1; }
  rbox(ctx, m, -0.2, 0.0, -0.05, 0.05, z + 0.22, z + 0.32, '#5a6678');
  line(ctx, m.Q(0.4, 0, z + 0.12), m.Q(0.7, 0, z + 0.14), '#3a4048', 2.2);
  for (const sg of [-0.5, 0.5]) { const e = m.Q(-L, sg * B, z + 0.06); const R = moving ? 6 : 4; const g = ctx.createRadialGradient(e[0], e[1], 0, e[0], e[1], R); g.addColorStop(0, '#fff'); g.addColorStop(0.4, glow); g.addColorStop(1, 'rgba(0,200,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e[0], e[1], R, 0, 7); ctx.fill(); }
  void zAt; void ZH;
}
