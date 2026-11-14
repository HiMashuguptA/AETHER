import { useEffect, useRef, useState } from 'react';
import { Plus, Minus } from '@phosphor-icons/react';
import { useChapter } from '../useChapter';
import { live } from '../director';

export const LAYER_INFO = [
  { name: 'Intent', tag: 'Capture', body: 'Sentences, sketches, voice notes, references and existing brand files arrive in one place and stay linked to what they inspire.' },
  { name: 'Muse', tag: 'Direction', body: 'The AI collaborator proposes directions and changes with its reasoning. It never applies anything until a person accepts it.' },
  { name: 'Lattice', tag: 'System', body: 'Tokens, components and states as one living graph. Change a value once and every screen, scene and motion follows.' },
  { name: 'Kinetic', tag: 'Motion and space', body: 'Scroll timelines, transitions, real-time 3D scenes, materials and light, with timing you can read and tune.' },
  { name: 'Launch', tag: 'Ship', body: 'Preview on every device, check performance and accessibility, publish to the edge and measure what people do.' },
];

/** Chapter 04, The Architecture: five interactive layers of glass. */
export default function Architecture() {
  const section = useRef<HTMLElement>(null);
  const [focus, setFocus] = useState(-1);
  const [open, setOpen] = useState(0);
  const [p, setP] = useState(0);
  useChapter(section, 'architecture', { onUpdate: setP });

  // hovering a layer in 3D highlights it here too
  useEffect(() => {
    const on = (e: Event) => setFocus((e as CustomEvent<number>).detail);
    window.addEventListener('aether:layer', on);
    return () => window.removeEventListener('aether:layer', on);
  }, []);

  const set = (i: number) => {
    live.focusLayer = i;
    setFocus(i);
  };
  const exploded = Math.min(1, Math.max(0, (p - 0.2) / 0.5));
  const active = focus >= 0 ? focus : open;

  return (
    <section id="architecture" ref={section} className="relative h-[340vh]" aria-labelledby="arch-title">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <div className="mx-auto grid h-full max-w-[1280px] grid-rows-[1fr_auto] px-6 md:px-10 lg:grid-cols-[minmax(0,500px)_1fr] lg:grid-rows-1">
          <div className="row-start-2 flex flex-col justify-end pb-8 lg:row-start-1 lg:justify-center lg:pb-0">
            <p className="mono-label text-violet-400">04 · The architecture</p>
            <h2 id="arch-title" className="display-3 mt-3 text-mist">Five layers of glass</h2>
            <p className="mt-4 hidden max-w-[440px] text-base leading-7 text-text-2 sm:block">
              The idea rests on the stack. Scroll to separate the layers and watch light travel down through them: the idea passing through the medium.
            </p>
            <ul className="mt-6 flex flex-col" onMouseLeave={() => set(-1)}>
              {LAYER_INFO.map((l, i) => {
                const isOpen = active === i;
                return (
                  <li key={l.name} className="border-t border-hairline last:border-b">
                    <button
                      className="flex w-full items-center gap-4 py-3 text-left"
                      aria-expanded={isOpen}
                      onMouseEnter={() => set(i)}
                      onFocus={() => set(i)}
                      onBlur={() => set(-1)}
                      onClick={() => setOpen(isOpen ? -1 : i)}
                      data-cursor="Lift"
                    >
                      <span className={`mono-label w-6 transition-colors duration-300 ${isOpen ? 'text-violet-400' : 'text-text-4'}`}>0{i + 1}</span>
                      <span className={`flex-1 text-base font-medium transition-colors duration-300 ${isOpen ? 'text-mist' : 'text-text-2'}`}>{l.name}</span>
                      <span className="mono-label text-text-3">{l.tag}</span>
                      <span className="text-text-3">{isOpen ? <Minus size={14} /> : <Plus size={14} />}</span>
                    </button>
                    <div className="grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ gridTemplateRows: isOpen ? '1fr' : '0fr', opacity: isOpen ? 1 : 0 }}>
                      <p className="overflow-hidden pb-0 pl-10 pr-4 text-sm leading-6 text-text-3">
                        <span className="block pb-4">{l.body}</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="pointer-events-none relative row-start-1" aria-hidden="true">
            <span className="mono-label absolute bottom-[12%] right-0 hidden text-text-3 lg:block">Exploded {Math.round(exploded * 100)}%</span>
          </div>
        </div>
      </div>
    </section>
  );
}
