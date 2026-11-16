import { useEffect, useState } from 'react';
import { House, Kanban, Books, Pulse, Palette, Sparkle, MagnifyingGlass, Plus, CaretLeft, CaretRight, UsersThree, SignOut, UserCircle, CaretUpDown, Check } from '@phosphor-icons/react';
import { navigate, type Route } from '../lib/router';
import { useApp } from '../data/store';
import { useSession } from '../data/session';
import { errorText } from '../data/api';
import { Avatar, Kbd, EmptyState } from './components/bits';
import { Button } from '../components/Button';
import AuthScreens from './auth/Auth';
import Team from './pages/Team';
import Account from './pages/Account';
import CoreViewport from './components/CoreViewport';
import { clearPendingProject, peekPendingProject } from './pendingIdea';
import CommandPalette from './components/CommandPalette';
import MusePanel from './components/MusePanel';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import StartFlow from './pages/StartFlow';
import ProjectSpace from './pages/ProjectSpace';
import LaunchPage from './pages/LaunchPage';
import Library from './pages/Library';
import ActivityPage from './pages/Activity';
import BrandKit from './pages/BrandKit';
import NotFound from './pages/NotFound';

const NAV = [
  { id: 'workspace', label: 'Home', icon: House },
  { id: 'projects', label: 'Projects', icon: Kanban },
  { id: 'library', label: 'Library', icon: Books },
  { id: 'activity', label: 'Activity', icon: Pulse },
  { id: 'brand-kit', label: 'Brand kit', icon: Palette },
  { id: 'team', label: 'Team', icon: UsersThree },
] as const;

function Sidebar({ route, collapsed, setCollapsed }: { route: Route; collapsed: boolean; setCollapsed: (v: boolean) => void }) {
  const setPalette = useApp((s) => s.setPaletteOpen);
  const current = route.name === 'project' || route.name === 'launch' ? 'projects' : route.name;
  return (
    <aside
      className={`glass-strong fixed inset-y-3 left-3 z-40 hidden flex-col rounded-3xl p-3 transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] md:flex ${collapsed ? 'w-[64px]' : 'w-[232px]'}`}
      style={{ viewTransitionName: 'aether-shell' } as React.CSSProperties}
      aria-label="Workspace"
    >
      <div className="flex items-center justify-between px-1.5 pb-4 pt-1">
        <button onClick={() => navigate('#')} className="flex items-center gap-2 text-mist" aria-label="Back to the AETHER story" data-cursor="Story">
          <span className="text-2xl font-light leading-none">Æ</span>
          {!collapsed && <span className="text-sm font-medium tracking-[0.32em]">ÆTHER</span>}
        </button>
        {!collapsed && (
          <button onClick={() => setCollapsed(true)} aria-label="Collapse sidebar" className="flex h-7 w-7 items-center justify-center rounded-full text-text-3 hover:bg-white/[0.06] hover:text-mist"><CaretLeft size={14} /></button>
        )}
      </div>
      <button onClick={() => setPalette(true)} className={`mb-3 flex h-10 items-center gap-2 rounded-xl border border-hairline bg-white/[0.02] px-3 text-sm text-text-3 transition-colors hover:border-hairline-strong hover:text-mist ${collapsed ? 'justify-center px-0' : ''}`} aria-label="Search and commands">
        <MagnifyingGlass size={16} />
        {!collapsed && <><span className="flex-1 text-left">Search</span><Kbd>⌘K</Kbd></>}
      </button>
      <nav className="flex flex-col gap-1">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = current === n.id;
          return (
            <button
              key={n.id}
              onClick={() => navigate(n.id, { transition: false })}
              aria-current={active ? 'page' : undefined}
              className={`group flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors duration-300 ${collapsed ? 'justify-center px-0' : ''} ${active ? 'bg-white/[0.08] text-mist' : 'text-text-2 hover:bg-white/[0.04] hover:text-mist'}`}
              title={collapsed ? n.label : undefined}
            >
              <Icon size={18} weight={active ? 'fill' : 'regular'} className={active ? 'text-violet-400' : ''} />
              {!collapsed && n.label}
            </button>
          );
        })}
      </nav>
      <div className="mt-6">
        <button onClick={() => navigate('start', { transition: false })} className={`flex h-10 w-full items-center gap-2 rounded-full bg-light text-sm font-semibold text-black transition-shadow hover:shadow-[0_0_32px_rgba(139,112,236,0.45)] ${collapsed ? 'justify-center' : 'justify-center'}`} aria-label="New project">
          <Plus size={16} weight="bold" />
          {!collapsed && 'New project'}
        </button>
      </div>
      <div className="mt-auto flex flex-col gap-2">
        {collapsed && (
          <button onClick={() => setCollapsed(false)} aria-label="Expand sidebar" className="flex h-9 items-center justify-center rounded-xl text-text-3 hover:bg-white/[0.06] hover:text-mist"><CaretRight size={14} /></button>
        )}
        <UserMenu collapsed={collapsed} />
      </div>
    </aside>
  );
}

