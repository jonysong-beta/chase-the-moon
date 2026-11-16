'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createUI } = require('../minigame/src/ui');

function setup(scale) {
  const drawn = [];
  const ctx = new Proxy({
    fillText(value, x, y) { drawn.push({ value: String(value), x, y }); },
    measureText(value) { return { width: Array.from(value).length * 10 }; }
  }, { get: (object, key) => key in object ? object[key] : () => {} });
  const ui = createUI({ ctx, assets: {}, onAction() {} });
  ui.setViewport({ scale: scale || 360 / 270 });
  return { ui, drawn, values: () => drawn.map(entry => entry.value) };
}

function view(screen, data) {
  return { screen, v2: Object.assign({ mode: 'campaign' }, data) };
}

function mapLevels() {
  return ['L01', 'L02', 'L03', 'L04'].map((id, index) => ({
    id, name: ['逐光', '碎石', '星尘', '喷射'][index], target: 8,
    objective: '收集 8 个月辉', completed: index === 0, unlocked: index < 2,
    selected: index === 1, bestText: index === 0 ? '最佳 0:42' : ''
  }));
}

function abilities(jet) {
  return [Object.assign({ id: 'jet', name: '喷射', level: 1, source: 'L04 获得', effect: '沿方向短促加速',
    nextEffect: '消耗 0.30 · 恢复 0.38 秒', cost: 4, canUpgrade: true }, jet),
  { id: 'pulse', name: '双脉冲', level: 0, source: 'L06 获得 · 后续航程', effect: '连续点按，多一次喷射机会', canUpgrade: false },
  { id: 'sail', name: '引力帆', level: 0, source: 'L10 获得 · 后续航程', effect: '沿引力井外缘蓄能借力', canUpgrade: false }];
}

test('hub recommends the next available level, then daily after the first chapter', () => {
  const { ui, values } = setup();
  const state = view('title', { hub: { nextId: 'L02', nextName: '碎石之间', points: 2, dailyUnlocked: false } });
  ui.drawOverlay(state);
  assert.equal(ui.hitTest(135, 320).action, 'continueCampaign');
  assert.equal(ui.hitTest(56, 367).action, 'openCampaign');
  assert.equal(ui.hitTest(135, 367).action, 'openGrowth');
  assert.equal(ui.hitTest(214, 367).action, 'openDaily');
  assert.equal(ui.hitTest(135, 413).action, 'openClassic');
  assert.ok(values().includes('继续第 02 关'));
  state.v2.hub.complete = true;
  state.v2.hub.dailyUnlocked = true;
  ui.drawOverlay(state);
  assert.equal(ui.hitTest(135, 320).action, 'openDaily');
  assert.equal(ui.hitTest(56, 367).action, 'openCampaign');
});

test('map permits inspecting locked nodes but does not expose locked or future start actions', () => {
  const { ui, values } = setup();
  const state = view('map', { map: { selectedId: 'L02', levels: mapLevels(), nextChapterText: '后续航程尚未开放' } });
  ui.drawOverlay(state);
  assert.deepEqual(ui.hitTest(135, 420), { action: 'startCampaign', payload: 'L02' });
  assert.deepEqual(ui.hitTest(82, 220), { action: 'selectLevel', payload: 'L03' });
  assert.ok(values().includes('L05  后续航程尚未开放'));
  assert.equal(ui.hitTest(135, 310), null);
  state.v2.map.selectedId = 'L03';
  state.v2.map.levels[1].selected = false;
  ui.drawOverlay(state);
  assert.equal(ui.hitTest(135, 420), null);
  assert.ok(values().includes('完成前一关后解锁'));
  assert.equal(ui.hitTest(135, 464).action, 'backToHub');
});

