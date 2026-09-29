/* ASCII CITY — enterable interiors (every building), multiple storeys, and the prelude room */
(function () {
'use strict';
const W = AC.W, R = AC.R, Mo = AC.Mo, mat = Mo.mat, M = R.M, GL = R.GL;
const I = AC.I = {};

const PAL = {
  shop: { wall: 0x2a3440, ceil: 0x1c2026, floor: 0x3a3a44, door: 0xd0d0d8, tile: 1, wg: GL[':'] },
  cafe: { wall: 0x3a2618, ceil: 0x221810, floor: 0x3a2a1a, door: 0xe0b080, tile: 0.8, wg: GL['|'] },
  bar: { wall: 0x2a1020, ceil: 0x140810, floor: 0x281820, door: 0xff6080, tile: 1, wg: GL['|'] },
  noodle: { wall: 0x3a2a10, ceil: 0x201808, floor: 0x302418, door: 0xffe060, tile: 0.8, wg: GL['='] },
  arcade: { wall: 0x1a1030, ceil: 0x0c0818, floor: 0x181028, door: 0xff40ff, tile: 1, wg: GL['.'] },
  clinic: { wall: 0x2a3a36, ceil: 0x222c2a, floor: 0x3a4442, door: 0xa0ffc0, tile: 1.2, wg: GL[':'] },
  launderette: { wall: 0x28344a, ceil: 0x1c2230, floor: 0x343c4a, door: 0xa0d0ff, tile: 0.7, wg: GL[':'] },
  office: { wall: 0x2c2e3a, ceil: 0x1e2028, floor: 0x2a2c36, door: 0xc0c8e0, tile: 1.5, wg: GL[':'] },
  lobby: { wall: 0x30343e, ceil: 0x20222a, floor: 0x3a3e48, door: 0xffffff, tile: 2, wg: GL['|'] },
  apartment: { wall: 0x3a3228, ceil: 0x221e18, floor: 0x33291e, door: 0xd8b890, tile: 0.6, wg: GL['.'] },
  warehouse: { wall: 0x33302a, ceil: 0x1a1814, floor: 0x2c2a26, door: 0xffa040, tile: 3, wg: GL['#'] },
  workshop: { wall: 0x33302a, ceil: 0x1a1814, floor: 0x2c2a26, door: 0xffa040, tile: 2, wg: GL['#'] },
  deck: { wall: 0x202838, ceil: 0x141824, floor: 0x283040, door: 0xffffff, tile: 2, wg: GL['|'] },
  prelude: { wall: 0x34302a, ceil: 0x1a1814, floor: 0x26221c, door: 0x7a5636, tile: 0.9, wg: GL['.'], dado: 0x3a2a1e }
};
I.PAL = PAL;
const NAMES = { shop: 'CONVENIENCE STORE', cafe: 'CAFE', bar: 'BAR', noodle: 'NOODLE BAR', arcade: 'ARCADE', clinic: 'CLINIC', launderette: 'LAUNDERETTE', office: 'OFFICES', lobby: 'LOBBY', apartment: 'APARTMENTS', warehouse: 'WAREHOUSE', workshop: 'REPAIR WORKSHOP', deck: 'OBSERVATION DECK' };
I.NAMES = NAMES;

I.floorType = function (b, floor) {
  if (b.lm >= 0) return floor === 0 ? 'lobby' : (floor >= I.topFloor(b) - 1 ? 'deck' : 'office');
  if (floor === 0) return b.use === 'apartment' ? 'lobby' : b.use;
  if (b.use === 'warehouse' || b.use === 'workshop') return 'warehouse';
  const d = W.district(b.x0, b.y0);
  return (d.type === 'central' || d.type === 'commercial') ? 'office' : 'apartment';
};
/* number of usable (non-perimeter) cells on a floor */
function usable(b, floor) {
  const st = b.storey, fz = floor * st, x0 = Math.floor(b.x0), y0 = Math.floor(b.y0), w = Math.ceil(b.x1) - x0, h = Math.ceil(b.y1) - y0;
  const ins = (x, y) => x >= 0 && y >= 0 && x < w && y < h && W.bHeight(b, x0 + x + 0.5, y0 + y + 0.5) >= fz + st * 0.95;
  let n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (ins(x, y) && ins(x - 1, y) && ins(x + 1, y) && ins(x, y - 1) && ins(x, y + 1)) n++;
  return n;
}
I.topFloor = function (b) {
  if (b._top !== undefined) return b._top;
  let top = Math.max(0, b.floors - 1);
  if (b.lm >= 0 || b.roof === 'pitchX' || b.roof === 'pitchY' || b.roof === 'tiers') {
    const maxH = b.lm >= 0 ? W.bHeight(b, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2) : b.h + (b.rh || 0);
    top = Math.floor(maxH / b.storey);
    while (top > 0 && usable(b, top) < 8) top--;
  }
  b._top = top;
  return top;
};

I.build = function (b, floor, entry) {
  const st = b.storey, fz = floor * st;
  const x0 = Math.floor(b.x0), y0 = Math.floor(b.y0), w = Math.ceil(b.x1) - x0, h = Math.ceil(b.y1) - y0;
  const grid = new Uint8Array(w * h);
  // occupancy at this floor (landmark shapes / tapered spires shrink with height)
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && W.bHeight(b, x0 + x + 0.5, y0 + y + 0.5) >= fz + st * 0.95;
  let cnt = 0, sx = 0, sy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) { grid[y * w + x] = 1; continue; }
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    grid[y * w + x] = edge ? 1 : 0;
    if (!edge) { cnt++; sx += x; sy += y; }
  }
  const type = I.floorType(b, floor);
  const IN = { b, x0, y0, w, h, grid, floor, floorZ: fz, ceilZ: fz + st - 0.25, pal: PAL[type] || PAL.office, type, items: [], npcs: [], name: NAMES[type] || 'INTERIOR' };
  if (cnt === 0) return null;
  const cxl = Math.round(sx / cnt), cyl = Math.round(sy / cnt);
  const rng = AC.RNG(AC.hash(b.id, floor, 31));
  // lift core
  const top = I.topFloor(b);
  if (top > 0 && w >= 6 && h >= 6) {
    for (const [dx, dy] of [[0, 0], [1, 0]]) { const x = cxl + dx, y = cyl; if (grid[y * w + x] === 0) grid[y * w + x] = 4; }
    IN.lift = { x: x0 + cxl + 1, y: y0 + cyl + 0.5 };
  }
  // door (ground floor): the wall cell nearest to where we came in
  if (floor === 0) {
    let best = null, bd = 1e9;
    const ex = entry ? entry.x - x0 : 0, ey = entry ? entry.y - y0 : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (grid[y * w + x] !== 1 || !inside(x, y)) continue;
      const d = (x + 0.5 - ex) ** 2 + (y + 0.5 - ey) ** 2;
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (best) {
      grid[best.y * w + best.x] = 3;
      IN.door = { x: x0 + best.x + 0.5, y: y0 + best.y + 0.5 };
      // spawn one step inside, facing in
      const cands = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => grid[(best.y + dy) * w + best.x + dx] === 0);
      const dd = cands[0] || [0, 1];
      IN.spawn = { x: x0 + best.x + 0.5 + dd[0] * 1.3, y: y0 + best.y + 0.5 + dd[1] * 1.3, yaw: Math.atan2(dd[0], -dd[1]) };
      IN.outside = { x: x0 + best.x + 0.5 - dd[0] * 1.2, y: y0 + best.y + 0.5 - dd[1] * 1.2, yaw: Math.atan2(-dd[0], dd[1]) };
    }
  }
  if (!IN.spawn) {
    const l = IN.lift || { x: x0 + cxl + 0.5, y: y0 + cyl + 0.5 };
    IN.spawn = { x: l.x, y: l.y + 1.6, yaw: Math.PI };
    for (const [dx, dy] of [[0, 1.6], [0, -1.6], [-1.6, 0], [2.2, 0]]) if (I.free(IN, l.x + dx, l.y + dy)) { IN.spawn = { x: l.x + dx, y: l.y + dy, yaw: Math.atan2(dx, -dy) }; break; }
  }
  furnish(IN, rng);
  return IN;
};
I.free = function (IN, x, y) {
  const gx = Math.floor(x - IN.x0), gy = Math.floor(y - IN.y0);
  if (gx < 0 || gy < 0 || gx >= IN.w || gy >= IN.h) return false;
  return IN.grid[gy * IN.w + gx] === 0;
};
function cellFree(IN, x, y) { return x > 0 && y > 0 && x < IN.w - 1 && y < IN.h - 1 && IN.grid[y * IN.w + x] === 0; }
function nearDoorOrLift(IN, x, y) {
  const wx = IN.x0 + x + 0.5, wy = IN.y0 + y + 0.5;
  if (IN.door && Math.hypot(wx - IN.door.x, wy - IN.door.y) < 3.2) return true;
  if (IN.lift && Math.hypot(wx - IN.lift.x, wy - IN.lift.y) < 2.8) return true;
  if (IN.spawn && Math.hypot(wx - IN.spawn.x, wy - IN.spawn.y) < 1.6) return true;
  return false;
}
function item(IN, x, y, w, d, z0, hgt, m, block, yaw) {
  IN.items.push({ x: IN.x0 + x, y: IN.y0 + y, w, d, z0: IN.floorZ + z0, h: hgt, m, yaw: yaw || 0 });
  if (block) {
    for (let gy = Math.floor(y - d / 2); gy <= Math.floor(y + d / 2 - 0.01); gy++)
      for (let gx = Math.floor(x - w / 2); gx <= Math.floor(x + w / 2 - 0.01); gx++)
        if (gx >= 0 && gy >= 0 && gx < IN.w && gy < IN.h && IN.grid[gy * IN.w + gx] === 0) IN.grid[gy * IN.w + gx] = 9;
  }
}
function npc(IN, rng, x, y, still) {
  const p = AC.S.person(rng);
  p.x = IN.x0 + x; p.y = IN.y0 + y; p.still = still; p.home = { x: p.x, y: p.y }; p.t = rng() * 10;
  IN.npcs.push(p);
}
const glowMat = (c, g) => ({ fn: (u, v) => { M.g = g || GL['▓']; M.fg = AC.hash(Math.floor(u * 6), Math.floor(v * 4), Math.floor(R.time * 3)) & 1 ? c : AC.mulC(c, 0.6); M.bg = AC.mulC(c, 0.25); M.emit = true; return true; } });
function furnish(IN, rng) {
  const { w, h, type } = IN;
  const free = (x, y) => cellFree(IN, x, y) && !nearDoorOrLift(IN, x, y);
  const scan = (fn, step) => { for (let y = 1; y < h - 1; y += step || 1) for (let x = 1; x < w - 1; x += step || 1) fn(x, y); };
  const col = R.SIGNCOL[IN.b.use] || 0x40e0ff;
  switch (type) {
    case 'shop': case 'workshop':
      scan((x, y) => { if (y % 3 === 2 && x > 1 && x < w - 2 && free(x, y)) item(IN, x + 0.5, y + 0.5, 1, 0.8, 0, 1.7, { fn: (u, v) => { const s = AC.fract(v * 4) < 0.18; M.g = s ? GL['='] : '!#%$&*o'.charCodeAt(AC.hash(Math.floor(u * 6), Math.floor(v * 8), IN.b.id) % 7); M.fg = s ? 0x9a9aa8 : (AC.hash(Math.floor(u * 6), Math.floor(v * 8), 3) & 1 ? col : 0xffe080); M.bg = 0x20222c; return true; } }, true); });
      if (IN.door) { const dx = IN.door.x - IN.x0, dy = IN.door.y - IN.y0; for (const [ox, oy] of [[2, 1], [1, 2], [-2, 1], [2, -1]]) { const x = Math.floor(dx + ox), y = Math.floor(dy + oy); if (cellFree(IN, x, y) && !nearDoorOrLift(IN, x, y)) { item(IN, x + 0.5, y + 0.5, 1, 1, 0, 1.0, mat('=', 0xc0c0d0, 0x303040), true); npc(IN, rng, x + 0.5, y + 1.3, true); break; } } }
      npc(IN, rng, w / 2, h / 2 + 1, false);
      break;
    case 'cafe': case 'bar': case 'noodle':
      scan((x, y) => { if (y === 1 && free(x, y) && x > 1 && x < w - 2) item(IN, x + 0.5, y + 0.5, 1, 1, 0, 1.05, mat('=', type === 'bar' ? 0xff5070 : 0xc08040, 0x301a10), true); });
      if (w > 4) item(IN, w / 2, 1.2, Math.min(3, w - 4), 0.2, 1.7, 0.5, R.textMat(' ' + (R.SHOPSIGN[IN.b.use] || 'MENU') + ' ', 0x101010, col), false);
      scan((x, y) => { if (y > 2 && free(x, y) && rng() < 0.3) { item(IN, x + 0.5, y + 0.5, 0.8, 0.8, 0, 0.75, mat('o', 0xe0e0e0, 0x40403a), true); if (rng() < 0.6) npc(IN, rng, x + 0.5, y + 1.3, true); } }, 2);
      npc(IN, rng, w / 2 + 0.5, 2.2, true);
      break;
    case 'arcade':
      scan((x, y) => { const wall = x === 1 || y === 1 || x === w - 2 || y === h - 2; if (wall && free(x, y) && (x + y) % 2 === 0) item(IN, x + 0.5, y + 0.5, 0.9, 0.9, 0, 1.9, [glowMat(rng() < 0.5 ? 0xff40ff : 0x40ffff), glowMat(0x40ffff), mat('#', 0x303048), mat('#', 0x303048), mat('=', 0x202030)], true); });
      for (let n = 0; n < 4; n++) npc(IN, rng, 2 + rng() * (w - 4), 2 + rng() * (h - 4), rng() < 0.5);
      break;
    case 'launderette':
      scan((x, y) => { if ((y === 1 || y === h - 2) && free(x, y)) item(IN, x + 0.5, y + 0.5, 0.95, 0.9, 0, 1.0, [{ fn: (u, v) => { const r = Math.hypot(u - 0.5, (v - 0.5) * 1.1); M.g = r < 0.3 ? (r < 0.2 ? GL['@'] : GL['O']) : GL['#']; M.fg = r < 0.3 ? 0x80c0ff : 0xe0e8f0; M.bg = 0x384050; return true; } }, mat('#', 0xe0e8f0), mat('#', 0xe0e8f0), mat('#', 0xe0e8f0), mat('=', 0xd0d8e0)], true); });
      if (h > 5) scan((x, y) => { if (y === Math.floor(h / 2) && free(x, y) && x % 3 === 1) item(IN, x + 0.5, y + 0.5, 1.6, 0.5, 0, 0.45, Mo.MAT.wood, true); });
      npc(IN, rng, w / 2, h / 2 + 1, true);
      break;
    case 'clinic':
      scan((x, y) => { if (y === 1 && free(x, y) && x % 3 === 1) { item(IN, x + 0.5, y + 0.8, 0.9, 1.9, 0, 0.6, mat('=', 0xf0f0f0, 0x506060), true); item(IN, x + 1.4, y + 1.2, 0.05, 2.2, 0, 2.1, mat('|', 0x70d0a0, 0x1a3a2a), false); } });
      if (IN.door) npc(IN, rng, IN.door.x - IN.x0 + 1.5, IN.door.y - IN.y0 + 1.5, true);
      npc(IN, rng, w / 2, h / 2, false);
      break;
    case 'office':
      scan((x, y) => { if (free(x, y) && free(x + 1, y) && rng() < 0.75) { item(IN, x + 1, y + 0.5, 1.6, 0.8, 0, 0.75, mat('=', 0x8a8a98, 0x2a2a34), true); item(IN, x + 1, y + 0.4, 0.6, 0.08, 0.75, 0.45, glowMat(0x60c0ff, GL['▒']), false); if (rng() < 0.4) npc(IN, rng, x + 1, y + 1.2, true); } }, 3);
      break;
    case 'apartment':
      if (w > 8 && h > 8) { const mx = Math.floor(w / 2); for (let y = 1; y < h - 1; y++) if (IN.grid[y * w + mx] === 0 && Math.abs(y - h / 2) > 1.5) IN.grid[y * w + mx] = 2; }
      scan((x, y) => { if (free(x, y) && rng() < 0.07) { const k = Math.floor(rng() * 3); if (k === 0) item(IN, x + 0.5, y + 0.5, 1.8, 0.9, 0, 0.7, mat('=', 0x8a4a5a, 0x2a141a), true); else if (k === 1) item(IN, x + 0.5, y + 0.5, 1.2, 2.0, 0, 0.55, mat('=', 0xc0c0d8, 0x30303a), true); else item(IN, x + 0.5, y + 0.5, 0.8, 0.8, 0, 0.9, mat('#', 0x6a8a4a, 0x1a2a10), true); } });
      if (rng() < 0.7) npc(IN, rng, w / 3, h / 3, true);
      break;
    case 'lobby':
      scan((x, y) => { if (free(x, y) && ((x === 2 && y % 4 === 2) || (x === w - 3 && y % 4 === 2))) item(IN, x + 0.5, y + 0.5, 0.8, 0.8, 0, 1.2, mat('%', 0x40a050, 0x10280e), true); });
      if (IN.lift) item(IN, IN.lift.x - IN.x0 - 0.5, IN.lift.y - IN.y0 + 2.2, 2.2, 0.7, 0, 1.05, mat('=', 0xd0d0e0, 0x303040), true);
      if (IN.b.lm >= 0) item(IN, IN.lift ? IN.lift.x - IN.x0 - 0.5 : w / 2, IN.lift ? IN.lift.y - IN.y0 - 2 : h / 2, 3, 0.2, 1.5, 0.6, R.textMat(' ' + W.LANDMARKS[IN.b.lm].name + ' ', 0x101010, IN.b.lit), false);
      npc(IN, rng, w / 2, h / 2 + 3, true);
      break;
    case 'deck':
      scan((x, y) => { if (free(x, y) && rng() < 0.03) item(IN, x + 0.5, y + 0.5, 1.6, 0.5, 0, 0.45, Mo.MAT.wood, true); });
      for (let n = 0; n < 3; n++) npc(IN, rng, 2 + rng() * (w - 4), 2 + rng() * (h - 4), true);
      break;
    case 'warehouse':
      scan((x, y) => { if (free(x, y) && rng() < 0.25) item(IN, x + 0.5, y + 0.5, 0.95, 0.95, 0, 0.9 + Math.floor(rng() * 3) * 0.9, mat('#', 0xa07840, 0x3a2810), true); });
      break;
  }
  // keep NPCs on free cells
  IN.npcs = IN.npcs.filter(p => I.free(IN, p.x, p.y));
}
I.update = function (IN, dt) {
  for (const p of IN.npcs) {
    if (p.still) continue;
    p.t -= dt;
    if (p.t <= 0 || !p.tx) { p.t = 3 + Math.random() * 5; p.tx = p.home.x + (Math.random() - 0.5) * 6; p.ty = p.home.y + (Math.random() - 0.5) * 6; }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
    if (d > 0.2) { const nx = p.x + dx / d * dt * 1.0, ny = p.y + dy / d * dt * 1.0; if (I.free(IN, nx, ny)) { p.x = nx; p.y = ny; p.phase += dt * 3; } else p.t = 0; }
  }
};
I.draw = function (IN) {
  for (const it of IN.items) R.box(it.x, it.y, it.z0, it.d, it.w, it.h, it.yaw, it.m);
  for (const p of IN.npcs) AC.Mo.drawPerson(p, IN.floorZ, !p.still);
};

