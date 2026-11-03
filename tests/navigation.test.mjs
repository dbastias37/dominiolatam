import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/game/vendor/three.module.js';
import {OrbitControls} from '../public/game/vendor/OrbitControls.js';
import {MapNavigation,MapTapGesture,NAV_LIMITS,turnFocusId} from '../public/game/navigation.js';
import {COUNTRIES} from '../public/game/data.js';
import {createGame,drawFirst,beginCampaign,currentFaction,playAITurn,finishAITurn,finishBattle,finishMovements,acknowledge,endTurn,resolveEvent} from '../public/game/engine.js';

const dome=(x,z)=>-(x*x+z*z)/640;
const surface=c=>{const x=(c.lon+78)*.96,z=-(c.lat+12)*.96;return new THREE.Vector3(x,dome(x,z)+.8,z);};
function rig(reducedMotion=false){
 const camera=new THREE.PerspectiveCamera(40,1,.5,700);camera.position.set(6,105,66);
 // Real OrbitControls math, without DOM or a WebGL renderer.
 const controls=new OrbitControls(camera,null);controls.target.set(0,.8,0);controls.enableDamping=true;controls.minDistance=NAV_LIMITS.min;controls.maxDistance=NAV_LIMITS.max;controls.update();
 const nav=new MapNavigation(camera,controls,{dome,reducedMotion});
 const tick=dt=>{nav.update(dt);controls.update();nav.constrain();};
 const complete=()=>{for(let i=0;i<200&&nav.flight;i++)tick(.01);assert.equal(nav.flight,null);};
 return {camera,controls,nav,tick,complete};
}
function near(actual,expected,epsilon=1e-7){assert.ok(actual.distanceTo(expected)<epsilon,`${actual.toArray()} != ${expected.toArray()}`);}

test('Turn flights reach all 20 real country centers smoothly, without a halfway target',async()=>{
 const {camera,controls,nav,tick,complete}=rig();
 for(const c of COUNTRIES){
  const target=surface(c),before=camera.position.clone(),from=controls.target.clone(),done=nav.flyTo(target,42);
  near(camera.position,before);tick(.01);assert.ok(camera.position.distanceTo(before)<.2,'no first-frame jump');
  if(from.distanceTo(target)>1)assert.ok(controls.target.distanceTo(target)>0.1,'flight is animated');
  complete();assert.deepEqual(await done,{interrupted:false});near(controls.target,target);assert.ok(Math.abs(nav.distance-42)<1e-7);assert.equal(controls.enableDamping,true);
 }
});

test('Zoom clicks accumulate while moving, stay bounded, and overview restores a north-facing view',async()=>{
 const {camera,controls,nav,tick,complete}=rig(),start=nav.distance,before=camera.position.clone();
 const first=nav.zoomBy(.8),second=nav.zoomBy(.8);assert.ok(Math.abs(nav.flight.endDistance-start*.64)<1e-7);near(camera.position,before);assert.deepEqual(await first,{interrupted:true});
 tick(.04);assert.ok(nav.distance<start&&nav.distance>start*.64);complete();await second;assert.ok(Math.abs(nav.distance-start*.64)<1e-7);
 const close=nav.zoomBy(.00001);complete();await close;assert.ok(Math.abs(nav.distance-NAV_LIMITS.min)<1e-7);
 const far=nav.zoomBy(9999);complete();await far;assert.ok(Math.abs(nav.distance-NAV_LIMITS.max)<1e-7);
 const overview=nav.flyTo(new THREE.Vector3(0,.8,0),125,{north:true});complete();await overview;near(controls.target,new THREE.Vector3(0,.8,0));near(camera.position.clone().sub(controls.target).normalize(),new THREE.Vector3(6,106,66).normalize());
});

test('Touching or replacing a camera flight resolves it once and never pulls the user back',async()=>{
 const {camera,controls,nav,tick,complete}=rig();
 const first=nav.flyTo(surface(COUNTRIES[0]),35);tick(.2);const before=camera.position.clone();nav.cancel();assert.deepEqual(await first,{interrupted:true});near(camera.position,before);tick(.1);near(camera.position,before);
 controls.target.x+=5;camera.position.x+=5;nav.constrain();const manual=camera.position.clone();tick(.1);near(camera.position,manual);
 const second=nav.flyTo(surface(COUNTRIES[1]),50),third=nav.flyTo(surface(COUNTRIES[2]),35);assert.deepEqual(await second,{interrupted:true});complete();assert.deepEqual(await third,{interrupted:false});near(controls.target,surface(COUNTRIES[2]));nav.finish();nav.cancel();assert.equal(controls.enableDamping,true);
});

