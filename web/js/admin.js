// Administration page: players (approve, block, roles, MFA, passwords,
// delete, anti-cheat flags), running games, health/performance charts and
// the audit log. All actions go through the /api/admin REST API.
import { el, $, $$, api } from './util.js';

let me = null;
let users = [];
const history = [];

function err(msg) { $('#aerr').textContent = msg || ''; }

async function guard(fn) {
  try { err(''); await fn(); } catch (e) { err(e.message); }
}

async function init() {
  try { me = await api('/api/me'); } catch (e) { me = null; }
  if (!me || !me.admin) {
    $('#amain').replaceChildren(el('div', { class: 'panel' }, el('h2', { text: 'Administrators only' }),
      el('p', { text: me ? 'Your account is not an administrator.' : 'Please sign in with an administrator account first.' }),
      el('a', { class: 'btn', href: '/', text: 'Go to the game' })));
    return;
  }
  $('#whoami').textContent = `Signed in as ${me.name}`;
  for (const t of $$('.atabs .tab')) t.addEventListener('click', () => {
    $$('.atabs .tab').forEach(x => x.classList.toggle('active', x === t));
    $$('.apanel').forEach(p => p.classList.toggle('hidden', p.id !== 'tab-' + t.dataset.tab));
    load(t.dataset.tab);
  });
  $('#filter').addEventListener('input', renderUsers);
  $('#statusfilter').addEventListener('change', renderUsers);
  $('#createform').addEventListener('submit', (e) => {
    e.preventDefault();
    guard(async () => {
      await api('/api/admin/users', { method: 'POST', body: { name: $('#cname').value.trim(), password: $('#cpw').value, role: $('#crole').value, mfaRequired: $('#cmfa').checked, note: $('#cnote').value } });
      $('#createform').reset();
      await loadUsers();
    });
  });
  await loadUsers();
  setInterval(() => { if (!$('#tab-stats').classList.contains('hidden')) loadStats(); }, 3000);
  setInterval(() => { if (!$('#tab-rooms').classList.contains('hidden')) loadRooms(); }, 5000);
}

function load(tab) {
  if (tab === 'users') loadUsers();
  if (tab === 'rooms') loadRooms();
  if (tab === 'stats') loadStats();
  if (tab === 'audit') loadAudit();
}

async function loadUsers() {
  await guard(async () => {
    const r = await api('/api/admin/users');
    users = r.users;
    $('#regmode').textContent = `Registration: ${r.registration}`;
    renderUsers();
  });
}

const update = (name, body) => guard(async () => { await api(`/api/admin/users/${encodeURIComponent(name)}`, { method: 'PATCH', body }); await loadUsers(); });

function renderUsers() {
  const f = $('#filter').value.toLowerCase(), sf = $('#statusfilter').value;
  const rows = users.filter(u => u.name.toLowerCase().includes(f) && (!sf || (sf === 'flagged' ? (u.flags || []).length : u.status === sf)));
  $('#users').replaceChildren(el('tr', {}, ...['Player', 'Status', 'Role', 'MFA', 'Games', 'Last login', 'Anti-cheat', 'Note', 'Actions'].map(h => el('th', { text: h }))),
    ...rows.map(u => {
      const self = u.name === me.name;
      const acts = el('td', {});
      const b = (text, cls, fn, title) => acts.append(el('button', { class: 'btn small ' + (cls || ''), text, title, onclick: fn }));
      if (u.status === 'pending') b('Approve', 'primary', () => update(u.name, { status: 'active' }));
      if (u.status !== 'blocked' && !self) b('Block', 'danger', () => confirm(`Block ${u.name}?`) && update(u.name, { status: 'blocked' }));
      if (u.status === 'blocked') b('Unblock', '', () => update(u.name, { status: 'active' }));
      if (!self) b(u.role === 'admin' ? 'Make player' : 'Make admin', '', () => update(u.name, { role: u.role === 'admin' ? 'user' : 'admin' }));
      b(u.mfaRequired ? 'Unrequire MFA' : 'Force MFA', '', () => update(u.name, { mfaRequired: !u.mfaRequired }), 'Require an authenticator app at next sign-in');
      if (u.mfaEnabled) b('Reset MFA', '', () => confirm(`Remove ${u.name}'s authenticator? They must enrol again if MFA is required.`) && update(u.name, { resetMfa: true }));
      b('Password', '', () => {
        const pw = prompt(`New password for ${u.name} (they will be signed out):`);
        if (pw) guard(async () => { await api(`/api/admin/users/${encodeURIComponent(u.name)}/password`, { method: 'POST', body: { password: pw } }); });
      });
      b('Note', '', () => { const n = prompt('Admin note', u.note || ''); if (n !== null) update(u.name, { note: n }); });
      if ((u.flags || []).length) b('Clear flags', '', () => update(u.name, { clearFlags: true }));
      if (u.online && !self) b('Kick', '', () => guard(async () => { await api(`/api/admin/kick/${encodeURIComponent(u.name)}`, { method: 'POST', body: {} }); }));
      if (!self) b('Delete', 'danger', () => confirm(`Permanently delete ${u.name}?`) && guard(async () => { await api(`/api/admin/users/${encodeURIComponent(u.name)}`, { method: 'DELETE' }); await loadUsers(); }));
      const flags = (u.flags || []);
      return el('tr', {},
        el('td', {}, u.name, ' ', u.online ? el('span', { class: 'badge online', text: 'online' }) : null),
        el('td', {}, el('span', { class: 'badge ' + u.status, text: u.status })),
        el('td', {}, u.role === 'admin' ? el('span', { class: 'badge admin', text: 'admin' }) : 'player'),
        el('td', { text: u.mfaEnabled ? 'enabled' : u.mfaRequired ? 'required (not enrolled)' : 'off' }),
        el('td', { text: `${u.games} (${u.wins} won)` }),
        el('td', { text: u.lastLogin && !u.lastLogin.startsWith('0001') ? new Date(u.lastLogin).toLocaleString() : '—' }),
        el('td', {}, flags.length ? el('span', { class: 'badge flag', text: `${flags.length} flag(s), max ${Math.max(...flags.map(f => f.score))}`, title: flags.map(f => `${new Date(f.time).toLocaleString()} ${f.game}: ${f.reason}`).join('\n') }) : '—'),
        el('td', { text: u.note || '' }),
        acts);
    }));
}

