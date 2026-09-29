/* ASCII CITY — pseudo-volumetric ASCII objects: every model is built from boxes/billboards
   whose visible faces are worked out per frame and projected into the glyph grid */
(function () {
'use strict';
const R = AC.R, W = AC.W, T = AC.T, M = R.M, GL = R.GL, G = AC.g;
const Mo = AC.Mo = {};
const mat = (g, fg, bg) => ({ g: typeof g === 'string' ? G(g) : g, fg, bg: bg !== undefined ? bg : AC.mulC(fg, 0.25) });
Mo.mat = mat;
const HP = Math.PI / 2;

/* ---------------- shared materials ---------------- */
const MAT = {
  metal: mat('|', 0x8a8a98, 0x24242c), dark: mat('#', 0x3a3a44, 0x121216), pole: mat('|', 0x7a7a88, 0x1c1c22),
  wood: mat('=', 0xb07a48, 0x3a2412), red: mat('#', 0xe03030, 0x3a0808), green: mat('#', 0x2a8a4a, 0x0a2412),
  stone: mat(':', 0x9a9aaa, 0x2a2a34), concrete: mat('.', 0x8a8a90, 0x2c2c30), trunk: mat('|', 0x8a5a30, 0x2a1808),
  lampHead: mat('█', 0xfff0b0, 0xa08040), glass: mat('.', 0x6a8aa0, 0x10202a), tyre: mat('@', 0x303034, 0x0a0a0c),
  seat: mat('=', 0x4a4a6a, 0x16161e), floor: mat(':', 0x606070, 0x1e1e26), yellow: mat('=', 0xffd040, 0x3a2c08),
  white: mat('#', 0xe8e8f0, 0x40404a), black: mat(' ', 0, 0x050505)
};
Mo.MAT = MAT;
const foliageMats = [0x3aa040, 0x5ac050, 0x2a8060, 0x4ab070].map(c => ({
  fn: (u, v, t) => {
    const h = AC.h01(Math.floor(u * 7), Math.floor(v * 6), M.face * 13 + (c & 255));
    if (h < 0.1 && t < 60) return false;
    M.g = h < 0.3 ? GL['%'] : h < 0.55 ? GL['&'] : h < 0.8 ? GL['*'] : GL['@'];
    M.fg = h < 0.5 ? c : AC.mulC(c, 1.3); M.bg = AC.mulC(c, 0.22); return true;
  }
}));

/* ---------------- street furniture ---------------- */
function lightPhase(p) { return AC.S ? AC.S.lightState(p.jx, p.jy, p.axis) : 'G'; }
function drawProp(p, dist) {
  const x = p.x, y = p.y, yaw = (p.r || 0) * HP;
  const Fx = Math.sin(yaw), Fy = -Math.cos(yaw);
  switch (p.t) {
    case 'lamp':
      R.box(x, y, 0, 0.18, 0.18, 5.2, 0, MAT.pole);
      R.box(x + Fx * 0.7, y + Fy * 0.7, 5.0, 1.4, 0.14, 0.14, yaw, MAT.pole);
      R.box(x + Fx * 1.3, y + Fy * 1.3, 4.72, 0.55, 0.3, 0.22, yaw, [MAT.pole, MAT.pole, MAT.pole, MAT.pole, MAT.pole, MAT.lampHead], 2);
      break;
    case 'bench':
      R.box(x, y, 0.36, 0.5, 1.7, 0.09, yaw, MAT.wood);
      R.box(x - Fx * 0.22, y - Fy * 0.22, 0.45, 0.08, 1.7, 0.45, yaw, MAT.wood);
      R.box(x, y, 0, 0.4, 0.1, 0.36, yaw, MAT.dark);
      break;
    case 'bin': R.box(x, y, 0, 0.5, 0.5, 0.9, 0, [mat('#', 0x2a6a3a), mat('#', 0x2a6a3a), mat('#', 0x2a6a3a), mat('#', 0x2a6a3a), mat('o', 0x101010)]); break;
    case 'hydrant': R.box(x, y, 0, 0.3, 0.3, 0.62, 0, MAT.red); R.box(x, y, 0.62, 0.2, 0.2, 0.12, 0, mat('o', 0xff6040)); R.box(x, y, 0.35, 0.12, 0.5, 0.1, 0, MAT.red); break;
    case 'bollard': R.box(x, y, 0, 0.22, 0.22, 0.9, 0, [mat('|', 0x9090a0), mat('|', 0x9090a0), mat('|', 0x9090a0), mat('|', 0x9090a0), mat('o', 0xffd040)]); break;
    case 'planter': R.box(x, y, 0, 1.3, 1.3, 0.55, 0, [mat('=', 0x8a6040), mat('=', 0x8a6040), mat('=', 0x8a6040), mat('=', 0x8a6040), mat('"', 0x5ab050)]); break;
    case 'phone': case 'relay': drawBooth(p, x, y, yaw, dist); break;
    case 'shelter': {
      const sm = mat('#', 0x9aa0b0, 0x2a2c34);
      R.box(x, y, 2.45, 1.5, 3.4, 0.15, yaw, sm);
      R.box(x - Fx * 0.68, y - Fy * 0.68, 0, 0.08, 3.3, 2.45, yaw, { fn: (u, v) => { if (v > 0.1 && v < 0.9 && u > 0.05 && u < 0.95) { if (u > 0.3 && u < 0.7 && v > 0.35 && v < 0.85) { M.g = GL['▒']; M.fg = 0xff60c0; M.bg = 0x301028; M.emit = true; return true; } return false; } M.g = GL['#']; M.fg = 0x9aa0b0; M.bg = 0x2a2c34; return true; } });
      R.box(x - Fx * 0.35, y - Fy * 0.35, 0.4, 0.4, 2.2, 0.08, yaw, MAT.metal);
      R.box(x + Fx * 0.2 + Math.cos(yaw) * 1.7, y + Fy * 0.2 + Math.sin(yaw) * 1.7, 0, 0.1, 0.1, 2.9, yaw, MAT.pole);
      R.box(x + Fx * 0.2 + Math.cos(yaw) * 1.7, y + Fy * 0.2 + Math.sin(yaw) * 1.7, 2.6, 0.08, 0.6, 0.5, yaw, R.textMat('BUS', 0xffffff, 0x2040a0));
      break;
    }
    case 'vend': {
      const c = (AC.hash(x * 10 | 0, y * 10 | 0, 1) & 1) ? 0x30c0ff : 0xff4060;
      R.box(x, y, 0, 0.8, 1.0, 1.9, yaw, [{ fn: (u, v) => { M.emit = true; if (v > 0.35 && v < 0.92 && u > 0.08 && u < 0.62) { M.g = (Math.floor(v * 12) & 1) ? GL['o'] : GL['=']; M.fg = (Math.floor(u * 8) & 1) ? 0xffffff : 0xffe040; M.bg = AC.mulC(c, 0.4); } else { M.g = GL['#']; M.fg = c; M.bg = AC.mulC(c, 0.3); } return true; } }, mat('#', AC.mulC(c, 0.7)), mat('#', AC.mulC(c, 0.7)), mat('#', AC.mulC(c, 0.7)), mat('=', 0x404048)]);
      break;
    }
    case 'cafe': {
      R.box(x, y, 0, 0.12, 0.12, 0.72, 0, MAT.metal);
      R.box(x, y, 0.72, 0.8, 0.8, 0.05, 0, mat('o', 0xe0e0e0));
      R.box(x + 0.75, y, 0, 0.45, 0.45, 0.45, 0, mat('=', 0xc06040)); R.box(x - 0.75, y, 0, 0.45, 0.45, 0.45, 0, mat('=', 0xc06040));
      if (dist < 40) { R.box(x, y, 0.77, 0.06, 0.06, 1.5, 0, MAT.pole); R.box(x, y, 2.2, 2.2, 2.2, 0.12, HP / 2, mat('^', (AC.hash(x | 0, y | 0, 3) & 1) ? 0xe04040 : 0x40a0e0)); }
      break;
    }
    case 'light': {
      const ph = lightPhase(p);
      // pole + head facing the approaching traffic
      const fyaw = [0, HP, Math.PI, -HP][p.face];
      const hx = Math.sin(fyaw), hy = -Math.cos(fyaw);
      R.box(x, y, 0, 0.16, 0.16, 3.4, 0, MAT.pole);
      R.box(x + hx * 0.1, y + hy * 0.1, 2.5, 0.3, 0.36, 0.95, fyaw, [{
        fn: (u, v) => {
          M.g = GL['#']; M.fg = 0x303036; M.bg = 0x0c0c10;
          if (u > 0.2 && u < 0.8) {
            const slot = v > 0.66 ? 'R' : v > 0.33 ? 'A' : 'G';
            const on = slot === ph;
            M.g = GL['●']; M.emit = on;
            M.fg = on ? (slot === 'R' ? 0xff2020 : slot === 'A' ? 0xffb020 : 0x30ff60) : 0x282828; M.bg = on ? AC.mulC(M.fg, 0.35) : 0x0c0c0c;
          }
          return true;
        }
      }, MAT.dark, MAT.dark, MAT.dark, MAT.dark]);
      // pedestrian signal on the kerb side
      if (dist < 35) {
        const walk = ph === 'R';
        R.box(x - hx * 0.12, y - hy * 0.12, 2.0, 0.2, 0.3, 0.35, fyaw + Math.PI, [{ fn: () => { M.g = walk ? G('♦') : GL['■']; M.fg = walk ? 0xffffff : 0xff4020; M.bg = 0x101010; M.emit = true; return true; } }, MAT.dark, MAT.dark, MAT.dark, MAT.dark]);
      }
      break;
    }
  }
}
function drawBooth(p, x, y, yaw, dist) {
  const relay = p.t === 'relay';
  const discovered = relay && AC.G && AC.G.relayKnown(p.relay);
  const c = relay ? (discovered ? 0x30ffb0 : 0x40c0ff) : 0xd02828;
  const frame = mat('#', c, AC.mulC(c, 0.25));
  const glassFn = { fn: (u, v) => { if (u < 0.12 || u > 0.88 || v < 0.06 || v > 0.9) { M.g = GL['#']; M.fg = c; M.bg = AC.mulC(c, 0.25); return true; } if (dist < 18) return false; M.g = GL['.']; M.fg = 0x80a0b0; M.bg = 0x102028; return true; } };
  R.box(x, y, 0, 1.0, 1.0, 2.4, yaw, [glassFn, glassFn, glassFn, glassFn, frame]);
  R.box(x, y, 2.4, 1.05, 1.05, 0.3, yaw, relay ? R.textMat('RELAY', 0x001010, c) : R.textMat('PHONE', 0xffffff, 0xa01818));
  if (dist < 18) { R.box(x - Math.sin(yaw) * 0.3, y + Math.cos(yaw) * 0.3, 1.1, 0.2, 0.3, 0.5, yaw, mat('%', 0x202020)); }
  if (relay) {
    const blink = (R.time * 2 % 1) < 0.5;
    R.box(x, y, 2.7, 0.2, 0.2, 0.2, 0, mat('●', blink ? 0xffffff : c, AC.mulC(c, 0.4)), 2);
  }
}
function drawTree(t, dist) {
  const s = t.s, fm = foliageMats[t.id & 3];
  if (dist > 70) { R.box(t.x, t.y, 0, 0.3 * s, 0.3 * s, 2.2 * s, 0, MAT.trunk); R.box(t.x, t.y, 2.2 * s, 2.6 * s, 2.6 * s, 2.6 * s, 0.4, fm); return; }
  switch (t.k) {
    case 1: // conical
      R.box(t.x, t.y, 0, 0.3 * s, 0.3 * s, 1.6 * s, 0, MAT.trunk);
      for (let k = 0; k < 4; k++) { const w = (3.2 - k * 0.7) * s; R.box(t.x, t.y, (1.4 + k * 1.3) * s, w, w, 1.5 * s, k * 0.4, fm); }
      break;
    case 2: // columnar
      R.box(t.x, t.y, 0, 0.25 * s, 0.25 * s, 1.2 * s, 0, MAT.trunk);
      R.box(t.x, t.y, 1.1 * s, 1.5 * s, 1.5 * s, 5 * s, 0.3, fm);
      R.box(t.x, t.y, 6.1 * s, 0.9 * s, 0.9 * s, 0.9 * s, 0.7, fm);
      break;
    case 3: // broad canopy
      R.box(t.x, t.y, 0, 0.35 * s, 0.35 * s, 3.4 * s, 0, MAT.trunk);
      R.box(t.x, t.y, 3.2 * s, 4.4 * s, 4.4 * s, 1.3 * s, t.id % 3, fm);
      R.box(t.x, t.y, 4.4 * s, 2.6 * s, 2.6 * s, 0.9 * s, 0.5, fm);
      break;
    default: // round blob
      R.box(t.x, t.y, 0, 0.32 * s, 0.32 * s, 2.3 * s, 0, MAT.trunk);
      R.box(t.x, t.y, 2.0 * s, 3.0 * s, 3.0 * s, 2.4 * s, 0.3, fm);
      R.box(t.x + 0.5 * s, t.y - 0.4 * s, 3.6 * s, 2.0 * s, 2.0 * s, 1.5 * s, 0.9, fm);
      R.box(t.x - 0.6 * s, t.y + 0.5 * s, 2.6 * s, 1.8 * s, 1.8 * s, 1.6 * s, 1.4, fm);
  }
}

/* ---------------- people ---------------- */
Mo.personMat = function (p, walking) {
  return {
    fn: (u, v, t) => {
      const ph = walking ? Math.sin(p.phase || 0) : 0;
      if (v > 0.86) { // head
        if (u < 0.32 || u > 0.68) return false;
        M.g = v > 0.95 ? GL['^'] : GL['o']; M.fg = v > 0.95 ? p.hair : p.skin; M.bg = AC.mulC(p.skin, 0.3); return true;
      }
      if (v > 0.47) { // torso + arms
        const arm = u < 0.2 || u > 0.8;
        if (u < 0.08 || u > 0.92) return false;
        if (arm && v < 0.56) { M.g = GL['o']; M.fg = p.skin; M.bg = AC.mulC(p.skin, 0.25); return true; }
        M.g = arm ? GL['|'] : (v > 0.8 ? GL['='] : GL['#']); M.fg = p.shirt; M.bg = AC.mulC(p.shirt, 0.3); return true;
      }
      // legs
      const off = ph * 0.1;
      const l1 = Math.abs(u - (0.36 - off * (1 - v * 2))) < 0.12, l2 = Math.abs(u - (0.64 + off * (1 - v * 2))) < 0.12;
      if (!l1 && !l2) return false;
      M.g = v < 0.06 ? GL['_'] : (ph > 0.3 ? (l1 ? GL['/'] : GL['\\']) : GL['|']); M.fg = v < 0.06 ? 0x202020 : p.pants; M.bg = AC.mulC(p.pants, 0.3); return true;
    }
  };
};
Mo.drawPerson = function (p, z0, walking) {
  const d = Math.hypot(p.x - R.cx, p.y - R.cy);
  const pr = R.project(p.x, p.y, (z0 || 0) + p.h * 0.5);
  if (!pr) return;
  const rowsTall = p.h * R.FR / pr.t;
  if (rowsTall < 2.6) { // tiny: a couple of glyphs
    const c = Math.floor(pr.c), r0 = Math.floor(pr.r - rowsTall / 2), r1 = Math.floor(pr.r + rowsTall / 2);
    for (let r = r0; r <= r1; r++) {
      if (c < 0 || c >= R.cols || r < 0 || r >= R.rows) continue;
      const i = r * R.cols + c;
      if (pr.t >= R.depth[i] || (R.maskObjects && !(R.flag[i] & 1))) continue;
      const k = R.fogK(pr.t);
      R.put(i, r === r0 ? GL['o'] : GL['!'], AC.mulC(r === r0 ? p.skin : p.shirt, k), R.backing ? AC.mulC(p.shirt, 0.2 * k) : 0);
      R.depth[i] = pr.t;
    }
    return;
  }
  R.billboard(p.x, p.y, z0 || 0, 0.62, p.h, p.mat || (p.mat = Mo.personMat(p, walking)));
  if (d < 10 && p.bag) R.box(p.x + R.rx * 0.32, p.y + R.ry * 0.32, (z0 || 0) + 0.5, 0.25, 0.1, 0.35, R.yaw, mat('#', p.bag));
};

/* ---------------- vehicles ---------------- */
const CARS = Mo.CARS = {
  hatch: { L: 3.9, W: 1.75, H: 1.45, bh: 0.78, c0: -0.35, c1: 0.2 },
  saloon: { L: 4.6, W: 1.8, H: 1.42, bh: 0.78, c0: -0.25, c1: 0.2 },
  suv: { L: 4.7, W: 1.95, H: 1.8, bh: 1.0, c0: -0.4, c1: 0.22 },
  van: { L: 5.2, W: 2.0, H: 2.3, bh: 1.0, c0: -0.48, c1: 0.34 },
  sports: { L: 4.3, W: 1.9, H: 1.15, bh: 0.6, c0: -0.15, c1: 0.15 },
  taxi: { L: 4.6, W: 1.8, H: 1.5, bh: 0.8, c0: -0.28, c1: 0.2 },
  moto: { L: 2.1, W: 0.7, H: 1.25, bh: 0.7 },
  bike: { L: 1.8, W: 0.5, H: 1.1, bh: 0.6 }
};
function glassMat(car, dist, side) {
  return {
    fn: (u, v, t) => {
      const edge = u < 0.07 || u > 0.93 || v > 0.86;
      if (edge) { M.g = GL['#']; M.fg = car.col; M.bg = AC.mulC(car.col, 0.25); return true; }
      if (dist < 26) return false; // selectively transparent: see the people inside
      M.g = GL['▒']; M.fg = 0x5a7a90; M.bg = 0x0c1820; return true;
    }
  };
}
Mo.drawCar = function (car, z0, noCabinGlass) {
  const S = CARS[car.type] || CARS.saloon;
  const d = Math.hypot(car.x - R.cx, car.y - R.cy);
  z0 = z0 || 0;
  const yaw = car.yaw, Fx = Math.sin(yaw), Fy = -Math.cos(yaw), Sx = Math.cos(yaw), Sy = Math.sin(yaw);
  const col = car.col, body = mat('#', col, AC.mulC(col, 0.28));
  if (car.type === 'moto' || car.type === 'bike') {
    const frame = car.type === 'bike' ? mat('/', 0xc0c0c8) : body;
    R.box(car.x, car.y, z0 + 0.3, S.L * 0.7, 0.18, 0.35, yaw, frame);
    R.box(car.x + Fx * S.L * 0.38, car.y + Fy * S.L * 0.38, z0, 0.62, 0.12, 0.62, yaw, MAT.tyre);
    R.box(car.x - Fx * S.L * 0.38, car.y - Fy * S.L * 0.38, z0, 0.62, 0.12, 0.62, yaw, MAT.tyre);
    if (car.type === 'moto') R.box(car.x + Fx * 0.9, car.y + Fy * 0.9, z0 + 0.7, 0.1, 0.3, 0.2, yaw, mat('█', 0xffffe0), 2);
    const rider = car.rider || (car.rider = { x: 0, y: 0, h: 1.55, shirt: car.type === 'bike' ? 0x40e080 : 0x303040, pants: 0x202030, skin: 0xd8a080, hair: car.type === 'moto' ? 0x101010 : 0x503020, phase: 0 });
    rider.x = car.x - Fx * 0.1; rider.y = car.y - Fy * 0.1; rider.phase = (car.dist || 0) * 2;
    Mo.drawPerson(rider, z0 + 0.35, car.type === 'bike');
    return;
  }
  const cabL = S.L * (S.c1 - S.c0), cabC = S.L * (S.c0 + S.c1) / 2;
  const front = {
    fn: (u, v) => {
      if (v > 0.35 && v < 0.75 && (u < 0.24 || u > 0.76)) { M.g = GL['█']; M.fg = 0xfffff0; M.bg = 0xa0a080; M.emit = true; return true; }
      if (v < 0.3 && u > 0.3 && u < 0.7) { M.g = GL['=']; M.fg = 0x909090; M.bg = 0x202020; return true; }
      M.g = GL['#']; M.fg = col; M.bg = AC.mulC(col, 0.28); return true;
    }
  };
  const back = {
    fn: (u, v) => {
      if (v > 0.45 && v < 0.8 && (u < 0.22 || u > 0.78)) { M.g = GL['█']; M.fg = car.braking ? 0xff2020 : 0xb01010; M.bg = 0x500808; M.emit = true; return true; }
      M.g = GL['#']; M.fg = col; M.bg = AC.mulC(col, 0.28); return true;
    }
  };
  const sideM = { fn: (u, v) => { M.g = v > 0.85 ? GL['='] : GL['#']; M.fg = col; M.bg = AC.mulC(col, 0.28); return true; } };
  R.box(car.x, car.y, z0 + 0.28, S.L, S.W, S.bh - 0.28, yaw, [front, back, sideM, sideM, mat('=', AC.mulC(col, 1.1), AC.mulC(col, 0.3))]);
  // wheels
  if (d < 90) for (const [a, b] of [[0.32, 1], [0.32, -1], [-0.32, 1], [-0.32, -1]]) {
    R.box(car.x + Fx * S.L * a + Sx * (S.W / 2 - 0.12) * b, car.y + Fy * S.L * a + Sy * (S.W / 2 - 0.12) * b, z0, 0.64, 0.24, 0.62, yaw, MAT.tyre);
  }
  // cabin with glazing
  const cx = car.x + Fx * cabC, cy = car.y + Fy * cabC;
  if (!noCabinGlass) {
    const gm = glassMat(car, d);
    R.box(cx, cy, z0 + S.bh, cabL, S.W * 0.88, S.H - S.bh, yaw, [gm, gm, gm, gm, mat('=', col, AC.mulC(col, 0.3))]);
  }
  if (d < 26 && car.people) {
    for (let k = 0; k < car.people.length; k++) {
      const pp = car.people[k];
      pp.x = car.x + Fx * (cabC + (k < 2 ? 0.25 : -0.55) * cabL) + Sx * (k % 2 ? -0.4 : 0.4) * S.W * 0.5;
      pp.y = car.y + Fy * (cabC + (k < 2 ? 0.25 : -0.55) * cabL) + Sy * (k % 2 ? -0.4 : 0.4) * S.W * 0.5;
      R.box(pp.x, pp.y, z0 + S.bh - 0.1, 0.5, 0.5, 0.4, yaw, MAT.seat);
      R.billboard(pp.x, pp.y, z0 + S.bh - 0.05, 0.42, 0.62, pp.mat || (pp.mat = { fn: (u, v) => { if (v > 0.55) { if (u < 0.25 || u > 0.75) return false; M.g = GL['o']; M.fg = pp.skin; M.bg = AC.mulC(pp.skin, 0.3); return true; } M.g = GL['#']; M.fg = pp.shirt; M.bg = AC.mulC(pp.shirt, 0.3); return true; } }));
    }
  }
  if (car.type === 'taxi') R.box(cx, cy, z0 + S.H, 0.35, 0.8, 0.25, yaw, R.textMat('TAXI', 0x101010, car.hired ? 0x806020 : 0xffe040));
};

/* flying cars and sky taxis */
Mo.drawFlyer = function (f) {
  const yaw = f.yaw, col = f.col;
  const hull = { fn: (u, v) => { if (v > 0.45 && v < 0.62) { M.g = GL['=']; M.fg = f.glow || 0x40ffff; M.bg = AC.mulC(f.glow || 0x40ffff, 0.3); M.emit = true; return true; } M.g = GL['#']; M.fg = col; M.bg = AC.mulC(col, 0.25); return true; } };
  R.box(f.x, f.y, f.z, f.L || 4.4, f.W || 2.0, 0.9, yaw, [hull, hull, hull, hull, mat('=', col)]);
  R.box(f.x + Math.sin(yaw) * -0.3, f.y - Math.cos(yaw) * -0.3, f.z + 0.9, (f.L || 4.4) * 0.5, (f.W || 2) * 0.8, 0.6, yaw, mat('▒', 0x6090b0, 0x102030));
  R.box(f.x, f.y, f.z - 0.25, (f.L || 4.4) * 0.6, (f.W || 2) * 0.5, 0.25, yaw, [MAT.dark, MAT.dark, MAT.dark, MAT.dark, MAT.dark, mat('█', f.glow || 0x40ffff)], 2);
};
Mo.drawSkyTaxi = function (s, cabin) {
  const yaw = s.yaw, Fx = Math.sin(yaw), Fy = -Math.cos(yaw), Sx = Math.cos(yaw), Sy = Math.sin(yaw), z = s.z;
  const col = 0xffc020, glow = 0x40e0ff;
  const hull = { fn: (u, v) => { if (v > 0.5 && v < 0.64) { M.g = GL['=']; M.fg = glow; M.bg = 0x0a3040; M.emit = true; return true; } if (v < 0.2 && Math.floor(u * 10) % 2) { M.g = GL['/']; M.fg = 0x202020; M.bg = 0x604810; return true; } M.g = GL['#']; M.fg = col; M.bg = 0x3a2c08; return true; } };
  if (!cabin) {
    R.box(s.x, s.y, z + 0.35, 5.2, 2.4, 1.1, yaw, [hull, hull, hull, hull, mat('=', col, 0x3a2c08)]);
    const gm = { fn: (u, v) => { if (u < 0.08 || u > 0.92 || v > 0.85) { M.g = GL['#']; M.fg = col; M.bg = 0x3a2c08; return true; } M.g = GL['▒']; M.fg = 0x60a0c0; M.bg = 0x0a1a28; return true; } };
    R.box(s.x + Fx * 0.2, s.y + Fy * 0.2, z + 1.45, 3.0, 2.1, 0.95, yaw, [gm, gm, gm, gm, R.textMat('SKY TAXI', 0x101010, 0xffe040, 8)]);
  }
  // thruster pods
  for (const [a, b] of [[1.8, 1.45], [1.8, -1.45], [-1.8, 1.45], [-1.8, -1.45]]) {
    const px = s.x + Fx * a + Sx * b, py = s.y + Fy * a + Sy * b;
    R.box(px, py, z + 0.2, 1.1, 0.6, 0.55, yaw, [MAT.dark, MAT.dark, MAT.dark, MAT.dark, MAT.dark, mat('█', s.flying ? 0x80f0ff : 0x205060)], 2);
  }
  if (!s.flying && !cabin) {
    R.box(s.x, s.y, 0, 0.3, 0.3, z + 0.35, 0, MAT.dark);
  }
};
/* inside the sky taxi: window frame and dash */
Mo.drawSkyCabin = function (s) {
  const yaw = s.yaw, Fx = Math.sin(yaw), Fy = -Math.cos(yaw), Sx = Math.cos(yaw), Sy = Math.sin(yaw), z = s.z;
  const frame = mat('#', 0x8a7020, 0x2a2008);
  const dash = { fn: (u, v) => { M.emit = true; if (v > 0.6 && Math.floor(u * 14) % 3 === 0) { M.g = GL['▓']; M.fg = 0x40ffd0; M.bg = 0x083028; return true; } M.g = GL['=']; M.fg = 0x5a5040; M.bg = 0x141008; return true; } };
  const P = (a, b, h) => ({ x: s.x + Fx * a + Sx * b, y: s.y + Fy * a + Sy * b, z: z + h });
  // a mostly-glass cabin: low dash, slim pillars, roof edge — the city stays visible below
  let q = P(1.62, 0, 0.3); R.box(q.x, q.y, q.z, 0.12, 2.2, 0.08, yaw, dash);
  for (const b of [-1.1, 1.1]) {
    q = P(1.55, b, 0.4); R.box(q.x, q.y, q.z, 0.1, 0.1, 2.15, yaw, frame);
    q = P(-1.4, b, 0.4); R.box(q.x, q.y, q.z, 0.1, 0.1, 2.15, yaw, frame);
    q = P(0.1, b, 0.35); R.box(q.x, q.y, q.z, 2.9, 0.08, 0.1, yaw, frame);
  }
  for (const b of [-1.1, 1.1]) { q = P(0.1, b, 2.52); R.box(q.x, q.y, q.z, 2.9, 0.12, 0.08, yaw, frame); }
  q = P(1.55, 0, 2.52); R.box(q.x, q.y, q.z, 0.1, 2.3, 0.08, yaw, frame);
};
/* inside the ground taxi: seats, driver, pillars */
Mo.drawTaxiCabin = function (car) {
  const yaw = car.yaw, Fx = Math.sin(yaw), Fy = -Math.cos(yaw), Sx = Math.cos(yaw), Sy = Math.sin(yaw);
  const P = (a, b) => ({ x: car.x + Fx * a + Sx * b, y: car.y + Fy * a + Sy * b });
  const frame = mat('#', 0xffd040, 0x3a2c08), trim = mat('=', 0x2a2a30, 0x0c0c10);
  // front seats sit below eye level so the road ahead stays visible
  let q = P(0.4, 0.42); R.box(q.x, q.y, 0.45, 0.45, 0.5, 0.5, yaw, MAT.seat); R.box(q.x - Fx * 0.2, q.y - Fy * 0.2, 0.95, 0.1, 0.24, 0.16, yaw, MAT.seat);
  q = P(0.4, -0.42); R.box(q.x, q.y, 0.45, 0.45, 0.5, 0.5, yaw, MAT.seat);
  q = P(1.45, 0); R.box(q.x, q.y, 0.78, 0.3, 1.6, 0.14, yaw, { fn: (u, v) => { M.emit = true; if (u > 0.62 && u < 0.82) { M.g = GL['▓']; M.fg = 0x40ff80; M.bg = 0x083018; return true; } M.g = GL['=']; M.fg = 0x404048; M.bg = 0x101014; return true; } });
  for (const b of [-0.86, 0.86]) {
    q = P(1.2, b); R.box(q.x, q.y, 0.92, 0.06, 0.06, 0.58, yaw, frame);   // A pillars
    q = P(-1.35, b); R.box(q.x, q.y, 0.92, 0.08, 0.06, 0.58, yaw, frame); // C pillars
    q = P(0, b); R.box(q.x, q.y, 1.48, 2.6, 0.12, 0.05, yaw, trim);       // roof rails
    q = P(0, b); R.box(q.x, q.y, 0.85, 2.6, 0.06, 0.06, yaw, trim);       // window sills
  }
  q = P(1.2, 0); R.box(q.x, q.y, 1.48, 0.08, 1.7, 0.05, yaw, trim);
  const drv = car.driver || (car.driver = { x: 0, y: 0, h: 0.95, shirt: 0x3a4a6a, pants: 0x202020, skin: 0xc89070, hair: 0x201010 });
  q = P(0.35, -0.42); drv.x = q.x; drv.y = q.y;
  R.billboard(q.x, q.y, 0.85, 0.5, 0.75, drv.m || (drv.m = { fn: (u, v) => { if (v > 0.62) { if (u < 0.25 || u > 0.75) return false; M.g = v > 0.9 ? GL['^'] : GL['o']; M.fg = v > 0.9 ? drv.hair : drv.skin; M.bg = 0x201008; return true; } M.g = GL['#']; M.fg = drv.shirt; M.bg = 0x10141c; return true; } }));
};

/* ---------------- Signal Keeper statue (dedicated pseudo-volumetric model) ---------------- */
Mo.drawStatue = function () {
  const s = W.STATUE, x = s.x, y = s.y, z = 1.6;
  const br = mat('#', 0x5aa090, 0x14302a), br2 = mat('=', 0x4a8a7a, 0x10261f);
  R.box(x - 0.55, y, z, 0.6, 0.6, 3.0, 0, br); R.box(x + 0.55, y, z, 0.6, 0.6, 3.0, 0, br);  // legs
  R.box(x, y, z + 3.0, 1.0, 2.0, 2.6, 0, br2);                                                      // torso / coat
  R.box(x, y, z + 2.2, 1.3, 2.3, 1.2, 0, br);                                                       // coat hem
  R.box(x - 1.3, y, z + 3.3, 0.45, 0.45, 2.1, 0, br);                                               // arm down
  R.box(x + 1.25, y, z + 5.0, 0.45, 0.45, 2.4, 0, br);                                              // raised arm
  R.box(x, y, z + 5.6, 0.8, 0.8, 0.9, 0, mat('o', 0x6ab0a0, 0x183a32));                             // head
  R.box(x, y, z + 6.5, 0.3, 0.3, 0.9, 0, br);                                                       // antenna
  const pulse = 0.6 + 0.4 * Math.sin(R.time * 3);
  R.box(x + 1.25, y, z + 7.4, 0.8, 0.8, 0.8, R.time, mat('☼', AC.mulC(0xfff0a0, pulse + 0.3), AC.mulC(0xa08020, pulse)), 2); // signal lantern
  R.box(x, y, z + 7.4, 0.2, 0.2, 0.2, 0, mat('*', 0xff4040), 2);
};

/* ---------------- landmark overhang details (not representable in the heightmap) ---------------- */
Mo.drawLandmarkExtras = function (lm, d) {
  const x = lm.cx, y = lm.cy;
  if (lm.shape === 'needle') {
    const pod = { fn: (u, v) => { M.g = v > 0.4 && v < 0.7 ? GL['#'] : GL['=']; M.fg = v > 0.4 && v < 0.7 ? 0xff90ff : 0xc070ff; M.bg = 0x301040; M.emit = v > 0.4 && v < 0.7; return true; } };
    for (let k = 0; k < 4; k++) R.box(x, y, 248, 20, 8.3, 12, k * Math.PI / 4, pod);
    R.box(x, y, 262, 10, 10, 6, 0.4, mat(':', 0xc070ff, 0x301040));
    if ((R.time % 1.5) < 0.75) R.box(x, y, 352, 1.4, 1.4, 1.4, 0, mat('█', 0xff3030), 2);
  } else if (lm.shape === 'twins') {
    const br = { fn: (u, v) => { M.g = v > 0.3 && v < 0.75 ? GL['#'] : GL['=']; M.fg = v > 0.3 && v < 0.75 ? 0xd0e8ff : 0x5a9aff; M.bg = 0x10204a; M.emit = v > 0.3 && v < 0.75; return true; } };
    R.box(x, y, 148, 12, 5, 7, HP, br);
    R.box(x, y, 96, 12, 3, 4, HP, br);
  } else if (lm.shape === 'meridian') {
    if ((R.time % 2) < 1) R.box(x, y, 372, 1.2, 1.2, 1.2, 0, mat('█', 0xffffff), 2);
  } else if (lm.shape === 'atlas') {
    R.box(x, y, 398, 0.8, 0.8, 18, 0, mat('|', 0xfff0a0), 2);
  } else if (lm.shape === 'pagoda') {
    const sizes = [25, 21, 17.5, 14, 11, 8, 5.5];
    if (d < 500) for (let k = 0; k < sizes.length; k++) R.box(x, y, 16 * (k + 1) + 2.5, sizes[k] * 2 + 3, sizes[k] * 2 + 3, 0.6, 0, mat('=', 0xff5030, 0x3a0c08));
  }
};

/* ---------------- monorail ---------------- */
const beamMat = mat('=', 0xa0a0b0, 0x2a2a34), pillarMat = mat('|', 0x8a8a98, 0x24242c);
Mo.drawTransitStructures = function () {
  for (const L of T.LINES) {
    const q = T.lineLocal(L, R.cx, R.cy);
    if (Math.abs(q.c) > 900) continue;
    const yawL = Math.atan2(L.f.x, -L.f.y);
    const stripe = mat('=', L.col, AC.mulC(L.col, 0.25));
    const s0 = Math.max(0, Math.floor((q.s - 900) / 32) * 32), s1 = Math.min(L.len, q.s + 900);
    for (let s = s0; s < s1; s += 32) {
      const mid = T.pointOn(L, s + 16, 0);
      const dist = Math.hypot(mid.x - R.cx, mid.y - R.cy);
      if (!R.visible(mid.x, mid.y, 7, 22, 1000)) continue;
      const segL = Math.min(32, L.len - s);
      for (const c of [-T.TRACK, T.TRACK]) {
        const p = T.pointOn(L, s + segL / 2, c);
        R.box(p.x, p.y, 6.5, segL, 0.9, 0.75, yawL, [beamMat, beamMat, dist < 200 ? stripe : beamMat, dist < 200 ? stripe : beamMat, mat(':', 0x6a6a78)]);
      }
      const pp = T.pointOn(L, s, 0);
      R.box(pp.x, pp.y, 0, 1.1, 1.1, 6.1, 0, pillarMat);
      R.box(pp.x, pp.y, 6.0, 1.2, 7.6, 0.5, yawL, pillarMat);
    }
  }
  for (const st of T.stations) {
    const d = Math.hypot(st.px - R.cx, st.py - R.cy);
    if (d > 650) continue;
    if (!R.visible(st.px, st.py, 8, 45, 700)) continue;
    drawStation(st, d);
  }
};
function stBox(st, a0, a1, c0, c1, z0, z1, m, opts) {
  const p = T.local2world(st, (a0 + a1) / 2, (c0 + c1) / 2);
  const yaw = Math.atan2(st.line.f.x, -st.line.f.y);
  R.box(p.x, p.y, z0, a1 - a0, c1 - c0, z1 - z0, yaw, m, opts);
}
function drawStation(st, d) {
  const L = st.line, col = L.col, D = T.DECK, BZ = T.BRIDGE;
  const edge = { fn: (u, v) => { M.g = GL['=']; M.fg = 0xc0c0c8; M.bg = 0x2a2a34; return true; } };
  const top = { fn: (u, v) => { const c = u; if (c < 0.07 || c > 0.93) { M.g = GL['#']; M.fg = 0xffd040; M.bg = 0x3a2c08; return true; } M.g = (Math.floor(v * 40) & 1) ? GL['.'] : GL[':']; M.fg = 0x9a9aa8; M.bg = 0x2a2a34; return true; } };
  // island platform
  stBox(st, 0, T.STN_LEN, -1.6, 1.6, D - 0.45, D, [edge, edge, edge, edge, top]);
  // canopy + posts
  if (d < 350) {
    stBox(st, 1, T.STN_LEN - 1, -2.0, 2.0, 11.7, 11.95, [mat('=', col), mat('=', col), mat('=', col), mat('=', col), mat(':', 0x6a6a78)]);
    for (let a = 4; a < T.STN_LEN; a += 8) stBox(st, a - 0.12, a + 0.12, -0.12, 0.12, D, 11.7, MAT.pole);
    // name signs hanging under the canopy
    const sign = R.textMat(' ' + st.name + ' ', 0xffffff, AC.mulC(col, 0.55), st.name.length + 2);
    stBox(st, 10, 22, -0.05, 0.05, 10.4, 11.1, sign, 1);
    stBox(st, 26, 38, -0.05, 0.05, 10.4, 11.1, R.textMat(' ' + L.id + ' ' + L.name + ' ', 0x101010, col, L.name.length + 6), 1);
    // platform pillars to the street
    for (const a of [6, 22, 38]) stBox(st, a - 0.5, a + 0.5, -0.5, 0.5, 0, D - 0.45, pillarMat);
  }
  // central stairs platform -> bridge (stepped boxes)
  const nS = 10;
  for (let k = 0; k < nS; k++) {
    const a0 = T.STN_LEN + k * (52 - T.STN_LEN) / nS, z = D + (k + 1) * (BZ - D) / nS;
    stBox(st, a0, a0 + (52 - T.STN_LEN) / nS + 0.05, -1.4, 1.4, z - 0.4, z, [edge, edge, edge, edge, mat('=', 0xb0b0bc, 0x30303a)]);
  }
  // upper bridge with railings and roof
  stBox(st, 52, 55.2, -1.4, 9.5, BZ - 0.4, BZ, [edge, edge, edge, edge, top]);
  if (d < 300) {
    stBox(st, 52, 52.1, -1.4, 9.5, BZ, BZ + 1.1, mat('#', 0x7a7a88, 0x20202a));
    stBox(st, 55.1, 55.2, -1.4, 6.5, BZ, BZ + 1.1, mat('#', 0x7a7a88, 0x20202a));
    stBox(st, 51.6, 55.6, -1.8, 9.8, BZ + 2.8, BZ + 3.05, mat('=', col));
    stBox(st, 52.2, 55, 2.2, 2.6, BZ + 1.9, BZ + 2.7, R.textMat(' METRO ', 0xffffff, AC.mulC(col, 0.5)), 1);
  }
  // street stairs bridge -> ground
  const n2 = 16;
  for (let k = 0; k < n2; k++) {
    const a0 = 55.2 + k * (74.5 - 55.2) / n2, z = BZ - k * BZ / n2;
    stBox(st, a0, a0 + (74.5 - 55.2) / n2 + 0.05, 6.5, 9.5, Math.max(0, z - 0.5), z, [edge, edge, edge, edge, mat('=', 0xb0b0bc, 0x30303a)]);
  }
  if (d < 250) {
    stBox(st, 55.2, 74.5, 9.5, 9.7, 0, 1.0, mat('#', 0x7a7a88)); // side rail (low)
    stBox(st, 73.5, 74.4, 5.8, 6.3, 0, 3.2, pillarMat);
    stBox(st, 73.6, 74.3, 5.75, 6.35, 3.2, 4.2, R.textMat('M', 0xffffff, col), 2);
  }
}
Mo.drawTrains = function () {
  for (const L of T.LINES) for (const tr of L.trains) {
    const mid = T.trainWorld(tr, T.TRAIN_LEN / 2, 0);
    const d = Math.hypot(mid.x - R.cx, mid.y - R.cy);
    if (d > 900 || !R.visible(mid.x, mid.y, 9, 24, 950)) continue;
    drawTrain(tr, d);
  }
};
function drawTrain(tr, d) {
  const L = tr.line, col = L.col, D = T.DECK;
  const yaw = Math.atan2(L.f.x * tr.dir, -L.f.y * tr.dir);
  const at = (a, c) => T.trainWorld(tr, a, c);
  const bx = (a0, a1, c0, c1, z0, z1, m, o) => { const p = at((a0 + a1) / 2, (c0 + c1) / 2); R.box(p.x, p.y, z0, a1 - a0, c1 - c0, z1 - z0, yaw, m, o); };
  const shell = mat('#', 0xd8dce4, 0x3a3e48), dark = mat('=', 0x3a3a48, 0x101018), stripe = mat('=', col, AC.mulC(col, 0.3));
  const near = d < 120;
  for (let k = 0; k < T.NCARS; k++) {
    const a0 = k * (T.CAR_LEN + T.CAR_GAP), a1 = a0 + T.CAR_LEN;
    // floor + roof
    bx(a0, a1, -1.3, 1.3, D - 0.45, D, [dark, dark, dark, dark, mat(':', 0x5a5a70, 0x1a1a24)]);
    bx(a0, a1, -1.3, 1.3, D + 2.55, D + 2.8, [shell, shell, shell, shell, mat('=', 0xb0b4bc), mat(':', 0x8a8e9a, 0x2a2c34)]);
    bx(a0 + 1.5, a1 - 1.5, -0.6, 0.6, D - 0.9, D - 0.45, dark); // bogie over the beam
    if (!near) { // far: solid carriage
      const winM = { fn: (u, v) => { if (v > 0.35 && v < 0.8 && AC.fract(u * 6) > 0.2) { M.g = GL['#']; M.fg = 0xfff0c0; M.bg = 0x504020; M.emit = true; return true; } M.g = v < 0.3 ? GL['='] : GL['#']; M.fg = v < 0.3 ? col : 0xd8dce4; M.bg = 0x2a2e38; return true; } };
      bx(a0, a1, -1.3, 1.3, D, D + 2.55, [shell, shell, winM, winM]);
      continue;
    }
    // side walls with windows and sliding doors
    for (const side of [-1, 1]) {
      const c0 = side > 0 ? 1.2 : -1.3, c1 = side > 0 ? 1.3 : -1.2;
      bx(a0, a1, c0, c1, D, D + 0.95, stripe);          // lower panel with line colour
      bx(a0, a1, c0, c1, D + 2.1, D + 2.55, shell);      // upper panel
      for (const p of [a0 + 0.1, a0 + 5.9, a1 - 0.3]) bx(p, p + 0.2, c0, c1, D + 0.95, D + 2.1, shell);
      for (const dOff of [3, 9]) {
        const da = a0 + dOff;
        const open = side < 0 ? tr.doors * 0.75 : 0;
        bx(da - 0.8 - open, da - open, c0, c1, D, D + 2.1, mat('|', 0xc0c4cc, 0x30343c));
        bx(da + open, da + 0.8 + open, c0, c1, D, D + 2.1, mat('|', 0xc0c4cc, 0x30343c));
        if (tr.doors > 0.6 && side < 0) bx(da - 0.8, da + 0.8, -1.66, -1.28, D - 0.04, D, mat('=', 0xffd040), 0); // boarding plate (island platform is always on the left of travel)
      }
    }
    // end walls with gangways
    for (const ea of [a0, a1 - 0.1]) { bx(ea, ea + 0.1, -1.3, -0.5, D, D + 2.55, shell); bx(ea, ea + 0.1, 0.5, 1.3, D, D + 2.55, shell); bx(ea, ea + 0.1, -0.5, 0.5, D + 2.0, D + 2.55, shell); }
    if (k < T.NCARS - 1) bx(a1, a1 + T.CAR_GAP, -0.55, 0.55, D + 2.0, D + 2.3, dark);
    // seats & lights & passengers
    if (d < 60) {
      for (const side of [-1, 1]) bx(a0 + 4.2, a1 - 4.2, side * 1.2 - (side > 0 ? 0.45 : 0), side * 1.2 + (side > 0 ? 0 : 0.45), D, D + 0.5, MAT.seat);
      bx(a0 + 1, a1 - 1, -0.15, 0.15, D + 2.5, D + 2.54, mat('=', 0xfff8e0), 2);
      const ps = tr.pass || (tr.pass = AC.S ? AC.S.makePassengers(tr) : []);
      for (const p of ps) if (p.car === k) { const w = at(p.a, p.c); p.x = w.x; p.y = w.y; Mo.drawPerson(p, D + (p.sit ? -0.35 : 0), false); }
    }
  }
  // cab ends
  const noseM = { fn: (u, v) => { if (v > 0.45 && v < 0.85 && u > 0.1 && u < 0.9) { M.g = GL['▒']; M.fg = 0x80b0d0; M.bg = 0x102030; return true; } if (v < 0.3 && (u < 0.2 || u > 0.8)) { M.g = GL['█']; M.fg = 0xfffff0; M.emit = true; M.bg = 0x808060; return true; } M.g = GL['#']; M.fg = col; M.bg = AC.mulC(col, 0.3); return true; } };
  bx(-0.9, 0, -1.2, 1.2, D - 0.2, D + 2.4, [noseM, shell, shell, shell, shell]);
  bx(T.TRAIN_LEN, T.TRAIN_LEN + 0.9, -1.2, 1.2, D - 0.2, D + 2.4, [shell, noseM, shell, shell, shell]);
}

/* ---------------- gather + draw the whole exterior object set ---------------- */
Mo.drawWorld = function (opts) {
  opts = opts || {};
  const cx = R.cx, cy = R.cy, high = R.cz > 30;
  const propR = high ? 45 : 75, treeR = high ? 80 : 130;
  const bx0 = Math.floor((cx - treeR) / 32), bx1 = Math.floor((cx + treeR) / 32), by0 = Math.floor((cy - treeR) / 32), by1 = Math.floor((cy + treeR) / 32);
  for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) {
    if (bx < 0 || by < 0 || bx >= 256 || by >= 256) continue;
    const ccx = bx * 32 + 16, ccy = by * 32 + 16;
    if (!R.visible(ccx, ccy, 4, 30, treeR + 30)) continue;
    const L = W.layout(bx, by);
    for (const t of L.trees) {
      const d = Math.hypot(t.x - cx, t.y - cy);
      if (d > treeR || !R.visible(t.x, t.y, 3, 4, treeR)) continue;
      drawTree(t, d);
    }
    for (const p of L.props) {
      const d = Math.hypot(p.x - cx, p.y - cy);
      const lim = p.t === 'lamp' || p.t === 'light' || p.t === 'relay' ? propR * 1.4 : propR;
      if (d > lim || !R.visible(p.x, p.y, 1.5, 3, lim)) continue;
      drawProp(p, d);
    }
  }
  const sd = Math.hypot(W.STATUE.x - cx, W.STATUE.y - cy);
  if (sd < 500 && R.visible(W.STATUE.x, W.STATUE.y, 5, 6, 500)) Mo.drawStatue();
  for (const lm of W.LANDMARKS) {
    const d = Math.hypot(lm.cx - cx, lm.cy - cy);
    if (d < 2500 && R.visible(lm.cx, lm.cy, 200, 60, 2600)) Mo.drawLandmarkExtras(lm, d);
  }
  Mo.drawTransitStructures();
  Mo.drawTrains();
  // taxi ranks (parked cabs) and sky taxi pads
  for (const d of W.districts) {
    const rk = d.rank;
    if (Math.abs(rk.x - cx) < 160 && Math.abs(rk.y - cy) < 160) {
      for (const cab of rk.cabs) {
        if (cab.taken) continue;
        if (!R.visible(cab.x, cab.y, 1, 4, 160)) continue;
        cab.type = 'taxi'; cab.col = 0xffd020; cab.people = cab.people || [];
        Mo.drawCar(cab, 0);
      }
    }
    const pd = d.pad;
    if (Math.abs(pd.x - cx) < 400 && Math.abs(pd.y - cy) < 400 && !pd.away) {
      if (R.visible(pd.x, pd.y, 2, 5, 400)) Mo.drawSkyTaxi({ x: pd.x, y: pd.y, z: 1.0, yaw: 0, flying: false });
    }
  }
  if (AC.S && !AC.S.empty) AC.S.drawAll();
};
})();
