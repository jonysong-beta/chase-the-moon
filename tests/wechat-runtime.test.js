'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlatform } = require('../minigame/src/platform');
const { start } = require('../minigame/src/runtime');

function fakeWx(options) {
  options = options || {};
  const listeners = new Map();
  const frames = new Map();
  const canvases = [];
  const images = [];
  const ads = [];
  const written = [];
  const fontPaths = [];
  let nextFrame = 0;
  let info = options.info || { windowWidth: 390, windowHeight: 844, pixelRatio: 4, safeArea: { left: 0, top: 47, right: 390, bottom: 810 } };
  const wx = {
    createCanvas() {
      const operations = [];
      const ctx = new Proxy({
        measureText: value => ({ width: Array.from(String(value)).length * 5 }),
        createPattern: () => ({})
      }, {
        get(target, key) { return key in target ? target[key] : (...args) => operations.push({ name: key, args }); },
        set(target, key, value) { target[key] = value; return true; }
      });
      const canvas = { width: 0, height: 0, getContext: () => ctx, operations };
      canvases.push(canvas); return canvas;
    },
    createImage() {
      const image = { width: 1044, height: 1884 };
      Object.defineProperty(image, 'src', { set(path) {
        images.push(path);
        queueMicrotask(() => {
          if (options.failImage && path.includes(options.failImage)) { if (image.onerror) image.onerror(new Error('missing')); }
          else if (image.onload) image.onload();
        });
      } });
      return image;
    },
    getWindowInfo: () => info,
    getMenuButtonBoundingClientRect: () => ({ top: 51, bottom: 83, height: 32 }),
    getStorageSync: () => '',
    setStorageSync(key, value) { written.push(JSON.parse(value)); },
    loadFont(path) { fontPaths.push(path); return options.noFonts ? null : 'local-font-' + fontPaths.length; },
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    createRewardedVideoAd() {
      const close = new Set(); const error = new Set();
      const ad = {
        destroyed: false,
        show: () => options.adFailure ? Promise.reject({ errCode: 1004 }) : Promise.resolve(),
        load: () => Promise.resolve(),
        onClose(fn) { close.add(fn); }, offClose(fn) { close.delete(fn); },
        onError(fn) { error.add(fn); }, offError(fn) { error.delete(fn); },
        close(value) { Array.from(close).forEach(fn => fn(value)); },
        oldClose: () => Array.from(close)[0],
        destroy() { this.destroyed = true; }
      };
      ads.push(ad); return ad;
    }
  };
  for (const name of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show', 'WindowResize']) {
    const set = new Set(); listeners.set(name, set);
    wx['on' + name] = fn => set.add(fn);
    wx['off' + name] = fn => set.delete(fn);
  }
  return {
    wx, listeners, frames, canvases, images, ads, written, fontPaths,
    emit(name, event) { listeners.get(name).forEach(fn => fn(event)); },
    setInfo(value) { info = value; },
    frame(time) { const pending = Array.from(frames.values()); frames.clear(); pending.forEach(fn => fn(time)); }
  };
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function enterRun(app) {
  app.handleAction('openMenu'); app.handleAction('start'); app.handleAction('skipIntro');
}
function offerRevive(app) {
  app.game.debug.fail(); app.game.update(0.76);
  assert.equal(app.game.getView().screen, 'revive');
  return app.game.getReviveOffer().offerId;
}

test('platform maps a DPR-capped safe/capsule viewport and keeps letterbox outside the logical game', async () => {
  const fake = fakeWx();
  const platform = createPlatform(fake.wx);
  assert.equal(fake.canvases.length, 1);
  assert.equal(platform.canvas.width, 1170);
  assert.equal(platform.canvas.height, 2532);
  const viewport = platform.getViewport();
  assert.ok(viewport.y >= 89);
  assert.ok(viewport.y + viewport.gameHeight <= 810);
  const center = platform.toLogical({ clientX: viewport.x + viewport.gameWidth / 2, clientY: viewport.y + viewport.gameHeight / 2 });
  assert.ok(Math.abs(center.x - 135) < 1e-9 && Math.abs(center.y - 240) < 1e-9);
  assert.equal(platform.toLogical({ clientX: 0, clientY: 0 }), null);
  await platform.loadAssets();
  assert.equal(fake.images.length, 10);
  assert.ok(fake.images.includes('assets/ui/daily-scenes.webp'));
  assert.ok(fake.images.every(path => !path.includes('?')));
  assert.equal(fake.fontPaths.length, 4);
  assert.equal(platform.fonts.mono, '"local-font-1"');
  platform.beginFrame(); platform.endFrame();
  assert.ok(fake.canvases[0].operations.some(operation => operation.name === 'clip'));
  fake.setInfo({ windowWidth: 320, windowHeight: 568, pixelRatio: 2 });
  fake.emit('WindowResize', { size: { windowWidth: 320, windowHeight: 568 } });
  assert.equal(platform.canvas.width, 640);
  const resized = platform.getViewport();
  const mapped = platform.toLogical({ x: resized.x + resized.scale * 100, y: resized.y + resized.scale * 100 });
  assert.ok(Math.abs(mapped.x - 100) < 1e-9 && Math.abs(mapped.y - 100) < 1e-9);
  platform.createCanvas(); assert.equal(fake.canvases.length, 2);
  platform.destroy();
  assert.equal(fake.listeners.get('WindowResize').size, 0);
});

test('platform falls back to system info/fonts and reports missing required images', async () => {
  const fake = fakeWx({ noFonts: true, failImage: 'moon-dark' });
  delete fake.wx.getWindowInfo;
  fake.wx.getSystemInfoSync = () => ({ windowWidth: 360, windowHeight: 640, pixelRatio: 2 });
  const platform = createPlatform(fake.wx);
  await assert.rejects(platform.loadAssets(), /moonDark/);
  assert.equal(platform.fonts.title, 'serif');
  assert.equal(platform.createAudioContext(), null);
  platform.destroy();
});

test('runtime starts, draws, resets frame time across lifecycle/resize, and destroys every binding/frame', async () => {
  const fake = fakeWx();
  const app = await start(fake.wx, { debug: true });
  assert.equal(app.game.getView().screen, 'cover');
  assert.equal(fake.frames.size, 1);
  enterRun(app);
  fake.frame(100); fake.frame(120);
  const before = app.game.debug.state().runT;
  assert.ok(before > 0);
  fake.emit('Hide'); fake.frame(10000);
  assert.equal(app.game.debug.state().runT, before);
  fake.emit('Show'); fake.frame(20000);
  assert.equal(app.game.debug.state().runT, before);
  fake.frame(20020);
  assert.ok(app.game.debug.state().runT > before);
  fake.emit('WindowResize', { size: { windowWidth: 400, windowHeight: 800 } });
  const resizedTime = app.game.debug.state().runT;
  fake.frame(30000);
  assert.equal(app.game.debug.state().runT, resizedTime);
  app.destroy(); app.destroy();
  assert.equal(fake.frames.size, 0);
  for (const set of fake.listeners.values()) assert.equal(set.size, 0);
  assert.equal(app.handleAction('start'), false);
});

test('complete ad rewards current offer while background pause remains active', async () => {
  const fake = fakeWx();
  const app = await start(fake.wx, { debug: true, rewardedAdUnitId: 'adunit-test' });
  enterRun(app); const offer = offerRevive(app);
  const showing = app.handleAction('watchAd', offer);
  await flush();
  assert.equal(app.getAdState().busy, true);
  fake.emit('Hide');
  fake.ads[0].close({ isEnded: true }); await showing;
  assert.equal(app.game.getView().screen, 'play');
  assert.equal(app.game.getView().revive.used, true);
  assert.equal(app.game.getView().paused, true);
  assert.equal(app.getAdState().busy, false);
  const time = app.game.debug.state().runT;
  app.game.update(2); assert.equal(app.game.debug.state().runT, time);
  fake.emit('Show'); assert.equal(app.game.getView().paused, false);
  app.destroy();
});

test('retry during video retires old callback and a later offer cannot consume its reward', async () => {
  const fake = fakeWx();
  const app = await start(fake.wx, { debug: true, rewardedAdUnitId: 'adunit-test' });
  enterRun(app); const oldOffer = offerRevive(app);
  const oldRequest = app.handleAction('watchAd', oldOffer); await flush();
  const staleClose = fake.ads[0].oldClose();
  assert.equal(app.handleAction('retry'), true);
  assert.equal(app.getAdState().busy, false);
  assert.equal(app.game.getView().screen, 'play');
  assert.equal(app.game.getView().paused, false);
  assert.equal(fake.ads[0].destroyed, true);
  await oldRequest;
  const newOffer = offerRevive(app);
  const currentRequest = app.handleAction('watchAd', newOffer); await flush();
  staleClose({ isEnded: true }); await flush();
  assert.equal(app.game.getView().screen, 'revive');
  assert.equal(app.getAdState().busy, true);
  assert.equal(app.game.getView().revive.used, false);
  fake.ads[1].close({ isEnded: true }); await currentRequest;
  assert.equal(app.game.getView().revive.used, true);
  assert.equal(fake.written.length, 1);
  app.destroy();
});

test('early close or no inventory never rewards and leaves decline/home usable', async () => {
  for (const failure of [false, true]) {
    const fake = fakeWx({ adFailure: failure });
    const app = await start(fake.wx, { debug: true, rewardedAdUnitId: 'adunit-test' });
    enterRun(app); const offer = offerRevive(app);
    const request = app.handleAction('watchAd', offer); await flush();
    if (!failure) fake.ads[0].close({ isEnded: false });
    await request;
    assert.equal(app.game.getView().revive.used, false);
    assert.equal(app.game.getView().paused, false);
    assert.equal(app.getAdState().busy, false);
    assert.match(app.getAdState().message, failure ? /暂无可用视频/ : /未完整观看/);
    assert.equal(app.handleAction('home'), true);
    assert.equal(app.game.getView().screen, 'title');
    assert.equal(fake.written.length, 1);
    app.destroy();
  }
});

test('empty ad configuration has no revive even with debug, and production exposes no debug', async () => {
  const fake = fakeWx();
  const app = await start(fake.wx, { debug: true, rewardedAdUnitId: '' });
  enterRun(app); app.game.debug.fail(); app.game.update(0.8);
  assert.equal(app.game.getView().screen, 'result');
  assert.equal(app.getAdState().configured, false);
  assert.equal(await app.handleAction('watchAd'), false);
  assert.equal(fake.ads.length, 0);
  app.destroy();
  const production = await start(fake.wx, {});
  assert.equal(production.game.debug, undefined);
  production.destroy();
});

test('destroy while a video is pending resolves without a reward or a live native ad', async () => {
  const fake = fakeWx();
  const app = await start(fake.wx, { debug: true, rewardedAdUnitId: 'adunit-test' });
  enterRun(app); const offer = offerRevive(app);
  const request = app.handleAction('watchAd', offer); await flush();
  const staleClose = fake.ads[0].oldClose();
  app.destroy(); await request;
  staleClose({ isEnded: true });
  assert.equal(app.game.getView().revive.used, false);
  assert.equal(fake.ads[0].destroyed, true);
  assert.equal(fake.frames.size, 0);
});

test('real touch bindings reach menu/run and clear simultaneous steering/jet on resize and hide', async () => {
  const fake = fakeWx();
  const app = await start(fake.wx, { debug: true });
  let touchId = 0;
  function touch(x, y, id) {
    const v = app.platform.getViewport();
    return { identifier: id || ++touchId, clientX: v.x + x * v.scale, clientY: v.y + y * v.scale };
  }
  function tap(x, y) {
    const point = touch(x, y);
    fake.emit('TouchStart', { changedTouches: [point], touches: [point] });
    fake.emit('TouchEnd', { changedTouches: [point], touches: [] });
  }
  tap(135, 422); fake.frame(1);
  assert.equal(app.game.getView().screen, 'title');
  tap(135, 455); fake.frame(20);
  assert.equal(app.game.getView().screen, 'classic');
  tap(135, 396); fake.frame(30);
  assert.equal(app.game.getView().screen, 'intro');
  tap(135, 439); fake.frame(40);
  assert.equal(app.game.getView().screen, 'play');
  const stick = touch(60, 420);
  const jet = touch(230, 431);
  fake.emit('TouchStart', { changedTouches: [stick, jet], touches: [stick, jet] });
  const moved = touch(85, 420, stick.identifier);
  fake.emit('TouchMove', { changedTouches: [moved], touches: [moved, jet] });
  assert.ok(app.game.debug.state().input.ax > 0);
  assert.equal(app.input.getStick().jetHeld, true);
  fake.emit('WindowResize', { size: { windowWidth: 390, windowHeight: 844 } });
  assert.equal(app.input.getStick().active, false);
  assert.equal(app.game.debug.state().input.jet, false);
  fake.emit('Hide');
  assert.equal(app.game.debug.state().input.ax, 0);
  app.destroy();
});

test('decline while ad prepares saves once, ignores completion and frees controls immediately', async () => {
  const fake = fakeWx();
  const app = await start(fake.wx, { debug: true, rewardedAdUnitId: 'adunit-test' });
  enterRun(app); const offer = offerRevive(app);
  const request = app.handleAction('watchAd', offer); await flush();
  const staleClose = fake.ads[0].oldClose();
  app.handleAction('declineRevive', offer);
  assert.equal(app.game.getView().screen, 'result');
  assert.equal(app.game.getView().paused, false);
  assert.equal(app.getAdState().busy, false);
  staleClose({ isEnded: true }); await request;
  assert.equal(fake.written.length, 1);
  assert.equal(app.game.getView().revive.used, false);
  app.destroy();
});
