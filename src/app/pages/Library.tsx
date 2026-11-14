import { useMemo, useRef, useState } from 'react';
import { MagnifyingGlass, UploadSimple, X, Cube, Drop, Image as ImageIcon, FilmStrip, SquaresFour, Plus } from '@phosphor-icons/react';
import { useApp } from '../../data/store';
import type { Asset, AssetKind } from '../../data/types';
import { Button } from '../../components/Button';
import { Segmented, EmptyState, Avatar, timeAgo, personById } from '../components/bits';
import CoreViewport from '../components/CoreViewport';
import { STAGES } from '../../lib/tokens';

type Filter = 'all' | AssetKind;
const KIND: Record<AssetKind, { label: string; icon: React.ReactNode }> = {
  '3d': { label: '3D', icon: <Cube size={14} /> },
  material: { label: 'Materials', icon: <Drop size={14} /> },
  image: { label: 'Images', icon: <ImageIcon size={14} /> },
  motion: { label: 'Motion', icon: <FilmStrip size={14} /> },
  component: { label: 'Components', icon: <SquaresFour size={14} /> },
};

function Thumb({ a, big = false }: { a: Asset; big?: boolean }) {
  if (a.thumb) return <img src={a.thumb} alt="" className="h-full w-full object-cover" draggable={false} />;
  if (a.swatch) {
    return (
      <div className="relative h-full w-full" style={{ background: a.swatch[0] }}>
        <div className="absolute inset-[18%] rounded-full" style={{ background: a.swatch[1], boxShadow: `inset -12px -16px 40px ${a.swatch[2]}66, inset 10px 12px 30px ${a.swatch[3]}55, 0 0 40px ${a.swatch[3]}33` }} />
      </div>
    );
  }
  if (a.curve) {
    const [x1, y1, x2, y2] = a.curve;
    return (
      <svg viewBox="0 0 100 100" className="h-full w-full bg-[#0c0c0e]" aria-hidden="true">
        <path d="M14 86 L86 14" stroke="#272727" strokeDasharray="3 3" fill="none" />
        <path d={`M14 86 C${14 + x1 * 72} ${86 - y1 * 72} ${14 + x2 * 72} ${86 - y2 * 72} 86 14`} stroke="#a48dff" strokeWidth={big ? 2 : 2.5} fill="none" />
        <circle cx="14" cy="86" r="2.5" fill="#f2f2f3" /><circle cx="86" cy="14" r="2.5" fill="#62c8d9" />
      </svg>
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0c0c0e] p-4">
      {a.name.includes('Button') ? <span className="rounded-full bg-light px-4 py-2 text-xs font-semibold text-black">Start your first project</span>
        : a.name.includes('Nav') ? <span className="glass flex w-full items-center justify-between rounded-full px-3 py-2 text-[10px] text-text-2"><span>Æ</span><span>Work · About</span></span>
        : a.name.includes('Stage') ? <span className="mono-label rounded-full border border-hairline-strong px-2.5 py-1 text-text-2">Lattice</span>
        : <span className="w-full rounded-xl border border-hairline-strong p-2 text-[10px] text-text-3">Describe a change…</span>}
    </div>
  );
}

