import type { Stage } from '../lib/tokens';

export interface Person { id: string; name: string; initials: string; hue: string; role: string }

export type Output = 'site' | 'app' | 'brand' | 'motion';
export type LayerId = 'background' | 'nav' | 'headline' | 'subhead' | 'cta' | 'proof' | 'visual';
export type Easing = 'aether-out' | 'aether-in-out' | 'aether-expo' | 'linear';
export type Theme = 'obsidian' | 'graphite' | 'mist';

export interface DesignDoc {
  headline: string;
  subhead: string;
  cta: string;
  proof: string;
  nav: string[];
  accent: string;
  headlineSize: number;
  subheadTone: string;
  radius: number;
  spacing: number;
  align: 'left' | 'center';
  theme: Theme;
  visual: Stage;
  hidden: Partial<Record<LayerId, boolean>>;
  locked: Partial<Record<LayerId, boolean>>;
}

export interface MotionTrack {
  id: LayerId;
  label: string;
  start: number;
  duration: number;
  easing: Easing;
  fromY: number;
  fromBlur: number;
}

export interface SpaceSettings {
  morph: number;
  roughness: number;
  violet: number;
  cobalt: number;
  key: number;
  spin: number;
  film: number;
}

export interface Check { id: string; group: 'Performance' | 'Accessibility' | 'Search'; label: string; status: 'pass' | 'warn' | 'fail'; detail: string; fix?: ProposalChange }

export interface Project {
  id: string;
  name: string;
  client: string;
  description: string;
  stage: Stage;
  ownerId: string;
  teamIds: string[];
  updatedAt: number;
  due: string;
  progress: number;
  outputs: Output[];
  health: 'On track' | 'In review' | 'At risk';
  domain: string;
  doc: DesignDoc;
  motion: MotionTrack[];
  space: SpaceSettings;
  published?: { url: string; at: number; version: number };
  comments: Comment[];
}

export interface Comment { id: string; authorId: string; text: string; at: number; target: LayerId; resolved?: boolean }

export type ProposalChange =
  | { scope: 'doc'; key: keyof DesignDoc; value: DesignDoc[keyof DesignDoc] }
  | { scope: 'motion'; track: LayerId; key: keyof MotionTrack; value: MotionTrack[keyof MotionTrack] }
  | { scope: 'space'; key: keyof SpaceSettings; value: number };

export interface Proposal {
  id: string;
  projectId: string;
  title: string;
  target: LayerId | 'space' | 'motion';
  from: string;
  to: string;
  rationale: string;
  change: ProposalChange;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
}

export interface MuseMessage {
  id: string;
  projectId: string;
  role: 'user' | 'muse';
  text: string;
  streaming?: boolean;
  proposalIds?: string[];
  context?: string[];
  at: number;
}

export type AssetKind = '3d' | 'material' | 'image' | 'motion' | 'component';
export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  thumb?: string;
  swatch?: string[];
  curve?: [number, number, number, number];
  stage?: Stage;
  tags: string[];
  size: string;
  updatedAt: number;
  byId: string;
  uses: number;
  uploading?: number;
}

export interface Activity { id: string; whoId: string; text: string; projectId?: string; at: number; kind: 'muse' | 'edit' | 'publish' | 'comment' | 'create' }

export interface Toast { id: string; text: string; tone: 'neutral' | 'success' | 'muse' | 'error'; action?: { label: string; run: () => void } }
