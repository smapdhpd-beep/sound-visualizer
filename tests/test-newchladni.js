const { createCanvas } = require('canvas');
const fs = require('fs');

// Minimal stub for BaseRenderer
class BaseRenderer {
  constructor(name) { this.name = name; this.params = {}; }
  init(canvas) { this.ctx = canvas.getContext('2d'); this.width = canvas.width; this.height = canvas.height; }
  resize(w, h) { this.width = w; this.height = h; }
  setTheme(t) { this.theme = t; }
  destroy() {}
}

// Inline the new renderer logic for headless validation
const W = 800, H = 600, CX = W/2, CY = H/2, MAX_R = Math.min(CX,CY);

function waveField(px, py, m, n, time, complexity) {
  const dx = px - CX, dy = py - CY;
  const dist = Math.sqrt(dx*dx + dy*dy);
  let r = dist / MAX_R;
  if (r > 1.0) r = 1.0 + (r - 1.0) * 0.3;
  const theta = Math.atan2(dy, dx);
  let amp = Math.sin(m * Math.PI * r) * Math.cos(n * theta);
  const harmonics = [{mOff:2,nOff:2,coef:0.30},{mOff:4,nOff:4,coef:0.20},{mOff:6,nOff:6,coef:0.15}];
  for (let i=0;i<complexity&&i<harmonics.length;i++){
    const h=harmonics[i];
    amp += h.coef * Math.sin((m+h.mOff)*Math.PI*r) * Math.cos((n+h.nOff)*theta);
  }
  amp += 0.1 * Math.sin(time*0.5 + r*3);
  return Math.abs(amp);
}

function waveGrad(px,py,m,n,time,complexity){
  const d=4.0;
  const c=waveField(px,py,m,n,time,complexity);
  const r=waveField(px+d,py,m,n,time,complexity);
  const d_=waveField(px,py+d,m,n,time,complexity);
  return {amp:c,gx:(r-c)/d,gy:(d_-c)/d};
}

function simulate(m,n,complexity,frames,name){
  const particles=[];
  for(let i=0;i<4000;i++)particles.push({x:Math.random()*W,y:Math.random()*H,vx:0,vy:0,acc:0});
  const strength=150;
  const damp=Math.pow(0.92,1);
  const dt=1/60;
  let time=0;

  const canvas=createCanvas(W,H);
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='rgb(0,0,0)';
  ctx.fillRect(0,0,W,H);

  for(let f=0;f<frames;f++){
    time+=dt*0.02;
    for(const p of particles){
      const field=waveGrad(p.x,p.y,m,n,time,complexity);
      const push=-field.amp*strength*8.0;
      p.vx+=field.gx*push*dt;
      p.vy+=field.gy*push*dt;
      p.vx+=(Math.random()-0.5)*5*dt;
      p.vy+=(Math.random()-0.5)*5*dt;
      p.vx*=damp;p.vy*=damp;
      p.x+=p.vx*dt;p.y+=p.vy*dt;
      if(p.x<0){p.x=0;p.vx*=-0.5;}
      if(p.x>W){p.x=W;p.vx*=-0.5;}
      if(p.y<0){p.y=0;p.vy*=-0.5;}
      if(p.y>H){p.y=H;p.vy*=-0.5;}
      const nodeProx=1-Math.min(1,field.amp);
      if(nodeProx>0.35)p.acc=Math.min(1,p.acc+dt*4);
      else p.acc*=0.9;
    }
    ctx.fillStyle='rgba(0,0,0,0.08)';
    ctx.fillRect(0,0,W,H);
    for(const p of particles){
      const acc=p.acc;
      const alpha=acc<0.05?0.12:0.25+acc*0.75;
      if(alpha<0.05)continue;
      const s=Math.max(0.5,1.2*(0.8+acc*1.5));
      const half=s*0.5;
      ctx.fillStyle=`rgba(255,255,255,${alpha})`;
      ctx.fillRect(p.x-half,p.y-half,s,s);
    }
  }
  fs.writeFileSync(`test-screenshots/${name}.png`,canvas.toBuffer('image/png'));
  console.log('saved',name,'m=',m.toFixed(1),'n=',n.toFixed(1));
}

simulate(2,1,1,600,'new-m2n1');
simulate(4,3,1,600,'new-m4n3');
simulate(6,5,2,600,'new-m6n5-c2');
simulate(3,0,1,600,'new-m3n0');
