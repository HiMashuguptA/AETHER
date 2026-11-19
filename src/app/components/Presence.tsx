import { useEffect, useRef, useState } from 'react';
import { api } from '../../data/api';
import { hasUnsavedEdits, useApp } from '../../data/store';
import { Avatar, AvatarStack } from './bits';

interface Here { userId: string; name: string; focus: string; seenAt: number }
interface Beat { here: Here[]; lastEditor: { id: string | null; name: string } | null; revision: number }

const EVERY_MS = 15_000;

/**
 * Who else has this project open, by heartbeat. Each beat also carries the saved revision: when a
 * teammate has saved something newer and this tab holds no unsaved edits, the project reloads.
 */
export function usePresence(projectId: string, focus: string): Here[] {
  const [here, setHere] = useState<Here[]>([]);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const beat = async () => {
      clearTimeout(timer);
      if (document.visibilityState === 'visible') {
        try {
          const r = await api<Beat>('POST', `/projects/${projectId}/presence`, { focus: focusRef.current });
          if (stop) return;
          setHere(r.here);
          const app = useApp.getState();
          const local = app.projects.find((p) => p.id === projectId);
          if (local && (local.revision ?? 0) < r.revision && !hasUnsavedEdits(projectId)) {
            await app.refreshProject(projectId);
            if (r.lastEditor) app.toast({ text: `Loaded ${r.lastEditor.name.split(' ')[0]}'s latest changes.`, tone: 'neutral' });
          }
        } catch { /* offline or signed out; the next beat tries again */ }
      }
      if (!stop) timer = setTimeout(() => void beat(), EVERY_MS);
    };
    void beat();
    const onVisible = () => { if (document.visibilityState === 'visible') void beat(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      void api('POST', `/projects/${projectId}/presence`, { leaving: true }).catch(() => undefined);
    };
  }, [projectId]);
  return here;
}

const FOCUS_LABEL: Record<string, string> = { design: 'in Design', motion: 'in Motion', space: 'in Space' };

/** Teammates here now first, ringed in green; the rest of the team after them. */
export function PresenceStack({ here, teamIds }: { here: Here[]; teamIds: string[] }) {
  if (!here.length) return <AvatarStack ids={teamIds} size={26} />;
  const names = here.map((h) => `${h.name}${FOCUS_LABEL[h.focus] ? ` ${FOCUS_LABEL[h.focus]}` : ''}`).join(', ');
  return (
    <span className="flex items-center gap-2" role="status" aria-label={`Here now: ${names}`} title={`Here now: ${names}`}>
      <span className="flex -space-x-1.5">
        {here.slice(0, 3).map((h) => (
          <span key={h.userId} className="relative rounded-full" style={{ boxShadow: '0 0 0 2px #34b27f' }}>
            <Avatar id={h.userId} size={26} />
          </span>
        ))}
      </span>
      <span className="mono-label text-green-500">{here.length === 1 ? '1 here' : `${here.length} here`}</span>
    </span>
  );
}
