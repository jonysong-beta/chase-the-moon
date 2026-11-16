'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('../minigame/src/core');
const Progression = require('../minigame/src/progression');

function fixture(initial) {
  const env = { saved: initial ? JSON.stringify(initial) : null, writes: [], failRead: false, failWrite: false, now: Date.parse('2026-11-07T15:59:40Z') };
  env.storage = {
    getItem() { if (env.failRead) throw new Error('read'); return env.saved; },
    setItem(key, value) { if (env.failWrite) throw new Error('write'); env.saved = value; env.writes.push(JSON.parse(value)); }
  };
  env.create = () => createGame({ storage: env.storage, now: () => env.now, debug: true, reviveEnabled: true });
  env.game = env.create(); env.game.action('openMenu');
  return env;
}
function ready(jet) {
  return { campaignV2: { completed: ['L01', 'L02', 'L03', 'L04'] },
    growthV2: { points: 20, abilities: { jet: jet || 1 }, grants: { 'L04:jet': true } } };
}
function body(type, x, y, extra) {
  return Object.assign({ type, z: 0.1, lx: (x - 135) / 97.2, ly: (y - 318.72) / 73.8, r: 12,
    ph: 0, hard: type === 'rock', massDelta: type === 'dust' ? 6 : 8 }, extra);
}
function collect(game, type, extra) {
  const s = game.debug.state();
  game.debug.patch({ bodies: [body(type, s.earth.x, s.earth.y, extra)] }); game.update(0.01);
}
// Drives the actual acceleration, z interaction and pickups; never patches
// position, invulnerability, objectives or progression to declare a clear.
function pilot(game, limit) {
  let samples = 0;
  for (; samples < (limit || 180) * 30; samples++) {
    const s = game.debug.state();
    if (s.state === 'grant') { assert.equal(game.action('claimAbility'), true); continue; }
    if (s.state !== 'play') break;
    const target = s.bodies.filter(b => b.type === 'signal' || (b.type === 'dust' && s.v2.levelId === 'L03' && !s.v2.dust))
      .sort((a, b) => a.z - b.z)[0];
    let x = 135, y = 320;
    if (target) {
      const t = Math.max(0, Math.min(1.2, 1 - target.z));
      x = 135 + target.lx * 108 * t;
      y = Math.max(110, Math.min(345, 76.8 + 268.8 * t + target.ly * 82 * t));
    }
    const dx = x - s.earth.x, dy = y - s.earth.y;
    game.setInput({ ax: Math.max(-1, Math.min(1, dx / 24)), ay: Math.max(-1, Math.min(1, dy / 24)) });
    if (s.v2.abilities.jet && !s.v2.jets && Math.hypot(dx, dy) > 12) game.pressJet();
    game.update(1 / 30);
  }
  return game.debug.state();
}

test('fresh V2 keeps classic data, gates content, and idle L01 never clears naturally', () => {
  const env = fixture({ ach: { blood: 1 }, pb: { normal: 83 }, daily: { date: '2026-11-06', bestTime: 91 }, custom: { keep: true } });
  const g = env.game;
  assert.equal(g.getView().v2.growth.points, 0);
  assert.equal(g.action('startCampaign', 'L04'), false);
  assert.equal(g.action('startDaily'), false);
  assert.equal(g.action('startCampaign', 'L01'), true);
  assert.equal(g.getView().controls.jetVisible, false);
  g.pressJet(); g.update(60); g.update(60);
  const s = g.debug.state();
  assert.equal(s.state, 'play'); assert.ok(s.progress < 1); assert.ok(s.v2.signals < 8);
  assert.ok(s.bodies.every(b => b.type === 'signal'));
  assert.equal(s.earth.mass, 60); assert.equal(env.writes.length, 0);
});

test('actual steering can clear all four lessons, upgrade jet II and carry it into daily', () => {
  const env = fixture({ custom: { keep: true }, pb: { easy: 88 }, ach: { normal: 1 } });
  const g = env.game;
  for (const id of ['L01', 'L02', 'L03', 'L04']) {
    assert.equal(g.action('startCampaign', id), true);
    const s = pilot(g);
    assert.equal(s.state, 'result', id + ' must terminate');
    assert.equal(s.outcome, 'complete', id + ' actual steering clear');
    assert.equal(g.getView().v2.result.savePending, false, id);
    g.action('home');
  }
  const saved = JSON.parse(env.saved);
  assert.equal(saved.growthV2.points, 8); assert.equal(saved.growthV2.abilities.jet, 1);
  assert.deepEqual(saved.custom, { keep: true }); assert.deepEqual(saved.pb, { easy: 88 });
  assert.deepEqual(saved.board, []); assert.equal(saved.campaignV2.best.L04.startAbilities.jet, 0);
  assert.equal(saved.campaignV2.best.L04.abilities.jet, 1); assert.equal(saved.campaignV2.best.L04.grants.length, 1);
  g.action('openGrowth');
  assert.equal(g.action('upgradeAbility', { ability: 'jet', expectedLevel: 1 }), true);
  assert.equal(g.action('upgradeAbility', { ability: 'jet', expectedLevel: 1 }), false);
  assert.equal(g.getView().v2.growth.points, 4);
  assert.equal(g.action('startDaily'), true); assert.equal(g.debug.state().v2.abilities.jet, 2);
  assert.equal(g.action('upgradeAbility', { ability: 'jet', expectedLevel: 2 }), false);
  const reloaded = env.create(); assert.equal(reloaded.getView().v2.growth.abilities[0].level, 2);
});

