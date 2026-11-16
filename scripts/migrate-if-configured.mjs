// Runs the version-controlled migrations during a Vercel build when the environment has a database.
// Preview builds migrate the staging database; production builds migrate production. Migrations are
// forward-only and each runs in a transaction, so a failed migration fails the build and changes nothing.
import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.log('[migrate] DATABASE_URL is not set for this environment; skipping migrations.');
  process.exit(0);
}
const r = spawnSync('npx', ['tsx', 'server/migrate.ts'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
