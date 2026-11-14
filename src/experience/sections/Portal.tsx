import { useRef, useState } from 'react';
import { ArrowRight } from '@phosphor-icons/react';
import { useChapter } from '../useChapter';
import { MagneticButton } from '../../components/Button';
import { useApp } from '../../data/store';
import { stageImage } from '../../data/assets';
import { STAGE_LABEL } from '../../lib/tokens';
import { people } from '../../data/seed';
import { enterPortal } from '../../components/PortalOverlay';

const HOTSPOTS = [
  { id: 'muse', label: 'Muse', x: 86, y: 30, text: 'Proposals with reasoning. Accept, reject or compare before anything changes.', to: 'project-halden' },
  { id: 'canvas', label: 'Canvas', x: 38, y: 50, text: 'Design, Motion and Space modes on one canvas, with the whole team live.', to: 'project-halden' },
  { id: 'library', label: 'Library', x: 12, y: 58, text: '3D models, materials, motion presets and components, shared across projects.', to: 'library' },
  { id: 'launch', label: 'Launch', x: 64, y: 84, text: 'Preview every device, run checks and publish to the edge.', to: 'launch-halden' },
];

/** A static, non-interactive look at the real dashboard, used inside the portal slab. */
function DashboardPreview() {
  const projects = useApp((s) => s.projects).slice(0, 4);
  return (
    <div className="flex h-full w-full bg-[#0b0b0c] text-left" inert aria-hidden="true">
      <aside className="flex w-[19%] flex-col gap-3 border-r border-hairline bg-[#0e0e10] p-[2.2%]">
        <span className="text-[clamp(14px,1.8vw,22px)] font-light text-mist">Æ</span>
        {['Home', 'Projects', 'Library', 'Activity'].map((n, i) => (
          <span key={n} className={`rounded-lg px-2 py-1.5 text-[clamp(8px,0.95vw,13px)] ${i === 0 ? 'bg-white/[0.06] text-mist' : 'text-text-3'}`}>{n}</span>
        ))}
      </aside>
      <div className="flex flex-1 flex-col gap-[3%] p-[3%]">
        <div className="flex items-center justify-between">
          <span className="text-[clamp(11px,1.6vw,24px)] font-light text-mist">Good evening, Inès</span>
          <span className="flex -space-x-1.5">
            {people.slice(0, 4).map((p) => <span key={p.id} className="h-[clamp(14px,1.8vw,24px)] w-[clamp(14px,1.8vw,24px)] rounded-full border border-black" style={{ background: p.hue }} />)}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-[2.5%]">
          {projects.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-xl border border-hairline bg-[#141416]">
              <img src={stageImage[p.stage]} alt="" className="aspect-[4/3] w-full object-cover" />
              <div className="p-[7%]">
                <p className="truncate text-[clamp(7px,0.85vw,12px)] text-mist">{p.name}</p>
                <p className="font-mono text-[clamp(6px,0.7vw,10px)] uppercase tracking-wider text-violet-400">{STAGE_LABEL[p.stage]}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-[2fr_1fr] gap-[2.5%]">
          <div className="rounded-xl border border-hairline bg-[#141416] p-[3%]">
            <p className="font-mono text-[clamp(6px,0.7vw,10px)] uppercase tracking-wider text-text-3">Continue</p>
            <p className="mt-1 text-[clamp(9px,1.2vw,17px)] text-mist">Halden Coffee spring launch</p>
            <div className="mt-[3%] h-[6px] w-full rounded-full bg-hairline"><div className="h-full w-[64%] rounded-full bg-violet-500" /></div>
          </div>
          <div className="rounded-xl border border-violet-400/40 bg-violet-500/[0.07] p-[6%]">
            <p className="font-mono text-[clamp(6px,0.7vw,10px)] uppercase tracking-wider text-violet-300">Muse</p>
            <p className="mt-1 text-[clamp(7px,0.85vw,12px)] text-text-2">Two suggestions for Halden are waiting for review</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Chapter 05, Enter the experience: the dashboard arrives as a glass slab, flattens and opens. */
export default function Portal() {
  const section = useRef<HTMLElement>(null);
  const [p, setP] = useState(0);
  const [hot, setHot] = useState<string | null>(null);
  useChapter(section, 'portal', { onUpdate: setP });

  const flat = Math.min(1, p / 0.55);
  const e = 1 - Math.pow(1 - flat, 3);
  const rx = (1 - e) * 34;
  const scale = 0.62 + e * 0.38;
  const ty = (1 - e) * 90;
  const hotOn = p > 0.55;
  const ctaOn = p > 0.62;

  return (
    <section id="portal" ref={section} className="relative h-[330vh]" aria-labelledby="portal-title">
      <div className="sticky top-0 flex h-[100svh] flex-col items-center justify-center overflow-hidden px-4 md:px-10">
        <div className="mb-6 text-center transition-[opacity,transform] duration-700" style={{ opacity: 1 - e * 0.15 }}>
          <p className="mono-label text-violet-400">05 · Enter the experience</p>
          <h2 id="portal-title" className="display-3 mt-3 text-mist">The site becomes the app</h2>
        </div>
        <div className="relative w-full max-w-[min(1120px,calc((100svh-300px)*1.78))]" style={{ perspective: '1400px' }}>
          <div
            className="glass relative aspect-[16/10] w-full overflow-hidden rounded-[20px] shadow-[0_60px_120px_-30px_rgba(0,0,0,0.9),0_0_80px_rgba(139,112,236,0.12)] md:aspect-[16/9]"
            style={{ transform: `translateY(${ty}px) rotateX(${rx}deg) scale(${scale})`, transformOrigin: '50% 100%' }}
          >
            <DashboardPreview />
            <span className="pointer-events-none absolute inset-0 rounded-[20px] bg-[linear-gradient(115deg,rgba(255,255,255,0.10)_0%,transparent_32%)]" style={{ opacity: 1 - e * 0.6 }} />
            {HOTSPOTS.map((h) => (
              <button
                key={h.id}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2"
                style={{ left: `${h.x}%`, top: `${h.y}%`, opacity: hotOn ? 1 : 0, pointerEvents: hotOn ? 'auto' : 'none', transition: 'opacity 500ms cubic-bezier(0.22,1,0.36,1)' }}
                onClick={() => setHot(hot === h.id ? null : h.id)}
                aria-expanded={hot === h.id}
                data-cursor="Explore"
              >
                <span className="relative flex h-6 w-6 items-center justify-center">
                  <span className="absolute inset-0 animate-[aether-pulse_2s_ease-in-out_infinite] rounded-full bg-violet-500/40" />
                  <span className="h-2.5 w-2.5 rounded-full bg-light shadow-[0_0_12px_#fff]" />
                </span>
                <span className="glass rounded-full px-2.5 py-1 text-xs font-medium text-mist">{h.label}</span>
              </button>
            ))}
            {hot && (() => {
              const h = HOTSPOTS.find((x) => x.id === hot)!;
              return (
                <div className="glass-strong elev-3 absolute w-[min(300px,70%)] rounded-2xl p-4 text-left animate-rise" style={{ left: `${Math.min(h.x, 62)}%`, top: `${Math.min(h.y + 6, 60)}%` }}>
                  <p className="text-sm font-medium text-mist">{h.label}</p>
                  <p className="mt-1 text-sm leading-5 text-text-2">{h.text}</p>
                  <button className="mt-3 inline-flex items-center gap-1.5 text-sm text-violet-300 hover:text-violet-200" onClick={(ev) => enterPortal(h.to, ev.currentTarget)}>
                    Open {h.label.toLowerCase()} <ArrowRight size={14} />
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
        <div className="mt-8 flex flex-col items-center gap-3 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ opacity: ctaOn ? 1 : 0, transform: `translateY(${ctaOn ? 0 : 16}px)`, pointerEvents: ctaOn ? 'auto' : 'none' }}>
          <MagneticButton variant="primary" size="lg" onClick={(ev) => enterPortal('workspace', ev.currentTarget)} iconRight={<ArrowRight size={16} />} cursor="Enter">
            Enter the workspace
          </MagneticButton>
          <span className="text-xs text-text-3">A live demo workspace with seven projects. Nothing you do leaves this browser.</span>
        </div>
      </div>
    </section>
  );
}
