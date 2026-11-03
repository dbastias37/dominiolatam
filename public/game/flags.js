import {BY_ID} from './data.js';
import {factionFlag,factionName,factionColor} from './factions.js';
let context=null;
export function setFactionFlags(state){context=state;}
export function flagSource(id,state=context){const c=BY_ID[id];return state?.factions?.[id]?factionFlag({...state.factions[id],color:factionColor(state,id)}):c?`./flags/${c.iso.toLowerCase()}.svg`:'';}
export function flag(id,extra=''){const c=BY_ID[id];if(!c)return '';const label=factionName(context,id).replace(/[&<>"']/g,'');return `<img class="flag-img ${extra}" src="${flagSource(id)}" alt="Bandera de ${label}" width="48" height="36" draggable="false">`;}
