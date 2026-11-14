// Low-level procedural art kit: isometric projection, lit & textured planes,
// roofs, windows, doors, props and cast shadows. All coordinates are in tile
// units: (x, y) on the ground, z height (1 = ZH px). Light comes from the
// upper left (+y faces mid, +x faces dark), shadows fall to the right.
import { TW, TH, ZH, TEAM, hexToRgb, shade, mix, rgb, hash2 } from '../util.js';

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

// ------------------------------------------------------------ lighting
const LV = (() => { const v = [-0.42, 0.38, 0.82]; const l = Math.hypot(...v); return v.map(c => c / l); })();
export function lightOf(n) {
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  const d = (n[0] * LV[0] + n[1] * LV[1] + n[2] * LV[2]) / l;
  return 0.72 + 0.32 * d;
}
export const LIT = { L: lightOf([0, 1, 0]), R: lightOf([1, 0, 0]), T: lightOf([0, 0, 1]) };

// ------------------------------------------------------------ shadows
let REC = null;
export function recStart() { REC = []; }
export function recStop() { const r = REC; REC = null; return r || []; }
export function vol(pts) { if (REC) REC.push(pts); }
export function volBox(x0, y0, x1, y1, z0, z1) {
  if (REC) REC.push([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
}
export function volCyl(cx, cy, z0, z1, r, apex) {
  if (!REC) return;
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z0]); if (!apex) pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z1]); }
  if (apex) pts.push([cx, cy, z1]);
  REC.push(pts);
}
function hull(p) {
  p = p.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
export const SHX = 0.55, SHY = -0.2; // shadow offset per unit of height
export function castShadows(ctx, vols, alpha = 0.36) {
  if (!vols.length) return;
  ctx.save();
  const blur = 'filter' in ctx;
  if (blur) ctx.filter = 'blur(2.5px)';
  ctx.beginPath();
  for (const v of vols) {
    const h = hull(v.map(([x, y, z]) => P(x + Math.max(0, z) * SHX, y + Math.max(0, z) * SHY, 0)));
    h.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath();
  }
  ctx.fillStyle = `rgba(14,16,30,${alpha})`; ctx.fill();
  // contact occlusion along the ground line
  if (blur) ctx.filter = 'blur(1.5px)';
  ctx.beginPath();
  for (const v of vols) {
    const g = v.filter(p => p[2] <= 0.02);
    if (g.length < 3) continue;
    const h = hull(g.map(([x, y]) => P(x, y, 0)));
    h.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath();
  }
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,10,16,0.32)'; ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------ planes
// A plane with origin o, unit axes a (u) and b (v); optional polygon outline.
export class Plane {
  constructor(o, a, b, U, V, n, poly) {
    this.o = o; this.a = a; this.b = b; this.U = U; this.V = V; this.n = n; this.poly = poly;
    this.light = lightOf(n);
    this.u0 = 0; this.u1 = U;
    if (poly) {
      let mn = 1e9, mx = -1e9;
      for (const q of poly) { const w = [q[0] - o[0], q[1] - o[1], q[2] - o[2]]; const u = w[0] * a[0] + w[1] * a[1] + w[2] * a[2]; mn = Math.min(mn, u); mx = Math.max(mx, u); }
      this.u0 = mn; this.u1 = mx;
    }
    this.seed = Math.floor((o[0] * 7.3 + o[1] * 13.1 + o[2] * 5.7) * 10) + 3;
  }
  p(u, v) { const o = this.o, a = this.a, b = this.b; return P(o[0] + a[0] * u + b[0] * v, o[1] + a[1] * u + b[1] * v, o[2] + a[2] * u + b[2] * v); }
  quad(ctx, u0, v0, u1, v1) { const A = this.p(u0, v0), B = this.p(u1, v0), C = this.p(u1, v1), D = this.p(u0, v1); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.lineTo(D[0], D[1]); ctx.closePath(); }
  seg(ctx, u0, v0, u1, v1) { const A = this.p(u0, v0), B = this.p(u1, v1); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
  polyPath(ctx, uv) { uv.forEach(([u, v], i) => { const q = this.p(u, v); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); }
  outline(ctx) {
    if (this.poly) this.poly.forEach((q, i) => { const s = P(q[0], q[1], q[2]); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); });
    else this.quad(ctx, 0, 0, this.U, this.V);
    ctx.closePath();
  }
}
// left (+y) wall face, u along x from x0; right (+x) wall face, u along y from y0
export const leftF = (x0, x1, y1, z0, z1) => new Plane([x0, y1, z0], [1, 0, 0], [0, 0, 1], x1 - x0, z1 - z0, [0, 1, 0]);
export const rightF = (y0, y1, x1, z0, z1) => new Plane([x1, y0, z0], [0, 1, 0], [0, 0, 1], y1 - y0, z1 - z0, [1, 0, 0]);
export const topF = (x0, y0, x1, y1, z) => new Plane([x0, y0, z], [1, 0, 0], [0, 1, 0], x1 - x0, y1 - y0, [0, 0, 1]);

// plane through a polygon whose first edge (p0->p1) is the eave / base line
export function planeOf(pts) {
  const p0 = pts[0], p1 = pts[1];
  let a = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const la = Math.hypot(...a); a = a.map(c => c / la);
  let best = null, bl = 0;
  for (const q of pts) {
    const w = [q[0] - p0[0], q[1] - p0[1], q[2] - p0[2]];
    const d = w[0] * a[0] + w[1] * a[1] + w[2] * a[2];
    const t = [w[0] - a[0] * d, w[1] - a[1] * d, w[2] - a[2] * d];
    const l = Math.hypot(...t);
    if (l > bl) { bl = l; best = t; }
  }
  const b = best.map(c => c / bl);
  let n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  if (n[2] < 0 || (Math.abs(n[2]) < 1e-6 && n[0] + n[1] < 0)) n = n.map(c => -c);
  return new Plane(p0, a, b, la, bl, n, pts);
}

// ------------------------------------------------------------ materials
function rnd(seed, i, j) { return hash2(i, j, seed); }

// Paint a plane with a material. col: base colour. opts: {ao, edge, tint}
export function paint(ctx, f, mat, col, opt = {}) {
  const c = hexToRgb(col), L = f.light * (opt.lit || 1);
  ctx.save();
  ctx.beginPath(); f.outline(ctx);
  ctx.fillStyle = shade(c, L); ctx.fill();
  ctx.clip();
  texture(ctx, f, mat, c, L, opt);
  if (f.n[2] === 0 && opt.ao !== false) {
    for (let i = 0; i < 4; i++) { ctx.fillStyle = `rgba(20,14,8,${0.13 * (1 - i / 4)})`; ctx.beginPath(); f.quad(ctx, f.u0 - 1, i * 0.035, f.u1 + 1, (i + 1) * 0.035); ctx.fill(); }
  }
  ctx.restore();
  if (opt.edge !== false) { ctx.beginPath(); f.outline(ctx); ctx.strokeStyle = `rgba(20,14,10,${opt.edgeA ?? 0.35})`; ctx.lineWidth = 0.5; ctx.stroke(); }
}

function speckle(ctx, f, c, L, n, k, seed) {
  for (let i = 0; i < n; i++) {
    const u = f.u0 + rnd(seed, i, 1) * (f.u1 - f.u0), v = rnd(seed, i, 2) * f.V;
    const q = f.p(u, v);
    ctx.fillStyle = shade(c, L * (rnd(seed, i, 3) < 0.5 ? 1 - k : 1 + k));
    ctx.fillRect(q[0], q[1], 0.8, 0.8);
  }
}

function texture(ctx, f, mat, c, L, opt) {
  const sd = f.seed, U0 = f.u0, U1 = f.u1, V = f.V;
  ctx.lineCap = 'butt';
  switch (mat) {
    case 'stone': case 'marble': case 'ashlar': {
      const rh = mat === 'marble' ? 0.2 : mat === 'ashlar' ? 0.14 : 0.11;
      ctx.fillStyle = shade(c, L * (mat === 'stone' ? 0.62 : 0.8)); ctx.fillRect(-999, -999, 1998, 1998);
      let row = 0;
      for (let v = 0; v < V + rh; v += rh, row++) {
        let u = U0 - rnd(sd, row, 0) * 0.25, j = 0;
        while (u < U1) {
          const w = (mat === 'stone' ? 0.13 : 0.24) + rnd(sd, row, j + 1) * (mat === 'stone' ? 0.2 : 0.16);
          const g = 0.012;
          ctx.fillStyle = shade(c, L * (0.84 + rnd(sd + 5, row, j) * 0.3));
          ctx.beginPath(); f.quad(ctx, u + g, v + g, u + w - g, v + rh - g); ctx.fill();
          ctx.strokeStyle = shade(c, L * 1.18); ctx.lineWidth = 0.5;
          ctx.beginPath(); f.seg(ctx, u + g, v + rh - g, u + w - g, v + rh - g); ctx.stroke();
          u += w; j++;
        }
      }
      break;
    }
    case 'brick': {
      const rh = 0.062, bw = 0.15;
      ctx.fillStyle = shade(mix(c, [205, 195, 175], 0.55), L); ctx.fillRect(-999, -999, 1998, 1998);
      let row = 0;
      for (let v = 0; v < V; v += rh, row++) {
        let j = 0;
        for (let u = U0 - (row % 2) * bw / 2; u < U1; u += bw, j++) {
          ctx.fillStyle = shade(c, L * (0.86 + rnd(sd, row, j) * 0.24));
          ctx.beginPath(); f.quad(ctx, u + 0.01, v + 0.01, u + bw - 0.01, v + rh - 0.008); ctx.fill();
        }
      }
      if (opt.quoin) { // stone corner blocks
        for (let r = 0, v = 0; v < V; v += 0.14, r++) {
          const w = r % 2 ? 0.16 : 0.26;
          ctx.fillStyle = shade(opt.quoin, L); ctx.beginPath(); f.quad(ctx, U1 - w, v + 0.01, U1, v + 0.13); f.quad(ctx, U0, v + 0.01, U0 + (r % 2 ? 0.26 : 0.16), v + 0.13); ctx.fill();
        }
      }
      break;
    }
    case 'adobe': case 'plaster': case 'daub': {
      speckle(ctx, f, c, L, Math.floor((U1 - U0) * V * 60), 0.08, sd);
      for (let i = 0; i < 5; i++) {
        const u = U0 + rnd(sd, i, 7) * (U1 - U0), v = rnd(sd, i, 8) * V * 0.6, w = 0.2 + rnd(sd, i, 9) * 0.4;
        ctx.fillStyle = `rgba(${mat === 'plaster' ? '90,80,60' : '80,50,20'},0.07)`;
        ctx.beginPath(); f.quad(ctx, u, v, u + w, v + 0.15 + rnd(sd, i, 10) * 0.3); ctx.fill();
      }
      if (mat === 'adobe') {
        ctx.strokeStyle = shade(c, L * 0.8); ctx.lineWidth = 0.5;
        for (let v = 0.18; v < V; v += 0.22) { ctx.beginPath(); f.seg(ctx, U0, v + rnd(sd, v * 10, 1) * 0.03, U1, v); ctx.stroke(); }
        for (let i = 0; i < 2; i++) { const u = U0 + rnd(sd, i, 20) * (U1 - U0); ctx.beginPath(); const a = f.p(u, V * 0.8), b = f.p(u + 0.05, V * 0.6), d = f.p(u - 0.02, V * 0.45); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...d); ctx.stroke(); }
      }
      // splash zone near the ground
      ctx.fillStyle = 'rgba(70,50,30,0.12)'; ctx.beginPath(); f.quad(ctx, U0 - 1, 0, U1 + 1, 0.12); ctx.fill();
      break;
    }
    case 'timber': { // half-timbered: plaster panels with dark beams
      speckle(ctx, f, c, L, Math.floor((U1 - U0) * V * 40), 0.06, sd);
      const bc = shade(opt.beam || '#4a3220', L), bw = 0.035;
      ctx.fillStyle = bc;
      const n = Math.max(2, Math.round((U1 - U0) / 0.42));
      const step = (U1 - U0) / n;
      ctx.beginPath();
      f.quad(ctx, U0, 0, U1, 0.07); f.quad(ctx, U0, V - 0.06, U1, V); if (V > 0.6) f.quad(ctx, U0, V * 0.5 - 0.03, U1, V * 0.5 + 0.03);
      for (let i = 0; i <= n; i++) { const u = U0 + i * step; f.quad(ctx, u - bw, 0, u + bw, V); }
      ctx.fill();
      ctx.strokeStyle = bc; ctx.lineWidth = 1.3;
      for (let i = 0; i < n; i++) {
        const u = U0 + i * step; if (i % 2) continue;
        ctx.beginPath(); f.seg(ctx, u, 0.05, u + step, V > 0.6 ? V * 0.5 : V - 0.05); ctx.stroke();
        if (V > 0.6) { ctx.beginPath(); f.seg(ctx, u + step, V * 0.5, u, V - 0.05); ctx.stroke(); }
      }
      break;
    }
    case 'logs': {
      const rh = 0.11;
      for (let v = 0, r = 0; v < V; v += rh, r++) {
        ctx.fillStyle = shade(c, L * (0.9 + rnd(sd, r, 1) * 0.16)); ctx.beginPath(); f.quad(ctx, U0, v, U1, v + rh); ctx.fill();
        ctx.strokeStyle = shade(c, L * 1.25); ctx.lineWidth = 0.6; ctx.beginPath(); f.seg(ctx, U0, v + rh * 0.75, U1, v + rh * 0.75); ctx.stroke();
        ctx.strokeStyle = shade(c, L * 0.5); ctx.lineWidth = 0.9; ctx.beginPath(); f.seg(ctx, U0, v + 0.004, U1, v + 0.004); ctx.stroke();
      }
      // log ends at corners
      ctx.fillStyle = shade([200, 160, 110], L);
      for (let v = rh / 2; v < V; v += rh) { const q = f.p(U1 - 0.02, v); ctx.beginPath(); ctx.ellipse(q[0], q[1], 1.6, 1.8, 0, 0, 7); ctx.fill(); }
      break;
    }
    case 'planks': case 'hplanks': {
      const pw = 0.1;
      if (mat === 'planks') {
        for (let u = U0, i = 0; u < U1; u += pw, i++) {
          ctx.fillStyle = shade(c, L * (0.86 + rnd(sd, i, 1) * 0.24)); ctx.beginPath(); f.quad(ctx, u, -1, u + pw, V + 1); ctx.fill();
          ctx.strokeStyle = shade(c, L * 0.55); ctx.lineWidth = 0.5; ctx.beginPath(); f.seg(ctx, u, -1, u, V + 1); ctx.stroke();
        }
      } else {
        for (let v = 0, i = 0; v < V; v += 0.08, i++) {
          ctx.fillStyle = shade(c, L * (0.86 + rnd(sd, i, 1) * 0.24)); ctx.beginPath(); f.quad(ctx, U0, v, U1, v + 0.08); ctx.fill();
          ctx.strokeStyle = shade(c, L * 0.55); ctx.lineWidth = 0.5; ctx.beginPath(); f.seg(ctx, U0, v + 0.002, U1, v + 0.002); ctx.stroke();
        }
      }
      break;
    }
    case 'wattle': {
      speckle(ctx, f, c, L, Math.floor((U1 - U0) * V * 50), 0.1, sd);
      ctx.strokeStyle = shade(c, L * 0.68); ctx.lineWidth = 0.7;
      for (let v = 0.04; v < V; v += 0.06) {
        ctx.beginPath();
        for (let u = U0; u <= U1 + 0.1; u += 0.1) { const q = f.p(u, v + Math.sin(u * 31 + v * 50) * 0.012); u === U0 ? ctx.moveTo(...q) : ctx.lineTo(...q); }
        ctx.stroke();
      }
      ctx.strokeStyle = shade(c, L * 0.5); ctx.lineWidth = 1.1;
      for (let u = U0 + 0.12; u < U1; u += 0.28) { ctx.beginPath(); f.seg(ctx, u, 0, u, V); ctx.stroke(); }
      break;
    }
    case 'hide': {
      speckle(ctx, f, c, L, Math.floor((U1 - U0) * V * 40), 0.12, sd);
      ctx.strokeStyle = shade(c, L * 0.6); ctx.lineWidth = 0.6; ctx.setLineDash([1.2, 1.2]);
      for (let u = U0 + 0.3; u < U1; u += 0.38) { ctx.beginPath(); f.seg(ctx, u, 0, u + 0.05, V); ctx.stroke(); }
      ctx.setLineDash([]);
      break;
    }
    case 'concrete': {
      speckle(ctx, f, c, L, Math.floor((U1 - U0) * V * 30), 0.05, sd);
      ctx.strokeStyle = shade(c, L * 0.78); ctx.lineWidth = 0.5;
      for (let u = U0 + 0.5; u < U1; u += 0.5) { ctx.beginPath(); f.seg(ctx, u, 0, u, V); ctx.stroke(); }
      for (let v = 0.4; v < V; v += 0.4) { ctx.beginPath(); f.seg(ctx, U0, v, U1, v); ctx.stroke(); }
      for (let i = 0; i < (U1 - U0) * 4; i++) { const u = U0 + rnd(sd, i, 4) * (U1 - U0), v = V * (0.3 + rnd(sd, i, 5) * 0.7); ctx.strokeStyle = 'rgba(40,40,40,0.07)'; ctx.lineWidth = 1.5; ctx.beginPath(); f.seg(ctx, u, v, u, v - 0.3); ctx.stroke(); }
      break;
    }
    case 'panel': case 'metal': {
      const pw = mat === 'panel' ? 0.42 : 0.3, ph = mat === 'panel' ? 0.3 : 0.25;
      for (let u = U0, i = 0; u < U1; u += pw, i++) for (let v = 0, j = 0; v < V; v += ph, j++) {
        ctx.fillStyle = shade(c, L * (0.93 + rnd(sd, i, j) * 0.12)); ctx.beginPath(); f.quad(ctx, u, v, u + pw, v + ph); ctx.fill();
      }
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = shade(c, L * 0.7);
      ctx.beginPath();
      for (let u = U0 + pw; u < U1; u += pw) f.seg(ctx, u, 0, u, V);
      for (let v = ph; v < V; v += ph) f.seg(ctx, U0, v, U1, v);
      ctx.stroke();
      ctx.strokeStyle = shade(c, L * 1.2); ctx.beginPath();
      for (let v = ph; v < V; v += ph) f.seg(ctx, U0, v - 0.012, U1, v - 0.012);
      ctx.stroke();
      if (mat === 'metal') {
        ctx.fillStyle = shade(c, L * 0.6);
        for (let u = U0 + 0.04; u < U1; u += pw) for (let v = 0.04; v < V; v += ph) { const q = f.p(u, v); ctx.fillRect(q[0], q[1], 0.9, 0.9); }
      }
      break;
    }
    case 'corrugated': {
      ctx.lineWidth = 0.6;
      for (let u = U0, i = 0; u < U1; u += 0.045, i++) { ctx.strokeStyle = i % 2 ? shade(c, L * 1.15) : shade(c, L * 0.78); ctx.beginPath(); f.seg(ctx, u, 0, u, V); ctx.stroke(); }
      for (let i = 0; i < 3; i++) { const u = U0 + rnd(sd, i, 3) * (U1 - U0); ctx.fillStyle = 'rgba(120,60,20,0.12)'; ctx.beginPath(); f.quad(ctx, u, 0, u + 0.2, V * 0.5); ctx.fill(); }
      break;
    }
    case 'glass': {
      const A = f.p(U0, V), B = f.p(U1, 0);
      const g = ctx.createLinearGradient(A[0], A[1], B[0], B[1]);
      g.addColorStop(0, shade(c, L * 1.25)); g.addColorStop(0.45, shade(c, L * 0.8)); g.addColorStop(0.55, shade(c, L * 1.1)); g.addColorStop(1, shade(c, L * 0.65));
      ctx.fillStyle = g; ctx.fillRect(-999, -999, 1998, 1998);
      for (let u = U0, i = 0; u < U1; u += 0.2, i++) for (let v = 0, j = 0; v < V; v += 0.22, j++) {
        const r = rnd(sd, i, j);
        if (r > 0.82) { ctx.fillStyle = 'rgba(255,226,150,0.55)'; ctx.beginPath(); f.quad(ctx, u + 0.02, v + 0.02, u + 0.18, v + 0.2); ctx.fill(); }
        else if (r < 0.15) { ctx.fillStyle = 'rgba(10,20,30,0.25)'; ctx.beginPath(); f.quad(ctx, u + 0.02, v + 0.02, u + 0.18, v + 0.2); ctx.fill(); }
      }
      ctx.strokeStyle = opt.mullion || 'rgba(40,50,60,0.75)'; ctx.lineWidth = 0.6; ctx.beginPath();
      for (let u = U0 + 0.2; u < U1; u += 0.2) f.seg(ctx, u, 0, u, V);
      for (let v = 0.22; v < V; v += 0.22) f.seg(ctx, U0, v, U1, v);
      ctx.stroke();
      break;
    }
    // ----- roofing: v runs from the eave (0) to the ridge
    case 'thatch': case 'reed': {
      const cols = [shade(c, L * 0.72), shade(c, L * 0.95), shade(c, L * 1.18)];
      ctx.lineWidth = 0.7;
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = cols[k]; ctx.beginPath();
        for (let v = -0.02, r = 0; v < V; v += 0.075, r++) for (let u = U0, i = 0; u < U1; u += 0.028, i++) {
          if (Math.floor(rnd(sd, r * 97 + i, 3) * 3) !== k) continue;
          const l = 0.08 + rnd(sd, i, r) * 0.06;
          f.seg(ctx, u, v, u + (rnd(sd, i, r + 9) - 0.5) * 0.03, v + l);
        }
        ctx.stroke();
      }
      // layered courses
      ctx.strokeStyle = shade(c, L * 0.6); ctx.lineWidth = 0.8;
      for (let v = 0.22; v < V; v += 0.22) { ctx.beginPath(); f.seg(ctx, U0, v, U1, v); ctx.stroke(); }
      ctx.fillStyle = shade(c, L * 0.55); ctx.beginPath(); f.quad(ctx, U0, -0.05, U1, 0.03); ctx.fill();
      break;
    }
    case 'tiles': { // barrel clay tiles
      ctx.lineWidth = 1;
      for (let u = U0, i = 0; u < U1; u += 0.085, i++) {
        ctx.strokeStyle = shade(c, L * 0.66); ctx.beginPath(); f.seg(ctx, u, 0, u, V); ctx.stroke();
        ctx.strokeStyle = shade(c, L * 1.2); ctx.lineWidth = 0.7; ctx.beginPath(); f.seg(ctx, u + 0.03, 0, u + 0.03, V); ctx.stroke(); ctx.lineWidth = 1;
      }
      for (let v = 0.11, r = 0; v < V; v += 0.11, r++) {
        ctx.strokeStyle = 'rgba(40,10,0,0.28)'; ctx.lineWidth = 0.9; ctx.beginPath(); f.seg(ctx, U0, v, U1, v); ctx.stroke();
      }
      for (let i = 0; i < 12; i++) { const u = U0 + rnd(sd, i, 1) * (U1 - U0), v = rnd(sd, i, 2) * V; ctx.fillStyle = `rgba(${rnd(sd, i, 3) < 0.5 ? '255,220,180,0.13' : '40,20,10,0.15'})`; ctx.beginPath(); f.quad(ctx, u, v, u + 0.17, v + 0.11); ctx.fill(); }
      break;
    }
    case 'slate': case 'shingle': {
      const rh = mat === 'slate' ? 0.085 : 0.1, w = mat === 'slate' ? 0.13 : 0.11;
      for (let v = 0, r = 0; v < V; v += rh, r++) {
        let j = 0;
        for (let u = U0 - (r % 2) * w / 2; u < U1; u += w, j++) {
          ctx.fillStyle = shade(c, L * (0.86 + rnd(sd, r, j) * 0.26)); ctx.beginPath(); f.quad(ctx, u, v, u + w - 0.012, v + rh); ctx.fill();
        }
        ctx.strokeStyle = shade(c, L * 0.55); ctx.lineWidth = 0.8; ctx.beginPath(); f.seg(ctx, U0, v + rh, U1, v + rh); ctx.stroke();
      }
      break;
    }
    case 'roofmetal': {
      ctx.lineWidth = 0.7;
      for (let u = U0; u < U1; u += 0.16) {
        ctx.strokeStyle = shade(c, L * 1.25); ctx.beginPath(); f.seg(ctx, u, 0, u, V); ctx.stroke();
        ctx.strokeStyle = shade(c, L * 0.7); ctx.beginPath(); f.seg(ctx, u + 0.018, 0, u + 0.018, V); ctx.stroke();
      }
      break;
    }
    case 'gravel': {
      speckle(ctx, f, c, L, Math.floor((U1 - U0) * V * 80), 0.12, sd);
      break;
    }
    case 'solar': {
      ctx.strokeStyle = 'rgba(160,190,230,0.55)'; ctx.lineWidth = 0.5; ctx.beginPath();
      for (let u = U0; u < U1; u += 0.12) f.seg(ctx, u, 0, u, V);
      for (let v = 0; v < V; v += 0.12) f.seg(ctx, U0, v, U1, v);
      ctx.stroke();
      const A = f.p(U0, V), B = f.p(U1, 0);
      const g = ctx.createLinearGradient(A[0], A[1], B[0], B[1]); g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.12)');
      ctx.fillStyle = g; ctx.fillRect(-999, -999, 1998, 1998);
      break;
    }
    case 'paving': case 'earth': case 'field': {
      if (mat === 'paving') {
        ctx.strokeStyle = shade(c, L * 0.78); ctx.lineWidth = 0.5; ctx.beginPath();
        for (let u = U0; u < U1; u += 0.25) f.seg(ctx, u, 0, u, V);
        for (let v = 0; v < V; v += 0.25) f.seg(ctx, U0, v, U1, v);
        ctx.stroke();
      }
      speckle(ctx, f, c, L, Math.floor((U1 - U0) * V * 50), 0.15, sd);
      break;
    }
  }
}

