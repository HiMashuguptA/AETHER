import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DT_CAP } from './Core';

/**
 * Volumetric atmosphere without heavy post passes:
 *  - a light halo that sits behind the Core (the point of light in the awakening, the star at the end)
 *  - soft light shafts falling from the top left key light, layered for depth
 * Every colour here is a light source, never a painted background.
 */

const haloVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 scale = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  mv.xy += position.xy * scale;
  gl_Position = projectionMatrix * mv;
}
`;
const haloFragment = /* glsl */ `
uniform float uCore;
uniform float uHalo;
uniform float uStreak;
uniform float uTime;
varying vec2 vUv;
const vec3 VIOLET = vec3(0.2582, 0.1620, 0.8388);
const vec3 COBALT = vec3(0.0423, 0.1248, 0.6867);
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float core = exp(-r * r * 260.0) * 6.0 + exp(-r * r * 40.0) * 0.9;
  float halo = exp(-r * r * 4.5);
  float ana = exp(-abs(p.y) * 520.0) * exp(-abs(p.x) * 5.5) * 0.9 * uStreak;
  vec3 col = vec3(1.0, 0.98, 1.05) * (core + ana) * uCore;
  col += (VIOLET * 0.2 + COBALT * 0.05) * halo * uHalo * (0.9 + 0.1 * sin(uTime * 0.7));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const shaftVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const shaftFragment = /* glsl */ `
uniform float uIntensity;
uniform float uTime;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float soft = pow(max(across, 0.0), 2.2);
  float along = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  float flicker = 0.85 + 0.15 * sin(uTime * 0.5 + vUv.y * 3.0);
  float a = soft * along * uIntensity * flicker;
  gl_FragColor = vec4(uColor * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface AtmosphereTarget { coreLight: number; halo: number; shafts: number; corePos: THREE.Vector3; haloScale: number; streak: number }

export function Atmosphere({ target }: { target: AtmosphereTarget }) {
  const halo = useRef<THREE.Mesh>(null!);
  const haloMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: haloVertex,
        fragmentShader: haloFragment,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        uniforms: { uCore: { value: 0 }, uHalo: { value: 0.4 }, uStreak: { value: 1 }, uTime: { value: 0 } },
      }),
    [],
  );
  const shaftMats = useMemo(
    () =>
      [0.55, 0.35, 0.25].map(
        (k, i) =>
          new THREE.ShaderMaterial({
            vertexShader: shaftVertex,
            fragmentShader: shaftFragment,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            uniforms: {
              uIntensity: { value: 0 },
              uTime: { value: i * 2.1 },
              uColor: { value: i === 1 ? new THREE.Color(0.26, 0.18, 0.62).multiplyScalar(k * 0.6) : new THREE.Color(0.55, 0.56, 0.62).multiplyScalar(k * 0.55) },
            },
          }),
      ),
    [],
  );
  const cur = useRef({ core: 0, halo: 0.4, shafts: 0, scale: 6, streak: 1 });

  useFrame((state, dt) => {
    const d = Math.min(dt, DT_CAP);
    const c = cur.current;
    c.core = THREE.MathUtils.damp(c.core, target.coreLight, 4, d);
    c.halo = THREE.MathUtils.damp(c.halo, target.halo, 2.5, d);
    c.shafts = THREE.MathUtils.damp(c.shafts, target.shafts, 2, d);
    c.scale = THREE.MathUtils.damp(c.scale, target.haloScale, 3, d);
    c.streak = THREE.MathUtils.damp(c.streak, target.streak, 3, d);
    haloMat.uniforms.uStreak.value = c.streak;
    haloMat.uniforms.uCore.value = c.core;
    haloMat.uniforms.uHalo.value = c.halo;
    haloMat.uniforms.uTime.value = state.clock.elapsedTime;
    halo.current.position.copy(target.corePos);
    halo.current.position.z -= 0.6;
    halo.current.scale.setScalar(c.scale);
    shaftMats.forEach((m, i) => {
      m.uniforms.uIntensity.value = c.shafts * (i === 1 ? 0.8 : 1);
      m.uniforms.uTime.value = state.clock.elapsedTime + i * 2.1;
    });
  });

  return (
    <group>
      <mesh ref={halo} material={haloMat} renderOrder={0} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh material={shaftMats[0]} position={[-3.2, 3.2, -4]} rotation={[0, 0, 0.62]} renderOrder={0}>
        <planeGeometry args={[2.6, 16]} />
      </mesh>
      <mesh material={shaftMats[1]} position={[-1.2, 2.6, -6]} rotation={[0, 0.2, 0.5]} renderOrder={0}>
        <planeGeometry args={[4.2, 18]} />
      </mesh>
      <mesh material={shaftMats[2]} position={[-5.4, 2.2, -2]} rotation={[0, -0.2, 0.7]} renderOrder={0}>
        <planeGeometry args={[1.4, 14]} />
      </mesh>
    </group>
  );
}
