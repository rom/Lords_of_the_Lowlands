// Level editor: paint terrain, place resources/animals and start positions,
// edit level properties, save to the server or download as JSON.
import { el, $, api, clamp, TEAM } from './util.js';
import { Renderer } from './render.js';
import { theme, iconCanvas, resourceSprite } from './sprites.js';

const TERRAIN = ['Grass', 'Dirt', 'Sand', 'Water', 'Mountain', 'Ford', 'Road'];
const OBJECTS = ['tree', 'berry', 'gold', 'stone', 'crystal', 'deer', 'boar', 'mammoth'];
const THEMES = ['temperate', 'desert', 'winter', 'tropical', 'moon', 'mars', 'space'];
const MIN = 24, MAX = 128;

class Editor {
  constructor() {
    this.cv = $('#view');
    this.r = new Renderer(this.cv);
    this.tool = { kind: 'terrain', v: 0 };
    this.undo = [];
    this.init();
  }

  async init() {
    try { this.defs = await api('/api/defs'); } catch (e) { this.status('Cannot reach server'); return; }
    this.r.defs = this.defs;
    try { this.me = await api('/api/me'); } catch (e) { this.me = null; }
    this.buildTools();
    this.bindProps();
    this.bindInput();
    await this.listLevels();
    const q = new URLSearchParams(location.search).get('level');
    if (q) await this.open(q); else this.newLevel(64, 64, 'temperate');
    this.loop();
  }

  status(s) { $('#estatus').textContent = s; }

  newLevel(w, h, th) {
    this.lv = { id: '', name: 'New Level', description: '', theme: th, width: w, height: h, startAge: 0, maxAge: 3,
      objective: { type: 'conquest' }, startRes: [200, 200, 150, 0, 0], difficulty: 'normal', tiles: '0'.repeat(w * h), objects: [],
      starts: [{ x: 8, y: 8 }, { x: w - 9, y: h - 9 }] };
    this.load();
  }

  load() {
    const l = this.lv;
    this.tiles = new Uint8Array(l.width * l.height);
    for (let i = 0; i < this.tiles.length; i++) this.tiles[i] = l.tiles.charCodeAt(i) - 48;
    this.objects = new Map();
    for (const o of l.objects || []) this.objects.set(o.y * l.width + o.x, o.k);
    this.starts = (l.starts || []).map(s => ({ x: s.x, y: s.y }));
    this.r.setMap({ w: l.width, h: l.height, tiles: l.tiles, theme: l.theme });
    this.r.centerOn(l.width / 2, l.height / 2);
    this.r.zoom = 0.8;
    this.rebuildEnts();
    this.fillProps();
    this.undo = [];
  }

  rebuildEnts() {
    const w = this.lv.width;
    this.ents = [];
    let i = 0;
    for (const [idx, k] of this.objects) {
      const x = idx % w + 0.5, y = Math.floor(idx / w) + 0.5;
      if (this.defs.resources[k]) this.ents.push({ i: i++, k: 2, t: k, o: -1, x, y, v: idx % 6, hp: 1 });
      else this.ents.push({ i: i++, k: 0, t: k, o: -1, x, y, def: this.defs.units[k], f: (idx % 7), hp: 1 });
    }
  }

  serialize() {
    const l = this.lv, w = l.width;
    let tiles = '';
    for (let i = 0; i < this.tiles.length; i++) tiles += String.fromCharCode(48 + this.tiles[i]);
    const objects = [];
    for (const [idx, k] of this.objects) objects.push({ k, x: idx % w, y: Math.floor(idx / w) });
    return { ...l, tiles, objects, starts: this.starts, startRes: [0, 1, 2, 3, 4].map(i => +$('#r' + i).value || 0) };
  }

  validate(l) {
    if (!l.name.trim()) return 'Name is required';
    if (l.starts.length < 2) return 'Place at least two start positions';
    if (l.starts.length > 8) return 'At most eight start positions';
    for (const s of l.starts) {
      if (s.x < 2 || s.y < 2 || s.x >= l.width - 2 || s.y >= l.height - 2) return 'A start position is too close to the edge';
      const t = this.tiles[s.y * l.width + s.x];
      if (t === 3 || t === 4) return 'A start position is on water or mountains';
    }
    if (l.maxAge < l.startAge) return 'Final age must not be before start age';
    if (l.objective.type === 'advance' && l.maxAge === l.startAge) return 'Advance objective needs a later final age';
    if (this.objects.size > 6000) return 'Too many objects (max 6000)';
    return '';
  }

