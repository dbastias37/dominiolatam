import {TerritoryOutlines} from './territories.js';
import {territoryReveal,revealRadius} from './occupation.js';
import {factionColor,factionName} from './factions.js';
import {flagSource} from './flags.js';
import * as THREE from './vendor/three.module.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {COUNTRIES,BY_ID,SEA_EDGES} from './data.js';
import {flag} from './flags.js';
import {incidentAt,condition,INCIDENTS} from './events.js';
import {industryDamage} from './operations.js';
import {eventSymbol} from './event-ui.js';
import {VehicleLibrary,faceForward,groundVehicle} from './vehicles.js';
import {CampaignDirector} from './cinematics.js';
import {MapNavigation,MapTapGesture,NAV_LIMITS} from './navigation.js';
import {loadResource} from './startup.js';
import {boardFrame,compactViewport} from './layout.js';

const project=(lon,lat)=>new THREE.Vector3((lon+78)*.96,0,-(lat+12)*.96);
const dome=(x,z)=>-(x*x+z*z)/640;
const surface=(lon,lat,h=1)=>{const p=project(lon,lat);p.y=dome(p.x,p.z)+h;return p;};
const mat=(color,roughness=.8)=>new THREE.MeshStandardMaterial({color,roughness,metalness:.08});
function box(group,w,h,d,x,y,z,color){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));m.position.set(x,y,z);m.castShadow=true;group.add(m);return m;}
function factory(color){const g=new THREE.Group();box(g,1.6,1.1,1.1,0,.55,0,color);box(g,.3,1.9,.3,.5,.95,-.3,'#d9d4c0');for(let x=-.5;x<=.6;x+=.5)box(g,.2,.3,.03,x,.7,.57,'#33494e');return g;}
function subdivide(a,b,c,verts){const dist=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y);if(Math.max(dist(a,b),dist(b,c),dist(c,a))>3.5){const ab=a.clone().add(b).multiplyScalar(.5),bc=b.clone().add(c).multiplyScalar(.5),ca=c.clone().add(a).multiplyScalar(.5);subdivide(a,ab,ca,verts);subdivide(ab,b,bc,verts);subdivide(ca,bc,c,verts);subdivide(ab,bc,ca,verts);return;}for(const v of [a,b,c])verts.push(v.x,dome(v.x,-v.y)+.8,-v.y);}

