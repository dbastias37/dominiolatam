import {COUNTRY_COLORS} from './political-colors.js';
// Population: World Bank 2024. Personnel: RESDAL Atlas 2024. Game values are fictional.
const rows = [
['MEX','México','MX','Ciudad de México',130.861,259813,-102,23,'#d8be4c',44,2,1,2,'Una economía fuerte para impulsar tu expansión.'],
['GTM','Guatemala','GT','Ciudad de Guatemala',18.406,19276,-90.2,15.6,'#7daca5',28,0,0,1,'El puente entre México y Centroamérica.'],
['HND','Honduras','HN','Tegucigalpa',10.826,19786,-86.5,14.7,'#e38954',27,0,0,1,'Conecta tus fronteras con acuerdos estratégicos.'],
['SLV','El Salvador','SV','San Salvador',6.338,24023,-88.9,13.65,'#bac961',29,0,0,1,'Pequeño territorio, decisiones importantes.'],
['NIC','Nicaragua','NI','Managua',6.916,14496,-85.2,12.6,'#5ba1b6',26,0,0,1,'Desarrolla tu industria antes de avanzar.'],
['CRI','Costa Rica','CR','San José',5.130,0,-84.1,9.9,'#eaba80',24,0,0,2,'Una buena base para una campaña diplomática.'],
['PAN','Panamá','PA','Ciudad de Panamá',4.516,0,-80.1,8.7,'#7ab672',25,0,0,2,'Un punto de encuentro entre dos continentes.'],
['CUB','Cuba','CU','La Habana',10.980,null,-79.8,21.7,'#d8ae60',32,1,0,1,'Domina las rutas marítimas del Caribe.'],
['HTI','Haití','HT','Puerto Príncipe',11.773,512,-72.8,19.1,'#c1746d',22,0,0,1,'Un comienzo desafiante; la diplomacia es tu aliada.'],
['DOM','Rep. Dominicana','DO','Santo Domingo',11.428,57629,-70.2,18.9,'#7cbbb6',29,0,0,1,'Las rutas del Caribe abren nuevas oportunidades.'],
['COL','Colombia','CO','Bogotá',52.886,267709,-73.5,4.5,'#e2bc4e',40,1,1,1,'Una fuerza versátil y muchas rutas de expansión.'],
['VEN','Venezuela','VE','Caracas',28.406,339514,-66.8,7.5,'#da7752',38,1,1,1,'Una posición estratégica frente al Caribe.'],
['ECU','Ecuador','EC','Quito',18.135,40519,-78.5,-1.5,'#bac56c',28,0,0,1,'Crece entre los Andes y el Pacífico.'],
['PER','Perú','PE','Lima',34.218,78296,-74.7,-10.5,'#c89066',34,1,0,1,'Equilibra industria y defensa en los Andes.'],
['BOL','Bolivia','BO','Sucre · gobierno en La Paz',12.413,15368,-64.8,-17.1,'#e2bd50',28,0,0,1,'En el corazón del mapa, cada vecino cuenta.'],
['BRA','Brasil','BR','Brasilia',211.999,344103,-52.5,-12,'#69a575',48,2,1,2,'Gran potencia inicial, con muchas fronteras que cuidar.'],
['PRY','Paraguay','PY','Asunción',6.929,17267,-58.4,-23.1,'#d78156',26,0,0,1,'Haz alianzas para crecer entre grandes potencias.'],
['URY','Uruguay','UY','Montevideo',3.387,22822,-56.0,-32.8,'#7fbfba',26,0,0,2,'Una economía compacta y un inicio tranquilo.'],
['ARG','Argentina','AR','Buenos Aires',45.696,88090,-64.1,-35.7,'#7aafc1',39,1,1,2,'Industria y territorio para una campaña equilibrada.'],
['CHL','Chile','CL','Santiago',19.765,67146,-71.2,-30.8,'#dd825d',36,1,1,2,'Un inicio equilibrado, protegido por los Andes.']
];
export const COUNTRIES = rows.map(([id,name,iso,capital,population,personnel,lon,lat,color,troops,armor,air,industry,tip])=>({id,name,iso,capital,population,personnel,lon,lat,color:COUNTRY_COLORS[id]||color,troops,armor,air,industry,tip,flagSrc:`./flags/${iso.toLowerCase()}.svg`}));
export const BY_ID = Object.fromEntries(COUNTRIES.map(c=>[c.id,c]));
export const EDGES = ['MEX-GTM','GTM-HND','GTM-SLV','HND-SLV','HND-NIC','NIC-CRI','CRI-PAN','PAN-COL','COL-VEN','COL-ECU','COL-PER','COL-BRA','VEN-BRA','ECU-PER','PER-BRA','PER-BOL','PER-CHL','BOL-BRA','BOL-CHL','BOL-ARG','BOL-PRY','BRA-PRY','BRA-ARG','BRA-URY','PRY-ARG','URY-ARG','ARG-CHL','MEX-CUB','CUB-HTI','HTI-DOM','DOM-VEN'].map(x=>x.split('-'));
export const SEA_EDGES = ['MEX-CUB','CUB-HTI','DOM-VEN'];
export const neighbors = id=>EDGES.flatMap(([a,b])=>a===id?[b]:b===id?[a]:[]);
export const SOURCES = [
 {title:'Población 2024 · Banco Mundial',url:'https://datacatalogfiles.worldbank.org/ddh-published/0038126/DR0046429/POP.pdf'},
 {title:'Personal militar · Atlas RESDAL 2024, página 40',url:'https://www.resdal.org/esp/files/04-ESP-LasFuerzasArmadas.pdf'},
 {title:'Cartografía · Natural Earth, dominio público',url:'https://www.naturalearthdata.com/downloads/110m-cultural-vectors/'}
];