/* ---------------- the prelude: a small room, a locked door and a telephone ---------------- */
I.prelude = function () {
  const w = 8, h = 7, grid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) grid[y * w + x] = (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? 2 : 0;
  grid[0 * w + 2] = 3; // the locked door
  const IN = { b: null, x0: -200, y0: -200, w, h, grid, floor: 0, floorZ: 0, ceilZ: 2.9, pal: PAL.prelude, type: 'prelude', items: [], npcs: [], solid: true, name: 'SYS_DETAILS.DAT' };
  const tx = IN.x0 + 4, ty = IN.y0 + 3.2;
  IN.phone = { x: tx, y: ty };
  IN.door = { x: IN.x0 + 2.5, y: IN.y0 + 0.5 };
  IN.spawn = { x: IN.x0 + 4, y: IN.y0 + 5.7, yaw: 0 };
  const wood = mat('=', 0x8a6a48, 0x5a4028), leg = mat('|', 0x5a4028, 0x3a2818);
  IN.items.push({ x: tx, y: ty, w: 2.2, d: 1.1, z0: 0.72, h: 0.07, m: wood, yaw: 0 });
  for (const [dx, dy] of [[-0.95, -0.42], [0.95, -0.42], [-0.95, 0.42], [0.95, 0.42]]) IN.items.push({ x: tx + dx, y: ty + dy, w: 0.08, d: 0.08, z0: 0, h: 0.72, m: leg, yaw: 0 });
  IN.phoneMat = { red: mat('#', 0xc81e1e, 0x8a1010), dark: mat('#', 0x7a1010, 0x4a0808) };
  // lamp
  IN.items.push({ x: tx, y: ty, w: 0.03, d: 0.03, z0: 2.35, h: 0.55, m: mat('|', 0x606060, 0x303030), yaw: 0 });
  IN.items.push({ x: tx, y: ty, w: 0.55, d: 0.55, z0: 2.18, h: 0.18, m: [mat('#', 0xb0a080, 0x807050), mat('#', 0xb0a080, 0x807050), mat('#', 0xb0a080, 0x807050), mat('#', 0xb0a080, 0x807050), mat('#', 0xb0a080), mat('█', 0xfff0c0, 0xfff0c0)], yaw: 0 });
  // cabinet by the wall
  IN.items.push({ x: IN.x0 + 1.0, y: IN.y0 + 3.5, w: 0.9, d: 1.2, z0: 0, h: 1.1, m: mat('#', 0x6a5238, 0x4a3828), yaw: 0 });
  return IN;
};
I.drawPhone = function (IN, ringing, lifted, t) {
  const p = IN.phone, m = IN.phoneMat;
  const shake = ringing ? Math.sin(t * 60) * 0.015 : 0;
  R.box(p.x + shake, p.y, 0.79, 0.34, 0.42, 0.12, 0, m.red);
  R.box(p.x + shake, p.y - 0.05, 0.91, 0.18, 0.22, 0.05, 0, m.dark);
  if (!lifted) {
    R.box(p.x + shake, p.y, 0.96 + (ringing ? Math.abs(Math.sin(t * 30)) * 0.02 : 0), 0.12, 0.5, 0.08, 0, m.red);
    R.box(p.x + shake - 0.2, p.y, 0.93, 0.13, 0.13, 0.06, 0, m.dark);
    R.box(p.x + shake + 0.2, p.y, 0.93, 0.13, 0.13, 0.06, 0, m.dark);
  }
};
})();
