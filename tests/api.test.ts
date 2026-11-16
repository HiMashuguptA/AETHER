import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, q } from '../server/db.js';
import { setProviderForTests, type ModelProvider } from '../server/services/muse/providers.js';
import { Client, DIRECTION, PASSWORD, PNG, addMember, assetHeader, newProject, newUser } from './helpers.js';

afterAll(async () => { await closePool(); });

describe('authentication', () => {
  it('signs up, requires email verification, then keeps a session', async () => {
    const c = new Client();
    const email = `verify-${Date.now()}@example.test`;
    expect((await c.post('/api/auth/sign-up/email', { name: 'Ada', email, password: PASSWORD })).status).toBe(200);
    // not verified yet: no session, sign-in refused
    expect((await c.get('/api/me')).data.user).toBeNull();
    expect((await c.post('/api/auth/sign-in/email', { email, password: PASSWORD })).status).toBe(403);
    const link = new URL((await c.get(`/api/dev/outbox?email=${email}`)).data.message.url);
    await c.raw('GET', link.pathname + link.search);
    const me = await c.get('/api/me');
    expect(me.data.user.email).toBe(email);
    expect(me.data.user.emailVerified).toBe(true);
    // a personal workspace was created and the person owns it
    expect(me.data.workspaces).toHaveLength(1);
    expect(me.data.workspaces[0].role).toBe('owner');
    // session cookie is httpOnly
    const res = await new Client().raw('POST', '/api/auth/sign-in/email', { email, password: PASSWORD });
    expect(res.headers.getSetCookie().join(';')).toMatch(/HttpOnly/i);
  });

  it('rejects wrong and weak passwords, and logs out', async () => {
    const { c, email } = await newUser();
    expect((await new Client().post('/api/auth/sign-in/email', { email, password: 'wrong password!!' })).status).toBe(401);
    expect((await new Client().post('/api/auth/sign-up/email', { name: 'x', email: `weak-${Date.now()}@example.test`, password: 'short' })).status).toBe(400);
    expect((await c.post('/api/auth/sign-out')).status).toBe(200);
    expect((await c.get('/api/me')).data.user).toBeNull();
  });

  it('recovers a password with a single-use link', async () => {
    const { email } = await newUser();
    const c = new Client();
    expect((await c.post('/api/auth/request-password-reset', { email, redirectTo: '/#reset-password' })).status).toBe(200);
    const url = (await c.get(`/api/dev/outbox?email=${email}`)).data.message.url as string;
    const token = decodeURIComponent(url.split('token=')[1]);
    expect((await c.post('/api/auth/reset-password', { newPassword: 'a brand new password', token })).status).toBe(200);
    expect((await c.post('/api/auth/reset-password', { newPassword: 'another new password', token })).status).toBe(400);
    expect((await new Client().post('/api/auth/sign-in/email', { email, password: PASSWORD })).status).toBe(401);
    expect((await new Client().post('/api/auth/sign-in/email', { email, password: 'a brand new password' })).status).toBe(200);
  });

  it('does not reveal whether an address has an account when asking for a reset', async () => {
    const r = await new Client().post('/api/auth/request-password-reset', { email: 'nobody@example.test', redirectTo: '/#reset-password' });
    expect(r.status).toBe(200);
  });

  it('updates the account profile', async () => {
    const { c } = await newUser('Old Name');
    expect((await c.post('/api/auth/update-user', { name: 'New Name' })).status).toBe(200);
    expect((await c.get('/api/me')).data.user.name).toBe('New Name');
  });
});

