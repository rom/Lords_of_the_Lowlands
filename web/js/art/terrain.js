// Small terrain decals baked into the cached terrain chunks: grass tufts,
// flowers, pebbles, sand ripples, dry shrubs, shoreline reeds, snow glints,
// craters and deck lights. Placement is deterministic per tile.
import { TW, TH, hash2, iso } from '../util.js';

const T_GRASS = 0, T_DIRT = 1, T_SAND = 2, T_WATER = 3, T_MTN = 4, T_SHALLOW = 5, T_ROAD = 6;
const TAU = Math.PI * 2;

// r: {tiles, w, h, themeName}; draws into ctx whose origin is chunk offset (ox, oy)
export function decorateChunk(ctx, r, x0, y0, n, ox, oy) {
  const { tiles, w, h, themeName } = r;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? -1 : tiles[y * w + x];
  const lush = themeName === 'temperate' || themeName === 'tropical';
  const winter = themeName === 'winter', desert = themeName === 'desert';
  const rocky = themeName === 'moon' || themeName === 'mars', space = themeName === 'space';
  ctx.save(); ctx.translate(-ox, -oy);
  ctx.lineCap = 'round';
  for (let ty = y0; ty < Math.min(h, y0 + n); ty++) for (let tx = x0; tx < Math.min(w, x0 + n); tx++) {
    const t = tiles[ty * w + tx];
    if (t === T_WATER || t === T_SHALLOW || t === T_MTN) continue;
    // neighbours: is this tile next to water? (decals stay away from blends)
    let wet = 0, same = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const q = at(tx + dx, ty + dy);
      if (q === T_WATER || q === T_SHALLOW) wet++;
      if (q === t) same++;
    }
    const rnd = (k) => hash2(tx * 3 + k, ty * 5 - k, 41);
    const pt = (u, v) => iso(tx + u, ty + v);
    if (wet && lush && (t === T_GRASS || t === T_DIRT)) { // reeds and cattails along the shore
      for (let i = 0; i < 3; i++) {
        if (rnd(i) < 0.35) continue;
        const [sx, sy] = pt(0.2 + rnd(10 + i) * 0.6, 0.2 + rnd(20 + i) * 0.6);
        reeds(ctx, sx, sy, rnd(30 + i), themeName === 'tropical');
      }
      continue;
    }
    if (wet) continue;
    const inner = same >= 8;
    if (space) {
      if (t === T_GRASS && rnd(1) > 0.72) { // deck lights / vents
        const [sx, sy] = pt(0.25 + rnd(2) * 0.5, 0.25 + rnd(3) * 0.5);
        if (rnd(4) < 0.5) { ctx.fillStyle = rnd(5) < 0.5 ? 'rgba(120,230,255,0.9)' : 'rgba(255,190,90,0.9)'; ctx.fillRect(sx - 1, sy - 0.5, 2, 1); ctx.fillStyle = 'rgba(120,230,255,0.15)'; ctx.beginPath(); ctx.ellipse(sx, sy, 5, 2.5, 0, 0, TAU); ctx.fill(); }
        else { ctx.strokeStyle = 'rgba(10,14,20,0.5)'; ctx.lineWidth = 0.8; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(sx - 4 + k * 2, sy - 1 + k); ctx.lineTo(sx + k * 2, sy + 1 + k); ctx.stroke(); } }
      }
      continue;
    }
    if (rocky) {
      if ((t === T_GRASS || t === T_DIRT || t === T_SAND) && rnd(1) > (inner ? 0.6 : 0.85)) {
        const [sx, sy] = pt(0.3 + rnd(2) * 0.4, 0.3 + rnd(3) * 0.4);
        crater(ctx, sx, sy, 3 + rnd(4) * (inner ? 9 : 4), themeName === 'mars');
      }
      for (let i = 0; i < 3; i++) if (rnd(50 + i) > 0.5) { const [sx, sy] = pt(0.15 + rnd(60 + i) * 0.7, 0.15 + rnd(70 + i) * 0.7); pebble(ctx, sx, sy, 0.8 + rnd(80 + i) * 1.2, themeName === 'mars' ? [120, 60, 36] : [90, 90, 94]); }
      continue;
    }
    if (t === T_GRASS) {
      if (winter) {
        for (let i = 0; i < 4; i++) { const [sx, sy] = pt(0.1 + rnd(i) * 0.8, 0.1 + rnd(9 + i) * 0.8); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(sx, sy, 1, 1); ctx.fillStyle = 'rgba(150,180,220,0.35)'; ctx.fillRect(sx + 1, sy + 1, 1, 1); }
        if (rnd(30) > 0.8) { const [sx, sy] = pt(0.3 + rnd(31) * 0.4, 0.3 + rnd(32) * 0.4); tuft(ctx, sx, sy, [110, 100, 70], 4, rnd(33)); }
        continue;
      }
      const base = desert ? [150, 130, 70] : themeName === 'tropical' ? [40, 110, 34] : [60, 104, 34];
      const nT = desert ? 1 : 2 + Math.floor(rnd(1) * 4);
      for (let i = 0; i < nT; i++) {
        const [sx, sy] = pt(0.12 + rnd(10 + i) * 0.76, 0.12 + rnd(20 + i) * 0.76);
        tuft(ctx, sx, sy, base, 3 + rnd(30 + i) * 3, rnd(40 + i));
      }
      if (lush && rnd(2) > 0.88) { // flower patch
        const [sx, sy] = pt(0.25 + rnd(3) * 0.5, 0.25 + rnd(4) * 0.5);
        const fc = ['#ece8d8', '#e8c840', '#b080c0', '#d06060', '#e8e0f0'][Math.floor(rnd(5) * 5)];
        for (let i = 0; i < 5; i++) { const fx = sx + (rnd(60 + i) - 0.5) * 9, fy = sy + (rnd(70 + i) - 0.5) * 4.5; ctx.strokeStyle = 'rgba(40,80,20,0.7)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(fx, fy + 2); ctx.lineTo(fx, fy); ctx.stroke(); ctx.fillStyle = fc; ctx.fillRect(fx - 0.9, fy - 0.9, 1.8, 1.8); ctx.fillStyle = 'rgba(255,240,150,0.9)'; ctx.fillRect(fx - 0.3, fy - 0.3, 0.6, 0.6); }
      }
      if (rnd(6) > (desert ? 0.75 : 0.9)) { const [sx, sy] = pt(0.3 + rnd(7) * 0.4, 0.3 + rnd(8) * 0.4); if (desert) shrub(ctx, sx, sy, rnd(9)); else pebble(ctx, sx, sy, 1.4 + rnd(9) * 1.4, [128, 124, 116]); }
    } else if (t === T_DIRT) {
      for (let i = 0; i < 4; i++) if (rnd(i) > 0.35) { const [sx, sy] = pt(0.12 + rnd(10 + i) * 0.76, 0.12 + rnd(20 + i) * 0.76); pebble(ctx, sx, sy, 0.7 + rnd(30 + i) * 1.3, winter ? [120, 118, 122] : [110, 92, 70]); }
      if (!winter && lush && rnd(5) > 0.6) { const [sx, sy] = pt(0.2 + rnd(6) * 0.6, 0.2 + rnd(7) * 0.6); tuft(ctx, sx, sy, [80, 100, 40], 3, rnd(8)); }
      if (rnd(9) > 0.85) { const [sx, sy] = pt(0.3 + rnd(11) * 0.4, 0.3 + rnd(12) * 0.4); ctx.strokeStyle = 'rgba(60,40,24,0.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(sx - 5, sy); ctx.lineTo(sx - 1, sy - 1); ctx.lineTo(sx + 2, sy + 1); ctx.lineTo(sx + 6, sy); ctx.stroke(); } // crack
    } else if (t === T_SAND) {
      // wind ripples
      ctx.strokeStyle = 'rgba(120,96,56,0.22)'; ctx.lineWidth = 0.8;
      for (let i = 0; i < 3; i++) { const [sx, sy] = pt(0.2 + rnd(i) * 0.6, 0.2 + rnd(5 + i) * 0.6); ctx.beginPath(); ctx.moveTo(sx - 7, sy); ctx.quadraticCurveTo(sx, sy - 2.2, sx + 7, sy); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,250,230,0.25)';
      for (let i = 0; i < 2; i++) { const [sx, sy] = pt(0.2 + rnd(20 + i) * 0.6, 0.2 + rnd(25 + i) * 0.6); ctx.beginPath(); ctx.moveTo(sx - 6, sy - 0.8); ctx.quadraticCurveTo(sx, sy - 3, sx + 6, sy - 0.8); ctx.stroke(); }
      if (rnd(40) > 0.88) { const [sx, sy] = pt(0.3 + rnd(41) * 0.4, 0.3 + rnd(42) * 0.4); if (desert && rnd(43) > 0.5) shrub(ctx, sx, sy, rnd(44)); else shell(ctx, sx, sy); }
    } else if (t === T_ROAD) {
      // wheel ruts and loose stones
      if (rnd(1) > 0.5) { const [sx, sy] = pt(0.2 + rnd(2) * 0.6, 0.2 + rnd(3) * 0.6); pebble(ctx, sx, sy, 0.8 + rnd(4), [100, 92, 80]); }
    }
  }
  ctx.restore();
}

