import {factionColor,factionFlag} from './factions.js';
import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {COUNTRIES,BY_ID} from './data.js';
import {loadResource} from './startup.js';

// All supplied models are normalized to Y-up, nose/barrel towards -Z.
export function faceForward(object,direction){
 if(direction.lengthSq()<1e-10)return;
 const forward=direction.clone().normalize(),up=Math.abs(forward.y)>.99?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0);
 object.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(),forward,up));
}
// Ground origins were normalized to zero in Blender. Follow the curved board's
// tangent so both tracks touch the land instead of floating above it.
export function groundVehicle(object,position,direction,dome){
 object.position.copy(position);object.position.y=dome(position.x,position.z)+.815;
 const up=new THREE.Vector3(position.x/320,1,position.z/320).normalize();
 const heading=direction?.clone()||new THREE.Vector3(0,0,-1).applyQuaternion(object.quaternion);
 heading.addScaledVector(up,-heading.dot(up)).normalize();
 if(heading.lengthSq()<.0001)heading.set(0,0,-1);
 object.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(),heading,up));
 return object;
}
export class VehicleLibrary{
 constructor(){this.catalog={tanks:[],jets:[]};this.templates=new Map();this.flags=new Map();}
 async load(){
  this.catalog=await loadResource('el catálogo de unidades',async()=>{const r=await fetch('./assets/vehicles/manifest.json');if(!r.ok)throw new Error(`Catálogo: HTTP ${r.status}`);return r.json();});
  const loader=new GLTFLoader(),queue=[...this.catalog.tanks,...this.catalog.jets];
  await Promise.all(Array.from({length:4},async()=>{while(queue.length){const item=queue.shift();const gltf=await loadResource(`el modelo ${item.name||item.id}`,()=>loader.loadAsync(`./assets/vehicles/${item.file}`));this.templates.set(item.id,gltf.scene);}}));
  const textureLoader=new THREE.TextureLoader();await Promise.all(COUNTRIES.map(async c=>{const texture=await loadResource(`la bandera de ${c.name}`,()=>textureLoader.loadAsync(`./flags/${c.iso.toLowerCase()}.svg`));texture.colorSpace=THREE.SRGBColorSpace;this.flags.set(c.id,texture);}));
 }
 model(kind,id,level){const list=kind==='tank'?this.catalog.tanks:this.catalog.jets,index=Math.max(0,COUNTRIES.findIndex(c=>c.id===id));return list[(index+Math.max(0,Math.min(4,level))*(kind==='tank'?5:7))%list.length];}
 setFactions(state){this.factionState=state;const key=JSON.stringify(state?.factions||{});if(key===this.factionKey)return;this.factionKey=key;for(const t of this.customFlags?.values()||[])t.dispose();this.customFlags=new Map();for(const [id,f] of Object.entries(state?.factions||{})){const texture=new THREE.TextureLoader().load(factionFlag({...f,color:factionColor(state,id)}));texture.colorSpace=THREE.SRGBColorSpace;this.customFlags.set(id,texture);}}
 create(kind,id,level,owner=id){
  const info=this.model(kind,id,level),root=new THREE.Group(),body=this.templates.get(info.id).clone(true),color=new THREE.Color(factionColor(this.factionState,owner));
  body.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;const tint=m=>{const next=m.clone();if(next.color){const hsl={};next.color.getHSL(hsl);if(hsl.l>.1)next.color.lerp(color,kind==='tank'?.26:.18);}next.userData.vehicleMaterial=true;return next;};o.material=Array.isArray(o.material)?o.material.map(tint):tint(o.material);});root.add(body);
  const bounds=new THREE.Box3().setFromObject(body),top=bounds.max.y,side=kind==='tank'?.17:.24;
  const decal=new THREE.Mesh(new THREE.PlaneGeometry(.24,.18),new THREE.MeshBasicMaterial({map:this.customFlags?.get(owner)||this.flags.get(owner)||null,side:THREE.DoubleSide,transparent:true}));decal.rotation.x=-Math.PI/2;decal.position.set(side,top+.012,.12);decal.userData.ownedResource=true;root.add(decal);
  if(kind==='tank'){
   const flag=new THREE.Mesh(new THREE.PlaneGeometry(.22,.165),decal.material.clone());flag.position.set(-.12,top+.26,.23);flag.userData.ownedResource=true;root.add(flag);
   const pole=new THREE.Mesh(new THREE.CylinderGeometry(.007,.007,.33,5),new THREE.MeshStandardMaterial({color:'#e5d8ae'}));pole.position.set(-.23,top+.16,.23);pole.userData.ownedResource=true;root.add(pole);
   if(!root.getObjectByName('muzzle')){const muzzle=new THREE.Object3D();muzzle.name='muzzle';muzzle.position.fromArray(info.muzzle);root.add(muzzle);}
  }
  // Nation-coloured identification base remains visible even at the widest zoom.
  root.userData={model:info.id,kind,owner,nation:id,level,muzzle:info.muzzle};return root;
 }
 dispose(unit){unit.removeFromParent();unit.traverse(o=>{if(o.userData.ownedResource)o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.userData.vehicleMaterial||o.userData.ownedResource)m.dispose();});}
}
