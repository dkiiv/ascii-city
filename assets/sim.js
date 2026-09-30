/* ============================================================
   ASCII CITY — sim.js
   Everything that moves: signalised traffic on a road graph,
   pedestrians that cross on the walk phase, the monorail, sky
   and ground taxis, the auto tour, and the player's body.
   ============================================================ */
(function (global) {
"use strict";
const AC = global.AC = global.AC || {};
const W = AC.W;
const T = W.T, CELL = W.CELL;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const Sim = {
  player: { x: 0, z: 0, yaw: 0.6, pitch: -0.06, eye: 1.7, bob: 0, speed: 0 },
  mode: "walk",                 // walk | tour | sky | ground | rail
  cars: [], peds: [], taxis: [],
  train: null,
  tour: { on: false, wp: [], i: 0, t: 0, look: 0 },
  ride: null,
  dest: null,
  crossingActive: 0,
  pathState: "IDLE",
  time: 0,
  paused: false,
  keys: {},
  onEvent: null                 // Sim.onEvent = (name, payload) => {}
};

function emit(name, payload) { if (Sim.onEvent) Sim.onEvent(name, payload || {}); }

// ------------------------------------------------------------------------
//  SPAWNING
// ------------------------------------------------------------------------
function reset() {
  Sim.cars.length = 0;
  Sim.peds.length = 0;
  Sim.taxis.length = 0;
  Sim.mode = "walk";
  Sim.ride = null;
  Sim.tour.on = false;
  Sim.player.x = W.spawn.x;
  Sim.player.z = W.spawn.z;
  Sim.player.yaw = 0.6;
  Sim.player.pitch = -0.06;
  spawnCars(96);
  spawnPeds(150);
  makeTrain();
  buildTour();
}

function randomNode() {
  const n = W.graph.nodes;
  return n[(Math.random() * n.length) | 0];
}
function nearestNode(x, z) {
  let best = null, bd = Infinity;
  for (const n of W.graph.nodes) {
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

function spawnCars(count) {
  const nodes = W.graph.nodes;
  for (let i = 0; i < count; i++) {
    const a = nodes[(Math.random() * nodes.length) | 0];
    if (!a.links.length) continue;
    const m = a.links[(Math.random() * a.links.length) | 0];
    Sim.cars.push(makeCar(a.id, m));
  }
}
function makeCar(n, m) {
  const A = W.graph.nodes[n], B = W.graph.nodes[m];
  const dx = Math.sign(B.x - A.x), dz = Math.sign(B.z - A.z);
  const off = [dz * 2, -dx * 2];
  return {
    n, m, p: Math.random(), sp: 0, maxsp: 8 + Math.random() * 6,
    hue: Math.random(), dx, dz, off, prevOff: off.slice(),
    x: A.x, z: A.z, brake: false
  };
}

const PED_COLORS = [[130, 140, 210], [200, 120, 120], [120, 200, 160], [210, 190, 120], [180, 150, 210], [150, 170, 180]];
function spawnPeds(count) {
  for (let i = 0; i < count; i++) {
    const c = randomWalkCell();
    if (!c) break;
    const d = DIRS[(Math.random() * 4) | 0];
    const col = PED_COLORS[(Math.random() * PED_COLORS.length) | 0];
    Sim.peds.push({
      x: (c.x + 0.5) * CELL, z: (c.z + 0.5) * CELL,
      dx: d[0], dz: d[1], sp: 1.2 + Math.random() * 1.1,
      ph: Math.random() * 6.28, col,
      state: "walk", tx: 0, tz: 0
    });
  }
}
function randomWalkCell() {
  for (let t = 0; t < 900; t++) {
    const x = 1 + ((Math.random() * (W.GW - 2)) | 0), z = 1 + ((Math.random() * (W.GH - 2)) | 0);
    if (W.isWalk(x, z)) return { x, z };
  }
  return null;
}

// ------------------------------------------------------------------------
//  TRAFFIC
// ------------------------------------------------------------------------
function axisOf(A, B) { return A.i !== B.i ? "EW" : "NS"; }

function mayGo(node, axis, time) {
  const ns = W.lightNS(node, time);
  const green = axis === "NS" ? ns : !ns;
  if (!green) return false;
  return true;
}

function updateCars(dt, time) {
  const nodes = W.graph.nodes;
  // bucket cars by edge for cheap car-following
  const buckets = new Map();
  for (const c of Sim.cars) {
    const k = c.n + ">" + c.m;
    let a = buckets.get(k);
    if (!a) { a = []; buckets.set(k, a); }
    a.push(c);
  }

  // intersections whose walk phase is currently held
  let crossings = 0;
  for (const node of nodes) {
    if (W.lightNS(node, time) && !W.lightYellow(node, time)) crossings++;
  }
  Sim.crossingActive = crossings;

  for (const c of Sim.cars) {
    const A = nodes[c.n], B = nodes[c.m];
    const len = Math.hypot(B.x - A.x, B.z - A.z) || 1;
    const axis = axisOf(A, B);
    const distToNode = (1 - c.p) * len;

    // --- signal ---
    let target = c.maxsp;
    const ylw = W.lightYellow(B, time);
    const green = mayGo(B, axis, time);
    let mustStop = false;
    if (!green) mustStop = distToNode < 9;
    else if (ylw && distToNode > 7) mustStop = true;
    if (mustStop && distToNode > 1.2) target = 0;

    // --- car following on the same edge ---
    const peers = buckets.get(c.n + ">" + c.m);
    if (peers) {
      for (const o of peers) {
        if (o === c) continue;
        const gap = (o.p - c.p) * len;
        if (gap > 0 && gap < 4.2) { target = Math.min(target, 0); break; }
      }
    }
    // --- yield to the player standing in the carriageway ---
    const rx = Sim.player.x - c.x, rz = Sim.player.z - c.z;
    const ahead = rx * c.dx + rz * c.dz;
    const side = Math.abs(rx * c.dz - rz * c.dx);
    if (ahead > 0 && ahead < 5 && side < 1.6) target = 0;

    c.sp += (target - c.sp) * Math.min(1, dt * (target > c.sp ? 2.2 : 5.5));
    c.brake = target < 0.5 && c.sp > 0.5;
    c.p += (c.sp * dt) / len;

    if (c.p >= 1) { arrive(c, A, B); continue; }

    const bx = lerp(A.x, B.x, c.p), bz = lerp(A.z, B.z, c.p);
    const k = smooth(clamp(c.p / 0.3, 0, 1));
    c.x = bx + lerp(c.prevOff[0], c.off[0], k);
    c.z = bz + lerp(c.prevOff[1], c.off[1], k);
  }
}

function arrive(c, A, B) {
  const nodes = W.graph.nodes;
  const opts = [];
  for (const l of nodes[B.id].links) {
    if (l === A.id) continue;                       // no U-turns
    const N = nodes[l];
    const straight = (Math.sign(N.x - B.x) === c.dx && Math.sign(N.z - B.z) === c.dz) ? 4 : 1;
    for (let s = 0; s < straight; s++) opts.push(l);
  }
  c.prevOff = c.off.slice();
  if (!opts.length) {                               // dead end: reverse
    const back = A.id;
    c.n = B.id; c.m = back; c.p = 0;
  } else {
    const m = opts[(Math.random() * opts.length) | 0];
    c.n = B.id; c.m = m; c.p = 0;
  }
  const N2 = nodes[c.n], N3 = nodes[c.m];
  c.dx = Math.sign(N3.x - N2.x); c.dz = Math.sign(N3.z - N2.z);
  c.off = [c.dz * 2, -c.dx * 2];
}

// ------------------------------------------------------------------------
//  PEDESTRIANS
// ------------------------------------------------------------------------
function updatePeds(dt, time) {
  for (const p of Sim.peds) {
    p.ph += dt * 6.5;
    if (p.state === "cross") {
      const dx = p.tx - p.x, dz = p.tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.4) { p.state = "walk"; pickPedDir(p); continue; }
      p.x += (dx / d) * p.sp * 1.25 * dt;
      p.z += (dz / d) * p.sp * 1.25 * dt;
      p.dx = dx / d; p.dz = dz / d;
      continue;
    }
    const nx = p.x + p.dx * p.sp * dt, nz = p.z + p.dz * p.sp * dt;
    const gx = W.cellOf(nx), gz = W.cellOf(nz);
    const walkable = W.isWalk(gx, gz);

    if (!walkable) {
      // try to cross the road when the traffic on it is held red
      if (Math.random() < 0.06 && tryCross(p, gx, gz, time)) continue;
      pickPedDir(p);
      continue;
    }
    if (Math.random() < 0.006) { pickPedDir(p); continue; }
    p.x = nx; p.z = nz;
  }
}

function pickPedDir(p) {
  const gx = W.cellOf(p.x), gz = W.cellOf(p.z);
  const opts = DIRS.filter(d => W.isWalk(gx + d[0], gz + d[1]));
  if (opts.length) {
    // bias to keeping the current heading
    const same = opts.filter(d => d[0] === p.dx && d[1] === p.dz);
    const d = (same.length && Math.random() < 0.72) ? same[0] : opts[(Math.random() * opts.length) | 0];
    p.dx = d[0]; p.dz = d[1];
  } else { p.dx = -p.dx; p.dz = -p.dz; }
}

// can this pedestrian start crossing the road cell (gx,gz)?
function tryCross(p, gx, gz, time) {
  if (!W.inBounds(gx, gz) || W.tile[W.idx(gx, gz)] !== T.ROAD) return false;
  // find the crossing node this kerb belongs to
  const node = nearestNode(p.x, p.z);
  if (!node || Math.hypot(node.x - p.x, node.z - p.z) > 16) return false;
  // the road being entered runs along whichever axis this cell band is not
  const bandX = W.isRoadBand(gx), bandZ = W.isRoadBand(gz);
  const roadAxis = bandX && !bandZ ? "NS" : (bandZ && !bandX ? "EW" : null);
  if (!roadAxis) return false;
  if (mayGo(node, roadAxis, time)) return false;      // traffic still flowing
  // walk straight to the pavement on the far side
  const stepX = bandX ? 0 : Math.sign(gx - W.cellOf(p.x)) || 1;
  const stepZ = bandZ ? 0 : Math.sign(gz - W.cellOf(p.z)) || 1;
  let fx = gx, fz = gz, guard = 0;
  while (guard++ < 8) {
    fx += bandX ? 0 : stepX;
    fz += bandZ ? 0 : stepZ;
    if (W.isWalk(fx, fz)) { p.tx = (fx + 0.5) * CELL; p.tz = (fz + 0.5) * CELL; p.state = "cross"; return true; }
    if (!W.inBounds(fx, fz) || W.tile[W.idx(fx, fz)] !== T.ROAD) break;
  }
  return false;
}

// ------------------------------------------------------------------------
//  MONORAIL
// ------------------------------------------------------------------------
function makeTrain() {
  const st = W.rail.stations.map(s => s.z).sort((a, b) => a - b);
  Sim.train = {
    x: W.rail.x, y: W.rail.deckH + 0.9, z: st[0],
    stations: st, idx: 0, dir: 1, sp: 0, maxsp: 26,
    dwell: 3, state: "dwell", name: "M-01",
    onboard: false, passenger: -1
  };
}
function updateTrain(dt) {
  const tr = Sim.train;
  const st = W.rail.stations;
  if (tr.state === "dwell") {
    tr.sp = 0;
    tr.dwell -= dt;
    if (tr.dwell <= 0) {
      let n = tr.idx + tr.dir;
      if (n < 0 || n >= st.length) { tr.dir = -tr.dir; n = tr.idx + tr.dir; }
      if (n < 0 || n >= st.length) n = tr.idx;
      tr.idx = n;
      tr.state = "run";
    }
    return;
  }
  const targetZ = st[tr.idx].z;
  const d = targetZ - tr.z;
  const brake = (tr.sp * tr.sp) / 20 + 0.8;
  if (Math.abs(d) <= brake) tr.sp = Math.max(2.5, tr.sp - 24 * dt);
  else tr.sp = Math.min(tr.maxsp, tr.sp + 9 * dt);
  tr.z += Math.sign(d) * tr.sp * dt;
  if (Math.abs(d) < 0.3) {
    tr.z = targetZ; tr.sp = 0;
    tr.state = "dwell"; tr.dwell = 4.5;
    emit("train-arrive", { station: tr.idx });
    if (tr.onboard && tr.passenger === tr.idx) {
      const s = st[tr.idx];
      tr.passenger = -1;
      tr.onboard = false;
      Sim.mode = "walk";
      Sim.player.x = s.x + 6;
      Sim.player.z = s.z;
      emit("rail-arrive", { station: tr.idx });
    }
  }
}
Sim.nearestStationHere = function () {
  const r = W.nearestStation(Sim.player.x, Sim.player.z);
  return r && r.dist < 14 ? r : null;
};
Sim.boardTrain = function () {
  const here = Sim.nearestStationHere();
  if (!here) return false;
  Sim.train.onboard = true;
  Sim.train.passenger = -1;
  Sim.mode = "rail";
  emit("rail-board", { station: here.station.id });
  return true;
};
Sim.railTo = function (stationId) {
  if (!Sim.train.onboard) return false;
  Sim.train.passenger = stationId;
  Sim.mode = "rail";
  emit("rail-route", { station: stationId });
  return true;
};
Sim.leaveTrain = function () {
  const tr = Sim.train;
  if (!tr.onboard) return false;
  tr.onboard = false;
  tr.passenger = -1;
  Sim.mode = "walk";
  const st = W.rail.stations[tr.idx];
  Sim.player.x = st.x + 6;
  Sim.player.z = st.z;
  emit("rail-leave", {});
  return true;
};

// ------------------------------------------------------------------------
//  ROAD PATHFINDING (Dijkstra over the node graph)
// ------------------------------------------------------------------------
function roadPath(ax, az, bx, bz) {
  const nodes = W.graph.nodes, N = nodes.length;
  const s = nodes.indexOf(nearestNode(ax, az));
  const g = nodes.indexOf(nearestNode(bx, bz));
  if (s < 0 || g < 0) return null;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const done = new Uint8Array(N);
  dist[s] = 0;
  for (let it = 0; it < N; it++) {
    let u = -1, bd = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
    if (u < 0 || u === g) break;
    done[u] = 1;
    for (const v of nodes[u].links) {
      const d = Math.hypot(nodes[v].x - nodes[u].x, nodes[v].z - nodes[u].z);
      if (dist[u] + d < dist[v]) { dist[v] = dist[u] + d; prev[v] = u; }
    }
  }
  if (dist[g] === Infinity) return null;
  const chain = [];
  for (let v = g; v !== -1; v = prev[v]) chain.push(v);
  chain.reverse();
  const pts = chain.map(i => ({ x: nodes[i].x, z: nodes[i].z }));
  pts.unshift({ x: ax, z: az });
  pts.push({ x: bx, z: bz });
  return pts;
}
function pathLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return L;
}
function pointAlong(pts, d) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    if (acc + seg >= d) {
      const t = seg < 1e-6 ? 0 : (d - acc) / seg;
      return {
        x: lerp(pts[i - 1].x, pts[i].x, t),
        z: lerp(pts[i - 1].z, pts[i].z, t),
        dx: (pts[i].x - pts[i - 1].x) / (seg || 1),
        dz: (pts[i].z - pts[i - 1].z) / (seg || 1)
      };
    }
    acc += seg;
  }
  const last = pts[pts.length - 1];
  return { x: last.x, z: last.z, dx: 1, dz: 0 };
}

