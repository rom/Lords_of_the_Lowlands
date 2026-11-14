// In-game user manual and FAQ: fetches docs/manual.md and docs/faq.md from
// the server and renders them with a small Markdown renderer that only ever
// creates DOM nodes (no innerHTML), so it works under the strict CSP and
// cannot inject markup.
import { el, $ } from './util.js';

const cache = {};

async function load(name) {
  if (!cache[name]) {
    const r = await fetch(`/api/docs/${name}`, { credentials: 'same-origin' });
    if (!r.ok) throw new Error(`${name}: ${r.status}`);
    cache[name] = await r.text();
  }
  return cache[name];
}

// slug turns a heading into the anchor GitHub would use.
export function slug(s) {
  return s.toLowerCase().replace(/[`*_]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-');
}

// inline renders **bold**, *italic*, `code` and [links](target).
function inline(text, onLink) {
  const out = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)));
    const t = m[0];
    if (m[1]) out.push(el('code', { text: t.slice(1, -1) }));
    else if (m[2]) out.push(el('strong', {}, ...inline(t.slice(2, -2), onLink)));
    else if (m[3]) out.push(el('em', {}, ...inline(t.slice(1, -1), onLink)));
    else {
      const [, label, target] = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const internal = /^(manual\.md|faq\.md)?(#[\w\p{L}-]*)?$/u.test(target);
      if (internal) {
        const a = el('a', { href: '#', class: 'mlink' }, ...inline(label, onLink));
        a.addEventListener('click', (e) => { e.preventDefault(); onLink(target); });
        out.push(a);
      } else {
        out.push(document.createTextNode(label)); // external links are shown as text only
      }
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

// render converts Markdown to a list of DOM blocks. Headings get ids.
export function render(md, onLink = () => {}) {
  const lines = md.replace(/\r/g, '').split('\n');
  const blocks = [];
  let i = 0;
  const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) {
      const lv = m[1].length, text = m[2].trim();
      blocks.push(el('h' + Math.min(lv + 1, 5), { id: slug(text), class: 'mh' }, ...inline(text, onLink)));
      i++; continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(l)) { blocks.push(el('hr')); i++; continue; }
    if (l.trim().startsWith('```')) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]);
      i++;
      blocks.push(el('pre', {}, el('code', { text: code.join('\n') })));
      continue;
    }
    if (l.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(l);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      blocks.push(el('div', { class: 'mtable' }, el('table', {},
        el('thead', {}, el('tr', {}, ...head.map(h => el('th', {}, ...inline(h, onLink))))),
        el('tbody', {}, ...rows.map(r => el('tr', {}, ...r.map(c => el('td', {}, ...inline(c, onLink)))))))));
      continue;
    }
    if (/^\s*>/.test(l)) {
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push(el('blockquote', {}, ...render(q.join('\n'), onLink)));
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      const ordered = /^\s*\d+[.)]\s+/.test(l);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        let text = lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, '');
        i++;
        // continuation lines (indented, not a new item)
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) text += ' ' + lines[i++].trim();
        items.push(el('li', {}, ...inline(text, onLink)));
      }
      blocks.push(el(ordered ? 'ol' : 'ul', {}, ...items));
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*>|\s*([-*+]|\d+[.)])\s+|```)/.test(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) para.push(lines[i++].trim());
    blocks.push(el('p', {}, ...inline(para.join(' '), onLink)));
  }
  return blocks;
}

// sections splits rendered blocks at h2/h3 headings for the table of
// contents and for search (each section: heading + following blocks).
function sections(blocks, level) {
  const out = [];
  let cur = null;
  for (const b of blocks) {
    const lv = /^H(\d)$/.test(b.tagName) ? +b.tagName[1] - 1 : 0;
    if (lv && lv <= level) { cur = { head: b, level: lv, nodes: [b] }; out.push(cur); }
    else if (cur) cur.nodes.push(b);
    else out.push(cur = { head: null, level: 0, nodes: [b] });
  }
  return out;
}

// manualBox builds the manual/FAQ window. tab is 'manual' or 'faq';
// onClose is called by the close button.
export function manualBox(tab = 'manual', onClose = () => {}) {
  const body = el('div', { class: 'mbody' });
  const toc = el('nav', { class: 'mtoc' });
  const search = el('input', { type: 'search', class: 'msearch', placeholder: 'Search…', 'aria-label': 'Search the manual and FAQ' });
  const tabs = {
    manual: el('button', { class: 'btn small mtab', text: 'User Manual' }),
    faq: el('button', { class: 'btn small mtab', text: 'FAQ' }),
  };
  const info = el('span', { class: 'minfo' });
  const box = el('div', { class: 'panel manual-box' },
    el('div', { class: 'help-head' },
      el('div', { class: 'mtabs' }, tabs.manual, tabs.faq),
      search, info,
      el('button', { class: 'btn small', text: 'Close (Esc)', onclick: () => onClose() })),
    el('div', { class: 'mwrap' }, toc, body));
  let current = null, secs = [];

  const go = (target) => {
    const [file, hash] = target.split('#');
    const want = file === 'faq.md' ? 'faq' : file === 'manual.md' ? 'manual' : current;
    const jump = () => { if (hash) { const h = body.querySelector('#' + CSS.escape(hash)); if (h) h.scrollIntoView({ block: 'start' }); } };
    if (want !== current) show(want).then(jump); else jump();
  };

  async function show(name) {
    current = name;
    for (const [k, b] of Object.entries(tabs)) b.classList.toggle('active', k === name);
    body.replaceChildren(el('p', { class: 'fine', text: 'Loading…' }));
    let md;
    try { md = await load(name); } catch (e) { body.replaceChildren(el('p', { text: 'The manual could not be loaded.' })); return; }
    if (current !== name) return;
    const blocks = render(md, go);
    // FAQ: one entry per question (h4 = "###"); manual: per "##"/"###" section
    secs = sections(blocks, name === 'faq' ? 3 : 3);
    body.replaceChildren(...blocks);
    body.scrollTop = 0;
    toc.replaceChildren(...secs.filter(s => s.head && s.level <= 2 || (s.head && name === 'manual' && s.level === 3)).map(s => {
      const a = el('a', { href: '#', class: 'mtoc-' + s.level, text: s.head.textContent });
      a.addEventListener('click', (e) => { e.preventDefault(); s.head.scrollIntoView({ block: 'start' }); });
      return a;
    }));
    const n = name === 'faq' ? secs.filter(s => s.level === 3).length : null;
    info.textContent = n ? `${n} questions` : '';
    filter();
  }

  function filter() {
    const q = search.value.trim().toLowerCase();
    let hits = 0;
    for (const s of secs) {
      const text = s.nodes.map(n => n.textContent).join(' ').toLowerCase();
      // keep section headings (level 1–2) visible when any of their entries match
      const hit = !q || text.includes(q);
      if (s.level >= 3 || s.level === 0) { for (const n of s.nodes) n.classList.toggle('hidden', !hit); if (hit && s.level >= 3) hits++; }
      else for (const n of s.nodes) n.classList.toggle('hidden', !!q && !hit && !sectionHasHit(s));
    }
    if (q) info.textContent = `${hits} match${hits === 1 ? '' : 'es'}`;
    else if (current === 'faq') info.textContent = `${secs.filter(s => s.level === 3).length} questions`;
    else info.textContent = '';
    function sectionHasHit(s) {
      const i = secs.indexOf(s);
      for (let j = i + 1; j < secs.length && secs[j].level > s.level; j++) {
        if (secs[j].nodes.map(n => n.textContent).join(' ').toLowerCase().includes(q)) return true;
      }
      return false;
    }
  }

  tabs.manual.addEventListener('click', () => show('manual'));
  tabs.faq.addEventListener('click', () => show('faq'));
  search.addEventListener('input', filter);
  search.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { if (search.value) { search.value = ''; filter(); } else onClose(); } });
  show(tab);
  box.focusSearch = () => search.focus();
  return box;
}

// openManual shows the manual in the page overlay outside a game (main menu,
// login screen). Esc closes it.
export function openManual(tab = 'manual') {
  const ov = $('#overlay');
  const close = () => { ov.classList.add('hidden'); ov.replaceChildren(); window.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  ov.replaceChildren(manualBox(tab, close));
  ov.classList.remove('hidden');
  window.addEventListener('keydown', onKey, true);
}
