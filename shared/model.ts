import { z } from 'zod';

/**
 * The project model shared by the browser and the API. Everything that can change a project
 * (a save from the inspector, a Muse proposal, a version restore) is validated against these
 * schemas on the server, so a model or a hand-written request can never write an invalid project.
 */

export const STAGES = ['spark', 'drop', 'form', 'lattice', 'orbit', 'universe'] as const;
export const LAYERS = ['background', 'nav', 'headline', 'subhead', 'cta', 'proof', 'visual'] as const;
export const EASINGS = ['aether-out', 'aether-in-out', 'aether-expo', 'linear'] as const;
export const THEMES = ['obsidian', 'graphite', 'mist'] as const;
export const OUTPUTS = ['site', 'app', 'brand', 'motion'] as const;
export const ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export const HEADLINE_SIZES = [36, 48, 60, 72, 96] as const;

export type Role = (typeof ROLES)[number];
export const roleRank: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };
export const can = (role: Role | null | undefined, min: Role) => !!role && roleRank[role] >= roleRank[min];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six digit hex colour');
const plain = (max: number) => z.string().max(max).refine((s) => !/[<>]/.test(s), 'Angle brackets are not allowed');
const flags = z.partialRecord(z.enum(LAYERS), z.boolean());

const docFields = {
  headline: plain(140).min(1),
  subhead: plain(320),
  cta: plain(48),
  proof: plain(120),
  nav: z.array(plain(24).min(1)).max(6),
  accent: hex,
  headlineSize: z.union(HEADLINE_SIZES.map((n) => z.literal(n)) as [z.ZodLiteral<36>, z.ZodLiteral<48>, ...z.ZodLiteral<number>[]]),
  subheadTone: hex,
  radius: z.number().min(0).max(40),
  spacing: z.number().min(8).max(64),
  align: z.enum(['left', 'center']),
  theme: z.enum(THEMES),
  visual: z.enum(STAGES),
  hidden: flags,
  locked: flags,
};
export const DesignDocSchema = z.object(docFields).strict();

const trackFields = {
  start: z.number().min(0).max(4),
  duration: z.number().min(0.1).max(4),
  easing: z.enum(EASINGS),
  fromY: z.number().min(-200).max(200),
  fromBlur: z.number().min(0).max(40),
};
export const MotionTrackSchema = z.object({ id: z.enum(LAYERS), label: plain(40), ...trackFields }).strict();
export const MotionSchema = z.array(MotionTrackSchema).min(1).max(LAYERS.length);

const spaceFields = {
  morph: z.number().min(0).max(5),
  roughness: z.number().min(0).max(1),
  violet: z.number().min(0).max(3),
  cobalt: z.number().min(0).max(3),
  key: z.number().min(0).max(3),
  spin: z.number().min(0).max(2),
  film: z.number().min(0).max(3),
};
export const SpaceSchema = z.object(spaceFields).strict();

export type DesignDocT = z.infer<typeof DesignDocSchema>;
export type MotionTrackT = z.infer<typeof MotionTrackSchema>;
export type SpaceT = z.infer<typeof SpaceSchema>;

/** Fields Muse may propose changing. Visibility and locks stay with the person. */
const MUSE_DOC_KEYS = ['headline', 'subhead', 'cta', 'proof', 'nav', 'accent', 'headlineSize', 'subheadTone', 'radius', 'spacing', 'align', 'theme', 'visual'] as const;
const TRACK_KEYS = ['start', 'duration', 'easing', 'fromY', 'fromBlur'] as const;
const SPACE_KEYS = ['morph', 'roughness', 'violet', 'cobalt', 'key', 'spin', 'film'] as const;

export const ChangeSchema = z
  .discriminatedUnion('scope', [
    z.object({ scope: z.literal('doc'), key: z.enum(MUSE_DOC_KEYS), value: z.unknown() }),
    z.object({ scope: z.literal('motion'), track: z.enum(LAYERS), key: z.enum(TRACK_KEYS), value: z.unknown() }),
    z.object({ scope: z.literal('space'), key: z.enum(SPACE_KEYS), value: z.unknown() }),
  ])
  .superRefine((c, ctx) => {
    const field = c.scope === 'doc' ? docFields[c.key] : c.scope === 'motion' ? trackFields[c.key] : spaceFields[c.key];
    const r = field.safeParse(c.value);
    if (!r.success) ctx.addIssue({ code: 'custom', path: ['value'], message: r.error.issues[0]?.message ?? 'Invalid value' });
  });
export type Change =
  | { scope: 'doc'; key: (typeof MUSE_DOC_KEYS)[number]; value: unknown }
  | { scope: 'motion'; track: (typeof LAYERS)[number]; key: (typeof TRACK_KEYS)[number]; value: unknown }
  | { scope: 'space'; key: (typeof SPACE_KEYS)[number]; value: unknown };

