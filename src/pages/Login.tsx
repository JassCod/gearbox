import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Gauge, LogOut, RefreshCw, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import { appUrl, supabase } from '../lib/supabase';
import { useAuth } from '../auth';

type Mode = 'signin' | 'signup' | 'forgot';

const WORDS = ['on the road.', 'audit-ready.', 'compliant.', 'safe.', 'under control.'];

function Typewriter() {
  const [i, setI] = useState(0);
  const [len, setLen] = useState(0);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const word = WORDS[i % WORDS.length];
    const t = setTimeout(() => {
      if (!deleting && len < word.length) setLen(len + 1);
      else if (!deleting) setDeleting(true);
      else if (len > 0) setLen(len - 1);
      else { setDeleting(false); setI(i + 1); }
    }, !deleting && len === word.length ? 1600 : deleting ? 40 : 85);
    return () => clearTimeout(t);
  }, [i, len, deleting]);
  return <span className="typewriter">{WORDS[i % WORDS.length].slice(0, len)}<span className="caret" /></span>;
}

const LoginScene = lazy(() => import('../components/LoginScene'));

/** The login form lives inside the 3D scene as a glass heads-up display that tilts with the pointer. */
function AuthShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!card.current) return;
      const x = e.clientX / window.innerWidth - 0.5; const y = e.clientY / window.innerHeight - 0.5;
      card.current.style.setProperty('--ry', `${x * -7}deg`);
      card.current.style.setProperty('--rx', `${y * 6}deg`);
      card.current.style.setProperty('--gx', `${50 + x * 60}%`);
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);
  return (
    <div className={`auth-stage ${ready ? 'ready' : ''}`}>
      <div className="stage-backdrop" />
      <Suspense fallback={null}><LoginScene onReady={onReady} /></Suspense>
      <div className="stage-vignette" />
      <header className="stage-brand">
        <div className="brand auth-brand light">
          <span className="brand-mark"><Gauge size={20} /></span>
          <div><strong>Torqline</strong><small>Fleet maintenance & compliance</small></div>
        </div>
        <h2 className="stage-tagline">Keep every wheel<br /><Typewriter /></h2>
        <div className="stage-tags">
          <span><Wrench size={14} /> Work orders & services</span>
          <span><ShieldCheck size={14} /> NCRs, audits & compliance</span>
          <span><Sparkles size={14} /> Live for the whole team</span>
        </div>
      </header>
      <main className="stage-card-wrap">
        <div className="hud-card" ref={card}>
          <span className="hud-corner tl" /><span className="hud-corner tr" /><span className="hud-corner bl" /><span className="hud-corner br" />
          <div className="hud-glare" />
          <div className="hud-status"><i /> Secure link · {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</div>
          <h1>{title}</h1>
          {subtitle && <p className="hud-sub">{subtitle}</p>}
          {children}
        </div>
      </main>
      <footer className="stage-foot">Protected by role-based access · © {new Date().getFullYear()} Torqline</footer>
    </div>
  );
}

function PasswordInput({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input id={id} className="input" type={show ? 'text' : 'password'} required minLength={8} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
    </div>
  );
}

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

export function Login() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({
          email, password, options: { data: { full_name: name.trim() }, emailRedirectTo: appUrl() },
        });
        if (err) throw err;
        if (!data.session) setNotice('Check your inbox and click the confirmation link, then sign in.');
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
        if (err) throw err;
        setNotice('If that email has an account, a reset link is on its way.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Mode, [string, string]> = {
    signin: ['Welcome back', 'Sign in to your fleet workspace.'],
    signup: ['Create your account', 'The first account becomes the admin. Others need admin approval.'],
    forgot: ['Reset your password', "We'll email you a link to choose a new one."],
  };

  return (
    <AuthShell title={titles[mode][0]} subtitle={titles[mode][1]}>
      {mode !== 'forgot' && (
        <div className="segmented auth-tabs">
          <button className={mode === 'signin' ? 'on' : ''} onClick={() => { setMode('signin'); setError(''); setNotice(''); }}>Sign in</button>
          <button className={mode === 'signup' ? 'on' : ''} onClick={() => { setMode('signup'); setError(''); setNotice(''); }}>Create account</button>
        </div>
      )}
      <form className="auth-form" onSubmit={submit}>
        {mode === 'signup' && (
          <label className="field"><span>Full name</span>
            <input className="input" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        <label className="field"><span>Email</span>
          <input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== 'forgot' && (
          <div className="field"><label htmlFor="pw">Password</label>
            <PasswordInput id="pw" value={password} onChange={setPassword} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            {mode === 'signup' && password && (
              <span className={`pw-meter s${strength(password)}`}><i /><i /><i /><i /><em>{['Too weak', 'Weak', 'Okay', 'Strong', 'Excellent'][strength(password)]}</em></span>
            )}
          </div>
        )}
        {error && <p className="auth-msg tone-bad">{error}</p>}
        {notice && <p className="auth-msg tone-good">{notice}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </button>
      </form>
      {mode === 'signin' && <button className="link-btn" onClick={() => { setMode('forgot'); setError(''); setNotice(''); }}>Forgot your password?</button>}
      {mode === 'forgot' && <button className="link-btn" onClick={() => { setMode('signin'); setError(''); setNotice(''); }}>Back to sign in</button>}
    </AuthShell>
  );
}

export function SetNewPassword() {
  const { finishRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setBusy(true);
    const { error: err } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(err.message); else finishRecovery();
  };

  return (
    <AuthShell title="Choose a new password">
      <form className="auth-form" onSubmit={submit}>
        <div className="field"><label htmlFor="pw-new">New password</label>
          <PasswordInput id="pw-new" value={password} onChange={setPassword} autoComplete="new-password" />
        </div>
        <div className="field"><label htmlFor="pw-confirm">Confirm password</label>
          <PasswordInput id="pw-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </div>
        {error && <p className="auth-msg tone-bad">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </AuthShell>
  );
}

export function AwaitingAccess() {
  const { profile, session, signOut, refreshProfile } = useAuth();
  const removed = !profile;
  const inactive = profile && !profile.active;
  return (
    <AuthShell
      title={removed ? 'No access' : inactive ? 'Account deactivated' : 'Waiting for approval'}
      subtitle={removed
        ? 'This account is not part of the workspace. Ask an admin to invite you again.'
        : inactive
          ? 'An admin has turned off access for this account.'
          : 'Your account has been created. An admin needs to approve it and choose your role. This page updates by itself once they do.'}>
      <p className="small muted">Signed in as <b>{session?.user.email}</b></p>
      <div className="row gap-sm wrap">
        <button className="btn" onClick={() => refreshProfile()}><RefreshCw size={16} /> Check again</button>
        <button className="btn" onClick={() => signOut()}><LogOut size={16} /> Sign out</button>
      </div>
    </AuthShell>
  );
}
