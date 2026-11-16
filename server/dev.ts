import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { app } from './app.js';
import { env } from './env.js';
import { migrate } from './migrate.js';

/** Local server: the API, plus the built frontend from dist/ when it exists (used by the end-to-end tests). */
const port = Number(process.env.PORT) || 8787;
await migrate(env.databaseUrl, (m) => console.log(`[db] ${m}`));
if (existsSync('dist/index.html')) {
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('/', serveStatic({ path: './dist/index.html' }));
}
serve({ fetch: app.fetch, port }, () => console.log(`AETHER API on http://localhost:${port} (${env.stage}; Muse: ${env.museProvider}; storage: ${env.storageProvider})`));
