// Joshway: Flash Odyssey
// Full production cinematic puzzle-platformer
// Inspired by Flashback, Oddworld, Prince of Persia
// Strong Joshway theme: courage, flowing cape, heroic kid, warm empowering colors

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

// === STATE ===
let gameState = 'title'; // title, story, levelselect, playing, paused, end, gameover, credits
let currentLevel = 0;
let orbs = 0;
let totalOrbs = 12;
let lives = 3;
let score = 0;
let timeLeft = 120;
let levelTimer = 0;
let highScores = {};
let isMuted = false;
let unlockedLevels = [true, false, false, false, false];

let keys = {};
let lastKeys = {};
let cameraX = 0;
let cameraTarget = 0;
let particles = [];
let floatingTexts = [];
let coyoteTime = 0;
let jumpBuffer = 0;
let slowTime = 0; // brief time-slow for precision platforming
let climbX = null; // for climbable surfaces

// Player with full mechanics
const player = {
  x: 80, y: 320, vx: 0, vy: 0,
  w: 28, h: 42, onGround: false, facing: 1,
  crouching: false, rollTimer: 0, attackTimer: 0,
  jumpHeld: false, animFrame: 0, frameTimer: 0,
  possessTime: 0, isPossessing: false, possessedEntity: null,
  checkpointX: 80, checkpointY: 320,
  canGlide: false
};

// Level runtime objects (populated per level)
let platforms = [];
let switches = [];
let traps = [];
let collectibles = [];
let enemies = [];
let npcs = []; // possessable allies
let doors = [];
let movingPlatforms = [];

// Assets
const assets = {
  templeBg: new Image(),
  templeParallax: new Image(),
  alienBg: new Image(),
  titleBanner: new Image(),
  heroSheet: new Image(),
  orb: new Image(),
  traps: new Image(),
  enemySheet: new Image()
};
assets.templeBg.src = '/assets/temple-bg.jpg';
assets.templeParallax.src = '/assets/temple-parallax.jpg';
assets.alienBg.src = '/assets/alien-bg.jpg';
assets.titleBanner.src = '/assets/title-banner.jpg';
assets.heroSheet.src = '/assets/joshway-spritesheet.png';
assets.orb.src = '/assets/courage-orb.png';
assets.traps.src = '/assets/traps-sprites.png';
assets.enemySheet.src = '/assets/enemy-sprites.png';

// Audio
let audioCtx;
let musicInterval = null;
let currentMusicTheme = '';

function initAudio() {
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){}
}

function playSFX(freq, dur = 0.12, type = 'square', vol = 0.28, slide = null) {
  if (!audioCtx || isMuted) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    osc.type = type;
    osc.frequency.value = freq;
    if (slide) { osc.frequency.setValueAtTime(freq, audioCtx.currentTime); osc.frequency.linearRampToValueAtTime(slide, audioCtx.currentTime + dur); }
    gain.gain.value = vol;
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    osc.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
    osc.start();
    setTimeout(() => {
      gain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.06);
      osc.stop(audioCtx.currentTime + 0.1);
    }, dur * 1000);
  } catch(e){}
}

function playMusic(theme) {
  if (!audioCtx || isMuted) return;
  if (musicInterval) { clearInterval(musicInterval); musicInterval = null; }
  currentMusicTheme = theme;

  const notes = {
    temple: [392, 440, 523, 659, 587, 494, 523, 440], // adventurous warm
    sky:    [523, 587, 659, 784, 698, 587, 659, 523], // floating heroic
    cave:   [330, 392, 349, 294, 330, 262, 294, 330], // moody eerie
    crystal:[440, 523, 659, 587, 784, 698, 880, 784], // mysterious sparkling
    final:  [392, 523, 659, 784, 880, 784, 659, 523]  // triumphant
  };
  const seq = notes[theme] || notes.temple;
  let i = 0;

  function playNote() {
    if (!audioCtx || isMuted || gameState !== 'playing') return;
    const f = seq[i % seq.length];
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    const f2 = audioCtx.createOscillator();
    o.type = (theme === 'cave' || theme === 'final') ? 'sawtooth' : 'triangle';
    f2.type = 'sine';
    o.frequency.value = f;
    f2.frequency.value = f * 1.5;
    g.gain.value = (theme === 'cave') ? 0.09 : 0.13;
    o.connect(g); f2.connect(g); g.connect(audioCtx.destination);
    o.start(); f2.start();
    setTimeout(() => {
      g.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.22);
      o.stop(audioCtx.currentTime + 0.3); f2.stop(audioCtx.currentTime + 0.3);
    }, 240);
    i++;
  }
  playNote();
  musicInterval = setInterval(playNote, (theme === 'cave' ? 420 : 280));
}

function stopMusic() {
  if (musicInterval) { clearInterval(musicInterval); musicInterval = null; }
}

function toggleMute() {
  isMuted = !isMuted;
  if (isMuted) stopMusic();
  else if (gameState === 'playing') playMusic(LEVELS[currentLevel].music);
}

