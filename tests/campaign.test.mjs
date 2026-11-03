import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {COUNTRIES,neighbors} from '../public/game/data.js';
import {createGame,action,endTurn,resolveEvent,validateSave,upgradeSave,owned,checkEnd,forecast,totalIncome,drawFirst,beginCampaign,currentFaction,isPlayerTurn,activeFactions,playAITurn,finishAITurn,skipToPlayer,acknowledge,pendingNotices,treatyUntil,finishBattle,finishOccupation,finishMovements,friendlyRoute,transferOrigins,weatherDefense,weatherAttack} from '../public/game/engine.js';
function clear(s){finishBattle(s);finishOccupation(s);finishMovements(s);acknowledge(s,s.inbox.slice());if(s.event)resolveEvent(s,0);}
function start(player='CHL',difficulty='explorer',seed=211){const s=createGame(player,difficulty,seed);drawFirst(s);beginCampaign(s);skipToPlayer(s);clear(s);return s;}
function cycle(s){clear(s);assert.ok(endTurn(s).ok);clear(s);skipToPlayer(s);clear(s);}

test('Twenty real local flag images and connected selectable countries',()=>{
 assert.equal(COUNTRIES.length,20);const seen=new Set(['CHL']),queue=['CHL'];while(queue.length)for(const id of neighbors(queue.shift()))if(!seen.has(id)){seen.add(id);queue.push(id);}assert.equal(seen.size,20);
 for(const c of COUNTRIES){assert.match(fs.readFileSync(new URL(`../public/game/flags/${c.iso.toLowerCase()}.svg`,import.meta.url),'utf8'),/<svg/);const s=createGame(c.id);assert.ok(validateSave(s));assert.equal(s.ap,0);assert.equal(s.phase,'draw');assert.equal(action(s,'recruit',c.id).ok,undefined);}
});
test('Roulette can choose any nation and does not favor the player',()=>{
 const first=new Set();for(let seed=1;seed<=200;seed++){const s=createGame('CHL','explorer',seed*7919);const r=drawFirst(s);first.add(r.first);assert.equal(r.order[0].id,r.first);assert.equal(new Set(r.order.map(o=>o.id)).size,20);for(let i=2;i<r.order.length;i++)assert.ok(r.order[i].power>=r.order[i-1].power);const before=JSON.stringify(s);assert.ok(drawFirst(s).error);assert.equal(JSON.stringify(s),before);}assert.equal(first.size,20);
});
test('Each surviving faction plays once; order stays fixed within a round',()=>{
 const s=createGame('CHL','normal',4321);drawFirst(s);beginCampaign(s);const snapshot=JSON.stringify(s.turnOrder),acted=new Set();while(s.turn===1&&s.status==='playing'){
  clear(s);const id=currentFaction(s);assert.ok(!acted.has(id),`duplicate ${id}`);acted.add(id);
  if(isPlayerTurn(s)){action(s,'recruit','CHL');clear(s);assert.equal(JSON.stringify(s.turnOrder),snapshot);endTurn(s);}
  else{playAITurn(s);assert.equal(JSON.stringify(s.turnOrder),snapshot);finishAITurn(s);}
 }
 assert.equal(s.turn,2);for(let i=1;i<s.turnOrder.length;i++)assert.ok(s.turnOrder[i].power>=s.turnOrder[i-1].power);assert.ok(acted.has('CHL'));
});
test('All three actions can be domestic, and purchases affect only the selected territory',()=>{
 const s=start(),before=structuredClone(s.countries.ARG),cash=s.cash;
 assert.ok(action(s,'industry','CHL').ok);assert.equal(s.countries.CHL.industry,3);assert.equal(s.cash,cash-100);assert.deepEqual(s.countries.ARG,before);assert.equal(s.ap,2);assert.ok(pendingNotices(s).length);
 assert.ok(action(s,'recruit','CHL').error);clear(s);assert.ok(action(s,'recruit','CHL').ok);clear(s);assert.ok(action(s,'recruit','CHL').ok);clear(s);assert.equal(s.ap,0);assert.equal(s.stats.battles,0);assert.equal(owned(s).length,1);
 const snapshot=JSON.stringify(s);assert.ok(action(s,'trade','ARG').error);assert.equal(JSON.stringify(s),snapshot);cycle(s);assert.equal(s.ap,3);assert.equal(s.spent.length,0);
});
test('Watching and skipping run the exact same decisions and preserve every notice',()=>{
 const base=start('CHL','hard',5951);for(let i=0;i<3;i++)cycle(base);endTurn(base);clear(base);
 const watch=structuredClone(base),skip=structuredClone(base);let ticks=0;
 while(watch.phase==='ai'&&watch.status==='playing'){playAITurn(watch);assert.ok(validateSave(watch));finishAITurn(watch);ticks++;}
 const r=skipToPlayer(skip);assert.equal(r.count,ticks);assert.deepEqual(skip,watch);assert.ok(skip.inbox.length>0);assert.ok(pendingNotices(skip).some(n=>n.kind==='yourturn'||n.kind==='danger'));
});
test('AI result and cursor survive reload without replaying actions',()=>{
 const s=start('CHL','normal',3204);endTurn(s);clear(s);assert.equal(s.phase,'ai');playAITurn(s);const restored=upgradeSave(JSON.parse(JSON.stringify(s)));assert.ok(restored);const before=JSON.stringify(restored);playAITurn(restored);assert.equal(JSON.stringify(restored),before);finishAITurn(s);finishAITurn(restored);assert.deepEqual(restored,s);
});
test('Income is credited once per player turn; zero-action turns are valid',()=>{
 const s=start();const oldCash=s.cash,expected=totalIncome(s);endTurn(s);assert.ok(pendingNotices(s).some(n=>n.kind==='endturn'&&n.text.includes('0 de tus 3')));skipToPlayer(s);assert.equal(s.turn,2);assert.equal(s.cash,oldCash+expected);const cash=s.cash;const restored=upgradeSave(s);skipToPlayer(restored);assert.equal(restored.cash,cash);assert.ok(action(s,'recruit','CHL').error);clear(s);assert.ok(isPlayerTurn(s));
});
test('War, peace and trade have persistent visual notices and block forbidden attacks',()=>{
 const s=start('CHL','normal',551);assert.ok(action(s,'attack','ARG','CHL').ok);assert.ok(pendingNotices(s).some(n=>n.kind==='war'));assert.ok(!pendingNotices(s).some(n=>['battle','victory'].includes(n.kind)));finishBattle(s);assert.ok(pendingNotices(s).some(n=>['battle','victory'].includes(n.kind)));clear(s);
 const foreign=Object.values(s.countries).find(c=>c.owner!==s.player&&neighbors('CHL').includes(c.id));assert.ok(action(s,'peace',foreign.id).ok);assert.ok(treatyUntil(s,s.player,foreign.owner)>=s.turn);clear(s);assert.ok(action(s,'attack',foreign.id,'CHL').error);assert.ok(action(s,'trade','MEX').ok);clear(s);assert.ok(action(s,'trade','MEX').error);
});
test('Eliminated countries are skipped and give no extra faction turn',()=>{
 const s=createGame('CHL','explorer',762);drawFirst(s);beginCampaign(s);const next=s.turnOrder[1].id,actor=s.turnOrder[0].id;
 for(const c of Object.values(s.countries))if(c.owner===next)c.owner=actor;
 if(isPlayerTurn(s)){clear(s);endTurn(s);}else{playAITurn(s);finishAITurn(s);}
 assert.notEqual(currentFaction(s),next);assert.ok(!activeFactions(s).includes(next));assert.equal(s.turnIndex,2);
});
test('A diplomacy campaign still reaches victory through real actions',()=>{
 const s=start('CHL','explorer',211);while(s.status==='playing'&&s.turn<80){clear(s);
  while(s.ap>0&&isPlayerTurn(s)){
   const targets=Object.values(s.countries).filter(c=>c.owner!==s.player).sort((a,b)=>b.relation-a.relation);if(!targets.length)break;let r=action(s,targets[0].relation>=70?'join':'talk',targets[0].id);
   if(r.error){const t=targets.find(c=>c.traded!==s.turn);if(!t)break;r=action(s,'trade',t.id);if(r.error)break;}clear(s);
  }
  if(s.status==='playing')cycle(s);assert.ok(validateSave(s));
 }
 assert.equal(s.status,'won');assert.equal(owned(s).length,20);console.log(`Diplomacy won in ${s.turn} rounds.`);
});
test('V1 saves migrate without losing money, territories or remaining actions',()=>{
 const legacy={...createGame('CHL','normal',42),version:1,turn:8,ap:1,cash:999,status:'playing',event:null};legacy.countries.ARG.owner='CHL';legacy.countries.PER.truce=11;
 const s=upgradeSave(legacy);assert.ok(s);assert.equal(s.cash,999);assert.equal(s.ap,1);assert.equal(s.turn,8);assert.deepEqual(s.countries,legacy.countries);assert.ok(isPlayerTurn(s));assert.equal(treatyUntil(s,'CHL','PER'),11);assert.ok(s.inbox.length);assert.ok(validateSave(s));assert.deepEqual(upgradeSave(s),s);
});
test('All save phases, events and terminal states validate; corrupt saves fail',()=>{
 const s=createGame();assert.ok(validateSave(s));drawFirst(s);assert.ok(validateSave(s));beginCampaign(s);assert.ok(validateSave(s));skipToPlayer(s);clear(s);
 while(s.turn<5)cycle(s);assert.equal(s.lastEventRound,5);assert.equal(resolveEvent(s,0),false);
 for(const c of Object.values(s.countries))c.owner='BRA';assert.equal(checkEnd(s),'lost');assert.ok(action(s,'talk','BRA').error);assert.ok(validateSave(s));assert.equal(validateSave(null),false);assert.equal(validateSave({version:2}),false);s.countries.CHL.troops=-1;assert.equal(validateSave(s),false);
});
test('Long campaigns preserve state while opponents play individually',()=>{
 for(const d of ['explorer','normal','hard'])for(let seed=1;seed<=7;seed++){const s=start('BRA',d,seed*539);while(s.turn<35&&s.status==='playing'){cycle(s);assert.ok(validateSave(s));assert.ok(s.cash>=0);}}
});

