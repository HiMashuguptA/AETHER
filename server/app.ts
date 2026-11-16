import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { ZodError } from 'zod';
import { allowedOrigins, getAuth } from './auth.js';
import { one } from './db.js';
import { capabilities } from './env.js';
import { ApiError } from './lib/http.js';
import { assets } from './routes/assets.js';
import { muse } from './routes/muse.js';
import { projects } from './routes/projects.js';
import { publicSites, publish } from './routes/publish.js';
import { workspaces } from './routes/workspaces.js';

/**
 * The AETHER API: one modular Hono app. It runs as a single Vercel Function in staging and
 * production (api/index.ts) and as a plain Node server locally and in tests (server/dev.ts).
 */
export const app = new Hono();

app.onError((err, c) => {
  if (err instanceof ApiError) return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status as any);
  if (err instanceof ZodError) return c.json({ error: { code: 'invalid_request', message: 'Some fields are not valid.', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } }, 400);
  // never leak internals: log server-side, answer generically
  console.error('[api] unhandled', c.req.method, new URL(c.req.url).pathname, (err as Error).stack ?? err);
  return c.json({ error: { code: 'server_error', message: 'Something went wrong on our side. Nothing was changed.' } }, 500);
});
app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found.' } }, 404));

app.use('*', async (c, next) => {
  await next();
  c.header('x-content-type-options', 'nosniff');
  c.header('referrer-policy', 'strict-origin-when-cross-origin');
  c.header('x-frame-options', 'SAMEORIGIN');
  if (new URL(c.req.url).pathname.startsWith('/api/') && !c.res.headers.get('cache-control')) c.header('cache-control', 'no-store');
});

/**
 * Cookie-authenticated API, so every state-changing request must come from the app's own origin.
 * There is no CORS allowance for other sites: cross-origin browsers cannot read or write.
 */
app.use('/api/*', async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('origin');
    const requestOrigin = new URL(c.req.url).origin;
    if (!origin || (origin !== requestOrigin && !allowedOrigins().includes(origin))) {
      return c.json({ error: { code: 'bad_origin', message: 'This request did not come from the AETHER app.' } }, 403);
    }
  }
  await next();
});

app.get('/api/health', async (c) => {
  let database = false;
  try { database = !!(await one('select 1 as ok')); } catch { /* reported below */ }
  return c.json({ ok: database, database, ...capabilities() }, database ? 200 : 503);
});

app.on(['GET', 'POST'], '/api/auth/*', (c) => getAuth().handler(c.req.raw));

// uploads carry files; everything else is small JSON
app.use('/api/workspaces/:ws/assets', bodyLimit({ maxSize: 41 * 1024 * 1024 }));
app.use('/api/*', async (c, next) => {
  if (/\/assets$/.test(new URL(c.req.url).pathname) && c.req.method === 'POST') return next();
  return bodyLimit({ maxSize: 512 * 1024, onError: (ctx) => ctx.json({ error: { code: 'too_large', message: 'That request is too large.' } }, 413) })(c, next);
});

const api = new Hono();
api.route('/', workspaces);
api.route('/', projects);
api.route('/', muse);
api.route('/', assets);
api.route('/', publish);
app.route('/api', api);
app.route('/', publicSites);

export default app;
