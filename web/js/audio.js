// Procedural sound: every effect and the background music are synthesised
// with the Web Audio API (no audio files).
let ac = null, master, sfxBus, musicBus, reverb, noiseBuf;
const settings = { master: 0.8, sfx: 0.8, music: 0.5, muted: false };
try { Object.assign(settings, JSON.parse(localStorage.getItem('lotl.audio') || '{}')); } catch (e) { /* ignore */ }

export function audioSettings() { return settings; }
export function saveAudio() {
  try { localStorage.setItem('lotl.audio', JSON.stringify(settings)); } catch (e) { /* ignore */ }
  if (!ac) return;
  master.gain.value = settings.muted ? 0 : settings.master;
  sfxBus.gain.value = settings.sfx;
  musicBus.gain.value = settings.music * 0.55;
}

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp).connect(ac.destination);
  sfxBus = ac.createGain(); sfxBus.connect(master);
  musicBus = ac.createGain(); musicBus.connect(master);
  reverb = ac.createConvolver();
  reverb.buffer = impulse(2.8, 2.2);
  const rv = ac.createGain(); rv.gain.value = 0.35;
  reverb.connect(rv).connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  saveAudio();
}

function impulse(sec, decay) {
  const len = ac.sampleRate * sec, b = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

function env(g, t, a, peak, dec, sus = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + dec);
}

function noise(t, dur, freq, q, vol, out, type = 'bandpass', sweepTo) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ac.createGain(); env(g, t, 0.003, vol, dur);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

function tone(t, dur, freq, type, vol, out, to, attack = 0.005) {
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ac.createGain(); env(g, t, attack, vol, dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
}

// spatialised output for a world event: pan from screen x, volume from distance.
// wet > 0 also sends the sound to the reverb (distant, large or outdoor sounds).
function bus(pan = 0, vol = 1, wet = 0) {
  const g = ac.createGain(); g.gain.value = vol;
  if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p).connect(sfxBus); }
  else g.connect(sfxBus);
  if (wet > 0) { const w = ac.createGain(); w.gain.value = wet; g.connect(w).connect(reverb); }
  return g;
}

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ring: struck metal / stone / glass — a few inharmonic partials with
// independent decays (higher partials die faster).
function ring(t, base, ratios, dur, vol, out, type = 'sine') {
  ratios.forEach((r, i) => tone(t, dur / (1 + i * 0.6), base * r, type, vol / (1 + i * 0.8), out, base * r * 0.995, 0.001));
}

// grains: a burst of tiny noise clicks (gravel, rustling leaves, crackle).
function grains(t, n, spread, freq, q, vol, out, type = 'bandpass', len = 0.025) {
  for (let i = 0; i < n; i++) noise(t + Math.random() * spread, len * rnd(0.6, 1.4), freq * rnd(0.7, 1.4), q, vol * rnd(0.4, 1), out, type);
}

// thud: a low body resonance (wood, earth, flesh).
function thud(t, f, dur, vol, out) {
  tone(t, dur, f, 'sine', vol, out, f * 0.5, 0.002);
  noise(t, dur * 0.6, f * 3, 1.2, vol * 0.5, out, 'lowpass');
}

// voice: a crude formant "groan" for wounded soldiers and animals.
function voice(t, dur, f0, f1, formants, vol, out) {
  const o = ac.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const vib = ac.createOscillator(); vib.frequency.value = rnd(5, 7); const vg = ac.createGain(); vg.gain.value = f0 * 0.03;
  vib.connect(vg).connect(o.frequency);
  const g = ac.createGain(); env(g, t, 0.03, vol, dur);
  for (const [f, q, v] of formants) {
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const fg = ac.createGain(); fg.gain.value = v;
    o.connect(bp).connect(fg).connect(g);
  }
  g.connect(out);
  o.start(t); o.stop(t + dur + 0.05); vib.start(t); vib.stop(t + dur + 0.05);
}

