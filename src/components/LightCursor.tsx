import { useEffect, useRef, useState } from 'react';
import { onCursor, type CursorState } from './cursorBus';
import { useQuality } from '../lib/quality';

/**
 * The cursor is a light. A small point of light with a soft halo follows the pointer; over
 * interactive elements it opens into a ring with a context label (from data-cursor="Label").
 * Only on fine pointers, never replaces the text caret, and turns off with reduced motion.
 */
export default function LightCursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<CursorState | null>(null);
  const [domState, setDomState] = useState<CursorState | null>(null);
  const [enabled, setEnabled] = useState(false);
  const tier = useQuality((s) => s.tier);

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const on = fine && !reduced && tier !== 'still';
    setEnabled(on);
    document.documentElement.classList.toggle('has-light-cursor', on);
    return () => document.documentElement.classList.remove('has-light-cursor');
  }, [tier]);

  useEffect(() => onCursor(setState), []);

  useEffect(() => {
    if (!enabled) return;
    const pos = { x: -100, y: -100, rx: -100, ry: -100, seen: false };
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
      if (!pos.seen) { pos.rx = pos.x; pos.ry = pos.y; pos.seen = true; }
      const el = (e.target as Element | null)?.closest?.('[data-cursor], a, button, [role="button"], input, textarea, select, label');
      if (!el) { setDomState(null); return; }
      if (el.matches('input, textarea')) { setDomState({ variant: 'text' }); return; }
      const label = el.getAttribute('data-cursor') ?? undefined;
      setDomState({ variant: 'ring', label: label === '' ? undefined : label });
    };
    const onDown = () => ring.current?.classList.add('scale-90');
    const onUp = () => ring.current?.classList.remove('scale-90');
    const tick = () => {
      pos.rx += (pos.x - pos.rx) * 0.2;
      pos.ry += (pos.y - pos.ry) * 0.2;
      if (dot.current) dot.current.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      if (ring.current) ring.current.style.transform = `translate3d(${pos.rx}px, ${pos.ry}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [enabled]);

  if (!enabled) return null;
  const s = state ?? domState;
  const variant = s?.variant;
  const open = variant === 'ring' || variant === 'press';
  const text = variant === 'text';
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[90]">
      <div ref={ring} className="absolute left-0 top-0 transition-transform duration-200">
        <div
          className="flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            width: open ? (s?.label ? 76 : 44) : 26,
            height: open ? (s?.label ? 76 : 44) : 26,
            border: `1px solid ${open ? 'rgba(242,242,243,0.55)' : 'rgba(242,242,243,0.0)'}`,
            background: open ? 'rgba(139,112,236,0.10)' : 'transparent',
            backdropFilter: open ? 'blur(2px)' : undefined,
            opacity: text ? 0 : 1,
          }}
        >
          {open && s?.label ? <span className="mono-label text-[10px] text-mist">{s.label}</span> : null}
        </div>
      </div>
      <div ref={dot} className="absolute left-0 top-0">
        <div
          className="-translate-x-1/2 -translate-y-1/2 rounded-full transition-[width,height,opacity] duration-300"
          style={{
            width: open ? 4 : 7,
            height: open ? 4 : 7,
            opacity: text ? 0 : 1,
            background: '#fafafa',
            boxShadow: '0 0 12px 3px rgba(250,250,250,0.55), 0 0 36px 10px rgba(139,112,236,0.35)',
          }}
        />
      </div>
    </div>
  );
}
