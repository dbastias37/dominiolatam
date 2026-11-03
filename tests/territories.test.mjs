import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as THREE from '../public/game/vendor/three.module.js';
import {COUNTRIES,EDGES} from '../public/game/data.js';
import {COUNTRY_COLORS,politicalPalette,controlOwner} from '../public/game/political-colors.js';
import {factionColor} from '../public/game/factions.js';
import {createGame,upgradeSave} from '../public/game/engine.js';
import {boundaryIndex,blocBoundaries,TerritoryOutlines} from '../public/game/territories.js';
import {territoryReveal} from '../public/game/occupation.js';
import {territoryLegendView} from '../public/game/world-ui.js';
const features=JSON.parse(fs.readFileSync(new URL('../public/game/data/region.json',import.meta.url),'utf8')).features,index=boundaryIndex(features);
const surface=(lon,lat,h)=>{const x=(lon+78)*.96,z=-(lat+12)*.96;return new THREE.Vector3(x,-(x*x+z*z)/640+h,z);};
test('The political palette separates neighbors and keeps a restrained red for Chile',()=>{
 assert.equal(new Set(Object.values(COUNTRY_COLORS)).size,20);assert.ok(COUNTRIES.every(c=>c.color===COUNTRY_COLORS[c.id]));const ch=new THREE.Color(COUNTRY_COLORS.CHL).getHSL({});assert.ok(ch.s>.45&&ch.s<.8);assert.ok(ch.h<.05||ch.h>.95);
 for(const [a,b] of EDGES){const x=new THREE.Color(COUNTRY_COLORS[a]),y=new THREE.Color(COUNTRY_COLORS[b]);assert.ok(Math.hypot(x.r-y.r,x.g-y.g,x.b-y.b)>.10,`${a} / ${b}`);}
});
test('A bloc outline removes its internal borders, keeps coasts and enemy fronts, and preserves disconnected territories',()=>{
 const s=createGame();for(const id of ['ARG','BOL','PRY','URY','CUB'])s.countries[id].owner='CHL';const result=blocBoundaries(index,s),internal=index.filter(e=>e.lands.length===2&&e.lands.every(x=>s.countries[x.id]?.owner==='CHL'));assert.ok(internal.length>60);assert.ok(internal.every(e=>!result.some(x=>x.a===e.a&&x.b===e.b)));assert.ok(result.some(e=>e.lands.some(x=>x.id==='ARG')&&e.lands.some(x=>x.id==='BRA')));assert.ok(result.some(e=>e.lands.some(x=>x.id==='CUB')&&e.sides.some(x=>x.owner==='CHL')));assert.ok(result.some(e=>e.lands.length===1&&e.lands[0].id==='CHL'));
});
test('Boundary orientation points into the owning polygon and cancels the exact shared edges of the real map',()=>{
 const shared=index.filter(e=>e.lands.length===2);assert.ok(shared.length>400);assert.ok(shared.every(e=>e.lands[0].inside===-e.lands[1].inside));const sample=boundaryIndex([{properties:{id:'CHL'},geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}}]);const center=new THREE.Vector2(.5,.5);for(const e of sample){const d=new THREE.Vector2(e.b[0]-e.a[0],e.b[1]-e.a[1]),normal=new THREE.Vector2(-d.y,d.x).multiplyScalar(e.lands[0].inside),mid=new THREE.Vector2((e.a[0]+e.b[0])/2,(e.a[1]+e.b[1])/2);assert.ok(normal.dot(center.clone().sub(mid))>0);}
});
test('Ownership, outline and identity hold the previous faction until occupation completes',()=>{
 const s=createGame();s.countries.ARG.owner='CHL';s.pendingOccupation={source:'CHL',target:'ARG',owner:'CHL',previous:'ARG'};assert.equal(controlOwner(s,'ARG'),'ARG');const before=blocBoundaries(index,s);assert.ok(before.some(e=>e.lands.some(x=>x.id==='ARG')&&e.lands.some(x=>x.id==='CHL')));s.pendingOccupation=null;assert.equal(controlOwner(s,'ARG'),'CHL');assert.ok(!blocBoundaries(index,s).some(e=>e.lands.some(x=>x.id==='ARG')&&e.lands.some(x=>x.id==='CHL')));
});
test('Only a selected country receives a narrow outline, cached and disposed on selection change',()=>{
 const outline=new TerritoryOutlines(new THREE.Scene(),surface),s=createGame();outline.load(features);outline.sync(s);assert.equal(outline.root.children.length,0);
 outline.sync(s,'CHL');assert.equal(outline.root.children.length,1);assert.equal(outline.root.children[0].name,'selected-country-edge');const first=outline.root.children[0];let released=0;first.geometry.addEventListener('dispose',()=>released++);
 outline.sync(s,'CHL');assert.equal(outline.root.children[0],first);s.countries.ARG.owner='CHL';outline.sync(s,'CHL');assert.equal(outline.root.children[0],first);
 const p=first.geometry.attributes.position;for(let i=0;i<p.count;i+=13)assert.ok(Math.abs(p.getY(i)+(p.getX(i)**2+p.getZ(i)**2)/640-1.005)<.0001);
 outline.sync(s,'ARG');assert.equal(released,1);assert.notEqual(outline.root.children[0],first);outline.sync(s,null);assert.equal(outline.root.children.length,0);
});
test('Land materials preserve hue under warm lights and still bound their light and shadow relief',()=>{
 const m=new THREE.MeshStandardMaterial(),u=territoryReveal(m),shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <opaque_fragment>'};m.onBeforeCompile(shader);assert.equal(m.toneMapped,false);assert.equal(m.fog,false);assert.match(shader.fragmentShader,/outgoingLight = diffuseColor.rgb \* territoryLight/);assert.match(shader.fragmentShader,/mix\(revealOld, revealNew, cover\)/);assert.equal(shader.uniforms.revealEnabled,u.revealEnabled);
});
test('New and saved factions receive distinct map colors without losing names, flags or ownership',()=>{
 const s=createGame('CHL','normal',33,{mode:'factions',partner:'ARG',name:'Sur',color:'#e55e50'});for(const [i,id] of Object.keys(s.factions).entries())s.factions[id].color=['#e55e50','#e4b644','#43a482','#3c8cc9','#9566d6','#d26b9f'][i%6];s.factions.CHL.color='#e55e50';const restored=upgradeSave(s);assert.ok(restored);const palette=politicalPalette(restored);assert.equal(new Set(Object.keys(restored.factions).map(id=>palette[id])).size,10);assert.equal(factionColor(restored,'CHL'),'#b65b57');assert.equal(restored.factions.CHL.name,'Sur');assert.equal(restored.countries.ARG.owner,'CHL');
});
test('Legend names the controller and groups every owned territory, including a lost home country',()=>{
 const s=createGame();s.countries.CHL.owner='PER';for(const id of ['ARG','BOL','PRY','URY'])s.countries[id].owner='CHL';const html=territoryLegendView(s,()=>'<img>');assert.match(html,/Chile · TÚ/);assert.match(html,/Bolivia · Paraguay · Uruguay · Argentina/);assert.match(html,/Perú · Chile/);assert.match(html,/border|territory-color/);assert.match(html,/país original/);
});