// ------------------------------------------------------------------------
//  TAXIS
// ------------------------------------------------------------------------
Sim.callSkyTaxi = function (poi) {
  if (!poi) return false;
  const p = Sim.player;
  const d = Math.hypot(poi.x - p.x, poi.z - p.z);
  const dur = clamp(3.2 + d / 34, 3.2, 13);
  Sim.mode = "sky";
  Sim.ride = {
    kind: "sky", t: 0, dur,
    ax: p.x, az: p.z, bx: poi.x, bz: poi.z,
    name: poi.name
  };
  emit("taxi-sky", { dest: poi.name });
  return true;
};

Sim.callGroundTaxi = function (poi) {
  if (!poi) return false;
  const p = Sim.player;
  const pts = roadPath(p.x, p.z, poi.x, poi.z);
  if (!pts) return false;
  const L = pathLength(pts);
  Sim.mode = "ground";
  Sim.ride = {
    kind: "ground", phase: "pickup", t: 0,
    pickupT: 0, pickupDur: clamp(L / 900 + 1.4, 1.6, 5.5),
    pts, L, d: 0, sp: 0, speed: 17, name: poi.name
  };
  emit("taxi-ground", { dest: poi.name });
  return true;
};

Sim.cancelRide = function () {
  if (Sim.mode === "walk" || Sim.mode === "tour") return false;
  if (Sim.mode === "rail") return Sim.leaveTrain();
  Sim.mode = "walk";
  Sim.ride = null;
  return true;
};

