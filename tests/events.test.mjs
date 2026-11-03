import test from 'node:test';
import assert from 'node:assert/strict';
import {COUNTRIES,BY_ID} from '../public/game/data.js';
import {INCIDENTS,eventState,addIncident,advanceIncidents,activeIncidents,incidentAt,condition,attackBlock,movementBlock,routeBlock,recruitAmount,validateIncidents} from '../public/game/events.js';
import {createGame,drawFirst,beginCampaign,skipToPlayer,acknowledge,resolveEvent,finishBattle,finishMovements,action,endTurn,playAITurn,finishAITurn,upgradeSave,validateSave,countryIncome,totalIncome,power,effectivePower,friendlyRoute,cancelTransfer} from '../public/game/engine.js';
import {incidentCard,decisionDetails} from '../public/game/event-ui.js';

function clear(s){finishBattle(s);finishMovements(s);acknowledge(s,s.inbox.slice());if(s.event)resolveEvent(s,0);}
function player(){const s=createGame('CHL','explorer',211);drawFirst(s);beginCampaign(s);skipToPlayer(s);clear(s);Object.assign(s,eventState(s.seed,s.turn));return s;}
function tickOwn(s){clear(s);endTurn(s);skipToPlayer(s);}
function quietRoute(){const s=player();s.countries.ARG.owner=s.countries.URY.owner=s.player;s.countries.CHL.troops=100;for(const c of Object.values(s.countries))if(c.owner!==s.player){c.troops=1;c.armor=0;c.air=0;c.fort=0;}return s;}

