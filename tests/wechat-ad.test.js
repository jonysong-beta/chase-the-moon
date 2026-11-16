'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createRewardedAd = require('../minigame/src/rewarded-ad');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fakeAd(options) {
  options = options || {};
  const listeners = { close: [], error: [], load: [] };
  const calls = { show: 0, load: 0, destroy: 0 };
  const ad = {
    calls,
    listeners,
    show() { calls.show++; return options.show ? options.show(calls.show) : Promise.resolve(); },
    load() { calls.load++; return options.load ? options.load() : Promise.resolve(); },
    destroy() { calls.destroy++; },
    emit(name, value) { listeners[name].slice().forEach(fn => fn(value)); }
  };
  ['close', 'error', 'load'].forEach(name => {
    const title = name[0].toUpperCase() + name.slice(1);
    ad['on' + title] = fn => listeners[name].push(fn);
    ad['off' + title] = fn => {
      const index = listeners[name].indexOf(fn);
      if (index >= 0) listeners[name].splice(index, 1);
    };
  });
  return ad;
}

function setup(options) {
  options = options || {};
  const instances = [];
  const events = [];
  const configs = [];
  const wx = { createRewardedVideoAd(config) {
    configs.push(config);
    const ad = options.instance || fakeAd(options);
    instances.push(ad);
    return ad;
  } };
  const controller = createRewardedAd({ wx, adUnitId: 'adunit-test', timeoutMs: options.timeoutMs,
    onEvent: (name, payload) => events.push({ name, payload }) });
  return { controller, instances, events, configs };
}

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

test('only explicit complete video close grants one completion and no eager display occurs', async () => {
  const s = setup();
  assert.equal(s.controller.isConfigured(), true);
  assert.equal(s.instances.length, 0);
  const pending = s.controller.show();
  await flush();
  assert.deepEqual(s.configs[0], { adUnitId: 'adunit-test', disableFallbackSharePage: true, multiton: true });
  s.instances[0].emit('close', { isEnded: true });
  assert.deepEqual(await pending, { status: 'completed' });
  assert.equal(s.events.filter(item => item.name === 'ad_result').length, 1);
  assert.equal(s.instances[0].calls.destroy, 1);
});

test('early close, missing close result, and nonboolean completion never grant rewards', async () => {
  for (const close of [{ isEnded: false }, undefined, {}, { isEnded: 1 }]) {
    const s = setup();
    const pending = s.controller.show();
    await flush();
    s.instances[0].emit('close', close);
    assert.equal((await pending).status, 'cancelled');
  }
});

test('unconfigured IDs and unsupported hosts return unavailable without touching the API', async () => {
  const availableWx = { createRewardedVideoAd: () => { throw new Error('must not create without ID'); } };
  for (const options of [{}, { wx: {} }, { wx: {}, adUnitId: 'x' },
    { wx: availableWx }, { wx: availableWx, adUnitId: '   ' }]) {
    const controller = createRewardedAd(options);
    assert.equal(controller.isConfigured(), false);
    assert.equal((await controller.show()).status, 'unavailable');
    controller.destroy();
  }
});

test('creation exceptions and incomplete API objects fail safely', async () => {
  for (const create of [() => { throw new Error('create'); }, () => ({}), () => null]) {
    const controller = createRewardedAd({ wx: { createRewardedVideoAd: create }, adUnitId: 'x' });
    assert.equal((await controller.show()).status, 'error');
    controller.destroy();
  }
});

test('a failed first show explicitly loads and retries only once', async () => {
  const s = setup({ show: count => count === 1 ? Promise.reject({ errCode: 1002 }) : Promise.resolve() });
  const pending = s.controller.show();
  await flush();
  assert.equal(s.instances[0].calls.load, 1);
  assert.equal(s.instances[0].calls.show, 2);
  s.instances[0].emit('close', { isEnded: true });
  assert.equal((await pending).status, 'completed');
});

