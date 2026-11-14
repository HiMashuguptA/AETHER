import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkle, X, Check, ArrowUp, ArrowsLeftRight, At } from '@phosphor-icons/react';
import { useApp } from '../../data/store';
import type { Proposal } from '../../data/types';
import { Button } from '../../components/Button';
import { navigate } from '../../lib/router';

const SUGGESTIONS = ['Make the hero bolder', 'The hero motion feels sleepy', 'Improve contrast for small screens', 'Tighten the headline and CTA copy', 'Add more violet rim light to the 3D Core'];
const CONTEXT = ['@Hero frame', '@Motion', '@Brand kit', '@Space'];

export function ProposalCard({ p, compact = false }: { p: Proposal; compact?: boolean }) {
  const accept = useApp((s) => s.accept);
  const reject = useApp((s) => s.reject);
  const [compare, setCompareLocal] = useState(false);
  const setComparing = useApp((s) => s.setComparing);
  const setCompare = (v: boolean) => { setCompareLocal(v); setComparing(v); };
  const pending = p.status === 'pending';
  return (
    <div className={`rounded-2xl border p-3.5 transition-colors duration-300 ${pending ? 'border-violet-400/45 bg-violet-500/[0.06]' : 'border-hairline bg-white/[0.02]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-mist">{p.title}</p>
          <p className="mt-0.5 font-mono text-xs text-text-3">
            {compare ? <span className="text-mist">{p.from}</span> : <>{p.from} → <span className={pending ? 'text-violet-300' : 'text-mist'}>{p.to}</span></>}
          </p>
        </div>
        {pending ? (
          <span className="mono-label shrink-0 text-violet-400">Proposed</span>
        ) : (
          <span className={`mono-label shrink-0 ${p.status === 'accepted' ? 'text-green-500' : 'text-text-4'}`}>{p.status === 'accepted' ? 'Accepted' : 'Rejected'}</span>
        )}
      </div>
      {!compact && <p className="mt-2 text-xs leading-5 text-text-3">{p.rationale}</p>}
      {pending && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" icon={<Check size={14} weight="bold" />} onClick={() => accept(p.id)}>Accept</Button>
          <Button size="sm" variant="secondary" icon={<X size={14} />} onClick={() => reject(p.id)}>Reject</Button>
          <Button size="sm" variant="tertiary" icon={<ArrowsLeftRight size={14} />} onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)} onKeyDown={(e) => e.key === ' ' && setCompare(true)} onKeyUp={() => setCompare(false)} aria-label="Hold to see your current version">
            Hold to compare
          </Button>
        </div>
      )}
    </div>
  );
}

/** Muse: the AI collaborator. It proposes; people decide. */
export default function MusePanel({ projectId }: { projectId?: string }) {
  const open = useApp((s) => s.museOpen);
  const setOpen = useApp((s) => s.setMuseOpen);
  const projects = useApp((s) => s.projects);
  const lastId = useApp((s) => s.lastProjectId);
  const pid = projectId ?? lastId;
  const project = projects.find((p) => p.id === pid);
  const allMessages = useApp((s) => s.messages);
  const allProposals = useApp((s) => s.proposals);
  const messages = useMemo(() => allMessages.filter((m) => m.projectId === pid), [allMessages, pid]);
  const proposals = useMemo(() => allProposals.filter((p) => p.projectId === pid), [allProposals, pid]);
  const thinking = useApp((s) => s.museThinking);
  const send = useApp((s) => s.sendToMuse);
  const acceptAll = useApp((s) => s.acceptAll);
  const rejectAll = useApp((s) => s.rejectAll);
  const [text, setText] = useState('');
  const [ctx, setCtx] = useState<string[]>(['@Hero frame']);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const pending = proposals.filter((p) => p.status === 'pending');

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [messages, proposals.length, thinking]);
  useEffect(() => { if (open) setTimeout(() => field.current?.focus(), 60); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const submit = (value = text) => {
    if (!value.trim() || !project) return;
    send(project.id, value.trim(), ctx);
    setText('');
  };

  return (
    <aside
      aria-label="Muse"
      aria-hidden={!open}
      className={`glass-strong fixed bottom-3 right-3 top-3 z-50 flex w-[min(384px,calc(100vw-24px))] flex-col rounded-3xl transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-[110%] opacity-0'}`}
    >
      <header className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/15">
            <Sparkle size={16} weight="fill" className="text-violet-400" />
            {thinking && <span className="absolute inset-0 animate-[aether-pulse_1.2s_ease-in-out_infinite] rounded-full border border-violet-400" />}
          </span>
          <div>
            <p className="text-sm font-medium text-mist">Muse</p>
            <p className="text-xs text-text-3">{project ? project.name : 'No project selected'}</p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close Muse" className="flex h-8 w-8 items-center justify-center rounded-full text-text-3 hover:bg-white/[0.06] hover:text-mist"><X size={16} /></button>
      </header>

      <div ref={scroller} className="thin-scroll flex-1 overflow-y-auto px-5 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-6 text-text-2">I can propose changes to {project ? <span className="text-mist">{project.name}</span> : 'your project'}. You review each one, and nothing is applied until you accept it.</p>
            <p className="mono-label mt-2 text-text-4">Try</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => submit(s)} className="rounded-xl border border-hairline px-3 py-2.5 text-left text-sm text-text-2 transition-colors hover:border-violet-400/50 hover:text-mist">{s}</button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-4">
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="ml-8 self-end rounded-2xl rounded-br-md bg-white/[0.07] px-3.5 py-2.5 text-sm text-mist">
                {m.context?.length ? <span className="mb-1 block font-mono text-[11px] text-violet-300">{m.context.join(' ')}</span> : null}
                {m.text}
              </div>
            ) : (
              <div key={m.id} className="flex flex-col gap-3">
                <p className="text-sm leading-6 text-text-2">{m.text}{m.streaming && <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-[aether-pulse_0.9s_ease-in-out_infinite] bg-violet-400" />}</p>
                {m.proposalIds?.map((id) => {
                  const p = proposals.find((x) => x.id === id);
                  return p ? <ProposalCard key={id} p={p} /> : null;
                })}
              </div>
            ),
          )}
          {thinking && (
            <div className="flex items-center gap-2 text-sm text-text-3">
              <span className="flex gap-1">{[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-[aether-pulse_1s_ease-in-out_infinite] rounded-full bg-violet-400" style={{ animationDelay: `${d * 160}ms` }} />)}</span>
              Muse is looking at the hero
            </div>
          )}
        </div>
      </div>

      {pending.length > 1 && (
        <div className="flex items-center justify-between gap-2 border-t border-hairline px-5 py-3">
          <span className="text-xs text-text-3">{pending.length} proposals waiting</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => project && rejectAll(project.id)}>Reject all</Button>
            <Button size="sm" variant="primary" onClick={() => project && acceptAll(project.id)}>Accept all</Button>
          </div>
        </div>
      )}

      <form className="border-t border-hairline p-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {CONTEXT.map((c) => {
            const on = ctx.includes(c);
            return (
              <button type="button" key={c} onClick={() => setCtx((v) => (on ? v.filter((x) => x !== c) : [...v, c]))} aria-pressed={on} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[11px] transition-colors ${on ? 'border-violet-400/60 bg-violet-500/10 text-violet-200' : 'border-hairline text-text-3 hover:text-mist'}`}>
                <At size={11} />{c.slice(1)}
              </button>
            );
          })}
        </div>
        <div className="flex items-end gap-2 rounded-2xl border border-hairline-strong bg-black/40 p-2 focus-within:border-violet-400/60">
          <label htmlFor="muse-input" className="sr-only">Ask Muse</label>
          <textarea
            id="muse-input"
            ref={field}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            rows={2}
            placeholder={project ? 'Describe a change. Muse will propose, you decide.' : 'Open a project first'}
            disabled={!project}
            className="thin-scroll max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-mist placeholder:text-text-4 focus:outline-none"
          />
          <Button type="submit" variant="muse" size="sm" className="!h-9 !w-9 !px-0" disabled={!text.trim() || !project} aria-label="Send to Muse"><ArrowUp size={16} weight="bold" /></Button>
        </div>
        {!projectId && project && (
          <button type="button" onClick={() => navigate(`project-${project.id}`, { transition: false })} className="mt-2 text-xs text-text-3 hover:text-mist">Open {project.name} to see proposals on the canvas</button>
        )}
      </form>
    </aside>
  );
}
