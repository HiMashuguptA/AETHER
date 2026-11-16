import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { one, q } from '../db.js';
import { env } from '../env.js';
import { requireMember, requireUser } from '../lib/access.js';
import { ApiError, audit, badRequest, body, clientIp, forbidden, notFound, param, rateLimit } from '../lib/http.js';
import { getStorage, matchesSignature, readHead } from '../services/storage.js';
import { can, uploadRuleFor, type Role } from '../../shared/model.js';

export const assets = new Hono();

const human = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export const assetToClient = (a: any) => ({
  id: a.id, name: a.name, kind: a.kind, mime: a.mime,
  thumb: a.kind === 'image' ? `/api/assets/${a.id}/${a.meta?.thumb ? 'thumb' : 'file'}` : undefined,
  url: `/api/assets/${a.id}/file`,
  tags: a.tags, size: human(Number(a.size_bytes)), bytes: Number(a.size_bytes), width: a.width ?? undefined, height: a.height ?? undefined,
  updatedAt: new Date(a.updated_at).getTime(), byId: a.created_by, uses: (a.project_ids ?? []).length, projectIds: a.project_ids ?? [],
});

const MetaSchema = z.object({
  name: z.string().trim().min(1).max(160).refine((s) => !/[\\/<>\u0000-\u001f]/.test(s), 'That file name has characters that are not allowed'),
  mime: z.string().max(100).default(''),
  size: z.number().int().positive(),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(8).default([]),
  projectId: z.string().uuid().optional(),
  /** small preview the browser made from the image (data URL, webp or jpeg) */
  thumb: z.string().max(300_000).regex(/^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/=]+$/).optional(),
});

function rulesFor(name: string, mime: string, size: number) {
  const rule = uploadRuleFor(name, mime);
  if (!rule) throw badRequest('That file type is not supported. Use PNG, JPEG, WebP, AVIF, GIF, GLB, Lottie JSON or PDF.');
  if (size > rule.maxMb * 1_048_576) throw new ApiError(413, 'too_large', `That file is too large. ${rule.kind === '3d' ? '3D models' : 'Files of this type'} can be up to ${rule.maxMb} MB.`);
  return rule;
}

const keyFor = (ws: string, name: string) => `ws/${ws}/${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.${name.split('.').pop()!.toLowerCase()}`;

