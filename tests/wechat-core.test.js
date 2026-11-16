'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('../minigame/src/core');

function fixture(options) {
  const writes = [];
  let saved = null;
  const storage = {
    getItem() { return saved; },
    setItem(key, value) { writes.push(JSON.parse(value)); saved = value; }
  };
  const game = createGame(Object.assign({ storage, debug: true, reviveEnabled: true, now: () => 1793912400000 }, options));
  game.action('openMenu');
  if (options && options.menuRace) game.action('toggleRace');
  game.action('start'); game.action('skipIntro');
  return { game, writes };
}

test('pause reasons stack and freeze inputs, run clock and delayed failure', () => {
  const { game, writes } = fixture();
  game.setInput({ ax: 1, ay: 0, jetHeld: true });
  game.pause('background'); game.pause('ad');
  const before = game.debug.state();
  game.update(1); game.resume('ad'); game.update(1);
  assert.equal(game.getView().paused, true);
  assert.equal(game.debug.state().runT, before.runT);
  assert.equal(game.debug.state().input.ax, 0);
  game.resume('background'); game.debug.fail('test');
  game.update(0.3); game.pause('background'); game.update(2);
  assert.equal(game.getView().screen, 'play');
  game.resume('background'); game.update(0.46);
  assert.equal(game.getView().screen, 'revive');
  assert.equal(writes.length, 0);
});

test('revive grants once, clears threats, keeps progress and excludes final score and PB', () => {
  const { game, writes } = fixture();
  game.debug.patch({ progress: 0.67, bodies: [{ type: 'well' }], earth: { mass: 15 } });
  game.debug.fail(); game.update(0.76);
  const offer = game.getReviveOffer();
  assert.equal(offer.eligible, true);
  assert.equal(game.completeRevive('old-offer'), false);
  assert.equal(game.completeRevive(offer.offerId), true);
  assert.equal(game.completeRevive(offer.offerId), false);
  const state = game.debug.state();
  assert.equal(state.earth.mass, 58);
  assert.equal(state.earth.invuln, 1.5);
  assert.equal(state.progress, 0.67);
  assert.equal(state.bodies.length, 0);
  assert.equal(game.getView().revive.used, true);
  game.debug.enterCapture(); game.debug.finishCapture(true); game.update(0.91);
  assert.equal(game.getView().screen, 'result');
  assert.match(game.getView().result.rankText, /已续玩/);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].board, []);
  assert.deepEqual(writes[0].pb, {});
  assert.ok(writes[0].ach.normal);
  game.update(3);
  assert.equal(writes.length, 1);
});

test('disabled ads, race and QTE failures never offer revive and finalize once', () => {
  for (const mode of ['disabled', 'race', 'qte']) {
    const { game, writes } = fixture({ reviveEnabled: mode !== 'disabled', menuRace: mode === 'race' });
    if (mode === 'qte') { game.debug.enterCapture(); game.debug.finishCapture(false); }
    else game.debug.fail();
    game.update(1);
    assert.equal(game.getView().screen, 'result', mode);
    assert.equal(game.getReviveOffer().eligible, false);
    assert.equal(writes.length, 1, mode);
    assert.equal(writes[0].board.length, 1);
    game.update(2);
    assert.equal(writes.length, 1);
  }
});

test('decline consumes current offer and stale reward cannot revive subsequent runs', () => {
  const { game, writes } = fixture();
  game.debug.fail(); game.update(0.76);
  const offer = game.getReviveOffer();
  assert.equal(game.declineRevive(offer.offerId), true);
  assert.equal(game.declineRevive(offer.offerId), false);
  assert.equal(game.completeRevive(offer.offerId), false);
  assert.equal(writes.length, 1);
  game.action('retry'); game.debug.fail(); game.update(0.76);
  assert.notEqual(game.getReviveOffer().offerId, offer.offerId);
  assert.equal(game.completeRevive(offer.offerId), false);
  assert.equal(game.getView().screen, 'revive');
});

test('QTE final delay pauses and successful final save updates PB and next difficulty once', () => {
  const { game, writes } = fixture();
  game.debug.patch({ runT: 81.3, progress: 1 });
  game.debug.enterCapture(); game.debug.finishCapture(true);
  game.update(0.4); game.pause('background'); game.update(3);
  assert.equal(writes.length, 0);
  assert.equal(game.getView().screen, 'qte');
  game.resume('background'); game.update(0.51);
  assert.equal(game.getView().screen, 'result');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].pb.easy, 81.3);
  assert.equal(writes[0].diff, 'normal');
  assert.equal(game.getView().result.nextLabel, '挑战宇宙冒险');
});

test('all difficulty settings preserve initial mass and locked selection is rejected', () => {
  const masses = { easy: 58, normal: 52, hard: 48, blood: 50 };
  for (const diff of Object.keys(masses)) {
    const storage = { getItem: () => JSON.stringify({ diff, ach: { normal: 1, hard: 1, blood: 1 } }), setItem() {} };
    const { game } = fixture({ storage });
    assert.equal(game.debug.state().earth.mass, masses[diff]);
    assert.equal(game.getView().menu.difficulty, diff);
  }
  const { game } = fixture(); game.action('home');
  assert.equal(game.action('setDifficulty', 'blood'), false);
  assert.equal(game.getView().menu.difficulty, 'easy');
});

