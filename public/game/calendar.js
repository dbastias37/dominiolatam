import {PEACE_BULLETINS,peaceHeadline,drawPeaceBulletin,validPeaceDeck} from './peace-news.js';
// All headlines are fictional satire. Dates are campaign time, never live news.
export const WORLD_NEWS={
 peace:{title:'La ONU declara la paz mundial',duration:4,peace:true,icon:'peace',headline:'Francia reúne a dos millones de personas en un tren de TikTok. La ONU descubre que todos firmaron la paz para poder volver a casa.',effect:'Nadie puede atacar ni bombardear durante 4 rondas.',advice:'Aprovecha para reclutar, mejorar y mover refuerzos.'},
 prophecy:{title:'El apocalipsis pide prórroga',duration:1,recruit:1.2,icon:'troops',headline:'Un profeta aplaza el fin del mundo: el recinto no tenía estacionamiento. Sus seguidores deciden hacer algo útil mientras esperan.',effect:'Reclutamiento +20% en todos los países durante 1 ronda.',advice:'Reclutar hoy entrega más unidades.'},
 ribbon:{title:'Cumbre de las tijeras',duration:2,income:1.15,icon:'factory',headline:'Un presidente inaugura una fábrica de cintas para inaugurar fábricas. Por una vez, las cuentas le encuentran sentido.',effect:'Ingresos territoriales +15% para todos durante 2 rondas.',advice:'Invierte el ingreso extra en tus territorios.'},
 paperwork:{title:'La fotocopia de la fotocopia',duration:1,income:.9,icon:'book',headline:'La cumbre contra la burocracia exige tres formularios para retirar el formulario. Las economías se toman un café mientras esperan.',effect:'Ingresos territoriales −10% para todos durante 1 ronda.',advice:'Puedes comerciar y guardar créditos para después.'},
 protest:{title:'Marcha contra las reuniones',duration:1,recruit:1.2,icon:'troops',headline:'La protesta contra las reuniones termina creando un comité. Sobran voluntarios; por primera vez nadie pregunta quién trae las sillas.',effect:'Reclutamiento +20% para todos durante 1 ronda.',advice:'Un buen momento para reforzar países débiles.'},
 summit:{title:'Acuerdo de última servilleta',duration:2,income:1.15,icon:'trade',headline:'Los ministros firman un acuerdo en una servilleta. Es el documento más breve del año y, por accidente, también funciona.',effect:'Ingresos territoriales +15% para todos durante 2 rondas.',advice:'Mejorar industria ayuda a aprovechar el auge.'}
};
export const calendarState=(round=0,seed=1)=>({newsSeed:((seed>>>0)^0x8f391c6d)>>>0,peaceDeck:[],start:'2026-11-02',lastRound:round,active:null,history:[]});
export function campaignDate(s,round=s.turn){const start=s.calendar?.start||'2026-11-02';return new Date(Date.parse(start+'T12:00:00Z')+(round-1)*7*86400000);}
export const dateLabel=(s,round=s.turn)=>campaignDate(s,round).toLocaleDateString('es-CL',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
export const worldEvent=s=>s?.calendar?.active&&s.calendar.active.start<=s.turn&&s.calendar.active.until>=s.turn?s.calendar.active:null;
export const worldHeadline=e=>e?.kind==='peace'&&Number.isInteger(e.bulletin)?peaceHeadline(e):WORLD_NEWS[e?.kind]?.headline||'';
export const worldEffect=s=>WORLD_NEWS[worldEvent(s)?.kind]||{};
export const worldPeace=s=>!!worldEffect(s).peace;
export const preparingFactions=s=>s?.campaignMode==='factions'&&s.turn<=4;
export function combatPause(s){if(preparingFactions(s))return 'Preparación de facciones: las batallas comienzan en la ronda 5.';if(worldPeace(s))return `Paz mundial: no se puede atacar ni bombardear hasta terminar la ronda ${worldEvent(s).until}.`;return null;}
export const nextPeaceRound=s=>s.turn<=8?8:8+Math.ceil((s.turn-8)/12)*12;
export function advanceCalendar(s){
 s.calendar??=calendarState(s.turn-1,s.seed);const cal=s.calendar;if(cal.lastRound>=s.turn)return {started:null,ended:null};cal.lastRound=s.turn;
 const ended=cal.active&&cal.active.until<s.turn?cal.active:null;if(ended)cal.active=null;
 if(cal.active)return {started:null,ended};
 let kind=null;if(s.turn>=8&&(s.turn-8)%12===0)kind='peace';else if(s.turn%3===0){const kinds=['prophecy','ribbon','paperwork','protest','summit'];kind=kinds[(Math.floor(s.turn/3)-1)%kinds.length];}
 if(!kind)return {started:null,ended};const def=WORLD_NEWS[kind],started={kind,start:s.turn,until:s.turn+def.duration-1};if(kind==='peace'){started.catalog=2;started.bulletin=drawPeaceBulletin(cal,s.seed);}cal.active=started;cal.history.unshift({...started});cal.history=cal.history.slice(0,80);return {started,ended};
}
export function validateCalendar(s){if(s.calendar===undefined)return true;const c=s.calendar,valid=e=>e&&WORLD_NEWS[e.kind]&&Number.isInteger(e.start)&&e.start>=1&&e.start<=s.turn&&e.until===e.start+WORLD_NEWS[e.kind].duration-1&&(e.bulletin===undefined||e.kind==='peace'&&Number.isInteger(e.bulletin)&&e.bulletin>=0&&e.bulletin<PEACE_BULLETINS.length);return !!c&&validPeaceDeck(c)&&/^\d{4}-\d{2}-\d{2}$/.test(c.start)&&Number.isFinite(Date.parse(c.start+'T12:00:00Z'))&&Number.isInteger(c.lastRound)&&c.lastRound>=0&&c.lastRound<=s.turn&&(!c.active||valid(c.active))&&Array.isArray(c.history)&&c.history.every(valid);}
