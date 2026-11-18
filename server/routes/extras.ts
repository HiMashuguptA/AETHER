import { Hono } from 'hono';
import { z } from 'zod';
import { one, q, tx } from '../db.js';
import { env } from '../env.js';
import { requireMember, requireProject, requireUser } from '../lib/access.js';
import { ApiError, audit, body, clientIp, conflict, param, rateLimit } from '../lib/http.js';
import { getStorage } from '../services/storage.js';
import { snapshotOf } from '../services/projects.js';
import { BrandSchema, defaultSystem } from '../services/brand.js';
import { deleteExpiredAuthRows } from '../auth.js';

/** Presence, the workspace brand kit, project export, account deletion and the daily cleanup job. */
export const extras = new Hono();

// ---------------------------------------------------------------- presence
const HERE_SECONDS = 40;

/**
 * Heartbeat from an open project (every ~15 s while the tab is visible). Returns who else is here
 * and the project's current revision, so the app can pick up a teammate's saved changes.
 */
extras.post('/projects/:id/presence', async (c) => {
  const { user, project } = await requireProject(c, param(c, 'id'));
  const input = await body(c, z.object({ focus: z.string().trim().max(40).default(''), leaving: z.boolean().default(false) }));
  await rateLimit(`presence:${user.id}`, 30, 60);
  if (input.leaving) await q(`delete from project_presence where project_id = $1 and user_id = $2`, [project.id, user.id]);
  else await q(
    `insert into project_presence (project_id, user_id, focus, seen_at) values ($1, $2, $3, now())
     on conflict (project_id, user_id) do update set focus = excluded.focus, seen_at = now()`,
    [project.id, user.id, input.focus],
  );
  const here = await q<{ user_id: string; name: string; focus: string; seen_at: Date }>(
    `select pp.user_id, u.name, pp.focus, pp.seen_at from project_presence pp join "user" u on u.id = pp.user_id
     join workspace_members m on m.workspace_id = $3 and m.user_id = pp.user_id
     where pp.project_id = $1 and pp.user_id <> $2 and pp.seen_at > now() - make_interval(secs => $4) order by pp.seen_at desc limit 12`,
    [project.id, user.id, project.workspace_id, HERE_SECONDS],
  );
  const last = await one<{ created_by: string | null; name: string | null }>(
    `select v.created_by, u.name from project_versions v left join "user" u on u.id = v.created_by where v.project_id = $1 order by v.number desc limit 1`,
    [project.id],
  );
  return c.json({
    here: here.map((h) => ({ userId: h.user_id, name: h.name, focus: h.focus, seenAt: new Date(h.seen_at).getTime() })),
    lastEditor: last && last.created_by !== user.id ? { id: last.created_by, name: last.name ?? 'A former member' } : null,
    revision: project.revision,
    updatedAt: new Date(project.updated_at).getTime(),
  });
});

// ---------------------------------------------------------------- brand kit
extras.get('/workspaces/:ws/brand', async (c) => {
  const ws = param(c, 'ws');
  const { role } = await requireMember(c, ws);
  const row = await defaultSystem(ws);
  const parsed = BrandSchema.safeParse(row.tokens?.brand ?? {});
  return c.json({ brand: parsed.success ? parsed.data : BrandSchema.parse({}), updatedAt: new Date(row.updated_at).getTime(), canEdit: role !== 'viewer' });
});

extras.patch('/workspaces/:ws/brand', async (c) => {
  const ws = param(c, 'ws');
  const { user } = await requireMember(c, ws, 'editor');
  const brand = await body(c, BrandSchema);
  await rateLimit(`brand:${user.id}`, 60, 3600);
  const row = await defaultSystem(ws);
  await q(`update design_systems set tokens = jsonb_set(coalesce(tokens, '{}'), '{brand}', $2::jsonb), updated_at = now() where id = $1`, [row.id, JSON.stringify(brand)]);
  await audit({ workspaceId: ws, actorId: user.id, action: 'brand.update', targetType: 'design_system', targetId: row.id, ip: clientIp(c) });
  return c.json({ brand });
});

// ---------------------------------------------------------------- export
extras.get('/projects/:id/export', async (c) => {
  const { user, project } = await requireProject(c, param(c, 'id'));
  await rateLimit(`export:${user.id}`, 30, 3600);
  const [versions, comments] = await Promise.all([
    q<any>(`select number, kind, label, snapshot, created_at from project_versions where project_id = $1 order by number`, [project.id]),
    q<any>(`select c.body, c.target, c.created_at, c.resolved_at, u.name from comments c left join "user" u on u.id = c.author_id where c.project_id = $1 order by c.created_at`, [project.id]),
  ]);
  const doc = {
    format: 'aether.project', formatVersion: 1, exportedAt: new Date().toISOString(),
    project: { ...snapshotOf(project), client: project.client, outputs: project.outputs, direction: project.direction },
    versions: versions.map((v) => ({ number: v.number, kind: v.kind, label: v.label, at: new Date(v.created_at).toISOString(), snapshot: v.snapshot })),
    comments: comments.map((m) => ({ by: m.name ?? 'Former member', on: m.target, text: m.body, at: new Date(m.created_at).toISOString(), resolved: !!m.resolved_at })),
  };
  await audit({ workspaceId: project.workspace_id, actorId: user.id, action: 'project.export', targetType: 'project', targetId: project.id, ip: clientIp(c) });
  return new Response(JSON.stringify(doc, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${project.slug}.aether.json"`,
      'cache-control': 'no-store',
    },
  });
});

