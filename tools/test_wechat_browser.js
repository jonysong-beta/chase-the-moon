'use strict';

// Optional integration check using an already installed Playwright and Chrome.
// No package install, browser download, external server or account is required.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.MOON_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, '.playwright-cli', 'wechat-v2');
fs.mkdirSync(artifacts, { recursive: true });
const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch (_) { response.writeHead(400).end(); return; }
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(data);
  });
});

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ headless: true, executablePath: process.env.MOON_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/tools/preview_wechat.html');
    await page.waitForFunction(() => window.__wechatPreview, { timeout: 20000 });
    const state = () => page.evaluate(() => window.__wechatPreview.app.game.getView());
    const waitScreen = screen => page.waitForFunction(value => window.__wechatPreview.app.game.getView().screen === value, screen);
    async function settle() { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
    async function clickAction(action) {
      await settle();
      const point = await page.evaluate(name => {
        const app = window.__wechatPreview.app;
        const hits = [];
        for (let y = 2; y < 480; y += 4) for (let x = 2; x < 270; x += 4) {
          const hit = app.ui.hitTest(x, y);
          if (hit && hit.action === name) hits.push({ x, y });
        }
        if (!hits.length) return null;
        // Pick the centre of one connected button; a boundary pixel can round
        // outside the target when converting through CSS scale.
        const middle = hits[Math.floor(hits.length / 2)];
        const row = hits.filter(hit => hit.y === middle.y && Math.abs(hit.x - middle.x) < 240);
        const logical = row[Math.floor(row.length / 2)], v = app.platform.getViewport();
        const rect = app.platform.canvas.getBoundingClientRect();
        return { x: rect.left + v.x + logical.x * v.scale, y: rect.top + v.y + logical.y * v.scale };
      }, action);
      assert.ok(point, 'Action must have a visible hit area: ' + action);
      await page.touchscreen.tap(point.x, point.y);
    }
    async function keyShot(name) {
      await settle();
      // One cropped image per deliberate checkpoint, below 1024 CSS px wide.
      const clip = await page.evaluate(() => {
        const app = window.__wechatPreview.app, v = app.platform.getViewport();
        const rect = app.platform.canvas.getBoundingClientRect();
        return { x: rect.left + v.x, y: rect.top + v.y, width: v.gameWidth, height: v.gameHeight };
      });
      await page.screenshot({ path: path.join(artifacts, name + '.png'), clip });
    }
    assert.equal((await state()).screen, 'cover');
    await keyShot('cover');
    await clickAction('openMenu'); await waitScreen('title');
    await keyShot('menu');
    await clickAction('openClassic'); await waitScreen('classic');
    await clickAction('start'); await waitScreen('intro');
    await clickAction('skipIntro'); await waitScreen('play');
    await page.evaluate(() => window.__wechatPreview.app.game.debug.fail('验证偏航'));
    await waitScreen('revive');
    await clickAction('watchAd');
    const adCheckpoint = await page.evaluate(() => ({
      ad: window.__wechatPreview.app.getAdState(),
      revive: window.__wechatPreview.app.game.getReviveOffer(),
      overlay: getComputedStyle(document.getElementById('ad-overlay')).display
    }));
    assert.equal(adCheckpoint.overlay, 'flex', 'Ad display checkpoint: ' + JSON.stringify(adCheckpoint));
    await page.locator('#ad-cancel').click();
    await page.waitForFunction(() => !window.__wechatPreview.app.getAdState().busy);
    assert.equal((await state()).screen, 'revive');
    assert.equal((await state()).revive.used, false);
    await clickAction('watchAd');
    await page.locator('#ad-complete').click();
    await waitScreen('play');
    assert.equal((await state()).result.assisted, true);
    await page.evaluate(() => window.__wechatPreview.emit('Hide'));
    const paused = await page.evaluate(() => window.__wechatPreview.app.game.debug.state().runT);
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__wechatPreview.app.game.debug.state().runT), paused);
    await page.evaluate(() => window.__wechatPreview.emit('Show'));
    await page.evaluate(() => window.__wechatPreview.app.game.debug.fail('验证第二次失败'));
    await waitScreen('result');
    assert.equal((await state()).board.entries.length, 0, 'Assisted run must not enter leaderboard');
    await clickAction('retry'); await waitScreen('play');
    await page.evaluate(() => window.__wechatPreview.app.game.debug.enterCapture());
    await waitScreen('qte');
    await keyShot('qte');
    await page.evaluate(() => window.__wechatPreview.app.game.debug.finishCapture(true));
    await waitScreen('result');
    assert.equal((await state()).board.entries.length, 1);
    await keyShot('result');
    await clickAction('openCard'); await waitScreen('card');
    await keyShot('card');
    await clickAction('backFromCard'); await waitScreen('result');
    await clickAction('home'); await waitScreen('title');
    await clickAction('openClassic'); await waitScreen('classic');
    await clickAction('start'); await waitScreen('intro');
    await clickAction('skipIntro'); await waitScreen('play');
    await page.selectOption('#ad-mode', 'unavailable');
    await page.evaluate(() => window.__wechatPreview.app.game.debug.fail('验证无广告'));
    await waitScreen('revive');
    await clickAction('watchAd');
    await page.waitForFunction(() => !window.__wechatPreview.app.getAdState().busy);
    assert.equal((await state()).screen, 'revive');
    assert.match(await page.evaluate(() => window.__wechatPreview.app.getAdState().message), /暂无/);
    await clickAction('home'); await waitScreen('title');
    // V2 actual authored routes, driven through the same multi-touch adapter.
    await clickAction('openCampaign'); await waitScreen('map');
    await keyShot('v2-map-new');
    await clickAction('startCampaign'); await waitScreen('play');
    await keyShot('v2-l01');
    async function pilot(seconds) {
      await settle();
      return page.evaluate(maxSeconds => {
        const preview = window.__wechatPreview, app = preview.app, game = app.game;
        const v = app.platform.getViewport();
        const point = (id, x, y) => ({ identifier: id, clientX: v.x + x * v.scale, clientY: v.y + y * v.scale });
        let stick = point(701, 60, 420);
        preview.emit('TouchStart', { changedTouches: [stick], touches: [stick] });
        for (let i = 0; i < maxSeconds * 30; i++) {
          const s = game.debug.state();
          if (s.state !== 'play') break;
          const bodies = s.bodies.filter(b => b.type === 'signal' || (b.type === 'dust' && s.v2.levelId === 'L03' && !s.v2.dust));
          const target = bodies.sort((a, b) => a.z - b.z)[0];
          let x = 135, y = 320;
          if (target) {
            const t = Math.max(0, Math.min(1.2, 1 - target.z));
            x = 135 + target.lx * 108 * t;
            y = Math.max(110, Math.min(345, 76.8 + 268.8 * t + target.ly * 82 * t));
          }
          let dx = x - s.earth.x, dy = y - s.earth.y;
          const len = Math.hypot(dx, dy), strength = Math.min(1, len / 24);
          const travel = 2.16 + (28.8 - 2.16) * Math.pow(strength, 1 / 1.1);
          stick = point(701, 60 + (len ? dx / len : 0) * travel, 420 + (len ? dy / len : 0) * travel);
          preview.emit('TouchMove', { changedTouches: [stick], touches: [stick] });
          if (s.v2.abilities.jet && !s.v2.jets && len > 12) {
            const jet = point(702, 230, 431);
            preview.emit('TouchStart', { changedTouches: [jet], touches: [stick, jet] });
            preview.emit('TouchEnd', { changedTouches: [jet], touches: [stick] });
          }
          game.update(1 / 30);
        }
        preview.emit('TouchEnd', { changedTouches: [stick], touches: [] });
        const s = game.debug.state();
        return { screen: s.state, outcome: s.outcome, level: s.v2.levelId, time: s.runT, signals: s.v2.signals, mass: s.earth.mass };
      }, seconds);
    }
    const clears = [];
    for (const id of ['L01', 'L02', 'L03', 'L04']) {
      if (id === 'L01') { await pilot(12); await keyShot('v2-l01-route'); }
      let outcome = await pilot(180);
      if (outcome.screen === 'grant') {
        await settle(); await keyShot('v2-jet-grant');
        await clickAction('claimAbility'); await waitScreen('play');
        await keyShot('v2-l04'); await pilot(16); await keyShot('v2-l04-route'); outcome = await pilot(180);
      }
      assert.equal(outcome.screen, 'result', id + ' actual touch route: ' + JSON.stringify(outcome));
      assert.equal(outcome.outcome, 'complete', id + ' actual touch clear'); clears.push(outcome);
      assert.equal((await state()).v2.result.savePending, false);
      if (id !== 'L04') { await clickAction('retry'); await waitScreen('play'); }
    }
    assert.equal((await state()).v2.growth.points, 8);
    await keyShot('v2-chapter-result');
    await clickAction('openCard'); await waitScreen('card'); await keyShot('v2-share');
    await clickAction('backFromCard'); await waitScreen('result');
    await clickAction('openGrowth'); await waitScreen('growth'); await keyShot('v2-growth-before');
    await clickAction('upgradeAbility'); await settle();
    assert.equal((await state()).v2.growth.abilities[0].level, 2);
    assert.equal((await state()).v2.growth.points, 4);
    await page.evaluate(() => window.__wechatPreview.app.game.update(2)); await keyShot('v2-growth-ii');
    await clickAction('backToHub'); await waitScreen('title'); await keyShot('v2-hub-complete');
    await clickAction('openDaily'); await waitScreen('dailyBrief'); await keyShot('v2-daily-brief');
    await clickAction('startDaily'); await waitScreen('play');
    assert.equal((await state()).v2.run.jetLevel, 2);
    await clickAction('pauseRun'); await settle();
    assert.equal((await state()).manualPaused, true); await keyShot('v2-pause');
    const dailyTime = await page.evaluate(() => window.__wechatPreview.app.game.debug.state().runT);
    await page.evaluate(() => window.__wechatPreview.app.game.update(50));
    assert.equal(await page.evaluate(() => window.__wechatPreview.app.game.debug.state().runT), dailyTime);
    await clickAction('resumeRun'); await settle(); await keyShot('v2-daily-play');
    await pilot(160); await waitScreen('result');
    const firstDaily = (await state()).v2.result;
    assert.equal(firstDaily.completed, true); assert.equal(firstDaily.savePending, false);
    assert.ok(firstDaily.reward >= 2 && firstDaily.reward <= 5); await keyShot('v2-daily-result');
    await clickAction('backToHub'); await waitScreen('title');
    // Reload proves the real browser storage retained progression independently
    // of classic PB/achievement data written earlier in this same test.
    await page.reload(); await page.waitForFunction(() => window.__wechatPreview, { timeout: 20000 });
    await clickAction('openMenu'); await waitScreen('title');
    assert.equal((await state()).v2.growth.abilities[0].level, 2);
    const hubAfterL04 = (await state()).v2.hub;
    assert.equal(hubAfterL04.complete, false, 'L04 opens chapter two, not full-campaign completion');
    assert.equal(hubAfterL04.nextId, 'L05');
    assert.equal(hubAfterL04.completedCount, 4);
    await clickAction('openCampaign'); await waitScreen('map'); await keyShot('v2-map-after-l04');
    for (const size of [{ width: 360, height: 740 }, { width: 390, height: 790 }, { width: 430, height: 932 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(size); await settle();
      const viewport = await page.evaluate(() => window.__wechatPreview.app.platform.getViewport());
      assert.ok(viewport.scale > 0 && viewport.gameWidth <= viewport.width + 0.1);
      assert.ok(viewport.gameHeight <= viewport.height + 0.1);
    }
    fs.writeFileSync(path.join(artifacts, 'browser-results.json'), JSON.stringify({ clears, firstDaily, checks: ['classic touch/ads/QTE', 'four lessons touch steering', 'jet grant/upgrade/reload', 'daily150/pause/result', 'four viewports'] }, null, 2));
    assert.deepEqual(errors, [], 'No browser runtime errors');
    await page.evaluate(() => window.__wechatPreview.app.destroy());

    // Preserve the existing H5 baseline: use actual DOM buttons and its debug hook.
    await page.goto(origin + '/?debug');
    await page.locator('#btn-cover-start').click();
    await page.locator('#btn-start').click();
    await page.evaluate(() => window.__moon.skipIntro());
    assert.equal(await page.evaluate(() => window.__moon.state()), 'play');
    assert.deepEqual(errors, [], 'No H5 regression errors');
    console.log('Browser checks PASS: classic ads/QTE; V2 four lessons via touch, jet II/reload, daily150/pause/result; 4 viewports; H5 smoke.');
    console.log('V2 clears: ' + clears.map(run => run.level + ' ' + run.time.toFixed(1) + 's').join(', ') + '; daily reward ' + firstDaily.reward);
    console.log('Checkpoint images: ' + artifacts);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
