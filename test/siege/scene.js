'use strict';

const scene = document.querySelector('#battlefield');
const ctx = scene.getContext('2d');
const status = document.querySelector('#status');
const startButton = document.querySelector('#start');
const pauseButton = document.querySelector('#pause');
const W = scene.width, H = scene.height, FLOOR = 913;
const params = new URLSearchParams(location.search);
const TAU = Math.PI * 2;
const QUIPS = [
  'I untap. It stays tapped.',
  'Next time, lock your screen. Dragon removal costs extra.',
  'I saved your board. The warranty is another story.',
  'Unattended devices are apparently creature bait.',
  'You left for one turn. It became a whole combat step.',
  'I asked it to leave. It insisted on a combat step.',
  'You can have your device back. I’m keeping the initiative.',
  'I called a judge. Then I got impatient.',
  'Nice playmat. Needs a mop.',
  'The furniture has declined to block.',
  'Next time you walk away, at least leave me two mana open.',
  'I won. The repair estimate is still on the stack.',
  'I go away for one turn and it starts eating the interface.',
  'Save your game. This one tried to eat the settings.'
];
const PIGMENT = {steel:'#ffbe83',glass:'#e2b8ff',crystal:'#d18aff'};
const rampage = {rescue:2, wreck:Infinity};
const mix = (a,b,t) => a+(b-a)*t;
const lerp = (a,b,t) => [mix(a[0],b[0],t),mix(a[1],b[1],t)];
const clamp = (x,min=0,max=1) => Math.max(min,Math.min(max,x));
const ease = x => x*x*(3-2*x);
const norm = (x,a,b) => clamp((x-a)/(b-a));
const random = (a,b) => mix(a,b,Math.random());
const choose = list => list[Math.floor(random(0,list.length))];
const pureRand = n => {const x=Math.sin(n*127.1+89.5)*43758.5453;return x-Math.floor(x);};
function shuffle(list){
  const result=[...list];
  for(let i=result.length-1;i>0;i--){const j=Math.floor(random(0,i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
const loadImage = src => new Promise((resolve,reject)=>{
  const image=new Image();
  image.onload=()=>resolve(image);
  image.onerror=()=>reject(new Error('Could not load '+src));
  image.src=src;
});

let background, targets, images, current, startTime=0, pausedAt=null, frame=0, history=[];
try{history=JSON.parse(localStorage.getItem('cc-siege-history-v3')||'[]');}catch{}
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const monsters=Object.keys(SIEGE_ART).filter(id=>!SIEGE_ART[id].hero);
const heroes=Object.keys(SIEGE_ART).filter(id=>SIEGE_ART[id].hero);
function poly(g,points){
  g.beginPath();
  for(const [i,p] of points.entries())i?g.lineTo(...p):g.moveTo(...p);
  g.closePath();
}
function roundedTarget({rect:[x,y,w,h],bevel:c}){
  return [[x+c,y],[x+w-c,y],[x+w,y+c],[x+w,y+h-c],[x+w-c,y+h],[x+c,y+h],[x,y+h-c],[x,y+c]];
}
function pieceTexture(target){
  const [x,y,w,h]=target.rect;
  const crop=document.createElement('canvas');
  crop.width=w;crop.height=h;
  const g=crop.getContext('2d');
  poly(g,roundedTarget(target).map(([a,b])=>[a-x,b-y]));
  g.clip();g.drawImage(background,x,y,w,h,0,0,w,h);
  return crop;
}
function center(target){
  const [x,y,w,h]=target.rect;
  return [x+w/2,y+h/2];
}
function pickTargets(mode){
  const all=shuffle(targets);
  const count=Math.min(all.length,rampage[mode]??choose([2,3,3,4,4,5,Infinity]));
  const top=choose(all.filter(t=>t.high&&t.rect[1]<70));
  const ordered=[top,...all.filter(t=>t!==top)];
  if(count===targets.length){
    const sides=shuffle([...new Set(targets.filter(t=>t.high).map(t=>t.rail))]);
    return [top,...sides.flatMap(rail=>ordered.filter(t=>t!==top&&t.rail===rail).sort((a,b)=>a.rect[1]-b.rect[1])),...ordered.filter(t=>!t.high)];
  }
  const ground=all.find(t=>!t.high);
  return [top,ground,...ordered.filter(t=>t!==top&&t!==ground)].slice(0,count);
}

function plan(mode='random',options={}){
  let result,signature;
  for(let attempt=0;attempt<120;attempt++){
    const mid=monsters.includes(options.monster)?options.monster:choose(monsters);
    const hid=heroes.includes(options.hero)?options.hero:choose(heroes);
    const order=pickTargets(mode);
    const attacks=shuffle(SIEGE_ART[mid].attacks);
    const quip=choose(QUIPS);
    const hits=order.map((target,i)=>({target,method:target.high?'throw':attacks[i%attacks.length]}));
    signature=JSON.stringify([mid,hid,hits.map(h=>[h.target.id,h.method]),quip]);
    result={mid,hid,hits,quip};
    if(!history.includes(signature))break;
  }
  history=[...history,signature].slice(-256);
  try{localStorage.setItem('cc-siege-history-v3',JSON.stringify(history));}catch{}
  return choreograph(result);
}
function choreograph(encounter){
  const full=encounter.hits.length===targets.length;
  const tempo=full?.72:1;
  let cursor=0, position=[W+160,FLOOR];
  const segments=[];
  function move(kind,to,ms,options={}){
    const record={kind,from:position,to,start:cursor,end:cursor+ms*tempo,...options};
    segments.push(record);
    cursor=record.end;position=to;
    return record;
  }
  function walk(x){
    x=clamp(x,35,W-35);
    move('walk',[x,FLOOR],clamp(Math.abs(x-position[0])*2.5,250,1300));
  }
  for(const hit of encounter.hits){
    const t=hit.target,[x,y,w,h]=t.rect;
    const c=center(t);
    const direction=c[0]>W*.62?1:-1;
    const bodySide=-direction;
    if(t.high){
      const rail=t.rail, railFace=rail>W*.6?1:-1;
      const firstGrip=[rail,FLOOR-163];
      const topLip=y<70?46:clamp(c[1]-3,115,FLOOR-220);
      walk(rail-railFace*73);
      move('mount',firstGrip,200,{face:railFace});
      move('climb',[rail,topLip],clamp((firstGrip[1]-topLip)*1.46,400,1180),{face:railFace});
      const moveX = y<70?c[0]:clamp(c[0],rail-130,rail+130);
      move('traverse',[moveX,topLip],clamp(Math.abs(moveX-rail)*2.35,215,670),{face:direction});
      const grab=move('grab',c,330,{face:direction});
      hit.detach=grab.start+(grab.end-grab.start)*.51;
      const release=[clamp(c[0]+bodySide*68,55,W-55),clamp(c[1]-22,42,FLOOR-80)];
      const fling=move('fling',release,280,{face:direction});
      hit.release=fling.end;
      hit.from=release;
      hit.to=[clamp(release[0]+bodySide*clamp(90+(FLOOR-c[1])*.32,110,410),35,W-35),FLOOR-12];
      hit.impact=hit.release+clamp((FLOOR-c[1])*1.07,390,880)*tempo;
      move('drop',[clamp(release[0]+bodySide*77,45,W-50),FLOOR],clamp((FLOOR-topLip)*.85,320,680),{face:direction});
    }else{
      walk(c[0]+bodySide*103);
      const attack=move(hit.method,[position[0],FLOOR],560,{face:direction,contact:c});
      hit.detach=attack.start+(attack.end-attack.start)*.61;
      hit.release=hit.detach;
      hit.from=c;
      hit.to=hit.method==='throw'?[clamp(c[0]+bodySide*220,35,W-35),FLOOR-10]:c;
      hit.impact=hit.method==='throw'?hit.release+450*tempo:hit.release;
    }
    move('settle',position,Math.max(165,hit.impact-cursor+130)/tempo,{face:direction});
  }
  const monsterStage=[W*.65,FLOOR];
  const heroStage=[W*.40,FLOOR];
  move('walk',monsterStage,650,{face:-1});
  const heroEntry=cursor;
  const parry=heroEntry+1040;
  const counter=parry+600;
  const defeat=counter+410;
  const line=defeat+400;
  const restore=line+3600;
  return {...encounter,segments,heroEntry,parry,counter,defeat,line,restore,end:restore+610,monsterStage,heroStage};
}

function asset(id,pose){
  const data=SIEGE_ART[id];
  return data.frames[pose]??data.frames.walk;
}
function drawSprite(id,pose,point,{face,anchor='foot',squash=0,angle=0,alpha=1,size=1}={}){
  const item=SIEGE_ART[id],p=asset(id,pose),[sx,sy,w,h]=p.rect;
  const a=p[anchor]??p.foot;
  const scale=(item.hero?248:294)*size/p.normal;
  const flip=(face??item.faces)===item.faces?1:-1;
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(...point);ctx.rotate(angle);ctx.scale(flip*scale,scale*(1-squash));
  ctx.drawImage(images[id],sx,sy,w,h,-a[0],-a[1],w,h);
  ctx.restore();
}
function poseMix(id,a,b,point,f,options={}){
  f=ease(clamp(f));
  if(f<1)drawSprite(id,a,point,{...options,alpha:1-f});
  if(f>0)drawSprite(id,b,point,{...options,alpha:f});
}
function shadow(x,y,s=1,alpha=.5){
  ctx.save();ctx.translate(x,y-4);ctx.scale(105*s,20*s);ctx.globalAlpha*=alpha;
  const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,'#000');g.addColorStop(1,'transparent');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,1,0,TAU);ctx.fill();ctx.restore();
}
function feet(id,t,point,face,travel=1){
  const names=SIEGE_ART[id].gait;
  const tick=t/112;
  const i=Math.floor(tick)%names.length;
  const bob=-Math.sin((tick%1)*Math.PI)*7*travel;
  shadow(point[0],point[1],SIEGE_ART[id].hero?.7:1);
  poseMix(id,names[i],names[(i+1)%names.length],[point[0],point[1]+bob],norm(tick%1,.83,1),{face});
}
function gripPose(id,t,point,face,squash=0){
  const f=t/205;
  const p=f%1;
  const pose=Math.floor(f)%2===0?'climb-a':'climb-b';
  const next=pose==='climb-a'?'climb-b':'climb-a';
  const b=[point[0]+Math.sin(f*Math.PI)*4,point[1]+Math.sin(p*Math.PI)*6];
  poseMix(id,pose,next,b,norm(p,.77,1),{anchor:'hand',face,squash});
  if(p<.2){
    ctx.save();ctx.fillStyle='#dec0ff';ctx.globalAlpha=.43*(1-p/.2);
    for(let i=0;i<4;i++)ctx.fillRect(b[0]+i*3-5,b[1]-i*4,1.8,2.2);
    ctx.restore();
  }
}
function rampageActor(e,t){
  const id=e.mid, s=e.segments.find(s=>t>=s.start&&t<s.end);
  if(!s)return;
  const u=norm(t,s.start,s.end);
  const point=lerp(s.from,s.to,ease(u));
  const face=s.face??(s.to[0]<s.from[0]?-1:1);
  if(s.kind==='walk')feet(id,t,point,face);
  else if(s.kind==='mount'){
    const hand=[mix(s.from[0],s.to[0],ease(u)),mix(FLOOR-163,s.to[1],ease(u))];
    drawSprite(id,'climb-a',hand,{face,anchor:'hand',squash:.15*(1-u)});
  }else if(s.kind==='climb'||s.kind==='traverse')gripPose(id,t,point,face);
  else if(s.kind==='grab'||s.kind==='fling'){
    const p=s.kind==='fling'?norm(u,.3,1):0;
    const a=s.kind==='grab'&&u<.35?'climb-a':'grab';
    poseMix(id,a,'throw',point,p,{face,anchor:'hand',angle:-face*.15*p});
  }else if(s.kind==='drop'){
    const startFoot=clamp(s.from[1]+171,45,FLOOR);
    const landing=[point[0],mix(startFoot,FLOOR,u*u)];
    shadow(landing[0],FLOOR,1,u*.57);
    drawSprite(id,u<.8?'climb-b':'walk',landing,{face,squash:norm(u,.76,1)*.18,angle:Math.sin(u*Math.PI)*face*.15});
  }else if(s.kind==='settle'){
    shadow(point[0],FLOOR);
    drawSprite(id,'walk',point,{face,squash:.10*(1-u)});
  }else{
    shadow(point[0],FLOOR);
    const action=s.kind==='throw'?'throw':s.kind;
    const hit=norm(u,.39,.69);
    const recoil=norm(u,.76,1);
    const drive=[point[0]+face*hit*(1-recoil)*32,point[1]];
    if(recoil>0)poseMix(id,action,'walk',drive,recoil,{face,squash:.08*(1-recoil)});
    else poseMix(id,'windup',action,drive,hit,{face,angle:face*(1-hit)*.11});
  }
}

function paintSocket(target,amount){
  const [x,y,w,h]=target.rect;
  const cut=roundedTarget(target);
  ctx.save();
  ctx.globalAlpha*=amount;
  poly(ctx,cut);
  const recess=ctx.createLinearGradient(x,y,x,y+h);
  recess.addColorStop(0,'#0d0915');recess.addColorStop(.8,'#241132');recess.addColorStop(1,'#120a17');
  ctx.fillStyle=recess;ctx.fill();
  ctx.strokeStyle='#685272';ctx.lineWidth=2;ctx.stroke();
  ctx.clip();
  ctx.strokeStyle='#36253d';ctx.lineWidth=2;
  for(const offset of [11,w-11]){
    ctx.beginPath();ctx.moveTo(x+offset,y+6);ctx.lineTo(x+offset*1.04,y+h-7);ctx.stroke();
  }
  ctx.strokeStyle='#936479';ctx.lineWidth=1.4;
  for(const [i,x2] of [x+15,x+w-15].entries()){
    const y2=y+h*(i?.78:.3);ctx.beginPath();ctx.moveTo(x2,y2-3);ctx.lineTo(x2+(i?-12:12),y2);ctx.lineTo(x2+(i?-19:19),y2+7);ctx.stroke();
  }
  ctx.restore();
}
function materialBits(hit,t){
  const dt=t-hit.impact;
  if(dt<0||dt>1040)return;
  const p=dt/1000;
  const [x,y]=hit.to;
  const [,,w,h]=hit.target.rect;
  const c=hit.target.texture;
  const ground=hit.method==='throw';
  const tint=PIGMENT[hit.target.type];
  const id=targets.indexOf(hit.target)+1;
  const material=hit.target.type;
  const edges=[[0,0],[.55,0],[1,0],[1,.42],[1,1],[.58,1],[0,1],[0,.57]];
  const size=ground?.72:1;
  for(const [i,a] of edges.entries()){
    const b=edges[(i+1)%edges.length];
    const speed=hit.method==='bite'?.65:hit.method==='claw'?1.28:1;
    const vx=(i-3.5)*64*speed;
    const mass=material==='glass'?1.25:material==='crystal'?.94:.77;
    const vy=(-80-pureRand(id*19+i)*160)*mass;
    const driftY=vy*p+348*p*p;
    const dy=ground?Math.min(-4,driftY):driftY;
    ctx.save();
    ctx.translate(x+vx*p*.86, y+dy);
    ctx.rotate((pureRand(id*37+i)-.5)*p*7);
    ctx.globalAlpha*=1-ease(norm(dt,470,1040));
    ctx.scale(size,size);
    poly(ctx,[[0,0],[(a[0]-.52)*w,(a[1]-.52)*h],[(b[0]-.52)*w,(b[1]-.52)*h]]);
    ctx.clip();
    ctx.drawImage(c,-w*.52,-h*.52);
    ctx.strokeStyle=tint;ctx.lineWidth=2;ctx.stroke();
    ctx.restore();
  }
  if(dt<420){
    const q=norm(dt,0,420);
    ctx.save();ctx.globalAlpha*=1-q;
    if(ground){
      const cloud=ctx.createRadialGradient(x,y,2,x,y,15+q*95);
      cloud.addColorStop(0,'#b28ca959');cloud.addColorStop(1,'transparent');
      ctx.fillStyle=cloud;ctx.beginPath();ctx.ellipse(x,y,30+q*125,9+q*18,0,0,TAU);ctx.fill();
    }
    ctx.strokeStyle=tint;ctx.lineWidth=2;
    for(let i=0;i<17;i++){
      const a=ground?-Math.PI*(i+1)/18:TAU*i/17;
      const r=11+q*(54+pureRand(id*17+i)*91);
      ctx.beginPath();ctx.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r);ctx.lineTo(x+Math.cos(a)*(r+7+q*9),y+Math.sin(a)*(r+7+q*9));ctx.stroke();
    }
    if(hit.method==='claw'){
      for(const n of [-1,0,1]){
        ctx.beginPath();ctx.moveTo(x-27+n*11,y-29);ctx.quadraticCurveTo(x+n*8,y-5,x+19+n*10,y+29);ctx.stroke();
      }
    }
    ctx.restore();
  }
}
function movingPiece(hit,t){
  if(t<hit.detach||t>=hit.impact)return;
  const tex=hit.target.texture;
  const c=center(hit.target);
  let point,turn,size;
  if(t<hit.release){
    const u=ease(norm(t,hit.detach,hit.release));
    point=lerp(c,hit.from,u);point[1]-=17*Math.sin(u*Math.PI);
    turn=(hit.to[0]>c[0]?1:-1)*.30*u;
    size=1;
  }else{
    const u=norm(t,hit.release,hit.impact);
    point=lerp(hit.from,hit.to,u);
    point[1]-=(hit.target.high?132:101)*Math.sin(u*Math.PI);
    turn=(hit.to[0]>c[0]?1:-1)*mix(.30,4.1,u);
    size=mix(1,.66,u);
  }
  ctx.save();
  ctx.translate(...point);ctx.rotate(turn);ctx.scale(size,size);
  ctx.drawImage(tex,-tex.width/2,-tex.height/2);
  ctx.restore();
}
function cracks(){
  const lines=[[[15,0],[215,195],[346,308],[519,535],[687,650],[811,936]],[[1363,120],[1160,248],[977,375],[784,405],[519,535],[370,635],[175,736],[0,895]],[[687,650],[940,620],[1122,652],[1363,813]],[[346,308],[489,238],[585,166],[701,0]],[[977,375],[1030,454],[1060,580],[1122,652]]];
  ctx.save();ctx.strokeStyle='#d9a9e563';ctx.lineWidth=1.4;
  for(const line of lines){ctx.beginPath();line.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}
  ctx.restore();
}
function finalFight(e,t){
  const m=e.mid, h=e.hid;
  const monster=e.monsterStage, hero=e.heroStage;
  const approach=norm(t,e.heroEntry,e.parry-155);
  const heroSpot=lerp([-145,FLOOR],hero,ease(approach));
  const recoil=norm(t,e.counter,e.defeat);
  const stun=Math.sin(norm(t,e.parry-125,e.parry+180)*Math.PI);
  const lunge=[monster[0]-stun*100+recoil*38,FLOOR];
  const finish=norm(t,e.counter-130,e.counter+55);
  if(t>=e.defeat){
    shadow(monster[0]+39,FLOOR,1.4,.66);
    drawSprite(m,'defeated',[monster[0]+39,FLOOR],{face:-1});
  }else{
    shadow(lunge[0],FLOOR);
    if(recoil>0)poseMix(m,'grab','defeated',[lunge[0],FLOOR-Math.sin(recoil*Math.PI)*28],norm(recoil,.20,.96),{face:-1,angle:-.18*Math.sin(recoil*Math.PI)});
    else poseMix(m,'walk',SIEGE_ART[m].frames.bite?'bite':'smash',lunge,stun,{face:-1});
  }
  if(approach<1)feet(h,t,heroSpot,1);
  else {
    const step=SIEGE_ART[h].counter==='hammer'?62:18;
    const recover=norm(t,e.counter+125,e.defeat+160);
    const feetAt=[hero[0]+step*Math.sin((finish*.5+recover*.5)*Math.PI)-stun*15,FLOOR];
    shadow(feetAt[0],FLOOR,.7);
    if(recover>0)poseMix(h,'strike','victory',feetAt,recover,{face:1,angle:.045*(1-recover)});
    else poseMix(h,'guard','strike',feetAt,finish,{face:1,angle:-stun*.09});
  }
  effect(e,t);
}
function effect(e,t){
  const h=SIEGE_ART[e.hid], base=FLOOR-170;
  const parry=norm(t,e.parry,e.parry+300), shot=norm(t,e.counter,e.counter+340);
  if(parry>0&&parry<1){
    ctx.save();ctx.globalAlpha=.84*(1-parry);ctx.strokeStyle='#ffdfb2';ctx.lineWidth=2.3;
    for(let i=0;i<12;i++){
      const a=i*TAU/12,x=W*.508,y=base-5;ctx.beginPath();ctx.moveTo(x+parry*43*Math.cos(a),y+parry*43*Math.sin(a));ctx.lineTo(x+(11+parry*68)*Math.cos(a),y+(11+parry*68)*Math.sin(a));ctx.stroke();
    }
    ctx.restore();
  }
  if(shot>0&&shot<1){
    ctx.save();ctx.globalAlpha=(1-shot)*.86;ctx.shadowBlur=19;ctx.shadowColor=h.color;ctx.strokeStyle=h.color;ctx.lineWidth=3.2;ctx.beginPath();
    const x=mix(W*.47,W*.66,Math.min(1,shot*2.6));
    if(h.counter==='hammer')ctx.arc(W*.49,base-18,112,-1.1+shot*1.3,-.13+shot*1.7);
    else if(h.counter==='bolt'){ctx.moveTo(x-48,base);ctx.lineTo(x+12,base-6);}
    else{ctx.moveTo(W*.46,base+14);ctx.bezierCurveTo(W*.54,base-72,x-25,base+41,x,base-12);}
    ctx.stroke();ctx.restore();
  }
  if(h.counter==='bolt'&&t>e.counter+145&&t<e.counter+335){
    const q=norm(t,e.counter+145,e.counter+335);
    ctx.save();ctx.globalAlpha=(1-q)*.86;ctx.strokeStyle=h.color;ctx.lineWidth=2;
    for(let i=0;i<8;i++){const a=i*TAU/8,x=W*.65,y=base-6;ctx.beginPath();ctx.moveTo(x+q*18*Math.cos(a),y+q*18*Math.sin(a));ctx.lineTo(x+(6+q*45)*Math.cos(a),y+(6+q*45)*Math.sin(a));ctx.stroke();}
    ctx.restore();
  }
  if(t>e.defeat&&t<e.defeat+410){
    const p=norm(t,e.defeat,e.defeat+410);
    ctx.save();ctx.globalAlpha=.34*(1-p);ctx.fillStyle='#b995a5';
    for(let i=0;i<7;i++){const spread=(i-3)*(17+p*13);ctx.beginPath();ctx.ellipse(e.monsterStage[0]+39+spread,FLOOR-6-p*15,13+p*20,4+p*7,0,0,TAU);ctx.fill();}
    ctx.restore();
  }
}
function bubble(e,t){
  if(t<e.line)return;
  const hero=SIEGE_ART[e.hid];
  const x=145,y=314,w=880,h=122,tail=e.heroStage[0]-23;
  ctx.save();ctx.globalAlpha=ease(norm(t,e.line,e.line+180));
  ctx.shadowColor='#090511';ctx.shadowBlur=21;
  poly(ctx,[[x+13,y],[x+w-13,y],[x+w,y+13],[x+w,y+h-12],[x+w-13,y+h],[tail+21,y+h],[tail,y+h+25],[tail-21,y+h],[x+13,y+h],[x,y+h-12],[x,y+13]]);
  ctx.fillStyle='#181021';ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle=hero.color;ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle=hero.color;ctx.font='700 19px sans-serif';ctx.textBaseline='top';ctx.fillText(hero.name.toUpperCase(),x+25,y+18);
  ctx.fillStyle='#fbf5ff';ctx.font='600 28px sans-serif';
  const words=e.quip.split(' ');let line='',py=y+50;
  for(const word of words){
    const next=line?line+' '+word:word;
    if(ctx.measureText(next).width>w-50&&line){ctx.fillText(line,x+25,py);py+=31;line=word;}
    else line=next;
  }
  ctx.fillText(line,x+25,py);
  ctx.restore();
}
function paint(t,e=current){
  ctx.drawImage(background,0,0,W,H);
  if(!e||t<0||t>=e.end)return;
  const shade=ease(norm(t,0,650))*.22;
  ctx.fillStyle='rgba(10,5,18,'+shade+')';ctx.fillRect(0,0,W,H);
  for(const hit of e.hits)if(t>=hit.detach)paintSocket(hit.target,ease(norm(t,hit.detach,hit.detach+120)));
  if(e.hits.length===targets.length&&t>=e.hits.at(-1).impact)cracks();
  for(const hit of e.hits)movingPiece(hit,t);
  if(t<e.heroEntry)rampageActor(e,t);
  else finalFight(e,t);
  for(const hit of e.hits)materialBits(hit,t);
  bubble(e,t);
  if(t>e.restore){ctx.save();ctx.globalAlpha=ease(norm(t,e.restore,e.end));ctx.drawImage(background,0,0,W,H);ctx.restore();}
}

function wake(message='Battlefield restored.'){
  cancelAnimationFrame(frame);
  current=null;pausedAt=null;
  pauseButton.textContent='Pause';pauseButton.disabled=true;
  paint(-1);status.textContent=message;
}
function render(now){
  if(!current||pausedAt!==null)return;
  const t=now-startTime;
  paint(t);
  if(t>=current.end){wake('Battlefield restored. Start a new encounter to replay.');return;}
  frame=requestAnimationFrame(render);
}
function start(mode='random',options={}){
  cancelAnimationFrame(frame);
  current=plan(mode,options);
  startTime=performance.now();
  pausedAt=null;pauseButton.disabled=false;pauseButton.textContent='Pause';
  status.textContent=SIEGE_ART[current.mid].name+' vs. '+SIEGE_ART[current.hid].name+' · Tap the battlefield to wake.';
  if(!params.has('capture'))frame=requestAnimationFrame(render);
  return current;
}
function pause(){
  if(!current)return;
  if(pausedAt!==null){startTime+=performance.now()-pausedAt;pausedAt=null;pauseButton.textContent='Pause';frame=requestAnimationFrame(render);}
  else{pausedAt=performance.now();cancelAnimationFrame(frame);pauseButton.textContent='Resume';}
}
const ready=Promise.all([
  loadImage('siege/battlefield.png'),
  fetch('siege/targets.json?v=3').then(r=>{if(!r.ok)throw new Error('Could not load battlefield targets');return r.json();}),
  Promise.all(Object.entries(SIEGE_ART).map(async([id,record])=>[id,await loadImage('siege/'+record.file)]))
]).then(([board,metadata,textures])=>{
  background=board;targets=metadata;
  images=Object.fromEntries(textures);
  for(const target of targets)target.texture=pieceTexture(target);
  paint(-1);startButton.disabled=false;
  if(reduced.matches||params.has('capture'))status.textContent='Real Commander Companion battlefield. Start an encounter to play.';
  else start();
}).catch(error=>{status.textContent=error.message;throw error;});
startButton.addEventListener('click',()=>start());
pauseButton.addEventListener('click',pause);
scene.addEventListener('pointerdown',event=>{if(current){event.preventDefault();wake();}});
scene.addEventListener('keydown',event=>{if(current&&['Escape','Enter',' '].includes(event.key)){event.preventDefault();wake();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&current)wake();});
window.siegeTest={ready,paint,start,plan,wake,get current(){return current;}};
