import { Hono } from 'hono';
import { z } from 'zod';
import { one, q, tx, type Db } from '../db.js';
import { currentUser, requireProject, requireUser, type ProjectRow } from '../lib/access.js';
import { audit, body, clientIp, conflict, hash, notFound, param, rateLimit } from '../lib/http.js';
import { exploreIdea, proposeForProject, type Draft } from '../services/muse/index.js';
import { lockProject, recordVersion, writeProject } from '../services/projects.js';
import { logActivity } from '../services/workspaces.js';
import { ChangeSchema, applyChange, currentValue, describeValue, type Change } from '../../shared/model.js';

export const muse = new Hono();

export const proposalToClient = (p: any) => ({
  id: p.id, projectId: p.project_id, title: p.title, target: p.target, from: p.from_text, to: p.to_text, rationale: p.rationale,
  change: p.change, status: p.status, source: p.source, createdAt: new Date(p.created_at).getTime(),
});
const messageToClient = (m: any, proposalIds: string[] = []) => ({
  id: m.id, projectId: m.project_id, role: m.role, text: m.body, context: m.context, source: m.source, model: m.model ?? undefined,
  proposalIds, at: new Date(m.created_at).getTime(),
});

/** Idea first, account second: a visitor can explore an idea before signing up (tightly rate limited). */
muse.post('/muse/directions', async (c) => {
  const user = await currentUser(c);
  const input = await body(c, z.object({ idea: z.string().trim().min(3).max(1500) }));
  const ip = clientIp(c);
  if (user) await rateLimit(`directions:u:${user.id}`, 20, 3600);
  else {
    await rateLimit(`directions:ip:${ip}`, 6, 3600);
    await rateLimit('directions:anon:all', 300, 86400);
  }
  const anonKey = user ? null : hash(`anon:${ip}`).slice(0, 32);
  const result = await exploreIdea(input.idea, { userId: user?.id, anonKey });
  const row = await one<{ id: string }>(
    `insert into creative_directions (anon_key, idea, interpretation, directions, source, model) values ($1,$2,$3,$4,$5,$6) returning id`,
    [anonKey, input.idea, JSON.stringify(result.interpretation ?? {}), JSON.stringify(result.directions), result.source, result.model],
  );
  return c.json({ id: row!.id, interpretation: result.interpretation, directions: result.directions, source: result.source, model: result.model });
});

async function conversationId(db: Db | undefined, p: ProjectRow, userId: string) {
  const existing = await one<{ id: string }>(`select id from muse_conversations where project_id = $1 and kind = 'project'`, [p.id], db);
  if (existing) return existing.id;
  return (await one<{ id: string }>(`insert into muse_conversations (workspace_id, project_id, user_id, kind) values ($1,$2,$3,'project') on conflict (project_id) where kind = 'project' do update set kind = 'project' returning id`, [p.workspace_id, p.id, userId], db))!.id;
}

muse.get('/projects/:id/muse', async (c) => {
  const { project } = await requireProject(c, param(c, 'id'));
  const [messages, proposals] = await Promise.all([
    q<any>(`select m.*, c.project_id from muse_messages m join muse_conversations c on c.id = m.conversation_id where c.project_id = $1 and c.kind = 'project' order by m.created_at limit 300`, [project.id]),
    q<any>(`select * from proposals where project_id = $1 order by created_at limit 500`, [project.id]),
  ]);
  const byMessage = new Map<string, string[]>();
  for (const p of proposals) if (p.message_id) byMessage.set(p.message_id, [...(byMessage.get(p.message_id) ?? []), p.id]);
  return c.json({ messages: messages.map((m) => messageToClient(m, byMessage.get(m.id))), proposals: proposals.map(proposalToClient) });
});