function updateRide(dt) {
  const r = Sim.ride;
  const p = Sim.player;
  if (!r) return;

  if (r.kind === "sky") {
    r.t = Math.min(1, r.t + dt / r.dur);
    const e = smooth(r.t);
    const lift = Math.sin(Math.PI * r.t) * clamp(Math.hypot(r.bx - r.ax, r.bz - r.az) * 0.16, 8, 30);
    r.cx = lerp(r.ax, r.bx, e);
    r.cz = lerp(r.az, r.bz, e);
    r.cy = 1.7 + lift;
    r.yaw = Math.atan2(r.bx - r.ax, r.bz - r.az);
    if (r.t >= 1) {
      p.x = r.bx; p.z = r.bz;
      Sim.ride = null; Sim.mode = "walk";
      emit("taxi-arrive", { dest: r.name });
    }
    return;
  }

  if (r.kind === "ground") {
    if (r.phase === "pickup") {
      r.pickupT += dt;
      if (r.pickupT >= r.pickupDur) { r.phase = "ride"; emit("taxi-here", {}); }
      return;
    }
    r.sp = Math.min(r.speed, r.sp + 14 * dt);
    r.d += r.sp * dt;
    if (r.d >= r.L) {
      const last = r.pts[r.pts.length - 1];
      p.x = last.x; p.z = last.z;
      Sim.ride = null; Sim.mode = "walk";
      emit("taxi-arrive", { dest: r.name });
      return;
    }
    const q = pointAlong(r.pts, r.d);
    r.cx = q.x; r.cz = q.z; r.cy = 1.7;
    r.yaw = Math.atan2(q.dx, q.dz);
  }
}

