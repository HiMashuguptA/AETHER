/**
 * The director is the single source of truth shared by the DOM story and the WebGL scene.
 * ScrollTrigger writes chapter progress (0 → 1) here; the scene reads it every frame and
 * derives camera, Core and particle state from it. Nothing is tweened twice, so scrubbing
 * backwards always reverses the film exactly.
 */
export const chapters = {
  intro: 0, // awakening timeline (time-based, not scroll)
  hero: 0, // hero transformation
  tagline: 0,
  evolution: 0,
  showcase: 0,
  architecture: 0,
  platform: 0,
  portal: 0,
  launch: 0,
};
export type ChapterKey = keyof typeof chapters;

export const live = {
  /** Pointer in normalised device coords (-1 → 1). */
  px: 0,
  py: 0,
  /** Index of the architecture layer the visitor is focusing (-1 none). */
  focusLayer: -1,
  /** Muse split step in evolution (0 → 1). */
  split: 0,
  /** Set when the story route is visible; the scene idles otherwise. */
  visible: true,
  /** Pulse fired when a CTA is pressed: brightens the Core briefly. */
  flash: 0,
};

export function resetChapters() {
  (Object.keys(chapters) as ChapterKey[]).forEach((k) => {
    if (k !== 'intro') chapters[k] = 0;
  });
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Map a progress value into a sub-range and ease it. */
export const range = (x: number, a: number, b: number) => smooth(a, b, x);