// === LEVEL DEFINITIONS: 5 escalating full sections ===
const LEVELS = [
  {
    id: 0, name: "TEMPLE OF COURAGE", music: 'temple', time: 135, width: 1680,
    story: "Ancient stone halls. Levers move platforms. Stomp the temple grunts. Collect every glowing orb. Roll under low or glide with cape.",
    totalOrbs: 12,
    startX: 60, startY: 300,
    platforms: [
      {x:0,y:340,w:220,h:22}, {x:290,y:300,w:130,h:18}, {x:460,y:250,w:95,h:18}, {x:610,y:310,w:160,h:20},
      {x:830,y:270,w:70,h:18}, {x:950,y:220,w:180,h:20}, {x:1170,y:280,w:85,h:18}, {x:1300,y:240,w:110,h:20},
      {x:1480,y:310,w:200,h:22}, {x:520,y:185,w:60,h:14} // secret upper path
    ],
    switches: [
      {x:330,y:270, active:false, moves:[{plat:1, y:-70}] },
      {x:720,y:280, active:false, moves:[{plat:4, y:-55}] },
      {x:580,y:160, active:false, moves:[{plat:9, y:55}] } // upper secret
    ],
    traps: [
      {x:540,y:328,w:55,h:12,type:'spikes',active:true},
      {x:1020,y:240,w:28,h:70,type:'saw',vx:0.9}
    ],
    enemies: [
      {x:380,y:275,w:22,h:26,vx:0.75,type:'grunt'},
      {x:870,y:245,w:22,h:26,vx:-0.65,type:'grunt'},
      {x:1370,y:285,w:22,h:26,vx:0.6,type:'grunt'}
    ],
    npcs: [
      {x:690,y:195,w:18,h:18,type:'bat', color:'#a5f3fc'}
    ],
    collectibles: [ // carefully placed, some secrets, multiple paths
      {x:165,y:260},{x:340,y:200},{x:505,y:160},{x:650,y:240},{x:790,y:165},{x:910,y:140},
      {x:1050,y:155},{x:1220,y:205},{x:1390,y:165},{x:1520,y:235},{x:1610,y:255},{x:1440,y:140},
      {x:535,y:130} // secret upper path orb
    ],
    doors: [
      {x:1130,y:240,w:38,h:70, locked:true, requires:6 }
    ],
    moving: [ {plat: 5, axis:'x', speed:1.1, range:70, baseX: 950 } ], // horizontal moving bridge puzzle
    exitX: 1580
  },
  {
    id: 1, name: "SKY BRIDGES", music: 'sky', time: 125, width: 1820,
    story: "Floating islands in the wind. Moving platforms activated by switches. Use crouch-roll to dodge saws.",
    totalOrbs: 13,
    startX: 70, startY: 280,
    platforms: [
      {x:0,y:320,w:180,h:20}, {x:240,y:260,w:95,h:18}, {x:380,y:210,w:85,h:18}, {x:510,y:280,w:75,h:18},
      {x:640,y:170,w:110,h:18}, {x:810,y:240,w:120,h:18}, {x:980,y:190,w:65,h:18}, {x:1080,y:270,w:130,h:20},
      {x:1260,y:160,w:90,h:18}, {x:1400,y:240,w:140,h:20}, {x:1600,y:300,w:220,h:22}
    ],
    switches: [
      {x:280,y:220, active:false, moves:[{plat:1, y:-90},{plat:3, y:65}] },
      {x:960,y:150, active:false, moves:[{plat:8, y:80}] }
    ],
    traps: [
      {x:450,y:198,w:30,h:62,type:'saw',vx:1.1},
      {x:770,y:218,w:26,h:52,type:'saw',vx:-0.95},
      {x:1180,y:250,w:42,h:10,type:'spikes',active:true}
    ],
    enemies: [
      {x:340,y:240,w:20,h:24,vx:0.9,type:'spinner'},
      {x:860,y:215,w:20,h:24,vx:-0.7,type:'grunt'},
      {x:1330,y:218,w:20,h:24,vx:1.0,type:'spinner'}
    ],
    npcs: [
      {x:580,y:120,w:18,h:18,type:'bat', color:'#a5f3fc'}
    ],
    collectibles: [
      {x:130,y:210},{x:285,y:160},{x:425,y:120},{x:570,y:200},{x:730,y:100},{x:890,y:160},
      {x:1010,y:120},{x:1160,y:175},{x:1290,y:85},{x:1470,y:155},{x:1550,y:230},{x:1670,y:210},{x:1420,y:100}
    ],
    doors: [],
    moving: [
      {plat: 4, axis:'y', speed:0.7, range:55, baseY:170}, // floating lift
      {plat: 9, axis:'x', speed:0.9, range:90, baseX:1400}
    ],
    exitX: 1720
  },
  {
    id: 2, name: "CAVERN DEPTHS", music: 'cave', time: 140, width: 1750,
    story: "Dark winding caves. Crouch through low tunnels. Possess the glowing bat to reach impossible levers.",
    totalOrbs: 14,
    startX: 55, startY: 300,
    platforms: [
      {x:0,y:330,w:210,h:20}, {x:255,y:290,w:80,h:16}, {x:370,y:245,w:100,h:16},
      {x:520,y:310,w:55,h:16}, {x:630,y:255,w:95,h:16}, {x:780,y:205,w:75,h:16},
      {x:910,y:275,w:130,h:18}, {x:1080,y:215,w:60,h:16}, {x:1190,y:285,w:80,h:18},
      {x:1320,y:230,w:115,h:16}, {x:1490,y:290,w:260,h:22}
    ],
    switches: [
      {x:440,y:265, active:false, moves:[{plat:3, y:-50}] },
      {x:850,y:175, active:false, moves:[{plat:7, y:-75}] }
    ],
    traps: [
      {x:300,y:274,w:28,h:55,type:'saw',vx:0.7},
      {x:990,y:263,w:44,h:11,type:'spikes',active:true},
      {x:1210,y:273,w:28,h:55,type:'saw',vx:-0.85}
    ],
    enemies: [
      {x:310,y:272,w:18,h:22,vx:0.55,type:'grunt'},
      {x:1050,y:195,w:18,h:22,vx:-0.8,type:'spinner'},
      {x:1390,y:270,w:18,h:22,vx:0.7,type:'grunt'}
    ],
    npcs: [
      {x:195,y:225,w:16,h:16,type:'bat', color:'#c084fc'},
      {x:1155,y:185,w:16,h:16,type:'bat', color:'#c084fc'}
    ],
    collectibles: [
      {x:100,y:240},{x:295,y:175},{x:420,y:160},{x:555,y:215},{x:690,y:140},{x:815,y:105},
      {x:960,y:165},{x:1110,y:125},{x:1245,y:185},{x:1375,y:120},{x:1500,y:195},{x:1620,y:230},{x:780,y:85},{x:1050,y:80}
    ],
    doors: [
      {x:700,y:205,w:32,h:55, locked:true, requires:7 }
    ],
    exitX: 1650
  },
  {
    id: 3, name: "CRYSTAL HALLS", music: 'crystal', time: 130, width: 1900,
    story: "Glowing alien crystals. Complex timed traps and sequential switches. Use cape to hit remote levers.",
    totalOrbs: 15,
    startX: 60, startY: 310,
    platforms: [
      {x:0,y:335,w:185,h:20}, {x:235,y:275,w:95,h:18}, {x:375,y:220,w:70,h:18},
      {x:500,y:290,w:85,h:18}, {x:640,y:185,w:125,h:18}, {x:820,y:265,w:60,h:18},
      {x:930,y:210,w:110,h:18}, {x:1090,y:275,w:95,h:18}, {x:1235,y:165,w:70,h:18},
      {x:1350,y:255,w:115,h:18}, {x:1510,y:195,w:80,h:18}, {x:1640,y:280,w:140,h:20},
      {x:1810,y:320,w:120,h:20}
    ],
    switches: [
      {x:260,y:235, active:false, moves:[{plat:1, y:-65}] },
      {x:715,y:255, active:false, moves:[{plat:5, y:70},{plat:8, y:-90}] },
      {x:1400,y:175, active:false, moves:[{plat:11, y:-50}] }
    ],
    traps: [
      {x:450,y:208,w:30,h:75,type:'saw',vx:1.3},
      {x:870,y:195,w:26,h:60,type:'saw',vx:-1.0},
      {x:1120,y:263,w:48,h:10,type:'spikes',active:true},
      {x:1480,y:183,w:32,h:65,type:'saw',vx:0.85}
    ],
    enemies: [
      {x:290,y:255,w:18,h:22,vx:0.85,type:'spinner'},
      {x:980,y:240,w:18,h:22,vx:-0.7,type:'grunt'},
      {x:1300,y:235,w:18,h:22,vx:0.9,type:'spinner'},
      {x:1690,y:260,w:18,h:22,vx:-1.0,type:'grunt'}
    ],
    npcs: [
      {x:580,y:120,w:16,h:16,type:'bat', color:'#67e8f9'}
    ],
    collectibles: [
      {x:115,y:220},{x:275,y:155},{x:415,y:105},{x:565,y:180},{x:710,y:95},{x:870,y:130},
      {x:1005,y:105},{x:1170,y:155},{x:1300,y:80},{x:1440,y:140},{x:1575,y:90},{x:1700,y:160},
      {x:1800,y:210},{x:660,y:55},{x:1240,y:55}
    ],
    doors: [
      {x:1000,y:190,w:34,h:65, locked:true, requires:9 }
    ],
    exitX: 1820
  },
  {
    id: 4, name: "SANCTUM OF SHADOWS", music: 'final', time: 150, width: 1950,
    story: "The final trial. Master every skill: variable jumps, cape attacks, crouch rolls, and possession to overcome the Shadow Guardian.",
    totalOrbs: 16,
    startX: 70, startY: 300,
    platforms: [
      {x:0,y:330,w:165,h:20}, {x:220,y:280,w:90,h:18}, {x:355,y:225,w:80,h:18},
      {x:480,y:300,w:70,h:18}, {x:600,y:170,w:115,h:18}, {x:770,y:250,w:55,h:18},
      {x:880,y:200,w:130,h:18}, {x:1060,y:275,w:75,h:18}, {x:1180,y:165,w:85,h:18},
      {x:1315,y:260,w:95,h:18}, {x:1460,y:190,w:110,h:18}, {x:1620,y:270,w:80,h:18},
      {x:1760,y:215,w:90,h:18}, {x:1880,y:310,w:80,h:20}
    ],
    switches: [
      {x:290,y:240, active:false, moves:[{plat:1, y:-60}] },
      {x:720,y:170, active:false, moves:[{plat:4, y:-55},{plat:8, y:55}] },
      {x:1280,y:230, active:false, moves:[{plat:11, y:-75}] }
    ],
    traps: [
      {x:410,y:213,w:28,h:68,type:'saw',vx:1.2},
      {x:840,y:238,w:24,h:55,type:'saw',vx:-0.95},
      {x:1090,y:263,w:38,h:10,type:'spikes',active:true},
      {x:1510,y:178,w:32,h:62,type:'saw',vx:1.05},
      {x:1700,y:253,w:26,h:58,type:'saw',vx:-1.15}
    ],
    enemies: [
      {x:180,y:260,w:20,h:24,vx:0.6,type:'grunt'},
      {x:550,y:150,w:20,h:24,vx:-0.75,type:'spinner'},
      {x:980,y:230,w:20,h:24,vx:0.8,type:'grunt'},
      {x:1380,y:240,w:20,h:24,vx:-0.65,type:'spinner'}
    ],
    npcs: [
      {x:650,y:95,w:16,h:16,type:'bat', color:'#f472b6'}
    ],
    collectibles: [
      {x:105,y:200},{x:265,y:140},{x:400,y:90},{x:530,y:190},{x:665,y:70},{x:820,y:105},
      {x:945,y:80},{x:1110,y:130},{x:1240,y:55},{x:1380,y:105},{x:1500,y:65},{x:1640,y:145},
      {x:1750,y:80},{x:1865,y:165},{x:920,y:40},{x:1150,y:30}
    ],
    doors: [
      {x:850,y:180,w:32,h:60, locked:true, requires:10 }
    ],
    exitX: 1890,
    isFinal: true
  }
];

