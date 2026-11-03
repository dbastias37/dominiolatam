import test from 'node:test';
import assert from 'node:assert/strict';
import {COUNTRIES} from '../public/game/data.js';
import {createGame,drawFirst,beginCampaign,skipToPlayer,acknowledge,resolveEvent,finishBattle,finishOccupation,finishMovements,action,upgradeSave,validateSave,owned,checkEnd,playAITurn,finishAITurn,countryIncome,currentFaction,offerBattleTruce,beginBattle,endTurn} from '../public/game/engine.js';
import {BOMBARD,airRoute,industryDamage,bombardBlock,markIndustryIncome,consumeIndustryTurn} from '../public/game/operations.js';
import {addIncident} from '../public/game/events.js';
function clear(s){finishBattle(s);finishOccupation(s);finishMovements(s);acknowledge(s,s.inbox.slice());if(s.event)resolveEvent(s,0);}
function game(){const s=createGame('CHL','normal',551);drawFirst(s);beginCampaign(s);skipToPlayer(s);clear(s);s.incidents=[];s.cash=1000;return s;}
function armed(){const s=game();s.countries.CHL.air=4;assert.ok(action(s,'bombers','CHL').ok);clear(s);return s;}
function aiAttack({defender='CHL',seed=1}={}){for(let i=seed;i<3000;i++){const s=game();s.turn=5;s.seed=i;s.phase='ai';s.ap=0;s.turnOrder=[{id:'ARG',power:1000},{id:'CHL',power:1}];s.turnIndex=0;s.countries.ARG.troops=800;s.countries.ARG.armor=4;s.countries.ARG.air=4;for(const c of Object.values(s.countries))if(c.id!=='ARG'){c.troops=200;c.fort=4;}s.countries[defender].troops=1;s.countries[defender].fort=0;playAITurn(s);if(s.pendingBattle?.target===defender)return s;}throw new Error('no attack fixture');}

