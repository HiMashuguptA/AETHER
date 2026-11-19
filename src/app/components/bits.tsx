import type { ReactNode } from 'react';
import { personById as lookupPerson } from '../../data/people';
import { stageImage } from '../../data/assets';
import { STAGE_LABEL, STAGE_MEANING, type Stage } from '../../lib/tokens';

export const personById = lookupPerson;

export function Avatar({ id, size = 28, ring = '#0b0b0c' }: { id: string; size?: number; ring?: string }) {
  const p = personById(id);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-black"
      style={{ width: size, height: size, background: p.hue, fontSize: Math.max(9, size * 0.36), boxShadow: `0 0 0 2px ${ring}` }}
      title={p.name}
      aria-label={p.name}
    >
      {p.initials}
    </span>
  );
}

export function AvatarStack({ ids, size = 26, max = 4 }: { ids: string[]; size?: number; max?: number }) {
  return (
    <span className="flex -space-x-1.5">
      {ids.slice(0, max).map((id) => <Avatar key={id} id={id} size={size} />)}
      {ids.length > max ? <span className="inline-flex items-center justify-center rounded-full bg-raised-2 text-[10px] text-text-2" style={{ width: size, height: size }}>+{ids.length - max}</span> : null}
    </span>
  );
}

/** The Core as status: shape and label always together. */
export function StageBadge({ stage, size = 'sm' }: { stage: Stage; size?: 'sm' | 'md' }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border border-hairline-strong bg-white/[0.03] ${size === 'md' ? 'py-1 pl-1 pr-3' : 'py-0.5 pl-0.5 pr-2.5'}`} title={STAGE_MEANING[stage]}>
      <img src={stageImage[stage]} alt="" className={`${size === 'md' ? 'h-6 w-6' : 'h-5 w-5'} rounded-full object-cover`} />
      <span className="mono-label text-text-2">{STAGE_LABEL[stage]}</span>
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-hairline-strong bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-text-3">{children}</kbd>;
}

export function timeAgo(t: number) {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-hairline bg-white/[0.02] p-1">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm transition-colors duration-300 ${value === o.id ? 'bg-white/[0.09] text-mist' : 'text-text-3 hover:text-mist'}`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, body, action, image }: { title: string; body: string; action?: ReactNode; image?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-hairline-strong px-6 py-14 text-center">
      {image ? <img src={image} alt="" className="h-20 w-20 rounded-full object-cover opacity-80" /> : null}
      <p className="text-base font-medium text-mist">{title}</p>
      <p className="max-w-[360px] text-sm leading-5 text-text-3">{body}</p>
      {action}
    </div>
  );
}
