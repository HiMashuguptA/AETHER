import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { env } from '../env.js';
import { ApiError } from '../lib/http.js';

/**
 * Object storage behind one interface. Files are private: the browser never receives a storage
 * URL, only /api/assets/:id/file, which checks workspace membership before streaming.
 *  - vercel-blob: a private Vercel Blob store (BLOB_READ_WRITE_TOKEN)
 *  - local: files on disk, for development and tests
 */
export interface StoredFile { stream: ReadableStream<Uint8Array>; size?: number }
export interface Storage {
  name: string;
  put(key: string, data: Uint8Array, mime: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  head(key: string): Promise<{ size: number; mime: string } | null>;
  delete(key: string): Promise<void>;
}

const safeKey = (key: string) => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,400}$/.test(key) || key.includes('..')) throw new ApiError(400, 'invalid_request', 'Invalid storage key.');
  return key;
};

function local(): Storage {
  const root = resolve(env.localStorageDir);
  const path = (key: string) => join(root, safeKey(key));
  return {
    name: 'local',
    async put(key, data) { await mkdir(dirname(path(key)), { recursive: true }); await writeFile(path(key), data); },
    async get(key) {
      const buf = await readFile(path(key)).catch(() => null);
      if (!buf) return null;
      return { stream: new Blob([new Uint8Array(buf)]).stream() as ReadableStream<Uint8Array>, size: buf.length };
    },
    async head(key) { const buf = await readFile(path(key)).catch(() => null); return buf ? { size: buf.length, mime: '' } : null; },
    async delete(key) { await rm(path(key), { force: true }); },
  };
}

function vercelBlob(): Storage {
  const token = env.blobToken;
  return {
    name: 'vercel-blob',
    async put(key, data, mime) {
      const { put } = await import('@vercel/blob');
      await put(safeKey(key), Buffer.from(data), { access: 'private', contentType: mime, addRandomSuffix: false, allowOverwrite: true, token });
    },
    async get(key) {
      const { get } = await import('@vercel/blob');
      const r = await get(safeKey(key), { access: 'private', token });
      if (!r || !r.stream) return null;
      return { stream: r.stream as ReadableStream<Uint8Array>, size: r.blob?.size };
    },
    async head(key) {
      const { head } = await import('@vercel/blob');
      const h = await head(safeKey(key), { token }).catch(() => null);
      return h ? { size: h.size, mime: h.contentType } : null;
    },
    async delete(key) { const { del } = await import('@vercel/blob'); await del(safeKey(key), { token }).catch(() => undefined); },
  };
}

export function getStorage(): Storage {
  const p = env.storageProvider;
  if (p === 'vercel-blob') return vercelBlob();
  if (p === 'local') return local();
  throw new ApiError(503, 'storage_unavailable', 'File storage is not configured in this environment.');
}

/** Does the content really look like the type the file name claims? Guards against renamed files. */
export function matchesSignature(mime: string, head: Uint8Array): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  switch (mime) {
    case 'image/png': return head[0] === 0x89 && ascii(1, 4) === 'PNG';
    case 'image/jpeg': return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case 'image/gif': return ascii(0, 4) === 'GIF8';
    case 'image/webp': return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    case 'image/avif': return ascii(4, 8) === 'ftyp' && /avif|avis|mif1/.test(ascii(8, 12));
    case 'model/gltf-binary': return ascii(0, 4) === 'glTF';
    case 'application/pdf': return ascii(0, 5) === '%PDF-';
    case 'application/json': { const first = ascii(0, 64).replace(/^﻿/, '').trimStart()[0]; return first === '{' || first === '['; }
    default: return false;
  }
}

export async function readHead(file: StoredFile, bytes = 64): Promise<Uint8Array> {
  const reader = file.stream.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  while (n < bytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    n += value.length;
  }
  await reader.cancel().catch(() => undefined);
  const out = new Uint8Array(n);
  let o = 0;
  for (const ch of chunks) { out.set(ch, o); o += ch.length; }
  return out.slice(0, bytes);
}
