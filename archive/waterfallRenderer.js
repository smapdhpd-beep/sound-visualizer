/**
 * WaterfallRenderer — 频谱瀑布
 * 每帧频谱作为一行像素，历史向下滚动形成 3D 瀑布感
 * 支持平面/透视两种呈现、三种着色模式
 */

import { BaseRenderer } from './baseRenderer.js';

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [
    Math.round(f(0) * 255),
    Math.round(f(8) * 255),
    Math.round(f(4) * 255),
  ];
}

export class WaterfallRenderer extends BaseRenderer {
  constructor() {
    super('waterfall');
    this.historyCanvas = null;
    this.historyCtx = null;
    this.hue = Math.random() * 360;
    this.onsetFlash = 0;
    this._lastSpectrum = null;
  }

  init(canvas) {
    super.init(canvas);
    this._initHistoryBuffer();
  }

  _initHistoryBuffer() {
    const bands = this.params.bandCount || 128;
    const history = this.params.historyLength || 120;
    this.historyCanvas = document.createElement('canvas');
    this.historyCanvas.width = bands;
    this.historyCanvas.height = history;
    this.historyCtx = this.historyCanvas.getContext('2d', { alpha: false });
    // 初始化为背景色
    const [br, bg, bb] = (this.theme && this.theme.bg) || [0, 0, 0];
    this.historyCtx.fillStyle = `rgb(${br},${bg},${bb})`;
    this.historyCtx.fillRect(0, 0, bands, history);
  }

  _onParamsChange() {
    // bandCount/historyLength 改变时重建 buffer
    this._initHistoryBuffer();
  }

  setTheme(theme) {
    super.setTheme(theme);
    // 主题切换时刷新 buffer 底色（避免旧帧与新背景色冲突）
    if (this.historyCtx) {
      const [br, bg, bb] = theme.bg || [0, 0, 0];
      const imgData = this.historyCtx.getImageData(0, 0, this.historyCanvas.width, this.historyCanvas.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        // 如果像素很暗（接近旧背景），刷新为新背景
        if (d[i] < 20 && d[i + 1] < 20 && d[i + 2] < 20) {
          d[i] = br; d[i + 1] = bg; d[i + 2] = bb;
        }
      }
      this.historyCtx.putImageData(imgData, 0, 0);
    }
  }

  update(features, dt) {
    if (!this.historyCtx) return;

    const { spectrum, onset, overall } = features;
    if (!spectrum) return;

    const bands = this.params.bandCount || 128;
    const history = this.params.historyLength || 120;

    // hue 漫游：基础 20°/s + 能量加速
    this.hue = (this.hue + (20 + overall * 60) * dt) % 360;

    // onset 闪光
    if (onset > 0.25) this.onsetFlash = 1.0;
    this.onsetFlash *= Math.pow(0.02, dt); // 极快衰减

    // 频谱适配目标 bandCount
    const spec = this._fitSpectrum(spectrum, bands);

    // 构建新行的 ImageData
    const imgData = this.historyCtx.createImageData(bands, 1);
    const data = imgData.data;

    const colorMode = this.params.colorMode || 'spectrum';
    const theme = this.theme || {};
    const isAudioDriven = theme.mode === 'audioDriven' || colorMode === 'audioDriven';
    const [pr, pg, pb] = theme.particle || [255, 255, 255];

    for (let i = 0; i < bands; i++) {
      const energy = Math.max(0, Math.min(1, spec[i]));
      let r = 0, g = 0, b = 0;

      if (isAudioDriven) {
        // 幻彩：频率决定色相偏移，能量决定亮度
        const hue = (this.hue + (i / bands) * 50) % 360;
        const sat = 85;
        const light = 5 + energy * 75; // 5% ~ 80%
        [r, g, b] = hslToRgb(hue, sat, light);
      } else if (colorMode === 'spectrum') {
        // 经典频谱色：低频紫蓝(260°) → 高频红(0°)
        const hue = 260 - (i / bands) * 260;
        const sat = 70 + energy * 30;
        const light = 5 + energy * 70;
        [r, g, b] = hslToRgb(hue, sat, light);
      } else {
        // 跟随主题色：能量越高越亮
        const intensity = Math.pow(energy, 1.4);
        r = Math.round(pr * intensity);
        g = Math.round(pg * intensity);
        b = Math.round(pb * intensity);
      }

      // onset 全局闪光叠加
      if (this.onsetFlash > 0) {
        const flash = this.onsetFlash * 0.35;
        r = Math.min(255, r + flash * 255);
        g = Math.min(255, g + flash * 255);
        b = Math.min(255, b + flash * 255);
      }

      const idx = i * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }

    // 滚动历史：把现有内容整体下移 1 像素
    this.historyCtx.drawImage(
      this.historyCanvas,
      0, 0, bands, history - 1,
      0, 1, bands, history - 1
    );
    // 新数据插入顶部（最新）
    this.historyCtx.putImageData(imgData, 0, 0);

    this._lastSpectrum = spec;
  }