test('load failure and the second show failure are finite errors', async () => {
  for (const options of [
    { show: () => Promise.reject({ errCode: 1002 }), load: () => Promise.reject({ errCode: 1003 }) },
    { show: () => Promise.reject({ errCode: 1002 }) }
  ]) {
    const s = setup(options);
    assert.equal((await s.controller.show()).status, 'error');
    assert.equal(s.instances[0].calls.load, 1);
    assert.ok(s.instances[0].calls.show <= 2);
  }
});

test('synchronous show/load throws follow the same finite error path', async () => {
  const s = setup({ show: () => { throw new Error('show'); }, load: () => { throw new Error('load'); } });
  assert.equal((await s.controller.show()).status, 'error');
  assert.equal(s.instances[0].calls.load, 1);
});

test('1004 no-fill from promise or event reports unavailable and never retries', async () => {
  const rejected = setup({ show: () => Promise.reject({ errCode: 1004, errMsg: 'sensitive details' }) });
  assert.deepEqual(await rejected.controller.show(), { status: 'unavailable', code: '1004' });
  assert.equal(rejected.instances[0].calls.load, 0);
  const emitted = setup();
  const pending = emitted.controller.show();
  emitted.instances[0].emit('error', { errCode: 1004 });
  assert.deepEqual(await pending, { status: 'unavailable', code: '1004' });
  assert.equal(JSON.stringify(rejected.events).includes('sensitive details'), false);
});

test('parallel shows return busy while the first request remains in control', async () => {
  const s = setup();
  const pending = s.controller.show();
  assert.deepEqual(await s.controller.show(), { status: 'busy' });
  await flush();
  s.instances[0].emit('close', { isEnded: true });
  assert.equal((await pending).status, 'completed');
  assert.equal(s.instances.length, 1);
});

test('duplicate and saved callbacks from a settled request cannot settle the next request', async () => {
  const s = setup();
  const first = s.controller.show();
  const staleClose = s.instances[0].listeners.close[0];
  await flush();
  staleClose({ isEnded: false });
  assert.equal((await first).status, 'cancelled');
  const second = s.controller.show();
  await flush();
  staleClose({ isEnded: true });
  s.instances[1].emit('close', { isEnded: false });
  assert.equal((await second).status, 'cancelled');
  assert.equal(s.events.filter(item => item.name === 'ad_result').length, 2);
});

test('destroy unbinds listeners, settles pending once, and forbids subsequent display', async () => {
  const s = setup();
  const pending = s.controller.show();
  const oldClose = s.instances[0].listeners.close[0];
  s.controller.destroy();
  s.controller.destroy();
  assert.deepEqual(await pending, { status: 'unavailable', code: 'destroyed' });
  oldClose({ isEnded: true });
  assert.equal(s.controller.isConfigured(), false);
  assert.equal((await s.controller.show()).status, 'unavailable');
  ['close', 'error', 'load'].forEach(name => assert.equal(s.instances[0].listeners[name].length, 0));
  assert.equal(s.instances[0].calls.destroy, 1);
});

test('loading timeout ignores late promises and late close, then permits a fresh instance', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const wait = deferred();
  const s = setup({ show: () => wait.promise, timeoutMs: 20 });
  const pending = s.controller.show();
  const oldClose = s.instances[0].listeners.close[0];
  t.mock.timers.tick(21);
  assert.deepEqual(await pending, { status: 'error', code: 'load_timeout' });
  wait.resolve();
  await flush();
  const next = s.controller.show();
  await flush();
  oldClose({ isEnded: true });
  s.instances[1].emit('close', { isEnded: false });
  assert.equal((await next).status, 'cancelled');
});

test('loading timeout does not expire an acknowledged playing video; close watchdog never rewards', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = setup({ timeoutMs: 20 });
  const pending = s.controller.show();
  await flush();
  t.mock.timers.tick(21);
  assert.equal(s.events.filter(item => item.name === 'ad_result').length, 0);
  const oldClose = s.instances[0].listeners.close[0];
  t.mock.timers.tick(180000);
  assert.deepEqual(await pending, { status: 'error', code: 'close_timeout' });
  oldClose({ isEnded: true });
  assert.equal(s.events.filter(item => item.name === 'ad_result').length, 1);
});

