// Mountain tiles: faceted rock massifs with strata, cracks, ledges, scree at
// the base, theme-specific vegetation / dust and snow caps. One sprite per
// (theme, variant, height class); neighbouring tiles overlap so a mountain
// range reads as one connected massif rather than a field of cones.
import { TW, TH, ZH, hash2, vnoise, shade } from '../util.js';
import { castShadows } from './kit.js';

const P = (x, y, z = 0) => [(x - y) * TW / 2, (x + y) * TH / 2 - z * ZH];
const mixA = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
const LV = (() => { const v = [-0.5, 0.42, 0.76]; const l = Math.hypot(...v); return v.map(c => c / l); })();

// per-theme look
const LOOK = {
  temperate: { rock: [118, 112, 104], alt: [96, 92, 88], strata: 0.5, veg: [70, 104, 44], snow: 2, scree: [128, 122, 112], mesa: 0 },
  winter: { rock: [112, 118, 130], alt: [92, 98, 112], strata: 0.4, veg: null, snow: 0, scree: [150, 156, 168], mesa: 0, dust: [236, 242, 250] },
  desert: { rock: [184, 132, 86], alt: [160, 104, 66], strata: 1, veg: [120, 116, 62], snow: 9, scree: [196, 160, 112], mesa: 0.5 },
  tropical: { rock: [104, 104, 88], alt: [84, 88, 72], strata: 0.4, veg: [52, 112, 40], snow: 9, scree: [118, 112, 92], mesa: 0, lush: 1 },
  moon: { rock: [128, 128, 134], alt: [104, 104, 110], strata: 0.15, veg: null, snow: 9, scree: [150, 150, 154], mesa: 0, smooth: 1 },
  mars: { rock: [150, 76, 50], alt: [122, 58, 40], strata: 0.9, veg: null, snow: 9, scree: [170, 100, 66], mesa: 0.35 },
  space: { rock: [96, 88, 84], alt: [70, 66, 66], strata: 0.3, veg: null, snow: 9, scree: [108, 102, 98], mesa: 0, crystal: 1 },
};

const cache = new Map();
const SC = 2; // backing-store scale

function rnd(v, i, k) { return hash2(v * 31 + i, k, 97); }

// height field of one mountain tile: a ridged-noise massif with a couple of
// peaks, falling off towards an irregular footprint (radius ~R tiles)
function field(seed, hc, L, N, R) {
  const H = [0.72, 1.18, 1.8][hc] * (0.85 + rnd(seed, 0, 1) * 0.3);
  const hf = new Float32Array((N + 1) * (N + 1)), pu = new Float32Array((N + 1) * (N + 1)), pv = new Float32Array((N + 1) * (N + 1));
  const ox = rnd(seed, 0, 2) * 50, oy = rnd(seed, 0, 3) * 50;
  const peaks = [];
  const np = hc === 0 ? 2 : 2 + Math.floor(rnd(seed, 0, 4) * 2);
  for (let k = 0; k < np; k++) { const a = rnd(seed, k, 5) * 6.28, d = k === 0 ? rnd(seed, k, 6) * 0.15 : 0.2 + rnd(seed, k, 6) * 0.3; peaks.push([Math.cos(a) * d, Math.sin(a) * d, k === 0 ? 1 : 0.45 + rnd(seed, k, 7) * 0.4, 0.22 + rnd(seed, k, 8) * 0.14]); }
  let mx = 0;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const u = (i / N * 2 - 1) * R, v = (j / N * 2 - 1) * R;
    const ang = Math.atan2(v, u);
    const rr = R * (0.72 + 0.28 * vnoise(Math.cos(ang) * 1.6 + ox, Math.sin(ang) * 1.6 + oy, seed));
    const d = Math.hypot(u, v) / rr;
    pu[j * (N + 1) + i] = u; pv[j * (N + 1) + i] = v;
    if (d >= 1) { hf[j * (N + 1) + i] = 0; pu[j * (N + 1) + i] = u / d; pv[j * (N + 1) + i] = v / d; continue; }
    const fall = Math.pow(1 - d * d, 1.25);
    const r1 = 1 - Math.abs(2 * vnoise(u * 3.1 + ox, v * 3.1 + oy, seed + 1) - 1);
    const r2 = 1 - Math.abs(2 * vnoise(u * 7.3 + oy, v * 7.3 + ox, seed + 2) - 1);
    let pk = 0;
    for (const [px, py, a, s] of peaks) pk = Math.max(pk, a * Math.exp(-((u - px) ** 2 + (v - py) ** 2) / (s * s)));
    const cliff = Math.min(1, (1 - d) * 3.2); // steeper flanks, less dome-like
    let h = hc === 0 ? cliff * fall * (0.12 + 0.55 * r1 + 0.3 * r2) + pk * fall * 0.6 : fall * (0.3 + 0.32 * r1 + 0.14 * r2) * (0.6 + 0.4 * cliff) + pk * fall * 0.9;
    if (L.mesa && L.isMesa) h = Math.min(h, 0.62 + 0.04 * r2); // flat-topped butte
    if (L.smooth) h = fall * (0.5 + 0.12 * r1) + pk * fall * 0.6;
    hf[j * (N + 1) + i] = h; if (h > mx) mx = h;
  }
  const k = H / (mx || 1);
  for (let i = 0; i < hf.length; i++) hf[i] *= k;
  return { hf, pu, pv, H };
}

