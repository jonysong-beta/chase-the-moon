'use strict';

const { CONTROL_GEOMETRY: CONTROL } = require('./input');
const W = 270;
const H = 480;
const MAP_NODES = Object.freeze([{ x: 64, y: 88 }, { x: 188, y: 130 }, { x: 82, y: 202 }, { x: 190, y: 266 }]);
const SHARE_CARD_RECT = Object.freeze({ x: 31, y: 12, w: 208, h: 208 * 860 / 540 });
const COLOR = Object.freeze({
  paper: '#E8DCC8', cream: '#F0E6D3', dim: '#C5B89A', gold: '#D4A84B',
  bright: '#E8C878', navy: '#0C1D30', play: '#122336', ink: '#0A1420',
  teal: '#3D8B7A', bad: '#C45C6A', rust: '#D97B3A'
});

function createUI(options) {
  const { ctx, assets, onAction } = options;
  if (!ctx || !assets || typeof onAction !== 'function') throw new TypeError('createUI requires ctx, assets and onAction');
  const fonts = Object.assign({ mono: 'monospace', title: 'serif', display: 'serif', body: 'monospace' }, options.fonts);
  let regions = [];
  let lastScreen = null;
  let boardPage = 0;
  let resultPage = 0;
  let shareTextVisible = false;
  let selectedGrowthAbility = 'jet', mapChapter = 0;
  let boardPages = 1;
  let resultPages = 1;
  let cssScale = 375 / 270;

  function setViewport(viewport) {
    const scale = typeof viewport === 'number' ? viewport : viewport && (viewport.scale || viewport.cssScale);
    if (Number.isFinite(scale) && scale > 0) cssScale = scale;
  }

  function text(value, x, y, size, color, align, family, weight, maxWidth) {
    ctx.font = (weight || '400') + ' ' + size + 'px ' + (fonts[family || 'mono']);
    ctx.fillStyle = color || COLOR.cream;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    if (maxWidth) ctx.fillText(String(value === undefined || value === null ? '' : value), x, y, maxWidth);
    else ctx.fillText(String(value === undefined || value === null ? '' : value), x, y);
  }
  function rect(x, y, w, h, fill, stroke, width) {
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
    if (stroke) { ctx.lineWidth = width || 0.7; ctx.strokeStyle = stroke; ctx.strokeRect(x, y, w, h); }
  }
  function line(x1, y1, x2, y2, color, width) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.lineWidth = width || .6; ctx.strokeStyle = color || COLOR.gold; ctx.stroke();
  }
  function circle(x, y, radius, fill, stroke, width) {
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = width || 1; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function ticks(x, y, radius, color) {
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      line(x + Math.cos(a) * radius, y + Math.sin(a) * radius,
        x + Math.cos(a) * (radius + 3), y + Math.sin(a) * (radius + 3), color, .8);
    }
  }
  function fitImage(image) {
    if (!image || !image.width || !image.height) return;
    const scale = Math.max(W / image.width, H / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(image, (W - width) / 2, 0, width, height);
    ctx.restore();
  }
  function wrap(value, maxWidth, size, family) {
    ctx.font = '400 ' + size + 'px ' + fonts[family || 'mono'];
    const result = [];
    String(value || '').split('\n').forEach(paragraph => {
      let current = '';
      Array.from(paragraph).forEach(character => {
        if (current && ctx.measureText(current + character).width > maxWidth) {
          result.push(current); current = '';
        }
        current += character;
      });
      result.push(current);
    });
    return result;
  }
  function lines(value, x, y, width, size, color, leading, align, family, maxLines) {
    const wrapped = wrap(value, width, size, family);
    const shown = maxLines ? wrapped.slice(0, maxLines) : wrapped;
    shown.forEach((row, index) => text(row, x, y + index * leading, size, color, align, family));
    return shown.length * leading;
  }
  function region(action, payload, x, y, w, h, radius) {
    regions.push({ action, payload, x, y, w, h, radius });
  }
  function touchRegion(action, payload, x, y, w, h) {
    const minSize = 44 / cssScale;
    const width = Math.max(w, minSize);
    const height = Math.max(h, minSize);
    region(action, payload, Math.max(0, Math.min(W - width, x - (width - w) / 2)),
      Math.max(0, Math.min(H - height, y - (height - h) / 2)), width, height);
  }
  function button(label, action, x, y, w, h, settings) {
    const style = settings || {};
    const fill = style.primary ? COLOR.cream : style.paper ? COLOR.paper : 'rgba(10,20,32,.84)';
    const ink = style.primary || style.paper ? COLOR.ink : COLOR.cream;
    if (style.paper) rect(x, y + 2, w, h, COLOR.ink);
    rect(x, y, w, h, style.disabled ? COLOR.navy : fill, style.disabled ? '#5D655F' : COLOR.gold, .8);
    text(label, x + w / 2 + (style.led === undefined ? 0 : 5), y + h / 2, style.size || 10,
      style.disabled ? COLOR.dim : ink, 'center', style.family || 'body', '400', w - 10);
    if (style.led !== undefined) circle(x + 10, y + h / 2, 2.3, style.led ? COLOR.gold : '#6C746B', COLOR.ink, .5);
    if (!style.disabled) touchRegion(action, style.payload, x, y, w, h);
  }
  function panelHeading(title, subtitle, color) {
    text(title, 135, 40, 22, color || COLOR.cream, 'center', 'title', '700', 240);
    line(35, 64, 235, 64, COLOR.gold);
    if (subtitle) lines(subtitle, 135, 81, 228, 9, COLOR.dim, 14, 'center', 'body', 3);
  }
  function drawBackground(view) {
    if (!view || typeof view.screen !== 'string') throw new TypeError('UI view.screen must be a string');
    ctx.save();
    if (view.screen === 'cover') {
      rect(0, 0, W, H, '#17395A');
      fitImage(assets.cover);
      rect(2.7, 4.8, 264.6, 470.4, null, 'rgba(212,168,75,.38)', .65);
      [[3, 5, 1, 1], [267, 5, -1, 1], [3, 475, 1, -1], [267, 475, -1, -1]].forEach(corner => {
        line(corner[0], corner[1], corner[0] + corner[2] * 7, corner[1], COLOR.bright, 1);
        line(corner[0], corner[1], corner[0], corner[1] + corner[3] * 7, COLOR.bright, 1);
      });
      const angle = -.776 - (Number(view.titleOrbit) || 0) / 36 * Math.PI * 2;
      const mx = 517 / 1038 * W + Math.cos(angle) * 395 / 1038 * W;
      const my = 519 / 1038 * W + Math.sin(angle) * 395 / 1038 * W;
      if (assets.coverMoon) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(assets.coverMoon, mx - 37.8, my - 37.8, 75.6, 75.6);
      }
    } else if (view.screen === 'menu' || (view.screen === 'title' && !view.v2) || view.screen === 'classic') {
      rect(0, 0, W, H, COLOR.navy);
      fitImage(assets.menu);
    } else if (['map', 'growth', 'dailyBrief', 'meditation', 'leaderboard', 'storageError'].indexOf(view.screen) !== -1 ||
        (view.screen === 'title' && view.v2) ||
        (view.screen === 'result' && view.v2 && view.v2.mode !== 'classic')) {
      rect(0, 0, W, H, '#0E1C2C');
      sparseStars(10, 96, 250, 205);
    }
    ctx.restore();
  }
  function drawCover() {
    circle(29, 28, 12, COLOR.ink, COLOR.gold, .6);
    circle(28, 23, 4, COLOR.bright);
    circle(30, 21, 4, COLOR.ink);
    text('LUNA', 29, 33, 6, COLOR.bright, 'center', 'display');
    text('逐 月 计 划', 135, 311, 27, 'rgba(212,168,75,.4)', 'center', 'title', '700');
    text('逐 月 计 划', 134, 310, 27, COLOR.cream, 'center', 'title', '700');
    text('CATCH THE MOON', 135, 345, 10, COLOR.bright, 'center', 'display');
    line(49, 381, 122, 381, COLOR.gold);
    line(148, 381, 221, 381, COLOR.gold);
    ctx.beginPath(); ctx.moveTo(135, 377); ctx.lineTo(136.2, 380); ctx.lineTo(140, 381);
    ctx.lineTo(136.2, 382); ctx.lineTo(135, 385); ctx.lineTo(133.8, 382); ctx.lineTo(130, 381);
    ctx.lineTo(133.8, 380); ctx.closePath(); ctx.fillStyle = COLOR.bright; ctx.fill();
    button('开 始 任 务', 'openMenu', 49, 407, 172, 33, { family: 'body', size: 12 });
    text('VER. 1.0.1   /   AD LUNAM', 135, 458, 6.8, COLOR.dim, 'center', 'body');
  }
  function telemetry(title, value, x, y) {
    text(title, x, y, 7.1, COLOR.bright);
    text(value, x, y + 12, 6.6, COLOR.dim);
  }
  function drawMenu(view) {
    const menu = view.menu;
    if (!menu || !Array.isArray(menu.difficulties)) throw new TypeError('menu.difficulties must be an array');
    telemetry('TARGET / LUNA', 'DIST 384400 KM', 16, 163);
    telemetry('SOL III / EARTH', 'CLASS ' + menu.difficultyLabel, 16, 219);
    telemetry('GRAV WELL', 'PULL ×' + menu.wellMultiplier, 163, 128);
    line(18, 137, 29, 137, COLOR.gold); line(23.5, 131.5, 23.5, 142.5, COLOR.gold);
    line(240, 42, 251, 42, COLOR.gold); line(251, 42, 251, 54, COLOR.gold);
    // Keep the printed instrument housing; extend its cream control strip just
    // enough to retain 44 CSS-pixel touch targets on all four selector positions.
    rect(0, 333, W, 147, COLOR.paper);
    line(10, 334, 260, 334, COLOR.ink, 1);
    [[9, 341], [261, 341], [9, 470], [261, 470]].forEach(point => {
      circle(point[0], point[1], 2, null, '#84775F', .5);
      line(point[0] - 1, point[1], point[0] + 1, point[1], '#84775F', .4);
      line(point[0], point[1] - 1, point[0], point[1] + 1, '#84775F', .4);
    });
    const width = 57;
    menu.difficulties.slice(0, 4).forEach((entry, index) => {
      const x = 21 + index * width;
      rect(x, 342, width, 32, entry.selected ? COLOR.ink : COLOR.paper, COLOR.ink, .55);
      if (entry.selected) circle(x + width / 2, 349, 1.8, COLOR.gold);
      if (!entry.unlocked) {
        rect(x + width / 2 - 2, 347, 4, 3, null, '#8B8473', .5);
        circle(x + width / 2, 346, 1.5, null, '#8B8473', .5);
      }
      text(entry.label, x + width / 2, 362, 8.6,
        entry.selected ? COLOR.cream : entry.unlocked ? COLOR.ink : '#817B6C', 'center', 'body', '400', width - 5);
      touchRegion('setDifficulty', entry.key, x, 342, width, 32);
    });
    button(menu.daily ? '开始竞速' : '开始追逐', 'start', 21, 380, 228, 32, { primary: true, paper: true, size: 11 });
    button('声音', 'toggleSound', 21, 419, 68, 32, { paper: true, led: !!view.sound, size: 9 });
    button('今日竞速', 'toggleRace', 94, 419, 80, 32, { paper: true, led: !!menu.daily, size: 8.6 });
    button(view.screen === 'classic' ? '回任务台' : '返回封面', view.screen === 'classic' ? 'backToHub' : 'openCover',
      179, 419, 70, 32, { paper: true, size: 8.5 });
    line(23, 459, 247, 459, '#8B806D', .5);
    for (let x = 23; x <= 247; x += 5.6) line(x, 459, x, 459 + (Math.round((x - 23) / 5.6) % 5 ? 3 : 5), '#8B806D', .4);
    text('SOL III', 22, 474, 6, '#645B4E');
    text(menu.daily ? '今日竞速 · 对手是过去的自己' : '追寻月亮的光辉', 135, 472, 6.7, '#645B4E', 'center', 'body');
    text('LUNA', 248, 474, 6, '#645B4E', 'right');
  }
  function sparseStars(x, y, width, height) {
    for (let i = 0; i < 19; i++) {
      const sx = x + ((i * 83 + 19) % 251) / 251 * width;
      const sy = y + ((i * 67 + 43) % 197) / 197 * height;
      rect(sx, sy, i % 4 ? .6 : 1, i % 4 ? .6 : 1, 'rgba(197,184,154,.24)');
    }
  }
  function levelNumber(id) { return String(Number(String(id || '').replace('L', '')) || 1).padStart(2, '0'); }
  function levelText(level) { return ['未获得', 'Ⅰ', 'Ⅱ', 'Ⅲ'][level] || '未获得'; }
  function drawHub(view) {
    const hub = view.v2.hub || {};
    const completed = hub.completedCount === undefined ? (hub.complete ? 12 : Math.max(0, Number(levelNumber(hub.nextId)) - 1)) : hub.completedCount;
    const total = hub.totalLevels || 12, chapter = hub.chapter || 1, roman = ['I', 'II', 'III'][chapter - 1] || 'I';
    rect(0, 0, W, H, COLOR.navy);
    sparseStars(10, 52, 250, 327);
    line(16, 14, 254, 14, COLOR.gold, .7);
    text('SOL III / NAVIGATION DESK', 16, 25, 6.3, COLOR.gold);
    text('FLIGHT LOG', 254, 20, 5.5, COLOR.dim, 'right');
    text(String(view.v2.daily && view.v2.daily.date || '').replace(/-/g, '.'), 254, 29, 6.2, COLOR.bright, 'right');
    text('逐月工作台', 16, 44, 21, COLOR.cream, 'left', 'title', '700');
    text('CH. ' + roman + ' / ' + completed + ' OF ' + String(total).padStart(2, '0'), 18, 63, 5.8, COLOR.gold);
    circle(135, 111, 62, null, 'rgba(212,168,75,.18)', .6);
    ctx.beginPath(); ctx.ellipse(135, 112, 94, 37, -.28, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(212,168,75,.32)'; ctx.lineWidth = .6; ctx.stroke();
    ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(54, 143); ctx.quadraticCurveTo(105, 62, 214, 76);
    ctx.strokeStyle = COLOR.bright; ctx.lineWidth = .8; ctx.stroke(); ctx.setLineDash([]);
    [118, 153, 181].forEach((x, index) => {
      const y = [86, 72, 68][index];
      ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x + 2, y); ctx.lineTo(x, y + 2); ctx.lineTo(x - 2, y); ctx.closePath();
      ctx.fillStyle = COLOR.bright; ctx.fill();
    });
    circle(54, 140, 29, null, 'rgba(232,200,120,.45)', .6);
    circle(214, 76, 24, null, 'rgba(232,200,120,.35)', .6);
    if (assets.earth && assets.earth.width) {
      ctx.imageSmoothingEnabled = true; ctx.drawImage(assets.earth, 34, 120, 40, 40);
    } else circle(54, 140, 20, COLOR.teal, COLOR.cream, .6);
    if (assets.moon && assets.moon.width) {
      ctx.imageSmoothingEnabled = true; ctx.drawImage(assets.moon, 198, 60, 32, 32);
    } else circle(214, 76, 16, COLOR.gold, COLOR.bright, .6);
    text('SOL III', 54, 164, 5.4, COLOR.dim, 'center');
    text('TARGET / LUNA', 214, 103, 5.2, COLOR.dim, 'center');
    text('大成长线 / ' + (hub.complete ? '全部航程已完成' : hub.chapterName || '当前航程'), 18, 176, 6.4, COLOR.dim);
    text(hub.complete ? '主线已完成 · 月之重逢' : '继续 ' + (hub.nextId || 'L01') + ' · ' + (hub.nextName || '余辉'),
      18, 190, 13, COLOR.cream, 'left', 'title', '700', 190);
    circle(235, 183, 15, null, COLOR.gold, .7);
    text('→', 235, 183, 15, COLOR.bright, 'center');
    touchRegion(hub.complete ? 'openCampaign' : 'continueCampaign', null, 16, 165, 238, 37);
    line(16, 202, 254, 202, COLOR.gold, .6);
    const segmentWidth = (238 - (total - 1) * 4) / total;
    for (let i = 0; i < total; i++) rect(16 + i * (segmentWidth + 4), 205, segmentWidth, 2.5, i < completed ? COLOR.gold : null, COLOR.gold, .5);
    function channel(title, description, data, value, y, primary, active, action) {
      const ink = primary ? COLOR.ink : COLOR.cream;
      if (primary) rect(14, y, 242, 46, COLOR.paper, null);
      text(primary ? '02' : title === '无尽追寻' ? '03' : '04', 22, y + 10, 5.5, primary ? '#725722' : COLOR.gold);
      text(title, 45, y + 17, 12.5, ink, 'left', 'title', '700');
      text(description, 45, y + 33, 6.4, primary ? '#514A3D' : COLOR.dim, 'left', 'body', '400', 148);
      text(data, 250, y + 13, 5.4, primary ? '#725722' : COLOR.gold, 'right');
      text(value, 250, y + 31, 10, ink, 'right');
      if (primary) rect(224, y, 32, 2, COLOR.rust);
      line(16, y + 46, 254, y + 46, primary ? COLOR.gold : 'rgba(212,168,75,.46)', primary ? 1.5 : .6);
      if (active) touchRegion(action, null, 14, y, 242, 46);
    }
    channel('每日航线', hub.dailyUnlocked ? '今日航道已就绪 · 可反复精进' : '完成 L04 后开放',
      hub.dailyUnlocked ? 'ROUTE / ' + (hub.dailyPool || 'A') : 'LOCKED', hub.dailyUnlocked ? '150 S' : 'L04', 209, true, hub.dailyUnlocked, 'openDaily');
    channel('无尽追寻', hub.endlessUnlocked ? (hub.endlessBestText ? '本机最长追寻' : '随时开始 · 活得越久越好') : '完成 L04 后开放',
      hub.endlessUnlocked ? (hub.endlessBestText ? 'PERSONAL' : 'SURVIVAL') : 'LOCKED',
      hub.endlessUnlocked ? (hub.endlessBestText || '∞') : 'L04', 258, false, hub.endlessUnlocked, 'startEndless');
    channel('星空冥想', '2 / 5 / 10 分钟 · 无成绩', 'QUIET', '◌', 306, false, true, 'openMeditation');
    line(16, 374, 254, 374, 'rgba(212,168,75,.35)', .5);
    text('PERMANENT GROWTH', 16, 389, 5.8, COLOR.gold);
    text('成长点 ' + (hub.points || 0), 254, 389, 7.2, COLOR.bright, 'right');
    line(16, 433, 254, 433, 'rgba(212,168,75,.35)', .5);
    [
      ['航图', 'openCampaign', 27], ['成长', 'openGrowth', 81], ['经典', 'openClassic', 135],
      [view.sound ? '声音 · 开' : '声音 · 关', 'toggleSound', 189], ['封面', 'openCover', 243]
    ].forEach(entry => {
      text(entry[0], entry[2], 455, 7.2, COLOR.dim, 'center', 'body');
      touchRegion(entry[1], null, entry[2] - 20, 438, 40, 34);
    });
  }
  function drawMap(view) {
    const map = view.v2.map || {};
    const allLevels = Array.isArray(map.levels) ? map.levels : [];
    const selectedEntry = allLevels.find(entry => entry.id === map.selectedId);
    if (!mapChapter) mapChapter = selectedEntry && selectedEntry.chapter || 1;
    const levels = allLevels.filter(entry => (entry.chapter || 1) === mapChapter).slice(0, 4);
    const completed = levels.filter(entry => entry.completed).length;
    text('第 ' + mapChapter + ' 章 · ' + ({ 1: '循光启程', 2: '穿越引力', 3: '月之暗面' }[mapChapter] || '逐月航程'), 135, 34, 20, COLOR.cream, 'center', 'title', '700');
    text('主线航图   ' + completed + ' / ' + levels.length, 135, 61, 10, COLOR.dim, 'center', 'body');
    [1, 2, 3].forEach((chapter, index) => button(chapter === 1 ? 'Ⅰ' : chapter === 2 ? 'Ⅱ' : 'Ⅲ', 'uiMapChapter', 162 + index * 34, 72, 28, 22,
      { primary: chapter === mapChapter, size: 8, payload: chapter }));
    for (let i = 1; i < MAP_NODES.length; i++) {
      const from = MAP_NODES[i - 1]; const to = MAP_NODES[i];
      ctx.setLineDash(levels[i] && levels[i].unlocked ? [] : [3, 5]);
      line(from.x, from.y, to.x, to.y, levels[i] && levels[i].unlocked ? COLOR.gold : '#50606C', 1);
    }
    ctx.setLineDash([]);
    levels.forEach((entry, index) => {
      const point = MAP_NODES[index]; const selected = entry.id === map.selectedId || entry.selected;
      const color = entry.unlocked ? COLOR.gold : '#69747C';
      circle(point.x, point.y, 15, entry.completed ? COLOR.cream : COLOR.navy, color, selected ? 2 : 1);
      if (entry.unlocked) circle(point.x, point.y, 19, null, color, .6);
      else { ctx.setLineDash([2, 3]); circle(point.x, point.y, 19, null, color, .6); ctx.setLineDash([]); }
      text(levelNumber(entry.id), point.x, point.y + 1, 11, entry.completed ? COLOR.ink : COLOR.cream, 'center', 'mono', '700');
      if (selected) {
        line(point.x - 30, point.y, point.x - 23, point.y, COLOR.bright, 2);
        line(point.x - 27, point.y - 3, point.x - 23, point.y, COLOR.bright, 1);
      }
      if (entry.completed) line(point.x - 6, point.y + 10, point.x + 6, point.y + 10, COLOR.ink, 1.2);
      text(entry.name, point.x, point.y + (index === 3 ? -27 : 31), 10,
        entry.unlocked ? COLOR.cream : COLOR.dim, 'center', 'body', '400', 120);
      // Locked nodes may be inspected; only the explicit entry action is gated.
      touchRegion('selectLevel', entry.id, point.x - 23, point.y - 22, 46, 44);
    });
    const nextChapterText = map.nextChapterText || '后续航程尚未开放';
    text(nextChapterText, 18, 310, 10, COLOR.dim, 'left', 'body');
    const selected = levels.find(entry => entry.id === map.selectedId) || levels.find(entry => entry.selected) || levels[0];
    rect(14, 323, 242, 72, 'rgba(10,20,32,.9)');
    line(14, 323, 256, 323, COLOR.gold);
    if (selected) {
      text('第 ' + levelNumber(selected.id) + ' 关  ' + selected.name, 23, 336, 13, COLOR.cream, 'left', 'body', '700', 224);
      lines(selected.objective || ('收集 ' + selected.target + ' 个月辉'), 23, 355, 224, 10, COLOR.dim, 13, 'left', 'body', 2);
      text(selected.unlocked ? selected.bestText || '完成任务，循光前行' : '完成前一关后解锁', 23, 384, 10,
        selected.unlocked ? COLOR.bright : COLOR.dim, 'left', 'body', '400', 224);
    }
    button(selected && selected.completed ? '重玩本关' : '开始本关', 'startCampaign', 20, 404, 230, 35,
      { primary: true, size: 12, disabled: !selected || !selected.unlocked, payload: selected && selected.id });
    button('回任务台', 'backToHub', 20, 448, 230, 32, { size: 11 });
  }
  function abilityMark(id, x, y, active) {
    const color = active ? COLOR.bright : '#69747C';
    circle(x, y, 17, null, color, .8);
    if (id === 'jet') {
      line(x - 8, y + 6, x + 7, y - 6, color, 2);
      line(x + 1, y - 6, x + 7, y - 6, color, 2);
      line(x + 7, y - 6, x + 7, y, color, 2);
      line(x - 11, y + 1, x - 5, y - 4, color, 1);
    } else if (id === 'pulse') {
      line(x - 9, y + 4, x + 2, y - 5, color, 1.5);
      line(x - 1, y + 6, x + 10, y - 3, color, 1.5);
    } else {
      ctx.beginPath(); ctx.arc(x - 4, y, 10, -.9, .9); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(x - 4, y, 15, -.7, .7); ctx.stroke();
    }
  }
  function drawGrowth(view) {
    const growth = view.v2.growth || {};
    const abilities = Array.isArray(growth.abilities) ? growth.abilities.slice(0, 3) : [];
    text('能力成长', 135, 35, 22, COLOR.cream, 'center', 'title', '700');
    text('成长点  ' + (growth.points || 0), 135, 66, 14, COLOR.bright, 'center', 'body', '700');
    abilities.forEach((ability, index) => {
      const y = 96 + index * 80;
      abilityMark(ability.id, 35, y + 22, ability.level > 0);
      text(ability.name, 65, y + 4, 13, COLOR.cream, 'left', 'body', '700');
      text(levelText(ability.level), 249, y + 4, 11, ability.level ? COLOR.bright : COLOR.dim, 'right', 'body');
      text(ability.source, 65, y + 23, 10, COLOR.dim, 'left', 'body', '400', 184);
      lines(ability.effect, 65, y + 41, 184, 10, COLOR.cream, 14, 'left', 'body', 2);
      line(20, y + 70, 250, y + 70, 'rgba(197,184,154,.24)');
      touchRegion('uiSelectGrowthAbility', ability.id, 20, y, 230, 70);
    });
    const selected = abilities.find(ability => ability.id === selectedGrowthAbility) || abilities[0];
    if (selected) {
      lines(selected.level >= 3 ? selected.name + '已完成强化' : selected.level ? selected.nextEffect : selected.source,
        20, 343, 230, 10, COLOR.cream, 14, 'left', 'body', 2);
      if (selected.level > 0 && selected.level < 3) text('强化至 ' + levelText(selected.level + 1) + ' 需要 ' + selected.cost + ' 成长点', 20, 375, 10, COLOR.bright, 'left', 'body');
      if (growth.error) text(growth.error, 135, 390, 10, COLOR.bad, 'center', 'body', '400', 230);
      button(selected.level >= 3 ? '已完成强化' : !selected.level ? '尚未获得' + selected.name : selected.canUpgrade ? (growth.error ? '重试强化' : '强化' + selected.name) : '成长点不足',
        'upgradeAbility', 20, 403, 230, 34, { primary: true, size: 12, disabled: !selected.canUpgrade || !selected.level || selected.level >= 3,
          payload: { ability: selected.id, expectedLevel: selected.level } });
    }
    button('回任务台', 'backToHub', 20, 447, 230, 32, { size: 11 });
  }
  function routeVignette(y, height) {
    line(16, y, 254, y, COLOR.gold, .8);
    line(16, y + height, 254, y + height, COLOR.gold, .8);
    rect(16, y + height - 2, 48, 2, COLOR.rust);
    ctx.save(); ctx.beginPath(); ctx.rect(16, y, 238, height); ctx.clip();
    sparseStars(20, y + 7, 230, height - 14);
    for (let i = 0; i < 150; i++) {
      const gx = 18 + ((i * 73 + 17) % 229) / 229 * 234;
      const gy = y + 3 + ((i * 47 + 29) % 151) / 151 * (height - 6);
      rect(gx, gy, i % 7 ? .45 : .8, i % 7 ? .45 : .8, i % 7 ? 'rgba(240,230,211,.08)' : 'rgba(212,168,75,.17)');
    }
    ctx.beginPath(); ctx.ellipse(135, y + 78, 113, 55, -.22, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(212,168,75,.32)'; ctx.lineWidth = .7; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(135, y + 78, 88, 86, .55, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(212,168,75,.17)'; ctx.lineWidth = .6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(58, y + 119); ctx.quadraticCurveTo(87, y + 13, 211, y + 43);
    ctx.strokeStyle = COLOR.gold; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(58, y + 119); ctx.quadraticCurveTo(116, y + 30, 211, y + 43);
    ctx.strokeStyle = COLOR.cream; ctx.lineWidth = .7; ctx.stroke(); ctx.setLineDash([]);
    [[116, 54], [151, 40], [181, 38]].forEach(point => {
      const px = point[0], py = y + point[1];
      ctx.beginPath(); ctx.moveTo(px, py - 3); ctx.lineTo(px + 3, py); ctx.lineTo(px, py + 3); ctx.lineTo(px - 3, py); ctx.closePath();
      ctx.fillStyle = COLOR.bright; ctx.fill();
    });
    circle(58, y + 119, 39, null, COLOR.gold, .8);
    circle(211, y + 43, 34, null, COLOR.gold, .7);
    ctx.imageSmoothingEnabled = true;
    if (assets.earth && assets.earth.width) ctx.drawImage(assets.earth, 26, y + 87, 64, 64);
    else circle(58, y + 119, 32, COLOR.teal, COLOR.cream, .8);
    if (assets.moon && assets.moon.width) ctx.drawImage(assets.moon, 184, y + 16, 54, 54);
    else circle(211, y + 43, 27, COLOR.gold, COLOR.bright, .8);
    text('A / NEAR EARTH', 22, y + 14, 5.6, COLOR.gold);
    text('LUNA', 231, y + 91, 5.4, COLOR.dim, 'center');
    ctx.restore();
  }
  function drawDaily(view, overlay) {
    const daily = view.v2.daily || {};
    const scenes = assets.dailyScenes && assets.dailyScenes.width ? assets.dailyScenes : null;
    const offset = scenes ? 18 : 0;
    const bestScore = typeof daily.bestScore === 'number' ? daily.bestScore : null;
    const rating = { bronze: '铜级', silver: '银级', gold: '金级', none: '尚未航行' }[daily.rating] || '尚未航行';
    const target = bestScore === null || daily.rating === 'none' ? '下一目标 · 铜级 400' :
      daily.rating === 'bronze' ? '下一目标 · 银色 650' : daily.rating === 'silver' ? '下一目标 · 金色 850' : '金色已达成 · 继续刷新纪录';
    text('← 返回工作台', 16, 19, 8, COLOR.dim, 'left', 'body');
    touchRegion('backToHub', null, 10, 5, 86, 28);
    text('DAILY ROUTE / ' + (daily.date || ''), 16, 40, 6.3, COLOR.gold);
    text('每日航线', 16, 62, 24, COLOR.cream, 'left', 'title', '700');
    text((daily.pool || 'A') + ' / ' + (daily.name || '近地航行'), 16, 80, 7.5, COLOR.bright, 'left', 'body', '400', 120);
    (daily.pools || []).slice(0, 3).forEach((pool, index) => {
      button(pool.id, 'selectDailyPool', 150 + index * 38, 68, 34, 22,
        { primary: pool.id === daily.pool, size: 8, disabled: !pool.unlocked, payload: pool.id });
    });
    if (scenes) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(scenes, 37, 92, 196, 196 * 798 / 888);
    } else routeVignette(92, 156);
    text('航行时长', 16, 270 + offset, 7.2, COLOR.dim);
    text('150', 16, 298 + offset, 32, COLOR.cream, 'left', 'body', '700');
    text('秒 / 三段航道', 76, 301 + offset, 7.5, COLOR.gold);
    text('今日最佳', 254, 270 + offset, 7.2, COLOR.dim, 'right');
    text(bestScore === null ? '—' : String(bestScore), 254, 298 + offset, 30, bestScore === null ? COLOR.dim : COLOR.bright, 'right', 'body', '700');
    text(bestScore === null ? '等待首航' : rating, 254, 317 + offset, 7.2, COLOR.dim, 'right');
    line(16, 334 + offset, 254, 334 + offset, 'rgba(212,168,75,.46)', .6);
    if (daily.unlocked) {
      text(target, 16, 352 + offset, 9.2, COLOR.bright);
      text((daily.remainingRewards || 0) > 0 ? '今日可获成长 ' + daily.remainingRewards + ' 点' : '今日成长奖励已领取',
        16, 371 + offset, 7.2, COLOR.dim);
    } else text('完成 L04 · 第一脉冲后开放', 16, 352 + offset, 9.2, COLOR.bright);
    if (daily.unlocked && overlay.shareAvailable) {
      button('邀请好友 · 同一航线', 'shareCurrent', 20, 397, overlay.rankingAvailable ? 143 : 230, 26, { size: 9 });
      if (overlay.rankingAvailable) button('航道排行', 'openLeaderboard', 171, 397, 79, 26, { size: 8.5 });
    } else if (daily.unlocked && overlay.rankingAvailable) button('查看航道排行', 'openLeaderboard', 20, 397, 230, 26, { size: 9 });
    button(daily.unlocked ? (bestScore === null ? '开始每日航线' : '再次航行') : '尚未开放',
      'startDaily', 20, 434, 230, 32, { primary: true, size: 12, disabled: !daily.unlocked });
  }
  function drawMeditation(view, overlay) {
    const m = view.meditation || { duration: 300, elapsed: 0, remaining: 300, running: false, completed: false, visualTime: 0 };
    const t = Number(m.visualTime) || 0, cx = 135, cy = 200;
    rect(0, 0, W, H, '#10263A');
    text('← 返回工作台', 16, 19, 8, COLOR.dim, 'left', 'body');
    touchRegion('backToHub', null, 10, 5, 86, 28);
    if (!m.running && overlay.shareAvailable) {
      text('分享此刻 →', 254, 19, 8, COLOR.dim, 'right', 'body');
      touchRegion('shareCurrent', null, 202, 3, 58, 30);
    }
    text('QUIET ORBIT / LOW SIGNAL', 16, 40, 6.3, COLOR.gold);
    text('星空冥想', 16, 62, 24, COLOR.cream, 'left', 'title', '700');
    text('不必追上风，也不必抵达哪里', 16, 80, 7.2, COLOR.dim);
    const breathe = .5 + .5 * Math.sin(t * Math.PI / 4);
    circle(cx, cy, 116, null, 'rgba(212,168,75,' + (.22 + breathe * .2) + ')', .8);
    circle(cx, cy, 121, null, 'rgba(232,200,120,.4)', 3);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, 108, 0, Math.PI * 2); ctx.clip();
    rect(cx - 108, cy - 108, 216, 216, COLOR.navy);
    for (let i = 0; i < 55; i++) {
      const x = cx - 103 + (i * 71 % 199) / 199 * 206, y = cy - 102 + (i * 47 % 197) / 197 * 204;
      rect(x, y, i % 6 ? .55 : 1, i % 6 ? .55 : 1, i % 6 ? 'rgba(240,230,211,.18)' : 'rgba(232,200,120,.5)');
    }
    ctx.beginPath(); ctx.ellipse(cx, cy + 12, 115, 45, -.3, 0, Math.PI * 2);
    ctx.strokeStyle = COLOR.teal; ctx.lineWidth = 5; ctx.globalAlpha = .35; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.ellipse(cx, cy + 12, 115, 45, -.3, 0, Math.PI * 2);
    ctx.strokeStyle = COLOR.teal; ctx.lineWidth = .8; ctx.stroke();
    [[76, 135], [95, 118], [116, 137], [137, 108]].forEach((point, index, points) => {
      circle(point[0], point[1], 1.6, COLOR.bright);
      if (index) line(points[index - 1][0], points[index - 1][1], point[0], point[1], 'rgba(197,184,154,.45)', .5);
    });
    circle(174, 158, 50, null, 'rgba(212,168,75,.55)', .8);
    if (assets.moon && assets.moon.width) {
      ctx.imageSmoothingEnabled = true; ctx.drawImage(assets.moon, 135, 119, 78, 78);
    } else circle(174, 158, 39, COLOR.gold, COLOR.bright, .6);
    const angle = t * .09, ex = cx + Math.cos(angle) * 72, ey = cy + 34 + Math.sin(angle) * 27;
    circle(ex, ey, 28, null, COLOR.gold, .7);
    if (assets.earth && assets.earth.width) {
      ctx.imageSmoothingEnabled = true; ctx.drawImage(assets.earth, ex - 22, ey - 22, 44, 44);
    } else circle(ex, ey, 22, COLOR.teal, COLOR.cream, .6);
    ctx.restore();
    circle(cx, cy, 108, null, 'rgba(212,168,75,.65)', .8);
    if (m.running) {
      const remaining = Math.max(0, Math.ceil(Number(m.remaining) || 0));
      text('剩余 ' + Math.floor(remaining / 60) + ':' + String(remaining % 60).padStart(2, '0'), 135, 337, 9, COLOR.dim, 'center');
      text(m.phase === 'exhale' ? '缓缓呼气' : '轻轻吸气', 135, 365, 13, COLOR.cream, 'center', 'title', '700');
      button('结束并返回', 'backToHub', 20, 430, 230, 36, { primary: true, size: 11 });
      return;
    }
    text(m.completed ? '这一刻，不必抵达哪里' : '选择一段安静的时间', 135, 340, 11, COLOR.cream, 'center', 'title', '700');
    [[120, '02', 20, 59], [300, '05', 99, 137], [600, '10', 178, 215]].forEach(item => {
      const selected = Number(m.duration) === item[0];
      button(item[1] + ' 分钟', 'setMeditationDuration', item[2], 374, 77, 32,
        { primary: selected, size: 9, payload: item[0] });
    });
    text('无成绩 · 无排名 · 只保留此刻', 135, 416, 7, COLOR.dim, 'center');
    button(m.completed ? '再次停留' : '进入安静轨道', 'startMeditation', 20, 430, 230, 36, { primary: true, size: 11 });
  }
  function drawStorageError() {
    panelHeading('存档暂时无法读取', '本机进度尚未载入');
    lines('重新读取成功后，就能继续航行。\n原有进度不会被新进度覆盖。', 135, 190, 226, 11, COLOR.cream, 21, 'center', 'body');
    button('重试读取', 'retryStorage', 20, 343, 230, 38, { primary: true, size: 12 });
    button('返回封面', 'openCover', 20, 437, 230, 34, { size: 11 });
  }
  function drawGrant(view) {
    const run = view.v2.run || {}, ability = run.grantAbility || 'jet', pulse = ability === 'pulse', sail = ability === 'sail';
    rect(0, 0, W, H, 'rgba(10,20,32,.96)');
    text('发现新的航行能力', 135, 83, 13, COLOR.dim, 'center', 'body');
    abilityMark(ability, 135, 144, true);
    text(pulse ? '双脉冲 Ⅰ' : sail ? '引力帆 Ⅰ' : '喷射 Ⅰ', 135, 196, 25, COLOR.cream, 'center', 'title', '700');
    lines(pulse ? '普通恢复期间，再点按一次喷射' : sail ? '沿井外缘移动蓄力，再向外离开' : '推动摇杆，再点喷射', 135, 240, 224, 12, COLOR.bright, 18, 'center', 'body');
    lines('保存后立即获得，后续航行持续生效', 135, 268, 224, 10, COLOR.dim, 16, 'center', 'body', 2);
    if (run.grantError) lines(run.grantError, 135, 306, 224, 10, COLOR.bad, 14, 'center', 'body', 2);
    button(run.grantError ? '重试保存' : '保存并继续', 'claimAbility', 20, 352, 230, 38, { primary: true, size: 12 });
    button('回任务台', 'abandon', 20, 435, 230, 34, { size: 11 });
  }
  function drawHUD(hud) {
    if (!hud || !hud.visible) return;
    function meter(label, fraction, x, gold) {
      const color = gold ? COLOR.bright : COLOR.cream;
      line(x, 15, x + 6, 15, COLOR.cream); line(x, 15, x, 21, COLOR.cream);
      line(x, 46, x + 79, 46, 'rgba(240,230,211,.4)');
      line(x + 79, 40, x + 79, 46, COLOR.cream);
      text(label, x + 5, 23, 7.5, COLOR.cream);
      const count = Math.ceil(Math.max(0, Math.min(1, Number(fraction) || 0)) * 12);
      for (let i = 0; i < 12; i++) rect(x + 5 + i * 5.7, 33, 4.3, 8,
        i < count ? gold && i % 3 === 2 ? '#C45C4A' : color : null, 'rgba(240,230,211,.55)', .5);
    }
    meter('质量 / MASS', hud.massFraction, 15, false);
    meter('追近 / SIGNAL', hud.progressFraction, 176, true);
    text(hud.sectorName || '追逐', 135, hud.timerVisible ? 23 : 29, 7.6, COLOR.bright, 'center', 'mono', '700', 72);
    if (hud.timerVisible) text(hud.timerText, 135, 37, 9, COLOR.cream, 'center', 'mono', '700', 72);
  }
  function drawV2HUD(view) {
    const run = view.v2.run || {};
    const hud = view.hud || {};
    const daily = view.v2.mode === 'daily';
    const endless = view.v2.mode === 'endless';
    text(run.title || (daily ? '每日航行' : '循光启程'), 15, 16, 11, COLOR.bright, 'left', 'body', '700', 188);
    button('暂停', 'pauseRun', 218, 4, 39, 32, { size: 10 });
    if (endless) {
      const elapsed = Math.max(0, Math.floor(Number(run.elapsed) || 0));
      text('生存 ' + Math.floor(elapsed / 60) + ':' + String(elapsed % 60).padStart(2, '0'), 15, 42, 12, COLOR.cream, 'left', 'mono', '700');
      text('月辉 ' + (run.signals || 0), 255, 42, 11, COLOR.bright, 'right', 'body', '700');
      text('没有终点', 255, 62, 9, COLOR.dim, 'right', 'body');
    } else if (daily) {
      const remaining = Math.max(0, Math.ceil(Number(run.remaining) || 0));
      const clock = Math.floor(remaining / 60) + ':' + String(remaining % 60).padStart(2, '0');
      text('剩余 ' + clock, 15, 42, 12, COLOR.cream, 'left', 'mono', '700');
      text('得分 ' + (run.score || 0), 255, 42, 12, COLOR.bright, 'right', 'body', '700');
      text('第 ' + (run.segment || 1) + ' / 3 段', 255, 62, 10, COLOR.dim, 'right', 'body');
      line(142, 72, 255, 72, 'rgba(197,184,154,.3)', 2);
      line(142, 72, 142 + 113 * Math.max(0, Math.min(1, Number(hud.progressFraction) || 0)), 72, COLOR.gold, 2);
    } else {
      text('月辉  ' + (run.signals || 0) + ' / ' + (run.target || 0), 15, 42, 12, COLOR.bright, 'left', 'body', '700');
      text('追近', 142, 30, 8, COLOR.dim, 'left', 'body');
      line(142, 42, 255, 42, 'rgba(197,184,154,.35)', 3);
      line(142, 42, 142 + 113 * Math.max(0, Math.min(1, Number(hud.progressFraction) || 0)), 42, COLOR.gold, 3);
      const title = run.title || '';
      const objective = title.indexOf('L02') === 0 ? '岩阵 ' + Math.min(3, run.rockGroups || 0) + ' / 3' :
        title.indexOf('L03') === 0 ? '星尘 ' + Math.min(1, run.dust || 0) + ' / 1' :
          title.indexOf('L04') === 0 ? '喷射 ' + Math.min(1, run.jets || 0) + ' / 1' : '';
      if (objective) text(objective, 255, 63, 11, COLOR.dim, 'right', 'body');
    }
    if (run.showMass) {
      text('质量', 15, 63, 10, COLOR.cream, 'left', 'body');
      if (Number.isFinite(run.mass)) text(run.mass.toFixed(1), 54, 63, 11, COLOR.cream, 'left', 'mono', '700');
      line(15, 73, 96, 73, 'rgba(197,184,154,.35)', 2);
      line(15, 73, 15 + 81 * Math.max(0, Math.min(1, Number(hud.massFraction) || 0)), 73, COLOR.cream, 2);
    }
    if (run.hint && !view.toast) {
      rect(18, 77, 234, 23, 'rgba(10,20,32,.82)');
      text(run.hint, 135, 89, 11, COLOR.cream, 'center', 'body', '400', 220);
    }
  }
  function drawJetRecovery(run, controls) {
    if (!run || !controls || !controls.visible || !controls.jetVisible || controls.captureVisible) return;
    const fraction = Math.max(0, Math.min(1, 1 - (Number(run.jetCooldown) || 0) / (Number(run.jetCooldownMax) || .42)));
    ctx.beginPath(); ctx.arc(CONTROL.buttonX, CONTROL.buttonY, CONTROL.buttonRadius + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction);
    ctx.lineWidth = 2; ctx.strokeStyle = fraction >= 1 ? COLOR.bright : COLOR.rust; ctx.stroke();
    if (Number(run.pulseCooldownMax) > 0) {
      const pulseFraction = Math.max(0, Math.min(1, 1 - (Number(run.pulseCooldown) || 0) / run.pulseCooldownMax));
      ctx.beginPath(); ctx.arc(CONTROL.buttonX, CONTROL.buttonY, CONTROL.buttonRadius + 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pulseFraction);
      ctx.lineWidth = 1; ctx.strokeStyle = pulseFraction >= 1 ? COLOR.teal : COLOR.gold; ctx.stroke();
    }
    text('喷射 ' + levelText(run.jetLevel), CONTROL.buttonX, 474, 9, COLOR.dim, 'center', 'body');
  }
  function drawManualPause() {
    rect(0, 0, W, H, 'rgba(10,20,32,.93)');
    text('航行暂停', 135, 170, 22, COLOR.cream, 'center', 'title', '700');
    text('返回任务台将结束本次航行', 135, 216, 11, COLOR.dim, 'center', 'body');
    button('继续航行', 'resumeRun', 20, 286, 230, 38, { primary: true, size: 12 });
    button('回任务台', 'abandon', 20, 341, 230, 36, { size: 11 });
  }
  function drawControls(controls, stick) {
    if (!controls || !controls.visible) return;
    const s = stick || { x: CONTROL.defaultX, y: CONTROL.defaultY, dx: 0, dy: 0 };
    const x = Number.isFinite(s.x) ? s.x : CONTROL.defaultX;
    const y = Number.isFinite(s.y) ? s.y : CONTROL.defaultY;
    circle(x, y, CONTROL.radius, 'rgba(11,21,32,.35)', COLOR.cream, 1.4);
    circle(x, y, CONTROL.radius - 2, null, COLOR.gold, .5);
    ticks(x, y, CONTROL.radius + 5, 'rgba(240,230,211,.7)');
    circle(x + (s.dx || 0), y + (s.dy || 0), CONTROL.knobRadius, COLOR.cream, COLOR.gold, 1.3);
    if (controls.jetVisible || controls.captureVisible) {
      const capture = !!controls.captureVisible;
      const fill = capture ? controls.captureReady ? COLOR.bright : COLOR.cream : s.jetHeld ? COLOR.cream : 'rgba(11,21,32,.65)';
      circle(CONTROL.buttonX, CONTROL.buttonY, CONTROL.buttonRadius, fill, capture ? COLOR.gold : COLOR.cream, capture ? 2 : 1.4);
      ticks(CONTROL.buttonX, CONTROL.buttonY, CONTROL.buttonRadius + 5, 'rgba(240,230,211,.7)');
      if (!capture && !s.jetHeld) {
        ctx.save(); ctx.beginPath(); ctx.arc(CONTROL.buttonX, CONTROL.buttonY, CONTROL.buttonRadius - 2, 0, Math.PI * 2); ctx.clip();
        for (let i = -50; i < 60; i += 8) line(CONTROL.buttonX - 40 + i, CONTROL.buttonY + 35,
          CONTROL.buttonX + 30 + i, CONTROL.buttonY - 35, 'rgba(240,230,211,.18)', 1.3);
        ctx.restore();
      }
      text(capture ? '捕获' : '喷射', CONTROL.buttonX, CONTROL.buttonY, 10,
        capture || s.jetHeld ? COLOR.ink : COLOR.cream, 'center', 'body', '700');
      region(capture ? 'capture' : 'jet', undefined, CONTROL.buttonX - CONTROL.buttonRadius,
        CONTROL.buttonY - CONTROL.buttonRadius, CONTROL.buttonRadius * 2, CONTROL.buttonRadius * 2, CONTROL.buttonRadius);
    }
  }
  function pager(page, count, action, y) {
    if (count <= 1) return;
    button('上一页', action, 24, y, 70, 32, { payload: page - 1, disabled: page === 0, size: 8.6 });
    text((page + 1) + ' / ' + count, 135, y + 16, 8, COLOR.dim, 'center');
    button('下一页', action, 176, y, 70, 32, { payload: page + 1, disabled: page === count - 1, size: 8.6 });
  }
  function drawResult(view) {
    const result = view.result;
    if (!result || !Array.isArray(result.rows)) throw new TypeError('result.rows must be an array');
    panelHeading(result.title, result.description, result.color);
    const pageSize = 8;
    resultPages = Math.max(1, Math.ceil(result.rows.length / pageSize));
    resultPage = Math.min(resultPage, resultPages - 1);
    const rows = result.rows.slice(resultPage * pageSize, (resultPage + 1) * pageSize);
    const rowHeight = resultPages > 1 ? 17 : Math.min(22, 164 / Math.max(1, rows.length));
    const rowTop = 126;
    rect(22, rowTop - 10, 226, Math.max(23, rows.length * rowHeight + 3), 'rgba(14,28,44,.85)', 'rgba(240,230,211,.3)', .6);
    rows.forEach((row, index) => {
      const y = rowTop + index * rowHeight;
      if (index) line(28, y - rowHeight / 2, 242, y - rowHeight / 2, 'rgba(240,230,211,.12)', .5);
      text(row.label, 30, y, 8.6, COLOR.dim, 'left', 'mono', '400', 108);
      const tone = row.tone === 'gold' ? COLOR.bright : row.tone === 'ok' ? COLOR.teal : row.tone === 'bad' ? COLOR.bad : COLOR.cream;
      text(row.value, 240, y, 9, tone, 'right', 'mono', '700', 105);
    });
    if (resultPages > 1) pager(resultPage, resultPages, 'uiResultPage', 268);
    lines(result.rankText, 135, 313, 228, 8.5, COLOR.bright, 13, 'center', 'body', 2);
    button(result.nextLabel || '再来一局', 'retry', 22, 354, 226, 32, { primary: true });
    button('成绩卡分享', 'openCard', 22, 392, 226, 32);
    button('本机榜单', 'openBoard', 22, 430, 108, 32, { size: 9 });
    button('回任务面板', 'home', 140, 430, 108, 32, { size: 9 });
  }
  function drawV2Result(view, overlay) {
    const result = view.v2.result || {};
    const rows = Array.isArray(result.rows) ? result.rows : [];
    const awaitingSave = !!(result.savePending || result.saveError);
    const endless = result.kind === 'endless';
    text(result.title || (result.completed ? '航程已完成' : '本次航行结束'), 135, 39, 22, COLOR.cream, 'center', 'title', '700', 238);
    lines(result.subtitle, 135, 75, 230, 11, COLOR.dim, 15, 'center', 'body', 2);
    line(20, 103, 250, 103, COLOR.gold);
    resultPages = Math.max(1, Math.ceil(rows.length / 6));
    resultPage = Math.min(resultPage, resultPages - 1);
    rows.slice(resultPage * 6, (resultPage + 1) * 6).forEach((row, index) => {
      const y = 123 + index * 22;
      text(row.label, 24, y, 10, COLOR.dim, 'left', 'body', '400', 110);
      text(row.value, 246, y, 11, COLOR.cream, 'right', 'body', '700', 109);
      line(24, y + 11, 246, y + 11, 'rgba(197,184,154,.15)');
    });
    if (resultPages > 1) pager(resultPage, resultPages, 'uiResultPage', 244);
    else text(result.recordText || '本次航行记录仅存本机', 135, 255, 10, COLOR.dim, 'center', 'body', '400', 230);
    rect(20, 282, 230, 52, 'rgba(61,139,122,.12)', 'rgba(197,184,154,.4)', .6);
    text(endless ? '本机纪录' : '成长点', 30, 297, 11, COLOR.cream, 'left', 'body');
    text(endless ? (awaitingSave ? '待保存' : result.bestText || '—') : awaitingSave ? '待保存' : '+' + (result.reward || 0) + '  /  余额 ' + (result.points || 0), 240, 297, 11,
      awaitingSave ? COLOR.dim : COLOR.bright, 'right', 'body', '700');
    text(endless ? (result.newBest ? '新的最长追寻' : '不发放成长点') : result.abilityText || '能力成长跨局保留', 30, 318, 10, COLOR.dim, 'left', 'body', '400', 210);
    if (result.saveError) text(result.saveError, 135, 346, 10, COLOR.bad, 'center', 'body', '400', 230);
    button(result.saveError ? '重试保存' : result.savePending ? '正在保存…' : result.nextLabel || '再来一局',
      result.saveError ? 'retrySave' : 'retry', 20, 358, 230, 36,
      { primary: true, size: 12, disabled: !!result.savePending && !result.saveError });
    button('成绩卡分享', 'openCard', 20, 402, 110, 34, { size: 11, disabled: awaitingSave });
    button(overlay.rankingAvailable && (result.kind === 'daily' || endless) ? '航道排行' : '能力成长',
      overlay.rankingAvailable && (result.kind === 'daily' || endless) ? 'openLeaderboard' : 'openGrowth',
      140, 402, 110, 34, { size: 11, disabled: awaitingSave });
    button('回任务台', 'backToHub', 20, 446, 230, 34, { size: 11, disabled: awaitingSave });
  }
  function drawLeaderboard(view, overlay) {
    const board = view.leaderboard || {}, route = board.context || {};
    const friend = board.scope === 'friends';
    text('← 返回', 16, 21, 8, COLOR.dim, 'left', 'body');
    touchRegion('closeLeaderboard', null, 8, 5, 74, 30);
    text('FLIGHT REGISTER / SOL III', 254, 21, 5.6, COLOR.gold, 'right');
    text('航道记录', 135, 51, 23, COLOR.cream, 'center', 'title', '700');
    text(route.mode === 'endless' ? '无尽追寻 · 生存时间' : (route.date || '') + ' · ' + (route.pool || 'A') + ' 池',
      135, 74, 8.5, COLOR.dim, 'center', 'body');
    const worldEnabled = board.worldEnabled || board.preview, friendEnabled = board.friendEnabled || board.preview;
    if (worldEnabled && friendEnabled) {
      button('世界航线', 'selectLeaderboardScope', 20, 88, 110, 28, { primary: !friend, payload: 'world', size: 9 });
      button('同航好友', 'selectLeaderboardScope', 140, 88, 110, 28, { primary: friend, payload: 'friends', size: 9 });
    } else text(friend ? 'AUTHORIZED FRIENDS' : 'WORLD FLIGHT LOG', 135, 101, 7, COLOR.gold, 'center');
    if (board.preview) text('预览演示 · 非真实排名', 135, 122, 7.6, COLOR.bright, 'center', 'body');
    const nativeFriend = friend && board.status === 'ready' && overlay.rankingCanvas && !board.preview;
    if (nativeFriend) {
      rect(20, 127, 230, 225, COLOR.navy, COLOR.gold, .7);
      ctx.drawImage(overlay.rankingCanvas, 20, 127, 230, 225);
    } else {
      rect(20, 132, 230, 231, 'rgba(10,20,32,.35)', 'rgba(212,168,75,.4)', .7);
      const rows = Array.isArray(board.rows) ? board.rows.slice(0, 7) : [];
      rows.forEach((entry, index) => {
        const y = 150 + index * 29;
        text(String(entry.rank).padStart(2, '0'), 29, y, 9, index === 0 ? COLOR.bright : COLOR.dim);
        text(entry.name, 58, y, 9.2, index === 0 ? COLOR.bright : COLOR.cream, 'left', 'body', '400', 124);
        const metric = route.mode === 'endless' ? Math.floor(entry.value / 60000) + ':' + String(Math.floor(entry.value / 1000) % 60).padStart(2, '0') : String(entry.value);
        text(metric, 241, y, 11, COLOR.bright, 'right', 'mono', '700', 63);
        line(28, y + 13, 242, y + 13, 'rgba(197,184,154,.16)', .5);
      });
      if (!rows.length) {
        circle(135, 201, 30, null, 'rgba(212,168,75,.26)', .7);
        circle(135, 201, 19, null, 'rgba(212,168,75,.18)', .5);
        line(112, 201, 158, 201, 'rgba(212,168,75,.35)', .5);
        lines(board.message || '正在读取航道记录', 135, 260, 208, 10, COLOR.dim, 15, 'center', 'body', 3);
      }
    }
    if (rowsWithData(board) && board.selfRank) text('你的服务端名次  #' + board.selfRank, 135, 381, 9.5, COLOR.bright, 'center', 'body');
    const note = board.preview ? '示意数据 · 不会上传成绩' : nativeFriend ? '好友数据由微信开放数据域绘制' : board.scope === 'world' ? '同日同池同规则 · 永久成长直接计入' : board.message;
    if (board.status === 'error' || board.status === 'unavailable') button('重新读取', 'retryLeaderboard', 65, 393, 140, 30, { size: 9 });
    else lines(note || '本机纪录始终保留', 135, nativeFriend ? 375 : 395, 226, 8, COLOR.dim, 12, 'center', 'body', 2);
    button('返回航行', 'closeLeaderboard', 20, 440, 230, 32, { primary: true, size: 11 });
  }
  function rowsWithData(board) { return board.status === 'ready' && Array.isArray(board.rows) && board.rows.length > 0; }
  function drawBoard(view) {
    const board = view.board;
    if (!board || !Array.isArray(board.entries)) throw new TypeError('board.entries must be an array');
    panelHeading('本机榜单', '仅存本机 · 微信可能清空缓存');
    const pageSize = 6;
    boardPages = Math.max(1, Math.ceil(board.entries.length / pageSize));
    boardPage = Math.min(boardPage, boardPages - 1);
    const entries = board.entries.slice(boardPage * pageSize, (boardPage + 1) * pageSize);
    if (!entries.length) text('还没有成绩，先跑一局', 135, 214, 10, COLOR.dim, 'center', 'body');
    entries.forEach((entry, index) => {
      const y = 122 + index * 33;
      line(22, y + 21, 248, y + 21, 'rgba(240,230,211,.16)', .5);
      text(entry.rank, 24, y, 9, COLOR.dim, 'left');
      text(entry.title, 47, y, 9, entry.color || COLOR.cream, 'left', 'body', '400', 144);
      text(entry.score, 246, y, 10, COLOR.bright, 'right', 'mono', '700', 45);
      text([entry.label, entry.timeText, entry.assisted ? '已续玩' : ''].filter(Boolean).join(' · '), 47, y + 13,
        7, COLOR.dim, 'left', 'mono', '400', 198);
    });
    pager(boardPage, boardPages, 'uiBoardPage', 338);
    lines(board.dailyText, 135, 388, 226, 8.5, COLOR.dim, 13, 'center', 'body', 3);
    button('返回结算', 'backFromBoard', 22, 435, 226, 32);
  }
  function drawCard(view, overlay) {
    // The entry point draws core.drawShareCard into SHARE_CARD_RECT immediately
    // before this overlay. Keep this rectangle transparent and full-resolution.
    if (view.v2 && view.v2.mode !== 'classic') {
      text('航行海报 · 分享不产生奖励', 135, 356, 8, COLOR.dim, 'center', 'body');
      lines(overlay.shareMessage || (overlay.shareAvailable ? '与同航的人，分享这一刻' : '此环境可系统截屏分享'), 135, 376, 226, 8.2, COLOR.dim, 12, 'center', 'body', 2);
      button('微信分享', 'shareCurrent', 22, 395, 226, 32, { primary: true, size: 11, disabled: !overlay.shareAvailable });
      button('返回结算', 'backFromCard', 22, 440, 226, 30, { size: 10 });
      return;
    }
    text('系统截屏即可分享 · 无外链', 135, 356, 8, COLOR.dim, 'center', 'body');
    if (shareTextVisible) {
      rect(18, 364, 234, 55, COLOR.navy, COLOR.gold, .6);
      lines(view.share && view.share.text, 27, 375, 216, 7.2, COLOR.cream, 9.5, 'left', 'body', 5);
    }
    button(shareTextVisible ? '收起分享文案' : '查看分享文案', 'uiToggleShareText', 22, 427, 137, 32, { size: 9 });
    button('返回结算', 'backFromCard', 167, 427, 81, 32, { size: 8.5 });
  }
  function drawRevive(view, overlay) {
    rect(0, 0, W, H, 'rgba(10,20,32,.9)');
    panelHeading('追逐尚未结束', '月亮还在前方');
    text('观看视频，继续追逐', 135, 172, 15, COLOR.bright, 'center', 'title', '700');
    lines(view.v2 && view.v2.mode === 'campaign' ? '恢复本关质量 · 保留航程与教学进度\n每局仅一次 · 不更新本关最佳用时' : '恢复质量 · 保留追近进度\n每局仅一次 · 续玩成绩不计榜', 135, 208, 226, 10, COLOR.cream, 19, 'center', 'body');
    button(overlay.adBusy ? '视频准备中…' : '观看视频，继续追逐', 'watchAd', 22, 288, 226, 36,
      { primary: true, disabled: !!overlay.adBusy, payload: view.revive.offerId, size: 11 });
    lines(overlay.adMessage || '完整观看后获得一次续玩', 135, 342, 226, 8.5, COLOR.dim, 13, 'center', 'body', 3);
    button('结束本局', 'declineRevive', 22, 396, 108, 34, { payload: view.revive.offerId, size: 10 });
    button('重新开始', 'retry', 140, 396, 108, 34, { size: 10 });
    button('回任务面板', 'home', 22, 438, 226, 32, { size: 10 });
  }
  function drawOverlay(view, overlayOptions) {
    if (!view || typeof view.screen !== 'string') throw new TypeError('UI view.screen must be a string');
    const overlay = overlayOptions || {};
    if (lastScreen !== view.screen) {
      boardPage = resultPage = 0; shareTextVisible = false; mapChapter = 0; lastScreen = view.screen;
    }
    regions = [];
    ctx.save();
    ctx.globalAlpha = 1;
    const expanded = view.v2 && view.v2.mode !== 'classic';
    if (view.screen === 'cover') drawCover();
    else if (view.screen === 'storageError' || (view.screen === 'title' && view.v2 && view.v2.storageError)) drawStorageError();
    else if ((view.screen === 'menu' || view.screen === 'title') && view.v2) drawHub(view);
    else if (view.screen === 'menu' || view.screen === 'title' || view.screen === 'classic') drawMenu(view);
    else if (view.screen === 'map') drawMap(view);
    else if (view.screen === 'growth') drawGrowth(view);
    else if (view.screen === 'dailyBrief') drawDaily(view, overlay);
    else if (view.screen === 'meditation') drawMeditation(view, overlay);
    else if (view.screen === 'leaderboard') drawLeaderboard(view, overlay);
    else if (view.screen === 'grant') drawGrant(view);
    else if (view.screen === 'result') { if (expanded) drawV2Result(view, overlay); else drawResult(view); }
    else if (view.screen === 'board') drawBoard(view);
    else if (view.screen === 'card') drawCard(view, overlay);
    else {
      if (expanded && view.screen === 'play') drawV2HUD(view);
      else drawHUD(view.hud);
      drawControls(view.controls, overlay.stick);
      if (expanded) drawJetRecovery(view.v2.run, view.controls);
      if (view.screen === 'intro') {
        const intro = view.intro || {};
        ctx.globalAlpha = Math.max(0, Math.min(1, intro.opacity === undefined ? 1 : intro.opacity));
        lines(intro.text, 135, 342, 236, 11, COLOR.cream, 20, 'center', 'body', 4);
        ctx.globalAlpha = 1;
        button('跳过', 'skipIntro', 99, 424, 72, 32, { size: 10 });
      }
      // Capture count, combo, timing feedback and tutorial belong to core's
      // drawQTE; this layer only adds the same HUD and thumb controls as play.
    }
    if (view.revive && view.revive.eligible) {
      regions = [];
      drawRevive(view, overlay);
    }
    if (view.toast && view.screen !== 'grant' && !(expanded && view.screen === 'result') && !view.manualPaused) {
      const message = typeof view.toast === 'string' ? view.toast : view.toast.text;
      const toastLines = wrap(message, 218, 9);
      const count = Math.min(3, toastLines.length);
      rect(18, 108, 234, 18 + count * 14, 'rgba(10,20,32,.95)', COLOR.gold, .65);
      toastLines.slice(0, 3).forEach((row, index) => text(row, 135, 123 + index * 14, 9, COLOR.bright, 'center', 'body'));
    }
    if (view.manualPaused && view.screen === 'play') {
      regions = [];
      drawManualPause();
    }
    ctx.restore();
  }
  function hitTest(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > W || y < 0 || y > H) return null;
    for (let i = regions.length - 1; i >= 0; i--) {
      const area = regions[i];
      if (x < area.x || x > area.x + area.w || y < area.y || y > area.y + area.h) continue;
      if (area.radius && Math.hypot(x - area.x - area.radius, y - area.y - area.radius) > area.radius) continue;
      return { action: area.action, payload: area.payload };
    }
    return null;
  }
  function handleAction(action, payload) {
    if (action === 'uiBoardPage') boardPage = Math.max(0, Math.min(boardPages - 1, Number(payload) || 0));
    else if (action === 'uiResultPage') resultPage = Math.max(0, Math.min(resultPages - 1, Number(payload) || 0));
    else if (action === 'uiToggleShareText') shareTextVisible = !shareTextVisible;
    else if (action === 'uiSelectGrowthAbility') { selectedGrowthAbility = String(payload || 'jet'); return true; }
    else if (action === 'uiMapChapter') { mapChapter = Number(payload) || 1; return true; }
    else return false;
    return true;
  }
  return { drawBackground, drawOverlay, hitTest, handleAction, setViewport };
}

module.exports = createUI;
module.exports.createUI = createUI;
module.exports.SHARE_CARD_RECT = SHARE_CARD_RECT;
