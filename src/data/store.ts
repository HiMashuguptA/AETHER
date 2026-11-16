import { create } from 'zustand';
import type { Activity, Asset, DesignDoc, MotionTrack, MuseMessage, Output, Project, Proposal, PublishRecord, SpaceSettings, Toast } from './types';
import type { Stage } from '../lib/tokens';
import { api, ApiFail, errorText } from './api';
import { setMembers, type Member } from './people';
import { useSession, type Role } from './session';
import { uploadRuleFor } from '../../shared/uploads';

let uid = 0;
export const newId = (p = 'id') => `${p}-${Date.now().toString(36)}-${(uid++).toString(36)}`;

export const PUBLISH_STEPS = ['Snapshot saved', 'Build generated', 'Build validated', 'Deployed', 'Verified live'];
export interface PublishState { projectId: string; step: number; steps: string[]; done: boolean; url?: string; error?: string }
export interface DirectionPick { id?: string; name: string; summary?: string; accent: string; headline: string; subhead: string; visual: Stage; type?: string; motion?: string; layout?: string; interaction?: string; rationale?: string; swatches?: string[] }

interface AppState {
  /** which workspace the data below belongs to; null until loaded */
  loadedWorkspace: string | null;
  loading: boolean;
  loadError: string | null;
  role: Role | null;
  members: Member[];
  museAccepted: number;

  projects: Project[];
  assets: Asset[];
  activity: Activity[];
  proposals: Proposal[];
  messages: MuseMessage[];
  toasts: Toast[];
  museOpen: boolean;
  museThinking: boolean;
  paletteOpen: boolean;
  comparing: boolean;
  setComparing: (v: boolean) => void;
  publish: PublishState | null;
  lastProjectId: string;
  saveState: Record<string, 'saving' | 'saved' | 'error'>;

  hydrate: (workspaceId: string, opts?: { quiet?: boolean }) => Promise<void>;
  reset: () => void;
  setMuseOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;

  touch: (id: string) => void;
  createProject: (p: { name: string; idea: string; direction: DirectionPick; outputs: Output[]; directionSetId?: string }) => Promise<string>;
  duplicateProject: (id: string) => Promise<string | null>;
  deleteProject: (id: string) => Promise<boolean>;
  refreshProject: (id: string) => Promise<void>;
  restoreVersion: (id: string, versionId: string) => Promise<boolean>;
  updateDoc: (id: string, patch: Partial<DesignDoc>) => void;
  updateTrack: (id: string, track: MotionTrack['id'], patch: Partial<MotionTrack>) => void;
  updateSpace: (id: string, patch: Partial<SpaceSettings>) => void;
  updateMeta: (id: string, patch: Partial<Pick<Project, 'name' | 'client' | 'description' | 'health' | 'due'>>) => void;
  setStage: (id: string, stage: Stage) => void;
  flushSaves: (id: string) => Promise<void>;
  addComment: (id: string, text: string, target: Project['comments'][number]['target']) => void;
  resolveComment: (id: string, commentId: string) => void;

  loadMuse: (projectId: string) => Promise<void>;
  sendToMuse: (projectId: string, prompt: string, context: string[]) => void;
  proposeChanges: (projectId: string, items: Omit<Proposal, 'id' | 'status' | 'createdAt' | 'projectId'>[], intro: string) => void;
  accept: (proposalId: string) => void;
  reject: (proposalId: string) => void;
  acceptAll: (projectId: string) => void;
  rejectAll: (projectId: string) => void;

  uploadAsset: (file: File, projectId?: string) => Promise<void>;
  deleteAsset: (id: string) => Promise<boolean>;
  linkAsset: (id: string, projectId: string, link: boolean) => Promise<void>;

  startPublish: (projectId: string, slug?: string) => void;
  unpublish: (projectId: string) => Promise<boolean>;
  rollback: (projectId: string, publishId: string) => Promise<boolean>;
  closePublish: () => void;
}


const empty = { projects: [] as Project[], assets: [] as Asset[], activity: [] as Activity[], proposals: [] as Proposal[], messages: [] as MuseMessage[], members: [] as Member[], museAccepted: 0, lastProjectId: '' };

// ---------- saving: one queue per project, debounced, always carrying the last seen revision ----------
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, Record<string, unknown>>();
const chains = new Map<string, Promise<void>>();

