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

let background, targets, images, climbingImages, current, startTime=0, pausedAt=null, frame=0, history=[];
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
  const tempo=full?.77:1;
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
    move('walk',[x,FLOOR],clamp(Math.abs(x-position[0])*2.85,295,1500));
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
      move('mount',firstGrip,270,{face:railFace});
      move('climb',[rail,topLip],clamp((firstGrip[1]-topLip)*2.45,490,1860),{face:railFace});
      const moveX = y<70?c[0]:clamp(c[0],rail-130,rail+130);
      move('traverse',[moveX,topLip],clamp(Math.abs(moveX-rail)*3.65,240,845),{face:direction});
      const anchor=[clamp(moveX+direction*36,12,W-12),topLip];
      const grab=move('grab',c,430,{face:direction,anchor});
      hit.detach=grab.start+(grab.end-grab.start)*.51;
      const release=[clamp(c[0]+bodySide*68,55,W-55),clamp(c[1]-22,42,FLOOR-80)];
      const fling=move('fling',release,365,{face:direction,anchor});
      hit.release=fling.end;
      hit.from=release;
      hit.to=[clamp(release[0]+bodySide*clamp(90+(FLOOR-c[1])*.32,110,410),35,W-35),FLOOR-12];
      hit.impact=hit.release+clamp(Math.sqrt((FLOOR-c[1])/990)*1150,440,1000);
      move('drop',[clamp(release[0]+bodySide*77,45,W-50),FLOOR],clamp(Math.sqrt((FLOOR-topLip)/950)*780,325,745),{face:direction});
    }else{
      walk(c[0]+bodySide*103);
      const attack=move(hit.method,[position[0],FLOOR],635,{face:direction,contact:c});
      hit.detach=attack.start+(attack.end-attack.start)*.61;
      hit.release=hit.detach;
      hit.from=c;
      hit.to=hit.method==='throw'?[clamp(c[0]+bodySide*220,35,W-35),FLOOR-10]:c;
      hit.impact=hit.method==='throw'?hit.release+465:hit.release;
    }
    move('settle',position,Math.max(165,hit.impact-cursor+130)/tempo,{face:direction});
  }
  const monsterStage=[W*.65,FLOOR];
  const heroStage=[W*.39,FLOOR];
  move('walk',monsterStage,650,{face:-1});
  const heroEntry=cursor;
  const fight=buildFight(heroEntry,encounter.mid);
  const line=fight.defeat+515;
  const restore=line+4050;
  return {...encounter,segments,heroEntry,...fight,line,restore,end:restore+680,monsterStage,heroStage};
}

