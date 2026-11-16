import pg from 'pg';

/** Start every run from an empty database; the server applies the migrations when it boots. */
async function reset() {
  const url = process.env.E2E_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5433/aether_e2e';
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('End-to-end tests only run against a local database.');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('drop schema public cascade; create schema public;');
  await client.end();
}

await reset();
