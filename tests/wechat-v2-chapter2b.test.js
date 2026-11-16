'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Campaign = require('../minigame/src/campaign');
const Daily = require('../minigame/src/daily');
const Progression = require('../minigame/src/progression');
const { createGame } = require('../minigame/src/core');

function ready(levels) {
  return { campaignV2: { completed: levels },
    growthV2: { points: 20, abilities: { jet: 2, pulse: 1 }, grants: { 'L04:jet': true, 'L06:pulse': true } } };
}
function pilot(game) {
  for (let i = 0; i < 180 * 30; i++) {
    const s = game.debug.state(); if (s.state !== 'play') break;
    const target = s.bodies.filter(b => b.type === 'signal' || (b.type === 'dust' && s.earth.mass < 35)).sort((a, b) => a.z - b.z)[0];
    let x = 135, y = 320;
    if (target) { const t = Math.max(0, Math.min(1.2, 1 - target.z)); x = 135 + target.lx * 108 * t; y = Math.max(110, Math.min(345, 76.8 + 268.8 * t + target.ly * 82 * t)); }
    const dx = x - s.earth.x, dy = y - s.earth.y;
    game.setInput({ ax: Math.max(-1, Math.min(1, dx / 24)), ay: Math.max(-1, Math.min(1, dy / 24)) }); game.update(1 / 30);
  }
  return game.debug.state();
}

test('L07 combines wells and rocks while L08 requires two calibration locks', () => {
  assert.equal(Campaign.level('L07').objective.groups, 3);
  assert.ok(Campaign.events('L07').some(event => event.type === 'well'));
  assert.ok(Campaign.events('L07').some(event => event.type === 'rock'));
  assert.equal(Campaign.level('L08').objective.locks, 2);
  assert.ok(!Campaign.events('L08').some(event => event.type === 'well' || event.type === 'rock'));
});

test('daily B is deterministic, contains well mechanisms and unlocks only after L08', () => {
  const run = Daily.createRun(Date.parse('2026-11-16T00:00:00Z'), 'B');
  assert.deepEqual(run, Daily.createRun(Date.parse('2026-11-16T01:00:00Z'), 'B'));
  assert.equal(run.pool, 'B'); assert.notEqual(run.version, Daily.RULE_VERSION);
  assert.ok(run.events.some(event => event.type === 'well'));
  assert.equal(Progression.dailyPoolUnlocked(ready(['L01','L02','L03','L04','L05','L06','L07']), 'B'), false);
  assert.equal(Progression.dailyPoolUnlocked(ready(['L01','L02','L03','L04','L05','L06','L07','L08']), 'B'), true);
});

test('actual L08 route enters calibration and saves completion after two target locks', () => {
  const initial = ready(['L01','L02','L03','L04','L05','L06','L07']); let saved = JSON.stringify(initial);
  const storage = { getItem() { return saved; }, setItem(key, value) { saved = value; } };
  const game = createGame({ storage, now: () => Date.parse('2026-11-16T08:00:00Z'), debug: true }); game.action('openMenu');
  assert.equal(game.action('startCampaign', 'L08'), true);
  const chase = pilot(game); assert.equal(chase.state, 'qte');
  assert.equal(game.getView().controls.captureVisible, true); assert.equal(game.debug.state().qte.calibration, true);
  assert.equal(game.debug.state().qte.need, 2);
  game.debug.finishCapture(true);
  assert.equal(game.getView().screen, 'result'); assert.equal(game.getView().v2.result.completed, true);
  assert.ok(JSON.parse(saved).campaignV2.completed.includes('L08'));
});

test('daily B can be selected and started with the permanent pulse snapshot', () => {
  const initial = ready(['L01','L02','L03','L04','L05','L06','L07','L08']);
  const game = createGame({ storage: { getItem() { return JSON.stringify(initial); }, setItem() {} }, now: () => Date.parse('2026-11-16T08:00:00Z'), debug: true });
  game.action('openMenu'); assert.equal(game.action('openDaily'), true); assert.equal(game.action('selectDailyPool', 'B'), true); assert.equal(game.action('startDaily'), true);
  assert.equal(game.debug.state().v2.route.pool, 'B'); assert.equal(game.debug.state().v2.abilities.pulse, 1);
});
