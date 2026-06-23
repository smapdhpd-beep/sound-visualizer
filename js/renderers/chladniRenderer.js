/**
 * ChladniRenderer — 多形态驻波粒子版
 * 核心：FFT 峰值驱动 m/n 模态 → 驻波场 → 粒子聚集波节线
 * 边界：圆形 / 方形 / 环形 / 椭圆
 */

import { BaseRenderer } from './baseRenderer.js';

export class ChladniRenderer extends BaseRenderer {
  constructor() {
    super('chladni');
    this.particles = [];
    this.waveTime = 0;
    this.smoothedM = 3;
    this.smoothedN = 2;
    this.onsetCooldown = 0;
    this.hue = Math.random() * 360;
    this._lastShape = 'circle';
  }

  init(canvas) {
    super.init(canvas);
    this._updateGeometry();
    const count = this.params.particleCount || 4000;
    this._spawnParticles(count);
  }

  _spawnParticles(count) {
    this.particles = [];
    const shape = this.params.boundaryShape || 'circle';

    for (let i = 0; i < count; i++) {
      let x, y;

      if (shape === 'square') {
        // 方形：在正方形区域内均匀生成
        const half = this.maxR;
        x = this.cx + (Math.random() * 2 - 1) * half;
        y = this.cy + (Math.random() * 2 - 1) * half;
      } else if (shape === 'triangle') {
        // 三角形：重心坐标均匀生成（与 _waveFieldTriangle 坐标一致：Ay=R 在屏幕上方）
        const R = this.maxR;
        const h = 1.5 * R;
        const side = h * 2 / Math.sqrt(3);
        const Ax = 0, Ay = R;
        const Bx = -side / 2, By = -R / 2;
        const Cx = side / 2, Cy = -R / 2;
        const r1 = Math.random();
        const r2 = Math.random();
        const sr = Math.sqrt(r1);
        const w1 = 1 - sr;
        const w2 = sr * (1 - r2);
        const w3 = sr * r2;
        const tx = w1 * Ax + w2 * Bx + w3 * Cx;
        const ty = w1 * Ay + w2 * By + w3 * Cy;
        x = this.cx + tx;
        y = this.cy - ty; // 翻转y：让 Ay=R 映射到屏幕上方（py 减小）
      } else if (shape === 'hexagon') {
        // 六边形：拒绝采样，在包围盒内筛选
        const R = this.maxR;
        const rIn = R * Math.sqrt(3) / 2;
        let valid = false;
        let attempts = 0;
        while (!valid && attempts < 12) {
          const tx = (Math.random() * 2 - 1) * R;
          const ty = (Math.random() * 2 - 1) * R * 0.9;
          const u = ty / rIn;
          const v = (Math.sqrt(3) * tx + ty) / (2 * rIn);
          const w = (-Math.sqrt(3) * tx + ty) / (2 * rIn);
          if (Math.abs(u) <= 1.0 && Math.abs(v) <= 1.0 && Math.abs(w) <= 1.0) {
            x = this.cx + tx;
            y = this.cy + ty;
            valid = true;
          }
          attempts++;
        }
        if (!valid) {
          x = this.cx + (Math.random() - 0.5) * 10;
          y = this.cy + (Math.random() - 0.5) * 10;
        }
      } else {
        // 圆形/环形/椭圆：极坐标均匀分布
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * this.maxR;
        x = this.cx + Math.cos(angle) * r;
        y = this.cy + Math.sin(angle) * r;
      }

      this.particles.push({ x, y, vx: 0, vy: 0, acc: 0 });
    }
  }

  _onParamsChange() {
    // 边界形状切换时立即重新生成粒子，避免旧形态粒子漂移混乱
    const shape = this.params.boundaryShape || 'circle';
    if (shape !== this._lastShape) {
      this._lastShape = shape;
      this._spawnParticles(this.particles.length || (this.params.particleCount || 4000));
      return;
    }
    const target = this.params.particleCount || 4000;
    if (this.particles.length !== target) {
      this._spawnParticles(target);
    }
  }

