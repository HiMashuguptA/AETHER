import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DT_CAP } from './Core';

/**
 * One GPU particle system with three lives:
 *   awakening – dust spirals in from the dark and gathers into the point of light
 *   ambient   – released as drifting dust that gives the space depth and parallax
 *   universe  – reorganises into a rotating galaxy; every star is a published project
 * All motion happens in the vertex shader; the CPU only updates a few uniforms.
 */

const vertex = /* glsl */ `
uniform float uTime;
uniform float uIntro;
uniform float uGalaxy;
uniform float uSize;
uniform float uPixelRatio;
uniform float uDust;
uniform vec3 uCore;
attribute vec3 aStart;
attribute vec3 aGalaxy;
attribute vec4 aSeed;
varying vec3 vColor;
varying float vAlpha;

const vec3 SILVER = vec3(0.7157, 0.7231, 0.7682);
const vec3 VIOLET = vec3(0.2582, 0.1620, 0.8388);
const vec3 COBALT = vec3(0.0423, 0.1248, 0.6867);
const vec3 CYAN   = vec3(0.1221, 0.5776, 0.6939);

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

void main() {
  float seed = aSeed.x;
  // 1. gathering along a spiral
  float conv = smoothstep(0.06 + seed * 0.18, 0.5 + seed * 0.08, uIntro);
  vec3 s = aStart;
  s.xz = rot(conv * (2.4 + aSeed.w * 2.2)) * s.xz;
  vec3 gathered = mix(s, uCore + normalize(aStart) * 0.04, conv * conv);
  // 2. released into ambient dust
  float rel = smoothstep(0.6 + seed * 0.1, 0.98, uIntro);
  vec3 dust = position;
  float tt = uTime * (0.05 + aSeed.w * 0.08);
  dust += vec3(sin(tt + seed * 40.0), cos(tt * 0.8 + seed * 20.0), sin(tt * 0.6 + seed * 9.0)) * (0.25 + aSeed.y * 0.35);
  vec3 p = mix(gathered, dust, rel);
  // 3. galaxy
  vec3 g = aGalaxy;
  float r = length(g.xz);
  g.xz = rot(uTime * 0.05 / (0.35 + r * 0.18)) * g.xz;
  float gk = smoothstep(seed * 0.35, 0.65 + seed * 0.35, uGalaxy);
  p = mix(p, g, gk);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float size = uSize * (0.45 + aSeed.y * 1.1);
  size *= mix(1.0, 1.6, (1.0 - rel) * conv);
  gl_PointSize = size * uPixelRatio * (8.0 / max(0.5, -mv.z));

  float pick = aSeed.z;
  vec3 col = pick < 0.55 ? SILVER : (pick < 0.82 ? VIOLET * 1.6 : (pick < 0.93 ? CYAN * 1.3 : COBALT * 1.8));
  float gr = clamp(r / 8.0, 0.0, 1.0);
  vec3 gcol = mix(SILVER * 1.4 + VIOLET * 0.6, pick < 0.5 ? VIOLET * 1.8 : COBALT * 2.0, gr);
  vColor = mix(col, gcol, gk);

  float appear = smoothstep(0.0, 0.12, uIntro);
  float twinkle = 0.75 + 0.25 * sin(uTime * (1.0 + aSeed.w * 3.0) + seed * 50.0);
  float near = smoothstep(0.4, 2.0, -mv.z);
  float dustA = mix(1.0, uDust, rel * (1.0 - gk));
  vAlpha = appear * twinkle * near * dustA * mix(0.55, 0.9, gk) * (0.35 + aSeed.y * 0.65);
}
`;

const fragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface ParticleTarget { intro: number; galaxy: number; dust: number; core: THREE.Vector3 }

function gamma(rand: () => number, k: number, theta: number) {
  // sum of exponentials approximates a gamma distribution for small integer-ish k
  let s = 0;
  const n = Math.max(1, Math.round(k * 2));
  for (let i = 0; i < n; i++) s += -Math.log(1 - rand() * 0.999999);
  return (s / 2) * theta;
}

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function Particles({ count, target }: { count: number; target: ParticleTarget }) {
  const { gl } = useThree();
  const geometry = useMemo(() => {
    const rand = mulberry(1337);
    const pos = new Float32Array(count * 3);
    const start = new Float32Array(count * 3);
    const galaxy = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    const tilt = new THREE.Matrix4().makeRotationX(0.42).multiply(new THREE.Matrix4().makeRotationZ(0.12));
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      // ambient dust: a volume around the story's camera path, denser near the middle
      const r = 2.4 + Math.pow(rand(), 1.6) * 15;
      const th = rand() * Math.PI * 2;
      const ph = Math.acos(2 * rand() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th) * 1.4;
      pos[i * 3 + 1] = r * Math.cos(ph) * 0.65;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) - 2;
      // awakening start: a wide flattened spiral in the dark
      const sr = 4 + rand() * 12;
      const sa = rand() * Math.PI * 2;
      start[i * 3] = Math.cos(sa) * sr;
      start[i * 3 + 1] = (rand() - 0.5) * 3.2;
      start[i * 3 + 2] = Math.sin(sa) * sr * 0.7 - 1;
      // galaxy: three logarithmic arms on a tilted disc
      const arm = Math.floor(rand() * 3);
      const t = gamma(rand, 1.6, 0.42);
      const spread = (rand() - 0.5 + (rand() - 0.5)) * 0.32 / (0.5 + t);
      const ang = (arm * 2 * Math.PI) / 3 + t * 2.4 + spread;
      const rr = t * 3.4 + (rand() - 0.5) * 0.25;
      v.set(Math.cos(ang) * rr, (rand() - 0.5) * 0.18 * Math.exp(-t * 0.6), Math.sin(ang) * rr);
      v.applyMatrix4(tilt);
      galaxy[i * 3] = v.x;
      galaxy[i * 3 + 1] = v.y;
      galaxy[i * 3 + 2] = v.z;
      seed[i * 4] = rand();
      seed[i * 4 + 1] = rand();
      seed[i * 4 + 2] = rand();
      seed[i * 4 + 3] = rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
    g.setAttribute('aGalaxy', new THREE.BufferAttribute(galaxy, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);
    return g;
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uIntro: { value: 0 },
          uGalaxy: { value: 0 },
          uSize: { value: 2.2 },
          uPixelRatio: { value: 1 },
          uDust: { value: 1 },
          uCore: { value: new THREE.Vector3() },
        },
      }),
    [],
  );
  useEffect(() => () => { geometry.dispose(); }, [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  const cur = useRef({ galaxy: 0, dust: 1 });
  useFrame((state, dt) => {
    const d = Math.min(dt, DT_CAP);
    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uIntro.value = target.intro;
    cur.current.galaxy = THREE.MathUtils.damp(cur.current.galaxy, target.galaxy, 2.4, d);
    cur.current.dust = THREE.MathUtils.damp(cur.current.dust, target.dust, 3, d);
    u.uGalaxy.value = cur.current.galaxy;
    u.uDust.value = cur.current.dust;
    u.uPixelRatio.value = gl.getPixelRatio();
    u.uCore.value.copy(target.core);
  });

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}
