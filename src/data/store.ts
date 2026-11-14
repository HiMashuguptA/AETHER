import { create } from 'zustand';
import type { Activity, Asset, DesignDoc, MotionTrack, MuseMessage, Output, Project, Proposal, ProposalChange, SpaceSettings, Toast } from './types';
import { defaultMotion, defaultSpace, me, seedActivity, seedAssets, seedProjects } from './seed';
import type { Stage } from '../lib/tokens';
import { generateProposals, museReply } from './muse';

let uid = 0;
export const newId = (p = 'id') => `${p}-${Date.now().toString(36)}-${(uid++).toString(36)}`;

export interface PublishState { projectId: string; step: number; steps: string[]; done: boolean; url?: string }

interface AppState {
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

  setMuseOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;

  touch: (id: string) => void;
  createProject: (p: { name: string; idea: string; direction: { name: string; accent: string; headline: string; subhead: string; visual: Stage }; outputs: Output[] }) => string;
  updateDoc: (id: string, patch: Partial<DesignDoc>) => void;
  updateTrack: (id: string, track: MotionTrack['id'], patch: Partial<MotionTrack>) => void;
  updateSpace: (id: string, patch: Partial<SpaceSettings>) => void;
  setStage: (id: string, stage: Stage) => void;
  addComment: (id: string, text: string, target: Project['comments'][number]['target']) => void;
  resolveComment: (id: string, commentId: string) => void;

  sendToMuse: (projectId: string, prompt: string, context: string[]) => void;
  proposeChanges: (projectId: string, items: Omit<Proposal, 'id' | 'status' | 'createdAt' | 'projectId'>[], intro: string) => void;
  accept: (proposalId: string) => void;
  reject: (proposalId: string) => void;
  acceptAll: (projectId: string) => void;
  rejectAll: (projectId: string) => void;

  addAsset: (a: Omit<Asset, 'id' | 'updatedAt' | 'byId' | 'uses'>) => string;
  updateAsset: (id: string, patch: Partial<Asset>) => void;

  startPublish: (projectId: string) => void;
  closePublish: () => void;
}

function applyChange(p: Project, change: ProposalChange): Project {
  if (change.scope === 'doc') return { ...p, doc: { ...p.doc, [change.key]: change.value } };
  if (change.scope === 'space') return { ...p, space: { ...p.space, [change.key]: change.value } };
  return { ...p, motion: p.motion.map((t) => (t.id === change.track ? { ...t, [change.key]: change.value } : t)) };
}

