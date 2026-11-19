import { randomBytes } from 'node:crypto';
import { one, q, tx, type Db } from '../db.js';
import { slugify } from '../../shared/model.js';

const DEFAULT_TOKENS = {
  colours: { obsidian: '#000000', graphite: '#181818', mist: '#f2f2f3', light: '#fafafa', violet: '#8b70ec', cobalt: '#3a63d8', cyan: '#62c8d9' },
  typography: { display: 'Geist', mono: 'Geist Mono', scale: [36, 48, 60, 72, 96] },
  spacing: [0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96],
  radius: [0, 2, 4, 6, 8, 12, 16, 24],
};

export async function createWorkspace({ name, userId }: { name: string; userId: string }) {
  return tx(async (db) => {
    const base = slugify(name, 32);
    let slug = base.length < 2 ? `${base}-studio` : base;
    for (let i = 0; i < 6; i++) {
      const taken = await one(`select 1 from workspaces where slug = $1`, [slug], db);
      if (!taken) break;
      slug = `${base.slice(0, 26)}-${randomBytes(3).toString('hex')}`;
    }
    const ws = (await one<{ id: string; name: string; slug: string }>(`insert into workspaces (name, slug, created_by) values ($1, $2, $3) returning id, name, slug`, [name.slice(0, 80), slug, userId], db))!;
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws.id, userId], db);
    await q(`insert into design_systems (workspace_id, name, tokens, is_default) values ($1, 'AETHER default', $2, true)`, [ws.id, JSON.stringify(DEFAULT_TOKENS)], db);
    await q(`insert into user_preferences (user_id, last_workspace_id) values ($1, $2) on conflict (user_id) do update set last_workspace_id = coalesce(user_preferences.last_workspace_id, excluded.last_workspace_id)`, [userId, ws.id], db);
    return ws;
  });
}

export async function listWorkspaces(userId: string) {
  return q<{ id: string; name: string; slug: string; role: string; members: number }>(
    `select w.id, w.name, w.slug, m.role, (select count(*)::int from workspace_members x where x.workspace_id = w.id) as members
     from workspaces w join workspace_members m on m.workspace_id = w.id
     where m.user_id = $1 and w.deleted_at is null order by w.created_at`,
    [userId],
  );
}

export async function listMembers(workspaceId: string, db?: Db) {
  return q<{ id: string; name: string; email: string; role: string; image: string | null }>(
    `select u.id, u.name, u.email, m.role, u.image from workspace_members m join "user" u on u.id = m.user_id where m.workspace_id = $1 order by m.created_at`,
    [workspaceId], db,
  );
}

export async function logActivity(db: Db, a: { workspaceId: string; projectId?: string | null; actorId: string; kind: 'muse' | 'edit' | 'publish' | 'comment' | 'create'; body: string; meta?: unknown }) {
  await q(`insert into activity_events (workspace_id, project_id, actor_id, kind, body, meta) values ($1,$2,$3,$4,$5,$6)`, [a.workspaceId, a.projectId ?? null, a.actorId, a.kind, a.body, JSON.stringify(a.meta ?? {})], db);
}
