import {worldEffect,combatPause} from './calendar.js';
import {COUNTRIES,BY_ID,neighbors,SEA_EDGES} from './data.js';

// Fictional, local, temporary conditions. Player and AI query the same rules.
export const INCIDENTS={
 rain:{title:'Lluvias intensas',icon:'rain',tone:'warning',duration:1,effect:'Los convoyes no entran ni salen. Defensa +10%.',advice:'Espera a que abran los caminos o refuerza otra zona.',move:true,entry:true,defense:1.1},
 wind:{title:'Viento fuerte',icon:'wind',tone:'warning',duration:1,effect:'Aviones en tierra. Sin ataques lejanos ni cruces aéreos.',advice:'Puedes atacar por tierra, mejorar o negociar.',air:true},
 fuel:{title:'Falta combustible',icon:'fuel',tone:'warning',duration:1,effect:'No puede iniciar ataques ni sacar convoyes.',advice:'Puedes reclutar, defender o negociar mientras llega combustible.',attackBlocked:true,move:true},
 food:{title:'Escasez de alimentos',icon:'food',tone:'warning',duration:2,effect:'Recluta la mitad de las unidades habituales.',advice:'Envía refuerzos desde otro país o mejora sus defensas.',recruit:.5},
 industry:{title:'Falla en las fábricas',icon:'factory',tone:'warning',duration:1,effect:'Ingresos locales a la mitad. Industria en pausa.',advice:'Mejora tus tropas o comercia para conseguir créditos.',income:.5,blocked:['industry']},
 materials:{title:'Faltan materias primas',icon:'materials',tone:'warning',duration:2,effect:'No puede mejorar tanques ni aviones.',advice:'Puedes reclutar, mejorar industria o negociar.',blocked:['armor','air']},
 harvest:{title:'Cosecha abundante',icon:'food',tone:'good',duration:2,effect:'Recluta un 50% más de unidades.',advice:'Es un buen momento para reunir refuerzos.',recruit:1.5},
 production:{title:'Industria en auge',icon:'factory',tone:'good',duration:2,effect:'Ingresos +50%. Reclutamiento +25%.',advice:'Aprovecha los recursos para fortalecer tu nación.',income:1.5,recruit:1.25},
 clear:{title:'Tiempo favorable',icon:'sun',tone:'good',duration:1,effect:'Fuerza de ataque +10% desde este país.',advice:'Revisa tus posibilidades antes de decidir si atacar.',attack:1.1}
};
export const eventState=(seed,lastRound=0)=>({incidents:[],incidentHistory:[],incidentBag:[],incidentSeed:(seed^0x9e3779b9)>>>0,incidentCounter:0,lastIncidentRound:lastRound,incidentCooldown:{}});
export const activeIncidents=s=>(s.incidents||[]).filter(e=>e.start<=s.turn&&e.until>=s.turn);
export const incidentAt=(s,id)=>activeIncidents(s).find(e=>e.target===id)||null;
export const condition=(s,id)=>INCIDENTS[incidentAt(s,id)?.kind]||{};
export const incidentDuration=e=>e.until===e.start?'1 ronda':`${e.until-e.start+1} rondas`;
export const incidentTime=(s,e)=>e.until<s.turn?'Ya terminó':`Hasta el final de la ronda ${e.until}`;
export const recruitAmount=(s,id,base=24)=>Math.max(1,Math.round(base*(condition(s,id).recruit||1)*(worldEffect(s).recruit||1)));
export const incomeMultiplier=(s,id)=>(condition(s,id).income||1)*(worldEffect(s).income||1);
export const isSeaLink=(a,b)=>SEA_EDGES.some(k=>{const [x,y]=k.split('-');return (a===x&&b===y)||(a===y&&b===x);});
const block=(s,id)=>{const event=incidentAt(s,id),def=INCIDENTS[event?.kind];return event?{event,reason:`${BY_ID[id].name}: ${def.title.toLowerCase()}. ${incidentTime(s,event)}.`,advice:def.advice}:null;};
export function movementBlock(s,from,to){
 if(condition(s,from).move)return block(s,from);
 if(condition(s,to).entry)return block(s,to);
 if(isSeaLink(from,to)){if(condition(s,from).air)return block(s,from);if(condition(s,to).air)return block(s,to);}
 return null;
}
export function attackBlock(s,from,to){
 const pause=combatPause(s);if(pause)return {event:null,reason:pause,advice:'Recluta, mejora tus países o mueve refuerzos.'};
 if(condition(s,from).attackBlocked)return block(s,from);
 if(!neighbors(from).includes(to)||isSeaLink(from,to)){if(condition(s,from).air)return block(s,from);if(condition(s,to).air)return block(s,to);}
 return null;
}
export const upgradeBlock=(s,type,id)=>condition(s,id).blocked?.includes(type)?block(s,id):null;
export function routeBlock(s,route){if(!route)return null;for(let i=1;i<route.length;i++){const b=movementBlock(s,route[i-1],route[i]);if(b)return b;}return null;}
function eventRandom(s){s.incidentSeed=(Math.imul(s.incidentSeed,1664525)+1013904223)>>>0;return s.incidentSeed/4294967296;}
function refill(s){s.incidentBag=COUNTRIES.map(c=>c.id);for(let i=s.incidentBag.length-1;i>0;i--){const j=Math.floor(eventRandom(s)*(i+1));[s.incidentBag[i],s.incidentBag[j]]=[s.incidentBag[j],s.incidentBag[i]];}}
export function addIncident(s,target,kind){
 if(!BY_ID[target]||!INCIDENTS[kind]||incidentAt(s,target))return null;
 const def=INCIDENTS[kind],e={id:++s.incidentCounter,target,kind,start:s.turn,until:s.turn+def.duration-1,ownerAtStart:s.countries[target].owner};
 s.incidents.push(e);s.incidentHistory.unshift({...e,status:'active'});s.incidentHistory=s.incidentHistory.slice(0,180);s.incidentCooldown[target]=e.until+2;return e;
}
export function advanceIncidents(s){
 if(s.lastIncidentRound>=s.turn)return {started:[],ended:[]};s.lastIncidentRound=s.turn;
 const ended=s.incidents.filter(e=>e.until<s.turn);s.incidents=s.incidents.filter(e=>e.until>=s.turn);
 for(const e of ended){const h=s.incidentHistory.find(x=>x.id===e.id);if(h){h.status='ended';h.endedRound=s.turn;}}
 const started=[],kinds=Object.keys(INCIDENTS);for(let tries=0;tries<40&&started.length<3;tries++){
  if(!s.incidentBag.length)refill(s);const id=s.incidentBag.pop();
  if(incidentAt(s,id)||(s.incidentCooldown[id]||0)>s.turn){s.incidentBag.unshift(id);continue;}
  const e=addIncident(s,id,kinds[Math.floor(eventRandom(s)*kinds.length)]);if(e)started.push(e);
 }
 return {started,ended};
}
export function validateIncidents(s){
 if(!Array.isArray(s.incidents)||!Array.isArray(s.incidentHistory)||!Array.isArray(s.incidentBag)||!s.incidentCooldown||!Number.isInteger(s.incidentSeed)||s.incidentSeed<0||s.incidentSeed>4294967295||!Number.isInteger(s.incidentCounter)||s.incidentCounter<0||!Number.isInteger(s.lastIncidentRound)||s.lastIncidentRound<0||s.lastIncidentRound>s.turn)return false;
 const valid=e=>e&&Number.isInteger(e.id)&&e.id>0&&e.id<=s.incidentCounter&&BY_ID[e.target]&&BY_ID[e.ownerAtStart]&&INCIDENTS[e.kind]&&Number.isInteger(e.start)&&e.start>=1&&e.start<=s.turn&&Number.isInteger(e.until)&&e.until===e.start+INCIDENTS[e.kind].duration-1;
 if(s.incidents.some(e=>!valid(e)||e.until<s.turn)||s.incidentHistory.some(e=>!valid(e)||!['active','ended'].includes(e.status)))return false;
 if(new Set(s.incidents.map(e=>e.target)).size!==s.incidents.length||new Set(s.incidents.map(e=>e.id)).size!==s.incidents.length)return false;
 if(s.incidents.some(e=>!s.incidentHistory.some(h=>h.id===e.id&&h.target===e.target&&h.kind===e.kind&&h.start===e.start&&h.until===e.until&&h.status==='active')))return false;
 if(s.incidentBag.some(id=>!BY_ID[id])||new Set(s.incidentBag).size!==s.incidentBag.length)return false;
 if(Object.entries(s.incidentCooldown).some(([id,n])=>!BY_ID[id]||!Number.isInteger(n)||n<1))return false;
 return true;
}
