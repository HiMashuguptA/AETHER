import { Hono } from 'hono';
import { z } from 'zod';
import { one, q, tx } from '../db.js';
import { requireMember, requireProject } from '../lib/access.js';
import { audit, body, clientIp, forbidden, notFound, param, rateLimit } from '../lib/http.js';
import { commentToClient, lockProject, publishedInfo, recordVersion, snapshotOf, toClient, uniqueProjectSlug, writeProject } from '../services/projects.js';
import { listMembers, logActivity } from '../services/workspaces.js';
import { DesignDocSchema, DirectionSchema, LAYERS, MotionSchema, OUTPUTS, STAGES, SpaceSchema, can, defaultMotion, defaultSpace, slugify } from '../../shared/model.js';

export const projects = new Hono();

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

async function clientProject(projectId: string) {
  const p = await one<any>(`select *, to_char(due, 'YYYY-MM-DD') as due from projects where id = $1`, [projectId]);
  if (!p) throw notFound('That project');
  const [members, comments, pub] = await Promise.all([
    listMembers(p.workspace_id),
    q<any>(`select * from comments where project_id = $1 order by created_at`, [projectId]),
    publishedInfo([projectId]),
  ]);
  return toClient(p, { teamIds: members.map((m) => m.id), comments: comments.map(commentToClient), published: pub.get(projectId)?.published, siteSlug: pub.get(projectId)?.slug });
}

projects.post('/workspaces/:ws/projects', async (c) => {
  const ws = param(c, 'ws');
  const { user } = await requireMember(c, ws, 'editor');
  const input = await body(c, z.object({
    name: z.string().trim().min(1).max(120),
    idea: z.string().trim().max(2000).default(''),
    outputs: z.array(z.enum(OUTPUTS)).min(1).max(4),
    direction: DirectionSchema.partial().extend({ name: z.string().max(60), accent: DirectionSchema.shape.accent, headline: DirectionSchema.shape.headline, subhead: DirectionSchema.shape.subhead, visual: DirectionSchema.shape.visual }),
    directionSetId: z.string().uuid().optional(),
  }));
  await rateLimit(`project-create:${user.id}`, 30, 3600);
  const id = await tx(async (db) => {
    const slug = await uniqueProjectSlug(db, ws, slugify(input.name, 28));
    const doc = DesignDocSchema.parse({
      headline: input.direction.headline, subhead: input.direction.subhead, cta: 'Start here', proof: 'Draft · made with AETHER', nav: ['Work', 'About', 'Contact'],
      accent: input.direction.accent, headlineSize: 60, subheadTone: '#c4c5cb', radius: 16, spacing: 24, align: 'left', theme: 'obsidian', visual: input.direction.visual, hidden: {}, locked: {},
    });
    const row = (await one<any>(
      `insert into projects (workspace_id, slug, name, client, description, stage, outputs, due, progress, doc, motion, space, direction, created_by)
       values ($1,$2,$3,'Your studio',$4,'form',$5, current_date + 21, 0.12, $6,$7,$8,$9,$10) returning *, to_char(due, 'YYYY-MM-DD') as due`,
      [ws, slug, input.name, input.idea, input.outputs, JSON.stringify(doc), JSON.stringify(defaultMotion()), JSON.stringify(defaultSpace('form')), JSON.stringify(input.direction), user.id], db,
    ))!;
    await recordVersion(db, row, { kind: 'create', label: `Created from the “${input.direction.name}” direction`, userId: user.id });
    await q(`insert into muse_conversations (workspace_id, project_id, user_id, kind) values ($1,$2,$3,'project')`, [ws, row.id, user.id], db);
    if (input.directionSetId) await q(`update creative_directions set workspace_id = $1, project_id = $2, selected = $3 where id = $4 and (workspace_id is null or workspace_id = $1)`, [ws, row.id, JSON.stringify(input.direction), input.directionSetId], db);
    await logActivity(db, { workspaceId: ws, projectId: row.id, actorId: user.id, kind: 'create', body: `created ${input.name} from the “${input.direction.name}” direction` });
    return row.id as string;
  });
  await audit({ workspaceId: ws, actorId: user.id, action: 'project.create', targetType: 'project', targetId: id, ip: clientIp(c) });
  return c.json({ project: await clientProject(id) }, 201);
});

