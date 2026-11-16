import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, CheckCircle, EnvelopeSimple, WarningCircle } from '@phosphor-icons/react';
import { Button } from '../../components/Button';
import { navigate, type AuthView } from '../../lib/router';
import { api, ApiFail, errorText } from '../../data/api';
import { useSession } from '../../data/session';
import { squares } from '../../data/assets';
import { peekPendingProject } from '../pendingIdea';

const INPUT = 'h-12 w-full rounded-xl border border-hairline-strong bg-white/[0.03] px-4 text-mist placeholder:text-text-4 focus:border-violet-400/70 focus:outline-none';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAIL_KEY = 'aether.auth-email';
const rememberEmail = (e: string) => { try { sessionStorage.setItem(EMAIL_KEY, e); } catch { /* optional */ } };
const recallEmail = () => { try { return sessionStorage.getItem(EMAIL_KEY) ?? ''; } catch { return ''; } };

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm text-text-2">{label}</span>
      {children}
      {hint ? <span className="text-xs text-text-4">{hint}</span> : null}
    </label>
  );
}

function Shell({ title, lead, children, back = true }: { title: string; lead?: ReactNode; children: ReactNode; back?: boolean }) {
  return (
    <main id="main" className="relative flex min-h-[100svh] flex-col bg-black px-5 py-6 md:px-10">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate('#')} className="flex items-center gap-2 text-mist" aria-label="Back to the AETHER story">
          <span className="text-2xl font-light leading-none">Æ</span>
          <span className="text-sm font-medium tracking-[0.32em]">ÆTHER</span>
        </button>
        {back ? <button onClick={() => navigate('#')} className="flex items-center gap-2 text-sm text-text-3 hover:text-mist"><ArrowLeft size={14} /> Back to the story</button> : null}
      </header>
      <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10 animate-rise">
        <img src={squares.spark} alt="" className="mb-6 h-14 w-14 rounded-full object-cover" />
        <h1 className="text-3xl font-light tracking-[-0.02em] text-mist">{title}</h1>
        {lead ? <p className="mt-2 text-sm leading-6 text-text-2">{lead}</p> : null}
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}

function ErrorLine({ text }: { text: string }) {
  if (!text) return null;
  return <p role="alert" className="flex items-start gap-2 text-sm text-red-400"><WarningCircle size={16} className="mt-0.5 shrink-0" />{text}</p>;
}

/** Where to go once signed in: back to what the person was doing. */
export function afterAuth() {
  const s = useSession.getState();
  const to = s.returnTo;
  s.setReturnTo(null);
  // a project waiting to be created is picked up by the workspace shell
  navigate(peekPendingProject() ? 'workspace' : to && !/^#?(signin|signup|forgot|check-email)/.test(to) ? to : 'workspace', { transition: false });
}

function GoogleButton() {
  const google = useSession((s) => s.capabilities?.google);
  const [busy, setBusy] = useState(false);
  const toError = useState('')[1];
  if (!google) return null;
  const go = async () => {
    setBusy(true);
    try {
      const r = await api<{ url?: string }>('POST', '/auth/sign-in/social', { provider: 'google', callbackURL: '/#workspace' });
      if (r?.url) window.location.href = r.url;
    } catch (e) { toError(errorText(e)); setBusy(false); }
  };
  return (
    <>
      <Button variant="secondary" size="lg" className="w-full" onClick={go} loading={busy} disabled={busy}>Continue with Google</Button>
      <div className="my-5 flex items-center gap-3 text-xs text-text-4"><span className="h-px flex-1 bg-hairline" />or<span className="h-px flex-1 bg-hairline" /></div>
    </>
  );
}

function SignIn() {
  const signIn = useSession((s) => s.signIn);
  const [email, setEmail] = useState(recallEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = peekPendingProject();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return setError('Enter the email address you signed up with.');
    if (!password) return setError('Enter your password.');
    setBusy(true); setError('');
    try {
      await signIn(email.trim(), password);
      if (useSession.getState().status === 'ready') afterAuth();
      else setError('Signing in did not complete. Try again.');
    } catch (err) {
      if (err instanceof ApiFail && (err.code === 'EMAIL_NOT_VERIFIED' || /verif/i.test(err.message))) { rememberEmail(email.trim()); navigate('check-email', { transition: false }); return; }
      setError(err instanceof ApiFail && err.status === 401 ? 'That email and password do not match an account.' : errorText(err));
    } finally { setBusy(false); }
  };
  return (
    <Shell title="Sign in" lead={pending ? <>Sign in and <span className="text-mist">{pending.name}</span> will be created in your workspace.</> : 'Welcome back. Your projects are where you left them.'}>
      <GoogleButton />
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field label="Email"><input type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} className={INPUT} autoFocus /></Field>
        <Field label="Password"><input type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} className={INPUT} /></Field>
        <ErrorLine text={error} />
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={busy}>Sign in</Button>
      </form>
      <div className="mt-6 flex items-center justify-between text-sm">
        <button onClick={() => navigate('forgot', { transition: false })} className="text-text-3 hover:text-mist">Forgot your password?</button>
        <button onClick={() => navigate('signup', { transition: false })} className="text-violet-300 hover:text-violet-200">Create an account</button>
      </div>
    </Shell>
  );
}

