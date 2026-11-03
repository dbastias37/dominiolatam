import * as calendar from '../public/game/calendar.js';
import * as factions from '../public/game/factions.js';
import * as worldUI from '../public/game/world-ui.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import * as engine from '../public/game/engine.js';
import * as ops from '../public/game/operations.js';
import * as data from '../public/game/data.js';
import * as events from '../public/game/events.js';
import * as flags from '../public/game/flags.js';
import * as eventUI from '../public/game/event-ui.js';
import * as layout from '../public/game/layout.js';
import * as nav from '../public/game/navigation.js';
import * as roulette from '../public/game/roulette.js';
const code=fs.readFileSync(new URL('../public/game/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').split("document.addEventListener('click'")[0];
function ui(s){
 const elements=new Map(),timers=[];const element=selector=>{if(!elements.has(selector))elements.set(selector,{innerHTML:'',firstChild:null,setAttribute(){},classList:{add(){},remove(){},toggle(){}},querySelector(){return {focus(){}};}});return elements.get(selector);};
 const context=vm.createContext({...engine,...ops,...data,...events,...flags,...eventUI,...layout,...nav,...roulette,...calendar,...factions,...worldUI,console,structuredClone,matchMedia:()=>({matches:false}),localStorage:{getItem:()=>null,setItem(){}},document:{querySelector:element,body:element('body'),activeElement:null},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}});
 vm.runInContext(code+`\nrender=()=>{};playScene=()=>{sceneCalls++};let sceneCalls=0;map={resize(){},isInteracting:false,vehicleName:()=> 'Modelo'};globalThis.testUI={set(s){state=s;mode='play';selected='ARG';turnViewKey=turnKey();followCamera=false;interfaceState.reset();dismiss();},present,operationConfirm,handlers,notice:()=>modalKind,scenes:()=>sceneCalls,closeModal,setAuto(){stepByStep=false;},bombardPanel,battleBriefing,advanceSkip,skipAll,calendarModal,factionsModal,choose,settings:()=>({skipReport,busy}),setSelection(id){selected=id;},setOptions(x){campaignOptions=x;}};`,context);
 const h=context.testUI;h.set(s);return {h,html:()=>element('#modalRoot').innerHTML,timers};
}
function game(){const s=engine.createGame('CHL','normal',551);engine.drawFirst(s);engine.beginCampaign(s);engine.skipToPlayer(s);engine.finishBattle(s);engine.finishMovements(s);engine.acknowledge(s,s.inbox.slice());s.incidents=[];s.cash=999;return s;}

test('Preparing an attack pauses without spending; confirm starts combat and a truce avoids it',()=>{
 const s=game(),before=JSON.stringify(s),{h,html}=ui(s);h.operationConfirm('attack','CHL','ARG');assert.equal(JSON.stringify(s),before);assert.match(html(),/IR A LA BATALLA/);assert.match(html(),/OFRECER TREGUA/);assert.match(html(),/VOLVER SIN GASTAR/);assert.equal(h.notice(),'operation');h.handlers.confirmOperation();assert.ok(s.pendingBattle);assert.equal(s.ap,2);
 const t=game(),u=ui(t);u.h.operationConfirm('attack','CHL','ARG');u.h.handlers.peaceInstead();assert.equal(t.pendingBattle,null);assert.equal(t.ap,2);assert.ok(engine.treatyUntil(t,'CHL','ARG')>=t.turn);
});
test('Declaration is acknowledged before the scene; conquest is displayed only after finishing the scene',()=>{
 const s=game();s.countries.CHL.troops=500;s.countries.ARG.troops=1;s.seed=1;engine.action(s,'attack','ARG','CHL');const {h,html}=ui(s);h.present();assert.equal(h.notice(),'notice');assert.match(html(),/Guerra declarada/);assert.doesNotMatch(html(),/País conquistado/);assert.equal(h.scenes(),0);h.handlers.ack();h.present();assert.equal(h.scenes(),1);assert.equal(s.countries.ARG.owner,'ARG');engine.finishBattle(s);h.present();assert.match(html(),/País conquistado/);assert.equal(s.countries.ARG.owner,'CHL');h.closeModal();assert.equal(h.notice(),'notice');
});
test('Step mode waits at both rival boundaries; automatic mode remains optional',()=>{
 const s=game();engine.endTurn(s);engine.acknowledge(s,s.inbox.slice());const {h,html,timers}=ui(s);h.present();assert.equal(h.notice(),'turnStep');assert.match(html(),/VER SUS DECISIONES/);assert.equal(timers.length,0);assert.equal(s.aiReport,null);h.closeModal();assert.equal(h.notice(),'turnStep');h.handlers.continueRival();assert.ok(s.aiReport);assert.equal(s.pendingBattle,null);h.present();assert.match(html(),/CONTINUAR AL SIGUIENTE PAÍS/);assert.equal(timers.length,0);
 const a=ui(s);a.h.setAuto();a.h.present();assert.equal(a.h.notice(),'');assert.equal(a.timers.length,1);
});
test('Bombardment panel previews range, local loss and action cost with a distinct preparation gate',()=>{
 const s=game();s.countries.CHL.air=4;s.countries.CHL.bombers=true;const {h,html}=ui(s),panel=h.bombardPanel(s.countries.ARG);assert.match(panel,/1 de 2 pasos/);assert.match(panel,/36 → 18 cr/);assert.match(panel,/55 CR · 1 ACCIÓN/);h.operationConfirm('bombard','CHL','ARG');assert.match(html(),/ENVIAR BOMBARDEROS/);assert.equal(s.pendingBattle,null);h.handlers.confirmOperation();assert.equal(s.pendingBattle.type,'bombard');
});

