const { createCanvas } = require('canvas');
const fs = require('fs');

const W = 800;
const H = 600;
const CX = W / 2;
const CY = H / 2;
const MAX_R = Math.min(CX, CY);

function initSources(count) {
  const sources = [];
  const freqs = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    const r = MAX_R * 0.82;
    sources.push({ x: CX + Math.cos(angle) * r, y: CY + Math.sin(angle) * r });
    freqs.push(0.04 + i * 0.015);
  }
  return { sources, freqs };
}

function waveField(px, py, sources, freqs, time, waveSpeed) {
  const d = 2.5;
  let c = 0, r = 0, d_ = 0;
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const freq = freqs[i];
    const phase = 2 * Math.PI * freq;
    const distC = Math.sqrt((px - s.x) ** 2 + (py - s.y) ** 2);
    c += Math.sin(phase * (time - distC / waveSpeed));
    const distR = Math.sqrt((px + d - s.x) ** 2 + (py - s.y) ** 2);
    r += Math.sin(phase * (time - distR / waveSpeed));
    const distD = Math.sqrt((px - s.x) ** 2 + (py + d - s.y) ** 2);
    d_ += Math.sin(phase * (time - distD / waveSpeed));
  }
  c = Math.abs(c); r = Math.abs(r); d_ = Math.abs(d_);
  return { val: c, gx: (r - c) / d, gy: (d_ - c) / d };
}

function simulate(sources, freqs, time, activity, frames = 180) {
  const particles = [];
  const count = 2000;
  for (let i = 0; i < count; i++) {
    particles.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, acc: 0 });
  }
  const strength = 100 * activity;
  const brownian = 45 * (1 - activity);
  const damp = Math.pow(0.92, 1);
  const waveSpeed = 130;
  const dt = 1 / 60;
  const srcCount = sources.length;

  for (let f = 0; f < frames; f++) {
    for (const p of particles) {
      const field = waveField(p.x, p.y, sources, freqs, time, waveSpeed);
      const val = field.val;
      if (strength > 0.5) {
        const push = -val * strength * 10.0;
        p.vx += field.gx * push * dt;
        p.vy += field.gy * push * dt;
      }
      if (brownian > 0.5) {
        p.vx += (Math.random() - 0.5) * brownian * dt;
        p.vy += (Math.random() - 0.5) * brownian * dt;
      }
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < 0) { p.x = 0; p.vx *= -0.5; }
      if (p.x > W) { p.x = W; p.vx *= -0.5; }
      if (p.y < 0) { p.y = 0; p.vy *= -0.5; }
      if (p.y > H) { p.y = H; p.vy *= -0.5; }

      const nodeProx = 1 - Math.min(1, val / srcCount);
      if (nodeProx > 0.6 && activity > 0.1) {
        p.acc = Math.min(1, p.acc + dt * 3);
      } else {
        p.acc *= 0.92;
      }
      if (val < 0.06 && activity > 0.1) {
        p.x = Math.random() * W;
        p.y = Math.random() * H;
        p.vx = 0; p.vy = 0; p.acc = 0;
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

// 不同波源数 + 不同频率 + 不同时间
const s4 = initSources(4);
draw(simulate(s4.sources, s4.freqs, 0, 1.0, 180), 'wave-4src-t0');
draw(simulate(s4.sources, s4.freqs, 60, 1.0, 180), 'wave-4src-t60');
draw(simulate(s4.sources, s4.freqs, 120, 1.0, 180), 'wave-4src-t120');

const s3 = initSources(3);
s3.freqs = [0.08, 0.12, 0.18];
draw(simulate(s3.sources, s3.freqs, 0, 1.0, 180), 'wave-3src-highf');

const s5 = initSources(5);
draw(simulate(s5.sources, s5.freqs, 0, 0.0, 180), 'wave-silent');
