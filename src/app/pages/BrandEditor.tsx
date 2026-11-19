import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Sparkle, X } from '@phosphor-icons/react';
import { api, errorText } from '../../data/api';
import { useSession } from '../../data/session';
import { useApp } from '../../data/store';
import { Button } from '../../components/Button';
import { Field } from '../auth/Auth';

interface Brand { name: string; accent: string; palette: string[]; typeface: string; voice: string }
const EMPTY: Brand = { name: '', accent: '#8b70ec', palette: [], typeface: '', voice: '' };
const INPUT = 'h-11 w-full rounded-xl border border-hairline-strong bg-white/[0.03] px-3 text-mist placeholder:text-text-4 focus:border-violet-400/70 focus:outline-none disabled:opacity-60';
const HEX = /^#[0-9a-fA-F]{6}$/;
const SUGGEST = ['#3a63d8', '#62c8d9', '#e8b83e', '#34b27f', '#e5484d', '#f2f2f3', '#181818'];

function Swatch({ value, onChange, onRemove, label, disabled }: { value: string; onChange: (v: string) => void; onRemove?: () => void; label: string; disabled: boolean }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-hairline-strong bg-white/[0.03] p-1.5 pr-2">
      <input type="color" value={HEX.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={`${label} colour`} className="h-8 w-8 cursor-pointer rounded-lg border-0 bg-transparent p-0 disabled:cursor-default" />
      <input value={text} disabled={disabled} aria-label={`${label} hex`} spellCheck={false}
        onChange={(e) => { setText(e.target.value); if (HEX.test(e.target.value)) onChange(e.target.value.toLowerCase()); }}
        onBlur={() => setText(value)}
        className="w-[76px] bg-transparent font-mono text-xs text-text-2 focus:text-mist focus:outline-none" />
      {onRemove && !disabled ? <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="text-text-4 hover:text-mist"><X size={12} /></button> : null}
    </div>
  );
}

/** The workspace's own brand, editable by editors. Muse reads it when it proposes colour and copy. */
export function BrandEditor() {
  const workspaceId = useSession((s) => s.workspaceId);
  const toast = useApp((s) => s.toast);
  const [brand, setBrand] = useState<Brand>(EMPTY);
  const [saved, setSaved] = useState<Brand>(EMPTY);
  const [canEdit, setCanEdit] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!workspaceId) return;
    let stop = false;
    setState('loading');
    api<{ brand: Brand; canEdit: boolean }>('GET', `/workspaces/${workspaceId}/brand`)
      .then((r) => { if (!stop) { setBrand(r.brand); setSaved(r.brand); setCanEdit(r.canEdit); setState('ready'); } })
      .catch(() => { if (!stop) setState('error'); });
    return () => { stop = true; };
  }, [workspaceId]);
  const dirty = JSON.stringify(brand) !== JSON.stringify(saved);
  const set = <K extends keyof Brand>(k: K, v: Brand[K]) => setBrand((b) => ({ ...b, [k]: v }));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!workspaceId) return;
    setBusy(true);
    try {
      const r = await api<{ brand: Brand }>('PATCH', `/workspaces/${workspaceId}/brand`, brand);
      setBrand(r.brand); setSaved(r.brand);
      toast({ text: 'Brand kit saved. Muse will use it from your next request.', tone: 'success' });
    } catch (err) { toast({ text: errorText(err), tone: 'error' }); }
    finally { setBusy(false); }
  };
  if (state === 'loading') return <div className="mt-8 h-[300px] animate-pulse rounded-3xl border border-hairline bg-white/[0.02]" aria-label="Loading your brand kit" />;
  if (state === 'error') return <p className="mt-8 rounded-2xl border border-hairline p-4 text-sm text-text-3">Your brand kit could not be loaded. Check your connection and reload.</p>;
  const ro = !canEdit;
  return (
    <form onSubmit={save} className="mt-8 rounded-3xl border border-hairline bg-white/[0.02] p-5 md:p-6" aria-labelledby="bk-yours">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="bk-yours" className="text-lg text-mist">Your brand</h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-text-3"><Sparkle size={13} weight="fill" className="text-violet-400" />Muse keeps its colour and copy proposals consistent with this.</p>
        </div>
        {ro ? <span className="mono-label text-text-3">View only</span> : (
          <div className="flex items-center gap-2">
            {dirty ? <Button type="button" variant="tertiary" size="sm" onClick={() => setBrand(saved)}>Discard</Button> : null}
            <Button type="submit" variant="primary" size="sm" loading={busy} disabled={busy || !dirty}>Save brand kit</Button>
          </div>
        )}
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Field label="Brand name"><input value={brand.name} onChange={(e) => set('name', e.target.value)} disabled={ro} maxLength={60} placeholder="Halden Coffee" className={INPUT} /></Field>
        <Field label="Typeface"><input value={brand.typeface} onChange={(e) => set('typeface', e.target.value)} disabled={ro} maxLength={60} placeholder="Geist, or a warm serif for headlines" className={INPUT} /></Field>
        <div>
          <p className="mb-2 text-sm text-text-2">Accent</p>
          <div className="flex"><Swatch label="Accent" value={brand.accent} onChange={(v) => set('accent', v)} disabled={ro} /></div>
        </div>
        <div>
          <p className="mb-2 text-sm text-text-2">Palette <span className="text-text-4">· up to six</span></p>
          <div className="flex flex-wrap gap-2">
            {brand.palette.map((c, i) => (
              <Swatch key={i} label={`Palette ${i + 1}`} value={c} disabled={ro}
                onChange={(v) => set('palette', brand.palette.map((x, j) => (j === i ? v : x)))}
                onRemove={() => set('palette', brand.palette.filter((_, j) => j !== i))} />
            ))}
            {!ro && brand.palette.length < 6 ? (
              <button type="button" onClick={() => set('palette', [...brand.palette, SUGGEST.find((c) => !brand.palette.includes(c) && c !== brand.accent) ?? '#f2f2f3'])} className="flex h-11 items-center gap-1.5 rounded-xl border border-dashed border-hairline-strong px-3 text-sm text-text-3 hover:text-mist"><Plus size={14} />Add colour</button>
            ) : null}
            {ro && !brand.palette.length ? <span className="text-sm text-text-4">No palette yet.</span> : null}
          </div>
        </div>
        <div className="md:col-span-2">
          <Field label="Voice" hint="How your copy should sound. Muse follows it when it rewrites headlines and calls to action.">
            <textarea value={brand.voice} onChange={(e) => set('voice', e.target.value)} disabled={ro} maxLength={400} rows={3} placeholder="Calm, warm, specific. Short sentences. No hype words."
              className="w-full resize-y rounded-xl border border-hairline-strong bg-white/[0.03] px-3 py-2.5 text-mist placeholder:text-text-4 focus:border-violet-400/70 focus:outline-none disabled:opacity-60" />
          </Field>
        </div>
      </div>
    </form>
  );
}
