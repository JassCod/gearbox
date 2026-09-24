import { useState } from 'react';
import { Gauge, LogOut, RefreshCw } from 'lucide-react';
import { appUrl, supabase } from '../lib/supabase';
import { useAuth } from '../auth';

type Mode = 'signin' | 'signup' | 'forgot';

function AuthShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand auth-brand">
          <span className="brand-mark"><Gauge size={20} /></span>
          <div><strong>Torqline</strong><small>Fleet maintenance</small></div>
        </div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
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
          <label className="field"><span>Password</span>
            <input className="input" type="password" required minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
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
        <label className="field"><span>New password</span>
          <input className="input" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field"><span>Confirm password</span>
          <input className="input" type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
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
