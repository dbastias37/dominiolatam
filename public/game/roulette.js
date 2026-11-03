import {factionName} from './factions.js';
import {COUNTRIES,BY_ID} from './data.js';
import {flag} from './flags.js';

const mystery=`<svg class="roulette-mystery" viewBox="0 0 64 48" role="img" aria-label="País por sortear"><path d="M25 16a7 7 0 0 1 14 0c0 5-7 5-7 10"/><circle cx="32" cy="34" r="1.7"/></svg>`;
export function rouletteView(state,icon){
 const ready=state.phase==='ready',candidates=state.campaignMode==='factions'?COUNTRIES.filter(c=>state.countries[c.id].owner===c.id):COUNTRIES;
 const wheel=`<div class="roulette-window"><div class="roulette-pointer" aria-hidden="true">▼</div><div class="roulette-placeholder">${mystery}<small>¿QUIÉN EMPIEZA?</small></div><div class="roulette-belt" id="rouletteBelt" aria-hidden="true"><div class="roulette-cell">${mystery}<small>¿QUIÉN EMPIEZA?</small></div>${Array.from({length:4},(_,cycle)=>candidates.map(c=>`<div class="roulette-cell" ${cycle===2?`data-roulette-result="${c.id}"`:''}>${flag(c.id)}<small>${factionName(state,c.id).replace(/[<>]/g,'')}</small></div>`).join('')).join('')}</div></div><p id="drawCaption">Todas las banderas pueden empezar.</p>`;
 return `<div class="draw-modal"><div class="eyebrow">${ready?'¡YA TENEMOS EL ORDEN!':'¿QUIÉN EMPIEZA?'}</div><h2>${ready?'LA RULETA ELIGIÓ.':'¡GIRA LA RULETA!'}</h2>${ready?`${flag(state.starter,'winner-flag')}<h3>${factionName(state,state.starter).replace(/[<>]/g,'')}</h3><p>${state.starter===state.player?'¡Tu bandera juega primero!':'Su bandera juega primero.'}</p>`:wheel}<p class="fineprint">Después: menor poder primero.<br>Los más fuertes esperan.</p>${ready?`<button class="primary" data-ui="begin">${state.starter===state.player?'¡JUGAR!':'VER EL PRIMER TURNO'} ${icon('arrow')}</button><button class="text-btn" data-ui="order">Ver el orden completo</button>`:`<button class="primary" data-ui="spin" id="spinButton">GIRAR ${icon('globe')}</button>`}</div>`;
}
export function centerRouletteCell(belt,cell){
 // Both offsets are relative to the positioned belt. Percentage centering stays
 // responsive while the strip is moving or after the viewport is resized.
 const center=cell.offsetLeft+cell.offsetWidth/2;
 belt.style.transform=`translateX(calc(50% - ${center}px))`;
}
export function spinRoulette(belt,winner,reducedMotion=false){
 const cell=belt.querySelector(`[data-roulette-result="${winner}"]`);
 if(!cell)throw new Error('La bandera sorteada no está en la ruleta.');
 const viewport=belt.closest('.roulette-window'),duration=reducedMotion?150:3200;
 belt.style.transition='none';centerRouletteCell(belt,belt.firstElementChild);viewport.classList.add('is-spinning');
 // Commit the start before setting the destination, including on fast devices.
 belt.getBoundingClientRect();
 belt.style.transition=`transform ${duration}ms cubic-bezier(.12,.66,.13,1)`;centerRouletteCell(belt,cell);
 return duration;
}

export function settleRoulette(belt,winner){
 const cell=belt.querySelector(`[data-roulette-result="${winner}"]`);if(!cell)return;
 belt.style.transition='none';centerRouletteCell(belt,cell);
}