function drawField(ctx, L, seed, hc, N, R, F) {
  const { hf, pu, pv, H } = F;
  const V3 = (i, j) => { const k = j * (N + 1) + i; return [pu[k], pv[k], hf[k]]; };
  const at = (i, j) => hf[j * (N + 1) + i];
  const cs = 2 * R / N;
  const X = (i) => (i / N * 2 - 1) * R;
  const snowLine = L.snow === 0 ? H * (0.4 + rnd(seed, 1, 22) * 0.12) : L.snow === 2 && hc === 2 ? H * 0.6 : 99;
  const step = L.smooth ? 0.4 : 0.085 + rnd(seed, 1, 23) * 0.04;
  const tiltX = (rnd(seed, 1, 20) - 0.5) * 0.4, tiltY = (rnd(seed, 1, 21) - 0.5) * 0.4;
  const so = rnd(seed, 1, 24) * 9;
  // back to front: screen depth grows with i + j
  for (let s = 0; s <= 2 * (N - 1); s++) for (let i = Math.max(0, s - N + 1); i <= Math.min(N - 1, s); i++) {
    const j = s - i;
    const h00 = at(i, j), h10 = at(i + 1, j), h01 = at(i, j + 1), h11 = at(i + 1, j + 1);
    if (h00 + h10 + h01 + h11 <= 0) continue;
    const q00 = V3(i, j), q10 = V3(i + 1, j), q01 = V3(i, j + 1), q11 = V3(i + 1, j + 1);
    // two triangles: (00,10,11) and (00,11,01)
    for (let tri = 0; tri < 2; tri++) {
      const A = q00, B = tri ? q11 : q10, C = tri ? q01 : q11;
      if (A[2] <= 0 && B[2] <= 0 && C[2] <= 0) continue;
      const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const nl = Math.hypot(...n) || 1; n = n.map(q => q / nl); if (n[2] < 0) n = n.map(q => -q);
      const dl = n[0] * LV[0] + n[1] * LV[1] + n[2] * LV[2];
      const zc = (A[2] + B[2] + C[2]) / 3, uc = (A[0] + B[0] + C[0]) / 3, vc = (A[1] + B[1] + C[1]) / 3;
      const hfr = zc / H;
      const jit = (hash2(i * 2 + tri, j, seed) - 0.5) * 0.07;
      let lum = 0.46 + 0.68 * Math.max(0, dl) + jit;
      lum *= 0.88 + 0.12 * Math.min(1, hfr * 2.2); // occlusion low down
      let col = mixA(L.alt, L.rock, 0.3 + 0.7 * Math.min(1, hfr * 1.3));
      if (zc < 0.14) { col = mixA(L.scree, col, zc / 0.14); lum = lum + (1 - lum) * (1 - zc / 0.14) * 0.6; } // talus apron blends into the ground
      // bedding planes: dark seams and lit ledges, coloured bands on sediments
      const sz = zc + uc * tiltX + vc * tiltY + vnoise(uc * 2.2 + so, vc * 2.2, seed) * 0.05;
      const fr = (sz / step) % 1;
      const band = Math.floor(sz / step + so);
      if (L.strata >= 0.9 && band % 3 === 0) col = mixA(col, band % 2 ? [236, 196, 150] : [110, 60, 40], 0.22);
      if (n[2] < 0.86 && !L.smooth) { if (fr < 0.16 * (0.4 + L.strata)) lum *= 0.72; else if (fr > 0.88) lum *= 1.12; }
      if (!L.dust) col = mixA(col, [70, 80, 112], Math.max(0, 0.3 - dl) * 0.35); // cool shadow sides
      // vegetation on gentle low slopes
      if (L.veg && n[2] > (L.lush ? 0.62 : 0.78) && hfr < (L.lush ? 0.6 : 0.4) && vnoise(uc * 9 + so, vc * 9, seed + 5) * 0.7 + vnoise(uc * 3, vc * 3, seed + 6) * 0.3 > (L.lush ? 0.42 : 0.6)) col = mixA(col, L.veg, 0.75);
      // snow: above a ragged line, sliding off the steepest faces
      let snow = false;
      if (zc > snowLine + (vnoise(uc * 6, vc * 6, seed + 7) - 0.5) * 0.3 * H && n[2] > (L.snow === 0 ? 0.3 : 0.45)) snow = true;
      else if (L.snow === 0 && n[2] > 0.75 && vnoise(uc * 8 + so, vc * 8, seed + 3) > 0.52) snow = true; // drifts on ledges
      let fill;
      if (snow) { const sl = 0.6 + 0.55 * Math.max(0, dl); fill = sl > 0.98 ? shade([242, 246, 252], Math.min(1.06, sl)) : shade([196, 210, 234], 0.66 + sl * 0.34); }
      else fill = shade(col, lum);
      const a = P(...A), b = P(...B), c = P(...C);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = fill; ctx.lineWidth = 0.6; ctx.stroke();
    }
  }
  // cracks / gullies: dark streaks running down steep lit faces
  if (!L.smooth) for (let k = 0; k < 6 + hc * 4; k++) {
    let u = (rnd(seed, k, 80) * 2 - 1) * R * 0.6, v = (rnd(seed, k, 81) * 2 - 1) * R * 0.6;
    const gi = (q) => Math.max(0, Math.min(N, Math.round((q / R + 1) / 2 * N)));
    if (at(gi(u), gi(v)) < H * 0.25) continue;
    ctx.beginPath(); let p = P(u, v, at(gi(u), gi(v)) + 0.01); ctx.moveTo(p[0], p[1]);
    for (let t = 0; t < 6; t++) {
      // walk downhill
      const i = gi(u), j = gi(v), h = at(i, j);
      const gx = at(Math.min(N, i + 1), j) - at(Math.max(0, i - 1), j), gy = at(i, Math.min(N, j + 1)) - at(i, Math.max(0, j - 1));
      const gl = Math.hypot(gx, gy) || 1;
      u -= gx / gl * cs * 1.4 + (rnd(seed, k * 9 + t, 82) - 0.5) * cs; v -= gy / gl * cs * 1.4 + (rnd(seed, k * 9 + t, 83) - 0.5) * cs;
      const h2 = at(gi(u), gi(v)); if (h2 <= 0.05) break;
      p = P(u, v, h2 + 0.01); ctx.lineTo(p[0], p[1]);
      if (h2 > h) break;
    }
    ctx.strokeStyle = 'rgba(22,16,12,0.38)'; ctx.lineWidth = 0.7; ctx.stroke();
  }
  // space rock: faint crystal glints
  if (L.crystal) for (let k = 0; k < 2; k++) {
    const i = Math.floor(N * (0.25 + rnd(seed, k, 90) * 0.5)), j = Math.floor(N * (0.25 + rnd(seed, k, 91) * 0.5)); const h = at(i, j); if (h < 0.1) continue;
    const p = P(X(i), X(j), h); ctx.fillStyle = 'rgba(120,230,255,0.85)'; ctx.fillRect(p[0] - 0.6, p[1] - 1.5, 1.2, 2.4); ctx.fillStyle = 'rgba(120,230,255,0.2)'; ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 7); ctx.fill();
  }
}

