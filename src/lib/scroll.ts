import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;
let tickerFn: ((time: number) => void) | null = null;

/** Start Lenis smooth scrolling, wired into GSAP's ticker and ScrollTrigger. */
export function startSmoothScroll(smooth: boolean) {
  stopSmoothScroll();
  if (!smooth) {
    ScrollTrigger.refresh();
    return null;
  }
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9, touchMultiplier: 1.2, syncTouch: false });
  lenis.on('scroll', ScrollTrigger.update);
  tickerFn = (time: number) => lenis?.raf(time * 1000);
  gsap.ticker.add(tickerFn);
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

export function stopSmoothScroll() {
  if (tickerFn) gsap.ticker.remove(tickerFn);
  tickerFn = null;
  lenis?.destroy();
  lenis = null;
}

export function getLenis() {
  return lenis;
}

export function lockScroll(locked: boolean) {
  if (lenis) {
    if (locked) lenis.stop();
    else lenis.start();
  }
  document.documentElement.style.overflow = locked ? 'hidden' : '';
}

/** Scroll to an element or y position, smooth when Lenis is running. */
export function scrollToTarget(target: string | number | HTMLElement, opts: { duration?: number; offset?: number } = {}) {
  const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (lenis) {
    lenis.scrollTo(el ?? 0, { duration: opts.duration ?? 1.6, offset: opts.offset ?? 0, easing: (t: number) => 1 - Math.pow(1 - t, 4) });
    return;
  }
  const y = typeof el === 'number' ? el : el instanceof HTMLElement ? el.getBoundingClientRect().top + window.scrollY + (opts.offset ?? 0) : 0;
  window.scrollTo({ top: y, behavior: 'auto' });
}

export { gsap, ScrollTrigger };