test('production does not expose debug and cover/menu render never clear UI canvas', () => {
  let operations = 0;
  const ctx = new Proxy({}, { get(target, key) { return target[key] || (() => { operations++; }); }, set(target, key, value) { target[key] = value; return true; } });
  const game = createGame({ ctx });
  assert.equal(game.debug, undefined);
  game.render(0.016); game.action('openMenu'); game.render(0.016);
  assert.equal(operations, 0);
});

test('real intro, depth chase, discover and capture actions complete all four difficulties', () => {
  for (const difficulty of ['easy', 'normal', 'hard', 'blood']) {
    const writes = [];
    const storage = {
      getItem: () => JSON.stringify({ diff: difficulty, ach: { normal: 1, hard: 1, blood: 1 } }),
      setItem(key, value) { writes.push(JSON.parse(value)); }
    };
    const game = createGame({ storage, debug: true });
    game.action('openMenu'); game.action('start');
    game.update(11.7);
    assert.equal(game.getView().screen, 'play', difficulty);
    game.update(4.2);
    const bodies = game.debug.state().bodies;
    assert.ok(bodies.length > 0, difficulty);
    assert.ok(bodies.every((body) => Number.isFinite(body.z) && Number.isFinite(body.lx) && Number.isFinite(body.ly)));
    game.debug.patch({ progress: 1, bodies: [] }); game.update(0.01);
    assert.equal(game.getView().screen, 'discover');
    game.update(2.5);
    assert.equal(game.getView().screen, 'qte');
    const need = difficulty === 'easy' ? 2 : 3;
    const attempts = need + (difficulty === 'blood' ? 1 : 0);
    for (let lock = 0; lock < attempts; lock++) {
      const state = game.debug.state();
      const qte = Object.assign(state.qte, { tutorial: 0, cool: 0 });
      game.debug.patch({ qte, moon: { x: state.earth.x, y: state.earth.y, r: 26 }, hitStop: 0 });
      game.pressCapture(); game.update(0.01);
      assert.equal(game.debug.state().qte.locks, difficulty === 'blood' ? lock : lock + 1, `${difficulty} lock ${lock}`);
      if (difficulty === 'blood' && lock === 0) assert.equal(game.debug.state().qte.struggleUsed, true);
    }
    game.update(2);
    assert.equal(game.getView().screen, 'result');
    assert.equal(writes.length, 1);
    assert.notEqual(writes[0].board[0].ending, 'fail');
  }
});

test('race daily obstacle roll is reproducible and paused time never affects race timer', () => {
  const a = fixture({ menuRace: true }).game;
  const b = fixture({ menuRace: true }).game;
  a.update(5); b.pause('background'); b.update(10); b.resume('background'); b.update(5);
  assert.ok(a.debug.state().bodies.length > 0);
  assert.equal(a.getView().hud.timerVisible, true);
  assert.equal(a.getView().hud.timerText, b.getView().hud.timerText);
  assert.deepEqual(a.debug.state().bodies, b.debug.state().bodies);
});

test('malformed stored records are cleaned and storage failure remains playable', () => {
  const game = createGame({
    storage: { getItem: () => JSON.stringify({ ach: 'bad', board: [null, { score: 'NaN' }, { score: 33, ending: '<bad>', diff: '<bad>', mass: -50 }], pb: { easy: -1, evil: 8, normal: 90000 }, daily: { bestTime: -9 } }), setItem() { throw new Error('full'); } },
    debug: true
  });
  const view = game.getView();
  assert.equal(view.board.entries.length, 1);
  assert.equal(view.board.entries[0].title, '擦肩而过');
  game.action('openMenu'); game.action('toggleSound');
  assert.match(game.getView().toast, /本机存储不可用/);
  game.action('start'); game.action('skipIntro'); game.debug.fail(); game.update(0.8);
  assert.equal(game.getView().screen, 'result');
});

test('gameplay renderer uses injected logical transform and renders without browser globals', () => {
  let draws = 0, transformResets = 0;
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key === 'setTransform' || key === 'resetTransform') return () => { transformResets++; };
      return target[key] || (() => { draws++; });
    },
    set(target, key, value) { target[key] = value; return true; }
  });
  const { game } = fixture({ ctx });
  game.render(0.016); game.update(3); game.render(0.016);
  game.debug.enterCapture(); game.render(0.016);
  game.drawShareCard(ctx, 270, 480);
  assert.ok(draws > 50);
  assert.equal(transformResets, 0);
});

