/* ASCII CITY — core utilities (math, hashing, colour, glyphs, storage) */
'use strict';
const AC = window.AC = {};

AC.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
AC.lerp = (a, b, t) => a + (b - a) * t;
AC.smooth = t => t * t * (3 - 2 * t);
AC.fract = x => x - Math.floor(x);
AC.TAU = Math.PI * 2;
AC.angDiff = (a, b) => { let d = (b - a) % AC.TAU; if (d > Math.PI) d -= AC.TAU; if (d < -Math.PI) d += AC.TAU; return d; };

/* ---------- hashing / rng ---------- */
AC.hash = function (a, b, c) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul((c | 0) + 0x3c6ef372, 0x1b873593);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};
AC.h01 = (a, b, c) => AC.hash(a, b, c) / 4294967296;
AC.RNG = function (seed) {
  let s = seed >>> 0;
  const f = function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (a, b) => a + Math.floor(f() * (b - a + 1));
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.range = (a, b) => a + f() * (b - a);
  return f;
};
AC.noise2 = function (x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = AC.h01(xi, yi, seed), b = AC.h01(xi + 1, yi, seed), c = AC.h01(xi, yi + 1, seed), d = AC.h01(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

/* ---------- colour (packed 0xRRGGBB) ---------- */
AC.rgb = (r, g, b) => ((AC.clamp(r | 0, 0, 255) << 16) | (AC.clamp(g | 0, 0, 255) << 8) | AC.clamp(b | 0, 0, 255));
AC.hex = s => parseInt(s.replace('#', ''), 16);
AC.mulC = (c, k) => {
  const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k;
  return ((r > 255 ? 255 : r | 0) << 16) | ((g > 255 ? 255 : g | 0) << 8) | (b > 255 ? 255 : b | 0);
};
AC.mixC = (a, b, t) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const r = ar + (((b >> 16) & 255) - ar) * t, g = ag + (((b >> 8) & 255) - ag) * t, bl = ab + ((b & 255) - ab) * t;
  return ((r | 0) << 16) | ((g | 0) << 8) | (bl | 0);
};
AC.addC = (a, b) => AC.rgb(((a >> 16) & 255) + ((b >> 16) & 255), ((a >> 8) & 255) + ((b >> 8) & 255), (a & 255) + (b & 255));
AC.css = c => '#' + (c & 0xffffff).toString(16).padStart(6, '0');

/* ---------- glyphs ---------- */
// indices 0..127 = ASCII; 128+ = extra glyphs below
AC.EXTRA = '█▓▒░■□▪●○◘▲▼◄►│─┼═║╬¦·°≡≈∙┌┐└┘├┤┬┴╔╗╚╝▀▄▌▐◆◇♦♠♣♥☼♪♫';
AC.g = function (ch) {
  const c = ch.charCodeAt(0);
  if (c < 128) return c;
  const k = AC.EXTRA.indexOf(ch);
  return k >= 0 ? 128 + k : 63;
};
AC.glyphChar = function (i) { return i < 128 ? String.fromCharCode(i) : (AC.EXTRA[i - 128] || '?'); };

/* ---------- compass / formatting ---------- */
// yaw 0 = north (-y), PI/2 = east (+x)
AC.bearing = (dx, dy) => { let a = Math.atan2(dx, -dy) * 180 / Math.PI; if (a < 0) a += 360; return a; };
AC.DIR8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
AC.DIRW = ['NORTH', 'NORTH-EAST', 'EAST', 'SOUTH-EAST', 'SOUTH', 'SOUTH-WEST', 'WEST', 'NORTH-WEST'];
AC.dir8 = deg => AC.DIR8[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
AC.dirW = deg => AC.DIRW[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
AC.fmtDist = m => m < 1000 ? Math.round(m) + 'M' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + 'KM';
AC.fmtDistL = m => m < 1000 ? Math.round(m) + 'm' : (m / 1000).toFixed(1) + 'km';
AC.pad = (s, n, ch) => { s = String(s); while (s.length < n) s += (ch || ' '); return s; };
AC.lpad = (s, n, ch) => { s = String(s); while (s.length < n) s = (ch || ' ') + s; return s; };
AC.dots = (label, n) => AC.pad(label, n, '.');

/* ---------- storage ---------- */
AC.load = function (k, def) { try { const v = localStorage.getItem('asciicity.' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } };
AC.save = function (k, v) { try { localStorage.setItem('asciicity.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } };

/* ---------- global clock (shared/deterministic like the LIVE feed) ---------- */
AC.worldTime = () => Date.now() / 1000;
