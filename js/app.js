/**
 * App — 主调度中心
 * 形态切换 / URL 快照 / FPS 自适应 / Tweakpane 集成
 */

import { Pane } from 'tweakpane';
import { AudioEngine } from './audioEngine.js';
import { COLOR_THEMES } from './themes.js';
import { ChladniRenderer } from './renderers/chladniRenderer.js';

class App {
  constructor() {
    // DOM refs
    this.canvas2d = document.getElementById('canvas-2d');
    this.canvasWebgl = document.getElementById('canvas-webgl');
    this.interaction = document.getElementById('interaction-layer');
    this.tpContainer = document.getElementById('tp-container');
    this.guiToggle = document.getElementById('gui-toggle');
    this.perfBadge = document.getElementById('perf-badge');

    this.ctx2d = this.canvas2d.getContext('2d');

    // Audio
    this.audio = new AudioEngine();

    // Renderer（单一克拉尼模式）
    this.renderer = new ChladniRenderer();

    // State
    this.isRunning = false;
    this.lastTime = 0;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Global params
    this.globalParams = {
      theme: 'warmSand',
      audioSmoothing: 0.85,
    };

    // Per-renderer param state
    this.modeState = {};

    // Tweakpane
    this.pane = null;
    this.globalFolder = null;
    this.modeFolder = null;

    // FPS monitor
    this.fpsFrames = 0;
    this.fpsElapsed = 0;
    this.fpsLowDuration = 0;
    this.fpsAdapted = false;

    this._resize();
    this._parseUrlParams();
    this._initPane();
    this._bindEvents();
    this._initShapeTabs();
    this._initRenderer();
  }

  /* ---------- URL 快照 ---------- */
  _parseUrlParams() {
    const hash = location.hash.slice(1);
    if (!hash) return;
    const params = new URLSearchParams(hash);

    const shape = params.get('shape');
    const validShapes = ['circle', 'square', 'annular', 'ellipse', 'triangle', 'hexagon'];
    if (shape && validShapes.includes(shape)) {
      this._initialShape = shape;
    }

    const theme = params.get('theme');
    if (theme && (COLOR_THEMES[theme] || theme === 'audioDriven')) {
      this.globalParams.theme = theme;
    }

    const count = parseInt(params.get('count'), 10);
    if (!isNaN(count) && count >= 1000 && count <= 8000) {
      this._initialCount = count;
    }

    const complexity = parseInt(params.get('complexity'), 10);
    if (!isNaN(complexity) && complexity >= 0 && complexity <= 3) {
      this._initialComplexity = complexity;
    }
  }

  _syncUrl() {
    const state = this.modeState['chladni'] || {};
    const params = new URLSearchParams();
    const shape = state.boundaryShape || this._initialShape || 'circle';
    params.set('shape', shape);
    params.set('theme', this.globalParams.theme);
    if (state.particleCount) params.set('count', String(state.particleCount));
    if (state.complexity !== undefined) params.set('complexity', String(state.complexity));
    history.replaceState(null, '', '#' + params.toString());
  }

  /* ---------- Tweakpane ---------- */
  _initPane() {
    this.pane = new Pane({
      container: this.tpContainer,
      title: '设置',
    });

    // Global folder
    this.globalFolder = this.pane.addFolder({ title: '全局', expanded: true });
    this.globalFolder.addInput(this.globalParams, 'theme', {
      label: '配色',
      options: {
        暖沙: 'warmSand',
        霓虹: 'neon',
        水墨: 'ink',
        极光: 'aurora',
        幻彩: 'audioDriven',
      },
    }).on('change', () => {
      this._applyTheme();
      this._syncUrl();
    });

    this.globalFolder.addInput(this.globalParams, 'audioSmoothing', {
      label: '音频平滑',
      min: 0.3,
      max: 0.98,
      step: 0.01,
    }).on('change', (ev) => {
      if (this.audio.analyser) {
        this.audio.analyser.smoothingTimeConstant = ev.value;
      }
    });

    // Mode folder (物理参数，由 _initRenderer 填充)
    this.modeFolder = this.pane.addFolder({ title: '物理参数', expanded: true });
  }

