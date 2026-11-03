import {FLAG_COLORS,LEGACY_COLORS,politicalPalette} from './political-colors.js';
import {COUNTRIES,BY_ID,neighbors} from './data.js';
export const FACTION_COLORS=FLAG_COLORS.map(([color])=>color);
const supportedColor=color=>FACTION_COLORS.includes(color)||!!LEGACY_COLORS[color];
export const FACTION_SYMBOLS={star:'M48 10 55 28 75 29 60 42 65 61 48 50 31 61 36 42 21 29 41 28Z',sun:'M48 19a17 17 0 1 0 0 34 17 17 0 1 0 0-34',mountain:'M15 58 37 24 48 39 59 21 81 58Z',shield:'M25 16 48 9 71 16V37C71 51 48 63 48 63S25 51 25 37Z'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const factionName=(s,id)=>s?.factions?.[id]?.name||BY_ID[id]?.name||'El mundo';
export const factionColor=(s,id)=>politicalPalette(s)[id]||'#999999';
export function factionFlag(f){const symbol=FACTION_SYMBOLS[f.symbol]||FACTION_SYMBOLS.star;return 'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 72"><rect width="96" height="72" fill="${f.color}"/><path d="M0 56 96 0V16L0 72Z" fill="${f.secondary}"/><path d="${symbol}" fill="#fff3cb" stroke="#152b35" stroke-width="2"/></svg>`);}
export function factionProfile(name,color,symbol,secondary='#163747'){return {name:String(name||'Unión del Horizonte').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,28)||'Unión del Horizonte',color:supportedColor(color)?color:FACTION_COLORS[0],symbol:FACTION_SYMBOLS[symbol]?symbol:'star',secondary:supportedColor(secondary)||secondary==='#163747'?secondary:'#163747'};}
export function setupFactions(s,{partner,name,color,symbol,secondary}={}){
 s.campaignMode='factions';s.factions={};const remaining=new Set(COUNTRIES.map(c=>c.id));const ally=neighbors(s.player).includes(partner)?partner:neighbors(s.player)[0];
 const assign=(leader,mate,profile)=>{s.factions[leader]=profile;remaining.delete(leader);if(mate){remaining.delete(mate);s.countries[mate].owner=leader;}};
 assign(s.player,ally,factionProfile(name,color,symbol,secondary));const names=['Pacto del Café','Liga del Horizonte','Unión del Cóndor','Frente del Mañana','Coalición del Mate','Pacto del Caribe','Alianza del Sur','Liga del Pacífico','Unión del Sol'];let i=0;
 while(remaining.size){const leader=remaining.values().next().value,a=BY_ID[leader],mate=[...remaining].filter(id=>id!==leader).sort((x,y)=>Number(!neighbors(leader).includes(x))-Number(!neighbors(leader).includes(y))||(Math.hypot(BY_ID[x].lon-a.lon,BY_ID[x].lat-a.lat)-Math.hypot(BY_ID[y].lon-a.lon,BY_ID[y].lat-a.lat)))[0];assign(leader,mate,factionProfile(names[i%names.length],FACTION_COLORS[(i+1)%FACTION_COLORS.length],Object.keys(FACTION_SYMBOLS)[i%4],FACTION_COLORS[(i+3)%FACTION_COLORS.length]));i++;}
 return s;
}
export function validateFactions(s){if(s.campaignMode===undefined||s.campaignMode==='classic')return true;if(s.campaignMode!=='factions'||!s.factions||!s.factions[s.player])return false;return Object.entries(s.factions).every(([id,f])=>BY_ID[id]&&f&&typeof f.name==='string'&&f.name.length>=1&&f.name.length<=28&&supportedColor(f.color)&&!!FACTION_SYMBOLS[f.symbol]&&(supportedColor(f.secondary)||f.secondary==='#163747'));}
export function factionBadge(s,id){const f=s?.factions?.[id];return f?`<img class="flag-img" src="${factionFlag({...f,color:factionColor(s,id)})}" alt="${esc(f.name)}" width="48" height="36">`:'';}
