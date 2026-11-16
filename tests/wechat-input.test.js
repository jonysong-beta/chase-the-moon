'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createInput } = require('../minigame/src/input');

function setup() {
  let view = { screen: 'play', paused: false, controls: { visible: true, jetVisible: true, captureVisible: false } };
  const calls = { input: [], jet: 0, capture: 0, actions: [], resets: 0 };
  const game = {
    getView: () => view,
    setInput: value => calls.input.push(value),
    pressJet: () => calls.jet++,
    pressCapture: () => calls.capture++,
    resetInput: () => calls.resets++
  };
  const ui = { hitTest: (x, y) => x > 180 && y > 360 ? { action: view.screen === 'qte' ? 'capture' : 'jet' } :
    x > 80 && x < 150 && y < 60 ? { action: 'home' } : null };
  const toLogical = touch => touch.clientX < 0 || touch.clientX > 270 || touch.clientY < 0 || touch.clientY > 480 ? null : { x: touch.clientX, y: touch.clientY };
  const input = createInput({ game, ui, onAction: (name, payload) => calls.actions.push([name, payload]), toLogical });
  return { input, calls, ui, screen: value => { view = Object.assign({}, view, value); } };
}
const touch = (identifier, x, y) => ({ identifier, clientX: x, clientY: y });
const event = (...touches) => ({ changedTouches: touches, touches });
const latest = calls => calls.input[calls.input.length - 1];

test('independent fingers steer and hold jet; either finger can release first', () => {
  const { input, calls } = setup();
  input.start(event(touch(1, 65, 410)));
  input.move(event(touch(1, 95, 410)));
  assert.ok(latest(calls).ax > .9);
  input.start(event(touch(2, 220, 420)));
  assert.equal(calls.jet, 1);
  assert.equal(latest(calls).jetHeld, true);
  input.end(event(touch(2, 220, 420)));
  assert.equal(latest(calls).jetHeld, false);
  assert.ok(latest(calls).ax > .9);
  input.end(event(touch(1, 95, 410)));
  assert.deepEqual(latest(calls), { ax: 0, ay: 0, jetHeld: false });
});

test('cancellation and reset clear all owned touches', () => {
  const { input, calls } = setup();
  input.start(event(touch(1, 65, 410), touch(2, 220, 420)));
  input.move(event(touch(1, 95, 410)));
  input.cancel(event(touch(1, 95, 410), touch(2, 220, 420)));
  assert.deepEqual(latest(calls), { ax: 0, ay: 0, jetHeld: false });
  assert.equal(input.getStick().active, false);
  input.start(event(touch(3, 65, 410)));
  input.reset();
  assert.ok(calls.resets > 0);
  assert.equal(input.getStick().active, false);
});

test('outside touches are refused and leaving the canvas clears axes until re-entry', () => {
  const { input, calls } = setup();
  input.start(event(touch(1, -1, 400)));
  assert.equal(input.getStick().active, false);
  input.start(event(touch(2, 65, 410)));
  input.move(event(touch(2, 500, 410)));
  assert.equal(latest(calls).ax, 0);
  input.move(event(touch(2, 95, 410)));
  assert.ok(latest(calls).ax > .9);
  assert.ok(Math.hypot(latest(calls).ax, latest(calls).ay) <= 1);
});

test('UI taps have priority and dragging away never becomes a tap', () => {
  const { input, calls } = setup();
  input.start(event(touch(1, 100, 30)));
  input.end(event(touch(1, 100, 30)));
  assert.equal(calls.actions[0][0], 'home');
  input.start(event(touch(2, 100, 30)));
  input.move(event(touch(2, 160, 80)));
  input.move(event(touch(2, 100, 30)));
  input.end(event(touch(2, 100, 30)));
  assert.equal(calls.actions.length, 1);
});

test('screen changes and pausing discard stale gestures', () => {
  const { input, calls, screen } = setup();
  input.start(event(touch(1, 65, 410), touch(2, 220, 420)));
  screen({ screen: 'qte', controls: { visible: true, jetVisible: false, captureVisible: true } });
  input.move(event(touch(1, 95, 410)));
  assert.deepEqual(latest(calls), { ax: 0, ay: 0, jetHeld: false });
  input.start(event(touch(3, 220, 420)));
  assert.equal(calls.capture, 1);
  screen({ paused: true });
  input.move(event(touch(3, 221, 420)));
  assert.equal(input.getStick().active, false);
  input.start(event(touch(4, 220, 420)));
  assert.equal(calls.capture, 1);
});

test('cancel without a touch list and end outside both release held input', () => {
  const { input, calls } = setup();
  input.start(event(touch(1, 65, 410), touch(2, 220, 420)));
  input.end(event(touch(2, 999, 999)));
  assert.equal(latest(calls).jetHeld, false);
  input.cancel({});
  assert.equal(input.getStick().active, false);
});

test('UI hit regions inside the joystick zone win before joystick acquisition', () => {
  const { input, calls, ui } = setup();
  ui.hitTest = () => ({ action: 'home' });
  input.start(event(touch(1, 65, 410)));
  assert.equal(input.getStick().active, false);
  input.end(event(touch(1, 65, 410)));
  assert.equal(calls.actions[0][0], 'home');
});

test('long diagonal drags saturate at unit length; releasing stick leaves jet held', () => {
  const { input, calls } = setup();
  input.start(event(touch(1, 65, 410), touch(2, 220, 420)));
  input.move(event(touch(1, 150, 480)));
  assert.ok(Math.abs(Math.hypot(latest(calls).ax, latest(calls).ay) - 1) < 1e-10);
  input.end(event(touch(1, 150, 480)));
  assert.deepEqual(latest(calls), { ax: 0, ay: 0, jetHeld: true });
  input.end(event(touch(2, 220, 420)));
  assert.equal(latest(calls).jetHeld, false);
});

test('QTE uses the same joystick while another finger presses capture once', () => {
  const { input, calls, screen } = setup();
  screen({ screen: 'qte', controls: { visible: true, jetVisible: false, captureVisible: true } });
  input.start(event(touch(1, 65, 410)));
  input.move(event(touch(1, 65, 380)));
  input.start(event(touch(2, 220, 420)));
  assert.ok(latest(calls).ay < -.9);
  assert.equal(calls.capture, 1);
  assert.equal(calls.jet, 0);
  input.end(event(touch(2, 220, 420)));
  assert.ok(latest(calls).ay < -.9);
});
