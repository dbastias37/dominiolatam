import test from 'node:test';
import assert from 'node:assert/strict';
import {COUNTRIES} from '../public/game/data.js';
import {rouletteView,spinRoulette,settleRoulette} from '../public/game/roulette.js';
import {createGame,drawFirst} from '../public/game/engine.js';

test('Roulette starts with an unknown-country image and renders the spin icon instead of template code',()=>{
 const s=createGame('CHL'),html=rouletteView(s,name=>`<svg data-icon="${name}"></svg>`);
 assert.match(html,/<div class="roulette-placeholder"><svg[^>]+aria-label="País por sortear"/);
 assert.match(html,/<button[^>]+id="spinButton">GIRAR <svg data-icon="globe"><\/svg><\/button>/);
 assert.equal(html.includes('${'),false);assert.equal(s.phase,'draw');assert.equal(s.starter,null);
 drawFirst(s);const result=rouletteView(s,()=>'<svg></svg>');assert.match(result,/LA RULETA ELIGIÓ/);assert.ok(result.includes(s.starter==='CHL'?'¡Tu bandera juega primero!':'Su bandera juega primero.'));assert.ok(!result.includes('spinButton'));
});
test('Wheel centers every winner on measured cells and preserves centering at phone, desktop and resized widths',()=>{
 for(const width of [320,390,484,650])for(const [i,c] of COUNTRIES.entries()){
  const cellWidth=i%2?94:102,cell={offsetLeft:(41+i)*cellWidth,offsetWidth:cellWidth},first={offsetLeft:0,offsetWidth:cellWidth},classes=new Set(),belt={style:{},firstElementChild:first,querySelector:selector=>selector===`[data-roulette-result="${c.id}"]`?cell:null,closest:()=>({classList:{add:x=>classes.add(x)}}),getBoundingClientRect(){return {width};}};
  assert.equal(spinRoulette(belt,c.id),3200);assert.ok(classes.has('is-spinning'));const center=cell.offsetLeft+cell.offsetWidth/2;assert.equal(belt.style.transform,`translateX(calc(50% - ${center}px))`);
  for(const viewport of [width,width*.7,width*1.3])assert.ok(Math.abs(viewport/2-center+cell.offsetLeft+cell.offsetWidth/2-viewport/2)<1e-8);
  assert.equal(spinRoulette(belt,c.id,true),150);assert.match(belt.style.transition,/150ms/);settleRoulette(belt,c.id);assert.equal(belt.style.transition,'none');assert.equal(belt.style.transform,`translateX(calc(50% - ${center}px))`);assert.throws(()=>spinRoulette(belt,'INVALID'));
 }
});
