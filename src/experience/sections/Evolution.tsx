import { useRef, useState } from 'react';
import { useChapter } from '../useChapter';

const STEPS = [
  { n: '01', state: 'Drop', title: 'Start with anything', body: 'A sentence, a sketch, a voice note, a reference. Intent captures it, and the drop takes it in.' },
  { n: '02', state: 'Form', title: 'Muse proposes directions', body: 'The drop splits into three directions. You choose one, and it is shaped into form. Nothing changes without your yes.' },
  { n: '03', state: 'Lattice', title: 'Every choice becomes a system', body: 'Colours, type, spacing and components become one living lattice. Change it once and it updates everywhere.' },
  { n: '04', state: 'Orbit', title: 'It moves the way you imagined', body: 'Scroll timelines, transitions and 3D scenes are set in motion, with timing you can read and tune.' },
];

const CHIPS = ['A sentence', 'A sketch', 'A voice note', 'A reference'];
const DIRECTIONS = ['Quiet chrome', 'Constellation', 'Living structure'];
const TOKENS = [
  { t: 'color.violet.500', x: -34, y: -30 },
  { t: 'radius.16', x: 30, y: -38 },
  { t: 'space.24', x: 36, y: 22 },
  { t: 'type.display.2', x: -40, y: 18 },
  { t: 'Button / Primary', x: -6, y: 42 },
];

