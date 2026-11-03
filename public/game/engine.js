import {calendarState,advanceCalendar,WORLD_NEWS,worldHeadline,combatPause,preparingFactions,validateCalendar} from './calendar.js';
import {setupFactions,factionName,validateFactions} from './factions.js';
import {COUNTRIES, BY_ID, neighbors} from './data.js';
import {INCIDENTS,eventState,incidentAt,condition,recruitAmount,incomeMultiplier,attackBlock,movementBlock,upgradeBlock,routeBlock,advanceIncidents,validateIncidents} from './events.js';
import {BOMBARD,airRoute,industryDamage,industrialFactor,localIncome,bombardBlock,markIndustryIncome,consumeIndustryTurn,validateOperations} from './operations.js';
export const SAVE_KEY = 'dominio-campaign-v1'; // Preserve the existing save slot.
export const SAVE_BACKUP_KEY = 'dominio-campaign-before-events-v4';
export const LEVELS = {explorer:{label:'Explorador',ai:.13,boost:24},normal:{label:'Estratega',ai:.28,boost:14},hard:{label:'Comandante',ai:.47,boost:4}};
export const UPGRADE = {recruit:{name:'Reclutar',cost:40},armor:{name:'Blindados',cost:65},air:{name:'Aviones',cost:80},industry:{name:'Industria',cost:60},fort:{name:'Defensa',cost:45}};
export const power = (c, defense=false) => Math.round(c.troops*(1+.28*c.armor+.35*c.air)*(defense?1+.2*c.fort:1));
export const income = c => 12+c.industry*12;
export const countryIncome=localIncome;
export function effectivePower(s,c,defense=false){const air=condition(s,c.id).air?0:c.air;return Math.round(power({...c,air},defense)*(defense?(condition(s,c.id).defense||1):(condition(s,c.id).attack||1)));}
export const owned = s => Object.values(s.countries).filter(c=>c.owner===s.player);
export const activeFactions = s => [...new Set(Object.values(s.countries).map(c=>c.owner))];
export const factionPower = (s,id) => Object.values(s.countries).filter(c=>c.owner===id).reduce((sum,c)=>sum+effectivePower(s,c,true),0);
export const currentFaction = s => s.turnOrder[s.turnIndex]?.id || null;
export const isPlayerTurn = s => s.status==='playing' && s.phase==='player' && currentFaction(s)===s.player;
export const totalIncome = s => owned(s).reduce((n,c)=>n+countryIncome(s,c),0)+Object.values(s.countries).filter(c=>c.owner!==s.player&&c.trade>=s.turn).length*12;
const pair=(a,b)=>[a,b].sort().join(':');
export const treatyUntil=(s,a,b)=>s.treaties[pair(a,b)]||0;
export const atWar=(s,a,b)=>s.wars.includes(pair(a,b));
export const liveWars=s=>s.wars.filter(k=>k.split(':').every(id=>activeFactions(s).includes(id)));
export function friendlyRoute(s,source,target,owner=s.player){
 if(!s.countries[source]||!s.countries[target]||s.countries[source].owner!==owner||s.countries[target].owner!==owner)return null;
 for(const openOnly of [true,false]){const queue=[[source]],seen=new Set([source]);while(queue.length){const route=queue.shift(),last=route.at(-1);if(last===target)return route;for(const id of neighbors(last))if(!seen.has(id)&&s.countries[id].owner===owner&&(!openOnly||!movementBlock(s,last,id))){seen.add(id);queue.push([...route,id]);}}}return null;
}
export const transferOrigins=(s,target)=>owned(s).filter(c=>c.id!==target&&c.troops>=16&&friendlyRoute(s,c.id,target));
export function beginBattle(s){if(!s.pendingBattle)return false;s.pendingBattle.stage='animation';return true;}
export function finishBattle(s){
 const b=s.pendingBattle;if(!b)return false;s.pendingBattle=null;
 // Old saves already applied the outcome. New operations commit exactly once here.
 if(!b.resolution)return true;
 const r=b.resolution;for(const [id,c] of Object.entries(r.countries))s.countries[id]=structuredClone(c);
 if(r.damage){s.industryDamage??={};s.industryDamage[b.target]=structuredClone(r.damage);}
 s.cash+=r.reward||0;s.stats.battles+=r.conquests||0;
 const n=r.notice,notice=notify(s,n.kind,n.title,n.text,{actor:b.attacker,target:b.target,icon:n.icon,value:n.value});addLog(s,`${n.title} ${n.text} ${n.value||''}`,n.kind,b.attacker);
 const update=report=>{if(!report||report.faction!==b.attacker)return;const row=report.actions.find(a=>a.pendingOperation);if(row){row.text=r.reportText;delete row.pendingOperation;}if(b.type!=='bombard'&&b.won)report.changes.push({source:b.source,target:b.target,owner:b.attacker});};
 update(s.aiReport);update(s.rivalTurns.at(-1));
 if(b.type!=='bombard'&&b.won){s.pendingOccupation={source:b.source,target:b.target,owner:b.attacker,previous:b.defender,armor:r.countries[b.target].armor,air:r.countries[b.target].air,noticeId:notice.id};eliminated(s,b.defender);}
 checkEnd(s);return true;
}
export function offerBattleTruce(s){
 const b=s.pendingBattle;if(!b||b.stage==='animation'||b.defender!==s.player||!b.resolution)return {error:'No hay una tregua pendiente para ofrecer.'};
 if(s.cash<35)return {error:'Necesitas 35 créditos para el acuerdo.'};
 s.cash-=35;s.pendingBattle=null;setPeace(s,b.attacker,b.defender);
 for(const r of [s.aiReport,s.rivalTurns.at(-1)]){const row=r?.actions.find(a=>a.pendingOperation);if(row){row.text='Aceptó una tregua. La operación se canceló.';delete row.pendingOperation;}}
 notify(s,'peace','¡Combate evitado!',`${factionName(s,b.attacker)} y ${factionName(s,b.defender)} acuerdan una tregua. Las unidades permanecen en sus bases.`,{actor:s.player,target:b.attacker,icon:'peace',value:`−35 créditos · hasta el final de la ronda ${s.turn+4}`});addLog(s,`Tregua antes del combate entre ${factionName(s,b.attacker)} y ${factionName(s,b.defender)}.`,'peace',s.player);return {ok:true};
}
function finishIndustryTurn(s,faction){for(const id of consumeIndustryTurn(s,faction)){notify(s,'repair','Industria reparada',`${BY_ID[id].name} vuelve a producir con normalidad.`,{actor:s.countries[id].owner,target:id,icon:'factory',value:'Sin gastar acciones'});addLog(s,`${BY_ID[id].name}: terminó la reparación industrial.`,'industry',faction);}}

