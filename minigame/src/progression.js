'use strict';

const Campaign = require('./campaign');
const Daily = require('./daily');
const ABILITIES = ['jet', 'pulse', 'sail'];
const MAX_POINTS = 1000000;
const own = function (value, key) { return Object.prototype.hasOwnProperty.call(value, key); };
const object = function (value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; };
const integer = function (value, min, max) { return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= min && value <= max; };

// Preserve JSON extension fields without sharing nested objects or setting prototypes.
function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === 'object') {
    const result = {};
    Object.keys(value).forEach(function (key) {
      Object.defineProperty(result, key, { value: copy(value[key]), enumerable: true, writable: true, configurable: true });
    });
    return result;
  }
  return value;
}
function validSnapshot(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    ABILITIES.every(function (key) { return integer(value[key], 0, 3); });
}
function snapshot(value) {
  return { jet: value.jet, pulse: value.pulse, sail: value.sail };
}
function normalizeGrants(value) {
  if (!Array.isArray(value)) return null;
  const result = [];
  for (let i = 0; i < value.length; i += 1) {
    const grant = value[i] === 'L04:jet' ? { ability: 'jet', levelId: 'L04' } : value[i];
    if (!grant || !((grant.ability === 'jet' && grant.levelId === 'L04') ||
      (grant.ability === 'pulse' && grant.levelId === 'L06') ||
      (grant.ability === 'sail' && grant.levelId === 'L10')) || result.length) return null;
    result.push(copy(grant));
  }
  return result;
}
function safeId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:|-]{1,160}$/.test(value) &&
    value !== '__proto__' && value !== 'constructor' && value !== 'prototype';
}
function validVersion(value) { return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(value); }
function trueMap(value) {
  const result = {};
  Object.keys(object(value)).forEach(function (key) { if (safeId(key) && value[key] === true) result[key] = true; });
  return result;
}
function readRecord(raw, daily) {
  raw = object(raw);
  if (!validSnapshot(raw.abilities) || typeof raw.time !== 'number' || !isFinite(raw.time) || raw.time < 0 || raw.time > 36000) return null;
  if (daily && (!integer(raw.score, 0, 1050) || raw.score % 10 !== 0)) return null;
  if (!daily && (raw.time <= 0 || raw.assisted === true)) return null;
  const record = copy(raw);
  record.abilities = snapshot(raw.abilities);
  record.startAbilities = validSnapshot(raw.startAbilities) ? snapshot(raw.startAbilities) : snapshot(raw.abilities);
  record.grants = normalizeGrants(raw.grants || []) || [];
  record.assisted = raw.assisted === true;
  if (daily) { record.completed = raw.completed === true && raw.time >= Daily.DURATION; record.rating = Daily.rating(raw.score); }
  return record;
}
function pruneRecords(records) {
  const dates = [];
  Object.keys(records).forEach(function (key) { const date = records[key].date; if (dates.indexOf(date) < 0) dates.push(date); });
  dates.sort().reverse();
  const keep = dates.slice(0, 30);
  Object.keys(records).forEach(function (key) { if (keep.indexOf(records[key].date) < 0) delete records[key]; });
}

function readEndlessRecord(raw) {
  raw = object(raw);
  if (!validSnapshot(raw.abilities) || typeof raw.time !== 'number' || !isFinite(raw.time) || raw.time <= 0 || raw.time > 36000 ||
      !Daily.validDate(raw.date) || !validVersion(raw.version)) return null;
  const record = copy(raw);
  record.abilities = snapshot(raw.abilities);
  record.startAbilities = validSnapshot(raw.startAbilities) ? snapshot(raw.startAbilities) : snapshot(raw.abilities);
  record.grants = normalizeGrants(raw.grants || []) || [];
  record.completed = false; record.assisted = false;
  return record;
}

