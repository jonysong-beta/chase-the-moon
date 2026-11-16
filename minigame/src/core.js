/* WeChat controlled port of H5 game.js (e1b6b63). Gameplay constants and
 * projection/rendering algorithms stay aligned with that source. Platform and
 * Canvas UI are injected; this module owns no event loop or browser globals. */
'use strict';
const Campaign = require('./campaign');
const Progression = require('./progression');
const Daily = require('./daily');
const Endless = require('./endless');
function createGame(options) {
  options = options || {};
  const ctx = options.ctx;
  const ART = options.assets || {};
  const monoFamily = options.fonts && typeof options.fonts.mono === 'string' && options.fonts.mono.trim()
    ? options.fonts.mono.trim() : 'monospace';
  const titleFamily = options.fonts && typeof options.fonts.title === 'string' && options.fonts.title.trim()
    ? options.fonts.title.trim() : 'serif';
  const displayFamily = options.fonts && typeof options.fonts.display === 'string' && options.fonts.display.trim()
    ? options.fonts.display.trim() : titleFamily;
  const storage = options.storage || { getItem() { return null; }, setItem() {} };
  const createCanvas = options.createCanvas;
  const clock = typeof options.now === 'function' ? options.now : Date.now;
  const createAudioContext = options.createAudioContext;
  const pauseReasons = new Set();
  let menuDaily = false;
  let toast = '', toastT = 0;
  let pending = null, finalized = false, assisted = false;
  let offer = null, offerSequence = 0, runSequence = 0;
  let audioUnlocked = false;
  let selectedLevel = 'L01', growthError = '', selectedDailyPool = 'A';
  // ── Constants (logical 270×480) ────────────────────────
  const W = 270;
  const H = 480;
  const S = W / 180; // scale factor from v1

  const PHYS = {
    maxSpeed: 92 * S,
    accel: 420 * S,
    drag: 4.5,
    steer: 24, // velocity targeting rate — near-direct (MoBA stick)
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
  const V2_JET_PHYS = Progression.jetParams(1);

  const QTE = {
    // lasso: move earth so the light ring encircles the moon, then capture
    needLocks: 3,
    needLocksEasy: 2,
    ringR: 64,
    // Main ring is DRAWN at the catch bound (WYSIWYG). Limb pad: moon edge can count.
    catchIn: 0.95,
    perfectIn: 0.45,
    limbPad: 0.4,
    duration: 15,
    tutorialSec: 4.5,
    moonDrift: 34,
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

  // 难度阶梯：逐级通关解锁（easy→normal→hard→blood）；面板刻度盘仅已解锁档可选
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

  function sanitizeBoardEntry(e) {
    if (!e || typeof e !== "object") return null;
    const score = Math.round(Number(e.score));
    if (!isFinite(score)) return null;
    const timeN = e.time == null ? NaN : Number(e.time);
    const num = (v, d) => {
      const n = Number(v);
      return isFinite(n) ? n : d;
    };
    return {
      id: String(e.id == null ? "" : e.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48),
      score,
      ending: e.ending === "perfect" || e.ending === "close" ? e.ending : "fail",
      mass: Math.round(clamp(num(e.mass, 0), 0, 999)),
      qteP: Math.round(clamp(num(e.qteP, 0), 0, 99)),
      qteG: Math.round(clamp(num(e.qteG, 0), 0, 99)),
      qteM: Math.round(clamp(num(e.qteM, 0), 0, 99)),
      combo: Math.round(clamp(num(e.combo, 0), 0, 99)),
      prog: Math.round(clamp(num(e.prog, 0), 0, 100)),
      diff: DIFF[e.diff] ? e.diff : "easy",
      daily: !!e.daily,
      time: isFinite(timeN) ? clamp(timeN, 0, 36000) : null,
      ts: num(e.ts, 0),
    };
  }

  const Store = {
    data: null,
    _saveFail: false,
    _readFail: false,
    load() {
      this._readFail = false;
      try {
        const raw = storage.getItem(STORE_KEY);
        this.data = raw ? JSON.parse(raw) : null;
        if (raw && (!this.data || typeof this.data !== 'object' || Array.isArray(this.data))) this._readFail = true;
      } catch (_) {
        this._readFail = true;
        this.data = null;
      }
      if (!this.data || typeof this.data !== "object" || Array.isArray(this.data)) {
        this.data = {
          board: [],
          ach: {},
          diff: "easy",
          sound: true,
          daily: { date: "", best: 0, played: false },
          pb: {},
        };
      }
      // WeChat has its own storage: difficulty unlocks require an explicit
      // achievement and never inherit the H5 legacy normal-tier migration.
      if (!Array.isArray(this.data.board)) this.data.board = [];
      this.data.board = this.data.board.map(sanitizeBoardEntry).filter(Boolean).slice(0, 10);
      if (!this.data.ach || typeof this.data.ach !== "object" || Array.isArray(this.data.ach)) this.data.ach = {};
      if (!this.data.daily || typeof this.data.daily !== "object" || Array.isArray(this.data.daily)) this.data.daily = { date: "", best: 0, played: false };
      this.data.daily.date = String(this.data.daily.date || "").slice(0, 16);
      this.data.daily.best = Math.round(clamp(Number(this.data.daily.best) || 0, 0, 999));
      this.data.daily.played = !!this.data.daily.played;
      const bt = Number(this.data.daily.bestTime);
      this.data.daily.bestTime = isFinite(bt) && bt > 0 ? clamp(bt, 0, 36000) : null;
      if (!this.data.pb || typeof this.data.pb !== "object" || Array.isArray(this.data.pb)) this.data.pb = {};
      Object.keys(this.data.pb).forEach((k) => {
        const t = Number(this.data.pb[k]);
        if (!DIFF[k] || !isFinite(t) || t <= 0) delete this.data.pb[k];
        else this.data.pb[k] = clamp(t, 0, 36000);
      });
      this.data = Progression.sanitize(this.data);
      return this.data;
    },
    commit(next) {
      if (this._readFail) return false;
      try {
        storage.setItem(STORE_KEY, JSON.stringify(next));
        this.data = next; this._saveFail = false;
        return true;
      } catch (_) { this._saveFail = true; return false; }
    },
    save() {
      if (this._readFail) return false;
      try {
        storage.setItem(STORE_KEY, JSON.stringify(this.data));
        this._saveFail = false;
        return true;
      } catch (_) {
        if (!this._saveFail) {
          this._saveFail = true;
          showToast("本机存储不可用 · 成绩可能丢失");
        }
        return false;
      }
    },
    unlock(id) {
      if (!this.data.ach[id]) {
        this.data.ach[id] = clock();
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
    const d = new Date(clock());
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

  function showToast(msg) { toast = String(msg); toastT = 1.8; }

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
      if (this.ctx || this._dead) return;
      if (!audioUnlocked) return;
      if (typeof createAudioContext !== 'function') {
        this._dead = true;
        return;
      }
      try {
        this.ctx = createAudioContext();
        if (!this.ctx) { this._dead = true; return; }
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
        // 音乐总线带通：70Hz 高通砍掉手机喇叭重现不了的超低（55Hz 底鼓/73Hz 贝斯
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
      } catch (_) {
        this._dead = true;
        this.ctx = null;
        this.master = null;
      }
    },

    // 只在用户手势里创建 AudioContext（非手势创建会被容器永久 suspended）
    unlockFromGesture() {
      if (this._dead) return;
      audioUnlocked = true;
      if (!this.ctx) this.ensure();
      if (!this.ctx) return;
      try {
        if (this.ctx.state !== "running") {
          const p = this.ctx.resume();
          if (p && p.catch) p.catch(function () {});
        }
        // 静默一帧，强制打通输出（部分 WebView 不这么做就一直哑）
        const buf = this.ctx.createBuffer(1, 1, 22050);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.ctx.destination);
        src.start(0);
      } catch (_) {}
    },

    resume() {
      // 仅恢复已存在的 ctx；绝不在非手势路径 ensure()/new AudioContext()
      if (!this.ctx || pauseReasons.size) return;
      if (this.ctx.state !== "running") {
        try {
          const p = this.ctx.resume();
          if (p && p.catch) p.catch(function () {});
        } catch (_) {}
      }
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

    _noiseBuf: null,
    noise(t0, dur, gain = 0.08) {
      if (!this.ctx || !this.enabled) return;
      // 共用一段白噪，包络走 gain —— 避免每次底鼓新建 buffer
      if (!this._noiseBuf) {
        const len = Math.max(1, (0.5 * this.ctx.sampleRate) | 0);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this._noiseBuf = buf;
      }
      const src = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.02, dur));
      src.buffer = this._noiseBuf;
      src.connect(g);
      g.connect(this.sfxGain);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
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
          const quietChase = mode === 'chase' && G.mode === 'campaign';
          const h = !quietChase && p.harm ? p.harm[i] : null;
          const b = p.bass[i];
          const dr = quietChase && i % 4 ? '.' : p.drums[i] || ".";
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
      };
      this._tick = tick;
      this._timer = true;
    },

    _retiredBuses: [],
    _stopSynth() {
      this._timer = null;
      this._tick = null;
      if (this._bus && this.ctx) {
        this._bus.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
        this._retiredBuses.push({ bus: this._bus, until: this.ctx.currentTime + 0.4 });
      }
      this._bus = null;
    },
    collectBuses() {
      if (!this.ctx) return;
      this._retiredBuses = this._retiredBuses.filter((entry) => {
        if (entry.until > this.ctx.currentTime) return true;
        try { entry.bus.disconnect(); } catch (_) {}
        return false;
      });
    },

    startMusic(mode) {
      // Web Audio 已验证可出声（SFX）；data URI <audio> 被 CSP 拦 → BGM 走合成
      this.ensure();
      if (!this.ctx || !this.enabled) {
        this._mode = mode;
        return;
      }
      if (this._mode === mode && this._timer) return;
      this._stopSynth();
      this._mode = mode;
      this._startSynth(mode);
    },

    stopMusic() {
      this._mode = "off";
      this._stopSynth();
    },
  };

  const Input = { ax: 0, ay: 0, jet: false, jetPressed: false, qtePressed: false };
  function resetInput() {
    Input.ax = Input.ay = 0;
    Input.jet = Input.jetPressed = Input.qtePressed = false;
  }
  // ── Game state ─────────────────────────────────────────
  const G = {
    state: "cover",
    mode: 'classic',
    v2: null,
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
    meditation: null,
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

  // Commit a final result as one storage transaction. Offers and intermediate
  // death/QTE animations never write a provisional score.
  function saveBest() {
    if (finalized) return false;
    finalized = true;
    const score = Math.round(G.score);
    const stamp = clock();
    const unlock = (id) => {
      if (!Store.data.ach[id]) {
        Store.data.ach[id] = stamp;
        const a = ACH.find((x) => x.id === id);
        if (a) showToast(`成就 · ${a.name}`);
      }
    };
    if (!assisted) {
      const entry = {
        id: `${stamp}_${runSequence}`, score, ending: G.outcome || 'fail',
        mass: Math.round(G.earth.mass), qteP: G.qte ? G.qte.perfect : 0,
        qteG: G.qte ? G.qte.good : 0, qteM: G.qte ? G.qte.miss : 0,
        combo: G.qte ? G.qte.bestCombo : 0, prog: Math.round(G.progress * 100),
        diff: G.diff, daily: G.dailyMode,
        time: G.clearT == null ? null : Math.round(G.clearT * 10) / 10, ts: stamp
      };
      Store.data.board.push(entry);
      Store.data.board.sort((a, b) => b.score - a.score);
      Store.data.board = Store.data.board.slice(0, 10);
      G.rank = Store.data.board.indexOf(entry) + 1;
      G.lastBest = Store.data.board[0] || null;
    } else G.rank = 0;
    unlock('first');
    if (G.outcome === 'perfect') unlock('perfect');
    if (score >= 80) unlock('score80');
    if (G.qte && G.qte.miss === 0 && G.qte.locks >= G.qte.need) unlock('combo10');
    if (G.outcome === 'close' || G.outcome === 'perfect') {
      const index = LADDER.indexOf(G.diff);
      if (index < LADDER.length - 1) unlock(LADDER[index + 1]);
      if (!G.dailyMode) Store.data.diff = LADDER[Math.min(index + 1, LADDER.length - 1)];
    }
    const liveDaily = !assisted && G.dailyMode && G.runDate === todayKey();
    if (liveDaily) {
      if (Store.data.daily.date !== todayKey()) Store.data.daily = { date: todayKey(), best: 0, played: true, bestTime: null };
      Store.data.daily.played = true;
      Store.data.daily.best = Math.max(Store.data.daily.best || 0, score);
      unlock('daily');
    }
    if (!assisted && G.clearT != null) {
      const time = Math.round(G.clearT * 10) / 10;
      if (!Store.data.pb[G.diff] || time < Store.data.pb[G.diff]) {
        Store.data.pb[G.diff] = time; G.newPB = true;
      }
      if (liveDaily && (!Store.data.daily.bestTime || time < Store.data.daily.bestTime)) {
        Store.data.daily.bestTime = time; G.newDailyTime = true;
      }
    }
    Store.data.sound = AudioEngine.enabled;
    Store.save();
    return true;
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
      pulseCd: 0,
      lastJetAt: -99,
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
    for (let i = 0; i < (G.mode === 'classic' ? 42 : 22); i++) {
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
      if (typeof createCanvas !== 'function' || !ctx.createPattern) return;
      const c = createCanvas();
      if (!c) return;
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
    resetInput();
    pending = null; finalized = false; assisted = false; offer = null;
    runSequence++;
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

  function setState(s) {
    G.state = s;
    resetInput();
    if (s === 'intro') G.cine = { t: 0, beat: 0, sceneT: 0, omenPlayed: false };
    const mode = { cover: 'title', title: 'title', intro: 'intro', play: 'chase', discover: 'discover', qte: 'qte', result: 'ending', meditation: 'title' }[s];
    if (mode) AudioEngine.startMusic(mode);
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

  // V2 uses authored depth events and transactional progression. Classic keeps
  // its original random spawning, capture, achievements and PB paths.
  function isV2() { return G.mode !== 'classic' && !!G.v2; }
  function beginV2(mode, id, pool) {
    if (Store._readFail) { setState('storageError'); return false; }
    const level = mode === 'campaign' ? Campaign.level(id) : null;
    if (mode === 'campaign' && (!level || !Campaign.unlocked(Store.data, id))) return false;
    if ((mode === 'daily' || mode === 'endless') && !Progression.dailyUnlocked(Store.data)) return false;
    if (mode === 'daily' && !Progression.dailyPoolUnlocked(Store.data, pool || 'A')) return false;
    const route = mode === 'daily' ? Daily.createRun(clock(), pool || 'A') : null;
    if (mode === 'daily' && !route) return false;
    const endlessRun = mode === 'endless' ? Endless.createRun(clock(), runSequence) : null;
    G.mode = mode; G.diff = mode === 'endless' || (level && level.chapter === 3) || (route && route.pool === 'C') ? 'blood' : 'easy'; G.dailyMode = false;
    resetRun();
    const snapshot = Progression.abilities(Store.data);
    G.v2 = {
      levelId: level ? level.id : null, level, route, endless: endlessRun,
      runId: clock().toString(36) + '-' + runSequence + '-' + Math.random().toString(36).slice(2, 10),
      startAbilities: Object.assign({}, snapshot), abilities: Object.assign({}, snapshot), grants: [],
      events: level ? Campaign.events(id) : route ? route.events : [], cursor: 0, nextChunk: 0,
      signals: 0, dust: 0, rockGroups: 0, jets: 0, pulses: 0, locks: 0, tides: 0, shocks: 0, sails: 0, gates: 0, segments: 0,
      segmentSignals: [0, 0, 0], gateIds: [], tailAt: level ? level.duration : 0,
      tailIndex: 0, hint: '', hintUntil: 0, pendingGrant: null, grantError: '', saveError: '', result: null
    };
    G.earth.mass = level ? level.massStart : 60;
    G.blood = level && ['L09', 'L11', 'L12'].indexOf(level.id) >= 0 ? {
      spikeT: 6, spike: null, shockT: level.id === 'L09' ? Infinity : 10, shock: null
    } : route && route.pool === 'C' ? { spikeT: 5, spike: null, shockT: 9, shock: null } : null;
    G.runDate = route ? route.date : Daily.dateKey(clock());
    toast = ''; toastT = 0;
    setState('play');
    return true;
  }
  function v2Hint() {
    const v = G.v2;
    if (v.hint && G.runT < v.hintUntil) return v.hint;
    if (G.mode === 'endless') return G.runT < 5 ? '保持追寻，星尘可以延续质量' : '危险逐渐增压，尽可能活得更久';
    if (G.mode === 'daily') return ['追光得分，安全通过航标', '完成航段，继续积累得分', '最后一段，稳住航线'][Math.min(2, Math.floor(G.runT / 50))];
    if (v.levelId === 'L09') return '看清瞄准线，横移避开潮汐刺';
    if (v.levelId === 'L10') return v.sails ? '借力已释放，继续追光' : '沿井外缘移动蓄力，再向外离开';
    if (v.levelId === 'L01') return G.runT < 4 ? '月亮走远了，光还在。' : '推动摇杆，追随金色辉光';
    if (v.levelId === 'L02') return '避开前方碎石';
    if (v.levelId === 'L03' && !v.dust) return '星尘可以补充质量';
    if (v.levelId === 'L04' && !v.jets) return '推动摇杆，再点喷射';
    if (G.runT >= v.level.duration && G.progress < 1) return '继续追光，补满追近刻度';
    return '沿着辉光，点亮下一段航迹';
  }
  function spawnV2(event) {
    G.bodies.push(Object.assign({ z: VIEW.zMax, r: event.type === 'signal' ? 12 : event.type === 'gate' ? 32 : 9,
      ly: 0, ph: 0, massDelta: event.type === 'dust' ? 6 : 8, hard: event.type === 'rock', seed: G.v2.cursor * 7 }, event));
  }
  function v2Schedule() {
    const v = G.v2;
    if (G.mode === 'endless') {
      while (v.nextChunk * Endless.CHUNK_SECONDS <= G.runT + 6) {
        const events = Endless.chunk(v.endless.seed, v.nextChunk++);
        for (let i = 0; i < events.length; i++) v.events.push(events[i]);
      }
    }
    while (v.cursor < v.events.length && v.events[v.cursor].at <= G.runT + 1e-8) {
      const event = v.events[v.cursor++];
      if (event.type === 'grant') {
        if (!v.abilities[event.ability]) {
          v.pendingGrant = { ability: event.ability, levelId: event.levelId };
          toast = ''; toastT = 0; setState('grant'); return false;
        }
      } else if (event.type === 'group') v.rockGroups = Math.max(v.rockGroups, event.group);
      else spawnV2(event);
    }
    if (G.mode === 'campaign' && G.runT >= v.tailAt) {
      // Safe, non-escalating recovery loop; its off-centre arc still requires
      // steering. Missing dust and directional-jet opportunities remain available.
      v.tailAt += 2.6;
      const side = v.tailIndex++ % 2 ? 1 : -1;
      spawnV2({ type: 'signal', lx: side * 0.98, ly: -0.2, id: 'tail-' + v.tailIndex });
      if ((v.levelId === 'L03' && !v.dust) || (v.abilities.jet && G.earth.mass < 30)) {
        spawnV2({ type: 'dust', lx: side * 0.6, ly: -0.35, massDelta: 8 });
      }
    }
    return true;
  }
  function updateV2Bodies(dt) {
    const e = G.earth;
    for (const b of G.bodies) {
      const speed = G.mode === 'endless' ? .27 + Math.min(.15, G.runT / 300 * .15) : .27;
      b.z -= speed * dt;
      b.ph = (b.ph || 0) + dt * 2;
      if ((b.type !== 'signal' && b.type !== 'dust') || b.z >= 0.35 || b.z <= 0.02) continue;
      const p = projectBody(b), dx = e.x - p.sx, dy = e.y - p.sy;
      const d = Math.hypot(dx, dy);
      if (d < 48 && d > 4) {
        b.lx += dx / 108 * 0.65 * dt;
        b.ly += dy / 82 * 0.65 * dt;
      }
    }
    G.bodies = G.bodies.filter(b => b.z > -0.08);
  }
  function v2Completed() {
    const v = G.v2;
    if (G.mode === 'daily') return G.runT >= 150 - 1e-8;
    if (G.mode === 'endless') return false;
    const need = v.level.objective;
    return G.runT >= v.level.duration && v.signals >= v.level.target && G.progress >= 1 - 1e-8 &&
      v.rockGroups >= (need.groups || 0) && v.dust >= (need.dust || 0) && v.jets >= (need.jets || 0) && v.pulses >= (need.pulses || 0) &&
      v.tides >= (need.tides || 0) && v.sails >= (need.sails || 0);
  }
  function finishV2(completed) {
    if (!isV2() || pending || G.v2.result) return;
    const v = G.v2;
    G.runT = Math.round(G.runT * 1000000) / 1000000;
    G.outcome = completed ? 'complete' : 'fail'; G.clearT = completed ? G.runT : null;
    if (G.mode === 'daily') v.segments = Math.min(3, Math.floor((G.runT + 1e-8) / 50));
    G.score = G.mode === 'daily' ? Daily.score(v.signals, v.segments, v.gates) : G.mode === 'endless' ? Math.floor(G.runT * 10) : 0;
    v.result = Object.assign({
      runId: v.runId, levelId: v.levelId, completed, time: G.runT,
      signals: v.signals, segments: v.segments, gates: v.gates, locks: v.locks, score: G.score,
      abilities: Object.assign({}, v.abilities), startAbilities: Object.assign({}, v.startAbilities), grants: v.grants.slice(), assisted: false
    }, v.route ? { date: v.route.date, pool: v.route.pool, version: v.route.version, seed: v.route.seed, templates: v.route.templates } : {});
    if (G.mode === 'endless') Object.assign(v.result, { date: G.runDate, version: v.endless.version, seed: v.endless.seed });
    G.bodies = []; toast = ''; toastT = 0; resetInput();
    saveV2Result(); setState('result');
  }
  function saveV2Result() {
    if (!isV2() || !G.v2.result || finalized) return false;
    const v = G.v2;
    const tx = G.mode === 'campaign' ? Progression.settleCampaign(Store.data, v.result) :
      G.mode === 'endless' ? Progression.settleEndless(Store.data, v.result) : Progression.settleDaily(Store.data, v.result);
    if (!tx.ok || !Store.commit(tx.data)) {
      v.saveError = '保存未完成，请重试'; return false;
    }
    v.reward = Number(tx.reward) || 0; v.newBest = tx.newBest === true; v.saveError = ''; finalized = true;
    return true;
  }
  function claimV2Ability() {
    if (G.state !== 'grant' || !isV2()) return false;
    const grant = G.v2.pendingGrant || { ability: 'jet', levelId: 'L04' };
    const tx = Progression.grant(Store.data, grant.ability, grant.levelId);
    if (!tx.ok || !Store.commit(tx.data)) { G.v2.grantError = '保存失败，请重试'; return false; }
    G.v2.abilities = Progression.abilities(Store.data);
    G.v2.grants.push({ ability: grant.ability, level: 1, levelId: grant.levelId, at: G.runT });
    G.v2.pendingGrant = null;
    G.v2.grantError = ''; G.v2.hint = grant.ability === 'pulse' ? '冷却中再按一次，发动额外脉冲' : grant.ability === 'sail' ? '引力帆Ⅰ已获得，沿井外缘蓄力' : '喷射Ⅰ已获得，推动摇杆试试'; G.v2.hintUntil = G.runT + 4;
    setState('play'); return true;
  }

  // ── Play logic ─────────────────────────────────────────
  function finalizeResult() {
    pending = null; offer = null;
    if (isV2()) { finishV2(false); return; }
    saveBest(); G.nextStop = nextStopPlan(); setState('result');
  }
  function lose(reason) {
    if (G.state !== 'play' || !G.earth.alive || pending) return;
    if (isV2() && G.v2.levelId === 'L01') return;
    G.earth.alive = false;
    G.outcome = 'fail'; G.failReason = reason || '质量归零 · 航体消散';
    resetInput(); AudioEngine.sfx('lose');
    burst(G.earth.x, G.earth.y, '#FF2A6D', 28, 90);
    G.shake = 10; if (!isV2()) computeScore();
    pending = { remaining: 0.75, kind: 'failure' };
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
    const calibration = isV2() && G.v2.levelId === 'L08';
    if (isV2()) G.blood = null;
    G.qte = {
      t: 0,
      tutorial: QTE.tutorialSec,
      locks: 0,
      need: calibration ? 2 : isV2() && G.v2.levelId === 'L12' ? 3 : G.diff === "easy" ? QTE.needLocksEasy : QTE.needLocks,
      calibration,
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

  }

  function updateQTE(dt) {
    const q = G.qte;
    if (!q) return;
    if (q.done) {
      if (q.endT > 0) {
        q.endT -= dt;
        if (q.endT <= 0) finishQTE();
      }
      return;
    }
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
      // velocity targeting — same family as chase (near-direct)
      const k = 1 - Math.exp(-22 * dt);
      const maxS = PHYS.maxSpeed * 0.92;
      e.vx += (ax * maxS - e.vx) * k;
      e.vy += (ay * maxS - e.vy) * k;
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
      const agit = 1 + q.locks * 0.35;
      q.moonVx += wob * 12 * agit * dt;
      q.moonVy += Math.cos(q.t * 1.3) * 9 * agit * dt;
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
      // drift escalates with each lock — tension ramp
      const drift = QTE.moonDrift * (1 + q.locks * 0.18) * (1.85 - massG * 0.45);
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

    // lasso readiness: main ring IS the catch bound (WYSIWYG) + limb pad
    const ex = e ? e.x : W * 0.5;
    const ey = e ? e.y : H * 0.62;
    const massFac = e ? clamp((e.mass - PHYS.massMin) / (50 - PHYS.massMin), 0.88, 1.15) : 1;
    const ringR = QTE.ringR * massFac;
    q.ringR = ringR;
    const d = Math.hypot(G.moon.x - ex, G.moon.y - ey);
    const mr = G.moon.r || 22;
    const catchR = ringR * QTE.catchIn + mr * (QTE.limbPad || 0);
    const perfectR = ringR * QTE.perfectIn;
    q.catchR = catchR;
    q.perfectR = perfectR;
    q.ratio = d / ringR;
    q.ready = d <= catchR;
    q.perfectReady = d <= perfectR;
    q.near = !q.ready && d <= ringR * 1.28;
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
        const isPerfect = d <= perfectR;
        if (isPerfect) {
          q.perfect++;
          q.feedback = "完美套住！";
          AudioEngine.sfx("qte_perfect");
          burst(G.moon.x, G.moon.y, "#FFD166", 28, 95);
          burst(G.moon.x, G.moon.y, "#E8C878", 14, 55);
          G.flash = 0.22;
          if (!G.reduceMotion) G.hitStop = 0.12;
        } else {
          q.good++;
          q.feedback = "抓住了";
          AudioEngine.sfx("qte_good");
          burst(G.moon.x, G.moon.y, "#C5D0E6", 16, 55);
          G.flash = 0.1;
          if (!G.reduceMotion) G.hitStop = 0.07;
        }
        q.feedbackT = 0.7;
        q.cool = 0.55;
        // slip away — farther each lock
        const ang = Math.random() * Math.PI * 2;
        const slipR = 90 + q.locks * 18;
        const nx = clamp(W * 0.5 + Math.cos(ang) * slipR, 40, W - 40);
        const ny = clamp(H * 0.35 + Math.sin(ang) * (80 + q.locks * 12), 60, H - 140);
        G.moon.x = nx;
        G.moon.y = ny;
        q.moonVx = Math.cos(ang + 1) * QTE.moonDrift * 0.7;
        q.moonVy = Math.sin(ang + 0.4) * QTE.moonDrift * 0.7;
        if (q.locks >= q.need) {
          q.done = true;
          q.endT = 0.45;
          if (!G.reduceMotion) G.hitStop = 0.15;
          G.flash = 0.28;
          AudioEngine.sfx("qte_perfect");
          burst(G.moon.x, G.moon.y, "#FFD166", 36, 100);
          return;
        }
      } else {
        q.miss++;
        q.combo = 0;
        q.feedback = q.calibration ? "光圈没套住目标" : "光圈没套住月亮";
        q.feedbackT = 0.6;
        AudioEngine.sfx("qte_miss");
        q.moonVx *= 1.2;
        q.moonVy *= 1.2;
        G.flash = 0.06;
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
      q.endT = 0.25;
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
    if (pending || finalized) return;
    const q = G.qte;
    const completed = !!(q && q.locks >= q.need);
    if (isV2()) {
      G.v2.locks = q ? q.locks : 0;
      if (completed && G.v2.levelId === 'L12') {
        G.reunionT = 0; G.bodies = []; G.blood = null; resetInput(); AudioEngine.sfx('win'); setState('reunion');
      } else finishV2(completed);
      return;
    }
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
    pending = { remaining: 0.9, kind: 'qte' };
    resetInput();
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
    if (plan.upgrade) showToast(`难度 · ${(DIFF[G.diff] && DIFF[G.diff].label) || G.diff}`);
    AudioEngine.resume();
    resetRun();
    setState("play");
  }

  function shareText() {
    if (isV2()) {
      const r = v2ResultView();
      if (!r) return '';
      return ['【逐月计划】' + r.title, r.subtitle].concat(r.rows.map(row => row.label + ' ' + row.value), [r.abilityText, '本机航行纪录 · 系统截屏分享']).join('\n');
    }
    const end = ENDINGS[G.outcome] || ENDINGS.fail;
    const q = G.qte;
    const qtxt = q ? `QTE P${q.perfect}/G${q.good}/M${q.miss} 连击×${q.bestCombo}` : "未捕获";
    return [
      `【逐月计划】${end.title} · ${Math.round(G.score)}分`,
      G.clearT != null ? `用时 ${fmtTime(G.clearT)}${G.newPB ? " · 新纪录" : ""}` : "",
      `质量${Math.round((G.earth && G.earth.mass) || 0)} · 追近${Math.round(G.progress * 100)}%`,
      qtxt,
      G.rank ? `本机榜 #${G.rank}` : "",
      G.dailyMode ? `今日竞速 ${todayKey()}` : `难度 ${(DIFF[G.diff] && DIFF[G.diff].label) || ""}`,
      "系统截屏这张卡，来比谁先追回月亮",
    ]
      .filter(Boolean)
      .join("\n");
  }

  /** Full-screen share card — no download (XHS container bans a[download]) */
  function drawShareCard(g, w, h) {
    if (!g) return;
    if (isV2()) { drawV2Share(g, w || 540, h || 860); return; }
    w = w || 540; h = h || 860;
    g.save();
    g.scale(w / 540, h / 860);
    w = 540; h = 860;
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
    g.font = "bold 28px " + monoFamily;
    g.fillText("逐月计划", w / 2, 78);

    g.fillStyle = end.color;
    g.font = "bold 42px " + monoFamily;
    g.fillText(end.title, w / 2, 150);

    g.fillStyle = "#F0E6D3";
    g.font = "bold 64px " + monoFamily;
    g.fillText(String(Math.round(G.score)), w / 2, 230);

    g.fillStyle = "#8B9BB8";
    g.font = "22px " + monoFamily;
    if (G.clearT != null) {
      g.fillStyle = "#E8C878";
      g.fillText(`用时 ${fmtTime(G.clearT)}${G.newPB ? " · 新纪录" : ""}`, w / 2, 258);
      g.fillStyle = "#8B9BB8";
    }
    g.fillText(`质量 ${Math.round((G.earth && G.earth.mass) || 0)} · 追近 ${Math.round(G.progress * 100)}%`, w / 2, 292);
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
    g.font = "20px " + monoFamily;
    drawBar(barY, p.ms / 100, "#3D8B6E", "质量");
    drawBar(barY + 40, p.ds / 100, "#C5D0E6", "追近");
    drawBar(barY + 80, p.qs / 100, "#FFD166", "捕获");

    g.fillStyle = "#8B9BB8";
    g.font = "20px " + monoFamily;
    const meta = [
      `${(DIFF[G.diff] && DIFF[G.diff].label) || ""}${G.dailyMode ? " · 今日竞速" : ""}`,
      todayKey(),
      G.rank ? `本机榜 #${G.rank}` : "",
    ].filter(Boolean);
    meta.forEach((line, i) => g.fillText(line, w / 2, 560 + i * 32));

    g.fillStyle = "#3A4A6B";
    g.font = "18px " + monoFamily;
    g.fillText(assisted ? '已续玩 · 不计本机榜与纪录' : '系统截屏分享 · 本机成绩', w / 2, h - 56);
    g.restore();
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
    if (isV2() ? e.mass <= PHYS.massMin : e.mass < PHYS.massMin + 2) lose(kind === "shock" ? "被月蚀冲击撕裂" : "被潮汐刺贯穿");
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
    if (!b.spike && (!isV2() || !b.shock)) {
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
        if (isV2() && G.v2) G.v2.tides++;
      }
    } else if (b.spike) {
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
        b.spikeT = BLOOD.spikeCd[sec] * (0.85 + Math.random() * 0.35) * (isV2() ? 1.25 : 1);
      }
    }

    // ── expanding shock ring from a frozen origin ──
    if (!b.shock && (!isV2() || !b.spike)) {
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
        if (isV2() && G.v2) G.v2.shocks++;
      }
    } else if (b.shock) {
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
        b.shockT = BLOOD.shockCd[sec] * (0.85 + Math.random() * 0.35) * (isV2() ? 1.25 : 1);
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
    G.mode = 'classic'; G.v2 = null;
    G.dailyMode = !!daily;
    AudioEngine.resume();
    setState("intro");
  }

  function updateSail(b, rr, d, dt, ax, ay) {
    if (!isV2() || !G.v2.abilities.sail || b.sailUsed || b.z >= .68 || b.z < -.02) return;
    const e = G.earth, params = Progression.sailParams(G.v2.abilities.sail);
    if (b.sailCharge === undefined) { b.sailCharge = 0; b.sailReady = false; b.sailLastD = d; }
    const directed = Math.hypot(ax, ay) >= .15;
    if (d < rr * 2.2) { b.sailCharge = 0; b.sailReady = false; }
    else if (d >= rr * 2.4 && d <= rr * 3.4) {
      if (directed) b.sailCharge = Math.min(params.charge, b.sailCharge + dt);
      if (b.sailCharge >= params.charge - 1e-8) b.sailReady = true;
    } else if (!b.sailReady) b.sailCharge = 0;
    if (b.sailReady && d > rr * 3.4 && d > b.sailLastD && directed) {
      let jx = ax, jy = ay;
      const n = Math.hypot(jx, jy) || 1; jx /= n; jy /= n;
      if (e.jetT <= 0) {
        const jet = Progression.jetParams(G.v2.abilities.jet) || { duration: .22, impulse: 55 };
        e.jetT = jet.duration; e.vx += jx * jet.impulse; e.vy += jy * jet.impulse;
      }
      b.sailUsed = true; b.sailReady = false; G.v2.sails++;
      AudioEngine.sfx('jet'); burst(e.x, e.y, '#E8C878', 12, 55);
      G.v2.hint = '引力助推已释放'; G.v2.hintUntil = G.runT + 2;
    }
    b.sailLastD = d;
  }

  function updatePlay(dt) {
    const e = G.earth;
    if (!e.alive) {
      updateParticles(dt);
      return;
    }
    if (isV2() && !v2Schedule()) return;

    AudioEngine.resume();
    e.angle += dt * (0.35 + e.vx * 0.008);

    let ax = Input.ax;
    let ay = Input.ay;
    const mag = Math.hypot(ax, ay);
    // stick deadzone already applied — no second cutoff (MOBA 1:1 trim)
    if (mag > 1) {
      ax /= mag;
      ay /= mag;
    }

    const massFac = lerp(1.1, 0.88, (e.mass - PHYS.massMin) / (PHYS.massMax - PHYS.massMin));
    const sticky = G.wellSticky > 0 ? lerp(1, 0.82, G.wellSticky / 0.25) : 1;
    const maxS = (isV2() ? V2_JET_PHYS.baseSpeed : PHYS.maxSpeed) * massFac * sticky *
      (e.jetT > 0 ? (isV2() ? V2_JET_PHYS.targetMultiplier : 1.25) : 1);

    e.jetCd = Math.max(0, e.jetCd - dt);
    e.pulseCd = Math.max(0, (e.pulseCd || 0) - dt);
    e.jetT = Math.max(0, e.jetT - dt);
    if (Input.jetPressed) {
      Input.jetPressed = false;
      const jet = isV2() ? Progression.jetParams(G.v2.abilities.jet) : { duration: PHYS.jetDuration, cooldown: PHYS.jetCooldown, cost: PHYS.jetMassCost, impulse: 55 };
      const pulse = isV2() ? Progression.pulseParams(G.v2.abilities.pulse) : null;
      const directed = Math.hypot(ax, ay) >= 0.15 || Math.hypot(e.vx, e.vy) >= 1;
      const normalReady = e.jetCd <= 0;
      const extraReady = !normalReady && !!pulse && e.pulseCd <= 0 && G.runT - e.lastJetAt >= pulse.minInterval;
      if (isV2() && jet && !directed) { G.v2.hint = '推动摇杆，再点喷射'; G.v2.hintUntil = G.runT + 2.5; }
      if (jet && (!isV2() || directed) && (normalReady || extraReady) && e.mass > PHYS.massMin + 1) {
        e.jetT = jet.duration;
        e.jetCd = jet.cooldown;
        e.mass = Math.max(PHYS.massMin, e.mass - jet.cost);
        if (isV2()) {
          if (extraReady) { e.pulseCd = pulse.recovery; G.v2.pulses++; }
          G.v2.jets++; e.lastJetAt = G.runT;
        }
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
        e.vx += jx * jet.impulse;
        e.vy += jy * jet.impulse;
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
      const accel = isV2() ? V2_JET_PHYS.acceleration * V2_JET_PHYS.extraAcceleration : PHYS.jetAccel * 0.55;
      e.vx += (e.vx / n) * accel * dt;
      e.vy += (e.vy / n) * accel * dt;
      const sp0 = Math.hypot(e.vx, e.vy);
      const cap = maxS * (isV2() ? V2_JET_PHYS.speedLimitMultiplier : 1.35);
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
      updateSail(b, rr, d, dt, ax, ay);
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

    // well pull: light drag so escaping feels earned without a gear-shift
    if (pulled) {
      e.vx *= 1 - 1.1 * dt;
      e.vy *= 1 - 1.1 * dt;
      G.wellSticky = 0.25;
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
    const topBound = isV2() ? 100 : 56;
    const bottomBound = isV2() ? 350 : H - 56;
    if (e.y < topBound) {
      e.y = topBound;
      e.vy = Math.abs(e.vy) * 0.4;
    }
    if (e.y > bottomBound) {
      e.y = bottomBound;
      e.vy = -Math.abs(e.vy) * 0.55;
      // camping the bottom void drains mass; death comes from 质量归零, not an invisible wall
      if (!isV2()) e.mass -= 4.5 * dt;
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
      if (b.type === 'gate') {
        // A visible gap between two beacons, never a skill-button check.
        const halfWidth = b.r * p.scale;
        if (b.z < 0.18 && Math.abs(e.x - p.sx) <= Math.max(4, halfWidth - e.r * 0.45) && Math.abs(e.y - p.sy) <= 20) {
          if (isV2() && G.v2.gateIds.indexOf(b.id) < 0) { G.v2.gateIds.push(b.id); G.v2.gates++; }
          b.dead = true; AudioEngine.sfx('qte_good'); burst(p.sx, p.sy, '#E8C878', 8, 35);
        }
        continue;
      }
      // soft bodies: fat vacuum radius; rocks: tight but still fair
      const pad = b.type === "signal" ? 30 : b.hard ? 12 : 26;
      const rr = e.r + b.r * p.scale + pad;
      if (dist2(e.x, e.y, p.sx, p.sy) > rr * rr) continue;

      if (b.hard) {
        if (e.invuln > 0) continue;
        const sec = SECTORS[sectorOf(G.progress)];
        const hurt = isV2() ? 1 : sec.rockHurt;
        // rocks always cost mass — random +mass muddied the punish signal
        const damage = isV2() ? (G.v2.level ? G.v2.level.rockDamage : 8) : Math.abs(b.massDelta) * hurt;
        e.mass = clamp(e.mass - damage, PHYS.massMin, PHYS.massMax);
        if (isV2()) { G.v2.hint = '受击损失质量与追近'; G.v2.hintUntil = G.runT + 2; }
        const dx = e.x - p.sx;
        const dy = e.y - p.sy;
        const d = Math.hypot(dx, dy) || 1;
        e.vx += (dx / d) * 120 * hurt;
        e.vy += (dy / d) * 120 * hurt;
        e.invuln = 0.7;
        e.hitFlash = 0.4;
        e.pickupPop = -0.12;
        G.shake = G.reduceMotion ? 0 : 9;
        if (!G.reduceMotion) G.hitStop = isV2() ? 0.07 : 0.08;
        G.flash = 0.12;
        AudioEngine.sfx("hit");
        burst(p.sx, p.sy, "#FF2A6D", 16, 70);
        burst(p.sx, p.sy, "#8B9BB8", 10, 48);
        G.progress = clamp(G.progress - PROG.hitPenalty * hurt, 0, 1);
        b.dead = true;
        if (isV2() ? e.mass <= PHYS.massMin : e.mass < PHYS.massMin + 2) {
          // 同帧进度满格与致命撞击竞争时，让进度赢（别让玩家看到 100% 判负）
          if (!isV2() && G.progress >= 1) {
            enterDiscover();
          } else {
            lose("质量崩溃 · 星尘难继");
          }
          return;
        }
      } else if (b.type === "signal") {
        if (isV2()) {
          const v = G.v2, segment = Number.isInteger(b.segment) ? b.segment : 0;
          if (G.mode === 'endless') v.signals++;
          else if (G.mode === 'campaign' || v.segmentSignals[segment] < 20) {
            v.signals++; v.segmentSignals[segment]++;
            G.progress = clamp(G.progress + (G.mode === 'campaign' ? 1 / v.level.target : 1 / 20), 0, 1);
          }
        } else G.progress = clamp(G.progress + PROG.signal, 0, 1);
        e.pickupT = 0.28;
        e.pickupPop = 0.16;
        // no hit-stop on gold — micro-freezes stacked into a sticky stutter
        G.shake = G.reduceMotion ? 0 : 2;
        G.flash = 0.18;
        AudioEngine.sfx("eat");
        AudioEngine.sfx("qte_good");
        burst(p.sx, p.sy, "#FFD166", 14, 55);
        burst(e.x, e.y, "#FFD166", 6, 30);
        b.dead = true;
      } else {
        if (isV2()) G.v2.dust++;
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

    if (!isV2()) G.progress = clamp(G.progress + PROG.idle * dt, 0, 1);
    if (isV2() && G.mode === 'endless') {
      e.mass = clamp(e.mass - (.16 + Math.min(.12, G.runT / 240 * .12)) * dt, PHYS.massMin, PHYS.massMax);
    }

    // moon sits at vanishing-point depth — grows as you close in
    const mz = lerp(0.92, 0.12, easeOut(G.progress));
    const mt = 1 - mz;
    G.moon.x = VIEW.vx + (e.x - VIEW.vx) * mt * 0.35;
    G.moon.y = VIEW.vy + (e.y - VIEW.vy) * mt * 0.22 - 6 * mt;
    G.moon.r = lerp(14, 32, easeOut(Math.min(1, G.progress * 1.15)));
    G.moonDim = 0.3 + 0.7 * G.progress;
    G.moonZ = mz;

    if (!isV2() && G.progress >= 1) {
      enterDiscover();
      return;
    }
    if (e.mass <= PHYS.massMin) {
      lose("质量归零 · 航体消散");
      return;
    }

    if (isV2()) {
      if (G.mode === 'campaign' && G.runT >= G.v2.level.duration) G.blood = null;
      if (G.blood) { updateBlood(dt); if (pending) return; }
      if (G.mode === 'daily') {
        G.v2.segments = Math.min(3, Math.floor((G.runT + 1e-8) / 50));
        G.score = Daily.score(G.v2.signals, G.v2.segments, G.v2.gates);
      }
      if (v2Completed()) {
        if (G.mode === 'campaign' && ['L08', 'L12'].indexOf(G.v2.levelId) >= 0) enterCapture();
        else finishV2(true);
        return;
      }
      updateV2Bodies(dt); updateParticles(dt); return;
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


    updateSpawning(dt);
    updateBlood(dt);
    updateParticles(dt);

  }

  function updateIntro(dt) {
    if (!G.cine) return;
    const c = G.cine;
    c.t += dt; c.sceneT += dt;
    let acc = 0, beat = CUTSCENE.length;
    for (let i = 0; i < CUTSCENE.length; i++) {
      if (c.t < acc + CUTSCENE[i].t) { beat = i; break; }
      acc += CUTSCENE[i].t;
    }
    if (beat !== c.beat) {
      c.beat = beat; c.sceneT = 0;
      if (CUTSCENE[beat] && CUTSCENE[beat].scene === 'omen') AudioEngine.sfx('omen');
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
    if (isV2() && G.v2.abilities.sail) {
      ctx.save(); ctx.strokeStyle = 'rgba(232,200,120,.28)'; ctx.lineWidth = .7;
      ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r * 3.4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      if (b.sailCharge > 0 && !b.sailUsed) {
        const params = Progression.sailParams(G.v2.abilities.sail);
        ctx.strokeStyle = '#E8C878'; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.arc(x, y, r * 3.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, b.sailCharge / params.charge)); ctx.stroke();
      }
      ctx.restore();
    }
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
      ctx.font = "bold 11px " + monoFamily;
      ctx.fillText(r.name, x0 + 42, y - 4);
      ctx.fillStyle = "#C5B89A";
      ctx.font = "9px " + monoFamily;
      ctx.fillText(r.desc, x0 + 42, y + 8);
    });

    ctx.restore();
    ctx.textBaseline = "alphabetic";
  }

  function drawCalibrationTarget() {
    const x = G.moon.x, y = G.moon.y, r = G.moon.r || 22;
    ctx.save(); ctx.strokeStyle = '#E8C878'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(x, y, r * .65, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x - r - 8, y); ctx.lineTo(x + r + 8, y); ctx.moveTo(x, y - r - 8); ctx.lineTo(x, y + r + 8); ctx.stroke();
    ctx.fillStyle = '#C5B89A'; ctx.font = '9px ' + monoFamily; ctx.textAlign = 'center'; ctx.fillText('轨迹校准', x, y + r + 20); ctx.restore();
  }

  function drawQTE() {
    const q = G.qte;
    if (!q) return;
    const ex = G.earth ? G.earth.x : W * 0.5;
    const ey = G.earth ? G.earth.y : H * 0.62;
    const R = q.ringR || QTE.ringR;



    // capture light ring — MAIN ring = catch bound (WYSIWYG)
    const catchR = q.catchR || R * QTE.catchIn;
    const perfectR = q.perfectR || R * QTE.perfectIn;
    const near = !!q.near;
    let ox = 0;
    let oy = 0;
    if (near && !G.reduceMotion) {
      ox = Math.sin(q.t * 42) * 1.4;
      oy = Math.cos(q.t * 37) * 1.4;
    }
    // outer guide (decorative)
    ctx.strokeStyle = "rgba(240,230,211,0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ex, ey, R, 0, Math.PI * 2);
    ctx.stroke();
    // catch ring: red near-miss / green ready / gold = perfect window
    let ringCol = "rgba(240,230,211,0.55)";
    let ringW = 2.5;
    if (q.ready) {
      if (q.perfectReady) {
        ringCol = "#FFD166";
        ringW = 4;
      } else {
        ringCol = "#6FCF97";
        ringW = 3.5;
      }
    } else if (near) {
      ringCol = "#C45C6A";
      ringW = 3;
    }
    ctx.strokeStyle = ringCol;
    ctx.lineWidth = ringW;
    ctx.beginPath();
    ctx.arc(ex + ox, ey + oy, catchR, 0, Math.PI * 2);
    ctx.stroke();
    // perfect core
    ctx.strokeStyle = q.perfectReady ? "rgba(255,209,102,0.85)" : "rgba(212,168,75,0.28)";
    ctx.lineWidth = q.perfectReady ? 2 : 1;
    ctx.setLineDash(q.perfectReady ? [] : [2, 3]);
    ctx.beginPath();
    ctx.arc(ex, ey, perfectR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (q.ready) {
      ctx.strokeStyle = q.perfectReady ? "rgba(255,209,102,0.55)" : "rgba(111,207,151,0.45)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(ex, ey, catchR + 6 + Math.sin(q.t * 8) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // line from earth to moon when close
    const d = Math.hypot(G.moon.x - ex, G.moon.y - ey);
    if (d < catchR * 1.5) {
      ctx.strokeStyle = q.ready
        ? q.perfectReady
          ? "rgba(255,209,102,0.65)"
          : "rgba(111,207,151,0.55)"
        : near
          ? "rgba(196,92,106,0.45)"
          : "rgba(240,230,211,0.25)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(G.moon.x, G.moon.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = "#F0E6D3";
    ctx.font = "bold 12px " + monoFamily;
    ctx.textAlign = "center";
    ctx.fillText(`套住 ${q.locks}/${q.need}`, W / 2, 46);
    if (q.combo > 1) {
      ctx.fillStyle = "#FFD166";
      ctx.fillText(`连击 ×${q.combo}`, W / 2, 64);
    }
    if (q.feedbackT > 0 && q.feedback) {
      const ok = q.feedback.indexOf("套") >= 0 || q.feedback.indexOf("抓") >= 0;
      ctx.fillStyle = ok ? "#FFD166" : "#FF2A6D";
      ctx.font = "bold 13px " + monoFamily;
      ctx.fillText(q.feedback, W / 2, 86);
    }

    if (q.tutorial > 0) {
      // soft banner only — keep moon/earth/ring visible
      ctx.fillStyle = "rgba(7,10,20,0.72)";
      ctx.fillRect(16, H * 0.12, W - 32, 58);
      ctx.strokeStyle = "#3A4A6B";
      ctx.strokeRect(16, H * 0.12, W - 32, 58);
      ctx.fillStyle = "#FFD166";
      ctx.font = "bold 13px " + monoFamily;
      ctx.textAlign = "center";
      ctx.fillText(q.calibration ? "光圈套住校准靶" : "光圈套住月亮", W / 2, H * 0.12 + 24);
      ctx.fillStyle = "#F0E6D3";
      ctx.font = "12px " + monoFamily;
      const extra = G.diff === "blood" ? " · 首次会挣脱" : "";
      ctx.fillText(`进圈后按捕获 · 需套住 ${q.need} 次${extra}`, W / 2, H * 0.12 + 44);
    }

    if (q.ready) {
      ctx.fillStyle = "#FFD166";
      ctx.font = "bold 14px " + monoFamily;
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
    ctx.font = "bold 16px " + monoFamily;
    ctx.textAlign = "center";
    ctx.fillText("追上月亮了！", W / 2, H * 0.18);
    ctx.fillStyle = "#F0E6D3";
    ctx.font = "11px " + monoFamily;
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

  function drawReunion() {
    const t = G.reunionT || 0, p = easeInOut(clamp(t / 2, 0, 1));
    ctx.fillStyle = '#0C1D30'; ctx.fillRect(0, 0, W, H); drawStipple(.08); drawStars(0);
    ctx.strokeStyle = 'rgba(212,168,75,.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(135, 232, 74, 46, -.2, 0, Math.PI * 2); ctx.stroke();
    const ex = lerp(65, 119, p), ey = lerp(275, 238, p), mx = lerp(211, 151, p), my = lerp(190, 224, p);
    drawEarth({ x: ex, y: ey, r: 20, angle: t * .3, jetT: 0, hitFlash: 0 });
    drawMoon({ x: mx, y: my, r: 24 });
    ctx.fillStyle = '#F0E6D3'; ctx.font = '700 25px ' + titleFamily; ctx.textAlign = 'center'; ctx.fillText('月之重逢', 135, 91);
    ctx.fillStyle = '#E8C878'; ctx.font = '11px ' + monoFamily; ctx.fillText('循着辉光，回到彼此身边。', 135, 341);
    ctx.strokeStyle = '#D4A84B'; ctx.beginPath(); ctx.moveTo(72, 367); ctx.lineTo(198, 367); ctx.stroke();
  }

  function render(dt) {
    if (!ctx || ['cover', 'title', 'classic', 'map', 'growth', 'dailyBrief', 'meditation', 'storageError'].indexOf(G.state) >= 0) return;
    if (G.state === 'reunion') { drawReunion(); return; }
    if (isV2() && (G.state === 'result' || G.state === 'card')) return;
    if (pauseReasons.size) dt = 0;
    let ox = 0;
    let oy = 0;
    if (G.shake > 0 && !G.reduceMotion) {
      ox = rand(-G.shake, G.shake);
      oy = rand(-G.shake, G.shake);
      G.shake = Math.max(0, G.shake - dt * 22);
    }

    ctx.save();
    ctx.translate(ox, oy);

    // playfield
    ctx.fillStyle = isV2() ? '#15202E' : '#0B1520';
    ctx.fillRect(-10, -10, W + 20, H + 20);

    const inRun = G.state === "play" || G.state === "discover" || G.state === "qte";
    if (inRun) drawStipple(0.1);
    drawStars(dt);
    if (!isV2()) drawDarkTendril();
    else {
      // Sparse printed navigation lines; never bake obstacles into the scene.
      dashedLine(VIEW.vx, VIEW.vy + 18, 28, 350, 'rgba(232,200,120,0.12)', 5, 14);
      dashedLine(VIEW.vx, VIEW.vy + 18, 242, 350, 'rgba(232,200,120,0.12)', 5, 14);
    }

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
          const flat = Object.assign({}, b, { x: 0, y: 0 });
          if (b.type === 'gate') {
            ctx.strokeStyle = '#C5B89A'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(-b.r, -12); ctx.lineTo(-b.r, 12);
            ctx.moveTo(b.r, -12); ctx.lineTo(b.r, 12); ctx.stroke();
            ctx.fillStyle = '#E8C878'; ctx.fillRect(-b.r - 3, -15, 6, 5); ctx.fillRect(b.r - 3, -15, 6, 5);
            ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(-b.r + 3, 0); ctx.lineTo(b.r - 3, 0); ctx.stroke(); ctx.setLineDash([]);
          } else if (b.type === "well") drawWell(flat);
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
      if (G.state === 'qte' && G.qte && G.qte.calibration) drawCalibrationTarget();
    else drawMoon(G.moon);
      drawBlood();
      if (G.earth) drawEarth(G.earth);
      drawParticles();
      if (G.state === "discover") drawDiscover();
      if (G.state === "qte") drawQTE();
      if (!isV2() && G.state === "play" && G.runT < 6.5) {
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

  function getReviveOffer() {
    return {
      offerId: offer ? offer.id : null,
      eligible: !!(offer && !offer.consumed && G.state === 'revive'),
      used: assisted,
      reason: G.dailyMode ? '竞速不提供续玩' : assisted ? '本局已续玩' : !options.reviveEnabled ? '续玩暂不可用' : '仅追逐失败可续玩'
    };
  }
  function completeRevive(offerId) {
    if (!offer || offer.consumed || offer.id !== offerId || G.state !== 'revive' || assisted) return false;
    offer.consumed = true;
    assisted = true; pending = null;
    G.earth.mass = diffConf().massStart;
    G.earth.alive = true; G.earth.invuln = 1.5;
    G.earth.vx = G.earth.vy = 0;
    G.earth.jetT = G.earth.jetCd = G.earth.hitFlash = 0;
    G.earth.x = clamp(G.earth.x, G.earth.r + 4, W - G.earth.r - 4);
    G.earth.y = clamp(G.earth.y, 56, H - 57);
    G.bodies = []; G.spawnAcc = 0; G.wellSticky = 0;
    if (G.blood) { G.blood.spike = G.blood.shock = null; G.blood.spikeT = 2.2; G.blood.shockT = 3.6; }
    G.outcome = G.failReason = G.parts = null;
    G.score = 0; G.hitStop = G.shake = G.flash = 0;
    setState('play');
    showToast('已续玩 · 不计本机榜与纪录');
    return true;
  }
  function declineRevive(offerId) {
    if (!offer || offer.consumed || offer.id !== offerId || G.state !== 'revive') return false;
    offer.consumed = true;
    finalizeResult();
    return true;
  }
  function pause(reason) {
    const wasPaused = pauseReasons.size > 0;
    pauseReasons.add(String(reason || 'manual'));
    resetInput();
    if (!wasPaused && AudioEngine.ctx) {
      if (AudioEngine.master) AudioEngine.master.gain.value = 0;
      try {
        const result = AudioEngine.ctx.suspend();
        if (result && result.catch) result.catch(function () {});
      } catch (_) {}
    }
  }
  function resume(reason) {
    pauseReasons.delete(String(reason || 'manual'));
    resetInput();
    if (!pauseReasons.size && AudioEngine.ctx) {
      if (AudioEngine.master) AudioEngine.master.gain.value = AudioEngine.enabled ? 0.9 : 0;
      AudioEngine._nextTime = AudioEngine.ctx.currentTime + 0.05;
      if (AudioEngine.enabled) AudioEngine.resume();
    }
  }
  function advance(dt) {
    G.t += dt;
    if (toastT > 0) { toastT = Math.max(0, toastT - dt); if (!toastT) toast = ''; }
    if (G.state === 'cover' || G.state === 'title') G.titleOrbit += dt;
    AudioEngine.collectBuses();
    if (AudioEngine._tick && AudioEngine.enabled) AudioEngine._tick();
    if (pending) {
      pending.remaining -= dt;
      updateParticles(dt);
      if (pending.remaining <= 1e-9) {
        const kind = pending.kind;
        pending = null;
        if (kind === 'failure' && !isV2() && options.reviveEnabled && !G.dailyMode && !assisted) {
          offer = { id: `run${runSequence}-offer${++offerSequence}`, consumed: false };
          setState('revive');
        } else finalizeResult();
      }
      return;
    }
    if (G.hitStop > 0) {
      G.hitStop = Math.max(0, G.hitStop - dt);
      updateParticles(dt * 0.35);
      return;
    }
    if (G.state === 'reunion') {
      G.reunionT += dt; updateParticles(dt);
      if (G.reunionT >= 2.4) finishV2(true);
    }
    else if (G.state === 'intro') updateIntro(dt);
    else if (G.state === 'meditation') {
      const m = G.meditation;
      if (m && m.running) {
        m.elapsed = Math.min(m.duration, m.elapsed + dt);
        if (m.elapsed >= m.duration) { m.running = false; m.completed = true; }
      }
      updateParticles(dt);
    }
    else if (G.state === 'play' || G.state === 'discover' || G.state === 'qte') {
      G.runT += dt;
      if (isV2() && G.mode === 'daily' && G.runT >= 150 - 1e-8) {
        G.runT = 150; finishV2(true); return;
      }
      if (G.state === 'play') updatePlay(dt);
      else if (G.state === 'discover') updateDiscover(dt);
      else updateQTE(dt);
    } else if (G.state !== 'revive') updateParticles(dt);
  }
  function update(dt) {
    if (pauseReasons.size || !isFinite(dt) || dt <= 0) return;
    // Keep the original <=50 ms physics step while making all delays depend on
    // game time rather than wall-clock timers. The host resets its frame time.
    let remaining = Math.min(dt, 60);
    while (remaining > 1e-9 && !pauseReasons.size) {
      const step = Math.min(remaining, 0.05);
      advance(step); remaining -= step;
    }
  }
  function setInput(input) {
    if (pauseReasons.size || (G.state !== 'play' && G.state !== 'qte') || pending || !G.earth.alive) return;
    input = input || {};
    Input.ax = clamp(Number(input.ax) || 0, -1, 1);
    Input.ay = clamp(Number(input.ay) || 0, -1, 1);
    Input.jet = !!input.jetHeld;
  }
  function pressJet() {
    if (!pauseReasons.size && G.state === 'play' && !pending && G.earth.alive && (!isV2() || G.v2.abilities.jet > 0)) {
      AudioEngine.unlockFromGesture(); Input.jetPressed = true;
    }
  }
  function pressCapture() {
    if (!pauseReasons.size && G.state === 'qte' && !pending) {
      AudioEngine.unlockFromGesture(); Input.qtePressed = true;
    }
  }
  function action(name, payload) {
    if (name === 'pauseRun' && (G.state === 'play' || G.state === 'qte')) { pause('manual'); return true; }
    if (name === 'resumeRun' && pauseReasons.has('manual')) { resume('manual'); return true; }
    if (name === 'abandon' && (pauseReasons.has('manual') || G.state === 'grant')) {
      resume('manual'); pending = null; offer = null; toast = ''; toastT = 0;
      G.v2 = null; G.mode = 'classic'; G.diff = clampDiff(Store.data.diff); setState('title'); return true;
    }
    if (pauseReasons.size) return false;
    const screen = G.state;
    if (name === 'openMeditation' && screen === 'title') {
      G.meditation = { duration: 300, elapsed: 0, running: false, completed: false };
      AudioEngine.unlockFromGesture(); AudioEngine.sfx('click'); setState('meditation'); return true;
    }
    if (screen === 'meditation') {
      const m = G.meditation;
      if (name === 'backToHub') { G.meditation = null; setState('title'); return true; }
      if (name === 'setMeditationDuration' && m && !m.running) {
        const duration = Number(payload);
        if ([120, 300, 600].indexOf(duration) < 0) return false;
        m.duration = duration; m.elapsed = 0; m.completed = false; return true;
      }
      if (name === 'startMeditation' && m && !m.running) {
        m.elapsed = 0; m.running = true; m.completed = false;
        AudioEngine.unlockFromGesture(); AudioEngine.startMusic('title'); return true;
      }
    }
    const isMenu = screen === 'title' || screen === 'classic';
    const outOfRun = ['title', 'classic', 'map', 'growth', 'dailyBrief', 'result'].indexOf(screen) >= 0;
    if (name === 'retryStorage' && (screen === 'storageError' || isMenu)) {
      loadBest(); if (!Store._readFail) setState('title'); return !Store._readFail;
    }
    if (screen === 'storageError' && name === 'openCover') { setState('cover'); return true; }
    if (name === 'claimAbility') return claimV2Ability();
    if (name === 'retrySave' && screen === 'result') return saveV2Result();
    if (screen === 'result' && isV2() && !finalized) return false;
    if (outOfRun && ['openCampaign', 'openGrowth', 'openDaily', 'openClassic', 'backToHub', 'continueCampaign', 'startCampaign', 'startDaily', 'startEndless', 'selectDailyPool', 'selectLevel', 'upgradeAbility'].indexOf(name) >= 0) {
      if (Store._readFail) { setState('storageError'); return false; }
      toast = ''; toastT = 0;
      AudioEngine.unlockFromGesture(); AudioEngine.sfx('click');
      if (name === 'openCampaign') { const next = Campaign.nextLevel(Store.data); selectedLevel = next ? next.id : Campaign.LEVELS[Campaign.LEVELS.length - 1].id; setState('map'); }
      else if (name === 'selectLevel' && screen === 'map') {
        const id = typeof payload === 'object' && payload ? payload.id : payload;
        if (!Campaign.level(id)) return false; selectedLevel = id;
      } else if (name === 'continueCampaign') {
        const next = Campaign.nextLevel(Store.data);
        if (next) return beginV2('campaign', next.id);
        setState('dailyBrief');
      } else if (name === 'startCampaign') {
        const id = typeof payload === 'object' && payload ? payload.id : payload;
        return beginV2('campaign', id || selectedLevel);
      } else if (name === 'startDaily') return beginV2('daily', null, selectedDailyPool);
      else if (name === 'selectDailyPool' && screen === 'dailyBrief') {
        if (!Progression.dailyPoolUnlocked(Store.data, payload)) return false;
        selectedDailyPool = payload; return true;
      }
      else if (name === 'startEndless') return beginV2('endless');
      else if (name === 'openGrowth') { growthError = ''; setState('growth'); }
      else if (name === 'openDaily') {
        if (Progression.dailyPoolUnlocked(Store.data, 'C')) selectedDailyPool = 'C';
        else if (Progression.dailyPoolUnlocked(Store.data, 'B')) selectedDailyPool = 'B';
        setState('dailyBrief');
      }
      else if (name === 'openClassic') { G.diff = clampDiff(Store.data.diff); setState('classic'); }
      else if (name === 'backToHub') { G.diff = clampDiff(Store.data.diff); setState('title'); }
      else if (name === 'upgradeAbility' && screen === 'growth') {
        const tx = Progression.upgrade(Store.data, payload && payload.ability, payload && payload.expectedLevel);
        if (!tx.ok) { growthError = ({ locked: '主线授予后可强化', 'max-level': '已完成强化', 'stale-level': '能力等级已更新', 'insufficient-points': '成长点不足' })[tx.reason] || '暂时无法强化'; return false; }
        if (!Store.commit(tx.data)) { growthError = '保存失败，成长点未扣除'; return false; }
        growthError = ''; showToast(({ jet: '喷射', pulse: '双脉冲', sail: '引力帆' }[payload && payload.ability] || '能力') + '强化已保存');
      } else return false;
      return true;
    }
    if (name === 'retry' && screen === 'result' && isV2()) {
      if (G.mode === 'daily') return beginV2('daily', null, G.v2.route.pool);
      if (G.mode === 'endless') return beginV2('endless');
      const next = G.v2.result.completed ? Campaign.nextLevel(Store.data) : G.v2.level;
      if (!next) { setState('dailyBrief'); return true; }
      return beginV2('campaign', next.id);
    }
    // Public actions are explicit and state-gated so stale touches cannot skip
    // a failure or abandon a score while it is awaiting finalization.
    if (name === 'declineRevive') return declineRevive(typeof payload === 'object' && payload ? payload.offerId : payload || (offer && offer.id));
    const allowed = {
      openMenu: screen === 'cover', openCover: isMenu,
      setDifficulty: isMenu, toggleRace: isMenu, toggleSound: isMenu,
      start: isMenu, skipIntro: screen === 'intro', retry: screen === 'result',
      home: screen === 'result', openBoard: screen === 'result' || isMenu,
      backFromBoard: screen === 'board', openCard: screen === 'result', backFromCard: screen === 'card'
    };
    if (!allowed[name]) return false;
    AudioEngine.unlockFromGesture();
    AudioEngine.sfx('click');
    if (name === 'openMenu') setState(Store._readFail ? 'storageError' : 'title');
    else if (name === 'openCover') setState('cover');
    else if (name === 'setDifficulty') {
      const key = typeof payload === 'object' && payload ? payload.key || payload.difficulty : payload;
      const index = LADDER.indexOf(key);
      if (index < 0) return false;
      if (index > LADDER.indexOf(maxUnlockedDiff())) {
        showToast(`通关「${DIFF[LADDER[index - 1]].label}」后解锁`); return false;
      }
      G.diff = key; Store.data.diff = key; Store.save();
    } else if (name === 'toggleRace') menuDaily = !menuDaily;
    else if (name === 'toggleSound') {
      AudioEngine.setEnabled(!AudioEngine.enabled);
      if (AudioEngine.enabled) AudioEngine.startMusic('title');
      if (!AudioEngine.ctx) showToast('此环境暂无合成音频');
      Store.data.sound = AudioEngine.enabled; Store.save();
    } else if (name === 'start') beginRun(menuDaily);
    else if (name === 'skipIntro') startRun();
    else if (name === 'retry') applyNextStop();
    else if (name === 'home') {
      toast = ''; toastT = 0;
      G.diff = clampDiff(Store.data.diff); setState('title');
    } else if (name === 'openBoard') { G.boardFrom = screen; setState('board'); }
    else if (name === 'backFromBoard') setState(G.boardFrom === 'result' ? 'result' : 'title');
    else if (name === 'openCard') setState('card');
    else if (name === 'backFromCard') setState('result');
    return true;
  }
  function resultView() {
    const end = ENDINGS[G.outcome] || ENDINGS.fail;
    if (!G.earth) return { title: end.title, description: end.desc, color: end.color, rows: [], rankText: '', nextLabel: '再来一局' };
    const p = G.parts || { ms: massScore(), ds: distScore(), qs: G.qte ? qteScore() : 0 };
    const q = G.qte;
    const grade = (value) => value >= 80 ? 'gold' : value >= 50 ? 'ok' : 'bad';
    const rows = [
      { label: '总分', value: String(Math.round(G.score)), tone: grade(G.score) },
      { label: '质量', value: `${Math.round(G.earth.mass)} · ${Math.round(p.ms)}`, tone: grade(p.ms) },
      { label: '追近', value: `${Math.round(G.progress * 100)}% · ${Math.round(p.ds)}`, tone: grade(p.ds) },
      { label: 'QTE', value: q ? `锁${q.locks}/${q.need} P${q.perfect}/G${q.good}/M${q.miss}` : '未进入捕获', tone: grade(p.qs) }
    ];
    if (G.clearT != null) {
      rows.push({ label: '用时', value: fmtTime(G.clearT), tone: G.newPB ? 'gold' : '' });
      if (Store.data.pb[G.diff]) rows.push({ label: '纪录', value: (G.newPB ? '新纪录 ' : '最佳 ') + fmtTime(Store.data.pb[G.diff]), tone: G.newPB ? 'gold' : '' });
      if (G.dailyMode && Store.data.daily.bestTime) rows.push({ label: '今日最佳', value: fmtTime(Store.data.daily.bestTime), tone: G.newDailyTime ? 'gold' : '' });
    }
    if (G.lastBest) rows.push({ label: '最佳', value: String(G.lastBest.score), tone: '' });
    rows.push({ label: '难度', value: DIFF[G.diff].label + (G.dailyMode ? ' · 竞速' : ''), tone: '' });
    if (G.failReason && G.outcome === 'fail' && !q) rows.push({ label: '原因', value: G.failReason, tone: 'bad' });
    if (assisted) rows.push({ label: '续玩', value: '已续玩 · 不计本机榜与纪录', tone: '' });
    const next = G.nextStop || nextStopPlan();
    const rank = assisted ? '已续玩 · 不计本机榜与纪录' : G.rank > 0 ? `本机榜 #${G.rank} · 共 ${Store.data.board.length} 条` : '';
    return {
      title: end.title, description: end.desc, color: end.color, rows,
      rankText: [rank, next.upgrade ? `下一站 · ${DIFF[next.diff].label}` : ''].filter(Boolean).join('　'),
      nextLabel: next.label, assisted
    };
  }
  function abilityText(abilities) {
    const tiers = ['未获得', 'Ⅰ', 'Ⅱ', 'Ⅲ'];
    return '喷射 ' + tiers[(abilities && abilities.jet) || 0];
  }
  function v2ResultView() {
    if (!isV2() || !G.v2.result) return null;
    const v = G.v2, r = v.result, daily = G.mode === 'daily';
    const ratings = { none: '未达评级', bronze: '铜', silver: '银', gold: '金' };
    const next = Campaign.nextLevel(Store.data);
    if (G.mode === 'endless') {
      const best = Store.data.endlessV2.best;
      return { kind: 'endless', completed: false, title: '追寻结束', subtitle: '无尽追寻 · 生存纪录',
        rows: [{ label: '本次追寻', value: fmtTime(r.time) }, { label: '拾取月辉', value: String(r.signals) },
          { label: '本机最佳', value: best ? fmtTime(best.time) : fmtTime(r.time) }],
        reward: 0, points: Store.data.growthV2.points, savePending: !finalized, saveError: v.saveError,
        nextLabel: '再次追寻', abilityText: abilityText(r.abilities), newBest: v.newBest === true,
        bestText: best ? fmtTime(best.time) : fmtTime(r.time),
        recordText: !finalized ? '保存成功后更新纪录' : v.newBest ? '新的本机最长追寻' : '本机最佳 ' + (best ? fmtTime(best.time) : fmtTime(r.time)) };
    }
    const rows = daily ? [
      { label: '本次成绩', value: r.score + ' · ' + ratings[Daily.rating(r.score)] },
      { label: '存活航段', value: r.segments + '/3 · ' + fmtTime(r.time) },
      { label: '月辉 / 技巧门', value: r.signals + '/60 · ' + r.gates + '/3' },
      { label: '归属航行日', value: r.date + ' · ' + r.pool }
    ] : [
      { label: '月之辉光', value: r.signals + ' / ' + v.level.target },
      { label: '追近 / 质量', value: Math.round(G.progress * 100) + '% · ' + Math.round(G.earth.mass) },
      { label: '本次用时', value: fmtTime(r.time) },
      { label: '教学进度', value: v.levelId === 'L02' ? '通过岩阵 ' + v.rockGroups + '/3' : v.levelId === 'L03' ? '星尘补给 ' + v.dust + ' 次' : v.levelId === 'L04' ? '定向喷射 ' + v.jets + ' 次' : v.levelId === 'L05' ? '通过井场 ' + v.rockGroups + '/3' : v.levelId === 'L06' ? '额外脉冲 ' + v.pulses + ' 次' : v.levelId === 'L08' ? '校准锁定 ' + v.locks + '/2' : v.levelId === 'L09' ? '潮汐序列 ' + v.tides + '/3' : v.levelId === 'L10' ? '借力释放 ' + v.sails + ' 次' : v.levelId === 'L11' ? '潮汐段 ' + v.rockGroups + '/3' : v.levelId === 'L12' ? '有效锁定 ' + v.locks + '/3' : '已辨认金色辉光' }
    ];
    const best = !daily && Store.data.campaignV2.best[v.levelId];
    return { kind: G.mode, completed: r.completed,
      title: r.completed ? (daily ? '航行完成' : v.levelId === 'L12' ? '月之重逢' : '航迹已点亮') : '本次偏航',
      subtitle: daily ? '每日 ' + r.pool + ' · ' + (r.pool === 'B' ? '深空航行' : r.pool === 'C' ? '暗潮航行' : '近地航行') : v.levelId + ' · ' + v.level.name,
      rows, reward: v.reward || 0, points: Store.data.growthV2.points,
      savePending: !finalized, saveError: v.saveError,
      nextLabel: daily ? '再次航行' : !r.completed ? '重试本关' : next ? '继续 ' + next.id : '前往每日航行',
      abilityText: abilityText(r.abilities) + (r.grants.length ? ' · 本局新获得' : ''),
      recordText: !finalized ? '保存成功后发放奖励' : daily ? '本机纪录 · 同日同池同版本' : best ? '本关最佳 ' + fmtTime(best.time) + ' · ' + abilityText(best.abilities) : (G.failReason || '')
    };
  }
  function v2View() {
    const data = Store.data, next = Campaign.nextLevel(data), a = data.growthV2.abilities;
    const date = Daily.dateKey(clock()), day = Daily.rewardState(data, date), pool = selectedDailyPool;
    const key = date + '|' + pool + '|' + (pool === 'C' ? Daily.RULE_VERSION_C : pool === 'B' ? Daily.RULE_VERSION_B : Daily.RULE_VERSION), record = data.dailyV2.records[key];
    const best = record && record.best;
    const abilityRows = [
      { id: 'jet', name: '喷射', source: 'L04 第一脉冲授予', effect: a.jet ? '消耗 ' + Progression.jetParams(a.jet).cost + ' · 恢复 ' + Progression.jetParams(a.jet).cooldown + '秒' : '朝移动方向主动推进' },
      { id: 'pulse', name: '双脉冲', source: 'L06 双重脉冲授予', effect: '冷却期间可再发动一次' },
      { id: 'sail', name: '引力帆', source: 'L10 借力航行授予', effect: '掠过引力井外缘后助推' }
    ].map(row => {
      const level = a[row.id], cost = level > 0 && level < 3 ? Progression.upgradeCost(row.id, level) : null;
      const p = row.id === 'jet' && level > 0 && level < 3 ? Progression.jetParams(level + 1) : null;
      const pulse = row.id === 'pulse' && level > 0 && level < 3 ? Progression.pulseParams(level + 1) : null;
      const sail = row.id === 'sail' && level > 0 && level < 3 ? Progression.sailParams(level + 1) : null;
      return Object.assign(row, { level, cost, canUpgrade: cost != null && data.growthV2.points >= cost,
        nextEffect: p ? '消耗 ' + p.cost + ' · 恢复 ' + p.cooldown + '秒' : pulse ? '额外脉冲恢复 ' + pulse.recovery + ' 秒' : sail ? '外缘蓄力 ' + sail.charge + ' 秒' : level === 3 ? '已完成强化' : '主线授予后可强化' });
    });
    const v = isV2() ? G.v2 : null;
    const jet = v ? Progression.jetParams(v.abilities.jet) : null;
    const pulse = v ? Progression.pulseParams(v.abilities.pulse) : null;
    return {
      mode: G.mode, storageError: Store._readFail,
      hub: { nextId: next ? next.id : null, nextName: next ? next.name : '', complete: !next, points: data.growthV2.points,
        completedCount: data.campaignV2.completed.length, totalLevels: Campaign.LEVELS.length,
        chapter: next ? next.chapter : 3, chapterName: next ? ({ 1: '循光启程', 2: '穿越引力', 3: '月之暗面' }[next.chapter]) : '月之重逢',
        dailyPool: Progression.dailyPoolUnlocked(data, 'C') ? 'C' : Progression.dailyPoolUnlocked(data, 'B') ? 'B' : 'A',
        dailyUnlocked: data.campaignV2.completed.indexOf('L04') >= 0, endlessUnlocked: data.campaignV2.completed.indexOf('L04') >= 0,
        endlessBestText: data.endlessV2.best ? fmtTime(data.endlessV2.best.time) : '' },
      map: { selectedId: selectedLevel, chapter: 3, nextChapterText: next ? '继续 ' + next.id + ' · ' + next.name : '主线航程已完成', levels: Campaign.LEVELS.map(level => {
        const best = data.campaignV2.best[level.id];
        return { id: level.id, name: level.name, chapter: level.chapter, target: level.target, objective: level.objectiveText,
          unlocked: Campaign.unlocked(data, level.id), completed: data.campaignV2.completed.indexOf(level.id) >= 0,
          selected: level.id === selectedLevel, bestText: best ? '最佳 ' + fmtTime(best.time) + ' · ' + abilityText(best.abilities) : '' };
      }) },
      growth: { points: data.growthV2.points, abilities: abilityRows, error: growthError },
      daily: { date, pool, name: pool === 'C' ? '暗潮航行' : pool === 'B' ? '深空航行' : '近地航行', unlocked: Progression.dailyPoolUnlocked(data, pool), remainingRewards: day.remaining,
        pools: [{ id: 'A', name: '近地', unlocked: Progression.dailyPoolUnlocked(data, 'A') },
          { id: 'B', name: '深空', unlocked: Progression.dailyPoolUnlocked(data, 'B') },
          { id: 'C', name: '暗潮', unlocked: Progression.dailyPoolUnlocked(data, 'C') }],
        bestText: best ? String(best.score) + ' 分' : '尚无本机纪录', bestScore: best ? best.score : null, bestAbilitiesText: best ? abilityText(best.abilities) : abilityText(a),
        rating: best ? Daily.rating(best.score) : 'none', version: pool === 'C' ? Daily.RULE_VERSION_C : pool === 'B' ? Daily.RULE_VERSION_B : Daily.RULE_VERSION,
        historyText: Object.keys(data.dailyV2.records).some(k => k.startsWith(date + '|' + pool + '|') && k !== key) ? '另有旧规则纪录，分开保存' : '' },
      run: v ? { title: G.mode === 'endless' ? '无尽追寻' : G.mode === 'daily' ? '每日 ' + v.route.pool + ' · ' + (v.route.pool === 'C' ? '暗潮航行' : v.route.pool === 'B' ? '深空航行' : '近地航行') : v.levelId + ' · ' + v.level.name,
        objective: G.mode === 'endless' ? '尽可能延长生存时间' : G.mode === 'daily' ? '存活 150 秒，追光得分' : v.level.objectiveText,
        hint: v2Hint(), signals: v.signals, target: v.level ? v.level.target : 60, dust: v.dust,
        rockGroups: v.rockGroups, jets: v.jets, pulses: v.pulses, mass: G.earth.mass, elapsed: G.runT, remaining: Math.max(0, 150 - G.runT), score: G.score,
        segment: Math.min(3, Math.floor(G.runT / 50) + 1), jetLevel: v.abilities.jet,
        jetCooldown: G.earth.jetCd, jetCooldownMax: jet ? jet.cooldown : 0,
        pulseCooldown: G.earth.pulseCd || 0, pulseCooldownMax: pulse ? pulse.recovery : 0,
        showMass: v.levelId !== 'L01' || v.abilities.jet > 0, grantPending: G.state === 'grant', grantError: v.grantError,
        grantAbility: v.pendingGrant ? v.pendingGrant.ability : 'jet', grantLevelId: v.pendingGrant ? v.pendingGrant.levelId : 'L04' } : null,
      result: v2ResultView()
    };
  }
  function drawV2Share(g, w, h) {
    const r = v2ResultView(); if (!r) return;
    const daily = r.kind === 'daily';
    const endless = r.kind === 'endless';
    const dateRow = r.rows.find(row => row.label === '归属航行日');
    const timeRow = r.rows.find(row => row.label === (daily ? '存活航段' : endless ? '本次追寻' : '本次用时'));
    const date = dateRow ? String(dateRow.value).split(' · ')[0] : '';
    const time = timeRow ? String(timeRow.value).split(' · ').pop() : '';
    const score = daily ? String((r.rows[0] || {}).value || '').split(' · ')[0] : time;
    const rating = daily ? Daily.rating(Number(score)) : 'none';
    const ratingText = { none: '未达评级', bronze: '铜级航线', silver: '银级航线', gold: '金色航线' }[rating];
    const mission = daily ? (dateRow ? String(dateRow.value).split(' · ')[1] || 'A' : 'A') : endless ? '∞' : String(r.subtitle).split(' · ')[0];
    const moonArt = (endless || (daily && mission === 'C') || /^L(09|10|11|12)$/.test(mission)) && ART.moonDark ? ART.moonDark : ART.moon;
    g.save(); g.scale(w / 540, h / 860);
    g.fillStyle = '#E8DCC8'; g.fillRect(0, 0, 540, 860);
    g.fillStyle = '#0C1D30'; g.fillRect(18, 18, 504, 824);
    for (let i = 0; i < 620; i++) {
      const x = 22 + ((i * 89 + 31) % 491) / 491 * 496;
      const y = 22 + ((i * 53 + 47) % 797) / 797 * 816;
      g.fillStyle = i % 6 ? 'rgba(240,230,211,.055)' : 'rgba(212,168,75,.16)';
      g.fillRect(x, y, i % 6 ? 1 : 1.7, i % 6 ? 1 : 1.7);
    }
    for (let i = 0; i < 34; i++) {
      const y = 44 + (i * 71) % 754;
      g.fillStyle = 'rgba(232,220,200,.52)'; g.fillRect(18, y, i % 3 ? 2 : 4, 2);
      g.fillRect(520 - (i % 3 ? 0 : 2), y + 11, 2, 2);
    }
    g.strokeStyle = '#D4A84B'; g.lineWidth = 1.5; g.strokeRect(31, 31, 478, 798);
    function write(value, x, y, size, color, align, maxWidth, weight, family) {
      g.fillStyle = color || '#F0E6D3'; g.font = (weight || '400') + ' ' + size + 'px ' + (family || monoFamily);
      g.textAlign = align || 'left'; g.fillText(String(value), x, y, maxWidth || 440);
    }
    function stroke(color, width) { g.strokeStyle = color; g.lineWidth = width || 1; g.stroke(); }
    function routeCircle(x, y, radius, color, width) {
      g.beginPath(); g.arc(x, y, radius, 0, Math.PI * 2); stroke(color, width || 1.2);
    }
    write('CHASE THE MOON', 48, 68, 17, '#E8C878', 'left', 260, '400', displayFamily);
    write(date || mission, 492, 68, 14, '#D4A84B', 'right', 190);
    g.beginPath(); g.moveTo(48, 88); g.lineTo(492, 88); stroke('#D4A84B', 1);
    write(daily ? '每日航线' : r.title, 49, 137, 37, '#D4A84B', 'left', 430, '700', titleFamily);
    write(daily ? '每日航线' : r.title, 47, 135, 37, '#F0E6D3', 'left', 430, '700', titleFamily);
    write(daily ? 'DAILY ROUTE / NEAR EARTH' : endless ? 'ENDLESS PURSUIT / SURVIVAL' : 'MISSION LOG / ' + mission, 50, 169, 16, '#E8C878', 'left', 430, '400', displayFamily);
    g.beginPath(); g.ellipse(270, 329, 205, 119, -.18, 0, Math.PI * 2); stroke('rgba(212,168,75,.55)', 1.5);
    g.beginPath(); g.ellipse(270, 329, 165, 143, .47, 0, Math.PI * 2); stroke('rgba(212,168,75,.24)', 1);
    g.beginPath(); g.moveTo(118, 404); g.quadraticCurveTo(163, 198, 421, 241); stroke('#D4A84B', 4);
    g.setLineDash([6, 8]); g.beginPath(); g.moveTo(118, 404); g.quadraticCurveTo(212, 218, 421, 241); stroke('#F0E6D3', 1.4); g.setLineDash([]);
    [[232, 272], [292, 247], [348, 238]].forEach(point => {
      g.beginPath(); g.moveTo(point[0], point[1] - 7); g.lineTo(point[0] + 7, point[1]);
      g.lineTo(point[0], point[1] + 7); g.lineTo(point[0] - 7, point[1]); g.closePath(); g.fillStyle = '#E8C878'; g.fill();
    });
    routeCircle(118, 404, 84, '#D4A84B', 1.4); routeCircle(421, 241, 71, '#D4A84B', 1.3);
    if (ART.earth) g.drawImage(ART.earth, 55, 341, 126, 126);
    else { g.beginPath(); g.arc(118, 404, 63, 0, Math.PI * 2); g.fillStyle = '#3D8B7A'; g.fill(); }
    if (moonArt) g.drawImage(moonArt, 361, 181, 120, 120);
    else { g.beginPath(); g.arc(421, 241, 60, 0, Math.PI * 2); g.fillStyle = '#D4A84B'; g.fill(); }
    write('SOL III / EARTH', 52, 492, 12, '#C5B89A');
    write('TARGET / LUNA', 492, 321, 12, '#C5B89A', 'right', 160);
    g.fillStyle = '#D97B3A'; g.fillRect(48, 521, 62, 5);
    write(daily ? 'SCORE / 今日得分' : endless ? 'SURVIVAL TIME / 生存时间' : 'MISSION TIME / 通关用时', 48, 548, 13, '#D4A84B');
    write(score, 45, 643, daily ? 94 : 78, '#E8C878', 'left', 340, '700', monoFamily);
    write(daily ? ratingText : r.subtitle, 50, 680, 18, '#F0E6D3', 'left', 330, '400', titleFamily);
    routeCircle(420, 602, 58, '#D4A84B', 1.5); routeCircle(420, 602, 49, 'rgba(232,200,120,.55)', 1);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      g.beginPath(); g.moveTo(420 + Math.cos(a) * 51, 602 + Math.sin(a) * 51);
      g.lineTo(420 + Math.cos(a) * 57, 602 + Math.sin(a) * 57); stroke('#D4A84B', 1);
    }
    write(daily ? (rating === 'none' ? '—' : rating === 'gold' ? '金' : rating === 'silver' ? '银' : '铜') : mission,
      420, 610, daily ? 40 : 25, '#E8C878', 'center', 82, '700', titleFamily);
    write(daily ? 'RATING' : 'MISSION', 420, 638, 10, '#C5B89A', 'center', 80);
    g.fillStyle = '#D97B3A'; g.fillRect(48, 718, 444, 8);
    write(daily ? time + ' / ' + (r.completed ? 'FULL ROUTE' : 'PARTIAL ROUTE') : endless ? '本机最长追寻已记录' :
      (r.abilityText.indexOf('本局新获得') >= 0 ? r.abilityText : r.completed ? '航程已完成' : '航程未完成'),
      48, 756, 14, '#E8C878', 'left', 440);
    write('本机航行纪录', 48, 800, 12, '#C5B89A', 'left', 200);
    write('SOL III  /  AD LUNAM', 492, 800, 12, '#C5B89A', 'right', 230);
    g.restore();
  }
  function getView() {
    const playing = G.state === 'play' || G.state === 'qte';
    const day = Store.data.daily;
    const cine = G.cine && CUTSCENE[G.cine.beat];
    return {
      screen: G.state, paused: pauseReasons.size > 0, manualPaused: pauseReasons.has('manual'), sound: AudioEngine.enabled,
      v2: v2View(),
      toast, titleOrbit: G.titleOrbit,
      meditation: G.state === 'meditation' && G.meditation ? {
        duration: G.meditation.duration, elapsed: G.meditation.elapsed,
        remaining: Math.max(0, Math.ceil(G.meditation.duration - G.meditation.elapsed)),
        running: G.meditation.running, completed: G.meditation.completed, visualTime: G.t,
        phase: G.meditation.running ? (G.meditation.elapsed % 8 < 4 ? 'inhale' : 'exhale') : 'still'
      } : null,
      menu: {
        difficulty: G.diff, difficultyLabel: DIFF[G.diff].label, daily: menuDaily,
        difficulties: LADDER.map((key, i) => ({ key, label: DIFF[key].label, unlocked: i <= LADDER.indexOf(maxUnlockedDiff()), selected: key === G.diff })),
        wellMultiplier: diffConf().wellMul
      },
      hud: { visible: playing, massFraction: clamp((G.earth.mass - PHYS.massMin) / (PHYS.massMax - PHYS.massMin), 0, 1), progressFraction: G.progress, sectorName: SECTORS[G.sector].name, timerVisible: G.dailyMode && playing, timerText: fmtTime(G.runT) },
      controls: { visible: playing && G.earth.alive && !pending, jetVisible: G.state === 'play' && (!isV2() || G.v2.abilities.jet > 0), captureVisible: G.state === 'qte', captureReady: !!(G.qte && G.qte.ready) },
      intro: { text: cine ? cine.text : '', opacity: G.cine ? clamp(G.cine.sceneT / 0.5, 0, 1) : 0 },
      result: resultView(),
      board: {
        entries: Store.data.board.map((entry, i) => ({ rank: i + 1, title: ENDINGS[entry.ending].title, color: ENDINGS[entry.ending].color, label: DIFF[entry.diff].label + (entry.daily ? ' · 竞速' : ''), score: entry.score, timeText: entry.time == null ? '' : fmtTime(entry.time), assisted: false })),
        dailyText: day.date === todayKey() && day.bestTime ? `今日竞速最佳：${fmtTime(day.bestTime)}（本机）` : `今日竞速尚未开始 · ${todayKey()}`
      },
      share: { text: shareText() + (assisted ? '\n已续玩 · 不计本机榜与纪录' : '') },
      revive: getReviveOffer()
    };
  }

  loadBest();
  AudioEngine.enabled = Store.data.sound !== false;
  resetRun();
  setState('cover');
  const api = { update, render, getView, setInput, pressJet, pressCapture, resetInput, pause, resume, action, getReviveOffer, completeRevive, declineRevive, drawShareCard };
  if (options.debug === true) {
    api.debug = {
      state() { return JSON.parse(JSON.stringify(Object.assign({}, G, { input: Input, pending, finalized, assisted }))); },
      patch(values) {
        Object.keys(values).forEach((key) => {
          if (key === 'earth') Object.assign(G.earth, values.earth);
          else if (key !== 'state' && key in G) G[key] = values[key];
        });
      },
      fail: lose,
      enterCapture,
      finishCapture(completed) {
        if (G.state !== 'qte') throw new Error('Capture must be active');
        G.qte.done = true; G.qte.endT = 0;
        G.qte.locks = completed ? G.qte.need : 0;
        G.qte.perfect = completed ? G.qte.need : 0;
        G.qte.bestCombo = completed ? G.qte.need : 0;
        finishQTE();
      }
    };
  }
  return api;
}
module.exports = { createGame };