export interface Snapshot {
  name: string;
  description: string;
  stage: (typeof STAGES)[number];
  doc: DesignDocT;
  motion: MotionTrackT[];
  space: SpaceT;
}

export function applyChange<T extends { doc: DesignDocT; motion: MotionTrackT[]; space: SpaceT }>(p: T, c: Change): T {
  if (c.scope === 'doc') return { ...p, doc: { ...p.doc, [c.key]: c.value } };
  if (c.scope === 'space') return { ...p, space: { ...p.space, [c.key]: c.value } };
  return { ...p, motion: p.motion.map((t) => (t.id === c.track ? { ...t, [c.key]: c.value } : t)) };
}

/** Current value of the field a change targets, as display text. */
export function describeValue(v: unknown): string {
  if (Array.isArray(v)) return v.join(' · ');
  if (typeof v === 'number') return String(Math.round(v * 100) / 100);
  return String(v ?? '');
}
export function currentValue(p: { doc: DesignDocT; motion: MotionTrackT[]; space: SpaceT }, c: Change): unknown {
  if (c.scope === 'doc') return p.doc[c.key];
  if (c.scope === 'space') return p.space[c.key];
  return p.motion.find((t) => t.id === c.track)?.[c.key];
}

export const defaultMotion = (): MotionTrackT[] => [
  { id: 'nav', label: 'Navigation', start: 0, duration: 0.6, easing: 'aether-out', fromY: -12, fromBlur: 0 },
  { id: 'headline', label: 'Headline', start: 0.15, duration: 1.4, easing: 'aether-out', fromY: 32, fromBlur: 8 },
  { id: 'subhead', label: 'Subheading', start: 0.45, duration: 0.8, easing: 'aether-out', fromY: 24, fromBlur: 0 },
  { id: 'cta', label: 'Call to action', start: 0.7, duration: 0.6, easing: 'aether-out', fromY: 16, fromBlur: 0 },
  { id: 'visual', label: '3D visual', start: 0.2, duration: 1.6, easing: 'aether-expo', fromY: 0, fromBlur: 16 },
  { id: 'proof', label: 'Proof line', start: 1.0, duration: 0.5, easing: 'aether-out', fromY: 8, fromBlur: 0 },
];
const stageMorph = { spark: 0, drop: 1, form: 2, lattice: 3, orbit: 4, universe: 5 } as const;
export const defaultSpace = (stage: (typeof STAGES)[number]): SpaceT => ({ morph: Math.min(4, Math.max(1, stageMorph[stage])), roughness: 0.08, violet: 1, cobalt: 1, key: 1, spin: 0.25, film: 1 });

/** A creative direction as Muse returns it (idea exploration, before a project exists). */
export const DirectionSchema = z.object({
  id: z.string().min(1).max(40),
  name: plain(40).min(1),
  summary: plain(320).min(1),
  rationale: plain(400),
  accent: hex,
  swatches: z.array(hex).min(3).max(5),
  type: plain(120),
  layout: plain(200),
  motion: plain(200),
  interaction: plain(200),
  headline: plain(140).min(1),
  subhead: plain(320),
  visual: z.enum(['drop', 'form', 'lattice', 'orbit']),
});
export type DirectionT = z.infer<typeof DirectionSchema>;

export const InterpretationSchema = z.object({
  concept: plain(400),
  audience: plain(240),
  brand: plain(300),
  features: z.array(plain(120)).max(6),
});
export type InterpretationT = z.infer<typeof InterpretationSchema>;

export const slugify = (s: string, max = 40) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '') || 'project';

/** Upload rules, enforced on the server and mirrored in the browser for early feedback. */
export const UPLOAD_RULES: Record<string, { kind: 'image' | '3d' | 'motion' | 'component'; maxMb: number }> = {
  'image/png': { kind: 'image', maxMb: 15 },
  'image/jpeg': { kind: 'image', maxMb: 15 },
  'image/webp': { kind: 'image', maxMb: 15 },
  'image/avif': { kind: 'image', maxMb: 15 },
  'image/gif': { kind: 'image', maxMb: 10 },
  'model/gltf-binary': { kind: '3d', maxMb: 40 },
  'application/json': { kind: 'motion', maxMb: 5 },
  'application/pdf': { kind: 'component', maxMb: 20 },
};
export const EXT_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif',
  glb: 'model/gltf-binary', json: 'application/json', pdf: 'application/pdf',
};
export function uploadRuleFor(name: string, mime: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const byExt = EXT_MIME[ext];
  // the extension decides; a declared type that disagrees with it is rejected (SVG and HTML are never accepted)
  if (!byExt) return null;
  if (mime && mime !== byExt && !(byExt === 'model/gltf-binary' && (mime === 'application/octet-stream' || mime === ''))) return null;
  return { mime: byExt, ...UPLOAD_RULES[byExt] };
}
