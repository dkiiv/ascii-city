/* ASCII CITY — procedural world: 8192m city, 16 sectors, 256 districts, 4096 blocks */
(function () {
'use strict';
const W = AC.W = {};
const B = 32, NB = 256, CITY = 8192;
W.B = B; W.NB = NB; W.CITY = CITY; W.DIST = 512; W.SECT = 2048;

const T = W.TYPE = {
  SEA: 0, ROAD: 1, MARK: 2, MARKD: 3, SIDEWALK: 4, CROSS: 5, JUNCT: 6, PED: 7, GRASS: 8, WATER: 9,
  PLAZA: 10, PATH: 11, YARD: 12, BUILDING: 13, PAD: 14, RANK: 15, STATION: 16, SAND: 17, TRACKBED: 18
};
const INTERIOR = 255, REG_V = 254, REG_H = 253, REG_C = 252;

/* ------------------------------------------------------------------ names */
W.SECTORS = [
  ['ORCHARD', 'LANTERN', 'ATLAS', 'NORTHGATE'],
  ['FOUNDRY', 'CALDER', 'MERIDIAN', 'BEACON'],
  ['HALCYON', 'SIGNAL', 'VECTOR', 'CROWN'],
  ['CONDUIT', 'RELAY', 'HARBOR', 'CINDER']];
const SECT_TYPES = {
  ORCHARD: ['residential', 'parkland', 'residential', 'oldtown'], LANTERN: ['oldtown', 'commercial', 'oldtown', 'residential'],
  ATLAS: ['central', 'commercial', 'central', 'towers'], NORTHGATE: ['residential', 'towers', 'parkland', 'residential'],
  FOUNDRY: ['industrial', 'industrial', 'oldtown', 'towers'], CALDER: ['commercial', 'central', 'commercial', 'oldtown'],
  MERIDIAN: ['central', 'central', 'commercial', 'towers'], BEACON: ['towers', 'residential', 'commercial', 'parkland'],
  HALCYON: ['residential', 'parkland', 'towers', 'residential'], SIGNAL: ['central', 'commercial', 'central', 'oldtown'],
  VECTOR: ['central', 'commercial', 'towers', 'central'], CROWN: ['commercial', 'oldtown', 'central', 'commercial'],
  CONDUIT: ['industrial', 'industrial', 'towers', 'residential'], RELAY: ['towers', 'commercial', 'residential', 'industrial'],
  HARBOR: ['industrial', 'oldtown', 'residential', 'industrial'], CINDER: ['industrial', 'towers', 'industrial', 'residential']
};
W.DTYPE_COL = { central: 0x33e0ff, commercial: 0xff4ad0, residential: 0x7cff6a, oldtown: 0xffb040, towers: 0x6a8cff, industrial: 0xff7030, parkland: 0x40ff90 };
W.DTYPE_CH = { central: '#', commercial: '%', residential: '+', oldtown: '=', towers: 'H', industrial: 'x', parkland: '"' };
W.DTYPE_NAME = { central: 'CENTRAL', commercial: 'COMMERCIAL', residential: 'RESIDENTIAL', oldtown: 'OLD TOWN', towers: 'TOWER ESTATE', industrial: 'INDUSTRIAL', parkland: 'PARKLAND' };
const PREFIX = ['CHARTER', 'CROWN', 'BELL', 'SWITCH', 'COPPER', 'MERCER', 'GLASS', 'UNION', 'CABLE', 'VELVET', 'EMBER', 'COBALT', 'QUARTZ',
  'CIPHER', 'STATIC', 'NEON', 'IRON', 'SILK', 'AMBER', 'HOLLOW', 'KESTREL', 'MARLOW', 'NIMBUS', 'ONYX', 'PRISM', 'ROOK', 'SABLE', 'TALLOW',
  'UMBER', 'WILLOW', 'ASHFORD', 'BRAMBLE', 'CARBON', 'DELTA', 'ECHO', 'FATHOM', 'GANTRY', 'HALO', 'INDIGO', 'JUNO', 'KILN', 'LUMEN',
  'MOSAIC', 'NORTHWIND', 'OPAL', 'PYLON', 'QUILL', 'RIVET', 'SOLDER', 'TANGENT', 'ULTRA', 'VANTA', 'WIRE', 'YARROW', 'ZENITH', 'ARGON',
  'BEACON', 'CINDER', 'DYNAMO', 'ELM', 'FLUX', 'GRID', 'HELIX', 'IVORY', 'JASPER', 'KRYPTON', 'LATTICE', 'MAGNET', 'NOVA', 'ORBIT',
  'PHOTON', 'RADIUS', 'SCALAR', 'TORQUE', 'VOLT', 'WAVE', 'XENON', 'BISMUTH', 'CHROME', 'DIODE', 'FERRO', 'GLYPH', 'HERTZ', 'MERIDIAN'];
const SUFFIX = {
  central: ['WARD', 'CENTRE', 'EXCHANGE', 'SQUARE', 'CIRCUS', 'PLAZA'], commercial: ['MARKET', 'CENTRE', 'ARCADE', 'CROSS', 'GATE', 'PARADE'],
  residential: ['GARDENS', 'TERRACE', 'HILL', 'FIELDS', 'GROVE', 'VALE'], oldtown: ['ROW', 'QUARTER', 'CROSS', 'GATE', 'LANES', 'OLD TOWN'],
  towers: ['HEIGHTS', 'ESTATE', 'TOWERS', 'RISE', 'POINT'], industrial: ['YARDS', 'WORKS', 'DOCKS', 'MILLS', 'SIDINGS', 'BASIN'],
  parkland: ['PARK', 'COMMON', 'MEADOW', 'GREEN', 'WOODS']
};
const STREET_A = ['MERCER', 'CROWN', 'UNION', 'CABLE', 'CRESCENT', 'SIGNAL', 'COPPER', 'NEON', 'HARBOR', 'GLASS', 'IRON', 'SILK', 'CIRCUIT',
  'VECTOR', 'CIPHER', 'STATIC', 'PIXEL', 'BELL', 'SWITCH', 'CARBON', 'QUARTZ', 'VELVET', 'AMBER', 'COBALT', 'EMBER', 'HOLLOW', 'JUNIPER',
  'KESTREL', 'LARCH', 'MARLOW', 'NIMBUS', 'ONYX', 'PRISM', 'QUILL', 'ROOK', 'SABLE', 'TALLOW', 'UMBER', 'VALE', 'WILLOW', 'YARROW',
  'ZEPHYR', 'ALDER', 'BRUNEL', 'CANAL', 'DRAPER', 'FOUNDRY', 'GARNET', 'HOLBORN', 'INKWELL', 'LOOM', 'MINT', 'ORCHID', 'PELHAM',
  'QUAY', 'RAVEN', 'SPINDLE', 'TELEGRAPH', 'VAUXHALL', 'WHARF', 'ASTER', 'BAKER', 'CANNON', 'DOVE', 'FLEET', 'GRANGE', 'HATTER', 'KING'];
const SUF_P = ['AVENUE', 'BOULEVARD'], SUF_C = ['ROAD', 'DRIVE', 'WAY'], SUF_L = ['STREET', 'LANE', 'WALK', 'ROW', 'PASSAGE', 'PLACE', 'YARD'];

/* ------------------------------------------------------------------ roads */
W.lineBase = i => (i % 8 === 0 ? 2 : (i % 4 === 0 ? 1 : 0)); // 2 primary avenue, 1 collector, 0 pedestrianised
const LW = W.LW = [6, 10, 12];
const lineBase = W.lineBase;

/* ------------------------------------------------------------------ regions (merged blocks) */
const regGrid = new Int16Array(NB * NB).fill(-1);
W.regions = [];
function addRegion(bx0, by0, bx1, by1, kind, data) {
  const id = W.regions.length;
  W.regions.push(Object.assign({ id, bx0, by0, bx1, by1, kind }, data || {}));
  for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) regGrid[x * NB + y] = id;
  return id;
}
const reg = (bx, by) => (bx < 0 || by < 0 || bx >= NB || by >= NB) ? -1 : regGrid[bx * NB + by];
W.regionAt = reg;
const vSup = (i, j) => { const a = reg(i - 1, j); return a >= 0 && a === reg(i, j); };
const hSup = (j, i) => { const a = reg(i, j - 1); return a >= 0 && a === reg(i, j); };
const cSup = (i, j) => { const a = reg(i, j); return a >= 0 && a === reg(i - 1, j) && a === reg(i, j - 1) && a === reg(i - 1, j - 1); };
W.vSup = vSup; W.hSup = hSup; W.cSup = cSup;

/* Central Park: blocks 120..127 x 128..135, bounded by avenues */
W.PARK = { bx0: 120, by0: 128, bx1: 128, by1: 136 };
W.PARK.x0 = 120 * B + LW[2]; W.PARK.y0 = 128 * B + LW[2]; W.PARK.x1 = 128 * B; W.PARK.y1 = 136 * B;
W.PARK.cx = (W.PARK.x0 + W.PARK.x1) / 2; W.PARK.cy = (W.PARK.y0 + W.PARK.y1) / 2;
addRegion(120, 128, 128, 136, 'park', { name: 'CENTRAL PARK' });

/* Landmarks — each unique architecture, on a merged 2x2 block site */
W.LANDMARKS = [
  { code: 'MT', name: 'MERIDIAN TOWER', bx: 137, by: 117, shape: 'meridian', col: 0x9fe8ff, lit: 0xe8ffff, glyph: 'H' },
  { code: 'AS', name: 'ATLAS SPIRE', bx: 153, by: 41, shape: 'atlas', col: 0xffc840, lit: 0xfff0a0, glyph: 'A' },
  { code: 'FS', name: 'FOUNDRY STACK', bx: 37, by: 89, shape: 'foundry', col: 0xd05a2a, lit: 0xffa040, glyph: 'x' },
  { code: 'HA', name: 'HALCYON ARCOLOGY', bx: 25, by: 141, shape: 'halcyon', col: 0x5ae07a, lit: 0xc0ffb0, glyph: '=' },
  { code: 'VN', name: 'VECTOR NEEDLE', bx: 161, by: 153, shape: 'needle', col: 0xc070ff, lit: 0xff90ff, glyph: '|' },
  { code: 'CX', name: 'CROWN EXCHANGE', bx: 217, by: 145, shape: 'crown', col: 0xff4a4a, lit: 0xffd070, glyph: 'M' },
  { code: 'LP', name: 'LANTERN PAGODA', bx: 101, by: 29, shape: 'pagoda', col: 0xff8a30, lit: 0xffe060, glyph: 'W' },
  { code: 'CT', name: 'CALDER TWINS', bx: 105, by: 97, shape: 'twins', col: 0x5a9aff, lit: 0xd0e8ff, glyph: 'E' }
];
W.LANDMARKS.forEach((lm, k) => {
  lm.idx = k;
  lm.x0 = lm.bx * B + LW[lineBase(lm.bx)]; lm.y0 = lm.by * B + LW[lineBase(lm.by)];
  lm.x1 = (lm.bx + 2) * B; lm.y1 = (lm.by + 2) * B;
  lm.cx = (lm.x0 + lm.x1) / 2; lm.cy = (lm.y0 + lm.y1) / 2;
  lm.x = lm.cx; lm.y = lm.y0 + 1.5; // approach point: north plaza edge
  addRegion(lm.bx, lm.by, lm.bx + 2, lm.by + 2, 'landmark', { lm: k });
});
W.STATUE = { code: 'SK', name: 'SIGNAL KEEPER', x: W.PARK.cx, y: W.PARK.cy, statue: true };
W.POIS = W.LANDMARKS.concat([W.STATUE]);

/* ------------------------------------------------------------------ districts */
W.districts = [];
(function buildDistricts() {
  const used = new Set();
  for (let dy = 0; dy < 16; dy++) for (let dx = 0; dx < 16; dx++) {
    const sx = dx >> 2, sy = dy >> 2, sector = W.SECTORS[sy][sx];
    const rng = AC.RNG(AC.hash(dx, dy, 4242));
    const dc = Math.hypot(dx - 7.5, dy - 7.5);
    let type = SECT_TYPES[sector][Math.floor(rng() * 4)];
    if (dc < 2.3 && type !== 'industrial') type = rng() < 0.75 ? 'central' : 'commercial';
    if (dc > 5 && rng() < 0.12) type = 'parkland';
    let name;
    for (let tries = 0; tries < 50; tries++) {
      name = rng.pick(PREFIX) + ' ' + rng.pick(SUFFIX[type]);
      if (!used.has(name)) break;
    }
    used.add(name);
    W.districts.push({ dx, dy, sx, sy, sector, type, name, idx: dy * 16 + dx });
  }
  const home = W.districts[8 * 16 + 7]; // contains Central Park
  used.delete(home.name); home.name = 'CHARTER WARD'; home.type = 'central';
})();
W.district = (x, y) => W.districts[AC.clamp(Math.floor(y / 512), 0, 15) * 16 + AC.clamp(Math.floor(x / 512), 0, 15)];
W.districtAtBlock = (bx, by) => W.districts[AC.clamp(by >> 4, 0, 15) * 16 + AC.clamp(bx >> 4, 0, 15)];
W.sectorName = (x, y) => W.SECTORS[AC.clamp(Math.floor(y / 2048), 0, 3)][AC.clamp(Math.floor(x / 2048), 0, 3)];
W.gridRef = (x, y) => 'ABCDEFGH'[AC.clamp(Math.floor(x / 1024), 0, 7)] + (AC.clamp(Math.floor(y / 1024), 0, 7) + 1);
W.cityPos = function (x, y) {
  const nx = (x - CITY / 2) / (CITY / 2), ny = (y - CITY / 2) / (CITY / 2);
  const r = Math.max(Math.abs(nx), Math.abs(ny));
  if (r < 0.3) return 'CENTRAL';
  const d = AC.dirW(AC.bearing(nx, ny));
  return r < 0.62 ? 'CENTRAL-' + d : 'OUTER ' + d;
};

/* ------------------------------------------------------------------ street names */
W.lineName = function (vertical, line, seg) {
  const cls = lineBase(line);
  if (vertical && line === 120) return 'CHARTER AVENUE';
  if (!vertical && line === 136) return 'SIGNAL BOULEVARD';
  if (cls > 0) {
    const h = AC.hash(line, vertical ? 1 : 2, 991);
    return STREET_A[h % STREET_A.length] + ' ' + (cls === 2 ? SUF_P : SUF_C)[(h >>> 8) % (cls === 2 ? 2 : 3)];
  }
  const h = AC.hash(line, (vertical ? 1 : 2) * 100 + (seg >> 4), 313);
  return STREET_A[h % STREET_A.length] + ' ' + SUF_L[(h >>> 9) % SUF_L.length];
};
W.streetInfo = function (x, y, heading) {
  const bi = Math.floor(x / B), bj = Math.floor(y / B);
  const ox = x - bi * B, oy = y - bj * B;
  const inPark = reg(bi, bj) >= 0 && W.regions[reg(bi, bj)].kind === 'park';
  const vCands = [bi, bi + 1].filter(i => !vSup(i, bj)), hCands = [bj, bj + 1].filter(j => !hSup(j, bi));
  const vd = i => Math.abs(x - (i * B + LW[lineBase(i)] / 2)), hd = j => Math.abs(y - (j * B + LW[lineBase(j)] / 2));
  vCands.sort((a, b) => vd(a) - vd(b)); hCands.sort((a, b) => hd(a) - hd(b));
  const v = vCands.length ? vCands[0] : bi, h = hCands.length ? hCands[0] : bj;
  const vName = W.lineName(true, v, bj), hName = W.lineName(false, h, bi);
  const inV = ox < LW[lineBase(bi)] && !vSup(bi, bj), inH = oy < LW[lineBase(bj)] && !hSup(bj, bi);
  let alongV;
  if (inV && !inH) alongV = true;
  else if (inH && !inV) alongV = false;
  else if (inV && inH) alongV = heading !== undefined ? Math.abs(Math.cos(heading)) > 0.7 : true;
  else alongV = vd(v) < hd(h);
  if (inPark && !inV && !inH) return { street: 'CENTRAL PARK', cross: alongV ? hName : vName };
  return alongV ? { street: vName, cross: hName } : { street: hName, cross: vName };
};

/* ------------------------------------------------------------------ cell classification */
function segType(cls, off, w, along, startCls, startW, nextCls) {
  if (cls === 0) return T.PED;
  if (off < 2 || off >= w - 2) return T.SIDEWALK;
  if (cls === 2 && (off === 5 || off === 6)) return T.MARK;
  if (cls === 1 && (off === 4 || off === 5)) return T.MARKD;
  return T.ROAD;
}
function cornerType(cv, ch, ox, oy, wv, wh) {
  if (cv > 0 && ch > 0) {
    // signalised junction: sidewalk corners, zebras along the sidewalk lines, junction box in the middle
    const swV = ox < 2 || ox >= wv - 2, swH = oy < 2 || oy >= wh - 2;
    return (swV && swH) ? T.SIDEWALK : (swV || swH) ? T.CROSS : T.JUNCT;
  }
  if (cv > 0) return (ox < 2 || ox >= wv - 2) ? T.SIDEWALK : T.CROSS;
  if (ch > 0) return (oy < 2 || oy >= wh - 2) ? T.SIDEWALK : T.CROSS;
  return T.PED;
}
function cellInfo(x, y) {
  if (x < 0 || y < 0 || x >= CITY || y >= CITY) return T.SEA;
  const i = x >> 5, ox = x & 31, j = y >> 5, oy = y & 31;
  const cv = lineBase(i), ch = lineBase(j), wv = LW[cv], wh = LW[ch];
  const inV = ox < wv, inH = oy < wh;
  if (!inV && !inH) return INTERIOR;
  if (inV && inH) {
    if (cSup(i, j)) return REG_C;
    const vs = vSup(i, j) && vSup(i, j - 1), hs = hSup(j, i) && hSup(j, i - 1);
    if (vs && !hs) return ch > 0 ? segType(ch, oy, wh, ox, 0, 0, 0) : T.PED;
    if (hs && !vs) return cv > 0 ? segType(cv, ox, wv, oy, 0, 0, 0) : T.PED;
    return cornerType(cv, ch, ox, oy, wv, wh);
  }
  if (inV) {
    if (vSup(i, j)) return REG_V;
    return segType(cv, ox, wv, oy, hSup(j, i) && hSup(j, i - 1) ? 0 : ch, wh, lineBase(j + 1));
  }
  if (hSup(j, i)) return REG_H;
  return segType(ch, oy, wh, ox, vSup(i, j) && vSup(i, j - 1) ? 0 : cv, wv, lineBase(i + 1));
}
W.cellInfo = cellInfo;
W.isCarType = t => t === T.ROAD || t === T.MARK || t === T.MARKD || t === T.CROSS || t === T.JUNCT;

/* ------------------------------------------------------------------ palettes */
const PAL = {
  central: [0x00c8d2, 0x2e7de0, 0xd8e4f0, 0x18b0a0, 0x6a9cff, 0xa8d0ff, 0x00e0ff],
  commercial: [0xe04ab0, 0xff8a2a, 0xffd23a, 0x2ec8e0, 0xa060ff, 0xff4a6a, 0xc8f040],
  residential: [0xc8b890, 0x8ac070, 0xe0a070, 0xa0b0c0, 0xd09080, 0xb0c870, 0xe8d0a0],
  oldtown: [0xc8783a, 0xa8583a, 0xd8a050, 0xb09070, 0xc06850, 0xe0c080, 0x98a050],
  towers: [0x8090a0, 0x40a0a8, 0x6070c0, 0xa0a8b0, 0x50b090, 0x7a8aa0, 0x5aa0d0],
  industrial: [0xd06a28, 0x907060, 0xa0a060, 0xc05030, 0x707880, 0xb08040, 0x8a6a4a],
  parkland: [0x90c070, 0xc0b890, 0x80a0c0, 0xa0c0a0]
};
const LIT = [0xffe08a, 0xffd060, 0xa0f0ff, 0xff90d0, 0xf8f8ff, 0xffb070, 0xb0ff90, 0x80c0ff];
const WGLYPH = [[':', '#'], ['.', 'H'], ['|', '='], ['-', 'E'], ["'", 'O'], [':', '▓'], ['.', '#'], ['¦', 'M']];
W.WGLYPH = WGLYPH;
const USES = {
  central: ['office', 'cafe', 'shop', 'office', 'bar', 'clinic'],
  commercial: ['shop', 'cafe', 'arcade', 'clinic', 'launderette', 'bar', 'noodle', 'shop'],
  residential: ['apartment', 'apartment', 'shop', 'launderette', 'cafe'],
  oldtown: ['shop', 'cafe', 'bar', 'launderette', 'noodle', 'apartment'],
  towers: ['apartment', 'apartment', 'launderette', 'shop'],
  industrial: ['warehouse', 'workshop', 'warehouse', 'office'],
  parkland: ['apartment', 'cafe']
};

/* ------------------------------------------------------------------ buildings */
function mkB(L, x0, y0, x1, y1, h, rng, o) {
  o = o || {};
  const pal = PAL[L.dtype] || PAL.central;
  const b = {
    x0, y0, x1, y1, h, id: AC.hash(x0, y0, 911) >>> 0,
    roof: o.roof || 'flat', rh: o.rh || 0, ant: o.ant || 0,
    col: o.col !== undefined ? o.col : pal[Math.floor(rng() * pal.length)],
    lit: o.lit !== undefined ? o.lit : LIT[Math.floor(rng() * LIT.length)],
    style: o.style !== undefined ? o.style : Math.floor(rng() * WGLYPH.length),
    win: o.win || (2 + Math.floor(rng() * 3) * 0.5),
    storey: o.storey || (L.dtype === 'industrial' ? 5 : 3.2),
    litRatio: o.litRatio !== undefined ? o.litRatio : 0.18 + rng() * 0.3,
    use: o.use || rng.pick(USES[L.dtype] || USES.central),
    kind: o.kind || 'building', lm: o.lm !== undefined ? o.lm : -1, shape: o.shape || null,
    noWin: !!o.noWin, enter: o.enter !== undefined ? o.enter : true
  };
  b.floors = Math.max(1, Math.floor(b.h / b.storey));
  L.buildings.push(b);
  return b;
}
W.bHeight = function (b, px, py) {
  if (b.shape) return b.shape(px, py);
  if (px < b.x0 || px >= b.x1 || py < b.y0 || py >= b.y1) return 0;
  let h = b.h;
  switch (b.roof) {
    case 'tiers': {
      const e = Math.min(px - b.x0, b.x1 - px, py - b.y0, b.y1 - py);
      if (e < 2) h = b.h * 0.62; else if (e < 4) h = b.h * 0.84;
      break;
    }
    case 'pitchX': { const t = Math.abs((py - (b.y0 + b.y1) / 2) / ((b.y1 - b.y0) / 2)); h = b.h + (1 - t) * b.rh; break; }
    case 'pitchY': { const t = Math.abs((px - (b.x0 + b.x1) / 2) / ((b.x1 - b.x0) / 2)); h = b.h + (1 - t) * b.rh; break; }
    case 'saw': h = b.h + AC.fract((px - b.x0) / 5) * 2.4; break;
    case 'round': {
      const dx = px - (b.x0 + b.x1) / 2, dy = py - (b.y0 + b.y1) / 2, r = (b.x1 - b.x0) / 2;
      if (dx * dx + dy * dy > r * r) return 0;
      h = b.h + (1 - (dx * dx + dy * dy) / (r * r)) * 1.5;
      break;
    }
  }
  if (b.ant) {
    const cx = Math.floor((b.x0 + b.x1) / 2), cy = Math.floor((b.y0 + b.y1) / 2);
    if (Math.floor(px) === cx && Math.floor(py) === cy) h = b.h + b.ant;
  }
  return h;
};

/* Landmark shapes (world-space height functions) */
const SHAPES = {
  meridian(lm) {
    return (px, py) => {
      const ax = Math.abs(px - lm.cx), ay = Math.abs(py - lm.cy), m = Math.max(ax, ay);
      if (m < 1) return 372;
      if (m < 5) return 318;
      if (m < 9) return 290 - (ax + ay > 12 ? 20 : 0);
      if (m < 13) return (ax < 3 || ay < 3) ? 250 : 236;
      if (m < 24) return (ax < 18 && ay < 18) ? 34 : 18;
      return 0;
    };
  },
  atlas(lm) {
    return (px, py) => {
      const ax = Math.abs(px - lm.cx), ay = Math.abs(py - lm.cy), d = ax + ay;
      if (d < 22) return Math.max(6, 400 * Math.pow(1 - d / 22, 1.7));
      if (Math.max(ax, ay) < 25 && d < 34) return 14;
      return 0;
    };
  },
  foundry(lm) {
    return (px, py) => {
      const lx = px - lm.cx, ly = py - lm.cy;
      for (let k = 0; k < 4; k++) {
        const sx = -18 + k * 12, sy = -12, dx = lx - sx, dy = ly - sy;
        if (dx * dx + dy * dy < 7.5) return 96 + k * 9;
      }
      if (Math.abs(lx) < 24 && ly > -8 && ly < 20) return 24 + AC.fract((lx + 24) / 6) * 5;
      const tx = lx - 18, ty = ly + 20;
      if (tx * tx + ty * ty < 30) return 16;
      return 0;
    };
  },
  halcyon(lm) {
    return (px, py) => {
      const m = Math.max(Math.abs(px - lm.cx), Math.abs(py - lm.cy));
      if (m >= 27) return 0;
      const step = Math.floor((27 - m) / 3);
      return 12 + step * 15;
    };
  },
  needle(lm) {
    return (px, py) => {
      const dx = px - lm.cx, dy = py - lm.cy, r2 = dx * dx + dy * dy;
      if (r2 < 1.2) return 352;
      if (r2 < 9) return 300;
      if (r2 < 196 && r2 > 90) return 14;
      if (r2 < 30 && r2 >= 9) return 22;
      return 0;
    };
  },
  crown(lm) {
    return (px, py) => {
      const lx = px - lm.cx, ly = py - lm.cy, ax = Math.abs(lx), ay = Math.abs(ly);
      if (ax >= 24 || ay >= 18) return 0;
      const edge = Math.min(24 - ax, 18 - ay);
      if (edge < 2.5) return (Math.floor((lx + ly + 60) / 3) % 2 === 0) ? 132 : 104;
      const r = Math.hypot(lx / 14, ly / 10);
      if (r < 1) return 104 + (1 - r * r) * 26;
      return 100;
    };
  },
  pagoda(lm) {
    return (px, py) => {
      const m = Math.max(Math.abs(px - lm.cx), Math.abs(py - lm.cy));
      if (m < 0.8) return 150;
      const sizes = [25, 21, 17.5, 14, 11, 8, 5.5];
      let h = 0;
      for (let k = 0; k < sizes.length; k++) if (m < sizes[k]) h = 16 * (k + 1) + (m > sizes[k] - 1.2 ? 2.5 : 0);
      return h;
    };
  },
  twins(lm) {
    return (px, py) => {
      const lx = px - lm.cx, ly = py - lm.cy;
      for (const s of [-14, 14]) {
        const ax = Math.abs(lx - s), ay = Math.abs(ly);
        if (ax < 8 && ay < 8) return (ax < 3 && ay < 3) ? 246 : (ax < 6 && ay < 6 ? 224 : 212);
      }
      if (Math.abs(ly) < 22 && Math.abs(lx) < 26) return 8;
      return 0;
    };
  }
};

/* ------------------------------------------------------------------ features: ranks, pads, relays */
W.ranks = []; W.pads = []; W.relays = [];
const blockRes = new Map(); // block key -> reservations
function addRes(bx, by, r) { const k = bx * NB + by; if (!blockRes.has(k)) blockRes.set(k, []); blockRes.get(k).push(r); }
W.addRes = addRes;
(function buildFeatures() {
  for (const d of W.districts) {
    // ground taxi rank: collector line (dx*16+4), block row dy*16+6, bay on the block's west edge
    const i = d.dx * 16 + 4, j = d.dy * 16 + 6;
    const x = i * B + LW[1], y = j * B;
    const rank = {
      d, name: d.name + ' RANK', x: x + 2, y: y + 16, bx: i, by: j, line: i,
      cabs: [{ x: x + 2, y: y + 10, yaw: 0 }, { x: x + 2, y: y + 19, yaw: 0 }]
    };
    W.ranks.push(rank); d.rank = rank;
    addRes(i, j, { x0: x, y0: y + 4, x1: x + 4, y1: y + 26, type: T.RANK });
    // sky taxi pad: block (dx*16+11, dy*16+11)
    const pbx = d.dx * 16 + 11, pby = d.dy * 16 + 11;
    const pcx = pbx * B + 6 + 13, pcy = pby * B + 6 + 13;
    const pad = { d, name: d.name + ' SKYPORT', x: pcx, y: pcy, bx: pbx, by: pby };
    W.pads.push(pad); d.pad = pad;
    addRes(pbx, pby, { x0: pcx - 7, y0: pcy - 7, x1: pcx + 7, y1: pcy + 7, type: T.PAD });
    // registered phone relay: south sidewalk of horizontal collector j=dy*16+12
    const rj = d.dy * 16 + 12, ri = d.dx * 16 + 10;
    const relay = { d, name: d.name, x: ri * B + 16.5, y: rj * B + LW[1] - 1.1, idx: d.idx };
    W.relays.push(relay); d.relay = relay;
  }
})();
W.blockRes = (bx, by) => blockRes.get(bx * NB + by) || null;

/* ------------------------------------------------------------------ block layout */
const layoutCache = new Map();
W.layout = function (bx, by) {
  const k = bx * 4096 + by;
  let L = layoutCache.get(k);
  if (L) return L;
  L = genLayout(bx, by);
  layoutCache.set(k, L);
  if (layoutCache.size > 14000) {
    let n = 0;
    for (const key of layoutCache.keys()) { layoutCache.delete(key); if (++n > 3000) break; }
  }
  return L;
};

function genLayout(bx, by) {
  const x0 = bx * B, y0 = by * B;
  const L = { bx, by, x0, y0, buildings: [], areas: [], trees: [], props: [], kind: 'build', base: T.YARD };
  if (bx < 0 || by < 0 || bx >= NB || by >= NB) { L.kind = 'sea'; L.base = T.SEA; L.dtype = 'central'; return L; }
  const d = W.districtAtBlock(bx, by);
  L.dtype = d.type; L.district = d;
  L.ix0 = x0 + (vSup(bx, by) ? 0 : LW[lineBase(bx)]);
  L.iy0 = y0 + (hSup(by, bx) ? 0 : LW[lineBase(by)]);
  L.ix1 = x0 + B; L.iy1 = y0 + B;
  const rng = AC.RNG(AC.hash(bx, by, 77));
  const r = reg(bx, by);
  if (r >= 0 && W.regions[r].kind === 'park') genCentralPark(L, rng);
  else if (r >= 0 && W.regions[r].kind === 'landmark') genLandmark(L, W.LANDMARKS[W.regions[r].lm], rng);
  else {
    const parkChance = d.type === 'parkland' ? 0.6 : d.type === 'residential' ? 0.1 : d.type === 'central' ? 0.05 : 0.06;
    if (rng() < parkChance) genPark(L, rng, ['formal', 'grove', 'plaza', 'pond'][Math.floor(rng() * 4)]);
    else genBuildings(L, rng);
  }
  const res = W.blockRes(bx, by);
  if (res) for (const rr of res) {
    L.buildings = L.buildings.filter(b => b.x1 <= rr.x0 - 1 || b.x0 >= rr.x1 + 1 || b.y1 <= rr.y0 - 1 || b.y0 >= rr.y1 + 1);
    L.trees = L.trees.filter(t => t.x < rr.x0 - 1 || t.x > rr.x1 + 1 || t.y < rr.y0 - 1 || t.y > rr.y1 + 1);
    L.props = L.props.filter(t => t.x < rr.x0 - 1 || t.x > rr.x1 + 1 || t.y < rr.y0 - 1 || t.y > rr.y1 + 1);
    L.areas.push(rr);
  }
  genStreetProps(L, rng);
  return L;
}

function addTree(L, x, y, rng, kind) {
  L.trees.push({ x, y, k: kind !== undefined ? kind : Math.floor(rng() * 4), s: 0.8 + rng() * 0.6, c: rng() < 0.5 ? 0x3aa040 : (rng() < 0.5 ? 0x5ac050 : 0x2a8060), id: AC.hash(x * 10 | 0, y * 10 | 0, 5) });
}

function genBuildings(L, rng) {
  const { ix0, iy0, ix1, iy1, dtype } = L;
  const w = ix1 - ix0, h = iy1 - iy0;
  switch (dtype) {
    case 'central': {
      L.base = T.PLAZA;
      if (rng() < 0.45) {
        const hh = 70 + rng() * 130 + (rng() < 0.12 ? 90 : 0);
        mkB(L, ix0 + 1, iy0 + 1, ix1 - 1, iy1 - 1, hh, rng, { roof: rng() < 0.55 ? 'tiers' : 'flat', ant: rng() < 0.3 ? 15 + rng() * 30 : 0, storey: 3.6 });
      } else {
        const alongX = w >= h, s = Math.floor((alongX ? w : h) * (0.4 + rng() * 0.2));
        const parts = alongX ? [[ix0 + 1, iy0 + 1, ix0 + s - 1, iy1 - 1], [ix0 + s + 1, iy0 + 1, ix1 - 1, iy1 - 1]]
          : [[ix0 + 1, iy0 + 1, ix1 - 1, iy0 + s - 1], [ix0 + 1, iy0 + s + 1, ix1 - 1, iy1 - 1]];
        for (const p of parts) mkB(L, p[0], p[1], p[2], p[3], 45 + rng() * 110, rng, { roof: rng() < 0.4 ? 'tiers' : 'flat', ant: rng() < 0.2 ? 12 + rng() * 20 : 0, storey: 3.6 });
      }
      break;
    }
    case 'commercial': {
      L.base = T.PLAZA;
      const sx = ix0 + Math.floor(w * (0.38 + rng() * 0.24)), sy = iy0 + Math.floor(h * (0.38 + rng() * 0.24));
      const lots = [[ix0, iy0, sx, sy], [sx, iy0, ix1, sy], [ix0, sy, sx, iy1], [sx, sy, ix1, iy1]];
      const plazaLot = rng() < 0.22 ? Math.floor(rng() * 4) : -1;
      lots.forEach((p, k) => {
        if (k === plazaLot) {
          for (let n = 0; n < 3; n++) L.props.push({ t: 'cafe', x: p[0] + 2 + rng() * (p[2] - p[0] - 4), y: p[1] + 2 + rng() * (p[3] - p[1] - 4), r: 0 });
          addTree(L, (p[0] + p[2]) / 2, (p[1] + p[3]) / 2, rng, 0);
          return;
        }
        if (p[2] - p[0] < 5 || p[3] - p[1] < 5) return;
        mkB(L, p[0], p[1], p[2], p[3], 14 + rng() * 46, rng, { roof: rng() < 0.2 ? 'tiers' : 'flat', storey: 3.4 });
      });
      break;
    }
    case 'residential': {
      L.base = T.GRASS;
      const n = 2 + Math.floor(rng() * 2);
      const cw = w / n, chh = h / n;
      for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) {
        if (n === 3 && a === 1 && c === 1) { addTree(L, ix0 + cw * 1.5, iy0 + chh * 1.5, rng); continue; }
        const bx0 = Math.round(ix0 + a * cw + 1), by0 = Math.round(iy0 + c * chh + 1);
        const bx1 = Math.round(ix0 + (a + 1) * cw - 1), by1 = Math.round(iy0 + (c + 1) * chh - 1);
        if (rng() < 0.12) { addTree(L, (bx0 + bx1) / 2, (by0 + by1) / 2, rng); continue; }
        const pitched = rng() < 0.5;
        mkB(L, bx0, by0, bx1, by1, 7 + rng() * 17, rng, { roof: pitched ? (rng() < 0.5 ? 'pitchX' : 'pitchY') : 'flat', rh: 2 + rng() * 2, storey: 3 });
      }
      if (rng() < 0.7) addTree(L, ix0 + 1 + rng() * (w - 2), iy1 - 1, rng);
      break;
    }
    case 'oldtown': {
      L.base = T.PLAZA;
      const depth = 8 + Math.floor(rng() * 2);
      let x = ix0; // north row
      while (x < ix1 - 3) { const ww = Math.min(ix1 - x, 4 + Math.floor(rng() * 4)); mkB(L, x, iy0, x + ww, iy0 + depth, 8 + rng() * 11, rng, { roof: 'pitchX', rh: 2 + rng() * 2.5, storey: 3 }); x += ww; }
      x = ix0; // south row
      while (x < ix1 - 3) { const ww = Math.min(ix1 - x, 4 + Math.floor(rng() * 4)); mkB(L, x, iy1 - depth, x + ww, iy1, 8 + rng() * 11, rng, { roof: 'pitchX', rh: 2 + rng() * 2.5, storey: 3 }); x += ww; }
      let y = iy0 + depth; // west row
      while (y < iy1 - depth - 3) { const hh = Math.min(iy1 - depth - y, 4 + Math.floor(rng() * 4)); mkB(L, ix0, y, ix0 + depth, y + hh, 8 + rng() * 10, rng, { roof: 'pitchY', rh: 2 + rng() * 2, storey: 3 }); y += hh; }
      if (rng() < 0.6) addTree(L, ix1 - 5, (iy0 + iy1) / 2, rng, 0);
      break;
    }
    case 'towers': {
      L.base = T.GRASS;
      const vert = rng() < 0.5, thick = 8 + Math.floor(rng() * 3);
      if (vert) { const cx = ix0 + Math.floor((w - thick) / 2); mkB(L, cx, iy0 + 2, cx + thick, iy1 - 2, 42 + rng() * 70, rng, { storey: 3 }); }
      else { const cy = iy0 + Math.floor((h - thick) / 2); mkB(L, ix0 + 2, cy, ix1 - 2, cy + thick, 42 + rng() * 70, rng, { storey: 3 }); }
      for (let n = 0; n < 4; n++) {
        const tx = ix0 + 1.5 + rng() * (w - 3), ty = iy0 + 1.5 + rng() * (h - 3);
        if (!L.buildings.some(b => tx > b.x0 - 1.5 && tx < b.x1 + 1.5 && ty > b.y0 - 1.5 && ty < b.y1 + 1.5)) addTree(L, tx, ty, rng);
      }
      L.areas.push({ x0: ix0 + 1, y0: iy1 - 2, x1: ix1 - 1, y1: iy1 - 1, type: T.PATH });
      break;
    }
    case 'industrial': {
      L.base = T.YARD;
      const shedW = Math.floor(w * (0.6 + rng() * 0.3)), shedH = Math.floor(h * (0.5 + rng() * 0.35));
      mkB(L, ix0 + 1, iy0 + 1, ix0 + 1 + shedW, iy0 + 1 + shedH, 8 + rng() * 6, rng, { roof: 'saw', storey: 5 });
      if (rng() < 0.55) mkB(L, ix1 - 4, iy1 - 4, ix1 - 2, iy1 - 2, 28 + rng() * 26, rng, { col: 0x9a5a3a, noWin: true, enter: false, kind: 'chimney' });
      else if (rng() < 0.6) mkB(L, ix1 - 9, iy1 - 9, ix1 - 1, iy1 - 1, 9 + rng() * 5, rng, { roof: 'round', col: 0x90989a, noWin: true, enter: false, kind: 'tank' });
      break;
    }
    default: genPark(L, rng, 'grove');
  }
}

