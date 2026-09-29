/* ASCII CITY — GPU compositor. JS does the simulation + raycasting; the GPU only composites glyphs:
   glyphs are cached in a texture atlas and the whole character grid is drawn in one pass. */
(function () {
'use strict';
const C = AC.GLC = {};
const GW = 16, GH = 24; // atlas slot size (px)

function buildAtlas() {
  const cv = document.createElement('canvas');
  cv.width = GW * 16; cv.height = GH * 16;
  const x = cv.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, cv.width, cv.height);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold ' + Math.round(GH * 0.78) + 'px "Cascadia Mono", "Consolas", "Courier New", monospace';
  for (let i = 0; i < 256; i++) {
    const ch = AC.glyphChar(i);
    const gx = (i % 16) * GW, gy = Math.floor(i / 16) * GH;
    if (i < 32 || i === 127) continue;
    const dither = { '▓': 0.75, '▒': 0.5, '░': 0.25 }[ch];
    if (ch === '█') { x.fillRect(gx, gy, GW, GH); continue; }
    if (dither) {
      for (let py = 0; py < GH; py += 2) for (let px = 0; px < GW; px += 2) {
        const k = ((px >> 1) + (py >> 1)) & 3;
        if ((dither >= 0.75 && k !== 0) || (dither === 0.5 && (k & 1) === 0) || (dither <= 0.25 && k === 0)) x.fillRect(gx + px, gy + py, 2, 2);
      }
      continue;
    }
    if (ch === '▀') { x.fillRect(gx, gy, GW, GH / 2); continue; }
    if (ch === '▄') { x.fillRect(gx, gy + GH / 2, GW, GH / 2); continue; }
    if (ch === '▌') { x.fillRect(gx, gy, GW / 2, GH); continue; }
    if (ch === '▐') { x.fillRect(gx + GW / 2, gy, GW / 2, GH); continue; }
    if (ch === '■') { x.fillRect(gx + 3, gy + 6, GW - 6, GH - 12); continue; }
    x.fillText(ch, gx + GW / 2, gy + GH / 2 + 1);
  }
  return cv;
}

const VS = 'attribute vec2 p; varying vec2 uv; void main(){ uv = vec2(p.x*0.5+0.5, 0.5-p.y*0.5); gl_Position = vec4(p,0.0,1.0); }';
const FS = [
  'precision mediump float;',
  'uniform sampler2D uA; uniform sampler2D uB; uniform sampler2D uAtlas;',
  'uniform vec2 uGrid; uniform float uSolid; uniform float uTime; uniform float uScan; uniform float uGlow;',
  'varying vec2 uv;',
  'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }',
  'void main(){',
  '  vec2 g = uv*uGrid; vec2 cell = floor(g); vec2 f = fract(g);',
  '  vec2 tc = (cell+0.5)/uGrid;',
  '  vec4 a = texture2D(uA, tc); vec4 b = texture2D(uB, tc);',
  '  float gi = floor(a.a*255.0+0.5);',
  '  vec2 gp = vec2(mod(gi,16.0), floor(gi/16.0));',
  '  vec2 af = vec2(0.04,0.02) + f*vec2(0.92,0.96);',
  '  float m = texture2D(uAtlas, (gp + af)/16.0).r;',
  '  vec3 col = mix(b.rgb, a.rgb, m);',
  '  col += a.rgb * m * uGlow * 0.25;',
  '  float h = hash(cell);',
  '  if (h < uSolid) col = mix(a.rgb, b.rgb, 0.08);',          // solid (non-ASCII) look for the prelude
  '  float sl = 1.0 - uScan*0.10*(1.0-smoothstep(0.0,0.25,f.y))*(1.0-step(uSolid,h));',
  '  gl_FragColor = vec4(col*sl, 1.0);',
  '}'].join('\n');

C.init = function (canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false });
  if (!gl) return false;
  C.gl = gl; C.canvas = canvas;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
  gl.useProgram(pr);
  C.pr = pr;
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const mk = (unit, nearest) => {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    const f = nearest ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  C.tA = mk(0, true); C.tB = mk(1, true); C.tAtlas = mk(2, false);
  gl.activeTexture(gl.TEXTURE2);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, buildAtlas());
  C.u = {};
  for (const n of ['uA', 'uB', 'uAtlas', 'uGrid', 'uSolid', 'uTime', 'uScan', 'uGlow']) C.u[n] = gl.getUniformLocation(pr, n);
  gl.uniform1i(C.u.uA, 0); gl.uniform1i(C.u.uB, 1); gl.uniform1i(C.u.uAtlas, 2);
  C.cols = 0; C.rows = 0;
  return true;
};
C.draw = function (R, solid, time, scan) {
  const gl = C.gl;
  if (C.cols !== R.cols || C.rows !== R.rows) {
    C.cols = R.cols; C.rows = R.rows;
    gl.activeTexture(gl.TEXTURE0); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, R.cols, R.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, R.t0);
    gl.activeTexture(gl.TEXTURE1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, R.cols, R.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, R.t1);
  } else {
    gl.activeTexture(gl.TEXTURE0); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, R.cols, R.rows, gl.RGBA, gl.UNSIGNED_BYTE, R.t0);
    gl.activeTexture(gl.TEXTURE1); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, R.cols, R.rows, gl.RGBA, gl.UNSIGNED_BYTE, R.t1);
  }
  gl.viewport(0, 0, C.canvas.width, C.canvas.height);
  gl.uniform2f(C.u.uGrid, R.cols, R.rows);
  gl.uniform1f(C.u.uSolid, solid);
  gl.uniform1f(C.u.uTime, time);
  gl.uniform1f(C.u.uScan, scan);
  gl.uniform1f(C.u.uGlow, 1.0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
};

/* Canvas2D fallback (slower) */
C.init2d = function (canvas) {
  C.ctx = canvas.getContext('2d'); C.canvas = canvas; C.atlas = buildAtlas();
  return true;
};
C.draw2d = function (R, solid) {
  const x = C.ctx, cw = C.canvas.width / R.cols, ch = C.canvas.height / R.rows;
  x.imageSmoothingEnabled = true;
  for (let r = 0; r < R.rows; r++) for (let c = 0; c < R.cols; c++) {
    const i = (r * R.cols + c) * 4;
    const bg = 'rgb(' + R.t1[i] + ',' + R.t1[i + 1] + ',' + R.t1[i + 2] + ')';
    const fg = 'rgb(' + R.t0[i] + ',' + R.t0[i + 1] + ',' + R.t0[i + 2] + ')';
    x.fillStyle = (AC.h01(c, r, 1) < solid) ? fg : bg;
    x.fillRect(c * cw, r * ch, cw + 0.5, ch + 0.5);
  }
  x.globalCompositeOperation = 'lighter';
  for (let r = 0; r < R.rows; r++) for (let c = 0; c < R.cols; c++) {
    const i = (r * R.cols + c) * 4, g = R.t0[i + 3];
    if (g <= 32 || AC.h01(c, r, 1) < solid) continue;
    x.globalAlpha = Math.max(R.t0[i], R.t0[i + 1], R.t0[i + 2]) / 255;
    x.drawImage(C.atlas, (g % 16) * GW, Math.floor(g / 16) * GH, GW, GH, c * cw, r * ch, cw, ch);
  }
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
};
})();
