import { useEffect, useRef, useState } from 'react';
import { gsap } from '../lib/scroll';
import { chapters } from './director';
import { useQuality } from '../lib/quality';

const SEEN = 'aether.seen';
const seen = () => { try { return sessionStorage.getItem(SEEN) === '1'; } catch { return false; } };
const markSeen = () => { try { sessionStorage.setItem(SEEN, '1'); } catch { /* ignore */ } };

/**
 * Chapter 01, The Awakening. A dark field and a point of light; dust spirals inward and condenses
 * into liquid chrome; the Æ flashes through it and the wordmark resolves. The WebGL scene does the
 * heavy lifting (it reads chapters.intro); this overlay carries the counter and the typography.
 * ≤ 3.2 s on a first visit, ~1.2 s afterwards, skippable with any key, click or scroll.
 */
export default function Preloader({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const [gone, setGone] = useState(false);
  const tier = useQuality((s) => s.tier);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const still = tier === 'still';
    const fast = seen();
    let tl: gsap.core.Timeline | null = null;
    let started = false;
    const loaded = { v: 0 };
    const setCount = (v: number) => { if (counter.current) counter.current.textContent = String(Math.round(v)).padStart(3, '0'); };

    const finish = () => {
      markSeen();
      chapters.intro = 1;
      gsap.to(el, { opacity: 0, duration: still ? 0.4 : 0.7, ease: 'power2.out', onComplete: () => setGone(true) });
      onDone();
    };

    const run = () => {
      if (started) return;
      started = true;
      if (still) {
        setCount(100);
        gsap.set(el.querySelectorAll('[data-letter]'), { opacity: 1 });
        gsap.fromTo(el.querySelector('[data-word]'), { opacity: 0 }, { opacity: 1, duration: 0.4, onComplete: () => setTimeout(finish, 350) });
        return;
      }
      const intro = { v: 0 };
      tl = gsap.timeline({ onComplete: finish });
      tl.to(intro, { v: 1, duration: 3.2, ease: 'none', onUpdate: () => { chapters.intro = intro.v; } }, 0)
        .to(loaded, { v: 100, duration: 1.6, ease: 'power1.inOut', onUpdate: () => setCount(loaded.v) }, 0)
        .fromTo('[data-ae]', { opacity: 0, scale: 0.92, filter: 'blur(14px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.35, ease: 'power2.out' }, 1.75)
        .to('[data-ae]', { opacity: 0, scale: 1.08, filter: 'blur(10px)', duration: 0.45, ease: 'power2.in' }, 2.15)
        .fromTo('[data-letter]', { opacity: 0, y: 18, filter: 'blur(10px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7, ease: 'expo.out', stagger: 0.06 }, 2.2)
        .to('[data-counter]', { opacity: 0, duration: 0.4 }, 2.3)
        .to('[data-letter]', { opacity: 0, y: -10, duration: 0.45, ease: 'power2.in', stagger: 0.03 }, 2.85);
      if (fast) tl.timeScale(2.6);
    };

    // honest loading: fonts first, then the first rendered frame of the scene
    let sceneReady = still;
    let fontsReady = false;
    const check = () => { if (fontsReady && sceneReady) run(); };
    document.fonts?.ready.then(() => { fontsReady = true; loaded.v = Math.max(loaded.v, 24); setCount(loaded.v); check(); }) ?? (fontsReady = true);
    const onScene = () => { sceneReady = true; loaded.v = Math.max(loaded.v, 46); setCount(loaded.v); check(); };
    window.addEventListener('aether:scene-ready', onScene, { once: true });
    const fallback = setTimeout(() => { fontsReady = true; sceneReady = true; check(); }, 4500);

    const skip = () => {
      if (tl && tl.progress() < 1) tl.progress(1);
      else if (!started) { started = true; finish(); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key !== 'Tab') skip(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', skip);
    window.addEventListener('wheel', skip, { passive: true });
    window.addEventListener('touchmove', skip, { passive: true });
    return () => {
      clearTimeout(fallback);
      tl?.kill();
      window.removeEventListener('aether:scene-ready', onScene);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('wheel', skip);
      window.removeEventListener('touchmove', skip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gone) return null;
  return (
    <div ref={root} className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center" role="status" aria-live="polite" aria-label="Loading AETHER">
      <span data-ae className="absolute text-[min(38vw,260px)] font-extralight leading-none text-mist opacity-0" aria-hidden="true">Æ</span>
      <h1 data-word className="flex gap-[0.32em] text-[clamp(40px,9vw,128px)] font-light tracking-[0.12em] text-mist" aria-label="ÆTHER">
        {'ÆTHER'.split('').map((l, i) => (
          <span key={i} data-letter className="inline-block opacity-0" aria-hidden="true">{l}</span>
        ))}
      </h1>
      <div data-counter className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 sm:bottom-10">
        <span ref={counter} className="font-mono text-sm tabular-nums tracking-[0.2em] text-text-2">000</span>
        <span className="mono-label text-text-4">Press any key to skip</span>
      </div>
    </div>
  );
}
