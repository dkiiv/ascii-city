/* ASCII CITY — game state, player, travel systems, menus, opening sequence */
(function () {
'use strict';
const W = AC.W, R = AC.R, T = AC.T, S = AC.S, I = AC.I, A = AC.A, Mo = AC.Mo, TY = W.TYPE;
const G = AC.G = {};
G.mode = 'prelude';
G.p = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, tyaw: 0, tpitch: 0, eye: 1.65, look: 0, lookP: 0, inside: null, train: null, taxi: null, sky: null, onFoot: true };
G.keys = {};
G.relays = new Set(AC.load('relays', []));
G.visited = new Set(AC.load('visited', []));
G.mapLevel = AC.load('mapLevel', 0);
G.menu = null; G.ctx = null; G.prompt = ''; G.guide = null; G.tour = null; G.toastT = 0; G.toast = '';
G.time = 0; G.solid = 1; G.fx = null; G.help = false;
G.relayKnown = r => G.relays.has(r.idx);
const HP = Math.PI / 2;
const fwdOf = yaw => ({ x: Math.sin(yaw), y: -Math.cos(yaw) });

function toast(msg, t) { G.toast = msg; G.toastT = t || 3.5; }
G.toastMsg = toast;
function setCtx(label, title, copy) { G.ctx = { label, title, copy }; }

/* ------------------------------------------------------------------ movement & collision */
function walkBlocked(x, y) {
  const r = 0.28;
  return W.solidAt(x - r, y - r) || W.solidAt(x + r, y - r) || W.solidAt(x - r, y + r) || W.solidAt(x + r, y + r);
}
let boardCand = null;
function resolveZ(x, y) {
  const p = G.p;
  boardCand = null;
  let best = null;
  for (const s of T.surfacesAt(x, y)) if (Math.abs(s.z - p.z) < 0.75 && (best === null || Math.abs(s.z - p.z) < Math.abs(best - p.z))) best = s.z;
  if (best !== null) return best;
  if (Math.abs(p.z - T.DECK) < 0.5) {
    const ft = T.findTrainAt(x, y, p.z);
    if (ft && ft.tr.dwell && ft.tr.doors > 0.5 && T.insideTrain(ft.a, ft.c)) { boardCand = ft; return T.DECK; }
  }
  if (p.z < 0.75) return walkBlocked(x, y) ? null : 0;
  return null;
}
function moveOnFoot(mx, my) {
  const p = G.p;
  if (p.train) { moveInTrain(mx, my); return; }
  if (p.inside) { moveInside(mx, my); return; }
  const tries = [[p.x + mx, p.y + my], [p.x + mx, p.y], [p.x, p.y + my]];
  for (const [tx, ty] of tries) {
    if (tx === p.x && ty === p.y) continue;
    const z = resolveZ(tx, ty);
    if (z !== null) {
      p.x = tx; p.y = ty; p.z = z;
      if (boardCand) { p.train = { tr: boardCand.tr, a: boardCand.a, c: boardCand.c }; toast('ON BOARD // ' + boardCand.tr.line.name); }
      return;
    }
  }
}
function moveInTrain(mx, my) {
  const p = G.p, tr = p.train.tr, L = tr.line;
  const Fx = L.f.x * tr.dir, Fy = L.f.y * tr.dir, Rx = -Fy, Ry = Fx;
  const da = -(mx * Fx + my * Fy), dc = mx * Rx + my * Ry;
  const a = p.train.a, c = p.train.c, na = a + da, nc = c + dc;
  if (T.insideTrain(na, nc)) { p.train.a = na; p.train.c = nc; }
  else if (tr.dwell && tr.doors > 0.6 && nc < -1.0 && T.doorOffsets.some(d => Math.abs(na - d) < 0.75)) {
    const w = T.trainWorld(tr, na, -1.5);
    p.train = null; p.x = w.x; p.y = w.y; p.z = T.DECK;
    toast('PLATFORM // ' + (T.stations.find(s => s.line === L && s.idx === tr.st) || { name: '' }).name);
    return;
  }
  else if (T.insideTrain(na, c)) p.train.a = na;
  else if (T.insideTrain(a, nc)) p.train.c = nc;
}
function syncTrain() {
  const p = G.p;
  if (!p.train) return;
  const w = T.trainWorld(p.train.tr, p.train.a, p.train.c);
  p.x = w.x; p.y = w.y; p.z = T.DECK;
}
function moveInside(mx, my) {
  const p = G.p, IN = p.inside, r = 0.28;
  const ok = (x, y) => I.free(IN, x - r, y - r) && I.free(IN, x + r, y - r) && I.free(IN, x - r, y + r) && I.free(IN, x + r, y + r);
  for (const [tx, ty] of [[p.x + mx, p.y + my], [p.x + mx, p.y], [p.x, p.y + my]]) {
    if (ok(tx, ty)) { p.x = tx; p.y = ty; return; }
  }
  // pushing against the street door walks you out
  if (IN.door && Math.hypot(p.x + mx * 3 - IN.door.x, p.y + my * 3 - IN.door.y) < 0.9) exitBuilding();
}

/* ------------------------------------------------------------------ buildings */
function facingBuilding() {
  const p = G.p, f = fwdOf(p.yaw);
  for (const d of [0.6, 1.0, 1.5, 2.0]) {
    const x = p.x + f.x * d, y = p.y + f.y * d;
    const q = W.cellAt(x, y);
    if (q.b && q.h > 0.5) return { b: q.b, x, y, d };
  }
  return null;
}
function enterBuilding(fb) {
  const b = fb.b;
  if (!b.enter) { toast(b.kind === 'hedge' ? 'A NEATLY TRIMMED HEDGE.' : 'SEALED STRUCTURE // NO ACCESS'); return; }
  const IN = I.build(b, 0, { x: fb.x, y: fb.y });
  if (!IN) { toast('NO ACCESS'); return; }
  const p = G.p;
  G.lastOutside = { x: p.x, y: p.y, yaw: p.yaw };
  p.inside = IN; p.x = IN.spawn.x; p.y = IN.spawn.y; p.z = 0; p.tyaw = p.yaw = IN.spawn.yaw;
  G.mode = 'interior'; A.chime();
  toast('ENTERED // ' + IN.name);
}
function exitBuilding() {
  const p = G.p, IN = p.inside;
  if (!IN) return;
  const o = IN.outside || G.lastOutside;
  p.inside = null; G.mode = 'walk';
  if (o) { p.x = o.x; p.y = o.y; p.tyaw = p.yaw = o.yaw !== undefined ? o.yaw : p.yaw; }
  p.z = 0;
  if (walkBlocked(p.x, p.y)) { const s = W.findOpenSpot(p.x, p.y, 12); p.x = s.x; p.y = s.y; }
  toast('STREET LEVEL');
}
function gotoFloor(f) {
  const p = G.p, IN = p.inside;
  if (!IN) return;
  const NI = I.build(IN.b, f, null);
  if (!NI) { toast('FLOOR UNAVAILABLE'); return; }
  if (f === 0) { // keep a street door
    const d = IN.floor === 0 ? IN.door : null;
    const G0 = I.build(IN.b, 0, d || G.lastOutside || { x: IN.b.x0, y: IN.b.y0 });
    p.inside = G0;
    const L = G0.lift || G0.spawn; p.x = G0.spawn.x; p.y = G0.spawn.y;
    if (G0.lift) { for (const [dx, dy] of [[0, 1.6], [0, -1.6], [-1.6, 0], [2.2, 0]]) if (I.free(G0, G0.lift.x + dx, G0.lift.y + dy)) { p.x = G0.lift.x + dx; p.y = G0.lift.y + dy; break; } }
  } else { p.inside = NI; p.x = NI.spawn.x; p.y = NI.spawn.y; }
  A.chime();
  toast('LIFT // ' + (f === 0 ? 'GROUND FLOOR' : 'FLOOR ' + f) + ' // ' + p.inside.name);
}
function liftMenu() {
  const IN = G.p.inside, top = I.topFloor(IN.b);
  const set = new Set([0, 1, Math.round(top / 4), Math.round(top / 2), Math.round(top * 3 / 4), top, IN.floor - 1, IN.floor + 1].filter(f => f >= 0 && f <= top && f !== IN.floor));
  const floors = [...set].sort((a, b) => a - b).slice(0, 9);
  G.menu = {
    label: 'LIFT // ' + (IN.b.lm >= 0 ? W.LANDMARKS[IN.b.lm].name : IN.name), title: 'SELECT FLOOR', copy: 'Current: ' + (IN.floor === 0 ? 'GROUND' : 'FLOOR ' + IN.floor) + ' of ' + top,
    options: floors.map(f => ({ text: (f === 0 ? 'GROUND FLOOR' : 'FLOOR ' + AC.lpad(f, 2, '0')) + ' // ' + (I.NAMES[I.floorType(IN.b, f)] || '') + (f === top && top > 3 ? ' // TOP' : ''), fn: () => gotoFloor(f) }))
  };
}

/* ------------------------------------------------------------------ relays */
function nearRelay(r) {
  const p = G.p, near = W.nearestLocal('relay', p.x, p.y);
  return near && near.d < (r || 3) ? near : null;
}
function nearPhoneBooth() {
  const p = G.p;
  const L = W.layout(Math.floor(p.x / 32), Math.floor(p.y / 32));
  for (const q of L.props) if (q.t === 'phone' && Math.hypot(q.x - p.x, q.y - p.y) < 2.2) return q;
  return null;
}
/* up to 10 rows fit the number keys; longer lists show 9 per page plus [0] MORE >> */
function pageOptions(items, page, toOption, reopen) {
  if (items.length <= 10) return items.map(toOption);
  const pages = Math.ceil(items.length / 9), p = page % pages;
  const opts = items.slice(p * 9, p * 9 + 9).map(toOption);
  opts.push({ text: 'MORE >> // PAGE ' + (p + 1) + '/' + pages, fn: () => reopen((p + 1) % pages) });
  return opts;
}
function relayDirectory(fromRelay, page) {
  const known = W.relays.filter(r => G.relays.has(r.idx));
  const sectors = [...new Set(known.map(r => r.d.sector))];
  const from = fromRelay;
  const districtMenu = (sec, dpage) => {
    const list = known.filter(r => r.d.sector === sec);
    G.menu = {
      label: 'RELAY // ' + sec, title: 'DIRECTORY // SELECT DISTRICT', copy: 'Transmission through the public network.',
      back: () => relayDirectory(from, page),
      options: pageOptions(list, dpage || 0,
        r => ({ text: AC.pad(r.name, 18) + ' // ' + AC.fmtDist(Math.hypot(r.x - from.x, r.y - from.y)), disabled: r === from, fn: () => startRelayTravel(from, r) }),
        p => districtMenu(sec, p))
    };
  };
  G.menu = {
    label: 'RELAY // ' + from.name, title: 'DIRECTORY // SELECT SECTOR', copy: known.length + ' RELAYS REGISTERED // ' + sectors.length + ' SECTORS',
    options: pageOptions(sectors, page || 0,
      sec => ({ text: AC.pad(sec, 10) + ' // ' + known.filter(r => r.d.sector === sec).length + ' RELAY(S)', fn: () => districtMenu(sec, 0) }),
      p => relayDirectory(from, p))
  };
}
function startRelayTravel(from, to) {
  G.menu = null;
  G.mode = 'relay';
  G.relayT = { t: 0, from, to, moved: false };
  A.transmit(3.6);
}

/* ------------------------------------------------------------------ ground taxi */
function nearestRankCab() {
  const p = G.p, nr = W.nearestLocal('rank', p.x, p.y);
  if (!nr || nr.d > 16) return null;
  let best = null, bd = 3.6;
  nr.f.cabs.forEach((c, k) => { if (c.taken) return; const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; best = k; } });
  return best === null ? null : { rank: nr.f, k: best };
}
function taxiMenu(rank, k) {
  const p = G.p;
  const ns = T.nearestStation(p.x, p.y);
  const others = W.ranks.filter(r => r !== rank).map(r => ({ r, d: Math.hypot(r.x - p.x, r.y - p.y) })).sort((a, b) => a.d - b.d).slice(0, 5);
  const lm = W.nearestPOI(p.x, p.y);
  const opts = [];
  if (ns) opts.push({ text: 'NEAREST METRO // ' + ns.f.name + ' // ' + ns.f.line.id + ' // ' + AC.fmtDistL(ns.d), fn: () => hireTaxi(rank, k, ns.f.x, ns.f.y, ns.f.name) });
  for (const o of others) opts.push({ text: o.r.d.name + ' // ' + AC.fmtDistL(o.d) + ' // ' + (G.visited.has(o.r.d.idx) ? 'VISITED' : 'UNVISITED'), fn: () => hireTaxi(rank, k, o.r.x, o.r.y, o.r.d.name) });
  if (lm) opts.push({ text: 'LANDMARK // ' + lm.f.name + ' // ' + AC.fmtDistL(lm.d), fn: () => hireTaxi(rank, k, lm.f.x, lm.f.y, lm.f.name) });
  G.menu = { label: 'RANK // ' + rank.name, title: 'DRIVER:// WHERE TO?', copy: '', options: opts };
}
function hireTaxi(rank, k, x, y, name) {
  G.menu = null;
  const car = S.hireTaxi(rank, k, x, y);
  rank.cabs[k].taken = true;
  setTimeout(() => { rank.cabs[k].taken = false; }, 90000);
  const p = G.p;
  p.taxi = car; p.onFoot = false; G.mode = 'taxi'; G.tour = null;
  p.look = 0; p.lookP = 0;
  car.destName = name;
  car.phase = 'PULLING OUT';
  A.click();
  toast('CAB // ' + name);
}
function leaveTaxi() {
  const p = G.p, car = p.taxi;
  if (!car) return;
  const f = fwdOf(car.yaw), sx = Math.cos(car.yaw), sy = Math.sin(car.yaw);
  // step out on the kerb side (right of travel)
  let spot = null;
  for (let d = 2.5; d < 9 && !spot; d += 0.5) {
    const x = car.x + sx * d, y = car.y + sy * d, t = W.typeAt(x, y);
    if ((t === TY.SIDEWALK || t === TY.PED || t === TY.PLAZA || t === TY.RANK || t === TY.STATION || t === TY.PATH || t === TY.GRASS) && !walkBlocked(x, y)) spot = { x, y };
  }
  if (!spot) spot = W.findOpenSpot(car.x + sx * 4, car.y + sy * 4, 20);
  p.x = spot.x; p.y = spot.y; p.z = 0; p.tyaw = p.yaw = car.yaw + p.look;
  p.taxi = null; p.onFoot = true; G.mode = 'walk';
  car.keep = false; car.dest = null; car.route = null; car.hired = false; car.pull = 0; car.arrived = false;
  toast('ARRIVED // ' + (car.destName || ''));
}

