import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from '../public/game/vendor/three.module.js';
import {levelFlight,returnFlight} from '../public/game/flights.js';
import {smokeTexture,smokePuff} from '../public/game/particles.js';
import {territoryReveal,revealRadius} from '../public/game/occupation.js';
import {COUNTRIES} from '../public/game/data.js';
test('Planes keep altitude and a forward horizontal heading on approach, overflight and return for every country pair',()=>{
 for(const a of COUNTRIES)for(const b of COUNTRIES){if(a===b)continue;const start=new THREE.Vector3(a.lon,0,a.lat),end=new THREE.Vector3(b.lon,-8,b.lat),approach=levelFlight([start,end]),tour=levelFlight([start,end],{returnHome:true}),back=returnFlight(approach.getPoint(1),approach.getPoint(0),approach.getTangent(1));for(const curve of [approach,tour,back])for(let n=0;n<=60;n++){const p=curve.getPoint(n/60),t=curve.getTangent(n/60);assert.ok(Math.abs(p.y-7)<1e-6);assert.ok(Math.abs(t.y)<1e-6);assert.ok(Number.isFinite(p.x+p.z));}assert.ok(approach.getTangent(1).dot(back.getTangent(0))>.9999);assert.ok(tour.getPoint(1).distanceTo(approach.getPoint(0))<1e-6);}
});
test('Smoke has transparent irregular edges, many alpha levels, and shared texture is not disposed with each puff',()=>{
 const texture=smokeTexture(),{data,width,height}=texture.image,alpha=[];for(let y=0;y<height;y++)for(let x=0;x<width;x++){const v=data[(y*width+x)*4+3];alpha.push(v);if(!x||!y||x===width-1||y===height-1)assert.equal(v,0);}assert.ok(new Set(alpha).size>100);assert.ok(alpha.some(x=>x>180));const a=smokePuff(),b=smokePuff();assert.equal(a.material.map,b.material.map);assert.equal(a.material.depthWrite,false);assert.equal(a.userData.preserveGeometry,true);a.material.dispose();assert.equal(smokeTexture(),texture);
});
test('Territorial color reveal begins at the center and covers all bounds without altering neighboring materials',()=>{
 const mat=new THREE.MeshStandardMaterial(),neighbor=new THREE.MeshStandardMaterial({color:'#f0aabb'}),original=neighbor.color.clone(),u=territoryReveal(mat),shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>'};mat.onBeforeCompile(shader);assert.equal(shader.uniforms.revealRadius,u.revealRadius);assert.match(shader.vertexShader,/territoryXZ = position.xz/);assert.match(shader.fragmentShader,/distance\(territoryXZ, revealCenter\)/);const box=new THREE.Box3(new THREE.Vector3(-2,0,-10),new THREE.Vector3(4,1,20)),center=new THREE.Vector3(1,0,0);assert.ok(revealRadius(box,center,0)<0);assert.ok(revealRadius(box,center,1)>Math.hypot(3,20));assert.ok(revealRadius(box,center,.4)<revealRadius(box,center,.7));assert.deepEqual(neighbor.color,original);
});
