/** The idea typed into the story's final input travels into the creation flow. */
let pending = '';
export function setPendingIdea(v: string) { pending = v; }
export function takePendingIdea() { const v = pending; pending = ''; return v; }

/**
 * Idea first, account second. When a visitor has to create an account (or sign in) part-way
 * through starting a project, everything they chose is kept in this browser and restored once
 * they are signed in, including after following the confirmation link from their email.
 */
import type { DirectionPick } from '../data/store';
import type { Output } from '../data/types';

export interface PendingProject { name: string; idea: string; outputs: Output[]; direction: DirectionPick; directionSetId?: string; at: number }
const KEY = 'aether.pending-project';
const MAX_AGE = 1000 * 60 * 60 * 24 * 3;

export function savePendingProject(p: Omit<PendingProject, 'at'>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...p, at: Date.now() })); } catch { /* private mode: the project is created right after sign-up in this tab instead */ }
  memory = { ...p, at: Date.now() };
}
let memory: PendingProject | null = null;
export function peekPendingProject(): PendingProject | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as PendingProject;
      if (p && typeof p.name === 'string' && p.direction && Date.now() - p.at < MAX_AGE) return p;
      localStorage.removeItem(KEY);
    }
  } catch { /* fall through to memory */ }
  return memory;
}
export function clearPendingProject() {
  memory = null;
  try { localStorage.removeItem(KEY); } catch { /* nothing stored */ }
}
