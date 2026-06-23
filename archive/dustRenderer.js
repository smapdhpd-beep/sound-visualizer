/**
 * DustRenderer — 呼吸光尘
 * 支持全局配色、对称系统（2/4/6/8）、参数实时响应
 */

import { BaseRenderer } from './baseRenderer.js';

export class DustRenderer extends BaseRenderer {
  constructor() {
    super('dust');
    this.particles = [];
    this.mouse = { x: -9999, y: -9999, active: false };
    this.time = 0;
    this._colorScratch = [0, 0, 0];
  }

  init(canvas) {
    super.init(canvas);
    this._rebuildParticles();
  }

  _rebuildParticles() {
    const target = this.params.particleCount || (window.innerWidth < 768 ? 2000 : 6000);
    const sym = this.params.symmetry || 1;
    // 高对称时适当降量，保持总绘制开销可控
    const count = Math.floor(target / Math.max(1, sym * 0.4));
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: 0,
        vy: 0,
        life: Math.random(),
        size: Math.random() * 2 + 0.5,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  _onParamsChange() {
    // particleCount 或 symmetry 改变时重建粒子数组
    this._rebuildParticles();
  }

  setTheme(theme) {
    super.setTheme(theme);
  }

  resize(width, height) {
    super.resize(width, height);
    this._rebuildParticles();
  }

  update(features, dt) {
    this.time += dt;
    const { bass, mid, high, overall, onset } = features;
    const viscosity = this.params.viscosity ?? 0.92;
    const spread = this.params.spread ?? 80;
    const noiseTime = this.time * 0.3;

    for (const p of this.particles) {
      // 力场：多层 sin 叠加模拟 Simplex 噪声
      const angle =
        Math.sin(p.x * 0.004 + noiseTime + p.phase) *
        Math.cos(p.y * 0.004 + noiseTime * 0.7) *
        Math.PI * 2;

      let fx = Math.cos(angle);
      let fy = Math.sin(angle);

      // spread + bass 驱动力场幅度
      const forceScale = spread * (0.3 + bass * 1.2);
      fx *= forceScale;
      fy *= forceScale;

      // Onset 迸发：随机冲击
      if (onset > 0.25) {
        const kick = onset * 300;
        fx += (Math.random() - 0.5) * kick;
        fy += (Math.random() - 0.5) * kick;
      }

      // 鼠标/触摸斥力
      if (this.mouse.active) {
        const dx = p.x - this.mouse.x;
        const dy = p.y - this.mouse.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 22500) { // 150px
          const dist = Math.sqrt(distSq) + 0.1;
          const force = (150 - dist) / 150 * 400;
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        }
      }

      // 积分
      p.vx += fx * dt;
      p.vy += fy * dt;
      p.vx *= viscosity;
      p.vy *= viscosity;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // 边缘环绕
      if (p.x < 0) p.x += this.width;
      if (p.x > this.width) p.x -= this.width;
      if (p.y < 0) p.y += this.height;
      if (p.y > this.height) p.y -= this.height;

      // 生命律动：high 驱动闪烁速度
      p.life += (high * 0.15 + 0.02) * dt;
      if (p.life > 1) p.life -= 1;
    }
  }

  render(width, height) {
    const ctx = this.ctx;
    const theme = this.theme;
    if (!ctx || !theme) return;

    const [br, bg, bb] = theme.bg;
    const trail = this.params.trail ?? 0.15;
    ctx.fillStyle = `rgba(${br},${bg},${bb},${trail})`;
    ctx.fillRect(0, 0, width, height);

    const sym = this.params.symmetry || 1;
    const cx = width / 2;
    const cy = height / 2;
    const [pr, pg, pb] = theme.particle;
    const blend = theme.blend || 'lighter';

    ctx.globalCompositeOperation = blend;

    for (const p of this.particles) {
      const alpha = 0.25 + Math.sin(p.life * Math.PI) * 0.75;
      const size = p.size * (1 + this.params.spread / 200);

      // 基础绘制函数
      const drawDot = (x, y, a) => {
        ctx.fillStyle = `rgba(${pr},${pg},${pb},${a * 0.7})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      };

      drawDot(p.x, p.y, alpha);

      // 对称绘制
      if (sym === 2) {
        drawDot(cx * 2 - p.x, p.y, alpha);
      } else if (sym === 4) {
        drawDot(cx * 2 - p.x, p.y, alpha);
        drawDot(p.x, cy * 2 - p.y, alpha);
        drawDot(cx * 2 - p.x, cy * 2 - p.y, alpha);
      } else if (sym > 1) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        for (let s = 1; s < sym; s++) {
          const ang = (Math.PI * 2 * s) / sym;
          const cos = Math.cos(ang);
          const sin = Math.sin(ang);
          drawDot(cx + dx * cos - dy * sin, cy + dx * sin + dy * cos, alpha);
        }
      }
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  getParamConfig() {
    return {
      particleCount: { label: '粒子数', min: 500, max: 8000, step: 100, default: 6000 },
      viscosity: { label: '黏滞', min: 0.5, max: 0.99, step: 0.01, default: 0.92 },
      spread: { label: '扩散', min: 0, max: 200, step: 1, default: 80 },
      symmetry: { label: '对称', min: 1, max: 8, step: 1, default: 1 },
      trail: { label: '拖尾', min: 0.02, max: 0.5, step: 0.01, default: 0.15 },
    };
  }

  onPointerDown(x, y) {
    this.mouse.x = x;
    this.mouse.y = y;
    this.mouse.active = true;
  }
  onPointerMove(x, y) {
    this.mouse.x = x;
    this.mouse.y = y;
    this.mouse.active = true;
  }
  onPointerUp() {
    this.mouse.active = false;
  }
}
