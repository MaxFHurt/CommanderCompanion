'use strict';

const SiegeMotion = (() => {
  const {specs, frame, sub, mul, unit, between} = SiegeRigs;
  const sideOffset = (p, depth) => [p[0],p[1],depth];
  const smooth = (t,a,b) => ease(norm(t,a,b));
  const lift = t => Math.sin(Math.PI*t);
  const set = (a,i,value) => { a[i]=value; };
  const rigs = e => [specs[e.mid],specs[e.hid]];

  function walkPose(id,from,to,t,start,end,face) {
    const distance=Math.abs(to[0]-from[0]);
    const stride=specs[id].hero?49:66;
    const steps=Math.max(2,Math.ceil(distance/stride));
    const walk=norm(t,start,end)*steps;
    const odd=Math.floor(walk)%2;
    const u=walk%1;
    const step=distance/steps;
    const length=walk*step;
    const direction=Math.sign(to[0]-from[0])||face;
    const x=from[0]+direction*length;
    const swing=lift(u);
    const pose={x,y:FLOOR-5*swing,face,pitch:face*-.09,breathe:walk*.95};
    const {local}=frame(specs[id],pose);
    pose.arms=[-1,1].map((side,i)=>local(13+(i===odd?-1:1)*27*Math.cos(u*Math.PI),-84,side*(specs[id].hero?21:34)));
    pose.legs=[-1,1].map((side,i)=>{
      const pivot=Math.floor(walk);
      const base=Math.min(distance,Math.max(0,(pivot+(i===odd?-1:0))*step));
      const next=Math.min(distance,(pivot+1)*step);
      const fx=i===odd?mix(base,next,ease(u)):base;
      return [from[0]+direction*fx+side*8,FLOOR-6-(i===odd?swing*22:0),side*18];
    });
    return pose;
  }

  function climbRoute(segment,t,route) {
    const {start,end,face}=segment;
    const {climb,traverse}=route;
    const rise=Math.abs(climb.to[1]-climb.from[1]);
    const along=Math.abs(traverse.to[0]-traverse.from[0]);
    const max=rise+along;
    function anchor(distance) {
      if(distance<0)return [climb.from[0],Math.min(FLOOR-8,climb.from[1]-distance)];
      if(distance<=rise)return [climb.from[0],climb.from[1]-distance];
      if(along<1)return traverse.to;
      return lerp(traverse.from,traverse.to,clamp((distance-rise)/along));
    }
    const u=norm(t,start,end);
    const progress=segment.kind==='climb'?rise*u:rise+along*u;
    // Each contact stays on its rung for two beats. The reach starts after the other hand settles.
    const spacing=57;
    const beat=Math.floor(progress/spacing);
    const phase=(progress-beat*spacing)/spacing;
    const hand=beat%2;
    const startGrip=anchor(Math.min(max,beat*spacing));
    const nextGrip=anchor(Math.min(max,(beat+1)*spacing));
    const oldGrip=anchor((beat-1)*spacing);
    const transfer=smooth(phase,.12,.80);
    const grips=[];
    set(grips,1-hand,sideOffset(startGrip,1-(1-hand)*6));
    const reaching=lerp(oldGrip,nextGrip,transfer);
    reaching[0]-=face*23*lift(transfer);
    reaching[1]-=16*lift(transfer);
    set(grips,hand,sideOffset(reaching,1-hand*6));

    const footPhase=smooth(phase,.55,.98);
    const leadToe=anchor(beat*spacing-112);
    const movingToe=lerp(anchor((beat-1)*spacing-112),anchor((beat+1)*spacing-112),footPhase);
    movingToe[0]-=face*24*lift(footPhase);
    const toes=[];
    set(toes,1-hand,[leadToe[0]-face*13,Math.min(FLOOR-6,leadToe[1]),-7]);
    set(toes,hand,[movingToe[0]-face*13,Math.min(FLOOR-6,movingToe[1]),18]);
    const body=anchor(progress-34);
    return {x:body[0]-face*51,y:body[1]+149,face,pitch:-face*.19,breathe:progress/44,arms:grips,legs:toes};
  }

  // The detached panel and the claw use the same position until release.
  function carriedPiece(hit,t) {
    const u=ease(norm(t,hit.detach,hit.release));
    const point=lerp(center(hit.target),hit.from,u);
    point[1]-=28*lift(u);
    return point;
  }

  function rampage(e,s,t,route=s.route) {
    const {kind,from,to,start,end}=s;
    const u=norm(t,start,end);
    const face=s.face??(to[0]<from[0]?-1:1);
    if(kind==='walk')return walkPose(e.mid,from,to,t,start,end,face);
    if(kind==='climb'||kind==='traverse')return climbRoute(s,t,route);
    const p=lerp(from,to,ease(u));
    if(kind==='mount'){
      const climbPose=climbRoute(route.climb,end,route);
      const walk=walkPose(e.mid,from,from,end,start,end,face);
      return blendPose(walk,climbPose,ease(u));
    }
    if(kind==='grab'||kind==='fling'){
      const traverse=route.traverse;
      const base=climbRoute(traverse,traverse.end,route);
      const {target,detach}=s.hit;
      const secure=ease(norm(t,route.grab.start,detach));
      const grip=t<detach?center(target):carriedPiece(s.hit,t);
      const support=base.arms[0];
      const hand=sideOffset(grip,15);
      const rest={...base,x:base.x+(kind==='fling'?-face*30*ease(u):0),pitch:-face*.25,
        arms:[support,hand],breathe:base.breathe+u};
      return blendPose(base,rest,secure);
    }
    if(kind==='drop'){
      const startPose=rampage(e,route.fling,start,route);
      const z=walkPose(e.mid,to,to,end,start,end,face);
      const airborne={...z,y:mix(startPose.y,FLOOR,u*u),x:p[0],pitch:face*.24*lift(u),arms:undefined,legs:undefined};
      if(u<.30)return blendPose(startPose,airborne,smooth(u,0,.30),specs[e.mid]);
      return airborne;
    }
    const pose={x:p[0],y:FLOOR,face,breathe:t/230};
    if(kind==='settle')return {...pose,pitch:-face*.09*(1-u),y:FLOOR+7*lift(u)};
    const at=s.hit.detach;
    const power=pulse(t,at,at-start,end-at);
    pose.x+=face*power*26;
    pose.pitch=-face*(.31*power-.15*lift(norm(t,start,at)));
    const toss=kind==='throw';
    const throwing=toss&&t>=at&&t<=s.hit.release;
    const trajectory=throwing?carriedPiece(s.hit,t):s.contact;
    const target=sideOffset(trajectory,14);
    const {local,forward,size}=frame(specs[e.mid],pose);
    const windup=lift(norm(t,start,at));
    const rest=local(23-(kind==='claw'?51:18)*windup,-83-(kind==='smash'?99:32)*windup,27);
    const contact=sub(target,mul(forward,toss?0:12*size));
    const backHand=kind==='smash'?between(local(4,-96-windup*84,-29),[contact[0]+face*22,contact[1]-5,-9],power):local(-16,-117,-28);
    const releaseRecovery=toss&&t>s.hit.release;
    const finishHand=releaseRecovery?sideOffset(s.hit.from,14):contact;
    const follow=throwing?1:releaseRecovery?1-ease(norm(t,s.hit.release,end)):power;
    pose.arms=[backHand,between(rest,finishHand,follow)];
    if(kind==='bite'&&power>.12){
      pose.jaw=power;
      pose.bite=between(local(82,-145),target,power);
    }
    return pose;
  }

  function blendPose(a,b,u,spec) {
    const defaults=(pose,field,i)=>{
      const side=i===0?-1:1;
      return frame(spec,pose).local(field==='arms'?19:side*16,field==='arms'?-83:-5,side*(field==='arms'?35:21));
    };
    const pose={...b,x:mix(a.x,b.x,u),y:mix(a.y,b.y,u),pitch:mix(a.pitch||0,b.pitch||0,u)};
    for(const field of ['arms','legs']){
      if(a[field]&&b[field])pose[field]=a[field].map((p,i)=>between(p,b[field][i],u));
      else if(spec)pose[field]=[0,1].map(i=>between(a[field]?.[i]??defaults(a,field,i),b[field]?.[i]??defaults(b,field,i),u));
    }
    return pose;
  }

  function fight(e,t,mx,hx,action) {
    const [monster,hero]=rigs(e);
    const heroEntry=e.hitsInFight[0].time-630;
    const h={x:hx,y:FLOOR,face:1,pitch:-.10,breathe:(t-e.heroEntry)/340};
    const m={x:mx,y:FLOOR,face:-1,pitch:.12,breathe:(t-e.heroEntry)/290};
    const fall=e.down===null?0:smooth(t,e.down,e.down+320)*(1-smooth(t,e.rise,e.rise+480));
    const finish=smooth(t,e.counter+115,e.defeat);
    if(fall){
      h.y+=37*fall;
      h.pitch=.94*fall-.10;
      h.legs=[[hx-35,FLOOR-5,-12],[hx+25,FLOOR-5,22]];
    }
    if(finish){
      m.y+=46*finish;
      m.pitch=1.56*finish;
      m.legs=[[mx+63*finish,FLOOR-9,-19],[mx+103*finish,FLOOR-7,18]];
    }
    if(t<heroEntry){
      const walk=walkPose(e.hid,[-158,FLOOR],[e.heroStage[0],FLOOR],t,e.heroEntry,heroEntry,1);
      walk.weapon=weapon(walk,hero,0);
      return {hero:walk,monster:m};
    }
    const power=action?pulse(t,action.time,298,345):0;
    if(action?.by==='monster'){
      const block=action.kind==='block';
      const laid=action.kind==='heavy';
      m.pitch+=(laid?.41:.26)*power;
      m.x=mix(m.x,h.x+107,power*.83);
      const contact=[h.x+(block?30:11),FLOOR-(block?108:101),26];
      const {local,forward,size}=frame(monster,m);
      const rest=local(14,-96,30);
      const claws=sub(contact,mul(forward,11*size));
      m.arms=[local(-6,-118,-35),between(rest,claws,power)];
      if(e.technique==='bite'&&!block&&!laid&&power>.22){
        m.jaw=power;
        m.bite=between(local(82,-143),contact,power);
      }
      h.pitch+=power*(block?.20:.36);
      h.weapon=weapon(h,hero,power,block?contact:null);
      return {hero:h,monster:m,contact};
    }
    if(action?.by==='hero'){
      const melee=hero.counter==='hammer';
      if(melee)h.x=mix(h.x,m.x-125,power*.82);
      h.pitch-=power*(melee?.35:.13);
      const contact=[m.x-15,FLOOR-112,24];
      h.weapon=weapon(h,hero,power,melee?contact:null);
      const flinch=smooth(t,action.time-20,action.time+75)*(1-smooth(t,action.time+110,action.time+350));
      m.pitch-=flinch*.36;
      return {hero:h,monster:m,contact};
    }
    h.weapon=weapon(h,hero,smooth(t,e.defeat,e.defeat+570));
    return {hero:h,monster:m};
  }

  function weapon(pose,spec,power,contact) {
    const {local}=frame(spec,pose);
    const guard=pose.arms?.[1]??local(24,-94,26);
    const active=local(spec.counter==='bolt'?49:48,-119,24);
    let grip=between(guard,active,power);
    let tip=local(spec.counter==='bolt'?70:48,spec.counter==='bolt'?-110:-151,25);
    if(contact){
      const threat=unit(sub(contact,grip));
      const reach=spec.counter==='hammer'?60:49;
      grip=between(grip,sub(contact,mul(threat,reach)),power);
      tip=between(tip,contact,power);
    } else if(power){
      tip=between(tip,local(86,-124,27),power);
    }
    pose.arms=[local(spec.counter==='bolt'?35:14,-98,-20),grip];
    return {grip,tip};
  }
  return {fight,rampage,carriedPiece};
})();
