/* ASCII CITY — main loop, input and render pipeline */
(function () {
'use strict';
const W = AC.W, R = AC.R, T = AC.T, S = AC.S, I = AC.I, A = AC.A, Mo = AC.Mo, G = AC.G, U = AC.U, GLC = AC.GLC;
const RES = [[140, 62], [180, 80], [220, 98]];
let resIdx = AC.load('res', 1);
const cv = document.getElementById('cv'), screen = document.getElementById('screen');
let useGL = false;

function setRes(k) {
  resIdx = (k + RES.length) % RES.length;
  AC.save('res', resIdx);
  R.init(RES[resIdx][0], RES[resIdx][1]);
  resize();
}
function resize() {
  const vp = document.getElementById('viewport');
  const aw = vp.clientWidth - 24, ah = vp.clientHeight - 24;
  const aspect = (R.cols * R.cellW) / (R.rows * R.cellH);
  let w = aw, h = aw / aspect;
  if (h > ah) { h = ah; w = ah * aspect; }
  w = Math.max(200, Math.floor(w)); h = Math.max(130, Math.floor(h));
  screen.style.width = w + 'px'; screen.style.height = h + 'px';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
}
window.addEventListener('resize', resize);

/* ---------------- boot ---------------- */
R.init(RES[resIdx][0], RES[resIdx][1]);
try { useGL = GLC.init(cv); } catch (e) { console.warn('WebGL unavailable, using canvas fallback', e); useGL = false; }
if (!useGL) GLC.init2d(cv);
U.init();
resize();
G.startPrelude();
if (AC.load('seenIntro', false)) document.getElementById('skip-hint').style.display = 'block';

/* ---------------- input ---------------- */
const overlay = document.getElementById('overlay'), help = document.getElementById('help');
let started = false, locked = false, dragging = false, lastMX = 0, lastMY = 0;
function start() {
  if (!started) { started = true; overlay.classList.add('hidden'); A.init(); }
  if (cv.requestPointerLock) { try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ } }
}
overlay.addEventListener('click', start);
cv.addEventListener('click', start);
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === cv; });
document.addEventListener('mousemove', e => {
  if (locked) G.onMouse(e.movementX, e.movementY);
  else if (dragging) { G.onMouse(e.clientX - lastMX, e.clientY - lastMY); lastMX = e.clientX; lastMY = e.clientY; }
});
cv.addEventListener('mousedown', e => { if (!locked) { dragging = true; lastMX = e.clientX; lastMY = e.clientY; } });
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('blur', () => { G.keys = {}; });

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown', 'KeyE', 'KeyM', 'KeyT', 'KeyP', 'KeyG', 'KeyY', 'KeyN', 'KeyH', 'KeyC', 'KeyV', 'KeyF', 'BracketLeft', 'BracketRight', 'Backspace', 'F1']);
window.addEventListener('keydown', e => {
  if (GAME_KEYS.has(e.code) || /^Digit/.test(e.code)) e.preventDefault();
  if (!started && e.code !== 'F5') start();
  const first = !G.keys[e.code];
  G.keys[e.code] = true;
  if (!first || e.repeat) return;
  const digit = /^Digit(\d)$/.exec(e.code);
  if (digit) {
    const k = (+digit[1] + 9) % 10;
    if (G.menu) G.selectMenu(k);
    else if (G.mode === 'cctv' && k < G.CAMS.length) { G.cctv.k = k; G.cctv.t = 0; S.clear(); }
    return;
  }
  switch (e.code) {
    case 'KeyE': G.interact(); break;
    case 'KeyM': G.mapLevel = (G.mapLevel + 1) % 4; AC.save('mapLevel', G.mapLevel); A.click(); break;
    case 'KeyT': if (G.mode === 'walk' || G.tour) G.toggleTour(); break;
    case 'KeyP': S.empty = !S.empty; if (S.empty) S.clear(); G.toastMsg(S.empty ? 'EMPTY CITY // NO PEOPLE, NO TRAFFIC' : 'THE CITY RETURNS'); break;
    case 'KeyG': R.backing = !R.backing; AC.save('backing', R.backing); G.toastMsg('GLYPH BACKING ' + (R.backing ? 'ON' : 'OFF // CLASSIC ASCII')); break;
    case 'KeyY': G.pressY(e.shiftKey); break;
    case 'KeyN': if (e.shiftKey) { A.toggle(); G.toastMsg('MUSIC ' + (A.on ? 'ON' : 'OFF')); } break;
    case 'BracketLeft': A.setVol(A.vol - 0.05); break;
    case 'BracketRight': A.setVol(A.vol + 0.05); break;
    case 'KeyH': case 'F1': help.classList.toggle('show'); break;
    case 'KeyC': if (G.mode !== 'prelude' && G.mode !== 'intro') G.toggleCCTV(); break;
    case 'KeyV': setRes(resIdx + 1); G.toastMsg('RESOLUTION ' + R.cols + 'x' + R.rows); break;
    case 'KeyF': document.getElementById('diagnostics').open = !document.getElementById('diagnostics').open; break;
    case 'Space': G.skipIntro(); break;
    case 'ArrowLeft': case 'ArrowRight':
      if (G.mode === 'cctv') { G.cctv.k = (G.cctv.k + (e.code === 'ArrowLeft' ? -1 : 1) + G.CAMS.length) % G.CAMS.length; G.cctv.t = 0; S.clear(); }
      break;
    case 'Escape': case 'Backspace':
      if (help.classList.contains('show')) help.classList.remove('show');
      else if (G.backMenu()) { /* closed */ }
      else if (G.guide) G.guide = null;
      else if (G.mode === 'cctv' && e.code === 'Escape') G.toggleCCTV();
      break;
  }
});
window.addEventListener('keyup', e => { G.keys[e.code] = false; });
document.getElementById('help-close').addEventListener('click', () => help.classList.remove('show'));