/* ------------------------------------------------------------------ sky taxi */
function skyMenu(pad) {
  const p = G.p;
  const opts = W.POIS.map(lm => ({ lm, d: Math.hypot(lm.x - p.x, lm.y - p.y) })).sort((a, b) => a.d - b.d).slice(0, 8)
    .map(o => ({ text: o.lm.name + ' // ' + AC.fmtDistL(o.d), fn: () => launchSky(pad, o.lm.x, o.lm.y, o.lm.name, o.lm) }));
  opts.push({ text: 'SIGNAL KEEPER // CENTRAL PARK // HOME', fn: () => launchSky(pad, W.STATUE.x, W.STATUE.y, 'SIGNAL KEEPER', W.STATUE) });
  opts.push({ text: 'SOMEWHERE RANDOM', fn: () => { const x = 400 + Math.random() * 7400, y = 400 + Math.random() * 7400; launchSky(pad, x, y, W.district(x, y).name, null); } });
  G.menu = { label: 'SKY TAXI // ' + pad.name, title: 'AUTOPILOT // SELECT DESTINATION', copy: 'Destinations are tied to the major landmarks.', options: opts };
}
function launchSky(pad, tx, ty, name, lm) {
  G.menu = null;
  const p = G.p;
  const land = W.findOpenSpot(lm ? tx : tx, lm ? ty - (lm.statue ? 20 : 8) : ty, 160, 7);
  const cruise = Math.max(150, Math.min(520, maxAlongPath(pad.x, pad.y, land.x, land.y) + 45));
  p.sky = { x: pad.x, y: pad.y, z: 1.0, yaw: Math.atan2(land.x - pad.x, -(land.y - pad.y)), v: 0, vz: 0, phase: 'LIFT-OFF', tx: land.x, ty: land.y, cruise, name, pad, flying: true, range: 9000 };
  pad.away = true;
  p.onFoot = false; G.mode = 'sky'; G.tour = null; p.look = 0; p.lookP = 0;
  A.thrust();
  toast('AUTOPILOT // ' + name);
}
function maxAlongPath(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(d / 64));
  let m = 0;
  for (let k = 0; k <= n; k++) { const u = k / n; m = Math.max(m, W.maxHeightAround(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 40)); }
  return m;
}
function updateSky(dt) {
  const s = G.p.sky;
  const dx = s.tx - s.x, dy = s.ty - s.y, dist = Math.hypot(dx, dy);
  s.range = dist;
  const want = Math.atan2(dx, -dy);
  const turn = AC.angDiff(s.yaw, want);
  switch (s.phase) {
    case 'LIFT-OFF':
      s.vz = Math.min(s.vz + dt * 4, 12); s.z += s.vz * dt;
      s.yaw += AC.clamp(turn, -0.5 * dt, 0.5 * dt);
      if (s.z >= s.cruise * 0.85) s.phase = 'CRUISING ALTITUDE';
      break;
    case 'CRUISING ALTITUDE': case 'EN ROUTE':
      s.z += (s.cruise - s.z) * Math.min(1, dt * 0.8);
      s.yaw += AC.clamp(turn, -0.6 * dt, 0.6 * dt);
      s.v = Math.min(s.v + dt * 5, dist < 500 ? Math.max(12, dist / 10) : 55);
      s.x += Math.sin(s.yaw) * s.v * dt; s.y -= Math.cos(s.yaw) * s.v * dt;
      if (s.v > 40) s.phase = 'EN ROUTE';
      if (dist < 45) { s.phase = s.emergency ? 'EMERGENCY SET-DOWN' : 'DESCENT'; }
      break;
    case 'DESCENT': case 'EMERGENCY SET-DOWN': {
      s.v = Math.max(0, Math.min(s.v, dist * 0.8));
      const k = Math.min(1, dt * 1.5);
      s.x += dx * k * 0.6; s.y += dy * k * 0.6;
      s.yaw += AC.clamp(turn, -0.4 * dt, 0.4 * dt);
      s.z = Math.max(1.0, s.z - Math.max(3, s.z * 0.35) * dt);
      if (s.z <= 1.01 && dist < 1.5) { s.phase = 'LANDED'; s.flying = false; A.chime(); }
      break;
    }
    case 'LANDED': break;
  }
}
function leaveSky() {
  const p = G.p, s = p.sky;
  const sx = Math.cos(s.yaw), sy = Math.sin(s.yaw);
  const spot = W.findOpenSpot(s.x + sx * 3.5, s.y + sy * 3.5, 20);
  p.x = spot.x; p.y = spot.y; p.z = 0; p.tyaw = p.yaw = s.yaw + p.look;
  s.pad.away = false;
  p.sky = null; p.onFoot = true; G.mode = 'walk';
  toast('SET DOWN // ' + W.district(p.x, p.y).name);
}

