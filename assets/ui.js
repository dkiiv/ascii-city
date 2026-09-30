/* ============================================================
   ASCII CITY — ui.js
   The terminal chrome around the city: live readouts, the relay
   map, the destination list, the narrative context bay, the
   transfer overlay and the touch rig.
   ============================================================ */
(function (global) {
"use strict";
const AC = global.AC = global.AC || {};
const W = AC.W;

const $ = (id) => (UI._el[id] || (UI._el[id] = document.getElementById(id)));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

const UI = {
  _el: {},
  _lastText: {},
  _acc: 0,
  mapZoom: 0,
  mapCache: null,
  mapDirty: true,
  destination: null,
  beat: null,
  beatPoi: null,
  storyStarted: false,
  phoneDone: false,
  clock: 23 * 60 + 41,
  weather: 0,               // 0 clear, 1 rain, 2 storm
  weatherName: ["CLEAR", "RAIN", "STORM"],
  touch: false,
  panelOpen: false,
  relayTimer: 0,
  tourCaption: 0
};

// ------------------------------------------------------------------------
//  INIT
// ------------------------------------------------------------------------
UI.init = function () {
  UI.touch = ("ontouchstart" in global) || (navigator.maxTouchPoints || 0) > 0;
  UI.rebuildDestinations();
  buildTouch();
  wirePanel();
  wireOrientation();
  if (UI.touch && innerWidth < 900) {
    const d = $("diagnostics"); if (d) d.open = false;
  }
  UI.mapDirty = true;
};

function wirePanel() {
  const sum = document.querySelector("#diagnostics summary");
  if (sum) sum.addEventListener("click", () => { if (UI.touch) UI.setPanel(document.getElementById("diagnostics").open); });
}

UI.setPanel = function (open) {
  UI.panelOpen = open;
  document.body.classList.toggle("panel-open", open);
  const b = $("touch-panel"); if (b) b.setAttribute("aria-expanded", open ? "true" : "false");
};

function wireOrientation() {
  const guide = $("orientation-guide");
  if (!guide) return;
  const check = () => {
    const portrait = innerHeight > innerWidth * 1.05 && UI.touch;
    guide.hidden = !(portrait && !UI._orientDismissed);
  };
  addEventListener("resize", check);
  const btn = $("orientation-continue");
  if (btn) btn.addEventListener("click", () => { UI._orientDismissed = true; guide.hidden = true; });
  check();
}

// ------------------------------------------------------------------------
//  DESTINATION LIST
// ------------------------------------------------------------------------
UI.rebuildDestinations = function () {
  const host = $("dest-list");
  if (!host) return;
  host.innerHTML = "";
  const story = global.AC_STORY || { kindBlurb: {} };
  const list = W.pois.slice().sort((a, b) => a.name.localeCompare(b.name));
  for (const p of list) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "listitem");
    b.dataset.poi = p.id;
    b.dataset.destState = "idle";
    b.innerHTML = '<span class="d-name"></span><span class="d-meta"></span>';
    b.querySelector(".d-name").textContent = p.name;
    b.querySelector(".d-meta").textContent = (story.kindBlurb && story.kindBlurb[p.kind]) || p.kind;
    b.addEventListener("click", () => UI.selectDestination(p));
    p._el = b;
    host.appendChild(b);
  }
};

UI.selectDestination = function (poi) {
  if (AC.Sim.mode === "rail" && poi.kind === "STATION") {
    if (AC.Sim.railTo(poi.station)) { emitToast("STOP AT · " + poi.name); return; }
  }
  UI.destination = poi;
  for (const p of W.pois) if (p._el) p._el.dataset.destState = (p === poi) ? "selected" : "idle";
  setText("ui-destination", poi ? poi.name : "—");
  emitToast("LINK SELECTED · " + poi.name);
};

// ------------------------------------------------------------------------
//  READOUTS
// ------------------------------------------------------------------------
function setText(id, v) {
  const el = $(id);
  if (!el) return;
  v = String(v);
  if (UI._lastText[id] === v) return;
  UI._lastText[id] = v;
  el.textContent = v;
}

const COMPASS = ["NORTH", "NORTH-EAST", "EAST", "SOUTH-EAST", "SOUTH", "SOUTH-WEST", "WEST", "NORTH-WEST"];

