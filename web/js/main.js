// Application shell: authentication, menus, lobby, rooms and chat.
import { el, $, $$, api, TEAM, TEAM_NAMES } from './util.js';
import { Net } from './net.js';
import { GameClient, objectiveText } from './game.js';
import { Renderer } from './render.js';
import { initAudio, sfx, playMusic, stopMusic, audioSettings, saveAudio } from './audio.js';
import { romanNum } from './sprites.js';

const THEMES = ['temperate', 'desert', 'winter', 'tropical', 'moon', 'mars', 'space'];

class App {
  constructor() {
    this.me = null;
    this.defs = null;
    this.levels = null;
    this.game = null;
    this.room = null;
    this.net = new Net((m) => this.onMsg(m), (s) => this.onNetState(s));
    this.bindUI();
    this.backdrop();
    this.boot();
  }

  async boot() {
    try { this.defs = await api('/api/defs'); } catch (e) { $('#autherr').textContent = 'Server unavailable'; }
    try { this.me = await api('/api/me'); } catch (e) { this.me = null; }
    if (this.me) this.loggedIn(); else this.show('login');
  }

  show(id) {
    for (const s of $$('.screen')) s.classList.toggle('hidden', s.id !== id);
    $('#logo').classList.toggle('small', id !== 'login' && id !== 'menu');
    this.screen = id;
    if (id === 'campaign') this.loadCampaign();
    if (id === 'halloffame') this.loadScores();
    if (id === 'lobby') this.loadLevelsInto($('#newlevel'));
    if (id === 'skirmish') this.loadSkirmish();
    if (id === 'settings') this.loadSettings();
  }

