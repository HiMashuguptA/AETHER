import { useEffect, useState } from 'react';
import { chapters } from './director';
import { renders } from '../data/assets';

type Key = keyof typeof renders;

/** Still tier: pre-rendered key frames from the same light rig, crossfaded per chapter. */
export default function StillBackdrop() {
  const [key, setKey] = useState<Key>('corewide');
  useEffect(() => {
    let raf = 0;
    const pick = (): Key => {
      const c = chapters;
      if (c.launch > 0.3) return 'universe';
      if (c.portal > 0.01) return 'core';
      if (c.platform > 0.15) return 'orbit';
      if (c.architecture > 0.01) return 'stack';
      if (c.showcase > 0.01) return 'orbit';
      if (c.evolution > 0.75) return 'orbit';
      if (c.evolution > 0.5) return 'lattice';
      if (c.evolution > 0.25) return 'form';
      if (c.evolution > 0.01 || c.tagline > 0.2) return 'core';
      if (c.intro < 0.6) return 'spark';
      return 'corewide';
    };
    const tick = () => {
      const k = pick();
      setKey((prev) => (prev === k ? prev : k));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="fixed inset-0 z-0" aria-hidden="true">
      {(Object.keys(renders) as Key[]).map((k) => (
        <img
          key={k}
          src={renders[k]}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
          style={{ opacity: k === key ? 0.85 : 0 }}
        />
      ))}
      <div className="absolute inset-0 bg-black/30" />
    </div>
  );
}
