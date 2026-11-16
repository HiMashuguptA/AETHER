import type { Person } from './types';
import { people as samplePeople } from './seed';

/**
 * People shown in the workspace. Filled from the real workspace members after sign-in; the
 * fictional sample team is only used by the marketing story.
 */
const HUES = ['#8b70ec', '#3a63d8', '#62c8d9', '#34b27f', '#e8b83e', '#e5484d'];
const registry = new Map<string, Person>();

export interface Member { id: string; name: string; email: string; role: 'owner' | 'admin' | 'editor' | 'viewer'; image?: string | null }

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' } as const;

export function setMembers(members: Member[]) {
  registry.clear();
  members.forEach((m, i) => registry.set(m.id, { id: m.id, name: m.name, initials: initials(m.name), hue: HUES[i % HUES.length], role: ROLE_LABEL[m.role] }));
}

export function personById(id: string): Person {
  return registry.get(id) ?? samplePeople.find((p) => p.id === id) ?? { id, name: 'Former member', initials: '–', hue: '#313131', role: '' };
}
export const workspacePeople = (): Person[] => [...registry.values()];
