'use strict';

// Times are effective play seconds at spawn; the runtime retains z projection.
const LEVELS = [
  { id: 'L01', name: '余辉', chapter: 1, target: 8, duration: 36, massStart: 60, rockDamage: 0,
    objective: { signals: 8, groups: 0, dust: 0, jets: 0 }, objectiveText: '拾取 8 月辉' },
  { id: 'L02', name: '碎石之间', chapter: 1, target: 10, duration: 50, massStart: 60, rockDamage: 6,
    objective: { signals: 10, groups: 3, dust: 0, jets: 0 }, objectiveText: '拾取 10 月辉，通过 3 组岩阵' },
  { id: 'L03', name: '星尘补给', chapter: 1, target: 10, duration: 58, massStart: 36, rockDamage: 8,
    objective: { signals: 10, groups: 0, dust: 1, jets: 0 }, objectiveText: '拾取 10 月辉，接触 1 次星尘' },
  { id: 'L04', name: '第一脉冲', chapter: 1, target: 12, duration: 70, massStart: 60, rockDamage: 8,
    objective: { signals: 12, groups: 0, dust: 0, jets: 1 }, objectiveText: '拾取 12 月辉，定向喷射 1 次' }
];
LEVELS.forEach(function (item) { Object.freeze(item.objective); Object.freeze(item); });
Object.freeze(LEVELS);

function level(id) { return LEVELS.find(function (item) { return item.id === id; }) || null; }
function completed(data) {
  const raw = data && data.campaignV2 && data.campaignV2.completed;
  const result = [];
  if (!Array.isArray(raw)) return result;
  for (let i = 0; i < LEVELS.length && raw.indexOf(LEVELS[i].id) >= 0; i += 1) result.push(LEVELS[i].id);
  return result;
}
function unlocked(data, id) {
  const index = LEVELS.findIndex(function (item) { return item.id === id; });
  return index >= 0 && index <= completed(data).length;
}
function nextLevel(data) { return LEVELS[completed(data).length] || null; }

function events(id) {
  if (!level(id)) return Object.freeze([]);
  const list = [];
  function body(at, type, lx, ly, extra) {
    list.push(Object.assign({ at: at, type: type, lx: lx, ly: ly || 0, r: type === 'dust' ? 8 : 12 }, extra));
  }
  function signals(times, xs, ys) {
    times.forEach(function (at, i) { body(at, 'signal', xs[i], ys ? ys[i] : 0); });
  }
  if (id === 'L01') {
    signals([0, 2.5, 5, 10, 14, 18, 24, 29], [0, 0, 0, 0.84, 0.99, 0.86, -0.84, -0.99]);
  } else if (id === 'L02') {
    signals([0, 3, 6, 11, 16, 22, 27, 33, 38, 44], [0, 0, 0, -0.65, -0.85, 0.65, 0.85, -0.65, -0.85, 0.7]);
    body(7, 'rock', 0.9, 0, { group: 1 });
    body(21, 'rock', -0.8, 0, { group: 2 });
    body(22, 'rock', -0.95, 0.55, { group: 2 });
    body(34, 'rock', 0.85, 0, { group: 3 });
    body(35, 'rock', 0.95, -0.55, { group: 3 });
    [15, 30, 43].forEach(function (at, i) { list.push({ at: at, type: 'group', group: i + 1 }); });
  } else if (id === 'L03') {
    signals([1, 5, 10, 15, 20, 25, 31, 37, 43, 51], [0, -0.65, -0.85, -0.65, 0.6, 0.85, 0.6, -0.65, -0.85, 0.65]);
    [0, 3, 7].forEach(function (at) { body(at, 'dust', 0.3, 0.32, { massDelta: 6 }); });
    body(19, 'rock', -0.9, 0.1);
    body(36, 'rock', 0.9, 0.1);
    body(32, 'dust', 0.75, -0.4, { massDelta: 6 });
    body(45, 'dust', -0.75, -0.4, { massDelta: 6 });
  } else {
    list.push({ at: 3, type: 'grant', ability: 'jet', levelId: 'L04' });
    signals([6, 10, 15, 20, 25, 30, 36, 42, 48, 53, 58, 64], [0, 0.65, 0.85, -0.65, -0.85, -0.65, 0.65, 0.85, 0.65, -0.65, -0.85, 0.65]);
    body(23, 'rock', 0.95, 0.25);
    body(39, 'rock', -0.95, 0.25);
    body(54, 'rock', 0.95, 0.25);
    body(18, 'dust', 0, 0.4, { massDelta: 5 });
    body(47, 'dust', 0, 0.4, { massDelta: 5 });
  }
  list.sort(function (a, b) { return a.at - b.at; });
  return Object.freeze(list.map(function (item, i) { return Object.freeze(Object.assign({ id: id + '-' + i }, item)); }));
}

module.exports = { LEVELS: LEVELS, level: level, unlocked: unlocked, nextLevel: nextLevel, events: events };
