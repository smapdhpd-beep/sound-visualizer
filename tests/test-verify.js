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

function simulate(count, bass, high, mid, centroid, activity, frames, name, sym=1) {
  const particles=[];
  for(let i=0;i<4000;i++) particles.push({x:Math.random()*W,y:Math.random()*H,vx:0,vy:0,acc:0});
  const strength=200*activity;
  const brownian=45*(1-activity)+3*activity;
  const viscosity=0.92;
  const damp=Math.pow(viscosity,1);
  const waveSpeed=130;
  const dt=1/60;
  let waveTime=5.0;
  let smoothedBaseFreq=0.06;
  let smoothedFreqSpread=0.03;
  const breathe=0.30+bass*0.30;
  const rebirthProb=activity>0.15?(1-Math.pow(0.998,dt*60)):0;

  const canvas=createCanvas(W,H);
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='rgb(10,14,16)';
  ctx.fillRect(0,0,W,H);

  for(let f=0;f<frames;f++){
    waveTime+=dt*0.02;
    const spectralTilt=(centroid??0)*0.5+high*0.3;
    const targetBaseFreq=0.06+spectralTilt*0.20;
    const targetFreqSpread=0.03+high*0.15+(mid??0)*0.04;
    smoothedBaseFreq+=(targetBaseFreq-smoothedBaseFreq)*0.15;
    smoothedFreqSpread+=(targetFreqSpread-smoothedFreqSpread)*0.15;
    const freqs=getFreqs(count,smoothedBaseFreq,smoothedFreqSpread);
    const sources=getSources(count,breathe);

    for(const p of particles){
      const field=waveField(p.x,p.y,sources,freqs,waveTime,waveSpeed);
      const val=field.val;
      const srcCount=sources.length;
      const nodeProx=1-Math.min(1,val/srcCount);

      if(strength>0.5){
        const push=-val*strength*10.0;
        p.vx+=field.gx*push*dt;
        p.vy+=field.gy*push*dt;
      }
      let effBrownian=brownian;
      let effDamp=damp;
      if(nodeProx>0.55){
        const stick=(nodeProx-0.55)/0.45*0.85;
        effBrownian*=(1-stick);
        effDamp=1-(1-damp)*(1-stick*0.5);
      }
      if(effBrownian>0.5){
        p.vx+=(Math.random()-0.5)*effBrownian*dt;
        p.vy+=(Math.random()-0.5)*effBrownian*dt;
      }
      p.vx*=effDamp; p.vy*=effDamp;
      p.x+=p.vx*dt; p.y+=p.vy*dt;
      if(p.x<0){p.x=0;p.vx*=-0.5;}
      if(p.x>W){p.x=W;p.vx*=-0.5;}
      if(p.y<0){p.y=0;p.vy*=-0.5;}
      if(p.y>H){p.y=H;p.vy*=-0.5;}

      if(nodeProx>0.4&&activity>0.1) p.acc=Math.min(1,p.acc+dt*3);
      else p.acc*=0.92;

      if(val/srcCount<0.005&&activity>0.15&&Math.random()<rebirthProb){
        p.x=Math.random()*W;p.y=Math.random()*H;p.vx=0;p.vy=0;p.acc=0;
      }
    }

    ctx.fillStyle='rgba(10,14,16,0.12)';
    ctx.fillRect(0,0,W,H);
    ctx.globalCompositeOperation='lighter';

    for(const p of particles){
      const acc=p.acc;
      const size=acc<0.04?1.5:1.4+acc*4.6;
      const alpha=acc<0.04?0.28:0.45+acc*0.55;
      if(alpha<0.05) continue;
      const half=size*0.5;
      ctx.fillStyle=`rgba(170,180,185,${alpha})`;
      ctx.fillRect(p.x-half,p.y-half,size,size);
      const glowSize=size*(2.0+acc*3.0);
      const glowAlpha=alpha*(0.12+acc*0.25);
      const glowHalf=glowSize*0.5;
      ctx.fillStyle=`rgba(170,180,185,${glowAlpha})`;
      ctx.fillRect(p.x-glowHalf,p.y-glowHalf,glowSize,glowSize);

      if(sym===2){
        ctx.fillStyle=`rgba(170,180,185,${alpha})`;
        ctx.fillRect(CX*2-p.x-half,p.y-half,size,size);
        ctx.fillStyle=`rgba(170,180,185,${glowAlpha})`;
        ctx.fillRect(CX*2-p.x-glowHalf,p.y-glowHalf,glowSize,glowSize);
      }else if(sym===4){
        const pts=[[p.x,p.y],[CX*2-p.x,p.y],[p.x,CY*2-p.y],[CX*2-p.x,CY*2-p.y]];
        for(const [px,py] of pts){
          ctx.fillStyle=`rgba(170,180,185,${alpha})`;
          ctx.fillRect(px-half,py-half,size,size);
          ctx.fillStyle=`rgba(170,180,185,${glowAlpha})`;
          ctx.fillRect(px-glowHalf,py-glowHalf,glowSize,glowSize);
        }
      }else if(sym>1){
        const dpx=p.x-CX,dpy=p.y-CY;
        for(let sIdx=1;sIdx<sym;sIdx++){
          const ang=(Math.PI*2*sIdx)/sym;
          const cos=Math.cos(ang),sin=Math.sin(ang);
          const sx=CX+dpx*cos-dpy*sin;
          const sy=CY+dpx*sin+dpy*cos;
          ctx.fillStyle=`rgba(170,180,185,${alpha})`;
          ctx.fillRect(sx-half,sy-half,size,size);
          ctx.fillStyle=`rgba(170,180,185,${glowAlpha})`;
          ctx.fillRect(sx-glowHalf,sy-glowHalf,glowSize,glowSize);
        }
      }
    }
    ctx.globalCompositeOperation='source-over';
  }

  fs.writeFileSync(`test-screenshots/${name}.png`,canvas.toBuffer('image/png'));
  console.log('saved',name);
}

// 验证 sym=1 效果
simulate(4, 0.9, 0.2, 0.4, 0.3, 1.0, 800, 'verify-bass-s1', 1);
simulate(4, 0.2, 0.8, 0.6, 0.5, 1.0, 800, 'verify-high-s1', 1);
simulate(5, 0.6, 0.7, 0.8, 0.6, 1.0, 800, 'verify-mix-s1', 1);
simulate(4, 0, 0, 0, 0, 0.0, 800, 'verify-silent-s1', 1);

// 验证 sym=4 效果（确保没有退化）
simulate(4, 0.9, 0.2, 0.4, 0.3, 1.0, 800, 'verify-bass-s4', 4);
simulate(4, 0.2, 0.8, 0.6, 0.5, 1.0, 800, 'verify-high-s4', 4);
