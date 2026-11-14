import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { DT_CAP } from './Core';
import { live } from '../director';

/**
 * Chapter 04: five layers of smoked glass. Scroll explodes them apart, a pulse of light travels down
 * through Intent → Muse → Lattice → Kinetic → Launch, and focusing a layer (from the DOM list or by
 * pointing at it) lifts it and lights its edge.
 */

export const LAYERS = ['Intent', 'Muse', 'Lattice', 'Kinetic', 'Launch'] as const;

const glowVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const glowFragment = /* glsl */ `
uniform float uPulse;
uniform float uFocus;
uniform float uShow;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p * vec2(1.0, 1.45));
  float spot = exp(-r * r * 18.0);
  float a = (spot * (0.18 + 1.4 * uPulse) + spot * 0.6 * uFocus) * uShow;
  gl_FragColor = vec4(uColor * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface StackTarget { show: number; explode: number; x: number; y: number; z: number; scale: number }

export function GlassStack({ target, onFocus }: { target: StackTarget; onFocus?: (i: number) => void }) {
  const group = useRef<THREE.Group>(null!);
  const layers = useRef<THREE.Group[]>([]);
  const edgeMats = useRef<(THREE.LineBasicMaterial | null)[]>([]);
  const glassMats = useRef<(THREE.MeshPhysicalMaterial | null)[]>([]);
  const glowMats = useMemo(
    () =>
      LAYERS.map(
        (_, i) =>
          new THREE.ShaderMaterial({
            vertexShader: glowVertex,
            fragmentShader: glowFragment,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            uniforms: {
              uPulse: { value: 0 },
              uFocus: { value: 0 },
              uShow: { value: 0 },
              uColor: { value: new THREE.Color().lerpColors(new THREE.Color(0.2582, 0.162, 0.8388), new THREE.Color(0.0423, 0.1248, 0.6867), i / 4).multiplyScalar(1.2).add(new THREE.Color(0.18, 0.18, 0.2)) },
            },
          }),
      ),
    [],
  );
  const cur = useRef({ show: 0, explode: 0, focus: LAYERS.map(() => 0), hover: -1 });
  const violet = useMemo(() => new THREE.Color('#a48dff'), []);
  const silver = useMemo(() => new THREE.Color('#c4c5cb'), []);

  useFrame((state, dt) => {
    const d = Math.min(dt, DT_CAP);
    const c = cur.current;
    c.show = THREE.MathUtils.damp(c.show, target.show, 3, d);
    c.explode = THREE.MathUtils.damp(c.explode, target.explode, 3, d);
    const g = group.current;
    g.visible = c.show > 0.005;
    if (!g.visible) return;
    g.position.set(target.x, target.y, target.z);
    g.scale.setScalar(target.scale * (0.92 + 0.08 * c.show));
    g.rotation.y = -0.62 + Math.sin(state.clock.elapsedTime * 0.15) * 0.06;

    const time = state.clock.elapsedTime;
    const focused = c.hover >= 0 ? c.hover : live.focusLayer;
    layers.current.forEach((layer, i) => {
      if (!layer) return;
      const f = (c.focus[i] = THREE.MathUtils.damp(c.focus[i], focused === i ? 1 : 0, 6, d));
      const gap = 0.14 + c.explode * 0.5;
      layer.position.y = (2 - i) * gap + f * 0.28;
      // the light pulse travels downward through the layers
      const phase = ((time * 0.42) % 1.4) - i * 0.22;
      const pulse = Math.exp(-Math.pow((phase - 0.2) * 5.5, 2)) * (0.35 + c.explode * 0.65);
      const gm = glowMats[i];
      gm.uniforms.uPulse.value = pulse;
      gm.uniforms.uFocus.value = f;
      gm.uniforms.uShow.value = c.show;
      const em = edgeMats.current[i];
      if (em) {
        em.color.copy(silver).lerp(violet, Math.min(1, f + pulse * 0.6));
        em.opacity = c.show * (0.35 + 0.55 * f + pulse * 0.3);
      }
      const glass = glassMats.current[i];
      if (glass) glass.opacity = c.show * (0.42 + f * 0.12);
    });
  });

  return (
    <group ref={group}>
      {LAYERS.map((name, i) => (
        <group
          key={name}
          ref={(el) => { if (el) layers.current[i] = el; }}
          onPointerOver={(e) => { e.stopPropagation(); cur.current.hover = i; onFocus?.(i); }}
          onPointerOut={() => { cur.current.hover = -1; onFocus?.(-1); }}
        >
          <RoundedBox args={[2.6, 0.045, 1.8]} radius={0.02} smoothness={2}>
            <meshPhysicalMaterial
              ref={(m) => { glassMats.current[i] = m; }}
              color="#16161c"
              metalness={0.15}
              roughness={0.14}
              clearcoat={1}
              clearcoatRoughness={0.08}
              envMapIntensity={1.6}
              transparent
              opacity={0}
              depthWrite={false}
            />
            <Edges threshold={20} scale={1.002}>
              <lineBasicMaterial ref={(m) => { edgeMats.current[i] = m; }} transparent opacity={0} color="#c4c5cb" toneMapped={false} />
            </Edges>
          </RoundedBox>
          <mesh material={glowMats[i]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
            <planeGeometry args={[2.4, 1.6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