// motor: a buzzing engine (chainsaw, jackhammer, siren) — oscillator with
// optional amplitude chop.
function motor(t, dur, f, type, vol, out, chopHz = 0, to, lp = 2400) {
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const f1 = ac.createBiquadFilter(); f1.type = 'lowpass'; f1.frequency.value = lp;
  const g = ac.createGain(); env(g, t, 0.02, vol, Math.max(0.03, dur * 0.3), vol * 0.6);
  g.gain.setValueAtTime(vol * 0.6, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
  let node = o.connect(f1);
  if (chopHz) {
    const am = ac.createGain(); am.gain.value = 0.5;
    const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = chopHz;
    const lg = ac.createGain(); lg.gain.value = 0.5; lfo.connect(lg).connect(am.gain);
    lfo.start(t); lfo.stop(t + dur + 0.1);
    node = node.connect(am);
  }
  node.connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.1);
}

const ERA_RANK = { stone: 0, bronze: 1, iron: 2, classical: 3, medieval: 4, gunpowder: 5, industrial: 6, modern: 7, future: 8, space: 9 };
const eraRank = (e) => ERA_RANK[e] ?? 0;

const lastPlay = {};
const THROTTLE = { chop: 0.07, mine: 0.07, forage: 0.08, farm: 0.09, fish: 0.12, butcher: 0.09, hammer: 0.07, arrow: 0.05, bullet: 0.04,
  clash: 0.05, punch: 0.05, laser: 0.05, boom: 0.08, impact: 0.04, death: 0.08, animal: 0.15, alert: 1.5 };