describe('security', () => {
  it('refuses unauthenticated access to every protected route', async () => {
    const { ws, c } = await newUser();
    const p = await newProject(c, ws);
    const anon = new Client();
    for (const [m, path] of [['GET', `/api/workspaces/${ws}/bootstrap`], ['GET', `/api/projects/${p.id}`], ['PATCH', `/api/projects/${p.id}`], ['POST', `/api/projects/${p.id}/muse`], ['POST', `/api/projects/${p.id}/publish`], ['GET', `/api/projects/${p.id}/versions`], ['POST', `/api/workspaces/${ws}/assets`], ['GET', `/api/workspaces/${ws}/members`]] as const) {
      expect((await anon.call(m, path, m === 'GET' ? undefined : {})).status, `${m} ${path}`).toBe(401);
    }
  });

  it('blocks state-changing requests from other origins (CSRF)', async () => {
    const { c, ws } = await newUser();
    const evil = new Client('https://evil.example');
    evil.cookies = c.cookies;
    expect((await evil.post(`/api/workspaces/${ws}/projects`, { name: 'x', outputs: ['site'], direction: DIRECTION })).status).toBe(403);
    const none = new Client(null);
    none.cookies = c.cookies;
    expect((await none.post(`/api/workspaces/${ws}/projects`, { name: 'x', outputs: ['site'], direction: DIRECTION })).status).toBe(403);
  });

  it('keeps workspaces isolated: another user cannot read, change, or probe anything', async () => {
    const a = await newUser('Owner A');
    const b = await newUser('Intruder B');
    const p = await newProject(a.c, a.ws);
    const up = await a.c.call('POST', `/api/workspaces/${a.ws}/assets`, PNG, assetHeader({ name: 'logo.png', mime: 'image/png', size: PNG.length }));
    const assetId = up.data.asset.id;
    await a.c.post(`/api/projects/${p.id}/muse`, { prompt: 'make the headline bigger', context: [] });
    const proposal = (await a.c.get(`/api/projects/${p.id}/muse`)).data.proposals[0];
    const attempts: [string, string, unknown?][] = [
      ['GET', `/api/workspaces/${a.ws}/bootstrap`], ['GET', `/api/workspaces/${a.ws}/members`], ['GET', `/api/workspaces/${a.ws}/usage`],
      ['POST', `/api/workspaces/${a.ws}/projects`, { name: 'x', outputs: ['site'], direction: DIRECTION }],
      ['POST', `/api/workspaces/${a.ws}/invitations`, { email: b.email, role: 'admin' }],
      ['GET', `/api/projects/${p.id}`], ['PATCH', `/api/projects/${p.id}`, { baseRevision: 1, name: 'stolen' }], ['DELETE', `/api/projects/${p.id}`],
      ['POST', `/api/projects/${p.id}/duplicate`], ['GET', `/api/projects/${p.id}/versions`], ['GET', `/api/projects/${p.id}/muse`],
      ['POST', `/api/projects/${p.id}/muse`, { prompt: 'hello', context: [] }], ['POST', `/api/proposals/${proposal.id}/accept`],
      ['POST', `/api/projects/${p.id}/comments`, { text: 'hi', target: 'headline' }], ['POST', `/api/projects/${p.id}/publish`, {}],
      ['GET', `/api/projects/${p.id}/preview`], ['GET', `/api/assets/${assetId}/file`], ['DELETE', `/api/assets/${assetId}`],
      ['PATCH', `/api/workspaces/${a.ws}/members/${a.userId}`, { role: 'viewer' }],
    ];
    for (const [m, path, body] of attempts) {
      const r = await b.c.call(m, path, body);
      // 404, not 403: outsiders cannot even confirm that the resource exists
      expect(r.status, `${m} ${path}`).toBe(404);
    }
    expect((await a.c.get(`/api/projects/${p.id}`)).data.project.name).toBe('Halden Coffee');
    // an asset cannot be linked to a project in another workspace
    const pb = await newProject(b.c, b.ws, 'B project');
    expect((await a.c.patch(`/api/assets/${assetId}`, { linkProjectId: pb.id })).status).toBe(404);
  });

  it('rejects malformed ids and invalid bodies without leaking internals', async () => {
    const { c, ws } = await newUser();
    expect((await c.get(`/api/projects/not-a-uuid`)).status).toBe(404);
    expect((await c.get(`/api/projects/1' or '1'='1`)).status).toBe(404);
    const bad = await c.post(`/api/workspaces/${ws}/projects`, { name: '', outputs: ['nope'], direction: {} });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.data)).not.toMatch(/stack|node_modules|select |postgres/i);
    const p = await newProject(c, ws);
    // script injection in design fields is refused by validation
    const xss = await c.patch(`/api/projects/${p.id}`, { baseRevision: p.revision, doc: { ...p.doc, headline: '<script>alert(1)</script>' } });
    expect(xss.status).toBe(400);
    const sqli = await c.patch(`/api/projects/${p.id}`, { baseRevision: p.revision, name: `Robert'); drop table projects;--` });
    expect(sqli.status).toBe(200);
    expect((await q(`select count(*)::int as n from projects`))[0].n).toBeGreaterThan(0);
  });

  it('does not expose secrets or the dev outbox to the wrong callers', async () => {
    const health = await new Client().get('/api/health');
    expect(JSON.stringify(health.data)).not.toMatch(/secret|password|postgres:\/\/|token/i);
    const me = await new Client().get('/api/me');
    expect(JSON.stringify(me.data)).not.toMatch(/secret|postgres:\/\//i);
  });
});

