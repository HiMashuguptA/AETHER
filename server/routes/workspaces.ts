import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { one, q, tx } from '../db.js';
import { capabilities, env } from '../env.js';
import { currentUser, requireMember, requireUser } from '../lib/access.js';
import { audit, badRequest, body, clientIp, conflict, forbidden, hash, notFound, param, rateLimit } from '../lib/http.js';
import { sendEmail } from '../services/email.js';
import { commentToClient, publishedInfo, toClient } from '../services/projects.js';
import { createWorkspace, listMembers, listWorkspaces } from '../services/workspaces.js';
import { assetToClient } from './assets.js';
import { proposalToClient } from './muse.js';
import { ROLES, roleRank, type Role } from '../../shared/model.js';

export const workspaces = new Hono();

workspaces.get('/me', async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ user: null, workspaces: [], capabilities: capabilities() });
  const [list, prefs] = await Promise.all([listWorkspaces(user.id), one<{ last_workspace_id: string | null; data: any }>(`select last_workspace_id, data from user_preferences where user_id = $1`, [user.id])]);
  return c.json({ user, workspaces: list, lastWorkspaceId: prefs?.last_workspace_id ?? list[0]?.id ?? null, preferences: prefs?.data ?? {}, capabilities: capabilities() });
});

workspaces.patch('/me/preferences', async (c) => {
  const user = await requireUser(c);
  const input = await body(c, z.object({ lastWorkspaceId: z.string().uuid().optional(), data: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()])).optional() }));
  if (input.lastWorkspaceId) await requireMember(c, input.lastWorkspaceId);
  await q(
    `insert into user_preferences (user_id, last_workspace_id, data) values ($1, $2, coalesce($3::jsonb, '{}'))
     on conflict (user_id) do update set last_workspace_id = coalesce($2, user_preferences.last_workspace_id), data = user_preferences.data || coalesce($3::jsonb, '{}'), updated_at = now()`,
    [user.id, input.lastWorkspaceId ?? null, input.data ? JSON.stringify(input.data) : null],
  );
  return c.json({ ok: true });
});

workspaces.post('/workspaces', async (c) => {
  const user = await requireUser(c);
  const input = await body(c, z.object({ name: z.string().trim().min(1).max(80) }));
  await rateLimit(`ws-create:${user.id}`, 5, 3600);
  const ws = await createWorkspace({ name: input.name, userId: user.id });
  await audit({ workspaceId: ws.id, actorId: user.id, action: 'workspace.create', ip: clientIp(c) });
  return c.json({ workspace: { ...ws, role: 'owner', members: 1 } }, 201);
});

workspaces.patch('/workspaces/:ws', async (c) => {
  const ws = param(c, 'ws');
  const { user } = await requireMember(c, ws, 'admin');
  const input = await body(c, z.object({ name: z.string().trim().min(1).max(80) }));
  await q(`update workspaces set name = $2 where id = $1`, [ws, input.name]);
  await audit({ workspaceId: ws, actorId: user.id, action: 'workspace.rename', ip: clientIp(c) });
  return c.json({ ok: true });
});

/** Everything the workspace UI needs in one round trip. */
workspaces.get('/workspaces/:ws/bootstrap', async (c) => {
  const ws = param(c, 'ws');
  const { role } = await requireMember(c, ws);
  const [members, projects, comments, assets, activity, proposals, usage] = await Promise.all([
    listMembers(ws),
    q<any>(`select *, to_char(due, 'YYYY-MM-DD') as due from projects where workspace_id = $1 and deleted_at is null order by updated_at desc limit 200`, [ws]),
    q<any>(`select c.* from comments c join projects p on p.id = c.project_id where p.workspace_id = $1 and p.deleted_at is null order by c.created_at`, [ws]),
    q<any>(`select a.*, (select coalesce(array_agg(project_id), '{}') from asset_projects ap where ap.asset_id = a.id) as project_ids from assets a where a.workspace_id = $1 and a.deleted_at is null and a.status = 'ready' order by a.created_at desc limit 500`, [ws]),
    q<any>(`select * from activity_events where workspace_id = $1 order by created_at desc limit 60`, [ws]),
    q<any>(`select pr.* from proposals pr join projects p on p.id = pr.project_id where p.workspace_id = $1 and p.deleted_at is null and pr.status = 'pending' order by pr.created_at`, [ws]),
    one<{ accepted: number }>(`select count(*)::int as accepted from proposals pr join projects p on p.id = pr.project_id where p.workspace_id = $1 and pr.status = 'accepted' and pr.decided_at > date_trunc('month', now())`, [ws]),
  ]);
  const pub = await publishedInfo(projects.map((p) => p.id));
  const teamIds = members.map((m) => m.id);
  const byProject = new Map<string, any[]>();
  for (const cm of comments) byProject.set(cm.project_id, [...(byProject.get(cm.project_id) ?? []), commentToClient(cm)]);
  return c.json({
    role,
    members,
    projects: projects.map((p) => toClient(p, { teamIds, comments: byProject.get(p.id) ?? [], published: pub.get(p.id)?.published, siteSlug: pub.get(p.id)?.slug })),
    assets: assets.map(assetToClient),
    activity: activity.map((a) => ({ id: a.id, whoId: a.actor_id, text: a.body, projectId: a.project_id ?? undefined, at: new Date(a.created_at).getTime(), kind: a.kind })),
    proposals: proposals.map(proposalToClient),
    stats: { museAcceptedThisMonth: usage?.accepted ?? 0 },
  });
});

