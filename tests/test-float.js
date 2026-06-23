const { createCanvas } = require('canvas');
const fs = require('fs');

const W = 800;
const H = 600;
const MAX_R = Math.min(W, H) / 2;
const CX = W / 2;
const CY = H / 2;

function fieldPolar(px, py, m, n) {
  const dx = px - CX;
  const dy = py - CY;
  const rPix = Math.sqrt(dx * dx + dy * dy);
  if (rPix < 0.5) return { val: 0, dx: 0, dy: 0 };
  const rNorm = rPix / MAX_R;
  if (rNorm > 1.0) {
    const f = -1.5 / rPix;
    return { val: 0, dx: dx * f, dy: dy * f };
  }
  const theta = Math.atan2(dy, dx);
  const mPi = m * Math.PI;
  const sinMPiR = Math.sin(mPi * rNorm);
  const cosNTheta = Math.cos(n * theta);
  const val = sinMPiR * cosNTheta;
  const cosMPiR = Math.cos(mPi * rNorm);
  const sinNTheta = Math.sin(n * theta);
  const df_drNorm = mPi * cosMPiR * cosNTheta;
  const df_dtheta = -n * sinMPiR * sinNTheta;
  const invR = 1.0 / rPix;
  const invR2 = invR * invR;
  const invMaxR = 1.0 / MAX_R;
  return {
    val,
    dx: df_drNorm * invMaxR * (dx * invR) + df_dtheta * (-dy * invR2),
    dy: df_drNorm * invMaxR * (dy * invR) + df_dtheta * (dx * invR2),
  };
}

function simulate(mStart, nStart, frames = 240) {
  const particles = [];
  const count = 2000;
  for (let i = 0; i < count; i++) {
    particles.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, acc: 0 });
  }
  let m = mStart;
  let n = nStart;
  const dt = 1 / 60;
  const damp = Math.pow(0.92, 1);
  const strength = 100;

  for (let f = 0; f < frames; f++) {
    // 模拟持续变形：m/n 每帧缓慢漂移
    m += 0.008;
    n += 0.005;
    if (m > 6) m = 1.5;
    if (n > 5) n = 0.5;

    for (const p of particles) {
      const field = fieldPolar(p.x, p.y, m, n);
      const push = -field.val * strength * 15.0;
      p.vx += field.dx * push * dt;
      p.vy += field.dy * push * dt;

      const dx_ = p.x - W * 0.5;
      const dy_ = p.y - H * 0.5;
      const dist_ = Math.sqrt(dx_ * dx_ + dy_ * dy_);
      if (dist_ > MAX_R && dist_ > 0) {
        p.vx -= (dx_ / dist_) * 2.0 * dt;
        p.vy -= (dy_ / dist_) * 2.0 * dt;
      }

      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.x < 0) { p.x = 0; p.vx *= -0.5; }
      if (p.x > W) { p.x = W; p.vx *= -0.5; }
      if (p.y < 0) { p.y = 0; p.vy *= -0.5; }
      if (p.y > H) { p.y = H; p.vy *= -0.5; }

      const nodeProx = 1 - Math.min(1, Math.abs(field.val) / 0.35);
      if (nodeProx > 0.55) {
        p.acc = Math.min(1, p.acc + dt * 2.5);
      } else {
        p.acc *= 0.94;
      }
    }
  }
  return particles;
}

function draw(particles, name) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(10,14,16)';
  ctx.fillRect(0, 0, W, H);
  for (const p of particles) {
    const acc = p.acc;
    const size = acc < 0.04 ? 1.2 : 1.0 + acc * 3.2;
    const alpha = acc < 0.04 ? 0.22 : 0.35 + acc * 0.65;
    if (alpha < 0.05) continue;
    const s = size;
    const half = s * 0.5;
    ctx.fillStyle = `rgba(170,180,185,${alpha})`;
    ctx.fillRect(p.x - half, p.y - half, s, s);
  }
  fs.writeFileSync(`test-screenshots/${name}.png`, canvas.toBuffer('image/png'));
  console.log('saved', name);
}

// 模拟 3 个时间切片，展示同一首歌播放过程中图案持续变形
draw(simulate(2.0, 1.5, 120), 'float-t0');
draw(simulate(2.0 + 120*0.008, 1.5 + 120*0.005, 120), 'float-t1');
draw(simulate(2.0 + 240*0.008, 1.5 + 240*0.005, 120), 'float-t2');
