import corewide from '../assets/renders/corewide.jpg';
import core from '../assets/renders/core.jpg';
import form from '../assets/renders/form.jpg';
import lattice from '../assets/renders/lattice.jpg';
import orbit from '../assets/renders/orbit.jpg';
import stack from '../assets/renders/stack.jpg';
import spark from '../assets/renders/spark.jpg';
import universe from '../assets/renders/universe.jpg';
import coreSq from '../assets/renders/core-sq.jpg';
import formSq from '../assets/renders/form-sq.jpg';
import latticeSq from '../assets/renders/lattice-sq.jpg';
import orbitSq from '../assets/renders/orbit-sq.jpg';
import stackSq from '../assets/renders/stack-sq.jpg';
import sparkSq from '../assets/renders/spark-sq.jpg';
import universeSq from '../assets/renders/universe-sq.jpg';
import corewideSq from '../assets/renders/corewide-sq.jpg';
import type { Stage } from '../lib/tokens';

/** Stage 01 key frames, rendered with the approved light rig. */
export const renders = { corewide, core, form, lattice, orbit, stack, spark, universe };
export const squares = { corewide: corewideSq, core: coreSq, form: formSq, lattice: latticeSq, orbit: orbitSq, stack: stackSq, spark: sparkSq, universe: universeSq };

/** Thumbnail of the Core in a given project stage. */
export const stageImage: Record<Stage, string> = {
  spark: sparkSq,
  drop: coreSq,
  form: formSq,
  lattice: latticeSq,
  orbit: orbitSq,
  universe: universeSq,
};
export const stageWide: Record<Stage, string> = {
  spark,
  drop: core,
  form,
  lattice,
  orbit,
  universe,
};
