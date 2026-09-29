/* ASCII CITY — interface panel: navigation, four-level city map, local context, music, diagnostics */
(function () {
'use strict';
const W = AC.W, T = AC.T, S = AC.S, G = AC.G, A = AC.A, R = AC.R, TY = W.TYPE;
const U = AC.U = {};
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = (c, s) => '<span style="color:' + AC.css(c) + '">' + esc(s) + '</span>';
const COL = { cyan: 0x40e8ff, green: 0x40ff80, dim: 0x2a9a50, white: 0xd8ffe0, yellow: 0xffd040, red: 0xff4a5a, magenta: 0xff50e0, orange: 0xffa040, blue: 0x70a0ff };
U.COL = COL;
const MAPW = 44, MAPH = 16;
const LEVELS = ['LOCAL', 'DISTRICT', 'SECTOR', 'CITY'];

U.init = function () {
  U.el = { nav: $('ui-nav'), mapTitle: $('ui-map-title'), map: $('ui-map'), legend: $('ui-map-legend'), ctxLabel: $('ui-context-label'), ctxTitle: $('ui-context-title'), ctxCopy: $('ui-context-copy'), choices: $('ui-context-choices'), music: $('ui-music'), diag: $('ui-diag'), prompt: $('prompt'), toast: $('toast'), pre: $('prelude-text'), overlay: $('overlay'), relay: $('relay-transfer'), cctv: $('cctv'), aside: $('interface') };
  U.el.choices.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) G.selectMenu(+b.dataset.k); });
  U.last = 0; U.fps = 60; U.frames = 0; U.fpsT = 0;
};
U.frame = function (dt) {
  U.frames++; U.fpsT += dt;
  if (U.fpsT > 0.5) { U.fps = U.frames / U.fpsT; U.frames = 0; U.fpsT = 0; }
};

/* ------------------------------------------------------------------ navigation block */
function navLine(label, val, c) { return span(COL.dim, '> ') + span(c, AC.dots(label, 12) + ' ') + span(c, val) + '\n'; }
function nav() {
  const p = G.p, cam = G.camera();
  const x = cam.x, y = cam.y;
  const d = W.district(x, y);
  const st = W.streetInfo(x, y, cam.yaw);
  let out = span(COL.green, '01::NAVIGATION') + '\n' + span(COL.dim, '-'.repeat(MAPW)) + '\n';
  out += navLine('DISTRICT', d.name, COL.cyan);
  out += navLine('CITY POS', W.cityPos(x, y), COL.green);
  out += navLine('SECTOR', d.sector + ' / ' + W.gridRef(x, y), COL.green);
  if (G.mode === 'sky') out += navLine('ALTITUDE', Math.round(cam.z) + 'M', COL.white);
  else { out += navLine('STREET', st.street, COL.white); out += navLine('CROSS', st.cross, COL.green); }
  const lm = W.nearestPOI(x, y);
  out += navLine('LANDMARK', lm.f.name + ' / ' + AC.fmtDist(lm.d) + ' ' + AC.dir8(lm.brg), COL.yellow);
  const rl = W.nearestLocal('relay', x, y);
  if (rl) out += navLine('PHONE', AC.fmtDist(rl.d) + ' ' + AC.dir8(rl.brg) + (G.relays.has(rl.f.idx) ? ' // REG' : ''), COL.red);
  const rk = W.nearestLocal('rank', x, y);
  if (rk) out += navLine('TAXI', (rk.f.d === d ? 'HOME' : rk.f.d.name) + ' / ' + AC.fmtDist(rk.d) + ' ' + AC.dir8(rk.brg), COL.yellow);
  if (G.mode === 'sky') out += navLine('SKY TAXI', p.sky.name + ' / ' + AC.fmtDist(p.sky.range), COL.orange);
  else { const pd = W.nearestLocal('pad', x, y); if (pd) out += navLine('SKY TAXI', AC.fmtDist(pd.d) + ' ' + AC.dir8(pd.brg), COL.orange); }
  const ns = T.nearestStation(x, y);
  if (ns) out += navLine('METRO', ns.f.name + ' / ' + AC.fmtDist(ns.d) + ' ' + AC.dir8(ns.brg), COL.magenta);
  if (G.tour) { const t = G.tour.target, dd = Math.hypot(t.x - x, t.y - y); out += navLine('TOUR', t.name + ' / ' + AC.fmtDist(dd) + ' ' + AC.dir8(AC.bearing(t.x - x, t.y - y)), COL.cyan); }
  if (G.guide) { const f = G.guide.f, dd = Math.hypot(f.x - x, f.y - y); out += navLine(G.guide.kind === 'rank' ? 'TO RANK' : 'TO SKYPORT', AC.fmtDist(dd) + ' ' + AC.dir8(AC.bearing(f.x - x, f.y - y)), COL.yellow); }
  const brg = ((cam.yaw * 180 / Math.PI) % 360 + 360) % 360;
  out += navLine('BEARING', AC.lpad(Math.round(brg) % 360, 3, '0') + ' DEG / ' + AC.dirW(brg), COL.green);
  return out;
}

