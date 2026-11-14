import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Core, defaultCoreTarget, type CoreTarget } from '../../experience/scene/Core';
import { Particles } from '../../experience/scene/Particles';
import { useQuality } from '../../lib/quality';
import type { SpaceSettings } from '../../data/types';

function Rig({ target, space, burst }: { target: CoreTarget; space?: SpaceSettings; burst: number }) {
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    if (space) {
      target.morph = space.morph;
      target.violet = space.violet;
      target.cobalt = space.cobalt;
      target.key = space.key;
      target.spin = space.spin;
      target.film = space.film;
      target.rough = space.roughness * 1.6;
    }
    if (burst > 0) {
      const k = Math.min(1, t.current / 1.4);
      target.scale = THREE.MathUtils.lerp(1, 0.05, k);
      target.glow = k;
    }
  });
  return null;
}

/**
 * A small real-time view of the Core for the workspace: Space mode, asset previews,
 * the forming moment in the creation flow and the launch moment after publishing.
 */
export default function CoreViewport({
  morph = 1,
  space,
  controls = true,
  burst = 0,
  className = '',
  label,
}: {
  morph?: number;
  space?: SpaceSettings;
  controls?: boolean;
  burst?: number;
  className?: string;
  label: string;
}) {
  const tier = useQuality((s) => s.tier);
  const target = useMemo(() => ({ ...defaultCoreTarget(), morph }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { target.morph = morph; }, [morph, target]);
  const particles = useMemo(() => ({ intro: 1, galaxy: burst > 0 ? 1 : 0, dust: 0.6, core: new THREE.Vector3() }), [burst]);

  if (tier === 'still') {
    return <div className={`flex items-center justify-center bg-black text-sm text-text-3 ${className}`} role="img" aria-label={`${label} (still mode)`}>Real-time 3D is off in Still mode</div>;
  }
  return (
    <div className={className} role="img" aria-label={label}>
      <div className="relative h-full w-full bg-black">
      <Canvas dpr={[1, tier === 'full' ? 1.5 : 1.2]} camera={{ fov: 35, position: [0, 0.3, 6.2] }} gl={{ antialias: true, alpha: false }} onCreated={({ gl }) => gl.setClearColor('#000000')}>
        <Suspense fallback={null}>
          <Rig target={target} space={space} burst={burst} />
          {burst > 0 ? <Particles count={tier === 'full' ? 9000 : 4000} target={particles} /> : null}
          <Core target={target} steps={tier === 'full' ? 96 : 64} ao={tier === 'full' ? 4 : 2} interactive={!controls} />
          {controls ? <OrbitControls enablePan={false} minDistance={3.5} maxDistance={10} enableDamping /> : null}
        </Suspense>
      </Canvas>
      </div>
    </div>
  );
}