// ------------------------------------------------------------ boxes
// Textured box. m: {wall, wm, top, tm, edge}
export function tbox(ctx, x0, y0, x1, y1, z0, z1, col, mat = null, opt = {}) {
  volBox(x0, y0, x1, y1, z0, z1);
  const fl = leftF(x0, x1, y1, z0, z1), fr = rightF(y0, y1, x1, z0, z1);
  paint(ctx, fl, mat, opt.lcol || col, { ao: z0 < 0.05, ...opt });
  paint(ctx, fr, mat, opt.rcol || col, { ao: z0 < 0.05, ...opt });
  if (!opt.noTop) paint(ctx, topF(x0, y0, x1, y1, z1), opt.tm || null, opt.top || col, { edgeA: 0.25 });
  return { L: fl, R: fr };
}

// plain lit polygon
export function lit(ctx, pts, col, mat = null, opt = {}) {
  const f = planeOf(pts);
  paint(ctx, f, mat, col, { ao: false, ...opt });
  return f;
}

// ------------------------------------------------------------ roofs
// gable roof; alongX: ridge parallel to x
export function gableRoof(ctx, x0, y0, x1, y1, z, h, col, mat, alongX = true, over = 0.1, endCol, endMat) {
  const o = over, dz = o * h / ((alongX ? y1 - y0 : x1 - x0) / 2);
  const ze = z - dz;
  let end, back, front, rake;
  if (alongX) {
    const ym = (y0 + y1) / 2;
    end = [[x1, y1, z], [x1, y0, z], [x1, ym, z + h]];
    back = [[x1 + o, y0 - o, ze], [x0 - o, y0 - o, ze], [x0 - o, ym, z + h], [x1 + o, ym, z + h]];
    front = [[x0 - o, y1 + o, ze], [x1 + o, y1 + o, ze], [x1 + o, ym, z + h], [x0 - o, ym, z + h]];
    rake = [[x1 + o, y1 + o, ze], [x1 + o, ym, z + h], [x1 + o, y0 - o, ze]];
  } else {
    const xm = (x0 + x1) / 2;
    end = [[x0, y1, z], [x1, y1, z], [xm, y1, z + h]];
    back = [[x0 - o, y0 - o, ze], [x0 - o, y1 + o, ze], [xm, y1 + o, z + h], [xm, y0 - o, z + h]];
    front = [[x1 + o, y1 + o, ze], [x1 + o, y0 - o, ze], [xm, y0 - o, z + h], [xm, y1 + o, z + h]];
    rake = [[x0 - o, y1 + o, ze], [xm, y1 + o, z + h], [x1 + o, y1 + o, ze]];
  }
  vol([...back, ...front]);
  const ef = planeOf(end);
  paint(ctx, ef, endMat || null, endCol || col, { ao: false });
  // eave shadow along the rake on the gable end
  ctx.save(); ctx.beginPath(); ef.outline(ctx); ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 5; ctx.beginPath(); end.slice(0).forEach(() => { }); { const a = P(...end[0]), b = P(...end[2]), c = P(...end[1]); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); } ctx.stroke();
  ctx.restore();
  paint(ctx, planeOf(back), mat, col, { ao: false });
  paint(ctx, planeOf(front), mat, col, { ao: false });
  // fascia / barge boards
  const fc = shade(col, 0.42);
  ctx.strokeStyle = fc; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(...P(...rake[0])); ctx.lineTo(...P(...rake[1])); ctx.lineTo(...P(...rake[2])); ctx.stroke();
  ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(...P(...front[0])); ctx.lineTo(...P(...front[1])); ctx.stroke();
  // ridge
  ctx.strokeStyle = shade(col, mat === 'thatch' || mat === 'reed' ? 0.55 : 0.5); ctx.lineWidth = mat === 'thatch' || mat === 'reed' ? 2.6 : 1.8;
  ctx.beginPath(); ctx.moveTo(...P(...front[2])); ctx.lineTo(...P(...front[3])); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.6; ctx.beginPath(); { const a = P(...front[2]), b = P(...front[3]); ctx.moveTo(a[0], a[1] - 1); ctx.lineTo(b[0], b[1] - 1); } ctx.stroke();
}

