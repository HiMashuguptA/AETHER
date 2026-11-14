import { useEffect, useMemo, useRef, useState } from 'react';
import { MagnifyingGlass, ArrowRight, Plus, Sparkle, House, Kanban, Books, Palette, RocketLaunch, FilmSlate } from '@phosphor-icons/react';
import { useApp } from '../../data/store';
import { navigate } from '../../lib/router';
import { Kbd } from './bits';

interface Item { id: string; label: string; hint: string; icon: React.ReactNode; run: () => void; group: string }

/** ⌘K: navigate, create and summon Muse from anywhere. Fully keyboard operable. */
export default function CommandPalette() {
  const open = useApp((s) => s.paletteOpen);
  const setOpen = useApp((s) => s.setPaletteOpen);
  const projects = useApp((s) => s.projects);
  const setMuse = useApp((s) => s.setMuseOpen);
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const items: Item[] = useMemo(() => {
    const close = (fn: () => void) => () => { setOpen(false); fn(); };
    return [
      { id: 'new', label: 'New project', hint: 'Start from an idea', icon: <Plus size={16} />, run: close(() => navigate('start', { transition: false })), group: 'Actions' },
      { id: 'muse', label: 'Ask Muse', hint: '⌘J', icon: <Sparkle size={16} className="text-violet-400" />, run: close(() => setMuse(true)), group: 'Actions' },
      { id: 'home', label: 'Home', hint: 'Dashboard', icon: <House size={16} />, run: close(() => navigate('workspace', { transition: false })), group: 'Go to' },
      { id: 'projects', label: 'Projects', hint: 'Board, list, timeline', icon: <Kanban size={16} />, run: close(() => navigate('projects', { transition: false })), group: 'Go to' },
      { id: 'library', label: 'Library', hint: 'Assets', icon: <Books size={16} />, run: close(() => navigate('library', { transition: false })), group: 'Go to' },
      { id: 'brand', label: 'Brand kit', hint: 'Tokens', icon: <Palette size={16} />, run: close(() => navigate('brand-kit', { transition: false })), group: 'Go to' },
      { id: 'story', label: 'The AETHER story', hint: 'Cinematic site', icon: <FilmSlate size={16} />, run: close(() => navigate('#')), group: 'Go to' },
      ...projects.map((p) => ({ id: `p-${p.id}`, label: p.name, hint: 'Open canvas', icon: <ArrowRight size={16} />, run: close(() => navigate(`project-${p.id}`, { transition: false })), group: 'Projects' })),
      ...projects.map((p) => ({ id: `l-${p.id}`, label: `Launch ${p.name}`, hint: 'Preview and publish', icon: <RocketLaunch size={16} />, run: close(() => navigate(`launch-${p.id}`, { transition: false })), group: 'Projects' })),
    ];
  }, [projects, setOpen, setMuse]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? items.filter((it) => it.label.toLowerCase().includes(s) || it.group.toLowerCase().includes(s)) : items.filter((it) => !it.id.startsWith('l-'));
    return list.slice(0, 12);
  }, [items, q]);

  useEffect(() => {
    if (open) { setQ(''); setI(0); setTimeout(() => input.current?.focus(), 20); }
  }, [open]);
  useEffect(() => setI(0), [q]);

  if (!open) return null;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((v) => Math.min(filtered.length - 1, v + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setI((v) => Math.max(0, v - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); filtered[i]?.run(); }
  };
  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[88] flex items-start justify-center px-4 pt-[12vh]" onKeyDown={onKey}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade" onClick={() => setOpen(false)} />
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="glass-strong elev-3 relative w-full max-w-[600px] overflow-hidden rounded-3xl animate-rise">
        <div className="flex items-center gap-3 border-b border-hairline px-5">
          <MagnifyingGlass size={18} className="text-text-3" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects, pages and actions"
            className="h-14 flex-1 bg-transparent text-base text-mist placeholder:text-text-4 focus:outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={filtered[i] ? `pal-${filtered[i].id}` : undefined}
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul id="palette-list" role="listbox" className="thin-scroll max-h-[50vh] overflow-y-auto p-2">
          {filtered.length === 0 && <li className="px-4 py-8 text-center text-sm text-text-3">Nothing matches “{q}”. Try a project name.</li>}
          {filtered.map((it, idx) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <li key={it.id} role="presentation">
                {header && <p className="mono-label px-3 pb-1 pt-3 text-text-4">{header}</p>}
                <button
                  id={`pal-${it.id}`}
                  role="option"
                  aria-selected={idx === i}
                  onMouseEnter={() => setI(idx)}
                  onClick={it.run}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${idx === i ? 'bg-white/[0.07] text-mist' : 'text-text-2'}`}
                >
                  <span className="text-text-3">{it.icon}</span>
                  <span className="flex-1 truncate">{it.label}</span>
                  <span className="text-xs text-text-4">{it.hint}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