  setTheme(theme) {
    super.setTheme(theme);
  }

  _updateGeometry() {
    this.cx = this.width * 0.5;
    this.cy = this.height * 0.5;
    this.maxR = Math.min(this.cx, this.cy);
  }

  resize(width, height) {
    super.resize(width, height);
    this._updateGeometry();
    const target = this.params.particleCount || 4000;
    this._spawnParticles(target);
  }

  // ---------- 驻波场多形态分发 ----------
  _waveField(px, py, m, n, time, complexity) {
    const shape = this.params.boundaryShape || 'circle';
    switch (shape) {
      case 'square':   return this._waveFieldSquare(px, py, m, n, time, complexity);
      case 'annular':  return this._waveFieldAnnular(px, py, m, n, time, complexity);
      case 'ellipse':  return this._waveFieldEllipse(px, py, m, n, time, complexity);
      case 'triangle': return this._waveFieldTriangle(px, py, m, n, time, complexity);
      case 'hexagon':  return this._waveFieldHexagon(px, py, m, n, time, complexity);
      default:         return this._waveFieldCircle(px, py, m, n, time, complexity);
    }
  }

  _waveFieldCircle(px, py, m, n, time, complexity) {
    const dx = px - this.cx;
    const dy = py - this.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 归一化半径，软边界处理
    let r = dist / this.maxR;
    if (r > 1.0) r = 1.0 + (r - 1.0) * 0.3;

    const theta = Math.atan2(dy, dx);

    let amp = Math.sin(m * Math.PI * r) * Math.cos(n * theta);

    const harmonics = [
      { mOff: 2, nOff: 2, coef: 0.45 },
      { mOff: 4, nOff: 4, coef: 0.30 },
      { mOff: 6, nOff: 6, coef: 0.20 },
    ];
    for (let i = 0; i < complexity && i < harmonics.length; i++) {
      const h = harmonics[i];
      amp += h.coef * Math.sin((m + h.mOff) * Math.PI * r) * Math.cos((n + h.nOff) * theta);
    }

    amp += 0.12 * (1 + complexity * 0.2) * Math.sin(time * 0.5 + r * 3);

    return Math.abs(amp);
  }

  _waveFieldSquare(px, py, m, n, time, complexity) {
    const nx = (px - this.cx) / this.maxR; // [-1, 1] 为有效区域
    const ny = (py - this.cy) / this.maxR;

    // 硬边界：方形外是禁区，amp=1（波腹，粒子被梯度力自然推回）
    if (Math.abs(nx) > 1.0 || Math.abs(ny) > 1.0) {
      return 1.0;
    }

    // 映射到 [0, 1] 区间
    const u = (nx + 1) * 0.5;
    const v = (ny + 1) * 0.5;

    let amp = Math.sin(m * Math.PI * u) * Math.sin(n * Math.PI * v);

    const harmonics = [
      { mOff: 2, nOff: 2, coef: 0.45 },
      { mOff: 4, nOff: 4, coef: 0.30 },
      { mOff: 6, nOff: 6, coef: 0.20 },
    ];
    for (let i = 0; i < complexity && i < harmonics.length; i++) {
      const h = harmonics[i];
      amp += h.coef * Math.sin((m + h.mOff) * Math.PI * u) * Math.sin((n + h.nOff) * Math.PI * v);
    }

    amp += 0.12 * (1 + complexity * 0.2) * Math.sin(time * 0.5 + (u + v) * 2);

    return Math.abs(amp);
  }

