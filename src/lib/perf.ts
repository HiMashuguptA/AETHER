/**
 * Performance diagnostics: a tiny event log plus renderer facts, read by the overlay.
 *
 * The overlay is a development tool. It is on by default under `npm run dev` and off in
 * production builds unless the URL carries `?perf` (or `?perf=1`). `?perf=0` turns it off in
 * development too. Nothing here runs a timer or touches the renderer while it is disabled.
 */

export type PerfEventKind = 'start' | 'downgrade' | 'dpr' | 'tier' | 'context';

export interface PerfEvent {
  at: number;
  kind: PerfEventKind;
  text: string;
}

export interface RendererInfo {
  status: 'none' | 'starting' | 'running' | 'paused' | 'lost' | 'still';
  api: string;
  gpu: string;
  dpr: number;
  dprCap: number;
  canvas: [number, number];
  calls: number;
  triangles: number;
  programs: number;
  textures: number;
}

export const perf = {
  events: [] as PerfEvent[],
  renderer: {
    status: 'none',
    api: '',
    gpu: '',
    dpr: 0,
    dprCap: 0,
    canvas: [0, 0],
    calls: 0,
    triangles: 0,
    programs: 0,
    textures: 0,
  } as RendererInfo,
};

const listeners = new Set<() => void>();

export function onPerfChange(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function logPerf(kind: PerfEventKind, text: string) {
  perf.events.unshift({ at: performance.now(), kind, text });
  if (perf.events.length > 24) perf.events.length = 24;
  listeners.forEach((fn) => fn());
  if (perfEnabled()) console.info(`[ÆTHER perf] ${text}`);
}

export function setRenderer(patch: Partial<RendererInfo>) {
  Object.assign(perf.renderer, patch);
}

let cached: boolean | null = null;

export function perfEnabled(): boolean {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') return (cached = false);
  const v = new URLSearchParams(window.location.search).get('perf');
  if (v === '0' || v === 'false' || v === 'off') return (cached = false);
  if (v !== null) return (cached = true);
  return (cached = import.meta.env.DEV);
}
