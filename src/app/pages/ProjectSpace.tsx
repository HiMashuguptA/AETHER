import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Sparkle, RocketLaunch, PaintBrush, FilmStrip, Cube, Eye, EyeSlash, Lock, LockOpen, Play, Pause,
  Desktop, DeviceTablet, DeviceMobile, ChatCircle, Stack, TextAa, Cursor, Image as ImageIcon, Rows, Square, ArrowCounterClockwise, CheckCircle, Sliders,
} from '@phosphor-icons/react';
import { useApp } from '../../data/store';
import { navigate } from '../../lib/router';
import { Button } from '../../components/Button';
import Artboard, { type Device } from '../components/Artboard';
import CoreViewport from '../components/CoreViewport';
import { AvatarStack, Segmented, StageBadge, Avatar, timeAgo, personById, EmptyState } from '../components/bits';
import { ProposalCard } from '../components/MusePanel';
import type { DesignDoc, Easing, LayerId, MotionTrack, Project, Proposal, SpaceSettings } from '../../data/types';
import { STAGES, STAGE_LABEL, type Stage } from '../../lib/tokens';
import { stageImage } from '../../data/assets';

type Mode = 'design' | 'motion' | 'space';
type SheetTab = 'timeline' | 'properties' | 'layers' | 'comments' | 'muse';

/** Portrait tablets, iPad mini to iPad Pro 12.9" held upright (matches the tablet-portrait CSS variant). */
const TABLET_PORTRAIT = '(min-width: 768px) and (max-width: 1100px) and (orientation: portrait)';

function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

const LAYERS: { id: LayerId; label: string; icon: React.ReactNode }[] = [
  { id: 'background', label: 'Background', icon: <Square size={14} /> },
  { id: 'nav', label: 'Navigation', icon: <Rows size={14} /> },
  { id: 'headline', label: 'Headline', icon: <TextAa size={14} /> },
  { id: 'subhead', label: 'Subheading', icon: <TextAa size={14} /> },
  { id: 'cta', label: 'Call to action', icon: <Cursor size={14} /> },
  { id: 'proof', label: 'Proof line', icon: <TextAa size={14} /> },
  { id: 'visual', label: '3D visual', icon: <ImageIcon size={14} /> },
];

const ACCENTS = ['#8b70ec', '#7358cc', '#3a63d8', '#62c8d9', '#f2f2f3', '#e8b83e'];
const TONES = ['#f2f2f3', '#c4c5cb', '#8c8d93'];
const SIZES = [36, 48, 60, 72, 96];
const RADII = [0, 4, 8, 12, 16, 24, 999];
const SPACING = [16, 24, 32, 40];
const EASINGS: Easing[] = ['aether-out', 'aether-in-out', 'aether-expo', 'linear'];
const CURVE: Record<Easing, [number, number, number, number]> = {
  'aether-out': [0.22, 1, 0.36, 1],
  'aether-in-out': [0.65, 0, 0.35, 1],
  'aether-expo': [0.16, 1, 0.3, 1],
  linear: [0, 0, 1, 1],
};

function applyPending(p: Project, pending: Proposal[]) {
  let doc: DesignDoc = p.doc;
  let motion: MotionTrack[] = p.motion;
  let space: SpaceSettings = p.space;
  for (const pr of pending) {
    const c = pr.change;
    if (c.scope === 'doc') doc = { ...doc, [c.key]: c.value };
    else if (c.scope === 'space') space = { ...space, [c.key]: c.value };
    else motion = motion.map((t) => (t.id === c.track ? { ...t, [c.key]: c.value } : t));
  }
  return { doc, motion, space };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-text-3">{label}</span>
      {children}
    </div>
  );
}

