'use strict';

const scene = document.querySelector('#battlefield');
const ctx = scene.getContext('2d');
const status = document.querySelector('#status');
const startButton = document.querySelector('#start');
const pauseButton = document.querySelector('#pause');
const W = scene.width, H = scene.height, FLOOR = 913;
const params = new URLSearchParams(location.search);
const TAU = Math.PI * 2;
const SIEGE_ART = SiegeRigs.specs;
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

let background, targets, actors, current, startTime=0, pausedAt=null, frame=0, history=[];
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
function pickHits(mode,spec){
  const ground=shuffle(targets.filter(target=>!target.high));
  const count=rampage[mode]??choose([3,4,ground.length-2,ground.length,ground.length+1,ground.length+2,ground.length+3,Infinity]);
  const high=shuffle(targets.filter(target=>target.high));
  const reptile=spec.form==='drake';
  const groundMethods=[...spec.attacks,...shuffle(reptile?['claw','throw']:['smash','stomp','throw'])];
  const highMethods=shuffle(reptile?['throw','claw','bite']:['throw','smash','punch']);
  return [
    ...ground.map((target,i)=>({target,method:groundMethods[i%groundMethods.length]})),
    ...high.map((target,i)=>({target,method:highMethods[i%highMethods.length]}))
  ].slice(0,count);
}