describe('workspace roles', () => {
  it('enforces viewer, editor, admin and owner permissions on the server', async () => {
    const owner = await newUser('Owner');
    const p = await newProject(owner.c, owner.ws);
    const viewer = await addMember(owner.c, owner.ws, 'viewer');
    const editor = await addMember(owner.c, owner.ws, 'editor');
    const admin = await addMember(owner.c, owner.ws, 'admin');

    // viewer: read and comment only
    expect((await viewer.c.get(`/api/projects/${p.id}`)).status).toBe(200);
    expect((await viewer.c.post(`/api/projects/${p.id}/comments`, { text: 'Looks good', target: 'headline' })).status).toBe(201);
    expect((await viewer.c.patch(`/api/projects/${p.id}`, { baseRevision: p.revision, name: 'nope' })).status).toBe(403);
    expect((await viewer.c.post(`/api/projects/${p.id}/muse`, { prompt: 'bigger', context: [] })).status).toBe(403);
    expect((await viewer.c.post(`/api/workspaces/${owner.ws}/projects`, { name: 'x', outputs: ['site'], direction: DIRECTION })).status).toBe(403);
    expect((await viewer.c.call('POST', `/api/workspaces/${owner.ws}/assets`, PNG, assetHeader({ name: 'a.png', mime: 'image/png', size: PNG.length }))).status).toBe(403);

    // editor: edit and use Muse, but not publish, delete others' work, or manage people
    expect((await editor.c.patch(`/api/projects/${p.id}`, { baseRevision: p.revision, name: 'Renamed by editor' })).status).toBe(200);
    expect((await editor.c.post(`/api/projects/${p.id}/publish`, {})).status).toBe(403);
    expect((await editor.c.del(`/api/projects/${p.id}`)).status).toBe(403);
    expect((await editor.c.post(`/api/workspaces/${owner.ws}/invitations`, { email: 'x@example.test', role: 'viewer' })).status).toBe(403);
    expect((await editor.c.patch(`/api/workspaces/${owner.ws}/members/${viewer.userId}`, { role: 'admin' })).status).toBe(403);

    // admin: publish and manage editors/viewers, but cannot touch owner/admin roles (no escalation)
    expect((await admin.c.patch(`/api/workspaces/${owner.ws}/members/${viewer.userId}`, { role: 'editor' })).status).toBe(200);
    expect((await admin.c.patch(`/api/workspaces/${owner.ws}/members/${admin.userId}`, { role: 'owner' })).status).toBe(403);
    expect((await admin.c.patch(`/api/workspaces/${owner.ws}/members/${editor.userId}`, { role: 'admin' })).status).toBe(403);
    expect((await admin.c.patch(`/api/workspaces/${owner.ws}/members/${owner.userId}`, { role: 'viewer' })).status).toBe(403);
    expect((await admin.c.post(`/api/workspaces/${owner.ws}/invitations`, { email: 'y@example.test', role: 'admin' })).status).toBe(403);
    expect((await admin.c.del(`/api/workspaces/${owner.ws}/members/${owner.userId}`)).status).toBe(403);

    // owner can promote; a removed member loses access immediately
    expect((await owner.c.patch(`/api/workspaces/${owner.ws}/members/${editor.userId}`, { role: 'admin' })).status).toBe(200);
    expect((await owner.c.del(`/api/workspaces/${owner.ws}/members/${viewer.userId}`)).status).toBe(200);
    expect((await viewer.c.get(`/api/projects/${p.id}`)).status).toBe(404);
  });

  it('only lets the invited, verified address accept an invitation, once', async () => {
    const owner = await newUser();
    const invited = await newUser();
    const other = await newUser();
    const inv = await owner.c.post(`/api/workspaces/${owner.ws}/invitations`, { email: invited.email, role: 'editor' });
    const token = new URL(inv.data.link).hash.split('token=')[1];
    expect((await other.c.post('/api/invitations/accept', { token })).status).toBe(403);
    expect((await invited.c.post('/api/invitations/accept', { token })).status).toBe(200);
    expect((await invited.c.post('/api/invitations/accept', { token })).status).toBe(400);
    expect((await invited.c.get('/api/me')).data.workspaces).toHaveLength(2);
  });

  it('lets a person create and switch between workspaces', async () => {
    const { c } = await newUser();
    const made = await c.post('/api/workspaces', { name: 'Second Studio' });
    expect(made.status).toBe(201);
    expect((await c.patch('/api/me/preferences', { lastWorkspaceId: made.data.workspace.id })).status).toBe(200);
    const me = await c.get('/api/me');
    expect(me.data.workspaces).toHaveLength(2);
    expect(me.data.lastWorkspaceId).toBe(made.data.workspace.id);
  });
});

