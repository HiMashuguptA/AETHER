import pg from 'pg';
import { env } from './env.js';

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const url = env.databaseUrl;
    if (!url) throw new Error('DATABASE_URL is not set');
    const local = /localhost|127\.0\.0\.1/.test(url);
    pool = new pg.Pool({ connectionString: url, max: local ? 10 : 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000, ssl: local ? undefined : { rejectUnauthorized: true } });
    pool.on('error', (err) => console.error('[db] idle client error', err.message));
  }
  return pool;
}

export async function closePool() {
  await pool?.end();
  pool = null;
}

type Params = unknown[];
export interface Db {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: Params): Promise<pg.QueryResult<T>>;
}

/** All SQL goes through parameterised queries; values are never concatenated into statements. */
export async function q<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: Params = [], db: Db = getPool()): Promise<T[]> {
  return (await db.query<T>(text, params)).rows;
}
export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: Params = [], db: Db = getPool()): Promise<T | null> {
  return (await db.query<T>(text, params)).rows[0] ?? null;
}

export async function tx<T>(fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
