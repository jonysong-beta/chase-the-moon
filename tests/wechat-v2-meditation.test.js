'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('../minigame/src/core');
const { createUI } = require('../minigame/src/ui');

test('meditation freezes in background and completes without score, rewards or storage writes', () => {
  let saved = null, writes = 0;
  const storage = { getItem() { return saved; }, setItem(key, value) { writes++; saved = value; } };
  const game = createGame({ storage, debug: true }); game.action('openMenu');
  assert.equal(game.action('openMeditation'), true);
  assert.equal(game.getView().screen, 'meditation');
  assert.equal(game.getView().meditation.duration, 300);
  assert.equal(game.action('setMeditationDuration', 45), false);
  assert.equal(game.action('setMeditationDuration', 120), true);
  assert.equal(game.action('startMeditation'), true);
  game.update(2); assert.ok(Math.abs(game.getView().meditation.elapsed - 2) < 1e-8);
  const beforePause = game.getView().meditation.elapsed;
  game.pause('background'); game.update(60); assert.equal(game.getView().meditation.elapsed, beforePause);
  game.resume('background'); game.update(60); game.update(60);
  const done = game.getView().meditation;
  assert.equal(done.completed, true); assert.equal(done.running, false); assert.equal(done.remaining, 0);
  assert.equal(game.getView().screen, 'meditation');
  assert.equal(game.getView().v2.growth.points, 0); assert.equal(writes, 0);
  assert.equal(game.action('backToHub'), true); assert.equal(game.getView().screen, 'title');
});

test('meditation duration and start controls are touch accessible and gated while running', () => {
  const ctx = new Proxy({ measureText(value) { return { width: String(value).length * 10 }; } },
    { get: (object, key) => key in object ? object[key] : () => {} });
  const ui = createUI({ ctx, assets: {}, onAction() {} });
  const view = { screen: 'meditation', meditation: { duration: 300, elapsed: 0, remaining: 300,
    running: false, completed: false, visualTime: 0, phase: 'still' } };
  ui.drawOverlay(view);
  assert.deepEqual(ui.hitTest(59, 390), { action: 'setMeditationDuration', payload: 120 });
  assert.deepEqual(ui.hitTest(137, 390), { action: 'setMeditationDuration', payload: 300 });
  assert.deepEqual(ui.hitTest(215, 390), { action: 'setMeditationDuration', payload: 600 });
  assert.equal(ui.hitTest(135, 448).action, 'startMeditation');
  assert.equal(ui.hitTest(60, 19).action, 'backToHub');
  view.meditation.running = true; ui.drawOverlay(view);
  assert.equal(ui.hitTest(59, 390), null);
  assert.equal(ui.hitTest(135, 448).action, 'backToHub');
});