test('growth upgrades carry the visible level and never offer future or unavailable upgrades', () => {
  const { ui, values } = setup();
  const state = view('growth', { growth: { points: 8, abilities: abilities() } });
  ui.drawOverlay(state);
  assert.deepEqual(ui.hitTest(135, 420), { action: 'upgradeAbility', payload: { ability: 'jet', expectedLevel: 1 } });
  assert.equal(ui.hitTest(135, 200), null);
  assert.equal(ui.hitTest(135, 280), null);
  for (const patch of [{ level: 0, canUpgrade: false }, { level: 1, canUpgrade: false }, { level: 3, canUpgrade: false }]) {
    state.v2.growth.abilities = abilities(patch);
    ui.drawOverlay(state);
    assert.equal(ui.hitTest(135, 420), null);
  }
  state.v2.growth.abilities = abilities();
  state.v2.growth.error = '保存失败，请重试';
  ui.drawOverlay(state);
  assert.ok(values().includes('保存失败，请重试'));
  assert.ok(values().includes('重试强化'));
  assert.equal(ui.hitTest(135, 420).action, 'upgradeAbility');
});

test('daily brief explains locked pools and exhausted rewards without adding reward claims', () => {
  const { ui, values } = setup();
  const state = view('dailyBrief', { daily: { date: '2026-11-07', pool: 'A', name: '近地航行',
    unlocked: false, remainingRewards: 5, bestText: '', version: 1 } });
  ui.drawBackground(state);
  ui.drawOverlay(state);
  assert.equal(ui.hitTest(135, 423), null);
  assert.ok(values().includes('完成 L04 后开放近地航行'));
  assert.ok(values().includes('B 池需完成 L08 · C 池需完成 L12'));
  state.v2.daily.unlocked = true;
  state.v2.daily.remainingRewards = 0;
  ui.drawOverlay(state);
  assert.equal(ui.hitTest(135, 423).action, 'startDaily');
  assert.ok(values().includes('今日剩余成长奖励  0 点'));
  assert.equal(ui.hitTest(135, 291), null);
});

test('grant layer requires saving and suppresses stale controls and toast instructions', () => {
  const { ui, values } = setup();
  const state = view('grant', { run: { grantPending: true, hint: '旧提示' } });
  state.controls = { visible: true, jetVisible: true };
  state.toast = '旧成就';
  ui.drawOverlay(state);
  assert.equal(ui.hitTest(135, 371).action, 'claimAbility');
  assert.equal(ui.hitTest(230, 431), null);
  assert.equal(ui.hitTest(135, 452).action, 'abandon');
  assert.ok(values().includes('保存并继续'));
  assert.ok(!values().includes('旧成就'));
  assert.ok(!values().includes('旧提示'));
  state.v2.run.grantError = '保存失败，请重试';
  ui.drawOverlay(state);
  assert.ok(values().includes('重试保存'));
});

test('unsaved result shows retry without claiming reward or exposing continuation', () => {
  const { ui, values } = setup();
  const state = view('result', { result: { title: '循光前行', subtitle: '首次通过 L01', completed: true,
    rows: [{ label: '月辉', value: '8 / 8' }], reward: 2, points: 2, savePending: false,
    saveError: '保存失败，请重试', nextLabel: '继续第 02 关' } });
  ui.drawOverlay(state);
  assert.equal(ui.hitTest(135, 376).action, 'retrySave');
  assert.equal(ui.hitTest(75, 419), null);
  assert.equal(ui.hitTest(195, 419), null);
  assert.equal(ui.hitTest(135, 463), null);
  assert.ok(values().includes('待保存'));
  assert.ok(!values().includes('+2  /  余额 2'));
  state.v2.result.saveError = '';
  ui.drawOverlay(state);
  assert.equal(ui.hitTest(135, 376).action, 'retry');
  assert.equal(ui.hitTest(75, 419).action, 'openCard');
  assert.equal(ui.hitTest(195, 419).action, 'openGrowth');
  assert.equal(ui.hitTest(135, 463).action, 'backToHub');
  assert.ok(values().includes('+2  /  余额 2'));
  assert.ok(!values().some(value => /重聚|月亮回来了/.test(value)));
});

