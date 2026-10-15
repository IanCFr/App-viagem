import argon2 from 'argon2';
import { openDatabase } from '../server/db.js';
import { buildApp } from '../server/app.js';
const db = openDatabase(':memory:');
db.prepare('INSERT INTO account VALUES (1,?,?)').run('test@example.test', await argon2.hash('test-password-not-for-production', { type: argon2.argon2id }));
const app = await buildApp(db, { origin: 'http://127.0.0.1:4173' });
await app.listen({ host: '127.0.0.1', port: 4173 });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); db.close(); process.exit(0); });
