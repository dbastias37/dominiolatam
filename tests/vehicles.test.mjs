import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../public/game/vendor/three.module.js';
import {GLTFLoader} from '../public/game/vendor/GLTFLoader.js';
import {VehicleLibrary,faceForward,groundVehicle} from '../public/game/vehicles.js';
import {CampaignDirector} from '../public/game/cinematics.js';
import {WorldMap} from '../public/game/map3d.js';
import {COUNTRIES} from '../public/game/data.js';
import {createGame} from '../public/game/engine.js';
import {addIncident} from '../public/game/events.js';

const library=new VehicleLibrary();library.catalog=JSON.parse(await fs.readFile(new URL('../public/game/assets/vehicles/manifest.json',import.meta.url),'utf8'));
const loader=new GLTFLoader();for(const item of [...library.catalog.tanks,...library.catalog.jets]){const bytes=await fs.readFile(new URL(`../public/game/assets/vehicles/${item.file}`,import.meta.url));const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');library.templates.set(item.id,gltf.scene);}

test('All 38 supplied models load with complete geometry and exact barrel markers',()=>{
 assert.equal(library.templates.size,38);for(const item of [...library.catalog.tanks,...library.catalog.jets]){const model=library.templates.get(item.id),bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());assert.ok(Math.abs(size.z-1)<.001,`${item.id}: normalized length`);assert.ok(Math.abs(bounds.min.y)<.001,`${item.id}: ground origin`);assert.equal(item.front,'-Z');assert.equal(item.up,'+Y');
  if(item.type==='tank'){const marker=model.getObjectByName('muzzle');assert.ok(marker,item.id);const point=marker.getWorldPosition(new THREE.Vector3());assert.ok(point.distanceTo(new THREE.Vector3(...item.muzzle))<.0001,`${item.id}: muzzle coordinates`);const direction=new THREE.Vector3(0,0,-1).applyQuaternion(marker.getWorldQuaternion(new THREE.Quaternion()));assert.ok(direction.distanceTo(new THREE.Vector3(...item.muzzleDirection))<.0001,`${item.id}: barrel axis`);}
 }
});
test('Every national upgrade changes model; liveries and ownership remain distinct',()=>{
 for(const kind of ['tank','jet'])for(const c of COUNTRIES){const ids=Array.from({length:5},(_,i)=>library.model(kind,c.id,i).id);assert.equal(new Set(ids).size,5,`${kind} ${c.id}`);const unit=library.create(kind,c.id,2,'CHL');assert.equal(unit.userData.owner,'CHL');assert.equal(unit.userData.nation,c.id);assert.ok(new THREE.Box3().setFromObject(unit).max.y>0);library.dispose(unit);}
 assert.equal(new Set(COUNTRIES.map(c=>library.model('tank',c.id,1).id)).size,16);assert.equal(new Set(COUNTRIES.map(c=>library.model('jet',c.id,1).id)).size,20);
});
test('Nose-forward orientation follows straight and curved trajectories without sideways travel',()=>{
 const vehicle=new THREE.Group(),curve=new THREE.CubicBezierCurve3(new THREE.Vector3(-12,1,7),new THREE.Vector3(-4,9,10),new THREE.Vector3(4,6,-10),new THREE.Vector3(12,1,-8));
 for(let i=0;i<=100;i++){const dir=curve.getTangent(i/100).normalize();faceForward(vehicle,dir);const actual=new THREE.Vector3(0,0,-1).applyQuaternion(vehicle.quaternion);assert.ok(actual.dot(dir)>.999999);}
 for(const dir of [new THREE.Vector3(0,1,0),new THREE.Vector3(0,-1,0),new THREE.Vector3(1,0,0)]){faceForward(vehicle,dir);assert.ok(new THREE.Vector3(0,0,-1).applyQuaternion(vehicle.quaternion).dot(dir)>.999999);}
});
function director(){const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(6,105,66);const map={scene,camera,vehicles:library,reducedMotion:false,controls:{target:new THREE.Vector3(),minDistance:38,enabled:true,update(){}},focusTarget:null};const dome=(x,z)=>-(x*x+z*z)/640,surface=(lon,lat,h)=>{const x=(lon+78)*.96,z=-(lat+12)*.96;return new THREE.Vector3(x,dome(x,z)+h,z);};return {director:new CampaignDirector(map,surface,dome),map};}
test('The initial map selection works before a campaign exists',()=>{
 const {director:d,map}=director();Object.setPrototypeOf(map,WorldMap.prototype);Object.assign(map,{director:d,state:null,ring:new THREE.Group(),labels:{},countryGroups:{}});
 // WorldMap.load() ends with this selection while the menu has no campaign.
 assert.doesNotThrow(()=>map.select('CHL'));assert.equal(map.selected,'CHL');assert.equal(map.state,null);assert.ok(map.ring.position.length()>0);assert.equal(d.weatherGroup.children.length,0);assert.doesNotThrow(()=>d.sync(undefined));
});
test('Returning to the menu clears active weather and routes and permits another campaign',()=>{
 const {director:d}=director(),s=createGame('CHL','explorer',211);addIncident(s,'ARG','rain');s.worldEvent={kind:'wind',target:'CHL',round:s.turn};s.transfers=[{id:1,owner:'CHL',armor:1,air:1,troops:20,route:['CHL','ARG'],step:0}];const before=JSON.stringify(s);
 d.sync(s);assert.equal(d.weatherGroup.children.filter(x=>x.userData.cloud).length,2);assert.equal(d.weatherGroup.children.filter(x=>x.userData.rain).length,1);assert.equal(d.routeGroup.children.length,3);assert.equal(JSON.stringify(s),before);
 let released=0;for(const group of [d.weatherGroup,d.routeGroup])group.traverse(o=>o.geometry?.addEventListener('dispose',()=>released++));d.sync(null);assert.equal(d.weatherGroup.children.length,0);assert.equal(d.routeGroup.children.length,0);assert.ok(released>=5);assert.equal(d.weatherKey,'');d.sync(null);
 const next=createGame('MEX','normal',212);d.sync(next);assert.equal(d.weatherGroup.children.length,0);next.worldEvent={kind:'rain',target:'MEX',round:0};d.sync(next);assert.equal(d.weatherGroup.children.length,0);
});
test('Battle shots originate on model muzzles and animations release all temporary resources',async()=>{
 const {director:d,map}=director(),camera=map.camera.position.clone(),b={source:'CHL',target:'ARG',attacker:'CHL',defender:'ARG',attacking:{owner:'CHL',armor:2,air:2},defending:{owner:'ARG',armor:1,air:1},won:true};const done=d.battle(b);for(let i=0;i<170;i++)d.update(.02,i*.02);const active=d.active;assert.ok(active.shots.length>=1);assert.equal(active.units.filter(u=>u.userData.battle).length,4);
 const shot=active.shots[0],shooter=active.units[0],muzzle=shooter.getObjectByName('muzzle').getWorldPosition(new THREE.Vector3());assert.ok(shot.from.distanceTo(muzzle)<1e-8);const axis=new THREE.Vector3(0,0,-1).applyQuaternion(shooter.getObjectByName('muzzle').getWorldQuaternion(new THREE.Quaternion()));assert.ok(shot.curve.getTangent(0).dot(axis)>.99999);
 d.skip();await done;assert.equal(d.active,null);assert.deepEqual(map.camera.position,camera);assert.equal(map.controls.enabled,true);assert.equal(map.controls.minDistance,38);assert.equal(map.scene.children.length,2);d.skip();
});
test('Transfer animation reaches its endpoint and can be skipped safely',async()=>{
 const {director:d,map}=director();const done=d.movements([{source:'MEX',target:'CUB',owner:'MEX',armor:2,air:2,sea:true}]);for(let i=0;i<215;i++)d.update(.02,i*.02);const {v,curve}=d.active.convoys[0];assert.ok(v.position.distanceTo(curve.getPoint(1))<.1);assert.ok(new THREE.Vector3(0,0,-1).applyQuaternion(v.quaternion).dot(curve.getTangent(.997))>.99);d.skip();await done;assert.equal(map.scene.children.length,2);
});