test('first tutorial hides mass until relevant and keeps a single hint source', () => {
  const { ui, drawn, values } = setup();
  const state = view('play', { run: { title: '第一缕月辉', signals: 2, target: 8, showMass: false,
    hint: '追随金色辉光', objective: '收集月辉' } });
  state.hud = { massFraction: .8, progressFraction: .25 };
  ui.drawOverlay(state);
  assert.ok(!values().includes('质量'));
  assert.ok(values().includes('月辉  2 / 8'));
  assert.equal(values().filter(value => value === '追随金色辉光').length, 1);
  drawn.length = 0;
  state.v2.run.showMass = true;
  state.toast = '避开前方碎石';
  ui.drawOverlay(state);
  assert.ok(values().includes('质量'));
  assert.ok(!values().includes('追随金色辉光'));
  assert.equal(values().filter(value => value === '避开前方碎石').length, 1);
});

test('manual pause replaces all gameplay hotspots while lifecycle pause has no resume overlay', () => {
  const { ui, values } = setup();
  const state = view('play', { run: { title: '逐光', signals: 2, target: 8, showMass: false, jetLevel: 1 } });
  state.controls = { visible: true, jetVisible: true };
  state.manualPaused = true;
  ui.drawOverlay(state);
  assert.equal(ui.hitTest(135, 305).action, 'resumeRun');
  assert.equal(ui.hitTest(135, 359).action, 'abandon');
  assert.equal(ui.hitTest(230, 431), null);
  assert.equal(ui.hitTest(237, 20), null);
  state.manualPaused = false;
  state.paused = true;
  ui.drawOverlay(state);
  assert.equal(ui.hitTest(135, 305), null);
  assert.ok(values().includes('航行暂停'));
});

test('campaign HUD reports necessary event progress separately from collected moonlight', () => {
  const { ui, drawn, values } = setup();
  const state = view('play', { run: { title: 'L02 · 碎石之间', signals: 5, target: 10,
    rockGroups: 2, dust: 1, jets: 0, showMass: true, mass: 40.25 } });
  state.hud = { massFraction: .5, progressFraction: .35 };
  for (const [id, expected] of [['L02', '岩阵 2 / 3'], ['L03', '星尘 1 / 1'], ['L04', '喷射 0 / 1']]) {
    drawn.length = 0;
    state.v2.run.title = id + ' · 本关';
    ui.drawOverlay(state);
    assert.ok(values().includes(expected));
    assert.ok(values().includes('月辉  5 / 10'));
    assert.ok(values().includes('40.3'));
    assert.ok(values().includes('追近'));
  }
});

test('storage read errors expose only retry and cover, including hub error fallback', () => {
  const { ui } = setup();
  for (const screen of ['storageError', 'title']) {
    ui.drawOverlay(view(screen, { storageError: true, hub: { nextId: 'L01' } }));
    assert.equal(ui.hitTest(135, 362).action, 'retryStorage');
    assert.equal(ui.hitTest(135, 454).action, 'openCover');
    assert.equal(ui.hitTest(135, 320), null);
    assert.equal(ui.hitTest(135, 413), null);
  }
});

test('main new-screen touch areas retain 44 CSS pixels at phone and tablet scales', () => {
  for (const scale of [320 / 270, 360 / 270, 390 / 270, 430 / 270, 740 / 480]) {
    const { ui } = setup(scale);
    ui.drawOverlay(view('title', { hub: { nextId: 'L01' } }));
    const half = 22 / scale - .01;
    for (const center of [{ x: 56, y: 367.5, action: 'openCampaign' }, { x: 135, y: 367.5, action: 'openGrowth' },
      { x: 214, y: 367.5, action: 'openDaily' }, { x: 135, y: 413, action: 'openClassic' }]) {
      for (const offset of [{ x: -half, y: 0 }, { x: half, y: 0 }, { x: 0, y: -half }, { x: 0, y: half }]) {
        assert.equal(ui.hitTest(center.x + offset.x, center.y + offset.y).action, center.action);
      }
    }
    // The gaps stay inert rather than choosing a neighboring row.
    assert.equal(ui.hitTest(135, 390), null);
    assert.equal(ui.hitTest(135, 434), null);
  }
});
