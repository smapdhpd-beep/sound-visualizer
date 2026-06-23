const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 启动静态文件服务器
const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
  };
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(data);
    }
  });
});

server.listen(8765, async () => {
  console.log('Server running on http://localhost:8765');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  await page.goto('http://localhost:8765');
  await page.waitForTimeout(1000);

  // 截图：启动遮罩
  await page.screenshot({ path: 'test-screenshots/01-start-overlay.png' });

  // 模拟音频引擎，绕过真实音频权限
  await page.evaluate(() => {
    // 注入模拟音频特征
    const mockFeatures = { bass: 0.3, mid: 0.2, high: 0.1, overall: 0.25, onset: 0, centroid: 0.3, texture: 0.1 };
    window.app.audio.getFeatures = () => ({ ...mockFeatures });
    window.app.isRunning = true;
    window.app._loop(performance.now());
  });

  // 切换到 chladni 模式
  await page.click('button[data-mode="chladni"]');
  await page.waitForTimeout(500);

  // 模拟启动（设置 isRunning 并启动循环）
  await page.evaluate(() => {
    window.app.isRunning = true;
    let t = performance.now();
    for (let i = 0; i < 300; i++) {
      t += 16.67;
      window.app._loop(t);
    }
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-screenshots/02-chladni-default.png' });

  // 设置稳定参数并模拟 5 秒
  await page.evaluate(() => {
    window.app.currentRenderer.setParams({
      particleCount: 2500,
      modeM: 3,
      modeN: 2,
      audioDrive: 0,
      strength: 80,
      viscosity: 0.92,
      symmetry: 1,
    });
    window.app._rebuildModePane();

    let t = performance.now();
    // 模拟 5 秒 @ 60fps
    for (let i = 0; i < 300; i++) {
      t += 16.67;
      window.app._loop(t);
    }
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-screenshots/03-chladni-stable-m3n2.png' });

  // 换一组模态
  await page.evaluate(() => {
    window.app.currentRenderer.setParams({
      modeM: 5,
      modeN: 3,
      symmetry: 2,
    });
    let t = performance.now();
    for (let i = 0; i < 300; i++) {
      t += 16.67;
      window.app._loop(t);
    }
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-screenshots/04-chladni-m5n3-sym2.png' });

  // 水墨主题
  await page.evaluate(() => {
    window.app.globalParams.theme = 'ink';
    window.app._applyTheme();
    let t = performance.now();
    for (let i = 0; i < 120; i++) {
      t += 16.67;
      window.app._loop(t);
    }
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-screenshots/05-chladni-ink.png' });

  // 暖沙主题
  await page.evaluate(() => {
    window.app.globalParams.theme = 'warmSand';
    window.app._applyTheme();
    let t = performance.now();
    for (let i = 0; i < 120; i++) {
      t += 16.67;
      window.app._loop(t);
    }
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-screenshots/06-chladni-warmsand.png' });

  // 霓虹主题
  await page.evaluate(() => {
    window.app.globalParams.theme = 'neon';
    window.app._applyTheme();
    let t = performance.now();
    for (let i = 0; i < 120; i++) {
      t += 16.67;
      window.app._loop(t);
    }
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-screenshots/07-chladni-neon.png' });

  // 切回 dust 再切回 chladni，测试切换稳定性
  await page.evaluate(() => {
    window.app._switchMode('dust');
    let t = performance.now();
    for (let i = 0; i < 60; i++) {
      t += 16.67;
      window.app._loop(t);
    }
    window.app._switchMode('chladni');
    window.app.currentRenderer.setParams({ modeM: 4, modeN: 3, symmetry: 1, audioDrive: 0 });
    for (let i = 0; i < 180; i++) {
      t += 16.67;
      window.app._loop(t);
    }
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-screenshots/08-switch-back.png' });

  await browser.close();
  server.close();
  console.log('Done. Screenshots saved to test-screenshots/');
});
