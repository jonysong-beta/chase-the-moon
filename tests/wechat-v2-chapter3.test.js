'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Campaign = require('../minigame/src/campaign');
const Progression = require('../minigame/src/progression');
const { createGame } = require('../minigame/src/core');

function ready(last) {
  const levels = ['L01','L02','L03','L04','L05','L06','L07','L08','L09','L10'].slice(0, last === 'L09' ? 8 : 9);
  return { campaignV2: { completed: levels }, growthV2: { points: 30,
    abilities: { jet: 2, pulse: 1 }, grants: { 'L04:jet': true, 'L06:pulse': true } } };
}
function gameWith(initial) {
  let saved = JSON.stringify(initial);
  const storage = { getItem() { return saved; }, setItem(key, value) { saved = value; } };
  const game = createGame({ storage, now: () => Date.parse('2026-11-16T08:00:00Z'), debug: true }); game.action('openMenu');
  return { game, saved: () => JSON.parse(saved) };
}

test('L09 uses a distant dark moon and real tidal spike warnings', () => {
  const { game } = gameWith(ready('L09')); assert.equal(game.action('startCampaign', 'L09'), true);
  assert.equal(game.debug.state().diff, 'blood'); assert.ok(game.debug.state().blood);
  game.setInput({ ax: 1, ay: 0 }); game.update(10);
  assert.ok(game.debug.state().v2.tides >= 1);
  assert.equal(Campaign.level('L09').objective.tides, 3);
});

test('sail grant and upgrades use L10 and preserve the other abilities', () => {
  const granted = Progression.grant(ready('L10'), 'sail', 'L10');
  assert.equal(granted.ok, true); assert.equal(granted.data.growthV2.abilities.sail, 1);
  assert.equal(granted.data.growthV2.abilities.pulse, 1);
  const two = Progression.upgrade(granted.data, 'sail', 1); assert.equal(two.cost, 8);
  const three = Progression.upgrade(two.data, 'sail', 2); assert.equal(three.cost, 12);
  assert.equal(Progression.sailParams(1).charge, .50); assert.equal(Progression.sailParams(3).charge, .35);
});

function pilot(game) {
  for (let i = 0; i < 180 * 30; i++) {
    const s = game.debug.state();
    if (s.state === 'grant') { assert.equal(game.action('claimAbility'), true); continue; }
    if (s.state !== 'play') break;
    const spike = s.blood && s.blood.spike;
    if (spike && spike.t < spike.warn + spike.live) {
      const lx = spike.x2 - spike.x1, ly = spike.y2 - spike.y1, len = Math.hypot(lx, ly) || 1;
      const cross = (s.earth.x - spike.x1) * ly - (s.earth.y - spike.y1) * lx;
      const sign = cross >= 0 ? 1 : -1;
      game.setInput({ ax: sign * ly / len, ay: sign * -lx / len }); game.update(1 / 30); continue;
    }
    const target = s.bodies.filter(b => b.type === 'signal' || (b.type === 'dust' && s.earth.mass < 35)).sort((a, b) => a.z - b.z)[0];
    let x = 135, y = 320;
    if (target) { const t = Math.max(0, Math.min(1.2, 1 - target.z)); x = 135 + target.lx * 108 * t; y = Math.max(110, Math.min(345, 76.8 + 268.8 * t + target.ly * 82 * t)); }
    const dx = x - s.earth.x, dy = y - s.earth.y;
    game.setInput({ ax: Math.max(-1, Math.min(1, dx / 24)), ay: Math.max(-1, Math.min(1, dy / 24)) }); game.update(1 / 30);
  }
  return game.debug.state();
}

test('actual steering clears L09 and finishes L10 after a real sail release', () => {
  const { game, saved } = gameWith(ready('L09')); game.action('startCampaign', 'L09');
  const nine = pilot(game); assert.equal(nine.outcome, 'complete', JSON.stringify({ state: nine.state, mass: nine.earth.mass, tides: nine.v2.tides }));
  assert.equal(game.action('retry'), true); game.update(3.1); assert.equal(game.action('claimAbility'), true);
  game.debug.patch({ earth: { y: 250 } });
  const e = game.debug.state().earth, centerX = e.x + 32, z = .3, t = 1 - z;
  const well = { type: 'well', id: 'sail-clear', z, lx: (centerX - 135) / (108 * t), ly: (e.y - (76.8 + 268.8 * t)) / (82 * t), r: 16, pull: 0, killR: .42, spin: 0, ph: 0 };
  game.debug.patch({ bodies: [well] }); game.setInput({ ax: 0, ay: 1 }); game.update(.55); game.setInput({ ax: -1, ay: 0 }); game.update(.5);
  assert.ok(game.debug.state().v2.sails >= 1); game.debug.patch({ bodies: [] });
  const ten = pilot(game); assert.equal(ten.outcome, 'complete', JSON.stringify({ state: ten.state, mass: ten.earth.mass, signals: ten.v2.signals, sails: ten.v2.sails }));
  assert.ok(saved().campaignV2.completed.includes('L10'));
});

test('outer-well charge releases one free boost only after moving outward', () => {
  const { game } = gameWith(ready('L10')); game.action('startCampaign', 'L10'); game.update(3.1);
  assert.equal(game.getView().v2.run.grantAbility, 'sail'); assert.equal(game.action('claimAbility'), true);
  game.debug.patch({ earth: { y: 250 } });
  const e = game.debug.state().earth, centerX = e.x + 32, z = .3, t = 1 - z;
  const well = { type: 'well', id: 'sail-test', z, lx: (centerX - 135) / (108 * t), ly: (e.y - (76.8 + 268.8 * t)) / (82 * t),
    r: 16, pull: 0, killR: .42, spin: 0, ph: 0 };
  game.debug.patch({ bodies: [well] }); game.setInput({ ax: 0, ay: 1 }); game.update(.55);
  assert.ok(well.sailReady || well.sailCharge >= .5, JSON.stringify({ charge: well.sailCharge, ready: well.sailReady }));
  const mass = game.debug.state().earth.mass;
  game.setInput({ ax: -1, ay: 0 }); game.update(.5);
  assert.equal(game.debug.state().v2.sails, 1); assert.equal(well.sailUsed, true);
  assert.ok(Math.abs(game.debug.state().earth.mass - mass) < 1e-8);
});
