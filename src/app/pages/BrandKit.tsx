import { Copy } from '@phosphor-icons/react';
import { useApp } from '../../data/store';
import { BrandEditor } from './BrandEditor';

const COLORS = [
  { group: 'Surfaces', items: [['Obsidian', '#000000', 'Base canvas'], ['Graphite', '#181818', 'Surfaces'], ['Raised', '#1F1F1F', 'Elevation 1'], ['Raised 2', '#272727', 'Elevation 2'], ['Raised 3', '#313131', 'Elevation 3']] },
  { group: 'Text', items: [['Mist', '#F2F2F3', '18.8:1 on obsidian'], ['Text 2', '#C4C5CB', '10.3:1 on graphite'], ['Text 3', '#8C8D93', '5.4:1 on graphite']] },
  { group: 'Light', items: [['White light', '#FAFAFA', 'Main action, 20.1:1 with black'], ['Aether violet', '#8B70EC', 'Focus, selection, Muse · 77% saturation'], ['Violet 600', '#7358CC', 'Filled Muse actions, 5.25:1 with white'], ['Cobalt', '#3A63D8', 'Scene depth, data series 2'], ['Signal cyan', '#62C8D9', 'Live signals only']] },
  { group: 'Status', items: [['Red', '#E5484D', 'Errors, 4.5:1'], ['Green', '#34B27F', 'Success, 6.6:1'], ['Yellow', '#E8B83E', 'Warnings, 9.6:1']] },
];
const TYPE = [
  ['Display 1', 'clamp(56px, 8.9vw, 128px)', 300, 'Launch line'],
  ['Display 2', '96 / 96', 300, 'Chapter statements'],
  ['Display 3', '72 / 72', 400, 'Evolution steps'],
  ['Heading 1', '60 / 60', 400, 'Hero headline'],
  ['Body', '16 / 24', 400, 'Running text'],
  ['Mono', '12 / 16 caps', 400, 'Rail, tokens, data'],
];
const MOTION = [
  ['aether-out', 'cubic-bezier(0.22, 1, 0.36, 1)', 'Default, 500 ms layout, 300 ms hover'],
  ['aether-in-out', 'cubic-bezier(0.65, 0, 0.35, 1)', 'Masks and camera moves'],
  ['aether-expo', 'cubic-bezier(0.16, 1, 0.3, 1)', 'Cinematic reveals, 800 ms'],
  ['spring magnetic', 'stiffness 170 · damping 18', 'Buttons and cursor'],
  ['spring inertia', 'stiffness 60 · damping 14', 'The Core when dragged'],
];

export default function BrandKit() {
  const toast = useApp((s) => s.toast);
  const copy = async (v: string) => { try { await navigator.clipboard.writeText(v); toast({ text: `Copied ${v}`, tone: 'success' }); } catch { toast({ text: `Copy failed. The value is ${v}`, tone: 'error' }); } };
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 md:px-8 md:py-10">
      <h1 className="text-3xl font-light tracking-[-0.02em] text-mist md:text-4xl">Brand kit</h1>
      <p className="mt-1 max-w-[640px] text-sm text-text-3">Your brand, and the ÆTHER system it sits on.</p>
      <BrandEditor />
      <h2 className="mt-14 text-xl font-light text-mist">ÆTHER system</h2>
      <p className="mt-1 max-w-[640px] text-sm text-text-3">The approved ÆTHER system. Colour is light, not paint: surfaces stay flat, and violet is the only interactive accent.</p>
      {COLORS.map((g) => (
        <section key={g.group} className="mt-10" aria-labelledby={`bk-${g.group}`}>
          <h2 id={`bk-${g.group}`} className="mono-label text-text-3">{g.group}</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {g.items.map(([name, hex, use]) => (
              <button key={hex} onClick={() => copy(hex)} className="group text-left" aria-label={`${name} ${hex}, copy`}>
                <div className="h-20 rounded-2xl border border-white/10" style={{ background: hex }} />
                <p className="mt-2 flex items-center justify-between text-sm text-mist">{name}<Copy size={12} className="text-text-4 opacity-0 group-hover:opacity-100" /></p>
                <p className="font-mono text-xs text-text-3">{hex}</p>
                <p className="mt-0.5 text-xs text-text-4">{use}</p>
              </button>
            ))}
          </div>
        </section>
      ))}
      <section className="mt-12" aria-labelledby="bk-type">
        <h2 id="bk-type" className="mono-label text-text-3">Type · Geist and Geist Mono</h2>
        <ul className="mt-3 divide-y divide-hairline rounded-2xl border border-hairline">
          {TYPE.map(([n, size, w, use]) => (
            <li key={n as string} className="flex flex-col gap-1 px-4 py-4 md:flex-row md:items-baseline md:gap-6">
              <span className={`w-40 shrink-0 ${n === 'Mono' ? 'font-mono text-xs uppercase tracking-[0.08em]' : ''} text-mist`} style={{ fontWeight: w as number, fontSize: n === 'Mono' ? 12 : n === 'Body' ? 16 : 28 }}>{n}</span>
              <span className="font-mono text-xs text-text-3">{size} · {w}</span>
              <span className="text-xs text-text-4 md:ml-auto">{use}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-12" aria-labelledby="bk-motion">
        <h2 id="bk-motion" className="mono-label text-text-3">Motion</h2>
        <ul className="mt-3 divide-y divide-hairline rounded-2xl border border-hairline">
          {MOTION.map(([n, v, use]) => (
            <li key={n} className="flex flex-col gap-1 px-4 py-3 md:flex-row md:items-center md:gap-6">
              <span className="w-40 shrink-0 font-mono text-sm text-violet-300">{n}</span>
              <button onClick={() => copy(v)} className="font-mono text-xs text-text-2 hover:text-mist">{v}</button>
              <span className="text-xs text-text-4 md:ml-auto">{use}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
