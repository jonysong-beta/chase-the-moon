'use strict';

const { createPlatform } = require('./platform');
const { createGame } = require('./core');
const createUI = require('./ui');
const { SHARE_CARD_RECT } = require('./ui');
const { createInput } = require('./input');
const createRewardedAd = require('./rewarded-ad');
const { createSharing } = require('./share');
const { createLeaderboard } = require('./leaderboard');

async function start(wx, config) {
  config = config || {};
  const platform = createPlatform(wx);
  try { await platform.loadAssets(); }
  catch (error) { platform.destroy(); throw error; }
  let destroyed = false;
  let frameHandle = null;
  let lastTime = null;
  let lastScreen = null;
  let lastGameScreen = null, leaderboardOpen = false;
  let adSequence = 0;
  let adBusy = false;
  let adMessage = '';
  const events = [];
  const bindings = [];
  let input;
  let ui;
  function record(name, payload) {
    const entry = { name: String(name) };
    if (payload) ['requestId', 'status', 'code'].forEach(key => {
      if (typeof payload[key] === 'string' || typeof payload[key] === 'number') entry[key] = payload[key];
    });
    events.push(entry);
    if (events.length > 100) events.shift();
  }
  function newAds() {
    return createRewardedAd({ wx, adUnitId: config.rewardedAdUnitId, onEvent: record, timeoutMs: config.adTimeoutMs });
  }
  let ads = newAds();
  const game = createGame({
    ctx: platform.ctx, assets: platform.assets, fonts: platform.fonts, storage: platform.storage,
    createCanvas: platform.createCanvas, createAudioContext: platform.createAudioContext,
    now: Date.now, reviveEnabled: ads.isConfigured(), debug: config.debug === true
  });
  const sharing = createSharing({ wx, createCanvas: platform.createCanvas, fonts: platform.fonts });
  const leaderboard = createLeaderboard({ wx, worldUrl: config.worldRankingUrl,
    friendEnabled: config.friendRankingEnabled === true, preview: config.debug === true && config.previewRanking === true });
  async function openLeaderboard() {
    if (destroyed || !leaderboard.available) return false;
    const context = game.getLeaderboardContext();
    if (!context) return false;
    leaderboardOpen = true; lastGameScreen = game.getView().screen; resetInput(); resetFrameTime();
    const state = await leaderboard.show(context);
    if (destroyed) return false;
    if (state.status === 'idle' && state.scope === 'friends') return leaderboard.selectScope('friends');
    return state;
  }
  function receiveLaunch(query) {
    if (destroyed || ['title', 'cover'].indexOf(game.getView().screen) < 0 || !query) return false;
    return game.action('receiveShare', query);
  }
  async function shareCurrent() {
    if (destroyed || !sharing.available || !game.getShareContent()) return { status: 'unavailable' };
    await sharing.prepare(game);
    return destroyed ? { status: 'unavailable' } : sharing.share(game);
  }
  function resetFrameTime() { lastTime = null; }
  function resetInput() { if (input) input.reset(); else game.resetInput(); }
  function statusMessage(result) {
    if (result.status === 'cancelled') return '视频未完整观看，尚未获得续玩';
    if (result.status === 'unavailable') return '暂无可用视频，可结束本局或重新开始';
    if (result.status === 'busy') return '视频正在准备，请稍候';
    if (result.code === 'load_timeout' || result.code === 'close_timeout') return '视频等待超时，可重试或结束本局';
    return '视频加载失败，可重试或结束本局';
  }
  async function watchAd(payload) {
    if (destroyed || adBusy) return false;
    const offer = game.getReviveOffer();
    const requestedId = payload && typeof payload === 'object' ? payload.offerId : payload;
    if (!offer.eligible || (requestedId && requestedId !== offer.offerId) || !ads.isConfigured()) return false;
    if (game.getView().paused) return false;
    const sequence = ++adSequence;
    const offerId = offer.offerId;
    adBusy = true; adMessage = '视频准备中…';
    game.pause('ad'); resetInput(); resetFrameTime();
    let result;
    try { result = await ads.show(); }
    catch (_) { result = { status: 'error', code: 'ad_error' }; }
    if (destroyed || sequence !== adSequence) return false;
    adBusy = false;
    if (result.status === 'completed') {
      const granted = game.completeRevive(offerId);
      adMessage = granted ? '' : '本次追逐已结束，未重复发放续玩';
    } else adMessage = statusMessage(result);
    game.resume('ad'); resetInput(); resetFrameTime();
    return result;
  }
  function cancelAd() {
    adSequence++;
    adBusy = false; adMessage = '';
    ads.destroy();
    ads = newAds();
    game.resume('ad'); resetInput(); resetFrameTime();
  }
  function handleAction(name, payload) {
    if (destroyed) return false;
    if (ui && ui.handleAction(name, payload)) return true;
    if (name === 'shareCurrent') return shareCurrent();
    if (name === 'openLeaderboard') return openLeaderboard();
    if (name === 'closeLeaderboard' && leaderboardOpen) { leaderboardOpen = false; resetInput(); resetFrameTime(); return true; }
    if (leaderboardOpen) {
      if (name === 'selectLeaderboardScope') return leaderboard.selectScope(payload);
      if (name === 'retryLeaderboard') return leaderboard.getState().scope === 'friends' ? leaderboard.selectScope('friends') : leaderboard.show(game.getLeaderboardContext());
      return false;
    }
    if (name === 'watchAd') return watchAd(payload);
    const offer = game.getReviveOffer();
    if (offer.eligible && (name === 'declineRevive' || name === 'retry' || name === 'home')) {
      const id = payload && typeof payload === 'object' ? payload.offerId : payload;
      if (name === 'declineRevive' && id && id !== offer.offerId) return false;
      cancelAd();
      if (!game.declineRevive(offer.offerId)) return false;
      if (name !== 'declineRevive') game.action(name, payload);
      resetInput(); resetFrameTime();
      return true;
    }
    const before = game.getView().screen;
    const changed = game.action(name, payload);
    if (game.getView().screen !== before) {
      resetInput(); resetFrameTime(); adMessage = '';
      if (name === 'openCard') sharing.prepare(game);
    }
    return changed;
  }
  ui = createUI({ ctx: platform.ctx, assets: platform.assets, fonts: platform.fonts, onAction: handleAction });
  input = createInput({ game, ui, onAction: handleAction, toLogical: platform.toLogical });
  function bind(onName, offName, handler) {
    if (typeof wx[onName] !== 'function') return;
    wx[onName](handler); bindings.push({ offName, handler });
  }
  bind('onTouchStart', 'offTouchStart', event => input.start(event));
  bind('onTouchMove', 'offTouchMove', event => input.move(event));
  bind('onTouchEnd', 'offTouchEnd', event => input.end(event));
  bind('onTouchCancel', 'offTouchCancel', event => input.cancel(event));
  bind('onHide', 'offHide', () => { game.pause('background'); resetInput(); resetFrameTime(); });
  bind('onShow', 'offShow', event => { game.resume('background'); receiveLaunch(event && event.query); resetInput(); resetFrameTime(); });
  if (typeof wx.getLaunchOptionsSync === 'function') {
    try { const launch = wx.getLaunchOptionsSync(); receiveLaunch(launch && launch.query); } catch (_) {}
  }
  const removeResize = platform.onResize(() => { resetInput(); resetFrameTime(); });
  function draw(dt) {
    let view = game.getView();
    if (view.screen !== lastGameScreen) {
      lastGameScreen = view.screen; leaderboardOpen = false;
      if (view.screen === 'result' && leaderboard.available) {
        const context = game.getLeaderboardContext();
        if (context && context.eligible) leaderboard.publish(context);
      }
    }
    const rankingContext = leaderboard.available ? game.getLeaderboardContext() : null;
    if (leaderboardOpen) view = Object.assign({}, view, { screen: 'leaderboard', leaderboard: leaderboard.getState() });
    if (view.screen !== lastScreen) { resetInput(); lastScreen = view.screen; }
    platform.beginFrame();
    try {
      if (ui.setViewport) ui.setViewport(platform.getViewport());
      ui.drawBackground(view);
      game.render(dt);
      if (view.screen === 'card') {
        const rect = SHARE_CARD_RECT;
        platform.ctx.save();
        platform.ctx.translate(rect.x, rect.y);
        game.drawShareCard(platform.ctx, rect.w, rect.h);
        platform.ctx.restore();
      }
      ui.drawOverlay(view, { stick: input.getStick(), adBusy, adMessage,
        shareAvailable: sharing.available, shareMessage: sharing.getState().message,
        rankingAvailable: !!rankingContext, rankingCanvas: leaderboard.getCanvas() });
    } finally { platform.endFrame(); }
  }
  function frame(timestamp) {
    if (destroyed) return;
    const time = Number.isFinite(timestamp) ? timestamp : Date.now();
    const dt = lastTime === null ? 0 : Math.max(0, Math.min(0.05, (time - lastTime) / 1000));
    lastTime = time;
    game.update(dt); draw(dt);
    frameHandle = platform.requestFrame(frame);
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true; adSequence++; leaderboardOpen = false;
    ads.destroy(); leaderboard.destroy(); adBusy = false; adMessage = '';
    resetInput(); game.pause('destroy');
    platform.cancelFrame(frameHandle); frameHandle = null;
    bindings.forEach(binding => {
      if (typeof wx[binding.offName] === 'function') wx[binding.offName](binding.handler);
    });
    bindings.length = 0;
    removeResize(); platform.destroy();
  }
  try { draw(0); frameHandle = platform.requestFrame(frame); }
  catch (error) { destroy(); throw error; }
  return {
    game, ui, input, platform, handleAction,
    getAdState() { return { busy: adBusy, message: adMessage, configured: ads.isConfigured(), events: events.map(entry => Object.assign({}, entry)) }; },
    getSocialState() { return { share: sharing.getState(), available: sharing.available, ranking: leaderboard.getState() }; },
    destroy
  };
}
module.exports = { start };