describe('projects and versions', () => {
  it('creates, reads, updates, duplicates and deletes a project with real persistence', async () => {
    const { c, ws } = await newUser();
    const p = await newProject(c, ws);
    expect(p.doc.headline).toBe(DIRECTION.headline);
    const boot = await c.get(`/api/workspaces/${ws}/bootstrap`);
    expect(boot.data.projects.map((x: any) => x.id)).toContain(p.id);
    expect(boot.data.activity[0].kind).toBe('create');

    const saved = await c.patch(`/api/projects/${p.id}`, { baseRevision: p.revision, stage: 'lattice', health: 'In review', doc: { ...p.doc, headlineSize: 72 } });
    expect(saved.status).toBe(200);
    const again = (await c.get(`/api/projects/${p.id}`)).data.project;
    expect(again.stage).toBe('lattice');
    expect(again.health).toBe('In review');
    expect(again.doc.headlineSize).toBe(72);

    const copy = await c.post(`/api/projects/${p.id}/duplicate`);
    expect(copy.status).toBe(201);
    expect(copy.data.project.name).toBe('Halden Coffee copy');
    expect(copy.data.project.slug).not.toBe(again.slug);

    expect((await c.del(`/api/projects/${p.id}`)).status).toBe(200);
    expect((await c.get(`/api/projects/${p.id}`)).status).toBe(404);
    expect((await c.get(`/api/workspaces/${ws}/bootstrap`)).data.projects.map((x: any) => x.id)).toEqual([copy.data.project.id]);
  });

  it('refuses a save based on a stale revision instead of overwriting', async () => {
    const owner = await newUser();
    const p = await newProject(owner.c, owner.ws);
    const editor = await addMember(owner.c, owner.ws, 'editor');
    expect((await owner.c.patch(`/api/projects/${p.id}`, { baseRevision: p.revision, doc: { ...p.doc, cta: 'Owner edit' } })).status).toBe(200);
    const stale = await editor.c.patch(`/api/projects/${p.id}`, { baseRevision: p.revision, doc: { ...p.doc, cta: 'Editor edit' } });
    expect(stale.status).toBe(409);
    expect((await owner.c.get(`/api/projects/${p.id}`)).data.project.doc.cta).toBe('Owner edit');
  });

  it('keeps history and restores an earlier version as a new version, never destructively', async () => {
    const { c, ws } = await newUser();
    let p = await newProject(c, ws);
    await c.patch(`/api/projects/${p.id}`, { baseRevision: p.revision, doc: { ...p.doc, headline: 'Second headline' } });
    await q(`update project_versions set updated_at = now() - interval '1 hour' where project_id = $1`, [p.id]); // edits an hour apart are separate versions
    p = (await c.get(`/api/projects/${p.id}`)).data.project;
    await c.patch(`/api/projects/${p.id}`, { baseRevision: p.revision, name: 'Renamed later', doc: { ...p.doc, headline: 'Third headline' } });
    const versions = (await c.get(`/api/projects/${p.id}/versions`)).data.versions;
    expect(versions.map((v: any) => v.kind)).toEqual(['edit', 'edit', 'create']);
    const first = versions[versions.length - 1];

    p = (await c.get(`/api/projects/${p.id}`)).data.project;
    // stale restore is refused
    expect((await c.post(`/api/projects/${p.id}/versions/${first.id}/restore`, { baseRevision: p.revision - 1 })).status).toBe(409);
    const restored = await c.post(`/api/projects/${p.id}/versions/${first.id}/restore`, { baseRevision: p.revision });
    expect(restored.status).toBe(200);
    expect(restored.data.project.doc.headline).toBe(DIRECTION.headline);
    // unrelated changes survive: the rename made after version 1 is kept
    expect(restored.data.project.name).toBe('Renamed later');
    const after = (await c.get(`/api/projects/${p.id}/versions`)).data.versions;
    expect(after[0].kind).toBe('restore');
    expect(after[0].restoredNumber).toBe(1);
    expect(after).toHaveLength(4);
    // and the state before the restore is still there to go back to
    const third = await c.get(`/api/projects/${p.id}/versions/${after[1].id}`);
    expect(third.data.version.snapshot.doc.headline).toBe('Third headline');
  });

  it('coalesces a burst of small edits into one version', async () => {
    const { c, ws } = await newUser();
    let p = await newProject(c, ws);
    for (const size of [48, 72, 96]) {
      const r = await c.patch(`/api/projects/${p.id}`, { baseRevision: p.revision, doc: { ...p.doc, headlineSize: size } });
      p = { ...p, revision: r.data.revision };
    }
    expect((await c.get(`/api/projects/${p.id}/versions`)).data.versions).toHaveLength(2);
  });
});