// ------------------------------------------------------------------------
//  AUTO TOUR
// ------------------------------------------------------------------------
function buildTour() {
  const pts = [];
  const pois = W.pois.slice();
  // a loose circuit: centre, then the four quadrants, then back
  pts.push({ x: W.WORLD_W * 0.5, z: W.WORLD_W * 0.22 });
  pts.push({ x: W.WORLD_W * 0.78, z: W.WORLD_W * 0.3 });
  pts.push({ x: W.WORLD_W * 0.82, z: W.WORLD_W * 0.68 });
  pts.push({ x: W.WORLD_W * 0.55, z: W.WORLD_W * 0.84 });
  pts.push({ x: W.WORLD_W * 0.26, z: W.WORLD_W * 0.74 });
  pts.push({ x: W.WORLD_W * 0.18, z: W.WORLD_W * 0.36 });
  for (const p of pois) {
    if (p.kind === "VIEWPOINT" || p.kind === "PLAZA" || p.kind === "STATION") pts.push({ x: p.x, z: p.z });
  }
  Sim.tour.wp = pts;
  Sim.tour.i = 0;
  Sim.tour.t = 0;
}
Sim.toggleTour = function () {
  if (Sim.mode !== "walk" && Sim.mode !== "tour") return Sim.tour.on;
  Sim.tour.on = !Sim.tour.on;
  if (Sim.tour.on) {
    Sim.mode = "tour";
    let best = 0, bd = Infinity;
    Sim.tour.wp.forEach((p, i) => {
      const d = Math.hypot(p.x - Sim.player.x, p.z - Sim.player.z);
      if (d < bd) { bd = d; best = i; }
    });
    Sim.tour.i = best;
    Sim.tour.t = 0;
    Sim.tour.look = Sim.player.yaw;
  } else {
    Sim.mode = "walk";
  }
  emit("tour", { on: Sim.tour.on });
  return Sim.tour.on;
};
function updateTour(dt) {
  const t = Sim.tour;
  const p = Sim.player;
  const a = t.wp[t.i], b = t.wp[(t.i + 1) % t.wp.length];
  const seg = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  t.t += (dt * 9.5) / seg;
  while (t.t >= 1) { t.t -= 1; t.i = (t.i + 1) % t.wp.length; }
  const e = t.t;
  p.x = lerp(a.x, b.x, e);
  p.z = lerp(a.z, b.z, e);
  const want = Math.atan2(b.x - a.x, b.z - a.z);
  let d = want - t.look;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  t.look += d * Math.min(1, dt * 1.1);
  p.yaw = t.look;
  p.pitch = -0.05 + Math.sin(t.i * 1.7 + t.t * 2.2) * 0.06;
}

