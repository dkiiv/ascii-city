/* ASCII CITY — living city: signalised road network, traffic, cyclists, pedestrians, flying cars.
   Expensive simulation is focused around the viewer; lights and trains run on the shared wall clock. */
(function () {
'use strict';
const W = AC.W, R = AC.R, Mo = AC.Mo, LW = W.LW, lineBase = W.lineBase;
const S = AC.S = {};
S.cars = []; S.peds = []; S.flyers = []; S.empty = false;
const NN = 64, DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
S.DX = DX; S.DY = DY;

/* ---------------- network ---------------- */
function edgeOK(a, b, d) {
  const a2 = a + DX[d], b2 = b + DY[d];
  if (a < 0 || b < 0 || a >= NN || b >= NN || a2 < 0 || b2 < 0 || a2 >= NN || b2 >= NN) return false;
  if (d === 0 || d === 2) { const i = a * 4, j0 = Math.min(b, b2) * 4; for (let j = j0; j < j0 + 4; j++) if (W.vSup(i, j)) return false; }
  else { const j = b * 4, i0 = Math.min(a, a2) * 4; for (let i = i0; i < i0 + 4; i++) if (W.hSup(j, i)) return false; }
  return true;
}
S.edgeOK = edgeOK;
const geomCache = new Map();
function edgeGeom(a, b, d) {
  const key = (a * 64 + b) * 4 + d;
  let g = geomCache.get(key);
  if (g) return g;
  if (d === 0 || d === 2) {
    const i = a * 4, wv = LW[lineBase(i)], lw = (wv - 4) / 2, cx = i * 32 + wv / 2;
    const x = d === 2 ? cx - lw / 2 : cx + lw / 2, kerb = d === 2 ? cx - lw + 0.55 : cx + lw - 0.55;
    const j = b * 4;
    if (d === 2) { const y0 = j * 32 + LW[lineBase(j)], y1 = (j + 4) * 32; g = { x0: x, y0, ux: 0, uy: 1, len: y1 - y0, lw, kx: kerb, ky: 0 }; }
    else { const j2 = j - 4, y0 = j * 32, y1 = j2 * 32 + LW[lineBase(j2)]; g = { x0: x, y0, ux: 0, uy: -1, len: y0 - y1, lw, kx: kerb, ky: 0 }; }
    g.axis = 0; g.cls = lineBase(i);
  } else {
    const j = b * 4, wh = LW[lineBase(j)], lw = (wh - 4) / 2, cy = j * 32 + wh / 2;
    const y = d === 1 ? cy + lw / 2 : cy - lw / 2, kerb = d === 1 ? cy + lw - 0.55 : cy - lw + 0.55;
    const i = a * 4;
    if (d === 1) { const x0 = i * 32 + LW[lineBase(i)], x1 = (i + 4) * 32; g = { x0, y0: y, ux: 1, uy: 0, len: x1 - x0, lw, kx: 0, ky: kerb }; }
    else { const i2 = i - 4, x0 = i * 32, x1 = i2 * 32 + LW[lineBase(i2)]; g = { x0, y0: y, ux: -1, uy: 0, len: x0 - x1, lw, kx: 0, ky: kerb }; }
    g.axis = 1; g.cls = lineBase(j);
  }
  g.a = a; g.b = b; g.d = d;
  geomCache.set(key, g);
  return g;
}
S.edgeGeom = edgeGeom;
/* shared-clock traffic lights. axis 0 = N-S traffic, 1 = E-W traffic */
const CYCLE = 26;
S.lightState = function (i, j, axis) {
  const off = AC.h01(i >> 2, j >> 2, 606) * CYCLE;
  const t = ((AC.worldTime() + off) % CYCLE + CYCLE) % CYCLE;
  const a = axis === 0 ? t : (t + CYCLE / 2) % CYCLE;
  return a < 10 ? 'G' : a < 12.5 ? 'A' : 'R';
};
function nodeLight(a, b, axis) { return S.lightState(a * 4, b * 4, axis); }

/* ---------------- people factory ---------------- */
const SHIRTS = [0xe04040, 0x4080e0, 0xe0e0e0, 0x303038, 0x40c070, 0xe0a030, 0xa050d0, 0x30c0d0, 0xff60a0, 0x806040, 0xc0c040, 0x5060a0];
const PANTS = [0x303040, 0x202028, 0x3a4a6a, 0x5a4a3a, 0x606068, 0x2a3a2a, 0x8a7050];
const SKIN = [0xf0c8a0, 0xd8a078, 0xb07850, 0x8a5a3a, 0x6a4028, 0xe8b890];
const HAIR = [0x201010, 0x503020, 0xc0a060, 0x101010, 0xa04020, 0x808080, 0xff40a0, 0x40c0ff];
S.person = function (rng) {
  return { h: 1.55 + rng() * 0.35, shirt: rng.pick(SHIRTS), pants: rng.pick(PANTS), skin: rng.pick(SKIN), hair: rng.pick(HAIR), phase: rng() * 6, bag: rng() < 0.25 ? rng.pick(SHIRTS) : 0 };
};
S.makePassengers = function (tr) {
  const rng = AC.RNG(AC.hash(tr.k, tr.line.id.charCodeAt(2), 77));
  const out = [], n = 5 + Math.floor(rng() * 8);
  for (let q = 0; q < n; q++) {
    const p = S.person(rng); p.car = Math.floor(rng() * AC.T.NCARS);
    const sit = rng() < 0.55; p.sit = sit;
    p.a = p.car * (AC.T.CAR_LEN + AC.T.CAR_GAP) + (sit ? 4.5 + rng() * 3 : 1.5 + rng() * 9);
    p.c = sit ? (rng() < 0.5 ? -0.95 : 0.95) : (rng() - 0.5) * 1.2;
    out.push(p);
  }
  return out;
};

/* ---------------- vehicles ---------------- */
const TYPES = [['hatch', 0.22], ['saloon', 0.2], ['suv', 0.14], ['van', 0.07], ['sports', 0.06], ['taxi', 0.13], ['moto', 0.08], ['bike', 0.1]];
const COLS = [0xd03030, 0x3060d0, 0xe0e0e0, 0x404048, 0x40a060, 0xe0a020, 0x8040c0, 0x20a0c0, 0xc0c0c8, 0xa06030, 0xff5080, 0x60d0ff];
let nextId = 1;
function pickType(r) { let acc = 0; for (const [t, p] of TYPES) { acc += p; if (r < acc) return t; } return 'saloon'; }
function makeCar(a, b, d, s, rng, type) {
  type = type || pickType(rng());
  const car = {
    id: nextId++, type, a, b, d, s, v: 0, junction: null, col: type === 'taxi' ? 0xffd020 : rng.pick(COLS),
    L: (Mo.CARS[type] || Mo.CARS.saloon).L, bike: type === 'bike', x: 0, y: 0, yaw: 0, dist: 0, people: []
  };
  car.v0 = type === 'bike' ? 5 + rng() * 1.5 : type === 'sports' ? 16 : type === 'moto' ? 15 : type === 'van' ? 11 : 12.5 + rng() * 2;
  if (type !== 'bike' && type !== 'moto') {
    const n = type === 'taxi' ? (rng() < 0.5 ? 1 : 2) : 1 + Math.floor(rng() * 2.4);
    for (let k = 0; k < n; k++) { const p = S.person(rng); car.people.push(p); }
  }
  placeOnEdge(car);
  return car;
}
function lanePos(car, g, s) {
  let x = g.x0 + g.ux * s, y = g.y0 + g.uy * s;
  if (car.bike) { if (g.axis === 0) x = g.kx; else y = g.ky; }
  if (car.pull) { const k = car.pull; if (g.axis === 0) x = x + (g.kx + (g.kx - g.x0) * 0.9 - x) * k; else y = y + (g.ky + (g.ky - g.y0) * 0.9 - y) * k; }
  return { x, y };
}
function placeOnEdge(car) {
  const g = edgeGeom(car.a, car.b, car.d);
  const p = lanePos(car, g, car.s);
  car.x = p.x; car.y = p.y; car.yaw = Math.atan2(g.ux, -g.uy);
}
function chooseTurn(car) {
  const a2 = car.a + DX[car.d], b2 = car.b + DY[car.d];
  if (car.route && car.route.length) { const d = car.route.shift(); if (edgeOK(a2, b2, d)) return d; car.route = []; }
  const back = (car.d + 2) & 3, opts = [];
  for (let d = 0; d < 4; d++) if (d !== back && edgeOK(a2, b2, d)) opts.push(d);
  if (!opts.length) return back;
  const straight = opts.indexOf(car.d);
  if (straight >= 0 && Math.random() < 0.55) return car.d;
  return opts[Math.floor(Math.random() * opts.length)];
}
function startJunction(car) {
  const g = edgeGeom(car.a, car.b, car.d);
  const pin = lanePos(car, g, g.len);
  const a2 = car.a + DX[car.d], b2 = car.b + DY[car.d];
  const d2 = chooseTurn(car);
  const g2 = edgeGeom(a2, b2, d2);
  const pout = lanePos(car, g2, 0);
  let pc;
  if (d2 === car.d) pc = { x: (pin.x + pout.x) / 2, y: (pin.y + pout.y) / 2 };
  else if (d2 === ((car.d + 2) & 3)) pc = { x: pin.x + g.ux * 8, y: pin.y + g.uy * 8 };
  else pc = g.axis === 0 ? { x: pin.x, y: pout.y } : { x: pout.x, y: pin.y };
  let len = 0, px = pin.x, py = pin.y;
  for (let k = 1; k <= 6; k++) { const u = k / 6, q = bez(pin, pc, pout, u); len += Math.hypot(q.x - px, q.y - py); px = q.x; py = q.y; }
  car.junction = { pin, pc, pout, len: Math.max(1, len), u: 0, a2, b2, d2 };
}
function bez(p0, p1, p2, u) { const v = 1 - u; return { x: v * v * p0.x + 2 * v * u * p1.x + u * u * p2.x, y: v * v * p0.y + 2 * v * u * p1.y + u * u * p2.y }; }

/* A* over the 64x64 junction graph */
S.route = function (a0, b0, a1, b1) {
  const key = (a, b) => a * 64 + b;
  const open = [{ a: a0, b: b0, g: 0, f: 0 }], came = new Map(), gs = new Map([[key(a0, b0), 0]]);
  const hfn = (a, b) => (Math.abs(a - a1) + Math.abs(b - b1)) * 128;
  let iter = 0;
  while (open.length && iter++ < 20000) {
    let bi = 0; for (let k = 1; k < open.length; k++) if (open[k].f < open[bi].f) bi = k;
    const cur = open.splice(bi, 1)[0];
    if (cur.a === a1 && cur.b === b1) {
      const dirs = []; let k = key(a1, b1);
      while (came.has(k)) { const c = came.get(k); dirs.unshift(c.d); k = c.from; }
      return dirs;
    }
    for (let d = 0; d < 4; d++) {
      if (!edgeOK(cur.a, cur.b, d)) continue;
      const na = cur.a + DX[d], nb = cur.b + DY[d], nk = key(na, nb);
      const cost = cur.g + edgeGeom(cur.a, cur.b, d).len * (edgeGeom(cur.a, cur.b, d).cls === 2 ? 0.85 : 1) + 10;
      if (cost < (gs.has(nk) ? gs.get(nk) : 1e18)) { gs.set(nk, cost); came.set(nk, { from: key(cur.a, cur.b), d }); open.push({ a: na, b: nb, g: cost, f: cost + hfn(na, nb) }); }
    }
  }
  return null;
};
/* nearest lane edge + position to a world point */
S.nearestEdge = function (x, y, maxD) {
  let best = null, bd = maxD || 1e9;
  const a0 = Math.floor(x / 128), b0 = Math.floor(y / 128);
  for (let a = a0 - 1; a <= a0 + 2; a++) for (let b = b0 - 1; b <= b0 + 2; b++) for (let d = 0; d < 4; d++) {
    if (!edgeOK(a, b, d)) continue;
    const g = edgeGeom(a, b, d);
    const s = AC.clamp((x - g.x0) * g.ux + (y - g.y0) * g.uy, 4, g.len - 4);
    const px = g.x0 + g.ux * s, py = g.y0 + g.uy * s, dd = Math.hypot(px - x, py - y);
    if (dd < bd) { bd = dd; best = { a, b, d, s, dist: dd, g }; }
  }
  return best;
};

/* ---------------- update ---------------- */
let spawnT = 0;
S.focus = { x: 0, y: 0 };
function districtDensity(x, y) {
  const d = W.district(x, y);
  return { central: 1, commercial: 0.9, oldtown: 0.75, residential: 0.55, towers: 0.5, industrial: 0.35, parkland: 0.4 }[d.type] || 0.6;
}
S.update = function (dt, fx, fy, player) {
  S.focus.x = fx; S.focus.y = fy;
  const dens = districtDensity(fx, fy);
  spawnT -= dt;
  if (spawnT <= 0) {
    spawnT = 0.25;
    const carTarget = S.empty ? 0 : Math.round(70 + 60 * dens), pedTarget = S.empty ? 0 : Math.round(45 + 85 * dens);
    for (let n = 0; n < 6 && S.cars.length < carTarget; n++) spawnCar(fx, fy, S.cars.length < carTarget * 0.6);
    for (let n = 0; n < 10 && S.peds.length < pedTarget; n++) spawnPed(fx, fy, S.peds.length < pedTarget * 0.5);
    while (S.flyers.length < (S.empty ? 0 : 18)) spawnFlyer(fx, fy);
    S.cars = S.cars.filter(c => c.keep || Math.hypot(c.x - fx, c.y - fy) < 400);
    S.peds = S.peds.filter(p => Math.hypot(p.x - fx, p.y - fy) < 140);
    S.flyers = S.flyers.filter(f => Math.hypot(f.x - fx, f.y - fy) < 1100);
    if (S.empty) { S.cars = S.cars.filter(c => c.keep); S.peds = []; S.flyers = []; }
  }
  updateCars(dt, player);
  updatePeds(dt);
  for (const f of S.flyers) { f.x += Math.sin(f.yaw) * f.v * dt; f.y -= Math.cos(f.yaw) * f.v * dt; f.z += Math.sin(AC.worldTime() * 0.3 + f.id) * dt * 0.8; }
};
function spawnCar(fx, fy, anywhere) {
  const rng = AC.RNG((Math.random() * 1e9) | 0);
  const r = anywhere ? 30 + rng() * 330 : 180 + rng() * 180, ang = rng() * AC.TAU;
  const px = fx + Math.cos(ang) * r, py = fy + Math.sin(ang) * r;
  const e = S.nearestEdge(px, py, 140);
  if (!e) return;
  const s = 3 + rng() * (e.g.len - 12);
  const g = e.g, x = g.x0 + g.ux * s, y = g.y0 + g.uy * s;
  for (const c of S.cars) if (Math.abs(c.x - x) < 9 && Math.abs(c.y - y) < 9) return;
  if (Math.hypot(x - fx, y - fy) < 25) return;
  const car = makeCar(e.a, e.b, e.d, s, rng);
  car.v = car.v0 * 0.6;
  S.cars.push(car);
}
function spawnFlyer(fx, fy) {
  const rng = AC.RNG((Math.random() * 1e9) | 0);
  const ang = rng() * AC.TAU, r = 100 + rng() * 800;
  const dir = Math.floor(rng() * 4);
  S.flyers.push({
    id: nextId++, x: fx + Math.cos(ang) * r, y: fy + Math.sin(ang) * r, z: 45 + rng() * 150, yaw: dir * Math.PI / 2 + (rng() - 0.5) * 0.1,
    v: 16 + rng() * 16, col: rng.pick([0x404050, 0x9040c0, 0x2060a0, 0xa0a0b0, 0xc03050]), glow: rng.pick([0x40ffff, 0xff40ff, 0xffe040, 0x40ff80]),
    L: 3.8 + rng() * 1.6, W: 1.8 + rng() * 0.4
  });
}
function updateCars(dt, player) {
  const cars = S.cars, n = cars.length;
  for (let k = 0; k < n; k++) {
    const c = cars[k];
    if (c.parked) continue;
    const hx = Math.sin(c.yaw), hy = -Math.cos(c.yaw);
    // leader search: nearest vehicle / person / player in a corridor ahead
    let gap = 60;
    const look = 8 + c.v * 2.2;
    for (let q = 0; q < n; q++) {
      if (q === k) continue;
      const o = cars[q];
      if (c.bike && !o.bike) continue; // cyclists filter past slow traffic
      const dx = o.x - c.x, dy = o.y - c.y;
      if (dx > look || dx < -look || dy > look || dy < -look) continue;
      const fwd = dx * hx + dy * hy;
      if (fwd <= 0 || fwd > look) continue;
      const lat = Math.abs(-dx * hy + dy * hx);
      if (lat > (c.bike ? 0.7 : 1.3)) continue;
      const hd = Math.cos(o.yaw - c.yaw);
      if (hd < 0.2 && fwd > 6) continue;
      const g = fwd - (c.L + o.L) / 2;
      if (g < gap) gap = g;
    }
    if (player && player.onFoot && !c.keep) {
      const dx = player.x - c.x, dy = player.y - c.y, fwd = dx * hx + dy * hy;
      if (fwd > 0 && fwd < look && Math.abs(-dx * hy + dy * hx) < 1.5) gap = Math.min(gap, fwd - c.L / 2 - 1);
    }
    for (const p of S.peds) {
      if (!p.onRoad) continue;
      const dx = p.x - c.x, dy = p.y - c.y;
      if (Math.abs(dx) > 14 || Math.abs(dy) > 14) continue;
      const fwd = dx * hx + dy * hy;
      if (fwd > 0 && fwd < 12 && Math.abs(-dx * hy + dy * hx) < 1.6) gap = Math.min(gap, fwd - c.L / 2 - 1.5);
    }
    let vt = c.v0;
    c.waitLight = false;
    if (c.junction) vt = Math.min(vt, c.junction.d2 === c.d ? c.v0 : 6);
    else {
      const g = edgeGeom(c.a, c.b, c.d);
      const ds = g.len - 1.2 - c.s - c.L / 2;
      const ph = nodeLight(c.a + DX[c.d], c.b + DY[c.d], g.axis);
      if (ph !== 'G' && ds > -0.5) {
        const stopDist = c.v * c.v / 8;
        if (ph === 'R' || ds > stopDist + 1) { vt = Math.min(vt, Math.max(0, ds * 0.9)); if (ds < 25) c.waitLight = true; }
      }
      if (c.dest && !c.route.length && c.a === c.dest.a && c.b === c.dest.b && c.d === c.dest.d) {
        const rem = c.dest.s - c.s;
        vt = Math.min(vt, Math.max(0, rem * 0.6));
        if (rem < 20) c.pull = AC.clamp(1 - rem / 20, 0, 1);
        if (rem < 0.6 && c.v < 0.3) { c.arrived = true; }
      }
    }
    vt = Math.min(vt, Math.max(0, (gap - 2.2) * 0.95));
    if (c.pullOut !== undefined) vt = Math.min(vt, 4);
    const acc = vt > c.v ? 2.6 : 8;
    c.braking = vt < c.v - 0.5;
    c.v += AC.clamp(vt - c.v, -acc * dt, acc * dt);
    if (c.v < 0) c.v = 0;
    const step = c.v * dt;
    c.dist += step;
    if (c.junction) {
      const J = c.junction;
      J.u += step / J.len;
      if (J.u >= 1) {
        c.a = J.a2; c.b = J.b2; c.d = J.d2; c.s = (J.u - 1) * J.len; c.junction = null;
        placeOnEdge(c);
      } else {
        const p = bez(J.pin, J.pc, J.pout, J.u), p2 = bez(J.pin, J.pc, J.pout, Math.min(1, J.u + 0.02));
        c.x = p.x; c.y = p.y;
        if (Math.hypot(p2.x - p.x, p2.y - p.y) > 1e-4) c.yaw = Math.atan2(p2.x - p.x, -(p2.y - p.y));
      }
    } else {
      c.s += step;
      const g = edgeGeom(c.a, c.b, c.d);
      if (c.s >= g.len) { c.s = g.len; startJunction(c); }
      else {
        const p = lanePos(c, g, c.s);
        if (c.pullOut !== undefined) { // leaving a taxi bay: blend from the bay into the lane
          c.pullOut = Math.min(1, c.pullOut + step / 14);
          const k = AC.smooth(c.pullOut);
          p.x = c.bay.x + (p.x - c.bay.x) * k; p.y = p.y;
          if (c.pullOut >= 1) c.pullOut = undefined;
        }
        c.x = p.x; c.y = p.y; c.yaw = Math.atan2(g.ux, -g.uy);
      }
    }
  }
}

/* ---------------- pedestrians ---------------- */
function sideCoord(line, side) {
  const cls = lineBase(line), w = LW[cls], base = line * 32;
  if (cls === 0) return base + (side ? 4.5 : 1.5);
  return base + (side ? w - 1.0 : 1.0);
}
function nextLineFrom(p, dir) {
  const k = Math.floor(p / 32);
  if (dir > 0) return p < k * 32 + 1 ? k : k + 1;
  return p > k * 32 + LW[lineBase(k)] - 1 ? k : k - 1;
}
function decCoord(line, dir) { return dir > 0 ? line * 32 + 1 : line * 32 + LW[lineBase(line)] - 1; }
function segBlocked(axis, line, blockAlong) {
  // a landmark site interrupts a pedestrian street
  const r = axis === 0 ? (W.vSup(line, blockAlong) ? W.regionAt(line, blockAlong) : -1) : (W.hSup(line, blockAlong) ? W.regionAt(blockAlong, line) : -1);
  return r >= 0 && W.regions[r].kind === 'landmark';
}
function spawnPed(fx, fy, anywhere) {
  const rng = AC.RNG((Math.random() * 1e9) | 0);
  const r = anywhere ? 8 + rng() * 110 : 70 + rng() * 55, ang = rng() * AC.TAU;
  const px = fx + Math.cos(ang) * r, py = fy + Math.sin(ang) * r;
  if (px < 40 || py < 40 || px > W.CITY - 40 || py > W.CITY - 40) return;
  const axis = rng() < 0.5 ? 0 : 1;
  const line = Math.round((axis === 0 ? px : py) / 32), side = rng() < 0.5 ? 0 : 1;
  const along = axis === 0 ? py : px;
  const blk = Math.floor(along / 32), off = along - blk * 32;
  const wPerp = LW[lineBase(blk)];
  if (off < wPerp + 1) return; // not in a corner
  if (segBlocked(axis, line, blk)) return;
  const p = S.person(rng);
  p.axis = axis; p.line = line; p.side = side; p.dir = rng() < 0.5 ? 1 : -1;
  p.fixed = sideCoord(line, side) + (rng() - 0.5) * 0.5; p.along = along;
  p.v = 1.05 + rng() * 0.55; p.id = nextId++;
  p.next = nextLineFrom(along, p.dir); p.dec = decCoord(p.next, p.dir);
  p.wait = 0;
  setPedXY(p);
  S.peds.push(p);
}
function setPedXY(p) {
  if (p.axis === 0) { p.x = p.fixed; p.y = p.along; } else { p.x = p.along; p.y = p.fixed; }
  p.yaw = p.axis === 0 ? (p.dir > 0 ? Math.PI : 0) : (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
}
function crossingOK(p) {
  // p is about to cross perpendicular line p.next along its own line p.line
  const perpCls = lineBase(p.next), ownCls = lineBase(p.line);
  if (perpCls === 0) return true;
  if (ownCls > 0) {
    // signalised junction: walk when the traffic we are crossing has red
    const i = p.axis === 0 ? p.line : p.next, j = p.axis === 0 ? p.next : p.line;
    return S.lightState(i, j, p.axis === 0 ? 0 : 1) === 'G' && S.lightState(i, j, p.axis === 0 ? 1 : 0) === 'R';
  }
  // uncontrolled zebra: wait for a gap
  const cx = p.axis === 0 ? p.fixed : p.next * 32 + LW[perpCls] / 2, cy = p.axis === 0 ? p.next * 32 + LW[perpCls] / 2 : p.fixed;
  for (const c of S.cars) if (Math.abs(c.x - cx) < 16 && Math.abs(c.y - cy) < 16 && c.v > 1) return false;
  return true;
}
function updatePeds(dt) {
  for (const p of S.peds) {
    if (p.wait > 0) {
      p.wait -= dt;
      if (crossingOK(p)) { p.wait = 0; p.crossing = true; p.next = nextLineFrom(p.along, p.dir); p.dec = decCoord(p.next, p.dir); }
      else if (p.wait <= 0) { turnPed(p); }
      if (p.wait > 0) continue;
    }
    const step = p.v * dt * p.dir;
    const before = p.along;
    p.along += step;
    p.phase += p.v * dt * 3.2;
    if ((p.dir > 0 && before < p.dec && p.along >= p.dec) || (p.dir < 0 && before > p.dec && p.along <= p.dec)) {
      p.along = p.dec;
      // at a corner: go around the block or cross
      const blkNext = p.dir > 0 ? p.next : p.next - 1;
      const canStraight = !segBlocked(p.axis, p.line, blkNext);
      const turnBlk = p.side ? p.line : p.line - 1;
      const canTurn = !segBlocked(1 - p.axis, p.next, turnBlk);
      if (canStraight && (!canTurn || Math.random() < 0.6)) {
        if (crossingOK(p)) { p.crossing = true; p.next = nextLineFrom(p.along, p.dir); p.dec = decCoord(p.next, p.dir); }
        else { p.wait = 6 + Math.random() * 30; p.crossing = false; }
      } else turnPed(p);
    }
    if (p.crossing) {
      const k = Math.floor(p.along / 32), o = p.along - k * 32, w = LW[lineBase(k)];
      p.onRoad = lineBase(k) > 0 && o > 1.8 && o < w - 1.8;
      if (!(o < w)) { p.crossing = false; p.onRoad = false; }
    } else p.onRoad = false;
    setPedXY(p);
  }
}
function turnPed(p) {
  const newDir = p.side ? 1 : -1;
  const newSide = p.dir > 0 ? 0 : 1;
  const pos = p.fixed;
  p.fixed = sideCoord(p.next, newSide) + (Math.random() - 0.5) * 0.4;
  p.line = p.next; p.side = newSide; p.axis = 1 - p.axis; p.dir = newDir;
  p.along = pos; p.next = nextLineFrom(pos, newDir); p.dec = decCoord(p.next, newDir);
  p.wait = 0; p.crossing = false;
}

/* ---------------- drawing ---------------- */
S.drawAll = function () {
  const cx = R.cx, cy = R.cy;
  for (const c of S.cars) {
    if (c.hidden) continue;
    const d = Math.hypot(c.x - cx, c.y - cy);
    if (d > 260 || !R.visible(c.x, c.y, 1, 3.2, 260)) continue;
    Mo.drawCar(c, 0);
  }
  for (const p of S.peds) {
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d > 110 || !R.visible(p.x, p.y, 1, 1.2, 110)) continue;
    Mo.drawPerson(p, 0, p.wait <= 0);
  }
  for (const f of S.flyers) {
    const d = Math.hypot(f.x - cx, f.y - cy);
    if (d > 1000 || !R.visible(f.x, f.y, f.z, 4, 1000)) continue;
    Mo.drawFlyer(f);
  }
};

/* ---------------- player taxi ---------------- */
S.hireTaxi = function (rank, cabIdx, destX, destY) {
  const cab = rank.cabs[cabIdx];
  const a = rank.line / 4, jRow = Math.floor(cab.y / 32);
  const b = Math.floor(jRow / 4) + 1; // northbound edge from node (a, b) towards (a, b-1)
  const g = edgeGeom(a, b, 0);
  const s = AC.clamp(g.y0 - cab.y, 2, g.len - 6);
  const rng = AC.RNG(AC.hash(rank.x | 0, rank.y | 0, Date.now() & 0xffff));
  const car = makeCar(a, b, 0, s, rng, 'taxi');
  car.keep = true; car.hired = true; car.people = [];
  car.bay = { x: cab.x, y: cab.y }; car.pullOut = 0; car.x = cab.x; car.y = cab.y;
  S.setTaxiDest(car, destX, destY);
  S.cars.push(car);
  return car;
};
S.setTaxiDest = function (car, x, y) {
  const e = S.nearestEdge(x, y, 400);
  if (!e) return false;
  let sa, sb;
  const J = car.junction;
  if (J) { sa = J.a2 + DX[J.d2]; sb = J.b2 + DY[J.d2]; } else { sa = car.a + DX[car.d]; sb = car.b + DY[car.d]; }
  if (!J && e.a === car.a && e.b === car.b && e.d === car.d && e.s > car.s + 8) { car.route = []; }
  else if (J && e.a === J.a2 && e.b === J.b2 && e.d === J.d2) { car.route = []; }
  else {
    const route = S.route(sa, sb, e.a, e.b);
    car.route = route || [];
    car.route.push(e.d);
  }
  car.dest = { a: e.a, b: e.b, d: e.d, s: e.s, x, y };
  car.arrived = false; car.pull = 0;
  return true;
};
S.taxiRemaining = function (car) {
  const D = car.dest;
  if (!D) return 0;
  let rem, a, b, d;
  const same = (a, b, d) => a === D.a && b === D.b && d === D.d && !car.route.length;
  if (car.junction) {
    const J = car.junction; rem = (1 - J.u) * J.len; a = J.a2; b = J.b2; d = J.d2;
    if (same(a, b, d)) return rem + D.s;
    rem += edgeGeom(a, b, d).len;
  } else {
    a = car.a; b = car.b; d = car.d;
    if (same(a, b, d)) return Math.max(0, D.s - car.s);
    rem = edgeGeom(a, b, d).len - car.s;
  }
  let na = a + DX[d], nb = b + DY[d];
  for (let k = 0; k < car.route.length; k++) {
    const dd = car.route[k];
    if (k === car.route.length - 1) { rem += 10 + D.s; break; }
    rem += 10 + edgeGeom(na, nb, dd).len; na += DX[dd]; nb += DY[dd];
  }
  return rem;
};
S.pullOver = function (car) {
  // stop at the next safe kerb point on the current (or next) edge
  if (car.junction) { car.route = []; car.dest = { a: car.junction.a2, b: car.junction.b2, d: car.junction.d2, s: 14 }; car.arrived = false; return; }
  const g = edgeGeom(car.a, car.b, car.d);
  const s = car.s + Math.max(10, car.v * 2.5);
  if (s < g.len - 6) { car.route = []; car.dest = { a: car.a, b: car.b, d: car.d, s }; }
  else { const na = car.a + DX[car.d], nb = car.b + DY[car.d]; car.route = [car.d]; if (!edgeOK(na, nb, car.d)) { for (let d = 0; d < 4; d++) if (d !== ((car.d + 2) & 3) && edgeOK(na, nb, d)) { car.route = [d]; break; } } car.dest = { a: na, b: nb, d: car.route[0], s: 14 }; }
  car.arrived = false;
};
S.clear = function () { S.cars = S.cars.filter(c => c.keep); S.peds = []; S.flyers = []; };
})();
