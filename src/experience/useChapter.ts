import { useEffect, type RefObject } from 'react';
import { ScrollTrigger } from '../lib/scroll';
import { chapters, type ChapterKey } from './director';

/**
 * Bind a section's scroll progress (0 → 1) to a chapter in the director.
 * Default range: the section's top hits the viewport top → its bottom hits the viewport bottom,
 * which is exactly the time a sticky (pinned) inner frame stays on screen.
 */
export function useChapter(
  ref: RefObject<HTMLElement | null>,
  key: ChapterKey,
  opts: { start?: string; end?: string; onUpdate?: (p: number) => void } = {},
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const st = ScrollTrigger.create({
      trigger: el,
      start: opts.start ?? 'top top',
      end: opts.end ?? 'bottom bottom',
      onUpdate: (self) => {
        chapters[key] = self.progress;
        opts.onUpdate?.(self.progress);
      },
      onRefresh: (self) => {
        chapters[key] = self.progress;
        opts.onUpdate?.(self.progress);
      },
    });
    return () => {
      st.kill();
      chapters[key] = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
