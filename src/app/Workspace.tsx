import { useEffect, useState } from 'react';
import { House, Kanban, Books, Pulse, Palette, Sparkle, MagnifyingGlass, Plus, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { navigate, type Route } from '../lib/router';
import { useApp } from '../data/store';
import { me } from '../data/seed';
import { Avatar, Kbd } from './components/bits';
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
        <div className={`flex items-center gap-3 rounded-2xl p-2 ${collapsed ? 'justify-center' : ''}`}>
          <Avatar id={me.id} size={30} ring="#141416" />
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-sm text-mist">{me.name}</span>
              <span className="block truncate text-xs text-text-3">Northlight Studio · Early access</span>
            </span>
          )}
        </div>
      </div>
    </aside>
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); }
      if (mod && e.key.toLowerCase() === 'j') { e.preventDefault(); setMuse(!useApp.getState().museOpen); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPalette, setMuse]);

  useEffect(() => { window.scrollTo(0, 0); }, [route.name]);

  const fullBleed = route.name === 'project' || route.name === 'start';
  const projectId = route.name === 'project' || route.name === 'launch' ? route.id : undefined;

  let page: React.ReactNode;
  switch (route.name) {
    case 'workspace': page = <Dashboard />; break;
    case 'projects': page = <Projects />; break;
    case 'start': page = <StartFlow />; break;
    case 'project': page = <ProjectSpace id={route.id} />; break;
    case 'launch': page = <LaunchPage id={route.id} />; break;
    case 'library': page = <Library />; break;
    case 'activity': page = <ActivityPage />; break;
    case 'brand-kit': page = <BrandKit />; break;
    default: page = <NotFound />;
  }

  if (route.name === 'start') {
    return (
      <div className="min-h-[100svh] bg-black">
        {page}
        <CommandPalette />
      </div>
    );
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
