import type { Project, Proposal } from './types';

/**
 * Simulated Muse. A real model would plug in here (the store only needs proposals back).
 * Muse never edits directly: it returns reviewable changes, each with a rationale.
 */
type Draft = Omit<Proposal, 'id' | 'status' | 'createdAt' | 'projectId'>;

const has = (s: string, ...words: string[]) => words.some((w) => s.includes(w));

export function generateProposals(p: Project, prompt: string, context: string[]): Draft[] {
  const q = `${prompt} ${context.join(' ')}`.toLowerCase();
  const out: Draft[] = [];
  const headlineTrack = p.motion.find((t) => t.id === 'headline');

  if (has(q, 'bold', 'bigger', 'impact', 'hero', 'louder', 'stronger', 'scale')) {
    const next = p.doc.headlineSize >= 72 ? 96 : 72;
    out.push({
      title: 'Headline size',
      target: 'headline',
      from: `${p.doc.headlineSize}px`,
      to: `${next}px`,
      rationale: 'A larger display size gives the hero one clear focal point. Still on the type scale.',
      change: { scope: 'doc', key: 'headlineSize', value: next },
    });
  }
  if (has(q, 'motion', 'animat', 'slow', 'sleepy', 'fast', 'snappy', 'settle')) {
    if (headlineTrack) {
      out.push({
        title: 'Headline settle time',
        target: 'motion',
        from: `${headlineTrack.duration.toFixed(1)} s`,
        to: '0.9 s',
        rationale: 'Comments say the hero feels sleepy. 0.9 s keeps the weight but lands before the subheading.',
        change: { scope: 'motion', track: 'headline', key: 'duration', value: 0.9 },
      });
      out.push({
        title: 'Headline easing',
        target: 'motion',
        from: headlineTrack.easing,
        to: 'aether-expo',
        rationale: 'A steeper start with a long tail reads as cinematic without adding time.',
        change: { scope: 'motion', track: 'headline', key: 'easing', value: 'aether-expo' },
      });
    }
  }
  if (has(q, 'contrast', 'access', 'read', 'legib')) {
    out.push({
      title: 'Subheading tone',
      target: 'subhead',
      from: p.doc.subheadTone.toUpperCase(),
      to: '#F2F2F3',
      rationale: 'Raises the subheading from 10.3:1 to 18.8:1 on obsidian. Good for small screens in sunlight.',
      change: { scope: 'doc', key: 'subheadTone', value: '#f2f2f3' },
    });
  }
  if (has(q, 'copy', 'headline', 'words', 'write', 'tone', 'warmer', 'clearer', 'cta', 'button')) {
    const options: Record<string, [string, string]> = {
      halden: ['Spring, roasted\nthis week', 'Taste this week’s lots'],
      'orbit-lab': ['Forty-one experiments\none year', 'Explore the year'],
      northfold: ['Your crossing\nin three taps', 'Book a seat'],
      kesh: ['Step inside\nthe rooms we built', 'Enter the studio'],
      arclight: ['Half the floor\ntwice the reach', 'See Arc 2 lift'],
      tidewater: ['Nine songs\nfrom an empty coast', 'Listen to Low Season'],
      mira: ['Check in before\nyou leave home', 'Start check-in'],
    };
    const [h, cta] = options[p.id] ?? [`${p.doc.headline.split('\n')[0]}\nmade simple`, 'Start now'];
    out.push({
      title: 'Headline copy',
      target: 'headline',
      from: `“${p.doc.headline.replace('\n', ' ')}”`,
      to: `“${h.replace('\n', ' ')}”`,
      rationale: 'Leads with the outcome in fewer words, and the break falls where the thought turns.',
      change: { scope: 'doc', key: 'headline', value: h },
    });
    out.push({
      title: 'Call to action',
      target: 'cta',
      from: `“${p.doc.cta}”`,
      to: `“${cta}”`,
      rationale: 'A verb plus what you get, so the action says where it goes.',
      change: { scope: 'doc', key: 'cta', value: cta },
    });
  }
  if (has(q, '3d', 'space', 'chrome', 'light', 'scene', 'core', 'glow', 'violet')) {
    out.push({
      title: 'Violet rim light',
      target: 'space',
      from: p.space.violet.toFixed(2),
      to: '1.45',
      rationale: 'More rim light separates the object from the obsidian background at small sizes.',
      change: { scope: 'space', key: 'violet', value: 1.45 },
    });
    out.push({
      title: 'Chrome surface',
      target: 'space',
      from: `roughness ${p.space.roughness.toFixed(2)}`,
      to: 'roughness 0.03',
      rationale: 'A cleaner mirror keeps the strip light reflections crisp on the hero.',
      change: { scope: 'space', key: 'roughness', value: 0.03 },
    });
  }
  if (has(q, 'center', 'centre', 'align', 'layout', 'balance')) {
    out.push({
      title: 'Hero alignment',
      target: 'headline',
      from: p.doc.align,
      to: p.doc.align === 'left' ? 'center' : 'left',
      rationale: 'Centred works when the 3D visual sits behind the type rather than beside it.',
      change: { scope: 'doc', key: 'align', value: p.doc.align === 'left' ? 'center' : 'left' },
    });
  }
  if (!out.length) {
    out.push(
      {
        title: 'Headline size',
        target: 'headline',
        from: `${p.doc.headlineSize}px`,
        to: `${p.doc.headlineSize >= 72 ? 96 : 72}px`,
        rationale: 'The hero has room for one bolder statement.',
        change: { scope: 'doc', key: 'headlineSize', value: p.doc.headlineSize >= 72 ? 96 : 72 },
      },
      {
        title: 'Card radius',
        target: 'cta',
        from: `${p.doc.radius}px`,
        to: '24px',
        rationale: 'Matches the floating panel radius from the brand kit.',
        change: { scope: 'doc', key: 'radius', value: 24 },
      },
    );
    if (headlineTrack)
      out.push({
        title: 'Headline settle time',
        target: 'motion',
        from: `${headlineTrack.duration.toFixed(1)} s`,
        to: '0.9 s',
        rationale: 'Lands before the subheading arrives, so the eye has one thing to follow.',
        change: { scope: 'motion', track: 'headline', key: 'duration', value: 0.9 },
      });
  }
  return out.slice(0, 4);
}