test('Every country receives random events; no stacking, repeats are spaced, all effects are bounded',()=>{
 const s=createGame('CHL','explorer',1386),visited=[],last=new Map(),kinds=new Set();
 for(let round=1;round<=90;round++){s.turn=round;const change=advanceIncidents(s);assert.ok(change.started.length<=3);assert.ok(activeIncidents(s).length<=6);assert.ok(validateIncidents(s));
  for(const e of change.started){visited.push(e.target);kinds.add(e.kind);if(last.has(e.target))assert.ok(e.start>=last.get(e.target)+2);last.set(e.target,e.until);assert.ok(e.until-e.start<2);}
  assert.equal(new Set(s.incidents.map(e=>e.target)).size,s.incidents.length);const snapshot=JSON.stringify(s);assert.deepEqual(advanceIncidents(s),{started:[],ended:[]});assert.equal(JSON.stringify(s),snapshot);
 }
 assert.equal(new Set(visited.slice(0,20)).size,20);assert.equal(kinds.size,Object.keys(INCIDENTS).length);assert.ok(s.incidentHistory.length<=180);
});
test('Event randomness is reproducible and does not consume battle or AI random numbers',()=>{
 const a=createGame('CHL','normal',54321),b=createGame('MEX','normal',54321),seed=a.seed;advanceIncidents(a);advanceIncidents(b);assert.deepEqual(a.incidents,b.incidents);assert.equal(a.seed,seed);
 for(let i=2;i<=10;i++){a.turn=b.turn=i;advanceIncidents(a);advanceIncidents(b);assert.deepEqual(a.incidents,b.incidents);}
});
test('Fuel blocks attacks without spending actions, money, troops or declaring war',()=>{
 const s=player();addIncident(s,'CHL','fuel');const snapshot=JSON.stringify(s);assert.match(action(s,'attack','ARG','CHL').error,/combustible/);assert.equal(JSON.stringify(s),snapshot);assert.ok(!s.wars.includes('ARG:CHL'));assert.ok(action(s,'talk','ARG').ok);clear(s);assert.ok(action(s,'recruit','CHL').ok);
});
test('Materials and industrial faults cancel only the affected purchases',()=>{
 for(const [kind,types] of [['materials',['armor','air']],['industry',['industry']]]){const s=player();addIncident(s,'CHL',kind);const before=JSON.stringify(s);for(const type of types){assert.ok(action(s,type,'CHL').error);assert.equal(JSON.stringify(s),before);}assert.ok(action(s,'recruit','CHL').ok);}
});
test('Wind grounds planes, blocks remote and sea attacks but permits land attacks',()=>{
 const s=player();s.countries.CHL.air=3;const ground=power({...s.countries.CHL,air:0});addIncident(s,'CHL','wind');assert.equal(effectivePower(s,s.countries.CHL),ground);assert.equal(attackBlock(s,'CHL','ARG'),null);assert.ok(attackBlock(s,'CHL','MEX'));assert.ok(action(s,'attack','MEX','CHL').error);
 addIncident(s,'CUB','wind');assert.ok(attackBlock(s,'MEX','CUB'));assert.ok(movementBlock(s,'MEX','CUB'));assert.ok(action(s,'attack','ARG','CHL').ok);assert.equal(s.pendingBattle.attackingAir,false);
});
test('Food and harvest alter recruitment locally for the exact advertised amount',()=>{
 for(const [kind,expected] of [['food',12],['harvest',36],['production',30]]){const s=player(),before=s.countries.CHL.troops,other=s.countries.ARG.troops;addIncident(s,'CHL',kind);assert.equal(recruitAmount(s,'CHL'),expected);assert.ok(action(s,'recruit','CHL').ok);assert.equal(s.countries.CHL.troops,before+expected);assert.equal(s.countries.ARG.troops,other);}
});
test('Income and combat modifiers expire without changing base upgrades',()=>{
 const s=player(),base=countryIncome(s,s.countries.CHL),levels=structuredClone(s.countries.CHL);const e=addIncident(s,'CHL','industry');assert.equal(countryIncome(s,s.countries.CHL),Math.round(base*.5));s.turn=e.until+1;assert.equal(countryIncome(s,s.countries.CHL),base);assert.deepEqual(s.countries.CHL,levels);
 Object.assign(s,eventState(s.seed,s.turn));addIncident(s,'CHL','production');assert.equal(countryIncome(s,s.countries.CHL),Math.round(base*1.5));assert.equal(totalIncome(s),Math.round(base*1.5));
 Object.assign(s,eventState(s.seed,s.turn));addIncident(s,'CHL','rain');assert.equal(effectivePower(s,s.countries.CHL,true),Math.round(power(s.countries.CHL,true)*1.1));assert.deepEqual(s.countries.CHL,levels);
});
test('A paused convoy preserves units, survives reload, then advances once when roads reopen',()=>{
 const s=quietRoute();assert.ok(action(s,'transfer','URY','CHL').ok);clear(s);addIncident(s,'ARG','rain');
 // The rainfall occurs at the start of the next round, before that turn's movement.
 s.incidents[0].start++;s.incidents[0].until++;s.incidentHistory[0].start++;s.incidentHistory[0].until++;s.incidentCooldown.ARG++;tickOwn(s);
 assert.equal(s.turn,2);assert.equal(s.transfers[0].step,0);assert.equal(s.transfers[0].troops,50);assert.equal(s.movements.length,0);assert.ok(s.notifications.some(n=>n.title==='Convoy en espera'));assert.equal(s.ap,3);
 const restored=upgradeSave(s);assert.ok(restored);const before=JSON.stringify(restored);skipToPlayer(restored);assert.equal(JSON.stringify(restored),before);
 tickOwn(restored);assert.equal(restored.turn,3);assert.equal(restored.transfers[0].step,1);assert.equal(restored.movements.length,1);assert.ok(restored.notifications.some(n=>n.kind==='incidentEnd'&&n.target==='ARG'));assert.ok(validateSave(restored));
});
test('Cancelling a stopped convoy refunds its units locally, once, without spending an action',()=>{
 const s=quietRoute();action(s,'transfer','URY','CHL');clear(s);addIncident(s,'CHL','fuel');const cash=s.cash,ap=s.ap,id=s.transfers[0].id;assert.ok(cancelTransfer(s,id).ok);assert.equal(s.countries.CHL.troops,100);assert.equal(s.ap,ap);assert.equal(s.cash,cash);assert.equal(s.transfers.length,0);clear(s);assert.ok(cancelTransfer(s,id).error);assert.equal(s.countries.CHL.troops,100);
});
test('New routes avoid closed roads where a friendly detour exists',()=>{
 const s=player();for(const id of ['PER','BOL','BRA'])s.countries[id].owner='CHL';addIncident(s,'PER','rain');const route=friendlyRoute(s,'CHL','BRA');assert.deepEqual(route,['CHL','BOL','BRA']);assert.equal(routeBlock(s,route),null);
 addIncident(s,'BOL','rain');const before=JSON.stringify(s);assert.ok(action(s,'transfer','BRA','CHL').error);assert.equal(JSON.stringify(s),before);
});
test('AI cancels a planned attack for fuel and explains the actual decision',()=>{
 let explained=false;for(let seed=1;seed<80&&!explained;seed++){const s=createGame('MEX','hard',seed);s.phase='ai';s.turn=4;s.turnOrder=COUNTRIES.map(c=>({id:c.id,power:1}));s.turnIndex=COUNTRIES.findIndex(c=>c.id==='BRA');s.lastIncidentRound=4;s.countries.BRA.troops=200;s.countries.URY.troops=1;addIncident(s,'BRA','fuel');const r=playAITurn(s);assert.equal(r.changes.length,0);if(r.reasons.some(x=>x.text.includes('cancela su ataque'))){explained=true;assert.ok(s.notifications.some(n=>n.kind==='decision'&&n.details.incident.kind==='fuel'));const clone=upgradeSave(s);assert.ok(clone);const before=JSON.stringify(clone);playAITurn(clone);assert.equal(JSON.stringify(clone),before);}}
 assert.ok(explained,'an actual blocked intention must produce an explanation');
});
test('AI does not claim an event changed recruitment or upgrades when they were already capped',()=>{
 for(let seed=1;seed<=20;seed++){const s=createGame('MEX','hard',seed);s.phase='ai';s.turn=4;s.turnOrder=COUNTRIES.map(c=>({id:c.id,power:1}));s.turnIndex=COUNTRIES.findIndex(c=>c.id==='BRA');s.lastIncidentRound=4;
  for(const c of Object.values(s.countries)){c.troops=500;c.armor=c.air=c.fort=c.industry=4;}s.countries.BRA.troops=149;addIncident(s,'BRA','production');const report=playAITurn(s);assert.equal(s.countries.BRA.troops,150);assert.deepEqual(report.reasons,[]);
 }
});
test('Watching and skipping preserve all start, end and AI decision bulletins',()=>{
 const a=player();tickOwn(a);clear(a);endTurn(a);const b=structuredClone(a);while(a.phase==='ai'&&a.status==='playing'){playAITurn(a);finishAITurn(a);}skipToPlayer(b);assert.deepEqual(b,a);assert.ok(b.notifications.some(n=>n.kind==='incidentStart'));assert.ok(b.notifications.some(n=>n.kind==='incidentEnd'));assert.ok(b.inbox.length>0);
});
test('Version 3 campaigns migrate without rerolling mid-turn or losing pending scenes and convoys',()=>{
 const old=quietRoute();action(old,'transfer','URY','CHL');clear(old);old.version=3;for(const k of Object.keys(eventState(1)))delete old[k];old.notifications=old.notifications.filter(n=>!n.details);old.inbox=[];const s=upgradeSave(old);assert.ok(s);assert.equal(s.version,4);assert.equal(s.cash,old.cash);assert.equal(s.ap,old.ap);assert.deepEqual(s.countries,old.countries);assert.deepEqual(s.transfers,old.transfers);assert.equal(s.lastIncidentRound,s.turn);assert.equal(s.incidents.length,0);assert.deepEqual(upgradeSave(s),s);
 addIncident(s,'ARG','fuel');s.incidents[0].until+=100;assert.equal(validateSave(s),false);
});
test('Event windows state place, consequence, expiry and available choices; old events show their end',()=>{
 const s=player();for(const kind of Object.keys(INCIDENTS)){Object.assign(s,eventState(123,s.turn));const e=addIncident(s,'CHL',kind),card=incidentCard(s,e,{stage:'start'});assert.match(card,/Chile/);assert.ok(card.includes(INCIDENTS[kind].effect));assert.ok(card.includes(INCIDENTS[kind].advice));assert.ok(card.includes(`Hasta el final de la ronda ${e.until}`));const done=incidentCard({...s,turn:e.until+1},e,{stage:'end'});assert.match(done,/FINALIZADO/);assert.ok(!done.includes('QUÉ CAMBIA'));}
 const e=s.incidents[0],notice={text:'x',details:{incident:e,decision:'<script>unsafe</script>',stage:'decision'}};assert.ok(!decisionDetails(s,notice).includes('<script>'));assert.match(decisionDetails(s,notice),/&lt;script&gt;/);
});