function genPark(L, rng, style) {
  L.kind = 'park'; L.park = style; L.base = T.GRASS;
  const { ix0, iy0, ix1, iy1 } = L;
  const cx = (ix0 + ix1) / 2, cy = (iy0 + iy1) / 2;
  switch (style) {
    case 'formal':
      L.areas.push({ x0: ix0, y0: cy - 1, x1: ix1, y1: cy + 1, type: T.PATH }, { x0: cx - 1, y0: iy0, x1: cx + 1, y1: iy1, type: T.PATH });
      L.areas.push({ x0: cx - 3, y0: cy - 3, x1: cx + 3, y1: cy + 3, type: T.PLAZA, circle: true });
      L.areas.push({ x0: cx - 1.8, y0: cy - 1.8, x1: cx + 1.8, y1: cy + 1.8, type: T.WATER, circle: true });
      for (const [hx0, hy0, hx1, hy1] of [[ix0 + 2, iy0 + 2, cx - 3, iy0 + 3], [cx + 3, iy0 + 2, ix1 - 2, iy0 + 3], [ix0 + 2, iy1 - 3, cx - 3, iy1 - 2], [cx + 3, iy1 - 3, ix1 - 2, iy1 - 2]])
        mkB(L, Math.round(hx0), Math.round(hy0), Math.round(hx1), Math.round(hy1), 1.1, rng, { col: 0x2f8a3a, noWin: true, enter: false, kind: 'hedge', style: 0 });
      for (const [tx, ty] of [[ix0 + 4, cy - 5], [ix1 - 4, cy - 5], [ix0 + 4, cy + 5], [ix1 - 4, cy + 5]]) addTree(L, tx, ty, rng, 2);
      L.props.push({ t: 'bench', x: cx - 5, y: cy - 1.8, r: 0 }, { t: 'bench', x: cx + 5, y: cy + 1.8, r: 2 });
      break;
    case 'grove':
      L.areas.push({ x0: ix0, y0: cy - 1, x1: ix1, y1: cy + 1, type: T.PATH });
      for (let n = 0; n < 16; n++) { const tx = ix0 + 1 + rng() * (ix1 - ix0 - 2), ty = iy0 + 1 + rng() * (iy1 - iy0 - 2); if (Math.abs(ty - cy) > 2) addTree(L, tx, ty, rng, rng() < 0.6 ? 1 : 0); }
      L.props.push({ t: 'bench', x: cx, y: cy + 1.8, r: 2 });
      break;
    case 'plaza':
      L.base = T.PLAZA;
      for (const [tx, ty] of [[ix0 + 4, iy0 + 4], [ix1 - 4, iy0 + 4], [ix0 + 4, iy1 - 4], [ix1 - 4, iy1 - 4]]) { addTree(L, tx, ty, rng, 0); L.props.push({ t: 'planter', x: tx, y: ty, r: 0 }); }
      for (let n = 0; n < 4; n++) L.props.push({ t: 'cafe', x: cx - 5 + rng() * 10, y: cy - 5 + rng() * 10, r: 0 });
      L.props.push({ t: 'bench', x: cx, y: iy0 + 2, r: 2 }, { t: 'bench', x: cx, y: iy1 - 2, r: 0 });
      break;
    case 'pond': {
      const rx = (ix1 - ix0) / 2 - 5, ry = (iy1 - iy0) / 2 - 5;
      L.areas.push({ x0: cx - rx - 2, y0: cy - ry - 2, x1: cx + rx + 2, y1: cy + ry + 2, type: T.PATH, circle: true });
      L.areas.push({ x0: cx - rx - 0.5, y0: cy - ry - 0.5, x1: cx + rx + 0.5, y1: cy + ry + 0.5, type: T.SAND, circle: true });
      L.areas.push({ x0: cx - rx, y0: cy - ry, x1: cx + rx, y1: cy + ry, type: T.WATER, circle: true });
      for (let n = 0; n < 6; n++) { const a = rng() * AC.TAU; addTree(L, cx + Math.cos(a) * (rx + 4), cy + Math.sin(a) * (ry + 4), rng); }
      break;
    }
  }
}