  _waveFieldAnnular(px, py, m, n, time, complexity) {
    const dx = px - this.cx;
    const dy = py - this.cy;
    const r = Math.sqrt(dx * dx + dy * dy) / this.maxR;
    const theta = Math.atan2(dy, dx);
    const innerR = 0.28; // 内孔半径（稍小，让环更明显）

    // 硬边界：内外禁区
    if (r < innerR || r > 1.0) return 1.0;

    const rNorm = (r - innerR) / (1 - innerR); // [0, 1]

    let amp = Math.sin(m * Math.PI * rNorm) * Math.cos(n * theta);

    const harmonics = [
      { mOff: 2, nOff: 2, coef: 0.45 },
      { mOff: 4, nOff: 4, coef: 0.30 },
      { mOff: 6, nOff: 6, coef: 0.20 },
    ];
    for (let i = 0; i < complexity && i < harmonics.length; i++) {
      const h = harmonics[i];
      amp += h.coef * Math.sin((m + h.mOff) * Math.PI * rNorm) * Math.cos((n + h.nOff) * theta);
    }

    amp += 0.12 * (1 + complexity * 0.2) * Math.sin(time * 0.5 + rNorm * 4);

    // 内外边界势垒，防止粒子卡入
    let barrier = 0;
    if (r < innerR + 0.06) {
      barrier = ((innerR + 0.06 - r) / 0.06) * 0.6;
    } else if (r > 0.94) {
      barrier = ((r - 0.94) / 0.06) * 0.6;
    }

    return Math.min(1.0, Math.abs(amp) + barrier);
  }

  _waveFieldEllipse(px, py, m, n, time, complexity) {
    const dx = px - this.cx;
    const dy = py - this.cy;
    const a = 1.0;
    const b = 0.55; // 短轴比更低，变形更明显

    const rEff = Math.sqrt((dx / a) ** 2 + (dy / b) ** 2) / this.maxR;
    const thetaEff = Math.atan2(dy / b, dx / a);

    // 硬边界
    if (rEff > 1.0) return 1.0;

    let amp = Math.sin(m * Math.PI * rEff) * Math.cos(n * thetaEff);

    // 椭圆特有：二阶调制产生"猫眼/四叶"变形
    if (complexity >= 1) {
      amp += 0.38 * Math.sin((m + 1) * Math.PI * rEff) * Math.cos((n + 1) * thetaEff * 2);
    }
    if (complexity >= 2) {
      amp += 0.25 * Math.sin((m + 2) * Math.PI * rEff) * Math.cos(Math.abs(n - 1) * thetaEff);
    }

    amp += 0.10 * (1 + complexity * 0.2) * Math.sin(time * 0.5 + rEff * 3 + thetaEff);

    return Math.abs(amp);
  }

  _waveFieldTriangle(px, py, m, n, time, complexity) {
    const dx = px - this.cx;
    const dy = this.cy - py; // 翻转y：让 Ay=R 对应屏幕上方（与 _spawnParticles 一致）

    const R = this.maxR;
    const h = 1.5 * R; // 三角形高度
    const side = h * 2 / Math.sqrt(3);

    // 三个顶点（相对于中心，尖端朝上）
    const Ax = 0, Ay = R;
    const Bx = -side / 2, By = -R / 2;
    const Cx = side / 2, Cy = -R / 2;

    // 带符号面积（2*area）
    const area2 = (Bx - Ax) * (Cy - Ay) - (By - Ay) * (Cx - Ax);

    // 重心坐标
    const w1 = ((By - Cy) * (dx - Cx) + (Cx - Bx) * (dy - Cy)) / area2;
    const w2 = ((Cy - Ay) * (dx - Cx) + (Ax - Cx) * (dy - Cy)) / area2;
    const w3 = 1 - w1 - w2;

    // 硬边界：三角形外 amp=1（波腹，推开粒子）
    if (w1 < -0.01 || w2 < -0.01 || w3 < -0.01) return 1.0;

    // 到三边的归一化距离
    const x = Math.max(0, w1); // 到边 BC 的距离 / h
    const y = Math.max(0, w2); // 到边 CA 的距离 / h
    const z = Math.max(0, w3); // 到边 AB 的距离 / h

    // 三角形驻波：三个边驻波的乘积
    // 参数 p 由边界条件确定（x+y+z=1，在边界上 ψ=0）
    const p = m + n;
    let amp = Math.sin(m * Math.PI * x) * Math.sin(n * Math.PI * y) * Math.sin(p * Math.PI * z);

    // 谐波叠加（保持边界为零）
    if (complexity >= 1) {
      const p2 = (m + 2) + (n + 1);
      amp += 0.35 * Math.sin((m + 2) * Math.PI * x) * Math.sin((n + 1) * Math.PI * y) * Math.sin(p2 * Math.PI * z);
    }

    // 时间微扰
    amp += 0.08 * (1 + complexity * 0.2) * Math.sin(time * 0.5 + (x + y) * 3);

    return Math.abs(amp);
  }

