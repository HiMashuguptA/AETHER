import pg from 'pg';
import { migrate } from '../server/migrate.js';

/** Every run starts from an empty schema built only from the version-controlled migrations. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5433/aether_test';
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('Tests only run against a local database.');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('drop schema public cascade; create schema public;');
  await client.end();
  await migrate(url, () => undefined);
}