test('Battle outcomes, credits, elimination and end of campaign wait until the animation boundary',()=>{
 const s=game();for(const c of Object.values(s.countries))if(c.id!=='ARG')c.owner='CHL';s.countries.CHL.troops=500;s.countries.ARG.troops=1;s.seed=1;const countries=structuredClone(s.countries),cash=s.cash;
 assert.ok(action(s,'attack','ARG','CHL').ok);assert.equal(s.pendingBattle.won,true);assert.deepEqual(s.countries,countries);assert.equal(s.cash,cash-25);assert.equal(s.stats.battles,0);assert.equal(s.status,'playing');assert.equal(owned(s).length,19);assert.ok(!s.notifications.some(n=>/conquistado|mapa cambió/i.test(n.title)));assert.ok(validateSave(s));
 const restored=upgradeSave(JSON.parse(JSON.stringify(s)));assert.ok(restored);finishBattle(restored);assert.equal(restored.status,'won');assert.equal(restored.countries.ARG.owner,'CHL');assert.equal(restored.cash,cash+10);assert.equal(restored.stats.battles,1);assert.match(restored.notifications.find(n=>n.kind==='victory').text,/Argentina pasa de Argentina a Chile/);const once=JSON.stringify(restored);finishBattle(restored);assert.equal(JSON.stringify(restored),once);
});
test('A repelled attack keeps ownership and returns survivors only after battle',()=>{
 const s=game();s.countries.CHL.troops=12;s.countries.ARG.troops=900;s.seed=9999;const before=structuredClone(s.countries);action(s,'attack','ARG','CHL');assert.equal(s.pendingBattle.won,false);assert.deepEqual(s.countries,before);finishBattle(s);assert.equal(s.countries.ARG.owner,'ARG');assert.equal(s.countries.CHL.troops,7);assert.equal(s.stats.battles,0);assert.match(s.notifications.at(-1).text,/supervivientes se retiran/);
});
test('AI plans contain no conquest spoiler, pending defeat remains playable, and skip commits the same outcome',()=>{
 const s=aiAttack();assert.ok(s.pendingBattle);assert.equal(s.countries.CHL.owner,'CHL');assert.equal(s.status,'playing');assert.equal(s.aiReport.changes.length,0);assert.ok(!s.aiReport.actions.some(a=>a.text.includes('Conquistó')));assert.ok(!s.notifications.some(n=>n.title==='El mapa cambió'));assert.ok(validateSave(s));
 const skipped=upgradeSave(s),watched=upgradeSave(s);beginBattle(watched);finishBattle(watched);finishOccupation(watched);finishAITurn(watched);finishAITurn(skipped);assert.deepEqual(skipped,watched);assert.equal(skipped.status,'lost');assert.match(skipped.aiReport.actions.at(-1).text,/Conquistó/);
});
test('Emergency truce cancels a pending AI battle without applying any casualties or conquest',()=>{
 const s=aiAttack(),countries=structuredClone(s.countries),cash=s.cash;assert.ok(offerBattleTruce(s).ok);assert.equal(s.pendingBattle,null);assert.deepEqual(s.countries,countries);assert.equal(s.cash,cash-35);assert.equal(s.ap,0);assert.equal(s.status,'playing');assert.ok(s.treaties['ARG:CHL']>=s.turn);assert.equal(s.wars.includes('ARG:CHL'),false);assert.ok(!s.aiReport.actions.some(a=>a.pendingOperation));const snapshot=JSON.stringify(s);finishBattle(s);assert.equal(JSON.stringify(s),snapshot);assert.ok(offerBattleTruce(s).error);
 const poor=aiAttack();poor.cash=34;const before=JSON.stringify(poor);assert.ok(offerBattleTruce(poor).error);assert.equal(JSON.stringify(poor),before);beginBattle(poor);assert.ok(offerBattleTruce(poor).error);
});
test('Bombers unlock only in an individually upgraded air level 4 base and cost one action',()=>{
 const s=game(),before=JSON.stringify(s);assert.ok(action(s,'bombers','CHL').error);assert.equal(JSON.stringify(s),before);s.countries.CHL.air=4;assert.ok(action(s,'bombers','CHL').ok);assert.equal(s.cash,860);assert.equal(s.ap,2);assert.equal(s.countries.CHL.bombers,true);assert.equal(s.countries.ARG.bombers,undefined);clear(s);const unlocked=JSON.stringify(s);assert.ok(action(s,'bombers','CHL').error);assert.equal(JSON.stringify(s),unlocked);
});
test('Bombardment range counts map links, including sea links, and cannot reach Mexico from Chile',()=>{
 assert.deepEqual(airRoute('CHL','ARG'),['CHL','ARG']);assert.equal(airRoute('CHL','BRA').length,3);assert.equal(airRoute('CHL','MEX'),null);assert.deepEqual(airRoute('MEX','HTI'),['MEX','CUB','HTI']);assert.equal(airRoute('CHL','CHL'),null);
 const s=armed(),before=JSON.stringify(s);assert.ok(action(s,'bombard','MEX','CHL').error);assert.equal(JSON.stringify(s),before);
});
test('Bombardments affect only industrial production after the flight and are safe across reload or skip',()=>{
 const s=armed(),before=structuredClone(s.countries),cash=s.cash;assert.ok(action(s,'bombard','ARG','CHL').ok);assert.deepEqual(s.countries,before);assert.equal(s.industryDamage.ARG,undefined);assert.equal(s.cash,cash-BOMBARD.cost);assert.ok(validateSave(s));
 const copy=upgradeSave(s);assert.ok(copy);finishBattle(copy);assert.deepEqual(copy.countries.ARG,before.ARG);assert.equal(copy.countries.ARG.troops,before.ARG.troops);assert.equal(copy.countries.ARG.industry,before.ARG.industry);assert.equal(countryIncome(copy,copy.countries.ARG),18);assert.equal(countryIncome(copy,copy.countries.CHL),36);assert.equal(copy.industryDamage.ARG.remaining,2);assert.equal(copy.stats.battles,0);assert.ok(validateSave(copy));const once=JSON.stringify(copy);finishBattle(copy);assert.equal(JSON.stringify(copy),once);
});
test('Industrial damage lasts exactly two income turns, preserves base income, and cannot be stacked',()=>{
 const s=armed();action(s,'bombard','ARG','CHL');clear(s);assert.match(bombardBlock(s,'CHL','ARG'),/ya bombardeó/);s.turn++;assert.match(bombardBlock(s,'CHL','ARG'),/reparación/);s.countries.ARG.industry=4;assert.equal(countryIncome(s,s.countries.ARG),24);
 consumeIndustryTurn(s,'ARG');assert.equal(s.industryDamage.ARG.remaining,2);markIndustryIncome(s,'ARG');consumeIndustryTurn(s,'ARG');assert.equal(s.industryDamage.ARG.remaining,1);consumeIndustryTurn(s,'ARG');assert.equal(s.industryDamage.ARG.remaining,1);assert.ok(upgradeSave(s));s.turn++;markIndustryIncome(s,'ARG');assert.deepEqual(consumeIndustryTurn(s,'ARG'),['ARG']);assert.equal(industryDamage(s,'ARG'),null);assert.equal(countryIncome(s,s.countries.ARG),60);
});
test('AI damaged industry recovers on its own turns and releases a repair notice',()=>{
 const s=armed();action(s,'bombard','ARG','CHL');clear(s);s.phase='ai';s.ap=0;s.turnOrder=[{id:'ARG',power:100},{id:'CHL',power:200}];s.turnIndex=0;s.seed=1234;playAITurn(s);assert.equal(s.industryDamage.ARG.remaining,2);assert.ok(s.aiReport.actions.some(a=>a.text.includes('reparación')));finishAITurn(s);assert.equal(s.industryDamage.ARG.remaining,1);
 s.turn++;s.phase='ai';s.ap=0;s.turnIndex=0;playAITurn(s);finishAITurn(s);assert.equal(industryDamage(s,'ARG'),null);assert.ok(s.notifications.some(n=>n.title==='Industria reparada'));
});
test('Damage follows a conquered industry and counts the new owner’s turns',()=>{
 const s=armed();action(s,'bombard','ARG','CHL');clear(s);s.countries.ARG.owner='CHL';markIndustryIncome(s,'ARG');consumeIndustryTurn(s,'ARG');assert.equal(s.industryDamage.ARG.remaining,2);markIndustryIncome(s,'CHL');consumeIndustryTurn(s,'CHL');assert.equal(s.industryDamage.ARG.remaining,1);
});
test('Wind, fuel, treaties, material shortages and insufficient funds block operations without a charge',()=>{
 for(const [target,kind] of [['CHL','wind'],['ARG','wind'],['CHL','fuel']]){const s=armed();addIncident(s,target,kind);const before=JSON.stringify(s);assert.ok(action(s,'bombard','ARG','CHL').error);assert.equal(JSON.stringify(s),before);}
 const s=armed();s.treaties['ARG:CHL']=s.turn+4;const before=JSON.stringify(s);assert.ok(action(s,'bombard','ARG','CHL').error);assert.equal(JSON.stringify(s),before);
 const t=game();t.countries.CHL.air=4;addIncident(t,'CHL','materials');const prev=JSON.stringify(t);assert.ok(action(t,'bombers','CHL').error);assert.equal(JSON.stringify(t),prev);
 const poor=armed();poor.cash=54;const last=JSON.stringify(poor);assert.ok(action(poor,'bombard','ARG','CHL').error);assert.equal(JSON.stringify(poor),last);
});
test('Local weather multiplies reduced industry correctly and never removes the base upgrade',()=>{
 const s=armed();action(s,'bombard','ARG','CHL');clear(s);addIncident(s,'ARG','production');assert.equal(countryIncome(s,s.countries.ARG),27);assert.equal(s.countries.ARG.industry,2);s.incidents=[];addIncident(s,'ARG','industry');assert.equal(countryIncome(s,s.countries.ARG),9);
});
test('Legacy already-committed battles are not applied twice, while corrupt deferred operations are rejected',()=>{
 const s=game();action(s,'attack','ARG','CHL');const legacy=structuredClone(s);finishBattle(legacy);legacy.pendingBattle={...s.pendingBattle};delete legacy.pendingBattle.resolution;delete legacy.pendingBattle.stage;delete legacy.pendingBattle.type;const restored=upgradeSave(legacy);assert.ok(restored);const countries=structuredClone(restored.countries),cash=restored.cash;finishBattle(restored);assert.deepEqual(restored.countries,countries);assert.equal(restored.cash,cash);
 const corrupt=structuredClone(s);corrupt.pendingBattle.resolution.countries.ARG.troops=-2;assert.equal(upgradeSave(corrupt),null);
 const damage=armed();damage.industryDamage.ARG={remaining:-2,attacker:'CHL',appliedRound:1};assert.equal(validateSave(damage),false);
});

test('AI bombardment obeys the same range, territorial immunity, cooldown and deferred result rules',()=>{
 let chosen=null;
 for(let seed=1;seed<200&&!chosen;seed++){const s=createGame('MEX','hard',seed);s.turn=5;s.phase='ai';s.ap=0;s.turnOrder=[{id:'CHL',power:50},{id:'MEX',power:60}];s.turnIndex=0;for(const c of Object.values(s.countries)){c.troops=200;c.fort=4;}s.countries.CHL.troops=1;s.countries.CHL.air=4;s.countries.CHL.bombers=true;s.countries.ARG.industry=4;playAITurn(s);if(s.pendingBattle?.type==='bombard')chosen=s;}
 assert.ok(chosen);assert.equal(chosen.pendingBattle.target,'ARG');assert.ok(chosen.pendingBattle.route.length<=3);assert.equal(chosen.industryDamage.ARG,undefined);const before=structuredClone(chosen.countries.ARG);assert.ok(validateSave(chosen));finishBattle(chosen);assert.equal(chosen.countries.ARG.owner,before.owner);assert.equal(chosen.countries.ARG.troops,before.troops);assert.equal(chosen.industryDamage.ARG.remaining,2);assert.equal(chosen.countries.CHL.lastBombardRound,5);
});
