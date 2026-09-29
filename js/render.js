/* ASCII CITY — software renderer into a glyph grid (glyph + fg + bg + depth per cell)
   - exterior: heightmap raycaster on a vertical camera plane, rays continue past walls to find taller buildings,
     three tiers (1m detail, 2m mid, 8m far skyline)
   - interiors: grid raycaster whose window cells become live portals back into the exterior city
   - objects: exact ray/quad intersection per cell (pseudo-volumetric boxes & billboards) with depth test */
(function () {
'use strict';
const W = AC.W, TY = W.TYPE, B = 32;
const R = AC.R = {};
R.cellW = 6; R.cellH = 9; R.hfov = 74 * Math.PI / 180;
R.backing = AC.load('backing', true);
R.NEAR = 150; R.MID = 380; R.FAR = 1100;
R.FOG = 0x080b18;
const M = R.M = { g: 32, fg: 0, bg: 0, face: 0 };
const G = ch => AC.g(ch);
const GL_ = {}; for (const ch of ' .,:;\'"`-_=+*#%@|/\\^~<>[]()!?oO0HEMWAXx&$SsTtLlIiYyVvNnUuDdPpRrCcFfKkQqZzBbGgJjwmaehr▓▒░█■●○◘▲▼◄►│─┼═║¦·°≡≈▀▄▌▐◆♦☼♪') GL_[ch] = G(ch);
R.GL = GL_;
const WGC = W.WGLYPH.map(p => [G(p[0]), G(p[1])]);

R.init = function (cols, rows) {
  R.cols = cols; R.rows = rows; R.N = cols * rows;
  R.t0 = new Uint8Array(R.N * 4); R.t1 = new Uint8Array(R.N * 4);
  R.depth = new Float32Array(R.N); R.flag = new Uint8Array(R.N);
  R.SX = new Float32Array(cols); R.SY = new Float32Array(rows);
  R.tanH = Math.tan(R.hfov / 2);
  R.fPx = (cols * R.cellW / 2) / R.tanH; R.FC = R.fPx / R.cellW; R.FR = R.fPx / R.cellH;
  for (let c = 0; c < cols; c++) R.SX[c] = ((c + 0.5) - cols / 2) / R.FC;
};
R.setCamera = function (x, y, z, yaw, pitch) {
  R.cx = x; R.cy = y; R.cz = z; R.yaw = yaw; R.pitch = pitch;
  R.fx = Math.sin(yaw); R.fy = -Math.cos(yaw); R.rx = Math.cos(yaw); R.ry = Math.sin(yaw);
  R.yhR = R.rows / 2 + Math.tan(pitch) * R.FR;
  for (let r = 0; r < R.rows; r++) R.SY[r] = (R.yhR - (r + 0.5)) / R.FR;
};
R.clear = function () { R.depth.fill(1e9); R.flag.fill(0); R.t0.fill(0); R.t1.fill(0); };

function put(i, g, fg, bg) {
  const o = i << 2, t0 = R.t0, t1 = R.t1;
  t0[o] = (fg >> 16) & 255; t0[o + 1] = (fg >> 8) & 255; t0[o + 2] = fg & 255; t0[o + 3] = g;
  t1[o] = (bg >> 16) & 255; t1[o + 1] = (bg >> 8) & 255; t1[o + 2] = bg & 255;
}
R.put = put;
const mulC = AC.mulC, mixC = AC.mixC;
function fogK(t) { return t < 25 ? 1 : Math.exp(-(t - 25) / 650); }
R.fogK = fogK;
function out(i, g, fg, bg, k) {
  put(i, g, k >= 0.999 ? fg : mixC(R.FOG, fg, k), R.backing ? (k >= 0.999 ? bg : mixC(0, bg, k)) : 0);
}
R.out = out;
function hc(x, y, s) { return AC.hash(Math.floor(x), Math.floor(y), s) / 4294967296; }

/* ------------------------------------------------------------------ materials: ground */
let rdx = 0, rdy = 0, reye = 1.7, rsy = 0, rflipX = false, rflipY = false; // current ray (shop windows, sign reading direction)
R.time = 0;
function markOff(x, y) {
  const i = Math.floor(x / B), ox = x - i * B, wv = W.LW[W.lineBase(i)];
  if (ox < wv && W.lineBase(i) > 0) return { v: true, off: ox - wv / 2, along: y };
  const j = Math.floor(y / B), oy = y - j * B, wh = W.LW[W.lineBase(j)];
  return { v: false, off: oy - wh / 2, along: x };
}
function groundCell(type, x, y, t, i) {
  let g = 32, fg = 0x505060, bg = 0x121218;
  const far = t > 70;
  switch (type) {
    case TY.ROAD: case TY.JUNCT: {
      const h = hc(x * 2, y * 2, 3); g = far ? 32 : (h < 0.22 ? 46 : h < 0.3 ? 44 : 32); fg = 0x55556a; bg = 0x16161e; break;
    }
    case TY.MARK: {
      const m = markOff(x, y), a = Math.abs(Math.abs(m.off) - 0.28);
      if (a < 0.16) { g = GL_['=']; fg = 0xf0c020; bg = 0x3a2c08; } else { g = far ? 32 : 46; fg = 0x55556a; bg = 0x16161e; }
      break;
    }
    case TY.MARKD: {
      const m = markOff(x, y);
      if (Math.abs(m.off) < 0.18 && (Math.floor(m.along / 2.5) & 1)) { g = GL_['-']; fg = 0xe8e8f0; bg = 0x303038; } else { g = far ? 32 : 46; fg = 0x55556a; bg = 0x16161e; }
      break;
    }
    case TY.CROSS: {
      // stripes run parallel to the traffic being crossed
      const i2 = Math.floor(x / B), j2 = Math.floor(y / B), ox = x - i2 * B, oy = y - j2 * B;
      const cv = W.lineBase(i2), ch = W.lineBase(j2), wh = W.LW[ch];
      let altX;
      if (cv > 0 && ch > 0) altX = (oy < 2 || oy >= wh - 2); // in the horizontal sidewalk band -> crossing the N-S road
      else altX = cv > 0;
      const s = altX ? x : y;
      if (Math.floor(s * 1.25) & 1) { g = GL_['#']; fg = 0xe0e0e8; bg = 0x5a5a64; } else { g = 32; fg = 0x55556a; bg = 0x16161e; }
      break;
    }
    case TY.SIDEWALK: {
      const fx = AC.fract(x / 1.5), fy = AC.fract(y / 1.5);
      g = far ? 32 : (fx < 0.12 || fy < 0.12) ? GL_['+'] : GL_['.'];
      fg = 0x8a8a98; bg = 0x2a2a34; break;
    }
    case TY.PED: {
      const h = hc(x * 1.5, y * 3, 9);
      g = far ? 32 : (AC.fract(y / 1.2) < 0.15 ? GL_['_'] : (h < 0.5 ? GL_[':'] : GL_['.']));
      fg = 0xa8866e; bg = 0x33261e; break;
    }
    case TY.GRASS: {
      const n = hc(x * 2, y * 2, 11);
      g = far ? (n < 0.3 ? GL_['.'] : 32) : n < 0.35 ? GL_['"'] : n < 0.6 ? GL_[','] : n < 0.75 ? GL_["'"] : GL_['.'];
      fg = n < 0.5 ? 0x4aa040 : 0x2e8a3a; bg = 0x0c2410; break;
    }
    case TY.WATER: case TY.SEA: {
      const w = Math.sin(x * 0.9 + R.time * 1.6) + Math.sin(y * 0.7 - R.time * 1.1);
      g = w > 1.1 ? GL_['~'] : w > 0.2 ? GL_['-'] : 32;
      fg = type === TY.SEA ? 0x2a60a0 : 0x3a90d8; bg = type === TY.SEA ? 0x040c20 : 0x08183a; break;
    }
    case TY.PLAZA: {
      const fx = AC.fract(x / 2), fy = AC.fract(y / 2);
      g = far ? 32 : (fx < 0.1 && fy < 0.1) ? GL_['+'] : (fx < 0.1 || fy < 0.1) ? GL_['.'] : 32;
      fg = 0x9090aa; bg = 0x24242f; break;
    }
    case TY.PATH: { g = far ? 32 : (hc(x * 2, y * 2, 17) < 0.4 ? GL_['.'] : GL_[':']); fg = 0xb0986a; bg = 0x2c2416; break; }
    case TY.SAND: { g = far ? 32 : GL_['.']; fg = 0xc8b080; bg = 0x3a3020; break; }
    case TY.YARD: { g = far ? 32 : (hc(x * 2, y * 2, 21) < 0.3 ? GL_['.'] : 32); fg = 0x808080; bg = 0x1f1f22; break; }
    case TY.PAD: {
      const L = W.layout(Math.floor(x / B), Math.floor(y / B));
      const pad = L.district && L.district.pad;
      const r = pad ? Math.hypot(x - pad.x, y - pad.y) : 9;
      if (Math.abs(r - 5.2) < 0.45) { g = GL_['#']; fg = 0xffd040; bg = 0x3a2c08; }
      else if (r < 3.2 && pad && (Math.abs(x - pad.x) > 1.4 && Math.abs(x - pad.x) < 2.2 || (Math.abs(y - pad.y) < 0.4 && Math.abs(x - pad.x) < 2.2))) { g = GL_['H']; fg = 0xffffff; bg = 0x3a3a48; }
      else { g = GL_['.']; fg = 0x6a6a80; bg = 0x1a1a26; }
      break;
    }
    case TY.RANK: {
      const s = AC.fract((x + y) / 1.6);
      if (s < 0.3) { g = GL_['/']; fg = 0xe0c030; bg = 0x2e2608; } else { g = 32; fg = 0x55556a; bg = 0x16161e; }
      break;
    }
    case TY.STATION: { g = far ? 32 : (AC.fract(x) < 0.5) !== (AC.fract(y) < 0.5) ? GL_['·'] : 32; fg = 0xd0c060; bg = 0x262630; break; }
    default: g = 32;
  }
  out(i, g, fg, bg, fogK(t));
}

/* ------------------------------------------------------------------ signs: glyph letters far away, 3x5 bitmap letters up close */
const FONT = {};
('A:2,5,7,5,5 B:6,5,6,5,6 C:3,4,4,4,3 D:6,5,5,5,6 E:7,4,6,4,7 F:7,4,6,4,4 G:3,4,5,5,3 H:5,5,7,5,5 I:7,2,2,2,7 J:1,1,1,5,2 K:5,5,6,5,5 ' +
 'L:4,4,4,4,7 M:5,7,7,5,5 N:5,7,7,7,5 O:2,5,5,5,2 P:6,5,6,4,4 Q:2,5,5,6,3 R:6,5,6,5,5 S:3,4,2,1,6 T:7,2,2,2,2 U:5,5,5,5,7 V:5,5,5,5,2 W:5,5,7,7,5 ' +
 'X:5,5,2,5,5 Y:5,5,2,2,2 Z:7,1,2,4,7 0:7,5,5,5,7 1:2,6,2,2,7 2:6,1,2,4,7 3:6,1,2,1,6 4:5,5,7,1,1 5:7,4,6,1,6 6:3,4,7,5,7 7:7,1,2,2,2 ' +
 '8:7,5,7,5,7 9:7,5,7,1,6 +:0,2,7,2,0 -:0,0,7,0,0 .:0,0,0,0,2 /:1,1,2,4,4 ::0,2,0,2,0 >:4,2,1,2,4 <:1,2,4,2,1')
  .split(' ').forEach(e => { FONT[e[0]] = e.slice(2).split(',').map(Number); });
/* u: 0..1 left->right as read, v: 0 bottom .. 1 top. writes M */
R.signCell = function (text, u, v, t, fw, fg, bg) {
  const n = text.length || 1, q = Math.min(n - 1, Math.floor(u * n)), lu = u * n - q;
  const ch = text[q] || ' ';
  const cells = (fw / n) / (t / R.FC);
  M.fg = fg; M.bg = bg; M.emit = true;
  if (cells >= 3.6) {
    const pr = Math.floor((1 - v) * 7) - 1, pc = Math.floor(lu * 4);
    const rowBits = FONT[ch] && pr >= 0 && pr < 5 && pc < 3 ? FONT[ch][pr] : 0;
    const on = (rowBits >> (2 - pc)) & 1;
    M.g = on ? GL_['█'] : 32;
    if (!on) M.fg = bg;
    return;
  }
  if (cells >= 1.4 && Math.abs(lu - 0.5) > 0.5 / cells) { M.g = 32; return; }
  const c = ch.charCodeAt(0);
  M.g = c > 32 && c < 128 ? c : 32;
};

/* ------------------------------------------------------------------ materials: walls & roofs */
const SHOPSIGN = { shop: 'STORE', cafe: 'CAFE', arcade: 'ARCADE', clinic: 'CLINIC +', launderette: 'LAUNDERETTE', bar: 'BAR', noodle: 'NOODLES', office: 'LOBBY', apartment: '', warehouse: '', workshop: 'REPAIRS', lobby: 'WELCOME' };
const SIGNCOL = { shop: 0x40e0ff, cafe: 0xffb040, arcade: 0xff40e0, clinic: 0x70ff90, launderette: 0x80c0ff, bar: 0xff5060, noodle: 0xffe040, office: 0xc0d0ff, workshop: 0xffa040, lobby: 0xffffff };
R.SHOPSIGN = SHOPSIGN; R.SIGNCOL = SIGNCOL;
const SHOPUSE = { shop: 1, cafe: 1, arcade: 1, clinic: 1, launderette: 1, bar: 1, noodle: 1, workshop: 1 };
R.isShop = b => !!SHOPUSE[b.use] && b.lm < 0;
/* window test shared with interiors so that portals line up with the facade */
R.windowAt = function (b, u, z) {
  if (b.noWin) return 0;
  const st = b.storey, f = Math.floor(z / st), fz = z - f * st, sc = st / 3.2;
  if (f === 0 && R.isShop(b)) {
    const q = Math.floor(u / 3), fq = u / 3 - q;
    if (q % 3 === 0 && fq > 0.25 && fq < 0.75) return fz < 2.3 ? 4 : 0; // door
    return (fz > 0.35 && fz < 2.4 && fq > 0.06 && fq < 0.94) ? 3 : 0;   // shop window
  }
  const wu = u / b.win, fu = wu - Math.floor(wu);
  if (b.lm >= 0) return (fz > 0.5 * sc && fz < 2.9 * sc && fu > 0.08 && fu < 0.92) ? 1 : 0; // landmark curtain walls
  return (fz > 0.85 * sc && fz < 2.55 * sc && fu > 0.2 && fu < 0.8) ? 1 : 0;
};
function litAt(b, f, wi, side) {
  const base = AC.h01(b.id + side * 7919, f, wi);
  const slow = AC.h01(b.id, f * 31 + wi, Math.floor(R.time / 40 + AC.h01(b.id, wi, f) * 3));
  return base < b.litRatio || slow < 0.02;
}
function shopInterior(b, u, z, t, i, side) {
  // interior mapping: continue the ray into a 6m deep room behind the glass
  const nd = side === 0 ? Math.abs(rdx) : Math.abs(rdy);
  const D = 6, H = b.storey;
  let s = D / Math.max(nd, 0.05), surf = 0;
  if (rsy < 0) { const sf = -z / rsy; if (sf < s) { s = sf; surf = 1; } }
  else if (rsy > 0) { const sc = (H - 0.2 - z) / rsy; if (sc < s) { s = sc; surf = 2; } }
  const t2 = t + s, lat = side === 0 ? (rdy * s) : (rdx * s);
  const uu = u + lat, zz = z + rsy * s;
  const col = SIGNCOL[b.use] || 0xffffff;
  let g, fg, bg;
  if (surf === 1) { g = (Math.floor(uu) + Math.floor(s * nd)) & 1 ? GL_['+'] : GL_['.']; fg = 0x8a8078; bg = 0x2a2420; }
  else if (surf === 2) { const lamp = AC.fract(uu / 3) < 0.3 && AC.fract(s * nd / 3) < 0.4; g = lamp ? GL_['='] : 32; fg = 0xfff0c0; bg = lamp ? 0x806a40 : 0x1e1a18; }
  else {
    // back wall: shelves / machines / counters depending on the business
    const hh = AC.h01(b.id, Math.floor(uu * 1.5), Math.floor(zz * 2));
    switch (b.use) {
      case 'launderette': { const m = AC.fract(uu / 1.4); g = (zz > 0.3 && zz < 1.1 && m > 0.15 && m < 0.85) ? (Math.abs(zz - 0.7) < 0.2 && Math.abs(m - 0.5) < 0.2 ? GL_['O'] : GL_['#']) : GL_[':']; fg = 0xd0e8ff; bg = 0x3a4450; break; }
      case 'arcade': { const m = AC.fract(uu / 1.3); g = (zz > 1.0 && zz < 1.7 && m > 0.2 && m < 0.8) ? GL_['▓'] : (m > 0.15 && m < 0.85 && zz < 1.9 ? GL_['#'] : 32); fg = AC.hash(Math.floor(uu / 1.3), Math.floor(R.time * 4), 3) & 1 ? 0xff40ff : 0x40ffff; bg = 0x201030; break; }
      case 'cafe': case 'bar': case 'noodle': { g = zz < 1.05 ? GL_['='] : (zz > 1.6 && zz < 2.2 && hh < 0.5 ? GL_['o'] : GL_['.']); fg = zz < 1.05 ? 0xc08040 : col; bg = 0x2a1a10; break; }
      case 'clinic': { g = zz < 1.0 ? GL_['_'] : (hh < 0.2 ? GL_['+'] : GL_['.']); fg = 0xd0ffe0; bg = 0x2a3a34; break; }
      default: { const shelf = AC.fract(zz / 0.55) < 0.2; g = shelf ? GL_['='] : (hh < 0.55 ? '!#%$&*'.charCodeAt(Math.floor(hh * 11) % 6) : GL_['.']); fg = shelf ? 0x9a9aa8 : AC.hash(Math.floor(uu * 2), Math.floor(zz * 3), 5) % 2 ? col : 0xffe080; bg = 0x22222e; }
    }
  }
  out(i, g, fg, bg, fogK(t2));
}
function wallCell(b, u, z, side, t, i) {
  const k = fogK(t) * (side ? 1.0 : 0.78);
  let g, fg, bg;
  const col = b.col;
  if (b.noWin) {
    switch (b.kind) {
      case 'hedge': g = hc(u * 2, z * 3, 4) < 0.5 ? GL_['%'] : GL_['&']; fg = 0x3aa040; bg = 0x0e2a12; break;
      case 'chimney': g = (Math.floor(z / 0.6) + Math.floor(u / 0.9)) & 1 ? GL_['#'] : GL_['=']; fg = z > b.h - 2 ? 0xff8040 : 0xa0583a; bg = 0x2a140c; break;
      case 'tank': g = GL_['|']; fg = 0xa0a8b0; bg = 0x282c30; break;
      case 'plinth': g = GL_['#']; fg = 0x9a9aac; bg = 0x2c2c38; break;
      default: g = GL_[':']; fg = mulC(col, 0.6); bg = mulC(col, 0.18);
    }
    out(i, g, fg, bg, k);
    return;
  }
  const st = b.storey, f = Math.floor(z / st), fz = z - f * st;
  const wg = b.lm >= 0 ? [G(b.glyph || '#'), G('#')] : WGC[b.style];
  const rowsPer = st * R.FR / t;
  if (b.lm < 0 && z > b.h - 0.4 && b.roof !== 'pitchX' && b.roof !== 'pitchY') { out(i, GL_['='], mulC(col, 0.85), mulC(col, 0.25), k); return; }
  let lc = b.lit;
  if (b.lm >= 0) { // landmarks: height-graded colour and banded lighting
    const hk = AC.clamp(z / 300, 0, 1);
    const c2 = mixC(col, 0xffffff, hk * 0.35);
    const wu = u / 2, wi = Math.floor(wu);
    const band = (f % 6 === 0) || (b.shape && (f % 11 === 5));
    const on = band || AC.h01(b.id, f, wi) < b.litRatio;
    if (rowsPer < 1.3) { out(i, on ? wg[1] : wg[0], on ? mulC(lc, 0.95) : mulC(c2, 0.62), on ? mulC(lc, 0.3) : mulC(c2, 0.2), Math.max(k, on ? 0.7 : 0)); return; }
    const w = R.windowAt(b, u, z);
    if (w) out(i, on ? wg[1] : GL_['.'], on ? lc : mulC(c2, 0.35), on ? mulC(lc, 0.32) : mulC(c2, 0.1), Math.max(k, on ? 0.75 : 0));
    else out(i, wg[0], mulC(c2, 0.7), mulC(c2, 0.22), k);
    return;
  }
  if (f === 0 && R.isShop(b)) {
    const sc = st / 3.2;
    if (fz > 2.55 * sc && fz < 3.1 * sc) { // neon sign band, centred on the facade and readable from the street
      const txt = SHOPSIGN[b.use] || '', sgc = SIGNCOL[b.use] || 0xffffff;
      const faceLen = side === 0 ? b.y1 - b.y0 : b.x1 - b.x0;
      const uu = (side === 0 ? rflipX : rflipY) ? faceLen - u : u;
      const sw = Math.min(faceLen - 1, txt.length * 0.95), s0 = (faceLen - sw) / 2;
      if (txt && uu > s0 && uu < s0 + sw) { R.signCell(txt, (uu - s0) / sw, (fz - 2.55 * sc) / (0.55 * sc), t, sw, sgc, mulC(sgc, 0.14)); out(i, M.g, M.fg, M.bg, Math.max(k, 0.85)); }
      else out(i, GL_['-'], mulC(sgc, 0.35), mulC(sgc, 0.08), k);
      return;
    }
    const w = R.windowAt(b, u, z);
    if (w === 3) { if (t < 32 && !R.noShopView) { shopInterior(b, u, z, t, i, side); return; } out(i, GL_['▒'], mulC(SIGNCOL[b.use] || 0xffffff, 0.8), 0x201c28, k); return; }
    if (w === 4) { out(i, AC.fract(u / 3) < 0.5 ? GL_['['] : GL_[']'], 0xd0d0d8, 0x303038, k); return; }
    out(i, wg[0], mulC(col, 0.6), mulC(col, 0.2), k);
    return;
  }
  const wu = u / b.win, wi = Math.floor(wu);
  if (rowsPer < 1.15) { // far: stable blended facade, only the lit windows survive
    const lit = litAt(b, f, wi, side) && ((wi + f) & 1);
    if (lit) out(i, wg[1], lc, mulC(lc, 0.22), Math.max(k, 0.6));
    else out(i, wg[0], mulC(col, 0.5), mulC(col, 0.14), k);
    return;
  }
  const w = R.windowAt(b, u, z);
  if (w) {
    if (litAt(b, f, wi, side)) out(i, wg[1], lc, mulC(lc, 0.3), Math.max(k, 0.7));
    else out(i, GL_['.'], mulC(col, 0.32), mulC(col, 0.07), k);
  } else {
    const ledge = fz < 0.18;
    out(i, ledge ? GL_['-'] : wg[0], mulC(col, ledge ? 0.75 : 0.58), mulC(col, 0.19), k);
  }
}
function roofCell(b, x, y, t, i) {
  const k = fogK(t);
  if (!b) { out(i, GL_[':'], 0x505060, 0x181820, k); return; }
  const col = b.col;
  if (b.noWin) {
    if (b.kind === 'hedge') out(i, GL_['%'], 0x50c050, 0x14361a, k);
    else if (b.kind === 'chimney') out(i, GL_['@'], 0x301810, 0x100804, k);
    else out(i, GL_['o'], mulC(col, 0.8), mulC(col, 0.25), k);
    return;
  }
  const e = Math.min(x - b.x0, b.x1 - x, y - b.y0, b.y1 - y);
  if (b.lm >= 0) { out(i, e < 0.8 ? GL_['='] : GL_['+'], mulC(b.lit, 0.8), mulC(col, 0.3), Math.max(k, 0.6)); return; }
  if (b.roof === 'pitchX' || b.roof === 'pitchY') {
    const s = b.roof === 'pitchX' ? y : x;
    out(i, AC.fract(s * 1.4) < 0.5 ? GL_['/'] : GL_['^'], b.dtypeRoof || 0xa05a40, 0x2a1410, k);
    return;
  }
  if (e < 0.7) { out(i, GL_['='], mulC(col, 0.7), mulC(col, 0.2), k); return; }
  const cx = Math.floor(x / 3), cy = Math.floor(y / 3), h = AC.h01(cx, cy, b.id);
  if (b.h > 60 && Math.hypot(x - (b.x0 + b.x1) / 2, y - (b.y0 + b.y1) / 2) < 3.5 && (b.id & 3) === 0) {
    const r = Math.hypot(x - (b.x0 + b.x1) / 2, y - (b.y0 + b.y1) / 2);
    out(i, Math.abs(r - 3) < 0.4 ? GL_['#'] : (r < 1.6 ? GL_['H'] : GL_['.']), 0xffd040, 0x2a2410, k); return;
  }
  if (h < 0.12) out(i, GL_['#'], 0x8a8a90, 0x2a2a30, k);
  else out(i, AC.fract(x) < 0.5 ? GL_[':'] : GL_['.'], mulC(col, 0.38), mulC(col, 0.1), k);
}

/* ------------------------------------------------------------------ sky */
const MOON = { az: 0.95, el: 0.38 };
function skyCell(r, c, i) {
  const sy = R.SY[r], el = Math.atan(sy), az = R.yaw + Math.atan(R.SX[c]);
  const e = AC.clamp(el / 0.7, 0, 1);
  let bg = mixC(0x1c1432, 0x020309, Math.sqrt(e)), g = 32, fg = 0;
  if (el < 0.06) bg = mixC(0x3a1c3a, bg, AC.clamp(el / 0.06, 0, 1));
  if (el > 0.03) {
    const qa = Math.floor(((az % AC.TAU) + AC.TAU) % AC.TAU / 0.0072), qe = Math.floor(el / 0.0115);
    const h = AC.h01(qa, qe, 7);
    if (h < 0.011) { g = h < 0.003 ? GL_['*'] : GL_['.']; fg = h < 0.006 ? 0xd8e0ff : 0x8890c0; }
  }
  let dA = AC.angDiff(MOON.az, az), dE = el - MOON.el;
  const md = Math.hypot(dA, dE * 1.1);
  if (md < 0.045) { g = md < 0.03 ? GL_['█'] : GL_['▓']; fg = 0xf0f0d8; bg = 0x5a5a50; }
  else if (md < 0.09) bg = mixC(0x2a2a3a, bg, (md - 0.045) / 0.045);
  put(i, g, fg, R.backing ? bg : mulC(bg, 0.35));
}
R.skyCell = skyCell;

/* ------------------------------------------------------------------ exterior column cast */
const LEV_S = [1, 2, 8], LEV_SH = [5, 4, 2];
R.coarseBudget = 0;
function castColumn(c, ox, oy, eyeZ, tStart, mask, skipB, tFar) {
  const rows = R.rows, cols = R.cols, FR = R.FR, yhR = R.yhR, SY = R.SY, depth = R.depth, flag = R.flag;
  const dx = R.fx + R.rx * R.SX[c], dy = R.fy + R.ry * R.SX[c];
  const adx = Math.max(Math.abs(dx), 1e-9), ady = Math.max(Math.abs(dy), 1e-9);
  const sgx = dx > 0 ? 1 : -1, sgy = dy > 0 ? 1 : -1;
  rdx = dx; rdy = dy; reye = eyeZ; rflipX = sgx < 0; rflipY = sgy > 0;
  let ceil = rows, t = tStart, side = 0;
  const ends = [R.NEAR, R.MID, tFar];
  for (let lv = 0; lv < 3 && ceil > 0; lv++) {
    const tEnd = ends[lv];
    if (t >= tEnd) continue;
    const S = LEV_S[lv], sh = LEV_SH[lv], cpc = 1 << sh, cm = cpc - 1;
    const px = ox + dx * t, py = oy + dy * t;
    let cellX = Math.floor(px / S), cellY = Math.floor(py / S);
    const tDX = S / adx, tDY = S / ady;
    let tMaxX = t + (sgx > 0 ? ((cellX + 1) * S - px) : (px - cellX * S)) / adx;
    let tMaxY = t + (sgy > 0 ? ((cellY + 1) * S - py) : (py - cellY * S)) / ady;
    let kxL = -99999, kyL = -99999, aH = null, aT = null, aB = null, blds = null;
    while (t < tEnd && ceil > 0) {
      const tNext = tMaxX < tMaxY ? tMaxX : tMaxY;
      const kx = cellX >> sh, ky = cellY >> sh;
      if (kx !== kxL || ky !== kyL) {
        kxL = kx; kyL = ky;
        if (kx < 0 || ky < 0 || kx >= 256 || ky >= 256) aH = null;
        else if (lv === 0) { const ch = W.chunk(kx, ky); aH = ch.h; aT = ch.type; aB = ch.bi; blds = ch.buildings; }
        else if (lv === 1) { const ch = W.chunk(kx, ky), m = ch.mip[0]; aH = m.h; aT = m.type; aB = m.bi; blds = ch.buildings; }
        else {
          let co = W.coarseCached(kx, ky);
          if (!co && R.coarseBudget > 0) { R.coarseBudget--; co = W.coarse(kx, ky); }
          if (co) { aH = co.h; aT = co.type; aB = co.bi; blds = co.buildings; } else { aH = undefined; }
        }
      }
      let h = 0, type = TY.SEA, b = null;
      if (aH) { const idx = (cellY & cm) * cpc + (cellX & cm); h = aH[idx]; type = aT[idx]; const bi = aB[idx]; if (bi >= 0) b = blds[bi]; }
      else if (aH === undefined) type = TY.ROAD;
      if (h > 0 && b && b === skipB) { /* our own building seen from inside: transparent */ }
      else if (h > 0) {
        if (t > 0.05) {
          let r0 = Math.ceil(yhR - (h - eyeZ) * FR / t - 0.5); if (r0 < 0) r0 = 0;
          let r1 = ceil - 1; const rg = Math.ceil(yhR + eyeZ * FR / t - 0.5) - 1; if (r1 > rg) r1 = rg;
          if (r0 <= r1) {
            const hx = ox + dx * t, hy = oy + dy * t;
            if (b) {
              const u = side === 0 ? (hy - b.y0) : (hx - b.x0);
              for (let r = r1; r >= r0; r--) { const i = r * cols + c; if (mask && !(flag[i] & 1)) continue; rsy = SY[r]; wallCell(b, u, eyeZ + SY[r] * t, side, t, i); depth[i] = t; }
            } else for (let r = r1; r >= r0; r--) { const i = r * cols + c; if (mask && !(flag[i] & 1)) continue; out(i, GL_[':'], 0x505068, 0x16161e, fogK(t)); depth[i] = t; }
            ceil = r0;
          }
        }
        if (eyeZ > h) {
          let r0 = Math.ceil(yhR + (eyeZ - h) * FR / tNext - 0.5); if (r0 < 0) r0 = 0;
          let r1 = Math.ceil(yhR + (eyeZ - h) * FR / (t > 0.05 ? t : 0.05) - 0.5) - 1; if (r1 > ceil - 1) r1 = ceil - 1;
          if (r0 <= r1) {
            for (let r = r1; r >= r0; r--) {
              const i = r * cols + c; if (mask && !(flag[i] & 1)) continue;
              const tr = (eyeZ - h) * FR / ((r + 0.5) - yhR);
              roofCell(b, ox + dx * tr, oy + dy * tr, tr, i); depth[i] = tr;
            }
            ceil = r0;
          }
        }
      } else if (eyeZ > 0) {
        let r0 = Math.ceil(yhR + eyeZ * FR / tNext - 0.5); if (r0 < 0) r0 = 0;
        let r1 = Math.ceil(yhR + eyeZ * FR / (t > 0.05 ? t : 0.05) - 0.5) - 1; if (r1 > ceil - 1) r1 = ceil - 1;
        if (r0 <= r1) {
          for (let r = r1; r >= r0; r--) {
            const i = r * cols + c; if (mask && !(flag[i] & 1)) continue;
            const tr = eyeZ * FR / ((r + 0.5) - yhR);
            groundCell(type, ox + dx * tr, oy + dy * tr, tr, i); depth[i] = tr;
          }
          ceil = r0;
        }
      }
      if (tMaxX < tMaxY) { t = tMaxX; tMaxX += tDX; cellX += sgx; side = 0; }
      else { t = tMaxY; tMaxY += tDY; cellY += sgy; side = 1; }
    }
  }
  for (let r = ceil - 1; r >= 0; r--) { const i = r * cols + c; if (mask && !(flag[i] & 1)) continue; skyCell(r, c, i); depth[i] = 1e9; }
}
R.castColumn = castColumn;

R.renderExterior = function () {
  R.coarseBudget = 700;
  const far = R.cz > 60 ? 2600 : R.cz > 20 ? 1600 : R.FAR;
  for (let c = 0; c < R.cols; c++) castColumn(c, R.cx, R.cy, R.cz, 0, false, null, far);
};

/* ------------------------------------------------------------------ interiors */
// I = { x0, y0, w, h, grid (0 floor, 1 ext wall, 2 partition, 3 door, 4 lift, 9 furniture), floorZ, ceilZ, b, pal }
R.renderInterior = function (I) {
  const rows = R.rows, cols = R.cols, FR = R.FR, yhR = R.yhR, SY = R.SY, depth = R.depth, flag = R.flag;
  const eye = R.cz, fz = I.floorZ, cz = I.ceilZ, grid = I.grid, gw = I.w, gh = I.h;
  const lx = R.cx - I.x0, ly = R.cy - I.y0;
  const pal = I.pal;
  R.coarseBudget = 300;
  for (let c = 0; c < cols; c++) {
    const dx = R.fx + R.rx * R.SX[c], dy = R.fy + R.ry * R.SX[c];
    const adx = Math.max(Math.abs(dx), 1e-9), ady = Math.max(Math.abs(dy), 1e-9);
    const sgx = dx > 0 ? 1 : -1, sgy = dy > 0 ? 1 : -1;
    let cx = Math.floor(lx), cy = Math.floor(ly);
    let tMaxX = (sgx > 0 ? (cx + 1 - lx) : (lx - cx)) / adx, tMaxY = (sgy > 0 ? (cy + 1 - ly) : (ly - cy)) / ady;
    const tDX = 1 / adx, tDY = 1 / ady;
    let t = 0, side = 0, code = 1;
    for (let n = 0; n < 200; n++) {
      if (tMaxX < tMaxY) { t = tMaxX; tMaxX += tDX; cx += sgx; side = 0; } else { t = tMaxY; tMaxY += tDY; cy += sgy; side = 1; }
      if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) { code = 1; break; }
      code = grid[cy * gw + cx];
      if (code >= 1 && code <= 4) break;
    }
    const hx = R.cx + dx * t, hy = R.cy + dy * t;
    const u = side === 0 ? (hy - I.y0) : (hx - I.x0);
    const ub = I.b ? (side === 0 ? hy - I.b.y0 : hx - I.b.x0) : u;
    let rTop = Math.ceil(yhR - (cz - eye) * FR / t - 0.5), rBot = Math.ceil(yhR + (eye - fz) * FR / t - 0.5);
    let portal = false;
    const k = side ? 1 : 0.82;
    for (let r = 0; r < rows; r++) {
      const i = r * cols + c;
      if (r < rTop) { // ceiling
        const tr = (cz - eye) * FR / (yhR - (r + 0.5));
        const x = R.cx + dx * tr - I.x0, y = R.cy + dy * tr - I.y0;
        const lamp = !I.solid && AC.fract(x / 4) < 0.28 && AC.fract(y / 4) < 0.28;
        out(i, lamp ? GL_['='] : (AC.fract(x) < 0.1 || AC.fract(y) < 0.1 ? GL_['+'] : GL_['.']), lamp ? 0xfff4d0 : mulC(pal.ceil, 1.6), lamp ? 0x7a7050 : pal.ceil, 1);
        depth[i] = tr;
      } else if (r >= rBot) { // floor
        const tr = (eye - fz) * FR / ((r + 0.5) - yhR);
        const x = R.cx + dx * tr - I.x0, y = R.cy + dy * tr - I.y0;
        const chk = (Math.floor(x / pal.tile) + Math.floor(y / pal.tile)) & 1;
        const lk = I.solid ? AC.clamp(1.25 - Math.hypot(x - 4, y - 3.2) / 5, 0.45, 1.1) : Math.max(0.55, 1 - tr / 60);
        out(i, chk ? GL_['.'] : GL_[':'], mulC(pal.floor, (chk ? 2.2 : 1.8) * lk), mulC(pal.floor, (chk ? 1 : 0.8) * lk), 1);
        depth[i] = tr;
      } else { // wall
        const z = eye + SY[r] * t;
        if (code === 1 && I.b) {
          const w = R.windowAt(I.b, ub, z);
          if (w === 1 || w === 3) { flag[i] |= 1; portal = true; depth[i] = t; put(i, 32, 0, 0); continue; }
          if (w === 4 && I.floor === 0) { out(i, AC.fract(ub / 3) < 0.5 ? GL_['['] : GL_[']'], 0xe0e0e8, 0x40404c, 1); depth[i] = t; continue; }
        }
        const zz = z - fz;
        let g, fg, bg;
        if (code === 3) { g = zz < 2.2 ? (zz > 1.0 && zz < 1.15 ? GL_['o'] : GL_['|']) : GL_['=']; fg = pal.door; bg = mulC(pal.door, 0.3); }
        else if (code === 4) { const m = AC.fract(u); g = zz < 2.3 ? (m < 0.5 ? GL_['['] : GL_[']']) : (zz < 2.6 ? GL_['▲'] : GL_['=']); fg = 0xd0d8e0; bg = 0x3a4048; }
        else if (pal.dado && zz < 0.95) { g = zz > 0.85 ? GL_['='] : (AC.fract(u / 0.6) < 0.12 ? GL_['|'] : GL_[':']); fg = mulC(pal.dado, 1.6); bg = pal.dado; }
        else { g = zz < 0.15 ? GL_['_'] : (AC.fract(u / 1.2) < 0.08 ? GL_['|'] : pal.wg); fg = mulC(pal.wall, 1.7); bg = pal.wall; }
        const wl = I.solid ? AC.clamp(1.3 - Math.hypot(hx - I.x0 - 4, hy - I.y0 - 3.2) / 6, 0.4, 1.1) * AC.clamp(1.25 - Math.abs(zz - 2.0) / 3, 0.5, 1) : 1;
        out(i, g, mulC(fg, k * wl), mulC(bg, k * wl), I.solid ? 1 : Math.max(0.5, 1 - t / 60));
        depth[i] = t;
      }
    }
    if (portal) castColumn(c, R.cx, R.cy, eye, t + 0.55, true, I.b, 1400);
  }
};

/* ------------------------------------------------------------------ objects: ray/quad per cell */
const NEARZ = 0.06;
R.maskObjects = false;
const clipBuf = [];
function projBounds(px, py, pz) {
  // px,py,pz: arrays of 4 world coords. returns [c0,c1,r0,r1] or null
  const cx = R.cx, cy = R.cy, cz = R.cz, fx = R.fx, fy = R.fy, rx = R.rx, ry = R.ry;
  const X = [], Z = [], Y = [];
  for (let k = 0; k < 4; k++) {
    const wx = px[k] - cx, wy = py[k] - cy;
    X.push(wx * rx + wy * ry); Z.push(wx * fx + wy * fy); Y.push(pz[k] - cz);
  }
  // clip polygon against Z > NEARZ
  clipBuf.length = 0;
  for (let k = 0; k < 4; k++) {
    const k2 = (k + 1) & 3, za = Z[k], zb = Z[k2];
    if (za > NEARZ) clipBuf.push(X[k], Y[k], za);
    if ((za > NEARZ) !== (zb > NEARZ)) {
      const s = (NEARZ - za) / (zb - za);
      clipBuf.push(X[k] + (X[k2] - X[k]) * s, Y[k] + (Y[k2] - Y[k]) * s, NEARZ);
    }
  }
  if (!clipBuf.length) return null;
  let c0 = 1e9, c1 = -1e9, r0 = 1e9, r1 = -1e9;
  for (let k = 0; k < clipBuf.length; k += 3) {
    const col = R.cols / 2 + clipBuf[k] / clipBuf[k + 2] * R.FC;
    const row = R.yhR - clipBuf[k + 1] / clipBuf[k + 2] * R.FR;
    if (col < c0) c0 = col; if (col > c1) c1 = col; if (row < r0) r0 = row; if (row > r1) r1 = row;
  }
  c0 = Math.max(0, Math.floor(c0)); c1 = Math.min(R.cols - 1, Math.floor(c1));
  r0 = Math.max(0, Math.floor(r0)); r1 = Math.min(R.rows - 1, Math.floor(r1));
  if (c0 > c1 || r0 > r1) return null;
  return [c0, c1, r0, r1];
}
const PX = [0, 0, 0, 0], PY = [0, 0, 0, 0], PZ = [0, 0, 0, 0];
const LIGHT = { x: 0.45, y: -0.6, z: 0.66 };
/* face: origin o, edge vectors U, V. mat: {g,fg,bg} or {fn(u,v,t)->bool (fills M)}. opts bits: 1 twoSided, 2 emissive */
R.face = function (ox, oy, oz, ux, uy, uz, vx, vy, vz, mat, opts, faceId) {
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const wx = ox - R.cx, wy = oy - R.cy, wz = oz - R.cz;
  const nd = nx * wx + ny * wy + nz * wz;
  if (!(opts & 1) && nd >= 0) return;
  PX[0] = ox; PY[0] = oy; PZ[0] = oz; PX[1] = ox + ux; PY[1] = oy + uy; PZ[1] = oz + uz;
  PX[2] = ox + ux + vx; PY[2] = oy + uy + vy; PZ[2] = oz + uz + vz; PX[3] = ox + vx; PY[3] = oy + vy; PZ[3] = oz + vz;
  const bb = projBounds(PX, PY, PZ);
  if (!bb) return;
  const fx = R.fx, fy = R.fy, rx = R.rx, ry = R.ry;
  const A = nx * fx + ny * fy, Bc = nx * rx + ny * ry;
  const wU = wx * ux + wy * uy + wz * uz, fU = fx * ux + fy * uy, rU = rx * ux + ry * uy;
  const wV = wx * vx + wy * vy + wz * vz, fV = fx * vx + fy * vy, rV = rx * vx + ry * vy;
  const iUU = 1 / (ux * ux + uy * uy + uz * uz), iVV = 1 / (vx * vx + vy * vy + vz * vz);
  const nl = Math.hypot(nx, ny, nz) || 1;
  let shade = (opts & 2) ? 1 : 0.62 + 0.38 * Math.max(0, (nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z) / nl * ((opts & 1) && nd > 0 ? -1 : 1));
  if (nz / nl > 0.9) shade = Math.max(shade, 0.95);
  const SX = R.SX, SY = R.SY, depth = R.depth, flag = R.flag, cols = R.cols, mask = R.maskObjects;
  const fn = mat.fn;
  M.face = faceId || 0; M.fw = Math.sqrt(1 / iUU); M.fh = Math.sqrt(1 / iVV);
  for (let r = bb[2]; r <= bb[3]; r++) {
    const sy = SY[r], row = r * cols;
    for (let c = bb[0]; c <= bb[1]; c++) {
      const sx = SX[c];
      const den = A + Bc * sx + nz * sy;
      if (den > -1e-9 && den < 1e-9) continue;
      const t = nd / den;
      const i = row + c;
      if (t <= NEARZ || t >= depth[i]) continue;
      if (mask && !(flag[i] & 1)) continue;
      const u = (t * (fU + sx * rU + sy * uz) - wU) * iUU;
      if (u < 0 || u > 1) continue;
      const v = (t * (fV + sx * rV + sy * vz) - wV) * iVV;
      if (v < 0 || v > 1) continue;
      if (fn) { if (!fn(u, v, t)) continue; }
      else { M.g = mat.g; M.fg = mat.fg; M.bg = mat.bg; }
      const k = (M.emit ? 1 : shade) * fogK(t);
      M.emit = false;
      put(i, M.g, mulC(M.fg, k), R.backing ? mulC(M.bg, k) : 0);
      depth[i] = t;
    }
  }
};
/* oriented box. yaw: heading of +length axis (0 = north). mats: single material or array [front, back, right, left, top, bottom] */
R.box = function (cx, cy, z0, len, wid, hgt, yaw, mats, opts) {
  const Fx = Math.sin(yaw), Fy = -Math.cos(yaw), Sx = Math.cos(yaw), Sy = Math.sin(yaw);
  const hl = len / 2, hw = wid / 2, z1 = z0 + hgt;
  const arr = Array.isArray(mats);
  const m = k => arr ? mats[k] : mats;
  const o = opts || 0;
  // front (+F)
  if (m(0)) R.face(cx + Fx * hl - Sx * hw, cy + Fy * hl - Sy * hw, z0, Sx * wid, Sy * wid, 0, 0, 0, hgt, m(0), o, 0);
  if (m(1)) R.face(cx - Fx * hl + Sx * hw, cy - Fy * hl + Sy * hw, z0, -Sx * wid, -Sy * wid, 0, 0, 0, hgt, m(1), o, 1);
  if (m(2)) R.face(cx + Fx * hl + Sx * hw, cy + Fy * hl + Sy * hw, z0, -Fx * len, -Fy * len, 0, 0, 0, hgt, m(2), o, 2);
  if (m(3)) R.face(cx - Fx * hl - Sx * hw, cy - Fy * hl - Sy * hw, z0, Fx * len, Fy * len, 0, 0, 0, hgt, m(3), o, 3);
  if (m(4)) R.face(cx - Fx * hl - Sx * hw, cy - Fy * hl - Sy * hw, z1, Fx * len, Fy * len, 0, Sx * wid, Sy * wid, 0, m(4), o, 4);
  // bottom (only survives back-face culling when seen from below: canopies, roofs, beams, ceilings)
  if (R.cz < z0) { const mb = arr ? (mats[5] || mats[0]) : mats; if (mb) R.face(cx - Fx * hl - Sx * hw, cy - Fy * hl - Sy * hw, z0, Sx * wid, Sy * wid, 0, Fx * len, Fy * len, 0, mb, o, 5); }
};
/* axis-aligned box helper (x0,y0,z0)-(x1,y1,z1) */
R.aabb = function (x0, y0, z0, x1, y1, z1, mats, opts) {
  R.box((x0 + x1) / 2, (y0 + y1) / 2, z0, y1 - y0, x1 - x0, z1 - z0, 0, mats, opts);
};
R.billboard = function (x, y, z0, w, h, mat) {
  R.face(x - R.rx * w / 2, y - R.ry * w / 2, z0, R.rx * w, R.ry * w, 0, 0, 0, h, mat, 1 | 2, 0);
};
/* quick visibility: sphere vs view frustum, plus a coarse depth-buffer occlusion test */
R.visible = function (x, y, z, rad, maxD) {
  const wx = x - R.cx, wy = y - R.cy;
  const zc = wx * R.fx + wy * R.fy;
  if (zc < -rad || zc > (maxD || 400) + rad) return false;
  const xc = wx * R.rx + wy * R.ry;
  if (Math.abs(xc) - rad > (Math.max(zc, 0) + rad) * R.tanH * 1.05) return false;
  if (zc > rad * 2 + 2) {
    const col = Math.floor(R.cols / 2 + xc / zc * R.FC), row = Math.floor(R.yhR - (z - R.cz) / zc * R.FR);
    const sr = Math.ceil(rad / zc * R.FC) + 1, near = zc - rad;
    let hidden = true;
    for (let q = 0; q < 5 && hidden; q++) {
      const cc = col + (q === 1 ? -sr : q === 2 ? sr : 0), rr = row + (q === 3 ? -sr : q === 4 ? sr : 0);
      if (cc < 0 || cc >= R.cols || rr < 0 || rr >= R.rows) { hidden = false; break; }
      if (R.depth[rr * R.cols + cc] > near) hidden = false;
    }
    if (hidden) return false;
  }
  return true;
};
/* project a world point: returns {c, r, t} or null */
R.project = function (x, y, z) {
  const wx = x - R.cx, wy = y - R.cy, zc = wx * R.fx + wy * R.fy;
  if (zc < 0.1) return null;
  const xc = wx * R.rx + wy * R.ry;
  return { c: R.cols / 2 + xc / zc * R.FC, r: R.yhR - (z - R.cz) / zc * R.FR, t: zc };
};
/* text sign material factory */
R.textMat = function (text, fg, bg) {
  // box faces run u towards the viewer's left, so read it mirrored
  return { fn: (u, v, t) => { R.signCell(text, 1 - u, v, t, M.fw, fg, bg); return true; } };
};

/* ------------------------------------------------------------------ screen effects */
const RAIN = '01ｱｲｳｴｵ';
R.fxMatrix = function (p, time) {
  // Matrix-style construction: the view is assembled column by column out of falling glyph rain
  const cols = R.cols, rows = R.rows;
  for (let c = 0; c < cols; c++) {
    const seed = AC.h01(c, 0, 99), speed = 18 + seed * 30, len = 8 + Math.floor(seed * 18);
    const head = (time * speed + seed * 200) % (rows + len + 10);
    const reveal = AC.clamp((p * 1.35 - seed * 0.35) * rows * 1.25, -1, rows + 1);
    for (let r = 0; r < rows; r++) {
      const i = r * cols + c;
      if (r < reveal - 2) continue;
      const d = head - r;
      if (d >= 0 && d < len) {
        const ch = 33 + (AC.hash(c, r, Math.floor(time * 12 + d)) % 90);
        put(i, ch, d < 1 ? 0xe8ffe8 : mulC(0x30ff60, 1 - d / len), d < 1 ? 0x1a4a1a : 0x001200);
      } else if (r < reveal) {
        const o = i << 2; R.t0[o] = R.t0[o] >> 1; R.t0[o + 1] = Math.min(255, R.t0[o + 1] + 40); R.t0[o + 2] >>= 1;
      } else put(i, 32, 0, 0x000400);
    }
  }
};
R.fxTransmit = function (p, time) {
  // relay transfer: the picture is broken into streaming signal
  const cols = R.cols, rows = R.rows, s = Math.sin(p * Math.PI);
  for (let r = 0; r < rows; r++) {
    const shift = Math.floor((AC.h01(r, Math.floor(time * 20), 5) - 0.5) * s * 40);
    const band = AC.h01(Math.floor(r / 3), Math.floor(time * 8), 9) < s * 0.9;
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const hh = AC.h01(c, r, Math.floor(time * 30));
      if (band || hh < s * 0.85) {
        const ch = hh < 0.5 ? (48 + (AC.hash(c + shift, r, Math.floor(time * 15)) & 1)) : (33 + AC.hash(c, r, Math.floor(time * 25)) % 90);
        const bright = AC.clamp(1 - Math.abs(((c + shift + time * 90) % 60) - 30) / 30, 0.2, 1);
        put(i, ch, mulC(hh < 0.2 ? 0xffffff : 0x40ffd0, bright), mulC(0x003828, s));
      }
    }
  }
};
R.fxFade = function (k) {
  const t0 = R.t0, t1 = R.t1, n = R.N * 4;
  for (let o = 0; o < n; o += 4) { t0[o] *= k; t0[o + 1] *= k; t0[o + 2] *= k; t1[o] *= k; t1[o + 1] *= k; t1[o + 2] *= k; }
};
R.textAt = function (c, r, text, fg, bg) {
  for (let k = 0; k < text.length; k++) {
    const cc = c + k; if (cc < 0 || cc >= R.cols || r < 0 || r >= R.rows) continue;
    const ch = text.charCodeAt(k);
    put(r * R.cols + cc, ch < 128 ? ch : AC.g(text[k]), fg, bg !== undefined ? bg : 0);
  }
};
})();
