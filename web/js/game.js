// In-game client: receives snapshots, interpolates, handles input and HUD.
import { el, $, clamp, lerp, fmtTime, TEAM, TEAM_NAMES, iso } from './util.js';
import { Renderer } from './render.js';
import { iconCanvas, techIcon, cmdIcon, resIcon, romanNum, RES_COLORS } from './sprites.js';
import { sfx, playMusic } from './audio.js';

const RES_SHORT = ['Food', 'Wood', 'Stone', 'Gold', 'Energy'];
const ECO = ['house', 'granary', 'lumber_camp', 'mining_camp', 'farm', 'dock', 'town_center', 'generator'];
const MIL = ['barracks', 'range', 'stable', 'workshop', 'academy', 'tower'];
const KEYS = ['q', 'w', 'e', 'r', 't', 'a', 's', 'd', 'f', 'g', 'z', 'x', 'c', 'v', 'b'];

export class GameClient {
  constructor(app, start) {
    this.app = app;
    this.net = app.net;
    this.defs = app.defs;
    this.you = start.you;
    this.map = start.map;
    this.level = start.level;
    this.players = start.players;
    this.ents = new Map();
    this.sel = new Set();
    this.groups = {};
    this.snap = null;
    this.snapT = performance.now();
    this.fog = null;
    this.res = [0, 0, 0, 0, 0];
    this.age = start.map.startAge || 0;
    this.menuPage = 'main';
    this.mouse = { x: -1, y: -1, in: false };
    this.keys = new Set();
    this.events = [];
    this.lastFrame = performance.now();
    this.over = false;
    this.spectator = start.you === -1;
    this.alerts = [];

    this.root = $('#game');
    this.cv = $('#view');
    this.r = new Renderer(this.cv);
    this.r.defs = this.defs;
    this.r.setMap(this.map);
    this.r.centerOn(start.cam[0], start.cam[1]);
    this.mini = $('#minimap');
    this.buildHUD();
    this.root.classList.toggle('spectator', this.spectator);
    if (this.spectator) { this.r.zoom = 0.85; this.nextPan = 0; }
    this.bind();
    playMusic(this.defs.ages[this.age].era);
    this.toast(`${this.level.name} — ${objectiveText(this.level.objective, this.defs, this.map.maxAge)}`, 6000);
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.root.classList.remove('spectator');
    for (const [t, f, o] of this.handlers) t.removeEventListener(f, o);
    this.root.classList.add('hidden');
  }

  // --------------------------------------------------------- network
  onSnap(s) {
    const now = performance.now();
    this.snap = s;
    this.snapT = now;
    this.res = s.res; this.pop = s.pop; this.cap = s.cap;
    const age = this.spectator ? Math.max(0, ...s.players.map(p => p.g)) : s.age;
    if (age !== this.age) { this.age = age; playMusic(this.defs.ages[this.age].era); this.menuDirty = true; }
    this.techs = new Set(s.techs || []);
    this.players = s.players;
    const seen = new Set();
    for (const v of s.ents) {
      seen.add(v.i);
      let e = this.ents.get(v.i);
      if (!e) {
        e = { ...v, px: v.x, py: v.y, rx: v.x, ry: v.y, def: this.defOf(v), vrt: (v.i * 7919) % 6 };
        e.v = e.vrt;
        this.ents.set(v.i, e);
      } else {
        e.px = e.rx; e.py = e.ry;
        Object.assign(e, v);
        if (!('q' in v)) e.q = undefined;
        if (!('p' in v)) e.p = 0;
        if (!('b' in v)) e.b = false;
        if (!('c' in v)) e.c = 0;
        if (!('rl' in v)) e.rl = undefined;
        e.def = this.defOf(v);
      }
      e.prog = e.p || 0;
      e.hp = e.h;
    }
    for (const id of [...this.ents.keys()]) if (!seen.has(id)) { this.ents.delete(id); this.sel.delete(id); }
    if (s.fog) {
      const n = this.map.w * this.map.h;
      const out = new Uint8Array(n);
      let i = 0;
      for (const part of s.fog.split(',')) {
        if (!part) continue;
        const st = part.charCodeAt(0) - 48, c = parseInt(part.slice(1), 10);
        out.fill(st, i, Math.min(n, i + c)); i += c;
      }
      this.fog = out; this.fogDirty = true;
    }
    for (const ev of s.ev || []) this.onEvent(ev);
    this.hudDirty = true;
  }

  defOf(v) {
    if (v.k === 0) return this.defs.units[v.t];
    if (v.k === 1) return this.defs.buildings[v.t];
    return this.defs.resources[v.t] || this.defs.resources.carcass;
  }