export function finishOccupation(s){s.pendingOccupation=null;}
export function finishMovements(s){s.movements=[];}
function recordBattle(s,source,target,before,won,resolution,type='battle',route=null){const a=before[source],d=before[target];s.pendingBattle={type,stage:a.owner===s.player?'animation':'briefing',source,target,route,attacker:a.owner,defender:d.owner,attacking:structuredClone(a),defending:structuredClone(d),won,beforeCountries:before,attackingAir:!condition(s,source).air,defendingAir:!condition(s,target).air,resolution};s.countries=before;}
function prepareBombardment(s,source,target){
 const before=structuredClone(s.countries),a=s.countries[source],b=s.countries[target];declareWar(s,a.owner,b.owner);a.lastBombardRound=s.turn;
 const notice={kind:b.owner===s.player?'danger':'bombard',title:'Industria dañada',text:`${BY_ID[target].name} produce un 75% menos en sus fábricas durante sus próximos 2 turnos. El territorio y las tropas no cambian.`,icon:'factory',value:`Ingresos básicos intactos · reparación automática`};
 recordBattle(s,source,target,before,true,{countries:{[source]:structuredClone(a),[target]:structuredClone(b)},damage:{remaining:BOMBARD.turns,attacker:a.owner,appliedRound:s.turn},notice,reportText:`Bombardeó la industria de ${BY_ID[target].name}`},'bombard',airRoute(source,target));
}