function genCentralPark(L, rng) {
  L.kind = 'park'; L.park = 'central'; L.base = T.GRASS;
  const P = W.PARK;
  const x0 = L.x0, y0 = L.y0, x1 = L.x0 + B, y1 = L.y0 + B;
  // plaza + plinth around the Signal Keeper
  if (Math.abs(L.x0 + 16 - P.cx) < 40 && Math.abs(L.y0 + 16 - P.cy) < 40) {
    L.areas.push({ x0: P.cx - 13, y0: P.cy - 13, x1: P.cx + 13, y1: P.cy + 13, type: T.PLAZA, circle: true });
    if (P.cx >= x0 && P.cx < x1 && P.cy >= y0 && P.cy < y1)
      mkB(L, Math.floor(P.cx) - 2, Math.floor(P.cy) - 2, Math.floor(P.cx) + 2, Math.floor(P.cy) + 2, 1.6, rng, { col: 0x8a8a9a, noWin: true, enter: false, kind: 'plinth', style: 0 });
  }
  // pond in the south-east
  const pcx = P.x1 - 62, pcy = P.y1 - 60, prx = 34, pry = 24;
  if (x1 > pcx - prx - 4 && x0 < pcx + prx + 4 && y1 > pcy - pry - 4 && y0 < pcy + pry + 4) {
    L.areas.push({ x0: pcx - prx - 3, y0: pcy - pry - 3, x1: pcx + prx + 3, y1: pcy + pry + 3, type: T.PATH, circle: true });
    L.areas.push({ x0: pcx - prx - 1, y0: pcy - pry - 1, x1: pcx + prx + 1, y1: pcy + pry + 1, type: T.SAND, circle: true });
    L.areas.push({ x0: pcx - prx, y0: pcy - pry, x1: pcx + prx, y1: pcy + pry, type: T.WATER, circle: true });
  }
  // formal hedges near the plaza, groves elsewhere
  const n = AC.noise2(L.bx * 0.7, L.by * 0.7, 9);
  const nearPlaza = Math.hypot(L.x0 + 16 - P.cx, L.y0 + 16 - P.cy) < 60;
  const count = nearPlaza ? 3 : n > 0.5 ? 12 : 6;
  for (let k = 0; k < count; k++) {
    const tx = x0 + 3 + rng() * (B - 6), ty = y0 + 3 + rng() * (B - 6);
    if (Math.hypot(tx - P.cx, ty - P.cy) < 15) continue;
    const e = ((tx - pcx) / (prx + 4)) ** 2 + ((ty - pcy) / (pry + 4)) ** 2;
    if (e < 1) continue;
    addTree(L, tx, ty, rng, n > 0.5 ? 1 : Math.floor(rng() * 4));
  }
  if (nearPlaza && rng() < 0.7) L.props.push({ t: 'bench', x: x0 + 16, y: y0 + 3, r: 0 });
  L.props.push({ t: 'lamp', x: x0 + 3.2, y: y0 + 3.2, r: 0 });
}