  _waveFieldHexagon(px, py, m, n, time, complexity) {
    const dx = px - this.cx;
    const dy = py - this.cy;

    const R = this.maxR;
    const rIn = R * Math.sqrt(3) / 2; // 内切圆半径 ≈ 0.866R

    // 三对平行边的归一化距离（平顶六边形）
    const u = dy / rIn;                                 // 上下边
    const v = (Math.sqrt(3) * dx + dy) / (2 * rIn);     // 右上-左下
    const w = (-Math.sqrt(3) * dx + dy) / (2 * rIn);    // 右下-左上

    // 硬边界：六边形外 amp=1
    if (Math.abs(u) > 1.01 || Math.abs(v) > 1.01 || Math.abs(w) > 1.01) return 1.0;

    // 六边形驻波：三对平行边驻波的乘积
    // 在 u=±1, v=±1, w=±1（六条边）上 ψ=0
    const p = Math.max(1, m + n - 1);
    let amp = Math.sin(m * Math.PI * (u + 1) * 0.5) *
              Math.sin(n * Math.PI * (v + 1) * 0.5) *
              Math.sin(p * Math.PI * (w + 1) * 0.5);

    if (complexity >= 1) {
      const p2 = Math.max(1, m + n + 1);
      amp += 0.35 * Math.sin((m + 2) * Math.PI * (u + 1) * 0.5) *
                    Math.sin((n + 1) * Math.PI * (v + 1) * 0.5) *
                    Math.sin(p2 * Math.PI * (w + 1) * 0.5);
    }

    amp += 0.08 * (1 + complexity * 0.2) * Math.sin(time * 0.5 + (u + v) * 2);

    return Math.abs(amp);
  }

  // 数值梯度（三点差分）
  _waveFieldWithGrad(px, py, m, n, time, complexity) {
    const d = 4.0;
    const c = this._waveField(px, py, m, n, time, complexity);
    const r = this._waveField(px + d, py, m, n, time, complexity);
    const d_ = this._waveField(px, py + d, m, n, time, complexity);
    return {
      amp: c,
      gx: (r - c) / d,
      gy: (d_ - c) / d,
    };
  }