  onEvent(ev) {
    this.r.addEvent(ev, this.defs);
    const [sx, sy] = this.r.toScreen(ev.x, ev.y);
    const on = sx > -50 && sx < this.r.W + 50 && sy > -50 && sy < this.r.H + 50;
    const pan = clamp(sx / this.r.W * 2 - 1, -1, 1);
    const vol = on ? 1 : clamp(1 - Math.hypot(sx - this.r.W / 2, sy - this.r.H / 2) / 1500, 0, 0.5);
    const mine = ev.o === this.you;
    switch (ev.k) {
      case 'shot': {
        const p = ev.p;
        const s = p === 'arrow' || p === 'bolt' ? 'arrow' : p === 'stone' || p === 'boulder' || p === 'grenade' ? 'sling'
          : p === 'bullet' ? (this.ageOf(ev.o) < 11 ? 'musket' : 'bullet') : p === 'cannonball' || p === 'shell' ? 'cannon'
            : p === 'rocket' || p === 'missile' ? 'rocket' : p === 'plasma' ? 'plasma' : 'laser';
        sfx(s, pan, vol * 0.7);
        break;
      }
      case 'melee': sfx(ev.p && (ev.p.startsWith('worker') || this.defs.units[ev.p]?.class === 'animal') ? 'punch' : 'clash', pan, vol * 0.7); break;
      case 'work': sfx(ev.p === 'tree' ? 'chop' : ev.p === 'gold' || ev.p === 'stone' || ev.p === 'crystal' ? 'mine' : 'forage', pan, vol * 0.45); break;
      case 'hammer': sfx('hammer', pan, vol * 0.45); break;
      case 'death': sfx(this.defs.units[ev.p]?.class === 'animal' ? 'animal' : 'death', pan, vol * 0.6); break;
      case 'collapse': sfx('collapse', pan, vol); break;
      case 'boom': sfx('boom', pan, vol * 0.8); break;
      case 'built': if (mine) { sfx('built', pan, 0.8); } break;
      case 'trained': if (mine) sfx('trained', pan, 0.5); break;
      case 'tech': if (mine) { sfx('tech'); this.toast(`Researched ${this.defs.techs[ev.p]?.name || ev.p}`); } break;
      case 'age': if (mine) { sfx('age'); this.toast(`You have advanced to the ${this.defs.ages[ev.d].name}!`, 5000); } else this.toast(`${this.pname(ev.o)} advanced to the ${this.defs.ages[ev.d].name}`); break;
      case 'alert': if (mine) { sfx('alert'); this.toast('You are under attack!'); this.alertAt = { x: ev.x, y: ev.y }; this.alerts.push({ x: ev.x, y: ev.y, t: performance.now() / 1000 }); } break;
      case 'place': if (mine) sfx('place', pan, 0.6); break;
      case 'defeated': this.toast(`${this.pname(ev.o)} has been defeated.`, 5000); break;
    }
  }

  ageOf(o) { return o >= 0 && this.players[o] ? this.players[o].g : this.age; }
  pname(o) { return this.players[o] ? this.players[o].n : 'Someone'; }

  onEnd(m) {
    this.over = true;
    const me = m.results.find(r => r.player === this.you);
    const won = me && me.won;
    sfx(won ? 'victory' : 'defeat');
    const tbl = el('table', { class: 'results' },
      el('tr', {}, ...['Player', 'Score', 'Age', 'Kills', 'Lost', 'Gathered', 'Techs', ''].map(h => el('th', { text: h }))),
      ...m.results.map(r => el('tr', { class: r.player === this.you ? 'me' : '' },
        el('td', {}, el('span', { class: 'swatch', style: `background:${TEAM[r.player]}` }), ' ' + r.name),
        el('td', { text: r.score }), el('td', { text: this.defs.ages[r.age].name }), el('td', { text: r.kills }),
        el('td', { text: r.lost }), el('td', { text: r.gathered }), el('td', { text: r.techs }), el('td', { text: r.won ? '🏆' : '' }))));
    const box = el('div', { class: 'endbox panel' },
      el('h1', { text: won ? 'Victory!' : 'Defeat' }),
      el('p', { text: won ? 'Your people will remember this day.' : 'Your civilisation has fallen.' }),
      tbl,
      el('button', { class: 'btn', text: 'Return to Menu', onclick: () => this.app.leaveGame() }));
    $('#overlay').replaceChildren(box);
    $('#overlay').classList.remove('hidden');
  }

  send(cmd) { if (!this.spectator) this.app.sendCmd(cmd); }

  // --------------------------------------------------------- HUD
  buildHUD() {
    const bar = $('#resbar');
    bar.replaceChildren();
    this.resEls = [];
    for (let i = 0; i < 6; i++) {
      const c = el('canvas', { width: 40, height: 40, class: 'ricon' });
      const ctx = c.getContext('2d'); ctx.scale(2, 2); resIcon(ctx, i, 10, 10, 18);
      const v = el('span', { class: 'rval', text: '0' });
      const item = el('div', { class: 'res', title: i < 5 ? RES_SHORT[i] : 'Population' }, c, v);
      if (i === 4) item.classList.add('energy');
      this.resEls.push({ item, v });
      bar.append(item);
    }
    this.ageEl = el('div', { class: 'agename' });
    this.timeEl = el('div', { class: 'clock' });
    bar.append(this.ageEl, this.timeEl);
    this.scoreEl = $('#pscores');
    this.selEl = $('#selinfo');
    this.cmdEl = $('#commands');
    this.tip = $('#tooltip');
    this.chatLog = $('#gamechat');
    this.chatIn = $('#chatinput');
    this.chatCh = 'room';
    $('#overlay').classList.add('hidden');
    this.root.classList.remove('hidden');
    this.r.resize();
  }

