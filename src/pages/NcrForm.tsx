import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ChevronDown, CloudUpload, Download, ExternalLink, FileText, FolderOpen, Gauge, Info, Loader2, Lock, MoreHorizontal, Plus,
  Printer, Star, Trash2, X, CheckCircle2, XCircle, Paperclip, History as HistoryIcon, Check,
} from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import type { AppData, Attachment, Ncr } from '../types';
import { AlertsBell } from '../components/Layout';
import { fmtSize, hasFiles, useUploadQueue } from '../components/ItemPage';
import { Combobox, ConfirmModal, DateField, type ComboOption } from '../components/forms';
import {
  blankNcr, employeeLabel, fmtDMY, fmtDMYTime, NCR_DOC_TAG, NCR_STAGES, stagesDone, vehicleDot, vehicleLabel,
} from '../lib/ncr';
import { stableStringify } from '../lib/cloudSync';
import { byId, uid } from '../lib/utils';

type From = { from?: string; flash?: string } | null;

// ---------- Option builders ----------

const lookup = (list: string[], current: string): ComboOption[] =>
  [...list, ...(current && !list.includes(current) ? [current] : [])].map((x) => ({ value: x, label: x }));

/** Everyone who can be named in a "by" field: staff on the register plus names already used. */
function peopleOptions(data: AppData, actor: string): ComboOption[] {
  const out = new Map<string, ComboOption>();
  for (const d of data.drivers) out.set(d.name, { value: d.name, label: d.name, hint: [d.position, d.state].filter(Boolean).join(' · ') || undefined });
  for (const n of data.ncrs) for (const v of [n.reportedBy, n.shortTermBy, n.causeBy, n.longTermBy, n.closedBy]) if (v && !out.has(v)) out.set(v, { value: v, label: v });
  if (actor && !out.has(actor)) out.set(actor, { value: actor, label: actor, hint: 'you' });
  return [...out.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function eventOptions(data: AppData): ComboOption[] {
  return [
    ...data.defects.map((d) => ({ value: `defect:${d.id}`, label: `Defect · ${d.item}`, hint: `${fmtDMY(d.date)} · ${byId(data.vehicles, d.vehicleId)?.rego ?? ''}`, keywords: d.description })),
    ...data.audits.map((a) => ({ value: `audit:${a.id}`, label: `Audit · AUD-${a.number} ${a.title}`, hint: fmtDMY(a.date) })),
    ...data.workOrders.map((w) => ({ value: `workOrder:${w.id}`, label: `Work order · #${w.number} ${w.title}`, hint: fmtDMY(w.createdAt) })),
  ];
}

const eventValue = (n: Ncr) => (n.defectId ? `defect:${n.defectId}` : n.auditId ? `audit:${n.auditId}` : n.workOrderId ? `workOrder:${n.workOrderId}` : undefined);
const eventLink = (n: Ncr) => (n.defectId ? `/defects/${n.defectId}` : n.auditId ? `/audits/${n.auditId}` : n.workOrderId ? `/work-orders/${n.workOrderId}` : '');

// ---------- Prefill when raised from another record ----------

function prefill(data: AppData, params: URLSearchParams): Partial<Ncr> {
  const defect = byId(data.defects, params.get('defect') ?? undefined);
  const audit = byId(data.audits, params.get('audit') ?? undefined);
  const item = audit?.items.find((i) => i.id === params.get('item'));
  const wo = byId(data.workOrders, params.get('workOrder') ?? undefined);
  const out: Partial<Ncr> = {};
  if (defect) Object.assign(out, { defectId: defect.id, vehicleId: defect.vehicleId, employeeId: defect.driverId, ncrType: 'Defect', problem: `${defect.item}: ${defect.description}` });
  if (audit) Object.assign(out, { auditId: audit.id, vehicleId: audit.vehicleId, employeeId: audit.driverId, ncrType: 'Internal Review', problem: item ? `${audit.title} – “${item.question}” failed.${item.note ? `\n${item.note}` : ''}` : audit.title });
  if (wo) Object.assign(out, { workOrderId: wo.id, vehicleId: wo.vehicleId, ncrType: 'Maintenance', problem: `Job #${wo.number} ${wo.title}` });
  const vehicle = params.get('vehicle'); if (vehicle && !out.vehicleId) out.vehicleId = vehicle;
  const employee = params.get('employee'); if (employee) out.employeeId = employee;
  return out;
}

// ---------- Page ----------

export default function NcrForm() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const { data, upsert, remove, nextNumber, actor } = useStore();
  const perm = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const from = (location.state as From)?.from ?? '/ncr';
  const saved = isNew ? undefined : byId(data.ncrs, id);
  const canEdit = perm.canWrite('ncrs');

  const [baseline, setBaseline] = useState<Ncr | null>(() => saved ?? (isNew ? blankNcr(nextNumber('ncrs'), actor, prefill(data, params)) : null));
  const [draft, setDraft] = useState<Ncr | null>(baseline);
  const [tab, setTab] = useState<'details' | 'documents'>(params.get('tab') === 'documents' ? 'documents' : 'details');
  const [more, setMore] = useState(() => !!(saved?.fitForDutyId || saved?.defectId || saved?.auditId || saved?.workOrderId));
  const [history, setHistory] = useState(false);
  const [confirm, setConfirm] = useState<null | 'delete' | 'discard' | 'print'>(null);
  const [flash, setFlash] = useState(() => (location.state as From)?.flash ?? '');
  const pendingNav = useRef<string>(from);

  // Opening another NCR (or arriving after "Save and continue") loads that record.
  useEffect(() => {
    if (!isNew && saved && baseline?.id !== saved.id) { setBaseline(saved); setDraft(saved); }
  }, [isNew, saved, baseline?.id]);

  const dirty = !!draft && !!baseline && stableStringify(draft) !== stableStringify(baseline);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = useCallback(<K extends keyof Ncr>(k: K, v: Ncr[K]) => setDraft((p) => (p ? { ...p, [k]: v } : p)), []);

  const save = useCallback((then: 'continue' | 'close' | 'print') => {
    if (!draft || !canEdit) return;
    // Numbers are allocated at save time too, so two people raising NCRs together never collide.
    const taken = data.ncrs.some((n) => n.number === draft.number && n.id !== draft.id);
    const record: Ncr = { ...draft, id: draft.id || uid(), number: taken ? nextNumber('ncrs') : draft.number };
    upsert('ncrs', record);
    // Remember the link on the audit item this NCR was raised from.
    const auditId = params.get('audit'); const itemId = params.get('item');
    const audit = isNew ? byId(data.audits, auditId ?? undefined) : undefined;
    if (audit && itemId) upsert('audits', { ...audit, items: audit.items.map((i) => (i.id === itemId ? { ...i, ncrId: record.id } : i)) });
    setBaseline(record); setDraft(record);
    if (then === 'close') navigate(record.closed && from === '/ncr' ? '/ncr/closed' : from);
    else if (then === 'print') navigate(`/ncr/${record.id}/report`, { state: { from } });
    else {
      setFlash(isNew ? `NCR-${record.number} created` : 'Saved');
      if (isNew) navigate(`/ncr/${record.id}`, { replace: true, state: { from, flash: `NCR-${record.number} created` } });
    }
  }, [draft, canEdit, data.ncrs, data.audits, nextNumber, upsert, params, isNew, navigate, from]);

  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(''), 2200); return () => clearTimeout(t); }, [flash]);

  // Ctrl/Cmd+S saves and stays on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty) save('continue'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, save]);

  const leave = (to: string) => { if (dirty) { pendingNav.current = to; setConfirm('discard'); } else navigate(to); };

  if (!draft) {
    return (
      <div className="fs">
        <FsHeader title={<b>NCR not found</b>} onClose={() => navigate('/ncr')} />
        <main className="fs-body"><div className="card empty"><strong>This NCR doesn't exist or was deleted.</strong><Link className="link" to="/ncr">Back to non conformances</Link></div></main>
      </div>
    );
  }

  const n = draft;
  const ro = !canEdit;
  const docs = data.attachments.filter((a) => a.entityType === 'ncr' && a.entityId === n.id);
  const employee = byId(data.drivers, n.employeeId);
  const people = peopleOptions(data, actor);

  return (
    <div className="fs">
      <FsHeader
        title={isNew ? <b>New NCR</b> : <><b>Edit NCR:</b> {n.number}</>}
        status={!isNew && <span className={`badge ${n.closed ? 'tone-good' : 'tone-warn'}`}>{n.closed ? 'Closed' : 'Open'}</span>}
        onClose={() => leave(from)}
        extra={!isNew && <button className="btn btn-light btn-sm" onClick={() => (dirty && canEdit ? setConfirm('print') : navigate(`/ncr/${n.id}/report`, { state: { from } }))}><Printer size={15} /> Print</button>}
      />
      <DropZone enabled={!isNew && perm.canWrite('attachments')} entityId={n.id} onDropped={() => setTab('documents')}>
        {(queue) => (
          <main className="fs-body">
            {ro && <div className="banner tone-info"><Lock size={15} /> You can view this NCR but your role can't change it.</div>}
            {saved === undefined && !isNew && <div className="banner tone-bad">This NCR was deleted by someone else. Save to restore it, or close.</div>}

            {/* Section A – header fields */}
            <section className="ncr-head">
              <div className="grid-3">
                <label className="field"><span>Scheme</span>
                  <Combobox ariaLabel="Scheme" value={n.schemeType || undefined} disabled={ro} options={lookup(data.settings.ncrSchemes, n.schemeType)} onChange={(v) => set('schemeType', v ?? '')} placeholder="Select scheme…" /></label>
                <label className="field"><span>Category</span>
                  <Combobox ariaLabel="Category" value={n.category || undefined} disabled={ro} options={lookup(data.settings.ncrCategories, n.category)} onChange={(v) => set('category', v ?? '')} placeholder="Select category…" /></label>
                <label className="field"><span>Type</span>
                  <Combobox ariaLabel="Type" value={n.ncrType || undefined} disabled={ro} options={lookup(data.settings.ncrTypes, n.ncrType)} onChange={(v) => set('ncrType', v ?? '')} placeholder="Select type…" /></label>
              </div>
              <div className="grid-4">
                <div className="field">
                  <span className="row between">Employee {!isNew && employee && <Link to={`/drivers/${employee.id}`} className="icon-link" title={`Open ${employee.name}'s record`} aria-label="Open employee record"><MoreHorizontal size={16} /></Link>}</span>
                  <Combobox ariaLabel="Employee" value={n.employeeId} disabled={ro} placeholder="Select employee…"
                    options={data.drivers.map((d) => ({ value: d.id, label: employeeLabel(d), keywords: d.name }))} onChange={(v) => set('employeeId', v)} />
                </div>
                <label className="field"><span>Contractor</span>
                  <ContractorPicker value={n.contractorId} disabled={ro} onChange={(v) => set('contractorId', v)} /></label>
                <label className="field"><span>Page Number</span>
                  <input className="input" value={n.pageNumber} disabled={ro} onChange={(e) => set('pageNumber', e.target.value)} placeholder="e.g. work diary page" /></label>
                <label className="field"><span>Vehicles/Asset</span>
                  <Combobox ariaLabel="Vehicles/Asset" value={n.vehicleId} disabled={ro} placeholder="Search fleet # or rego…"
                    options={data.vehicles.map((v) => ({ value: v.id, label: vehicleLabel(v), dot: vehicleDot(v), keywords: `${v.make} ${v.model} ${v.type}` }))} onChange={(v) => set('vehicleId', v)} /></label>
              </div>
              {!isNew && (
                <>
                  <button type="button" className="link-btn more-toggle" aria-expanded={more} onClick={() => setMore(!more)}>More Information <ChevronDown size={15} className={more ? 'flip' : ''} /></button>
                  {more && (
                    <div className="grid-2 more-info">
                      <div className="field">
                        <span className="row between">Fit For Duty {n.fitForDutyId && <Link className="icon-link" to={`/checks/${n.fitForDutyId}`} title="Open check"><ExternalLink size={13} /></Link>}</span>
                        <Combobox ariaLabel="Fit For Duty" value={n.fitForDutyId} disabled={ro} placeholder="Search pre-start / fit-for-duty checks…"
                          options={[...data.checks].sort((a, b) => b.date.localeCompare(a.date)).map((c) => ({
                            value: c.id, label: `${fmtDMY(c.date)} · ${byId(data.vehicles, c.vehicleId)?.rego ?? '—'} · ${byId(data.drivers, c.driverId)?.name ?? '—'}`,
                            dot: c.passed ? 'green' : 'red', hint: c.passed ? 'fit' : 'issues',
                          }))} onChange={(v) => set('fitForDutyId', v)} />
                      </div>
                      <div className="field">
                        <span className="row between">Event {eventLink(n) && <Link className="icon-link" to={eventLink(n)} title="Open event"><ExternalLink size={13} /></Link>}</span>
                        <Combobox ariaLabel="Event" value={eventValue(n)} disabled={ro} placeholder="Search defects, audits and work orders…" options={eventOptions(data)}
                          onChange={(v) => {
                            const [kind, ref] = (v ?? ':').split(':');
                            setDraft((p) => (p ? { ...p, defectId: kind === 'defect' ? ref : undefined, auditId: kind === 'audit' ? ref : undefined, workOrderId: kind === 'workOrder' ? ref : undefined } : p));
                          }} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* Section B – tabbed card */}
            <section className="ncr-card">
              <nav className="ncr-tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}><Info size={18} /><span>Details</span></button>
                {!isNew && (
                  <button role="tab" aria-selected={tab === 'documents'} className={tab === 'documents' ? 'on' : ''} onClick={() => setTab('documents')}>
                    <span className="tab-icon"><FileText size={18} />{docs.length > 0 && <span className="tab-badge">{docs.length}</span>}</span><span>Documents</span>
                  </button>
                )}
              </nav>
              {tab === 'details' ? (
                <div className="ncr-details">
                  <div className="ncr-stages-grid">
                    {NCR_STAGES.map((s) => (
                      <div key={s.key} className={`ncr-stage-box ${n[s.key].trim() ? 'filled' : ''}`}>
                        <h3>{s.title} {n[s.key].trim() && <Check size={15} className="stage-tick" aria-label="Written up" />}</h3>
                        <label className="field"><span>Details</span>
                          <textarea className="input" rows={6} value={n[s.key]} disabled={ro} placeholder={s.placeholder} onChange={(e) => set(s.key, e.target.value)} /></label>
                        <div className="grid-2">
                          <label className="field"><span>{s.dateLabel}</span><DateField ariaLabel={s.dateLabel} value={n[s.date]} disabled={ro} onChange={(v) => set(s.date, v)} /></label>
                          <label className="field"><span>{s.byLabel}</span>
                            <Combobox ariaLabel={s.byLabel} value={n[s.by] || undefined} disabled={ro} allowCustom options={people} placeholder="Select or type a name…" onChange={(v) => set(s.by, v ?? '')} /></label>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="ncr-closing">
                    <label className="field"><span>Closed date</span><DateField ariaLabel="Closed date" value={n.closedDate} disabled={ro} onChange={(v) => set('closedDate', v)} /></label>
                    <label className="field"><span>Closed by</span>
                      <Combobox ariaLabel="Closed by" value={n.closedBy || undefined} disabled={ro} allowCustom options={people} placeholder="Select or type a name…" onChange={(v) => set('closedBy', v ?? '')} /></label>
                    <label className="field"><span>Closed position</span>
                      <input className="input" value={n.closedPosition} disabled={ro} placeholder="Job title" onChange={(e) => set('closedPosition', e.target.value)} /></label>
                    <label className="ncr-completed">
                      <input type="checkbox" checked={n.closed} disabled={ro} onChange={(e) => set('closed', e.target.checked)} />
                      <span><b>Completed</b><small>Moves the NCR to the closed list</small></span>
                    </label>
                  </div>
                  <p className="small muted stage-progress">{stagesDone(n)} of 4 stages written up{n.closed ? ' · closed' : ''}</p>
                </div>
              ) : (
                <NcrDocuments ncrId={n.id} docs={docs} queue={queue} />
              )}
            </section>

            {!isNew && (
              <div className="center history-toggle">
                <button className="btn" onClick={() => setHistory(!history)}><HistoryIcon size={16} /> {history ? 'Hide History' : 'Show History'}</button>
              </div>
            )}
            {!isNew && history && <HistoryPanel ncrId={n.id} />}
          </main>
        )}
      </DropZone>

      <footer className="fs-foot">
        <div>{!isNew && perm.canDelete && <button className="btn btn-danger-outline" onClick={() => setConfirm('delete')} aria-label="Delete"><Trash2 size={15} /> <span className="hide-xs">Delete</span></button>}</div>
        <div className="row gap-sm">
          {flash && <span className="fs-flash"><CheckCircle2 size={15} /> {flash}</span>}
          {dirty && !flash && <span className="fs-dirty"><span className="hide-xs">Unsaved changes</span><span className="show-xs" title="Unsaved changes">●</span></span>}
          <button className="link-btn fs-cancel" onClick={() => leave(from)}>{canEdit ? 'Cancel' : 'Close'}</button>
          {canEdit && <>
            <button className="btn btn-save" onClick={() => save('continue')}>Save<span className="hide-xs"> and continue</span></button>
            <button className="btn btn-save" onClick={() => save('close')}>Save <span className="hide-xs">and</span><span className="show-xs">&amp;</span> close</button>
          </>}
        </div>
      </footer>

      {confirm === 'delete' && (
        <ConfirmModal title={`Delete NCR-${n.number}?`} confirmLabel="Confirm" onCancel={() => setConfirm(null)}
          onConfirm={() => { remove('ncrs', n.id); setConfirm(null); setBaseline(null); navigate(from === `/ncr/${n.id}` ? '/ncr' : from, { replace: true }); }}>
          <p>This permanently removes the NCR. Its documents stay in storage but will no longer be linked to it.</p>
        </ConfirmModal>
      )}
      {confirm === 'discard' && (
        <ConfirmModal title="Discard unsaved changes?" confirmLabel="Discard" onCancel={() => setConfirm(null)}
          onConfirm={() => { setConfirm(null); setDraft(baseline); navigate(pendingNav.current); }}>
          <p>You have changes on this NCR that haven't been saved.</p>
        </ConfirmModal>
      )}
      {confirm === 'print' && (
        <ConfirmModal title="Save before printing?" confirmLabel="Save and print" tone="primary" onCancel={() => setConfirm(null)}
          onConfirm={() => { setConfirm(null); save('print'); }}>
          <p>The report is printed from the saved NCR, so your latest changes need saving first.</p>
        </ConfirmModal>
      )}
    </div>
  );
}

// ---------- Full-screen header ----------

export function FsHeader({ title, status, extra, onClose }: { title: React.ReactNode; status?: React.ReactNode; extra?: React.ReactNode; onClose: () => void }) {
  return (
    <header className="fs-head">
      <div className="row gap-sm">
        <span className="brand-mark sm"><Gauge size={16} /></span>
        <h1>{title}</h1>
        {status}
      </div>
      <div className="row gap-sm">
        {extra}
        <AlertsBell />
        <button className="icon-btn fs-close" onClick={onClose} aria-label="Close" title="Close"><X size={20} /></button>
      </div>
    </header>
  );
}

// ---------- Contractor picker with inline add ----------

function ContractorPicker({ value, disabled, onChange }: { value?: string; disabled?: boolean; onChange: (v: string | undefined) => void }) {
  const { data, upsert } = useStore();
  const perm = usePermissions();
  const options = data.contractors.filter((c) => c.active || c.id === value).map((c) => ({ value: c.id, label: c.name, hint: c.contact }));
  return (
    <Combobox ariaLabel="Contractor" value={value} disabled={disabled} options={options} placeholder="Select contractor…" onChange={onChange}
      footer={(close, query) => (perm.canWrite('contractors') ? (
        <div className="row between gap-sm">
          {query.trim() && !data.contractors.some((c) => c.name.toLowerCase() === query.trim().toLowerCase())
            ? <button type="button" className="link-btn small" onClick={() => { const c = { id: uid(), name: query.trim(), active: true }; upsert('contractors', c); onChange(c.id); close(); }}><Plus size={13} /> Add “{query.trim()}” as a contractor</button>
            : <span className="small muted">Type a name to add a new contractor</span>}
          <Link to="/contractors" className="link small" target="_blank" rel="noreferrer">Manage</Link>
        </div>
      ) : null)} />
  );
}

// ---------- Page-wide drag and drop for documents ----------

function DropZone({ enabled, entityId, onDropped, children }: {
  enabled: boolean; entityId: string; onDropped: () => void; children: (queue: ReturnType<typeof useUploadQueue>) => React.ReactNode;
}) {
  const queue = useUploadQueue({ type: 'ncr', id: entityId });
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const props = enabled ? {
    onDragEnter: (e: React.DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current += 1; setOver(true); },
    onDragOver: (e: React.DragEvent) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } },
    onDragLeave: (e: React.DragEvent) => { if (!hasFiles(e)) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); },
    onDrop: (e: React.DragEvent) => {
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault(); depth.current = 0; setOver(false);
      if (e.dataTransfer.files.length) { queue.upload(e.dataTransfer.files, { category: NCR_DOC_TAG }); onDropped(); }
    },
  } : {};
  return (
    <div className="fs-scroll" {...props}>
      {over && createPortal(
        <div className="drop-overlay" aria-live="polite"><div className="drop-overlay-inner"><CloudUpload size={46} /><strong>Drop to attach to this NCR</strong><span>Files are tagged “{NCR_DOC_TAG}”.</span></div></div>,
        document.body,
      )}
      {children(queue)}
    </div>
  );
}

// ---------- Documents tab ----------

const ext = (a: Attachment) => (a.name.includes('.') ? a.name.split('.').pop()!.toLowerCase() : a.mime.split('/').pop() ?? '');

function NcrDocuments({ ncrId, docs, queue }: { ncrId: string; docs: Attachment[]; queue: ReturnType<typeof useUploadQueue> }) {
  const { upsert, removeAttachment, attachmentUrl } = useStore();
  const perm = usePermissions();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: 'name' | 'uploaded' | 'size'; dir: 1 | -1 }>({ key: 'uploaded', dir: -1 });
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Attachment | null>(null);
  const canUpload = perm.canWrite('attachments');
  void ncrId;

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const hit = docs.filter((a) => !s || [a.name, a.notes ?? '', a.category, a.uploadedBy, ext(a)].some((x) => x.toLowerCase().includes(s)));
    const val = (a: Attachment) => (sort.key === 'name' ? a.name.toLowerCase() : sort.key === 'size' ? a.size : a.uploadedAt);
    return [...hit].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
  }, [docs, q, sort]);

  const open = async (a: Attachment, download = false) => {
    setError('');
    try {
      const url = await attachmentUrl(a);
      if (!url) { setError('This is a sample record – there is no file to open.'); return; }
      const link = document.createElement('a'); link.href = url; link.rel = 'noopener';
      if (download) link.download = a.name; else link.target = '_blank';
      link.click();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not open the file'); }
  };
  const th = (key: 'name' | 'uploaded' | 'size', label: string) => (
    <th><button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>{label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button></th>
  );

  return (
    <div className="ncr-docs">
      {canUpload && (
        <div className={`ncr-drop ${drag ? 'over' : ''}`}
          onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); setDrag(true); } }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { if (!hasFiles(e)) return; e.preventDefault(); setDrag(false); queue.upload(e.dataTransfer.files, { category: NCR_DOC_TAG }); }}>
          <button type="button" className="btn" onClick={() => input.current?.click()}><Paperclip size={15} /> Choose Files</button>
          <input ref={input} type="file" multiple hidden name="upload" onChange={(e) => { if (e.target.files?.length) queue.upload(e.target.files, { category: NCR_DOC_TAG }); e.target.value = ''; }} />
          <span className="muted"><CloudUpload size={16} /> Drag and drop files here to upload</span>
        </div>
      )}
      {queue.jobs.length > 0 && (
        <div className="row between small"><strong>Uploads</strong>{!queue.jobs.some((j) => j.status === 'uploading') && <button className="link-btn small" onClick={queue.clearDone}>Clear</button>}</div>
      )}
      {queue.jobs.length > 0 && (
        <ul className="upload-queue compact">
          {queue.jobs.map((j) => (
            <li key={j.id} className={`uq-${j.status}`}>
              {j.status === 'uploading' ? <Loader2 size={15} className="spin" /> : j.status === 'done' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
              <span className="grow">{j.name} <span className="small muted">· {fmtSize(j.size)}</span>{j.message && <span className="small tone-text-bad"> – {j.message}</span>}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="banner tone-bad">{error}</div>}
      <div className="row between wrap gap-sm">
        <strong>{docs.length} document{docs.length === 1 ? '' : 's'}</strong>
        <label className="dt-search"><span>Search:</span><input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      <div className="dt-scroll">
        <table className="dt-table">
          <thead><tr>{th('name', 'Name')}<th>Description</th><th>Tags</th>{th('uploaded', 'Uploaded')}<th>Uploaded by</th><th>Type</th>{th('size', 'File size')}<th aria-label="Actions" /></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td><button type="button" className="doc-link" onClick={() => open(a)}><FolderOpen size={15} /> {a.name}</button></td>
                <td className="wrap">
                  {editing === a.id ? (
                    <input className="input input-sm" autoFocus defaultValue={a.notes ?? ''}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v !== (a.notes ?? '')) upsert('attachments', { ...a, notes: v || undefined }); setEditing(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }} />
                  ) : (
                    <button type="button" className="desc-btn" disabled={!canUpload} onClick={() => setEditing(a.id)}>{a.notes || (canUpload ? <span className="muted">Add description</span> : '')}</button>
                  )}
                </td>
                <td><span className="tag-pill">{a.category}</span></td>
                <td className="nowrap">{fmtDMYTime(a.uploadedAt)}</td>
                <td>{a.uploadedBy}</td>
                <td>{ext(a)}</td>
                <td className="nowrap">{fmtSize(a.size)}</td>
                <td className="nowrap">
                  <button className="icon-btn" title="Download" onClick={() => open(a, true)}><Download size={15} /></button>
                  {perm.canDelete && <button className="icon-btn" title="Remove" onClick={() => setRemoving(a)}><Trash2 size={15} /></button>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="dt-empty">{q ? 'No matching documents' : 'No documents yet – upload or drag files onto this page.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {removing && (
        <ConfirmModal title="Remove document?" confirmLabel="Remove" onCancel={() => setRemoving(null)}
          onConfirm={async () => { const a = removing; setRemoving(null); try { await removeAttachment(a); } catch (err) { setError(err instanceof Error ? err.message : 'Could not remove'); } }}>
          <p>“{removing.name}” will be deleted from this NCR.</p>
        </ConfirmModal>
      )}
    </div>
  );
}

// ---------- History / notes ----------

function HistoryPanel({ ncrId }: { ncrId: string }) {
  const { data, addNote, upsert, remove, actor } = useStore();
  const perm = usePermissions();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const notes = data.notes.filter((x) => x.entityType === 'ncr' && x.entityId === ncrId);
  // "Note added" events duplicate the notes themselves, so leave them out of the timeline.
  const events = data.activity.filter((e) => e.entityType === 'ncr' && e.entityId === ncrId && e.kind !== 'note');
  const items = [
    ...notes.map((x) => ({ id: x.id, at: x.at, by: x.by, text: x.text, note: x })),
    ...events.map((e) => ({ id: e.id, at: e.at, by: e.by, text: e.text.replace(/^NCR created$/, 'Non conformance created'), note: undefined })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <section className="card history-panel">
      <header className="row between">
        <h2><HistoryIcon size={16} /> History &amp; notes</h2>
        {perm.canWrite('notes') && !adding && <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}><Plus size={14} /> Add Note</button>}
      </header>
      {adding && (
        <form className="note-form" onSubmit={(e) => { e.preventDefault(); if (text.trim()) addNote('ncr', ncrId, text.trim()); setText(''); setAdding(false); }}>
          <textarea className="input" rows={3} autoFocus value={text} placeholder="Write a note…" onChange={(e) => setText(e.target.value)} />
          <div className="row gap-sm end"><button type="button" className="btn btn-sm" onClick={() => { setAdding(false); setText(''); }}>Cancel</button><button className="btn btn-sm btn-primary" disabled={!text.trim()}>Save note</button></div>
        </form>
      )}
      <ol className="timeline">
        {items.map((i) => (
          <li key={i.id} className={i.note ? 'is-note' : 'is-system'}>
            <div className="tl-meta"><span>{fmtDMYTime(i.at)}</span> · <b>{i.by}</b></div>
            <div className="tl-text">{i.text}</div>
            <div className="tl-actions">
              {i.note ? (
                <>
                  <button className={`icon-btn star ${i.note.pinned ? 'on' : ''}`} disabled={!perm.canWrite('notes')} title="Click to star/unstar a note on the dashboard"
                    aria-label={i.note.pinned ? 'Unstar note' : 'Star note'} onClick={() => upsert('notes', { ...i.note!, pinned: !i.note!.pinned })}><Star size={15} /></button>
                  {(perm.canDelete || i.note.by === actor) && <button className="icon-btn" title="Delete note" aria-label="Delete note" onClick={() => remove('notes', i.note!.id)}><Trash2 size={14} /></button>}
                </>
              ) : <span className="icon-btn locked" title="Note has been locked and can't be changed" aria-label="Locked"><Lock size={14} /></span>}
            </div>
          </li>
        ))}
        {!items.length && <li className="muted">No history yet.</li>}
      </ol>
    </section>
  );
}
