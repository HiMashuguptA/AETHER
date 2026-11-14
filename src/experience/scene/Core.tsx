import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { coreFragment, coreVertex } from './coreShader';
import { setCursor } from '../../components/cursorBus';
import { lensAllowed, releaseLens, updateLens, type LensUniforms } from '../headlineLens';

/** Target values the Core eases toward. Mutated by the choreography or by app controls. */
export interface CoreTarget {
  x: number; y: number; z: number;
  scale: number;
  morph: number;
  split: number;
  glow: number;
  key: number; violet: number; cobalt: number; cyan: number;
  film: number;
  liquid: number;
  spin: number;
  rough?: number;
}

export const defaultCoreTarget = (): CoreTarget => ({
  x: 0, y: 0, z: 0, scale: 1, morph: 1, split: 0, glow: 0,
  key: 1, violet: 1, cobalt: 1, cyan: 1, film: 1, liquid: 1, spin: 0.12,
});

interface CoreProps {
  target: CoreTarget;
  steps: number;
  ao: number;
  interactive?: boolean;
  /** Damping speed; higher reacts faster. */
  lambda?: number;
  /** Refract the hero headline through the drop (story canvas only). */
  lens?: boolean;
}

const damp = THREE.MathUtils.damp;
export const DT_CAP = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nocap') ? 1 : 1 / 20;

/** Radius that encloses each state (object space), blended between neighbours. */
function boundFor(morph: number, split: number) {
  const B = [1.9, 1.9, 1.62, 1.08, 2.2, 2.2];
  const m = Math.min(5, Math.max(0, morph));
  const i = Math.floor(m);
  const f = m - i;
  const a = B[i];
  const b2 = B[Math.min(5, i + 1)];
  const base = f > 0.001 ? Math.max(a, b2) + 0.08 : a;
  return Math.max(base, split > 0.01 ? 2.15 : 0);
}