describe('Muse', () => {
  const fake = (json: unknown | (() => unknown)): ModelProvider => ({ name: 'fake', model: 'fake-1', priceIn: 1e-6, priceOut: 2e-6, complete: async () => ({ json: typeof json === 'function' ? (json as () => unknown)() : json, inputTokens: 1000, outputTokens: 200 }) });
  afterAll(() => setProviderForTests(undefined));

  it('labels the development fallback and never presents it as a model', async () => {
    setProviderForTests(null);
    const { c, ws } = await newUser();
    const p = await newProject(c, ws);
    const r = await c.post(`/api/projects/${p.id}/muse`, { prompt: 'make the headline bigger', context: [] });
    expect(r.status).toBe(200);
    expect(r.data.source).toBe('fallback');
    expect(r.data.message.source).toBe('fallback');
    const d = await new Client().post('/api/muse/directions', { idea: 'A booking site for island ferries' });
    expect(d.data.source).toBe('fallback');
    expect(d.data.directions).toHaveLength(3);
  });

  it('proposes without changing the project; only acceptance applies and versions the change', async () => {
    setProviderForTests(fake({ reply: 'Two changes for more presence.', proposals: [
      { title: 'Headline size', rationale: 'One clear focal point.', scope: 'doc', track: null, key: 'headlineSize', value: 72 },
      { title: 'Headline settle', rationale: 'Lands before the subheading.', scope: 'motion', track: 'headline', key: 'duration', value: 0.9 },
    ] }));
    const { c, ws } = await newUser();
    const p = await newProject(c, ws);
    const r = await c.post(`/api/projects/${p.id}/muse`, { prompt: 'More presence in the hero', context: ['Hero frame'] });
    expect(r.status).toBe(200);
    expect(r.data.source).toBe('ai');
    expect(r.data.proposals).toHaveLength(2);
    // from/to come from the real project, not the model
    expect(r.data.proposals[0]).toMatchObject({ from: '60px', to: '72px', status: 'pending' });

    // nothing applied yet
    let now = (await c.get(`/api/projects/${p.id}`)).data.project;
    expect(now.doc.headlineSize).toBe(60);
    expect(now.revision).toBe(p.revision);

    const acc = await c.post(`/api/proposals/${r.data.proposals[0].id}/accept`);
    expect(acc.status).toBe(200);
    expect(acc.data.project.doc.headlineSize).toBe(72);
    const rej = await c.post(`/api/proposals/${r.data.proposals[1].id}/reject`);
    expect(rej.status).toBe(200);
    now = (await c.get(`/api/projects/${p.id}`)).data.project;
    expect(now.doc.headlineSize).toBe(72);
    expect(now.motion.find((t: any) => t.id === 'headline').duration).toBe(1.4);

    const versions = (await c.get(`/api/projects/${p.id}/versions`)).data.versions;
    expect(versions[0].kind).toBe('muse');
    expect(versions[0].label).toContain('Headline size');
    // deciding twice is refused
    expect((await c.post(`/api/proposals/${r.data.proposals[0].id}/accept`)).status).toBe(409);
    // conversation and usage are persisted
    const history = await c.get(`/api/projects/${p.id}/muse`);
    expect(history.data.messages.map((m: any) => m.role)).toEqual(['user', 'muse']);
    const usage = await q(`select status, input_tokens, cost_usd::float as cost from ai_usage where workspace_id = $1`, [ws]);
    expect(usage[0]).toMatchObject({ status: 'ok', input_tokens: 1000 });
    expect(usage[0].cost).toBeGreaterThan(0);
  });

  it('discards model output that fails validation (bad fields, out-of-range values, markup)', async () => {
    setProviderForTests(fake({ reply: 'Here you go', proposals: [
      { title: 'Lock it', rationale: 'x', scope: 'doc', track: null, key: 'locked', value: 'yes' },
      { title: 'Huge', rationale: 'x', scope: 'doc', track: null, key: 'headlineSize', value: 400 },
      { title: 'Inject', rationale: 'x', scope: 'doc', track: null, key: 'headline', value: '<img src=x onerror=alert(1)>' },
      { title: 'Rename project', rationale: 'x', scope: 'project', track: null, key: 'name', value: 'pwned' },
    ] }));
    const { c, ws } = await newUser();
    const p = await newProject(c, ws);
    const r = await c.post(`/api/projects/${p.id}/muse`, { prompt: 'do something', context: [] });
    expect(r.status).toBe(502);
    expect(r.data.error.code).toBe('muse_invalid');
    expect((await c.get(`/api/projects/${p.id}/muse`)).data.proposals).toHaveLength(0);
    expect((await q(`select status, attempts from ai_usage where workspace_id = $1`, [ws]))[0]).toMatchObject({ status: 'invalid_output', attempts: 2 });
  });

  it('retries once after an invalid answer and keeps only the valid proposals', async () => {
    let call = 0;
    setProviderForTests(fake(() => (++call === 1 ? { nonsense: true } : { reply: 'Warmer accent.', proposals: [
      { title: 'Accent', rationale: 'Warmer.', scope: 'doc', track: null, key: 'accent', value: '#e8b83e' },
      { title: 'Bad easing', rationale: 'x', scope: 'motion', track: 'headline', key: 'easing', value: 'bounce' },
    ] })));
    const { c, ws } = await newUser();
    const p = await newProject(c, ws);
    const r = await c.post(`/api/projects/${p.id}/muse`, { prompt: 'warmer', context: [] });
    expect(r.status).toBe(200);
    expect(r.data.proposals.map((x: any) => x.title)).toEqual(['Accent']);
    expect(call).toBe(2);
  });

  it('reports provider failures and timeouts as failures, without inventing a reply', async () => {
    setProviderForTests({ name: 'fake', model: 'down', priceIn: 0, priceOut: 0, complete: async () => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }); } });
    const { c, ws } = await newUser();
    const p = await newProject(c, ws);
    const r = await c.post(`/api/projects/${p.id}/muse`, { prompt: 'bigger', context: [] });
    expect(r.status).toBe(504);
    expect((await c.get(`/api/projects/${p.id}/muse`)).data.messages.filter((m: any) => m.role === 'muse')).toHaveLength(0);
  });

  it('stops when the daily budget is spent and rate limits anonymous idea exploration', async () => {
    setProviderForTests(fake({ reply: 'ok', proposals: [] }));
    const { c, ws, userId } = await newUser();
    const p = await newProject(c, ws);
    await q(`insert into ai_usage (workspace_id, user_id, feature, provider, model, cost_usd, status) values ($1,$2,'proposals','fake','fake-1', 0.6, 'ok')`, [ws, userId]);
    const r = await c.post(`/api/projects/${p.id}/muse`, { prompt: 'bigger', context: [] });
    expect(r.status).toBe(429);
    expect(r.data.error.code).toBe('muse_budget');
    await q(`delete from ai_usage where workspace_id = $1`, [ws]);

    setProviderForTests(null);
    const anon = new Client();
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await anon.call('POST', '/api/muse/directions', { idea: 'A site for a ceramics studio' }, { 'x-forwarded-for': '203.0.113.9' })).status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(6);
    expect(statuses.slice(6)).toEqual([429, 429]);
  });

  it('returns three validated creative directions from the model', async () => {
    const dir = (name: string, visual: string) => ({ name, summary: 'A calm direction.', rationale: 'Because it fits.', accent: '#8b70ec', swatches: ['#000000', '#181818', '#8b70ec', '#f2f2f3'], type: 'Geist Light', layout: 'One column.', motion: 'Slow settle.', interaction: 'Drag to rotate.', headline: 'Ferries\nmade simple', subhead: 'Book four island routes in under a minute.', visual });
    setProviderForTests(fake({ interpretation: { concept: 'Ferry booking', audience: 'Islanders', brand: 'Northfold', features: ['Timetables'] }, directions: [dir('Quiet tide', 'drop'), dir('Signal', 'lattice'), dir('Crossing', 'orbit')] }));
    const { c } = await newUser();
    const r = await c.post('/api/muse/directions', { idea: 'Timetables and booking for island ferries' });
    expect(r.status).toBe(200);
    expect(r.data.source).toBe('ai');
    expect(r.data.directions.map((d: any) => d.visual)).toEqual(['drop', 'lattice', 'orbit']);
    expect(r.data.interpretation.concept).toBe('Ferry booking');
  });
});

