import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DesignDoc, LayerId, MotionTrack } from '../../data/types';
import { stageWide } from '../../data/assets';

export type Device = 'desktop' | 'tablet' | 'mobile';
const SIZE: Record<Device, { w: number; h: number }> = {
  desktop: { w: 1280, h: 800 },
  tablet: { w: 820, h: 1000 },
  mobile: { w: 390, h: 800 },
};

const EASING: Record<MotionTrack['easing'], string> = {
  'aether-out': 'cubic-bezier(0.22, 1, 0.36, 1)',
  'aether-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
  'aether-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
  linear: 'linear',
};

function luminance(hex: string) {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export interface ArtboardProps {
  doc: DesignDoc;
  name: string;
  device?: Device;
  motion?: MotionTrack[];
  playToken?: number;
  scrubTime?: number | null;
  selected?: LayerId | null;
  onSelect?: (id: LayerId) => void;
  marked?: Partial<Record<LayerId, boolean>>;
  interactive?: boolean;
  className?: string;
  fit?: 'width' | 'contain';
}

/** A project's live hero, rendered from its design document. Scales to fit its container. */
export default function Artboard({ doc, name, device = 'desktop', motion, playToken, scrubTime = null, selected, onSelect, marked = {}, interactive = false, className = '', fit = 'width' }: ArtboardProps) {
  const outer = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const size = SIZE[device];
  const anims = useRef<Animation[]>([]);

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const s = fit === 'contain' && h > 0 ? Math.min(w / size.w, h / size.h) : w / size.w;
      setScale(Math.max(0.05, s));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.w, size.h, fit]);

  // motion preview: Web Animations driven by the project's timeline tracks
  useEffect(() => {
    if (!motion || !board.current || playToken === undefined) return;
    anims.current.forEach((a) => a.cancel());
    anims.current = [];
    motion.forEach((t) => {
      const el = board.current!.querySelector<HTMLElement>(`[data-layer="${t.id}"]`);
      if (!el) return;
      const a = el.animate(
        [
          { opacity: 0, transform: `translateY(${t.fromY}px)`, filter: `blur(${t.fromBlur}px)` },
          { opacity: 1, transform: 'translateY(0px)', filter: 'blur(0px)' },
        ],
        { duration: t.duration * 1000, delay: t.start * 1000, easing: EASING[t.easing], fill: 'both' },
      );
      anims.current.push(a);
    });
    if (scrubTime !== null) anims.current.forEach((a) => { a.pause(); a.currentTime = scrubTime * 1000; });
    return () => { anims.current.forEach((a) => a.cancel()); anims.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playToken, motion]);

  useEffect(() => {
    if (scrubTime === null) return;
    anims.current.forEach((a) => { a.pause(); a.currentTime = scrubTime * 1000; });
  }, [scrubTime]);

  const bg = doc.theme === 'mist' ? '#f2f2f3' : doc.theme === 'graphite' ? '#181818' : '#000000';
  const fg = doc.theme === 'mist' ? '#0b0b0c' : '#f2f2f3';
  const sub = doc.theme === 'mist' ? '#3b3b3e' : doc.subheadTone;
  const ctaText = luminance(doc.accent) > 0.35 ? '#000' : '#fff';
  const mobile = device === 'mobile';
  const hs = mobile ? Math.round(doc.headlineSize * 0.62) : device === 'tablet' ? Math.round(doc.headlineSize * 0.85) : doc.headlineSize;

  const layer = (id: LayerId) => ({
    'data-layer': id,
    onClick: interactive ? (e: React.MouseEvent) => { e.stopPropagation(); onSelect?.(id); } : undefined,
    className: `${interactive ? 'cursor-pointer' : ''} ${selected === id ? 'outline outline-2 outline-offset-4 outline-[#a48dff]' : interactive ? 'hover:outline hover:outline-1 hover:outline-offset-4 hover:outline-white/30' : ''} ${marked[id] ? 'muse-mark' : ''} transition-[outline-color] rounded-[4px]`,
    style: { visibility: doc.hidden[id] ? ('hidden' as const) : undefined },
  });

  return (
    <div ref={outer} className={`relative w-full ${fit === 'contain' ? 'h-full' : ''} ${className}`} style={fit === 'width' ? { height: size.h * scale } : undefined}>
      <div
        ref={board}
        onClick={interactive ? () => onSelect?.('background') : undefined}
        className={`absolute left-1/2 top-0 origin-top overflow-hidden ${selected === 'background' ? 'outline outline-2 outline-[#a48dff]' : ''}`}
        style={{ width: size.w, height: size.h, transform: `translateX(-50%) scale(${scale})`, background: bg, color: fg, borderRadius: 14 / Math.max(scale, 0.05) }}
        aria-label={`${name} hero preview`}
        role="img"
      >
        {/* visual */}
        <div
          {...layer('visual')}
          className={`${layer('visual').className} absolute`}
          style={{
            ...layer('visual').style,
            right: mobile ? '50%' : device === 'tablet' ? '-8%' : '-4%',
            top: mobile ? 360 : device === 'tablet' ? 420 : 40,
            width: mobile ? 520 : device === 'tablet' ? 760 : 900,
            height: mobile ? 340 : device === 'tablet' ? 520 : 680,
            transform: mobile ? 'translateX(50%)' : undefined,
          }}
        >
          <img src={stageWide[doc.visual]} alt="" className="h-full w-full object-cover" style={{ maskImage: 'radial-gradient(closest-side, #000 62%, transparent 100%)', WebkitMaskImage: 'radial-gradient(closest-side, #000 62%, transparent 100%)', opacity: doc.theme === 'mist' ? 0.92 : 1 }} draggable={false} />
        </div>
        {/* nav */}
        <div {...layer('nav')} className={`${layer('nav').className} absolute left-0 right-0 top-0 flex items-center justify-between`} style={{ ...layer('nav').style, padding: mobile ? '20px 22px' : '28px 48px' }}>
          <span style={{ fontWeight: 500, letterSpacing: '0.04em', fontSize: mobile ? 15 : 17 }}>{name.split(' ').slice(0, 2).join(' ')}</span>
          {!mobile && (
            <span className="flex items-center gap-7" style={{ fontSize: 15, opacity: 0.75 }}>
              {doc.nav.map((n) => <span key={n}>{n}</span>)}
            </span>
          )}
          <span style={{ fontSize: 13, border: `1px solid ${fg}33`, padding: '6px 14px', borderRadius: 999 }}>{mobile ? 'Menu' : doc.cta}</span>
        </div>
        {/* copy */}
        <div
          className="absolute flex flex-col"
          style={{
            left: mobile ? 22 : 64,
            right: mobile ? 22 : doc.align === 'center' ? 64 : undefined,
            top: mobile ? 110 : device === 'tablet' ? 160 : doc.align === 'center' ? 200 : 230,
            maxWidth: doc.align === 'center' && !mobile ? undefined : mobile ? undefined : 640,
            alignItems: doc.align === 'center' ? 'center' : 'flex-start',
            textAlign: doc.align === 'center' ? 'center' : 'left',
            gap: doc.spacing,
          }}
        >
          <h2 {...layer('headline')} style={{ ...layer('headline').style, fontSize: hs, lineHeight: 1, fontWeight: 400, letterSpacing: '-0.02em', whiteSpace: 'pre-line', margin: 0 }}>
            {doc.headline}
          </h2>
          <p {...layer('subhead')} style={{ ...layer('subhead').style, fontSize: mobile ? 16 : 19, lineHeight: 1.5, color: sub, maxWidth: 520, margin: 0 }}>
            {doc.subhead}
          </p>
          <span {...layer('cta')} className={`${layer('cta').className} inline-flex`} style={{ ...layer('cta').style, marginTop: 8 }}>
            <span style={{ background: doc.accent, color: ctaText, borderRadius: doc.radius, padding: mobile ? '12px 18px' : '14px 22px', fontWeight: 600, fontSize: mobile ? 15 : 16 }}>{doc.cta}</span>
          </span>
          <span {...layer('proof')} style={{ ...layer('proof').style, fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.6, marginTop: 18 }}>
            {doc.proof}
          </span>
        </div>
      </div>
    </div>
  );
}
