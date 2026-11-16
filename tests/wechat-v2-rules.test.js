'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Campaign = require('../minigame/src/campaign');
const Daily = require('../minigame/src/daily');
const Progression = require('../minigame/src/progression');

const zero = () => ({ jet: 0, pulse: 0, sail: 0 });
function campaignResult(data, levelId, extra) {
  const abilities = Progression.abilities(data);
  return Object.assign({ levelId, completed: true, time: 70, abilities,
    startAbilities: Object.assign({}, abilities), grants: [], assisted: false, runId: 'run-' + levelId }, extra);
}
function firstThree() {
  let data = Progression.sanitize({ board: [{ score: 99 }], pb: { normal: 60 } });
  for (const id of ['L01', 'L02', 'L03']) {
    const tx = Progression.settleCampaign(data, campaignResult(data, id));
    assert.equal(tx.ok, true); data = tx.data;
  }
  return data;
}
function chapterComplete() {
  let data = Progression.grant(firstThree(), 'jet', 'L04').data;
  return Progression.settleCampaign(data, campaignResult(data, 'L04')).data;
}
function dailyResult(extra) {
  return Object.assign({ runId: 'daily-one', date: '2026-11-07', pool: 'A', version: Daily.RULE_VERSION,
    time: 150, completed: true, signals: 40, segments: 3, gates: 3, score: 850,
    abilities: { jet: 1, pulse: 0, sail: 0 }, startAbilities: { jet: 1, pulse: 0, sail: 0 }, grants: [] }, extra);
}

test('first chapter exposes exactly four playable levels and strictly sequential access', () => {
  const clean = Progression.sanitize({});
  assert.deepEqual(Campaign.LEVELS.map(x => x.id), ['L01', 'L02', 'L03', 'L04']);
  assert.equal(Campaign.nextLevel(clean).id, 'L01');
  assert.equal(Campaign.unlocked(clean, 'L01'), true);
  assert.equal(Campaign.unlocked(clean, 'L02'), false);
  assert.equal(Campaign.unlocked(clean, 'L05'), false);
  assert.equal(Campaign.level('L05'), null);
  assert.equal(Campaign.nextLevel(chapterComplete()), null);
  assert.equal(Campaign.unlocked({ campaignV2: { completed: ['L03', 'L04'] } }, 'L04'), false);
});

test('campaign schedules preserve teaching order, wide L01 movement and late passage markers', () => {
  const one = Campaign.events('L01');
  assert.deepEqual(one.slice(0, 3).map(x => [x.type, x.lx]), [['signal', 0], ['signal', 0], ['signal', 0]]);
  assert.ok(one.slice(3).every(x => Math.abs(x.lx) >= 0.8));
  assert.equal(one.filter(x => x.type !== 'signal').length, 0);
  for (const metadata of Campaign.LEVELS) {
    const events = Campaign.events(metadata.id);
    assert.equal(events.filter(x => x.type === 'signal').length, metadata.target);
    assert.ok(events.every((x, i) => !i || x.at >= events[i - 1].at));
    assert.ok(Math.max(...events.map(x => x.at)) + 4 <= metadata.duration);
    assert.equal(new Set(events.map(x => x.id)).size, events.length);
    assert.equal(events.some(x => ['well', 'qte', 'blood'].includes(x.type)), false);
  }
  const two = Campaign.events('L02');
  for (const marker of two.filter(x => x.type === 'group')) {
    assert.ok(marker.at >= Math.max(...two.filter(x => x.type === 'rock' && x.group === marker.group).map(x => x.at)) + 4);
  }
  assert.equal(two.filter(x => x.type === 'group').length, 3);
  assert.ok(Campaign.events('L03').some(x => x.type === 'dust'));
  const grant = Campaign.events('L04').find(x => x.type === 'grant');
  assert.equal(grant.at, 3); assert.equal(grant.ability, 'jet');
  assert.ok(Campaign.events('L04').filter(x => x.type === 'rock').every(x => x.at > 10));
});