  bindUI() {
    let mode = 'signin';
    for (const t of $$('.tab')) t.addEventListener('click', () => {
      mode = t.dataset.tab;
      $$('.tab').forEach(x => x.classList.toggle('active', x === t));
      $('#pwrow').classList.toggle('hidden', mode === 'guest');
      $('#authbtn').textContent = { signin: 'Sign in', register: 'Create account', guest: 'Play as guest' }[mode];
      $('#authpw').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    });
    $('#authform').addEventListener('submit', async (e) => {
      e.preventDefault(); initAudio(); sfx('click');
      const name = $('#authname').value.trim(), password = $('#authpw').value;
      try {
        const path = mode === 'guest' ? '/api/guest' : mode === 'register' ? '/api/register' : '/api/login';
        this.me = await api(path, { method: 'POST', body: mode === 'guest' ? { name } : { name, password } });
        $('#autherr').textContent = '';
        this.loggedIn();
      } catch (err) { $('#autherr').textContent = err.message; sfx('error'); }
    });
    document.addEventListener('click', (e) => {
      const go = e.target.closest('[data-go]');
      if (go) { initAudio(); sfx('click'); this.show(go.dataset.go); }
    });
    $('#logout').addEventListener('click', async () => { await api('/api/logout', { method: 'POST', body: {} }).catch(() => {}); this.net.close(); this.me = null; this.show('login'); });
    $('#skgo').addEventListener('click', () => this.startSkirmish());
    $('#create').addEventListener('click', () => {
      const v = $('#newlevel').value;
      const msg = { t: 'create', name: $('#newname').value || `${this.me.name}'s battle` };
      if (v === 'skirmish:random') msg.skirmish = { theme: 'temperate', size: 80, startAge: 0, maxAge: 5, seed: Math.floor(Math.random() * 1e9), water: 0.3 };
      else msg.level = v;
      this.net.send(msg);
    });
    $('#lobbychatform').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('#lobbychatin').value.trim(); if (!v) return;
      const m = v.match(/^\/w\s+(\S+)\s+(.+)$/);
      if (m) this.net.send({ t: 'chat', ch: 'whisper', to: m[1], text: m[2] }); else this.net.send({ t: 'chat', ch: 'global', text: v });
      $('#lobbychatin').value = '';
    });
    $('#roomchatform').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('#roomchatin').value.trim(); if (!v) return;
      this.net.send({ t: 'chat', ch: $('#roomchatch').value, text: v });
      $('#roomchatin').value = '';
    });
    $('#startbtn').addEventListener('click', () => this.net.send({ t: 'start' }));
    $('#leaveroom').addEventListener('click', () => { this.net.send({ t: 'leave' }); this.room = null; this.show('lobby'); });
    $('#scorelevel').addEventListener('change', () => this.loadScores());
    $('#settingsback').addEventListener('click', () => { if (this.game) { $('#overlay').classList.add('hidden'); this.show('none'); $('#screens').classList.add('hidden'); } else this.show('menu'); });
    for (const id of ['vmaster', 'vsfx', 'vmusic']) $('#' + id).addEventListener('input', (e) => { audioSettings()[id.slice(1)] = e.target.value / 100; saveAudio(); });
    $('#vmute').addEventListener('change', (e) => { audioSettings().muted = e.target.checked; saveAudio(); });
    window.addEventListener('resize', () => { if (this.bg) this.bg.resize(); });
  }

  loggedIn() {
    this.net.connect();
    this.show('menu');
    this.renderWho();
    initAudio();
    playMusic('menu');
    const play = new URLSearchParams(location.search).get('play');
    if (play) { history.replaceState(null, '', '/'); this.net.send({ t: 'quick', level: play }); }
  }

  async renderWho() {
    const w = $('#whoami');
    let stats = '';
    try { const me = await api('/api/me'); if (me.stats) stats = `Games ${me.stats.games} · Wins ${me.stats.wins} · Best ${me.stats.bestScore} · Campaign ${me.stats.campaign}/17`; this.me = me; } catch (e) { /* ignore */ }
    w.replaceChildren(el('div', { class: 'name', text: `⚜ ${this.me.name}` }), el('div', { class: 'fine', text: this.me.guest ? 'Guest — register to keep your glory' : stats }));
  }

  onNetState(s) { this.connected = s === 'open'; }

  onMsg(m) {
    switch (m.t) {
      case 'hello': break;
      case 'lobby': this.renderLobby(m); break;
      case 'room': this.room = m; this.renderRoom(m); if (this.screen !== 'room' && !this.game) this.show('room'); break;
      case 'chat': this.chat(m); break;
      case 'start': this.startGame(m); break;
      case 'snap': if (this.game) this.game.onSnap(m.s); break;
      case 'end': if (this.game) this.game.onEnd(m); this.renderWho(); break;
      case 'error': this.notify(m.msg); break;
      case 'cmderr': if (this.game) { this.game.toast(prettyErr(m.msg)); sfx('error'); } break;
    }
  }

  notify(msg) {
    if (this.game) { this.game.toast(msg); return; }
    const t = el('div', { class: 'toast', text: msg });
    $('#menutoasts')?.remove();
    const box = el('div', { id: 'menutoasts' }, t);
    document.body.append(box);
    setTimeout(() => box.remove(), 3500);
    sfx('error');
  }

  chat(m) {
    if (this.game) this.game.chat(m);
    const log = m.ch === 'global' || m.ch === 'whisper' ? $('#lobbychat') : $('#roomchat');
    const line = el('div', { class: 'cline ' + m.ch }, el('span', { class: 'cts', text: new Date(m.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' }),
      el('span', { class: 'cfrom', text: (m.ch === 'whisper' ? `${m.from} → ${m.to}` : m.ch === 'team' ? `[Team] ${m.from}` : m.from) + ': ' }), el('span', { text: m.text }));
    log.append(line);
    while (log.children.length > 200) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  async loadLevels() {
    if (!this.levels) this.levels = await api('/api/levels');
    return this.levels;
  }

  async loadLevelsInto(sel) {
    this.levels = null;
    const lv = await this.loadLevels();
    sel.replaceChildren(el('option', { value: 'skirmish:random', text: 'Random map' }),
      el('optgroup', { label: 'Campaign maps' }, ...lv.campaign.map(l => el('option', { value: l.id, text: `${l.campaign}. ${l.name} (${this.defs.ages[l.startAge].name})` }))),
      el('optgroup', { label: 'Player-made maps' }, ...(lv.custom || []).map(l => el('option', { value: l.id, text: `${l.name} by ${l.author} (${l.maxPlayers}p)` }))));
  }

  async loadCampaign() {
    const lv = await this.loadLevels();
    const done = (this.me && this.me.stats && this.me.stats.campaign) || 0;
    const grid = $('#campgrid');
    grid.replaceChildren(...lv.campaign.map(l => {
      const a0 = this.defs.ages[l.startAge], a1 = this.defs.ages[l.maxAge];
      const card = el('button', { class: 'campcard theme-' + l.theme + (l.campaign <= done ? ' done' : '') },
        el('div', { class: 'num', text: romanNum(l.campaign) }),
        el('div', { class: 'title', text: l.name }),
        el('div', { class: 'ages', text: a0.name === a1.name ? a0.name : `${a0.name} → ${a1.name}` }),
        el('div', { class: 'desc', text: l.description }),
        el('div', { class: 'obj', text: `${objectiveText(l.objective, this.defs, l.maxAge)} · ${l.opponents} opponent${l.opponents > 1 ? 's' : ''} · ${l.difficulty}` }));
      card.addEventListener('click', () => { sfx('click'); this.net.send({ t: 'quick', level: l.id, diff: $('#campdiff').value }); });
      return card;
    }));
  }

  async loadSkirmish() {
    const lv = await this.loadLevels();
    const ages = this.defs.ages.map((a, i) => el('option', { value: i, text: `${romanNum(i + 1)}. ${a.name}` }));
    $('#skstart').replaceChildren(...ages.map(o => o.cloneNode(true)));
    $('#skmax').replaceChildren(...ages);
    $('#skmax').value = 4;
    $('#sktheme').replaceChildren(...THEMES.map(t => el('option', { value: t, text: t[0].toUpperCase() + t.slice(1) })));
    $('#skmap').replaceChildren(el('option', { value: 'random', text: 'Random map' }),
      ...lv.campaign.map(l => el('option', { value: l.id, text: `${l.name}` })), ...(lv.custom || []).map(l => el('option', { value: l.id, text: `${l.name} by ${l.author}` })));
  }

  startSkirmish() {
    initAudio(); sfx('click');
    const map = $('#skmap').value;
    const opp = +$('#skopp').value, diff = $('#skdiff').value;
    if (map !== 'random') { this.net.send({ t: 'quick', level: map, opp, diff }); return; }
    const start = +$('#skstart').value; let max = +$('#skmax').value; if (max < start) max = start;
    this.net.send({ t: 'quick', opp, diff, skirmish: { theme: $('#sktheme').value, size: +$('#sksize').value, startAge: start, maxAge: max, seed: Math.floor(Math.random() * 1e9), water: $('#skwater').value / 100 } });
  }

  renderLobby(m) {
    this.lobby = m;
    $('#roomlist').replaceChildren(...(m.rooms.length ? m.rooms.map(r => el('div', { class: 'roomrow' },
      el('div', {}, el('b', { text: r.name }), el('div', { class: 'fine', text: `${r.level} · host ${r.host}` })),
      el('div', { class: 'fine', text: `${r.players}/${r.max} · ${r.state}` }),
      r.state === 'lobby' && r.open > 0 ? el('button', { class: 'btn small', text: 'Join', onclick: () => this.net.send({ t: 'join', room: r.id }) }) : el('span', { text: '' })))
      : [el('div', { class: 'fine', text: 'No battles yet — create one!' })]));
    $('#onlinelist').replaceChildren(...m.online.map(n => el('div', { class: 'who', text: n, title: 'Click to whisper', onclick: () => { $('#lobbychatin').value = `/w ${n} `; $('#lobbychatin').focus(); } })));
  }

  renderRoom(r) {
    $('#roomtitle').textContent = r.name;
    $('#roomlevel').textContent = `${r.level.name} — ${this.defs.ages[r.level.startAge].name} to ${this.defs.ages[r.level.maxAge].name} · ${objectiveText(r.level.objective, this.defs, r.level.maxAge)}`;
    const host = r.host === this.me.name;
    $('#startbtn').classList.toggle('hidden', !host);
    $('#slots').replaceChildren(...r.slots.map((s, i) => {
      const team = el('select', { disabled: !(host || s.name === this.me.name) || s.kind === 'closed' ? '' : null },
        ...[1, 2, 3, 4, 5, 6, 7, 8].map(t => el('option', { value: t, text: `Team ${t}`, selected: s.team === t ? '' : null })));
      team.addEventListener('change', () => {
        if (s.name === this.me.name) this.net.send({ t: 'team', team: +team.value });
        else this.net.send({ t: 'slot', slot: i, kind: s.kind === 'human' ? 'open' : s.kind, team: +team.value, diff: s.diff });
      });
      const kind = el('select', { disabled: host && s.name !== this.me.name ? null : '' },
        ...[['open', 'Open'], ['ai', 'Computer'], ['closed', 'Closed']].map(([v, t]) => el('option', { value: v, text: t, selected: s.kind === v ? '' : null })),
        s.kind === 'human' ? el('option', { value: 'human', text: 'Player', selected: '' }) : null);
      kind.addEventListener('change', () => this.net.send({ t: 'slot', slot: i, kind: kind.value, team: s.team, diff: 'normal' }));
      let diff = null;
      if (s.kind === 'ai') {
        diff = el('select', { disabled: host ? null : '' }, ...['easy', 'normal', 'hard'].map(d => el('option', { value: d, text: d, selected: s.diff === d ? '' : null })));
        diff.addEventListener('change', () => this.net.send({ t: 'slot', slot: i, kind: 'ai', team: s.team, diff: diff.value }));
      }
      return el('tr', {}, el('td', {}, el('span', { class: 'swatch', style: `background:${TEAM[i]}` }), ` ${TEAM_NAMES[i]}`),
        el('td', { text: s.name || (s.kind === 'open' ? 'Waiting for player…' : '—') }), el('td', {}, team), el('td', {}, kind, diff));
    }));
  }

  startGame(m) {
    if (this.game) this.game.destroy();
    $('#screens').classList.add('hidden');
    $('#bg').classList.add('hidden');
    if (this.bgRaf) cancelAnimationFrame(this.bgRaf);
    this.game = new GameClient(this, m);
  }

  leaveGame() {
    this.net.send({ t: 'leave' });
    if (this.game) this.game.destroy();
    this.game = null; this.room = null;
    $('#overlay').classList.add('hidden');
    $('#screens').classList.remove('hidden');
    $('#bg').classList.remove('hidden');
    this.show('menu');
    playMusic('menu');
    this.renderWho();
    this.backdrop();
  }

  showSettings() {
    $('#overlay').classList.add('hidden');
    $('#screens').classList.remove('hidden');
    this.show('settings');
  }

  loadSettings() {
    const s = audioSettings();
    $('#vmaster').value = s.master * 100; $('#vsfx').value = s.sfx * 100; $('#vmusic').value = s.music * 100; $('#vmute').checked = s.muted;
  }

  async loadScores() {
    const lv = await this.loadLevels();
    const sel = $('#scorelevel');
    if (sel.options.length <= 1) for (const l of lv.campaign) sel.append(el('option', { value: l.id, text: `${l.campaign}. ${l.name}` }));
    const [leaders, scores] = await Promise.all([api('/api/leaderboard'), api('/api/scores?level=' + encodeURIComponent(sel.value))]);
    $('#leaders').replaceChildren(el('tr', {}, ...['Lord', 'Wins', 'Games', 'Best', 'Campaign'].map(h => el('th', { text: h }))),
      ...leaders.map(u => el('tr', {}, el('td', { text: u.name }), el('td', { text: u.wins }), el('td', { text: u.games }), el('td', { text: u.bestScore }), el('td', { text: `${u.campaign}/17` }))));
    $('#scoretable').replaceChildren(el('tr', {}, ...['Lord', 'Score', 'Level', 'Age', 'Result', 'Date'].map(h => el('th', { text: h }))),
      ...scores.map(s => el('tr', {}, el('td', { text: s.name }), el('td', { text: s.score }), el('td', { text: levelName(lv, s.level) }), el('td', { text: this.defs.ages[s.age].name }),
        el('td', { text: s.won ? 'Victory' : 'Defeat' }), el('td', { text: new Date(s.date).toLocaleDateString() }))));
  }

  // animated map behind the menus
  async backdrop() {
    const cv = $('#bgview');
    if (!this.bg) this.bg = new Renderer(cv);
    try {
      if (!this.bgMap) {
        const themes = ['temperate', 'tropical', 'winter', 'desert'];
        const lvl = await api('/api/generate', { method: 'POST', body: { theme: themes[Math.floor(Math.random() * themes.length)], size: 48, startAge: 0, maxAge: 0, seed: Math.floor(Math.random() * 1e6), water: 0.35, players: 2 } });
        this.bgMap = lvl;
        this.bg.setMap({ w: lvl.width, h: lvl.height, tiles: lvl.tiles, theme: lvl.theme });
        this.bgEnts = (lvl.objects || []).filter(o => this.defs.resources[o.k]).map((o, i) => ({ i, k: 2, t: o.k, o: -1, x: o.x + 0.5, y: o.y + 0.5, v: i % 6, hp: 1 }));
        this.bg.zoom = 1.1;
        this.bg.centerOn(lvl.width / 2, lvl.height / 2);
      }
    } catch (e) { return; }
    let last = performance.now(), t0 = last;
    const loop = (ts) => {
      this.bgRaf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
      const t = (ts - t0) / 1000;
      const w = this.bgMap.width;
      this.bg.centerOn(w / 2 + Math.cos(t * 0.03) * w * 0.25, w / 2 + Math.sin(t * 0.03) * w * 0.25);
      this.bg.draw({ ents: this.bgEnts, fastBuild: false }, dt);
    };
    if (this.bgRaf) cancelAnimationFrame(this.bgRaf);
    this.bgRaf = requestAnimationFrame(loop);
  }
}

function levelName(lv, id) {
  const l = lv.campaign.find(x => x.id === id) || (lv.custom || []).find(x => x.id === id);
  return l ? l.name : id === 'skirmish' ? 'Skirmish' : id;
}

function prettyErr(m) {
  return { 'not enough resources': 'Not enough resources', 'cannot build there': 'Cannot build there', 'queue full': 'Queue is full', 'not available in your age': 'Not available in your age' }[m] || m;
}

window.app = new App();