describe('assets', () => {
  it('uploads, lists, serves privately, links and deletes a real file', async () => {
    const { c, ws } = await newUser();
    const p = await newProject(c, ws);
    const up = await c.call('POST', `/api/workspaces/${ws}/assets`, PNG, assetHeader({ name: 'logo.png', mime: 'image/png', size: PNG.length, tags: ['brand'], projectId: p.id }));
    expect(up.status).toBe(201);
    const a = up.data.asset;
    expect(a).toMatchObject({ kind: 'image', mime: 'image/png', uses: 1 });
    expect((await c.get(`/api/workspaces/${ws}/bootstrap`)).data.assets.map((x: any) => x.id)).toContain(a.id);

    const file = await c.raw('GET', a.url);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/png');
    expect(file.headers.get('x-content-type-options')).toBe('nosniff');
    expect(file.headers.get('cache-control')).toContain('private');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PNG);
    // not public: no session, no file
    expect((await new Client().raw('GET', a.url)).status).toBe(401);

    expect((await c.patch(`/api/assets/${a.id}`, { unlinkProjectId: p.id })).data.asset.uses).toBe(0);
    expect((await c.del(`/api/assets/${a.id}`)).status).toBe(200);
    expect((await c.raw('GET', a.url)).status).toBe(404);
  });

  it('rejects unsupported types, disguised files and oversized uploads', async () => {
    const { c, ws } = await newUser();
    const post = (name: string, mime: string, data: Uint8Array) => c.call('POST', `/api/workspaces/${ws}/assets`, data, assetHeader({ name, mime, size: data.length }));
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    expect((await post('page.html', 'text/html', html)).status).toBe(400);
    expect((await post('vector.svg', 'image/svg+xml', html)).status).toBe(400);
    expect((await post('run.exe', 'application/octet-stream', html)).status).toBe(400);
    // an HTML file renamed to .png is caught by its contents
    expect((await post('fake.png', 'image/png', html)).status).toBe(400);
    // extension and declared type must agree
    expect((await post('photo.png', 'image/jpeg', PNG)).status).toBe(400);
    expect((await post('../../etc/passwd.png', 'image/png', PNG)).status).toBe(400);
    const big = new Uint8Array(16 * 1024 * 1024);
    big.set(PNG);
    expect((await post('huge.png', 'image/png', big)).status).toBe(413);
  });
});

