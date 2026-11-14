// Isometric renderer: procedural terrain chunks, animated water, entities,
// effects, fog of war and minimap.
import { TW, TH, ZH, TEAM, iso, fbm, vnoise, hash2, clamp, shade } from './util.js';
import { theme, buildingSprite, drawBuilding, resourceSprite, drawUnit, smokePoints, P } from './sprites.js';

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
        const sh = [c[0] + 40, c[1] + 55, c[2] + 40];
        r = sh[0] + (c[0] - sh[0]) * deep; g = sh[1] + (c[1] - sh[1]) * deep; b = sh[2] + (c[2] - sh[2]) * deep;
        const k = 0.92 + n1 * 0.12; r *= k; g *= k; b *= k;
        break;
      }
      case T_MTN: {
        const ridge = Math.abs(Math.sin(wx * 2.3 + n1 * 5)) * 0.25;
        const k = 0.65 + n1 * 0.45 + n2 * 0.25 - ridge;
        r *= k; g *= k; b *= k;
        if (this.themeName === 'winter' && n1 > 0.55) { r = 235; g = 240; b = 245; }
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
        let fx = gx - ix + (n1 - 0.5) * 0.55, fy = gy - iy + (n2 - 0.5) * 0.2 + (n1 - 0.5) * 0.4;
        fx = clamp((fx - 0.5) * 1.8 + 0.5, 0, 1); fy = clamp((fy - 0.5) * 1.8 + 0.5, 0, 1);
        fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
        acc[0] = acc[1] = acc[2] = 0;
        for (let k = 0; k < 4; k++) {
          const tx = clamp(ix + (k & 1), 0, w - 1), ty = clamp(iy + (k >> 1), 0, h - 1);
          const wgt = (k & 1 ? fx : 1 - fx) * (k >> 1 ? fy : 1 - fy);
          if (wgt < 0.001) continue;
          const ti = ty * w + tx;
          this.terrainColor(tiles[ti], wx, wy, n1, n2, shore[ti] + ((k & 1 ? 1 - fx : fx) + (k >> 1 ? 1 - fy : fy)) * 0.5, c);
          acc[0] += c[0] * wgt; acc[1] += c[1] * wgt; acc[2] += c[2] * wgt;
        }
        // subtle global lighting gradient
        const lg = 0.96 + (n1 - 0.5) * 0.1;
        const o = (py * cw + px) * 4;
        d[o] = acc[0] * lg; d[o + 1] = acc[1] * lg; d[o + 2] = acc[2] * lg; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // water mask path for animated waves
    const wp = new Path2D();
    let hasWater = false;
    for (let ty = y0; ty < Math.min(y0 + CH, h); ty++) for (let tx = x0; tx < Math.min(x0 + CH, w); tx++) {
      const t = tiles[ty * w + tx];
      if (t === T_WATER || t === T_SHALLOW) {
        hasWater = true;
        const [ax, ay] = iso(tx, ty);
        wp.moveTo(ax - ox, ay - oy); wp.lineTo(ax + TW / 2 - ox, ay + TH / 2 - oy); wp.lineTo(ax - ox, ay + TH - oy); wp.lineTo(ax - TW / 2 - ox, ay + TH / 2 - oy); wp.closePath();
      }
    }
    return { cv, ox, oy, water: hasWater ? wp : null };
  }

  chunk(cx, cy) {
    const k = cx + ',' + cy;
    let c = this.chunks.get(k);
    if (!c) { c = this.buildChunk(cx, cy); this.chunks.set(k, c); }
    return c;
  }

  // pre-built rock sprites for mountain tiles
  buildRocks() {
    this.rocks = [];
    const { w, h, tiles } = this;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (tiles[y * w + x] !== T_MTN) continue;
      this.rocks.push({ x: x + 0.5, y: y + 0.5, v: Math.floor(hash2(x, y, 7) * 6) });
    }
  }

  rockSprite(v) {
    this.rockCache = this.rockCache || {};
    const key = this.themeName + v;
    if (this.rockCache[key]) return this.rockCache[key];
    const cv = document.createElement('canvas'); cv.width = 160; cv.height = 140;
    const ctx = cv.getContext('2d'); ctx.scale(2, 2); ctx.translate(40, 56);
    const base = this.th.t[T_MTN];
    const snow = this.themeName === 'winter';
    for (let i = 0; i < 4; i++) {
      const x = (hash2(v, i, 1) - 0.5) * 30, hgt = 14 + hash2(v, i, 2) * 26, wd = 10 + hash2(v, i, 3) * 8, y = (hash2(v, i, 4) - 0.5) * 8;
      ctx.fillStyle = shade(base, 0.55);
      ctx.beginPath(); ctx.moveTo(x - wd, y + 6); ctx.lineTo(x - wd * 0.3, y - hgt); ctx.lineTo(x, y + 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(base, 1.05);
      ctx.beginPath(); ctx.moveTo(x + wd, y + 6); ctx.lineTo(x - wd * 0.3, y - hgt); ctx.lineTo(x, y + 8); ctx.closePath(); ctx.fill();
      if (snow || hgt > 34) { ctx.fillStyle = 'rgba(245,248,255,0.9)'; ctx.beginPath(); ctx.moveTo(x - wd * 0.3, y - hgt); ctx.lineTo(x - wd * 0.55, y - hgt * 0.65); ctx.lineTo(x + wd * 0.2, y - hgt * 0.62); ctx.closePath(); ctx.fill(); }
    }
    this.rockCache[key] = cv;
    return cv;
  }

  // ---------------------------------------------------------- camera
  toScreen(wx, wy, z = 0) {
    const [ix, iy] = iso(wx, wy);
    return [(ix - this.camX) * this.zoom + this.W / 2, (iy - z * ZH - this.camY) * this.zoom + this.H / 2];
  }
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
        break;
      }
      case 'boom': {
        this.flashes.push({ x: ev.x, y: ev.y, t0: t, d: 0.25, r: 22 + ev.d * 18, c: '255,190,90' });
        for (let i = 0; i < 18; i++) this.puff(ev.x, ev.y, ev.d * 0.6, i % 3 ? 'smoke' : 'fire');
        break;
      }
      case 'death': {
        for (let i = 0; i < 6; i++) this.puff(ev.x, ev.y, 0.2, 'dust');
        break;
      }
      case 'collapse': {
        for (let i = 0; i < 30 * (ev.d || 1); i++) this.puff(ev.x + (Math.random() - 0.5) * ev.d, ev.y + (Math.random() - 0.5) * ev.d, ev.d * 0.4, i % 4 ? 'dust' : 'fire');
        break;
      }
      case 'melee': for (let i = 0; i < 3; i++) this.puff(ev.x, ev.y, 0.1, 'spark'); break;
      case 'work': this.puff(ev.x, ev.y, 0.15, ev.p === 'tree' ? 'chip' : ev.p === 'gold' ? 'gold' : 'dust'); break;
      case 'built': for (let i = 0; i < 14; i++) this.puff(ev.x, ev.y, 1, 'dust'); break;
      case 'age': this.texts.push({ x: ev.x, y: ev.y, t0: t, d: 3, s: '★ ' + (defs ? defs.ages[ev.d].name : 'New Age') + ' ★', c: '#ffd86a' }); break;
    }
  }

  puff(x, y, r, kind) {
    const a = Math.random() * 6.28, d = Math.random() * r;
    const p = { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, z: 0.1, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, vz: 0.5 + Math.random(), life: 1, kind, t0: this.time };
    switch (kind) {
      case 'smoke': p.vz = 0.6 + Math.random() * 0.5; p.life = 1.6 + Math.random(); p.size = 5 + Math.random() * 6; break;
      case 'chimney': p.vz = 0.5; p.vx = 0.15; p.vy = -0.05; p.life = 3; p.size = 4; break;
      case 'fire': p.vz = 1.2; p.life = 0.5 + Math.random() * 0.4; p.size = 4 + Math.random() * 5; break;
      case 'dust': p.vz = 0.3 + Math.random() * 0.4; p.life = 0.9 + Math.random() * 0.6; p.size = 4 + Math.random() * 5; break;
      case 'spark': p.vz = 1.5; p.vx *= 3; p.vy *= 3; p.life = 0.25; p.size = 1.5; break;
      case 'chip': case 'gold': p.vz = 1.4; p.vx *= 2.5; p.vy *= 2.5; p.life = 0.45; p.size = 1.6; break;
      case 'campfire': p.vz = 0.9 + Math.random() * 0.4; p.vx *= 0.15; p.vy *= 0.15; p.life = 0.55; p.size = 3 + Math.random() * 3; break;
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
      if (p.kind === 'spark' || p.kind === 'chip' || p.kind === 'gold') p.vz -= 6 * dt;
      if (this.time - p.t0 > p.life || p.z < -0.05) ps.splice(i, 1);
    }
    this.shots = this.shots.filter(s => this.time - s.t0 < s.d);
    this.flashes = this.flashes.filter(f => this.time - f.t0 < f.d);
    this.texts = this.texts.filter(f => this.time - f.t0 < f.d);
  }

  // ---------------------------------------------------------- drawing
  draw(F, dt) {
    this.time += dt;
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
      ctx.drawImage(c.cv, c.ox, c.oy);
      if (c.water && this.themeName !== 'space') {
        ctx.save(); ctx.translate(c.ox, c.oy); ctx.clip(c.water);
        const off = (this.time * 12) % 128;
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = this.waterPattern;
        ctx.translate(-off, -off * 0.5);
        ctx.fillRect(off - 10, off * 0.5 - 10, CH * TW + 20, CH * TH + 20);
        ctx.restore();
      }
    }
    this.pendingChunks = built;
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

    // ground decals: farms, selection rings, rally points, ghosts
    const drawables = [];
    if (!this.rocks) this.buildRocks();
    for (const r of this.rocks) if (r.x > minX && r.x < maxX && r.y > minY && r.y < maxY) drawables.push({ d: r.x + r.y, rock: r });
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
    // selection rings (under everything)
    for (const it of drawables) {
      const e = it.e;
      if (!e || !F.sel || !F.sel.has(e.i)) continue;
      const col = e.o === F.you ? '#7cff7c' : e.o < 0 ? '#ffffff' : '#ff6a5a';
      ctx.strokeStyle = col; ctx.lineWidth = 1.5 / z;
      if (e.k === 1) {
        const s = e.def.size, x0 = e.x - s / 2, y0 = e.y - s / 2;
        ctx.beginPath(); ctx.moveTo(...iso(x0, y0)); ctx.lineTo(...iso(x0 + s, y0)); ctx.lineTo(...iso(x0 + s, y0 + s)); ctx.lineTo(...iso(x0, y0 + s)); ctx.closePath(); ctx.stroke();
      } else {
        const [sx, sy] = iso(e.x, e.y);
        const r = e.def && (e.def.pop > 1 || e.def.class === 'siege' || e.def.class === 'mounted') ? 15 : 9;
        ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.5, 0, 0, 7); ctx.stroke();
      }
    }
    if (F.rally) {
      const [sx, sy] = iso(F.rally[0], F.rally[1]);
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 22); ctx.stroke();
      ctx.fillStyle = TEAM[F.you] || '#fff'; ctx.beginPath(); ctx.moveTo(sx, sy - 22); ctx.lineTo(sx + 11, sy - 18); ctx.lineTo(sx, sy - 14); ctx.fill();
    }
    if (F.marker && this.time - F.marker.t < 0.6) {
      const k = (this.time - F.marker.t) / 0.6;
      const [sx, sy] = iso(F.marker.x, F.marker.y);
      ctx.strokeStyle = F.marker.c || '#7cff7c'; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2 / z;
      ctx.beginPath(); ctx.ellipse(sx, sy, 14 * (1 - k * 0.6), 7 * (1 - k * 0.6), 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    }

    // entities
    const t = this.time;
    for (const it of drawables) {
      if (it.rock) {
        const [sx, sy] = iso(it.rock.x, it.rock.y);
        ctx.drawImage(this.rockSprite(it.rock.v), sx - 40, sy - 56, 80, 70);
        continue;
      }
      const e = it.e;
      const [sx, sy] = iso(e.x, e.y);
      if (e.k === 2) {
        const s = resourceSprite(e.t, this.themeName, e.v || 0);
        const k = e.t === 'tree' ? 1 : 0.9;
        ctx.drawImage(s.canvas, sx - s.ox * k, sy - s.oy * k, s.w * k, s.h * k);
      } else if (e.k === 1) {
        const s = e.def.size;
        const stage = e.prog > 0 && e.prog < 1 ? Math.min(2, Math.floor(e.prog * 3)) : 3;
        const [ax, ay] = iso(e.x - s / 2, e.y - s / 2);
        const era = this.defs ? this.defs.ages[e.g || 0].era : 'stone';
        if (stage === 3 && (e.t === 'granary' || e.t === 'town_center' || e.t === 'generator') && (era === 'medieval' || era === 'gunpowder' || era === 'future' || era === 'space')) {
          // animated buildings are drawn live
          ctx.save(); ctx.translate(ax, ay); drawBuilding(ctx, e.t, era, e.o, s, t); ctx.restore();
        } else {
          const sp = buildingSprite(e.t, era, e.o, s, stage);
          ctx.drawImage(sp.canvas, ax - sp.ox, ay - sp.oy, sp.w, sp.h);
          if (stage === 3) {
            // flags waving are baked; add smoke and fire animation
            for (const p of smokePoints(e.t, era, s)) {
              if (Math.random() < dt * 4) { const pp = this.puff(e.x - s / 2 + p[0], e.y - s / 2 + p[1], 0, 'chimney'); if (pp) pp.z = p[2]; }
            }
            if (e.t === 'town_center' && era === 'stone' && Math.random() < 0.7) this.puff(e.x + s / 2 - 0.6, e.y + s / 2 - 0.6, 0.08, 'campfire');
          }
        }
        if (e.hp < 0.5 && stage === 3 && e.t !== 'farm' && Math.random() < dt * 6) this.puff(e.x + (Math.random() - 0.5) * s * 0.6, e.y + (Math.random() - 0.5) * s * 0.6, 0.1, Math.random() < 0.5 ? 'fire' : 'smoke');
      } else {
        const def = e.def;
        if (!def) continue;
        const walking = e.moving;
        const walk = walking ? (t * (def.speed || 1) * 1.6 + e.i * 0.37) % 1 : 0;
        const act = e.b ? (t * 1.6 + e.i * 0.21) % 1 : 0;
        drawUnit(ctx, sx, sy, { def, team: e.o, era: def.era, face: e.f, walk, act, busy: e.b, carry: e.c > 0 ? e.r : -1, id: e.i, t });
      }
    }
    // particles
    for (const p of this.particles) {
      const [sx, sy] = iso(p.x, p.y);
      const age = (t - p.t0) / p.life, py = sy - p.z * ZH;
      switch (p.kind) {
        case 'smoke': case 'chimney': ctx.fillStyle = `rgba(90,90,90,${0.35 * (1 - age)})`; ctx.beginPath(); ctx.arc(sx, py, p.size * (1 + age * 1.5), 0, 7); ctx.fill(); break;
        case 'dust': ctx.fillStyle = `rgba(150,128,96,${0.4 * (1 - age)})`; ctx.beginPath(); ctx.arc(sx, py, p.size * (1 + age), 0, 7); ctx.fill(); break;
        case 'fire': case 'campfire': ctx.fillStyle = `rgba(255,${(180 - age * 140) | 0},40,${0.85 * (1 - age)})`; ctx.beginPath(); ctx.arc(sx, py, p.size * (1 - age * 0.5), 0, 7); ctx.fill(); break;
        case 'spark': ctx.fillStyle = `rgba(255,240,180,${1 - age})`; ctx.fillRect(sx, py, 2, 2); break;
        case 'chip': ctx.fillStyle = '#c8a070'; ctx.fillRect(sx, py, 2, 1.5); break;
        case 'gold': ctx.fillStyle = '#ffe070'; ctx.fillRect(sx, py, 2, 2); break;
      }
    }
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
        case 'arrow': case 'bolt': ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(qx, qyz); ctx.lineTo(px, pyz); ctx.stroke(); break;
        case 'stone': case 'boulder': case 'cannonball': case 'grenade':
          ctx.fillStyle = s.p === 'cannonball' ? '#222' : '#777'; ctx.beginPath(); ctx.arc(px, pyz, s.p === 'boulder' ? 4 : 2.5, 0, 7); ctx.fill();
          if (s.p !== 'stone' && Math.random() < 0.5) this.puff(x, y, 0, 'smoke'); break;
        case 'bullet': case 'shell': ctx.strokeStyle = 'rgba(255,230,150,0.95)'; ctx.lineWidth = s.p === 'shell' ? 2.5 : 1.2; ctx.beginPath(); ctx.moveTo(qx, qyz); ctx.lineTo(px, pyz); ctx.stroke(); break;
        case 'rocket': case 'missile': ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.arc(px, pyz, 2, 0, 7); ctx.fill(); this.puff(x, y, 0, Math.random() < 0.5 ? 'fire' : 'smoke'); break;
        case 'laser': case 'rail': case 'ion': {
          const [ax, ay] = iso(s.x, s.y), [bx, by] = iso(s.tx, s.ty);
          const col = s.p === 'ion' ? '170,140,255' : s.p === 'rail' ? '200,240,255' : '90,240,255';
          ctx.strokeStyle = `rgba(${col},${1 - k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ax, ay - 14); ctx.lineTo(bx, by - 10); ctx.stroke();
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

    // fog of war
    if (F.fog) {
      if (!this.fogCv || this.fogCv.width !== this.w) { this.fogCv = document.createElement('canvas'); this.fogCv.width = this.w; this.fogCv.height = this.h; this.fogImg = this.fogCv.getContext('2d').createImageData(this.w, this.h); }
      if (F.fogDirty) {
        const d = this.fogImg.data, fc = this.th.fog;
        for (let i = 0; i < F.fog.length; i++) {
          const s = F.fog[i];
          d[i * 4] = fc[0]; d[i * 4 + 1] = fc[1]; d[i * 4 + 2] = fc[2];
          d[i * 4 + 3] = s === 0 ? 255 : s === 1 ? 120 : 0;
        }
        this.fogCv.getContext('2d').putImageData(this.fogImg, 0, 0);
        F.fogDirty = false;
      }
      ctx.save();
      ctx.transform(TW / 2, TH / 2, -TW / 2, TH / 2, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.fogCv, 0, 0);
      ctx.restore();
    }
    // health bars & labels on top of fog
    for (const it of drawables) {
      const e = it.e;
      if (!e || e.k === 2) continue;
      const selected = F.sel && F.sel.has(e.i);
      if (!selected && !(e.hp < 0.999 && e.k === 0) && !(e.k === 1 && e.hp < 0.999 && e.prog === 0)) continue;
      if (e.k === 1 && !selected && e.hp > 0.7) continue;
      let [sx, sy] = iso(e.x, e.y);
      let w = 22, off = 30;
      if (e.k === 1) { w = 40 + e.def.size * 6; off = 30 + e.def.size * 22; }
      else if (e.def && e.def.flying) off = 60;
      else if (e.def && (e.def.class === 'mounted' || e.def.class === 'siege')) off = 38;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(sx - w / 2 - 1, sy - off - 1, w + 2, 5);
      ctx.fillStyle = e.hp > 0.5 ? '#3ad048' : e.hp > 0.25 ? '#e8c030' : '#e04030';
      ctx.fillRect(sx - w / 2, sy - off, w * clamp(e.hp, 0, 1), 3);
      if (e.k === 1 && e.prog > 0 && e.prog < 1) { ctx.fillStyle = '#5aa0ff'; ctx.fillRect(sx - w / 2, sy - off + 4, w * e.prog, 2); }
    }
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
  minimap(mcv, ents, fog, you) {
    const mctx = mcv.getContext('2d');
    const S = mcv.width;
    if (!this.miniBase || this.miniBase.width !== S || this.miniDirty) {
      this.miniDirty = false;
      this.miniBase = document.createElement('canvas'); this.miniBase.width = S; this.miniBase.height = S;
      const c = this.miniBase.getContext('2d');
      const img = c.createImageData(this.w, this.h);
      for (let i = 0; i < this.tiles.length; i++) {
        const col = this.th.t[this.tiles[i]];
        const n = 0.9 + hash2(i % this.w, (i / this.w) | 0) * 0.2;
        img.data[i * 4] = col[0] * n; img.data[i * 4 + 1] = col[1] * n; img.data[i * 4 + 2] = col[2] * n; img.data[i * 4 + 3] = 255;
      }
      const tmp = document.createElement('canvas'); tmp.width = this.w; tmp.height = this.h; tmp.getContext('2d').putImageData(img, 0, 0);
      c.save(); this.miniTransform(c, S); c.drawImage(tmp, 0, 0); c.restore();
    }
    mctx.clearRect(0, 0, S, S);
    mctx.drawImage(this.miniBase, 0, 0);
    mctx.save(); this.miniTransform(mctx, S);
    for (const e of ents) {
      if (e.k === 2) { if (e.t === 'tree') continue; mctx.fillStyle = e.t === 'gold' ? '#ffd84a' : e.t === 'stone' ? '#c8c8c8' : e.t === 'crystal' ? '#43d2ff' : '#d04060'; mctx.fillRect(e.x - 0.6, e.y - 0.6, 1.2, 1.2); continue; }
      mctx.fillStyle = e.o < 0 ? '#e8d8b0' : TEAM[e.o];
      const s = e.k === 1 ? e.def.size : 1.4;
      mctx.fillRect(e.x - s / 2, e.y - s / 2, s, s);
    }
    if (fog) {
      if (!this.miniFog || this.miniFog.width !== this.w) { this.miniFog = document.createElement('canvas'); this.miniFog.width = this.w; this.miniFog.height = this.h; }
      const fc = this.miniFog.getContext('2d'); const img = fc.createImageData(this.w, this.h);
      for (let i = 0; i < fog.length; i++) img.data[i * 4 + 3] = fog[i] === 0 ? 255 : fog[i] === 1 ? 110 : 0;
      fc.putImageData(img, 0, 0);
      mctx.drawImage(this.miniFog, 0, 0);
    }
    mctx.restore();
    // view rectangle
    const pts = [this.toWorld(0, 0), this.toWorld(this.W, 0), this.toWorld(this.W, this.H), this.toWorld(0, this.H)].map(([x, y]) => this.miniPoint(x, y, S));
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 1;
    mctx.beginPath(); pts.forEach((p, i) => i ? mctx.lineTo(...p) : mctx.moveTo(...p)); mctx.closePath(); mctx.stroke();
  }
  miniTransform(c, S) {
    const k = S / (this.w + this.h);
    c.transform(k, k / 2, -k, k / 2, S / 2, S / 4);
  }
  miniPoint(x, y, S) { const k = S / (this.w + this.h); return [(x - y) * k + S / 2, (x + y) * k / 2 + S / 4]; }
  miniToWorld(px, py, S) { const k = S / (this.w + this.h); const a = (px - S / 2) / k, b = (py - S / 4) * 2 / k; return [(a + b) / 2, (b - a) / 2]; }
}

function makeWaterPattern() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
  const c = cv.getContext('2d');
  c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const x = hash2(i, 1, 3) * 128, y = hash2(i, 2, 3) * 64, l = 6 + hash2(i, 3, 3) * 12;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + l / 2, y - 2, x + l, y); c.stroke();
  }
  const ctx2 = document.createElement('canvas').getContext('2d');
  return ctx2.createPattern(cv, 'repeat');
}