test('campaign schedule outputs and level metadata cannot be mutated across runs', () => {
  const first = Campaign.events('L01');
  assert.throws(() => { first[0].lx = 99; }, TypeError);
  assert.throws(() => { Campaign.LEVELS[0].objective.signals = 0; }, TypeError);
  assert.notEqual(first[0], Campaign.events('L01')[0]);
  assert.equal(Campaign.events('L01')[0].lx, 0);
});

test('UTC+8 daily date rolls at Beijing midnight and invalid dates are rejected', () => {
  assert.equal(Daily.dateKey(Date.parse('2026-11-06T15:59:59.999Z')), '2026-11-06');
  assert.equal(Daily.dateKey(Date.parse('2026-11-06T16:00:00.000Z')), '2026-11-07');
  assert.equal(Daily.validDate('2026-02-29'), false);
  assert.equal(Daily.validDate('2028-02-29'), true);
  assert.equal(Daily.dateKey(NaN), '');
});

test('daily schedule is deterministic, three nonrepeating templates and invariant 1050 maximum', () => {
  const start = Date.parse('2026-11-07T00:00:00Z');
  const first = Daily.createRun(start);
  assert.deepEqual(first, Daily.createRun(start + 100000));
  assert.notEqual(first.seed, Daily.createRun(start + 86400000).seed);
  assert.equal(first.templates.length, 3);
  assert.equal(new Set(first.templates.map(x => x.id)).size, 3);
  assert.equal(first.duration, 150);
  assert.equal(Daily.createRun(start, 'B'), null);
  assert.equal(Daily.createRun(start, 'C'), null);
  assert.equal(new Set(first.events.map(x => x.id)).size, first.events.length);
  assert.ok(first.events.every((x, i) => !i || x.at >= first.events[i - 1].at));
  for (let day = 0; day < 20; day += 1) {
    const run = Daily.createRun(start + day * 86400000);
    for (let segment = 0; segment < 3; segment += 1) {
      const events = run.events.filter(x => x.segment === segment);
      assert.equal(events.filter(x => x.type === 'signal').length, 20);
      assert.equal(events.filter(x => x.type === 'gate').length, 1);
      assert.ok(events.every(x => x.at >= segment * 50 && x.at + 4 < (segment + 1) * 50));
      assert.ok(events.every(x => Math.abs(x.lx) <= 1));
    }
    assert.equal(run.events.filter(x => x.type === 'well').length, 0);
    assert.equal(Daily.score(60, 3, 3), 1050);
  }
});

test('daily rocks preserve a broad route to the concurrent signal', () => {
  for (let day = 0; day < 12; day += 1) {
    const run = Daily.createRun(Date.parse('2026-11-07T00:00:00Z') + day * 86400000);
    for (const rock of run.events.filter(x => x.type === 'rock')) {
      const signal = run.events.find(x => x.type === 'signal' && x.at === rock.at);
      assert.ok(signal);
      assert.ok(Math.abs(rock.lx - signal.lx) >= 0.95);
    }
  }
});

test('daily score clamps invalid counts, rating boundaries and high tier eligibility are exact', () => {
  assert.equal(Daily.score(99, 99, 99), 1050);
  assert.equal(Daily.score(-1, NaN, Infinity), 0);
  assert.equal(Daily.score(5.9, 1.9, 0), 150);
  assert.deepEqual([399, 400, 649, 650, 849, 850, 1050].map(Daily.rating), ['none', 'bronze', 'bronze', 'silver', 'silver', 'gold', 'gold']);
  assert.deepEqual(Daily.rewardTiers(850, false), ['bronze', 'silver', 'gold']);
  assert.deepEqual(Daily.rewardTiers(850, true), ['complete', 'bronze', 'silver', 'gold']);
});