  updateHUD() {
    const vals = [...this.res.map(v => v), `${this.pop || 0}/${this.cap || 0}`];
    vals.forEach((v, i) => { this.resEls[i].v.textContent = v; });
    this.resEls[4].item.style.display = this.age >= 10 || this.res[4] > 0 ? '' : 'none';
    this.resEls[5].item.classList.toggle('warn', (this.cap || 0) - (this.pop || 0) <= 2);
    const a = this.defs.ages[this.age];
    this.ageEl.textContent = `${romanNum(this.age + 1)}. ${a.name}`;
    this.ageEl.title = `${a.years} — ${a.desc}`;
    if (this.snap) this.timeEl.textContent = fmtTime(this.snap.time);
    if (this.players) {
      this.scoreEl.replaceChildren(...this.players.map(p => el('div', { class: 'srow' + (p.d ? ' dead' : '') },
        el('span', { class: 'swatch', style: `background:${TEAM[p.c]}` }), ` ${p.n} `, el('b', { text: p.s }), ` · ${romanNum(p.g + 1)}`)));
    }
    this.updateSelection();
  }

  selected() { return [...this.sel].map(id => this.ents.get(id)).filter(Boolean); }

  updateSelection() {
    const s = this.selected();
    const key = s.map(e => e.i + ':' + (e.q ? e.q.length : 0) + ':' + (e.p > 0 ? 1 : 0)).join(',') + '|' + this.menuPage + '|' + this.age + '|' + (this.techs ? this.techs.size : 0);
    // info panel (cheap) every update
    if (s.length === 0) { this.selEl.replaceChildren(el('div', { class: 'hint', text: 'Select units with left click or drag. Right-click to command.' })); }
    else if (s.length === 1) this.selEl.replaceChildren(this.infoOne(s[0]));
    else {
      const wrap = el('div', { class: 'multi' });
      for (const e of s.slice(0, 40)) {
        const ic = iconCanvas('unit', e.t, e.def, e.def.era, e.o, this.map.theme, 30);
        ic.className = 'mini-ic'; ic.title = e.def.name;
        const hb = el('div', { class: 'hpbar' }, el('div', { style: `width:${Math.round(e.hp * 100)}%` }));
        wrap.append(el('div', { class: 'mcell', onclick: () => { this.sel = new Set([e.i]); this.hudDirty = true; } }, ic, hb));
      }
      this.selEl.replaceChildren(wrap);
    }
    if (key === this.cmdKey && !this.menuDirty) return;
    this.cmdKey = key; this.menuDirty = false;
    this.cmdEl.replaceChildren(...this.commandButtons(s));
  }

  infoOne(e) {
    const d = e.def;
    let kind = e.k === 0 ? 'unit' : e.k === 1 ? 'building' : 'resource';
    const era = e.k === 1 ? this.defs.ages[e.g || 0].era : d.era;
    const ic = iconCanvas(kind, e.t, d, era, e.o, this.map.theme, 64);
    ic.className = 'portrait';
    const name = e.k === 1 ? (this.defs.buildingNames[e.t][era] || d.name) : d.name;
    const owner = e.o >= 0 ? this.pname(e.o) : e.k === 2 ? 'Resource' : 'Wild animal';
    const lines = [];
    if (e.k !== 2) {
      const max = e.m || Math.round((d.hp || 1));
      lines.push(el('div', { class: 'hpbar big' }, el('div', { style: `width:${Math.round(e.hp * 100)}%` }), el('span', { text: `${Math.round(e.hp * max)}/${max}` })));
    }
    if (e.k === 0 && d.attack) lines.push(el('div', { class: 'stat', text: `⚔ ${d.attack}  ⛨ ${Math.round((d.armor || 0) * 100)}%  ➶ ${d.range}` }));
    if (e.k === 0 && e.c > 0) lines.push(el('div', { class: 'stat', text: `Carrying ${e.c} ${RES_SHORT[e.r]}` }));
    if (e.k === 2) lines.push(el('div', { class: 'stat', text: `${e.a} ${RES_SHORT[d.res]} left` }));
    if (e.k === 1 && e.t === 'farm' && e.a) lines.push(el('div', { class: 'stat', text: `${e.a} food left` }));
    if (e.k === 1 && e.p > 0) lines.push(el('div', { class: 'stat', text: `Under construction: ${Math.round(e.p * 100)}%` }));
    if (e.k === 1 && e.q && e.q.length) {
      const qd = el('div', { class: 'queue' });
      e.q.forEach((q, i) => {
        const c = q.u ? iconCanvas('unit', q.u, this.defs.units[q.u], this.defs.units[q.u].era, e.o, this.map.theme, 30) : techIcon(q.a ? 'age' : this.defs.techs[q.t]?.kind, q.a ? this.age + 2 : 0, 30);
        c.className = 'qitem'; c.title = 'Click to cancel';
        const cell = el('div', { class: 'qcell', onclick: () => { this.send({ c: 'cancel', t: e.i, i }); sfx('click'); } }, c);
        if (i === 0) cell.append(el('div', { class: 'qprog' }, el('div', { style: `width:${Math.round(q.p * 100)}%` })));
        qd.append(cell);
      });
      lines.push(qd);
    }
    return el('div', { class: 'one' }, ic, el('div', { class: 'meta' }, el('div', { class: 'name', text: name }), el('div', { class: 'owner', style: e.o >= 0 ? `color:${TEAM[e.o]}` : '', text: owner }), ...lines));
  }

