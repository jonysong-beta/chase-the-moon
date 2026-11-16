'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLeaderboard, leaderboardKey, normalizeEntries } = require('../minigame/src/leaderboard');

function context(extra) {
  return Object.assign({ mode: 'daily', date: '2026-11-17', pool: 'A', version: 'v2-a1', score: 700, bestScore: 750,
    time: 150, runId: 'run-1', abilities: { jet: 1, pulse: 0, sail: 0 }, eligible: true, bestEligible: true }, extra);
}
function fixture(options) {
  options = options || {};
  const calls = [], storage = [], messages = [];
  const wx = {
    request(settings) {
      calls.push(settings);
      if (options.networkError) { settings.fail({ errMsg: 'offline' }); return; }
      if (settings.method === 'POST') settings.success({ statusCode: 200, data: { accepted: true } });
      else settings.success({ statusCode: options.statusCode || 200, data: options.response || { entries: [
        { rank: 1, name: '远航者', value: 850 }, { rank: 2, name: '地面站', value: 700 }
      ], selfRank: 12 } });
    },
    getSetting(settings) { settings.success({ authSetting: { 'scope.WxFriendInteraction': options.authorized === true } }); },
    authorize(settings) { if (options.authorize === false) settings.fail({}); else settings.success({}); },
    setUserCloudStorage(settings) { storage.push(settings); if (settings.success) settings.success({}); },
    getOpenDataContext() { return { canvas: { width: 0, height: 0 }, postMessage(message) { messages.push(message); } }; }
  };
  return { wx, calls, storage, messages, board: createLeaderboard({ wx, worldUrl: options.worldUrl,
    friendEnabled: options.friendEnabled, preview: options.preview }) };
}

test('no service configuration is unavailable and cannot fabricate a local world rank', async () => {
  const env = fixture();
  assert.equal(env.board.available, false);
  const state = await env.board.show(context());
  assert.equal(state.status, 'unavailable');
  assert.deepEqual(state.rows, []);
  assert.equal(state.selfRank, null);
  assert.equal(env.calls.length, 0);
  assert.equal(env.storage.length, 0);
});

test('world results use a separate versioned route and validate the external response', async () => {
  const env = fixture({ worldUrl: 'https://rank.example.test/v1/leaderboard' });
  assert.equal(env.board.available, true);
  assert.equal(leaderboardKey(context()), 'moon.daily.2026-11-17.A.v2-a1');
  assert.equal(leaderboardKey(context({ mode: 'endless', version: 'endless-v1' })), 'moon.endless.endless-v1');
  const state = await env.board.show(context());
  assert.equal(state.status, 'ready');
  assert.deepEqual(state.rows, [{ rank: 1, name: '远航者', value: 850 }, { rank: 2, name: '地面站', value: 700 }]);
  assert.equal(state.selfRank, 12);
  assert.equal(env.calls[0].method, 'POST');
  assert.equal(env.calls[0].data.score, 700);
  assert.equal(env.calls[0].data.version, 'v2-a1');
  assert.equal(env.calls[1].method, 'GET');
  assert.equal(env.calls[1].data.date, '2026-11-17');
  assert.equal(env.calls[1].url, 'https://rank.example.test/v1/leaderboard');
  assert.equal(normalizeEntries({ entries: [{ rank: 0, name: 'bad', value: 10 }] }, context()), null);
  assert.equal(normalizeEntries({ entries: [{ rank: 1, name: 'bad', value: '900' }] }, context()), null);
  assert.equal(normalizeEntries({ entries: [{ rank: 1, name: 'bad', value: 99999 }] }, context()), null);
});

test('partial, assisted or unsaved scores never publish, and stale responses cannot replace a new route', async () => {
  const env = fixture({ worldUrl: 'https://rank.example.test/v1/leaderboard' });
  assert.equal((await env.board.publish(context({ eligible: false }))).status, 'skipped');
  assert.equal((await env.board.publish(context({ score: 700.5 }))).status, 'invalid');
  assert.equal(env.calls.length, 0);
  const pending = [];
  env.wx.request = settings => pending.push(settings);
  const first = env.board.show(context());
  const second = env.board.show(context({ date: '2026-11-18', runId: 'run-2' }));
  pending.filter(call => call.method === 'POST').forEach(call => call.success({ statusCode: 200, data: { accepted: true } }));
  await new Promise(resolve => setImmediate(resolve));
  const gets = pending.filter(call => call.method === 'GET');
  assert.equal(gets.length, 2);
  gets[1].success({ statusCode: 200, data: { entries: [{ rank: 1, name: '新航线', value: 800 }] } });
  await second;
  gets[0].success({ statusCode: 200, data: { entries: [{ rank: 1, name: '旧航线', value: 900 }] } });
  await first;
  assert.equal(env.board.getState().context.date, '2026-11-18');
  assert.equal(env.board.getState().rows[0].name, '新航线');
});

test('network failure and malformed data show an honest retry state without changing local records', async () => {
  const offline = fixture({ worldUrl: 'https://rank.example.test/v1/leaderboard', networkError: true });
  const state = await offline.board.show(context());
  assert.equal(state.status, 'error');
  assert.match(state.message, /暂时无法读取/);
  assert.deepEqual(state.rows, []);
  const invalid = fixture({ worldUrl: 'https://rank.example.test/v1/leaderboard', response: { entries: [{ rank: 1, name: '伪造', value: -3 }] } });
  assert.equal((await invalid.board.show(context())).status, 'error');
});

