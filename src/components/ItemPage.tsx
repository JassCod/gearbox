import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Bell, BellRing, Check, Clock, Download, Eye, FileArchive, FileImage, FileSpreadsheet, FileText, History,
  MessageSquare, Paperclip, Pin, PinOff, Plus, Repeat, Sparkles, Trash2, Upload, Wrench, AlertTriangle, PenLine, CheckCircle2, Loader2, XCircle, CloudUpload,
} from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import type { ActivityEvent, Attachment, EntityType, Priority, Reminder } from '../types';
import { Badge, Empty, confirmAction } from './ui';
import { addDays, daysUntil, fmtDate, relDays, todayISO, uid } from '../lib/utils';
import { entityTitle } from '../lib/entities';

export interface ItemTab {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
  render: () => ReactNode;
}

export interface HeroStat {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'good' | 'warn' | 'bad';
}

interface Props {
  entity: { type: EntityType; id: string };
  back: { to: string; label: string };
  icon: ReactNode;
  eyebrow: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  stats?: HeroStat[];
  tabs: ItemTab[];
  /** Extra timeline entries derived from related records (e.g. completed jobs). */
  historyExtras?: ActivityEvent[];
  accent?: 'teal' | 'amber' | 'red' | 'blue' | 'violet';
  banner?: ReactNode;
}


// ---------- Upload queue (shared by the page-wide drop overlay and the Documents tab) ----------

export interface UploadJob { id: string; name: string; size: number; status: 'uploading' | 'done' | 'error'; message?: string; category: string }
export interface UploadMeta { category: string; expiry?: string; notes?: string }

/** Best guess at a document category from the file itself, used for drag-and-drop anywhere on the page. */
export function guessCategory(file: File): string {
  const n = file.name.toLowerCase();
  if (/invoice|receipt|bill|quote/.test(n)) return 'Invoice';
  if (/rego|registration/.test(n)) return 'Registration';
  if (/insur|policy/.test(n)) return 'Insurance';
  if (/licen[cs]e/.test(n)) return 'Licence';
  if (/cert|test|ticket/.test(n)) return 'Certificate';
  if (/manual|guide|handbook/.test(n)) return 'Manual';
  if (/service|logbook|job ?card/.test(n)) return 'Service record';
  if (/contract|agreement|lease/.test(n)) return 'Contract';
  if (/report|audit|inspection/.test(n)) return 'Report';
  if (file.type.startsWith('image/') || /\.(heic|jpe?g|png|webp)$/.test(n)) return 'Photo';
  return 'Other';
}

export function useUploadQueue(entity: { type: EntityType; id: string }) {
  const { addAttachment } = useStore();
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const upload = useCallback(async (files: FileList | File[], meta: UploadMeta) => {
    const list = Array.from(files);
    const queued = list.map((f) => ({ id: uid(), name: f.name, size: f.size, status: 'uploading' as const, category: meta.category === 'Auto' ? guessCategory(f) : meta.category }));
    setJobs((j) => [...queued, ...j].slice(0, 12));
    await Promise.all(list.map(async (f, i) => {
      const job = queued[i];
      try {
        await addAttachment(entity.type, entity.id, f, { ...meta, category: job.category });
        setJobs((j) => j.map((x) => (x.id === job.id ? { ...x, status: 'done' } : x)));
      } catch (err) {
        const raw = err instanceof Error ? err.message : 'Upload failed';
        const message = /bucket not found/i.test(raw) ? 'Document storage is not set up yet – an admin needs to re-run supabase/schema.sql in Supabase.' : raw;
        setJobs((j) => j.map((x) => (x.id === job.id ? { ...x, status: 'error', message } : x)));
      }
    }));
  }, [addAttachment, entity.type, entity.id]);
  const clearDone = useCallback(() => setJobs((j) => j.filter((x) => x.status === 'uploading')), []);
  return { jobs, upload, clearDone };
}

export const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/**
 * Full-page view for one record: a hero header plus tabs. Documents, reminders,
 * history and notes are added to every item automatically.
 */