export function Core({ target, steps, ao, interactive = true, lambda = 3.2, lens = false }: CoreProps) {
  const group = useRef<THREE.Group>(null!);
  const mesh = useRef<THREE.Mesh>(null!);
  const { invalidate } = useThree();
  const lensOk = useMemo(() => lens && lensAllowed().ok, [lens]);
  const centre = useMemo(() => new THREE.Vector3(), []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: coreVertex,
        fragmentShader: coreFragment,
        side: THREE.BackSide,
        depthWrite: true,
        depthTest: true,
        defines: { MAX_STEPS: steps, AO_STEPS: Math.max(1, ao) },
        uniforms: {
          uTime: { value: 0 },
          uMorph: { value: target.morph },
          uSplit: { value: 0 },
          uInvModel: { value: new THREE.Matrix4() },
          uModel: { value: new THREE.Matrix4() },
          uBound: { value: 2.35 },
          uRipplePos: { value: new THREE.Vector3() },
          uRippleT: { value: 10 },
          uRippleAmp: { value: 0 },
          uHoverPos: { value: new THREE.Vector3() },
          uHoverAmp: { value: 0 },
          uKey: { value: 1 },
          uViolet: { value: 1 },
          uCobalt: { value: 1 },
          uCyan: { value: 1 },
          uGlow: { value: 0 },
          uFilm: { value: 1 },
          uLiquid: { value: 1 },
          uRough: { value: 0 },
          uLensOn: { value: 0 },
          uLens: { value: new THREE.Vector4() },
          uTextRect: { value: new THREE.Vector4(0, 0, 1, 1) },
          uText: { value: null },
          uTextAmt: { value: 0 },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, ao],
  );
  useEffect(() => () => {
    if (lens) releaseLens(material.uniforms as unknown as LensUniforms);
    material.dispose();
  }, [material, lens]);

  // current (damped) values
  const cur = useRef({ ...target, hover: 0 });
  const motion = useRef({ rx: 0.18, ry: 0, vx: 0, vy: 0, dragging: false, lastX: 0, lastY: 0, hoverTarget: 0 });
  const hoverPos = useRef(new THREE.Vector3());

  useFrame((state, dt) => {
    const d = Math.min(dt, DT_CAP);
    const c = cur.current;
    const t = target;
    c.x = damp(c.x, t.x, lambda, d);
    c.y = damp(c.y, t.y, lambda, d);
    c.z = damp(c.z, t.z, lambda, d);
    c.scale = damp(c.scale, t.scale, lambda, d);
    c.morph = damp(c.morph, t.morph, lambda * 0.9, d);
    c.split = damp(c.split, t.split, lambda, d);
    c.glow = damp(c.glow, t.glow, lambda, d);
    c.key = damp(c.key, t.key, lambda, d);
    c.violet = damp(c.violet, t.violet, lambda, d);
    c.cobalt = damp(c.cobalt, t.cobalt, lambda, d);
    c.cyan = damp(c.cyan, t.cyan, lambda, d);
    c.film = damp(c.film, t.film, lambda, d);
    c.liquid = damp(c.liquid, t.liquid, lambda, d);

    const m = motion.current;
    if (!m.dragging) {
      m.vy = damp(m.vy, t.spin, 1.6, d);
      m.vx = damp(m.vx, 0, 2.2, d);
      m.rx = damp(m.rx, 0.18, 0.6, d);
    }
    m.ry += m.vy * d;
    m.rx += m.vx * d;
    c.hover = damp(c.hover, m.hoverTarget, 6, d);

    const g = group.current;
    g.position.set(c.x, c.y, c.z);
    g.scale.setScalar(Math.max(0.0001, c.scale));
    g.rotation.set(m.rx, m.ry, 0.05);
    g.updateMatrixWorld();

    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uMorph.value = c.morph;
    u.uSplit.value = c.split;
    u.uKey.value = c.key;
    u.uViolet.value = c.violet;
    u.uCobalt.value = c.cobalt;
    u.uCyan.value = c.cyan;
    u.uGlow.value = c.glow;
    u.uFilm.value = c.film;
    u.uLiquid.value = c.liquid;
    u.uRough.value = THREE.MathUtils.damp(u.uRough.value, t.rough ?? 0, lambda, d);
    u.uHoverAmp.value = c.hover;
    u.uHoverPos.value.copy(hoverPos.current);
    u.uRippleT.value += d;
    u.uRippleAmp.value = u.uRippleT.value < 4 ? 1 : 0;
    // tight bounding sphere per state: fewer pixels march, far fewer wasted steps
    const b = boundFor(c.morph, c.split);
    u.uBound.value = b;
    mesh.current.scale.setScalar(b / 2.35);
    (u.uModel.value as THREE.Matrix4).copy(g.matrixWorld);
    (u.uInvModel.value as THREE.Matrix4).copy(g.matrixWorld).invert();
    if (lens) {
      centre.setFromMatrixPosition(g.matrixWorld);
      updateLens(u as unknown as LensUniforms, state.camera, centre, Math.max(0.0001, c.scale), state.size, state.viewport.dpr, lensOk);
    }
    invalidate();
  });

  const toObject = (p: THREE.Vector3) => {
    const local = group.current.worldToLocal(p.clone());
    return local.normalize();
  };

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    hoverPos.current.copy(toObject(e.point));
    motion.current.hoverTarget = 1;
    const m = motion.current;
    if (m.dragging) {
      const dx = e.clientX - m.lastX;
      const dy = e.clientY - m.lastY;
      m.lastX = e.clientX;
      m.lastY = e.clientY;
      m.vy = dx * 0.35;
      m.vx = dy * 0.25;
      m.ry += dx * 0.006;
      m.rx = THREE.MathUtils.clamp(m.rx + dy * 0.004, -0.9, 0.9);
    }
  };
  const onOver = () => {
    if (!interactive) return;
    motion.current.hoverTarget = 1;
    setCursor({ label: 'Drag', variant: 'ring' });
  };
  const onOut = () => {
    motion.current.hoverTarget = 0;
    if (!motion.current.dragging) setCursor(null);
  };
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    const m = motion.current;
    m.dragging = true;
    m.lastX = e.clientX;
    m.lastY = e.clientY;
    (e.target as unknown as Element)?.setPointerCapture?.(e.pointerId);
    material.uniforms.uRipplePos.value.copy(toObject(e.point));
    material.uniforms.uRippleT.value = 0;
    setCursor({ label: 'Drag', variant: 'press' });
  };
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    const m = motion.current;
    m.dragging = false;
    (e.target as unknown as Element)?.releasePointerCapture?.(e.pointerId);
    setCursor(motion.current.hoverTarget ? { label: 'Drag', variant: 'ring' } : null);
  };

  return (
    <group ref={group}>
      <mesh ref={mesh} material={material} frustumCulled={false} renderOrder={1}>
        <sphereGeometry args={[2.35, 48, 32]} />
      </mesh>
      {/* invisible hit surface for pointer interaction */}
      <mesh onPointerMove={onMove} onPointerOver={onOver} onPointerOut={onOut} onPointerDown={onDown} onPointerUp={onUp}>
        <sphereGeometry args={[1.12, 24, 16]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} transparent opacity={0} />
      </mesh>
    </group>
  );
}
