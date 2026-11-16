'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeShareQuery, resolveShareQuery } = require('../minigame/src/challenge');
const { createGame } = require('../minigame/src/core');

const NOW = Date.parse('2026-11-17T04:00:00.000Z');
const READY = {
  campaignV2: { completed: ['L01', 'L02', 'L03', 'L04'] },
  growthV2: { points: 0, abilities: { jet: 1 }, grants: { 'L04:jet': true } }
};
function fixture(initial) {
  const storage = { saved: initial ? JSON.stringify(initial) : null,
    getItem() { return this.saved; }, setItem(key, value) { this.saved = value; } };
  return createGame({ storage, now: () => NOW, debug: true });
}

test('daily shares contain only a validated date, pool and current rule version', () => {
  const query = encodeShareQuery({ mode: 'daily', date: '2026-11-17', pool: 'A', version: 'v2-a1' });
  assert.equal(query, 'route=daily&date=2026-11-17&pool=A&version=v2-a1');
  assert.deepEqual(resolveShareQuery({ route: 'daily', date: '2026-11-17', pool: 'A', version: 'v2-a1' }, NOW),
    { status: 'daily', date: '2026-11-17', pool: 'A', version: 'v2-a1' });
  assert.equal(resolveShareQuery({ route: 'daily', date: '2026-11-16', pool: 'A', version: 'v2-a1' }, NOW).status, 'expired');
  assert.equal(resolveShareQuery({ route: 'daily', date: '2026-11-17', pool: 'A', version: 'outdated' }, NOW).status, 'expired');
  assert.equal(resolveShareQuery({ route: 'daily', date: '2026-02-31', pool: 'A', version: 'v2-a1' }, NOW).status, 'invalid');
  assert.equal(resolveShareQuery({ route: 'daily', date: '2026-11-17', pool: 'Z', version: 'v2-a1' }, NOW).status, 'invalid');
  assert.equal(resolveShareQuery({ route: 'daily', date: '2026-11-17', pool: 'A', version: 'bad%value' }, NOW).status, 'invalid');
  assert.equal(encodeShareQuery({ mode: 'daily', date: 'bad', pool: 'A', version: 'v2-a1' }), '');
});

test('noncompetitive and endless shares are explicit, bounded destinations', () => {
  assert.equal(encodeShareQuery({ mode: 'endless' }), 'view=endless');
  assert.equal(encodeShareQuery({ mode: 'meditation' }), 'view=meditation');
  assert.deepEqual(resolveShareQuery({ view: 'endless' }, NOW), { status: 'endless' });
  assert.deepEqual(resolveShareQuery({ view: 'meditation' }, NOW), { status: 'meditation' });
  assert.equal(resolveShareQuery({ view: 'unknown' }, NOW).status, 'invalid');
  assert.equal(resolveShareQuery(null, NOW).status, 'none');
  assert.equal(resolveShareQuery({ view: 'endless', extra: 'not-copied' }, NOW).extra, undefined);
});

test('a current daily invitation opens that exact pool without granting access or changing rules', () => {
  const game = fixture(READY);
  game.action('openMenu');
  assert.equal(game.action('receiveShare', { route: 'daily', date: '2026-11-17', pool: 'A', version: 'v2-a1' }), true);
  assert.equal(game.getView().screen, 'dailyBrief');
  assert.equal(game.getView().v2.daily.date, '2026-11-17');
  assert.equal(game.getView().v2.daily.pool, 'A');
  const locked = fixture();
  locked.action('openMenu');
  assert.equal(locked.action('receiveShare', { route: 'daily', date: '2026-11-17', pool: 'C', version: 'v2-c1' }), true);
  assert.equal(locked.getView().screen, 'title');
  assert.match(locked.getView().toast, /完成 L04/);
  assert.equal(locked.action('startDaily'), false);
});

test('expired invitations never enter a run, while endless and meditation land in their actual modes', () => {
  const game = fixture(READY);
  game.action('openMenu');
  game.action('receiveShare', { route: 'daily', date: '2026-11-16', pool: 'A', version: 'v2-a1' });
  assert.equal(game.getView().screen, 'title');
  assert.match(game.getView().toast, /已更新/);
  game.action('receiveShare', { view: 'meditation' });
  assert.equal(game.getView().screen, 'meditation');
  assert.equal(game.getShareContent().mode, 'meditation');
  assert.equal(game.getShareContent().query, 'view=meditation');
  game.action('backToHub');
  game.action('receiveShare', { view: 'endless' });
  assert.equal(game.getView().v2.mode, 'endless');
  assert.equal(game.getView().screen, 'play');
});

test('share content distinguishes a route invitation, score and endless survival', () => {
  const game = fixture(READY);
  game.action('openMenu'); game.action('openDaily');
  const invitation = game.getShareContent();
  assert.equal(invitation.mode, 'daily');
  assert.equal(invitation.query, 'route=daily&date=2026-11-17&pool=A&version=v2-a1');
  assert.match(invitation.title, /同一/);
  assert.equal(game.getShareContent().score, null);
  game.action('startDaily'); game.debug.patch({ runT: 150 }); game.update(0.01);
  assert.equal(game.getShareContent().score, 300);
  assert.equal(game.getShareContent().query, invitation.query);
  game.action('home'); game.action('startEndless');
  game.debug.patch({ runT: 12.34, bodies: [] }); game.debug.fail(); game.update(0.8);
  assert.equal(game.getShareContent().mode, 'endless');
  assert.equal(game.getShareContent().score, 12.34);
  assert.equal(game.getShareContent().query, 'view=endless');
});


test('campaign results expose a real share descriptor before poster preparation', () => {
  const game = fixture(READY);
  game.action('openMenu'); game.action('startCampaign', 'L05');
  game.debug.fail('分享测试偏航'); game.update(0.8);
  const content = game.getShareContent();
  assert.equal(content.mode, 'campaign');
  assert.equal(content.query, '');
  assert.equal(content.title, '逐月计划 · 继续追回月亮');
  assert.equal(content.subtitle, 'L05 / 引力边界');
});