export function passwordProblem(pw: string) {
  if (pw.length < 10) return 'Use at least 10 characters for your password.';
  if (pw.length > 128) return 'Passwords can be at most 128 characters.';
  return '';
}

function SignUp() {
  const signUp = useSession((s) => s.signUp);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = peekPendingProject();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Tell us your name.');
    if (!EMAIL_RE.test(email.trim())) return setError('That email address does not look complete.');
    const pw = passwordProblem(password);
    if (pw) return setError(pw);
    setBusy(true); setError('');
    try {
      const r = await signUp(name.trim(), email.trim(), password);
      rememberEmail(email.trim());
      if (r.needsVerification) navigate('check-email', { transition: false });
      else afterAuth();
    } catch (err) {
      setError(err instanceof ApiFail && /exist/i.test(err.message) ? 'An account with that email already exists. Sign in instead.' : errorText(err));
    } finally { setBusy(false); }
  };
  return (
    <Shell title="Create your account" lead={pending ? <>One step left. <span className="text-mist">{pending.name}</span> and the direction you chose are saved and will be waiting in your workspace.</> : 'Free during early access. No card required.'}>
      <GoogleButton />
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field label="Your name"><input autoComplete="name" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} className={INPUT} autoFocus /></Field>
        <Field label="Email"><input type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} className={INPUT} /></Field>
        <Field label="Password" hint="At least 10 characters."><input type="password" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} className={INPUT} /></Field>
        <ErrorLine text={error} />
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={busy}>Create account</Button>
      </form>
      <p className="mt-6 text-sm text-text-3">Already have an account? <button onClick={() => navigate('signin', { transition: false })} className="text-violet-300 hover:text-violet-200">Sign in</button></p>
    </Shell>
  );
}

