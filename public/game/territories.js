import * as THREE from './vendor/three.module.js';
import {COUNTRIES,BY_ID} from './data.js';
import {controlOwner,politicalPalette} from './political-colors.js';
const ids=new Set(COUNTRIES.map(c=>c.id)),keyPoint=p=>p.map(n=>Number(n.toFixed(5))).join(',');
export function boundaryIndex(features){
 const index=new Map();
 for(const f of features){const id=f.properties.id,polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  for(const poly of polys)for(const [ringIndex,ring] of poly.entries()){
   // Left/right points into the ring's land, including a reversed side for holes.
   const area=ring.slice(0,-1).reduce((sum,a,i)=>sum+a[0]*ring[i+1][1]-ring[i+1][0]*a[1],0),inside=(area>=0?1:-1)*(ringIndex? -1:1);
   for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1],ka=keyPoint(a),kb=keyPoint(b);if(ka===kb)continue;const forward=ka<kb,key=forward?ka+'|'+kb:kb+'|'+ka;let edge=index.get(key);if(!edge){edge={a:forward?a:b,b:forward?b:a,lands:[]};index.set(key,edge);}if(!edge.lands.some(x=>x.id===id))edge.lands.push({id,inside:inside*(forward?1:-1)});}
  }
 }
 return [...index.values()];
}
export function blocBoundaries(index,state){
 const result=[];
 for(const edge of index){const sides=edge.lands.filter(x=>ids.has(x.id)).map(x=>({...x,owner:controlOwner(state,x.id)}));if(!sides.length||sides.length>1&&sides.every(x=>x.owner===sides[0].owner))continue;result.push({...edge,sides});}
 return result;
}
function strip(vertices,a,b,offset,width,surface){
 const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<1e-8)return;const nx=-dy/length,ny=dx/length,steps=Math.max(1,Math.ceil(length/1.25));
 for(let i=0;i<steps;i++){const u=i/steps,v=(i+1)/steps,point=(t,d)=>surface(a[0]+dx*t+nx*d,a[1]+dy*t+ny*d,1.005),p=point(u,offset-width/2),q=point(v,offset-width/2),r=point(v,offset+width/2),s=point(u,offset+width/2);for(const k of [p,q,r,p,r,s])vertices.push(k.x,k.y,k.z);}
}
export class TerritoryOutlines{
 constructor(scene,surface){this.root=new THREE.Group();this.root.name='political-territory-outlines';scene.add(this.root);this.surface=surface;this.index=[];this.key='';}
 load(features){this.index=boundaryIndex(features);this.key='';}
 clear(){for(const o of this.root.children){o.geometry.dispose();o.material.dispose();}this.root.clear();}
 sync(state,selected){
  const key=selected||'';if(key===this.key)return;this.key=key;this.clear();
  if(!selected)return;const vertices=[];
  for(const e of this.index)if(e.lands.some(l=>l.id===selected))strip(vertices,e.a,e.b,0,.105,this.surface);
  if(!vertices.length)return;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  const material=new THREE.MeshBasicMaterial({color:'#e0d5b8',side:THREE.DoubleSide,depthWrite:false,toneMapped:false,fog:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='selected-country-edge';mesh.renderOrder=2;this.root.add(mesh);
 }
}
