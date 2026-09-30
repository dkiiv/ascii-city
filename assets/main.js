/* ============================================================
   ASCII CITY — main.js
   Boot, input, and the frame loop that stitches the world,
   the simulation, the renderer and the terminal chrome together.
   ============================================================ */
(function (global) {
"use strict";
const AC = global.AC = global.AC || {};
const W = AC.W, R = AC.R, Sim = AC.Sim, UI = AC.UI;

const canvas = document.getElementById("cv");
let last = 0, fpsAcc = 0, fpsN = 0, fpsT = 0, fps = 60;
let running = false;

// ------------------------------------------------------------------------
//  INPUT
// ------------------------------------------------------------------------
const keys = Sim.keys;

addEventListener("keydown", (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  keys[e.code] = true;

  // any deliberate movement cancels the auto tour
  if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.code) >= 0) {
    if (Sim.tour.on) { Sim.tour.on = false; UI.toast("TOUR RELEASED"); }
  }

  switch (e.code) {
    case "KeyE":       if (!UI.interact()) { if (Sim.mode === "rail") Sim.leaveTrain(); } break;
    case "KeyT":       UI.toast(Sim.toggleTour() ? "AUTO TOUR ENGAGED" : "AUTO TOUR OFF"); break;
    case "KeyY":
      if (e.shiftKey) callTaxi("ground"); else callTaxi("sky");
      e.preventDefault();
      break;
    case "KeyP":
      R.showPeds = !R.showPeds;
      UI.toast("POPULATION " + (R.showPeds ? "VISIBLE" : "HIDDEN"));
      break;
    case "KeyG":
      R.mode = (R.mode + 1) % R.MODES.length;
      UI.toast("RENDER " + R.modeName);
      break;
    case "KeyM":
      UI.cycleZoom();
      UI.toast("MAP " + ["FULL", "NEAR", "CLOSE"][UI.mapZoom]);
      break;
    case "KeyV":
      cycleWeather();
      break;
    case "KeyN":
      reseed();
      break;
    case "Equal": case "NumpadAdd":      R.setDensity(-1); UI.toast("DENSITY " + R.dims.cols + "×" + R.dims.rows); break;
    case "Minus": case "NumpadSubtract": R.setDensity(1);  UI.toast("DENSITY " + R.dims.cols + "×" + R.dims.rows); break;
    case "Escape":
      if (UI.beat) UI.closeBeat();
      else if (Sim.mode !== "walk") Sim.cancelRide();
      break;
  }
});
addEventListener("keyup", (e) => { keys[e.code] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

function callTaxi(kind) {
  const d = UI.destination;
  if (!d) { UI.toast("SELECT A DESTINATION · 06"); return; }
  if (kind === "sky") { if (Sim.callSkyTaxi(d)) UI.toast("SKY TAXI · " + d.name); }
  else { if (Sim.callGroundTaxi(d)) UI.toast("GROUND TAXI · " + d.name); }
}

function cycleWeather() {
  UI.weather = (UI.weather + 1) % 3;
  R.rainTarget = UI.weather === 0 ? 0 : UI.weather === 1 ? 0.6 : 1;
  UI.toast("WEATHER " + UI.weatherName[UI.weather]);
}

function reseed() {
  W.generate((Date.now() & 0x7fffffff) | 1);
  Sim.reset();
  UI.destination = null;
  UI.closeBeat();
  UI.invalidateMap();
  UI.rebuildDestinations();
  UI.toast("CITY RESEEDED · " + W.seed);
}

// ---------- mouse look ----------
canvas.addEventListener("click", () => {
  if (UI.touch) return;
  if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  }
});
addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas) return;
  Sim.player.yaw   -= e.movementX * 0.0022;
  Sim.player.pitch  = Math.max(-1.25, Math.min(1.25, Sim.player.pitch - e.movementY * 0.0022));
});

// ---------- touch drag on the city itself ----------
let tLast = null;
canvas.addEventListener("touchstart", (e) => { tLast = e.touches[0]; }, { passive: true });
canvas.addEventListener("touchmove", (e) => {
  if (!tLast || e.touches.length === 0) return;
  const t = e.touches[0];
  Sim.player.yaw   += (t.clientX - tLast.clientX) * 0.0045;
  Sim.player.pitch  = Math.max(-1.25, Math.min(1.25, Sim.player.pitch - (t.clientY - tLast.clientY) * 0.0045));
  tLast = t;
}, { passive: true });
canvas.addEventListener("touchend", () => { tLast = null; });

