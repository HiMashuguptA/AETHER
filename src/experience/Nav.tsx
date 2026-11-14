import { useEffect, useRef, useState } from 'react';
import { List, X, Sparkle, Lightning, ImageSquare } from '@phosphor-icons/react';
import { MagneticButton } from '../components/Button';
import { navigate } from '../lib/router';
import { scrollToTarget, gsap } from '../lib/scroll';
import { useQuality, type Tier } from '../lib/quality';

const LINKS = [
  { id: 'evolution', label: 'How it works' },
  { id: 'architecture', label: 'Platform' },
  { id: 'portal', label: 'Workspace' },
  { id: 'showcase', label: 'Showcase' },
];

const TIERS: { id: Tier; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'full', label: 'Full', icon: <Sparkle size={14} weight="fill" />, hint: 'Real-time 3D with light effects' },
  { id: 'lite', label: 'Lite', icon: <Lightning size={14} weight="fill" />, hint: 'Real-time 3D, lighter rendering' },
  { id: 'still', label: 'Still', icon: <ImageSquare size={14} weight="fill" />, hint: 'Still frames, no motion' },
];

/** Floating glass navigation. Compact pill on desktop, full-height panel on mobile. */
export default function Nav({ visible }: { visible: boolean }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const tier = useQuality((s) => s.tier);
  const setOverride = useQuality((s) => s.setOverride);
  const reason = useQuality((s) => s.reason);
  const [tierOpen, setTierOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open || !panel.current) return;
    const items = panel.current.querySelectorAll('[data-menu-item]');
    gsap.fromTo(items, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'expo.out', stagger: Math.min(0.06, 0.4 / items.length) });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    scrollToTarget(`#${id}`, { duration: 2 });
  };

  return (
    <>
      <header
        className="fixed inset-x-0 top-4 z-50 flex justify-center px-4 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(-16px)', pointerEvents: visible ? 'auto' : 'none' }}
      >
        <nav
          aria-label="Main"
          className={`glass flex h-14 w-full max-w-[1120px] items-center justify-between gap-4 rounded-full pl-5 pr-2 transition-[background-color,box-shadow] duration-500 ${scrolled ? 'elev-3' : ''}`}
          style={{ viewTransitionName: 'aether-shell' } as React.CSSProperties}
        >
          <button className="flex items-center gap-2 text-mist" onClick={() => scrollToTarget(0, { duration: 2.4 })} aria-label="ÆTHER, back to the beginning" data-cursor="Top">
            <span className="text-[22px] font-light leading-none">Æ</span>
            <span className="hidden text-sm font-medium tracking-[0.32em] sm:inline">ÆTHER</span>
          </button>
          <ul className="hidden items-center gap-1 lg:flex">
            {LINKS.map((l) => (
              <li key={l.id}>
                <button onClick={() => go(l.id)} className="rounded-full px-3 py-2 text-sm text-text-2 transition-colors duration-300 hover:bg-white/[0.06] hover:text-mist">
                  {l.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-1">
            <div className="relative hidden sm:block">
              <button
                onClick={() => setTierOpen((v) => !v)}
                aria-expanded={tierOpen}
                aria-label={`Motion: ${tier}. Change rendering mode`}
                className="mono-label flex h-9 items-center gap-1.5 rounded-full px-3 text-text-3 transition-colors hover:bg-white/[0.06] hover:text-mist"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${tier === 'still' ? 'bg-text-3' : 'bg-cyan-500'}`} />
                Motion · {tier}
              </button>
              {tierOpen && (
                <div role="menu" className="glass-strong elev-3 absolute right-0 top-11 w-64 rounded-2xl p-2 animate-rise">
                  <p className="px-3 pb-2 pt-1 text-xs text-text-3">Auto chose this for you: {reason.toLowerCase()}.</p>
                  {TIERS.map((t) => (
                    <button
                      key={t.id}
                      role="menuitemradio"
                      aria-checked={tier === t.id}
                      onClick={() => { setOverride(t.id); setTierOpen(false); }}
                      className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.06] ${tier === t.id ? 'text-mist' : 'text-text-2'}`}
                    >
                      <span className={`mt-0.5 ${tier === t.id ? 'text-violet-400' : 'text-text-3'}`}>{t.icon}</span>
                      <span><span className="block text-sm font-medium">{t.label}</span><span className="block text-xs text-text-3">{t.hint}</span></span>
                    </button>
                  ))}
                  <button onClick={() => { setOverride(null); setTierOpen(false); }} className="mt-1 w-full rounded-xl px-3 py-2 text-left text-xs text-text-3 hover:bg-white/[0.06] hover:text-mist">Reset to automatic</button>
                </div>
              )}
            </div>
            <button onClick={() => navigate('workspace')} className="hidden h-9 rounded-full px-3 text-sm text-text-2 transition-colors hover:bg-white/[0.06] hover:text-mist md:block">Sign in</button>
            <div className="hidden sm:block">
              <MagneticButton variant="primary" size="sm" onClick={() => navigate('start')} cursor="Begin">Start your first project</MagneticButton>
            </div>
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full text-mist hover:bg-white/[0.06] lg:hidden"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <span className="relative block h-5 w-5">
                <List size={20} className={`absolute inset-0 transition-[opacity,transform] duration-500 ${open ? 'rotate-90 opacity-0' : 'opacity-100'}`} />
                <X size={20} className={`absolute inset-0 transition-[opacity,transform] duration-500 ${open ? 'opacity-100' : '-rotate-90 opacity-0'}`} />
              </span>
            </button>
          </div>
        </nav>
      </header>
      {open && (
        <div ref={panel} className="fixed inset-0 z-40 flex flex-col justify-between bg-black/90 px-6 pb-10 pt-28 backdrop-blur-2xl lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <ul className="flex flex-col gap-2">
            {LINKS.map((l, i) => (
              <li key={l.id} data-menu-item>
                <button onClick={() => go(l.id)} className="flex w-full items-baseline gap-4 py-2 text-left text-4xl font-light text-mist">
                  <span className="mono-label text-violet-400">0{i + 2}</span>
                  {l.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3" data-menu-item>
            <div className="flex gap-2">
              {TIERS.map((t) => (
                <button key={t.id} onClick={() => setOverride(t.id)} aria-pressed={tier === t.id} className={`mono-label flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full border ${tier === t.id ? 'border-violet-500 text-mist' : 'border-hairline-strong text-text-3'}`}>
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
            <MagneticButton variant="primary" size="lg" className="w-full" onClick={() => navigate('start')}>Start your first project</MagneticButton>
            <button onClick={() => navigate('workspace')} className="h-12 rounded-full border border-hairline-strong text-mist">Sign in</button>
          </div>
        </div>
      )}
    </>
  );
}
