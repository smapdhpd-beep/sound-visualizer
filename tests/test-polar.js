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
    const pull = 1.5;
    const f = -pull / rPix;
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

function simulate(m, n, activity, frames = 300) {
  const particles = [];
  const count = 2000;
  for (let i = 0; i < count; i++) {
    particles.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, acc: 0 });
  }
  const strength = 100 * activity;
  const brownian = 50 * (1 - activity);
  const bounce = activity > 0.1 ? -0.5 : -0.85;
  const damp = Math.pow(0.92, 1);
  const dt = 1 / 60;

  for (let f = 0; f < frames; f++) {
    for (const p of particles) {
      const field = fieldPolar(p.x, p.y, m, n);
      const val = field.val;
      const gx = field.dx;
      const gy = field.dy;

      if (strength > 0.5) {
        const push = -val * strength * 15.0;
        p.vx += gx * push * dt;
        p.vy += gy * push * dt;
      }

      const dx_ = p.x - W * 0.5;
      const dy_ = p.y - H * 0.5;
      const dist_ = Math.sqrt(dx_ * dx_ + dy_ * dy_);
      if (dist_ > MAX_R && dist_ > 0) {
        const pull = 2.0;
        p.vx -= (dx_ / dist_) * pull * dt;
        p.vy -= (dy_ / dist_) * pull * dt;
      }

      if (brownian > 1) {
        p.vx += (Math.random() - 0.5) * brownian * dt;
        p.vy += (Math.random() - 0.5) * brownian * dt;
      }
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.x < 0) { p.x = 0; p.vx *= bounce; }
      if (p.x > W) { p.x = W; p.vx *= bounce; }
      if (p.y < 0) { p.y = 0; p.vy *= bounce; }
      if (p.y > H) { p.y = H; p.vy *= bounce; }

      const nodeProx = 1 - Math.min(1, Math.abs(val) / 0.35);
      if (nodeProx > 0.55 && activity > 0.1) {
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

[
  { m: 2, n: 0, act: 1.0, name: 'v3-m2n0' },
  { m: 1, n: 3, act: 1.0, name: 'v3-m1n3' },
  { m: 2, n: 4, act: 1.0, name: 'v3-m2n4' },
  { m: 3, n: 2, act: 0.0, name: 'v3-silent' },
].forEach(t => draw(simulate(t.m, t.n, t.act), t.name));
