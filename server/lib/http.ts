import type { Context } from 'hono';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { one, q } from '../db.js';

/** An error that is safe to show to the person. Anything else becomes a generic 500. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (message: string, details?: unknown) => new ApiError(400, 'invalid_request', message, details);
export const unauthorized = () => new ApiError(401, 'unauthenticated', 'Sign in to continue.');
export const forbidden = (message = 'You do not have permission to do that.') => new ApiError(403, 'forbidden', message);
/** Also used when a resource exists in another workspace, so ids cannot be probed. */
export const notFound = (what = 'That') => new ApiError(404, 'not_found', `${what} could not be found.`);
export const conflict = (message: string, details?: unknown) => new ApiError(409, 'conflict', message, details);

export async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest('The request body must be JSON.');
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    throw badRequest('Some fields are not valid.', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

export const uuid = z.string().uuid();
export function param(c: Context, name: string): string {
  const v = c.req.param(name);
  if (!v || !uuid.safeParse(v).success) throw notFound();
  return v;
}

export function clientIp(c: Context): string {
  return (c.req.header('x-forwarded-for') ?? '').split(',')[0].trim() || c.req.header('x-real-ip') || 'local';
}
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');

/** Fixed-window rate limit stored in Postgres, so it holds across serverless instances. */
export async function rateLimit(key: string, max: number, windowSeconds: number) {
  const row = await one<{ count: number }>(
    `insert into api_rate_limits (key, window_start, count)
     values ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
     on conflict (key, window_start) do update set count = api_rate_limits.count + 1
     returning count`,
    [key, windowSeconds],
  );
  if (Math.random() < 0.02) void q(`delete from api_rate_limits where window_start < now() - interval '1 day'`).catch(() => undefined);
  if ((row?.count ?? 0) > max) {
    throw new ApiError(429, 'rate_limited', 'Too many requests. Wait a moment and try again.', { retryAfterSeconds: windowSeconds });
  }
}

export async function audit(entry: { workspaceId?: string | null; actorId?: string | null; action: string; targetType?: string; targetId?: string; ip?: string; meta?: unknown }) {
  await q(`insert into audit_log (workspace_id, actor_id, action, target_type, target_id, ip, meta) values ($1,$2,$3,$4,$5,$6,$7)`, [
    entry.workspaceId ?? null, entry.actorId ?? null, entry.action, entry.targetType ?? null, entry.targetId ?? null, entry.ip ?? null, JSON.stringify(entry.meta ?? {}),
  ]).catch((err) => console.error('[audit] failed', (err as Error).message));
}
