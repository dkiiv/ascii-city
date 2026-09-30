/* ============================================================
   ASCII CITY — render.js
   One ray per character cell. A 2D DDA across the XZ grid solves
   the first hit (wall / roof / tree / elevated deck / ground),
   distance drives perspective and fog, and every hit is painted
   as a letter, digit or symbol. Sprites (cars, people, signs,
   props, the monorail) are depth-tested into the same cell grid.
   ============================================================ */
(function (global) {
"use strict";
const AC = global.AC = global.AC || {};
const W = AC.W;

const T = W.T;
const CELL = W.CELL, GW = W.GW, GH = W.GH;
const MAXD = 110;

const HIT_GROUND = 0, HIT_BUILD = 1, HIT_TREE = 2, HIT_DECK = 3, HIT_UNDER = 4;

// ---------- ramps ----------
const RAMPS = {
  CLASSIC: " .·,:-_~!=+*oa0#%&@",
  SOLID:   " ░▒▓▓▒▓█▓█▓█",
  OUTLINE: " .·:-=+hnm#&@",
  DENSE:   " .,:;i!+*oe$a8B%&@"
};
const MODES = ["CLASSIC", "SOLID", "OUTLINE", "DENSE"];

// ---------- palette ----------
const FOG = [7, 11, 24];
const MOON = [0.34, 0.80, -0.46];
const MOON_LEN = Math.hypot(MOON[0], MOON[1], MOON[2]);

// ---------- canvas ----------
let canvas, ctx;
let cols = 0, rows = 0, cellW = 10, cellH = 16, fontPx = 15;
let fontBase = "bold 15px Consolas, Menlo, monospace";
let depthBuf, charBuf, colorBuf, sizeBuf;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const _cs = new Map();
function cs(r, g, b) {
  r = clamp(r, 0, 255) & 0xF8; g = clamp(g, 0, 255) & 0xF8; b = clamp(b, 0, 255) & 0xF8;
  const k = (r << 16) | (g << 8) | b;
  let s = _cs.get(k);
  if (!s) { s = "rgb(" + r + "," + g + "," + b + ")"; _cs.set(k, s); }
  return s;
}

// ---------- state ----------
const R = {
  mode: 0,
  showPeds: true,
  rain: 0, rainTarget: 0,
  flash: 0,
  stats: { visible: 0, rays: 0, sprTry: 0, sprDrawn: 0 },
  MODES,
  get modeName() { return MODES[R.mode]; }
};

function init(c) {
  canvas = c;
  ctx = canvas.getContext("2d", { alpha: false });
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  return R;
}

function resize() {
  const dpr = 1;
  canvas.width = Math.max(320, Math.floor(canvas.clientWidth * dpr));
  canvas.height = Math.max(240, Math.floor(canvas.clientHeight * dpr));
  cols = Math.max(8, Math.ceil(canvas.width / cellW));
  rows = Math.max(8, Math.ceil(canvas.height / cellH));
  fontBase = "bold " + fontPx + "px Consolas, Menlo, monospace";
  ctx.font = fontBase;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const n = cols * rows;
  depthBuf = new Float32Array(n);
  charBuf = new Array(n);
  colorBuf = new Array(n);
  sizeBuf = new Float32Array(n);
}

function setDensity(dir) {
  cellW = clamp(cellW + dir * 2, 7, 24);
  cellH = Math.round(cellW * 1.55);
  fontPx = Math.round(cellH * 0.92);
  resize();
}

// ------------------------------------------------------------------------
//  RAY CAST
// ------------------------------------------------------------------------
const hit = { t: 0, type: -1, nx: 0, ny: 0, nz: 0, hx: 0, hy: 0, hz: 0, cell: -1, face: 0 };

function castRay(ox, oy, oz, dx, dy, dz) {
  let bestT = MAXD, type = -1, face = 0, cell = -1;

  if (dy < -1e-7) {
    const tg = oy / -dy;
    if (tg < bestT) { bestT = tg; type = HIT_GROUND; face = 2; }
  }

  let mx = Math.floor(ox / CELL), mz = Math.floor(oz / CELL);
  const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const ddx = Math.abs(1 / (dx || 1e-9)), ddz = Math.abs(1 / (dz || 1e-9));
  let sdx = dx > 0 ? (mx + 1 - ox / CELL) * ddx : (ox / CELL - mx) * ddx;
  let sdz = dz > 0 ? (mz + 1 - oz / CELL) * ddz : (oz / CELL - mz) * ddz;
  let t0 = 0, side = 0;

  for (let guard = 0; guard < 260; guard++) {
    let t1;
    if (sdx < sdz) { t1 = sdx; mx += stepX; sdx += ddx; side = 0; }
    else           { t1 = sdz; mz += stepZ; sdz += ddz; side = 1; }
    if (t1 > bestT) break;
    if (!W.inBounds(mx, mz)) break;

    const c = W.idx(mx, mz);
    const h = W.height[c];
    const tl = W.tile[c];

    if (tl === T.BUILD && h > 0) {
      const y0 = oy + dy * t0;
      if (y0 <= h + 1e-4) { bestT = t0; type = HIT_BUILD; face = side; cell = c; break; }
      if (dy < 0) {
        const tr = (oy - h) / dy;
        if (tr >= t0 && tr <= t1) { bestT = tr; type = HIT_BUILD; face = 2; cell = c; break; }
      }
    } else if (h > 0 && tl !== T.WATER) {                       // tree blob
      const y0 = oy + dy * t0, y1 = oy + dy * t1;
      const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
      if (lo < h && hi > 0.25) {
        const tt = lo > 0.25 ? ((lo - 0.25) / ((hi - 0.25) || 1)) * (t1 - t0) + t0 : t0;
        if (tt < bestT) { bestT = tt; type = HIT_TREE; face = side; cell = c; break; }
      }
    }

    // elevated monorail deck: a slab [dh-0.55, dh]
    const dh = W.deck[c];
    if (dh > 0) {
      const lo = dh - 0.55, hi = dh;
      const yA = oy + dy * t0, yB = oy + dy * t1;
      const ymin = yA < yB ? yA : yB, ymax = yA > yB ? yA : yB;
      if (ymax > lo && ymin < hi) {
        let tt = t0;
        if (Math.abs(dy) > 1e-7) tt = Math.max(t0, dy > 0 ? (lo - oy) / dy : (hi - oy) / dy);
        if (tt < bestT) {
          bestT = tt; type = HIT_DECK; cell = c;
          face = dy > 0 ? HIT_UNDER : 2;
          break;
        }
      }
    }
    t0 = t1;
  }

  if (type === -1) return false;
  hit.t = bestT; hit.type = type; hit.cell = cell; hit.face = face;
  hit.hx = ox + dx * bestT; hit.hy = oy + dy * bestT; hit.hz = oz + dz * bestT;
  hit.nx = face === 0 ? (dx > 0 ? -1 : 1) : 0;
  hit.nz = face === 1 ? (dz > 0 ? -1 : 1) : 0;
  hit.ny = face === 2 ? 1 : (face === HIT_UNDER ? -1 : 0);
  return true;
}

// ------------------------------------------------------------------------
//  SHADING
// ------------------------------------------------------------------------
let ramp = RAMPS.CLASSIC;
function rampAt(l) {
  const r = ramp || RAMPS.CLASSIC;
  return r[clamp(Math.round(l * (r.length - 1)), 0, r.length - 1)];
}

function shade(nx, ny, nz, base) {
  const d = Math.max(0, nx * MOON[0] + ny * MOON[1] + nz * MOON[2]);
  const k = 0.30 + 0.85 * d;
  return [base[0] * k, base[1] * k, base[2] * k];
}

// returns [char, r, g, b, sizeMul]
function surface(h, dist, time, wetAmt) {
  const t = h.type;

  if (t === HIT_GROUND) {
    const gx = Math.floor(h.hx / CELL), gz = Math.floor(h.hz / CELL);
    if (!W.inBounds(gx, gz)) return [" ", 0, 0, 0, 0];
    const c = W.idx(gx, gz), tt = W.tile[c];
    const glow = Math.min(1.45, W.lightmap[c] * (1 + wetAmt * 0.85));

    if (tt === T.WATER) {
      const rip = Math.sin(h.hx * 0.35 + time * 0.0016) + Math.cos(h.hz * 0.29 - time * 0.0011);
      const l = 0.10 + 0.06 * rip + glow * 0.10;
      return [rip > 0.6 ? "~" : (rip < -0.6 ? "," : ":"), 40 + glow * 70, 80 + glow * 90, 130 + glow * 120, 1];
    }
    if (tt === T.ROAD) {
      const rx = h.hx / CELL, rz = h.hz / CELL;
      const cxm = rx - Math.floor(rx / W.PERIOD) * W.PERIOD;
      const czm = rz - Math.floor(rz / W.PERIOD) * W.PERIOD;
      const bandX = W.isRoadBand(Math.floor(rx)), bandZ = W.isRoadBand(Math.floor(rz));
      const dash = (bandX && !bandZ && Math.abs(cxm - 0.5) < 0.10 && Math.floor(rz * 1.6) % 2 === 0) ||
                   (bandZ && !bandX && Math.abs(czm - 0.5) < 0.10 && Math.floor(rx * 1.6) % 2 === 0);
      if (dash) return ["-", 210, 180, 70, 1];
      // pedestrian crossing stripes near intersections
      const fx = rx - Math.floor(rx / W.PERIOD) * W.PERIOD;
      const fz = rz - Math.floor(rz / W.PERIOD) * W.PERIOD;
      const nearX = fx > 1.7 && fx < 3.1, nearZ = fz > 1.7 && fz < 3.1;
      if ((bandX && nearZ && Math.floor(rx * 3) % 2 === 0) || (bandZ && nearX && Math.floor(rz * 3) % 2 === 0)) {
        return ["=", 150 + glow * 120, 160 + glow * 120, 170 + glow * 130, 0.9];
      }
      const l = 0.10 + glow * 0.30;
      return [rampAt(l * 0.5 + 0.06), 80 + glow * 92, 92 + glow * 94, 112 + glow * 112, 1];
    }
    if (tt === T.WALK) {
      const l = 0.16 + glow * 0.35;
      const wetGlint = wetAmt > 0.4 && ((gx * 31 + gz * 17) % 11 === 0) ? 46 * wetAmt : 0;
      return [((gx + gz) & 1) ? "." : "·", 96 + glow * 104 + wetGlint, 104 + glow * 104 + wetGlint, 114 + glow * 108 + wetGlint, 1];
    }
    if (tt === T.PLAZA) {
      const ring = Math.hypot((gx % 13) - 6.5, (gz % 13) - 6.5);
      const ch = (ring > 2.4 && ring < 3.0) ? "°" : ((gx + gz) & 1 ? "·" : ".");
      return [ch, 98 + glow * 100, 100 + glow * 100, 112 + glow * 108, 1];
    }
    const l = 0.12 + glow * 0.18;                              // grass
    return [((gx * 7 + gz * 13) % 5 === 0) ? "`" : ",", 52 + glow * 52, 112 + glow * 76, 66 + glow * 52, 1];
  }

  if (t === HIT_TREE) {
    const v = h.hy;
    return [v > 1.5 ? "*" : (v > 0.85 ? "o" : "'"), 52, 148 + v * 38, 82, 1];
  }

  if (t === HIT_DECK) {
    if (h.face === HIT_UNDER) {
      const gx = Math.floor(h.hx / CELL) + Math.floor(h.hz / CELL);
      return [(gx % 3 === 0) ? "=" : "-", 46, 52, 66, 1];
    }
    return [rampAt(0.34), 62, 70, 88, 1];
  }

  if (t === HIT_BUILD) {
    const bh = W.bhash[h.cell];
    if (h.face !== 2) {
      const u = h.face === 0 ? h.hz : h.hx;
      const v = h.hy;
      const wu = u / 1.15, wv = v / 1.35;
      const fu = wu - Math.floor(wu), fv = wv - Math.floor(wv);
      const inWin = fu > 0.22 && fu < 0.80 && fv > 0.24 && fv < 0.82;
      if (inWin) {
        const iu = Math.floor(wu), iv = Math.floor(wv);
        const flick = Math.floor(time * 0.04 + hash2(iu, iv) * 9) % 97;
        const lit = hash2(iu + 31, iv * 7 + Math.floor(bh * 90)) < 0.44 && flick !== 0;
        if (lit) {
          const warm = hash2(iu, iv + 5);
          const ch = R.mode === 1 ? "█" : (warm < 0.7 ? ":" : "0");
          return [ch, 255, 208 - warm * 62, 112 - warm * 60, 1.15];
        }
        return [R.mode === 1 ? "░" : "·", 40, 56, 86, 1];
      }
      const d = W.districts[W.district[h.cell]] || W.districts[0];
      const side = shade(h.nx, 0, h.nz, [(68 + bh * 58) * d.tint[0], (78 + bh * 50) * d.tint[1], (104 + bh * 55) * d.tint[2]]);
      const l = 0.30 + 0.3 * hash2(Math.floor(u * 3), Math.floor(v * 3));
      return [rampAt(l), side[0], side[1], side[2], 1];
    }
    const l = 0.16 + 0.1 * bh;
    return [rampAt(l), 46, 54, 72, 1];
  }
  return [" ", 0, 0, 0, 0];
}

// ------------------------------------------------------------------------
//  SKY
// ------------------------------------------------------------------------
function skyColor(dx, dy, dz, time, rainAmt) {
  const dim = 1 - rainAmt * 0.55;
  const p = clamp(dy * 0.5 + 0.5, 0, 1);
  const hs = hash2(Math.floor(Math.atan2(dx, dz) * 160), Math.floor(Math.asin(clamp(dy, -1, 1)) * 160));

  // clouds: slow drifting bands
  const cl = hash2(Math.floor(Math.atan2(dx, dz) * 22 + time * 0.00004), Math.floor(dy * 26));
  const cloud = rainAmt > 0.02 && cl > (0.62 - rainAmt * 0.30) && dy > 0.02;

  if (dy > 0.02 && hs > 0.9955 && !cloud) {
    const tw = 0.55 + 0.45 * Math.sin(time * 0.002 + hs * 90);
    const f = dim * (1 - rainAmt * 0.6);
    return [".", 220 * tw * f, 230 * tw * f, 255 * f, 1];
  }
  const dot = (dx * MOON[0] + dy * MOON[1] + dz * MOON[2]) / MOON_LEN;
  if (dot > 0.9855 && !cloud) return ["O", 255 * dim, 248 * dim, 220 * dim, 2.2];
  if (dot > 0.964 && !cloud) return ["°", 165 * dim, 165 * dim, 145 * dim, 1.4];

  if (cloud) return ["~", 26 + 12 * p, 32 + 14 * p, 46 + 16 * p, 0.8];
  return null;
}

// ------------------------------------------------------------------------
//  SPRITES
// ------------------------------------------------------------------------
let camX = 0, camY = 0, camZ = 0, F = [0,0,0], Rt = [0,0,0], U = [0,0,0];
let aspect = 1, tanH = 0.66;
let visCount = 0;

function splat(k, d, ch, r, g, b, sz) {
  if (ch === null || ch === undefined || ch === " ") return false;
  if (d >= depthBuf[k]) return false;
  depthBuf[k] = d * 0.985;
  charBuf[k] = ch;
  sizeBuf[k] = sz;
  colorBuf[k] = cs(r, g, b);
  return true;
}

// project a world point into cell coordinates
function project(x, y, z) {
  const rx = x - camX, ry = y - camY, rz = z - camZ;
  const dF = rx * F[0] + ry * F[1] + rz * F[2];
  if (!isFinite(dF) || dF < 0.35 || dF > MAXD) return null;
  const dR = rx * Rt[0] + ry * Rt[1] + rz * Rt[2];
  const dU = rx * U[0] + ry * U[1] + rz * U[2];
  const sx = (0.5 + 0.5 * (dR / dF) / (aspect * tanH)) * cols;
  const sy = (0.5 - 0.5 * (dU / dF) / tanH) * rows;
  if (!isFinite(sx) || !isFinite(sy)) return null;
  if (sx < -14 || sx > cols + 14 || sy < -8 || sy > rows + 8) return null;
  return { x: sx, y: sy, d: dF };
}

// draw a bitmap sprite: rows of [char,r,g,b] tuples (falsy char = transparent)
function splatSprite(list, ey, fn, scaleBase, skip) {
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (skip && skip(e)) continue;
    const p = project(e.x, ey, e.z);
    if (!p) continue;
    R.stats.sprTry++;
    const s = clamp(scaleBase / (1.4 + p.d), 0.5, 2.6);
    const spr = fn(e);
    const h = spr.length;
    const f = Math.exp(-p.d * 0.026);
    let drew = false;
    for (let r = 0; r < h; r++) {
      const rowCells = spr[r];
      const w = rowCells.length;
      const py = Math.round(p.y + (h / 2 - r - 0.5) * s);
      if (py < 0 || py >= rows) continue;
      for (let j = 0; j < w; j++) {
        const cell = rowCells[j];
        if (!cell || !cell[0] || cell[0] === " ") continue;
        const px = Math.round(p.x + (j - (w - 1) / 2) * s * 0.62);
        if (px < 0 || px >= cols) continue;
        if (splat(px + py * cols, p.d, cell[0],
              cell[1] * f + FOG[0] * (1 - f),
              cell[2] * f + FOG[1] * (1 - f),
              cell[3] * f + FOG[2] * (1 - f),
              clamp(s * 0.9, 0.6, 1.7))) drew = true;
      }
    }
    if (drew) { visCount++; R.stats.sprDrawn++; }
  }
}

// Draw a text billboard. With opts.nx/opts.nz (a surface normal) the glyphs are
// laid out in world space along that surface, so a sign hugging a wall stays
// glued to it instead of stabbing through it at grazing angles. Without a
// normal the label is laid out across the screen and always faces the camera.
function splatText(x, y, z, text, worldH, r, g, b, opts) {
  opts = opts || {};
  const p0 = project(x, y, z);
  if (!p0) return false;
  R.stats.sprTry++;
  const n = text.length;
  const onWall = (opts.nz !== undefined || opts.nx !== undefined);
  const tx = -opts.nz || 0, tz = opts.nx || 0;      // tangent of the face
  const stepWorld = worldH * 0.68;
  const f0 = opts.noFog ? 1 : Math.exp(-p0.d * 0.014);
  const rr = r * f0 + FOG[0] * (1 - f0),
        gg = g * f0 + FOG[1] * (1 - f0),
        bb = b * f0 + FOG[2] * (1 - f0);
  const s0 = clamp(worldH * (rows / (2 * tanH * p0.d)), 0.55, 6);
  if (s0 < 0.62) return false;
  const stepScreen = Math.max(1, s0 * 0.98);
  let drew = false;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (!ch || ch === " ") continue;
    let px, py, d = p0.d;
    if (onWall) {
      const off = (i - (n - 1) / 2) * stepWorld;
      const p = project(x + tx * off, y, z + tz * off);
      if (!p) continue;
      px = Math.round(p.x); py = Math.round(p.y); d = p.d;
    } else {
      px = Math.round(p0.x + (i - (n - 1) / 2) * stepScreen);
      py = Math.round(p0.y);
    }
    if (px < 0 || px >= cols || py < 0 || py >= rows) continue;
    if (splat(px + py * cols, d, ch, rr, gg, bb, s0)) drew = true;
  }
  if (drew) { visCount++; R.stats.sprDrawn++; }
  return drew;
}

