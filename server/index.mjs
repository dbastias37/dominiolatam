import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat, realpath} from 'node:fs/promises';
import {dirname, extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {openDatabase, consumeLimit} from './database.mjs';
import {getSession, authAPI} from './auth.mjs';
import {roomAPI} from './room-api.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json','.geojson':'application/geo+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg',
  '.webp':'image/webp','.ico':'image/x-icon','.glb':'model/gltf-binary','.ttf':'font/ttf','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};

export function createApplication({databasePath = process.env.DATABASE_PATH || './data/dominio.sqlite',
  origin = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || '',
  production = process.env.NODE_ENV === 'production', renderProxy = process.env.RENDER === 'true'} = {}) {
  if (production && !origin) throw new Error('APP_ORIGIN or RENDER_EXTERNAL_URL is required in production.');
  if (origin && new URL(origin).protocol !== (production ? 'https:' : new URL(origin).protocol))
    throw new Error('Production origin must use HTTPS.');
  const db = openDatabase(databasePath);
  const maintenance = setInterval(() => {
    const now = Date.now();
    try {
      db.sqlite.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
      db.sqlite.prepare('DELETE FROM rate_limits WHERE expires_at<=?').run(now);
    } catch { console.error('Maintenance could not reach the database.'); }
  }, 300000);
  maintenance.unref();
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    if (production) res.setHeader('Strict-Transport-Security','max-age=31536000');
    try {
      const requestOrigin = origin || `http://${req.headers.host || 'localhost'}`;
      const url = new URL(req.url, requestOrigin);
      if (url.origin !== new URL(requestOrigin).origin) return send({error:'Solicitud inválida.'},400);
      if (url.pathname === '/healthz') {
        db.sqlite.prepare('SELECT 1').get();
        return send({status:'ok',game:'DOMINIO — Last Frontier: Latinoamérica'});
      }
      if (url.pathname.startsWith('/api/')) {
        if (!['GET','POST'].includes(req.method)) return send({error:'Método no permitido.'},405);
        if (req.method === 'POST' && (req.headers['sec-fetch-site'] === 'cross-site' ||
          (req.headers.origin && req.headers.origin !== new URL(requestOrigin).origin))) return send({error:'Origen no permitido.'},403);
        if (Number(req.headers['content-length']) > 8192) return send({error:'El mensaje es demasiado largo.'},413);
        let size = 0; const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 8192) return send({error:'El mensaje es demasiado largo.'},413);
          chunks.push(chunk);
        }
        const request = new Request(url, {method:req.method, headers:req.headers,
          ...(req.method === 'POST' ? {body:Buffer.concat(chunks)} : {})});
        let response;
        if (url.pathname.startsWith('/api/auth/')) {
          const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').at(-1).trim();
          const ip = renderProxy && forwarded ? forwarded : req.socket.remoteAddress;
          response = await authAPI(request,db,{ip,secure:production});
        } else if (url.pathname === '/api/rooms' || url.pathname.startsWith('/api/rooms/')) {
          const user = getSession(request,db);
          if (user && !consumeLimit(db,`rooms:${req.method}:${user.id}`,req.method==='POST'?120:240,60000))
            return send({error:'Demasiadas solicitudes. Espera un minuto.'},429);
          // Only the server may supply identity. Incoming identity headers have no authority.
          response = await roomAPI(request,db,Date.now(),user?.id || null);
        } else return send({error:'Ruta desconocida.'},404);
        res.statusCode=response.status;
        for (const [name,value] of response.headers) res.setHeader(name,value);
        return res.end(Buffer.from(await response.arrayBuffer()));
      }
      if (!['GET','HEAD'].includes(req.method)) return send({error:'Método no permitido.'},405);
      if (url.pathname === '/') { res.writeHead(302,{Location:'/game/index.html'}); return res.end(); }
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { return send({error:'Ruta inválida.'},400); }
      if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(x=>x.startsWith('.')))
        return send({error:'No encontrado.'},404);
      const file = await realpath(resolve(ROOT, '.' + pathname));
      if (!file.startsWith(ROOT + sep)) return send({error:'No encontrado.'},404);
      const info = await stat(file);
      if (!info.isFile() || !MIME[extname(file)]) return send({error:'No encontrado.'},404);
      const etag = `W/"${info.size}-${Math.trunc(info.mtimeMs)}"`;
      res.setHeader('Content-Type',MIME[extname(file)]);
      res.setHeader('Cache-Control','public, max-age=0, must-revalidate');
      res.setHeader('ETag',etag);
      if (req.headers['if-none-match']===etag) { res.statusCode=304; return res.end(); }
      res.setHeader('Content-Length',info.size);
      if (req.method==='HEAD') return res.end();
      await pipeline(createReadStream(file),res);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      if (['ENOENT','EISDIR','ENOTDIR'].includes(error.code)) return send({error:'No encontrado.'},404);
      console.error('http: request failed', error.code || error.name);
      send({error:'Servicio no disponible. Intenta nuevamente.'},503);
    }
    function send(data,status=200) {
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(JSON.stringify(data));
    }
  });
  server.requestTimeout=15000;
  server.headersTimeout=10000;
  server.keepAliveTimeout=5000;
  const close = () => new Promise((resolve,reject) => {
    clearInterval(maintenance);
    server.close(error=>{db.close();error?reject(error):resolve();});
    server.closeIdleConnections();
  });
  return {server,db,close};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const portIndex=process.argv.indexOf('--port');
  const port=Number(process.env.PORT || (portIndex>=0?process.argv[portIndex+1]:3000));
  if (!Number.isInteger(port) || port<1 || port>65535) throw new Error('PORT must be an integer between 1 and 65535.');
  const app = createApplication();
  app.server.listen(port,'0.0.0.0',()=>console.log('DOMINIO listening on port '+app.server.address().port));
  let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;await app.close();};
  process.on('SIGTERM',stop);
  process.on('SIGINT',stop);
}
