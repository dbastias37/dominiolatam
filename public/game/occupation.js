import * as THREE from './vendor/three.module.js';
// The reveal runs on the country's own meshes, so color never spills over a border.
export function territoryReveal(material){
 // Preserve political hue under bright warm lights; keep bounded light/shadow relief.
 material.toneMapped=false;material.fog=false;material.roughness=1;material.metalness=0;
 const uniforms={revealEnabled:{value:0},revealCenter:{value:new THREE.Vector2()},revealRadius:{value:-1},revealOld:{value:new THREE.Color()},revealNew:{value:new THREE.Color()}};
 material.userData.reveal=uniforms;
 material.onBeforeCompile=shader=>{Object.assign(shader.uniforms,uniforms);shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 territoryXZ;').replace('#include <begin_vertex>','#include <begin_vertex>\nterritoryXZ = position.xz;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 territoryXZ;\nuniform float revealEnabled;\nuniform vec2 revealCenter;\nuniform float revealRadius;\nuniform vec3 revealOld;\nuniform vec3 revealNew;').replace('#include <color_fragment>','#include <color_fragment>\nif(revealEnabled > 0.5){float cover = 1.0 - smoothstep(revealRadius - 0.5, revealRadius + 0.5, distance(territoryXZ, revealCenter));diffuseColor.rgb = mix(revealOld, revealNew, cover);}').replace('#include <opaque_fragment>','float territoryLight = clamp(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)) / max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.001), 0.58, 1.03);\noutgoingLight = diffuseColor.rgb * territoryLight;\n#include <opaque_fragment>');};
 material.customProgramCacheKey=()=> 'political-territory-v2';return uniforms;
}
export function revealRadius(bounds,center,progress){const radius=Math.max(...[bounds.min.x,bounds.max.x].flatMap(x=>[bounds.min.z,bounds.max.z].map(z=>Math.hypot(x-center.x,z-center.z))));return -.6+(radius+1.2)*Math.max(0,Math.min(1,progress));}