// ------------------------------------------------------------------------
//  ENTITY SPRITE ART
// ------------------------------------------------------------------------
const T_ = [null];
function carSprite(c) {
  const body = ["=", 190, 80 + c.hue * 120, 90 + (1 - c.hue) * 120];
  const roof = ["^", 120, 70 + c.hue * 90, 80 + (1 - c.hue) * 90];
  const head = ["*", 255, 235, 150];
  const tail = [".", 230, 60, 60];
  const fx = Math.abs(c.dx) > 0.5;
  if (fx) {
    const front = c.dx > 0 ? head : tail, back = c.dx > 0 ? tail : head;
    return [T_, roof, T_, [front, body, back]];
  }
  const front = c.dz > 0 ? head : tail, back = c.dz > 0 ? tail : head;
  return [T_, roof, T_, T_, [front, T_, back]];
}
function pedSprite(p) {
  if (!R.showPeds) return [];
  const bob = Math.sin(p.ph) > 0;
  const skin = ["o", 235, 190, 150];
  const cloth = [bob ? "\\" : "|", p.col[0], p.col[1], p.col[2]];
  const legs = [bob ? "/" : " ", 170, 170, 190];
  return [[skin], [cloth], [legs]];
}
function propSprite(pr) {
  const g = (ch, v) => [ch, 118 * v, 126 * v, 140 * v];
  switch (pr.type) {
    case "bin":     return [[g("¤", 1.0)], [g("|", 0.7)]];
    case "bench":   return [[g("_", 0.9), g("=", 0.9)], [g("|", 0.6)]];
    case "hydrant": return [[g("o", 1.2)], [g("|", 0.7)]];
    case "planter": return [[g("*", 1.0)], [g("_", 0.7)]];
    case "bollard": return [[g("i", 1.1)], [g("i", 0.7)]];
    default:        return [[null]];
  }
}
const lampSprite = () => [[["o", 255, 214, 138]]];

