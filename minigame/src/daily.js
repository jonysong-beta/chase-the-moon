'use strict';

const RULE_VERSION = 'v2-a1';
const RULE_VERSION_B = 'v2-b1';
const RULE_VERSION_C = 'v2-c1';
const DURATION = 150;
const SEGMENT_DURATION = 50;
const TEMPLATE_IDS = Object.freeze(['wide-arc', 'rock-gates', 'supply-fork', 'jet-shift']);
const TEMPLATE_IDS_B = Object.freeze(['single-well', 'rock-well', 'pulse-zigzag', 'double-well']);
const TEMPLATE_IDS_C = Object.freeze(['spike-line', 'shock-ring', 'sail-well', 'mixed-tide']);

function dateKey(ms) {
  const date = new Date(Number(ms) + 8 * 60 * 60 * 1000);
  if (!isFinite(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function hash(text) {
  let n = 2166136261;
  for (let i = 0; i < text.length; i += 1) { n ^= text.charCodeAt(i); n = Math.imul(n, 16777619); }
  return n >>> 0;
}
function rng(seed) {
  let n = seed || 1;
  return function () {
    n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
    return (n >>> 0) / 4294967296;
  };
}
function createRun(ms, pool) {
  pool = pool || 'A';
  const date = dateKey(ms);
  if (!date || ['A', 'B', 'C'].indexOf(pool) < 0) return null;
  const version = pool === 'C' ? RULE_VERSION_C : pool === 'B' ? RULE_VERSION_B : RULE_VERSION;
  const seed = hash(date + '|' + pool + '|' + version);
  const random = rng(seed);
  const available = (pool === 'C' ? TEMPLATE_IDS_C : pool === 'B' ? TEMPLATE_IDS_B : TEMPLATE_IDS).slice();
  const templates = [];
  const events = [];
  for (let segment = 0; segment < 3; segment += 1) {
    const id = available.splice(Math.floor(random() * available.length), 1)[0];
    const mirror = random() < 0.5 ? -1 : 1;
    const variant = random() < 0.5 ? -0.08 : 0.08;
    templates.push(Object.freeze({ id: id, mirror: mirror, variant: variant }));
    let serial = 0;
    function add(at, type, lx, ly, extra) {
      events.push(Object.freeze(Object.assign({ id: pool + '-' + segment + '-' + serial++, segment: segment,
        at: segment * SEGMENT_DURATION + at, type: type, lx: lx * mirror, ly: ly,
        r: type === 'gate' ? 24 : type === 'dust' ? 8 : 12 }, extra)));
    }
    for (let i = 0; i < 20; i += 1) {
      let x;
      if (pool === 'C') {
        if (id === 'spike-line') x = Math.floor(i / 5) % 2 ? -0.72 : 0.72;
        else if (id === 'shock-ring') x = Math.sin(i / 19 * Math.PI * 2) * 0.7;
        else if (id === 'sail-well') x = Math.sin(i / 19 * Math.PI * 2 + 0.4) * 0.78;
        else x = Math.floor(i / 4) % 2 ? -0.8 : 0.8;
      } else if (pool === 'B') {
        if (id === 'single-well') x = Math.sin(i / 19 * Math.PI * 2) * 0.58;
        else if (id === 'rock-well') x = Math.floor(i / 5) % 2 ? -0.62 : 0.62;
        else if (id === 'pulse-zigzag') x = Math.floor(i / 4) % 2 ? -0.78 : 0.78;
        else x = Math.sin(i / 19 * Math.PI * 2 + 0.5) * 0.78;
      } else if (id === 'wide-arc') x = Math.sin(i / 19 * Math.PI * 2) * 0.75;
      else if (id === 'rock-gates') x = Math.floor(i / 5) % 2 ? -0.62 : 0.62;
      else if (id === 'supply-fork') x = Math.sin(i / 19 * Math.PI * 2) * 0.55 + variant;
      else x = Math.floor(i / 4) % 2 ? -0.75 : 0.75;
      add(2 + i * 2, 'signal', x, Math.sin(i / 19 * Math.PI) * -0.25);
    }
    [8, 20, 32].forEach(function (at, i) {
      // Opposite-side rocks leave a broad corridor around the scheduled signal.
      const index = (at - 2) / 2;
      const signal = events.filter(function (event) { return event.segment === segment && event.type === 'signal'; })[index];
      const safeX = signal.lx / mirror;
      add(at, 'rock', safeX >= 0 ? -0.95 : 0.95, 0.15, { group: i + 1 });
    });
    [12, 28].forEach(function (at, i) {
      add(at, 'dust', id === 'supply-fork' ? (i ? -0.75 : 0.75) : 0, 0.45, { massDelta: 5 });
    });
    if ((pool === 'B' && id !== 'pulse-zigzag') || (pool === 'C' && (id === 'sail-well' || id === 'mixed-tide'))) {
      (id === 'double-well' || id === 'mixed-tide' ? [16, 32] : [24]).forEach(function (at, index) {
        const signalIndex = Math.max(0, Math.min(19, Math.round((at - 2) / 2)));
        const signal = events.filter(function (event) { return event.segment === segment && event.type === 'signal'; })[signalIndex];
        const safeX = signal.lx / mirror;
        add(at, 'well', safeX >= 0 ? -0.9 : 0.9, 0.1, { r: 15, pull: 480, killR: 0.42, spin: index % 2 ? -0.6 : 0.6 });
      });
    }
    add(42, 'gate', 0.68, 0, { group: segment + 1 });
  }
  events.sort(function (a, b) { return a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
  return Object.freeze({ date: date, pool: pool, version: version, seed: seed,
    templates: Object.freeze(templates), events: Object.freeze(events), duration: DURATION });
}
function count(value, max) { return typeof value === 'number' && isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0; }
function score(signals, segments, gates) { return 10 * count(signals, 60) + 100 * count(segments, 3) + 50 * count(gates, 3); }
function rating(value) { return value >= 850 ? 'gold' : value >= 650 ? 'silver' : value >= 400 ? 'bronze' : 'none'; }
function rewardTiers(value, completed) {
  const tiers = [];
  if (completed === true) tiers.push('complete');
  if (value >= 400) tiers.push('bronze');
  if (value >= 650) tiers.push('silver');
  if (value >= 850) tiers.push('gold');
  return tiers;
}
function rewardState(data, date) {
  const ledger = data && data.dailyV2 && data.dailyV2.rewards;
  const claimed = ledger && Object.prototype.hasOwnProperty.call(ledger, date) && ledger[date] || {};
  const state = { complete: claimed.complete === true, bronze: claimed.bronze === true,
    silver: claimed.silver === true, gold: claimed.gold === true };
  state.earned = (state.complete ? 2 : 0) + (state.bronze ? 1 : 0) + (state.silver ? 1 : 0) + (state.gold ? 1 : 0);
  state.remaining = 5 - state.earned;
  return state;
}

module.exports = { RULE_VERSION: RULE_VERSION, RULE_VERSION_B: RULE_VERSION_B, RULE_VERSION_C: RULE_VERSION_C, DURATION: DURATION, SEGMENT_DURATION: SEGMENT_DURATION,
  TEMPLATE_IDS: TEMPLATE_IDS, TEMPLATE_IDS_B: TEMPLATE_IDS_B, TEMPLATE_IDS_C: TEMPLATE_IDS_C, dateKey: dateKey, validDate: validDate, createRun: createRun,
  score: score, rating: rating, rewardTiers: rewardTiers, rewardState: rewardState };
