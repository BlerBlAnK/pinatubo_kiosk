const wrap = document.getElementById('gameWrap');
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

const churchImg = new Image();
churchImg.src = 'assets/porac/porac_church.png'; 

const bacolorChurchImg = new Image();
bacolorChurchImg.src = 'assets/bacolor/bacolor_church.png'; // San Guillermo Parish Church — Bacolor-specific landmark art

const robotImg = new Image();
robotImg.src = 'assets/porac/babo_robot.png'; 

const monumentImg = new Image();
monumentImg.src = 'assets/bacolor/Juan_Crisostomo_Soto_Monument.png'; // Juan Crisostomo Soto Monument — Bacolor-specific landmark art

let DPR = window.devicePixelRatio || 1;

let W = 540, H = 960; 

// Ambient scene clock — advances every frame regardless of game state (menus,
// pauses, idle kiosk screens). Clouds/smoke/ash read this instead of
// `state.time` so the environment always feels alive, even before a storm
// starts (state.time only advances once state.running is true).
let ambientTime = 0;

const staticCanvas = document.createElement('canvas');
const staticCtx = staticCanvas.getContext('2d');
let isStaticRendered = false;

function resizeCanvas() {
  const rect = wrap.getBoundingClientRect();
  DPR = window.devicePixelRatio || 1;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  isStaticRendered = false; 
  isMountainCached = false; // volcano scene cache is resolution-dependent, rebuild on resize
}

window.addEventListener('resize', resizeCanvas);

/* ---------------- AUDIO ENGINE ---------------- */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const laharRainTrack = new Audio('assets/audio/rain.mp3');
laharRainTrack.loop = true; 

function playSound(type) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  
  if (type === 'place') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
  } else if (type === 'error') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
    osc.start(now); osc.stop(now + 0.2);
  } else if (type === 'storm') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 2);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 2);
    osc.start(now); osc.stop(now + 2);
  }
}

/* ---------------- TOWN & DIFFICULTY SELECTION STATE ---------------- */
const gameSettings = {
  town: 'bacolor',
  difficulty: 'easy'
};

/* ---------------- DIFFICULTY PROGRESSION LOCK ----------------
   Medium unlocks only after winning on Easy; Hard unlocks only after
   winning on Medium. Progress is persisted in localStorage so it
   survives page reloads on the kiosk. Falls back to an in-memory-only
   object (nothing unlocked) if localStorage is unavailable (e.g.
   private browsing), so the game still works, it just won't remember
   progress between sessions. */
const PROGRESS_STORAGE_KEY = 'laharDefense.difficultyProgress';

function loadDifficultyProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { mediumUnlocked: !!parsed.mediumUnlocked, hardUnlocked: !!parsed.hardUnlocked };
    }
  } catch (e) { /* localStorage unavailable — fall through to defaults */ }
  return { mediumUnlocked: false, hardUnlocked: false };
}

function saveDifficultyProgress() {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(difficultyProgress));
  } catch (e) { /* ignore — progress just won't persist this session */ }
}

let difficultyProgress = loadDifficultyProgress();

function isDifficultyUnlocked(diff) {
  if (diff === 'easy') return true;
  if (diff === 'medium') return difficultyProgress.mediumUnlocked;
  if (diff === 'hard') return difficultyProgress.hardUnlocked;
  return false;
}

// Called from endGame() on a win — unlocks the next tier up, if any, and
// returns the name of the newly-unlocked difficulty (or null) so the
// caller can surface a toast/message about it.
function unlockNextDifficultyOnWin(wonDifficulty) {
  if (wonDifficulty === 'easy' && !difficultyProgress.mediumUnlocked) {
    difficultyProgress.mediumUnlocked = true;
    saveDifficultyProgress();
    return 'medium';
  }
  if (wonDifficulty === 'medium' && !difficultyProgress.hardUnlocked) {
    difficultyProgress.hardUnlocked = true;
    saveDifficultyProgress();
    return 'hard';
  }
  return null;
}

const TOWN_MAPS = {
  bacolor: {
    name: "Bacolor",
    infoText: "Bacolor is famous for the historic San Guillermo Parish Church, which was famously buried to half its height by massive lahar mudflows following the 1991 eruption.",
    churchPos: { x: 270, y: 775 },
    schoolPos: { x: 310, y: 735 },
    monumentPos: { x: 460, y: 700 },
    houses: [
      {x: 140, y: 750, color: '#f0e6d3'}, 
      {x: 400, y: 740, color: '#aee4ff'}, 
      {x: 170, y: 820, color: '#ffdeb3'}, 
      {x: 370, y: 820, color: '#d4edda'}, 
      {x: 210, y: 860, color: '#fcf0b3'}, 
      {x: 330, y: 860, color: '#e8dff5'},
      {x: 90, y: 585, color: '#f7d9c4'},
      {x: 130, y: 640, color: '#e0d8f0'},
      {x: 50, y: 640, color: '#d7ecf5'},
      {x: 155, y: 570, color: '#f5d9d0'},
      {x: 460, y: 585, color: '#c9e4de'},
      {x: 420, y: 640, color: '#f5e0c8'},
      {x: 495, y: 640, color: '#e6d8c3'},
      {x: 385, y: 570, color: '#d8e6d0'}
    ],
    plants: [
      {x: 75, y: 550, size: 9, type: 'tree'}, {x: 95, y: 565, size: 6, type: 'bush'},
      {x: 460, y: 540, size: 10, type: 'tree'}, {x: 485, y: 550, size: 7, type: 'tree'},
      {x: 70, y: 640, size: 8, type: 'tree'}, {x: 85, y: 660, size: 6, type: 'bush'},
      {x: 470, y: 630, size: 7, type: 'bush'}, {x: 495, y: 645, size: 9, type: 'tree'},
      {x: 80, y: 730, size: 10, type: 'tree'}, {x: 60, y: 750, size: 7, type: 'bush'},
      {x: 460, y: 720, size: 8, type: 'tree'}, {x: 480, y: 740, size: 6, type: 'bush'},
      {x: 100, y: 800, size: 9, type: 'tree'}, {x: 85, y: 830, size: 7, type: 'bush'},
      {x: 440, y: 810, size: 9, type: 'tree'}, {x: 460, y: 840, size: 6, type: 'bush'},
      {x: 185, y: 720, size: 6, type: 'bush'}, {x: 350, y: 715, size: 7, type: 'bush'},
      {x: 215, y: 795, size: 8, type: 'tree'}, {x: 325, y: 795, size: 7, type: 'tree'},
      {x: 145, y: 875, size: 6, type: 'bush'}, {x: 395, y: 870, size: 7, type: 'bush'},
      {x: 270, y: 915, size: 8, type: 'tree'}, {x: 250, y: 925, size: 6, type: 'bush'}
    ]
  },
  porac: {
    name: "Porac",
    infoText: "Porac sits directly on the slopes near the volcano peak. It features the notable Babo Robot landmark overseeing mountain ranges and agricultural fields.",
    churchPos: { x: 270, y: 730 }, 
    robotPos: { x: 450, y: 850 },  
    schoolPos: { x: 460, y: 580 },
    houses: [
      {x: 70, y: 680, color: '#ffd6ba'}, 
      {x: 110, y: 740, color: '#e8afb0'}, 
      {x: 450, y: 650, color: '#b5e2fa'}, 
      {x: 480, y: 710, color: '#f5f3bb'}, 
      {x: 220, y: 880, color: '#f2e9e1'}, 
      {x: 310, y: 880, color: '#c5ded7'},
      {x: 55, y: 570, color: '#e6d2b5'},
      {x: 100, y: 610, color: '#d7e8c5'},
      {x: 145, y: 545, color: '#dbead6'},
      {x: 505, y: 620, color: '#f0dccb'},
      {x: 505, y: 560, color: '#f2e0d4'}
    ],
    plants: [
      {x: 50, y: 450, size: 12, type: 'tree'}, {x: 490, y: 460, size: 11, type: 'tree'},
      {x: 120, y: 500, size: 10, type: 'tree'}, {x: 380, y: 510, size: 10, type: 'tree'},
      {x: 190, y: 630, size: 9, type: 'bush'}, {x: 340, y: 620, size: 8, type: 'tree'},
      {x: 150, y: 780, size: 7, type: 'tree'}, {x: 390, y: 790, size: 9, type: 'bush'}
    ]
  },
  angeles: {
    name: "Angeles",
    infoText: "Angeles City faced heavy ashfall burdens during the disaster. It functioned as a critical primary staging ground and evacuation center for affected neighboring areas, with the Abacan River crossing straight through the city.",
    bridgePos: { x: 270, y: 705 },
    houses: [
      {x: 110, y: 730, color: '#f7d6c8'}, {x: 160, y: 730, color: '#e3e4f0'},
      {x: 110, y: 780, color: '#dcf2e9'}, {x: 160, y: 780, color: '#faede1'},
      {x: 380, y: 730, color: '#f0e6ff'}, {x: 430, y: 730, color: '#e2f4ff'},
      {x: 380, y: 780, color: '#ffeedb'}, {x: 430, y: 780, color: '#eafaf1'},
      {x: 110, y: 830, color: '#f9dcd0'}, {x: 160, y: 830, color: '#dbeafe'},
      {x: 380, y: 830, color: '#fef3c7'}, {x: 430, y: 830, color: '#e0f2fe'},
      {x: 90, y: 600, color: '#f5e6d3'}, {x: 140, y: 570, color: '#dfe9f7'},
      {x: 55, y: 560, color: '#f0dcd0'}, {x: 175, y: 620, color: '#e2eef5'},
      {x: 450, y: 600, color: '#dbe9f5'}, {x: 400, y: 570, color: '#f7e4d0'},
      {x: 480, y: 560, color: '#dcecdc'}, {x: 360, y: 620, color: '#f5ead0'}
    ],
    plants: [
      {x: 60, y: 660, size: 7, type: 'bush'}, {x: 480, y: 660, size: 7, type: 'bush'},
      {x: 220, y: 580, size: 8, type: 'tree'}, {x: 320, y: 580, size: 8, type: 'tree'},
      {x: 50, y: 850, size: 9, type: 'tree'}, {x: 490, y: 850, size: 9, type: 'tree'}
    ]
  }
};

/* ---------------- DIFFICULTY PROFILES ---------------- */
// channelCount controls how many independent lahar channels
// generateRandomPaths() creates: Easy = 3, Medium = 4, Hard = 5.
// speedMultipliers must have at least `channelCount` entries — one
// per-channel speed factor, consumed in simulate().
const DIFFICULTY_SETTINGS = {
  easy: {
    startBudget: 1500,
    maxBudget: 1800,
    passiveIncome: 80,
    channelCount: 3,
    speedMultipliers: [0.9, 0.65, 1.1],
    rainIntensity: 1.5
  },
  medium: {
    startBudget: 1200,
    maxBudget: 1500,
    passiveIncome: 60,
    channelCount: 4,
    speedMultipliers: [1.15, 0.85, 1.35, 1.0],
    rainIntensity: 3.5
  },
  hard: {
    startBudget: 900,
    maxBudget: 1200,
    passiveIncome: 45,
    channelCount: 5,
    speedMultipliers: [1.45, 1.15, 1.65, 1.3, 1.5],
    rainIntensity: 7.0
  }
};

/* ---------------- EDUCATIONAL CONTENT ----------------
   Short, self-contained facts used by two lightweight, non-interrupting
   surfaces: a rotating ticker on the pre-game menu screens, and a single
   random pick shown on the end-of-round screen. Kept general (no invented
   statistics) since this is exhibit-facing educational content. */
const LAHAR_FACTS = [
  "\"Lahar\" is a Javanese word for a volcanic mudflow, now used by scientists worldwide.",
  "The June 1991 eruption of Mount Pinatubo is considered one of the largest volcanic eruptions of the 20th century.",
  "Lahars form when loose volcanic ash and debris mix with water — from heavy rain, crater lakes, or melting snow.",
  "Even years after an eruption, heavy rain falling on old ash deposits can still trigger new lahars.",
  "In Bacolor, Pampanga, the historic San Guillermo Parish Church was partially buried by lahar deposits after the Pinatubo eruption.",
  "Barriers like sandbags and check dams work by slowing a lahar's speed and trapping some of its sediment.",
  "Trees and vegetation help stabilize volcanic soil, reducing the speed and force of future mudflows.",
  "Early warning systems and evacuation planning are among the most effective ways to reduce lahar casualties.",
  "Because lahars can strike with little warning, communities near volcanoes often train with evacuation drills.",
  "Pinatubo's lahars kept reshaping river systems in Central Luzon for years after the 1991 eruption."
];

/* ---------------- GAME STATE & CHANNELS ---------------- */
// `kind` still controls placement/HP basics (area tools get Infinity hp —
// they're permanent). `mechanic` controls how the tool actually behaves in
// simulate() — see the per-mechanic branches in the channel loop below:
//   block   — classic point resistance; wears faster the more intense the
//             lahar currently is (physically getting battered by the flow)
//   absorb  — strong resistance while it still has capacity; capacity
//             drains at a FIXED rate over time in contact, independent of
//             lahar intensity (it fills up / overflows rather than being
//             washed away)
//   divert  — doesn't add resistance at all; instead directly cuts that
//             channel's flow speed while in contact. Wears down slowly
//             from fixed manual fatigue, not from the lahar's force.
//   slow    — permanent area effect (trees), never wears.
const TOOL_DEFS = {
  sandbag: { name: 'Sandbag', price: 50, kind: 'point', mechanic: 'block', strength: 18, radius: 34, wearMultiplier: 4.5 },
  shovel:  { name: 'Shovel', price: 120, kind: 'point', mechanic: 'divert', strength: 0, radius: 50, divertPercent: 0.4, fatigueRate: 2.5 },
  tree:    { name: 'Tree', price: 250, kind: 'area', mechanic: 'slow', strength: 0.12, radius: 46 },
  dam:     { name: 'Dike', price: 450, kind: 'point', mechanic: 'block', strength: 90, radius: 55, wearMultiplier: 2 }
};

let state = {
  budget: 1200, budgetMax: 1500, passiveIncome: 60,
  running: false, raining: false, gameOver: false, won: false,
  time: 0, rainAmount: 0, laharVolume: 0, stormTime: 0, stormOver: false, postStormTimer: 0,
  skyTransition: 0, screenShake: 0, lightningFlash: 0,
  lightningPath: [],
  laharProgresses: [0, 0, 0],
  placedItems: [], houses: [], church: null, school: null, robot: null, monument: null, bridge: null,
  particles: [], flowParticles: [], ripples: [],
  debris: [], splashes: [],
  comboCount: 0, lastPlacementTime: -999, maxCombo: 0,
  birdsFleeing: false, birdsFleeStartAmbient: 0,
  carsFleeing: false, carsFleeStartAmbient: 0,
  // Falling sun collectibles
  fallingSuns: [], sunSpawnTimer: 6,
};

let channelPaths = [];
let CHANNEL_LENS = [0, 0, 0];

function pathLength(path) {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i-1].x, path[i].y - path[i-1].y);
  return len;
}

function pointAtProgress(path, t, totalLen) {
  let target = t * totalLen;
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i-1], b = path[i];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + segLen >= target) {
      const local = (target - acc) / segLen;
      return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    acc += segLen;
  }
  const last = path[path.length-1];
  return { x: last.x, y: last.y, angle: 0 };
}

// As a channel's progress nears the bottom of the map, the front of the
// flow "fans out" instead of staying a tight point — this returns how far
// along that fan-out the channel is (0 = still a narrow front, 1 = fully
// spread) plus the resulting contact radius, in world px, used both for
// visual rendering (drawLaharFlow) and for damage contact checks (simulate).
const SPREAD_START = 0.75; // progress at which the front begins spreading
function getChannelSpread(progress) {
  const overFactor = Math.max(0, Math.min(1, (progress - SPREAD_START) / (1 - SPREAD_START)));
  const radius = 40 + overFactor * 150; // grows from 40px up to 190px at full spread
  return { overFactor, radius };
}

/* ---------------- PROCEDURAL PATH GENERATION ---------------- */
// channelCount: how many independent lahar channels to generate — driven by
// the active difficulty's DIFFICULTY_SETTINGS.channelCount (Easy 3 / Medium 4
// / Hard 5). Defaults to 3 for safety if called without an argument.
function generateRandomPaths(channelCount) {
  const craterX = 292;
  const craterY = 180;
  const totalChannels = channelCount || 3;
  
  channelPaths.length = 0;

  for (let c = 0; c < totalChannels; c++) {
    const singlePath = [{ x: craterX, y: craterY }];
    const rows = [300, 480, 650, 780];
    
    // Spread each channel's downstream bias evenly across the town width
    // (140 -> 400), generalizing the old fixed left/center/right layout
    // (which only worked for exactly 3 channels) to any channel count so
    // 4- and 5-channel difficulties fan out sensibly across the map.
    const t = totalChannels > 1 ? c / (totalChannels - 1) : 0.5;
    let baseBiasX = 140 + (400 - 140) * t;

    rows.forEach((y, index) => {
      let randomOffset = (Math.random() - 0.5) * 90;
      let lerpFactor = (index + 1) / rows.length;
      let targetX = craterX + (baseBiasX - craterX) * lerpFactor + randomOffset;
      targetX = Math.max(45, Math.min(495, targetX));
      
      singlePath.push({ x: Math.floor(targetX), y: y });
    });
    
    singlePath.push({ x: 270, y: 850 });
    channelPaths.push(singlePath);
  }

  for (let i = 0; i < channelPaths.length; i++) {
    CHANNEL_LENS[i] = pathLength(channelPaths[i]);
  }
}

let pathSpeedMultipliers = [1.15, 0.85, 1.35];
const DECORATIVE_PLANTS = [];

/* =====================================================================
   MOUNTAIN & SKY SCENE RENDERING
   ---------------------------------------------------------------------
   Everything below draws the volcano, sky, atmosphere and clouds only.
   No gameplay state, collision, budget, or simulation logic lives here —
   this module only ever READS from `state` (e.g. state.time,
   state.skyTransition) to animate lighting/weather/clouds.

   Performance strategy: the volcano geometry (ridges, rock shading,
   crater walls, sparse vegetation) is expensive to paint (gradients,
   many small shapes) but never changes shape, so it is rendered ONCE
   into two offscreen canvases — a "day" and a "night" lighting state —
   and every frame simply cross-fades between them with two drawImage
   calls. Clouds are a single cached soft sprite, stamped a handful of
   times with cheap position math. This keeps the whole scene at a
   near-fixed per-frame cost, well within budget for a 60fps kiosk.
   ===================================================================== */

// Seeded pseudo-random generator (deterministic — same volcano every run)
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Turns a sparse list of anchor points into a smooth, naturally undulating
// ridgeline using quadratic curves through midpoints (Catmull-Rom-ish).
// Kept for elements that SHOULD read as smooth (e.g. water, soft rim glow) —
// no longer used for the mountain silhouette itself (see traceJaggedRidge).
function traceSmoothRidge(context, points, closeToY) {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    context.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }
  const last = points[points.length - 1];
  context.lineTo(last.x, last.y);
  if (closeToY !== undefined) {
    context.lineTo(last.x, closeToY);
    context.lineTo(points[0].x, closeToY);
    context.closePath();
  }
}

// Turns the same sparse anchor points into a RUGGED, broken silhouette.
// Anchors still define the large-scale shape (so the massif's overall
// profile stays intentional), but every segment between anchors is walked
// with straight lineTo() steps and a seeded random jitter — never a smooth
// curve — so the outline reads as fractured volcanic rock rather than a
// rolling hill. `seed` is fixed per call site so day/night paint passes
// (and the matching edge-light stroke) always trace the identical outline.
function traceJaggedRidge(context, points, closeToY, seed, ruggedness) {
  const rand = mulberry32(seed);
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const segCount = 3; // jagged sub-steps per anchor-to-anchor span
    for (let s = 1; s <= segCount; s++) {
      const t = s / segCount;
      let x = a.x + (b.x - a.x) * t;
      let y = a.y + (b.y - a.y) * t;
      if (s < segCount) {
        // Interior points get jittered; the shared anchor point (t===1,
        // i.e. `b` itself) is left untouched so consecutive spans still
        // connect exactly — no visible seams between anchors.
        x += (rand() - 0.5) * ruggedness;
        y += (rand() - 0.5) * ruggedness * 0.65;
        if (rand() < 0.18) y -= ruggedness * (0.5 + rand()); // occasional sharp cliff step
      }
      context.lineTo(x, y);
    }
  }
  if (closeToY !== undefined) {
    const last = points[points.length - 1];
    context.lineTo(last.x, closeToY);
    context.lineTo(points[0].x, closeToY);
    context.closePath();
  }
}

// Fixed seeds so the clipped fill, the shading passes, and the final
// edge-light stroke all trace the exact same jagged outline.
const BACK_RIDGE_SEED = 4411, FRONT_RIDGE_SEED = 9911;

/* ---- Cloud sprites: two soft multi-blob puffs (different silhouettes),
   cached once and reused/stamped many times — cheap per-frame cost ---- */
let cloudSpriteA = null, cloudSpriteB = null;
let cloudSprite = null; // kept for backward-compat reference (== cloudSpriteA)

function paintCloudBlob(targetCanvas, seed, blobCount) {
  const w = targetCanvas.width, h = targetCanvas.height;
  const cctx = targetCanvas.getContext('2d');
  const rand = mulberry32(seed);
  for (let i = 0; i < blobCount; i++) {
    const bx = w * (0.18 + rand() * 0.64);
    const by = h * (0.38 + rand() * 0.32);
    const br = w * (0.14 + rand() * 0.15);
    const g = cctx.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0, 'rgba(255,255,255,0.92)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cctx.fillStyle = g;
    cctx.beginPath(); cctx.ellipse(bx, by, br, br * 0.62, 0, 0, Math.PI * 2); cctx.fill();
  }
}

function buildCloudSprite() {
  cloudSpriteA = document.createElement('canvas');
  cloudSpriteA.width = 260; cloudSpriteA.height = 145;
  paintCloudBlob(cloudSpriteA, 4242, 6);

  cloudSpriteB = document.createElement('canvas');
  cloudSpriteB.width = 210; cloudSpriteB.height = 120;
  paintCloudBlob(cloudSpriteB, 7788, 5);

  cloudSprite = cloudSpriteA;
}

// Fixed cloud layout (varied depth/speed/size for gentle multi-layer parallax).
// Layers with larger `speed` feel closer (drift faster) — classic parallax cue.
const CLOUD_LAYER = [
  { x: 20,  y: 78,  scale: 1.05, speed: 2.0,  alpha: 0.5,  sprite: 'A' },
  { x: 250, y: 50,  scale: 0.7,  speed: 1.3,  alpha: 0.38, sprite: 'B' },
  { x: 420, y: 115, scale: 0.9,  speed: 2.6,  alpha: 0.42, sprite: 'A' },
  { x: 140, y: 160, scale: 0.55, speed: 1.7,  alpha: 0.3,  sprite: 'B' },
  { x: 340, y: 200, scale: 0.4,  speed: 3.1,  alpha: 0.26, sprite: 'A' },
  { x: 60,  y: 235, scale: 0.65, speed: 1.0,  alpha: 0.22, sprite: 'B' }
];

