import { useEffect, useRef, useState } from 'react';
import { Check, X } from '@phosphor-icons/react';
import SpotlightCard from '../../components/reactbits/SpotlightCard';
import { useChapter } from '../useChapter';
import { useReveal } from '../../components/SplitWords';
import { squares } from '../../data/assets';
import { people } from '../../data/seed';
import { ScrollTrigger } from '../../lib/scroll';

/** Cards tilt toward the pointer and catch its light. */
function Tilt({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    ref.current.style.transform = `perspective(1000px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg)`;
  };
  const reset = () => { if (ref.current) ref.current.style.transform = ''; };
  return (
    <div ref={ref} onPointerMove={onMove} onPointerLeave={reset} className={`transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${className}`} data-bento>
      {children}
    </div>
  );
}

function MuseMini() {
  const [state, setState] = useState<Record<number, 'yes' | 'no' | undefined>>({});
  const rows = [
    { t: 'Headline size', from: '60px', to: '72px' },
    { t: 'Hero settle time', from: '1.4 s', to: '0.9 s' },
  ];
  return (
    <div className="mt-5 flex flex-col gap-2">
      {rows.map((r, i) => (
        <div key={r.t} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-300 ${state[i] === 'yes' ? 'border-hairline bg-white/[0.03]' : state[i] === 'no' ? 'border-hairline opacity-50' : 'border-violet-400/50 bg-violet-500/[0.07]'}`}>
          <div className="min-w-0">
            <p className="text-sm text-mist">{r.t}</p>
            <p className="font-mono text-xs text-text-3">{r.from} → <span className={state[i] === 'yes' ? 'text-mist' : 'text-violet-300'}>{r.to}</span></p>
          </div>
          {state[i] ? (
            <span className="mono-label text-text-3">{state[i] === 'yes' ? 'Accepted' : 'Kept yours'}</span>
          ) : (
            <div className="flex gap-1.5">
              <button onClick={() => setState((s) => ({ ...s, [i]: 'no' }))} aria-label={`Reject ${r.t}`} className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline-strong text-text-2 hover:text-mist"><X size={14} /></button>
              <button onClick={() => setState((s) => ({ ...s, [i]: 'yes' }))} aria-label={`Accept ${r.t}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-light text-black"><Check size={14} weight="bold" /></button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Ring({ value, label }: { value: number; label: string }) {
  const c = 2 * Math.PI * 22;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="64" height="64" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r="22" fill="none" stroke="#272727" strokeWidth="4" />
        <circle cx="28" cy="28" r="22" fill="none" stroke={value >= 95 ? '#34b27f' : '#e8b83e'} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform="rotate(-90 28 28)" />
        <text x="28" y="32" textAnchor="middle" fontSize="13" fill="#f2f2f3" fontFamily="Geist Mono Variable, monospace">{value}</text>
      </svg>
      <span className="mono-label text-text-3">{label}</span>
    </div>
  );
}

const STEPS = [
  { n: 'Intent', d: 'Capture' },
  { n: 'Muse', d: 'Propose' },
  { n: 'Lattice', d: 'Systemise' },
  { n: 'Kinetic', d: 'Animate' },
  { n: 'Launch', d: 'Ship' },
];

function Workflow() {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const st = ScrollTrigger.create({ trigger: ref.current, start: 'top 75%', once: true, onEnter: () => setOn(true) });
    return () => st.kill();
  }, []);
  return (
    <div ref={ref} className="mt-24">
      <p className="mono-label text-text-3">One flow, five layers</p>
      <div className="relative mt-8">
        <svg className="absolute left-0 right-0 top-[27px] hidden h-2 w-full md:block" preserveAspectRatio="none" viewBox="0 0 1000 8" aria-hidden="true">
          <line x1="40" y1="4" x2="960" y2="4" stroke="#2a2a2e" strokeWidth="2" />
          <line x1="40" y1="4" x2="960" y2="4" stroke="url(#wf)" strokeWidth="2" pathLength={1} strokeDasharray="1" strokeDashoffset={on ? 0 : 1} style={{ transition: 'stroke-dashoffset 2.4s cubic-bezier(0.65,0,0.35,1)' }} />
          <defs>
            <linearGradient id="wf" x1="0" x2="1"><stop offset="0" stopColor="#a48dff" /><stop offset="1" stopColor="#62c8d9" /></linearGradient>
          </defs>
        </svg>
        <ol className="relative grid grid-cols-1 gap-4 md:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.n} className="flex items-center gap-4 md:flex-col md:items-start" style={{ opacity: on ? 1 : 0.35, transition: `opacity 600ms ${i * 380}ms cubic-bezier(0.22,1,0.36,1)` }}>
              <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border bg-black text-sm font-medium transition-[border-color,box-shadow] duration-700 ${on ? 'border-violet-400/70 text-mist shadow-[0_0_24px_rgba(139,112,236,0.35)]' : 'border-hairline-strong text-text-3'}`} style={{ transitionDelay: `${i * 380}ms` }}>
                0{i + 1}
              </span>
              <span>
                <span className="block text-base font-medium text-mist">{s.n}</span>
                <span className="mono-label text-text-3">{s.d}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** The platform, after the stack: a bento of cursor-lit glass cards with floating interface fragments. */
export default function Platform() {
  const section = useRef<HTMLElement>(null);
  useChapter(section, 'platform', { start: 'top bottom', end: 'bottom top' });
  const grid = useReveal<HTMLDivElement>({ selector: '[data-bento]', stagger: 0.08 });

  return (
    <section id="platform" ref={section} className="relative px-6 py-32 md:px-10 md:py-40" aria-labelledby="platform-title">
      <div className="mx-auto max-w-[1280px]">
        <p className="mono-label text-violet-400">04 · The platform</p>
        <h2 id="platform-title" className="display-3 mt-4 max-w-[760px] text-mist">Everything an idea needs, in one place</h2>
        <div ref={grid} className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-6">
          <Tilt className="md:col-span-3 md:row-span-2">
            <SpotlightCard className="h-full p-7" spotlightColor="#a48dff" intensity={0.12}>
              <p className="mono-label text-violet-400">Muse</p>
              <h3 className="mt-3 text-2xl font-normal text-mist">Muse proposes. You decide.</h3>
              <p className="mt-2 max-w-[420px] text-sm leading-6 text-text-3">Every suggestion arrives as a change you can compare, accept or reject. Anything not yet accepted stays marked in violet.</p>
              <MuseMini />
            </SpotlightCard>
          </Tilt>
          <Tilt className="md:col-span-3">
            <SpotlightCard className="h-full p-7">
              <p className="mono-label text-text-3">Lattice</p>
              <h3 className="mt-3 text-xl font-normal text-mist">One system, every surface</h3>
              <div className="mt-5 flex items-center gap-2">
                {['#000000', '#181818', '#272727', '#f2f2f3', '#8b70ec', '#3a63d8', '#62c8d9'].map((c) => (
                  <span key={c} className="h-9 w-9 rounded-full border border-white/10" style={{ background: c }} title={c} />
                ))}
              </div>
              <p className="mt-4 font-mono text-xs text-text-3">Display 96 · Heading 60 · Body 16 · Mono 12</p>
            </SpotlightCard>
          </Tilt>
          <Tilt className="md:col-span-3">
            <SpotlightCard className="h-full p-7">
              <p className="mono-label text-text-3">Kinetic</p>
              <h3 className="mt-3 text-xl font-normal text-mist">Motion you can read</h3>
              <div className="mt-4 flex items-center gap-5">
                <svg viewBox="0 0 120 70" className="h-[70px] w-[120px]" aria-label="aether-out easing curve">
                  <path d="M2 68 C28 2 45 2 118 2" fill="none" stroke="#3b3b3e" strokeWidth="1.5" />
                  <path id="ease-path" d="M2 68 C28 2 45 2 118 2" fill="none" stroke="#a48dff" strokeWidth="2" />
                  <circle r="3.5" fill="#62c8d9">
                    <animateMotion dur="2.4s" repeatCount="indefinite" path="M2 68 C28 2 45 2 118 2" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.22 1 0.36 1" />
                  </circle>
                </svg>
                <div className="flex flex-col gap-1.5 font-mono text-xs text-text-2">
                  <span>aether-out · 500 ms</span>
                  <span>aether-expo · 800 ms</span>
                  <span>stagger · 60 ms</span>
                </div>
              </div>
            </SpotlightCard>
          </Tilt>
          <Tilt className="md:col-span-2">
            <SpotlightCard className="h-full p-7">
              <p className="mono-label text-text-3">Space</p>
              <h3 className="mt-3 text-xl font-normal text-mist">Real-time chrome, glass and light</h3>
              <div className="mt-4 flex gap-2">
                {(['core', 'form', 'lattice'] as const).map((k) => (
                  <img key={k} src={squares[k]} alt="" className="h-16 w-16 rounded-xl border border-white/10 object-cover" />
                ))}
              </div>
            </SpotlightCard>
          </Tilt>
          <Tilt className="md:col-span-2">
            <SpotlightCard className="h-full p-7">
              <p className="mono-label text-text-3">Launch</p>
              <h3 className="mt-3 text-xl font-normal text-mist">Ship with checks</h3>
              <div className="mt-4 flex justify-between">
                <Ring value={96} label="Speed" />
                <Ring value={100} label="Access" />
                <Ring value={98} label="Search" />
              </div>
            </SpotlightCard>
          </Tilt>
          <Tilt className="md:col-span-2">
            <SpotlightCard className="h-full p-7">
              <p className="mono-label text-text-3">Together</p>
              <h3 className="mt-3 text-xl font-normal text-mist">The whole team, live</h3>
              <div className="mt-5 flex -space-x-2">
                {people.slice(0, 5).map((pp) => (
                  <span key={pp.id} className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#141416] text-xs font-semibold text-black" style={{ background: pp.hue }} title={pp.name}>{pp.initials}</span>
                ))}
              </div>
              <p className="mt-4 text-sm text-text-3">Aiko is editing the hero timeline</p>
            </SpotlightCard>
          </Tilt>
        </div>
        <Workflow />
      </div>
    </section>
  );
}
