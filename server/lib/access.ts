import type { Context } from 'hono';
import { one } from '../db.js';
import { getAuth } from '../auth.js';
import { can, type Role } from '../../shared/model.js';
import { forbidden, notFound, unauthorized } from './http.js';

export interface SessionUser { id: string; name: string; email: string; emailVerified: boolean; image?: string | null }

export async function currentUser(c: Context): Promise<SessionUser | null> {
  const cached = c.get('user') as SessionUser | null | undefined;
  if (cached !== undefined) return cached;
  const session = await getAuth().api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  const user = session?.user ? { id: session.user.id, name: session.user.name, email: session.user.email, emailVerified: session.user.emailVerified, image: session.user.image } : null;
  c.set('user', user);
  return user;
}

export async function requireUser(c: Context): Promise<SessionUser> {
  const user = await currentUser(c);
  if (!user) throw unauthorized();
  return user;
}

/**
 * The one place workspace access is decided. A person who is not a member gets "not found",
 * never "forbidden", so workspace and project ids cannot be probed from outside.
 */
export async function requireMember(c: Context, workspaceId: string, min: Role = 'viewer'): Promise<{ user: SessionUser; role: Role }> {
  const user = await requireUser(c);
  const row = await one<{ role: Role }>(
    `select m.role from workspace_members m join workspaces w on w.id = m.workspace_id
     where m.workspace_id = $1 and m.user_id = $2 and w.deleted_at is null`,
    [workspaceId, user.id],
  );
  if (!row) throw notFound('That workspace');
  if (!can(row.role, min)) throw forbidden(`This needs the ${min} role or higher. Your role here is ${row.role}.`);
  return { user, role: row.role };
}

export interface ProjectRow {
  id: string; workspace_id: string; slug: string; name: string; client: string; description: string; category: string; health: string;
  stage: string; outputs: string[]; due: string | null; progress: number; doc: any; motion: any; space: any; settings: any; direction: any;
  revision: number; created_by: string; created_at: Date; updated_at: Date;
}

export async function requireProject(c: Context, projectId: string, min: Role = 'viewer') {
  const user = await requireUser(c);
  const project = await one<ProjectRow & { role: Role | null }>(
    `select p.*, to_char(p.due, 'YYYY-MM-DD') as due, m.role
     from projects p left join workspace_members m on m.workspace_id = p.workspace_id and m.user_id = $2
     where p.id = $1 and p.deleted_at is null`,
    [projectId, user.id],
  );
  if (!project || !project.role) throw notFound('That project');
  if (!can(project.role, min)) throw forbidden(`This needs the ${min} role or higher. Your role here is ${project.role}.`);
  return { user, role: project.role, project };
}
