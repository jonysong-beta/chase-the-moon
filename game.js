/* 逐月计划 (Chase the Moon) — 竖屏像素追逐 */
(() => {
  "use strict";

  // ── Constants (logical 270×480) ────────────────────────
  const W = 270;
  const H = 480;
  const S = W / 180; // scale factor from v1

  const PHYS = {
    maxSpeed: 92 * S,
    accel: 420 * S,
    drag: 4.5,
    steer: 12.5, // velocity targeting rate (higher = tighter)
    jetAccel: 210 * S,
    jetCooldown: 0.42,
    jetDuration: 0.22,
    jetMassCost: 0.35,
    massMin: 15,
    massMax: 100,
    massStart: 52,
    healthyLow: 30,
    healthyHigh: 74,
    scrollBase: 32 * S,
    scrollPerProg: 42 * S,
  };

  const QTE = {
    // lasso: move earth so the light ring encircles the moon, then capture
    needLocks: 3,
    needLocksEasy: 2,
    ringR: 64,
    // Visual ring ≈ catch zone. Old 0.72 looked "in the circle" but missed.
    catchIn: 0.95,
    perfectIn: 0.45,
    duration: 22,
    tutorialSec: 4.5,
    moonDrift: 34, // px/s wander
  };

  const PROG = {
    signal: 0.09,
    hitPenalty: 0.05,
    idle: 0.0015,
    discoverSec: 2.4,
  };

  // In-run difficulty loop: three sectors, each harsher than the last
  const SECTORS = [
    {
      id: 0,
      name: "近地轨道",
      at: 0,
      spawn: 0.82,
      well: 0.65,
      rock: 0.65,
      signalBias: 0.42,
      vacuum: 1.05,
      pull: 0.8,
      scroll: 0.88,
      rockHurt: 0.85,
    },
    {
      id: 1,
      name: "碎石带",
      at: 0.34,
      spawn: 1.0,
      well: 1.05,
      rock: 1.2,
      signalBias: 0.32,
      vacuum: 0.78,
      pull: 1.05,
      scroll: 1.05,
      rockHurt: 1.0,
    },
    {
      id: 2,
      name: "虚空边缘",
      at: 0.68,
      spawn: 1.22,
      well: 1.4,
      rock: 1.55,
      signalBias: 0.24,
      vacuum: 0.48,
      pull: 1.3,
      scroll: 1.18,
      rockHurt: 1.2,
    },
  ];

  // pseudo-3D chase: 45° climb toward vanishing point
  const VIEW = {
    vx: W * 0.5,
    vy: H * 0.16,
    py: H * 0.72,
    px: W * 0.5,
    near: 0.1,
    zMax: 1.15,
    fwd: 0.3, // z units / s at base
    auraBase: 30,
    auraPerMass: 0.5,
  };

  const SCORE_W = { mass: 0.35, dist: 0.3, qte: 0.35 };

  const DIFF = {
    easy: {
      label: "追寻之旅",
      wellMul: 0.5,
      spawnMul: 0.72,
      scrollMul: 0.85,
      pullMul: 0.65,
      hitWin: 0.28,
      goodWin: 0.46,
      spawnInt: 0.85,
      massStart: 58,
      rockMul: 0.75,
      vacuumMul: 1.15,
    },
    normal: {
      label: "宇宙冒险",
      wellMul: 1,
      spawnMul: 1,
      scrollMul: 1,
      pullMul: 1,
      hitWin: 0.22,
      goodWin: 0.38,
      spawnInt: 0.7,
      massStart: 52,
      rockMul: 1,
      vacuumMul: 1,
    },
    hard: {
      label: "坠入虚空",
      wellMul: 1.4,
      spawnMul: 1.22,
      scrollMul: 1.12,
      pullMul: 1.4,
      hitWin: 0.2,
      goodWin: 0.36,
      spawnInt: 0.65,
      massStart: 48,
      rockMul: 1.35,
      vacuumMul: 0.75,
    },
    blood: {
      label: "月之暗面",
      wellMul: 1.2,
      spawnMul: 1.1,
      scrollMul: 1.08,
      pullMul: 1.2,
      hitWin: 0.2,
      goodWin: 0.36,
      spawnInt: 0.68,
      massStart: 50,
      rockMul: 1.2,
      vacuumMul: 0.85,
    },
  };

  // Thin blood-moon: two chase attacks + one QTE struggle
  const BLOOD = {
    spikeCd: [3.8, 3.0, 2.3],
    spikeWarn: 0.95,
    spikeLive: 0.28,
    spikeHalf: 8,
    shockCd: [5.4, 4.4, 3.5],
    shockWarn: 0.8,
    shockLive: 0.42,
    shockMaxR: 72,
    shockThick: 11,
    massHit: 7,
    progHit: 0.045,
  };

  const ACH = [
    { id: "first", name: "启程", desc: "完成一局" },
    { id: "perfect", name: "完美重聚", desc: "达成完美结局" },
    { id: "combo10", name: "无瑕套捕", desc: "一次 miss 都没有就套满" },
    { id: "score80", name: "高分", desc: "总分≥80" },
    { id: "daily", name: "今日竞速", desc: "完成一次今日竞速" },
    { id: "normal", name: "宇宙冒险", desc: "通关追寻之旅后解锁" },
    { id: "hard", name: "坠入虚空", desc: "通关宇宙冒险后解锁" },
    { id: "blood", name: "月之暗面", desc: "通关坠入虚空后解锁" },
  ];

  // 难度阶梯：逐级通关解锁（easy→normal→hard→blood），无手动选择器
  const LADDER = ["easy", "normal", "hard", "blood"];

  function maxUnlockedDiff() {
    const a = (Store.data && Store.data.ach) || {};
    if (a.blood) return "blood";
    if (a.hard) return "hard";
    if (a.normal) return "normal";
    return "easy";
  }

  function clampDiff(d) {
    const want = LADDER.indexOf(d);
    if (want < 0) return maxUnlockedDiff();
    const max = LADDER.indexOf(maxUnlockedDiff());
    return LADDER[Math.min(want, max)];
  }

  const ENDINGS = {
    perfect: {
      title: "完美重聚",
      desc: "月亮重新入轨。地月之间，潮汐再次安静下来。",
      color: "#FFD166",
    },
    close: {
      title: "险胜偏轨",
      desc: "你抓住了月亮，但轨道仍晃。它还在，只是不安稳。",
      color: "#6FCF97",
    },
    fail: {
      title: "擦肩而过",
      desc: "黑暗继续拖着月亮远去。再来一局，把它追回来。",
      color: "#FF2A6D",
    },
  };

  // Cinematic beats: duration, caption, scene key
  const CUTSCENE = [
    { t: 2.6, scene: "orbit", text: "很久以前，月亮安静地绕着地球。" },
    { t: 2.8, scene: "omen", text: "直到黑暗天体逼近——" },
    { t: 3.2, scene: "pull", text: "它撕裂轨道，把月亮拖向虚空。" },
    { t: 3.0, scene: "chase", text: "循着月辉，把月亮追回来。" },
  ];

  // ── DOM ────────────────────────────────────────────────
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: true });
  const menuArt = document.getElementById("menu-art");
  let pixelScale = 2; // canvas px per logical px

  function fitCanvas() {
    const stage = document.getElementById("stage");
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    // keep logical game coords at 270×480; buffer matches physical pixels
    const cw = Math.max(540, Math.round(rect.width * dpr));
    const ch = Math.max(960, Math.round(rect.height * dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    pixelScale = cw / W;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }

  function applyLogicalTransform() {
    const sx = canvas.width / W;
    const sy = canvas.height / H;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
  }

  const el = {
    overlay: document.getElementById("overlay"),
    hud: document.getElementById("hud"),
    controls: document.getElementById("controls"),
    massSeg: document.getElementById("mass-seg"),
    distSeg: document.getElementById("dist-seg"),
    screens: {
      cover: document.getElementById("screen-cover"),
      title: document.getElementById("screen-title"),
      intro: document.getElementById("screen-intro"),
      qte: document.getElementById("screen-qte"),
      result: document.getElementById("screen-result"),
      card: document.getElementById("screen-card"),
      board: document.getElementById("screen-board"),
    },
    introCaption: document.getElementById("intro-caption"),
    resultTitle: document.getElementById("result-title"),
    resultDesc: document.getElementById("result-desc"),
    resultStats: document.getElementById("result-stats"),
    rankLine: document.getElementById("rank-line"),
    boardList: document.getElementById("board-list"),
    dailyBoard: document.getElementById("daily-board"),
    dailyTip: document.getElementById("daily-tip"),
    cardCanvas: document.getElementById("card"),
    toast: document.getElementById("toast"),
    btnCoverStart: document.getElementById("btn-cover-start"),
    btnBackCover: document.getElementById("btn-back-cover"),
    btnStart: document.getElementById("btn-start"),
    btnSound: document.getElementById("btn-sound"),
    btnSkip: document.getElementById("btn-skip-intro"),
    btnRetry: document.getElementById("btn-retry"),
    btnHome: document.getElementById("btn-home"),
    btnBoard2: document.getElementById("btn-board2"),
    btnBoardBack: document.getElementById("btn-board-back"),
    btnCard: document.getElementById("btn-card"),
    btnCardBack: document.getElementById("btn-card-back"),
    btnCopy: document.getElementById("btn-copy"),
    shareText: document.getElementById("share-text"),
    btnQte: document.getElementById("btn-qte-hit"),
    hudPhase: document.querySelector(".hud-phase"),
    hudTimer: document.getElementById("hud-timer"),
    stickBase: document.getElementById("stick-base"),
    stickKnob: document.getElementById("stick-knob"),
    btnJet: document.getElementById("btn-jet"),
    telEarth: document.getElementById("tel-earth"),
    telWell: document.getElementById("tel-well"),
    diffDial: document.getElementById("menu-diff"),
    btnRace: document.getElementById("btn-race"),
  };

  // 面板竞速开关（会话内状态，不入存档）
  let menuDaily = false;

  function ensureSegs(root, n = 10) {
    if (!root || root.childElementCount === n) return;
    root.innerHTML = "";
    for (let i = 0; i < n; i++) root.appendChild(document.createElement("i"));
  }
  ensureSegs(el.massSeg);
  ensureSegs(el.distSeg);

  // ── Art assets (reference-faithful) ────────────────────
  const ART = {
    cover: null,
    menu: null,
    moon: null,
    moonDark: null,
    earth: null,
    well: null,
    rock: null,
    signal: null,
  };

  function ensureMenuArt() {
    if (menuArt && !menuArt.getAttribute("src")) {
      menuArt.src = "assets/ui/menu.webp?v=10";
    }
  }

  function loadArt() {
    const load = (src) =>
      new Promise((res) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = src;
      });
    // cover/menu live as DOM <img>; only gameplay sprites need canvas handles
    return Promise.all([
      load("assets/sprites/moon.webp?v=2"),
      load("assets/sprites/moon-dark.webp?v=2"),
      load("assets/sprites/earth.webp"),
      load("assets/sprites/well.webp"),
      load("assets/sprites/rock.webp"),
      load("assets/sprites/signal.webp"),
    ]).then(([moon, moonDark, earth, well, rock, signal]) => {
      ART.moon = moon;
      ART.moonDark = moonDark;
      ART.earth = earth;
      ART.well = well;
      ART.rock = rock;
      ART.signal = signal;
    });
  }

  function drawImg(img, x, y, w, h, rot) {
    if (!img) return false;
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  }

  // ── Utils ──────────────────────────────────────────────
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const chance = (p) => Math.random() < p;
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  };
  const easeOut = (t) => 1 - (1 - t) * (1 - t);
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  // ── Local store (XHS container: no network, isolated localStorage) ──
  const STORE_KEY = "chase_moon_v3";

  const Store = {
    data: null,
    load() {
      try {
        const raw = localStorage.getItem(STORE_KEY);
        this.data = raw ? JSON.parse(raw) : null;
      } catch (_) {
        this.data = null;
      }
      if (!this.data || typeof this.data !== "object") {
        this.data = {
          board: [],
          ach: {},
          diff: "easy",
          sound: true,
          daily: { date: "", best: 0, played: false },
          pb: {},
        };
      } else if (!this.data.ach || !this.data.ach.normal) {
        // 老存档（v3 起默认为标准档）→ 追溯解锁宇宙冒险，不降级老玩家
        this.data.ach = this.data.ach || {};
        this.data.ach.normal = this.data.ach.normal || Date.now();
      }
      if (!Array.isArray(this.data.board)) this.data.board = [];
      if (!this.data.ach || typeof this.data.ach !== "object" || Array.isArray(this.data.ach)) this.data.ach = {};
      if (!this.data.daily || typeof this.data.daily !== "object" || Array.isArray(this.data.daily)) this.data.daily = { date: "", best: 0, played: false };
      if (!this.data.pb || typeof this.data.pb !== "object" || Array.isArray(this.data.pb)) this.data.pb = {};
      return this.data;
    },
    save() {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
      } catch (_) {}
    },
    unlock(id) {
      if (!this.data.ach[id]) {
        this.data.ach[id] = Date.now();
        this.save();
        const a = ACH.find((x) => x.id === id);
        if (a) showToast(`成就 · ${a.name}`);
        return true;
      }
      return false;
    },
    addBoard(entry) {
      const list = this.data.board;
      list.push(entry);
      list.sort((a, b) => b.score - a.score);
      this.data.board = list.slice(0, 10);
      this.save();
      return this.data.board.findIndex((x) => x.id === entry.id) + 1;
    },
  };

  function todayKey() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, "0")}`;
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function showToast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.toast.classList.add("hidden"), 1800);
  }

  // ── Audio ──────────────────────────────────────────────
  const AudioEngine = {
    ctx: null,
    master: null,
    musicGain: null,
    sfxGain: null,
    enabled: true,
    _timer: null,
    _mode: "off",
    _step: 0,
    _nextTime: 0,
    // XHS 小工具白名单不含音频文件 → 全部 BGM 走 Web Audio 合成（零 fetch、零包体）

    ensure() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.9 : 0;
      // 母线压限：糊住瞬态峰值，手机喇叭不破
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -16;
      this.comp.knee.value = 12;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.003;
      this.comp.release.value = 0.22;
      this.master.connect(this.comp);
      this.comp.connect(this.ctx.destination);
      // 音乐总线带通：70Hz 高通砍掉手机 reproduces 不了的超低（55Hz 底鼓/73Hz 贝斯
      // 会逼喇叭过载破音），6.5kHz 低通磨掉方波毛刺
      this.musicHP = this.ctx.createBiquadFilter();
      this.musicHP.type = "highpass";
      this.musicHP.frequency.value = 70;
      this.musicLP = this.ctx.createBiquadFilter();
      this.musicLP.type = "lowpass";
      this.musicLP.frequency.value = 6500;
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.34;
      this.musicGain.connect(this.musicHP);
      this.musicHP.connect(this.musicLP);
      this.musicLP.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.45;
      this.sfxGain.connect(this.master);
    },

    resume() {
      this.ensure();
      // iOS 来电/Siri 打断后 ctx 会停在 "interrupted"，不只 "suspended"
      if (this.ctx && this.ctx.state !== "running") this.ctx.resume();
    },

    setEnabled(on) {
      this.enabled = on;
      if (this.master) this.master.gain.value = on ? 0.9 : 0;
      if (!on) this.stopMusic();
    },

    freq(n) {
      return 440 * Math.pow(2, n / 12);
    },

    tone(type, freq, t0, dur, gain = 0.15, dest = null) {
      if (!this.ctx || !this.enabled) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(dest || this.sfxGain);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
      o.onended = () => {
        try {
          g.disconnect();
          o.disconnect();
        } catch (_) {}
      };
    },

    noise(t0, dur, gain = 0.08) {
      if (!this.ctx || !this.enabled) return;
      const len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      g.gain.value = gain;
      src.buffer = buf;
      src.connect(g);
      g.connect(this.sfxGain);
      src.start(t0);
      src.onended = () => {
        try {
          g.disconnect();
          src.disconnect();
        } catch (_) {}
      };
    },

    sfx(name) {
      this.ensure();
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      switch (name) {
        case "jet":
          this.noise(t, 0.12, 0.05);
          this.tone("square", 180, t, 0.1, 0.04);
          break;
        case "eat":
          this.tone("square", 520, t, 0.06, 0.08);
          this.tone("square", 780, t + 0.05, 0.07, 0.06);
          break;
        case "hit":
          this.tone("square", 90, t, 0.18, 0.12);
          this.noise(t, 0.15, 0.1);
          break;
        case "qte_perfect":
          this.tone("square", 880, t, 0.08, 0.1);
          this.tone("square", 1174, t + 0.06, 0.1, 0.08);
          break;
        case "qte_good":
          this.tone("square", 660, t, 0.07, 0.07);
          break;
        case "qte_miss":
          this.tone("square", 120, t, 0.14, 0.08);
          break;
        case "lose":
          for (let i = 0; i < 4; i++) this.tone("square", 200 - i * 30, t + i * 0.1, 0.12, 0.08);
          break;
        case "win":
          [0, 4, 7, 12, 16].forEach((n, i) =>
            this.tone("square", this.freq(n - 12), t + i * 0.09, 0.12, 0.09)
          );
          break;
        case "click":
          this.tone("square", 440, t, 0.04, 0.05);
          break;
        case "omen":
          this.tone("sawtooth", 78, t, 0.8, 0.06, this.musicGain);
          this.tone("square", 82, t + 0.05, 0.7, 0.04, this.musicGain);
          break;
      }
    },

    patterns: {
      title: {
        bpm: 88,
        soft: true,
        mel: [
          7, null, 10, null, 12, null, 10, 7,
          5, null, 7, null, 10, null, 7, null,
          3, null, 7, null, 10, null, 12, 14,
          12, null, 10, null, 7, null, 5, null,
          7, null, 12, null, 15, null, 12, 10,
          7, null, 10, null, 12, null, 7, 5,
          3, null, 5, 7, 10, null, 7, 5,
          7, null, 5, null, 3, null, null, null,
        ],
        harm: [
          0, null, null, null, null, null, null, null,
          -5, null, null, null, null, null, null, null,
          -2, null, null, null, 3, null, null, null,
          0, null, null, null, null, null, null, null,
          0, null, null, null, null, null, null, null,
          -5, null, null, null, null, null, null, null,
          -2, null, null, null, null, null, null, null,
          0, null, null, null, null, null, null, null,
        ],
        bass: [
          0, null, null, null, -5, null, null, null,
          -7, null, null, null, -5, null, null, null,
          -2, null, null, null, 0, null, null, null,
          -5, null, null, null, 0, null, null, null,
          -7, null, null, null, -5, null, null, null,
          -2, null, null, null, 0, null, null, null,
          -5, null, null, null, 0, null, null, null,
          -2, null, null, null, 0, null, null, null,
        ],
        drums: "k.......h.......k.......h.......k.......h.......k.......h..h....",
      },
      chase: {
        bpm: 148,
        mel: [
          0, 3, 5, 7, 10, 12, 10, 7,
          5, 7, 10, 12, 15, 12, 10, 7,
          0, 2, 5, 7, 10, 7, 5, 2,
          0, 5, 7, 12, 10, 7, 5, 3,
          // B: lift
          7, 10, 12, 15, 12, 10, 7, 5,
          3, 5, 7, 10, 12, 15, 17, 15,
          12, 10, 7, 5, 3, 0, -2, 0,
          3, 5, 7, 12, 10, 7, 5, 3,
        ],
        harm: [
          null, null, null, 3, null, null, null, 3,
          null, null, null, 7, null, null, null, 3,
          null, null, null, 2, null, null, null, 2,
          null, null, null, 3, null, null, null, 0,
          null, null, null, 7, null, null, null, 5,
          null, null, null, 3, null, null, null, 7,
          null, null, null, 3, null, null, null, 0,
          null, null, null, 7, null, null, null, 3,
        ],
        bass: [
          0, null, 0, null, -2, null, -2, null,
          -5, null, -5, null, -3, null, -3, null,
          0, null, 0, null, -7, null, -7, null,
          -5, null, -5, null, 0, null, 0, null,
          -5, null, -5, null, -3, null, -3, null,
          -7, null, -7, null, -5, null, -5, null,
          -2, null, -2, null, 0, null, 0, null,
          -5, null, -5, null, -3, null, 0, null,
        ],
        drums: "k.hkh.k.hk.hkh.k.k.hkh.k.hk.hkh.hh.khkk.hk.hkh.k.k.hkh.k.hk.hkh.h",
      },
      qte: {
        bpm: 112,
        mel: [
          12, null, 15, null, 12, null, 10, null,
          7, null, 10, null, 12, 15, 12, null,
          17, null, 15, null, 12, null, 10, null,
          7, 10, 12, null, 15, null, 19, null,
          15, null, 12, null, 15, null, 17, null,
          19, null, 17, 15, 12, null, 10, null,
          7, null, 12, null, 15, null, 19, 17,
          15, 12, 10, 7, 12, null, 15, null,
        ],
        harm: [
          null, null, null, 7, null, null, null, 5,
          null, null, null, 3, null, null, null, 7,
          null, null, null, 10, null, null, null, 7,
          null, null, null, 7, null, null, null, 12,
          null, null, null, 7, null, null, null, 10,
          null, null, null, 12, null, null, null, 7,
          null, null, null, 7, null, null, null, 12,
          null, null, null, 7, null, null, null, 12,
        ],
        bass: [
          0, null, 0, null, -5, null, -5, null,
          -7, null, -7, null, -3, null, -3, null,
          0, null, 0, null, -5, null, -5, null,
          -7, null, -7, null, 0, null, 0, null,
          -5, null, -5, null, -3, null, -3, null,
          -7, null, -7, null, -5, null, -5, null,
          -2, null, -2, null, 0, null, 0, null,
          -5, null, -7, null, 0, null, 0, null,
        ],
        drums: "k.h.k.h.k.h.k.hk.h.k.h.k.hkh.h.k.h.k.hkh.k.h.k.hkh.k.hk.hkh.h.",
      },
      ending: {
        bpm: 96,
        soft: true,
        mel: [
          0, 4, 7, 12, null, 16, 12, 7,
          4, 0, -3, 0, 4, 7, 12, null,
          7, 4, 0, null, -5, 0, 4, 7,
          12, null, null, null, null, null, null, null,
          12, 16, 19, null, 16, 12, 7, 4,
          7, 4, 0, 4, 7, 12, 16, null,
          12, 7, 4, 0, -3, 0, 4, 7,
          0, null, null, null, null, null, null, null,
        ],
        harm: [
          null, null, null, 4, null, null, null, 4,
          null, null, null, 0, null, null, null, 4,
          null, null, null, null, null, null, null, 4,
          7, null, null, null, null, null, null, null,
          null, null, null, 7, null, null, null, 4,
          null, null, null, 0, null, null, null, 7,
          null, null, null, 4, null, null, null, 4,
          0, null, null, null, null, null, null, null,
        ],
        bass: [
          0, null, null, null, -5, null, null, null,
          -7, null, null, null, 0, null, null, null,
          -5, null, null, null, -3, null, null, null,
          0, null, null, null, 0, null, null, null,
          -7, null, null, null, -5, null, null, null,
          -3, null, null, null, -5, null, null, null,
          -7, null, null, null, -3, null, null, null,
          0, null, null, null, null, null, null, null,
        ],
        drums: "k...h...k...h...k...h...k...h...k...h...k...h...k...h...k.......",
      },
      intro: {
        bpm: 84,
        soft: true,
        mel: [
          7, 10, null, 12, null, 10, 7, null,
          5, 7, null, 10, null, 7, null, null,
          3, 5, null, 7, null, 10, null, null,
          7, 5, null, 3, null, null, null, null,
        ],
        harm: [
          null, null, null, null, null, null, 3, null,
          null, null, null, null, null, null, null, null,
          null, null, null, null, null, null, 3, null,
          null, null, null, null, null, null, null, null,
        ],
        bass: [
          0, null, null, null, -5, null, null, null,
          -7, null, null, null, -5, null, null, null,
          -2, null, null, null, 0, null, null, null,
          -5, null, null, null, -5, null, null, null,
        ],
        drums: "..............hh..........h.h.....",
      },
      discover: {
        bpm: 100,
        mel: [7, 12, 15, 19, null, 19, 15, 12, 7, null, 10, 12, 15, null, 15, null],
        harm: [null, null, null, 7, null, null, null, 7, null, null, null, 7, null, null, null, null],
        bass: [0, null, -5, null, -7, null, -5, null, 0, null, -5, null, 0, null, 0, null],
        drums: "k.h.k.h.k.hkh.k.",
      },
    },

    _startSynth(mode) {
      this._step = 0;
      this._nextTime = this.ctx.currentTime + 0.05;
      const pat = this.patterns[mode];
      if (!pat) return;
      // 会话总线：切模式时旧模式尾音走渐隐，不垫在新模式第一拍上
      this._bus = this.ctx.createGain();
      this._bus.connect(this.musicGain);
      // chase is the tense run loop — keep it hotter than lobby/result
      const boost = mode === "chase" ? 1.35 : mode === "qte" ? 1.15 : 1;
      this.musicGain.gain.value = 0.34 * boost;
      const spb = 60 / pat.bpm / 4;
      const tick = () => {
        if (!this.ctx || this._mode !== mode) return;
        const p = this.patterns[this._mode];
        if (!p) return;
        const soft = !!p.soft;
        // tab was hidden → rAF stalled; snap instead of flooding past-due notes
        if (this._nextTime < this.ctx.currentTime) {
          this._nextTime = this.ctx.currentTime + 0.05;
        }
        while (this._nextTime < this.ctx.currentTime + 0.12) {
          const i = this._step % p.mel.length;
          const m = p.mel[i];
          const h = p.harm ? p.harm[i] : null;
          const b = p.bass[i];
          const dr = p.drums[i] || ".";
          const t = this._nextTime;
          if (m !== null && m !== undefined) {
            this.tone(soft ? "triangle" : "square", this.freq(m - 12), t, spb * (soft ? 2.4 : 1.7), (soft ? 0.046 : 0.055) * boost, this._bus);
            this.tone(soft ? "sine" : "square", this.freq(m - 24), t, spb * (soft ? 1.8 : 1.2), 0.024 * boost, this._bus);
          }
          if (h !== null && h !== undefined)
            this.tone(soft ? "sine" : "triangle", this.freq(h - 12), t, spb * (soft ? 4.2 : 2.0), (soft ? 0.03 : 0.034) * boost, this._bus);
          if (b !== null && b !== undefined)
            this.tone(soft ? "sine" : "triangle", this.freq(b - 24), t, spb * (soft ? 3.2 : 2.1), 0.09 * boost, this._bus);
          if (dr === "k") {
            this.noise(t, 0.05, (soft ? 0.038 : 0.055) * boost);
            this.tone("triangle", 72, t, 0.06, 0.05 * boost, this._bus);
          }
          if (dr === "h") this.tone("triangle", 7000, t, 0.025, 0.013 * boost, this._bus);
          this._nextTime += spb;
          this._step++;
        }
        this._timer = requestAnimationFrame(tick);
      };
      this._timer = requestAnimationFrame(tick);
    },

    startMusic(mode) {
      this.ensure();
      if (!this.ctx || !this.enabled) {
        this._mode = mode;
        return;
      }
      if (this._mode === mode && this._timer) return;

      this.stopMusic();
      this._mode = mode;
      this._startSynth(mode);
    },

    stopMusic() {
      if (this._timer) {
        cancelAnimationFrame(this._timer);
        this._timer = null;
      }
      this._mode = "off";
      const bus = this._bus;
      if (bus && this.ctx) {
        bus.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
        setTimeout(() => {
          try { bus.disconnect(); } catch (_) {}
        }, 400);
      }
      this._bus = null;
    },
  };

  // ── Input ──────────────────────────────────────────────
  const Input = {
    ax: 0,
    ay: 0,
    keyAx: 0,
    keyAy: 0,
    stickAx: 0,
    stickAy: 0,
    jet: false,
    jetPressed: false,
    qtePressed: false,
    stickId: null,
    jetId: null,
    keys: {},

    applyAxes() {
      // stick wins when held; keyboard fills the gap
      if (this.stickAx !== 0 || this.stickAy !== 0) {
        this.ax = this.stickAx;
        this.ay = this.stickAy;
      } else {
        this.ax = this.keyAx;
        this.ay = this.keyAy;
      }
    },

    bind() {
      const onKey = (e, down) => {
        this.keys[e.code] = down;
        const left = this.keys.ArrowLeft || this.keys.KeyA;
        const right = this.keys.ArrowRight || this.keys.KeyD;
        const up = this.keys.ArrowUp || this.keys.KeyW;
        const downK = this.keys.ArrowDown || this.keys.KeyS;
        this.keyAx = (right ? 1 : 0) - (left ? 1 : 0);
        this.keyAy = (downK ? 1 : 0) - (up ? 1 : 0);
        this.applyAxes();
        if (e.code === "Space" || e.code === "KeyJ") {
          if (down) this.jetPressed = true;
          this.jet = down;
        }
        if (e.code === "Enter" || e.code === "Space") {
          if (down) this.qtePressed = true;
        }
      };
      window.addEventListener("keydown", (e) => {
        if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code))
          e.preventDefault();
        onKey(e, true);
      });
      window.addEventListener("keyup", (e) => onKey(e, false));

      const base = el.stickBase;
      const knob = el.stickKnob;
      const setKnob = (dx, dy) => {
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
      };

      // floating origin: base jumps to the touch point so deflection always
      // starts from zero — reads as much more 跟手 than a fixed pad
      const BASE_R = 44; // 88px dial
      const TRAVEL = 32; // knob max travel (px) — knob edge stays on the dial
      const DEAD = 5; // px of travel that does nothing
      const FULL = 26; // px of travel that reaches full deflection
      let stickHome = null; // resting base position (zone coords)
      let stickCX = 0; // active stick center (client coords)
      let stickCY = 0;

      const stickPlace = (zone, tx, ty) => {
        const zw = zone.clientWidth;
        const zh = zone.clientHeight;
        const cx = clamp(tx, BASE_R + 2, Math.max(BASE_R + 2, zw - BASE_R - 2));
        const cy = clamp(ty, BASE_R + 2, Math.max(BASE_R + 2, zh - BASE_R - 2));
        base.style.left = cx - BASE_R + "px";
        base.style.top = cy - BASE_R + "px";
        return { cx, cy };
      };

      const stickMove = (clientX, clientY) => {
        let dx = clientX - stickCX;
        let dy = clientY - stickCY;
        const len = Math.hypot(dx, dy);
        if (len > TRAVEL) {
          dx = (dx / len) * TRAVEL;
          dy = (dy / len) * TRAVEL;
        }
        // deadzone, then ramp to full well before the travel edge
        const v = len <= DEAD ? 0 : clamp((len - DEAD) / (FULL - DEAD), 0, 1);
        const nx = len > 0 ? dx / len : 0;
        const ny = len > 0 ? dy / len : 0;
        this.stickAx = nx * v;
        this.stickAy = ny * v;
        this.applyAxes();
        setKnob(dx, dy);
      };

      const stickEnd = () => {
        this.stickAx = 0;
        this.stickAy = 0;
        this.stickId = null;
        this.applyAxes();
        setKnob(0, 0);
        base.classList.remove("live");
        if (stickHome) {
          base.style.left = stickHome.x + "px";
          base.style.top = stickHome.y + "px";
        }
      };

      const stickZone = document.getElementById("stick-zone");
      stickZone.addEventListener(
        "pointerdown",
        (e) => {
          e.preventDefault();
          if (this.stickId != null) return;
          stickZone.setPointerCapture(e.pointerId);
          this.stickId = e.pointerId;
          if (!stickHome) {
            stickHome = { x: base.offsetLeft, y: base.offsetTop };
            base.style.bottom = "auto";
          }
          const zr = stickZone.getBoundingClientRect();
          const c = stickPlace(stickZone, e.clientX - zr.left, e.clientY - zr.top);
          stickCX = zr.left + c.cx;
          stickCY = zr.top + c.cy;
          base.classList.add("live");
          stickMove(e.clientX, e.clientY);
        },
        { passive: false }
      );
      stickZone.addEventListener(
        "pointermove",
        (e) => {
          if (this.stickId !== e.pointerId) return;
          e.preventDefault();
          stickMove(e.clientX, e.clientY);
        },
        { passive: false }
      );
      stickZone.addEventListener("pointerup", (e) => {
        if (this.stickId === e.pointerId) stickEnd();
      });
      stickZone.addEventListener("pointercancel", (e) => {
        if (this.stickId === e.pointerId) stickEnd();
      });
      stickZone.addEventListener("lostpointercapture", (e) => {
        if (this.stickId === e.pointerId) stickEnd();
      });

      el.btnJet.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        if (this.jetId != null) return;
        el.btnJet.setPointerCapture(e.pointerId);
        this.jetId = e.pointerId;
        this.jet = true;
        this.jetPressed = true;
        el.btnJet.classList.add("on");
      });
      const jetUp = (e) => {
        if (e && this.jetId != null && e.pointerId !== this.jetId) return;
        this.jetId = null;
        this.jet = false;
        el.btnJet.classList.remove("on");
      };
      el.btnJet.addEventListener("pointerup", jetUp);
      el.btnJet.addEventListener("pointercancel", jetUp);
      el.btnJet.addEventListener("lostpointercapture", jetUp);

      // 切屏强制清场：隐藏控件可能吞掉 pointerup/cancel，摇杆/喷射不能卡死
      this.releaseAll = () => {
        stickEnd();
        jetUp();
      };

      const qteHit = (e) => {
        if (e) e.preventDefault();
        this.qtePressed = true;
      };
      el.btnQte.addEventListener("pointerdown", qteHit);
    },
  };

  // ── Game state ─────────────────────────────────────────
  const G = {
    state: "cover",
    t: 0,
    runT: 0,
    progress: 0,
    score: 0,
    outcome: null,
    failReason: null,
    parts: null,
    reduceMotion: false,
    shake: 0,
    flash: 0,
    hitStop: 0,
    stars: [],
    bodies: [],
    particles: [],
    spawnAcc: 0,
    moon: { x: W * 0.72, y: 60, r: 14 },
    earth: null,
    qte: null,
    discoverT: 0,
    lastBest: null,
    cine: null,
    titleOrbit: 0,
    diff: "normal",
    dailyMode: false,
    clearT: null,
    newPB: false,
    newDailyTime: false,
    rng: Math.random,
    rank: 0,
    boardFrom: "result",
    sector: 0,
    wellSticky: 0,
    nextStop: null,
    blood: null,
  };

  function sectorOf(progress) {
    let s = 0;
    for (let i = 0; i < SECTORS.length; i++) {
      if (progress >= SECTORS[i].at) s = i;
    }
    return s;
  }

  function diffConf() {
    return DIFF[G.diff] || DIFF.normal;
  }

  function loadBest() {
    Store.load();
    G.diff = clampDiff(Store.data.diff);
    const board = Store.data.board;
    G.lastBest = board && board[0] ? board[0] : null;
  }

  function saveBest() {
    const score = Math.round(G.score);
    const entry = {
      id: `${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      score,
      ending: G.outcome || "fail",
      mass: Math.round(G.earth ? G.earth.mass : 0),
      qteP: G.qte ? G.qte.perfect : 0,
      qteG: G.qte ? G.qte.good : 0,
      qteM: G.qte ? G.qte.miss : 0,
      combo: G.qte ? G.qte.bestCombo : 0,
      prog: Math.round(G.progress * 100),
      diff: G.diff,
      daily: G.dailyMode,
      time: G.clearT != null ? Math.round(G.clearT * 10) / 10 : null,
      ts: Date.now(),
    };
    G.rank = Store.addBoard(entry);
    Store.unlock("first");
    if (G.outcome === "perfect") Store.unlock("perfect");
    if (score >= 80) Store.unlock("score80");
    if (G.qte && G.qte.miss === 0 && G.qte.locks >= (G.qte.need || 1)) Store.unlock("combo10");
    // 逐级通关解锁：追寻之旅→宇宙冒险→坠入虚空→月之暗面
    if (G.outcome === "close" || G.outcome === "perfect") {
      if (G.diff === "easy") Store.unlock("normal");
      else if (G.diff === "normal") Store.unlock("hard");
      else if (G.diff === "hard") Store.unlock("blood");
      // 通关即默认升档（竞速局不参与），回任务面板也是新档位
      if (!G.dailyMode) {
        const next = LADDER[Math.min(LADDER.indexOf(G.diff) + 1, LADDER.length - 1)];
        Store.data.diff = next;
      }
    }
    const isLiveDaily = G.dailyMode && (!G.runDate || G.runDate === todayKey());
    if (isLiveDaily) {
      const k = todayKey();
      if (Store.data.daily.date !== k) Store.data.daily = { date: k, best: 0, played: true };
      Store.data.daily.played = true;
      if (score > (Store.data.daily.best || 0)) Store.data.daily.best = score;
      Store.save();
      Store.unlock("daily");
    }
    // 竞速计时：通关才计；PB 按难度，今日最佳只在竞速局
    if (G.clearT != null) {
      const t10 = Math.round(G.clearT * 10) / 10;
      const pb = Store.data.pb[G.diff];
      if (!pb || t10 < pb) {
        Store.data.pb[G.diff] = t10;
        G.newPB = true;
      }
      if (isLiveDaily) {
        const bt = Store.data.daily.bestTime;
        if (!bt || t10 < bt) {
          Store.data.daily.bestTime = t10;
          G.newDailyTime = true;
        }
      }
      Store.save();
    }
    Store.data.sound = AudioEngine.enabled;
    Store.save();
    G.lastBest = Store.data.board[0] || entry;
  }

  function makeEarth() {
    return {
      x: VIEW.px,
      y: VIEW.py,
      vx: 0,
      vy: 0,
      r: 17,
      mass: diffConf().massStart,
      jetT: 0,
      jetCd: 0,
      hitFlash: 0,
      invuln: 0,
      pickupT: 0,
      pickupPop: 0,
      alive: true,
      angle: 0,
    };
  }

  function starLx() {
    // keep center play corridor clear — stars live on sides / upper flanks
    let lx = rand(-1.3, 1.3);
    if (Math.abs(lx) < 0.62) {
      lx = lx >= 0 ? rand(0.62, 1.3) : rand(-1.3, -0.62);
    }
    return lx;
  }

  function initStars() {
    G.stars = [];
    for (let i = 0; i < 42; i++) {
      G.stars.push({
        z: rand(0.05, 1),
        lx: starLx(),
        ly: rand(-0.95, 0.55),
        tw: rand(Math.PI * 2),
      });
    }
  }

  function drawStars(dt) {
    const play = G.state === "play" || G.state === "discover" || G.state === "qte";
    const spd = play ? 0.18 + G.progress * 0.2 : 0.04;
    for (const s of G.stars) {
      s.z -= spd * dt * (0.35 + s.z);
      if (s.z < 0.02) {
        s.z = 1;
        s.lx = starLx();
        s.ly = rand(-0.95, 0.55);
      }
      const t = 1 - s.z;
      const sx = VIEW.vx + s.lx * 118 * t;
      const sy = VIEW.vy + (VIEW.py - VIEW.vy) * t + s.ly * 90 * t;
      if (sx < 0 || sx > W || sy < 0 || sy > H) continue;
      // dim in center corridor even if projected in
      const centerBias = 1 - clamp(1 - Math.abs(sx - W * 0.5) / (W * 0.28), 0, 1) * 0.75;
      const big = t > 0.55 && s.tw > 2.2;
      const c = t > 0.65 ? "#F0E6D3" : t > 0.35 ? "#C5B89A" : "#6B7A8C";
      ctx.globalAlpha = (0.35 + 0.55 * t) * centerBias;
      if (big) {
        drawStar4(sx, sy, 3 + (t > 0.8 ? 2 : 0), c);
      } else {
        ctx.fillStyle = c;
        const sz = t > 0.75 ? 2 : 1;
        ctx.fillRect(sx | 0, sy | 0, sz, sz);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawStar4(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.28, y - r * 0.28);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x + r * 0.28, y + r * 0.28);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.28, y + r * 0.28);
    ctx.lineTo(x - r, y);
    ctx.lineTo(x - r * 0.28, y - r * 0.28);
    ctx.closePath();
    ctx.fill();
  }

  // 06-gameplay-stipple: printed stipple sky — pre-rendered dot tile, one fill per frame
  let stipplePat = null;
  function drawStipple(alpha) {
    if (!stipplePat) {
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 128;
      const g = c.getContext("2d");
      for (let i = 0; i < 300; i++) {
        const x = (Math.random() * 128) | 0;
        const y = (Math.random() * 128) | 0;
        g.globalAlpha = 0.25 + Math.random() * 0.75;
        g.fillStyle = Math.random() < 0.82 ? "#F0E6D3" : "#C5B89A";
        const s = Math.random() < 0.1 ? 2 : 1;
        g.fillRect(x, y, s, s);
      }
      stipplePat = ctx.createPattern(c, "repeat");
      if (!stipplePat) return;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = stipplePat;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function dashedLine(x1, y1, x2, y2, color, dash = 4, gap = 4, w = 1) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.setLineDash([dash, gap]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function stippleRing(x, y, r, color, n = 24, seed = 0) {
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const a = seed + (i / n) * Math.PI * 2;
      const rr = r * (0.92 + ((i * 17) % 7) * 0.02);
      const sx = x + Math.cos(a) * rr;
      const sy = y + Math.sin(a) * rr;
      ctx.fillRect(sx | 0, sy | 0, 1, 1);
    }
  }

  function resetRun() {
    G.t = 0;
    G.runT = 0;
    G.clearT = null;
    G.newPB = false;
    G.newDailyTime = false;
    G.progress = 0;
    G.score = 0;
    G.outcome = null;
    G.failReason = null;
    G.parts = null;
    G.shake = 0;
    G.flash = 0;
    G.hitStop = 0;
    G.bodies = [];
    G.particles = [];
    G.spawnAcc = 0;
    G.earth = makeEarth();
    G.moon.x = W * 0.72;
    G.moon.y = -30;
    G.moon.r = 12;
    G.qte = null;
    G.rank = 0;
    G.sector = 0;
    G.wellSticky = 0;
    G.moonDim = 1;
    Input.jetPressed = false;
    Input.qtePressed = false;
    Input.jet = false;
    G.runDate = todayKey(); // 竞速成绩归属开局日：跨午夜局种子与成绩同一天
    G.blood =
      G.diff === "blood"
        ? {
            spikeT: 2.2,
            spike: null,
            shockT: 3.6,
            shock: null,
          }
        : null;
    // daily: same obstacle roll for the day; normal: free random
    if (G.dailyMode) {
      const seed = hashStr(todayKey() + G.diff) ^ 0x9e3779b9;
      G.rng = mulberry32(seed);
    } else {
      G.rng = Math.random;
    }
    initStars();
  }

  function showScreen(name) {
    Object.keys(el.screens).forEach((k) => el.screens[k].classList.toggle("hidden", k !== name));
    // cover/poster: no heavy scrim (image is the UI)
    if (name === "cover") {
      el.overlay.classList.remove("active", "menu-scrim");
      el.overlay.classList.add("poster");
    } else if (name === "title") {
      // menu: illustration full-bleed; scrim only under the printed footer
      el.overlay.classList.remove("poster");
      el.overlay.classList.add("menu-scrim", "active");
    } else {
      el.overlay.classList.remove("poster", "menu-scrim");
      el.overlay.classList.toggle(
        "active",
        name !== null && name !== "intro" && name !== "qte" && name !== "cover"
      );
    }
    if (name === "intro") {
      el.screens.intro.classList.remove("hidden");
      el.overlay.classList.remove("active");
    }
    if (name === "qte") {
      el.screens.qte.classList.remove("hidden");
      el.overlay.classList.remove("active");
    }
  }

  function setState(s) {
    G.state = s;
    Input.releaseAll?.(); // 切屏瞬间若手指还按着，隐藏控件可能吞掉 pointerup，强制清场防摇杆卡死
    const stage = document.getElementById("stage");
    if (stage) {
      stage.classList.toggle("poster-mode", s === "cover");
      stage.classList.toggle("qte-mode", s === "qte");
    }
    const playing = s === "play" || s === "qte";
    el.hud.classList.toggle("hidden", !playing);
    el.controls.classList.toggle("hidden", s !== "play" && s !== "qte");
    el.btnQte.classList.toggle("hidden", s !== "qte");
    if (s === "qte" || s === "discover") el.overlay.classList.remove("active");

    if (s === "cover") {
      showScreen("cover");
      AudioEngine.startMusic("title");
    } else if (s === "title") {
      ensureMenuArt();
      showScreen("title");
      refreshTitleUI();
      AudioEngine.startMusic("title");
    } else if (s === "intro") {
      showScreen("intro");
      G.cine = { t: 0, beat: 0, sceneT: 0, omenPlayed: false };
      el.introCaption.textContent = "";
      el.introCaption.classList.remove("show");
      AudioEngine.startMusic("intro");
    } else if (s === "play") {
      showScreen(null);
      AudioEngine.startMusic("chase");
    } else if (s === "discover") {
      showScreen(null);
      el.hud.classList.add("hidden");
      el.controls.classList.add("hidden");
      el.btnQte.classList.add("hidden");
    } else if (s === "qte") {
      showScreen("qte");
      AudioEngine.startMusic("qte");
    } else if (s === "result") {
      showScreen("result");
      AudioEngine.startMusic("ending");
    } else if (s === "card") {
      showScreen("card");
      drawShareCard();
    } else if (s === "board") {
      showScreen("board");
      fillBoard();
    }
  }

  // ── Particles ──────────────────────────────────────────
  function burst(x, y, color, n = 8, spd = 50) {
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2);
      const s = rand(spd * 0.3, spd);
      G.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.25, 0.6),
        max: 0.6,
        color,
        r: chance(0.5) ? 2 : 3,
      });
    }
  }

  function updateParticles(dt) {
    for (const p of G.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    G.particles = G.particles.filter((p) => p.life > 0);
  }

  // ── Spawning (depth field) ─────────────────────────────
  // Objects ride a fixed corridor (NOT parented to earth) so 2D intercept works.
  function projectBody(b) {
    const t = clamp(1 - b.z, 0, 1.2);
    const scale = 0.18 + 1.0 * t * t;
    const sx = VIEW.vx + b.lx * 108 * t;
    const sy = VIEW.vy + (VIEW.py - VIEW.vy) * t + b.ly * 82 * t;
    return { sx, sy, scale, t };
  }

  function spawnEntity() {
    const prog = G.progress;
    const D = diffConf();
    const sec = SECTORS[sectorOf(prog)];
    const rng = G.rng || Math.random;
    const roll = rng();
    // lateral in corridor units; at t=1 → sx ≈ 135 + lx*108, keep on screen
    const lx = (rng() * 2 - 1) * 1.05;
    const ly = (rng() * 2 - 1) * 0.95;
    const wellChance = (0.07 + prog * 0.1) * D.wellMul * sec.well;

    if (roll < wellChance) {
      G.bodies.push({
        type: "well",
        lx,
        ly,
        z: VIEW.zMax,
        r: 14 + rng() * 6,
        pull: (850 + rng() * 650) * D.pullMul * sec.pull + prog * 500,
        killR: 0.42,
        spin: rng() * 2 - 1,
        ph: rng() * Math.PI * 2,
      });
      return;
    }

    if (rng() < sec.signalBias) {
      // gold strongly biased to corridor center
      const slx = lx * 0.4;
      const sly = ly * 0.38;
      G.bodies.push({
        type: "signal",
        lx: slx,
        ly: sly,
        z: VIEW.zMax,
        r: 12,
        ph: rng() * Math.PI * 2,
      });
      return;
    }

    const big = rng() < (0.12 + prog * 0.12) * sec.rock * (D.rockMul || 1);
    // white dust a bit more central; hard rocks can stay wider
    const dlx = big ? lx : lx * 0.7;
    const dly = big ? ly : ly * 0.65;
    G.bodies.push({
      type: big ? "rock" : "dust",
      lx: dlx,
      ly: dly,
      z: VIEW.zMax,
      r: big ? 12 + rng() * 5 : 7 + rng() * 3,
      massDelta: big ? 12 + rng() * 8 : 3 + rng() * 4,
      speedDown: big ? 18 + rng() * 12 : 5 + rng() * 6,
      drift: (rng() * 2 - 1) * 0.12,
      ph: rng() * Math.PI * 2,
      hard: big,
      seed: rng() * 100,
    });
  }

  function updateSpawning(dt) {
    const D = diffConf();
    const sec = SECTORS[sectorOf(G.progress)];
    const massFac = G.earth ? clamp(G.earth.mass / 55, 0.75, 1.35) : 1;
    // heavier earth drags the world slightly slower (feels sticky)
    const fwd = VIEW.fwd * D.scrollMul * sec.scroll * (2 - massFac) * (1 + G.progress * 0.55);
    G.spawnAcc += dt * (0.42 + G.progress * 0.85) * D.spawnMul * sec.spawn;
    while (G.spawnAcc >= 1) {
      G.spawnAcc -= 1;
      spawnEntity();
    }

    const e = G.earth;
    const vacuumMul = (D.vacuumMul || 1) * sec.vacuum;
    const auraR = e ? VIEW.auraBase + (e.mass - PHYS.massMin) * VIEW.auraPerMass : 40;

    for (const b of G.bodies) {
      b.z -= fwd * dt;
      if (b.drift) b.lx += b.drift * dt;
      b.ph = (b.ph || 0) + dt * 2;

      // Mild assist only — player must actually intercept. Late sectors vacuum almost off.
      if (e && b.type !== "well" && b.z < 0.42 && b.z > 0.02) {
        const p = projectBody(b);
        const dx = e.x - p.sx;
        const dy = e.y - p.sy;
        const d = Math.hypot(dx, dy) || 1;
        const soft = !b.hard;
        const pullR = auraR * (soft ? 1.2 : 0.85);
        if (d < pullR && d > 4) {
          const near = 1 - d / pullR;
          const base = soft ? 0.55 + near * 0.85 : 0.2 + near * 0.35;
          // heavy mass no longer multiplies free magnet
          const f = base * vacuumMul * (0.9 + (1 - e.mass / PHYS.massMax) * 0.35);
          b.lx += (dx / 108) * f * dt * (p.t + 0.18);
          b.ly += (dy / 82) * f * dt * (p.t + 0.18);
          // tiny touch-assist only when already almost colliding
          if (soft && d < e.r + 8) {
            b.lx += (dx / 108) * 1.2 * dt;
            b.ly += (dy / 82) * 1.2 * dt;
          }
        }
      }
    }
    G.bodies = G.bodies.filter((b) => b.z > -0.08);
  }

  // ── Play logic ─────────────────────────────────────────
  function lose(reason) {
    if (G.state !== "play") return;
    G.earth.alive = false;
    G.outcome = "fail";
    G.failReason = reason || "lost";
    AudioEngine.sfx("lose");
    burst(G.earth.x, G.earth.y, "#FF2A6D", 28, 90);
    G.shake = 10;
    computeScore();
    setTimeout(() => {
      if (G.state === "play") {
        saveBest();
        fillResult();
        setState("result");
      }
    }, 750);
  }

  function enterDiscover() {
    if (G.state !== "play") return;
    G.discoverT = PROG.discoverSec;
    G.bodies = [];
    G.moonDim = 1;
    if (G.blood) { // 预警中的潮汐刺/冲击环不带进 discover/QTE
      G.blood.spike = null;
      G.blood.shock = null;
    }
    setState("discover");
    AudioEngine.sfx("win");
    AudioEngine.startMusic("discover");
    burst(W * 0.5, H * 0.3, "#FFD166", 24, 80);
    G.flash = 0.4;
  }

  function updateDiscover(dt) {
    G.discoverT -= dt;
    // moon rushes in
    G.moon.x = lerp(W * 0.55, W * 0.5, 1 - G.discoverT / PROG.discoverSec);
    G.moon.y = lerp(H * 0.08, H * 0.32, easeOut(1 - G.discoverT / PROG.discoverSec));
    G.moon.r = lerp(10, 28, easeOut(1 - G.discoverT / PROG.discoverSec));
    if (G.earth) {
      G.earth.x = W * 0.5;
      G.earth.y = H * 0.68;
      G.earth.vx = 0;
      G.earth.vy = 0;
    }
    if (G.discoverT <= 0) enterCapture();
  }

  function enterCapture() {
    G.qte = {
      t: 0,
      tutorial: QTE.tutorialSec,
      locks: 0,
      need: G.diff === "easy" ? QTE.needLocksEasy : QTE.needLocks,
      perfect: 0,
      good: 0,
      miss: 0,
      combo: 0,
      bestCombo: 0,
      hits: 0,
      done: false,
      ready: false,
      readySfx: false,
      feedback: "",
      feedbackT: 0,
      cool: 0, // brief pause after catch before moon slips away
      moonVx: 28,
      moonVy: -18,
      struggleUsed: false,
    };
    G.bodies = [];
    G.moon.x = W * 0.62;
    G.moon.y = H * 0.28;
    G.moon.r = 26;
    if (G.earth) {
      G.earth.x = W * 0.5;
      G.earth.y = H * 0.64;
      G.earth.r = 16;
      G.earth.vx = 0;
      G.earth.vy = 0;
    }
    setState("qte");
    // draw one frame immediately so the stage never flashes empty
    render(0.016);
  }

  function updateQTE(dt) {
    const q = G.qte;
    if (!q || q.done) return;
    q.t += dt;
    q.feedbackT = Math.max(0, q.feedbackT - dt);
    q.cool = Math.max(0, q.cool - dt);

    // player moves earth (same joystick as chase)
    const e = G.earth;
    if (e) {
      let ax = Input.ax;
      let ay = Input.ay;
      const mag = Math.hypot(ax, ay);
      if (mag > 1) {
        ax /= mag;
        ay /= mag;
      }
      const accel = PHYS.accel * 1.15;
      e.vx += ax * accel * dt;
      e.vy += ay * accel * dt;
      e.vx -= e.vx * 2.2 * dt;
      e.vy -= e.vy * 2.2 * dt;
      const sp = Math.hypot(e.vx, e.vy);
      const maxS = PHYS.maxSpeed * 0.92;
      if (sp > maxS) {
        e.vx = (e.vx / sp) * maxS;
        e.vy = (e.vy / sp) * maxS;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const pad = e.r + 8;
      e.x = clamp(e.x, pad + QTE.ringR * 0.15, W - pad - QTE.ringR * 0.15);
      e.y = clamp(e.y, 70 + QTE.ringR * 0.2, H - 90);
      e.angle += dt * 0.4;
    }

    // moon drifts; heavier earth attracts it more (easier to lasso, still sticky to move)
    if (q.cool <= 0) {
      const massG = e ? clamp(e.mass / 55, 0.55, 1.6) : 1;
      const wob = Math.sin(q.t * 1.7) * 0.6 + Math.cos(q.t * 0.9) * 0.4;
      q.moonVx += wob * 12 * dt;
      q.moonVy += Math.cos(q.t * 1.3) * 9 * dt;
      if (e) {
        const dx = e.x - G.moon.x;
        const dy = e.y - G.moon.y;
        const d = Math.hypot(dx, dy) || 1;
        // soft pull toward earth when outside ring
        if (d > QTE.ringR * 0.85) {
          const f = 28 * massG * dt;
          q.moonVx += (dx / d) * f;
          q.moonVy += (dy / d) * f;
        }
      }
      // calmer drift so the ring can actually hold the moon
      const drift = QTE.moonDrift * (1 + q.locks * 0.06) * (1.85 - massG * 0.45);
      const ms = Math.hypot(q.moonVx, q.moonVy) || 1;
      if (ms > drift) {
        q.moonVx = (q.moonVx / ms) * drift;
        q.moonVy = (q.moonVy / ms) * drift;
      }
      G.moon.x += q.moonVx * dt;
      G.moon.y += q.moonVy * dt;
      const mr = G.moon.r || 22;
      if (G.moon.x < mr + 10) {
        G.moon.x = mr + 10;
        q.moonVx = Math.abs(q.moonVx);
      }
      if (G.moon.x > W - mr - 10) {
        G.moon.x = W - mr - 10;
        q.moonVx = -Math.abs(q.moonVx);
      }
      if (G.moon.y < 50 + mr) {
        G.moon.y = 50 + mr;
        q.moonVy = Math.abs(q.moonVy);
      }
      if (G.moon.y > H - 120 - mr) {
        G.moon.y = H - 120 - mr;
        q.moonVy = -Math.abs(q.moonVy);
      }
      G.moon.r = lerp(G.moon.r || 22, 22, 0.12);
    }

    // lasso readiness: moon inside earth's light ring (mass strengthens ring)
    const ex = e ? e.x : W * 0.5;
    const ey = e ? e.y : H * 0.62;
    const massFac = e ? clamp((e.mass - PHYS.massMin) / (50 - PHYS.massMin), 0.88, 1.15) : 1;
    const ringR = QTE.ringR * massFac;
    q.ringR = ringR;
    const d = Math.hypot(G.moon.x - ex, G.moon.y - ey);
    const ratio = d / ringR;
    q.ready = ratio <= QTE.catchIn;
    q.ratio = ratio;
    if (q.ready && !q.readySfx) {
      q.readySfx = true;
      AudioEngine.sfx("qte_good");
    }
    if (!q.ready) q.readySfx = false;

    if (Input.qtePressed) {
      Input.qtePressed = false;
      if (q.tutorial > 0) return;
      if (q.cool > 0) return;
      if (q.ready) {
        // blood moon: first clean grab is shrugged off once
        if (G.diff === "blood" && !q.struggleUsed) {
          q.struggleUsed = true;
          q.feedback = "月亮挣脱了！";
          q.feedbackT = 0.85;
          AudioEngine.sfx("qte_miss");
          q.cool = 0.45;
          const ang = Math.atan2(G.moon.y - ey, G.moon.x - ex) + Math.PI * 0.65;
          G.moon.x = clamp(ex + Math.cos(ang) * ringR * 1.12, 36, W - 36);
          G.moon.y = clamp(ey + Math.sin(ang) * ringR * 1.12, 70, H - 130);
          q.moonVx = Math.cos(ang) * QTE.moonDrift * 0.8;
          q.moonVy = Math.sin(ang) * QTE.moonDrift * 0.8;
          burst(G.moon.x, G.moon.y, "#FF2A6D", 14, 55);
          G.flash = 0.18;
          return;
        }
        q.hits++;
        q.combo++;
        q.bestCombo = Math.max(q.bestCombo, q.combo);
        q.locks++;
        if (ratio <= QTE.perfectIn) {
          q.perfect++;
          q.feedback = "完美套住！";
          AudioEngine.sfx("qte_perfect");
          burst(G.moon.x, G.moon.y, "#FFD166", 18, 75);
          G.flash = 0.15;
        } else {
          q.good++;
          q.feedback = "抓住了";
          AudioEngine.sfx("qte_good");
          burst(G.moon.x, G.moon.y, "#C5D0E6", 12, 45);
        }
        q.feedbackT = 0.7;
        q.cool = 0.55;
        // slip away to a new spot
        const ang = Math.random() * Math.PI * 2;
        const nx = clamp(W * 0.5 + Math.cos(ang) * 90, 40, W - 40);
        const ny = clamp(H * 0.35 + Math.sin(ang) * 80, 60, H - 140);
        G.moon.x = nx;
        G.moon.y = ny;
        q.moonVx = Math.cos(ang + 1) * QTE.moonDrift * 0.7;
        q.moonVy = Math.sin(ang + 0.4) * QTE.moonDrift * 0.7;
        if (q.locks >= q.need) {
          q.done = true;
          finishQTE();
          return;
        }
      } else {
        q.miss++;
        q.combo = 0;
        q.feedback = "光圈没套住月亮";
        q.feedbackT = 0.6;
        AudioEngine.sfx("qte_miss");
        // moon startled — mild only
        q.moonVx *= 1.12;
        q.moonVy *= 1.12;
      }
    }

    if (q.tutorial > 0) {
      q.tutorial -= dt;
      // demo: gently pull moon near ring so player sees the goal
      if (e && q.tutorial < QTE.tutorialSec * 0.55) {
        const targetAng = q.t * 2;
        const RR = q.ringR || QTE.ringR;
        G.moon.x = e.x + Math.cos(targetAng) * RR * 0.5;
        G.moon.y = e.y + Math.sin(targetAng) * RR * 0.5;
      }
      Input.qtePressed = false;
    }

    if (q.t >= QTE.duration) {
      q.done = true;
      finishQTE();
    }
  }

  function massScore() {
    const m = G.earth.mass;
    const { healthyLow: lo, healthyHigh: hi, massMin: mn, massMax: mx } = PHYS;
    if (m >= lo && m <= hi) return 100;
    if (m < lo) return clamp(((m - mn) / (lo - mn)) * 100, 0, 100);
    return clamp(((mx - m) / (mx - hi)) * 100, 0, 100);
  }

  function distScore() {
    return clamp(G.progress * 100, 0, 100);
  }

  function qteScore() {
    const q = G.qte;
    if (!q) return 0;
    const need = Math.max(1, q.need);
    // completing the objective dominates; early misses only mild precision penalty
    const lockRate = clamp(q.locks / need, 0, 1);
    const hits = q.perfect + q.good;
    const attempts = Math.max(1, hits + q.miss);
    const precision = (q.perfect + q.good * 0.75) / attempts;
    const comboBonus = clamp(q.bestCombo / need, 0, 1);
    return clamp(lockRate * 55 + precision * 30 + comboBonus * 15, 0, 100);
  }

  function computeScore() {
    if (G.outcome === "fail" && G.state === "play") {
      G.score = massScore() * 0.4 + distScore() * 0.4;
      G.parts = { ms: massScore(), ds: distScore(), qs: 0 };
      return;
    }
    const ms = massScore();
    const ds = distScore();
    const qs = qteScore();
    G.score = ms * SCORE_W.mass + ds * SCORE_W.dist + qs * SCORE_W.qte;
    G.parts = { ms, ds, qs };
  }

  function finishQTE() {
    const q = G.qte;
    const completed = !!(q && q.locks >= q.need);
    if (completed) G.clearT = G.runT;
    const qs = qteScore();
    computeScore();
    const s = G.score;
    // objective first: if the moon was fully lassoed, miss-spam alone must not flip to fail
    if (!completed) {
      G.outcome = "fail";
      AudioEngine.sfx("lose");
      burst(G.moon.x, G.moon.y, "#FF2A6D", 22, 70);
    } else if (s >= 85 && qs >= 85) {
      G.outcome = "perfect";
      AudioEngine.sfx("win");
      burst(G.moon.x, G.moon.y, "#FFD166", 32, 80);
      G.flash = 0.55;
    } else {
      G.outcome = "close";
      AudioEngine.sfx("win");
      burst(G.moon.x, G.moon.y, "#6FCF97", 20, 55);
    }
    saveBest();
    fillResult();
    setTimeout(() => setState("result"), 900);
  }

  function nextStopPlan() {
    const cleared = G.outcome === "close" || G.outcome === "perfect";
    // fail / daily stay put — never yank a player mid-ladder without a clear
    if (!cleared || G.dailyMode) {
      return {
        label: G.dailyMode ? "再来一局 · 竞速" : "再来一局",
        diff: G.diff,
        daily: !!G.dailyMode,
        upgrade: false,
      };
    }
    if (G.diff === "easy") {
      return { label: "挑战宇宙冒险", diff: "normal", daily: false, upgrade: true };
    }
    if (G.diff === "normal") {
      return { label: "挑战坠入虚空", diff: "hard", daily: false, upgrade: true };
    }
    if (G.diff === "hard") {
      return { label: "挑战月之暗面", diff: "blood", daily: false, upgrade: true };
    }
    return { label: "再来一局 · 月之暗面", diff: "blood", daily: false, upgrade: false };
  }

  function applyNextStop() {
    const plan = G.nextStop || { diff: G.diff, daily: G.dailyMode };
    if (plan.diff && plan.diff !== G.diff) {
      G.diff = clampDiff(plan.diff);
      Store.data.diff = G.diff;
      Store.save();
    }
    G.dailyMode = !!plan.daily;
    if (plan.upgrade) showToast(`难度 · ${DIFF[G.diff]?.label || G.diff}`);
    AudioEngine.resume();
    resetRun();
    setState("play");
  }

  function fillResult() {
    const end = ENDINGS[G.outcome] || ENDINGS.fail;
    el.resultTitle.textContent = end.title;
    el.resultTitle.style.color = end.color;
    el.resultDesc.textContent = end.desc;

    G.nextStop = nextStopPlan();
    if (el.btnRetry) el.btnRetry.textContent = G.nextStop.label;

    const p = G.parts || { ms: massScore(), ds: distScore(), qs: G.qte ? qteScore() : 0 };
    const q = G.qte;
    const grade = (v) => (v >= 80 ? "gold" : v >= 50 ? "ok" : "bad");
    const rows = [
      ["总分", String(Math.round(G.score)), grade(G.score)],
      ["质量", `${Math.round(G.earth.mass)} · ${Math.round(p.ms)}`, grade(p.ms)],
      ["追近", `${Math.round(G.progress * 100)}% · ${Math.round(p.ds)}`, grade(p.ds)],
      [
        "QTE",
        q ? `锁${q.locks}/${q.need} P${q.perfect}/G${q.good}/M${q.miss}` : "未进入捕获",
        grade(p.qs),
      ],
    ];
    if (G.clearT != null) {
      rows.push(["用时", fmtTime(G.clearT), G.newPB ? "gold" : ""]);
      const pb = Store.data.pb[G.diff];
      if (pb) rows.push(["纪录", (G.newPB ? "新纪录 " : "最佳 ") + fmtTime(pb), G.newPB ? "gold" : ""]);
      if (G.dailyMode) {
        const bt = Store.data.daily.bestTime;
        if (bt) rows.push(["今日最佳", fmtTime(bt), G.newDailyTime ? "gold" : ""]);
      }
    }
    if (G.lastBest) rows.push(["最佳", String(G.lastBest.score), ""]);
    if (G.diff) rows.push(["难度", DIFF[G.diff].label + (G.dailyMode ? " · 竞速" : ""), ""]);
    if (G.failReason && G.outcome === "fail" && !q) rows.push(["原因", G.failReason, "bad"]);

    el.resultStats.innerHTML = rows
      .map(([k, v, c]) => `<li><span class="k">${k}</span><span class="v ${c || ""}">${v}</span></li>`)
      .join("");

    const rankTxt = G.rank > 0 ? `本机榜 #${G.rank} · 共 ${Store.data.board.length} 条` : "";
    const nextTxt = G.nextStop.upgrade
      ? `下一站 · ${DIFF[G.nextStop.diff]?.label || ""}`
      : "";
    el.rankLine.textContent = [rankTxt, nextTxt].filter(Boolean).join("　");
  }

  function refreshTitleUI() {
    if (el.btnSound) {
      const on = AudioEngine.enabled;
      // 自愈：LED/span 结构丢失时重建（历史版本 boot 曾清空按钮内容）
      if (!el.btnSound.querySelector(".led") || !el.btnSound.querySelector("span")) {
        el.btnSound.innerHTML = '<i class="led" aria-hidden="true"></i><span></span>';
      }
      el.btnSound.setAttribute("aria-label", on ? "声音：开" : "声音：关");
      el.btnSound.querySelector("span").textContent = on ? "声音：开" : "声音：关";
      el.btnSound.querySelector(".led").classList.toggle("on", on);
    }
    if (el.telEarth) el.telEarth.textContent = `CLASS ${DIFF[G.diff]?.label || "追寻之旅"}`;
    if (el.telWell) el.telWell.textContent = `PULL ×${DIFF[G.diff]?.wellMul ?? 1}`;
    if (el.diffDial) {
      const maxIdx = LADDER.indexOf(maxUnlockedDiff());
      el.diffDial.querySelectorAll("button").forEach((b) => {
        const i = LADDER.indexOf(b.dataset.diff);
        b.classList.toggle("locked", i > maxIdx);
        b.classList.toggle("sel", b.dataset.diff === G.diff);
      });
    }
    if (el.btnRace) {
      const led = el.btnRace.querySelector(".led");
      if (led) led.classList.toggle("on", menuDaily);
      el.btnRace.setAttribute("aria-pressed", menuDaily ? "true" : "false");
    }
    if (el.btnStart) el.btnStart.textContent = menuDaily ? "开始竞速" : "开始追逐";
    if (el.dailyTip) {
      el.dailyTip.textContent = "追寻月亮的光辉，它会带你找到方向";
    }
  }

  function fillBoard() {
    const list = (Store.data && Store.data.board) || [];
    if (!list.length) {
      el.boardList.innerHTML = `<li class="empty">还没有成绩，先跑一局</li>`;
    } else {
      el.boardList.innerHTML = list
        .map((e, i) => {
          const end = ENDINGS[e.ending] || ENDINGS.fail;
          const tag = e.daily ? " · 竞速" : "";
          const timeTxt = e.time != null ? ` · ${fmtTime(e.time)}` : "";
          return `<li>
            <span class="r">#${i + 1}</span>
            <span class="n" style="color:${end.color}">${end.title}${tag} · ${DIFF[e.diff]?.label || ""}${timeTxt}</span>
            <span class="s">${e.score}</span>
          </li>`;
        })
        .join("");
    }
    const day = Store.data.daily || {};
    el.dailyBoard.textContent =
      day.date === todayKey() && day.bestTime
        ? `今日竞速最佳：${fmtTime(day.bestTime)}（本机）`
        : `今日竞速尚未开始 · ${todayKey()}`;
  }

  function shareText() {
    const end = ENDINGS[G.outcome] || ENDINGS.fail;
    const q = G.qte;
    const qtxt = q ? `QTE P${q.perfect}/G${q.good}/M${q.miss} 连击×${q.bestCombo}` : "未捕获";
    return [
      `【逐月计划】${end.title} · ${Math.round(G.score)}分`,
      G.clearT != null ? `用时 ${fmtTime(G.clearT)}${G.newPB ? " · 新纪录" : ""}` : "",
      `质量${Math.round(G.earth?.mass || 0)} · 追近${Math.round(G.progress * 100)}%`,
      qtxt,
      G.rank ? `本机榜 #${G.rank}` : "",
      G.dailyMode ? `今日竞速 ${todayKey()}` : `难度 ${DIFF[G.diff]?.label || ""}`,
      "系统截屏这张卡，来比谁先追回月亮",
    ]
      .filter(Boolean)
      .join("\n");
  }

  // XHS 容器禁用 clipboard / execCommand → 改为展示可选中文案，用户长按复制
  function showShareText() {
    const node = el.shareText;
    if (!node) return;
    node.textContent = shareText();
    node.classList.remove("hidden");
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(node);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}
    showToast("已全选，长按复制文案");
  }

  /** Full-screen share card — no download (XHS container bans a[download]) */
  function drawShareCard() {
    const c = el.cardCanvas;
    const g = c.getContext("2d");
    const w = c.width;
    const h = c.height;
    const end = ENDINGS[G.outcome] || ENDINGS.fail;
    const q = G.qte;
    const p = G.parts || { ms: 0, ds: 0, qs: 0 };

    g.fillStyle = "#070A14";
    g.fillRect(0, 0, w, h);

    // stars
    for (let i = 0; i < 80; i++) {
      const x = (i * 97) % w;
      const y = (i * 53) % h;
      g.fillStyle = i % 5 === 0 ? "#F0E6D3" : "#3A4A6B";
      g.fillRect(x, y, 2, 2);
    }

    // frame
    g.strokeStyle = end.color;
    g.lineWidth = 4;
    g.strokeRect(18, 18, w - 36, h - 36);

    g.textAlign = "center";
    g.fillStyle = "#FFD166";
    g.font = "bold 28px 'Geist Mono', monospace";
    g.fillText("逐月计划", w / 2, 78);

    g.fillStyle = end.color;
    g.font = "bold 42px 'Geist Mono', monospace";
    g.fillText(end.title, w / 2, 150);

    g.fillStyle = "#F0E6D3";
    g.font = "bold 64px 'Geist Mono', monospace";
    g.fillText(String(Math.round(G.score)), w / 2, 230);

    g.fillStyle = "#8B9BB8";
    g.font = "22px 'Geist Mono', monospace";
    if (G.clearT != null) {
      g.fillStyle = "#E8C878";
      g.fillText(`用时 ${fmtTime(G.clearT)}${G.newPB ? " · 新纪录" : ""}`, w / 2, 258);
      g.fillStyle = "#8B9BB8";
    }
    g.fillText(`质量 ${Math.round(G.earth?.mass || 0)} · 追近 ${Math.round(G.progress * 100)}%`, w / 2, 292);
    g.fillText(
      q ? `QTE ${q.perfect}/${q.good}/${q.miss} ×${q.bestCombo}` : "未进入捕获",
      w / 2,
      330
    );

    // mini bars
    const barY = 360;
    const drawBar = (y, val, color, label) => {
      g.fillStyle = "#3A4A6B";
      g.fillText(label, 100, y + 8);
      g.fillStyle = "#15203D";
      g.fillRect(160, y - 10, 280, 18);
      g.fillStyle = color;
      g.fillRect(160, y - 10, 280 * clamp(val, 0, 1), 18);
    };
    g.font = "20px 'Geist Mono', monospace";
    drawBar(barY, p.ms / 100, "#3D8B6E", "质量");
    drawBar(barY + 40, p.ds / 100, "#C5D0E6", "追近");
    drawBar(barY + 80, p.qs / 100, "#FFD166", "捕获");

    g.fillStyle = "#8B9BB8";
    g.font = "20px 'Geist Mono', monospace";
    const meta = [
      `${DIFF[G.diff]?.label || ""}${G.dailyMode ? " · 今日竞速" : ""}`,
      todayKey(),
      G.rank ? `本机榜 #${G.rank}` : "",
    ].filter(Boolean);
    meta.forEach((line, i) => g.fillText(line, w / 2, 560 + i * 32));

    g.fillStyle = "#3A4A6B";
    g.font = "18px 'Geist Mono', monospace";
    g.fillText("系统截屏分享 · 本机成绩", w / 2, h - 56);
  }

  function distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = clamp(t, 0, 1);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function bloodHitEarth(kind) {
    const e = G.earth;
    if (!e || !e.alive || e.invuln > 0) return;
    e.mass = Math.max(PHYS.massMin, e.mass - BLOOD.massHit);
    G.progress = clamp(G.progress - BLOOD.progHit, 0, 1);
    e.invuln = 0.55;
    e.hitFlash = 0.4;
    e.pickupPop = -0.12;
    G.shake = G.reduceMotion ? 0 : 10;
    G.flash = 0.16;
    AudioEngine.sfx("hit");
    burst(e.x, e.y, "#FF2A6D", 16, 65);
    burst(e.x, e.y, "#D97B3A", 8, 40);
    if (e.mass < PHYS.massMin + 2) lose(kind === "shock" ? "被月蚀冲击撕裂" : "被潮汐刺贯穿");
  }

  function updateBlood(dt) {
    if (!G.blood || G.state !== "play") return;
    const e = G.earth;
    if (!e || !e.alive) return;
    const b = G.blood;
    const sec = sectorOf(G.progress);
    const mx = G.moon.x;
    const my = G.moon.y;

    // ── tidal spike: warn line through player, then fire ──
    if (!b.spike) {
      b.spikeT -= dt;
      if (b.spikeT <= 0) {
        const ang = Math.atan2(e.y - my, e.x - mx);
        const len = 280;
        b.spike = {
          x1: mx,
          y1: my,
          x2: mx + Math.cos(ang) * len,
          y2: my + Math.sin(ang) * len,
          t: 0,
          warn: BLOOD.spikeWarn,
          live: BLOOD.spikeLive,
          hit: false,
        };
      }
    } else {
      const s = b.spike;
      s.t += dt;
      if (s.t < s.warn) {
        // aim locks at spawn so player can strafe off
      } else if (s.t < s.warn + s.live) {
        if (!s.hit) {
          const d = distToSeg(e.x, e.y, s.x1, s.y1, s.x2, s.y2);
          if (d < e.r + BLOOD.spikeHalf) {
            s.hit = true;
            bloodHitEarth("spike");
          }
        }
      } else {
        b.spike = null;
        b.spikeT = BLOOD.spikeCd[sec] * (0.85 + Math.random() * 0.35);
      }
    }

    // ── expanding shock ring from a frozen origin ──
    if (!b.shock) {
      b.shockT -= dt;
      if (b.shockT <= 0) {
        b.shock = {
          x: e.x,
          y: e.y,
          t: 0,
          warn: BLOOD.shockWarn,
          live: BLOOD.shockLive,
          hit: false,
        };
      }
    } else {
      const k = b.shock;
      k.t += dt;
      if (k.t >= k.warn && k.t < k.warn + k.live) {
        const u = (k.t - k.warn) / k.live;
        const r = u * BLOOD.shockMaxR;
        if (!k.hit) {
          const d = Math.hypot(e.x - k.x, e.y - k.y);
          if (Math.abs(d - r) < BLOOD.shockThick + e.r * 0.35) {
            k.hit = true;
            bloodHitEarth("shock");
          }
        }
      } else if (k.t >= k.warn + k.live) {
        b.shock = null;
        b.shockT = BLOOD.shockCd[sec] * (0.85 + Math.random() * 0.35);
      }
    }
  }

  function drawBlood() {
    if (!G.blood) return;
    const b = G.blood;
    const e = G.earth;

    if (b.spike) {
      const s = b.spike;
      const live = s.t >= s.warn;
      ctx.save();
      if (!live) {
        const a = 0.25 + 0.45 * (s.t / s.warn);
        ctx.strokeStyle = `rgba(255,42,109,${a})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
      } else {
        ctx.strokeStyle = "rgba(255,42,109,0.9)";
        ctx.lineWidth = BLOOD.spikeHalf * 1.6;
        ctx.globalAlpha = 0.55;
      }
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      if (live) {
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = "#FFD166";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    if (b.shock) {
      const k = b.shock;
      const live = k.t >= k.warn;
      const r = live ? ((k.t - k.warn) / k.live) * BLOOD.shockMaxR : 4 + (k.t / k.warn) * 10;
      ctx.save();
      ctx.strokeStyle = live ? "rgba(217,123,58,0.85)" : "rgba(255,42,109,0.45)";
      ctx.lineWidth = live ? BLOOD.shockThick : 1.5;
      if (!live) ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(k.x, k.y, Math.max(2, r), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // blood rim on moon during play
    if (G.state === "play" && G.moon) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,42,109,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(G.moon.x, G.moon.y, (G.moon.r || 16) + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (e && e.invuln > 0.35) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = "#FF2A6D";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  function beginRun(daily) {
    G.dailyMode = !!daily;
    AudioEngine.resume();
    setState("intro");
  }

  function updatePlay(dt) {
    const e = G.earth;
    if (!e.alive) {
      updateParticles(dt);
      return;
    }

    AudioEngine.resume();
    e.angle += dt * (0.35 + e.vx * 0.008);

    let ax = Input.ax;
    let ay = Input.ay;
    const mag = Math.hypot(ax, ay);
    if (mag < 0.12) {
      ax = 0;
      ay = 0;
    } else if (mag > 1) {
      ax /= mag;
      ay /= mag;
    }

    const massFac = lerp(1.1, 0.88, (e.mass - PHYS.massMin) / (PHYS.massMax - PHYS.massMin));
    const sticky = G.wellSticky > 0 ? 0.72 : 1;
    const maxS = PHYS.maxSpeed * massFac * sticky * (e.jetT > 0 ? 1.25 : 1);

    e.jetCd = Math.max(0, e.jetCd - dt);
    e.jetT = Math.max(0, e.jetT - dt);
    if (Input.jetPressed) {
      Input.jetPressed = false;
      if (e.jetCd <= 0 && e.mass > PHYS.massMin + 1) {
        e.jetT = PHYS.jetDuration;
        e.jetCd = PHYS.jetCooldown;
        e.mass = Math.max(PHYS.massMin, e.mass - PHYS.jetMassCost);
        AudioEngine.sfx("jet");
        burst(e.x, e.y + e.r, "#FFD166", 12, 55);
        // immediate kick in stick (or velocity) direction — snappier burst
        let jx = ax;
        let jy = ay;
        if (Math.hypot(jx, jy) < 0.15) {
          const n0 = Math.hypot(e.vx, e.vy) || 1;
          jx = e.vx / n0;
          jy = e.vy / n0;
        } else {
          const m0 = Math.hypot(jx, jy);
          jx /= m0;
          jy /= m0;
        }
        e.vx += jx * 55;
        e.vy += jy * 55;
        if (!G.reduceMotion) G.shake = 2.5;
      }
    }

    // tight velocity targeting — less float than accel+drag
    // jet no longer loosens steering: dodge while boosting should stay snappy
    const k = 1 - Math.exp(-PHYS.steer * dt);
    const tvx = ax * maxS;
    const tvy = ay * maxS;
    e.vx += (tvx - e.vx) * k;
    e.vy += (tvy - e.vy) * k;
    if (e.jetT > 0) {
      const n = Math.hypot(e.vx, e.vy) || 1;
      e.vx += (e.vx / n) * PHYS.jetAccel * dt * 0.55;
      e.vy += (e.vy / n) * PHYS.jetAccel * dt * 0.55;
      const sp0 = Math.hypot(e.vx, e.vy);
      const cap = maxS * 1.35;
      if (sp0 > cap) {
        e.vx = (e.vx / sp0) * cap;
        e.vy = (e.vy / sp0) * cap;
      }
    }

    let pulled = false;
    for (const b of G.bodies) {
      if (b.type !== "well") continue;
      const p = projectBody(b);
      const rr = Math.max(10, b.r * p.scale);
      const d2 = dist2(e.x, e.y, p.sx, p.sy);
      const d = Math.sqrt(d2) || 1;
      // interact while approaching and nearly arrived
      if (b.z < 0.3 && d < rr * b.killR) {
        lose("被黑暗天体吞没");
        return;
      }
      if (b.z < 0.68 && d < rr * 3.4) {
        const f = (b.pull / (d2 + 60)) * clamp(1 - d / (rr * 3.4), 0, 1) * p.scale;
        e.vx += ((p.sx - e.x) / d) * f * dt * 42;
        e.vy += ((p.sy - e.y) / d) * f * dt * 42;
        // lingering in the gravity well tears mass away
        if (b.z < 0.4 && d < rr * 2.2) {
          e.mass = Math.max(PHYS.massMin, e.mass - 2.8 * dt);
        }
        pulled = true;
      }
    }

    // well pull: sticky inertia so escaping feels earned
    if (pulled) {
      e.vx *= 1 - 1.55 * dt;
      e.vy *= 1 - 1.55 * dt;
      G.wellSticky = 0.45;
    } else if (G.wellSticky > 0) {
      G.wellSticky = Math.max(0, G.wellSticky - dt);
    }

    const sp = Math.hypot(e.vx, e.vy);
    const hardCap = maxS * 1.55;
    if (sp > hardCap) {
      e.vx = (e.vx / sp) * hardCap;
      e.vy = (e.vy / sp) * hardCap;
    }

    e.x += e.vx * dt;
    e.y += e.vy * dt;

    const pad = e.r + 4;
    if (e.x < pad) {
      e.x = pad;
      e.vx = Math.abs(e.vx) * 0.4;
    }
    if (e.x > W - pad) {
      e.x = W - pad;
      e.vx = -Math.abs(e.vx) * 0.4;
    }
    if (e.y < 56) {
      e.y = 56;
      e.vy = Math.abs(e.vy) * 0.4;
    }
    if (e.y > H - 56) {
      e.y = H - 56;
      e.vy = -Math.abs(e.vy) * 0.55;
      // camping the bottom void drains mass; death comes from 质量归零, not an invisible wall
      e.mass -= 4.5 * dt;
    }

    e.hitFlash = Math.max(0, e.hitFlash - dt);
    e.invuln = Math.max(0, e.invuln - dt);
    e.pickupT = Math.max(0, (e.pickupT || 0) - dt);
    e.pickupPop = (e.pickupPop || 0) * Math.exp(-14 * dt);

    for (const b of G.bodies) {
      if (b.type === "well") continue;
      if (e.invuln > 0 && b.hard) continue;
      if (b.z > 0.32 || b.z < -0.05) continue;
      const p = projectBody(b);
      // soft bodies: fat vacuum radius; rocks: tight but still fair
      const pad = b.type === "signal" ? 30 : b.hard ? 12 : 26;
      const rr = e.r + b.r * p.scale + pad;
      if (dist2(e.x, e.y, p.sx, p.sy) > rr * rr) continue;

      if (b.hard) {
        if (e.invuln > 0) continue;
        const sec = SECTORS[sectorOf(G.progress)];
        const hurt = sec.rockHurt;
        // rocks always cost mass — random +mass muddied the punish signal
        e.mass = clamp(e.mass - Math.abs(b.massDelta) * hurt, PHYS.massMin, PHYS.massMax);
        const dx = e.x - p.sx;
        const dy = e.y - p.sy;
        const d = Math.hypot(dx, dy) || 1;
        e.vx += (dx / d) * 120 * hurt;
        e.vy += (dy / d) * 120 * hurt;
        e.invuln = 0.7;
        e.hitFlash = 0.4;
        e.pickupPop = -0.12;
        G.shake = G.reduceMotion ? 0 : 9;
        if (!G.reduceMotion) G.hitStop = 0.08;
        G.flash = 0.12;
        AudioEngine.sfx("hit");
        burst(p.sx, p.sy, "#FF2A6D", 16, 70);
        burst(p.sx, p.sy, "#8B9BB8", 10, 48);
        G.progress = clamp(G.progress - PROG.hitPenalty * hurt, 0, 1);
        b.dead = true;
        if (e.mass < PHYS.massMin + 2) {
          // 同帧进度满格与致命撞击竞争时，让进度赢（别让玩家看到 100% 判负）
          if (G.progress >= 1) {
            enterDiscover();
          } else {
            lose("质量崩溃 · 星尘难继");
          }
          return;
        }
      } else if (b.type === "signal") {
        G.progress = clamp(G.progress + PROG.signal, 0, 1);
        e.pickupT = 0.28;
        e.pickupPop = 0.16;
        if (!G.reduceMotion) G.hitStop = 0.035;
        G.shake = G.reduceMotion ? 0 : 2;
        G.flash = 0.18;
        AudioEngine.sfx("eat");
        AudioEngine.sfx("qte_good");
        burst(p.sx, p.sy, "#FFD166", 14, 55);
        burst(e.x, e.y, "#FFD166", 6, 30);
        b.dead = true;
      } else {
        e.mass = clamp(e.mass + b.massDelta, PHYS.massMin, PHYS.massMax);
        e.pickupT = 0.2;
        e.pickupPop = 0.1;
        AudioEngine.sfx("eat");
        burst(p.sx, p.sy, "#E8EEF7", 8, 36);
        burst(e.x, e.y, "#5B9BD5", 4, 22);
        b.dead = true;
      }
    }
    G.bodies = G.bodies.filter((b) => !b.dead);

    G.progress = clamp(G.progress + PROG.idle * dt, 0, 1);

    // moon sits at vanishing-point depth — grows as you close in
    const mz = lerp(0.92, 0.12, easeOut(G.progress));
    const mt = 1 - mz;
    G.moon.x = VIEW.vx + (e.x - VIEW.vx) * mt * 0.35;
    G.moon.y = VIEW.vy + (e.y - VIEW.vy) * mt * 0.22 - 6 * mt;
    G.moon.r = lerp(14, 32, easeOut(Math.min(1, G.progress * 1.15)));
    G.moonDim = 0.3 + 0.7 * G.progress;
    G.moonZ = mz;

    if (G.progress >= 1) {
      enterDiscover();
      return;
    }
    if (e.mass <= PHYS.massMin) {
      lose("质量归零 · 航体消散");
      return;
    }

    // sector climb — visible difficulty loop inside one run
    const secId = sectorOf(G.progress);
    if (secId !== G.sector) {
      G.sector = secId;
      const sec = SECTORS[secId];
      showToast(`进入 ${sec.name}`);
      AudioEngine.sfx(secId === 2 ? "omen" : "click");
      G.flash = 0.2;
    }
    if (el.hudPhase) el.hudPhase.textContent = SECTORS[G.sector].name;

    updateSpawning(dt);
    updateBlood(dt);
    updateParticles(dt);

    const mPct = ((e.mass - PHYS.massMin) / (PHYS.massMax - PHYS.massMin)) * 100;
    const dPct = G.progress * 100;
    if (el.massSeg) {
      const on = Math.round((mPct / 100) * 10);
      [...el.massSeg.children].forEach((n, i) => n.classList.toggle("on", i < on));
    }
    if (el.distSeg) {
      const on = Math.round((dPct / 100) * 10);
      [...el.distSeg.children].forEach((n, i) => n.classList.toggle("on", i < on));
    }
  }

  // ── Cutscene update ────────────────────────────────────
  function updateIntro(dt) {
    if (!G.cine) return;
    const c = G.cine;
    c.t += dt;
    c.sceneT += dt;

    let acc = 0;
    let beat = 0;
    let local = c.t;
    for (let i = 0; i < CUTSCENE.length; i++) {
      if (c.t < acc + CUTSCENE[i].t) {
        beat = i;
        local = c.t - acc;
        break;
      }
      acc += CUTSCENE[i].t;
      beat = CUTSCENE.length;
    }

    if (beat !== c.beat) {
      c.beat = beat;
      c.sceneT = 0;
      const b = CUTSCENE[beat];
      if (b) {
        el.introCaption.classList.remove("show");
        el.introCaption.textContent = b.text;
        requestAnimationFrame(() => el.introCaption.classList.add("show"));
        if (b.scene === "omen") AudioEngine.sfx("omen");
      }
    } else if (c.beat === 0 && c.sceneT < 0.05 && !el.introCaption.textContent) {
      el.introCaption.textContent = CUTSCENE[0].text;
      el.introCaption.classList.add("show");
    }

    if (beat >= CUTSCENE.length) startRun();
  }

  // ── Drawing: sprites — flat poster / stipple ───────────
  function px(x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0));
  }

  /** Flat geometric Earth — sprite from reference when available */
  function drawEarth(e, opts = {}) {
    if (!e || e.alive === false) return;
    const x = e.x;
    const y = e.y;
    const pop = e.pickupPop || 0;
    const r = Math.max(8, e.r * (1 + pop));
    const hit = e.hitFlash > 0;

    if (ART.earth && !hit) {
      drawImg(ART.earth, x, y, r * 2.35, r * 2.35, e.angle * 0.15);
    } else {
      ctx.fillStyle = hit ? "#8B2E3E" : "#3D8B7A";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#F0E6D3";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (e.pickupT > 0) {
      const t = e.pickupT / 0.18;
      ctx.globalAlpha = t * 0.9;
      ctx.strokeStyle = "#E8C878";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.arc(x, y, r + (1 - t) * 14 + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    if (e.jetT > 0) {
      const n = Math.hypot(e.vx, e.vy) || 1;
      const fx = -(e.vx / n);
      const fy = -(e.vy / n);
      ctx.fillStyle = "#D97B3A";
      ctx.beginPath();
      ctx.moveTo(x + fx * (r + 1), y + fy * (r + 1));
      ctx.lineTo(x + fx * (r + 10) + fy * 4, y + fy * (r + 10) - fx * 4);
      ctx.lineTo(x + fx * (r + 10) - fy * 4, y + fy * (r + 10) + fx * 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#E8C878";
      ctx.beginPath();
      ctx.moveTo(x + fx * (r + 1), y + fy * (r + 1));
      ctx.lineTo(x + fx * (r + 6) + fy * 2, y + fy * (r + 6) - fx * 2);
      ctx.lineTo(x + fx * (r + 6) - fy * 2, y + fy * (r + 6) + fx * 2);
      ctx.closePath();
      ctx.fill();
    }

    if (opts.orbit) {
      ctx.strokeStyle = "rgba(212,168,75,0.55)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.ellipse(x, y, r * 2.3, r * 0.72, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawMoon(m) {
    const { x, y, r } = m;
    const dim = G.moonDim === undefined ? 1 : G.moonDim;
    ctx.globalAlpha = clamp(dim, 0.25, 1);
    // 月之暗面（blood）用旧版惨白坑洞月；其余档全局金色圆月
    const art = G.diff === "blood" && ART.moonDark ? ART.moonDark : ART.moon;
    if (art) {
      drawImg(art, x, y, r * 2.45, r * 2.45);
    } else {
      ctx.fillStyle = "#E8C878";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#F0E6D3";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (r > 14) {
      ctx.strokeStyle = "rgba(240,230,211,0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.7, r * 0.55, 0.15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  }

  function drawWell(b) {
    const { x, y, r, ph } = b;
    if (ART.well) {
      drawImg(ART.well, x, y, r * 3.4, r * 2.2, ph * 0.08);
      return;
    }
    for (let i = 3; i >= 1; i--) {
      ctx.strokeStyle = i === 3 ? "#F0E6D3" : i === 2 ? "#D4A84B" : "#8B2E3E";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y, r * (1.15 + i * 0.32), r * (0.38 + i * 0.12), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#05080E";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRock(b) {
    const { x, y, r, hard, ph, seed } = b;
    if (b.type === "signal") {
      if (ART.signal) {
        drawImg(ART.signal, x, y, r * 3.2, r * 3.2);
        return;
      }
      ctx.fillStyle = "#E8C878";
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.75, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.75, y);
      ctx.closePath();
      ctx.fill();
      return;
    }
    if (hard) {
      if (ART.rock) {
        drawImg(ART.rock, x, y, r * 3.1, r * 3.1, (ph || 0) * 0.2 + (seed || 0));
        return;
      }
    } else {
      // pebble — small cream disc (no dedicated sprite)
      ctx.fillStyle = "#F0E6D3";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#C5B89A";
      ctx.beginPath();
      ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0E1C2C";
      ctx.lineWidth = 1;
      ctx.stroke();
      return;
    }
    // vector fallback hard rock
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ph * 0.25 + (seed || 0));
    ctx.fillStyle = "#6B6560";
    ctx.beginPath();
    ctx.moveTo(-r, -r * 0.25);
    ctx.lineTo(-r * 0.35, -r);
    ctx.lineTo(r * 0.55, -r * 0.75);
    ctx.lineTo(r, r * 0.25);
    ctx.lineTo(r * 0.25, r);
    ctx.lineTo(-r * 0.65, r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#8B2E3E";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  /** Perspective dashed corridor from vanishing point */
  function drawDarkTendril() {
    if (G.state !== "play" && G.state !== "qte" && G.state !== "intro" && G.state !== "discover" && G.state !== "title")
      return;
    if (G.state === "play" || G.state === "discover") {
      const vx = VIEW.vx;
      const vy = VIEW.vy + 8;
      const cols = 5;
      for (let i = 0; i < cols; i++) {
        const bx = W * (0.08 + (i / (cols - 1)) * 0.84);
        const alpha = 0.2 + (i === 2 ? 0.15 : 0);
        dashedLine(vx, vy, bx, H + 10, `rgba(240,230,211,${alpha})`, 5, 5, 1);
      }
      // depth ticks
      for (let i = 1; i <= 4; i++) {
        const t = i / 5;
        const y = vy + (H - vy) * t;
        const half = 20 + t * 90;
        dashedLine(vx - half, y, vx + half, y, "rgba(212,168,75,0.22)", 2, 3, 1);
      }
    }
  }

  /** Opening legend: small sprites + short names, not jargon */
  function drawRunLegend() {
    const a = clamp(Math.min(G.runT / 0.35, (6.5 - G.runT) / 0.8), 0, 1);
    if (a <= 0) return;
    const x0 = 22;
    const y0 = H * 0.36;
    const w = W - 44;
    const h = 138;
    ctx.save();
    ctx.globalAlpha = a * 0.94;
    ctx.fillStyle = "rgba(14,28,44,0.88)";
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = "#D4A84B";
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const rows = [
      {
        kind: "signal",
        name: "月辉",
        desc: "金色光辉昭示踪迹，触碰则追近月亮",
        color: "#E8C878",
      },
      {
        kind: "dust",
        name: "月尘",
        desc: "补充质量；越重越稳，航速更慢",
        color: "#F0E6D3",
      },
      {
        kind: "rock",
        name: "陨石",
        desc: "撞上会掉质量、丢进度——躲开",
        color: "#FF2A6D",
      },
      {
        kind: "well",
        name: "黑洞",
        desc: "黑暗天体，靠近会被拽走——绕开",
        color: "#8B2E3E",
      },
    ];

    rows.forEach((r, i) => {
      const y = y0 + 22 + i * 30;
      // icon plate
      ctx.fillStyle = "rgba(11,21,32,0.65)";
      ctx.fillRect(x0 + 10, y - 10, 22, 22);
      ctx.strokeStyle = "rgba(240,230,211,0.25)";
      ctx.strokeRect(x0 + 10.5, y - 9.5, 21, 21);

      const ix = x0 + 21;
      const iy = y + 1;
      if (r.kind === "signal" && ART.signal) {
        drawImg(ART.signal, ix, iy, 16, 16, 0);
      } else if (r.kind === "signal") {
        ctx.fillStyle = "#E8C878";
        ctx.beginPath();
        ctx.arc(ix, iy, 5, 0, Math.PI * 2);
        ctx.fill();
      } else if (r.kind === "dust") {
        ctx.fillStyle = "#F0E6D3";
        ctx.fillRect(ix - 4, iy - 4, 8, 8);
        ctx.fillStyle = "#C5D0E6";
        ctx.fillRect(ix - 1, iy - 1, 3, 3);
      } else if (r.kind === "well") {
        if (ART.well) drawImg(ART.well, ix, iy, 18, 12, 0);
        else {
          ctx.fillStyle = "#05080E";
          ctx.beginPath();
          ctx.arc(ix, iy, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#8B2E3E";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(ix, iy, 8.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (ART.rock) {
        drawImg(ART.rock, ix, iy, 16, 16, 0.4);
      } else {
        ctx.fillStyle = "#8B9BB8";
        ctx.beginPath();
        ctx.moveTo(ix, iy - 6);
        ctx.lineTo(ix + 6, iy + 4);
        ctx.lineTo(ix - 5, iy + 5);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = r.color;
      ctx.font = "bold 11px 'Geist Mono', monospace";
      ctx.fillText(r.name, x0 + 42, y - 4);
      ctx.fillStyle = "#C5B89A";
      ctx.font = "9px 'Geist Mono', monospace";
      ctx.fillText(r.desc, x0 + 42, y + 8);
    });

    ctx.restore();
    ctx.textBaseline = "alphabetic";
  }

  function drawQTE() {
    const q = G.qte;
    if (!q) return;
    const ex = G.earth ? G.earth.x : W * 0.5;
    const ey = G.earth ? G.earth.y : H * 0.62;
    const R = q.ringR || QTE.ringR;

    el.btnQte.classList.toggle("ready", !!q.ready);

    // capture light ring (lasso)
    ctx.strokeStyle = q.ready ? "#E8C878" : "rgba(240,230,211,0.55)";
    ctx.lineWidth = q.ready ? 3.5 : 2.5;
    ctx.beginPath();
    ctx.arc(ex, ey, R, 0, Math.PI * 2);
    ctx.stroke();
    // true catch zone (matches QTE.catchIn)
    ctx.strokeStyle = q.ready ? "rgba(232,200,120,0.55)" : "rgba(240,230,211,0.22)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(ex, ey, R * QTE.catchIn, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (q.ready) {
      ctx.strokeStyle = "rgba(232,200,120,0.4)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(ex, ey, R + 6 + Math.sin(q.t * 8) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // line from earth to moon when close
    const d = Math.hypot(G.moon.x - ex, G.moon.y - ey);
    if (d < R * 1.35) {
      ctx.strokeStyle = q.ready ? "rgba(232,200,120,0.55)" : "rgba(240,230,211,0.25)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(G.moon.x, G.moon.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = "#F0E6D3";
    ctx.font = "bold 12px 'Geist Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(`套住 ${q.locks}/${q.need}`, W / 2, 46);
    if (q.combo > 1) {
      ctx.fillStyle = "#FFD166";
      ctx.fillText(`连击 ×${q.combo}`, W / 2, 64);
    }
    if (q.feedbackT > 0 && q.feedback) {
      const ok = q.feedback.indexOf("套") >= 0 || q.feedback.indexOf("抓") >= 0;
      ctx.fillStyle = ok ? "#FFD166" : "#FF2A6D";
      ctx.font = "bold 13px 'Geist Mono', monospace";
      ctx.fillText(q.feedback, W / 2, 86);
    }

    if (q.tutorial > 0) {
      // soft banner only — keep moon/earth/ring visible
      ctx.fillStyle = "rgba(7,10,20,0.72)";
      ctx.fillRect(16, H * 0.12, W - 32, 58);
      ctx.strokeStyle = "#3A4A6B";
      ctx.strokeRect(16, H * 0.12, W - 32, 58);
      ctx.fillStyle = "#FFD166";
      ctx.font = "bold 13px 'Geist Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("光圈套住月亮", W / 2, H * 0.12 + 24);
      ctx.fillStyle = "#F0E6D3";
      ctx.font = "12px 'Geist Mono', monospace";
      const extra = G.diff === "blood" ? " · 首次会挣脱" : "";
      ctx.fillText(`进圈后按捕获 · 需套住 ${q.need} 次${extra}`, W / 2, H * 0.12 + 44);
    }

    if (q.ready) {
      ctx.fillStyle = "#FFD166";
      ctx.font = "bold 14px 'Geist Mono', monospace";
      ctx.fillText("现在！", G.moon.x, G.moon.y - 36);
    }
  }

  function drawDiscover() {
    const t = 1 - G.discoverT / PROG.discoverSec;
    // beam from moon to earth
    if (G.earth) {
      ctx.strokeStyle = "rgba(255,209,102,0.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(G.moon.x, G.moon.y);
      ctx.lineTo(G.earth.x, G.earth.y);
      ctx.stroke();
    }
    ctx.fillStyle = "#FFD166";
    ctx.font = "bold 16px 'Geist Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("追上月亮了！", W / 2, H * 0.18);
    ctx.fillStyle = "#F0E6D3";
    ctx.font = "11px 'Geist Mono', monospace";
    ctx.fillText("满条后光圈捕获", W / 2, H * 0.18 + 20);
    if (t > 0.5 && G.earth) {
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = "#FFD166";
      ctx.beginPath();
      ctx.arc(G.earth.x, G.earth.y, QTE.ringR * (t - 0.5) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawParticles() {
    for (const p of G.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      px(p.x, p.y, p.r, p.r, p.color);
    }
    ctx.globalAlpha = 1;
  }

  // ── Cutscene scenes ────────────────────────────────────
  function drawCutscene() {
    const c = G.cine;
    if (!c) return;
    const scene = CUTSCENE[c.beat] ? CUTSCENE[c.beat].scene : "chase";
    const local = c.sceneT;
    const t = G.t;

    // dark body — poster gravity well (no magenta fog)
    const drawDarkBody = (bx, by, br, alpha) => {
      ctx.globalAlpha = alpha;
      if (ART.well) {
        drawImg(ART.well, bx, by, br * 3.6, br * 2.3, t * 0.15);
      } else {
        // hard concentric rings + black core
        for (let i = 3; i >= 1; i--) {
          ctx.strokeStyle = i === 3 ? "#F0E6D3" : i === 2 ? "#D4A84B" : "#8B2E3E";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(bx, by, br * (1.1 + i * 0.3), br * (0.4 + i * 0.12), t * 0.2, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = "#05080E";
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#F0E6D3";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    if (scene === "orbit") {
      const p = clamp(local / CUTSCENE[0].t, 0, 1);
      const ex = W * 0.5;
      const ey = H * 0.48;
      const orb = 70 + Math.sin(t * 0.5) * 4;
      const ang = t * 0.9;
      const mx = ex + Math.cos(ang) * orb * 1.6;
      const my = ey + Math.sin(ang) * orb * 0.45;
      drawEarth({ x: ex, y: ey, r: 28, angle: t * 0.4, jetT: 0, hitFlash: 0 }, { orbit: true });
      drawMoon({ x: mx, y: my, r: 14 });
      // gentle tether
      ctx.strokeStyle = "rgba(197,208,230,0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(mx, my);
      ctx.stroke();
      ctx.globalAlpha = clamp(1 - p * 0.1, 0, 1);
    } else if (scene === "omen") {
      const p = clamp(local / CUTSCENE[1].t, 0, 1);
      const ex = W * 0.5;
      const ey = H * 0.55;
      drawEarth({ x: ex, y: ey, r: 24, angle: t * 0.3, jetT: 0, hitFlash: 0 });
      const ang = t * 0.7;
      const mx = ex + Math.cos(ang) * 90;
      const my = ey + Math.sin(ang) * 36 - 20;
      drawMoon({ x: mx, y: my, r: 13 });
      const dy = lerp(-40, 70, easeOut(p));
      drawDarkBody(W * 0.5, dy, lerp(18, 36, p), clamp(p * 1.4, 0, 1));
    } else if (scene === "pull") {
      const p = clamp(local / CUTSCENE[2].t, 0, 1);
      const ex = W * 0.42;
      const ey = H * 0.62;
      drawEarth({ x: ex, y: ey, r: 24, angle: t * 0.2, jetT: 0, hitFlash: 0 });
      const dx0 = W * 0.55;
      const dy0 = H * 0.5;
      const dx1 = W * 0.52;
      const dy1 = 90;
      const mx = lerp(dx0, dx1, easeInOut(p));
      const my = lerp(dy0, dy1, easeInOut(p));
      drawMoon({ x: mx, y: my, r: 13 });
      drawDarkBody(W * 0.5, 70, 38, 1);
      // broken tether
      if (p < 0.55) {
        ctx.strokeStyle = "rgba(255,42,109,0.55)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(ex + 20, ey - 20);
        ctx.lineTo(mx, my);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // snap particles
        for (let i = 0; i < 6; i++) {
          const a = i + t * 8;
          px(ex + 30 + Math.cos(a) * 8, ey - 40 + Math.sin(a) * 8, 2, 2, "#FFD166");
        }
      }
      if (G.reduceMotion === false) G.shake = p > 0.4 && p < 0.7 ? 3 : G.shake;
    } else {
      // chase
      const p = clamp(local / CUTSCENE[3].t, 0, 1);
      const ex = W * 0.38;
      const ey = lerp(H * 0.7, H * 0.58, easeOut(p));
      const fake = {
        x: ex,
        y: ey,
        r: 24,
        angle: t * 0.5,
        jetT: p > 0.3 ? 1 : 0,
        hitFlash: 0,
        vx: 20,
        vy: -10,
      };
      drawEarth(fake);
      const mx = lerp(W * 0.75, W * 0.55, p);
      const my = lerp(H * 0.28, H * 0.18, p);
      drawMoon({ x: mx, y: my, r: 12 });
      drawDarkBody(W * 0.6, 50, 30, 0.85);
    }
  }

  // ── Cover / Menu idle scenes ───────────────────────────
  const coverScene = document.getElementById("cover-scene");
  const coverMoon = document.getElementById("cover-moon");
  const coverMoonGlow = document.getElementById("cover-moon-glow");
  const coverOrbitEl = document.getElementById("cover-orbit");

  // cover-bg.webp geometry (1038×1878，源自 generated-1789399937244 内芯 + 向下延展星空)
  // object-fit:cover + center top，width-fit：stage_xy = image_xy * (stageW/1038)
  // 金环：心 (517,519) r=395；月亮起点角 ≈ -44.5°（与原图月位一致）
  const COVER_ORBIT = {
    cx: 517 / 1038,
    cy: 519 / 1038, // of stage WIDTH (scale is width-based)
    r: 395 / 1038,
    ang0: -0.776, // ≈ -44.5°
    period: 36,
  };

  function placeCoverMoon(angle) {
    if (!coverMoon || !coverOrbitEl) return;
    const stage = document.getElementById("stage");
    if (!stage) return;
    const w = stage.clientWidth;
    if (!w) return;
    const cx = COVER_ORBIT.cx * w;
    const cy = COVER_ORBIT.cy * w;
    const r = COVER_ORBIT.r * w;
    // sprite includes glow pad; visible disc ≈ 180/290 of sprite
    // disc should be ≈180/1038 of stage width → sprite ≈ 0.28 * w
    const moonSize = w * 0.28;
    // 新 sprite 月盘居中（tools/make_gold_moon.py 生成），无需补偿
    const DISC_DX = 0;
    const DISC_DY = 0;
    coverOrbitEl.style.left = `${cx}px`;
    coverOrbitEl.style.top = `${cy}px`;
    coverMoon.style.width = `${moonSize}px`;
    coverMoon.style.height = `${moonSize}px`;
    coverMoon.style.left = `${Math.cos(angle) * r - DISC_DX}px`;
    coverMoon.style.top = `${Math.sin(angle) * r - DISC_DY}px`;
    if (coverMoonGlow) {
      coverMoonGlow.style.display = "none";
    }
  }

  function updateCoverOrbit(dt) {
    G.titleOrbit += dt;
    if (!coverScene || coverScene.classList.contains("hidden")) return;
    // counterclockwise on screen (y-down): angle decreases
    const ang = COVER_ORBIT.ang0 - (G.titleOrbit / COVER_ORBIT.period) * Math.PI * 2;
    placeCoverMoon(ang);
  }

  function drawCoverPatch(dt) {
    if (!coverScene || coverScene.classList.contains("hidden")) return;
    if (G.reduceMotion) {
      placeCoverMoon(COVER_ORBIT.ang0);
      return;
    }
    updateCoverOrbit(dt);
  }

  function drawMenuField(dt) {
    G.titleOrbit += dt;
    // full-res menu art includes instrument strip — canvas stays clear
  }

  // ── Render ─────────────────────────────────────────────
  function render(dt) {
    fitCanvas();
    applyLogicalTransform();

    let ox = 0;
    let oy = 0;
    if (G.shake > 0 && !G.reduceMotion) {
      ox = rand(-G.shake, G.shake);
      oy = rand(-G.shake, G.shake);
      G.shake = Math.max(0, G.shake - dt * 22);
    }

    ctx.save();
    ctx.translate(ox, oy);

    // poster layers (full-res DOM) — canvas only draws playfield chrome
    const useCover = G.state === "cover";
    const useMenu = G.state === "title";
    if (coverScene) coverScene.classList.toggle("hidden", !useCover);
    if (menuArt) menuArt.classList.toggle("hidden", !useMenu);
    if (useCover) drawCoverPatch(dt);
    document.querySelectorAll(".cover-btn").forEach((b) => {
      b.tabIndex = useCover ? 0 : -1;
    });
    if (!useCover && document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }

    if (useCover) {
      // canvas transparent — cover-scene is the screen
      ctx.clearRect(-20, -20, W + 40, H + 40);
      drawStars(dt);
      ctx.restore();
      if (G.flash > 0) {
        ctx.globalAlpha = G.flash;
        ctx.fillStyle = "#F0E6D3";
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
        G.flash = Math.max(0, G.flash - dt * 2);
      }
      return;
    }

    if (useMenu) {
      ctx.clearRect(-20, -20, W + 40, H + 40);
      drawStars(dt);
      drawMenuField(dt);
      ctx.restore();
      return;
    }

    // playfield
    ctx.fillStyle = "#0B1520";
    ctx.fillRect(-10, -10, W + 20, H + 20);

    const inRun = G.state === "play" || G.state === "discover" || G.state === "qte";
    if (inRun) drawStipple(0.1);
    drawStars(dt);
    drawDarkTendril();

    if (G.state === "intro") {
      drawCutscene();
    } else {
      if (G.bodies.length > 6) {
        G.bodies.sort((a, b) => b.z - a.z);
      }
      ctx.imageSmoothingEnabled = true;
      for (const b of G.bodies) {
        const p = projectBody(b);
        if (p.sx < -50 || p.sx > W + 50 || p.sy < -50 || p.sy > H + 50) continue;
        ctx.save();
        ctx.translate(p.sx | 0, p.sy | 0);
        if (p.scale < 0.22) {
          const s = Math.max(2, (b.r * p.scale) | 0);
          ctx.fillStyle =
            b.type === "signal" ? "#E8C878" : b.type === "well" ? "#05080E" : "#F0E6D3";
          ctx.fillRect(-s / 2, -s / 2, s, s);
        } else {
          ctx.scale(p.scale, p.scale);
          const flat = { ...b, x: 0, y: 0 };
          if (b.type === "well") drawWell(flat);
          else drawRock(flat);
        }
        ctx.restore();
      }
      if (G.earth && G.state === "play") {
        const e = G.earth;
        const auraR = VIEW.auraBase + (e.mass - PHYS.massMin) * VIEW.auraPerMass;
        ctx.strokeStyle = "rgba(240,230,211,0.28)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(e.x, e.y, auraR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      drawMoon(G.moon);
      drawBlood();
      if (G.earth) drawEarth(G.earth);
      drawParticles();
      if (G.state === "discover") drawDiscover();
      if (G.state === "qte") drawQTE();
      if (G.state === "play" && G.runT < 6.5) {
        drawRunLegend();
      }
    }

    if (G.flash > 0) {
      ctx.globalAlpha = G.flash;
      ctx.fillStyle = "#F0E6D3";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      G.flash = Math.max(0, G.flash - dt * 2);
    }

    ctx.globalAlpha = 0.02;
    ctx.fillStyle = "#000";
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function startRun() {
    AudioEngine.resume();
    resetRun();
    setState("play");
  }

  // ── Main loop ──────────────────────────────────────────
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    G.t += dt;

    // hit-stop: freeze play logic briefly on impact / gold pickup
    if (G.hitStop > 0) {
      G.hitStop = Math.max(0, G.hitStop - dt);
      updateParticles(dt * 0.35);
      render(dt);
      requestAnimationFrame(frame);
      return;
    }

    if (G.state === "intro") updateIntro(dt);
    else if (G.state === "play" || G.state === "discover" || G.state === "qte") {
      G.runT += dt; // 竞速计时：play+discover+qte 全程
      if (G.state === "play") updatePlay(dt);
      else if (G.state === "discover") updateDiscover(dt);
      else updateQTE(dt);
      if (el.hudTimer) {
        const showT = G.dailyMode && G.state !== "discover";
        el.hudTimer.classList.toggle("hidden", !showT);
        if (showT) el.hudTimer.textContent = fmtTime(G.runT);
      }
    } else updateParticles(dt);

    render(dt);
    requestAnimationFrame(frame);
  }

  // ── UI ─────────────────────────────────────────────────
  function wireUI() {
    const click = () => AudioEngine.sfx("click");

    el.btnCoverStart?.addEventListener("click", (e) => {
      e.stopPropagation();
      click();
      AudioEngine.resume();
      setState("title");
    });

    el.btnBackCover?.addEventListener("click", (e) => {
      e.stopPropagation();
      click();
      setState("cover");
    });

    el.btnStart.addEventListener("click", (e) => {
      e.stopPropagation();
      click();
      beginRun(menuDaily);
    });

    el.diffDial?.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const d = b.dataset.diff;
        const i = LADDER.indexOf(d);
        if (i > LADDER.indexOf(maxUnlockedDiff())) {
          showToast(`通关「${DIFF[LADDER[i - 1]]?.label || ""}」后解锁`);
          return;
        }
        click();
        G.diff = d;
        Store.data.diff = d;
        Store.save();
        refreshTitleUI();
      });
    });

    el.btnRace?.addEventListener("click", (e) => {
      e.stopPropagation();
      click();
      menuDaily = !menuDaily;
      refreshTitleUI();
    });

    el.btnBoard2.addEventListener("click", (e) => {
      e.stopPropagation();
      click();
      G.boardFrom = "result";
      setState("board");
    });

    el.btnBoardBack.addEventListener("click", (e) => {
      e.stopPropagation();
      click();
      setState(G.boardFrom === "result" ? "result" : "title");
    });

    el.btnCard.addEventListener("click", (e) => {
      e.stopPropagation();
      click();
      setState("card");
    });

    el.btnCardBack.addEventListener("click", (e) => {
      e.stopPropagation();
      click();
      setState("result");
    });

    el.btnCopy.addEventListener("click", (e) => {
      e.stopPropagation();
      click();
      showShareText();
    });

    el.btnSound.addEventListener("click", (e) => {
      e.stopPropagation();
      AudioEngine.resume();
      AudioEngine.setEnabled(!AudioEngine.enabled);
      Store.data.sound = AudioEngine.enabled;
      Store.save();
      refreshTitleUI();
      if (AudioEngine.enabled && G.state === "title") AudioEngine.startMusic("title");
      click();
    });

    el.btnSkip.addEventListener("click", (e) => {
      e.stopPropagation();
      click();
      startRun();
    });

    el.btnRetry.addEventListener("click", (e) => {
      e.stopPropagation();
      click();
      applyNextStop();
    });

    el.btnHome.addEventListener("click", (e) => {
      e.stopPropagation();
      click();
      setState("title");
    });

    window.addEventListener("keydown", (e) => {
      if (G.state === "cover" && (e.code === "Enter" || e.code === "Space")) {
        e.preventDefault();
        AudioEngine.resume();
        setState("title");
      } else if (G.state === "title" && (e.code === "Enter" || e.code === "Space")) {
        e.preventDefault();
        AudioEngine.resume();
        beginRun(menuDaily);
      } else if (G.state === "intro" && (e.code === "Enter" || e.code === "Space")) {
        e.preventDefault();
        startRun();
      } else if (G.state === "result" && (e.code === "Enter" || e.code === "Space")) {
        e.preventDefault();
        applyNextStop();
      }
    });
  }

  function boot() {
    loadBest();
    AudioEngine.enabled = Store.data.sound !== false;

    // 英文字体套装：B Art Deco（Limelight + Josefin Sans）
    let typePick = "B";
    try {
      typePick = localStorage.getItem("chase_moon_type_pick") || "B";
    } catch (_) {}
    document.body.setAttribute("data-type", typePick);

    G.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window
      .matchMedia("(prefers-reduced-motion: reduce)")
      .addEventListener?.("change", (e) => {
        G.reduceMotion = e.matches;
      });

    fitCanvas();
    window.addEventListener("resize", fitCanvas);
    window.addEventListener("orientationchange", () => setTimeout(fitCanvas, 120));

    Input.bind();
    wireUI();
    initStars();
    resetRun();
    setState("cover");
    loadArt();
    document.addEventListener("visibilitychange", () => {
      if (!AudioEngine.ctx) return;
      if (document.hidden) {
        if (AudioEngine.ctx.state === "running") {
          try {
            AudioEngine.ctx.suspend();
          } catch (_) {}
        }
        return;
      }
      if (AudioEngine.ctx.state === "suspended" && AudioEngine.enabled) {
        AudioEngine.resume();
      }
      if (AudioEngine._nextTime < AudioEngine.ctx.currentTime) {
        AudioEngine._nextTime = AudioEngine.ctx.currentTime + 0.05;
      }
    });
    requestAnimationFrame(frame);
  }

  boot();

  if (new URLSearchParams(location.search).has("debug")) {
    window.__moon = {
      state: () => G.state,
      progress: () => G.progress,
      setProgress: (p) => {
        G.progress = clamp(p, 0, 1);
      },
      skipToPlay: () => startRun(),
      earth: () => G.earth,
      qteHit: () => {
        Input.qtePressed = true;
      },
      qteInfo: () =>
        G.qte
          ? {
              locks: G.qte.locks,
              need: G.qte.need,
              ready: !!G.qte.ready,
              t: G.qte.t,
              tutorial: G.qte.tutorial,
              moon: { x: G.moon.x, y: G.moon.y },
              earth: G.earth ? { x: G.earth.x, y: G.earth.y } : null,
              ratio: G.qte.ratio,
            }
          : null,
      placeMoonOnEarth: () => {
        if (!G.earth) return;
        G.moon.x = G.earth.x;
        G.moon.y = G.earth.y;
        if (G.qte) G.qte.cool = 0;
      },
      spawnSignalAtPlayer: () => {
        const e = G.earth;
        if (!e) return null;
        // place a gold signal on the player's screen path, near arrival
        const t = 0.88;
        const lx = (e.x - VIEW.vx) / (108 * t);
        const ly = (e.y - VIEW.vy - (VIEW.py - VIEW.vy) * t) / (82 * t);
        G.bodies.push({
          type: "signal",
          lx,
          ly,
          z: 1 - t,
          r: 9,
          ph: 0,
        });
        return { lx, ly, z: 1 - t };
      },
      bodyCount: () => G.bodies.length,
      sector: () => ({ id: G.sector, name: SECTORS[G.sector]?.name, progress: G.progress }),
      unlockHard: () => {
        Store.unlock("normal");
        Store.unlock("hard");
        return !!Store.data.ach.hard;
      },
      unlockBlood: () => {
        Store.unlock("normal");
        Store.unlock("hard");
        Store.unlock("blood");
        return !!Store.data.ach.blood;
      },
      diff: () => G.diff,
      setDiff: (d) => {
        if (!DIFF[d]) return G.diff;
        if (d !== "easy") Store.unlock("normal");
        if (d === "hard" || d === "blood") Store.unlock("hard");
        if (d === "blood") Store.unlock("blood");
        G.diff = d;
        Store.data.diff = d;
        Store.save();
        return G.diff;
      },
      forceSpike: () => {
        if (G.blood) G.blood.spikeT = 0;
      },
      forceShock: () => {
        if (G.blood) G.blood.shockT = 0;
      },
      bloodInfo: () =>
        G.blood
          ? {
              spike: !!G.blood.spike,
              shock: !!G.blood.shock,
              spikeT: G.blood.spikeT,
              shockT: G.blood.shockT,
              mass: G.earth ? G.earth.mass : null,
            }
          : null,
      skipIntro: () => startRun(),
      skipDiscover: () => {
        if (G.state === "discover") enterCapture();
      },
    };
  }
})();