/** After sign-up: a confirmation link was emailed. In staging without an email provider the link is shown here, labelled. */
function CheckEmail() {
  const delivery = useSession((s) => s.capabilities?.email.delivery);
  const email = recallEmail();
  const [link, setLink] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (delivery !== 'dev-outbox' || !email) return;
    let stop = false;
    const poll = async (n: number) => {
      try {
        const r = await api<{ message: { url: string; kind: string } | null }>('GET', `/dev/outbox?email=${encodeURIComponent(email)}`);
        if (!stop && r.message?.kind === 'verify') return setLink(r.message.url);
      } catch { /* not available */ }
      if (!stop && n < 5) setTimeout(() => void poll(n + 1), 1200);
    };
    void poll(0);
    return () => { stop = true; };
  }, [delivery, email]);
  const resend = async () => {
    if (!email) return;
    setBusy(true); setNote('');
    try { await api('POST', '/auth/send-verification-email', { email, callbackURL: '/#verified' }); setNote('A new link is on its way.'); }
    catch (e) { setNote(errorText(e)); }
    finally { setBusy(false); }
  };
  return (
    <Shell title="Confirm your email" lead={email ? <>We sent a confirmation link to <span className="text-mist">{email}</span>. Open it on this device and you will land in your workspace.</> : 'We sent you a confirmation link. Open it to finish creating your account.'}>
      {delivery === 'dev-outbox' ? (
        <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/[0.06] p-4">
          <p className="mono-label text-yellow-500">Staging · email delivery is not configured</p>
          <p className="mt-2 text-sm leading-6 text-text-2">No email was sent. In this test environment the confirmation link is shown here instead. In production it only ever goes to the inbox.</p>
          {link ? <a href={link} className="mt-3 inline-flex h-10 items-center rounded-full bg-light px-4 text-sm font-semibold text-black">Confirm {email}</a> : <p className="mt-3 text-sm text-text-3">Looking for the link…</p>}
        </div>
      ) : delivery === 'none' ? (
        <p className="flex items-start gap-2 rounded-2xl border border-red-500/40 p-4 text-sm leading-6 text-text-2"><WarningCircle size={18} className="mt-0.5 shrink-0 text-red-400" />Email delivery is not configured in this environment, so the confirmation link could not be sent. An administrator needs to set RESEND_API_KEY.</p>
      ) : (
        <p className="flex items-center gap-2 text-sm text-text-3"><EnvelopeSimple size={16} /> It can take a minute. Check spam if it has not arrived.</p>
      )}
      <div className="mt-6 flex items-center gap-3">
        <Button variant="secondary" onClick={resend} loading={busy} disabled={busy || !email}>Send the link again</Button>
        <Button variant="tertiary" onClick={() => navigate('signin', { transition: false })}>I have confirmed</Button>
      </div>
      {note ? <p className="mt-3 text-sm text-text-3" role="status">{note}</p> : null}
    </Shell>
  );
}

function Forgot() {
  const delivery = useSession((s) => s.capabilities?.email.delivery);
  const [email, setEmail] = useState(recallEmail);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return setError('Enter the email address for your account.');
    setBusy(true); setError('');
    try { await api('POST', '/auth/request-password-reset', { email: email.trim(), redirectTo: '/#reset-password' }); setSent(true); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };
  return (
    <Shell title="Reset your password" lead="Enter your email and we will send a link to choose a new password.">
      {sent ? (
        <div>
          <p className="flex items-start gap-2 text-sm leading-6 text-text-2"><CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-green-500" />If an account exists for {email.trim()}, a reset link has been sent. It works once and expires in an hour.</p>
          {delivery !== 'resend' ? <p className="mt-3 rounded-2xl border border-yellow-500/40 bg-yellow-500/[0.06] p-3 text-sm leading-6 text-text-2">This environment has no email provider configured, so the link cannot be delivered here. Password recovery works once RESEND_API_KEY is set.</p> : null}
          <Button className="mt-6" onClick={() => navigate('signin', { transition: false })}>Back to sign in</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <Field label="Email"><input type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} className={INPUT} autoFocus /></Field>
          <ErrorLine text={error} />
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={busy}>Send reset link</Button>
          <button type="button" onClick={() => navigate('signin', { transition: false })} className="self-start text-sm text-text-3 hover:text-mist">Back to sign in</button>
        </form>
      )}
    </Shell>
  );
}

