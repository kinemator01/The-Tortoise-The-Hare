// ═══════════════════════════════════════════════════════════════════════════
//  Stage 4 — Midnight Forest
//  Visual additions over the base Stage 4 engine:
//    • Procedural star field (hash21 per-cell, uTime twinkle) via sky pre-pass
//    • Two-octave value-noise organic turf on all grass surfaces
//    • Quadratic distance fog (18–55 u) that hides tile pop-in
//    • Pale moonlight (top-left) + top-face highlight boost
//    • Dark soil ground plane filling tile gaps
//    • uMode int uniform (0=lit, 1=lit+noise, 2=sky, 3=flat) replaces uLit
//    • GL ortho speed + boost bars; DOM clock + distance-to-go in neon red
// ═══════════════════════════════════════════════════════════════════════════

// ─── Tuning constants ─────────────────────────────────────────────────────

const RABBIT_BASE  = 5;
let RABBIT_MAX   = 13;
const RABBIT_MIN   = 1;
let RABBIT_ACCEL = 6;
const RABBIT_BRAKE = 9;
let RABBIT_DRAG  = 3;

const TORTOISE_LEAD  = 5;
let TORTOISE_SPEED = 6.2;
const FINISH_LINE    = 618;  // totalZ distance to the finish line

const RABBIT_HW = 0.42;
const RABBIT_HD = 0.42;
let JUMP_SPEED       = 12.5;
const GRAVITY          = 28;
const LOG_CLEAR_HEIGHT = 0.45;
const ANIMAL_SPEED     = 1.75;
const ANIMAL_SWAY      = 0.35;
const STORAGE_KEY_BEST_TIME = 'rabbitBestTime';
let HIT_SPEED_PENALTY = 5;
let NAP_INTERVAL      = 25;   // seconds between hare naps (tortoise-player mode)
let NAP_DURATION      = 4;    // seconds per nap

// Per-character × per-difficulty tuning.
// When playing as tortoise: OPP_SPEED is the hare AI speed; NAP_* control its napping.
// BOOST_PEAK=0 for tortoise → Shift activates 2-second shell shield instead.
const CHAR_STATS = {
  hare: {
    easy:   { MAX:16, ACCEL:8, DRAG:1.5, JUMP:14,   HIT_PENALTY:5, BOOST_PEAK:22, BOOST_DECAY:2.0, BOOST_COOLDOWN:4,  OPP_SPEED:4.5 },
    normal: { MAX:13, ACCEL:6, DRAG:3.0, JUMP:12.5, HIT_PENALTY:5, BOOST_PEAK:16, BOOST_DECAY:3.0, BOOST_COOLDOWN:7,  OPP_SPEED:6.2 },
    hard:   { MAX:11, ACCEL:5, DRAG:5.0, JUMP:12.5, HIT_PENALTY:5, BOOST_PEAK:10, BOOST_DECAY:4.0, BOOST_COOLDOWN:12, OPP_SPEED:8.0 },
  },
  tortoise: {
    easy:   { MAX:8.5, ACCEL:5, DRAG:1.0, JUMP:7, HIT_PENALTY:2, BOOST_PEAK:0, BOOST_DECAY:0, BOOST_COOLDOWN:12, OPP_SPEED:9.5,  NAP_INTERVAL:18, NAP_DURATION:5.5 },
    normal: { MAX:7.0, ACCEL:4, DRAG:1.5, JUMP:5, HIT_PENALTY:2, BOOST_PEAK:0, BOOST_DECAY:0, BOOST_COOLDOWN:12, OPP_SPEED:11.0, NAP_INTERVAL:26, NAP_DURATION:4.0 },
    hard:   { MAX:6.0, ACCEL:3, DRAG:2.0, JUMP:4, HIT_PENALTY:2, BOOST_PEAK:0, BOOST_DECAY:0, BOOST_COOLDOWN:12, OPP_SPEED:13.5, NAP_INTERVAL:38, NAP_DURATION:3.0 },
  },
};
let currentDifficulty = 'normal';
let playerCharacter   = 'hare';   // 'hare' | 'tortoise'

// ─── Vertex Shader ────────────────────────────────────────────────────────
//  Passes world-space position (vWorldPos) to FS for per-fragment fog.

const VS_SRC = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;

out vec3 vNormal;
out vec3 vWorldPos;

void main() {
  vec4 wPos   = uModelMatrix * vec4(aPosition, 1.0);
  vWorldPos   = wPos.xyz;
  vNormal     = mat3(uModelMatrix) * aNormal;
  gl_Position = uProjectionMatrix * uViewMatrix * wPos;
}
`;

// ─── Fragment Shader ──────────────────────────────────────────────────────
//  uMode:
//    0 = Lambertian + quadratic fog                 (3-D objects)
//    1 = Lambertian + two-octave noise + fog        (grass tiles, soil)
//    2 = procedural star field                      (sky pre-pass quad)
//    3 = flat colour, no fog                        (ortho HUD quads)

const FS_SRC = `#version 300 es
precision mediump float;

in vec3 vNormal;
in vec3 vWorldPos;

uniform vec4  uColor;
uniform vec3  uLightDir;
uniform vec3  uLightColor;
uniform float uAmbient;
uniform int   uMode;
uniform float uTime;
uniform vec3  uCamPos;

out vec4 fragColor;