function scree(ctx, L, cx, cy, r, seed, n) {
  for (let i = 0; i < n; i++) {
    const a = -0.6 + rnd(seed, i, 60) * 2.6; // mostly the front half
    const d = r * (0.85 + rnd(seed, i, 61) * 0.55);
    const [x, y] = P(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0);
    const s = 0.8 + rnd(seed, i, 62) * (i % 5 === 0 ? 2.6 : 1.4);
    const c = mixA(L.scree, L.alt, rnd(seed, i, 63) * 0.6);
    ctx.fillStyle = 'rgba(10,8,6,0.25)'; ctx.beginPath(); ctx.ellipse(x + s * 0.4, y + s * 0.15, s * 1.1, s * 0.45, 0, 0, 7); ctx.fill();
    ctx.fillStyle = shade(c, 1.05); ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x - s * 0.2, y - s * 0.9); ctx.lineTo(x + s * 0.8, y - s * 0.4); ctx.lineTo(x + s, y + s * 0.1); ctx.lineTo(x, y + s * 0.35); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(c, 0.66); ctx.beginPath(); ctx.moveTo(x + s * 0.8, y - s * 0.4); ctx.lineTo(x + s, y + s * 0.1); ctx.lineTo(x, y + s * 0.35); ctx.lineTo(x + s * 0.1, y - s * 0.2); ctx.closePath(); ctx.fill();
    if (L.dust) { ctx.fillStyle = 'rgba(244,248,255,0.85)'; ctx.fillRect(x - s * 0.6, y - s * 0.75, s * 1.0, Math.max(0.6, s * 0.3)); }
  }
}

