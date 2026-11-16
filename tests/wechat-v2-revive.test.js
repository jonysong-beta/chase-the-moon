'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('../minigame/src/core');
const Campaign = require('../minigame/src/campaign');

function savedThrough(id) {
  const index = Campaign.LEVELS.findIndex(level => level.id === id);
  const completed = Campaign.LEVELS.slice(0, index + 1).map(level => level.id);
  const abilities = { jet: index >= 3 ? 1 : 0, pulse: index >= 5 ? 1 : 0, sail: index >= 9 ? 1 : 0 };
  const grants = {};
  if (abilities.jet) grants['L04:jet'] = true;
  if (abilities.pulse) grants['L06:pulse'] = true;
  if (abilities.sail) grants['L10:sail'] = true;
  return { campaignV2: { completed }, growthV2: { points: 0, abilities, grants } };
}
function fixture(initial, reviveEnabled) {
  const env = { saved: initial ? JSON.stringify(initial) : null, writes: [] };
  const storage = { getItem() { return env.saved; }, setItem(key, value) { env.saved = value; env.writes.push(JSON.parse(value)); } };
  const game = createGame({ storage, now: () => Date.parse('2026-11-17T04:00:00Z'), debug: true, reviveEnabled: reviveEnabled !== false });
  game.action('openMenu'); env.game = game; return env;
}
function signalAt(game) {
  const earth = game.debug.state().earth;
  return { type: 'signal', z: .1, lx: (earth.x - 135) / 97.2, ly: (earth.y - 318.72) / 73.8,
    r: 12, ph: 0, hard: false, massDelta: 8 };
}
function wellAt(game) {
  const earth = game.debug.state().earth, t = .85;
  return { type: 'well', id: 'revive-well', z: .15, lx: (earth.x - 135) / (108 * t),
    ly: (earth.y - (76.8 + 268.8 * t)) / (82 * t), r: 16, pull: 0, killR: .42, spin: 0, ph: 0 };
}
function pilot(game) {
  for (let i = 0; i < 180 * 30; i++) {
    const s = game.debug.state();
    if (s.state === 'grant') { game.action('claimAbility'); continue; }
    if (s.state !== 'play') return s;
    let dangerous = null;
    for (const body of s.bodies) {
      if (body.type !== 'well' || body.z >= .68 || body.z <= 0) continue;
      const t = 1 - body.z, x = 135 + body.lx * 108 * t, y = 76.8 + 268.8 * t + body.ly * 82 * t;
      const radius = Math.max(10, body.r * (.25 + 1.45 * t)) * 3.6 + s.earth.r;
      if (Math.hypot(s.earth.x - x, s.earth.y - y) < radius) { dangerous = { x, y }; break; }
    }
    if (dangerous) {
      const dx = s.earth.x - dangerous.x, dy = s.earth.y - dangerous.y, length = Math.hypot(dx, dy) || 1;
      game.setInput({ ax: dx / length, ay: dy / length }); game.update(1 / 30); continue;
    }
    const target = s.bodies.filter(body => body.type === 'signal').sort((a, b) => a.z - b.z)[0];
    let x = 135, y = 320;
    if (target) {
      const t = Math.max(0, Math.min(1.2, 1 - target.z));
      x = 135 + target.lx * 108 * t; y = Math.max(110, Math.min(345, 76.8 + 268.8 * t + target.ly * 82 * t));
    }
    game.setInput({ ax: Math.max(-1, Math.min(1, (x - s.earth.x) / 24)), ay: Math.max(-1, Math.min(1, (y - s.earth.y) / 24)) });
    game.update(1 / 30);
  }
  return game.debug.state();
}

test('L05 revive restores level mass, preserves progress, avoids wells and can earn one assisted first clear without a best time', () => {
  const env = fixture(savedThrough('L04')), game = env.game;
  game.action('startCampaign', 'L05'); game.update(1);
  game.debug.patch({ bodies: [signalAt(game)] }); game.update(.01);
  const before = game.debug.state();
  const well = wellAt(game);
  game.debug.patch({ bodies: [well], earth: { mass: 15, x: 207, y: 318 } });
  game.debug.fail('被黑暗天体吞没'); game.update(.8);
  assert.equal(game.getView().screen, 'revive');
  const offer = game.getReviveOffer();
  assert.equal(offer.eligible, true);
  assert.equal(game.completeRevive(offer.offerId), true);
  const revived = game.debug.state();
  assert.equal(revived.earth.mass, 60);
  assert.equal(revived.earth.invuln, 1.5);
  assert.equal(revived.earth.alive, true);
  assert.equal(revived.runT, before.runT);
  assert.equal(revived.v2.signals, before.v2.signals);
  assert.equal(revived.v2.cursor, before.v2.cursor);
  assert.equal(revived.progress, before.progress);
  assert.deepEqual(revived.bodies, []);
  const t = 1 - well.z, wx = 135 + well.lx * 108 * t, wy = 76.8 + 268.8 * t + well.ly * 82 * t;
  const influence = Math.max(10, well.r * (.25 + 1.45 * t)) * 3.4;
  assert.ok(Math.hypot(revived.earth.x - wx, revived.earth.y - wy) > influence, 'revive point must be outside the original well influence');
  assert.equal(game.completeRevive(offer.offerId), false);
  const finished = pilot(game);
  assert.equal(finished.outcome, 'complete');
  assert.equal(finished.v2.result.assisted, true);
  assert.equal(game.getView().v2.result.assisted, true);
  assert.match(game.getView().v2.result.recordText, /不更新最佳/);
  const saved = JSON.parse(env.saved);
  assert.equal(saved.campaignV2.completed.includes('L05'), true);
  assert.equal(saved.campaignV2.firstRewards.L05, true);
  assert.equal(saved.campaignV2.best.L05, undefined);
  assert.equal(saved.growthV2.points, 2);
  const writes = env.writes.length;
  assert.equal(game.getView().v2.result.savePending, false);
  assert.equal(game.action('retrySave'), false);
  assert.equal(env.writes.length, writes);
});

test('only L05 through L12 chase failures offer one configured revive', () => {
  for (const level of Campaign.LEVELS) {
    const game = fixture(savedThrough('L12')).game;
    game.action('startCampaign', level.id); game.debug.fail('矩阵验证'); game.update(.8);
    const eligible = Number(level.id.slice(1)) >= 5;
    assert.equal(game.getReviveOffer().eligible, eligible, level.id);
    if (eligible) assert.equal(game.getView().screen, 'revive', level.id);
  }
  const disabled = fixture(savedThrough('L04'), false).game;
  disabled.action('startCampaign', 'L05'); disabled.debug.fail(); disabled.update(.8);
  assert.equal(disabled.getView().screen, 'result');
  assert.equal(disabled.getReviveOffer().eligible, false);
});

test('daily, endless and V2 capture failures never expose revive', () => {
  const game = fixture(savedThrough('L12')).game;
  game.action('startDaily'); game.debug.fail(); game.update(.8);
  assert.equal(game.getView().screen, 'result'); assert.equal(game.getReviveOffer().eligible, false);
  game.action('home'); game.action('startEndless'); game.debug.fail(); game.update(.8);
  assert.equal(game.getView().screen, 'result'); assert.equal(game.getReviveOffer().eligible, false);
  for (const id of ['L08', 'L12']) {
    const capture = fixture(savedThrough('L12')).game;
    capture.action('startCampaign', id); capture.debug.enterCapture(); capture.debug.finishCapture(false); capture.update(3);
    assert.equal(capture.getView().screen, 'result', id);
    assert.equal(capture.getReviveOffer().eligible, false, id);
  }
});
