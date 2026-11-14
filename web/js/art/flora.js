// Procedural trees and alien flora for the cached resource sprites.
// Origin is the base of the trunk; +y is down. Light comes from the upper
// left, soft shadows fall to the lower right (matching the building kit).
// Every species is drawn from many small leaf clumps / needles / leaflets so
// the cached (2x) sprites keep fine detail when zoomed in.
import { hash2, shade, rgb } from '../util.js';

const TAU = Math.PI * 2;
export const TREE_VARIANTS = 12;

const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// pick a species for a tree style and variant (stable per variant)
export function treeSpecies(style, themeName, v) {
  const r = hash2(v, 7, 313);
  switch (style) {
    case 'mixed': return r < 0.42 ? 'oak' : r < 0.75 ? 'pine' : 'birch';
    case 'snowpine': return r < 0.72 ? 'snowpine' : 'snowbare';
    case 'palm': return r < 0.62 ? 'palm' : 'acacia';
    case 'jungle': return r < 0.48 ? 'broadleaf' : r < 0.82 ? 'coconut' : 'fern';
    case 'crystal': return themeName === 'space' ? (r < 0.5 ? 'shroom' : 'crystal') : r < 0.7 ? 'crystal' : 'shroom';
    case 'oak': case 'pine': return style;
  }
  return 'oak';
}