export function hasMountainSprite(themeName, v, hc = 1) { return cache.has(themeName + '|' + v + '|' + hc); }

// Sprite for a mountain tile. v: variant (0..5); hc: height class 0 (edge,
// low crags) .. 2 (interior peaks). Anchor (ox, oy) = tile centre.
export function mountainSprite(themeName, v, hc = 1) {
  const key = themeName + '|' + v + '|' + hc;
  let c = cache.get(key);
  if (c) return c;
  const L0 = LOOK[themeName] || LOOK.temperate;
  const W = 150, H = 150, ox = 75, oy = 108;
  const cv = document.createElement('canvas'); cv.width = W * SC; cv.height = H * SC;
  const ctx = cv.getContext('2d');
  ctx.setTransform(SC, 0, 0, SC, ox * SC, oy * SC);
  ctx.lineJoin = 'round';
  const seed = v * 3 + hc * 17 + 5;
  const L = { ...L0, isMesa: L0.mesa && rnd(seed, 2, 1) < L0.mesa && hc < 2 };
  const N = 30, R = 0.95;
  const F = field(seed, hc, L, N, R);
  // soft cast shadow (falls to the right): footprint ring plus the summit
  const ring = [];
  let top = [0, 0, 0];
  for (let j = 0; j <= N; j += 2) for (let i = 0; i <= N; i += 2) { const h = F.hf[j * (N + 1) + i]; if (h > 0.02) { const p = [(i / N * 2 - 1) * R, (j / N * 2 - 1) * R]; ring.push([p[0], p[1], 0]); if (h > top[2]) top = [p[0], p[1], h]; } }
  castShadows(ctx, [ring.concat([top])], 0.3);
  // dusty / mossy apron blending into the surrounding ground
  const g = ctx.createRadialGradient(0, 2, 4, 0, 2, 46);
  const ap = L.scree;
  g.addColorStop(0, `rgba(${ap[0] * 0.9 | 0},${ap[1] * 0.9 | 0},${ap[2] * 0.9 | 0},0.4)`); g.addColorStop(1, `rgba(${ap[0]},${ap[1]},${ap[2]},0)`);
  ctx.save(); ctx.scale(1, 0.5); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 4, 46, 0, 7); ctx.fill(); ctx.restore();
  scree(ctx, L, 0, 0, 0.55, seed + 7, 6);
  drawField(ctx, L, seed, hc, N, R, F);
  // loose scree and boulders spilling out in front
  scree(ctx, L, 0, 0, 0.7, seed + 99, 9 + hc * 3);
  if (L.veg && !L.dust) { // shrubs at the foot
    for (let i = 0; i < (L.lush ? 5 : 3); i++) {
      if (rnd(seed, i, 70) < 0.35) continue;
      const a = -0.5 + rnd(seed, i, 71) * 2.4, d = 0.7 + rnd(seed, i, 72) * 0.2;
      const [x, y] = P(Math.cos(a) * d, Math.sin(a) * d, 0);
      const r = 2 + rnd(seed, i, 73) * (L.lush ? 3 : 2);
      ctx.fillStyle = 'rgba(10,14,6,0.3)'; ctx.beginPath(); ctx.ellipse(x + 1.5, y + 0.5, r * 1.2, r * 0.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = shade(L.veg, 0.7); ctx.beginPath(); ctx.ellipse(x, y - r * 0.5, r * 1.1, r * 0.8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = shade(L.veg, 1.05); ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.8, r * 0.7, r * 0.5, 0, 0, 7); ctx.fill();
    }
  }
  c = { canvas: cv, ox, oy, w: W, h: H };
  cache.set(key, c);
  return c;
}
