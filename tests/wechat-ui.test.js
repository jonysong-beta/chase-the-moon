'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createUI, SHARE_CARD_RECT } = require('../minigame/src/ui');
const { createGame } = require('../minigame/src/core');

function setup() {
  const drawn = [];
  const images = [];
  const ctx = new Proxy({
    fillText: value => drawn.push(String(value)),
    measureText: value => ({ width: Array.from(value).length * 5 }),
    drawImage: (...args) => images.push(args)
  }, { get: (object, key) => key in object ? object[key] : () => {} });
  const assets = { cover: { width: 1038, height: 1878 }, coverMoon: { width: 552, height: 552 }, menu: { width: 1044, height: 1884 } };
  return { ui: createUI({ ctx, assets, onAction() {} }), drawn, images, assets };
}

test('cover uses one full-resolution poster and orbital moon; hits reject screen exterior', () => {
  const { ui, assets, images } = setup();
  const view = { screen: 'cover', titleOrbit: 0 };
  ui.drawBackground(view);
  ui.drawOverlay(view);
  assert.equal(images[0][0], assets.cover);
  assert.equal(images[1][0], assets.coverMoon);
  assert.equal(ui.hitTest(135, 422).action, 'openMenu');
  assert.equal(ui.hitTest(-1, 422), null);
  assert.equal(ui.hitTest(135, 481), null);
  assert.equal(ui.hitTest(NaN, 422), null);
});

test('menu difficulty selection carries keys and sound/race/back targets stay separate', () => {
  const { ui } = setup();
  ui.drawOverlay({ screen: 'title', sound: true, menu: {
    difficultyLabel: '追寻之旅', daily: false, wellMultiplier: '1.0',
    difficulties: ['easy', 'normal', 'hard', 'blood'].map((key, index) => ({ key, label: '档位' + index, unlocked: !index, selected: !index }))
  } });
  assert.deepEqual(ui.hitTest(49, 358), { action: 'setDifficulty', payload: 'easy' });
  assert.deepEqual(ui.hitTest(220, 358), { action: 'setDifficulty', payload: 'blood' });
  assert.equal(ui.hitTest(135, 396).action, 'start');
  assert.equal(ui.hitTest(50, 435).action, 'toggleSound');
  assert.equal(ui.hitTest(130, 435).action, 'toggleRace');
  assert.equal(ui.hitTest(210, 435).action, 'openCover');
});

test('all board entries remain accessible via pure hit tests and local pagination', () => {
  const { ui, drawn } = setup();
  const view = { screen: 'board', board: { dailyText: '', entries: Array.from({ length: 19 }, (_, index) => ({
    rank: index + 1, title: 'ENTRY-' + index, label: '普通', score: index, timeText: '1:20.0', assisted: false
  })) } };
  const seen = [];
  for (let page = 0; page < 4; page++) {
    drawn.length = 0;
    ui.drawOverlay(view);
    seen.push(...drawn.filter(value => value.indexOf('ENTRY-') === 0));
    if (page < 3) {
      const hit = ui.hitTest(210, 354);
      assert.equal(hit.action, 'uiBoardPage');
      assert.equal(ui.hitTest(210, 354).payload, page + 1);
      assert.equal(ui.handleAction(hit.action, hit.payload), true);
    }
  }
  assert.equal(new Set(seen).size, 19);
  assert.equal(ui.hitTest(210, 354), null);
  assert.equal(ui.hitTest(135, 451).action, 'backFromBoard');
});

test('long result lists paginate and all four final actions remain available', () => {
  const { ui, drawn } = setup();
  const view = { screen: 'result', result: { title: '险胜偏轨', description: '月亮回来了', rankText: '本机第1名', nextLabel: '宇宙冒险已解锁',
    rows: Array.from({ length: 13 }, (_, index) => ({ label: 'ROW-' + index, value: index, tone: 'gold' })) } };
  ui.drawOverlay(view);
  assert.equal(drawn.filter(value => value.indexOf('ROW-') === 0).length, 8);
  const page = ui.hitTest(210, 284);
  ui.handleAction(page.action, page.payload);
  drawn.length = 0;
  ui.drawOverlay(view);
  assert.equal(drawn.filter(value => value.indexOf('ROW-') === 0).length, 5);
  assert.equal(ui.hitTest(135, 370).action, 'retry');
  assert.equal(ui.hitTest(135, 408).action, 'openCard');
  assert.equal(ui.hitTest(70, 446).action, 'openBoard');
  assert.equal(ui.hitTest(190, 446).action, 'home');
});