// === HELPERS ===
function loadHighScores() {
  try {
    const saved = localStorage.getItem('joshwayFlashOdysseyScores');
    highScores = saved ? JSON.parse(saved) : {};
  } catch(e) { highScores = {}; }
}
function saveHighScore(level, sc) {
  if (!highScores[level]) highScores[level] = 0;
  if (sc > highScores[level]) {
    highScores[level] = sc;
    localStorage.setItem('joshwayFlashOdysseyScores', JSON.stringify(highScores));
    return true;
  }
  return false;
}

function createParticle(x, y, vx, vy, life, color, size=3) {
  particles.push({x, y, vx, vy, life, color, size});
}
function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.12;
    p.life--;
    p.vx *= 0.98;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
function addFloatingText(x, y, txt, color='#facc15') {
  floatingTexts.push({x, y, txt, color, life: 48, vy: -0.9});
}
function updateFloating() {
  for (let i = floatingTexts.length-1; i>=0; i--) {
    const f = floatingTexts[i];
    f.y += f.vy; f.life--;
    if (f.life <= 0) floatingTexts.splice(i,1);
  }
}

// === LEVEL INIT ===
function initLevel(lvlIdx) {
  currentLevel = lvlIdx;
  const L = LEVELS[lvlIdx];

  // Reset player
  player.x = L.startX; player.y = L.startY; player.vx=0; player.vy=0;
  player.onGround = false; player.crouching=false; player.rollTimer=0;
  player.attackTimer=0; player.jumpHeld=false; player.possessTime=0;
  player.isPossessing=false; player.possessedEntity=null; player.facing=1;
  player.checkpointX = player.x; player.checkpointY = player.y;
  player.canGlide = false;
  coyoteTime = 0; jumpBuffer = 0; slowTime = 0; climbX = null;

  orbs = 0; totalOrbs = L.totalOrbs; timeLeft = L.time; levelTimer = 0;

  // Copy level geometry
  platforms = L.platforms.map(p => ({...p}));
  switches = L.switches.map(s => ({...s}));
  traps = L.traps.map(t => ({...t}));
  collectibles = L.collectibles.map(c => ({x:c.x, y:c.y, collected:false}));
  enemies = L.enemies.map(e => ({...e, stunned:0}));
  npcs = L.npcs.map(n => ({...n, possessed:false}));
  doors = L.doors.map(d => ({...d, open:false}));
  movingPlatforms = (L.moving || []).map(m => ({...m, phase: m.phase || 0}));

  // Setup camera
  cameraX = Math.max(0, player.x - 280);
  cameraTarget = cameraX;

  // Clear FX
  particles.length = 0;
  floatingTexts.length = 0;

  // HUD
  updateHUD();

  // Music
  stopMusic();
  setTimeout(() => playMusic(L.music), 120);

  gameState = 'playing';
}

function applySwitchEffect(sw) {
  const L = LEVELS[currentLevel];
  if (!sw.moves) return;
  sw.moves.forEach(m => {
    const plat = platforms[m.plat];
    if (plat) {
      plat.targetY = (plat.targetY === undefined ? plat.y : plat.targetY) + m.y;
      // Add a bit of motion
      createParticle(plat.x + plat.w/2, plat.y, 0, -1.5, 16, '#facc15', 4);
    }
  });
  playSFX(720, 0.18, 'square', 0.32, 420);
}

function toggleDoor(door) {
  door.open = !door.open;
  playSFX(door.open ? 580 : 340, 0.22, 'sawtooth', 0.3);
}

function tryInteract() {
  const px = player.x + player.w/2;
  const py = player.y + player.h/2;

  // Switches
  for (let s of switches) {
    if (Math.abs(s.x - px) < 36 && Math.abs(s.y - py) < 48) {
      s.active = !s.active;
      applySwitchEffect(s);
      return true;
    }
  }
  // Doors (if close)
  for (let d of doors) {
    if (!d.locked && Math.abs(d.x + d.w/2 - px) < 40 && Math.abs(d.y + d.h/2 - py) < 50) {
      toggleDoor(d);
      return true;
    }
  }

  // Possess mechanic - NPCs or stunned enemies (Oddworld full)
  if (player.possessTime <= 0) {
    // Try NPCs first (friendly)
    for (let n of npcs) {
      if (!n.possessed && Math.abs(n.x - px) < 52 && Math.abs(n.y - py) < 38) {
        player.isPossessing = true;
        player.possessTime = 220; // ~3.6s at 60fps
        player.possessedEntity = { ...n, vx:0, vy:0, originalX:n.x, originalY:n.y };
        n.possessed = true;
        playSFX(480, 0.35, 'sine', 0.38);
        createParticle(n.x, n.y, 0, -2, 22, '#67e8f9', 5);
        return true;
      }
    }
    // Stunned enemies (tactic)
    for (let e of enemies) {
      if (e.stunned > 0 && Math.abs(e.x - px) < 48 && Math.abs(e.y - py) < 38) {
        player.isPossessing = true;
        player.possessTime = 150;
        player.possessedEntity = { ...e, vx:0, vy:0, originalX:e.x, originalY:e.y, type:e.type };
        e.x = -9999; // hide
        playSFX(310, 0.3, 'sine', 0.4);
        return true;
      }
    }
  } else {
    // Release possess
    releasePossess();
  }
  return false;
}