/** Who is signed in, which workspace is open, and the way out. */
function UserMenu({ collapsed }: { collapsed: boolean }) {
  const user = useSession((s) => s.user);
  const workspaces = useSession((s) => s.workspaces);
  const workspaceId = useSession((s) => s.workspaceId);
  const switchWorkspace = useSession((s) => s.switchWorkspace);
  const signOut = useSession((s) => s.signOut);
  const [open, setOpen] = useState(false);
  const ws = workspaces.find((w) => w.id === workspaceId);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  if (!user) return null;
  return (
    <div className="relative">
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="glass-strong absolute bottom-full left-0 z-50 mb-2 w-[232px] rounded-2xl p-1.5 animate-rise" role="menu" aria-label="Account and workspaces">
            <p className="mono-label px-3 pb-1 pt-2 text-text-4">Workspaces</p>
            {workspaces.map((w) => (
              <button key={w.id} role="menuitemradio" aria-checked={w.id === workspaceId} onClick={() => { setOpen(false); if (w.id !== workspaceId) void switchWorkspace(w.id); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-text-2 hover:bg-white/[0.06] hover:text-mist">
                <span className="min-w-0 flex-1 truncate">{w.name}</span>
                <span className="text-xs capitalize text-text-4">{w.role}</span>
                {w.id === workspaceId ? <Check size={14} className="text-violet-300" /> : null}
              </button>
            ))}
            <div className="my-1 h-px bg-hairline" />
            <button role="menuitem" onClick={() => { setOpen(false); navigate('account', { transition: false }); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-text-2 hover:bg-white/[0.06] hover:text-mist"><UserCircle size={16} /> Account</button>
            <button role="menuitem" onClick={async () => { setOpen(false); await signOut(); navigate('#'); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-text-2 hover:bg-white/[0.06] hover:text-mist"><SignOut size={16} /> Sign out</button>
          </div>
        </>
      )}
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`${user.name}, ${ws?.name ?? 'workspace'}. Account menu`} className={`flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-white/[0.04] ${collapsed ? 'justify-center' : ''}`}>
        <Avatar id={user.id} size={30} ring="#141416" />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-mist">{user.name}</span>
              <span className="block truncate text-xs text-text-3">{ws?.name ?? 'No workspace'}</span>
            </span>
            <CaretUpDown size={14} className="shrink-0 text-text-4" />
          </>
        )}
      </button>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[100svh] items-center justify-center bg-black p-6">{children}</div>;
}
const Spinner = ({ label }: { label: string }) => (
  <div className="flex flex-col items-center gap-3 text-sm text-text-3" role="status">
    <span className="h-6 w-6 animate-[aether-spin_0.9s_linear_infinite] rounded-full border-2 border-violet-400 border-t-transparent" />
    {label}
  </div>
);

/** After signing up or in part-way through starting a project: create it from what was saved in this browser. */
function ResumePending({ onDone }: { onDone: () => void }) {
  const create = useApp((s) => s.createProject);
  const toast = useApp((s) => s.toast);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const pending = peekPendingProject();
  useEffect(() => {
    if (!pending) return onDone();
    let cancelled = false;
    setError('');
    const started = Date.now();
    create({ name: pending.name, idea: pending.idea, direction: pending.direction, outputs: pending.outputs, directionSetId: pending.directionSetId })
      .then((id) => {
        clearPendingProject();
        if (cancelled) return;
        setTimeout(() => { toast({ text: `${pending.name} is ready. Its Core is at the Form stage.`, tone: 'success' }); onDone(); navigate(`project-${id}`, { transition: false }); }, Math.max(0, 1600 - (Date.now() - started)));
      })
      .catch((e) => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  if (error) {
    return (
      <Centered>
        <EmptyState title="The project could not be created" body={`${error} Your idea and direction are still saved in this browser.`} action={<div className="flex gap-2"><Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>Try again</Button><Button onClick={() => { clearPendingProject(); onDone(); }}>Discard it</Button></div>} />
      </Centered>
    );
  }
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black">
      <CoreViewport morph={2} controls={false} className="absolute inset-0" label="The project’s Core forming" />
      <div className="relative mt-[50vh] text-center animate-rise" role="status" aria-live="polite">
        <p className="mono-label text-violet-400">Forming</p>
        <p className="mt-2 text-2xl font-light text-mist">{pending?.name}</p>
        <p className="mt-1 text-sm text-text-3">Saving your project, its first version and its motion timeline</p>
      </div>
    </div>
  );
}

function MobileTabs({ route }: { route: Route }) {
  const setMuse = useApp((s) => s.setMuseOpen);
  const current = route.name === 'project' || route.name === 'launch' ? 'projects' : route.name;
  const items = [
    { id: 'workspace', label: 'Home', icon: House },
    { id: 'projects', label: 'Projects', icon: Kanban },
    { id: 'start', label: 'New', icon: Plus },
    { id: 'library', label: 'Library', icon: Books },
  ];
  return (
    <nav className="glass-strong fixed inset-x-3 bottom-3 z-40 flex h-16 items-center justify-around rounded-3xl md:hidden" aria-label="Workspace">
      {items.map((it) => {
        const Icon = it.icon;
        const active = current === it.id;
        return (
          <button key={it.id} onClick={() => navigate(it.id, { transition: false })} aria-current={active ? 'page' : undefined} className={`flex min-w-[56px] flex-col items-center gap-1 text-[11px] ${active ? 'text-mist' : 'text-text-3'}`}>
            <Icon size={20} weight={active ? 'fill' : 'regular'} className={active ? 'text-violet-400' : ''} />
            {it.label}
          </button>
        );
      })}
      <button onClick={() => setMuse(true)} className="flex min-w-[56px] flex-col items-center gap-1 text-[11px] text-text-3">
        <Sparkle size={20} className="text-violet-400" />
        Muse
      </button>
    </nav>
  );
}

/** The AETHER workspace: the same world as the story at a lower volume. */
export default function Workspace({ route }: { route: Route }) {
  const [collapsed, setCollapsed] = useState(false);
  const setPalette = useApp((s) => s.setPaletteOpen);
  const setMuse = useApp((s) => s.setMuseOpen);
  const museOpen = useApp((s) => s.museOpen);
  const status = useSession((s) => s.status);
  const workspaceId = useSession((s) => s.workspaceId);
  const loadSession = useSession((s) => s.load);
  const loadedWorkspace = useApp((s) => s.loadedWorkspace);
  const loading = useApp((s) => s.loading);
  const loadError = useApp((s) => s.loadError);
  const hydrate = useApp((s) => s.hydrate);
  const reset = useApp((s) => s.reset);
  const [resuming, setResuming] = useState(() => !!peekPendingProject());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useSession.getState().status !== 'ready') return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); }
      if (mod && e.key.toLowerCase() === 'j') { e.preventDefault(); setMuse(!useApp.getState().museOpen); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPalette, setMuse]);

  useEffect(() => { window.scrollTo(0, 0); }, [route.name]);

  // load (or reload) the workspace's data whenever the signed-in workspace changes
  useEffect(() => {
    if (status === 'ready' && workspaceId && loadedWorkspace !== workspaceId) void hydrate(workspaceId);
    if (status === 'anon' && loadedWorkspace) reset();
  }, [status, workspaceId, loadedWorkspace, hydrate, reset]);
  // pick up changes made by teammates when the tab is looked at again
  useEffect(() => {
    const onFocus = () => { const s = useSession.getState(); if (s.status === 'ready' && s.workspaceId && document.visibilityState === 'visible') void useApp.getState().hydrate(s.workspaceId, { quiet: true }); };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, []);
  useEffect(() => { if (status === 'ready' && peekPendingProject()) setResuming(true); }, [status, route.name]);

  if (route.name === 'auth') return <AuthScreens view={route.view} token={route.token} />;
  if (status === 'loading') return <Centered><Spinner label="Opening AETHER" /></Centered>;
  if (status === 'offline') {
    return <Centered><EmptyState title="AETHER could not be reached" body="Check your connection. Nothing has been lost; your projects are saved on the server." action={<Button variant="primary" onClick={() => void loadSession()}>Try again</Button>} /></Centered>;
  }

  // Idea first, account second: the creation flow is open to visitors. Everything else needs a session.
  if (route.name === 'start') {
    return (
      <div className="min-h-[100svh] bg-black">
        <StartFlow />
      </div>
    );
  }
  if (status === 'anon') {
    const here = window.location.hash.replace(/^#/, '');
    if (useSession.getState().returnTo !== here) useSession.getState().setReturnTo(here);
    return <AuthScreens view="signin" />;
  }
  if (!workspaceId) return <Centered><EmptyState title="You are not in a workspace" body="Create one to start a project." action={<Button variant="primary" onClick={() => void useSession.getState().createWorkspace('My studio')}>Create a workspace</Button>} /></Centered>;
  if (loadError && loadedWorkspace !== workspaceId) {
    return <Centered><EmptyState title="The workspace did not load" body={loadError} action={<Button variant="primary" onClick={() => void hydrate(workspaceId)}>Try again</Button>} /></Centered>;
  }
  if (loadedWorkspace !== workspaceId || (loading && loadedWorkspace !== workspaceId)) return <Centered><Spinner label="Loading your workspace" /></Centered>;
  if (resuming) return <ResumePending onDone={() => setResuming(false)} />;

  const fullBleed = route.name === 'project';
  const projectId = route.name === 'project' || route.name === 'launch' ? route.id : undefined;

  let page: React.ReactNode;
  switch (route.name) {
    case 'workspace': page = <Dashboard />; break;
    case 'projects': page = <Projects />; break;
    case 'project': page = <ProjectSpace id={route.id} />; break;
    case 'launch': page = <LaunchPage id={route.id} />; break;
    case 'library': page = <Library />; break;
    case 'activity': page = <ActivityPage />; break;
    case 'brand-kit': page = <BrandKit />; break;
    case 'team': page = <Team />; break;
    case 'account': page = <Account />; break;
    default: page = <NotFound />;
  }

  return (
    <div className="min-h-[100svh] bg-black">
      <Sidebar route={route} collapsed={collapsed || fullBleed} setCollapsed={setCollapsed} />
      <div
        className={`min-h-[100svh] pb-24 transition-[padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] md:pb-0 ${collapsed || fullBleed ? 'md:pl-[88px]' : 'md:pl-[256px]'} ${museOpen && !fullBleed ? 'xl:pr-[400px]' : ''}`}
      >
        <main id="main" tabIndex={-1} className="animate-fade">{page}</main>
      </div>
      <MobileTabs route={route} />
      <MusePanel projectId={projectId} />
      <CommandPalette />
    </div>
  );
}