UI.update = function (dt, time, stats) {
  UI._acc += dt;
  UI.clock += dt * 0.25;
  if (UI.relayTimer > 0) {
    UI.relayTimer -= dt;
    if (UI.relayTimer <= 0) {
      const el = $("relay-transfer"); if (el) el.classList.remove("active");
    }
  }
  if (UI._acc < 0.12) { tickContext(time); return; }
  UI._acc = 0;

  const p = AC.Sim.player;
  const sim = AC.Sim;
  const deg = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
  const sec = W.sector(p.x, p.z);
  const dist = W.districtAt(p.x, p.z);

  // strip
  setText("strip-zone", dist ? dist.name : "CITY");
  setText("strip-bearing", pad3(Math.round(deg)) + "° " + COMPASS[Math.round(deg / 45) % 8].slice(0, 1));
  const hh = Math.floor(UI.clock / 60) % 24, mm = Math.floor(UI.clock % 60);
  setText("strip-clock", pad2(hh) + ":" + pad2(mm));
  setText("strip-weather", UI.weatherName[UI.weather]);
  setText("strip-fps", (stats.fps | 0) + " FPS");

  // 01 navigation
  setText("ui-sector", "AV " + pad2(sec.av) + " / ST " + pad2(sec.st));
  setText("ui-district", dist ? dist.name : "—");
  setText("ui-coord", p.x.toFixed(2) + " / " + p.z.toFixed(2));
  setText("ui-bearing", pad3(Math.round(deg)) + "° / " + COMPASS[Math.round(deg / 45) % 8]);
  setText("ui-speed", (p.speed || 0).toFixed(1) + " M/S");
  setText("ui-fps", (stats.fps | 0) + " FPS");
  const d = AC.R.dims;
  setText("ui-raster", d.cols + "×" + d.rows + " · " + AC.R.modeName);
  setText("ui-weather", UI.weatherName[UI.weather] + " / V TO CYCLE");

  // 02 activity
  setText("ui-npcs", sim.peds.length + " TRACKED");
  setText("ui-cars", sim.cars.length + " TRACKED");
  setText("ui-static", W.counts.statics + " INDEXED");
  setText("ui-visible", AC.R.stats.visible + " VISIBLE");
  setText("ui-props", W.counts.props + " INDEXED");
  setText("ui-signs", W.counts.signs + " ONLINE");
  setText("ui-path", sim.pathState);
  setText("ui-crossings", sim.crossingActive + " ACTIVE");

  // 03 transit
  const tr = sim.train;
  setText("ui-rail-line", W.rail ? W.rail.lineName : "—");
  setText("ui-rail-train", tr ? (tr.state === "dwell" ? "DWELLING" : Math.round(tr.sp * 3.6) + " KM/H") : "—");
  const nx = tr ? W.rail.stations[tr.idx] : null;
  setText("ui-rail-next", nx ? nx.name : "—");
  setText("ui-taxi-fleet", sim.ride ? "ON JOB" : "12 IDLE");
  const eta = sim.taxiEta();
  setText("ui-taxi-eta", eta ? eta.label + " " + eta.eta.toFixed(1) + "S" : "—");
  setText("ui-tour", sim.tour.on ? "RUNNING" : "OFF");

  // 00 input link
  setText("ui-auto-tour", "T / " + (sim.tour.on ? "ON" : "OFF"));
  setText("ui-population", "P / " + (AC.R.showPeds ? "VISIBLE" : "HIDDEN"));
  setText("ui-render", "G / " + AC.R.modeName);
  setText("ui-mapzoom", "M / " + ["FULL", "NEAR", "CLOSE"][UI.mapZoom]);
  setText("ui-capture", document.pointerLockElement ? "CAPTURED" : "CLICK CITY FEED");

  // 04 portals
  const near = W.nearestPOI(p.x, p.z);
  const zone = sim.mode === "walk" ? "CITY / STREET" :
               sim.mode === "rail" ? "CITY / ELEVATED" :
               sim.mode === "sky" ? "AIR / IN TRANSIT" :
               sim.mode === "ground" ? "CITY / ROAD" : "CITY / TOUR";
  setText("ui-zone", zone);
  setText("ui-portal-distance", near ? Math.round(near.dist) + " METRES" : "--- METRES");
  setText("ui-portal-state", sim.mode === "walk" ? "READY" : "BUSY");
  if (UI.destination) setText("ui-destination", UI.destination.name);

  // badges
  badge("badge-tour", sim.tour.on);
  badge("badge-taxi", sim.mode === "sky" || sim.mode === "ground");
  badge("badge-rail", sim.mode === "rail");

  const mh = $("mobile-hud");
  if (mh && !mh.hidden) {
    setText("mobile-hud-zone", dist ? dist.name : "CITY");
    setText("mobile-hud-bearing", pad3(Math.round(deg)) + "° " + COMPASS[Math.round(deg / 45) % 8]);
  }

  tickContext(time);
  drawMap();
};

