import { Hono } from 'hono';
import { z } from 'zod';
import { one, q, tx } from '../db.js';
import { requireProject } from '../lib/access.js';
import { ApiError, audit, body, clientIp, conflict, param, rateLimit } from '../lib/http.js';
import { buildSite, getAdapter, runChecks, validateBuild } from '../services/publish.js';
import { lockProject, recordVersion, snapshotOf } from '../services/projects.js';
import { logActivity } from '../services/workspaces.js';

export const publish = new Hono();
export const publicSites = new Hono();

const SITE_SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;
const PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

const publishToClient = (p: any) => ({ id: p.id, number: p.number, status: p.status, url: p.url ?? undefined, slug: p.slug, adapter: p.adapter, error: p.error ?? undefined, log: p.log, at: new Date(p.created_at).getTime(), finishedAt: p.finished_at ? new Date(p.finished_at).getTime() : undefined, byId: p.created_by, versionNumber: p.version_number });

publish.get('/projects/:id/checks', async (c) => {
  const { project } = await requireProject(c, param(c, 'id'));
  const adapter = getAdapter();
  const site = await one<{ slug: string }>(`select slug from sites where project_id = $1`, [project.id]);
  return c.json({ checks: runChecks(snapshotOf(project)), adapter: { name: adapter.name, missing: adapter.requirements() }, slug: site?.slug ?? `${project.slug}-${project.id.slice(0, 6)}` });
});

/** The exact page a publish would produce, from the current working state. Signed-in members only. */
publish.get('/projects/:id/preview', async (c) => {
  const { project } = await requireProject(c, param(c, 'id'));
  const { html } = buildSite(snapshotOf(project), { client: project.client, number: 0 });
  return new Response(html, { headers: { ...PAGE_HEADERS, 'cache-control': 'no-store' } });
});

publish.get('/projects/:id/publishes', async (c) => {
  const { project } = await requireProject(c, param(c, 'id'));
  const rows = await q<any>(`select p.*, v.number as version_number from publishes p join project_versions v on v.id = p.version_id where p.project_id = $1 order by p.number desc limit 50`, [project.id]);
  return c.json({ publishes: rows.map(publishToClient) });
});

/**
 * Publish: checks → immutable version snapshot → build → validate → deploy → verify.
 * The record only becomes "live" after the public route is confirmed to serve this exact build.
 */
publish.post('/projects/:id/publish', async (c) => {
  const { user, project } = await requireProject(c, param(c, 'id'), 'admin');
  const input = await body(c, z.object({ slug: z.string().regex(SITE_SLUG, 'Use 2 to 63 lowercase letters, numbers and hyphens').optional() }));
  await rateLimit(`publish:${project.workspace_id}`, 30, 3600);
  const adapter = getAdapter();
  const missing = adapter.requirements();
  if (missing.length) throw new ApiError(503, 'publishing_unavailable', `Publishing with the ${adapter.name} adapter is not set up yet. Missing: ${missing.join('; ')}.`, { missing });

  const checks = runChecks(snapshotOf(project));
  const failed = checks.filter((ch) => ch.status === 'fail');
  if (failed.length) throw new ApiError(422, 'checks_failed', `Fix ${failed.length === 1 ? 'this check' : 'these checks'} before publishing: ${failed.map((f) => f.label).join(', ')}.`, { checks });

  const log: { step: string; at: number; ok: boolean }[] = [];
  const mark = (step: string, ok = true) => log.push({ step, at: Date.now(), ok });

  // 1. immutable snapshot
  const started = await tx(async (db) => {
    const current = await lockProject(db, project.id);
    const existing = await one<{ slug: string }>(`select slug from sites where project_id = $1`, [project.id], db);
    const slug = input.slug ?? existing?.slug ?? `${current.slug}-${current.id.slice(0, 6)}`;
    const taken = await one<{ project_id: string }>(`select project_id from sites where slug = $1`, [slug], db);
    if (taken && taken.project_id !== project.id) throw conflict('That address is already taken. Choose another.');
    const version = await recordVersion(db, current, { kind: 'publish', label: 'Published snapshot', userId: user.id });
    const row = (await one<any>(
      `insert into publishes (project_id, version_id, number, status, adapter, slug, checks, created_by)
       values ($1,$2, coalesce((select max(number) from publishes where project_id = $1), 0) + 1, 'building', $3, $4, $5, $6) returning *`,
      [project.id, version.id, adapter.name, slug, JSON.stringify(checks), user.id], db,
    ))!;
    return { row, snapshot: snapshotOf(current), slug, version };
  });
  mark('Snapshot saved');

  const fail = async (step: string, error: string) => {
    mark(step, false);
    await q(`update publishes set status = 'failed', error = $2, log = $3, finished_at = now() where id = $1`, [started.row.id, error, JSON.stringify(log)]);
    await audit({ workspaceId: project.workspace_id, actorId: user.id, action: 'publish.failed', targetType: 'project', targetId: project.id, ip: clientIp(c), meta: { error } });
    throw new ApiError(502, 'publish_failed', `Publishing failed: ${error} The live site was not changed.`, { publishId: started.row.id, log });
  };

  // 2. build and validate
  let built: ReturnType<typeof buildSite>;
  try { built = buildSite(started.snapshot, { client: project.client, number: started.row.number }); } catch (err) { return fail('Build', (err as Error).message); }
  mark('Build generated');
  const problem = validateBuild(built.html);
  if (problem) return fail('Build validation', problem);
  mark('Build validated');

  // 3. deploy: point the public address at this build
  const url = adapter.publicUrl(started.slug);
  try {
    await tx(async (db) => {
      await q(`update publishes set status = 'deploying', artifact = $2, artifact_hash = $3, url = $4 where id = $1`, [started.row.id, built.html, built.hash, url], db);
      await q(`update publishes set status = 'superseded' where project_id = $1 and status = 'live'`, [project.id], db);
      await q(`insert into sites (slug, project_id, publish_id) values ($1,$2,$3) on conflict (project_id) do update set slug = excluded.slug, publish_id = excluded.publish_id, updated_at = now()`, [started.slug, project.id, started.row.id], db);
    });
  } catch (err) { return fail('Deploy', (err as Error).message); }
  mark('Deployed');

  // 4. verify what the public address now serves before calling it live
  const served = await one<{ artifact_hash: string }>(`select p.artifact_hash from sites s join publishes p on p.id = s.publish_id where s.slug = $1`, [started.slug]);
  if (served?.artifact_hash !== built.hash) return fail('Verification', 'The public address is not serving the new build.');
  mark('Verified live');

  const final = await tx(async (db) => {
    const row = await one<any>(`update publishes set status = 'live', log = $2, finished_at = now() where id = $1 returning *`, [started.row.id, JSON.stringify(log)], db);
    await q(`update projects set stage = 'universe', progress = 1, updated_at = now(), revision = revision + 1 where id = $1`, [project.id], db);
    await logActivity(db, { workspaceId: project.workspace_id, projectId: project.id, actorId: user.id, kind: 'publish', body: `published ${project.name} v${row.number}` });
    return row;
  });
  await audit({ workspaceId: project.workspace_id, actorId: user.id, action: 'publish.live', targetType: 'project', targetId: project.id, ip: clientIp(c), meta: { publish: final.id, slug: started.slug } });
  const rev = await one<{ revision: number }>(`select revision from projects where id = $1`, [project.id]);
  return c.json({ publish: publishToClient({ ...final, version_number: started.version.number }), revision: rev?.revision }, 201);
});