// sfx plays a named effect. era (optional) selects period-appropriate
// variants: a stone axe and a chainsaw are both "chop".
export function sfx(name, pan = 0, vol = 1, era = 'stone') {
  if (!ac || settings.muted || vol < 0.02) return;
  const now = ac.currentTime;
  const lim = THROTTLE[name] || 0.03;
  if (lastPlay[name] && now - lastPlay[name] < lim) return;
  lastPlay[name] = now;
  const er = eraRank(era);
  const o = bus(pan, vol, ['alert', 'collapse', 'boom', 'cannon', 'age', 'victory', 'defeat', 'death'].includes(name) ? 0.5 : 0.12), t = now + 0.01;
  switch (name) {
    case 'click': tone(t, 0.06, 880, 'triangle', 0.15, o, 660); break;
    case 'select': tone(t, 0.09, 520, 'sine', 0.18, o, 700); tone(t + 0.03, 0.08, 780, 'sine', 0.08, o); break;
    case 'selectMil': noise(t, 0.08, 3000, 3, 0.15, o); tone(t, 0.12, 220, 'sawtooth', 0.06, o, 180); break;
    case 'ack': tone(t, 0.08, 400, 'triangle', 0.14, o, 520); break;

    // ---------------------------------------------------------------- work
    case 'chop':
      if (er >= 8) { // plasma cutter
        motor(t, 0.35, rnd(700, 900), 'sawtooth', 0.08, o, 0, 500, 3000); grains(t, 6, 0.3, 5000, 2, 0.12, o, 'highpass', 0.015);
      } else if (er >= 6) { // chainsaw
        motor(t, 0.45, rnd(95, 115), 'sawtooth', 0.16, o, 0, rnd(130, 150), 1800); grains(t + 0.1, 8, 0.3, 2400, 1.5, 0.12, o);
      } else { // axe: sharp bite, woody knock, sometimes falling chips / creak
        const bite = er >= 2 ? 3800 : 2600; // metal axe heads ring brighter than flint
        noise(t, 0.018, bite, 1.5, 0.55, o, 'highpass');
        noise(t, 0.09, rnd(500, 700), 7, 0.6, o);
        thud(t, rnd(150, 210), 0.12, 0.35, o);
        if (er >= 2) tone(t, 0.05, rnd(2900, 3300), 'triangle', 0.05, o);
        if (Math.random() < 0.3) grains(t + 0.06, 4, 0.25, 3000, 1, 0.08, o, 'highpass', 0.02);
        if (Math.random() < 0.08) motor(t + 0.15, 0.5, rnd(70, 90), 'sawtooth', 0.04, o, 22, 60, 500); // trunk creak
      }
      break;
    case 'mine':
      if (er >= 7) { // pneumatic drill
        motor(t, 0.4, rnd(140, 170), 'square', 0.1, o, 28, null, 1500); grains(t + 0.05, 10, 0.35, 1800, 1, 0.15, o, 'lowpass', 0.03);
      } else { // pick on rock: inharmonic clink + crumble
        ring(t, rnd(1900, 2300), [1, 1.48, 2.31, 3.1], 0.22, 0.16, o, 'triangle');
        noise(t, 0.02, 5000, 1, 0.35, o, 'highpass');
        thud(t, rnd(90, 120), 0.08, 0.25, o);
        grains(t + 0.04, 5, 0.22, 1400, 0.8, 0.14, o, 'lowpass', 0.03);
      }
      break;
    case 'mineGold': // brighter ring, a little shimmer
      ring(t, rnd(2500, 2800), [1, 1.51, 2.42, 3.33], 0.35, 0.15, o);
      noise(t, 0.02, 6000, 1, 0.3, o, 'highpass'); grains(t + 0.04, 4, 0.2, 1600, 0.8, 0.1, o, 'lowpass', 0.03);
      break;
    case 'mineCrystal': // glassy, bell-like
      ring(t, rnd(1300, 1700), [1, 2.01, 3.03, 4.2], 0.9, 0.12, o); tone(t, 0.6, 5200, 'sine', 0.03, o, 4800);
      break;
    case 'forage': // rustling leaves and a soft pluck
      grains(t, 7, 0.18, 4500, 0.8, 0.12, o, 'highpass', 0.03);
      tone(t + rnd(0.05, 0.12), 0.05, rnd(600, 800), 'sine', 0.08, o, 300);
      break;
    case 'farm':
      if (er >= 6) { motor(t, 0.5, rnd(55, 65), 'sawtooth', 0.22, o, 9, null, 700); } // tractor
      else { noise(t, 0.16, 900, 1.5, 0.22, o, 'bandpass', 3200); thud(t + 0.14, 110, 0.08, 0.2, o); } // scythe swish + hoe
      break;
    case 'fish': // splash and bubbles
      noise(t, 0.25, 2500, 0.7, 0.6, o, 'lowpass', 300);
      for (let i = 0; i < 4; i++) tone(t + 0.08 + i * rnd(0.04, 0.08), 0.04, rnd(500, 900), 'sine', 0.06, o, rnd(1100, 1600));
      break;
    case 'butcher': noise(t, 0.1, 1500, 2, 0.25, o, 'bandpass', 4000); thud(t + 0.05, 140, 0.07, 0.2, o); break;
    case 'hammer':
      if (er >= 6) { ring(t, rnd(900, 1100), [1, 2.76, 5.4], 0.18, 0.3, o, 'triangle'); noise(t, 0.03, 4000, 2, 0.4, o); } // steel
      else { thud(t, rnd(140, 190), 0.1, 0.3, o); noise(t, 0.025, 2500, 3, 0.3, o); if (Math.random() < 0.5) noise(t + 0.03, 0.06, 700, 6, 0.15, o); }
      break;

    // -------------------------------------------------------------- combat
    case 'clash': {
      const f = rnd(2300, 3100);
      noise(t, 0.03, 6000, 1, 0.45, o, 'highpass');
      ring(t, f, [1, 1.34, 1.79, 2.62], 0.45, 0.12, o, 'triangle');
      if (Math.random() < 0.4) { noise(t + 0.09, 0.03, 5000, 1, 0.25, o, 'highpass'); ring(t + 0.09, f * 1.12, [1, 1.41, 2.2], 0.3, 0.07, o); } // parry
      thud(t, 120, 0.06, 0.15, o);
      break;
    }
    case 'punch': thud(t, rnd(90, 130), 0.1, 0.45, o); noise(t, 0.04, 900, 1, 0.3, o, 'lowpass'); break;
    case 'arrow': noise(t, 0.04, 600, 4, 0.6, o); noise(t, 0.22, 900, 2, 0.35, o, 'bandpass', 3200); break; // string twang + whoosh
    case 'sling': noise(t, 0.15, 600, 2, 0.15, o, 'bandpass', 1500); break;
    case 'bullet': noise(t, 0.12, 1800, 0.7, 0.55, o, 'lowpass', 400); tone(t, 0.05, 160, 'square', 0.12, o, 60); noise(t + 0.05, 0.3, 1200, 1, 0.08, o, 'bandpass', 300); break;
    case 'musket': noise(t, 0.04, 3000, 0.7, 0.4, o, 'highpass'); noise(t, 0.45, 1200, 0.6, 0.7, o, 'lowpass', 150); break;
    case 'cannon': noise(t, 0.9, 700, 0.5, 0.9, o, 'lowpass', 60); tone(t, 0.6, 90, 'sine', 0.6, o, 30); break;
    case 'boom': noise(t, 1.2, 900, 0.5, 0.9, o, 'lowpass', 50); tone(t, 0.8, 70, 'sine', 0.7, o, 25); grains(t + 0.2, 8, 0.8, 1500, 1, 0.12, o, 'lowpass', 0.04); break;
    case 'laser': tone(t, 0.18, 1600, 'sawtooth', 0.12, o, 220); tone(t, 0.15, 2400, 'square', 0.05, o, 400); break;
    case 'plasma': tone(t, 0.3, 600, 'sawtooth', 0.12, o, 90); noise(t, 0.25, 900, 3, 0.15, o, 'bandpass', 200); break;
    case 'rocket': noise(t, 0.6, 600, 1, 0.4, o, 'bandpass', 2000); break;
    // impacts, played when a projectile lands
    case 'impactWood': thud(t, rnd(180, 240), 0.07, 0.3, o); noise(t, 0.02, 2200, 3, 0.25, o); break;
    case 'impactFlesh': thud(t, rnd(100, 140), 0.08, 0.35, o); noise(t, 0.05, 700, 1, 0.2, o, 'lowpass'); break;
    case 'impactMetal': ring(t, rnd(1800, 2600), [1, 1.6, 2.7], 0.25, 0.1, o, 'triangle'); noise(t, 0.02, 5000, 1, 0.25, o, 'highpass'); break;
    case 'ricochet': tone(t, 0.25, rnd(2600, 3400), 'sine', 0.15, o, rnd(900, 1300)); noise(t, 0.02, 4000, 1, 0.2, o, 'highpass'); break;
    case 'impactBlast': noise(t, 0.5, 1200, 0.6, 0.6, o, 'lowpass', 80); tone(t, 0.35, 110, 'sine', 0.4, o, 40); grains(t + 0.1, 5, 0.4, 1800, 1, 0.1, o, 'lowpass', 0.04); break;
    case 'impactEnergy': tone(t, 0.2, 900, 'sine', 0.12, o, 120); noise(t, 0.15, 3000, 2, 0.15, o, 'bandpass', 600); break;
    case 'death':
      voice(t, rnd(0.35, 0.55), rnd(180, 240), rnd(90, 120), [[rnd(550, 700), 6, 1], [rnd(1000, 1250), 8, 0.6], [2600, 10, 0.25]], 0.18, o);
      thud(t + rnd(0.2, 0.35), 90, 0.12, 0.2, o); // body / armour hits the ground
      break;
    case 'animal':
      voice(t, rnd(0.3, 0.5), rnd(260, 380), rnd(140, 200), [[rnd(400, 500), 5, 1], [rnd(1600, 1900), 7, 0.4]], 0.5, o);
      break;
    case 'collapse':
      noise(t, 1.8, 500, 0.6, 0.8, o, 'lowpass', 40); tone(t, 1.2, 55, 'sine', 0.4, o, 30);
      for (let i = 0; i < 7; i++) { const tt = t + i * rnd(0.1, 0.22); noise(tt, 0.05, rnd(1500, 3000), 2, 0.35, o, 'highpass'); thud(tt, rnd(70, 130), 0.15, 0.25, o); }
      grains(t + 0.4, 14, 1.4, 1200, 0.8, 0.12, o, 'lowpass', 0.04);
      break;

    // ----------------------------------------------------------------- UI
    case 'place': tone(t, 0.1, 300, 'square', 0.08, o, 200); noise(t, 0.08, 1200, 1, 0.2, o); break;
    case 'built': [523, 659, 784].forEach((f, i) => tone(t + i * 0.08, 0.35, f, 'triangle', 0.12, o)); break;
    case 'trained': tone(t, 0.25, 392, 'triangle', 0.12, o); tone(t + 0.12, 0.3, 523, 'triangle', 0.12, o); break;
    case 'tech': [440, 554, 659, 880].forEach((f, i) => tone(t + i * 0.07, 0.5, f, 'sine', 0.1, o)); break;
    case 'age': horn(t, [262, 330, 392, 523], 0.22, o); horn(t + 0.9, [349, 440, 523, 698], 0.24, o); break;
    case 'alert': alert(t, er, o, false); break;
    case 'alertBuilding': alert(t, er, o, true); break;
    case 'error': tone(t, 0.15, 200, 'square', 0.1, o, 150); break;
    case 'chat': tone(t, 0.08, 1200, 'sine', 0.1, o); tone(t + 0.09, 0.1, 1600, 'sine', 0.08, o); break;
    case 'victory': [392, 523, 659, 784, 1047].forEach((f, i) => horn(t + i * 0.25, [f], 0.6, o)); break;
    case 'defeat': [392, 349, 311, 262].forEach((f, i) => horn(t + i * 0.4, [f], 0.7, o)); break;
  }
}

