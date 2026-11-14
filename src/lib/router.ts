import { useSyncExternalStore } from 'react';

/**
 * Tiny hash router. Hashes are plain names (letters, digits, hyphens) so they survive
 * the artifact host and can be bookmarked:
 *   (empty)            → cinematic story
 *   #start             → creation flow
 *   #workspace         → dashboard
 *   #projects          → project management
 *   #library           → asset library
 *   #activity          → activity
 *   #brand-kit         → workspace brand kit
 *   #project-<id>      → project canvas
 *   #launch-<id>       → preview and publish
 */
export type Route =
  | { name: 'story'; anchor?: string }
  | { name: 'start' }
  | { name: 'workspace' }
  | { name: 'projects' }
  | { name: 'library' }
  | { name: 'activity' }
  | { name: 'brand-kit' }
  | { name: 'project'; id: string }
  | { name: 'launch'; id: string }
  | { name: 'not-found'; hash: string };

const STORY_ANCHORS = new Set(['main', 'awakening', 'spark', 'evolution', 'showcase', 'architecture', 'platform', 'portal', 'launch-story']);

export function parse(hash: string): Route {
  const h = hash.replace(/^#/, '');
  if (!h || STORY_ANCHORS.has(h)) return { name: 'story', anchor: h || undefined };
  if (h === 'start') return { name: 'start' };
  if (h === 'workspace') return { name: 'workspace' };
  if (h === 'projects') return { name: 'projects' };
  if (h === 'library') return { name: 'library' };
  if (h === 'activity') return { name: 'activity' };
  if (h === 'brand-kit') return { name: 'brand-kit' };
  let m = /^project-([a-z0-9-]+)$/.exec(h);
  if (m) return { name: 'project', id: m[1] };
  m = /^launch-([a-z0-9-]+)$/.exec(h);
  if (m) return { name: 'launch', id: m[1] };
  return { name: 'not-found', hash: h };
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

let cachedHash = '';
let cachedRoute: Route = { name: 'story' };
function snapshot(): Route {
  const h = window.location.hash;
  if (h !== cachedHash) {
    cachedHash = h;
    cachedRoute = parse(h);
  }
  return cachedRoute;
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot, () => ({ name: 'story' }) as Route);
}

type DocWithVT = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };

/** Navigate to a hash route. Uses the View Transitions API when available. */
export function navigate(hash: string, opts: { transition?: boolean } = {}) {
  const target = hash.startsWith('#') ? hash : `#${hash}`;
  const go = () => {
    if (target === '#' || target === '#story') {
      history.pushState(null, '', window.location.pathname + window.location.search);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else {
      window.location.hash = target;
    }
  };
  const doc = document as DocWithVT;
  const reduced = document.documentElement.classList.contains('motion-off');
  if (opts.transition !== false && doc.startViewTransition && !reduced) {
    // Wait for the hashchange to re-render React before the new snapshot is taken.
    doc.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          const done = () => requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          window.addEventListener('hashchange', done, { once: true });
          go();
          setTimeout(resolve, 400);
        }) as unknown as void,
    );
  } else {
    go();
  }
}

export function isAppRoute(r: Route) {
  return r.name !== 'story' && r.name !== 'not-found';
}
