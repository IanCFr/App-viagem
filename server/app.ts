import Fastify, { LogController } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { randomBytes, createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import argon2 from 'argon2';
import { z } from 'zod';
import { centsSchema, operationSchema } from '../shared/model.js';
import { applyOperation, getTrip, snapshot, type Db } from './db.js';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export async function buildApp(db: Db, options: { origin: string; production?: boolean; logger?: boolean; staticDir?: string }) {
  const origin = new URL(options.origin).origin;
  const app = Fastify({ logger: options.logger ? { level: 'info', redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'] } : false, logController: new LogController({ disableRequestLogging: true }), bodyLimit: 16384, trustProxy: false });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  const cookieOptions = { path: '/', httpOnly: true, secure: !!options.production, sameSite: 'strict' as const };
  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer').header('X-Frame-Options', 'DENY');
    if (options.production) reply.header('Strict-Transport-Security', 'max-age=31536000');
    reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (req.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store');
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== origin) return reply.code(403).send({ error: 'Origem não autorizada.' });
      if (req.url.split('?')[0] !== '/api/health' && req.url.split('?')[0] !== '/api/login') {
        const token = req.cookies.travel_session;
        const session = token && db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?').get(hashToken(token), Date.now());
        if (!session) return reply.code(401).send({ error: 'Entre na conta para sincronizar.' });
      }
    }
  });
  app.get('/api/health', async () => { db.prepare('SELECT 1').get(); return { status: 'ok' }; });
  app.post('/api/login', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const input = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) }).parse(req.body);
    const account = db.prepare('SELECT email,password_hash FROM account WHERE id=1').get();
    if (!account || !(await argon2.verify(String(account.password_hash), input.password)) || input.email.trim().toLowerCase() !== account.email) return reply.code(401).send({ error: 'E-mail ou senha incorretos.' });
    const token = randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES (?,?)').run(hashToken(token), Date.now() + 30 * 86400000);
    reply.setCookie('travel_session', token, { ...cookieOptions, maxAge: 30 * 86400 });
    return { email: account.email };
  });
  app.get('/api/session', async () => ({ email: db.prepare('SELECT email FROM account WHERE id=1').get()?.email }));
  app.post('/api/logout', async (req, reply) => {
    if (req.cookies.travel_session) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(req.cookies.travel_session));
    reply.clearCookie('travel_session', cookieOptions); return { ok: true };
  });
  app.get('/api/trip', async () => snapshot(db));
  app.put('/api/budget', async (req, reply) => {
    const input = z.object({ budgetCents: centsSchema.optional(), ticketBudgetCents: centsSchema.optional(), expectedVersion: z.number().int().positive() }).strict()
      .refine(body => body.budgetCents !== undefined || body.ticketBudgetCents !== undefined).parse(req.body);
    const result = db.prepare('UPDATE trip SET budget_cents=COALESCE(?,budget_cents),ticket_budget_cents=COALESCE(?,ticket_budget_cents),version=version+1 WHERE id=1 AND version=?').run(input.budgetCents ?? null, input.ticketBudgetCents ?? null, input.expectedVersion);
    if (!result.changes) return reply.code(409).send({ error: 'O orçamento mudou em outro aparelho. Atualize e tente novamente.', trip: getTrip(db) });
    return { trip: getTrip(db) };
  });
  app.post('/api/sync', async req => applyOperation(db, operationSchema.parse(req.body)));
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ error: 'Confira os campos informados.' });
    const details = error as { message?: string; statusCode?: number; code?: string };
    if (details.message === 'OPERATION_ID_REUSED') return reply.code(409).send({ error: 'Identificador da operação já utilizado.' });
    const status = typeof details.statusCode === 'number' ? details.statusCode : 500;
    if (status >= 500) app.log.error({ code: details.code ?? 'INTERNAL' }, 'Falha interna');
    return reply.code(status).send({ error: status === 429 ? 'Muitas tentativas. Aguarde 15 minutos.' : status < 500 ? 'Solicitação inválida.' : 'Não foi possível concluir. Tente novamente.' });
  });
  const staticDir = options.staticDir ?? resolve('dist');
  if (existsSync(staticDir)) {
    await app.register(staticFiles, { root: staticDir, setHeaders(reply, path) { reply.header('Cache-Control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache'); } });
    app.setNotFoundHandler((req, reply) => req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Não encontrado.' }) : reply.type('text/html').sendFile('index.html'));
  }
  return app;
}
