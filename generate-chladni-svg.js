const fs = require('fs');

// ============ 主题定义 ============
const THEMES = {
  warmSand: { bg: [32,18,12], particle: [255,228,190] },
  ink:      { bg: [10,14,16], particle: [170,180,185] },
  neon:     { bg: [8,6,18],   particle: [180,120,255] },
  aurora:   { bg: [5,10,18],  particle: [100,255,200] },
};

// ============ Chladni 物理核心（与 chladniRenderer.js 一致） ============
function chladniField(x01, y01, m, n) {
  const mx = m * Math.PI * x01;
  const ny = n * Math.PI * y01;
  const nx = n * Math.PI * x01;
  const my = m * Math.PI * y01;

  const cmx = Math.cos(mx), snx = Math.sin(nx), cny = Math.cos(ny), smy = Math.sin(my);
  const cnx = Math.cos(nx), smx = Math.sin(mx), cmy = Math.cos(my), sny = Math.sin(ny);

  const a = cmx * cny;
  const b = cnx * cmy;
  const val = a - b;

  const dx = -m * Math.PI * smx * cny + n * Math.PI * snx * cmy;
  const dy = -n * Math.PI * cmx * sny + m * Math.PI * cnx * smy;
  return { val, dx, dy };
}

function simulate({ W, H, count, m, n, strength, viscosity, frames }) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    particles.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, acc: 0 });
  }

  const dt = 1 / 60;
  const damp = Math.pow(viscosity, dt * 60);

  for (let f = 0; f < frames; f++) {
    for (const p of particles) {
      const x01 = (p.x / W) * 2 - 1;
      const y01 = (p.y / H) * 2 - 1;
      const field = chladniField(x01, y01, m, n);
      const val = field.val;
      const push = -val * strength * 3.5;
      p.vx += field.dx * push * dt;
      p.vy += field.dy * push * dt;
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.x < 0) { p.x = 0; p.vx *= -0.6; }
      if (p.x > W) { p.x = W; p.vx *= -0.6; }
      if (p.y < 0) { p.y = 0; p.vy *= -0.6; }
      if (p.y > H) { p.y = H; p.vy *= -0.6; }

      const nodeProximity = 1 - Math.min(1, Math.abs(val) / 0.35);
      if (nodeProximity > 0.55) p.acc = Math.min(1, p.acc + dt * 2.5);
      else p.acc *= 0.96;
    }
  }
  return particles;
}

// ============ SVG 生成 ============
function toSVG(particles, W, H, theme, title, subtitle) {
  const [br, bg, bb] = theme.bg;
  const [pr, pg, pb] = theme.particle;
  let circles = '';
  for (const p of particles) {
    if (p.acc < 0.05) continue;
    const alpha = 0.35 + p.acc * 0.65;
    const r = 1.0 + p.acc * 3.2;
    circles += `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${r.toFixed(2)}" fill="rgba(${pr},${pg},${pb},${alpha.toFixed(2)})" />\n`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="rgb(${br},${bg},${bb})" />
    <text x="10" y="20" fill="rgba(255,255,255,0.4)" font-size="12" font-family="sans-serif">${title}</text>
    <text x="10" y="36" fill="rgba(255,255,255,0.3)" font-size="11" font-family="sans-serif">${subtitle}</text>
    <g>${circles}</g>
  </svg>`;
}

// ============ 执行多组验证 ============
const W = 800, H = 600, COUNT = 2500;
const configs = [
  { name: 'm3n2-warmsand',  m: 3, n: 2, strength: 80,  visc: 0.92, theme: THEMES.warmSand, frames: 300, title: 'Chladni m=3 n=2', subtitle: '暖沙主题 | 5秒稳定' },
  { name: 'm5n3-warmsand',  m: 5, n: 3, strength: 80,  visc: 0.92, theme: THEMES.warmSand, frames: 300, title: 'Chladni m=5 n=3', subtitle: '暖沙主题 | 对角网格' },
  { name: 'm4n4-degenerate', m: 4, n: 4, strength: 80, visc: 0.92, theme: THEMES.warmSand, frames: 300, title: 'Chladni m=4 n=4 (degenerate)', subtitle: '退化测试：代码应自动规避 m=n' },
  { name: 'm5n3-ink',       m: 5, n: 3, strength: 80,  visc: 0.92, theme: THEMES.ink,      frames: 300, title: 'Chladni m=5 n=3', subtitle: '水墨主题 | 冷灰淡墨' },
  { name: 'm3n2-neon',      m: 3, n: 2, strength: 80,  visc: 0.92, theme: THEMES.neon,     frames: 300, title: 'Chladni m=3 n=2', subtitle: '霓虹主题 | 紫青发光' },
  { name: 'm3n2-aurora',    m: 3, n: 2, strength: 80,  visc: 0.92, theme: THEMES.aurora,   frames: 300, title: 'Chladni m=3 n=2', subtitle: '极光主题 | 青绿渐变' },
];

const outDir = './test-screenshots';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const cfg of configs) {
  console.log(`Simulating ${cfg.name} ...`);
  const pts = simulate({ W, H, count: COUNT, m: cfg.m, n: cfg.n, strength: cfg.strength, viscosity: cfg.visc, frames: cfg.frames });
  const svg = toSVG(pts, W, H, cfg.theme, cfg.title, cfg.subtitle);
  fs.writeFileSync(`${outDir}/${cfg.name}.svg`, svg);
  console.log(`  saved ${outDir}/${cfg.name}.svg`);
}

console.log('All SVG snapshots generated.');