export class WorldMap{
 constructor(container,onSelect){
  this.vehicles=new VehicleLibrary();this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;this.container=container;this.onSelect=onSelect;this.countryGroups={};this.labels={};this.effects=[];this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.pickable=[];this.selected='CHL';this.state=null;this.quality='high';this.mode='menu';this.clock=new THREE.Clock();
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#0b2d3a');this.scene.fog=new THREE.FogExp2('#0b2d3a',.0036);
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.18;this.renderer.domElement.setAttribute('aria-label','Mapa 3D interactivo de Latinoamérica');container.appendChild(this.renderer.domElement);
  this.camera=new THREE.PerspectiveCamera(40,1,.5,700);this.camera.position.set(6,105,66);
  this.controls=new OrbitControls(this.camera,container);this.controls.target.set(0,.8,0);this.controls.enableDamping=true;this.controls.dampingFactor=.1;this.controls.minDistance=NAV_LIMITS.min;this.controls.maxDistance=NAV_LIMITS.max;this.controls.minPolarAngle=.18;this.controls.maxPolarAngle=1.05;this.controls.enablePan=true;this.controls.screenSpacePanning=false;this.controls.maxTargetRadius=Infinity;this.controls.zoomSpeed=.85;this.controls.panSpeed=1;this.controls.rotateSpeed=.6;this.controls.zoomToCursor=true;
  this.navigation=new MapNavigation(this.camera,this.controls,{reducedMotion:this.reducedMotion,dome,onChange:()=>this.onViewChange?.()});this.gesture=new MapTapGesture();this.isInteracting=false;this.navigationMode='pan';this.setNavigationMode('pan');
  this.controls.addEventListener('start',()=>{this.navigation.cancel();this.isInteracting=true;this.onInteraction?.(true);});this.controls.addEventListener('end',()=>{this.isInteracting=false;this.onInteraction?.(false);});this.controls.addEventListener('change',()=>this.onViewChange?.());

  const hemi=new THREE.HemisphereLight('#cbe5ec','#243d3d',2.5);this.scene.add(hemi);const sun=new THREE.DirectionalLight('#ffe6b6',3.8);sun.position.set(-35,65,22);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-65,right:65,top:65,bottom:-65,near:1,far:180});sun.shadow.bias=-.0005;sun.shadow.normalBias=.1;this.scene.add(sun);this.sun=sun;
  const water=new THREE.PlaneGeometry(380,380,95,95);water.rotateX(-Math.PI/2);const wpos=water.attributes.position;for(let i=0;i<wpos.count;i++)wpos.setY(i,dome(wpos.getX(i),wpos.getZ(i))-.15);water.computeVertexNormals();const ocean=new THREE.Mesh(water,new THREE.MeshStandardMaterial({color:'#103d50',roughness:.72,metalness:.2}));ocean.receiveShadow=true;this.scene.add(ocean);
  this.grid=new THREE.Group();for(let i=-140;i<=140;i+=8){for(const axis of [0,1]){const pts=[];for(let n=-145;n<=145;n+=3){const x=axis?i:n,z=axis?n:i;pts.push(new THREE.Vector3(x,dome(x,z)-.08,z));}const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#48707a',transparent:true,opacity:.16}));this.grid.add(line);}}this.scene.add(this.grid);
  this.labelLayer=document.createElement('div');this.labelLayer.className='map-labels';container.appendChild(this.labelLayer);
  this.addOceanLabel('OCÉANO PACÍFICO',-103,-16);this.addOceanLabel('OCÉANO ATLÁNTICO',-35,-22);this.addOceanLabel('MAR CARIBE',-71,16);
  this.ring=new THREE.Mesh(new THREE.RingGeometry(1.6,1.74,64),new THREE.MeshBasicMaterial({color:'#ffe3a0',side:THREE.DoubleSide,transparent:true,opacity:.9}));this.ring.rotation.x=-Math.PI/2;this.scene.add(this.ring);
  this.territories=new TerritoryOutlines(this.scene,surface);this.flying=null;this.director=new CampaignDirector(this,surface,dome);
  container.style.touchAction='none';container.addEventListener('pointerdown',e=>{this.gesture.down(e.pointerId,e.clientX,e.clientY,e.target.closest?.('[data-map-country]')?.dataset.mapCountry||null,e.button);});
  container.addEventListener('pointermove',e=>{this.gesture.move(e.pointerId,e.clientX,e.clientY);if(e.pointerType==='touch'||this.isInteracting)return;this.updatePointer(e);this.raycaster.setFromCamera(this.pointer,this.camera);container.style.cursor=this.raycaster.intersectObjects(this.pickable,false).length?'pointer':'grab';});
  container.addEventListener('pointerup',e=>{const tap=this.gesture.up(e.pointerId,e.clientX,e.clientY);if(!tap||this.director.active)return;if(tap.country)this.onSelect(tap.country);else this.pick(e);});
  container.addEventListener('pointercancel',()=>this.gesture.cancel());

  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();this.running=true;this.animate();
 }
 async load(){await this.vehicles.load();const geo=await loadResource('el mapa de Latinoamérica',async()=>{const r=await fetch('./data/region.json');if(!r.ok)throw new Error(`Mapa: HTTP ${r.status}`);return r.json();});for(const feature of geo.features)this.addCountry(feature);this.territories.load(geo.features);this.addRoutes();this.flying=this.vehicles.create('jet','CHL',1);this.flying.scale.setScalar(1.8);this.scene.add(this.flying);this.select(this.selected);return this;}
 addCountry(feature){const id=feature.properties.id,c=BY_ID[id],color=c?.color||'#526e70',group=new THREE.Group();group.userData.id=id;const top=mat(color),side=mat(new THREE.Color(color).multiplyScalar(.56));const borderMat=new THREE.LineBasicMaterial({color:c?'#e5dbc2':'#6d8381',transparent:true,opacity:c?.7:.3});
  const polys=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
  for(const poly of polys){const rings=poly.map(r=>r.slice(0,-1).map(([lon,lat])=>{const p=project(lon,lat);return new THREE.Vector2(p.x,-p.z);}));if(rings[0].length<3)continue;const triangles=THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1)),flat=rings.flat(),verts=[];for(const t of triangles)subdivide(flat[t[0]],flat[t[1]],flat[t[2]],verts);const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,top);mesh.material.side=THREE.DoubleSide;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.id=id;group.add(mesh);if(c)this.pickable.push(mesh);
   for(const ring of rings){const edges=[],sides=[];for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],parts=Math.max(1,Math.ceil(a.distanceTo(b)/2));for(let n=0;n<parts;n++){const p=a.clone().lerp(b,n/parts),q=a.clone().lerp(b,(n+1)/parts),yp=dome(p.x,-p.y),yq=dome(q.x,-q.y);edges.push(new THREE.Vector3(p.x,yp+.83,-p.y));sides.push(p.x,yp+.8,-p.y,p.x,yp-.1,-p.y,q.x,yq+.8,-q.y,q.x,yq+.8,-q.y,p.x,yp-.1,-p.y,q.x,yq-.1,-q.y);}}edges.push(edges[0]);const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(sides,3));sg.computeVertexNormals();const sm=new THREE.Mesh(sg,side);sm.material.side=THREE.DoubleSide;group.add(sm);group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(edges),borderMat));}
  }
  territoryReveal(top);territoryReveal(side);this.scene.add(group);this.countryGroups[id]={group,top,side,borderMat,unit:null,bounds:new THREE.Box3().setFromObject(group),extent:new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3())};
  if(c){const node=document.createElement('button');node.className='country-label';node.dataset.mapCountry=id;node.setAttribute('aria-label',`Seleccionar ${c.name}`);node.innerHTML=`<span class="label-name">${flag(c.id,'map-label-flag')}${c.name.toUpperCase()}</span><span class="label-controller"></span><span class="label-strength"></span><span class="label-incident"></span>`;node.addEventListener('click',e=>{e.stopPropagation();if(e.detail===0)this.onSelect(id);});this.labelLayer.appendChild(node);this.labels[id]={node,p:surface(c.lon,c.lat,2)};
   if(c.industry>0){const f=factory('#cdb67f');f.position.copy(surface(c.lon+.8,c.lat+.65,.815));f.scale.setScalar(.58);group.add(f);this.countryGroups[id].factory=f;}
   const dot=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.28,10),mat('#e6d5a6'));dot.position.copy(surface(c.lon,c.lat,1));group.add(dot);
  }
 }
 addOceanLabel(text,lon,lat){const el=document.createElement('span');el.className='ocean-label';el.textContent=text;this.labelLayer.appendChild(el);this.labels[text]={node:el,p:surface(lon,lat,.2),ocean:true};}
 addRoutes(){for(const e of SEA_EDGES){const [a,b]=e.split('-').map(id=>BY_ID[id]);const pts=[];for(let i=0;i<=40;i++){const p=surface(a.lon+(b.lon-a.lon)*i/40,a.lat+(b.lat-a.lat)*i/40,.4);pts.push(p);}const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineDashedMaterial({color:'#ceb87c',dashSize:.5,gapSize:.5,transparent:true,opacity:.45}));line.computeLineDistances();this.scene.add(line);}}
 updatePointer(e){const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);}
 pick(e){this.updatePointer(e);this.raycaster.setFromCamera(this.pointer,this.camera);const hit=this.raycaster.intersectObjects(this.pickable,false)[0];if(hit)this.onSelect(hit.object.userData.id);}
 select(id){this.selected=id;const c=BY_ID[id];if(c)this.ring.position.copy(surface(c.lon,c.lat,1.5));this.sync(this.state);}
 sync(state){this.state=state;this.vehicles.setFactions(state);this.director.sync(state);this.territories?.sync(state,this.selected);for(const c of COUNTRIES){const item=this.countryGroups[c.id];if(!item)continue;const sc=state?.countries[c.id],owner=state?.pendingOccupation?.target===c.id?state.pendingOccupation.previous:sc?.owner||c.id,base=factionColor(state,owner);this.syncUnit(c,sc,owner);item.top.userData.reveal.revealEnabled.value=0;item.side.userData.reveal.revealEnabled.value=0;if(item.factory){const damaged=!!industryDamage(state,c.id);item.factory.traverse(o=>{if(o.isMesh){o.userData.baseColor??=o.material.color.getStyle();o.material.color.set(damaged?'#55545a':o.userData.baseColor);}});}if(item.jet)item.jet.visible=(!state||!condition(state,c.id).air)&&!this.director.active?.hiddenUnits?.includes(item.jet);if(item.unit&&this.director.active?.hiddenUnits?.includes(item.unit))item.unit.visible=false;item.top.color.set(base);item.side.color.set(base).multiplyScalar(.52);item.top.emissive.set(c.id===this.selected?'#8d723c':'#000000');item.top.emissiveIntensity=c.id===this.selected?.22:0;item.borderMat.color.set(c.id===this.selected?'#fff4cd':'#102027');item.borderMat.opacity=c.id===this.selected?.95:.28;const node=this.labels[c.id]?.node;if(node){node.style.setProperty('--faction-color',base);node.title=`${c.name} · Control: ${factionName(state,owner)}`;const controller=node.querySelector('.label-controller');if(controller){const label=state&&(owner===state.player||owner!==c.id||state.campaignMode==='factions');controller.textContent=label?`${owner===state.player?'TÚ · ':''}${factionName(state,owner).toUpperCase()}`:'';controller.hidden=!label;}const incident=state?incidentAt(state,c.id):null,marker=node.querySelector('.label-incident');if(marker){const damage=industryDamage(state,c.id);marker.innerHTML=(incident?eventSymbol(incident.kind):'')+(damage?eventSymbol('industry'):'');marker.dataset.tone=damage?'warning':incident?INCIDENTS[incident.kind].tone:'';marker.title=[incident?`${INCIDENTS[incident.kind].title} · hasta ronda ${incident.until}`:'',damage?`Industria en reparación · ${damage.remaining} turnos de su dueño`:''].filter(Boolean).join(' · ');}const fi=node.querySelector('img');if(fi){const url=flagSource(owner,state);if(fi.getAttribute('src')!==url)fi.src=url;fi.alt=`Bandera de ${factionName(state,owner)}`;}node.classList.toggle('selected',c.id===this.selected);node.classList.toggle('owned',sc?.owner===state?.player);node.querySelector('.label-strength').textContent=state?`${sc.owner===state.player?'◆ ':''}${sc.troops}`:'';}}}
 setMode(mode){if(this.mode!==mode){this.mode=mode;this.resize();}}
 resize(){
  const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.fov=compactViewport(w,h)?60:40;
  const rect=selector=>{const r=document.querySelector(selector)?.getBoundingClientRect();return r?.width>0&&r?.height>0?r:null;},panel=rect('.side-panel'),top=Math.max(rect('#topbar')?.bottom||0,rect('.mobile-turn-bar')?.bottom||0,compactViewport(w,h)?rect('#mapTools')?.bottom||0:0)+8,bottom=Math.min(rect('.mobile-country-bar')?.top||h,rect('.mobile-bottom-nav')?.top||h);
  const {cx,cy}=boardFrame({width:w,height:h,mode:this.mode,hidden:document.body.classList.contains('interface-hidden'),panel,top,bottom});
  this.camera.setViewOffset(w,h,w/2-cx,h/2-cy,w,h);if(this.director?.active){this.director.active.view={...this.camera.view};this.camera.clearViewOffset();}this.camera.updateProjectionMatrix();this.onViewChange?.();
 }
 focusCountry(id,options={}){const c=BY_ID[id];if(!c)return Promise.resolve({interrupted:true});const extent=this.countryGroups[id]?.extent,size=extent?Math.max(extent.x,extent.z):15,base=THREE.MathUtils.clamp(22+size*1.3,28,74),distance=options.distance??base*(compactViewport(this.container.clientWidth,this.container.clientHeight)?1.12:1);return this.navigation.flyTo(surface(c.lon,c.lat,.8),distance,options);}
 reset(){return this.navigation.flyTo(new THREE.Vector3(0,.8,0),125,{north:true});}
 zoom(factor){return this.navigation.zoomBy(factor);}
 skipTravel(){this.navigation.finish();}
 setNavigationMode(mode){this.navigationMode=mode==='orbit'?'orbit':'pan';this.controls.mouseButtons={LEFT:this.navigationMode==='pan'?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};this.controls.touches={ONE:this.navigationMode==='pan'?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};this.onViewChange?.();}
 setQuality(low){this.renderer.setPixelRatio(low?1:Math.min(devicePixelRatio,1.75));this.renderer.shadowMap.enabled=!low;this.resize();}
 syncUnit(c,sc,owner){const item=this.countryGroups[c.id],armor=sc?.armor??c.armor,air=sc?.air??c.air,key=`${owner}:${armor}:${air}:${this.vehicles.factionKey}`;if(item.unitKey===key)return;item.unitKey=key;if(item.unit)this.vehicles.dispose(item.unit);if(item.jet)this.vehicles.dispose(item.jet);const unit=this.vehicles.create('tank',c.id,armor,owner);unit.position.copy(surface(c.lon,c.lat,1.02));unit.position.z+=.85;unit.scale.setScalar(1.5);unit.rotation.y=c.lon*.2;groundVehicle(unit,unit.position.clone(),null,dome);item.group.add(unit);item.unit=unit;
  if(air>0){const jet=this.vehicles.create('jet',c.id,air,owner);jet.position.copy(surface(c.lon+1,c.lat-.7,2.1));jet.scale.setScalar(1.5);jet.rotation.y=-Math.PI/4;item.group.add(jet);item.jet=jet;}
 }
 revealOccupation(o,progress){if(progress>=1)this.territories?.sync({...this.state,pendingOccupation:null},this.selected);const item=this.countryGroups[o.target],c=BY_ID[o.target];if(!item)return;const center=surface(c.lon,c.lat,.8);for(const [material,factor] of [[item.top,1],[item.side,.52]]){const u=material.userData.reveal;u.revealEnabled.value=1;u.revealCenter.value.set(center.x,center.z);u.revealRadius.value=revealRadius(item.bounds,center,progress);u.revealOld.value.set(factionColor(this.state,o.previous)).multiplyScalar(factor);u.revealNew.value.set(factionColor(this.state,o.owner)).multiplyScalar(factor);}}
 animateOccupation(o,onStage){return this.director.occupation(o,onStage);}
 animateBattle(b,onStage){return this.director.battle(b,onStage);}
 animateBombardment(b,onStage){return this.director.bombardment(b,onStage);}
 animateMovements(moves,onStage){return this.director.movements(moves,onStage);}
 skipAnimation(){this.director.skip();}
 vehicleName(kind,id,level){return this.vehicles.model(kind,id,level)?.name||'';}
 animate(){if(!this.running)return;requestAnimationFrame(()=>this.animate());const dt=Math.min(this.clock.getDelta(),.05),t=this.clock.elapsedTime;if(!this.director.active){this.navigation.update(dt);this.controls.update();this.navigation.constrain();}else this.controls.update();this.ring.scale.setScalar(1+Math.sin(t*2)*.08);this.ring.material.opacity=.7+Math.sin(t*2)*.25;
  if(this.flying){this.flying.visible=!this.director.active;const angle=t*.1;this.flying.position.set(18+Math.cos(angle)*13,5+Math.sin(t*.2)*.4,-7+Math.sin(angle)*10);faceForward(this.flying,new THREE.Vector3(-13*Math.sin(angle),.8*Math.cos(t*.2),10*Math.cos(angle)));}
  this.director.update(dt,t);
  const w=this.container.clientWidth,h=this.container.clientHeight,distance=this.camera.position.distanceTo(this.controls.target),compact=compactViewport(w,h),occupied=[];
  // Major labels are placed first; small countries become visible as you zoom in.
  const entries=Object.entries(this.labels).sort(([a],[b])=>(a===this.selected?-1:b===this.selected?1:((BY_ID[b]?.population||0)-(BY_ID[a]?.population||0))));
  for(const [id,l] of entries){const p=l.p.clone().project(this.camera),x=(p.x*.5+.5)*w,y=(-p.y*.5+.5)*h;let show=p.z<1&&p.z>-1&&x>8&&x<w-8&&y>30&&y<h-15;const width=l.ocean?155:Math.max(90,(BY_ID[id]?.name.length||8)*(compact?6.2:6)+32),height=this.state?58:compact?54:30;
   if(!l.ocean&&id!==this.selected){if(distance>100&&(BY_ID[id]?.population||0)<15)show=false;if(occupied.some(o=>Math.abs(x-o.x)<(width+o.width)/2+3&&Math.abs(y-o.y)<(height+o.height)/2+5))show=false;}
   if(show&&!l.ocean)occupied.push({x,y,width,height});l.node.style.transform=`translate(${x}px,${y}px) translate(-50%,-115%)`;l.node.style.display=show?'':'none';
  }
  this.renderer.render(this.scene,this.camera);
 }
}