function badge(id, on) { const el = $(id); if (el) el.hidden = !on; }
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function pad3(n) { return (n < 10 ? "00" : n < 100 ? "0" : "") + n; }

// ------------------------------------------------------------------------
//  CONTEXT / NARRATIVE
// ------------------------------------------------------------------------
const REACH = 7.5;

function tickContext(time) {
  if (UI.beat) return;
  const p = AC.Sim.player;
  if (AC.Sim.mode !== "walk") { hidePrompt(); return; }
  const near = W.nearestPOI(p.x, p.z);
  const el = $("prelude-prompt");
  if (!near || near.dist > REACH) { hidePrompt(); return; }
  const poi = near.poi;
  const beatId = beatFor(poi);
  if (!beatId) { hidePrompt(); return; }
  if (el) {
    el.hidden = false;
    el.innerHTML = "";
    el.appendChild(document.createTextNode(poi.name + "   [ E ]"));
  }
  UI._nearPoi = poi;
}
function hidePrompt() { const el = $("prelude-prompt"); if (el) el.hidden = true; }

function beatFor(poi) {
  const S = global.AC_STORY;
  if (!S) return null;
  if (poi.kind === "PHONE") return UI.phoneDone ? "phone_second" : S.opening;
  return (S.poiBeats && S.poiBeats[poi.kind]) || S.fallback;
}

UI.interact = function () {
  if (UI.beat) return false;
  const p = AC.Sim.player;
  if (AC.Sim.mode === "rail") return AC.Sim.leaveTrain();
  if (AC.Sim.mode !== "walk") return false;
  const near = W.nearestPOI(p.x, p.z);
  if (!near || near.dist > REACH) return false;
  const poi = near.poi;
  const id = beatFor(poi);
  if (!id) return false;
  UI.openBeat(id, poi);
  return true;
};

UI.openBeat = function (id, poi) {
  const S = global.AC_STORY;
  const beat = S && S.beats && S.beats[id];
  if (!beat) return;
  UI.beat = beat;
  UI.beatPoi = poi || null;
  if (poi && poi.kind === "PHONE") UI.storyStarted = true;

  const panel = $("context-panel");
  if (panel) panel.hidden = false;
  setText("ui-context-label", beat.label || "03::LOCAL_CONTEXT");
  setText("ui-context-title", beat.title || "");
  setText("ui-context-copy", beat.copy || "");

  const host = $("ui-context-choices");
  if (host) {
    host.innerHTML = "";
    host.hidden = false;
    (beat.choices || []).forEach((c, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = c.text;
      b.addEventListener("click", () => UI.choose(i));
      host.appendChild(b);
    });
  }
  syncTouchChoices();

  const mc = $("mobile-context");
  if (mc && UI.touch) {
    mc.hidden = false;
    setText("mobile-context-label", beat.label || "");
    setText("mobile-context-title", beat.title || "");
    setText("mobile-context-copy", beat.copy || "");
  }
  hidePrompt();
};

