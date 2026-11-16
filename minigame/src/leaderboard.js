'use strict';

const Daily = require('./daily');
const VERSION = /^[A-Za-z0-9_.-]{1,64}$/;
function validUrl(value) {
  return typeof value === 'string' && value.length <= 500 && /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?(?:\/[^\s?#@]*)?$/.test(value);
}
function normalizeContext(raw) {
  if (!raw || typeof raw !== 'object' || ['daily', 'endless'].indexOf(raw.mode) < 0 || !VERSION.test(raw.version || '')) return null;
  const daily = raw.mode === 'daily';
  if (daily && (!Daily.validDate(raw.date) || ['A', 'B', 'C'].indexOf(raw.pool) < 0)) return null;
  if (typeof raw.score !== 'number' || !isFinite(raw.score) || raw.score < 0 || raw.score > 36000 ||
      (daily && (Math.floor(raw.score) !== raw.score || raw.score > 1050 || raw.score % 10 !== 0))) return null;
  if (raw.bestScore !== null && (typeof raw.bestScore !== 'number' || !isFinite(raw.bestScore) || raw.bestScore < raw.score ||
      raw.bestScore > (daily ? 1050 : 36000) || (daily && (Math.floor(raw.bestScore) !== raw.bestScore || raw.bestScore % 10 !== 0)))) return null;
  if (raw.eligible === true && (typeof raw.runId !== 'string' || !/^[A-Za-z0-9_.:|-]{1,128}$/.test(raw.runId) ||
      (daily && raw.time < Daily.DURATION) || !raw.abilities || ['jet', 'pulse', 'sail'].some(key => !Number.isInteger(raw.abilities[key]) || raw.abilities[key] < 0 || raw.abilities[key] > 3))) return null;
  return { mode: raw.mode, date: daily ? raw.date : '', pool: daily ? raw.pool : '', version: raw.version,
    score: raw.score, bestScore: raw.bestScore, time: Number(raw.time) || 0, runId: raw.runId || '',
    abilities: raw.abilities ? { jet: raw.abilities.jet, pulse: raw.abilities.pulse, sail: raw.abilities.sail } : null,
    eligible: raw.eligible === true, bestEligible: raw.bestEligible === true };
}
function leaderboardKey(raw) {
  const context = normalizeContext(raw);
  if (!context) return '';
  return context.mode === 'daily' ? 'moon.daily.' + context.date + '.' + context.pool + '.' + context.version : 'moon.endless.' + context.version;
}
function normalizeEntries(data, raw) {
  const context = normalizeContext(raw);
  if (!context || !data || !Array.isArray(data.entries) || data.entries.length > 50) return null;
  const rows = [];
  for (const entry of data.entries) {
    if (!entry || !Number.isInteger(entry.rank) || entry.rank < 1 || entry.rank > 1000000000 ||
        typeof entry.name !== 'string' || !entry.name.trim() || /[\u0000-\u001f\u007f]/.test(entry.name) ||
        typeof entry.value !== 'number' || !isFinite(entry.value) || !Number.isInteger(entry.value) ||
        entry.value < (context.mode === 'daily' ? 0 : 1) || entry.value > (context.mode === 'daily' ? 1050 : 36000000)) return null;
    rows.push({ rank: entry.rank, name: Array.from(entry.name.trim()).slice(0, 24).join(''), value: entry.value });
  }
  rows.sort((a, b) => b.value - a.value || a.rank - b.rank);
  const selfRank = data.selfRank === undefined || data.selfRank === null ? null : data.selfRank;
  if (selfRank !== null && (!Number.isInteger(selfRank) || selfRank < 1 || selfRank > 1000000000)) return null;
  return { rows, selfRank };
}
function createLeaderboard(options) {
  const wx = options.wx || {};
  const worldEnabled = validUrl(options.worldUrl) && typeof wx.request === 'function';
  const friendEnabled = options.friendEnabled === true && typeof wx.getOpenDataContext === 'function' && typeof wx.setUserCloudStorage === 'function';
  const preview = options.preview === true;
  const available = worldEnabled || friendEnabled || preview;
  let generation = 0, context = null, scope = worldEnabled || preview ? 'world' : 'friends', friendAuthorized = false, sharedCanvas = null, alive = true;
  let state = { status: 'idle', rows: [], selfRank: null, message: '', preview };
  function getState() {
    return Object.assign({}, state, { context: context ? Object.assign({}, context) : null, scope, available, worldEnabled, friendEnabled,
      rows: state.rows.map(row => Object.assign({}, row)) });
  }
  function validForScope(value) { return value === 'world' ? worldEnabled || preview : value === 'friends' ? friendEnabled || preview : false; }
  function requestWorld(method, value) {
    return new Promise((resolve, reject) => {
      const data = { mode: value.mode, version: value.version };
      if (value.mode === 'daily') { data.date = value.date; data.pool = value.pool; }
      if (method === 'GET') data.limit = 7;
      else {
        data.runId = value.runId; data.time = value.time; data.abilities = value.abilities;
        if (value.mode === 'daily') data.score = value.score; else data.timeMs = Math.round(value.score * 1000);
      }
      try {
        wx.request({ url: options.worldUrl, method, data, timeout: 10000, dataType: 'json', responseType: 'text',
          success(response) {
            if (!response || response.statusCode < 200 || response.statusCode >= 300) { reject(new Error('http')); return; }
            if (method === 'POST') {
              if (response.data && response.data.accepted === true) resolve({ status: 'synced' }); else reject(new Error('rejected'));
            } else {
              const result = normalizeEntries(response.data, value);
              if (result) resolve(result); else reject(new Error('invalid'));
            }
          }, fail() { reject(new Error('network')); } });
      } catch (error) { reject(error); }
    });
  }
  function checkFriendPermission() {
    return new Promise(resolve => {
      if (typeof wx.getSetting !== 'function') { resolve(false); return; }
      try { wx.getSetting({ success(result) { friendAuthorized = !!(result && result.authSetting && result.authSetting['scope.WxFriendInteraction'] === true); resolve(friendAuthorized); }, fail() { resolve(false); } }); }
      catch (_) { resolve(false); }
    });
  }
  function writeFriend(value) {
    if (!alive || !friendEnabled || value.bestScore === null || !value.bestEligible) return Promise.resolve({ status: 'skipped' });
    const write = () => new Promise(resolve => {
      const number = value.mode === 'daily' ? value.bestScore : Math.round(value.bestScore * 1000);
      try { wx.setUserCloudStorage({ KVDataList: [{ key: leaderboardKey(value), value: JSON.stringify({ v: 1, value: number }) }],
        success() { resolve({ status: 'synced' }); }, fail() { resolve({ status: 'error' }); } }); }
      catch (_) { resolve({ status: 'error' }); }
    });
    if (friendAuthorized) return write();
    return checkFriendPermission().then(allowed => allowed ? write() : { status: 'skipped' });
  }
  async function publish(raw) {
    const value = normalizeContext(raw);
    if (!alive) return { status: 'unavailable' };
    if (!value) return { status: 'invalid' };
    if (!worldEnabled && !friendEnabled) return { status: 'unavailable' };
    if (!value.eligible && !friendEnabled) return { status: 'skipped' };
    let synced = false, failed = false;
    if (worldEnabled && value.eligible) {
      try { await requestWorld('POST', value); synced = true; } catch (_) { failed = true; }
      if (!alive) return { status: 'unavailable' };
    }
    if (friendEnabled) {
      const result = await writeFriend(value);
      if (result.status === 'synced') synced = true;
      if (result.status === 'error') failed = true;
    }
    return { status: failed ? 'error' : synced ? 'synced' : 'skipped' };
  }
  async function loadWorld(id, value) {
    if (!alive || !value) return getState();
    try {
      const result = await requestWorld('GET', value);
      if (id !== generation) return getState();
      state = { status: result.rows.length ? 'ready' : 'empty', rows: result.rows, selfRank: result.selfRank,
        message: result.rows.length ? '世界排名 · 由服务端提供' : '这条航线还没有世界成绩', preview: false };
    } catch (_) { if (id === generation) state = { status: 'error', rows: [], selfRank: null, message: '暂时无法读取排行，请稍后重试', preview: false }; }
    return getState();
  }
  function previewState(value) {
    const rows = value.mode === 'daily' ? [{ rank: 1, name: '预览 · 金色航线', value: 900 }, { rank: 2, name: '预览 · 银色航线', value: 700 }] :
      [{ rank: 1, name: '预览 · 远航记录', value: 90000 }, { rank: 2, name: '预览 · 近地记录', value: 60000 }];
    state = { status: 'ready', rows, selfRank: null, message: '预览演示 · 非真实排名', preview: true };
    return getState();
  }
  async function show(raw) {
    const value = normalizeContext(raw), id = ++generation;
    context = value; scope = worldEnabled || preview ? 'world' : 'friends'; sharedCanvas = null;
    state = { status: 'loading', rows: [], selfRank: null, message: '正在读取航道记录', preview };
    if (!available) { state.status = 'unavailable'; state.message = '尚未接入排行服务'; return getState(); }
    if (!value) { state.status = 'invalid'; state.message = '此成绩不参与排行'; return getState(); }
    if (preview) return previewState(value);
    if (worldEnabled) {
      const published = await publish(value);
      await loadWorld(id, value);
      if (id === generation && published.status === 'error') state.message += ' · 本局成绩尚未同步';
    } else { state.status = 'idle'; state.message = '点击好友排行，授权后读取'; }
    return getState();
  }
  async function selectScope(value) {
    if (!validForScope(value)) { state = { status: 'unavailable', rows: [], selfRank: null, message: '该排行尚未配置', preview }; return getState(); }
    const id = ++generation; scope = value;
    if (preview) return previewState(context);
    if (value === 'world') { state = { status: 'loading', rows: [], selfRank: null, message: '正在读取世界排名', preview: false }; return loadWorld(id, context); }
    state = { status: 'loading', rows: [], selfRank: null, message: '等待微信好友授权', preview: false };
    let allowed = await checkFriendPermission();
    if (!allowed && typeof wx.authorize === 'function') {
      allowed = await new Promise(resolve => { try { wx.authorize({ scope: 'scope.WxFriendInteraction', success() { resolve(true); }, fail() { resolve(false); } }); } catch (_) { resolve(false); } });
    }
    if (id !== generation) return getState();
    friendAuthorized = allowed;
    if (!allowed) { state = { status: 'unavailable', rows: [], selfRank: null, message: '未获得好友关系授权 · 本机纪录不受影响', preview: false }; return getState(); }
    await writeFriend(context);
    if (id !== generation) return getState();
    try {
      const open = wx.getOpenDataContext();
      if (!open || !open.canvas || typeof open.postMessage !== 'function') throw new Error('open data unavailable');
      sharedCanvas = open.canvas; sharedCanvas.width = 714; sharedCanvas.height = 700;
      open.postMessage({ type: 'moon-rank', key: leaderboardKey(context), mode: context.mode, width: 714, height: 700, limit: 7 });
      state = { status: 'ready', rows: [], selfRank: null, message: '微信好友成绩 · 仅已授权的同玩好友', preview: false };
    } catch (_) { sharedCanvas = null; state = { status: 'error', rows: [], selfRank: null, message: '好友排行暂时无法打开，请稍后重试', preview: false }; }
    return getState();
  }
  function destroy() { alive = false; generation++; context = null; sharedCanvas = null; }
  return { available, show, publish, selectScope, getState, getCanvas() { return scope === 'friends' && state.status === 'ready' && !preview ? sharedCanvas : null; }, destroy };
}
module.exports = { createLeaderboard, leaderboardKey, normalizeEntries };