  costText(c) {
    return c.map((v, i) => v > 0 ? `${v} ${RES_SHORT[i]}` : null).filter(Boolean).join(', ') || 'Free';
  }

  canAfford(c) { return c.every((v, i) => this.res[i] >= v); }

  button(icon, title, tipLines, onclick, opts = {}) {
    const b = el('button', { class: 'cmd' + (opts.disabled ? ' disabled' : '') + (opts.poor ? ' poor' : '') }, icon);
    if (opts.key) b.append(el('span', { class: 'hk', text: opts.key.toUpperCase() }));
    b.addEventListener('click', (ev) => { ev.stopPropagation(); if (opts.disabled) { sfx('error'); return; } sfx('click'); onclick(ev); });
    b.addEventListener('mouseenter', () => this.showTip(title, tipLines, b));
    b.addEventListener('mouseleave', () => this.tip.classList.add('hidden'));
    b.dataset.key = opts.key || '';
    return b;
  }

  showTip(title, lines, anchor) {
    this.tip.replaceChildren(el('b', { text: title }), ...lines.map(l => el('div', { text: l })));
    this.tip.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    this.tip.style.left = Math.max(8, Math.min(window.innerWidth - 280, r.left - 100)) + 'px';
    this.tip.style.top = (r.top - this.tip.offsetHeight - 8) + 'px';
  }

  buildCost(id) {
    const d = this.defs.buildings[id];
    const f = id === 'house' ? 1 + 0.05 * this.age : 1 + 0.12 * this.age;
    const c = d.cost.map(v => Math.round(v * f));
    if (this.age < 2) { c[0] += c[3]; c[3] = 0; }
    return c;
  }

  commandButtons(s) {
    const own = s.filter(e => e.o === this.you);
    const out = [];
    let k = 0;
    const key = () => KEYS[k++];
    if (own.length === 0) return out;
    const workers = own.filter(e => e.k === 0 && e.def.class === 'worker');
    const units = own.filter(e => e.k === 0);
    if (workers.length && workers.length === units.length) {
      if (this.menuPage === 'main') {
        out.push(this.button(cmdIcon('build'), 'Build Economy', ['Houses, drop-off camps, farms, town centres'], () => { this.menuPage = 'eco'; this.menuDirty = true; }, { key: key() }));
        out.push(this.button(cmdIcon('military'), 'Build Military', ['Barracks, ranges, stables, workshops, academies, towers'], () => { this.menuPage = 'mil'; this.menuDirty = true; }, { key: key() }));
      } else {
        const list = this.menuPage === 'eco' ? ECO : MIL;
        for (const id of list) {
          const d = this.defs.buildings[id];
          if (d.age > this.map.maxAge) continue;
          if (id === 'dock' && !this.map.naval) continue;
          const era = this.defs.ages[this.age].era;
          const name = this.defs.buildingNames[id][era] || d.name;
          const locked = d.age > this.age;
          const cost = this.buildCost(id);
          const ic = iconCanvas('building', id, d, era, this.you, this.map.theme, 44);
          out.push(this.button(ic, name, [locked ? `Requires ${this.defs.ages[d.age].name}` : `Cost: ${this.costText(cost)}`, d.desc], () => this.startPlacing(id), { key: key(), disabled: locked, poor: !this.canAfford(cost) }));
        }
        out.push(this.button(cmdIcon('back'), 'Back', [''], () => { this.menuPage = 'main'; this.menuDirty = true; }, { key: 'escape' }));
        return out;
      }
    }
    if (units.length) {
      out.push(this.button(cmdIcon('amove'), 'Attack Move', ['Move and engage enemies on the way (A + click)'], () => { this.amoveMode = true; this.toast('Click a destination to attack-move'); }, { key: 'a' }));
      out.push(this.button(cmdIcon('stop'), 'Stop', ['Halt current orders (S)'], () => this.send({ c: 'stop', ids: units.map(u => u.i) }), { key: 's' }));
      if (workers.length) out.push(this.button(cmdIcon('repair'), 'Repair', ['Right-click a damaged building with workers selected'], () => {}, {}));
      out.push(this.button(cmdIcon('delete'), 'Delete', ['Remove the selected units (Del)'], () => this.send({ c: 'delete', ids: units.map(u => u.i) }), { key: 'delete' }));
      return out;
    }
    const b = own.find(e => e.k === 1);
    if (!b) return out;
    if (b.p > 0) {
      out.push(this.button(cmdIcon('delete'), 'Cancel Construction', ['Refunds 75% of the cost'], () => this.send({ c: 'cancel', t: b.i, i: 0 }), { key: 'escape' }));
      return out;
    }
    for (const cls of b.def.trains || []) {
      const uid = bestUnit(this.defs, cls, this.age);
      if (!uid) continue;
      const u = this.defs.units[uid];
      const ic = iconCanvas('unit', uid, u, u.era, this.you, this.map.theme, 44);
      out.push(this.button(ic, `Train ${u.name}`, [`Cost: ${this.costText(u.cost)}`, `HP ${u.hp} · Attack ${u.attack} · Range ${u.range} · Pop ${u.pop}`, u.desc, 'Shift-click: train 5'],
        (ev) => this.send({ c: 'train', t: b.i, w: cls, i: ev.shiftKey ? 5 : 1 }), { key: key(), poor: !this.canAfford(u.cost) }));
    }
    if (b.t === 'town_center' && this.age < this.map.maxAge) {
      const next = this.defs.ages[this.age + 1];
      const queued = b.q && b.q.some(q => q.a);
      out.push(this.button(techIcon('age', this.age + 2), `Advance to ${next.name}`, [`Cost: ${this.costText(next.advanceCost)}`, `${next.years} — ${next.desc}`], () => this.send({ c: 'research', t: b.i, w: 'age' }), { key: key(), disabled: queued, poor: !this.canAfford(next.advanceCost) }));
    }
    if (b.def.research) {
      const ids = Object.values(this.defs.techs).filter(t => t.age <= this.age && !this.techs.has(t.id) && !(b.q || []).some(q => q.t === t.id)
        && (!t.mapTypes || t.mapTypes.includes(this.map.mapType)))
        .sort((a, c) => a.age - c.age || a.kind.localeCompare(c.kind));
      const seenKind = new Set();
      for (const t of ids) {
        if (seenKind.has(t.kind)) continue; // show next tech of each kind
        seenKind.add(t.kind);
        out.push(this.button(techIcon(t.kind, t.age), t.name, [`Cost: ${this.costText(t.cost)}`, t.desc, `Requires ${this.defs.ages[t.age].name}`], () => this.send({ c: 'research', t: b.i, w: t.id }), { key: key(), poor: !this.canAfford(t.cost) }));
      }
    }
    out.push(this.button(cmdIcon('delete'), 'Delete Building', ['Destroys this building'], () => { if (confirm('Delete this building?')) this.send({ c: 'delete', ids: [b.i] }); }, { key: 'delete' }));
    return out;
  }

