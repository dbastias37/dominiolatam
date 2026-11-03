import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/game/vendor/three.module.js';
import {InterfaceState,boardFrame,compactViewport} from '../public/game/layout.js';

function projectedTarget(width,height,frame){
 const camera=new THREE.PerspectiveCamera(60,width/height,.5,700),target=new THREE.Vector3(-8,-1,25);camera.position.copy(target).add(new THREE.Vector3(5,40,25));camera.lookAt(target);camera.updateMatrixWorld();
 camera.setViewOffset(width,height,width/2-frame.cx,height/2-frame.cy,width,height);const p=target.clone().project(camera);return {x:(p.x+1)*width/2,y:(1-p.y)*height/2};
}

test('Phone portrait framing centers the country above the open sheet or collapsed country card',()=>{
 for(const [width,height] of [[320,568],[360,640],[390,844],[412,915],[720,900]]){
  const cardTop=height-142,closed=boardFrame({width,height,top:180,bottom:cardTop});assert.ok(closed.compact);assert.ok(closed.cy>180&&closed.cy<cardTop);assert.ok(closed.height>=100);
  const sheetHeight=Math.min(height*.54,520,height-300),panel={top:height-80-sheetHeight,right:width-8,width:width-16,height:sheetHeight};
  const opened=boardFrame({width,height,top:120,bottom:height-72,panel});assert.ok(opened.cy>120&&opened.cy<panel.top-12,`${width}x${height}`);
  const p=projectedTarget(width,height,opened);assert.ok(Math.abs(p.x-opened.cx)<1e-6);assert.ok(Math.abs(p.y-opened.cy)<1e-6);
 }
});

test('Landscape phones place the country beside the sheet and outside the bottom controls',()=>{
 for(const [width,height] of [[568,320],[844,390],[932,430],[1180,530]]){
  assert.ok(compactViewport(width,height));const panel={top:62,right:8+Math.min(340,width*.42),width:Math.min(340,width*.42),height:height-72};
  const frame=boardFrame({width,height,top:64,bottom:height-78,panel});assert.ok(frame.landscape);assert.ok(frame.cx>panel.right+12&&frame.cx<width);assert.ok(frame.cy>64&&frame.cy<height-78);assert.ok(frame.width>width*.5);
  const p=projectedTarget(width,height,frame);assert.ok(p.x>panel.right);assert.ok(p.y<height-78);
 }
});

test('Solo map recenters the full screen in either orientation and desktop framing is preserved',()=>{
 for(const [width,height] of [[320,568],[390,844],[932,430],[1440,900]]){
  const frame=boardFrame({width,height,hidden:true,panel:{width:300,height:400,right:320,top:400},top:180,bottom:height-150});assert.equal(frame.cx,width/2);assert.equal(frame.cy,height/2);assert.equal(frame.width,width);assert.equal(frame.height,height);
 }
 const desktop=boardFrame({width:1440,height:900});assert.equal(desktop.compact,false);assert.equal(desktop.cx,(330+1440-245)/2);assert.equal(desktop.cy,450);
});

test('Hiding the interface restores the previous panel, blocks opening while hidden, and resets for a new game',()=>{
 const ui=new InterfaceState();ui.showPanel();ui.toggleMap();assert.equal(ui.hidden,true);assert.equal(ui.panelOpen,false);ui.showPanel();assert.equal(ui.panelOpen,false);ui.toggleMap();assert.equal(ui.hidden,false);assert.equal(ui.panelOpen,true);
 ui.closePanel();ui.toggleMap();ui.toggleMap();assert.equal(ui.panelOpen,false);ui.showPanel();ui.toggleMap();ui.reset();assert.equal(ui.hidden,false);assert.equal(ui.panelOpen,false);assert.equal(ui.panelBeforeHide,false);
});
