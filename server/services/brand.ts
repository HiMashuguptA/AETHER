import { z } from 'zod';
import { one } from '../db.js';

/** The workspace brand kit: stored in the default design system's tokens under `brand`. */
const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six digit hex colour, like #8b70ec.');
export const BrandSchema = z.object({
  name: z.string().trim().max(60).default(''),
  accent: HEX.default('#8b70ec'),
  palette: z.array(HEX).max(6).default([]),
  typeface: z.string().trim().max(60).default(''),
  voice: z.string().trim().max(400).default(''),
});
export type Brand = z.infer<typeof BrandSchema>;

export async function defaultSystem(workspaceId: string) {
  let row = await one<{ id: string; tokens: any; updated_at: Date }>(`select id, tokens, updated_at from design_systems where workspace_id = $1 order by is_default desc, updated_at desc limit 1`, [workspaceId]);
  if (!row) row = await one(`insert into design_systems (workspace_id, name, tokens, is_default) values ($1, 'Brand kit', '{}', true) returning id, tokens, updated_at`, [workspaceId]);
  return row!;
}

/** The brand Muse should respect for a workspace; null when nobody has filled it in. */
export async function brandFor(workspaceId: string): Promise<Brand | null> {
  const row = await one<{ tokens: any }>(`select tokens from design_systems where workspace_id = $1 order by is_default desc, updated_at desc limit 1`, [workspaceId]);
  const parsed = BrandSchema.safeParse(row?.tokens?.brand ?? null);
  if (!parsed.success) return null;
  const b = parsed.data;
  return b.name || b.voice || b.typeface || b.palette.length ? b : null;
}