// ------------------------------------------------------------------------
//  PLAYER MOVEMENT
// ------------------------------------------------------------------------
function blocked(x, z) {
  const r = 0.5;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const gx = W.cellOf(x + dx * r), gz = W.cellOf(z + dz * r);
    if (!W.inBounds(gx, gz)) return true;
    const c = W.idx(gx, gz);
    const tl = W.tile[c];
    if (tl === T.BUILD && W.height[c] > 0) return true;
    if (tl === T.WATER) return true;
    if (tl === T.GRASS && W.height[c] > 0) return true;
  }
  return false;
}

function movePlayer(dt) {
  const k = Sim.keys, p = Sim.player;
  const sprint = k.ShiftLeft || k.ShiftRight;
  const sp = (sprint ? 15 : 6.6) * dt;
  let fx = 0, fz = 0;
  if (k.KeyW || k.ArrowUp)    { fx += Math.sin(p.yaw);   fz += Math.cos(p.yaw); }
  if (k.KeyS || k.ArrowDown)  { fx -= Math.sin(p.yaw);   fz -= Math.cos(p.yaw); }
  if (k.KeyA || k.ArrowLeft)  { fx += Math.cos(p.yaw);   fz -= Math.sin(p.yaw); }
  if (k.KeyD || k.ArrowRight) { fx -= Math.cos(p.yaw);   fz += Math.sin(p.yaw); }
  // touch stick
  if (Sim.stick && (Sim.stick.x || Sim.stick.y)) {
    fx += Math.sin(p.yaw) * -Sim.stick.y + Math.cos(p.yaw) * Sim.stick.x;
    fz += Math.cos(p.yaw) * -Sim.stick.y - Math.sin(p.yaw) * Sim.stick.x;
  }
  const m = Math.hypot(fx, fz);
  if (m < 1e-6) { p.speed *= 0.86; return; }
  fx = fx / m * sp; fz = fz / m * sp;
  if (!blocked(p.x + fx, p.z)) p.x += fx;
  if (!blocked(p.x, p.z + fz)) p.z += fz;
  p.speed = Math.hypot(fx, fz) / dt;
  p.bob += p.speed * dt * 1.4;
}