export default function Library() {
  const assets = useApp((s) => s.assets);
  const addAsset = useApp((s) => s.addAsset);
  const updateAsset = useApp((s) => s.updateAsset);
  const projects = useApp((s) => s.projects);
  const toast = useApp((s) => s.toast);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const list = useMemo(() => assets.filter((a) => (filter === 'all' || a.kind === filter) && (a.name + a.tags.join(' ')).toLowerCase().includes(q.toLowerCase())), [assets, filter, q]);
  const current = assets.find((a) => a.id === open);

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    Array.from(files).slice(0, 6).forEach((f) => {
      if (!f.type.startsWith('image/')) { toast({ text: `${f.name} isn’t an image. This demo accepts PNG, JPG, WebP or GIF.`, tone: 'error' }); return; }
      if (f.size > 20 * 1024 * 1024) { toast({ text: `${f.name} is over 20 MB.`, tone: 'error' }); return; }
      const url = URL.createObjectURL(f);
      const id = addAsset({ name: f.name.replace(/\.[^.]+$/, ''), kind: 'image', thumb: url, tags: ['uploaded'], size: `${Math.max(1, Math.round(f.size / 1024))} KB`, uploading: 0 });
      let p = 0;
      const step = () => { p = Math.min(1, p + 0.18 + Math.random() * 0.15); updateAsset(id, { uploading: p >= 1 ? undefined : p }); if (p < 1) setTimeout(step, 160); else toast({ text: `${f.name} added to the library`, tone: 'success' }); };
      setTimeout(step, 120);
    });
  };

  return (
    <div
      className="mx-auto max-w-[1440px] px-4 py-8 md:px-8 md:py-10"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
    >
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-light tracking-[-0.02em] text-mist md:text-4xl">Library</h1>
          <p className="mt-1 text-sm text-text-3">{assets.length} shared assets. Drop images anywhere on this page to add them.</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileInput} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => upload(e.target.files)} aria-label="Upload images" />
          <Button variant="primary" icon={<UploadSimple size={16} />} onClick={() => fileInput.current?.click()}>Upload</Button>
        </div>
      </header>
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="flex h-10 items-center gap-2 rounded-full border border-hairline bg-white/[0.02] px-3 focus-within:border-violet-400/60 lg:w-72">
          <MagnifyingGlass size={16} className="text-text-3" />
          <span className="sr-only">Search assets</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search assets and tags" className="w-full bg-transparent text-sm text-mist placeholder:text-text-4 focus:outline-none" />
        </label>
        <div className="thin-scroll overflow-x-auto">
          <Segmented<Filter> label="Asset type" value={filter} onChange={setFilter} options={[{ id: 'all', label: 'All' }, ...(Object.keys(KIND) as AssetKind[]).map((k) => ({ id: k as Filter, label: KIND[k].label, icon: KIND[k].icon }))]} />
        </div>
      </div>
      {dragging && <div className="pointer-events-none fixed inset-4 z-30 flex items-center justify-center rounded-3xl border-2 border-dashed border-violet-400/70 bg-violet-500/[0.06] text-lg text-mist">Drop to add to the library</div>}
      <div className="mt-6">
        {list.length === 0 ? (
          <EmptyState title={q ? `Nothing matches “${q}”` : 'No assets of this type yet'} body="Upload images or save a material, motion preset or component from a project canvas." action={<Button onClick={() => { setQ(''); setFilter('all'); }}>Show everything</Button>} />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {list.map((a) => (
              <li key={a.id}>
                <button onClick={() => setOpen(a.id)} className="group w-full text-left" data-cursor="View">
                  <div className="relative aspect-square overflow-hidden rounded-2xl border border-hairline transition-[border-color] duration-300 group-hover:border-hairline-strong">
                    <div className="h-full w-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.05]"><Thumb a={a} /></div>
                    <span className="mono-label absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-text-2">{KIND[a.kind].icon}{KIND[a.kind].label}</span>
                    {a.uploading !== undefined && (
                      <span className="absolute inset-x-2 bottom-2 h-1.5 overflow-hidden rounded-full bg-black/70" role="progressbar" aria-valuenow={Math.round(a.uploading * 100)} aria-label={`Uploading ${a.name}`}>
                        <span className="block h-full bg-violet-400 transition-[width] duration-150" style={{ width: `${a.uploading * 100}%` }} />
                      </span>
                    )}
                  </div>
                  <p className="mt-2 truncate text-sm text-mist">{a.name}</p>
                  <p className="text-xs text-text-4">{a.size} · used {a.uses}×</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {current && (
        <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label={current.name} onKeyDown={(e) => e.key === 'Escape' && setOpen(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade" onClick={() => setOpen(null)} />
          <aside className="glass-strong relative flex h-full w-full max-w-[460px] flex-col overflow-y-auto p-5 animate-rise">
            <div className="flex items-center justify-between">
              <p className="mono-label text-text-3">{KIND[current.kind].label}</p>
              <button onClick={() => setOpen(null)} aria-label="Close" autoFocus className="flex h-9 w-9 items-center justify-center rounded-full text-text-2 hover:bg-white/[0.06]"><X size={16} /></button>
            </div>
            <div className="mt-4 aspect-square overflow-hidden rounded-2xl border border-hairline">
              {current.kind === '3d' && current.stage ? (
                <CoreViewport morph={Math.max(1, Math.min(4, STAGES.indexOf(current.stage)))} className="h-full w-full" label={`${current.name}, interactive. Drag to orbit.`} />
              ) : (
                <Thumb a={current} big />
              )}
            </div>
            <h2 className="mt-5 text-xl font-normal text-mist">{current.name}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">{current.tags.map((t) => <span key={t} className="rounded-full border border-hairline px-2 py-0.5 text-xs text-text-3">{t}</span>)}</div>
            <dl className="mt-5 grid grid-cols-[100px_1fr] gap-y-2 text-sm">
              <dt className="text-text-4">Added by</dt><dd className="flex items-center gap-2 text-text-2"><Avatar id={current.byId} size={20} />{personById(current.byId).name}</dd>
              <dt className="text-text-4">Updated</dt><dd className="text-text-2">{timeAgo(current.updatedAt)}</dd>
              <dt className="text-text-4">Size</dt><dd className="text-text-2">{current.size}</dd>
              <dt className="text-text-4">Used</dt><dd className="text-text-2">{current.uses} times</dd>
              {current.curve && <><dt className="text-text-4">Curve</dt><dd className="font-mono text-text-2">cubic-bezier({current.curve.join(', ')})</dd></>}
              {current.swatch && <><dt className="text-text-4">Colours</dt><dd className="flex gap-1.5">{current.swatch.map((c) => <span key={c} className="h-5 w-5 rounded-full border border-white/10" style={{ background: c }} title={c} />)}</dd></>}
            </dl>
            <p className="mt-6 text-xs text-text-4">Use in a project</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {projects.slice(0, 4).map((p) => (
                <button key={p.id} onClick={() => { updateAsset(current.id, { uses: current.uses + 1 }); toast({ text: `${current.name} added to ${p.name}`, tone: 'success' }); setOpen(null); }} className="flex items-center justify-between rounded-xl border border-hairline px-3 py-2.5 text-left text-sm text-text-2 hover:border-hairline-strong hover:text-mist">
                  {p.name}<Plus size={14} />
                </button>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