async function finish(c: any, ws: string, userId: string, meta: z.infer<typeof MetaSchema>, rule: { mime: string; kind: string }, key: string, size: number) {
  const storage = getStorage();
  if (meta.projectId && !(await one(`select 1 from projects where id = $1 and workspace_id = $2 and deleted_at is null`, [meta.projectId, ws]))) throw notFound('That project');
  let hasThumb = false;
  if (meta.thumb && rule.kind === 'image') {
    const bytes = Uint8Array.from(Buffer.from(meta.thumb.split(',')[1], 'base64'));
    const tm = meta.thumb.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
    if (matchesSignature(tm, bytes.slice(0, 16))) { await storage.put(`${key}.thumb`, bytes, tm); hasThumb = true; }
  }
  const row = await one<any>(
    `insert into assets (workspace_id, name, kind, mime, size_bytes, storage_provider, storage_key, width, height, tags, meta, status, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'ready',$12) returning *`,
    [ws, meta.name, rule.kind, rule.mime, size, storage.name, key, meta.width ?? null, meta.height ?? null, meta.tags, JSON.stringify(hasThumb ? { thumb: meta.thumb!.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg' } : {}), userId],
  );
  if (meta.projectId) await q(`insert into asset_projects (asset_id, project_id) values ($1,$2) on conflict do nothing`, [row.id, meta.projectId]);
  await audit({ workspaceId: ws, actorId: userId, action: 'asset.upload', targetType: 'asset', targetId: row.id, ip: clientIp(c), meta: { mime: rule.mime, size } });
  return c.json({ asset: assetToClient({ ...row, project_ids: meta.projectId ? [meta.projectId] : [] }) }, 201);
}

/** How this environment accepts uploads, so the browser picks the right path. */
assets.get('/workspaces/:ws/assets/upload-config', async (c) => {
  const ws = param(c, 'ws');
  await requireMember(c, ws, 'editor');
  return c.json({ mode: env.storageProvider === 'vercel-blob' ? 'blob' : env.storageProvider === 'local' ? 'direct' : 'none' });
});

/** Direct upload (development and tests): the file is the request body, metadata in the x-asset header. */
assets.post('/workspaces/:ws/assets', async (c) => {
  const ws = param(c, 'ws');
  const { user } = await requireMember(c, ws, 'editor');
  if (env.storageProvider !== 'local') throw badRequest('Direct uploads are not enabled in this environment.');
  await rateLimit(`upload:${user.id}`, 60, 600);
  let metaRaw: unknown;
  try { metaRaw = JSON.parse(decodeURIComponent(c.req.header('x-asset') ?? '')); } catch { throw badRequest('Missing upload details.'); }
  const parsed = MetaSchema.safeParse(metaRaw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid upload details.');
  const data = new Uint8Array(await c.req.arrayBuffer());
  const rule = rulesFor(parsed.data.name, parsed.data.mime, data.length);
  if (!matchesSignature(rule.mime, data.slice(0, 64))) throw badRequest('The contents of that file do not match its type, so it was not stored.');
  const key = keyFor(ws, parsed.data.name);
  await getStorage().put(key, data, rule.mime);
  return finish(c, ws, user.id, parsed.data, rule, key, data.length);
});

/** Blob uploads, step 1: a short-lived, single-path upload token limited to the validated type and size. */
assets.post('/workspaces/:ws/assets/blob-token', async (c) => {
  const ws = param(c, 'ws');
  const { user } = await requireMember(c, ws, 'editor');
  if (env.storageProvider !== 'vercel-blob') throw badRequest('Blob uploads are not enabled in this environment.');
  await rateLimit(`upload:${user.id}`, 60, 600);
  const raw = await c.req.json().catch(() => null);
  const { handleUpload } = await import('@vercel/blob/client');
  try {
    const json = await handleUpload({
      body: raw, request: c.req.raw, token: env.blobToken,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const meta = MetaSchema.pick({ name: true, mime: true, size: true }).parse(JSON.parse(clientPayload ?? '{}'));
        const rule = rulesFor(meta.name, meta.mime, meta.size);
        if (!pathname.startsWith(`ws/${ws}/`) || pathname.includes('..')) throw new Error('Invalid upload path');
        return { allowedContentTypes: [rule.mime, ...(rule.mime === 'model/gltf-binary' ? ['application/octet-stream'] : [])], maximumSizeInBytes: rule.maxMb * 1_048_576, addRandomSuffix: false, validUntil: Date.now() + 10 * 60_000 };
      },
    });
    return c.json(json);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw badRequest((err as Error).message || 'The upload could not be authorised.');
  }
});
assets.get('/workspaces/:ws/assets/blob-path', async (c) => {
  const ws = param(c, 'ws');
  await requireMember(c, ws, 'editor');
  const name = c.req.query('name') ?? '';
  if (!uploadRuleFor(name, '')) throw badRequest('That file type is not supported.');
  return c.json({ pathname: keyFor(ws, name) });
});

/** Blob uploads, step 2: the server checks what actually landed in storage before the asset exists. */
assets.post('/workspaces/:ws/assets/complete', async (c) => {
  const ws = param(c, 'ws');
  const { user } = await requireMember(c, ws, 'editor');
  const input = await body(c, MetaSchema.extend({ pathname: z.string().max(300) }));
  if (!input.pathname.startsWith(`ws/${ws}/`)) throw forbidden();
  const storage = getStorage();
  const head = await storage.head(input.pathname);
  if (!head) throw badRequest('The upload did not finish. Try again.');
  const rule = rulesFor(input.name, input.mime, head.size);
  const file = await storage.get(input.pathname);
  if (!file || !matchesSignature(rule.mime, await readHead(file))) {
    await storage.delete(input.pathname);
    throw badRequest('The contents of that file do not match its type, so it was removed.');
  }
  return finish(c, ws, user.id, input, rule, input.pathname, head.size);
});

async function assetFor(c: any, min: Role = 'viewer') {
  const user = await requireUser(c);
  const a = await one<any>(`select a.*, m.role from assets a left join workspace_members m on m.workspace_id = a.workspace_id and m.user_id = $2 where a.id = $1 and a.deleted_at is null`, [param(c, 'id'), user.id]);
  if (!a || !a.role) throw notFound('That asset');
  if (!can(a.role, min)) throw forbidden();
  return { user, asset: a };
}

async function serve(c: any, key: string, mime: string, name: string, inline: boolean) {
  const file = await getStorage().get(key);
  if (!file) throw notFound('That file');
  return new Response(file.stream, {
    headers: {
      'content-type': mime,
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cache-control': 'private, max-age=600',
      ...(file.size ? { 'content-length': String(file.size) } : {}),
    },
  });
}
assets.get('/assets/:id/file', async (c) => { const { asset } = await assetFor(c); return serve(c, asset.storage_key, asset.mime, asset.name, asset.kind === 'image'); });
assets.get('/assets/:id/thumb', async (c) => {
  const { asset } = await assetFor(c);
  return asset.meta?.thumb ? serve(c, `${asset.storage_key}.thumb`, asset.meta.thumb, asset.name, true) : serve(c, asset.storage_key, asset.mime, asset.name, asset.kind === 'image');
});

assets.patch('/assets/:id', async (c) => {
  const { asset } = await assetFor(c, 'editor');
  const input = await body(c, z.object({ name: MetaSchema.shape.name.optional(), tags: z.array(z.string().trim().min(1).max(24)).max(8).optional(), linkProjectId: z.string().uuid().optional(), unlinkProjectId: z.string().uuid().optional() }));
  if (input.name || input.tags) await q(`update assets set name = coalesce($2, name), tags = coalesce($3, tags), updated_at = now() where id = $1`, [asset.id, input.name ?? null, input.tags ?? null]);
  if (input.linkProjectId) {
    if (!(await one(`select 1 from projects where id = $1 and workspace_id = $2 and deleted_at is null`, [input.linkProjectId, asset.workspace_id]))) throw notFound('That project');
    await q(`insert into asset_projects (asset_id, project_id) values ($1,$2) on conflict do nothing`, [asset.id, input.linkProjectId]);
  }
  if (input.unlinkProjectId) await q(`delete from asset_projects where asset_id = $1 and project_id = $2`, [asset.id, input.unlinkProjectId]);
  const row = await one<any>(`select a.*, (select coalesce(array_agg(project_id), '{}') from asset_projects ap where ap.asset_id = a.id) as project_ids from assets a where a.id = $1`, [asset.id]);
  return c.json({ asset: assetToClient(row) });
});

assets.delete('/assets/:id', async (c) => {
  const { user, asset } = await assetFor(c, 'editor');
  if (!can(asset.role, 'admin') && asset.created_by !== user.id) throw forbidden('Only an admin or the person who uploaded this file can delete it.');
  await q(`update assets set deleted_at = now() where id = $1`, [asset.id]);
  const storage = getStorage();
  await storage.delete(asset.storage_key).catch(() => undefined);
  if (asset.meta?.thumb) await storage.delete(`${asset.storage_key}.thumb`).catch(() => undefined);
  await audit({ workspaceId: asset.workspace_id, actorId: user.id, action: 'asset.delete', targetType: 'asset', targetId: asset.id, ip: clientIp(c) });
  return c.json({ ok: true });
});