// ------------------------------------------------------------------------
//  SIM EVENTS -> UI
// ------------------------------------------------------------------------
Sim.onEvent = function (name, p) {
  switch (name) {
    case "taxi-arrive":   UI.toast("ARRIVED · " + (p.dest || "")); break;
    case "taxi-here":     UI.toast("TAXI AT THE KERB"); break;
    case "taxi-sky":      break;
    case "rail-board":    UI.toast("ABOARD M-01 · PICK A STATION IN 06 · E TO ALIGHT"); break;
    case "rail-leave":    UI.toast("BACK AT STREET LEVEL"); break;
    case "rail-arrive":   { const sa = W.rail.stations[p.station]; UI.toast("ARRIVED · " + (sa ? sa.name : "")); break; }
    case "train-arrive":  {
      const st = W.rail.stations[p.station];
      if (Sim.train.onboard && Sim.train.passenger < 0) UI.toast("STOP · " + (st ? st.name : ""));
      break;
    }
    case "tour":          break;
  }
};

// ------------------------------------------------------------------------
//  SCENE
// ------------------------------------------------------------------------
function buildScene() {
  const p = Sim.player;
  const pois = W.pois;
  for (const poi of pois) poi.near = Math.hypot(poi.x - p.x, poi.z - p.z) < 26;
  const tr = Sim.train;
  return {
    props: W.props,
    lamps: W.lamps,
    peds: Sim.peds,
    cars: Sim.cars,
    signs: W.signs,
    pois: pois,
    train: tr ? { x: tr.x, y: tr.y, z: tr.z, name: tr.name } : null
  };
}

// ------------------------------------------------------------------------
//  TOUR NARRATION
// ------------------------------------------------------------------------
const tourCaption = document.getElementById("tour-caption");
let tourTimer = 99, tourLine = 0;

function updateTourCaption(dt, on) {
  if (!tourCaption) return;
  if (!on) { tourCaption.hidden = true; tourTimer = 99; return; }
  tourTimer += dt;
  if (tourTimer < 6.5) return;
  const lines = (global.AC_STORY && global.AC_STORY.tourLines) || [];
  if (!lines.length) { tourCaption.hidden = true; return; }
  tourTimer = 0;
  tourCaption.hidden = false;
  tourCaption.textContent = lines[tourLine++ % lines.length];
}

// ------------------------------------------------------------------------
//  LOOP
// ------------------------------------------------------------------------
function frame(now) {
  requestAnimationFrame(frame);
  if (!running) return;
  const dt = Math.min(0.05, (now - last) / 1000) || 0;
  last = now;

  // storm lightning
  if (UI.weather === 2 && Math.random() < dt * 0.10) R.strike();

  Sim.pathState = Sim.mode === "walk" ? "IDLE"
    : Sim.mode === "tour" ? "TOURING"
    : Sim.mode === "sky" ? "AIR PATH LOCKED"
    : Sim.mode === "ground" ? "ROAD PATH LOCKED"
    : "RAIL LOCKED";

  Sim.update(dt, now / 1000);
  R.render(Sim.camera(), now, dt, buildScene());
  UI.update(dt, now / 1000, { fps });
  updateTourCaption(dt, Sim.tour.on);

  fpsAcc += dt; fpsN++;
  if (now - fpsT > 500) { fps = fpsN / (fpsAcc || 1); fpsAcc = 0; fpsN = 0; fpsT = now; }
}

// ------------------------------------------------------------------------
//  BOOT
// ------------------------------------------------------------------------
function boot() {
  R.init(canvas);
  W.generate(20260929);
  Sim.reset();
  UI.init();
  R.resize();
  UI.invalidateMap();

  const ro = new ResizeObserver(() => R.resize());
  ro.observe(document.getElementById("viewport"));
  addEventListener("resize", () => R.resize());
  addEventListener("orientationchange", () => setTimeout(() => R.resize(), 250));

  document.addEventListener("visibilitychange", () => { if (document.hidden) UI.setPaused(true); });

  UI.boot(() => {
    running = true;
    last = performance.now();
    if (!UI.touch) UI.toast("CLICK THE CITY FEED TO CAPTURE THE MOUSE");
  });

  requestAnimationFrame(frame);
}

if (document.readyState === "loading") addEventListener("DOMContentLoaded", boot);
else boot();

global.AC.reseed = reseed;
})(window);
