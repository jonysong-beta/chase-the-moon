'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Endless = require('../minigame/src/endless');
const Progression = require('../minigame/src/progression');
const { createGame } = require('../minigame/src/core');

function ready() {
  return { campaignV2: { completed: ['L01', 'L02', 'L03', 'L04'] },
    growthV2: { points: 7, abilities: { jet: 2 }, grants: { 'L04:jet': true } } };
}
function result(runId, time) {
  return { runId, completed: false, time, score: Math.floor(time * 10), signals: 12, segments: 0, gates: 0,
    date: '2026-11-16', version: Endless.VERSION, assisted: false,
    abilities: { jet: 2, pulse: 0, sail: 0 }, startAbilities: { jet: 2, pulse: 0, sail: 0 }, grants: [] };
}

test('endless chunks are deterministic, bounded and gradually add pressure', () => {
  const first = Endless.chunk(12345, 0), again = Endless.chunk(12345, 0), later = Endless.chunk(12345, 6);
  assert.deepEqual(first, again);
  assert.equal(first.filter(event => event.type === 'signal').length, 12);
  assert.equal(first.filter(event => event.type === 'dust').length, 2);
  assert.ok(later.filter(event => event.type === 'rock').length > first.filter(event => event.type === 'rock').length);
  assert.ok(first.every(event => event.at >= 0 && event.at < 40));
  assert.ok(later.every(event => event.at >= 240 && event.at < 280));
  assert.ok(first.every(event => Math.abs(event.lx) <= 1 && Math.abs(event.ly) <= 1));
});

test('endless settlement keeps the longest survival and never grants growth', () => {
  const source = ready();
  const first = Progression.settleEndless(source, result('endless-a', 83.25));
  assert.equal(first.ok, true); assert.equal(first.newBest, true); assert.equal(first.reward, 0);
  assert.equal(first.data.endlessV2.best.time, 83.25); assert.equal(first.data.growthV2.points, 7);
  const shorter = Progression.settleEndless(first.data, result('endless-b', 61));
  assert.equal(shorter.newBest, false); assert.equal(shorter.data.endlessV2.best.time, 83.25);
  assert.equal(shorter.data.endlessV2.last.time, 61);
  const longer = Progression.settleEndless(shorter.data, result('endless-c', 102.5));
  assert.equal(longer.newBest, true); assert.equal(longer.data.endlessV2.best.time, 102.5);
  assert.equal(Progression.settleEndless(longer.data, result('endless-c', 102.5)).reason, 'already-settled');
  assert.equal(Progression.settleEndless({}, result('endless-locked', 20)).reason, 'locked');
});

test('real endless play passes 150 seconds and saves a failed survival record', () => {
  const env = { saved: JSON.stringify(ready()), now: Date.parse('2026-11-16T08:00:00Z') };
  const storage = { getItem() { return env.saved; }, setItem(key, value) { env.saved = value; } };
  const game = createGame({ storage, now: () => env.now, debug: true });
  game.action('openMenu');
  assert.equal(game.action('startEndless'), true);
  game.setInput({ ax: 0, ay: -1 }); game.update(60); game.update(60); game.update(60);
  assert.equal(game.getView().screen, 'play');
  assert.ok(game.debug.state().runT > 150);
  game.debug.fail('验证无尽结束'); game.update(1);
  const view = game.getView();
  assert.equal(view.screen, 'result'); assert.equal(view.v2.result.kind, 'endless');
  assert.equal(view.v2.result.savePending, false);
  const saved = JSON.parse(env.saved);
  assert.ok(saved.endlessV2.best.time > 150);
  assert.equal(saved.growthV2.points, 7);
  assert.equal(game.action('retry'), true); assert.equal(game.getView().screen, 'play');
});
