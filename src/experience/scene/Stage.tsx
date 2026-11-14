import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { EffectComposer, Bloom, Noise, Vignette, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { DT_CAP } from './Core';
import { Core } from './Core';
import { Particles } from './Particles';
import { Atmosphere } from './Atmosphere';
import { GlassStack } from './GlassStack';
import { StudioEnvironment } from './StudioEnvironment';
import { compose, createShot } from './choreography';
import { live } from '../director';
import { tierSettings, useQuality, type Tier } from '../../lib/quality';
import { logPerf, perfEnabled, setRenderer } from '../../lib/perf';

/** Drives the camera from the choreography, with pointer parallax and damping. */
function Director({ shot }: { shot: ReturnType<typeof createShot> }) {
  const { camera, size } = useThree();
  const cur = useRef({ cam: new THREE.Vector3(0, 0.2, 7.6), look: new THREE.Vector3(), px: 0, py: 0, fov: 35 });
  useFrame((_, dt) => {
    const d = Math.min(dt, DT_CAP);
    compose(shot, size.width / Math.max(1, size.height));
    const c = cur.current;
    c.px = THREE.MathUtils.damp(c.px, live.px, 2.2, d);
    c.py = THREE.MathUtils.damp(c.py, live.py, 2.2, d);
    const k = 2.4;
    c.cam.x = THREE.MathUtils.damp(c.cam.x, shot.cam.x + c.px * 0.38, k, d);
    c.cam.y = THREE.MathUtils.damp(c.cam.y, shot.cam.y + c.py * 0.22, k, d);
    c.cam.z = THREE.MathUtils.damp(c.cam.z, shot.cam.z, k, d);
    c.look.x = THREE.MathUtils.damp(c.look.x, shot.look.x, k, d);
    c.look.y = THREE.MathUtils.damp(c.look.y, shot.look.y, k, d);
    c.look.z = THREE.MathUtils.damp(c.look.z, shot.look.z, k, d);
    c.fov = THREE.MathUtils.damp(c.fov, shot.fov, k, d);
    camera.position.copy(c.cam);
    camera.lookAt(c.look);
    const pc = camera as THREE.PerspectiveCamera;
    if (Math.abs(pc.fov - c.fov) > 0.01) {
      pc.fov = c.fov;
      pc.updateProjectionMatrix();
    }
  });
  return null;
}

function ReadySignal() {
  const sent = useRef(0);
  useFrame(() => {
    sent.current += 1;
    if (sent.current === 3) window.dispatchEvent(new Event('aether:scene-ready'));
  });
  return null;
}

/** Development diagnostics: renderer facts for the performance overlay (only mounted with ?perf). */
function PerfProbe({ dprCap }: { dprCap: number }) {
  const { gl } = useThree();
  const last = useRef(0);
  useEffect(() => {
    const ctx = gl.getContext();
    let gpu = '';
    try {
      const ext = ctx.getExtension('WEBGL_debug_renderer_info');
      gpu = String(ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER));
    } catch { gpu = 'unknown'; }
    setRenderer({ status: 'running', api: gl.capabilities.isWebGL2 ? 'WebGL 2' : 'WebGL 1', gpu });
    // count every pass of a frame (post-processing renders several times), not just the last one
    const auto = gl.info.autoReset;
    gl.info.autoReset = false;
    const canvas = gl.domElement;
    const lost = () => { setRenderer({ status: 'lost' }); logPerf('context', 'WebGL context lost'); };
    const restored = () => { setRenderer({ status: 'running' }); logPerf('context', 'WebGL context restored'); };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    return () => {
      gl.info.autoReset = auto;
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      setRenderer({ status: 'none' });
    };
  }, [gl]);
  useEffect(() => { setRenderer({ dprCap }); }, [dprCap]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (t - last.current >= 0.5) {
      last.current = t;
      setRenderer({
        dpr: gl.getPixelRatio(),
        canvas: [gl.domElement.width, gl.domElement.height],
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        programs: gl.info.programs?.length ?? 0,
        textures: gl.info.memory.textures,
      });
    }
    gl.info.reset();
  });
  return null;
}

function Scene({ tier, onSlow }: { tier: Exclude<Tier, 'still'>; onSlow: () => void }) {
  const shot = useMemo(() => createShot(), []);
  const settings = tierSettings[tier];
  const downgrade = useQuality((s) => s.downgrade);
  const [focus, setFocus] = useState(-1);
  useEffect(() => {
    live.focusLayer = focus;
  }, [focus]);
  return (
    <>
      <Director shot={shot} />
      <ReadySignal />
      <StudioEnvironment resolution={tier === 'full' ? 256 : 64} />
      <Atmosphere target={shot.atmosphere} />
      <Particles count={settings.particles} target={shot.particles} />
      <GlassStack target={shot.stack} onFocus={(i) => { setFocus(i); window.dispatchEvent(new CustomEvent('aether:layer', { detail: i })); }} />
      <Core target={shot.core} steps={settings.steps} ao={settings.ao} lens />
      <PerformanceMonitor
        flipflops={2}
        onDecline={() => (tier === 'full' ? downgrade('Lighter rendering after a slow frame rate') : onSlow())}
      />
      {settings.post ? (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.62} luminanceSmoothing={0.22} radius={0.72} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Noise premultiply opacity={0.5} />
          <Vignette offset={0.28} darkness={0.72} />
        </EffectComposer>
      ) : null}
    </>
  );
}

/**
 * One persistent WebGL canvas behind the whole story. DOM scrolls over it; pointer events are
 * read from the page root so both the 3D Core and the DOM stay interactive.
 */
export default function Stage({ eventSource, active }: { eventSource: React.RefObject<HTMLElement | null>; active: boolean }) {
  const tier = useQuality((s) => s.tier);
  const [cap, setCap] = useState<number | null>(null);
  const perfOn = perfEnabled();
  useEffect(() => {
    if (!perfOn) return;
    if (tier === 'still') setRenderer({ status: 'still', dpr: 0, canvas: [0, 0], calls: 0, triangles: 0 });
    else setRenderer({ status: active ? 'running' : 'paused' });
  }, [perfOn, tier, active]);
  if (tier === 'still') return null;
  const settings = tierSettings[tier];
  const dpr: [number, number] = [1, cap ?? settings.dpr[1]];
  return (
    <div className="fixed inset-0 z-0" aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <Canvas
        key={tier}
        dpr={dpr}
        eventSource={eventSource as React.RefObject<HTMLElement>}
        eventPrefix="client"
        frameloop={active ? 'always' : 'never'}
        camera={{ fov: 35, near: 0.1, far: 80, position: [0, 0.2, 7.6] }}
        gl={{ antialias: tier === 'full' ? false : true, powerPreference: 'high-performance', alpha: false, stencil: false }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor('#000000', 1);
          gl.toneMapping = settings.post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          scene.background = new THREE.Color('#000000');
        }}
      >
        <Suspense fallback={null}>
          <Scene
            tier={tier}
            onSlow={() => {
              if (cap === 1) return;
              setCap(1);
              logPerf('dpr', `${tier}: pixel ratio capped at 1 after slow frames`);
            }}
          />
          {perfOn ? <PerfProbe dprCap={dpr[1]} /> : null}
        </Suspense>
      </Canvas>
    </div>
  );
}
