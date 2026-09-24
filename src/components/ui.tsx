import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { Health } from '../lib/utils';
import { humanize } from '../lib/utils';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="row gap-sm wrap">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '' }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint, tone = 'neutral', icon, onClick }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad';
  icon?: ReactNode; onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`stat tone-${tone}`} onClick={onClick}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && <span className="stat-icon">{icon}</span>}
      </div>
      <div className="stat-value">{typeof value === 'number' ? <CountUp value={value} /> : value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </Tag>
  );
}

const TONES: Record<string, string> = {
  green: 'good', ok: 'good', active: 'good', completed: 'good', resolved: 'good', passed: 'good', low: 'neutral',
  amber: 'warn', 'due-soon': 'warn', 'in-workshop': 'warn', 'in-progress': 'info', 'waiting-parts': 'warn',
  medium: 'info', major: 'warn', minor: 'neutral', open: 'info', 'in-workorder': 'info',
  red: 'bad', overdue: 'bad', 'off-road': 'bad', critical: 'bad', high: 'warn', failed: 'bad',
  investigating: 'violet', action: 'warn', verification: 'info', closed: 'good', planned: 'neutral',
};

const LABELS: Record<string, string> = { 'in-workorder': 'In work order', ok: 'On track', action: 'Corrective action', open: 'Open' };

export function Badge({ value, label }: { value: string; label?: string }) {
  return <span className={`badge tone-${TONES[value] ?? 'neutral'}`}>{label ?? LABELS[value] ?? humanize(value)}</span>;
}

export function HealthDot({ health, title }: { health: Health; title?: string }) {
  return <span className={`dot dot-${health}`} title={title} aria-label={title ?? health} />;
}

export function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, children, span }: { label: string; children: ReactNode; span?: boolean }) {
  return (
    <label className={`field ${span ? 'span-2' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <strong>{title}</strong>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}

export function Progress({ value, tone }: { value: number; tone: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)}>
      <div className={`progress-bar tone-${tone}`} style={{ width: `${Math.min(100, Math.max(3, value * 100))}%` }} />
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <input className="input search-input" type="search" value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} />
  );
}

export function Select<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label?: string;
}) {
  return (
    <select className="input" value={value} aria-label={label} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function confirmAction(message: string) {
  return window.confirm(message);
}

/** Numbers roll up to their value on first render – a small touch that makes dashboards feel alive. */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(value); return; }
    let raf = 0; const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{shown.toLocaleString()}</>;
}
