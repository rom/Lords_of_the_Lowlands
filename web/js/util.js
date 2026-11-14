// Shared helpers: isometric projection, colours, DOM.
export const TW = 64, TH = 32, ZH = 32;

export function iso(x, y) { return [(x - y) * TW / 2, (x + y) * TH / 2]; }
export function unIso(sx, sy) {
  const a = sx / (TW / 2), b = sy / (TH / 2);
  return [(a + b) / 2, (b - a) / 2];
}

export const TEAM = ['#2f6fdb', '#d23a2a', '#e3c22b', '#3aa845', '#2bc4c4', '#9b3fcf', '#e8862a', '#cfcfcf'];
export const TEAM_NAMES = ['Blue', 'Red', 'Yellow', 'Green', 'Cyan', 'Purple', 'Orange', 'White'];

export function hexToRgb(h) {
  if (Array.isArray(h)) return h;
  if (h.startsWith('rgb')) return h.slice(h.indexOf('(') + 1, h.indexOf(')')).split(',').slice(0, 3).map(Number);
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgb(r, g, b, a) {
  r = Math.max(0, Math.min(255, r | 0)); g = Math.max(0, Math.min(255, g | 0)); b = Math.max(0, Math.min(255, b | 0));
  return a === undefined ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}
export function shade(hex, f) {
  const [r, g, b] = Array.isArray(hex) ? hex : hexToRgb(hex);
  return f >= 1 ? rgb(r + (255 - r) * (f - 1), g + (255 - g) * (f - 1), b + (255 - b) * (f - 1)) : rgb(r * f, g * f, b * f);
}
export function mix(a, b, t) {
  const A = Array.isArray(a) ? a : hexToRgb(a), B = Array.isArray(b) ? b : hexToRgb(b);
  return rgb(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

// deterministic hash noise
export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4, s = 0) {
  let t = 0, amp = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { t += amp * vnoise(x * f, y * f, s + i * 17); n += amp; amp *= 0.5; f *= 2; }
  return t / n;
}

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style') e.style.cssText = v; // CSSOM: allowed by our CSP
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) e.append(c);
  return e;
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function fmtTime(s) {
  s = Math.floor(s);
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

export async function api(path, opts = {}) {
  const o = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
  if (opts.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
  const r = await fetch(path, o);
  let data = null;
  try { data = await r.json(); } catch (e) { /* empty */ }
  if (!r.ok) { const e = new Error((data && data.error) || r.statusText); e.data = data; e.status = r.status; throw e; }
  return data;
}

export function lerp(a, b, t) { return a + (b - a) * t; }
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export const DIFFICULTIES = [['super_easy', 'Super easy'], ['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard'], ['super_hard', 'Super hard'], ['insane', 'Insane']];
export const MAP_TYPES = [['inland', 'Inland'], ['coastal', 'Coastal'], ['riverland', 'Riverland'], ['lakes', 'Lakes'], ['desert', 'Desert'], ['highland', 'Highland']];
