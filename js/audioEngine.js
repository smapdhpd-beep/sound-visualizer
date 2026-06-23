/**
 * AudioEngine
 * 统一音频输入路由 + 特征提取
 * 输出平滑后的音频特征，供渲染器消费
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.audio = null;
    this.isInit = false;

    this.fftSize = 2048;
    this.smoothing = 0.85; // AnalyserNode 内部平滑

    // 频域数据缓存
    this.freqData = null;
    this.timeData = null;

    // 特征平滑状态（EMA）
    this.features = {
      bass: 0,
      mid: 0,
      high: 0,
      overall: 0,
      onset: 0,
      centroid: 0,
      texture: 0,
    };
    this.prevOverall = 0;
    this.prevCentroid = 0;
  }

  async init() {
    if (this.isInit) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = this.smoothing;

    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeData = new Uint8Array(this.analyser.frequencyBinCount);
    this.isInit = true;
  }

  // 从本地文件创建源
  async setFile(file) {
    console.log('[AudioEngine] setFile begin');
    await this.init();
    console.log('[AudioEngine] AudioContext state:', this.ctx.state);
    await this.ctx.resume();
    console.log('[AudioEngine] AudioContext resumed');
    this._cleanupSource();

    // 释放旧 Blob URL，防止内存泄漏
    if (this.audio) {
      this.audio.pause();
      if (this.audio.src && this.audio.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.audio.src);
      }
      this.audio.src = '';
      this.audio = null;
    }

    const url = URL.createObjectURL(file);
    this.audio = new Audio(url);
    this.audio.loop = true;
    this.audio.crossOrigin = 'anonymous';

    await new Promise((res, rej) => {
      const timer = setTimeout(() => res(), 6000); // 最多等6秒
      this.audio.oncanplaythrough = () => {
        clearTimeout(timer);
        res();
      };
      this.audio.onerror = () => {
        clearTimeout(timer);
        rej(new Error('音频解码失败，格式可能不支持'));
      };
      this.audio.load();
    });

    this.source = this.ctx.createMediaElementSource(this.audio);
    this.source.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    try {
      await this.audio.play();
      console.log('[AudioEngine] audio.play() success');
    } catch (e) {
      console.error('[AudioEngine] audio.play() failed:', e);
      throw new Error('播放被浏览器阻止，请点击页面任意位置后再试');
    }
  }

  // 从麦克风创建源
  async setMicrophone() {
    await this.init();
    await this.ctx.resume();
    this._cleanupSource();
    if (this.audio) {
      this.audio.pause();
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    // 麦克风不连接 destination，避免啸叫
  }

  _cleanupSource() {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
  }

  // 获取当前帧的音频特征
  getFeatures(dt) {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.analyser) return { ...this.features };

    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getByteTimeDomainData(this.timeData);

    const binCount = this.analyser.frequencyBinCount;
    const nyquist = this.ctx.sampleRate / 2;
    const hzPerBin = nyquist / binCount;

    // 频带边界（bin 索引）
    const bassEnd = Math.floor(150 / hzPerBin);
    const midEnd = Math.floor(4000 / hzPerBin);

    let bassSum = 0, midSum = 0, highSum = 0, totalSum = 0;
    let weightedSum = 0;

    for (let i = 0; i < binCount; i++) {
      const v = this.freqData[i] / 255;
      totalSum += v;
      weightedSum += v * i;
      if (i < bassEnd) bassSum += v;
      else if (i < midEnd) midSum += v;
      else highSum += v;
    }

    const overall = totalSum / binCount;
    const bass = bassSum / Math.max(1, bassEnd);
    const mid = midSum / Math.max(1, midEnd - bassEnd);
    const high = highSum / Math.max(1, binCount - midEnd);

    // 频谱质心（归一化到 0-1）
    const centroid = totalSum > 0.001 ? weightedSum / totalSum / binCount : 0;

    // 频谱纹理（当前帧与长期平均的差异，简单近似）
    const texture = Math.abs(centroid - this.prevCentroid) * 10;
    this.prevCentroid = centroid;

    // Onset 检测：时域能量突增 + 低频冲击
    let timeEnergy = 0;
    for (let i = 0; i < binCount; i++) {
      const s = (this.timeData[i] - 128) / 128;
      timeEnergy += s * s;
    }
    timeEnergy = Math.sqrt(timeEnergy / binCount);
    const onsetRaw = Math.max(0, (timeEnergy - this.prevOverall) * 4 + bass * 0.3);
    this.prevOverall = timeEnergy;

    // EMA 平滑（除 onset 外）
    const a = 0.75; // 平滑系数
    this.features.bass += (bass - this.features.bass) * a;
    this.features.mid += (mid - this.features.mid) * a;
    this.features.high += (high - this.features.high) * a;
    this.features.overall += (overall - this.features.overall) * a;
    this.features.centroid += (centroid - this.features.centroid) * a;
    this.features.texture += (texture - this.features.texture) * a;
    // Onset 快速衰减
    this.features.onset += (onsetRaw - this.features.onset) * 0.3;

    // 频谱降采样（供瀑布等模式使用）
    const spectrumBands = 128;
    const spectrum = new Float32Array(spectrumBands);
    for (let i = 0; i < spectrumBands; i++) {
      const t0 = Math.pow(i / spectrumBands, 1.6);
      const t1 = Math.pow((i + 1) / spectrumBands, 1.6);
      const start = Math.floor(t0 * binCount);
      const end = Math.floor(t1 * binCount);
      let sum = 0, count = 0;
      for (let j = start; j < end && j < binCount; j++) {
        sum += this.freqData[j] / 255;
        count++;
      }
      spectrum[i] = count > 0 ? sum / count : 0;
    }

    // FFT 峰值检测（供 Chladni 模式提取主导频率）
    const peaks = this._findPeaks();

    return {
      ...this.features,
      peakBins: peaks.map(p => p.bin),
      binCount: this.analyser.frequencyBinCount,
      spectrum,
    };
  }

  // FFT 峰值检测：返回前 3 个局部最大值的 bin 索引
  _findPeaks() {
    if (!this.freqData) return [{ bin: 10, value: 0 }, { bin: 30, value: 0 }, { bin: 50, value: 0 }];
    const data = this.freqData;
    const peaks = [];
    for (let i = 2; i < data.length - 2; i++) {
      const v = data[i];
      if (v > data[i - 1] && v > data[i + 1] && v > data[i - 2] && v > data[i + 2] && v > 50) {
        peaks.push({ bin: i, value: v });
      }
    }
    peaks.sort((a, b) => b.value - a.value);
    const result = peaks.slice(0, 3);
    // 保底：始终返回至少 3 个峰值，防止下游出现 NaN
    while (result.length < 3) {
      const fallback = [10, 30, 50][result.length];
      result.push({ bin: fallback, value: 0 });
    }
    return result;
  }

  get isPlaying() {
    return this.source !== null;
  }
}
