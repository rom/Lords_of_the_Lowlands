// Isometric renderer: procedural terrain chunks, animated water, entities,
// effects, fog of war and minimap.
import { TW, TH, ZH, TEAM, iso, fbm, vnoise, hash2, clamp, shade } from './util.js';
import { drawFlagCloth } from './art/kit.js';
import { theme, buildingSprite, buildingAnimated, drawBuildingAnim, drawBuildingFlags, resourceSprite, drawUnit, smokePoints, P, damageSprite, rubbleSprite, TREE_VARIANTS } from './sprites.js';
import { decorateChunk } from './art/terrain.js';
import { mountainSprite, hasMountainSprite } from './art/mountains.js';
import { isFootUnit } from './art/units.js';
import { puffSprite, glowSprite, stamp, shockwave } from './art/fx.js';

const CH = 8; // chunk size in tiles
const T_WATER = 3, T_MTN = 4, T_SHALLOW = 5;

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.zoom = 1;
    this.camX = 0; this.camY = 0;
    this.chunks = new Map();
    this.particles = [];
    this.shots = [];
    this.flashes = [];
    this.texts = [];
    this.corpses = [];   // short-lived client-side death animations
    this.decals = [];    // scorch marks and rubble that fade out
    this.waves = [];     // explosion shockwave rings
    this.birds = null;
    this.lastEnts = null;
    this.time = 0;
    this.defs = null;
    this.waterPattern = makeWaterPattern();
    this.stars = null;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.cv.getBoundingClientRect();
    this.dpr = dpr;
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
  }

  setMap(m) {
    this.w = m.w; this.h = m.h;
    this.tiles = new Uint8Array(m.w * m.h);
    for (let i = 0; i < this.tiles.length; i++) this.tiles[i] = m.tiles.charCodeAt(i) - 48;
    this.themeName = m.theme;
    this.th = theme(m.theme);
    this.computeShore();
    this.chunks.clear();
    this.rocks = null;
    this.stars = null;
  }

  setTile(x, y, t) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.tiles[y * this.w + x] = t;
  }

  // invalidate chunks overlapping a tile rect after edits
  invalidate(x0, y0, x1, y1) {
    this.computeShore();
    this.rocks = null;
    for (let cy = Math.floor((y0 - 1) / CH); cy <= Math.floor((y1 + 1) / CH); cy++)
      for (let cx = Math.floor((x0 - 1) / CH); cx <= Math.floor((x1 + 1) / CH); cx++) this.chunks.delete(cx + ',' + cy);
  }

  computeShore() {
    const { w, h, tiles } = this;
    const d = new Float32Array(w * h).fill(99);
    const q = [];
    for (let i = 0; i < tiles.length; i++) if (tiles[i] !== T_WATER) { d[i] = 0; q.push(i); }
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j); }
      }
    }
    this.shore = d;
  }

  tileAt(x, y) {
    x = clamp(x, 0, this.w - 1); y = clamp(y, 0, this.h - 1);
    return this.tiles[y * this.w + x];
  }

  // ---------------------------------------------------------- terrain
  terrainColor(t, wx, wy, n1, n2, shoreD, out) {
    const pal = this.th.t;
    let c = pal[t] || pal[0];
    let r = c[0], g = c[1], b = c[2];
    const space = this.themeName === 'space';
    switch (t) {
      case 0: { // grass / regolith / plating
        if (space) {
          const fx = wx * 2 - Math.floor(wx * 2), fy = wy * 2 - Math.floor(wy * 2);
          const seam = fx < 0.04 || fy < 0.04 ? 0.7 : 1;
          const k = (0.92 + n2 * 0.1) * seam;
          r *= k; g *= k; b *= k;
          if (hash2(Math.floor(wx * 2), Math.floor(wy * 2), 5) > 0.93) { r += 20; g += 30; b += 40; }
        } else {
          const k = 0.78 + n1 * 0.38 + n2 * 0.12;
          r *= k; g *= k * (1 + (n1 - 0.5) * 0.08); b *= k;
          if (this.themeName === 'winter') { const s = 0.94 + n2 * 0.08; r = 228 * s; g = 234 * s; b = 242 * s; }
        }
        break;
      }
      case 1: { const k = 0.75 + n1 * 0.35 + n2 * 0.18; r *= k; g *= k; b *= k; break; }
      case 2: { const rip = Math.sin(wx * 7 + wy * 4 + n1 * 6) * 0.04; const k = 0.9 + n1 * 0.15 + rip + n2 * 0.05; r *= k; g *= k; b *= k; break; }
      case T_WATER: {
        if (space) { r = 4; g = 4; b = 14; break; }
        const deep = clamp(shoreD / 5, 0, 1);
        const sh = [c[0] + 46, c[1] + 62, c[2] + 44];
        r = sh[0] + (c[0] - sh[0]) * deep; g = sh[1] + (c[1] - sh[1]) * deep; b = sh[2] + (c[2] - sh[2]) * deep;
        const abyss = 1 - 0.28 * clamp((shoreD - 4) / 8, 0, 1);
        const k = (0.92 + n1 * 0.12) * abyss; r *= k; g *= k; b *= k;
        break;
      }
      case T_MTN: {
        // gravelly talus under the rock sprites: lighter, speckled
        const gr = hash2(Math.floor(wx * 24), Math.floor(wy * 24), 13);
        const k = 0.92 + n1 * 0.22 + n2 * 0.14 + (gr > 0.8 ? 0.12 : gr < 0.2 ? -0.1 : 0);
        r *= k; g *= k; b *= k;
        if (this.themeName === 'winter' && n1 > 0.45) { r = 228 * k; g = 234 * k; b = 242 * k; }
        break;
      }
      case T_SHALLOW: { const k = 0.92 + n2 * 0.1 + Math.sin(wx * 5 + n1 * 4) * 0.03; r *= k; g *= k; b *= k; break; }
      case 6: {
        if (space) { const lane = Math.abs(((wx + wy) * 2) % 1 - 0.5) < 0.04; r *= 0.9; g *= 0.9; b *= 0.9; if (lane) { r = 90; g = 220; b = 255; } }
        else { const fx = (wx * 3) % 1, fy = (wy * 3 + (Math.floor(wx * 3) % 2) * 0.5) % 1; const seam = fx < 0.07 || fy < 0.07 ? 0.78 : 1; const k = (0.88 + n2 * 0.14) * seam; r *= k; g *= k; b *= k; }
        break;
      }
    }
    out[0] = r; out[1] = g; out[2] = b;
  }

  buildChunk(cx, cy) {
    const cw = CH * TW, chh = CH * TH;
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = chh;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(cw, chh);
    const d = img.data;
    // chunk origin: iso position of tile (cx*CH, cy*CH) top corner, shifted
    const [ox0, oy0] = iso(cx * CH, cy * CH);
    const ox = ox0 - cw / 2, oy = oy0;
    const x0 = cx * CH, y0 = cy * CH;
    const c = [0, 0, 0], acc = [0, 0, 0];
    const { w, h, tiles, shore } = this;
    const space = this.themeName === 'space';
    let mimg = null, fimg = null;
    for (let ty = Math.max(0, y0 - 1); ty < Math.min(y0 + CH + 1, h) && !mimg; ty++) for (let tx = Math.max(0, x0 - 1); tx < Math.min(x0 + CH + 1, w); tx++) { const t = tiles[ty * w + tx]; if (t === T_WATER || t === T_SHALLOW) { mimg = ctx.createImageData(cw, chh); fimg = ctx.createImageData(cw, chh); break; } }
    for (let py = 0; py < chh; py++) {
      for (let px = 0; px < cw; px++) {
        const sx = ox + px + 0.5, sy = oy + py + 0.5;
        const a = sx / (TW / 2), b = sy / (TH / 2);
        const wx = (a + b) / 2, wy = (b - a) / 2;
        if (wx < x0 - 0.04 || wx >= x0 + CH + 0.04 || wy < y0 - 0.04 || wy >= y0 + CH + 0.04 || wx < 0 || wy < 0 || wx >= w || wy >= h) continue;
        const n1 = fbm(wx * 0.9, wy * 0.9, 3, 1);
        const n2 = vnoise(wx * 7, wy * 7, 3);
        // bilinear blend between the four nearest tile centres
        const gx = wx - 0.5, gy = wy - 0.5;
        const ix = Math.floor(gx), iy = Math.floor(gy);
        // domain warp at two scales: large lobes plus a ragged fringe, so tile
        // borders read as organic patches rather than diamonds
        const n3 = vnoise(wx * 2.6 + 11.3, wy * 2.6 - 4.1, 17), n4 = vnoise(wx * 2.6 - 7.7, wy * 2.6 + 9.2, 19);
        let fx = gx - ix + (n1 - 0.5) * 0.55 + (n3 - 0.5) * 0.55, fy = gy - iy + (n2 - 0.5) * 0.2 + (n1 - 0.5) * 0.4 + (n4 - 0.5) * 0.55;
        fx = clamp((fx - 0.5) * 1.8 + 0.5, 0, 1); fy = clamp((fy - 0.5) * 1.8 + 0.5, 0, 1);
        fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
        acc[0] = acc[1] = acc[2] = 0;
        let ww = 0, ws = 0;
        for (let k = 0; k < 4; k++) {
          const tx = clamp(ix + (k & 1), 0, w - 1), ty = clamp(iy + (k >> 1), 0, h - 1);
          const wgt = (k & 1 ? fx : 1 - fx) * (k >> 1 ? fy : 1 - fy);
          if (wgt < 0.001) continue;
          const ti = ty * w + tx;
          if (tiles[ti] === T_WATER) ww += wgt; else if (tiles[ti] === T_SHALLOW) ws += wgt;
          this.terrainColor(tiles[ti], wx, wy, n1, n2, shore[ti] + ((k & 1 ? 1 - fx : fx) + (k >> 1 ? 1 - fy : fy)) * 0.5, c);
          acc[0] += c[0] * wgt; acc[1] += c[1] * wgt; acc[2] += c[2] * wgt;
        }
        // subtle global lighting gradient
        let lg = 0.96 + (n1 - 0.5) * 0.1;
        const o = (py * cw + px) * 4;
        if (!space) {
          // fine ground detail: grass blades / pebbles
          const hsh = hash2(Math.floor(wx * 44), Math.floor(wy * 44), 3);
          if (ww < 0.2 && hsh > 0.93) lg *= hsh > 0.975 ? 1.12 : 0.88;
          // wet sand on the land side of the shore, foam on the water side
          const wsum = ww + ws;
          if (wsum > 0.12 && wsum < 0.5) lg *= 1 - 0.22 * Math.sin((wsum - 0.12) / 0.38 * Math.PI);
        }
        let r = acc[0] * lg, g2 = acc[1] * lg, b2 = acc[2] * lg;
        const wsF = ww + ws * 0.85;
        if (!space && wsF > 0.46 && wsF < 0.66) { const f = (1 - Math.abs(wsF - 0.54) / 0.1) * (ww > ws ? 0.55 + n2 * 0.6 : 0.3 + n2 * 0.4); if (f > 0) { const k = Math.min(0.75, f * 0.6); r += (245 - r) * k; g2 += (250 - g2) * k; b2 += (252 - b2) * k; } }
        d[o] = r; d[o + 1] = g2; d[o + 2] = b2; d[o + 3] = 255;
        if (mimg) {
          const wa = clamp((ww + ws * 0.7 - 0.5) * 4 + 0.5, 0, 1);
          mimg.data[o] = mimg.data[o + 1] = mimg.data[o + 2] = 255; mimg.data[o + 3] = wa * 255;
          const wf = ww + ws * 0.8;
          if (wf > 0.5 && wf < 0.85 && !space) { const f = 1 - Math.abs(wf - 0.62) / 0.23; fimg.data[o] = fimg.data[o + 1] = fimg.data[o + 2] = 255; fimg.data[o + 3] = Math.max(0, f) * (0.3 + 0.7 * vnoise(wx * 9, wy * 9, 11)) * 210; }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    decorateChunk(ctx, this, x0, y0, CH, ox, oy);
    // soft water mask (for animated waves) and shore foam mask
    let water = null, foam = null;
    if (mimg) {
      const mask = document.createElement('canvas'); mask.width = cw; mask.height = chh; mask.getContext('2d').putImageData(mimg, 0, 0);
      foam = document.createElement('canvas'); foam.width = cw; foam.height = chh; foam.getContext('2d').putImageData(fimg, 0, 0);
      // two pre-masked wave layers (different phases) that are cross-faded live
      water = [0, 1].map(k => {
        const wv = document.createElement('canvas'); wv.width = cw; wv.height = chh;
        const wc = wv.getContext('2d');
        const tx = ((k * 128 - ox) % 256 + 256) % 256 - 256, ty = ((k * 64 - oy) % 128 + 128) % 128 - 128;
        wc.save(); wc.translate(tx, ty); wc.fillStyle = this.waterPattern; wc.fillRect(0, 0, cw + 256, chh + 128); wc.restore();
        wc.globalCompositeOperation = 'destination-in'; wc.drawImage(mask, 0, 0);
        return wv;
      });
    }
    return { cv, ox, oy, water, foam };
  }

  // animated wave pattern masked to the water, plus pulsing shore foam
  drawWater(ctx, c, cx, cy) {
    const t = this.time;
    const f = 0.5 + 0.5 * Math.sin(t * 0.9);
    const dx = Math.sin(t * 0.35) * 4, dy = Math.cos(t * 0.3) * 2;
    ctx.globalAlpha = 0.34 * f; ctx.drawImage(c.water[0], c.ox + dx, c.oy + dy);
    ctx.globalAlpha = 0.34 * (1 - f); ctx.drawImage(c.water[1], c.ox - dx, c.oy - dy);
    if (c.foam) { ctx.globalAlpha = 0.45 + 0.35 * Math.sin(t * 1.3 + cx * 1.7 + cy * 2.3); ctx.drawImage(c.foam, c.ox, c.oy); }
    ctx.globalAlpha = 1;
  }

  chunk(cx, cy) {
    const k = cx + ',' + cy;
    let c = this.chunks.get(k);
    if (!c) { c = this.buildChunk(cx, cy); this.chunks.set(k, c); }
    return c;
  }

  // mountain tiles, with a height class from the distance to the range's edge
  // (edge tiles: low crags and scree; interior: tall peaks)
  buildRocks() {
    this.rocks = []; this.rockRows = [];
    const { w, h, tiles } = this;
    const dep = new Uint8Array(w * h), q = [];
    for (let i = 0; i < tiles.length; i++) if (tiles[i] === T_MTN) {
      const x = i % w, y = (i / w) | 0;
      let edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (tiles[(y + dy) * w + x + dx] !== T_MTN) { edge = true; break; }
      if (edge) { dep[i] = 1; q.push(i); }
    }
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % w, y = (i / w) | 0;
      if (dep[i] >= 3) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx; if (tiles[j] === T_MTN && !dep[j]) { dep[j] = dep[i] + 1; q.push(j); }
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (tiles[i] !== T_MTN) continue;
      const r = { x: x + 0.5, y: y + 0.5, v: Math.floor(hash2(x, y, 7) * 6), hc: Math.min(2, Math.max(0, (dep[i] || 3) - 1)) };
      this.rocks.push(r);
      (this.rockRows[y] || (this.rockRows[y] = [])).push(r);
    }
  }

  // builds at most two new mountain sprites per frame (null = not ready yet)
  rockSprite(v, hc = 1) {
    if (!hasMountainSprite(this.themeName, v, hc)) { if ((this.rockBuilt || 0) >= 2) return null; this.rockBuilt = (this.rockBuilt || 0) + 1; }
    return mountainSprite(this.themeName, v, hc);
  }

  // ---------------------------------------------------------- camera
  toScreen(wx, wy, z = 0) {
    const [ix, iy] = iso(wx, wy);
    return [(ix - this.camX) * this.zoom + this.W / 2, (iy - z * ZH - this.camY) * this.zoom + this.H / 2];
  }
  toWorldIso(ix, iy) { const a = ix / (TW / 2), b = iy / (TH / 2); return [(a + b) / 2, (b - a) / 2]; }
  toWorld(sx, sy) {
    const ix = (sx - this.W / 2) / this.zoom + this.camX, iy = (sy - this.H / 2) / this.zoom + this.camY;
    const a = ix / (TW / 2), b = iy / (TH / 2);
    return [(a + b) / 2, (b - a) / 2];
  }
  centerOn(wx, wy) { [this.camX, this.camY] = iso(wx, wy); this.clampCam(); }
  pan(dx, dy) { this.camX += dx / this.zoom; this.camY += dy / this.zoom; this.clampCam(); }
  clampCam() {
    if (!this.w) return;
    this.camX = clamp(this.camX, -this.h * TW / 2, this.w * TW / 2);
    this.camY = clamp(this.camY, 0, (this.w + this.h) * TH / 2);
  }
  setZoom(z, sx, sy) {
    const [wx, wy] = this.toWorld(sx ?? this.W / 2, sy ?? this.H / 2);
    this.zoom = clamp(z, 0.45, 2);
    const [nx, ny] = this.toScreen(wx, wy);
    this.pan(nx - (sx ?? this.W / 2), ny - (sy ?? this.H / 2));
  }

  // ---------------------------------------------------------- effects
  addEvent(ev, defs) {
    const t = this.time;
    switch (ev.k) {
      case 'shot': {
        const arc = { arrow: 0.9, stone: 0.7, boulder: 1.6, cannonball: 0.9, shell: 0.5, grenade: 1.0, bolt: 0.4 }[ev.p] || 0;
        this.shots.push({ x: ev.x, y: ev.y, tx: ev.tx, ty: ev.ty, p: ev.p, t0: t, d: Math.max(0.08, ev.d), arc });
        if (['bullet', 'shell', 'cannonball', 'rail', 'laser', 'plasma', 'ion', 'rocket', 'missile'].includes(ev.p)) this.flashes.push({ x: ev.x, y: ev.y, t0: t, d: 0.08, r: ev.p === 'shell' || ev.p === 'cannonball' ? 14 : 7, c: ev.p === 'laser' || ev.p === 'ion' ? '120,240,255' : ev.p === 'plasma' ? '255,120,240' : '255,220,140' });
        if (ev.p === 'cannonball' || ev.p === 'shell') for (let i = 0; i < 6; i++) this.puff(ev.x, ev.y, 0.3, 'smoke');
        if (ev.p === 'bullet' || ev.p === 'cannonball' || ev.p === 'shell') {
          // muzzle smoke drifting from the barrel
          const dx = ev.tx - ev.x, dy = ev.ty - ev.y, l = Math.hypot(dx, dy) || 1;
          for (let i = 0; i < (ev.p === 'bullet' ? 2 : 4); i++) { const p = this.puff(ev.x + dx / l * 0.35, ev.y + dy / l * 0.35, 0.05, 'gunsmoke'); if (p) { p.z = 0.45; p.vx += dx / l * 0.5; p.vy += dy / l * 0.5; } }
        }
        break;
      }
      case 'boom': {
        this.flashes.push({ x: ev.x, y: ev.y, t0: t, d: 0.25, r: 22 + ev.d * 18, c: '255,190,90' });
        for (let i = 0; i < 18; i++) this.puff(ev.x, ev.y, ev.d * 0.6, i % 3 ? 'smoke' : 'fire');
        for (let i = 0; i < 8; i++) this.puff(ev.x, ev.y, 0.1, 'debris');
        for (let i = 0; i < 3; i++) this.puff(ev.x, ev.y, 0.15 + ev.d * 0.2, 'fireball');
        for (let i = 0; i < 12; i++) this.puff(ev.x, ev.y, 0.1, 'ember');
        this.waves.push({ x: ev.x, y: ev.y, t0: t, d: 0.5, R: 26 + (ev.d || 0) * 40 });
        this.addDecal({ k: 'scorch', x: ev.x, y: ev.y, r: 0.35 + (ev.d || 0) * 0.5, life: 10 });
        break;
      }
      case 'death': {
        for (let i = 0; i < 6; i++) this.puff(ev.x, ev.y, 0.2, 'dust');
        this.addCorpse(ev, defs);
        break;
      }
      case 'collapse': {
        for (let i = 0; i < 30 * (ev.d || 1); i++) this.puff(ev.x + (Math.random() - 0.5) * ev.d, ev.y + (Math.random() - 0.5) * ev.d, ev.d * 0.4, i % 4 ? 'dust' : 'fire');
        for (let i = 0; i < 10 * (ev.d || 1); i++) this.puff(ev.x, ev.y, ev.d * 0.3, 'debris');
        this.addDecal({ k: 'rubble', x: ev.x, y: ev.y, s: ev.d || 1, life: 16, v: Math.floor(Math.random() * 4) });
        break;
      }
      case 'melee': for (let i = 0; i < 3; i++) this.puff(ev.x, ev.y, 0.1, 'spark'); break;
      case 'work': {
        const k = { tree: 'chip', gold: 'gold', stone: 'grit', crystal: 'shard', berry: 'leaf', farm: 'leaf', carcass: 'grit' }[ev.p] || 'dust';
        for (let i = 0; i < (k === 'dust' ? 1 : 3); i++) this.puff(ev.x, ev.y, 0.15, k);
        break;
      }
      case 'hammer': if (Math.random() < 0.5) this.puff(ev.x, ev.y, 0.4, 'dust'); break;
      case 'built': for (let i = 0; i < 14; i++) this.puff(ev.x, ev.y, 1, 'dust'); break;
      case 'age': this.texts.push({ x: ev.x, y: ev.y, t0: t, d: 3, s: '★ ' + (defs ? defs.ages[ev.d].name : 'New Age') + ' ★', c: '#ffd86a' }); break;
    }
  }

  addDecal(d) {
    d.t0 = this.time;
    if (this.decals.length > 60) this.decals.shift();
    this.decals.push(d);
  }

  // a unit died: keep a short-lived falling / fading copy of it
  addCorpse(ev, defs) {
    let best = null, bd = 1.2;
    if (this.lastEnts) for (const e of this.lastEnts) {
      if (e.k !== 0 || e.t !== ev.p || e.o !== ev.o) continue;
      const d = Math.abs(e.x - ev.x) + Math.abs(e.y - ev.y);
      if (d < bd) { bd = d; best = e; }
    }
    const def = best ? best.def : defs && defs.units ? defs.units[ev.p] : null;
    if (!def || def.class === 'animal') return;
    if (this.corpses.length > 80) this.corpses.shift();
    const foot = isFootUnit(def) || def.class === 'mounted';
    this.corpses.push({ x: ev.x, y: ev.y, def, team: ev.o, f: best ? best.f || 0 : Math.random() * 6.28, id: best ? best.i : 0, t0: this.time, foot, side: Math.random() < 0.5 ? -1 : 1 });
    if (!foot) for (let i = 0; i < 10; i++) this.puff(ev.x, ev.y, 0.25, i % 2 ? 'smoke' : 'fire');
  }

  puff(x, y, r, kind) {
    const a = Math.random() * 6.28, d = Math.random() * r;
    const p = { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, z: 0.1, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, vz: 0.5 + Math.random(), life: 1, kind, t0: this.time, v: (Math.random() * 4) | 0 };
    switch (kind) {
      case 'smoke': p.vz = 0.6 + Math.random() * 0.5; p.life = 1.6 + Math.random(); p.size = 5 + Math.random() * 6; break;
      case 'gunsmoke': p.vz = 0.25 + Math.random() * 0.2; p.vx *= 0.4; p.vy *= 0.4; p.life = 1.1 + Math.random() * 0.6; p.size = 2.5 + Math.random() * 2; break;
      case 'chimney': p.vz = 0.5; p.vx = 0.15; p.vy = -0.05; p.life = 3; p.size = 4; break;
      case 'fire': p.vz = 1.2; p.life = 0.5 + Math.random() * 0.4; p.size = 4 + Math.random() * 5; break;
      case 'dust': p.vz = 0.3 + Math.random() * 0.4; p.life = 0.9 + Math.random() * 0.6; p.size = 4 + Math.random() * 5; break;
      case 'kick': p.z = 0.02; p.vz = 0.15 + Math.random() * 0.15; p.vx *= 0.3; p.vy *= 0.3; p.life = 0.6 + Math.random() * 0.3; p.size = 2 + Math.random() * 2; break;
      case 'spark': p.vz = 1.5; p.vx *= 3; p.vy *= 3; p.life = 0.25; p.size = 1.5; break;
      case 'chip': case 'gold': case 'grit': case 'shard': case 'leaf': p.vz = 1.4; p.vx *= 2.5; p.vy *= 2.5; p.life = kind === 'leaf' ? 0.8 : 0.45; p.size = 1.6; p.rot = Math.random() * 6.28; break;
      case 'debris': p.vz = 2 + Math.random() * 1.5; p.vx *= 4; p.vy *= 4; p.life = 0.9; p.size = 1.5 + Math.random() * 1.5; p.rot = Math.random() * 6.28; break;
      case 'campfire': p.vz = 0.9 + Math.random() * 0.4; p.vx *= 0.15; p.vy *= 0.15; p.life = 0.55; p.size = 3 + Math.random() * 3; break;
      case 'fireball': p.z = 0.15; p.vz = 0.5 + Math.random() * 0.4; p.vx *= 0.8; p.vy *= 0.8; p.life = 0.42 + Math.random() * 0.25; p.size = 12 + Math.random() * 9; break;
      case 'ember': p.vz = 2.2 + Math.random() * 2; p.vx *= 5; p.vy *= 5; p.life = 0.5 + Math.random() * 0.5; p.size = 1; break;
    }
    if (this.particles.length >= 1500) return null;
    this.particles.push(p);
    return p;
  }

  stepEffects(dt) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = p.kind;
      if (k === 'spark' || k === 'chip' || k === 'gold' || k === 'grit' || k === 'shard' || k === 'debris' || k === 'ember') p.vz -= 6 * dt;
      else if (k === 'leaf') { p.vz -= 3 * dt; if (p.vz < -0.4) p.vz = -0.4; p.vx = Math.sin((this.time - p.t0) * 9 + p.rot) * 0.5; }
      if (this.time - p.t0 > p.life || p.z < -0.05) ps.splice(i, 1);
    }
    const t = this.time;
    for (const s of this.shots) {
      if (t - s.t0 < s.d) continue;
      // impact effects when heavy projectiles land
      if (s.p === 'cannonball' || s.p === 'shell' || s.p === 'boulder' || s.p === 'stone') {
        for (let i = 0; i < (s.p === 'stone' ? 2 : 6); i++) this.puff(s.tx, s.ty, 0.15, 'dust');
        if (s.p !== 'stone') this.waves.push({ x: s.tx, y: s.ty, t0: t, d: 0.35, R: s.p === 'shell' ? 26 : 18 });
        if (s.p === 'shell') { this.puff(s.tx, s.ty, 0.05, 'fireball'); for (let i = 0; i < 5; i++) this.puff(s.tx, s.ty, 0.05, 'ember'); }
        if (s.p !== 'stone') { for (let i = 0; i < 4; i++) this.puff(s.tx, s.ty, 0.1, 'debris'); this.addDecal({ k: 'scorch', x: s.tx, y: s.ty, r: s.p === 'shell' ? 0.35 : 0.25, life: 8, crater: true }); }
      }
    }
    this.shots = this.shots.filter(s => t - s.t0 < s.d);
    this.flashes = this.flashes.filter(f => t - f.t0 < f.d);
    this.texts = this.texts.filter(f => t - f.t0 < f.d);
    this.corpses = this.corpses.filter(c => t - c.t0 < 3);
    this.decals = this.decals.filter(d => t - d.t0 < d.life);
    if (this.waves.length) this.waves = this.waves.filter(w => t - w.t0 < w.d);
  }

  // ---------------------------------------------------------- drawing
  draw(F, dt) {
    this.time += dt; this.lastDt = dt; this.rockBuilt = F.fastBuild ? -999 : 0;
    this.stepEffects(dt);
    const ctx = this.ctx, z = this.zoom;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    // background
    const space = this.themeName === 'space' || this.themeName === 'moon';
    ctx.fillStyle = space ? '#020208' : '#0b0d10';
    ctx.fillRect(0, 0, this.W, this.H);
    if (space) this.drawStars(ctx);
    if (!this.w) return;
    // visible tile range
    const corners = [this.toWorld(0, 0), this.toWorld(this.W, 0), this.toWorld(0, this.H), this.toWorld(this.W, this.H)];
    const minX = Math.floor(Math.min(...corners.map(c => c[0]))) - 2, maxX = Math.ceil(Math.max(...corners.map(c => c[0]))) + 2;
    const minY = Math.floor(Math.min(...corners.map(c => c[1]))) - 2, maxY = Math.ceil(Math.max(...corners.map(c => c[1]))) + 2;
    this.view = { minX, maxX, minY, maxY };
    // terrain chunks
    ctx.save();
    ctx.translate(this.W / 2, this.H / 2); ctx.scale(z, z); ctx.translate(-this.camX, -this.camY);
    let built = 0;
    const cx0 = Math.max(0, Math.floor(minX / CH)), cx1 = Math.min(Math.ceil(this.w / CH) - 1, Math.floor(maxX / CH));
    const cy0 = Math.max(0, Math.floor(minY / CH)), cy1 = Math.min(Math.ceil(this.h / CH) - 1, Math.floor(maxY / CH));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const k = cx + ',' + cy;
      let c = this.chunks.get(k);
      if (!c) { if (built >= (F.fastBuild ? 999 : 3)) continue; c = this.chunk(cx, cy); built++; }
      else { this.chunks.delete(k); this.chunks.set(k, c); } // LRU: refresh recency
      ctx.drawImage(c.cv, c.ox, c.oy);
      if (c.water && this.themeName !== 'space') this.drawWater(ctx, c, cx, cy);
    }
    this.pendingChunks = built;
    // LRU eviction: keep at most ~400 chunks (more if the viewport itself needs more)
    const cap = Math.max(400, (cx1 - cx0 + 1) * (cy1 - cy0 + 1) * 2);
    if (this.chunks.size > cap) { const it = this.chunks.keys(); for (let n = this.chunks.size - cap; n > 0; n--) this.chunks.delete(it.next().value); }
    // grid in editor
    if (F.grid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1 / z;
      ctx.beginPath();
      for (let x = Math.max(0, minX); x <= Math.min(this.w, maxX); x++) { const a = iso(x, 0), b = iso(x, this.h); ctx.moveTo(...a); ctx.lineTo(...b); }
      for (let y = Math.max(0, minY); y <= Math.min(this.h, maxY); y++) { const a = iso(0, y), b = iso(this.w, y); ctx.moveTo(...a); ctx.lineTo(...b); }
      ctx.stroke();
    }
    // map edge
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3 / z;
    ctx.beginPath(); ctx.moveTo(...iso(0, 0)); ctx.lineTo(...iso(this.w, 0)); ctx.lineTo(...iso(this.w, this.h)); ctx.lineTo(...iso(0, this.h)); ctx.closePath(); ctx.stroke();

    // scorch marks, craters and rubble
    if (this.decals.length) this.drawDecals(ctx);
    for (const w of this.waves) { const [wx, wy] = iso(w.x, w.y); shockwave(ctx, wx, wy, (this.time - w.t0) / w.d, w.R, this.themeName !== 'space'); }
    // ground decals: farms, selection rings, rally points, ghosts
    this.lastEnts = F.ents;
    const drawables = [];
    for (const c of this.corpses) if (c.x > minX && c.x < maxX && c.y > minY && c.y < maxY) drawables.push({ d: c.x + c.y - 0.4, corpse: c });
    if (!this.rocks) this.buildRocks();
    // rocks are bucketed by row so big maps only scan the visible rows
    for (let ry = Math.max(0, minY); ry <= Math.min(this.h - 1, maxY); ry++) { const row = this.rockRows[ry]; if (row) for (const r of row) if (r.x > minX && r.x < maxX) drawables.push({ d: r.x + r.y, rock: r }); }
    for (const e of F.ents) {
      if (e.x < minX - 3 || e.x > maxX + 3 || e.y < minY - 3 || e.y > maxY + 3) continue;
      let d = e.x + e.y;
      if (e.k === 1) {
        const s = e.def ? e.def.size : 1;
        d = (e.x - s / 2) + (e.y - s / 2) + s * 2 - 1.2;
        if (e.t === 'farm') d = -1e6 + d;
      }
      if (e.k === 2 && e.t === 'carcass') d -= 0.3;
      if (e.k === 0 && e.def && e.def.flying) d += 1000;
      drawables.push({ d, e });
    }
    drawables.sort((a, b) => a.d - b.d);
    // gather targets in view (resources, farms, wild animals), bucketed by
    // tile: fallback for a gathering worker's tool when the snapshot has no
    // work resource (e.wr) for it (e.g. units of other players)
    this.gatherGrid = null;
    for (const it of drawables) { const e = it.e; if (e && e.k === 0 && e.s === 4 && !e.wr && e.def && e.def.class === 'worker') { this.gatherGrid = new Map(); break; } }
    if (this.gatherGrid) for (const it of drawables) {
      const e = it.e;
      if (!e) continue;
      const tgt = e.k === 2 || (e.k === 1 && e.t === 'farm') || (e.k === 0 && e.o < 0 && e.def && e.def.class === 'animal');
      if (!tgt) continue;
      const key = (Math.floor(e.x) & 0xffff) | (Math.floor(e.y) << 16);
      const b = this.gatherGrid.get(key); if (b) b.push(e); else this.gatherGrid.set(key, [e]);
    }
    // selection rings (under everything)
    if (F.sel && F.sel.size) for (const it of drawables) {
      const e = it.e;
      if (!e || !F.sel.has(e.i)) continue;
      this.drawSelection(ctx, e, F, z);
    }
    if (F.rally) this.drawRally(ctx, F, drawables);
    if (F.marker && this.time - F.marker.t < 0.7) this.drawMarker(ctx, F.marker);

    // entities; level of detail drops when zoomed out or crowded
    const t = this.time;
    let nUnits = 0;
    for (const it of drawables) if (it.e && it.e.k === 0) nUnits++;
    const lod = z < 0.85 || nUnits > 140;
    for (const it of drawables) {
      if (it.rock) {
        const [sx, sy] = iso(it.rock.x, it.rock.y);
        const m = this.rockSprite(it.rock.v, it.rock.hc);
        if (m) ctx.drawImage(m.canvas, sx - m.ox, sy - m.oy, m.w, m.h);
        continue;
      }
      if (it.corpse) { this.drawCorpse(ctx, it.corpse, t); continue; }
      const e = it.e;
      const [sx, sy] = iso(e.x, e.y);
      if (e.k === 2) {
        const rd = this.defs && this.defs.resources ? this.defs.resources[e.t] : null;
        const lvl = e.a != null && rd && rd.amount ? Math.max(1, Math.min(4, Math.ceil(e.a / rd.amount * 4))) : 4;
        const vr = e.t === 'tree' && e.i != null ? ((e.i * 2654435761) >>> 0) % TREE_VARIANTS : e.v || 0;
        const s = resourceSprite(e.t, this.themeName, vr, e.t === 'tree' ? 4 : lvl);
        const k = e.t === 'tree' ? 1 : 0.9;
        if (e.t === 'fish') {
          // gentle drift and an expanding ripple
          const ph = t * 0.8 + (e.i || 0) * 0.37;
          ctx.drawImage(s.canvas, sx - s.ox * k + Math.sin(ph) * 1.5, sy - s.oy * k + Math.cos(ph * 0.7) * 0.8, s.w * k, s.h * k);
          const f = (t * 0.45 + (e.i || 0) * 0.29) % 1;
          ctx.strokeStyle = `rgba(235,250,255,${0.5 * (1 - f)})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(sx + Math.sin(e.i || 0) * 8, sy - 2, 3 + f * 14, (3 + f * 14) * 0.45, 0, 0, 7); ctx.stroke();
        } else if (e.t === 'tree' && z > 0.6) {
          // gentle wind sway: skew around the trunk base
          const sw = Math.sin(t * 1.1 + e.x * 0.7 + e.y * 0.4) * 0.035 + Math.sin(t * 2.7 + e.x * 1.9) * 0.012;
          ctx.save(); ctx.transform(1, 0, sw, 1, -sw * sy, 0);
          ctx.drawImage(s.canvas, sx - s.ox * k, sy - s.oy * k, s.w * k, s.h * k);
          ctx.restore();
        } else ctx.drawImage(s.canvas, sx - s.ox * k, sy - s.oy * k, s.w * k, s.h * k);
      } else if (e.k === 1) {
        const s = e.def.size;
        const stage = e.prog > 0 && e.prog < 1 ? Math.min(2, Math.floor(e.prog * 3)) : 3;
        const [ax, ay] = iso(e.x - s / 2, e.y - s / 2);
        const era = this.defs ? this.defs.ages[e.g || 0].era : 'stone';
        const dmg = stage === 3 && e.t !== 'farm' ? (e.hp < 0.33 ? 2 : e.hp < 0.66 ? 1 : 0) : 0;
        const sp0 = buildingSprite(e.t, era, e.o, s, stage, true);
        const sp = dmg ? damageSprite(sp0, dmg, `${e.t}|${era}|${e.o}|${s}`) : sp0;
        ctx.drawImage(sp.canvas, ax - sp.ox, ay - sp.oy, sp.w, sp.h);
        if (stage < 3 && e.prog > 0 && Math.random() < dt * 2.5) this.puff(e.x + (Math.random() - 0.5) * s * 0.8, e.y + (Math.random() - 0.5) * s * 0.8, 0.1, 'dust');
        if (stage === 3) {
          if (buildingAnimated(e.t, era) || sp0.flags && sp0.flags.length) { ctx.save(); ctx.translate(ax, ay); if (buildingAnimated(e.t, era)) drawBuildingAnim(ctx, e.t, era, e.o, s, t); drawBuildingFlags(ctx, sp0, t + (e.i || 0) * 0.37); ctx.restore(); }
          for (const p of smokePoints(e.t, era, s)) {
            if (Math.random() < dt * 4) { const pp = this.puff(e.x - s / 2 + p[0], e.y - s / 2 + p[1], 0, 'chimney'); if (pp) pp.z = p[2]; }
          }
          if (e.t === 'town_center' && era === 'stone' && Math.random() < 0.7) this.puff(e.x - s / 2 + 2.15, e.y - s / 2 + 2.15, 0.08, 'campfire');
        }
        if (e.hp < 0.5 && stage === 3 && e.t !== 'farm' && Math.random() < dt * 6) this.puff(e.x + (Math.random() - 0.5) * s * 0.6, e.y + (Math.random() - 0.5) * s * 0.6, 0.1, Math.random() < 0.5 ? 'fire' : 'smoke');
        if (dmg === 2 && sp.fire) this.drawFlames(ctx, sp.fire, ax - sp.ox, ay - sp.oy, e.i, t);
      } else {
        const def = e.def;
        if (!def) continue;
        const walking = e.moving;
        const walk = walking ? (t * (def.speed || 1) * 1.6 + e.i * 0.37) % 1 : 0;
        const act = e.b ? (t * 1.6 + e.i * 0.21) % 1 : 0;
        // the load on the back follows the CARRIED resource (e.c amount, e.r
        // type); the tool follows the gather target (e.wr = its resource + 1)
        const carry = e.c > 0 ? (e.r || 0) : -1;
        const res = def.class !== 'worker' ? undefined : e.wr ? e.wr - 1 : this.workRes(e, carry);
        drawUnit(ctx, sx, sy, { def, team: e.o, era: def.era, face: e.f, walk, act, busy: e.b, carry, id: e.i, t, moving: !!walking, res, state: e.s, lod });
        if (walking && !def.flying && !def.naval && def.class !== 'naval' && (def.class === 'mounted' || def.class === 'siege' || def.pop > 1 || def.class === 'animal') && Math.random() < dt * 7 && this.themeName !== 'space') this.puff(e.x - Math.cos(e.f || 0) * 0.25, e.y - Math.sin(e.f || 0) * 0.25, 0.12, 'kick');
      }
    }
    // particles: soft pre-rendered puffs and additive glows
    const SMOKE = [86, 84, 82], CHIM = [150, 148, 146], DUST = [164, 140, 104], GUN = [232, 230, 222], WSNOW = [236, 242, 252];
    const FIRE = glowSprite([255, 112, 28]), EMB = glowSprite([255, 150, 50], 0.9);
    for (const p of this.particles) {
      const [sx, sy] = iso(p.x, p.y);
      const age = (t - p.t0) / p.life, py = sy - p.z * ZH;
      const fin = age < 0.12 ? age / 0.12 : 1;
      switch (p.kind) {
        case 'smoke': stamp(ctx, puffSprite(SMOKE, p.v), sx, py, p.size * (1.25 + age * 1.9), 0.62 * (1 - age) * fin); break;
        case 'chimney': stamp(ctx, puffSprite(CHIM, p.v), sx, py, p.size * (1.2 + age * 1.9), 0.5 * (1 - age) * fin); break;
        case 'dust': stamp(ctx, puffSprite(this.themeName === 'winter' ? WSNOW : DUST, p.v), sx, py, p.size * (1.3 + age * 1.3), 0.62 * (1 - age) * fin); break;
        case 'gunsmoke': stamp(ctx, puffSprite(GUN, p.v), sx, py, p.size * (1.3 + age * 2.6), 0.7 * (1 - age) * fin); break;
        case 'fire': case 'campfire': {
          const r0 = p.size * (1 - age * 0.5);
          ctx.globalCompositeOperation = 'lighter';
          stamp(ctx, FIRE, sx, py, r0 * 1.9, 0.75 * (1 - age));
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'fireball': {
          // white-hot ball that swells, then cools into dark smoke
          if (age < 0.6) { ctx.globalCompositeOperation = 'lighter'; stamp(ctx, FIRE, sx, py, p.size * (0.8 + age * 1.4), 1 - age / 0.6); ctx.globalCompositeOperation = 'source-over'; }
          if (age > 0.3) stamp(ctx, puffSprite([52, 46, 42], p.v), sx, py - age * 4, p.size * (0.7 + age), 0.7 * (age - 0.3) / 0.7);
          break;
        }
        case 'ember': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 1 - age;
          const vx = (p.vx - p.vy) * TW / 2 * 0.03, vy = (p.vx + p.vy) * TH / 2 * 0.03 - p.vz * ZH * 0.03;
          ctx.strokeStyle = age < 0.4 ? '#fff0b0' : '#ff9a3a'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(sx - vx, py - vy); ctx.lineTo(sx, py); ctx.stroke();
          ctx.globalAlpha = 1;
          stamp(ctx, EMB, sx, py, 2.6, 0.8 * (1 - age));
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'spark': ctx.fillStyle = `rgba(255,240,180,${1 - age})`; ctx.fillRect(sx, py, 2, 2); break;
        case 'kick': ctx.fillStyle = this.themeName === 'winter' ? `rgba(240,245,255,${0.5 * (1 - age)})` : `rgba(160,136,100,${0.35 * (1 - age)})`; ctx.beginPath(); ctx.ellipse(sx, py, p.size * (1 + age * 1.5), p.size * (0.6 + age), 0, 0, 7); ctx.fill(); break;
        case 'chip': ctx.fillStyle = '#c8a070'; ctx.fillRect(sx, py, 2, 1.5); ctx.fillStyle = '#7a5030'; ctx.fillRect(sx + 0.5, py + 1, 1.5, 0.6); break;
        case 'gold': ctx.fillStyle = age < 0.5 && ((p.t0 * 10) | 0) % 2 ? '#fff6c0' : '#ffd84a'; ctx.fillRect(sx, py, 2, 2); break;
        case 'grit': ctx.fillStyle = '#a8a49c'; ctx.fillRect(sx, py, 1.8, 1.4); break;
        case 'shard': ctx.fillStyle = `rgba(140,240,255,${1 - age * 0.5})`; ctx.fillRect(sx, py, 1.6, 2.2); break;
        case 'leaf': { ctx.fillStyle = ((p.rot * 10) | 0) % 3 ? '#4a8a30' : '#c4223a'; ctx.save(); ctx.translate(sx, py); ctx.rotate(p.rot + age * 6); ctx.fillRect(-1.2, -0.6, 2.4, 1.2); ctx.restore(); break; }
        case 'debris': { ctx.fillStyle = ((p.rot * 10) | 0) % 2 ? '#5a4a3a' : '#8a8478'; ctx.save(); ctx.translate(sx, py); ctx.rotate(p.rot + age * 12); ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66); ctx.restore(); break; }
      }
    }
    ctx.globalAlpha = 1;
    // projectiles
    for (const s of this.shots) {
      const k = clamp((t - s.t0) / s.d, 0, 1);
      const x = s.x + (s.tx - s.x) * k, y = s.y + (s.ty - s.y) * k;
      const dist = Math.hypot(s.tx - s.x, s.ty - s.y);
      const zz = 0.5 + Math.sin(k * Math.PI) * s.arc * dist * 0.12;
      const [px, py] = iso(x, y); const pyz = py - zz * ZH;
      const k2 = clamp(k - 0.06, 0, 1);
      const [qx, qy] = iso(s.x + (s.tx - s.x) * k2, s.y + (s.ty - s.y) * k2);
      const qyz = qy - (0.5 + Math.sin(k2 * Math.PI) * s.arc * dist * 0.12) * ZH;
      switch (s.p) {
        case 'arrow': case 'bolt': {
          // ground shadow, then shaft with head and fletching along the flight direction
          const [gx, gy] = iso(s.x + (s.tx - s.x) * k2, s.y + (s.ty - s.y) * k2);
          ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(px, py); ctx.stroke();
          const dx = px - qx, dy = pyz - qyz, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
          const L = s.p === 'bolt' ? 6 : 9, tx0 = px - ux * L, ty0 = pyz - uy * L;
          ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(tx0, ty0); ctx.lineTo(px, pyz); ctx.stroke();
          ctx.fillStyle = '#c8ccd0'; ctx.beginPath(); ctx.moveTo(px + ux * 2.2, pyz + uy * 2.2); ctx.lineTo(px - uy * 1.1, pyz + ux * 1.1); ctx.lineTo(px + uy * 1.1, pyz - ux * 1.1); ctx.closePath(); ctx.fill();
          ctx.fillStyle = s.p === 'bolt' ? '#6a5a4a' : '#e8e0d0'; ctx.beginPath(); ctx.moveTo(tx0 + ux * 2.5, ty0 + uy * 2.5); ctx.lineTo(tx0 - uy * 1.6 - ux * 0.5, ty0 + ux * 1.6 - uy * 0.5); ctx.lineTo(tx0, ty0); ctx.lineTo(tx0 + uy * 1.6 - ux * 0.5, ty0 - ux * 1.6 - uy * 0.5); ctx.closePath(); ctx.fill();
          break;
        }
        case 'stone': case 'boulder': case 'cannonball': case 'grenade':
          { const [gx, gy] = iso(x, y); const r0 = s.p === 'boulder' ? 4 : 2.5; ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(gx, gy, r0 * 1.2, r0 * 0.6, 0, 0, 7); ctx.fill(); }
          ctx.fillStyle = s.p === 'cannonball' ? '#222' : '#777'; ctx.beginPath(); ctx.arc(px, pyz, s.p === 'boulder' ? 4 : 2.5, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(px - 0.8, pyz - 0.8, s.p === 'boulder' ? 1.4 : 0.9, 0, 7); ctx.fill();
          if (s.p !== 'stone' && Math.random() < 0.5) { const p = this.puff(x, y, 0, s.p === 'boulder' ? 'dust' : 'gunsmoke'); if (p) { p.z = zz; p.vz = 0.1; p.size *= 0.7; } } break;
        case 'bullet': case 'shell': {
          // tracer: fading streak with a hot head
          const g = ctx.createLinearGradient(qx, qyz, px, pyz);
          g.addColorStop(0, 'rgba(255,200,120,0)'); g.addColorStop(1, 'rgba(255,236,170,0.95)');
          ctx.strokeStyle = g; ctx.lineWidth = s.p === 'shell' ? 2.4 : 1.2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(qx - (px - qx), qyz - (pyz - qyz)); ctx.lineTo(px, pyz); ctx.stroke(); ctx.lineCap = 'butt';
          ctx.globalCompositeOperation = 'lighter'; stamp(ctx, glowSprite([255, 190, 90]), px, pyz, s.p === 'shell' ? 6 : 3.5, 0.8); ctx.globalCompositeOperation = 'source-over';
          if (s.p === 'shell' && Math.random() < 0.4) this.puff(x, y, 0, 'gunsmoke');
          break;
        }
        case 'rocket': case 'missile': {
          const dx = px - qx, dy = pyz - qyz, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
          ctx.globalCompositeOperation = 'lighter'; stamp(ctx, glowSprite([255, 130, 40]), px - ux * 4, pyz - uy * 4, 6 + Math.random() * 2, 0.9); ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = '#d8d8d4'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px - ux * 4, pyz - uy * 4); ctx.lineTo(px + ux * 2, pyz + uy * 2); ctx.stroke(); ctx.lineCap = 'butt';
          ctx.fillStyle = '#b83a2a'; ctx.beginPath(); ctx.arc(px + ux * 2, pyz + uy * 2, 1.1, 0, 7); ctx.fill();
          const p = this.puff(x, y, 0, Math.random() < 0.3 ? 'fire' : 'gunsmoke'); if (p) { p.z = zz; p.vz = 0.1; }
          break;
        }
        case 'laser': case 'rail': case 'ion': {
          const [ax, ay] = iso(s.x, s.y), [bx, by] = iso(s.tx, s.ty);
          const col = s.p === 'ion' ? '170,140,255' : s.p === 'rail' ? '200,240,255' : '90,240,255';
          ctx.strokeStyle = `rgba(${col},${0.25 * (1 - k)})`; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(ax, ay - 14); ctx.lineTo(bx, by - 10); ctx.stroke();
          ctx.strokeStyle = `rgba(${col},${1 - k})`; ctx.lineWidth = 3; ctx.stroke();
          ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 1; ctx.stroke(); break;
        }
        case 'plasma': { const g = ctx.createRadialGradient(px, pyz, 0, px, pyz, 7); g.addColorStop(0, '#fff'); g.addColorStop(0.4, 'rgba(255,110,240,0.9)'); g.addColorStop(1, 'rgba(255,110,240,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, pyz, 7, 0, 7); ctx.fill(); break; }
      }
    }
    for (const f of this.flashes) {
      const k = (t - f.t0) / f.d;
      const [px, py] = iso(f.x, f.y);
      const g = ctx.createRadialGradient(px, py - 10, 0, px, py - 10, f.r);
      g.addColorStop(0, `rgba(255,255,230,${0.9 * (1 - k)})`); g.addColorStop(0.4, `rgba(${f.c},${0.6 * (1 - k)})`); g.addColorStop(1, `rgba(${f.c},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py - 10, f.r, 0, 7); ctx.fill();
    }
    this.drawBirds(ctx, F);
    // placement ghost
    if (F.ghost) {
      const g = F.ghost;
      ctx.globalAlpha = 0.6;
      const sp = buildingSprite(g.type, g.era, F.you, g.size, 3);
      const [ax, ay] = iso(g.x, g.y);
      ctx.drawImage(sp.canvas, ax - sp.ox, ay - sp.oy, sp.w, sp.h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = g.ok ? 'rgba(80,255,80,0.25)' : 'rgba(255,60,60,0.35)';
      ctx.beginPath(); ctx.moveTo(...iso(g.x, g.y)); ctx.lineTo(...iso(g.x + g.size, g.y)); ctx.lineTo(...iso(g.x + g.size, g.y + g.size)); ctx.lineTo(...iso(g.x, g.y + g.size)); ctx.closePath(); ctx.fill();
    }
    if (F.brush) {
      ctx.strokeStyle = 'rgba(255,240,180,0.9)'; ctx.lineWidth = 1.5 / z;
      const b = F.brush, r = b.r;
      ctx.beginPath(); ctx.moveTo(...iso(b.x - r, b.y - r)); ctx.lineTo(...iso(b.x + r + 1, b.y - r)); ctx.lineTo(...iso(b.x + r + 1, b.y + r + 1)); ctx.lineTo(...iso(b.x - r, b.y + r + 1)); ctx.closePath(); ctx.stroke();
    }
    if (F.starts) {
      F.starts.forEach((s, i) => {
        const [sx, sy] = iso(s.x + 0.5, s.y + 0.5);
        ctx.fillStyle = TEAM[i]; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(sx, sy, 22, 11, 0, 0, 7); ctx.globalAlpha = 0.45; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
        ctx.font = 'bold 16px Georgia'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(String(i + 1), sx, sy + 5);
      });
    }

    // drifting cloud shadows (cheap: a few soft ellipses)
    if (!space && this.themeName !== 'space') {
      for (let i = 0; i < 4; i++) {
        const span = this.w + this.h + 20;
        const cxw = ((hash2(i, 1, 21) * span + this.time * (0.25 + hash2(i, 2, 21) * 0.2)) % span) - 10, cyw = hash2(i, 3, 21) * this.h;
        const [px, py] = iso(cxw, cyw);
        const R = 140 + hash2(i, 4, 21) * 160;
        const g = ctx.createRadialGradient(px, py, 0, px, py, R);
        g.addColorStop(0, 'rgba(10,20,40,0.12)'); g.addColorStop(1, 'rgba(10,20,40,0)');
        ctx.fillStyle = g; ctx.save(); ctx.translate(px, py); ctx.scale(1, 0.5); ctx.translate(-px, -py); ctx.beginPath(); ctx.arc(px, py, R, 0, 7); ctx.fill(); ctx.restore();
      }
    }
    // fog of war: tile mask upscaled with a blur for soft, organic edges
    if (F.fog) {
      const FS = 4;
      if (!this.fogCv || this.fogCv.width !== this.w || this.fogCv.height !== this.h) {
        this.fogCv = document.createElement('canvas'); this.fogCv.width = this.w; this.fogCv.height = this.h; this.fogImg = this.fogCv.getContext('2d').createImageData(this.w, this.h);
        this.fogBig = document.createElement('canvas'); this.fogBig.width = this.w * FS + 8; this.fogBig.height = this.h * FS + 8;
        F.fogDirty = true;
      }
      if (F.fogDirty) {
        const d = this.fogImg.data, fc = this.th.fog;
        for (let i = 0; i < F.fog.length; i++) {
          const s = F.fog[i];
          d[i * 4] = fc[0]; d[i * 4 + 1] = fc[1]; d[i * 4 + 2] = fc[2];
          d[i * 4 + 3] = s === 0 ? 255 : s === 1 ? 125 : 0;
        }
        this.fogCv.getContext('2d').putImageData(this.fogImg, 0, 0);
        const bc = this.fogBig.getContext('2d');
        bc.clearRect(0, 0, this.fogBig.width, this.fogBig.height);
        bc.imageSmoothingEnabled = true;
        if ('filter' in bc) bc.filter = 'blur(3px)';
        bc.drawImage(this.fogCv, 4, 4, this.w * FS, this.h * FS);
        bc.filter = 'none';
        F.fogDirty = false;
      }
      ctx.save();
      ctx.transform(TW / 2, TH / 2, -TW / 2, TH / 2, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.fogBig, -4 / FS, -4 / FS, this.fogBig.width / FS, this.fogBig.height / FS);
      ctx.restore();
    }
    // health bars & labels on top of fog
    this.hpSeen = (this.hpSeen || 0) + 1;
    for (const it of drawables) {
      const e = it.e;
      if (!e || e.k === 2) continue;
      const fx = this.hpTrack(e);
      const selected = F.sel && F.sel.has(e.i);
      const flashing = fx && t - fx.ft < 0.6;
      if (!selected && !flashing && !(e.hp < 0.999 && e.k === 0) && !(e.k === 1 && e.hp < 0.999 && e.prog === 0)) continue;
      if (e.k === 1 && !selected && !flashing && e.hp > 0.7) continue;
      this.drawHealthBar(ctx, e, fx, t);
    }
    if (this.hpSeen % 300 === 0 && this.hpFx) for (const [k, v] of this.hpFx) if (this.hpSeen - v.seen > 120) this.hpFx.delete(k);
    for (const f of this.texts) {
      const k = (t - f.t0) / f.d;
      const [px, py] = iso(f.x, f.y);
      ctx.font = 'bold 18px Georgia'; ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(0,0,0,${1 - k})`; ctx.fillText(f.s, px + 1, py - 70 - k * 30 + 1);
      ctx.fillStyle = f.c; ctx.globalAlpha = 1 - k; ctx.fillText(f.s, px, py - 70 - k * 30); ctx.globalAlpha = 1;
    }
    ctx.restore();
    // vignette and colour grading
    const vg = ctx.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.35, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, this.W, this.H);
    if (F.box) {
      const b = F.box;
      ctx.strokeStyle = '#e8f0ff'; ctx.lineWidth = 1; ctx.fillStyle = 'rgba(160,200,255,0.12)';
      ctx.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
      ctx.strokeRect(Math.min(b.x0, b.x1) + 0.5, Math.min(b.y0, b.y1) + 0.5, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    }
  }

  // per-entity health history: damage flash and a trailing "lost" segment
  hpTrack(e) {
    if (e.i == null) return null;
    const m = this.hpFx || (this.hpFx = new Map());
    let v = m.get(e.i);
    const hp = clamp(e.hp, 0, 1), t = this.time;
    if (!v) { v = { hp, lag: hp, ft: -9, seen: this.hpSeen }; m.set(e.i, v); return v; }
    v.seen = this.hpSeen;
    if (hp < v.hp - 0.004) { v.ft = t; if (v.lag < v.hp) v.lag = v.hp; }
    v.hp = hp;
    // the lost chunk lingers briefly, then drains towards the current value
    if (v.lag > hp) { if (t - v.ft > 0.35) v.lag = Math.max(hp, v.lag - 0.9 * (this.lastDt || 0.016)); } else v.lag = hp;
    return v;
  }

  // segmented health bar with a dark frame, team tab, damage flash and
  // build-progress strip; drawn in world space above the entity
  drawHealthBar(ctx, e, fx, t) {
    let [sx, sy] = iso(e.x, e.y);
    let w = 24, off = 30;
    if (e.k === 1) { w = 40 + e.def.size * 6; off = 30 + e.def.size * 22; }
    else if (e.def && e.def.flying) off = 60;
    else if (e.def && (e.def.class === 'mounted' || e.def.class === 'siege')) { off = 38; w = 28; }
    else if (e.def && (e.def.naval || e.def.class === 'naval')) { off = e.def.pop > 1 ? 62 : 36; w = 30; }
    const bh = e.k === 1 ? 5 : 4, x0 = Math.round(sx - w / 2), y0 = Math.round(sy - off);
    const hp = clamp(e.hp, 0, 1);
    // frame: soft drop shadow, dark rounded border, recessed trough
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; rrect(ctx, x0 - 1.5, y0 - 0.5, w + 4, bh + 4, 2); ctx.fill();
    ctx.fillStyle = 'rgba(14,11,8,0.92)'; rrect(ctx, x0 - 2, y0 - 2, w + 4, bh + 4, 2); ctx.fill();
    ctx.fillStyle = 'rgba(52,22,18,0.95)'; ctx.fillRect(x0, y0, w, bh);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x0, y0, w, 1);
    // trailing damage segment
    if (fx && fx.lag > hp + 0.002) { ctx.fillStyle = t - fx.ft < 0.35 ? '#fff4d8' : '#f0a050'; ctx.fillRect(x0 + w * hp, y0, w * (fx.lag - hp), bh); }
    const hc = hp > 0.5 ? ['#a2f58a', '#54c84a', '#2a8a30'] : hp > 0.25 ? ['#ffe890', '#f0c030', '#b08010'] : ['#ffa080', '#ee4a30', '#a01c14'];
    const hg = ctx.createLinearGradient(0, y0, 0, y0 + bh); hg.addColorStop(0, hc[0]); hg.addColorStop(0.45, hc[1]); hg.addColorStop(1, hc[2]);
    ctx.fillStyle = hg; ctx.fillRect(x0, y0, w * hp, bh);
    ctx.fillStyle = 'rgba(255,255,255,0.38)'; ctx.fillRect(x0, y0, w * hp, 1);
    // segment notches (one per ~10% on buildings, ~25% on units)
    const nseg = e.k === 1 ? 10 : w > 26 ? 5 : 4;
    ctx.fillStyle = 'rgba(10,8,6,0.55)';
    for (let k = 1; k < nseg; k++) ctx.fillRect(x0 + Math.round(w * k / nseg), y0, 1, bh);
    // damage flash: brief white overlay and a pulse of the frame
    if (fx) { const fa = 1 - (t - fx.ft) / 0.25; if (fa > 0) { ctx.fillStyle = `rgba(255,255,255,${0.55 * fa})`; ctx.fillRect(x0, y0, w * Math.max(hp, fx.lag), bh); ctx.strokeStyle = `rgba(255,90,60,${0.8 * fa})`; ctx.lineWidth = 1; rrect(ctx, x0 - 2.5, y0 - 2.5, w + 5, bh + 5, 2.5); ctx.stroke(); } }
    if (e.o >= 0) { ctx.fillStyle = TEAM[e.o] || '#888'; ctx.fillRect(x0 - 2, y0 - 2, 3, bh + 4); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x0 - 2, y0 - 2, 3, 1); }
    if (e.k === 1 && e.prog > 0 && e.prog < 1) {
      ctx.fillStyle = 'rgba(14,11,8,0.92)'; rrect(ctx, x0 - 2, y0 + bh + 1.5, w + 4, 5, 1.5); ctx.fill();
      const pg = ctx.createLinearGradient(0, y0 + bh + 2.5, 0, y0 + bh + 5.5); pg.addColorStop(0, '#9ad0ff'); pg.addColorStop(1, '#3a7ad8');
      ctx.fillStyle = pg; ctx.fillRect(x0, y0 + bh + 2.5, w * e.prog, 3);
    }
  }

  // selection: soft team-tinted ground glow, dark under-ring and a crisp
  // relation-coloured ring (green own, red hostile, white neutral)
  drawSelection(ctx, e, F, z) {
    const col = e.o === F.you ? '124,255,124' : e.o < 0 ? '240,240,230' : '255,106,90';
    const tc = e.o >= 0 ? hexRgb(TEAM[e.o] || '#888') : [230, 230, 220];
    if (e.k === 1) {
      const s = e.def.size, x0 = e.x - s / 2, y0 = e.y - s / 2, x1 = x0 + s, y1 = y0 + s;
      const [cx, cy] = iso(e.x, e.y);
      const R = s * TW * 0.62;
      const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
      g.addColorStop(0, `rgba(${tc[0]},${tc[1]},${tc[2]},0.05)`); g.addColorStop(0.75, `rgba(${tc[0]},${tc[1]},${tc[2]},0.18)`); g.addColorStop(1, `rgba(${tc[0]},${tc[1]},${tc[2]},0)`);
      ctx.save(); ctx.beginPath(); ctx.moveTo(...iso(x0 - 0.15, y0 - 0.15)); ctx.lineTo(...iso(x1 + 0.15, y0 - 0.15)); ctx.lineTo(...iso(x1 + 0.15, y1 + 0.15)); ctx.lineTo(...iso(x0 - 0.15, y1 + 0.15)); ctx.closePath();
      ctx.fillStyle = g; ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.moveTo(...iso(x0, y0)); ctx.lineTo(...iso(x1, y0)); ctx.lineTo(...iso(x1, y1)); ctx.lineTo(...iso(x0, y1)); ctx.closePath();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3.2 / z; ctx.stroke();
      ctx.strokeStyle = `rgba(${col},0.45)`; ctx.lineWidth = 1.2 / z; ctx.setLineDash([4 / z, 3 / z]); ctx.lineDashOffset = -this.time * 8 / z; ctx.stroke(); ctx.setLineDash([]);
      // corner brackets
      const L = Math.min(0.45, s * 0.3);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const [cx2, cy2, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { ctx.moveTo(...iso(cx2 + dx * L, cy2)); ctx.lineTo(...iso(cx2, cy2)); ctx.lineTo(...iso(cx2, cy2 + dy * L)); }
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 3.6 / z; ctx.stroke();
      ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = 1.8 / z; ctx.stroke(); ctx.lineCap = 'butt';
      return;
    }
    const [sx, sy] = iso(e.x, e.y);
    const r = e.def && (e.def.naval || e.def.class === 'naval') ? (e.def.pop > 1 ? 30 : 20) : e.def && (e.def.pop > 1 || e.def.class === 'siege' || e.def.class === 'mounted') ? 15 : 10;
    const fl = e.def && e.def.flying;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 1.15);
    g.addColorStop(0, `rgba(${tc[0]},${tc[1]},${tc[2]},0.32)`); g.addColorStop(0.7, `rgba(${tc[0]},${tc[1]},${tc[2]},0.2)`); g.addColorStop(1, `rgba(${tc[0]},${tc[1]},${tc[2]},0)`);
    ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.5); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.15, 0, 7); ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.38)'; ctx.lineWidth = 3 / z;
    ctx.beginPath(); ctx.ellipse(sx, sy + 0.6, r, r * 0.5, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = `rgba(${col},0.95)`; ctx.lineWidth = 1.4 / z;
    ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.5, 0, 0, 7); ctx.stroke();
    // front highlight and slow rotating ticks
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.8 / z;
    ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.5, 0, 0.5, 2.6); ctx.stroke();
    ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = 2 / z;
    const rot = this.time * 0.9;
    for (let k = 0; k < 4; k++) { const a = rot + k * Math.PI / 2; ctx.beginPath(); ctx.ellipse(sx, sy, r + 2.2, (r + 2.2) * 0.5, 0, a, a + 0.28); ctx.stroke(); }
    if (fl) { ctx.strokeStyle = `rgba(${col},0.35)`; ctx.lineWidth = 1 / z; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 50); ctx.stroke(); ctx.setLineDash([]); }
  }

  // rally point: dotted path from the selected building, a pulsing ground
  // ring and a small pole with a waving team pennant
  drawRally(ctx, F, drawables) {
    const t = this.time;
    const [sx, sy] = iso(F.rally[0], F.rally[1]);
    let from = null;
    if (F.sel && F.sel.size === 1) for (const it of drawables) if (it.e && it.e.k === 1 && F.sel.has(it.e.i)) { from = it.e; break; }
    const tc = TEAM[F.you] || '#fff';
    if (from) {
      const [bx, by] = iso(from.x, from.y);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2.6; ctx.setLineDash([3, 5]); ctx.lineDashOffset = -t * 14;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(sx, sy); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,248,220,0.85)'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
    }
    const ph = (t * 0.9) % 1;
    ctx.strokeStyle = `rgba(255,248,220,${0.7 * (1 - ph)})`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(sx, sy, 5 + ph * 12, (5 + ph * 12) * 0.5, 0, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(sx + 3, sy, 6, 2.4, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2a1c10'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 26); ctx.stroke();
    ctx.strokeStyle = '#8a6a40'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(sx - 0.4, sy); ctx.lineTo(sx - 0.4, sy - 26); ctx.stroke();
    drawFlagCloth(ctx, sx, sy - 26, 13, F.you, t, 0.7);
    ctx.fillStyle = '#e8c860'; ctx.beginPath(); ctx.arc(sx, sy - 27, 1.6, 0, 7); ctx.fill();
    void tc;
  }

  // command acknowledgement: contracting double ring with four chevrons
  drawMarker(ctx, m) {
    const k = (this.time - m.t) / 0.7;
    const [sx, sy] = iso(m.x, m.y);
    const c = m.c || '#7cff7c', a = 1 - k;
    const R = 16 * (1 - k * 0.55);
    ctx.save();
    ctx.globalAlpha = a * 0.5; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(sx, sy + 0.6, R, R * 0.5, 0, 0, 7); ctx.stroke();
    ctx.globalAlpha = a; ctx.strokeStyle = c; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(sx, sy, R, R * 0.5, 0, 0, 7); ctx.stroke();
    ctx.globalAlpha = a * 0.6; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(sx, sy, R * 0.5 + k * 6, (R * 0.5 + k * 6) * 0.5, 0, 0, 7); ctx.stroke();
    ctx.globalAlpha = a; ctx.fillStyle = c; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.8;
    const d = R + 3 + (1 - k) * 4;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const px = sx + dx * d, py = sy + dy * d * 0.5;
      const ux = -dx, uy = -dy * 0.5, l = Math.hypot(ux, uy), nx = ux / l, ny = uy / l;
      ctx.beginPath(); ctx.moveTo(px + nx * 4, py + ny * 4); ctx.lineTo(px - ny * 3, py + nx * 3); ctx.lineTo(px + ny * 3, py - nx * 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // resource index (0 food .. 4 energy) a gathering worker is working on,
  // guessed from the nearest gather target in reach; falls back to the load
  workRes(e, carry) {
    const fb = carry >= 0 ? carry : -1;
    if (e.s !== 4 || !this.gatherGrid) return fb;
    let best = null, bd = 2.6;
    const tx = Math.floor(e.x), ty = Math.floor(e.y);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const b = this.gatherGrid.get(((tx + dx) & 0xffff) | ((ty + dy) << 16));
      if (!b) continue;
      for (const r of b) {
        let d;
        if (r.k === 1) { const h = (r.def ? r.def.size : 2) / 2; d = Math.max(0, Math.abs(e.x - r.x) - h) + Math.max(0, Math.abs(e.y - r.y) - h); }
        else d = Math.hypot(e.x - r.x, e.y - r.y);
        if (d < bd) { bd = d; best = r; }
      }
    }
    if (!best) return fb;
    if (best.k !== 2) return 0; // farm or hunted animal
    const rd = this.defs && this.defs.resources ? this.defs.resources[best.t] : null;
    if (rd && rd.res != null) return rd.res;
    return { tree: 1, berry: 0, carcass: 0, fish: 0, stone: 2, gold: 3, crystal: 4 }[best.t] ?? fb;
  }

  // scorch marks / craters (flat) and building rubble, fading out
  drawDecals(ctx) {
    const t = this.time;
    for (const d of this.decals) {
      const age = t - d.t0, fade = Math.min(1, (d.life - age) / 3);
      const [sx, sy] = iso(d.x, d.y);
      if (d.k === 'scorch') {
        const R = d.r * TW * 0.5;
        ctx.globalAlpha = fade * 0.75;
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
        g.addColorStop(0, 'rgba(20,14,8,0.85)'); g.addColorStop(0.6, 'rgba(40,30,20,0.45)'); g.addColorStop(1, 'rgba(40,30,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx, sy, R, R * 0.5, 0, 0, 7); ctx.fill();
        if (d.crater) { ctx.strokeStyle = 'rgba(150,130,100,0.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(sx, sy, R * 0.55, R * 0.27, 0, 0.2, Math.PI - 0.2); ctx.stroke(); }
        if (age < 2.5) { ctx.globalAlpha = (1 - age / 2.5) * 0.8; const g2 = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 0.5); g2.addColorStop(0, 'rgba(255,140,40,0.9)'); g2.addColorStop(1, 'rgba(255,90,20,0)'); ctx.fillStyle = g2; ctx.beginPath(); ctx.ellipse(sx, sy, R * 0.5, R * 0.25, 0, 0, 7); ctx.fill(); }
        ctx.globalAlpha = 1;
      } else if (d.k === 'rubble') {
        const sp = rubbleSprite(d.s, d.v, this.themeName);
        ctx.globalAlpha = fade;
        ctx.drawImage(sp.canvas, sx - sp.ox, sy - sp.oy, sp.w, sp.h);
        ctx.globalAlpha = 1;
        if (age < 6 && Math.random() < 0.15) this.puff(d.x + (Math.random() - 0.5) * d.s * 0.6, d.y + (Math.random() - 0.5) * d.s * 0.6, 0.1, age < 2 ? 'fire' : 'smoke');
      }
    }
  }

  // fallen unit: tips over, lies still, then fades
  drawCorpse(ctx, c, t) {
    const age = t - c.t0;
    const fall = Math.min(1, age / 0.4), ease = 1 - (1 - fall) * (1 - fall);
    const alpha = age < 1.8 ? 1 : Math.max(0, 1 - (age - 1.8) / 1.2);
    const [sx, sy] = iso(c.x, c.y);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (c.foot) {
      const big = c.def.class === 'mounted' || c.def.sprite === 'chariot';
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(sx + c.side * 6 * ease, sy, 5 + 7 * ease * (big ? 1.8 : 1), 2.6, 0, 0, 7); ctx.fill();
      ctx.translate(sx, sy);
      ctx.rotate(c.side * ease * (big ? 1.25 : 1.45));
      ctx.scale(1, 1 - ease * 0.25);
      drawUnit(ctx, 0, 0, { def: c.def, team: c.team, era: c.def.era, face: c.f, walk: 0, act: 0, busy: false, carry: -1, id: c.id, t: c.t0, moving: false, noShadow: true });
    } else {
      // wreck: sinks a little and darkens (dark overlay drawn as a soot cloud)
      drawUnit(ctx, sx, sy + ease * 3, { def: c.def, team: c.team, era: c.def.era, face: c.f, walk: 0, act: 0, busy: false, carry: -1, id: c.id, t: c.t0, moving: false });
      const g = ctx.createRadialGradient(sx, sy - 8, 0, sx, sy - 8, 20);
      g.addColorStop(0, 'rgba(10,8,6,0.7)'); g.addColorStop(1, 'rgba(10,8,6,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy - 8, 20, 0, 7); ctx.fill();
      if (age < 2 && Math.random() < 0.3) this.puff(c.x, c.y, 0.15, Math.random() < 0.4 ? 'fire' : 'smoke');
    }
    ctx.restore();
  }

  // licking flames on a badly damaged building
  drawFlames(ctx, pts, ox, oy, id, t) {
    for (let i = 0; i < pts.length; i++) {
      const bx = ox + pts[i][0], by = oy + pts[i][1];
      const fl = 0.75 + Math.sin(t * 13 + i * 2.1 + id) * 0.15 + Math.sin(t * 23 + i) * 0.1;
      const h = 11 * fl, w = 4;
      const g = ctx.createRadialGradient(bx, by - h * 0.3, 0, bx, by - h * 0.3, h * 1.2);
      g.addColorStop(0, 'rgba(255,200,80,0.4)'); g.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by - h * 0.3, h * 1.2, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,110,30,0.9)';
      ctx.beginPath(); ctx.moveTo(bx - w, by); ctx.quadraticCurveTo(bx - w * 0.8, by - h * 0.6, bx + Math.sin(t * 9 + i) * 1.5, by - h); ctx.quadraticCurveTo(bx + w * 0.8, by - h * 0.5, bx + w, by); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,230,120,0.95)';
      ctx.beginPath(); ctx.moveTo(bx - w * 0.5, by); ctx.quadraticCurveTo(bx - w * 0.4, by - h * 0.4, bx + Math.sin(t * 11 + i) * 0.8, by - h * 0.6); ctx.quadraticCurveTo(bx + w * 0.4, by - h * 0.3, bx + w * 0.5, by); ctx.closePath(); ctx.fill();
      if (Math.random() < 0.04) { const [wx, wy] = this.toWorldIso(bx, by); const p = this.puff(wx, wy, 0, 'smoke'); if (p) p.z = 0.9; }
    }
  }

  // an occasional flock of birds circling over the woods
  drawBirds(ctx, F) {
    const tm = this.themeName;
    if (tm === 'space' || tm === 'moon' || tm === 'mars') return;
    const t = this.time;
    if (!this.birds || t - this.birds.t0 > this.birds.life) {
      if (this.birdsNext === undefined) this.birdsNext = t + 3;
      if (t < this.birdsNext) return;
      this.birdsNext = t + 10 + Math.random() * 14;
      const v = this.view, trees = [];
      for (const e of F.ents) if (e.k === 2 && e.t === 'tree' && e.x > v.minX && e.x < v.maxX && e.y > v.minY && e.y < v.maxY) trees.push(e);
      if (!trees.length) { this.birds = null; return; }
      const c = trees[(Math.random() * trees.length) | 0];
      this.birds = { x: c.x, y: c.y, t0: t, life: 14, n: 3 + ((Math.random() * 4) | 0), r: 1.4 + Math.random(), dir: Math.random() < 0.5 ? -1 : 1, seed: Math.random() * 10 };
    }
    const b = this.birds, age = t - b.t0;
    const a = Math.min(1, age / 1.5, (b.life - age) / 1.5);
    if (a <= 0) return;
    const col = tm === 'winter' ? '30,30,36' : '24,20,18';
    for (let i = 0; i < b.n; i++) {
      const ph = b.dir * (age * 0.45 + i * 0.55) + b.seed;
      const r = b.r * (0.8 + 0.25 * Math.sin(i * 2.3));
      const wx = b.x + Math.cos(ph) * r + age * 0.08, wy = b.y + Math.sin(ph) * r - age * 0.05;
      const [gx, gy] = iso(wx, wy);
      const alt = (3.2 + Math.sin(age * 0.7 + i) * 0.3) * ZH;
      ctx.fillStyle = `rgba(0,0,0,${0.12 * a})`; ctx.beginPath(); ctx.ellipse(gx + alt * 0.35, gy, 2.4, 1, 0, 0, 7); ctx.fill();
      const bx = gx, by = gy - alt, flap = Math.sin(t * 9 + i * 1.7) * 2.6;
      ctx.strokeStyle = `rgba(${col},${0.85 * a})`; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx - 3.6, by - flap); ctx.quadraticCurveTo(bx - 1.4, by - 1.2 - flap * 0.3, bx, by); ctx.quadraticCurveTo(bx + 1.4, by - 1.2 - flap * 0.3, bx + 3.6, by - flap); ctx.stroke();
    }
  }

  drawStars(ctx) {
    if (!this.stars) {
      this.stars = [];
      for (let i = 0; i < 260; i++) this.stars.push([hash2(i, 1, 9), hash2(i, 2, 9), hash2(i, 3, 9)]);
    }
    for (const [x, y, b] of this.stars) {
      const sx = ((x * 3000 - this.camX * 0.1) % this.W + this.W) % this.W, sy = ((y * 2000 - this.camY * 0.1) % this.H + this.H) % this.H;
      ctx.fillStyle = `rgba(255,255,255,${0.3 + b * 0.7})`;
      ctx.fillRect(sx, sy, b > 0.9 ? 2 : 1, b > 0.9 ? 2 : 1);
    }
  }

  // ---------------------------------------------------------- minimap
  // Minimap: terrain base (cached, relief-shaded), fog (unexplored = black
  // clouds, explored = dimmed), team dots, alerts, camera frustum and frame.
  // alerts: optional [{x, y, t}] (t = time the alert was raised, seconds,
  // performance.now()/1000 or Renderer.time; only used for the pulse phase).
  minimap(mcv, ents, fog, you, alerts) {
    const mctx = mcv.getContext('2d');
    const S = mcv.width;
    if (!this.w) return;
    if (!this.miniBase || this.miniBase.width !== S || this.miniDirty) {
      this.miniDirty = false; this.miniFogSrc = null;
      this.miniBase = document.createElement('canvas'); this.miniBase.width = S; this.miniBase.height = S;
      const c = this.miniBase.getContext('2d');
      const { w, h, tiles } = this;
      const img = c.createImageData(w, h);
      const hgt = (t) => t === T_MTN ? 3 : t === T_WATER ? -1 : t === T_SHALLOW ? -0.5 : 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, t = tiles[i];
        const col = this.th.t[t] || this.th.t[0];
        let n = 0.9 + hash2(x, y) * 0.14 + (fbm(x * 0.15, y * 0.15, 2, 1) - 0.5) * 0.25;
        // relief: light from the upper left
        const dh = hgt(t) - hgt(tiles[Math.max(0, y - 1) * w + Math.max(0, x - 1)]);
        n *= 1 + dh * 0.12;
        if (t === T_WATER && this.shore) n *= 1 - Math.min(0.35, this.shore[i] * 0.04);
        if (t !== T_WATER && this.shore && this.shore[i] === 0 && ((x > 0 && tiles[i - 1] === T_WATER) || (y > 0 && tiles[i - w] === T_WATER) || (x < w - 1 && tiles[i + 1] === T_WATER) || (y < h - 1 && tiles[i + w] === T_WATER))) n *= 1.18;
        img.data[i * 4] = col[0] * n; img.data[i * 4 + 1] = col[1] * n; img.data[i * 4 + 2] = col[2] * n; img.data[i * 4 + 3] = 255;
      }
      const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; tmp.getContext('2d').putImageData(img, 0, 0);
      c.fillStyle = '#07090c'; c.fillRect(0, 0, S, S);
      c.save(); this.miniTransform(c, S); c.imageSmoothingEnabled = true; c.drawImage(tmp, 0, 0); c.restore();
      // cloud texture for unexplored areas
      this.miniCloud = document.createElement('canvas'); this.miniCloud.width = S; this.miniCloud.height = S;
      const cc = this.miniCloud.getContext('2d'); const ci = cc.createImageData(S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const v = fbm(x / S * 9, y / S * 9, 4, 5);
        const o = (y * S + x) * 4, k = 6 + v * 34;
        ci.data[o] = k * 0.9; ci.data[o + 1] = k * 0.92; ci.data[o + 2] = k * 1.1; ci.data[o + 3] = 255;
      }
      cc.putImageData(ci, 0, 0);
      this.miniFogLayer = document.createElement('canvas'); this.miniFogLayer.width = S; this.miniFogLayer.height = S;
    }
    mctx.save();
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, S, S);
    mctx.drawImage(this.miniBase, 0, 0);
    // fog: unexplored = cloudy black, explored but not visible = dimmed
    if (fog) {
      if (!this.miniFog || this.miniFog.width !== this.w || this.miniFog.height !== this.h) { this.miniFog = document.createElement('canvas'); this.miniFog.width = this.w; this.miniFog.height = this.h; }
      if (this.miniFogSrc !== fog || this.miniFogS !== S) {
      this.miniFogSrc = fog; this.miniFogS = S;
      const fc = this.miniFog.getContext('2d'); const img = fc.createImageData(this.w, this.h);
      for (let i = 0; i < fog.length; i++) img.data[i * 4 + 3] = fog[i] === 0 ? 255 : fog[i] === 1 ? 120 : 0;
      fc.putImageData(img, 0, 0);
      const L = this.miniFogLayer.getContext('2d');
      L.globalCompositeOperation = 'source-over'; L.clearRect(0, 0, S, S);
      L.save(); this.miniTransform(L, S); L.imageSmoothingEnabled = true;
      if ('filter' in L) L.filter = `blur(${Math.max(0.5, S / (this.w + this.h) * 0.6)}px)`;
      L.drawImage(this.miniFog, 0, 0); L.filter = 'none'; L.restore();
      L.globalCompositeOperation = 'source-in'; L.drawImage(this.miniCloud, 0, 0);
      L.globalCompositeOperation = 'source-over';
      }
      mctx.drawImage(this.miniFogLayer, 0, 0);
    }
    // entities: team-coloured dots with a dark outline (client data is fog-filtered already)
    const k = S * 0.94 / (this.w + this.h);
    const dot = Math.max(2, k * 1.6);
    for (const e of ents) {
      const [px, py] = this.miniPoint(e.x, e.y, S);
      if (e.k === 2) {
        if (e.t === 'tree') continue;
        mctx.fillStyle = e.t === 'gold' ? '#ffd84a' : e.t === 'stone' ? '#c8c8c8' : e.t === 'crystal' ? '#43d2ff' : e.t === 'fish' ? '#9fe0ff' : '#d04060';
        mctx.fillRect(px - dot * 0.4, py - dot * 0.4, dot * 0.8, dot * 0.8);
        continue;
      }
      const col = e.o < 0 ? '#e8d8b0' : TEAM[e.o] || '#888';
      if (e.k === 1) {
        const sz = (e.def ? e.def.size : 1) * k;
        mctx.fillStyle = 'rgba(0,0,0,0.75)';
        mctx.beginPath(); mctx.moveTo(px, py - sz - 1); mctx.lineTo(px + sz + 1, py); mctx.lineTo(px, py + sz + 1); mctx.lineTo(px - sz - 1, py); mctx.closePath(); mctx.fill();
        mctx.fillStyle = col;
        mctx.beginPath(); mctx.moveTo(px, py - sz); mctx.lineTo(px + sz, py); mctx.lineTo(px, py + sz); mctx.lineTo(px - sz, py); mctx.closePath(); mctx.fill();
      } else {
        mctx.fillStyle = 'rgba(0,0,0,0.75)'; mctx.fillRect(px - dot / 2 - 1, py - dot / 2 - 1, dot + 2, dot + 2);
        mctx.fillStyle = col; mctx.fillRect(px - dot / 2, py - dot / 2, dot, dot);
      }
    }
    // alerts: pulsing red rings
    if (alerts && alerts.length) {
      const now = performance.now() / 1000;
      for (const a of alerts) {
        if (!a) continue;
        const [px, py] = this.miniPoint(a.x, a.y, S);
        const ph = ((now - (a.t || 0)) * 1.4) % 1;
        for (const off of [0, 0.5]) {
          const f = (ph + off) % 1;
          mctx.strokeStyle = `rgba(255,60,40,${0.9 * (1 - f)})`; mctx.lineWidth = Math.max(1.5, S / 180);
          mctx.beginPath(); mctx.arc(px, py, S * 0.012 + f * S * 0.05, 0, 7); mctx.stroke();
        }
        mctx.fillStyle = '#ff4a30'; mctx.beginPath(); mctx.arc(px, py, Math.max(1.5, S / 160), 0, 7); mctx.fill();
      }
    }
    // camera frustum
    const pts = [this.toWorld(0, 0), this.toWorld(this.W, 0), this.toWorld(this.W, this.H), this.toWorld(0, this.H)].map(([x, y]) => this.miniPoint(x, y, S));
    mctx.lineJoin = 'round';
    mctx.strokeStyle = 'rgba(0,0,0,0.6)'; mctx.lineWidth = Math.max(2.5, S / 110);
    mctx.beginPath(); pts.forEach((p, i) => i ? mctx.lineTo(...p) : mctx.moveTo(...p)); mctx.closePath(); mctx.stroke();
    mctx.strokeStyle = '#ffffff'; mctx.lineWidth = Math.max(1, S / 260); mctx.stroke();
    // decorative frame around the map diamond
    const D = [this.miniPoint(0, 0, S), this.miniPoint(this.w, 0, S), this.miniPoint(this.w, this.h, S), this.miniPoint(0, this.h, S)];
    const fw = Math.max(2, S / 120);
    mctx.beginPath(); D.forEach((p, i) => i ? mctx.lineTo(...p) : mctx.moveTo(...p)); mctx.closePath();
    mctx.strokeStyle = '#2a1e10'; mctx.lineWidth = fw * 2.2; mctx.stroke();
    mctx.strokeStyle = '#c9a24e'; mctx.lineWidth = fw; mctx.stroke();
    mctx.strokeStyle = 'rgba(255,240,190,0.5)'; mctx.lineWidth = fw * 0.3; mctx.stroke();
    for (const p of D) {
      mctx.fillStyle = '#2a1e10'; mctx.beginPath(); mctx.arc(p[0], p[1], fw * 2.4, 0, 7); mctx.fill();
      mctx.fillStyle = '#d8b25a'; mctx.beginPath(); mctx.arc(p[0], p[1], fw * 1.6, 0, 7); mctx.fill();
      mctx.fillStyle = '#7a5a24'; mctx.beginPath(); mctx.arc(p[0], p[1], fw * 0.7, 0, 7); mctx.fill();
    }
    mctx.restore();
  }
  // The minimap shows the map as a diamond filling the whole square canvas.
  miniTransform(c, S) {
    const m = S * 0.03, k = (S - 2 * m) / (this.w + this.h);
    c.transform(k, k, -k, k, this.h * k + m, m);
  }
  miniPoint(x, y, S) { const m = S * 0.03, k = (S - 2 * m) / (this.w + this.h); return [(x - y) * k + this.h * k + m, (x + y) * k + m]; }
  miniToWorld(px, py, S) { const m = S * 0.03, k = (S - 2 * m) / (this.w + this.h); const a = (px - m - this.h * k) / k, b = (py - m) / k; return [(a + b) / 2, (b - a) / 2]; }
}

function makeWaterPattern() {
  // 256x128 tile: light wave crests, darker troughs below them and sun glints
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const c = cv.getContext('2d');
  c.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x = hash2(i, 1, 3) * 256, y = hash2(i, 2, 3) * 128, l = 6 + hash2(i, 3, 3) * 16, a = 0.25 + hash2(i, 4, 3) * 0.35;
    for (const [dx, dy] of [[0, 0], [-256, 0], [0, -128], [-256, -128]]) {
      if (x + dx + l < 0 || y + dy < -4) continue;
      c.strokeStyle = `rgba(10,30,50,${a * 0.5})`; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(x + dx + 1, y + dy + 1.6); c.quadraticCurveTo(x + dx + l / 2, y + dy - 0.2, x + dx + l - 1, y + dy + 1.6); c.stroke();
      c.strokeStyle = `rgba(255,255,255,${a + 0.2})`; c.lineWidth = 0.9;
      c.beginPath(); c.moveTo(x + dx, y + dy); c.quadraticCurveTo(x + dx + l / 2, y + dy - 2.2, x + dx + l, y + dy); c.stroke();
    }
  }
  for (let i = 0; i < 40; i++) {
    const x = hash2(i, 5, 3) * 256, y = hash2(i, 6, 3) * 128;
    c.fillStyle = 'rgba(255,255,240,0.95)'; c.fillRect(x, y, hash2(i, 7, 3) > 0.6 ? 2 : 1, 1);
  }
  const ctx2 = document.createElement('canvas').getContext('2d');
  return ctx2.createPattern(cv, 'repeat');
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
const RGBC = new Map();
function hexRgb(h) { let v = RGBC.get(h); if (!v) { const n = parseInt(h.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; RGBC.set(h, v); } return v; }