function releasePossess() {
  if (!player.isPossessing || !player.possessedEntity) return;
  const ent = player.possessedEntity;
  // Return player near entity
  player.x = ent.x || ent.originalX || player.x;
  player.y = (ent.y || ent.originalY || player.y) - 10;
  player.vy = -3;
  // Restore NPC or enemy
  if (ent.type === 'bat' || ent.color) {
    const npc = npcs.find(nn => Math.abs(nn.originalX - ent.originalX) < 10);
    if (npc) { npc.possessed = false; npc.x = player.x; npc.y = player.y; }
  } else {
    for (let e of enemies) {
      if (e.x < -1000) { e.x = player.x; e.y = player.y + 5; e.stunned = 30; break; }
    }
  }
  player.isPossessing = false;
  player.possessTime = 0;
  player.possessedEntity = null;
  playSFX(210, 0.2, 'sine', 0.3);
}

function performAttack() {
  if (player.attackTimer > 0) return;
  player.attackTimer = 16;
  playSFX(180, 0.08, 'sawtooth', 0.22, 520);
  createParticle(player.x + player.w * (player.facing > 0 ? 1 : 0) + 8, player.y + 18, player.facing * 4, -1, 9, '#facc15', 4);

  const ax = player.x + (player.facing > 0 ? player.w + 8 : -22);
  const ay = player.y + 6;
  const aw = 38, ah = 28;

  // Hit switches from range
  switches.forEach(s => {
    if (!s.active && Math.abs(s.x + 10 - ax - aw/2) < 50 && Math.abs(s.y - ay) < 42) {
      s.active = true;
      applySwitchEffect(s);
    }
  });

  // Stun enemies or defeat certain
  enemies.forEach(e => {
    if (e.x < -100) return;
    if (e.x < ax + aw && e.x + e.w > ax && e.y < ay + ah && e.y + e.h > ay) {
      if (e.type === 'spinner' || e.type === 'grunt') {
        e.stunned = 70;
        e.vx = 0;
        score += 180;
        addFloatingText(e.x - cameraX, e.y - 12, 'STUNNED', '#facc15');
        createParticle(e.x + 10, e.y + 8, 0, -2, 14, '#eab308');
      }
    }
  });

  // Hit doors
  doors.forEach(d => {
    if (d.locked && Math.abs(d.x + d.w/2 - ax) < 48) {
      d.locked = false; // cape unlocks in final
      playSFX(760, 0.25, 'square', 0.3);
      addFloatingText(d.x - cameraX + 8, d.y - 4, 'UNLOCKED', '#4ade80');
    }
  });
}

