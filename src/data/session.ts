import { create } from 'zustand';
import { api, ApiFail } from './api';

export type Role = 'owner' | 'admin' | 'editor' | 'viewer';
export interface SessionUser { id: string; name: string; email: string; emailVerified: boolean; image?: string | null }
export interface WorkspaceRef { id: string; name: string; slug: string; role: Role; members: number }
export interface Capabilities {
  environment: string;
  muse: { provider: string; label?: string; real: boolean };
  email: { delivery: 'resend' | 'dev-outbox' | 'none'; verificationRequired: boolean };
  google: boolean;
  storage: string;
  publishing: { adapter: string; customDomains: boolean };
}

interface SessionState {
  status: 'loading' | 'anon' | 'ready' | 'offline';
  user: SessionUser | null;
  workspaces: WorkspaceRef[];
  workspaceId: string | null;
  capabilities: Capabilities | null;
  /** where to go after signing in */
  returnTo: string | null;
  setReturnTo: (hash: string | null) => void;
  load: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<{ needsVerification: boolean }>;
  signOut: () => Promise<void>;
  updateName: (name: string) => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
  createWorkspace: (name: string) => Promise<void>;
}

const rank: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  user: null,
  workspaces: [],
  workspaceId: null,
  capabilities: null,
  returnTo: null,
  setReturnTo: (hash) => set({ returnTo: hash }),

  load: async () => {
    try {
      const me = await api<{ user: SessionUser | null; workspaces: WorkspaceRef[]; lastWorkspaceId?: string | null; capabilities: Capabilities }>('GET', '/me');
      if (!me.user) return set({ status: 'anon', user: null, workspaces: [], workspaceId: null, capabilities: me.capabilities });
      const workspaceId = me.workspaces.some((w) => w.id === me.lastWorkspaceId) ? me.lastWorkspaceId! : me.workspaces[0]?.id ?? null;
      set({ status: 'ready', user: me.user, workspaces: me.workspaces, workspaceId, capabilities: me.capabilities });
    } catch (e) {
      set({ status: e instanceof ApiFail && e.isNetwork ? 'offline' : 'anon' });
    }
  },

  signIn: async (email, password) => {
    await api('POST', '/auth/sign-in/email', { email, password });
    await get().load();
  },
  signUp: async (name, email, password) => {
    const res = await api<{ token?: string | null }>('POST', '/auth/sign-up/email', { name, email, password, callbackURL: '/#verified' });
    await get().load();
    return { needsVerification: get().status !== 'ready' && !res?.token };
  },
  signOut: async () => {
    await api('POST', '/auth/sign-out', {}).catch(() => undefined);
    set({ status: 'anon', user: null, workspaces: [], workspaceId: null });
  },
  updateName: async (name) => {
    await api('POST', '/auth/update-user', { name });
    set((s) => ({ user: s.user ? { ...s.user, name } : s.user }));
  },
  switchWorkspace: async (id) => {
    set({ workspaceId: id });
    await api('PATCH', '/me/preferences', { lastWorkspaceId: id }).catch(() => undefined);
  },
  createWorkspace: async (name) => {
    const { workspace } = await api<{ workspace: WorkspaceRef }>('POST', '/workspaces', { name });
    set((s) => ({ workspaces: [...s.workspaces, workspace] }));
    await get().switchWorkspace(workspace.id);
  },
}));

export const currentRole = (): Role | null => {
  const s = useSession.getState();
  return s.workspaces.find((w) => w.id === s.workspaceId)?.role ?? null;
};
export const useRole = () => useSession((s) => s.workspaces.find((w) => w.id === s.workspaceId)?.role ?? null);
export const roleCan = (role: Role | null, min: Role) => !!role && rank[role] >= rank[min];

// a 401 from any API call means the session ended (expired or signed out in another tab)
if (typeof window !== 'undefined') {
  window.addEventListener('aether:signed-out', () => {
    if (useSession.getState().status === 'ready') useSession.setState({ status: 'anon', user: null, workspaces: [], workspaceId: null });
  });
}