export function ItemPage({ entity, back, icon, eyebrow, title, subtitle, badges, actions, stats, tabs, historyExtras = [], accent = 'teal', banner }: Props) {
  const { data } = useStore();
  const [params, setParams] = useSearchParams();
  const docs = data.attachments.filter((a) => a.entityType === entity.type && a.entityId === entity.id);
  const reminders = data.reminders.filter((r) => r.entityType === entity.type && r.entityId === entity.id);
  const notes = data.notes.filter((n) => n.entityType === entity.type && n.entityId === entity.id);
  const events = data.activity.filter((e) => e.entityType === entity.type && e.entityId === entity.id);
  const perm = usePermissions();
  const queue = useUploadQueue(entity);
  const [dropping, setDropping] = useState(false);
  const depth = useRef(0);
  const canUpload = perm.canWrite('attachments');

  const allTabs: ItemTab[] = [
    ...tabs,
    { id: 'documents', label: 'Documents', icon: <Paperclip size={15} />, count: docs.length, render: () => <DocumentsTab entity={entity} docs={docs} queue={queue} /> },
    { id: 'reminders', label: 'Reminders', icon: <Bell size={15} />, count: reminders.filter((r) => !r.done).length, render: () => <RemindersTab entity={entity} reminders={reminders} /> },
    { id: 'history', label: 'History', icon: <History size={15} />, render: () => <HistoryTab events={[...events, ...historyExtras]} /> },
    { id: 'notes', label: 'Notes', icon: <MessageSquare size={15} />, count: notes.length, render: () => <NotesTab entity={entity} /> },
  ];
  const active = allTabs.find((t) => t.id === params.get('tab')) ?? allTabs[0];
  const select = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === allTabs[0].id) next.delete('tab'); else next.set('tab', id);
    setParams(next, { replace: true });
  };

  // Drag files anywhere over the page: show an overlay, upload on drop, then jump to the Documents tab.
  const dragProps = canUpload ? {
    onDragEnter: (e: React.DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current += 1; setDropping(true); },
    onDragOver: (e: React.DragEvent) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } },
    onDragLeave: (e: React.DragEvent) => { if (!hasFiles(e)) return; depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setDropping(false); },
    onDrop: (e: React.DragEvent) => {
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault(); depth.current = 0; setDropping(false);
      if (e.dataTransfer.files.length) {
        queue.upload(e.dataTransfer.files, { category: 'Auto' });
        if (active.id !== 'documents') select('documents');
      }
    },
  } : {};

  return (
    <div className={`item-page ${dropping ? 'page-drag' : ''}`} {...dragProps}>
      {dropping && active.id !== 'documents' && createPortal(
        <div className="drop-overlay" aria-live="polite">
          <div className="drop-overlay-inner">
            <CloudUpload size={46} />
            <strong>Drop to attach to {entityTitle(data, entity.type, entity.id)}</strong>
            <span>Files are sorted into a category automatically – you can filter them on the Documents tab.</span>
          </div>
        </div>,
        document.body,
      )}
      <Link to={back.to} className="link small back"><ArrowLeft size={14} /> {back.label}</Link>
      <header className={`hero accent-${accent}`}>
        <div className="hero-glow" aria-hidden />
        <div className="hero-main">
          <span className="hero-icon">{icon}</span>
          <div className="hero-text">
            <div className="hero-eyebrow">{eyebrow}</div>
            <h1>{title}</h1>
            {subtitle && <div className="hero-sub">{subtitle}</div>}
            {badges && <div className="row gap-sm wrap hero-badges">{badges}</div>}
          </div>
          {actions && <div className="hero-actions">{actions}</div>}
        </div>
        {stats && stats.length > 0 && (
          <div className="hero-stats">
            {stats.map((s) => (
              <div key={s.label} className={`hero-stat ${s.tone ? `tone-edge-${s.tone}` : ''}`}>
                <span className="hero-stat-label">{s.label}</span>
                <span className="hero-stat-value">{s.value}</span>
                {s.hint && <span className="hero-stat-hint">{s.hint}</span>}
              </div>
            ))}
          </div>
        )}
      </header>
      {banner}
      <nav className="tabbar" role="tablist">
        {allTabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === active.id} className={t.id === active.id ? 'on' : ''} onClick={() => select(t.id)}>
            {t.icon}{t.label}{t.count ? <span className="tab-count">{t.count}</span> : null}
          </button>
        ))}
      </nav>
      <div className="tab-panel" key={active.id}>{active.render()}</div>
    </div>
  );
}