export function museReply(p: Project, prompt: string, n: number) {
  const short = prompt.length > 60 ? `${prompt.slice(0, 57)}…` : prompt;
  return `I looked at the hero of ${p.name} with “${short}” in mind. Here ${n === 1 ? 'is one change' : `are ${n} changes`} I’d suggest. Nothing is applied until you accept it, and you can compare each one before deciding.`;
}

export interface Direction { id: string; name: string; summary: string; accent: string; swatches: string[]; type: string; motion: string; headline: string; subhead: string; visual: 'drop' | 'form' | 'lattice' | 'orbit' }

/** Three creative directions for the creation flow, shaped by the idea text. */
export function directionsFor(idea: string): Direction[] {
  const words = idea.trim().split(/\s+/).filter((w) => w.length > 3);
  const key = (words[0] ?? 'idea').replace(/[^a-z]/gi, '').toLowerCase();
  const subject = key ? key[0].toUpperCase() + key.slice(1) : 'Your idea';
  return [
    {
      id: 'quiet-chrome',
      name: 'Quiet chrome',
      summary: 'Restrained and premium. One liquid object, generous dark space, slow confident motion.',
      accent: '#8b70ec',
      swatches: ['#000000', '#181818', '#f2f2f3', '#8b70ec'],
      type: 'Geist Light display, Geist Mono labels',
      motion: 'aether-out, 800 ms reveals',
      headline: `${subject}\nmade to be felt`,
      subhead: idea.length > 20 ? idea : 'A focused experience built around one clear moment.',
      visual: 'drop',
    },
    {
      id: 'constellation',
      name: 'Constellation',
      summary: 'Many small points of light that connect as you scroll. Good for stories with lots of parts.',
      accent: '#3a63d8',
      swatches: ['#000000', '#0b1a4a', '#c4c5cb', '#5b87f7'],
      type: 'Geist Regular, tight tracking, numbered sections',
      motion: 'aether-in-out camera moves, stagger 60 ms',
      headline: `Every part of\n${subject.toLowerCase()} connected`,
      subhead: 'A navigable map that reveals how the pieces relate.',
      visual: 'orbit',
    },
    {
      id: 'living-structure',
      name: 'Living structure',
      summary: 'Architectural and precise. A lattice that grows with the content, cyan signals for live data.',
      accent: '#62c8d9',
      swatches: ['#000000', '#1f1f1f', '#f2f2f3', '#62c8d9'],
      type: 'Geist Medium titles, Mono data',
      motion: 'aether-expo, light leads by 120 ms',
      headline: `${subject}, built\nto grow`,
      subhead: 'A system first: every page, state and motion from one set of rules.',
      visual: 'lattice',
    },
  ];
}