test('synth audio uses injected context and stacked pauses silence and resume only once', () => {
  let created = 0, notes = 0, suspends = 0, resumes = 0;
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  const node = () => ({ gain: param(), frequency: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect() {}, disconnect() {}, start() {}, stop() {} });
  const audio = {
    currentTime: 0, sampleRate: 22050, state: 'running', destination: {},
    createGain: node, createDynamicsCompressor: node, createBiquadFilter: node,
    createBuffer: (channels, length) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: node,
    createOscillator() { notes++; return node(); },
    suspend() { suspends++; this.state = 'suspended'; return Promise.resolve(); },
    resume() { resumes++; this.state = 'running'; return Promise.resolve(); }
  };
  const game = createGame({ createAudioContext() { created++; return audio; } });
  assert.equal(created, 0, 'audio context is created only by a user action');
  game.action('openMenu'); game.update(0.02);
  assert.equal(created, 1);
  assert.ok(notes > 0, 'original synth pattern schedules notes');
  game.pause('ad'); game.pause('background');
  const count = notes;
  audio.currentTime = 5;
  game.update(2); game.resume('ad'); game.update(2);
  assert.equal(notes, count);
  assert.equal(suspends, 1);
  assert.equal(resumes, 0);
  game.resume('background'); game.update(0.02);
  audio.currentTime = 5.3; game.update(0.02);
  assert.equal(resumes, 1);
  assert.ok(notes > count);
});

test('saving sound preferences never unlocks normal; an easy clear persists its explicit unlock', () => {
  let saved = null;
  const storage = {
    getItem() { return saved; },
    setItem(key, value) { saved = value; }
  };
  const first = createGame({ storage, debug: true });
  first.action('openMenu'); first.action('toggleSound');
  assert.equal(first.getView().sound, false);
  const reloaded = createGame({ storage, debug: true });
  assert.equal(reloaded.getView().sound, false);
  assert.equal(reloaded.getView().menu.difficulty, 'easy');
  assert.deepEqual(reloaded.getView().menu.difficulties.filter(entry => entry.unlocked).map(entry => entry.key), ['easy']);
  reloaded.action('openMenu');
  assert.equal(reloaded.action('setDifficulty', 'normal'), false);
  reloaded.action('start'); reloaded.action('skipIntro');
  reloaded.debug.patch({ progress: 1 });
  reloaded.debug.enterCapture(); reloaded.debug.finishCapture(true); reloaded.update(0.91);
  assert.equal(reloaded.getView().screen, 'result');
  assert.ok(JSON.parse(saved).ach.normal);
  const cleared = createGame({ storage });
  assert.equal(cleared.getView().menu.difficulty, 'normal');
  assert.deepEqual(cleared.getView().menu.difficulties.filter(entry => entry.unlocked).map(entry => entry.key), ['easy', 'normal']);
});

test('existing explicit difficulty achievements survive reload without an implicit legacy migration', () => {
  const storage = {
    getItem: () => JSON.stringify({ diff: 'blood', ach: { normal: 1, hard: 2, blood: 3 }, sound: true }),
    setItem() {}
  };
  const game = createGame({ storage });
  assert.equal(game.getView().menu.difficulty, 'blood');
  assert.ok(game.getView().menu.difficulties.every(entry => entry.unlocked));
});

test('QTE and score card use injected font families without changing logical drawing coordinates', () => {
  const assignedFonts = [];
  const text = [];
  const transforms = [];
  let activeFont = '';
  const ctx = new Proxy({
    fillText(value, x, y) { text.push({ value: String(value), x, y, font: activeFont }); },
    scale(x, y) { transforms.push(['scale', x, y]); },
    setTransform() { transforms.push(['reset']); }
  }, {
    get(target, key) { return key in target ? target[key] : () => {}; },
    set(target, key, value) {
      if (key === 'font') { assignedFonts.push(value); activeFont = value; }
      target[key] = value; return true;
    }
  });
  const { game } = fixture({ ctx, fonts: { mono: '"wx-loaded-mono-42"' } });
  game.debug.enterCapture(); game.render(0);
  const locks = text.find(entry => entry.value === '套住 0/2');
  assert.ok(locks);
  assert.equal(locks.font, 'bold 12px "wx-loaded-mono-42"');
  assert.deepEqual({ x: locks.x, y: locks.y }, { x: 135, y: 46 });
  const qteFonts = assignedFonts.splice(0);
  assert.ok(qteFonts.length > 0 && qteFonts.every(font => font.includes('"wx-loaded-mono-42"')));
  game.drawShareCard(ctx, 270, 430);
  const heading = text.find(entry => entry.value === '逐月计划');
  assert.equal(heading.font, 'bold 28px "wx-loaded-mono-42"');
  assert.deepEqual({ x: heading.x, y: heading.y }, { x: 270, y: 78 });
  assert.ok(assignedFonts.length > 0 && assignedFonts.every(font => font.includes('"wx-loaded-mono-42"')));
  assert.deepEqual(transforms[transforms.length - 1], ['scale', 0.5, 0.5]);
  assert.ok(transforms.every(transform => transform[0] !== 'reset'));
  assignedFonts.length = 0;
  const fallback = createGame({ ctx, debug: true });
  fallback.action('openMenu'); fallback.action('start'); fallback.action('skipIntro');
  fallback.debug.enterCapture(); fallback.render(0);
  assert.ok(assignedFonts.length > 0 && assignedFonts.every(font => font.endsWith(' monospace')));
});