UI.choose = function (i) {
  const beat = UI.beat;
  if (!beat) return;
  const c = (beat.choices || [])[i];
  if (!c) return;
  const btns = $("ui-context-choices");
  if (btns && btns.children[i]) btns.children[i].classList.add("chosen");

  const S = global.AC_STORY;
  const lines = (S && S.relayLines) || ["PUBLIC RELAY"];
  let travelled = false;

  if (c.travel === "poi" && UI.beatPoi) {
    travelTo(UI.beatPoi); travelled = true;
  } else if (c.travel === "board") {
    if (AC.Sim.boardTrain()) travelled = true;
    else { emitToast("THE PLATFORM IS QUIET RIGHT NOW"); UI.closeBeat(); return; }
  } else if (c.travel === "station") {
    const r = W.nearestStation(AC.Sim.player.x, AC.Sim.player.z);
    if (r && r.station) { travelTo({ x: r.station.x + 6, z: r.station.z }); travelled = true; }
  } else if (c.travel === "cab") {
    const d = UI.destination || randomOtherPoi();
    if (d) { AC.Sim.callGroundTaxi(d); travelled = true; }
  } else if (c.travel === "sky") {
    const d = UI.destination || randomOtherPoi();
    if (d) { AC.Sim.callSkyTaxi(d); travelled = true; }
  }

  if (c.say) emitToast(c.say);

  if (c.goto) {
    if (travelled) setTimeout(() => UI.openBeat(c.goto, UI.beatPoi), 900);
    else UI.openBeat(c.goto, UI.beatPoi);
  } else if (c.close || !c.say) {
    UI.closeBeat();
  }
  if (UI.beatPoi && UI.beatPoi.kind === "PHONE" && !c.goto) UI.phoneDone = true;
  syncTouchChoices();
};

function randomOtherPoi() {
  const list = W.pois.filter(p => p !== UI.beatPoi && p.kind !== "PHONE");
  return list.length ? list[(Math.random() * list.length) | 0] : null;
}

UI.closeBeat = function () {
  UI.beat = null; UI.beatPoi = null;
  const panel = $("context-panel"); if (panel) panel.hidden = true;
  const mc = $("mobile-context"); if (mc) mc.hidden = true;
  if (UI._nearPoi && UI._nearPoi.kind === "PHONE") UI.phoneDone = true;
  syncTouchChoices();
};

function travelTo(poi) {
  const S = global.AC_STORY;
  const lines = (S && S.relayLines) || ["PUBLIC RELAY // TRANSFER"];
  UI.relay(lines[(Math.random() * lines.length) | 0]);
  setTimeout(() => {
    AC.Sim.player.x = poi.x;
    AC.Sim.player.z = poi.z;
    W.markSeen(poi.x, poi.z, 6);
  }, 420);
}

UI.relay = function (text, ms) {
  const el = $("relay-transfer"), tx = $("relay-transfer-text");
  if (!el) return;
  if (tx) tx.textContent = text;
  el.classList.add("active");
  UI.relayTimer = (ms || 1500) / 1000;
};

function emitToast(text) {
  const el = $("relay-transfer"), tx = $("relay-transfer-text");
  if (!el || !tx) return;
  tx.textContent = text;
  el.classList.add("active");
  UI.relayTimer = Math.max(UI.relayTimer, 1.4);
}
UI.toast = emitToast;

function syncTouchChoices() {
  const host = $("touch-choice-controls");
  if (!host) return;
  const btns = host.querySelectorAll("[data-touch-choice]");
  const choices = UI.beat ? (UI.beat.choices || []) : [];
  host.hidden = !UI.beat;
  for (let i = 0; i < btns.length; i++) {
    if (choices[i]) { btns[i].hidden = false; btns[i].textContent = choices[i].text; }
    else btns[i].hidden = true;
  }
}

// ------------------------------------------------------------------------
//  RELAY MAP
// ------------------------------------------------------------------------
const ZOOMS = [1, 0.45, 0.2];

UI.cycleZoom = function () { UI.mapZoom = (UI.mapZoom + 1) % ZOOMS.length; };