test('a recycled SDK instance is refused rather than accepting an old display close', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const instance = fakeAd();
  const s = setup({ instance });
  const first = s.controller.show();
  await flush();
  t.mock.timers.tick(180001);
  assert.equal((await first).code, 'close_timeout');
  assert.deepEqual(await s.controller.show(), { status: 'unavailable', code: 'instance_reused' });
  assert.equal(instance.calls.show, 1);
});

test('fallback-share close markers cannot grant a video reward', async () => {
  for (const close of [
    { isEnded: true, isFallbackShare: true },
    { isEnded: true, isFallback: true },
    { isEnded: true, isShare: true }
  ]) {
    const s = setup();
    const pending = s.controller.show();
    await flush();
    s.instances[0].emit('close', close);
    assert.equal((await pending).status, 'cancelled');
  }
});

test('close before any show acknowledgement cannot grant a reward', async () => {
  const wait = deferred();
  const s = setup({ show: () => wait.promise });
  const pending = s.controller.show();
  s.instances[0].emit('close', { isEnded: true });
  assert.equal((await pending).status, 'cancelled');
  wait.resolve();
  await flush();
});

test('telemetry observer exceptions never prevent settlement or cleanup', async () => {
  const instance = fakeAd();
  const controller = createRewardedAd({ wx: { createRewardedVideoAd: () => instance }, adUnitId: 'x',
    onEvent: () => { throw new Error('observer'); } });
  const pending = controller.show();
  await flush();
  instance.emit('close', { isEnded: true });
  assert.equal((await pending).status, 'completed');
  assert.equal(instance.calls.destroy, 1);
});

test('hosts without instance destroy still detach every registered listener', async () => {
  const instance = fakeAd();
  delete instance.destroy;
  const s = setup({ instance });
  const pending = s.controller.show();
  await flush();
  instance.emit('close', { isEnded: false });
  assert.equal((await pending).status, 'cancelled');
  assert.equal(instance.listeners.close.length, 0);
  assert.equal(instance.listeners.error.length, 0);
});

test('destroy during a pending load prevents any later retry or reward', async () => {
  const wait = deferred();
  const s = setup({ show: () => Promise.reject({ errCode: 1002 }), load: () => wait.promise });
  const pending = s.controller.show();
  await flush();
  s.controller.destroy();
  wait.resolve();
  await flush();
  assert.equal((await pending).status, 'unavailable');
  assert.equal(s.instances[0].calls.show, 1);
});

test('load retries share the original deadline rather than renewing it indefinitely', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const wait = deferred();
  const s = setup({ timeoutMs: 20, show: () => Promise.reject({ errCode: 1002 }), load: () => wait.promise });
  const pending = s.controller.show();
  await flush();
  t.mock.timers.tick(21);
  assert.equal((await pending).code, 'load_timeout');
  wait.resolve();
  await flush();
  assert.equal(s.instances[0].calls.show, 1);
});

test('1004 from loading or the retry show still reports unavailable', async () => {
  for (const options of [
    { show: () => Promise.reject({ errCode: 1002 }), load: () => Promise.reject({ errCode: 1004 }) },
    { show: count => Promise.reject({ errCode: count === 1 ? 1002 : 1004 }) }
  ]) {
    const s = setup(options);
    assert.deepEqual(await s.controller.show(), { status: 'unavailable', code: '1004' });
  }
});

test('synchronous registration callbacks cannot leave an error listener behind', async () => {
  const instance = fakeAd();
  instance.onClose = callback => { instance.listeners.close.push(callback); callback({ isEnded: true }); };
  const s = setup({ instance });
  assert.equal((await s.controller.show()).status, 'cancelled');
  assert.equal(instance.listeners.close.length, 0);
  assert.equal(instance.listeners.error.length, 0);
  assert.equal(instance.calls.show, 0);
});
