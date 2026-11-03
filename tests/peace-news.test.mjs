import test from 'node:test';import assert from 'node:assert/strict';
import {PEACE_BULLETINS,drawPeaceBulletin} from '../public/game/peace-news.js';
import {calendarState,advanceCalendar,worldHeadline,WORLD_NEWS,validateCalendar} from '../public/game/calendar.js';
import {createGame,upgradeSave,validateSave} from '../public/game/engine.js';
import {calendarView} from '../public/game/world-ui.js';
test('One hundred original peace dispatches rotate without repetition and do not consume battle randomness',()=>{
 assert.equal(PEACE_BULLETINS.length,100);assert.equal(new Set(PEACE_BULLETINS).size,100);assert.ok(PEACE_BULLETINS.every(s=>typeof s==='string'&&s.length>90&&s.length<330));
 const s=createGame('CHL','normal',123),seed=s.seed,ids=Array.from({length:100},()=>drawPeaceBulletin(s.calendar,s.seed));assert.equal(new Set(ids).size,100);assert.notEqual(drawPeaceBulletin(s.calendar,s.seed),ids.at(-1));assert.equal(s.seed,seed);assert.equal(WORLD_NEWS.peace.duration,4);assert.match(WORLD_NEWS.peace.title,/ONU/);
});
test('Saved news keep the exact headline and the remaining shuffled order; campaigns have different decks',()=>{
 const a=createGame('CHL','normal',12);for(let i=0;i<36;i++)drawPeaceBulletin(a.calendar,a.seed);assert.ok(validateSave(a));const b=upgradeSave(JSON.parse(JSON.stringify(a)));assert.ok(b);for(let i=0;i<90;i++)assert.equal(drawPeaceBulletin(a.calendar,a.seed),drawPeaceBulletin(b.calendar,b.seed));
 const c=calendarState(0,99),d=calendarState(0,100);assert.notDeepEqual(Array.from({length:12},()=>drawPeaceBulletin(c)),Array.from({length:12},()=>drawPeaceBulletin(d)));
});
test('Peace event, calendar history and reload all retain the same randomly selected dispatch',()=>{
 const s=createGame('CHL','normal',851);for(let i=1;i<=8;i++){s.turn=i;advanceCalendar(s);}const event=structuredClone(s.calendar.active),headline=worldHeadline(event);assert.ok(Number.isInteger(event.bulletin));assert.equal(headline,PEACE_BULLETINS[event.bulletin]);assert.equal(worldHeadline(s.calendar.history[0]),headline);const restored=upgradeSave(s);assert.ok(restored);assert.equal(worldHeadline(restored.calendar.active),headline);assert.equal(advanceCalendar(restored).started,null);assert.match(calendarView(restored,()=>'<svg/>'),new RegExp(headline.slice(0,24).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});
test('Legacy calendars keep their existing bulletin and malformed news decks are rejected',()=>{
 const s=createGame();s.turn=8;s.calendar={start:'2026-11-02',lastRound:8,active:{kind:'peace',start:8,until:11},history:[{kind:'peace',start:8,until:11}]};assert.ok(validateCalendar(s));assert.equal(worldHeadline(s.calendar.active),WORLD_NEWS.peace.headline);assert.ok(upgradeSave(s));for(const patch of [{peaceDeck:[0,0]},{peaceDeck:[100]},{newsSeed:-1},{lastPeaceBulletin:100},{active:{kind:'peace',start:8,until:11,bulletin:100}}])assert.equal(validateCalendar({...s,calendar:{...s.calendar,...patch}}),false);
});
test('Revised dispatches retain old published headlines and start a fresh 100-item cycle on migration',()=>{const s=createGame();s.turn=20;s.calendar.active={kind:'peace',start:20,until:23,bulletin:0};s.calendar.history=[{...s.calendar.active}];s.calendar.lastRound=20;const old=worldHeadline(s.calendar.active);assert.match(old,/IA revisó/);s.calendar.peaceDeck=[0];s.calendar.newsCatalog=1;drawPeaceBulletin(s.calendar);assert.equal(s.calendar.peaceDeck.length,99);assert.equal(worldHeadline(s.calendar.active),old);s.turn=32;advanceCalendar(s);assert.equal(s.calendar.active.catalog,2);assert.equal(worldHeadline(s.calendar.active),PEACE_BULLETINS[s.calendar.active.bulletin]);});