test('Grounded tanks follow the dome normal and keep their origin on the land surface',()=>{
 const dome=(x,z)=>-(x*x+z*z)/640,v=library.create('tank','CHL',2,'CHL');v.scale.setScalar(1.5);
 for(const [x,z] of [[0,0],[-22,-34],[28,42],[5,18]]){const p=new THREE.Vector3(x,15,z),forward=new THREE.Vector3(1,0,-1);groundVehicle(v,p,forward,dome);const actualUp=new THREE.Vector3(0,1,0).applyQuaternion(v.quaternion),normal=new THREE.Vector3(x/320,1,z/320).normalize();assert.ok(actualUp.dot(normal)>.999999);assert.ok(Math.abs(v.position.y-dome(x,z)-.815)<1e-8);const actualForward=new THREE.Vector3(0,0,-1).applyQuaternion(v.quaternion);assert.ok(Math.abs(actualForward.dot(normal))<1e-8);}
 library.dispose(v);
});
test('A successful battle destroys defenders and holds the front until the result announcement',async()=>{
 const {director:d}=director(),b={source:'CHL',target:'ARG',attacker:'CHL',defender:'ARG',attacking:{owner:'CHL',armor:2,air:2},defending:{owner:'ARG',armor:1,air:1},won:true};const done=d.battle(b);
 for(let i=0;i<335;i++)d.update(.02,i*.02);const a=d.active,defenders=a.units.filter(v=>v.userData.battle&&!v.userData.battle.attack);assert.ok(defenders.every(v=>!v.visible&&v.userData.battle.destroyed));assert.equal(a.blasts.length,2);assert.ok(a.blasts.every(b=>b.pieces.length>=10));
 for(let i=335;i<455;i++)d.update(.02,i*.02);for(const v of a.units.filter(v=>v.userData.battle?.attack)){const end=v.userData.battle.to;assert.ok(Math.hypot(v.position.x-end.x,v.position.z-end.z)<.05);}d.skip();await done;
});
test('A repelled attack retreats the surviving tanks to their actual origin without destroying defenders',async()=>{
 const {director:d}=director(),b={source:'CHL',target:'ARG',attacker:'CHL',defender:'ARG',attacking:{owner:'CHL',armor:1,air:1},defending:{owner:'ARG',armor:4,air:2},won:false};const done=d.battle(b);
 for(let i=0;i<455;i++)d.update(.02,i*.02);const a=d.active;for(const v of a.units.filter(v=>v.userData.battle?.attack)){const home=v.userData.battle.home;assert.ok(Math.hypot(v.position.x-home.x,v.position.z-home.z)<.05);assert.equal(v.visible,true);}assert.equal(a.blasts.length,0);assert.ok(a.units.filter(v=>v.userData.battle&&!v.userData.battle.attack).every(v=>v.visible));d.skip();await done;
});
test('Clouds use soft irregular smoke textures and rain drops move and loop only above affected countries',()=>{
 const {director:d}=director(),s=createGame();addIncident(s,'ARG','rain');d.sync(s);const cloud=d.weatherGroup.children.find(o=>o.userData.cloud),rain=d.weatherGroup.children.find(o=>o.userData.rain);assert.ok(cloud.children.length>=6);assert.ok(cloud.children.every(o=>o.isSprite&&o.material.transparent&&!o.material.depthWrite&&o.material.map.isDataTexture&&o.scale.y>.5));const before=rain.geometry.attributes.position.array.slice();d.update(.05,1);assert.notDeepEqual(rain.geometry.attributes.position.array,before);
 for(let i=0;i<200;i++)d.update(.05,i*.05);assert.ok(rain.userData.drops.every(drop=>drop.y>=drop.floor&&drop.y<=drop.top));assert.ok(rain.userData.drops.every(drop=>Math.abs(drop.x-cloud.position.x)<2));s.incidents=[];d.sync(s);assert.equal(d.weatherGroup.children.length,0);
});
test('Bombing animation follows its route nose first and impacts only the factory marker before returning',async()=>{
 const {director:d,map}=director(),b={type:'bombard',source:'CHL',target:'BRA',route:['CHL','PER','BRA'],attacker:'CHL',defender:'BRA'};const done=d.bombardment(b);for(let i=0;i<150;i++)d.update(.02,i*.02);const a=d.active;assert.equal(a.struck,undefined);assert.equal(a.units.length,1);const u=Math.min(1,(a.t/4)),e=u*u*(3-2*u),forward=new THREE.Vector3(0,0,-1).applyQuaternion(a.jet.quaternion);assert.ok(forward.dot(a.flight.getTangent(e))>.999999);
 for(let i=150;i<260;i++)d.update(.02,i*.02);assert.equal(a.struck,true);assert.equal(a.blasts.length,1);assert.ok(a.blasts[0].root.position.distanceTo(a.factory)<1e-9);assert.ok(!a.units.some(v=>v.userData.kind==='tank'));d.skip();await done;assert.equal(map.scene.children.length,2);
});

