import {BY_ID} from './data.js';
import {flag} from './flags.js';
import {INCIDENTS,incidentTime} from './events.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const EVENT_PATHS={rain:'M7 14a5 5 0 1 1 9-5 4 4 0 0 1 1 8H7 M7 19l-1 3 M12 19l-1 3 M17 19l-1 3',wind:'M3 8h13a3 3 0 1 0-3-3 M2 12h17a3 3 0 1 1-3 3 M5 17h5a3 3 0 1 1-3 3',fuel:'M4 21V4h10v17 M4 10h10 M2 21h14 M14 11h2c4 0 0 8 4 8 2 0 1-8 1-11l-3-3 M7 6h4',food:'M12 22V5 M12 13C6 13 4 10 4 6c5 0 8 3 8 7Zm0 5c5 0 8-3 8-7-5 0-8 3-8 7 M12 7c-3-3-3-5 0-7 3 2 3 4 0 7',materials:'m3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5 M12 12v10 M7 4l9 5v5',factory:'M3 21V10l6 3V9l7 4V4h4v17H3Z M6 17h2 M11 17h2 M16 17h2',sun:'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z M12 1v3 M12 20v3 M1 12h3 M20 12h3 M4 4l2 2 M18 18l2 2 M4 20l2-2 M18 6l2-2'};
export const eventSymbol=kind=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${EVENT_PATHS[INCIDENTS[kind]?.icon]||EVENT_PATHS.sun}"/></svg>`;
export function incidentCard(s,e,{stage='active',compact=false}={}){
 const d=INCIDENTS[e.kind],expired=stage==='end'||e.until<s.turn,starting=stage==='start',remaining=e.until-s.turn+1;
 return `<article class="incident-card ${d.tone} ${expired?'ended':''} ${compact?'compact':''}" data-incident="${e.id}"><div class="incident-card-head"><div class="incident-symbol">${eventSymbol(e.kind)}</div><div><span class="incident-place">${flag(e.target)}${BY_ID[e.target].name}</span><h3>${esc(d.title)}</h3></div><span class="incident-status">${expired?'FINALIZADO':starting?'NUEVO':`${remaining} ${remaining===1?'RONDA':'RONDAS'}`}</span></div><div class="incident-effect"><small>${expired?'VUELVE A LA NORMALIDAD':'QUÉ CAMBIA'}</small><p>${expired?(d.tone==='good'?'La bonificación terminó. Recupera sus valores habituales.':'La restricción terminó. Puede retomar las acciones afectadas.'):esc(d.effect)}</p></div>${compact?'':`<div class="incident-advice"><small>${expired?'AHORA':'QUÉ PUEDES HACER'}</small><p>${expired?'Revisa tus planes con las nuevas condiciones.':esc(d.advice)}</p></div>`}<footer><span>${expired?`Terminó al empezar la ronda ${e.until+1}`:incidentTime(s,e)}</span>${compact?'':`<span>${s.countries[e.target].owner===s.player?'EN TU TERRITORIO':'EN EL CONTINENTE'}</span>`}</footer></article>`;
}
export function decisionDetails(s,n){
 const d=n.details;if(!d?.incident)return '';
 const decisions=d.decisions||[{incident:d.incident,text:d.decision||n.text}];
 return `<div class="decision-explanations">${decisions.map(item=>{const def=INCIDENTS[item.incident.kind];return `<article class="decision-explanation"><div>${eventSymbol(item.incident.kind)}<b>${esc(def.title)} · ${BY_ID[item.incident.target].name}</b></div><p>${esc(item.text)}</p><small>${incidentTime(s,item.incident)}</small></article>`;}).join('')}${d.advice?`<p class="decision-advice">${esc(d.advice)}</p>`:''}</div>`;
}