// hip roof (or pyramid when the footprint is square and ridge=0)
export function hipRoof(ctx, x0, y0, x1, y1, z, h, col, mat, over = 0.1, pyramid = false) {
  const o = over; x0 -= o; y0 -= o; x1 += o; y1 += o;
  const ze = z - o * 0.5;
  const w = x1 - x0, d = y1 - y0;
  let r0, r1;
  if (pyramid) { const c = [(x0 + x1) / 2, (y0 + y1) / 2, z + h]; r0 = r1 = c; }
  else if (w >= d) { const ym = (y0 + y1) / 2; r0 = [x0 + d / 2, ym, z + h]; r1 = [x1 - d / 2, ym, z + h]; }
  else { const xm = (x0 + x1) / 2; r0 = [xm, y0 + w / 2, z + h]; r1 = [xm, y1 - w / 2, z + h]; }
  const A = [x0, y0, ze], B = [x1, y0, ze], C = [x1, y1, ze], D = [x0, y1, ze];
  const alongX = w >= d;
  // faces: back(-y), left(-x), front(+y), right(+x)
  const back = alongX ? [B, A, r0, r1] : [B, A, r0];
  const left = alongX ? [A, D, r0] : [A, D, r1, r0];
  const front = alongX ? [D, C, r1, r0] : [D, C, r1];
  const right = alongX ? [C, B, r1] : [C, B, r0, r1];
  vol([A, B, C, D, r0, r1]);
  for (const f of [back, left, front, right]) {
    const pts = f.filter((p, i) => i === 0 || f.indexOf(p) === i && !(i > 0 && p === f[i - 1]));
    if (pts.length < 3 || (pts.length === 3 && pts[1] === pts[2])) continue;
    paint(ctx, planeOf(pts), mat, col, { ao: false });
  }
  ctx.strokeStyle = shade(col, 0.45); ctx.lineWidth = 1.3; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(...P(...D)); ctx.lineTo(...P(...C)); ctx.lineTo(...P(...B)); ctx.stroke();
  ctx.strokeStyle = shade(col, 0.6); ctx.lineWidth = 1.2; ctx.beginPath();
  ctx.moveTo(...P(...D)); ctx.lineTo(...P(...(alongX ? r0 : r1))); ctx.moveTo(...P(...C)); ctx.lineTo(...P(...r1)); ctx.moveTo(...P(...B)); ctx.lineTo(...P(...(alongX ? r1 : r0)));
  ctx.moveTo(...P(...r0)); ctx.lineTo(...P(...r1)); ctx.stroke();
}