test('Occupation parks a visible tank before expanding color, and finishes cleanly in reduced motion',async()=>{
 for(const reduced of [false,true]){const {director:d,map}=director(),progress=[];map.reducedMotion=reduced;map.countryGroups={ARG:{unit:new THREE.Group(),jet:new THREE.Group()}};map.revealOccupation=(o,p)=>progress.push(p);const o={source:'CHL',target:'ARG',owner:'CHL',previous:'ARG',armor:2,air:2},done=d.occupation(o),a=d.active;assert.equal(map.countryGroups.ARG.unit.visible,false);const duration=a.duration;
  for(let i=1;i<=60;i++)d.update(duration/120,i*duration/120);assert.ok(a.tank.visible);assert.ok(Math.hypot(a.tank.position.x-a.end.x,a.tank.position.z-a.end.z)<.001);assert.ok(progress.at(-1)<.1);assert.ok(progress.every((v,i)=>i===0||v>=progress[i-1]));for(let i=61;i<=122;i++)d.update(duration/120,i*duration/120);await done;assert.equal(progress.at(-1),1);assert.equal(d.active,null);assert.equal(map.countryGroups.ARG.unit.visible,true);assert.equal(map.controls.enabled,true);
 }
});
test('Multiple convoys animate sequentially, camera follows the current unit, and waiting convoys remain on the board',async()=>{
 const {director:d,map}=director(),s=createGame();s.transfers=[{id:1,owner:'CHL',route:['CHL','ARG','BRA'],step:0,armor:1,air:0,troops:20}];d.sync(s);assert.equal(d.routeUnits.length,1);const waiting=d.routeUnits[0];assert.ok(waiting.visible);assert.equal(waiting.userData.owner,'CHL');const done=d.movements([{transferId:1,source:'CHL',target:'ARG',owner:'CHL',armor:1,air:0,troops:20,sea:false},{transferId:2,source:'MEX',target:'CUB',owner:'MEX',armor:1,air:1,troops:12,sea:true}]);assert.equal(waiting.visible,false);
 for(let i=0;i<200;i++)d.update(.02,i*.02);const a=d.active;assert.equal(a.convoys[0].v.visible,true);assert.equal(a.convoys[1].v.visible,false);assert.ok(map.controls.target.distanceTo(a.convoys[0].v.position)<2);for(let i=200;i<330;i++)d.update(.02,i*.02);assert.equal(a.convoys[0].v.visible,false);assert.equal(a.convoys[1].v.visible,true);assert.ok(map.controls.target.distanceTo(a.convoys[1].v.position)<4);d.skip();await done;assert.equal(waiting.visible,true);d.sync(null);assert.equal(d.routeUnits.length,0);
});