/* ------------------------------------------------------------------ maps */
function blank() { const g = []; for (let r = 0; r < MAPH; r++) { g.push([]); for (let c = 0; c < MAPW; c++) g[r].push([' ', COL.dim]); } return g; }
function setc(g, c, r, ch, col) { if (r >= 0 && r < MAPH && c >= 0 && c < MAPW) g[r][c] = [ch, col]; }
function text(g, c, r, s, col) { for (let k = 0; k < s.length; k++) setc(g, c + k, r, s[k], col); }
function toHTML(g) {
  let out = '';
  for (const row of g) {
    let cur = -1, buf = '';
    for (const [ch, col] of row) {
      if (col !== cur) { if (buf) out += span(cur, buf); buf = ''; cur = col; }
      buf += ch;
    }
    if (buf) out += span(cur, buf);
    out += '\n';
  }
  return out;
}
function arrow(yaw) { const a = ((yaw % AC.TAU) + AC.TAU) % AC.TAU; return '^>v<'[Math.round(a / (Math.PI / 2)) % 4]; }
function groundChar(t, x, y) {
  switch (t) {
    case TY.BUILDING: return null;
    case TY.ROAD: case TY.MARK: case TY.MARKD: {
      const i = Math.floor(x / 32), ox = x - i * 32;
      return ox < W.LW[W.lineBase(i)] ? ['|', 0x8a8a9a] : ['=', 0x8a8a9a];
    }
    case TY.JUNCT: return ['+', 0xb0b0c0];
    case TY.CROSS: return ['+', 0xe0e0e0];
    case TY.SIDEWALK: return ['-', 0x5a6a60];
    case TY.PED: return ['.', 0x9a7a60];
    case TY.GRASS: return [':', 0x3aa050];
    case TY.WATER: return ['~', 0x3a9ae0];
    case TY.SEA: return ['~', 0x2a5a9a];
    case TY.PLAZA: return ['.', 0x7a7a90];
    case TY.PATH: return ['.', 0xa89060];
    case TY.PAD: return ['o', 0xffd040];
    case TY.RANK: return ['/', 0xd0b030];
    case TY.STATION: return ['.', 0xd0c060];
    case TY.SAND: return ['.', 0xc8b080];
    default: return [' ', COL.dim];
  }
}
function overlayFeatures(g, toCell, x0, y0, x1, y1, small) {
  // monorail lines
  for (const L of T.LINES) {
    const a = T.pointOn(L, 0, 0), b = T.pointOn(L, L.len, 0);
    const vert = L.f.x === 0;
    const n = 400;
    for (let k = 0; k <= n; k++) {
      const u = k / n, x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const c = toCell(x, y); setc(g, c.c, c.r, vert ? '║' : '═', L.col);
    }
  }
  for (const st of T.stations) if (st.px > x0 && st.px < x1 && st.py > y0 && st.py < y1) { const c = toCell(st.px, st.py); setc(g, c.c, c.r, 'M', COL.magenta); }
  for (const d of W.districts) {
    for (const [f, ch, col] of [[d.relay, 'R', COL.red], [d.rank, 't', COL.yellow], [d.pad, 'T', COL.orange]]) {
      if (f.x > x0 && f.x < x1 && f.y > y0 && f.y < y1) { const c = toCell(f.x, f.y); setc(g, c.c, c.r, ch, col); }
    }
  }
  for (const lm of W.POIS) {
    const lx = lm.cx || lm.x, ly = lm.cy || lm.y;
    if (lx > x0 && lx < x1 && ly > y0 && ly < y1) { const c = toCell(lx, ly); setc(g, c.c, c.r, '*', COL.yellow); if (!small) text(g, c.c + 1, c.r, lm.code, COL.yellow); }
  }
}
function mapLocal(cx, cy, yaw) {
  const g = blank(), sx = 2, sy = 4;
  const x0 = cx - MAPW / 2 * sx, y0 = cy - MAPH / 2 * sy;
  for (let r = 0; r < MAPH; r++) for (let c = 0; c < MAPW; c++) {
    const x = x0 + (c + 0.5) * sx, y = y0 + (r + 0.5) * sy;
    if (x < 0 || y < 0 || x >= W.CITY || y >= W.CITY) { setc(g, c, r, '~', 0x2a5a9a); continue; }
    const q = W.cellAt(x, y);
    if (q.type === TY.BUILDING && q.b) { const lmk = q.b.lm >= 0; setc(g, c, r, q.b.noWin ? (q.b.kind === 'hedge' ? '%' : 'o') : '#', lmk ? q.b.lit : AC.mulC(q.b.col, 0.9)); }
    else { const gc = groundChar(q.type, x, y); setc(g, c, r, gc[0], gc[1]); }
  }
  const toCell = (x, y) => ({ c: Math.floor((x - x0) / sx), r: Math.floor((y - y0) / sy) });
  overlayFeatures(g, toCell, x0, y0, x0 + MAPW * sx, y0 + MAPH * sy, true);
  text(g, 1, 0, 'NORTH ^', COL.dim);
  setc(g, MAPW / 2, Math.floor(MAPH / 2), arrow(yaw), 0xffffff);
  return { g, legend: '^ YOU  R PHONE  T SKY  t ROAD  * LANDMARK  M METRO\nSTREET DETAIL / ~1 BLOCK' };
}
function mapDistrict(cx, cy, yaw) {
  const d = W.district(cx, cy), g = blank();
  const x0 = d.dx * 512, y0 = d.dy * 512, sx = 512 / MAPW, sy = 512 / (MAPH - 2);
  const dcol = W.DTYPE_COL[d.type];
  for (let r = 1; r < MAPH - 1; r++) for (let c = 0; c < MAPW; c++) {
    const x = x0 + (c + 0.5) * sx, y = y0 + (r - 0.5) * sy;
    const t = W.cellInfo(Math.floor(x), Math.floor(y));
    const i = Math.floor(x / 32), j = Math.floor(y / 32), ox = x - i * 32, oy = y - j * 32;
    const vc = W.lineBase(i), hc = W.lineBase(j);
    let ch = ' ', col = COL.dim;
    const reg = W.regionAt(i, j), park = reg >= 0 && W.regions[reg].kind === 'park';
    const L = W.layout(i, j);
    if (vc > 0 && ox < W.LW[vc] + sx / 2 && !W.vSup(i, j)) { ch = (hc > 0 && oy < W.LW[hc] + sy / 2) ? '+' : '|'; col = vc === 2 ? 0xc0c0d0 : 0x8a8a9a; }
    else if (hc > 0 && oy < W.LW[hc] + sy / 2 && !W.hSup(j, i)) { ch = '='; col = hc === 2 ? 0xc0c0d0 : 0x8a8a9a; }
    else if (park || L.kind === 'park') { ch = ':'; col = 0x3aa050; }
    else if (L.kind === 'landmark') { ch = '#'; col = W.LANDMARKS[L.lm].lit; }
    else if (L.buildings.length && (ox > 6 && oy > 6)) { ch = '#'; col = AC.mulC(dcol, 0.85); }
    else ch = t === TY.PED ? '.' : ' ';
    setc(g, c, r, ch, col);
  }
  const toCell = (x, y) => ({ c: Math.floor((x - x0) / sx), r: Math.floor((y - y0) / sy) + 1 });
  overlayFeatures(g, toCell, x0, y0, x0 + 512, y0 + 512, true);
  const nb = (dx, dy) => (d.dx + dx >= 0 && d.dx + dx < 16 && d.dy + dy >= 0 && d.dy + dy < 16) ? W.districts[(d.dy + dy) * 16 + d.dx + dx].name : 'CITY LIMIT';
  const n = 'N: ' + nb(0, -1), s = 'S: ' + nb(0, 1);
  text(g, Math.floor((MAPW - n.length) / 2), 0, n, COL.green);
  text(g, Math.floor((MAPW - s.length) / 2), MAPH - 1, s, COL.green);
  const w = 'W:' + nb(-1, 0).split(' ')[0], e = 'E:' + nb(1, 0).split(' ')[0];
  text(g, 0, Math.floor(MAPH / 2), w.slice(0, 10), COL.green); text(g, MAPW - Math.min(10, e.length), Math.floor(MAPH / 2) - 1, e.slice(0, 10), COL.green);
  const pc = toCell(cx, cy); setc(g, pc.c, pc.r, arrow(yaw), 0xffffff);
  return { g, legend: d.name + ' // ' + W.DTYPE_NAME[d.type] + '\nDISTRICT // 16 BLOCKS / 512M' };
}
function mapSector(cx, cy) {
  const g = blank();
  const sx0 = Math.floor(cx / 2048), sy0 = Math.floor(cy / 2048);
  const cw = 11, chh = 3;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const d = W.districts[(sy0 * 4 + j) * 16 + sx0 * 4 + i];
    const col = W.DTYPE_COL[d.type], ch = W.DTYPE_CH[d.type];
    const here = W.district(cx, cy) === d;
    for (let r = 0; r < chh; r++) for (let c = 0; c < cw - 1; c++) setc(g, i * cw + c, j * (chh + 1) + r, ch, AC.mulC(col, here ? 1 : 0.55));
    const nm = d.name.length > 9 ? d.name.split(' ')[0].slice(0, 9) : d.name;
    text(g, i * cw + Math.floor((cw - 1 - nm.length) / 2), j * (chh + 1) + 1, nm, here ? 0xffffff : col);
    if (here) { setc(g, i * cw, j * (chh + 1) + 1, '[', 0xffffff); setc(g, i * cw + cw - 2, j * (chh + 1) + 1, ']', 0xffffff); }
  }
  const x0 = sx0 * 2048, y0 = sy0 * 2048;
  const toCell = (x, y) => ({ c: Math.floor((x - x0) / 512 * cw + ((x - x0) % 512) / 512 * 0), r: Math.floor((y - y0) / 512) * (chh + 1) + Math.min(chh - 1, Math.floor(((y - y0) % 512) / 512 * chh)) });
  for (const lm of W.POIS) { const lx = lm.cx || lm.x, ly = lm.cy || lm.y; if (lx > x0 && lx < x0 + 2048 && ly > y0 && ly < y0 + 2048) { const c = { c: Math.floor((lx - x0) / 2048 * 44), r: toCell(lx, ly).r }; setc(g, c.c, c.r, '*', COL.yellow); text(g, c.c + 1, c.r, lm.code, COL.yellow); } }
  const pc = { c: Math.floor((cx - x0) / 2048 * 44), r: toCell(cx, cy).r };
  setc(g, pc.c, pc.r, '@', 0xffffff);
  const sname = W.SECTORS[sy0][sx0];
  return { g, legend: 'SECTOR ' + sname + ' // 16 DISTRICTS\n' + ['central', 'commercial', 'residential', 'oldtown', 'towers', 'industrial', 'parkland'].map(t => W.DTYPE_CH[t] + ' ' + W.DTYPE_NAME[t].split(' ')[0]).join(' ') };
}
function mapCity(cx, cy) {
  const g = blank(), cw = 11, chh = 3;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    for (let r = 0; r < chh; r++) for (let c = 0; c < cw - 1; c++) setc(g, i * cw + c, j * (chh + 1) + r, '.', COL.dim);
  }
  const toCell = (x, y) => ({ c: Math.floor(x / 8192 * 44), r: Math.floor(y / 8192 * 16) });
  for (const L of T.LINES) {
    const a = T.pointOn(L, 0, 0), b = T.pointOn(L, L.len, 0), vert = L.f.x === 0;
    for (let k = 0; k <= 200; k++) { const u = k / 200; const c = toCell(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u); setc(g, c.c, c.r, vert ? '║' : '═', L.col); }
  }
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const nm = '-' + W.SECTORS[j][i] + '-';
    const here = Math.floor(cx / 2048) === i && Math.floor(cy / 2048) === j;
    text(g, i * cw + Math.floor((cw - nm.length) / 2), j * (chh + 1) + 1, nm.slice(0, cw), here ? 0xffffff : COL.orange);
  }
  for (const lm of W.POIS) { const c = toCell(lm.cx || lm.x, lm.cy || lm.y); setc(g, c.c, c.r, '*', COL.yellow); text(g, c.c + 1, c.r, lm.code, COL.yellow); }
  const pc = toCell(cx, cy); setc(g, pc.c, pc.r, '@', 0xffffff);
  return { g, legend: '@ YOU  *CODE LANDMARK  ║═ METRO LINES\nCITY ATLAS / 16 SECTORS / 8.2KM' };
}

