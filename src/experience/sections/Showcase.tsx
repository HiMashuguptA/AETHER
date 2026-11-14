import { useEffect, useRef, useState } from 'react';
import { useChapter } from '../useChapter';
import Artboard from '../../app/components/Artboard';
import { useApp } from '../../data/store';
import { renders } from '../../data/assets';
import { STAGE_LABEL } from '../../lib/tokens';

const SHOWCASE = ['halden', 'kesh', 'mira', 'arclight', 'orbit-lab'];
const TRAIL = [renders.core, renders.form, renders.lattice, renders.orbit, renders.spark, renders.universe, renders.stack, renders.corewide];

/** Image trail limited to this section (desktop pointers only). */
function useImageTrail(host: React.RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = host.current;
    if (!el || !enabled) return;
    let last = { x: 0, y: 0 };
    let i = 0;
    const layer = document.createElement('div');
    layer.className = 'pointer-events-none absolute inset-0 z-0 overflow-hidden';
    el.prepend(layer);
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (Math.hypot(x - last.x, y - last.y) < 90) return;
      last = { x, y };
      const img = document.createElement('img');
      img.src = TRAIL[i++ % TRAIL.length];
      img.alt = '';
      img.className = 'absolute w-[180px] h-[112px] object-cover rounded-xl border border-white/10';
      img.style.left = `${x - 90}px`;
      img.style.top = `${y - 56}px`;
      layer.appendChild(img);
      img.animate(
        [
          { opacity: 0, transform: 'scale(0.6) rotate(-4deg)' },
          { opacity: 0.85, transform: 'scale(1) rotate(0deg)', offset: 0.25 },
          { opacity: 0, transform: 'scale(0.9) translateY(24px)' },
        ],
        { duration: 1100, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
      ).onfinish = () => img.remove();
    };
    el.addEventListener('pointermove', onMove);
    return () => { el.removeEventListener('pointermove', onMove); layer.remove(); };
  }, [host, enabled]);
}

/** “Made in AETHER”: a horizontal gallery of real workspace projects with expanding mask reveals. */
export default function Showcase() {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const projects = useApp((s) => s.projects).filter((p) => SHOWCASE.includes(p.id));
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  const [p, setP] = useState(0);

  useEffect(() => {
    const onR = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);

  useChapter(section, 'showcase', mobile ? { start: 'top bottom', end: 'bottom top', onUpdate: setP } : { onUpdate: setP });
  const fine = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
  const stickyRef = useRef<HTMLDivElement>(null);
  useImageTrail(stickyRef, fine && !mobile);

  // horizontal travel for desktop
  const travel = track.current ? track.current.scrollWidth - window.innerWidth + 80 : 0;
  const x = mobile ? 0 : -p * Math.max(0, travel);

  return (
    <section id="showcase" ref={section} className={mobile ? 'relative py-24' : 'relative h-[340vh]'} aria-labelledby="show-title">
      <div ref={stickyRef} className={mobile ? 'relative' : 'sticky top-0 h-[100svh] overflow-hidden'} data-cursor="">
        <div className="relative z-10 mx-auto flex max-w-[1280px] items-end justify-between px-6 pt-24 md:px-10 lg:pt-28">
          <div>
            <p className="mono-label text-violet-400">03 · Made in AETHER</p>
            <h2 id="show-title" className="display-3 mt-4 text-mist">Ideas that became places</h2>
          </div>
          <p className="hidden max-w-[300px] text-sm leading-5 text-text-3 md:block">Five projects from the workspace you are about to enter, each with its Core showing where it is.</p>
        </div>
        <div
          ref={track}
          className={mobile ? 'no-scrollbar relative z-10 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-4' : 'relative z-10 mt-10 flex gap-8 pl-10 will-change-transform lg:pl-[max(40px,calc((100vw-1280px)/2+40px))]'}
          style={mobile ? undefined : { transform: `translate3d(${x}px,0,0)` }}
        >
          {projects.map((pr, i) => {
            // mask opens as the card approaches the centre of the viewport
            const centre = mobile ? 1 : Math.min(1, Math.max(0, 1 - Math.abs(p * (projects.length - 0.4) - i + 0.3) * 0.7));
            const inset = (1 - Math.min(1, centre * 1.6)) * 10;
            return (
              <article key={pr.id} className={`${mobile ? 'w-[86vw] snap-center' : 'w-[min(62vw,860px)]'} shrink-0`}>
                <div className="overflow-hidden rounded-2xl border border-hairline bg-graphite transition-[clip-path] duration-300" style={{ clipPath: `inset(${inset}% ${inset}% ${inset}% ${inset}% round 16px)` }}>
                  <Artboard doc={pr.doc} name={pr.client} />
                </div>
                <div className="mt-4 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-medium text-mist">{pr.name}</h3>
                    <p className="mt-1 max-w-[520px] text-sm leading-5 text-text-3">{pr.description}</p>
                  </div>
                  <span className="mono-label shrink-0 rounded-full border border-hairline-strong px-2.5 py-1 text-text-2">{STAGE_LABEL[pr.stage]}{pr.published ? ' · live' : ''}</span>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
