import { useEffect, useRef, useState } from 'react';
import { useQuality } from '../lib/quality';
import { onPerfChange, perf } from '../lib/perf';
import { lensStatus } from '../experience/headlineLens';

/**
 * Development-only performance overlay. Mounted only when perfEnabled() is true
 * (`npm run dev`, or `?perf` on any build). Alt+Shift+P hides and shows it.
 */

const GREEN = '#34B27F';
const YELLOW = '#E8B83E';
const RED = '#E5484D';
const fpsColour = (f: number) => (f >= 55 ? GREEN : f >= 30 ? YELLOW : RED);

const STATUS: Record<string, string> = {
  none: 'No WebGL canvas on this screen',
  starting: 'Starting',
  running: 'Rendering',
  paused: 'Paused (story hidden)',
  lost: 'Context lost',
  still: 'Still mode: no WebGL canvas',
};

function ago(at: number) {
  const s = Math.max(0, (performance.now() - at) / 1000);
  if (s < 60) return `${s.toFixed(0)}s`;
  return `${Math.floor(s / 60)}m`;
}

export default function PerfOverlay() {
  const tier = useQuality((s) => s.tier);
  const auto = useQuality((s) => s.auto);
  const override = useQuality((s) => s.override);
  const reason = useQuality((s) => s.reason);
  const [visible, setVisible] = useState(true);
  const [open, setOpen] = useState(true);
  const [, tick] = useState(0);
  const [fps, setFps] = useState({ now: 0, avgMs: 0, worstMs: 0 });
  const spark = useRef<HTMLCanvasElement>(null);
  const history = useRef<number[]>([]);

  // frame timing from the page's own animation frames (what the visitor actually gets)
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let windowStart = last;
    let frames = 0;
    let worst = 0;
    let sum = 0;
    const loop = (t: number) => {
      const dt = t - last;
      last = t;
      frames += 1;
      sum += dt;
      worst = Math.max(worst, dt);
      if (t - windowStart >= 500) {
        const now = (frames * 1000) / (t - windowStart);
        setFps({ now, avgMs: sum / frames, worstMs: worst });
        history.current.push(now);
        if (history.current.length > 60) history.current.shift();
        frames = 0;
        sum = 0;
        worst = 0;
        windowStart = t;
        tick((n) => n + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => onPerfChange(() => tick((n) => n + 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && (e.key === 'P' || e.key === 'p' || e.code === 'KeyP')) {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // sparkline of the last 30 seconds
  useEffect(() => {
    const c = spark.current;
    if (!c || !open) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const k = window.devicePixelRatio || 1;
    const w = 232;
    const h = 28;
    c.width = w * k;
    c.height = h * k;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    [30, 60].forEach((v) => {
      const y = h - (v / 75) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    });
    const hs = history.current;
    if (hs.length < 2) return;
    ctx.strokeStyle = fpsColour(hs[hs.length - 1]);
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    hs.forEach((v, i) => {
      const x = (i / 59) * w;
      const y = h - (Math.min(v, 75) / 75) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  if (!visible) return null;
  const r = perf.renderer;
  // Still mode never mounts the canvas, so the tier is the source of truth there
  const status = tier === 'still' ? 'still' : r.status;
  const colour = fpsColour(fps.now);
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

  return (
    <section
      aria-label="Performance diagnostics (development)"
      className="fixed bottom-3 left-3 z-[300] w-[264px] select-none rounded-xl border border-white/10 bg-[#0b0b0c]/85 font-mono text-[11px] leading-[16px] text-text-2 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md"
      style={{ cursor: 'auto' }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        style={{ cursor: 'pointer' }}
      >
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: colour }} />
        <span className="tabular-nums text-mist">{fps.now ? fps.now.toFixed(0) : '–'} fps</span>
        <span className="text-text-3">·</span>
        <span className="text-mist">{tierLabel}</span>
        <span className="ml-auto text-text-3">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-white/10 px-3 pb-3 pt-2">
          <canvas ref={spark} style={{ width: 232, height: 28 }} aria-hidden="true" />
          <dl className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-0.5">
            <dt className="text-text-3">Frame</dt>
            <dd className="tabular-nums">{fps.avgMs.toFixed(1)} ms avg · {fps.worstMs.toFixed(0)} worst</dd>
            <dt className="text-text-3">Tier</dt>
            <dd>
              {tierLabel}
              {override ? ' (chosen)' : ` (auto${auto !== tier ? `: ${auto}` : ''})`}
            </dd>
            <dt className="text-text-3">Why</dt>
            <dd className="text-text-2">{override ? 'Motion menu' : reason === 'url' ? '?tier in URL' : reason}</dd>
            <dt className="text-text-3">Pixel ratio</dt>
            <dd className="tabular-nums">
              {r.dpr ? `${r.dpr.toFixed(2)} canvas` : '–'} · {window.devicePixelRatio.toFixed(2)} screen
              {r.dprCap ? ` · cap ${r.dprCap}` : ''}
            </dd>
            <dt className="text-text-3">Renderer</dt>
            <dd style={{ color: status === 'lost' ? RED : undefined }}>{STATUS[status] ?? status}</dd>
            {status === 'running' || status === 'paused' ? (
              <>
                <dt className="text-text-3">Canvas</dt>
                <dd className="tabular-nums">
                  {r.canvas[0]}×{r.canvas[1]} · {r.calls} calls
                </dd>
                <dt className="text-text-3">GPU</dt>
                <dd className="truncate" title={`${r.api} · ${r.gpu}`}>{r.api} · {r.gpu || 'unknown'}</dd>
              </>
            ) : null}
            <dt className="text-text-3">Headline</dt>
            <dd>
              {lensStatus.state === 'active' ? 'Refracting' : lensStatus.state === 'off' ? `Lens off (${lensStatus.reason})` : lensStatus.reason || 'Idle'}
            </dd>
          </dl>
          <div>
            <p className="mb-1 text-text-3">Events</p>
            {perf.events.length ? (
              <ol className="max-h-[92px] space-y-0.5 overflow-auto pr-1">
                {perf.events.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="flex gap-2">
                    <span className="w-6 shrink-0 text-right tabular-nums text-text-3">{ago(e.at)}</span>
                    <span style={{ color: e.kind === 'downgrade' || e.kind === 'dpr' ? YELLOW : e.kind === 'context' ? RED : undefined }}>{e.text}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p>None yet</p>
            )}
          </div>
          <p className="text-text-3">Alt+Shift+P hides · off without ?perf</p>
        </div>
      ) : null}
    </section>
  );
}
