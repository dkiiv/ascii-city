/* ASCII CITY — elevated metro monorail: 3 lines, stations, deterministic timetable */
(function () {
'use strict';
const W = AC.W, TT = W.TYPE;
const T = AC.T = {};
const DECK = T.DECK = 8.0;       // platform / carriage floor height
const BRIDGE = T.BRIDGE = 13.5;  // upper bridge height (clears train roofs)
const TRACK = T.TRACK = 3.0;     // track offset from line centre
const CAR_LEN = 12, CAR_GAP = 1, NCARS = 3;
T.TRAIN_LEN = NCARS * CAR_LEN + (NCARS - 1) * CAR_GAP; // 38
const STN_LEN = 44;

T.LINES = [
  { id: 'L01', name: 'CHARTER LINE', col: 0xffc830, p0: { x: 3846, y: 150 }, f: { x: 0, y: 1 }, len: 7880, alongAxis: 'y' },
  { id: 'L02', name: 'CENTRAL WEST', col: 0xff4ad8, p0: { x: 3832, y: 4358 }, f: { x: -1, y: 0 }, len: 3560, alongAxis: 'x' },
  { id: 'L03', name: 'CENTRAL EAST', col: 0x30e0ff, p0: { x: 3860, y: 4358 }, f: { x: 1, y: 0 }, len: 4080, alongAxis: 'x' }
];
const SUFS = ['CROSS', 'GATE', 'JUNCTION', 'HALL', 'ROAD', 'CENTRAL', 'SQUARE', 'PARADE', 'BRIDGE', 'MARKET'];

T.pointOn = function (L, s, c) { return { x: L.p0.x + L.f.x * s + L.n.x * c, y: L.p0.y + L.f.y * s + L.n.y * c }; };
T.local2world = function (st, a, c) { return T.pointOn(st.line, st.s0 + a, c * st.es); };
T.world2local = function (st, x, y) {
  const L = st.line, dx = x - L.p0.x, dy = y - L.p0.y;
  return { a: dx * L.f.x + dy * L.f.y - st.s0, c: (dx * L.n.x + dy * L.n.y) * st.es };
};
T.lineLocal = function (L, x, y) { const dx = x - L.p0.x, dy = y - L.p0.y; return { s: dx * L.f.x + dy * L.f.y, c: dx * L.n.x + dy * L.n.y }; };

T.stations = [];
function buildLines() {
for (const L of T.LINES) {
  L.n = { x: -L.f.y, y: L.f.x }; // right of forward
  L.stations = [];
  const u0 = L.alongAxis === 'y' ? L.p0.y : L.p0.x, dir = L.alongAxis === 'y' ? L.f.y : L.f.x;
  const used = new Set();
  for (let k = 0; k < 64; k++) {
    const g0 = 128 * k + 12;
    const wLo = g0 + 22, wHi = g0 + 22 + 74;
    let s0 = dir > 0 ? wLo - u0 : u0 - wHi;
    if (s0 < 30 || s0 + 80 > L.len) continue;
    if (L.stations.length && s0 - L.stations[L.stations.length - 1].s0 < 440) continue;
    const st = { line: L, s0, idx: L.stations.length, gidx: T.stations.length, es: 1 };
    const mid = T.pointOn(L, s0 + 22, 0);
    const d = W.district(mid.x, mid.y);
    const h = AC.hash(k, L.id.charCodeAt(2), 55);
    let name = d.name.split(' ')[0] + ' ' + SUFS[h % SUFS.length];
    for (let q = 1; used.has(name) && q < SUFS.length; q++) name = d.name.split(' ')[0] + ' ' + SUFS[(h + q * 3) % SUFS.length];
    used.add(name);
    st.parkD = Math.hypot(mid.x - W.PARK.cx, mid.y - W.PARK.cy);
    st.name = name; st.district = d;
    const ent = T.local2world(st, 74.5, 8);
    st.x = ent.x; st.y = ent.y; // street entrance
    const pc = T.local2world(st, 22, 0);
    st.px = pc.x; st.py = pc.y;
    L.stations.push(st); T.stations.push(st);
    // reserve plaza for entrance stairs in the adjacent block
    const a = T.local2world(st, 48, 5.8), b = T.local2world(st, 82, 10.8);
    const rx0 = Math.min(a.x, b.x), rx1 = Math.max(a.x, b.x), ry0 = Math.min(a.y, b.y), ry1 = Math.max(a.y, b.y);
    for (let by = Math.floor(ry0 / 32); by <= Math.floor(ry1 / 32); by++)
      for (let bx = Math.floor(rx0 / 32); bx <= Math.floor(rx1 / 32); bx++)
        W.addRes(bx, by, { x0: rx0, y0: ry0, x1: rx1, y1: ry1, type: TT.STATION });
    // bbox for quick tests
    const c1 = T.local2world(st, -2, -6), c2 = T.local2world(st, 84, 11);
    st.bb = { x0: Math.min(c1.x, c2.x), y0: Math.min(c1.y, c2.y), x1: Math.max(c1.x, c2.x), y1: Math.max(c1.y, c2.y) };
  }
  // the station closest to Central Park is SIGNAL PARK (one per line)
  const nearPark = L.stations.slice().sort((a, b) => a.parkD - b.parkD)[0];
  if (nearPark && nearPark.parkD < 480) nearPark.name = 'SIGNAL PARK';
  // stop positions (front of train) for each direction
  L.stopF = L.stations.map(st => st.s0 + 41);          // forward train front
  L.stopB = L.stations.map(st => st.s0 + 3);           // backward train front
  buildTimetable(L);
}
}

/* ---------------- timetable ---------------- */
const VMAX = 20, ACC = 1.1, DWELL = 14, TERM = 22;
function runTime(D) { const dAcc = VMAX * VMAX / (2 * ACC); return D >= 2 * dAcc ? D / VMAX + VMAX / ACC : 2 * Math.sqrt(D / ACC); }
function runPos(D, t) { // distance covered after t seconds of a run of length D
  const dAcc = VMAX * VMAX / (2 * ACC);
  if (D >= 2 * dAcc) {
    const ta = VMAX / ACC, tc = (D - 2 * dAcc) / VMAX;
    if (t < ta) return { d: 0.5 * ACC * t * t, v: ACC * t };
    if (t < ta + tc) return { d: dAcc + VMAX * (t - ta), v: VMAX };
    const td = t - ta - tc; return { d: D - dAcc + VMAX * td - 0.5 * ACC * td * td, v: Math.max(0, VMAX - ACC * td) };
  }
  const th = Math.sqrt(D / ACC);
  if (t < th) return { d: 0.5 * ACC * t * t, v: ACC * t };
  const td = t - th; return { d: D / 2 + ACC * th * td - 0.5 * ACC * td * td, v: Math.max(0, ACC * (th - td)) };
}
function buildTimetable(L) {
  const segs = []; let t = 0;
  const n = L.stations.length;
  const addDir = (dir) => {
    const idxs = dir > 0 ? [...Array(n).keys()] : [...Array(n).keys()].reverse();
    idxs.forEach((si, k) => {
      const s = dir > 0 ? L.stopF[si] : L.stopB[si];
      const dw = (k === 0 || k === n - 1) ? TERM : DWELL;
      segs.push({ kind: 'dwell', t0: t, t1: t + dw, s, dir, st: si }); t += dw;
      if (k < n - 1) {
        const s2 = dir > 0 ? L.stopF[idxs[k + 1]] : L.stopB[idxs[k + 1]];
        const D = Math.abs(s2 - s), rt = runTime(D);
        segs.push({ kind: 'run', t0: t, t1: t + rt, sA: s, sB: s2, D, dir, next: idxs[k + 1] }); t += rt;
      }
    });
    // terminus reversal: the train moves to the other track instantly while dwelling
  };
  addDir(1); addDir(-1);
  L.segs = segs; L.period = t;
  L.nTrains = Math.max(2, Math.round(L.period / 170));
  L.trains = [];
  for (let k = 0; k < L.nTrains; k++) L.trains.push({ line: L, k, id: L.id + '-' + (k + 1) });
}
function trainState(L, tr, now) {
  const tau = ((now + tr.k * L.period / L.nTrains) % L.period + L.period) % L.period;
  let seg = L.segs[0];
  for (let i = 0; i < L.segs.length; i++) if (tau < L.segs[i].t1) { seg = L.segs[i]; break; }
  const lt = tau - seg.t0;
  if (seg.kind === 'dwell') {
    const left = seg.t1 - tau;
    const open = AC.clamp(Math.min((lt - 1.5) / 1.2, (left - 2.5) / 1.2), 0, 1);
    return { s: seg.s, dir: seg.dir, v: 0, dwell: true, st: seg.st, doors: open, left, tau };
  }
  const p = runPos(seg.D, lt);
  return { s: seg.sA + seg.dir * p.d, dir: seg.dir, v: p.v, dwell: false, st: -1, next: seg.next, doors: 0, eta: seg.t1 - tau, tau };
}
T.update = function (now) {
  for (const L of T.LINES) for (const tr of L.trains) {
    const s = trainState(L, tr, now);
    Object.assign(tr, s);
    tr.ct = TRACK * tr.dir;          // forward trains on the right-hand (+c) track
    const pf = T.pointOn(L, tr.s, tr.ct);
    tr.fx = pf.x; tr.fy = pf.y;
    tr.yaw = Math.atan2(L.f.x * tr.dir, -L.f.y * tr.dir);
  }
};
/* seconds until next train (per direction) at station */
T.nextTrains = function (st, now) {
  const L = st.line, out = [];
  for (const dir of [1, -1]) {
    const seg = L.segs.find(s => s.kind === 'dwell' && s.st === st.idx && s.dir === dir);
    if (!seg) continue;
    let best = 1e9, boarding = false;
    for (const tr of L.trains) {
      const tau = ((now + tr.k * L.period / L.nTrains) % L.period + L.period) % L.period;
      if (tau >= seg.t0 && tau < seg.t1) boarding = true;
      const w = ((seg.t0 - tau) % L.period + L.period) % L.period;
      if (w < best) best = w;
    }
    const termIdx = dir > 0 ? L.stations.length - 1 : 0;
    if (st.idx === termIdx) continue; // terminating trains
    out.push({ dir, wait: best, boarding, toward: L.stations[termIdx].name });
  }
  return out;
};

/* ---------------- station walkable surfaces (local coords) ---------------- */
// [a0, a1, c0, c1, z at a0, z at a1, label]
const SURF = [
  [0, STN_LEN, -1.6, 1.6, DECK, DECK, 'ISLAND PLATFORM'],
  [STN_LEN, 52, -1.4, 1.4, DECK, BRIDGE, 'CENTRAL STAIRS'],
  [52, 55.2, -1.4, 9.5, BRIDGE, BRIDGE, 'UPPER BRIDGE'],
  [55.2, 74.5, 6.5, 9.5, BRIDGE, 0, 'STAIRS']
];
T.SURF = SURF;
T.stationsNear = function (x, y, r) {
  r = r || 0;
  return T.stations.filter(st => x > st.bb.x0 - r && x < st.bb.x1 + r && y > st.bb.y0 - r && y < st.bb.y1 + r);
};
/* all surfaces at (x,y): returns [{z,label,st}] */
T.surfacesAt = function (x, y) {
  const out = [];
  for (const st of T.stationsNear(x, y)) {
    const p = T.world2local(st, x, y);
    for (const s of SURF) {
      if (p.a >= s[0] && p.a <= s[1] && p.c >= s[2] && p.c <= s[3]) {
        const z = s[4] + (s[5] - s[4]) * ((p.a - s[0]) / (s[1] - s[0]));
        out.push({ z, label: s[6], st });
      }
    }
    // boarding plates when a train dwells here with open doors
    for (const tr of st.line.trains) {
      if (!tr.dwell || tr.st !== st.idx || tr.doors < 0.6) continue;
      const side = tr.ct > 0 ? 1 : -1; // in line-c
      const cLocal = p.c * st.es;      // back to line-c
      if (cLocal * side < 1.4 || cLocal * side > 2.1) continue;
      if (doorAt(tr, st.line, x, y)) out.push({ z: DECK, label: 'BOARDING PLATE', st, train: tr });
    }
  }
  return out;
};
/* door check: is (x,y) at a door opening of train tr? */
function trainLocal(tr, L, x, y) {
  const q = T.lineLocal(L, x, y);
  return { a: (tr.s - q.s) * tr.dir, c: (q.c - tr.ct) * tr.dir }; // a: distance back from front, c: right of travel
}
T.trainLocal = trainLocal;
T.trainWorld = function (tr, a, c) {
  const L = tr.line;
  return T.pointOn(L, tr.s - a * tr.dir, tr.ct + c * tr.dir);
};
T.doorOffsets = [];
for (let k = 0; k < NCARS; k++) { const c0 = k * (CAR_LEN + CAR_GAP); T.doorOffsets.push(c0 + 3, c0 + 9); }
function doorAt(tr, L, x, y) {
  const p = trainLocal(tr, L, x, y);
  for (const d of T.doorOffsets) if (Math.abs(p.a - d) < 0.8) return true;
  return false;
}
T.doorAt = doorAt;
/* inside the train corridor (train-local) */
T.insideTrain = function (a, c) {
  if (a < 0.6 || a > T.TRAIN_LEN - 0.6 || Math.abs(c) > 1.1) return false;
  for (let k = 1; k < NCARS; k++) {
    const g0 = k * (CAR_LEN + CAR_GAP) - CAR_GAP - 0.15, g1 = k * (CAR_LEN + CAR_GAP) + 0.15;
    if (a > g0 && a < g1 && Math.abs(c) > 0.5) return false; // gangway
  }
  return true;
};
T.findTrainAt = function (x, y, z) {
  if (Math.abs(z - DECK) > 0.8) return null;
  for (const L of T.LINES) for (const tr of L.trains) {
    const p = trainLocal(tr, L, x, y);
    if (p.a > -1 && p.a < T.TRAIN_LEN + 1 && Math.abs(p.c) < 1.4) return { tr, a: p.a, c: p.c };
  }
  return null;
};
T.nearestStation = (x, y) => W.nearest(T.stations, x, y);
T.CAR_LEN = CAR_LEN; T.CAR_GAP = CAR_GAP; T.NCARS = NCARS; T.STN_LEN = STN_LEN;
buildLines();
T.update(AC.worldTime());
})();
