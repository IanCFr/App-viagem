import 'dotenv/config';
import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
const sourcePath = process.argv[2];
if (!sourcePath || process.argv[3] !== '--server-stopped') throw new Error('Uso: npm run restore -- caminho-do-backup --server-stopped (pare o aplicativo antes).');
const directory = resolve(process.env.DATA_DIR || '.data');
mkdirSync(directory, { recursive: true });
const target = join(directory, 'travel.db');
if (resolve(sourcePath) === target) throw new Error('Escolha um arquivo de backup diferente do banco atual.');
const source = new DatabaseSync(sourcePath, { readOnly: true });
try {
  const check = source.prepare('PRAGMA integrity_check').get();
  if (check?.integrity_check !== 'ok') throw new Error('Backup inválido');
  source.prepare('SELECT version FROM schema_migrations').all();
  const temporary = join(directory, 'restore.tmp.db');
  await backup(source, temporary);
  const suffix = `.before-restore-${Date.now()}`;
  for (const part of ['', '-wal', '-shm']) if (existsSync(target + part)) renameSync(target + part, target + suffix + part);
  renameSync(temporary, target);
  const restored = new DatabaseSync(target); restored.exec('DELETE FROM sessions'); restored.close();
  console.log('Backup restaurado. Banco anterior preservado. Entre novamente em cada aparelho.');
} finally { source.close(); }