function moveConvoys(s){
 const keep=[];
 for(const t of s.transfers){
  if(t.owner!==s.player||t.lastMovedRound>=s.turn){keep.push(t);continue;}
  const here=t.route[t.step],next=t.route[t.step+1];
  if(s.countries[here].owner!==t.owner){notify(s,'danger','Convoy detenido',`Perdiste ${BY_ID[here].name}. El convoy de ${t.troops} unidades se dispersó.`,{actor:t.owner,target:here,icon:'troops'});addLog(s,`Convoy detenido en ${BY_ID[here].name}: ${t.troops} unidades perdidas.`,'danger',t.owner);continue;}
  if(s.countries[next].owner!==t.owner){s.countries[here].troops+=t.troops;notify(s,'route','Camino cortado',`Tus ${t.troops} refuerzos se quedan en ${BY_ID[here].name}. Elige otra ruta.`,{actor:t.owner,target:here,icon:'shield'});addLog(s,`Camino cortado. Refuerzos en ${BY_ID[here].name}.`,'route',t.owner);continue;}
  const held=movementBlock(s,here,next);if(held){t.lastMovedRound=s.turn;t.pausedBy=held.event.id;keep.push(t);notify(s,'decision','Convoy en espera',`${t.troops} unidades esperan en ${BY_ID[here].name}. ${held.reason}`,{actor:t.owner,target:held.event.target,icon:'pause',value:'Avanzará solo cuando termine el bloqueo',details:{incident:structuredClone(held.event),stage:'decision',decision:'Movimiento aplazado. No pierde unidades ni gasta acciones.',advice:'Puedes esperar o cancelar el convoy desde Refuerzos.'}});addLog(s,`Convoy en espera en ${BY_ID[here].name}. ${held.reason}`,'route',t.owner);continue;}
  delete t.pausedBy;t.step++;t.lastMovedRound=s.turn;s.movements.push({transferId:t.id,source:here,target:next,owner:t.owner,troops:t.troops,armor:t.armor,air:t.air,sea:!isLandRoute(here,next)});
  const left=t.route.length-1-t.step,arrived=left===0;
  if(arrived)s.countries[next].troops+=t.troops;else keep.push(t);
  const text=arrived?`${t.troops} unidades llegaron a ${BY_ID[next].name}.`:`Pasaron a ${BY_ID[next].name}. Faltan ${left} ${left===1?'turno':'turnos'}.`;
  notify(s,'route',arrived?'¡Llegaron los refuerzos!':'Refuerzos en camino',text,{actor:t.owner,target:next,icon:'troops',value:arrived?'Listos para jugar':`${t.step} / ${t.route.length-1} pasos`,important:arrived});addLog(s,text,'route',t.owner);
 }s.transfers=keep;
}
const isLandRoute=(a,b)=>!['MEX-CUB','CUB-HTI','DOM-VEN'].some(k=>k.split('-').includes(a)&&k.split('-').includes(b));
function updateWorld(s){
 const global=advanceCalendar(s);
 if(global.ended){const d=WORLD_NEWS[global.ended.kind];notify(s,'calendar',global.ended.kind==='peace'?'Termina la paz mundial':'Fin del suceso mundial',global.ended.kind==='peace'?'Los conflictos pueden continuar. Las mejoras realizadas se conservan.':`Terminó «${d.title}». Los valores vuelven a la normalidad.`,{actor:null,icon:d.icon,value:'Calendario de campaña'});}
 if(global.started){const d=WORLD_NEWS[global.started.kind];notify(s,'calendar',d.title,worldHeadline(global.started),{actor:null,icon:d.icon,value:`${d.effect} ${d.advice}`});addLog(s,`${d.title}. ${worldHeadline(global.started)} ${d.effect}`,'calendar',null);}
 if(s.campaignMode==='factions'&&s.turn===5){notify(s,'calendar','Comienza la confrontación final','Las facciones han cerrado sus pactos. Ahora pueden enfrentarse por el continente; las treguas y la paz mundial siguen vigentes.',{actor:null,icon:'flag',value:'Las fusiones se cierran · ataques habilitados'});}

 const {started,ended}=advanceIncidents(s);s.worldEvent=null;
 for(const [list,stage] of [[ended,'end'],[started,'start']])for(const e of list){const def=INCIDENTS[e.kind],ending=stage==='end',country=BY_ID[e.target],text=ending?`${country.name} vuelve a la normalidad. ${def.tone==='good'?'Terminó la bonificación.':'Se levantó la restricción.'}`:`${country.name}: ${def.effect}`;
  notify(s,ending?'incidentEnd':'incidentStart',ending?`Terminó: ${def.title.toLowerCase()}`:def.title,text,{actor:s.countries[e.target].owner,target:e.target,icon:def.icon,value:ending?'Suceso finalizado':`Hasta el final de la ronda ${e.until}`,details:{incident:structuredClone(e),stage}});addLog(s,`${ending?'Finalizó':'Comenzó'} ${def.title.toLowerCase()} en ${country.name}. ${ending?'Vuelve a la normalidad.':def.effect}`,'incident',e.target);
 }
}
export function cancelTransfer(s,id){
 if(!isPlayerTurn(s)||s.pendingBattle||s.event||s.inbox.length)return {error:'Espera a tu turno y lee los avisos.'};
 const t=s.transfers.find(x=>x.id===Number(id)&&x.owner===s.player);if(!t)return {error:'Este convoy ya terminó.'};const here=t.route[t.step];if(s.countries[here].owner!==s.player)return {error:'Ese país ya no te pertenece.'};
 s.countries[here].troops+=t.troops;s.transfers=s.transfers.filter(x=>x!==t);notify(s,'route','Convoy cancelado',`${t.troops} unidades se quedan en ${BY_ID[here].name}.`,{actor:s.player,target:here,icon:'troops',value:'Sin gastar acciones'});addLog(s,`Convoy cancelado. ${t.troops} unidades en ${BY_ID[here].name}.`,'route',s.player);return {ok:true};
}
export const weatherDefense=(s,id)=>s.worldEvent?.round===s.turn&&s.worldEvent.kind==='rain'&&s.worldEvent.target===id?1.1:1;
export const weatherAttack=(s,id)=>s.worldEvent?.round===s.turn&&s.worldEvent.kind==='wind'&&s.worldEvent.target===id&&s.countries[id].air>0?.9:1;
export const random=s=>{s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;};
export function addLog(s,text,kind='info',actor=currentFaction(s)){s.log.unshift({turn:s.turn,text,kind,actor});s.log=s.log.slice(0,180);}
export function notify(s,kind,title,text,{actor=currentFaction(s),target=null,icon='flag',value='',important=true,details=null}={}){
 const n={id:++s.noticeCounter,round:s.turn,kind,title,text,actor,target,icon,value,important,read:false,details};
 s.notifications.push(n);s.inbox.push(n.id);if(s.notifications.length>300){const first=s.notifications.findIndex(x=>x.read);if(first>=0)s.notifications.splice(first,1);}
 return n;
}
export const pendingNotices=s=>s.inbox.map(id=>s.notifications.find(n=>n.id===id)).filter(Boolean);
export function acknowledge(s,ids=s.inbox.slice(0,1)){const set=new Set(ids);for(const n of s.notifications)if(set.has(n.id))n.read=true;s.inbox=s.inbox.filter(id=>!set.has(id));}
export function createGame(player='CHL',difficulty='explorer',seed=Date.now()>>>0,options={}){
 if(!BY_ID[player]||!LEVELS[difficulty])throw new Error('Configuración inválida');
 const game={version:4,calendar:calendarState(0,seed),campaignMode:'classic',pendingOccupation:null,fastForward:false,skipDeferred:[],...eventState(seed),transfers:[],transferCounter:0,movements:[],worldNews:[],worldEvent:null,pendingBattle:null,industryDamage:{},player,difficulty,seed:seed>>>0,turn:1,ap:0,cash:230,status:'playing',phase:'draw',turnOrder:[],turnIndex:0,starter:null,tieOrder:[],lastIncomeRound:0,lastEventRound:0,aiReport:null,rivalTurns:[],spent:[],notifications:[],noticeCounter:0,inbox:[],wars:[],treaties:{},countries:Object.fromEntries(COUNTRIES.map(c=>[c.id,{id:c.id,owner:c.id,troops:c.troops+(c.id===player?LEVELS[difficulty].boost:0),armor:c.armor,air:c.air,industry:c.industry,fort:0,relation:20,truce:0,trade:0,traded:0}])),log:[],stats:{battles:0,agreements:0,investments:0},event:null};if(options.mode==='factions')setupFactions(game,options);return game;
}
function makeOrder(s,first=null){
 const order=activeFactions(s).map(id=>({id,power:factionPower(s,id)}));
 order.sort((a,b)=>a.power-b.power || s.tieOrder.indexOf(a.id)-s.tieOrder.indexOf(b.id));
 if(first){const i=order.findIndex(x=>x.id===first);if(i>=0)order.unshift(...order.splice(i,1));}
 s.turnOrder=order;s.turnIndex=0;
}
export function drawFirst(s){
 if(s.phase!=='draw'||s.status!=='playing')return {error:'El sorteo ya terminó.'};
 const candidates=activeFactions(s);s.starter=candidates[Math.floor(random(s)*candidates.length)];
 s.tieOrder=COUNTRIES.map(c=>c.id);
 for(let i=s.tieOrder.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[s.tieOrder[i],s.tieOrder[j]]=[s.tieOrder[j],s.tieOrder[i]];}
 makeOrder(s,s.starter);s.phase='ready';addLog(s,`${factionName(s,s.starter)} abre la partida. Luego: de menor a mayor poder.`,'initiative',s.starter);
 return {ok:true,first:s.starter,order:s.turnOrder};
}
export function beginCampaign(s){if(s.phase!=='ready')return {error:'Primero gira la ruleta.'};updateWorld(s);enterTurn(s);return {ok:true};}
export function storeOnlineAccount(s){
 if(!s.multiplayer)return;
 s.accounts[s.player]={cash:s.cash,stats:structuredClone(s.stats),lastIncomeRound:s.lastIncomeRound,lastEventRound:s.lastEventRound,diplomacy:Object.fromEntries(Object.entries(s.countries).map(([id,c])=>[id,{relation:c.relation,trade:c.trade,traded:c.traded,truce:c.truce}]))};
}
function enterTurn(s){
 if(s.multiplayer)storeOnlineAccount(s);
 const alive=activeFactions(s);
 while(s.turnIndex<s.turnOrder.length&&!alive.includes(currentFaction(s)))s.turnIndex++;
 if(s.turnIndex>=s.turnOrder.length){newRound(s);return;}
 s.aiReport=null;
 if(s.multiplayer){
  s.player=currentFaction(s);const a=s.accounts[s.player];
  s.cash=a.cash;s.stats=structuredClone(a.stats);s.lastIncomeRound=a.lastIncomeRound;s.lastEventRound=a.lastEventRound;
  for(const [id,c] of Object.entries(s.countries))Object.assign(c,a.diplomacy[id]);
 }
 if(currentFaction(s)!==s.player){s.phase='ai';s.ap=0;return;}
 s.phase='player';s.ap=3;s.spent=[];
 if(s.lastIncomeRound<s.turn){moveConvoys(s);const earned=s.turn===1?0:totalIncome(s);s.cash+=earned;if(s.turn>1)markIndustryIncome(s,s.player);s.lastIncomeRound=s.turn;notify(s,'yourturn','¡Tu turno!',earned?`Recibiste ${earned} créditos. Elige 3 acciones.`:'Elige 3 acciones. Puedes mejorar sin atacar.',{actor:s.player,icon:'flag',value:earned?`+${earned} créditos`:'3 acciones'});addLog(s,`Tu turno. ${earned?`+${earned} créditos. `:''}3 acciones disponibles.`,'income',s.player);}
 if(s.turn%5===0&&s.lastEventRound<s.turn){s.lastEventRound=s.turn;s.event=(s.turn/5)%2===1?{title:'¡Llegó una feria!',text:'Elige un regalo para tu nación.',options:[{label:'+80 créditos',cash:80},{label:'+15 confianza con todos',relation:15}]}:{title:'¡Una nueva idea!',text:'Elige cómo mejorar tu nación.',options:[{label:'+18 unidades en cada país',troops:18},{label:'+100 créditos',cash:100}]};}
}
function newRound(s){
 s.turn++;
 for(const [key,until] of Object.entries(s.treaties))if(until<s.turn){const [a,b]=key.split(':');delete s.treaties[key];notify(s,'expired','Terminó una tregua',`${factionName(s,a)} y ${factionName(s,b)} pueden volver a enfrentarse.`,{actor:a,target:b,icon:'peace'});addLog(s,`Terminó la tregua entre ${factionName(s,a)} y ${factionName(s,b)}.`,'peace',a);}
 const expired=Object.values(s.countries).filter(c=>c.owner!==s.player&&c.trade>0&&c.trade<s.turn);
 for(const c of expired){c.trade=0;notify(s,'expired','Comercio finalizado',`Puedes renovar el acuerdo con ${BY_ID[c.id].name}.`,{actor:s.player,target:c.id,icon:'trade'});}
 updateWorld(s);makeOrder(s);enterTurn(s);
}
export function checkEnd(s){if(s.multiplayer){const alive=activeFactions(s);if(alive.length===1){s.winner=alive[0];s.status='won';s.phase='over';s.ap=0;}return s.status;}const n=owned(s).length;if(n===20)s.status='won';if(n===0)s.status='lost';if(s.status!=='playing'){s.phase='over';s.ap=0;}return s.status;}
export const cost=(s,type,id)=>UPGRADE[type]?UPGRADE[type].cost+(type==='recruit'?0:s.countries[id][type]*20):({attack:25,talk:25,peace:35,join:80,trade:0,transfer:0,bombers:BOMBARD.upgradeCost,bombard:BOMBARD.cost}[type]??0);
export const sourcesFor=(s,id)=>owned(s).filter(c=>c.id!==id&&(neighbors(c.id).includes(id)||c.air>=2)).sort((a,b)=>Number(!!attackBlock(s,a.id,id))-Number(!!attackBlock(s,b.id,id))||effectivePower(s,b)-effectivePower(s,a));
export function forecast(s,source,target){const a=s.countries[source],d=s.countries[target];if(!a||!d)return null;const sent=Math.floor(a.troops*.78),attack=Math.round(effectivePower(s,a)*.78*weatherAttack(s,source)),defense=Math.round(effectivePower(s,d,true)*weatherDefense(s,target)),chance=Math.max(5,Math.min(95,Math.round(50+((attack-defense)/Math.max(1,attack+defense))*150)));return {sent,attack,defense,chance,airborne:!neighbors(source).includes(target),blocked:attackBlock(s,source,target)};}
function declareWar(s,a,b){if(atWar(s,a,b))return;s.wars.push(pair(a,b));notify(s,'war','Guerra declarada',`${factionName(s,a)} y ${factionName(s,b)} están en guerra.`,{actor:a,target:b,icon:'tank'});addLog(s,`${factionName(s,a)} declaró la guerra a ${factionName(s,b)}.`,'war',a);}
function setPeace(s,a,b){s.treaties[pair(a,b)]=s.turn+4;s.wars=s.wars.filter(k=>k!==pair(a,b));}
function eliminated(s,id){if(activeFactions(s).includes(id))return;notify(s,'eliminated','Una bandera menos',`${factionName(s,id)} ya no tiene turno propio.`,{actor:id,icon:'flag'});addLog(s,`${BY_ID[id].name} dejó de ser una nación independiente.`,'world',id);}
export function action(s,type,id,source){
 if(!isPlayerTurn(s))return {error:s.status==='playing'?'Espera a que llegue tu turno.':'La campaña terminó.'};
 if(s.pendingBattle||s.pendingOccupation)return {error:'Termina de ver la batalla y la ocupación.'};
 if(s.event||s.inbox.length)return {error:'Lee el aviso para continuar.'};
 if(s.ap<1)return {error:'Usaste tus 3 acciones. Termina tu turno.'};
 const c=s.countries[id];if(!c)return {error:'Elige un país.'};
 const own=c.owner===s.player,price=cost(s,type,id);if(s.cash<price)return {error:`Necesitas ${price} créditos.`};
 let result={ok:true,type,target:id},notice;
 if(UPGRADE[type]){
  if(!own)return {error:'Elige uno de tus países.'};
  if(type!=='recruit'&&c[type]>=4)return {error:'Ya está al máximo.'};
  const blocked=upgradeBlock(s,type,id);if(blocked)return {error:blocked.reason};
  const recruited=recruitAmount(s,id);if(type==='recruit')c.troops+=recruited;else c[type]++;
  s.stats.investments++;const value=type==='recruit'?`+${recruited} unidades`:`Nivel ${c[type]}`;
  notice={kind:'upgrade',title:type==='recruit'?'¡Llegan refuerzos!':`${UPGRADE[type].name} mejorada`,text:BY_ID[id].name,value,icon:({recruit:'troops',armor:'tank',air:'plane',industry:'factory',fort:'shield'})[type]};
 }else if(type==='bombers'){
  if(!own||c.air<4)return {error:'Primero lleva los aviones de este país al nivel 4.'};
  if(c.bombers)return {error:'Esta base ya tiene bombarderos.'};
  const blocked=upgradeBlock(s,'air',id);if(blocked)return {error:blocked.reason};
  c.bombers=true;s.stats.investments++;notice={kind:'upgrade',title:'¡Bombarderos listos!',text:`Desde ${BY_ID[id].name}, elige una industria enemiga a un máximo de 2 pasos.`,value:'Solo afecta la producción · no conquista',icon:'plane'};
 }else if(type==='bombard'){
  const blocked=bombardBlock(s,source,id);if(blocked)return {error:blocked};prepareBombardment(s,source,id);result={...result,pending:true,source};
 }else if(type==='attack'){
  if(own)return {error:'Este país ya es tuyo.'};
  const src=s.countries[source];if(!src||src.owner!==s.player||!sourcesFor(s,id).some(x=>x.id===source))return {error:'Busca un vecino o mejora tus aviones al nivel 2.'};
  const blocked=attackBlock(s,source,id);if(blocked)return {error:blocked.reason};
  if(treatyUntil(s,s.player,c.owner)>=s.turn)return {error:'La tregua todavía está activa.'};
  if(src.troops<12)return {error:'Necesitas al menos 12 unidades en el origen.'};
  const before=structuredClone(s.countries),previous=c.owner;declareWar(s,s.player,previous);const f=forecast(s,source,id),won=random(s)*100<f.chance;
  src.troops-=f.sent;c.relation=-40;c.trade=0;
  if(won){c.owner=s.player;c.troops=Math.max(8,Math.round(f.sent*(.65+.15*random(s))));c.fort=Math.max(0,c.fort-1);}
  else{src.troops+=Math.round(f.sent*.4);c.troops=Math.max(6,c.troops-Math.round(f.sent*.28));}
  notice={kind:won?'victory':'battle',title:won?'¡País conquistado!':'El avance se detuvo',text:won?`${BY_ID[id].name} pasa de ${factionName(s,previous)} a ${factionName(s,s.player)}. Tus unidades ocupan el país.`:`${BY_ID[id].name} sigue bajo la bandera de ${factionName(s,previous)}. Tus unidades supervivientes se retiran.`,value:won?'+35 créditos':`${Math.round(f.sent*.4)} unidades regresan a ${BY_ID[source].name}`,icon:won?'flag':'shield'};
  recordBattle(s,source,id,before,won,{countries:{[source]:structuredClone(src),[id]:structuredClone(c)},reward:won?35:0,conquests:won?1:0,notice});notice=null;result={...result,pending:true,source};
 }else if(type==='transfer'){
  const src=s.countries[source],route=friendlyRoute(s,source,id);if(!own||!src||src.owner!==s.player||src.id===id||!route)return {error:'Conecta origen y destino con países tuyos.'};
  const blocked=routeBlock(s,route);if(blocked)return {error:blocked.reason};
  if(src.troops<16)return {error:'El origen necesita al menos 16 unidades.'};
  const n=Math.floor(src.troops*.5);src.troops-=n;const steps=route.length-1;
  s.transfers.push({id:++s.transferCounter,owner:s.player,route,step:0,troops:n,createdRound:s.turn,lastMovedRound:s.turn,armor:src.armor,air:src.air});
  notice={kind:'route',title:'¡Convoy preparado!',text:`${BY_ID[source].name} → ${BY_ID[id].name}. Avanza un país en cada turno tuyo.`,value:`${n} unidades · ${steps} ${steps===1?'turno':'turnos'}`,icon:'troops'};result.route=route;

 }else{
  if(own)return {error:'Elige otro país para negociar.'};
  if(type==='talk'){c.relation=Math.min(100,c.relation+35);notice={kind:'peace',title:'¡Nos entendemos mejor!',text:BY_ID[id].name,value:`${Math.max(0,c.relation)} / 100 confianza`,icon:'peace'};}
  else if(type==='peace'){setPeace(s,s.player,c.owner);c.truce=s.turn+4;c.relation=Math.min(100,Math.max(20,c.relation)+25);notice={kind:'peace',title:'¡Hay tregua!',text:`Con ${factionName(s,c.owner)}. Nadie ataca al otro.`,value:`Hasta el final de la ronda ${s.turn+4}`,icon:'peace'};}
  else if(type==='join'){if(s.campaignMode==='factions'&&!preparingFactions(s))return {error:'Las fusiones de facciones se cierran al comenzar la ronda 5.'};if(c.relation<70)return {error:'Llega a 70 de confianza hablando primero.'};result.previous=c.owner;const joining=s.campaignMode==='factions'?Object.values(s.countries).filter(x=>x.owner===c.owner):[c];for(const land of joining){land.owner=s.player;land.truce=0;land.trade=0;}s.stats.agreements++;notice={kind:'victory',title:'¡Un nuevo aliado!',text:s.campaignMode==='factions'?`${factionName(s,result.previous)} se integra en ${factionName(s,s.player)} con ${joining.length} países.`:`${BY_ID[id].name} se une sin combatir.`,value:`${owned(s).length} / 20 países`,icon:'flag'};}
  else if(type==='trade'){if(c.traded===s.turn)return {error:'Ya comerciaste aquí en esta ronda.'};c.trade=s.turn+4;c.traded=s.turn;c.relation=Math.min(100,c.relation+10);s.cash+=20;notice={kind:'trade',title:'¡Trato hecho!',text:`Comercio con ${BY_ID[id].name}. +12 créditos por ronda durante 4 rondas.`,value:'+20 créditos ahora',icon:'trade'};}
  else return {error:'Acción desconocida.'};
 }
 s.cash-=price;s.ap--;s.spent.push({type,target:id});
 if(notice){notify(s,notice.kind,notice.title,notice.text,{actor:s.player,target:id,icon:notice.icon,value:notice.value,important:!UPGRADE[type]});
 addLog(s,`${notice.title} ${notice.text} ${notice.value}.` ,notice.kind,s.player);}
 if(result.previous&&result.previous!==s.player)eliminated(s,result.previous);
 if(!s.pendingBattle)checkEnd(s);return result;
}
export function endTurn(s){
 if(!isPlayerTurn(s)||s.event||s.inbox.length||s.pendingBattle||s.pendingOccupation)return {error:'Espera a tu turno y termina de leer los avisos.'};
 s.rivalTurns=[];const used=3-s.ap;notify(s,'endturn','Turno terminado',`Usaste ${used} de tus 3 acciones. Ahora juegan los demás.`,{actor:s.player,icon:'check',value:used===0?'También puedes esperar.':'¡Veamos qué hacen!'});addLog(s,`Terminaste tu turno con ${used} acciones usadas.`,'turn',s.player);
 finishIndustryTurn(s,s.player);s.ap=0;s.turnIndex++;enterTurn(s);return {ok:true};
}
export function playAITurn(s){
 if(s.status!=='playing'||s.phase!=='ai')return {error:'No hay un turno rival pendiente.'};
 if(s.aiReport)return s.aiReport;
 const faction=currentFaction(s),land=Object.values(s.countries).filter(c=>c.owner===faction),report={ok:true,faction,round:s.turn,actions:[],changes:[],reasons:[]};
 if(!land.length){s.aiReport=report;return report;}
 const explain=(e,text)=>{if(!e)return;report.reasons.push({incident:structuredClone(e),text});};
 const recruit=land[Math.floor(random(s)*land.length)],base=3+Math.floor(random(s)*5),capacity=Math.max(0,150-recruit.troops),standard=Math.min(capacity,base),amount=Math.min(capacity,recruitAmount(s,recruit.id,base));recruit.troops+=amount;
 if(amount>0){report.actions.push({icon:'troops',text:`+${amount} unidades en ${BY_ID[recruit.id].name}`});if(amount!==standard)explain(incidentAt(s,recruit.id),`${BY_ID[recruit.id].name} recluta ${amount} unidades: ${condition(s,recruit.id).recruit<1?'menos por la falta de alimentos':'más gracias a sus recursos'}.`);}
 markIndustryIncome(s,faction);
 const industrialRatio=countryIncome(s,recruit)/income(recruit);
 if(industryDamage(s,recruit.id))report.actions.push({icon:'factory',text:`Industria de ${BY_ID[recruit.id].name} en reparación: menos recursos para mejoras`});
 const improveRoll=random(s),improveChance=.25*industrialRatio;
 if(improveRoll<.25&&improveRoll>=improveChance&&['armor','air','industry','fort'].some(k=>recruit[k]<4))explain(incidentAt(s,recruit.id),`${BY_ID[recruit.id].name} aplaza sus mejoras porque recibe menos ingresos.`);
 if(improveRoll<improveChance){
  let key=['armor','air','industry','fort'][Math.floor(random(s)*4)];const blocked=recruit[key]<4?upgradeBlock(s,key,recruit.id):null;
  if(blocked){const alternative=['fort','industry','armor','air'].find(k=>!upgradeBlock(s,k,recruit.id)&&recruit[k]<4);explain(blocked.event,`${BY_ID[recruit.id].name} cancela la mejora de ${UPGRADE[key].name.toLowerCase()}.${alternative?` En su lugar mejora ${UPGRADE[alternative].name.toLowerCase()}.`:' Espera a que lleguen recursos.'}`);key=alternative;}
  if(key&&recruit[key]<4){recruit[key]++;if(improveRoll>=.25)explain(incidentAt(s,recruit.id),`${BY_ID[recruit.id].name} mejora antes gracias a sus mayores ingresos.`);report.actions.push({icon:key==='industry'?'factory':key==='air'?'plane':key==='armor'?'tank':'shield',text:`Mejoró ${UPGRADE[key].name.toLowerCase()} en ${BY_ID[recruit.id].name}`});}
 }
 let attacked=false,heldAttack=false;
 if(random(s)<LEVELS[s.difficulty].ai&&!combatPause(s)){
  const options=land.flatMap(a=>neighbors(a.id).map(id=>({a,b:s.countries[id]}))).filter(({a,b})=>b.owner!==faction&&!(b.owner===s.player&&s.turn<=2)&&treatyUntil(s,faction,b.owner)<s.turn&&effectivePower(s,a)*.78*weatherAttack(s,a.id)>effectivePower(s,b,true)*weatherDefense(s,b.id)*1.15);
  options.sort((x,y)=>effectivePower(s,y.a)/Math.max(1,effectivePower(s,y.b,true))-effectivePower(s,x.a)/Math.max(1,effectivePower(s,x.b,true)));
  const blocked=options[0]&&attackBlock(s,options[0].a.id,options[0].b.id);
  if(blocked){heldAttack=true;explain(blocked.event,`${BY_ID[options[0].a.id].name} cancela su ataque a ${BY_ID[options[0].b.id].name}: ${INCIDENTS[blocked.event.kind].title.toLowerCase()}.`);report.actions.push({icon:'pause',text:`Ataque cancelado desde ${BY_ID[options[0].a.id].name}`});}
  const choice=options.find(({a,b})=>!attackBlock(s,a.id,b.id));
  if(choice){
   const {a,b}=choice,previous=b.owner,before=structuredClone(s.countries);declareWar(s,faction,previous);const sent=Math.floor(a.troops*.65);a.troops-=sent;b.owner=faction;b.troops=Math.max(9,Math.round(sent*.7));b.relation=Math.max(0,b.relation-15);b.trade=0;b.truce=0;
   const notice={kind:previous===s.player?'danger':'world',title:`${BY_ID[b.id].name} conquistado`,text:`${BY_ID[b.id].name} pasa de ${factionName(s,previous)} a ${factionName(s,faction)}.`,icon:'tank',value:'Los defensores fueron vencidos'};
   recordBattle(s,a.id,b.id,before,true,{countries:{[a.id]:structuredClone(a),[b.id]:structuredClone(b)},notice,reportText:`Conquistó ${BY_ID[b.id].name}`});report.actions.push({icon:'tank',text:`Prepara un ataque a ${BY_ID[b.id].name}`,pendingOperation:true});attacked=true;
  }
 }
 if(!attacked){
  const base=Object.values(s.countries).find(c=>c.owner===faction&&c.air===4&&!c.bombers&&!upgradeBlock(s,'air',c.id)&&!industryDamage(s,c.id));
  if(base&&improveRoll<.18){base.bombers=true;report.actions.push({icon:'plane',text:`Desbloqueó bombarderos en ${BY_ID[base.id].name}`});}
  const raids=Object.values(s.countries).filter(c=>c.owner===faction&&c.bombers).flatMap(a=>Object.values(s.countries).filter(b=>!(b.owner===s.player&&s.turn<=2)&&!bombardBlock(s,a.id,b.id,faction)).map(b=>({a,b}))).sort((x,y)=>y.b.industry-x.b.industry);
  if(raids.length&&random(s)<.22){const {a,b}=raids[0];prepareBombardment(s,a.id,b.id);report.actions.push({icon:'plane',text:`Prepara una operación sobre la industria de ${BY_ID[b.id].name}`,pendingOperation:true});attacked=true;}
 }
 if(!attacked&&random(s)<(heldAttack?.25:.075)){
  const candidates=[...new Set(land.flatMap(c=>neighbors(c.id)).map(id=>s.countries[id].owner))].filter(id=>id!==faction&&id!==s.player&&treatyUntil(s,faction,id)<s.turn);
  if(candidates.length){const other=candidates[Math.floor(random(s)*candidates.length)];setPeace(s,faction,other);report.actions.push({icon:'peace',text:`Acordó una tregua con ${BY_ID[other].name}`});notify(s,'peace','Dos países hacen las paces',`${factionName(s,faction)} y ${BY_ID[other].name}.${heldAttack?' El ataque quedó bloqueado y buscan tiempo para recuperarse.':''}`,{actor:faction,target:other,icon:'peace',value:'4 rondas sin atacarse'});addLog(s,`Tregua: ${factionName(s,faction)} y ${BY_ID[other].name}.`,'peace',faction);}
 }
 if(report.reasons.length){const first=report.reasons[0].incident,text=report.reasons.map(r=>r.text).join(' ');notify(s,'decision',`${factionName(s,faction)} adapta su plan`,text,{actor:faction,target:first.target,icon:INCIDENTS[first.kind].icon,details:{incident:first,stage:'decision',decisions:report.reasons}});}
 if(!report.actions.length)report.actions.push({icon:'shield',text:'Cuidó sus fronteras'});
 addLog(s,`${factionName(s,faction)}: ${report.actions.map(a=>a.text).join(' · ')}.`,'rival',faction);
 s.aiReport=report;s.rivalTurns.push(structuredClone(report));if(!s.pendingBattle)checkEnd(s);return report;
}
export function finishAITurn(s){if(s.status!=='playing'||s.phase!=='ai'||!s.aiReport)return {error:'Este turno todavía no se ha resuelto.'};finishBattle(s);finishOccupation(s);if(s.status!=='playing')return {ok:true};finishIndustryTurn(s,currentFaction(s));s.aiReport=null;s.turnIndex++;enterTurn(s);return {ok:true};}
export function skipToPlayer(s,{stopAtPlayerAttack=false}={}){let count=0;while(s.status==='playing'&&s.phase==='ai'&&count<100){playAITurn(s);if(stopAtPlayerAttack&&s.pendingBattle?.defender===s.player)return {ok:true,count,interrupted:true};if(s.status==='playing')finishAITurn(s);count++;}return {ok:true,count,interrupted:false};}
export function resolveEvent(s,index){if(!isPlayerTurn(s)||!s.event||!s.event.options[index])return false;const o=s.event.options[index];s.cash+=o.cash||0;for(const c of Object.values(s.countries)){if(o.relation&&c.owner!==s.player)c.relation=Math.min(100,c.relation+o.relation);if(o.troops&&c.owner===s.player)c.troops+=o.troops;}addLog(s,`${s.event.title}: ${o.label}.`,'peace',s.player);s.event=null;return true;}
function validBase(s){
 if(!s||!BY_ID[s.player]||!LEVELS[s.difficulty]||!['playing','won','lost'].includes(s.status)||!Number.isInteger(s.turn)||s.turn<1||!Number.isInteger(s.ap)||s.ap<0||s.ap>3||!Number.isFinite(s.cash)||s.cash<0||!Number.isInteger(s.seed)||!s.countries||Object.keys(s.countries).length!==20||!Array.isArray(s.log)||!s.stats)return false;
 if(['battles','agreements','investments'].some(k=>!Number.isFinite(s.stats[k])||s.stats[k]<0))return false;
 if(s.log.some(e=>typeof e.text!=='string'||!Number.isFinite(e.turn)))return false;
 if(s.event&&(!Array.isArray(s.event.options)||typeof s.event.title!=='string'||typeof s.event.text!=='string'||s.event.options.some(x=>typeof x.label!=='string'||['cash','relation','troops'].some(k=>x[k]!==undefined&&(!Number.isFinite(x[k])||x[k]<0)))))return false;
 return COUNTRIES.every(({id})=>{const c=s.countries[id];return c&&c.id===id&&BY_ID[c.owner]&&Number.isFinite(c.troops)&&c.troops>=0&&['armor','air','industry','fort'].every(k=>Number.isInteger(c[k])&&c[k]>=0&&c[k]<=4)&&['relation','truce','trade','traded'].every(k=>Number.isFinite(c[k]));});
}
export function validateSave(s){
 if(!validBase(s)||s.version!==4||!['draw','ready','player','ai','over'].includes(s.phase)||!Array.isArray(s.turnOrder)||!Array.isArray(s.tieOrder)||!Array.isArray(s.inbox)||!Array.isArray(s.notifications)||!Array.isArray(s.wars)||!s.treaties||!Array.isArray(s.spent)||!Array.isArray(s.rivalTurns))return false;
 if(!validateIncidents(s)||!validateOperations(s)||!validateCalendar(s)||!validateFactions(s))return false;
 if(!Array.isArray(s.transfers)||!Array.isArray(s.movements)||!Array.isArray(s.worldNews)||!Number.isInteger(s.transferCounter))return false;
 if(s.transfers.some(t=>!Number.isInteger(t.id)||t.id<1||t.id>s.transferCounter||!BY_ID[t.owner]||!Array.isArray(t.route)||t.route.length<2||t.route.some((id,i)=>!BY_ID[id]||(i>0&&!neighbors(t.route[i-1]).includes(id)))||!Number.isInteger(t.step)||t.step<0||t.step>=t.route.length-1||!Number.isInteger(t.troops)||t.troops<1||!Number.isInteger(t.createdRound)||t.createdRound<1||!Number.isInteger(t.lastMovedRound)||t.lastMovedRound<t.createdRound||t.lastMovedRound>s.turn||['armor','air'].some(k=>!Number.isInteger(t[k])||t[k]<0||t[k]>4)))return false;
 if(new Set(s.transfers.map(t=>t.id)).size!==s.transfers.length)return false;
 if(s.movements.some(m=>!BY_ID[m.source]||!BY_ID[m.target]||!BY_ID[m.owner]||!Number.isInteger(m.troops)||m.troops<1||['armor','air'].some(k=>!Number.isInteger(m[k])||m[k]<0||m[k]>4)))return false;
 if(s.worldNews.some(n=>!BY_ID[n.target]||!['rain','wind','festival','clear'].includes(n.kind)||!Number.isInteger(n.round)||typeof n.title!=='string'||typeof n.text!=='string'))return false;
 if(s.worldEvent&&(!BY_ID[s.worldEvent.target]||!['rain','wind','festival','clear'].includes(s.worldEvent.kind)||!Number.isInteger(s.worldEvent.round)))return false;
 if(s.pendingBattle&&(!BY_ID[s.pendingBattle.source]||!BY_ID[s.pendingBattle.target]||!BY_ID[s.pendingBattle.attacker]||!BY_ID[s.pendingBattle.defender]||typeof s.pendingBattle.won!=='boolean'||!validBase({...s,countries:s.pendingBattle.beforeCountries})||!s.pendingBattle.attacking||!s.pendingBattle.defending))return false;
 if(s.pendingBattle?.resolution){const b=s.pendingBattle,r=b.resolution;if(!['battle','bombard'].includes(b.type)||!['briefing','animation'].includes(b.stage)||b.source===b.target||!r.countries||Object.keys(r.countries).length!==2||!r.countries[b.source]||!r.countries[b.target]||!validBase({...s,countries:{...s.countries,...r.countries}})||!validateOperations({...s,countries:{...s.countries,...r.countries}})||!r.notice||['title','text','kind','icon','value'].some(k=>typeof r.notice[k]!=='string')||[r.reward||0,r.conquests||0].some(x=>!Number.isFinite(x)||x<0)||r.damage&&!validateOperations({...s,industryDamage:{[b.target]:r.damage}}))return false;}
 if(s.pendingOccupation){const o=s.pendingOccupation;if(!BY_ID[o.source]||!BY_ID[o.target]||s.countries[o.target].owner!==o.owner||!BY_ID[o.owner]||!BY_ID[o.previous]||!Number.isInteger(o.noticeId)||!s.notifications.some(n=>n.id===o.noticeId)||['armor','air'].some(k=>!Number.isInteger(o[k])||o[k]<0||o[k]>4))return false;}
 if(s.fastForward!==undefined&&typeof s.fastForward!=='boolean')return false;
 if(s.skipDeferred!==undefined&&(!Array.isArray(s.skipDeferred)||s.skipDeferred.some(id=>!s.notifications.some(n=>n.id===id&&!n.read))))return false;
 if(!Number.isInteger(s.noticeCounter)||!Number.isInteger(s.turnIndex)||s.turnIndex<0||!Number.isInteger(s.lastIncomeRound)||!Number.isInteger(s.lastEventRound))return false;
 if(s.turnOrder.some(x=>!BY_ID[x.id]||!Number.isFinite(x.power))||new Set(s.turnOrder.map(x=>x.id)).size!==s.turnOrder.length)return false;
 if(s.phase==='draw'&&(s.turnOrder.length||s.ap!==0))return false;
 if(s.phase!=='draw'&&(!s.turnOrder.length||s.turnIndex>=s.turnOrder.length)&&s.phase!=='over')return false;
 if(s.phase==='player'&&currentFaction(s)!==s.player)return false;
 if(s.phase==='ai'&&(currentFaction(s)===s.player||s.ap!==0))return false;
 if(s.notifications.some(n=>!Number.isInteger(n.id)||!Number.isInteger(n.round)||typeof n.title!=='string'||typeof n.text!=='string'||(n.actor&&!BY_ID[n.actor])||(n.target&&!BY_ID[n.target])))return false;
 if(s.notifications.some(n=>n.details&&(!INCIDENTS[n.details.incident?.kind]||!BY_ID[n.details.incident?.target]||!Number.isInteger(n.details.incident?.until)||!['start','end','decision'].includes(n.details.stage)||n.details.decisions&&(!Array.isArray(n.details.decisions)||n.details.decisions.some(d=>!INCIDENTS[d.incident?.kind]||!BY_ID[d.incident?.target]||typeof d.text!=='string')))))return false;
 if(s.inbox.some(id=>!s.notifications.some(n=>n.id===id&&!n.read)))return false;
 if(s.rivalTurns.some(r=>!BY_ID[r.faction]||!Array.isArray(r.actions)||r.actions.some(a=>typeof a.text!=='string')))return false;
 if(Object.entries(s.treaties).some(([k,v])=>k.split(':').length!==2||k.split(':').some(id=>!BY_ID[id])||!Number.isInteger(v)||v<0))return false;
 if(s.wars.some(k=>typeof k!=='string'||k.split(':').length!==2||k.split(':').some(id=>!BY_ID[id])))return false;
 if(s.aiReport&&(!BY_ID[s.aiReport.faction]||!Array.isArray(s.aiReport.actions)||!Array.isArray(s.aiReport.changes)||s.aiReport.actions.some(a=>typeof a.text!=='string')))return false;
 return true;
}
export function upgradeSave(raw){
 if(raw?.version===4)return validateSave(raw)?structuredClone(raw):null;
 const init=s=>Object.assign(s,{version:4,...eventState(s.seed,['draw','ready'].includes(s.phase)?0:s.turn)});
 if(raw?.version===3){const s=init(structuredClone(raw));return validateSave(s)?s:null;}
 if(raw?.version===2){const s=init({...structuredClone(raw),transfers:[],transferCounter:0,movements:[],worldNews:[],worldEvent:null,pendingBattle:null});return validateSave(s)?s:null;}
 if(raw?.version!==1||!validBase(raw))return null;
 const s=init(structuredClone(raw));Object.assign(s,{phase:s.status==='playing'?'player':'over',turnOrder:[],turnIndex:0,starter:s.player,tieOrder:COUNTRIES.map(c=>c.id),lastIncomeRound:s.turn,lastEventRound:s.event?s.turn:0,aiReport:null,rivalTurns:[],spent:Array.from({length:3-s.ap},()=>({type:'used',target:s.player})),notifications:[],noticeCounter:0,inbox:[],wars:[],treaties:{},transfers:[],transferCounter:0,movements:[],worldNews:[],worldEvent:null,pendingBattle:null,lastIncidentRound:s.turn});
 for(const c of Object.values(s.countries))if(c.owner!==s.player&&c.truce>=s.turn)s.treaties[pair(s.player,c.owner)]=Math.max(s.treaties[pair(s.player,c.owner)]||0,c.truce);
 makeOrder(s,s.player);if(s.status==='playing')notify(s,'update','¡Tu partida sigue aquí!','Los países ahora tienen sucesos que cambian sus planes.',{actor:s.player,icon:'flag',value:`Conservas ${s.ap} acciones`});
 return validateSave(s)?s:null;
}
