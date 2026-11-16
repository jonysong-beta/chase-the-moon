'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFriendRanking } = require('../minigame/open-data/ranking');

function fixture(rows, fail) {
  const texts = [], requests = [];
  const ctx = new Proxy({}, {
    get(target, key) { return key in target ? target[key] : (...args) => { if (key === 'fillText') texts.push(String(args[0])); }; },
    set(target, key, value) { target[key] = value; return true; }
  });
  const canvas = { width: 714, height: 700, getContext: () => ctx };
  let listener;
  const wx = { getSharedCanvas: () => canvas, onMessage(callback) { listener = callback; },
    getFriendCloudStorage(settings) { requests.push(settings); if (fail) settings.fail({}); else settings.success({ data: rows }); } };
  const renderer = createFriendRanking(wx);
  return { wx, canvas, texts, requests, listener, renderer };
}
function row(name, value, key) {
  return { nickname: name, KVDataList: [{ key: key || 'moon.daily.2026-11-17.A.v2-a1', value: JSON.stringify({ v: 1, value }) }] };
}

test('friend data is requested only for the selected key, validated, sorted and drawn on shared canvas', () => {
  const env = fixture([row('较慢', 650), row('远航者', 900), row('无效', -2), row('旧版本', 1000, 'moon.daily.2026-11-16.A.v2-a1')]);
  env.listener({ type: 'moon-rank', key: 'moon.daily.2026-11-17.A.v2-a1', mode: 'daily', width: 714, height: 700, limit: 7 });
  assert.deepEqual(env.requests[0].keyList, ['moon.daily.2026-11-17.A.v2-a1']);
  assert.equal(env.texts.includes('远航者'), true);
  assert.equal(env.texts.includes('较慢'), true);
  assert.equal(env.texts.includes('无效'), false);
  assert.equal(env.texts.includes('旧版本'), false);
  assert.ok(env.texts.indexOf('远航者') < env.texts.indexOf('较慢'));
  assert.ok(env.texts.includes('900 分'));
  assert.equal(env.canvas.width, 714);
  assert.equal(env.canvas.height, 700);
});

test('endless friends display real milliseconds as survival time, with explicit empty and error states', () => {
  const key = 'moon.endless.endless-v1';
  const env = fixture([row('远航者', 90500, key)]);
  env.listener({ type: 'moon-rank', key, mode: 'endless', limit: 7 });
  assert.ok(env.texts.includes('1:30'));
  const empty = fixture([]);
  empty.listener({ type: 'moon-rank', key, mode: 'endless', limit: 7 });
  assert.ok(empty.texts.some(text => /还没有同玩好友/.test(text)));
  const failed = fixture([], true);
  failed.listener({ type: 'moon-rank', key, mode: 'endless', limit: 7 });
  assert.ok(failed.texts.some(text => /暂时无法读取/.test(text)));
});

test('malformed commands, JSON and oversized lists cannot inject arbitrary keys or rows', () => {
  const env = fixture([]);
  env.listener(null); env.listener({ type: 'other', key: 'anything' });
  env.listener({ type: 'moon-rank', key: 'not-a-moon-key', mode: 'daily' });
  assert.equal(env.requests.length, 0);
  const rows = [row('损坏', 100)]; rows[0].KVDataList[0].value = '{broken';
  for (let i = 0; i < 20; i++) rows.push(row('好友' + i, 100 + i));
  const bounded = fixture(rows);
  bounded.listener({ type: 'moon-rank', key: 'moon.daily.2026-11-17.A.v2-a1', mode: 'daily', limit: 999 });
  assert.equal(bounded.texts.includes('损坏'), false);
  assert.equal(bounded.texts.filter(text => /^好友\d+$/.test(text)).length, 7);
});
