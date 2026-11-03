import {DatabaseSync, backup} from 'node:sqlite';
import {mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
process.umask(0o077);
const source=resolve(process.env.DATABASE_PATH || './data/dominio.sqlite');
const destination=resolve(process.argv[2] || `${dirname(source)}/backups/dominio-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
if (source===destination) throw new Error('Backup must not overwrite the live database.');
await mkdir(dirname(destination),{recursive:true,mode:0o700});
const db=new DatabaseSync(source,{readOnly:true});
try { await backup(db,destination); console.log('Backup complete: '+destination); }
finally { db.close(); }