  update(features, dt) {
    const { bass, mid, high, onset, overall, centroid, peakBins, binCount } = features;
    const p = this.params;
    const viscosity = p.viscosity ?? 0.92;
    const baseStrength = p.strength ?? 220;
    const responseSpeed = p.responseSpeed ?? 0.15;
    const complexity = p.complexity ?? 1;

    const activity = Math.max(0, Math.min(1, overall));
    this.waveTime += dt * 0.02;

    // ---------- 1. FFT 峰值 → m/n 模态 ----------
    const pb = (peakBins && peakBins.length >= 2) ? peakBins : [10, 30, 50];
    const bc = binCount || 1024;

    const safeBin = (b) => (typeof b === 'number' && !isNaN(b) && b > 0) ? b : 10;
    const bin1 = safeBin(pb[0]);
    const bin2 = safeBin(pb[1] || pb[0] + 10);

    const log1 = Math.log2(bin1 + 1);
    const maxLog = Math.log2(bc);
    const norm1 = Math.min(1, log1 / maxLog);
    let targetM = 1 + Math.round(norm1 * 9);

    const log2 = Math.log2(bin2 + 1);
    const norm2 = Math.min(1, log2 / maxLog);
    let targetN = 1 + Math.round(norm2 * 9);

    targetM = Math.max(1, Math.min(10, isNaN(targetM) ? 3 : targetM));
    targetN = Math.max(1, Math.min(10, isNaN(targetN) ? 2 : targetN));

    const totalEnergy = bass + mid + high + 0.001;
    const bassRatio = bass / totalEnergy;
    const highRatio = high / totalEnergy;

    if (bassRatio > 0.6) {
      targetN = Math.max(1, Math.min(2, targetN));
    } else if (highRatio > 0.4) {
      targetM = Math.max(4, Math.min(10, targetM));
      targetN = Math.max(3, Math.min(10, targetN));
    }

    // lerp 插值过渡，比 EMA 更直观可控
    const lerpSpeed = Math.min(1, dt * responseSpeed * 0.5 * (1 + onset * 0.5));
    this.smoothedM += (targetM - this.smoothedM) * lerpSpeed;
    this.smoothedN += (targetN - this.smoothedN) * lerpSpeed;

    if (isNaN(this.smoothedM)) this.smoothedM = 3;
    if (isNaN(this.smoothedN)) this.smoothedN = 2;

    const m = this.smoothedM;
    const n = this.smoothedN;

    // ---------- 2. Onset 扰动 ----------
    this.onsetCooldown = Math.max(0, this.onsetCooldown - dt);
    if (onset > 0.3 && this.onsetCooldown <= 0) {
      this.waveTime += onset * 2.0;
      this.hue = (this.hue + 40 + Math.random() * 40) % 360;
      this.onsetCooldown = 0.15;
    }

    const hueSpeed = 20 + overall * 60;
    this.hue = (this.hue + hueSpeed * dt) % 360;

    // ---------- 3. 粒子更新 ----------
    const strength = baseStrength * activity;
    const damp = Math.pow(viscosity, dt * 60);
    const w = this.width;
    const h = this.height;

    const brownian = 25 * (1 - activity);
    const bounce = activity > 0.1 ? -0.5 : -0.85;

    for (const particle of this.particles) {
      const field = this._waveFieldWithGrad(
        particle.x, particle.y, m, n, this.waveTime, complexity
      );
      const amp = field.amp;

      if (strength > 0.5) {
        const push = -amp * strength * 8.0;
        particle.vx += field.gx * push * dt;
        particle.vy += field.gy * push * dt;
      }

      if (brownian > 0.5) {
        particle.vx += (Math.random() - 0.5) * brownian * dt;
        particle.vy += (Math.random() - 0.5) * brownian * dt;
      }

      particle.vx *= damp;
      particle.vy *= damp;

      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;

      // 画布软边界
      if (particle.x < 0) { particle.x = 0; particle.vx *= bounce; }
      if (particle.x > w) { particle.x = w; particle.vx *= bounce; }
      if (particle.y < 0) { particle.y = 0; particle.vy *= bounce; }
      if (particle.y > h) { particle.y = h; particle.vy *= bounce; }

      // 形态专属边界拉回
      this._applyBoundaryPull(particle, dt);

      // 堆积感
      const nodeProx = 1 - Math.min(1, amp);
      if (nodeProx > 0.35 && activity > 0.1) {
        particle.acc = Math.min(1, particle.acc + dt * 4);
      } else {
        particle.acc *= 0.9;
      }
    }
  }