// ---------- members and invitations ----------
workspaces.get('/workspaces/:ws/members', async (c) => {
  const ws = param(c, 'ws');
  const { role } = await requireMember(c, ws);
  const members = await listMembers(ws);
  const invites = roleRank[role] >= roleRank.admin
    ? await q<any>(`select id, email, role, expires_at, created_at from invitations where workspace_id = $1 and accepted_at is null and revoked_at is null and expires_at > now() order by created_at desc`, [ws])
    : [];
  return c.json({ members, invitations: invites.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: new Date(i.expires_at).getTime() })) });
});

workspaces.post('/workspaces/:ws/invitations', async (c) => {
  const ws = param(c, 'ws');
  const { user, role } = await requireMember(c, ws, 'admin');
  const input = await body(c, z.object({ email: z.string().trim().toLowerCase().email().max(200), role: z.enum(['admin', 'editor', 'viewer']) }));
  if (input.role === 'admin' && role !== 'owner') throw forbidden('Only the owner can invite admins.');
  await rateLimit(`invite:${ws}`, 20, 3600);
  if (await one(`select 1 from workspace_members m join "user" u on u.id = m.user_id where m.workspace_id = $1 and lower(u.email) = $2`, [ws, input.email])) throw conflict('That person is already a member.');
  const token = randomBytes(24).toString('base64url');
  await q(`update invitations set revoked_at = now() where workspace_id = $1 and email = $2 and accepted_at is null and revoked_at is null`, [ws, input.email]);
  const inv = (await one<{ id: string }>(`insert into invitations (workspace_id, email, role, token_hash, invited_by, expires_at) values ($1,$2,$3,$4,$5, now() + interval '7 days') returning id`, [ws, input.email, input.role, hash(token), user.id]))!;
  const wsRow = await one<{ name: string }>(`select name from workspaces where id = $1`, [ws]);
  const url = `${env.appUrl}/#join?token=${token}`;
  await sendEmail({ to: input.email, kind: 'invite', subject: `${user.name} invited you to ${wsRow?.name} on AETHER`, url, lead: `${user.name} invited you to join the ${wsRow?.name} workspace on AETHER as ${input.role}.` });
  await audit({ workspaceId: ws, actorId: user.id, action: 'member.invite', targetType: 'invitation', targetId: inv.id, ip: clientIp(c), meta: { role: input.role } });
  // the link is returned to the admin who created it so it can be shared directly when email delivery is not configured
  return c.json({ invitation: { id: inv.id, email: input.email, role: input.role }, link: url, emailed: capabilities().email.delivery === 'resend' }, 201);
});

workspaces.delete('/workspaces/:ws/invitations/:id', async (c) => {
  const ws = param(c, 'ws');
  const { user } = await requireMember(c, ws, 'admin');
  await q(`update invitations set revoked_at = now() where id = $1 and workspace_id = $2`, [param(c, 'id'), ws]);
  await audit({ workspaceId: ws, actorId: user.id, action: 'member.invite_revoke', targetId: c.req.param('id'), ip: clientIp(c) });
  return c.json({ ok: true });
});

