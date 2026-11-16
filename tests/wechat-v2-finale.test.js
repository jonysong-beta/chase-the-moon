'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Campaign = require('../minigame/src/campaign');
const Daily = require('../minigame/src/daily');
const Progression = require('../minigame/src/progression');
const { createGame } = require('../minigame/src/core');

const ALL = ['L01','L02','L03','L04','L05','L06','L07','L08','L09','L10','L11','L12'];
function ready(count) {
  return { campaignV2: { completed: ALL.slice(0, count) }, growthV2: { points: 40,
    abilities: { jet: 2, pulse: 1, sail: 1 }, grants: { 'L04:jet': true, 'L06:pulse': true, 'L10:sail': true } } };
}
function makeGame(initial) {
  let saved = JSON.stringify(initial);
  const storage = { getItem() { return saved; }, setItem(key, value) { saved = value; } };
  const game = createGame({ storage, now: () => Date.parse('2026-11-16T08:00:00Z'), debug: true }); game.action('openMenu');
  return { game, saved: () => JSON.parse(saved) };
}
function pilot(game) {
  for (let i = 0; i < 200 * 30; i++) {
    const s = game.debug.state(); if (s.state !== 'play') break;
    const spike = s.blood && s.blood.spike;
    if (spike && spike.t < spike.warn + spike.live) {
      const lx = spike.x2 - spike.x1, ly = spike.y2 - spike.y1, len = Math.hypot(lx, ly) || 1;
      const cross = (s.earth.x - spike.x1) * ly - (s.earth.y - spike.y1) * lx, sign = cross >= 0 ? 1 : -1;
      game.setInput({ ax: sign * ly / len, ay: sign * -lx / len }); game.update(1 / 30); continue;
    }
    const shock = s.blood && s.blood.shock;
    if (shock && shock.t < shock.warn + shock.live) {
      const dx = s.earth.x - shock.x, dy = s.earth.y - shock.y, len = Math.hypot(dx, dy) || 1;
      game.setInput({ ax: dx / len, ay: dy / len }); game.update(1 / 30); continue;
    }
    const target = s.bodies.filter(b => b.type === 'signal' || (b.type === 'dust' && s.earth.mass < 35)).sort((a, b) => a.z - b.z)[0];
    let x = 135, y = 320;
    if (target) { const t = Math.max(0, Math.min(1.2, 1 - target.z)); x = 135 + target.lx * 108 * t; y = Math.max(110, Math.min(345, 76.8 + 268.8 * t + target.ly * 82 * t)); }
    const dx = x - s.earth.x, dy = y - s.earth.y;
    game.setInput({ ax: Math.max(-1, Math.min(1, dx / 24)), ay: Math.max(-1, Math.min(1, dy / 24)) }); game.update(1 / 30);
  }
  return game.debug.state();
}

test('L11 combines spike and shock while L12 requires the final three locks', () => {
  assert.equal(Campaign.level('L11').objective.groups, 3);
  assert.equal(Campaign.level('L12').objective.locks, 3);
  const { game } = makeGame(ready(10)); game.action('startCampaign', 'L11'); game.update(15);
  assert.ok(game.debug.state().v2.tides >= 1); assert.ok(game.debug.state().blood.shock || game.debug.state().v2.shocks >= 1);
});

test('V2 tidal damage uses the mass 15 floor and authored tail stops attacks', () => {
  const { game } = makeGame(ready(10)); game.action('startCampaign', 'L11');
  const e = game.debug.state().earth;
  game.debug.patch({ earth: { mass: 26, invuln: 0 }, blood: { spikeT: 999, shockT: 999, shock: null,
    spike: { x1: 0, y1: e.y, x2: 270, y2: e.y, t: 1, warn: 0, live: 1, hit: false } } });
  game.update(.02);
  assert.equal(game.getView().screen, 'play'); assert.ok(game.debug.state().earth.mass > 15);
  game.debug.patch({ runT: Campaign.level('L11').duration }); game.update(.02);
  assert.equal(game.debug.state().blood, null);
});

test('daily C has independent deterministic rules and unlocks only after L12', () => {
  const run = Daily.createRun(Date.parse('2026-11-16T00:00:00Z'), 'C');
  assert.deepEqual(run, Daily.createRun(Date.parse('2026-11-16T01:00:00Z'), 'C'));
  assert.equal(run.pool, 'C'); assert.equal(run.version, Daily.RULE_VERSION_C);
  assert.ok(run.events.some(event => event.type === 'well'));
  assert.equal(Progression.dailyPoolUnlocked(ready(11), 'C'), false);
  assert.equal(Progression.dailyPoolUnlocked(ready(12), 'C'), true);
});

test('final dark-moon capture struggles once before three locks and saves reunion', () => {
  const { game, saved } = makeGame(ready(11)); game.action('startCampaign', 'L12');
  const chase = pilot(game); assert.equal(chase.state, 'qte', JSON.stringify({ state: chase.state, outcome: chase.outcome, mass: chase.earth.mass, signals: chase.v2.signals, time: chase.runT, fail: chase.failReason })); assert.equal(chase.qte.need, 3);
  game.update(4.6);
  const readyState = game.debug.state();
  game.debug.patch({ moon: { x: readyState.earth.x, y: readyState.earth.y, r: 22 } }); game.update(.02);
  game.pressCapture(); game.update(.02);
  assert.equal(game.debug.state().qte.struggleUsed, true); assert.equal(game.debug.state().qte.locks, 0);
  game.debug.finishCapture(true);
  assert.equal(game.getView().screen, 'reunion'); game.update(3);
  assert.equal(game.getView().screen, 'result'); assert.equal(game.getView().v2.result.completed, true);
  assert.match(game.getView().v2.result.title, /重逢|重聚/); assert.ok(saved().campaignV2.completed.includes('L12'));
});

test('daily C starts with blood rules and shared daily reward ledger', () => {
  const { game } = makeGame(ready(12)); game.action('openDaily');
  assert.equal(game.getView().v2.daily.pool, 'C'); assert.equal(game.action('startDaily'), true);
  assert.equal(game.debug.state().v2.route.pool, 'C'); assert.equal(game.debug.state().diff, 'blood'); assert.ok(game.debug.state().blood);
});
