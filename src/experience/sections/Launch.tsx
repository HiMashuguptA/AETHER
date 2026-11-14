import { useRef, useState } from 'react';
import { ArrowUp } from '@phosphor-icons/react';
import { useChapter } from '../useChapter';
import { MagneticButton } from '../../components/Button';
import { scrollToTarget } from '../../lib/scroll';
import { navigate } from '../../lib/router';
import { setPendingIdea } from '../../app/pendingIdea';
import Dialog from '../../components/Dialog';

const LEGAL: Record<string, { title: string; body: string[] }> = {
  privacy: {
    title: 'Privacy',
    body: [
      'AETHER is a fictional product built as a frontend prototype.',
      'Nothing you type in this demo leaves your browser. There are no accounts, no analytics and no tracking cookies, so no consent banner is needed here.',
      'A production version would publish a full privacy policy before launch.',
    ],
  },
  terms: {
    title: 'Terms',
    body: ['This prototype is provided for review only. Projects, people and numbers in it are invented sample content.'],
  },
  status: {
    title: 'Status',
    body: ['Workspace: operational', 'Muse (simulated): operational', 'Publishing (simulated): operational', 'Checked a moment ago.'],
  },
};

/** Chapter 06, The Launch: the Core becomes a galaxy and the story ends in an input, not a footer. */
export default function Launch() {
  const section = useRef<HTMLElement>(null);
  const [p, setP] = useState(0);
  const [idea, setIdea] = useState('');
  const [error, setError] = useState('');
  const [legal, setLegal] = useState<string | null>(null);
  useChapter(section, 'launch', { onUpdate: setP });

  const show = Math.min(1, Math.max(0, (p - 0.5) / 0.2));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (idea.trim().length > 0 && idea.trim().length < 12) {
      setError('Give Muse a little more to work with: at least 12 characters.');
      return;
    }
    setPendingIdea(idea.trim());
    navigate('start');
  };

  return (
    <section id="launch-story" ref={section} className="relative h-[360vh]" aria-labelledby="launch-title">
      <div className="sticky top-0 flex h-[100svh] flex-col justify-between overflow-hidden px-6 pb-6 pt-28 md:px-10">
        <div className="mx-auto w-full max-w-[1280px]" style={{ opacity: show, transform: `translateY(${(1 - show) * 30}px)`, filter: `blur(${(1 - show) * 10}px)` }}>
          <p className="mono-label text-violet-400">06 · The launch</p>
          <h2 id="launch-title" className="display-1 mt-4 max-w-[1100px] text-mist [text-shadow:0_4px_60px_rgba(0,0,0,0.6)]">
            Your universe starts
            <br />
            with a single spark
          </h2>
        </div>
        <div className="mx-auto w-full max-w-[1280px]" style={{ opacity: show, pointerEvents: show > 0.5 ? 'auto' : 'none' }}>
          <form onSubmit={submit} className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between" noValidate>
            <div className="w-full max-w-[720px]">
              <label htmlFor="idea" className="mono-label text-text-3">Every universe begins with a spark. Describe yours.</label>
              <div className="glass mt-3 flex flex-col gap-2 rounded-[28px] p-2 sm:flex-row sm:items-center sm:rounded-full">
                <input
                  id="idea"
                  value={idea}
                  onChange={(e) => { setIdea(e.target.value); setError(''); }}
                  placeholder="A launch site for a coffee roaster’s spring harvest"
                  className="h-12 min-w-0 flex-1 bg-transparent px-4 text-base text-mist placeholder:text-text-4 focus:outline-none"
                  aria-invalid={!!error}
                  aria-describedby={error ? 'idea-error' : undefined}
                  autoComplete="off"
                />
                <MagneticButton type="submit" variant="primary" size="lg" cursor="Begin">Start your first project</MagneticButton>
              </div>
              {error ? <p id="idea-error" className="mt-2 pl-4 text-sm text-red-400" role="alert">{error}</p> : <p className="mt-2 pl-4 text-xs text-text-3">Free during early access. No card required.</p>}
            </div>
          </form>
          <footer className="mt-10 flex flex-col gap-4 border-t border-white/10 pt-5 text-xs text-text-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <span className="text-base font-light text-mist">Æ</span>
              <span>© 2026 AETHER Labs. A fictional product, built as a prototype.</span>
            </div>
            <nav aria-label="Legal" className="flex flex-wrap items-center gap-5">
              <button onClick={() => setLegal('privacy')} className="hover:text-mist">Privacy</button>
              <button onClick={() => setLegal('terms')} className="hover:text-mist">Terms</button>
              <button onClick={() => setLegal('status')} className="inline-flex items-center gap-1.5 hover:text-mist"><span className="h-1.5 w-1.5 rounded-full bg-green-500" />Status</button>
              <button onClick={() => scrollToTarget(0, { duration: 3.2 })} className="inline-flex items-center gap-1.5 text-text-2 hover:text-mist" data-cursor="Rewind">
                Back to the beginning <ArrowUp size={12} />
              </button>
            </nav>
          </footer>
        </div>
      </div>
      <Dialog open={!!legal} onClose={() => setLegal(null)} title={legal ? LEGAL[legal].title : ''}>
        {legal && LEGAL[legal].body.map((b) => <p key={b} className="text-sm leading-6 text-text-2">{b}</p>)}
      </Dialog>
    </section>
  );
}
