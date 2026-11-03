import * as THREE from './vendor/three.module.js';
let smokeMap;
// Noise with a soft irregular boundary. Shared by weather, impacts and repairs.
export function smokeTexture(){
 if(smokeMap)return smokeMap;const size=96,data=new Uint8Array(size*size*4),hash=(x,y)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);},smooth=x=>x*x*(3-2*x);
 const noise=(x,y)=>{const a=Math.floor(x),b=Math.floor(y),u=smooth(x-a),v=smooth(y-b);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(a,b),hash(a+1,b),u),THREE.MathUtils.lerp(hash(a,b+1),hash(a+1,b+1),u),v);};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const nx=(x/(size-1)-.5)*2,ny=(y/(size-1)-.5)*2,r=Math.hypot(nx,ny),n=.55*noise(x/18,y/18)+.3*noise(x/8+7,y/8)+.15*noise(x/3,y/3+5),edge=Math.max(0,1-r),a=Math.pow(edge,1.35)*Math.max(0,n-.18)*2.8,i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=230+Math.round(n*25);data[i+3]=Math.min(255,Math.round(a*255));}
 smokeMap=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);smokeMap.needsUpdate=true;smokeMap.magFilter=THREE.LinearFilter;smokeMap.minFilter=THREE.LinearFilter;return smokeMap;
}
export function smokePuff(color='#939da5',opacity=.6,size=1){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:smokeTexture(),color,transparent:true,opacity,depthWrite:false,rotation:0}));sprite.scale.set(size,size,1);sprite.userData={effectResource:true,preserveGeometry:true};return sprite;}