// soft ground shadow for a tree whose mass is centred at height hc (px)
function shadow(ctx, hc, rx, ry, trunkW = 2) {
  ctx.save();
  if ('filter' in ctx) ctx.filter = 'blur(1.6px)';
  const dx = hc * 0.75, dy = hc * 0.175;
  ctx.fillStyle = 'rgba(12,18,10,0.26)';
  ctx.beginPath(); ctx.moveTo(-trunkW, 0.5); ctx.lineTo(dx * 0.6, dy * 0.6 - trunkW * 0.6); ctx.lineTo(dx * 0.6, dy * 0.6 + trunkW * 0.6); ctx.lineTo(trunkW, 1.2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(dx, dy, rx, ry, 0.12, 0, TAU); ctx.fill();
  ctx.restore();
  // contact occlusion at the trunk base
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 7);
  g.addColorStop(0, 'rgba(10,12,6,0.4)'); g.addColorStop(1, 'rgba(10,12,6,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0.5, 7, 3.2, 0, 0, TAU); ctx.fill();
}

// tapered trunk with bark grain; pts: [[x,y,halfWidth], ...] from base up
function trunk(ctx, pts, col, rnd, kind = 'bark') {
  const L = [], Rr = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y, w] = pts[i];
    const n = pts[Math.min(pts.length - 1, i + 1)], p = pts[Math.max(0, i - 1)];
    let tx = n[0] - p[0], ty = n[1] - p[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    L.push([x + ty * w, y - tx * w]); Rr.push([x - ty * w, y + tx * w]);
  }
  const path = () => { ctx.beginPath(); L.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); for (let i = Rr.length - 1; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]); ctx.closePath(); };
  // outline, then a left-lit gradient body
  path(); ctx.strokeStyle = 'rgba(20,12,6,0.85)'; ctx.lineWidth = 1.2; ctx.stroke();
  const w0 = pts[0][2];
  const g = ctx.createLinearGradient(-w0, 0, w0, 0);
  g.addColorStop(0, shade(col, 1.25)); g.addColorStop(0.45, shade(col, 0.95)); g.addColorStop(1, shade(col, 0.55));
  ctx.fillStyle = g; path(); ctx.fill();
  ctx.save(); path(); ctx.clip();
  if (kind === 'birch') {
    for (let i = 0; i < 14; i++) {
      const k = rnd(400 + i), q = pts[Math.floor(k * (pts.length - 1))];
      const w = q[2] * (0.5 + rnd(420 + i) * 0.9);
      ctx.fillStyle = 'rgba(30,26,24,0.8)'; ctx.fillRect(q[0] - w * (rnd(440 + i) < 0.5 ? 1 : 0.2), q[1] - (rnd(460 + i)) * 4, w, 0.9);
    }
  } else if (kind === 'palm') {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x, y, w] = pts[i];
      ctx.strokeStyle = 'rgba(50,32,16,0.55)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x - w - 0.5, y - 0.6); ctx.quadraticCurveTo(x, y + 1.1, x + w + 0.5, y - 0.6); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,230,180,0.18)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(x - w, y - 1.6); ctx.quadraticCurveTo(x - w * 0.4, y - 0.8, x, y - 1); ctx.stroke();
    }
  } else {
    // vertical furrows
    ctx.lineWidth = 0.55;
    for (let i = 0; i < 9; i++) {
      const f = (i + 0.5) / 9 * 2 - 1;
      ctx.strokeStyle = i % 3 === 0 ? 'rgba(255,230,190,0.12)' : 'rgba(20,10,4,0.38)';
      ctx.beginPath();
      pts.forEach(([x, y, w], j) => { const xx = x + f * w + Math.sin(j * 1.7 + i * 2.3) * 0.5; j ? ctx.lineTo(xx, y) : ctx.moveTo(xx, y + 1); });
      ctx.stroke();
    }
    // a knot
    const q = pts[Math.floor(pts.length * (0.3 + rnd(480) * 0.3))];
    ctx.fillStyle = 'rgba(30,16,6,0.6)'; ctx.beginPath(); ctx.ellipse(q[0] - q[2] * 0.2, q[1], 0.9, 1.4, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function branch(ctx, x0, y0, x1, y1, w, col, bend = 0) {
  const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(20,12,6,0.85)'; ctx.lineWidth = w + 1;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,190,0.15)'; ctx.lineWidth = Math.max(0.5, w * 0.35);
  ctx.beginPath(); ctx.moveTo(x0 - w * 0.25, y0); ctx.quadraticCurveTo(mx - w * 0.25, my, x1 - w * 0.2, y1); ctx.stroke();
}

// A canopy made of leaf clumps lit as a rough ellipsoid. pal: [dark, mid, light] rgb.
function canopy(ctx, rnd, seed, cx, cy, rx, ry, pal, o = {}) {
  const n = Math.round((o.n || 10 + rx * ry * 0.09) * (o.dense || 1.5));
  const leaf = o.leaf || 3.4, outline = o.outline ?? 'rgba(16,30,12,0.88)';
  const cl = [];
  for (let i = 0; i < n; i++) {
    const a = rnd(seed + i) * TAU, rad = Math.sqrt(rnd(seed + 200 + i)) * 0.92;
    const nx = Math.cos(a) * rad, ny = Math.sin(a) * rad;
    const nz = Math.sqrt(Math.max(0, 1 - rad * rad)) * (rnd(seed + 400 + i) * 2 - 1 > -0.3 ? 1 : -0.4);
    const s = leaf * (0.7 + rnd(seed + 600 + i) * 0.6) * (o.flat ? 1 : 0.85 + 0.3 * (1 - rad));
    cl.push({ x: cx + nx * rx, y: cy + ny * ry, s, nx, ny, nz, i });
  }
  cl.sort((p, q) => p.nz - q.nz);
  // silhouette outline pass
  ctx.fillStyle = outline;
  ctx.beginPath();
  for (const c of cl) { ctx.moveTo(c.x + c.s + 0.9, c.y); ctx.arc(c.x, c.y, c.s + 0.9, 0, TAU); }
  ctx.fill();
  // dark interior so gaps read as depth
  ctx.fillStyle = rgb(pal[0][0] * 0.7, pal[0][1] * 0.7, pal[0][2] * 0.7);
  ctx.beginPath();
  for (const c of cl) { ctx.moveTo(c.x + c.s, c.y); ctx.arc(c.x, c.y, c.s, 0, TAU); }
  ctx.fill();
  for (const c of cl) {
    const lam = clamp01(0.5 - 0.42 * c.nx - 0.5 * c.ny + 0.3 * c.nz + (o.lightBias || 0));
    const base = lam < 0.5 ? lerp3(pal[0], pal[1], lam * 2) : lerp3(pal[1], pal[2], (lam - 0.5) * 2);
    // clump body with a darker lower-right rim
    ctx.fillStyle = rgb(base[0] * 0.78, base[1] * 0.78, base[2] * 0.78);
    ctx.beginPath(); ctx.arc(c.x, c.y, c.s, 0, TAU); ctx.fill();
    ctx.fillStyle = rgb(base[0], base[1], base[2]);
    ctx.beginPath(); ctx.arc(c.x - c.s * 0.18, c.y - c.s * 0.2, c.s * 0.8, 0, TAU); ctx.fill();
    // individual leaves: lighter towards the clump's upper left
    const nl = o.leaves ?? 9;
    for (let k = 0; k < nl; k++) {
      const a = rnd(seed + 800 + c.i * 11 + k) * TAU, d = c.s * Math.sqrt(rnd(seed + 900 + c.i * 11 + k)) * 0.82;
      const ox = Math.cos(a) * d, oy = Math.sin(a) * d;
      const kk = 0.86 + clamp01(0.5 - (ox + oy) / (c.s * 1.6)) * 0.5 + rnd(seed + 1000 + c.i * 11 + k) * 0.14;
      ctx.fillStyle = rgb(base[0] * kk + 6, base[1] * kk + 8, base[2] * kk + 3);
      ctx.beginPath(); ctx.ellipse(c.x + ox, c.y + oy, c.s * 0.3, c.s * 0.17, a + 1.2, 0, TAU); ctx.fill();
    }
    if (lam > 0.7) { ctx.fillStyle = `rgba(255,255,220,${(lam - 0.7) * 0.9})`; ctx.beginPath(); ctx.ellipse(c.x - c.s * 0.35, c.y - c.s * 0.4, c.s * 0.25, c.s * 0.14, -0.6, 0, TAU); ctx.fill(); }
    if (o.snow && c.ny < 0.2) { ctx.fillStyle = 'rgba(246,250,255,0.92)'; ctx.beginPath(); ctx.ellipse(c.x - c.s * 0.1, c.y - c.s * 0.55, c.s * 0.75, c.s * 0.32, 0, 0, TAU); ctx.fill(); }
  }
  // fruit / blossoms
  if (o.dots) for (let i = 0; i < o.dots.n; i++) {
    const c = cl[Math.floor(rnd(seed + 1300 + i) * cl.length)]; if (c.nz < 0) continue;
    ctx.fillStyle = o.dots.c; ctx.beginPath(); ctx.arc(c.x + (rnd(seed + 1400 + i) - 0.5) * c.s, c.y + (rnd(seed + 1500 + i) - 0.5) * c.s, 0.9, 0, TAU); ctx.fill();
  }
}

// --------------------------------------------------------------- species
function oak(ctx, rnd) {
  const H = 25 + rnd(1) * 6, lean = (rnd(2) - 0.5) * 4;
  shadow(ctx, H + 12, 17, 8, 3);
  // flared roots
  ctx.fillStyle = '#4a3220';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 2.6, -3); ctx.quadraticCurveTo(s * 4.5, -0.5, s * 6, 0.8); ctx.lineTo(s * 1.5, 0.8); ctx.closePath(); ctx.fill(); }
  trunk(ctx, [[0, 0.5, 3.4], [0.3, -8, 2.7], [lean * 0.5, -16, 2.4], [lean, -H, 2]], [110, 78, 50], rnd);
  const bc = '#56391f';
  branch(ctx, lean * 0.6, -H * 0.6, -8 + lean, -H - 6, 1.7, bc, -2);
  branch(ctx, lean * 0.7, -H * 0.7, 8 + lean, -H - 8, 1.6, bc, 2);
  branch(ctx, lean, -H, lean + 1, -H - 12, 1.5, bc, 0);
  const pals = [[[34, 66, 22], [62, 108, 34], [124, 170, 64]], [[40, 70, 20], [76, 116, 32], [150, 182, 70]], [[30, 62, 28], [54, 102, 44], [110, 160, 76]]];
  const pal = pals[Math.floor(rnd(3) * 3)];
  const cy = -H - 12;
  canopy(ctx, rnd, 10, lean - 7, cy + 4, 10, 7.5, pal, { n: 12 });
  canopy(ctx, rnd, 40, lean + 8, cy + 3, 10, 7.5, pal, { n: 12, lightBias: -0.08 });
  canopy(ctx, rnd, 70, lean, cy - 3, 16, 12, pal, { n: 30 });
  if (rnd(4) < 0.3) canopy(ctx, rnd, 120, lean - 2, cy - 12, 8, 6, pal, { n: 8, lightBias: 0.1 });
}

