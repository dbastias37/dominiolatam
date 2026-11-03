import {smokePuff} from './particles.js';
import {levelFlight,returnFlight} from './flights.js';
import * as THREE from './vendor/three.module.js';
import {BY_ID,neighbors,SEA_EDGES} from './data.js';
import {faceForward,groundVehicle} from './vehicles.js';
import {activeIncidents,movementBlock} from './events.js';
import {industryDamage} from './operations.js';

const ease=x=>{x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
const isSea=(a,b)=>SEA_EDGES.some(k=>k.split('-').includes(a)&&k.split('-').includes(b));
export class CampaignDirector{
 constructor(map,surface,dome){
  this.map=map;this.surface=surface;this.dome=dome;this.active=null;
  this.routeUnits=[];this.routeGroup=new THREE.Group();map.scene.add(this.routeGroup);
  this.weatherGroup=new THREE.Group();map.scene.add(this.weatherGroup);this.weatherKey='';
 }
 position(id,h=.815){const c=BY_ID[id];return this.surface(c.lon,c.lat,h);}
 ground(a,b,t,height=.815){const p=a.clone().lerp(b,t);p.y=this.dome(p.x,p.z)+height;return p;}
 mesh(geometry,color,opacity=1){const m=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:opacity===1}));m.userData.effectResource=true;return m;}
 clearGroup(group){const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.userData.effectResource){if(o.geometry&&!o.userData.preserveGeometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();group.clear();}
 vehicle(kind,id,level,owner,scale=1.5){const v=this.map.vehicles.create(kind,id,level,owner);v.scale.setScalar(scale);return v;}
 start(options){
  this.skip();this.map.navigation?.cancel();const m=this.map,root=new THREE.Group();m.scene.add(root);
  this.active={...options,t:0,root,units:[],shots:[],blasts:[],fired:new Set(),camera:m.camera.position.clone(),view:m.camera.view?{...m.camera.view}:null,target:m.controls.target.clone(),minDistance:m.controls.minDistance,resolve:null};
  m.camera.clearViewOffset();m.controls.enabled=false;m.controls.minDistance=12;
  return new Promise(resolve=>{this.active.resolve=resolve;});
 }
 battle(b,onStage=()=>{}){
  const promise=this.start({type:'battle',data:b,duration:this.map.reducedMotion?.6:9.4,onStage}),a=this.active;
  const start=this.position(b.source),end=this.position(b.target),dir=end.clone().sub(start);dir.y=0;dir.normalize();
  const side=new THREE.Vector3(-dir.z,0,dir.x),carried=isSea(b.source,b.target)||!neighbors(b.source).includes(b.target),center=start.clone().lerp(end,carried?.88:.56);
  a.hiddenUnits=[b.source,b.target].flatMap(id=>[this.map.countryGroups?.[id]?.unit,this.map.countryGroups?.[id]?.jet]).filter(Boolean);for(const v of a.hiddenUnits)v.visible=false;
  center.y=this.dome(center.x,center.z)+.815;Object.assign(a,{start,end,dir,side,carried,center});
  a.left=center.clone().addScaledVector(dir,-2.4);a.right=center.clone().addScaledVector(dir,2.4);
  for(let i=0;i<4;i++){
   const attack=i<2,c=attack?b.attacking:b.defending,id=attack?b.source:b.target,v=this.vehicle('tank',id,c.armor,c.owner,1.45);a.root.add(v);a.units.push(v);
   const lane=(i%2===0?-1:1)*1.05,home=(attack?start:end).clone().addScaledVector(side,lane);
   const from=(attack?(carried?a.left.clone().addScaledVector(dir,-4):start):end).clone().addScaledVector(side,lane),to=(attack?a.left:a.right).clone().addScaledVector(side,lane);
   v.userData.battle={attack,lane,home,from,to,heading:dir.clone().multiplyScalar(attack?1:-1)};
   groundVehicle(v,from,v.userData.battle.heading,this.dome);
  }
  a.jets=[];for(const attack of [true,false]){
   const c=attack?b.attacking:b.defending;if((attack?b.attackingAir:b.defendingAir)===false||(c.air<1&&!(carried&&attack)))continue;
   const id=attack?b.source:b.target,v=this.vehicle('jet',id,c.air,c.owner,2.1),from=attack?start:end,to=attack?end:start,mid=from.clone().lerp(to,.5);mid.y=Math.max(from.y,to.y)+8;
   const curve=levelFlight([from,to],{returnHome:true,altitude:7});a.root.add(v);a.units.push(v);a.jets.push({v,curve,attack});
  }
  a.onStage(carried?'Despliegue de unidades':'Avanzando al frente');return promise;
 }
 bombardment(b,onStage=()=>{}){
  const promise=this.start({type:'bombard',data:b,duration:this.map.reducedMotion?.6:8.8,onStage}),a=this.active;
  const source=this.position(b.source,7),c=BY_ID[b.target],factory=this.surface(c.lon+.8,c.lat+.65,1.1),target=factory.clone();source.y=target.y=7;
  a.center=this.position(b.target);a.factory=factory;a.bombTarget=target;
  const nodes=(b.route||[b.source,b.target]).map(id=>this.position(id));nodes[0]=source;nodes[nodes.length-1]=target;a.flight=levelFlight(nodes);a.returnFlight=returnFlight(target,source,a.flight.getTangent(1));
  a.jet=this.vehicle('jet',b.source,4,b.attacker,2.5);a.root.add(a.jet);a.units.push(a.jet);
  a.bomb=this.mesh(new THREE.SphereGeometry(.12,8,6),'#54505a');a.bomb.visible=false;a.root.add(a.bomb);
  a.marker=this.mesh(new THREE.RingGeometry(.8,.88,40),'#f4bd65',.8);a.marker.rotation.x=-Math.PI/2;a.marker.position.copy(factory);a.root.add(a.marker);
  a.onStage('Los bombarderos vuelan hacia la industria');return promise;
 }
 occupation(o,onStage=()=>{}){
  const promise=this.start({type:'occupation',data:o,duration:this.map.reducedMotion?.6:6.7,onStage}),a=this.active;
  a.end=this.position(o.target);a.end.z+=.85;const origin=this.position(o.source),direction=a.end.clone().sub(origin);direction.y=0;direction.normalize();
  a.start=a.end.clone().addScaledVector(direction,-Math.min(7,origin.distanceTo(a.end)*.45));a.start.y=this.dome(a.start.x,a.start.z)+.815;a.center=a.start.clone().lerp(a.end,.6);a.direction=direction;
  a.hiddenUnits=[this.map.countryGroups[o.target]?.unit,this.map.countryGroups[o.target]?.jet].filter(Boolean);for(const v of a.hiddenUnits)v.visible=false;
  a.tank=this.vehicle('tank',o.target,o.armor,o.owner,1.5);a.root.add(a.tank);a.units.push(a.tank);groundVehicle(a.tank,a.start,direction,this.dome);
  a.onStage(`Las tropas entran en ${BY_ID[o.target].name}`);this.map.revealOccupation(o,0);return promise;
 }
 movements(moves,onStage=()=>{}){
  const promise=this.start({type:'movement',duration:this.map.reducedMotion?.5:4.4*moves.length,onStage}),a=this.active;a.convoys=[];a.center=this.position(moves[0].source);
  a.hiddenUnits=this.routeUnits.filter(v=>moves.some(m=>m.transferId===v.userData.transferId));for(const v of a.hiddenUnits)v.visible=false;
  for(const m of moves){const start=this.position(m.source),end=this.position(m.target);start.z-=1.3;end.z-=1.3;const v=this.vehicle(m.sea?'jet':'tank',m.source,m.sea?m.air:m.armor,m.owner,m.sea?2:1.7);a.root.add(v);a.units.push(v);const curve=m.sea?levelFlight([start,end],{altitude:5}):null;a.convoys.push({v,start,end,curve,data:m});v.visible=false;}
  a.onStage('Los refuerzos avanzan un país');return promise;
 }
 fire(shooter,target){
  const a=this.active;shooter.updateWorldMatrix(true,true);const muzzle=shooter.getObjectByName('muzzle');if(!muzzle)return;
  const from=muzzle.getWorldPosition(new THREE.Vector3()),to=target.position.clone().add(new THREE.Vector3(0,.25,0)),bolt=this.mesh(new THREE.SphereGeometry(.075,6,4),'#ffe5a2'),flash=this.mesh(new THREE.SphereGeometry(.2,8,5),'#ffbe4d',.95),impact=this.mesh(new THREE.SphereGeometry(.2,8,5),'#e8b873',.75);
  const barrelDirection=new THREE.Vector3(0,0,-1).applyQuaternion(muzzle.getWorldQuaternion(new THREE.Quaternion()));
  const curve=new THREE.CubicBezierCurve3(from,from.clone().addScaledVector(barrelDirection,1.2),to.clone().add(new THREE.Vector3(0,.4,0)),to);
  bolt.position.copy(from);flash.position.copy(from);impact.position.copy(to);impact.visible=false;a.root.add(bolt,flash,impact);a.shots.push({from,to,curve,bolt,flash,impact,t:0});this.map.onFire?.();
 }
 explode(position,{wreck=false}={}){
  const a=this.active,root=new THREE.Group();root.position.copy(position);a.root.add(root);const pieces=[];
  for(let i=0;i<8;i++){
   const fire=smokePuff(i%2?'#ffb83d':'#e55c23',.95,.8);root.add(fire);
   pieces.push({mesh:fire,velocity:new THREE.Vector3(Math.sin(i*2.4)*1.1,.4+i%3*.5,Math.cos(i*2.4)*1.1),smoke:false});
  }
  for(let i=0;i<5;i++){
   const smoke=smokePuff('#3d4147',.72,1.2);root.add(smoke);
   pieces.push({mesh:smoke,velocity:new THREE.Vector3(Math.sin(i)*.4,1+i*.12,Math.cos(i)*.4),smoke:true});
  }
  if(wreck){const hull=this.mesh(new THREE.BoxGeometry(.62,.15,.95),'#3b4143');hull.position.y=.09;hull.rotation.y=.4;root.add(hull);const turret=this.mesh(new THREE.BoxGeometry(.36,.18,.38),'#4a4140');turret.position.set(.18,.23,.1);turret.rotation.z=.5;root.add(turret);}
  a.blasts.push({root,pieces,t:0});this.map.onFire?.();
 }
 updateWeather(dt,time){
  for(const o of this.weatherGroup.children){
   if(o.userData.cloud){o.position.x=o.userData.baseX+Math.sin(time*.16+o.id)*.2;for(let i=0;i<o.children.length;i++){const p=o.children[i];p.position.y=Math.sin(time*.3+i)*.17;p.material.rotation=Math.sin(time*.1+i)*.2;}}
   if(o.userData.rain){const {drops}=o.userData,positions=o.geometry.attributes.position;
    for(let i=0;i<drops.length;i++){const d=drops[i];d.y-=dt*d.speed;if(d.y<d.floor)d.y=d.top;const x=d.x+(d.top-d.y)*.12;positions.setXYZ(i*2,x,d.y,d.z);positions.setXYZ(i*2+1,x-.055,d.y+.38,d.z);}
    positions.needsUpdate=true;
   }
   if(o.userData.repairSmoke){const p=o.userData;for(let i=0;i<o.children.length;i++){const puff=o.children[i],u=(time*.2+i*.24)%1;puff.position.set(Math.sin(i+time*.35)*.25,u*1.8,Math.cos(i)*.25);puff.scale.setScalar(.6+u);puff.material.opacity=.5*(1-u);}}
  }
 }
 update(dt,time){
  this.updateWeather(dt,time);const a=this.active;if(!a)return;a.t+=dt;
  const normalized=a.t/a.duration,clock=this.map.reducedMotion?normalized*(a.type==='battle'?9.4:8.8):a.t,m=this.map;
  if(a.type==='movement'){const k=Math.min(a.convoys.length-1,Math.floor(normalized*a.convoys.length)),c=a.convoys[k],u=ease(normalized*a.convoys.length-k);a.center.copy(c.curve?c.curve.getPoint(u):this.ground(c.start,c.end,u));}
  const desired=a.center.clone().add(new THREE.Vector3(3,21,18));m.controls.target.lerp(a.center,Math.min(1,dt*3));m.camera.position.lerp(desired,Math.min(1,dt*2));m.camera.lookAt(m.controls.target);
  if(a.type==='battle')this.updateBattle(a,clock);
  else if(a.type==='bombard')this.updateBombardment(a,clock);
  else if(a.type==='occupation'){const p=this.map.reducedMotion?normalized*6.7:clock;groundVehicle(a.tank,this.ground(a.start,a.end,ease(p/3)),a.direction,this.dome);this.map.revealOccupation(a.data,ease((p-3.1)/2.9));const stage=p<3?'Las tropas entran y toman posición':p<3.2?'Tanque desplegado':'Tu bandera se extiende desde el centro del país';if(stage!==a.stage){a.stage=stage;a.onStage(stage);}}
  else for(const [i,c] of a.convoys.entries()){const phase=normalized*a.convoys.length-i;c.v.visible=phase>=0&&phase<=1;if(!c.v.visible)continue;const u=ease(phase);if(a.stage!==i){a.stage=i;a.onStage(`${c.data.troops} unidades: ${BY_ID[c.data.source].name} → ${BY_ID[c.data.target].name}`);}if(c.curve){c.v.position.copy(c.curve.getPoint(u));faceForward(c.v,c.curve.getTangent(u));}else groundVehicle(c.v,this.ground(c.start,c.end,u),c.end.clone().sub(c.start),this.dome);}
  for(const shot of a.shots){shot.t+=dt;shot.bolt.position.copy(shot.curve.getPoint(Math.min(1,shot.t/.34)));shot.bolt.visible=shot.t<.34;shot.flash.visible=shot.t<.13;shot.impact.visible=shot.t>=.34&&shot.t<.9;shot.impact.scale.setScalar(1+Math.max(0,shot.t-.34)*3);shot.impact.material.opacity=Math.max(0,.75-(shot.t-.34)*1.4);}
  for(const blast of a.blasts){blast.t+=dt;for(const p of blast.pieces){p.mesh.position.copy(p.velocity).multiplyScalar(blast.t);p.mesh.scale.setScalar(p.smoke?.6+blast.t*.65:1+blast.t*1.8);p.mesh.material.opacity=Math.max(0,(p.smoke?.82:.95)-blast.t*(p.smoke?.21:1.8));}}
  if(normalized>=1)this.skip();
 }
 updateBattle(a,clock){
  const progress=ease(clock/2.45);
  for(const v of a.units.filter(v=>v.userData.battle)){
   const b=v.userData.battle,p=a.carried&&b.attack?ease((clock-1.9)/.8):progress;let pos=this.ground(b.from,b.to,p),heading=b.heading;
   if(clock>6.5&&b.attack&&!a.data.won){const u=ease((clock-6.5)/2.5);pos=this.ground(b.to,a.data.won?a.end.clone().addScaledVector(a.side,b.lane):b.home,u);if(!a.data.won&&u>.2)heading=b.heading.clone().multiplyScalar(-1);}
   groundVehicle(v,pos,heading,this.dome);v.visible=!(a.carried&&b.attack&&clock<1.9)&&!b.destroyed;
   if(a.data.won&&!b.attack&&clock>=5.95+(b.lane>0?.4:0)&&!b.destroyed){b.destroyed=true;this.explode(v.position.clone(),{wreck:true});v.visible=false;}
  }
  for(const {v,curve,attack} of a.jets){const u=THREE.MathUtils.clamp((clock-(attack?0:.65))/7.8,0,1);v.position.copy(curve.getPoint(u));faceForward(v,curve.getTangent(u));v.visible=u<.99;}
  const stage=clock<2.45?'Unidades en movimiento':clock<5.95?'¡Enfrentamiento!':a.data.won?(clock<6.6?'Los tanques defensores fueron vencidos':'Frente asegurado · preparando el resultado'):'Ataque repelido: los supervivientes vuelven a su base';
  if(stage!==a.stage){a.stage=stage;a.onStage(stage);}
  if(!this.map.reducedMotion)for(let i=0;i<6;i++){const when=2.7+i*.52;if(clock>=when&&!a.fired.has(i)){a.fired.add(i);const shooting=i%2===0?i%4:2+i%2,receiving=shooting<2?2+(i%2):i%2;this.fire(a.units[shooting],a.units[receiving]);}}
 }
 updateBombardment(a,clock){
  const outgoing=clock<4,curve=outgoing?a.flight:a.returnFlight,u=ease(outgoing?clock/4:(clock-4)/3.5);a.jet.position.copy(curve.getPoint(u));faceForward(a.jet,curve.getTangent(u));a.jet.visible=clock<7.5;
  if(clock>=4&&!a.dropFrom)a.dropFrom=a.bombTarget.clone();
  if(a.dropFrom){const u=ease((clock-4)/.7);a.bomb.position.copy(a.dropFrom.clone().lerp(a.factory,u));a.bomb.visible=clock<4.7;}
  if(clock>=4.7&&!a.struck){a.struck=true;this.explode(a.factory.clone());}
  const stage=clock<4?'Vuelo hacia la industria':clock<4.7?'Objetivo: las fábricas':clock<7.5?'Impacto industrial · los aviones regresan':'Operación terminada · preparando informe';
  if(stage!==a.stage){a.stage=stage;a.onStage(stage);}
 }
 skip(){const a=this.active;if(!a)return;if(a.type==='occupation')this.map.revealOccupation(a.data,1);this.active=null;for(const v of a.hiddenUnits||[])v.visible=true;for(const v of a.units)this.map.vehicles.dispose(v);this.clearGroup(a.root);a.root.removeFromParent();this.map.camera.position.copy(a.camera);if(a.view?.enabled)this.map.camera.setViewOffset(a.view.fullWidth,a.view.fullHeight,a.view.offsetX,a.view.offsetY,a.view.width,a.view.height);this.map.controls.target.copy(a.target);this.map.controls.minDistance=a.minDistance;this.map.controls.enabled=true;this.map.controls.update();a.resolve?.();}
 sync(state){
  for(const unit of this.routeUnits)this.map.vehicles.dispose(unit);this.routeUnits=[];this.clearGroup(this.routeGroup);
  if(state)for(const t of state.transfers){const here=t.route[t.step],v=this.vehicle('tank',here,t.armor,t.owner,1.65),p=this.position(here);p.z-=1.3;groundVehicle(v,p,null,this.dome);v.userData.transferId=t.id;this.routeGroup.add(v);this.routeUnits.push(v);const points=t.route.slice(t.step).flatMap((id,i,ids)=>i===ids.length-1?[this.position(id,1.1)]:Array.from({length:12},(_,j)=>this.ground(this.position(id),this.position(ids[i+1]),j/12,1.1)));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:movementBlock(state,t.route[t.step],t.route[t.step+1])?'#ee9c74':'#ffd17b',dashSize:.5,gapSize:.3,transparent:true,opacity:.8}));line.computeLineDistances();line.userData.effectResource=true;this.routeGroup.add(line);const ring=this.mesh(new THREE.RingGeometry(.55,.7,24),'#ffd17b',.85);ring.rotation.x=-Math.PI/2;ring.position.copy(this.position(t.route[t.step],1.1));this.routeGroup.add(ring);}
  const events=state?activeIncidents(state).filter(e=>['rain','wind'].includes(e.kind)):[];
  if(state?.worldEvent&&state.worldEvent.round===state.turn&&['rain','wind'].includes(state.worldEvent.kind))events.push({...state.worldEvent,id:'legacy'});
  const damaged=state?Object.keys(state.industryDamage||{}).filter(id=>industryDamage(state,id)):[];
  const key=events.map(e=>`${e.id}:${e.target}:${e.kind}`).join('|')+';'+damaged.join(',');
  if(key===this.weatherKey)return;this.weatherKey=key;this.clearGroup(this.weatherGroup);
  for(const event of events)this.addWeather(event);
  for(const id of damaged){const c=BY_ID[id],root=new THREE.Group();root.position.copy(this.surface(c.lon+.8,c.lat+.65,1.6));root.userData.repairSmoke=true;for(let i=0;i<4;i++)root.add(smokePuff('#515761',.5,1.3));this.weatherGroup.add(root);}
  if(!state)this.weatherKey='';
 }
 addWeather(event){
  const center=this.position(event.target,4.4),cloud=new THREE.Group();cloud.position.copy(center);cloud.userData={cloud:true,baseX:center.x};
  // Noisy alpha billboards form a soft, irregular cloud without solid oval shells.
  for(let i=0;i<11;i++){const puff=smokePuff(event.kind==='rain'?'#92a5b2':'#e4e9ec',event.kind==='rain'?.55:.46,2.2+(i%3)*.5);puff.material.rotation=i*1.7;puff.position.set(Math.sin(i*2.4)*1.4,Math.sin(i)*.18,Math.cos(i*2.4)*.8);cloud.add(puff);}this.weatherGroup.add(cloud);
  if(event.kind!=='rain')return;
  const count=this.map.quality==='low'?48:96,drops=[],positions=new Float32Array(count*6);
  for(let i=0;i<count;i++){const x=center.x+Math.sin(i*2.399)*1.7,z=center.z+Math.cos(i*2.399)*1.1,floor=this.dome(x,z)+.85,top=center.y-.25;drops.push({x,z,floor,top,y:floor+(top-floor)*((i*.618)%1),speed:3.4+(i%5)*.3});}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));const rain=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:'#b2dfff',transparent:true,opacity:.8,depthWrite:false}));rain.frustumCulled=false;rain.userData={effectResource:true,rain:true,drops};this.weatherGroup.add(rain);this.updateWeather(0,0);
 }
}
