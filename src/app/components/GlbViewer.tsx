import { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { WarningCircle } from '@phosphor-icons/react';

type Loaded = { scene: THREE.Group } | { error: string } | null;

/** Loads a .glb from the API (same origin, so the session cookie goes with it). No decoders are fetched from other sites. */
function useGlb(url: string): Loaded {
  const [state, setState] = useState<Loaded>(null);
  useEffect(() => {
    let alive = true;
    setState(null);
    new GLTFLoader().load(
      url,
      (gltf) => { if (alive) setState({ scene: gltf.scene }); else dispose(gltf.scene); },
      undefined,
      (err) => {
        const msg = String((err as Error)?.message ?? err);
        if (alive) setState({ error: /draco|meshopt|KHR_|extension/i.test(msg) ? 'This model uses a compression format the preview cannot decode. Download it to open it in a 3D tool.' : 'This model could not be previewed. The file may be damaged.' });
      },
    );
    return () => { alive = false; };
  }, [url]);
  useEffect(() => () => { if (state && 'scene' in state) dispose(state.scene); }, [state]);
  return state;
}

function dispose(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
}

/** Neutral studio lighting generated on the GPU; nothing is downloaded. */
function Studio() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return null;
}

/** Centre the model and scale it to fit the view. */
function Fitted({ scene }: { scene: THREE.Group }) {
  const group = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const s = 2.2 / Math.max(size.x, size.y, size.z, 1e-3);
    const g = new THREE.Group();
    scene.position.sub(centre);
    g.add(scene);
    g.scale.setScalar(s);
    return g;
  }, [scene]);
  return <primitive object={group} />;
}

export default function GlbViewer({ url, label }: { url: string; label: string }) {
  const loaded = useGlb(url);
  if (loaded && 'error' in loaded) {
    return <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#0c0c0e] p-6 text-center text-sm text-text-3"><WarningCircle size={24} className="text-yellow-500" />{loaded.error}</div>;
  }
  return (
    <div className="relative h-full w-full bg-[#0c0c0e]" role="img" aria-label={label}>
      {!loaded ? <p className="mono-label absolute inset-0 flex items-center justify-center text-text-3">Loading model…</p> : null}
      <Canvas dpr={[1, 2]} camera={{ position: [2.6, 1.4, 2.6], fov: 40 }} gl={{ antialias: true, alpha: true }}>
        <Studio />
        <ambientLight intensity={0.25} />
        <directionalLight position={[3, 4, 2]} intensity={1.4} color="#ffffff" />
        <directionalLight position={[-3, -1, -2]} intensity={0.8} color="#8b70ec" />
        {loaded && 'scene' in loaded ? <Fitted scene={loaded.scene} /> : null}
        <OrbitControls enablePan={false} minDistance={1.5} maxDistance={8} autoRotate autoRotateSpeed={0.6} />
      </Canvas>
    </div>
  );
}