test('preview rankings are explicit demonstrations and never call native data APIs', async () => {
  const env = fixture({ preview: true });
  const state = await env.board.show(context());
  assert.equal(state.preview, true);
  assert.match(state.message, /非真实排名/);
  assert.equal(state.rows.length > 0, true);
  await env.board.selectScope('friends');
  assert.equal(env.board.getState().preview, true);
  assert.match(env.board.getState().message, /非真实排名/);
  assert.equal(env.calls.length, 0);
  assert.equal(env.messages.length, 0);
  assert.equal(env.storage.length, 0);
});

test('friend scope requests permission on entry and sends only a bounded key to the open data context', async () => {
  const env = fixture({ friendEnabled: true });
  assert.equal(env.board.available, true);
  await env.board.show(context({ eligible: false }));
  assert.equal(env.messages.length, 0);
  const state = await env.board.selectScope('friends');
  assert.equal(state.scope, 'friends');
  assert.equal(state.status, 'ready');
  assert.equal(env.messages[0].key, 'moon.daily.2026-11-17.A.v2-a1');
  assert.equal(env.messages[0].type, 'moon-rank');
  assert.equal(JSON.stringify(env.messages[0]).includes('远航者'), false);
  assert.equal(env.storage[0].KVDataList[0].value, JSON.stringify({ v: 1, value: 750 }));
  const denied = fixture({ friendEnabled: true, authorize: false });
  await denied.board.show(context());
  assert.equal((await denied.board.selectScope('friends')).status, 'unavailable');
  assert.equal(denied.messages.length, 0);
});

test('friend writes use milliseconds for endless and remain unavailable without native support', async () => {
  const env = fixture({ friendEnabled: true, authorized: true });
  const endless = context({ mode: 'endless', version: 'endless-v1', score: 12.345, bestScore: 20.5, time: 12.345 });
  await env.board.publish(endless);
  assert.equal(env.storage[0].KVDataList[0].key, 'moon.endless.endless-v1');
  assert.equal(env.storage[0].KVDataList[0].value, JSON.stringify({ v: 1, value: 20500 }));
  const unsupported = fixture({ friendEnabled: true });
  delete unsupported.wx.getOpenDataContext;
  unsupported.board = createLeaderboard({ wx: unsupported.wx, friendEnabled: true });
  assert.equal(unsupported.board.available, false);
});


const { createGame } = require('../minigame/src/core');
function gameFixture(failWrite) {
  const now = Date.parse('2026-11-17T04:00:00.000Z');
  const storage = { getItem() { return JSON.stringify({ campaignV2: { completed: ['L01', 'L02', 'L03', 'L04'] },
    growthV2: { points: 0, abilities: { jet: 1 }, grants: { 'L04:jet': true } } }); },
    setItem() { if (failWrite) throw new Error('write'); } };
  const game = createGame({ storage, now: () => now, debug: true });
  game.action('openMenu'); return game;
}

test('core exposes only current version daily or saved endless records to the ranking adapter', () => {
  const game = gameFixture();
  game.action('openDaily');
  const invitation = game.getLeaderboardContext();
  assert.equal(invitation.mode, 'daily');
  assert.equal(invitation.eligible, false);
  assert.equal(invitation.version, 'v2-a1');
  assert.equal(invitation.bestScore, null);
  game.action('startDaily'); game.debug.patch({ runT: 150 }); game.update(0.01);
  const daily = game.getLeaderboardContext();
  assert.equal(daily.eligible, true);
  assert.equal(daily.score, 300);
  assert.equal(daily.bestScore, 300);
  assert.match(daily.runId, /^.+/);
  game.action('home'); game.action('startEndless');
  game.debug.patch({ runT: 12.345, bodies: [] }); game.debug.fail(); game.update(0.8);
  const endless = game.getLeaderboardContext();
  assert.equal(endless.mode, 'endless');
  assert.equal(endless.score, 12.345);
  assert.equal(endless.version, game.debug.state().v2.endless.version);
  game.action('home'); game.action('startCampaign', 'L05'); game.debug.fail(); game.update(0.8);
  assert.equal(game.getLeaderboardContext(), null);
});

test('unsaved daily results cannot be uploaded as world or friend records', () => {
  const game = gameFixture(true);
  game.action('openDaily'); game.action('startDaily'); game.debug.patch({ runT: 150 }); game.update(0.01);
  assert.equal(game.getView().v2.result.savePending, true);
  assert.equal(game.getLeaderboardContext(), null);
});


test('partial daily records cannot use the friend channel to bypass the completed-route threshold', async () => {
  const env = fixture({ friendEnabled: true, authorized: true });
  await env.board.publish(context({ eligible: false, bestEligible: false }));
  assert.equal(env.storage.length, 0);
  assert.equal((await env.board.publish(context({ time: 20 }))).status, 'invalid');
});

test('destroy prevents a late world response from starting a friend storage write', async () => {
  const env = fixture({ worldUrl: 'https://rank.example.test/v1/leaderboard', friendEnabled: true, authorized: true });
  let respond;
  env.wx.request = settings => { respond = settings.success; };
  const publishing = env.board.publish(context());
  env.board.destroy();
  respond({ statusCode: 200, data: { accepted: true } });
  await publishing;
  assert.equal(env.storage.length, 0);
  assert.equal(env.messages.length, 0);
});
