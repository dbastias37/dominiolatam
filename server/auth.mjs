import {randomBytes, randomUUID, createHash, scrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {consumeLimit} from './database.mjs';

const derive = promisify(scrypt);
const COOKIE = 'dominio_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const hash = text => createHash('sha256').update(text).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers}
});
const fail = (message, status = 400) => Object.assign(new Error(message), {status});
let activeDerivations = 0;

async function key(password, salt) {
  // A small instance must keep serving game turns during authentication bursts.
  if (activeDerivations >= 2) throw fail('Hay varios accesos en curso. Intenta de nuevo en unos segundos.', 503);
  activeDerivations++;
  try { return await derive(password, salt, 64, {N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024}); }
  finally { activeDerivations--; }
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$32768$8$3$${salt}$${(await key(password, salt)).toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const parts = stored?.split('$');
  const valid = parts?.length === 6 && parts.slice(0,4).join('$') === 'scrypt$32768$8$3';
  // Perform the same expensive work when the account does not exist.
  const actual = await key(password, valid ? parts[4] : '00000000000000000000000000000000');
  const expected = valid ? Buffer.from(parts[5], 'hex') : Buffer.alloc(64);
  return !!valid && actual.length === expected.length && timingSafeEqual(actual, expected);
}
function sessionToken(req) {
  const match = (req.headers.get('cookie') || '').match(/(?:^|;\s*)dominio_session=([A-Za-z0-9_-]{43})(?:;|$)/);
  return match?.[1] || '';
}
export function getSession(req, db, now = Date.now()) {
  const value = sessionToken(req);
  if (!value) return null;
  return db.sqlite.prepare(`SELECT a.id,a.username FROM sessions s JOIN accounts a ON a.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>?`).get(hash(value), now) || null;
}
function cookie(value, secure, clear = false) {
  return `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : SESSION_MS / 1000}${secure ? '; Secure' : ''}`;
}
function newSession(db, userId, now) {
  const value = token();
  db.sqlite.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)')
    .run(hash(value), userId, now + SESSION_MS);
  // Bound persistent sessions while allowing several devices.
  db.sqlite.prepare(`DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN
    (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY expires_at DESC LIMIT 10)`).run(userId, userId);
  return value;
}
function normalizedUsername(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_]{3,22}$/.test(value.trim()))
    throw fail('Usa un usuario de 3 a 22 letras, números o guion bajo.');
  return value.trim().toLowerCase();
}
function passwordValue(value) {
  if (typeof value !== 'string' || [...value].length < 15 || [...value].length > 128)
    throw fail('La contraseña debe tener entre 15 y 128 caracteres. Puedes usar una frase.');
  return value;
}

export async function authAPI(req, db, {ip = 'unknown', secure = true, now = Date.now()} = {}) {
  try {
    const url = new URL(req.url), action = url.pathname.slice('/api/auth/'.length);
    if (req.method === 'GET' && action === 'session') {
      const user = getSession(req, db, now);
      return json({authenticated: !!user, user: user ? {username: user.username} : null});
    }
    if (req.method !== 'POST') return json({error: 'Método no permitido.'}, 405);
    if (!['register','login','logout','recover'].includes(action)) return json({error: 'Ruta desconocida.'}, 404);
    if (req.headers.get('origin') && req.headers.get('origin') !== url.origin) throw fail('Origen no permitido.', 403);
    if (req.headers.get('sec-fetch-site') === 'cross-site') throw fail('Origen no permitido.', 403);
    if (!(req.headers.get('content-type') || '').startsWith('application/json')) throw fail('Solicitud inválida.', 415);
    if (!consumeLimit(db, `auth:ip:${hash(ip)}`, 60, 15 * 60 * 1000, now))
      throw fail('Demasiados intentos. Espera 15 minutos antes de volver a entrar.', 429);
    if (action === 'logout') {
      db.sqlite.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(sessionToken(req)));
      return json({ok: true}, 200, {'Set-Cookie': cookie('', secure, true)});
    }
    let input;
    try { input = await req.json(); } catch { throw fail('Solicitud inválida.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('Solicitud inválida.');
    const username = normalizedUsername(input.username);
    if (!consumeLimit(db, `auth:user:${hash(username)}`, 20, 15 * 60 * 1000, now))
      throw fail('Demasiados intentos para este usuario. Espera 15 minutos.', 429);
    const password = passwordValue(input.password);
    let account = db.sqlite.prepare('SELECT * FROM accounts WHERE username=?').get(username);
    let recoveryCode;
    if (action === 'register') {
      if (account) throw fail('Ese usuario ya está ocupado. Elige otro.', 409);
      const passwordHash = await hashPassword(password);
      recoveryCode = token();
      account = {id: randomUUID(), username};
      try {
        db.sqlite.prepare('INSERT INTO accounts(id,username,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?)')
          .run(account.id, username, passwordHash, hash(recoveryCode), now);
      } catch (error) {
        if (error.code?.startsWith('ERR_SQLITE') && db.sqlite.prepare('SELECT id FROM accounts WHERE username=?').get(username))
          throw fail('Ese usuario ya está ocupado. Elige otro.', 409);
        throw error;
      }
    } else if (action === 'login') {
      if (!await verifyPassword(password, account?.password_hash)) throw fail('El usuario o la contraseña no coinciden.', 401);
    } else {
      const supplied = typeof input.recoveryCode === 'string' ? input.recoveryCode.trim() : '';
      const valid = account && timingSafeEqual(Buffer.from(hash(supplied), 'hex'), Buffer.from(account.recovery_hash, 'hex'));
      if (!valid) throw fail('El usuario o la clave de recuperación no coinciden.', 401);
      const passwordHash = await hashPassword(password);
      recoveryCode = token();
      // Rotate the recovery key exactly once and revoke every old session atomically.
      db.transaction(() => {
        const update = db.sqlite.prepare('UPDATE accounts SET password_hash=?,recovery_hash=? WHERE id=? AND recovery_hash=?')
          .run(passwordHash, hash(recoveryCode), account.id, account.recovery_hash);
        if (!update.changes) throw fail('La clave de recuperación ya fue utilizada.', 409);
        db.sqlite.prepare('DELETE FROM sessions WHERE user_id=?').run(account.id);
      });
    }
    const session = newSession(db, account.id, now);
    return json({authenticated: true, user: {username}, ...(recoveryCode ? {recoveryCode} : {})},
      action === 'register' ? 201 : 200, {'Set-Cookie': cookie(session, secure)});
  } catch (error) {
    if (!error.status) console.error('auth-api: unexpected persistence error');
    return json({error: error.status ? error.message : 'No pudimos completar el acceso. Intenta nuevamente.'}, error.status || 500);
  }
}