// ------------------------------------------------------------------------
//  RAIN
// ------------------------------------------------------------------------
const DROPS = 520;
const dropX = new Float32Array(DROPS), dropY = new Float32Array(DROPS), dropZ = new Float32Array(DROPS), dropS = new Float32Array(DROPS);
for (let i = 0; i < DROPS; i++) {
  dropX[i] = (Math.random() - 0.5) * 46;
  dropY[i] = Math.random() * 22;
  dropZ[i] = (Math.random() - 0.5) * 46;
  dropS[i] = 14 + Math.random() * 16;
}
function updateRain(dt) {
  for (let i = 0; i < DROPS; i++) {
    dropY[i] -= dropS[i] * dt;
    if (dropY[i] < -1) { dropY[i] += 22; dropX[i] = (Math.random() - 0.5) * 46; dropZ[i] = (Math.random() - 0.5) * 46; }
  }
}
function splatRain(time) {
  if (R.rain < 0.02) return;
  const n = Math.floor(DROPS * R.rain);
  const f = 0.55 + 0.25 * Math.sin(time * 0.003);
  for (let i = 0; i < n; i++) {
    const wx = camX + dropX[i], wy = camY - 6 + dropY[i], wz = camZ + dropZ[i];
    const p = project(wx, wy, wz);
    if (!p) continue;
    const px = Math.round(p.x), py = Math.round(p.y);
    if (px < 0 || px >= cols || py < 0 || py >= rows) continue;
    const k = px + py * cols;
    if (depthBuf[k] < p.d * 0.6) continue;
    const ch = Math.abs(dropS[i] - 22) < 6 ? "\\" : "|";
    splat(k, p.d * 0.55, ch, 150 * f, 175 * f, 210 * f, 0.85);
  }
}

