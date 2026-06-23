const { createCanvas } = require('canvas');
const fs = require('fs');

function run(label, m, n, theme) {
  const W = 400, H = 300;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `rgb(${theme.bg.join(',')})`;
  ctx.fillRect(0,0,W,H);
  const particles = [];
  for(let i=0;i<1200;i++) particles.push({x:Math.random()*W,y:Math.random()*H,vx:0,vy:0,acc:0});
  let tM=m, tN=n;
  if(Math.abs(tM-tN)<1) tN=tM+1;
  const strength=2000, vis=0.92, dt=1/60;
  const damp=Math.pow(vis, dt*60);
  for(let f=0;f<300;f++){
    ctx.fillStyle=`rgba(${theme.bg.join(',')},${theme.trailAlpha??0.15})`;
    ctx.fillRect(0,0,W,H);
    for(const p of particles){
      const x01 = (p.x/W)*2-1;
      const y01 = (p.y/H)*2-1;
      const mx = tM*Math.PI*x01, ny = tN*Math.PI*y01, nx = tN*Math.PI*x01, my = tM*Math.PI*y01;
      const cmx=Math.cos(mx), cny=Math.cos(ny), cnx=Math.cos(nx), cmy=Math.cos(my);
      const val = cmx*cny - cnx*cmy;
      const dx = -tM*Math.PI*Math.sin(mx)*cny + tN*Math.PI*Math.sin(nx)*cmy;
      const dy = -tN*Math.PI*cmx*Math.sin(ny) + tM*Math.PI*cnx*Math.sin(my);
      const push = -val * strength * 3.5;
      p.vx += dx*push*dt; p.vy += dy*push*dt;
      p.vx*=damp; p.vy*=damp;
      p.x+=p.vx*dt; p.y+=p.vy*dt;
      if(p.x<0){p.x=0;p.vx*=-0.6;} if(p.x>W){p.x=W;p.vx*=-0.6;}
      if(p.y<0){p.y=0;p.vy*=-0.6;} if(p.y>H){p.y=H;p.vy*=-0.6;}
      const nodeProximity = 1-Math.min(1,Math.abs(val)/0.35);
      if(nodeProximity>0.55) p.acc=Math.min(1,p.acc+dt*2.5); else p.acc*=0.96;
    }
    ctx.fillStyle=`rgb(${theme.particle.join(',')})`;
    for(const p of particles) if(p.acc>0.05) ctx.fillRect(p.x,p.y,1.2,1.2);
  }
  fs.writeFileSync(`test-screenshots/preview-${label}.png`, canvas.toBuffer('image/png'));
  console.log('saved', label);
}

const THEMES = {
  warmSand: { bg:[32,18,12], particle:[255,228,190], trailAlpha:0.18 },
  ink:      { bg:[10,14,16], particle:[170,180,185], trailAlpha:0.04 },
  neon:     { bg:[6,6,10],   particle:[0,255,128],   trailAlpha:0.12 },
  aurora:   { bg:[2,10,14],  particle:[100,255,218], trailAlpha:0.10 },
};

run('m5n3-warmSand', 5, 3, THEMES.warmSand);
run('m5n3-ink',      5, 3, THEMES.ink);
run('m5n3-neon',     5, 3, THEMES.neon);
run('m5n3-aurora',   5, 3, THEMES.aurora);