function birch(ctx, rnd) {
  const H = 30 + rnd(1) * 8, lean = (rnd(2) - 0.5) * 6;
  shadow(ctx, H + 6, 11, 6, 2);
  const twin = rnd(5) < 0.45;
  if (twin) trunk(ctx, [[2, 0.5, 1.5], [3.5, -14, 1.2], [5 + lean * 0.4, -H * 0.85, 0.8]], [228, 224, 212], rnd, 'birch');
  trunk(ctx, [[0, 0.5, 2], [lean * 0.3, -14, 1.6], [lean, -H, 1.0]], [232, 228, 216], rnd, 'birch');
  ctx.strokeStyle = 'rgba(40,30,24,0.8)';
  branch(ctx, lean * 0.6, -H * 0.6, lean - 6, -H * 0.85, 0.8, '#5a4a3a', -1);
  branch(ctx, lean * 0.8, -H * 0.75, lean + 6, -H * 0.95, 0.8, '#5a4a3a', 1);
  const pal = rnd(6) < 0.25 ? [[110, 90, 20], [190, 150, 40], [250, 214, 90]] : [[52, 84, 26], [100, 140, 44], [176, 204, 90]];
  canopy(ctx, rnd, 10, lean - 1, -H + 2, 9, 11, pal, { n: 26, leaf: 2.8, leaves: 7 });
  canopy(ctx, rnd, 60, lean + 1, -H - 8, 7, 9, pal, { n: 18, leaf: 2.6, leaves: 7, lightBias: 0.08 });
}

