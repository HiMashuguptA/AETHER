import { Sparkle, PencilSimple, RocketLaunch, ChatCircle, Plus } from '@phosphor-icons/react';
import { useApp } from '../../data/store';
import { Avatar, personById, timeAgo, EmptyState } from '../components/bits';
import { navigate } from '../../lib/router';

const ICON = { muse: Sparkle, edit: PencilSimple, publish: RocketLaunch, comment: ChatCircle, create: Plus };

export default function ActivityPage() {
  const activity = useApp((s) => s.activity);
  const projects = useApp((s) => s.projects);
  return (
    <div className="mx-auto max-w-[880px] px-4 py-8 md:px-8 md:py-10">
      <h1 className="text-3xl font-light tracking-[-0.02em] text-mist md:text-4xl">Activity</h1>
      <p className="mt-1 text-sm text-text-3">Everything that changed across the workspace, newest first.</p>
      {activity.length === 0 ? (
        <div className="mt-8"><EmptyState title="Quiet so far" body="Edits, Muse decisions and launches will appear here." /></div>
      ) : (
        <ol className="mt-8 flex flex-col">
          {activity.map((a) => {
            const Icon = ICON[a.kind];
            const p = projects.find((x) => x.id === a.projectId);
            return (
              <li key={a.id} className="flex gap-4 border-b border-hairline py-4 last:border-0">
                <Avatar id={a.whoId} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-2"><span className="text-mist">{personById(a.whoId).name}</span> {a.text}</p>
                  {p && <button onClick={() => navigate(`project-${p.id}`, { transition: false })} className="mt-1 text-xs text-violet-300 hover:text-violet-200">{p.name}</button>}
                </div>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-hairline ${a.kind === 'muse' ? 'text-violet-400' : a.kind === 'publish' ? 'text-cyan-500' : 'text-text-3'}`}><Icon size={14} /></span>
                <span className="w-20 shrink-0 text-right text-xs text-text-4">{timeAgo(a.at)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
