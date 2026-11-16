/**
 * Typed client for the AETHER API (same origin, cookie session). Every failure becomes an
 * ApiFail with a message that is safe to show, so screens can render real error states.
 */
export class ApiFail extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
  get isAuth() { return this.status === 401; }
  get isPermission() { return this.status === 403; }
  get isConflict() { return this.status === 409; }
  get isNetwork() { return this.status === 0; }
}

export async function api<T = unknown>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch {
    throw new ApiFail(0, 'network', 'You appear to be offline, or the server could not be reached. Nothing was saved.');
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const err = data?.error;
    // auth endpoints answer with { message, code }
    const message = err?.message ?? data?.message ?? (res.status >= 500 ? 'Something went wrong on our side. Try again in a moment.' : 'That request could not be completed.');
    const fail = new ApiFail(res.status, err?.code ?? data?.code ?? 'error', message, err?.details);
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new CustomEvent('aether:signed-out'));
    throw fail;
  }
  return data as T;
}

export const errorText = (e: unknown) => (e instanceof ApiFail ? e.message : 'Something went wrong. Try again.');