projects.get('/projects/:id', async (c) => {
  const { project } = await requireProject(c, param(c, 'id'));
  return c.json({ project: await clientProject(project.id) });
});

const PatchSchema = z.object({
  baseRevision: z.number().int().positive(),
  name: z.string().trim().min(1).max(120).optional(),
  client: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  health: z.enum(['On track', 'In review', 'At risk']).optional(),
  stage: z.enum(STAGES).optional(),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  outputs: z.array(z.enum(OUTPUTS)).min(1).max(4).optional(),
  doc: DesignDocSchema.optional(),
  motion: MotionSchema.optional(),
  space: SpaceSchema.optional(),
});

/** Save edits. Requires the revision the browser last saw, so two people cannot overwrite each other silently. */
projects.patch('/projects/:id', async (c) => {
  const { user, project } = await requireProject(c, param(c, 'id'), 'editor');
  const { baseRevision, ...patch } = await body(c, PatchSchema);
  await rateLimit(`project-save:${user.id}`, 240, 60);
  const saved = await tx(async (db) => {
    const before = await lockProject(db, project.id, baseRevision);
    const after = await writeProject(db, project.id, patch);
    if (patch.doc || patch.motion || patch.space) await recordVersion(db, after, { kind: 'edit', label: 'Manual edits', userId: user.id });
    if (patch.stage && patch.stage !== before.stage) {
      await q(`update projects set progress = greatest(progress, $2) where id = $1`, [project.id, patch.stage === 'universe' ? 1 : STAGES.indexOf(patch.stage) / 5], db);
      await logActivity(db, { workspaceId: project.workspace_id, projectId: project.id, actorId: user.id, kind: 'edit', body: `moved ${after.name} to ${cap(patch.stage)}` });
    }
    return after;
  });
  return c.json({ revision: saved.revision, updatedAt: new Date(saved.updated_at).getTime() });
});

projects.delete('/projects/:id', async (c) => {
  const { user, role, project } = await requireProject(c, param(c, 'id'), 'editor');
  if (!can(role, 'admin') && project.created_by !== user.id) throw forbidden('Only an admin or the person who created this project can delete it.');
  await tx(async (db) => {
    await q(`update projects set deleted_at = now() where id = $1`, [project.id], db);
    await q(`update publishes set status = 'unpublished' where project_id = $1 and status = 'live'`, [project.id], db);
    await q(`delete from sites where project_id = $1`, [project.id], db);
    await logActivity(db, { workspaceId: project.workspace_id, actorId: user.id, kind: 'edit', body: `deleted ${project.name}` });
  });
  await audit({ workspaceId: project.workspace_id, actorId: user.id, action: 'project.delete', targetType: 'project', targetId: project.id, ip: clientIp(c) });
  return c.json({ ok: true });
});

projects.post('/projects/:id/duplicate', async (c) => {
  const { user, project } = await requireProject(c, param(c, 'id'), 'editor');
  await rateLimit(`project-create:${user.id}`, 30, 3600);
  const id = await tx(async (db) => {
    const name = `${project.name} copy`.slice(0, 120);
    const slug = await uniqueProjectSlug(db, project.workspace_id, slugify(name, 28));
    const row = (await one<any>(
      `insert into projects (workspace_id, slug, name, client, description, category, stage, outputs, due, progress, doc, motion, space, settings, direction, created_by)
       select workspace_id, $2, $3, client, description, category, case when stage = 'universe' then 'orbit'::core_stage else stage end, outputs, due, least(progress, 0.9), doc, motion, space, settings, direction, $4
       from projects where id = $1 returning *, to_char(due, 'YYYY-MM-DD') as due`,
      [project.id, slug, name, user.id], db,
    ))!;
    await recordVersion(db, row, { kind: 'duplicate', label: `Duplicated from ${project.name}`, userId: user.id });
    await q(`insert into muse_conversations (workspace_id, project_id, user_id, kind) values ($1,$2,$3,'project')`, [project.workspace_id, row.id, user.id], db);
    await logActivity(db, { workspaceId: project.workspace_id, projectId: row.id, actorId: user.id, kind: 'create', body: `duplicated ${project.name}` });
    return row.id as string;
  });
  return c.json({ project: await clientProject(id) }, 201);
});