// updateClouds() — stateless, like updateSmoke()/updateAsh(): cloud position
// is derived purely from ambientTime inside drawClouds(), so there is no
// per-frame array to mutate. Present for symmetry/readability at the call site.
function updateClouds(dt) { /* stateless — position derived from ambientTime */ }

function drawClouds(context, dayFactor) {
  if (!cloudSpriteA) return;
  context.save();
  CLOUD_LAYER.forEach(c => {
    const sprite = c.sprite === 'B' ? cloudSpriteB : cloudSpriteA;
    const cw = sprite.width * c.scale, ch = sprite.height * c.scale;
    // Continuous wrap-around drift driven by the ambient clock (never
    // static, never resets abruptly — smoothly re-enters from the left).
    const drift = (ambientTime * c.speed * 4) % (W + cw);
    const x = ((c.x + drift) % (W + cw)) - cw * 0.5;
    context.globalAlpha = c.alpha * (0.55 + 0.45 * dayFactor);
    context.drawImage(sprite, x, c.y, cw, ch);
  });
  context.restore();
}

// Precomputed sparse rock/ash speckle field (subtle shading, not per-pixel noise)
function buildSpeckles(rand, minX, maxX, topY, baseY, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: minX + rand() * (maxX - minX),
      y: topY + rand() * (baseY - topY),
      size: 1 + rand() * 2.2,
      alpha: 0.04 + rand() * 0.08
    });
  }
  return out;
}

// Crater outlet — matches the lahar channel origin in generateRandomPaths()
// so the mudflow visually emerges straight out of the breached crater wall.
const CRATER_X = 292, CRATER_Y = 180;

/* =====================================================================
   VOLCANIC SMOKE & ASH — quiet, continuous crater degassing
   ---------------------------------------------------------------------
   Design goals: always drifting, never explosive, cheap every frame.

   Instead of a mutable particle pool that needs per-frame spawn/despawn
   bookkeeping (extra allocations, GC pressure — bad on a kiosk box), each
   puff/speck is a small set of fixed parameters chosen once at startup by
   a seeded RNG. Its position on any given frame is a pure function of
   `ambientTime`, using `life = (ambientTime * speed + offset) % 1` as a
   repeating 0→1 cycle. This gives perfectly smooth, endlessly looping
   motion with zero array mutation — just math — and staggered `offset`
   values keep the puffs from ever appearing to spawn/pop in sync.
   ===================================================================== */

// One soft round gray-white blob, cached once and stamped (scaled + faded)
// for every smoke puff — mirrors the cloud sprite strategy above.
let smokeSprite = null;
function buildSmokeSprite() {
  const w = 160, h = 160;
  smokeSprite = document.createElement('canvas');
  smokeSprite.width = w; smokeSprite.height = h;
  const sctx = smokeSprite.getContext('2d');
  const g = sctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(214,209,201,0.85)');
  g.addColorStop(0.5, 'rgba(190,185,178,0.42)');
  g.addColorStop(1, 'rgba(190,185,178,0)');
  sctx.fillStyle = g;
  sctx.beginPath(); sctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); sctx.fill();
}

// Fixed per-puff parameters (seeded — same gentle plume every run).
// Three implicit "layers" emerge naturally from the speed/scale spread:
// slow big distant-looking puffs vs faster smaller near ones.
const SMOKE_PUFFS = (function buildSmokePuffParams() {
  const rand = mulberry32(9001);
  const count = 11;
  const arr = [];
  for (let i = 0; i < count; i++) {
    arr.push({
      offset: i / count,                       // staggers each puff's cycle start
      speed: 0.035 + rand() * 0.02,             // full rise cycles per second
      driftX: (rand() - 0.5) * 60 + 18,         // net sideways wind push over lifetime
      swayAmp: 7 + rand() * 9,                  // gentle twist amplitude
      swayFreq: 0.8 + rand() * 1.0,             // twist frequency
      swayPhase: rand() * Math.PI * 2,
      startScale: 0.22 + rand() * 0.12,
      endScale: 1.0 + rand() * 0.55,
      riseHeight: 130 + rand() * 90,            // how high above the crater it climbs
      xJitter: (rand() - 0.5) * 12
    });
  }
  return arr;
})();

// Tiny embers/ash flecks that hover very close to the crater mouth —
// darker near the vent, lightening as they drift a short distance up.
const ASH_PARTICLES = (function buildAshParams() {
  const rand = mulberry32(5150);
  const count = 14;
  const arr = [];
  for (let i = 0; i < count; i++) {
    arr.push({
      offset: i / count,
      speed: 0.09 + rand() * 0.09,
      driftX: (rand() - 0.5) * 24,
      swayAmp: 3 + rand() * 4,
      swayFreq: 1.4 + rand() * 1.4,
      riseHeight: 26 + rand() * 30,
      xJitter: (rand() - 0.5) * 30,
      radius: 0.6 + rand() * 1.1
    });
  }
  return arr;
})();

// updateSmoke() — intentionally a no-op. Because puff position is derived
// purely from ambientTime (see SMOKE_PUFFS docblock above), there is no
// mutable state to advance each frame. Kept as an explicit function so the
// render loop's intent stays readable and the system stays easy to extend
// later (e.g. wind gusts) without restructuring drawSmoke().
function updateSmoke(dt) { /* stateless — see SMOKE_PUFFS docblock */ }

// Draws the rising, twisting smoke plume. Cheap: just N drawImage calls
// with precomputed alpha/scale, no gradients or paths built per frame.
function drawSmoke(context, dayFactor) {
  if (!smokeSprite) return;
  context.save();
  SMOKE_PUFFS.forEach(p => {
    const life = ((ambientTime * p.speed) + p.offset) % 1;
    const y = CRATER_Y - 8 - life * p.riseHeight;
    // Twist grows with height, wind drift accumulates linearly — the two
    // combined read as smoke curling as it climbs and leans with the wind.
    const sway = Math.sin(life * Math.PI * 2 * p.swayFreq + p.swayPhase) * p.swayAmp * life;
    const wind = p.driftX * life;
    const x = CRATER_X + p.xJitter + sway + wind;
    const scale = p.startScale + (p.endScale - p.startScale) * life;
    // Fade in quickly near the vent, fade out well before the top so
    // puffs never "pop" in or out of existence.
    let alpha = Math.min(1, life * 5) * Math.min(1, (1 - life) * 2.2);
    alpha *= 0.5; // keep it subtle — quiet degassing, not a plume of ash
    if (alpha <= 0.01) return;
    const size = smokeSprite.width * scale;
    context.globalAlpha = alpha * (0.75 + 0.25 * dayFactor);
    context.drawImage(smokeSprite, x - size / 2, y - size / 2, size, size);
  });
  context.restore();
}

// updateAsh() — same stateless design as updateSmoke(); kept for symmetry
// and readability at the call site.
function updateAsh(dt) { /* stateless — see ASH_PARTICLES docblock */ }