  render(width, height) {
    const ctx = this.ctx;
    const theme = this.theme;
    if (!ctx || !theme) return;

    const trailAlpha = this.params.trailAlpha ?? theme.trailAlpha ?? 0.08;
    const [br, bgCol, bb] = theme.bg;

    ctx.fillStyle = `rgba(${br},${bgCol},${bb},${trailAlpha})`;
    ctx.fillRect(0, 0, width, height);

    // 多边形模式下禁用旋转对称（m,n 已自带本征对称）
    const shape = this.params.boundaryShape || 'circle';
    let sym = this.params.symmetry || 1;
    if (shape === 'square' || shape === 'triangle' || shape === 'hexagon') sym = 1;

    const cx = width / 2;
    const cy = height / 2;
    const glowStrength = this.params.glowStrength ?? 3;
    const baseSize = this.params.particleSize ?? 1.2;
    const glowThreshold = 0.25;
    const isAudioDriven = theme.mode === 'audioDriven';
    const [pr, pg, pb] = theme.particle || [255, 255, 255];
    const hue = this.hue;
    const sat = 85;

    ctx.shadowBlur = 0;
    for (const p of this.particles) {
      const acc = p.acc;
      const alpha = acc < 0.05 ? 0.12 : 0.25 + acc * 0.75;
      if (alpha < 0.05) continue;

      const s = Math.max(0.5, baseSize * (0.8 + acc * 1.5));
      const half = s * 0.5;
      if (isAudioDriven) {
        const light = 60 + acc * 20;
        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;
      } else {
        ctx.fillStyle = `rgba(${pr},${pg},${pb},${alpha})`;
      }

      this._drawParticle(ctx, p.x, p.y, half, s, sym, cx, cy);
    }

    if (glowStrength > 0) {
      ctx.shadowBlur = glowStrength;
      if (isAudioDriven) {
        ctx.shadowColor = `hsla(${hue}, ${sat}%, 75%, 0.8)`;
      } else {
        ctx.shadowColor = `rgba(${pr},${pg},${pb},0.8)`;
      }
      for (const p of this.particles) {
        if (p.acc < glowThreshold) continue;
        const acc = p.acc;
        const alpha = 0.4 + acc * 0.6;
        const s = Math.max(0.5, baseSize * (0.8 + acc * 1.5));
        const half = s * 0.5;
        if (isAudioDriven) {
          const light = 70 + acc * 15;
          ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;
        } else {
          ctx.fillStyle = `rgba(${pr},${pg},${pb},${alpha})`;
        }

        this._drawParticle(ctx, p.x, p.y, half, s, sym, cx, cy);
      }
      ctx.shadowBlur = 0;
    }
  }