test('legacy and unknown extension fields survive sanitation in fresh independent objects', () => {
  const old = { board: [{ score: 4 }], pb: { easy: 10 }, daily: { date: 'old' }, unlock: 'blood', extra: { nested: [1] },
    campaignV2: { foreign: { value: 2 } }, growthV2: { foreign: 3, abilities: { extra: 4 } }, dailyV2: { foreign: 5 } };
  const data = Progression.sanitize(old);
  assert.deepEqual(data.board, old.board); assert.deepEqual(data.pb, old.pb);
  assert.deepEqual(data.daily, old.daily); assert.equal(data.unlock, 'blood');
  assert.deepEqual(data.campaignV2.foreign, { value: 2 });
  assert.equal(data.growthV2.foreign, 3); assert.equal(data.growthV2.abilities.extra, 4); assert.equal(data.dailyV2.foreign, 5);
  assert.deepEqual(Progression.abilities(data), zero()); assert.equal(data.growthV2.points, 0);
  data.extra.nested.push(2); data.campaignV2.foreign.value = 7;
  assert.deepEqual(old.extra.nested, [1]); assert.equal(old.campaignV2.foreign.value, 2);
});

test('malformed saves cannot skip levels, create abilities or derive unearned growth points', () => {
  const data = Progression.sanitize({
    campaignV2: { completed: ['L01', 'L03', 'L04', 'L12'], firstRewards: { L04: true } },
    growthV2: { points: -6, abilities: { jet: 3, pulse: 3, sail: 3 }, grants: { 'L04:jet': true, 'L06:pulse': true, 'L10:sail': true } }
  });
  assert.deepEqual(data.campaignV2.completed, ['L01']);
  assert.equal(Campaign.nextLevel(data).id, 'L02');
  assert.deepEqual(Progression.abilities(data), zero());
  assert.equal(data.growthV2.points, 0);
  assert.equal(Progression.dailyUnlocked(data), false);
  assert.equal(Progression.grant(data, 'jet', 'L04').ok, false);
  for (const points of [NaN, Infinity, 1.5, '8', 1000001]) assert.equal(Progression.sanitize({ growthV2: { points } }).growthV2.points, 0);
});

test('first completions reward once, failures and out of order claims cannot unlock', () => {
  const original = Progression.sanitize({});
  assert.equal(Progression.settleCampaign(original, campaignResult(original, 'L04')).ok, false);
  const failure = Progression.settleCampaign(original, campaignResult(original, 'L01', { completed: false }));
  assert.equal(failure.ok, true); assert.equal(failure.reward, 0);
  assert.deepEqual(failure.data.campaignV2.completed, []);
  const clear = Progression.settleCampaign(failure.data, campaignResult(failure.data, 'L01', { runId: 'clear-one' }));
  assert.equal(clear.reward, 2); assert.equal(clear.data.growthV2.points, 2);
  assert.deepEqual(clear.data.campaignV2.completed, ['L01']);
  assert.equal(Progression.settleCampaign(clear.data, campaignResult(clear.data, 'L01', { runId: 'clear-one' })).reason, 'already-settled');
  const replay = Progression.settleCampaign(clear.data, campaignResult(clear.data, 'L01', { runId: 'replay-one', time: 60 }));
  assert.equal(replay.reward, 0); assert.equal(replay.newBest, true);
  assert.equal(replay.data.growthV2.points, 2);
  assert.deepEqual(original.campaignV2.completed, []);
});

test('existing completion with missing reward flag is never paid a second time', () => {
  const data = Progression.sanitize({ campaignV2: { completed: ['L01'] }, growthV2: { points: 0 } });
  const tx = Progression.settleCampaign(data, campaignResult(data, 'L01', { runId: 'legacy-replay' }));
  assert.equal(tx.reward, 0); assert.equal(tx.data.growthV2.points, 0);
});