async function storeProposals(db: Db, p: ProjectRow, userId: string, reply: string, drafts: Draft[], meta: { source: 'ai' | 'fallback' | 'check'; model: string | null }) {
  const conv = await conversationId(db, p, userId);
  const msg = (await one<any>(`insert into muse_messages (conversation_id, role, body, source, model) values ($1,'muse',$2,$3,$4) returning *`, [conv, reply, meta.source === 'check' ? 'fallback' : meta.source, meta.model], db))!;
  const rows: any[] = [];
  for (const d of drafts) {
    rows.push(await one<any>(
      `insert into proposals (project_id, message_id, title, target, from_text, to_text, rationale, change, source, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [p.id, msg.id, d.title, d.target, d.from, d.to, d.rationale, JSON.stringify(d.change), meta.source, userId], db,
    ));
  }
  return { message: messageToClient({ ...msg, project_id: p.id }, rows.map((r) => r.id)), proposals: rows.map(proposalToClient) };
}

/** Ask Muse for changes. It answers with proposals only; the project is not touched. */
muse.post('/projects/:id/muse', async (c) => {
  const { user, project } = await requireProject(c, param(c, 'id'), 'editor');
  const input = await body(c, z.object({ prompt: z.string().trim().min(1).max(2000), context: z.array(z.string().max(40)).max(8).default([]) }));
  await rateLimit(`muse:u:${user.id}`, 30, 600);
  await rateLimit(`muse:ws:${project.workspace_id}`, 200, 86400);
  const conv = await conversationId(undefined, project, user.id);
  const userMsg = (await one<any>(`insert into muse_messages (conversation_id, role, body, context, source, author_id) values ($1,'user',$2,$3,'user',$4) returning *`, [conv, input.prompt, JSON.stringify(input.context), user.id]))!;
  const result = await proposeForProject(project, input.prompt, input.context, { workspaceId: project.workspace_id, userId: user.id });
  const stored = await tx((db) => storeProposals(db, project, user.id, result.reply, result.drafts, result));
  return c.json({ userMessage: messageToClient({ ...userMsg, project_id: project.id }), ...stored, source: result.source, model: result.model });
});

/** Proposals raised by launch checks ("Fix with Muse"). Same review flow; marked as coming from a check, not a model. */
muse.post('/projects/:id/proposals', async (c) => {
  const { user, project } = await requireProject(c, param(c, 'id'), 'editor');
  const input = await body(c, z.object({
    intro: z.string().trim().min(1).max(600),
    items: z.array(z.object({ title: z.string().min(1).max(60), target: z.string().max(20), rationale: z.string().min(1).max(400), change: ChangeSchema })).min(1).max(5),
  }));
  const drafts: Draft[] = input.items.map((it) => {
    const change = it.change as Change;
    return { title: it.title, target: it.target, rationale: it.rationale, change, from: describeValue(currentValue(project, change)), to: describeValue(change.value) };
  });
  const stored = await tx((db) => storeProposals(db, project, user.id, input.intro, drafts, { source: 'check', model: null }));
  return c.json(stored, 201);
});

/** Apply accepted proposals: re-validated, applied to the latest project state, and recorded as a new version. */
async function decide(c: any, projectId: string, ids: string[] | 'all', accept: boolean) {
  const { user, project } = await requireProject(c, projectId, 'editor');
  const result = await tx(async (db) => {
    const current = await lockProject(db, project.id);
    const pending = await q<any>(`select * from proposals where project_id = $1 and status = 'pending' ${ids === 'all' ? '' : 'and id = any($2)'} order by created_at for update`, ids === 'all' ? [project.id] : [project.id, ids], db);
    if (!pending.length) throw conflict('That proposal has already been decided.');
    if (!accept) {
      await q(`update proposals set status = 'rejected', decided_by = $2, decided_at = now() where id = any($1)`, [pending.map((p) => p.id), user.id], db);
      return { project: current, decided: pending, version: null };
    }
    let next = current;
    for (const pr of pending) next = applyChange(next, ChangeSchema.parse(pr.change) as Change);
    const saved = await writeProject(db, project.id, { doc: next.doc, motion: next.motion, space: next.space });
    const label = pending.length === 1 ? `Muse: ${pending[0].title} ${pending[0].from_text} → ${pending[0].to_text}` : `Muse: ${pending.length} changes accepted`;
    const version = await recordVersion(db, saved, { kind: 'muse', label: label.slice(0, 200), userId: user.id });
    await q(`update proposals set status = 'accepted', decided_by = $2, decided_at = now(), applied_version_id = $3 where id = any($1)`, [pending.map((p) => p.id), user.id, version.id], db);
    await logActivity(db, { workspaceId: project.workspace_id, projectId: project.id, actorId: user.id, kind: 'muse', body: pending.length === 1 ? `accepted Muse change: ${pending[0].title.toLowerCase()}` : `accepted ${pending.length} Muse changes` });
    return { project: saved, decided: pending, version };
  });
  await audit({ workspaceId: project.workspace_id, actorId: user.id, action: accept ? 'proposal.accept' : 'proposal.reject', targetType: 'project', targetId: project.id, ip: clientIp(c), meta: { proposals: result.decided.map((p) => p.id) } });
  const p = result.project;
  return c.json({ decided: result.decided.map((d) => d.id), status: accept ? 'accepted' : 'rejected', version: result.version, project: { id: p.id, doc: p.doc, motion: p.motion, space: p.space, revision: p.revision, updatedAt: new Date(p.updated_at).getTime() } });
}

async function projectOfProposal(c: any): Promise<{ projectId: string; id: string }> {
  await requireUser(c);
  const id = param(c, 'id');
  const row = await one<{ project_id: string }>(`select project_id from proposals where id = $1`, [id]);
  if (!row) throw notFound('That proposal');
  return { projectId: row.project_id, id };
}
muse.post('/proposals/:id/accept', async (c) => { const p = await projectOfProposal(c); return decide(c, p.projectId, [p.id], true); });
muse.post('/proposals/:id/reject', async (c) => { const p = await projectOfProposal(c); return decide(c, p.projectId, [p.id], false); });
muse.post('/projects/:id/proposals/accept-all', (c) => decide(c, param(c, 'id'), 'all', true));
muse.post('/projects/:id/proposals/reject-all', (c) => decide(c, param(c, 'id'), 'all', false));