// ── Hash / noise ──────────────────────────────────────────────────────────

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  return fract(dot(p, p * 47.545));
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i),              hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0,1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {

  // ── Flat HUD ─────────────────────────────────────────────────────────
  if (uMode == 3) {
    fragColor = uColor;
    return;
  }

  // ── Starry sky ────────────────────────────────────────────────────────
  if (uMode == 2) {
    vec2 fc    = gl_FragCoord.xy;
    vec2 cell  = floor(fc / 4.0);
    vec2 cuv   = fract(fc / 4.0);
    float h    = hash21(cell);

    // ~2.5 % of 4×4 cells contain a star (single central pixel)
    float onStar = step(0.975, h)
                 * step(0.0, 0.28 - abs(cuv.x - 0.5))
                 * step(0.0, 0.28 - abs(cuv.y - 0.5));
    float twinkle = 0.5 + 0.5 * sin(uTime * (2.0 + h * 7.0) + h * 47.1);

    // Rare oversized bright stars
    float bigH = step(0.996, h)
               * step(0.0, 0.40 - abs(cuv.x - 0.5))
               * step(0.0, 0.40 - abs(cuv.y - 0.5));
    float bigT  = 0.6 + 0.4 * sin(uTime * 1.2 + h * 31.0);

    float brightness = max(onStar * twinkle, bigH * bigT);
    fragColor = vec4(uColor.rgb + vec3(brightness), 1.0);
    return;
  }

  // ── 3-D lit modes (0 = plain, 1 = organic noise) ──────────────────────
  vec3 col = uColor.rgb;

  if (uMode == 1) {
    // Two-octave value noise — organic forest turf / dark soil variation
    float n  = vnoise(vWorldPos.xz * 2.8);
    float n2 = vnoise(vWorldPos.xz * 9.1 + 17.3);
    col *= 0.50 + 0.38 * n + 0.12 * n2;
  }

  // Lambertian diffuse
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uLightDir);
  float diff     = max(dot(N, L), 0.0);
  float topBoost = max(N.y, 0.0) * 0.18;   // moonlight glint on upward faces
  vec3 lit = (uAmbient + uLightColor * diff + topBoost) * col;

  // Quadratic distance fog — hides tile recycling pop-in beyond ~55 u
  float dist  = length(vWorldPos - uCamPos);
  float fogT  = clamp((dist - 18.0) / (55.0 - 18.0), 0.0, 1.0);
  fogT = fogT * fogT;
  lit = mix(lit, vec3(0.02, 0.02, 0.07), fogT);

  fragColor = vec4(lit, uColor.a);
}
`;

// ─── GL helpers ───────────────────────────────────────────────────────────

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error('Shader:\n' + gl.getShaderInfoLog(sh));
  return sh;
}

function buildProgram(gl) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER,   VS_SRC));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FS_SRC));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(prog));
  return prog;
}

// Interleaved layout: [x,y,z, nx,ny,nz, ...], stride = 6 floats.
function createMesh(gl, interleaved, indices) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(interleaved), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  const stride = 6 * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
  gl.bindVertexArray(null);
  return { vao, count: indices.length };
}

// ─── Geometry ─────────────────────────────────────────────────────────────

function buildBox(x0, x1, y0, y1, z0, z1) {
  const v = [], idx = [];
  const faces = [
    { n:[0,0, 1], c:[[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]] },
    { n:[0,0,-1], c:[[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]] },
    { n:[0, 1,0], c:[[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]] },
    { n:[0,-1,0], c:[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]] },
    { n:[ 1,0,0], c:[[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]] },
    { n:[-1,0,0], c:[[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]] },
  ];
  faces.forEach((f, fi) => {
    const base = fi * 4;
    f.c.forEach(p => v.push(p[0], p[1], p[2], f.n[0], f.n[1], f.n[2]));
    idx.push(base, base+1, base+2,  base, base+2, base+3);
  });
  return { interleaved: v, indices: idx };
}

function mergeGeometry(parts) {
  const interleaved = [], indices = [];
  parts.forEach(part => {
    const base = interleaved.length / 6;
    interleaved.push(...part.interleaved);
    indices.push(...part.indices.map(i => i + base));
  });
  return { interleaved, indices };
}

function buildCube()     { return buildBox(-0.5, 0.5, -0.5, 0.5, -0.5, 0.5); }

function buildTileQuad() {
  return {
    interleaved: [
      -0.5,0,-0.5, 0,1,0,
       0.5,0,-0.5, 0,1,0,
       0.5,0, 0.5, 0,1,0,
      -0.5,0, 0.5, 0,1,0,
    ],
    indices: [0,1,2, 0,2,3],
  };
}

// Wide flat quad that slides with the rabbit to cover the ground between tiles.
// Local Z: -1 to +1 — scaled at draw time to cover 80 world units of depth.
function buildGroundPlane() {
  const hw = 7.0;
  return {
    interleaved: [
      -hw, 0, -1,  0,1,0,
       hw, 0, -1,  0,1,0,
       hw, 0,  1,  0,1,0,
      -hw, 0,  1,  0,1,0,
    ],
    indices: [0,1,2, 0,2,3],
  };
}

function buildRabbit() {
  return mergeGeometry([
    buildBox(-0.30, 0.30, 0.00, 0.55, -0.40, 0.40),
    buildBox(-0.22, 0.22, 0.50, 0.80, -0.15, 0.25),
    buildBox(-0.20,-0.08, 0.75, 1.20, -0.06, 0.06),
    buildBox( 0.08, 0.20, 0.75, 1.20, -0.06, 0.06),
    buildBox(-0.13, 0.13, 0.06, 0.26,  0.36, 0.55),
  ]);
}

function buildTortoise() {
  return mergeGeometry([
    buildBox(-0.55, 0.55, 0.00, 0.40, -0.65, 0.65),
    buildBox(-0.13, 0.13, 0.08, 0.26,  0.60, 0.82),
    buildBox(-0.62,-0.40, 0.00, 0.16, -0.35, 0.35),
    buildBox( 0.40, 0.62, 0.00, 0.16, -0.35, 0.35),
    buildBox(-0.10, 0.10, 0.04, 0.16, -0.75,-0.58),
  ]);
}

// Low-poly carrot body: three stacked boxes tapering from wide top to thin tip.
// Origin sits at the carrot waist; tip reaches y ≈ -0.08, leaves start at y = 0.40.
function buildCarrotBody() {
  return mergeGeometry([
    buildBox(-0.12, 0.12,  0.18, 0.40, -0.12, 0.12),  // fat upper body
    buildBox(-0.07, 0.07,  0.06, 0.18, -0.07, 0.07),  // mid taper
    buildBox(-0.03, 0.03, -0.08, 0.06, -0.03, 0.03),  // pointed tip
  ]);
}

// Four-leaf crown that sits above the carrot body (y > 0.40).
function buildCarrotLeaves() {
  return mergeGeometry([
    buildBox(-0.03, 0.03, 0.40, 0.72, -0.03, 0.03),   // tall centre leaf
    buildBox(-0.15,-0.05, 0.40, 0.58, -0.03, 0.03),   // left leaf
    buildBox( 0.05, 0.15, 0.40, 0.58, -0.03, 0.03),   // right leaf
    buildBox(-0.03, 0.03, 0.40, 0.58, -0.15,-0.05),   // back leaf
  ]);
}

// Unit square [0..1]×[0..1] in the XY plane — ortho HUD and sky quad.
function buildHudQuad() {
  return {
    interleaved: [
      0,0,0, 0,0,1,
      1,0,0, 0,0,1,
      1,1,0, 0,0,1,
      0,1,0, 0,0,1,
    ],
    indices: [0,1,2, 0,2,3],
  };
}

// ─── Track ────────────────────────────────────────────────────────────────

const LANE_X = (() => {
  const xs = [];
  for (let l = 0; l < TRACK.laneCount; l++)
    xs[l] = (l - (TRACK.laneCount - 1) / 2) * TRACK.tileWidth;
  return xs;
})();

function parseTiles() {
  const GAP    = 0.18;   // wider gap exposes soil ground plane beneath
  const tw     = TRACK.tileWidth - GAP;
  const td     = TRACK.tileDepth - GAP;
  const tileHW = tw / 2, tileHD = td / 2;
  const obstHW = 0.45,   obstHD = 0.45;
  const obstacleKinds = ['bush', 'log', 'animal'];
  const tiles = [];
  TRACK.layout.forEach((row, r) => {
    row.forEach((type, l) => {
      const x = LANE_X[l];
      const z = -(r + 0.5) * TRACK.tileDepth;
      const obstKind  = type === 2 ? obstacleKinds[(r + l) % obstacleKinds.length] : null;
      const tileModel = Mat4.multiply(Mat4.translate(x, 0, z), Mat4.scale(tw, 1, td));
      tiles.push({ type, lane: l, row: r, x, z, obstKind, tileModel, tileHW, tileHD, obstHW, obstHD });
    });
  });
  return tiles;
}

function aabbXZ(ax, az, aHW, aHD, bx, bz, bHW, bHD) {
  return Math.abs(ax - bx) < aHW + bHW && Math.abs(az - bz) < aHD + bHD;
}

// ─── Colours — midnight forest palette ────────────────────────────────────

const C_BUSH         = [0.05, 0.26, 0.08, 1.0];   // deep forest bush
const C_CARROT       = [0.95, 0.45, 0.05, 1.0];   // vivid orange
const C_CARROT_LEAF  = [0.22, 0.65, 0.14, 1.0];   // bright leaf green
const C_LOG      = [0.30, 0.18, 0.06, 1.0];   // dark bark
const C_ANIMAL   = [0.70, 0.68, 0.50, 1.0];   // muted animal
const C_SOIL     = [0.09, 0.07, 0.04, 1.0];   // dark soil between tiles
const C_RABBIT   = [0.40, 0.70, 1.00, 1.0];   // moonlit blue
const C_TORTOISE = [0.25, 0.38, 0.12, 1.0];   // deep forest olive

// ─── Game state ───────────────────────────────────────────────────────────

let gameState = 'select';

const rabbit = {
  lane: 1, x: 0, z: 0,
  speed: RABBIT_BASE, totalZ: 0,
  hitCooldown: 0, tilePickupCooldown: 0,
  jumpY: 0, vy: 0,
};

const tortoise = { x: 0, totalZ: TORTOISE_LEAD, speed: TORTOISE_SPEED };

const shiftBoost = {
  active: false, elapsed: 0, cooldown: 0,
  PEAK: 16, DECAY: 3.0, COOLDOWN: 7,
};
const hareAI = { napping: false, napTimer: 0, napCountdown: 25 };

const keys = { w: false, s: false };
const LANE_NAMES = ['Left', 'Centre', 'Right'];

function loadBestTime() {
  const raw = localStorage.getItem(STORAGE_KEY_BEST_TIME + '_' + playerCharacter + '_' + currentDifficulty);
  return raw ? parseFloat(raw) : null;
}
function saveBestTime(v) {
  localStorage.setItem(STORAGE_KEY_BEST_TIME + '_' + playerCharacter + '_' + currentDifficulty, v.toString());
  return v;
}

let bestTime  = null;
let gameStart = performance.now();

// ─── Entry point ──────────────────────────────────────────────────────────

(function main() {
  try {
    const canvas = document.getElementById('glCanvas');
    const gl     = canvas.getContext('webgl2');
    if (!gl) { alert('WebGL2 not supported.'); return; }

    const prog = buildProgram(gl);

    const uModel      = gl.getUniformLocation(prog, 'uModelMatrix');
    const uView       = gl.getUniformLocation(prog, 'uViewMatrix');
    const uProj       = gl.getUniformLocation(prog, 'uProjectionMatrix');
    const uColor      = gl.getUniformLocation(prog, 'uColor');
    const uLightDir   = gl.getUniformLocation(prog, 'uLightDir');
    const uLightColor = gl.getUniformLocation(prog, 'uLightColor');
    const uAmbient    = gl.getUniformLocation(prog, 'uAmbient');
    const uMode       = gl.getUniformLocation(prog, 'uMode');
    const uTime       = gl.getUniformLocation(prog, 'uTime');
    const uCamPos     = gl.getUniformLocation(prog, 'uCamPos');

    const mkMesh = geo => createMesh(gl, geo.interleaved, geo.indices);
    const cubeMesh        = mkMesh(buildCube());
    const groundMesh      = mkMesh(buildGroundPlane());
    const rabbitMesh      = mkMesh(buildRabbit());
    const tortoiseMesh    = mkMesh(buildTortoise());
    const carrotBodyMesh  = mkMesh(buildCarrotBody());
    const carrotLeafMesh  = mkMesh(buildCarrotLeaves());
    const hudMesh         = mkMesh(buildHudQuad());

    const tiles     = parseTiles();
    const TRACK_LEN = TRACK.layout.length * TRACK.tileDepth;

    const projMat  = Mat4.perspective(Math.PI / 3, canvas.width / canvas.height, 0.1, 200);
    const orthoMat = Mat4.ortho(0, canvas.width, 0, canvas.height, -1, 1);

    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0.02, 0.02, 0.05, 1.0);   // midnight navy

    // ── Helpers ────────────────────────────────────────────────────────────

    function fmtTime(sec) {
      const m = Math.floor(sec / 60);
      const s = (sec % 60).toFixed(1).padStart(4, '0');
      return m + ':' + s;
    }

    // ── Reset / difficulty select ──────────────────────────────────────────

    function resetGame() {
      gameState = 'select';
      document.getElementById('overlay').style.display     = 'none';
      document.getElementById('diffOverlay').style.display = 'flex';
      document.getElementById('charStep').style.display    = 'flex';
      document.getElementById('diffStep').style.display    = 'none';
    }

    function selectCharacter(char) {
      playerCharacter = char;
      document.getElementById('charStep').style.display    = 'none';
      document.getElementById('diffStep').style.display    = 'flex';
      document.getElementById('selectedCharName').textContent = char === 'hare' ? 'HARE' : 'TORTOISE';
    }

    function startGame(diff) {
      currentDifficulty = diff;
      const d = CHAR_STATS[playerCharacter][diff];
      RABBIT_MAX        = d.MAX;
      RABBIT_ACCEL      = d.ACCEL;
      RABBIT_DRAG       = d.DRAG;
      JUMP_SPEED        = d.JUMP;
      HIT_SPEED_PENALTY = d.HIT_PENALTY;
      TORTOISE_SPEED    = d.OPP_SPEED;
      shiftBoost.PEAK     = d.BOOST_PEAK;
      shiftBoost.DECAY    = d.BOOST_DECAY;
      shiftBoost.COOLDOWN = d.BOOST_COOLDOWN;
      if (playerCharacter === 'tortoise') {
        NAP_INTERVAL = d.NAP_INTERVAL;
        NAP_DURATION = d.NAP_DURATION;
        hareAI.napping = false; hareAI.napTimer = 0; hareAI.napCountdown = NAP_INTERVAL;
      }

      rabbit.lane = 1; rabbit.x = 0; rabbit.z = 0;
      rabbit.speed = RABBIT_BASE; rabbit.totalZ = 0;
      rabbit.hitCooldown = 0; rabbit.tilePickupCooldown = 0;
      rabbit.jumpY = 0; rabbit.vy = 0;
      tortoise.totalZ = TORTOISE_LEAD; tortoise.speed = TORTOISE_SPEED;
      shiftBoost.active = false; shiftBoost.elapsed = 0; shiftBoost.cooldown = 0;
      keys.w = false; keys.s = false;
      bestTime  = loadBestTime();
      gameStart = performance.now();
      gameState = 'playing';
      const charLabel = playerCharacter === 'hare' ? 'HARE' : 'TORTOISE';
      document.getElementById('timer').textContent         = '0:00.0';
      document.getElementById('diffLabel').textContent     = charLabel + ' · ' + diff.toUpperCase();
      document.getElementById('overlay').style.display     = 'none';
      document.getElementById('diffOverlay').style.display = 'none';
    }

    document.getElementById('btnHare').addEventListener('click',   () => selectCharacter('hare'));
    document.getElementById('btnTort').addEventListener('click',   () => selectCharacter('tortoise'));
    document.getElementById('btnBack').addEventListener('click',   () => {
      document.getElementById('diffStep').style.display = 'none';
      document.getElementById('charStep').style.display = 'flex';
    });
    document.getElementById('btnEasy').addEventListener('click',   () => startGame('easy'));
    document.getElementById('btnNormal').addEventListener('click', () => startGame('normal'));
    document.getElementById('btnHard').addEventListener('click',   () => startGame('hard'));

    // ── Input ──────────────────────────────────────────────────────────────

    document.addEventListener('keydown', e => {
      if (e.key === 'r' || e.key === 'R') { resetGame(); return; }
      if (gameState !== 'playing') return;
      switch (e.key) {
        case 'w': case 'W': keys.w = true;  e.preventDefault(); break;
        case 's': case 'S': keys.s = true;  e.preventDefault(); break;
        case 'a': case 'A': case 'ArrowLeft':
          if (rabbit.lane > 0) rabbit.lane--;
          e.preventDefault(); break;
        case 'd': case 'D': case 'ArrowRight':
          if (rabbit.lane < TRACK.laneCount - 1) rabbit.lane++;
          e.preventDefault(); break;
        case 'Shift':
          if (shiftBoost.cooldown <= 0) {
            shiftBoost.active  = true;
            shiftBoost.elapsed = 0;
            shiftBoost.cooldown = shiftBoost.COOLDOWN;
          }
          e.preventDefault(); break;
        case ' ': case 'Spacebar':
          if (rabbit.jumpY <= 0.001 && rabbit.vy === 0) rabbit.vy = JUMP_SPEED;
          e.preventDefault(); break;
      }
    });

    document.addEventListener('keyup', e => {
      if (e.key === 'w' || e.key === 'W') keys.w = false;
      if (e.key === 's' || e.key === 'S') keys.s = false;
    });

    // ── Render / physics loop ──────────────────────────────────────────────

    let lastTs = 0, fCount = 0, fTimer = 0;

    function render(now) {
      const dt = Math.min((now - lastTs) / 1000, 0.1);
      const t  = now * 0.001;
      lastTs = now;

      fCount++; fTimer += dt;
      if (fTimer >= 1) {
        document.getElementById('fps').textContent = fCount;
        fCount = 0; fTimer = 0;
      }

      // ══ PHYSICS ═══════════════════════════════════════════════════════════

      if (gameState === 'playing') {

        if (keys.w) {
          rabbit.speed = Math.min(rabbit.speed + RABBIT_ACCEL * dt, RABBIT_MAX);
        } else if (keys.s) {
          rabbit.speed = Math.max(rabbit.speed - RABBIT_BRAKE * dt, RABBIT_MIN);
        } else {
          if      (rabbit.speed > RABBIT_BASE) rabbit.speed = Math.max(rabbit.speed - RABBIT_DRAG * dt, RABBIT_BASE);
          else if (rabbit.speed < RABBIT_BASE) rabbit.speed = Math.min(rabbit.speed + RABBIT_DRAG * dt, RABBIT_BASE);
        }

        if (rabbit.vy !== 0 || rabbit.jumpY > 0) {
          rabbit.jumpY += rabbit.vy * dt;
          rabbit.vy   -= GRAVITY * dt;
          if (rabbit.jumpY <= 0) { rabbit.jumpY = 0; rabbit.vy = 0; }
        }

        let boostExtra = 0;
        if (shiftBoost.active) {
          shiftBoost.elapsed += dt;
          if (playerCharacter === 'hare') {
            boostExtra = shiftBoost.PEAK * Math.exp(-shiftBoost.DECAY * shiftBoost.elapsed);
            if (boostExtra < 0.15) shiftBoost.active = false;
          } else {
            // Tortoise shell: fixed 2-second obstacle immunity, no speed bonus
            if (shiftBoost.elapsed >= 2.0) shiftBoost.active = false;
          }
        }
        if (shiftBoost.cooldown > 0)
          shiftBoost.cooldown = Math.max(0, shiftBoost.cooldown - dt);

        const effectiveSpeed = rabbit.speed + boostExtra;

        rabbit.z      -= effectiveSpeed * dt;
        rabbit.totalZ += effectiveSpeed * dt;

        if (playerCharacter === 'tortoise') {
          // Hare AI naps occasionally — the fable made real
          hareAI.napCountdown -= dt;
          if (!hareAI.napping && hareAI.napCountdown <= 0) {
            hareAI.napping      = true;
            hareAI.napTimer     = NAP_DURATION;
            hareAI.napCountdown = NAP_INTERVAL;
          }
          if (hareAI.napping) {
            hareAI.napTimer -= dt;
            if (hareAI.napTimer <= 0) hareAI.napping = false;
          }
          if (!hareAI.napping) tortoise.totalZ += tortoise.speed * dt;
        } else {
          tortoise.totalZ += tortoise.speed * dt;
        }

        rabbit.x += (LANE_X[rabbit.lane] - rabbit.x) * Math.min(dt * 10, 1);

        if (rabbit.hitCooldown       > 0) rabbit.hitCooldown       -= dt;
        if (rabbit.tilePickupCooldown > 0) rabbit.tilePickupCooldown -= dt;

        for (const tile of tiles) {
          if (Math.abs(tile.z - rabbit.z) > TRACK.tileDepth) continue;

          if (tile.type === 1 && rabbit.tilePickupCooldown <= 0) {
            if (aabbXZ(rabbit.x, rabbit.z, RABBIT_HW, RABBIT_HD,
                       tile.x,   tile.z,   tile.tileHW, tile.tileHD)) {
              rabbit.speed = Math.min(rabbit.speed + 3.5, RABBIT_MAX);
              rabbit.tilePickupCooldown = 2.0;
            }
          }

          if (tile.type === 2 && rabbit.hitCooldown <= 0) {
            let obstX = tile.x;
            if (tile.obstKind === 'animal')
              obstX += Math.sin((t + tile.row * 0.75) * ANIMAL_SPEED) * ANIMAL_SWAY;
            if (aabbXZ(rabbit.x, rabbit.z, RABBIT_HW, RABBIT_HD,
                       obstX,    tile.z,   tile.obstHW, tile.obstHD)) {
              const clearedLog = tile.obstKind === 'log' && rabbit.jumpY > LOG_CLEAR_HEIGHT;
              if (!clearedLog) {
                const shielded = playerCharacter === 'tortoise' && shiftBoost.active;
                if (!shielded) {
                  rabbit.speed = Math.max(rabbit.speed - HIT_SPEED_PENALTY, RABBIT_MIN);
                  rabbit.hitCooldown = 1.5;
                }
              }
            }
          }
        }

        // Rabbit crosses the finish line first → win
        if (rabbit.totalZ >= FINISH_LINE) {
          gameState = 'won';
          const finishTime = (now - gameStart) * 0.001;
          const isNewBest  = bestTime === null || finishTime < bestTime;
          if (isNewBest) bestTime = saveBestTime(finishTime);
          const winTitle = isNewBest ? 'NEW RECORD!'
            : playerCharacter === 'tortoise' ? 'SLOW & STEADY!' : 'YOU WIN!';
          document.getElementById('overlayTitle').textContent = winTitle;
          document.getElementById('overlayCopy').textContent  =
            (playerCharacter === 'tortoise' ? 'You proved the fable right! ' : '') +
            `Finish: ${finishTime.toFixed(2)}s  —  Press R to restart`;
          document.getElementById('overlayBest').textContent  = bestTime ? `Best: ${bestTime.toFixed(2)}s` : '';
          document.getElementById('overlay').style.display    = 'flex';
        }

        // Tortoise reaches the finish first → lose
        if (gameState === 'playing' && tortoise.totalZ >= FINISH_LINE) {
          gameState = 'lost';
          document.getElementById('overlayTitle').textContent =
            playerCharacter === 'hare' ? 'TORTOISE WINS!' : 'HARE WINS!';
          document.getElementById('overlayCopy').textContent  =
            playerCharacter === 'hare'
              ? 'The tortoise crossed the line first. Press R to retry.'
              : 'The hare woke up just in time! Press R to retry.';
          document.getElementById('overlayBest').textContent  = bestTime ? `Best: ${bestTime.toFixed(2)}s` : '';
          document.getElementById('overlay').style.display    = 'flex';
        }
      }

      // ══ SCENE SETUP ═══════════════════════════════════════════════════════

      const gapZ           = tortoise.totalZ - rabbit.totalZ;
      const tortoiseVisualZ = rabbit.z - gapZ;
      const camX = rabbit.x, camY = 4.5, camZ = rabbit.z + 10;

      const viewMat = Mat4.lookAt(camX, camY, camZ, rabbit.x, 0.3, rabbit.z - 2, 0, 1, 0);

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.uniform1f(uTime, t);

      // ══ PASS 1 — Starry sky (screen-space quad, no depth write) ══════════
      //  Drawn first so 3-D geometry naturally occludes it.

      gl.depthMask(false);
      gl.uniformMatrix4fv(uView, false, Mat4.identity());
      gl.uniformMatrix4fv(uProj, false, orthoMat);
      gl.uniform1i(uMode, 2);
      gl.uniform4fv(uColor, [0.02, 0.02, 0.05, 1.0]);   // midnight navy base
      gl.uniformMatrix4fv(uModel, false, Mat4.scale(canvas.width, canvas.height, 1));
      gl.bindVertexArray(hudMesh.vao);
      gl.drawElements(gl.TRIANGLES, hudMesh.count, gl.UNSIGNED_SHORT, 0);
      gl.depthMask(true);

      // ══ PASS 2 — 3-D scene (perspective + Lambertian + fog) ══════════════

      gl.uniformMatrix4fv(uView, false, viewMat);
      gl.uniformMatrix4fv(uProj, false, projMat);
      gl.uniform3fv(uCamPos,     [camX, camY, camZ]);

      // Pale moonlight from the upper-left
      gl.uniform3fv(uLightDir,   [-0.55, 1.0, 0.35]);
      gl.uniform3fv(uLightColor, [ 0.80, 0.86, 1.00]);
      gl.uniform1f(uAmbient,     0.14);

      // ── Soil ground plane (fills tile gaps, slides with rabbit) ──────────
      gl.uniform1i(uMode, 1);   // noise so soil has natural variation
      gl.uniform4fv(uColor, C_SOIL);
      gl.uniformMatrix4fv(uModel, false,
        Mat4.multiply(Mat4.translate(0, -0.005, rabbit.z), Mat4.scale(1, 1, 80)));
      gl.bindVertexArray(groundMesh.vao);
      gl.drawElements(gl.TRIANGLES, groundMesh.count, gl.UNSIGNED_SHORT, 0);

      // ── Track tiles ───────────────────────────────────────────────────────
      let hudTileType = 0;
      for (const tile of tiles) {
        const dz = tile.z - rabbit.z;
        if (dz > 8 || dz < -56) continue;

        if (tile.type === 1) {
          // Floating, slowly spinning carrot — bobs on a per-lane phase
          const bobY = 0.48 + Math.sin(t * 2.2 + tile.x * 1.7) * 0.10;
          const carrotBase = Mat4.multiply(
            Mat4.translate(tile.x, bobY, tile.z),
            Mat4.rotateY(t * 1.4 + tile.lane * 2.09)
          );
          gl.uniform1i(uMode, 0);
          gl.uniform4fv(uColor, C_CARROT);
          gl.uniformMatrix4fv(uModel, false, carrotBase);
          gl.bindVertexArray(carrotBodyMesh.vao);
          gl.drawElements(gl.TRIANGLES, carrotBodyMesh.count, gl.UNSIGNED_SHORT, 0);
          gl.uniform4fv(uColor, C_CARROT_LEAF);
          gl.uniformMatrix4fv(uModel, false, carrotBase);
          gl.bindVertexArray(carrotLeafMesh.vao);
          gl.drawElements(gl.TRIANGLES, carrotLeafMesh.count, gl.UNSIGNED_SHORT, 0);
        }

        if (tile.type === 2) {
          let obstX = tile.x, obstY, obstSx, obstSy, obstSz, obstColor;
          if (tile.obstKind === 'log') {
            obstY = 0.25; obstSx = 1.4; obstSy = 0.35; obstSz = 0.7;
            obstColor = C_LOG;
          } else if (tile.obstKind === 'animal') {
            obstY = 0.45; obstSx = 0.6; obstSy = 0.9; obstSz = 0.6;
            obstColor = C_ANIMAL;
            obstX += Math.sin((t + tile.row * 0.75) * ANIMAL_SPEED) * ANIMAL_SWAY;
          } else {
            obstY = 0.40; obstSx = 1.0; obstSy = 0.8; obstSz = 1.0;
            obstColor = C_BUSH;
          }
          gl.uniform1i(uMode, 0);
          gl.uniform4fv(uColor, obstColor);
          gl.uniformMatrix4fv(uModel, false,
            Mat4.multiply(Mat4.translate(obstX, obstY, tile.z),
                          Mat4.scale(obstSx, obstSy, obstSz)));
          gl.bindVertexArray(cubeMesh.vao);
          gl.drawElements(gl.TRIANGLES, cubeMesh.count, gl.UNSIGNED_SHORT, 0);
        }

        if (tile.lane === rabbit.lane && Math.abs(dz) < TRACK.tileDepth * 0.5)
          hudTileType = tile.type;
      }

      // ── Finish line gate (visible ~55 u out through the fog) ─────────────
      const finishGapZ    = FINISH_LINE - rabbit.totalZ;
      const finishVisualZ = rabbit.z - finishGapZ;
      if (finishGapZ < 60 && finishGapZ > -4) {
        gl.uniform1i(uMode, 0);
        // Left post — bright white
        gl.uniform4fv(uColor, [1.0, 1.0, 0.92, 1.0]);
        gl.uniformMatrix4fv(uModel, false,
          Mat4.multiply(Mat4.translate(-3.6, 1.75, finishVisualZ), Mat4.scale(0.28, 3.5, 0.28)));
        gl.bindVertexArray(cubeMesh.vao);
        gl.drawElements(gl.TRIANGLES, cubeMesh.count, gl.UNSIGNED_SHORT, 0);
        // Right post — bright white
        gl.uniformMatrix4fv(uModel, false,
          Mat4.multiply(Mat4.translate( 3.6, 1.75, finishVisualZ), Mat4.scale(0.28, 3.5, 0.28)));
        gl.drawElements(gl.TRIANGLES, cubeMesh.count, gl.UNSIGNED_SHORT, 0);
        // Crossbar — bright yellow
        gl.uniform4fv(uColor, [1.0, 0.88, 0.0, 1.0]);
        gl.uniformMatrix4fv(uModel, false,
          Mat4.multiply(Mat4.translate(0, 3.5, finishVisualZ), Mat4.scale(7.2, 0.30, 0.30)));
        gl.drawElements(gl.TRIANGLES, cubeMesh.count, gl.UNSIGNED_SHORT, 0);
      }

      // ── Opponent ──────────────────────────────────────────────────────────
      const oppMesh  = playerCharacter === 'hare' ? tortoiseMesh : rabbitMesh;
      const oppColor = playerCharacter === 'hare' ? C_TORTOISE   : C_RABBIT;
      gl.uniform1i(uMode, 0);
      gl.uniform4fv(uColor, oppColor);
      gl.uniformMatrix4fv(uModel, false, Mat4.translate(tortoise.x, 0, tortoiseVisualZ));
      gl.bindVertexArray(oppMesh.vao);
      gl.drawElements(gl.TRIANGLES, oppMesh.count, gl.UNSIGNED_SHORT, 0);

      // ── Player (flash on hit, glow green while shell is active) ──────────
      const playerMesh  = playerCharacter === 'hare' ? rabbitMesh   : tortoiseMesh;
      const playerColor = playerCharacter === 'hare' ? C_RABBIT     : C_TORTOISE;
      const shellActive = playerCharacter === 'tortoise' && shiftBoost.active;
      const flash = rabbit.hitCooldown > 0 && Math.floor(now / 120) % 2 === 0;
      gl.uniform4fv(uColor, flash ? [1, 1, 1, 1] : shellActive ? [0.40, 1.0, 0.45, 1.0] : playerColor);
      gl.uniformMatrix4fv(uModel, false, Mat4.translate(rabbit.x, rabbit.jumpY, rabbit.z));
      gl.bindVertexArray(playerMesh.vao);
      gl.drawElements(gl.TRIANGLES, playerMesh.count, gl.UNSIGNED_SHORT, 0);

      gl.bindVertexArray(null);

      // ══ PASS 3 — Ortho HUD (flat, no fog) ════════════════════════════════

      gl.disable(gl.DEPTH_TEST);
      gl.uniformMatrix4fv(uView, false, Mat4.identity());
      gl.uniformMatrix4fv(uProj, false, orthoMat);
      gl.uniform1i(uMode, 3);

      const liveBoostExtra = (shiftBoost.active && playerCharacter === 'hare')
        ? shiftBoost.PEAK * Math.exp(-shiftBoost.DECAY * shiftBoost.elapsed) : 0;
      const displaySpeed = rabbit.speed + liveBoostExtra;

      // Speed bar (top-left canvas edge)
      const SX = 20, SY = canvas.height - 32, SW = 280, SH = 14;
      const speedFill = Math.max(1, Math.min(displaySpeed / RABBIT_MAX, 1) * SW);

      gl.bindVertexArray(hudMesh.vao);

      gl.uniform4fv(uColor, [0.06, 0.08, 0.12, 1.0]);
      gl.uniformMatrix4fv(uModel, false,
        Mat4.multiply(Mat4.translate(SX, SY, 0), Mat4.scale(SW, SH, 1)));
      gl.drawElements(gl.TRIANGLES, hudMesh.count, gl.UNSIGNED_SHORT, 0);

      const playerIsHare = playerCharacter === 'hare';
      gl.uniform4fv(uColor, (shiftBoost.active && playerIsHare) ? [0.20, 1.00, 0.50, 1.0]
        : playerIsHare ? [0.28, 0.68, 1.00, 1.0] : [0.40, 0.82, 0.22, 1.0]);
      gl.uniformMatrix4fv(uModel, false,
        Mat4.multiply(Mat4.translate(SX, SY, 0), Mat4.scale(speedFill, SH, 1)));
      gl.drawElements(gl.TRIANGLES, hudMesh.count, gl.UNSIGNED_SHORT, 0);

      // Boost / shell recharge bar (below speed bar)
      const BX = SX, BY = SY - 18, BW = SW, BH = SH;
      // For tortoise shell: bar drains while active, then recharges
      const boostFrac = (shiftBoost.active && !playerIsHare)
        ? Math.max(0, 1.0 - shiftBoost.elapsed / 2.0)
        : shiftBoost.cooldown <= 0 ? 1.0
        : 1.0 - shiftBoost.cooldown / shiftBoost.COOLDOWN;

      gl.uniform4fv(uColor, [0.06, 0.08, 0.12, 1.0]);
      gl.uniformMatrix4fv(uModel, false,
        Mat4.multiply(Mat4.translate(BX, BY, 0), Mat4.scale(BW, BH, 1)));
      gl.drawElements(gl.TRIANGLES, hudMesh.count, gl.UNSIGNED_SHORT, 0);

      gl.uniform4fv(uColor, (shiftBoost.active && playerIsHare)  ? [1.0, 0.75, 0.05, 1.0]
        : (shiftBoost.active && !playerIsHare) ? [0.30, 1.00, 0.40, 1.0]
        : [0.80, 0.38, 0.08, 1.0]);
      gl.uniformMatrix4fv(uModel, false,
        Mat4.multiply(Mat4.translate(BX, BY, 0), Mat4.scale(Math.max(1, boostFrac * BW), BH, 1)));
      gl.drawElements(gl.TRIANGLES, hudMesh.count, gl.UNSIGNED_SHORT, 0);

      gl.bindVertexArray(null);
      gl.enable(gl.DEPTH_TEST);

      // ── DOM HUD ───────────────────────────────────────────────────────────
      if (gameState === 'playing') {
        const elapsed = (now - gameStart) * 0.001;
        document.getElementById('timer').textContent = fmtTime(elapsed);
      }
      document.getElementById('gap').textContent =
        Math.max(0, FINISH_LINE - rabbit.totalZ).toFixed(1) + ' m';

      document.getElementById('speedVal').textContent = displaySpeed.toFixed(1);
      document.getElementById('speedBar').style.width =
        Math.min(displaySpeed / RABBIT_MAX * 100, 100).toFixed(1) + '%';

      const boostReady = shiftBoost.cooldown <= 0;
      document.getElementById('boostBar').style.width =
        (boostFrac * 100).toFixed(1) + '%';
      document.getElementById('boostLabel').textContent = playerIsHare
        ? (shiftBoost.active ? 'BOOST ACTIVE!'
           : boostReady      ? 'SHIFT — BOOST READY'
                             : `BOOST RECHARGING ${shiftBoost.cooldown.toFixed(1)}s`)
        : (shiftBoost.active ? 'SHELL ACTIVE!'
           : boostReady      ? 'SHIFT — SHELL READY'
                             : `SHELL RECHARGING ${shiftBoost.cooldown.toFixed(1)}s`);

      document.getElementById('lane').textContent = LANE_NAMES[rabbit.lane];
      if (window.setTileChip) window.setTileChip(hudTileType);

      requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
  } catch (err) {
    console.error('Fatal:', err.message, err.stack);
    document.body.innerHTML +=
      '<div style="color:red;font-size:20px;margin-top:20px;">ERROR: ' + err.message + '</div>';
  }
})();
