'use strict';

function createFriendRanking(wx) {
  const canvas = wx.getSharedCanvas();
  const ctx = canvas.getContext('2d');
  let sequence = 0;
  function write(value, x, y, size, color, align, family) {
    ctx.fillStyle = color; ctx.font = size + 'px ' + (family || 'monospace');
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(String(value), x, y);
  }
  function line(y) {
    ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(682, y);
    ctx.strokeStyle = 'rgba(212,168,75,.28)'; ctx.lineWidth = 1; ctx.stroke();
  }
  function background() {
    ctx.fillStyle = '#0C1D30'; ctx.fillRect(0, 0, 714, 700);
    ctx.strokeStyle = '#D4A84B'; ctx.lineWidth = 1; ctx.strokeRect(12, 12, 690, 676);
    write('好友航线记录', 34, 50, 31, '#F0E6D3', 'left', 'serif');
    write('FRIEND FLIGHT LOG', 680, 51, 17, '#D4A84B', 'right');
    ctx.fillStyle = '#D97B3A'; ctx.fillRect(34, 80, 76, 4); line(98);
  }
  function message(text, subtext) {
    background(); write(text, 357, 327, 26, '#C5B89A', 'center', 'serif');
    write(subtext || '', 357, 372, 18, '#C5B89A', 'center');
  }
  function validKey(key) {
    return typeof key === 'string' && key.length <= 128 && /^moon\.(daily\.\d{4}-\d{2}-\d{2}\.[ABC]|endless)\.[A-Za-z0-9_.-]{1,64}$/.test(key);
  }
  function read(entry, key, mode) {
    if (!entry || typeof entry.nickname !== 'string' || !entry.nickname.trim() || /[\u0000-\u001f\u007f]/.test(entry.nickname) || !Array.isArray(entry.KVDataList)) return null;
    const item = entry.KVDataList.find(value => value && value.key === key && typeof value.value === 'string');
    if (!item || item.value.length > 1024) return null;
    let data;
    try { data = JSON.parse(item.value); } catch (_) { return null; }
    if (!data || data.v !== 1 || !Number.isInteger(data.value) || data.value < (mode === 'daily' ? 0 : 1) ||
        data.value > (mode === 'daily' ? 1050 : 36000000)) return null;
    return { name: Array.from(entry.nickname.trim()).slice(0, 24).join(''), value: data.value };
  }
  function draw(rows, mode, limit) {
    background();
    if (!rows.length) { message('还没有同玩好友的这条航线纪录', '完成航行后，再来看看新的航迹'); return; }
    rows.slice(0, limit).forEach((entry, index) => {
      const y = 150 + index * 78;
      write(String(index + 1).padStart(2, '0'), 38, y, 26, index === 0 ? '#E8C878' : '#C5B89A');
      write(entry.name, 105, y, 28, index === 0 ? '#E8C878' : '#F0E6D3', 'left', 'serif');
      const metric = mode === 'daily' ? entry.value + ' 分' : Math.floor(entry.value / 60000) + ':' + String(Math.floor(entry.value / 1000) % 60).padStart(2, '0');
      write(metric, 680, y, 29, '#E8C878', 'right');
      line(y + 35);
    });
    write('WECHAT FRIEND DATA / AUTHORIZED', 34, 663, 15, '#C5B89A');
  }
  function render(command) {
    if (!command || command.type !== 'moon-rank' || !validKey(command.key) || ['daily', 'endless'].indexOf(command.mode) < 0) return;
    const id = ++sequence, key = command.key, mode = command.mode;
    const limit = Math.max(1, Math.min(7, Number(command.limit) || 7));
    message('正在接收同航好友的记录…', '好友数据只在开放数据域中绘制');
    try {
      wx.getFriendCloudStorage({ keyList: [key], success(result) {
        if (id !== sequence) return;
        const rows = (result && Array.isArray(result.data) ? result.data : []).map(entry => read(entry, key, mode)).filter(Boolean);
        rows.sort((a, b) => b.value - a.value || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        draw(rows, mode, limit);
      }, fail() { if (id === sequence) message('暂时无法读取好友成绩', '请稍后返回工作台，再重新进入'); } });
    } catch (_) { message('暂时无法读取好友成绩', '请稍后返回工作台，再重新进入'); }
  }
  wx.onMessage(render);
  return { render };
}
module.exports = { createFriendRanking };