// ------------------------------------------------------------------------
//  FRAME
// ------------------------------------------------------------------------
function render(cam, time, dt, scene) {
  if (!cols) return;
  if (!cam || !isFinite(cam.x) || !isFinite(cam.y) || !isFinite(cam.z) ||
      !isFinite(cam.yaw) || !isFinite(cam.pitch)) return;   // never poison the raster
  const n = cols * rows;
  for (let i = 0; i < n; i++) { depthBuf[i] = 1e9; charBuf[i] = null; colorBuf[i] = null; sizeBuf[i] = 1; }
  visCount = 0;
  ramp = RAMPS[MODES[R.mode]] || RAMPS.CLASSIC;

  // weather easing
  R.rain += (R.rainTarget - R.rain) * Math.min(1, dt * 0.9);
  if (R.rain > 0.01) updateRain(dt);
  if (R.flash > 0) R.flash = Math.max(0, R.flash - dt * 2.6);

  // sky
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  const dk = 1 - R.rain * 0.4;
  g.addColorStop(0, "rgb(" + Math.round(3 * dk) + "," + Math.round(4 * dk) + "," + Math.round(10 * dk) + ")");
  g.addColorStop(0.62, "rgb(" + Math.round(10 * dk) + "," + Math.round(18 * dk) + "," + Math.round(38 * dk) + ")");
  g.addColorStop(1, "rgb(" + Math.round(6 * dk) + "," + Math.round(10 * dk) + "," + Math.round(22 * dk) + ")");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  F = [Math.sin(cam.yaw) * cp, sp, Math.cos(cam.yaw) * cp];
  Rt = [-Math.cos(cam.yaw), 0, Math.sin(cam.yaw)];
  U = [Rt[1] * F[2] - Rt[2] * F[1], Rt[2] * F[0] - Rt[0] * F[2], Rt[0] * F[1] - Rt[1] * F[0]];
  aspect = canvas.width / canvas.height;
  tanH = Math.tan((cam.fov || 1.22) / 2);
  camX = cam.x; camY = cam.y + (cam.eye || 0); camZ = cam.z;

  const wetAmt = R.rain;

  // ---- pass 1: raycast ----
  for (let row = 0; row < rows; row++) {
    const ny = 1 - ((row + 0.5) / rows) * 2;
    for (let col = 0; col < cols; col++) {
      const nx = ((col + 0.5) / cols) * 2 - 1;
      let dx = F[0] + Rt[0] * nx * aspect * tanH + U[0] * ny * tanH;
      let dy = F[1] + Rt[1] * nx * aspect * tanH + U[1] * ny * tanH;
      let dz = F[2] + Rt[2] * nx * aspect * tanH + U[2] * ny * tanH;
      const il = 1 / Math.hypot(dx, dy, dz);
      dx *= il; dy *= il; dz *= il;

      if (castRay(camX, camY, camZ, dx, dy, dz)) {
        const res = surface(hit, hit.t, time, wetAmt);
        const ch = res[0];
        if (ch === " " || ch === null) continue;
        const f = Math.exp(-hit.t * 0.026) * (1 + R.flash * 0.8);
        const k = col + row * cols;
        depthBuf[k] = hit.t;
        charBuf[k] = ch;
        colorBuf[k] = cs(res[1] * f + FOG[0] * (1 - f), res[2] * f + FOG[1] * (1 - f), res[3] * f + FOG[2] * (1 - f));
        sizeBuf[k] = res[4] * clamp(3.4 / (1.4 + hit.t), 0.62, 1.55);
      } else {
        const s = skyColor(dx, dy, dz, time, R.rain);
        if (s) {
          const k = col + row * cols;
          charBuf[k] = s[0];
          colorBuf[k] = cs(s[1] + R.flash * 90, s[2] + R.flash * 90, s[3] + R.flash * 90);
          sizeBuf[k] = s[4];
        }
      }
    }
  }
  R.stats.rays = cols * rows;

  // ---- pass 2: sprites ----
  R.stats.sprTry = 0; R.stats.sprDrawn = 0;
  if (scene) {
    // street furniture (pillars are drawn separately, full height)
    splatSprite(scene.props, 0.5, propSprite, 5.5, (e) => e.type === "pillar");
    // lamp heads
    splatSprite(scene.lamps, 3.4, lampSprite, 7.0);
    // monorail pillars
    for (const pr of scene.props) {
      if (pr.type !== "pillar") continue;
      for (let i = 0; i <= 7; i++) {
        const y = (i / 7) * (pr.h - 0.4);
        const p = project(pr.x, y + 0.1, pr.z);
        if (!p) continue;
        const px = Math.round(p.x), py = Math.round(p.y);
        if (px < 0 || px >= cols || py < 0 || py >= rows) continue;
        const f = Math.exp(-p.d * 0.026);
        splat(px + py * cols, p.d, "║", 70 * f + FOG[0], 78 * f + FOG[1], 96 * f + FOG[2], clamp(7 / (1.4 + p.d), 0.6, 1.6));
      }
    }
    // people, then vehicles
    splatSprite(scene.peds, 0.85, pedSprite, 7.5);
    splatSprite(scene.cars, 0.55, carSprite, 9.5);

    // monorail train
    if (scene.train) {
      const tr = scene.train;
      const body = "≡≡≡≡≡≡≡≡";
      splatText(tr.x, tr.y, tr.z, body, 1.5, 150, 240, 190, {});
      splatText(tr.x, tr.y + 0.9, tr.z, "«" + tr.name + "»", 0.9, 110, 255, 170, {});
    }

    // neon signs
    for (const s of scene.signs) {
      const fl = s.flicker ? (hash2(Math.floor(s.phase + time * 0.006), 3) > 0.12 ? 1 : 0.15) : 1;
      const pulse = 0.82 + 0.18 * Math.sin(time * 0.0016 + s.phase);
      splatText(s.x, s.y, s.z, s.text, 1.05, s.r * fl * pulse, s.g * fl * pulse, s.b * fl * pulse, { nx: s.fx, nz: s.fz });
    }

    // POI beacons
    for (const p of scene.pois) {
      const bob = Math.sin(time * 0.0022 + p.x * 0.05) * 0.25;
      splatText(p.x, 2.6 + bob, p.z, "◊", 1.5, 255, 196, 94, {});
      if (p.near) splatText(p.x, 4.0 + bob, p.z, p.name, 1.15, 255, 214, 130, {});
    }
  }

  // ---- pass 3: rain over everything ----
  splatRain(time);

  // ---- pass 4: paint ----
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let lastFont = fontBase;
  ctx.font = fontBase;
  for (let row = 0; row < rows; row++) {
    const yPix = (row + 0.5) * cellH;
    for (let col = 0; col < cols; col++) {
      const k = col + row * cols;
      const ch = charBuf[k];
      if (ch === null || ch === " ") continue;
      const sz = sizeBuf[k];
      if (sz > 1.02 || sz < 0.98) {
        const f = "bold " + Math.round(fontPx * sz) + "px Consolas, Menlo, monospace";
        if (f !== lastFont) { ctx.font = f; lastFont = f; }
      } else if (lastFont !== fontBase) {
        ctx.font = fontBase; lastFont = fontBase;
      }
      ctx.fillStyle = colorBuf[k];
      ctx.fillText(ch, (col + 0.5) * cellW, yPix);
    }
  }

  // lightning flash wash
  if (R.flash > 0.01) {
    ctx.fillStyle = "rgba(150,170,220," + (R.flash * 0.16).toFixed(3) + ")";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  R.stats.visible = visCount;
  R.debug.chars = charBuf; R.debug.colors = colorBuf;
  R.debug.sizes = sizeBuf; R.debug.cols = cols; R.debug.rows = rows;
}

R.init = init;
R.resize = resize;
R.setDensity = setDensity;
R.render = render;
R.castRay = castRay;
R.hit = hit;
R.strike = () => { R.flash = 1; };
// last frame's character raster, for tests and debugging
R.debug = { chars: null, colors: null, sizes: null, cols: 0, rows: 0 };
Object.defineProperty(R, "dims", { get: () => ({ cols, rows, cellW, cellH, fontPx }) });
global.AC.R = R;
})(window);
