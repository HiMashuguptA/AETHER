import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Copy, EnvelopeSimple, Trash, UserPlus } from '@phosphor-icons/react';
import { api, errorText } from '../../data/api';
import { roleCan, useSession, type Role } from '../../data/session';
import { useApp } from '../../data/store';
import type { Member } from '../../data/people';
import { Button } from '../../components/Button';
import { Avatar, EmptyState } from '../components/bits';

interface Invitation { id: string; email: string; role: Role; expiresAt: number }
interface UsageRow { feature: string; provider: string; model: string; requests: number; input_tokens: number; output_tokens: number; cost_usd: number }

const ROLE_HELP: Record<Role, string> = {
  owner: 'Everything, including ownership and admins',
  admin: 'Members, publishing and everything editors can do',
  editor: 'Create and edit projects, use Muse, upload assets',
  viewer: 'Look, but not change anything',
};

/** Workspace members, roles and invitations. Every rule shown here is enforced by the API. */
export default function Team() {
  const ws = useSession((s) => s.workspaces.find((w) => w.id === s.workspaceId));
  const me = useSession((s) => s.user);
  const toast = useApp((s) => s.toast);
  const hydrate = useApp((s) => s.hydrate);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [usage, setUsage] = useState<UsageRow[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<Role, 'owner'>>('editor');
  const [inviteError, setInviteError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<{ email: string; link: string; emailed: boolean } | null>(null);
  const myRole = ws?.role ?? null;
  const isAdmin = roleCan(myRole, 'admin');
  const isOwner = myRole === 'owner';

  const load = useCallback(async () => {
    if (!ws) return;
    try {
      const r = await api<{ members: Member[]; invitations: Invitation[] }>('GET', `/workspaces/${ws.id}/members`);
      setMembers(r.members); setInvites(r.invitations); setState('ready');
      if (roleCan(ws.role, 'admin')) api<{ last30Days: UsageRow[] }>('GET', `/workspaces/${ws.id}/usage`).then((u) => setUsage(u.last30Days)).catch(() => setUsage(null));
    } catch (e) { setError(errorText(e)); setState('error'); }
  }, [ws]);
  useEffect(() => { void load(); }, [load]);

  if (!ws) return null;

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setInviteError('Enter a complete email address.');
    setBusy(true); setInviteError('');
    try {
      const r = await api<{ link: string; emailed: boolean }>('POST', `/workspaces/${ws.id}/invitations`, { email: email.trim(), role });
      setLastLink({ email: email.trim(), link: r.link, emailed: r.emailed });
      setEmail('');
      await load();
    } catch (err) { setInviteError(errorText(err)); }
    finally { setBusy(false); }
  };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast({ text: 'Invitation link copied', tone: 'success' }); }
    catch { toast({ text: 'Copy failed. Select the link and copy it by hand.', tone: 'error' }); }
  };
  const changeRole = async (m: Member, next: Role) => {
    if (next === 'owner' && !window.confirm(`Make ${m.name} the owner of ${ws.name}? You will become an admin.`)) return;
    try {
      await api('PATCH', `/workspaces/${ws.id}/members/${m.id}`, { role: next });
      toast({ text: `${m.name} is now ${next}`, tone: 'success' });
      await load();
      if (next === 'owner') await useSession.getState().load();
      void hydrate(ws.id, { quiet: true });
    } catch (e) { toast({ text: errorText(e), tone: 'error' }); }
  };
  const remove = async (m: Member) => {
    const self = m.id === me?.id;
    if (!window.confirm(self ? `Leave ${ws.name}? You will lose access to its projects.` : `Remove ${m.name} from ${ws.name}?`)) return;
    try {
      await api('DELETE', `/workspaces/${ws.id}/members/${m.id}`);
      if (self) { await useSession.getState().load(); return; }
      toast({ text: `${m.name} was removed`, tone: 'neutral' });
      await load();
      void hydrate(ws.id, { quiet: true });
    } catch (e) { toast({ text: errorText(e), tone: 'error' }); }
  };
  const revoke = async (i: Invitation) => {
    try { await api('DELETE', `/workspaces/${ws.id}/invitations/${i.id}`); await load(); }
    catch (e) { toast({ text: errorText(e), tone: 'error' }); }
  };
  const canEdit = (m: Member) => isAdmin && m.id !== me?.id && m.role !== 'owner' && (isOwner || m.role !== 'admin');
  const totalCost = usage?.reduce((a, u) => a + u.cost_usd, 0) ?? 0;

  return (
    <div className="mx-auto max-w-[960px] px-4 py-8 md:px-8 md:py-10">
      <header>
        <h1 className="text-3xl font-light tracking-[-0.02em] text-mist md:text-4xl">Team</h1>
        <p className="mt-1 text-sm text-text-3">{ws.name} · your role is <span className="capitalize text-text-2">{myRole}</span></p>
      </header>

      {state === 'loading' && <div className="mt-8 flex flex-col gap-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}</div>}
      {state === 'error' && <div className="mt-8"><EmptyState title="Members did not load" body={error} action={<Button variant="primary" onClick={() => { setState('loading'); void load(); }}>Try again</Button>} /></div>}

      {state === 'ready' && (
        <>
          <section className="mt-8" aria-labelledby="members-h">
            <h2 id="members-h" className="mono-label text-text-3">Members · {members.length}</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {members.map((m) => (
                <li key={m.id} className="card flex flex-wrap items-center gap-3 p-3">
                  <Avatar id={m.id} size={36} ring="#141416" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-mist">{m.name}{m.id === me?.id ? <span className="text-text-4"> · you</span> : null}</p>
                    <p className="truncate text-xs text-text-3">{m.email}</p>
                  </div>
                  {canEdit(m) ? (
                    <label className="flex items-center gap-2 text-xs text-text-3">
                      <span className="sr-only">Role for {m.name}</span>
                      <select value={m.role} onChange={(e) => void changeRole(m, e.target.value as Role)} className="h-9 rounded-xl border border-hairline-strong bg-[#141416] px-2 text-sm capitalize text-mist focus:border-violet-400/70 focus:outline-none">
                        {(['viewer', 'editor', ...(isOwner ? ['admin', 'owner'] : [])] as Role[]).map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </label>
                  ) : (
                    <span className="mono-label rounded-full border border-hairline-strong px-2.5 py-1 capitalize text-text-2" title={ROLE_HELP[m.role]}>{m.role}</span>
                  )}
                  {(canEdit(m) || (m.id === me?.id && m.role !== 'owner')) && (
                    <button onClick={() => void remove(m)} aria-label={m.id === me?.id ? 'Leave workspace' : `Remove ${m.name}`} className="flex h-9 w-9 items-center justify-center rounded-full text-text-3 hover:bg-red-500/10 hover:text-red-400"><Trash size={16} /></button>
                  )}
                </li>
              ))}
            </ul>
            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              {(Object.keys(ROLE_HELP) as Role[]).map((r) => <div key={r} className="flex gap-2"><dt className="w-14 shrink-0 capitalize text-text-2">{r}</dt><dd className="text-text-4">{ROLE_HELP[r]}</dd></div>)}
            </dl>
          </section>

          {isAdmin ? (
            <section className="mt-10" aria-labelledby="invite-h">
              <h2 id="invite-h" className="mono-label text-text-3">Invite someone</h2>
              <form onSubmit={invite} className="mt-3 flex flex-col gap-2 sm:flex-row" noValidate>
                <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-hairline-strong bg-white/[0.03] px-3 focus-within:border-violet-400/70">
                  <EnvelopeSimple size={16} className="text-text-3" />
                  <span className="sr-only">Email address</span>
                  <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setInviteError(''); }} placeholder="name@studio.com" className="w-full bg-transparent text-sm text-mist placeholder:text-text-4 focus:outline-none" />
                </label>
                <label>
                  <span className="sr-only">Role</span>
                  <select value={role} onChange={(e) => setRole(e.target.value as Exclude<Role, 'owner'>)} className="h-11 rounded-xl border border-hairline-strong bg-[#141416] px-3 text-sm capitalize text-mist focus:border-violet-400/70 focus:outline-none">
                    {(['viewer', 'editor', ...(isOwner ? ['admin'] : [])] as Exclude<Role, 'owner'>[]).map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <Button type="submit" variant="primary" icon={<UserPlus size={16} />} loading={busy} disabled={busy}>Invite</Button>
              </form>
              {inviteError && <p role="alert" className="mt-2 text-sm text-red-400">{inviteError}</p>}
              {lastLink && (
                <div className="mt-3 rounded-2xl border border-hairline-strong p-3">
                  <p className="text-sm text-text-2">{lastLink.emailed ? `An invitation was emailed to ${lastLink.email}.` : `Email delivery is not configured here, so nothing was sent to ${lastLink.email}. Share this link with them yourself; it works once, for that address only, for 7 days.`}</p>
                  <button onClick={() => void copy(lastLink.link)} className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl border border-hairline px-3 py-2 text-left text-xs text-text-2 hover:text-mist"><span className="truncate font-mono">{lastLink.link}</span><Copy size={14} className="shrink-0" /></button>
                </div>
              )}
              {invites.length > 0 && (
                <ul className="mt-4 flex flex-col gap-1.5">
                  {invites.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 rounded-xl border border-hairline px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-text-2">{i.email}</span>
                      <span className="text-xs capitalize text-text-4">{i.role} · expires {new Date(i.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                      <button onClick={() => void revoke(i)} className="text-xs text-text-3 hover:text-red-400">Revoke</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <p className="mt-8 text-sm text-text-3">Only owners and admins can invite people or change roles.</p>
          )}

          {isAdmin && usage && (
            <section className="mt-10" aria-labelledby="usage-h">
              <h2 id="usage-h" className="mono-label text-text-3">Muse usage · last 30 days</h2>
              {usage.length === 0 ? <p className="mt-3 text-sm text-text-3">No Muse requests yet.</p> : (
                <div className="card mt-3 overflow-x-auto p-1">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead><tr className="text-xs text-text-4"><th className="px-3 py-2 font-normal">Feature</th><th className="px-3 py-2 font-normal">Model</th><th className="px-3 py-2 text-right font-normal">Requests</th><th className="px-3 py-2 text-right font-normal">Tokens in / out</th><th className="px-3 py-2 text-right font-normal">Est. cost</th></tr></thead>
                    <tbody>
                      {usage.map((u, i) => (
                        <tr key={i} className="border-t border-hairline text-text-2">
                          <td className="px-3 py-2 capitalize">{u.feature}</td>
                          <td className="px-3 py-2 font-mono text-xs">{u.provider === 'fallback' ? 'development fallback (not AI)' : u.model}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{u.requests}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{(u.input_tokens ?? 0).toLocaleString()} / {(u.output_tokens ?? 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right tabular-nums">${(u.cost_usd ?? 0).toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t border-hairline text-mist"><td className="px-3 py-2" colSpan={4}>Total</td><td className="px-3 py-2 text-right tabular-nums">${totalCost.toFixed(4)}</td></tr></tfoot>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
