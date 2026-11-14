import { useEffect, useRef } from 'react';
import { ArrowDown } from '@phosphor-icons/react';
import { MagneticButton } from '../../components/Button';
import { navigate } from '../../lib/router';
import { gsap } from '../../lib/scroll';
import { useChapter } from '../useChapter';
import { live } from '../director';

/** Chapter 02, The Spark. The liquid Core lives in the WebGL canvas behind this frame. */
export default function Hero({ ready }: { ready: boolean }) {
  const section = useRef<HTMLElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const cue = useRef<HTMLDivElement>(null);

  useChapter(section, 'hero', {
    onUpdate: (p) => {
      if (!copy.current) return;
      const e = Math.min(1, p * 1.6);
      gsap.set(copy.current, { y: -e * 120, opacity: 1 - e, filter: `blur(${e * 8}px)` });
      if (cue.current) gsap.set(cue.current, { opacity: 1 - Math.min(1, p * 4) });
    },
  });

  useEffect(() => {
    if (!ready || !copy.current) return;
    const items = copy.current.querySelectorAll('[data-hero-item]');
    const reduced = document.documentElement.classList.contains('motion-off');
    if (reduced) { gsap.set(items, { opacity: 1, y: 0 }); return; }
    gsap.fromTo(items, { opacity: 0, y: 28, filter: 'blur(10px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.1, ease: 'expo.out', stagger: 0.09 });
    gsap.fromTo(cue.current, { opacity: 0 }, { opacity: 1, duration: 1, delay: 0.8 });
  }, [ready]);

  return (
    <section id="spark" ref={section} className="relative h-[165vh]" aria-labelledby="hero-title">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <div className="pointer-events-none mx-auto flex h-full max-w-[1280px] flex-col justify-end px-6 pb-[max(28px,5vh)] md:px-10 lg:justify-center lg:pb-0">
          <div ref={copy} className="pointer-events-auto max-w-[680px]">
            <p data-hero-item className="mono-label mb-6 text-violet-400 opacity-0">02 · The spark</p>
            <h1 id="hero-title" data-hero-item className="heading-1 text-gradient-hero opacity-0 lg:text-[60px]">
              From a single idea
              <br />
              to a living experience
            </h1>
            <p data-hero-item className="mt-6 max-w-[560px] text-base leading-7 text-text-2 opacity-0 md:text-lg md:leading-7">
              AETHER is the creative workspace where you and an AI collaborator shape the brand, interface, motion and 3D world of a project, then publish it live.
            </p>
            <div data-hero-item className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 opacity-0">
              <MagneticButton variant="primary" size="lg" onClick={() => { live.flash = 1; navigate('start'); }} cursor="Begin">
                Start your first project
              </MagneticButton>
              <span className="text-sm text-text-3">Free during early access. No card required.</span>
            </div>
            <p data-hero-item className="mono-label mt-8 text-text-3 opacity-0 md:mt-10">
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-cyan-500 align-middle" />3,184 experiences published during early access
            </p>
          </div>
        </div>
        <div ref={cue} className="pointer-events-none absolute bottom-8 right-6 hidden items-center gap-3 opacity-0 md:flex md:right-10">
          <span className="mono-label text-text-3">Scroll to explore · drag the Core</span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline-strong text-text-2">
            <ArrowDown size={14} className="animate-[aether-pulse_2.4s_ease-in-out_infinite]" />
          </span>
        </div>
      </div>
    </section>
  );
}