// === UPDATE CORE ===
function update() {
  if (gameState !== 'playing') return;

  const L = LEVELS[currentLevel];
  levelTimer++;
  if (levelTimer % 60 === 0) {
    timeLeft = Math.max(0, timeLeft - 1);
    if (timeLeft === 30) playSFX(440, 0.15, 'square', 0.2);
  }
  if (timeLeft <= 0) { die(); return; }

  // Time slow (focus mode) decays, affects speeds
  if (slowTime > 0) slowTime--;
  const timeScale = slowTime > 0 ? 0.4 : 1.0;

  // === POSSESS MODE CONTROL ===
  let controlledX = player.x;
  let controlledY = player.y;
  let controlling = false;

  if (player.isPossessing && player.possessedEntity) {
    controlling = true;
    const ent = player.possessedEntity;
    const spd = 2.3 * timeScale;
    if (keys['ArrowLeft'] || keys['KeyA']) { ent.vx = -spd; player.facing = -1; }
    else if (keys['ArrowRight'] || keys['KeyD']) { ent.vx = spd; player.facing = 1; }
    else ent.vx *= 0.72;
    const jumpP = keys['Space'] || keys['KeyW'] || keys['ArrowUp'];
    if (jumpP && ent.onGround) { ent.vy = -7.8; ent.onGround = false; playSFX(520, 0.09, 'sine', 0.2); }
    ent.vy = (ent.vy || 0) + 0.52 * timeScale;
    if (ent.vy > 9) ent.vy = 9;
    ent.x += ent.vx * timeScale;
    ent.y += ent.vy;

    // Robust possess collision (AABB sep Y then X later)
    ent.onGround = false;
    for (let p of platforms) {
      if (ent.x < p.x + p.w && ent.x + 18 > p.x && ent.y + 18 > p.y && ent.y < p.y + p.h) {
        if (ent.vy > 0) {
          ent.y = p.y - 18; ent.vy = 0; ent.onGround = true;
        } else if (ent.vy < 0) {
          ent.y = p.y + p.h; ent.vy = 0;
        }
      }
    }
    // horizontal clamp in possess
    if (ent.x < 10) ent.x = 10;
    if (ent.x > L.width - 30) ent.x = L.width - 30;

    controlledX = ent.x; controlledY = ent.y;
    player.possessTime--;
    if (player.possessTime <= 0) releasePossess();

    // Allow interact while possessed
    if (keys['KeyE'] && !lastKeys['KeyE']) tryInteract();
  }

  // === PLAYER MOVEMENT (when not possessing) ===
  if (!player.isPossessing) {
    // Time slow affects movement feel
    const effScale = timeScale;

    let speed = (player.crouching ? 1.3 : 2.75) * effScale;
    if (player.rollTimer > 0) speed = 3.5 * effScale;

    if (keys['ArrowLeft'] || keys['KeyA']) {
      player.vx = -speed;
      player.facing = -1;
    } else if (keys['ArrowRight'] || keys['KeyD']) {
      player.vx = speed;
      player.facing = 1;
    } else {
      player.vx *= (player.onGround ? 0.68 : 0.82);
    }

    // Crouch + roll
    const wantCrouch = keys['ShiftLeft'] || keys['ShiftRight'] || keys['ArrowDown'] || keys['KeyS'];
    player.crouching = wantCrouch;
    if (wantCrouch && Math.abs(player.vx) > 1.6 && player.onGround && player.rollTimer <= 0) {
      player.rollTimer = 20;
      playSFX(310, 0.1, 'square', 0.18);
    }
    if (player.rollTimer > 0) player.rollTimer--;

    // CLIMB: simple ledge/vine climb (near vertical edges or special)
    let isClimbing = false;
    if (climbX !== null && (keys['ArrowUp'] || keys['KeyW'])) {
      // detect if touching climbable (we set climbX in collision pass)
      if (Math.abs(player.x + player.w/2 - climbX) < 18) {
        isClimbing = true;
        player.vy = -2.2 * effScale;
        player.vx *= 0.3;
        player.onGround = false;
      }
    }

    // Variable jump with coyote time + jump buffer (responsive Prince of Persia feel)
    const jumpKey = keys['Space'] || keys['ArrowUp'] || keys['KeyW'];
    const jumpPressed = jumpKey && !lastKeys['Space'] && !lastKeys['ArrowUp'] && !lastKeys['KeyW'];
    if (jumpPressed) jumpBuffer = 8;
    if (jumpBuffer > 0) jumpBuffer--;

    // Coyote grace
    if (player.onGround) coyoteTime = 7;
    else if (coyoteTime > 0) coyoteTime--;

    if ((jumpBuffer > 0) && (coyoteTime > 0 || player.onGround) && !isClimbing) {
      player.vy = -12.6;
      player.onGround = false;
      player.jumpHeld = true;
      coyoteTime = 0; jumpBuffer = 0;
      playSFX(player.crouching ? 470 : 710, 0.13, 'sine', 0.27);
      createParticle(player.x + 14, player.y + player.h - 2, player.vx * -0.3, 0.6, 9, '#fde047', 2);
    }
    if (!jumpKey) {
      player.jumpHeld = false;
      jumpBuffer = 0;
    }

    // Hold for higher jump + glide when cape held in air
    if (player.jumpHeld && player.vy < -1.2) {
      player.vy -= 0.38 * effScale;
    } else if (!player.jumpHeld && player.vy < -0.6) {
      player.vy *= 0.96;
    }

    // CAPE GLIDE: hold X/C in air for slow descent like Flashback cape
    const capeHeld = keys['KeyX'] || keys['KeyC'];
    if (!player.onGround && capeHeld && player.vy > 1.2 && player.attackTimer <= 0) {
      player.vy = Math.min(player.vy, 1.6); // slow fall
      player.vx *= 0.95;
      player.canGlide = true;
      if (Math.random() < 0.35) createParticle(player.x + 8, player.y + 10, player.facing * -0.8, 1.2, 6, '#f97316', 2);
    } else {
      player.canGlide = false;
    }

    // Gravity + apply, scaled
    player.vy += 0.58 * effScale;
    if (player.vy > 11) player.vy = 11;

    // Apply movement (X first, then Y for better platforming)
    const prevX = player.x;
    player.x += player.vx;
    // X collisions separate
    player.onGround = false;
    for (let p of platforms) {
      if (player.x + player.w > p.x && player.x < p.x + p.w &&
          player.y + player.h > p.y && player.y < p.y + p.h) {
        if (player.vx > 0) player.x = p.x - player.w;
        else if (player.vx < 0) player.x = p.x + p.w;
        player.vx = 0;
      }
    }

    player.y += player.vy;

    // === PRECISE COLLISIONS Y ===
    for (let p of platforms) {
      if (player.x + player.w > p.x && player.x < p.x + p.w &&
          player.y + player.h > p.y && player.y < p.y + p.h) {
        if (player.vy > 0) {
          player.y = p.y - player.h;
          player.vy = 0;
          player.onGround = true;
        } else if (player.vy < 0) {
          player.y = p.y + p.h;
          player.vy = 0;
        }
      }
    }

    // Wall bounds
    if (player.x < 12) { player.x = 12; player.vx = 0; }
    const maxX = L.width - player.w - 12;
    if (player.x > maxX) player.x = maxX;

    // Crouch hitbox adjust (low passages)
    let hitH = player.crouching || player.rollTimer > 0 ? player.h * 0.68 : player.h;
    if (player.crouching && player.onGround) player.y += (player.h - hitH) * 0.35;

    // Detect climbables near player (vertical platforms edges or doors as makeshift)
    climbX = null;
    for (let p of platforms) {
      const nearLeft = Math.abs((player.x + player.w) - p.x) < 6 && player.y + player.h > p.y && player.y < p.y + p.h;
      const nearRight = Math.abs(player.x - (p.x + p.w)) < 6 && player.y + player.h > p.y && player.y < p.y + p.h;
      if ((nearLeft || nearRight) && !player.onGround) {
        climbX = nearLeft ? p.x : p.x + p.w;
        break;
      }
    }

    // === TRAPS ===
    for (let t of traps) {
      if (t.type === 'saw') {
        t.x += (t.vx || 0.9) * timeScale;
        if (t.x < 200 || t.x > L.width - 120) t.vx = -(t.vx || 0.9);
      }
      const hit = player.x < t.x + t.w && player.x + player.w > t.x &&
                  player.y + hitH > t.y && player.y < t.y + t.h + 4;
      if (hit && t.active !== false) {
        die();
        return;
      }
    }

    // === ENEMIES ===
    for (let e of enemies) {
      if (e.x < -500) continue;
      // Patrol
      e.x += (e.vx || 0.6) * timeScale;
      if (e.x < 40 || e.x > L.width - 80) e.vx = -(e.vx || 0.6);
      if (e.stunned > 0) { e.stunned = Math.max(0, e.stunned - 1); e.vx *= 0.6; continue; }

      // Collision
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const touching = Math.abs(dx) < 26 && Math.abs(dy) < 28;
      if (touching) {
        const isStomp = player.vy > 1.5 && !player.crouching && player.y + hitH * 0.4 < e.y + 5;
        const isRoll = player.rollTimer > 0 || (player.crouching && Math.abs(player.vx) > 1.6);
        if ((isStomp || isRoll) && e.type !== 'spinner' || (isRoll && e.type === 'spinner')) {
          // Defeat
          e.x = -600;
          player.vy = -6.5;
          score += 280;
          playSFX(360, 0.15, 'square', 0.28);
          createParticle(e.x + 12, e.y + 4, 0, -3, 18, '#f97316');
          addFloatingText(e.x - cameraX, e.y - 4, '+280', '#4ade80');
        } else {
          die(); return;
        }
      }
    }

    // === COLLECTIBLES ===
    collectibles.forEach(c => {
      if (!c.collected) {
        const dx = (player.x + 14) - c.x;
        const dy = (player.y + 21) - c.y;
        if (Math.hypot(dx, dy) < 19) {
          c.collected = true;
          orbs++;
          score += (orbs % 3 === 0 ? 180 : 110);
          playSFX(920 + (orbs % 4) * 30, 0.18, 'sine', 0.34);
          createParticle(c.x, c.y, 0, -2.2, 22, '#fde047', 4);
          addFloatingText(c.x - cameraX, c.y - 14, '+ORB', '#facc15');
        }
      }
    });

    // === DOORS BLOCKING ===
    doors.forEach(d => {
      if (!d.open && d.locked) {
        if (player.x + player.w > d.x && player.x < d.x + d.w &&
            player.y + hitH > d.y && player.y < d.y + d.h) {
          // push back
          if (player.vx > 0) player.x = d.x - player.w - 0.5;
          else player.x = d.x + d.w + 0.5;
          player.vx *= 0.3;
        }
      }
    });

    // Attack (X key)
    if ((keys['KeyX'] || keys['KeyC']) && !lastKeys['KeyX'] && !lastKeys['KeyC']) {
      performAttack();
    }

    // Time slow / Focus mode (precision platforming aid)
    if ((keys['KeyQ'] || keys['KeyZ']) && !lastKeys['KeyQ'] && !lastKeys['KeyZ'] && slowTime <= 0) {
      slowTime = 95; // brief precision window
      playSFX(280, 0.3, 'sine', 0.25);
      createParticle(player.x + 14, player.y + 8, 0, -1, 18, '#a5f3fc', 3);
    }

    // Possess / Interact (E)
    if (keys['KeyE'] && !lastKeys['KeyE']) {
      if (!tryInteract()) {
        // if near exit and enough orbs
      }
    }

    // Win condition: enough orbs + reach exit
    const collectedAll = orbs >= totalOrbs;
    if (collectedAll && player.x + player.w > L.exitX - 10) {
      completeLevel();
      return;
    }
  } else {
    // While possessing, still update camera using controlled
    controlledX = player.possessedEntity.x;
  }

  // Camera smooth follow
  const targetCam = Math.max(0, Math.min(L.width - 800, (controlling ? controlledX : player.x) - 300));
  cameraTarget = targetCam;
  cameraX += (cameraTarget - cameraX) * 0.12;

  // Update dynamic platforms (switches + autonomous moving for puzzles)
  platforms.forEach(p => {
    if (p.targetY !== undefined) {
      const diff = p.targetY - p.y;
      p.y += Math.sign(diff) * Math.min(1.9, Math.abs(diff));
      if (Math.abs(diff) < 2) p.y = p.targetY;
    }
  });
  // Autonomous moving platforms (horizontal/vertical loops - great for puzzles)
  movingPlatforms.forEach(mp => {
    mp.phase = (mp.phase + (mp.speed || 0.8) * timeScale) % (mp.range * 2 || 160);
    const offset = Math.sin(mp.phase / (mp.range || 80) * Math.PI) * (mp.range / 2 || 40);
    const baseX = mp.baseX !== undefined ? mp.baseX : platforms[mp.plat].x;
    const baseY = mp.baseY !== undefined ? mp.baseY : platforms[mp.plat].y;
    if (mp.axis === 'x' && platforms[mp.plat]) {
      platforms[mp.plat].x = baseX + offset;
    } else if (platforms[mp.plat]) {
      platforms[mp.plat].y = baseY + offset;
    }
  });

  // Update player anim
  player.frameTimer = (player.frameTimer || 0) + 1;
  player.animFrame = Math.floor(player.frameTimer / 7);

  updateParticles();
  updateFloating();
  updateHUD();
}