test('V2 rock damage clamps progress, retains pickup count and fails only at mass <=15', () => {
  const env = fixture({ campaignV2: { completed: ['L01'] } }); const g = env.game;
  g.action('startCampaign', 'L02'); collect(g, 'signal');
  const count = g.debug.state().v2.signals;
  g.debug.patch({ progress: 0.01, earth: { mass: 22, invuln: 0 } }); collect(g, 'rock');
  assert.equal(g.debug.state().earth.mass, 16); assert.equal(g.debug.state().progress, 0);
  assert.equal(g.debug.state().earth.alive, true); assert.equal(g.debug.state().v2.signals, count);
  g.update(0.1); g.debug.patch({ earth: { mass: 21, invuln: 0 } }); collect(g, 'rock'); g.update(1);
  assert.equal(g.getView().screen, 'result'); assert.equal(g.getReviveOffer().eligible, false);
  assert.equal(g.getView().v2.growth.points, 0);
});

test('jet is directional, press-edge only, and has level-specific consumption/cooldown', () => {
  for (const level of [1, 2, 3]) {
    const env = fixture(ready(level)), g = env.game; g.action('startCampaign', 'L01');
    g.pressJet(); g.update(0.01); assert.equal(g.debug.state().earth.mass, 60);
    assert.equal(g.debug.state().earth.jetCd, 0);
    g.setInput({ ax: 1, ay: 0, jetHeld: true }); g.pressJet(); g.update(0.01);
    assert.ok(Math.abs(g.debug.state().earth.mass - (60 - Progression.jetParams(level).cost)) < 1e-8);
    assert.equal(g.debug.state().earth.jetCd, Progression.jetParams(level).cooldown);
    g.update(0.8); assert.equal(g.debug.state().v2.jets, 1);
  }
});

test('jet III replays the first and final lesson without duplicate grants or first-clear rewards', () => {
  const env = fixture(ready(3)), g = env.game;
  for (const id of ['L01', 'L04']) {
    g.action('startCampaign', id);
    assert.equal(g.getView().controls.jetVisible, true);
    const s = pilot(g);
    assert.equal(s.outcome, 'complete'); assert.equal(s.v2.grants.length, 0);
    assert.equal(g.getView().v2.result.reward, 0);
    assert.equal(g.getView().v2.growth.points, 20);
    assert.equal(JSON.parse(env.saved).campaignV2.best[id].abilities.jet, 3);
    g.action('home');
  }
});

test('grant is saved before activation and survives failure without completing L04', () => {
  const env = fixture({ campaignV2: { completed: ['L01','L02','L03'] }, growthV2: { points: 6 } }); const g = env.game;
  g.action('startCampaign', 'L04'); g.update(4);
  assert.equal(g.getView().screen, 'grant'); const t = g.debug.state().runT; g.update(30); assert.equal(g.debug.state().runT, t);
  env.failWrite = true; assert.equal(g.action('claimAbility'), false);
  assert.equal(g.debug.state().v2.abilities.jet, 0);
  env.failWrite = false; assert.equal(g.action('claimAbility'), true);
  assert.equal(g.action('claimAbility'), false); assert.equal(env.writes.length, 1);
  g.debug.fail('失败验证'); g.update(1);
  assert.equal(g.getView().screen, 'result'); assert.equal(g.getReviveOffer().eligible, false);
  const s = JSON.parse(env.saved); assert.equal(s.growthV2.abilities.jet, 1);
  assert.equal(s.campaignV2.completed.includes('L04'), false); assert.equal(s.growthV2.points, 6);
  const r = env.create(); r.action('openMenu'); r.action('startCampaign', 'L04'); r.update(4);
  assert.equal(r.getView().screen, 'play');
});

test('result save retry and upgrade write errors leave balance and completion unchanged', () => {
  const env = fixture(), g = env.game; g.action('startCampaign', 'L01'); env.failWrite = true;
  pilot(g); assert.equal(g.getView().screen, 'result'); assert.equal(g.getView().v2.result.savePending, true);
  assert.equal(g.getView().v2.growth.points, 0); assert.equal(g.action('home'), false);
  env.failWrite = false; assert.equal(g.action('retrySave'), true); assert.equal(g.action('retrySave'), false);
  assert.equal(env.writes.length, 1); assert.equal(g.getView().v2.growth.points, 2);
  const e = fixture(ready(1)); e.game.action('openGrowth'); e.failWrite = true;
  assert.equal(e.game.action('upgradeAbility', { ability: 'jet', expectedLevel: 1 }), false);
  assert.equal(e.game.getView().v2.growth.points, 20); assert.equal(e.game.getView().v2.growth.abilities[0].level, 1);
});