function Reset({ token }: { token?: string }) {
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const pw = passwordProblem(password);
    if (pw) return setError(pw);
    setBusy(true); setError('');
    try { await api('POST', '/auth/reset-password', { newPassword: password, token }); setDone(true); }
    catch (err) { setError(err instanceof ApiFail && err.status === 400 ? 'This reset link has expired or was already used. Request a new one.' : errorText(err)); }
    finally { setBusy(false); }
  };
  if (!token) return <Shell title="This link is not complete" lead="Open the reset link from your email again, or request a new one."><Button onClick={() => navigate('forgot', { transition: false })}>Request a new link</Button></Shell>;
  return (
    <Shell title="Choose a new password" lead="You will be signed out everywhere else.">
      {done ? (
        <div>
          <p className="flex items-start gap-2 text-sm text-text-2"><CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-green-500" />Your password has been changed.</p>
          <Button variant="primary" className="mt-6" onClick={() => navigate('signin', { transition: false })}>Sign in</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <Field label="New password" hint="At least 10 characters."><input type="password" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} className={INPUT} autoFocus /></Field>
          <ErrorLine text={error} />
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={busy}>Save password</Button>
        </form>
      )}
    </Shell>
  );
}

/** Landing point of the confirmation link. The API has already signed the person in. */
function Verified() {
  const status = useSession((s) => s.status);
  const load = useSession((s) => s.load);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (status === 'ready') afterAuth(); }, [status]);
  if (status === 'loading' || status === 'ready') return <Shell title="Email confirmed" lead="Opening your workspace…" back={false}><span className="block h-5 w-5 animate-[aether-spin_0.9s_linear_infinite] rounded-full border-2 border-violet-400 border-t-transparent" role="status" aria-label="Loading" /></Shell>;
  return (
    <Shell title="Email confirmed" lead="Your address is confirmed. Sign in to continue.">
      <Button variant="primary" size="lg" onClick={() => navigate('signin', { transition: false })}>Sign in</Button>
    </Shell>
  );
}

const JOIN_KEY = 'aether.join-token';
/** Accept a workspace invitation. Signing in or creating an account first keeps the invitation. */
function Join({ token }: { token?: string }) {
  const status = useSession((s) => s.status);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const stored = (() => { try { return sessionStorage.getItem(JOIN_KEY) ?? undefined; } catch { return undefined; } })();
  const t = token ?? stored;
  useEffect(() => { if (token) { try { sessionStorage.setItem(JOIN_KEY, token); } catch { /* optional */ } } }, [token]);
  const accept = async () => {
    if (!t) return;
    setBusy(true); setError('');
    try {
      const r = await api<{ workspaceId: string }>('POST', '/invitations/accept', { token: t });
      try { sessionStorage.removeItem(JOIN_KEY); } catch { /* optional */ }
      await useSession.getState().load();
      await useSession.getState().switchWorkspace(r.workspaceId);
      navigate('workspace', { transition: false });
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  if (!t) return <Shell title="This invitation link is not complete" lead="Open the link from your invitation again."><Button onClick={() => navigate('#')}>Back to the story</Button></Shell>;
  if (status !== 'ready') {
    const go = (view: AuthView) => { useSession.getState().setReturnTo('join'); navigate(view, { transition: false }); };
    return (
      <Shell title="You have been invited" lead="Sign in or create an account with the email address the invitation was sent to.">
        <div className="flex gap-3">
          <Button variant="primary" size="lg" onClick={() => go('signup')}>Create account</Button>
          <Button size="lg" onClick={() => go('signin')}>Sign in</Button>
        </div>
      </Shell>
    );
  }
  return (
    <Shell title="Join the workspace" lead="Accept the invitation to see its projects, library and activity.">
      <ErrorLine text={error} />
      <Button variant="primary" size="lg" className="mt-4" onClick={accept} loading={busy} disabled={busy}>Accept invitation</Button>
    </Shell>
  );
}

export default function AuthScreens({ view, token }: { view: AuthView; token?: string }) {
  const status = useSession((s) => s.status);
  useEffect(() => {
    if (status === 'ready' && (view === 'signin' || view === 'signup' || view === 'check-email')) afterAuth();
  }, [status, view]);
  switch (view) {
    case 'signup': return <SignUp />;
    case 'forgot': return <Forgot />;
    case 'reset-password': return <Reset token={token} />;
    case 'verified': return <Verified />;
    case 'join': return <Join token={token} />;
    case 'check-email': return <CheckEmail />;
    default: return <SignIn />;
  }
}