/* ---------------- frame ---------------- */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.1) dt = 0.1;
  step(dt, now);
}
function step(dt, now) {
  W.tick();
  T.update(AC.worldTime());
  G.update(dt);
  const p = G.p;
  const cam = G.camera();
  if (G.mode !== 'prelude') {
    const onFoot = (G.mode === 'walk') && !p.train && p.z < 0.5;
    S.update(dt, cam.x, cam.y, { x: p.x, y: p.y, onFoot });
  }
  for (const c of S.cars) c.hidden = G.mode === 'taxi' && c === p.taxi;
  // render
  R.time = G.time;
  R.setCamera(cam.x, cam.y, cam.z, cam.yaw, cam.pitch);
  R.clear();
  switch (G.mode) {
    case 'prelude': {
      const room = G.pre.room;
      R.renderInterior(room);
      I.draw(room);
      I.drawPhone(room, G.pre.stage === 'ringing', G.pre.stage !== 'ringing', G.time);
      break;
    }
    case 'interior': {
      const IN = p.inside;
      R.renderInterior(IN);
      I.draw(IN);
      R.maskObjects = true; Mo.drawWorld(); R.maskObjects = false;
      break;
    }
    default: {
      R.renderExterior();
      Mo.drawWorld();
      if (G.mode === 'taxi') Mo.drawTaxiCabin(p.taxi);
      if (G.mode === 'sky') { Mo.drawSkyCabin(p.sky); }
    }
  }
  if (G.mode === 'intro') R.fxMatrix(Math.min(1, G.intro.t / 5), G.time);
  if (G.mode === 'relay') R.fxTransmit(Math.min(1, G.relayT.t / 3.6), G.time);
  if (G.mode === 'cctv') {
    const c = G.CAMS[G.cctv.k];
    R.textAt(2, 1, 'CAM ' + AC.lpad(G.cctv.k + 1, 2, '0') + ' // ' + c.name, 0xffffff, 0x000000);
    R.textAt(2, 2, new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC', 0x9affb0, 0x000000);
    if ((G.time % 1.2) < 0.7) R.textAt(R.cols - 9, 1, '● LIVE', 0xff3030, 0x000000);
    R.textAt(2, R.rows - 2, 'ASCII CITY // LIVE', 0x9affb0, 0x000000);
  }
  if (useGL) GLC.draw(R, G.solid, G.time, G.mode === 'cctv' ? 2.5 : 1);
  else GLC.draw2d(R, G.solid);
  U.frame(dt);
  U.update(now);
}
requestAnimationFrame(frame);
AC.debug = {
  G, W, R, T, S, I,
  step: (dt, n) => { for (let k = 0; k < (n || 1); k++) step(dt, performance.now()); },
  // place the player: view(x, y, yawDegrees, pitchDegrees)
  view: (x, y, yawDeg, pitchDeg, n) => { const p = G.p; if (G.mode === 'prelude' || G.mode === 'intro') G.skipIntro(); p.inside = null; p.train = null; G.mode = 'walk'; p.x = x; p.y = y; p.z = 0; p.yaw = p.tyaw = (yawDeg || 0) * Math.PI / 180; p.pitch = p.tpitch = (pitchDeg || 0) * Math.PI / 180; for (let k = 0; k < (n || 20); k++) step(0.05, performance.now()); },
  noUI: (on) => { document.getElementById('interface').style.display = on ? 'none' : ''; window.dispatchEvent(new Event('resize')); }
};
})();