export const useApp = create<AppState>((set, get) => {
  const me = () => useSession.getState().user?.id ?? '';
  const fail = (e: unknown) => get().toast({ text: errorText(e), tone: 'error' });
  const patchProject = (id: string, fn: (p: Project) => Project) => set((s) => ({ projects: s.projects.map((p) => (p.id === id ? fn(p) : p)) }));
  const addActivity = (text: string, kind: Activity['kind'], projectId?: string) => set((s) => ({ activity: [{ id: newId('a'), whoId: me(), text, projectId, at: Date.now(), kind }, ...s.activity] }));

  const flush = (id: string): Promise<void> => {
    const t = timers.get(id);
    if (t) { clearTimeout(t); timers.delete(id); }
    const run = async () => {
      const fields = pending.get(id);
      if (!fields) return;
      pending.delete(id);
      const p = get().projects.find((x) => x.id === id);
      if (!p) return;
      const body: Record<string, unknown> = { baseRevision: p.revision ?? 1 };
      for (const k of Object.keys(fields)) body[k] = (p as unknown as Record<string, unknown>)[k];
      set((s) => ({ saveState: { ...s.saveState, [id]: 'saving' } }));
      try {
        const r = await api<{ revision: number; updatedAt: number }>('PATCH', `/projects/${id}`, body);
        patchProject(id, (x) => ({ ...x, revision: r.revision }));
        set((s) => ({ saveState: { ...s.saveState, [id]: 'saved' } }));
      } catch (e) {
        set((s) => ({ saveState: { ...s.saveState, [id]: 'error' } }));
        if (e instanceof ApiFail && (e.isConflict || e.isPermission || e.status === 400)) await get().refreshProject(id); // reload the truth; the rejected edit is dropped, never half-applied
        fail(e);
      }
    };
    const next = (chains.get(id) ?? Promise.resolve()).then(run, run);
    chains.set(id, next);
    return next;
  };
  const queueSave = (id: string, fields: string[], delay = 700) => {
    pending.set(id, { ...(pending.get(id) ?? {}), ...Object.fromEntries(fields.map((f) => [f, true])) });
    const t = timers.get(id);
    if (t) clearTimeout(t);
    timers.set(id, setTimeout(() => void flush(id), delay));
  };

  const streamReply = (msgId: string, text: string, done: () => void) => {
    const words = text.split(' ');
    let i = 0;
    const tick = () => {
      i = Math.min(words.length, i + 2);
      set((s) => ({ messages: s.messages.map((m) => (m.id === msgId ? { ...m, text: words.slice(0, i).join(' ') } : m)) }));
      if (i < words.length) setTimeout(tick, 45);
      else done();
    };
    setTimeout(tick, 120);
  };
  const showMuseResult = (projectId: string, message: MuseMessage, proposals: Proposal[]) => {
    const full = message.text;
    set((s) => ({ messages: [...s.messages, { ...message, projectId, text: '', streaming: true, proposalIds: [] }], museThinking: false }));
    streamReply(message.id, full, () =>
      set((s) => ({
        proposals: [...s.proposals.filter((p) => !proposals.some((n) => n.id === p.id)), ...proposals],
        messages: s.messages.map((m) => (m.id === message.id ? { ...m, text: full, streaming: false, proposalIds: proposals.map((p) => p.id) } : m)),
      })),
    );
  };

  const decide = async (projectId: string, path: string, okToast: (n: number) => Omit<Toast, 'id'>, accepted: boolean) => {
    await get().flushSaves(projectId);
    try {
      const r = await api<{ decided: string[]; project: Pick<Project, 'doc' | 'motion' | 'space' | 'revision' | 'updatedAt'> }>('POST', path);
      set((s) => ({ proposals: s.proposals.map((p) => (r.decided.includes(p.id) ? { ...p, status: accepted ? 'accepted' : 'rejected' } : p)) }));
      patchProject(projectId, (p) => ({ ...p, ...r.project }));
      if (accepted) { addActivity(r.decided.length === 1 ? 'accepted a Muse change' : `accepted ${r.decided.length} Muse changes`, 'muse', projectId); set((s) => ({ museAccepted: s.museAccepted + r.decided.length })); }
      get().toast(okToast(r.decided.length));
    } catch (e) {
      if (e instanceof ApiFail && e.isConflict) await get().loadMuse(projectId);
      fail(e);
    }
  };

  return {
    loadedWorkspace: null,
    loading: false,
    loadError: null,
    role: null,
    ...empty,
    toasts: [],
    museOpen: false,
    museThinking: false,
    paletteOpen: false,
    comparing: false,
    setComparing: (v) => set({ comparing: v }),
    publish: null,
    saveState: {},

    hydrate: async (workspaceId, opts) => {
      if (!opts?.quiet) set({ loading: true, loadError: null });
      try {
        const b = await api<{ role: Role; members: Member[]; projects: Project[]; assets: Asset[]; activity: Activity[]; proposals: Proposal[]; stats: { museAcceptedThisMonth: number } }>('GET', `/workspaces/${workspaceId}/bootstrap`);
        if (useSession.getState().workspaceId !== workspaceId) return; // switched while loading
        setMembers(b.members);
        set((s) => ({
          loadedWorkspace: workspaceId, loading: false, loadError: null, role: b.role, members: b.members,
          projects: b.projects, assets: b.assets, activity: b.activity, proposals: b.proposals, museAccepted: b.stats.museAcceptedThisMonth,
          messages: s.loadedWorkspace === workspaceId ? s.messages : [],
          lastProjectId: b.projects.some((p) => p.id === s.lastProjectId) ? s.lastProjectId : b.projects[0]?.id ?? '',
        }));
      } catch (e) {
        set({ loading: false, loadError: errorText(e) });
      }
    },
    reset: () => { setMembers([]); set({ ...empty, loadedWorkspace: null, role: null, loadError: null, publish: null, museOpen: false }); },

    setMuseOpen: (open) => set({ museOpen: open }),
    setPaletteOpen: (open) => set({ paletteOpen: open }),
    toast: (t) => {
      const id = newId('t');
      set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
      setTimeout(() => get().dismissToast(id), t.tone === 'error' ? 7000 : 4200);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    touch: (id) => set({ lastProjectId: id }),

    createProject: async (input) => {
      const ws = useSession.getState().workspaceId;
      if (!ws) throw new ApiFail(401, 'unauthenticated', 'Sign in to create a project.');
      const { project } = await api<{ project: Project }>('POST', `/workspaces/${ws}/projects`, input);
      set((s) => ({ projects: [project, ...s.projects], lastProjectId: project.id }));
      addActivity(`created ${project.name} from the “${input.direction.name}” direction`, 'create', project.id);
      return project.id;
    },
    duplicateProject: async (id) => {
      try {
        await get().flushSaves(id);
        const { project } = await api<{ project: Project }>('POST', `/projects/${id}/duplicate`);
        set((s) => ({ projects: [project, ...s.projects] }));
        get().toast({ text: `Duplicated as ${project.name}`, tone: 'success' });
        return project.id;
      } catch (e) { fail(e); return null; }
    },
    deleteProject: async (id) => {
      const p = get().projects.find((x) => x.id === id);
      try {
        await api('DELETE', `/projects/${id}`);
        set((s) => ({ projects: s.projects.filter((x) => x.id !== id), proposals: s.proposals.filter((x) => x.projectId !== id), lastProjectId: s.lastProjectId === id ? s.projects.find((x) => x.id !== id)?.id ?? '' : s.lastProjectId }));
        get().toast({ text: `Deleted ${p?.name ?? 'project'}`, tone: 'neutral' });
        return true;
      } catch (e) { fail(e); return false; }
    },
    refreshProject: async (id) => {
      try {
        const { project } = await api<{ project: Project }>('GET', `/projects/${id}`);
        patchProject(id, () => project);
      } catch (e) {
        if (e instanceof ApiFail && e.status === 404) set((s) => ({ projects: s.projects.filter((x) => x.id !== id) }));
      }
    },

    restoreVersion: async (id, versionId) => {
      await get().flushSaves(id);
      const p = get().projects.find((x) => x.id === id);
      if (!p) return false;
      try {
        const r = await api<{ project: Project; version: { number: number } }>('POST', `/projects/${id}/versions/${versionId}/restore`, { baseRevision: p.revision ?? 1 });
        patchProject(id, () => r.project);
        await get().loadMuse(id);
        get().toast({ text: `Restored. Saved as version ${r.version.number}; the state before it was kept too.`, tone: 'success' });
        return true;
      } catch (e) {
        if (e instanceof ApiFail && e.isConflict) await get().refreshProject(id);
        fail(e);
        return false;
      }
    },

    updateDoc: (id, patch) => { patchProject(id, (p) => ({ ...p, doc: { ...p.doc, ...patch }, updatedAt: Date.now() })); queueSave(id, ['doc']); },
    updateTrack: (id, track, patch) => { patchProject(id, (p) => ({ ...p, motion: p.motion.map((t) => (t.id === track ? { ...t, ...patch } : t)), updatedAt: Date.now() })); queueSave(id, ['motion']); },
    updateSpace: (id, patch) => { patchProject(id, (p) => ({ ...p, space: { ...p.space, ...patch }, updatedAt: Date.now() })); queueSave(id, ['space']); },
    updateMeta: (id, patch) => { patchProject(id, (p) => ({ ...p, ...patch, updatedAt: Date.now() })); queueSave(id, Object.keys(patch), 400); },
    setStage: (id, stage) => {
      const p = get().projects.find((x) => x.id === id);
      if (!p || p.stage === stage) return;
      patchProject(id, (x) => ({ ...x, stage, updatedAt: Date.now() }));
      addActivity(`moved ${p.name} to ${stage[0].toUpperCase()}${stage.slice(1)}`, 'edit', id);
      queueSave(id, ['stage'], 0);
    },
    flushSaves: (id) => flush(id),

    addComment: (id, text, target) => {
      const temp = newId('c');
      patchProject(id, (p) => ({ ...p, comments: [...p.comments, { id: temp, authorId: me(), text, at: Date.now(), target }] }));
      api<{ comment: Project['comments'][number] }>('POST', `/projects/${id}/comments`, { text, target })
        .then((r) => patchProject(id, (p) => ({ ...p, comments: p.comments.map((c) => (c.id === temp ? r.comment : c)) })))
        .catch((e) => { patchProject(id, (p) => ({ ...p, comments: p.comments.filter((c) => c.id !== temp) })); fail(e); });
    },
    resolveComment: (id, commentId) => {
      patchProject(id, (p) => ({ ...p, comments: p.comments.map((c) => (c.id === commentId ? { ...c, resolved: true } : c)) }));
      api('POST', `/projects/${id}/comments/${commentId}/resolve`).catch((e) => { patchProject(id, (p) => ({ ...p, comments: p.comments.map((c) => (c.id === commentId ? { ...c, resolved: false } : c)) })); fail(e); });
    },

    loadMuse: async (projectId) => {
      try {
        const r = await api<{ messages: MuseMessage[]; proposals: Proposal[] }>('GET', `/projects/${projectId}/muse`);
        set((s) => ({
          messages: [...s.messages.filter((m) => m.projectId !== projectId), ...r.messages],
          proposals: [...s.proposals.filter((p) => p.projectId !== projectId), ...r.proposals],
        }));
      } catch { /* the panel shows its empty state; sending will surface the error */ }
    },

    sendToMuse: (projectId, prompt, context) => {
      if (!get().projects.some((p) => p.id === projectId)) return;
      const temp = newId('m');
      set((s) => ({ messages: [...s.messages, { id: temp, projectId, role: 'user', text: prompt, context, at: Date.now() }], museThinking: true }));
      void (async () => {
        await get().flushSaves(projectId); // Muse must see the latest saved design
        try {
          const r = await api<{ userMessage: MuseMessage; message: MuseMessage; proposals: Proposal[] }>('POST', `/projects/${projectId}/muse`, { prompt, context });
          set((s) => ({ messages: s.messages.map((m) => (m.id === temp ? { ...r.userMessage, projectId } : m)) }));
          showMuseResult(projectId, r.message, r.proposals);
        } catch (e) {
          // a failed request is shown as a failure, never replaced with invented suggestions
          set((s) => ({ museThinking: false, messages: [...s.messages, { id: newId('m'), projectId, role: 'muse', text: errorText(e), failed: true, at: Date.now() }] }));
        }
      })();
    },

    proposeChanges: (projectId, items, intro) => {
      set({ museThinking: true });
      api<{ message: MuseMessage; proposals: Proposal[] }>('POST', `/projects/${projectId}/proposals`, { intro, items: items.map((i) => ({ title: i.title, target: i.target, rationale: i.rationale, change: i.change })) })
        .then((r) => showMuseResult(projectId, r.message, r.proposals))
        .catch((e) => { set({ museThinking: false }); fail(e); });
    },

    accept: (proposalId) => {
      const pr = get().proposals.find((p) => p.id === proposalId);
      if (!pr || pr.status !== 'pending') return;
      void decide(pr.projectId, `/proposals/${proposalId}/accept`, () => ({ text: `Applied: ${pr.title} ${pr.from} → ${pr.to}. Saved as a new version.`, tone: 'success' }), true);
    },
    reject: (proposalId) => {
      const pr = get().proposals.find((p) => p.id === proposalId);
      if (!pr || pr.status !== 'pending') return;
      void decide(pr.projectId, `/proposals/${proposalId}/reject`, () => ({ text: `Kept your version of ${pr.title.toLowerCase()}`, tone: 'neutral' }), false);
    },
    acceptAll: (projectId) => {
      if (!get().proposals.some((p) => p.projectId === projectId && p.status === 'pending')) return;
      void decide(projectId, `/projects/${projectId}/proposals/accept-all`, (n) => ({ text: `Applied ${n} changes from Muse. Saved as a new version.`, tone: 'success' }), true);
    },
    rejectAll: (projectId) => {
      if (!get().proposals.some((p) => p.projectId === projectId && p.status === 'pending')) return;
      void decide(projectId, `/projects/${projectId}/proposals/reject-all`, (n) => ({ text: `Dismissed ${n} proposals. Nothing changed.`, tone: 'neutral' }), false);
    },

    uploadAsset: async (file, projectId) => {
      const ws = useSession.getState().workspaceId;
      const temp = newId('up');
      const rule = uploadRuleFor(file.name, file.type);
      const placeholder: Asset = { id: temp, name: file.name, kind: rule?.kind ?? 'image', tags: [], size: `${Math.max(1, Math.round(file.size / 1024))} KB`, updatedAt: Date.now(), byId: me(), uses: 0, uploading: 0 };
      const setProgress = (v: number) => set((s) => ({ assets: s.assets.map((a) => (a.id === temp ? { ...a, uploading: v } : a)) }));
      const failWith = (message: string) => { set((s) => ({ assets: s.assets.map((a) => (a.id === temp ? { ...a, uploading: undefined, failed: message } : a)) })); get().toast({ text: `${file.name}: ${message}`, tone: 'error' }); };
      set((s) => ({ assets: [placeholder, ...s.assets] }));
      if (!ws) return failWith('Sign in to upload.');
      if (!rule) return failWith('That file type is not supported. Use PNG, JPEG, WebP, AVIF, GIF, GLB, Lottie JSON or PDF.');
      if (file.size > rule.maxMb * 1_048_576) return failWith(`Too large. The limit for this type is ${rule.maxMb} MB.`);
      try {
        const dims = rule.kind === 'image' ? await imageInfo(file) : null;
        const meta = { name: file.name, mime: rule.mime, size: file.size, width: dims?.width, height: dims?.height, thumb: dims?.thumb, projectId, tags: [] as string[] };
        const { mode } = await api<{ mode: 'direct' | 'blob' | 'none' }>('GET', `/workspaces/${ws}/assets/upload-config`);
        let asset: Asset;
        if (mode === 'direct') {
          asset = await xhrUpload(`/api/workspaces/${ws}/assets`, file, meta, setProgress);
        } else if (mode === 'blob') {
          const { pathname } = await api<{ pathname: string }>('GET', `/workspaces/${ws}/assets/blob-path?name=${encodeURIComponent(file.name)}`);
          const { upload } = await import('@vercel/blob/client');
          await upload(pathname, file, { access: 'private', contentType: rule.mime, handleUploadUrl: `/api/workspaces/${ws}/assets/blob-token`, clientPayload: JSON.stringify({ name: file.name, mime: rule.mime, size: file.size }), onUploadProgress: (e) => setProgress(Math.min(0.95, e.percentage / 100)) });
          asset = (await api<{ asset: Asset }>('POST', `/workspaces/${ws}/assets/complete`, { ...meta, pathname })).asset;
        } else {
          return failWith('File storage is not configured in this environment.');
        }
        set((s) => ({ assets: s.assets.map((a) => (a.id === temp ? asset : a)) }));
        get().toast({ text: `Uploaded ${file.name}`, tone: 'success' });
      } catch (e) {
        failWith(e instanceof Error ? e.message : 'The upload failed.');
      }
    },
    deleteAsset: async (id) => {
      const a = get().assets.find((x) => x.id === id);
      if (a?.failed || a?.uploading !== undefined) { set((s) => ({ assets: s.assets.filter((x) => x.id !== id) })); return true; }
      try {
        await api('DELETE', `/assets/${id}`);
        set((s) => ({ assets: s.assets.filter((x) => x.id !== id) }));
        get().toast({ text: `Deleted ${a?.name ?? 'asset'}`, tone: 'neutral' });
        return true;
      } catch (e) { fail(e); return false; }
    },
    linkAsset: async (id, projectId, link) => {
      try {
        const { asset } = await api<{ asset: Asset }>('PATCH', `/assets/${id}`, link ? { linkProjectId: projectId } : { unlinkProjectId: projectId });
        set((s) => ({ assets: s.assets.map((a) => (a.id === id ? asset : a)) }));
      } catch (e) { fail(e); }
    },

    startPublish: (projectId, slug) => {
      set({ publish: { projectId, step: 0, steps: PUBLISH_STEPS, done: false } });
      void (async () => {
        await get().flushSaves(projectId);
        // progress while the request runs is indicative; "live" is only shown once the server confirms it
        const ticker = setInterval(() => set((s) => (s.publish && !s.publish.done && !s.publish.error && s.publish.step < PUBLISH_STEPS.length - 2 ? { publish: { ...s.publish, step: s.publish.step + 1 } } : {})), 700);
        try {
          const r = await api<{ publish: PublishRecord; revision: number }>('POST', `/projects/${projectId}/publish`, slug ? { slug } : {});
          clearInterval(ticker);
          const p = get().projects.find((x) => x.id === projectId);
          set((s) => ({ publish: s.publish ? { ...s.publish, step: PUBLISH_STEPS.length, done: true, url: r.publish.url } : null }));
          patchProject(projectId, (x) => ({ ...x, stage: 'universe', progress: 1, revision: r.revision, domain: r.publish.slug, published: { url: r.publish.url ?? '', at: Date.now(), version: r.publish.number } }));
          addActivity(`published ${p?.name} v${r.publish.number}`, 'publish', projectId);
        } catch (e) {
          clearInterval(ticker);
          const details = e instanceof ApiFail ? (e.details as { log?: { step: string; ok: boolean }[] } | undefined) : undefined;
          const failedAt = details?.log ? details.log.findIndex((l) => !l.ok) : -1;
          set((s) => ({ publish: s.publish ? { ...s.publish, step: failedAt >= 0 ? failedAt : s.publish.step, error: errorText(e) } : null }));
        }
      })();
    },
    unpublish: async (projectId) => {
      try {
        await api('POST', `/projects/${projectId}/unpublish`);
        patchProject(projectId, (p) => ({ ...p, published: undefined }));
        get().toast({ text: 'Unpublished. The public address no longer serves this project.', tone: 'neutral' });
        return true;
      } catch (e) { fail(e); return false; }
    },
    rollback: async (projectId, publishId) => {
      try {
        const r = await api<{ publish: PublishRecord }>('POST', `/projects/${projectId}/rollback`, { publishId });
        patchProject(projectId, (p) => ({ ...p, published: { url: r.publish.url ?? '', at: Date.now(), version: r.publish.number } }));
        get().toast({ text: `Published version ${r.publish.number} is live again.`, tone: 'success' });
        return true;
      } catch (e) { fail(e); return false; }
    },
    closePublish: () => set({ publish: null }),
  };
});

export const selectPending = (projectId: string) => (s: AppState) => s.proposals.filter((p) => p.projectId === projectId && p.status === 'pending');

/** Read an image's size and make a small preview in the browser (kept private with the original). */
async function imageInfo(file: File): Promise<{ width: number; height: number; thumb?: string } | null> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 480 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    let thumb: string | undefined = canvas.toDataURL('image/webp', 0.8);
    if (!thumb.startsWith('data:image/webp')) thumb = canvas.toDataURL('image/jpeg', 0.8);
    if (thumb.length > 280_000) thumb = undefined;
    return { width: bmp.width, height: bmp.height, thumb };
  } catch {
    return null;
  }
}

function xhrUpload(url: string, file: File, meta: Record<string, unknown>, onProgress: (v: number) => void): Promise<Asset> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('x-asset', encodeURIComponent(JSON.stringify(meta)));
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.min(0.98, e.loaded / e.total)); };
    xhr.onerror = () => reject(new Error('The upload was interrupted. Check your connection and try again.'));
    xhr.onload = () => {
      let data: { asset?: Asset; error?: { message?: string } } | null = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300 && data?.asset) resolve(data.asset);
      else reject(new Error(data?.error?.message ?? 'The upload failed.'));
    };
    xhr.send(file);
  });
}
