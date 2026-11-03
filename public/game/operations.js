import {combatPause} from './calendar.js';
import {BY_ID,neighbors} from './data.js';
import {condition,incomeMultiplier} from './events.js';

export const BOMBARD = {upgradeCost:140,cost:55,range:2,turns:2,production:.25};
export function airRoute(from,to){
 if(!BY_ID[from]||!BY_ID[to]||from===to)return null;
 const queue=[[from]],seen=new Set([from]);
 while(queue.length){const path=queue.shift();if(path.at(-1)===to)return path;if(path.length>BOMBARD.range)continue;for(const id of neighbors(path.at(-1)))if(!seen.has(id)){seen.add(id);queue.push([...path,id]);}}
 return null;
}
export const industryDamage=(s,id)=>s?.industryDamage?.[id]?.remaining>0?s.industryDamage[id]:null;
export const industrialFactor=(s,id)=>industryDamage(s,id)?BOMBARD.production:1;
export const localIncome=(s,c)=>Math.round((12+c.industry*12*industrialFactor(s,c.id))*incomeMultiplier(s,c.id));
export function bombardBlock(s,from,to,owner=s.player){
 const pause=combatPause(s);if(pause)return pause;
 const a=s.countries[from],b=s.countries[to];
 if(!a||a.owner!==owner)return 'Elige una base de tu nación.';
 if(a.air<4||!a.bombers)return 'Necesitas aviones nivel 4 y desbloquear bombarderos en esa base.';
 if(!b||b.owner===owner)return 'Elige una industria de otra nación.';
 if(!airRoute(from,to))return 'Fuera de alcance: máximo 2 pasos por fronteras o rutas marítimas.';
 if((s.treaties[[owner,b.owner].sort().join(':')]||0)>=s.turn)return 'Hay una tregua activa con esa nación.';
 if(condition(s,from).air||condition(s,to).air)return 'Viento fuerte: los bombarderos deben esperar.';
 if(condition(s,from).attackBlocked)return 'Falta combustible en la base. No pueden despegar.';
 if(a.lastBombardRound===s.turn)return 'Esta base ya bombardeó en esta ronda.';
 if(b.industry<1)return 'Este país no tiene producción industrial que detener.';
 if(industryDamage(s,to))return 'Esta industria ya está en reparación. No puedes alargar el bloqueo.';
 return null;
}
export const bomberOrigins=(s,to,owner=s.player)=>Object.values(s.countries).filter(c=>c.owner===owner&&c.air>=4&&c.bombers&&airRoute(c.id,to)).sort((a,b)=>Number(!!bombardBlock(s,a.id,to,owner))-Number(!!bombardBlock(s,b.id,to,owner)));
export function markIndustryIncome(s,owner){for(const [id,d] of Object.entries(s.industryDamage||{}))if(s.countries[id].owner===owner&&d.remaining>0){d.lastIncomeRound=s.turn;d.lastIncomeOwner=owner;}}
export function consumeIndustryTurn(s,owner){
 const recovered=[];for(const [id,d] of Object.entries(s.industryDamage||{}))if(d.lastIncomeOwner===owner&&d.lastIncomeRound===s.turn){delete d.lastIncomeRound;delete d.lastIncomeOwner;if(--d.remaining<=0){delete s.industryDamage[id];recovered.push(id);}}
 return recovered;
}
export function validateOperations(s){
 if(s.industryDamage!==undefined&&(!s.industryDamage||Array.isArray(s.industryDamage)||typeof s.industryDamage!=='object'))return false;
 return Object.entries(s.industryDamage||{}).every(([id,d])=>BY_ID[id]&&d&&Number.isInteger(d.remaining)&&d.remaining>=1&&d.remaining<=BOMBARD.turns&&BY_ID[d.attacker]&&Number.isInteger(d.appliedRound)&&d.appliedRound>=1&&d.appliedRound<=s.turn&&(d.lastIncomeRound===undefined||Number.isInteger(d.lastIncomeRound)&&d.lastIncomeRound<=s.turn&&!!BY_ID[d.lastIncomeOwner]))&&Object.values(s.countries).every(c=>(c.bombers===undefined||typeof c.bombers==='boolean'&&(!c.bombers||c.air===4))&&(c.lastBombardRound===undefined||Number.isInteger(c.lastBombardRound)&&c.lastBombardRound>=0&&c.lastBombardRound<=s.turn));
}
