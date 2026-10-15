import 'dotenv/config';
import { openDatabase } from './db.js';
import { buildApp } from './app.js';
import { runBackup } from './backup.js';

const db = openDatabase();
const production = process.env.NODE_ENV === 'production';
if (production && !process.env.APP_ORIGIN?.startsWith('https://')) throw new Error('APP_ORIGIN deve usar HTTPS em produção.');
const app = await buildApp(db, { origin: process.env.APP_ORIGIN || 'http://localhost:5173', production, logger: true });
const timer = setInterval(() => { runBackup(db).catch(() => app.log.error('Falha no backup diário.')); }, 24 * 60 * 60 * 1000);
timer.unref();
await app.listen({ port: Number(process.env.PORT || 3001), host: process.env.HOST || '127.0.0.1' });
if (production) await runBackup(db).catch(() => app.log.error('Falha no backup inicial.'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { clearInterval(timer); await app.close(); db.close(); process.exit(0); });