function genLandmark(L, lm, rng) {
  L.kind = 'landmark'; L.base = T.PLAZA; L.lm = lm.idx;
  // the landmark building record is shared by the four blocks
  if (!lm.b) {
    const fake = { dtype: 'central', buildings: [] };
    lm.b = mkB(fake, lm.x0 + 1, lm.y0 + 1, lm.x1 - 1, lm.y1 - 1, 400, rng, {
      shape: SHAPES[lm.shape](lm), col: lm.col, lit: lm.lit, lm: lm.idx, kind: 'landmark', litRatio: 0.45, style: 0, storey: 4, use: 'lobby'
    });
    lm.b.id = AC.hash(lm.idx, 1, 2024);
    lm.b.glyph = lm.glyph;
  }
  L.buildings.push(lm.b);
  const cx = L.x0 + 16, cy = L.y0 + 16;
  if (Math.abs(cx - lm.cx) > 26 || Math.abs(cy - lm.cy) > 26) addTree(L, cx, cy, rng, 2);
}

/* street furniture along this chunk's sidewalks / pedestrian streets */
function genStreetProps(L, rng) {
  if (L.kind === 'sea') return;
  const { bx, by, x0, y0 } = L;
  const cv = lineBase(bx), ch = lineBase(by), wv = LW[cv], wh = LW[ch];
  const busy = (L.dtype === 'central' || L.dtype === 'commercial') ? 1 : 0.6;
  // vertical strip (x0..x0+wv, y0+wh..y0+32)
  if (!vSup(bx, by)) stripProps(L, rng, true, cv, x0, y0 + wh, wv, B - wh, busy);
  if (!hSup(by, bx)) stripProps(L, rng, false, ch, y0, x0 + wv, wh, B - wv, busy);
  // traffic lights at car x car junction corners
  if (cv > 0 && ch > 0 && !cSup(bx, by)) {
    L.props.push({ t: 'light', x: x0 + wv - 1, y: y0 + wh - 1, axis: 0, face: 2, jx: bx, jy: by });   // northbound approach (from south)
    L.props.push({ t: 'light', x: x0 + 1, y: y0 + 1, axis: 0, face: 0, jx: bx, jy: by });             // southbound approach (from north)
    L.props.push({ t: 'light', x: x0 + 1, y: y0 + wh - 1, axis: 1, face: 3, jx: bx, jy: by });        // eastbound approach (from west)
    L.props.push({ t: 'light', x: x0 + wv - 1, y: y0 + 1, axis: 1, face: 1, jx: bx, jy: by });        // westbound approach (from east)
  }
  // registered relay booth
  const d = L.district;
  if (d && d.relay) {
    const r = d.relay;
    if (r.x >= x0 && r.x < x0 + B && r.y >= y0 && r.y < y0 + B) L.props.push({ t: 'relay', x: r.x, y: r.y, r: 0, relay: r });
  }
}
function stripProps(L, rng, vertical, cls, lineStart, alongStart, w, len, busy) {
  const put = (off, along, o) => {
    o.x = vertical ? lineStart + off : alongStart + along;
    o.y = vertical ? alongStart + along : lineStart + off;
    L.props.push(o);
  };
  if (cls === 0) {
    // pedestrian street: central planters/trees/benches, bollards at ends
    for (let a = 5; a < len - 3; a += 9) {
      const r = rng();
      if (r < 0.45) { L.trees.push({ x: vertical ? lineStart + 3 : alongStart + a, y: vertical ? alongStart + a : lineStart + 3, k: Math.floor(rng() * 3), s: 0.7 + rng() * 0.4, c: 0x3aa848, id: AC.hash(a, lineStart, 3) }); put(3, a, { t: 'planter', r: 0 }); }
      else if (r < 0.7) put(3, a, { t: 'bench', r: vertical ? 1 : 0 });
      else if (r < 0.8 && busy > 0.8) put(3, a, { t: 'cafe', r: 0 });
      else if (r < 0.88) put(3, a, { t: 'lamp', r: 0 });
    }
    if (len > 20) { put(1.5, 1, { t: 'bollard', r: 0 }); put(4.5, 1, { t: 'bollard', r: 0 }); }
    return;
  }
  // car road: two sidewalks
  for (const side of [0, 1]) {
    const kerb = side === 0 ? 1.55 : w - 1.55, inner = side === 0 ? 0.5 : w - 0.5;
    for (let a = 4; a < len - 3; a += 8) {
      put(kerb, a, { t: 'lamp', r: side === 0 ? 1 : 3 });
      const r = rng();
      if (r < 0.1 * busy) { put(inner + (side === 0 ? 0.5 : -0.5), a + 3, { t: 'shelter', r: side === 0 ? 1 : 3 }); a += 4; }
      else if (r < 0.2) put(kerb, a + 3, { t: 'bin', r: 0 });
      else if (r < 0.28) put(kerb, a + 2.5, { t: 'hydrant', r: 0 });
      else if (r < 0.34) put(inner, a + 3, { t: 'phone', r: side === 0 ? 1 : 3 });
      else if (r < 0.42 * busy + 0.1) put(inner, a + 4, { t: 'vend', r: side === 0 ? 1 : 3 });
      else if (r < 0.55) put(kerb - (side === 0 ? 0.6 : -0.6), a + 4, { t: 'bench', r: side === 0 ? 1 : 3 });
      else if (r < 0.62) put(kerb, a + 4, { t: 'bollard', r: 0 });
    }
  }
}