/* ------------------------------------------------------------------ auto tour (A* pathfinding) */
function tourPickTarget() {
  const p = G.p;
  const reached = G.tourReached || (G.tourReached = new Set());
  let list = W.POIS.filter(l => !reached.has(l.code));
  if (!list.length) { reached.clear(); list = W.POIS.slice(); }
  const n = W.nearest(list, p.x, p.y);
  return n.f;
}
function cornerOK(i, j) { return i >= 0 && j >= 0 && i < 256 && j < 256; }
function segWalkable(i, j, d) {
  // along vertical line i from corner (i,j) to (i,j+-1) or horizontal line j
  if (d === 0 || d === 2) { const jb = d === 2 ? j : j - 1; const r = W.vSup(i, jb) ? W.regionAt(i, jb) : -1; return r < 0 || W.regions[r].kind !== 'landmark'; }
  const ib = d === 1 ? i : i - 1; const r = W.hSup(j, ib) ? W.regionAt(ib, j) : -1; return r < 0 || W.regions[r].kind !== 'landmark';
}
function cornerRoute(i0, j0, i1, j1) {
  const key = (i, j) => i * 256 + j;
  const open = [[i0, j0, 0, 0]], came = new Map(), gs = new Map([[key(i0, j0), 0]]), DX = S.DX, DY = S.DY;
  let it = 0;
  while (open.length && it++ < 60000) {
    let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][3] < open[bi][3]) bi = k;
    const [i, j, g] = open.splice(bi, 1)[0];
    if (i === i1 && j === j1) { const out = [[i, j]]; let k = key(i, j); while (came.has(k)) { k = came.get(k); out.unshift([Math.floor(k / 256), k % 256]); } return out; }
    for (let d = 0; d < 4; d++) {
      const ni = i + DX[d], nj = j + DY[d];
      if (!cornerOK(ni, nj) || !segWalkable(i, j, d)) continue;
      const ng = g + 1, nk = key(ni, nj);
      if (ng < (gs.has(nk) ? gs.get(nk) : 1e9)) { gs.set(nk, ng); came.set(nk, key(i, j)); open.push([ni, nj, ng, ng + 1.15 * (Math.abs(ni - i1) + Math.abs(nj - j1))]); }
    }
  }
  return null;
}
function localPath(x0, y0, x1, y1) {
  // 8-connected A* on the 1m grid in a window around start/goal, avoiding solid cells
  const minx = Math.floor(Math.min(x0, x1)) - 10, miny = Math.floor(Math.min(y0, y1)) - 10;
  const w = Math.floor(Math.max(x0, x1)) + 11 - minx, h = Math.floor(Math.max(y0, y1)) + 11 - miny;
  if (w * h > 9000) return null;
  const sx = Math.floor(x0) - minx, sy = Math.floor(y0) - miny, gx = Math.floor(x1) - minx, gy = Math.floor(y1) - miny;
  const N = w * h, gsc = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const blocked = new Uint8Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = W.solidAt(minx + x + 0.5, miny + y + 0.5); blocked[y * w + x] = s ? 1 : 0; }
  blocked[sy * w + sx] = 0; blocked[gy * w + gx] = 0;
  const open = [sy * w + sx]; gsc[sy * w + sx] = 0;
  const hf = (i) => Math.hypot((i % w) - gx, Math.floor(i / w) - gy);
  let it = 0;
  while (open.length && it++ < 6000) {
    let bi = 0, bf = 1e9;
    for (let k = 0; k < open.length; k++) { const f = gsc[open[k]] + hf(open[k]); if (f < bf) { bf = f; bi = k; } }
    const cur = open.splice(bi, 1)[0];
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === gy * w + gx) {
      const pts = []; let c = cur;
      while (c >= 0) { pts.unshift({ x: minx + (c % w) + 0.5, y: miny + Math.floor(c / w) + 0.5 }); c = from[c]; }
      return pts;
    }
    const cx = cur % w, cy = Math.floor(cur / w);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (blocked[ni] || closed[ni]) continue;
      if (dx && dy && (blocked[cy * w + nx] || blocked[ny * w + cx])) continue;
      const ng = gsc[cur] + (dx && dy ? 1.414 : 1);
      if (ng < gsc[ni]) { gsc[ni] = ng; from[ni] = cur; open.push(ni); }
    }
  }
  return null;
}
function startTour() {
  const p = G.p;
  const target = tourPickTarget();
  const i0 = Math.round(p.x / 32), j0 = Math.round(p.y / 32);
  const i1 = Math.round(target.x / 32), j1 = Math.round(target.y / 32);
  const corners = cornerRoute(i0, j0, i1, j1) || [];
  const wps = corners.map(([i, j]) => ({ x: i * 32 + 1.0, y: j * 32 + 1.0 }));
  wps.push({ x: target.x, y: target.y, final: true });
  G.tour = { target, wps, k: 0, path: null, pk: 0, wait: 0, stuck: 0, lastX: p.x, lastY: p.y, pause: 0 };
  toast('AUTO TOUR // ' + target.name);
}
G.toggleTour = function () {
  if (G.tour) { G.tour = null; toast('AUTO TOUR OFF'); return; }
  if (G.mode !== 'walk' || G.p.train) { toast('AUTO TOUR IS AVAILABLE ON FOOT'); return; }
  startTour();
};
function crossingWait(x, y, nx, ny) {
  // before stepping from the kerb onto a carriageway, obey signals / wait for a gap
  const t0 = W.typeAt(x, y), t1 = W.typeAt(nx, ny);
  if (W.isCarType(t0) || !W.isCarType(t1)) return false;
  const i = Math.floor(nx / 32), j = Math.floor(ny / 32), ox = nx - i * 32, oy = ny - j * 32;
  const cv = W.lineBase(i), ch = W.lineBase(j), inV = ox < W.LW[cv] && cv > 0;
  if (cv > 0 && ch > 0) {
    const crossingNS = inV && !(oy < W.LW[ch] && Math.abs(ny - y) > Math.abs(nx - x)); // crossing the N-S road?
    const axisGo = crossingNS ? 1 : 0;
    return !(S.lightState(i, j, axisGo) === 'G' && S.lightState(i, j, 1 - axisGo) === 'R');
  }
  for (const c of S.cars) if (Math.abs(c.x - nx) < 18 && Math.abs(c.y - ny) < 18 && c.v > 1) return true;
  return false;
}
function updateTour(dt) {
  const tr = G.tour, p = G.p;
  if (tr.pause > 0) { tr.pause -= dt; if (tr.pause <= 0) startTour(); return; }
  const wp = tr.wps[tr.k];
  if (!wp) { startTour(); return; }
  if (Math.hypot(tr.target.x - p.x, tr.target.y - p.y) < (tr.target.statue ? 16 : 10)) {
    G.tourReached.add(tr.target.code); A.chime();
    toast('ARRIVED // ' + tr.target.name, 5);
    tr.pause = 5; return;
  }
  if (!tr.path) {
    tr.path = localPath(p.x, p.y, wp.x, wp.y) || [{ x: wp.x, y: wp.y }];
    tr.pk = 0;
  }
  let pt = tr.path[Math.min(tr.pk, tr.path.length - 1)];
  while (tr.pk < tr.path.length - 1 && Math.hypot(pt.x - p.x, pt.y - p.y) < 0.8) { tr.pk++; pt = tr.path[tr.pk]; }
  const dx = pt.x - p.x, dy = pt.y - p.y, d = Math.hypot(dx, dy);
  if (d < 0.6 && tr.pk >= tr.path.length - 1) { tr.k++; tr.path = null; return; }
  const sp = 3.2 * dt, mx = dx / d * Math.min(sp, d), my = dy / d * Math.min(sp, d);
  if (crossingWait(p.x, p.y, p.x + dx / d * 1.2, p.y + dy / d * 1.2)) { tr.wait += dt; tr.waiting = true; }
  else {
    tr.waiting = false;
    const bx = p.x, by = p.y;
    moveOnFoot(mx, my);
    const moved = Math.hypot(p.x - bx, p.y - by);
    if (moved < sp * 0.2) { tr.stuck += dt; if (tr.stuck > 1.2) { tr.path = null; tr.stuck = 0; if (Math.random() < 0.3) tr.k++; } }
    else tr.stuck = 0;
  }
  // camera follows the route (with mouse free-look offset decaying back)
  const want = Math.atan2(dx, -dy);
  p.tyaw = want + p.look;
  p.look *= Math.exp(-dt * 0.6);
}

