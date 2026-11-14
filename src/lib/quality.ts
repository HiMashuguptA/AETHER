import { create } from 'zustand';
import { logPerf } from './perf';

/**
 * Render tiers from Stage 01:
 *  full  – one shared WebGL canvas, post-processing, dense particles (desktops, capable tablets)
 *  lite  – WebGL without post effects, DPR ≤ 1.5, a quarter of the particles (most phones)
 *  still – no WebGL: pre-rendered key frames and crossfades (reduced motion, Save-Data, no WebGL2)
 */
export type Tier = 'full' | 'lite' | 'still';

const KEY = 'aether.tier';

function safeGet(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch { /* storage unavailable: ignore */ }
}

export function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function detectTier(): { tier: Tier; reason: string } {
  if (typeof window === 'undefined') return { tier: 'still', reason: 'server' };
  const params = new URLSearchParams(window.location.search);
  const forced = params.get('tier');
  if (forced === 'full' || forced === 'lite' || forced === 'still') return { tier: forced, reason: 'url' };
  if (prefersReducedMotion()) return { tier: 'still', reason: 'Reduced motion is on' };
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData) return { tier: 'still', reason: 'Save-Data is on' };
  if (!hasWebGL2()) return { tier: 'still', reason: 'WebGL2 is unavailable' };
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  const lowMem = (nav.deviceMemory ?? 8) <= 4;
  const lowCores = (navigator.hardwareConcurrency ?? 8) <= 4;
  if (coarse || small || lowMem || lowCores) return { tier: 'lite', reason: 'Optimised for this device' };
  return { tier: 'full', reason: 'Full experience' };
}

interface QualityState {
  tier: Tier;
  auto: Tier;
  reason: string;
  override: Tier | null;
  reducedMotion: boolean;
  setOverride: (t: Tier | null) => void;
  downgrade: (reason: string) => void;
}

export const useQuality = create<QualityState>((set, get) => {
  const detected = detectTier();
  const stored = safeGet(KEY) as Tier | null;
  const override = stored === 'full' || stored === 'lite' || stored === 'still' ? stored : null;
  logPerf('start', override
    ? `Started in ${override} (chosen in the Motion menu; auto would be ${detected.tier}: ${detected.reason})`
    : `Started in ${detected.tier}: ${detected.reason === 'url' ? 'set by ?tier' : detected.reason}`);
  return {
    tier: override ?? detected.tier,
    auto: detected.tier,
    reason: detected.reason,
    override,
    reducedMotion: prefersReducedMotion(),
    setOverride: (t) => {
      safeSet(KEY, t);
      const tier = t ?? get().auto;
      logPerf('tier', t ? `Motion set to ${t} by the visitor` : `Motion back to automatic (${tier})`);
      set({ override: t, tier });
    },
    downgrade: (reason) => {
      if (get().override) {
        logPerf('downgrade', `Slow frames detected, but the visitor chose ${get().override}: no change`);
        return;
      }
      const from = get().tier;
      const next: Tier = from === 'full' ? 'lite' : from;
      if (next !== from) logPerf('downgrade', `${from} → ${next}: ${reason}`);
      set({ tier: next, auto: next, reason });
    },
  };
});

export const tierSettings = {
  full: { dpr: [1, 1.75] as [number, number], particles: 42000, steps: 110, ao: 5, post: true },
  lite: { dpr: [1, 1.25] as [number, number], particles: 9000, steps: 64, ao: 2, post: false },
  still: { dpr: [1, 1] as [number, number], particles: 0, steps: 0, ao: 0, post: false },
};