/* ------------------------------------------------------------------ context */
function contextBlock() {
  const p = G.p;
  const m = G.menu;
  if (m) return { label: m.label, title: m.title, copy: m.copy, options: m.options };
  if (G.mode === 'prelude') return { label: 'PUBLIC RELAY // STANDBY', title: 'SYS_DETAILS.DAT', copy: 'A small room. A locked door. A telephone.' };
  if (G.mode === 'relay') { const rt = G.relayT; return { label: 'RELAY TRANSFER', title: rt.from.name + ' >> ' + rt.to.name, copy: 'Transmitting through the public network...' }; }
  if (G.mode === 'taxi') {
    const c = p.taxi, rem = S.taxiRemaining(c);
    return { label: 'CAB // ' + (c.destName || ''), title: 'PHASE :: ' + c.phase, copy: 'REMAINING :: ' + AC.fmtDistL(rem) + '  SPEED :: ' + Math.round(c.v * 3.6) + ' km/h\nFREE LOOK FROM REAR SEAT. [Y] PULL OVER. OBEYS SIGNALS.' };
  }
  if (G.mode === 'sky') {
    const s = p.sky;
    return { label: 'AUTOPILOT // ' + s.name, title: 'PHASE :: ' + s.phase, copy: 'ALT :: ' + Math.round(s.z) + 'm  SPEED :: ' + Math.round(Math.max(s.v, Math.abs(s.vz || 0))) + ' u/s  RANGE :: ' + AC.fmtDistL(s.range) + '\nMOUSE :: PANORAMA. [Y] ' + (s.emergency ? 'SET-DOWN IN PROGRESS' : 'EMERGENCY SET-DOWN') };
  }
  if (G.mode === 'cctv') { const c = G.CAMS[G.cctv.k]; return { label: 'ASCII CITY // LIVE', title: 'CAM ' + AC.lpad(G.cctv.k + 1, 2, '0') + ' // ' + c.name, copy: 'A 24/7 window into the plane. Shared clock: traffic lights and trains match every viewer.\n[1-6] CAMERA  [C] CLOSE FEED' }; }
  if (G.mode === 'interior') {
    const IN = p.inside;
    const nearLift = IN.lift && Math.hypot(IN.lift.x - p.x, IN.lift.y - p.y) < 2.4, nearDoor = IN.door && Math.hypot(IN.door.x - p.x, IN.door.y - p.y) < 2.4;
    return { label: 'INTERIOR // ' + (IN.floor === 0 ? 'GROUND' : 'FLOOR ' + IN.floor), title: IN.name, copy: (nearLift ? '[E] CALL LIFT' : nearDoor ? '[E] LEAVE BUILDING' : 'Windows show the live city outside.') + (IN.lift ? '' : '') };
  }
  const sc = G.stationContext();
  if (sc) return sc;
  if (G.tour) { const t = G.tour; return { label: 'AUTO TOUR // A* PEDESTRIAN ROUTE', title: t.target.name, copy: t.pause > 0 ? 'Arrived. Choosing the next landmark...' : t.waiting ? 'Waiting at the crossing...' : 'Following pavements and crossings. [T] or move to take over.' }; }
  if (G.guide) { const f = G.guide.f, d = Math.hypot(f.x - p.x, f.y - p.y); return { label: G.guide.kind === 'rank' ? 'NEAREST RANK' : 'NEAREST SKY TAXI', title: f.name, copy: 'DISTANCE :: ' + AC.fmtDistL(d) + '  BEARING :: ' + Math.round(AC.bearing(f.x - p.x, f.y - p.y)) + ' DEG ' + AC.dir8(AC.bearing(f.x - p.x, f.y - p.y)) }; }
  const rk = W.nearestLocal('rank', p.x, p.y);
  if (rk && rk.d < 14) return { label: 'RANK // ' + (rk.f.d === W.district(p.x, p.y) ? 'HOME DISTRICT RANK' : rk.f.name), title: rk.f.name, copy: 'A taxi bay with ' + rk.f.cabs.filter(c => !c.taken).length + ' cab(s) waiting at the kerb. [E] HAIL' };
  const pd = W.nearestLocal('pad', p.x, p.y);
  if (pd && pd.d < 14) return { label: 'SKYPORT', title: pd.f.name, copy: pd.f.away ? 'The pad is empty. The sky taxi is out on a job.' : 'A sky taxi idles on the pad. [E] BOARD' };
  const rl = W.nearestLocal('relay', p.x, p.y);
  if (rl && rl.d < 5) return { label: 'TELEPHONE RELAY', title: rl.f.name, copy: (G.relays.has(rl.f.idx) ? 'Registered on the persistent network.' : 'Unregistered booth. Discover it to add it to the directory.') + ' [E] USE PHONE' };
  const fb = (function () { const f = { x: Math.sin(p.yaw), y: -Math.cos(p.yaw) }; for (const d of [0.8, 1.5]) { const q = W.cellAt(p.x + f.x * d, p.y + f.y * d); if (q.b && q.h > 0.5) return q.b; } return null; })();
  if (fb && fb.enter) {
    const lm = fb.lm >= 0 ? W.LANDMARKS[fb.lm] : null;
    return { label: lm ? 'LANDMARK' : 'BUILDING // ' + (fb.floors) + ' FLOORS', title: lm ? lm.name : (AC.I.NAMES[AC.I.floorType(fb, 0)] || 'BUILDING'), copy: '[E] ENTER' };
  }
  const d = W.district(p.x, p.y);
  return { label: 'DISTRICT // ' + W.DTYPE_NAME[d.type], title: d.name, copy: d.sector + ' SECTOR. ' + W.cityPos(p.x, p.y) + '. ' + (G.visited.size) + '/256 DISTRICTS VISITED.' };
}