// alert: "you are under attack", in the voice of the era — war drums and a
// horn, then church bells, bugle and drum roll, an air-raid siren, and
// finally a starship klaxon. Buildings get a bell (or a lower siren).
function alert(t, er, o, building) {
  const drums = (n, gap, f) => { for (let i = 0; i < n; i++) thud(t + i * gap, f * (i % 2 ? 0.8 : 1), 0.25, 0.5, o); };
  if (er <= 2) { // stone–iron: war drums and an animal horn
    drums(6, 0.16, 90);
    horn(t + 0.1, [building ? 147 : 196], 0.7, o); horn(t + 0.9, [building ? 131 : 175], 0.8, o);
  } else if (er <= 4) { // classical–medieval: horn calls, a tolling bell for buildings
    horn(t, [220, 330], 0.45, o); horn(t + 0.55, [165, 247], 0.6, o);
    if (building) for (let i = 0; i < 3; i++) ring(t + 0.2 + i * 0.6, 392, [0.5, 1, 1.19, 1.5, 2, 2.51], 1.6, 0.12, o);
  } else if (er === 5) { // gunpowder: bugle + snare roll
    [392, 523, 659, 523, 392].forEach((f, i) => horn(t + i * 0.13, [f], 0.16, o));
    for (let i = 0; i < 14; i++) noise(t + 0.7 + i * 0.045, 0.05, 2200, 1, 0.6 * (1 - i / 20), o, 'bandpass');
    if (building) ring(t + 0.1, 440, [0.5, 1, 1.19, 1.5, 2], 1.4, 0.1, o);
  } else if (er <= 7) { // industrial–modern: siren
    motor(t, 1.6, building ? 330 : 440, 'sawtooth', 0.3, o, 0, building ? 660 : 880, 1600);
    motor(t + 1.6, 0.6, building ? 660 : 880, 'sawtooth', 0.3, o, 0, building ? 330 : 440, 1600);
  } else { // future–space: klaxon and warning beeps
    for (let i = 0; i < 3; i++) motor(t + i * 0.45, 0.3, building ? 300 : 420, 'square', 0.22, o, 0, building ? 250 : 360, 1400);
    for (let i = 0; i < 4; i++) tone(t + 1.4 + i * 0.12, 0.06, 1760, 'sine', 0.25, o);
  }
}