function plan(mode='random',options={}){
  let result,signature;
  for(let attempt=0;attempt<120;attempt++){
    const mid=monsters.includes(options.monster)?options.monster:choose(monsters);
    const hid=heroes.includes(options.hero)?options.hero:choose(heroes);
    const quip=choose(QUIPS);
    const hits=pickHits(mode,SIEGE_ART[mid]);
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
  const tempo=full?.85:1;
  const pace=SIEGE_ART[encounter.mid].locomotion.pace;
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
    move('walk',[x,FLOOR],clamp(Math.abs(x-position[0])*2.85/pace,295,1700));
  }
  for(const hit of encounter.hits){
    const t=hit.target,[x,y,w,h]=t.rect;
    const c=center(t);
    const direction=(t.high?t.rail:c[0])>W*.62?1:-1;
    const bodySide=-direction;
    const toss=hit.method==='throw';
    if(t.high){
      const rail=t.rail, railFace=rail>W*.6?1:-1;
      const firstGrip=[rail,FLOOR-163];
      const topLip=y<70?46:clamp(c[1]-3,115,FLOOR-220);
      walk(rail-railFace*62);
      const mount=move('mount',firstGrip,520,{face:railFace});
      const climb=move('climb',[rail,topLip],clamp((firstGrip[1]-topLip)*5.1,690,3650),{face:railFace});
      const traverse=move('traverse',[c[0],topLip],clamp(Math.abs(c[0]-rail)*6.2,260,1560),{face:railFace});
      const attack=move('ledge-hit',c,toss?650:775,{face:railFace,hit});
      hit.detach=attack.start+(attack.end-attack.start)*.64;
      let finish=attack;
      if(toss){
        const release=[clamp(c[0]+bodySide*117,55,W-55),clamp(c[1]-36,44,FLOOR-80)];
        finish=move('fling',release,555,{face:railFace,hit});
        hit.release=finish.end;
        hit.from=release;
        hit.to=[clamp(release[0]+bodySide*clamp(90+(FLOOR-c[1])*.32,110,410),35,W-35),FLOOR-12];
        hit.impact=hit.release+clamp(Math.sqrt((FLOOR-c[1])/990)*1150,440,1000);
      }else{
        hit.release=hit.impact=hit.detach;
        hit.from=hit.to=c;
      }
      const drop=move('drop',[clamp(finish.to[0]+bodySide*77,45,W-50),FLOOR],clamp(Math.sqrt((FLOOR-topLip)/950)*910,400,865),{face:railFace});
      const route={climb:{...climb},traverse:{...traverse},attack:{...attack},finish:{...finish}};
      for(const segment of new Set([mount,climb,traverse,attack,finish,drop]))segment.route=route;
      if(toss){
        hit.launch=SiegeMotion.throwGrip(encounter,finish,hit.release);
      }
    }else{
      const distance={stomp:57,bite:141,tail:117,kick:89}[hit.method]??103;
      walk(c[0]+bodySide*distance);
      const duration={punch:920,kick:1030,tail:1160,smash:1010,bite:1060,stomp:980,claw:880,throw:1210}[hit.method];
      const attack=move(hit.method,[position[0],FLOOR],duration,{face:direction,contact:c,hit});
      hit.detach=attack.start+(attack.end-attack.start)*(hit.method==='stomp'?.69:.61);
      hit.release=toss?attack.start+(attack.end-attack.start)*.84:hit.detach;
      hit.from=toss?[clamp(c[0]+bodySide*111,35,W-35),c[1]-85]:c;
      hit.to=toss?[clamp(c[0]+bodySide*237,35,W-35),FLOOR-10]:c;
      hit.impact=toss?hit.release+480:hit.release;
      if(toss){
        hit.launch=SiegeMotion.throwGrip(encounter,attack,hit.release);
      }
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

function shadow(x,y,s=1,alpha=.5){
  ctx.save();ctx.translate(x,y-4);ctx.scale(105*s,20*s);ctx.globalAlpha*=alpha;
  const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,'#000');g.addColorStop(1,'transparent');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,1,0,TAU);ctx.fill();ctx.restore();
}
function rampageActor(e,t){
  const segment=e.segments.find(s=>t>=s.start&&t<s.end);
  if(!segment)return;
  const pose=SiegeMotion.rampage(e,segment,t);
  pose.breathe=t/310;
  shadow(pose.x,FLOOR,1,.56*(1-clamp((FLOOR-pose.y)/420)));
  actors.clear();
  SiegeRigs.draw(actors,e.mid,pose);
  ctx.drawImage(actors.canvas,0,0,W,H);
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
  const ground=hit.method==='throw'||hit.method==='stomp';
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
    if(['smash','stomp','bite','kick','punch','tail'].includes(hit.method)){
      ctx.strokeStyle=tint;ctx.lineWidth=(1-q)*3;
      ctx.beginPath();
      ctx.ellipse(x,y,9+q*(hit.method==='stomp'?96:58),5+q*25,0,0,TAU);
      ctx.stroke();
    }
    if(hit.method==='claw'){
      for(const n of [-1,0,1]){
        ctx.beginPath();ctx.moveTo(x-27+n*11,y-29);ctx.quadraticCurveTo(x+n*8,y-5,x+19+n*10,y+29);ctx.stroke();
      }
    }
    ctx.restore();
  }
}
function movingPiece(e,hit,t){
  if(t<hit.detach||t>=hit.impact)return;
  const tex=hit.target.texture;
  const c=center(hit.target);
  let point,turn,size;
  if(t<hit.release){
    const u=ease(norm(t,hit.detach,hit.release));
    const segment=e.segments.find(move=>move.hit===hit&&t>=move.start&&t<move.end);
    point=SiegeMotion.throwGrip(e,segment,t);
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
    const fall=mix(hit.launch[1],endCenter,u)-4*arc*u*(1-u);
    point=[mix(hit.launch[0],hit.to[0],u),Math.min(fall,FLOOR-size*halfHeight(turn))];
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
  const [opening,heavy]=SIEGE_ART[monster].attacks;
  const hits=[
    {kind:'block',time:start+random(1740,1920),by:'monster',technique:opening},
    {kind:'counter',time:start+random(2620,2840),'by':'hero'},
    {kind:'body',time:start+random(3560,3790),by:'monster',technique:heavy},
  ];
  let down=null,rise=null;
  if(peril){
    down=start+random(4440,4820);
    rise=down+random(960,1330);
    hits.push({kind:'heavy',time:down,by:'monster',technique:opening});
    hits.push({kind:'break',time:rise+random(780,980),'by':'hero'});
  }else{
    hits.push({kind:'block',time:start+random(4480,4750),by:'monster',technique:opening});
  }
  const counter=hits.at(-1).time+random(1050,1420);
  hits.push({kind:'finish',time:counter,'by':'hero'});
  return {hitsInFight:hits,down,rise,parry:hits[0].time,counter,defeat:counter+555};
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
  const action=events.find(ev=>t>=ev.time-350&&t<ev.time+375);
  const poses=SiegeMotion.fight(e,t,mx,hx,action);
  shadow(poses.hero.x,FLOOR,.73);
  shadow(poses.monster.x,FLOOR,t>=e.defeat?1.3:1);
  actors.clear();
  SiegeRigs.draw(actors,m,poses.monster);
  SiegeRigs.draw(actors,h,poses.hero);
  ctx.drawImage(actors.canvas,0,0,W,H);
  effects(e,t,poses,action);
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
function effects(e,t,poses,action){
  const mx=poses.monster.x;
  const h=SIEGE_ART[e.hid];
  for(const ev of e.hitsInFight){
    const dt=t-ev.time;
    if(ev!==action||!poses.contact)continue;
    const [impactX,impactY]=poses.contact;
    if(ev.by==='hero'&&dt>-195&&dt<150){
      const progress=norm(dt,-195,0);
      ctx.save();ctx.globalAlpha=1-ease(norm(dt,45,150));ctx.shadowColor=h.color;ctx.shadowBlur=13;ctx.strokeStyle=h.color;
      const [x0,y0]=poses.hero.weapon.tip;
      const x1=impactX;
      if(h.counter==='hammer'){
        if(dt<0){ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(x0-27,y0-37);ctx.quadraticCurveTo(x0-15,y0-23,x0,y0);ctx.stroke();}
      }else if(h.counter==='bolt'){
        const x=mix(x0,x1,progress);
        const py=mix(y0,impactY,progress)-14*Math.sin(Math.PI*progress);
        ctx.lineWidth=3.7;ctx.beginPath();ctx.moveTo(x-34,py-2);ctx.lineTo(x+9,py);ctx.stroke();
        ctx.fillStyle='#ffdf9a';poly(ctx,[[x+12,py],[x+3,py-4],[x+3,py+4]]);ctx.fill();
      }else{
        const x=mix(x0,x1,progress);
        const py=mix(y0,impactY,progress);
        ctx.lineWidth=4.2;ctx.beginPath();ctx.moveTo(x0,y0);ctx.bezierCurveTo(x0+50,y0-37,x-37,py+31,x,py);ctx.stroke();
      }
      ctx.restore();
    }
    if(dt>=0&&dt<350){
      const q=dt/350;
      const color=ev.by==='hero'?h.color:ev.kind==='block'?'#ffcf93':'#f2a787';
      battleSparks(impactX,impactY,q,color,ev.kind==='heavy'?17:10);
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
  for(const hit of e.hits)movingPiece(e,hit,t);
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
  fetch('siege/targets.json?v=4').then(r=>{if(!r.ok)throw new Error('Could not load battlefield targets');return r.json();})
]).then(([board,metadata])=>{
  background=board;targets=metadata;
  actors=SiegeRigs.createRenderer(W,H);
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
