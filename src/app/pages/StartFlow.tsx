import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Sparkle, Microphone, PencilSimpleLine, Link as LinkIcon, X, Check, Globe, AppWindow, Palette, FilmStrip } from '@phosphor-icons/react';
import { Button } from '../../components/Button';
import { navigate } from '../../lib/router';
import { useApp } from '../../data/store';
import { directionsFor, type Direction } from '../../data/muse';
import { takePendingIdea } from '../pendingIdea';
import { stageImage } from '../../data/assets';
import CoreViewport from '../components/CoreViewport';
import type { Output } from '../../data/types';

const STEPS = ['Spark', 'Directions', 'Setup'];
const EXAMPLES = ['A launch site for a coffee roaster’s spring harvest', 'An interactive annual report for a research lab', 'A portfolio for a set design studio, one scene per production'];
const OUTPUTS: { id: Output; label: string; icon: React.ReactNode }[] = [
  { id: 'site', label: 'Website', icon: <Globe size={18} /> },
  { id: 'app', label: 'App screens', icon: <AppWindow size={18} /> },
  { id: 'brand', label: 'Brand system', icon: <Palette size={18} /> },
  { id: 'motion', label: 'Motion film', icon: <FilmStrip size={18} /> },
];

/** Idea first, account second: describe it, see Muse respond, then set it up. */
export default function StartFlow() {
  const [step, setStep] = useState(0);
  const [idea, setIdea] = useState(() => takePendingIdea());
  const [refs, setRefs] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [dirs, setDirs] = useState<Direction[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [outputs, setOutputs] = useState<Output[]>(['site']);
  const [forming, setForming] = useState(false);
  const create = useApp((s) => s.createProject);
  const toast = useApp((s) => s.toast);

  useEffect(() => {
    if (!dirs.length || name) return;
    const words = idea.replace(/[^a-z0-9 ]/gi, '').split(' ').filter((w) => w.length > 3).slice(0, 3);
    setName(words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : 'Untitled project');
  }, [dirs.length, idea, name]);

  const next = () => {
    if (step === 0) {
      if (idea.trim().length < 12) { setError('Describe the idea in a sentence or two, at least 12 characters, so Muse has something to work with.'); return; }
      setError('');
      setStep(1);
      setGenerating(true);
      setDirs([]);
      setChosen([]);
      setTimeout(() => { setDirs(directionsFor(idea)); setGenerating(false); }, 1600);
    } else if (step === 1) {
      if (!chosen.length) { setError('Choose a direction, or two to blend.'); return; }
      setError('');
      setStep(2);
    } else {
      if (!name.trim()) { setError('Give the project a name.'); return; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setError('That email address doesn’t look complete. Check it, or leave it empty for now.'); return; }
      if (!outputs.length) { setError('Pick at least one thing to make.'); return; }
      setError('');
      setForming(true);
      const picked = dirs.filter((d) => chosen.includes(d.id));
      const base = picked[0];
      const blended = picked.length > 1 ? { ...base, name: `${picked[0].name} × ${picked[1].name}`, accent: picked[1].accent } : base;
      setTimeout(() => {
        const id = create({ name: name.trim(), idea: idea.trim(), direction: blended, outputs });
        toast({ text: `${name.trim()} is ready. Its Core is at the Form stage.`, tone: 'success' });
        navigate(`project-${id}`, { transition: false });
      }, 2600);
    }
  };

  const picked = useMemo(() => dirs.filter((d) => chosen.includes(d.id)), [dirs, chosen]);

  if (forming) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-black">
        <CoreViewport morph={2} controls={false} className="absolute inset-0" label="The project’s Core forming" />
        <div className="relative mt-[50vh] text-center animate-rise" role="status" aria-live="polite">
          <p className="mono-label text-violet-400">Forming</p>
          <p className="mt-2 text-2xl font-light text-mist">{name}</p>
          <p className="mt-1 text-sm text-text-3">Setting up the canvas, the brand kit and the first motion timeline</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex min-h-[100svh] max-w-[1120px] flex-col px-5 pb-10 pt-6 md:px-10">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate('workspace', { transition: false })} className="flex items-center gap-2 text-sm text-text-3 hover:text-mist"><X size={16} /> Close</button>
        <ol className="flex items-center gap-2" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2" aria-current={i === step ? 'step' : undefined}>
              <span className={`mono-label rounded-full px-2.5 py-1 ${i === step ? 'bg-white/[0.08] text-mist' : i < step ? 'text-violet-300' : 'text-text-4'}`}>{i < step ? <Check size={11} className="mr-1 inline" /> : null}{s}</span>
              {i < STEPS.length - 1 && <span className="h-px w-6 bg-hairline-strong" />}
            </li>
          ))}
        </ol>
        <span className="w-16" />
      </header>

      <div className="flex flex-1 flex-col justify-center py-10">
        {step === 0 && (
          <section className="animate-rise" aria-labelledby="s0">
            <img src={stageImage.spark} alt="" className="mb-6 h-16 w-16 rounded-full object-cover" />
            <h1 id="s0" className="display-3 max-w-[760px] text-mist">What are we making?</h1>
            <p className="mt-3 max-w-[560px] text-text-2">Start with a sentence. Add a sketch, a voice note or a reference if you have one. Muse will propose three directions.</p>
            <label htmlFor="idea-text" className="sr-only">Describe your idea</label>
            <textarea
              id="idea-text"
              value={idea}
              onChange={(e) => { setIdea(e.target.value); setError(''); }}
              rows={3}
              autoFocus
              placeholder="A launch site for a coffee roaster’s spring harvest, warm and slow, for people who love the craft"
              className="mt-8 w-full resize-none rounded-3xl border border-hairline-strong bg-white/[0.03] p-5 text-xl font-light leading-8 text-mist placeholder:text-text-4 focus:border-violet-400/70 focus:outline-none md:text-2xl md:leading-9"
              aria-invalid={!!error}
              aria-describedby={error ? 'flow-error' : undefined}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { k: 'Sketch', i: <PencilSimpleLine size={14} /> },
                { k: 'Voice note', i: <Microphone size={14} /> },
                { k: 'Reference link', i: <LinkIcon size={14} /> },
              ].map((r) => {
                const on = refs.includes(r.k);
                return (
                  <button key={r.k} onClick={() => setRefs((v) => (on ? v.filter((x) => x !== r.k) : [...v, r.k]))} aria-pressed={on} className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm ${on ? 'border-violet-400/60 bg-violet-500/10 text-violet-200' : 'border-hairline text-text-3 hover:text-mist'}`}>
                    {r.i} {on ? `${r.k} added` : `Add ${r.k.toLowerCase()}`}
                  </button>
                );
              })}
            </div>
            <div className="mt-8">
              <p className="mono-label text-text-4">Or start from</p>
              <div className="mt-2 flex flex-col gap-2 md:flex-row">
                {EXAMPLES.map((ex) => <button key={ex} onClick={() => { setIdea(ex); setError(''); }} className="rounded-2xl border border-hairline px-4 py-3 text-left text-sm text-text-2 hover:border-hairline-strong hover:text-mist md:flex-1">{ex}</button>)}
              </div>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="animate-rise" aria-labelledby="s1" aria-busy={generating}>
            <div className="flex items-center gap-2"><Sparkle size={16} weight="fill" className="text-violet-400" /><p className="mono-label text-violet-400">Muse · three directions</p></div>
            <h1 id="s1" className="display-3 mt-3 max-w-[760px] text-mist">{generating ? 'Reading your idea' : 'Choose a direction'}</h1>
            <p className="mt-3 max-w-[620px] text-text-2">“{idea}”</p>
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
              {(generating ? [0, 1, 2] : dirs).map((d, i) => {
                if (typeof d === 'number') {
                  return (
                    <div key={i} className="card flex flex-col gap-3 p-4" aria-hidden="true">
                      <div className="skeleton aspect-[4/3] rounded-xl" />
                      <div className="skeleton h-5 w-2/3 rounded" />
                      <div className="skeleton h-4 w-full rounded" />
                      <div className="skeleton h-4 w-4/5 rounded" />
                    </div>
                  );
                }
                const on = chosen.includes(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() => { setError(''); setChosen((v) => (on ? v.filter((x) => x !== d.id) : [...v, d.id].slice(-2))); }}
                    aria-pressed={on}
                    className={`group flex flex-col rounded-2xl border p-4 text-left transition-[border-color,box-shadow,transform] duration-500 animate-rise ${on ? 'border-violet-400/80 bg-violet-500/[0.06] shadow-[0_0_40px_rgba(139,112,236,0.22)]' : 'border-hairline bg-[#141416] hover:border-hairline-strong'}`}
                    style={{ animationDelay: `${i * 90}ms` }}
                    data-cursor={on ? 'Chosen' : 'Choose'}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
                      <img src={stageImage[d.visual]} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                      <span className="absolute bottom-2 left-2 flex gap-1">{d.swatches.map((c) => <span key={c} className="h-4 w-4 rounded-full border border-white/20" style={{ background: c }} />)}</span>
                      {on && <span className="mono-label absolute right-2 top-2 rounded-full bg-light px-2 py-0.5 text-black">{chosen.indexOf(d.id) === 0 ? 'Chosen' : 'Blend'}</span>}
                    </div>
                    <p className="mt-4 text-lg text-mist">{d.name}</p>
                    <p className="mt-1 text-sm leading-5 text-text-3">{d.summary}</p>
                    <dl className="mt-4 grid grid-cols-[64px_1fr] gap-y-1 text-xs">
                      <dt className="text-text-4">Type</dt><dd className="text-text-2">{d.type}</dd>
                      <dt className="text-text-4">Motion</dt><dd className="font-mono text-text-2">{d.motion}</dd>
                    </dl>
                  </button>
                );
              })}
            </div>
            {!generating && <p className="mt-4 text-sm text-text-3">Pick one, or select two to blend them. {picked.length === 2 && <span className="text-violet-300">Blending {picked[0].name} with {picked[1].name}’s accent.</span>}</p>}
          </section>
        )}

        {step === 2 && (
          <section className="grid grid-cols-1 gap-10 animate-rise md:grid-cols-[1fr_360px]" aria-labelledby="s2">
            <div>
              <h1 id="s2" className="display-3 text-mist">Set it up</h1>
              <div className="mt-8 flex flex-col gap-6">
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-text-2">Project name</span>
                  <input value={name} onChange={(e) => { setName(e.target.value); setError(''); }} className="h-12 rounded-xl border border-hairline-strong bg-white/[0.03] px-4 text-mist focus:border-violet-400/70 focus:outline-none" />
                </label>
                <fieldset>
                  <legend className="text-sm text-text-2">What should AETHER make?</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {OUTPUTS.map((o) => {
                      const on = outputs.includes(o.id);
                      return (
                        <label key={o.id} className={`flex h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm transition-colors ${on ? 'border-violet-400/70 bg-violet-500/[0.06] text-mist' : 'border-hairline text-text-2 hover:border-hairline-strong'}`}>
                          <input type="checkbox" className="sr-only" checked={on} onChange={() => setOutputs((v) => (on ? v.filter((x) => x !== o.id) : [...v, o.id]))} />
                          <span className={on ? 'text-violet-400' : 'text-text-3'}>{o.icon}</span>
                          {o.label}
                          {on && <Check size={14} className="ml-auto text-violet-300" />}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-text-2">Email for your workspace <span className="text-text-4">(optional in this demo)</span></span>
                  <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} placeholder="you@studio.com" className="h-12 rounded-xl border border-hairline-strong bg-white/[0.03] px-4 text-mist placeholder:text-text-4 focus:border-violet-400/70 focus:outline-none" />
                  <span className="text-xs text-text-4">No account is created and nothing is sent. This is where sign-up would sit: after you have seen the idea take shape.</span>
                </label>
              </div>
            </div>
            <aside className="card self-start p-4">
              <p className="mono-label text-text-3">Your direction</p>
              {picked.map((d) => (
                <div key={d.id} className="mt-3 flex items-center gap-3">
                  <img src={stageImage[d.visual]} alt="" className="h-12 w-12 rounded-xl object-cover" />
                  <div>
                    <p className="text-sm text-mist">{d.name}</p>
                    <p className="text-xs text-text-3">{d.motion}</p>
                  </div>
                </div>
              ))}
              <p className="mt-4 whitespace-pre-line text-2xl font-light leading-7 text-mist">{picked[0]?.headline}</p>
              <p className="mt-2 text-sm text-text-3">{picked[0]?.subhead}</p>
            </aside>
          </section>
        )}
        {error && <p id="flow-error" role="alert" className="mt-6 text-sm text-red-400">{error}</p>}
      </div>

      <footer className="flex items-center justify-between border-t border-hairline pt-5">
        <Button variant="tertiary" icon={<ArrowLeft size={16} />} onClick={() => (step === 0 ? navigate('workspace', { transition: false }) : setStep(step - 1))}>{step === 0 ? 'Cancel' : 'Back'}</Button>
        <Button variant={step === 1 ? 'muse' : 'primary'} size="lg" iconRight={<ArrowRight size={16} />} onClick={next} disabled={generating}>
          {step === 0 ? 'Show me directions' : step === 1 ? 'Continue' : 'Create project'}
        </Button>
      </footer>
    </div>
  );
}