// === DIE / RESPAWN ===
function die() {
  lives--;
  playSFX(160, 0.4, 'sawtooth', 0.42);
  createParticle(player.x + 14, player.y + 18, 0, -2, 26, '#ef4444', 6);
  for (let i = 0; i < 7; i++) createParticle(player.x + 10 + Math.random()*18, player.y + 12, (Math.random()-0.5)*2.5, -1.2, 14 + Math.random()*8, '#f97316');

  if (lives <= 0) {
    gameState = 'gameover';
    stopMusic();
    document.getElementById('final-score-go').textContent = 'FINAL SCORE: ' + score.toString().padStart(6, '0');
    showOverlay('gameover-overlay');
  } else {
    // Respawn at start or checkpoint
    player.x = player.checkpointX;
    player.y = player.checkpointY;
    player.vx = 0; player.vy = 0;
    player.onGround = false;
    // Reset some enemies close
    const L = LEVELS[currentLevel];
    enemies.forEach((e, i) => {
      if (e.x < -500) { e.x = L.enemies[i].x; e.y = L.enemies[i].y; e.stunned = 0; e.vx = L.enemies[i].vx; }
    });
  }
}

// === COMPLETE LEVEL ===
function completeLevel() {
  gameState = 'end';
  stopMusic();

  const L = LEVELS[currentLevel];
  const timeBonus = Math.max(0, timeLeft * 18);
  const orbBonus = orbs * 65;
  const secretBonus = (orbs === totalOrbs ? 520 : 0);
  const totalBonus = timeBonus + orbBonus + secretBonus;
  score += totalBonus;

  const isNewHigh = saveHighScore(currentLevel, score);

  // Unlock next
  if (currentLevel < 4) unlockedLevels[currentLevel + 1] = true;

  // Update DOM end screen
  const endTitle = document.getElementById('end-title');
  const stats = document.getElementById('end-stats');
  const recap = document.getElementById('end-recap');
  const hsInfo = document.getElementById('highscore-info');

  endTitle.textContent = currentLevel === 4 ? 'THE ODYSSEY IS COMPLETE!' : 'LEVEL COMPLETE!';
  stats.innerHTML = `
    ORBS COLLECTED: ${orbs}/${totalOrbs}<br>
    TIME BONUS: +${timeBonus}<br>
    ORB BONUS: +${orbBonus} &nbsp; ${secretBonus ? '★ SECRET COURAGE BONUS +' + secretBonus : ''}<br>
    LEVEL SCORE: ${score.toString().padStart(6,'0')}
  `;
  recap.textContent = L.story + (currentLevel === 4 ? " Joshway's cape soared higher than ever. The lands are safe." : " The journey continues...");
  hsInfo.textContent = isNewHigh ? '★ NEW HIGH SCORE! ★' : 'High score for this level: ' + (highScores[currentLevel] || score);

  // Final victory or continue
  const nextBtn = document.getElementById('next-level-btn');
  if (currentLevel === 4) {
    nextBtn.style.display = 'none';
    // Add a victory button if not present
    let victoryBtn = document.getElementById('victory-btn');
    if (!victoryBtn) {
      victoryBtn = document.createElement('button');
      victoryBtn.id = 'victory-btn';
      victoryBtn.className = 'btn';
      victoryBtn.textContent = 'CLAIM YOUR LEGEND →';
      victoryBtn.onclick = () => { hideAllOverlays(); showVictory(); };
      nextBtn.parentNode.appendChild(victoryBtn);
    } else {
      victoryBtn.style.display = 'inline-block';
    }
  } else {
    nextBtn.style.display = 'inline-block';
    nextBtn.textContent = 'NEXT LEVEL →';
  }

  showOverlay('end-overlay');
  playSFX(1050, 0.6, 'sine', 0.35);
  setTimeout(() => playSFX(1320, 0.4, 'sine', 0.3), 220);
}

// === VICTORY / FULL CREDITS ===
function showVictory() {
  stopMusic();
  document.getElementById('final-total-score').textContent = score.toString().padStart(6, '0');
  showOverlay('credits-overlay');
  playSFX(880, 0.9, 'sine', 0.28);
}