/* ------------------------------------------------------------------ CCTV (LIVE) */
G.CAMS = [
  { name: 'CENTRAL PARK // SIGNAL KEEPER', x: W.STATUE.x - 18, y: W.STATUE.y + 14, z: 5, yaw: 0.9, pitch: 0.08 },
  { name: 'SIGNAL BOULEVARD // TRAFFIC', x: 3846 - 30, y: 4358 + 8, z: 7, yaw: HP + 0.08, pitch: -0.18 },
  { name: 'CHARTER AVENUE // SOUTHBOUND', x: 3846 + 7, y: 4000, z: 16, yaw: Math.PI - 0.05, pitch: -0.22 },
  { name: 'MERIDIAN TOWER // PLAZA', x: W.LANDMARKS[0].cx - 60, y: W.LANDMARKS[0].cy + 70, z: 3, yaw: 0.72, pitch: 0.5 },
  { name: 'SKYLINE // VECTOR', x: W.LANDMARKS[4].cx - 420, y: W.LANDMARKS[4].cy + 240, z: 140, yaw: 1.05, pitch: 0.05 },
  { name: 'CALDER TWINS // NORTH APPROACH', x: W.LANDMARKS[7].cx, y: W.LANDMARKS[7].y0 - 90, z: 12, yaw: Math.PI, pitch: 0.35 }
];
G.toggleCCTV = function () {
  if (G.mode === 'cctv') { G.mode = G.cctv.prev; G.cctv = null; S.clear(); toast('LIVE FEED CLOSED'); return; }
  if (G.mode !== 'walk' && G.mode !== 'interior') { toast('LIVE FEED UNAVAILABLE DURING TRAVEL'); return; }
  G.cctv = { k: 0, t: 0, prev: G.mode };
  G.mode = 'cctv'; G.tour = null; S.clear();
};

