'use strict';

const VERSION = 'v1';
const CHUNK_SECONDS = 40;

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
function createRun(ms, serial) {
  return Object.freeze({ version: VERSION, seed: hash(String(ms) + '|' + String(serial) + '|' + VERSION) });
}
function chunk(seed, index) {
  index = Math.max(0, Math.floor(Number(index) || 0));
  const random = rng((Number(seed) ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0);
  const start = index * CHUNK_SECONDS, events = [];
  let serial = 0;
  const shift = (random() - .5) * .16;
  function add(at, type, lx, ly, extra) {
    events.push(Object.freeze(Object.assign({ id: 'E-' + index + '-' + serial++, at: start + at, type,
      lx: Math.max(-1, Math.min(1, lx)), ly: Math.max(-1, Math.min(1, ly)), segment: 0 }, extra)));
  }
  function signalX(i) { return Math.sin(i / 11 * Math.PI * 2 + index * .7) * .72 + shift; }
  for (let i = 0; i < 12; i += 1) add(2 + i * 3, 'signal', signalX(i), Math.sin(i / 11 * Math.PI) * -.25);
  add(12, 'dust', random() < .5 ? -.55 : .55, .3, { massDelta: 6 });
  add(30, 'dust', random() < .5 ? -.55 : .55, -.2, { massDelta: 6 });
  const rocks = Math.min(2 + Math.floor(index / 2), 5);
  for (let i = 0; i < rocks; i += 1) {
    const at = 8 + i * (22 / Math.max(1, rocks - 1));
    const nearest = Math.max(0, Math.min(11, Math.round((at - 2) / 3)));
    const safeX = signalX(nearest);
    add(at, 'rock', safeX >= 0 ? -.92 : .92, (random() - .5) * .5, { hard: true });
  }
  events.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  return Object.freeze(events);
}

module.exports = { VERSION, CHUNK_SECONDS, createRun, chunk };