// === DRAW ===
function draw() {
  const L = LEVELS[currentLevel] || LEVELS[0];
  const w = canvas.width, h = canvas.height;

  // Sky / base
  ctx.fillStyle = (currentLevel >= 3) ? '#0c1425' : '#0f1a2e';
  ctx.fillRect(0, 0, w, h);

  // Parallax BGs - gorgeous layers using assets
  const cam = cameraX;
  if (currentLevel === 0 || currentLevel === 2) {
    if (assets.templeBg.complete) ctx.drawImage(assets.templeBg, -cam * 0.22, 0, 920, 480);
    ctx.globalAlpha = 0.65;
    if (assets.templeParallax.complete) ctx.drawImage(assets.templeParallax, -cam * 0.48 + 60, 40, 860, 440);
    ctx.globalAlpha = 0.45;
    if (assets.templeBg.complete) ctx.drawImage(assets.templeBg, -cam * 0.75 + 140, 80, 700, 360);
    ctx.globalAlpha = 1.0;
  } else {
    if (assets.alienBg.complete) ctx.drawImage(assets.alienBg, -cam * 0.18, 0, 920, 480);
    ctx.globalAlpha = 0.6;
    if (assets.templeParallax.complete) ctx.drawImage(assets.templeParallax, -cam * 0.55, 30, 820, 420);
    ctx.globalAlpha = 1;
  }

  // Distant pillars / atmosphere (themed lighting)
  ctx.fillStyle = (currentLevel % 2 === 0) ? 'rgba(120,70,30,0.25)' : 'rgba(70,100,140,0.22)';
  for (let i = 0; i < 5; i++) {
    const px = (i * 310 - cam * 0.1) % (L.width + 200);
    ctx.fillRect(px, 40, 38, 420);
  }

  // Platforms - rich warm stone
  ctx.fillStyle = '#3f2a1f';
  platforms.forEach(p => {
    const sx = p.x - cam, sy = p.y;
    ctx.fillRect(sx, sy, p.w, p.h);
    // Top highlight
    ctx.fillStyle = '#6b5340';
    ctx.fillRect(sx, sy, p.w, 5);
    ctx.fillStyle = '#3f2a1f';
    // Edge shadow
    ctx.fillRect(sx, sy + p.h - 3, p.w, 3);
  });

  // Doors / gates
  ctx.fillStyle = '#222';
  doors.forEach(d => {
    const sx = d.x - cam;
    if (!d.open) {
      ctx.fillRect(sx, d.y, d.w, d.h);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(sx + 6, d.y + 8, 4, d.h - 16);
      ctx.fillRect(sx + d.w - 10, d.y + 8, 4, d.h - 16);
      ctx.fillStyle = '#222';
    } else {
      ctx.fillRect(sx, d.y, 6, d.h);
    }
  });

  // Switches / Levers
  switches.forEach(s => {
    const sx = s.x - cam;
    ctx.fillStyle = s.active ? '#4ade80' : '#854d0e';
    ctx.fillRect(sx, s.y, 22, 9);
    ctx.fillStyle = '#111';
    ctx.fillRect(sx + 4, s.y - 8, 3, 11);
  });

  // Traps (use sprite or draw)
  traps.forEach(t => {
    const sx = t.x - cam;
    if (t.type === 'spikes') {
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(sx, t.y, t.w, 9);
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.moveTo(sx + k * 10, t.y + 2);
        ctx.lineTo(sx + k * 10 + 5, t.y - 11);
        ctx.lineTo(sx + k * 10 + 10, t.y + 2);
        ctx.fill();
      }
    } else if (t.type === 'saw') {
      ctx.fillStyle = '#475569';
      ctx.fillRect(sx, t.y, t.w, t.h || 13);
      ctx.fillStyle = '#111';
      ctx.fillRect(sx + 6, t.y + 3, t.w - 12, t.h - 6 || 7);
      // spin effect
      ctx.strokeStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(sx + t.w/2, t.y + (t.h||13)/2 , 7, 0, Math.PI*2);
      ctx.stroke();
    }
  });

  // Collectibles - pulsing orbs using asset
  const pulse = Math.sin(Date.now() / 180) * 1.6 + 1;
  collectibles.forEach(c => {
    if (!c.collected) {
      const sx = c.x - cam;
      if (assets.orb.complete) {
        ctx.drawImage(assets.orb, sx - 9, c.y - 9, 18 + pulse, 18 + pulse);
      } else {
        ctx.fillStyle = '#fde047';
        ctx.beginPath(); ctx.arc(sx, c.y, 8, 0, Math.PI*2); ctx.fill();
      }
      // glow
      ctx.fillStyle = 'rgba(250,204,21,0.3)';
      ctx.fillRect(sx - 14, c.y - 11, 28, 22);
    }
  });

  // NPCs (possessable bats)
  npcs.forEach(n => {
    const sx = n.x - cam;
    ctx.fillStyle = n.color || '#67e8f9';
    ctx.beginPath();
    ctx.ellipse(sx + 9, n.y + 8, 11, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!n.possessed) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(sx + 4, n.y + 4, 3, 3);
    }
  });

  // Enemies
  enemies.forEach(e => {
    if (e.x < -500) return;
    const sx = e.x - cam;
    if (assets.enemySheet.complete) {
      ctx.drawImage(assets.enemySheet, (e.type === 'spinner' ? 64 : 0), e.stunned > 0 ? 28 : 0, 28, 26, sx, e.y, e.w + 4, e.h);
    } else {
      ctx.fillStyle = e.type === 'spinner' ? '#854d0e' : '#451a03';
      ctx.fillRect(sx, e.y, e.w, e.h);
    }
    if (e.stunned > 0) {
      ctx.fillStyle = '#facc15';
      ctx.fillText('!', sx + 5, e.y - 3);
    }
  });

  // Player or possessed visual
  ctx.save();
  const drawX = (player.isPossessing ? (player.possessedEntity.x - cam) : (player.x - cam));
  const drawY = (player.isPossessing ? (player.possessedEntity.y || player.y) : player.y);

  if (player.isPossessing && player.possessedEntity) {
    ctx.fillStyle = '#c084fc';
    ctx.fillRect(drawX, drawY, 18, 18);
    ctx.fillStyle = '#fff';
    ctx.fillRect(drawX + 5, drawY + 5, 3, 3);
  } else {
    ctx.translate(drawX + (player.facing < 0 ? player.w : 0), drawY);
    if (player.facing < 0) ctx.scale(-1, 1);

    const sheet = assets.heroSheet;
    let fx = 0, fy = 0, fw = 32, fh = 46;
    const frame = player.animFrame % 6;

    if (player.attackTimer > 0) { fx = 5 * 32; } // attack frame approx
    else if (!player.onGround) { fx = 2 * 32; }
    else if (player.crouching || player.rollTimer > 0) { fx = 6 * 32; fy = 0; }
    else if (Math.abs(player.vx) > 0.8) { fx = (frame % 3 + 1) * 32; }
    else { fx = 0; }

    if (sheet.complete) {
      ctx.drawImage(sheet, fx, fy, fw, fh, 0, 0, player.w, player.h);
    } else {
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(0, 0, player.w, player.h);
      ctx.fillStyle = '#f97316';
      ctx.fillRect(3, 7, player.w - 6, 11); // cape
    }

    // Cape flow animation overlay
    ctx.fillStyle = 'rgba(249,115,22,0.65)';
    const capeSway = Math.sin(player.animFrame * 0.6) * 3;
    ctx.fillRect(player.facing > 0 ? -4 : player.w - 4, 10, 10, player.h - 12 + capeSway);
  }
  ctx.restore();

  // Attack slash visual
  if (player.attackTimer > 0) {
    const ax = player.x + (player.facing > 0 ? player.w : -16) - cam;
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ax, player.y + 12);
    ctx.lineTo(ax + player.facing * 32, player.y + 20);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  // Particles + floating
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0.1, p.life / 28);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - cam, p.y, p.size || 3, p.size || 3);
  });
  ctx.globalAlpha = 1;
  floatingTexts.forEach(f => {
    ctx.fillStyle = f.color;
    ctx.globalAlpha = f.life / 50;
    ctx.font = '10px monospace';
    ctx.fillText(f.txt, f.x, f.y);
  });
  ctx.globalAlpha = 1;

  // Level edge hint
  if (orbs >= totalOrbs) {
    ctx.fillStyle = 'rgba(74,222,128,0.6)';
    ctx.fillRect(L.exitX - cam - 8, 120, 6, 300);
    ctx.font = '9px monospace';
    ctx.fillText('EXIT', L.exitX - cam - 3, 110);
  }

  // Subtle vignette / lighting for polish
  const grad = ctx.createRadialGradient(w/2, h/2, 120, w/2, h/2 + 40, 520);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(5,8,18,0.35)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

// === UI / HUD / OVERLAYS ===
function updateHUD() {
  const lvlName = document.getElementById('levelName');
  const orbEl = document.getElementById('orbs');
  const liveEl = document.getElementById('lives');
  const scoreEl = document.getElementById('score');
  const timeEl = document.getElementById('time');

  if (lvlName) lvlName.textContent = (LEVELS[currentLevel] || {}).name || 'TEMPLE';
  if (orbEl) orbEl.textContent = `${String(orbs).padStart(2,'0')}/${totalOrbs}`;
  if (liveEl) liveEl.textContent = lives;
  if (scoreEl) scoreEl.textContent = String(score).padStart(6, '0');
  if (timeEl) timeEl.textContent = timeLeft;
}