// flat roof with parapet
export function flatRoof(ctx, x0, y0, x1, y1, z, col, par = 0.08, mat = 'gravel', parCol) {
  paint(ctx, topF(x0, y0, x1, y1, z), mat, col, { edge: false });
  if (par > 0) {
    const t = 0.05, pc = parCol || shade(col, 1.15);
    tbox(ctx, x0, y0, x0 + t, y1, z, z + par, pc, null, { edgeA: 0.2 });
    tbox(ctx, x0, y0, x1, y0 + t, z, z + par, pc, null, { edgeA: 0.2 });
    tbox(ctx, x1 - t, y0, x1, y1, z, z + par, pc, null, { edgeA: 0.2 });
    tbox(ctx, x0, y1 - t, x1, y1, z, z + par, pc, null, { edgeA: 0.2 });
  }
}

// cone with optional thatch / hide / slate texture
export function tcone(ctx, cx, cy, z, r, h, col, mat, segs = 18) {
  volCyl(cx, cy, z, z + h, r, true);
  const c = hexToRgb(col);
  const top = P(cx, cy, z + h);
  const clip = new Path2D();
  for (let i = 0; i < segs; i++) {
    const a0 = i / segs * Math.PI * 2, a1 = (i + 1) / segs * Math.PI * 2, am = (a0 + a1) / 2;
    const nx = Math.cos(am), ny = Math.sin(am);
    if (nx + ny < -0.5) continue;
    const l = lightOf([nx * h, ny * h, r]);
    const p0 = P(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z), p1 = P(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z);
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(top[0], top[1]); ctx.closePath();
    ctx.fillStyle = shade(c, l); ctx.fill(); ctx.strokeStyle = shade(c, l); ctx.lineWidth = 0.5; ctx.stroke();
    clip.moveTo(p0[0], p0[1]); clip.lineTo(p1[0], p1[1]); clip.lineTo(top[0], top[1]); clip.closePath();
  }
  if (!mat) return;
  ctx.save(); ctx.clip(clip);
  if (mat === 'thatch' || mat === 'reed' || mat === 'hide') {
    ctx.lineWidth = 0.7;
    for (let k = 0; k < 90; k++) {
      const a = -Math.PI * 0.75 + (k / 90) * Math.PI * 1.5 + hash2(k, 1, 5) * 0.03;
      const f = 0.25 + hash2(k, 2, 5) * 0.7;
      const q = P(cx + Math.cos(a) * r * 1.02, cy + Math.sin(a) * r * 1.02, z), q2 = P(cx + Math.cos(a) * r * (1 - f), cy + Math.sin(a) * r * (1 - f), z + h * f);
      ctx.strokeStyle = shade(c, 0.6 + hash2(k, 3, 5) * 0.5); ctx.beginPath(); ctx.moveTo(...q); ctx.lineTo(...q2); ctx.stroke();
    }
    if (mat !== 'hide') for (let ring = 1; ring < 4; ring++) {
      const f = ring / 4.2;
      ctx.strokeStyle = shade(c, 0.55); ctx.lineWidth = 0.9; ctx.beginPath();
      for (let k = 0; k <= 24; k++) { const a = -Math.PI * 0.75 + k / 24 * Math.PI * 1.5; const q = P(cx + Math.cos(a) * r * (1 - f), cy + Math.sin(a) * r * (1 - f), z + h * f); k ? ctx.lineTo(...q) : ctx.moveTo(...q); }
      ctx.stroke();
    }
  } else if (mat === 'slate' || mat === 'tiles' || mat === 'shingle') {
    for (let ring = 1; ring < 9; ring++) {
      const f = ring / 9;
      ctx.strokeStyle = shade(c, 0.55); ctx.lineWidth = 0.6; ctx.beginPath();
      for (let k = 0; k <= 24; k++) { const a = -Math.PI * 0.75 + k / 24 * Math.PI * 1.5; const q = P(cx + Math.cos(a) * r * (1 - f), cy + Math.sin(a) * r * (1 - f), z + h * f); k ? ctx.lineTo(...q) : ctx.moveTo(...q); }
      ctx.stroke();
    }
  }
  ctx.restore();
}