function horn(t, freqs, dur, out) {
  for (const f of freqs) {
    for (const [mult, v] of [[1, 0.1], [2, 0.04], [3, 0.02]]) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * mult;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(2200, t + 0.08);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.05); g.gain.setValueAtTime(v, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp).connect(g).connect(out); g.connect(reverb);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }
}

// ------------------------------------------------------------------ music
// A generative score: chord progressions in an era-specific mode played by
// era-specific instruments, with drone, percussion and melody.
const MODES = {
  dorian: [0, 2, 3, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], pent: [0, 3, 5, 7, 10],
};
const STYLES = {
  stone: { mode: 'pent', root: 45, tempo: 72, lead: 'flute', pad: 'drone', drums: 'hand' },
  bronze: { mode: 'phrygian', root: 50, tempo: 80, lead: 'pluck', pad: 'drone', drums: 'hand' },
  iron: { mode: 'aeolian', root: 45, tempo: 84, lead: 'flute', pad: 'drone', drums: 'war' },
  classical: { mode: 'dorian', root: 50, tempo: 88, lead: 'pluck', pad: 'strings', drums: 'hand' },
  medieval: { mode: 'dorian', root: 50, tempo: 92, lead: 'pluck', pad: 'drone', drums: 'war' },
  gunpowder: { mode: 'major', root: 48, tempo: 100, lead: 'harpsi', pad: 'strings', drums: 'snare' },
  industrial: { mode: 'aeolian', root: 45, tempo: 96, lead: 'brass', pad: 'strings', drums: 'snare' },
  modern: { mode: 'aeolian', root: 45, tempo: 104, lead: 'synth', pad: 'synth', drums: 'kit' },
  future: { mode: 'mixolydian', root: 47, tempo: 96, lead: 'synth', pad: 'space', drums: 'kit' },
  space: { mode: 'dorian', root: 43, tempo: 84, lead: 'bell', pad: 'space', drums: 'pulse' },
  menu: { mode: 'dorian', root: 50, tempo: 76, lead: 'pluck', pad: 'strings', drums: 'none' },
};
const PROG = [[0, 5, 3, 4], [0, 3, 4, 0], [0, 6, 5, 4], [0, 2, 3, 4]];