/** A card with a form inside and Save/Cancel – used instead of pop-up dialogs. */
export function EditCard({ title, onCancel, onSubmit, children, submitLabel = 'Save changes', disabled }: {
  title: string; onCancel?: () => void; onSubmit: () => void; children: ReactNode; submitLabel?: string; disabled?: boolean;
}) {
  return (
    <form className="card edit-card" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <header className="card-head"><h2><PenLine size={16} /> {title}</h2></header>
      <div className="form-grid">{children}</div>
      <footer className="edit-foot">
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
        <button className="btn btn-primary" disabled={disabled}><Check size={16} /> {submitLabel}</button>
      </footer>
    </form>
  );
}

// ---------- Documents ----------

const DOC_CATEGORIES = ['Registration', 'Insurance', 'Service record', 'Invoice', 'Certificate', 'Licence', 'Photo', 'Manual', 'Report', 'Contract', 'Other'];

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return <FileImage size={22} />;
  if (/zip|compressed/.test(mime)) return <FileArchive size={22} />;
  if (/sheet|excel|csv/.test(mime)) return <FileSpreadsheet size={22} />;
  return <FileText size={22} />;
}

export const fmtSize = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

export function DocumentsTab({ docs, queue }: { entity: { type: EntityType; id: string }; docs: Attachment[]; queue: ReturnType<typeof useUploadQueue> }) {
  const { removeAttachment, attachmentUrl } = useStore();
  const perm = usePermissions();
  const input = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState('Auto');
  const [expiry, setExpiry] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [filter, setFilter] = useState('all');
  const canUpload = perm.canWrite('attachments');
  const busy = queue.jobs.some((j) => j.status === 'uploading');

  const upload = (files: FileList | File[]) => {
    setError('');
    queue.upload(files, { category, expiry, notes });
    setNotes(''); setExpiry('');
  };

  // Paste screenshots or copied files straight into the Documents tab.
  useEffect(() => {
    if (!canUpload) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA/.test(target.tagName)) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) { e.preventDefault(); upload(files.map((f, i) => (f.name === 'image.png' ? new File([f], `Pasted image ${new Date().toLocaleString().replace(/[/:]/g, '-')}${i ? `-${i}` : ''}.png`, { type: f.type }) : f))); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const open = async (a: Attachment, download = false) => {
    try {
      const url = await attachmentUrl(a);
      if (!url) { setError('This is a sample record – there is no file to open.'); return; }
      const link = document.createElement('a');
      link.href = url;
      if (download) link.download = a.name; else link.target = '_blank';
      link.rel = 'noopener';
      link.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open file');
    }
  };

  const shown = docs.filter((d) => filter === 'all' || d.category === filter);
  const cats = [...new Set(docs.map((d) => d.category))];

  return (
    <div className="grid-side">
      <div className="stack">
        {cats.length > 1 && (
          <div className="chips">
            <button className={`chip chip-btn ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All ({docs.length})</button>
            {cats.map((c) => <button key={c} className={`chip chip-btn ${filter === c ? 'on' : ''}`} onClick={() => setFilter(c)}>{c} ({docs.filter((d) => d.category === c).length})</button>)}
          </div>
        )}
        {error && <div className="banner tone-bad">{error}</div>}
        {queue.jobs.length > 0 && (
          <div className="card upload-queue">
            <div className="row between"><strong className="small">Uploads</strong>{!busy && <button className="link-btn small" onClick={queue.clearDone}>Clear</button>}</div>
            <ul>
              {queue.jobs.map((j) => (
                <li key={j.id} className={`uq-${j.status}`}>
                  {j.status === 'uploading' ? <Loader2 size={16} className="spin" /> : j.status === 'done' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  <div className="grow"><span className="uq-name">{j.name}</span><span className="small muted"> · {fmtSize(j.size)} · {j.category}</span>
                    {j.message && <div className="small tone-text-bad">{j.message}</div>}</div>
                  {j.status === 'uploading' && <div className="uq-bar"><i /></div>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {shown.length === 0 ? (
          <div className="card"><Empty icon={<Paperclip size={32} />} title="No documents yet">Drag files anywhere onto this page, paste a screenshot (Ctrl+V), or use the upload box.</Empty></div>
        ) : (
          <div className="doc-grid">
            {shown.map((a) => {
              const days = a.expiry ? daysUntil(a.expiry) : null;
              return (
                <article key={a.id} className="doc-card">
                  <div className={`doc-thumb ${a.mime.startsWith('image/') && a.dataUrl ? 'has-img' : ''}`}>
                    {a.mime.startsWith('image/') && a.dataUrl ? <img src={a.dataUrl} alt="" /> : fileIcon(a.mime)}
                  </div>
                  <div className="doc-body">
                    <strong title={a.name}>{a.name}</strong>
                    <span className="small muted">{a.category} · {fmtSize(a.size)} · {a.uploadedBy}, {fmtDate(a.uploadedAt.slice(0, 10))}</span>
                    {a.expiry && (
                      <span className={`small tone-text-${days! < 0 ? 'bad' : days! <= 30 ? 'warn' : 'good'}`}>
                        <Clock size={12} /> {days! < 0 ? 'Expired' : 'Expires'} {fmtDate(a.expiry)} ({relDays(a.expiry)})
                      </span>
                    )}
                    {a.notes && <span className="small muted">{a.notes}</span>}
                  </div>
                  <div className="doc-actions">
                    <button className="icon-btn" title="View" onClick={() => open(a)} disabled={a.storage === 'none'}><Eye size={16} /></button>
                    <button className="icon-btn" title="Download" onClick={() => open(a, true)} disabled={a.storage === 'none'}><Download size={16} /></button>
                    {perm.canDelete && <button className="icon-btn" title="Delete" onClick={() => confirmAction(`Delete ${a.name}?`) && removeAttachment(a).catch((e) => setError(e.message))}><Trash2 size={16} /></button>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      {canUpload && (
        <aside className="card upload-card">
          <h2><Upload size={16} /> Add documents</h2>
          <div className={`dropzone ${drag ? 'drag' : ''} ${busy ? 'busy' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
            onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()} role="button" tabIndex={0}>
            <span className="dz-icon"><CloudUpload size={30} /></span>
            <strong>{busy ? 'Uploading…' : drag ? 'Release to upload' : 'Drag & drop files here'}</strong>
            <span className="small muted">or <u>click to browse</u> · paste with Ctrl+V</span>
            <span className="small muted">PDF, images, spreadsheets – several at once</span>
          </div>
          <input ref={input} type="file" multiple hidden onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
          <label className="field"><span>Category</span>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="Auto">Auto-detect from file name</option>
              {DOC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field"><span>Expiry date (optional)</span><input className="input" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></label>
          <label className="field"><span>Notes (optional)</span><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <p className="small muted">Documents with an expiry date appear in the compliance register and alerts.</p>
        </aside>
      )}
    </div>
  );
}

// ---------- Reminders ----------

export function RemindersTab({ entity, reminders }: { entity: { type: EntityType; id: string }; reminders: Reminder[] }) {
  const { saveReminder, completeReminder, actor, upsert } = useStore();
  const perm = usePermissions();
  const canEdit = perm.canWrite('reminders');
  const blank = (): Reminder => ({ id: uid(), entityType: entity.type, entityId: entity.id, title: '', dueDate: addDays(todayISO(), 7), repeat: 'none', priority: 'medium', assignee: actor, done: false });
  const [r, setR] = useState<Reminder>(blank);
  const open = reminders.filter((x) => !x.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const done = reminders.filter((x) => x.done).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));

  return (
    <div className="grid-side">
      <div className="stack">
        {open.length === 0 && done.length === 0 && <div className="card"><Empty icon={<BellRing size={32} />} title="No reminders">Set a reminder so nothing about this item slips through the cracks.</Empty></div>}
        {open.length > 0 && (
          <div className="card">
            <h2 className="card-title">Upcoming</h2>
            <ul className="reminder-list">
              {open.map((x) => {
                const days = daysUntil(x.dueDate);
                return (
                  <li key={x.id} className={days < 0 ? 'overdue' : days <= 3 ? 'soon' : ''}>
                    <button className="tick" disabled={!canEdit} onClick={() => completeReminder(x.id)} aria-label={`Complete ${x.title}`}><Check size={14} /></button>
                    <div className="grow">
                      <strong>{x.title}</strong>
                      <div className="small muted">
                        {days < 0 ? <span className="tone-text-bad">Overdue {relDays(x.dueDate).replace(' ago', '')}</span> : <>Due {relDays(x.dueDate)}</>} · {fmtDate(x.dueDate)}
                        {x.assignee && <> · {x.assignee}</>}
                        {x.repeat !== 'none' && <> · <Repeat size={11} /> {x.repeat}</>}
                      </div>
                    </div>
                    <Badge value={x.priority} />
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {done.length > 0 && (
          <div className="card">
            <h2 className="card-title">Completed</h2>
            <ul className="reminder-list done">
              {done.slice(0, 10).map((x) => (
                <li key={x.id}><span className="tick on"><Check size={14} /></span><div className="grow"><s>{x.title}</s><div className="small muted">Done {fmtDate(x.doneAt)}</div></div>
                  {perm.canDelete && <button className="icon-btn" onClick={() => upsert('reminders', { ...x, done: false, doneAt: undefined })} title="Re-open"><Repeat size={14} /></button>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {canEdit && (
        <form className="card upload-card" onSubmit={(e) => { e.preventDefault(); if (!r.title.trim()) return; saveReminder({ ...r, title: r.title.trim() }); setR(blank()); }}>
          <h2><Plus size={16} /> New reminder</h2>
          <label className="field"><span>What needs to happen?</span><input className="input" required value={r.title} placeholder="e.g. Renew registration" onChange={(e) => setR({ ...r, title: e.target.value })} /></label>
          <div className="quick-dates">
            {[['Tomorrow', 1], ['1 week', 7], ['1 month', 30], ['3 months', 91]].map(([l, n]) => (
              <button type="button" key={l} className={`chip chip-btn ${r.dueDate === addDays(todayISO(), n as number) ? 'on' : ''}`} onClick={() => setR({ ...r, dueDate: addDays(todayISO(), n as number) })}>{l}</button>
            ))}
          </div>
          <label className="field"><span>Due date</span><input className="input" type="date" required value={r.dueDate} onChange={(e) => setR({ ...r, dueDate: e.target.value })} /></label>
          <div className="form-grid">
            <label className="field"><span>Repeat</span>
              <select className="input" value={r.repeat} onChange={(e) => setR({ ...r, repeat: e.target.value as Reminder['repeat'] })}>
                {['none', 'weekly', 'monthly', 'quarterly', 'yearly'].map((x) => <option key={x} value={x}>{x === 'none' ? 'Does not repeat' : x[0].toUpperCase() + x.slice(1)}</option>)}
              </select>
            </label>
            <label className="field"><span>Priority</span>
              <select className="input" value={r.priority} onChange={(e) => setR({ ...r, priority: e.target.value as Priority })}>
                {['low', 'medium', 'high', 'critical'].map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}
              </select>
            </label>
          </div>
          <label className="field"><span>Assigned to</span><input className="input" value={r.assignee} onChange={(e) => setR({ ...r, assignee: e.target.value })} /></label>
          <button className="btn btn-primary btn-block"><BellRing size={16} /> Set reminder</button>
          <p className="small muted">Reminders show on the dashboard, calendar and alerts bell. Repeating reminders roll forward when completed.</p>
        </form>
      )}
    </div>
  );
}

// ---------- History ----------

const KIND_ICON: Record<ActivityEvent['kind'], ReactNode> = {
  created: <Sparkles size={14} />, updated: <PenLine size={14} />, status: <Repeat size={14} />, deleted: <Trash2 size={14} />,
  document: <Paperclip size={14} />, reminder: <Bell size={14} />, note: <MessageSquare size={14} />, system: <Wrench size={14} />,
};

export function HistoryTab({ events }: { events: ActivityEvent[] }) {
  const [kind, setKind] = useState<'all' | ActivityEvent['kind']>('all');
  const sorted = useMemo(() => [...events].sort((a, b) => b.at.localeCompare(a.at)).filter((e) => kind === 'all' || e.kind === kind), [events, kind]);
  const groups = useMemo(() => {
    const m = new Map<string, ActivityEvent[]>();
    sorted.forEach((e) => { const d = e.at.slice(0, 10); m.set(d, [...(m.get(d) ?? []), e]); });
    return [...m.entries()];
  }, [sorted]);
  const kinds = [...new Set(events.map((e) => e.kind))];

  return (
    <div className="card">
      <div className="toolbar">
        <div className="chips">
          <button className={`chip chip-btn ${kind === 'all' ? 'on' : ''}`} onClick={() => setKind('all')}>Everything</button>
          {kinds.map((k) => <button key={k} className={`chip chip-btn ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}
        </div>
      </div>
      {groups.length === 0 ? <Empty icon={<History size={32} />} title="No history yet">Every change to this item is recorded here automatically.</Empty> : (
        <div className="timeline">
          {groups.map(([day, list]) => (
            <section key={day}>
              <div className="timeline-day">{fmtDate(day)} <span className="muted">· {relDays(day)}</span></div>
              <ul>
                {list.map((e) => (
                  <li key={e.id} className={`tl-${e.kind}`}>
                    <span className="tl-dot">{KIND_ICON[e.kind]}</span>
                    <div>
                      <div>{e.text}</div>
                      <div className="small muted">{e.by} · {e.at.length > 10 ? new Date(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Notes ----------

export function NotesTab({ entity }: { entity: { type: EntityType; id: string } }) {
  const { data, addNote, upsert, remove } = useStore();
  const perm = usePermissions();
  const [text, setText] = useState('');
  const notes = data.notes.filter((n) => n.entityType === entity.type && n.entityId === entity.id)
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.at.localeCompare(a.at));
  const initials = (s: string) => s.split(/[\s(]/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="notes">
      {perm.canWrite('notes') && (
        <form className="card note-compose" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { addNote(entity.type, entity.id, text.trim()); setText(''); } }}>
          <textarea className="input" rows={3} placeholder="Write a note for the team… (Ctrl+Enter to post)" value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) { addNote(entity.type, entity.id, text.trim()); setText(''); } }} />
          <div className="row between"><span className="small muted">Notes are visible to everyone with access.</span><button className="btn btn-primary" disabled={!text.trim()}><MessageSquare size={16} /> Post note</button></div>
        </form>
      )}
      {notes.length === 0 ? <div className="card"><Empty icon={<MessageSquare size={32} />} title="No notes yet">Share context, decisions and updates about this item.</Empty></div> : (
        <ul className="note-list">
          {notes.map((n) => (
            <li key={n.id} className={`card note ${n.pinned ? 'pinned' : ''}`}>
              <span className="avatar sm">{initials(n.by)}</span>
              <div className="grow">
                <div className="row between">
                  <span><strong>{n.by}</strong> <span className="small muted">{new Date(n.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span></span>
                  <span className="row gap-xs">
                    {n.pinned && <span className="badge tone-warn"><Pin size={11} /> Pinned</span>}
                    {perm.canWrite('notes') && <button className="icon-btn" title={n.pinned ? 'Unpin' : 'Pin'} onClick={() => upsert('notes', { ...n, pinned: !n.pinned })}>{n.pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>}
                    {perm.canDelete && <button className="icon-btn" title="Delete" onClick={() => confirmAction('Delete this note?') && remove('notes', n.id)}><Trash2 size={14} /></button>}
                  </span>
                </div>
                <p className="note-text">{n.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function WarningBanner({ tone = 'warn', children }: { tone?: 'warn' | 'bad' | 'info' | 'good'; children: ReactNode }) {
  return <div className={`banner tone-${tone} banner-icon`}><AlertTriangle size={16} /> <span>{children}</span></div>;
}
