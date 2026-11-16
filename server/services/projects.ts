import { one, q, type Db } from '../db.js';
import type { ProjectRow } from '../lib/access.js';
import { conflict } from '../lib/http.js';
import { DesignDocSchema, MotionSchema, SpaceSchema, type Snapshot } from '../../shared/model.js';

/** The project as the browser's store expects it (see src/data/types.ts). */
export function toClient(p: ProjectRow, extra: { teamIds?: string[]; comments?: any[]; published?: any; siteSlug?: string | null } = {}) {
  return {
    id: p.id,
    slug: p.slug,
    workspaceId: p.workspace_id,
    name: p.name,
    client: p.client,
    description: p.description,
    category: p.category,
    stage: p.stage,
    ownerId: p.created_by,
    teamIds: extra.teamIds ?? [p.created_by],
    updatedAt: new Date(p.updated_at).getTime(),
    createdAt: new Date(p.created_at).getTime(),
    due: p.due ?? '',
    progress: p.progress,
    outputs: p.outputs,
    health: p.health,
    domain: extra.siteSlug ?? p.slug,
    doc: p.doc,
    motion: p.motion,
    space: p.space,
    revision: p.revision,
    published: extra.published ?? undefined,
    comments: extra.comments ?? [],
  };
}

export const commentToClient = (c: any) => ({ id: c.id, authorId: c.author_id, text: c.body, at: new Date(c.created_at).getTime(), target: c.target, resolved: !!c.resolved_at });

export const snapshotOf = (p: Pick<ProjectRow, 'name' | 'description' | 'stage' | 'doc' | 'motion' | 'space'>): Snapshot => ({ name: p.name, description: p.description, stage: p.stage as Snapshot['stage'], doc: p.doc, motion: p.motion, space: p.space });

export function validateSnapshot(s: { doc: unknown; motion: unknown; space: unknown }) {
  return { doc: DesignDocSchema.parse(s.doc), motion: MotionSchema.parse(s.motion), space: SpaceSchema.parse(s.space) };
}

const COALESCE_MINUTES = 10;

/**
 * Record the project's current state as a version. Small manual edits by the same person within
 * ten minutes update one 'edit' version instead of creating dozens; every Muse acceptance,
 * restore, publish and duplicate always gets its own version.
 */
export async function recordVersion(db: Db, project: ProjectRow, opts: { kind: 'create' | 'edit' | 'muse' | 'restore' | 'publish' | 'duplicate'; label: string; userId: string; restoredFrom?: string }) {
  const snapshot = JSON.stringify(snapshotOf(project));
  if (opts.kind === 'edit') {
    const last = await one<{ id: string; kind: string; created_by: string; fresh: boolean }>(
      `select id, kind, created_by, updated_at > now() - make_interval(mins => $2) as fresh from project_versions where project_id = $1 order by number desc limit 1`,
      [project.id, COALESCE_MINUTES], db,
    );
    if (last && last.kind === 'edit' && last.created_by === opts.userId && last.fresh) {
      return (await one<{ id: string; number: number }>(`update project_versions set snapshot = $2, label = $3, updated_at = now() where id = $1 returning id, number`, [last.id, snapshot, opts.label], db))!;
    }
  }
  return (await one<{ id: string; number: number }>(
    `insert into project_versions (project_id, number, kind, label, snapshot, restored_from, created_by)
     values ($1, coalesce((select max(number) from project_versions where project_id = $1), 0) + 1, $2, $3, $4, $5, $6) returning id, number`,
    [project.id, opts.kind, opts.label, snapshot, opts.restoredFrom ?? null, opts.userId], db,
  ))!;
}

/** Lock the row, check the caller saw the latest revision, and return it for modification. */
export async function lockProject(db: Db, projectId: string, baseRevision?: number): Promise<ProjectRow> {
  const p = await one<ProjectRow>(`select *, to_char(due, 'YYYY-MM-DD') as due from projects where id = $1 and deleted_at is null for update`, [projectId], db);
  if (!p) throw conflict('This project no longer exists.');
  if (baseRevision !== undefined && baseRevision !== p.revision) {
    throw conflict('This project changed somewhere else. The latest version has been loaded; your last edit was not saved.', { revision: p.revision });
  }
  return p;
}

export async function writeProject(db: Db, id: string, fields: Record<string, unknown>): Promise<ProjectRow> {
  const allowed = ['name', 'client', 'description', 'category', 'health', 'stage', 'outputs', 'due', 'progress', 'doc', 'motion', 'space', 'settings'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k) && fields[k] !== undefined);
  const json = new Set(['doc', 'motion', 'space', 'settings']);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const values = keys.map((k) => (json.has(k) ? JSON.stringify(fields[k]) : fields[k]));
  const row = await one<ProjectRow>(
    `update projects set ${[...sets, 'revision = revision + 1', 'updated_at = now()'].join(', ')} where id = $1 returning *, to_char(due, 'YYYY-MM-DD') as due`,
    [id, ...values], db,
  );
  return row!;
}

export async function uniqueProjectSlug(db: Db, workspaceId: string, base: string) {
  let slug = base;
  for (let n = 2; n < 200; n++) {
    if (!(await one(`select 1 from projects where workspace_id = $1 and slug = $2`, [workspaceId, slug], db))) return slug;
    slug = `${base.slice(0, 44)}-${n}`;
  }
  return `${base.slice(0, 36)}-${Date.now().toString(36)}`;
}

export async function publishedInfo(projectIds: string[], db?: Db) {
  if (!projectIds.length) return new Map<string, any>();
  const rows = await q<{ project_id: string; slug: string; url: string | null; number: number | null; finished_at: Date | null }>(
    `select s.project_id, s.slug, p.url, p.number, p.finished_at from sites s left join publishes p on p.id = s.publish_id and p.status = 'live' where s.project_id = any($1)`,
    [projectIds], db,
  );
  return new Map(rows.map((r) => [r.project_id, { slug: r.slug, published: r.url ? { url: r.url, at: new Date(r.finished_at ?? Date.now()).getTime(), version: r.number } : undefined }]));
}