test('immediate failure is settleable but a zero-time campaign completion is rejected', () => {
  const data = Progression.sanitize({});
  assert.equal(Progression.settleCampaign(data, campaignResult(data, 'L01', { time: 0, completed: false })).ok, true);
  assert.equal(Progression.settleCampaign(data, campaignResult(data, 'L01', { time: 0 })).ok, false);
});

test('L04 teaching grant persists on failure, does not complete level, and cannot downgrade upgrades', () => {
  const before = firstThree();
  const grant = Progression.grant(before, 'jet', 'L04');
  assert.equal(grant.ok, true); assert.equal(grant.granted, true);
  assert.equal(before.growthV2.abilities.jet, 0);
  assert.equal(grant.data.growthV2.abilities.jet, 1);
  const failed = Progression.settleCampaign(grant.data, campaignResult(grant.data, 'L04', {
    completed: false, startAbilities: zero(), grants: [{ ability: 'jet', levelId: 'L04', at: 3 }]
  }));
  assert.equal(failed.ok, true); assert.equal(failed.reward, 0);
  const reopened = Progression.sanitize(failed.data);
  assert.equal(reopened.growthV2.abilities.jet, 1);
  assert.equal(Campaign.nextLevel(reopened).id, 'L04');
  assert.equal(Progression.dailyUnlocked(reopened), false);
  const upgraded = Progression.upgrade(reopened, 'jet', 1);
  assert.equal(upgraded.ok, true);
  const duplicate = Progression.grant(upgraded.data, 'jet', 'L04');
  assert.equal(duplicate.granted, false); assert.equal(duplicate.data.growthV2.abilities.jet, 2);
});

test('jet costs, cooldowns and fixed impulse match all three levels', () => {
  assert.equal(Progression.jetParams(0), null);
  assert.equal(Progression.jetParams(4), null);
  for (let level = 1; level <= 3; level += 1) {
    const params = Progression.jetParams(level);
    assert.equal(params.cost, [0.35, 0.30, 0.25][level - 1]);
    assert.equal(params.cooldown, [0.42, 0.38, 0.34][level - 1]);
    assert.equal(params.duration, 0.22); assert.equal(params.impulse, 55);
  }
});

test('upgrades atomically charge only next level, reject stale taps, insufficient points and locked skills', () => {
  const data = chapterComplete();
  assert.equal(data.growthV2.points, 8);
  assert.equal(Progression.upgrade(data, 'pulse', 0).ok, false);
  assert.equal(Progression.upgrade(data, 'sail', 0).ok, false);
  const second = Progression.upgrade(data, 'jet', 1);
  assert.equal(second.ok, true); assert.equal(second.cost, 4); assert.equal(second.data.growthV2.points, 4);
  assert.equal(data.growthV2.points, 8); assert.equal(data.growthV2.abilities.jet, 1);
  assert.equal(Progression.upgrade(second.data, 'jet', 1).reason, 'stale-level');
  assert.equal(Progression.upgrade(second.data, 'jet', 2).reason, 'insufficient-points');
  second.data.growthV2.points = 8;
  const third = Progression.upgrade(second.data, 'jet', 2);
  assert.equal(third.ok, true); assert.equal(third.data.growthV2.points, 0); assert.equal(third.level, 3);
  assert.equal(Progression.upgrade(third.data, 'jet', 3).reason, 'max-level');
});

test('campaign snapshots distinguish teaching grant and protect best records from assisted clears', () => {
  const data = Progression.grant(firstThree(), 'jet', 'L04').data;
  assert.equal(Progression.settleCampaign(data, campaignResult(data, 'L04', { startAbilities: zero() })).reason, 'invalid-snapshot');
  const granted = Progression.settleCampaign(data, campaignResult(data, 'L04', { startAbilities: zero(), grants: ['L04:jet'] }));
  assert.equal(granted.ok, true);
  assert.equal(granted.data.campaignV2.best.L04.startAbilities.jet, 0);
  assert.equal(granted.data.campaignV2.best.L04.abilities.jet, 1);
  assert.equal(granted.data.campaignV2.best.L04.grants[0].ability, 'jet');
  const assisted = Progression.settleCampaign(granted.data, campaignResult(granted.data, 'L04', { runId: 'assisted', time: 20, assisted: true }));
  assert.equal(assisted.ok, true); assert.equal(assisted.newBest, false);
  assert.equal(assisted.data.campaignV2.best.L04.time, 70);
  assert.equal(Progression.settleCampaign(data, campaignResult(data, 'L04', { abilities: { jet: 3, pulse: 0, sail: 0 } })).ok, false);
});