// ---------------------------------------------------------------- account deletion
/**
 * Delete the signed-in account. Workspaces only this person belongs to are deleted with it,
 * including their uploaded files. Shared workspaces they own must be handed over first, so
 * nobody else loses access to their work.
 */
extras.post('/me/delete', async (c) => {
  const user = await requireUser(c);
  const input = await body(c, z.object({ confirmEmail: z.string().trim().toLowerCase().max(200) }));
  await rateLimit(`delete-account:${user.id}`, 5, 3600);
  if (input.confirmEmail !== user.email.toLowerCase()) throw new ApiError(400, 'invalid_request', 'Type the email address of this account to confirm.');
  const owned = await q<{ id: string; name: string; others: number }>(
    `select w.id, w.name, (select count(*) from workspace_members o where o.workspace_id = w.id and o.user_id <> $1)::int as others
     from workspace_members m join workspaces w on w.id = m.workspace_id where m.user_id = $1 and m.role = 'owner'`,
    [user.id],
  );
  const shared = owned.filter((w) => w.others > 0);
  if (shared.length) throw conflict(`You own ${shared.map((w) => `“${w.name}”`).join(', ')}, which other people use. Make someone else the owner in Team first.`, { workspaces: shared.map((w) => w.id) });
  const solo = owned.map((w) => w.id);
  const keys = solo.length ? await q<{ storage_key: string; meta: any }>(`select storage_key, meta from assets where workspace_id = any($1::uuid[])`, [solo]) : [];
  await tx(async (db) => {
    if (solo.length) await q(`delete from workspaces where id = any($1::uuid[])`, [solo], db);
    await q(`delete from "user" where id = $1`, [user.id], db);
  });
  await audit({ actorId: null, action: 'account.delete', targetType: 'user', targetId: user.id, ip: clientIp(c), meta: { workspacesDeleted: solo.length, files: keys.length } });
  const storage = getStorage();
  await Promise.all(keys.flatMap((k) => [storage.delete(k.storage_key), ...(k.meta?.thumb ? [storage.delete(`${k.storage_key}.thumb`)] : [])].map((p) => p.catch(() => undefined))));
  // the session row went with the user; clear the cookies too
  const secure = env.appUrl.startsWith('https://');
  for (const name of [secure ? '__Secure-better-auth.session_token' : 'better-auth.session_token', secure ? '__Secure-better-auth.session_data' : 'better-auth.session_data']) {
    c.header('set-cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`, { append: true });
  }
  return c.json({ deleted: true });
});

// ---------------------------------------------------------------- daily cleanup
/**
 * Called once a day by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. Removes expired
 * sessions and links, old rate-limit and presence rows, staging outbox mail, projects that were
 * deleted more than 30 days ago, and uploads that never finished.
 */
export async function runCleanup() {
  const counts: Record<string, number> = {};
  const run = async (name: string, sql: string) => { counts[name] = (await q(sql)).length; };
  await run('sessions', `delete from "session" where "expiresAt" < now() returning 1`);
  await deleteExpiredAuthRows();
  await run('rateLimits', `delete from api_rate_limits where window_start < now() - interval '1 day' returning 1`);
  await run('presence', `delete from project_presence where seen_at < now() - interval '1 day' returning 1`);
  await run('outbox', `delete from dev_outbox where created_at < now() - interval '2 days' returning 1`);
  await run('invitations', `delete from invitations where accepted_at is null and expires_at < now() - interval '30 days' returning 1`);
  await run('projects', `delete from projects where deleted_at < now() - interval '30 days' returning 1`);
  const stale = await q<{ id: string; storage_key: string; meta: any }>(
    `select id, storage_key, meta from assets where (status <> 'ready' and created_at < now() - interval '1 day') or deleted_at < now() - interval '1 day' limit 500`,
  );
  const storage = getStorage();
  for (const a of stale) {
    await storage.delete(a.storage_key).catch(() => undefined);
    if (a.meta?.thumb) await storage.delete(`${a.storage_key}.thumb`).catch(() => undefined);
  }
  if (stale.length) await q(`delete from assets where id = any($1::uuid[])`, [stale.map((a) => a.id)]);
  counts.files = stale.length;
  return counts;
}

extras.get('/cron/cleanup', async (c) => {
  const secret = (process.env.CRON_SECRET ?? '').trim();
  if (!secret || c.req.header('authorization') !== `Bearer ${secret}`) throw new ApiError(401, 'unauthenticated', 'Not allowed.');
  const counts = await runCleanup();
  console.log('[cron] cleanup', JSON.stringify(counts));
  return c.json({ ok: true, removed: counts });
});