  buildTools() {
    const th = theme(this.lv ? this.lv.theme : 'temperate');
    const mk = (canvas, label, tool) => {
      const b = el('button', { class: 'tool', title: label }, canvas, el('span', { text: label }));
      b.addEventListener('click', () => { this.tool = tool; for (const x of document.querySelectorAll('.tool')) x.classList.toggle('active', x === b); });
      b.dataset.tool = JSON.stringify(tool);
      return b;
    };
    $('#tterrain').replaceChildren(...TERRAIN.map((n, i) => {
      const c = el('canvas', { width: 48, height: 48 }); const ctx = c.getContext('2d');
      const col = th.t[i]; ctx.fillStyle = `rgb(${col})`; ctx.fillRect(0, 0, 48, 48);
      for (let k = 0; k < 40; k++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`; ctx.fillRect(Math.random() * 48, Math.random() * 48, 3, 3); }
      return mk(c, n, { kind: 'terrain', v: i });
    }));
    $('#tobjects').replaceChildren(...OBJECTS.map(k => {
      const isRes = !!this.defs.resources[k];
      const c = iconCanvas(isRes ? 'resource' : 'unit', k, isRes ? this.defs.resources[k] : this.defs.units[k], 'stone', 7, this.lv ? this.lv.theme : 'temperate', 48);
      return mk(c, k, { kind: 'object', v: k });
    }));
    const erase = el('canvas', { width: 48, height: 48 }); { const c = erase.getContext('2d'); c.fillStyle = '#333'; c.fillRect(0, 0, 48, 48); c.strokeStyle = '#e04030'; c.lineWidth = 4; c.beginPath(); c.moveTo(10, 10); c.lineTo(38, 38); c.moveTo(38, 10); c.lineTo(10, 38); c.stroke(); }
    const start = el('canvas', { width: 48, height: 48 }); { const c = start.getContext('2d'); c.fillStyle = '#333'; c.fillRect(0, 0, 48, 48); c.fillStyle = TEAM[0]; c.beginPath(); c.arc(24, 24, 14, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = 'bold 18px Georgia'; c.textAlign = 'center'; c.fillText('1', 24, 30); }
    $('#tother').replaceChildren(mk(erase, 'erase', { kind: 'erase' }), mk(start, 'start', { kind: 'start' }));
    const first = document.querySelector('.tool'); if (first) first.classList.add('active');
  }

  bindProps() {
    const ages = this.defs.ages.map((a, i) => el('option', { value: i, text: `${i + 1}. ${a.name}` }));
    $('#pstart').replaceChildren(...ages.map(o => o.cloneNode(true)));
    $('#pmax').replaceChildren(...ages);
    $('#ptheme').replaceChildren(...THEMES.map(t => el('option', { value: t, text: t })));
    const upd = () => {
      const l = this.lv;
      l.name = $('#pname').value; l.description = $('#pdesc').value;
      const th = $('#ptheme').value;
      l.startAge = +$('#pstart').value; l.maxAge = +$('#pmax').value;
      l.objective = { type: $('#pobj').value };
      if (l.objective.type === 'survive') l.objective.minutes = +$('#pmin').value;
      l.difficulty = $('#pdiff').value;
      $('#pminrow').classList.toggle('hidden', l.objective.type !== 'survive');
      if (th !== l.theme) {
        l.theme = th;
        const ser = this.serialize();
        this.r.setMap({ w: l.width, h: l.height, tiles: ser.tiles, theme: th });
        this.buildTools();
      }
      this.check();
    };
    for (const id of ['pname', 'pdesc', 'ptheme', 'pstart', 'pmax', 'pobj', 'pmin', 'pdiff', 'r0', 'r1', 'r2', 'r3', 'r4']) $('#' + id).addEventListener('input', upd);
    $('#enew').addEventListener('click', () => this.newDialog());
    $('#egen').addEventListener('click', () => this.generate());
    $('#eopen').addEventListener('change', (e) => { if (e.target.value) this.open(e.target.value); e.target.value = ''; });
    $('#esave').addEventListener('click', () => this.save());
    $('#eplay').addEventListener('click', async () => { const id = await this.save(); if (id) location.href = `/?play=${encodeURIComponent(id)}`; });
    $('#edown').addEventListener('click', () => this.download());
    $('#eup').addEventListener('change', (e) => this.upload(e.target.files[0]));
    $('#eundo').addEventListener('click', () => this.doUndo());
    $('#egrid').addEventListener('change', () => {});
  }

  fillProps() {
    const l = this.lv;
    $('#pname').value = l.name || ''; $('#pdesc').value = l.description || '';
    $('#ptheme').value = l.theme; $('#pstart').value = l.startAge; $('#pmax').value = l.maxAge;
    $('#pobj').value = (l.objective && l.objective.type) || 'conquest'; $('#pmin').value = (l.objective && l.objective.minutes) || 15;
    $('#pminrow').classList.toggle('hidden', $('#pobj').value !== 'survive');
    $('#pdiff').value = l.difficulty || 'normal';
    const sr = l.startRes || [0, 0, 0, 0, 0];
    for (let i = 0; i < 5; i++) $('#r' + i).value = sr[i] || 0;
    this.buildTools();
    this.check();
  }

  check() {
    const l = this.serialize();
    const err = this.validate(l);
    $('#perr').textContent = err;
    $('#pinfo').textContent = `${l.width}×${l.height} · ${this.objects.size} objects · ${this.starts.length} players`;
    return err;
  }

  async listLevels() {
    try {
      const lv = await api('/api/levels');
      $('#eopen').replaceChildren(el('option', { value: '', text: 'Open level…' }),
        el('optgroup', { label: 'Campaign' }, ...lv.campaign.map(l => el('option', { value: l.id, text: `${l.campaign}. ${l.name}` }))),
        el('optgroup', { label: 'Player levels' }, ...(lv.custom || []).map(l => el('option', { value: l.id, text: `${l.name} — ${l.author}` }))));
    } catch (e) { /* ignore */ }
  }

  async open(id) {
    try {
      const l = await api('/api/levels/' + encodeURIComponent(id));
      if (!this.me || l.author !== this.me.name) { l.id = ''; if (l.author === 'Campaign') l.name = l.name + ' (copy)'; }
      this.lv = l; this.load(); this.status(`Opened ${l.name}`);
    } catch (e) { this.status(e.message); }
  }

  newDialog() {
    const w = el('input', { type: 'number', min: MIN, max: MAX, value: 64 }), h = el('input', { type: 'number', min: MIN, max: MAX, value: 64 });
    const th = el('select', {}, ...THEMES.map(t => el('option', { value: t, text: t })));
    const box = el('div', { class: 'panel menu-box' }, el('h2', { text: 'New Level' }),
      el('label', {}, 'Width ', w), el('label', {}, 'Height ', h), el('label', {}, 'Theme ', th),
      el('button', { class: 'btn primary', text: 'Create', onclick: () => { this.newLevel(clamp(+w.value || 64, MIN, MAX), clamp(+h.value || 64, MIN, MAX), th.value); $('#overlay').classList.add('hidden'); } }),
      el('button', { class: 'btn', text: 'Cancel', onclick: () => $('#overlay').classList.add('hidden') }));
    $('#overlay').replaceChildren(box); $('#overlay').classList.remove('hidden');
  }

  async generate() {
    try {
      const l = await api('/api/generate', { method: 'POST', body: { theme: this.lv.theme, size: this.lv.width, startAge: this.lv.startAge, maxAge: this.lv.maxAge, seed: Math.floor(Math.random() * 1e9), water: 0.3, players: Math.max(2, this.starts.length) } });
      l.name = this.lv.name; l.description = this.lv.description; l.id = this.lv.id;
      this.lv = l; this.load(); this.status('Generated a random map');
    } catch (e) { this.status(e.message); }
  }

  async save() {
    const l = this.serialize();
    const err = this.validate(l);
    if (err) { this.status(err); return null; }
    if (!this.me || this.me.guest) { this.status('Sign in with a registered account to save (Download works for everyone)'); return null; }
    try {
      const r = await api('/api/levels', { method: 'POST', body: l });
      this.lv.id = r.id; this.status('Saved ✔'); this.listLevels();
      return r.id;
    } catch (e) { this.status(e.message); return null; }
  }

  download() {
    const l = this.serialize();
    const blob = new Blob([JSON.stringify(l)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: (l.name || 'level').replace(/[^\w-]+/g, '_') + '.json' });
    document.body.append(a); a.click(); a.remove();
  }

  async upload(f) {
    if (!f) return;
    if (f.size > 512 * 1024) { this.status('File too large'); return; }
    try {
      const l = JSON.parse(await f.text());
      if (typeof l.width !== 'number' || typeof l.height !== 'number' || typeof l.tiles !== 'string' || l.tiles.length !== l.width * l.height || l.width < MIN || l.width > MAX || l.height < MIN || l.height > MAX) throw new Error('Not a valid level file');
      if (!/^[0-6]*$/.test(l.tiles)) throw new Error('Invalid tiles');
      l.objects = (l.objects || []).filter(o => OBJECTS.includes(o.k) && o.x >= 0 && o.y >= 0 && o.x < l.width && o.y < l.height);
      l.starts = (l.starts || []).slice(0, 8);
      l.id = '';
      if (!THEMES.includes(l.theme)) l.theme = 'temperate';
      l.name = String(l.name || 'Uploaded level').slice(0, 48); l.description = String(l.description || '').slice(0, 600);
      l.startAge = clamp(l.startAge | 0, 0, 16); l.maxAge = clamp(l.maxAge | 0, 0, 16);
      l.objective = l.objective && ['conquest', 'survive', 'advance'].includes(l.objective.type) ? l.objective : { type: 'conquest' };
      this.lv = l; this.load(); this.status('Loaded ' + f.name);
    } catch (e) { this.status(e.message); }
  }

  snapshot() {
    this.undo.push({ tiles: this.tiles.slice(), objects: new Map(this.objects), starts: this.starts.map(s => ({ ...s })) });
    if (this.undo.length > 40) this.undo.shift();
  }

  doUndo() {
    const s = this.undo.pop();
    if (!s) return;
    this.tiles = s.tiles; this.objects = s.objects; this.starts = s.starts;
    for (let y = 0; y < this.lv.height; y++) for (let x = 0; x < this.lv.width; x++) this.r.setTile(x, y, this.tiles[y * this.lv.width + x]);
    this.r.invalidate(0, 0, this.lv.width, this.lv.height);
    this.r.miniDirty = true;
    this.rebuildEnts(); this.check();
  }

  paint(wx, wy) {
    const { width: w, height: h } = this.lv;
    const cx = Math.floor(wx), cy = Math.floor(wy);
    const r = +$('#ebrush').value;
    const t = this.tool;
    if (t.kind === 'start') {
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) return;
      const i = this.starts.findIndex(s => Math.abs(s.x - cx) <= 2 && Math.abs(s.y - cy) <= 2);
      if (i >= 0) this.starts.splice(i, 1); else if (this.starts.length < 8) this.starts.push({ x: cx, y: cy });
      this.check();
      return;
    }
    let changed = false;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = y * w + x;
      if (t.kind === 'terrain') {
        if (this.tiles[i] !== t.v) { this.tiles[i] = t.v; this.r.setTile(x, y, t.v); changed = true; }
        if ((t.v === 3 || t.v === 4) && this.objects.has(i)) { this.objects.delete(i); }
      } else if (t.kind === 'object') {
        const tt = this.tiles[i];
        if (tt === 3 || tt === 4) continue;
        if (r > 0 && t.v !== 'tree' && Math.random() > 0.35) continue; // scatter
        if (r > 0 && t.v === 'tree' && Math.random() > 0.7) continue;
        if (this.objects.get(i) !== t.v) { this.objects.set(i, t.v); changed = true; }
      } else if (t.kind === 'erase') {
        if (this.objects.delete(i)) changed = true;
      }
    }
    if (changed) {
      if (t.kind === 'terrain') { this.r.invalidate(cx - r, cy - r, cx + r, cy + r); this.r.miniDirty = true; }
      this.rebuildEnts();
      this.check();
    }
  }

  bindInput() {
    const cv = this.cv;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('mousedown', (e) => {
      if (e.button === 2) { this.panning = { x: e.clientX, y: e.clientY }; return; }
      if (e.button === 0) { this.snapshot(); this.painting = true; this.paint(...this.r.toWorld(e.offsetX, e.offsetY)); }
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse = { x: e.offsetX, y: e.offsetY };
      if (this.panning) { this.r.pan(this.panning.x - e.clientX, this.panning.y - e.clientY); this.panning = { x: e.clientX, y: e.clientY }; }
      else if (this.painting && this.tool.kind !== 'start' && e.target === cv) this.paint(...this.r.toWorld(e.offsetX, e.offsetY));
    });
    window.addEventListener('mouseup', () => { this.panning = null; this.painting = false; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.r.setZoom(this.r.zoom * (e.deltaY < 0 ? 1.1 : 0.9), e.offsetX, e.offsetY); }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this.doUndo(); }
      const sp = 60;
      if (e.key === 'ArrowLeft') this.r.pan(-sp, 0); if (e.key === 'ArrowRight') this.r.pan(sp, 0);
      if (e.key === 'ArrowUp') this.r.pan(0, -sp); if (e.key === 'ArrowDown') this.r.pan(0, sp);
    });
    window.addEventListener('resize', () => this.r.resize());
  }

  loop() {
    let last = performance.now();
    const f = (ts) => {
      requestAnimationFrame(f);
      const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
      let brush = null;
      if (this.mouse && this.tool.kind !== 'start') {
        const [wx, wy] = this.r.toWorld(this.mouse.x, this.mouse.y);
        brush = { x: Math.floor(wx), y: Math.floor(wy), r: +$('#ebrush').value };
      }
      this.r.draw({ ents: this.ents || [], grid: $('#egrid').checked, starts: this.starts, brush, fastBuild: true }, dt);
    };
    requestAnimationFrame(f);
  }
}

new Editor();