/* ------------------------------------------------------------------ chunk rasterisation */
const chunkCache = new Map();
let frameNo = 0;
W.tick = () => { frameNo++; };
W.chunk = function (bx, by) {
  const k = (bx + 64) * 8192 + (by + 64);
  let c = chunkCache.get(k);
  if (c) { c.used = frameNo; return c; }
  c = rasterChunk(bx, by);
  c.used = frameNo;
  chunkCache.set(k, c);
  if (chunkCache.size > 1600) {
    const arr = [...chunkCache.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let n = 0; n < 400; n++) chunkCache.delete(arr[n][0]);
  }
  return c;
};

function regionFill(r, code, x, y) {
  const R = W.regions[r];
  if (R.kind === 'landmark') return T.PLAZA;
  const i = x >> 5, j = y >> 5, ox = x & 31, oy = y & 31;
  const vc = Math.abs(ox + 0.5 - LW[lineBase(i)] / 2) < 1.6, hc = Math.abs(oy + 0.5 - LW[lineBase(j)] / 2) < 1.6;
  if (code === REG_V) return vc ? T.PATH : T.GRASS;
  if (code === REG_H) return hc ? T.PATH : T.GRASS;
  return (vc || hc) ? T.PATH : T.GRASS;
}

function rasterChunk(bx, by) {
  const L = W.layout(bx, by);
  const N = B * B;
  const c = {
    bx, by, x0: bx * B, y0: by * B, L,
    type: new Uint8Array(N), h: new Float32Array(N), bi: new Int16Array(N).fill(-1), solid: new Uint8Array(N),
    buildings: L.buildings, props: L.props, trees: L.trees
  };
  const x0 = c.x0, y0 = c.y0;
  for (let ly = 0; ly < B; ly++) for (let lx = 0; lx < B; lx++) {
    const x = x0 + lx, y = y0 + ly;
    let t = cellInfo(x, y);
    if (t === INTERIOR) t = L.base;
    else if (t >= REG_C) t = regionFill(reg(x >> 5, y >> 5), t, x, y);
    c.type[ly * B + lx] = t;
  }
  for (const a of L.areas) {
    const ax0 = Math.max(x0, Math.floor(a.x0)), ax1 = Math.min(x0 + B, Math.ceil(a.x1));
    const ay0 = Math.max(y0, Math.floor(a.y0)), ay1 = Math.min(y0 + B, Math.ceil(a.y1));
    const cx = (a.x0 + a.x1) / 2, cy = (a.y0 + a.y1) / 2, rx = (a.x1 - a.x0) / 2, ry = (a.y1 - a.y0) / 2;
    for (let y = ay0; y < ay1; y++) for (let x = ax0; x < ax1; x++) {
      if (a.circle) { const ex = (x + 0.5 - cx) / rx, ey = (y + 0.5 - cy) / ry; if (ex * ex + ey * ey > 1) continue; }
      else if (x + 0.5 < a.x0 || x + 0.5 > a.x1 || y + 0.5 < a.y0 || y + 0.5 > a.y1) continue;
      const idx = (y - y0) * B + (x - x0), cur = c.type[idx];
      if (W.isCarType(cur) || cur === T.SIDEWALK) continue;
      c.type[idx] = a.type;
    }
  }
  L.buildings.forEach((b, k) => {
    const bx0 = Math.max(x0, Math.floor(b.x0)), bx1 = Math.min(x0 + B, Math.ceil(b.x1));
    const by0 = Math.max(y0, Math.floor(b.y0)), by1 = Math.min(y0 + B, Math.ceil(b.y1));
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
      const hh = W.bHeight(b, x + 0.5, y + 0.5);
      if (hh <= 0) continue;
      const idx = (y - y0) * B + (x - x0);
      if (W.isCarType(c.type[idx]) || c.type[idx] === T.SIDEWALK || c.type[idx] === T.PED) continue;
      c.h[idx] = hh; c.bi[idx] = k; c.type[idx] = T.BUILDING; c.solid[idx] = 1;
    }
  });
  for (let n = 0; n < N; n++) if (c.type[n] === T.WATER || c.type[n] === T.SEA) c.solid[n] = 1;
  const solidProps = { phone: 1, relay: 1, shelter: 1, vend: 1, planter: 1, bench: 1 };
  for (const p of L.props) if (solidProps[p.t]) {
    const lx = Math.floor(p.x) - x0, ly = Math.floor(p.y) - y0;
    if (lx >= 0 && ly >= 0 && lx < B && ly < B) c.solid[ly * B + lx] = 1;
  }
  for (const t of L.trees) {
    const lx = Math.floor(t.x) - x0, ly = Math.floor(t.y) - y0;
    if (lx >= 0 && ly >= 0 && lx < B && ly < B && c.type[ly * B + lx] !== T.BUILDING) c.solid[ly * B + lx] = 2;
  }
  // mip levels: 16x16 (2m), 8x8 (4m), 4x4 (8m)
  c.mip = [];
  let srcH = c.h, srcB = c.bi, srcT = c.type, n = B;
  for (let lev = 1; lev <= 3; lev++) {
    const m = n >> 1, mh = new Float32Array(m * m), mb = new Int16Array(m * m), mt = new Uint8Array(m * m);
    for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
      let best = -1, bh = 0, bt = srcT[(y * 2) * n + x * 2];
      for (let q = 0; q < 4; q++) {
        const s = (y * 2 + (q >> 1)) * n + x * 2 + (q & 1);
        if (srcH[s] > bh) { bh = srcH[s]; best = srcB[s]; bt = srcT[s]; }
      }
      mh[y * m + x] = bh; mb[y * m + x] = best; mt[y * m + x] = bt;
    }
    c.mip.push({ h: mh, bi: mb, type: mt, n: m });
    srcH = mh; srcB = mb; srcT = mt; n = m;
  }
  return c;
}

