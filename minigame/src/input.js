'use strict';

// The H5 thumb controls use CSS pixels. Keep their proportions at the original
// 375px portrait width, while all input and drawing use the 270px game space.
const CSS_TO_LOGICAL = 270 / 375;
const CONTROL_GEOMETRY = Object.freeze({
  radius: 48 * CSS_TO_LOGICAL,
  travel: 44 * CSS_TO_LOGICAL,
  dead: 3 * CSS_TO_LOGICAL,
  full: 40 * CSS_TO_LOGICAL,
  knobRadius: 17 * CSS_TO_LOGICAL,
  defaultX: 48, defaultY: 426,
  zoneLeft: 0, zoneRight: 148.5, zoneTop: 355, zoneBottom: 480,
  buttonX: 230, buttonY: 431, buttonRadius: 28
});

function createInput(options) {
  const { game, ui, onAction, toLogical } = options;
  if (!game || !ui || typeof toLogical !== 'function' || typeof onAction !== 'function') {
    throw new TypeError('createInput requires game, ui, onAction and toLogical');
  }
  let screen = game.getView().screen;
  let stickId = null;
  let jetId = null;
  let ax = 0;
  let ay = 0;
  let stick = restingStick();
  const taps = new Map();
  const geometry = CONTROL_GEOMETRY;

  function restingStick() {
    return { active: false, x: CONTROL_GEOMETRY.defaultX, y: CONTROL_GEOMETRY.defaultY, dx: 0, dy: 0, jetHeld: false };
  }
  function emit() {
    stick.jetHeld = jetId !== null;
    game.setInput({ ax, ay, jetHeld: jetId !== null });
  }
  function reset() {
    stickId = null;
    jetId = null;
    ax = ay = 0;
    taps.clear();
    stick = restingStick();
    game.resetInput();
    emit();
    screen = game.getView().screen;
  }
  function sync() {
    const view = game.getView();
    if (screen !== view.screen) {
      reset();
      return { view, changed: true };
    }
    if (view.paused && (stickId !== null || jetId !== null)) reset();
    return { view, changed: false };
  }
  function changed(event) {
    return Array.prototype.slice.call(event && (event.changedTouches || event.touches) || []);
  }
  function logical(touch) {
    // Pass the original touch object; the platform owns viewport/letterbox math.
    const point = toLogical(touch);
    return point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
      point.x >= 0 && point.x <= 270 && point.y >= 0 && point.y <= 480 ? point : null;
  }
  function moveStick(point) {
    if (!point) {
      ax = ay = stick.dx = stick.dy = 0;
      return;
    }
    const dx = point.x - stick.x;
    const dy = point.y - stick.y;
    const len = Math.hypot(dx, dy);
    const nx = len ? dx / len : 0;
    const ny = len ? dy / len : 0;
    const t = Math.max(0, Math.min(1, (len - geometry.dead) / (geometry.full - geometry.dead)));
    const strength = Math.pow(t, 1.1);
    ax = nx * strength;
    ay = ny * strength;
    stick.dx = nx * Math.min(len, geometry.travel);
    stick.dy = ny * Math.min(len, geometry.travel);
  }
  function start(event) {
    const { view } = sync();
    const controls = view.controls || {};
    changed(event).forEach(touch => {
      const id = touch.identifier;
      if (id === undefined || id === null || id === stickId || id === jetId || taps.has(id)) return;
      const point = logical(touch);
      if (!point) return;
      const hit = ui.hitTest(point.x, point.y);
      if (hit) {
        if (hit.action === 'jet') {
          if (!view.paused && controls.visible && controls.jetVisible && jetId === null) {
            jetId = id;
            game.pressJet();
          }
        } else if (hit.action === 'capture') {
          if (!view.paused && controls.visible && controls.captureVisible) game.pressCapture();
        } else {
          taps.set(id, { hit, x: point.x, y: point.y, moved: false, screen: view.screen });
        }
        return;
      }
      if (!view.paused && controls.visible && stickId === null &&
          point.x >= geometry.zoneLeft && point.x <= geometry.zoneRight &&
          point.y >= geometry.zoneTop && point.y <= geometry.zoneBottom) {
        stickId = id;
        stick = { active: true, x: point.x, y: point.y, dx: 0, dy: 0, jetHeld: jetId !== null };
        moveStick(point);
      }
    });
    emit();
  }
  function move(event) {
    const { view, changed: screenChanged } = sync();
    if (screenChanged) return;
    changed(event).forEach(touch => {
      const point = logical(touch);
      if (touch.identifier === stickId && !view.paused) moveStick(point);
      if (touch.identifier === jetId && !point) jetId = null;
      const tap = taps.get(touch.identifier);
      if (tap && (!point || Math.hypot(point.x - tap.x, point.y - tap.y) > 8)) tap.moved = true;
    });
    emit();
  }
  function end(event) {
    const { view, changed: screenChanged } = sync();
    if (screenChanged) return;
    changed(event).forEach(touch => {
      const id = touch.identifier;
      if (id === stickId) {
        stickId = null;
        ax = ay = 0;
        stick = restingStick();
      }
      if (id === jetId) jetId = null;
      const tap = taps.get(id);
      taps.delete(id);
      if (!tap || tap.moved || tap.screen !== view.screen) return;
      const point = logical(touch);
      const hit = point && ui.hitTest(point.x, point.y);
      if (point && Math.hypot(point.x - tap.x, point.y - tap.y) <= 8 && hit &&
          hit.action === tap.hit.action && JSON.stringify(hit.payload) === JSON.stringify(tap.hit.payload)) {
        onAction(hit.action, hit.payload);
        // An action may change screens synchronously, before the next event/frame.
        if (game.getView().screen !== screen) reset();
      }
    });
    emit();
  }
  return { start, move, end, cancel: reset, reset, getStick: () => Object.assign({}, stick) };
}

module.exports = { createInput, CONTROL_GEOMETRY };