function sanitize(source) {
  const data = copy(object(source));
  const campaign = copy(object(data.campaignV2));
  const rawCompleted = Array.isArray(campaign.completed) ? campaign.completed : [];
  campaign.completed = [];
  for (let i = 0; i < Campaign.LEVELS.length; i += 1) {
    const id = Campaign.LEVELS[i].id;
    if (rawCompleted.indexOf(id) < 0) break;
    campaign.completed.push(id);
  }
  const oldRewards = object(campaign.firstRewards);
  campaign.firstRewards = {};
  campaign.completed.forEach(function (id) { campaign.firstRewards[id] = true; });
  // A saved reward marker for an unfinished level remains a marker only;
  // it must never grant access, but dropping it could duplicate an old reward.
  Campaign.LEVELS.forEach(function (item) { if (oldRewards[item.id] === true) campaign.firstRewards[item.id] = true; });
  campaign.settled = trueMap(campaign.settled);
  const oldBest = object(campaign.best);
  campaign.best = {};
  campaign.completed.forEach(function (id) { const best = readRecord(oldBest[id], false); if (best) campaign.best[id] = best; });
  data.campaignV2 = campaign;

  const growth = copy(object(data.growthV2));
  growth.points = integer(growth.points, 0, MAX_POINTS) ? growth.points : 0;
  growth.abilities = copy(object(growth.abilities));
  growth.grants = copy(object(growth.grants));
  const jetGranted = campaign.completed.indexOf('L03') >= 0 && growth.grants['L04:jet'] === true;
  const pulseGranted = campaign.completed.indexOf('L05') >= 0 && growth.grants['L06:pulse'] === true;
  const sailGranted = campaign.completed.indexOf('L09') >= 0 && growth.grants['L10:sail'] === true;
  growth.abilities.jet = jetGranted ? (integer(growth.abilities.jet, 1, 3) ? growth.abilities.jet : 1) : 0;
  growth.abilities.pulse = pulseGranted ? (integer(growth.abilities.pulse, 1, 3) ? growth.abilities.pulse : 1) : 0;
  growth.abilities.sail = sailGranted ? (integer(growth.abilities.sail, 1, 3) ? growth.abilities.sail : 1) : 0;
  if (jetGranted) growth.grants['L04:jet'] = true;
  else delete growth.grants['L04:jet'];
  if (pulseGranted) growth.grants['L06:pulse'] = true;
  else delete growth.grants['L06:pulse'];
  if (sailGranted) growth.grants['L10:sail'] = true;
  else delete growth.grants['L10:sail'];
  data.growthV2 = growth;

  const daily = copy(object(data.dailyV2));
  const oldRecords = object(daily.records);
  daily.records = {};
  Object.keys(oldRecords).forEach(function (key) {
    const parts = key.split('|');
    if (parts.length !== 3 || !Daily.validDate(parts[0]) || !/^[ABC]$/.test(parts[1]) || !validVersion(parts[2])) return;
    const entry = copy(object(oldRecords[key]));
    const best = readRecord(entry.best, true);
    const last = readRecord(entry.last, true);
    if (!best && !last) return;
    entry.date = parts[0]; entry.pool = parts[1]; entry.version = parts[2];
    entry.best = best; entry.last = last;
    daily.records[key] = entry;
  });
  pruneRecords(daily.records);
  const oldLedger = object(daily.rewards);
  daily.rewards = {};
  Object.keys(oldLedger).forEach(function (date) {
    if (!Daily.validDate(date)) return;
    const entry = copy(object(oldLedger[date]));
    ['complete', 'bronze', 'silver', 'gold'].forEach(function (tier) { entry[tier] = entry[tier] === true; });
    daily.rewards[date] = entry;
  });
  daily.settled = trueMap(daily.settled);
  data.dailyV2 = daily;
  const endless = copy(object(data.endlessV2));
  endless.best = readEndlessRecord(endless.best);
  endless.last = readEndlessRecord(endless.last);
  endless.settled = trueMap(endless.settled);
  data.endlessV2 = endless;
  return data;
}
function abilities(data) { return snapshot(sanitize(data).growthV2.abilities); }
function dailyUnlocked(data) { return sanitize(data).campaignV2.completed.indexOf('L04') >= 0; }
function dailyPoolUnlocked(data, pool) {
  const completed = sanitize(data).campaignV2.completed;
  return pool === 'A' ? completed.indexOf('L04') >= 0 : pool === 'B' ? completed.indexOf('L08') >= 0 : pool === 'C' ? completed.indexOf('L12') >= 0 : false;
}
function jetParams(level) {
  if (!integer(level, 1, 3)) return null;
  return { cost: [0.35, 0.30, 0.25][level - 1], cooldown: [0.42, 0.38, 0.34][level - 1],
    duration: 0.22, impulse: 55, acceleration: 315, extraAcceleration: 0.55,
    baseSpeed: 138, targetMultiplier: 1.25, speedLimitMultiplier: 1.35 };
}
function pulseParams(level) {
  if (!integer(level, 1, 3)) return null;
  return { minInterval: .14, recovery: [1.8, 1.5, 1.2][level - 1] };
}
function sailParams(level) {
  if (!integer(level, 1, 3)) return null;
  return { charge: [.50, .42, .35][level - 1] };
}
function upgradeCost(ability, level) {
  const costs = { jet: [4, 8], pulse: [6, 10], sail: [8, 12] };
  return own(costs, ability) && integer(level, 1, 2) ? costs[ability][level - 1] : null;
}
function reject(data, reason) { return { ok: false, data: data, reason: reason, reward: 0 }; }
function grant(source, ability, levelId) {
  const data = sanitize(source);
  const grants = { jet: 'L04', pulse: 'L06', sail: 'L10' };
  if (!own(grants, ability) || grants[ability] !== levelId || !Campaign.unlocked(data, levelId)) return reject(data, 'locked');
  const key = levelId + ':' + ability;
  if (data.growthV2.grants[key] === true) return { ok: true, data: data, granted: false, reward: 0 };
  data.growthV2.grants[key] = true;
  data.growthV2.abilities[ability] = 1;
  return { ok: true, data: data, granted: true, reward: 0, ability: ability, level: 1 };
}
function upgrade(source, ability, expectedLevel) {
  const data = sanitize(source);
  if (['jet', 'pulse', 'sail'].indexOf(ability) < 0 || !data.growthV2.abilities[ability]) return reject(data, 'locked');
  const current = data.growthV2.abilities[ability];
  if (current === 3) return reject(data, 'max-level');
  if (!integer(expectedLevel, 1, 2) || expectedLevel !== current) return reject(data, 'stale-level');
  const cost = upgradeCost(ability, current);
  if (data.growthV2.points < cost) return reject(data, 'insufficient-points');
  data.growthV2.points -= cost;
  data.growthV2.abilities[ability] += 1;
  return { ok: true, data: data, cost: cost, level: current + 1, reward: 0 };
}
function resultSnapshots(data, result, levelId) {
  if (!validSnapshot(result.abilities)) return null;
  const start = result.startAbilities === undefined ? result.abilities : result.startAbilities;
  if (!validSnapshot(start)) return null;
  const grants = normalizeGrants(result.grants || []);
  if (!grants) return null;
  const grantLevels = { jet: 'L04', pulse: 'L06', sail: 'L10' };
  for (let i = 0; i < ABILITIES.length; i++) {
    const ability = ABILITIES[i], end = result.abilities[ability];
    if (end > data.growthV2.abilities[ability] || start[ability] > end) return null;
    if (end !== start[ability] && !(grantLevels[ability] === levelId && start[ability] === 0 && end === 1 && grants.length === 1)) return null;
  }
  if (grants.length) {
    const grant = grants[0];
    if (grantLevels[grant.ability] !== levelId || start[grant.ability] !== 0 || result.abilities[grant.ability] !== 1) return null;
  }
  return { abilities: snapshot(result.abilities), startAbilities: snapshot(start), grants: grants };
}
function settleCampaign(source, result) {
  const data = sanitize(source);
  result = object(result);
  if (!safeId(result.runId)) return reject(data, 'invalid-run');
  if (data.campaignV2.settled[result.runId] === true) return reject(data, 'already-settled');
  if (!Campaign.level(result.levelId) || !Campaign.unlocked(data, result.levelId)) return reject(data, 'locked');
  if (typeof result.completed !== 'boolean' || typeof result.time !== 'number' || !isFinite(result.time) || result.time < 0 ||
      (result.completed && result.time === 0) || result.time > 36000) return reject(data, 'invalid-result');
  const state = resultSnapshots(data, result, result.levelId);
  if (!state || (result.completed && result.levelId === 'L04' && !state.abilities.jet) ||
      (result.completed && result.levelId === 'L06' && !state.abilities.pulse)) return reject(data, 'invalid-snapshot');
  const record = Object.assign({}, copy(result), state, { assisted: result.assisted === true });
  const firstCompletion = result.completed && data.campaignV2.completed.indexOf(result.levelId) < 0;
  let reward = 0;
  let newBest = false;
  if (firstCompletion) data.campaignV2.completed.push(result.levelId);
  if (result.completed && data.campaignV2.firstRewards[result.levelId] !== true) {
    data.campaignV2.firstRewards[result.levelId] = true;
    reward = 2;
    data.growthV2.points = Math.min(MAX_POINTS, data.growthV2.points + reward);
  }
  const previous = data.campaignV2.best[result.levelId];
  if (result.completed && !record.assisted && (!previous || result.time < previous.time)) {
    data.campaignV2.best[result.levelId] = Object.assign({}, previous, record);
    newBest = true;
  }
  data.campaignV2.last = record;
  data.campaignV2.settled[result.runId] = true;
  return { ok: true, data: data, reward: reward, firstCompletion: firstCompletion, newBest: newBest };
}
function settleDaily(source, result) {
  const data = sanitize(source);
  result = object(result);
  if (!safeId(result.runId)) return reject(data, 'invalid-run');
  if (data.dailyV2.settled[result.runId] === true) return reject(data, 'already-settled');
  if (!dailyPoolUnlocked(data, result.pool)) return reject(data, 'locked');
  if (!Daily.validDate(result.date) || !validVersion(result.version) ||
      typeof result.completed !== 'boolean' || typeof result.time !== 'number' || !isFinite(result.time) || result.time < 0 || result.time > 36000 ||
      !integer(result.score, 0, 1050) || result.score % 10 !== 0 || (result.completed && result.time < Daily.DURATION)) return reject(data, 'invalid-result');
  const segments = Math.min(3, Math.floor((result.time + 0.000001) / Daily.SEGMENT_DURATION));
  const availableSegments = Math.min(3, segments + 1);
  const hasCounters = result.signals !== undefined || result.segments !== undefined || result.gates !== undefined;
  if ((hasCounters && (!integer(result.signals, 0, 20 * availableSegments) || !integer(result.segments, 0, 3) || !integer(result.gates, 0, availableSegments) ||
      result.segments !== segments || result.score !== Daily.score(result.signals, result.segments, result.gates))) ||
      result.score > 250 * availableSegments + segments * 100 || (!result.completed && result.time >= Daily.DURATION) || result.assisted === true) return reject(data, 'invalid-score');
  const state = resultSnapshots(data, result, null);
  if (!state) return reject(data, 'invalid-snapshot');
  const record = Object.assign({}, copy(result), state, { assisted: false, rating: Daily.rating(result.score) });
  const key = result.date + '|' + result.pool + '|' + result.version;
  const entry = data.dailyV2.records[key] || { date: result.date, pool: result.pool, version: result.version, best: null, last: null };
  const newBest = !entry.best || result.score > entry.best.score;
  entry.last = Object.assign({}, entry.last, record);
  if (newBest) entry.best = Object.assign({}, entry.best, record);
  data.dailyV2.records[key] = entry;
  pruneRecords(data.dailyV2.records);
  const ledger = data.dailyV2.rewards[result.date] || { complete: false, bronze: false, silver: false, gold: false };
  ledger.versions = object(ledger.versions);
  let reward = 0;
  const awarded = [];
  Daily.rewardTiers(result.score, result.completed).forEach(function (tier) {
    if (ledger[tier] === true) return;
    ledger[tier] = true;
    ledger.versions[tier] = result.version;
    reward += tier === 'complete' ? 2 : 1;
    awarded.push(tier);
  });
  data.dailyV2.rewards[result.date] = ledger;
  data.growthV2.points = Math.min(MAX_POINTS, data.growthV2.points + reward);
  data.dailyV2.settled[result.runId] = true;
  return { ok: true, data: data, reward: reward, awarded: awarded, newBest: newBest, rating: record.rating };
}

