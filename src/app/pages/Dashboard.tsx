import { useMemo } from 'react';
import { ArrowRight, Sparkle, Plus, ChatCircle, RocketLaunch, PencilSimple, Lightning } from '@phosphor-icons/react';
import { useApp } from '../../data/store';
import { me } from '../../data/seed';
import { stageWide, stageImage } from '../../data/assets';
import { navigate } from '../../lib/router';
import { Button } from '../../components/Button';
import { Avatar, AvatarStack, StageBadge, timeAgo, formatDate, personById } from '../components/bits';
import SpotlightCard from '../../components/reactbits/SpotlightCard';
import { STAGE_LABEL } from '../../lib/tokens';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const ICON = { muse: Sparkle, edit: PencilSimple, publish: RocketLaunch, comment: ChatCircle, create: Plus };

export default function Dashboard() {
  const projects = useApp((s) => s.projects);
  const activity = useApp((s) => s.activity);
  const proposals = useApp((s) => s.proposals);
  const lastId = useApp((s) => s.lastProjectId);
  const send = useApp((s) => s.sendToMuse);
  const setMuse = useApp((s) => s.setMuseOpen);
  const sorted = useMemo(() => [...projects].sort((a, b) => b.updatedAt - a.updatedAt), [projects]);
  const current = projects.find((p) => p.id === lastId) ?? sorted[0];
  const live = projects.filter((p) => p.published).length;
  const pending = proposals.filter((p) => p.status === 'pending').length;
  const accepted = 38 + proposals.filter((p) => p.status === 'accepted').length;
  const atRisk = projects.filter((p) => p.health === 'At risk');

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 md:px-8 md:py-10">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mono-label text-text-3">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="mt-2 text-4xl font-light tracking-[-0.02em] text-mist md:text-5xl">{greeting()}, {me.name.split(' ')[0]}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Sparkle size={16} className="text-violet-400" />} onClick={() => setMuse(true)}>Ask Muse</Button>
          <Button variant="primary" icon={<Plus size={16} weight="bold" />} onClick={() => navigate('start', { transition: false })}>New project</Button>
        </div>
      </header>

      {/* continue + stats */}
      <section className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        {current && (
          <SpotlightCard className="p-0" spotlightColor="#a48dff" intensity={0.1}>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.1fr]">
              <div className="flex flex-col justify-between gap-6 p-6">
                <div>
                  <p className="mono-label text-text-3">Continue where you left off</p>
                  <h2 className="mt-3 text-2xl font-normal text-mist">{current.name}</h2>
                  <p className="mt-2 text-sm leading-6 text-text-3">{current.description}</p>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-text-3">
                    <StageBadge stage={current.stage} />
                    <span>{Math.round(current.progress * 100)}% · due {formatDate(current.due)}</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-hairline">
                    <div className="h-full rounded-full bg-violet-500 transition-[width] duration-700" style={{ width: `${current.progress * 100}%` }} />
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button variant="primary" iconRight={<ArrowRight size={16} />} onClick={() => navigate(`project-${current.id}`, { transition: false })}>Open canvas</Button>
                    <Button variant="tertiary" onClick={() => navigate(`launch-${current.id}`, { transition: false })}>Preview</Button>
                  </div>
                </div>
              </div>
              <div className="relative min-h-[220px] overflow-hidden sm:rounded-r-3xl">
                <img src={stageWide[current.stage]} alt={`${current.name} in the ${STAGE_LABEL[current.stage]} stage`} className="absolute inset-0 h-full w-full object-cover" />
                <span className="absolute bottom-3 right-3"><AvatarStack ids={current.teamIds} size={26} /></span>
              </div>
            </div>
          </SpotlightCard>
        )}
        <div className="grid grid-cols-2 gap-4">
          {[
            { k: 'Active projects', v: projects.filter((p) => !p.published).length, s: `${atRisk.length} at risk` },
            { k: 'Live experiences', v: live, s: 'on aether.site' },
            { k: 'Muse changes accepted', v: accepted, s: 'this month' },
            { k: 'Waiting for review', v: pending, s: pending ? 'open Muse to decide' : 'all clear' },
          ].map((st) => (
            <div key={st.k} className="card flex flex-col justify-between p-5">
              <p className="text-xs text-text-3">{st.k}</p>
              <p className="mt-3 font-mono text-3xl tabular-nums text-mist">{st.v}</p>
              <p className="mt-1 text-xs text-text-4">{st.s}</p>
            </div>
          ))}
        </div>
      </section>

      {/* projects as living Cores */}
      <section className="mt-12" aria-labelledby="dash-projects">
        <div className="flex items-end justify-between">
          <h2 id="dash-projects" className="text-xl font-normal text-mist">Projects</h2>
          <button onClick={() => navigate('projects', { transition: false })} className="text-sm text-text-3 hover:text-mist">View all</button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {sorted.map((p) => (
            <button key={p.id} onClick={() => navigate(`project-${p.id}`, { transition: false })} className="group text-left" data-cursor="Open">
              <div className="relative aspect-square overflow-hidden rounded-2xl border border-hairline bg-graphite">
                <img src={stageImage[p.stage]} alt="" className="h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06]" />
                {p.published && <span className="mono-label absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-cyan-500"><span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />Live</span>}
              </div>
              <p className="mt-2 truncate text-sm text-mist">{p.name}</p>
              <p className="mono-label mt-0.5 text-text-3">{STAGE_LABEL[p.stage]} · {timeAgo(p.updatedAt)}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center gap-2"><Sparkle size={16} weight="fill" className="text-violet-400" /><h2 className="text-base font-medium text-mist">Muse noticed</h2></div>
          <ul className="mt-4 flex flex-col gap-3">
            {[
              { pid: 'halden', text: 'Two comments on Halden say the hero settles too slowly.', prompt: 'The hero motion feels sleepy' },
              { pid: 'northfold', text: 'Northfold’s subheading is hard to read in sunlight on phones.', prompt: 'Improve contrast for small screens' },
              { pid: 'arclight', text: 'Arclight’s headline could lead with the outcome.', prompt: 'Tighten the headline and CTA copy' },
            ].map((s) => {
              const pr = projects.find((p) => p.id === s.pid);
              return (
                <li key={s.pid} className="flex items-start justify-between gap-4 rounded-xl border border-violet-400/25 bg-violet-500/[0.05] p-3.5">
                  <div>
                    <p className="text-sm text-mist">{s.text}</p>
                    <p className="mono-label mt-1 text-text-3">{pr?.name}</p>
                  </div>
                  <Button size="sm" variant="muse" onClick={() => { useApp.setState({ lastProjectId: s.pid }); setMuse(true); send(s.pid, s.prompt, ['@Hero frame']); }}>Get proposals</Button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2"><Lightning size={16} weight="fill" className="text-cyan-500" /><h2 className="text-base font-medium text-mist">Activity</h2></div>
          <ul className="mt-4 flex flex-col">
            {activity.slice(0, 6).map((a) => {
              const Icon = ICON[a.kind];
              return (
                <li key={a.id} className="flex items-center gap-3 border-b border-hairline py-3 last:border-0">
                  <Avatar id={a.whoId} size={28} />
                  <p className="min-w-0 flex-1 text-sm text-text-2"><span className="text-mist">{personById(a.whoId).name.split(' ')[0]}</span> {a.text}</p>
                  <Icon size={14} className="shrink-0 text-text-4" />
                  <span className="shrink-0 text-xs text-text-4">{timeAgo(a.at)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