test('advertising busy state keeps decline/retry/home routes usable', () => {
  const { ui } = setup();
  const view = { screen: 'revive', revive: { eligible: true, offerId: 'offer-1' } };
  ui.drawOverlay(view, { adBusy: true, adMessage: '暂无广告' });
  assert.equal(ui.hitTest(135, 306), null);
  assert.deepEqual(ui.hitTest(70, 413), { action: 'declineRevive', payload: 'offer-1' });
  assert.equal(ui.hitTest(190, 413).action, 'retry');
  assert.equal(ui.hitTest(135, 454).action, 'home');
  ui.drawOverlay(view, { adBusy: false });
  assert.deepEqual(ui.hitTest(135, 306), { action: 'watchAd', payload: 'offer-1' });
});

test('card viewport is clear, share prose toggles locally, new screens reset local state', () => {
  const { ui, drawn } = setup();
  assert.ok(SHARE_CARD_RECT.w >= 200);
  assert.ok(SHARE_CARD_RECT.y + SHARE_CARD_RECT.h < 360);
  const view = { screen: 'card', share: { text: '重聚，开始下一次追逐。' } };
  ui.drawOverlay(view);
  assert.equal(drawn.includes(view.share.text), false);
  const hit = ui.hitTest(80, 443);
  ui.handleAction(hit.action, hit.payload);
  ui.drawOverlay(view);
  assert.equal(drawn.includes(view.share.text), true);
  ui.drawOverlay({ screen: 'cover' });
  drawn.length = 0;
  ui.drawOverlay(view);
  assert.equal(drawn.includes(view.share.text), false);
  assert.equal(ui.handleAction('home'), false);
});

test('malformed required screen data fails explicitly', () => {
  const { ui } = setup();
  assert.throws(() => ui.drawOverlay({}), /view.screen/);
  assert.throws(() => ui.drawOverlay({ screen: 'title', menu: {} }), /menu.difficulties/);
  assert.throws(() => ui.drawOverlay({ screen: 'result', result: {} }), /result.rows/);
  assert.throws(() => ui.drawOverlay({ screen: 'board', board: {} }), /board.entries/);
});

test('real core view data draws across the state flow without duplicate QTE instructions', () => {
  const { ui, drawn } = setup();
  const game = createGame({ debug: true, reviveEnabled: true, storage: { getItem() { return null; }, setItem() {} } });
  const draw = () => { ui.drawBackground(game.getView()); ui.drawOverlay(game.getView()); };
  draw();
  game.action('openMenu'); draw();
  game.action('start'); draw();
  game.action('skipIntro'); draw();
  game.debug.enterCapture();
  drawn.length = 0;
  draw();
  assert.equal(ui.hitTest(230, 431).action, 'capture');
  assert.equal(drawn.includes('捕获月亮'), false);
  assert.equal(drawn.some(value => value.indexOf('环变绿按') !== -1), false);
  game.debug.finishCapture(true); game.update(.91); draw();
  assert.equal(ui.hitTest(135, 370).action, 'retry');
  game.action('openCard'); draw();
  game.action('backFromCard'); game.action('openBoard'); draw();
  game.action('backFromBoard'); game.action('home'); game.action('start'); game.action('skipIntro');
  game.debug.fail(); game.update(.76); draw();
  assert.equal(game.getView().screen, 'revive');
  assert.equal(ui.hitTest(135, 306).action, 'watchAd');
  game.declineRevive(game.getReviveOffer().offerId); draw();
  assert.doesNotThrow(() => ui.drawOverlay(Object.assign({}, game.getView(), { revive: null })));
});
