/** Approved Stage 01 tokens, mirrored for JavaScript (GSAP, three.js, inline styles). */

export const color = {
  obsidian: '#000000',
  graphite: '#181818',
  raised: '#1f1f1f',
  raised2: '#272727',
  mist: '#f2f2f3',
  text2: '#c4c5cb',
  text3: '#8c8d93',
  light: '#fafafa',
  violet: '#8b70ec',
  violet400: '#a48dff',
  violet600: '#7358cc',
  cobalt: '#3a63d8',
  cyan: '#62c8d9',
  red: '#e5484d',
  green: '#34b27f',
  yellow: '#e8b83e',
} as const;

/** Easing curves as CSS strings and as GSAP-compatible functions. */
export const ease = {
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  expo: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const;

export const duration = {
  micro: 0.2,
  hover: 0.3,
  layout: 0.5,
  reveal: 0.8,
  cinematic: 1.2,
  portal: 1.6,
} as const;

/** Cubic bezier solver so GSAP can use the exact token curves. */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const err = sx(t) - x;
      const d = dx(t);
      if (Math.abs(err) < 1e-5 || Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return sy(Math.min(1, Math.max(0, t)));
  };
}

export const easeFn = {
  out: bezier(0.22, 1, 0.36, 1),
  inOut: bezier(0.65, 0, 0.35, 1),
  expo: bezier(0.16, 1, 0.3, 1),
};

export type Stage = 'spark' | 'drop' | 'form' | 'lattice' | 'orbit' | 'universe';
export const STAGES: Stage[] = ['spark', 'drop', 'form', 'lattice', 'orbit', 'universe'];
export const STAGE_LABEL: Record<Stage, string> = {
  spark: 'Spark',
  drop: 'Drop',
  form: 'Form',
  lattice: 'Lattice',
  orbit: 'Orbit',
  universe: 'Universe',
};
export const STAGE_MEANING: Record<Stage, string> = {
  spark: 'Idea captured',
  drop: 'Directions explored',
  form: 'Direction chosen',
  lattice: 'System built',
  orbit: 'Motion and space in',
  universe: 'Live',
};