test('best record extension fields survive a faster campaign run', () => {
  const data = chapterComplete();
  data.campaignV2.best.L01.future = { preserved: true };
  const next = Progression.settleCampaign(data, campaignResult(data, 'L01', { runId: 'fast', time: 40 }));
  assert.equal(next.newBest, true);
  assert.deepEqual(next.data.campaignV2.best.L01.future, { preserved: true });
});

test('daily requires chapter completion, valid snapshot, valid score and real survival duration', () => {
  assert.equal(Progression.settleDaily(firstThree(), dailyResult()).reason, 'locked');
  const data = chapterComplete();
  for (const extra of [{ time: 149.9 }, { score: 1060 }, { score: 850.5 }, { date: '2026-02-30' },
    { score: 840 }, { signals: 61 }, { segments: 2 }, { gates: 4 }, { pool: 'B' },
    { abilities: { jet: 1, pulse: 1, sail: 0 } }, { grants: ['L04:jet'] }]) {
    assert.equal(Progression.settleDaily(data, dailyResult(extra)).ok, false, JSON.stringify(extra));
  }
  assert.equal(Progression.settleDaily(data, dailyResult()).ok, true);
});

test('daily gold pays all missing tiers once and same-day repeat remains capped at five points', () => {
  const initial = chapterComplete();
  const gold = Progression.settleDaily(initial, dailyResult());
  assert.equal(gold.ok, true); assert.equal(gold.reward, 5); assert.equal(gold.rating, 'gold');
  assert.equal(gold.data.growthV2.points, 13);
  assert.deepEqual(gold.awarded, ['complete', 'bronze', 'silver', 'gold']);
  assert.equal(Progression.settleDaily(gold.data, dailyResult()).reason, 'already-settled');
  const repeat = Progression.settleDaily(gold.data, dailyResult({ runId: 'daily-repeat', signals: 60, score: 1050 }));
  assert.equal(repeat.ok, true); assert.equal(repeat.reward, 0); assert.equal(repeat.newBest, true);
  assert.equal(repeat.data.growthV2.points, 13);
  assert.deepEqual(Daily.rewardState(repeat.data, '2026-11-07'), { complete: true, bronze: true, silver: true, gold: true, earned: 5, remaining: 0 });
});

test('daily validates available segment totals while tolerating sub-microsecond clock rounding', () => {
  const data = chapterComplete();
  const boundary = Progression.settleDaily(data, dailyResult({
    time: 49.9999999999993, completed: false, signals: 20, segments: 1, gates: 1, score: 350
  }));
  assert.equal(boundary.ok, true);
  assert.equal(Progression.settleDaily(data, dailyResult({
    time: 30, completed: false, signals: 30, segments: 0, gates: 1, score: 350
  })).ok, false);
});

test('daily failure can earn rating and later completed run only receives remaining difference', () => {
  const bronze = Progression.settleDaily(chapterComplete(), dailyResult({
    runId: 'bronze-failure', completed: false, time: 60, signals: 30, segments: 1, gates: 0, score: 400
  }));
  assert.equal(bronze.ok, true); assert.equal(bronze.reward, 1);
  assert.equal(bronze.data.dailyV2.records['2026-11-07|A|v2-a1'].last.completed, false);
  const gold = Progression.settleDaily(bronze.data, dailyResult({ runId: 'gold-later' }));
  assert.equal(gold.reward, 4); assert.equal(gold.data.growthV2.points, 13);
  assert.equal(Daily.rewardState(gold.data, '2026-11-07').remaining, 0);
});

