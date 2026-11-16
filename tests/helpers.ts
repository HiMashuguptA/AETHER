import { app } from '../server/app.js';

const ORIGIN = 'http://localhost:8787';

/** A browser-like client: keeps cookies, sends the app's Origin header. */
export class Client {
  cookies = new Map<string, string>();
  constructor(public origin: string | null = ORIGIN) {}

  async raw(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { ...headers };
    if (this.origin) h.origin = this.origin;
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    let payload: BodyInit | undefined;
    if (body instanceof Uint8Array) payload = body as unknown as BodyInit;
    else if (body !== undefined) { payload = JSON.stringify(body); h['content-type'] = 'application/json'; }
    const res = await app.request(`${ORIGIN}${path}`, { method, headers: h, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (value === '' || /max-age=0/i.test(c)) this.cookies.delete(name); else this.cookies.set(name, value);
    }
    return res;
  }
  async call<T = any>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<{ status: number; data: T }> {
    const res = await this.raw(method, path, body, headers);
    const text = await res.text();
    let data: any = text;
    try { data = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, data };
  }
  get = <T = any>(p: string) => this.call<T>('GET', p);
  post = <T = any>(p: string, b: unknown = {}) => this.call<T>('POST', p, b);
  patch = <T = any>(p: string, b: unknown = {}) => this.call<T>('PATCH', p, b);
  del = <T = any>(p: string) => this.call<T>('DELETE', p);
}

let n = 0;
export const PASSWORD = 'correct horse battery';

/** Sign up, confirm the email through the test outbox, and return a signed-in client with its workspace. */
export async function newUser(name = 'Test Person') {
  const email = `user${++n}-${Date.now().toString(36)}@example.test`;
  const c = new Client();
  const signup = await c.post('/api/auth/sign-up/email', { name, email, password: PASSWORD, callbackURL: '/#verified' });
  if (signup.status !== 200) throw new Error(`sign-up failed: ${JSON.stringify(signup.data)}`);
  const outbox = await c.get(`/api/dev/outbox?email=${encodeURIComponent(email)}`);
  const url = new URL(outbox.data.message.url);
  await c.raw('GET', url.pathname + url.search);
  if (!c.cookies.size) await c.post('/api/auth/sign-in/email', { email, password: PASSWORD });
  const me = await c.get('/api/me');
  return { c, email, userId: me.data.user.id as string, ws: me.data.workspaces[0].id as string };
}

export const DIRECTION = { name: 'Quiet chrome', accent: '#8b70ec', headline: 'A calm place\nto begin', subhead: 'A studio site that opens slowly and says one thing well.', visual: 'drop' };

export async function newProject(c: Client, ws: string, name = 'Halden Coffee') {
  const r = await c.post(`/api/workspaces/${ws}/projects`, { name, idea: 'A launch site for a coffee roaster', outputs: ['site'], direction: DIRECTION });
  if (r.status !== 201) throw new Error(`project create failed: ${JSON.stringify(r.data)}`);
  return r.data.project;
}

export async function addMember(owner: Client, ws: string, role: 'admin' | 'editor' | 'viewer') {
  const u = await newUser(`${role} person`);
  const inv = await owner.post(`/api/workspaces/${ws}/invitations`, { email: u.email, role });
  const token = new URL(inv.data.link).hash.split('token=')[1];
  const join = await u.c.post('/api/invitations/accept', { token });
  if (join.status !== 200) throw new Error(`join failed: ${JSON.stringify(join.data)}`);
  return u;
}

export const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
export const assetHeader = (meta: Record<string, unknown>) => ({ 'x-asset': encodeURIComponent(JSON.stringify(meta)), 'content-type': 'application/octet-stream' });
