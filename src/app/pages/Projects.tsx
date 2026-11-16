import { useMemo, useState } from 'react';
import { Kanban, ListBullets, ChartBar, MagnifyingGlass, Plus, CaretUp, CaretDown, DotsThree, CopySimple, Trash } from '@phosphor-icons/react';
import { roleCan, useRole } from '../../data/session';
import { useApp } from '../../data/store';
import { navigate } from '../../lib/router';
import { STAGES, STAGE_LABEL, STAGE_MEANING, type Stage } from '../../lib/tokens';
import { stageImage } from '../../data/assets';
import { Button } from '../../components/Button';
import { AvatarStack, Segmented, StageBadge, timeAgo, formatDate, EmptyState, personById } from '../components/bits';
import type { Project } from '../../data/types';

type View = 'board' | 'list' | 'timeline';
type SortKey = 'name' | 'stage' | 'due' | 'updatedAt';

function MoveMenu({ p }: { p: Project }) {
  const [open, setOpen] = useState(false);
  const setStage = useApp((s) => s.setStage);
  const duplicate = useApp((s) => s.duplicateProject);
  const remove = useApp((s) => s.deleteProject);
  const role = useRole();
  if (!roleCan(role, 'editor')) return null;
  return (
    <div className="relative">
      <button onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} aria-label={`Actions for ${p.name}`} aria-expanded={open} className="flex h-7 w-7 items-center justify-center rounded-full text-text-3 hover:bg-white/[0.06] hover:text-mist">
        <DotsThree size={16} weight="bold" />
      </button>
      {open && (
        <div role="menu" className="glass-strong elev-3 absolute right-0 top-8 z-20 w-48 rounded-xl p-1.5 animate-rise" onClick={(e) => e.stopPropagation()}>
          <p className="mono-label px-2 py-1 text-text-4">Move to</p>
          {STAGES.map((s) => (
            <button key={s} role="menuitem" disabled={s === p.stage} onClick={() => { setStage(p.id, s); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text-2 hover:bg-white/[0.06] hover:text-mist disabled:opacity-40">
              <img src={stageImage[s]} alt="" className="h-4 w-4 rounded-full" /> {STAGE_LABEL[s]}
            </button>
          ))}
          <div className="my-1 h-px bg-hairline" />
          <button role="menuitem" onClick={() => { setOpen(false); void duplicate(p.id); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text-2 hover:bg-white/[0.06] hover:text-mist"><CopySimple size={14} /> Duplicate</button>
          {roleCan(role, 'admin') && (
            <button role="menuitem" onClick={() => { setOpen(false); if (window.confirm(`Delete ${p.name}? Its versions, comments and Muse history go with it${p.published ? ', and its public page stops being served' : ''}.`)) void remove(p.id); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-red-400 hover:bg-red-500/10"><Trash size={14} /> Delete</button>
          )}
        </div>
      )}
    </div>
  );
}

function Board({ list }: { list: Project[] }) {
  const setStage = useApp((s) => s.setStage);
  const [over, setOver] = useState<Stage | null>(null);
  return (
    <div className="thin-scroll -mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
      <div className="grid min-w-[1320px] grid-cols-6 gap-3">
        {STAGES.map((stage) => {
          const items = list.filter((p) => p.stage === stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => { e.preventDefault(); setOver(stage); }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { const id = e.dataTransfer.getData('text/plain'); setOver(null); if (id) setStage(id, stage); }}
              className={`flex min-h-[420px] flex-col gap-2 rounded-2xl border p-2 transition-colors duration-300 ${over === stage ? 'border-violet-400/60 bg-violet-500/[0.05]' : 'border-hairline bg-white/[0.015]'}`}
              aria-label={`${STAGE_LABEL[stage]} column`}
            >
              <div className="flex items-center gap-2 px-2 pb-1 pt-2">
                <img src={stageImage[stage]} alt="" className="h-5 w-5 rounded-full" />
                <span className="text-sm text-mist">{STAGE_LABEL[stage]}</span>
                <span className="font-mono text-xs text-text-4">{items.length}</span>
              </div>
              <p className="px-2 pb-1 text-xs text-text-4">{STAGE_MEANING[stage]}</p>
              {items.map((p) => (
                <article
                  key={p.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)}
                  onClick={() => navigate(`project-${p.id}`, { transition: false })}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`project-${p.id}`, { transition: false })}
                  tabIndex={0}
                  className="card group cursor-grab p-3 transition-[border-color,transform] duration-300 hover:border-hairline-strong active:cursor-grabbing"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm leading-5 text-mist">{p.name}</p>
                    <MoveMenu p={p} />
                  </div>
                  <p className="mt-1 text-xs text-text-3">{p.client}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <AvatarStack ids={p.teamIds} size={22} max={3} />
                    <span className={`text-xs ${p.health === 'At risk' ? 'text-yellow-500' : 'text-text-4'}`}>{p.health === 'At risk' ? 'At risk · ' : ''}{formatDate(p.due)}</span>
                  </div>
                </article>
              ))}
              {!items.length && <p className="mx-2 rounded-xl border border-dashed border-hairline px-3 py-6 text-center text-xs text-text-4">Drop a project here</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListView({ list }: { list: Project[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'updatedAt', dir: -1 });
  const sorted = useMemo(() => {
    const s = [...list];
    s.sort((a, b) => {
      const va = sort.key === 'stage' ? STAGES.indexOf(a.stage) : (a[sort.key] as string | number);
      const vb = sort.key === 'stage' ? STAGES.indexOf(b.stage) : (b[sort.key] as string | number);
      return va < vb ? -sort.dir : va > vb ? sort.dir : 0;
    });
    return s;
  }, [list, sort]);
  const H = ({ k, label, className = '' }: { k: SortKey; label: string; className?: string }) => (
    <th className={`px-3 py-3 text-left font-normal ${className}`} aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button className="inline-flex items-center gap-1 text-text-3 hover:text-mist" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label}
        {sort.key === k ? (sort.dir === 1 ? <CaretUp size={12} /> : <CaretDown size={12} />) : null}
      </button>
    </th>
  );
  return (
    <div className="thin-scroll overflow-x-auto rounded-2xl border border-hairline">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="border-b border-hairline text-xs">
          <tr>
            <H k="name" label="Project" />
            <H k="stage" label="Stage" />
            <th className="px-3 py-3 text-left font-normal text-text-3">Team</th>
            <th className="px-3 py-3 text-left font-normal text-text-3">Health</th>
            <H k="due" label="Due" />
            <H k="updatedAt" label="Updated" className="text-right" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id} className="cursor-pointer border-b border-hairline last:border-0 hover:bg-white/[0.025]" onClick={() => navigate(`project-${p.id}`, { transition: false })}>
              <td className="px-3 py-3">
                <a href={`#project-${p.id}`} onClick={(e) => e.stopPropagation()} className="text-mist hover:underline">{p.name}</a>
                <span className="block text-xs text-text-4">{p.client}</span>
              </td>
              <td className="px-3 py-3"><StageBadge stage={p.stage} /></td>
              <td className="px-3 py-3"><AvatarStack ids={p.teamIds} size={22} /></td>
              <td className={`px-3 py-3 ${p.health === 'At risk' ? 'text-yellow-500' : p.health === 'In review' ? 'text-violet-300' : 'text-text-2'}`}>{p.health}</td>
              <td className="px-3 py-3 text-text-2">{formatDate(p.due)}</td>
              <td className="px-3 py-3 text-right text-text-3">{timeAgo(p.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Timeline({ list }: { list: Project[] }) {
  const start = Date.now() - 21 * 86400000;
  const span = 56 * 86400000;
  const pos = (t: number) => Math.min(100, Math.max(0, ((t - start) / span) * 100));
  const today = pos(Date.now());
  const weeks = Array.from({ length: 9 }, (_, i) => new Date(start + i * 7 * 86400000));
  return (
    <div className="thin-scroll overflow-x-auto rounded-2xl border border-hairline p-4">
      <div className="relative min-w-[820px]">
        <div className="ml-[220px] flex justify-between pb-3 font-mono text-[11px] text-text-4">
          {weeks.map((w) => <span key={w.toISOString()}>{w.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>)}
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute bottom-0 top-0 ml-[220px] w-[calc(100%-220px)]">
            <span className="absolute bottom-0 top-0 w-px bg-cyan-500/70" style={{ left: `${today}%` }} />
            <span className="mono-label absolute -top-1 -translate-x-1/2 -translate-y-full rounded bg-cyan-500/15 px-1.5 text-cyan-500" style={{ left: `${today}%` }}>Today</span>
          </div>
          {list.map((p) => {
            const due = new Date(p.due + 'T12:00:00').getTime();
            const begin = due - (20 + (p.id.length % 5) * 4) * 86400000;
            const l = pos(begin);
            const r = pos(due);
            return (
              <button key={p.id} onClick={() => navigate(`project-${p.id}`, { transition: false })} className="flex h-12 w-full items-center border-t border-hairline text-left hover:bg-white/[0.02]">
                <span className="w-[220px] shrink-0 truncate pr-4 text-sm text-mist">{p.name}</span>
                <span className="relative h-full flex-1">
                  <span className={`absolute top-1/2 flex h-6 -translate-y-1/2 items-center overflow-hidden rounded-full border ${p.health === 'At risk' ? 'border-yellow-500/50' : 'border-violet-400/40'} bg-white/[0.04]`} style={{ left: `${l}%`, width: `${Math.max(3, r - l)}%` }}>
                    <span className="h-full bg-violet-500/50" style={{ width: `${p.progress * 100}%` }} />
                    <span className="mono-label absolute left-2 text-[10px] text-mist">{STAGE_LABEL[p.stage]}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Projects() {
  const projects = useApp((s) => s.projects);
  const [view, setView] = useState<View>('board');
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState('all');
  const [status, setStatus] = useState('all');
  const members = useApp((s) => s.members);
  const canCreate = roleCan(useRole(), 'editor');
  const list = projects.filter((p) => (owner === 'all' || p.ownerId === owner) && (status === 'all' || (status === 'live' ? !!p.published : p.health === status)) && (p.name + p.client + p.description).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 md:px-8 md:py-10">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-light tracking-[-0.02em] text-mist md:text-4xl">Projects</h1>
          <p className="mt-1 text-sm text-text-3">{projects.length} projects across six stages. Drag a card, or use its menu, to move it.</p>
        </div>
        {canCreate && <Button variant="primary" icon={<Plus size={16} weight="bold" />} onClick={() => navigate('start', { transition: false })}>New project</Button>}
      </header>
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex h-10 items-center gap-2 rounded-full border border-hairline bg-white/[0.02] px-3 focus-within:border-violet-400/60">
            <MagnifyingGlass size={16} className="text-text-3" />
            <span className="sr-only">Search projects</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" className="w-48 bg-transparent text-sm text-mist placeholder:text-text-4 focus:outline-none" />
          </label>
          <label className="flex h-10 items-center gap-2 rounded-full border border-hairline bg-white/[0.02] px-3 text-sm text-text-2">
            <span className="text-text-3">Created by</span>
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className="bg-transparent text-mist focus:outline-none">
              <option value="all" className="bg-graphite">Everyone</option>
              {members.map((p) => <option key={p.id} value={p.id} className="bg-graphite">{p.name}</option>)}
            </select>
          </label>
          <label className="flex h-10 items-center gap-2 rounded-full border border-hairline bg-white/[0.02] px-3 text-sm text-text-2">
            <span className="text-text-3">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-transparent text-mist focus:outline-none">
              {[['all', 'Any'], ['On track', 'On track'], ['In review', 'In review'], ['At risk', 'At risk'], ['live', 'Published']].map(([v, l]) => <option key={v} value={v} className="bg-graphite">{l}</option>)}
            </select>
          </label>
        </div>
        <Segmented<View>
          label="View"
          value={view}
          onChange={setView}
          options={[
            { id: 'board', label: 'Board', icon: <Kanban size={14} /> },
            { id: 'list', label: 'List', icon: <ListBullets size={14} /> },
            { id: 'timeline', label: 'Timeline', icon: <ChartBar size={14} /> },
          ]}
        />
      </div>
      <div className="mt-6">
        {projects.length === 0 ? (
          <EmptyState title="No projects yet" body="Describe an idea and Muse will propose three directions to start from." action={canCreate ? <Button variant="primary" onClick={() => navigate('start', { transition: false })}>Start your first project</Button> : undefined} />
        ) : list.length === 0 ? (
          <EmptyState title="No projects match" body={`Nothing ${q ? `for “${q}” ` : ''}${owner !== 'all' ? `created by ${personById(owner).name} ` : ''}with these filters. Clear them or start something new.`} action={<Button onClick={() => { setQ(''); setOwner('all'); setStatus('all'); }}>Clear filters</Button>} />
        ) : view === 'board' ? <Board list={list} /> : view === 'list' ? <ListView list={list} /> : <Timeline list={list} />}
      </div>
    </div>
  );
}
