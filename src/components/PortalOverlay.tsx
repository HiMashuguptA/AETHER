import { useEffect, useRef, useState } from 'react';
import { navigate } from '../lib/router';

/**
 * The portal transition between the story and the workspace: an expanding mask of light opens
 * from the pressed control, the route changes at full cover, then the light recedes.
 */
export function enterPortal(to: string, from?: Element | null) {
  const r = from?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : window.innerWidth / 2;
  const y = r ? r.top + r.height / 2 : window.innerHeight / 2;
  window.dispatchEvent(new CustomEvent('aether:portal', { detail: { to, x, y } }));
}

export default function PortalOverlay() {
  const el = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const on = (e: Event) => {
      const { to, x, y } = (e as CustomEvent<{ to: string; x: number; y: number }>).detail;
      const node = el.current;
      const reduced = document.documentElement.classList.contains('motion-off');
      if (!node || reduced) { navigate(to, { transition: false }); window.scrollTo(0, 0); return; }
      setActive(true);
      const R = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 40;
      node.style.setProperty('--x', `${x}px`);
      node.style.setProperty('--y', `${y}px`);
      const grow = node.animate(
        [{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${R}px at ${x}px ${y}px)` }],
        { duration: 900, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' },
      );
      grow.onfinish = () => {
        navigate(to, { transition: false });
        window.scrollTo(0, 0);
        setTimeout(() => {
          const fade = node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
          fade.onfinish = () => { grow.cancel(); fade.cancel(); setActive(false); };
        }, 120);
      };
    };
    window.addEventListener('aether:portal', on);
    return () => window.removeEventListener('aether:portal', on);
  }, []);
  return (
    <div
      ref={el}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[80]"
      style={{
        display: active ? 'block' : 'none',
        background: 'radial-gradient(circle at var(--x, 50%) var(--y, 50%), #ffffff 0%, #c9bcff 6%, #6045b0 20%, #120a2a 46%, #000 72%)',
      }}
    />
  );
}