  startPlacing(id) {
    const d = this.defs.buildings[id];
    if (!this.canAfford(this.buildCost(id))) { sfx('error'); this.toast('Not enough resources'); }
    this.placing = { type: id, size: d.size };
  }

  placementOK(tx, ty, size, type) {
    const { w, h } = this.map;
    if (tx < 0 || ty < 0 || tx + size > w || ty + size > h) return false;
    if (type === 'dock') {
      let water = 0;
      for (let y = ty - 1; y <= ty + size; y++) for (let x = tx - 1; x <= tx + size; x++) {
        const edge = x === tx - 1 || x === tx + size || y === ty - 1 || y === ty + size;
        if (edge && x >= 0 && y >= 0 && x < w && y < h && this.r.tiles[y * w + x] === 3) water++;
      }
      if (water < 2) return false;
    }
    for (let y = ty; y < ty + size; y++) for (let x = tx; x < tx + size; x++) {
      const t = this.r.tiles[y * w + x];
      if (t === 3 || t === 4 || t === 5) return false;
      if (this.fog && this.fog[y * w + x] === 0) return false;
    }
    for (const e of this.ents.values()) {
      if (e.k === 1) {
        const s = e.def.size, x0 = Math.round(e.x - s / 2), y0 = Math.round(e.y - s / 2);
        if (tx < x0 + s && tx + size > x0 && ty < y0 + s && ty + size > y0) return false;
      } else if (e.k === 2 && e.t !== 'carcass') {
        const x = Math.floor(e.x), y = Math.floor(e.y);
        if (x >= tx && x < tx + size && y >= ty && y < ty + size) return false;
      }
    }
    return true;
  }

  toast(msg, ms = 3000) {
    const t = el('div', { class: 'toast', text: msg });
    $('#toasts').append(t);
    setTimeout(() => t.classList.add('fade'), ms - 500);
    setTimeout(() => t.remove(), ms);
    while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
  }

  chat(m) {
    const line = el('div', { class: 'cline ' + m.ch },
      el('span', { class: 'cfrom', text: (m.ch === 'team' ? '[Team] ' : m.ch === 'whisper' ? '[Whisper] ' : m.ch === 'global' ? '[Global] ' : '') + m.from + ': ' }),
      el('span', { text: m.text }));
    this.chatLog.append(line);
    while (this.chatLog.children.length > 8) this.chatLog.firstChild.remove();
    setTimeout(() => line.classList.add('fade'), 15000);
    if (m.from !== this.app.me.name) sfx('chat');
  }