  _rebuildModePane() {
    // Remove old mode controls
    const children = this.modeFolder.children.slice();
    children.forEach((c) => this.modeFolder.remove(c));

    const config = this.renderer.getParamConfig();

    // Init state if first visit
    if (!this.modeState['chladni']) {
      this.modeState['chladni'] = {};
      for (const [key, def] of Object.entries(config)) {
        this.modeState['chladni'][key] = def.default;
      }
      // Override with URL / initial values
      if (this._initialCount !== undefined) {
        this.modeState['chladni'].particleCount = this._initialCount;
      }
      if (this._initialComplexity !== undefined) {
        this.modeState['chladni'].complexity = this._initialComplexity;
      }
      if (this._initialShape !== undefined) {
        this.modeState['chladni'].boundaryShape = this._initialShape;
      }
    }

    const state = this.modeState['chladni'];
    this.renderer.setParams(state);

    for (const [key, conf] of Object.entries(config)) {
      const inputConf = { label: conf.label };
      if (conf.options) {
        inputConf.options = conf.options;
        this.modeFolder.addInput(state, key, inputConf).on('change', () => {
          this.renderer.setParams(state);
          this._syncUrl();
        });
      } else {
        inputConf.min = conf.min;
        inputConf.max = conf.max;
        inputConf.step = conf.step;
        this.modeFolder.addInput(state, key, inputConf).on('change', () => {
          this.renderer.setParams(state);
          this._syncUrl();
        });
      }
    }
  }

  /* ---------- Theme ---------- */
  _resolveTheme() {
    const name = this.globalParams.theme;
    if (name === 'audioDriven') {
      return { mode: 'audioDriven', bg: [0, 0, 0], trailAlpha: 0.08, particle: [255, 255, 255] };
    }
    return COLOR_THEMES[name] || COLOR_THEMES.warmSand;
  }

  _applyTheme() {
    const theme = this._resolveTheme();
    if (!theme) return;
    const [r, g, b] = theme.bg;
    document.body.style.background = `rgb(${r},${g},${b})`;
    if (this.renderer) {
      this.renderer.setTheme(theme);
    }
  }

  getTheme() {
    return this._resolveTheme();
  }

  /* ---------- Shape Tabs ---------- */
  _initShapeTabs() {
    const buttons = document.querySelectorAll('#shape-tabs .shape-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const shape = btn.dataset.shape;
        this._switchShape(shape);
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Set initial active state from URL or default
    const state = this.modeState['chladni'] || {};
    const shape = state.boundaryShape || this._initialShape || 'circle';
    buttons.forEach((b) => b.classList.toggle('active', b.dataset.shape === shape));
  }

  _switchShape(shape) {
    if (!this.renderer) return;
    this.renderer.setParams({ boundaryShape: shape });
    const state = this.modeState['chladni'];
    if (state) state.boundaryShape = shape;
    this._syncUrl();
  }

  _initRenderer() {
    this.canvas2d.style.visibility = 'visible';
    this.canvasWebgl.style.visibility = 'hidden';
    this._clearCanvas2D();
    this.renderer.init(this.canvas2d);
    this.renderer.resize(this.width, this.height);
    this.renderer.setTheme(this.getTheme());
    this._rebuildModePane();
  }

  /* ---------- Events ---------- */
  _bindEvents() {
    window.addEventListener('resize', () => this._resize());

    const overlay = document.getElementById('start-overlay');

    document.getElementById('start-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await this._startWith(() => this.audio.setFile(file));
        overlay.classList.add('hidden');
      } catch (err) {
        alert('音频启动失败: ' + err.message);
        console.error(err);
      }
      e.target.value = '';
    });

    document.getElementById('start-mic').addEventListener('click', async () => {
      try {
        await this._startWith(() => this.audio.setMicrophone());
        overlay.classList.add('hidden');
      } catch (err) {
        console.error(err);
      }
    });

