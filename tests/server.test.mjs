import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../server/index.mjs';
import {openDatabase,consumeLimit} from '../server/database.mjs';
import {authAPI,getSession} from '../server/auth.mjs';

const password='Una frase de prueba para Dominio 2026';
async function launch(databasePath=':memory:') {
  const app=createApplication({databasePath,production:false,origin:'',renderProxy:false});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const request=async(path,{data,cookie,headers={},method}={})=>{
    const response=await fetch(origin+path,{method:method||(data?'POST':'GET'),headers:{...headers,...(data?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined,redirect:'manual'});
    const text=await response.text();let body;try{body=JSON.parse(text);}catch{body=text;}
    return {response,body,status:response.status,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  return {...app,request,origin};
}
const command=(command,payload={})=>({command,payload,nonce:crypto.randomUUID()});

test('HTTP serves the complete game, health and model assets, but never server files or secrets',async()=>{
  const app=await launch();
  try {
    assert.equal((await app.request('/healthz')).status,200);
    const root=await app.request('/');assert.equal(root.status,302);assert.equal(root.response.headers.get('location'),'/game/index.html');
    const page=await app.request('/game/index.html');assert.equal(page.status,200);assert.match(page.body,/DOMINIO/);
    const model=await app.request('/game/assets/vehicles/type96.glb',{method:'HEAD'});
    assert.equal(model.status,200);assert.equal(model.response.headers.get('content-type'),'model/gltf-binary');
    for (const path of ['/server/auth.mjs','/.env','/game/..%2f..%2fserver/auth.mjs','/game/%2e%2e%5cserver/auth.mjs','/game/%00','/data/dominio.sqlite'])
      assert.equal((await app.request(path)).status,404,path);
    const cached=await app.request('/game/index.html',{headers:{'If-None-Match':page.response.headers.get('etag')}});
    assert.equal(cached.status,304);
  } finally { await app.close(); }
});

test('Accounts use hashed passwords and cookie sessions; forged identity headers and cross-site writes cannot act',async()=>{
  const app=await launch();
  try {
    const registered=await app.request('/api/auth/register',{data:{username:'Comandante',password}});
    assert.equal(registered.status,201);assert.equal(registered.body.user.username,'comandante');
    assert.match(registered.response.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);
    assert.equal(registered.body.recoveryCode.length,43);
    const stored=app.db.sqlite.prepare('SELECT * FROM accounts').get();
    assert.notEqual(stored.password_hash,password);assert.match(stored.password_hash,/^scrypt\$32768\$8\$3\$/);
    assert.notEqual(stored.recovery_hash,registered.body.recoveryCode);
    assert.equal((await app.request('/api/rooms',{headers:{'oai-authenticated-user-id':stored.id}})).status,401);
    assert.equal((await app.request('/api/rooms',{cookie:registered.cookie,data:{name:'Comandante'},headers:{Origin:'https://evil.example'}})).status,403);
    assert.equal((await app.request('/api/rooms',{cookie:registered.cookie,data:{name:'Comandante'},headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
    const created=await app.request('/api/rooms',{cookie:registered.cookie,data:{name:'Comandante'}});
    assert.equal(created.status,201);
    assert.equal((await app.request('/api/auth/login',{data:{username:'COMANDANTE',password}})).status,200);
    assert.equal((await app.request('/api/auth/login',{data:{username:'comandante',password:'Una contraseña totalmente incorrecta'}})).status,401);
    assert.equal((await app.request('/api/auth/register',{data:{username:'comandante',password}})).status,409);
    assert.equal((await app.request('/api/auth/logout',{cookie:registered.cookie,data:{}})).status,200);
    assert.equal((await app.request('/api/rooms',{cookie:registered.cookie})).status,401);
  } finally { await app.close(); }
});

test('Recovering an account revokes old sessions, rotates the recovery key and retains its campaign',async()=>{
  const app=await launch();
  try {
    const reg=await app.request('/api/auth/register',{data:{username:'recuperar',password}});
    const room=await app.request('/api/rooms',{cookie:reg.cookie,data:{name:'Recuperar'}});
    const newPassword=password+' nuevo';
    const reset=await app.request('/api/auth/recover',{data:{username:'recuperar',password:newPassword,recoveryCode:reg.body.recoveryCode}});
    assert.equal(reset.status,200);assert.notEqual(reset.body.recoveryCode,reg.body.recoveryCode);
    assert.equal((await app.request('/api/rooms',{cookie:reg.cookie})).status,401);
    const resumed=await app.request('/api/rooms/'+room.body.code,{cookie:reset.cookie});
    assert.equal(resumed.status,200);assert.equal(resumed.body.self,room.body.self);
    assert.equal((await app.request('/api/auth/recover',{data:{username:'recuperar',password,recoveryCode:reg.body.recoveryCode}})).status,401);
    assert.equal((await app.request('/api/auth/login',{data:{username:'recuperar',password}})).status,401);
    assert.equal((await app.request('/api/auth/login',{data:{username:'recuperar',password:newPassword}})).status,200);
  } finally { await app.close(); }
});

test('Real HTTP room membership and chat survive process restart and sign-in from a new device',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'dominio-persistence-'));
  const path=join(dir,'game.sqlite');let app=await launch(path);
  try {
    const reg=await app.request('/api/auth/register',{data:{username:'persistente',password}});
    const created=await app.request('/api/rooms',{data:{name:'Persistente'},cookie:reg.cookie});
    const code=created.body.code;
    assert.equal((await app.request('/api/rooms/'+code,{data:command('seat',{nation:'CHL'}),cookie:reg.cookie})).status,200);
    assert.equal((await app.request('/api/rooms/'+code,{data:command('chat',{text:'La sala sigue aquí.'}),cookie:reg.cookie})).status,200);
    await app.close();app=await launch(path);
    const sameBrowser=await app.request('/api/rooms/'+code,{cookie:reg.cookie});
    assert.equal(sameBrowser.status,200);assert.equal(sameBrowser.body.self,created.body.self);
    const login=await app.request('/api/auth/login',{data:{username:'persistente',password}});
    const newBrowser=await app.request('/api/rooms/'+code,{cookie:login.cookie});
    assert.equal(newBrowser.body.members[0].nation,'CHL');
    assert.equal(newBrowser.body.chat[0].text,'La sala sigue aquí.');
    assert.equal((await app.request('/api/rooms',{cookie:login.cookie})).body.rooms.length,1);
  } finally { await app.close(); await rm(dir,{recursive:true,force:true}); }
});

test('Sessions expire, production cookies are secure and throttling survives database reopen',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'dominio-auth-')),path=join(dir,'auth.sqlite');let db=openDatabase(path);
  try {
    const now=1793620800000;
    const request=new Request('https://game.example/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'seguro',password})});
    const response=await authAPI(request,db,{now,secure:true,ip:'127.0.0.1'});
    assert.equal(response.status,201);assert.match(response.headers.get('set-cookie'),/; Secure/);
    const cookie=response.headers.get('set-cookie').split(';')[0];
    const get=new Request('https://game.example/api/rooms',{headers:{Cookie:cookie}});
    assert.ok(getSession(get,db,now+1000));assert.equal(getSession(get,db,now+31*86400000),null);
    assert.equal(consumeLimit(db,'test-limit',2,60000,now),true);
    assert.equal(consumeLimit(db,'test-limit',2,60000,now),true);
    db.close();db=openDatabase(path);
    assert.equal(consumeLimit(db,'test-limit',2,60000,now+1000),false);
    assert.equal(consumeLimit(db,'test-limit',2,60000,now+60001),true);
  } finally { db.close();await rm(dir,{recursive:true,force:true}); }
});

test('Malformed, oversized and unauthenticated API requests are rejected without changing the database',async()=>{
  const app=await launch();
  try {
    assert.equal((await app.request('/api/auth/register',{data:{username:'invalid',password:'short'}})).status,400);
    assert.equal((await app.request('/api/auth/register',{data:{username:'invalid',password:'x'.repeat(9000)}})).status,413);
    assert.equal((await app.request('/api/rooms',{data:{name:'Forjado'},headers:{'oai-authenticated-user-id':'fake'}})).status,401);
    assert.equal((await app.request('/api/rooms',{method:'DELETE'})).status,405);
    assert.equal(app.db.sqlite.prepare('SELECT count(*) AS n FROM accounts').get().n,0);
    assert.equal(app.db.sqlite.prepare('SELECT count(*) AS n FROM dominio_rooms').get().n,0);
  } finally { await app.close(); }
});