/* ------------------------------------------------------------------ interaction */
G.interact = function () {
  const p = G.p;
  if (G.menu) return;
  switch (G.mode) {
    case 'prelude': preludeInteract(); return;
    case 'taxi': if (p.taxi && (p.taxi.arrived || p.taxi.v < 0.2 && p.taxi.pull > 0.9)) leaveTaxi(); else toast('[Y] ASK THE DRIVER TO PULL OVER'); return;
    case 'sky': if (p.sky.phase === 'LANDED') leaveSky(); else toast('[Y] EMERGENCY SET-DOWN'); return;
    case 'interior': {
      const IN = p.inside;
      if (IN.lift && Math.hypot(IN.lift.x - p.x, IN.lift.y - p.y) < 2.4) { liftMenu(); return; }
      if (IN.door && Math.hypot(IN.door.x - p.x, IN.door.y - p.y) < 2.4) { exitBuilding(); return; }
      toast(IN.lift ? 'FIND THE LIFT [E] OR THE DOOR' : 'FIND THE DOOR TO LEAVE');
      return;
    }
    case 'walk': {
      if (p.train) { toast('WAIT FOR THE DOORS TO OPEN'); return; }
      const rc = nearestRankCab();
      if (rc) { taxiMenu(rc.rank, rc.k); return; }
      const pad = W.nearestLocal('pad', p.x, p.y);
      if (pad && pad.d < 6 && !pad.f.away) { skyMenu(pad.f); return; }
      const rl = nearRelay(2.6);
      if (rl) {
        if (!G.relays.has(rl.f.idx)) { G.relays.add(rl.f.idx); AC.save('relays', [...G.relays]); A.chime(); toast('RELAY REGISTERED // ' + rl.f.name, 4); }
        relayDirectory(rl.f); return;
      }
      if (nearPhoneBooth()) { A.beep(420); toast('DIAL TONE // THIS BOOTH IS NOT ON THE RELAY NETWORK'); return; }
      const fb = facingBuilding();
      if (fb && p.z < 1) { enterBuilding(fb); return; }
      toast('NOTHING TO INTERACT WITH');
    }
  }
};
G.pressY = function (shift) {
  const p = G.p;
  if (G.mode === 'taxi') { if (p.taxi && !p.taxi.arrived) { S.pullOver(p.taxi); p.taxi.destName = 'KERBSIDE'; toast('DRIVER // PULLING OVER'); } return; }
  if (G.mode === 'sky') {
    const s = p.sky;
    if (s.phase !== 'LANDED' && !s.emergency) { const spot = W.findOpenSpot(s.x + Math.sin(s.yaw) * 60, s.y - Math.cos(s.yaw) * 60, 200, 7); s.tx = spot.x; s.ty = spot.y; s.emergency = true; s.name = 'SET-DOWN POINT'; if (s.phase === 'LIFT-OFF') s.phase = 'EN ROUTE'; toast('EMERGENCY SET-DOWN // FINDING A SAFE PLACE TO LAND'); }
    return;
  }
  if (G.mode !== 'walk' && G.mode !== 'interior') return;
  if (shift) { const n = W.nearestLocal('rank', p.x, p.y); if (n) { G.guide = { kind: 'rank', f: n.f }; A.beep(660); } }
  else { const n = W.nearestLocal('pad', p.x, p.y); if (n) { G.guide = { kind: 'pad', f: n.f }; A.beep(990); } }
};
G.selectMenu = function (k) {
  const m = G.menu;
  if (!m || !m.options[k] || m.options[k].disabled) return;
  A.click();
  const o = m.options[k];
  G.menu = null;
  o.fn();
};
G.backMenu = function () { if (!G.menu) return false; if (G.menu.back) G.menu.back(); else G.menu = null; return true; };

