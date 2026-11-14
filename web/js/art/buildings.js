// Procedural buildings for all eras. Every building is drawn with textured,
// lit planes from ./kit.js, cached to an offscreen canvas by sprites.js.
import {
  P, face, Plane, leftF, rightF, topF, planeOf, paint, tbox, lit, gableRoof, hipRoof, flatRoof, tcone, tcyl, tdome,
  win, door, eaveShadow, flag, banner, awning, barrel, crate, sack, hay, bale, logs, rockPile, fence, lamp, antenna, dish,
  solarPanel, acUnit, cart, rack, target, dummy, trough, well, pots, torch, groundPatch, vol, volBox, LIT,
  shade, mix, hexToRgb, hash2, TEAM, ZH,
} from './kit.js';

export const ST = {
  stone: { wall: '#8a6c48', wm: 'wattle', roof: '#a48a52', rm: 'thatch', base: '#8a8478', bm: 'stone', beam: '#4a3520', win: 'hole', door: 'hide', ground: '#7d6a4c', gm: 'earth', trim: '#5a4028', hide: '#a07c52' },
  bronze: { wall: '#d4ae7c', wm: 'adobe', roof: '#b89a66', rm: 'reed', base: '#a89272', bm: 'stone', beam: '#6a4a2a', win: 'hole', door: 'plank', ground: '#b49c74', gm: 'earth', trim: '#8a6a40', hide: '#b08a5a' },
  iron: { wall: '#7d5d3c', wm: 'logs', roof: '#b49a5c', rm: 'thatch', base: '#857e70', bm: 'stone', beam: '#4b3620', win: 'shutter', shutter: '#5a3d22', frame: '#4a3220', door: 'plank', ground: '#7f6c50', gm: 'earth', trim: '#4b3620', hide: '#9a7a50' },
  classical: { wall: '#efe7d4', wm: 'plaster', roof: '#b85a3c', rm: 'tiles', base: '#dcd4c0', bm: 'marble', win: 'shutter', shutter: '#3f6a4a', frame: '#e8e0cc', door: 'panel', ground: '#cfc6b0', gm: 'paving', col: '#f6f1e4', trim: '#d6ccb2', hide: '#c8b088' },
  medieval: { wall: '#e6dcc0', wm: 'timber', beam: '#3e2a1a', roof: '#8c4430', rm: 'shingle', thatch: '#b09455', base: '#8c877d', bm: 'stone', win: 'shutter', shutter: '#6a3a24', frame: '#3e2a1a', door: 'arch', ground: '#8e8270', gm: 'earth', trim: '#5a3a24', stone: '#a29c90', hide: '#b8a07a' },
  gunpowder: { wall: '#a9583e', wm: 'brick', quoin: '#e4dccb', roof: '#4f5a66', rm: 'slate', base: '#9e978b', bm: 'ashlar', win: 'sash', frame: '#f2ece0', door: 'panel', ground: '#9a9284', gm: 'paving', trim: '#e4dccb', stone: '#c8c0b0', hide: '#d8ccb0' },
  industrial: { wall: '#94493a', wm: 'brick', quoin: '#c9b99a', roof: '#40444c', rm: 'slate', base: '#7a7674', bm: 'ashlar', win: 'sash', frame: '#d8d0c0', door: 'panel', ground: '#77736e', gm: 'paving', trim: '#c8b89a', stone: '#a8a29a', metal: '#5a5e64', hide: '#8a8a70' },
  modern: { wall: '#c4c7ca', wm: 'concrete', roof: '#6a6e72', rm: 'gravel', base: '#9ea2a6', bm: 'concrete', win: 'ribbon', door: 'glass', ground: '#8a8e92', gm: 'paving', trim: '#3f86c6', glass: '#6f9fc4', metal: '#8a9096', stone: '#b4b8bc', hide: '#6a7a50' },
  future: { wall: '#e6ecf2', wm: 'panel', roof: '#a8b8cc', rm: 'roofmetal', base: '#c5ccd6', bm: 'panel', win: 'glow', door: 'hatch', ground: '#b8c2cc', gm: 'paving', trim: '#39d4ff', glass: '#7fd8f0', metal: '#b0bac6', stone: '#d4dae2', hide: '#d0d8e0' },
  space: { wall: '#8a95a6', wm: 'metal', roof: '#566072', rm: 'roofmetal', base: '#6f7a8a', bm: 'metal', win: 'glow', door: 'hatch', ground: '#5a6270', gm: 'paving', trim: '#7cf1ff', glass: '#6ad8f0', metal: '#7a8696', glow: '#ffb84a', stone: '#9aa4b2', hide: '#7a8696' },
};
const FUT = (e) => e === 'future' || e === 'space';

// tangent plane on a cylinder (for doors / windows on round buildings)
function cylFace(cx, cy, r, ang, z0 = 0, H = 1) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return new Plane([cx + c * r, cy + s * r, z0], [-s, c, 0], [0, 0, 1], 0.4, H, [c, s, 0]);
}
function ring(ctx, cx, cy, z, r, col, w = 1.5, a0 = -0.5, a1 = 2.1) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
  for (let k = 0; k <= 24; k++) { const a = a0 + (a1 - a0) * k / 24; const q = P(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z); k ? ctx.lineTo(...q) : ctx.moveTo(...q); }
  ctx.stroke();
}
function glowAt(ctx, x, y, z, r, col) {
  const [gx, gy] = P(x, y, z);
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r); g.addColorStop(0, '#fff'); g.addColorStop(0.3, col); g.addColorStop(1, 'rgba(0,200,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy, r, 0, 7); ctx.fill();
}
function line3(ctx, a, b, col, w = 1) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(...P(...a)); ctx.lineTo(...P(...b)); ctx.stroke(); }
function post(ctx, x, y, z0, z1, col = '#5a3d22', w = 1.6) {
  vol([[x - 0.03, y - 0.03, z0], [x + 0.03, y + 0.03, z1]]);
  line3(ctx, [x, y, z0], [x, y, z1], shade(col, 0.8), w);
  line3(ctx, [x - 0.012, y + 0.012, z0], [x - 0.012, y + 0.012, z1], 'rgba(255,230,190,0.25)', 0.5);
}
function crenels(ctx, x0, y0, x1, y1, z, col, mat = 'stone', h = 0.16, step = 0.26) {
  // only on the visible (front) edges plus back for silhouette
  for (let x = x0; x < x1 - 0.05; x += step) tbox(ctx, x, y0, Math.min(x1, x + step * 0.55), y0 + 0.1, z, z + h, col, mat, { edgeA: 0.3 });
  for (let y = y0; y < y1 - 0.05; y += step) tbox(ctx, x0, y, x0 + 0.1, Math.min(y1, y + step * 0.55), z, z + h, col, mat, { edgeA: 0.3 });
  for (let y = y0; y < y1 - 0.05; y += step) tbox(ctx, x1 - 0.1, y, x1, Math.min(y1, y + step * 0.55), z, z + h, col, mat, { edgeA: 0.3 });
  for (let x = x0; x < x1 - 0.05; x += step) tbox(ctx, x, y1 - 0.1, Math.min(x1, x + step * 0.55), y1, z, z + h, col, mat, { edgeA: 0.3 });
}
function chimney(ctx, x, y, z0, z1, col = '#8a4434', mat = 'brick', w = 0.09) {
  tbox(ctx, x - w, y - w, x + w, y + w, z0, z1, col, mat, { edgeA: 0.5 });
  tbox(ctx, x - w - 0.02, y - w - 0.02, x + w + 0.02, y + w + 0.02, z1, z1 + 0.04, shade(col, 0.8), null);
  const t = P(x, y, z1 + 0.04); ctx.fillStyle = '#1a1410'; ctx.beginPath(); ctx.ellipse(t[0], t[1], w * 20, w * 10, 0, 0, 7); ctx.fill();
}
function smokestack(ctx, x, y, z0, z1, r = 0.12, col = '#7a3a2c') {
  tcyl(ctx, x, y, z0, z1, r, col, 'brick', 12);
  ring(ctx, x, y, z1 - 0.12, r * 1.05, shade(col, 0.6), 2, -0.8, 2.4);
  const t = P(x, y, z1); ctx.fillStyle = '#140e0a'; ctx.beginPath(); ctx.ellipse(t[0], t[1], r * 36, r * 18, 0, 0, 7); ctx.fill();
}
// window rows on a face. n windows per row; rows at heights v[]
function windows(ctx, f, st, n, vs, w, h, opt = {}) {
  const U = f.U, step = U / n;
  for (const v of vs) for (let i = 0; i < n; i++) {
    const u = (i + 0.5) * step - w / 2;
    if (opt.skip && opt.skip(u, v)) continue;
    win(ctx, f, u, v, w, h, opt.kind || st.win, { shutter: st.shutter, frame: st.frame, sill: st.trim, glow: st.trim, lit: opt.lit });
  }
}
function beamEnds(ctx, f, v, col = '#4a3220', n = 8) {
  ctx.fillStyle = shade(col, f.light);
  for (let i = 0; i < n; i++) { const q = f.p((i + 0.5) * f.U / n, v); ctx.beginPath(); ctx.arc(q[0], q[1], 1.3, 0, 7); ctx.fill(); }
}
function stepsL(ctx, x0, x1, y, n, col, mat, dz = 0.07, dy = 0.1) {
  for (let i = n - 1; i >= 0; i--) tbox(ctx, x0, y, x1, y + dy * (i + 1), 0, dz * (n - i), col, mat, { edgeA: 0.3 });
}
function wallPlaque(ctx, f, u, v, r, col) { const q = f.p(u, v); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(q[0], q[1], r, r * 1.1, 0, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.6; ctx.stroke(); ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0], q[1] - r * 0.7); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + r * 0.5, q[1]); ctx.stroke(); }

// barrel vault (quonset / hangar) along x
function vault(ctx, x0, y0, x1, y1, z, col, mat = 'corrugated', endCol) {
  const ym = (y0 + y1) / 2, r = (y1 - y0) / 2, N = 10;
  const pt = (x, a) => [x, ym + Math.cos(a) * r, z + Math.sin(a) * r];
  vol([pt(x0, 0), pt(x1, 0), pt(x0, Math.PI), pt(x1, Math.PI), pt(x0, Math.PI / 2), pt(x1, Math.PI / 2)]);
  // end wall at x1 (half disc)
  const end = []; for (let k = 0; k <= N; k++) end.push(pt(x1, k / N * Math.PI));
  paint(ctx, planeOf([end[0], end[N], end[N >> 1]]), null, endCol || col, { ao: false, edge: false });
  face(ctx, end, null); ctx.fillStyle = shade(endCol || col, LIT.R); ctx.fill();
  for (let k = N - 1; k >= 0; k--) {
    const a0 = k / N * Math.PI, a1 = (k + 1) / N * Math.PI;
    const pts = [pt(x0, a0), pt(x1, a0), pt(x1, a1), pt(x0, a1)];
    const f = planeOf(pts);
    paint(ctx, f, mat === 'corrugated' ? 'roofmetal' : mat, col, { ao: false, edgeA: 0.12 });
  }
  return { end: (u0, u1, h) => new Plane([x1, ym - r, z], [0, 1, 0], [0, 0, 1], 2 * r, r, [1, 0, 0]) };
}

// ------------------------------------------------------------------ props: siege engine & horse silhouettes
function parkedCatapult(ctx, x, y, era) {
  const wood = '#7a5530';
  tbox(ctx, x - 0.3, y - 0.18, x + 0.3, y + 0.18, 0.06, 0.14, wood, 'hplanks', { edgeA: 0.6 });
  for (const [wx, wy] of [[x - 0.2, y + 0.19], [x + 0.2, y + 0.19]]) { const p = P(wx, wy, 0.07); ctx.strokeStyle = '#3a2614'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(p[0], p[1], 3, 3.4, 0.45, 0, 7); ctx.stroke(); }
  line3(ctx, [x, y - 0.15, 0.14], [x, y, 0.55], '#5a3a1a', 2); line3(ctx, [x, y + 0.15, 0.14], [x, y, 0.55], '#5a3a1a', 2);
  line3(ctx, [x + 0.25, y, 0.15], [x - 0.35, y, 0.8], '#6a4424', 2.4);
  const c = P(x - 0.35, y, 0.8); ctx.fillStyle = '#4a3220'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 3, 2, 0, 0, 7); ctx.fill();
  const st = P(x + 0.35, y + 0.3, 0); ctx.fillStyle = '#888'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(st[0] + i * 3, st[1] - 2 - (i % 2) * 2, 2.2, 0, 7); ctx.fill(); }
  void era;
}
function parkedCannon(ctx, x, y, col = '#2e2e2e') {
  for (const s of [-1, 1]) { const p = P(x, y + s * 0.12, 0.1); ctx.strokeStyle = '#3a2614'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 1, 3.4, 3.8, 0.45, 0, 7); ctx.stroke(); }
  line3(ctx, [x - 0.3, y, 0.05], [x + 0.05, y, 0.14], '#5a3a1a', 2.4);
  line3(ctx, [x - 0.05, y, 0.16], [x + 0.4, y, 0.2], col, 3.4);
  line3(ctx, [x - 0.05, y, 0.18], [x + 0.4, y, 0.22], 'rgba(255,255,255,0.25)', 0.8);
}
function horse(ctx, x, y, col = '#7a4a2a', flip = 1) {
  const [sx, sy] = P(x, y, 0);
  ctx.save(); ctx.translate(sx, sy); ctx.scale(flip * 0.8, 0.8);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 3, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = shade(col, 0.6); ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-6, -7); ctx.lineTo(-6.5, 0); ctx.moveTo(-4, -7); ctx.lineTo(-3, 0); ctx.moveTo(5, -7); ctx.lineTo(4.5, 0); ctx.moveTo(7, -7); ctx.lineTo(7.5, 0); ctx.stroke();
  const g = ctx.createLinearGradient(0, -14, 0, -5); g.addColorStop(0, shade(col, 1.25)); g.addColorStop(1, shade(col, 0.7));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -9.5, 8.5, 4.2, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(5, -11); ctx.lineTo(10, -18); ctx.lineTo(12.5, -16.5); ctx.lineTo(8.5, -9); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(12, -16.5, 3.2, 1.8, 0.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#2a1a10'; ctx.beginPath(); ctx.moveTo(6, -13); ctx.lineTo(9.5, -18.5); ctx.lineTo(8.5, -12); ctx.fill();
  ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-8.5, -10); ctx.quadraticCurveTo(-11, -6, -10, -3); ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ building types
