'use strict';

function createSharing(options) {
  const wx = options.wx;
  const available = !!(wx && typeof wx.shareAppMessage === 'function');
  const fonts = options.fonts || {};
  let cardCanvas = null, bannerCanvas = null, preparedKey = '', failedKey = '', imageUrl = '', printing = null, message = '';

  function contentKey(content) {
    return JSON.stringify({ title: content.title, query: content.query, score: content.score, subtitle: content.subtitle });
  }
  function print(game, content) {
    cardCanvas = cardCanvas || options.createCanvas();
    bannerCanvas = bannerCanvas || options.createCanvas();
    cardCanvas.width = 540; cardCanvas.height = 860;
    const card = cardCanvas.getContext('2d');
    if (!card) throw new Error('Share canvas unavailable');
    game.drawShareCard(card, 540, 860);
    bannerCanvas.width = 500; bannerCanvas.height = 400;
    const g = bannerCanvas.getContext('2d');
    if (!g) throw new Error('Share canvas unavailable');
    g.fillStyle = '#0C1D30'; g.fillRect(0, 0, 500, 400);
    g.fillStyle = '#E8DCC8'; g.fillRect(0, 0, 8, 400);
    g.strokeStyle = '#D4A84B'; g.lineWidth = 1; g.strokeRect(16, 16, 468, 368);
    g.fillStyle = '#D97B3A'; g.fillRect(32, 25, 176, 4);
    g.drawImage(cardCanvas, 32, 34, 176, 280);
    g.strokeRect(32, 34, 176, 280);
    g.fillStyle = '#E8C878'; g.font = '16px ' + (fonts.display || fonts.mono || 'monospace');
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('CHASE THE MOON', 229, 54, 238);
    g.fillStyle = '#F0E6D3'; g.font = '700 28px ' + (fonts.title || 'serif');
    const title = content.mode === 'daily' ? '今日航线' : content.mode === 'endless' ? '无尽追寻' : content.mode === 'meditation' ? '星空冥想' : '逐月计划';
    g.fillText(title, 229, 101, 238);
    g.fillStyle = '#D97B3A'; g.fillRect(230, 131, 46, 3);
    const metric = typeof content.score === 'number' ? (content.mode === 'daily' ? String(content.score) : Math.floor(content.score / 60) + ':' + String(Math.floor(content.score % 60)).padStart(2, '0')) : '150';
    g.fillStyle = '#E8C878'; g.font = '700 49px ' + (fonts.mono || 'monospace'); g.fillText(metric, 228, 188, 238);
    g.fillStyle = '#C5B89A'; g.font = '14px ' + (fonts.mono || 'monospace');
    g.fillText(content.mode === 'daily' && typeof content.score === 'number' ? 'SCORE / 今日得分' : content.mode === 'endless' ? 'SURVIVAL / 生存时间' : 'ONE UNIVERSE / 逐月计划', 230, 230, 238);
    g.font = '15px ' + (fonts.title || 'serif');
    const subtitle = content.mode === 'daily' ? '同一条航线，等待你的启航。' : content.mode === 'endless' ? '没有终点，继续向前。' : content.mode === 'meditation' ? '在星际之间，停留片刻。' : '航程已在星图上点亮。';
    g.fillText(subtitle, 229, 273, 238);
    g.fillStyle = '#D4A84B'; g.fillRect(32, 341, 436, 1);
    g.font = '12px ' + (fonts.mono || 'monospace'); g.fillText('SOL III / AD LUNAM', 32, 363);
    g.textAlign = 'right'; g.fillText('复古未来 · 宇宙航行', 468, 363);
  }
  function prepare(game) {
    const content = game && game.getShareContent ? game.getShareContent() : null;
    if (!content || !available || typeof options.createCanvas !== 'function') return Promise.resolve(false);
    const key = contentKey(content);
    if (preparedKey === key && imageUrl) return Promise.resolve(true);
    if (printing) return printing;
    const task = new Promise(resolve => {
      let canvas;
      try { print(game, content); canvas = bannerCanvas; }
      catch (_) { imageUrl = ''; preparedKey = ''; failedKey = key; resolve(false); return; }
      function done(path) { imageUrl = path || ''; preparedKey = path ? key : ''; failedKey = path ? '' : key; resolve(!!path); }
      try {
        if (typeof canvas.toTempFilePath !== 'function') { done(''); return; }
        canvas.toTempFilePath({ x: 0, y: 0, width: 500, height: 400, destWidth: 500, destHeight: 400,
          fileType: 'png', success: result => done(result && result.tempFilePath), fail: () => done('') });
      } catch (_) { done(''); }
    });
    printing = task;
    task.then(() => { if (printing === task) printing = null; });
    return task;
  }
  function share(game) {
    const content = game && game.getShareContent ? game.getShareContent() : null;
    if (!available || !content) { message = '此环境暂不支持微信分享'; return { status: 'unavailable' }; }
    const key = contentKey(content);
    if (preparedKey !== key || !imageUrl) {
      if (failedKey !== key) {
        prepare(game);
        message = '正在印制分享海报，请稍候再点';
        return { status: 'preparing' };
      }
    }
    try {
      const settings = { title: String(content.title).slice(0, 180), query: content.query || '' };
      if (preparedKey === key && imageUrl) settings.imageUrl = imageUrl;
      wx.shareAppMessage(settings);
      message = '已打开微信分享';
      return { status: 'opened' };
    } catch (_) { message = '暂时无法打开微信分享，请稍后重试'; return { status: 'unavailable' }; }
  }
  return { available, prepare, share, getState() { return { message, ready: !!imageUrl, busy: !!printing }; } };
}
module.exports = { createSharing };
