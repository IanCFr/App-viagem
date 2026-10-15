import 'dotenv/config';
import { readdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { backupDatabase, openDatabase, type Db } from './db.js';
export async function runBackup(db: Db, directory = process.env.BACKUP_DIR || join(process.env.DATA_DIR || '.data', 'backups')) {
  const path = await backupDatabase(db, directory);
  const files = (await readdir(directory)).filter(f => /^travel-.*\.db$/.test(f)).sort().reverse();
  for (const file of files.slice(14)) await unlink(join(directory, file));
  return path;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const db = openDatabase(); try { console.log(await runBackup(db)); } finally { db.close(); }
}
