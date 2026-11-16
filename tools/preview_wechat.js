'use strict';

// Browser-only wx facade for local Canvas verification. Not copied into the game.
const { start } = require('../minigame/src/runtime');
const surface = document.getElementById('surface');
const overlay = document.getElementById('ad-overlay');
const status = document.getElementById('status');
const callbacks = {};
let screenCanvas = null;
let currentAd = null;
let background = false;
const fontLoads = [];
function emit(name, value) { (callbacks[name] || []).slice().forEach(callback => callback(value)); }
const wxMock = {
  createCanvas() {
    const canvas = document.createElement('canvas');
    if (!screenCanvas) { screenCanvas = canvas; surface.insertBefore(canvas, surface.firstChild); }
    canvas.toTempFilePath = settings => {
      try { settings.success({ tempFilePath: canvas.toDataURL('image/png') }); }
      catch (error) { if (settings.fail) settings.fail(error); }
    };
    return canvas;
  },
  createImage() {
    const image = new Image();
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(image, 'src', { get() { return descriptor.get.call(image); }, set(value) {
      descriptor.set.call(image, '/dist/wechat/' + value);
    } });
    return image;
  },
  getWindowInfo() {
    const rect = surface.getBoundingClientRect();
    return { windowWidth: rect.width, windowHeight: rect.height, pixelRatio: window.devicePixelRatio || 1,
      safeArea: { left: 0, top: 0, right: rect.width, bottom: rect.height, width: rect.width, height: rect.height } };
  },
  getSystemInfoSync() { return this.getWindowInfo(); },
  getStorageSync(key) { return localStorage.getItem('wechat-preview:' + key) || ''; },
  setStorageSync(key, value) { localStorage.setItem('wechat-preview:' + key, value); },
  shareAppMessage(settings) {
    window.__moonLastShare = { title: settings.title, query: settings.query, imageUrl: settings.imageUrl || '' };
    status.textContent = '预览已调用分享 · 非真实微信转发';
  },
  getLaunchOptionsSync() { return { query: window.__moonLaunchQuery || {} }; },
  loadFont(path) {
    const family = 'MoonPreview' + fontLoads.length;
    const face = new FontFace(family, 'url(/dist/wechat/' + path + ')');
    fontLoads.push(face.load().then(loaded => { document.fonts.add(loaded); }));
    return family;
  },
  createWebAudioContext() { return new (window.AudioContext || window.webkitAudioContext)(); },
  requestAnimationFrame(callback) { return window.requestAnimationFrame(callback); },
  cancelAnimationFrame(id) { window.cancelAnimationFrame(id); },
  createRewardedVideoAd() {
    const listeners = {};
    let dead = false;
    const ad = {
      show() {
        const mode = document.getElementById('ad-mode').value;
        if (mode !== 'normal') return Promise.reject({ errCode: mode === 'unavailable' ? 1004 : 1002 });
        if (dead) return Promise.reject({ errCode: 1000 });
        currentAd = ad; overlay.style.display = 'flex';
        return Promise.resolve();
      },
      load() { return Promise.resolve(); },
      destroy() { dead = true; if (currentAd === ad) { currentAd = null; overlay.style.display = 'none'; } },
      close(ended) {
        if (dead) return;
        (listeners.Close || []).slice().forEach(callback => callback({ isEnded: ended }));
      }
    };
    ['Load', 'Error', 'Close'].forEach(name => {
      listeners[name] = [];
      ad['on' + name] = callback => listeners[name].push(callback);
      ad['off' + name] = callback => { listeners[name] = listeners[name].filter(item => item !== callback); };
    });
    return ad;
  }
};
['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show', 'WindowResize'].forEach(name => {
  callbacks[name] = [];
  wxMock['on' + name] = callback => callbacks[name].push(callback);
  wxMock['off' + name] = callback => { callbacks[name] = callbacks[name].filter(item => item !== callback); };
});
const touches = new Map();
function touch(event) {
  const rect = surface.getBoundingClientRect();
  return { identifier: event.pointerId, clientX: event.clientX - rect.left, clientY: event.clientY - rect.top };
}
surface.addEventListener('pointerdown', event => {
  if (event.target !== screenCanvas) return;
  event.preventDefault(); surface.setPointerCapture(event.pointerId);
  const item = touch(event); touches.set(item.identifier, item);
  emit('TouchStart', { changedTouches: [item], touches: Array.from(touches.values()) });
});
surface.addEventListener('pointermove', event => {
  if (!touches.has(event.pointerId)) return;
  event.preventDefault(); const item = touch(event); touches.set(item.identifier, item);
  emit('TouchMove', { changedTouches: [item], touches: Array.from(touches.values()) });
});
function end(event, cancelled) {
  if (!touches.has(event.pointerId)) return;
  const item = touch(event); touches.delete(item.identifier);
  emit(cancelled ? 'TouchCancel' : 'TouchEnd', { changedTouches: [item], touches: Array.from(touches.values()) });
}
surface.addEventListener('pointerup', event => end(event, false));
surface.addEventListener('pointercancel', event => end(event, true));
window.addEventListener('resize', () => emit('WindowResize', wxMock.getWindowInfo()));
document.addEventListener('visibilitychange', () => emit(document.hidden ? 'Hide' : 'Show'));
function bindAdClose(id, ended) {
  const button = document.getElementById(id);
  // Opening the overlay during the canvas touch-end can otherwise receive the
  // same gesture's synthetic click. Require a fresh pointer-up on the button.
  button.onpointerup = event => { event.preventDefault(); if (currentAd) currentAd.close(ended); };
  button.onclick = event => { if (event.detail === 0 && currentAd) currentAd.close(ended); };
}
bindAdClose('ad-complete', true);
bindAdClose('ad-cancel', false);
start(wxMock, { rewardedAdUnitId: 'preview-only-not-for-publication', debug: true }).then(async app => {
  await Promise.allSettled(fontLoads);
  window.__wechatPreview = { app, emit, wx: wxMock };
  status.textContent = '模拟环境已就绪';
  document.getElementById('fail-run').onclick = () => app.game.debug.fail('测试偏航');
  document.getElementById('background').onclick = () => {
    background = !background; emit(background ? 'Hide' : 'Show');
    document.getElementById('background').textContent = background ? '返回前台' : '切后台';
  };
  window.addEventListener('pagehide', () => app.destroy(), { once: true });
}).catch(error => {
  status.textContent = '加载失败';
  document.getElementById('error').textContent = '本地验证启动失败：' + error.message;
  console.error(error);
});
