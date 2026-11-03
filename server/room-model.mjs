import {COUNTRIES,BY_ID,neighbors} from '../public/game/data.js';
import {createGame,drawFirst,beginCampaign,currentFaction,activeFactions,storeOnlineAccount,acknowledge,action,endTurn,resolveEvent,finishBattle,finishOccupation,finishMovements,cancelTransfer,forecast,owned,cost,checkEnd,LEVELS} from '../public/game/engine.js';
import {combatPause} from '../public/game/calendar.js';
export class RoomError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const fail=(text,status=400)=>{throw new RoomError(text,status);};
const country=id=>typeof id==='string'&&Object.hasOwn(BY_ID,id);
const actionTypes=new Set(['recruit','armor','air','industry','fort','attack','transfer','bombers','bombard','talk','peace','join','trade']);
const clean=(value,max)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
export function displayName(value){const name=clean(value,22);if(name.length<2)fail('Escribe un nombre de al menos 2 caracteres.');return name;}
export function makeRoom(code,userId,input,now){
 const name=clean(input.title,40)||'Operación Horizonte',capacity=Number(input.capacity||20),turnSeconds=Number(input.turnSeconds||120);
 if(!Number.isInteger(capacity)||capacity<2||capacity>20||![60,90,120,180].includes(turnSeconds))fail('Configuración de sala inválida.');
 return {version:1,code,title:name,host:userId,status:'lobby',createdAt:now,updatedAt:now,config:{capacity,turnSeconds,difficulty:LEVELS[input.difficulty]?input.difficulty:'normal'},members:[{userId,seatId:crypto.randomUUID(),name:displayName(input.name),nation:null,ready:false,joinedAt:now,lastSeen:now}],chat:[],chatSequence:0,proposals:[],events:[],eventSequence:0,receipts:[],game:null,stage:null,stageUntil:null,deadline:null};
}
function logEvent(r,type,text,at,detail=null){r.events.push({id:++r.eventSequence,type,text,at,detail});r.events=r.events.slice(-100);}
function notices(r,from,at){for(const n of r.game.notifications.filter(n=>n.id>Math.max(from,r.lastNoticeId||0)))logEvent(r,n.kind,n.kind==='yourturn'?`${BY_ID[n.actor].name} inicia su turno. ${n.value}`:n.kind==='endturn'?`${BY_ID[n.actor].name} terminó su turno.`:n.title+'. '+n.text+(n.value?' '+n.value:''),at);r.lastNoticeId=r.game.noticeCounter;acknowledge(r.game,r.game.inbox);}
function account(r,nation){const g=r.game;return nation===g.player?{cash:g.cash,stats:g.stats,diplomacy:Object.fromEntries(Object.entries(g.countries).map(([id,c])=>[id,c]))}:g.accounts[nation];}
function cash(r,nation,delta){const g=r.game;if(nation===g.player)g.cash+=delta;else g.accounts[nation].cash+=delta;}
function settle(r,at,noticeFrom){const g=r.game;notices(r,noticeFrom,at);storeOnlineAccount(g);if(r.status!=='finished'&&g.status!=='playing'&&!g.pendingOccupation){r.status='finished';r.deadline=null;r.stage=null;logEvent(r,'final',`${BY_ID[g.winner].name} reúne las 20 banderas. Campaña terminada.`,at);}}
function startTurn(r,at){
 const g=r.game;const human=r.members.some(m=>m.nation===currentFaction(g));r.deadline=at+(human?r.config.turnSeconds:4)*1000;r.stage=null;r.stageUntil=null;
 if(g.movements.length){r.stage='movement';r.stageUntil=at+4400*g.movements.length;logEvent(r,'convoy','Los refuerzos avanzan a su siguiente posición.',at,{moves:structuredClone(g.movements)});}
 for(const p of r.proposals.filter(p=>p.status==='pending'&&p.expires<g.turn)){p.status='expired';cash(r,p.from,p.price);logEvent(r,'diplomacy','Una propuesta venció. Se devolvieron los créditos reservados.',at);}
}
function finishTurn(r,at){const g=r.game,from=g.noticeCounter;acknowledge(g,g.inbox);if(g.event)resolveEvent(g,0);const result=endTurn(g);if(result.error)fail(result.error);settle(r,at,from);if(r.status==='playing')startTurn(r,at);}
function battleStage(r,at){if(r.game.pendingBattle){r.stage='battle';r.stageUntil=at+(r.game.pendingBattle.type==='bombard'?8800:9400);logEvent(r,'operation',`${BY_ID[r.game.pendingBattle.source].name} inicia una operación sobre ${BY_ID[r.game.pendingBattle.target].name}.`,at);return true;}return false;}
function robot(r,at){
 const g=r.game;if(g.event)resolveEvent(g,0);acknowledge(g,g.inbox);
 for(let i=0;i<3&&g.ap>0;i++){
  const land=owned(g),c=land.slice().sort((a,b)=>a.troops-b.troops)[0];if(!c)break;
  let result;const options=land.flatMap(a=>neighbors(a.id).map(id=>({a,b:g.countries[id],f:forecast(g,a.id,id)}))).filter(x=>x.b.owner!==g.player&&!x.f.blocked&&x.a.troops>=20&&x.f.chance>({explorer:86,normal:72,hard:59}[g.difficulty])).sort((a,b)=>b.f.chance-a.f.chance);
  if(options.length&&!combatPause(g)&&i===0&&g.turn>2){const {a,b}=options[0];result=action(g,'attack',b.id,a.id);}
  if(!result?.ok){const choices=c.troops<35?['recruit','industry','armor','fort','air']:['industry','armor','recruit','air','fort'];for(const type of choices){result=action(g,type,c.id);if(result.ok)break;}}
  if(!result?.ok)break;acknowledge(g,g.inbox);if(battleStage(r,at))return;
 }
 finishTurn(r,at);
}
export function advanceRoom(r,now,limit=400){
 if(r.status!=='playing')return false;let changed=false;
 for(let i=0;i<limit&&r.status==='playing';i++){
  const g=r.game;
  if(r.stage){if(now<r.stageUntil)break;const at=r.stageUntil,from=g.noticeCounter,stage=r.stage;r.stage=null;r.stageUntil=null;
   if(stage==='roulette'){beginCampaign(g);notices(r,from,at);storeOnlineAccount(g);startTurn(r,at);}
   else if(stage==='battle'){finishBattle(g);notices(r,from,at);storeOnlineAccount(g);if(g.pendingOccupation){r.stage='occupation';r.stageUntil=at+6700;logEvent(r,'occupation',`${BY_ID[g.pendingOccupation.target].name} recibe a las tropas de ${BY_ID[g.pendingOccupation.owner].name}.`,at);}else settle(r,at,g.noticeCounter);}
   else if(stage==='occupation'){finishOccupation(g);settle(r,at,from);}
   else if(stage==='movement'){finishMovements(g);settle(r,at,from);}
   if(r.deadline)r.deadline=Math.max(r.deadline,at);changed=true;continue;
  }
  if(now<r.deadline)break;const at=r.deadline;
  if(r.members.some(m=>m.nation===currentFaction(g))){logEvent(r,'clock',`Terminó el tiempo de ${BY_ID[currentFaction(g)].name}. Se conservan sus unidades y decisiones.`,at);finishTurn(r,at);}else{const from=g.noticeCounter;robot(r,at);notices(r,from,at);storeOnlineAccount(g);}
  changed=true;
 }
 r.catchingUp=r.status==='playing'&&(r.stage?now>=r.stageUntil:now>=r.deadline);return changed;
}
function beginRoom(r,now){
 if(r.members.some(m=>!m.nation||!m.ready))fail('Todos deben elegir un país y marcar Listo.');
 const first=r.members[0].nation,g=createGame(first,r.config.difficulty,crypto.getRandomValues(new Uint32Array(1))[0]);
 // Equal starting support for every country, including AI-controlled countries.
 for(const c of Object.values(g.countries))if(c.id!==first)c.troops+=LEVELS[g.difficulty].boost;
 g.multiplayer=true;g.accounts={};for(const c of COUNTRIES){g.player=c.id;storeOnlineAccount(g);}g.player=first;
 drawFirst(g);r.game=g;r.status='playing';r.stage='roulette';r.stageUntil=now+6500;r.deadline=null;
 logEvent(r,'initiative',`La ruleta eligió a ${BY_ID[g.starter].name}. Después se juega de menor a mayor poder.`,now);
}
function propose(r,m,payload,now){
 const g=r.game,type=payload.type;if(!['peace','join','trade'].includes(type))return false;const c=g.countries[payload.target];if(!c||c.owner===m.nation)fail('Elige un país de otro jugador.');
 if(!r.members.some(x=>x.nation===c.owner))return false;
 if(!['peace','join','trade'].includes(type))return false;
 if(g.ap<1)fail('Ya usaste tus tres acciones.');const price=cost(g,type,c.id);
 if(g.cash<price)fail(`Necesitas ${price} créditos.`);if(type==='join'&&c.relation<70)fail('Necesitas 70 de confianza para proponer la integración.');
 if(type==='trade'&&c.traded===g.turn)fail('Ya comerciaste con este país en la ronda.');
 if(r.proposals.some(p=>p.status==='pending'&&p.from===m.nation&&p.target===c.id&&p.type===type))fail('Ya hay una propuesta pendiente.');
 g.cash-=price;g.ap--;g.spent.push({type,target:c.id});r.proposals.push({id:crypto.randomUUID(),type,from:m.nation,to:c.owner,target:c.id,price,expires:g.turn+2,status:'pending'});r.proposals=r.proposals.filter(p=>p.status==='pending').slice(-40);
 logEvent(r,'diplomacy',`${m.name} propone ${type==='peace'?'una tregua':type==='join'?'una integración':'comercio'} a ${BY_ID[c.owner].name}.`,now);return true;
}
export function applyRoomCommand(r,userId,command,payload,now,turn=null){
 let m=r.members.find(x=>x.userId===userId);
 if(command==='join'){
  if(m){m.lastSeen=now;return;}
  if(r.status!=='lobby')fail('La campaña comenzó. Solo pueden volver sus participantes.');if(r.members.length>=r.config.capacity)fail('La sala está completa.');
  r.members.push({userId,seatId:crypto.randomUUID(),name:displayName(payload.name),nation:null,ready:false,joinedAt:now,lastSeen:now});return;
 }
 if(!m)fail('No formas parte de esta sala.',403);m.lastSeen=now;
 if(command==='heartbeat')return;
 if(command==='chat'){const text=clean(payload.text,400);if(!text)fail('Escribe un mensaje.');if(m.lastChat&&now-m.lastChat<1000)fail('Espera un segundo antes de enviar otro mensaje.',429);m.lastChat=now;r.chat.push({id:++r.chatSequence,seatId:m.seatId,name:m.name,text,at:now});r.chat=r.chat.slice(-120);return;}
 if(command==='seat'){if(r.status!=='lobby')fail('El país ya está fijado para esta campaña.');if(!country(payload.nation))fail('País inválido.');if(r.members.some(x=>x!==m&&x.nation===payload.nation))fail('Otro jugador acaba de elegir ese país.');m.nation=payload.nation;m.ready=false;return;}
 if(command==='ready'){if(r.status!=='lobby'||!m.nation)fail('Elige primero un país.');m.ready=payload.ready===true;return;}
 if(command==='start'){if(userId!==r.host||r.status!=='lobby')fail('Solo el anfitrión puede iniciar una sala en preparación.',403);beginRoom(r,now);return;}
 if(command==='claimHost'){const host=r.members.find(x=>x.userId===r.host);if(r.status!=='lobby'||host&&now-host.lastSeen<90000)fail('El anfitrión sigue conectado.');r.host=userId;return;}
 if(command==='leave'){if(r.status!=='lobby')fail('Tu país permanece reservado. Puedes salir y volver desde Mis campañas.');r.members=r.members.filter(x=>x!==m);if(r.host===userId)r.host=r.members[0]?.userId||userId;if(!r.members.length)r.status='closed';return;}
 if(r.status!=='playing'||r.catchingUp)fail('La campaña está actualizando su reloj.');const g=r.game;
 if(command==='respond'){
  const p=r.proposals.find(x=>x.id===payload.id&&x.to===m.nation&&x.status==='pending');if(!p)fail('La propuesta ya no está disponible.');
  if(g.pendingBattle||g.pendingOccupation)fail('Espera a que termine la operación.');
  const valid=g.countries[p.target].owner===p.to&&activeFactions(g).includes(p.from)&&p.expires>=g.turn;p.status=payload.accept===true&&valid?'accepted':'declined';
  if(p.status==='declined'){cash(r,p.from,p.price);logEvent(r,'diplomacy',`${m.name} rechazó una propuesta. Se devolvieron los créditos reservados.`,now);return;}
  if(p.type==='peace'){const key=[p.from,p.to].sort().join(':');g.treaties[key]=g.turn+4;g.wars=g.wars.filter(x=>x!==key);}
  if(p.type==='join'){g.countries[p.target].owner=p.from;account(r,p.from).stats.agreements++;checkEnd(g);}
  if(p.type==='trade'){const a=account(r,p.from),c=a.diplomacy[p.target];c.trade=g.turn+4;c.traded=g.turn;const origin=Object.values(g.countries).find(c=>c.owner===p.from)?.id;if(origin){const reverse=account(r,p.to).diplomacy[origin];reverse.trade=g.turn+4;reverse.traded=g.turn;}cash(r,p.from,20);cash(r,p.to,20);}
  logEvent(r,'diplomacy',`${m.name} aceptó ${p.type==='peace'?'una tregua':p.type==='join'?'la integración de '+BY_ID[p.target].name:'el acuerdo comercial'}.`,now);settle(r,now,g.noticeCounter);return;
 }
 if(currentFaction(g)!==m.nation)fail('Espera tu turno.',409);
 if(!turn||turn.round!==g.turn||turn.actor!==currentFaction(g))fail('El turno cambió. Se actualizó la partida.',409);
 if(r.stage)fail('La operación está en curso.',409);const from=g.noticeCounter;acknowledge(g,g.inbox);
 if(command==='action'){
  if(!actionTypes.has(payload.type)||!country(payload.target)||['attack','bombard','transfer'].includes(payload.type)&&!country(payload.source))fail('Orden de operación inválida.');
  if(g.event)fail('Elige el regalo de esta ronda.');
  if(!propose(r,m,payload,now)){const result=action(g,payload.type,payload.target,payload.source);if(result.error)fail(result.error);battleStage(r,now);}
 }else if(command==='end'){if(g.event)resolveEvent(g,0);finishTurn(r,now);}
 else if(command==='gift'){if(!resolveEvent(g,Number(payload.index)))fail('El regalo ya no está disponible.');}
 else if(command==='cancelConvoy'){const result=cancelTransfer(g,payload.id);if(result.error)fail(result.error);}
 else fail('Acción de sala desconocida.');
 settle(r,now,from);
}
export function roomView(r,userId,revision,now){
 const me=r.members.find(m=>m.userId===userId);if(!me)fail('No formas parte de esta sala.',403);
 let game=null;if(r.game){const source=r.game;game=structuredClone(source);storeOnlineAccount(game);const a=game.accounts[me.nation];game.player=me.nation;game.cash=a.cash;game.stats=a.stats;for(const [id,c] of Object.entries(game.countries))Object.assign(c,a.diplomacy[id]);game.phase=source.status!=='playing'?'over':r.stage==='roulette'?'ready':currentFaction(source)===me.nation?'player':'ai';game.ap=currentFaction(source)===me.nation?source.ap:0;game.event=currentFaction(source)===me.nation?source.event:null;game.status=source.status==='playing'?'playing':source.winner===me.nation?'won':'lost';delete game.accounts;delete game.seed;delete game.calendar.newsSeed;delete game.calendar.peaceDeck;if(game.pendingBattle)delete game.pendingBattle.resolution;game.notifications=[];game.inbox=[];game.log=source.log.slice(0,80);}
 return {code:r.code,title:r.title,status:r.status,config:r.config,revision,serverNow:now,self:me.seatId,host:r.members.find(m=>m.userId===r.host)?.seatId,members:r.members.map(({userId,...m})=>({...m,online:now-m.lastSeen<20000})),chat:r.chat,game,events:r.events,proposals:r.proposals.filter(p=>p.status==='pending'),stage:r.stage,stageUntil:r.stageUntil,deadline:r.deadline,catchingUp:!!r.catchingUp};
}