let music = null;

export function playMusic(era) {
  if (!ac) return;
  if (music && music.era === era) return;
  stopMusic();
  const st = STYLES[era] || STYLES.medieval;
  music = { era, st, next: ac.currentTime + 0.1, beat: 0, prog: PROG[Math.floor(Math.random() * PROG.length)], timer: null, melody: 0, bar: 0 };
  music.timer = setInterval(schedule, 100);
}

export function stopMusic() {
  if (music && music.timer) clearInterval(music.timer);
  music = null;
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function scaleNote(st, degree, oct = 0) {
  const sc = MODES[st.mode];
  const n = sc.length;
  const o = Math.floor(degree / n);
  return st.root + oct * 12 + o * 12 + sc[((degree % n) + n) % n];
}

function schedule() {
  if (!music || !ac) return;
  const spb = 60 / music.st.tempo / 2; // eighth notes
  while (music.next < ac.currentTime + 0.5) {
    playStep(music, music.next, spb);
    music.next += spb;
    music.beat++;
  }
}

function playStep(m, t, spb) {
  const st = m.st, step = m.beat % 16, bar = Math.floor(m.beat / 16);
  const chord = m.prog[bar % 4];
  if (bar % 8 === 7 && step === 15) m.prog = PROG[Math.floor(Math.random() * PROG.length)];
  const out = musicBus;
  // pad / drone at the start of each bar
  if (step === 0) {
    const notes = [scaleNote(st, chord, -1), scaleNote(st, chord + 2, -1), scaleNote(st, chord + 4, -1)];
    pad(st.pad, t, spb * 16, notes, out);
  }
  // percussion
  drums(st.drums, step, t, out);
  // melody: a random walk on the scale, denser in later eras
  const density = st.tempo > 95 ? 0.55 : 0.4;
  if ((step % 2 === 0 && Math.random() < density) || step === 0) {
    m.melody += [-2, -1, -1, 0, 1, 1, 2, 3][Math.floor(Math.random() * 8)];
    if (m.melody < chord - 2) m.melody += 3;
    if (m.melody > chord + 7) m.melody -= 4;
    const note = scaleNote(st, m.melody, 1);
    const len = spb * (Math.random() < 0.3 ? 4 : 2);
    lead(st.lead, t, len, mtof(note), out);
  }
  if (step % 4 === 0 && st.drums !== 'none') {
    const bassN = scaleNote(st, chord, -2);
    bass(st, t, spb * 3, mtof(bassN), out);
  }
}

function pad(kind, t, dur, notes, out) {
  for (const n of notes) {
    const f = mtof(n);
    const types = kind === 'strings' ? ['sawtooth', 'sawtooth'] : kind === 'space' ? ['sine', 'triangle'] : kind === 'synth' ? ['square', 'sawtooth'] : ['sawtooth', 'triangle'];
    for (let i = 0; i < 2; i++) {
      const o = ac.createOscillator(); o.type = types[i]; o.frequency.value = f * (i ? 1.004 : 0.996);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'space' ? 1800 : kind === 'drone' ? 600 : 1100;
      const g = ac.createGain();
      const v = kind === 'drone' ? 0.03 : 0.022;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur * 0.25); g.gain.setValueAtTime(v, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.05);
      o.connect(lp).connect(g); g.connect(out); g.connect(reverb);
      o.start(t); o.stop(t + dur * 1.1);
    }
  }
}

