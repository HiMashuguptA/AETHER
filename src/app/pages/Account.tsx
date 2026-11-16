import { useState, type FormEvent } from 'react';
import { CheckCircle, SignOut } from '@phosphor-icons/react';
import { api, ApiFail, errorText } from '../../data/api';
import { roleCan, useSession } from '../../data/session';
import { useApp } from '../../data/store';
import { Button } from '../../components/Button';
import { navigate } from '../../lib/router';
import { Field, passwordProblem } from '../auth/Auth';

const INPUT = 'h-11 w-full rounded-xl border border-hairline-strong bg-white/[0.03] px-3 text-mist placeholder:text-text-4 focus:border-violet-400/70 focus:outline-none';

/** Profile, password and workspace name. */
export default function Account() {
  const user = useSession((s) => s.user);
  const ws = useSession((s) => s.workspaces.find((w) => w.id === s.workspaceId));
  const updateName = useSession((s) => s.updateName);
  const signOut = useSession((s) => s.signOut);
  const toast = useApp((s) => s.toast);
  const [name, setName] = useState(user?.name ?? '');
  const [wsName, setWsName] = useState(ws?.name ?? '');
  const [newWs, setNewWs] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwError, setPwError] = useState('');
  const [busy, setBusy] = useState('');
  if (!user) return null;

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try { await fn(); toast({ text: ok, tone: 'success' }); }
    catch (e) { toast({ text: errorText(e), tone: 'error' }); }
    finally { setBusy(''); }
  };
  const saveName = (e: FormEvent) => { e.preventDefault(); if (name.trim()) void run('name', async () => { await updateName(name.trim()); if (ws) void useApp.getState().hydrate(ws.id, { quiet: true }); }, 'Name updated'); };
  const saveWs = (e: FormEvent) => {
    e.preventDefault();
    if (!ws || !wsName.trim()) return;
    void run('ws', async () => { await api('PATCH', `/workspaces/${ws.id}`, { name: wsName.trim() }); await useSession.getState().load(); }, 'Workspace renamed');
  };
  const createWs = (e: FormEvent) => {
    e.preventDefault();
    if (!newWs.trim()) return;
    void run('newws', async () => { await useSession.getState().createWorkspace(newWs.trim()); setNewWs(''); navigate('workspace', { transition: false }); }, 'Workspace created');
  };
  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    const problem = !current ? 'Enter your current password.' : passwordProblem(next);
    if (problem) return setPwError(problem);
    setBusy('pw'); setPwError('');
    try {
      await api('POST', '/auth/change-password', { currentPassword: current, newPassword: next, revokeOtherSessions: true });
      setCurrent(''); setNext('');
      toast({ text: 'Password changed. Other devices were signed out.', tone: 'success' });
    } catch (err) { setPwError(err instanceof ApiFail && err.status === 400 ? 'Your current password is not correct.' : errorText(err)); }
    finally { setBusy(''); }
  };

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 md:px-8 md:py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-[-0.02em] text-mist md:text-4xl">Account</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-text-3">{user.email}{user.emailVerified ? <CheckCircle size={14} weight="fill" className="text-green-500" aria-label="Email confirmed" /> : <span className="text-yellow-500">· not confirmed</span>}</p>
        </div>
        <Button icon={<SignOut size={16} />} onClick={async () => { await signOut(); navigate('#'); }}>Sign out</Button>
      </header>

      <form onSubmit={saveName} className="card mt-8 flex flex-col gap-4 p-5">
        <h2 className="text-base font-medium text-mist">Profile</h2>
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={INPUT} /></Field>
        <Button type="submit" variant="primary" className="self-start" loading={busy === 'name'} disabled={busy === 'name' || !name.trim() || name.trim() === user.name}>Save</Button>
      </form>

      <form onSubmit={changePassword} className="card mt-4 flex flex-col gap-4 p-5" noValidate>
        <h2 className="text-base font-medium text-mist">Password</h2>
        <Field label="Current password"><input type="password" autoComplete="current-password" value={current} onChange={(e) => { setCurrent(e.target.value); setPwError(''); }} className={INPUT} /></Field>
        <Field label="New password" hint="At least 10 characters. Other devices are signed out."><input type="password" autoComplete="new-password" value={next} onChange={(e) => { setNext(e.target.value); setPwError(''); }} className={INPUT} /></Field>
        {pwError && <p role="alert" className="text-sm text-red-400">{pwError}</p>}
        <Button type="submit" className="self-start" loading={busy === 'pw'} disabled={busy === 'pw'}>Change password</Button>
      </form>

      {ws && roleCan(ws.role, 'admin') && (
        <form onSubmit={saveWs} className="card mt-4 flex flex-col gap-4 p-5">
          <h2 className="text-base font-medium text-mist">Workspace</h2>
          <Field label="Workspace name"><input value={wsName} onChange={(e) => setWsName(e.target.value)} maxLength={80} className={INPUT} /></Field>
          <Button type="submit" className="self-start" loading={busy === 'ws'} disabled={busy === 'ws' || !wsName.trim() || wsName.trim() === ws.name}>Rename</Button>
        </form>
      )}

      <form onSubmit={createWs} className="card mt-4 flex flex-col gap-4 p-5">
        <h2 className="text-base font-medium text-mist">New workspace</h2>
        <Field label="Name" hint="A separate space with its own projects, library and members. You will be its owner."><input value={newWs} onChange={(e) => setNewWs(e.target.value)} maxLength={80} placeholder="Client work" className={INPUT} /></Field>
        <Button type="submit" className="self-start" loading={busy === 'newws'} disabled={busy === 'newws' || !newWs.trim()}>Create workspace</Button>
      </form>
    </div>
  );
}
