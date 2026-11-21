(() => {
  'use strict';

  /* =========================================================
     CONSTANTS & TUNING
     ========================================================= */
  const STORAGE_BEST_KEY = 'updraft_best_score_v1';
  const STORAGE_MUTE_KEY = 'updraft_muted_v1';

  function storageGet(key, fallback = null) {
    try {
      const val = window.localStorage.getItem(key);
      return val === null ? fallback : val;
    } catch {
      return fallback;
    }
  }

  function storageSet(key, val) {
    try {
      window.localStorage.setItem(key, val);
    } catch {
      // Ignore storage failures in restricted contexts
    }
  }

  const PIPES_PER_DRAFT = 10;
  const BASE_DEBUFF_CHANCE = 0.35;
  const HIGH_PIPES_THRESHOLD = 30;
  const HIGH_DEBUFF_CHANCE = 0.50;
  const MAX_ACTIVE_MODS = 3;

  const BASE = {
    gravity: 1380,         // px/s^2
    flapImpulse: -435,     // px/s
    maxFallSpeed: 640,     // px/s
    scrollSpeed: 235,      // px/s
    pipeGap: 168,          // px
    pipeWidth: 74,         // px
    pipeSpacing: 325,      // px
    birdRadius: 16,        // px
    groundHeight: 74,      // px
  };

  // Atmospheric twilight palettes that subtly evolve every 10 pipes
  const SKY_THEMES = [
    { top: '#0b1126', mid: '#182548', low: '#2c3d68', glow: '#38bdf8', ridge1: '#111b36', ridge2: '#0d152c' },
    { top: '#140f2d', mid: '#2d1e4f', low: '#5b315d', glow: '#f472b6', ridge1: '#1d1436', ridge2: '#130e26' },
    { top: '#071a26', mid: '#0f3344', low: '#1b5362', glow: '#2dd4bf', ridge1: '#0a222e', ridge2: '#071822' },
    { top: '#1a1220', mid: '#3b2038', low: '#7c3f4c', glow: '#fb923c', ridge1: '#231526', ridge2: '#160d19' },
    { top: '#0c1026', mid: '#1e1b4b', low: '#3730a3', glow: '#818cf8', ridge1: '#131336', ridge2: '#0c0c24' },
  ];

  /* =========================================================
     20 PERKS + 10 DEBUFFS
     ========================================================= */
  const PERKS = [
    {
      id: 'micro_frame',
      type: 'perk',
      icon: '◈',
      name: 'Micro Frame',
      stat: 'HITBOX −20%',
      desc: 'Shrinks your aerodynamic frame and hitbox for tighter threads.',
      stackable: true,
      maxStacks: 3,
    },
    {
      id: 'wide_berth',
      type: 'perk',
      icon: '⇕',
      name: 'Wide Berth',
      stat: 'PIPE GAPS +15%',
      desc: 'Opens wider vertical clearance through every upcoming gate.',
      stackable: true,
      maxStacks: 4,
    },
    {
      id: 'featherweight',
      type: 'perk',
      icon: '✧',
      name: 'Featherweight',
      stat: 'GRAVITY −15%',
      desc: 'Lighter descent gives you more hangtime between flaps.',
      stackable: true,
      maxStacks: 3,
    },
    {
      id: 'aegis',
      type: 'perk',
      icon: '⬡',
      name: 'Aegis',
      stat: 'ENERGY SHIELD',
      desc: 'Absorbs one fatal collision with brief invulnerability. Recharges every 20 pipes.',
      stackable: false,
      maxStacks: 1,
    },
    {
      id: 'time_dilation',
      type: 'perk',
      icon: '◷',
      name: 'Time Dilation',
      stat: 'SPEED −14%',
      desc: 'Slows incoming world speed so every move feels deliberate.',
      stackable: true,
      maxStacks: 3,
    },
    {
      id: 'double_tally',
      type: 'perk',
      icon: '✦',
      name: 'Double Tally',
      stat: '+1 SCORE / PIPE',
      desc: 'Every cleared pipe grants an extra bonus point.',
      stackable: true,
      maxStacks: 3,
    },
    {
      id: 'soft_updraft',
      type: 'perk',
      icon: '∿',
      name: 'Soft Updraft',
      stat: 'GENTLER FLAP',
      desc: 'Reduces flap snap by 12% for smoother micro-adjustments.',
      stackable: true,
      maxStacks: 2,
    },
    {
      id: 'tailwind_spacing',
      type: 'perk',
      icon: '⇢',
      name: 'Tailwind',
      stat: 'SPACING +16%',
      desc: 'Pushes pipe columns further apart for extra breathing room.',
      stackable: true,
      maxStacks: 3,
    },
    {
      id: 'pipe_trim',
      type: 'perk',
      icon: '▥',
      name: 'Pipe Trim',
      stat: 'WIDTH −18%',
      desc: 'Trims pipe thickness horizontally so gaps are easier to exit.',
      stackable: true,
      maxStacks: 3,
    },
    {
      id: 'glide',
      type: 'perk',
      icon: '⌄',
      name: 'Thermal Glide',
      stat: 'HOLD TO GLIDE',
      desc: 'Hold Space or Mouse while falling to descend gently like a glider.',
      stackable: false,
      maxStacks: 1,
    },
    {
      id: 'sky_buffer',
      type: 'perk',
      icon: '⌒',
      name: 'Sky Buffer',
      stat: 'CEILING PHASE',
      desc: 'Bouncing off the ceiling cushions your descent and grants 0.6s of phase-through.',
      stackable: false,
      maxStacks: 1,
    },
    {
      id: 'ground_spring',
      type: 'perk',
      icon: '↥',
      name: 'Ground Spring',
      stat: 'SAFETY BOUNCE',
      desc: 'Touching the ground launches you back up safely. Refreshes every 10 pipes.',
      stackable: false,
      maxStacks: 1,
    },
    {
      id: 'steady_horizon',
      type: 'perk',
      icon: '═',
      name: 'Steady Horizon',
      stat: 'CALM ALTITUDES',
      desc: 'Keeps pipe openings clustered closer to the center line.',
      stackable: true,
      maxStacks: 2,
    },
    {
      id: 'phantom_blink',
      type: 'perk',
      icon: '◎',
      name: 'Phantom Blink',
      stat: 'PHASE EVERY 5TH',
      desc: 'Every 5th cleared pipe grants 1.6s of phase-through invulnerability.',
      stackable: false,
      maxStacks: 1,
    },
    {
      id: 'score_surge',
      type: 'perk',
      icon: '⚡',
      name: 'Score Surge',
      stat: '+10 INSTANT SCORE',
      desc: 'Immediately banks +10 points into your current run.',
      stackable: true,
      maxStacks: 99,
      instant: true,
    },
    {
      id: 'calm_skies',
      type: 'perk',
      icon: '☀',
      name: 'Calm Skies',
      stat: 'CLEANSE 1 CURSE',
      desc: 'Removes one random headwind curse (or grants +15 score & wider gaps if clear).',
      stackable: true,
      maxStacks: 99,
      instant: true,
    },
    {
      id: 'magnet_drift',
      type: 'perk',
      icon: '⊹',
      name: 'Slipstream',
      stat: 'GAP ASSIST',
      desc: 'Subtle air currents gently guide you toward the center of upcoming gaps.',
      stackable: true,
      maxStacks: 2,
    },
    {
      id: 'lucky_draft',
      type: 'perk',
      icon: '❖',
      name: 'Clear Forecast',
      stat: 'CURSE RATE −10%',
      desc: 'Lowers future headwind curse odds by 10% (minimum 10%).',
      stackable: true,
      maxStacks: 3,
    },
    {
      id: 'second_wind',
      type: 'perk',
      icon: '♥',
      name: 'Second Wind',
      stat: '1× REVIVE',
      desc: 'Survive one lethal crash with a shockwave that clears nearby pipes.',
      stackable: false,
      maxStacks: 1,
    },
    {
      id: 'golden_plume',
      type: 'perk',
      icon: '★',
      name: 'Golden Plume',
      stat: '+5 EVERY 5TH PIPE',
      desc: 'Every 5th pipe erupts in gold for +5 extra score.',
      stackable: true,
      maxStacks: 2,
    },
  ];

  const DEBUFFS = [
    {
      id: 'overdrive',
      type: 'debuff',
      icon: '»',
      name: 'Overdrive',
      stat: 'SPEED +16%',
      desc: 'Tailwind surges into a gale, accelerating incoming pipes.',
      stackable: true,
      maxStacks: 3,
    },
    {
      id: 'tight_squeeze',
      type: 'debuff',
      icon: '⇳',
      name: 'Tight Squeeze',
      stat: 'PIPE GAPS −14%',
      desc: 'Narrower openings demand sharper timing.',
      stackable: true,
      maxStacks: 3,
    },
    {
      id: 'lead_wings',
      type: 'debuff',
      icon: '▼',
      name: 'Lead Wings',
      stat: 'GRAVITY +18%',
      desc: 'Heavier downward pull makes every drop steeper.',
      stackable: true,
      maxStacks: 3,
    },
    {
      id: 'heavy_frame',
      type: 'debuff',
      icon: '●',
      name: 'Heavy Frame',
      stat: 'HITBOX +20%',
      desc: 'Enlarges your silhouette and collision radius.',
      stackable: true,
      maxStacks: 2,
    },
    {
      id: 'turbulence',
      type: 'debuff',
      icon: '≈',
      name: 'Turbulence',
      stat: 'CAMERA SWAY',
      desc: 'Crosswinds gently tilt and rock the horizon mid-flight.',
      stackable: true,
      maxStacks: 2,
    },
    {
      id: 'hyper_flap',
      type: 'debuff',
      icon: '▲',
      name: 'Hyper Flap',
      stat: 'FLAP +20% JUMPY',
      desc: 'Each wingbeat kicks much harder than usual.',
      stackable: true,
      maxStacks: 2,
    },
    {
      id: 'crowded_sky',
      type: 'debuff',
      icon: '⫴',
      name: 'Crowded Sky',
      stat: 'SPACING −15%',
      desc: 'Pipe columns pack closer together horizontally.',
      stackable: true,
      maxStacks: 3,
    },
    {
      id: 'moving_gates',
      type: 'debuff',
      icon: '⇅',
      name: 'Moving Gates',
      stat: 'OSCILLATING PIPES',
      desc: 'Pipe gaps slowly drift up and down as they approach.',
      stackable: true,
      maxStacks: 2,
    },
    {
      id: 'dim_dusk',
      type: 'debuff',
      icon: '◐',
      name: 'Eclipse',
      stat: 'NARROW VISION',
      desc: 'Deepens twilight into a moody spotlight around your bird.',
      stackable: false,
      maxStacks: 1,
    },
    {
      id: 'wild_altitudes',
      type: 'debuff',
      icon: '⟋',
      name: 'Wild Altitudes',
      stat: 'EXTREME GAPS',
      desc: 'Pipe openings swing toward dramatically higher and lower heights.',
      stackable: true,
      maxStacks: 2,
    },
  ];

  const ALL_MODIFIERS = new Map([...PERKS, ...DEBUFFS].map((m) => [m.id, m]));

  /* =========================================================
     SYNTHESIZED MODERN WEB AUDIO ENGINE
     ========================================================= */
  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.muted = storageGet(STORAGE_MUTE_KEY, '0') === '1';
    }

    ensure() {
      if (this.muted) return null;
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    toggleMute() {
      this.muted = !this.muted;
      storageSet(STORAGE_MUTE_KEY, this.muted ? '1' : '0');
      return this.muted;
    }

    playTone({ freq, endFreq = freq, duration = 0.12, type = 'sine', gain = 0.12, delay = 0 }) {
      const ctx = this.ensure();
      if (!ctx) return;
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (endFreq !== freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
      }
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(gain, now + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(env);
      env.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    flap() {
      this.playTone({ freq: 270, endFreq: 490, duration: 0.09, type: 'triangle', gain: 0.09 });
    }

    score(isBonus = false) {
      if (isBonus) {
        this.playTone({ freq: 660, duration: 0.11, type: 'sine', gain: 0.11 });
        this.playTone({ freq: 880, duration: 0.14, type: 'sine', gain: 0.11, delay: 0.06 });
        this.playTone({ freq: 1174, duration: 0.2, type: 'triangle', gain: 0.1, delay: 0.12 });
      } else {
        this.playTone({ freq: 587, endFreq: 784, duration: 0.11, type: 'sine', gain: 0.08 });
      }
    }

    draftOpen(isDebuff) {
      if (isDebuff) {
        this.playTone({ freq: 310, endFreq: 220, duration: 0.18, type: 'sawtooth', gain: 0.06 });
        this.playTone({ freq: 210, endFreq: 155, duration: 0.26, type: 'triangle', gain: 0.08, delay: 0.1 });
      } else {
        this.playTone({ freq: 440, duration: 0.14, type: 'sine', gain: 0.09 });
        this.playTone({ freq: 554, duration: 0.14, type: 'sine', gain: 0.09, delay: 0.07 });
        this.playTone({ freq: 659, duration: 0.22, type: 'sine', gain: 0.1, delay: 0.14 });
      }
    }

    pickCard(isDebuff) {
      if (isDebuff) {
        this.playTone({ freq: 260, endFreq: 180, duration: 0.16, type: 'triangle', gain: 0.1 });
      } else {
        this.playTone({ freq: 523, endFreq: 784, duration: 0.16, type: 'sine', gain: 0.11 });
      }
    }

    shieldBreak() {
      this.playTone({ freq: 720, endFreq: 260, duration: 0.22, type: 'triangle', gain: 0.13 });
      this.playTone({ freq: 420, endFreq: 680, duration: 0.16, type: 'sine', gain: 0.08, delay: 0.05 });
    }

    bounce() {
      this.playTone({ freq: 220, endFreq: 540, duration: 0.15, type: 'sine', gain: 0.11 });
    }

    loadoutReset() {
      this.playTone({ freq: 520, endFreq: 260, duration: 0.18, type: 'sine', gain: 0.1 });
      this.playTone({ freq: 390, endFreq: 195, duration: 0.22, type: 'triangle', gain: 0.08, delay: 0.07 });
      this.playTone({ freq: 660, endFreq: 880, duration: 0.2, type: 'sine', gain: 0.09, delay: 0.16 });
    }

    crash() {
      this.playTone({ freq: 190, endFreq: 55, duration: 0.28, type: 'sawtooth', gain: 0.12 });
      this.playTone({ freq: 110, endFreq: 42, duration: 0.34, type: 'triangle', gain: 0.13, delay: 0.03 });
    }
  }

  /* =========================================================
     DOM REFERENCES
     ========================================================= */
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const dom = {
    hud: document.getElementById('hud'),
    hudScore: document.getElementById('hudScore'),
    hudBest: document.getElementById('hudBest'),
    hudDraftPill: document.getElementById('hudDraftPill'),
    hudDraftLabel: document.getElementById('hudDraftLabel'),
    hudDraftCount: document.getElementById('hudDraftCount'),
    hudDraftFill: document.getElementById('hudDraftFill'),
    hudSlotsPill: document.getElementById('hudSlotsPill'),
    hudSlotsCount: document.getElementById('hudSlotsCount'),
    modifiersDock: document.getElementById('modifiersDock'),
    readyPrompt: document.getElementById('readyPrompt'),
    readyText: document.getElementById('readyText'),

    btnMute: document.getElementById('btnMute'),
    iconSoundOn: document.getElementById('iconSoundOn'),
    iconSoundOff: document.getElementById('iconSoundOff'),
    btnPause: document.getElementById('btnPause'),

    titleOverlay: document.getElementById('titleOverlay'),
    titleBest: document.getElementById('titleBest'),
    btnPlay: document.getElementById('btnPlay'),
    btnCodex: document.getElementById('btnCodex'),

    draftOverlay: document.getElementById('draftOverlay'),
    draftPanel: document.getElementById('draftPanel'),
    draftBadge: document.getElementById('draftBadge'),
    draftTitle: document.getElementById('draftTitle'),
    draftSubtitle: document.getElementById('draftSubtitle'),
    draftCards: document.getElementById('draftCards'),

    pauseOverlay: document.getElementById('pauseOverlay'),
    btnResume: document.getElementById('btnResume'),
    btnPauseRestart: document.getElementById('btnPauseRestart'),
    btnPauseMenu: document.getElementById('btnPauseMenu'),

    gameOverOverlay: document.getElementById('gameOverOverlay'),
    newBestBadge: document.getElementById('newBestBadge'),
    goScore: document.getElementById('goScore'),
    goBest: document.getElementById('goBest'),
    goPipes: document.getElementById('goPipes'),
    goDrafts: document.getElementById('goDrafts'),
    goBuildSection: document.getElementById('goBuildSection'),
    goBuildList: document.getElementById('goBuildList'),
    btnRetry: document.getElementById('btnRetry'),
    btnGoMenu: document.getElementById('btnGoMenu'),

    codexOverlay: document.getElementById('codexOverlay'),
    btnCloseCodex: document.getElementById('btnCloseCodex'),
    tabPerks: document.getElementById('tabPerks'),
    tabDebuffs: document.getElementById('tabDebuffs'),
    codexGrid: document.getElementById('codexGrid'),
  };

  const sound = new SoundEngine();

  /* =========================================================
     GAME STATE
     ========================================================= */
  let viewW = window.innerWidth;
  let viewH = window.innerHeight;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  // States: 'title' | 'ready' | 'playing' | 'draft' | 'paused' | 'dying' | 'gameover'
  const state = {
    mode: 'title',
    bestScore: parseInt(storageGet(STORAGE_BEST_KEY, '0'), 10) || 0,
    isNewBestRun: false,
    score: 0,
    pipesCleared: 0,
    nextPipeNumber: 1,
    draftsCompleted: 0,
    time: 0,
    worldScroll: 0,
    isHoldingInput: false,
    shakeTime: 0,
    shakeMag: 0,
    flashAlpha: 0,
    flashColor: '#ffffff',
    dyingTimer: 0,
    gameOverLockUntil: 0,
    currentDraftOptions: [],
    currentDraftIsDebuff: false,
    resumeMode: 'initial', // 'initial' | 'post-draft'

    bird: {
      x: 0,
      y: 0,
      readyBaseY: 0,
      vy: 0,
      rotation: 0,
      wingPhase: 0,
      invulnTimer: 0,
      trail: [],
    },

    pipes: [],
    particles: [],
    floatingTexts: [],
    stars: [],
    clouds: [],
    motes: [],

    // Active modifiers map: id -> stack count
    mods: new Map(),
    shieldActive: false,
    shieldRechargePipes: 0,
    groundSpringReady: false,
    secondWindUsed: false,
    calmSkiesBonusGap: 0,
  };

  /* =========================================================
     DERIVED PHYSICS / STATS FROM ACTIVE MODS
     ========================================================= */
  function countMod(id) {
    return state.mods.get(id) || 0;
  }

  function getActiveModCount() {
    let total = 0;
    state.mods.forEach((cnt) => {
      total += cnt;
    });
    return total;
  }

  function resetActiveModifiers() {
    state.mods.clear();
    state.shieldActive = false;
    state.shieldRechargePipes = 0;
    state.groundSpringReady = false;
    state.secondWindUsed = false;
    state.calmSkiesBonusGap = 0;
    state.bird.invulnTimer = Math.max(state.bird.invulnTimer, 1.0);

    // Stop any pre-spawned pipes from continuing to oscillate after Moving Gates clears
    state.pipes.forEach((p) => {
      p.bobAmp = 0;
      p.bobSpeed = 0;
      p.centerY = p.baseCenterY;
    });

    sound.loadoutReset();
    triggerShake(6, 0.2);
    triggerFlash('#fde047', 0.22);
    spawnParticles(state.bird.x, state.bird.y, 26, '#fde047', 70, 240);
    spawnFloatingText(state.bird.x, state.bird.y - 36, 'LOADOUT RESET · CLEAN SLATE', '#fde047', 16);
    updateHud();
    renderModifiersDock();
  }

  function getStats() {
    const micro = countMod('micro_frame');
    const heavy = countMod('heavy_frame');
    const wide = countMod('wide_berth');
    const tight = countMod('tight_squeeze');
    const feather = countMod('featherweight');
    const lead = countMod('lead_wings');
    const slow = countMod('time_dilation');
    const fast = countMod('overdrive');
    const soft = countMod('soft_updraft');
    const hyper = countMod('hyper_flap');
    const tailwind = countMod('tailwind_spacing');
    const crowded = countMod('crowded_sky');
    const trim = countMod('pipe_trim');
    const steady = countMod('steady_horizon');
    const wild = countMod('wild_altitudes');
    const lucky = countMod('lucky_draft');

    // Subtle natural progression every 10 pipes (+2.5% speed up to +25%)
    const progression = 1 + Math.min(0.25, Math.floor(state.pipesCleared / 10) * 0.025);

    const radiusScale = clamp(Math.pow(0.8, micro) * Math.pow(1.2, heavy), 0.5, 1.55);
    const gapScale = clamp(
      Math.pow(1.15, wide) * Math.pow(0.86, tight) * (1 + state.calmSkiesBonusGap),
      0.66,
      1.75
    );
    const gravityScale = clamp(Math.pow(0.85, feather) * Math.pow(1.18, lead), 0.55, 1.75);
    const speedScale = clamp(Math.pow(0.86, slow) * Math.pow(1.16, fast) * progression, 0.62, 1.85);
    const flapScale = clamp(Math.pow(0.88, soft) * Math.pow(1.2, hyper), 0.72, 1.48);
    const spacingScale = clamp(Math.pow(1.16, tailwind) * Math.pow(0.85, crowded), 0.68, 1.65);
    const widthScale = clamp(Math.pow(0.82, trim), 0.52, 1.0);

    // Gap vertical variance factor (1.0 = standard, lower = closer to center, higher = wider extremes)
    const altitudeSpread = clamp(1 - steady * 0.24 + wild * 0.26, 0.42, 1.45);
    const baseDebuff = state.pipesCleared > HIGH_PIPES_THRESHOLD ? HIGH_DEBUFF_CHANCE : BASE_DEBUFF_CHANCE;
    const debuffChance = clamp(baseDebuff - lucky * 0.1, 0.1, 0.65);

    // Responsive scaling for smaller viewport heights
    const playableH = Math.max(220, viewH - BASE.groundHeight);
    const heightScale = clamp(viewH / 760, 0.78, 1.18);
    const pipeGap = Math.min(BASE.pipeGap * gapScale * heightScale, playableH - 96);

    return {
      birdRadius: BASE.birdRadius * radiusScale,
      pipeGap,
      gravity: BASE.gravity * gravityScale,
      scrollSpeed: BASE.scrollSpeed * speedScale,
      flapImpulse: BASE.flapImpulse * flapScale,
      pipeSpacing: BASE.pipeSpacing * spacingScale,
      pipeWidth: BASE.pipeWidth * widthScale,
      altitudeSpread,
      debuffChance,
      scorePerPipe: 1 + countMod('double_tally'),
      hasGlide: countMod('glide') > 0,
      hasSkyBuffer: countMod('sky_buffer') > 0,
      hasPhantom: countMod('phantom_blink') > 0,
      magnetLevel: countMod('magnet_drift'),
      goldenLevel: countMod('golden_plume'),
      turbulenceLevel: countMod('turbulence'),
      movingGatesLevel: countMod('moving_gates'),
      hasEclipse: countMod('dim_dusk') > 0,
    };
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  function lerpColor(hexA, hexB, t) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    const r = Math.round(lerp(a[0], b[0], t));
    const g = Math.round(lerp(a[1], b[1], t));
    const bl = Math.round(lerp(a[2], b[2], t));
    return `rgb(${r}, ${g}, ${bl})`;
  }

  /* =========================================================
     BACKGROUND SCENERY INITIALIZATION
     ========================================================= */
  function initScenery() {
    state.stars = Array.from({ length: 58 }, () => ({
      x: Math.random() * viewW,
      y: Math.random() * (viewH * 0.65),
      r: 0.6 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
      speed: 0.8 + Math.random() * 1.8,
    }));

    state.clouds = Array.from({ length: 7 }, (_, i) => ({
      x: (i / 7) * (viewW + 300) - 100,
      y: 70 + Math.random() * (viewH * 0.36),
      w: 150 + Math.random() * 170,
      h: 28 + Math.random() * 26,
      speed: 12 + Math.random() * 18,
      alpha: 0.05 + Math.random() * 0.07,
    }));

    state.motes = Array.from({ length: 24 }, () => ({
      x: Math.random() * viewW,
      y: Math.random() * (viewH - BASE.groundHeight),
      r: 1 + Math.random() * 2,
      vx: -18 - Math.random() * 28,
      vy: (Math.random() - 0.5) * 14,
      alpha: 0.15 + Math.random() * 0.35,
    }));
  }

  function resize() {
    const prevPlayableH = Math.max(220, viewH - BASE.groundHeight);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${viewH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const playableH = Math.max(220, viewH - BASE.groundHeight);
    const yRatio = playableH / prevPlayableH;

    state.bird.x = clamp(viewW * 0.27, 92, 340);
    if (state.mode === 'title' || state.mode === 'ready') {
      state.bird.readyBaseY = playableH * 0.46;
      state.bird.y = state.bird.readyBaseY;
    } else {
      state.bird.y = clamp(state.bird.y * yRatio, 36, playableH - 36);
    }

    // Keep existing pipes safely within the resized playable height
    state.pipes.forEach((p) => {
      p.gap = Math.min(p.gap, playableH - 96);
      const halfGap = p.gap * 0.5;
      const minC = Math.min(playableH * 0.5, 68 + halfGap);
      const maxC = Math.max(playableH * 0.5, playableH - 68 - halfGap);
      p.baseCenterY = clamp(p.baseCenterY * yRatio, minC, maxC);
      p.centerY = clamp(p.centerY * yRatio, minC, maxC);
    });
  }

  /* =========================================================
     PARTICLES & FLOATING TEXT
     ========================================================= */
  function spawnParticles(x, y, count, color, speedMin = 40, speedMax = 160, spread = Math.PI * 2, baseAngle = 0) {
    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (Math.random() - 0.5) * spread;
      const spd = speedMin + Math.random() * (speedMax - speedMin);
      const life = 0.35 + Math.random() * 0.45;
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        r: 1.8 + Math.random() * 3.2,
        life,
        maxLife: life,
        color,
      });
    }
  }

  function spawnFloatingText(x, y, text, color = '#ffffff', size = 18) {
    state.floatingTexts.push({
      x,
      y,
      text,
      color,
      size,
      life: 0.95,
      maxLife: 0.95,
    });
  }

  function triggerShake(mag = 7, duration = 0.22) {
    state.shakeMag = Math.max(state.shakeMag, mag);
    state.shakeTime = Math.max(state.shakeTime, duration);
  }

  function triggerFlash(color = '#ffffff', alpha = 0.25) {
    state.flashColor = color;
    state.flashAlpha = Math.max(state.flashAlpha, alpha);
  }

  /* =========================================================
     PIPE SPAWNING
     ========================================================= */
  function spawnPipe(xPos) {
    const stats = getStats();
    const playableH = Math.max(220, viewH - BASE.groundHeight);
    const minMargin = 72;
    const halfGap = stats.pipeGap * 0.5;
    const rawMin = minMargin + halfGap;
    const rawMax = playableH - minMargin - halfGap;
    const mid = playableH * 0.5;
    const minCenter = rawMin <= rawMax ? rawMin : mid;
    const maxCenter = rawMin <= rawMax ? rawMax : mid;
    const halfSpan = Math.max(0, (maxCenter - minCenter) * 0.5);

    let centerY;
    if (stats.altitudeSpread > 1.05) {
      const sign = Math.random() < 0.5 ? -1 : 1;
      const bias = Math.pow(Math.random(), 0.55);
      centerY = clamp(mid + sign * bias * halfSpan * Math.min(1.05, stats.altitudeSpread), minCenter, maxCenter);
    } else {
      centerY = clamp(mid + (Math.random() * 2 - 1) * halfSpan * stats.altitudeSpread, minCenter, maxCenter);
    }

    if (state.pipes.length > 0) {
      const prev = state.pipes[state.pipes.length - 1];
      const maxDelta = playableH * (stats.altitudeSpread > 1.05 ? 0.5 : 0.38);
      centerY = clamp(centerY, prev.baseCenterY - maxDelta, prev.baseCenterY + maxDelta);
      centerY = clamp(centerY, minCenter, maxCenter);
    }

    const bobAmp = stats.movingGatesLevel > 0 ? (24 + stats.movingGatesLevel * 18) : 0;
    const bobSpeed = stats.movingGatesLevel > 0 ? (1.35 + stats.movingGatesLevel * 0.45) : 0;

    state.pipes.push({
      pipeNumber: state.nextPipeNumber++,
      x: xPos,
      width: stats.pipeWidth,
      gap: stats.pipeGap,
      baseCenterY: centerY,
      centerY,
      passed: false,
      bobPhase: Math.random() * Math.PI * 2,
      bobAmp,
      bobSpeed,
    });
  }

  /* =========================================================
     RUN LIFECYCLE
     ========================================================= */
  function resetRun() {
    state.score = 0;
    state.isNewBestRun = false;
    state.pipesCleared = 0;
    state.nextPipeNumber = 1;
    state.draftsCompleted = 0;
    state.dyingTimer = 0;
    state.gameOverLockUntil = 0;
    state.mods.clear();
    state.shieldActive = false;
    state.shieldRechargePipes = 0;
    state.groundSpringReady = false;
    state.secondWindUsed = false;
    state.calmSkiesBonusGap = 0;
    state.pipes = [];
    state.particles = [];
    state.floatingTexts = [];
    state.isHoldingInput = false;
    state.resumeMode = 'initial';

    state.bird.x = clamp(viewW * 0.27, 92, 340);
    state.bird.readyBaseY = (viewH - BASE.groundHeight) * 0.46;
    state.bird.y = state.bird.readyBaseY;
    state.bird.vy = 0;
    state.bird.rotation = 0;
    state.bird.invulnTimer = 0;
    state.bird.trail = [];

    // Pre-populate initial pipes comfortably ahead
    const stats = getStats();
    let startX = Math.max(viewW * 0.85, state.bird.x + 420);
    for (let i = 0; i < 4; i++) {
      spawnPipe(startX + i * stats.pipeSpacing);
    }

    updateHud();
    renderModifiersDock();
  }

  function startNewGame() {
    resetRun();
    setMode('ready');
    dom.readyText.textContent = 'TAP OR PRESS SPACE TO FLY';
  }

  function setMode(nextMode) {
    state.mode = nextMode;
    if (nextMode !== 'playing') {
      state.isHoldingInput = false;
    }

    dom.titleOverlay.classList.toggle('visible', nextMode === 'title');
    dom.draftOverlay.classList.toggle('visible', nextMode === 'draft');
    dom.pauseOverlay.classList.toggle('visible', nextMode === 'paused');
    dom.gameOverOverlay.classList.toggle('visible', nextMode === 'gameover');

    const showHud = nextMode === 'ready' || nextMode === 'playing' || nextMode === 'draft' || nextMode === 'paused' || nextMode === 'dying';
    dom.hud.classList.toggle('hidden', !showHud);
    dom.modifiersDock.classList.toggle('hidden', !showHud || state.mods.size === 0);
    dom.readyPrompt.classList.toggle('hidden', nextMode !== 'ready');
    dom.btnPause.disabled = nextMode !== 'playing' && nextMode !== 'paused';

    if (nextMode === 'title') {
      dom.titleBest.textContent = String(state.bestScore);
    }
  }

  function flap() {
    if (state.mode === 'ready') {
      setMode('playing');
      if (state.resumeMode === 'post-draft') {
        state.bird.invulnTimer = Math.max(state.bird.invulnTimer, 1.15);
      }
    }
    if (state.mode !== 'playing') return;

    const stats = getStats();
    state.bird.vy = stats.flapImpulse;
    state.bird.wingPhase = 1.0;
    sound.flap();
    spawnParticles(state.bird.x - 10, state.bird.y + 4, 6, 'rgba(186, 230, 253, 0.85)', 35, 110, 1.3, Math.PI);
  }

  /* =========================================================
     DRAFT SYSTEM (EVERY 10 PIPES — 65% PERK / 35% DEBUFF)
     ========================================================= */
  function openDraft() {
    const stats = getStats();
    const isDebuff = Math.random() < stats.debuffChance;
    state.currentDraftIsDebuff = isDebuff;

    const pool = isDebuff ? DEBUFFS : PERKS;
    const eligible = pool.filter((item) => countMod(item.id) < item.maxStacks);
    const source = eligible.length >= 3 ? eligible : pool;

    // Fisher-Yates pick 3 distinct options
    const shuffled = [...source];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    state.currentDraftOptions = shuffled.slice(0, 3);

    // Populate modal UI
    dom.draftPanel.classList.toggle('mode-perk', !isDebuff);
    dom.draftPanel.classList.toggle('mode-debuff', isDebuff);

    const cursePct = Math.round(stats.debuffChance * 100);
    dom.draftBadge.textContent = isDebuff
      ? `HEADWIND · PIPE ${state.pipesCleared}`
      : `MILESTONE · PIPE ${state.pipesCleared}`;
    dom.draftTitle.textContent = isDebuff ? 'PICK YOUR POISON' : 'CHOOSE AN UPDRAFT';
    dom.draftSubtitle.textContent = isDebuff
      ? `A ${cursePct}% headwind rolled in — endure one curse to continue`
      : `Select 1 of 3 perks to evolve your flight (${cursePct}% curse odds)`;

    dom.draftCards.innerHTML = '';
    state.currentDraftOptions.forEach((mod, idx) => {
      const existing = countMod(mod.id);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `draft-card ${mod.type}`;
      card.innerHTML = `
        <div class="card-top">
          <div class="card-icon">${mod.icon}</div>
          <span class="card-key">${idx + 1}</span>
        </div>
        <div class="card-name">${mod.name}${existing > 0 && !mod.instant ? ` <span style="opacity:.55;font-size:13px">×${existing + 1}</span>` : ''}</div>
        <div class="card-stat">${mod.stat}</div>
        <div class="card-desc">${mod.desc}</div>
      `;
      card.addEventListener('click', () => chooseDraftOption(idx));
      dom.draftCards.appendChild(card);
    });

    sound.draftOpen(isDebuff);
    setMode('draft');
  }

  function chooseDraftOption(index) {
    if (state.mode !== 'draft') return;
    const mod = state.currentDraftOptions[index];
    if (!mod) return;

    sound.pickCard(mod.type === 'debuff');
    applyModifier(mod);
    state.draftsCompleted += 1;

    // Ensure fair spacing on resume: only check UPCOMING (unpassed) pipes so cleared pipes never teleport back!
    const safeMinX = state.bird.x + 210;
    const tooClosePipe = state.pipes.find((p) => !p.passed && p.x + p.width > state.bird.x - 20 && p.x < safeMinX);
    if (tooClosePipe) {
      const shift = safeMinX - tooClosePipe.x;
      state.pipes.forEach((p) => {
        if (!p.passed && p.x >= tooClosePipe.x - 10) p.x += shift;
      });
    }

    // Center bird slightly if dangerously near ceiling/ground
    const playableH = viewH - BASE.groundHeight;
    state.bird.readyBaseY = clamp(state.bird.y, 110, playableH - 110);
    state.bird.y = state.bird.readyBaseY;
    state.bird.vy = 0;
    state.bird.rotation = 0;
    state.resumeMode = 'post-draft';

    updateHud();
    renderModifiersDock();
    dom.readyText.textContent = `${mod.name.toUpperCase()} ACTIVE · TAP OR SPACE TO RESUME`;
    setMode('ready');
  }

  function applyModifier(mod) {
    if (mod.id === 'score_surge') {
      addScore(10, true, '+10 SURGE', '#5eead4');
      return;
    }

    if (mod.id === 'calm_skies') {
      const activeDebuffs = [...state.mods.entries()].filter(([id, cnt]) => {
        const def = ALL_MODIFIERS.get(id);
        return def && def.type === 'debuff' && cnt > 0;
      });
      if (activeDebuffs.length > 0) {
        const [removeId, cnt] = activeDebuffs[Math.floor(Math.random() * activeDebuffs.length)];
        if (cnt <= 1) state.mods.delete(removeId);
        else state.mods.set(removeId, cnt - 1);
        const removedDef = ALL_MODIFIERS.get(removeId);
        spawnFloatingText(state.bird.x, state.bird.y - 36, `CLEANSED ${removedDef.name.toUpperCase()}`, '#5eead4', 15);
      } else {
        state.calmSkiesBonusGap += 0.08;
        addScore(15, true, '+15 CLEAR SKIES', '#fde047');
      }
      return;
    }

    // Add persistent modifier stack
    state.mods.set(mod.id, countMod(mod.id) + 1);

    if (mod.id === 'aegis') {
      state.shieldActive = true;
      state.shieldRechargePipes = 0;
    }
    if (mod.id === 'ground_spring') {
      state.groundSpringReady = true;
    }
    if (mod.id === 'moving_gates') {
      const level = countMod('moving_gates');
      const amp = 24 + level * 18;
      const spd = 1.35 + level * 0.45;
      state.pipes.forEach((p) => {
        if (!p.passed) {
          p.bobAmp = amp;
          p.bobSpeed = spd;
        }
      });
    }
  }

  /* =========================================================
     SCORING, COLLISION & SURVIVAL PERKS
     ========================================================= */
  function addScore(amount, isBonus = false, customLabel = null, customColor = '#ffffff') {
    state.score += amount;
    if (state.score > state.bestScore) {
      state.bestScore = state.score;
      state.isNewBestRun = true;
      storageSet(STORAGE_BEST_KEY, String(state.bestScore));
    }
    sound.score(isBonus);
    spawnFloatingText(
      state.bird.x + 12,
      state.bird.y - 26,
      customLabel || `+${amount}`,
      customColor,
      isBonus ? 18 : 16
    );

    dom.hudScore.classList.remove('bump');
    void dom.hudScore.offsetWidth;
    dom.hudScore.classList.add('bump');
    setTimeout(() => dom.hudScore.classList.remove('bump'), 160);
    updateHud();
  }

  function handleFatalHit(source) {
    // Ground Spring saves ground impact once every 10 pipes
    if (source === 'ground' && state.groundSpringReady) {
      state.groundSpringReady = false;
      state.bird.y = viewH - BASE.groundHeight - getStats().birdRadius - 4;
      state.bird.vy = getStats().flapImpulse * 1.15;
      state.bird.invulnTimer = 0.65;
      sound.bounce();
      triggerShake(5, 0.16);
      spawnParticles(state.bird.x, viewH - BASE.groundHeight, 14, '#5eead4', 60, 200, Math.PI, -Math.PI / 2);
      spawnFloatingText(state.bird.x, state.bird.y - 24, 'GROUND SPRING!', '#5eead4', 15);
      renderModifiersDock();
      return;
    }

    // Aegis Shield absorbs 1 fatal collision
    if (state.shieldActive) {
      state.shieldActive = false;
      state.shieldRechargePipes = 0;
      state.bird.invulnTimer = 1.4;
      if (source === 'ground') {
        state.bird.y = viewH - BASE.groundHeight - getStats().birdRadius - 12;
        state.bird.vy = getStats().flapImpulse * 0.95;
      } else {
        state.bird.vy = getStats().flapImpulse * 0.65;
      }
      sound.shieldBreak();
      triggerShake(8, 0.22);
      triggerFlash('#5eead4', 0.26);
      spawnParticles(state.bird.x, state.bird.y, 24, '#5eead4', 80, 260);
      spawnFloatingText(state.bird.x, state.bird.y - 30, 'AEGIS SAVED!', '#5eead4', 16);
      renderModifiersDock();
      return;
    }

    // Second Wind revives once & clears nearby pipes
    if (countMod('second_wind') > 0 && !state.secondWindUsed) {
      state.secondWindUsed = true;
      state.bird.invulnTimer = 1.9;
      state.bird.y = clamp(state.bird.y, 120, (viewH - BASE.groundHeight) - 120);
      state.bird.vy = getStats().flapImpulse * 0.85;
      state.pipes = state.pipes.filter((p) => p.x + p.width < state.bird.x - 40 || p.x > state.bird.x + 260);
      sound.shieldBreak();
      triggerShake(11, 0.3);
      triggerFlash('#fde047', 0.3);
      spawnParticles(state.bird.x, state.bird.y, 32, '#fde047', 90, 300);
      spawnFloatingText(state.bird.x, state.bird.y - 34, 'SECOND WIND!', '#fde047', 18);
      renderModifiersDock();
      return;
    }

    // Genuine crash: short 380ms hitstop/tumble beat before Run Summary glides in
    sound.crash();
    triggerShake(12, 0.34);
    triggerFlash('#fb7185', 0.28);
    spawnParticles(state.bird.x, state.bird.y, 28, '#fda4af', 70, 260);
    state.bird.vy = -210;
    state.dyingTimer = 0.38;
    setMode('dying');
  }

  function showGameOver() {
    dom.newBestBadge.classList.toggle('hidden', !state.isNewBestRun);
    dom.goScore.textContent = String(state.score);
    dom.goBest.textContent = String(state.bestScore);
    dom.goPipes.textContent = String(state.pipesCleared);
    dom.goDrafts.textContent = String(state.draftsCompleted);

    if (state.mods.size > 0) {
      dom.goBuildSection.classList.remove('hidden');
      dom.goBuildList.innerHTML = '';
      state.mods.forEach((cnt, id) => {
        const mod = ALL_MODIFIERS.get(id);
        if (!mod) return;
        const chip = document.createElement('span');
        chip.className = `mod-chip ${mod.type}`;
        chip.innerHTML = `
          <span class="mod-chip-dot"></span>
          <span>${mod.name}</span>
          ${cnt > 1 ? `<span class="mod-chip-count">×${cnt}</span>` : ''}
        `;
        dom.goBuildList.appendChild(chip);
      });
    } else {
      dom.goBuildSection.classList.add('hidden');
    }

    state.gameOverLockUntil = performance.now() + 450;
    setMode('gameover');
  }

  /* =========================================================
     HUD & CODEX RENDERERS
     ========================================================= */
  function updateHud() {
    dom.hudScore.textContent = String(state.score);
    dom.hudBest.textContent = String(state.bestScore);
    const modProgress = state.pipesCleared % PIPES_PER_DRAFT;
    const activeCount = getActiveModCount();
    const isResetNext = activeCount >= MAX_ACTIVE_MODS;

    dom.hudDraftLabel.textContent = isResetNext ? 'RESET' : 'DRAFT';
    dom.hudDraftPill.classList.toggle('reset-next', isResetNext);
    dom.hudDraftCount.textContent = `${modProgress}/${PIPES_PER_DRAFT}`;
    dom.hudDraftFill.style.width = `${(modProgress / PIPES_PER_DRAFT) * 100}%`;

    dom.hudSlotsCount.textContent = `${activeCount}/${MAX_ACTIVE_MODS}`;
    dom.hudSlotsPill.classList.toggle('full', isResetNext);
  }

  function renderModifiersDock() {
    dom.modifiersDock.innerHTML = '';
    if (state.mods.size === 0) {
      dom.modifiersDock.classList.add('hidden');
      return;
    }
    const showHud = state.mode === 'ready' || state.mode === 'playing' || state.mode === 'draft' || state.mode === 'paused' || state.mode === 'dying';
    dom.modifiersDock.classList.toggle('hidden', !showHud);

    state.mods.forEach((cnt, id) => {
      const mod = ALL_MODIFIERS.get(id);
      if (!mod) return;

      let statusText = '';
      let spent = false;
      if (id === 'aegis') {
        statusText = state.shieldActive ? 'READY' : `${state.shieldRechargePipes}/20`;
        spent = !state.shieldActive;
      } else if (id === 'ground_spring') {
        statusText = state.groundSpringReady ? 'READY' : 'WAIT';
        spent = !state.groundSpringReady;
      } else if (id === 'second_wind') {
        statusText = state.secondWindUsed ? 'USED' : 'READY';
        spent = state.secondWindUsed;
      }

      const chip = document.createElement('div');
      chip.className = `mod-chip ${mod.type}${spent ? ' spent' : ''}`;
      chip.title = `${mod.name} — ${mod.desc}`;
      chip.innerHTML = `
        <span class="mod-chip-dot"></span>
        <span>${mod.name}</span>
        ${cnt > 1 ? `<span class="mod-chip-count">×${cnt}</span>` : ''}
        ${statusText ? `<span class="mod-chip-status">${statusText}</span>` : ''}
      `;
      dom.modifiersDock.appendChild(chip);
    });
  }

  function renderCodex(tab = 'perks') {
    const isPerks = tab === 'perks';
    dom.tabPerks.classList.toggle('active', isPerks);
    dom.tabDebuffs.classList.toggle('active', !isPerks);
    dom.tabDebuffs.classList.toggle('curse-tab', !isPerks);

    const list = isPerks ? PERKS : DEBUFFS;
    dom.codexGrid.innerHTML = '';
    list.forEach((item) => {
      const el = document.createElement('div');
      el.className = `codex-item ${item.type}`;
      el.innerHTML = `
        <div class="codex-item-head">
          <span>${item.icon}</span>
          <span class="codex-item-name">${item.name}</span>
        </div>
        <div class="codex-item-stat">${item.stat}</div>
        <div class="codex-item-desc">${item.desc}</div>
      `;
      dom.codexGrid.appendChild(el);
    });
  }

  /* =========================================================
     MAIN UPDATE LOOP
     ========================================================= */
  function update(dt) {
    state.time += dt;

    // Decay screen shake & flash
    if (state.shakeTime > 0) {
      state.shakeTime = Math.max(0, state.shakeTime - dt);
      if (state.shakeTime === 0) state.shakeMag = 0;
    }
    if (state.flashAlpha > 0) {
      state.flashAlpha = Math.max(0, state.flashAlpha - dt * 1.4);
    }

    // Update ambient background scenery even on title/ready screens
    const bgSpeed = state.mode === 'playing' ? getStats().scrollSpeed : (state.mode === 'dying' ? 20 : 64);
    if (state.mode !== 'paused' && state.mode !== 'draft') {
      state.worldScroll += bgSpeed * dt;
      state.clouds.forEach((c) => {
        c.x -= (c.speed + bgSpeed * 0.08) * dt;
        if (c.x + c.w < -40) {
          c.x = viewW + 60 + Math.random() * 120;
          c.y = 60 + Math.random() * (viewH * 0.36);
        }
      });
      state.motes.forEach((m) => {
        m.x += (m.vx - bgSpeed * 0.14) * dt;
        m.y += m.vy * dt;
        if (m.x < -10) {
          m.x = viewW + 10;
          m.y = Math.random() * (viewH - BASE.groundHeight);
        }
      });
    }

    // Update particles & floating texts
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 260 * dt;
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }

    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
      const ft = state.floatingTexts[i];
      ft.y -= 44 * dt;
      ft.life -= dt;
      if (ft.life <= 0) state.floatingTexts.splice(i, 1);
    }

    // Short crash tumble beat before Run Summary appears
    if (state.mode === 'dying') {
      const playableH = viewH - BASE.groundHeight;
      state.bird.vy = Math.min(BASE.maxFallSpeed, state.bird.vy + BASE.gravity * 1.15 * dt);
      state.bird.y = Math.min(playableH - 12, state.bird.y + state.bird.vy * dt);
      state.bird.rotation = Math.min(Math.PI * 0.52, state.bird.rotation + 6.5 * dt);
      state.dyingTimer -= dt;
      if (state.dyingTimer <= 0) {
        showGameOver();
      }
      return;
    }

    // Gentle idle bob on Title or Ready screen (anchored to readyBaseY so it never drifts)
    if (state.mode === 'title' || state.mode === 'ready') {
      const anchorY = state.mode === 'title' ? (viewH - BASE.groundHeight) * 0.44 : state.bird.readyBaseY;
      state.bird.y = anchorY + Math.sin(state.time * 3.6) * 9;
      state.bird.rotation = Math.sin(state.time * 3.6) * 0.08;
      state.bird.wingPhase = (state.time * 4.5) % (Math.PI * 2);
      updateTrail(dt, bgSpeed);
      return;
    }

    if (state.mode !== 'playing') return;

    const stats = getStats();
    const playableH = viewH - BASE.groundHeight;

    // Invulnerability timer
    if (state.bird.invulnTimer > 0) {
      state.bird.invulnTimer = Math.max(0, state.bird.invulnTimer - dt);
    }

    // Bird physics
    let effGravity = stats.gravity;
    if (stats.hasGlide && state.isHoldingInput && state.bird.vy > 0) {
      effGravity *= 0.48;
    }
    state.bird.vy = Math.min(
      stats.hasGlide && state.isHoldingInput ? BASE.maxFallSpeed * 0.52 : BASE.maxFallSpeed,
      state.bird.vy + effGravity * dt
    );
    state.bird.y += state.bird.vy * dt;

    // Slipstream (Magnet Drift) gentle assist toward the next upcoming pipe's center
    if (stats.magnetLevel > 0) {
      const nextPipe = state.pipes.find((p) => p.x + p.width >= state.bird.x - 10);
      if (nextPipe && nextPipe.x - state.bird.x < 240) {
        const diff = nextPipe.centerY - state.bird.y;
        const pull = clamp(diff * (0.9 + stats.magnetLevel * 0.55), -140, 140);
        state.bird.y += pull * dt;
      }
    }

    // Bird visual pitch & wing animation
    const targetRot = clamp(state.bird.vy / 520, -0.48, 1.12);
    state.bird.rotation = lerp(state.bird.rotation, targetRot, Math.min(1, dt * 11));
    state.bird.wingPhase = Math.max(0, state.bird.wingPhase - dt * 4.2);

    updateTrail(dt, stats.scrollSpeed);

    // Ceiling check
    if (state.bird.y - stats.birdRadius < 0) {
      state.bird.y = stats.birdRadius;
      if (stats.hasSkyBuffer) {
        if (state.bird.vy < 0) {
          state.bird.vy = Math.abs(state.bird.vy) * 0.35 + 80;
          state.bird.invulnTimer = Math.max(state.bird.invulnTimer, 0.6);
          sound.bounce();
          spawnParticles(state.bird.x, 4, 8, '#a7f3d0', 40, 120, Math.PI, Math.PI / 2);
        }
      } else {
        state.bird.vy = Math.max(0, state.bird.vy);
      }
    }

    // Ground check
    if (state.bird.y + stats.birdRadius >= playableH) {
      if (state.bird.invulnTimer > 0) {
        state.bird.y = playableH - stats.birdRadius - 2;
        state.bird.vy = stats.flapImpulse * 0.85;
      } else {
        handleFatalHit('ground');
        if (state.mode !== 'playing') return;
      }
    }

    // Update pipes
    for (let i = state.pipes.length - 1; i >= 0; i--) {
      const p = state.pipes[i];
      p.x -= stats.scrollSpeed * dt;

      if (p.bobAmp > 0) {
        p.bobPhase += p.bobSpeed * dt;
        const halfGap = p.gap * 0.5;
        p.centerY = clamp(
          p.baseCenterY + Math.sin(p.bobPhase) * p.bobAmp,
          72 + halfGap,
          playableH - 72 - halfGap
        );
      }

      // Scoring when bird clears pipe center
      if (!p.passed && p.x + p.width * 0.5 < state.bird.x) {
        p.passed = true;
        state.pipesCleared += 1;

        const isMilestone = state.pipesCleared % PIPES_PER_DRAFT === 0;
        const willResetLoadout = isMilestone && getActiveModCount() >= MAX_ACTIVE_MODS;

        // Golden Plume bonus on every 5th pipe
        let points = stats.scorePerPipe;
        let isBonus = false;
        let label = `+${points}`;
        let color = '#e0f2fe';
        if (stats.goldenLevel > 0 && state.pipesCleared % 5 === 0) {
          const bonus = 5 * stats.goldenLevel;
          points += bonus;
          isBonus = true;
          label = `+${points} GOLD!`;
          color = '#fde047';
          spawnParticles(state.bird.x, state.bird.y, 18, '#fde047', 60, 210);
        }

        // Skip perk recharge / Phantom toasts on the exact pipe that wipes the loadout
        if (!willResetLoadout) {
          let dockDirty = false;
          if (countMod('aegis') > 0 && !state.shieldActive) {
            state.shieldRechargePipes += 1;
            dockDirty = true;
            if (state.shieldRechargePipes >= 20) {
              state.shieldActive = true;
              state.shieldRechargePipes = 0;
              spawnFloatingText(state.bird.x, state.bird.y - 42, 'AEGIS RECHARGED', '#5eead4', 14);
            }
          }
          if (countMod('ground_spring') > 0 && isMilestone && !state.groundSpringReady) {
            state.groundSpringReady = true;
            dockDirty = true;
          }
          if (dockDirty) renderModifiersDock();

          if (stats.hasPhantom && state.pipesCleared % 5 === 0) {
            state.bird.invulnTimer = Math.max(state.bird.invulnTimer, 1.6);
            spawnFloatingText(state.bird.x, state.bird.y - 48, 'PHANTOM BLINK', '#a78bfa', 13);
          }
        }

        addScore(points, isBonus, label, color);

        // Trigger Loadout Reset (if 3 mods already active) or Draft every 10 pipes
        if (isMilestone) {
          if (willResetLoadout) {
            resetActiveModifiers();
          } else {
            openDraft();
            return;
          }
        }
      }

      // Collision check (forgiving circle vs rect)
      if (state.bird.invulnTimer <= 0) {
        const hitR = stats.birdRadius * 0.86; // slight inner forgiveness for fair arcade feel
        const topBottom = p.centerY - p.gap * 0.5;
        const bottomTop = p.centerY + p.gap * 0.5;

        if (
          circleRectCollide(state.bird.x, state.bird.y, hitR, p.x, 0, p.width, topBottom) ||
          circleRectCollide(state.bird.x, state.bird.y, hitR, p.x, bottomTop, p.width, playableH - bottomTop)
        ) {
          handleFatalHit('pipe');
          if (state.mode !== 'playing') return;
        }
      }

      // Remove off-screen pipes
      if (p.x + p.width < -60) {
        state.pipes.splice(i, 1);
      }
    }

    // Ensure enough pipes exist ahead
    const rightmost = state.pipes.reduce((max, p) => Math.max(max, p.x), 0);
    if (rightmost < viewW + 220) {
      spawnPipe(Math.max(viewW + 100, rightmost + stats.pipeSpacing));
    }
  }

  function updateTrail(dt, scrollSpeed) {
    state.bird.trail.push({ x: state.bird.x - 10, y: state.bird.y, life: 1 });
    for (let i = state.bird.trail.length - 1; i >= 0; i--) {
      const pt = state.bird.trail[i];
      pt.x -= scrollSpeed * dt;
      pt.life -= dt * 3.1;
      if (pt.life <= 0) state.bird.trail.splice(i, 1);
    }
  }

  function circleRectCollide(cx, cy, r, rx, ry, rw, rh) {
    const closestX = clamp(cx, rx, rx + rw);
    const closestY = clamp(cy, ry, ry + rh);
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy < r * r;
  }

  /* =========================================================
     RENDERING (PREMIUM TWILIGHT INDIE AESTHETIC)
     ========================================================= */
  function getBlendedTheme() {
    const rawIdx = (state.pipesCleared / 10) % SKY_THEMES.length;
    const i0 = Math.floor(rawIdx) % SKY_THEMES.length;
    const i1 = (i0 + 1) % SKY_THEMES.length;
    const t = rawIdx - Math.floor(rawIdx);
    const a = SKY_THEMES[i0];
    const b = SKY_THEMES[i1];
    return {
      top: lerpColor(a.top, b.top, t),
      mid: lerpColor(a.mid, b.mid, t),
      low: lerpColor(a.low, b.low, t),
      glow: lerpColor(a.glow, b.glow, t),
      ridge1: lerpColor(a.ridge1, b.ridge1, t),
      ridge2: lerpColor(a.ridge2, b.ridge2, t),
    };
  }

  function render() {
    const stats = getStats();
    const theme = getBlendedTheme();
    const playableH = viewH - BASE.groundHeight;

    ctx.save();

    // Turbulence camera sway
    if (stats.turbulenceLevel > 0 && state.mode === 'playing') {
      const swayAngle = Math.sin(state.time * 1.45) * 0.022 * stats.turbulenceLevel;
      const swayY = Math.cos(state.time * 1.1) * 5 * stats.turbulenceLevel;
      ctx.translate(viewW / 2, viewH / 2 + swayY);
      ctx.rotate(swayAngle);
      ctx.translate(-viewW / 2, -viewH / 2);
    }

    // Impact shake
    if (state.shakeTime > 0) {
      const sx = (Math.random() - 0.5) * 2 * state.shakeMag;
      const sy = (Math.random() - 0.5) * 2 * state.shakeMag;
      ctx.translate(sx, sy);
    }

    // 1. Sky Gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, playableH);
    skyGrad.addColorStop(0, theme.top);
    skyGrad.addColorStop(0.58, theme.mid);
    skyGrad.addColorStop(1, theme.low);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-40, -40, viewW + 80, viewH + 80);

    // Subtle atmospheric sun/moon glow on horizon
    const orbGrad = ctx.createRadialGradient(viewW * 0.72, playableH * 0.82, 12, viewW * 0.72, playableH * 0.82, Math.max(viewW, viewH) * 0.45);
    orbGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
    orbGrad.addColorStop(0.35, 'rgba(94, 234, 212, 0.07)');
    orbGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = orbGrad;
    ctx.fillRect(0, 0, viewW, playableH);

    // 2. Twinkling Stars
    state.stars.forEach((s) => {
      const alpha = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(state.time * s.speed + s.phase));
      ctx.fillStyle = `rgba(235, 244, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // 3. Soft Drifting Clouds
    state.clouds.forEach((c) => {
      ctx.fillStyle = `rgba(255, 255, 255, ${c.alpha})`;
      drawRoundedRect(ctx, c.x, c.y, c.w, c.h, c.h * 0.5);
      ctx.fill();
    });

    // 4. Layered Parallax Mountain Silhouettes
    drawMountainLayer(playableH, state.worldScroll * 0.08, 120, 0.0028, theme.ridge1, 0.85);
    drawMountainLayer(playableH, state.worldScroll * 0.16, 72, 0.0044, theme.ridge2, 0.95);

    // 5. Ambient Floating Wind Motes
    state.motes.forEach((m) => {
      ctx.fillStyle = `rgba(200, 235, 255, ${m.alpha})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // 6. Pipes (sleek architectural monoliths)
    state.pipes.forEach((p) => drawPipe(p, playableH, theme, stats));

    // 7. Ground Strip
    drawGround(playableH, theme);

    // 8. Bird Ribbon Trail
    drawBirdTrail();

    // 9. Bird
    drawBird(stats);

    // 10. Particles
    state.particles.forEach((p) => {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.4 + 0.6 * a), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // 11. Floating Score/Status Text
    state.floatingTexts.forEach((ft) => {
      const a = clamp(ft.life / ft.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `700 ${ft.size}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = ft.color;
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 10;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });

    // 12. Eclipse Debuff Spotlight Vignette
    if (stats.hasEclipse && state.mode === 'playing') {
      const vig = ctx.createRadialGradient(
        state.bird.x,
        state.bird.y,
        95,
        state.bird.x,
        state.bird.y,
        Math.min(viewW, viewH) * 0.56
      );
      vig.addColorStop(0, 'rgba(5, 8, 20, 0)');
      vig.addColorStop(0.6, 'rgba(5, 8, 20, 0.42)');
      vig.addColorStop(1, 'rgba(4, 6, 16, 0.88)');
      ctx.fillStyle = vig;
      ctx.fillRect(-40, -40, viewW + 80, viewH + 80);
    }

    // 13. Impact / Shield Flash
    if (state.flashAlpha > 0) {
      ctx.fillStyle = state.flashColor;
      ctx.globalAlpha = state.flashAlpha;
      ctx.fillRect(-40, -40, viewW + 80, viewH + 80);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawMountainLayer(baseY, offset, maxH, freq, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-20, baseY + 10);
    const step = 28;
    for (let x = -20; x <= viewW + step; x += step) {
      const wx = x + offset;
      const h =
        Math.sin(wx * freq) * (maxH * 0.45) +
        Math.sin(wx * freq * 2.15 + 1.4) * (maxH * 0.28) +
        maxH * 0.72;
      ctx.lineTo(x, baseY - h);
    }
    ctx.lineTo(viewW + 20, baseY + 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawPipe(p, playableH, theme, stats) {
    const topH = Math.max(0, p.centerY - p.gap * 0.5);
    const bottomY = p.centerY + p.gap * 0.5;
    const bottomH = Math.max(0, playableH - bottomY);

    const capH = 22;
    const capOverhang = 5;
    const isFifthSpecial = p.pipeNumber % 5 === 0 && (stats.goldenLevel > 0 || stats.hasPhantom);
    const lipColor = isFifthSpecial ? '#fde047' : theme.glow;

    // Sleek vertical slate gradient
    const bodyGrad = ctx.createLinearGradient(p.x, 0, p.x + p.width, 0);
    bodyGrad.addColorStop(0, '#1e2c4a');
    bodyGrad.addColorStop(0.28, '#2b3e66');
    bodyGrad.addColorStop(0.7, '#192540');
    bodyGrad.addColorStop(1, '#10182d');

    const drawSegment = (x, y, w, h, capAtBottom) => {
      if (h <= 0) return;

      // Pipe shaft
      ctx.fillStyle = bodyGrad;
      ctx.fillRect(x, y, w, h);

      // Soft vertical sheen line
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(x + 7, y, 5, h);

      // Theme-tinted rim light on leading edge so silhouettes stay crisp in Eclipse
      ctx.fillStyle = lipColor;
      ctx.globalAlpha = isFifthSpecial ? 0.36 : 0.16;
      ctx.fillRect(x, y, 2, h);
      ctx.globalAlpha = 1;

      // Subtle border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.11)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

      // Rounded architectural cap
      const cy = capAtBottom ? y + h - capH : y;
      ctx.fillStyle = bodyGrad;
      drawRoundedRect(ctx, x - capOverhang, cy, w + capOverhang * 2, capH, 8);
      ctx.fill();

      // Cap highlight rim facing the gap
      ctx.strokeStyle = isFifthSpecial ? 'rgba(253, 224, 71, 0.5)' : 'rgba(186, 230, 253, 0.28)';
      ctx.lineWidth = 1.2;
      drawRoundedRect(ctx, x - capOverhang + 0.5, cy + 0.5, w + capOverhang * 2 - 1, capH - 1, 8);
      ctx.stroke();

      // Luminous accent lip facing the gap for crisp readability
      const lipY = capAtBottom ? cy + capH - 3 : cy + 1;
      ctx.fillStyle = lipColor;
      ctx.globalAlpha = isFifthSpecial ? 0.95 : 0.78;
      drawRoundedRect(ctx, x - capOverhang + 6, lipY, w + capOverhang * 2 - 12, isFifthSpecial ? 3 : 2.4, 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    drawSegment(p.x, -4, p.width, topH + 4, true);
    drawSegment(p.x, bottomY, p.width, bottomH + 4, false);
  }

  function drawGround(playableH, theme) {
    const grad = ctx.createLinearGradient(0, playableH, 0, viewH);
    grad.addColorStop(0, '#131d36');
    grad.addColorStop(1, '#080d1c');
    ctx.fillStyle = grad;
    ctx.fillRect(-40, playableH, viewW + 80, BASE.groundHeight + 40);

    // Horizon glowing trim
    ctx.fillStyle = state.groundSpringReady ? '#5eead4' : theme.glow;
    ctx.globalAlpha = state.groundSpringReady ? 0.85 : 0.45;
    ctx.fillRect(-40, playableH, viewW + 80, 2.5);
    ctx.globalAlpha = 1;

    // Subtle moving geometric tick marks
    const tickSpacing = 44;
    const offset = -(state.worldScroll % tickSpacing);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = offset; x < viewW + tickSpacing; x += tickSpacing) {
      ctx.moveTo(x, playableH + 10);
      ctx.lineTo(x - 14, playableH + 34);
    }
    ctx.stroke();
  }

  function drawBirdTrail() {
    const trail = state.bird.trail;
    if (trail.length < 2) return;
    for (let i = 1; i < trail.length; i++) {
      const p0 = trail[i - 1];
      const p1 = trail[i];
      const alpha = clamp(p1.life, 0, 1) * 0.42;
      ctx.strokeStyle = state.bird.invulnTimer > 0
        ? `rgba(196, 181, 253, ${alpha})`
        : `rgba(125, 211, 252, ${alpha})`;
      ctx.lineWidth = Math.max(1, p1.life * 9);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }

  function drawBird(stats) {
    const b = state.bird;
    const r = stats.birdRadius;

    ctx.save();
    ctx.translate(b.x, b.y);

    // Thermal Glide soft wind cushion streaks when actively gliding
    if (stats.hasGlide && state.isHoldingInput && state.mode === 'playing' && b.vy > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(94, 234, 212, 0.52)';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        const ox = i * r * 0.8;
        const oy = r * 1.15 + Math.sin(state.time * 18 + i) * 2;
        ctx.beginPath();
        ctx.moveTo(ox - 10, oy);
        ctx.lineTo(ox + 10, oy);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Invulnerability phase shimmer
    if (b.invulnTimer > 0) {
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(state.time * 24);
    }

    // Aegis Energy Shield ring
    if (state.shieldActive) {
      const pulse = 1 + Math.sin(state.time * 5) * 0.05;
      ctx.save();
      ctx.strokeStyle = 'rgba(94, 234, 212, 0.85)';
      ctx.fillStyle = 'rgba(94, 234, 212, 0.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, (r + 10) * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.rotate(b.rotation);

    // Soft ambient glow behind bird
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 2.1);
    glow.addColorStop(0, 'rgba(186, 230, 253, 0.32)');
    glow.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.1, 0, Math.PI * 2);
    ctx.fill();

    // Sleek tail fin
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, 0);
    ctx.lineTo(-r * 1.48, -r * 0.42);
    ctx.lineTo(-r * 1.25, 0);
    ctx.lineTo(-r * 1.42, r * 0.36);
    ctx.closePath();
    ctx.fill();

    // Aerodynamic body
    const bodyGrad = ctx.createLinearGradient(-r, -r, r, r);
    bodyGrad.addColorStop(0, '#ffffff');
    bodyGrad.addColorStop(0.55, '#e0f2fe');
    bodyGrad.addColorStop(1, '#7dd3fc');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.15, r * 0.88, 0, 0, Math.PI * 2);
    ctx.fill();

    // Crisp beak
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(r * 0.95, -r * 0.2);
    ctx.lineTo(r * 1.56, r * 0.04);
    ctx.lineTo(r * 0.92, r * 0.28);
    ctx.closePath();
    ctx.fill();

    // Animated sculpted wing
    const wingLift = Math.sin(b.wingPhase * Math.PI) * r * 0.75;
    ctx.fillStyle = '#2dd4bf';
    ctx.beginPath();
    ctx.moveTo(-r * 0.35, -r * 0.05);
    ctx.quadraticCurveTo(-r * 0.15, -r * 0.9 - wingLift, r * 0.36, -r * 0.15);
    ctx.quadraticCurveTo(-r * 0.05, r * 0.35 - wingLift * 0.25, -r * 0.35, -r * 0.05);
    ctx.fill();

    // Minimalist eye
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(r * 0.46, -r * 0.22, Math.max(2.2, r * 0.16), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(r * 0.51, -r * 0.27, Math.max(0.9, r * 0.06), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawRoundedRect(c, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + radius, y);
    c.arcTo(x + w, y, x + w, y + h, radius);
    c.arcTo(x + w, y + h, x, y + h, radius);
    c.arcTo(x, y + h, x, y, radius);
    c.arcTo(x, y, x + w, y, radius);
    c.closePath();
  }

  /* =========================================================
     INPUT & EVENT HANDLERS
     ========================================================= */
  function syncMuteIcon() {
    dom.iconSoundOn.classList.toggle('hidden', sound.muted);
    dom.iconSoundOff.classList.toggle('hidden', !sound.muted);
  }

  function togglePause() {
    if (state.mode === 'playing') {
      setMode('paused');
    } else if (state.mode === 'paused') {
      setMode('playing');
    }
  }

  function openCodex() {
    renderCodex('perks');
    dom.codexOverlay.classList.add('visible');
  }

  function closeCodex() {
    dom.codexOverlay.classList.remove('visible');
  }

  // Canvas pointer input
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    state.isHoldingInput = true;
    if (state.mode === 'ready' || state.mode === 'playing') {
      flap();
    }
  });

  window.addEventListener('pointerup', () => {
    state.isHoldingInput = false;
  });

  window.addEventListener('pointercancel', () => {
    state.isHoldingInput = false;
  });

  window.addEventListener('blur', () => {
    state.isHoldingInput = false;
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.repeat && (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW')) return;

    if (dom.codexOverlay.classList.contains('visible')) {
      if (e.code === 'Escape') closeCodex();
      return;
    }

    if (e.code === 'KeyM') {
      sound.toggleMute();
      syncMuteIcon();
      return;
    }

    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (state.mode === 'playing' || state.mode === 'paused') {
        togglePause();
      }
      return;
    }

    if (state.mode === 'draft') {
      if (e.code === 'Space') e.preventDefault();
      if (e.key === '1') chooseDraftOption(0);
      else if (e.key === '2') chooseDraftOption(1);
      else if (e.key === '3') chooseDraftOption(2);
      return;
    }

    if (state.mode === 'title') {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        startNewGame();
      }
      return;
    }

    if (state.mode === 'gameover') {
      if (e.code === 'Space' || e.code === 'KeyR' || e.code === 'Enter') {
        e.preventDefault();
        if (performance.now() >= state.gameOverLockUntil) {
          startNewGame();
        }
      }
      return;
    }

    if (state.mode === 'ready' || state.mode === 'playing') {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        state.isHoldingInput = true;
        flap();
      } else if (e.code === 'KeyR') {
        startNewGame();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      state.isHoldingInput = false;
    }
  });

  // UI buttons (blur on click so Space never accidentally re-triggers focused buttons)
  const bindBtn = (el, fn) => {
    el.addEventListener('click', () => {
      el.blur();
      fn();
    });
  };

  bindBtn(dom.btnPlay, startNewGame);
  bindBtn(dom.btnCodex, openCodex);
  bindBtn(dom.btnCloseCodex, closeCodex);
  bindBtn(dom.tabPerks, () => renderCodex('perks'));
  bindBtn(dom.tabDebuffs, () => renderCodex('debuffs'));

  bindBtn(dom.btnMute, () => {
    sound.toggleMute();
    syncMuteIcon();
  });
  bindBtn(dom.btnPause, togglePause);
  bindBtn(dom.btnResume, () => setMode('playing'));
  bindBtn(dom.btnPauseRestart, startNewGame);
  bindBtn(dom.btnPauseMenu, () => {
    resetRun();
    setMode('title');
  });

  bindBtn(dom.btnRetry, startNewGame);
  bindBtn(dom.btnGoMenu, () => {
    resetRun();
    setMode('title');
  });

  window.addEventListener('resize', () => {
    resize();
    initScenery();
  });

  /* =========================================================
     ANIMATION FRAME LOOP (FIXED-DELTA CLAMPED FOR 60/120Hz)
     ========================================================= */
  let lastTs = performance.now();

  function frame(ts) {
    const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
    lastTs = ts;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  /* =========================================================
     BOOT
     ========================================================= */
  resize();
  initScenery();
  syncMuteIcon();
  resetRun();
  setMode('title');
  requestAnimationFrame(frame);
})();
