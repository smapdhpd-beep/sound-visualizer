const { createCanvas } = require('canvas');
const fs = require('fs');

const W = 800;
const H = 600;
const CX = W / 2;
const CY = H / 2;
const MAX_R = Math.min(CX, CY);

function getSources(count, breathe, sourceRotation, eccentricity, time) {
  const sources = [];
  for (let i = 0; i < count; i++) {
    const baseAngle = (Math.PI * 2 * i) / count - Math.PI / 2;
    const localRot = sourceRotation * (1 + Math.sin(i * 1.7) * 0.35);
    const angle = baseAngle + localRot + Math.sin(time * 0.2 + i * 1.3) * eccentricity;
    const r = MAX_R * breathe * (1 + Math.sin(angle * 2 + i) * eccentricity * 0.35);
    sources.push({ x: CX + Math.cos(angle) * r, y: CY + Math.sin(angle) * r });
  }
  return sources;
}

function getFreqs(count, baseFreq, freqSpread) {
  const freqs = [];
  for (let i = 0; i < count; i++) {
    freqs.push(baseFreq + i * freqSpread + Math.sin(i * 2.3) * 0.015);
  }
  return freqs;
}

function waveField(px, py, sources, freqs, time, waveSpeed) {
  const d = 6.0; // 增大差分步长，获得更稳定的梯度
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

function simulate(count, bass, high, mid, centroid, activity, frames = 400) {
  const particles = [];
  for (let i = 0; i < 2000; i++) {
    particles.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, acc: 0 });
  }
  const strength = 150 * activity;
  const brownian = 50 * (1 - activity);
  const damp = Math.pow(0.92, 1);
  const waveSpeed = 130;
  const dt = 1 / 60;

  let waveTime = 0;
  let sourceRotation = 0;
  const breathe = 0.30 + bass * 0.30;
  const eccentricity = (centroid ?? 0) * 0.6;
  const spectralTilt = (centroid ?? 0) * 0.5 + high * 0.3;
  const baseFreq = 0.06 + spectralTilt * 0.20;
  const freqSpread = 0.03 + high * 0.15 + (mid ?? 0) * 0.04;

  for (let f = 0; f < frames; f++) {
    waveTime += dt * (0.1 + activity * 0.2);
    sourceRotation += dt * (0.01 + high * 0.08);
    const sources = getSources(count, breathe, sourceRotation, eccentricity, waveTime);
    const freqs = getFreqs(count, baseFreq, freqSpread);

    for (const p of particles) {
      const field = waveField(p.x, p.y, sources, freqs, waveTime, waveSpeed);
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

      const nodeProx = 1 - Math.min(1, val / sources.length);
      if (nodeProx > 0.4 && activity > 0.1) {
        p.acc = Math.min(1, p.acc + dt * 3);
      } else {
        p.acc *= 0.92;
      }
      if (val < 0.018 && activity > 0.15 && Math.random() < 0.02) {
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

// 模拟不同"音乐风格"产生的图案（约 6.6 秒演化）
// 风格 A：重低音电子（bass=0.9, high=0.2, mid=0.4, centroid=0.3）
draw(simulate(4, 0.9, 0.2, 0.4, 0.3, 1.0, 400), 'audio-bass-heavy');

// 风格 B：高频人声（bass=0.2, high=0.8, mid=0.6, centroid=0.5）
draw(simulate(4, 0.2, 0.8, 0.6, 0.5, 1.0, 400), 'audio-high-vocal');

// 风格 C：全频复杂（bass=0.6, high=0.7, mid=0.8, centroid=0.6, 5波源）
draw(simulate(5, 0.6, 0.7, 0.8, 0.6, 1.0, 400), 'audio-full-mix');

// 静音
draw(simulate(4, 0, 0, 0, 0, 0.0, 400), 'audio-silent');
