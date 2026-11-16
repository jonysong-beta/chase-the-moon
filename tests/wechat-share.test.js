'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSharing } = require('../minigame/src/share');

function fixture(options) {
  options = options || {};
  const calls = [], canvases = [];
  function canvas() {
    const operations = [];
    const ctx = new Proxy({ measureText: text => ({ width: String(text).length * 12 }) }, {
      get(target, key) { return key in target ? target[key] : (...args) => operations.push({ name: key, args }); },
      set(target, key, value) { target[key] = value; return true; }
    });
    const result = { width: 0, height: 0, operations, getContext: () => ctx,
      toTempFilePath(settings) {
        if (options.failExport) settings.fail(new Error('export'));
        else settings.success({ tempFilePath: 'wxfile://moon-poster.png' });
      } };
    canvases.push(result); return result;
  }
  const wx = { shareAppMessage(settings) { calls.push(settings); if (options.failShare) throw new Error('share'); } };
  if (options.unsupported) delete wx.shareAppMessage;
  const content = { mode: 'daily', title: '今日航线 · 来飞同一条 150 秒航道', query: 'route=daily&date=2026-11-17&pool=A&version=v2-a1', score: 700, subtitle: '2026-11-17 / A' };
  const game = { draws: 0, getShareContent: () => content,
    drawShareCard(ctx, width, height) { this.draws++; ctx.fillRect(0, 0, width, height); } };
  return { wx, calls, canvases, content, game, sharing: createSharing({ wx, createCanvas: canvas, fonts: { title: 'serif', mono: 'monospace' } }) };
}

test('a prepared native share contains the route query and a real 5:4 poster image', async () => {
  const env = fixture();
  assert.equal(await env.sharing.prepare(env.game), true);
  assert.deepEqual(env.canvases.map(canvas => [canvas.width, canvas.height]), [[540, 860], [500, 400]]);
  assert.equal(env.game.draws, 1);
  assert.equal(env.sharing.share(env.game).status, 'opened');
  assert.equal(env.calls[0].query, env.content.query);
  assert.equal(env.calls[0].imageUrl, 'wxfile://moon-poster.png');
  assert.equal(env.calls[0].title, env.content.title);
  assert.equal(env.canvases[1].operations.some(operation => operation.name === 'drawImage'), true);
  await env.sharing.prepare(env.game);
  assert.equal(env.game.draws, 1, 'unchanged results reuse the printed poster');
  env.content.score = 750;
  await env.sharing.prepare(env.game);
  assert.equal(env.game.draws, 2, 'a new result prints a new poster');
});

test('image export failure falls back to WeChat’s documented game screenshot', async () => {
  const env = fixture({ failExport: true });
  assert.equal(await env.sharing.prepare(env.game), false);
  assert.equal(env.sharing.share(env.game).status, 'opened');
  assert.equal(env.calls[0].query, env.content.query);
  assert.equal(Object.prototype.hasOwnProperty.call(env.calls[0], 'imageUrl'), false);
});

test('unsupported, empty or failed sharing is honest and never reports a completed share', async () => {
  const unsupported = fixture({ unsupported: true });
  assert.equal(unsupported.sharing.available, false);
  assert.equal(unsupported.sharing.share(unsupported.game).status, 'unavailable');
  const failure = fixture({ failShare: true });
  await failure.sharing.prepare(failure.game);
  assert.equal(failure.sharing.share(failure.game).status, 'unavailable');
  assert.match(failure.sharing.getState().message, /无法打开/);
  const empty = fixture(); empty.game.getShareContent = () => null;
  assert.equal(empty.sharing.share(empty.game).status, 'unavailable');
  assert.equal(empty.calls.length, 0);
});
