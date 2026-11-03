import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, chmodSync} from 'node:fs';
import {dirname, resolve} from 'node:path';

const schema = `
CREATE TABLE IF NOT EXISTS dominio_rooms (
  code TEXT PRIMARY KEY, host TEXT NOT NULL, status TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1, body TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS dominio_rooms_host ON dominio_rooms(host);
CREATE INDEX IF NOT EXISTS dominio_rooms_updated ON dominio_rooms(updated_at);
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  recovery_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_expiry ON rate_limits(expires_at);
`;

export function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), {recursive: true, mode: 0o700});
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
  sqlite.exec(schema);
  if (filename !== ':memory:') chmodSync(filename, 0o600);
  // Keep the room transport independent of the persistence provider.
  return {
    sqlite,
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let values = [];
      const query = {
        bind(...args) { values = args; return query; },
        async first() { return statement.get(...values) || null; },
        async all() { return {results: statement.all(...values)}; },
        async run() { return {success: true, meta: {changes: Number(statement.run(...values).changes)}}; }
      };
      return query;
    },
    transaction(fn) {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const result = fn(); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    close() { sqlite.close(); }
  };
}

export function consumeLimit(db, key, max, windowMs, now = Date.now()) {
  const row = db.sqlite.prepare(`INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,
      expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END
    RETURNING count,expires_at`).get(key, now + windowMs, now, now);
  return row.count <= max;
}