// conifer tiers with jagged needle edges
function pine(ctx, rnd, snow) {
  const tiers = 5 + Math.floor(rnd(1) * 2), H = 54 + rnd(2) * 12, W = 15 + rnd(3) * 3;
  shadow(ctx, H * 0.45, 13, 7, 2);
  trunk(ctx, [[0, 0.5, 2.2], [0, -10, 1.8], [0, -18, 1.4]], [96, 64, 40], rnd);
  const dark = snow ? [22, 52, 40] : [22, 58, 34], mid = snow ? [40, 84, 62] : [38, 92, 50], lite = snow ? [80, 130, 104] : [92, 150, 84];
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers, yb = -9 - f * (H - 16), h = (H - 6) / tiers * 1.9, w = W * (1 - f * 0.78);
    const apex = yb - h;
    const zig = 7 + Math.floor(w / 2.5);
    const path = () => {
      ctx.beginPath(); ctx.moveTo(0, apex);
      ctx.quadraticCurveTo(-w * 0.45, yb - h * 0.45, -w, yb + 1);
      for (let k = 0; k <= zig; k++) { const x = -w + 2 * w * k / zig, dy = (k % 2 ? -2.2 : 1.2) + Math.sin(x * 0.4) * 1.2; ctx.lineTo(x, yb + dy + (1 - Math.abs(x) / w) * 2.5); }
      ctx.quadraticCurveTo(w * 0.45, yb - h * 0.45, 0, apex); ctx.closePath();
    };
    path(); ctx.strokeStyle = 'rgba(8,22,14,0.9)'; ctx.lineWidth = 1.6; ctx.stroke();
    const g = ctx.createLinearGradient(-w, 0, w, 0);
    g.addColorStop(0, rgb(...lite)); g.addColorStop(0.42, rgb(...mid)); g.addColorStop(1, rgb(...dark));
    ctx.fillStyle = g; path(); ctx.fill();
    ctx.save(); path(); ctx.clip();
    // needle strokes fanning down from the stem
    ctx.lineWidth = 0.7;
    for (let k = 0; k < 26; k++) {
      const s = rnd(100 + i * 40 + k) * 2 - 1, y0 = apex + h * (0.2 + rnd(200 + i * 40 + k) * 0.75);
      const x0 = s * w * 0.15, x1 = s * w * (0.5 + rnd(300 + i * 40 + k) * 0.5), y1 = y0 + 3 + rnd(350 + i * 40 + k) * 4;
      ctx.strokeStyle = s < 0 ? (k % 3 ? 'rgba(170,220,160,0.32)' : 'rgba(6,20,10,0.4)') : (k % 3 ? 'rgba(6,20,10,0.45)' : 'rgba(150,200,140,0.2)');
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, y0 + 0.5, x1, y1); ctx.stroke();
    }
    // underside shade of the next tier above
    ctx.fillStyle = 'rgba(0,10,4,0.28)'; ctx.beginPath(); ctx.ellipse(0, apex + h * 0.3, w * 0.55, 3, 0, 0, TAU); ctx.fill();
    ctx.restore();
    if (snow) {
      ctx.fillStyle = 'rgba(246,250,255,0.95)';
      ctx.beginPath(); ctx.moveTo(0, apex - 0.5);
      ctx.quadraticCurveTo(-w * 0.4, yb - h * 0.5, -w * 0.88, yb - 0.5);
      for (let k = 0; k <= 6; k++) { const x = -w * 0.88 + w * 1.4 * k / 6; ctx.lineTo(x, yb - 2.5 - (k % 2 ? 2.4 : 0) - k * 0.6); }
      ctx.quadraticCurveTo(w * 0.3, yb - h * 0.55, 0, apex - 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(150,175,215,0.45)';
      ctx.beginPath(); ctx.moveTo(0, apex); ctx.quadraticCurveTo(w * 0.3, yb - h * 0.55, w * 0.52, yb - 6); ctx.lineTo(w * 0.1, yb - 4); ctx.closePath(); ctx.fill();
    }
  }
  if (snow) { ctx.fillStyle = 'rgba(250,252,255,0.9)'; ctx.beginPath(); ctx.ellipse(-2, 1.5, 9, 2.6, 0, 0, TAU); ctx.fill(); }
}

