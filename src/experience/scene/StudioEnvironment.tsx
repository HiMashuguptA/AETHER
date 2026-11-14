import { Environment, Lightformer } from '@react-three/drei';

/**
 * The Stage 01 light rig as an environment map, so physical materials (the glass layers)
 * reflect the same studio as the ray-marched Core: cool overhead softbox, two strip lights,
 * violet rim from behind, cobalt fill low left, a small cyan kicker.
 */
export function StudioEnvironment({ resolution = 128 }: { resolution?: number }) {
  return (
    <Environment resolution={resolution} frames={1} background={false}>
      <color attach="background" args={['#050506']} />
      <Lightformer form="rect" intensity={2.2} color="#dcdde3" position={[-3, 6, 3]} scale={[6, 4, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={4} color="#dcdde3" position={[7, 0.6, 2.5]} scale={[0.35, 9, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={2.4} color="#dcdde3" position={[-7, 0.4, 0.8]} scale={[0.25, 7, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={1.6} color="#8b70ec" position={[4, 2, -6]} scale={[7, 5, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={1.2} color="#3a63d8" position={[-5, -1, -5]} scale={[5, 2.4, 1]} target={[0, 0, 0]} />
      <Lightformer form="circle" intensity={3} color="#62c8d9" position={[2.5, 6.5, 1.5]} scale={0.6} target={[0, 0, 0]} />
      <Lightformer form="ring" intensity={0.6} color="#dcdde3" position={[0, -0.15, 0]} rotation={[Math.PI / 2, 0, 0]} scale={14} />
    </Environment>
  );
}