// Each function draws with origin at the footprint's top corner.
function townCenter(ctx, e, st, team, s, t) {
  switch (e) {
    case 'stone': {
      groundPatch(ctx, 0.15, 0.15, 2.85, 2.85, st.ground);
      // drying rack (back)
      post(ctx, 0.35, 0.5, 0, 0.6); post(ctx, 0.35, 1.3, 0, 0.6); line3(ctx, [0.35, 0.5, 0.58], [0.35, 1.3, 0.58], '#5a3d22', 1.4);
      for (let i = 0; i < 3; i++) lit(ctx, [[0.36, 0.6 + i * 0.24, 0.2], [0.36, 0.78 + i * 0.24, 0.2], [0.36, 0.78 + i * 0.24, 0.56], [0.36, 0.6 + i * 0.24, 0.56]], i === 1 ? '#c8a070' : '#a07850', 'hide');
      tcone(ctx, 2.3, 0.55, 0, 0.42, 0.85, '#8a6a42', 'hide');
      tcone(ctx, 1.3, 1.2, 0, 0.95, 1.85, st.hide, 'hide', 22);
      // poles poking out the smoke hole
      for (let i = 0; i < 5; i++) { const a = i * 1.25; line3(ctx, [1.3, 1.2, 1.55], [1.3 + Math.cos(a) * 0.22, 1.2 + Math.sin(a) * 0.22, 2.15], '#3d2a17', 1.4); }
      // door flap facing the front
      { const f = cylFace(1.3, 1.2, 0.5, Math.PI / 4 + 0.15, 0); door(ctx, f, -0.16, 0.32, 0.65, 'hide'); }
      // painted band on the main tent
      ring(ctx, 1.3, 1.2, 0.5, 0.7, shade(TEAM[team], 0.9), 2.2, -0.6, 2.2);
      tcone(ctx, 0.6, 2.25, 0, 0.45, 0.85, '#8f6d44', 'hide');
      // fire pit with stones and logs
      for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28, p = P(2.15 + Math.cos(a) * 0.24, 2.15 + Math.sin(a) * 0.24, 0); ctx.fillStyle = shade('#8a8680', 0.8 + hash2(i, 1) * 0.4); ctx.beginPath(); ctx.ellipse(p[0], p[1] - 1, 3, 2, 0, 0, 7); ctx.fill(); }
      { const c = P(2.15, 2.15, 0); ctx.fillStyle = '#2a1a10'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 7, 3.5, 0, 0, 7); ctx.fill(); const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], 8); g.addColorStop(0, 'rgba(255,170,60,0.9)'); g.addColorStop(1, 'rgba(255,90,20,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c[0], c[1], 8, 4, 0, 0, 7); ctx.fill(); }
      line3(ctx, [2.0, 2.1, 0.03], [2.3, 2.2, 0.08], '#4a2a14', 2); line3(ctx, [2.1, 2.3, 0.03], [2.2, 2.0, 0.08], '#4a2a14', 2);
      logs(ctx, 2.6, 1.4, 2, 'y', 0.4);
      pots(ctx, 1.9, 2.55, 2, '#9a6a40');
      // totem with team banner
      post(ctx, 0.35, 0.35, 0, 1.9, '#6a4424', 2.4);
      { const c = P(0.35, 0.35, 1.9); ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 3.4, 2.6, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#222'; ctx.fillRect(c[0] - 2, c[1] - 1, 1.2, 1.2); ctx.fillRect(c[0] + 0.8, c[1] - 1, 1.2, 1.2); }
      flag(ctx, 0.35, 0.35, 1.2, 0.6, team, t, { len: 11 });
      break;
    }
    case 'bronze': {
      groundPatch(ctx, 0.1, 0.1, 2.9, 2.9, st.ground);
      const A = tbox(ctx, 0.3, 0.3, 2.7, 2.7, 0, 0.85, st.wall, 'adobe');
      flatRoof(ctx, 0.3, 0.3, 2.7, 2.7, 0.85, '#c8a678', 0.1, 'adobe', st.wall);
      beamEnds(ctx, A.L, 0.72, st.beam, 12); beamEnds(ctx, A.R, 0.72, st.beam, 12);
      windows(ctx, A.R, st, 5, [0.38], 0.12, 0.18, { kind: 'hole' });
      const B = tbox(ctx, 0.75, 0.75, 2.05, 2.05, 0.85, 1.65, st.wall, 'adobe');
      flatRoof(ctx, 0.75, 0.75, 2.05, 2.05, 1.65, '#c8a678', 0.12, 'adobe', st.wall);
      beamEnds(ctx, B.L, 0.68, st.beam, 7); beamEnds(ctx, B.R, 0.68, st.beam, 7);
      windows(ctx, B.R, st, 3, [0.3], 0.12, 0.2, { kind: 'hole' });
      banner(ctx, B.L, 0.25, 0.12, 0.22, 0.5, team); banner(ctx, B.L, 0.83, 0.12, 0.22, 0.5, team);
      door(ctx, A.L, 1.05, 0.34, 0.6, 'plank', { stepCol: '#b8a07a' });
      awning(ctx, A.L, 0.85, 0.72, 0.74, 0.22, team, '#e8d8b0');
      windows(ctx, A.L, st, 6, [0.38], 0.12, 0.18, { kind: 'hole', skip: (u) => u > 0.75 && u < 1.6 });
      pots(ctx, 2.75, 1.6, 3); pots(ctx, 0.5, 2.85, 2, '#c07a44');
      tcyl(ctx, 2.75, 0.45, 0, 0.3, 0.14, '#c49a6a', 'adobe', 12); tdome(ctx, 2.75, 0.45, 0.3, 0.14, '#c49a6a');
      flag(ctx, 1.4, 1.4, 1.65, 0.9, team, t);
      break;
    }
    case 'iron': {
      groundPatch(ctx, 0.1, 0.1, 2.9, 2.9, st.ground);
      fence(ctx, [[0.1, 0.1], [2.9, 0.1]], '#6a4a2a', 0.45, 'palisade'); fence(ctx, [[0.1, 0.1], [0.1, 2.9]], '#6a4a2a', 0.45, 'palisade');
      const A = tbox(ctx, 0.35, 0.75, 2.65, 2.25, 0, 0.55, st.wall, 'logs');
      eaveShadow(ctx, A.L, 0.2); eaveShadow(ctx, A.R, 0.1);
      door(ctx, A.L, 0.95, 0.38, 0.48, 'plank');
      windows(ctx, A.L, st, 5, [0.22], 0.1, 0.12, { kind: 'hole', skip: (u) => u > 0.8 && u < 1.5 });
      gableRoof(ctx, 0.35, 0.75, 2.65, 2.25, 0.55, 1.05, st.roof, 'thatch', true, 0.2, '#6a4a2a', 'planks');
      // crossed horns on the gable
      { const a = P(2.83, 1.5, 1.6), b = P(2.83, 1.35, 1.82), c = P(2.83, 1.65, 1.82); ctx.strokeStyle = '#3a2614'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.moveTo(...a); ctx.lineTo(...c); ctx.stroke(); }
      banner(ctx, rightF(0.75, 2.25, 2.66, 0, 0.55), 0.6, 0.0, 0.3, 0.5, team);
      logs(ctx, 2.75, 2.6, 3, 'x', 0.5);
      cart(ctx, 0.6, 2.6, 'hay');
      flag(ctx, 2.85, 0.3, 0, 1.6, team, t);
      break;
    }
    case 'classical': {
      groundPatch(ctx, 0.05, 0.05, 2.95, 2.95, st.ground, 'paving');
      tbox(ctx, 0.1, 0.1, 2.9, 2.75, 0, 0.24, st.base, 'marble');
      stepsL(ctx, 0.1, 2.9, 2.75, 3, st.base, 'marble', 0.07, 0.07);
      const C = tbox(ctx, 0.5, 0.45, 2.5, 2.35, 0.24, 1.3, st.wall, 'ashlar');
      door(ctx, C.L, 0.78, 0.44, 0.7, 'panel', { wood: '#8a6a30', frame: '#c8bea4', step: false });
      banner(ctx, C.L, 0.25, 0.25, 0.26, 0.6, team); banner(ctx, C.L, 1.5, 0.25, 0.26, 0.6, team);
      windows(ctx, C.R, st, 3, [0.45], 0.16, 0.32, { kind: 'arch' });
      for (let i = 0; i < 6; i++) col(ctx, 2.72, 0.28 + i * 0.47, 0.24, 1.36, st.col);
      for (let i = 0; i < 6; i++) col(ctx, 0.28 + i * 0.47, 2.6, 0.24, 1.36, st.col);
      tbox(ctx, 0.15, 0.15, 2.85, 2.7, 1.36, 1.52, st.trim, 'marble');
      { const f = leftF(0.15, 2.85, 2.7, 1.36, 1.52); ctx.fillStyle = shade(TEAM[team], f.light); ctx.beginPath(); f.quad(ctx, 0.1, 0.05, 2.6, 0.1); ctx.fill(); }
      gableRoof(ctx, 0.15, 0.15, 2.85, 2.7, 1.52, 0.5, st.roof, 'tiles', false, 0.06, st.trim, 'marble');
      { const c = P(1.5, 2.71, 1.72); ctx.fillStyle = shade('#c9a648', 1); ctx.beginPath(); ctx.arc(c[0], c[1], 3.2, 0, 7); ctx.fill(); }
      flag(ctx, 1.5, 0.4, 1.9, 0.9, team, t);
      break;
    }
    case 'medieval': {
      groundPatch(ctx, 0.05, 0.05, 2.95, 2.95, st.ground);
      const sc = st.stone, H = 0.75;
      // back walls
      tbox(ctx, 0.15, 0.15, 2.85, 0.35, 0, H, sc, 'stone'); crenels(ctx, 0.15, 0.15, 2.85, 0.35, H, sc);
      tbox(ctx, 0.15, 0.35, 0.35, 2.85, 0, H, sc, 'stone'); crenels(ctx, 0.15, 0.35, 0.35, 2.85, H, sc);
      tcyl(ctx, 0.27, 0.27, 0, 1.05, 0.25, sc, 'stone'); tcone(ctx, 0.27, 0.27, 1.05, 0.31, 0.5, st.roof, 'shingle');
      // keep
      const K = tbox(ctx, 0.8, 0.8, 2.05, 2.05, 0, 2.1, shade(sc, 1.04), 'stone');
      windows(ctx, K.L, st, 3, [0.9, 1.45], 0.12, 0.26, { kind: 'arch', lit: undefined });
      windows(ctx, K.R, st, 3, [0.9, 1.45], 0.1, 0.22, { kind: 'slit' });
      banner(ctx, K.L, 0.45, 0.15, 0.35, 0.65, team);
      crenels(ctx, 0.75, 0.75, 2.1, 2.1, 2.1, sc, 'stone', 0.18, 0.24);
      hipRoof(ctx, 0.95, 0.95, 1.9, 1.9, 2.1, 0.75, st.roof, 'shingle', 0.04, true);
      flag(ctx, 1.425, 1.425, 2.85, 0.75, team, t);
      tcyl(ctx, 2.73, 0.27, 0, 1.05, 0.25, sc, 'stone'); tcone(ctx, 2.73, 0.27, 1.05, 0.31, 0.5, st.roof, 'shingle');
      tcyl(ctx, 0.27, 2.73, 0, 1.05, 0.25, sc, 'stone'); tcone(ctx, 0.27, 2.73, 1.05, 0.31, 0.5, st.roof, 'shingle');
      // front walls with gatehouse
      tbox(ctx, 2.65, 0.35, 2.85, 2.65, 0, H, sc, 'stone'); crenels(ctx, 2.65, 0.35, 2.85, 2.65, H, sc);
      const W = tbox(ctx, 0.35, 2.65, 2.65, 2.85, 0, H, sc, 'stone'); crenels(ctx, 0.35, 2.65, 2.65, 2.85, H, sc);
      const G = tbox(ctx, 1.1, 2.55, 1.9, 2.95, 0, 1.15, shade(sc, 1.06), 'stone');
      door(ctx, G.L, 0.2, 0.4, 0.62, 'gate', { wood: '#4a3018', step: false });
      crenels(ctx, 1.1, 2.55, 1.9, 2.95, 1.15, sc, 'stone', 0.15, 0.2);
      banner(ctx, W.L, 0.25, 0.1, 0.22, 0.5, team); banner(ctx, W.L, 1.85, 0.1, 0.22, 0.5, team);
      tcyl(ctx, 2.73, 2.73, 0, 1.05, 0.25, sc, 'stone'); tcone(ctx, 2.73, 2.73, 1.05, 0.31, 0.5, st.roof, 'shingle');
      torch(ctx, 1.05, 2.97, 0.2, 0.35); torch(ctx, 1.95, 2.97, 0.2, 0.35);
      break;
    }
    case 'gunpowder': {
      groundPatch(ctx, 0.05, 0.05, 2.95, 2.95, st.ground, 'paving');
      const A = tbox(ctx, 0.25, 0.45, 2.75, 2.45, 0, 0.14, st.base, 'ashlar');
      const B = tbox(ctx, 0.3, 0.5, 2.7, 2.4, 0.14, 1.35, st.wall, 'brick', { quoin: st.quoin });
      windows(ctx, B.L, st, 6, [0.15, 0.72], 0.17, 0.36, { skip: (u, v) => v < 0.5 && u > 1.0 && u < 1.4 });
      windows(ctx, B.R, st, 5, [0.15, 0.72], 0.17, 0.36);
      eaveShadow(ctx, B.L); eaveShadow(ctx, B.R);
      // portico
      door(ctx, B.L, 1.0, 0.4, 0.55, 'panel', { wood: '#3a4a3a', step: false });
      stepsL(ctx, 1.05, 1.75, 2.45, 2, st.base, 'ashlar', 0.07, 0.08);
      hipRoof(ctx, 0.3, 0.5, 2.7, 2.4, 1.35, 0.7, st.roof, 'slate', 0.1);
      chimney(ctx, 0.7, 1.0, 1.6, 2.0); chimney(ctx, 2.3, 1.0, 1.6, 2.0);
      // clock tower
      const T = tbox(ctx, 1.22, 1.17, 1.78, 1.73, 1.6, 2.55, st.stone, 'ashlar');
      { const q = T.L.p(0.28, 0.6); ctx.fillStyle = '#f4f0e4'; ctx.beginPath(); ctx.ellipse(q[0], q[1], 5.5, 6, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#333'; ctx.lineWidth = 0.7; ctx.stroke(); ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0], q[1] - 4); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + 3, q[1] + 1); ctx.stroke(); }
      win(ctx, T.R, 0.18, 0.4, 0.18, 0.35, 'arch', { frame: '#d8d0c0', lit: false });
      hipRoof(ctx, 1.2, 1.15, 1.8, 1.75, 2.55, 0.95, '#4f9a80', 'slate', 0.04, true);
      flag(ctx, 1.5, 1.45, 3.5, 0.6, team, t);
      lamp(ctx, 0.95, 2.75, 0.55); lamp(ctx, 1.85, 2.75, 0.55);
      awning(ctx, B.L, 0.2, 0.62, 0.55, 0.15, team, '#f2ece0');
      awning(ctx, B.L, 1.68, 0.62, 0.55, 0.15, team, '#f2ece0');
      void A;
      break;
    }
    case 'industrial': {
      groundPatch(ctx, 0.05, 0.05, 2.95, 2.95, st.ground, 'paving');
      tbox(ctx, 0.15, 0.25, 2.85, 2.65, 0, 0.16, st.stone, 'ashlar');
      const B = tbox(ctx, 0.2, 0.3, 2.8, 2.6, 0.16, 1.55, st.wall, 'brick', { quoin: st.quoin });
      windows(ctx, B.L, st, 7, [0.18, 0.78], 0.15, 0.4, { skip: (u, v) => v < 0.5 && u > 0.95 && u < 1.55 });
      windows(ctx, B.R, st, 6, [0.18, 0.78], 0.15, 0.4);
      tbox(ctx, 0.15, 0.25, 2.85, 2.65, 1.55, 1.66, st.stone, 'ashlar');
      flatRoof(ctx, 0.15, 0.25, 2.85, 2.65, 1.66, '#4a4c52', 0.12, 'gravel', st.stone);
      // portico
      door(ctx, B.L, 1.1, 0.4, 0.62, 'panel', { wood: '#3a2a1a', step: false });
      for (let i = 0; i < 4; i++) col(ctx, 0.95 + i * 0.25, 2.75, 0.16, 1.1, st.stone, 0.05);
      gableRoof(ctx, 0.88, 2.6, 1.82, 2.88, 1.1, 0.25, st.stone, null, false, 0.02, st.stone, 'ashlar');
      stepsL(ctx, 0.9, 1.8, 2.88, 2, st.stone, 'ashlar', 0.08, 0.06);
      // drum and dome
      tcyl(ctx, 1.5, 1.45, 1.66, 2.2, 0.45, st.stone, 'ashlar', 22);
      for (let i = 0; i < 6; i++) { const a = -0.4 + i * 0.45; const f = cylFace(1.5, 1.45, 0.46, a, 1.66, 0.5); win(ctx, f, -0.04, 0.12, 0.08, 0.26, 'arch', { frame: '#e8e0d0' }); }
      tdome(ctx, 1.5, 1.45, 2.2, 0.45, '#6f9f92', { ribs: 8 });
      tcyl(ctx, 1.5, 1.45, 2.6, 2.85, 0.07, st.stone, null, 8);
      flag(ctx, 1.5, 1.45, 2.85, 0.6, team, t);
      lamp(ctx, 0.8, 2.95, 0.6); lamp(ctx, 2.0, 2.95, 0.6);
      break;
    }
    case 'modern': {
      groundPatch(ctx, 0.02, 0.02, 2.98, 2.98, st.ground, 'paving');
      const A = tbox(ctx, 0.15, 0.15, 2.85, 2.85, 0, 0.6, st.wall, 'concrete');
      windows(ctx, A.L, st, 1, [0.2], 2.5, 0.25, { kind: 'ribbon' });
      windows(ctx, A.R, st, 1, [0.2], 2.5, 0.25, { kind: 'ribbon' });
      flatRoof(ctx, 0.15, 0.15, 2.85, 2.85, 0.6, '#7e8286', 0.06, 'gravel');
      door(ctx, A.L, 1.15, 0.5, 0.42, 'glass', { canopy: TEAM[team] });
      const T = tbox(ctx, 0.55, 0.55, 1.95, 1.95, 0.6, 3.5, '#6f9fc4', 'glass', { mullion: 'rgba(200,210,220,0.7)' });
      // vertical fins
      for (const u of [0, 1.4]) { tbox(ctx, 0.55 + u - 0.03, 1.92, 0.55 + u + 0.03, 1.98, 0.6, 3.55, '#d8dadc', null); tbox(ctx, 1.92, 0.55 + u - 0.03, 1.98, 0.55 + u + 0.03, 0.6, 3.55, '#d8dadc', null); }
      flatRoof(ctx, 0.55, 0.55, 1.95, 1.95, 3.5, '#5e6266', 0.08, 'gravel', '#d8dadc');
      acUnit(ctx, 0.9, 0.9, 3.5); acUnit(ctx, 1.25, 0.85, 3.5);
      antenna(ctx, 1.6, 1.6, 3.5, 1.1);
      { const f = T.L; ctx.fillStyle = shade(TEAM[team], f.light); ctx.beginPath(); f.quad(ctx, 0, 2.7, 1.4, 2.82); ctx.fill(); }
      for (let i = 0; i < 3; i++) flag(ctx, 2.3 + i * 0.2, 2.95, 0, 1.2, team, t + i, { pole: '#c8ccd0', len: 10 });
      solarPanel(ctx, 2.1, 0.3, 2.7, 0.9, 0.62, 0.2);
      break;
    }
    default: { // future / space
      const sp = e === 'space';
      groundPatch(ctx, 0.02, 0.02, 2.98, 2.98, st.ground, 'paving');
      if (sp) { const c = P(1.5, 1.5, 0); ctx.strokeStyle = 'rgba(255,200,80,0.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.ellipse(c[0], c[1], 92, 46, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      tcyl(ctx, 1.5, 1.5, 0, 0.45, 1.36, st.wall, st.wm, 30);
      ring(ctx, 1.5, 1.5, 0.25, 1.37, st.trim, 2.2, -0.8, 2.4);
      ring(ctx, 1.5, 1.5, 0.25, 1.37, '#ffffff', 0.6, -0.8, 2.4);
      tdome(ctx, 1.5, 1.5, 0.45, 1.16, sp ? '#8ea3c0' : '#e6eef6', { ribs: 10, ring: st.trim, glass: true });
      tcyl(ctx, 1.5, 1.5, 1.4, 2.9, 0.16, st.metal, 'panel', 12);
      tcyl(ctx, 1.5, 1.5, 2.2, 2.3, 0.32, st.wall, null, 16);
      ring(ctx, 1.5, 1.5, 2.25, 0.33, st.trim, 1.6, 0, 6.3);
      glowAt(ctx, 1.5, 1.5, 3.0, 12, st.trim);
      { const f = cylFace(1.5, 1.5, 1.36, Math.PI / 4 + 0.2, 0); door(ctx, f, -0.2, 0.4, 0.38, 'hatch', { glow: st.trim }); }
      if (sp) dish(ctx, 2.6, 0.5, 0, 0.32); else solarPanel(ctx, 2.35, 0.15, 2.9, 0.7, 0.2, 0.25);
      lamp(ctx, 0.25, 2.75, 0.5, '#888', 'rgba(120,240,255,0.9)'); lamp(ctx, 2.75, 2.75, 0.5, '#888', 'rgba(120,240,255,0.9)');
      flag(ctx, 0.3, 0.3, 0, 1.5, team, t, { pole: '#c8ccd0' });
    }
  }
}
function col(ctx, x, y, z0, z1, c, r = 0.075) {
  tcyl(ctx, x, y, z0, z0 + 0.06, r * 1.35, c, null, 10);
  tcyl(ctx, x, y, z0 + 0.06, z1 - 0.06, r, c, null, 12);
  // fluting
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.5; ctx.beginPath();
  for (const a of [0.2, 0.9, 1.6]) { const q = P(x + Math.cos(a) * r, y + Math.sin(a) * r, z0 + 0.06), q2 = P(x + Math.cos(a) * r, y + Math.sin(a) * r, z1 - 0.06); ctx.moveTo(...q); ctx.lineTo(...q2); }
  ctx.stroke();
  tbox(ctx, x - r * 1.4, y - r * 1.4, x + r * 1.4, y + r * 1.4, z1 - 0.06, z1, c, null, { edgeA: 0.3 });
}

function house(ctx, e, st, team, s, t) {
  switch (e) {
    case 'stone': {
      groundPatch(ctx, 0.2, 0.2, 1.8, 1.8, st.ground);
      tcyl(ctx, 0.95, 0.95, 0, 0.42, 0.6, st.wall, 'wattle', 22, true);
      tcone(ctx, 0.95, 0.95, 0.36, 0.8, 0.95, st.roof, 'thatch', 22);
      { const f = cylFace(0.95, 0.95, 0.6, Math.PI / 4 + 0.35, 0); door(ctx, f, -0.12, 0.24, 0.36, 'hide'); }
      ring(ctx, 0.95, 0.95, 0.12, 0.6, shade(TEAM[team], 0.85), 1.8, -0.1, 1.9);
      logs(ctx, 1.7, 0.6, 2, 'y', 0.35);
      pots(ctx, 0.4, 1.65, 2, '#9a6a40');
      // drying hide on poles
      post(ctx, 1.6, 1.45, 0, 0.4, '#5a3d22', 1.2); post(ctx, 1.6, 1.8, 0, 0.4, '#5a3d22', 1.2);
      lit(ctx, [[1.61, 1.47, 0.1], [1.61, 1.78, 0.1], [1.61, 1.78, 0.38], [1.61, 1.47, 0.38]], '#c09a6a', 'hide');
      break;
    }
    case 'bronze': {
      groundPatch(ctx, 0.15, 0.15, 1.85, 1.85, st.ground);
      const A = tbox(ctx, 0.3, 0.35, 1.65, 1.6, 0, 0.72, st.wall, 'adobe');
      flatRoof(ctx, 0.3, 0.35, 1.65, 1.6, 0.72, '#c4a274', 0.08, 'adobe', st.wall);
      beamEnds(ctx, A.L, 0.62, st.beam, 6); beamEnds(ctx, A.R, 0.62, st.beam, 6);
      door(ctx, A.L, 0.5, 0.28, 0.5, 'plank', { stepCol: '#b8a07a' });
      win(ctx, A.R, 0.3, 0.32, 0.14, 0.15, 'hole'); win(ctx, A.R, 0.85, 0.32, 0.14, 0.15, 'hole');
      // rooftop parasol & reed shade
      post(ctx, 0.55, 0.6, 0.72, 1.1, '#6a4a2a', 1.1); post(ctx, 0.95, 0.6, 0.72, 1.1, '#6a4a2a', 1.1);
      lit(ctx, [[0.45, 0.95, 1.05], [1.05, 0.95, 1.05], [1.05, 0.5, 1.12], [0.45, 0.5, 1.12]], TEAM[team], null);
      // ladder on the right face
      line3(ctx, [1.67, 1.1, 0], [1.67, 1.0, 0.85], '#5a3d22', 1.1); line3(ctx, [1.67, 1.3, 0], [1.67, 1.2, 0.85], '#5a3d22', 1.1);
      for (let z = 0.12; z < 0.8; z += 0.14) line3(ctx, [1.67, 1.1 - z * 0.12, z], [1.67, 1.3 - z * 0.12, z], '#5a3d22', 0.9);
      pots(ctx, 1.8, 0.45, 2); pots(ctx, 0.2, 1.75, 1, '#c07a44');
      break;
    }
    case 'iron': {
      groundPatch(ctx, 0.15, 0.15, 1.85, 1.85, st.ground);
      const A = tbox(ctx, 0.3, 0.42, 1.65, 1.55, 0, 0.6, st.wall, 'logs');
      eaveShadow(ctx, A.L); eaveShadow(ctx, A.R, 0.1);
      door(ctx, A.L, 0.45, 0.28, 0.48, 'plank');
      win(ctx, A.R, 0.45, 0.25, 0.16, 0.16, 'shutter', { shutter: st.shutter, frame: st.frame });
      gableRoof(ctx, 0.3, 0.42, 1.65, 1.55, 0.6, 0.7, st.roof, 'thatch', true, 0.16, '#6a4a2a', 'planks');
      logs(ctx, 1.8, 0.7, 2, 'y', 0.45);
      { const p = P(0.3, 1.8, 0); ctx.fillStyle = '#7a5a3a'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 3, 4, 2, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#c8a070'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 4, 4, 2, 0, 0, 7); ctx.fill(); }
      flag(ctx, 0.25, 0.3, 0, 1.0, team, t, { len: 9 });
      break;
    }
    case 'classical': {
      groundPatch(ctx, 0.1, 0.1, 1.9, 1.9, st.ground, 'paving');
      const A = tbox(ctx, 0.25, 0.3, 1.7, 1.6, 0, 0.8, st.wall, 'plaster');
      for (const f of [A.L, A.R]) { ctx.fillStyle = shade('#a8483a', f.light); ctx.beginPath(); f.quad(ctx, 0, 0, f.U, 0.13); ctx.fill(); }
      eaveShadow(ctx, A.L); eaveShadow(ctx, A.R);
      door(ctx, A.L, 0.55, 0.3, 0.52, 'panel', { wood: '#7a5a30', frame: '#cfc4a8' });
      win(ctx, A.L, 1.12, 0.42, 0.14, 0.2, 'shutter', { shutter: st.shutter, frame: st.frame });
      windows(ctx, A.R, st, 2, [0.42], 0.14, 0.2);
      hipRoof(ctx, 0.25, 0.3, 1.7, 1.6, 0.8, 0.42, st.roof, 'tiles', 0.1);
      { const f = A.L; ctx.fillStyle = shade(TEAM[team], f.light); ctx.beginPath(); f.quad(ctx, 0.5, 0.56, 0.9, 0.62); ctx.fill(); }
      tcone(ctx, 1.85, 0.35, 0, 0.1, 0.55, '#2e5a32', null, 10);
      pots(ctx, 1.8, 1.7, 2, '#c07a44');
      tcone(ctx, 0.2, 1.85, 0, 0.1, 0.5, '#2e5a32', null, 10);
      break;
    }
    case 'medieval': {
      groundPatch(ctx, 0.1, 0.1, 1.9, 1.9, st.ground);
      fence(ctx, [[0.1, 1.9], [0.1, 0.1], [1.9, 0.1]], '#6a4a2a', 0.25, 'rail');
      const A = tbox(ctx, 0.3, 0.4, 1.65, 1.55, 0, 0.38, st.stone, 'stone');
      door(ctx, A.L, 0.35, 0.26, 0.36, 'plank');
      const B = tbox(ctx, 0.26, 0.36, 1.69, 1.59, 0.38, 0.9, st.wall, 'timber', { beam: st.beam });
      eaveShadow(ctx, B.L); eaveShadow(ctx, B.R, 0.1);
      win(ctx, B.L, 0.95, 0.15, 0.16, 0.18, 'shutter', { shutter: st.shutter, frame: st.frame });
      win(ctx, B.R, 0.5, 0.15, 0.16, 0.18, 'shutter', { shutter: st.shutter, frame: st.frame });
      win(ctx, A.R, 0.4, 0.12, 0.14, 0.16, 'shutter', { shutter: st.shutter, frame: st.frame, lintel: false });
      gableRoof(ctx, 0.26, 0.36, 1.69, 1.59, 0.9, 0.75, st.thatch, 'thatch', true, 0.15, st.wall, 'timber');
      chimney(ctx, 1.4, 0.75, 1.1, 1.75, '#8a857a', 'stone');
      banner(ctx, B.L, 0.25, 0.08, 0.18, 0.36, team);
      hay(ctx, 1.75, 1.75, 0.16); barrel(ctx, 0.25, 1.75);
      break;
    }
    case 'gunpowder': {
      groundPatch(ctx, 0.1, 0.1, 1.9, 1.9, st.ground, 'paving');
      tbox(ctx, 0.28, 0.43, 1.72, 1.57, 0, 0.1, st.base, 'ashlar');
      const A = tbox(ctx, 0.3, 0.45, 1.7, 1.55, 0.1, 1.3, st.wall, 'brick', { quoin: st.quoin });
      windows(ctx, A.L, st, 3, [0.15, 0.68], 0.16, 0.34, { skip: (u, v) => v < 0.5 && u > 0.5 && u < 0.8 });
      windows(ctx, A.R, st, 2, [0.15, 0.68], 0.16, 0.34);
      door(ctx, A.L, 0.56, 0.28, 0.52, 'panel', { wood: '#2a3a5a', step: false });
      stepsL(ctx, 0.5, 0.95, 1.55, 2, st.base, 'ashlar', 0.06, 0.06);
      eaveShadow(ctx, A.L); eaveShadow(ctx, A.R, 0.1);
      gableRoof(ctx, 0.3, 0.45, 1.7, 1.55, 1.3, 0.65, st.roof, 'slate', true, 0.08, st.wall, 'brick');
      chimney(ctx, 0.45, 1.0, 1.5, 2.15); chimney(ctx, 1.55, 1.0, 1.5, 2.15);
      awning(ctx, A.L, 0.4, 0.62, 0.6, 0.14, team, '#f2ece0');
      lamp(ctx, 1.85, 1.75, 0.6);
      break;
    }
    case 'industrial': {
      groundPatch(ctx, 0.05, 0.05, 1.95, 1.95, st.ground, 'paving');
      const A = tbox(ctx, 0.2, 0.25, 1.8, 1.75, 0, 1.75, st.wall, 'brick');
      windows(ctx, A.L, st, 4, [0.15, 0.68, 1.2], 0.15, 0.32, { skip: (u, v) => v < 0.5 && u > 0.5 && u < 0.7 });
      windows(ctx, A.R, st, 4, [0.15, 0.68, 1.2], 0.15, 0.32);
      door(ctx, A.L, 0.47, 0.26, 0.5, 'panel', { wood: '#3a2a1a' });
      tbox(ctx, 0.16, 0.21, 1.84, 1.79, 1.75, 1.84, st.trim, 'ashlar');
      flatRoof(ctx, 0.16, 0.21, 1.84, 1.79, 1.84, '#46484e', 0.07, 'gravel', st.wall);
      // fire escape
      ctx.strokeStyle = '#1e1e22'; ctx.lineWidth = 0.9;
      for (const v of [0.6, 1.12]) { const f = A.R; ctx.beginPath(); const a = P(1.82, 0.9, v), b = P(1.82, 1.5, v), c = P(1.95, 1.5, v), d = P(1.95, 0.9, v); ctx.moveTo(...a); ctx.lineTo(...d); ctx.lineTo(...c); ctx.lineTo(...b); ctx.stroke(); line3(ctx, [1.92, 0.95, v], [1.92, 1.45, v + 0.5], '#1e1e22', 0.9); void f; }
      chimney(ctx, 0.5, 0.6, 1.84, 2.3, '#7a3a2c'); chimney(ctx, 1.4, 0.6, 1.84, 2.3, '#7a3a2c');
      banner(ctx, A.L, 1.1, 0.95, 0.2, 0.42, team);
      barrel(ctx, 1.9, 1.85, '#5a5e64'); crate(ctx, 0.12, 1.85);
      break;
    }
    case 'modern': {
      groundPatch(ctx, 0.02, 0.02, 1.98, 1.98, st.ground, 'paving');
      const A = tbox(ctx, 0.2, 0.2, 1.8, 1.8, 0, 2.5, st.wall, 'concrete');
      windows(ctx, A.L, st, 1, [0.12, 0.6, 1.08, 1.56, 2.04], 1.4, 0.26, { kind: 'ribbon' });
      windows(ctx, A.R, st, 1, [0.12, 0.6, 1.08, 1.56, 2.04], 1.4, 0.26, { kind: 'ribbon' });
      // balconies
      for (const v of [0.5, 0.98, 1.46, 1.94]) {
        tbox(ctx, 0.5, 1.8, 1.2, 1.95, v, v + 0.04, '#d8dadc', null, { edgeA: 0.4 });
        lit(ctx, [[0.5, 1.95, v + 0.04], [1.2, 1.95, v + 0.04], [1.2, 1.95, v + 0.16], [0.5, 1.95, v + 0.16]], '#9ac0dc', null, { edgeA: 0.5 });
      }
      { const f = A.L; ctx.fillStyle = shade(TEAM[team], f.light); ctx.beginPath(); f.quad(ctx, 1.25, 0.5, 1.5, 2.4); ctx.fill(); }
      flatRoof(ctx, 0.2, 0.2, 1.8, 1.8, 2.5, '#6a6e72', 0.08, 'gravel');
      tcyl(ctx, 0.6, 0.6, 2.5, 2.85, 0.18, '#9aa0a6', 'metal', 12);
      acUnit(ctx, 1.3, 0.5, 2.5); antenna(ctx, 1.5, 1.4, 2.5, 0.7);
      door(ctx, A.L, 0.15, 0.3, 0.38, 'glass', { canopy: '#e0e2e4' });
      break;
    }
    default: {
      const sp = e === 'space';
      groundPatch(ctx, 0.05, 0.05, 1.95, 1.95, st.ground, 'paving');
      tcyl(ctx, 0.95, 0.95, 0, 0.32, 0.72, st.wall, st.wm, 24);
      ring(ctx, 0.95, 0.95, 0.18, 0.73, sp ? st.glow : st.trim, 2, -0.6, 2.2);
      tdome(ctx, 0.95, 0.95, 0.32, 0.64, sp ? '#9aa8bc' : '#eef4fa', { ribs: 6, ring: st.trim, glass: true });
      { const f = cylFace(0.95, 0.95, 0.72, Math.PI / 4 + 0.3, 0); door(ctx, f, -0.12, 0.24, 0.28, 'hatch', { glow: st.trim }); }
      if (sp) { tbox(ctx, 1.45, 0.25, 1.8, 0.6, 0, 0.3, st.metal, 'metal'); antenna(ctx, 1.62, 0.42, 0.3, 0.6); lamp(ctx, 1.8, 1.8, 0.35, '#888', 'rgba(255,190,80,0.9)'); }
      else { solarPanel(ctx, 1.4, 0.15, 1.9, 0.6, 0.15, 0.2); tcone(ctx, 1.8, 1.7, 0, 0.12, 0.3, '#5aa060', null, 8); }
      { const f = cylFace(0.95, 0.95, 0.72, Math.PI / 4 - 0.4, 0); ctx.fillStyle = TEAM[team]; ctx.beginPath(); f.quad(ctx, -0.15, 0.06, 0.15, 0.1); ctx.fill(); }
    }
  }
}

// storage: granary / lumber / mining
function storage(ctx, type, e, st, team, s, t, anim) {
  const res = type === 'granary' ? 0 : type === 'lumber_camp' ? 1 : 2;
  const fut = FUT(e);
  groundPatch(ctx, 0.08, 0.08, 1.92, 1.92, st.ground, fut || e === 'modern' || e === 'industrial' ? 'paving' : 'earth');
  // --- main structure
  if (e === 'stone') {
    // lean-to of poles and hides
    post(ctx, 0.25, 0.3, 0, 0.75); post(ctx, 1.45, 0.3, 0, 0.75);
    lit(ctx, [[0.2, 0.3, 0.75], [1.5, 0.3, 0.75], [1.5, 1.15, 0.12], [0.2, 1.15, 0.12]], st.roof, 'thatch');
    vol([[0.2, 0.3, 0.75], [1.5, 1.15, 0]]);
  } else if (type === 'granary' && (e === 'medieval' || e === 'gunpowder')) {
    // windmill tower (sails drawn by buildingAnim)
    const gp = e === 'gunpowder';
    tbox(ctx, 1.1, 1.1, 1.75, 1.6, 0, 0.45, gp ? st.wall : st.stone, gp ? 'brick' : 'stone');
    gableRoof(ctx, 1.1, 1.1, 1.75, 1.6, 0.45, 0.3, st.roof, gp ? 'slate' : 'shingle', true, 0.05, gp ? st.wall : st.stone, gp ? 'brick' : 'stone');
    tcyl(ctx, 0.85, 0.85, 0, 1.55, 0.5, gp ? '#e8e2d6' : st.stone, gp ? 'plaster' : 'stone', 22);
    { const f = cylFace(0.85, 0.85, 0.5, Math.PI / 4 + 0.2, 0); door(ctx, f, -0.11, 0.22, 0.4, 'arch'); win(ctx, f, -0.06, 0.8, 0.12, 0.18, 'arch', { frame: '#d8d0c0' }); }
    ring(ctx, 0.85, 0.85, 0.95, 0.52, shade(TEAM[team], 0.9), 2.4, -0.7, 2.3);
    tcone(ctx, 0.85, 0.85, 1.55, 0.58, 0.6, st.roof, gp ? 'slate' : 'thatch', 20);
    if (!anim) drawSails(ctx, e, 0);
  } else if (fut) {
    const sp = e === 'space';
    tcyl(ctx, 0.7, 0.7, 0, 0.95, 0.48, st.wall, st.wm, 20);
    tdome(ctx, 0.7, 0.7, 0.95, 0.48, sp ? '#9aa8bc' : '#e6eef6', { ribs: 6, ring: st.trim });
    ring(ctx, 0.7, 0.7, 0.5, 0.49, st.trim, 2, -0.6, 2.2);
    const B = tbox(ctx, 1.15, 0.35, 1.8, 1.0, 0, 0.45, st.metal, 'panel');
    win(ctx, B.L, 0.1, 0.18, 0.45, 0.1, 'glow', { glow: st.trim });
    door(ctx, B.R, 0.2, 0.3, 0.3, 'hatch', { glow: st.trim });
    flatRoof(ctx, 1.15, 0.35, 1.8, 1.0, 0.45, st.roof, 0.04, 'roofmetal');
  } else if (e === 'industrial' && type === 'granary') {
    // grain elevator: concrete silos and a head house
    for (let i = 0; i < 3; i++) tcyl(ctx, 0.45 + i * 0.42, 0.45, 0, 2.0, 0.22, '#cfcac0', 'concrete', 16);
    const H = tbox(ctx, 0.25, 0.75, 1.0, 1.35, 0, 2.5, '#c8c2b6', 'concrete');
    windows(ctx, H.L, st, 2, [0.5, 1.3, 2.0], 0.12, 0.2);
    gableRoof(ctx, 0.25, 0.75, 1.0, 1.35, 2.5, 0.25, '#4a4c52', 'roofmetal', false, 0.04, '#c8c2b6', 'concrete');
    line3(ctx, [1.0, 1.05, 2.0], [1.75, 1.6, 0.4], '#555', 2.2);
    { const f = H.L; ctx.fillStyle = shade(TEAM[team], f.light); ctx.beginPath(); f.quad(ctx, 0.05, 2.2, 0.7, 2.35); ctx.fill(); }
  } else if (e === 'industrial' || e === 'modern') {
    const B = tbox(ctx, 0.2, 0.25, 1.35, 1.35, 0, 0.85, e === 'modern' ? '#a8b0b6' : st.wall, e === 'modern' ? 'corrugated' : 'brick');
    door(ctx, B.L, 0.3, 0.5, 0.6, e === 'modern' ? 'hatch' : 'plank', { glow: '#f2c230', step: false });
    gableRoof(ctx, 0.2, 0.25, 1.35, 1.35, 0.85, 0.3, e === 'modern' ? '#7a8086' : st.roof, 'roofmetal', false, 0.06, e === 'modern' ? '#a8b0b6' : st.wall, e === 'modern' ? 'corrugated' : 'brick');
    { const f = B.R; ctx.fillStyle = shade(TEAM[team], f.light); ctx.beginPath(); f.quad(ctx, 0.1, 0.62, 1.0, 0.72); ctx.fill(); }
    if (type === 'lumber_camp') smokestack(ctx, 0.4, 0.4, 0.85, 1.9, 0.09);
    if (type === 'granary') { tcyl(ctx, 1.65, 0.45, 0, 1.2, 0.2, '#b8c0c6', 'corrugated', 14); tcone(ctx, 1.65, 0.45, 1.2, 0.2, 0.18, '#9aa2a8', null, 14); }
  } else {
    // shed: open-sided for lumber, closed elsewhere
    const roofMat = e === 'classical' ? 'tiles' : e === 'gunpowder' ? 'slate' : e === 'medieval' ? 'shingle' : 'thatch';
    const roofCol = e === 'medieval' ? st.roof : st.roof;
    if (type === 'lumber_camp') {
      for (const [x, y] of [[0.25, 0.3], [1.35, 0.3], [0.25, 1.3]]) post(ctx, x, y, 0, 0.7, '#5a3d22', 1.8);
      logs(ctx, 0.8, 0.8, 3, 'x', 0.8);
      post(ctx, 1.35, 1.3, 0, 0.7, '#5a3d22', 1.8);
      gableRoof(ctx, 0.25, 0.3, 1.35, 1.3, 0.7, 0.4, roofCol, roofMat, true, 0.08, '#6a4a2a', 'planks');
    } else {
      const wm = e === 'bronze' ? 'adobe' : e === 'iron' ? 'logs' : e === 'classical' ? 'plaster' : e === 'medieval' ? 'timber' : 'brick';
      const wc = e === 'medieval' ? st.wall : st.wall;
      if (type === 'granary' && e === 'bronze') {
        tcyl(ctx, 0.55, 0.55, 0, 0.6, 0.35, st.wall, 'adobe', 16); tdome(ctx, 0.55, 0.55, 0.6, 0.35, '#c8a272');
        tcyl(ctx, 1.25, 0.5, 0, 0.5, 0.3, st.wall, 'adobe', 16); tdome(ctx, 1.25, 0.5, 0.5, 0.3, '#c8a272');
        tcyl(ctx, 0.5, 1.25, 0, 0.5, 0.3, st.wall, 'adobe', 16); tdome(ctx, 0.5, 1.25, 0.5, 0.3, '#c8a272');
        { const f = cylFace(0.55, 0.55, 0.35, 1.2, 0); door(ctx, f, -0.07, 0.14, 0.25, 'plank', { step: false }); }
      } else if (type === 'granary' && e === 'iron') {
        for (const [x, y] of [[0.35, 0.4], [1.3, 0.4], [0.35, 1.3], [1.3, 1.3]]) { post(ctx, x, y, 0, 0.25, '#7a7466', 3); }
        const B = tbox(ctx, 0.25, 0.3, 1.4, 1.4, 0.25, 0.75, '#8a6a42', 'planks');
        gableRoof(ctx, 0.25, 0.3, 1.4, 1.4, 0.75, 0.55, st.roof, 'thatch', true, 0.12, '#6a4a2a', 'planks');
        door(ctx, B.L, 0.4, 0.3, 0.38, 'plank', { step: false });
        line3(ctx, [0.7, 1.75, 0], [0.7, 1.42, 0.3], '#5a3d22', 1.2); line3(ctx, [0.95, 1.75, 0], [0.95, 1.42, 0.3], '#5a3d22', 1.2);
      } else {
        const B = tbox(ctx, 0.2, 0.25, 1.35, 1.35, 0, 0.75, wc, wm, { beam: st.beam, quoin: st.quoin });
        eaveShadow(ctx, B.L); eaveShadow(ctx, B.R, 0.1);
        door(ctx, B.L, 0.3, 0.45, 0.55, e === 'medieval' ? 'arch' : 'plank', { step: false });
        win(ctx, B.R, 0.45, 0.35, 0.18, 0.18, st.win, { shutter: st.shutter, frame: st.frame });
        gableRoof(ctx, 0.2, 0.25, 1.35, 1.35, 0.75, 0.48, roofCol, roofMat, false, 0.1, wc, wm);
      }
      if (type === 'mining_camp' && e !== 'bronze') {
        // timber headframe over a shaft
        const c = P(1.45, 1.35, 0); ctx.fillStyle = '#1a1410'; ctx.beginPath(); ctx.moveTo(...P(1.25, 1.15, 0)); ctx.lineTo(...P(1.65, 1.15, 0)); ctx.lineTo(...P(1.65, 1.55, 0)); ctx.lineTo(...P(1.25, 1.55, 0)); ctx.fill(); void c;
        for (const [x, y] of [[1.25, 1.15], [1.65, 1.15], [1.25, 1.55], [1.65, 1.55]]) line3(ctx, [x, y, 0], [1.45, 1.35, 0.95], '#5a3d22', 1.6);
        const w = P(1.45, 1.35, 0.95); ctx.strokeStyle = '#3a2614'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(w[0], w[1], 4, 4, 0, 0, 7); ctx.stroke();
        line3(ctx, [1.45, 1.35, 0.85], [1.45, 1.35, 0.2], '#222', 0.6);
      }
    }
  }
  // industrial colliery headframe
  if (type === 'mining_camp' && (e === 'industrial' || e === 'modern')) {
    smokestack(ctx, 0.45, 0.45, 0.85, 2.0, 0.1);
    const x = 1.55, y = 1.25;
    for (const [dx, dy] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) line3(ctx, [x + dx, y + dy, 0], [x + dx * 0.4, y + dy * 0.4, 1.4], '#3a3e44', 1.6);
    for (let z = 0.3; z < 1.4; z += 0.3) { line3(ctx, [x - 0.15, y + 0.15, z], [x + 0.15, y + 0.15, z], '#3a3e44', 0.8); line3(ctx, [x + 0.15, y - 0.15, z], [x + 0.15, y + 0.15, z], '#3a3e44', 0.8); }
    line3(ctx, [0.9, 1.0, 0.7], [x, y, 1.45], '#3a3e44', 1.2);
    const w = P(x, y, 1.45); ctx.strokeStyle = '#2a2e34'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(w[0], w[1], 6, 6, 0, 0, 7); ctx.stroke(); ctx.lineWidth = 0.6; ctx.beginPath(); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; ctx.moveTo(w[0] + Math.cos(a) * 6, w[1] + Math.sin(a) * 6); ctx.lineTo(w[0] - Math.cos(a) * 6, w[1] - Math.sin(a) * 6); } ctx.stroke();
    vol([[x - 0.18, y - 0.18, 0], [x + 0.18, y + 0.18, 1.4]]);
  }
  // --- resource props
  if (res === 0) {
    if (fut) { for (let i = 0; i < 3; i++) crate(ctx, 1.45 + (i % 2) * 0.2, 1.4 + i * 0.15, 0.15, 0, '#7ac0a0'); }
    else if (e === 'industrial' || e === 'modern') { sack(ctx, 1.5, 1.55); sack(ctx, 1.65, 1.45); bale(ctx, 1.35, 1.75); }
    else { sack(ctx, 1.45, 1.5); sack(ctx, 1.6, 1.4); sack(ctx, 1.55, 1.62, '#d8c090'); if (e === 'stone') { pots(ctx, 0.5, 1.5, 3, '#9a6a40'); } else if (e !== 'medieval' && e !== 'gunpowder') hay(ctx, 1.65, 1.75, 0.13); else { bale(ctx, 1.75, 0.55); bale(ctx, 1.75, 0.55, 0.1); } }
    if (e === 'classical') pots(ctx, 1.75, 0.5, 3, '#c07a44');
  } else if (res === 1) {
    if (fut) { for (let i = 0; i < 2; i++) tbox(ctx, 1.4, 1.2 + i * 0.3, 1.85, 1.42 + i * 0.3, 0, 0.18, '#3a3e44', 'metal'); }
    else {
      logs(ctx, 1.6, 1.45, 3, 'y', 0.6);
      if (e !== 'stone') { // sawhorse
        line3(ctx, [0.45, 1.65, 0], [0.5, 1.7, 0.2], '#5a3d22', 1.2); line3(ctx, [0.55, 1.75, 0], [0.5, 1.7, 0.2], '#5a3d22', 1.2);
        line3(ctx, [0.85, 1.65, 0], [0.9, 1.7, 0.2], '#5a3d22', 1.2); line3(ctx, [0.95, 1.75, 0], [0.9, 1.7, 0.2], '#5a3d22', 1.2);
        line3(ctx, [0.35, 1.7, 0.22], [1.05, 1.7, 0.22], '#8a6236', 2.8);
      }
      // stump with axe
      tcyl(ctx, 1.75, 0.45, 0, 0.12, 0.09, '#6a4a2a', 'planks', 10);
      { const c = P(1.75, 0.45, 0.12); ctx.fillStyle = '#d8b07a'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 4, 2, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#6a4424'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[0] + 4, c[1] - 7); ctx.stroke(); ctx.fillStyle = '#aab'; ctx.fillRect(c[0] - 1, c[1] - 2, 3, 2.4); }
      if (e === 'medieval' || e === 'gunpowder') cart(ctx, 0.55, 1.75, 'logs');
    }
  } else {
    if (fut) { tcyl(ctx, 1.55, 1.5, 0, 0.35, 0.18, '#3a4450', 'metal', 12); glowAt(ctx, 1.55, 1.5, 0.4, 7, '#43d2ff'); }
    else {
      rockPile(ctx, 1.5, 1.55, '#9a9890', 7, true);
      if (e !== 'stone' && e !== 'industrial' && e !== 'modern') cart(ctx, 0.55, 1.7, 'ore');
      if (e === 'industrial' || e === 'modern') rockPile(ctx, 0.45, 1.6, '#2a2a2e', 7);
      // pickaxe leaning
      const a = P(1.85, 0.55, 0), b = P(1.85, 0.5, 0.35); ctx.strokeStyle = '#6b4424'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); ctx.strokeStyle = '#aab'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(b[0] - 4, b[1] + 1); ctx.quadraticCurveTo(b[0], b[1] - 2, b[0] + 4, b[1] + 1); ctx.stroke();
    }
  }
  const fz = e === 'stone' ? 0 : 0;
  flag(ctx, 0.15, 1.5, fz, e === 'stone' ? 0.9 : 1.15, team, t, { len: 10, pole: fut ? '#c8ccd0' : undefined });
}

// windmill sails (also used live for animation)
export function drawSails(ctx, e, t, x = 0.85, y = 0.85, z = 1.45, r = 0.5) {
  // sails turn in a vertical plane facing the viewer (normal +x+y)
  const d = r * 0.82;
  const hub = P(x + d, y + d, z);
  const gp = e === 'gunpowder';
  const L = 44 * r / 0.5;
  ctx.save(); ctx.translate(hub[0], hub[1]);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + t * 1.1;
    const c = Math.cos(a), s = Math.sin(a);
    const at = (k, w) => [c * L * k - s * w, s * L * k + c * w];
    ctx.strokeStyle = '#4a3018'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(...at(1, 0)); ctx.stroke();
    const w = L * 0.2;
    ctx.fillStyle = gp ? 'rgba(244,238,224,0.92)' : 'rgba(228,214,182,0.9)';
    ctx.beginPath(); ctx.moveTo(...at(0.22, 0)); ctx.lineTo(...at(0.98, 0)); ctx.lineTo(...at(0.98, w)); ctx.lineTo(...at(0.22, w * 0.8)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(70,50,30,0.7)'; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.beginPath(); for (let k = 1; k < 5; k++) { const f = 0.22 + k * 0.152; ctx.moveTo(...at(f, 0)); ctx.lineTo(...at(f, w * (0.8 + 0.2 * f))); } ctx.stroke();
  }
  ctx.fillStyle = '#3a2614'; ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, 7); ctx.fill();
  ctx.restore();
}

function farm(ctx, e, st, team, s, t) {
  const fut = FUT(e);
  const soil = fut ? '#3a4a52' : e === 'stone' ? '#6a5236' : '#6e4e2e';
  groundPatch(ctx, 0.05, 0.05, s - 0.05, s - 0.05, soil, 'field', false);
  // furrows
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const x = 0.2 + i * 0.22;
    ctx.strokeStyle = 'rgba(30,18,8,0.35)'; ctx.beginPath(); ctx.moveTo(...P(x, 0.12)); ctx.lineTo(...P(x, s - 0.12)); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,170,0.08)'; ctx.beginPath(); ctx.moveTo(...P(x + 0.06, 0.12)); ctx.lineTo(...P(x + 0.06, s - 0.12)); ctx.stroke();
  }
  if (fut) {
    for (let r = 0; r < 5; r++) {
      const x = 0.25 + r * 0.52;
      tbox(ctx, x, 0.2, x + 0.38, s - 0.2, 0, 0.1, '#c8d0da', 'panel', { edgeA: 0.4 });
      for (let i = 0; i < 12; i++) { const p = P(x + 0.19, 0.3 + i * 0.21, 0.1); ctx.fillStyle = shade('#5ad86a', 0.8 + hash2(r, i) * 0.5); ctx.beginPath(); ctx.ellipse(p[0], p[1] - 2, 4, 3, 0, 0, 7); ctx.fill(); }
      const a = P(x + 0.19, 0.2, 0.12), b = P(x + 0.19, s - 0.2, 0.12); ctx.strokeStyle = e === 'space' ? 'rgba(220,120,255,0.6)' : 'rgba(120,240,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
    }
    return;
  }
  const crop = e === 'stone' ? [100, 150, 60] : e === 'classical' ? [70, 120, 50] : [212, 182, 82];
  if (e === 'stone') {
    for (let i = 0; i < 40; i++) { const p = P(0.3 + hash2(i, 1, 6) * 2.4, 0.3 + hash2(i, 2, 6) * 2.4, 0); const r = 3 + hash2(i, 3, 6) * 3; ctx.fillStyle = shade(crop, 0.7 + hash2(i, 4, 6) * 0.5); ctx.beginPath(); ctx.ellipse(p[0], p[1] - r * 0.6, r, r * 0.75, 0, 0, 7); ctx.fill(); if (i % 4 === 0) { ctx.fillStyle = '#c4223a'; ctx.beginPath(); ctx.arc(p[0] + 1, p[1] - r, 1.2, 0, 7); ctx.fill(); } }
  } else if (e === 'classical') {
    // vineyard rows on posts
    for (let r = 0; r < 6; r++) {
      const x = 0.3 + r * 0.45;
      line3(ctx, [x, 0.2, 0.3], [x, s - 0.2, 0.3], 'rgba(60,40,20,0.8)', 0.6);
      for (let i = 0; i < 10; i++) { const y = 0.25 + i * 0.27; const p = P(x, y, 0.22); ctx.fillStyle = shade(crop, 0.75 + hash2(r, i, 2) * 0.5); ctx.beginPath(); ctx.ellipse(p[0], p[1], 5, 4, 0, 0, 7); ctx.fill(); if (hash2(r, i, 3) > 0.5) { ctx.fillStyle = '#5a2a5a'; ctx.beginPath(); ctx.arc(p[0] + 2, p[1] + 2, 1.4, 0, 7); ctx.fill(); } }
    }
  } else {
    // wheat: rows of short golden strokes
    for (let r = 0; r < 12; r++) {
      const x = 0.27 + r * 0.22;
      for (let i = 0; i < 22; i++) {
        const y = 0.18 + i * 0.12 + hash2(r, i) * 0.04;
        const p = P(x, y, 0), h = 6 + hash2(r, i, 2) * 3;
        ctx.strokeStyle = shade(crop, 0.7 + hash2(r, i, 3) * 0.45); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(p[0] - 1.5, p[1]); ctx.lineTo(p[0] - 2, p[1] - h); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] - h - 1); ctx.moveTo(p[0] + 1.5, p[1]); ctx.lineTo(p[0] + 2.2, p[1] - h); ctx.stroke();
        ctx.fillStyle = shade(crop, 1.15); ctx.fillRect(p[0] - 0.8, p[1] - h - 2, 1.6, 2);
      }
    }
  }
  // edge decoration per era
  if (e === 'medieval') { fence(ctx, [[0.05, s - 0.05], [s - 0.05, s - 0.05], [s - 0.05, 0.05]], '#6a4a2a', 0.2, 'rail'); scarecrow(ctx, 1.5, 1.5, team); }
  else if (e === 'gunpowder' || e === 'industrial') { fence(ctx, [[0.05, s - 0.05], [s - 0.05, s - 0.05], [s - 0.05, 0.05]], '#e8e0d0', 0.16, 'picket'); bale(ctx, 2.7, 0.4); bale(ctx, 2.7, 0.62); }
  else if (e === 'modern') {
    line3(ctx, [0.2, 1.5, 0.3], [2.8, 1.5, 0.3], '#c8ccd0', 1.5);
    for (let i = 0; i < 5; i++) { const x = 0.3 + i * 0.6; line3(ctx, [x, 1.4, 0], [x, 1.5, 0.3], '#9aa0a6', 1); line3(ctx, [x, 1.6, 0], [x, 1.5, 0.3], '#9aa0a6', 1); }
  } else if (e === 'bronze' || e === 'iron') {
    ctx.strokeStyle = 'rgba(80,140,170,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...P(0.1, s - 0.12)); ctx.lineTo(...P(s - 0.1, s - 0.12)); ctx.stroke();
  }
  void team; void t;
}
function scarecrow(ctx, x, y, team) {
  const b = P(x, y, 0), t = P(x, y, 0.55);
  ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(...b); ctx.lineTo(...t); ctx.moveTo(t[0] - 6, t[1] + 4); ctx.lineTo(t[0] + 6, t[1] + 4); ctx.stroke();
  ctx.fillStyle = TEAM[team] || '#888'; ctx.beginPath(); ctx.moveTo(t[0] - 3, t[1] + 2); ctx.lineTo(t[0] + 3, t[1] + 2); ctx.lineTo(t[0] + 4, t[1] + 11); ctx.lineTo(t[0] - 4, t[1] + 11); ctx.fill();
  ctx.fillStyle = '#d8c080'; ctx.beginPath(); ctx.arc(t[0], t[1] - 1, 2.6, 0, 7); ctx.fill();
  ctx.fillStyle = '#6a4a2a'; ctx.beginPath(); ctx.ellipse(t[0], t[1] - 3, 4.5, 1.3, 0, 0, 7); ctx.fill();
}

