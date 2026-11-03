import * as THREE from './vendor/three.module.js';

export const NAV_LIMITS={min:14,max:165,xMin:-50,xMax:56,zMin:-52,zMax:58};
const smooth=t=>t*t*(3-2*t);
export function turnFocusId(state,faction){
 if(state.countries[faction]?.owner===faction)return faction;
 return Object.values(state.countries).filter(c=>c.owner===faction).sort((a,b)=>b.troops-a.troops||a.id.localeCompare(b.id))[0]?.id||null;
}
export class MapNavigation{
 constructor(camera,controls,{reducedMotion=false,dome=()=>0,onChange=()=>{}}={}){Object.assign(this,{camera,controls,reducedMotion,dome,onChange});this.flight=null;}
 get distance(){return this.camera.position.distanceTo(this.controls.target);}
 get zoom(){return 125/this.distance;}
 flyTo(target,distance,{duration,kind='travel',north=false}={}){
  this.cancel();const startTarget=this.controls.target.clone(),startPosition=this.camera.position.clone(),damping=this.controls.enableDamping;
  // Flush residual drag inertia without moving the first visible frame.
  this.controls.enableDamping=false;this.controls.update?.();this.controls.target.copy(startTarget);this.camera.position.copy(startPosition);this.camera.lookAt(startTarget);
  const startOffset=startPosition.sub(startTarget),travel=startTarget.distanceTo(target),endDistance=THREE.MathUtils.clamp(distance,NAV_LIMITS.min,NAV_LIMITS.max),direction=north?new THREE.Vector3(6,106,66).normalize():startOffset.clone().normalize();
  if(direction.lengthSq()<.1)direction.set(0,.85,.53).normalize();
  const f={startTarget,target:target.clone(),startOffset,direction,startDistance:startOffset.length(),endDistance,t:0,duration:this.reducedMotion?.12:Math.max(.01,duration??THREE.MathUtils.clamp(.65+travel/85,.65,1.45)),lift:kind==='travel'&&!this.reducedMotion?Math.min(16,travel*.2):0,kind,resolve:null,damping};
  this.controls.enableDamping=false;this.flight=f;return new Promise(resolve=>{f.resolve=resolve;});
 }
 zoomBy(factor){
  if(!Number.isFinite(factor)||factor<=0)return Promise.resolve({interrupted:true});
  const distance=(this.flight?.kind==='zoom'?this.flight.endDistance:this.distance)*factor;
  return this.flyTo(this.controls.target.clone(),distance,{duration:.28,kind:'zoom'});
 }
 update(dt){
  const f=this.flight;if(!f)return;f.t+=Math.max(0,dt);const t=Math.min(1,f.t/f.duration),e=smooth(t),target=f.startTarget.clone().lerp(f.target,e),offset=f.startOffset.clone().normalize().lerp(f.direction,e).normalize(),distance=THREE.MathUtils.lerp(f.startDistance,f.endDistance,e)+Math.sin(Math.PI*e)*f.lift;
  target.y+=this.dome(target.x,target.z)-THREE.MathUtils.lerp(this.dome(f.startTarget.x,f.startTarget.z),this.dome(f.target.x,f.target.z),e);
  this.controls.target.copy(target);this.camera.position.copy(target).addScaledVector(offset,distance);this.camera.lookAt(target);this.onChange();if(t===1)this.finish();
 }
 finish(){const f=this.flight;if(!f)return;this.controls.target.copy(f.target);this.camera.position.copy(f.target).addScaledVector(f.direction,f.endDistance);this.camera.lookAt(f.target);this.flight=null;this.controls.enableDamping=f.damping;this.onChange();f.resolve?.({interrupted:false});}
 cancel(){const f=this.flight;if(!f)return;this.flight=null;this.controls.enableDamping=f.damping;f.resolve?.({interrupted:true});}
 constrain(){
  if(this.flight)return;const target=this.controls.target,clamped=target.clone();clamped.x=THREE.MathUtils.clamp(clamped.x,NAV_LIMITS.xMin,NAV_LIMITS.xMax);clamped.z=THREE.MathUtils.clamp(clamped.z,NAV_LIMITS.zMin,NAV_LIMITS.zMax);clamped.y=this.dome(clamped.x,clamped.z)+.8;const delta=clamped.sub(target);target.add(delta);this.camera.position.add(delta);
 }
}

// A pinch or a drag must never select a country on release.
export class MapTapGesture{
 constructor(){this.points=new Map();this.gesture=false;}
 down(id,x,y,country=null,button=0){this.points.set(id,{x,y,country,button});if(this.points.size>1)this.gesture=true;}
 move(id,x,y){const p=this.points.get(id);if(p&&Math.hypot(x-p.x,y-p.y)>7)this.gesture=true;}
 up(id,x,y){const p=this.points.get(id);this.move(id,x,y);const tap=p&&!this.gesture&&this.points.size===1&&p.button===0?{country:p.country}:null;this.points.delete(id);if(!this.points.size)this.gesture=false;return tap;}
 cancel(){this.points.clear();this.gesture=false;}
}