test('Old drag inertia is drained before flights, so OrbitControls cannot fight the new camera',async()=>{
 const {camera,controls,nav,tick,complete}=rig();controls._panOffset.set(10,0,-5);controls._sphericalDelta.theta=.2;controls.update();
 const before=camera.position.clone(),target=surface(COUNTRIES[4]),done=nav.flyTo(target,45);near(camera.position,before);assert.equal(controls._panOffset.length(),0);assert.equal(controls._sphericalDelta.theta,0);
 tick(.01);assert.ok(camera.position.distanceTo(before)<.2);complete();await done;near(controls.target,target);tick(.5);near(controls.target,target);
});

test('Panning stays over the continent and follows the curved surface without changing zoom',()=>{
 const {camera,controls,nav}=rig();controls.target.set(800,17,-800);camera.position.copy(controls.target).add(new THREE.Vector3(7,32,22));const offset=camera.position.clone().sub(controls.target);nav.constrain();
 near(controls.target,new THREE.Vector3(NAV_LIMITS.xMax,dome(NAV_LIMITS.xMax,NAV_LIMITS.zMin)+.8,NAV_LIMITS.zMin));near(camera.position.clone().sub(controls.target),offset);
 for(const c of COUNTRIES){const p=surface(c);assert.ok(p.x>=NAV_LIMITS.xMin&&p.x<=NAV_LIMITS.xMax&&p.z>=NAV_LIMITS.zMin&&p.z<=NAV_LIMITS.zMax,c.name);}
});

test('A drag, two-finger pinch, right click or cancellation never becomes a country selection',()=>{
 const g=new MapTapGesture();g.down(1,10,20,'CHL');assert.deepEqual(g.up(1,12,22),{country:'CHL'});
 g.down(1,10,20,'CHL');g.move(1,30,25);assert.equal(g.up(1,10,20),null);
 g.down(1,10,20,'CHL');g.down(2,40,20,'ARG');assert.equal(g.up(1,10,20),null);assert.equal(g.up(2,40,20),null);
 g.down(1,10,20,null,2);assert.equal(g.up(1,10,20),null);
 g.down(1,10,20,'CHL');g.cancel();assert.equal(g.up(1,10,20),null);
 g.down(1,10,20,'MEX');assert.deepEqual(g.up(1,10,20),{country:'MEX'});
});

test('Reduced motion finishes in a brief transition and a skip lands at the exact destination',async()=>{
 const {controls,nav,tick}=rig(true),target=surface(COUNTRIES[0]),done=nav.flyTo(target,40);tick(.12);assert.deepEqual(await done,{interrupted:false});near(controls.target,target);
 const next=nav.flyTo(surface(COUNTRIES[7]),28);nav.finish();assert.deepEqual(await next,{interrupted:false});near(controls.target,surface(COUNTRIES[7]));
});

test('The turn camera follows the active nation, including a nation that lost its home country',()=>{
 const s=createGame('CHL','explorer',211);drawFirst(s);beginCampaign(s);
 for(let i=0;i<60&&s.status==='playing';i++){
  const faction=currentFaction(s),id=turnFocusId(s,faction);assert.ok(id);assert.equal(s.countries[id].owner,faction);finishBattle(s);finishMovements(s);acknowledge(s,s.inbox.slice());if(s.event)resolveEvent(s,0);
  if(s.phase==='player')endTurn(s);else{playAITurn(s);finishAITurn(s);}
 }
 s.countries.CHL.owner='ARG';s.countries.PER.owner=s.countries.BOL.owner='CHL';s.countries.PER.troops=100;s.countries.BOL.troops=5;assert.equal(turnFocusId(s,'CHL'),'PER');
 for(const c of Object.values(s.countries))if(c.owner==='CHL')c.owner='ARG';assert.equal(turnFocusId(s,'CHL'),null);
});