// ---------- versions ----------
projects.get('/projects/:id/versions', async (c) => {
  const { project } = await requireProject(c, param(c, 'id'));
  const rows = await q<any>(`select v.id, v.number, v.kind, v.label, v.created_by, v.updated_at, v.restored_from, (select number from project_versions r where r.id = v.restored_from) as restored_number from project_versions v where v.project_id = $1 order by v.number desc limit 200`, [project.id]);
  return c.json({ versions: rows.map((v) => ({ id: v.id, number: v.number, kind: v.kind, label: v.label, byId: v.created_by, at: new Date(v.updated_at).getTime(), restoredNumber: v.restored_number ?? undefined })) });
});

projects.get('/projects/:id/versions/:vid', async (c) => {
  const { project } = await requireProject(c, param(c, 'id'));
  const v = await one<any>(`select id, number, kind, label, snapshot from project_versions where id = $1 and project_id = $2`, [param(c, 'vid'), project.id]);
  if (!v) throw notFound('That version');
  return c.json({ version: v });
});

/**
 * Restore the design, motion and space settings of an earlier version. Nothing is overwritten
 * silently: the caller must hold the latest revision, the current state is kept as its own
 * version first, and the restore itself becomes a new version. Name, stage, comments, assets
 * and publishing are left as they are.
 */
projects.post('/projects/:id/versions/:vid/restore', async (c) => {
  const { user, project } = await requireProject(c, param(c, 'id'), 'editor');
  const input = await body(c, z.object({ baseRevision: z.number().int().positive() }));
  const vid = param(c, 'vid');
  const result = await tx(async (db) => {
    const current = await lockProject(db, project.id, input.baseRevision);
    const target = await one<any>(`select id, number, snapshot from project_versions where id = $1 and project_id = $2`, [vid, project.id], db);
    if (!target) throw notFound('That version');
    const latest = await one<any>(`select snapshot from project_versions where project_id = $1 order by number desc limit 1`, [project.id], db);
    const now = snapshotOf(current);
    const same = (a: any, b: any) => JSON.stringify([a.doc, a.motion, a.space]) === JSON.stringify([b.doc, b.motion, b.space]);
    if (!latest || !same(latest.snapshot, now)) await q(
      `insert into project_versions (project_id, number, kind, label, snapshot, created_by) values ($1, coalesce((select max(number) from project_versions where project_id = $1), 0) + 1, 'edit', $2, $3, $4)`,
      [project.id, `Before restoring version ${target.number}`, JSON.stringify(now), user.id], db,
    );
    const snap = target.snapshot;
    const after = await writeProject(db, project.id, { doc: DesignDocSchema.parse(snap.doc), motion: MotionSchema.parse(snap.motion), space: SpaceSchema.parse(snap.space) });
    const version = await recordVersion(db, after, { kind: 'restore', label: `Restored version ${target.number}`, userId: user.id, restoredFrom: target.id });
    await logActivity(db, { workspaceId: project.workspace_id, projectId: project.id, actorId: user.id, kind: 'edit', body: `restored ${project.name} to version ${target.number}` });
    return { version };
  });
  await audit({ workspaceId: project.workspace_id, actorId: user.id, action: 'project.restore', targetType: 'project', targetId: project.id, ip: clientIp(c), meta: { version: vid } });
  return c.json({ project: await clientProject(project.id), version: result.version });
});

// ---------- comments ----------
projects.post('/projects/:id/comments', async (c) => {
  const { user, project } = await requireProject(c, param(c, 'id'), 'viewer');
  const input = await body(c, z.object({ text: z.string().trim().min(1).max(2000), target: z.enum(LAYERS) }));
  await rateLimit(`comment:${user.id}`, 60, 600);
  const row = await tx(async (db) => {
    const cm = await one<any>(`insert into comments (project_id, author_id, body, target) values ($1,$2,$3,$4) returning *`, [project.id, user.id, input.text, input.target], db);
    await logActivity(db, { workspaceId: project.workspace_id, projectId: project.id, actorId: user.id, kind: 'comment', body: `commented on ${project.name}` });
    return cm;
  });
  return c.json({ comment: commentToClient(row) }, 201);
});

projects.post('/projects/:id/comments/:cid/resolve', async (c) => {
  const { user, project } = await requireProject(c, param(c, 'id'), 'editor');
  const row = await one(`update comments set resolved_at = now(), resolved_by = $3 where id = $1 and project_id = $2 returning id`, [param(c, 'cid'), project.id, user.id]);
  if (!row) throw notFound('That comment');
  return c.json({ ok: true });
});