/* coarse 8m data for distant rendering without full rasterisation */
const coarseCache = new Map();
W.coarse = function (bx, by) {
  const k = (bx + 64) * 8192 + (by + 64);
  let c = coarseCache.get(k);
  if (c) return c;
  const full = chunkCache.get(k);
  if (full) { c = { h: full.mip[2].h, bi: full.mip[2].bi, type: full.mip[2].type, buildings: full.buildings }; }
  else {
    const L = W.layout(bx, by);
    const h = new Float32Array(16), bi = new Int16Array(16).fill(-1), type = new Uint8Array(16);
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const x = bx * B + sx * 8, y = by * B + sy * 8;
      let t = cellInfo(x + 4, y + 4);
      if (t === INTERIOR) t = L.base; else if (t >= REG_C) t = regionFill(reg((x + 4) >> 5, (y + 4) >> 5), t, x + 4, y + 4);
      let best = -1, bh = 0;
      L.buildings.forEach((b, q) => {
        if (b.x1 <= x || b.x0 >= x + 8 || b.y1 <= y || b.y0 >= y + 8) return;
        for (let s = 0; s < 9; s++) {
          const px = Math.max(b.x0 + 0.5, Math.min(b.x1 - 0.5, x + 1 + (s % 3) * 3)), py = Math.max(b.y0 + 0.5, Math.min(b.y1 - 0.5, y + 1 + Math.floor(s / 3) * 3));
          const hh = W.bHeight(b, px, py);
          if (hh > bh) { bh = hh; best = q; }
        }
      });
      const idx = sy * 4 + sx;
      h[idx] = bh; bi[idx] = best; type[idx] = bh > 0 ? T.BUILDING : t;
    }
    c = { h, bi, type, buildings: L.buildings };
  }
  coarseCache.set(k, c);
  if (coarseCache.size > 40000) { let n = 0; for (const key of coarseCache.keys()) { coarseCache.delete(key); if (++n > 8000) break; } }
  return c;
};
W.coarseCached = (bx, by) => coarseCache.get((bx + 64) * 8192 + (by + 64));

