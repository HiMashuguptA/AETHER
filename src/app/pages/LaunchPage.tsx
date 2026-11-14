import { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle, WarningCircle, XCircle, Desktop, DeviceTablet, DeviceMobile, RocketLaunch, Copy, Sparkle, Globe, ArrowSquareOut } from '@phosphor-icons/react';
import { useApp } from '../../data/store';
import { navigate } from '../../lib/router';
import { Button } from '../../components/Button';
import Artboard, { type Device } from '../components/Artboard';
import CoreViewport from '../components/CoreViewport';
import { Segmented, StageBadge, timeAgo, EmptyState } from '../components/bits';
import type { Check, Project } from '../../data/types';
import Dialog from '../../components/Dialog';

function checksFor(p: Project): Check[] {
  const t = p.motion.find((x) => x.id === 'headline');
  const lowContrast = p.doc.subheadTone === '#8c8d93' && p.doc.theme !== 'mist';
  const slowHero = (t?.duration ?? 0) > 1.2;
  return [
    { id: 'lcp', group: 'Performance', label: 'Largest paint under 2.5 s', status: 'pass', detail: 'Hero text is HTML, so it paints before the 3D scene loads (1.4 s on a mid-range phone).' },
    { id: '3d', group: 'Performance', label: '3D assets within budget', status: 'pass', detail: '2.1 MB on desktop, 0.8 MB on mobile with the Lite scene.' },
    {
      id: 'motion', group: 'Performance', label: 'Hero settles quickly', status: slowHero ? 'warn' : 'pass',
      detail: slowHero ? `The headline takes ${t?.duration.toFixed(1)} s to settle. Under 1 s feels more responsive.` : 'The headline settles in under a second.',
      fix: slowHero ? { scope: 'motion', track: 'headline', key: 'duration', value: 0.9 } : undefined,
    },
    {
      id: 'contrast', group: 'Accessibility', label: 'Text contrast', status: lowContrast ? 'fail' : 'pass',
      detail: lowContrast ? 'The subheading is 6.3:1 on obsidian. It passes, but small text in sunlight needs more.' : 'Every text pair is at least 4.5:1.',
      fix: lowContrast ? { scope: 'doc', key: 'subheadTone', value: '#c4c5cb' } : undefined,
    },
    { id: 'rm', group: 'Accessibility', label: 'Reduced motion alternative', status: 'pass', detail: 'Crossfades and still frames replace movement when people ask for less motion.' },
    { id: 'kb', group: 'Accessibility', label: 'Keyboard and focus', status: 'pass', detail: 'All controls are reachable, with a visible violet focus ring.' },
    { id: 'meta', group: 'Search', label: 'Title, description and share image', status: p.doc.subhead.length > 40 ? 'pass' : 'warn', detail: p.doc.subhead.length > 40 ? 'Generated from the hero copy.' : 'The description is short. Add a sentence to the subheading.' },
  ];
}