  render(width, height) {
    if (!this.historyCanvas || !this.ctx) return;
    const ctx = this.ctx;
    const [br, bg, bb] = (this.theme && this.theme.bg) || [0, 0, 0];

    // 清屏
    ctx.fillStyle = `rgb(${br},${bg},${bb})`;
    ctx.fillRect(0, 0, width, height);

    const bands = this.historyCanvas.width;
    const history = this.historyCanvas.height;
    const perspective = this.params.perspective ?? 0.3;

    if (perspective <= 0.02) {
      // 平面模式：直接拉伸覆盖
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.historyCanvas, 0, 0, width, height);
    } else {
      // 透视模式：上宽下窄，逐行梯形变形
      ctx.imageSmoothingEnabled = false;
      const centerX = width / 2;
      const maxShrink = perspective * 0.6; // 底部宽度比例

      for (let row = 0; row < history; row++) {
        const progress = row / (history - 1); // 0=顶部(最新), 1=底部(最旧)
        const scale = 1 - progress * maxShrink;
        const drawW = width * scale;
        const drawX = centerX - drawW / 2;
        const drawY = (row / history) * height;
        const drawH = (height / history) + 0.5; // +0.5 避免缝隙

        ctx.drawImage(
          this.historyCanvas,
          0, row, bands, 1,
          drawX, drawY, drawW, drawH
        );
      }
    }

    // onset 微闪覆盖
    if (this.onsetFlash > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${this.onsetFlash * 0.06})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  /** 将任意长度频谱适配到目标 bandCount */
  _fitSpectrum(src, target) {
    if (src.length === target) return src;
    const result = new Float32Array(target);
    if (src.length > target) {
      // 降采样：分段平均
      const ratio = src.length / target;
      for (let i = 0; i < target; i++) {
        const start = Math.floor(i * ratio);
        const end = Math.floor((i + 1) * ratio);
        let sum = 0, count = 0;
        for (let j = start; j < end && j < src.length; j++) {
          sum += src[j];
          count++;
        }
        result[i] = count > 0 ? sum / count : 0;
      }
    } else {
      // 升采样：线性插值
      const ratio = (src.length - 1) / (target - 1);
      for (let i = 0; i < target; i++) {
        const f = i * ratio;
        const i0 = Math.floor(f);
        const i1 = Math.min(src.length - 1, i0 + 1);
        const t = f - i0;
        result[i] = src[i0] * (1 - t) + src[i1] * t;
      }
    }
    return result;
  }

  getParamConfig() {
    return {
      bandCount: { label: '频带数', min: 32, max: 256, step: 16, default: 128 },
      historyLength: { label: '历史深度', min: 30, max: 240, step: 10, default: 120 },
      perspective: { label: '透视', min: 0, max: 1, step: 0.05, default: 0.3 },
      colorMode: {
        label: '着色',
        options: { 频谱: 'spectrum', 主题: 'theme', 幻彩: 'audioDriven' },
        default: 'spectrum',
      },
    };
  }
}