// textured vertical cylinder
export function tcyl(ctx, cx, cy, z0, z1, r, col, mat, segs = 20, noTop = false) {
  volCyl(cx, cy, z0, z1, r);
  const c = hexToRgb(col);
  const clip = new Path2D();
  for (let i = 0; i < segs; i++) {
    const a0 = i / segs * Math.PI * 2, a1 = (i + 1) / segs * Math.PI * 2, am = (a0 + a1) / 2;
    const nx = Math.cos(am), ny = Math.sin(am);
    if (nx + ny < -0.3) continue;
    const l = lightOf([nx, ny, 0]);
    const pts = [[cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z0], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z0], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z1], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z1]];
    ctx.beginPath(); pts.forEach((p, k) => { const s = P(...p); k ? ctx.lineTo(...s) : ctx.moveTo(...s); }); ctx.closePath();
    ctx.fillStyle = shade(c, l); ctx.fill(); ctx.strokeStyle = shade(c, l); ctx.lineWidth = 0.5; ctx.stroke();
    pts.forEach((p, k) => { const s = P(...p); k ? clip.lineTo(...s) : clip.moveTo(...s); }); clip.closePath();
  }
  if (mat) {
    ctx.save(); ctx.clip(clip);
    const arc = (z, rr = r) => { ctx.beginPath(); for (let k = 0; k <= 20; k++) { const a = -Math.PI * 0.3 + k / 20 * Math.PI * 1.6; const q = P(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, z); k ? ctx.lineTo(...q) : ctx.moveTo(...q); } ctx.stroke(); };
    if (mat === 'stone' || mat === 'brick' || mat === 'logs' || mat === 'ashlar' || mat === 'adobe' || mat === 'daub' || mat === 'wattle') {
      const rh = mat === 'brick' ? 0.065 : mat === 'logs' ? 0.11 : mat === 'stone' ? 0.12 : 0.2;
      ctx.strokeStyle = shade(c, mat === 'adobe' || mat === 'daub' ? 0.75 : 0.55); ctx.lineWidth = mat === 'logs' ? 0.9 : 0.6;
      for (let z = z0 + rh; z < z1; z += rh) arc(z);
      if (mat === 'stone' || mat === 'brick' || mat === 'ashlar') {
        ctx.beginPath();
        let row = 0;
        for (let z = z0; z < z1; z += rh, row++) for (let k = 0; k < 12; k++) {
          const a = -Math.PI * 0.3 + (k + (row % 2) * 0.5) / 12 * Math.PI * 1.6;
          const q = P(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z), q2 = P(cx + Math.cos(a) * r, cy + Math.sin(a) * r, Math.min(z1, z + rh));
          ctx.moveTo(...q); ctx.lineTo(...q2);
        }
        ctx.stroke();
      }
    } else if (mat === 'metal' || mat === 'panel' || mat === 'planks' || mat === 'corrugated' || mat === 'concrete') {
      const n = mat === 'corrugated' ? 40 : mat === 'planks' ? 26 : 10;
      ctx.strokeStyle = shade(c, 0.6); ctx.lineWidth = 0.5; ctx.beginPath();
      for (let k = 0; k < n; k++) { const a = -Math.PI * 0.3 + k / n * Math.PI * 1.6; const q = P(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z0), q2 = P(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z1); ctx.moveTo(...q); ctx.lineTo(...q2); }
      ctx.stroke();
      if (mat !== 'planks') for (let z = z0 + 0.35; z < z1; z += 0.35) arc(z);
    }
    // base occlusion
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 3; arc(z0 + 0.02);
    ctx.restore();
  }
  if (!noTop) {
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) { const a = i / segs * Math.PI * 2; const p = P(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z1); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
    ctx.fillStyle = shade(c, LIT.T); ctx.fill(); ctx.strokeStyle = shade(c, 0.6); ctx.lineWidth = 0.6; ctx.stroke();
  }
}

export function tdome(ctx, cx, cy, z, r, col, opt = {}) {
  volCyl(cx, cy, z, z + r * 0.9, r * 0.9, true);
  const [sx, sy] = P(cx, cy, z);
  const rx = r * TW / 2 * 1.41, ry = rx * 0.5, rh = opt.flat ? rx * 0.6 : rx * 0.95;
  const g = ctx.createRadialGradient(sx - rx * 0.35, sy - rh * 0.75, rx * 0.08, sx, sy - rh * 0.3, rx * 1.25);
  g.addColorStop(0, shade(col, 1.45)); g.addColorStop(0.55, shade(col, 0.95)); g.addColorStop(1, shade(col, 0.5));
  ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI); ctx.ellipse(sx, sy, rx, rh, 0, Math.PI, 0);
  ctx.fillStyle = g; ctx.fill();
  if (opt.ribs) {
    ctx.save(); ctx.clip();
    ctx.strokeStyle = opt.ribCol || shade(col, 0.65); ctx.lineWidth = 0.7;
    for (let k = 1; k < opt.ribs; k++) { const f = k / opt.ribs * 2 - 1; ctx.beginPath(); ctx.ellipse(sx, sy, Math.abs(f) * rx + 0.01, rh, 0, Math.PI, 0); ctx.stroke(); }
    for (let k = 1; k < 4; k++) { const f = k / 4; ctx.beginPath(); ctx.ellipse(sx, sy - rh * f, rx * Math.sqrt(1 - f * f), ry * Math.sqrt(1 - f * f), 0, 0, Math.PI); ctx.stroke(); }
    ctx.restore();
  }
  if (opt.glass) {
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(sx - rx * 0.4, sy - rh * 0.6, rx * 0.22, rh * 0.18, -0.5, 0, 7); ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = opt.ring || shade(col, 0.5); ctx.lineWidth = opt.ring ? 1.6 : 0.8;
  ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI); ctx.stroke();
  if (opt.ring) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.5; ctx.stroke(); }
}

