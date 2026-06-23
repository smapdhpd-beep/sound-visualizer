const { createCanvas } = require('canvas');
const fs = require('fs');

const W = 800, H = 600, CX = W/2, CY = H/2, MAX_R = Math.min(CX,CY);

function getSources(count, breathe) {
  const sources = [];
  for (let i = 0; i < count; i++) {
    const baseAngle = (Math.PI * 2 * i) / count - Math.PI / 2;
    const r = MAX_R * breathe;
    sources.push({ x: CX + Math.cos(baseAngle) * r, y: CY + Math.sin(baseAngle) * r });
  }
  return sources;
}

function getFreqs(count, baseFreq, freqSpread) {
  const f = [];
  for (let i = 0; i < count; i++) f.push(baseFreq + i*freqSpread + Math.sin(i*2.3)*0.015);
  return f;
}

function waveField(px, py, sources, freqs, time, waveSpeed) {
  const d = 6.0;
  let c=0,r=0,d_=0;
  for (let i=0;i<sources.length;i++){
    const s=sources[i], freq=freqs[i], phase=2*Math.PI*freq;
    const distC=Math.sqrt((px-s.x)**2+(py-s.y)**2);
    c+=Math.sin(phase*(time-distC/waveSpeed));
    const distR=Math.sqrt((px+d-s.x)**2+(py-s.y)**2);
    r+=Math.sin(phase*(time-distR/waveSpeed));
    const distD=Math.sqrt((px-s.x)**2+(py+d-s.y)**2);
    d_+=Math.sin(phase*(time-distD/waveSpeed));
  }
  c=Math.abs(c); r=Math.abs(r); d_=Math.abs(d_);
  return {val:c, gx:(r-c)/d, gy:(d_-c)/d};
}

function simulate(count, bass, high, mid, centroid, activity, frames, name) {
  const particles=[];
  for(let i=0;i<4000;i++) particles.push({x:Math.random()*W,y:Math.random()*H,vx:0,vy:0,acc:0});
  const strength=200*activity;
  const brownian=45*(1-activity)+3*activity;
  const damp=Math.pow(0.92,1);
  const waveSpeed=130;
  const dt=1/60;

  let waveTime=5.0;
  const breathe=0.30+bass*0.30;
  const spectralTilt=(centroid??0)*0.5+high*0.3;
  const baseFreq=0.06+spectralTilt*0.20;
  const freqSpread=0.03+high*0.15+(mid??0)*0.04;

  const canvas=createCanvas(W,H);
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='rgb(10,14,16)';
  ctx.fillRect(0,0,W,H);

  for(let f=0;f<frames;f++){
    waveTime+=dt*0.02;
    const sources=getSources(count,breathe);
    const freqs=getFreqs(count,baseFreq,freqSpread);

    for(const p of particles){
      const field=waveField(p.x,p.y,sources,freqs,waveTime,waveSpeed);
      const val=field.val;
      if(strength>0.5){
        const push=-val*strength*10.0;
        p.vx+=field.gx*push*dt;
        p.vy+=field.gy*push*dt;
      }
      if(brownian>0.5){
        p.vx+=(Math.random()-0.5)*brownian*dt;
        p.vy+=(Math.random()-0.5)*brownian*dt;
      }
      p.vx*=damp; p.vy*=damp;
      p.x+=p.vx*dt; p.y+=p.vy*dt;
      if(p.x<0){p.x=0;p.vx*=-0.5;}
      if(p.x>W){p.x=W;p.vx*=-0.5;}
      if(p.y<0){p.y=0;p.vy*=-0.5;}
      if(p.y>H){p.y=H;p.vy*=-0.5;}

      const nodeProx=1-Math.min(1,val/sources.length);
      if(nodeProx>0.4&&activity>0.1) p.acc=Math.min(1,p.acc+dt*3);
      else p.acc*=0.92;

      if(val<0.018&&activity>0.15&&Math.random()<0.02){
        p.x=Math.random()*W; p.y=Math.random()*H; p.vx=0; p.vy=0; p.acc=0;
      }
    }

    ctx.fillStyle='rgba(10,14,16,0.12)';
    ctx.fillRect(0,0,W,H);

    for(const p of particles){
      const acc=p.acc;
      const size=acc<0.04?1.5:1.4+acc*4.6;
      const alpha=acc<0.04?0.28:0.45+acc*0.55;
      if(alpha<0.05) continue;
      const half=size*0.5;
      ctx.fillStyle=`rgba(170,180,185,${alpha})`;
      ctx.fillRect(p.x-half,p.y-half,size,size);
      if(acc>0.35){
        const glow=size*2.2;
        const gh=glow*0.5;
        ctx.fillStyle=`rgba(170,180,185,${alpha*0.22})`;
        ctx.fillRect(p.x-gh,p.y-gh,glow,glow);
      }
    }
  }

  fs.writeFileSync(`test-screenshots/${name}.png`,canvas.toBuffer('image/png'));
  console.log('saved',name);
}

simulate(4, 0.9, 0.2, 0.4, 0.3, 1.0, 800, 'trail-bass');
simulate(4, 0.2, 0.8, 0.6, 0.5, 1.0, 800, 'trail-high');
simulate(5, 0.6, 0.7, 0.8, 0.6, 1.0, 800, 'trail-mix');
simulate(4, 0, 0, 0, 0, 0.0, 800, 'trail-silent');
