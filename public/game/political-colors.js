// Restrained atlas palette, with distinct hues and moderate chroma.
export const COUNTRY_COLORS={MEX:'#4e8872',GTM:'#526f9c',HND:'#bb9754',SLV:'#9a607f',NIC:'#85a4bc',CRI:'#b36c78',PAN:'#827aab',CUB:'#8b4d58',HTI:'#96934f',DOM:'#55988f',COL:'#c3ad62',VEN:'#b77e4c',ECU:'#77a48b',PER:'#857098',BOL:'#527f86',BRA:'#78935e',PRY:'#a88caa',URY:'#b2bec6',ARG:'#648eb0',CHL:'#b65b57'};
export const FLAG_COLORS=[['#b65b57','Rojo'],['#c3ad62','Oro'],['#64866b','Verde'],['#526f9c','Azul'],['#857098','Violeta'],['#9a607f','Magenta'],['#568e9e','Turquesa'],['#b77e4c','Naranja'],['#795c4a','Cobre'],['#96934f','Lima'],['#c7bc9f','Marfil'],['#56616f','Pizarra']];
export const LEGACY_COLORS={"#e55e50":"#b65b57","#e4b644":"#c3ad62","#43a482":"#64866b","#3c8cc9":"#526f9c","#9566d6":"#857098","#d26b9f":"#9a607f","#e53935":"#b65b57","#efb900":"#c3ad62","#158b45":"#64866b","#195de8":"#526f9c","#7c3ad6":"#857098","#d32295":"#9a607f","#00a6bc":"#568e9e","#f26d12":"#b77e4c","#6e4734":"#795c4a","#b4ca22":"#96934f","#e5d8b2":"#c7bc9f","#46536c":"#56616f"};
export const legacyColorName=color=>({'#e55e50':'Coral anterior','#e4b644':'Oro anterior','#43a482':'Verde anterior','#3c8cc9':'Azul anterior','#9566d6':'Violeta anterior','#d26b9f':'Rosa anterior'}[color]||'Color guardado');
const cache=new WeakMap();
export function politicalPalette(state){
 const profiles=state?.factions;if(!profiles)return COUNTRY_COLORS;
 let result=cache.get(profiles);if(result)return result;
 result={...COUNTRY_COLORS};const used=new Set(),ids=Object.keys(profiles).sort();if(ids.includes(state.player))ids.unshift(...ids.splice(ids.indexOf(state.player),1));
 for(const id of ids){const preferred=LEGACY_COLORS[profiles[id].color]||profiles[id].color;let color=preferred;if(used.has(color))color=FLAG_COLORS.find(([c])=>!used.has(c))?.[0]||COUNTRY_COLORS[id];result[id]=color;used.add(color);}
 cache.set(profiles,result);return result;
}
export const controlOwner=(state,id)=>state?.pendingOccupation?.target===id?state.pendingOccupation.previous:state?.countries?.[id]?.owner||id;