async function loadRooms() {
  await guard(async () => {
    const rooms = await api('/api/admin/rooms');
    $('#rooms').replaceChildren(el('tr', {}, ...['Room', 'Name', 'Level', 'Host', 'State', 'Seats'].map(h => el('th', { text: h }))),
      ...rooms.map(r => el('tr', {}, el('td', { text: r.id }), el('td', { text: r.name }), el('td', { text: r.level }), el('td', { text: r.host }),
        el('td', { text: r.state }), el('td', { text: `${r.players}/${r.max}` }))));
    if (!rooms.length) $('#rooms').append(el('tr', {}, el('td', { text: 'No games running.' })));
  });
}

async function loadStats() {
  await guard(async () => {
    const s = await api('/api/stats');
    const prev = history[history.length - 1];
    s.at = Date.now();
    history.push(s);
    if (history.length > 120) history.shift();
    const rate = prev ? (s.counters.ws_messages_out - prev.counters.ws_messages_out) / ((s.at - prev.at) / 1000) : 0;
    s.rate = rate;
    const up = s.uptimeSeconds;
    const cards = [
      ['Uptime', `${Math.floor(up / 3600)}h ${Math.floor(up / 60) % 60}m`], ['Version', s.version], ['Players online', s.online],
      ['Accounts', s.users], ['Games running', s.rooms.playing || 0], ['Demo rooms', s.rooms.demo || 0], ['Lobby rooms', s.rooms.lobby || 0],
      ['Tick p95', `${(s.tickSeconds.p95 * 1000).toFixed(2)} ms`], ['Tick max', `${(s.tickSeconds.max * 1000).toFixed(1)} ms`],
      ['HTTP p95', `${(s.httpSeconds.p95 * 1000).toFixed(1)} ms`], ['Msgs out/s', rate.toFixed(0)], ['Dropped msgs', s.counters.ws_dropped],
      ['Commands', s.counters.commands], ['Rejected cmds', s.counters.commands_rejected], ['Logins ok/failed', `${s.counters.logins_ok}/${s.counters.logins_failed}`],
      ['Cheat flags', s.counters.cheat_flags], ['Cheat kicks', s.counters.cheat_kicks], ['Saves/restores', `${s.counters.games_saved}/${s.counters.games_restored}`],
      ['Goroutines', s.runtime.goroutines], ['Heap', `${(s.runtime.heap_alloc_bytes / 1048576).toFixed(1)} MiB`],
    ];
    $('#cards').replaceChildren(...cards.map(([k, v]) => el('div', { class: 'card' }, el('div', { class: 'v', text: String(v) }), el('div', { class: 'k', text: k }))));
    chart($('#tickchart'), [history.map(h => h.tickSeconds.p50 * 1000), history.map(h => h.tickSeconds.p95 * 1000)], ['#d9b45a', '#e0603b']);
    chart($('#netchart'), [history.map(h => h.rate || 0)], ['#43d2ff']);
  });
}

function chart(cv, series, colors) {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const max = Math.max(1e-6, ...series.flat()) * 1.15;
  ctx.strokeStyle = 'rgba(217,180,90,0.15)'; ctx.fillStyle = '#c2b391'; ctx.font = '12px Georgia';
  for (let i = 0; i <= 4; i++) {
    const y = H - 20 - (H - 30) * i / 4;
    ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.fillText((max * i / 4).toFixed(max < 10 ? 2 : 0), 2, y + 4);
  }
  series.forEach((s, k) => {
    ctx.strokeStyle = colors[k]; ctx.lineWidth = 2; ctx.beginPath();
    s.forEach((v, i) => { const x = 40 + (W - 45) * i / Math.max(1, 119), y = H - 20 - (H - 30) * v / max; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  });
}

async function loadAudit() {
  await guard(async () => {
    const a = await api('/api/admin/audit');
    $('#audit').replaceChildren(el('tr', {}, ...['Time', 'Actor', 'Action', 'Target', 'Detail'].map(h => el('th', { text: h }))),
      ...a.map(e => el('tr', {}, el('td', { text: new Date(e.time).toLocaleString() }), el('td', { text: e.actor }), el('td', { text: e.action }),
        el('td', { text: e.target || '' }), el('td', { text: e.detail || '' }))));
  });
}

init();
