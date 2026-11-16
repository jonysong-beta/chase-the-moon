'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Campaign = require('../minigame/src/campaign');
const Progression = require('../minigame/src/progression');
const { createGame } = require('../minigame/src/core');

function readyL06() {
  return { campaignV2: { completed: ['L01', 'L02', 'L03', 'L04', 'L05'] },
    growthV2: { points: 20, abilities: { jet: 2 }, grants: { 'L04:jet': true } } };
}

test('L05 introduces real well events and L06 grants pulse before its practice', () => {
  assert.equal(Campaign.level('L05').objective.groups, 3);
  assert.ok(Campaign.events('L05').some(event => event.type === 'well'));
  assert.equal(Campaign.level('L06').objective.pulses, 1);
  const events = Campaign.events('L06');
  const grant = events.find(event => event.type === 'grant');
  assert.equal(grant.ability, 'pulse'); assert.equal(grant.levelId, 'L06');
  assert.ok(events.filter(event => event.at < 12).every(event => event.type === 'grant' || event.type === 'signal' || event.type === 'dust'));
});

test('pulse grant and both upgrades preserve jet and charge the configured costs', () => {
  const granted = Progression.grant(readyL06(), 'pulse', 'L06');
  assert.equal(granted.ok, true); assert.equal(granted.data.growthV2.abilities.pulse, 1);
  assert.equal(granted.data.growthV2.abilities.jet, 2);
  const level2 = Progression.upgrade(granted.data, 'pulse', 1);
  assert.equal(level2.ok, true); assert.equal(level2.cost, 6); assert.equal(level2.data.growthV2.points, 14);
  const level3 = Progression.upgrade(level2.data, 'pulse', 2);
  assert.equal(level3.ok, true); assert.equal(level3.cost, 10); assert.equal(level3.data.growthV2.points, 4);
  assert.deepEqual(Progression.pulseParams(1), { minInterval: .14, recovery: 1.8 });
  assert.deepEqual(Progression.pulseParams(3), { minInterval: .14, recovery: 1.2 });
});

function pilot(game, limit) {
  for (let i = 0; i < (limit || 180) * 30; i++) {
    const s = game.debug.state();
    if (s.state === 'grant') { assert.equal(game.action('claimAbility'), true); continue; }
    if (s.state !== 'play') break;
    const target = s.bodies.filter(b => b.type === 'signal' || (b.type === 'dust' && s.earth.mass < 35)).sort((a, b) => a.z - b.z)[0];
    let x = 135, y = 320;
    if (target) {
      const t = Math.max(0, Math.min(1.2, 1 - target.z));
      x = 135 + target.lx * 108 * t; y = Math.max(110, Math.min(345, 76.8 + 268.8 * t + target.ly * 82 * t));
    }
    const dx = x - s.earth.x, dy = y - s.earth.y;
    game.setInput({ ax: Math.max(-1, Math.min(1, dx / 24)), ay: Math.max(-1, Math.min(1, dy / 24)) });
    if (s.v2.abilities.jet && ((!s.v2.jets && Math.hypot(dx, dy) > 12) ||
      (s.v2.levelId === 'L06' && s.v2.jets > 0 && !s.v2.pulses && s.earth.jetCd > 0))) game.pressJet();
    game.update(1 / 30);
  }
  return game.debug.state();
}

test('actual steering clears L05 and then L06 with its required extra pulse', () => {
  const initial = { campaignV2: { completed: ['L01', 'L02', 'L03', 'L04'] },
    growthV2: { points: 12, abilities: { jet: 2 }, grants: { 'L04:jet': true } } };
  let saved = JSON.stringify(initial);
  const storage = { getItem() { return saved; }, setItem(key, value) { saved = value; } };
  const game = createGame({ storage, now: () => Date.parse('2026-11-16T08:00:00Z'), debug: true }); game.action('openMenu');
  assert.equal(game.action('startCampaign', 'L05'), true);
  const five = pilot(game); assert.equal(five.outcome, 'complete', JSON.stringify({ state: five.state, mass: five.earth.mass, signals: five.v2.signals }));
  assert.equal(game.action('retry'), true);
  const six = pilot(game); assert.equal(six.outcome, 'complete', JSON.stringify({ state: six.state, mass: six.earth.mass, signals: six.v2.signals, pulses: six.v2.pulses }));
  assert.ok(six.v2.pulses >= 1);
  const savedData = JSON.parse(saved);
  assert.ok(savedData.campaignV2.completed.includes('L06'));
  assert.equal(savedData.growthV2.abilities.pulse, 1);
});

test('real directional jet can consume exactly one extra pulse during normal cooldown', () => {
  let saved = JSON.stringify(readyL06());
  const storage = { getItem() { return saved; }, setItem(key, value) { saved = value; } };
  const game = createGame({ storage, now: () => Date.parse('2026-11-16T08:00:00Z'), debug: true });
  game.action('openMenu'); game.action('startCampaign', 'L06'); game.update(3.1);
  assert.equal(game.getView().screen, 'grant');
  assert.equal(game.getView().v2.run.grantAbility, 'pulse');
  assert.equal(game.action('claimAbility'), true);
  game.setInput({ ax: 1, ay: 0 }); game.pressJet(); game.update(.01); game.update(.2);
  game.pressJet(); game.update(.01);
  const state = game.debug.state();
  assert.equal(state.v2.jets, 2); assert.equal(state.v2.pulses, 1);
  assert.ok(Math.abs(state.earth.mass - (60 - .30 * 2)) < 1e-8);
  game.pressJet(); game.update(.01); assert.equal(game.debug.state().v2.pulses, 1);
});