function paintMapCache() {
  const c = UI.mapCache || (UI.mapCache = document.createElement("canvas"));
  c.width = W.GW; c.height = W.GH;
  const g = c.getContext("2d");
  const img = g.createImageData(W.GW, W.GH);
  const d = img.data;
  for (let z = 0; z < W.GH; z++) {
    for (let x = 0; x < W.GW; x++) {
      const i = W.idx(x, z), o = i * 4;
      const t = W.tile[i];
      let r = 6, gg = 9, b = 8;
      if (t === W.T.ROAD) { r = 58; gg = 82; b = 104; }
      else if (t === W.T.WALK) { r = 34; gg = 46; b = 42; }
      else if (t === W.T.BUILD) {
        const h = W.height[i];
        const k = clamp(h / 26, 0, 1);
        r = 26 + k * 40; gg = 34 + k * 52; b = 34 + k * 44;
      }
      else if (t === W.T.WATER) { r = 14; gg = 30; b = 56; }
      else if (t === W.T.PLAZA) { r = 40; gg = 48; b = 40; }
      if (W.deck[i] > 0) { r = 40; gg = 150; b = 92; }
      d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  UI.mapDirty = false;
}

function drawMap() {
  const cv = $("minimap");
  if (!cv) return;
  const g = cv.getContext("2d");
  if (UI.mapDirty) paintMapCache();

  const S = cv.width, H = cv.height;
  g.fillStyle = "#000";
  g.fillRect(0, 0, S, H);

  const p = AC.Sim.player;
  const z = ZOOMS[UI.mapZoom];
  const spanX = W.GW * z, spanZ = W.GH * z;
  let ox = W.cellOf(p.x) - spanX / 2, oz = W.cellOf(p.z) - spanZ / 2;
  ox = clamp(ox, 0, W.GW - spanX);
  oz = clamp(oz, 0, W.GH - spanZ);

  g.imageSmoothingEnabled = false;
  g.globalAlpha = 1;
  g.drawImage(UI.mapCache, ox, oz, spanX, spanZ, 0, 0, S, H);

  const toPx = (wx, wz) => [((wx / W.CELL) - ox) / spanX * S, ((wz / W.CELL) - oz) / spanZ * H];

  // fog of war
  g.globalAlpha = 0.80;
  const cellPx = S / spanX;
  for (let cz = Math.floor(oz); cz < Math.ceil(oz + spanZ); cz++) {
    for (let cx = Math.floor(ox); cx < Math.ceil(ox + spanX); cx++) {
      if (!W.inBounds(cx, cz) || W.seen[W.idx(cx, cz)]) continue;
      const q = toPx(cx * W.CELL, cz * W.CELL);
      g.fillStyle = "#010302";
      g.fillRect(q[0], q[1], cellPx + 1, cellPx + 1);
    }
  }
  g.globalAlpha = 1;

  // POIs
  for (const poi of W.pois) {
    const q = toPx(poi.x, poi.z);
    if (q[0] < -4 || q[1] < -4 || q[0] > S + 4 || q[1] > H + 4) continue;
    const sel = poi === UI.destination;
    g.fillStyle = sel ? "#ffc45e" : "rgba(255,196,94,.72)";
    g.fillRect(q[0] - 2, q[1] - 2, sel ? 5 : 4, sel ? 5 : 4);
  }
  // stations
  if (W.rail) for (const s of W.rail.stations) {
    const q = toPx(s.x, s.z);
    g.fillStyle = "#6fffab";
    g.fillRect(q[0] - 2, q[1] - 2, 5, 5);
  }
  // cars
  g.fillStyle = "rgba(190,210,230,.35)";
  for (const c of AC.Sim.cars) {
    const q = toPx(c.x, c.z);
    if (q[0] < 0 || q[1] < 0 || q[0] > S || q[1] > H) continue;
    g.fillRect(q[0], q[1], 1, 1);
  }
  // train
  if (AC.Sim.train) {
    const q = toPx(AC.Sim.train.x, AC.Sim.train.z);
    g.fillStyle = "#b6ffd4";
    g.fillRect(q[0] - 3, q[1] - 1, 7, 3);
  }
  // player + heading
  const pq = toPx(p.x, p.z);
  g.strokeStyle = "rgba(255,255,255,.55)";
  g.beginPath();
  g.moveTo(pq[0], pq[1]);
  g.lineTo(pq[0] + Math.sin(p.yaw) * 11, pq[1] + Math.cos(p.yaw) * 11);
  g.stroke();
  g.fillStyle = "#fff";
  g.fillRect(pq[0] - 2, pq[1] - 2, 4, 4);

  // frame
  g.strokeStyle = "rgba(111,255,171,.28)";
  g.strokeRect(0.5, 0.5, S - 1, H - 1);
}
UI.invalidateMap = function () { UI.mapDirty = true; };

// ------------------------------------------------------------------------
//  TOUCH RIG
// ------------------------------------------------------------------------
function buildTouch() {
  const host = $("touch-controls");
  if (!host) return;
  if (UI.touch) {
    host.hidden = false;
    const mh = $("mobile-hud"); if (mh) mh.hidden = false;
  }
  stick($("touch-move"), (x, y) => { AC.Sim.stick = { x, y }; });
  stick($("touch-look"), (x, y) => {
    AC.Sim.player.yaw += x * 0.055;
    AC.Sim.player.pitch = clamp(AC.Sim.player.pitch + y * 0.045, -1.25, 1.25);
  });

  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener("click", fn); };
  on("touch-action", () => { if (!UI.interact()) AC.Sim.interact && AC.Sim.interact(); });
  on("touch-back", () => { if (UI.beat) UI.closeBeat(); else AC.Sim.cancelRide(); });
  on("touch-panel", () => UI.setPanel(!UI.panelOpen));
  on("touch-pause", () => setPaused(true));
  on("touch-resume", () => setPaused(false));

  const host2 = $("touch-choice-controls");
  if (host2) host2.querySelectorAll("[data-touch-choice]").forEach((b) => {
    b.addEventListener("click", () => UI.choose(parseInt(b.dataset.touchChoice, 10)));
  });
}
function setPaused(v) {
  AC.Sim.paused = v;
  const m = $("touch-pause-menu"); if (m) m.hidden = !v;
  const b = $("touch-pause"); if (b) b.setAttribute("aria-pressed", v ? "true" : "false");
}
UI.setPaused = setPaused;

function stick(el, cb) {
  if (!el) return;
  const thumb = el.querySelector(".touch-stick-thumb");
  let id = null, cx = 0, cy = 0;
  const R = 46;
  const start = (e) => {
    const t = e.changedTouches ? e.changedTouches[0] : e;
    id = e.changedTouches ? t.identifier : "mouse";
    const r = el.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    move(e);
  };
  const move = (e) => {
    let t = e;
    if (e.changedTouches) {
      t = null;
      for (const ct of e.touches) if (ct.identifier === id) t = ct;
      if (!t) return;
    }
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    if (thumb) thumb.style.transform = "translate(" + dx + "px," + dy + "px)";
    cb(dx / R, dy / R);
    e.preventDefault();
  };
  const end = () => { id = null; if (thumb) thumb.style.transform = ""; cb(0, 0); };
  el.addEventListener("touchstart", start, { passive: false });
  el.addEventListener("touchmove", move, { passive: false });
  el.addEventListener("touchend", end);
  el.addEventListener("touchcancel", end);
  el.addEventListener("mousedown", (e) => {
    start(e);
    const mm = (ev) => move(ev);
    const mu = () => { end(); removeEventListener("mousemove", mm); removeEventListener("mouseup", mu); };
    addEventListener("mousemove", mm); addEventListener("mouseup", mu);
  });
}

// ------------------------------------------------------------------------
//  BOOT SEQUENCE
// ------------------------------------------------------------------------
const BOOT_LINES = [
  "mount /dev/city0 ................ ok",
  "grid 100x100 @ 4.0u ............. ok",
  "district index .................. ok",
  "road graph / signals ............ ok",
  "elevated line + stations ........ ok",
  "neon sign network ............... ok",
  "pedestrian pool ................. ok",
  "raycast raster .................. ok"
];

UI.boot = function (onDone) {
  const log = $("boot-log"), btn = $("boot-start"), art = $("boot-art");
  if (art) art.textContent = bootArt();
  let i = 0;
  const step = () => {
    if (i < BOOT_LINES.length) {
      log.textContent += BOOT_LINES[i++] + "\n";
      setTimeout(step, 90 + Math.random() * 110);
    } else {
      btn.disabled = false;
      btn.textContent = "ENTER THE CITY";
      btn.addEventListener("click", () => {
        const s = $("boot-screen");
        s.classList.add("leaving");
        setTimeout(() => { s.style.display = "none"; }, 420);
        onDone();
      }, { once: true });
    }
  };
  setTimeout(step, 220);
};

function bootArt() {
  return [
    "  ▄▄▄   ▄▄▄  ▄▄▄▄ ▄  ▄ ▄▄▄▄ ",
    " █   █ █   █ █    █  █ █    ",
    " █▄▄▄█ █   █ █▄▄  █▄▄▄█ █▄▄  ",
    " █   █ █   █    █ █    █    ",
    " █   █  ▀▀▀  ▀▀▀▀ █    ▀▀▀▀ "
  ].join("\n");
}

global.AC.UI = UI;
})(window);