/* ------------------------------------------------------------------ prelude / opening */
function preludeInteract() {
  const pr = G.pre, p = G.p, IN = pr.room;
  if (pr.stage !== 'ringing') return;
  if (Math.hypot(IN.phone.x - p.x, IN.phone.y - p.y) < 2.4) { pr.stage = 'call'; pr.t = 0; A.pickup(); return; }
  if (Math.hypot(IN.door.x - p.x, IN.door.y - p.y) < 2.2) { A.beep(160); toast('THE DOOR IS LOCKED.'); return; }
  toast('THE PHONE IS RINGING.');
}
const CALL = ['...', 'PUBLIC RELAY // LINE OPEN', '"Don\'t hang up."', '"You\'ve been outside the plane for too long."', '"Hold still. We\'re bringing you through."', 'SIGNAL LOCK // 3 . 2 . 1'];
G.startPrelude = function () {
  const room = I.prelude();
  G.pre = { room, stage: 'ringing', t: 0, ring: 0, lines: [] };
  G.mode = 'prelude'; G.solid = 1;
  const p = G.p; p.inside = room; p.x = room.spawn.x; p.y = room.spawn.y; p.z = 0; p.yaw = p.tyaw = 0; p.pitch = p.tpitch = -0.05;
};
G.skipIntro = function () {
  if (G.mode !== 'prelude' && G.mode !== 'intro') return;
  finishIntro();
};
function beginCity() {
  const p = G.p;
  p.inside = null;
  p.x = W.STATUE.x - 4; p.y = W.STATUE.y + 26; p.z = 0; p.yaw = p.tyaw = 0; p.pitch = p.tpitch = 0.12;
  G.mode = 'intro'; G.intro = { t: 0 }; G.solid = 0;
  A.startMusic();
}
function finishIntro() {
  const p = G.p;
  if (G.mode === 'prelude') beginCity();
  G.mode = 'walk'; G.intro = null; G.solid = 0; G.pre = null;
  p.inside = null;
  AC.save('seenIntro', true);
  A.startMusic();
}
function updatePrelude(dt) {
  const pr = G.pre;
  pr.t += dt;
  if (pr.stage === 'ringing') {
    pr.ring -= dt;
    if (pr.ring <= 0) { pr.ring = 3; A.ring(); }
  } else if (pr.stage === 'call') {
    const n = Math.min(CALL.length, Math.floor(pr.t / 1.3) + 1);
    pr.lines = CALL.slice(0, n);
    if (pr.t > CALL.length * 1.3 + 0.6) { pr.stage = 'break'; pr.t = 0; }
  } else if (pr.stage === 'break') {
    G.solid = Math.max(0, 1 - pr.t / 2.6);
    if (pr.t > 3.6) beginCity();
  }
}
function updateIntro(dt) {
  G.intro.t += dt;
  if (G.intro.t > 6.5) finishIntro();
}