export const useApp = create<AppState>((set, get) => ({
  projects: seedProjects(),
  assets: seedAssets(),
  activity: seedActivity(),
  proposals: [],
  messages: [],
  toasts: [],
  museOpen: false,
  museThinking: false,
  paletteOpen: false,
  comparing: false,
  setComparing: (v) => set({ comparing: v }),
  publish: null,
  lastProjectId: 'halden',

  setMuseOpen: (open) => set({ museOpen: open }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  toast: (t) => {
    const id = newId('t');
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => get().dismissToast(id), 4200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  touch: (id) => set((s) => ({ lastProjectId: id, projects: s.projects.map((p) => (p.id === id ? { ...p, updatedAt: Date.now() } : p)) })),

  createProject: ({ name, idea, direction, outputs }) => {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'project';
    let id = base;
    let n = 2;
    while (get().projects.some((p) => p.id === id)) id = `${base}-${n++}`;
    const project: Project = {
      id,
      name,
      client: 'Your studio',
      description: idea,
      stage: 'form',
      ownerId: me.id,
      teamIds: [me.id],
      updatedAt: Date.now(),
      due: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10),
      progress: 0.12,
      outputs,
      health: 'On track',
      domain: id,
      doc: {
        headline: direction.headline,
        subhead: direction.subhead,
        cta: 'Start here',
        proof: 'Draft · made with AETHER',
        nav: ['Work', 'About', 'Contact'],
        accent: direction.accent,
        headlineSize: 60,
        subheadTone: '#c4c5cb',
        radius: 16,
        spacing: 24,
        align: 'left',
        theme: 'obsidian',
        visual: direction.visual,
        hidden: {},
        locked: {},
      },
      motion: defaultMotion(),
      space: defaultSpace('form'),
      comments: [],
    };
    set((s) => ({
      projects: [project, ...s.projects],
      lastProjectId: id,
      activity: [{ id: newId('a'), whoId: me.id, text: `created ${name} from the “${direction.name}” direction`, projectId: id, at: Date.now(), kind: 'create' }, ...s.activity],
    }));
    return id;
  },

  updateDoc: (id, patch) => set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, doc: { ...p.doc, ...patch }, updatedAt: Date.now() } : p)) })),
  updateTrack: (id, track, patch) =>
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, motion: p.motion.map((t) => (t.id === track ? { ...t, ...patch } : t)), updatedAt: Date.now() } : p)) })),
  updateSpace: (id, patch) => set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, space: { ...p.space, ...patch }, updatedAt: Date.now() } : p)) })),
  setStage: (id, stage) => {
    const p = get().projects.find((x) => x.id === id);
    if (!p || p.stage === stage) return;
    set((s) => ({
      projects: s.projects.map((x) => (x.id === id ? { ...x, stage, updatedAt: Date.now() } : x)),
      activity: [{ id: newId('a'), whoId: me.id, text: `moved ${p.name} to ${stage[0].toUpperCase()}${stage.slice(1)}`, projectId: id, at: Date.now(), kind: 'edit' }, ...s.activity],
    }));
  },
  addComment: (id, text, target) =>
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, comments: [...p.comments, { id: newId('c'), authorId: me.id, text, at: Date.now(), target }] } : p)) })),
  resolveComment: (id, commentId) =>
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, comments: p.comments.map((c) => (c.id === commentId ? { ...c, resolved: true } : c)) } : p)) })),

  sendToMuse: (projectId, prompt, context) => {
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) return;
    const userMsg: MuseMessage = { id: newId('m'), projectId, role: 'user', text: prompt, context, at: Date.now() };
    set((s) => ({ messages: [...s.messages, userMsg], museThinking: true }));
    const items = generateProposals(project, prompt, context);
    const intro = museReply(project, prompt, items.length);
    setTimeout(() => get().proposeChanges(projectId, items, intro), 900);
  },

  proposeChanges: (projectId, items, intro) => {
    const proposals: Proposal[] = items.map((it) => ({ ...it, id: newId('p'), projectId, status: 'pending', createdAt: Date.now() }));
    const msgId = newId('m');
    const msg: MuseMessage = { id: msgId, projectId, role: 'muse', text: '', streaming: true, proposalIds: [], at: Date.now() };
    set((s) => ({ messages: [...s.messages, msg], museThinking: false }));
    // stream the reply word by word, then attach the proposals
    const words = intro.split(' ');
    let i = 0;
    const tick = () => {
      i = Math.min(words.length, i + 2);
      set((s) => ({ messages: s.messages.map((m) => (m.id === msgId ? { ...m, text: words.slice(0, i).join(' ') } : m)) }));
      if (i < words.length) setTimeout(tick, 45);
      else
        set((s) => ({
          proposals: [...s.proposals, ...proposals],
          messages: s.messages.map((m) => (m.id === msgId ? { ...m, streaming: false, proposalIds: proposals.map((p) => p.id) } : m)),
        }));
    };
    setTimeout(tick, 120);
  },

  accept: (proposalId) => {
    const pr = get().proposals.find((p) => p.id === proposalId);
    if (!pr || pr.status !== 'pending') return;
    set((s) => ({
      proposals: s.proposals.map((p) => (p.id === proposalId ? { ...p, status: 'accepted' } : p)),
      projects: s.projects.map((p) => (p.id === pr.projectId ? { ...applyChange(p, pr.change), updatedAt: Date.now() } : p)),
      activity: [{ id: newId('a'), whoId: me.id, text: `accepted Muse change: ${pr.title.toLowerCase()}`, projectId: pr.projectId, at: Date.now(), kind: 'muse' }, ...s.activity],
    }));
    get().toast({ text: `Applied: ${pr.title} ${pr.from} → ${pr.to}`, tone: 'success' });
  },
  reject: (proposalId) => {
    const pr = get().proposals.find((p) => p.id === proposalId);
    if (!pr || pr.status !== 'pending') return;
    set((s) => ({ proposals: s.proposals.map((p) => (p.id === proposalId ? { ...p, status: 'rejected' } : p)) }));
    get().toast({ text: `Kept your version of ${pr.title.toLowerCase()}`, tone: 'neutral' });
  },
  acceptAll: (projectId) => {
    const pending = get().proposals.filter((p) => p.projectId === projectId && p.status === 'pending');
    if (!pending.length) return;
    set((s) => ({
      proposals: s.proposals.map((p) => (p.projectId === projectId && p.status === 'pending' ? { ...p, status: 'accepted' } : p)),
      projects: s.projects.map((p) => (p.id === projectId ? pending.reduce((acc, pr) => applyChange(acc, pr.change), { ...p, updatedAt: Date.now() }) : p)),
      activity: [{ id: newId('a'), whoId: me.id, text: `accepted ${pending.length} Muse changes`, projectId, at: Date.now(), kind: 'muse' }, ...s.activity],
    }));
    get().toast({ text: `Applied ${pending.length} changes from Muse`, tone: 'success' });
  },
  rejectAll: (projectId) => {
    const n = get().proposals.filter((p) => p.projectId === projectId && p.status === 'pending').length;
    if (!n) return;
    set((s) => ({ proposals: s.proposals.map((p) => (p.projectId === projectId && p.status === 'pending' ? { ...p, status: 'rejected' } : p)) }));
    get().toast({ text: `Dismissed ${n} proposals. Nothing changed.`, tone: 'neutral' });
  },

  addAsset: (a) => {
    const id = newId('as');
    set((s) => ({ assets: [{ ...a, id, updatedAt: Date.now(), byId: me.id, uses: 0 }, ...s.assets] }));
    return id;
  },
  updateAsset: (id, patch) => set((s) => ({ assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),

  startPublish: (projectId) => {
    const steps = ['Building pages', 'Optimising 3D and images', 'Running checks', 'Deploying to the edge'];
    set({ publish: { projectId, step: 0, steps, done: false } });
    const advance = (i: number) => {
      if (i < steps.length) {
        set((s) => (s.publish ? { publish: { ...s.publish, step: i } } : {}));
        setTimeout(() => advance(i + 1), 900 + Math.random() * 500);
      } else {
        const p = get().projects.find((x) => x.id === projectId);
        const url = `${p?.domain ?? projectId}.aether.site`;
        const version = (p?.published?.version ?? 0) + 1;
        set((s) => ({
          publish: s.publish ? { ...s.publish, step: steps.length, done: true, url } : null,
          projects: s.projects.map((x) => (x.id === projectId ? { ...x, stage: 'universe', progress: 1, published: { url, at: Date.now(), version } } : x)),
          activity: [{ id: newId('a'), whoId: me.id, text: `published ${p?.name} v${version}`, projectId, at: Date.now(), kind: 'publish' }, ...s.activity],
        }));
      }
    };
    setTimeout(() => advance(0), 200);
  },
  closePublish: () => set({ publish: null }),
}));

export const selectPending = (projectId: string) => (s: AppState) => s.proposals.filter((p) => p.projectId === projectId && p.status === 'pending');