test('read errors never overwrite old saves and recover through explicit retry', () => {
  const env = fixture(ready(2)); env.failRead = true; const g = env.create(); g.action('openMenu');
  assert.equal(g.getView().screen, 'storageError'); assert.equal(g.action('startDaily'), false);
  assert.equal(env.writes.length, 0); env.failRead = false;
  assert.equal(g.action('retryStorage'), true); assert.equal(g.getView().v2.growth.abilities[0].level, 2);
});

test('daily runs 150 active seconds without QTE, freezes across pause, and belongs to starting date', () => {
  const env = fixture(ready(2)), g = env.game; g.action('startDaily');
  const date = g.debug.state().runDate;
  g.debug.patch({ progress: 1 }); g.update(2); assert.equal(g.getView().screen, 'play');
  g.action('pauseRun'); const before = g.debug.state().runT; g.update(50); assert.equal(g.debug.state().runT, before);
  g.action('resumeRun'); env.now += 60000;
  // Stay safely in front of the arrival lane; no pickups/score edits.
  g.setInput({ ax: 0, ay: -1 }); g.update(60); g.update(60); g.update(60);
  const s = g.debug.state(); assert.equal(s.state, 'result'); assert.equal(s.runT, 150);
  assert.equal(s.v2.result.date, date); assert.equal(s.v2.result.segments, 3);
  assert.equal(g.getView().v2.result.savePending, false); assert.equal(g.getReviveOffer().eligible, false);
  assert.equal(JSON.parse(env.saved).dailyV2.rewards[date].complete, true);
  const writes = env.writes.length; g.update(60); assert.equal(env.writes.length, writes);
});

test('V2 share card presents a route and real results without fake social ranks', () => {
  const env = fixture(ready(2)), g = env.game; g.action('startDaily');
  g.setInput({ ax: 0, ay: -1 }); g.update(60); g.update(60); g.update(60);
  assert.equal(g.getView().screen, 'result');
  const drawn = [];
  const ctx = new Proxy({ fillText(value) { drawn.push(String(value)); } },
    { get: (object, key) => key in object ? object[key] : () => {} });
  g.drawShareCard(ctx, 540, 860);
  assert.ok(drawn.includes('CHASE THE MOON'));
  assert.ok(drawn.includes('每日航线'));
  assert.ok(drawn.includes('300'));
  assert.ok(drawn.includes('未达评级'));
  assert.ok(drawn.includes('2026-11-07'));
  assert.ok(drawn.includes('本机航行纪录'));
  assert.ok(!drawn.includes('喷射 Ⅱ'));
  assert.ok(!drawn.some(value => /存活航段|月辉 \/ 技巧门|归属航行日|好友位置|世界位置|世界排名/.test(value)));
});

test('daily scoring caps signals per segment and scores a spatial gate only once', () => {
  const env = fixture(ready(1)), g = env.game; g.action('startDaily');
  for (let i = 0; i < 23; i++) collect(g, 'signal', { segment: 0, id: 'signal-' + i });
  assert.equal(g.debug.state().v2.signals, 20);
  collect(g, 'gate', { r: 30, segment: 0, id: 'gate-0' });
  collect(g, 'gate', { r: 30, segment: 0, id: 'gate-0' });
  assert.equal(g.debug.state().v2.gates, 1); assert.equal(g.debug.state().score, 250);
  assert.equal(g.debug.state().v2.jets, 0);
});

test('manual pause then abandon restores sound for the hub and next run', () => {
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  const node = () => ({ gain: param(), frequency: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect() {}, disconnect() {}, start() {}, stop() {} });
  const gains = [];
  const audio = {
    currentTime: 0, sampleRate: 22050, state: 'running', destination: {},
    createGain() { const n = node(); gains.push(n); return n; },
    createDynamicsCompressor: node, createBiquadFilter: node,
    createBuffer: (channels, length) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: node, createOscillator: node,
    suspend() { this.state = 'suspended'; return Promise.resolve(); },
    resume() { this.state = 'running'; return Promise.resolve(); }
  };
  const g = createGame({ createAudioContext: () => audio });
  g.action('openMenu'); g.action('startCampaign', 'L01');
  const master = gains.find(n => n.gain.value === 0.9);
  assert.ok(master); g.action('pauseRun'); assert.equal(master.gain.value, 0);
  g.action('abandon'); assert.equal(master.gain.value, 0.9); assert.equal(audio.state, 'running');
  g.action('startCampaign', 'L01'); assert.equal(master.gain.value, 0.9); assert.equal(g.getView().sound, true);
});
