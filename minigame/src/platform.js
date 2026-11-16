'use strict';

const WIDTH = 270;
const HEIGHT = 480;
const IMAGE_TIMEOUT_MS = 15000;
const IMAGE_PATHS = Object.freeze({
  cover: 'assets/ui/cover-bg.webp', coverMoon: 'assets/ui/cover-moon.webp', menu: 'assets/ui/menu.webp',
  moon: 'assets/sprites/moon.webp', moonDark: 'assets/sprites/moon-dark.webp',
  earth: 'assets/sprites/earth.webp', well: 'assets/sprites/well.webp',
  rock: 'assets/sprites/rock.webp', signal: 'assets/sprites/signal.webp',
  dailyScenes: 'assets/ui/daily-scenes.webp'
});
const FONT_PATHS = Object.freeze({
  mono: 'assets/fonts/GeistMono.woff2', title: 'assets/fonts/NotoSerifSC-700-sub.woff2',
  display: 'assets/fonts/Limelight.woff2', body: 'assets/fonts/JosefinSans-300.woff2'
});

function createPlatform(wx) {
  if (!wx || typeof wx.createCanvas !== 'function') throw new TypeError('WeChat Canvas API is required');
  // WeChat makes the first created Canvas the on-screen surface.
  const canvas = wx.createCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  const assets = {};
  const fonts = { mono: 'monospace', title: 'serif', display: 'serif', body: 'monospace' };
  let viewport = null;
  let disposed = false;
  let loading = null;
  let frameOpen = false;
  const imageLoads = new Set();
  const frameHandles = new Set();
  const resizeListeners = new Set();
  const audioContexts = new Set();
  const positive = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const bound = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

  const storage = {
    getItem(key) {
      if (typeof wx.getStorageSync !== 'function') throw new Error('Local storage is unavailable');
      const value = wx.getStorageSync(key);
      if (value === undefined || value === null || value === '') return null;
      return typeof value === 'string' ? value : JSON.stringify(value);
    },
    setItem(key, value) {
      if (typeof wx.setStorageSync !== 'function') throw new Error('Local storage is unavailable');
      wx.setStorageSync(key, String(value));
    }
  };
  function windowInfo() {
    let info = null;
    if (typeof wx.getWindowInfo === 'function') {
      try { info = wx.getWindowInfo(); } catch (_) {}
    }
    if (!info && typeof wx.getSystemInfoSync === 'function') info = wx.getSystemInfoSync();
    return info || {};
  }
  function resize(event) {
    if (disposed) return viewport;
    const info = windowInfo();
    const size = event && (event.size || event);
    const width = positive(size && size.windowWidth, positive(info.windowWidth, positive(info.screenWidth, 375)));
    const height = positive(size && size.windowHeight, positive(info.windowHeight, positive(info.screenHeight, 667)));
    const pixelRatio = bound(positive(info.pixelRatio, 1), 1, 3);
    const safe = info.safeArea || {};
    const left = bound(finite(safe.left, 0), 0, width - 1);
    const right = bound(finite(safe.right, width), left + 1, width);
    let top = bound(finite(safe.top, finite(info.statusBarHeight, 0)), 0, height - 1);
    const bottom = bound(finite(safe.bottom, height), top + 1, height);
    if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
      try {
        const capsule = wx.getMenuButtonBoundingClientRect();
        if (capsule && positive(capsule.height, 0) && Number.isFinite(capsule.bottom)) top = Math.max(top, capsule.bottom + 6);
      } catch (_) {}
    }
    top = bound(top, 0, bottom - 1);
    const scale = Math.min((right - left) / WIDTH, (bottom - top) / HEIGHT);
    const gameWidth = WIDTH * scale;
    const gameHeight = HEIGHT * scale;
    viewport = {
      width, height, pixelRatio, scale,
      x: left + (right - left - gameWidth) / 2,
      y: top + (bottom - top - gameHeight) / 2,
      gameWidth, gameHeight, safe: { left, top, right, bottom }
    };
    const backingWidth = Math.round(width * pixelRatio);
    const backingHeight = Math.round(height * pixelRatio);
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    resizeListeners.forEach(listener => listener(getViewport()));
    return getViewport();
  }
  function getViewport() {
    return viewport && Object.assign({}, viewport, { safe: Object.assign({}, viewport.safe) });
  }
  function toLogical(touch) {
    if (!touch || !viewport) return null;
    const clientX = Number(touch.clientX === undefined ? touch.x : touch.clientX);
    const clientY = Number(touch.clientY === undefined ? touch.y : touch.clientY);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    const x = (clientX - viewport.x) / viewport.scale;
    const y = (clientY - viewport.y) / viewport.scale;
    return x < 0 || y < 0 || x > WIDTH || y > HEIGHT ? null : { x, y };
  }
  function beginFrame() {
    if (disposed) return;
    if (frameOpen) endFrame();
    const v = viewport;
    ctx.setTransform(v.pixelRatio, 0, 0, v.pixelRatio, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0B1520';
    ctx.fillRect(0, 0, v.width, v.height);
    ctx.save(); frameOpen = true;
    ctx.translate(v.x, v.y); ctx.scale(v.scale, v.scale);
    ctx.beginPath(); ctx.rect(0, 0, WIDTH, HEIGHT); ctx.clip();
    ctx.imageSmoothingEnabled = false;
  }
  function endFrame() {
    if (frameOpen) { ctx.restore(); frameOpen = false; }
  }
  function createCanvas() {
    if (disposed) throw new Error('Platform has been destroyed');
    return wx.createCanvas();
  }
  function createAudioContext() {
    if (disposed || typeof wx.createWebAudioContext !== 'function') return null;
    try {
      const context = wx.createWebAudioContext();
      if (context) audioContexts.add(context);
      return context || null;
    } catch (_) { return null; }
  }
  function loadImage(key, path) {
    return new Promise((resolve, reject) => {
      let image;
      try {
        if (typeof wx.createImage === 'function') image = wx.createImage();
        else if (typeof canvas.createImage === 'function') image = canvas.createImage();
      } catch (_) {}
      if (!image) { reject(new Error('Cannot create required image: ' + key)); return; }
      let settled = false;
      let timer;
      const request = { cancel() { finish(new Error('Required image loading cancelled: ' + key)); } };
      function finish(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer); imageLoads.delete(request);
        image.onload = image.onerror = null;
        if (error) reject(error);
        else { assets[key] = image; resolve(image); }
      }
      imageLoads.add(request);
      image.onload = () => finish(!image.width || !image.height ? new Error('Required image has no dimensions: ' + key) : null);
      image.onerror = () => finish(new Error('Failed to load required image: ' + key + ' (' + path + ')'));
      timer = setTimeout(() => finish(new Error('Required image timed out: ' + key)), IMAGE_TIMEOUT_MS);
      try { image.src = path; } catch (_) { finish(new Error('Failed to load required image: ' + key)); }
    });
  }
  function loadAssets() {
    if (disposed) return Promise.reject(new Error('Platform has been destroyed'));
    if (loading) return loading;
    Object.keys(FONT_PATHS).forEach(key => {
      if (typeof wx.loadFont !== 'function') return;
      try {
        const family = wx.loadFont(FONT_PATHS[key]);
        if (typeof family === 'string' && family.trim()) fonts[key] = '"' + family.replace(/["\\\r\n]/g, '') + '"';
      } catch (_) { /* A missing optional font retains the explicit fallback. */ }
    });
    loading = Promise.all(Object.keys(IMAGE_PATHS).map(key => loadImage(key, IMAGE_PATHS[key]))).then(() => assets, error => {
      imageLoads.forEach(request => request.cancel());
      throw error;
    });
    return loading;
  }
  const requestNative = typeof wx.requestAnimationFrame === 'function'
    ? wx.requestAnimationFrame.bind(wx) : typeof canvas.requestAnimationFrame === 'function'
      ? canvas.requestAnimationFrame.bind(canvas) : typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame : callback => setTimeout(() => callback(Date.now()), 16);
  const cancelNative = typeof wx.cancelAnimationFrame === 'function'
    ? wx.cancelAnimationFrame.bind(wx) : typeof canvas.cancelAnimationFrame === 'function'
      ? canvas.cancelAnimationFrame.bind(canvas) : typeof cancelAnimationFrame === 'function'
        ? cancelAnimationFrame : clearTimeout;
  function requestFrame(callback) {
    if (disposed) return null;
    let handle;
    handle = requestNative(time => {
      frameHandles.delete(handle);
      if (!disposed) callback(time);
    });
    frameHandles.add(handle);
    return handle;
  }
  function cancelFrame(handle) {
    if (handle === null || handle === undefined) return;
    frameHandles.delete(handle); cancelNative(handle);
  }
  function onResize(listener) {
    resizeListeners.add(listener);
    return () => resizeListeners.delete(listener);
  }
  const resizeHandler = event => resize(event);
  resize();
  if (typeof wx.onWindowResize === 'function') wx.onWindowResize(resizeHandler);
  function destroy() {
    if (disposed) return;
    disposed = true;
    endFrame();
    frameHandles.forEach(handle => cancelNative(handle)); frameHandles.clear();
    imageLoads.forEach(request => request.cancel());
    resizeListeners.clear();
    audioContexts.forEach(context => {
      try {
        const closed = typeof context.close === 'function' ? context.close() : typeof context.suspend === 'function' ? context.suspend() : null;
        if (closed && closed.catch) closed.catch(function () {});
      } catch (_) {}
    });
    audioContexts.clear();
    if (typeof wx.offWindowResize === 'function') wx.offWindowResize(resizeHandler);
  }
  return { canvas, ctx, assets, fonts, storage, createCanvas, createAudioContext, loadAssets, beginFrame, endFrame, toLogical, resize, getViewport, requestFrame, cancelFrame, onResize, destroy };
}
module.exports = { createPlatform };
