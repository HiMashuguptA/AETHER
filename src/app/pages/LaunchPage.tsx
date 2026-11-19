import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle, WarningCircle, XCircle, Desktop, DeviceTablet, DeviceMobile, RocketLaunch, Copy, Sparkle, Globe, ArrowSquareOut, ArrowCounterClockwise, Eye } from '@phosphor-icons/react';
import { useApp } from '../../data/store';
import { navigate } from '../../lib/router';
import { Button } from '../../components/Button';
import Artboard, { type Device } from '../components/Artboard';
import CoreViewport from '../components/CoreViewport';
import { Segmented, StageBadge, timeAgo, EmptyState } from '../components/bits';
import type { Check, PublishRecord } from '../../data/types';
import { api, errorText } from '../../data/api';
import { roleCan, useRole } from '../../data/session';
import Dialog from '../../components/Dialog';

export default function LaunchPage({ id }: { id: string }) {
  const project = useApp((s) => s.projects.find((p) => p.id === id));
  const publish = useApp((s) => s.publish);
  const startPublish = useApp((s) => s.startPublish);
  const closePublish = useApp((s) => s.closePublish);
  const propose = useApp((s) => s.proposeChanges);
  const setMuse = useApp((s) => s.setMuseOpen);
  const toast = useApp((s) => s.toast);
  const [device, setDevice] = useState<Device>('desktop');
  const [domain, setDomain] = useState('');
  const [domainError, setDomainError] = useState('');
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checksError, setChecksError] = useState('');
  const [missing, setMissing] = useState<string[]>([]);
  const [history, setHistory] = useState<PublishRecord[]>([]);
  const flushSaves = useApp((s) => s.flushSaves);
  const unpublish = useApp((s) => s.unpublish);
  const rollback = useApp((s) => s.rollback);
  const canPublish = roleCan(useRole(), 'admin');
  const canEdit = roleCan(useRole(), 'editor');
  const revision = project?.revision;
  const publishedVersion = project?.published?.version;
  const publishDone = publish?.done;

  // checks run on the server against the saved project, the same ones publishing enforces
  const load = useCallback(async () => {
    setChecksError('');
    try {
      await flushSaves(id);
      const [c, h] = await Promise.all([
        api<{ checks: Check[]; adapter: { name: string; missing: string[] }; slug: string }>('GET', `/projects/${id}/checks`),
        api<{ publishes: PublishRecord[] }>('GET', `/projects/${id}/publishes`),
      ]);
      setChecks(c.checks); setMissing(c.adapter.missing); setHistory(h.publishes);
      setDomain((d) => d || c.slug);
    } catch (e) { setChecksError(errorText(e)); }
  }, [id, flushSaves]);
  useEffect(() => { void load(); }, [load, revision, publishedVersion, publishDone]);

  if (!project) return <div className="p-10"><EmptyState title="Nothing to launch here" body="This project could not be found." action={<Button onClick={() => navigate('projects', { transition: false })}>All projects</Button>} /></div>;

  const list = checks ?? [];
  const problems = list.filter((c) => c.status !== 'pass');
  const blocking = list.filter((c) => c.status === 'fail');
  const score = (g: Check['group']) => {
    const list = (checks ?? []).filter((c) => c.group === g);
    if (!list.length) return 100;
    const pts = list.reduce((a, c) => a + (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.6 : 0.2), 0);
    return Math.round((pts / list.length) * 100);
  };

  const fixWithMuse = () => {
    const items = problems.filter((c) => c.fix).map((c) => ({
      title: c.label,
      target: (c.fix!.scope === 'motion' ? 'motion' : c.fix!.scope === 'space' ? 'space' : 'subhead') as 'motion' | 'subhead' | 'space',
      from: '', to: '', // the server works these out from the saved project
      rationale: c.detail,
      change: c.fix!,
    }));
    if (!items.length) return;
    propose(project.id, items, `I prepared ${items.length === 1 ? 'a fix' : `${items.length} fixes`} for the launch checks on ${project.name}. Review them before publishing.`);
    setMuse(true);
  };

  const go = () => {
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(domain)) {
      setDomainError('Use 2 to 63 lowercase letters, numbers or hyphens, starting with a letter or number.');
      return;
    }
    setDomainError('');
    startPublish(project.id, domain);
  };
  const base = `${window.location.origin}/p/`;

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
            <div className="mt-1 flex items-center gap-2 text-xs text-text-3"><StageBadge stage={project.stage} />{project.published ? <span>Published v{project.published.version} is live, since {timeAgo(project.published.at)}</span> : <span>Not published yet</span>}</div>
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
                  <span className="ml-3 flex-1 truncate rounded-md bg-white/[0.04] px-2 py-0.5 text-center font-mono text-[11px] text-text-3">{base.replace(/^https?:\/\//, '')}{domain}</span>
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
              {canEdit && problems.some((c) => c.fix) && <Button size="sm" variant="muse" icon={<Sparkle size={14} weight="fill" />} onClick={fixWithMuse}>Fix with Muse</Button>}
            </div>
            {checksError && <div className="mt-4 rounded-xl border border-red-500/40 p-3 text-sm text-text-2" role="alert">{checksError} <button onClick={() => void load()} className="text-violet-300">Try again</button></div>}
            {!checks && !checksError && <div className="mt-4 flex flex-col gap-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-10 rounded-xl" />)}</div>}
            {checks && <>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(['Performance', 'Accessibility', 'Search'] as const).map((g) => (
                <div key={g} className="rounded-xl border border-hairline p-3 text-center">
                  <p className={`font-mono text-2xl tabular-nums ${score(g) >= 90 ? 'text-green-500' : 'text-yellow-500'}`}>{score(g)}</p>
                  <p className="mt-1 text-[11px] text-text-3">{g}</p>
                </div>
              ))}
            </div>
            <ul className="mt-4 flex flex-col gap-2">
              {list.map((c) => (
                <li key={c.id} className="flex gap-3 rounded-xl px-1 py-1.5">
                  {c.status === 'pass' ? <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-green-500" aria-label="Pass" /> : c.status === 'warn' ? <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-yellow-500" aria-label="Warning" /> : <XCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-red-400" aria-label="Needs attention" />}
                  <div>
                    <p className="text-sm text-mist">{c.label} <span className="text-xs text-text-4">· {c.group}</span></p>
                    <p className="mt-0.5 text-xs leading-5 text-text-3">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
            </>}
          </div>

          <div className="card p-5">
            <h2 className="text-base font-medium text-mist">Publish</h2>
            {missing.length > 0 && (
              <div className="mt-3 rounded-xl border border-yellow-500/40 bg-yellow-500/[0.06] p-3 text-sm leading-6 text-text-2" role="note">
                Publishing is not set up in this environment. Missing:
                <ul className="mt-1 list-disc pl-5">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
              </div>
            )}
            <label htmlFor="domain" className="mt-4 block text-xs text-text-3">Address</label>
            <div className={`mt-2 flex h-11 items-center rounded-xl border bg-black/40 pl-3 pr-2 ${domainError ? 'border-red-500/70' : 'border-hairline-strong focus-within:border-violet-400/70'}`}>
              <Globe size={16} className="text-text-3" />
              <span className="ml-2 max-w-[45%] truncate font-mono text-xs text-text-3" title={base}>{base.replace(/^https?:\/\//, '')}</span>
              <input id="domain" value={domain} disabled={!canPublish} onChange={(e) => { setDomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')); setDomainError(''); }} className="min-w-0 flex-1 bg-transparent px-1 font-mono text-sm text-mist focus:outline-none" aria-invalid={!!domainError} aria-describedby={domainError ? 'domain-error' : undefined} />
            </div>
            <p className="mt-2 text-xs leading-5 text-text-4">Published pages are served by AETHER at this address. Custom domains such as name.aether.site need a domain and DNS that are not configured yet.</p>
            {domainError && <p id="domain-error" role="alert" className="mt-2 text-xs text-red-400">{domainError}</p>}
            <div className="mt-4 flex gap-2">
              <a href={`/api/projects/${project.id}/preview`} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center gap-2 rounded-full border border-hairline-strong bg-white/[0.04] px-4 text-[15px] font-semibold text-mist hover:bg-white/[0.08]" title="Opens the exact page a publish would produce, for signed-in members only"><Eye size={16} /> Preview</a>
              <Button variant="primary" size="lg" className="flex-1" icon={<RocketLaunch size={16} />} onClick={go} disabled={!!publishing || !canPublish || blocking.length > 0 || missing.length > 0 || !checks}>
                {project.published ? 'Publish a new version' : 'Publish'}
              </Button>
            </div>
            {!canPublish && <p className="mt-2 text-xs text-text-4">Publishing needs the admin or owner role.</p>}
            {canPublish && blocking.length > 0 && <p className="mt-2 text-xs text-red-400">Fix {blocking.length === 1 ? 'the failing check' : `${blocking.length} failing checks`} before publishing.</p>}
            {canPublish && blocking.length === 0 && problems.length > 0 && <p className="mt-2 text-xs text-text-4">{problems.length} check{problems.length > 1 ? 's' : ''} could be better. You can still publish.</p>}
            {project.published && (
              <div className="mt-3 flex gap-2">
                <button onClick={() => copy(project.published!.url)} className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border border-hairline px-3 py-2.5 text-left text-sm text-text-2 hover:text-mist">
                  <span className="truncate font-mono text-xs">{project.published.url}</span><Copy size={14} className="shrink-0" />
                </button>
                <a href={project.published.url} target="_blank" rel="noreferrer" aria-label="Open the live page" className="flex w-11 items-center justify-center rounded-xl border border-hairline text-text-2 hover:text-mist"><ArrowSquareOut size={16} /></a>
              </div>
            )}
            {project.published && canPublish && <Button size="sm" variant="danger" className="mt-3" onClick={() => { if (window.confirm('Unpublish? The public address will stop serving this project. You can publish again or restore a build later.')) void unpublish(project.id); }}>Unpublish</Button>}
          </div>

          {history.length > 0 && (
            <div className="card p-5">
              <h2 className="text-base font-medium text-mist">Publishing history</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {history.map((h) => (
                  <li key={h.id} className="flex items-center gap-3 rounded-xl border border-hairline px-3 py-2 text-sm">
                    <span className="font-mono text-text-2">v{h.number}</span>
                    <span className={`mono-label rounded-full px-2 py-0.5 ${h.status === 'live' ? 'bg-green-500/15 text-green-500' : h.status === 'failed' ? 'bg-red-500/15 text-red-400' : 'bg-white/[0.05] text-text-3'}`}>{h.status}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-text-4" title={h.error}>{h.status === 'failed' && h.error ? h.error : `${timeAgo(h.at)} · project version ${h.versionNumber ?? '–'}`}</span>
                    {canPublish && (h.status === 'superseded' || h.status === 'unpublished') && (
                      <button onClick={() => { if (window.confirm(`Put published v${h.number} back live? Your working project is not changed.`)) void rollback(project.id, h.id); }} className="flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200"><ArrowCounterClockwise size={12} /> Restore</button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <Dialog
        open={!!publishing}
        onClose={() => (publish?.done || publish?.error) && closePublish()}
        title={publish?.done ? 'Live' : publish?.error ? 'Publishing failed' : 'Publishing'}
        wide
        footer={publish?.done ? (
          <>
            <Button variant="secondary" icon={<Copy size={14} />} onClick={() => copy(publish.url ?? '')}>Copy link</Button>
            <a href={publish.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full bg-light px-4 text-[15px] font-semibold text-black hover:bg-white">Open the live page <ArrowSquareOut size={14} /></a>
          </>
        ) : publish?.error ? <Button variant="primary" onClick={closePublish}>Close</Button> : undefined}
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
                  <p className="mt-1 break-all font-mono text-sm text-violet-300">{publish.url}</p>
                  <p className="mt-3 text-sm leading-6 text-text-3">The public address was checked and is serving this build. The project’s Core is now a Universe.</p>
                </div>
              ) : publish.error ? (
                <div role="alert">
                  <ol className="mb-4 flex flex-col gap-2">
                    {publish.steps.map((s, i) => (
                      <li key={s} className={`flex items-center gap-3 text-sm ${i < publish.step ? 'text-text-2' : i === publish.step ? 'text-red-400' : 'text-text-4'}`}>
                        {i < publish.step ? <CheckCircle size={16} weight="fill" className="text-green-500" /> : i === publish.step ? <XCircle size={16} weight="fill" /> : <span className="h-4 w-4 rounded-full border border-hairline-strong" />}{s}
                      </li>
                    ))}
                  </ol>
                  <p className="text-sm leading-6 text-text-2">{publish.error}</p>
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
