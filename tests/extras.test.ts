import { afterAll, describe, expect, it } from 'vitest';
import { closePool, one, q } from '../server/db.js';
import { capabilities, env } from '../server/env.js';
import { runCleanup } from '../server/routes/extras.js';
import { Client, PASSWORD, PNG, addMember, assetHeader, newProject, newUser } from './helpers.js';

afterAll(async () => { await closePool(); });

describe('presence and live refresh', () => {
  it('shows teammates who have the project open, and only to members', async () => {
    const { c, ws } = await newUser('Ines Duarte');
    const p = await newProject(c, ws);
    const ed = await addMember(c, ws, 'editor');
    const first = await c.post(`/api/projects/${p.id}/presence`, { focus: 'design' });
    expect(first.status).toBe(200);
    expect(first.data.here).toEqual([]);
    const second = await ed.c.post(`/api/projects/${p.id}/presence`, { focus: 'motion' });
    expect(second.data.here).toEqual([expect.objectContaining({ name: 'Ines Duarte', focus: 'design' })]);
    expect(typeof second.data.revision).toBe('number');
    // an outsider cannot see or join presence
    const outsider = await newUser();
    expect((await outsider.c.post(`/api/projects/${p.id}/presence`, {})).status).toBe(404);
    // leaving removes you at once
    await ed.c.post(`/api/projects/${p.id}/presence`, { leaving: true });
    expect((await c.post(`/api/projects/${p.id}/presence`, {})).data.here).toEqual([]);
  });

  it('reports a newer revision and who made it after a teammate saves', async () => {
    const { c, ws } = await newUser('Owner Person');
    const p = await newProject(c, ws);
    const ed = await addMember(c, ws, 'editor');
    const before = (await c.post(`/api/projects/${p.id}/presence`, {})).data.revision;
    const saved = await ed.c.patch(`/api/projects/${p.id}`, { baseRevision: before, doc: { ...p.doc, headline: 'A teammate\nwas here' } });
    expect(saved.status).toBe(200);
    const beat = (await c.post(`/api/projects/${p.id}/presence`, {})).data;
    expect(beat.revision).toBeGreaterThan(before);
    expect(beat.lastEditor.name).toBe('editor person');
  });
});

describe('brand kit', () => {
  it('lets editors save a validated brand that viewers can read', async () => {
    const { c, ws } = await newUser();
    const viewer = await addMember(c, ws, 'viewer');
    const empty = await c.get(`/api/workspaces/${ws}/brand`);
    expect(empty.data).toMatchObject({ canEdit: true, brand: { name: '', accent: '#8b70ec', palette: [] } });
    const brand = { name: 'Halden', accent: '#c08457', palette: ['#e8c7a0', '#3a2a20'], typeface: 'Geist', voice: 'Warm and plain.' };
    expect((await c.patch(`/api/workspaces/${ws}/brand`, brand)).status).toBe(200);
    expect((await viewer.c.get(`/api/workspaces/${ws}/brand`)).data).toMatchObject({ canEdit: false, brand });
    expect((await viewer.c.patch(`/api/workspaces/${ws}/brand`, brand)).status).toBe(403);
    expect((await c.patch(`/api/workspaces/${ws}/brand`, { ...brand, accent: 'red' })).status).toBe(400);
    expect((await c.patch(`/api/workspaces/${ws}/brand`, { ...brand, palette: Array(7).fill('#000000') })).status).toBe(400);
    expect((await new Client().get(`/api/workspaces/${ws}/brand`)).status).toBe(401);
    expect((await (await newUser()).c.get(`/api/workspaces/${ws}/brand`)).status).toBe(404);
  });
});

describe('project export', () => {
  it('downloads the project, its history and comments as JSON for members only', async () => {
    const { c, ws } = await newUser('Exporter');
    const p = await newProject(c, ws, 'Export me');
    await c.post(`/api/projects/${p.id}/comments`, { text: 'Looks good', target: 'headline' });
    const res = await c.raw('GET', `/api/projects/${p.id}/export`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename=".+\.aether\.json"/);
    const doc = await res.json();
    expect(doc).toMatchObject({ format: 'aether.project', formatVersion: 1, project: { name: 'Export me' } });
    expect(doc.versions.length).toBeGreaterThan(0);
    expect(doc.comments[0]).toMatchObject({ by: 'Exporter', text: 'Looks good' });
    expect((await (await newUser()).c.raw('GET', `/api/projects/${p.id}/export`)).status).toBe(404);
  });
});