describe('publishing', () => {
  it('runs real checks, publishes an immutable build, serves it publicly, rolls back and unpublishes', async () => {
    const { c, ws } = await newUser();
    let p = await newProject(c, ws);
    const checks = await c.get(`/api/projects/${p.id}/checks`);
    expect(checks.data.checks.find((x: any) => x.id === 'motion').status).toBe('warn'); // 1.4 s headline
    expect(checks.data.adapter).toEqual({ name: 'builtin', missing: [] });

    const first = await c.post(`/api/projects/${p.id}/publish`, {});
    expect(first.status).toBe(201);
    expect(first.data.publish.status).toBe('live');
    expect(first.data.publish.log.map((l: any) => l.step)).toEqual(['Snapshot saved', 'Build generated', 'Build validated', 'Deployed', 'Verified live']);
    const path = new URL(first.data.publish.url).pathname;
    const page = await new Client().raw('GET', path);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('A calm place');
    expect(html).not.toMatch(/<script/i);
    expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");

    p = (await c.get(`/api/projects/${p.id}`)).data.project;
    expect(p.stage).toBe('universe');
    expect(p.published.version).toBe(1);

    // edit after publishing: the live page does not change until the next publish
    await c.patch(`/api/projects/${p.id}`, { baseRevision: p.revision, doc: { ...p.doc, headline: 'Version two' } });
    expect(await (await new Client().raw('GET', path)).text()).toContain('A calm place');
    const second = await c.post(`/api/projects/${p.id}/publish`, {});
    expect(second.data.publish.number).toBe(2);
    expect(await (await new Client().raw('GET', path)).text()).toContain('Version two');

    const rolled = await c.post(`/api/projects/${p.id}/rollback`, { publishId: first.data.publish.id });
    expect(rolled.status).toBe(200);
    expect(await (await new Client().raw('GET', path)).text()).toContain('A calm place');
    // rollback changes what is live, not the working project
    expect((await c.get(`/api/projects/${p.id}`)).data.project.doc.headline).toBe('Version two');
    const history = (await c.get(`/api/projects/${p.id}/publishes`)).data.publishes;
    expect(history.map((h: any) => h.status)).toEqual(['superseded', 'live']);

    expect((await c.post(`/api/projects/${p.id}/unpublish`)).status).toBe(200);
    expect((await new Client().raw('GET', path)).status).toBe(404);
    expect((await c.post(`/api/projects/${p.id}/unpublish`)).status).toBe(409);
  });

  it('blocks publishing when a check fails and escapes all content in the build', async () => {
    const { c, ws } = await newUser();
    const p = await newProject(c, ws);
    await c.patch(`/api/projects/${p.id}`, { baseRevision: p.revision, doc: { ...p.doc, subheadTone: '#1a1a1a', headline: 'Tom & "Jerry" \' ok' } });
    const blocked = await c.post(`/api/projects/${p.id}/publish`, {});
    expect(blocked.status).toBe(422);
    expect(blocked.data.error.code).toBe('checks_failed');
    expect((await c.get(`/api/projects/${p.id}/publishes`)).data.publishes).toHaveLength(0);
    const preview = await (await c.raw('GET', `/api/projects/${p.id}/preview`)).text();
    expect(preview).toContain('Tom &amp; &quot;Jerry&quot; &#39; ok');
  });

  it('refuses an address that belongs to another project', async () => {
    const a = await newUser();
    const b = await newUser();
    const pa = await newProject(a.c, a.ws);
    const pb = await newProject(b.c, b.ws);
    expect((await a.c.post(`/api/projects/${pa.id}/publish`, { slug: 'shared-name-test' })).status).toBe(201);
    expect((await b.c.post(`/api/projects/${pb.id}/publish`, { slug: 'shared-name-test' })).status).toBe(409);
    expect((await b.c.post(`/api/projects/${pb.id}/publish`, { slug: 'Bad Slug!' })).status).toBe(400);
  });
});