/* ------------------------------------------------------------------ queries */
W.cellAt = function (x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const c = W.chunk(xi >> 5, yi >> 5);
  const idx = (yi & 31) * B + (xi & 31);
  return { c, idx, type: c.type[idx], h: c.h[idx], bi: c.bi[idx], solid: c.solid[idx], b: c.bi[idx] >= 0 ? c.buildings[c.bi[idx]] : null };
};
W.typeAt = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y); const c = W.chunk(xi >> 5, yi >> 5); return c.type[(yi & 31) * B + (xi & 31)]; };
W.heightAt = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y); const c = W.chunk(xi >> 5, yi >> 5); return c.h[(yi & 31) * B + (xi & 31)]; };
W.solidAt = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y); if (xi < 0 || yi < 0 || xi >= CITY || yi >= CITY) return 1; const c = W.chunk(xi >> 5, yi >> 5); return c.solid[(yi & 31) * B + (xi & 31)]; };
W.buildingAt = (x, y) => { const q = W.cellAt(x, y); return q.b; };
W.maxHeightAround = function (x, y, r) {
  let m = 0;
  for (let by = Math.floor((y - r) / B); by <= Math.floor((y + r) / B); by++)
    for (let bx = Math.floor((x - r) / B); bx <= Math.floor((x + r) / B); bx++) {
      const c = W.coarse(bx, by);
      for (let q = 0; q < 16; q++) if (c.h[q] > m) m = c.h[q];
    }
  return m;
};

