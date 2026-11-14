import * as THREE from 'three';
import { chapters, live, lerp, range } from '../director';
import type { CoreTarget } from './Core';
import type { StackTarget } from './GlassStack';
import type { ParticleTarget } from './Particles';
import type { AtmosphereTarget } from './Atmosphere';

export interface Shot {
  cam: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  core: CoreTarget;
  stack: StackTarget;
  particles: ParticleTarget;
  atmosphere: AtmosphereTarget;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Desktop hero: place the drop so its left edge lies across the end of the headline (Stage 01:
 * "the headline bends through the drop's edge"), measured from the real text layout so it holds
 * at every width. The intro paragraph may sit behind the drop too, but never more than 70% of a
 * radius deep. Uses the hero's resting camera (z 6.4, fov 35, looking at x 0.35).
 */
function heroAnchorX() {
  const t = live.heroText;
  if (!t.headRight || !t.height) return 1.0;
  const u = (2 * 6.4 * Math.tan(THREE.MathUtils.degToRad(35 / 2))) / t.height; // world units per px
  const R = 1 / u; // drop radius in px at hero scale 1
  const cx = Math.max(t.headRight + 0.6 * R, t.copyRight + 0.3 * R);
  return THREE.MathUtils.clamp(0.35 + (cx - t.width / 2) * u, 0.45, 1.7);
}

/**
 * The film. Given chapter progress (0 → 1 each), return where everything should be.
 * Chapters are sequential, so each block blends from the previous block's end state.
 * `aspect` lets portrait screens recompose instead of shrinking the desktop shot.
 */
export function compose(shot: Shot, aspect: number) {
  const portrait = aspect < 0.85;
  const c = chapters;
  const core = shot.core;
  const cam = shot.cam;
  const look = shot.look;

  // ---------- 01 Awakening (time-based) ----------
  const intro = c.intro;
  const form = range(intro, 0.5, 0.82);
  const settle = range(intro, 0.82, 1.0);
  const heroX = portrait ? 0 : heroAnchorX();
  const heroY = portrait ? 1.95 : 0.12;
  const heroScale = portrait ? 0.52 : 1.0;

  core.x = lerp(0, heroX, settle);
  core.y = lerp(0, heroY, settle);
  core.z = 0;
  core.scale = lerp(0.035, heroScale, form);
  core.morph = lerp(0, 1, form);
  core.glow = lerp(1, 0, range(intro, 0.55, 0.85));
  core.split = 0;
  core.key = lerp(0.2, 1, form);
  core.violet = lerp(0.4, 1, form);
  core.cobalt = 1;
  core.cyan = 1;
  core.film = 1;
  core.liquid = 1;
  core.spin = 0.12;

  cam.set(0, lerp(0.1, 0.25, settle), lerp(7.6, portrait ? 8.2 : 6.4, range(intro, 0.3, 1)));
  look.set(lerp(0, portrait ? 0 : 0.35, settle), lerp(0, portrait ? 0.35 : 0, settle), 0);
  shot.fov = portrait ? 46 : 35;

  shot.particles.intro = intro;
  shot.particles.galaxy = 0;
  shot.particles.dust = 1;

  shot.atmosphere.coreLight = lerp(lerp(0, 1.4, range(intro, 0.02, 0.2)), 0, range(intro, 0.6, 0.85));
  shot.atmosphere.halo = lerp(0.15, 0.55, range(intro, 0.1, 0.6));
  shot.atmosphere.haloScale = lerp(3, 7, form);
  shot.atmosphere.shafts = lerp(0, 0.7, range(intro, 0.6, 1));
  shot.atmosphere.streak = lerp(1, 0, range(intro, 0.62, 0.9));

  shot.stack.show = 0;
  shot.stack.explode = 0;

  // ---------- 02 The spark: hero transformation ----------
  const h = c.hero;
  if (h > 0) {
    const e = range(h, 0, 1);
    core.x = lerp(core.x, 0, e);
    core.y = lerp(core.y, portrait ? 0.15 : 0, e);
    core.scale = lerp(core.scale, portrait ? 0.95 : 1.15, e);
    cam.z = lerp(cam.z, portrait ? 5.2 : 3.9, e);
    cam.y = lerp(cam.y, 0.1, e);
    look.set(lerp(look.x, 0, e), lerp(look.y, 0, e), 0);
    core.spin = lerp(0.12, 0.35, e);
    shot.atmosphere.shafts = lerp(0.9, 0.4, e);
  }

  // ---------- tagline: inside the drop's light, then pull back ----------
  const t = c.tagline;
  if (t > 0) {
    const dim = range(t, 0, 0.35);
    const back = range(t, 0.6, 1);
    core.key = lerp(1, 0.42, dim * (1 - back));
    core.violet = lerp(1, 0.8, dim * (1 - back));
    shot.atmosphere.halo = lerp(0.55, 0.3, dim * (1 - back));
    shot.atmosphere.shafts = lerp(shot.atmosphere.shafts, 0.15, dim * (1 - back));
    const evoX = portrait ? 0 : 1.55;
    const evoY = portrait ? 1.05 : 0;
    core.x = lerp(core.x, evoX, back);
    core.y = lerp(core.y, evoY, back);
    core.scale = lerp(core.scale, portrait ? 0.7 : 1.0, back);
    cam.z = lerp(cam.z, portrait ? 8.4 : 6.6, back);
    look.x = lerp(look.x, portrait ? 0 : 0.55, back);
    look.y = lerp(look.y, portrait ? 0.45 : 0, back);
    core.spin = lerp(core.spin, 0.18, back);
  }

  // ---------- 03 Evolution: Drop → (Muse split) → Form → Lattice → Orbit ----------
  const ev = c.evolution;
  if (ev > 0) {
    const split = range(ev, 0.26, 0.36) * (1 - range(ev, 0.4, 0.5));
    core.split = split;
    live.split = split;
    let m = 1;
    m += range(ev, 0.4, 0.52); // → form
    m += range(ev, 0.55, 0.68); // → lattice
    m += range(ev, 0.78, 0.9); // → orbit
    core.morph = m;
    core.scale = lerp(core.scale, (portrait ? 0.7 : 1.0) * (m > 3.5 ? 0.78 : 1), range(ev, 0.75, 0.9));
    // the camera slowly orbits the object for depth
    const az = lerp(-0.18, 0.32, ev);
    const dist = portrait ? 8.4 : 6.6;
    const cx = core.x * 0.35;
    cam.x = cx + Math.sin(az) * dist * 0.35;
    cam.z = Math.cos(az) * dist;
    cam.y = lerp(cam.y, 0.35 + Math.sin(ev * Math.PI) * 0.5, range(ev, 0, 0.1));
    core.violet = lerp(core.violet, 1, range(ev, 0, 0.1));
    core.key = lerp(core.key, 1, range(ev, 0, 0.1));
    shot.atmosphere.halo = lerp(shot.atmosphere.halo, 0.5, range(ev, 0, 0.15));
  }

  // ---------- Showcase: the object recedes behind the gallery ----------
  const sc = c.showcase;
  if (sc > 0) {
    const e = range(sc, 0, 0.3);
    core.x = lerp(core.x, 0, e);
    core.y = lerp(core.y, portrait ? 3.6 : 1.35, e);
    core.z = lerp(core.z, -3.5, e);
    core.scale = lerp(core.scale, portrait ? 0.45 : 0.65, e);
    look.set(lerp(look.x, 0, e), lerp(look.y, 0.3, e), 0);
    cam.set(lerp(cam.x, 0, e), lerp(cam.y, 0.2, e), lerp(cam.z, portrait ? 8.8 : 7.2, e));
    core.spin = 0.22;
    shot.atmosphere.halo = lerp(shot.atmosphere.halo, 0.35, e);
    shot.particles.dust = lerp(1, 1.25, e);
  }

  // ---------- 04 Architecture: five layers of glass ----------
  const ar = c.architecture;
  const pf = c.platform;
  if (ar > 0) {
    const inE = range(ar, 0, 0.18);
    const sx = portrait ? 0 : 1.5;
    const sy = portrait ? 0.4 : -0.35;
    shot.stack.show = inE * (1 - range(pf, 0.05, 0.35));
    shot.stack.explode = range(ar, 0.2, 0.7);
    shot.stack.x = sx;
    shot.stack.y = sy;
    shot.stack.z = 0;
    shot.stack.scale = portrait ? 0.6 : 1;
    const top = sy + (2 * (0.14 + shot.stack.explode * 0.5) + 0.85) * shot.stack.scale;
    core.morph = lerp(core.morph, 1, inE);
    core.x = lerp(core.x, sx, inE);
    core.y = lerp(core.y, top, inE);
    core.z = lerp(core.z, 0, inE);
    core.scale = lerp(core.scale, 0.42, inE);
    core.spin = 0.3;
    const orbit = lerp(0.55, 0.85, ar);
    const dist = portrait ? 10.5 : 7.4;
    cam.set(
      lerp(cam.x, sx + Math.sin(orbit) * dist * 0.62, inE),
      lerp(cam.y, (portrait ? 3.6 : 3.1) + shot.stack.explode * 0.4, inE),
      lerp(cam.z, Math.cos(orbit) * dist, inE),
    );
    look.set(lerp(look.x, portrait ? sx : sx - 1.1, inE), lerp(look.y, portrait ? sy - 2.1 : sy + 0.55, inE), 0);
    shot.atmosphere.shafts = lerp(shot.atmosphere.shafts, 0.25, inE);
  }

  // ---------- Platform and workflow: the object drifts aside ----------
  if (pf > 0) {
    const e = range(pf, 0.05, 0.45);
    core.morph = lerp(core.morph, 4, range(pf, 0.2, 0.6));
    core.x = lerp(core.x, portrait ? 0 : -2.6, e);
    core.y = lerp(core.y, portrait ? -1.8 : 0.2, e);
    core.z = lerp(core.z, -2.5, e);
    core.scale = lerp(core.scale, 0.7, e);
    cam.set(lerp(cam.x, 0, e), lerp(cam.y, 0.3, e), lerp(cam.z, portrait ? 9 : 7.6, e));
    look.set(lerp(look.x, 0, e), lerp(look.y, 0, e), 0);
    shot.atmosphere.halo = lerp(shot.atmosphere.halo, 0.3, e);
  }

  // ---------- 05 Portal: the scene dims so the product can lead ----------
  const po = c.portal;
  if (po > 0) {
    const e = range(po, 0, 0.5);
    core.x = lerp(core.x, portrait ? 0 : -2.2, e);
    core.y = lerp(core.y, portrait ? 2.6 : 1.6, e);
    core.scale = lerp(core.scale, 0.42, e);
    core.morph = lerp(core.morph, 1, e);
    core.key = lerp(core.key, 0.75, e);
    shot.particles.dust = lerp(shot.particles.dust, 0.55, e);
    shot.atmosphere.halo = lerp(shot.atmosphere.halo, 0.18, e);
    shot.atmosphere.shafts = lerp(shot.atmosphere.shafts, 0.1, e);
  }

  // ---------- 06 Launch: the Core becomes a universe ----------
  const la = c.launch;
  if (la > 0) {
    const toCenter = range(la, 0, 0.18);
    const collapse = range(la, 0.18, 0.4);
    const gal = range(la, 0.26, 0.72);
    core.x = lerp(core.x, 0, toCenter);
    core.y = lerp(core.y, 0, toCenter);
    core.z = lerp(core.z, 0, toCenter);
    core.morph = lerp(lerp(core.morph, 4, toCenter), 5, collapse);
    core.scale = lerp(lerp(core.scale, 0.75, toCenter), 0.05, collapse);
    core.glow = Math.max(core.glow, collapse);
    core.key = lerp(core.key, 1, toCenter);
    shot.particles.galaxy = gal;
    shot.particles.dust = lerp(shot.particles.dust, 1, toCenter);
    shot.atmosphere.coreLight = Math.max(shot.atmosphere.coreLight, collapse * 0.75);
    shot.atmosphere.halo = lerp(shot.atmosphere.halo, 0.6, collapse);
    shot.atmosphere.haloScale = lerp(shot.atmosphere.haloScale, 5, collapse);
    shot.atmosphere.streak = collapse * 0.12 * (1 - gal);
    shot.atmosphere.shafts = lerp(shot.atmosphere.shafts, 0, toCenter);
    const rise = range(la, 0.25, 0.85);
    const spin = la * 0.9;
    const dist = lerp(portrait ? 9.5 : 7.5, portrait ? 15 : 11.5, rise);
    cam.set(
      lerp(lerp(cam.x, 0, toCenter), Math.sin(spin) * dist * 0.5, rise),
      lerp(lerp(cam.y, 0.2, toCenter), portrait ? 6.5 : 4.6, rise),
      lerp(lerp(cam.z, portrait ? 9 : 7, toCenter), Math.cos(spin) * dist, rise),
    );
    look.set(lerp(look.x, 0, toCenter), lerp(lerp(look.y, 0, toCenter), portrait ? 2.4 : 1.15, rise), 0);
  }

  shot.particles.core.set(core.x, core.y, core.z);
  shot.atmosphere.corePos.set(core.x, core.y, core.z);
}

export function createShot(): Shot {
  return {
    cam: v(0, 0.2, 7.6),
    look: v(0, 0, 0),
    fov: 35,
    core: { x: 0, y: 0, z: 0, scale: 0.04, morph: 0, split: 0, glow: 1, key: 1, violet: 1, cobalt: 1, cyan: 1, film: 1, liquid: 1, spin: 0.12 },
    stack: { show: 0, explode: 0, x: 0, y: 0, z: 0, scale: 1 },
    particles: { intro: 0, galaxy: 0, dust: 1, core: v(0, 0, 0) },
    atmosphere: { coreLight: 0, halo: 0.2, shafts: 0, corePos: v(0, 0, 0), haloScale: 3, streak: 1 },
  };
}