function Chips<T extends string | number>({ value, options, onChange, render, label }: { value: T; options: T[]; onChange: (v: T) => void; render?: (v: T) => React.ReactNode; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={String(o)} role="radio" aria-checked={value === o} onClick={() => onChange(o)} className={`h-8 min-w-8 rounded-lg border px-2 font-mono text-xs transition-colors touch:h-10 touch:min-w-10 ${value === o ? 'border-violet-400/70 bg-violet-500/10 text-mist' : 'border-hairline text-text-3 hover:text-mist'}`}>
          {render ? render(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, format = (v) => v.toFixed(2) }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex justify-between text-xs text-text-3"><span>{label}</span><span className="font-mono text-text-2">{format(value)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-[#8b70ec]" />
    </label>
  );
}

function CurvePreview({ easing }: { easing: Easing }) {
  const [a, b, c, d] = CURVE[easing];
  return (
    <svg viewBox="0 0 100 60" className="h-[60px] w-full rounded-lg border border-hairline bg-black/40" aria-label={`${easing} curve`}>
      <path d="M4 56 L96 4" stroke="#313131" strokeDasharray="3 3" fill="none" />
      <path d={`M4 56 C${4 + a * 92} ${56 - b * 52} ${4 + c * 92} ${56 - d * 52} 96 4`} stroke="#a48dff" strokeWidth="2" fill="none" />
    </svg>
  );
}

function DesignInspector({ p, layer }: { p: Project; layer: LayerId }) {
  const update = useApp((s) => s.updateDoc);
  const set = (patch: Partial<DesignDoc>) => update(p.id, patch);
  const d = p.doc;
  const locked = d.locked[layer];
  if (locked) return <p className="text-sm text-text-3">This layer is locked. Unlock it in the layers panel to edit.</p>;
  return (
    <div className="flex flex-col gap-5">
      {layer === 'headline' && (
        <>
          <Field label="Text"><textarea value={d.headline} onChange={(e) => set({ headline: e.target.value })} rows={3} className="resize-none rounded-lg border border-hairline bg-black/40 p-2.5 text-sm text-mist focus:border-violet-400/60 focus:outline-none" /></Field>
          <Field label="Size (type scale)"><Chips label="Headline size" value={d.headlineSize} options={SIZES} onChange={(v) => set({ headlineSize: v })} /></Field>
          <Field label="Alignment"><Chips label="Alignment" value={d.align} options={['left', 'center'] as const as unknown as ('left' | 'center')[]} onChange={(v) => set({ align: v })} /></Field>
        </>
      )}
      {layer === 'subhead' && (
        <>
          <Field label="Text"><textarea value={d.subhead} onChange={(e) => set({ subhead: e.target.value })} rows={4} className="resize-none rounded-lg border border-hairline bg-black/40 p-2.5 text-sm text-mist focus:border-violet-400/60 focus:outline-none" /></Field>
          <Field label="Tone"><Chips label="Tone" value={d.subheadTone} options={TONES} onChange={(v) => set({ subheadTone: v })} render={(v) => <span className="inline-block h-4 w-4 rounded-full align-middle" style={{ background: v }} />} /></Field>
        </>
      )}
      {layer === 'cta' && (
        <>
          <Field label="Label"><input value={d.cta} onChange={(e) => set({ cta: e.target.value })} className="h-9 rounded-lg border border-hairline bg-black/40 px-2.5 text-sm text-mist focus:border-violet-400/60 focus:outline-none" /></Field>
          <Field label="Accent"><Chips label="Accent" value={d.accent} options={ACCENTS} onChange={(v) => set({ accent: v })} render={(v) => <span className="inline-block h-4 w-4 rounded-full align-middle" style={{ background: v }} />} /></Field>
          <Field label="Radius"><Chips label="Radius" value={d.radius} options={RADII} onChange={(v) => set({ radius: v })} render={(v) => (v === 999 ? 'full' : String(v))} /></Field>
        </>
      )}
      {layer === 'proof' && <Field label="Text"><input value={d.proof} onChange={(e) => set({ proof: e.target.value })} className="h-9 rounded-lg border border-hairline bg-black/40 px-2.5 text-sm text-mist focus:border-violet-400/60 focus:outline-none" /></Field>}
      {layer === 'nav' && <Field label="Links (comma separated)"><input value={d.nav.join(', ')} onChange={(e) => set({ nav: e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 4) })} className="h-9 rounded-lg border border-hairline bg-black/40 px-2.5 text-sm text-mist focus:border-violet-400/60 focus:outline-none" /></Field>}
      {layer === 'visual' && (
        <Field label="Core state">
          <div className="grid grid-cols-3 gap-1.5">
            {STAGES.map((s) => (
              <button key={s} onClick={() => set({ visual: s })} aria-pressed={d.visual === s} className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[11px] ${d.visual === s ? 'border-violet-400/70 text-mist' : 'border-hairline text-text-3'}`}>
                <img src={stageImage[s]} alt="" className="h-10 w-10 rounded-md object-cover" />{STAGE_LABEL[s]}
              </button>
            ))}
          </div>
        </Field>
      )}
      {layer === 'background' && (
        <>
          <Field label="Theme"><Chips label="Theme" value={d.theme} options={['obsidian', 'graphite', 'mist'] as DesignDoc['theme'][]} onChange={(v) => set({ theme: v })} /></Field>
          <Field label="Spacing"><Chips label="Spacing" value={d.spacing} options={SPACING} onChange={(v) => set({ spacing: v })} /></Field>
        </>
      )}
    </div>
  );
}

function MotionInspector({ p, layer }: { p: Project; layer: LayerId }) {
  const update = useApp((s) => s.updateTrack);
  const t = p.motion.find((x) => x.id === layer);
  if (!t) return <p className="text-sm text-text-3">The background has no entrance animation. Pick a layer with a track.</p>;
  const set = (patch: Partial<MotionTrack>) => update(p.id, t.id, patch);
  return (
    <div className="flex flex-col gap-5">
      <Slider label="Start" value={t.start} min={0} max={2} step={0.05} onChange={(v) => set({ start: v })} format={(v) => `${v.toFixed(2)} s`} />
      <Slider label="Duration" value={t.duration} min={0.2} max={2.4} step={0.05} onChange={(v) => set({ duration: v })} format={(v) => `${v.toFixed(2)} s`} />
      <Field label="Easing">
        <select value={t.easing} onChange={(e) => set({ easing: e.target.value as Easing })} className="h-9 rounded-lg border border-hairline bg-black/40 px-2 text-sm text-mist focus:outline-none">
          {EASINGS.map((e) => <option key={e} value={e} className="bg-graphite">{e}</option>)}
        </select>
        <CurvePreview easing={t.easing} />
      </Field>
      <Slider label="Rise from" value={t.fromY} min={-40} max={60} step={2} onChange={(v) => set({ fromY: v })} format={(v) => `${v} px`} />
      <Slider label="Blur from" value={t.fromBlur} min={0} max={20} step={1} onChange={(v) => set({ fromBlur: v })} format={(v) => `${v} px`} />
    </div>
  );
}

function SpaceInspector({ p }: { p: Project }) {
  const update = useApp((s) => s.updateSpace);
  const s = p.space;
  const set = (patch: Partial<SpaceSettings>) => update(p.id, patch);
  return (
    <div className="flex flex-col gap-5">
      <Field label="Shape">
        <div className="grid grid-cols-2 gap-1.5">
          {(['drop', 'form', 'lattice', 'orbit'] as Stage[]).map((st, i) => (
            <button key={st} onClick={() => set({ morph: i + 1 })} aria-pressed={Math.round(s.morph) === i + 1} className={`flex items-center gap-2 rounded-lg border p-1.5 text-xs ${Math.round(s.morph) === i + 1 ? 'border-violet-400/70 text-mist' : 'border-hairline text-text-3'}`}>
              <img src={stageImage[st]} alt="" className="h-7 w-7 rounded-md object-cover" />{STAGE_LABEL[st]}
            </button>
          ))}
        </div>
      </Field>
      <Slider label="Morph" value={s.morph} min={1} max={4} step={0.01} onChange={(v) => set({ morph: v })} />
      <Slider label="Roughness" value={s.roughness} min={0} max={0.3} step={0.01} onChange={(v) => set({ roughness: v })} />
      <Slider label="Key light" value={s.key} min={0.2} max={1.6} step={0.01} onChange={(v) => set({ key: v })} />
      <Slider label="Violet rim" value={s.violet} min={0} max={2} step={0.01} onChange={(v) => set({ violet: v })} />
      <Slider label="Cobalt fill" value={s.cobalt} min={0} max={2} step={0.01} onChange={(v) => set({ cobalt: v })} />
      <Slider label="Thin film" value={s.film} min={0} max={1.5} step={0.01} onChange={(v) => set({ film: v })} />
      <Slider label="Idle spin" value={s.spin} min={0} max={1} step={0.01} onChange={(v) => set({ spin: v })} />
    </div>
  );
}

function Timeline({ p, selected, onSelect, time, setTime, playing, setPlaying }: { p: Project; selected: LayerId; onSelect: (l: LayerId) => void; time: number; setTime: (t: number) => void; playing: boolean; setPlaying: (v: boolean) => void }) {
  const update = useApp((s) => s.updateTrack);
  const TOTAL = 3;
  const area = useRef<HTMLDivElement>(null);
  const drag = (e: React.PointerEvent, t: MotionTrack, kind: 'move' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(t.id);
    const w = area.current?.clientWidth ?? 600;
    const x0 = e.clientX;
    const s0 = t.start;
    const d0 = t.duration;
    const move = (ev: PointerEvent) => {
      const dt = ((ev.clientX - x0) / w) * TOTAL;
      if (kind === 'move') update(p.id, t.id, { start: Math.max(0, Math.min(TOTAL - t.duration, Math.round((s0 + dt) * 20) / 20)) });
      else update(p.id, t.id, { duration: Math.max(0.2, Math.min(TOTAL - t.start, Math.round((d0 + dt) * 20) / 20)) });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const scrub = (e: React.PointerEvent) => {
    const el = area.current;
    if (!el) return;
    setPlaying(false);
    const set = (cx: number) => { const r = el.getBoundingClientRect(); setTime(Math.max(0, Math.min(TOTAL, ((cx - r.left) / r.width) * TOTAL))); };
    set(e.clientX);
    const move = (ev: PointerEvent) => set(ev.clientX);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="border-t border-hairline bg-[#0c0c0e] px-4 pb-4 pt-3">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" icon={playing ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />} onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</Button>
        <span className="font-mono text-xs tabular-nums text-text-2">{time.toFixed(2)} s / {TOTAL.toFixed(2)} s</span>
        <span className="hidden text-xs text-text-4 sm:inline">Drag a bar to move it, its edge to change duration, the ruler to scrub</span>
      </div>
      <div className="mt-3 flex gap-3">
        <div className="w-[140px] shrink-0 tablet-portrait:w-[112px]">
          <div className="h-6 touch:h-8" />
          {p.motion.map((t) => (
            <button key={t.id} onClick={() => onSelect(t.id)} className={`block h-8 w-full truncate border-t border-hairline text-left text-xs touch:h-11 ${selected === t.id ? 'text-mist' : 'text-text-3'}`}>{t.label}</button>
          ))}
        </div>
        <div className="relative flex-1">
          <div ref={area} className="relative h-6 cursor-ew-resize touch-none select-none touch:h-8" onPointerDown={scrub} aria-label="Timeline ruler">
            {Array.from({ length: 13 }, (_, i) => (
              <span key={i} className="absolute bottom-0 flex flex-col items-center" style={{ left: `${(i / 12) * 100}%` }}>
                {i % 4 === 0 && <span className="mb-0.5 -translate-x-1/2 font-mono text-[10px] text-text-4">{(i * 0.25).toFixed(1)}</span>}
                <span className={`w-px ${i % 4 === 0 ? 'h-2 bg-text-4' : 'h-1 bg-hairline-strong'}`} />
              </span>
            ))}
          </div>
          {p.motion.map((t) => (
            <div key={t.id} className="relative h-8 border-t border-hairline touch:h-11">
              <div
                className={`absolute top-1.5 flex h-5 cursor-grab touch-none items-center rounded-md border text-[10px] active:cursor-grabbing touch:top-2 touch:h-7 ${selected === t.id ? 'border-violet-400 bg-violet-500/40' : 'border-violet-400/30 bg-violet-500/15'}`}
                style={{ left: `${(t.start / TOTAL) * 100}%`, width: `${(t.duration / TOTAL) * 100}%` }}
                onPointerDown={(e) => drag(e, t, 'move')}
                role="slider"
                aria-label={`${t.label} timing`}
                aria-valuemin={0}
                aria-valuemax={TOTAL}
                aria-valuenow={t.start}
                aria-valuetext={`starts ${t.start.toFixed(2)} s, lasts ${t.duration.toFixed(2)} s`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') update(p.id, t.id, { start: Math.min(TOTAL - t.duration, t.start + 0.05) });
                  if (e.key === 'ArrowLeft') update(p.id, t.id, { start: Math.max(0, t.start - 0.05) });
                }}
              >
                <span className="truncate px-1.5 font-mono text-mist/80">{t.easing}</span>
                <span className="absolute -right-1 top-0 h-full w-2.5 cursor-ew-resize rounded-r-md touch:-right-3 touch:w-6" onPointerDown={(e) => drag(e, t, 'end')} aria-hidden="true" />
              </div>
            </div>
          ))}
          <span className="pointer-events-none absolute bottom-0 top-0 w-px bg-cyan-500 shadow-[0_0_8px_#62c8d9]" style={{ left: `${(time / TOTAL) * 100}%` }} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function MobileReview({ p, view }: { p: Project; view: ReturnType<typeof applyPending> }) {
  const allProposals = useApp((s) => s.proposals);
  const pending = useMemo(() => allProposals.filter((x) => x.projectId === p.id && x.status === 'pending'), [allProposals, p.id]);
  const add = useApp((s) => s.addComment);
  const [tab, setTab] = useState<'muse' | 'comments'>(pending.length ? 'muse' : 'comments');
  const [text, setText] = useState('');
  const marked = Object.fromEntries(pending.filter((x) => x.change.scope === 'doc').map((x) => [x.target, true]));
  return (
    <div className="px-4 py-5">
      <button onClick={() => navigate('projects', { transition: false })} className="flex items-center gap-1.5 text-sm text-text-3"><ArrowLeft size={14} /> Projects</button>
      <h1 className="mt-3 text-2xl font-light text-mist">{p.name}</h1>
      <div className="mt-2 flex items-center gap-2"><StageBadge stage={p.stage} /><AvatarStack ids={p.teamIds} size={22} /></div>
      <div className="mt-5 overflow-hidden rounded-2xl border border-hairline">
        <Artboard doc={view.doc} name={p.client} device="mobile" marked={marked} />
      </div>
      <p className="mt-3 text-xs text-text-4">Reviewing on a phone. Full editing works on tablet and desktop.</p>
      <div className="mt-5"><Segmented label="Review" value={tab} onChange={setTab} options={[{ id: 'muse', label: `Muse (${pending.length})` }, { id: 'comments', label: `Comments (${p.comments.filter((c) => !c.resolved).length})` }]} /></div>
      <div className="mt-4 flex flex-col gap-3">
        {tab === 'muse' ? (
          pending.length ? pending.map((pr) => <ProposalCard key={pr.id} p={pr} compact />) : <EmptyState title="Nothing to review" body="Ask Muse from the tab bar and its proposals will wait here for your decision." />
        ) : (
          <>
            {p.comments.map((c) => (
              <div key={c.id} className="card flex gap-3 p-3"><Avatar id={c.authorId} size={26} /><div><p className="text-sm text-mist">{c.text}</p><p className="mt-1 text-xs text-text-4">{personById(c.authorId).name} · {timeAgo(c.at)}</p></div></div>
            ))}
            <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { add(p.id, text.trim(), 'headline'); setText(''); } }} className="flex gap-2">
              <label htmlFor="m-comment" className="sr-only">Add a comment</label>
              <input id="m-comment" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" className="h-11 flex-1 rounded-full border border-hairline-strong bg-white/[0.03] px-4 text-sm text-mist focus:outline-none" />
              <Button type="submit" variant="primary" disabled={!text.trim()}>Post</Button>
            </form>
          </>
        )}
      </div>
      <Button variant="secondary" className="mt-6 w-full" icon={<RocketLaunch size={16} />} onClick={() => navigate(`launch-${p.id}`, { transition: false })}>Launch status</Button>
    </div>
  );
}

export default function ProjectSpace({ id }: { id: string }) {
  const project = useApp((s) => s.projects.find((p) => p.id === id));
  const allProposals = useApp((s) => s.proposals);
  const pending = useMemo(() => allProposals.filter((x) => x.projectId === id && x.status === 'pending'), [allProposals, id]);
  const comparing = useApp((s) => s.comparing);
  const setMuse = useApp((s) => s.setMuseOpen);
  const museOpen = useApp((s) => s.museOpen);
  const touch = useApp((s) => s.touch);
  const updateDoc = useApp((s) => s.updateDoc);
  const addComment = useApp((s) => s.addComment);
  const resolve = useApp((s) => s.resolveComment);
  const [mode, setMode] = useState<Mode>('design');
  const [layer, setLayer] = useState<LayerId>('headline');
  const [device, setDevice] = useState<Device>('desktop');
  const [panel, setPanel] = useState<'layers' | 'comments'>('layers');
  const [playToken, setPlayToken] = useState(0);
  const [time, setTime] = useState(3);
  const [playing, setPlaying] = useState(false);
  const [comment, setComment] = useState('');
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  const tabletPortrait = useMedia(TABLET_PORTRAIT);
  const [sheetTab, setSheetTab] = useState<SheetTab>('properties');
  const [sheet, setSheet] = useState(46); // % of the area under the header
  const stack = useRef<HTMLDivElement>(null);

  // drag the sheet's handle to resize it; a tap steps through the sizes
  const startSheetDrag = (e: React.PointerEvent) => {
    const el = stack.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height || 1;
    const y0 = e.clientY;
    const s0 = sheet;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - y0;
      if (Math.abs(dy) > 4) moved = true;
      setSheet(Math.min(74, Math.max(28, s0 - (dy / h) * 100)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) setSheet((v) => (v < 40 ? 46 : v < 60 ? 70 : 32));
      else setSheet((v) => [32, 46, 70].reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a)));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  useEffect(() => { touch(id); }, [id, touch]);
  useEffect(() => {
    const on = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  // play the motion timeline in real time
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const t0 = performance.now() - (time >= 3 ? 0 : time * 1000);
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      if (t >= 3) { setTime(3); setPlaying(false); return; }
      setTime(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const view = useMemo(() => (project ? (comparing ? { doc: project.doc, motion: project.motion, space: project.space } : applyPending(project, pending)) : null), [project, pending, comparing]);
  if (!project || !view) {
    return <div className="p-10"><EmptyState title="This project isn’t here" body="It may have been removed, or the link is from another workspace." action={<Button onClick={() => navigate('projects', { transition: false })}>All projects</Button>} /></div>;
  }
  if (mobile) return <MobileReview p={project} view={view} />;

  const marked: Partial<Record<LayerId, boolean>> = comparing ? {} : Object.fromEntries(pending.filter((x) => x.change.scope === 'doc' || x.change.scope === 'motion').map((x) => [x.change.scope === 'motion' ? (x.change as { track: LayerId }).track : x.target, true]));
  const showMotion = mode === 'motion';
  const previewProject = { ...project, doc: view.doc, motion: view.motion, space: view.space };
  const layerLabel = LAYERS.find((l) => l.id === layer)?.label;

  const changeMode = (m: Mode) => {
    setMode(m);
    if (m === 'motion') { setTime(0); setPlaying(true); }
    setSheetTab(m === 'motion' ? 'timeline' : 'properties');
  };
  const selectFromCanvas = (l: LayerId) => {
    setLayer(l);
    if (sheetTab === 'layers') setSheetTab('properties');
  };
  const reviewMuse = () => (tabletPortrait ? (setSheetTab('muse'), setSheet((v) => Math.max(v, 48))) : setMuse(true));

  // ---------- shared pieces (desktop panels and the portrait-tablet sheet use the same parts) ----------
  const header = (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-hairline px-4">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={() => navigate('projects', { transition: false })} aria-label="Back to projects" className="flex h-9 w-9 items-center justify-center rounded-full text-text-3 hover:bg-white/[0.06] hover:text-mist touch:h-11 touch:w-11"><ArrowLeft size={16} /></button>
        <div className="min-w-0 max-w-[220px] lg:max-w-[320px]">
          <p className="truncate text-sm text-mist">{project.name}</p>
          <p className="hidden truncate text-xs text-text-4 lg:block tablet-portrait:hidden">{project.client}</p>
        </div>
        <span className="hidden lg:inline-flex tablet-portrait:hidden"><StageBadge stage={project.stage} /></span>
      </div>
      <Segmented<Mode>
        label="Canvas mode"
        value={mode}
        onChange={changeMode}
        options={[
          { id: 'design', label: 'Design', icon: <PaintBrush size={14} /> },
          { id: 'motion', label: 'Motion', icon: <FilmStrip size={14} /> },
          { id: 'space', label: 'Space', icon: <Cube size={14} /> },
        ]}
      />
      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-2 lg:flex tablet-portrait:hidden"><AvatarStack ids={project.teamIds} size={26} /><span className="flex items-center gap-1 text-xs text-text-4"><span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />{project.teamIds.length > 1 ? `${personById(project.teamIds[1]).name.split(' ')[0]} is here` : 'Only you'}</span></span>
        <Button size="sm" variant={museOpen ? 'muse' : 'secondary'} icon={<Sparkle size={14} weight="fill" className={museOpen ? '' : 'text-violet-400'} />} onClick={() => setMuse(!museOpen)}>
          Muse{pending.length ? ` · ${pending.length}` : ''}
        </Button>
        <Button size="sm" variant="primary" icon={<RocketLaunch size={14} />} onClick={() => navigate(`launch-${project.id}`, { transition: false })}>Launch</Button>
      </div>
    </header>
  );

  const layersList = (
    <ul className="thin-scroll flex-1 overflow-y-auto px-2 pb-3 tablet-portrait:grid tablet-portrait:grid-cols-2 tablet-portrait:gap-x-3 tablet-portrait:px-0">
      {LAYERS.map((l) => (
        <li key={l.id} className={`group flex items-center gap-2 rounded-lg px-2 ${layer === l.id ? 'bg-white/[0.07]' : 'hover:bg-white/[0.03]'}`}>
          <button className={`flex h-9 flex-1 items-center gap-2 text-left text-sm touch:h-11 ${layer === l.id ? 'text-mist' : 'text-text-2'}`} onClick={() => setLayer(l.id)} aria-pressed={layer === l.id}>
            <span className="text-text-3">{l.icon}</span>{l.label}
            {marked[l.id] && <Sparkle size={12} weight="fill" className="text-violet-400" aria-label="Muse proposal pending" />}
          </button>
          {l.id !== 'background' && (
            <>
              <button aria-label={view.doc.hidden[l.id] ? `Show ${l.label}` : `Hide ${l.label}`} onClick={() => updateDoc(project.id, { hidden: { ...project.doc.hidden, [l.id]: !project.doc.hidden[l.id] } })} className="flex items-center justify-center text-text-4 opacity-0 hover:text-mist focus-visible:opacity-100 group-hover:opacity-100 touch:h-11 touch:w-9 touch:opacity-100">{project.doc.hidden[l.id] ? <EyeSlash size={14} /> : <Eye size={14} />}</button>
              <button aria-label={project.doc.locked[l.id] ? `Unlock ${l.label}` : `Lock ${l.label}`} onClick={() => updateDoc(project.id, { locked: { ...project.doc.locked, [l.id]: !project.doc.locked[l.id] } })} className={`flex items-center justify-center ${project.doc.locked[l.id] ? 'text-text-2 opacity-100' : 'text-text-4 opacity-0'} hover:text-mist focus-visible:opacity-100 group-hover:opacity-100 touch:h-11 touch:w-9 touch:opacity-100`}>{project.doc.locked[l.id] ? <Lock size={14} /> : <LockOpen size={14} />}</button>
            </>
          )}
        </li>
      ))}
    </ul>
  );

  const commentsPanel = (
    <div className="thin-scroll flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3 tablet-portrait:px-0">
      {project.comments.length === 0 && <p className="px-1 py-6 text-center text-xs text-text-4">No comments yet. Select a layer and leave the first one.</p>}
      {project.comments.map((c) => (
        <div key={c.id} className={`rounded-xl border p-2.5 ${c.resolved ? 'border-hairline opacity-50' : 'border-hairline-strong'}`}>
          <div className="flex items-center gap-2"><Avatar id={c.authorId} size={20} /><span className="text-xs text-text-2">{personById(c.authorId).name.split(' ')[0]}</span><span className="ml-auto text-[11px] text-text-4">{timeAgo(c.at)}</span></div>
          <p className="mt-1.5 text-sm text-mist">{c.text}</p>
          <div className="mt-1.5 flex items-center justify-between">
            <button onClick={() => setLayer(c.target)} className="font-mono text-[11px] text-violet-300 touch:py-2">@{c.target}</button>
            {!c.resolved && <button onClick={() => resolve(project.id, c.id)} className="flex items-center gap-1 text-[11px] text-text-3 hover:text-mist touch:py-2"><CheckCircle size={12} />Resolve</button>}
          </div>
        </div>
      ))}
      <form onSubmit={(e) => { e.preventDefault(); if (comment.trim()) { addComment(project.id, comment.trim(), layer); setComment(''); } }} className="mt-1 flex flex-col gap-2">
        <label htmlFor="comment" className="text-xs text-text-4">Comment on {layerLabel?.toLowerCase()}</label>
        <textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="resize-none rounded-lg border border-hairline bg-black/40 p-2 text-sm text-mist focus:border-violet-400/60 focus:outline-none" />
        <Button size="sm" type="submit" variant="secondary" disabled={!comment.trim()}>Post comment</Button>
      </form>
    </div>
  );

  const inspectorBody = (
    <>
      {mode === 'design' && <DesignInspector p={project} layer={layer} />}
      {mode === 'motion' && <MotionInspector p={project} layer={layer} />}
      {mode === 'space' && <SpaceInspector p={project} />}
    </>
  );
  const inspectorTitle = mode === 'space' ? 'Space · material and light' : mode === 'motion' ? `Motion · ${layerLabel}` : layerLabel;

  const canvasArea =
    mode === 'space' ? (
      <CoreViewport morph={view.space.morph} space={view.space} className="flex-1" label={`${project.name} Core in real time. Drag to orbit.`} />
    ) : (
      <div className="relative flex-1 overflow-hidden" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)', backgroundSize: '22px 22px' }} onClick={() => setLayer('background')}>
        <div className="absolute inset-0 flex items-center justify-center p-8 tablet-portrait:px-5 tablet-portrait:pb-[72px] tablet-portrait:pt-14">
          <div className={`h-full ${device === 'mobile' ? 'w-[min(300px,100%)]' : device === 'tablet' ? 'w-[min(560px,100%)]' : 'w-full max-w-[1100px]'}`}>
            <Artboard
              doc={view.doc}
              name={project.client}
              device={device}
              motion={showMotion ? view.motion : undefined}
              playToken={showMotion ? playToken : undefined}
              scrubTime={showMotion ? time : null}
              selected={layer}
              onSelect={selectFromCanvas}
              marked={marked}
              interactive
              fit="contain"
              className="rounded-xl shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)]"
            />
          </div>
        </div>
        {pending.length > 0 && (
          <div className="glass absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full py-1.5 pl-4 pr-1.5 text-sm" onClick={(e) => e.stopPropagation()}>
            <Sparkle size={14} weight="fill" className="text-violet-400" />
            <span className="whitespace-nowrap text-text-2">{comparing ? 'Showing your version' : `Previewing ${pending.length} Muse proposal${pending.length > 1 ? 's' : ''}`}</span>
            <Button size="sm" variant="muse" onClick={reviewMuse}>Review</Button>
          </div>
        )}
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Segmented<Device> label="Device" value={device} onChange={setDevice} options={[{ id: 'desktop', label: 'Desktop', icon: <Desktop size={14} /> }, { id: 'tablet', label: 'Tablet', icon: <DeviceTablet size={14} /> }, { id: 'mobile', label: 'Phone', icon: <DeviceMobile size={14} /> }]} />
          {mode === 'design' && <Button size="sm" variant="secondary" icon={<ArrowCounterClockwise size={14} />} onClick={() => { changeMode('motion'); setPlayToken((v) => v + 1); }}>Play intro</Button>}
        </div>
      </div>
    );

  // ---------- portrait tablet: canvas on top, a resizable panel sheet below ----------
  if (tabletPortrait) {
    const tabs: { id: SheetTab; label: string; icon: React.ReactNode }[] = [];
    if (mode === 'motion') tabs.push({ id: 'timeline', label: 'Timeline', icon: <FilmStrip size={14} /> });
    tabs.push({ id: 'properties', label: mode === 'space' ? 'Material' : 'Properties', icon: <Sliders size={14} /> });
    if (mode !== 'space') tabs.push({ id: 'layers', label: 'Layers', icon: <Stack size={14} /> });
    tabs.push({ id: 'comments', label: 'Comments', icon: <ChatCircle size={14} /> });
    tabs.push({ id: 'muse', label: pending.length ? `Muse · ${pending.length}` : 'Muse', icon: <Sparkle size={14} weight="fill" /> });
    const tab = tabs.some((t) => t.id === sheetTab) ? sheetTab : tabs[0].id;

    return (
      <div className="flex h-[100svh] flex-col">
        {header}
        <div ref={stack} className="flex min-h-0 flex-1 flex-col">
          <section className="relative flex min-h-0 flex-col" style={{ height: `${100 - sheet}%` }} aria-label="Canvas">
            {canvasArea}
          </section>
          <section className="flex min-h-0 flex-col border-t border-hairline-strong bg-[#0c0c0e]" style={{ height: `${sheet}%` }} aria-label="Canvas panels">
            <button
              type="button"
              className="mx-auto flex h-6 w-24 shrink-0 touch-none items-center justify-center"
              aria-label={`Resize panels, ${Math.round(sheet)}% of the screen. Tap to change size.`}
              onPointerDown={startSheetDrag}
              onKeyDown={(e) => { if (e.key === 'ArrowUp') setSheet((v) => Math.min(72, v + 6)); if (e.key === 'ArrowDown') setSheet((v) => Math.max(30, v - 6)); }}
            >
              <span className="h-1 w-10 rounded-full bg-hairline-strong" />
            </button>
            <div className="flex shrink-0 items-center gap-3 px-4 pb-3">
              <Segmented<SheetTab> label="Panel" value={tab} onChange={setSheetTab} options={tabs} />
              {tab === 'properties' && <p className="mono-label ml-auto truncate text-text-4">{inspectorTitle}</p>}
            </div>
            <div className={`thin-scroll min-h-0 flex-1 overflow-y-auto ${tab === 'timeline' ? '' : 'px-4 pb-6'}`}>
              {tab === 'timeline' && (
                <>
                  <Timeline p={previewProject} selected={layer} onSelect={setLayer} time={time} setTime={setTime} playing={playing} setPlaying={setPlaying} />
                  <div className="px-4 pb-6 pt-2">
                    <p className="mono-label mb-4 text-text-4">{inspectorTitle}</p>
                    <div className="[&>div]:grid [&>div]:grid-cols-2 [&>div]:gap-x-8 [&>div]:gap-y-5">{inspectorBody}</div>
                  </div>
                </>
              )}
              {tab === 'properties' && <div className="[&>div]:grid [&>div]:grid-cols-2 [&>div]:gap-x-8 [&>div]:gap-y-5">{inspectorBody}</div>}
              {tab === 'layers' && layersList}
              {tab === 'comments' && commentsPanel}
              {tab === 'muse' && (
                <div className="flex flex-col gap-3">
                  {pending.length ? (
                    <div className="grid grid-cols-2 gap-3">{pending.map((pr) => <ProposalCard key={pr.id} p={pr} compact />)}</div>
                  ) : (
                    <p className="text-sm text-text-3">No proposals waiting. Ask Muse and its suggestions appear here, previewed on the canvas above until you accept or reject them.</p>
                  )}
                  <Button variant="secondary" className="self-start" icon={<Sparkle size={14} weight="fill" className="text-violet-400" />} onClick={() => setMuse(true)}>Ask Muse</Button>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100svh] flex-col">
      {header}

      <div className="flex min-h-0 flex-1">
        {/* left panel */}
        <aside className="hidden w-[232px] shrink-0 flex-col border-r border-hairline lg:flex" aria-label="Layers and comments">
          <div className="p-3"><Segmented label="Panel" value={panel} onChange={setPanel} options={[{ id: 'layers', label: 'Layers', icon: <Stack size={14} /> }, { id: 'comments', label: `Comments`, icon: <ChatCircle size={14} /> }]} /></div>
          {panel === 'layers' ? layersList : commentsPanel}
        </aside>

        {/* canvas */}
        <section className="relative flex min-w-0 flex-1 flex-col" aria-label="Canvas">
          {canvasArea}
          {showMotion && <Timeline p={previewProject} selected={layer} onSelect={setLayer} time={time} setTime={setTime} playing={playing} setPlaying={setPlaying} />}
        </section>

        {/* inspector */}
        <aside className={`thin-scroll hidden w-[288px] shrink-0 overflow-y-auto border-l border-hairline p-4 md:block ${museOpen ? 'xl:mr-[396px]' : ''}`} aria-label="Inspector">
          <p className="mono-label text-text-4">{inspectorTitle}</p>
          <div className="mt-4">{inspectorBody}</div>
          {pending.length > 0 && (
            <div className="mt-8 border-t border-hairline pt-4">
              <p className="mono-label text-violet-400">Muse proposals</p>
              <div className="mt-3 flex flex-col gap-2">{pending.map((pr) => <ProposalCard key={pr.id} p={pr} compact />)}</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
