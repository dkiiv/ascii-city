/* ASCII CITY — WebAudio: procedural synthwave music player + sound effects */
(function () {
'use strict';
const A = AC.A = {};
A.on = AC.load('music', true);
A.vol = AC.load('volume', 0.35);
A.track = 'NEON RELAY // ASCII CITY THEME (PROCEDURAL)';
let ctx = null, master = null, musicBus = null, sfxBus = null, started = false, nextNote = 0, step = 0, timer = null;
const BPM = 104, STEP = 60 / BPM / 4;

A.init = function () {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = A.on ? A.vol : 0; musicBus.connect(comp);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.5; sfxBus.connect(comp);
  // simple feedback delay for the lead
  A.delay = ctx.createDelay(1); A.delay.delayTime.value = STEP * 3;
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  A.delay.connect(fb); fb.connect(A.delay); A.delay.connect(musicBus);
  A.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = A.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
};
A.startMusic = function () {
  A.init(); if (!ctx || started) return;
  started = true; nextNote = ctx.currentTime + 0.1; step = 0;
  timer = setInterval(schedule, 25);
};
A.setOn = function (v) { A.on = v; AC.save('music', v); if (musicBus) musicBus.gain.setTargetAtTime(v ? A.vol : 0, ctx.currentTime, 0.1); if (v) A.startMusic(); };
A.toggle = function () { A.setOn(!A.on); };
A.setVol = function (v) { A.vol = AC.clamp(Math.round(v * 20) / 20, 0, 1); AC.save('volume', A.vol); if (musicBus && A.on) musicBus.gain.setTargetAtTime(A.vol, ctx.currentTime, 0.05); };

// Am - F - C - G, with a minor lift in the B section
const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2];
const LEAD = [76, null, 74, 72, null, 69, null, 72, 74, null, 72, 69, 67, null, 69, null];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function osc(type, freq, t, dur, gain, dest, filt) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  let node = o;
  if (filt) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filt; f.Q.value = 4; o.connect(f); node = f; }
  node.connect(g); g.connect(dest || musicBus);
  o.start(t); o.stop(t + dur + 0.05);
  return o;
}
function noiseHit(t, dur, gain, hp, dest) {
  const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  s.buffer = A.noise; f.type = 'highpass'; f.frequency.value = hp;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest || musicBus);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
function kick(t) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.4);
}
function schedule() {
  if (!ctx) return;
  while (nextNote < ctx.currentTime + 0.12) {
    const t = nextNote, bar = Math.floor(step / 16), s = step % 16;
    const chord = PROG[bar % 8];
    const section = Math.floor(bar / 8) % 4; // intro, groove, full, breakdown
    // drums
    if (section !== 0 || bar % 8 >= 4) {
      if (s % 4 === 0 && section !== 3) kick(t);
      if (s % 8 === 4) noiseHit(t, 0.18, 0.35, 1800);
      if (s % 2 === 1) noiseHit(t, 0.04, 0.12, 7000);
    }
    // bass (8ths, octave bounce)
    if (s % 2 === 0) osc('sawtooth', mtof(chord[0] - 24 + (s % 4 === 2 ? 12 : 0)), t, STEP * 1.8, 0.16, musicBus, 700);
    // arpeggio (16ths)
    if (section >= 1) osc('square', mtof(chord[ARP[s % 8]] + 12), t, STEP * 0.9, 0.035, musicBus, 2400);
    // pad
    if (s === 0) for (const n of chord) { osc('sawtooth', mtof(n), t, STEP * 16, 0.028, musicBus, 1100); osc('sawtooth', mtof(n) * 1.006, t, STEP * 16, 0.02, musicBus, 900); }
    // lead melody in the full section
    if (section === 2) { const n = LEAD[s]; if (n) { const tr = (bar % 8 >= 4) ? -2 : 0; osc('triangle', mtof(n + tr), t, STEP * 3, 0.07, A.delay); osc('triangle', mtof(n + tr), t, STEP * 3, 0.05); } }
    nextNote += STEP; step++;
  }
}

/* ---------------- sfx ---------------- */
A.ring = function () { // UK-style double ring burst
  A.init(); if (!ctx) return;
  const t = ctx.currentTime;
  for (const off of [0, 0.6]) for (const f of [400, 450]) osc('sine', f, t + off, 0.4, 0.14, sfxBus);
};
A.click = function () { A.init(); if (!ctx) return; osc('square', 1200, ctx.currentTime, 0.04, 0.05, sfxBus); };
A.beep = function (f) { A.init(); if (!ctx) return; osc('sine', f || 880, ctx.currentTime, 0.12, 0.08, sfxBus); };
A.chime = function () { A.init(); if (!ctx) return; const t = ctx.currentTime; osc('sine', 988, t, 0.4, 0.08, sfxBus); osc('sine', 784, t + 0.18, 0.5, 0.08, sfxBus); };
A.pickup = function () { A.init(); if (!ctx) return; const t = ctx.currentTime; noiseHit(t, 0.08, 0.2, 800, sfxBus); osc('sine', 350, t + 0.1, 1.2, 0.03, sfxBus); osc('sine', 440, t + 0.1, 1.2, 0.03, sfxBus); };
A.transmit = function (dur) {
  A.init(); if (!ctx) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(1800, t + dur * 0.5); o.frequency.exponentialRampToValueAtTime(120, t + dur);
  f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 2;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.1);
  for (let k = 0; k < 10; k++) noiseHit(t + k * dur / 10, 0.12, 0.08, 3000, sfxBus);
};
A.doors = function () { A.init(); if (!ctx) return; const t = ctx.currentTime; osc('sine', 660, t, 0.25, 0.07, sfxBus); osc('sine', 550, t + 0.3, 0.35, 0.07, sfxBus); noiseHit(t + 0.2, 0.6, 0.05, 500, sfxBus); };
A.thrust = function () { A.init(); if (!ctx) return; noiseHit(ctx.currentTime, 2.5, 0.12, 200, sfxBus); };
})();