describe('account deletion', () => {
  it('needs the email typed, removes solo workspaces, and keeps shared work as a former member', async () => {
    const owner = await newUser('Team Owner');
    const p = await newProject(owner.c, owner.ws, 'Shared work');
    const leaver = await addMember(owner.c, owner.ws, 'editor');
    await leaver.c.post(`/api/projects/${p.id}/comments`, { text: 'Bye for now', target: 'headline' });
    const solo = await newProject(leaver.c, leaver.ws, 'Only mine');
    await leaver.c.call('POST', `/api/workspaces/${leaver.ws}/assets`, PNG, assetHeader({ name: 'mine.png', mime: 'image/png', size: PNG.length }));

    expect((await leaver.c.post('/api/me/delete', { confirmEmail: 'wrong@example.test' })).status).toBe(400);
    const done = await leaver.c.post('/api/me/delete', { confirmEmail: leaver.email.toUpperCase() });
    expect(done.status).toBe(200);
    expect((await leaver.c.get('/api/me')).data.user).toBeNull();
    expect((await new Client().post('/api/auth/sign-in/email', { email: leaver.email, password: PASSWORD })).status).toBe(401);
    // their own workspace and its contents are gone
    expect(await one(`select 1 from workspaces where id = $1`, [leaver.ws])).toBeNull();
    expect(await one(`select 1 from projects where id = $1`, [solo.id])).toBeNull();
    expect(await q(`select 1 from assets where workspace_id = $1`, [leaver.ws])).toHaveLength(0);
    // shared work stays, credited to a former member
    const proj = await owner.c.get(`/api/projects/${p.id}`);
    expect(proj.status).toBe(200);
    expect(proj.data.project.comments.find((x: any) => x.text === 'Bye for now')?.authorId).toBe('former-member');
  });

  it('refuses while the person owns a workspace others use', async () => {
    const owner = await newUser();
    await addMember(owner.c, owner.ws, 'viewer');
    const r = await owner.c.post('/api/me/delete', { confirmEmail: owner.email });
    expect(r.status).toBe(409);
    expect(r.data.error.message).toMatch(/Make someone else the owner/);
    expect((await owner.c.get('/api/me')).data.user).not.toBeNull();
  });
});

describe('daily cleanup', () => {
  it('only runs with the cron secret', async () => {
    const before = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-cron-secret-value';
    try {
      expect((await new Client().get('/api/cron/cleanup')).status).toBe(401);
      expect((await new Client().call('GET', '/api/cron/cleanup', undefined, { authorization: 'Bearer nope' })).status).toBe(401);
      const r = await new Client().call('GET', '/api/cron/cleanup', undefined, { authorization: 'Bearer test-cron-secret-value' });
      expect(r.status).toBe(200);
      expect(r.data.removed).toHaveProperty('sessions');
    } finally { if (before === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = before; }
  });

  it('removes long-deleted projects and stale rows but keeps live work', async () => {
    const { c, ws } = await newUser();
    const live = await newProject(c, ws, 'Keep me');
    const old = await newProject(c, ws, 'Deleted long ago');
    await q(`update projects set deleted_at = now() - interval '31 days' where id = $1`, [old.id]);
    await q(`insert into project_presence (project_id, user_id, seen_at) select $1, created_by, now() - interval '2 days' from projects where id = $1`, [live.id]);
    const counts = await runCleanup();
    expect(counts.projects).toBeGreaterThanOrEqual(1);
    expect(await one(`select 1 from projects where id = $1`, [old.id])).toBeNull();
    expect(await one(`select 1 from projects where id = $1`, [live.id])).not.toBeNull();
    expect(await one(`select 1 from project_presence where project_id = $1`, [live.id])).toBeNull();
  });
});

describe('email policy', () => {
  it('does not ask for email confirmation in production when no email can be sent', () => {
    const saved = { stage: process.env.AETHER_ENV, key: process.env.RESEND_API_KEY, flag: process.env.AUTH_REQUIRE_EMAIL_VERIFICATION };
    try {
      process.env.AETHER_ENV = 'production';
      delete process.env.RESEND_API_KEY;
      delete process.env.AUTH_REQUIRE_EMAIL_VERIFICATION;
      expect(env.requireEmailVerification).toBe(false);
      expect(capabilities().email).toEqual({ delivery: 'none', verificationRequired: false });
      process.env.RESEND_API_KEY = 're_test_value';
      expect(env.requireEmailVerification).toBe(true);
      process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'false';
      expect(env.requireEmailVerification).toBe(false);
    } finally {
      for (const [k, v] of [['AETHER_ENV', saved.stage], ['RESEND_API_KEY', saved.key], ['AUTH_REQUIRE_EMAIL_VERIFICATION', saved.flag]] as const) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  });
});
