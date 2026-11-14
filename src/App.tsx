import { lazy, Suspense, useEffect } from 'react';
import { useRoute } from './lib/router';
import { useQuality } from './lib/quality';
import LightCursor from './components/LightCursor';
import PortalOverlay from './components/PortalOverlay';
import Toaster from './app/components/Toaster';
import Story from './experience/Story';
import NotFound from './app/pages/NotFound';
import { perfEnabled } from './lib/perf';

const Workspace = lazy(() => import('./app/Workspace'));
// development diagnostics: its code is only downloaded when enabled (dev server or ?perf)
const PerfOverlay = lazy(() => import('./components/PerfOverlay'));
const showPerf = perfEnabled();

export default function App() {
  const route = useRoute();
  const tier = useQuality((s) => s.tier);
  const reduced = useQuality((s) => s.reducedMotion);

  // Still mode and reduced motion both switch the whole UI to opacity-only motion
  useEffect(() => {
    document.documentElement.classList.toggle('motion-off', tier === 'still' || reduced);
  }, [tier, reduced]);

  useEffect(() => {
    const titles: Record<string, string> = {
      story: 'ÆTHER — Beyond the interface',
      start: 'New project · ÆTHER',
      workspace: 'Home · ÆTHER',
      projects: 'Projects · ÆTHER',
      library: 'Library · ÆTHER',
      activity: 'Activity · ÆTHER',
      'brand-kit': 'Brand kit · ÆTHER',
      project: 'Canvas · ÆTHER',
      launch: 'Launch · ÆTHER',
      'not-found': 'Not formed yet · ÆTHER',
    };
    document.title = titles[route.name] ?? 'ÆTHER';
  }, [route.name]);

  return (
    <>
      {route.name === 'story' ? (
        <Story key="story" anchor={route.anchor} />
      ) : route.name === 'not-found' ? (
        <NotFound />
      ) : (
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
          <Workspace route={route} />
        </Suspense>
      )}
      <PortalOverlay />
      <Toaster />
      <LightCursor />
      {showPerf ? (
        <Suspense fallback={null}>
          <PerfOverlay />
        </Suspense>
      ) : null}
    </>
  );
}
