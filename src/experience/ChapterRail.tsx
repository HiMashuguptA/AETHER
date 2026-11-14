import { useEffect, useRef, useState } from 'react';
import { chapters } from './director';
import { scrollToTarget } from '../lib/scroll';

const ITEMS = [
  { n: '01', label: 'Awakening', id: 'main', key: null },
  { n: '02', label: 'Spark', id: 'spark', key: 'hero' },
  { n: '03', label: 'Evolution', id: 'evolution', key: 'evolution' },
  { n: '04', label: 'Architecture', id: 'architecture', key: 'architecture' },
  { n: '05', label: 'Enter', id: 'portal', key: 'portal' },
  { n: '06', label: 'Launch', id: 'launch-story', key: 'launch' },
] as const;

/** Scroll is the timeline: a Geist Mono chapter rail that shows progress and jumps between chapters. */
export default function ChapterRail({ visible }: { visible: boolean }) {
  const [active, setActive] = useState(0);
  const bar = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      let a = 0;
      if (chapters.hero > 0.02 || chapters.tagline > 0) a = 1;
      if (chapters.evolution > 0.001 || chapters.showcase > 0) a = 2;
      if (chapters.architecture > 0.001 || chapters.platform > 0) a = 3;
      if (chapters.portal > 0.001) a = 4;
      if (chapters.launch > 0.001) a = 5;
      setActive(a);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? window.scrollY / max : 0;
      if (bar.current) bar.current.style.height = `calc(${progress * 100}% - 8px)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <nav
      aria-label="Chapters"
      className="fixed right-5 top-1/2 z-40 hidden -translate-y-1/2 transition-opacity duration-700 xl:block"
      style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none' }}
    >
      <div className="relative flex flex-col gap-4 pr-4">
        <span className="absolute right-0 top-1 h-[calc(100%-8px)] w-px bg-hairline" aria-hidden="true" />
        <span ref={bar} className="absolute right-0 top-1 w-px bg-violet-400" aria-hidden="true" />
        {ITEMS.map((it, i) => (
          <button
            key={it.n}
            onClick={() => scrollToTarget(`#${it.id}`, { duration: 2.2 })}
            aria-current={active === i ? 'step' : undefined}
            className="group flex items-center justify-end gap-3 text-right"
            data-cursor="Jump"
          >
            <span className={`mono-label transition-[opacity,transform,color] duration-500 ${active === i ? 'translate-x-0 text-mist opacity-100' : 'translate-x-2 text-text-3 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}>
              {it.label}
            </span>
            <span className={`mono-label transition-colors duration-500 ${active === i ? 'text-violet-400' : 'text-text-4 group-hover:text-text-2'}`}>{it.n}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
