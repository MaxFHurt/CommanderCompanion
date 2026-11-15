'use strict';

const SiegeMotion = (() => {
  const {specs, frame, legRig, armRig, armJoints, tailRig, add, sub, mul, len, unit, between} = SiegeRigs;
  const sideOffset = (p, depth) => [p[0],p[1],depth];
  const smooth = (t,a,b) => ease(norm(t,a,b));
  const lift = t => Math.sin(Math.PI*t);
  const set = (a,i,value) => { a[i]=value; };
  const rigs = e => [specs[e.mid],specs[e.hid]];

  function posture(spec,x,face,t){
    const gait=spec.locomotion;
    const pose={x,y:FLOOR,face,breathe:t/310,pitch:gait?.pitch??0};
    const body=frame(spec,pose);
    const {hips}=legRig(spec,pose,body);
    const drake=spec.form==='drake';
    pose.legs=hips.map((hip,i)=>[hip[0]+face*(i?14:-14)*body.size,FLOOR-6,hip[2]]);
    if(!gait)return pose;
    const quadruped=gait.kind==='quadruped';
    pose.knuckles=gait.kind==='knuckles';
    if(quadruped||pose.knuckles){
      const {shoulders}=armRig(spec,pose,body);
      pose.arms=shoulders.map((joint,i)=>[joint[0]+face*(i?17:-9)*body.size,FLOOR-(pose.knuckles?11:14),joint[2]+(i?7:-4)]);
      return fitContacts(spec,pose,[1,1]);
    }
    if(drake){
      const {local}=body;
      pose.arms=[local(48,-105,-27),local(44,-100,27)];
    }
    return pose;
  }

  function walkPose(id,from,to,t,start,end,face) {
    const spec=specs[id], gait=spec.locomotion;
    const distance=Math.abs(to[0]-from[0]);
    const stride=gait?.stride??49;
    const steps=Math.max(2,Math.ceil(distance/stride));
    const elapsed=norm(t,start,end);
    const coast=.13;
    const distanceAt=elapsed<coast?elapsed**2/(2*coast):elapsed>1-coast?1-coast-(1-elapsed)**2/(2*coast):elapsed-coast/2;
    const walk=distanceAt/(1-coast)*steps;
    const step=distance/steps;
    const direction=Math.sign(to[0]-from[0])||face;
    const x=from[0]+direction*walk*step;
    const activity=smooth(elapsed,0,.14)*(1-smooth(elapsed,.85,1));
    const pose=posture(spec,x,face,t);
    const quadruped=gait?.kind==='quadruped';
    const onHands=quadruped||pose.knuckles;
    const bob=lift(walk%1)*(pose.knuckles?10:quadruped?3:6);
    pose.y-=bob*activity;
    pose.pitch+=(quadruped?-.035:-.065)*activity;
    function footfall(stand,i,front){
      const foreLead=front?(pose.knuckles?.26:1.40):0;
      const interval=walk+foreLead;
      const beat=Math.floor(interval);
      const phase=interval-beat;
      const swing=beat%2===i;
      const planted=clamp((beat-(swing?1:0)-foreLead)*step,0,distance);
      const landing=clamp((beat+1-foreLead)*step,0,distance);
      const reach=swing?mix(planted,landing,ease(phase)):planted;
      const relative=stand[0]-x;
      const liftHeight=front?(pose.knuckles?25:17):quadruped?16:25;
      return between(stand,[from[0]+direction*reach+relative,stand[1]-(swing?lift(phase)*liftHeight:0),stand[2]],activity);
    }
    pose.legs=pose.legs.map((foot,i)=>footfall(foot,i,false));
    if(onHands){
      pose.arms=pose.arms.map((hand,i)=>footfall(hand,i,true));
      return fitContacts(spec,pose,[1,1]);
    }
    const body=frame(spec,pose);
    const rest=pose.arms??armRig(spec,pose,body).rests;
    pose.arms=rest.map((hand,i)=>add(hand,mul(body.forward,(i===0?1:-1)*(gait?.kind==='biped'?9:26)*Math.cos(walk*Math.PI)*activity)));
    return fitContacts(spec,pose);
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
    punch:[[0,0,0,0,0],[.29,-11,0,.12,.32],[.48,-11,-6,.10,.45],[IMPACT,32,7,-.38,-.26],[.79,32,12,-.44,-.38],[1,0,0,0,0]],
    kick:[[0,0,0,0,0],[.28,-15,4,.28,-.24],[.48,-11,-16,.31,-.30],[IMPACT,16,2,.26,.12],[.73,18,8,.30,.20],[1,0,0,0,0]],
    tail:[[0,0,0,0,0],[.29,-8,0,.04,.14],[.48,-8,0,-.11,.03],[IMPACT,0,0,-.08,0],[.81,0,3,-.12,0],[1,0,0,0,0]],
    smash:[[0,0,0,0,0],[.26,-11,-12,.20,.15],[.47,-7,-17,.16,.28],[IMPACT,30,15,-.81,-.19],[.73,34,21,-.88,-.23],[.87,10,8,-.32,-.10],[1,0,0,0,0]],
    claw:[[0,0,0,0,0],[.29,-15,5,.12,.24],[.48,-19,7,.20,.44],[IMPACT,27,4,-.36,-.27],[.79,35,8,-.46,-.48],[1,0,0,0,0]],
    bite:[[0,0,0,0,0],[.27,-12,2,.16,.10],[.47,4,-5,-.26,-.05],[IMPACT,21,-25,-1.10,-.13],[.73,24,-27,-1.18,-.15],[.89,6,-12,-.47,-.08],[1,0,0,0,0]],
    stomp:[[0,0,0,0,0],[.28,-17,-10,.13,.12],[.49,-13,-14,.21,.18],[IMPACT,11,11,-.23,-.07],[.75,13,16,-.27,-.10],[.89,3,2,-.08,-.02],[1,0,0,0,0]],
    throw:[[0,0,0,0,0],[.28,-5,3,.04,.16],[.47,9,7,-.18,.09],[IMPACT,24,10,-.37,-.10],[.78,7,-1,-.14,.18],[.9,-17,-7,.25,.46],[1,0,0,0,0]]
  };
  // Local hand positions describe the silhouette before and after the strike.
  const HAND_TRACKS={
    punch:[[0,19,-78,29],[.30,-12,-110,38],[.46,-28,-107,39],[.74,59,-95,17],[.84,36,-88,20],[1,19,-78,29]],
    kick:[[0,19,-78,29],[.39,-13,-106,43],[.56,-21,-108,43],[.75,-7,-96,36],[1,19,-78,29]],
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

  function tailSwipe(spec,pose,contact,beat){
    const target=sideOffset(contact,Math.max(15,contact[2]??0));
    const [turn,sweep,aim]=sample([
      [0,0,0,0],[.24,.35,1.25,0],[.43,1.73,1.79,0],
      [IMPACT,Math.PI,-.10,1],[.79,Math.PI*1.26,-1.64,.28],[1,Math.PI*2,0,0]
    ],beat);
    const original=frame(spec,pose);
    pose.turn=-pose.face*turn;
    pose.tail={sweep,target,weight:aim};
    const pivot=tailRig(spec,pose)[0];
    const travel=Math.abs(target[0]-pivot[0]);
    const slack=spec.locomotion.tail*original.size*115;
    pose.x+=(target[0]-pivot[0])*Math.max(0,(travel-slack)/Math.max(1,travel))*aim;
    const turned=frame(spec,pose);
    const plant=legRig(spec,pose,turned).hips;
    const step=smooth(beat,.14,.57)*(1-smooth(beat,.82,1));
    pose.legs=plant.map((hip,i)=>between(pose.legs[i],[hip[0]+turned.forward[0]*(i?14:-12),FLOOR-6-12*lift(step)*i,hip[2]],step));
    if(spec.locomotion.kind==='quadruped'){
      const arms=armRig(spec,pose,turned);
      pose.arms=arms.shoulders.map((shoulder,i)=>between(pose.arms[i],[shoulder[0]+turned.forward[0]*15,FLOOR-13,shoulder[2]],step));
    }
    return fitContacts(spec,pose,spec.locomotion.kind==='quadruped'?[1,1]:[0,0]);
  }

  function kick(spec,pose,feet,contact,beat){
    const body=frame(spec,pose);
    const direction=unit([pose.face,-.16,.22]);
    const ankle=sub(sideOffset(contact,24),mul(direction,25*body.size));
    const chamber=[ankle[0]-pose.face*62,Math.min(FLOOR-70,ankle[1]-22),27];
    const skip=smooth(beat,.11,.43);
    const drive=smooth(beat,.47,IMPACT);
    const reset=smooth(beat,.72,.99);
    pose.legs=[feet[0],between(between(between(feet[1],chamber,skip),ankle,drive),feet[1],reset)];
    pose.kicking=beat>.14&&beat<.99;
    pose.toeDirections=[body.forward,unit(between(body.forward,direction,drive*(1-reset)))];
    return fitContacts(spec,pose);
  }

  function groundAttack(spec,s,t,pose){
    const {kind,start,end,hit}=s;
    const at=hit.detach, beat=attackBeat(t,start,at,end);
    const [shift,rise,pitch,turn]=sample(BODY_TRACKS[kind],beat);
    const [weight]=sample(CONTACT,beat);
    const stance=frame(spec,pose);
    const feet=pose.legs.slice();
    const originalArms=pose.arms;
    pose.x+=pose.face*shift*stance.size;
    pose.y+=rise*stance.size;
    const action=smooth(beat,0,.26)*(1-smooth(beat,.84,1));
    pose.pitch=mix(pose.pitch,pitch,action*(kind==='bite'?.73:1));
    pose.yaw=.42+turn;
    if(kind==='tail')return tailSwipe(spec,pose,s.contact,beat);
    if(kind==='kick')kick(spec,pose,feet,s.contact,beat);
    const step=smooth(beat,.38,.63)*(1-smooth(beat,.79,1));
    feet[1]=add(feet[1],[pose.face*23*step,-12*lift(step),0]);
    if(kind!=='kick')pose.legs=feet;
    if(kind==='stomp'){
      const contact=[s.contact[0]-stance.forward[0]*17*stance.size,s.contact[1]-6,23];
      const chamber=[contact[0]-pose.face*23,contact[1]-67,23];
      const lifted=between(feet[1],chamber,smooth(beat,.12,.47));
      const land=smooth(beat,.49,IMPACT);
      pose.legs[1]=between(between(lifted,contact,land),feet[1],smooth(beat,.75,1));
    }
    fitContacts(spec,pose);
    const body=frame(spec,pose);
    const rest=originalArms??armRig(spec,pose,body).rests;
    const [x,y,z]=sample(HAND_TRACKS[kind],beat);
    const motion=smooth(beat,0,.15)*(1-smooth(beat,.88,1));
    pose.arms=[between(rest[0],body.local(kind==='smash'?x-5:-x*.36,y+10,-z),motion),between(rest[1],body.local(x,y,z),motion)];
    if(kind==='bite'){
      const [jaw]=sample([[0,0],[.29,.48],[.53,1],[IMPACT,.05],[.79,.18],[1,0]],beat);
      pose.jaw=jaw;
      pose.bite=sideOffset(s.contact,17);
      pose.biteDrive=weight;
      pose.biteTilt=.89*weight;
      if(spec.locomotion.kind==='quadruped'){
        pose.arms=originalArms;
        fitContacts(spec,pose,[1,1]);
      }
    }else if(kind==='smash'||kind==='claw'||kind==='punch'){
      const direction=unit(add(body.forward,[0,kind==='smash'?1.6:kind==='punch'?.58:.45,0]));
      const reach=(kind==='punch'?11:spec.form==='drake'?18:15)*body.size;
      if(kind==='punch'){
        pose.fist=1;
        pose.knuckles=false;
      }
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
        const swing=method==='punch'?'punch':method==='claw'?'claw':'smash';
        const raise=smooth(beat,.12,.45)*(1-smooth(beat,.48,.71));
        const follow=smooth(beat,IMPACT,.75)*(1-smooth(beat,.78,1));
        const rest=add(base.arms[1],[-face*(34*raise-12*follow),-(swing==='smash'?46:15)*raise+23*follow,21*raise]);
        const direction=unit([face,swing==='smash'?.81:.22,0]);
        if(swing==='punch')pose.fist=1;
        pose.arms=[support,between(rest,sub(contact,mul(direction,(swing==='punch'?11:16)*spec.scale)),weight)];
        if(weight>.01){
          const {wrist,elbow}=armJoints(spec,pose,1);
          pose.handDirections=[null,unit(between(unit(sub(wrist,elbow)),direction,weight))];
        }
        pose.pitch-=.22*weight;
      }
      return fitContacts(spec,pose,[1,method==='bite'?1:weight]);
    }
    if(kind==='drop'){
      const startPose=rampage(e,route.finish,start,route);
      const z=walkPose(e.mid,to,to,end,start,end,face);
      const airborne={...z,y:mix(startPose.y,FLOOR,u*u),x:mix(startPose.x,to[0],ease(u)),pitch:.24*lift(u),arms:undefined,legs:undefined};
      if(u<.30)return blendPose(startPose,airborne,smooth(u,0,.30),spec);
      return airborne;
    }
    const pose=posture(spec,p[0],face,t);
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
    const m=posture(monster,mx,-1,t);
    const fall=e.down===null?0:smooth(t,e.down,e.down+320)*(1-smooth(t,e.rise,e.rise+480));
    const finish=smooth(t,e.counter+115,e.defeat);
    if(fall){
      h.y+=37*fall;
      h.pitch=.94*fall-.10;
      h.legs=[[hx-35,FLOOR-5,-12],[hx+25,FLOOR-5,22]];
    }
    if(finish){
      m.y+=46*finish;
      m.pitch=mix(m.pitch,1.56,finish);
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
      const technique=action.technique;
      const [shift,rise,pitch,turn]=sample(BODY_TRACKS[technique],beat);
      const hands=m.arms;
      const strikeDistance=technique==='tail'?154:technique==='kick'?89:107;
      const stride=mix(m.x,h.x+strikeDistance,impact*.92)-shift*.17-m.x;
      m.x+=stride;
      m.y+=rise*.28;
      m.pitch+=pitch*.42;
      m.yaw=.42+turn;
      m.legs=m.legs.map(foot=>add(foot,[stride,0,0]));
      if(hands)m.arms=hands.map(hand=>add(hand,[stride,0,0]));
      h.pitch+=recoil*(block?.16:.35);
      const hitHeight=technique==='kick'?65:technique==='tail'?46:block?107:100;
      const contact=[h.x+(block?32:15),FLOOR-hitHeight,22];
      if(technique==='tail'){
        tailSwipe(monster,m,contact,beat);
      }else if(technique==='kick'){
        const feet=m.legs.slice();
        m.knuckles=false;
        m.arms=undefined;
        kick(monster,m,feet,contact,beat);
      }else if(technique==='bite'){
        m.jaw=sample([[0,0],[.32,.56],[.56,1],[IMPACT,.05],[.76,.11],[1,0]],beat)[0];
        m.bite=contact;
        m.biteDrive=impact;
        m.biteTilt=.27*impact;
        if(hands)fitContacts(monster,m,[1,1]);
      }else{
        const [handX,handY,handZ]=sample(HAND_TRACKS.punch,beat);
        const body=frame(monster,m);
        const rest=armRig(monster,m,body).rests;
        const wind=smooth(beat,0,.24)*(1-smooth(beat,.81,1));
        const direction=unit(add(body.forward,[0,.03,0]));
        const wrist=sub(contact,mul(direction,11*body.size));
        const guard=between(m.arms?.[0]??rest[0],body.local(6,-107,-29),wind);
        const striking=between(m.arms?.[1]??rest[1],body.local(handX,handY,handZ),wind);
        m.arms=[guard,between(striking,wrist,impact)];
        m.fist=1;
        m.knuckles=false;
        fitContacts(monster,m,[0,impact]);
        const joints=armJoints(monster,m,1);
        m.handDirections=[null,unit(between(unit(sub(joints.wrist,joints.elbow)),direction,impact))];
      }
      h.weapon=weapon(h,hero,impact,block?contact:null);
      return {hero:h,monster:m,contact};
    }
    const melee=hero.counter==='hammer';
    const {chest}=armRig(monster,m);
    const contact=[chest[0]-13,chest[1]+10,24];
    if(melee){
      h.x=mix(h.x,contact[0]-93,impact*.89);
      h.pitch-=impact*.34;
    }
    h.weapon=weapon(h,hero,impact,melee?contact:null,beat);
    m.pitch-=recoil*(monster.locomotion.kind==='quadruped'?.13:.36);
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