test('Four-leg convoys take four own turns, preserve units and do not spend more actions',()=>{
 const s=start('MEX','explorer',211);for(const id of ['GTM','HND','NIC','CRI'])s.countries[id].owner='MEX';
 // Protect the test route from opponents so only convoy timing is under test.
 for(const c of Object.values(s.countries))if(c.owner!=='MEX'){c.troops=1;c.armor=0;c.air=0;c.fort=0;}
 s.countries.MEX.troops=100;const destination=s.countries.CRI.troops;
 assert.deepEqual(friendlyRoute(s,'MEX','CRI'),['MEX','GTM','HND','NIC','CRI']);
 assert.ok(transferOrigins(s,'CRI').some(c=>c.id==='MEX'));assert.ok(action(s,'transfer','CRI','MEX').ok);
 assert.equal(s.countries.MEX.troops,50);assert.equal(s.countries.CRI.troops,destination);assert.equal(s.transfers[0].step,0);assert.equal(s.ap,2);
 for(let step=1;step<=4;step++){
  clear(s);endTurn(s);skipToPlayer(s);assert.ok(validateSave(s));assert.equal(s.ap,3);
  assert.equal(s.movements.length,1);assert.equal(s.movements[0].source,['MEX','GTM','HND','NIC'][step-1]);assert.equal(s.movements[0].troops,50);
  if(step<4){assert.equal(s.transfers[0].step,step);assert.ok(s.countries.CRI.troops<destination+50);}else{assert.equal(s.transfers.length,0);assert.ok(s.countries.CRI.troops>=destination+50);}
  const resumed=upgradeSave(s),before=JSON.stringify(resumed);skipToPlayer(resumed);assert.equal(JSON.stringify(resumed),before);
 }
});
test('Broken routes return troops locally; a captured convoy cannot teleport or duplicate',()=>{
 for(const capturedCurrent of [false,true]){const s=start('MEX');s.countries.GTM.owner=s.countries.HND.owner='MEX';s.countries.MEX.troops=100;action(s,'transfer','HND','MEX');
  s.countries[capturedCurrent?'MEX':'GTM'].owner='BRA';clear(s);endTurn(s);skipToPlayer(s);
  assert.equal(s.transfers.length,0);assert.equal(s.movements.length,0);assert.ok(pendingNotices(s).some(n=>n.title===(capturedCurrent?'Convoy detenido':'Camino cortado')));
  if(!capturedCurrent)assert.ok(s.countries.MEX.troops>=100);assert.ok(validateSave(s));
 }
});
test('Enemy gaps, same-country and insufficient-garrison transfers have no side effects',()=>{
 const s=start('MEX');s.countries.HND.owner='MEX';const before=JSON.stringify(s);
 assert.equal(friendlyRoute(s,'MEX','HND'),null);assert.ok(action(s,'transfer','HND','MEX').error);assert.ok(action(s,'transfer','MEX','MEX').error);assert.equal(JSON.stringify(s),before);
 s.countries.GTM.owner='MEX';s.countries.MEX.troops=15;assert.ok(action(s,'transfer','HND','MEX').error);
});
test('Battle presentation survives reload; watching and skipping commit once',()=>{
 const s=start('CHL','normal',551),before=structuredClone(s.countries);const r=action(s,'attack','ARG','CHL');assert.ok(r.ok);assert.deepEqual(s.pendingBattle.beforeCountries,before);assert.equal(s.pendingBattle.source,'CHL');assert.equal(s.pendingBattle.target,'ARG');
 const resume=upgradeSave(s);assert.ok(resume);assert.deepEqual(resume.pendingBattle,s.pendingBattle);assert.deepEqual(s.countries,before);assert.ok(action(s,'recruit','CHL').error);finishBattle(s);finishBattle(resume);assert.deepEqual(s,resume);const committed=JSON.stringify(s);finishBattle(s);assert.equal(JSON.stringify(s),committed);assert.ok(validateSave(s));
});
test('Weather modifiers last only their round and never rewrite military levels',()=>{
 const s=start(),original=forecast(s,'CHL','ARG'),levels=structuredClone(s.countries.CHL);
 s.worldEvent={kind:'rain',round:s.turn,target:'ARG'};assert.equal(weatherDefense(s,'ARG'),1.1);assert.ok(forecast(s,'CHL','ARG').defense>original.defense);
 s.worldEvent={kind:'wind',round:s.turn,target:'CHL'};assert.equal(weatherAttack(s,'CHL'),.9);assert.ok(forecast(s,'CHL','ARG').attack<original.attack);assert.deepEqual(s.countries.CHL,levels);
 s.worldEvent.round--;assert.equal(weatherAttack(s,'CHL'),1);assert.deepEqual(forecast(s,'CHL','ARG'),original);
});
test('Version 2 saves migrate without changing the campaign, and invalid new fields are rejected',()=>{
 const v2={...start(),version:2};for(const k of ['transfers','transferCounter','movements','worldNews','worldEvent','pendingBattle'])delete v2[k];const s=upgradeSave(v2);assert.ok(s);assert.equal(s.version,4);assert.deepEqual(s.countries,v2.countries);assert.equal(s.ap,v2.ap);assert.equal(s.cash,v2.cash);
 s.transfers=[{owner:'CHL',route:['CHL','MEX'],step:0,troops:20,lastMovedRound:s.turn}];assert.equal(validateSave(s),false);
});