/* ------------------------------------------------------------------ per-frame update */
G.update = function (dt) {
  const p = G.p;
  G.time += dt;
  if (G.toastT > 0) G.toastT -= dt;
  // mouse-look smoothing: the mouse sets a target orientation which the camera follows
  const k = 1 - Math.exp(-dt * 13);
  // keyboard turning (arrow keys)
  const kt = (G.keys.ArrowLeft ? -1 : 0) + (G.keys.ArrowRight ? 1 : 0);
  if (kt) { if (G.mode === 'taxi' || G.mode === 'sky') p.look += kt * dt * 1.8; else p.tyaw += kt * dt * 1.9; }
  if (G.keys.PageUp) p.tpitch = Math.min(1.1, p.tpitch + dt);
  if (G.keys.PageDown) p.tpitch = Math.max(-1.1, p.tpitch - dt);
  let mf = 0, ms = 0;
  if (!G.menu) {
    mf = (G.keys.KeyW || G.keys.ArrowUp ? 1 : 0) - (G.keys.KeyS || G.keys.ArrowDown ? 1 : 0);
    ms = (G.keys.KeyD ? 1 : 0) - (G.keys.KeyA ? 1 : 0);
  }
  const running = G.keys.ShiftLeft || G.keys.ShiftRight;
  switch (G.mode) {
    case 'prelude': {
      updatePrelude(dt);
      if (G.pre && G.pre.stage === 'ringing') walk(dt, mf, ms, false);
      break;
    }
    case 'intro': updateIntro(dt); break;
    case 'walk': case 'interior': {
      if (G.tour && (mf || ms)) { G.tour = null; toast('AUTO TOUR OFF'); }
      if (G.tour) updateTour(dt); else walk(dt, mf, ms, running);
      syncTrain();
      if (G.mode === 'interior') I.update(p.inside, dt);
      if (G.guide) { const d = Math.hypot(G.guide.f.x - p.x, G.guide.f.y - p.y); if (d < 7) { toast('ARRIVED // ' + G.guide.f.name); G.guide = null; } }
      break;
    }
    case 'taxi': {
      const car = p.taxi;
      if (car.pullOut !== undefined) car.phase = 'PULLING OUT';
      else if (car.arrived) car.phase = 'ARRIVED';
      else if (car.dest && car.pull > 0) car.phase = 'ARRIVING';
      else if (car.waitLight && car.v < 1) car.phase = 'WAITING AT SIGNALS';
      else if (car.v < 3) car.phase = 'IN TRAFFIC';
      else car.phase = 'EN ROUTE';
      if (car.arrived) { car.arrivedT = (car.arrivedT || 0) + dt; if (car.arrivedT > 1.6) leaveTaxi(); }
      break;
    }
    case 'sky': {
      updateSky(dt);
      if (p.sky && p.sky.phase === 'LANDED') { p.sky.landT = (p.sky.landT || 0) + dt; if (p.sky.landT > 1.8) leaveSky(); }
      break;
    }
    case 'relay': {
      const rt = G.relayT;
      rt.t += dt;
      if (rt.t > 1.75 && !rt.moved) {
        rt.moved = true;
        const to = rt.to;
        p.x = to.x; p.y = to.y - 1.6; p.z = 0; p.yaw = p.tyaw = Math.PI;
        if (walkBlocked(p.x, p.y)) { const s = W.findOpenSpot(p.x, p.y, 10); p.x = s.x; p.y = s.y; }
        S.clear();
      }
      if (rt.t > 3.6) { G.mode = 'walk'; G.relayT = null; toast('RELAY // ' + rt.to.name, 4); }
      break;
    }
    case 'cctv': {
      const c = G.cctv;
      c.t += dt;
      if (c.t > 16) { c.t = 0; c.k = (c.k + 1) % G.CAMS.length; S.clear(); }
      break;
    }
  }
  // camera smoothing
  p.yaw += AC.angDiff(p.yaw, p.tyaw) * k;
  p.pitch += (p.tpitch - p.pitch) * k;
  // districts visited
  if (G.mode === 'walk' || G.mode === 'taxi' || G.mode === 'sky') {
    const d = W.district(p.x, p.y);
    if (!G.visited.has(d.idx)) { G.visited.add(d.idx); AC.save('visited', [...G.visited]); }
  }
};
function walk(dt, mf, ms, running) {
  const p = G.p;
  if (!mf && !ms) return;
  const sp = (running ? 6.4 : 3.2) * dt, f = fwdOf(p.yaw), sx = Math.cos(p.yaw), sy = Math.sin(p.yaw);
  let mx = f.x * mf + sx * ms, my = f.y * mf + sy * ms;
  const l = Math.hypot(mx, my);
  mx = mx / l * sp; my = my / l * sp;
  if (G.mode === 'prelude') { const IN = G.pre.room; const nx = p.x + mx, ny = p.y + my; if (I.free(IN, nx, p.y) && I.free(IN, nx + 0.3 * Math.sign(mx), p.y)) p.x = nx; if (I.free(IN, p.x, ny) && I.free(IN, p.x, ny + 0.3 * Math.sign(my))) p.y = ny; if (Math.hypot(p.x - IN.phone.x, p.y - IN.phone.y) < 1.1) { p.x -= mx; p.y -= my; } return; }
  moveOnFoot(mx, my);
}