publish.post('/projects/:id/unpublish', async (c) => {
  const { user, project } = await requireProject(c, param(c, 'id'), 'admin');
  const done = await tx(async (db) => {
    const live = await one<{ id: string }>(`update publishes set status = 'unpublished' where project_id = $1 and status = 'live' returning id`, [project.id], db);
    if (!live) throw conflict('This project is not published.');
    await q(`update sites set publish_id = null, updated_at = now() where project_id = $1`, [project.id], db);
    await logActivity(db, { workspaceId: project.workspace_id, projectId: project.id, actorId: user.id, kind: 'publish', body: `unpublished ${project.name}` });
    return live;
  });
  await audit({ workspaceId: project.workspace_id, actorId: user.id, action: 'publish.unpublish', targetType: 'project', targetId: project.id, ip: clientIp(c), meta: { publish: done.id } });
  return c.json({ ok: true });
});

/** Put an earlier build back live. The working project is not changed. */
publish.post('/projects/:id/rollback', async (c) => {
  const { user, project } = await requireProject(c, param(c, 'id'), 'admin');
  const input = await body(c, z.object({ publishId: z.string().uuid() }));
  const row = await tx(async (db) => {
    const target = await one<any>(`select * from publishes where id = $1 and project_id = $2 for update`, [input.publishId, project.id], db);
    if (!target || !target.artifact || !['superseded', 'unpublished'].includes(target.status)) throw conflict('That build cannot be restored.');
    await q(`update publishes set status = 'superseded' where project_id = $1 and status = 'live'`, [project.id], db);
    await q(`insert into sites (slug, project_id, publish_id) values ($1,$2,$3) on conflict (project_id) do update set publish_id = excluded.publish_id, updated_at = now()`, [target.slug, project.id, target.id], db);
    const live = await one<any>(`update publishes set status = 'live', finished_at = now() where id = $1 returning *`, [target.id], db);
    await logActivity(db, { workspaceId: project.workspace_id, projectId: project.id, actorId: user.id, kind: 'publish', body: `rolled ${project.name} back to published v${target.number}` });
    return live;
  });
  await audit({ workspaceId: project.workspace_id, actorId: user.id, action: 'publish.rollback', targetType: 'project', targetId: project.id, ip: clientIp(c), meta: { publish: row.id } });
  return c.json({ publish: publishToClient(row) });
});

/** Public: the live build for an address. Static HTML, no scripts, locked down with a strict CSP. */
publicSites.get('/p/:slug', async (c) => {
  const slug = c.req.param('slug');
  const row = SITE_SLUG.test(slug) ? await one<{ artifact: string }>(`select p.artifact from sites s join publishes p on p.id = s.publish_id and p.status = 'live' where s.slug = $1`, [slug]) : null;
  if (!row) return new Response('<!doctype html><meta charset="utf-8"><title>Not published</title><body style="background:#000;color:#f2f2f3;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0"><p>Nothing is published at this address.</p></body>', { status: 404, headers: PAGE_HEADERS });
  return new Response(row.artifact, { headers: { ...PAGE_HEADERS, 'cache-control': 'public, max-age=0, must-revalidate' } });
});