function settleEndless(source, result) {
  const data = sanitize(source);
  result = object(result);
  if (!safeId(result.runId)) return reject(data, 'invalid-run');
  if (data.endlessV2.settled[result.runId] === true) return reject(data, 'already-settled');
  if (!dailyUnlocked(data)) return reject(data, 'locked');
  if (result.completed !== false || typeof result.time !== 'number' || !isFinite(result.time) || result.time <= 0 || result.time > 36000 ||
      !Daily.validDate(result.date) || !validVersion(result.version) || result.assisted === true) return reject(data, 'invalid-result');
  const state = resultSnapshots(data, result, null);
  if (!state) return reject(data, 'invalid-snapshot');
  const record = Object.assign({}, copy(result), state, { completed: false, assisted: false });
  const newBest = !data.endlessV2.best || record.time > data.endlessV2.best.time;
  if (newBest) data.endlessV2.best = Object.assign({}, data.endlessV2.best, record);
  data.endlessV2.last = record;
  data.endlessV2.settled[result.runId] = true;
  return { ok: true, data, reward: 0, newBest };
}

module.exports = { sanitize: sanitize, abilities: abilities, dailyUnlocked: dailyUnlocked, dailyPoolUnlocked: dailyPoolUnlocked,
  jetParams: jetParams, pulseParams: pulseParams, sailParams: sailParams, upgradeCost: upgradeCost, grant: grant, upgrade: upgrade,
  settleCampaign: settleCampaign, settleDaily: settleDaily, settleEndless: settleEndless };