/** Chapter 03, The Evolution. Pinned for ~400vh; the Core morphs Drop → Form → Lattice → Orbit. */
export default function Evolution() {
  const section = useRef<HTMLElement>(null);
  const [p, setP] = useState(0);
  useChapter(section, 'evolution', { onUpdate: (v) => setP(v) });

  const step = p < 0.25 ? 0 : p < 0.5 ? 1 : p < 0.75 ? 2 : 3;
  const local = (p - step * 0.25) / 0.25;
  const chipT = Math.min(1, Math.max(0, (p - 0.06) / 0.16));
  const dirIn = Math.min(1, Math.max(0, (p - 0.27) / 0.06));
  const chosen = p > 0.37;
  const tokensT = Math.min(1, Math.max(0, (p - 0.56) / 0.12));
  const curveT = Math.min(1, Math.max(0, (p - 0.78) / 0.2));

  return (
    <section id="evolution" ref={section} className="relative h-[480vh]" aria-labelledby="evo-title">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <div className="mx-auto grid h-full max-w-[1280px] grid-rows-[1fr_auto] px-6 md:px-10 lg:grid-cols-[minmax(0,520px)_1fr] lg:grid-rows-1">
          {/* copy */}
          <div className="row-start-2 flex flex-col justify-end pb-10 lg:row-start-1 lg:justify-center lg:pb-0">
            <p className="mono-label text-violet-400">03 · The evolution</p>
            <h2 id="evo-title" className="mt-4 text-[28px] font-light leading-9 text-text-2 md:text-3xl">How an idea becomes a system</h2>
            <div className="relative mt-8 h-[220px] md:h-[240px]">
              {STEPS.map((s, i) => (
                <div
                  key={s.n}
                  className="absolute inset-0 transition-[opacity,transform,filter] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ opacity: step === i ? 1 : 0, transform: `translateY(${(i - step) * 28}px)`, filter: step === i ? 'none' : 'blur(6px)' }}
                  aria-hidden={step !== i}
                >
                  <p className="mono-label text-text-3">{s.n} / 04 · {s.state}</p>
                  <h3 className="display-3 mt-3 text-mist">{s.title}</h3>
                  <p className="mt-4 max-w-[460px] text-base leading-7 text-text-2">{s.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2" aria-hidden="true">
              {STEPS.map((s, i) => (
                <span key={s.n} className="h-[3px] flex-1 overflow-hidden rounded-full bg-hairline">
                  <span className="block h-full bg-violet-400" style={{ width: `${(i < step ? 1 : i === step ? Math.min(1, local) : 0) * 100}%` }} />
                </span>
              ))}
            </div>
          </div>

          {/* annotations around the Core (the Core itself is in the WebGL canvas) */}
          <div className="pointer-events-none relative row-start-1" aria-hidden="true">
            <div className="absolute left-1/2 top-[44%] h-0 w-0 lg:left-[58%] lg:top-1/2">
              {CHIPS.map((c, i) => {
                const a = (i / CHIPS.length) * Math.PI * 2 + 0.4;
                const r = 230 * (1 - chipT) + 10;
                const x = Math.cos(a) * r * (window.innerWidth < 768 ? 0.55 : 1);
                const y = Math.sin(a) * r * 0.62;
                return (
                  <span
                    key={c}
                    className="glass absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs text-text-2"
                    style={{ left: x, top: y, opacity: step === 0 ? (1 - chipT * chipT) * Math.min(1, p * 30) : 0, transform: `translate(-50%,-50%) scale(${1 - chipT * 0.6})` }}
                  >
                    {c}
                  </span>
                );
              })}
              {DIRECTIONS.map((d, i) => {
                const pos = [
                  { x: -250, y: -110 },
                  { x: 170, y: -170 },
                  { x: -140, y: 170 },
                ][i];
                const isChosen = i === 0;
                const vis = step === 1 ? dirIn * (chosen && !isChosen ? 0.25 : 1) : 0;
                const scale = window.innerWidth < 768 ? 0.6 : 1;
                return (
                  <span
                    key={d}
                    className={`absolute w-[180px] rounded-2xl p-3 text-left transition-[opacity,box-shadow,border-color] duration-500 ${isChosen && chosen ? 'glass border-violet-400/70 shadow-[0_0_40px_rgba(139,112,236,0.35)]' : 'glass'}`}
                    style={{ left: pos.x * scale, top: pos.y * scale, opacity: vis, transform: `translate(-50%,-50%) scale(${scale})` }}
                  >
                    <span className="mono-label block text-violet-400">Direction {i + 1}</span>
                    <span className="mt-1 block text-sm font-medium text-mist">{d}</span>
                    {isChosen && chosen ? <span className="mono-label mt-2 block text-cyan-500">Chosen</span> : null}
                  </span>
                );
              })}
              {TOKENS.map((t, i) => {
                const vis = step === 2 ? Math.min(1, Math.max(0, tokensT * 5 - i)) : 0;
                const scale = window.innerWidth < 768 ? 4.2 : 6.4;
                return (
                  <span key={t.t} className="absolute flex items-center gap-2" style={{ left: t.x * scale, top: t.y * scale, opacity: vis, transform: `translate(-50%,-50%) translateY(${(1 - vis) * 10}px)` }}>
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-400 shadow-[0_0_10px_#8b70ec]" />
                    <span className="whitespace-nowrap rounded-md border border-hairline-strong bg-black/60 px-2 py-1 font-mono text-[11px] text-text-2">{t.t}</span>
                  </span>
                );
              })}
            </div>
            <div
              className="glass absolute bottom-[8%] right-0 hidden w-[340px] rounded-2xl p-4 lg:block"
              style={{ opacity: step === 3 ? 1 : 0, transform: `translateY(${step === 3 ? 0 : 16}px)`, transition: 'opacity 600ms cubic-bezier(0.22,1,0.36,1), transform 600ms cubic-bezier(0.22,1,0.36,1)' }}
            >
              <div className="flex items-center justify-between">
                <span className="mono-label text-text-3">Timeline · hero</span>
                <span className="mono-label text-violet-400">aether-out · 800 ms</span>
              </div>
              <svg viewBox="0 0 300 90" className="mt-3 w-full">
                <path d="M0 88 C66 0 108 0 300 0" fill="none" stroke="#3b3b3e" strokeWidth="2" />
                <path d="M0 88 C66 0 108 0 300 0" fill="none" stroke="#a48dff" strokeWidth="2.5" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - curveT} />
                <line x1={curveT * 300} x2={curveT * 300} y1="0" y2="90" stroke="#62c8d9" strokeWidth="1.5" />
              </svg>
              <div className="mt-3 grid grid-cols-[80px_1fr] gap-y-1.5 font-mono text-[11px] text-text-3">
                {['Headline', 'Subhead', '3D visual'].map((l, i) => (
                  <div key={l} className="contents">
                    <span>{l}</span>
                    <span className="relative h-3 rounded bg-white/[0.04]">
                      <span className="absolute inset-y-0 rounded bg-violet-500/60" style={{ left: `${i * 14}%`, width: `${Math.max(0, Math.min(1, curveT * 1.4 - i * 0.2)) * (60 - i * 8)}%` }} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