/* ------------------------------------------------------------------ camera for the current mode */
G.camera = function () {
  const p = G.p;
  switch (G.mode) {
    case 'taxi': {
      const c = p.taxi, f = fwdOf(c.yaw), sx = Math.cos(c.yaw), sy = Math.sin(c.yaw);
      return { x: c.x - f.x * 0.55 + sx * 0.42, y: c.y - f.y * 0.55 + sy * 0.42, z: 1.18, yaw: c.yaw + p.look, pitch: p.pitch };
    }
    case 'sky': {
      const s = p.sky, f = fwdOf(s.yaw);
      return { x: s.x + f.x * 0.2, y: s.y + f.y * 0.2, z: s.z + 1.6, yaw: s.yaw + p.look, pitch: p.pitch };
    }
    case 'cctv': {
      const c = G.CAMS[G.cctv.k], sway = Math.sin(G.time * 0.15) * 0.25;
      return { x: c.x, y: c.y, z: c.z, yaw: c.yaw + sway, pitch: c.pitch };
    }
    default:
      return { x: p.x, y: p.y, z: p.z + (p.inside ? p.inside.floorZ : 0) + p.eye, yaw: p.yaw, pitch: p.pitch };
  }
};
G.onMouse = function (dx, dy) {
  const p = G.p, s = 0.0022;
  if (G.mode === 'taxi' || G.mode === 'sky' || G.tour) { p.look += dx * s; if (G.mode !== 'walk') p.look = AC.clamp(p.look, -2.6, 2.6); }
  else p.tyaw += dx * s;
  p.tpitch = AC.clamp(p.tpitch - dy * s, -1.15, 1.15);
};

/* ------------------------------------------------------------------ station awareness */
G.stationContext = function () {
  const p = G.p;
  if (p.train) {
    const tr = p.train.tr, L = tr.line;
    const term = tr.dir > 0 ? L.stations[L.stations.length - 1] : L.stations[0];
    if (tr.dwell) { const st = L.stations[tr.st]; return { label: L.id + ' // ' + L.name, title: (tr.doors > 0.5 ? 'DOORS OPEN // ' : 'STOPPED // ') + st.name, copy: 'Towards ' + term.name + '. ' + (tr.doors > 0.5 ? 'Walk through the doors to leave the train.' : 'Doors ' + (tr.left < 3 ? 'closing.' : 'opening.')) }; }
    const nx = L.stations[tr.next];
    return { label: L.id + ' // ' + L.name, title: 'NEXT :: ' + (nx ? nx.name : '') + ' :: ' + Math.max(0, Math.round(tr.eta)) + 's', copy: 'Towards ' + term.name + '. ' + Math.round(tr.v * 3.6) + ' km/h. Free to walk the carriages.' };
  }
  const near = T.stationsNear(p.x, p.y, 12);
  if (!near.length) return null;
  const st = near[0];
  const loc = T.world2local(st, p.x, p.y);
  let where = null, copy = '';
  const surf = T.surfacesAt(p.x, p.y).filter(s => Math.abs(s.z - p.z) < 0.8)[0];
  if (surf) where = surf.label;
  else if (p.z < 0.5 && Math.hypot(st.x - p.x, st.y - p.y) < 16) where = 'STATION ENTRANCE';
  else if (p.z < 0.5) where = 'STREET LEVEL';
  if (!where) return null;
  const nt = T.nextTrains(st, AC.worldTime());
  const fmt = s => s < 60 ? Math.round(s) + 's' : Math.floor(s / 60) + 'm ' + AC.lpad(Math.round(s % 60), 2, '0') + 's';
  const due = nt.map(n => (n.boarding ? 'NOW BOARDING' : fmt(n.wait)) + ' > ' + n.toward).join('  |  ');
  switch (where) {
    case 'STATION ENTRANCE': copy = 'Stairs up to the ' + st.line.name + '. Walk in - there is no menu.'; break;
    case 'STREET LEVEL': copy = 'Beneath the elevated ' + st.line.name + '.'; break;
    case 'STAIRS': copy = 'Climbing to the upper bridge.'; break;
    case 'UPPER BRIDGE': copy = 'The bridge crosses above the track to the island platform.'; break;
    case 'CENTRAL STAIRS': copy = 'The central stairs between the bridge and the platform.'; break;
    case 'ISLAND PLATFORM': case 'BOARDING PLATE': copy = 'Next trains: ' + due; break;
  }
  return { label: 'METRO // ' + st.line.id, title: st.name + ' // ' + where, copy };
};
})();