  // --------------------------------------------------------- input
  bind() {
    this.handlers = [];
    const on = (t, ev, f, o) => { t.addEventListener(ev, f, o); this.handlers.push([t, ev, f]); };
    on(window, 'resize', () => this.r.resize());
    on(this.cv, 'contextmenu', (e) => e.preventDefault());
    on(this.cv, 'mousedown', (e) => this.mouseDown(e));
    on(window, 'mousemove', (e) => this.mouseMove(e));
    on(window, 'mouseup', (e) => this.mouseUp(e));
    on(this.cv, 'dblclick', (e) => this.dblClick(e));
    on(this.cv, 'wheel', (e) => { e.preventDefault(); this.r.setZoom(this.r.zoom * (e.deltaY < 0 ? 1.1 : 0.9), e.offsetX, e.offsetY); }, { passive: false });
    on(this.cv, 'mouseleave', () => { this.mouse.in = false; });
    on(window, 'keydown', (e) => this.keyDown(e));
    on(window, 'keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    on(this.mini, 'mousedown', (e) => this.miniClick(e));
    on(this.mini, 'contextmenu', (e) => e.preventDefault());
    on(this.chatIn, 'keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = this.chatIn.value.trim();
        if (text) this.net.send({ t: 'chat', ch: this.chatCh, text });
        this.chatIn.value = ''; this.chatIn.blur(); $('#chatbox').classList.remove('open');
      } else if (e.key === 'Escape') { this.chatIn.blur(); $('#chatbox').classList.remove('open'); }
      else if (e.key === 'Tab') { e.preventDefault(); this.chatCh = this.chatCh === 'room' ? 'team' : this.chatCh === 'team' ? 'global' : 'room'; $('#chatch').textContent = { room: 'All', team: 'Team', global: 'Global' }[this.chatCh]; }
    });
    on($('#menubtn'), 'click', () => this.gameMenu());
  }

  gameMenu() {
    const box = el('div', { class: 'panel menu-box' },
      el('h2', { text: 'Game Menu' }),
      el('button', { class: 'btn', text: 'Resume', onclick: () => $('#overlay').classList.add('hidden') }),
      this.app.me && !this.app.me.guest ? el('button', { class: 'btn', text: 'Save Game', onclick: () => {
        const name = prompt('Name this saved game:', `${this.level.name} — ${fmtTime(this.snap ? this.snap.time : 0)}`);
        if (name !== null) { this.net.send({ t: 'save', name }); $('#overlay').classList.add('hidden'); }
      } }) : null,
      el('button', { class: 'btn', text: 'Settings', onclick: () => this.app.showSettings() }),
      el('button', { class: 'btn danger', text: 'Resign', onclick: () => { if (confirm('Resign this game?')) { this.send({ c: 'resign' }); $('#overlay').classList.add('hidden'); } } }),
      el('button', { class: 'btn', text: 'Leave to Menu', onclick: () => this.app.leaveGame() }),
      el('p', { class: 'keys', text: 'Keys: drag = select · right-click = command · A = attack-move · S = stop · H = town centre · . = idle worker · Ctrl+1-9 = groups · Enter = chat (Tab switches channel) · wheel = zoom · arrow keys or screen edge = scroll' }));
    $('#overlay').replaceChildren(box);
    $('#overlay').classList.remove('hidden');
  }

  pick(sx, sy) {
    const [wx, wy] = this.r.toWorld(sx, sy);
    let best = null, bd = 1e9;
    for (const e of this.ents.values()) {
      let d;
      if (e.k === 1) {
        const s = e.def.size / 2;
        if (Math.abs(wx - e.x) <= s && Math.abs(wy - e.y) <= s) d = 0.5;
        else {
          // allow clicking on the tall part of the sprite
          const [ex, ey] = this.r.toScreen(e.x, e.y, 0.8);
          const r = 18 * e.def.size * this.r.zoom;
          if (Math.hypot(sx - ex, sy - ey) < r) d = 0.8; else continue;
        }
      } else {
        const z = e.def && e.def.flying ? 1.3 : e.k === 2 && e.t === 'tree' ? 0.9 : 0.4;
        const [ex, ey] = this.r.toScreen(e.x, e.y, z);
        d = Math.hypot(sx - ex, sy - ey) / (this.r.zoom * 16);
        if (d > 1.2) continue;
        if (e.k === 0) d -= 0.4; // prefer units
      }
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  mouseDown(e) {
    const x = e.offsetX, y = e.offsetY;
    if (e.button === 0) {
      if (this.placing) { this.placeAt(x, y, e.shiftKey); return; }
      if (this.amoveMode) {
        const [wx, wy] = this.r.toWorld(x, y);
        const ids = this.selected().filter(u => u.o === this.you && u.k === 0).map(u => u.i);
        if (ids.length) { this.send({ c: 'amove', ids, x: wx, y: wy }); sfx('ack'); this.marker = { x: wx, y: wy, t: this.r.time, c: '#ff7a5a' }; }
        this.amoveMode = false;
        return;
      }
      this.drag = { x0: x, y0: y, x1: x, y1: y, shift: e.shiftKey };
    } else if (e.button === 2) {
      if (this.placing || this.amoveMode) { this.placing = null; this.amoveMode = false; return; }
      this.rightClick(x, y, e.shiftKey);
    }
  }

  mouseMove(e) {
    const r = this.cv.getBoundingClientRect();
    this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top;
    this.mouse.in = e.target === this.cv;
    if (this.drag) { this.drag.x1 = this.mouse.x; this.drag.y1 = this.mouse.y; }
  }

  mouseUp(e) {
    if (e.button !== 0 || !this.drag) return;
    const d = this.drag; this.drag = null;
    const add = d.shift;
    if (!add) this.sel.clear();
    if (Math.abs(d.x1 - d.x0) < 5 && Math.abs(d.y1 - d.y0) < 5) {
      const t = this.pick(d.x0, d.y0);
      if (t) { if (add && this.sel.has(t.i)) this.sel.delete(t.i); else this.sel.add(t.i); this.selectSound(t); }
    } else {
      const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
      let any = null;
      for (const en of this.ents.values()) {
        if (en.k !== 0 || en.o !== this.you) continue;
        const [sx, sy] = this.r.toScreen(en.x, en.y, 0.3);
        if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) { this.sel.add(en.i); any = en; }
      }
      if (any) this.selectSound(any);
    }
    this.menuPage = 'main';
    this.hudDirty = true;
  }

  selectSound(e) {
    if (e.o !== this.you) return;
    sfx(e.k === 0 && e.def.class !== 'worker' ? 'selectMil' : 'select');
  }

  dblClick(e) {
    const t = this.pick(e.offsetX, e.offsetY);
    if (!t || t.o !== this.you || t.k !== 0) return;
    for (const en of this.ents.values()) {
      if (en.o !== this.you || en.t !== t.t) continue;
      const [sx, sy] = this.r.toScreen(en.x, en.y);
      if (sx >= 0 && sy >= 0 && sx <= this.r.W && sy <= this.r.H) this.sel.add(en.i);
    }
    this.hudDirty = true;
  }

  rightClick(x, y, shift) {
    const own = this.selected().filter(e => e.o === this.you);
    const [wx, wy] = this.r.toWorld(x, y);
    const blds = own.filter(e => e.k === 1);
    const units = own.filter(e => e.k === 0);
    if (!units.length && blds.length) {
      for (const b of blds) this.send({ c: 'rally', t: b.i, x: wx, y: wy });
      this.marker = { x: wx, y: wy, t: this.r.time };
      sfx('ack');
      return;
    }
    if (!units.length) return;
    const t = this.pick(x, y);
    const ids = units.map(u => u.i);
    if (t) {
      this.send({ c: 'smart', ids, t: t.i, x: wx, y: wy });
      this.marker = { x: t.x, y: t.y, t: this.r.time, c: t.o >= 0 && t.o !== this.you && !this.allied(t.o) ? '#ff5a4a' : '#ffe27a' };
    } else {
      this.send({ c: 'move', ids, x: wx, y: wy });
      this.marker = { x: wx, y: wy, t: this.r.time };
    }
    sfx('ack');
  }

  allied(o) { const a = this.players[o], b = this.players[this.you]; return a && b && a.t === b.t; }

  placeAt(x, y, keep) {
    const [wx, wy] = this.r.toWorld(x, y);
    const p = this.placing;
    const tx = Math.floor(wx - p.size / 2 + 0.5), ty = Math.floor(wy - p.size / 2 + 0.5);
    const ids = this.selected().filter(e => e.o === this.you && e.k === 0 && e.def.class === 'worker').map(e => e.i);
    if (!this.placementOK(tx, ty, p.size, p.type)) { sfx('error'); this.toast('Cannot build there'); return; }
    this.send({ c: 'build', ids, x: tx, y: ty, w: p.type });
    if (!keep) this.placing = null;
  }

  miniClick(e) {
    e.preventDefault();
    const S = this.mini.width;
    const rect = this.mini.getBoundingClientRect();
    const px = (e.clientX - rect.left) * S / rect.width, py = (e.clientY - rect.top) * S / rect.height;
    const [wx, wy] = this.r.miniToWorld(px, py, S);
    if (e.button === 2) {
      const ids = this.selected().filter(u => u.o === this.you && u.k === 0).map(u => u.i);
      if (ids.length) { this.send({ c: 'move', ids, x: wx, y: wy }); sfx('ack'); }
    } else {
      this.r.centerOn(wx, wy);
      const move = (ev) => { const qx = (ev.clientX - rect.left) * S / rect.width, qy = (ev.clientY - rect.top) * S / rect.height; this.r.centerOn(...this.r.miniToWorld(qx, qy, S)); };
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    }
  }

  keyDown(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (k === 'enter') { $('#chatbox').classList.add('open'); this.chatIn.focus(); e.preventDefault(); return; }
    if (k === 'escape') {
      if (this.placing || this.amoveMode) { this.placing = null; this.amoveMode = false; return; }
      if (this.menuPage !== 'main') { this.menuPage = 'main'; this.menuDirty = true; return; }
      if (!$('#overlay').classList.contains('hidden') && !this.over) { $('#overlay').classList.add('hidden'); return; }
      this.sel.clear(); this.hudDirty = true; return;
    }
    if (k === 'f10') { e.preventDefault(); this.gameMenu(); return; }
    if (/^[1-9]$/.test(k)) {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.groups[k] = [...this.sel]; this.toast(`Group ${k} set`); return; }
      const g = (this.groups[k] || []).filter(id => this.ents.has(id));
      if (g.length) {
        const now = performance.now();
        if (this.lastGroup === k && now - this.lastGroupT < 400) { const e0 = this.ents.get(g[0]); this.r.centerOn(e0.x, e0.y); }
        this.lastGroup = k; this.lastGroupT = now;
        this.sel = new Set(g); this.hudDirty = true;
      }
      return;
    }
    if (k === 'h') { const tc = [...this.ents.values()].find(x => x.o === this.you && x.t === 'town_center'); if (tc) { this.sel = new Set([tc.i]); this.r.centerOn(tc.x, tc.y); this.hudDirty = true; } return; }
    if (k === '.') {
      const idle = [...this.ents.values()].filter(x => x.o === this.you && x.k === 0 && x.def.class === 'worker' && x.s === 0);
      if (idle.length) { this.idleIdx = ((this.idleIdx || 0) + 1) % idle.length; const w = idle[this.idleIdx]; this.sel = new Set([w.i]); this.r.centerOn(w.x, w.y); this.hudDirty = true; }
      else this.toast('No idle workers');
      return;
    }
    // command hotkeys
    for (const b of this.cmdEl.querySelectorAll('button.cmd')) {
      if (b.dataset.key && b.dataset.key === k) { b.click(); e.preventDefault(); return; }
    }
  }

  // --------------------------------------------------------- frame
  // In demo mode the camera drifts to where the action is.
  autoCamera(ts) {
    if (ts > this.nextPan) {
      this.nextPan = ts + 9000;
      const busy = [...this.ents.values()].filter(e => e.k === 0 && e.o >= 0 && (e.b || e.s === 3 || e.s === 2));
      const pool = busy.length ? busy : [...this.ents.values()].filter(e => e.k === 1);
      if (pool.length) { const e = pool[Math.floor(Math.random() * pool.length)]; this.camTarget = [e.x, e.y]; }
    }
    if (this.camTarget) {
      const [tx, ty] = iso(this.camTarget[0], this.camTarget[1]);
      this.r.camX += (tx - this.r.camX) * 0.02; this.r.camY += (ty - this.r.camY) * 0.02;
    }
  }

  frame(ts) {
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (ts - this.lastFrame) / 1000);
    this.lastFrame = ts;
    // camera scrolling
    const sp = 900 * dt;
    let dx = 0, dy = 0;
    if (this.keys.has('arrowleft')) dx -= sp;
    if (this.keys.has('arrowright')) dx += sp;
    if (this.keys.has('arrowup')) dy -= sp;
    if (this.keys.has('arrowdown')) dy += sp;
    if (this.mouse.in && !this.drag) {
      if (this.mouse.x < 8) dx -= sp; if (this.mouse.x > this.r.W - 8) dx += sp;
      if (this.mouse.y < 8) dy -= sp; if (this.mouse.y > this.r.H - 8) dy += sp;
    }
    if (dx || dy) this.r.pan(dx, dy);
    if (this.spectator) this.autoCamera(ts);
    // interpolate
    const a = clamp((performance.now() - this.snapT) / 100, 0, 1);
    const list = [];
    for (const e of this.ents.values()) {
      e.rx = lerp(e.px, e.x, a); e.ry = lerp(e.py, e.y, a);
      e.moving = e.k === 0 && Math.hypot(e.x - e.px, e.y - e.py) > 0.005;
      list.push({ ...e, x: e.rx, y: e.ry, prog: e.p || 0, hp: e.h, v: e.vrt });
    }
    let ghost = null;
    if (this.placing && this.mouse.in) {
      const [wx, wy] = this.r.toWorld(this.mouse.x, this.mouse.y);
      const p = this.placing;
      const tx = Math.floor(wx - p.size / 2 + 0.5), ty = Math.floor(wy - p.size / 2 + 0.5);
      ghost = { type: p.type, size: p.size, x: tx, y: ty, ok: this.placementOK(tx, ty, p.size, p.type), era: this.defs.ages[this.age].era };
    }
    let rally = null;
    if (this.sel.size === 1) { const b = this.ents.get([...this.sel][0]); if (b && b.rl) rally = b.rl; }
    const F = { ents: list, fog: this.fog, fogDirty: this.fogDirty, sel: this.sel, you: this.you, ghost, rally, marker: this.marker,
      box: this.drag && (Math.abs(this.drag.x1 - this.drag.x0) > 4 || Math.abs(this.drag.y1 - this.drag.y0) > 4) ? this.drag : null };
    this.r.draw(F, dt);
    this.fogDirty = F.fogDirty;
    this.miniT = (this.miniT || 0) + dt;
    if (this.miniT > 0.25) { this.miniT = 0; this.alerts = this.alerts.filter(a => performance.now() / 1000 - a.t < 6); this.r.minimap(this.mini, list, this.fog, this.you, this.alerts); }
    if (this.hudDirty) { this.hudDirty = false; this.updateHUD(); }
    this.cv.style.cursor = this.placing ? 'copy' : this.amoveMode ? 'crosshair' : 'default';
  }
}

export function bestUnit(defs, cls, age) {
  const line = defs.unitLine[cls] || [];
  for (let a = Math.min(age, line.length - 1); a >= 0; a--) if (line[a]) return line[a];
  return '';
}

export function objectiveText(o, defs, maxAge) {
  if (!o) return '';
  switch (o.type) {
    case 'survive': return `Survive for ${o.minutes} minutes`;
    case 'advance': return `Be the first to reach the ${defs.ages[maxAge].name}`;
    default: return 'Destroy all enemies';
  }
}
