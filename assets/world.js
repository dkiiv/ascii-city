/* ============================================================
   ASCII CITY — world.js
   Seeded city generation: road grid, blocks, buildings, districts,
   trees, street props, neon signs, elevated monorail, POIs.
   Also owns the road graph the traffic sim drives on.
   ============================================================ */
(function (global) {
"use strict";
const AC = global.AC = global.AC || {};

// ---------- constants ----------
const GW = 100, GH = 100;          // grid cells per side
const CELL = 4;                    // world units per cell
const WORLD_W = GW * CELL;
const PERIOD = 13;                 // road spacing (cells)
const RAIL_DECK_H = 7.2;           // monorail deck top height

const T = {
  GRASS: 0, ROAD: 1, WALK: 2, BUILD: 3, PLAZA: 4, WATER: 5
};

// ---------- buffers ----------
const tile     = new Uint8Array(GW * GH);
const height   = new Float32Array(GW * GH);   // building / tree height
const bhash    = new Float32Array(GW * GH);   // per-building random
const lightmap = new Float32Array(GW * GH);   // baked streetlight glow
const district = new Uint8Array(GW * GH);     // district id
const deck     = new Float32Array(GW * GH);   // elevated deck top (0 = none)
const seen     = new Uint8Array(GW * GH);     // explored (map fog)

const idx = (x, z) => x + z * GW;
const inBounds = (x, z) => x >= 0 && z >= 0 && x < GW && z < GH;
const cellOf = (w) => Math.floor(w / CELL);
const centerOf = (g) => (g + 0.5) * CELL;

// ---------- rng ----------
let __seed = 1337;
function seedRng(s) { __seed = (s | 0) || 1; }
function rnd() {
  __seed |= 0; __seed = (__seed + 0x6D2B79F5) | 0;
  let t = Math.imul(__seed ^ (__seed >>> 15), 1 | __seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rint(n) { return Math.floor(rnd() * n); }
function pick(arr) { return arr[rint(arr.length)]; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rint(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

// ---------- name banks ----------
const DISTRICT_NAMES = [
  "MERIDIAN SPRAWL", "GLASS QUARTER", "LOW LANTERN", "CINDER BAY", "THE ARCADES",
  "HALCYON FLATS", "RUST TERRACE", "NINE WELLS", "SALT MARKET", "VELVET DOCK",
  "ORACLE ROW", "FOUNDRY END", "PALE HOLLOW", "CLOCKWORK WARD", "THE LONG ROOM",
  "AMBER GATE", "SABLE CROSS", "IRON MEADOW", "QUIET AVENUE", "TIDEWORKS",
  "COPPER LEAF", "NORTH BASIN", "THE STACKS", "LANTERN FIELD", "GREY HARBOR",
  "ECHO TERRACE", "MOON MARKET", "BRICKHAVEN", "SIXTH CHORUS", "WEEPING ROW",
  "VAULT DISTRICT", "HOLLOW SPINE", "LAMP DISTRICT", "CINDER ROW", "STATION WARD",
  "OLD CANNERY", "PAPER QUARTER", "BLACKFIELD", "SILVER CUT", "THE TERRACES"
];
const SIGN_WORDS = [
  "NOCTURNE", "24H", "RAMEN", "LOAN", "SALT", "TEA", "OPEN", "MART", "BAR", "VOID",
  "HOTEL", "PHOTO", "TAXI", "NET CAFE", "LAUNDRO", "NINE WELLS", "SPEAKEASY", "RADIO",
  "GLASS", "FOUNDRY", "ORACLE", "AMBER", "QUIET", "PAPER", "SILVER", "CINDER",
  "STILL", "LATE", "ARCHIVE", "SHOE", "PLUMB", "KEYS", "BREAD", "MOTH", "TIDE"
];
const STATION_NAMES = [
  "MERIDIAN CENTRAL", "LANTERN NORTH", "GLASS QUARTER", "FOUNDRY GATE", "NINE WELLS",
  "HALCYON PARK", "SALT MARKET", "ORACLE ROW", "DOCK SIDE", "THE ARCADES"
];
const MART_NAMES = ["NOCTURNE MART", "LATE MART", "SALT MART", "OWL MART", "NINE MART", "QUIET MART"];
const BAR_NAMES = ["THE LONG ROOM", "MOTH & KEY", "BLUE HOUR", "THE FOUNDRY", "LOW LANTERN", "STILL BAR"];
const PAD_NAMES = ["PAD 7", "SKY PAD NORTH", "ROOFTOP PAD", "PAD 12"];
const VIEW_NAMES = ["OVERLOOK 3", "THE TERRACE", "HILL DECK", "WEST BALCONY"];
const ARCHIVE_NAMES = ["CITY ARCHIVE", "READING ROOM", "THE STACKS", "RECORD OFFICE"];
const CHAPEL_NAMES = ["SMALL CHAPEL", "SHRINE OF COINS", "QUIET ROOM", "LAMP CHAPEL"];
const PLAZA_NAMES = ["FOUNTAIN PLAZA", "CLOCK PLAZA", "OPEN SQUARE", "MARKET SQUARE"];
const TERMINAL_NAMES = ["CAB TERMINAL", "RANK 4", "GROUND TERMINAL", "CAB RANK WEST"];

// ---------- generated content ----------
const W = {
  GW, GH, CELL, WORLD_W, PERIOD, T, RAIL_DECK_H,
  tile, height, bhash, lightmap, district, deck, seen,
  idx, inBounds, cellOf, centerOf,
  seedRng, rnd,

  districts: [],
  pois: [],
  props: [],
  signs: [],
  lamps: [],
  trees: [],
  rail: null,
  graph: null,
  spawn: { x: 0, z: 0 },
  counts: { buildings: 0, props: 0, signs: 0, statics: 0 },
  seed: 1337,

  isRoad(x, z) { return inBounds(x, z) && tile[idx(x, z)] === T.ROAD; },
  isWalk(x, z) { return inBounds(x, z) && (tile[idx(x, z)] === T.WALK || tile[idx(x, z)] === T.PLAZA); },
  isBuilt(x, z) { return inBounds(x, z) && tile[idx(x, z)] === T.BUILD && height[idx(x, z)] > 0; },
  solidAt(x, z) { return W.isBuilt(x, z); },
  districtAt(wx, wz) {
    const x = cellOf(wx), z = cellOf(wz);
    if (!inBounds(x, z)) return null;
    return W.districts[district[idx(x, z)]] || null;
  },
  heightAt(wx, wz) {
    const x = cellOf(wx), z = cellOf(wz);
    return inBounds(x, z) ? height[idx(x, z)] : 0;
  },
  lightAt(wx, wz) {
    const x = cellOf(wx), z = cellOf(wz);
    return inBounds(x, z) ? lightmap[idx(x, z)] : 0;
  }
};

// road-lane helpers -------------------------------------------------------
// Avenues run N-S at columns a, a+1. Streets run E-W at rows s, s+1.
const isRoadBand = (g) => { const m = ((g % PERIOD) + PERIOD) % PERIOD; return m === 0 || m === 1; };

// ------------------------------------------------------------------------
//  GENERATION
// ------------------------------------------------------------------------
function generate(seed) {
  W.seed = (seed | 0) || 1;
  seedRng(W.seed);
  tile.fill(T.GRASS); height.fill(0); bhash.fill(0);
  district.fill(0); deck.fill(0); seen.fill(0);
  W.pois.length = 0; W.props.length = 0; W.signs.length = 0;
  W.lamps.length = 0; W.trees.length = 0;
  W.counts = { buildings: 0, props: 0, signs: 0, statics: 0 };

  makeDistricts();
  makeRoads();
  makeSidewalks();
  makeBlocks();
  makeWater();
  makePlazas();
  makeTrees();
  makeLamps();
  makeRail();
  makeGraph();
  makeSigns();
  makeProps();
  makePOIs();
  bakeLight();
  pickSpawn();
  return W;
}

// ---------- districts: a 4x4 partition with character ----------
function makeDistricts() {
  W.districts.length = 0;
  const names = shuffle(DISTRICT_NAMES.slice());
  let n = 0;
  for (let dz = 0; dz < 4; dz++) {
    for (let dx = 0; dx < 4; dx++) {
      // downtown bias: taller near the middle of the map
      const cx = (dx + 0.5) / 4 - 0.5, cz = (dz + 0.5) / 4 - 0.5;
      const d = Math.hypot(cx, cz) * 1.45;              // 0 centre .. ~1 edge
      const h = Math.max(0.12, 1 - d * 0.95 + (rnd() - 0.5) * 0.28);
      W.districts.push({
        id: n,
        name: names[n % names.length],
        heightBias: h,
        signDensity: 0.16 + h * 0.5 + rnd() * 0.14,
        treeDensity: 0.03 + (1 - h) * 0.12,
        waterChance: h < 0.3 ? 0 : 0.10,
        tint: [
          0.85 + rnd() * 0.4,
          0.85 + rnd() * 0.4,
          0.95 + rnd() * 0.35
        ]
      });
      n++;
    }
  }
  for (let z = 0; z < GH; z++)
    for (let x = 0; x < GW; x++)
      district[idx(x, z)] = Math.min(15, Math.floor(z / (GH / 4)) * 4 + Math.floor(x / (GW / 4)));
}

// ---------- roads ----------
function makeRoads() {
  for (let z = 0; z < GH; z++)
    for (let x = 0; x < GW; x++)
      if (isRoadBand(x) || isRoadBand(z)) tile[idx(x, z)] = T.ROAD;
}

function makeSidewalks() {
  // any grass touching a road becomes sidewalk
  const q = [];
  for (let z = 0; z < GH; z++)
    for (let x = 0; x < GW; x++)
      if (tile[idx(x, z)] === T.ROAD) q.push(x, z);
  for (let i = 0; i < q.length; i += 2) {
    const x = q[i], z = q[i + 1];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, nz = z + dz;
      if (!inBounds(nx, nz)) continue;
      if (tile[idx(nx, nz)] === T.GRASS) tile[idx(nx, nz)] = T.WALK;
    }
  }
}

// ---------- buildings inside each block ----------
function makeBlocks() {
  for (let bz = 0; bz < GH; bz += PERIOD) {
    for (let bx = 0; bx < GW; bx += PERIOD) {
      const gx = bx + 3, gz = bz + 3, x1 = bx + PERIOD, z1 = bz + PERIOD;
      if (gx >= GW || gz >= GH) continue;
      const d = W.districts[district[idx(Math.min(gx, GW - 1), Math.min(gz, GH - 1))]] || W.districts[0];
      if (rnd() < 0.10) continue;                       // vacant lot
      const count = 1 + rint(3);
      for (let n = 0; n < count; n++) {
        let tries = 22;
        while (tries-- > 0) {
          const w = 2 + rint(4), dep = 2 + rint(4);
          const rx = gx + rint(Math.max(1, x1 - gx - w));
          const rz = gz + rint(Math.max(1, z1 - gz - dep));
          let ok = true;
          for (let z = rz; z < rz + dep && ok; z++)
            for (let x = rx; x < rx + w && ok; x++)
              if (!(inBounds(x, z) && tile[idx(x, z)] !== T.BUILD)) ok = false;
          if (!ok) continue;
          const h = 2.2 + Math.pow(rnd(), 1.55) * (5 + d.heightBias * 26);
          const bh = rnd();
          for (let z = rz; z < rz + dep; z++)
            for (let x = rx; x < rx + w; x++) {
              if (!inBounds(x, z)) continue;
              tile[idx(x, z)] = T.BUILD; height[idx(x, z)] = h; bhash[idx(x, z)] = bh;
            }
          W.counts.buildings++;
          break;
        }
      }
    }
  }
}

// ---------- a river across one edge district ----------
function makeWater() {
  const band = 4 + rint(4);
  const vertical = rnd() < 0.5;
  const at = vertical ? (GW - 18 + rint(10)) : (GH - 18 + rint(10));
  for (let i = 0; i < GH; i++) {
    for (let b = 0; b < band; b++) {
      const wob = Math.round(Math.sin(i * 0.16) * 1.6);
      const x = vertical ? at + b + wob : i;
      const z = vertical ? i : at + b + wob;
      if (!inBounds(x, z)) continue;
      const c = idx(x, z);
      if (tile[c] === T.ROAD && ((x % PERIOD) < 2 || (z % PERIOD) < 2) && b > 0 && b < band - 1) continue;
      tile[c] = T.WATER; height[c] = 0;
    }
  }
  // clear buildings that were sitting on water
  for (let i = 0; i < GW * GH; i++) if (tile[i] === T.WATER) height[i] = 0;
}

// ---------- plazas ----------
function makePlazas() {
  for (let n = 0; n < 5; n++) {
    const bx = PERIOD * (1 + rint(6)) + 3, bz = PERIOD * (1 + rint(6)) + 3;
    const w = 4 + rint(3), dep = 4 + rint(3);
    for (let z = bz; z < bz + dep; z++)
      for (let x = bx; x < bx + w; x++) {
        if (!inBounds(x, z) || tile[idx(x, z)] === T.ROAD) continue;
        tile[idx(x, z)] = T.PLAZA; height[idx(x, z)] = 0;
      }
  }
}

// ---------- trees ----------
function makeTrees() {
  for (let z = 1; z < GH - 1; z++) {
    for (let x = 1; x < GW - 1; x++) {
      const c = idx(x, z);
      const d = W.districts[district[c]] || W.districts[0];
      if (tile[c] === T.GRASS && rnd() < (0.05 + d.treeDensity)) {
        height[c] = 1.1 + rnd() * 1.7;
        W.trees.push({ x: centerOf(x), z: centerOf(z), h: height[c] });
      } else if (tile[c] === T.PLAZA && rnd() < 0.05) {
        height[c] = 1.2 + rnd() * 1.1;
        W.trees.push({ x: centerOf(x), z: centerOf(z), h: height[c] });
      }
    }
  }
}

// ---------- street lamps ----------
function addLamp(gx, gz, side) {
  W.lamps.push({ x: centerOf(gx), z: centerOf(gz), y: 3.4, side: side || 0 });
}
function makeLamps() {
  for (let z = 2; z < GH - 2; z += 5) {
    for (let x = 2; x < GW - 2; x++) {
      if (tile[idx(x, z)] === T.WALK && (x % PERIOD) === 2 && !hasLampNear(centerOf(x), centerOf(z))) addLamp(x, z, 0);
    }
  }
  for (let x = 2; x < GW - 2; x += 5) {
    for (let z = 2; z < GH - 2; z++) {
      if (tile[idx(x, z)] === T.WALK && (z % PERIOD) === 2 && !hasLampNear(centerOf(x), centerOf(z))) addLamp(x, z, 1);
    }
  }
}
function hasLampNear(x, z) {
  for (const l of W.lamps) if (Math.abs(l.x - x) < 3 && Math.abs(l.z - z) < 3) return true;
  return false;
}

// ---------- elevated monorail ----------
function makeRail() {
  const avenues = [];
  for (let x = 2; x < GW - 2; x++) if (isRoadBand(x)) avenues.push(x);
  // pick the avenue nearest the centre of mass of the map
  const target = Math.floor(GW / 2);
  let line = avenues[0];
  for (const a of avenues) if (Math.abs(a - target) < Math.abs(line - target)) line = a;

  const stations = [];
  const names = shuffle(STATION_NAMES.slice());
  const nStations = 5;
  const first = 8, last = GH - 10;
  for (let i = 0; i < nStations; i++) {
    const gz = Math.round(first + (last - first) * (i / (nStations - 1)));
    stations.push({
      id: i,
      name: names[i % names.length],
      gx: line, gz: gz,
      x: centerOf(line), z: centerOf(gz),
      kind: "STATION"
    });
  }

  // deck over the avenue
  for (let z = 1; z < GH - 1; z++) {
    for (let dx = 0; dx < 2; dx++) {
      const gx = line + dx;
      if (!inBounds(gx, z)) continue;
      const c = idx(gx, z);
      if (tile[c] === T.WATER) continue;
      deck[c] = RAIL_DECK_H;
    }
  }
  // station boxes beside the line
  for (const s of stations) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = 3; dx <= 5; dx++) {
        const gx = s.gx + dx, gz = s.gz + dz;
        if (!inBounds(gx, gz)) continue;
        const c = idx(gx, gz);
        if (tile[c] === T.ROAD || tile[c] === T.WATER) continue;
        tile[c] = T.BUILD; height[c] = RAIL_DECK_H + 1.6; bhash[c] = 0.72;
      }
    }
  }

  // support pillars (rendered as sprites)
  for (let z = 4; z < GH - 4; z += 4) {
    W.props.push({ x: centerOf(line), z: centerOf(z), y: 0, type: "pillar", h: RAIL_DECK_H });
  }

  W.rail = {
    axis: "z",
    line: line,
    x: centerOf(line),
    deckH: RAIL_DECK_H,
    stations: stations,
    lineName: names[0].split(" ")[0] + " LINE"
  };
}

// ---------- road graph for traffic ----------
// Nodes sit at avenue/street crossings. Edges join adjacent nodes.
function makeGraph() {
  const avenues = [], streets = [];
  for (let g = 0; g < GW; g++) if (isRoadBand(g) && (g % PERIOD) === 0) avenues.push(g);
  for (let g = 0; g < GH; g++) if (isRoadBand(g) && (g % PERIOD) === 0) streets.push(g);

  const nodes = [];
  const at = {};
  for (let i = 0; i < avenues.length; i++) {
    for (let j = 0; j < streets.length; j++) {
      const id = nodes.length;
      nodes.push({
        id, i, j,
        x: (avenues[i] + 1) * CELL,
        z: (streets[j] + 1) * CELL,
        ns: i + j,                        // parity drives the light phase
        links: []
      });
      at[i + ":" + j] = id;
    }
  }
  for (let i = 0; i < avenues.length; i++) {
    for (let j = 0; j < streets.length; j++) {
      const n = nodes[at[i + ":" + j]];
      if (i + 1 < avenues.length) n.links.push(at[(i + 1) + ":" + j]);
      if (i - 1 >= 0) n.links.push(at[(i - 1) + ":" + j]);
      if (j + 1 < streets.length) n.links.push(at[i + ":" + (j + 1)]);
      if (j - 1 >= 0) n.links.push(at[i + ":" + (j - 1)]);
    }
  }
  W.graph = { nodes, avenues, streets, at };
}

// ---------- neon signs on building faces ----------
function makeSigns() {
  // A sign hangs on a building face that looks at a street. Buildings sit behind
  // a sidewalk, so "facing a road" means a road cell within two steps.
  const roadIn = (x, z, dx, dz) => {
    for (let k = 1; k <= 2; k++) if (isRoadCell(x + dx * k, z + dz * k)) return true;
    return false;
  };
  const cands = [];
  for (let z = 1; z < GH - 1; z++) {
    for (let x = 1; x < GW - 1; x++) {
      const c = idx(x, z);
      if (tile[c] !== T.BUILD || height[c] < 3) continue;
      const d = W.districts[district[c]] || W.districts[0];
      if (height[c] < 6 && d.signDensity < 0.3 && rnd() < 0.5) continue;
      const faces = [];
      if (roadIn(x, z, 1, 0)) faces.push([1, 0]);
      if (roadIn(x, z, -1, 0)) faces.push([-1, 0]);
      if (roadIn(x, z, 0, 1)) faces.push([0, 1]);
      if (roadIn(x, z, 0, -1)) faces.push([0, -1]);
      if (!faces.length) continue;
      // taller buildings get a sign on more of their faces and more storeys
      const storeys = Math.max(1, Math.min(3, Math.floor(height[c] / 5)));
      for (let s = 0; s < storeys; s++) {
        const f = faces[rint(faces.length)];
        cands.push({ x, z, fx: f[0], fz: f[1], h: height[c], storey: s });
      }
    }
  }
  shuffle(cands);
  const MAX_SIGNS = 420;
  for (let i = 0; i < Math.min(MAX_SIGNS, cands.length); i++) {
    const q = cands[i];
    const y = 2.4 + q.storey * 3.4 + rnd() * 1.6;
    if (y > q.h - 0.8) continue;
    const warm = rnd();
    W.signs.push({
      x: centerOf(q.x) + q.fx * (CELL * 0.5 + 0.75),
      z: centerOf(q.z) + q.fz * (CELL * 0.5 + 0.75),
      fx: q.fx, fz: q.fz,
      y,
      text: pick(SIGN_WORDS),
      r: warm < 0.4 ? 255 : (warm < 0.7 ? 140 : 90),
      g: warm < 0.4 ? 120 : (warm < 0.7 ? 255 : 230),
      b: warm < 0.4 ? 190 : (warm < 0.7 ? 140 : 255),
      phase: rnd() * 100,
      flicker: rnd() < 0.18,
      vertical: rnd() < 0.25
    });
  }
  W.counts.signs = W.signs.length;
}
function isRoadCell(x, z) { return inBounds(x, z) && tile[idx(x, z)] === T.ROAD; }

// ---------- street furniture ----------
function makeProps() {
  for (let z = 1; z < GH - 1; z++) {
    for (let x = 1; x < GW - 1; x++) {
      const c = idx(x, z);
      if (tile[c] !== T.WALK) continue;
      // only along curb edges
      const curb = isRoadCell(x + 1, z) || isRoadCell(x - 1, z) || isRoadCell(x, z + 1) || isRoadCell(x, z - 1);
      if (!curb) continue;
      const r = rnd();
      if (r < 0.030) W.props.push({ x: centerOf(x), z: centerOf(z), y: 0, type: "bin" });
      else if (r < 0.052) W.props.push({ x: centerOf(x), z: centerOf(z), y: 0, type: "bench" });
      else if (r < 0.064) W.props.push({ x: centerOf(x), z: centerOf(z), y: 0, type: "hydrant" });
      else if (r < 0.072) W.props.push({ x: centerOf(x), z: centerOf(z), y: 0, type: "planter" });
      else if (r < 0.080) W.props.push({ x: centerOf(x), z: centerOf(z), y: 0, type: "bollard" });
    }
  }
  for (const l of W.lamps) W.props.push({ x: l.x, z: l.z, y: 0, type: "lamp" });
  W.counts.props = W.props.length;
}

// ---------- points of interest ----------
function makePOIs() {
  const kinds = shuffle([
    "MART", "MART", "BAR", "BAR", "TERMINAL", "TERMINAL", "PAD", "PAD",
    "VIEWPOINT", "VIEWPOINT", "ARCHIVE", "ARCHIVE", "CHAPEL", "PLAZA"
  ]);
  const used = [];
  let ki = 0, guard = 900;
  while (ki < kinds.length && guard-- > 0) {
    const x = 4 + rint(GW - 8), z = 4 + rint(GH - 8);
    if (tile[idx(x, z)] !== T.WALK && tile[idx(x, z)] !== T.PLAZA) continue;
    if (deck[idx(x, z)] > 0) continue;
    let tooClose = false;
    for (const p of used) if (Math.hypot(p.x - centerOf(x), p.z - centerOf(z)) < 26) { tooClose = true; break; }
    if (tooClose) continue;
    used.push(addPOI(kinds[ki++], x, z));
  }
  // monorail stations are POIs too
  for (const s of W.rail.stations) {
    W.pois.push({ id: "st" + s.id, kind: "STATION", name: s.name, x: s.x, z: s.z, station: s.id });
  }
}
function addPOI(kind, gx, gz) {
  const p = {
    id: kind.toLowerCase() + "_" + W.pois.length,
    kind,
    name: poiName(kind),
    x: centerOf(gx), z: centerOf(gz),
    gx, gz
  };
  W.pois.push(p);
  return p;
}
function poiName(kind) {
  switch (kind) {
    case "MART": return pick(MART_NAMES);
    case "BAR": return pick(BAR_NAMES);
    case "TERMINAL": return pick(TERMINAL_NAMES);
    case "PAD": return pick(PAD_NAMES);
    case "VIEWPOINT": return pick(VIEW_NAMES);
    case "ARCHIVE": return pick(ARCHIVE_NAMES);
    case "CHAPEL": return pick(CHAPEL_NAMES);
    case "PLAZA": return pick(PLAZA_NAMES);
    case "PHONE": return "PUBLIC PHONE";
    default: return "LINK " + (100 + rint(800));
  }
}

// ---------- bake streetlight glow into the ground ----------
function bakeLight() {
  lightmap.fill(0.10);
  for (const L of W.lamps) {
    const cx = L.x / CELL, cz = L.z / CELL, R = 7;
    const z0 = Math.max(0, Math.floor(cz - R)), z1 = Math.min(GH, Math.ceil(cz + R));
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(GW, Math.ceil(cx + R));
    for (let z = z0; z < z1; z++)
      for (let x = x0; x < x1; x++) {
        const d = Math.hypot(x - cx, z - cz);
        lightmap[idx(x, z)] += 1.05 / (1 + d * d * 0.20);
      }
  }
  // signs bleed a little colour onto the street below
  for (const s of W.signs) {
    const cx = s.x / CELL, cz = s.z / CELL;
    for (let z = Math.max(0, Math.floor(cz - 2)); z < Math.min(GH, Math.ceil(cz + 2)); z++)
      for (let x = Math.max(0, Math.floor(cx - 2)); x < Math.min(GW, Math.ceil(cx + 2)); x++) {
        const d = Math.hypot(x - cx, z - cz);
        if (d < 2.4) lightmap[idx(x, z)] += 0.30 / (1 + d * d);
      }
  }
  W.counts.statics = W.counts.buildings + W.counts.props + W.counts.signs + W.trees.length;
}

// ---------- spawn: on a sidewalk near the middle, with a phone ----------
function pickSpawn() {
  let best = null;
  for (let t = 0; t < 3000; t++) {
    const x = GW / 2 - 12 + rint(24), z = GH / 2 - 12 + rint(24);
    if (!inBounds(x, z)) continue;
    if (tile[idx(x, z)] !== T.WALK) continue;
    best = { x, z }; break;
  }
  if (!best) best = { x: Math.floor(GW / 2), z: Math.floor(GH / 2) };
  W.spawn.x = centerOf(best.x);
  W.spawn.z = centerOf(best.z);
  // the story phone, right next to spawn
  let phone = null;
  for (let r = 1; r < 7 && !phone; r++) {
    for (let dz = -r; dz <= r && !phone; dz++) {
      for (let dx = -r; dx <= r && !phone; dx++) {
        const x = best.x + dx, z = best.z + dz;
        if (!inBounds(x, z) || tile[idx(x, z)] !== T.WALK) continue;
        phone = addPOI("PHONE", x, z);
      }
    }
  }
  if (!phone) {
    W.pois.push({ id: "phone_0", kind: "PHONE", name: "PUBLIC PHONE", x: W.spawn.x + 3, z: W.spawn.z + 3 });
  }
}

// ---------- queries ----------
W.nearestPOI = function (x, z, kind) {
  let best = null, bd = Infinity;
  for (const p of W.pois) {
    if (kind && p.kind !== kind) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { poi: best, dist: bd } : null;
};
W.nearestStation = function (x, z) {
  let best = null, bd = Infinity;
  for (const s of W.rail.stations) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) { bd = d; best = s; }
  }
  return { station: best, dist: bd };
};
W.markSeen = function (x, z, r) {
  const cx = cellOf(x), cz = cellOf(z);
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const gx = cx + dx, gz = cz + dz;
    if (inBounds(gx, gz)) seen[idx(gx, gz)] = 1;
  }
};
// sector readout: which avenue / street grid line you are nearest
W.sector = function (x, z) {
  const gx = cellOf(x), gz = cellOf(z);
  return { av: Math.floor(gx / PERIOD), st: Math.floor(gz / PERIOD) };
};
W.isRoadBand = isRoadBand;

// Signal model: an 11-second cycle. Intersections are staggered into two
// groups by the parity of (avenue + street), so the city shows two waves of
// light rather than one global blink. Returns which axis may go, and whether
// that green is about to change.
const CYCLE = 11;
W.lightState = function (node, time) {
  const tl = time + (node.ns % 2) * (CYCLE / 2);
  const f = (tl % CYCLE) / CYCLE;
  const nsGreen = f < 0.5;
  const yellow = nsGreen ? (f > 0.44) : (f > 0.94);
  return { nsGreen, yellow, phase: f };
};
W.lightNS = function (node, time) { return W.lightState(node, time).nsGreen; };
W.lightYellow = function (node, time) { return W.lightState(node, time).yellow; };

W.generate = generate;
AC.W = W;
global.AC = AC;
})(window);