// leafless winter tree with snow along the branches
function snowbare(ctx, rnd) {
  const H = 24 + rnd(1) * 6;
  shadow(ctx, H, 12, 6, 2);
  trunk(ctx, [[0, 0.5, 2.4], [0.4, -10, 1.8], [0, -H + 1, 1.1]], [92, 76, 66], rnd);
  const segs = [];
  const grow = (x, y, a, l, w, d) => {
    const x1 = x + Math.cos(a) * l, y1 = y + Math.sin(a) * l;
    segs.push([x, y, x1, y1, w]);
    if (d <= 0) return;
    const n = 2 + (rnd(d * 17 + segs.length) < 0.4 ? 1 : 0);
    for (let k = 0; k < n; k++) grow(x1, y1, a + (k - (n - 1) / 2) * 0.6 + (rnd(segs.length * 3 + k) - 0.5) * 0.4, l * 0.72, w * 0.66, d - 1);
  };
  grow(0, -H + 2, -Math.PI / 2, 9, 1.8, 3);
  grow(0.5, -H * 0.55, -Math.PI / 2 - 0.9, 8, 1.4, 2);
  grow(0.5, -H * 0.65, -Math.PI / 2 + 0.85, 8, 1.4, 2);
  ctx.lineCap = 'round';
  for (const [a, b, c, d, w] of segs) { ctx.strokeStyle = 'rgba(30,22,18,0.9)'; ctx.lineWidth = w + 0.8; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
  for (const [a, b, c, d, w] of segs) { ctx.strokeStyle = '#6a5a50'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
  for (const [a, b, c, d, w] of segs) if (Math.abs(c - a) > 1) { ctx.strokeStyle = 'rgba(248,252,255,0.95)'; ctx.lineWidth = Math.max(0.7, w * 0.7); ctx.beginPath(); ctx.moveTo(a, b - w * 0.5); ctx.lineTo(c, d - w * 0.5); ctx.stroke(); }
  ctx.fillStyle = 'rgba(250,252,255,0.9)'; ctx.beginPath(); ctx.ellipse(-1, 1.5, 8, 2.4, 0, 0, TAU); ctx.fill();
}

// fronds: crown (x, y), n fronds of length L with leaflets
function fronds(ctx, rnd, x, y, n, L, pal, o = {}) {
  const fr = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + rnd(500 + i) * 0.5;
    const l = L * (0.8 + rnd(520 + i) * 0.35);
    fr.push({ a, l, back: Math.sin(a) < -0.1, i });
  }
  fr.sort((p, q) => Math.sin(p.a) - Math.sin(q.a));
  for (const f of fr) {
    const dx = Math.cos(f.a), dy = Math.sin(f.a) * 0.45;
    const up = o.upright || 0;
    const tx = x + dx * f.l * 0.92, ty = y + dy * f.l + f.l * (0.6 - up * 1.6), mx = x + dx * f.l * 0.55, my = y + dy * f.l * 0.5 - f.l * (0.22 + up * 0.5);
    const lit = clamp01(0.55 - dx * 0.35 - dy * 0.6 + (f.back ? -0.25 : 0.1));
    const c = lerp3(pal[0], pal[2], lit);
    // leaflets along the rachis on both sides, drooping
    const steps = o.fine ? 16 : 12;
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? rgb(c[0], c[1], c[2]) : 'rgba(10,26,8,0.75)'; ctx.lineWidth = pass ? 0.9 : 1.7;
      ctx.beginPath();
      for (let k = 1; k <= steps; k++) {
        const t = k / (steps + 1), it = 1 - t;
        const px = it * it * x + 2 * it * t * mx + t * t * tx, py = it * it * y + 2 * it * t * my + t * t * ty;
        const gx = 2 * it * (mx - x) + 2 * t * (tx - mx), gy = 2 * it * (my - y) + 2 * t * (ty - my), gl = Math.hypot(gx, gy) || 1;
        const nx = -gy / gl, ny = gx / gl, ll = (o.leaflet || 6) * Math.sin(t * Math.PI) * (0.8 + 0.4 * t);
        for (const s of [-1, 1]) { ctx.moveTo(px, py); ctx.lineTo(px + nx * s * ll + gx / gl * ll * 0.35, py + ny * s * ll * 0.6 + ll * 0.55); }
      }
      ctx.stroke();
    }
    ctx.strokeStyle = rgb(c[0] * 0.75 + 30, c[1] * 0.75 + 30, c[2] * 0.6 + 10); ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke();
    if (o.coconuts && f.i === 2) for (let k = 0; k < 3; k++) { ctx.fillStyle = k % 2 ? '#6a4a1c' : '#8a6a2a'; ctx.beginPath(); ctx.arc(x - 2 + k * 2, y + 2 + (k % 2), 1.8, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,240,200,0.35)'; ctx.fillRect(x - 2.6 + k * 2, y + 1 + (k % 2), 0.8, 0.8); }
  }
}

function palm(ctx, rnd, tropical) {
  const H = 42 + rnd(1) * 12, lean = (rnd(2) - 0.5) * 16;
  shadow(ctx, H * 0.9, 13, 6, 2);
  const pts = [];
  for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push([lean * t * t, 0.5 - H * t, 2.9 - t * 1.1]); }
  trunk(ctx, pts, tropical ? [150, 120, 84] : [140, 108, 70], rnd, 'palm');
  const pal = tropical ? [[22, 70, 26], [52, 124, 40], [130, 190, 80]] : [[44, 78, 30], [84, 128, 48], [170, 196, 96]];
  // dates / coconuts below the crown
  if (!tropical) { ctx.fillStyle = '#a0521e'; for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.arc(lean - 3 + k, -H + 3 + (k % 3), 1.2, 0, TAU); ctx.fill(); } }
  fronds(ctx, rnd, lean, -H, 9, 20, pal, { coconuts: tropical, leaflet: 5 });
}