test('daily reward identity ignores rule version and an existing other-pool award', () => {
  const initial = chapterComplete();
  initial.dailyV2.rewards['2026-11-07'] = { complete: true, bronze: true, silver: false, gold: false, originPool: 'B' };
  const silver = Progression.settleDaily(initial, dailyResult({ runId: 'version-two', version: 'v2-a2', signals: 30, gates: 1, score: 650 }));
  assert.equal(silver.reward, 1);
  assert.ok(silver.data.dailyV2.records['2026-11-07|A|v2-a2']);
  assert.equal(silver.data.dailyV2.rewards['2026-11-07'].originPool, 'B');
  const gold = Progression.settleDaily(silver.data, dailyResult({ runId: 'old-version' }));
  assert.equal(gold.reward, 1);
  assert.equal(gold.data.dailyV2.rewards['2026-11-07'].versions.gold, 'v2-a1');
});

test('daily uses start date across midnight and clock rollback cannot reclaim old rewards', () => {
  const first = Progression.settleDaily(chapterComplete(), dailyResult());
  const nextDay = Progression.settleDaily(first.data, dailyResult({ runId: 'day-two', date: '2026-11-08' }));
  assert.equal(nextDay.reward, 5);
  const rollback = Progression.settleDaily(Progression.sanitize(nextDay.data), dailyResult({ runId: 'clock-rollback', date: '2026-11-07' }));
  assert.equal(rollback.reward, 0);
  assert.equal(rollback.data.dailyV2.records['2026-11-07|A|v2-a1'].last.date, '2026-11-07');
});

test('daily keeps thirty score dates while never pruning paid reward dates', () => {
  let data = chapterComplete();
  for (let day = 0; day < 35; day += 1) {
    const date = Daily.dateKey(Date.parse('2026-10-01T00:00:00Z') + day * 86400000);
    const tx = Progression.settleDaily(data, dailyResult({ runId: 'history-' + day, date }));
    assert.equal(tx.ok, true); data = tx.data;
  }
  assert.equal(Object.keys(data.dailyV2.records).length, 30);
  assert.equal(Object.keys(data.dailyV2.rewards).length, 35);
  assert.equal(data.dailyV2.records['2026-10-01|A|v2-a1'], undefined);
  assert.equal(data.dailyV2.rewards['2026-10-01'].gold, true);
  const reopened = Progression.sanitize(data);
  assert.equal(Object.keys(reopened.dailyV2.rewards).length, 35);
});

test('daily best preserves extension fields and independent ability snapshots after upgrades', () => {
  let data = Progression.settleDaily(chapterComplete(), dailyResult()).data;
  data.dailyV2.records['2026-11-07|A|v2-a1'].best.future = { retain: 1 };
  data = Progression.upgrade(data, 'jet', 1).data;
  const oldBest = data.dailyV2.records['2026-11-07|A|v2-a1'].best;
  assert.equal(oldBest.abilities.jet, 1);
  const stronger = { jet: 2, pulse: 0, sail: 0 };
  const next = Progression.settleDaily(data, dailyResult({ runId: 'stronger', signals: 60, score: 1050, abilities: stronger, startAbilities: stronger }));
  assert.equal(next.ok, true); assert.equal(next.newBest, true);
  assert.equal(next.data.dailyV2.records['2026-11-07|A|v2-a1'].best.abilities.jet, 2);
  assert.deepEqual(next.data.dailyV2.records['2026-11-07|A|v2-a1'].best.future, { retain: 1 });
  stronger.jet = 3;
  assert.equal(next.data.dailyV2.records['2026-11-07|A|v2-a1'].best.abilities.jet, 2);
});
