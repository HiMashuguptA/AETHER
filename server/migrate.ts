import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * Forward-only SQL migrations from db/migrations, applied in file order inside a transaction each
 * and recorded in schema_migrations. Run with: npm run db:migrate
 */
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');

export async function migrate(connectionString: string, log: (s: string) => void = console.log) {
  const local = /localhost|127\.0\.0\.1/.test(connectionString);
  const client = new pg.Client({ connectionString, ssl: local ? undefined : { rejectUnauthorized: true } });
  await client.connect();
  try {
    await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await client.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(file)) continue;
      await client.query('begin');
      try {
        await client.query(readFileSync(join(dir, file), 'utf8'));
        await client.query('insert into schema_migrations (name) values ($1)', [file]);
        await client.query('commit');
        log(`applied ${file}`);
      } catch (err) {
        await client.query('rollback');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL is not set'); process.exit(1); }
  migrate(url).then(() => console.log('migrations up to date')).catch((e) => { console.error(e.message); process.exit(1); });
}