// military buildings and academy
function military(ctx, type, e, st, team, s, t) {
  const fut = FUT(e);
  const tc = TEAM[team] || '#888';
  groundPatch(ctx, 0.05, 0.05, 2.95, 2.95, st.ground, ['classical', 'gunpowder', 'industrial', 'modern', 'future', 'space'].includes(e) ? 'paving' : 'earth');
  if (e === 'stone' || (e === 'bronze' && type === 'stable')) {
    // camp: palisade, tents, props
    fence(ctx, [[0.1, 2.9], [0.1, 0.1], [2.9, 0.1]], '#6a4a2a', 0.45, 'palisade');
    if (type === 'stable') {
      fence(ctx, [[0.9, 0.9], [2.7, 0.9], [2.7, 2.7], [0.9, 2.7], [0.9, 0.9]], '#6a4a2a', 0.26, 'rail');
      horse(ctx, 1.6, 1.4, '#7a4a2a'); horse(ctx, 2.1, 2.0, '#a08a6a', -1); hay(ctx, 1.3, 2.2, 0.15); trough(ctx, 2.2, 1.2);
      tcone(ctx, 0.5, 0.5, 0, 0.35, 0.75, st.hide, 'hide');
    } else {
      tcone(ctx, 0.75, 0.8, 0, 0.55, 1.1, type === 'academy' ? '#7a5aa0' : st.hide, 'hide', 18);
      tcone(ctx, 1.85, 0.7, 0, 0.45, 0.9, '#9a7448', 'hide');
      tcone(ctx, 0.7, 1.9, 0, 0.45, 0.9, '#8f6d44', 'hide');
      if (type === 'barracks') { rack(ctx, 1.8, 1.8, team, 'x'); dummy(ctx, 2.4, 2.2); }
      if (type === 'range') { target(ctx, 2.5, 1.6); target(ctx, 2.5, 2.4); rockPile(ctx, 1.6, 2.3, '#8a8680', 5); }
      if (type === 'academy') {
        // totem pole and standing stones
        tcyl(ctx, 1.8, 1.8, 0, 1.6, 0.09, '#7a5030', 'planks', 10);
        for (let k = 0; k < 4; k++) { const c = P(1.8, 1.8, 0.3 + k * 0.35); ctx.fillStyle = ['#c84a2a', '#e8c040', '#2a6ab0', '#e8e0d0'][k]; ctx.fillRect(c[0] - 3, c[1] - 2, 6, 2); ctx.fillStyle = '#111'; ctx.fillRect(c[0] - 2, c[1] - 6, 1.2, 1.2); ctx.fillRect(c[0] + 1, c[1] - 6, 1.2, 1.2); }
        for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; tbox(ctx, 1.8 + Math.cos(a) * 0.8 - 0.08, 1.8 + Math.sin(a) * 0.8 - 0.06, 1.8 + Math.cos(a) * 0.8 + 0.08, 1.8 + Math.sin(a) * 0.8 + 0.06, 0, 0.5, '#8a8680', 'stone'); }
      }
      if (type === 'workshop') { parkedCatapult(ctx, 2.0, 2.0, e); logs(ctx, 2.5, 0.8, 3, 'y', 0.6); }
    }
    for (const [x, y] of [[0.1, 0.1]]) flag(ctx, x + 0.2, y + 0.2, 0, 1.6, team, t);
    return;
  }
  if (fut) {
    const sp = e === 'space';
    if (type === 'stable' && sp) {
      // starport landing pad
      tcyl(ctx, 1.6, 1.6, 0, 0.12, 1.2, '#5a6270', 'metal', 28);
      const c = P(1.6, 1.6, 0.12); ctx.strokeStyle = '#ffd04a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(c[0], c[1], 44, 22, 0, 0, 7); ctx.stroke(); ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = 'rgba(255,208,74,0.8)'; ctx.textAlign = 'center'; ctx.save(); ctx.translate(c[0], c[1]); ctx.scale(1, 0.5); ctx.fillText('H', 0, 6); ctx.restore();
      for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28; lamp(ctx, 1.6 + Math.cos(a) * 1.15, 1.6 + Math.sin(a) * 1.15, 0.15, '#666', 'rgba(255,190,80,0.9)'); }
      const T = tbox(ctx, 0.2, 0.2, 0.7, 0.7, 0, 1.4, st.wall, 'metal'); win(ctx, T.L, 0.05, 1.05, 0.4, 0.18, 'glow', { glow: st.trim }); win(ctx, T.R, 0.05, 1.05, 0.4, 0.18, 'glow', { glow: st.trim });
      flatRoof(ctx, 0.2, 0.2, 0.7, 0.7, 1.4, st.roof, 0.04, 'roofmetal'); antenna(ctx, 0.45, 0.45, 1.4, 0.6);
      flag(ctx, 2.8, 0.25, 0, 1.3, team, t, { pole: '#c8ccd0' });
      return;
    }
    if (type === 'workshop' && sp) {
      // orbital shipyard gantry
      tbox(ctx, 0.2, 0.2, 2.8, 2.8, 0, 0.1, '#4a525e', 'metal');
      for (const x of [0.4, 2.6]) for (const y of [0.4, 2.6]) tbox(ctx, x - 0.06, y - 0.06, x + 0.06, y + 0.06, 0.1, 2.0, '#9aa4b2', 'metal');
      tbox(ctx, 0.34, 0.34, 2.66, 0.46, 1.9, 2.05, '#c0c8d2', 'metal'); tbox(ctx, 0.34, 0.34, 0.46, 2.66, 1.9, 2.05, '#c0c8d2', 'metal');
      // hull under construction
      tbox(ctx, 0.8, 1.2, 2.3, 1.8, 0.2, 0.7, '#7a8696', 'metal');
      gableRoof(ctx, 0.8, 1.2, 2.3, 1.8, 0.7, 0.2, '#9aa4b2', 'roofmetal', true, 0, '#7a8696', 'metal');
      for (let k = 0; k < 3; k++) glowAt(ctx, 1.0 + k * 0.6, 1.5, 0.8, 5, st.glow);
      tbox(ctx, 2.54, 0.34, 2.66, 2.66, 1.9, 2.05, '#c0c8d2', 'metal'); tbox(ctx, 0.34, 2.54, 2.66, 2.66, 1.9, 2.05, '#c0c8d2', 'metal');
      flag(ctx, 2.8, 2.8, 0, 1.2, team, t, { pole: '#c8ccd0' });
      return;
    }
    const B = tbox(ctx, 0.2, 0.25, 2.8, 2.75, 0, 0.7, st.wall, st.wm);
    win(ctx, B.L, 0.15, 0.42, 2.3, 0.1, 'glow', { glow: st.trim }); win(ctx, B.R, 0.15, 0.42, 2.3, 0.1, 'glow', { glow: st.trim });
    door(ctx, B.L, 0.9, 0.8, 0.38, 'hatch', { glow: tc });
    { ctx.fillStyle = shade(tc, B.R.light); ctx.beginPath(); B.R.quad(ctx, 0.2, 0.58, 2.3, 0.64); ctx.fill(); }
    flatRoof(ctx, 0.2, 0.25, 2.8, 2.75, 0.7, st.roof, 0.05, 'roofmetal');
    const U = tbox(ctx, 0.5, 0.5, 2.0, 2.0, 0.7, 1.15, st.metal, 'panel');
    win(ctx, U.L, 0.1, 0.18, 1.3, 0.1, 'glow', { glow: st.trim });
    flatRoof(ctx, 0.5, 0.5, 2.0, 2.0, 1.15, st.roof, 0.03, 'roofmetal');
    if (type === 'academy') { tcyl(ctx, 1.25, 1.25, 1.15, 2.6, 0.18, st.wall, 'panel', 14); tdome(ctx, 1.25, 1.25, 2.6, 0.35, '#cfe8ff', { ring: st.trim, glass: true }); for (const z of [1.6, 2.1]) ring(ctx, 1.25, 1.25, z, 0.4, st.trim, 1.4, 0, 6.3); }
    if (type === 'stable') { const c = P(1.25, 1.25, 1.16); ctx.strokeStyle = st.trim; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(c[0], c[1], 26, 13, 0, 0, 7); ctx.stroke(); ctx.lineWidth = 0.7; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    if (type === 'workshop') { for (let k = 0; k < 3; k++) { const c = P(2.4, 0.6 + k * 0.35, 1.0 + k * 0.25); ctx.fillStyle = '#c8d0da'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 5, 2.5, 0, 0, 7); ctx.fill(); ctx.fillStyle = st.trim; ctx.beginPath(); ctx.arc(c[0], c[1], 1.2, 0, 7); ctx.fill(); } }
    if (type === 'range') { for (let k = 0; k < 3; k++) { const c = P(0.4 + k * 0.4, 2.9, 0.4); ctx.strokeStyle = st.trim; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(c[0], c[1], 4, 5, 0, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(c[0], c[1], 1.5, 0, 7); ctx.stroke(); } }
    if (type === 'barracks') { antenna(ctx, 1.8, 0.7, 1.15, 0.8); acUnit(ctx, 0.8, 0.8, 1.15); }
    flag(ctx, 2.85, 0.2, 0, 1.4, team, t, { pole: '#c8ccd0' });
    return;
  }
  // ---------- historic & industrial/modern eras
  const ind = e === 'industrial', mod = e === 'modern';
  const wallMat = { bronze: 'adobe', iron: 'logs', classical: 'plaster', medieval: 'stone', gunpowder: 'brick', industrial: 'brick', modern: 'concrete' }[e];
  const roofMat = { bronze: 'reed', iron: 'thatch', classical: 'tiles', medieval: 'shingle', gunpowder: 'slate', industrial: 'slate', modern: 'gravel' }[e];
  const wallCol = e === 'medieval' ? st.stone : st.wall;

  if (type === 'academy') { academy(ctx, e, st, team, t); return; }
  if (type === 'stable' && (ind || mod)) {
    // motor pool / tank factory: hangar
    tbox(ctx, 0.25, 0.5, 2.75, 2.5, 0, 0.35, mod ? '#9ea2a6' : st.wall, mod ? 'concrete' : 'brick');
    const V = vault(ctx, 0.25, 0.5, 2.75, 2.5, 0.35, mod ? '#8a948a' : '#6a6e74', 'corrugated', mod ? '#9ea2a6' : st.wall);
    const ef = new Plane([2.75, 0.5, 0], [0, 1, 0], [0, 0, 1], 2, 1.2, [1, 0, 0]);
    door(ctx, ef, 0.45, 1.1, 0.75, 'plank', { wood: mod ? '#5a6248' : '#4a4e54', frame: '#2a2a2a', step: false });
    { ctx.fillStyle = tc; ctx.beginPath(); ef.quad(ctx, 0.45, 0.8, 1.55, 0.88); ctx.fill(); }
    void V;
    // parked vehicle
    tbox(ctx, 1.4, 2.6, 2.1, 2.92, 0.04, 0.22, '#5b6a46', 'metal'); tbox(ctx, 1.6, 2.65, 1.9, 2.87, 0.22, 0.33, '#6a7a52', 'metal'); line3(ctx, [1.6, 2.76, 0.28], [1.2, 2.76, 0.3], '#2a2a2a', 2);
    barrel(ctx, 0.4, 2.75, '#4a5a3a'); barrel(ctx, 0.55, 2.8, '#4a5a3a');
    flag(ctx, 0.2, 0.25, 0, 1.6, team, t, { pole: '#c8ccd0' });
    return;
  }
  if (type === 'range' && (ind || mod)) {
    const B = tbox(ctx, 0.2, 0.2, 1.4, 1.1, 0, 0.8, wallCol, wallMat);
    win(ctx, B.L, 0.2, 0.35, 0.8, 0.25, mod ? 'ribbon' : 'sash', { frame: st.frame });
    door(ctx, B.R, 0.3, 0.3, 0.5, mod ? 'glass' : 'panel');
    if (mod) flatRoof(ctx, 0.2, 0.2, 1.4, 1.1, 0.8, '#6a6e72', 0.05); else gableRoof(ctx, 0.2, 0.2, 1.4, 1.1, 0.8, 0.35, st.roof, 'slate', true, 0.08, wallCol, wallMat);
    // berm
    lit(ctx, [[0.2, 2.6, 0], [2.8, 2.6, 0], [2.8, 2.85, 0.35], [0.2, 2.85, 0.35]], '#6a7a44', 'earth');
    lit(ctx, [[2.8, 2.85, 0.35], [2.8, 2.6, 0], [2.8, 2.95, 0]], '#5a6a3a', 'earth');
    for (let i = 0; i < 4; i++) target(ctx, 0.6 + i * 0.6, 2.6, 'board');
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.8; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(...P(0.3 + i * 0.6, 1.3)); ctx.lineTo(...P(0.3 + i * 0.6, 2.5)); ctx.stroke(); }
    sandbags(ctx, 2.2, 0.5);
    flag(ctx, 2.7, 0.3, 0, 1.3, team, t, { pole: '#c8ccd0' });
    return;
  }
  if (type === 'range') {
    // open shooting pavilion along the back, lanes and butts in front
    const z = 0.8;
    const B = tbox(ctx, 0.2, 0.22, 2.8, 0.36, 0, z, wallCol, e === 'medieval' ? 'stone' : wallMat, { quoin: st.quoin });
    banner(ctx, rightF(0.22, 0.36, 2.8, 0, z), 0.0, 0.2, 0.13, 0.45, team);
    void B;
    for (const x of [0.25, 1.1, 1.95, 2.75]) post(ctx, x, 1.2, 0, z, '#5a3d22', 2);
    bale(ctx, 0.6, 0.6); bale(ctx, 0.6, 0.6, 0.1); barrel(ctx, 1.5, 0.55); crate(ctx, 2.2, 0.6);
    rack(ctx, 1.9, 0.75, team, 'x', e === 'gunpowder' ? 'gun' : 'spear');
    if (e === 'bronze') flatRoof(ctx, 0.15, 0.2, 2.85, 1.25, z, '#c4a274', 0.05, 'reed', st.wall);
    else gableRoof(ctx, 0.15, 0.2, 2.85, 1.25, z, 0.45, st.roof, roofMat, true, 0.1, wallCol, e === 'medieval' ? 'timber' : wallMat);
    fence(ctx, [[0.15, 2.85], [2.85, 2.85], [2.85, 1.4]], '#6a4a2a', 0.22, 'rail');
    ctx.strokeStyle = 'rgba(255,240,200,0.35)'; ctx.lineWidth = 0.8; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(...P(0.3 + i * 0.75, 1.35)); ctx.lineTo(...P(0.3 + i * 0.75, 2.75)); ctx.stroke(); }
    for (let i = 0; i < 3; i++) { hay(ctx, 0.68 + i * 0.75, 2.62, 0.12); target(ctx, 0.68 + i * 0.75, 2.5); }
    flag(ctx, 0.2, 0.25, z + 0.45, 0.8, team, t);
    return;
  }
  // main hall
  const tall = type === 'barracks' ? 1.0 : 0.9;
  let hx0 = 0.2, hy0 = 0.25, hx1 = 2.8, hy1 = 1.45;
  if (type === 'barracks' || type === 'workshop') { hx1 = 1.6; hy1 = 2.75; }
  if (type === 'stable') { hx0 = 0.2; hy0 = 0.2; hx1 = 1.45; hy1 = 2.0; }
  if (e === 'classical' && type === 'barracks') {
    // castrum: walled camp with tents
    const sc = st.base;
    tbox(ctx, 0.15, 0.15, 2.85, 0.3, 0, 0.55, sc, 'ashlar'); tbox(ctx, 0.15, 0.3, 0.3, 2.85, 0, 0.55, sc, 'ashlar');
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { const x = 0.75 + c * 0.7, y = 0.75 + r * 0.8; lit(ctx, [[x - 0.25, y + 0.2, 0], [x + 0.25, y + 0.2, 0], [x + 0.25, y, 0.35], [x - 0.25, y, 0.35]], '#d8c8a0', 'hide'); lit(ctx, [[x + 0.25, y + 0.2, 0], [x + 0.25, y - 0.2, 0], [x + 0.25, y, 0.35]], '#c8b890', null); vol([[x - 0.25, y - 0.2, 0], [x + 0.25, y + 0.2, 0.35]]); }
    rack(ctx, 2.3, 2.35, team, 'x');
    tbox(ctx, 2.7, 0.3, 2.85, 2.85, 0, 0.55, sc, 'ashlar');
    const W = tbox(ctx, 0.3, 2.7, 2.7, 2.85, 0, 0.55, sc, 'ashlar');
    const G = tbox(ctx, 1.1, 2.62, 1.9, 2.92, 0, 0.95, sc, 'ashlar'); door(ctx, G.L, 0.22, 0.36, 0.55, 'arch', { step: false });
    crenels(ctx, 1.1, 2.62, 1.9, 2.92, 0.95, sc, 'ashlar', 0.12, 0.22);
    banner(ctx, W.L, 0.2, 0.05, 0.22, 0.42, team); banner(ctx, W.L, 1.95, 0.05, 0.22, 0.42, team);
    // vexillum standard
    post(ctx, 2.4, 2.3, 0, 1.3, '#6a4a2a', 1.4); { const c = P(2.4, 2.3, 1.25); ctx.fillStyle = tc; ctx.fillRect(c[0] - 5, c[1], 10, 9); ctx.fillStyle = '#e8c860'; ctx.fillRect(c[0] - 5, c[1] + 8, 10, 1.5); ctx.strokeStyle = '#6a4a2a'; ctx.beginPath(); ctx.moveTo(c[0] - 6, c[1]); ctx.lineTo(c[0] + 6, c[1]); ctx.stroke(); }
    return;
  }
  const lower = e === 'medieval' ? 'stone' : wallMat;
  const H = tbox(ctx, hx0, hy0, hx1, hy1, 0, tall, wallCol, lower, { quoin: st.quoin });
  const alongX = (hx1 - hx0) >= (hy1 - hy0);
  eaveShadow(ctx, H.L); eaveShadow(ctx, H.R, 0.12);
  // facade
  if (type === 'stable') {
    for (let i = 0; i < 3; i++) door(ctx, H.R, 0.2 + i * 0.55, 0.36, 0.5, 'plank', { step: false, wood: '#6a4424' });
    win(ctx, H.L, 0.45, 0.45, 0.3, 0.22, 'hole');
  } else if (type === 'workshop') {
    door(ctx, H.R, 0.6, 1.0, 0.75, 'plank', { step: false, wood: '#5a3a20' });
    windows(ctx, H.L, st, 2, [0.4], 0.18, 0.28, { kind: st.win === 'hole' ? 'hole' : st.win });
  } else {
    door(ctx, alongX ? H.L : H.R, alongX ? 1.1 : 1.0, 0.4, 0.6, e === 'medieval' ? 'arch' : 'plank');
    windows(ctx, alongX ? H.R : H.L, st, alongX ? 2 : 2, [0.4], 0.16, 0.25);
    windows(ctx, alongX ? H.L : H.R, st, 5, [0.4], 0.16, 0.25, { skip: (u) => u > 0.9 && u < 1.6 });
  }
  if (e === 'bronze') { flatRoof(ctx, hx0, hy0, hx1, hy1, tall, '#c4a274', 0.08, 'adobe', st.wall); beamEnds(ctx, H.L, tall - 0.12, st.beam, 8); beamEnds(ctx, H.R, tall - 0.12, st.beam, 8); }
  else if (mod) { flatRoof(ctx, hx0, hy0, hx1, hy1, tall, '#6a6e72', 0.06); acUnit(ctx, hx0 + 0.4, hy0 + 0.4, tall); }
  else if (ind && type === 'workshop') {
    for (let i = 0; i < 4; i++) { const ya = hy0 + i * (hy1 - hy0) / 4, yb = ya + (hy1 - hy0) / 4; lit(ctx, [[hx0, yb, tall], [hx1, yb, tall], [hx1, ya, tall + 0.4], [hx0, ya, tall + 0.4]], st.roof, 'slate'); lit(ctx, [[hx1, ya, tall], [hx1, yb, tall], [hx1, ya, tall + 0.4]], st.wall, 'brick'); lit(ctx, [[hx0, ya, tall], [hx1, ya, tall], [hx1, ya, tall + 0.4], [hx0, ya, tall + 0.4]], '#9ab8c8', 'glass'); }
    vol([[hx0, hy0, tall], [hx1, hy1, tall + 0.4]]);
  } else gableRoof(ctx, hx0, hy0, hx1, hy1, tall, e === 'iron' ? 0.75 : 0.55, e === 'medieval' && type === 'stable' ? st.thatch : st.roof, e === 'medieval' && type === 'stable' ? 'thatch' : roofMat, alongX, 0.12, e === 'medieval' ? st.wall : wallCol, e === 'medieval' ? 'timber' : wallMat);
  if (ind || (e === 'gunpowder' && type === 'workshop')) smokestack(ctx, hx0 + 0.35, hy0 + 0.35, tall, tall + 1.5, 0.12);
  banner(ctx, H.L, 0.15, tall * 0.3, 0.2, tall * 0.55, team);
  // medieval barracks tower
  if (e === 'medieval' && type === 'barracks') {
    const T = tbox(ctx, 0.2, 0.25, 0.75, 0.8, tall, 1.9, st.stone, 'stone');
    win(ctx, T.L, 0.2, 0.3, 0.15, 0.3, 'slit'); win(ctx, T.R, 0.2, 0.3, 0.15, 0.3, 'slit');
    crenels(ctx, 0.17, 0.22, 0.78, 0.83, 1.9, st.stone, 'stone', 0.14, 0.2);
  }
  // yard props by type
  if (type === 'barracks') {
    fence(ctx, [[1.85, 0.2], [2.85, 0.2], [2.85, 2.85], [1.8, 2.85]], e === 'gunpowder' || ind ? '#3a3a3a' : '#6a4a2a', 0.25, ind || e === 'gunpowder' ? 'picket' : 'rail');
    rack(ctx, 2.25, 0.6, team, 'y', e === 'gunpowder' || ind ? 'gun' : 'spear');
    dummy(ctx, 2.3, 1.5); dummy(ctx, 2.5, 2.1);
    if (e === 'gunpowder') parkedCannon(ctx, 2.2, 2.55);
    if (ind) sandbags(ctx, 2.2, 2.5);
  } else if (type === 'range') {
    fence(ctx, [[0.15, 2.85], [2.85, 2.85], [2.85, 1.6]], '#6a4a2a', 0.22, 'rail');
    for (let i = 0; i < 3; i++) target(ctx, 0.6 + i * 0.75, 2.55);
    rack(ctx, 2.4, 1.85, team, 'x', e === 'gunpowder' ? 'gun' : 'spear');
    ctx.strokeStyle = 'rgba(255,240,200,0.25)'; ctx.lineWidth = 0.8; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(...P(0.3 + i * 0.75, 1.6)); ctx.lineTo(...P(0.3 + i * 0.75, 2.75)); ctx.stroke(); }
  } else if (type === 'stable') {
    fence(ctx, [[1.6, 0.2], [2.85, 0.2], [2.85, 2.85], [0.2, 2.85], [0.2, 2.15], [1.6, 2.15], [1.6, 0.2]], '#6a4a2a', 0.25, 'rail');
    horse(ctx, 2.2, 0.9, '#7a4a2a'); horse(ctx, 1.1, 2.5, '#3a2a1e', -1); horse(ctx, 2.4, 2.0, '#b0906a');
    trough(ctx, 2.3, 2.6); hay(ctx, 1.9, 2.55, 0.15);
  } else if (type === 'workshop') {
    if (e === 'gunpowder' || ind) { parkedCannon(ctx, 2.2, 1.0); parkedCannon(ctx, 2.3, 1.9); barrel(ctx, 2.6, 2.6); barrel(ctx, 2.45, 2.7); }
    else { parkedCatapult(ctx, 2.25, 1.7, e); logs(ctx, 2.5, 0.6, 3, 'x', 0.6); }
    // treadwheel crane / jib
    line3(ctx, [1.7, 2.7, 0], [1.75, 2.6, 1.6], '#5a3d22', 2); line3(ctx, [1.75, 2.6, 1.6], [2.4, 2.65, 1.3], '#5a3d22', 1.6); line3(ctx, [2.4, 2.65, 1.3], [2.4, 2.65, 0.5], '#222', 0.6);
    crate(ctx, 2.4, 2.65, 0.14, 0.36);
  }
  flag(ctx, hx0 + 0.05, hy0 + 0.05, tall + (e === 'iron' ? 0.6 : 0.45), 0.8, team, t);
}
function sandbags(ctx, x, y) {
  for (let r = 0; r < 2; r++) for (let i = 0; i < 4 - r; i++) { const p = P(x + (i - 1.5 + r * 0.5) * 0.14, y, 0.06 + r * 0.08); ctx.fillStyle = shade('#a89870', 0.85 + hash2(i, r) * 0.3); ctx.beginPath(); ctx.ellipse(p[0], p[1], 4.4, 2.6, 0.45, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(60,50,30,0.5)'; ctx.lineWidth = 0.5; ctx.stroke(); }
}

function academy(ctx, e, st, team, t) {
  const tc = TEAM[team] || '#888';
  switch (e) {
    case 'bronze': { // ziggurat
      for (let k = 0; k < 3; k++) { const m = 0.25 + k * 0.38; const B = tbox(ctx, m, m, 3 - m, 3 - m, k * 0.45, (k + 1) * 0.45, shade(st.wall, 1 - k * 0.04), 'adobe'); beamEnds(ctx, B.L, 0.35, st.beam, 8); }
      for (let k = 0; k < 6; k++) tbox(ctx, 1.25, 2.75 - k * 0.12, 1.75, 2.87 - k * 0.12, 0, (k + 1) * 0.2, '#c8a272', 'adobe', { edgeA: 0.3 });
      const S = tbox(ctx, 1.2, 1.2, 1.8, 1.8, 1.35, 1.85, '#e0c090', 'adobe');
      door(ctx, S.L, 0.2, 0.2, 0.3, 'plank', { step: false });
      { ctx.fillStyle = shade('#3a6ab0', S.R.light); ctx.beginPath(); S.R.quad(ctx, 0, 0.35, 0.6, 0.45); ctx.fill(); }
      flatRoof(ctx, 1.2, 1.2, 1.8, 1.8, 1.85, '#d0b080', 0.04, 'adobe');
      flag(ctx, 1.5, 1.5, 1.85, 0.8, team, t);
      break;
    }
    case 'iron': {
      for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28; tbox(ctx, 1.5 + Math.cos(a) * 1.25 - 0.08, 1.5 + Math.sin(a) * 1.25 - 0.06, 1.5 + Math.cos(a) * 1.25 + 0.08, 1.5 + Math.sin(a) * 1.25 + 0.06, 0, 0.6, '#8a8680', 'stone'); }
      tcyl(ctx, 1.5, 1.5, 0, 0.55, 0.85, st.wall, 'logs', 22, true);
      tcone(ctx, 1.5, 1.5, 0.5, 1.05, 1.25, st.roof, 'thatch', 24);
      { const f = cylFace(1.5, 1.5, 0.85, Math.PI / 4 + 0.3, 0); door(ctx, f, -0.15, 0.3, 0.45, 'plank'); }
      ring(ctx, 1.5, 1.5, 0.3, 0.86, shade(tc, 0.9), 2, -0.3, 1.9);
      flag(ctx, 1.5, 1.5, 1.75, 0.6, team, t);
      break;
    }
    case 'classical': {
      tbox(ctx, 0.15, 0.15, 2.85, 2.85, 0, 0.2, st.base, 'marble');
      const C = tbox(ctx, 0.45, 0.45, 2.3, 2.3, 0.2, 1.2, st.wall, 'ashlar');
      door(ctx, C.L, 0.7, 0.42, 0.62, 'panel', { wood: '#8a6a30', step: false });
      banner(ctx, C.L, 0.2, 0.2, 0.22, 0.55, team);
      for (let i = 0; i < 6; i++) col(ctx, 0.3 + i * 0.47, 2.62, 0.2, 1.26, st.col);
      for (let i = 0; i < 6; i++) col(ctx, 2.62, 0.3 + i * 0.47, 0.2, 1.26, st.col);
      tbox(ctx, 0.2, 0.2, 2.8, 2.8, 1.26, 1.4, st.trim, 'marble');
      flatRoof(ctx, 0.2, 0.2, 2.8, 2.8, 1.4, st.roof, 0, 'tiles');
      tcyl(ctx, 1.4, 1.4, 1.4, 1.75, 0.6, st.wall, 'ashlar', 24);
      tdome(ctx, 1.4, 1.4, 1.75, 0.6, '#d8c89a', { ribs: 10 });
      // armillary sphere
      { const c = P(2.5, 0.5, 1.75); ctx.strokeStyle = '#c9a648'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(c[0], c[1], 5, 5, 0, 0, 7); ctx.ellipse(c[0], c[1], 5, 2, 0.4, 0, 7); ctx.stroke(); line3(ctx, [2.5, 0.5, 1.4], [2.5, 0.5, 1.6], '#c9a648', 1.2); }
      flag(ctx, 0.3, 0.3, 1.4, 0.9, team, t);
      break;
    }
    case 'medieval': { // monastery church + bell tower
      const sc = st.stone;
      const N = tbox(ctx, 0.3, 0.6, 2.75, 1.7, 0, 1.15, sc, 'ashlar');
      windows(ctx, N.L, st, 5, [0.35], 0.14, 0.45, { kind: 'arch' });
      door(ctx, N.R, 0.35, 0.4, 0.65, 'arch', { wood: '#5a3a20' });
      { const f = N.R; ctx.fillStyle = 'rgba(40,60,120,0.85)'; const q = f.p(0.55, 0.92); ctx.beginPath(); ctx.arc(q[0], q[1], 4.5, 0, 7); ctx.fill(); ctx.strokeStyle = '#d8c080'; ctx.lineWidth = 0.7; ctx.stroke(); }
      eaveShadow(ctx, N.L);
      gableRoof(ctx, 0.3, 0.6, 2.75, 1.7, 1.15, 0.85, st.roof, 'slate', true, 0.08, sc, 'ashlar');
      // cloister wall front
      tbox(ctx, 0.3, 2.6, 2.75, 2.75, 0, 0.45, sc, 'stone');
      const W = leftF(0.3, 2.75, 2.75, 0, 0.45);
      for (let i = 0; i < 6; i++) win(ctx, W, 0.15 + i * 0.4, 0.05, 0.2, 0.3, 'arch', { lit: false, frame: '#b8b0a0' });
      const T = tbox(ctx, 0.25, 1.85, 0.85, 2.45, 0, 2.3, sc, 'ashlar');
      win(ctx, T.L, 0.2, 1.75, 0.2, 0.3, 'arch', { lit: false }); win(ctx, T.R, 0.2, 1.75, 0.2, 0.3, 'arch', { lit: false });
      banner(ctx, T.L, 0.17, 0.6, 0.26, 0.55, team);
      hipRoof(ctx, 0.25, 1.85, 0.85, 2.45, 2.3, 1.0, st.roof, 'slate', 0.05, true);
      flag(ctx, 0.55, 2.15, 3.3, 0.5, team, t, { len: 9 });
      well(ctx, 2.2, 2.15);
      break;
    }
    case 'gunpowder': case 'industrial': { // university / institute
      const ind = e === 'industrial';
      tbox(ctx, 0.2, 0.4, 2.8, 2.6, 0, 0.14, st.base, 'ashlar');
      const B = tbox(ctx, 0.25, 0.45, 2.75, 2.55, 0.14, 1.4, st.wall, 'brick', { quoin: st.quoin });
      windows(ctx, B.L, st, 6, [0.15, 0.7], 0.16, 0.36, { skip: (u, v) => v < 0.5 && u > 1.0 && u < 1.4 });
      windows(ctx, B.R, st, 5, [0.15, 0.7], 0.16, 0.36);
      door(ctx, B.L, 1.04, 0.42, 0.56, 'arch', { wood: '#3a2a1a', step: false });
      stepsL(ctx, 1.0, 1.6, 2.55, 2, st.base, 'ashlar', 0.07, 0.07);
      eaveShadow(ctx, B.L); eaveShadow(ctx, B.R);
      if (ind) { tbox(ctx, 0.2, 0.4, 2.8, 2.6, 1.4, 1.5, st.trim, 'ashlar'); flatRoof(ctx, 0.2, 0.4, 2.8, 2.6, 1.5, st.roof, 0.08, 'slate', st.trim); }
      else hipRoof(ctx, 0.25, 0.45, 2.75, 2.55, 1.4, 0.65, st.roof, 'slate', 0.1);
      if (ind) {
        const T = tbox(ctx, 1.15, 1.15, 1.75, 1.75, 1.5, 2.9, st.wall, 'brick', { quoin: st.quoin });
        { const q = T.L.p(0.3, 1.05); ctx.fillStyle = '#f4f0e4'; ctx.beginPath(); ctx.ellipse(q[0], q[1], 6, 6.5, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#222'; ctx.lineWidth = 0.7; ctx.stroke(); ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + 1, q[1] - 5); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] - 3, q[1] + 1); ctx.stroke(); }
        { const q = T.R.p(0.3, 1.05); ctx.fillStyle = '#e4e0d4'; ctx.beginPath(); ctx.ellipse(q[0], q[1], 6, 6.5, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#222'; ctx.stroke(); }
        hipRoof(ctx, 1.12, 1.12, 1.78, 1.78, 2.9, 0.8, st.roof, 'slate', 0.03, true);
        flag(ctx, 1.45, 1.45, 3.7, 0.5, team, t);
      } else {
        // observatory dome with telescope slit
        tcyl(ctx, 1.9, 1.2, 1.65, 2.05, 0.42, st.stone, 'ashlar', 20);
        tdome(ctx, 1.9, 1.2, 2.05, 0.42, '#c0c6cc', { ribs: 8 });
        { const a = P(1.9, 1.2, 2.45), b = P(2.15, 1.35, 2.15); ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); line3(ctx, [1.95, 1.25, 2.3], [2.25, 1.45, 2.65], '#8a6a30', 2.2); }
        flag(ctx, 0.5, 0.7, 1.9, 0.7, team, t);
      }
      awning(ctx, B.L, 0.25, 0.62, 0.5, 0.12, team, '#f2ece0');
      lamp(ctx, 0.95, 2.85, 0.6); lamp(ctx, 1.75, 2.85, 0.6);
      break;
    }
    case 'modern': { // laboratory with radio dish
      const A = tbox(ctx, 0.2, 0.2, 2.2, 2.8, 0, 1.2, st.wall, 'concrete');
      windows(ctx, A.L, st, 1, [0.15, 0.65], 1.8, 0.3, { kind: 'ribbon' });
      windows(ctx, A.R, st, 1, [0.15, 0.65], 2.4, 0.3, { kind: 'ribbon' });
      door(ctx, A.L, 0.8, 0.45, 0.4, 'glass', { canopy: tc });
      flatRoof(ctx, 0.2, 0.2, 2.2, 2.8, 1.2, '#6a6e72', 0.06);
      acUnit(ctx, 0.6, 0.6, 1.2); acUnit(ctx, 0.9, 0.6, 1.2);
      const G = tbox(ctx, 0.6, 1.6, 1.6, 2.5, 1.2, 1.9, '#7aa6c8', 'glass', { mullion: 'rgba(220,226,232,0.8)' });
      flatRoof(ctx, 0.6, 1.6, 1.6, 2.5, 1.9, '#d8dadc', 0.03);
      void G;
      tbox(ctx, 2.3, 0.5, 2.8, 1.0, 0, 0.3, '#9ea2a6', 'concrete');
      dish(ctx, 2.55, 0.75, 0.3, 0.55);
      flag(ctx, 2.7, 2.7, 0, 1.3, team, t, { pole: '#c8ccd0' });
      break;
    }
    default: break;
  }
}

function tower(ctx, e, st, team, t) {
  switch (e) {
    case 'stone': {
      for (const [x, y] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) post(ctx, x, y, 0, 1.9, '#5a3d22', 2);
      line3(ctx, [0.2, 0.8, 0.6], [0.8, 0.8, 1.2], '#5a3d22', 1.2); line3(ctx, [0.8, 0.2, 0.6], [0.8, 0.8, 1.2], '#5a3d22', 1.2);
      tbox(ctx, 0.12, 0.12, 0.88, 0.88, 1.9, 2.0, '#8a6a42', 'hplanks');
      fence(ctx, [[0.12, 0.88], [0.88, 0.88], [0.88, 0.12]], '#6a4a2a', 0.2, 'rail');
      for (const [x, y] of [[0.15, 0.15], [0.85, 0.85]]) post(ctx, x, y, 2.0, 2.35, '#5a3d22', 1.2);
      tcone(ctx, 0.5, 0.5, 2.3, 0.55, 0.45, '#a48a52', 'thatch');
      flag(ctx, 0.5, 0.5, 2.7, 0.5, team, t, { len: 10 });
      break;
    }
    case 'bronze': {
      const A = tbox(ctx, 0.12, 0.12, 0.88, 0.88, 0, 1.9, st.wall, 'adobe');
      win(ctx, A.L, 0.3, 1.2, 0.14, 0.22, 'hole'); win(ctx, A.R, 0.3, 1.2, 0.14, 0.22, 'hole');
      door(ctx, A.L, 0.25, 0.26, 0.45, 'plank', { step: false });
      beamEnds(ctx, A.L, 1.75, st.beam, 4); beamEnds(ctx, A.R, 1.75, st.beam, 4);
      flatRoof(ctx, 0.1, 0.1, 0.9, 0.9, 1.9, '#c8a678', 0.12, 'adobe', st.wall);
      crenels(ctx, 0.1, 0.1, 0.9, 0.9, 2.02, st.wall, 'adobe', 0.1, 0.2);
      flag(ctx, 0.5, 0.5, 2.0, 0.6, team, t);
      break;
    }
    case 'iron': {
      for (const [x, y] of [[0.18, 0.18], [0.82, 0.18], [0.18, 0.82], [0.82, 0.82]]) post(ctx, x, y, 0, 1.5, '#5a3d22', 2.2);
      line3(ctx, [0.18, 0.82, 0.1], [0.82, 0.82, 1.4], '#5a3d22', 1.3); line3(ctx, [0.82, 0.18, 0.1], [0.82, 0.82, 1.4], '#5a3d22', 1.3);
      const A = tbox(ctx, 0.08, 0.08, 0.92, 0.92, 1.5, 2.0, '#7d5d3c', 'planks');
      win(ctx, A.L, 0.3, 0.2, 0.25, 0.12, 'hole'); win(ctx, A.R, 0.3, 0.2, 0.25, 0.12, 'hole');
      banner(ctx, A.L, 0.05, 0.0, 0.16, 0.45, team);
      hipRoof(ctx, 0.08, 0.08, 0.92, 0.92, 2.0, 0.55, st.roof, 'thatch', 0.08, true);
      flag(ctx, 0.5, 0.5, 2.55, 0.5, team, t, { len: 10 });
      break;
    }
    case 'classical': case 'medieval': {
      const sc = e === 'medieval' ? st.stone : st.base;
      tcyl(ctx, 0.5, 0.5, 0, 0.25, 0.47, sc, 'stone', 20);
      tcyl(ctx, 0.5, 0.5, 0.25, 2.2, 0.42, sc, e === 'medieval' ? 'stone' : 'ashlar', 20);
      for (const z of [0.9, 1.6]) { const f = cylFace(0.5, 0.5, 0.42, Math.PI / 4 + 0.6, z); win(ctx, f, -0.06, 0, 0.12, 0.28, 'slit'); const g = cylFace(0.5, 0.5, 0.42, Math.PI / 4 - 0.6, z - 0.3); win(ctx, g, -0.06, 0, 0.12, 0.28, 'slit'); }
      { const f = cylFace(0.5, 0.5, 0.42, Math.PI / 4 + 0.2, 0.25); door(ctx, f, -0.1, 0.2, 0.42, 'arch', { step: false }); }
      tcyl(ctx, 0.5, 0.5, 2.2, 2.32, 0.48, sc, 'stone', 20);
      for (let k = 0; k < 10; k++) { const a = -0.9 + k * 0.33; if (Math.cos(a) + Math.sin(a) < -0.2) continue; tbox(ctx, 0.5 + Math.cos(a) * 0.43 - 0.05, 0.5 + Math.sin(a) * 0.43 - 0.05, 0.5 + Math.cos(a) * 0.43 + 0.05, 0.5 + Math.sin(a) * 0.43 + 0.05, 2.32, 2.45, sc, null, { edgeA: 0.3 }); }
      ring(ctx, 0.5, 0.5, 1.95, 0.43, shade(TEAM[team], 0.9), 2.4, -0.6, 2.2);
      if (e === 'medieval') { tcone(ctx, 0.5, 0.5, 2.32, 0.46, 0.85, st.roof, 'shingle'); flag(ctx, 0.5, 0.5, 3.15, 0.45, team, t, { len: 10 }); }
      else flag(ctx, 0.5, 0.5, 2.45, 0.6, team, t);
      break;
    }
    case 'gunpowder': {
      const sc = st.stone;
      const A = tbox(ctx, 0.05, 0.05, 0.95, 0.95, 0, 0.9, sc, 'ashlar');
      for (const f of [A.L, A.R]) { const L = f.light; ctx.fillStyle = shade('#1a1410', 1); ctx.beginPath(); f.quad(ctx, 0.35, 0.45, 0.55, 0.62); ctx.fill(); void L; }
      parkedCannonTop(ctx);
      crenels(ctx, 0.03, 0.03, 0.97, 0.97, 0.9, sc, 'ashlar', 0.14, 0.24);
      const T = tbox(ctx, 0.25, 0.25, 0.7, 0.7, 0.9, 1.45, sc, 'ashlar');
      win(ctx, T.L, 0.15, 0.2, 0.14, 0.2, 'sash', { frame: '#e8e0d0' });
      hipRoof(ctx, 0.25, 0.25, 0.7, 0.7, 1.45, 0.4, st.roof, 'slate', 0.04, true);
      flag(ctx, 0.475, 0.475, 1.85, 0.6, team, t, { len: 10 });
      break;
    }
    case 'industrial': case 'modern': {
      const mod = e === 'modern';
      const A = tbox(ctx, 0.05, 0.05, 0.95, 0.95, 0, mod ? 0.55 : 0.85, mod ? '#8d9190' : '#9a9690', 'concrete');
      win(ctx, A.L, 0.15, mod ? 0.28 : 0.5, 0.6, 0.1, 'slit'); win(ctx, A.R, 0.15, mod ? 0.28 : 0.5, 0.6, 0.1, 'slit');
      ctx.fillStyle = '#111'; for (const f of [A.L, A.R]) { ctx.beginPath(); f.quad(ctx, 0.15, mod ? 0.28 : 0.5, 0.75, (mod ? 0.28 : 0.5) + 0.1); ctx.fill(); }
      flatRoof(ctx, 0.05, 0.05, 0.95, 0.95, mod ? 0.55 : 0.85, mod ? '#6a6e66' : '#5a5e58', 0.05, 'gravel');
      if (mod) { tcyl(ctx, 0.5, 0.5, 0.55, 0.75, 0.25, '#6a7060', 'metal', 14); line3(ctx, [0.5, 0.5, 0.7], [0.95, 0.85, 0.75], '#222', 2.6); }
      sandbags(ctx, 0.5, 1.0);
      flag(ctx, 0.15, 0.15, mod ? 0.55 : 0.85, 0.7, team, t, { pole: '#888' });
      break;
    }
    default: { // future / space turret
      const sp = e === 'space';
      tcyl(ctx, 0.5, 0.5, 0, 0.25, 0.46, st.base, 'panel', 16);
      tcyl(ctx, 0.5, 0.5, 0.25, 1.3, 0.3, st.wall, st.wm, 16);
      ring(ctx, 0.5, 0.5, 0.8, 0.31, st.trim, 2, -0.6, 2.2);
      tdome(ctx, 0.5, 0.5, 1.3, 0.36, st.roof, { ring: st.trim });
      const a = P(0.5, 0.5, 1.55), b = P(1.05, 1.0, 1.65);
      ctx.strokeStyle = '#3a4048'; ctx.lineWidth = sp ? 5 : 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a[0], a[1] - 1.5); ctx.lineTo(b[0], b[1] - 1.5); ctx.stroke();
      glowAt(ctx, 1.05, 1.0, 1.65, 6, sp ? '#b090ff' : st.trim);
      flag(ctx, 0.15, 0.85, 0.25, 0.9, team, t, { pole: '#c8ccd0', len: 9 });
    }
  }
}
function parkedCannonTop(ctx) { line3(ctx, [0.6, 0.6, 1.0], [1.05, 0.95, 1.05], '#2a2a2a', 3); }

function generator(ctx, e, st, team, t, anim) {
  groundPatch(ctx, 0.05, 0.05, 1.95, 1.95, st.ground, FUT(e) || e === 'modern' || e === 'industrial' ? 'paving' : 'earth');
  if (e === 'medieval') {
    // post mill
    post(ctx, 0.95, 0.95, 0, 0.5, '#5a3d22', 3); line3(ctx, [0.6, 0.95, 0], [0.95, 0.95, 0.4], '#5a3d22', 1.5); line3(ctx, [0.95, 1.3, 0], [0.95, 0.95, 0.4], '#5a3d22', 1.5);
    const B = tbox(ctx, 0.6, 0.6, 1.3, 1.3, 0.5, 1.45, '#8a6a42', 'planks');
    door(ctx, B.L, 0.25, 0.2, 0.35, 'plank', { step: false });
    gableRoof(ctx, 0.6, 0.6, 1.3, 1.3, 1.45, 0.4, '#6a4a2a', 'shingle', true, 0.05, '#8a6a42', 'planks');
    if (!anim) drawSails(ctx, e, 0, 0.6, 0.95, 1.2, 0.5);
    sack(ctx, 1.5, 1.5); sack(ctx, 1.6, 1.35);
  } else if (e === 'industrial') {
    const B = tbox(ctx, 0.15, 0.15, 1.85, 1.5, 0, 1.0, st.wall, 'brick', { quoin: st.quoin });
    windows(ctx, B.L, st, 4, [0.3], 0.18, 0.45, { kind: 'arch' }); windows(ctx, B.R, st, 3, [0.3], 0.18, 0.45, { kind: 'arch' });
    gableRoof(ctx, 0.15, 0.15, 1.85, 1.5, 1.0, 0.4, st.roof, 'slate', true, 0.08, st.wall, 'brick');
    smokestack(ctx, 1.5, 1.4, 0, 2.7, 0.17); smokestack(ctx, 1.1, 1.55, 0, 2.3, 0.15);
    rockPile(ctx, 0.5, 1.75, '#222226', 8);
  } else if (e === 'modern') {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) solarPanel(ctx, 0.15 + i * 0.9, 0.15 + j * 0.85, 0.85 + i * 0.9, 0.7 + j * 0.85, 0.2, 0.25);
    tbox(ctx, 1.55, 1.6, 1.9, 1.9, 0, 0.35, '#6a7a6a', 'metal');
    for (let k = 0; k < 3; k++) { const a = P(1.6 + k * 0.1, 1.62, 0.35), b = P(1.6 + k * 0.1, 1.62, 0.5); ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
  } else if (FUT(e)) {
    const sp = e === 'space';
    tcyl(ctx, 1, 1, 0, 0.4, 0.82, st.wall, st.wm, 24);
    ring(ctx, 1, 1, 0.2, 0.83, st.trim, 2, -0.7, 2.3);
    // torus ring
    ctx.save(); const c = P(1, 1, 0.75); ctx.strokeStyle = sp ? '#b090ff' : '#7cf1ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(c[0], c[1], 34, 17, 0, 0, 7); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    for (let k = 0; k < 4; k++) { const a = k / 4 * 6.28 + 0.4; line3(ctx, [1 + Math.cos(a) * 0.7, 1 + Math.sin(a) * 0.7, 0.4], [1 + Math.cos(a) * 0.7, 1 + Math.sin(a) * 0.7, 0.75], '#8a94a0', 2); }
    if (!anim) glowAt(ctx, 1, 1, 0.9, 24, sp ? '#b090ff' : '#7cf1ff');
  } else {
    // water mill (gunpowder & earlier)
    const B = tbox(ctx, 0.2, 0.2, 1.4, 1.3, 0, 0.9, e === 'gunpowder' ? st.wall : '#8a6a42', e === 'gunpowder' ? 'brick' : 'planks', { quoin: st.quoin });
    door(ctx, B.L, 0.3, 0.3, 0.5, 'plank');
    gableRoof(ctx, 0.2, 0.2, 1.4, 1.3, 0.9, 0.5, st.roof, e === 'gunpowder' ? 'slate' : 'thatch', true, 0.08, e === 'gunpowder' ? st.wall : '#8a6a42', e === 'gunpowder' ? 'brick' : 'planks');
    // stream
    lit(ctx, [[1.5, 0.1, 0], [1.9, 0.1, 0], [1.9, 1.9, 0], [1.5, 1.9, 0]], '#3a7aa0', null, { edge: false });
    if (!anim) drawWheel(ctx, 0);
  }
  flag(ctx, 0.15, 1.85, 0, 1.0, team, t, { len: 10, pole: FUT(e) || e === 'modern' ? '#c8ccd0' : undefined });
}
export function drawWheel(ctx, t) {
  const c = P(1.48, 0.75, 0.4);
  ctx.save(); ctx.translate(c[0], c[1]); ctx.transform(0.5, 0.25, 0, 1, 0, 0);
  ctx.strokeStyle = '#4a3018'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.stroke();
  ctx.lineWidth = 1.2;
  for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28 + t; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 15, Math.sin(a) * 15); ctx.stroke(); ctx.fillStyle = '#6a4a2a'; ctx.fillRect(Math.cos(a) * 15 - 2, Math.sin(a) * 15 - 2, 4, 4); }
  ctx.restore();
}

// ------------------------------------------------------------------ dock
function dock(ctx, e, st, team, s, t) {
  const fut = FUT(e);
  const wood = '#7a5a36';
  // pier extends from the footprint toward +y (lower left) over the water
  const pierX0 = 1.15, pierX1 = 1.85, pierY1 = 4.4;
  if (['stone', 'bronze', 'iron', 'classical'].includes(e)) {
    groundPatch(ctx, 0.1, 0.1, 2.9, 2.6, st.ground);
    // stilts
    for (let y = 1.8; y <= pierY1; y += 0.45) for (const x of [pierX0, pierX1]) post(ctx, x, y, -0.25, 0.22, '#4a3018', 2);
    const D = tbox(ctx, pierX0, 1.6, pierX1, pierY1, 0.15, 0.24, wood, 'planks', { tm: 'hplanks' });
    ctx.strokeStyle = 'rgba(40,24,10,0.6)'; ctx.lineWidth = 0.6; for (let y = 1.7; y < pierY1; y += 0.11) { ctx.beginPath(); ctx.moveTo(...P(pierX0, y, 0.24)); ctx.lineTo(...P(pierX1, y, 0.24)); ctx.stroke(); }
    void D;
    // hut
    if (e === 'classical') {
      const H = tbox(ctx, 0.3, 0.3, 1.5, 1.35, 0, 0.75, st.wall, 'plaster');
      door(ctx, H.L, 0.4, 0.3, 0.5, 'panel'); hipRoof(ctx, 0.3, 0.3, 1.5, 1.35, 0.75, 0.35, st.roof, 'tiles', 0.08);
      pots(ctx, 2.2, 1.0, 3, '#c07a44');
    } else {
      const H = tbox(ctx, 0.3, 0.3, 1.35, 1.25, 0, 0.55, e === 'bronze' ? st.wall : '#7d5d3c', e === 'bronze' ? 'adobe' : e === 'stone' ? 'wattle' : 'logs');
      door(ctx, H.L, 0.35, 0.28, 0.42, 'plank');
      gableRoof(ctx, 0.3, 0.3, 1.35, 1.25, 0.55, 0.55, st.roof, 'thatch', true, 0.12, '#6a4a2a', 'planks');
    }
    // fish drying rack
    post(ctx, 2.2, 1.6, 0, 0.55); post(ctx, 2.7, 1.6, 0, 0.55); line3(ctx, [2.2, 1.6, 0.52], [2.7, 1.6, 0.52], '#5a3d22', 1.2);
    for (let k = 0; k < 5; k++) { const p = P(2.25 + k * 0.1, 1.6, 0.5); ctx.fillStyle = '#9aa8b0'; ctx.beginPath(); ctx.ellipse(p[0], p[1] + 4, 1.5, 4, 0, 0, 7); ctx.fill(); }
    // moored canoe
    boatProp(ctx, 2.25, 3.4, 0.1, '#6a4424');
    barrel(ctx, 1.6, 3.9, '#7a4a26'); crate(ctx, 1.35, 2.2, 0.16, 0.24);
    // rope coil & mooring posts
    for (const y of [2.6, 3.6]) post(ctx, pierX1 + 0.04, y, 0.24, 0.4, '#4a3018', 2.2);
    flag(ctx, pierX0 + 0.05, pierY1 - 0.1, 0.24, 1.0, team, t);
    return;
  }
  if (e === 'medieval' || e === 'gunpowder') {
    groundPatch(ctx, 0.05, 0.05, 2.95, 2.6, st.ground, 'paving');
    // stone quay along the shore plus a timber pier
    const Q = tbox(ctx, 0.1, 2.3, 2.9, 2.9, -0.3, 0.2, st.stone, 'ashlar');
    void Q;
    for (let y = 3.0; y <= pierY1; y += 0.45) for (const x of [pierX0, pierX1]) post(ctx, x, y, -0.3, 0.18, '#4a3018', 2.2);
    tbox(ctx, pierX0, 2.9, pierX1, pierY1, 0.1, 0.2, wood, 'planks', { tm: 'hplanks' });
    ctx.strokeStyle = 'rgba(40,24,10,0.6)'; ctx.lineWidth = 0.6; for (let y = 3.0; y < pierY1; y += 0.11) { ctx.beginPath(); ctx.moveTo(...P(pierX0, y, 0.2)); ctx.lineTo(...P(pierX1, y, 0.2)); ctx.stroke(); }
    // warehouse
    const gp = e === 'gunpowder';
    const H = tbox(ctx, 0.25, 0.25, 1.9, 1.5, 0, gp ? 1.0 : 0.85, gp ? st.wall : st.wall, gp ? 'brick' : 'timber', { beam: st.beam, quoin: st.quoin });
    door(ctx, H.L, 0.6, 0.45, 0.6, 'plank'); windows(ctx, H.R, st, 2, [0.4], 0.16, 0.24);
    eaveShadow(ctx, H.L);
    gableRoof(ctx, 0.25, 0.25, 1.9, 1.5, gp ? 1.0 : 0.85, 0.6, st.roof, gp ? 'slate' : 'shingle', true, 0.1, gp ? st.wall : st.wall, gp ? 'brick' : 'timber');
    // treadwheel crane on the quay
    line3(ctx, [2.5, 2.5, 0.2], [2.5, 2.5, 1.5], '#4a3018', 2.4); line3(ctx, [2.5, 2.5, 1.5], [2.5, 3.2, 1.3], '#4a3018', 2); line3(ctx, [2.5, 3.2, 1.3], [2.5, 3.2, 0.5], '#222', 0.6);
    crate(ctx, 2.5, 3.2, 0.14, 0.35);
    barrel(ctx, 2.1, 1.9); barrel(ctx, 2.25, 2.0); crate(ctx, 0.5, 2.0, 0.18, 0.2); crate(ctx, 0.75, 2.05, 0.16, 0.2);
    lamp(ctx, pierX1, pierY1 - 0.1, 0.6, '#222');
    for (const y of [3.4, 4.0]) post(ctx, pierX1 + 0.04, y, 0.2, 0.36, '#3a2614', 2.4);
    flag(ctx, pierX0 + 0.05, 2.75, 0.2, 1.2, team, t);
    return;
  }
  if (e === 'industrial' || e === 'modern') {
    const mod = e === 'modern';
    groundPatch(ctx, 0.05, 0.05, 2.95, 2.9, '#8a8e92', 'paving');
    // concrete wharf extending into water
    const W = tbox(ctx, 0.1, 2.0, 2.9, 4.0, -0.35, 0.18, '#a8aaa8', 'concrete', { tm: 'paving' });
    ctx.fillStyle = 'rgba(240,200,40,0.9)'; { const f = topF(0.1, 2.0, 2.9, 4.0, 0.18); ctx.beginPath(); f.quad(ctx, 0, 1.9, 2.8, 1.95); ctx.fill(); }
    for (let x = 0.4; x < 2.8; x += 0.6) { const p = P(x, 3.95, 0.18); ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 2, 2.4, 1.6, 0, 0, 7); ctx.fill(); }
    // tyre fenders
    void W;
    // warehouse
    const H = tbox(ctx, 0.2, 0.2, 1.6, 1.6, 0, 1.0, mod ? '#9aa4ac' : st.wall, mod ? 'corrugated' : 'brick');
    door(ctx, H.L, 0.4, 0.6, 0.7, mod ? 'hatch' : 'plank', { glow: '#f2c230', step: false });
    gableRoof(ctx, 0.2, 0.2, 1.6, 1.6, 1.0, 0.3, mod ? '#6a7480' : st.roof, 'roofmetal', false, 0.06, mod ? '#9aa4ac' : st.wall, mod ? 'corrugated' : 'brick');
    { const f = H.R; ctx.fillStyle = shade(TEAM[team], f.light); ctx.beginPath(); f.quad(ctx, 0.1, 0.75, 1.3, 0.85); ctx.fill(); }
    // containers
    const cc = ['#b84a2a', '#2a6ab0', '#3a8a4a', '#d8a030', TEAM[team]];
    for (let i = 0; i < 4; i++) tbox(ctx, 0.3 + (i % 2) * 0.55, 2.2 + Math.floor(i / 2) * 0.05, 0.8 + (i % 2) * 0.55, 2.45, 0.18 + Math.floor(i / 2) * 0.25, 0.43 + Math.floor(i / 2) * 0.25, cc[i], 'corrugated');
    // gantry crane
    const cx = 2.3;
    for (const [x, y] of [[cx - 0.25, 2.2], [cx + 0.25, 2.2], [cx - 0.25, 3.3], [cx + 0.25, 3.3]]) line3(ctx, [x, y, 0.18], [x, y, 1.9], mod ? '#d8a030' : '#4a4e54', 2.2);
    tbox(ctx, cx - 0.3, 1.8, cx + 0.3, 4.6, 1.9, 2.05, mod ? '#e0b040' : '#5a5e64', 'metal');
    tbox(ctx, cx - 0.15, 3.6, cx + 0.15, 3.9, 1.7, 1.9, '#3a3e44', 'metal'); line3(ctx, [cx, 3.75, 1.7], [cx, 3.75, 0.8], '#222', 0.7);
    vol([[cx - 0.3, 1.8, 0], [cx + 0.3, 4.6, 2.05]]);
    if (!mod) smokestack(ctx, 0.5, 0.5, 1.0, 2.0, 0.09);
    else antenna(ctx, 0.5, 0.5, 1.2, 0.6);
    lamp(ctx, 0.2, 3.9, 0.7, '#555'); lamp(ctx, 2.9, 2.1, 0.7, '#555');
    flag(ctx, 1.75, 0.25, 0, 1.4, team, t, { pole: '#c8ccd0' });
    return;
  }
  // future / space port: sleek white pier with light strips
  const sp = e === 'space';
  groundPatch(ctx, 0.05, 0.05, 2.95, 2.9, st.ground, 'paving');
  const W = tbox(ctx, 0.6, 1.8, 2.4, 4.3, -0.2, 0.15, st.wall, 'panel', { tm: 'panel' });
  void W;
  for (let y = 2.0; y < 4.3; y += 0.25) { const a = P(0.62, y, 0.15), b = P(2.38, y, 0.15); ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
  ctx.strokeStyle = st.trim; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(...P(0.6, 4.3, 0.15)); ctx.lineTo(...P(2.4, 4.3, 0.15)); ctx.lineTo(...P(2.4, 1.8, 0.15)); ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.5; ctx.stroke();
  const H = tbox(ctx, 0.3, 0.3, 1.6, 1.4, 0, 0.75, st.wall, st.wm);
  win(ctx, H.L, 0.1, 0.4, 1.1, 0.14, 'glow', { glow: st.trim }); win(ctx, H.R, 0.1, 0.4, 0.9, 0.14, 'glow', { glow: st.trim });
  door(ctx, H.L, 0.45, 0.3, 0.32, 'hatch', { glow: st.trim });
  flatRoof(ctx, 0.3, 0.3, 1.6, 1.4, 0.75, st.roof, 0.04, 'roofmetal');
  tdome(ctx, 0.95, 0.85, 0.75, 0.35, sp ? '#9aa8bc' : '#eef4fa', { ring: st.trim, glass: true });
  // arm crane
  tcyl(ctx, 2.2, 2.4, 0.15, 1.3, 0.08, '#c8d0da', 'panel', 10);
  line3(ctx, [2.2, 2.4, 1.3], [1.6, 3.6, 1.45], '#c8d0da', 3); glowAt(ctx, 1.6, 3.6, 1.45, 5, st.trim);
  for (let k = 0; k < 4; k++) lamp(ctx, 2.38, 2.1 + k * 0.6, 0.35, '#888', sp ? 'rgba(255,190,80,0.9)' : 'rgba(120,240,255,0.9)');
  flag(ctx, 2.7, 0.3, 0, 1.3, team, t, { pole: '#c8ccd0' });
}
function boatProp(ctx, x, y, z, col) {
  const pts = [[x - 0.45, y, z], [x - 0.3, y + 0.12, z], [x + 0.3, y + 0.12, z], [x + 0.45, y, z], [x + 0.3, y - 0.12, z], [x - 0.3, y - 0.12, z]];
  const top = pts.map(p => [p[0], p[1], z + 0.1]);
  face(ctx, [[x - 0.45, y, z + 0.1], [x - 0.3, y + 0.12, z], [x + 0.3, y + 0.12, z], [x + 0.45, y, z + 0.1]], shade(col, 0.8));
  face(ctx, top, shade(col, 1.0)); face(ctx, top.map(p => [x + (p[0] - x) * 0.85, y + (p[1] - y) * 0.7, z + 0.08]), shade(col, 0.55));
  line3(ctx, [x - 0.1, y - 0.3, z + 0.12], [x + 0.25, y + 0.3, z + 0.06], '#8a6a3a', 1);
}

// ------------------------------------------------------------------ construction
export function drawConstruction(ctx, type, era, s, stage) {
  const st = ST[era] || ST.medieval;
  const fut = FUT(era);
  const m = s === 1 ? 0.08 : 0.15;
  groundPatch(ctx, 0.02, 0.02, s - 0.02, s - 0.02, '#7a6448', 'earth');
  // pegs & string
  ctx.strokeStyle = 'rgba(240,230,200,0.7)'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(...P(m, m)); ctx.lineTo(...P(s - m, m)); ctx.lineTo(...P(s - m, s - m)); ctx.lineTo(...P(m, s - m)); ctx.closePath(); ctx.stroke();
  for (const [x, y] of [[m, m], [s - m, m], [s - m, s - m], [m, s - m]]) line3(ctx, [x, y, 0], [x, y, 0.12], '#6a4a2a', 1.4);
  const wallMat = { stone: 'wattle', bronze: 'adobe', iron: 'logs', classical: 'ashlar', medieval: 'stone', gunpowder: 'brick', industrial: 'brick', modern: 'concrete', future: 'panel', space: 'metal' }[era] || 'stone';
  const wallCol = era === 'medieval' ? st.stone : era === 'classical' ? st.base : st.wall;
  if (type === 'farm') {
    if (stage >= 1) for (let i = 0; i < 6 + stage * 4; i++) { const x = 0.25 + i * 0.22; if (x > s - 0.2) break; ctx.strokeStyle = 'rgba(40,25,10,0.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(...P(x, 0.15)); ctx.lineTo(...P(x, s - 0.15)); ctx.stroke(); }
    return;
  }
  // foundation slab
  if (stage >= 0) tbox(ctx, m, m, s - m, s - m, 0, 0.08 + stage * 0.04, fut ? '#9aa2ac' : st.base || '#8a8478', fut ? 'panel' : 'stone', { edgeA: 0.4 });
  const z0 = 0.08 + stage * 0.04;
  const wh = stage === 0 ? 0 : stage === 1 ? 0.35 : 0.85;
  const x0 = m + 0.1, x1 = s - m - 0.1;
  if (wh > 0) {
    // back walls full, front walls partial (cutaway look)
    tbox(ctx, x0, x0, x1, x0 + 0.1, z0, z0 + wh, wallCol, wallMat);
    tbox(ctx, x0, x0 + 0.1, x0 + 0.1, x1, z0, z0 + wh, wallCol, wallMat);
    tbox(ctx, x1 - 0.1, x0 + 0.1, x1, x1, z0, z0 + wh * 0.8, wallCol, wallMat);
    tbox(ctx, x0 + 0.1, x1 - 0.1, x0 + (x1 - x0) * 0.55, x1, z0, z0 + wh * 0.6, wallCol, wallMat);
  }
  if (stage === 2 && !fut) {
    // roof rafters
    const zt = z0 + wh, xm = (x0 + x1) / 2;
    for (let y = x0; y <= x1 + 0.01; y += Math.max(0.3, (x1 - x0) / 5)) { line3(ctx, [x0, y, zt], [xm, y, zt + 0.5], '#6a4a2a', 1.4); line3(ctx, [x1, y, zt], [xm, y, zt + 0.5], '#6a4a2a', 1.4); }
    line3(ctx, [xm, x0, zt + 0.5], [xm, x1, zt + 0.5], '#5a3a1a', 2);
  }
  // scaffolding
  const hz = 0.45 + stage * 0.45;
  const poleCol = fut ? '#9aa4b0' : era === 'modern' || era === 'industrial' ? '#6a6e74' : '#7a5a34';
  const pts = [[m - 0.05, s - m + 0.05], [s / 2, s - m + 0.05], [s - m + 0.05, s - m + 0.05], [s - m + 0.05, s / 2], [s - m + 0.05, m - 0.05]];
  for (const [x, y] of pts) post(ctx, x, y, 0, hz, poleCol, 1.5);
  for (const z of [hz * 0.5, hz]) {
    ctx.strokeStyle = shade(poleCol, 1.1); ctx.lineWidth = 1.2; ctx.beginPath();
    pts.forEach(([x, y], i) => { const q = P(x, y, z); i ? ctx.lineTo(...q) : ctx.moveTo(...q); }); ctx.stroke();
    // planks walkway
    ctx.strokeStyle = 'rgba(160,120,70,0.9)'; ctx.lineWidth = 2.2; ctx.beginPath(); pts.forEach(([x, y], i) => { const q = P(x + 0.06, y - 0.06, z); i ? ctx.lineTo(...q) : ctx.moveTo(...q); }); ctx.stroke();
  }
  // diagonal braces
  ctx.strokeStyle = shade(poleCol, 0.8); ctx.lineWidth = 0.8; ctx.beginPath();
  for (let i = 0; i < pts.length - 1; i++) { const a = P(pts[i][0], pts[i][1], 0), b = P(pts[i + 1][0], pts[i + 1][1], hz * 0.5); ctx.moveTo(...a); ctx.lineTo(...b); }
  ctx.stroke();
  // materials on site
  if (s > 1) {
    if (fut) { crate(ctx, s - 0.3, 0.3, 0.16, 0, '#c8d0da'); crate(ctx, 0.3, s - 0.3, 0.16, 0, '#c8d0da'); }
    else { logs(ctx, 0.3, s - 0.35, 2, 'x', 0.4); rockPile(ctx, s - 0.3, 0.35, '#9a9890', 4); }
  }
}

// ------------------------------------------------------------------ dispatcher
export function drawBuildingBody(ctx, type, era, team, s, t, anim) {
  const st = ST[era] || ST.medieval;
  const e = ST[era] ? era : 'medieval';
  switch (type) {
    case 'town_center': townCenter(ctx, e, st, team, s, t); break;
    case 'house': house(ctx, e, st, team, s, t); break;
    case 'granary': case 'lumber_camp': case 'mining_camp': storage(ctx, type, e, st, team, s, t, anim); break;
    case 'farm': farm(ctx, e, st, team, s, t); break;
    case 'barracks': case 'range': case 'stable': case 'workshop': case 'academy': military(ctx, type, e, st, team, s, t); break;
    case 'tower': tower(ctx, e, st, team, t); break;
    case 'generator': generator(ctx, e, st, team, t, anim); break;
    case 'dock': dock(ctx, e, st, team, s, t); break;
    default: { const B = tbox(ctx, 0.15, 0.15, s - 0.15, s - 0.15, 0, 1, st.wall, st.wm); void B; flatRoof(ctx, 0.15, 0.15, s - 0.15, s - 0.15, 1, st.roof, 0.05); flag(ctx, 0.3, 0.3, 1, 0.8, team, t); }
  }
}

// animated overlays drawn live on top of the cached sprite; returns true if any
export function hasAnim(type, era) {
  return (type === 'granary' && (era === 'medieval' || era === 'gunpowder')) || (type === 'generator' && (era === 'medieval' || FUT(era) || !['industrial', 'modern'].includes(era))) || (type === 'town_center' && FUT(era));
}
export function drawAnim(ctx, type, era, team, s, t) {
  if (type === 'granary' && (era === 'medieval' || era === 'gunpowder')) drawSails(ctx, era, t);
  else if (type === 'generator') {
    if (era === 'medieval') drawSails(ctx, era, t, 0.6, 0.95, 1.2, 0.5);
    else if (FUT(era)) { const k = 0.8 + Math.sin(t * 3) * 0.2; glowAt(ctx, 1, 1, 0.9, 24 * k, era === 'space' ? '#b090ff' : '#7cf1ff'); }
    else if (!['industrial', 'modern'].includes(era)) drawWheel(ctx, t * 1.5);
  } else if (type === 'town_center' && FUT(era)) {
    const k = 0.75 + Math.sin(t * 2.5) * 0.25;
    glowAt(ctx, 1.5, 1.5, 3.0, 16 * k, (ST[era] || ST.future).trim);
  }
  void team; void s;
}