// ------------------------------------------------------------ windows & doors
// win kinds: hole, shutter, sash, arch, ribbon, glow, slit, round
export function win(ctx, f, u, v, w, h, kind, o = {}) {
  const lit = o.lit ?? (hash2(Math.floor(u * 10 + f.seed), Math.floor(v * 10), 31) < 0.4);
  const L = f.light;
  const glassCol = lit ? 'rgb(255,196,104)' : shade([46, 58, 72], L);
  const frameCol = o.frame || '#e8e2d2';
  switch (kind) {
    case 'hole': {
      ctx.fillStyle = 'rgba(22,14,8,0.92)'; ctx.beginPath(); f.quad(ctx, u, v, u + w, v + h); ctx.fill();
      if (lit) { ctx.fillStyle = 'rgba(255,150,60,0.35)'; ctx.beginPath(); f.quad(ctx, u + w * 0.15, v, u + w * 0.85, v + h * 0.5); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.5; ctx.beginPath(); f.seg(ctx, u, v, u + w, v); ctx.stroke();
      break;
    }
    case 'slit': ctx.fillStyle = 'rgba(15,12,10,0.95)'; ctx.beginPath(); f.quad(ctx, u + w * 0.35, v, u + w * 0.65, v + h); ctx.fill(); break;
    case 'arch': case 'round': {
      ctx.fillStyle = shade(frameCol, L); ctx.beginPath(); archPath(ctx, f, u - 0.025, v - 0.02, w + 0.05, h + 0.04); ctx.fill();
      ctx.fillStyle = glassCol; ctx.beginPath(); archPath(ctx, f, u, v, w, h); ctx.fill();
      ctx.strokeStyle = shade(frameCol, L * 0.8); ctx.lineWidth = 0.5; ctx.beginPath(); f.seg(ctx, u + w / 2, v, u + w / 2, v + h); ctx.stroke();
      break;
    }
    case 'shutter': case 'sash': {
      if (kind === 'shutter') {
        const sc = shade(o.shutter || '#4a6a3a', L);
        ctx.fillStyle = sc; ctx.beginPath(); f.quad(ctx, u - w * 0.42, v, u, v + h); f.quad(ctx, u + w, v, u + w * 1.42, v + h); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.4; ctx.beginPath(); for (let k = 1; k < 4; k++) { f.seg(ctx, u - w * 0.42, v + h * k / 4, u, v + h * k / 4); f.seg(ctx, u + w, v + h * k / 4, u + w * 1.42, v + h * k / 4); } ctx.stroke();
      }
      ctx.fillStyle = shade(frameCol, L); ctx.beginPath(); f.quad(ctx, u - 0.02, v - 0.02, u + w + 0.02, v + h + 0.02); ctx.fill();
      ctx.fillStyle = glassCol; ctx.beginPath(); f.quad(ctx, u + 0.008, v + 0.008, u + w - 0.008, v + h - 0.008); ctx.fill();
      if (!lit) { ctx.fillStyle = 'rgba(200,230,255,0.25)'; ctx.beginPath(); f.polyPath(ctx, [[u + 0.01, v + h * 0.55], [u + w * 0.6, v + h - 0.01], [u + w * 0.3, v + h - 0.01], [u + 0.01, v + h * 0.75]]); ctx.fill(); }
      ctx.strokeStyle = shade(frameCol, L * 0.9); ctx.lineWidth = 0.55; ctx.beginPath(); f.seg(ctx, u + w / 2, v, u + w / 2, v + h); f.seg(ctx, u, v + h / 2, u + w, v + h / 2);
      if (kind === 'sash' && h > 0.25) { f.seg(ctx, u, v + h / 4, u + w, v + h / 4); f.seg(ctx, u, v + 3 * h / 4, u + w, v + 3 * h / 4); }
      ctx.stroke();
      // sill and lintel
      ctx.fillStyle = shade(o.sill || frameCol, L * 1.05); ctx.beginPath(); f.quad(ctx, u - 0.04, v - 0.045, u + w + 0.04, v - 0.015); ctx.fill();
      if (o.lintel !== false) { ctx.fillStyle = shade(o.sill || frameCol, L * 0.95); ctx.beginPath(); f.quad(ctx, u - 0.03, v + h + 0.01, u + w + 0.03, v + h + 0.05); ctx.fill(); }
      break;
    }
    case 'ribbon': {
      ctx.fillStyle = shade([40, 52, 64], L); ctx.beginPath(); f.quad(ctx, u, v, u + w, v + h); ctx.fill();
      const A = f.p(u, v + h), B = f.p(u + w, v);
      const g = ctx.createLinearGradient(A[0], A[1], B[0], B[1]); g.addColorStop(0, 'rgba(170,215,245,0.85)'); g.addColorStop(0.5, 'rgba(90,140,180,0.7)'); g.addColorStop(1, 'rgba(60,100,140,0.8)');
      ctx.fillStyle = g; ctx.beginPath(); f.quad(ctx, u + 0.01, v + 0.01, u + w - 0.01, v + h - 0.01); ctx.fill();
      for (let k = u, i = 0; k < u + w - 0.05; k += 0.17, i++) if (hash2(i, Math.floor(v * 20), f.seed) < 0.3) { ctx.fillStyle = 'rgba(255,220,150,0.7)'; ctx.beginPath(); f.quad(ctx, k + 0.02, v + 0.02, k + 0.15, v + h - 0.02); ctx.fill(); }
      ctx.strokeStyle = 'rgba(30,36,44,0.8)'; ctx.lineWidth = 0.5; ctx.beginPath(); for (let k = u + 0.17; k < u + w; k += 0.17) f.seg(ctx, k, v, k, v + h); ctx.stroke();
      break;
    }
    case 'glow': {
      const gc = o.glow || '#5ae6ff';
      ctx.fillStyle = shade([20, 30, 40], L); ctx.beginPath(); f.quad(ctx, u, v, u + w, v + h); ctx.fill();
      ctx.fillStyle = gc; ctx.globalAlpha = 0.85; ctx.beginPath(); f.quad(ctx, u + 0.02, v + h * 0.3, u + w - 0.02, v + h * 0.7); ctx.fill();
      ctx.globalAlpha = 0.25; ctx.beginPath(); f.quad(ctx, u - 0.03, v - 0.02, u + w + 0.03, v + h + 0.02); ctx.fill(); ctx.globalAlpha = 1;
      break;
    }
  }
}
function archPath(ctx, f, u, v, w, h) {
  const r = w / 2, pts = [[u, v], [u + w, v], [u + w, v + h - r * 0.9]];
  for (let k = 1; k < 8; k++) { const a = k / 8 * Math.PI; pts.push([u + r + Math.cos(a) * r, v + h - r * 0.9 + Math.sin(a) * r * 0.9]); }
  pts.push([u, v + h - r * 0.9]);
  f.polyPath(ctx, pts);
}

// door kinds: hide, plank, panel, arch, glass, hatch, gate
export function door(ctx, f, u, w, h, kind, o = {}) {
  const L = f.light;
  const wood = o.wood || '#5a3a20';
  const frame = o.frame || '#3a2614';
  if (kind === 'hide') {
    ctx.fillStyle = 'rgba(20,12,6,0.95)'; ctx.beginPath(); f.polyPath(ctx, [[u, 0], [u + w, 0], [u + w * 0.5, h]]); ctx.fill();
    ctx.fillStyle = shade('#a07850', L); ctx.beginPath(); f.polyPath(ctx, [[u + w * 0.55, 0], [u + w, 0], [u + w * 0.5, h]]); ctx.fill();
    return;
  }
  if (kind === 'glass') {
    ctx.fillStyle = shade('#2a3440', L); ctx.beginPath(); f.quad(ctx, u - 0.03, 0, u + w + 0.03, h + 0.03); ctx.fill();
    ctx.fillStyle = 'rgba(255,214,140,0.85)'; ctx.beginPath(); f.quad(ctx, u, 0, u + w, h); ctx.fill();
    ctx.strokeStyle = 'rgba(40,40,40,0.8)'; ctx.lineWidth = 0.6; ctx.beginPath(); f.seg(ctx, u + w / 2, 0, u + w / 2, h); ctx.stroke();
    if (o.canopy) { ctx.fillStyle = shade(o.canopy, L); ctx.beginPath(); f.quad(ctx, u - 0.1, h + 0.03, u + w + 0.1, h + 0.1); ctx.fill(); }
    return;
  }
  if (kind === 'hatch') {
    ctx.fillStyle = shade('#3a4048', L); ctx.beginPath(); f.quad(ctx, u - 0.03, 0, u + w + 0.03, h + 0.03); ctx.fill();
    ctx.fillStyle = shade('#5a6470', L); ctx.beginPath(); f.quad(ctx, u, 0, u + w, h); ctx.fill();
    ctx.fillStyle = o.glow || '#5ae6ff'; ctx.beginPath(); f.quad(ctx, u + w * 0.1, h * 0.85, u + w * 0.9, h * 0.92); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.6; ctx.beginPath(); f.seg(ctx, u + w / 2, 0, u + w / 2, h * 0.8); ctx.stroke();
    return;
  }
  // framed timber door
  const ar = kind === 'arch' || kind === 'gate';
  ctx.fillStyle = shade(frame, L);
  ctx.beginPath(); if (ar) archPath(ctx, f, u - 0.04, 0, w + 0.08, h + 0.05); else f.quad(ctx, u - 0.035, 0, u + w + 0.035, h + 0.04); ctx.fill();
  ctx.fillStyle = shade(wood, L);
  ctx.beginPath(); if (ar) archPath(ctx, f, u, 0, w, h); else f.quad(ctx, u, 0, u + w, h); ctx.fill();
  ctx.save(); ctx.beginPath(); if (ar) archPath(ctx, f, u, 0, w, h); else f.quad(ctx, u, 0, u + w, h); ctx.clip();
  ctx.strokeStyle = shade(wood, L * 0.6); ctx.lineWidth = 0.5; ctx.beginPath();
  if (kind === 'panel') { f.quad(ctx, u + w * 0.15, h * 0.1, u + w * 0.45, h * 0.45); f.quad(ctx, u + w * 0.55, h * 0.1, u + w * 0.85, h * 0.45); f.quad(ctx, u + w * 0.15, h * 0.55, u + w * 0.45, h * 0.9); f.quad(ctx, u + w * 0.55, h * 0.55, u + w * 0.85, h * 0.9); }
  else for (let k = u + 0.06; k < u + w; k += 0.06) f.seg(ctx, k, 0, k, h);
  ctx.stroke();
  if (kind === 'gate') { ctx.strokeStyle = shade('#222', L); ctx.lineWidth = 0.9; ctx.beginPath(); for (let k = u + 0.08; k < u + w; k += 0.1) f.seg(ctx, k, 0, k, h); for (let k = 0.1; k < h; k += 0.12) f.seg(ctx, u, k, u + w, k); ctx.stroke(); }
  else { ctx.strokeStyle = 'rgba(20,20,20,0.7)'; ctx.lineWidth = 0.8; ctx.beginPath(); f.seg(ctx, u, h * 0.25, u + w, h * 0.25); f.seg(ctx, u, h * 0.7, u + w, h * 0.7); ctx.stroke(); }
  ctx.restore();
  if (o.step !== false) { const st = o.stepCol || '#9a948a'; ctx.fillStyle = shade(st, LIT.T); const a = f.p(u - 0.06, 0); ctx.beginPath(); const p1 = f.p(u - 0.06, 0), p2 = f.p(u + w + 0.06, 0); const dn = f.n; const p3 = P(f.o[0] + f.a[0] * (u + w + 0.06) + dn[0] * 0.12, f.o[1] + f.a[1] * (u + w + 0.06) + dn[1] * 0.12, f.o[2]), p4 = P(f.o[0] + f.a[0] * (u - 0.06) + dn[0] * 0.12, f.o[1] + f.a[1] * (u - 0.06) + dn[1] * 0.12, f.o[2]); ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3); ctx.lineTo(...p4); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.5; ctx.stroke(); void a; }
}

// strip of shadow under an eave on a wall face (top band)
export function eaveShadow(ctx, f, depth = 0.16, a = 0.32) {
  ctx.save(); ctx.beginPath(); f.outline(ctx); ctx.clip();
  for (let i = 0; i < 4; i++) { ctx.fillStyle = `rgba(10,8,6,${a * (1 - i / 4) * 0.5})`; ctx.beginPath(); f.quad(ctx, f.u0 - 1, f.V - depth * (i + 1) / 4, f.u1 + 1, f.V + 0.1); ctx.fill(); }
  ctx.restore();
}

// ------------------------------------------------------------ team colour
export function teamCol(team) { return TEAM[team] || '#888'; }

// Flags: while a capture list is set (buildingSprite with live=true), flag()
// draws only the pole and records the cloth so it can wave live
// (drawFlagCloth, every frame) instead of being baked into the sprite.
let FLAGS = null;
export function flagCapture(list) { FLAGS = list; }
export function flag(ctx, x, y, z, h, team, t = 0, opt = {}) {
  const [bx, by] = P(x, y, z);
  const top = by - h * ZH;
  ctx.strokeStyle = opt.pole || '#3a2c1c'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, top); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(bx - 0.4, by); ctx.lineTo(bx - 0.4, top); ctx.stroke();
  ctx.fillStyle = opt.finial || '#d8b450'; ctx.beginPath(); ctx.arc(bx, top - 1, 1.4, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,240,0.6)'; ctx.beginPath(); ctx.arc(bx - 0.5, top - 1.5, 0.5, 0, 7); ctx.fill();
  const L = opt.len || 13, ph = x * 3 + y * 1.7;
  if (FLAGS) { FLAGS.push([bx, top, L, team, ph]); return; }
  drawFlagCloth(ctx, bx, top, L, team, t, ph);
}

// a waving pennant hanging from (bx, top): travelling wave along the cloth,
// amplitude growing towards the free end, lit folds and a swallowtail
export function drawFlagCloth(ctx, bx, top, L, team, t = 0, ph = 0) {
  const tc = TEAM[team] || '#888', H = 8, N = 6;
  const wv = (u) => Math.sin(u * 5.2 - t * 6 - ph) * (0.3 + u * 1.9) + Math.sin(u * 9 - t * 9.5 - ph * 1.3) * u * 0.5;
  const xs = [], ys = [];
  for (let i = 0; i <= N; i++) { const u = i / N; xs.push(bx + u * L * (1 - 0.05 * Math.abs(Math.sin(t * 3 + ph)))); ys.push(wv(u) + u * 0.9); }
  ctx.beginPath(); ctx.moveTo(bx, top);
  for (let i = 1; i <= N; i++) ctx.lineTo(xs[i], top + ys[i]);
  ctx.lineTo(xs[N] - 2.2, top + ys[N] + H * 0.55);
  for (let i = N; i >= 0; i--) ctx.lineTo(xs[i], top + ys[i] + H - (i === N ? 0 : 0));
  ctx.closePath();
  const g = ctx.createLinearGradient(bx, 0, bx + L, 0);
  for (let i = 0; i <= N; i++) { const sl = i < N ? ys[i + 1] - ys[i] : ys[i] - ys[i - 1]; g.addColorStop(i / N, shade(tc, Math.max(0.55, Math.min(1.3, 1.02 - sl * 0.32)))); }
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = shade(tc, 0.42); ctx.lineWidth = 0.5; ctx.stroke();
  // hem stripe near the pole
  ctx.strokeStyle = 'rgba(255,240,200,0.55)'; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(xs[1] - 0.6, top + ys[1] + 0.6); ctx.lineTo(xs[1] - 0.6, top + ys[1] + H - 0.6); ctx.stroke();
}

