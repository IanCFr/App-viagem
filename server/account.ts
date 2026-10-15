import 'dotenv/config';
import argon2 from 'argon2';
import { openDatabase } from './db.js';
import { z } from 'zod';

// Recebe JSON por stdin: evita colocar senha nos argumentos ou arquivos do projeto.
let input = '';
for await (const chunk of process.stdin) { input += chunk; if (input.length > 4096) throw new Error('Entrada excessiva'); }
const values = z.object({ email: z.string().trim().email().max(254), password: z.string().min(12).max(256) }).parse(JSON.parse(input));
const passwordHash = await argon2.hash(values.password, { type: argon2.argon2id });
const db = openDatabase();
db.exec('BEGIN IMMEDIATE');
try {
  db.prepare('INSERT INTO account VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,password_hash=excluded.password_hash').run(values.email.toLowerCase(), passwordHash);
  db.exec('DELETE FROM sessions; COMMIT');
  console.log('Conta configurada. Sessões anteriores encerradas; os gastos foram preservados.');
} catch (error) { db.exec('ROLLBACK'); throw error; } finally { db.close(); }