/* ------------------------------------------------------------------ refresh */
U.update = function (now) {
  if (now - U.last < 110) return;
  U.last = now;
  const el = U.el, p = G.p;
  const inGame = G.mode !== 'prelude';
  document.body.classList.toggle('prelude', G.mode === 'prelude');
  if (inGame) {
    el.nav.innerHTML = nav();
    const cam = G.camera();
    const lv = G.mapLevel;
    const m = lv === 0 ? mapLocal(cam.x, cam.y, cam.yaw) : lv === 1 ? mapDistrict(cam.x, cam.y, cam.yaw) : lv === 2 ? mapSector(cam.x, cam.y) : mapCity(cam.x, cam.y);
    el.mapTitle.innerHTML = span(COL.green, '02::CITY_MAP // ' + LEVELS[lv] + ' // M MODE') + '\n' + span(COL.dim, '-'.repeat(MAPW));
    el.map.innerHTML = toHTML(m.g);
    el.legend.textContent = m.legend;
  }
  const c = contextBlock();
  el.ctxLabel.textContent = '> ' + (c.label || '');
  el.ctxTitle.textContent = c.title || '';
  el.ctxCopy.textContent = c.copy || '';
  const opts = c.options || [];
  const key = opts.map(o => o.text).join('|');
  if (el.choices.dataset.key !== key) {
    el.choices.dataset.key = key;
    el.choices.innerHTML = opts.map((o, k) => '<div class="choice' + (o.disabled ? ' off' : '') + '" data-k="' + k + '">[' + ((k + 1) % 10) + '] ' + esc(o.text) + '</div>').join('') + (opts.length ? '<div class="choice off">[ESC] ' + (G.menu && G.menu.back ? 'BACK' : 'CLOSE') + '</div>' : '');
  }
  // music
  const bars = Math.round(A.vol * 10);
  el.music.innerHTML = span(COL.green, '04::MUSIC') + '\n' + span(COL.dim, '-'.repeat(MAPW)) + '\n' +
    span(COL.dim, '> ') + span(COL.green, AC.dots('MUSIC', 16) + (A.on ? 'ON' : 'OFF')) + '\n' +
    span(COL.dim, '> ') + span(COL.green, AC.dots('VOLUME', 16) + '#'.repeat(bars) + '-'.repeat(10 - bars) + '  ' + Math.round(A.vol * 100) + '%') + '\n' +
    span(COL.dim, '> ') + span(COL.dim, A.track) + '\n' + span(COL.dim, '  SHIFT+N TOGGLE  [ ] VOLUME');
  // diagnostics
  el.diag.innerHTML = [
    ['FPS', Math.round(U.fps)], ['MODE', G.mode.toUpperCase()], ['GRID', R.cols + 'x' + R.rows], ['CARS', S.cars.length], ['NPCS', S.peds.length], ['FLYERS', S.flyers.length],
    ['AUTO TOUR', G.tour ? 'ON' : 'OFF'], ['EMPTY CITY', S.empty ? 'ON' : 'OFF'], ['GLYPH BACKING', R.backing ? 'ON' : 'OFF'],
    ['RELAYS', G.relays.size + '/256'], ['COORD', Math.round(p.x) + ',' + Math.round(p.y) + ',' + p.z.toFixed(1)]
  ].map(([k, v]) => span(COL.dim, '> ' + AC.dots(k, 14)) + span(COL.green, String(v))).join('\n');
  // prompt line under the viewport
  el.prompt.textContent = promptText();
  el.toast.textContent = G.toastT > 0 ? G.toast : '';
  el.toast.style.opacity = G.toastT > 0 ? Math.min(1, G.toastT) : 0;
  // prelude text
  if (G.mode === 'prelude' && G.pre) {
    const pr = G.pre;
    el.pre.innerHTML = '<div class="pre-h">SYS_DETAILS.DAT</div><div class="pre-s">PUBLIC RELAY // ' + (pr.stage === 'ringing' ? 'STANDBY' : 'CONNECTED') + '</div>' +
      pr.lines.map(l => '<div class="pre-l">' + esc(l) + '</div>').join('') +
      (pr.stage === 'ringing' ? '<div class="pre-p">ANSWER THE PHONE &nbsp; [ E ]</div>' : '') + '<div class="pre-k">[SPACE] SKIP</div>';
    el.pre.style.display = 'block';
  } else el.pre.style.display = 'none';
  el.relay.style.display = G.mode === 'relay' ? 'flex' : 'none';
  if (G.mode === 'relay') el.relay.querySelector('span').textContent = 'RELAY TRANSFER // ' + G.relayT.from.name + '  >>  ' + G.relayT.to.name;
};
function promptText() {
  const p = G.p;
  switch (G.mode) {
    case 'taxi': return 'DRIVER // ' + (p.taxi.destName || '') + ' // ' + p.taxi.phase + ' // Y TO PULL OVER';
    case 'sky': return 'SKY TAXI // ' + p.sky.name + ' // ' + p.sky.phase + ' // Y FOR SET-DOWN';
    case 'cctv': return 'LIVE // CAM ' + (G.cctv.k + 1) + ' // ' + new Date().toLocaleTimeString();
    case 'intro': return 'CONSTRUCTING VIEW // ' + Math.min(100, Math.round(G.intro.t / 5 * 100)) + '%';
    case 'prelude': case 'relay': return '';
  }
  if (G.menu) return 'SELECT [1-9]  //  ESC CLOSE';
  if (p.train) return 'ON TRAIN // ' + p.train.tr.line.name;
  if (G.tour) return 'AUTO TOUR // ' + G.tour.target.name + ' // T TO STOP';
  return 'WASD MOVE  //  MOUSE LOOK  //  E INTERACT  //  M MAP  //  H HELP';
}
})();