// hanging banner on a wall face
export function banner(ctx, f, u, v, w, h, team, opt = {}) {
  const tc = TEAM[team] || '#888', L = f.light;
  ctx.fillStyle = shade(tc, L * 1.05);
  ctx.beginPath(); f.polyPath(ctx, [[u, v + h], [u + w, v + h], [u + w, v], [u + w / 2, v + h * 0.18], [u, v]]); ctx.fill();
  ctx.strokeStyle = shade(tc, L * 0.5); ctx.lineWidth = 0.5; ctx.stroke();
  ctx.fillStyle = opt.emblem || 'rgba(255,240,200,0.85)';
  ctx.beginPath(); f.polyPath(ctx, [[u + w * 0.5, v + h * 0.8], [u + w * 0.72, v + h * 0.58], [u + w * 0.5, v + h * 0.36], [u + w * 0.28, v + h * 0.58]]); ctx.fill();
  ctx.strokeStyle = shade(opt.rod || '#6a4a2a', L); ctx.lineWidth = 1.1; ctx.beginPath(); f.seg(ctx, u - 0.03, v + h, u + w + 0.03, v + h); ctx.stroke();
}

// striped awning on a wall face, projecting out by d
export function awning(ctx, f, u, v, w, d, team, alt = '#f0e8d8') {
  const tc = TEAM[team] || '#888';
  const n = f.n, o = f.o, a = f.a;
  const at = (uu, out, vv) => P(o[0] + a[0] * uu + n[0] * out, o[1] + a[1] * uu + n[1] * out, o[2] + vv);
  const k = Math.max(3, Math.round(w / 0.1));
  for (let i = 0; i < k; i++) {
    const u0 = u + i * w / k, u1 = u + (i + 1) * w / k;
    ctx.fillStyle = shade(i % 2 ? alt : tc, LIT.T * 0.95);
    ctx.beginPath(); ctx.moveTo(...at(u0, 0, v)); ctx.lineTo(...at(u1, 0, v)); ctx.lineTo(...at(u1, d, v - d * 0.5)); ctx.lineTo(...at(u0, d, v - d * 0.5)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(i % 2 ? alt : tc, f.light * 0.9);
    ctx.beginPath(); ctx.moveTo(...at(u0, d, v - d * 0.5)); ctx.lineTo(...at(u1, d, v - d * 0.5)); ctx.lineTo(...at(u1, d, v - d * 0.5 - 0.06)); ctx.lineTo(...at(u0, d, v - d * 0.5 - 0.06)); ctx.closePath(); ctx.fill();
  }
}

// ------------------------------------------------------------ props
export function barrel(ctx, x, y, col = '#7a4a26') {
  tcyl(ctx, x, y, 0, 0.2, 0.075, col, 'planks', 10);
  const c = hexToRgb(col);
  for (const z of [0.05, 0.15]) { ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 0.7; ctx.beginPath(); for (let k = 0; k <= 8; k++) { const a = -0.8 + k / 8 * 3.2; const q = P(x + Math.cos(a) * 0.077, y + Math.sin(a) * 0.077, z); k ? ctx.lineTo(...q) : ctx.moveTo(...q); } ctx.stroke(); }
  void c;
}
export function crate(ctx, x, y, s = 0.16, z = 0, col = '#9a7448') {
  tbox(ctx, x - s / 2, y - s / 2, x + s / 2, y + s / 2, z, z + s * 0.9, col, 'hplanks', { edgeA: 0.5 });
  ctx.strokeStyle = shade(col, 0.5); ctx.lineWidth = 0.6;
  const a = P(x - s / 2, y + s / 2, z), b = P(x + s / 2, y + s / 2, z + s * 0.9); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
}
export function sack(ctx, x, y, col = '#c8b080') {
  const [sx, sy] = P(x, y, 0);
  ctx.fillStyle = shade(col, 0.9); ctx.beginPath(); ctx.ellipse(sx, sy - 3, 3.6, 3.4, 0, 0, 7); ctx.fill();
  ctx.fillStyle = shade(col, 1.15); ctx.beginPath(); ctx.ellipse(sx - 1, sy - 4, 2, 2, 0, 0, 7); ctx.fill();
  ctx.fillStyle = shade(col, 0.7); ctx.fillRect(sx - 1, sy - 7.5, 2, 1.5);
}
export function hay(ctx, x, y, r = 0.18) {
  tdome(ctx, x, y, 0, r, '#d6b85a', { ribs: 0 });
  const [sx, sy] = P(x, y, 0);
  ctx.strokeStyle = 'rgba(120,90,30,0.6)'; ctx.lineWidth = 0.5;
  for (let k = 0; k < 10; k++) { const a = hash2(k, 1, 3) * Math.PI; ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * r * 30, sy - Math.sin(a) * r * 20); ctx.lineTo(sx + Math.cos(a) * r * 20, sy - Math.sin(a) * r * 26); ctx.stroke(); }
}
export function bale(ctx, x, y, z = 0) { // square hay bale
  tbox(ctx, x - 0.1, y - 0.07, x + 0.1, y + 0.07, z, z + 0.1, '#d9bf62', 'thatch', { edgeA: 0.4 });
}
export function logs(ctx, x, y, n = 3, along = 'y', len = 0.5) {
  for (let r = 0, k = 0; r < n; r++) for (let i = 0; i < n - r; i++, k++) {
    const off = (i - (n - r - 1) / 2) * 0.1, z = 0.04 + r * 0.08;
    const a = along === 'y' ? P(x + off, y - len / 2, z) : P(x - len / 2, y + off, z), b = along === 'y' ? P(x + off, y + len / 2, z) : P(x + len / 2, y + off, z);
    ctx.strokeStyle = shade('#6b4526', 0.8 + hash2(k, 2, 9) * 0.3); ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,170,0.25)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(a[0], a[1] - 1.2); ctx.lineTo(b[0], b[1] - 1.2); ctx.stroke();
    ctx.fillStyle = '#d8b07a'; ctx.beginPath(); ctx.ellipse(b[0], b[1], 1.8, 1.7, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.arc(b[0], b[1], 0.8, 0, 7); ctx.stroke();
  }
  ctx.lineCap = 'butt';
}
export function rockPile(ctx, x, y, col = '#9a9890', n = 6, gold = false) {
  for (let i = 0; i < n; i++) {
    const p = P(x + (hash2(i, 1, 4) - 0.5) * 0.3, y + (hash2(i, 2, 4) - 0.5) * 0.3, 0);
    const r = 2.2 + hash2(i, 3, 4) * 2;
    const c = gold && i % 2 ? '#e2b93a' : col;
    ctx.fillStyle = shade(c, 0.75); ctx.beginPath(); ctx.ellipse(p[0], p[1] - r * 0.6, r, r * 0.8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = shade(c, 1.15); ctx.beginPath(); ctx.ellipse(p[0] - r * 0.3, p[1] - r * 0.9, r * 0.55, r * 0.4, 0, 0, 7); ctx.fill();
  }
}
export function fence(ctx, pts, col = '#6b4a2a', h = 0.22, kind = 'rail') {
  ctx.lineCap = 'round';
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / (kind === 'picket' ? 0.1 : 0.35)));
    for (let k = 0; k <= n; k++) {
      const x = ax + (bx - ax) * k / n, y = ay + (by - ay) * k / n;
      const a = P(x, y, 0), b = P(x, y, h);
      ctx.strokeStyle = shade(col, 0.7); ctx.lineWidth = kind === 'palisade' ? 3 : 1.2; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
      if (kind === 'palisade') { ctx.fillStyle = shade(col, 1.1); ctx.beginPath(); ctx.moveTo(b[0] - 1.5, b[1]); ctx.lineTo(b[0], b[1] - 2.5); ctx.lineTo(b[0] + 1.5, b[1]); ctx.fill(); ctx.strokeStyle = 'rgba(255,230,190,0.25)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(a[0] - 0.8, a[1]); ctx.lineTo(b[0] - 0.8, b[1]); ctx.stroke(); }
    }
    if (kind !== 'palisade') {
      ctx.strokeStyle = shade(col, 1.05); ctx.lineWidth = 1;
      for (const z of kind === 'picket' ? [h * 0.75] : [h * 0.45, h * 0.9]) { ctx.beginPath(); ctx.moveTo(...P(ax, ay, z)); ctx.lineTo(...P(bx, by, z)); ctx.stroke(); }
    }
  }
}
export function lamp(ctx, x, y, h = 0.6, col = '#2a2a2a', light = 'rgba(255,220,140,0.9)') {
  const a = P(x, y, 0), b = P(x, y, h);
  ctx.strokeStyle = col; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
  const g = ctx.createRadialGradient(b[0], b[1], 0, b[0], b[1], 6); g.addColorStop(0, light); g.addColorStop(1, 'rgba(255,200,100,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b[0], b[1], 6, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(b[0], b[1], 1.3, 0, 7); ctx.fill();
}
export function antenna(ctx, x, y, z, h, col = '#c8ccd0') {
  const a = P(x, y, z), b = P(x, y, z + h);
  ctx.strokeStyle = col; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
  for (let k = 1; k < 4; k++) { const q = P(x, y, z + h * (0.4 + k * 0.15)); ctx.beginPath(); ctx.moveTo(q[0] - 2.5 + k * 0.4, q[1]); ctx.lineTo(q[0] + 2.5 - k * 0.4, q[1]); ctx.stroke(); }
  ctx.fillStyle = '#ff4a3a'; ctx.beginPath(); ctx.arc(b[0], b[1], 1.1, 0, 7); ctx.fill();
}
export function dish(ctx, x, y, z, r = 0.22, col = '#e8ecf0') {
  const b = P(x, y, z);
  ctx.strokeStyle = '#777'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0], b[1] - 6); ctx.stroke();
  ctx.save(); ctx.translate(b[0], b[1] - 9); ctx.rotate(-0.5);
  const R = r * 40;
  const g = ctx.createLinearGradient(-R, 0, R, 0); g.addColorStop(0, shade(col, 1.1)); g.addColorStop(1, shade(col, 0.6));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, R, R * 0.45, 0, 0, 7); ctx.fill();
  ctx.fillStyle = shade(col, 0.75); ctx.beginPath(); ctx.ellipse(0.5, -0.5, R * 0.8, R * 0.32, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#888'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1, -R * 0.7); ctx.stroke();
  ctx.restore();
}
export function solarPanel(ctx, x0, y0, x1, y1, z, tilt = 0.25) {
  const pts = [[x0, y1, z], [x1, y1, z], [x1, y0, z + tilt], [x0, y0, z + tilt]];
  ctx.strokeStyle = '#555'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(...P(x0 + 0.05, y1 - 0.05, 0)); ctx.lineTo(...P(x0 + 0.05, y1 - 0.05, z)); ctx.moveTo(...P(x1 - 0.05, y0 + 0.05, 0)); ctx.lineTo(...P(x1 - 0.05, y0 + 0.05, z + tilt)); ctx.stroke();
  vol(pts.concat(pts.map(p => [p[0], p[1], 0])).map(p => [p[0], p[1], p[2] * 0.4]));
  lit(ctx, pts, '#1f3866', 'solar', { edgeA: 0.6 });
}
export function acUnit(ctx, x, y, z) {
  tbox(ctx, x - 0.08, y - 0.08, x + 0.08, y + 0.08, z, z + 0.08, '#c8ccd0', 'metal');
  const c = P(x, y, z + 0.08); ctx.fillStyle = '#333'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 3, 1.5, 0, 0, 7); ctx.fill();
}
export function cart(ctx, x, y, load) {
  tbox(ctx, x - 0.22, y - 0.12, x + 0.22, y + 0.12, 0.08, 0.2, '#8a6236', 'hplanks', { edgeA: 0.5 });
  for (const [wx, wy] of [[x - 0.1, y + 0.13], [x + 0.12, y + 0.13]]) { const p = P(wx, wy, 0.07); ctx.strokeStyle = '#3a2614'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(p[0], p[1], 3.2, 3.6, 0.45, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(p[0] - 2, p[1] - 2.4); ctx.lineTo(p[0] + 2, p[1] + 2.4); ctx.stroke(); }
  const s = P(x + 0.22, y, 0.14), e = P(x + 0.5, y, 0.02); ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(...s); ctx.lineTo(...e); ctx.stroke();
  if (load === 'hay') hay(ctx, x, y, 0.13);
  else if (load === 'ore') rockPile(ctx, x, y, '#777', 4, true);
  else if (load === 'logs') logs(ctx, x, y, 2, 'x', 0.42);
}
export function rack(ctx, x, y, team, along = 'x', kind = 'spear') { // weapon rack
  const L = 0.45;
  const a0 = along === 'x' ? [x - L / 2, y] : [x, y - L / 2], a1 = along === 'x' ? [x + L / 2, y] : [x, y + L / 2];
  ctx.strokeStyle = '#4a3220'; ctx.lineWidth = 1.4;
  for (const p of [a0, a1]) { ctx.beginPath(); ctx.moveTo(...P(p[0], p[1], 0)); ctx.lineTo(...P(p[0], p[1], 0.32)); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(...P(a0[0], a0[1], 0.28)); ctx.lineTo(...P(a1[0], a1[1], 0.28)); ctx.stroke();
  for (let k = 0; k < 5; k++) {
    const f = (k + 0.5) / 5, px = a0[0] + (a1[0] - a0[0]) * f, py = a0[1] + (a1[1] - a0[1]) * f;
    const b = P(px, py, 0), t = P(px + 0.02, py - 0.02, kind === 'gun' ? 0.36 : 0.55);
    ctx.strokeStyle = kind === 'gun' ? '#2a2a2a' : '#7a5a34'; ctx.lineWidth = kind === 'gun' ? 1.3 : 0.9; ctx.beginPath(); ctx.moveTo(...b); ctx.lineTo(...t); ctx.stroke();
    if (kind !== 'gun') { ctx.fillStyle = '#cfd4da'; ctx.beginPath(); ctx.moveTo(t[0] - 1, t[1] + 1); ctx.lineTo(t[0], t[1] - 3); ctx.lineTo(t[0] + 1, t[1] + 1); ctx.fill(); }
  }
  // shield with team colour
  const sp = P((a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2, 0.18);
  ctx.fillStyle = TEAM[team] || '#888'; ctx.beginPath(); ctx.ellipse(sp[0], sp[1], 3.4, 3.8, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#d8c08a'; ctx.lineWidth = 0.7; ctx.stroke();
  ctx.fillStyle = '#d8c08a'; ctx.beginPath(); ctx.arc(sp[0], sp[1], 0.9, 0, 7); ctx.fill();
}
export function target(ctx, x, y, kind = 'straw') {
  const b = P(x, y, 0), c = P(x, y, 0.32);
  ctx.strokeStyle = '#4a3220'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(b[0] - 3, b[1]); ctx.lineTo(c[0] - 1, c[1]); ctx.moveTo(b[0] + 3, b[1]); ctx.lineTo(c[0] + 1, c[1]); ctx.moveTo(b[0] + 1, b[1] + 1); ctx.lineTo(c[0] + 2, c[1] + 2); ctx.stroke();
  if (kind === 'board') {
    ctx.fillStyle = '#e8e0cc'; ctx.fillRect(c[0] - 4, c[1] - 9, 8, 11); ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(c[0], c[1] - 5, 2.6, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(c[0], c[1] - 1, 3.4, 2.2, 0, Math.PI, 0); ctx.fill();
    return;
  }
  const rings = ['#d8c890', '#2a5ab0', '#d23a2a', '#f2d23a'];
  rings.forEach((col, i) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(c[0], c[1] - 3, 6.5 - i * 1.6, 7 - i * 1.7, 0, 0, 7); ctx.fill(); });
  ctx.strokeStyle = 'rgba(80,60,20,0.5)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.ellipse(c[0], c[1] - 3, 6.5, 7, 0, 0, 7); ctx.stroke();
  ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(c[0] + 1, c[1] - 4); ctx.lineTo(c[0] - 4, c[1] - 6); ctx.stroke();
}
export function dummy(ctx, x, y) {
  const b = P(x, y, 0), t = P(x, y, 0.42);
  ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(...b); ctx.lineTo(...t); ctx.moveTo(t[0] - 5, t[1] + 4); ctx.lineTo(t[0] + 5, t[1] + 4); ctx.stroke();
  ctx.fillStyle = '#c8a860'; ctx.beginPath(); ctx.ellipse(t[0], t[1] + 7, 3, 5, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(t[0], t[1] - 1, 2.6, 0, 7); ctx.fill();
}
export function trough(ctx, x, y) {
  tbox(ctx, x - 0.2, y - 0.06, x + 0.2, y + 0.06, 0, 0.09, '#6b4a2a', 'hplanks');
  face(ctx, [[x - 0.17, y - 0.04, 0.085], [x + 0.17, y - 0.04, 0.085], [x + 0.17, y + 0.04, 0.085], [x - 0.17, y + 0.04, 0.085]], '#4a7a9a');
}
export function well(ctx, x, y) {
  tcyl(ctx, x, y, 0, 0.18, 0.13, '#8a857a', 'stone', 14);
  const t = P(x, y, 0.18); ctx.fillStyle = '#1a2a34'; ctx.beginPath(); ctx.ellipse(t[0], t[1], 5, 2.5, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#4a3220'; ctx.lineWidth = 1.2; const a = P(x - 0.12, y, 0.18), b = P(x - 0.12, y, 0.5), c = P(x + 0.12, y, 0.18), d = P(x + 0.12, y, 0.5);
  ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...d); ctx.lineTo(...c); ctx.stroke();
}
export function pots(ctx, x, y, n = 3, col = '#b8683a') {
  for (let i = 0; i < n; i++) {
    const p = P(x + (i % 2) * 0.1, y + i * 0.08, 0);
    const g = ctx.createRadialGradient(p[0] - 1.5, p[1] - 6, 0.5, p[0], p[1] - 4, 5); g.addColorStop(0, shade(col, 1.3)); g.addColorStop(1, shade(col, 0.6));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 4, 3, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = shade(col, 0.5); ctx.fillRect(p[0] - 1.2, p[1] - 9, 2.4, 1.6);
  }
}
export function torch(ctx, x, y, z = 0, h = 0.4) {
  const a = P(x, y, z), b = P(x, y, z + h);
  ctx.strokeStyle = '#3a2614'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
  const g = ctx.createRadialGradient(b[0], b[1] - 2, 0, b[0], b[1] - 2, 6); g.addColorStop(0, 'rgba(255,240,170,1)'); g.addColorStop(0.35, 'rgba(255,150,40,0.8)'); g.addColorStop(1, 'rgba(255,100,20,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b[0], b[1] - 2, 6, 0, 7); ctx.fill();
}
// ground patch under a building
let GROUND = null;
export function setGround(c) { GROUND = c; }
export function groundPatch(ctx, x0, y0, x1, y1, col, mat = 'earth', soft = true) {
  if (GROUND) ctx = GROUND;
  ctx.save();
  if (soft && 'filter' in ctx) ctx.filter = 'blur(1.5px)';
  const f = topF(x0, y0, x1, y1, 0);
  paint(ctx, f, mat, col, { edge: false });
  ctx.restore();
}
export { shade, mix, hexToRgb, rgb, hash2, TEAM, TW, TH, ZH };