beforeAll(() => setProviderForTests(null));

describe('operations', () => {
  it('reports the Muse provider state on non-production environments only', async () => {
    const r = await new Client().get('/api/muse/selftest');
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ ok: false, provider: 'fallback', real: false });
    const before = process.env.AETHER_ENV;
    process.env.AETHER_ENV = 'production';
    try { expect((await new Client().get('/api/muse/selftest')).status).toBe(404); expect((await new Client().get('/api/dev/outbox?email=a@b.co')).status).toBe(404); }
    finally { process.env.AETHER_ENV = before; }
  });

  it('never returns password-reset links from the staging outbox', async () => {
    const u = await newUser();
    await new Client().post('/api/auth/request-password-reset', { email: u.email, redirectTo: '/#reset-password' });
    const before = process.env.AETHER_ENV;
    process.env.AETHER_ENV = 'preview';
    process.env.DEV_OUTBOX = 'true';
    try {
      const r = await new Client().get(`/api/dev/outbox?email=${encodeURIComponent(u.email)}`);
      expect(r.status).toBe(200);
      expect(r.data.message?.kind ?? 'verify').toBe('verify');
      expect(JSON.stringify(r.data)).not.toContain('reset-password');
    } finally { process.env.AETHER_ENV = before; delete process.env.DEV_OUTBOX; }
  });
});