test('Legacy pending scenes still precede their already-saved result notices',()=>{
 const s=game();engine.action(s,'attack','ARG','CHL');const pending=structuredClone(s.pendingBattle);engine.finishBattle(s);delete pending.resolution;delete pending.type;delete pending.stage;s.pendingBattle=pending;const {h}=ui(s);h.present();assert.equal(h.scenes(),1);assert.equal(h.notice(),'');
});

test('Fast-forward shows a player attack and its occupation, resumes automatically, and keeps the recap',()=>{
 let s;for(let seed=1;seed<200;seed++){const t=game();t.turn=5;t.seed=seed;t.phase='ai';t.ap=0;t.turnOrder=[{id:'ARG',power:1},{id:'CHL',power:1}];t.turnIndex=0;t.countries.PER.owner='CHL';for(const c of Object.values(t.countries)){c.troops=999;c.fort=4;}Object.assign(t.countries.ARG,{troops:1500,armor:4,air:4});Object.assign(t.countries.CHL,{troops:1,fort:0});const probe=structuredClone(t);engine.skipToPlayer(probe,{stopAtPlayerAttack:true});if(probe.pendingBattle?.target==='CHL'){s=t;break;}}
 assert.ok(s);const notice=engine.notify(s,'peace','Aviso conservado','Otra noticia',{actor:'MEX'}),{h,html,timers}=ui(s);h.skipAll();assert.equal(s.fastForward,true);assert.equal(s.pendingBattle.target,'CHL');assert.ok(s.skipDeferred.includes(notice.id));assert.ok(engine.upgradeSave(s));h.present();assert.match(html(),/Guerra declarada/);assert.equal(timers.length,1);timers.at(-1)();h.present();assert.equal(h.scenes(),1);assert.equal(s.pendingBattle.stage,'animation');engine.finishBattle(s);h.present();assert.match(html(),/Chile conquistado/);assert.match(html(),/Continuará automáticamente/);timers.at(-1)();h.present();assert.equal(h.scenes(),2);assert.ok(s.pendingOccupation);engine.finishOccupation(s);h.present();assert.equal(s.fastForward,false);assert.equal(engine.currentFaction(s),'CHL');assert.equal(s.skipDeferred.length,0);h.present();assert.equal(h.notice(),'report');assert.match(html(),/Aviso conservado/);assert.equal(s.countries.CHL.owner,'ARG');
});
test('Pausing fast-forward restores deferred unread notices and leaves combat unresolved',()=>{
 const s=game();engine.endTurn(s);engine.acknowledge(s,s.inbox.slice());s.fastForward=true;const n=engine.notify(s,'world','Noticia previa','Conservada',{actor:'MEX'});s.skipDeferred=[n.id];s.inbox=[];const {h}=ui(s);h.handlers.pauseFastForward();assert.equal(s.fastForward,false);assert.ok(s.inbox.includes(n.id));assert.equal(n.read,false);
});
test('New campaign controls pass custom faction settings and show the calendar without replacing classic campaigns',()=>{
 const {h,html}=ui(game());h.setSelection('CHL');h.setOptions({mode:'factions',partner:'ARG',name:'Liga Sur',color:'#43a482',secondary:'#3c8cc9',symbol:'mountain'});assert.match(h.choose(),/Liga Sur/);h.calendarModal();assert.match(html(),/TIEMPO DE CAMPAÑA/);assert.match(html(),/semana/);h.handlers.close();h.handlers.start();h.factionsModal();assert.match(html(),/Liga Sur/);assert.match(html(),/Argentina · Chile/);
});