function nearestIn(list, x, y, filter) {
  let best = null, bd = 1e18;
  for (const f of list) { if (filter && !filter(f)) continue; const d = (f.x - x) ** 2 + (f.y - y) ** 2; if (d < bd) { bd = d; best = f; } }
  return best ? { f: best, d: Math.sqrt(bd), brg: AC.bearing(best.x - x, best.y - y) } : null;
}
W.nearest = nearestIn;
W.nearestLocal = function (kind, x, y, filter) {
  const dx = AC.clamp(Math.floor(x / 512), 0, 15), dy = AC.clamp(Math.floor(y / 512), 0, 15);
  const list = [];
  for (let j = dy - 1; j <= dy + 1; j++) for (let i = dx - 1; i <= dx + 1; i++) {
    if (i < 0 || j < 0 || i > 15 || j > 15) continue;
    const d = W.districts[j * 16 + i];
    if (d[kind]) list.push(d[kind]);
  }
  return nearestIn(list, x, y, filter);
};
W.nearestPOI = (x, y) => nearestIn(W.POIS, x, y);

/* safe landing / standing spot near a point (road, plaza, park or pad, not solid) */
W.findOpenSpot = function (x, y, maxR, needClear) {
  for (let r = 0; r <= maxR; r += 2) {
    const steps = Math.max(1, Math.floor(r * 1.5));
    for (let s = 0; s < steps; s++) {
      const a = s / steps * AC.TAU, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (px < 2 || py < 2 || px > CITY - 2 || py > CITY - 2) continue;
      const t = W.typeAt(px, py);
      if (W.solidAt(px, py)) continue;
      if (t === T.WATER || t === T.SEA || t === T.BUILDING) continue;
      if (needClear) {
        let ok = true;
        for (let q = 0; q < 8 && ok; q++) { const qa = q / 8 * AC.TAU; if (W.heightAt(px + Math.cos(qa) * needClear, py + Math.sin(qa) * needClear) > 0.5) ok = false; }
        if (!ok) continue;
      }
      return { x: px, y: py };
    }
  }
  return { x, y };
};
})();