function acacia(ctx, rnd) {
  const H = 22 + rnd(1) * 6;
  shadow(ctx, H + 6, 20, 6, 2);
  trunk(ctx, [[0, 0.5, 2.4], [1, -8, 2], [-1, -14, 1.7]], [116, 86, 60], rnd);
  const bc = '#5c4028';
  branch(ctx, -1, -13, -12, -H - 2, 1.5, bc, -3);
  branch(ctx, -1, -13, 10, -H - 4, 1.5, bc, 3);
  branch(ctx, -1, -14, 1, -H - 5, 1.3, bc, 0);
  const pal = [[60, 74, 24], [104, 120, 44], [176, 182, 92]];
  canopy(ctx, rnd, 10, -11, -H - 4, 11, 4, pal, { n: 16, leaf: 3.2, flat: true });
  canopy(ctx, rnd, 50, 9, -H - 6, 12, 4.2, pal, { n: 16, leaf: 3.2, flat: true });
  canopy(ctx, rnd, 90, -1, -H - 8, 14, 4.5, pal, { n: 22, leaf: 3.3, flat: true, lightBias: 0.08 });
}

function broadleaf(ctx, rnd) {
  const H = 34 + rnd(1) * 10, lean = (rnd(2) - 0.5) * 5;
  shadow(ctx, H + 10, 18, 8, 3);
  // buttress roots
  ctx.fillStyle = '#5a4630';
  for (const s of [-1, 1, -0.4, 0.5]) { ctx.beginPath(); ctx.moveTo(s * 1.5, -9); ctx.quadraticCurveTo(s * 3, -2, s * 8, 1); ctx.lineTo(s * 0.5, 1); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(20,12,6,0.6)'; ctx.lineWidth = 0.6; ctx.stroke(); }
  trunk(ctx, [[0, 0.5, 2.8], [0.2, -12, 2.3], [lean * 0.6, -24, 2], [lean, -H, 1.7]], [150, 132, 104], rnd);
  // hanging lianas
  ctx.strokeStyle = 'rgba(40,90,30,0.85)'; ctx.lineWidth = 0.8;
  for (let i = 0; i < 3; i++) { const x = lean + (rnd(30 + i) - 0.5) * 22, y = -H - 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 2, y + 10, x - 1 + rnd(33 + i) * 2, y + 14 + rnd(36 + i) * 10); ctx.stroke(); }
  const pal = [[16, 54, 22], [34, 104, 36], [104, 170, 70]];
  canopy(ctx, rnd, 10, lean - 10, -H - 2, 10, 6, pal, { n: 14, leaf: 4.2 });
  canopy(ctx, rnd, 40, lean + 10, -H - 3, 10, 6, pal, { n: 14, leaf: 4.2, lightBias: -0.05 });
  canopy(ctx, rnd, 70, lean, -H - 9, 15, 8, pal, { n: 26, leaf: 4.4, dots: rnd(9) < 0.4 ? { n: 8, c: '#e85a8a' } : null });
}

function fern(ctx, rnd) {
  const H = 18 + rnd(1) * 8;
  shadow(ctx, H, 14, 6, 2);
  const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push([Math.sin(t * 2) * 1.5, 0.5 - H * t, 2.4 - t * 0.6]); }
  trunk(ctx, pts, [90, 64, 40], rnd, 'palm');
  // hairy trunk
  ctx.strokeStyle = 'rgba(60,30,10,0.7)'; ctx.lineWidth = 0.6;
  for (let k = 0; k < 14; k++) { const y = -rnd(60 + k) * H, s = rnd(80 + k) < 0.5 ? -1 : 1; ctx.beginPath(); ctx.moveTo(s * 1.8, y); ctx.lineTo(s * 3.5, y + 1.5); ctx.stroke(); }
  fronds(ctx, rnd, pts[6][0], -H, 11, 18, [[20, 76, 30], [50, 130, 50], [140, 200, 90]], { upright: 0.25, leaflet: 3.6, fine: true });
}

