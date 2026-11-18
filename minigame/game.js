'use strict';

const { start } = require('./src/runtime');
const config = require('./config');

// No credentials or simulated ad SDK belong in the deployable game.
start(wx, config).catch(function (error) {
  if (typeof wx.showModal === 'function') {
    wx.showModal({ title: '任务准备失败', content: '游戏资源未能完整加载，请退出后重新进入。', showCancel: false });
  }
  console.error('[moon] startup_failed', error && error.stack ? error.stack : error);
});