  // ---------- 边界拉回（多形态） ----------
  _applyBoundaryPull(p, dt) {
    const shape = this.params.boundaryShape || 'circle';
    const dcx = p.x - this.cx;
    const dcy = p.y - this.cy;

    switch (shape) {
      case 'square': {
        const nx = dcx / this.maxR;
        const ny = dcy / this.maxR;
        const limit = 1.02; // 几乎紧贴边界就拉回
        const strength = 2.0; // 强力拉回
        if (Math.abs(nx) > limit) {
          const pull = -(Math.abs(nx) - limit) * this.maxR * strength;
          p.vx += Math.sign(nx) * pull * dt;
        }
        if (Math.abs(ny) > limit) {
          const pull = -(Math.abs(ny) - limit) * this.maxR * strength;
          p.vy += Math.sign(ny) * pull * dt;
        }
        break;
      }
      case 'annular': {
        const dist = Math.sqrt(dcx * dcx + dcy * dcy);
        const r = dist / this.maxR;
        const innerR = 0.28;
        if (r > 1.02 && dist > 0.1) {
          const pull = -(dist - this.maxR * 1.02) * 1.5;
          p.vx += (dcx / dist) * pull * dt;
          p.vy += (dcy / dist) * pull * dt;
        } else if (r < innerR * 0.95 && dist > 0.1) {
          const push = (innerR * 0.95 * this.maxR - dist) * 1.5;
          p.vx -= (dcx / dist) * push * dt;
          p.vy -= (dcy / dist) * push * dt;
        }
        break;
      }
      case 'ellipse': {
        const a = 1.0, b = 0.55;
        const rEff = Math.sqrt((dcx / a) ** 2 + (dcy / b) ** 2);
        if (rEff > this.maxR * 1.02 && rEff > 0.1) {
          const pull = -(rEff - this.maxR * 1.02) * 1.5;
          p.vx += (dcx / rEff) * pull * dt;
          p.vy += (dcy / rEff) * pull * dt;
        }
        break;
      }
      case 'triangle':
      case 'hexagon': {
        // 三角形/六边形依赖硬边界势场自动推回，这里只做远距保险
        const dist = Math.sqrt(dcx * dcx + dcy * dcy);
        if (dist > this.maxR * 1.35 && dist > 0.1) {
          const pull = -(dist - this.maxR * 1.35) * 2.0;
          p.vx += (dcx / dist) * pull * dt;
          p.vy += (dcy / dist) * pull * dt;
        }
        break;
      }
      default: { // circle
        const dist = Math.sqrt(dcx * dcx + dcy * dcy);
        if (dist > this.maxR * 1.2 && dist > 0.1) {
          const pull = -(dist - this.maxR * 1.2) * 0.5;
          p.vx += (dcx / dist) * pull * dt;
          p.vy += (dcy / dist) * pull * dt;
        }
        break;
      }
    }
  }

  reset() {
    this._spawnParticles(this.particles.length || (this.params.particleCount || 4000));
    this.waveTime = 0;
    this.smoothedM = 3;
    this.smoothedN = 2;
    this.hue = Math.random() * 360;
    if (this.ctx && this.width && this.height) {
      const [br, bg, bb] = this.theme?.bg || [0, 0, 0];
      this.ctx.fillStyle = `rgb(${br},${bg},${bb})`;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  _drawParticle(ctx, x, y, half, size, sym, cx, cy) {
    ctx.fillRect(x - half, y - half, size, size);
    if (sym === 2) {
      ctx.fillRect(cx * 2 - x - half, y - half, size, size);
    } else if (sym === 4) {
      ctx.fillRect(cx * 2 - x - half, y - half, size, size);
      ctx.fillRect(x - half, cy * 2 - y - half, size, size);
      ctx.fillRect(cx * 2 - x - half, cy * 2 - y - half, size, size);
    } else if (sym > 1) {
      const dpx = x - cx;
      const dpy = y - cy;
      for (let i = 1; i < sym; i++) {
        const ang = (Math.PI * 2 * i) / sym;
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);
        const sx = cx + dpx * cos - dpy * sin;
        const sy = cy + dpx * sin + dpy * cos;
        ctx.fillRect(sx - half, sy - half, size, size);
      }
    }
  }

  getParamConfig() {
    return {
      particleCount: { label: '粒子数', min: 1000, max: 8000, step: 100, default: 4000 },
      strength: { label: '推力', min: 10, max: 500, step: 1, default: 220 },
      viscosity: { label: '阻尼', min: 0.3, max: 0.99, step: 0.01, default: 0.92 },
      symmetry: { label: '对称阶数', min: 1, max: 8, step: 1, default: 2 },
      glowStrength: { label: '辉光强度', min: 0, max: 10, step: 0.5, default: 3 },
      particleSize: { label: '粒子大小', min: 0.5, max: 4, step: 0.1, default: 1.2 },
      responseSpeed: { label: '响应速度', min: 0.01, max: 0.5, step: 0.01, default: 0.15 },
      complexity: { label: '图案复杂度', min: 0, max: 3, step: 1, default: 1 },
      trailAlpha: { label: '拖尾透明度', min: 0.02, max: 0.3, step: 0.01, default: 0.08 },
    };
  }
}