function showOverlay(id) {
  document.querySelectorAll('.overlay').forEach(o => o.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function hideAllOverlays() {
  document.querySelectorAll('.overlay').forEach(o => o.classList.remove('active'));
}

function setupUI() {
  // Title buttons
  document.getElementById('start-btn').onclick = () => { initLevel(0); hideAllOverlays(); };
  document.getElementById('story-btn').onclick = () => showOverlay('story-overlay');
  document.getElementById('levels-btn').onclick = () => { renderLevelSelect(); showOverlay('level-select-overlay'); };
  document.getElementById('instructions-btn').onclick = () => showOverlay('instructions-overlay');
  document.getElementById('highscores-btn').onclick = () => { renderHighScoresModal(); showOverlay('highscores-modal'); };

  document.getElementById('story-back-btn').onclick = () => showOverlay('title-overlay');

  document.getElementById('levelselect-back-btn').onclick = () => showOverlay('title-overlay');

  // Pause
  document.getElementById('resume-btn').onclick = () => { gameState = 'playing'; hideAllOverlays(); playMusic(LEVELS[currentLevel].music); };
  document.getElementById('pause-restart-btn').onclick = () => { hideAllOverlays(); initLevel(currentLevel); };
  document.getElementById('pause-levels-btn').onclick = () => { gameState = 'levelselect'; hideAllOverlays(); renderLevelSelect(); showOverlay('level-select-overlay'); };
  document.getElementById('pause-quit-btn').onclick = () => { gameState = 'title'; stopMusic(); hideAllOverlays(); showOverlay('title-overlay'); };

  // End screen
  document.getElementById('next-level-btn').onclick = () => {
    hideAllOverlays();
    const next = Math.min(4, currentLevel + 1);
    initLevel(next);
  };
  document.getElementById('retry-btn').onclick = () => { hideAllOverlays(); initLevel(currentLevel); };
  document.getElementById('end-levels-btn').onclick = () => { gameState = 'levelselect'; hideAllOverlays(); renderLevelSelect(); showOverlay('level-select-overlay'); };
  document.getElementById('end-menu-btn').onclick = () => { gameState = 'title'; stopMusic(); hideAllOverlays(); showOverlay('title-overlay'); };

  // Game over
  document.getElementById('retry-go-btn').onclick = () => { hideAllOverlays(); lives = 3; initLevel(currentLevel); };
  document.getElementById('menu-go-btn').onclick = () => { gameState = 'title'; stopMusic(); hideAllOverlays(); showOverlay('title-overlay'); };

  // Instructions & credits
  document.getElementById('close-instructions').onclick = () => showOverlay('title-overlay');
  const hsClose = document.getElementById('close-highscores');
  if (hsClose) hsClose.onclick = () => showOverlay('title-overlay');
  document.getElementById('credits-menu-btn').onclick = () => { hideAllOverlays(); showOverlay('title-overlay'); };
  document.getElementById('credits-replay-btn').onclick = () => { hideAllOverlays(); unlockedLevels = [true,false,false,false,false]; lives=3; score=0; initLevel(0); };

  // Keyboard global for UI
  window.addEventListener('keydown', handleGlobalKeys);
}

function renderLevelSelect() {
  const container = document.getElementById('level-buttons');
  container.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const btn = document.createElement('button');
    btn.className = `btn level-btn ${unlockedLevels[i] ? '' : 'locked'} ${highScores[i] ? 'complete' : ''}`;
    btn.innerHTML = `${L.name} <span class="diff">${highScores[i] ? '★ ' + highScores[i] : (unlockedLevels[i] ? 'UNLOCKED' : 'LOCKED')}</span>`;
    if (unlockedLevels[i]) {
      btn.onclick = () => {
        hideAllOverlays();
        initLevel(i);
      };
    }
    container.appendChild(btn);
  });
}

function renderHighScores() {
  // Simple reuse level select modal if needed or inline
  const container = document.getElementById('level-buttons');
  if (!container) return;
  container.innerHTML = '<div style="margin-bottom:6px;color:#facc15">HIGH SCORES</div>';
  LEVELS.forEach((L, i) => {
    const div = document.createElement('div');
    div.style.cssText = 'margin:3px 0;font-size:10px;color:#c5d8ff';
    div.textContent = `${L.name}: ${(highScores[i] || 0).toString().padStart(6,'0')}`;
    container.appendChild(div);
  });
}

function renderHighScoresModal() {
  const cont = document.getElementById('highscore-content');
  if (!cont) return;
  cont.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const div = document.createElement('div');
    div.style.cssText = 'margin:4px 0; padding:2px 0; border-bottom:1px solid #334;';
    div.innerHTML = `<span style="color:#facc15">${L.name}</span> &nbsp; <span style="color:#4ade80">${(highScores[i] || 0).toString().padStart(6,'0')}</span>`;
    cont.appendChild(div);
  });
  const close = document.getElementById('close-highscores');
  if (close) close.onclick = () => showOverlay('title-overlay');
}

function handleGlobalKeys(e) {
  if (e.code === 'KeyM') { e.preventDefault(); toggleMute(); }
  if (e.code === 'KeyP' && gameState === 'playing') {
    e.preventDefault();
    gameState = 'paused';
    stopMusic();
    showOverlay('pause-overlay');
  }
  if ((gameState === 'gameover' || gameState === 'end') && e.code === 'KeyR') {
    hideAllOverlays();
    initLevel(currentLevel);
  }
  if (e.code === 'Escape') {
    if (gameState === 'playing') {
      gameState = 'paused'; stopMusic(); showOverlay('pause-overlay');
    } else if (gameState === 'paused') {
      gameState = 'playing'; hideAllOverlays(); playMusic(LEVELS[currentLevel].music);
    }
  }
}

// === INPUT ===
function setupInput() {
  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['Space','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyR' && (gameState === 'playing' || gameState === 'end' || gameState === 'gameover')) {
      if (gameState === 'playing') {
        lives = Math.max(1, lives - 1);
        initLevel(currentLevel);
      }
    }
  });
  window.addEventListener('keyup', e => {
    keys[e.code] = false;
  });

  // Track previous frame keys for edge press detection
  lastKeys = {};
  setInterval(() => { lastKeys = {...keys}; }, 16);
}

// === MAIN LOOP ===
function gameLoop() {
  if (gameState === 'playing') {
    update();
  }
  draw();

  // Auto hide some
  if (gameState === 'title' && !document.getElementById('title-overlay').classList.contains('active')) {
    showOverlay('title-overlay');
  }

  // If finished final level and in end, allow credits on next
  if (gameState === 'end' && currentLevel === 4) {
    const nextBtn = document.getElementById('next-level-btn');
    if (nextBtn && nextBtn.onclick) {
      // already handled, when clicked show victory
    }
  }

  requestAnimationFrame(gameLoop);
}

function init() {
  initAudio();
  loadHighScores();

  // Preload check
  let loadedCount = 0;
  const totalAssets = Object.keys(assets).length;
  function assetReady() {
    loadedCount++;
    if (loadedCount >= totalAssets - 1) {
      // Start
      setupUI();
      setupInput();
      console.log('%c[Joshway: Flash Odyssey] FULL PRODUCTION READY. 5 epic levels • variable jumps • cape attacks • full possess • scoring • high scores • gorgeous parallax • rich audio.', 'color:#facc15');
      // Boot to title
      showOverlay('title-overlay');
      gameLoop();
    }
  }
  Object.values(assets).forEach(img => {
    if (img.complete) assetReady();
    else { img.onload = assetReady; img.onerror = assetReady; }
  });

  // Fallback start after delay if images slow
  setTimeout(() => {
    if (gameState === 'title' && !document.getElementById('title-overlay').classList.contains('active')) {
      showOverlay('title-overlay');
    }
  }, 1800);
}

init();