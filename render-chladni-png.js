const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'test-screenshots');

const THEMES = {
  warmSand: {
    bg: [32, 18, 12],
    particle: [255, 228, 190],
    trailAlpha: 0.18,
  },
  ink: {
    bg: [10, 14, 16],
    particle: [170, 180, 185],
    trailAlpha: 0.04,
  },
  neon: {
    bg: [6, 6, 10],
    particle: [0, 255, 128],
    trailAlpha: 0.12,
  },
  aurora: {
    bg: [2, 10, 14],
    particle: [100, 255, 218],
    trailAlpha: 0.10,
  },
};

function _chladniField(x01, y01, m, n) {
  const mx = m * Math.PI * x01;
  const ny = n * Math.PI * y01;
  const nx = n * Math.PI * x01;
  const my = m * Math.PI * y01;
  const cmx = Math.cos(mx);
  const snx = Math.sin(nx);
  const cny = Math.cos(ny);
  const smy = Math.sin(my);
  const cnx = Math.cos(nx);
  const smx = Math.sin(mx);
  const sny = Math.sin(ny);
  const cmy = Math.cos(my);
  const val = cmx * cny - cnx * cmy;
  const dx = -Math.PI * (m * smx * cny - n * snx * cmy);
  const dy = -Math.PI * (n * cmx * sny - m * cnx * smy);
  return { val, dx, dy };
}

function simulateAndRender({ label, m, n, themeName, particleCount = 2500 }) {
  const theme = THEMES[themeName];
  const W = 800;
  const H = 600;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bg = `rgb(${theme.bg.join(',')})`;
  const pcol = `rgb(${theme.particle.join(',')})`;

  // fill bg
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const particles = [];
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: 0,
      vy: 0,
    });
  }

  let tM = m;
  let tN = n;
  if (Math.abs(tM - tN) < 1) tN = tM + 1;

  const strength = 2000;
  const viscosity = 0.96;
  const dt = 1 / 60;
  const damp = Math.pow(viscosity, dt * 60);

  for (let frame = 0; frame < 300; frame++) {
    // trail fade
    ctx.fillStyle = `rgba(${theme.bg.join(',')}, ${theme.trailAlpha})`;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < particleCount; i++) {
      const p = particles[i];
      const x01 = p.x / W;
      const y01 = p.y / H;
      const { val, dx, dy } = _chladniField(x01, y01, tM, tN);
      const push = -val * strength * 3.5;
      p.vx += dx * push * dt;
      p.vy += dy * push * dt;
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // boundary wrap
      if (p.x < 0) p.x += W;
      if (p.x >= W) p.x -= W;
      if (p.y < 0) p.y += H;
      if (p.y >= H) p.y -= H;

      const acc = Math.hypot(p.vx, p.vy);
      if (acc < 0.05) continue;

      ctx.fillStyle = pcol;
      ctx.fillRect(p.x, p.y, 1.5, 1.5);
    }
  }

  // draw final particles on top for clarity
  ctx.fillStyle = pcol;
  for (let i = 0; i < particleCount; i++) {
    const p = particles[i];
    ctx.fillRect(p.x, p.y, 1.5, 1.5);
  }

  const buf = canvas.toBuffer('image/png');
  const outPath = path.join(OUT, `${label}-${themeName}.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`Wrote ${outPath}`);
}

// Run
simulateAndRender({ label: 'm3n2', m: 3, n: 2, themeName: 'warmSand' });
simulateAndRender({ label: 'm3n2', m: 3, n: 2, themeName: 'ink' });
simulateAndRender({ label: 'm5n3', m: 5, n: 3, themeName: 'warmSand' });
simulateAndRender({ label: 'm5n3', m: 5, n: 3, themeName: 'neon' });
simulateAndRender({ label: 'degenerate', m: 4, n: 4, themeName: 'aurora' });