// ------------------------------------------------------------------------
//  MAIN UPDATE
// ------------------------------------------------------------------------
Sim.update = function (dt, time) {
  if (Sim.paused) return;
  Sim.time = time;
  updateCars(dt, time);
  updatePeds(dt, time);
  updateTrain(dt);

  if (Sim.mode === "walk") movePlayer(dt);
  else if (Sim.mode === "tour") updateTour(dt);
  else if (Sim.mode === "rail") { /* the camera rides the train */ }
  else updateRide(dt);

  if ((Sim.mode === "sky" || Sim.mode === "ground") && !Sim.ride) Sim.mode = "walk";
  if (Sim.mode === "tour" && !Sim.tour.on) Sim.mode = "walk";
  if (Sim.mode === "rail" && !Sim.train.onboard) Sim.mode = "walk";

  W.markSeen(Sim.player.x, Sim.player.z, 5);
};

// camera for the renderer, honouring the active mode
Sim.camera = function () {
  const p = Sim.player;
  if (Sim.mode === "sky" && Sim.ride) {
    const r = Sim.ride;
    return { x: r.cx, y: r.cy, z: r.cz, yaw: r.yaw, pitch: -0.30, eye: 0, fov: 1.35 };
  }
  if (Sim.mode === "ground" && Sim.ride && Sim.ride.phase !== "pickup") {
    const r = Sim.ride;
    return { x: r.cx, y: r.cy, z: r.cz, yaw: r.yaw, pitch: -0.04, eye: 0, fov: 1.3 };
  }
  if (Sim.mode === "rail") {
    const tr = Sim.train;
    return { x: tr.x + 1.2, y: tr.y + 0.4, z: tr.z, yaw: tr.dir > 0 ? Math.PI / 2 : -Math.PI / 2, pitch: -0.05, eye: 0, fov: 1.4 };
  }
  const bob = Math.sin(p.bob * 2.2) * Math.min(0.06, p.speed * 0.006);
  return { x: p.x, y: p.eye + bob, z: p.z, yaw: p.yaw, pitch: p.pitch, eye: 0, fov: 1.22 };
};

Sim.taxiEta = function () {
  const r = Sim.ride;
  if (!r) return null;
  if (r.kind === "sky") return { label: "SKY", eta: Math.max(0, r.dur - r.t) };
  if (r.kind === "ground" && r.phase === "pickup") return { label: "GROUND", eta: Math.max(0, r.pickupDur - r.pickupT) };
  if (r.kind === "ground") return { label: "GROUND", eta: Math.max(0, (r.L - r.d) / r.speed) };
  return null;
};

Sim.reset = reset;
Sim.rebuild = function () { reset(); };
Sim.roadPath = roadPath;
Sim.pointAlong = pointAlong;
Sim.pathLength = pathLength;
global.AC.Sim = Sim;
})(window);