// Tiny floating ash flecks close to the crater mouth: dark charcoal near
// the vent, lightening to pale gray-brown as they lift and fade.
function drawAshParticles(context) {
  context.save();
  ASH_PARTICLES.forEach(p => {
    const life = ((ambientTime * p.speed) + p.offset) % 1;
    const y = CRATER_Y - 4 - life * p.riseHeight;
    const x = CRATER_X + p.xJitter + p.driftX * life + Math.sin(life * Math.PI * 2 * p.swayFreq) * p.swayAmp * life;
    const alpha = Math.min(1, life * 5) * Math.min(1, (1 - life) * 3);
    if (alpha <= 0.01) return;
    context.globalAlpha = alpha * 0.55;
    context.fillStyle = life < 0.35 ? '#3f3a35' : '#9c958b';
    context.beginPath();
    context.arc(x, y, p.radius, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

// Scatters irregular charcoal/basalt-gray rock-face blobs over the massif.
// Biased toward the upper slopes (summit stays "mostly barren" per the
// brief), tapering off lower down where vegetation and warmer tones take
// over. Each blob is an irregular hand-drawn-feeling polygon, not a circle,
// so it reads as a distinct fractured rock face rather than a soft stain.
function drawVolcanicRockPatches(context, isNight, seed) {
  const rand = mulberry32(seed);
  const count = 22;
  for (let i = 0; i < count; i++) {
    const px = 20 + rand() * 500;
    const upperBias = rand() * rand(); // squared distribution -> denser near summit
    const py = 170 + upperBias * 260;
    const radius = 10 + rand() * 24;
    const dark = rand() < 0.5;
    context.fillStyle = isNight
      ? (dark ? 'rgba(6,7,9,0.32)' : 'rgba(55,59,66,0.20)')
      : (dark ? 'rgba(28,24,20,0.30)' : 'rgba(88,84,78,0.22)');
    const sides = 6 + Math.floor(rand() * 3);
    context.beginPath();
    for (let s = 0; s < sides; s++) {
      const angle = (s / sides) * Math.PI * 2;
      const r = radius * (0.65 + rand() * 0.6);
      const x = px + Math.cos(angle) * r;
      const y = py + Math.sin(angle) * r * 0.7;
      if (s === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
  }
}

/* ---- Paints the full volcano scene once into an offscreen canvas ----
   mode: 'day'  -> warm, high-contrast sunlit rendering
         'night' -> cool, dark storm-lit rendering (drawn as a fade-in
                    overlay on top of the day layer, see buildMountainCache) */
function paintMountainScene(context, mode) {
  const isNight = mode === 'night';
  context.clearRect(0, 0, W, H);

  /* ---- Distant hazy back range: low contrast, blue-shifted, atmospheric perspective ---- */
  const backAnchors = [
    { x: -10, y: 268 }, { x: 55, y: 205 }, { x: 120, y: 235 }, { x: 175, y: 190 },
    { x: 235, y: 165 }, { x: 300, y: 150 }, { x: 355, y: 175 }, { x: 410, y: 200 },
    { x: 465, y: 225 }, { x: 550, y: 270 }
  ];
  context.save();
  traceJaggedRidge(context, backAnchors, 420, BACK_RIDGE_SEED, 5); // subtle jitter — distant/hazy, atmospheric perspective already softens it
  const backGrad = context.createLinearGradient(0, 140, 0, 420);
  if (isNight) { backGrad.addColorStop(0, '#232c39'); backGrad.addColorStop(1, '#161c26'); }
  else { backGrad.addColorStop(0, '#aab8c2'); backGrad.addColorStop(1, '#8b98a3'); }
  context.fillStyle = backGrad;
  context.globalAlpha = isNight ? 1 : 0.9;
  context.fill();
  const hazeGrad = context.createLinearGradient(0, 140, 0, 420);
  hazeGrad.addColorStop(0, isNight ? 'rgba(180,200,220,0.12)' : 'rgba(240,246,250,0.45)');
  hazeGrad.addColorStop(1, 'rgba(240,246,250,0)');
  context.fillStyle = hazeGrad;
  context.globalAlpha = 1;
  context.fill();
  context.restore();

  /* ---- Main Pinatubo massif: broad shoulders rising to an asymmetric,
     gently domed summit with a breached crater rim (real profile, not a triangle) ---- */
  const frontAnchors = [
    { x: -10, y: 345 }, { x: 45, y: 300 }, { x: 95, y: 255 }, { x: 140, y: 275 },
    { x: 175, y: 225 }, { x: 205, y: 205 }, { x: 235, y: 190 },
    { x: 262, y: 172 }, { x: CRATER_X - 22, y: 158 },
    { x: CRATER_X - 6, y: 168 }, { x: CRATER_X + 6, y: 168 }, { x: CRATER_X + 22, y: 156 }, // breach notch
    { x: 330, y: 168 }, { x: 365, y: 188 }, { x: 400, y: 210 }, { x: 435, y: 235 },
    { x: 475, y: 268 }, { x: 550, y: 320 }
  ];

  context.save();
  traceJaggedRidge(context, frontAnchors, 500, FRONT_RIDGE_SEED, 16); // rugged, broken silhouette — no smooth curves
  context.clip();

  // Diagonal key light: sun from upper-left -> bright left flank, dark right flank.
  // Stops now weave basalt gray/charcoal in with the volcanic browns instead
  // of an all-warm-tan palette, per the "charcoal/ash/basalt gray" brief.
  const lightGrad = context.createLinearGradient(0, 140, 540, 420);
  if (isNight) {
    lightGrad.addColorStop(0, '#3a4048'); lightGrad.addColorStop(0.45, '#262c34'); lightGrad.addColorStop(1, '#12161c');
  } else {
    lightGrad.addColorStop(0, '#a89484'); lightGrad.addColorStop(0.3, '#7d7466');
    lightGrad.addColorStop(0.55, '#5a5248'); lightGrad.addColorStop(0.8, '#3d372f'); lightGrad.addColorStop(1, '#231f1a');
  }
  context.fillStyle = lightGrad;
  context.fillRect(0, 140, 540, 380);

  // Volcanic rock patches — irregular charcoal/basalt-gray blobs, denser near
  // the barren summit, thinning lower down. Breaks up the gradient into
  // distinct rock faces so the surface doesn't read as one smooth-shaded mass.
  drawVolcanicRockPatches(context, isNight, 6060);

  // Vertical falloff: hazier near the summit, more grounded/shadowed near the base
  const depthGrad = context.createLinearGradient(0, 150, 0, 500);
  depthGrad.addColorStop(0, isNight ? 'rgba(255,255,255,0.05)' : 'rgba(255,246,225,0.22)');
  depthGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
  depthGrad.addColorStop(1, isNight ? 'rgba(0,0,0,0.35)' : 'rgba(40,28,18,0.28)');
  context.fillStyle = depthGrad;
  context.fillRect(0, 140, 540, 380);

  // Soft ridge/valley striations following the slope (rock structure, no outlines)
  const ridgeRand = mulberry32(7331);
  for (let i = 0; i < 26; i++) {
    const rx = 20 + ridgeRand() * 500;
    const topY = 158 + (0.08 + ridgeRand() * 0.12) * 260;
    const sway = (ridgeRand() - 0.5) * 26;
    context.strokeStyle = ridgeRand() > 0.5
      ? (isNight ? 'rgba(0,0,0,0.18)' : 'rgba(40,28,18,0.16)')
      : (isNight ? 'rgba(255,255,255,0.04)' : 'rgba(255,244,222,0.14)');
    context.lineWidth = 3 + ridgeRand() * 5;
    context.beginPath();
    context.moveTo(rx, topY);
    context.quadraticCurveTo(rx + sway, (topY + 460) / 2, rx + sway * 1.6, 470);
    context.stroke();
  }

  // Subtle rock/ash grain — sparse, precomputed, drawn once into the cache
  buildSpeckles(mulberry32(2024), 20, 520, 165, 460, 260).forEach(s => {
    context.fillStyle = isNight ? 'rgba(0,0,0,1)' : 'rgba(45,32,22,1)';
    context.globalAlpha = s.alpha;
    context.fillRect(s.x, s.y, s.size, s.size);
  });
  context.globalAlpha = 1;

  // Sparse vegetation strictly on the lower slopes — summit stays barren
  if (!isNight) {
    const veg = mulberry32(555);
    for (let i = 0; i < 34; i++) {
      const vx = 20 + veg() * 500;
      const vy = 360 + veg() * 130;
      const vs = 3 + veg() * 4;
      context.fillStyle = `rgba(58,74,44,${0.25 + veg() * 0.25})`;
      context.beginPath();
      context.ellipse(vx, vy, vs, vs * 0.6, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  // ---- Cracks & erosion lines: thin, irregular fracture lines following
  // gravity down the slope. Kept sparse and low-contrast so they read as
  // geological detail rather than noise or outline work.
  const crackRand = mulberry32(3141);
  for (let i = 0; i < 9; i++) {
    const startX = 40 + crackRand() * 460;
    const startY = 200 + crackRand() * 90;
    context.strokeStyle = isNight ? 'rgba(0,0,0,0.30)' : 'rgba(35,24,16,0.22)';
    context.lineWidth = 1 + crackRand() * 1.2;
    context.beginPath();
    context.moveTo(startX, startY);
    let cx = startX, cy = startY;
    const segments = 3 + Math.floor(crackRand() * 3);
    for (let s = 0; s < segments; s++) {
      cx += (crackRand() - 0.35) * 22;
      cy += 14 + crackRand() * 20;
      context.lineTo(cx, cy);
    }
    context.stroke();
  }

  // ---- Rocky ledges: small flat-topped outcrops that catch the key light
  // on their upper edge and cast a soft shadow beneath — reads as a cliff
  // step without needing a hard black outline.
  const ledgeRand = mulberry32(5566);
  for (let i = 0; i < 8; i++) {
    const lx = 30 + ledgeRand() * 480;
    const ly = 230 + ledgeRand() * 200;
    const lw = 14 + ledgeRand() * 22;
    context.fillStyle = isNight ? 'rgba(0,0,0,0.22)' : 'rgba(35,24,16,0.18)';
    context.beginPath();
    context.ellipse(lx + 2, ly + 3, lw * 0.55, 3.5, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = isNight ? 'rgba(140,150,165,0.16)' : 'rgba(255,240,215,0.4)';
    context.lineWidth = 1.4;
    context.beginPath();
    context.moveTo(lx - lw * 0.5, ly);
    context.lineTo(lx + lw * 0.5, ly - 2);
    context.stroke();
  }

  // Small cliff/boulder clusters flanking the crater breach for scale
  const boulderRand = mulberry32(8892);
  for (let i = 0; i < 10; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const bx = CRATER_X + side * (30 + boulderRand() * 60);
    const by = 190 + boulderRand() * 40;
    const bs = 3 + boulderRand() * 5;
    context.fillStyle = isNight ? 'rgba(10,10,12,0.55)' : 'rgba(50,38,28,0.5)';
    context.beginPath(); context.ellipse(bx, by, bs, bs * 0.75, boulderRand(), 0, Math.PI * 2); context.fill();
    context.fillStyle = isNight ? 'rgba(60,66,76,0.25)' : 'rgba(200,180,150,0.35)';
    context.beginPath(); context.ellipse(bx - bs * 0.3, by - bs * 0.3, bs * 0.4, bs * 0.3, 0, 0, Math.PI * 2); context.fill();
  }

  // Crater walls — broken, cracked rock rim instead of a clean ellipse.
  // Built from a jittered radius-per-angle polygon (deterministic seed) so
  // the breach reads as collapsed/fractured volcanic rock, matching the
  // "broken rim, cracked edges" brief, while the radial gradient still
  // gives it real depth.
  context.save();
  const craterRand = mulberry32(3311);
  const craterPts = [];
  const craterSides = 20;
  for (let s = 0; s < craterSides; s++) {
    const angle = (s / craterSides) * Math.PI * 2;
    let rMul = 1 + (craterRand() - 0.5) * 0.4;
    if (craterRand() < 0.2) rMul *= 0.72; // occasional deep notch — cracked edge
    const x = CRATER_X + Math.cos(angle) * 46 * rMul;
    const y = CRATER_Y + 6 + Math.sin(angle) * 17 * rMul;
    craterPts.push({ x, y });
  }
  context.beginPath();
  craterPts.forEach((p, i) => { if (i === 0) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y); });
  context.closePath();
  const crWallGrad = context.createRadialGradient(CRATER_X - 8, CRATER_Y, 2, CRATER_X, CRATER_Y + 6, 46);
  crWallGrad.addColorStop(0, isNight ? 'rgba(10,12,16,0.9)' : 'rgba(35,25,18,0.85)');
  crWallGrad.addColorStop(0.7, isNight ? 'rgba(20,22,28,0.6)' : 'rgba(60,46,34,0.55)');
  crWallGrad.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = crWallGrad;
  context.fill();
  context.restore();

  // Rim highlight catching the upper-left light — traced along the same
  // jagged rim points (upper-left arc only) so the highlight follows the
  // broken rock rather than implying a smooth crater lip.
  context.strokeStyle = isNight ? 'rgba(150,165,190,0.18)' : 'rgba(255,244,220,0.55)';
  context.lineWidth = 2;
  context.beginPath();
  const rimStart = Math.floor(craterSides * 0.5), rimEnd = Math.floor(craterSides * 0.92);
  for (let s = rimStart; s <= rimEnd; s++) {
    const p = craterPts[s % craterSides];
    if (s === rimStart) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y);
  }
  context.stroke();

  context.restore(); // end clip

  // Faint edge-light along the silhouette (no cartoon outline — just a rim glow).
  // Same seed/ruggedness as the clip fill above so the glow hugs the actual
  // jagged edge instead of a smoothed approximation of it.
  context.save();
  traceJaggedRidge(context, frontAnchors, undefined, FRONT_RIDGE_SEED, 16);
  context.strokeStyle = isNight ? 'rgba(180,195,215,0.10)' : 'rgba(255,240,210,0.35)';
  context.lineWidth = 1.5;
  context.stroke();
  context.restore();
}

let mountainCanvasDay = null, mountainCanvasNight = null;
let isMountainCached = false;

// Builds (or rebuilds, on resize) the two cached lighting states of the volcano.
// This is the only place the expensive gradient/shape painting happens.
function buildMountainCache() {
  if (!mountainCanvasDay) {
    mountainCanvasDay = document.createElement('canvas');
    mountainCanvasNight = document.createElement('canvas');
  }
  [mountainCanvasDay, mountainCanvasNight].forEach(c => { c.width = canvas.width; c.height = canvas.height; });

  const dctx = mountainCanvasDay.getContext('2d');
  const nctx = mountainCanvasNight.getContext('2d');
  dctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  nctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  paintMountainScene(dctx, 'day');
  paintMountainScene(nctx, 'night');

  if (!cloudSpriteA) buildCloudSprite();
  if (!smokeSprite) buildSmokeSprite();
  isMountainCached = true;
}

/* ---------------- LIVING ENVIRONMENT: PLANTS, GRASS & BIRDS ----------------
   Small ambient-life touches so the pre-storm scene reads as alive rather
   than a static backdrop. All three follow the same "stateless, derived
   from ambientTime" pattern as the smoke/ash/cloud systems above — cheap,
   deterministic, and immune to frame-hitches since there's no per-frame
   accumulation that could drift. ---- */

// Trees/bushes sway from their base using a per-plant fixed phase offset
// (derived from array index) so the whole scene doesn't sway in lockstep
// like a stiff sheet — reads as individual gusts catching each plant.
function drawPlants(context) {
  context.save();
  DECORATIVE_PLANTS.forEach((p, i) => {
    const phase = i * 0.73; // arbitrary spacing, keeps plants out of sync
    const sway = Math.sin(ambientTime * 1.1 + phase) * (p.type === 'tree' ? 0.055 : 0.095);
    context.save();
    context.translate(p.x, p.y);
    context.rotate(sway);
    if (p.type === 'tree') {
      context.fillStyle = '#654321'; context.fillRect(-2, 2, 4, 8);
      context.fillStyle = '#38761d'; context.beginPath(); context.arc(0, -6, p.size, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#4f9d24'; context.beginPath(); context.arc(-2, -8, p.size * 0.8, 0, Math.PI * 2); context.fill();
    } else {
      context.fillStyle = '#274e13'; context.beginPath(); context.arc(-3, 0, p.size, 0, Math.PI * 2); context.fill();
      context.beginPath(); context.arc(3, 1, p.size * 0.9, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#3eb030'; context.beginPath(); context.arc(0, -3, p.size * 0.85, 0, Math.PI * 2); context.fill();
    }
    context.restore();
  });
  context.restore();
}

// Sparse scattered grass tufts across the town's green field. Fixed seeded
// layout (built once) so the field doesn't relayout every frame — only the
// sway angle changes, driven by ambientTime.
const GRASS_TUFTS = (function buildGrassTufts() {
  const rand = mulberry32(2266);
  const arr = [];
  const count = 70;
  for (let i = 0; i < count; i++) {
    arr.push({
      x: 20 + rand() * 500,
      y: 520 + rand() * 410,
      height: 5 + rand() * 6,
      phase: rand() * Math.PI * 2,
      speed: 0.9 + rand() * 0.6,
      tone: rand() < 0.5 ? '#3f5636' : '#5a7548'
    });
  }
  return arr;
})();

function drawGrassTufts(context) {
  context.save();
  context.lineCap = 'round';
  GRASS_TUFTS.forEach(g => {
    const sway = Math.sin(ambientTime * g.speed + g.phase) * 3.2;
    context.strokeStyle = g.tone;
    context.lineWidth = 1.6;
    context.beginPath();
    context.moveTo(g.x - 3, g.y);
    context.quadraticCurveTo(g.x + sway, g.y - g.height * 0.6, g.x + sway * 1.4, g.y - g.height);
    context.stroke();
    context.beginPath();
    context.moveTo(g.x + 3, g.y);
    context.quadraticCurveTo(g.x + sway * 0.8, g.y - g.height * 0.55, g.x + sway * 1.1, g.y - g.height * 0.95);
    context.stroke();
  });
  context.restore();
}

// Birds: lazy loop-de-loop flight before the storm, then a single one-shot
// panic-flee animation the instant rain begins (state.birdsFleeing +
// state.birdsFleeStartAmbient are set in the rainPanel click handler).
const BIRDS = (function buildBirds() {
  const rand = mulberry32(4004);
  const count = 4;
  const arr = [];
  for (let i = 0; i < count; i++) {
    arr.push({
      baseY: 90 + rand() * 90,
      speed: 10 + rand() * 6,
      ampY: 10 + rand() * 14,
      freq: 0.4 + rand() * 0.3,
      phase: rand() * Math.PI * 2,
      offsetStart: rand() * W,
      scale: 0.8 + rand() * 0.5
    });
  }
  return arr;
})();

function drawBirdShape(context, x, y, scale, wingPhase, alpha) {
  context.save();
  context.globalAlpha = alpha;
  context.translate(x, y);
  context.scale(scale, scale);
  const flap = Math.sin(wingPhase) * 6;
  context.strokeStyle = 'rgba(50,45,40,0.75)';
  context.lineWidth = 1.6;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(-8, 0); context.quadraticCurveTo(-3, -flap, 0, 0);
  context.quadraticCurveTo(3, -flap, 8, 0);
  context.stroke();
  context.restore();
}

function drawBirds(context) {
  if (state.gameOver) return;
  if (!state.birdsFleeing) {
    if (state.raining) return; // safety fallback — flee wasn't triggered, just hide
    BIRDS.forEach(b => {
      const x = ((ambientTime * b.speed + b.offsetStart) % (W + 40)) - 20;
      const y = b.baseY + Math.sin(ambientTime * b.freq + b.phase) * b.ampY;
      drawBirdShape(context, x, y, b.scale, ambientTime * 6 + b.phase, 0.8);
    });
  } else {
    const elapsed = ambientTime - state.birdsFleeStartAmbient;
    if (elapsed > 2.6) return; // long gone — stop drawing entirely
    BIRDS.forEach((b, i) => {
      const launchX = ((state.birdsFleeStartAmbient * b.speed + b.offsetStart) % (W + 40)) - 20;
      const launchY = b.baseY + Math.sin(state.birdsFleeStartAmbient * b.freq + b.phase) * b.ampY;
      const x = launchX + elapsed * (140 + i * 18);
      const y = launchY - elapsed * 130;
      const alpha = Math.max(0, 0.8 - elapsed / 2.2);
      drawBirdShape(context, x, y, b.scale, ambientTime * 11 + b.phase, alpha);
    });
  }
}

// Bridge traffic (Angeles only): a handful of small cars looping back and
// forth across the bridge deck before the storm, exactly like the birds'
// lazy pre-storm loop above. The instant the storm starts, every car
// "guns it" straight off the nearest edge of the bridge and fades out —
// same one-shot flee pattern as drawBirds(), just horizontal instead of
// vertical. Purely decorative: no interaction with budget/defenses/damage.
// Shared half-width for the bridge deck, used by both drawBridge() and
// drawCars() so the traffic always matches the deck's actual span. Set
// wide enough that the deck bleeds off both edges of the 540px-wide
// screen, reading as a bridge that crosses the whole town rather than a
// short span floating in the middle.
const BRIDGE_SPAN_HALF = 300;
// Half-width of the road deck — widened to comfortably fit 4 lanes
// (2 each direction) instead of the old single-lane-width strip.
const BRIDGE_ROAD_HALF = 19;

const CAR_COLORS = ['#e63946', '#2a9d8f', '#f4a261', '#e9c46a'];
// Four cars, one per lane: two lanes each direction (inner lane closer
// to the median, outer lane closer to the railing), matching the
// widened 4-lane deck drawn in drawBridgeSpan.
const BRIDGE_LANE_OFFSETS = [
  { dir: 1,  lane: -BRIDGE_ROAD_HALF * 0.5 },  // dir 1, inner lane
  { dir: 1,  lane: -BRIDGE_ROAD_HALF * 0.85 }, // dir 1, outer lane
  { dir: -1, lane: BRIDGE_ROAD_HALF * 0.5 },   // dir -1, inner lane
  { dir: -1, lane: BRIDGE_ROAD_HALF * 0.85 }   // dir -1, outer lane
];
const BRIDGE_CARS = (function buildBridgeCars() {
  const rand = mulberry32(6161);
  const arr = [];
  BRIDGE_LANE_OFFSETS.forEach(({ dir, lane }) => {
    arr.push({
      dir,
      lane,
      speed: 55 + rand() * 30,
      offsetStart: rand() * 800,
      color: CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)]
    });
  });
  return arr;
})();

function drawCarShape(context, x, y, dir, color, alpha) {
  context.save();
  context.globalAlpha = alpha;
  context.translate(x, y);
  context.scale(dir, 1); // flips the car to face its direction of travel
  context.fillStyle = color;
  roundRectCtx(context, -12, -5, 24, 10, 3);
  context.fill();
  context.fillStyle = 'rgba(255,255,255,0.55)';
  context.fillRect(2, -3.5, 6, 5.5);
  context.fillStyle = '#1f2937';
  context.beginPath(); context.arc(-7, 5, 2.3, 0, Math.PI * 2); context.fill();
  context.beginPath(); context.arc(7, 5, 2.3, 0, Math.PI * 2); context.fill();
  context.restore();
}

function drawCars(context) {
  if (gameSettings.town !== 'angeles' || !state.bridge || state.bridge.lost || state.gameOver) return;
  const b = state.bridge;
  const spanHalf = BRIDGE_SPAN_HALF;
  const leftX = b.x - spanHalf - 30, rightX = b.x + spanHalf + 30;
  const roadLen = rightX - leftX;

  if (!state.carsFleeing) {
    if (state.raining) return; // safety fallback — flee wasn't triggered, just hide
    BRIDGE_CARS.forEach(c => {
      const travel = (ambientTime * c.speed + c.offsetStart) % roadLen;
      const x = c.dir === 1 ? (leftX + travel) : (rightX - travel);
      const y = b.y + c.lane;
      drawCarShape(context, x, y, c.dir, c.color, 0.95);
    });
  } else {
    const elapsed = ambientTime - state.carsFleeStartAmbient;
    if (elapsed > 2.2) return; // long gone — stop drawing entirely
    BRIDGE_CARS.forEach(c => {
      const launchTravel = (state.carsFleeStartAmbient * c.speed + c.offsetStart) % roadLen;
      const launchX = c.dir === 1 ? (leftX + launchTravel) : (rightX - launchTravel);
      const x = launchX + c.dir * elapsed * (c.speed * 3.4);
      const y = b.y + c.lane;
      const alpha = Math.max(0, 0.95 - elapsed / 1.8);
      drawCarShape(context, x, y, c.dir, c.color, alpha);
    });
  }
}

/* ---------------- FLOW CONTROLLER POPUPS ---------------- */
function showObjectiveSelection() {
  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById('objectiveCard').style.display = 'block';
  document.getElementById('townCard').style.display = 'none';
  document.getElementById('difficultyCard').style.display = 'none';
  document.getElementById('infoCard').style.display = 'none';
  document.getElementById('endCard').style.display = 'none';
  const tickerEl = document.getElementById('factTicker');
  if (tickerEl) tickerEl.style.display = 'flex';
}

function showTownSelection() {
  document.getElementById('objectiveCard').style.display = 'none';
  document.getElementById('townCard').style.display = 'block';
  document.getElementById('difficultyCard').style.display = 'none';
  document.getElementById('infoCard').style.display = 'none';

  document.querySelectorAll('.town-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.town === gameSettings.town);
  });
}

function showDifficultySelection() {
  document.getElementById('townCard').style.display = 'none';
  document.getElementById('difficultyCard').style.display = 'block';
  document.getElementById('infoCard').style.display = 'none';

  // Safety net: if the currently-selected difficulty somehow points at a
  // tier that isn't unlocked (e.g. stale state), fall back to the highest
  // tier the player has actually earned.
  if (!isDifficultyUnlocked(gameSettings.difficulty)) {
    gameSettings.difficulty = difficultyProgress.hardUnlocked ? 'hard' : (difficultyProgress.mediumUnlocked ? 'medium' : 'easy');
  }

  document.querySelectorAll('#difficultySelector .diff-btn').forEach(btn => {
    const diff = btn.dataset.diff;
    const unlocked = isDifficultyUnlocked(diff);
    btn.classList.toggle('locked', !unlocked);
    btn.classList.toggle('active', diff === gameSettings.difficulty);
    btn.querySelector('input').checked = (diff === gameSettings.difficulty);
    btn.querySelector('input').disabled = !unlocked;
  });

  const noteEl = document.getElementById('diffLockNote');
  if (noteEl) {
    if (!difficultyProgress.mediumUnlocked) {
      noteEl.textContent = '🔒 Win on Easy to unlock Medium.';
      noteEl.style.display = 'block';
    } else if (!difficultyProgress.hardUnlocked) {
      noteEl.textContent = '🔒 Win on Medium to unlock Hard.';
      noteEl.style.display = 'block';
    } else {
      noteEl.style.display = 'none';
    }
  }
}

function showTownInfo() {
  const townData = TOWN_MAPS[gameSettings.town];
  if (!townData) return;

  document.getElementById('difficultyCard').style.display = 'none';
  document.getElementById('infoCard').style.display = 'block';
  
  document.getElementById('infoCardTitle').textContent = `📍 Profile: ${townData.name}`;
  document.getElementById('infoCardText').textContent = townData.infoText;
}

function loadTownMap() {
  const currentTown = gameSettings.town || 'bacolor';
  const targetMap = TOWN_MAPS[currentTown];

  // Each house cycles through a set of distinct Filipino house archetypes
  // (see drawHouse/HOUSE_STYLES) by index, combined with its own wall
  // color, so a town full of houses reads as a varied neighborhood
  // rather than the same box repeated with different paint.
  state.houses = targetMap.houses.map((h, i) => ({ ...h, id: i, hp: 100, lost: false, shakeT: 0, style: i % HOUSE_STYLES.length }));

  if (targetMap.churchPos) {
    state.church = { x: targetMap.churchPos.x, y: targetMap.churchPos.y, hp: 100, lost: false, shakeT: 0 };
  } else {
    state.church = null;
  }

  if (targetMap.schoolPos) {
    state.school = { x: targetMap.schoolPos.x, y: targetMap.schoolPos.y, hp: 100, lost: false, shakeT: 0 };
  } else {
    state.school = null;
  }
  
  if (targetMap.robotPos) {
    state.robot = { x: targetMap.robotPos.x, y: targetMap.robotPos.y, hp: 100, lost: false, shakeT: 0 };
  } else {
    state.robot = null;
  }

  if (targetMap.monumentPos) {
    state.monument = { x: targetMap.monumentPos.x, y: targetMap.monumentPos.y, hp: 100, lost: false, shakeT: 0 };
  } else {
    state.monument = null;
  }

  if (targetMap.bridgePos) {
    state.bridge = { x: targetMap.bridgePos.x, y: targetMap.bridgePos.y, hp: 100, lost: false, shakeT: 0 };
  } else {
    state.bridge = null;
  }
  
  DECORATIVE_PLANTS.length = 0;
  targetMap.plants.forEach(p => DECORATIVE_PLANTS.push(p));

  isStaticRendered = false; 
  refreshStatusDots();
}

function refreshStatusDots() {
  const w = document.getElementById('houseDots'); w.innerHTML = '';

  if (state.church) {
    const cDot = document.createElement('div');
    cDot.className = 'landmark-dot' + (state.church.lost ? ' lost' : '');
    cDot.title = "Local Church";
    w.appendChild(cDot);
  }

  if (state.school) {
    const sDot = document.createElement('div');
    sDot.className = 'school-dot' + (state.school.lost ? ' lost' : '');
    sDot.title = "Local School";
    w.appendChild(sDot);
  }

  if (state.robot) {
    const rDot = document.createElement('div');
    rDot.className = 'landmark-dot' + (state.robot.lost ? ' lost' : '');
    rDot.style.background = '#3b82f6';
    rDot.title = "Babo Robot Landmark";
    w.appendChild(rDot);
  }

  if (state.monument) {
    const mDot = document.createElement('div');
    mDot.className = 'landmark-dot' + (state.monument.lost ? ' lost' : '');
    mDot.style.background = '#c084fc';
    mDot.title = "Juan Crisostomo Soto Monument";
    w.appendChild(mDot);
  }

  if (state.bridge) {
    const bDot = document.createElement('div');
    bDot.className = 'landmark-dot' + (state.bridge.lost ? ' lost' : '');
    bDot.style.background = '#eab308';
    bDot.title = "Bridge";
    w.appendChild(bDot);
  }

  state.houses.forEach(h => {
    const d = document.createElement('div'); d.className = 'house-dot' + (h.lost ? ' lost' : ''); w.appendChild(d);
  });
}

/* ---------------- DIFFICULTY SETTING HOOKS ---------------- */
function loadDifficulty() {
  const diff = gameSettings.difficulty || 'easy';
  const settings = DIFFICULTY_SETTINGS[diff];
  
  state.budget = settings.startBudget;
  state.budgetMax = settings.maxBudget;
  state.passiveIncome = settings.passiveIncome;
  pathSpeedMultipliers = [...settings.speedMultipliers];
  
  updateBudgetUI();
}

/* ---------------- TOOLBOX UI ---------------- */
const toolboxEl = document.getElementById('toolbox');
const containerEl = document.getElementById('toolItemsContainer');
const toggleEl = document.getElementById('toolboxToggle');

if (toggleEl) {
  toggleEl.addEventListener('click', () => {
    toolboxEl.classList.toggle('collapsed');
  });
}

function toolIconSVG(type) {
  switch (type) {
    case 'sandbag': return `<svg viewBox="0 0 40 40" class="tool-icon"><ellipse cx="20" cy="24" rx="15" ry="10" fill="#d9b56b" stroke="#a8823f" stroke-width="2"/><ellipse cx="20" cy="18" rx="9" ry="6" fill="#e6c98a" stroke="#a8823f" stroke-width="1.5"/></svg>`;
    case 'shovel':  return `<svg viewBox="0 0 40 40" class="tool-icon"><rect x="18" y="6" width="4" height="22" fill="#8a5a2b"/><path d="M12 26 Q20 36 28 26 L26 30 Q20 38 14 30 Z" fill="#a9774a" stroke="#7a5230" stroke-width="1"/></svg>`;
    case 'tree':    return `<svg viewBox="0 0 40 40" class="tool-icon"><rect x="17" y="24" width="6" height="10" fill="#7a5230"/><circle cx="12" cy="18" r="8" fill="#3f8a46" stroke="#2f6b34" stroke-width="1.3"/><circle cx="28" cy="18" r="8" fill="#3f8a46" stroke="#2f6b34" stroke-width="1.3"/><circle cx="20" cy="12" r="10.5" fill="#4d9a55" stroke="#2f6b34" stroke-width="1.3"/><circle cx="16" cy="7" r="5.5" fill="#63b768"/></svg>`;
    case 'dam':     return `<svg viewBox="0 0 40 40" class="tool-icon"><rect x="5" y="10" width="30" height="22" fill="#c9c2b6" stroke="#847c6e" stroke-width="2"/><rect x="9" y="14" width="4" height="14" fill="#847c6e"/><rect x="18" y="14" width="4" height="14" fill="#847c6e"/><rect x="27" y="14" width="4" height="14" fill="#847c6e"/></svg>`;
  }
}

function buildToolbox() {
  containerEl.innerHTML = '';
  Object.entries(TOOL_DEFS).forEach(([key, def]) => {
    const item = document.createElement('div');
    item.className = 'tool-item'; item.dataset.type = key;
    item.innerHTML = `${toolIconSVG(key)}<div class="tool-name">${def.name}</div><div class="tool-price">₱${def.price}</div>`;
    containerEl.appendChild(item);
    attachDragHandlers(item, key);
  });
  refreshToolboxAfford();
}

function refreshToolboxAfford() {
  containerEl.querySelectorAll('.tool-item').forEach(item => {
    item.classList.toggle('disabled', TOOL_DEFS[item.dataset.type].price > state.budget);
  });
}

/* ---------------- DRAG & DROP ---------------- */
const dragGhost = document.getElementById('dragGhost');
let dragState = null;
// Canvas-space drag preview info ({x,y,valid,type}), read every frame by
// drawDragPreview() in the RENDERING section. Kept separate from dragState
// (which only carries the tool type) so render() never has to reach into
// DOM event coordinates.
let dragPreviewPos = null;

function attachDragHandlers(el, type) {
  el.addEventListener('pointerdown', (e) => {
    if (el.classList.contains('disabled')) { playSound('error'); return; }
    e.preventDefault();
    dragState = {type, def: TOOL_DEFS[type]};
    el.classList.add('dragging');
    dragGhost.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(toolIconSVG(type).replace('class="tool-icon"', 'width="60" height="60"'));
    dragGhost.style.display = 'block';
    moveGhost(e.clientX, e.clientY);
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd);
  });
}

function moveGhost(clientX, clientY) {
  dragGhost.style.left = clientX + 'px';
  dragGhost.style.top = (clientY - 70) + 'px';
}

function distToSegment(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y;
  const apx = p.x - a.x, apy = p.y - a.y;
  const lenSq = abx * abx + aby * aby;
  let t = lenSq > 0 ? (apx * abx + apy * aby) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

function distToChannels(x, y) {
  let min = Infinity;
  for (let p = 0; p < channelPaths.length; p++) {
    const path = channelPaths[p];
    for (let i = 1; i < path.length; i++) {
      min = Math.min(min, distToSegment({x, y}, path[i-1], path[i]));
    }
  }
  return min;
}

function onDragMove(e) {
  moveGhost(e.clientX, e.clientY);
  const rect = wrap.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * W;
  const y = (e.clientY - rect.top) / rect.height * H - ((70 / rect.height) * H);

  const valid = distToChannels(x, y) <= 55;
  if (valid) {
    dragGhost.style.filter = "drop-shadow(0 4px 6px rgba(34,197,94,0.8))";
  } else {
    dragGhost.style.filter = "drop-shadow(0 4px 6px rgba(239,68,68,0.8)) grayscale(100%)";
  }

  // Live in-scene placement preview (effect-radius ring + ghost silhouette +
  // nearest-channel glow), drawn every frame by drawDragPreview(). This
  // supplements the cursor-following DOM ghost with contextual info a flat
  // icon can't show: the tool's actual radius and which stretch of channel
  // it will cover.
  dragPreviewPos = { x, y, valid, type: dragState.type };
}

function onDragEnd(e) {
  document.removeEventListener('pointermove', onDragMove);
  document.removeEventListener('pointerup', onDragEnd);
  dragGhost.style.display = 'none';
  dragGhost.style.filter = "drop-shadow(0 8px 12px rgba(0,0,0,.45))";
  containerEl.querySelectorAll('.tool-item').forEach(i => i.classList.remove('dragging'));
  dragPreviewPos = null;

  if (!dragState) return;
  const rect = wrap.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * W;
  const y = (e.clientY - rect.top) / rect.height * H - ((70 / rect.height) * H);

  if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
    tryPlaceItem(dragState.type, x, y);
  }
  dragState = null;
}

function tryPlaceItem(type, x, y) {
  const def = TOOL_DEFS[type];
  if (def.price > state.budget) {
    playSound('error'); showToast("Not enough budget!"); return;
  }
  if (distToChannels(x, y) > 55) {
    playSound('error'); showToast("Place defenses near the channels!"); return;
  }
  
  playSound('place');
  state.budget -= def.price;
  state.placedItems.push({ type, x, y, hp: def.kind === 'area' ? Infinity : 100, strength: def.strength, radius: def.radius });

  // Ripples are stateless/derived (see drawRipples in the RENDERING
  // section) — only the moment of creation is stored, on the
  // always-advancing ambient clock, mirroring the smoke/ash puff pattern
  // used elsewhere. No per-frame mutation bookkeeping needed.
  state.ripples.push({ x, y, startTime: ambientTime });

  // ---- Rapid-deployment combo: placing several defenses within
  // COMBO_WINDOW seconds of each other rewards a small, escalating budget
  // bonus (capped so it can't be farmed into infinite money). Uses
  // ambientTime rather than state.time because placement is also allowed
  // during the pre-storm prep phase, when state.time is still frozen at 0.
  const COMBO_WINDOW = 3.5;
  if (ambientTime - state.lastPlacementTime < COMBO_WINDOW) {
    state.comboCount++;
  } else {
    state.comboCount = 1;
  }
  state.lastPlacementTime = ambientTime;
  state.maxCombo = Math.max(state.maxCombo, state.comboCount);

  if (state.comboCount >= 2) {
    const bonus = Math.min(60, state.comboCount * 8);
    state.budget = Math.min(state.budgetMax, state.budget + bonus);
    showToast(`🔥 ${state.comboCount}x Combo! +₱${bonus} rapid-deploy bonus`, 1300);
    flashBudgetBoost();
  }

  updateBudgetUI();
  refreshToolboxAfford();
}

/* ---------------- HUD / TOAST ---------------- */
const toastEl = document.getElementById('toast');

function showToast(msg, dur = 1600) {
  toastEl.textContent = msg; 
  toastEl.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toastEl.classList.remove('show'), dur);
}

function updateBudgetUI() {
  const budgetAmtEl = document.getElementById('budgetAmount');
  if (budgetAmtEl) budgetAmtEl.textContent = `₱${Math.floor(state.budget).toLocaleString()}`;
  
  const budgetBarFillEl = document.getElementById('budgetBarFill');
  if (budgetBarFillEl) {
    const pct = Math.max(0, state.budget / state.budgetMax * 100);
    budgetBarFillEl.style.width = pct + '%';
    if (budgetAmtEl) budgetAmtEl.classList.toggle('low', pct < 20);
    budgetBarFillEl.style.background = pct < 20 ? 'var(--budget-red)' : 'var(--budget-green)';
  }
}

// Retriggers the CSS "boost" pulse animation on the budget number — called
// whenever a combo bonus lands, so the reward reads as a distinct event
// rather than the number just silently ticking upward.
function flashBudgetBoost() {
  const el = document.getElementById('budgetAmount');
  if (!el) return;
  el.classList.remove('boost');
  void el.offsetWidth; // force reflow so the animation can replay
  el.classList.add('boost');
}

document.getElementById('rainPanel').addEventListener('click', () => {
  if (state.gameOver || state.raining) return;
  
  laharRainTrack.play().catch(err => console.log("Audio blocked: ", err));
  
  playSound('storm');
  state.raining = true; state.running = true;

  // Birds scatter the instant the storm begins — see drawBirds() below for
  // the two-mode (lazy pre-storm loop vs. one-shot flee) animation.
  state.birdsFleeing = true;
  state.birdsFleeStartAmbient = ambientTime;

  // Bridge traffic (Angeles) flees the instant the storm begins too — see
  // drawCars() for the matching two-mode (lazy loop vs. one-shot flee)
  // animation. Harmless to set on other towns since drawCars() no-ops
  // whenever there's no bridge for the current town.
  state.carsFleeing = true;
  state.carsFleeStartAmbient = ambientTime;

  document.getElementById('rainPanel').classList.add('active');
  document.getElementById('rainStatus').textContent = 'Storm Active';
  showToast("Storm begun! Defend the village!");
});

/* ---------------- SIMULATION ENGINE ---------------- */
const STORM_DUR = 75;

function simulate(dt) {
  if (!state.running || state.gameOver) return;
  state.time += dt;

  state.budget = Math.min(state.budgetMax, state.budget + state.passiveIncome * dt);
  updateBudgetUI(); refreshToolboxAfford();

  /* ---- Falling sun collectibles: spawn during gameplay, drift down the
     screen with a gentle sway. Player taps them to earn bonus pesos.
     Spawn rate varies: roughly one sun every 8-18 seconds. Each sun lives
     for 7-12 seconds before fading; uncollected suns simply disappear. ---- */
  state.sunSpawnTimer -= dt;
  if (state.sunSpawnTimer <= 0 && !state.stormOver && !state.gameOver) {
    state.sunSpawnTimer = 8 + Math.random() * 10;
    // Value tiers: ₱50 (common), ₱100 (uncommon), ₱200 (rare golden)
    const roll = Math.random();
    const value = roll < 0.55 ? 50 : (roll < 0.85 ? 100 : 200);
    state.fallingSuns.push({
      x: 55 + Math.random() * 430,
      y: -44,
      vy: 48 + Math.random() * 32,
      swayAmp:  14 + Math.random() * 18,
      swayFreq:  0.7 + Math.random() * 0.7,
      swayPhase: Math.random() * Math.PI * 2,
      value,
      age: 0,
      maxAge: 7 + Math.random() * 5,
      pulsePhase: Math.random() * Math.PI * 2,
      collected: false,
      // Collect-pop: tiny scale+alpha burst after tap
      popT: 0,
    });
  }

  // Update falling suns
  state.fallingSuns.forEach(s => {
    s.age += dt;
    s.y  += s.vy * dt;
    s.x  += Math.sin(s.age * s.swayFreq + s.swayPhase) * s.swayAmp * dt;
    if (s.popT > 0) s.popT -= dt * 3.5;
  });
  state.fallingSuns = state.fallingSuns.filter(s => s.age < s.maxAge && s.y < H + 60);

  if (state.screenShake > 0) {
    state.screenShake -= dt * 12; 
    if (state.screenShake < 0) state.screenShake = 0;
  }

  if (state.raining) {
    state.stormTime += dt;
    state.rainAmount = Math.min(100, state.stormTime * 2);
    state.skyTransition = Math.min(1, state.skyTransition + dt * 0.4); 
  }
  
  let stormIntensity = 0;
  if (state.stormTime > 0) {
    const t = Math.min(1, state.stormTime / STORM_DUR);
    stormIntensity = Math.sin(Math.PI * t);
    if (t >= 1) state.stormOver = true;
  }
  if (state.raining) state.rainAmount = stormIntensity * 100;

  let drainMultiplier = 1;
  state.placedItems.forEach(item => { if (item.type === 'tree' && !item.dead) drainMultiplier += 0.05; });

  const targetVol = state.rainAmount;
  const lagRate = targetVol > state.laharVolume ? 0.5 : (0.35 * drainMultiplier);
  state.laharVolume = Math.max(0, Math.min(100, state.laharVolume + (targetVol - state.laharVolume) * dt * lagRate));

  const driveSpd = (state.laharVolume / 100) * 0.075;
  const recedeSpd = state.stormOver ? 0 : 0.02 * Math.max(0, 1 - state.laharVolume / 30);

  for (let i = 0; i < channelPaths.length; i++) {
    const path = channelPaths[i];
    const totalLen = CHANNEL_LENS[i];
    const front = pointAtProgress(path, Math.min(0.999, state.laharProgresses[i]), totalLen);
    let res = 0;          // blocking resistance — cuts into the flow's damage/advance via (1 - res)
    let divertFactor = 0; // fraction of THIS channel's speed diverted away — strongest single shovel wins, doesn't stack

    state.placedItems.forEach(item => {
      if (item.hp <= 0 || item.dead) return;
      if (Math.hypot(item.x - front.x, item.y - front.y) >= item.radius) return;
      const def = TOOL_DEFS[item.type];

      if (def.mechanic === 'slow') {
        // Trees: permanent, gentle area resistance. No hp loss — they're
        // never washed away (kind 'area' already gives them Infinity hp).
        res += item.strength;
      } else if (def.mechanic === 'divert') {
        // Shovels: contribute NO blocking resistance. Instead they cut
        // this channel's effective speed directly (see currentSpeedMultiplier
        // below). Wears down from fixed manual fatigue, not lahar force.
        divertFactor = Math.max(divertFactor, def.divertPercent);
        item.hp -= dt * def.fatigueRate;
      } else {
        // block (sandbag/dam): classic point resistance, worn down faster
        // the more intense the current lahar volume is.
        res += item.strength / 100;
        item.hp -= dt * def.wearMultiplier * (state.laharVolume / 100);
      }
    });

    const currentSpeedMultiplier = pathSpeedMultipliers[i] * (1 - Math.min(0.85, divertFactor));
    state.laharProgresses[i] = Math.max(0, Math.min(1, state.laharProgresses[i] + (driveSpd * currentSpeedMultiplier * (1 - Math.min(0.98, res)) - recedeSpd) * dt));
  }

  state.placedItems.forEach(item => {
    if (item.hp <= 0 && item.hp !== Infinity && !item.dead) {
      item.dead = true; playSound('error');
      const def = TOOL_DEFS[item.type];
      let msg = `${def.name} washed away!`;
      if (def.mechanic === 'divert') msg = `${def.name} worn out!`;
      showToast(msg);
    }
  });

  // Sums contact damage across every channel whose spread-out front is
  // currently touching (x, y) — replaces the old single fixed-point
  // "exposure" approximation with real per-channel proximity, so the
  // flow only damages what it's actually reached, and damage keeps
  // applying continuously for as long as contact holds.
  function laharContactDamage(x, y, dt, baseRate) {
    let dmg = 0;
    for (let i = 0; i < channelPaths.length; i++) {
      const progress = state.laharProgresses[i];
      if (progress < SPREAD_START) continue;
      const { overFactor, radius } = getChannelSpread(progress);
      if (overFactor <= 0) continue;
      const front = pointAtProgress(channelPaths[i], progress, CHANNEL_LENS[i]);
      const dist = Math.hypot(x - front.x, y - front.y);
      if (dist < radius) {
        const contact = 1 - dist / radius;
        dmg += contact * overFactor * dt * baseRate * (state.laharVolume / 100);
        // Splash kickup where the flow is actively battering a structure —
        // throttled by probability so it reads as intermittent splashes
        // rather than a constant particle firehose.
        if (contact > 0.35 && Math.random() < 0.12) {
          spawnSplash(x + (Math.random() - 0.5) * 22, y - 6 + (Math.random() - 0.5) * 10);
        }
      }
    }
    return dmg;
  }

  const maxProgress = Math.max(...state.laharProgresses);
  if (maxProgress >= SPREAD_START) {
    state.houses.forEach(h => {
      if (h.lost) return;
      const dmg = laharContactDamage(h.x, h.y, dt, 7);
      if (dmg > 0) {
        h.hp -= dmg;
        if (h.hp <= 0) { 
          h.hp = 0; h.lost = true; h.shakeT = 1; 
          state.screenShake = 10; 
          playSound('error'); refreshStatusDots(); showToast("House lost!"); 
          spawnImpactBurst(h.x, h.y - 8);
        }
      }
    });

    if (state.school && !state.school.lost) {
      const schoolDmg = laharContactDamage(state.school.x, state.school.y, dt, 6.5);
      state.school.hp -= schoolDmg;
      if (state.school.hp <= 0) {
        state.school.hp = 0; state.school.lost = true; state.school.shakeT = 1.2;
        state.screenShake = 14;
        playSound('error'); refreshStatusDots(); showToast("School lost!");
        spawnImpactBurst(state.school.x, state.school.y - 8);
      }
    }

    if (state.robot && !state.robot.lost) {
      const robotDmg = laharContactDamage(state.robot.x, state.robot.y, dt, 5);
      state.robot.hp -= robotDmg;
      if (state.robot.hp <= 0) {
        state.robot.hp = 0; state.robot.lost = true; state.robot.shakeT = 1.5;
        state.screenShake = 15;
        playSound('error'); refreshStatusDots(); showToast("Babo Robot fell!");
        spawnImpactBurst(state.robot.x, state.robot.y - 8);
      }
    }

    if (state.monument && !state.monument.lost) {
      const monumentDmg = laharContactDamage(state.monument.x, state.monument.y, dt, 5);
      state.monument.hp -= monumentDmg;
      if (state.monument.hp <= 0) {
        state.monument.hp = 0; state.monument.lost = true; state.monument.shakeT = 1.5;
        state.screenShake = 15;
        playSound('error'); refreshStatusDots(); showToast("Soto Monument fell!");
        spawnImpactBurst(state.monument.x, state.monument.y - 8);
      }
    }

    if (state.church && !state.church.lost) {
      const churchDmg = laharContactDamage(state.church.x, state.church.y, dt, 6);
      state.church.hp -= churchDmg;
      if (state.church.hp <= 0) {
        state.church.hp = 0; state.church.lost = true; state.church.shakeT = 1.5;
        state.screenShake = 18; 
        playSound('error'); refreshStatusDots();
        spawnImpactBurst(state.church.x, state.church.y - 8);
      }
    }

    if (state.bridge && !state.bridge.lost) {
      const bridgeDmg = laharContactDamage(state.bridge.x, state.bridge.y, dt, 5.5);
      state.bridge.hp -= bridgeDmg;
      if (state.bridge.hp <= 0) {
        state.bridge.hp = 0; state.bridge.lost = true; state.bridge.shakeT = 1.6;
        state.screenShake = 16;
        playSound('error'); refreshStatusDots(); showToast("Bridge collapsed!");
        spawnImpactBurst(state.bridge.x, state.bridge.y - 8);
      }
    }
  } else if (maxProgress < 0.55) {
    state.houses.forEach(h => { if (!h.lost && h.hp < 100) h.hp = Math.min(100, h.hp + dt * 3); });
    if (state.school && !state.school.lost && state.school.hp < 100) state.school.hp = Math.min(100, state.school.hp + dt * 2.5);
    if (state.church && !state.church.lost && state.church.hp < 100) state.church.hp = Math.min(100, state.church.hp + dt * 2);
    if (state.robot && !state.robot.lost && state.robot.hp < 100) state.robot.hp = Math.min(100, state.robot.hp + dt * 2);
    if (state.monument && !state.monument.lost && state.monument.hp < 100) state.monument.hp = Math.min(100, state.monument.hp + dt * 2);
    if (state.bridge && !state.bridge.lost && state.bridge.hp < 100) state.bridge.hp = Math.min(100, state.bridge.hp + dt * 2);
  }

  if (state.houses.every(h => h.lost)) {
    endGame(false, `Lahar overwhelmed ${TOWN_MAPS[gameSettings.town].name}. All houses were lost.`);
    return;
  }

  if (state.stormOver) {
    state.postStormTimer += dt;
  }

  // End the round as soon as the lahar has actually stopped moving
  // (volume drained back to ~0 once the storm has passed) rather than
  // always waiting out the full 60s postStormTimer — a dead flow means
  // no further damage is coming, so there's nothing left to play for.
  const laharHasStopped = state.stormOver && state.laharVolume <= 0.5;

  if (state.stormOver && (state.postStormTimer >= 60 || laharHasStopped)) {
    const lostCount = state.houses.filter(h => h.lost).length;
    if (lostCount >= 4) {
      endGame(false, `The storm passed, but ${lostCount} houses in ${TOWN_MAPS[gameSettings.town].name} were lost to the lahar.`);
    } else {
      endGame(true, `Your defenses held! Only ${lostCount} house${lostCount === 1 ? '' : 's'} lost across ${TOWN_MAPS[gameSettings.town].name} — the village is saved!`);
    }
  }

  if (Math.random() < 0.5 + state.laharVolume / 100) {
    const trackIndex = Math.floor(Math.random() * channelPaths.length);
    const p = pointAtProgress(channelPaths[trackIndex], Math.random() * state.laharProgresses[trackIndex], CHANNEL_LENS[trackIndex]);
    state.flowParticles.push({x: p.x + (Math.random() - 0.5) * 14, y: p.y + (Math.random() - 0.5) * 10, life: 1, vy: 8 + Math.random() * 6});
  }
  state.flowParticles.forEach(p => p.life -= dt * 0.6);
  state.flowParticles = state.flowParticles.filter(p => p.life > 0);

  // ---- Floating debris (rocks & ash clumps) carried within the flow ----
  // Adds visual danger/mass to the lahar without touching any resistance,
  // damage, or budget math above — purely a decorative particle layer
  // spawned along whatever length of channel has already been reached.
  if (state.raining) {
    const debrisChance = 0.05 + state.laharVolume / 600;
    if (Math.random() < debrisChance) {
      const trackIndex = Math.floor(Math.random() * channelPaths.length);
      if (state.laharProgresses[trackIndex] > 0.06) {
        const p = pointAtProgress(channelPaths[trackIndex], Math.random() * state.laharProgresses[trackIndex], CHANNEL_LENS[trackIndex]);
        const isAsh = Math.random() < 0.35;
        // Each rock gets its own irregular silhouette (6 randomized vertex
        // radii, generated once at spawn) instead of every rock reusing
        // the same fixed hexagon shape — reads as genuinely jagged debris
        // rather than a stamped icon.
        const vertJitter = isAsh ? null : Array.from({ length: 6 }, () => 0.62 + Math.random() * 0.65);
        state.debris.push({
          x: p.x + (Math.random() - 0.5) * 22,
          y: p.y + (Math.random() - 0.5) * 14,
          angle: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 2.2,
          size: isAsh ? 3 + Math.random() * 3.5 : 4 + Math.random() * 6.5,
          type: isAsh ? 'ash' : 'rock',
          vertJitter,
          vy: 9 + Math.random() * 7,
          drift: (Math.random() - 0.5) * 6,
          life: 1
        });
      }
    }
  }
  state.debris.forEach(p => {
    p.y += p.vy * dt;
    p.x += p.drift * dt;
    p.angle += p.rotSpeed * dt;
    p.life -= dt * 0.22;
  });
  state.debris = state.debris.filter(p => p.life > 0);
  if (state.debris.length > 36) state.debris.splice(0, state.debris.length - 36);

  // ---- Splash droplets: short-lived ballistic arcs kicked up wherever
  // the flow is currently battering a structure (spawned from inside
  // laharContactDamage above). ----
  state.splashes.forEach(p => {
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt * 1.4;
  });
  state.splashes = state.splashes.filter(p => p.life > 0);

  if (state.raining) {
    const profile = DIFFICULTY_SETTINGS[gameSettings.difficulty];
    const spawnCount = Math.floor(profile.rainIntensity * (state.rainAmount / 25));
    for (let s = 0; s < spawnCount; s++) {
      state.particles.push({
        x: Math.random() * W, 
        y: Math.random() * -20, 
        vy: 420 + Math.random() * 140 
      });
    }

    if (gameSettings.difficulty === 'hard' && Math.random() < 0.012 && state.lightningFlash <= 0) {
      state.lightningFlash = 0.35; 
      state.screenShake = 12;      
      
      let curX = 100 + Math.random() * (W - 200);
      let curY = 0;
      state.lightningPath = [{x: curX, y: curY}];
      
      while (curY < 300) {
        curX += (Math.random() - 0.5) * 45;
        curY += 15 + Math.random() * 25;
        state.lightningPath.push({x: curX, y: curY});
        
        if (Math.random() < 0.2) {
          state.lightningPath.push({x: curX + (Math.random() - 0.5) * 30, y: curY + 15});
          state.lightningPath.push({x: curX, y: curY});
        }
      }
    }
  }

  state.particles.forEach(p => { 
    p.y += p.vy * dt; 
    p.x -= 1.5; 
    if (p.x < 0) p.x = W;
  });
  state.particles = state.particles.filter(p => p.y < H);

  if (state.lightningFlash > 0) {
    state.lightningFlash -= dt;
    if (state.lightningFlash <= 0) state.lightningPath = []; 
  }
}

// Kicks up a small burst of mud-water droplets at (x, y), arcing outward
// and falling under a fixed synthetic gravity. Called from
// laharContactDamage whenever the flow is making strong contact with a
// building — purely cosmetic, no gameplay values are read or written.
function spawnSplash(x, y) {
  const count = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const speed = 45 + Math.random() * 75;
    state.splashes.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 230,
      life: 1,
      size: 2 + Math.random() * 2.5
    });
  }
}

// Bigger one-shot debris/splash burst fired at the moment a structure is
// lost — layers on top of the existing screenShake + sound cue to sell the
// hit, reusing the existing splash particle system instead of adding a
// whole new rendering path.
function spawnImpactBurst(x, y) {
  for (let i = 0; i < 3; i++) spawnSplash(x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 10);
}

/* ---------------- SCORING ----------------
   Converts the end-of-round state into a single comparable number.
   Structures contribute proportionally to their REMAINING hp (not just
   survived/lost), so keeping a house at 90% health scores better than
   limping across the finish line at 5% — rewarding early, decisive
   defense over last-second scraping-by. Leftover budget and the best
   combo streak reached both nudge the number too, so score reflects the
   whole run, not just the win/lose outcome. */
function computeFinalScore() {
  let points = 0;
  state.houses.forEach(h => { points += (h.hp / 100) * 100; });
  if (state.school) points += (state.school.hp / 100) * 150;
  if (state.church) points += (state.church.hp / 100) * 200;
  if (state.robot) points += (state.robot.hp / 100) * 150;
  if (state.monument) points += (state.monument.hp / 100) * 150;
  if (state.bridge) points += (state.bridge.hp / 100) * 150;
  const budgetBonus = Math.floor(state.budget / 10);
  const comboBonus = state.maxCombo * 15;
  return Math.floor(points + budgetBonus + comboBonus);
}

function scoreGrade(score) {
  if (score >= 900) return { grade: 'S', label: 'Master Engineer' };
  if (score >= 700) return { grade: 'A', label: 'Excellent Response' };
  if (score >= 500) return { grade: 'B', label: 'Solid Defense' };
  if (score >= 300) return { grade: 'C', label: 'Village Survived' };
  return { grade: 'D', label: 'Heavy Losses' };
}

function endGame(won, text) {
  state.gameOver = true; state.running = false;
  laharRainTrack.pause();

  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById('objectiveCard').style.display = 'none';
  document.getElementById('townCard').style.display = 'none';
  document.getElementById('difficultyCard').style.display = 'none';
  document.getElementById('infoCard').style.display = 'none';
  document.getElementById('endCard').style.display = 'block';
  document.getElementById('endTitle').textContent = won ? "🎉 Village Saved!" : "❌ Village Lost";
  document.getElementById('endTitle').style.color = won ? '#4ade80' : '#f87171';
  document.getElementById('endDesc').textContent = text;

  // "Try Again" only makes sense after a loss — a win already ends the
  // round cleanly, so that button stays hidden and only "Main Menu" (which
  // flows back through town/difficulty selection) is shown.
  const tryAgainBtn = document.getElementById('tryAgainBtn');
  if (tryAgainBtn) tryAgainBtn.style.display = won ? 'none' : 'inline-flex';

  // Difficulty progression: winning on Easy unlocks Medium, winning on
  // Medium unlocks Hard. Surfaces a small congratulatory line on the end
  // card when a new tier opens up.
  const unlockEl = document.getElementById('endUnlockText');
  if (unlockEl) {
    if (won) {
      const newlyUnlocked = unlockNextDifficultyOnWin(gameSettings.difficulty);
      if (newlyUnlocked) {
        const label = newlyUnlocked === 'medium' ? 'Medium' : 'Hard';
        unlockEl.textContent = `🔓 ${label} difficulty unlocked!`;
        unlockEl.style.display = 'block';
      } else {
        unlockEl.style.display = 'none';
      }
    } else {
      unlockEl.style.display = 'none';
    }
  }

  // Final score, letter grade, and a random educational fact — gives the
  // end screen replay value (a number to beat) plus a last bit of teaching
  // content, without touching the win/lose logic itself.
  const score = computeFinalScore();
  const { grade, label } = scoreGrade(score);
  const scoreEl = document.getElementById('endScoreValue');
  const gradeEl = document.getElementById('endGradeBadge');
  const gradeLabelEl = document.getElementById('endGradeLabel');
  if (scoreEl) scoreEl.textContent = score;
  if (gradeEl) { gradeEl.textContent = grade; gradeEl.className = 'grade-badge grade-' + grade; }
  if (gradeLabelEl) gradeLabelEl.textContent = label;

  const factEl = document.getElementById('endFactText');
  if (factEl) factEl.textContent = LAHAR_FACTS[Math.floor(Math.random() * LAHAR_FACTS.length)];

  // The persistent menu fact ticker already shows rotating facts; hide it
  // behind the end card's own dedicated fact so the two don't compete for
  // attention. Restored in showObjectiveSelection() below.
  const tickerEl = document.getElementById('factTicker');
  if (tickerEl) tickerEl.style.display = 'none';
}

/* ---------------- RENDERING ---------------- */
function roundRectCtx(context, x, y, w, h, r) {
  context.beginPath(); context.moveTo(x + r, y); context.arcTo(x + w, y, x + w, y + h, r); 
  context.arcTo(x + w, y + h, x, y + h, r); context.arcTo(x, y + h, x, y, r); context.arcTo(x, y, x + w, y, r); context.closePath();
}

function lerpColor(color1, color2, factor) {
  const c1 = parseInt(color1.slice(1), 16);
  const c2 = parseInt(color2.slice(1), 16);
  const r1 = (c1 >> 16) & 255, g1 = (c1 >> 8) & 255, b1 = c1 & 255;
  const r2 = (c2 >> 16) & 255, g2 = (c2 >> 8) & 255, b2 = c2 & 255;
  return `rgb(${Math.round(r1 + factor * (r2 - r1))}, ${Math.round(g1 + factor * (g2 - g1))}, ${Math.round(b1 + factor * (b2 - b1))})`;
}

// ----- River geometry (shared between the static bake and the live
// animated overlay, so both always align perfectly) -----
// Angeles is home to the real Abacan River, whose bridge was heavily
// damaged by lahar after the 1991 eruption — TOWN_MAPS.angeles already
// has a bridgePos for that reason. The river runs vertically down the
// town with a gentle meander (real rivers rarely run arrow-straight),
// tapering back to straight right under the bridge so the crossing
// still reads cleanly. Geometry is computed once per town and cached,
// since it's fully deterministic (seeded) and never changes at runtime.
const RIVER_GEOMETRY_CACHE = {};
function getRiverGeometry(townName) {
  if (townName in RIVER_GEOMETRY_CACHE) return RIVER_GEOMETRY_CACHE[townName];
  const townData = TOWN_MAPS[townName];
  if (!townData || !townData.bridgePos) { RIVER_GEOMETRY_CACHE[townName] = null; return null; }

  const riverX = townData.bridgePos.x;
  const bridgeY = townData.bridgePos.y;
  const riverHalf = 26;
  const topY = 500, botY = 960;
  const rand = mulberry32(9911);
  const segments = 26;
  const leftPts = [], rightPts = [], centerPts = [];
  for (let i = 0; i <= segments; i++) {
    const y = topY + ((botY - topY) / segments) * i;
    // Meander fades out near the bridge (taper -> 0) so the crossing
    // still lines up cleanly, and grows again further away from it.
    const distFromBridge = Math.abs(y - bridgeY);
    const taper = Math.min(1, distFromBridge / 130);
    const meander = Math.sin((y - topY) / (botY - topY) * Math.PI * 2.3 + 1.1) * 24 * taper;
    const centerX = riverX + meander;
    const leftWave = Math.sin(i * 0.85) * 5 + (rand() - 0.5) * 9;
    const rightWave = Math.sin(i * 0.85 + 1.6) * 5 + (rand() - 0.5) * 9;
    leftPts.push({ x: centerX - riverHalf + leftWave, y });
    rightPts.push({ x: centerX + riverHalf + rightWave, y });
    centerPts.push({ x: centerX, y });
  }

  const geo = { leftPts, rightPts, centerPts, riverX, riverHalf, topY, botY, bridgeY };
  RIVER_GEOMETRY_CACHE[townName] = geo;
  return geo;
}

// Traces the river's water-body path (left bank forward, right bank
// back) into the given context's current path — shared by the static
// fill and the live overlay's clip region so they always match exactly.
function traceRiverBody(context, geo) {
  context.beginPath();
  context.moveTo(geo.leftPts[0].x, geo.leftPts[0].y);
  geo.leftPts.forEach(p => context.lineTo(p.x, p.y));
  for (let i = geo.rightPts.length - 1; i >= 0; i--) context.lineTo(geo.rightPts[i].x, geo.rightPts[i].y);
  context.closePath();
}

// Static bake: bank shoulder, water gradient, and a few dark submerged
// rock silhouettes for depth — everything here is motionless, so it's
// drawn once into the ground layer (see cacheStaticElements) rather than
// repainted every frame.
function drawRiver(context) {
  const geo = getRiverGeometry(gameSettings.town);
  if (!geo) return;
  const { leftPts, rightPts, centerPts, riverX, riverHalf } = geo;

  context.save();

  // Sandy/rocky bank shoulder — a touch wider and darker than the water
  // itself, drawn first so only a thin rim shows around the water body.
  context.beginPath();
  context.moveTo(leftPts[0].x - 10, leftPts[0].y);
  leftPts.forEach(p => context.lineTo(p.x - 6, p.y));
  for (let i = rightPts.length - 1; i >= 0; i--) context.lineTo(rightPts[i].x + 6, rightPts[i].y);
  context.lineTo(rightPts[0].x + 10, rightPts[0].y);
  context.closePath();
  context.fillStyle = 'rgba(120,105,80,0.5)';
  context.fill();

  // Water body — deep teal at the banks, brighter blue-green at the
  // center, tracing the meandering centerline rather than a fixed x.
  traceRiverBody(context, geo);
  const riverGrad = context.createLinearGradient(riverX - riverHalf, 0, riverX + riverHalf, 0);
  riverGrad.addColorStop(0,    '#245a63');
  riverGrad.addColorStop(0.18, '#3d8b96');
  riverGrad.addColorStop(0.5,  '#4fabb8');
  riverGrad.addColorStop(0.82, '#3d8b96');
  riverGrad.addColorStop(1,    '#245a63');
  context.fillStyle = riverGrad;
  context.fill();

  // Submerged rock silhouettes: a handful of dark rounded shapes just
  // beneath the surface, clipped to the water body, giving the river a
  // sense of depth and a rocky bed instead of a flat color fill.
  context.save();
  traceRiverBody(context, geo);
  context.clip();
  const rockRand = mulberry32(4477);
  for (let r = 0; r < 10; r++) {
    const t = rockRand();
    const idx = Math.min(centerPts.length - 1, Math.floor(t * centerPts.length));
    const cx = centerPts[idx].x + (rockRand() - 0.5) * riverHalf * 1.5;
    const cy = centerPts[idx].y;
    const rs = 3 + rockRand() * 5;
    context.fillStyle = `rgba(20,38,42,${0.25 + rockRand() * 0.2})`;
    context.beginPath();
    context.ellipse(cx, cy, rs, rs * 0.65, rockRand() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  context.restore();
}

// Live animated overlay: traveling current highlights that visibly
// scroll downstream, plus twinkling sunlight sparkles — drawn fresh
// every frame (unlike the static bake above) so the river actually
// looks like moving water instead of a painted backdrop. Cheap: a
// handful of clipped strokes/dots per frame, no per-frame allocation.
const RIVER_SPARKLE_CACHE = {};
function getRiverSparkles(geo) {
  const key = geo.riverX + '_' + geo.bridgeY;
  if (RIVER_SPARKLE_CACHE[key]) return RIVER_SPARKLE_CACHE[key];
  const rand = mulberry32(5151);
  const arr = [];
  for (let i = 0; i < 14; i++) {
    arr.push({ t: rand(), perp: (rand() - 0.5) * geo.riverHalf * 1.3, phase: rand() * Math.PI * 2 });
  }
  RIVER_SPARKLE_CACHE[key] = arr;
  return arr;
}

function centerXAtT(geo, t) {
  const idxF = t * (geo.centerPts.length - 1);
  const idx0 = Math.floor(idxF), idx1 = Math.min(geo.centerPts.length - 1, idx0 + 1);
  const frac = idxF - idx0;
  return geo.centerPts[idx0].x + (geo.centerPts[idx1].x - geo.centerPts[idx0].x) * frac;
}

function drawRiverLiveDetail(context) {
  const geo = getRiverGeometry(gameSettings.town);
  if (!geo) return;
  const { topY, botY, riverHalf } = geo;

  context.save();
  traceRiverBody(context, geo);
  context.clip();

  // Traveling current highlights — soft light bands that visibly scroll
  // downstream over time, following the river's actual meandering
  // centerline so they never drift outside the banks.
  const streakCount = 4;
  for (let s = 0; s < streakCount; s++) {
    const cycle = (ambientTime * 0.05 + s / streakCount) % 1;
    const y = topY + (botY - topY) * cycle;
    const cx = centerXAtT(geo, cycle);
    context.globalAlpha = Math.sin(cycle * Math.PI) * 0.22;
    context.strokeStyle = '#eafcff';
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(cx - riverHalf * 0.5, y - 14);
    context.quadraticCurveTo(cx, y, cx + riverHalf * 0.5, y + 14);
    context.stroke();
  }

  // Twinkling sunlight sparkles at fixed seeded positions — only alpha
  // animates (via a per-sparkle sine phase), so they glint in and out
  // rather than jittering around.
  getRiverSparkles(geo).forEach(sp => {
    const y = topY + (botY - topY) * sp.t;
    const cx = centerXAtT(geo, sp.t) + sp.perp;
    const twinkle = 0.5 + 0.5 * Math.sin(ambientTime * 2.4 + sp.phase);
    if (twinkle < 0.55) return;
    context.globalAlpha = ((twinkle - 0.55) / 0.45) * 0.65;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(cx, y, 1.6, 0, Math.PI * 2);
    context.fill();
  });

  context.globalAlpha = 1;
  context.restore();
}

function cacheStaticElements() {
  staticCanvas.width = canvas.width; staticCanvas.height = canvas.height;
  staticCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  
  // Layered ground gradient: sunlit warm green at top -> deeper earthy shadow at base
  const groundGrad = staticCtx.createLinearGradient(0, 500, 0, 960);
  groundGrad.addColorStop(0,   '#5c7448'); // bright sunlit green
  groundGrad.addColorStop(0.28,'#4b5e40'); // mid green
  groundGrad.addColorStop(0.65,'#3a4d30'); // shadowed green
  groundGrad.addColorStop(1,   '#2c3a22'); // deep earthy base
  staticCtx.fillStyle = groundGrad;
  staticCtx.fillRect(0, 500, 540, 460);

  // River (Angeles only — see drawRiver docblock) drawn before the
  // vignette so its edges get the same soft edge-darkening as the rest
  // of the ground.
  drawRiver(staticCtx);

  // Radial ground vignette: darkened edges give perspective depth
  const vigGrad = staticCtx.createRadialGradient(270, 760, 80, 270, 760, 380);
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vigGrad.addColorStop(1, 'rgba(0,0,0,0.25)');
  staticCtx.fillStyle = vigGrad;
  staticCtx.fillRect(0, 500, 540, 460);

  // Trees/bushes used to be baked in here as static pixels. They're now
  // drawn live every frame in drawPlants() so they can gently sway in the
  // wind (see the LIVING ENVIRONMENT section) — the ground fill above is
  // the only piece still cheap/static enough to stay cached.
  isStaticRendered = true;
}

// Precomputed per-channel mud texture/foam speckle fields — generated once
// (lazily, on first draw) rather than re-randomized every frame. Each
// speckle has a fixed position along the channel (`t`, 0..1) and a fixed
// perpendicular offset; drawLaharFlow only reveals speckles whose `t` is
// behind the current flow front, and gives them a small time-based wobble
// for a "roiling mud" feel without any per-frame randomness (which would
// read as flicker/noise instead of texture).
const MUD_TEXTURE_CACHE = {};
function getMudTexture(channelIndex) {
  if (!MUD_TEXTURE_CACHE[channelIndex]) {
    const rand = mulberry32(5000 + channelIndex * 131);
    const arr = [];
    const count = 46;
    for (let i = 0; i < count; i++) {
      arr.push({
        t: rand(),
        perp: (rand() - 0.5) * 24,
        size: 2 + rand() * 4.2,
        isFoam: rand() < 0.32,
        wobbleSeed: rand() * Math.PI * 2
      });
    }
    MUD_TEXTURE_CACHE[channelIndex] = arr;
  }
  return MUD_TEXTURE_CACHE[channelIndex];
}

// Larger, sparser "crust raft" patches — irregular dark polygons meant to
// read as chunks of cooled ash/debris riding on the flow's surface, as
// distinct from the fine mud/foam speckles above. Each has its own slow
// rotation so the rafts feel like they're gently turning as they drift.
const CRUST_TEXTURE_CACHE = {};
function getCrustTexture(channelIndex) {
  if (!CRUST_TEXTURE_CACHE[channelIndex]) {
    const rand = mulberry32(8300 + channelIndex * 251);
    const arr = [];
    const count = 9;
    for (let i = 0; i < count; i++) {
      const sides = 5 + Math.floor(rand() * 3);
      const verts = [];
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        verts.push({ a, r: 0.65 + rand() * 0.6 });
      }
      arr.push({
        t: rand(),
        perp: (rand() - 0.5) * 20,
        size: 5 + rand() * 6,
        verts,
        rotSpeed: (rand() - 0.5) * 0.3,
        rotSeed: rand() * Math.PI * 2
      });
    }
    CRUST_TEXTURE_CACHE[channelIndex] = arr;
  }
  return CRUST_TEXTURE_CACHE[channelIndex];
}

// Sparse "steam vent" positions per channel — at high lahar intensity,
// a few soft wisps rise from the hot mud's surface and drift/fade,
// reusing the same stateless life-cycle pattern as the crater's
// SMOKE_PUFFS (life = (ambientTime*speed+offset) % 1, so motion is
// perfectly smooth with zero per-frame bookkeeping).
const STEAM_VENT_CACHE = {};
function getSteamVents(channelIndex) {
  if (!STEAM_VENT_CACHE[channelIndex]) {
    const rand = mulberry32(6600 + channelIndex * 97);
    const arr = [];
    const count = 5;
    for (let i = 0; i < count; i++) {
      arr.push({
        t: rand(),
        perp: (rand() - 0.5) * 16,
        offset: i / count,
        speed: 0.18 + rand() * 0.12,
        driftX: (rand() - 0.5) * 10,
        riseHeight: 20 + rand() * 16,
        scale: 0.5 + rand() * 0.4
      });
    }
    STEAM_VENT_CACHE[channelIndex] = arr;
  }
  return STEAM_VENT_CACHE[channelIndex];
}

// ----- Deposition fan (the spread at the bottom of each channel) -----
// A real lahar's distal fan is not a clean ellipse: it's irregular and
// "digitate" (finger-like lobes of unequal length), pushes further
// downstream than side-to-side, has feathered rather than hard edges,
// drops coarser debris near its margins, and often shows small braided
// distributary rivulets threading out beyond the main body. The caches
// below back all of that.

// Per-channel angular radius multipliers for the fan's irregular
// silhouette — seeded once so the jagged outline is stable frame to
// frame and simply scales smoothly as `radius` grows.
const FAN_JITTER_CACHE = {};
function getFanJitter(channelIndex) {
  if (!FAN_JITTER_CACHE[channelIndex]) {
    const rand = mulberry32(7400 + channelIndex * 173);
    const sides = 14;
    const arr = [];
    for (let s = 0; s < sides; s++) arr.push(0.5 + rand() * 0.9);
    FAN_JITTER_CACHE[channelIndex] = arr;
  }
  return FAN_JITTER_CACHE[channelIndex];
}

// Traces the fan's irregular boundary around `front`. Radius per angle
// combines the seeded jitter, a forward bias (fans push further in the
// direction the channel was already flowing than they do sideways/back),
// and a slow time-based wobble so the margin gently ripples.
function traceDeltaFan(context, front, radius, jitter, wobbleSeed) {
  const sides = jitter.length;
  context.beginPath();
  for (let s = 0; s <= sides; s++) {
    const idx = s % sides;
    const angle = (idx / sides) * Math.PI * 2;
    const forwardBias = 1 + 0.6 * Math.max(0, Math.cos(angle - front.angle));
    const wobble = 1 + Math.sin(ambientTime * 1.1 + idx * 1.7 + wobbleSeed) * 0.05;
    const r = radius * jitter[idx] * forwardBias * wobble;
    const x = front.x + Math.cos(angle) * r;
    const y = front.y + Math.sin(angle) * r * 0.58;
    if (s === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.closePath();
}

// Per-channel distributary rivulets — a few thin braided streams that
// thread outward beyond the main fan body, biased toward the downstream
// direction, each with its own gentle curve and taper.
const RIVULET_CACHE = {};
function getRivulets(channelIndex) {
  if (!RIVULET_CACHE[channelIndex]) {
    const rand = mulberry32(9100 + channelIndex * 211);
    const count = 4;
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        angleOffset: (rand() - 0.5) * 1.7,
        lengthMul: 0.95 + rand() * 0.55,
        curve: (rand() - 0.5) * 0.7,
        widthMul: 0.5 + rand() * 0.5
      });
    }
    RIVULET_CACHE[channelIndex] = arr;
  }
  return RIVULET_CACHE[channelIndex];
}

function drawRivulets(context, front, radius, overFactor, rivulets, color) {
  rivulets.forEach(rv => {
    const baseAngle = front.angle + rv.angleOffset;
    const len = radius * rv.lengthMul * (0.5 + 0.5 * overFactor);
    const steps = 6;
    context.beginPath();
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const r = t * len;
      const curveOffset = Math.sin(t * Math.PI) * rv.curve;
      const ang = baseAngle + curveOffset;
      const x = front.x + Math.cos(ang) * r;
      const y = front.y + Math.sin(ang) * r * 0.58;
      if (s === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.strokeStyle = color;
    context.lineWidth = 3 * rv.widthMul;
    context.lineCap = 'round';
    context.globalAlpha = 0.32 * overFactor;
    context.stroke();
  });
  context.globalAlpha = 1;
}

// ----- Organic ribbon body -----
// Instead of a constant-width stroke (which reads as a perfectly smooth
// pipe), the flow body is built as a ribbon whose width undulates along
// its length using two traveling sine waves — the `-ambientTime` term
// shifts phase with t, so the undulation pattern visibly migrates
// downstream over time like a real surge/pulse moving through viscous
// mud, rather than just breathing in place. `wobbleSeed` (derived from
// the channel index) keeps each channel's pulse pattern out of sync with
// the others so multiple channels never pulse in lockstep.
function computeLaharSamples(path, totalLen, progress, wobbleSeed) {
  const sampleCount = Math.max(6, Math.min(46, Math.round(progress * 50)));
  const samples = [];
  for (let i = 0; i <= sampleCount; i++) {
    const t = (i / sampleCount) * progress;
    const pt = pointAtProgress(path, t, totalLen);
    const growth = 0.88 + 0.28 * (progress > 0.0001 ? t / progress : 0);
    const wobble =
      Math.sin(t * 34 - ambientTime * 2.6 + wobbleSeed) * 0.15 +
      Math.sin(t * 95 - ambientTime * 4.4 + wobbleSeed * 1.31) * 0.07;
    const widthMul = Math.max(0.32, growth + wobble);
    const perpAngle = pt.angle + Math.PI / 2;
    samples.push({
      x: pt.x, y: pt.y, t, angle: pt.angle,
      nx: Math.cos(perpAngle), ny: Math.sin(perpAngle),
      widthMul
    });
  }
  return samples;
}

// Traces one ribbon layer (a fraction of the full body half-width) from
// precomputed samples — cheap to call repeatedly per layer since all the
// trig/pointAtProgress work already happened once in computeLaharSamples.
function traceLaharRibbon(context, samples, halfWidth, scaleFrac) {
  context.beginPath();
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const hw = halfWidth * scaleFrac * s.widthMul;
    const x = s.x + s.nx * hw, y = s.y + s.ny * hw;
    if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  for (let i = samples.length - 1; i >= 0; i--) {
    const s = samples[i];
    const hw = halfWidth * scaleFrac * s.widthMul;
    const x = s.x - s.nx * hw, y = s.y - s.ny * hw;
    context.lineTo(x, y);
  }
  context.closePath();
}

function drawLaharFlow(context) {
  context.save(); context.lineCap = 'round'; context.lineJoin = 'round';

  // Danger palette: as laharVolume climbs, the mud reads darker, wetter,
  // and more ominous instead of a flat static brown — purely a color
  // interpolation layered on the ribbon fill technique, so channel
  // geometry/collision are completely untouched.
  const intensity = state.laharVolume / 100;
  const outerColor = lerpColor('#7a736a', '#33291f', intensity);
  const midColor = lerpColor('#8f887c', '#4a3a2c', intensity);
  const innerColor = lerpColor('#a89f92', '#6b5847', intensity);
  const sheenColor = lerpColor('#c9c1b0', '#8a7862', intensity);
  const frontColor = lerpColor('#b5ad9e', '#5c4b3c', intensity);
  const leveeColor = lerpColor('#4a3f30', '#241a10', intensity);

  const bodyHalf = 21 + intensity * 4; // full body swells slightly as the flow thickens

  for (let i = 0; i < channelPaths.length; i++) {
    const progress = state.laharProgresses[i];
    if (progress <= 0) continue;

    const samples = computeLaharSamples(channelPaths[i], CHANNEL_LENS[i], progress, i * 2.17 + 0.6);

    // Outer danger-glow halo: hot orange-brown aura that intensifies with lahar volume
    if (intensity > 0.2) {
      traceLaharRibbon(context, samples, bodyHalf, 1.48);
      context.globalAlpha = 0.15 * intensity;
      context.fillStyle = lerpColor('#c07030', '#ff5500', intensity);
      context.fill();
    }

    // Base body: soft shadow -> mid mud -> lit core, now shaped as an
    // organic undulating ribbon instead of a constant-width pipe so the
    // banks visibly bulge and narrow like a real viscous flow.
    traceLaharRibbon(context, samples, bodyHalf, 1.0);
    context.globalAlpha = 0.62; context.fillStyle = outerColor; context.fill();
    context.globalAlpha = 1;
    traceLaharRibbon(context, samples, bodyHalf, 0.71); context.fillStyle = midColor; context.fill();
    traceLaharRibbon(context, samples, bodyHalf, 0.38); context.fillStyle = innerColor; context.fill();

    // Glossy wet-mud sheen — wider and brighter for that viscous slick look
    traceLaharRibbon(context, samples, bodyHalf, 0.17);
    context.globalAlpha = 0.42; context.fillStyle = sheenColor; context.fill();
    // Bright specular highlight that appears as the flow peaks
    if (intensity > 0.45) {
      context.globalAlpha = 0.16 * intensity;
      context.fillStyle = '#fff4d0';
      context.fill();
    }
    context.globalAlpha = 1;

    // Sediment levees: a thin darker line traced along the outer banks,
    // reading as raised deposited material along the flow's edges.
    context.globalAlpha = 0.5;
    context.strokeStyle = leveeColor;
    context.lineWidth = 1.6;
    context.beginPath();
    samples.forEach((s, idx) => {
      const hw = bodyHalf * s.widthMul;
      const x = s.x + s.nx * hw, y = s.y + s.ny * hw;
      if (idx === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();
    context.beginPath();
    samples.forEach((s, idx) => {
      const hw = bodyHalf * s.widthMul;
      const x = s.x - s.nx * hw, y = s.y - s.ny * hw;
      if (idx === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();
    context.globalAlpha = 1;

    // Downstream light streaks: a few short glints that visibly travel
    // along the flow's length over time, selling the sense of a moving
    // viscous current rather than a static painted shape.
    const streakCount = 3;
    for (let sIdx = 0; sIdx < streakCount; sIdx++) {
      const cycle = (ambientTime * 0.16 + sIdx / streakCount + i * 0.31) % 1;
      const st = cycle * progress;
      if (st < 0.015 || st > progress) continue;
      const spt = pointAtProgress(channelPaths[i], st, CHANNEL_LENS[i]);
      context.save();
      context.translate(spt.x, spt.y);
      context.rotate(spt.angle);
      context.globalAlpha = Math.sin(cycle * Math.PI) * 0.22 * (0.4 + intensity * 0.6);
      context.fillStyle = '#fff4d8';
      context.beginPath();
      context.ellipse(0, 0, 13, 2, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    context.globalAlpha = 1;

    // Mud clumps + foam speckles: revealed progressively as the front
    // advances, with a gentle sinusoidal wobble for a "roiling" feel.
    const speckles = getMudTexture(i);
    speckles.forEach(s => {
      if (s.t > progress) return;
      const pt = pointAtProgress(channelPaths[i], s.t, CHANNEL_LENS[i]);
      const wobble = Math.sin(ambientTime * 1.3 + s.wobbleSeed) * 2.2;
      const perpAngle = pt.angle + Math.PI / 2;
      const offset = s.perp + wobble;
      const px = pt.x + Math.cos(perpAngle) * offset;
      const py = pt.y + Math.sin(perpAngle) * offset * 0.6;
      // Fade newly-revealed speckles in smoothly instead of popping.
      context.globalAlpha = Math.min(1, (progress - s.t) * 26);
      context.fillStyle = s.isFoam ? 'rgba(220,214,200,0.6)' : 'rgba(50,42,34,0.32)';
      context.beginPath();
      context.ellipse(px, py, s.size, s.size * 0.55, perpAngle, 0, Math.PI * 2);
      context.fill();
    });
    context.globalAlpha = 1;

    // Crust rafts: larger irregular dark chunks drifting on the surface,
    // slowly rotating in place — reads as settling debris/ash chunks
    // riding along in the flow, distinct from the fine speckle texture.
    const crusts = getCrustTexture(i);
    crusts.forEach(c => {
      if (c.t > progress) return;
      const pt = pointAtProgress(channelPaths[i], c.t, CHANNEL_LENS[i]);
      const perpAngle = pt.angle + Math.PI / 2;
      const px = pt.x + Math.cos(perpAngle) * c.perp;
      const py = pt.y + Math.sin(perpAngle) * c.perp * 0.6;
      const alpha = Math.min(1, (progress - c.t) * 20) * 0.55;
      if (alpha <= 0.01) return;
      context.save();
      context.translate(px, py);
      context.rotate(c.rotSeed + ambientTime * c.rotSpeed);
      context.globalAlpha = alpha;
      context.fillStyle = 'rgba(40,33,26,0.85)';
      context.beginPath();
      c.verts.forEach((v, idx) => {
        const x = Math.cos(v.a) * c.size * v.r, y = Math.sin(v.a) * c.size * v.r * 0.7;
        if (idx === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.closePath();
      context.fill();
      context.restore();
    });
    context.globalAlpha = 1;

    // Steam wisps: at high intensity the mud reads as hot, so a few soft
    // wisps rise from its surface and drift/fade — ties into the
    // volcanic theme (hot pyroclastic material mixing with rainwater).
    if (intensity > 0.45) {
      const vents = getSteamVents(i);
      vents.forEach(v => {
        if (v.t > progress) return;
        const life = ((ambientTime * v.speed) + v.offset) % 1;
        const pt = pointAtProgress(channelPaths[i], v.t, CHANNEL_LENS[i]);
        const perpAngle = pt.angle + Math.PI / 2;
        const baseX = pt.x + Math.cos(perpAngle) * v.perp;
        const baseY = pt.y + Math.sin(perpAngle) * v.perp * 0.6;
        const vy = baseY - life * v.riseHeight;
        const vx = baseX + v.driftX * life;
        const alpha = Math.min(1, life * 4) * Math.min(1, (1 - life) * 2.5) * ((intensity - 0.45) / 0.55) * 0.35;
        if (alpha <= 0.01) return;
        const r = (6 + life * 10) * v.scale;
        const steamGrad = context.createRadialGradient(vx, vy, 0, vx, vy, r);
        steamGrad.addColorStop(0, `rgba(230,225,215,${alpha})`);
        steamGrad.addColorStop(1, 'rgba(230,225,215,0)');
        context.fillStyle = steamGrad;
        context.beginPath(); context.arc(vx, vy, r, 0, Math.PI * 2); context.fill();
      });
    }

    const front = pointAtProgress(channelPaths[i], progress, CHANNEL_LENS[i]);
    const { overFactor, radius } = getChannelSpread(progress);
    if (overFactor > 0) {
      const jitter = getFanJitter(i);

      // Outer danger-red halo at high lahar volume — reads as near-lava heat
      if (intensity > 0.55) {
        traceDeltaFan(context, front, radius * 1.5, jitter, i * 3.1 + 4);
        context.globalAlpha = 1;
        const dangerGrad = context.createRadialGradient(front.x, front.y, 0, front.x, front.y, radius * 1.6);
        dangerGrad.addColorStop(0, `rgba(190,55,15,${0.24 * overFactor * intensity})`);
        dangerGrad.addColorStop(1, 'rgba(190,55,15,0)');
        context.fillStyle = dangerGrad;
        context.fill();
      }

      // Distributary rivulets — thin braided streams threading outward
      // beyond the main fan body, drawn first so the fan body overlaps
      // their base and only their outer reach shows past the margin.
      drawRivulets(context, front, radius, overFactor, getRivulets(i), midColor);

      // Deposition fan: irregular, digitate silhouette (not a clean
      // ellipse) that pushes further downstream than to the sides, with
      // feathered edges via a soft outer wash pass beneath the main fill.
      traceDeltaFan(context, front, radius * 1.22, jitter, i * 3.1 + 1);
      const washGrad = context.createRadialGradient(front.x, front.y, 0, front.x, front.y, radius * 1.22);
      washGrad.addColorStop(0, `rgba(96, 84, 71, ${0.22 * overFactor})`);
      washGrad.addColorStop(1, 'rgba(96, 84, 71, 0)');
      context.fillStyle = washGrad;
      context.fill();

      traceDeltaFan(context, front, radius, jitter, i * 3.1 + 1);
      const fanGrad = context.createRadialGradient(front.x, front.y, 0, front.x, front.y, radius);
      fanGrad.addColorStop(0,   `rgba(130, 118, 106, ${0.7 * overFactor})`);
      fanGrad.addColorStop(0.4, `rgba(110,  97,  83, ${0.5 * overFactor})`);
      fanGrad.addColorStop(0.75,`rgba(96,  83,  70, ${0.28 * overFactor})`);
      fanGrad.addColorStop(1,   'rgba(88, 76, 64, 0)');
      context.fillStyle = fanGrad;
      context.fill();

      // Coarse debris concentrated at the fan's margin — real lahars drop
      // their heaviest material first as the flow decelerates and
      // spreads, leaving boulder-strewn lobe edges.
      if (overFactor > 0.25) {
        const boulderRand = mulberry32(4200 + i * 61);
        jitter.forEach((jv, idx) => {
          if (boulderRand() > 0.6) return; // sparse, not every vertex
          const angle = (idx / jitter.length) * Math.PI * 2;
          const forwardBias = 1 + 0.6 * Math.max(0, Math.cos(angle - front.angle));
          const r = radius * jv * forwardBias * 0.94;
          const bx = front.x + Math.cos(angle) * r;
          const by = front.y + Math.sin(angle) * r * 0.58;
          const bs = 2.5 + boulderRand() * 2.5;
          context.globalAlpha = 0.6 * overFactor;
          context.fillStyle = '#4a4038';
          context.beginPath(); context.ellipse(bx, by, bs, bs * 0.75, angle, 0, Math.PI * 2); context.fill();
          context.fillStyle = 'rgba(255,255,255,0.14)';
          context.beginPath(); context.ellipse(bx - bs * 0.3, by - bs * 0.3, bs * 0.35, bs * 0.25, 0, 0, Math.PI * 2); context.fill();
        });
        context.globalAlpha = 1;
      }

      // Lobate flow front: two secondary bulges, offset to either side
      // of the main heading and slowly pulsing in size, layer on top of
      // the digitate fan for an uneven, muscular leading edge.
      [-1, 1].forEach(side => {
        const lobeAngle = front.angle + side * 0.62;
        const lobePulse = 0.82 + 0.18 * Math.sin(ambientTime * 1.4 + i * 1.7 + side);
        const lobeR = radius * 0.55 * lobePulse;
        const lx = front.x + Math.cos(lobeAngle) * radius * 0.42;
        const ly = front.y + Math.sin(lobeAngle) * radius * 0.42 * 0.58;
        const lobeGrad = context.createRadialGradient(lx, ly, 0, lx, ly, lobeR);
        lobeGrad.addColorStop(0,   `rgba(120, 108, 96, ${0.5 * overFactor})`);
        lobeGrad.addColorStop(1,   'rgba(88, 76, 64, 0)');
        context.fillStyle = lobeGrad;
        context.beginPath();
        context.ellipse(lx, ly, lobeR, lobeR * 0.6, 0, 0, Math.PI * 2);
        context.fill();
      });

      // Denser bubbling foam ring — more flecks at varied radii and sizes
      const foamCount = 12;
      for (let f = 0; f < foamCount; f++) {
        const fa = (f / foamCount) * Math.PI * 2 + ambientTime * 0.95;
        const fr = radius * (0.44 + (f % 4) * 0.13) + Math.sin(ambientTime * 3.8 + f * 1.4) * 5.5;
        const fx = front.x + Math.cos(fa) * fr;
        const fy = front.y + Math.sin(fa) * fr * 0.58;
        context.globalAlpha = (0.52 + (f % 3) * 0.18) * overFactor;
        context.fillStyle = f % 4 === 0 ? 'rgba(245,238,224,0.95)' : (f % 4 === 1 ? 'rgba(218,206,190,0.78)' : 'rgba(200,188,170,0.6)');
        context.beginPath();
        context.ellipse(fx, fy, 3.2 + (f % 3) * 0.8, 2.4, 0, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    }
    context.fillStyle = frontColor; context.beginPath(); context.ellipse(front.x, front.y, 16 + overFactor * 10, 10 + overFactor * 6, 0, 0, Math.PI * 2); context.fill();
  }
  context.restore();
  
  state.flowParticles.forEach(p => {
    context.save(); context.globalAlpha = Math.max(0, p.life); context.fillStyle = '#4a453f'; 
    context.beginPath(); context.arc(p.x, p.y, 3, 0, Math.PI * 2); context.fill(); context.restore();
  });
}

// Rocks and tree-trunk logs carried along within the lahar body — a
// purely decorative particle layer (see the spawn/update logic in
// simulate()) that adds visual mass and danger to the flow.
function drawDebris(context) {
  context.save();
  state.debris.forEach(p => {
    // Subtle motion streak behind fast-moving debris — a short, tapering,
    // low-opacity smear opposite the direction of travel, selling a sense
    // of speed within the flow without needing a full particle trail.
    const speed = Math.hypot(p.vy, p.drift);
    if (speed > 6) {
      const trailLen = Math.min(16, speed * 0.9);
      const trailAngle = Math.atan2(p.vy, p.drift);
      context.save();
      context.globalAlpha = Math.min(1, p.life * 1.6) * 0.18;
      context.strokeStyle = '#3a332b';
      context.lineWidth = Math.max(1.5, p.size * 0.35);
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(p.x, p.y);
      context.lineTo(p.x - Math.cos(trailAngle) * trailLen, p.y - Math.sin(trailAngle) * trailLen);
      context.stroke();
      context.restore();
    }

    context.save();
    context.globalAlpha = Math.min(1, p.life * 1.6);
    context.translate(p.x, p.y);
    context.rotate(p.angle);
    if (p.type === 'ash') {
      // Small floating ash/pumice clumps — lighter and more buoyant-
      // looking than rocks, adding fine texture variety on the surface.
      context.fillStyle = '#8a8178';
      context.beginPath(); context.ellipse(0, 0, p.size, p.size * 0.75, 0, 0, Math.PI * 2); context.fill();
      context.fillStyle = 'rgba(255,255,255,0.2)';
      context.beginPath(); context.ellipse(-p.size * 0.25, -p.size * 0.2, p.size * 0.4, p.size * 0.28, 0, 0, Math.PI * 2); context.fill();
    } else {
      // Rocks — each uses its own randomized vertex jitter (set at spawn
      // time) so every rock reads as a genuinely unique jagged chunk
      // rather than a repeated stamped hexagon.
      context.fillStyle = '#5c574e';
      context.beginPath();
      const sides = p.vertJitter ? p.vertJitter.length : 6;
      for (let s = 0; s < sides; s++) {
        const ang = (s / sides) * Math.PI * 2;
        const r = p.size * (p.vertJitter ? p.vertJitter[s] : (0.72 + (s % 2) * 0.28));
        const x = Math.cos(ang) * r, y = Math.sin(ang) * r * 0.8;
        if (s === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.closePath();
      context.fill();
      context.strokeStyle = 'rgba(0,0,0,0.22)'; context.lineWidth = 1;
      context.stroke();
      context.fillStyle = 'rgba(255,255,255,0.15)';
      context.beginPath(); context.ellipse(-p.size * 0.25, -p.size * 0.25, p.size * 0.3, p.size * 0.2, 0, 0, Math.PI * 2); context.fill();
    }
    context.restore();
  });
  context.restore();
}

// Short-lived mud-water splash droplets kicked up wherever the flow is
// actively battering a structure (spawned from laharContactDamage).
function drawSplashes(context) {
  context.save();
  const mudColor = lerpColor('#9e8870', '#b8541a', state.laharVolume / 100);
  state.splashes.forEach(p => {
    context.globalAlpha = Math.max(0, p.life) * 0.85;
    context.fillStyle = mudColor;
    context.beginPath();
    context.ellipse(p.x, p.y, p.size, p.size * 0.65, Math.atan2(p.vy, p.vx), 0, Math.PI * 2);
    context.fill();
    // Tiny bright specular on each droplet
    context.globalAlpha = Math.max(0, p.life) * 0.35;
    context.fillStyle = 'rgba(255,240,200,0.7)';
    context.beginPath();
    context.arc(p.x - p.size * 0.25, p.y - p.size * 0.2, p.size * 0.28, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

// ---------------- PLACEMENT FEEDBACK: RIPPLES & DRAG PREVIEW ----------------

// A brief expanding double-ring "confirmed!" flash at the moment a tool is
// placed. Stateless like the smoke/ash puffs: each ripple stores only its
// birth moment on the always-advancing ambient clock, and its radius/alpha
// are pure functions of (ambientTime - startTime) — no per-frame update
// loop needed, and pruning expired ripples is just a filter done here.
const RIPPLE_DURATION = 0.7;
function drawRipples(context) {
  if (state.ripples.length === 0) return;
  state.ripples = state.ripples.filter(r => ambientTime - r.startTime < RIPPLE_DURATION);
  context.save();
  state.ripples.forEach(r => {
    const t = (ambientTime - r.startTime) / RIPPLE_DURATION;
    const radius = 6 + t * 46;
    const alpha = Math.max(0, 1 - t);
    context.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
    context.lineWidth = 3 * (1 - t) + 0.5;
    context.beginPath(); context.arc(r.x, r.y, radius, 0, Math.PI * 2); context.stroke();
    context.strokeStyle = `rgba(120, 200, 255, ${alpha * 0.5})`;
    context.lineWidth = 1.5;
    context.beginPath(); context.arc(r.x, r.y, radius * 0.6, 0, Math.PI * 2); context.stroke();
  });
  context.restore();
}

// Finds the closest point lying ON any channel polyline to (x,y) — used
// only by the drag-preview glow below. Kept separate from distToChannels
// (which only needs a distance, not a point) to avoid touching that
// existing, already-relied-upon function.
function nearestChannelPoint(x, y) {
  let min = Infinity, closest = null;
  for (let p = 0; p < channelPaths.length; p++) {
    const path = channelPaths[p];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const abx = b.x - a.x, aby = b.y - a.y;
      const lenSq = abx * abx + aby * aby;
      let t = lenSq > 0 ? ((x - a.x) * abx + (y - a.y) * aby) / lenSq : 0;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + abx * t, py = a.y + aby * t;
      const d = Math.hypot(x - px, y - py);
      if (d < min) { min = d; closest = { x: px, y: py }; }
    }
  }
  return closest;
}

// Live in-scene placement guide, drawn every frame while a tool is being
// dragged (dragPreviewPos is set/cleared by onDragMove/onDragEnd). Shows
// three things a cursor icon alone can't: the tool's actual effect radius,
// a translucent preview of the tool itself, and — when the spot is valid —
// a soft glow on the exact stretch of channel that will be affected.
function drawDragPreview(context) {
  if (!dragPreviewPos) return;
  const { x, y, valid, type } = dragPreviewPos;
  const def = TOOL_DEFS[type];
  if (!def) return;

  if (valid) {
    const cp = nearestChannelPoint(x, y);
    if (cp) {
      context.save();
      const glow = context.createRadialGradient(cp.x, cp.y, 0, cp.x, cp.y, def.radius * 1.3);
      glow.addColorStop(0, 'rgba(74, 222, 128, 0.35)');
      glow.addColorStop(1, 'rgba(74, 222, 128, 0)');
      context.fillStyle = glow;
      context.beginPath(); context.arc(cp.x, cp.y, def.radius * 1.3, 0, Math.PI * 2); context.fill();
      context.restore();
    }
  }

  context.save();
  const pulse = 1 + Math.sin(ambientTime * 6) * 0.04;
  context.strokeStyle = valid ? 'rgba(74, 222, 128, 0.85)' : 'rgba(248, 113, 113, 0.85)';
  context.fillStyle = valid ? 'rgba(74, 222, 128, 0.12)' : 'rgba(248, 113, 113, 0.12)';
  context.lineWidth = 2.5;
  context.setLineDash([6, 5]);
  context.beginPath();
  context.arc(x, y, def.radius * pulse, 0, Math.PI * 2);
  context.fill(); context.stroke();
  context.setLineDash([]);
  context.restore();

  context.save();
  context.globalAlpha = 0.55;
  context.translate(x, y);
  drawItemShape(context, type);
  context.restore();

  if (!valid) {
    context.save();
    context.globalAlpha = 0.9;
    context.fillStyle = '#f87171';
    context.font = 'bold 22px Arial';
    context.textAlign = 'center';
    context.fillText('✕', x, y - def.radius - 12);
    context.restore();
  }
}

function drawChurch(c) {
  if (!c) return;
  ctx.save();
  let shakeX = c.shakeT > 0 ? Math.sin(state.time * 40) * 5 * c.shakeT : 0;
  if (c.shakeT > 0) c.shakeT -= 0.04;
  const x = c.x + shakeX, y = c.y;

  // Drop shadow beneath the church
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(x, y + 52, 90, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, y + 52, 60, 8,  0, 0, Math.PI * 2); ctx.fill();

  ctx.globalAlpha = c.lost ? 0.35 : 1;

  // Bacolor's San Guillermo Church art is a taller/narrower composition
  // (real bell-tower proportions) than the generic Porac church image, so
  // it gets its own width/height rather than being squashed into the same
  // 170x100 box. Both are bottom-anchored at y+50 so they still sit on
  // the same ground line as every other building.
  const isBacolor = gameSettings.town === 'bacolor';
  const churchArt = isBacolor ? bacolorChurchImg : churchImg;
  const artW = isBacolor ? 250 : 170;
  const artH = isBacolor ? 138 : 100;

  if (churchArt.complete && churchArt.naturalHeight !== 0) {
    ctx.drawImage(churchArt, x - artW / 2, y + 50 - artH, artW, artH);
  }

  if (!c.lost) {
    drawHPBar(ctx, x, y - 62, 52, 7, c.hp);
  } else {
    ctx.fillStyle = '#2c2520'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center'; ctx.fillText('🏚️', x, y - 10);
  }
  ctx.restore();
}

function drawSchool(s) {
  if (!s) return;
  ctx.save();
  let shakeX = s.shakeT > 0 ? Math.sin(state.time * 40) * 4 * s.shakeT : 0;
  if (s.shakeT > 0) s.shakeT -= 0.04;
  const x = s.x + shakeX, y = s.y;

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(x, y + 14, 30, 7, 0, 0, Math.PI * 2); ctx.fill();

  ctx.globalAlpha = s.lost ? 0.35 : 1;
  ctx.fillStyle = s.lost ? '#5c5751' : '#eaf4f4'; ctx.fillRect(x - 22, y - 8, 44, 22);
  ctx.fillStyle = s.lost ? '#44403a' : '#b5ce88';
  ctx.fillRect(x - 24, y - 12, 48, 4);
  ctx.fillRect(x - 22, y - 8, 4, 22); ctx.fillRect(x + 18, y - 8, 4, 22);
  ctx.fillStyle = s.lost ? '#4d4640' : '#b04060';
  ctx.beginPath(); ctx.moveTo(x - 26, y - 12); ctx.lineTo(x, y - 26); ctx.lineTo(x + 26, y - 12); ctx.closePath(); ctx.fill();
  // Roof ridge highlight
  if (!s.lost) {
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - 22, y - 12); ctx.lineTo(x, y - 26); ctx.lineTo(x + 22, y - 12); ctx.stroke();
  }
  ctx.fillStyle = '#2b2d42'; ctx.fillRect(x - 12, y + 2, 6, 6); ctx.fillRect(x + 6, y + 2, 6, 6); ctx.fillRect(x - 3, y + 4, 6, 10);
  // Window shine
  if (!s.lost) {
    ctx.fillStyle = 'rgba(200,240,255,0.45)';
    ctx.fillRect(x - 11, y + 3, 3, 2); ctx.fillRect(x + 7, y + 3, 3, 2);
  }

  if (!s.lost) {
    drawHPBar(ctx, x, y - 34, 44, 7, s.hp);
  } else {
    ctx.fillStyle = '#2c2520'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.fillText('🎓', x, y - 2);
  }
  ctx.restore();
}

function drawBaboRobot(r) {
  if (!r) return;
  ctx.save();
  let shakeX = r.shakeT > 0 ? Math.sin(state.time * 40) * 4 * r.shakeT : 0;
  if (r.shakeT > 0) r.shakeT -= 0.04;
  const x = r.x + shakeX, y = r.y;

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(x + 10, y + 66, 80, 12, 0, 0, Math.PI * 2); ctx.fill();

  ctx.globalAlpha = r.lost ? 0.35 : 1;

  if (robotImg.complete && robotImg.naturalHeight !== 0) {
    ctx.drawImage(robotImg, x - 100, y - 35, 220, 100);
  }

  if (!r.lost) {
    drawHPBar(ctx, x + 10, y - 62, 40, 7, r.hp);
  } else {
    ctx.fillStyle = '#2c2520'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.fillText('💥', x, y - 12);
  }
  ctx.restore();
}

function drawMonument(m) {
  if (!m) return;
  ctx.save();
  let shakeX = m.shakeT > 0 ? Math.sin(state.time * 40) * 4 * m.shakeT : 0;
  if (m.shakeT > 0) m.shakeT -= 0.04;
  const x = m.x + shakeX, y = m.y;

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(x, y + 52, 50, 10, 0, 0, Math.PI * 2); ctx.fill();

  ctx.globalAlpha = m.lost ? 0.35 : 1;

  if (monumentImg.complete && monumentImg.naturalHeight !== 0) {
    ctx.drawImage(monumentImg, x - 60, y - 40, 120, 90);
  }

  if (!m.lost) {
    drawHPBar(ctx, x, y - 52, 40, 7, m.hp);
  } else {
    ctx.fillStyle = '#2c2520'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.fillText('💥', x, y - 12);
  }
  ctx.restore();
}

// Draws one continuous stretch of bridge deck (pillars, road surface,
// four-lane markings, railings) between x1 and x2 at the given deck
// height. Used both for the normal single-span bridge and, once the
// bridge is destroyed, for the two shorter stubs left standing on
// either side of the collapsed gap. brokenLeftEnd/brokenRightEnd draw a
// jagged snapped-concrete edge with hanging rebar at whichever end
// faces the gap.
function drawBridgeSpan(context, x1, x2, deckY, brokenLeftEnd, brokenRightEnd) {
  const segW = x2 - x1;
  if (segW <= 4) return;
  const rh = BRIDGE_ROAD_HALF;

  // Support pillars descending below the deck into the riverbed
  context.fillStyle = '#8a8f96';
  const pillarCount = Math.max(1, Math.round(segW / 85));
  for (let i = 0; i <= pillarCount; i++) {
    const px = x1 + segW * (i / pillarCount);
    context.fillRect(px - 5, deckY + rh - 6, 10, 30);
    context.fillStyle = '#6f747a';
    context.fillRect(px - 5, deckY + rh + 20, 10, 4);
    context.fillStyle = '#8a8f96';
  }

  // Road deck with a subtle top-lit gradient — twice as wide as before
  // so it reads as a proper 4-lane carriageway rather than a footpath.
  const deckGrad = context.createLinearGradient(0, deckY - rh, 0, deckY + rh);
  deckGrad.addColorStop(0,   '#a19d97');
  deckGrad.addColorStop(0.5, '#8b8781');
  deckGrad.addColorStop(1,   '#6d6a65');
  context.fillStyle = deckGrad;
  roundRectCtx(context, x1, deckY - rh, segW, rh * 2, 4);
  context.fill();
  context.strokeStyle = 'rgba(0,0,0,0.25)'; context.lineWidth = 1.5; context.stroke();

  // ---- Lane markings: 4 lanes, 2 per direction ----
  // Solid double-yellow median down the center separates the two
  // directions of travel; dashed white lines mark the boundary between
  // the two same-direction lanes on each side of the median.
  context.save();
  context.beginPath();
  roundRectCtx(context, x1, deckY - rh, segW, rh * 2, 4);
  context.clip();

  context.strokeStyle = '#f4d35e';
  context.lineWidth = 1.6;
  context.beginPath(); context.moveTo(x1, deckY - 1.6); context.lineTo(x2, deckY - 1.6); context.stroke();
  context.beginPath(); context.moveTo(x1, deckY + 1.6); context.lineTo(x2, deckY + 1.6); context.stroke();

  context.strokeStyle = 'rgba(255,255,255,0.85)';
  context.lineWidth = 1.5;
  context.setLineDash([9, 7]);
  const laneY1 = deckY - rh * 0.5, laneY2 = deckY + rh * 0.5;
  context.beginPath(); context.moveTo(x1, laneY1); context.lineTo(x2, laneY1); context.stroke();
  context.beginPath(); context.moveTo(x1, laneY2); context.lineTo(x2, laneY2); context.stroke();
  context.setLineDash([]);
  context.restore();

  // Railings along both outer edges of the deck, with evenly spaced posts
  context.strokeStyle = '#5b5650'; context.lineWidth = 2;
  context.beginPath(); context.moveTo(x1, deckY - rh); context.lineTo(x2, deckY - rh); context.stroke();
  context.beginPath(); context.moveTo(x1, deckY + rh); context.lineTo(x2, deckY + rh); context.stroke();
  const postCount = Math.max(2, Math.round(segW / 30));
  for (let i = 0; i <= postCount; i++) {
    const px = x1 + segW * (i / postCount);
    context.beginPath(); context.moveTo(px, deckY - rh); context.lineTo(px, deckY - rh - 6); context.stroke();
    context.beginPath(); context.moveTo(px, deckY + rh); context.lineTo(px, deckY + rh + 6); context.stroke();
  }

  // Snapped/broken concrete edge with hanging rebar, drawn only on
  // whichever end(s) of this segment face the collapsed gap.
  function drawBrokenEdge(edgeX, dir) {
    context.save();
    context.fillStyle = '#5f5a52';
    context.beginPath();
    context.moveTo(edgeX, deckY - rh);
    context.lineTo(edgeX + dir * 12, deckY - rh * 0.4);
    context.lineTo(edgeX + dir * 4, deckY + rh * 0.1);
    context.lineTo(edgeX + dir * 16, deckY + rh * 0.55);
    context.lineTo(edgeX, deckY + rh);
    context.closePath();
    context.fill();
    context.strokeStyle = '#7c6a52'; context.lineWidth = 1.5; context.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const ry = deckY - rh + 4 + i * (rh * 2 - 8) / 3;
      context.beginPath();
      context.moveTo(edgeX + dir * 2, ry);
      context.lineTo(edgeX + dir * 17, ry + 6);
      context.stroke();
    }
    context.restore();
  }
  if (brokenLeftEnd) drawBrokenEdge(x1, 1);
  if (brokenRightEnd) drawBrokenEdge(x2, -1);
}

function drawBridge(b) {
  if (!b) return;
  ctx.save();
  let shakeX = b.shakeT > 0 ? Math.sin(state.time * 40) * 4 * b.shakeT : 0;
  if (b.shakeT > 0) b.shakeT -= 0.04;

  const spanHalf = BRIDGE_SPAN_HALF;
  const deckY = b.y;
  const leftX = b.x - spanHalf + shakeX, rightX = b.x + spanHalf + shakeX;
  const midX = b.x + shakeX;

  ctx.globalAlpha = b.lost ? 0.9 : 1;

  if (!b.lost) {
    drawBridgeSpan(ctx, leftX, rightX, deckY, false, false);
    drawHPBar(ctx, b.x, deckY - BRIDGE_ROAD_HALF - 17, 90, 7, b.hp);
  } else {
    // Collapsed: two shorter stubs with a gap in the middle, jagged
    // broken ends, and a rubble pile sitting in the gap.
    const gapHalf = (rightX - leftX) * 0.16;
    drawBridgeSpan(ctx, leftX, midX - gapHalf, deckY, false, true);
    drawBridgeSpan(ctx, midX + gapHalf, rightX, deckY, true, false);

    ctx.fillStyle = 'rgba(90,80,68,0.85)';
    ctx.beginPath();
    ctx.ellipse(midX, deckY + BRIDGE_ROAD_HALF - 4, gapHalf * 0.9, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(60,54,46,0.7)';
    [-0.6, -0.3, 0, 0.3, 0.6].forEach((f, i) => {
      ctx.beginPath();
      ctx.arc(midX + f * gapHalf, deckY + BRIDGE_ROAD_HALF - 11 + (i % 2) * 7, 3 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#2c2520'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center';
    ctx.fillText('💥', midX, deckY - BRIDGE_ROAD_HALF - 12);
  }

  ctx.restore();
}

// ----- House styles: five distinct Filipino house archetypes -----
// Each house cycles through these (see loadTownMap's `style: i %
// HOUSE_STYLES.length`) so a town full of houses reads as a varied
// neighborhood — bahay kubo, GI-sheet concrete bungalows, wooden capiz
// houses, a sari-sari store house, and a concrete hollow-block house —
// rather than the same box repeated with different paint. Each entry's
// `draw` handles its own walls/roof/windows/features; `groundOffset`
// positions the drop shadow at that style's actual ground line (the
// bahay kubo sits higher on stilts), and `hpBarOffset`/`emojiOffset`
// position the shared HP bar / "washed away" marker above each style's
// own roofline.
const HOUSE_STYLES = [
  { // 0: Bahay kubo — elevated nipa hut on stilts, thatched roof
    groundOffset: 20, hpBarOffset: -44, emojiOffset: -22,
    draw(ctx, x, y, color, lost) {
      const wall = lost ? '#6b655c' : color;
      const wood = lost ? '#4a4038' : '#6b4a30';
      const roofCol = lost ? '#5c5348' : '#c9a15c';
      // Stilts
      ctx.fillStyle = wood;
      ctx.fillRect(x - 16, y + 2, 4, 16);
      ctx.fillRect(x + 12, y + 2, 4, 16);
      ctx.fillRect(x - 3, y + 4, 4, 14);
      // Floor platform
      ctx.fillStyle = lost ? '#5c564c' : '#8a6a45';
      ctx.fillRect(x - 19, y - 1, 38, 4);
      // Ladder
      ctx.strokeStyle = wood; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x + 19, y + 1); ctx.lineTo(x + 24, y + 16);
      ctx.moveTo(x + 24, y + 1); ctx.lineTo(x + 29, y + 16);
      for (let r = 0; r < 3; r++) {
        const ly = y + 5 + r * 4;
        ctx.moveTo(x + 20, ly); ctx.lineTo(x + 28, ly);
      }
      ctx.stroke();
      // Woven sawali walls
      ctx.fillStyle = wall;
      ctx.fillRect(x - 17, y - 14, 34, 14);
      if (!lost) {
        ctx.strokeStyle = 'rgba(80,55,25,0.28)'; ctx.lineWidth = 1;
        for (let wy = -12; wy < -1; wy += 3) {
          ctx.beginPath(); ctx.moveTo(x - 17, y + wy); ctx.lineTo(x + 17, y + wy); ctx.stroke();
        }
      }
      // Window opening (no glass, just a shuttered gap)
      ctx.fillStyle = lost ? '#3a3630' : '#241c14';
      ctx.fillRect(x - 13, y - 11, 8, 7);
      if (!lost) {
        ctx.strokeStyle = '#8a6a45'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 9, y - 11); ctx.lineTo(x - 9, y - 4);
        ctx.moveTo(x - 13, y - 7.5); ctx.lineTo(x - 5, y - 7.5);
        ctx.stroke();
      }
      // Door
      ctx.fillStyle = lost ? '#332e28' : '#4a3520';
      ctx.fillRect(x + 2, y - 11, 8, 10);
      // Steep thatched (nipa) roof
      ctx.fillStyle = roofCol;
      ctx.beginPath();
      ctx.moveTo(x - 24, y - 14); ctx.lineTo(x, y - 38); ctx.lineTo(x + 24, y - 14);
      ctx.closePath(); ctx.fill();
      if (!lost) {
        // Layered thatch texture, tapering with the roof's slope
        ctx.strokeStyle = 'rgba(120,90,40,0.4)'; ctx.lineWidth = 1;
        const layers = 6;
        for (let l = 1; l < layers; l++) {
          const t = l / layers;
          const ly = -14 - t * 24;
          const halfW = 24 * (1 - t);
          ctx.beginPath(); ctx.moveTo(x - halfW, y + ly); ctx.lineTo(x + halfW, y + ly); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,235,180,0.3)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x - 20, y - 14.6); ctx.lineTo(x, y - 37); ctx.lineTo(x + 20, y - 14.6); ctx.stroke();
      }
    }
  },
  { // 1: Concrete bungalow with a corrugated GI-sheet roof
    groundOffset: 16, hpBarOffset: -28, emojiOffset: -18,
    draw(ctx, x, y, color, lost) {
      const wall = lost ? '#726d64' : color;
      const roofCol = lost ? '#5c5851' : '#9aa0a6';
      // Walls
      ctx.fillStyle = wall;
      ctx.fillRect(x - 20, y - 8, 40, 24);
      // Concrete base trim
      ctx.fillStyle = lost ? '#5c5851' : '#c9c4ba';
      ctx.fillRect(x - 20, y + 12, 40, 4);
      // Jalousie window (horizontal glass slats)
      ctx.fillStyle = lost ? '#4a4a4a' : '#89bcd6';
      ctx.fillRect(x - 17, y - 4, 12, 10);
      if (!lost) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
        for (let s = 0; s < 4; s++) { ctx.beginPath(); ctx.moveTo(x - 17, y - 4 + s * 2.5); ctx.lineTo(x - 5, y - 4 + s * 2.5); ctx.stroke(); }
      }
      // Second small window
      ctx.fillStyle = lost ? '#4a4a4a' : '#89bcd6';
      ctx.fillRect(x + 6, y - 4, 10, 8);
      // Door
      ctx.fillStyle = lost ? '#332e28' : '#5a4632';
      ctx.fillRect(x - 5, y + 4, 9, 12);
      // Low-pitch GI sheet roof
      ctx.fillStyle = roofCol;
      ctx.beginPath();
      ctx.moveTo(x - 24, y - 8); ctx.lineTo(x - 16, y - 20); ctx.lineTo(x + 16, y - 20); ctx.lineTo(x + 24, y - 8);
      ctx.closePath(); ctx.fill();
      if (!lost) {
        // Corrugation lines, interpolated between the roof's top and bottom edges
        ctx.strokeStyle = 'rgba(60,65,70,0.4)'; ctx.lineWidth = 1;
        const stripes = 9;
        for (let s = 0; s <= stripes; s++) {
          const t = s / stripes;
          const bx = -24 + t * 48, tx = -16 + t * 32;
          ctx.beginPath(); ctx.moveTo(x + bx, y - 8); ctx.lineTo(x + tx, y - 20); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x - 16, y - 20); ctx.lineTo(x + 16, y - 20); ctx.stroke();
      }
    }
  },
  { // 2: Wooden house with capiz-shell sliding windows
    groundOffset: 16, hpBarOffset: -40, emojiOffset: -20,
    draw(ctx, x, y, color, lost) {
      const wall = lost ? '#6e685f' : color;
      const roofCol = lost ? '#544b42' : '#7a4a3a';
      // Wooden plank walls
      ctx.fillStyle = wall;
      ctx.fillRect(x - 20, y - 10, 40, 26);
      if (!lost) {
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
        for (let wy = -8; wy < 14; wy += 4) { ctx.beginPath(); ctx.moveTo(x - 20, y + wy); ctx.lineTo(x + 20, y + wy); ctx.stroke(); }
      }
      // Capiz-shell window (pearly grid panes)
      ctx.fillStyle = lost ? '#4a4a44' : '#ece3cf';
      ctx.fillRect(x - 17, y - 6, 13, 12);
      if (!lost) {
        ctx.strokeStyle = 'rgba(120,95,60,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 17, y); ctx.lineTo(x - 4, y);
        ctx.moveTo(x - 10.5, y - 6); ctx.lineTo(x - 10.5, y + 6);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(x - 16, y - 5, 5, 5);
      }
      // Door
      ctx.fillStyle = lost ? '#332e28' : '#5a3d24';
      ctx.fillRect(x + 4, y - 2, 10, 14);
      // Eave shadow
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x - 22, y - 12, 44, 3);
      // Hip roof
      ctx.fillStyle = roofCol;
      ctx.beginPath();
      ctx.moveTo(x - 27, y - 12); ctx.lineTo(x - 8, y - 32); ctx.lineTo(x + 8, y - 32); ctx.lineTo(x + 27, y - 12);
      ctx.closePath(); ctx.fill();
      if (!lost) {
        ctx.strokeStyle = 'rgba(255,220,190,0.3)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x - 8, y - 32); ctx.lineTo(x + 8, y - 32); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - 27, y - 12); ctx.lineTo(x - 8, y - 32); ctx.moveTo(x + 27, y - 12); ctx.lineTo(x + 8, y - 32); ctx.stroke();
      }
    }
  },
  { // 3: Sari-sari store house — a small storefront window built into the house
    groundOffset: 16, hpBarOffset: -22, emojiOffset: -16,
    draw(ctx, x, y, color, lost) {
      const wall = lost ? '#726d64' : color;
      const roofCol = lost ? '#544b42' : '#7a3b30';
      // Walls
      ctx.fillStyle = wall;
      ctx.fillRect(x - 20, y - 8, 40, 24);
      // Store counter opening
      ctx.fillStyle = lost ? '#3a3630' : '#241c14';
      ctx.fillRect(x - 17, y - 4, 22, 10);
      if (!lost) {
        // Counter ledge
        ctx.fillStyle = '#8a6a45';
        ctx.fillRect(x - 18, y + 6, 24, 3);
        // Hanging snack items
        const snackColors = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a'];
        snackColors.forEach((c, s2) => { ctx.fillStyle = c; ctx.fillRect(x - 15 + s2 * 5, y - 4, 3, 6); });
        // Small hand-painted sign board
        ctx.fillStyle = '#e63946';
        ctx.fillRect(x - 18, y - 14, 20, 6);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 5px Arial'; ctx.textAlign = 'center';
        ctx.fillText('STORE', x - 8, y - 10);
      }
      // Small side window
      ctx.fillStyle = lost ? '#4a4a4a' : '#a8e4f8';
      ctx.fillRect(x + 9, y - 4, 8, 8);
      // Roof
      ctx.fillStyle = roofCol;
      ctx.beginPath();
      ctx.moveTo(x - 24, y - 8); ctx.lineTo(x, y - 24); ctx.lineTo(x + 24, y - 8);
      ctx.closePath(); ctx.fill();
      if (!lost) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x - 19, y - 8); ctx.lineTo(x, y - 24); ctx.lineTo(x + 19, y - 8); ctx.stroke();
      }
    }
  },
  { // 4: Concrete hollow-block (CHB) house — boxy, flat parapet roof
    groundOffset: 16, hpBarOffset: -25, emojiOffset: -16,
    draw(ctx, x, y, color, lost) {
      const wall = lost ? '#726d64' : color;
      // Walls with a subtle block grid texture
      ctx.fillStyle = wall;
      ctx.fillRect(x - 20, y - 14, 40, 30);
      if (!lost) {
        ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1;
        for (let by = -12; by < 14; by += 5) { ctx.beginPath(); ctx.moveTo(x - 20, y + by); ctx.lineTo(x + 20, y + by); ctx.stroke(); }
        for (let bx = -20; bx <= 20; bx += 10) { ctx.beginPath(); ctx.moveTo(x + bx, y - 14); ctx.lineTo(x + bx, y + 16); ctx.stroke(); }
      }
      // Flat roof / parapet cap
      ctx.fillStyle = lost ? '#5c5851' : '#b8b2a4';
      ctx.fillRect(x - 22, y - 17, 44, 5);
      // Awning window
      ctx.fillStyle = lost ? '#4a4a4a' : '#a8d8e8';
      ctx.fillRect(x - 15, y - 8, 12, 10);
      if (!lost) {
        ctx.fillStyle = '#8a8478';
        ctx.beginPath(); ctx.moveTo(x - 17, y - 8); ctx.lineTo(x - 13, y - 13); ctx.lineTo(x - 1, y - 13); ctx.lineTo(x - 3, y - 8); ctx.closePath(); ctx.fill();
      }
      // Door
      ctx.fillStyle = lost ? '#332e28' : '#4a3f36';
      ctx.fillRect(x + 4, y - 4, 10, 16);
    }
  }
];

function drawHouse(h) {
  ctx.save();
  let shakeX = h.shakeT > 0 ? Math.sin(state.time * 40) * 4 * h.shakeT : 0;
  if (h.shakeT > 0) h.shakeT -= 0.04;
  const x = h.x + shakeX, y = h.y;
  const style = HOUSE_STYLES[(h.style || 0) % HOUSE_STYLES.length];

  // Layered drop shadow for depth — positioned at this style's actual
  // ground line (the bahay kubo's shadow sits lower, under its stilts).
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(x, y + style.groundOffset, 34, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.beginPath(); ctx.ellipse(x, y + style.groundOffset, 24, 6.5, 0, 0, Math.PI * 2); ctx.fill();

  ctx.globalAlpha = h.lost ? 0.35 : 1;
  style.draw(ctx, x, y, h.color, h.lost);

  if (!h.lost) {
    drawHPBar(ctx, x, y + style.hpBarOffset, 40, 7, h.hp);
  } else {
    ctx.fillStyle = '#3a2f2a'; ctx.font = 'bold 16px Trebuchet MS'; ctx.textAlign = 'center'; ctx.fillText('🌊', x, y + style.emojiOffset);
  }
  ctx.restore();
}

function drawItemShape(context, type) {
  switch (type) {
    case 'sandbag': 
      context.fillStyle = '#d9b56b'; context.strokeStyle = '#a8823f'; context.lineWidth = 2; 
      context.beginPath(); context.ellipse(0, 4, 18, 11, 0, 0, Math.PI * 2); context.fill(); context.stroke(); 
      context.beginPath(); context.ellipse(0, -6, 11, 7, 0, 0, Math.PI * 2); context.fillStyle = '#e6c98a'; context.fill(); context.stroke(); break;
    case 'shovel': 
      context.strokeStyle = '#7a5230'; context.lineWidth = 4; context.beginPath(); context.moveTo(0, -20); context.lineTo(0, 6); context.stroke(); 
      context.fillStyle = '#a9774a'; context.strokeStyle = '#7a5230'; context.lineWidth = 1.5; context.beginPath(); context.moveTo(-9, 4); context.quadraticCurveTo(0, 20, 9, 4); context.lineTo(7, 10); context.quadraticCurveTo(0, 22, -7, 10); context.closePath(); context.fill(); context.stroke(); break;
    case 'tree': 
      context.fillStyle = '#7a5230'; context.fillRect(-3, 6, 6, 12);
      context.strokeStyle = '#2f6b34'; context.lineWidth = 1.5;
      context.fillStyle = '#3f8a46';
      context.beginPath(); context.arc(-9, 0, 9, 0, Math.PI * 2); context.fill(); context.stroke();
      context.beginPath(); context.arc(9, 0, 9, 0, Math.PI * 2); context.fill(); context.stroke();
      context.fillStyle = '#4d9a55';
      context.beginPath(); context.arc(0, -9, 12, 0, Math.PI * 2); context.fill(); context.stroke();
      context.fillStyle = '#63b768';
      context.beginPath(); context.arc(-4, -14, 6.5, 0, Math.PI * 2); context.fill(); break;
    case 'dam': 
      context.fillStyle = '#c9c2b6'; context.strokeStyle = '#847c6e'; context.lineWidth = 2; context.fillRect(-28, -14, 56, 30); context.strokeRect(-28, -14, 56, 30); 
      context.fillStyle = '#847c6e'; for (let i = 0; i < 4; i++) context.fillRect(-22 + i * 15, -9, 6, 20); break;
  }
}

// Draws a premium rounded-pill HP bar with gradient fill + shine highlight.
// cx/cy is the CENTER-TOP anchor. w=full bar width, h=bar height, hp=0..100.
function drawHPBar(context, cx, topY, w, h, hp) {
  const x = cx - w / 2;
  const r = h / 2;
  // Shadow track
  context.fillStyle = 'rgba(0,0,0,0.38)';
  roundRectCtx(context, x + 1, topY + 1, w, h, r); context.fill();
  // Track background
  context.fillStyle = 'rgba(255,255,255,0.2)';
  roundRectCtx(context, x, topY, w, h, r); context.fill();
  // Colored fill
  const fillW = Math.max(0, w * (hp / 100));
  if (fillW > 1) {
    const hiColor  = hp > 50 ? '#22c55e' : (hp > 20 ? '#fbbf24' : '#ef4444');
    const loColor  = hp > 50 ? '#15803d' : (hp > 20 ? '#d97706' : '#b91c1c');
    const fillGrad = context.createLinearGradient(x, topY, x, topY + h);
    fillGrad.addColorStop(0, hiColor);
    fillGrad.addColorStop(1, loColor);
    context.fillStyle = fillGrad;
    roundRectCtx(context, x, topY, fillW, h, r); context.fill();
    // Shine
    context.fillStyle = 'rgba(255,255,255,0.28)';
    roundRectCtx(context, x, topY, fillW, Math.ceil(h * 0.48), r); context.fill();
  }
}

/* ---- Falling money bag collectibles — burlap sacks that drift down
   the scene. Tapping one earns a peso bonus. Each tier has its own
   material: ₱50 = plain burlap, ₱100 = worn leather-brown, ₱200 = rich
   gold-trimmed sack. The bag sways gently and bobs as it falls. ---- */
function drawFallingSuns(context) {
  if (!state.fallingSuns || state.fallingSuns.length === 0) return;
  context.save();

  state.fallingSuns.forEach(s => {
    // Fade in during first 0.4 s, fade out during last 22% of life
    const lifeRatio = s.age / s.maxAge;
    let alpha = Math.min(1, s.age / 0.4) * Math.min(1, (1 - lifeRatio) / 0.22);
    if (s.popT > 0) alpha = s.popT; // pop-fade on collection
    if (alpha <= 0.01) return;

    const pulse = 1 + Math.sin(ambientTime * 3.2 + s.pulsePhase) * 0.05;
    const r = (s.value === 200 ? 24 : s.value === 100 ? 20 : 17) * pulse;
    const sway = Math.sin(ambientTime * 2.4 + s.pulsePhase) * 3;

    // Tier palettes
    let glowColor, bagLight, bagMid, bagDark, tieColor, textColor;
    if (s.value === 200) {
      glowColor = 'rgba(250,204,21,0.55)';
      [bagLight, bagMid, bagDark] = ['#f3d98b', '#c99a3f', '#8a6420'];
      tieColor = '#7a4f14';
      textColor = '#4a2e0a';
    } else if (s.value === 100) {
      glowColor = 'rgba(180,130,60,0.45)';
      [bagLight, bagMid, bagDark] = ['#c9a06a', '#a4753f', '#6e4c25'];
      tieColor = '#4a3218';
      textColor = '#2e1c0a';
    } else {
      glowColor = 'rgba(200,170,120,0.4)';
      [bagLight, bagMid, bagDark] = ['#e2c99a', '#b9955f', '#8a6c3e'];
      tieColor = '#5c4322';
      textColor = '#3a2712';
    }

    const cx = s.x + sway, cy = s.y;
    context.globalAlpha = alpha;

    // Soft glow halo behind the bag
    const glow = context.createRadialGradient(cx, cy, 0, cx, cy, r * 2.4);
    glow.addColorStop(0, glowColor);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = glow;
    context.beginPath(); context.arc(cx, cy, r * 2.4, 0, Math.PI * 2); context.fill();

    // Drop shadow under the bag
    context.fillStyle = 'rgba(0,0,0,0.2)';
    context.beginPath();
    context.ellipse(cx, cy + r * 0.95, r * 0.55, r * 0.16, 0, 0, Math.PI * 2);
    context.fill();

    const w = r * 1.55, h = r * 1.75;

    // Sack body — bulging bottom, tapered neck near the top
    const bodyGrad = context.createRadialGradient(cx - w * 0.22, cy - h * 0.05, r * 0.2, cx, cy + h * 0.05, w);
    bodyGrad.addColorStop(0, bagLight);
    bodyGrad.addColorStop(0.55, bagMid);
    bodyGrad.addColorStop(1, bagDark);
    context.fillStyle = bodyGrad;
    context.beginPath();
    context.moveTo(cx - w * 0.48, cy - h * 0.02);
    context.bezierCurveTo(cx - w * 0.6, cy + h * 0.35, cx - w * 0.36, cy + h * 0.55, cx, cy + h * 0.55);
    context.bezierCurveTo(cx + w * 0.36, cy + h * 0.55, cx + w * 0.6, cy + h * 0.35, cx + w * 0.48, cy - h * 0.02);
    context.bezierCurveTo(cx + w * 0.4, cy - h * 0.24, cx + w * 0.16, cy - h * 0.3, cx, cy - h * 0.3);
    context.bezierCurveTo(cx - w * 0.16, cy - h * 0.3, cx - w * 0.4, cy - h * 0.24, cx - w * 0.48, cy - h * 0.02);
    context.closePath();
    context.fill();

    // Burlap fold lines
    context.strokeStyle = 'rgba(0,0,0,0.12)';
    context.lineWidth = 1;
    for (let f = -1; f <= 1; f++) {
      context.beginPath();
      context.moveTo(cx + f * w * 0.18, cy - h * 0.22);
      context.quadraticCurveTo(cx + f * w * 0.24, cy + h * 0.12, cx + f * w * 0.16, cy + h * 0.42);
      context.stroke();
    }

    // Soft top-left shine
    context.fillStyle = 'rgba(255,255,255,0.22)';
    context.beginPath();
    context.ellipse(cx - w * 0.2, cy - h * 0.02, w * 0.16, h * 0.14, -0.4, 0, Math.PI * 2);
    context.fill();

    // Tied neck
    context.fillStyle = bagDark;
    context.beginPath();
    context.ellipse(cx, cy - h * 0.31, w * 0.2, h * 0.07, 0, 0, Math.PI * 2);
    context.fill();

    // Drawstring tie (X-wrap)
    context.strokeStyle = tieColor;
    context.lineWidth = 2.2;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(cx - w * 0.16, cy - h * 0.36); context.lineTo(cx + w * 0.16, cy - h * 0.26);
    context.moveTo(cx + w * 0.16, cy - h * 0.36); context.lineTo(cx - w * 0.16, cy - h * 0.26);
    context.stroke();

    // Little pinched top poof of fabric above the tie
    context.fillStyle = bagMid;
    context.beginPath();
    context.ellipse(cx, cy - h * 0.42, w * 0.09, h * 0.06, 0, 0, Math.PI * 2);
    context.fill();

    // Peso value label on the bag body
    context.fillStyle = textColor;
    context.font = `bold ${r < 19 ? 11 : 13}px 'Baloo 2', sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('\u20b1' + s.value, cx, cy + h * 0.08);

    // Sparkle accent for the rare gold tier
    if (s.value === 200) {
      context.fillStyle = `rgba(255,250,210,${0.7 * alpha})`;
      context.beginPath();
      context.arc(cx + w * 0.3, cy - h * 0.12, 2, 0, Math.PI * 2);
      context.fill();
    }
  });

  context.restore();
}

function render() {
  ctx.save(); ctx.clearRect(0, 0, W, H);
  
  if (state.screenShake > 0) {
    ctx.translate((Math.random() - 0.5) * state.screenShake, (Math.random() - 0.5) * state.screenShake);
  }

  /* ---- Sky: vibrant 4-stop gradient with warm golden horizon band; crossfades to dark storm sky ---- */
  const currentTop     = lerpColor('#55c5f0', '#0c1620', state.skyTransition);
  const currentUpper   = lerpColor('#7ed8ef', '#151e2c', state.skyTransition);
  const currentHorizon = lerpColor('#f2ca72', '#1c2a38', state.skyTransition); // warm golden horizon
  const currentBottom  = lerpColor('#d8eff5', '#28404e', state.skyTransition);

  const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  skyGrad.addColorStop(0,    currentTop);
  skyGrad.addColorStop(0.35, currentUpper);
  skyGrad.addColorStop(0.6,  currentHorizon);
  skyGrad.addColorStop(1,    currentBottom);
  ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, H);

  // Warm amber haze band near the horizon — volcanic atmospheric glow
  if (state.skyTransition < 0.9) {
    const amberBand = ctx.createLinearGradient(0, 275, 0, 490);
    amberBand.addColorStop(0,   'rgba(250,185,70,0)');
    amberBand.addColorStop(0.42,`rgba(248,172,55,${0.2 * (1 - state.skyTransition)})`);
    amberBand.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = amberBand; ctx.fillRect(0, 275, W, 215);
  }

  // Horizon haze fade — softens the join between sky and mountain base
  const horizonHaze = ctx.createLinearGradient(0, 340, 0, 500);
  horizonHaze.addColorStop(0, 'rgba(255,255,255,0)');
  horizonHaze.addColorStop(1, `rgba(215,232,242,${0.2 * (1 - state.skyTransition * 0.85)})`);
  ctx.fillStyle = horizonHaze; ctx.fillRect(0, 340, W, 160);

  if (state.skyTransition < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - state.skyTransition;
    const sunX = 78, sunY = 70;
    // Sun corona rays
    ctx.strokeStyle = 'rgba(255,236,160,0.18)';
    for (let ri = 0; ri < 8; ri++) {
      const ra = (ri / 8) * Math.PI * 2;
      ctx.lineWidth = 2 + (ri % 2) * 1.8;
      ctx.beginPath();
      ctx.moveTo(sunX + Math.cos(ra) * 28, sunY + Math.sin(ra) * 28);
      ctx.lineTo(sunX + Math.cos(ra) * 170, sunY + Math.sin(ra) * 170);
      ctx.stroke();
    }
    // Sun radial gradient
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 200);
    sunGrad.addColorStop(0,    'rgba(255,254,210,1)');
    sunGrad.addColorStop(0.07, 'rgba(255,228,100,0.9)');
    sunGrad.addColorStop(0.2,  'rgba(255,210,70,0.5)');
    sunGrad.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath(); ctx.arc(sunX, sunY, 200, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* ---- Clouds drift behind the mountain silhouette ---- */
  drawClouds(ctx, 1 - state.skyTransition);

  /* ---- Mountain: two pre-rendered lighting states cross-faded by weather (cheap) ---- */
  if (!isMountainCached) buildMountainCache();
  ctx.drawImage(mountainCanvasDay, 0, 0, W, H);
  if (state.skyTransition > 0) {
    ctx.save(); ctx.globalAlpha = state.skyTransition;
    ctx.drawImage(mountainCanvasNight, 0, 0, W, H);
    ctx.restore();
  }

  /* ---- Crater lake: the only part of the volcano still animated live each frame ---- */
  const crX = CRATER_X, crY = CRATER_Y;
  const lakeGrad = ctx.createRadialGradient(crX - 8, crY - 4, 3, crX, crY, 30);
  lakeGrad.addColorStop(0, lerpColor('#a7e6d6', '#233f3a', state.skyTransition));
  lakeGrad.addColorStop(0.6, lerpColor('#4fa89b', '#1a322e', state.skyTransition));
  lakeGrad.addColorStop(1, lerpColor('#2c6b64', '#0f211f', state.skyTransition));
  ctx.fillStyle = lakeGrad;
  ctx.beginPath(); ctx.ellipse(crX, crY, 26, 10, -0.06, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 * (1 - state.skyTransition)})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(crX - 5, crY - 3, 13, 4, -0.25, Math.PI * 1.1, Math.PI * 1.85); ctx.stroke();

  ctx.save();
  for (let w = 0; w < 3; w++) {
    const wx = crX - 10 + w * 10 + Math.sin(state.time * 0.6 + w) * 3;
    const wy = crY - 10 - w * 5 - ((state.time * 4) % 20);
    const steamAlpha = Math.max(0, 0.12 - w * 0.03) * (1 - state.skyTransition * 0.4);
    const steamGrad = ctx.createRadialGradient(wx, wy, 1, wx, wy, 11);
    steamGrad.addColorStop(0, `rgba(255,255,255,${steamAlpha})`);
    steamGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = steamGrad;
    ctx.beginPath(); ctx.ellipse(wx, wy, 11, 16, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // Birds: lazy pre-storm flight, or a one-shot flee-the-scene animation
  // once the storm has begun (see drawBirds() for the two modes). Drawn in
  // front of the mountain silhouette since birds read as much closer to
  // camera than the volcano itself.
  drawBirds(ctx);

  /* ---- Volcanic smoke & ash: quiet continuous degassing above the crater.
     Drawn after the mountain so the plume reads as rising into open sky
     in front of the peak, and after the crater-lake steam so the two
     effects layer naturally (tight steam wisps + a taller drifting plume). ---- */
  drawSmoke(ctx, 1 - state.skyTransition);
  drawAshParticles(ctx);

  if (!isStaticRendered) cacheStaticElements();
  ctx.drawImage(staticCanvas, 0, 0, W, H);

  // Animated river current — sparkles and traveling highlight streaks
  // drawn fresh every frame (the base water/banks are baked into
  // staticCanvas above; only the motion cues live here).
  drawRiverLiveDetail(ctx);

  // Trees, bushes, and grass are drawn live (not baked into staticCanvas)
  // so they can gently sway — see the LIVING ENVIRONMENT section.
  drawPlants(ctx);
  drawGrassTufts(ctx);
  
  drawLaharFlow(ctx);
  drawDebris(ctx);

  // Bridge (Angeles only) sits above the mud channel it spans, with its
  // ambient traffic drawn right after so cars read as driving on the deck.
  drawBridge(state.bridge);
  drawCars(ctx);
  
  state.placedItems.forEach(item => {
    if (item.dead) return;
    ctx.save(); ctx.translate(item.x, item.y);
    const s = item.hp === Infinity ? 1 : Math.max(0.5, item.hp / 100);
    ctx.scale(s, s); drawItemShape(ctx, item.type); ctx.restore();
  });
  
  drawChurch(state.church);
  drawSchool(state.school);
  drawBaboRobot(state.robot); 
  drawMonument(state.monument);
  state.houses.forEach(drawHouse);
  drawSplashes(ctx);
  drawRipples(ctx);

  ctx.save(); ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'; roundRectCtx(ctx, 16, 190, 22, 180, 8); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px Trebuchet MS'; ctx.textAlign = 'center';
  ctx.save(); ctx.translate(15, 300); ctx.rotate(-Math.PI / 2); ctx.fillText('LAHAR INTENSITY', 0, 0); ctx.restore();

  const barHeightMax = 140, barX = 23, barYStart = 220; 
  roundRectCtx(ctx, barX, barYStart, 8, barHeightMax, 4); ctx.fillStyle = '#e6dcc0'; ctx.fill();
  const currentFillHeight = barHeightMax * (state.laharVolume / 100);
  const fillY = barYStart + (barHeightMax - currentFillHeight);
  if (currentFillHeight > 0) {
    roundRectCtx(ctx, barX, fillY, 8, currentFillHeight, 4);
    ctx.fillStyle = state.laharVolume > 70 ? '#ef4444' : (state.laharVolume > 35 ? '#fbbf24' : '#22c55e'); ctx.fill();
  }
  ctx.restore();  

  if (state.raining) {
    ctx.save();
    ctx.lineCap = 'round';
    state.particles.forEach((p, idx) => {
      const alpha = 0.22 + (idx % 7) * 0.055;
      const thick = 0.9 + (idx % 4) * 0.35;
      ctx.strokeStyle = `rgba(155,205,255,${alpha})`;
      ctx.lineWidth = thick;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 8, p.y + 20); ctx.stroke();
    });
    ctx.restore();
  }

  if (state.lightningFlash > 0 && state.lightningPath.length > 0) {
    ctx.save(); ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 3.5; ctx.shadowBlur = 20; ctx.shadowColor = '#0284c7'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(state.lightningPath[0].x, state.lightningPath[0].y);
    for (let i = 1; i < state.lightningPath.length; i++) ctx.lineTo(state.lightningPath[i].x, state.lightningPath[i].y);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.shadowBlur = 0; ctx.stroke(); ctx.restore();
  }

  if (state.lightningFlash > 0) {
    ctx.save(); ctx.fillStyle = `rgba(244, 248, 255, ${Math.min(0.85, state.lightningFlash * 2.8)})`; ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  // Falling money bag collectibles — drawn in front of everything (weather,
  // buildings, lahar, rain) but behind the drag-preview guide so they're
  // never obscured.
  drawFallingSuns(ctx);

  // Always drawn last so the placement guide stays visible above every
  // other layer (weather, buildings, lahar) while a tool is being dragged.
  drawDragPreview(ctx);

  ctx.restore(); 
}

let lastT = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  // Ambient environment clock always advances — independent of state.running —
  // so the volcano/sky/clouds/smoke feel alive on the menu screens too.
  ambientTime += dt;
  updateClouds(dt);
  updateSmoke(dt);
  updateAsh(dt);

  simulate(dt);
  render();
  requestAnimationFrame(loop);
}

/* ---- Money bag tap/click collection handler ----------------------------------
   Attached to the outer wrap so it fires for both mouse clicks and touch taps.
   We convert screen coords -> canvas-space coords, check every live bag's hit
   radius (generous: bag body radius + 8px buffer for fat fingers / kiosk touch),
   and if one is hit we credit its value, trigger the pop-fade animation, and
   show a floating ₱-value label toast. Only active during gameplay. ---------- */
wrap.addEventListener('pointerdown', (e) => {
  // Only collect if the storm has started and the game isn't over
  if (!state.running || state.gameOver || !state.fallingSuns.length) return;
  // Don't steal events that started on the toolbox or HUD
  if (e.target !== canvas && e.target !== document.getElementById('dropLayer')) return;

  const rect = wrap.getBoundingClientRect();
  const cx = (e.clientX - rect.left) / rect.width  * W;
  const cy = (e.clientY - rect.top)  / rect.height * H;

  for (let i = state.fallingSuns.length - 1; i >= 0; i--) {
    const s = state.fallingSuns[i];
    if (s.popT > 0) continue; // already collected
    const hitR = (s.value === 200 ? 26 : s.value === 100 ? 22 : 18) + 8;
    if (Math.hypot(cx - s.x, cy - s.y) <= hitR) {
      // Award budget
      const earned = s.value;
      state.budget = Math.min(state.budgetMax, state.budget + earned);
      updateBudgetUI();
      refreshToolboxAfford();
      flashBudgetBoost();

      // Mark as collected — pop animation starts, sun fades quickly
      s.popT   = 1.0;  // drawFallingSuns uses popT > 0 as an override alpha
      s.maxAge = s.age + 0.28; // expire very shortly after

      showToast(`💰 +₱${earned} — Money bag collected!`, 1100);
      break; // one bag per tap
    }
  }
});

function resetState() {
  laharRainTrack.pause();
  laharRainTrack.currentTime = 0;

  // Look up the active difficulty's channel count BEFORE generating paths,
  // so Easy/Medium/Hard produce 3/4/5 independent lahar channels respectively.
  const diffSettings = DIFFICULTY_SETTINGS[gameSettings.difficulty || 'easy'];
  generateRandomPaths(diffSettings.channelCount);
  loadTownMap();
  loadDifficulty();

  state = { 
    ...state, 
    running: false, raining: false, gameOver: false, won: false, 
    time: 0, rainAmount: 0, stormTime: 0, stormOver: false, postStormTimer: 0, laharVolume: 0, skyTransition: 0, screenShake: 0, lightningFlash: 0,
    // laharProgresses is sized to match however many channels were just
    // generated (3/4/5), instead of a hardcoded 3-element array.
    lightningPath: [], laharProgresses: new Array(channelPaths.length).fill(0), placedItems: [], particles: [], flowParticles: [], ripples: [],
    debris: [], splashes: [],
    comboCount: 0, lastPlacementTime: -999, maxCombo: 0,
    birdsFleeing: false, birdsFleeStartAmbient: 0,
    carsFleeing: false, carsFleeStartAmbient: 0,
    fallingSuns: [], sunSpawnTimer: 6,
  };
  
  document.getElementById('rainPanel').classList.remove('active');
  document.getElementById('rainStatus').textContent = 'Tap to start'; 
  buildToolbox();
}

let gameStarted = false;
let pausedRunningState = false;

function startGame() {
  resetState();
  gameStarted = true;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  document.getElementById('overlay').classList.add('hidden');
}

/* ---------------- INTERACTION CAPTURES ---------------- */
// Only the "Select" button inside each town card triggers selection —
// the card itself is no longer clickable, avoiding accidental taps
// (e.g. while scrolling/reading the description) from switching towns.
document.querySelectorAll('.town-card .select-town-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const card = btn.closest('.town-card');
    if (!card) return;
    document.querySelectorAll('.town-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    gameSettings.town = card.dataset.town;
  });
});

document.querySelectorAll('#difficultySelector .diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const diff = btn.dataset.diff;
    if (!isDifficultyUnlocked(diff)) {
      playSound('error');
      const label = diff === 'medium' ? 'Easy' : 'Medium';
      showToast(`🔒 Win on ${label} first to unlock this!`);
      return;
    }
    document.querySelectorAll('#difficultySelector .diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    gameSettings.difficulty = diff;
  });
});

document.getElementById('nextToTownBtn').addEventListener('click', () => {
  showTownSelection();
});

document.getElementById('backToObjectiveBtn').addEventListener('click', () => {
  showObjectiveSelection();
});

document.getElementById('nextToDifficultyBtn').addEventListener('click', () => {
  if (!gameSettings.town) {
    showToast("Please select a town first!");
    return;
  }
  showDifficultySelection();
});

document.getElementById('backToTownBtn').addEventListener('click', () => {
  showTownSelection();
});

document.getElementById('nextToInfoBtn').addEventListener('click', () => {
  const checkedRadio = document.querySelector('input[name="difficulty"]:checked');
  gameSettings.difficulty = checkedRadio ? checkedRadio.value : 'easy';
  showTownInfo();
});

document.getElementById('backToDifficultyBtn').addEventListener('click', () => {
  showDifficultySelection();
});

document.getElementById('confirmStartBtn').addEventListener('click', () => {
  startGame();
});

document.getElementById('restartBtn').addEventListener('click', () => { 
  showObjectiveSelection();
});

// "Try Again" — only visible after a loss (toggled in endGame()). Reuses
// whatever town + difficulty is already sitting in gameSettings and jumps
// straight back into gameplay via startGame()/resetState(), skipping the
// objective/town/difficulty/info screens entirely for a fast retry.
document.getElementById('tryAgainBtn').addEventListener('click', () => {
  startGame();
});

document.getElementById('instructionsBtn').addEventListener('click', () => {
  const closeMenuBtn = document.getElementById('closeMenuBtn');
  if (gameStarted && !state.gameOver) {
    pausedRunningState = state.running;
    state.running = false;
    closeMenuBtn.style.display = 'block';
  } else {
    closeMenuBtn.style.display = 'none';
  }
  showObjectiveSelection();
});

document.getElementById('closeMenuBtn').addEventListener('click', () => {
  document.getElementById('overlay').classList.add('hidden');
  state.running = pausedRunningState;
});

/* ---------------- EDUCATIONAL FACT TICKER ---------------- */
// Rotates short lahar/Pinatubo facts in a small persistent banner across
// the pre-game menu screens (objective, town, difficulty, info). Purely
// informational and only ever shown while the overlay is up, so it can
// never interrupt an active storm.
let factTickerIndex = 0;
function rotateFactTicker() { 
  const textEl = document.getElementById('factTickerText');
  const wrapEl = document.getElementById('factTicker');
  if (!textEl || !wrapEl) return;
  wrapEl.classList.remove('fact-fade');
  void wrapEl.offsetWidth; // force reflow so the fade animation can replay
  factTickerIndex = (factTickerIndex + 1) % LAHAR_FACTS.length;
  textEl.textContent = LAHAR_FACTS[factTickerIndex];
  wrapEl.classList.add('fact-fade');
}

resizeCanvas(); 
showObjectiveSelection();
const initialFactEl = document.getElementById('factTickerText');
if (initialFactEl) initialFactEl.textContent = LAHAR_FACTS[0];
setInterval(rotateFactTicker, 5500);
requestAnimationFrame((t) => { lastT = t; loop(t); });