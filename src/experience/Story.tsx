import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import Nav from './Nav';
import ChapterRail from './ChapterRail';
import Preloader from './Preloader';
import StillBackdrop from './StillBackdrop';
import Hero from './sections/Hero';
import Tagline from './sections/Tagline';
import Evolution from './sections/Evolution';
import Showcase from './sections/Showcase';
import Architecture from './sections/Architecture';
import Platform from './sections/Platform';
import Portal from './sections/Portal';
import Launch from './sections/Launch';
import { live, chapters, resetChapters } from './director';
import { useQuality } from '../lib/quality';
import { lockScroll, scrollToTarget, startSmoothScroll, stopSmoothScroll, ScrollTrigger } from '../lib/scroll';

const Stage = lazy(() => import('./scene/Stage'));

/** The cinematic story: one persistent WebGL canvas behind six chapters of DOM. */
export default function Story({ anchor }: { anchor?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const tier = useQuality((s) => s.tier);

  useEffect(() => {
    resetChapters();
    chapters.intro = 0;
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    lockScroll(true);
    return () => { lockScroll(false); stopSmoothScroll(); };
  }, []);

  // smooth scroll only where it helps: never in Still mode
  useEffect(() => {
    if (!ready) return;
    startSmoothScroll(tier !== 'still');
    lockScroll(false);
    requestAnimationFrame(() => ScrollTrigger.refresh());
    if (anchor && anchor !== 'main') setTimeout(() => scrollToTarget(`#${anchor}`, { duration: 1.8 }), 200);
    return () => stopSmoothScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tier]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      live.px = (e.clientX / window.innerWidth) * 2 - 1;
      live.py = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useEffect(() => {
    const onResize = () => ScrollTrigger.refresh();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div ref={root} className="grain relative">
      {tier === 'still' ? (
        <StillBackdrop />
      ) : (
        <Suspense fallback={null}>
          <Stage eventSource={root} active />
        </Suspense>
      )}
      <Preloader onDone={() => setReady(true)} />
      <Nav visible={ready} />
      <ChapterRail visible={ready} />
      <main id="main" className="relative z-10" tabIndex={-1}>
        <Hero ready={ready} />
        <Tagline />
        <Evolution />
        <Showcase />
        <Architecture />
        <Platform />
        <Portal />
        <Launch />
      </main>
    </div>
  );
}