function tuft(ctx, x, y, base, hgt, r) {
  const [R, G, B] = base;
  const n = 4 + Math.floor(r * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1) - 0.5) * 1.6 + (r - 0.5) * 0.3, l = hgt * (0.65 + ((i * 7 + r * 13) % 1) * 0.5);
    const k = i % 3 === 2 ? 1.45 : 0.55 + (i % 3) * 0.2;
    ctx.strokeStyle = `rgb(${Math.min(255, R * k) | 0},${Math.min(255, G * k) | 0},${Math.min(255, B * k) | 0})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + (i - n / 2) * 0.6, y); ctx.quadraticCurveTo(x + Math.sin(a) * l * 0.4 + (i - n / 2) * 0.6, y - l * 0.6, x + Math.sin(a) * l, y - Math.cos(a) * l); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(x + 1, y + 0.5, hgt * 0.7, hgt * 0.25, 0, 0, TAU); ctx.fill();
}
function pebble(ctx, x, y, r, c) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x + r * 0.4, y + r * 0.3, r * 1.1, r * 0.6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.65, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.25, r * 0.45, r * 0.25, 0, 0, TAU); ctx.fill();
}
function shrub(ctx, x, y, r) {
  ctx.strokeStyle = '#7a6040'; ctx.lineWidth = 0.7;
  for (let i = 0; i < 6; i++) { const a = -1.3 + i * 0.52 + r * 0.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(a) * 5, y - Math.cos(a) * 4); ctx.stroke(); }
  ctx.fillStyle = 'rgba(110,120,60,0.8)'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x + (i - 1.5) * 2, y - 3 - (i % 2), 1.3, 0, TAU); ctx.fill(); }
}
function shell(ctx, x, y) { ctx.fillStyle = '#f4ece0'; ctx.beginPath(); ctx.ellipse(x, y, 1.6, 1.1, 0.4, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(160,120,90,0.6)'; ctx.lineWidth = 0.4; ctx.stroke(); }
function reeds(ctx, x, y, r, tropical) {
  const n = 4 + Math.floor(r * 3);
  for (let i = 0; i < n; i++) {
    const bx = x + (i - n / 2) * 2.2 + ((i * 53 + r * 17) % 1 - 0.5), l = 4 + ((i * 37 + r * 91) % 1) * 7, lean = ((i * 13 + r * 7) % 1 - 0.5) * 6;
    ctx.strokeStyle = i % 3 === 0 ? (tropical ? '#4a8a30' : '#5a7a30') : i % 3 === 1 ? '#9aaa5a' : '#3a6a28'; ctx.lineWidth = 0.75;
    ctx.beginPath(); ctx.moveTo(bx, y); ctx.quadraticCurveTo(bx + lean * 0.3, y - l * 0.6, bx + lean, y - l); ctx.stroke();
    if (!tropical && i % 3 === 1) { ctx.fillStyle = '#6a4424'; ctx.beginPath(); ctx.ellipse(bx + lean * 0.9, y - l + 1, 0.9, 2, lean * 0.05, 0, TAU); ctx.fill(); }
  }
  ctx.fillStyle = 'rgba(0,20,10,0.15)'; ctx.beginPath(); ctx.ellipse(x, y + 0.5, n * 0.8, 1.4, 0, 0, TAU); ctx.fill();
}
function crater(ctx, x, y, r, red) {
  const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.1, 0, x, y, r);
  g.addColorStop(0, red ? 'rgba(80,30,16,0.35)' : 'rgba(30,30,36,0.35)'); g.addColorStop(0.75, red ? 'rgba(90,36,20,0.22)' : 'rgba(40,40,46,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = red ? 'rgba(255,200,160,0.3)' : 'rgba(255,255,255,0.28)'; ctx.lineWidth = Math.max(0.6, r * 0.12);
  ctx.beginPath(); ctx.ellipse(x, y, r * 0.92, r * 0.46, 0, 0.1, Math.PI - 0.1); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y, r * 0.92, r * 0.46, 0, Math.PI + 0.2, TAU - 0.2); ctx.stroke();
}
void TW; void TH;