export default function LaunchPage({ id }: { id: string }) {
  const project = useApp((s) => s.projects.find((p) => p.id === id));
  const publish = useApp((s) => s.publish);
  const startPublish = useApp((s) => s.startPublish);
  const closePublish = useApp((s) => s.closePublish);
  const propose = useApp((s) => s.proposeChanges);
  const setMuse = useApp((s) => s.setMuseOpen);
  const toast = useApp((s) => s.toast);
  const [device, setDevice] = useState<Device>('desktop');
  const [domain, setDomain] = useState(project?.domain ?? '');
  const [domainError, setDomainError] = useState('');
  const checks = useMemo(() => (project ? checksFor(project) : []), [project]);

  if (!project) return <div className="p-10"><EmptyState title="Nothing to launch here" body="This project could not be found." action={<Button onClick={() => navigate('projects', { transition: false })}>All projects</Button>} /></div>;

  const problems = checks.filter((c) => c.status !== 'pass');
  const score = (g: Check['group']) => {
    const list = checks.filter((c) => c.group === g);
    const pts = list.reduce((a, c) => a + (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.6 : 0.2), 0);
    return Math.round((pts / list.length) * 100);
  };

  const fixWithMuse = () => {
    const items = problems.filter((c) => c.fix).map((c) => ({
      title: c.label,
      target: (c.fix!.scope === 'motion' ? 'motion' : 'subhead') as 'motion' | 'subhead',
      from: c.fix!.scope === 'motion' ? `${project.motion.find((t) => t.id === 'headline')?.duration.toFixed(1)} s` : project.doc.subheadTone.toUpperCase(),
      to: c.fix!.scope === 'motion' ? '0.9 s' : String(c.fix!.value).toUpperCase(),
      rationale: c.detail,
      change: c.fix!,
    }));
    if (!items.length) return;
    propose(project.id, items, `I prepared ${items.length === 1 ? 'a fix' : `${items.length} fixes`} for the launch checks on ${project.name}. Review them before publishing.`);
    setMuse(true);
  };

  const go = () => {
    if (!/^[a-z0-9]([a-z0-9-]{1,40}[a-z0-9])?$/.test(domain)) {
      setDomainError('Use 3 to 42 lowercase letters, numbers or hyphens, starting and ending with a letter or number.');
      return;
    }
    setDomainError('');
    useApp.setState((s) => ({ projects: s.projects.map((p) => (p.id === project.id ? { ...p, domain } : p)) }));
    startPublish(project.id);
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast({ text: 'Link copied', tone: 'success' }); }
    catch { toast({ text: `Copy failed. The address is ${text}`, tone: 'error' }); }
  };

  const publishing = publish && publish.projectId === project.id;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 md:px-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`project-${project.id}`, { transition: false })} aria-label="Back to canvas" className="flex h-9 w-9 items-center justify-center rounded-full text-text-3 hover:bg-white/[0.06] hover:text-mist"><ArrowLeft size={16} /></button>
          <div>
            <h1 className="text-2xl font-light text-mist">Launch {project.name}</h1>
            <div className="mt-1 flex items-center gap-2 text-xs text-text-3"><StageBadge stage={project.stage} />{project.published ? <span>v{project.published.version} live since {timeAgo(project.published.at)}</span> : <span>Not published yet</span>}</div>
          </div>
        </div>
        <Segmented<Device> label="Preview device" value={device} onChange={setDevice} options={[{ id: 'desktop', label: 'Desktop', icon: <Desktop size={14} /> }, { id: 'tablet', label: 'Tablet', icon: <DeviceTablet size={14} /> }, { id: 'mobile', label: 'Phone', icon: <DeviceMobile size={14} /> }]} />
      </header>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_400px]">
        <section aria-label="Preview" className="flex items-start justify-center rounded-3xl border border-hairline bg-[#0c0c0e] p-4 md:p-8">
          <div className={`w-full transition-[max-width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${device === 'mobile' ? 'max-w-[320px]' : device === 'tablet' ? 'max-w-[600px]' : 'max-w-[1000px]'}`}>
            <div className={`overflow-hidden border border-hairline-strong bg-black ${device === 'desktop' ? 'rounded-xl' : 'rounded-[28px] p-2'}`}>
              {device === 'desktop' && (
                <div className="flex items-center gap-1.5 border-b border-hairline px-3 py-2">
                  {[0, 1, 2].map((i) => <span key={i} className="h-2.5 w-2.5 rounded-full bg-raised-3" />)}
                  <span className="ml-3 flex-1 truncate rounded-md bg-white/[0.04] px-2 py-0.5 text-center font-mono text-[11px] text-text-3">{domain || project.domain}.aether.site</span>
                </div>
              )}
              <Artboard doc={project.doc} name={project.client} device={device} motion={project.motion} playToken={device.length} />
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium text-mist">Checks</h2>
              {problems.some((c) => c.fix) && <Button size="sm" variant="muse" icon={<Sparkle size={14} weight="fill" />} onClick={fixWithMuse}>Fix with Muse</Button>}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(['Performance', 'Accessibility', 'Search'] as const).map((g) => (
                <div key={g} className="rounded-xl border border-hairline p-3 text-center">
                  <p className={`font-mono text-2xl tabular-nums ${score(g) >= 90 ? 'text-green-500' : 'text-yellow-500'}`}>{score(g)}</p>
                  <p className="mt-1 text-[11px] text-text-3">{g}</p>
                </div>
              ))}
            </div>
            <ul className="mt-4 flex flex-col gap-2">
              {checks.map((c) => (
                <li key={c.id} className="flex gap-3 rounded-xl px-1 py-1.5">
                  {c.status === 'pass' ? <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-green-500" aria-label="Pass" /> : c.status === 'warn' ? <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-yellow-500" aria-label="Warning" /> : <XCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-red-400" aria-label="Needs attention" />}
                  <div>
                    <p className="text-sm text-mist">{c.label} <span className="text-xs text-text-4">· {c.group}</span></p>
                    <p className="mt-0.5 text-xs leading-5 text-text-3">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-5">
            <h2 className="text-base font-medium text-mist">Publish</h2>
            <label htmlFor="domain" className="mt-4 block text-xs text-text-3">Address</label>
            <div className={`mt-2 flex h-11 items-center rounded-xl border bg-black/40 pl-3 pr-2 ${domainError ? 'border-red-500/70' : 'border-hairline-strong focus-within:border-violet-400/70'}`}>
              <Globe size={16} className="text-text-3" />
              <input id="domain" value={domain} onChange={(e) => { setDomain(e.target.value.toLowerCase()); setDomainError(''); }} className="min-w-0 flex-1 bg-transparent px-2 font-mono text-sm text-mist focus:outline-none" aria-invalid={!!domainError} aria-describedby={domainError ? 'domain-error' : undefined} />
              <span className="font-mono text-sm text-text-3">.aether.site</span>
            </div>
            {domainError && <p id="domain-error" role="alert" className="mt-2 text-xs text-red-400">{domainError}</p>}
            <Button variant="primary" size="lg" className="mt-4 w-full" icon={<RocketLaunch size={16} />} onClick={go} disabled={!!publishing}>
              {project.published ? `Publish v${project.published.version + 1}` : 'Publish'}
            </Button>
            {problems.length > 0 && <p className="mt-2 text-xs text-text-4">{problems.length} check{problems.length > 1 ? 's' : ''} could be better. You can still publish.</p>}
            {project.published && (
              <button onClick={() => copy(`https://${project.published!.url}`)} className="mt-3 flex w-full items-center justify-between rounded-xl border border-hairline px-3 py-2.5 text-left text-sm text-text-2 hover:text-mist">
                <span className="truncate font-mono">{project.published.url}</span><Copy size={14} />
              </button>
            )}
          </div>
        </aside>
      </div>

      <Dialog
        open={!!publishing}
        onClose={() => publish?.done && closePublish()}
        title={publish?.done ? 'Live' : 'Publishing'}
        wide
        footer={publish?.done ? (
          <>
            <Button variant="secondary" icon={<Copy size={14} />} onClick={() => copy(`https://${publish.url}`)}>Copy link</Button>
            <Button variant="primary" iconRight={<ArrowSquareOut size={14} />} onClick={() => { closePublish(); navigate('workspace', { transition: false }); }}>Back to home</Button>
          </>
        ) : undefined}
      >
        {publish && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-[220px_1fr]">
            <div className="aspect-square overflow-hidden rounded-2xl border border-hairline">
              <CoreViewport morph={4} controls={false} burst={publish.done ? 1 : 0} className="h-full w-full" label={publish.done ? 'The Core becoming a universe' : 'The Core while publishing'} />
            </div>
            <div>
              {publish.done ? (
                <div className="animate-rise">
                  <p className="text-lg text-mist">{project.name} is live.</p>
                  <p className="mt-1 font-mono text-sm text-violet-300">{publish.url}</p>
                  <p className="mt-3 text-sm leading-6 text-text-3">Its Core is now a Universe. It has joined the galaxy at the end of the AETHER story.</p>
                </div>
              ) : (
                <ol className="flex flex-col gap-3" aria-live="polite">
                  {publish.steps.map((s, i) => (
                    <li key={s} className={`flex items-center gap-3 text-sm ${i < publish.step ? 'text-text-2' : i === publish.step ? 'text-mist' : 'text-text-4'}`}>
                      {i < publish.step ? <CheckCircle size={16} weight="fill" className="text-green-500" /> : i === publish.step ? <span className="h-4 w-4 animate-[aether-spin_0.9s_linear_infinite] rounded-full border-2 border-violet-400 border-t-transparent" /> : <span className="h-4 w-4 rounded-full border border-hairline-strong" />}
                      {s}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