// faceted crystal prism: base centre (x,y), half width w, height h, tilt
function prism(ctx, x, y, w, h, tilt, hue, glow) {
  const tx = Math.sin(tilt) * h, ty = -Math.cos(tilt) * h;
  const sx = tx * 0.75, sy = ty * 0.75; // shoulder
  const tip = [x + tx, y + ty];
  const L0 = [x - w, y], M0 = [x - w * 0.15, y + w * 0.35], R0 = [x + w, y];
  const L1 = [L0[0] + sx, L0[1] + sy], M1 = [M0[0] + sx, M0[1] + sy], R1 = [R0[0] + sx, R0[1] + sy];
  const poly = (pts, fill) => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  ctx.lineJoin = 'round';
  ctx.beginPath(); [L0, L1, tip, R1, R0, M0].forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
  ctx.strokeStyle = shade(hue, 0.25); ctx.lineWidth = 1.3; ctx.stroke();
  const gl = ctx.createLinearGradient(x, y, tip[0], tip[1]);
  gl.addColorStop(0, shade(hue, 0.55)); gl.addColorStop(1, shade(hue, 1.35));
  poly([L0, L1, M1, M0], gl);
  poly([M0, M1, R1, R0], shade(hue, 0.5));
  poly([L1, tip, M1], shade(hue, 1.55));
  poly([M1, tip, R1], shade(hue, 0.82));
  // inner refraction streaks and lit edges
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(L0[0] + 0.4, L0[1] - 0.5); ctx.lineTo(L1[0] + 0.4, L1[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(M0[0], M0[1]); ctx.lineTo(M1[0], M1[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.moveTo(L0[0] + w * 0.35, L0[1]); ctx.lineTo(L1[0] + w * 0.35, L1[1] + 2); ctx.lineTo(L1[0] + w * 0.55, L1[1] + 3); ctx.lineTo(L0[0] + w * 0.55, L0[1]); ctx.closePath(); ctx.fill();
  if (glow) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(tip[0] - 0.3, tip[1] + 1.2, 0.8, 0, TAU); ctx.fill(); }
}

function crystalTree(ctx, rnd, themeName) {
  const hues = themeName === 'mars' ? [[90, 220, 200], [255, 150, 90], [240, 110, 120]] : themeName === 'moon' ? [[120, 200, 255], [170, 140, 255], [140, 240, 230]] : [[200, 90, 230], [90, 200, 255], [120, 255, 170]];
  const hue = hues[Math.floor(rnd(1) * hues.length)];
  shadow(ctx, 18, 12, 5, 4);
  // glow pool on the ground
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(0, -2, 0, 0, -2, 22);
  g.addColorStop(0, `rgba(${hue[0]},${hue[1]},${hue[2]},0.35)`); g.addColorStop(1, `rgba(${hue[0]},${hue[1]},${hue[2]},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -2, 22, 13, 0, 0, TAU); ctx.fill();
  ctx.restore();
  // rocky base
  ctx.fillStyle = themeName === 'mars' ? '#6a3a28' : '#4a4a52';
  ctx.beginPath(); ctx.ellipse(0, 0, 11, 4, 0, 0, TAU); ctx.fill();
  const n = 5 + Math.floor(rnd(2) * 3), list = [];
  for (let i = 0; i < n; i++) {
    const x = (rnd(10 + i) - 0.5) * 20, big = i === 0;
    list.push({ x: big ? 0 : x, y: big ? -1 : -1 + (rnd(20 + i) - 0.3) * 5, w: big ? 4.6 : 2.2 + rnd(30 + i) * 2.4, h: big ? 44 + rnd(3) * 16 : 12 + rnd(40 + i) * 22, tilt: big ? (rnd(4) - 0.5) * 0.2 : x * 0.045 + (rnd(50 + i) - 0.5) * 0.4, c: i % 3 === 2 ? hues[(Math.floor(rnd(1) * hues.length) + 1) % hues.length] : hue });
  }
  list.sort((p, q) => p.y - q.y || q.h - p.h);
  for (const c of list) prism(ctx, c.x, c.y, c.w, c.h, c.tilt, c.c, c.h > 30);
  // sparkles
  for (let i = 0; i < 4; i++) {
    const x = (rnd(60 + i) - 0.5) * 22, y = -8 - rnd(70 + i) * 34, r = 1.5 + rnd(80 + i) * 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x, y + r * 1.3); ctx.stroke();
  }
}

function shroom(ctx, rnd, themeName) {
  const caps = themeName === 'mars' ? [[230, 120, 60], [120, 220, 190]] : themeName === 'moon' ? [[150, 170, 255], [210, 150, 255]] : [[220, 80, 200], [80, 210, 255], [140, 255, 140]];
  const n = 2 + Math.floor(rnd(1) * 2);
  shadow(ctx, 22, 13, 6, 3);
  const items = [];
  for (let i = 0; i < n; i++) items.push({ x: i === 0 ? 0 : (rnd(10 + i) - 0.5) * 22, h: i === 0 ? 34 + rnd(2) * 12 : 12 + rnd(20 + i) * 14, r: i === 0 ? 14 + rnd(3) * 4 : 6 + rnd(30 + i) * 4, c: caps[Math.floor(rnd(40 + i) * caps.length)], bend: (rnd(50 + i) - 0.5) * 8 });
  items.sort((p, q) => q.h - p.h);
  for (const m of items) {
    const tx = m.x + m.bend, ty = -m.h;
    // stalk
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(20,14,30,0.9)'; ctx.lineWidth = m.r * 0.32 + 1.4;
    ctx.beginPath(); ctx.moveTo(m.x, 0); ctx.quadraticCurveTo(m.x, ty * 0.5, tx, ty); ctx.stroke();
    const sg = ctx.createLinearGradient(m.x - 3, 0, m.x + 3, 0); sg.addColorStop(0, '#ece4f4'); sg.addColorStop(1, '#8a7a9a');
    ctx.strokeStyle = sg; ctx.lineWidth = m.r * 0.32; ctx.stroke();
    // ring
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(tx * 0.6 + m.x * 0.4, ty * 0.6, m.r * 0.22, m.r * 0.08, 0, 0, Math.PI); ctx.stroke();
    // gills underside
    ctx.fillStyle = shade(m.c, 0.35); ctx.beginPath(); ctx.ellipse(tx, ty + 1, m.r, m.r * 0.32, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = shade(m.c, 0.6); ctx.lineWidth = 0.5; ctx.beginPath();
    for (let k = 0; k < 12; k++) { const a = Math.PI * k / 11; ctx.moveTo(tx, ty + 1); ctx.lineTo(tx + Math.cos(a) * m.r * 0.95, ty + 1 + Math.sin(a) * m.r * 0.3); }
    ctx.stroke();
    // cap dome
    const cg = ctx.createRadialGradient(tx - m.r * 0.35, ty - m.r * 0.55, m.r * 0.1, tx, ty - m.r * 0.2, m.r * 1.1);
    cg.addColorStop(0, shade(m.c, 1.55)); cg.addColorStop(0.55, rgb(...m.c)); cg.addColorStop(1, shade(m.c, 0.45));
    ctx.beginPath(); ctx.moveTo(tx - m.r, ty); ctx.bezierCurveTo(tx - m.r, ty - m.r * 0.95, tx + m.r, ty - m.r * 0.95, tx + m.r, ty); ctx.quadraticCurveTo(tx, ty + m.r * 0.25, tx - m.r, ty); ctx.closePath();
    ctx.strokeStyle = 'rgba(20,10,30,0.9)'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.fillStyle = cg; ctx.fill();
    // glowing spots
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI * (0.15 + rnd(60 + k + m.h) * 0.7), d = m.r * (0.3 + rnd(70 + k + m.h) * 0.55);
      const sx = tx + Math.cos(a) * d, sy = ty - m.r * 0.15 + Math.sin(a) * d * 0.6;
      ctx.fillStyle = 'rgba(255,255,230,0.85)'; ctx.beginPath(); ctx.ellipse(sx, sy, 1.3, 0.8, 0, 0, TAU); ctx.fill();
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const hg = ctx.createRadialGradient(tx, ty, 0, tx, ty, m.r * 1.6);
    hg.addColorStop(0, `rgba(${m.c[0]},${m.c[1]},${m.c[2]},0.25)`); hg.addColorStop(1, `rgba(${m.c[0]},${m.c[1]},${m.c[2]},0)`);
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(tx, ty, m.r * 1.6, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// Draw a tree of the given style ('mixed', 'pine', 'snowpine', 'palm',
// 'jungle', 'crystal') for variant v.
export function drawTree(ctx, style, themeName, v) {
  const rnd = (i) => hash2(v, i, 99);
  const sp = treeSpecies(style, themeName, v);
  const sc = 0.88 + rnd(900) * 0.28;
  ctx.save(); ctx.scale(sc, sc); ctx.lineJoin = 'round';
  switch (sp) {
    case 'oak': oak(ctx, rnd); break;
    case 'birch': birch(ctx, rnd); break;
    case 'pine': pine(ctx, rnd, false); break;
    case 'snowpine': pine(ctx, rnd, true); break;
    case 'snowbare': snowbare(ctx, rnd); break;
    case 'palm': palm(ctx, rnd, false); break;
    case 'coconut': palm(ctx, rnd, true); break;
    case 'acacia': acacia(ctx, rnd); break;
    case 'broadleaf': broadleaf(ctx, rnd); break;
    case 'fern': fern(ctx, rnd); break;
    case 'crystal': crystalTree(ctx, rnd, themeName); break;
    case 'shroom': shroom(ctx, rnd, themeName); break;
  }
  ctx.restore();
}
