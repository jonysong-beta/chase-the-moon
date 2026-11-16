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
    objective: { signals: 12, groups: 0, dust: 0, jets: 1 }, objectiveText: '拾取 12 月辉，定向喷射 1 次' },
  { id: 'L05', name: '引力边界', chapter: 2, target: 14, duration: 75, massStart: 60, rockDamage: 8,
    objective: { signals: 14, groups: 3, dust: 0, jets: 0 }, objectiveText: '拾取 14 月辉，通过 3 个井场' },
  { id: 'L06', name: '双重脉冲', chapter: 2, target: 14, duration: 85, massStart: 60, rockDamage: 8,
    objective: { signals: 14, groups: 0, dust: 0, jets: 0, pulses: 1 }, objectiveText: '拾取 14 月辉，成功使用额外脉冲 1 次' },
  { id: 'L07', name: '航迹交错', chapter: 2, target: 16, duration: 100, massStart: 60, rockDamage: 8,
    objective: { signals: 16, groups: 3, dust: 0, jets: 0, pulses: 0 }, objectiveText: '拾取 16 月辉，通过 3 组组合段' },
  { id: 'L08', name: '套环校准', chapter: 2, target: 12, duration: 85, massStart: 60, rockDamage: 8,
    objective: { signals: 12, groups: 0, dust: 0, jets: 0, pulses: 0, locks: 2 }, objectiveText: '拾取 12 月辉后完成 2 次校准锁定' },
  { id: 'L09', name: '暗月预警', chapter: 3, target: 16, duration: 85, massStart: 60, rockDamage: 8,
    objective: { signals: 16, groups: 0, dust: 0, jets: 0, pulses: 0, tides: 3 }, objectiveText: '拾取 16 月辉，通过 3 次潮汐刺序列' },
  { id: 'L10', name: '借力航行', chapter: 3, target: 16, duration: 100, massStart: 60, rockDamage: 8,
    objective: { signals: 16, groups: 0, dust: 0, jets: 0, pulses: 0, sails: 1 }, objectiveText: '拾取 16 月辉，成功借力释放 1 次' },
  { id: 'L11', name: '月蚀潮汐', chapter: 3, target: 18, duration: 100, massStart: 60, rockDamage: 8,
    objective: { signals: 18, groups: 3, dust: 0, jets: 0, pulses: 0 }, objectiveText: '拾取 18 月辉，通过 3 组潮汐段' },
  { id: 'L12', name: '最后一道轨道', chapter: 3, target: 20, duration: 120, massStart: 60, rockDamage: 8,
    objective: { signals: 20, groups: 0, dust: 0, jets: 0, pulses: 0, locks: 3 }, objectiveText: '拾取 20 月辉，最终完成 3 次有效锁定' }
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
  } else if (id === 'L04') {
    list.push({ at: 3, type: 'grant', ability: 'jet', levelId: 'L04' });
    signals([6, 10, 15, 20, 25, 30, 36, 42, 48, 53, 58, 64], [0, 0.65, 0.85, -0.65, -0.85, -0.65, 0.65, 0.85, 0.65, -0.65, -0.85, 0.65]);
    body(23, 'rock', 0.95, 0.25);
    body(39, 'rock', -0.95, 0.25);
    body(54, 'rock', 0.95, 0.25);
    body(18, 'dust', 0, 0.4, { massDelta: 5 });
    body(47, 'dust', 0, 0.4, { massDelta: 5 });
  } else if (id === 'L05') {
    signals([0, 3, 7, 11, 16, 21, 26, 31, 36, 41, 46, 52, 58, 65],
      [0, 0.4, 0.75, 0.85, 0.6, 0.2, -0.5, -0.85, -0.7, -0.2, 0.4, 0.85, 0.6, 0]);
    [[12, 0.8, 0], [34, -0.8, 0.2], [54, 0.75, -0.1]].forEach(function (well, index) {
      body(well[0], 'well', well[1], well[2], { r: 16, pull: 520, killR: 0.42, spin: index % 2 ? -0.6 : 0.6 });
    });
    [22, 44, 66].forEach(function (at, index) { list.push({ at: at, type: 'group', group: index + 1 }); });
    body(28, 'dust', -0.2, 0.35, { massDelta: 6 }); body(50, 'dust', 0.1, 0.35, { massDelta: 6 });
  } else if (id === 'L06') {
    list.push({ at: 3, type: 'grant', ability: 'pulse', levelId: 'L06' });
    signals([0, 3, 7, 11, 16, 21, 27, 33, 39, 45, 51, 57, 63, 70],
      [0, 0.3, 0.65, 0.85, -0.65, -0.85, 0.65, 0.85, -0.65, -0.85, 0.65, 0.85, -0.65, 0]);
    body(4, 'dust', -0.25, 0.35, { massDelta: 6 }); body(31, 'dust', 0, 0.35, { massDelta: 6 }); body(61, 'dust', 0, 0.35, { massDelta: 6 });
    body(18, 'rock', 0.95, 0.2); body(42, 'rock', -0.95, 0.2); body(64, 'rock', 0.95, 0.2);
  } else if (id === 'L07') {
    signals([0, 3, 7, 11, 16, 21, 26, 31, 36, 41, 46, 52, 58, 65, 74, 84],
      [0, 0.5, 0.85, -0.6, -0.85, 0.6, 0.85, -0.5, -0.8, 0.7, 0.85, -0.65, -0.85, 0.55, -0.55, 0]);
    body(12, 'rock', 0.95, 0.2); body(36, 'rock', -0.95, 0.2); body(66, 'rock', 0.95, 0.2);
    [[20, -0.75, 0.1], [50, 0.75, 0.1], [74, -0.75, 0.1]].forEach(function (well, index) {
      body(well[0], 'well', well[1], well[2], { r: 16, pull: 540, killR: 0.42, spin: index % 2 ? -0.6 : 0.6 });
    });
    [30, 60, 88].forEach(function (at, index) { list.push({ at: at, type: 'group', group: index + 1 }); });
    body(28, 'dust', 0, 0.35, { massDelta: 6 }); body(62, 'dust', 0, 0.35, { massDelta: 6 });
  } else if (id === 'L08') {
    signals([0, 4, 8, 13, 18, 24, 30, 36, 42, 50, 58, 68],
      [0, 0.4, 0.75, 0.85, 0.55, 0.1, -0.5, -0.85, -0.65, -0.1, 0.55, 0]);
    body(20, 'dust', 0, 0.35, { massDelta: 6 }); body(52, 'dust', 0, 0.35, { massDelta: 6 });
  } else if (id === 'L09') {
    signals([0, 3, 7, 11, 16, 21, 26, 31, 36, 41, 46, 52, 58, 64, 70, 76],
      [0, 0.45, 0.8, 0.65, 0.1, -0.55, -0.85, -0.6, 0.1, 0.65, 0.85, 0.45, -0.45, -0.85, -0.45, 0]);
    body(28, 'rock', 0.95, 0.2); body(56, 'rock', -0.95, 0.2);
    body(34, 'dust', 0, 0.35, { massDelta: 6 }); body(66, 'dust', 0, 0.35, { massDelta: 6 });
  } else if (id === 'L10') {
    list.push({ at: 3, type: 'grant', ability: 'sail', levelId: 'L10' });
    signals([0, 3, 7, 11, 16, 21, 26, 31, 36, 41, 46, 52, 58, 65, 74, 85],
      [0, 0.4, 0.75, 0.85, 0.55, 0.1, -0.5, -0.85, -0.65, -0.1, 0.55, 0.85, 0.4, -0.45, -0.75, 0]);
    [[20, -0.75, 0.1], [50, 0.75, 0.1]].forEach(function (well, index) {
      body(well[0], 'well', well[1], well[2], { r: 16, pull: 450, killR: 0.42, spin: index % 2 ? -0.5 : 0.5 });
    });
    body(32, 'dust', 0, 0.35, { massDelta: 6 }); body(68, 'dust', 0, 0.35, { massDelta: 6 });
  } else if (id === 'L11') {
    signals([0, 3, 7, 11, 16, 21, 26, 31, 36, 41, 46, 52, 58, 65, 72, 78, 84, 90],
      [0, 0.5, 0.85, 0.6, 0.1, -0.5, -0.85, -0.6, 0.1, 0.65, 0.85, 0.45, -0.45, -0.85, -0.55, 0.1, 0.65, 0]);
    body(18, 'rock', 0.95, 0.2); body(48, 'rock', -0.95, 0.2); body(76, 'rock', 0.95, 0.2);
    body(34, 'well', -0.75, 0.1, { r: 16, pull: 500, killR: 0.42, spin: 0.6 });
    body(68, 'well', 0.75, 0.1, { r: 16, pull: 500, killR: 0.42, spin: -0.6 });
    [30, 60, 94].forEach(function (at, index) { list.push({ at: at, type: 'group', group: index + 1 }); });
    body(40, 'dust', 0, 0.35, { massDelta: 6 }); body(82, 'dust', 0, 0.35, { massDelta: 6 });
  } else if (id === 'L12') {
    signals([0, 3, 7, 11, 16, 21, 26, 31, 36, 41, 46, 52, 58, 64, 70, 76, 82, 88, 96, 106],
      [0, 0.4, 0.75, 0.85, 0.55, 0.1, -0.5, -0.85, -0.65, -0.1, 0.55, 0.85, 0.45, -0.45, -0.85, -0.55, 0.1, 0.65, -0.45, 0]);
    body(24, 'rock', 0.95, 0.2); body(60, 'rock', -0.95, 0.2);
    body(42, 'well', -0.75, 0.1, { r: 16, pull: 480, killR: 0.42, spin: 0.5 });
    body(84, 'well', 0.75, 0.1, { r: 16, pull: 480, killR: 0.42, spin: -0.5 });
    body(36, 'dust', 0, 0.35, { massDelta: 6 }); body(78, 'dust', 0, 0.35, { massDelta: 6 });
  }
  list.sort(function (a, b) { return a.at - b.at; });
  return Object.freeze(list.map(function (item, i) { return Object.freeze(Object.assign({ id: id + '-' + i }, item)); }));
}

module.exports = { LEVELS: LEVELS, level: level, unlocked: unlocked, nextLevel: nextLevel, events: events };