    // Top bar audio controls
    document.getElementById('file-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        if (!this.isRunning) {
          await this._startWith(() => this.audio.setFile(file));
        } else {
          await this.audio.setFile(file);
          if (this.renderer && typeof this.renderer.reset === 'function') {
            this.renderer.reset();
          }
        }
      } catch (err) {
        alert('音频加载失败: ' + err.message);
        console.error(err);
      }
      e.target.value = '';
    });

    document.getElementById('mic-btn').addEventListener('click', async () => {
      try {
        if (!this.isRunning) {
          await this._startWith(() => this.audio.setMicrophone());
        } else {
          await this.audio.setMicrophone();
        }
      } catch (err) {
        alert('麦克风启动失败: ' + err.message);
        console.error(err);
      }
    });

    document.getElementById('snapshot-btn').addEventListener('click', () => {
      this._snapshot();
    });

    document.getElementById('share-btn').addEventListener('click', () => {
      this._shareUrl();
    });

    // GUI toggle
    this.guiToggle.addEventListener('click', () => {
      const open = this.tpContainer.classList.toggle('open');
      this.guiToggle.classList.toggle('active', open);
    });

    // Pointer events
    const onPtr = (x, y, type) => {
      if (!this.renderer) return;
      if (type === 'down') this.renderer.onPointerDown(x, y);
      if (type === 'move') this.renderer.onPointerMove(x, y);
      if (type === 'up') this.renderer.onPointerUp();
    };

    this.interaction.addEventListener('pointerdown', (e) => {
      onPtr(e.clientX, e.clientY, 'down');
    });
    this.interaction.addEventListener('pointermove', (e) => {
      onPtr(e.clientX, e.clientY, 'move');
    });
    this.interaction.addEventListener('pointerup', () => onPtr(0, 0, 'up'));
    this.interaction.addEventListener('pointerleave', () => onPtr(0, 0, 'up'));
  }

  async _startWith(audioSetup) {
    try {
      await audioSetup();
      this.isRunning = true;
      requestAnimationFrame((t) => this._loop(t));
    } catch (err) {
      alert('音频启动失败: ' + err.message);
      console.error(err);
      throw err;
    }
  }

  _clearCanvas2D() {
    this.ctx2d.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx2d.clearRect(0, 0, this.canvas2d.width, this.canvas2d.height);
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------- Resize ---------- */
  _resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // 2D canvas
    this.canvas2d.width = this.width * dpr;
    this.canvas2d.height = this.height * dpr;
    this.canvas2d.style.width = this.width + 'px';
    this.canvas2d.style.height = this.height + 'px';
    this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);

    // WebGL canvas
    this.canvasWebgl.width = this.width * dpr;
    this.canvasWebgl.height = this.height * dpr;
    this.canvasWebgl.style.width = this.width + 'px';
    this.canvasWebgl.style.height = this.height + 'px';

    if (this.renderer) {
      this.renderer.resize(this.width, this.height);
    }
  }

  /* ---------- Snapshot ---------- */
  _snapshot() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const tmp = document.createElement('canvas');
    tmp.width = this.width * dpr;
    tmp.height = this.height * dpr;
    const tctx = tmp.getContext('2d');

    const [r, g, b] = this.getTheme().bg;
    tctx.fillStyle = `rgb(${r},${g},${b})`;
    tctx.fillRect(0, 0, tmp.width, tmp.height);

    if (this.canvasWebgl.style.visibility !== 'hidden') {
      tctx.drawImage(this.canvasWebgl, 0, 0);
    }
    if (this.canvas2d.style.visibility !== 'hidden') {
      tctx.drawImage(this.canvas2d, 0, 0);
    }

    const state = this.modeState['chladni'] || {};
    const shape = state.boundaryShape || 'circle';
    const link = document.createElement('a');
    link.download = `sv-${shape}-${Date.now()}.png`;
    link.href = tmp.toDataURL('image/png');
    link.click();
  }

  _shareUrl() {
    this._syncUrl();
    const url = location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('share-btn');
        const old = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => (btn.textContent = old), 1200);
      });
    } else {
      prompt('复制以下链接分享:', url);
    }
  }

  /* ---------- FPS Adaptive ---------- */
  _monitorFps(dt) {
    this.fpsFrames++;
    this.fpsElapsed += dt;

    if (this.fpsFrames >= 30) {
      const avgDt = this.fpsElapsed / this.fpsFrames;
      const fps = 1 / avgDt;
      this._adaptPerformance(avgDt);
      this.fpsFrames = 0;
      this.fpsElapsed = 0;
    }
  }

  _adaptPerformance(avgDt) {
    const fps = 1 / avgDt;
    const state = this.modeState['chladni'];
    if (!state) return;

    if (fps < 45) {
      this.fpsLowDuration += avgDt * 30; // 约等于本次统计窗口时长
    } else {
      this.fpsLowDuration = Math.max(0, this.fpsLowDuration - avgDt * 30);
    }

    if (this.fpsLowDuration >= 3.0 && !this.fpsAdapted) {
      const current = state.particleCount || 4000;
      const next = Math.max(1000, Math.floor(current / 2));
      if (next < current) {
        state.particleCount = next;
        this.renderer.setParams({ particleCount: next });
        this._rebuildModePane(); // 刷新滑块位置
        this.fpsAdapted = true;
        this.perfBadge.classList.remove('hidden');
        console.log(`[Perf] FPS low (${(1/avgDt).toFixed(1)}), reduced particles to ${next}`);
      }
    }
  }

  /* ---------- Loop ---------- */
  _loop(timestamp) {
    if (!this.isRunning) return;
    try {
      const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
      this.lastTime = timestamp;

      this._monitorFps(dt);
      const features = this.audio.getFeatures(dt);
      this.renderer.update(features, dt);
      this.renderer.render(this.width, this.height);
    } catch (err) {
      console.error('Render loop error:', err);
    }
    requestAnimationFrame((t) => this._loop(t));
  }
}

// Start
try {
  window.app = new App();
} catch (err) {
  console.error('App initialization failed:', err);
  alert('应用初始化失败: ' + err.message);
}
