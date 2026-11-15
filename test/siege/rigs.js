'use strict';

const SiegeRigs = (() => {
  const add = (a,b) => a.map((v,i) => v+b[i]);
  const sub = (a,b) => a.map((v,i) => v-b[i]);
  const mul = (a,s) => a.map(v => v*s);
  const dot = (a,b) => a.reduce((sum,v,i) => sum+v*b[i],0);
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const len = a => Math.hypot(...a);
  const unit = a => mul(a,1/(len(a)||1));
  const between = (a,b,t) => add(a,mul(sub(b,a),t));
  const rgb = hex => hex.match(/.{2}/g).map(n => parseInt(n,16)/255);
  const palette = {
    ironback: ['Ironback','566359','a67855','443b37','b68952','ffb65a','ogre',1.16],
    'slag-orc': ['Slag Orc','54603d','877055','3b2426','884638','ffe183','orc',1.05],
    'gutter-troll': ['Gutter Troll','55725b','799169','392937','818774','f1d66f','troll',1.15],
    'marsh-stalker': ['Marsh Stalker','456a48','98a65c','333f32','577953','f1cb66','drake',1.02],
    'ember-raptor': ['Ember Raptor','403b42','9f5a4c','332733','a54937','ff905b','drake',.96],
    'frost-drake': ['Frost Drake','486879','779eae','303d55','7896aa','9af5ff','drake',1.12],
    warden: ['Elven Warden','815346','57546c','373147','8c879b','d5abff','hammer',1],
    ranger: ['Dwarven Ranger','a56c54','996344','473539','9a7149','ffdd8d','bolt',.82],
    mage: ['Battlemage','987465','79709a','352b51','a9a6bb','89e9ff','arcane',1.02]
  };
  const specs = Object.fromEntries(Object.entries(palette).map(([id,[name,skin,detail,cloth,metal,light,form,scale]]) => {
    const hero = ['hammer','bolt','arcane'].includes(form);
    return [id,{name,hero,skin:rgb(skin),detail:rgb(detail),cloth:rgb(cloth),metal:rgb(metal),light:rgb(light),
      color:'#'+light,counter:hero?form:null,form,scale,
      attacks:form==='drake'||id==='ironback'?['claw','smash','throw','bite']:['claw','smash','throw']}];
  }));
  const ivory = rgb('c7b59b');
  const leather = rgb('393039');
  const eyeWhite = rgb('16121d');

  function meshVertices(sides,rings,power) {
    const vertices=[];
    function vertex(j,i) {
      const a=Math.PI*j/rings, b=i*2*Math.PI/sides;
      const sphere=[Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b)];
      const points=sphere.map(x=>Math.sign(x)*Math.pow(Math.abs(x),power));
      const normals=sphere.map(x=>Math.sign(x)*Math.pow(Math.abs(x),2-power));
      return [...points,...normals];
    }
    for(let j=0;j<rings;j++){
      for(let i=0;i<sides;i++){
        const a=vertex(j,i), b=vertex(j+1,i), c=vertex(j+1,i+1), d=vertex(j,i+1);
        vertices.push(...a,...b,...c,...a,...c,...d);
      }
    }
    return new Float32Array(vertices);
  }

  function basis(axis,twist) {
    const y=unit(axis);
    const backup=Math.abs(y[0])>.9?[0,0,1]:[1,0,0];
    const x=unit(cross(y,Math.abs(dot(y,twist))>.97?backup:twist));
    return [x,y,unit(cross(x,y))];
  }

  function createSoftwareRenderer(width,height) {
    const scale=.63;
    const canvas=document.createElement('canvas');
    const w=canvas.width=Math.ceil(width*scale);
    const h=canvas.height=Math.ceil(height*scale);
    const ctx=canvas.getContext('2d');
    const image=ctx.createImageData(w,h);
    const pixels=new Uint32Array(image.data.buffer);
    const depth=new Float32Array(w*h);
    const meshes={skin:meshVertices(10,8,1),plate:meshVertices(10,6,.48),edge:meshVertices(6,4,.70)};
    const key=unit([-.48,-.8,.64]);
    const highlight=unit([key[0],key[1],key[2]+1]);
    const backlight=unit([.55,-.32,.1]);
    const component=(base,offset)=>Math.min(255,Math.max(0,(base+offset)*255))|0;
    const vertex=new Float32Array(9);
    function part(center,extent,color,{shape='skin',axis=[0,1,0],twist=[0,0,1],shine=0}={}) {
      const bases=basis(axis,twist);
      const mesh=meshes[shape];
      const [i,j,k]=bases;
      const [xx,xy,xz]=mul(i,extent[0]);
      const [yx,yy,yz]=mul(j,extent[1]);
      const [zx,zy,zz]=mul(k,extent[2]);
      for(let pos=0;pos<mesh.length;pos+=18){
        for(let corner=0;corner<3;corner++){
          const offset=pos+corner*6;
          const x=mesh[offset], y=mesh[offset+1], z=mesh[offset+2];
          vertex[corner*3]=(center[0]+xx*x+yx*y+zx*z)*scale;
          vertex[corner*3+1]=(center[1]+xy*x+yy*y+zy*z)*scale;
          vertex[corner*3+2]=center[2]+xz*x+yz*y+zz*z;
        }
        const ax=vertex[0],ay=vertex[1],az=vertex[2],bx=vertex[3],by=vertex[4],bz=vertex[5],cx=vertex[6],cy=vertex[7],cz=vertex[8];
        const abx=bx-ax, aby=by-ay, acx=cx-ax, acy=cy-ay;
        const determinant=abx*acy-aby*acx;
        if(determinant>-.03)continue;
        const left=Math.max(0,Math.floor(Math.min(ax,bx,cx)));
        const right=Math.min(w-1,Math.ceil(Math.max(ax,bx,cx)));
        const top=Math.max(0,Math.floor(Math.min(ay,by,cy)));
        const bottom=Math.min(h-1,Math.ceil(Math.max(ay,by,cy)));
        if(left>right||top>bottom)continue;
        const nx=(mesh[pos+3]+mesh[pos+9]+mesh[pos+15])/extent[0];
        const ny=(mesh[pos+4]+mesh[pos+10]+mesh[pos+16])/extent[1];
        const nz=(mesh[pos+5]+mesh[pos+11]+mesh[pos+17])/extent[2];
        const magnitude=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
        const sx=(i[0]*nx+j[0]*ny+k[0]*nz)/magnitude;
        const sy=(i[1]*nx+j[1]*ny+k[1]*nz)/magnitude;
        const sz=(i[2]*nx+j[2]*ny+k[2]*nz)/magnitude;
        const rim=(1-Math.abs(sz))**2*Math.max(0,sx*backlight[0]+sy*backlight[1]+sz*backlight[2]);
        const diffuse=.45+Math.max(0,sx*key[0]+sy*key[1]+sz*key[2])*.74;
        const specular=Math.max(0,sx*highlight[0]+sy*highlight[1]+sz*highlight[2])**16*(.1+shine*.24);
        const r=component(color[0]*diffuse,specular+rim*.16);
        const g=component(color[1]*diffuse,specular*.77+rim*.09);
        const b=component(color[2]*diffuse,specular*.63+rim*.21);
        const rgba=(255<<24)|(b<<16)|(g<<8)|r;
        const inv=1/determinant, db=bz-az, dc=cz-az;
        for(let py=top;py<=bottom;py++){
          const dy=py+.5-ay;
          for(let px=left;px<=right;px++){
            const dx=px+.5-ax;
            const v=(dx*acy-dy*acx)*inv;
            const q=(abx*dy-aby*dx)*inv;
            if(v<0||q<0||v+q>1)continue;
            const z=az+v*db+q*dc;
            const index=py*w+px;
            if(z<depth[index])continue;
            depth[index]=z;
            pixels[index]=rgba;
          }
        }
      }
    }
    return {
      part,
      clear(){pixels.fill(0);depth.fill(-Infinity);},
      get canvas(){ctx.putImageData(image,0,0);return canvas;}
    };
  }

  // Each reusable mesh is transformed by a bone. The shader lights real surface normals in scene space.
  function createRenderer(width,height) {
    const canvas = document.createElement('canvas');
    canvas.width=width; canvas.height=height;
    const gl = canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,depth:true});
    if(!gl)return createSoftwareRenderer(width,height);
    const compile = (type,source) => {
      const shader=gl.createShader(type);
      gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const program=gl.createProgram();
    gl.attachShader(program,compile(gl.VERTEX_SHADER,`
      attribute vec3 position, normal;
      uniform vec3 center, axisX, axisY, axisZ, extent;
      uniform vec2 viewport;
      varying mediump vec3 n, surface;
      void main(){
        vec3 p=center+axisX*position.x*extent.x+axisY*position.y*extent.y+axisZ*position.z*extent.z;
        n=axisX*normal.x/extent.x+axisY*normal.y/extent.y+axisZ*normal.z/extent.z;
        surface=position;
        gl_Position=vec4(p.x*2./viewport.x-1.,1.-p.y*2./viewport.y,-p.z/900.,1.);
      }`));
    gl.attachShader(program,compile(gl.FRAGMENT_SHADER,`
      precision mediump float;
      uniform vec3 color;
      uniform float finish;
      varying mediump vec3 n, surface;
      void main(){
        vec3 norm=normalize(n);
        vec3 key=normalize(vec3(-.48,-.8,.64));
        float light=max(0.,dot(norm,key));
        float spec=pow(max(0.,dot(norm,normalize(key+vec3(0.,0.,1.)))),18.);
        float rim=pow(1.-abs(norm.z),2.)*max(0.,dot(norm,normalize(vec3(.55,-.32,.1))));
        float grain=fract(sin(dot(floor(surface*155.),vec3(12.9898,38.233,73.861)))*4375.85);
        float seams=.5+.5*sin(surface.y*38.+surface.x*3.);
        float grainDark=pow(grain,4.)*.28;
        vec3 lit=color*(.39+light*.77+grain*.13-grainDark-(1.-finish)*.07*seams);
        lit+=vec3(.30,.23,.19)*spec*(.22+finish*.78);
        lit+=vec3(.32,.18,.43)*rim*(.30+finish*.38);
        gl_FragColor=vec4(lit,1.);
      }`));
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    gl.viewport(0,0,width,height);
    const position=gl.getAttribLocation(program,'position'), normal=gl.getAttribLocation(program,'normal');
    const uniforms=Object.fromEntries(['center','axisX','axisY','axisZ','extent','viewport','color','finish'].map(name=>[name,gl.getUniformLocation(program,name)]));
    gl.uniform2f(uniforms.viewport,width,height);
    gl.enableVertexAttribArray(position);gl.enableVertexAttribArray(normal);
    const buffers = {};
    function mesh(name,sides,rings,power) {
      const vertices=meshVertices(sides,rings,power);
      const buffer=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
      buffers[name]={buffer,count:vertices.length/6};
    }
    mesh('skin',18,12,1);
    mesh('plate',14,8,.48);
    mesh('edge',8,4,.70);
    let bound;
    function part(center,extent,color,{shape='skin',axis=[0,1,0],twist=[0,0,1],shine=0}={}) {
      const [x,y,z]=basis(axis,twist);
      const data=buffers[shape];
      if(bound!==data){
        bound=data;
        gl.bindBuffer(gl.ARRAY_BUFFER,data.buffer);
        gl.vertexAttribPointer(position,3,gl.FLOAT,false,24,0);
        gl.vertexAttribPointer(normal,3,gl.FLOAT,false,24,12);
      }
      gl.uniform3fv(uniforms.center,center);
      gl.uniform3fv(uniforms.extent,extent);
      gl.uniform3fv(uniforms.axisX,x);
      gl.uniform3fv(uniforms.axisY,y);
      gl.uniform3fv(uniforms.axisZ,z);
      gl.uniform3fv(uniforms.color,color);
      gl.uniform1f(uniforms.finish,shine);
      gl.drawArrays(gl.TRIANGLES,0,data.count);
    }
    return {canvas,part,clear(){gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);}};
  }

  // Solve both bones within their physical reach. The returned end is what the mesh draws.
  function joint(root,end,upper,lower,pole) {
    const delta=sub(end,root);
    const distance=len(delta);
    const forward=distance>1e-6?mul(delta,1/distance):[0,1,0];
    const reach=Math.max(Math.abs(upper-lower)+.01,Math.min(upper+lower-.01,distance));
    const projected=sub(pole,mul(forward,dot(pole,forward)));
    const bend=len(projected)>1e-6?unit(projected):basis(forward,[0,0,1])[0];
    const along=(upper*upper+reach*reach-lower*lower)/(2*reach);
    return {
      bend:add(add(root,mul(forward,along)),mul(bend,Math.sqrt(Math.max(0,upper*upper-along*along)))),
      end:add(root,mul(forward,reach))
    };
  }
  function frame(spec,pose) {
    const {x,y,face}=pose;
    const size=spec.scale*(spec.hero?1:1.08);
    const pitch=pose.pitch||0;
    const yaw=pose.yaw??.42;
    const forward=[face*Math.cos(yaw),0,Math.sin(yaw)];
    const lateral=[-face*Math.sin(yaw),0,Math.cos(yaw)];
    const local=(f,h,d=0) => add([x,y,pose.depth||0],mul(add(add(mul(forward,f*Math.cos(pitch)+h*Math.sin(pitch)),
      [0,h*Math.cos(pitch)-f*Math.sin(pitch),0]),mul(lateral,d)),size));
    return {size,forward,lateral,local};
  }
  function legRig(spec,pose,body=frame(spec,pose)) {
    const {local,size,lateral}=body;
    const pelvis=local(spec.form==='drake'?-26:0,spec.hero?-83:-72);
    const hips=[-1,1].map(side=>add(pelvis,mul(lateral,side*(spec.hero?12:19)*size)));
    return {pelvis,hips,upper:(spec.hero?45:47)*size,lower:43*size};
  }

  function draw(renderer,id,pose) {
    const spec=specs[id], {hero,form,skin,detail,cloth,metal,light}=spec;
    const drake=form==='drake', mage=form==='arcane';
    const frost=id==='frost-drake', marsh=id==='marsh-stalker', ember=id==='ember-raptor';
    const lizardSize=frost?1.13:ember?.81:1;
    const snoutLength=marsh?34:ember?19:22;
    const accent=rgb(frost?'476074':ember?'5b3431':marsh?'5d713b':'59454a');
    const {size,forward,lateral,local}=frame(spec,pose);
    const wide=hero?17:drake?23*lizardSize:31;
    const h=hero?159:drake?147:162;
    const neck=local(drake?33:8,-h+20);
    let head=local(drake?55:9,-h-3);
    const biteAxis=unit(add(forward,[0,pose.biteTilt||0,0]));
    if(pose.bite){
      const mouthReach=(drake?snoutLength*1.70:22)*size;
      head=between(head,sub(sub(pose.bite,mul(biteAxis,mouthReach)),[0,9*size,0]),pose.biteDrive??1);
    }
    const chest=local(drake?15:0,-h+42);
    const {pelvis,hips,upper,lower}=legRig(spec,pose,{local,size,lateral});
    const point=(center,ext,color,options={})=>renderer.part(center,mul(ext,size),color,{twist:lateral,...options});
    const sphere=(f,y,d,ext,color,options)=>point(local(f,y,d),ext,color,options);
    function bone(a,b,width,depth,color,shape='skin',shine=0) {
      const axis=sub(b,a);
      renderer.part(between(a,b,.5),[width*size,len(axis)*.61+1,depth*size],color,{axis,twist:lateral,shape,shine});
    }
    function spike(a,b,width,color) {
      const tip=between(a,b,.73);
      bone(a,tip,width,width*.83,color,'edge',.47);
      bone(tip,b,width*.41,width*.41,color,'edge',.53);
    }
    const plate={shape:'plate',shine:.66};
    const movement=pose.breathe||0;
    bone(pelvis,chest,hero?21:drake?31:37,wide,hero?cloth:skin);
    point(chest,[hero?18:drake?29:30,hero?34:37,wide+5],hero?metal:skin,hero?plate:{});
    for(const side of [-1,1]){
      for(let row=0;row<3;row++){
        const rib=local((drake?37:hero?15:26)-row*2,-h+42+row*11,side*(hero?11:17));
        point(rib,[5,5.5,hero?9:14],hero?metal:detail,{shape:'edge',shine:hero?.8:.16});
      }
    }
    for(let side of [-1,1]){
      const arm=pose.arms?.[side===1?1:0];
      const leg=pose.legs?.[side===1?1:0];
      const hip=hips[side===1?1:0];
      const shoulder=add(chest,mul(lateral,side*wide*size));
      const hand=arm||local(19,-h+88,side*(wide+10));
      const desiredFoot=leg||local(side*16,-5,side*(hero?16:23));
      const kneePole=pose.climbing?add(mul(forward,-1),[0,-.38,side*.32]):add(forward,[0,0,side*.12]);
      const {bend:knee,end:foot}=joint(hip,desiredFoot,upper,lower,kneePole);
      const elbow=joint(shoulder,hand,(hero?38:47)*size,(hero?39:47)*size,add(mul(forward,-.8),[0,.39,side*.45])).bend;
      bone(hip,knee,hero?11:19,hero?10:16,hero?cloth:skin);
      bone(knee,foot,hero?8:12,hero?8:10,hero?leather:detail,hero?'plate':'skin',hero?.52:0);
      point(knee,[hero?10:13,hero?11:14,hero?9:13],hero?metal:skin,plate);
      const toe=add(foot,mul(forward,8*size));
      point(toe,[hero?13:17,6,hero?8:10],hero?leather:skin,{axis:forward,shape:'plate',shine:.36});
      if(!hero){
        for(let n=-1;n<=1;n++){
          const a=add(toe,mul(lateral,n*6*size));
          spike(a,add(a,mul(forward,(drake?16:11)*size)),3.6,ivory);
        }
      }
      bone(shoulder,elbow,hero?10:17,hero?10:15,hero?cloth:skin);
      bone(elbow,hand,hero?8:13,hero?8:11,hero?metal:detail,hero?'plate':'skin',hero?.55:.13);
      point(shoulder,[hero?14:19,hero?15:20,hero?13:18],hero?metal:skin,hero?plate:{});
      point(hand,[hero?7:11,hero?9:13,hero?7:10],hero?leather:skin,{axis:sub(hand,elbow),shape:'plate'});
      if(!hero){
        const fingers=unit(sub(hand,elbow));
        for(let n=-1;n<=1;n++){
          const a=add(hand,mul(lateral,n*5*size));
          spike(add(a,mul(fingers,6*size)),add(a,mul(fingers,(drake?18:15)*size)),3,ivory);
        }
      }
    }
    bone(chest,neck,hero?10:drake?18:23,hero?10:18,skin);
    bone(neck,head,hero?12:17,hero?11:18,skin);
    point(head,[hero?13:drake?19:24,hero?17:drake?21:24,hero?13:drake?18:22],skin,drake?{axis:forward}:{});
    const snout=add(head,mul(biteAxis,(drake?snoutLength:hero?10:13)*size));
    const jawGap=pose.jaw??(pose.bite?1:0);
    if(drake){
      point(snout,[10*lizardSize,snoutLength*.91,13*lizardSize],detail,{axis:biteAxis,shape:'plate',shine:.19});
      const nostril=add(snout,add(mul(forward,12*size),add([0,-6*size,0],mul(lateral,8*size))));
      point(nostril,[3,3.5,2.5],eyeWhite,{axis:forward});
      for(let row=0;row<4;row++){
        for(let column=0;column<4;column++){
          const tile=local(15-row*10,-h+20+row*8,9+column*6+(row%2)*2);
          point(tile,[5.6,5.1,4],(row+column)%3===0?accent:skin,{shape:'edge',shine:.30});
        }
      }
      point(add(snout,[0,(11+jawGap*10)*size,0]),[7,21,13],skin,{axis:add(biteAxis,[0,jawGap*.46,0]),shape:'plate'});
      for(let i=0;i<4;i++){
        const fang=add(snout,add(mul(forward,(i*7-9)*size),add([0,6*size,0],mul(lateral,12*size))));
        spike(fang,add(fang,[0,(i===2?11:8)*size,0]),2.6,ivory);
      }
      let tail=pelvis;
      for(let i=1;i<=8;i++){
        const next=local(-28-i*15,-71+i*3+Math.sin(movement+i*.53)*i,i*2.3);
        const radius=16-i*1.55;
        bone(tail,next,radius,radius*.87,i%2?skin:detail);
        if(i<(frost?6:marsh?4:3))spike(add(tail,[0,-radius*size,0]),add(tail,mul(add(mul(forward,-6),[0,-(frost?37:23)+i*2,0]),size)),6,metal);
        tail=next;
      }
    }else{
      point(add(snout,[0,5*size,0]),[hero?5:12,hero?5:9,hero?5:13],detail);
      if(!hero){
        const mouth=add(snout,[0,(10+jawGap*5)*size,0]);
        point(mouth,[10,12,13],eyeWhite,{axis:biteAxis,shape:'plate'});
        const jaw=add(snout,[0,(16+jawGap*17)*size,0]);
        point(jaw,[11,14,15],skin,{axis:add(biteAxis,[0,jawGap*.5,0]),shape:'plate'});
        for(const side of [-1,1]){
          const tusk=add(jaw,mul(lateral,side*12*size));
          spike(tusk,add(tusk,mul(add(biteAxis,[0,-1.3,0]),12*size)),5,ivory);
        }
      }
    }
    for(const side of [-1,1]){
      const eye=add(head,add(mul(forward,(drake?8:9)*size),add([0,-3*size,0],mul(lateral,side*(hero?9:drake?15:17)*size))));
      point(eye,[hero?4:8,hero?3.1:5,hero?3:5],eyeWhite,{axis:forward});
      point(add(eye,mul(lateral,side*3*size)),[hero?1.8:2.9,hero?2:3,2.4],light,{shine:1});
      if(drake||form==='ogre'||form==='troll'){
        const base=add(head,add(mul(forward,-9*size),add([0,-12*size,0],mul(lateral,side*13*size))));
        spike(base,add(base,mul(add(mul(forward,-(ember?28:17)),[0,-(frost?33:form==='ogre'?28:marsh?11:17),side*7]),size)),8,metal);
        const brow=add(eye,[0,-5*size,0]);
        point(brow,[6,12,6],detail,{axis:forward,shape:'edge'});
      }
    }
    if(hero){
      const hair=form==='hammer'?rgb('2b2234'):form==='bolt'?rgb('8a4932'):rgb('beb4c4');
      point(add(head,add(mul(forward,-4*size),[0,-9*size,0])),[13,11,14],hair);
      if(form==='bolt')point(add(snout,[0,16*size,0]),[12,16,12],hair,{shape:'edge'});
      else for(const side of [-1,1]){
        const a=add(head,add(mul(forward,-8*size),mul(lateral,side*11*size)));
        const b=add(a,add(mul(forward,-10*size),[0,(mage?25:38)*size,0]));
        bone(a,b,mage?7:4,mage?6:4,hair,'edge');
      }
      sphere(3,-88,0,[22,6,18],leather,plate);
      sphere(23,-88,7,[4,6,7],metal,plate);
      if(mage){
        const clothEnd=local(-26+Math.sin(movement)*6,-22);
        point(between(pelvis,clothEnd,.51),[15,35,23],cloth,{axis:sub(clothEnd,pelvis),shape:'edge'});
      }
    }else{
      sphere(drake?-27:-5,drake?-69:-76,0,[drake?24:36,8,wide+2],cloth,plate);
      for(let i=0;i<5;i++){
        const a=local(-20-i*(drake?5:1),-h+12+i*12);
        const b=add(a,mul(add(mul(forward,-1),[0,-.65,0]),(drake?32:22)*size));
        spike(a,b,drake?8:7,metal);
      }
      for(const side of [-1,1]) for(let i=0;i<3;i++){
        const a=local((drake?10:23)-i*5,-h+35+i*15,side*(wide-2));
        point(a,[6,10,11],detail,{shape:'edge',shine:.26});
      }
    }
    if(hero&&pose.weapon) drawWeapon(pose.weapon);
    function drawWeapon({grip,tip}) {
      const axis=unit(sub(tip,grip));
      const back=add(grip,mul(axis,(mage?-66:-27)*size));
      bone(back,tip,mage?3:4,mage?3:4,leather,'plate',.28);
      if(form==='hammer'){
        point(sub(tip,mul(axis,4*size)),[18,11,13],metal,{axis,shape:'plate',shine:.95});
        point(tip,[11,5,9],light,{axis,shape:'edge',shine:.89});
      }else if(form==='bolt'){
        const center=between(grip,tip,.73);
        const span=unit(cross(axis,[0,1,0]));
        for(const side of [-1,1]){
          const nock=add(center,mul(span,side*29*size));
          bone(center,nock,3,4,metal,'edge',.65);
          bone(nock,back,.75,.75,ivory);
        }
      }else{
        point(tip,[9,17,8],light,{axis,shape:'edge',shine:1});
        point(sub(tip,mul(axis,15*size)),[9,6,9],metal,plate);
      }
    }
  }
  return {specs,createRenderer,draw,frame,legRig,joint,add,sub,mul,len,unit,between};
})();
