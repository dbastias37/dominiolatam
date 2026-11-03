import * as THREE from './vendor/three.module.js';
export function levelFlight(points,{returnHome=false,altitude=7}={}){
 const nodes=points.map(p=>new THREE.Vector3(p.x,altitude,p.z)),from=nodes[0],to=nodes.at(-1),direction=to.clone().sub(nodes.at(-2)||from).setY(0).normalize(),side=new THREE.Vector3(-direction.z,0,direction.x);
 if(returnHome){const turn=Math.max(3,Math.min(8,from.distanceTo(to)*.25));nodes.push(to.clone().addScaledVector(direction,turn),to.clone().addScaledVector(direction,turn).addScaledVector(side,turn),to.clone().addScaledVector(side,turn*1.7),from.clone().addScaledVector(side,turn*1.7),from.clone());}
 else if(nodes.length===2)nodes.splice(1,0,from.clone().lerp(to,.5));
 return new THREE.CatmullRomCurve3(nodes,false,'centripetal');
}
export function returnFlight(from,to,incoming,altitude=7){const d=incoming.clone().setY(0).normalize(),side=new THREE.Vector3(-d.z,0,d.x),a=from.clone().setY(altitude),b=to.clone().setY(altitude);return new THREE.CatmullRomCurve3([a,a.clone().addScaledVector(d,5),a.clone().addScaledVector(d,7).addScaledVector(side,6),a.clone().addScaledVector(side,10),b.clone().addScaledVector(side,7),b],false,'centripetal');}