function lead(kind, t, dur, f, out) {
  const g = ac.createGain();
  g.connect(out); g.connect(reverb);
  switch (kind) {
    case 'flute': {
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const vib = ac.createOscillator(); vib.frequency.value = 5.5; const vg = ac.createGain(); vg.gain.value = f * 0.008; vib.connect(vg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); o.start(t); o.stop(t + dur + 0.05); vib.start(t); vib.stop(t + dur + 0.05);
      noise(t, 0.08, f * 2, 2, 0.02, out);
      break;
    }
    case 'pluck': case 'harpsi': {
      for (const [m, v, ty] of [[1, 0.08, 'triangle'], [2, 0.03, kind === 'harpsi' ? 'sawtooth' : 'sine'], [3, 0.015, 'sine']]) {
        const o = ac.createOscillator(); o.type = ty; o.frequency.value = f * m;
        const gg = ac.createGain(); env(gg, t, 0.003, v, kind === 'harpsi' ? dur * 0.6 : dur * 1.2);
        o.connect(gg).connect(g); o.start(t); o.stop(t + dur * 1.3);
      }
      g.gain.value = 1;
      break;
    }
    case 'brass': {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1800, t + 0.1);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp).connect(g); o.start(t); o.stop(t + dur + 0.05);
      break;
    }
    case 'synth': {
      const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(500, t + dur); lp.Q.value = 6;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp).connect(g); o.start(t); o.stop(t + dur + 0.05);
      break;
    }
    case 'bell': {
      for (const [m, v] of [[1, 0.05], [2.76, 0.02], [5.4, 0.01]]) {
        const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f * m;
        const gg = ac.createGain(); env(gg, t, 0.002, v, dur * 2.5);
        o.connect(gg).connect(g); o.start(t); o.stop(t + dur * 2.6);
      }
      g.gain.value = 1;
      break;
    }
  }
}

function bass(st, t, dur, f, out) {
  const o = ac.createOscillator(); o.type = st.pad === 'synth' || st.pad === 'space' ? 'sawtooth' : 'triangle'; o.frequency.value = f;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
  const g = ac.createGain(); env(g, t, 0.01, 0.07, dur);
  o.connect(lp).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
}

function drums(kind, step, t, out) {
  if (kind === 'none') return;
  const kick = () => tone(t, 0.25, 120, 'sine', 0.22, out, 40);
  switch (kind) {
    case 'hand':
      if (step % 8 === 0) tone(t, 0.25, 150, 'sine', 0.16, out, 70);
      if (step % 8 === 3 || step % 8 === 6) tone(t, 0.12, 260, 'sine', 0.08, out, 160);
      if (step % 2 === 1 && Math.random() < 0.4) noise(t, 0.04, 3500, 2, 0.03, out);
      break;
    case 'war':
      if (step % 8 === 0 || step % 8 === 5) tone(t, 0.4, 90, 'sine', 0.22, out, 45);
      if (step % 4 === 2) noise(t, 0.1, 1500, 1, 0.06, out);
      break;
    case 'snare':
      if (step % 8 === 0) kick();
      if (step % 8 === 4) noise(t, 0.12, 2500, 0.8, 0.09, out);
      if (step % 2 === 1 && Math.random() < 0.3) noise(t, 0.05, 3000, 1, 0.04, out);
      break;
    case 'kit':
      if (step % 4 === 0) kick();
      if (step % 8 === 4) noise(t, 0.12, 2200, 0.8, 0.1, out);
      if (step % 2 === 0) noise(t, 0.03, 9000, 1, 0.03, out, 'highpass');
      break;
    case 'pulse':
      if (step % 8 === 0) tone(t, 0.6, 60, 'sine', 0.2, out, 35);
      if (step % 2 === 0) noise(t, 0.02, 8000, 1, 0.015, out, 'highpass');
      break;
  }
}
