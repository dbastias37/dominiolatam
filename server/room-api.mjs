import {RoomError,makeRoom,applyRoomCommand,advanceRoom,roomView} from './room-model.mjs';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function codeValue(v){if(!/^[A-HJ-NP-Z2-9]{8}$/.test(v||''))throw new RoomError('Código de sala inválido.',404);return v;}
const newCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%32]).join('');
async function bodyOf(req){if(!(req.headers.get('content-type')||'').includes('application/json'))throw new RoomError('Solicitud inválida.',415);const text=await req.text();if(text.length>5000)throw new RoomError('El mensaje es demasiado largo.',413);try{return JSON.parse(text);}catch{throw new RoomError('Solicitud inválida.');}}
async function load(db,code){const row=await db.prepare('SELECT body,revision FROM dominio_rooms WHERE code=?').bind(code).first();if(!row)throw new RoomError('No existe una sala con ese código.',404);return {r:JSON.parse(row.body),revision:row.revision};}
async function write(db,r,revision,now){return db.prepare('UPDATE dominio_rooms SET body=?,host=?,status=?,updated_at=?,revision=revision+1 WHERE code=? AND revision=?').bind(JSON.stringify(r),r.host,r.status,now,r.code,revision).run();}
export async function roomAPI(req,db,now=Date.now(),userId=null){
 try{
  const url=new URL(req.url),parts=url.pathname.split('/').filter(Boolean).slice(2);
  if(!userId)return json({error:'Inicia sesión para guardar tu lugar en la campaña.',authenticated:false,signIn:'/game/account.html'},401);
  if(!db)throw new RoomError('Las salas se están preparando. Vuelve a intentarlo en unos momentos.',503);
  if(!['GET','POST'].includes(req.method))return json({error:'Método no permitido.'},405);
  if(req.method==='POST'){const origin=req.headers.get('origin');if(origin&&origin!==url.origin)throw new RoomError('Origen no permitido.',403);}
  if(!parts.length&&req.method==='GET'){
   const rows=await db.prepare("SELECT code,body,updated_at FROM dominio_rooms WHERE status<>'closed' AND EXISTS (SELECT 1 FROM json_each(body,'$.members') m WHERE json_extract(m.value,'$.userId')=?) ORDER BY updated_at DESC LIMIT 30").bind(userId).all();
   return json({authenticated:true,rooms:rows.results.map(row=>{const r=JSON.parse(row.body),m=r.members.find(m=>m.userId===userId);return {code:r.code,title:r.title,status:r.status,nation:m.nation,players:r.members.length,capacity:r.config.capacity,round:r.game?.turn,updatedAt:row.updated_at};})});
  }
  if(!parts.length&&req.method==='POST'){
   const input=await bodyOf(req);const count=await db.prepare("SELECT COUNT(*) AS n FROM dominio_rooms WHERE host=? AND status='lobby'").bind(userId).first();if(count.n>=4)throw new RoomError('Ya tienes cuatro salas en preparación. Entra en una de ellas o abandónala.');
   for(let i=0;i<4;i++){const r=makeRoom(newCode(),userId,input,now);const result=await db.prepare('INSERT OR IGNORE INTO dominio_rooms(code,host,status,revision,body,created_at,updated_at) VALUES (?,?,?,1,?,?,?)').bind(r.code,userId,r.status,JSON.stringify(r),now,now).run();if(result.meta.changes)return json(roomView(r,userId,1,now),201);}
   throw new RoomError('No pudimos crear la sala. Inténtalo otra vez.',503);
  }
  if(parts.length!==1)throw new RoomError('Ruta desconocida.',404);const code=codeValue(parts[0]);
  const input=req.method==='POST'?await bodyOf(req):null;
  if(input&&(!/^[a-zA-Z0-9-]{12,80}$/.test(input.nonce||'')||typeof input.command!=='string'))throw new RoomError('Falta el identificador de la acción.');
  for(let attempt=0;attempt<8;attempt++){
   const {r,revision}=await load(db,code);const member=r.members.find(m=>m.userId===userId);
   if(!member&&input?.command!=='join')throw new RoomError('Únete a esta sala con su código.',403);
   if(input&&r.receipts.some(x=>x.userId===userId&&x.nonce===input.nonce))return json(roomView(r,userId,revision,now));
   const advanced=advanceRoom(r,now);let error=null,changed=advanced;
   if(input){const before=structuredClone(r);try{applyRoomCommand(r,userId,input.command,input.payload||{},now,input.turn);r.receipts.push({userId,nonce:input.nonce});r.receipts=r.receipts.slice(-200);changed=true;}catch(e){Object.assign(r,before);error=e;}}
   else if(member&&now-member.lastSeen>=12000){member.lastSeen=now;changed=true;}
   if(changed){r.updatedAt=now;const result=await write(db,r,revision,now);if(!result.meta.changes)continue;}
   if(error)throw error;if(input?.command==='leave')return json({left:true});return json(roomView(r,userId,revision+(changed?1:0),now));
  }
  throw new RoomError('La sala recibió varias acciones a la vez. Intenta nuevamente.',409);
 }catch(e){if(!(e instanceof RoomError))console.error('room-api',e);return json({error:e instanceof RoomError?e.message:'No pudimos sincronizar la sala. Tu progreso sigue guardado.'},e.status||500);}
}