function asset(id,pose){
  const data=SIEGE_ART[id];
  return data.frames[pose]??RECOVERY[id]?.frames[pose]??data.frames.walk;
}
function drawSprite(id,pose,point,{face,anchor='foot',squash=0,angle=0,alpha=1,size=1}={}){
  const item=SIEGE_ART[id],p=asset(id,pose),[sx,sy,w,h]=p.rect;
  const a=p[anchor]??p.foot;
  const scale=(item.hero?248:294)*size/p.normal;
  const flip=(face??item.faces)===item.faces?1:-1;
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(...point);ctx.rotate(angle);ctx.scale(flip*scale,scale*(1-squash));
  ctx.drawImage(images[p.sheet?id+'-recovery':id],sx,sy,w,h,-a[0],-a[1],w,h);
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
  const tick=t/149;
  const i=Math.floor(tick)%names.length;
  const bob=-Math.sin((tick%1)*Math.PI)*7*travel;
  shadow(point[0],point[1],SIEGE_ART[id].hero?.7:1);
  poseMix(id,names[i],names[(i+1)%names.length],[point[0],point[1]+bob],norm(tick%1,.83,1),{face});
}
function mapTriangle(from,to,image){
  const [a,b,c]=from,[d,e,f]=to;
  const bx=b[0]-a[0], by=b[1]-a[1], cx=c[0]-a[0], cy=c[1]-a[1];
  const det=bx*cy-by*cx;
  const area=(e[0]-d[0])*(f[1]-d[1])-(e[1]-d[1])*(f[0]-d[0]);
  if(Math.abs(det)<.01||Math.abs(area)<.02)return;
  const x1=e[0]-d[0], y1=e[1]-d[1], x2=f[0]-d[0], y2=f[1]-d[1];
  const xx=(x1*cy-x2*by)/det, xy=(y1*cy-y2*by)/det;
  const yx=(x2*bx-x1*cx)/det, yy=(y2*bx-y1*cx)/det;
  const center=[(d[0]+e[0]+f[0])/3,(d[1]+e[1]+f[1])/3];
  const clip=to.map(p=>{
    const x=p[0]-center[0],y=p[1]-center[1],s=1+.6/Math.max(1,Math.hypot(x,y));
    return [center[0]+x*s,center[1]+y*s];
  });
  ctx.save();poly(ctx,clip);ctx.clip();
  ctx.transform(xx,xy,yx,yy,d[0]-xx*a[0]-yx*a[1],d[1]-xy*a[0]-yy*a[1]);
  ctx.drawImage(image,0,0);ctx.restore();
}
function bendClimber(id,key,high,low,face,phase,{along=false,alpha=1,brace=null,step=64,footHold=null}={}){
  const rig=GRIPS[id][key], frame=asset(id,'climb-'+key);
  const size=294/frame.normal;
  const swing=Math.sin(phase*Math.PI);
  const angle=(key==='a'?1:-1)*face*.095*swing;
  const cos=Math.cos(angle),sin=Math.sin(angle);
  const [joint,other,toe,tailFoot]=rig.v;
  const left=face<0?1:-1;
  const base=p=>{
    const x=(p[0]-joint[0])*left*size;
    const y=(p[1]-joint[1])*size;
    return [high[0]+x*cos-y*sin,high[1]+x*sin+y*cos];
  };
  const body=base(rig.v[5]);
  const mid=lerp(high,low,.44);
  const natural=lerp(base(joint),base(other),.44);
  const drift=[clamp(mid[0]-natural[0],-55,55),clamp(mid[1]-natural[1],-50,55)];
  const front=base(toe),rear=base(tailFoot);
  const rail=brace??high[0];
  const plantedToe=footHold??(along?[front[0]-face*13,front[1]+8]:[rail-face*11,Math.min(FLOOR,high[1]+step*.77+141)]);
  const swingToe=[rear[0]+left*18*swing,rear[1]-34*swing];
  const constraints=[high,low,plantedToe,swingToe];
  const vectors=constraints.map((p,i)=>{const b=base(rig.v[i]);return [p[0]-b[0],p[1]-b[1]];});
  const skin=rig.v.map((p,i)=>{
    if(i<4)return constraints[i];
    const q=base(p);
    const d=Math.hypot(q[0]-body[0],q[1]-body[1]);
    const motion=clamp(1-d/170,.13,.84);
    let x=q[0]+drift[0]*motion,y=q[1]+drift[1]*motion;
    for(const [k,j] of rig.v.slice(0,4).entries()){
      const delta=Math.hypot(p[0]-j[0],p[1]-j[1])*size;
      const influence=Math.pow(clamp(1-delta/82),2)*.7;
      x+=vectors[k][0]*influence;y+=vectors[k][1]*influence;
    }
    return [x,y];
  });
  ctx.save();
  ctx.globalAlpha=alpha;
  for(const tri of rig.m)mapTriangle(tri.map(i=>rig.v[i]),tri.map(i=>skin[i]),climbingImages[id][key]);
  ctx.restore();
}
function overHand(id,s,u,face){
  const dx=s.to[0]-s.from[0],dy=s.to[1]-s.from[1];
  const along=s.kind==='traverse';
  const distance=Math.hypot(dx,dy);
  const stride=along?90:108;
  const count=Math.max(1,Math.ceil(distance/stride));
  const step=distance/count;
  const cycle=Math.min(count-.000001,u*count);
  const index=Math.floor(cycle),phase=cycle%1;
  const dir=distance>1?[dx/distance,dy/distance]:[along?1:0,along?0:-1];
  const grip=(n)=>[s.from[0]+dir[0]*n*step,s.from[1]+dir[1]*n*step];
  const held=grip(index), incoming=grip(index+1);
  const old=index===0?[held[0]+(along?-dir[0]*62:0),held[1]+(along?4:105)]:grip(index-1);
  const reach=ease(norm(phase,.10,.83));
  const lift=Math.sin(reach*Math.PI);
  const free=lerp(old,incoming,reach);
  if(along)free[1]-=24*lift;else free[0]-=face*35*lift;
  const before=index%2===0?'a':'b',after=before==='a'?'b':'a';
  const cross=ease(norm(reach,.42,.62));
  const feetTransfer=ease(norm(phase,.71,.99));
  const footStep=lerp(held,incoming,feetTransfer);
  const footHold=along?null:[held[0]-face*11,Math.min(FLOOR,footStep[1]+step*.72+124)];
  const options={along,brace:along?null:held[0],step,footHold};
  if(cross<1)bendClimber(id,before,held,free,face,reach,{...options,alpha:1-cross});
  if(cross>0)bendClimber(id,after,free,held,face,reach,{...options,alpha:cross});
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
    const support=[s.to[0],s.to[1]+108];
    if(u<.22)drawSprite(id,'walk',[s.from[0],FLOOR],{face,alpha:1-norm(u,0,.22)});
    bendClimber(id,'a',hand,support,face,u,{brace:s.to[0],alpha:norm(u,0,.22)});
  }else if(s.kind==='climb'||s.kind==='traverse')overHand(id,s,u,face);
  else if(s.kind==='grab'||s.kind==='fling'){
    const reach=[point[0],point[1]+(s.kind==='fling'?-29:18)*Math.sin(u*Math.PI)];
    bendClimber(id,s.kind==='grab'?'b':'a',s.anchor,reach,face,u,{along:s.anchor[1]<90});
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
    const floorTravel=Math.max(0,FLOOR-y-6);
    const contact=(Math.sqrt(vy*vy+4*530*floorTravel)-vy)/1060;
    const bounceTime=Math.max(0,p-contact);
    const contactSpeed=vy+1060*contact;
    const bounced=ground&&p>contact;
    const dy=bounced?floorTravel+Math.min(0,-contactSpeed*.24*bounceTime+530*bounceTime*bounceTime):vy*p+530*p*p;
    const dx=vx*(bounced?contact+bounceTime*.31:p)*.86;
    ctx.save();
    ctx.translate(x+dx, y+dy);
    ctx.rotate((pureRand(id*37+i)-.5)*(bounced?contact+bounceTime*.26:p)*7);
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
    const direction=hit.to[0]>c[0]?1:-1;
    const endTurn=hit.target.high?3.7:2.2;
    const landingScale=.85;
    const halfHeight=theta=>.5*(Math.abs(Math.sin(theta))*tex.width+Math.abs(Math.cos(theta))*tex.height);
    const endCenter=FLOOR-landingScale*halfHeight(endTurn);
    turn=direction*mix(.30,endTurn,u);
    size=mix(1,landingScale,u);
    const arc=hit.target.high?112:66;
    const fall=mix(hit.from[1],endCenter,u)-4*arc*u*(1-u);
    point=[mix(hit.from[0],hit.to[0],u),Math.min(fall,FLOOR-size*halfHeight(turn))];
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
function buildFight(start,monster){
  const peril=Math.random()<.76;
  const hits=[
    {kind:'block',time:start+random(1740,1920),'by':'monster'},
    {kind:'counter',time:start+random(2620,2840),'by':'hero'},
    {kind:'body',time:start+random(3560,3790),'by':'monster'},
  ];
  let down=null,rise=null;
  if(peril){
    down=start+random(4440,4820);
    rise=down+random(960,1330);
    hits.push({kind:'heavy',time:down,'by':'monster'});
    hits.push({kind:'break',time:rise+random(780,980),'by':'hero'});
  }else{
    hits.push({kind:'block',time:start+random(4480,4750),'by':'monster'});
  }
  const counter=hits.at(-1).time+random(1050,1420);
  hits.push({kind:'finish',time:counter,'by':'hero'});
  return {hitsInFight:hits,down,rise,parry:hits[0].time,counter,defeat:counter+555,
    technique:choose(SIEGE_ART[monster].attacks.filter(a=>a!=='throw'))};
}
function keyAt(keys,t){
  if(t<=keys[0][0])return keys[0][1];
  for(let i=1;i<keys.length;i++){
    if(t<=keys[i][0])return mix(keys[i-1][1],keys[i][1],ease(norm(t,keys[i-1][0],keys[i][0])));
  }
  return keys.at(-1)[1];
}
function pulse(t,at,before,after){
  if(t<=at)return ease(norm(t,at-before,at));
  return 1-ease(norm(t,at,at+after));
}
function finalFight(e,t){
  const m=e.mid,h=e.hid,style=SIEGE_ART[h].counter;
  const events=e.hitsInFight;
  const first=events[0].time;
  const firstCounter=events[1].time;
  const body=events[2].time;
  const final=events.at(-1).time;
  const monsterBase=e.monsterStage[0], heroBase=e.heroStage[0];
  const away=heroBase-35, knocked=heroBase-112;
  const heroKeys=[[e.heroEntry,-158],[first-630,heroBase],[first+175,heroBase-15],[firstCounter,heroBase+17],
    [body+265,away]];
  const monsterKeys=[[e.heroEntry,monsterBase],[first,monsterBase-76],[first+370,monsterBase-35],
    [firstCounter+235,monsterBase+31],[body,monsterBase-107],[body+255,monsterBase-65]];
  if(e.down!==null){
    heroKeys.push([e.down,away],[e.down+440,knocked],[e.rise+280,knocked],[events.at(-2).time,heroBase+26]);
    monsterKeys.push([e.down,monsterBase-143],[e.down+460,monsterBase-142],[e.rise+340,monsterBase-147],[events.at(-2).time+205,monsterBase-30]);
  }else{
    heroKeys.push([events.at(-2).time+190,heroBase-48]);
    monsterKeys.push([events.at(-2).time,monsterBase-106]);
  }
  const finishLunge=style==='hammer'?67:19;
  heroKeys.push([final-500,heroBase-14],[final+10,heroBase+finishLunge],[e.defeat+550,heroBase+8]);
  monsterKeys.push([final-415,monsterBase-43],[final,monsterBase-70],[e.defeat,monsterBase+48]);
  const mx=keyAt(monsterKeys,t),hx=keyAt(heroKeys,t);
  const monsterPoint=[mx,FLOOR],heroPoint=[hx,FLOOR];
  const action=events.find(ev=>t>=ev.time-350&&t<ev.time+375);
  if(t<first-630){
    feet(h,t,heroPoint,1);
  }else if(e.down!==null&&t>=e.down-75&&t<e.rise+465){
    const fall=norm(t,e.down-75,e.down+330);
    const stand=norm(t,e.rise-80,e.rise+465);
    shadow(hx,FLOOR,.83);
    const drift=37*Math.sin(fall*Math.PI);
    if(stand>0)poseMix(h,'kneel','guard',heroPoint,stand,{face:1,angle:.13*(1-stand)});
    else if(fall<.40)poseMix(h,'guard','hit',[hx,FLOOR-drift],norm(fall,0,.4),{face:1,angle:-.17*fall});
    else poseMix(h,'hit','kneel',[hx,FLOOR-drift],norm(fall,.40,1),{face:1,angle:-.10*(1-fall)});
  }else{
    shadow(hx,FLOOR,.75);
    if(t>=e.defeat+200){
      poseMix(h,'guard','victory',heroPoint,norm(t,e.defeat+200,e.defeat+630),{face:1});
    }else if(action?.by==='hero'){
      const p=pulse(t,action.time,style==='bolt'?265:335,360);
      const drive=style==='bolt'?-p*.055:p*.075;
      poseMix(h,'guard','strike',heroPoint,p,{face:1,angle:drive,squash:.047*p});
    }else if(action?.by==='monster'){
      const p=pulse(t,action.time,120,290);
      if(action.kind==='block')drawSprite(h,'guard',heroPoint,{face:1,angle:-.12*p,squash:p*.09});
      else poseMix(h,'guard','hit',heroPoint,p,{face:1,angle:-p*.10});
    }else drawSprite(h,'guard',heroPoint,{face:1,squash:.016*Math.sin((t-e.heroEntry)*.008)});
  }
  shadow(mx,FLOOR,t>=e.defeat?1.35:1);
  if(t>=e.defeat){
    drawSprite(m,'defeated',monsterPoint,{face:-1});
  }else if(t>final+120){
    const falling=norm(t,final+120,e.defeat);
    poseMix(m,'grab','defeated',[mx,FLOOR-46*Math.sin(falling*Math.PI)],falling,{face:-1,angle:-.22*Math.sin(falling*Math.PI)});
  }else if(action?.by==='monster'){
    const p=pulse(t,action.time,215,350);
    const attack=action.kind==='heavy'?'smash':e.technique;
    const prep=t<action.time-55?'windup':'walk';
    poseMix(m,prep,attack,monsterPoint,p,{face:-1,angle:.055*(1-p),squash:p*.08});
  }else if(action?.by==='hero'){
    const p=pulse(t,action.time,45,340);
    poseMix(m,'walk','grab',monsterPoint,p,{face:-1,angle:.16*p});
  }else drawSprite(m,'walk',monsterPoint,{face:-1,squash:.019*Math.sin(t*.007)});
  effects(e,t,hx,mx);
}
function battleSparks(x,y,t,color,count=12){
  ctx.save();ctx.globalAlpha=(1-t)*.88;ctx.strokeStyle=color;ctx.lineWidth=2.5;
  for(let i=0;i<count;i++){
    const a=i*TAU/count;
    const length=17+Math.sin(i*1.9)*10;
    const distance=4+t*(28+i*4.5);
    ctx.beginPath();ctx.moveTo(x+distance*Math.cos(a),y+distance*Math.sin(a));ctx.lineTo(x+(length+distance)*Math.cos(a),y+(length+distance)*Math.sin(a)+t*t*17);ctx.stroke();
  }
  ctx.restore();
}
function effects(e,t,hx,mx){
  const h=SIEGE_ART[e.hid];
  const y=FLOOR-165;
  for(const ev of e.hitsInFight){
    const dt=t-ev.time;
    if(ev.by==='hero'&&dt>-195&&dt<150){
      const progress=norm(dt,-195,0);
      ctx.save();ctx.globalAlpha=1-ease(norm(dt,45,150));ctx.shadowColor=h.color;ctx.shadowBlur=13;ctx.strokeStyle=h.color;
      const x0=hx+(h.counter==='bolt'?103:52);
      const x1=mx-34;
      if(h.counter==='hammer'){
        ctx.lineWidth=3.6;ctx.beginPath();ctx.arc(hx+57,y-16,96,-1.32+progress*1.52,-.22+progress*1.52);ctx.stroke();
      }else if(h.counter==='bolt'){
        const x=mix(x0,x1,progress);
        const py=y-44+29*progress*progress;
        ctx.lineWidth=3.7;ctx.beginPath();ctx.moveTo(x-34,py-2);ctx.lineTo(x+9,py);ctx.stroke();
        ctx.fillStyle='#ffdf9a';poly(ctx,[[x+12,py],[x+3,py-4],[x+3,py+4]]);ctx.fill();
      }else{
        const x=mix(x0,x1,progress);
        ctx.lineWidth=4.2;ctx.beginPath();ctx.moveTo(x0,y-47);ctx.bezierCurveTo(x0+50,y-101,x-44,y+18,x,y-16);ctx.stroke();
      }
      ctx.restore();
    }
    if(dt>=0&&dt<350){
      const q=dt/350;
      const x=ev.by==='hero'?mx-39:hx+42;
      const color=ev.by==='hero'?h.color:ev.kind==='block'?'#ffcf93':'#f2a787';
      battleSparks(x,y,q,color,ev.kind==='heavy'?17:10);
    }
  }
  if(t>e.defeat&&t<e.defeat+580){
    const p=norm(t,e.defeat,e.defeat+580);
    ctx.save();ctx.globalAlpha=.31*(1-p);ctx.fillStyle='#ceb0b7';
    for(let i=0;i<8;i++){
      const spread=(i-3.5)*(19+p*14);
      ctx.beginPath();ctx.ellipse(mx+spread,FLOOR-6-p*15,11+p*17,4+p*8,0,0,TAU);ctx.fill();
    }
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
  Promise.all([
    ...Object.entries(SIEGE_ART).map(async([id,record])=>[id,await loadImage('siege/'+record.file)]),
    ...Object.entries(RECOVERY).map(async([id,data])=>[id+'-recovery',await loadImage('siege/'+data.file)])
  ])
]).then(([board,metadata,textures])=>{
  background=board;targets=metadata;
  images=Object.fromEntries(textures);
  climbingImages=Object.fromEntries(monsters.map(id=>[id,Object.fromEntries(['a','b'].map(side=>{
    const [x,y,w,h]=asset(id,'climb-'+side).rect;
    const patch=document.createElement('canvas');
    patch.width=w;patch.height=h;
    patch.getContext('2d').drawImage(images[id],x,y,w,h,0,0,w,h);
    return [side,patch];
  }))]));
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