workspaces.post('/invitations/accept', async (c) => {
  const user = await requireUser(c);
  const input = await body(c, z.object({ token: z.string().min(10).max(200) }));
  await rateLimit(`join:${user.id}`, 10, 600);
  const result = await tx(async (db) => {
    const inv = await one<any>(`select * from invitations where token_hash = $1 for update`, [hash(input.token)], db);
    if (!inv || inv.revoked_at || inv.accepted_at || new Date(inv.expires_at) < new Date()) throw badRequest('This invitation is no longer valid. Ask for a new one.');
    if (inv.email !== user.email.toLowerCase()) throw forbidden(`This invitation was sent to ${inv.email}. Sign in with that address to accept it.`);
    if (!user.emailVerified) throw forbidden('Confirm your email address before joining a workspace.');
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1,$2,$3) on conflict do nothing`, [inv.workspace_id, user.id, inv.role], db);
    await q(`update invitations set accepted_at = now() where id = $1`, [inv.id], db);
    return inv;
  });
  await audit({ workspaceId: result.workspace_id, actorId: user.id, action: 'member.join', ip: clientIp(c), meta: { role: result.role } });
  return c.json({ workspaceId: result.workspace_id });
});

workspaces.patch('/workspaces/:ws/members/:userId', async (c) => {
  const ws = param(c, 'ws');
  const target = c.req.param('userId');
  const { user, role } = await requireMember(c, ws, 'admin');
  const input = await body(c, z.object({ role: z.enum(ROLES) }));
  const current = await one<{ role: Role }>(`select role from workspace_members where workspace_id = $1 and user_id = $2`, [ws, target]);
  if (!current) throw notFound('That member');
  // only the owner can grant or remove owner/admin; nobody can change their own role
  if (target === user.id) throw forbidden('You cannot change your own role.');
  if ((current.role === 'owner' || current.role === 'admin' || input.role === 'owner' || input.role === 'admin') && role !== 'owner') throw forbidden('Only the owner can change admin and owner roles.');
  await tx(async (db) => {
    await q(`update workspace_members set role = $3 where workspace_id = $1 and user_id = $2`, [ws, target, input.role], db);
    // ownership transfer: exactly one owner
    if (input.role === 'owner') await q(`update workspace_members set role = 'admin' where workspace_id = $1 and user_id = $2`, [ws, user.id], db);
  });
  await audit({ workspaceId: ws, actorId: user.id, action: 'member.role', targetType: 'user', targetId: target, ip: clientIp(c), meta: { from: current.role, to: input.role } });
  return c.json({ ok: true });
});

workspaces.delete('/workspaces/:ws/members/:userId', async (c) => {
  const ws = param(c, 'ws');
  const target = c.req.param('userId');
  const user = await requireUser(c);
  const { role } = await requireMember(c, ws, target === user.id ? 'viewer' : 'admin');
  const current = await one<{ role: Role }>(`select role from workspace_members where workspace_id = $1 and user_id = $2`, [ws, target]);
  if (!current) throw notFound('That member');
  if (current.role === 'owner') throw forbidden('Transfer ownership before the owner leaves.');
  if (current.role === 'admin' && role !== 'owner' && target !== user.id) throw forbidden('Only the owner can remove an admin.');
  await q(`delete from workspace_members where workspace_id = $1 and user_id = $2`, [ws, target]);
  await audit({ workspaceId: ws, actorId: user.id, action: target === user.id ? 'member.leave' : 'member.remove', targetType: 'user', targetId: target, ip: clientIp(c) });
  return c.json({ ok: true });
});

workspaces.get('/workspaces/:ws/usage', async (c) => {
  const ws = param(c, 'ws');
  await requireMember(c, ws, 'admin');
  const rows = await q<any>(`select feature, provider, model, count(*)::int as requests, sum(input_tokens)::int as input_tokens, sum(output_tokens)::int as output_tokens, sum(cost_usd)::float as cost_usd from ai_usage where workspace_id = $1 and created_at > now() - interval '30 days' group by 1,2,3 order by cost_usd desc`, [ws]);
  return c.json({ last30Days: rows });
});

/** Staging only: the latest verification / reset / invite link for an address, when DEV_OUTBOX=true. */
workspaces.get('/dev/outbox', async (c) => {
  if (!env.devOutbox && env.stage !== 'test') throw notFound();
  const email = (c.req.query('email') ?? '').toLowerCase();
  if (!email) throw badRequest('email is required');
  if (env.stage !== 'test') await rateLimit(`outbox:${clientIp(c)}`, 30, 60);
  const row = await one<{ kind: string; url: string; created_at: Date }>(`select kind, url, created_at from dev_outbox where email = $1 and created_at > now() - interval '1 hour' order by id desc limit 1`, [email]);
  return c.json({ message: row ? { kind: row.kind, url: row.url, at: new Date(row.created_at).getTime() } : null });
});
