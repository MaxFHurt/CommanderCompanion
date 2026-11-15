'use strict';

const SiegeMotion = (() => {
  const {specs, frame, legRig, armRig, armJoints, add, sub, mul, len, unit, between} = SiegeRigs;
  const sideOffset = (p, depth) => [p[0],p[1],depth];
  const smooth = (t,a,b) => ease(norm(t,a,b));
  const lift = t => Math.sin(Math.PI*t);
  const set = (a,i,value) => { a[i]=value; };
  const rigs = e => [specs[e.mid],specs[e.hid]];

  function walkPose(id,from,to,t,start,end,face) {
    const distance=Math.abs(to[0]-from[0]);
    const stride=specs[id].hero?49:66;
    const steps=Math.max(2,Math.ceil(distance/stride));
    const elapsed=norm(t,start,end);
    const coast=.13;
    const distanceAt=elapsed<coast?elapsed**2/(2*coast):elapsed>1-coast?1-coast-(1-elapsed)**2/(2*coast):elapsed-coast/2;
    const walk=distanceAt/(1-coast)*steps;
    const odd=Math.floor(walk)%2;
    const u=walk%1;
    const step=distance/steps;
    const length=walk*step;
    const direction=Math.sign(to[0]-from[0])||face;
    const x=from[0]+direction*length;
    const swing=lift(u);
    const gait=smooth(elapsed,0,.12)*(1-smooth(elapsed,.83,1));
    const pose={x,y:FLOOR-5*swing*gait,face,pitch:-.09*gait,breathe:walk*.95};
    const body=frame(specs[id],pose);
    const rest=armRig(specs[id],pose,body).rests;
    pose.arms=rest.map((hand,i)=>add(hand,mul(body.forward,(i===odd?-1:1)*26*Math.cos(u*Math.PI)*gait)));
    pose.legs=[-1,1].map((side,i)=>{
      const pivot=Math.floor(walk);
      const base=Math.min(distance,Math.max(0,(pivot+(i===odd?-1:0))*step));
      const next=Math.min(distance,(pivot+1)*step);
      const fx=i===odd?mix(base,next,ease(u)):base;
      const stepPoint=[from[0]+direction*fx+side*8,FLOOR-6-(i===odd?swing*22:0),side*18];
      return between(body.local(side*16,-5,side*23),stepPoint,gait);
    });
    return pose;
  }

  // Fit the body between planted feet and hands before the joint solver runs.
  function fitContacts(spec,pose,handWeights=[0,0]) {
    const feet=pose.legs??[];
    const project=(end,root,reach,weight=1)=>{
      const delta=sub(end,root);
      const distance=len(delta);
      if(distance<=reach+.01)return false;
      const correction=mul(delta,(distance-reach)/distance*weight);
      pose.x+=correction[0];
      pose.y+=correction[1];
      pose.depth=(pose.depth||0)+correction[2];
      return true;
    };
    for(let pass=0;pass<9;pass++){
      let adjusted=false;
      for(const [i,weight] of handWeights.entries()){
        if(!weight)continue;
        const arms=armRig(spec,pose);
        adjusted=project(pose.arms[i],arms.shoulders[i],arms.upper+arms.lower-6,weight)||adjusted;
      }
      for(const [i,foot] of feet.entries()){
        const legs=legRig(spec,pose);
        adjusted=project(foot,legs.hips[i],legs.upper+legs.lower-5)||adjusted;
      }
      if(!adjusted)break;
    }
    return pose;
  }

  function climbRoute(spec,segment,t,route) {
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
    const spacing=40;
    const beat=Math.floor(progress/spacing);
    const phase=(progress-beat*spacing)/spacing;
    const hand=beat%2;
    const startGrip=anchor(Math.min(max,beat*spacing));
    const nextGrip=anchor(Math.min(max,(beat+1)*spacing));
    const oldGrip=anchor((beat-1)*spacing);
    const transfer=smooth(phase,.12,.80);
    const grips=[];
    set(grips,1-hand,sideOffset(startGrip,(1-hand)*15-6));
    const reaching=lerp(oldGrip,nextGrip,transfer);
    reaching[0]-=face*23*lift(transfer);
    reaching[1]-=16*lift(transfer);
    set(grips,hand,sideOffset(reaching,hand*15-6));

    // A ledge has a separate foothold below the lip, including during horizontal travel.
    function footRung(n,index){
      const point=anchor(n);
      return [point[0]-face*12,Math.min(FLOOR-7,point[1]+121),index*25-7];
    }
    const footPhase=smooth(phase,.49,.98);
    const lead=footRung(beat*spacing,1-hand);
    const moving=between(footRung((beat-1)*spacing,hand),footRung((beat+1)*spacing,hand),footPhase);
    moving[0]-=face*21*lift(footPhase);
    moving[1]-=11*lift(footPhase);
    const legs=[];
    set(legs,1-hand,lead);
    set(legs,hand,moving);
    const body=anchor(progress-17);
    return fitContacts(spec,{x:body[0]-face*46,y:body[1]+158,face,pitch:-.14,breathe:progress/44,arms:grips,legs,climbing:true},[1,1]);
  }


  // The detached panel and the claw use the same position until release.
  function carriedPiece(hit,t) {
    const u=ease(norm(t,hit.detach,hit.release));
    const point=lerp(center(hit.target),hit.from,u);
    const curl=lift(u);
    point[0]-=(hit.from[0]-center(hit.target)[0])*.27*curl;
    point[1]-=39*curl;
    return point;
  }

  const IMPACT=.64;
  // Each pose gives time, forward weight shift, rise, torso pitch, and shoulder turn.
  const BODY_TRACKS={
    smash:[[0,0,0,0,0],[.26,-11,-12,.20,.15],[.47,-7,-17,.16,.28],[IMPACT,30,15,-.81,-.19],[.73,34,21,-.88,-.23],[.87,10,8,-.32,-.10],[1,0,0,0,0]],
    claw:[[0,0,0,0,0],[.29,-15,5,.12,.24],[.48,-19,7,.20,.44],[IMPACT,27,4,-.36,-.27],[.79,35,8,-.46,-.48],[1,0,0,0,0]],
    bite:[[0,0,0,0,0],[.27,-12,2,.16,.10],[.47,4,-5,-.26,-.05],[IMPACT,21,-25,-1.10,-.13],[.73,24,-27,-1.18,-.15],[.89,6,-12,-.47,-.08],[1,0,0,0,0]],
    stomp:[[0,0,0,0,0],[.28,-17,-10,.13,.12],[.49,-13,-14,.21,.18],[IMPACT,11,11,-.23,-.07],[.75,13,16,-.27,-.10],[.89,3,2,-.08,-.02],[1,0,0,0,0]],
    throw:[[0,0,0,0,0],[.28,-5,3,.04,.16],[.47,9,7,-.18,.09],[IMPACT,24,10,-.37,-.10],[.78,7,-1,-.14,.18],[.9,-17,-7,.25,.46],[1,0,0,0,0]]
  };
  // Local hand positions describe the silhouette before and after the strike.
  const HAND_TRACKS={
    smash:[[0,19,-78,29],[.28,0,-156,34],[.48,-12,-185,25],[.74,50,-70,26],[.86,32,-50,29],[1,19,-78,29]],
    claw:[[0,19,-78,29],[.29,-31,-104,41],[.49,-37,-119,52],[.74,49,-105,15],[.84,35,-73,9],[1,19,-78,29]],
    bite:[[0,19,-78,29],[.37,3,-88,40],[.59,26,-78,45],[.76,30,-65,36],[1,19,-78,29]],
    stomp:[[0,19,-78,29],[.29,-19,-109,40],[.49,-16,-120,46],[.72,23,-99,39],[1,19,-78,29]],
    throw:[[0,19,-78,29],[.32,4,-107,39],[.54,40,-91,27],[.81,15,-118,17],[.94,-27,-104,34],[1,19,-78,29]]
  };
  const CONTACT=[[0,0],[.40,0],[.54,.24],[IMPACT,1],[.70,.89],[.86,.24],[1,0]];

  function sample(track,t){
    let i=1;
    while(i<track.length-1&&t>track[i][0])i++;
    const a=track[i-1],b=track[i],before=track[i-2],after=track[i+1];
    const span=b[0]-a[0], u=norm(t,a[0],b[0]);
    const slope=(left,right)=>left*right>0?2*left*right/(left+right):0;
    return a.slice(1).map((value,j)=>{
      const k=j+1, end=b[k], d=(end-value)/span;
      const startTangent=before?slope((value-before[k])/(a[0]-before[0]),d):0;
      const endTangent=after?slope(d,(after[k]-end)/(after[0]-b[0])):0;
      return mix(value,end,ease(u))+span*u*(1-u)*((1-u)*startTangent-u*endTangent);
    });
  }

  function attackBeat(t,start,impact,end){
    return t<impact?IMPACT*norm(t,start,impact):mix(IMPACT,1,norm(t,impact,end));
  }

  function neutral(x,face,t){
    return {x,y:FLOOR,face,breathe:t/310};
  }

  function groundAttack(spec,s,t,pose){
    const {kind,start,end,hit}=s;
    const at=hit.detach, beat=attackBeat(t,start,at,end);
    const [shift,rise,pitch,turn]=sample(BODY_TRACKS[kind],beat);
    const [weight]=sample(CONTACT,beat);
    const stance=frame(spec,pose);
    const feet=[stance.local(-16,-5,-23),stance.local(16,-5,23)];
    pose.x+=pose.face*shift*stance.size;
    pose.y+=rise*stance.size;
    pose.pitch=pitch;
    pose.yaw=.42+turn;
    const step=smooth(beat,.38,.63)*(1-smooth(beat,.79,1));
    feet[1]=add(feet[1],[pose.face*23*step,-12*lift(step),0]);
    pose.legs=feet;
    if(kind==='stomp'){
      const contact=[s.contact[0]-stance.forward[0]*17*stance.size,s.contact[1]-6,23];
      const chamber=[contact[0]-pose.face*23,contact[1]-67,23];
      const lifted=between(feet[1],chamber,smooth(beat,.12,.47));
      const land=smooth(beat,.49,IMPACT);
      pose.legs[1]=between(between(lifted,contact,land),feet[1],smooth(beat,.75,1));
    }
    fitContacts(spec,pose);
    const body=frame(spec,pose);
    const rest=armRig(spec,pose,body).rests;
    const [x,y,z]=sample(HAND_TRACKS[kind],beat);
    const motion=smooth(beat,0,.15)*(1-smooth(beat,.88,1));
    pose.arms=[between(rest[0],body.local(kind==='smash'?x-5:-x*.36,y+10,-z),motion),between(rest[1],body.local(x,y,z),motion)];
    if(kind==='bite'){
      const [jaw]=sample([[0,0],[.29,.48],[.53,1],[IMPACT,.05],[.79,.18],[1,0]],beat);
      pose.jaw=jaw;
      pose.bite=sideOffset(s.contact,17);
      pose.biteDrive=weight;
      pose.biteTilt=.88*weight;
    }else if(kind==='smash'||kind==='claw'){
      const direction=unit(add(body.forward,[0,kind==='smash'?1.6:.45,0]));
      const reach=(spec.form==='drake'?18:15)*body.size;
      const wrist=sub(sideOffset(s.contact,15),mul(direction,reach));
      pose.arms[1]=between(pose.arms[1],wrist,weight);
      if(kind==='smash')pose.arms[0]=between(pose.arms[0],sub(wrist,[pose.face*23,0,18]),weight);
      fitContacts(spec,pose,kind==='smash'?[weight,weight]:[0,weight]);
      pose.handDirections=pose.arms.map((_,i)=>{
        if(i===0&&kind!=='smash')return null;
        const {wrist,elbow}=armJoints(spec,pose,i);
        return unit(between(unit(sub(wrist,elbow)),direction,weight));
      });
    }else if(kind==='throw'){
      const take=smooth(beat,.39,IMPACT);
      const drop=1-smooth(t,hit.release,end);
      const grip=sideOffset(t<at?center(hit.target):carriedPiece(hit,t),15);
      pose.arms[1]=between(pose.arms[1],grip,take*drop);
      fitContacts(spec,pose,[0,take*(1-smooth(t,at,at+230))]);
    }
    return pose;
  }

  function rampage(e,s,t,route=s.route) {
    const {kind,from,to,start,end}=s;
    const u=norm(t,start,end);
    const face=s.face??(to[0]<from[0]?-1:1);
    const spec=specs[e.mid];
    if(kind==='walk')return walkPose(e.mid,from,to,t,start,end,face);
    if(kind==='climb'||kind==='traverse')return climbRoute(spec,s,t,route);
    const p=lerp(from,to,ease(u));
    if(kind==='mount'){
      const climbPose=climbRoute(spec,route.climb,end,route);
      const walk=walkPose(e.mid,from,from,end,start,end,face);
      return fitContacts(spec,blendPose(walk,climbPose,ease(u)),[ease(u),ease(u)]);
    }
    if(kind==='ledge-hit'||kind==='fling'){
      const {traverse,attack}=route;
      const base=climbRoute(spec,traverse,traverse.end,route);
      const {method,target,detach}=s.hit;
      const contact=sideOffset(center(target),15);
      const beat=attackBeat(t,attack.start,detach,attack.end);
      const [weight]=sample(CONTACT,beat);
      const support=base.arms[0];
      const pose={...base,breathe:base.breathe+u};
      if(method==='throw'){
        const point=t<detach?contact:sideOffset(carriedPiece(s.hit,t),15);
        const reach=smooth(beat,.29,IMPACT);
        pose.x-=face*33*(kind==='fling'?ease(u):0);
        pose.pitch+=.27*(kind==='fling'?ease(u):0);
        pose.arms=[support,between(base.arms[1],point,reach)];
        return fitContacts(spec,pose,[1,reach*(1-smooth(t,detach,detach+230))]);
      }
      if(method==='bite'){
        pose.pitch-=.40*weight;
        pose.y+=12*weight;
        pose.jaw=sample([[0,0],[.30,.34],[.53,1],[IMPACT,.05],[1,0]],beat)[0];
        pose.bite=contact;
        pose.biteDrive=weight;
        pose.biteTilt=.24*weight;
      }else{
        const raise=smooth(beat,.12,.45)*(1-smooth(beat,.48,.71));
        const follow=smooth(beat,IMPACT,.75)*(1-smooth(beat,.78,1));
        const rest=add(base.arms[1],[-face*(34*raise-12*follow),-46*raise+23*follow,21*raise]);
        const direction=unit([face,.81,0]);
        pose.arms=[support,between(rest,sub(contact,mul(direction,16*spec.scale)),weight)];
        if(weight>.01){
          const {wrist,elbow}=armJoints(spec,pose,1);
          pose.handDirections=[null,unit(between(unit(sub(wrist,elbow)),direction,weight))];
        }
        pose.pitch-=.22*weight;
      }
      return fitContacts(spec,pose,[1,method==='smash'?weight:1]);
    }
    if(kind==='drop'){
      const startPose=rampage(e,route.finish,start,route);
      const z=walkPose(e.mid,to,to,end,start,end,face);
      const airborne={...z,y:mix(startPose.y,FLOOR,u*u),x:mix(startPose.x,to[0],ease(u)),pitch:.24*lift(u),arms:undefined,legs:undefined};
      if(u<.30)return blendPose(startPose,airborne,smooth(u,0,.30),spec);
      return airborne;
    }
    const pose=neutral(p[0],face,t);
    if(kind==='settle')return pose;
    return groundAttack(spec,s,t,pose);
  }

  function throwGrip(encounter,segment,t){
    const spec=specs[encounter.mid];
    return armJoints(spec,rampage(encounter,segment,t),1).wrist.slice(0,2);
  }

  function blendPose(a,b,u,spec) {
    const defaults=(pose,field,i)=>{
      const side=i===0?-1:1;
      if(field==='arms')return armRig(spec,pose).rests[i];
      return frame(spec,pose).local(side*16,-5,side*23);
    };
    const pose={...b,x:mix(a.x,b.x,u),y:mix(a.y,b.y,u),pitch:mix(a.pitch||0,b.pitch||0,u),depth:mix(a.depth||0,b.depth||0,u)};
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
    const m={x:mx,y:FLOOR,face:-1,pitch:.12,breathe:t/310};
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
    if(!action){
      h.weapon=weapon(h,hero,smooth(t,e.defeat,e.defeat+570));
      return {hero:h,monster:m};
    }
    const beat=attackBeat(t,action.time-350,action.time,action.time+375);
    const [impact]=sample(CONTACT,beat);
    const recoil=smooth(beat,IMPACT,.73)*(1-smooth(beat,.76,1));
    if(action.by==='monster'){
      const block=action.kind==='block';
      const technique=action.kind==='heavy'?'smash':block?'claw':e.technique;
      const [shift,rise,pitch,turn]=sample(BODY_TRACKS[technique],beat);
      const [handX,handY,handZ]=sample(HAND_TRACKS[technique],beat);
      m.x=mix(m.x,h.x+107,impact*.91)-shift*.19;
      m.y+=rise*.30;
      m.pitch+=pitch*.43;
      m.yaw=.42+turn;
      h.pitch+=recoil*(block?.16:.35);
      const contact=[h.x+(block?36:15),FLOOR-(block?112:108),22];
      const body=frame(monster,m);
      const rest=armRig(monster,m,body).rests;
      const wind=smooth(beat,0,.22)*(1-smooth(beat,.84,1));
      m.arms=[rest[0],between(rest[1],body.local(handX,handY,handZ),wind)];
      if(technique==='bite'){
        m.jaw=sample([[0,0],[.34,.65],[.54,1],[IMPACT,.04],[.82,.19],[1,0]],beat)[0];
        m.bite=contact;
        m.biteDrive=impact;
      }else{
        const direction=unit(add(body.forward,[0,technique==='smash'?.69:.07,0]));
        const reach=(monster.form==='drake'?18:15)*body.size;
        const wrist=sub(contact,mul(direction,reach));
        m.arms[1]=between(m.arms[1],wrist,impact);
        if(technique==='smash'){
          const low=body.local(handX-7,handY+7,-handZ);
          m.arms[0]=between(between(rest[0],low,wind),sub(wrist,[11,0,16]),impact);
        }
        fitContacts(monster,m,technique==='smash'?[impact,impact]:[0,impact]);
        m.handDirections=m.arms.map((_,i)=>{
          const {wrist,elbow}=armJoints(monster,m,i);
          return unit(between(unit(sub(wrist,elbow)),direction,impact));
        });
      }
      h.weapon=weapon(h,hero,impact,block?contact:null);
      return {hero:h,monster:m,contact};
    }
    const melee=hero.counter==='hammer';
    const contact=[m.x-21,FLOOR-112,24];
    if(melee){
      h.x=mix(h.x,m.x-115,impact*.89);
      h.pitch-=impact*.34;
    }
    h.weapon=weapon(h,hero,impact,melee?contact:null,beat);
    m.pitch-=recoil*.36;
    return {hero:h,monster:m,contact};
  }

  function weapon(pose,spec,power,contact,beat=0){
    const {local,size}=frame(spec,pose);
    const hammer=spec.counter==='hammer';
    const bolt=spec.counter==='bolt';
    const rest=armRig(spec,pose).rests;
    const prepare=smooth(beat,.03,.38)*(1-smooth(beat,.43,.66));
    const guard=between(rest[1],local(24,-94,26),.82);
    const windup=hammer?local(-13,-133,37):local(29,bolt?-103:-119,25);
    const active=local(bolt?49:48,-119,24);
    const length=(hammer?59:bolt?31:54)*size;
    let grip=between(between(guard,windup,prepare),active,power);
    let tip=local(bolt?70:48,bolt?-110:-151,25);
    if(contact){
      const aim=unit(sub(contact,grip));
      grip=between(grip,sub(contact,mul(aim,length)),power);
      tip=between(tip,contact,power);
    }else{
      tip=between(tip,hammer?local(-27,-185,35):local(71,-119,26),prepare);
      tip=between(tip,local(86,-124,27),power);
    }
    pose.arms=[bolt?between(rest[0],local(35,-98,-13),.9):between(rest[0],local(14,-98,-20),power),grip];
    if(contact)fitContacts(spec,pose,[0,power]);
    const wrist=armJoints(spec,pose,1).wrist;
    return {grip:wrist,tip:add(wrist,mul(unit(sub(tip,wrist)),length))};
  }
  return {fight,rampage,carriedPiece,throwGrip};
})();
