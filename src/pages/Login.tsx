import { useEffect, useState } from 'react';
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

function Gear({ size, teeth, className }: { size: number; teeth: number; className: string }) {
  const r = size / 2; const inner = r * 0.78; const hole = r * 0.3;
  const pts: string[] = [];
  for (let t = 0; t < teeth * 2; t++) {
    const a = (t / (teeth * 2)) * Math.PI * 2;
    const rad = t % 2 === 0 ? r : inner;
    const a2 = a + Math.PI / teeth;
    pts.push(`${r + rad * Math.cos(a)},${r + rad * Math.sin(a)}`, `${r + rad * Math.cos(a2)},${r + rad * Math.sin(a2)}`);
  }
  return (
    <svg className={`gear ${className}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <polygon points={pts.join(' ')} />
      <circle cx={r} cy={r} r={hole} className="gear-hole" />
    </svg>
  );
}

function TruckSvg({ className }: { className: string }) {
  return (
    <svg className={`truck ${className}`} viewBox="0 0 120 50" aria-hidden>
      <rect x="2" y="8" width="72" height="30" rx="3" className="t-box" />
      <path d="M76 16 h22 l14 12 v10 h-36 z" className="t-cab" />
      <rect x="84" y="19" width="12" height="8" rx="1.5" className="t-window" />
      <circle cx="20" cy="41" r="7" className="t-wheel" /><circle cx="20" cy="41" r="2.5" className="t-hub" />
      <circle cx="56" cy="41" r="7" className="t-wheel" /><circle cx="56" cy="41" r="2.5" className="t-hub" />
      <circle cx="98" cy="41" r="7" className="t-wheel" /><circle cx="98" cy="41" r="2.5" className="t-hub" />
      <rect x="108" y="30" width="5" height="3" rx="1" className="t-light" />
      <text x="10" y="28" className="t-label">TORQLINE</text>
    </svg>
  );
}

function FleetScene() {
  return (
    <div className="scene" aria-hidden>
      <div className="stars" />
      <div className="sun" />
      <svg className="skyline" viewBox="0 0 600 120" preserveAspectRatio="none">
        <path d="M0 120 V70 h30 v-20 h20 v30 h25 v-45 h18 v45 h22 v-25 h30 v35 h20 v-60 h12 v-10 h8 v10 h12 v60 h25 v-30 h28 v40 h20 v-55 h26 v55 h18 v-20 h30 v25 h24 v-40 h22 v40 h30 v-28 h20 v38 h26 v-18 h24 v18 h20 V120 z" />
      </svg>
      <div className="gears">
        <Gear size={120} teeth={12} className="g1" />
        <Gear size={78} teeth={9} className="g2" />
        <Gear size={54} teeth={8} className="g3" />
      </div>
      <div className="float-card fc1"><span className="fc-dot good" /> Fleet health <b>96%</b></div>
      <div className="float-card fc2"><span className="fc-dot violet" /> NCR-104 <b>closed ✓</b></div>
      <div className="float-card fc3"><span className="fc-dot warn" /> TRK-102 service <b>in 3 days</b></div>
      <div className="road">
        <div className="road-dashes" />
        <TruckSvg className="tr1" />
        <TruckSvg className="tr2" />
      </div>
    </div>
  );
}

function AuthShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="auth-split">
      <section className="auth-visual">
        <FleetScene />
        <div className="auth-pitch">
          <div className="brand auth-brand light">
            <span className="brand-mark"><Gauge size={20} /></span>
            <div><strong>Torqline</strong><small>Fleet maintenance & compliance</small></div>
          </div>
          <h2>Keep every wheel<br /><Typewriter /></h2>
          <ul className="auth-features">
            <li><Wrench size={16} /> Work orders, services & parts in one flow</li>
            <li><ShieldCheck size={16} /> NCRs, audits & a live compliance score</li>
            <li><Sparkles size={16} /> Real-time for the whole team</li>
          </ul>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card glow">
          <div className="brand auth-brand only-small">
            <span className="brand-mark"><Gauge size={20} /></span>
            <div><strong>Torqline</strong><small>Fleet maintenance</small></div>
          </div>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
          {children}
        </div>
        <p className="auth-foot small muted">Protected by role-based access · © {new Date().getFullYear()} Torqline</p>
      </section>
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
