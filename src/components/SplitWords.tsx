import { useEffect, useRef, type ElementType } from 'react';
import { gsap, ScrollTrigger } from '../lib/scroll';

/**
 * Word-by-word reveal: words rise and sharpen on the base curve the first time the block
 * enters view. Screen readers get the full sentence; the animated spans are hidden from them.
 */
export function SplitWords({
  text,
  as: Tag = 'p',
  className = '',
  delay = 0,
  stagger = 0.06,
  immediate = false,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  delay?: number;
  stagger?: number;
  immediate?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const lines = text.split('\n');
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const words = el.querySelectorAll<HTMLElement>('[data-w]');
    const reduced = document.documentElement.classList.contains('motion-off');
    if (reduced) {
      gsap.set(words, { opacity: 1, y: 0, filter: 'none' });
      return;
    }
    gsap.set(words, { opacity: 0, y: '0.45em', filter: 'blur(8px)' });
    const play = () =>
      gsap.to(words, {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.9,
        ease: 'expo.out',
        stagger: Math.min(stagger, 0.4 / Math.max(1, words.length)) || stagger,
        delay,
      });
    if (immediate) {
      const t = play();
      return () => { t.kill(); };
    }
    const st = ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true, onEnter: () => play() });
    return () => st.kill();
  }, [text, delay, stagger, immediate]);

  return (
    <Tag ref={ref} className={className} aria-label={text.replace(/\n/g, ' ')}>
      {lines.map((line, li) => (
        <span key={li} className="block" aria-hidden="true">
          {line.split(' ').map((w, wi) => (
            <span key={wi} className="inline-block overflow-visible">
              <span data-w className="inline-block will-change-transform">{w}</span>
              {wi < line.split(' ').length - 1 ? ' ' : ''}
            </span>
          ))}
        </span>
      ))}
    </Tag>
  );
}

/** Rise and fade a block in once when it enters the viewport. */
export function useReveal<T extends HTMLElement>(opts: { y?: number; delay?: number; stagger?: number; selector?: string } = {}) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const targets = opts.selector ? el.querySelectorAll(opts.selector) : [el];
    if (document.documentElement.classList.contains('motion-off')) return;
    gsap.set(targets, { opacity: 0, y: opts.y ?? 32 });
    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top 88%',
      once: true,
      onEnter: () =>
        gsap.to(targets, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out', delay: opts.delay ?? 0, stagger: opts.stagger ?? 0.06 }),
    });
    return () => st.kill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}
