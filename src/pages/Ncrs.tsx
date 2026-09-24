import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  BadgeCheck, CheckCircle2, ClipboardList, Download, FileWarning, Plus, Search, ShieldAlert, Target, Trash2, X, LayoutGrid, Lock,
} from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import type { CapaAction, Ncr, NcrCategory, NcrSource, RootCauseCategory, Severity } from '../types';
import { Badge, Card, Empty, Field, PageHeader, SearchInput, Select, StatCard, confirmAction } from '../components/ui';
import { EditCard, ItemPage } from '../components/ItemPage';
import { celebrate } from '../components/celebrate';
import {
  NCR_CATEGORIES, NCR_SOURCES, NCR_STAGES, ROOT_CAUSE_CATEGORIES, ncrBlockers, riskLevel, riskScore, stageIndex, describeDue,
} from '../lib/compliance';
import { addDays, byId, daysUntil, downloadCSV, fmtDate, relDays, todayISO, uid } from '../lib/utils';

const LIKELIHOOD = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'];
const IMPACT = ['Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic'];

export function RiskMatrix({ ncrs, onPick, selected }: { ncrs: Pick<Ncr, 'id' | 'likelihood' | 'impact'>[]; onPick?: (l: number, i: number) => void; selected?: [number, number] }) {
  return (
    <div className="risk-matrix">
      <div className="rm-ylabel">Likelihood →</div>
      <div className="rm-grid">
        {[5, 4, 3, 2, 1].map((l) => (
          <div key={l} className="rm-row">
            <span className="rm-axis" title={LIKELIHOOD[l - 1]}>{l}</span>
            {[1, 2, 3, 4, 5].map((i) => {
              const n = ncrs.filter((x) => x.likelihood === l && x.impact === i).length;
              const level = riskLevel(l * i);
              const isSel = selected && selected[0] === l && selected[1] === i;
              return (
                <button type="button" key={i} className={`rm-cell risk-${level} ${isSel ? 'sel' : ''} ${n ? 'has' : ''}`} disabled={!onPick && !n}
                  title={`${LIKELIHOOD[l - 1]} × ${IMPACT[i - 1]} = ${l * i} (${level})`} onClick={() => onPick?.(l, i)}>
                  {n > 0 ? <b>{n}</b> : isSel ? '●' : ''}
                </button>
              );
            })}
          </div>
        ))}
        <div className="rm-row rm-xaxis"><span className="rm-axis" />{[1, 2, 3, 4, 5].map((i) => <span key={i} className="rm-axis" title={IMPACT[i - 1]}>{i}</span>)}</div>
      </div>
      <div className="rm-xlabel">Impact →</div>
    </div>
  );
}

export default function Ncrs() {
  const { data } = useStore();
  const navigate = useNavigate();
  const perm = usePermissions();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'active' | 'all' | Ncr['status']>('active');
  const [category, setCategory] = useState('all');
  const [cell, setCell] = useState<[number, number] | null>(null);

  const rows = useMemo(() => data.ncrs.filter((n) => {
    const s = q.toLowerCase();
    return (!s || [String(n.number), n.title, n.owner, n.description].some((f) => f.toLowerCase().includes(s)))
      && (status === 'all' || (status === 'active' ? n.status !== 'closed' : n.status === status))
      && (category === 'all' || n.category === category)
      && (!cell || (n.likelihood === cell[0] && n.impact === cell[1]));
  }).sort((a, b) => riskScore(b) - riskScore(a) || a.dueDate.localeCompare(b.dueDate)), [data.ncrs, q, status, category, cell]);

  const open = data.ncrs.filter((n) => n.status !== 'closed');
  const overdue = open.filter((n) => daysUntil(n.dueDate) < 0);
  const closed = data.ncrs.filter((n) => n.status === 'closed' && n.closedAt);
  const avgClose = closed.length ? Math.round(closed.reduce((s, n) => s + (new Date(n.closedAt!).getTime() - new Date(n.raisedAt).getTime()) / 86_400_000, 0) / closed.length) : null;

  const exportCSV = () => downloadCSV('ncr-register.csv', [
    ['NCR', 'Title', 'Category', 'Source', 'Severity', 'Risk', 'Status', 'Owner', 'Raised', 'Due', 'Closed', 'Root cause'],
    ...rows.map((n) => [`NCR-${n.number}`, n.title, n.category, n.source, n.severity, riskScore(n), n.status, n.owner, n.raisedAt, n.dueDate, n.closedAt, n.rootCause]),
  ]);

  return (
    <>
      <PageHeader title="Non-conformance reports" subtitle="Record what went wrong, find the root cause, fix it, and prove the fix worked."
        actions={<>
          <button className="btn" onClick={exportCSV}><Download size={16} /> Export register</button>
          {perm.canWrite('ncrs') && <Link className="btn btn-primary" to="/ncr/new"><Plus size={16} /> Raise NCR</Link>}
        </>} />
      <div className="stats">
        <StatCard label="Open NCRs" value={open.length} icon={<FileWarning size={18} />} tone={open.length ? 'warn' : 'good'} onClick={() => setStatus('active')} />
        <StatCard label="Past due" value={overdue.length} tone={overdue.length ? 'bad' : 'good'} hint="need attention now" />
        <StatCard label="Critical open" value={open.filter((n) => n.severity === 'critical').length} tone={open.some((n) => n.severity === 'critical') ? 'bad' : 'good'} />
        <StatCard label="Avg. days to close" value={avgClose ?? '—'} hint={`${closed.length} closed`} icon={<BadgeCheck size={18} />} />
      </div>
      <div className="grid-side-left">
        <Card title="Risk heat map" actions={cell && <button className="link-btn small" onClick={() => setCell(null)}>Clear</button>}>
          <RiskMatrix ncrs={open} onPick={(l, i) => setCell(cell && cell[0] === l && cell[1] === i ? null : [l, i])} selected={cell ?? undefined} />
          <p className="small muted">Open NCRs by likelihood × impact. Click a square to filter.</p>
          <div className="pipeline">
            {NCR_STAGES.map((s) => (
              <button key={s.status} className={`pipe ${status === s.status ? 'on' : ''}`} onClick={() => setStatus(status === s.status ? 'active' : s.status)}>
                <span>{s.label}</span><b>{data.ncrs.filter((n) => n.status === s.status).length}</b>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <div className="toolbar">
            <SearchInput value={q} onChange={setQ} placeholder="Search NCRs…" />
            <Select label="Status" value={status} onChange={setStatus} options={[{ value: 'active', label: 'Open (not closed)' }, { value: 'all', label: 'All' }, ...NCR_STAGES.map((s) => ({ value: s.status, label: s.label }))]} />
            <Select label="Category" value={category} onChange={setCategory} options={[{ value: 'all', label: 'All categories' }, ...NCR_CATEGORIES.map((c) => ({ value: c, label: c }))]} />
          </div>
          {rows.length === 0 ? <Empty icon={<ShieldAlert size={32} />} title="No NCRs match">That's either great news or a filter to clear.</Empty> : (
            <div className="ncr-list">
              {rows.map((n) => {
                const late = n.status !== 'closed' && daysUntil(n.dueDate) < 0;
                const idx = stageIndex(n.status);
                return (
                  <article key={n.id} className={`ncr-row sev-${n.severity}`} onClick={() => navigate(`/ncr/${n.id}`)}>
                    <span className={`risk-chip risk-${riskLevel(riskScore(n))}`} title="Risk score">{riskScore(n)}</span>
                    <div className="grow">
                      <div className="row gap-sm wrap"><span className="mono small muted">NCR-{n.number}</span><Badge value={n.severity} /><span className="small muted">{n.category} · {n.source}</span></div>
                      <strong>{n.title}</strong>
                      <div className="ncr-progress">{NCR_STAGES.map((s, i) => <span key={s.status} className={i <= idx ? 'on' : ''} title={s.label} />)}</div>
                      <div className="small muted">{NCR_STAGES[idx].label} · {n.owner || 'No owner'} · <span className={late ? 'tone-text-bad' : ''}>{n.status === 'closed' ? `closed ${fmtDate(n.closedAt)}` : describeDue(n.dueDate)}</span></div>
                    </div>
                    <span className="chevron">›</span>
                  </article>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function NcrFields({ n, set }: { n: Ncr; set: <K extends keyof Ncr>(k: K, v: Ncr[K]) => void }) {
  const { data } = useStore();
  return (
    <>
      <Field label="Title" span><input className="input" required value={n.title} placeholder="What went wrong, in one line" onChange={(e) => set('title', e.target.value)} /></Field>
      <Field label="Description" span><textarea className="input" rows={3} value={n.description} placeholder="What happened, where, when and who found it" onChange={(e) => set('description', e.target.value)} /></Field>
      <Field label="Category"><select className="input" value={n.category} onChange={(e) => set('category', e.target.value as NcrCategory)}>{NCR_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Source"><select className="input" value={n.source} onChange={(e) => set('source', e.target.value as NcrSource)}>{NCR_SOURCES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Severity"><select className="input" value={n.severity} onChange={(e) => set('severity', e.target.value as Severity)}><option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical</option></select></Field>
      <Field label="Owner"><input className="input" value={n.owner} onChange={(e) => set('owner', e.target.value)} placeholder="Who drives this to closure?" /></Field>
      <Field label="Due date"><input className="input" type="date" required value={n.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>
      <Field label="Vehicle (optional)">
        <select className="input" value={n.vehicleId ?? ''} onChange={(e) => set('vehicleId', e.target.value || undefined)}>
          <option value="">None</option>{data.vehicles.map((v) => <option key={v.id} value={v.id}>{v.rego} · {v.name}</option>)}
        </select>
      </Field>
      <Field label="Driver (optional)">
        <select className="input" value={n.driverId ?? ''} onChange={(e) => set('driverId', e.target.value || undefined)}>
          <option value="">None</option>{data.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
      <div className="span-2 field">
        <span>Risk rating – click a square (likelihood × impact = {n.likelihood * n.impact}, {riskLevel(n.likelihood * n.impact)})</span>
        <RiskMatrix ncrs={[]} selected={[n.likelihood, n.impact]} onPick={(l, i) => { set('likelihood', l); set('impact', i); }} />
      </div>
    </>
  );
}

export function NewNcr() {
  const { data, raiseNcr, upsert, nextNumber, actor } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [n, setN] = useState<Ncr>(() => {
    const defect = byId(data.defects, params.get('defect') ?? undefined);
    const audit = byId(data.audits, params.get('audit') ?? undefined);
    const auditItem = audit?.items.find((i) => i.id === params.get('item'));
    const wo = byId(data.workOrders, params.get('workOrder') ?? undefined);
    return {
      id: uid(), number: nextNumber('ncrs'), title: defect ? `${defect.item}: ${defect.description}` : auditItem ? `Audit finding: ${auditItem.question}` : wo ? `Issue on job #${wo.number}` : '',
      description: defect?.description ?? (auditItem ? `${audit!.title} – "${auditItem.question}" failed.${auditItem.note ? ` Note: ${auditItem.note}` : ''}` : ''),
      category: defect ? 'Vehicle safety' : 'Process', source: defect ? 'Defect' : audit ? 'Audit' : 'Internal',
      severity: defect?.severity ?? 'major', likelihood: 3, impact: defect?.severity === 'critical' ? 5 : 3, status: 'open',
      raisedBy: actor, raisedAt: todayISO(), dueDate: addDays(todayISO(), defect?.severity === 'critical' ? 7 : 14), owner: '',
      vehicleId: defect?.vehicleId ?? audit?.vehicleId ?? wo?.vehicleId ?? params.get('vehicle') ?? undefined, driverId: defect?.driverId ?? audit?.driverId,
      defectId: defect?.id, auditId: audit?.id, workOrderId: wo?.id,
      containment: '', whys: ['', '', '', '', ''], rootCause: '', actions: [], verificationMethod: '', verificationResult: '',
    };
  });
  const set = <K extends keyof Ncr>(k: K, v: Ncr[K]) => setN((p) => ({ ...p, [k]: v }));
  return (
    <>
      <PageHeader title={`Raise NCR-${n.number}`} subtitle="Capture the facts now – investigation, actions and verification happen on the NCR page." />
      <EditCard title="Non-conformance details" submitLabel="Raise NCR" onCancel={() => navigate(-1)} onSubmit={() => {
        const created = raiseNcr(n);
        const auditId = params.get('audit'); const itemId = params.get('item');
        const audit = byId(data.audits, auditId ?? undefined);
        if (audit && itemId) upsert('audits', { ...audit, items: audit.items.map((i) => (i.id === itemId ? { ...i, ncrId: created.id } : i)) });
        navigate(`/ncr/${created.id}`);
      }}>
        <NcrFields n={n} set={set} />
      </EditCard>
    </>
  );
}

export function NcrDetail() {
  const { id } = useParams();
  const { data, upsert, remove, actor } = useStore();
  const perm = usePermissions();
  const navigate = useNavigate();
  const n = byId(data.ncrs, id);
  const [draft, setDraft] = useState<Ncr | null>(null);
  const [action, setAction] = useState<CapaAction>({ id: uid(), type: 'corrective', description: '', owner: '', dueDate: addDays(todayISO(), 7), done: false });
  if (!n) return <Empty title="NCR not found"><Link to="/ncr" className="link">Back to NCRs</Link></Empty>;

  const canEdit = perm.canWrite('ncrs') && n.status !== 'closed';
  const idx = stageIndex(n.status);
  const blockers = ncrBlockers(n);
  const score = riskScore(n);
  const level = riskLevel(score);
  const late = n.status !== 'closed' && daysUntil(n.dueDate) < 0;
  const save = (patch: Partial<Ncr>) => upsert('ncrs', { ...n, ...patch });
  const set = <K extends keyof Ncr>(k: K, v: Ncr[K]) => setDraft((p) => (p ? { ...p, [k]: v } : p));
  const v = byId(data.vehicles, n.vehicleId);
  const d = byId(data.drivers, n.driverId);
  const defect = byId(data.defects, n.defectId);
  const audit = byId(data.audits, n.auditId);
  const wo = byId(data.workOrders, n.workOrderId);

  const advance = () => {
    const next = NCR_STAGES[idx + 1];
    if (!next) return;
    if (next.status === 'closed') {
      save({ status: 'closed', closedAt: todayISO(), verifiedBy: n.verifiedBy || actor, verifiedAt: n.verifiedAt || todayISO() });
      celebrate(`NCR-${n.number} closed – great work!`);
    } else save({ status: next.status });
  };
  const stageTab = ['overview', 'investigation', 'actions', 'verification', 'verification'][idx];

  return (
    <ItemPage
      entity={{ type: 'ncr', id: n.id }}
      back={{ to: '/ncr', label: 'NCR register' }}
      icon={<ShieldAlert size={28} />}
      accent={n.status === 'closed' ? 'teal' : n.severity === 'critical' ? 'red' : n.severity === 'major' ? 'amber' : 'violet'}
      eyebrow={<>NCR-{n.number} · {n.category} · raised from {n.source.toLowerCase()}</>}
      title={n.title}
      subtitle={<>Raised by {n.raisedBy} on {fmtDate(n.raisedAt)} · owner {n.owner || 'unassigned'}</>}
      badges={<><Badge value={n.severity} /><Badge value={n.status} label={NCR_STAGES[idx].label} /><span className={`badge risk-badge risk-${level}`}>Risk {score} · {level}</span>{late && <span className="badge tone-bad">Past due</span>}</>}
      actions={<>
        {canEdit && !draft && <button className="btn" onClick={() => setDraft(n)}>Edit details</button>}
        {canEdit && idx < NCR_STAGES.length - 1 && (
          <button className="btn btn-primary" disabled={blockers.length > 0} title={blockers.join('\n')} onClick={advance}>
            {NCR_STAGES[idx + 1].status === 'closed' ? <><Lock size={16} /> Close NCR</> : <>Move to {NCR_STAGES[idx + 1].label} →</>}
          </button>
        )}
        {perm.canManage && n.status === 'closed' && <button className="btn" onClick={() => save({ status: 'verification', closedAt: undefined })}>Re-open</button>}
        {perm.canDelete && <button className="icon-btn" title="Delete" onClick={() => { if (confirmAction(`Delete NCR-${n.number}?`)) { remove('ncrs', n.id); navigate('/ncr'); } }}><Trash2 size={16} /></button>}
      </>}
      stats={[
        { label: 'Stage', value: NCR_STAGES[idx].label, hint: NCR_STAGES[idx].hint },
        { label: 'Due', value: fmtDate(n.dueDate), hint: n.status === 'closed' ? `closed ${fmtDate(n.closedAt)}` : relDays(n.dueDate), tone: late ? 'bad' : undefined },
        { label: 'Actions', value: `${n.actions.filter((a) => a.done).length}/${n.actions.length}`, hint: 'corrective & preventive' },
        { label: 'Risk', value: `${n.likelihood} × ${n.impact} = ${score}`, hint: `${LIKELIHOOD[n.likelihood - 1]} · ${IMPACT[n.impact - 1]}`, tone: level === 'extreme' || level === 'high' ? 'bad' : level === 'medium' ? 'warn' : 'good' },
      ]}
      banner={
        <div className="ncr-stages">
          {NCR_STAGES.map((s, i) => (
            <div key={s.status} className={`ncr-stage ${i < idx ? 'done' : ''} ${i === idx ? 'current' : ''}`}>
              <span className="step-dot">{i < idx || n.status === 'closed' ? '✓' : i + 1}</span>
              <div><strong>{s.label}</strong><span className="small muted">{s.hint}</span></div>
            </div>
          ))}
          {canEdit && blockers.length > 0 && (
            <div className="ncr-blockers"><strong>To move on:</strong> {blockers.join(' · ')} {stageTab !== 'overview' && <Link className="link" to={`?tab=${stageTab}`}>Go →</Link>}</div>
          )}
        </div>
      }
      tabs={[
        {
          id: 'overview', label: 'Overview', icon: <LayoutGrid size={15} />, render: () => (
            <div className="stack">
              {draft && <EditCard title="Edit NCR" onCancel={() => setDraft(null)} onSubmit={() => { upsert('ncrs', { ...draft, status: n.status }); setDraft(null); }}><NcrFields n={draft} set={set} /></EditCard>}
              <div className="grid-2">
                <Card title="What happened"><p className="prose">{n.description || <span className="muted">No description yet.</span>}</p></Card>
                <Card title="Immediate containment">
                  {canEdit ? (
                    <textarea className="input" rows={4} placeholder="What did you do straight away to stop it getting worse? (e.g. vehicle tagged out, stock quarantined)"
                      defaultValue={n.containment} onBlur={(e) => e.target.value !== n.containment && save({ containment: e.target.value })} />
                  ) : <p className="prose">{n.containment || <span className="muted">Not recorded.</span>}</p>}
                  {canEdit && <p className="small muted">Saves when you click away.</p>}
                </Card>
              </div>
              <div className="grid-2">
                <Card title="Risk rating"><RiskMatrix ncrs={[n]} /></Card>
                <Card title="Linked records">
                  <ul className="list">
                    {v && <li><span>Vehicle</span><Link className="link" to={`/vehicles/${v.id}`}>{v.rego} · {v.name}</Link></li>}
                    {d && <li><span>Driver</span><Link className="link" to={`/drivers/${d.id}`}>{d.name}</Link></li>}
                    {defect && <li><span>Defect</span><Link className="link" to={`/defects/${defect.id}`}>{defect.item}</Link></li>}
                    {audit && <li><span>Audit</span><Link className="link" to={`/audits/${audit.id}`}>AUD-{audit.number} {audit.title}</Link></li>}
                    {wo && <li><span>Work order</span><Link className="link" to={`/work-orders/${wo.id}`}>#{wo.number} {wo.title}</Link></li>}
                    {!v && !d && !defect && !audit && !wo && <li className="muted">Nothing linked.</li>}
                  </ul>
                  {canEdit && v && <Link className="btn btn-sm" to={`/work-orders/new?vehicle=${v.id}`}>Create corrective work order</Link>}
                </Card>
              </div>
            </div>
          ),
        },
        {
          id: 'investigation', label: 'Investigation', icon: <Search size={15} />, render: () => (
            <div className="grid-2">
              <Card title="5 Whys">
                <p className="small muted">Ask "why?" until you reach something you can fix at the source. Three good answers is usually enough.</p>
                <ol className="whys">
                  {n.whys.map((w, i) => (
                    <li key={i}>
                      <span className="why-num">Why {i + 1}</span>
                      {canEdit ? <input className="input" defaultValue={w} placeholder={i === 0 ? 'Why did this happen?' : `Why was that? (answer ${i})`}
                        onBlur={(e) => e.target.value !== w && save({ whys: n.whys.map((x, j) => (j === i ? e.target.value : x)) })} />
                        : <span>{w || <span className="muted">—</span>}</span>}
                    </li>
                  ))}
                </ol>
              </Card>
              <Card title="Root cause">
                <div className="fishbone">
                  {ROOT_CAUSE_CATEGORIES.map((c) => (
                    <button key={c} type="button" className={`bone ${n.rootCauseCategory === c ? 'on' : ''}`} disabled={!canEdit} onClick={() => save({ rootCauseCategory: c as RootCauseCategory })}>{c}</button>
                  ))}
                </div>
                <p className="small muted">Pick the category (fishbone / Ishikawa) the root cause belongs to.</p>
                {canEdit ? (
                  <textarea className="input" rows={4} placeholder="The underlying reason this happened…" defaultValue={n.rootCause} onBlur={(e) => e.target.value !== n.rootCause && save({ rootCause: e.target.value })} />
                ) : <p className="prose">{n.rootCause || <span className="muted">Not identified yet.</span>}</p>}
              </Card>
            </div>
          ),
        },
        {
          id: 'actions', label: 'Actions (CAPA)', icon: <Target size={15} />, count: n.actions.filter((a) => !a.done).length, render: () => (
            <div className="grid-side">
              <Card title="Corrective & preventive actions">
                {n.actions.length === 0 ? <Empty icon={<ClipboardList size={28} />} title="No actions yet">Corrective actions fix this instance; preventive actions stop it happening again.</Empty> : (
                  <ul className="capa-list">
                    {n.actions.map((a) => {
                      const overdue = !a.done && daysUntil(a.dueDate) < 0;
                      return (
                        <li key={a.id} className={a.done ? 'done' : overdue ? 'overdue' : ''}>
                          <button className={`tick ${a.done ? 'on' : ''}`} disabled={!canEdit} onClick={() => save({ actions: n.actions.map((x) => (x.id === a.id ? { ...x, done: !x.done, doneAt: !x.done ? todayISO() : undefined } : x)) })}><CheckCircle2 size={14} /></button>
                          <div className="grow">
                            <div className="row gap-sm"><span className={`badge ${a.type === 'corrective' ? 'tone-info' : 'tone-good'}`}>{a.type}</span><strong>{a.description}</strong></div>
                            <div className="small muted">{a.owner || 'No owner'} · {a.done ? `done ${fmtDate(a.doneAt)}` : <span className={overdue ? 'tone-text-bad' : ''}>due {relDays(a.dueDate)}</span>}</div>
                          </div>
                          {canEdit && <button className="icon-btn" aria-label="Remove action" onClick={() => save({ actions: n.actions.filter((x) => x.id !== a.id) })}><X size={14} /></button>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
              {canEdit && (
                <form className="card upload-card" onSubmit={(e) => { e.preventDefault(); if (!action.description.trim()) return; save({ actions: [...n.actions, { ...action, description: action.description.trim() }] }); setAction({ id: uid(), type: action.type, description: '', owner: action.owner, dueDate: addDays(todayISO(), 7), done: false }); }}>
                  <h2><Plus size={16} /> Add action</h2>
                  <div className="segmented">
                    <button type="button" className={action.type === 'corrective' ? 'on' : ''} onClick={() => setAction({ ...action, type: 'corrective' })}>Corrective</button>
                    <button type="button" className={action.type === 'preventive' ? 'on' : ''} onClick={() => setAction({ ...action, type: 'preventive' })}>Preventive</button>
                  </div>
                  <label className="field"><span>Action</span><textarea className="input" rows={2} required value={action.description} onChange={(e) => setAction({ ...action, description: e.target.value })} /></label>
                  <label className="field"><span>Owner</span><input className="input" value={action.owner} onChange={(e) => setAction({ ...action, owner: e.target.value })} /></label>
                  <label className="field"><span>Due</span><input className="input" type="date" value={action.dueDate} onChange={(e) => setAction({ ...action, dueDate: e.target.value })} /></label>
                  <button className="btn btn-primary btn-block">Add action</button>
                </form>
              )}
            </div>
          ),
        },
        {
          id: 'verification', label: 'Verification', icon: <BadgeCheck size={15} />, render: () => (
            <div className="grid-2">
              <Card title="How will we know it worked?">
                {canEdit ? <textarea className="input" rows={3} placeholder="e.g. Review 2 weeks of records, re-inspect the vehicle, spot-check drivers" defaultValue={n.verificationMethod} onBlur={(e) => e.target.value !== n.verificationMethod && save({ verificationMethod: e.target.value })} />
                  : <p className="prose">{n.verificationMethod || <span className="muted">—</span>}</p>}
                <h3 className="mt">Result</h3>
                {canEdit ? <textarea className="input" rows={3} placeholder="What did the check find?" defaultValue={n.verificationResult} onBlur={(e) => e.target.value !== n.verificationResult && save({ verificationResult: e.target.value })} />
                  : <p className="prose">{n.verificationResult || <span className="muted">—</span>}</p>}
              </Card>
              <Card title="Effectiveness & sign-off">
                <div className="effective">
                  <button type="button" className={`eff-btn good ${n.effective === true ? 'on' : ''}`} disabled={!canEdit} onClick={() => save({ effective: true, verifiedBy: actor, verifiedAt: todayISO() })}><CheckCircle2 size={20} /> Effective</button>
                  <button type="button" className={`eff-btn bad ${n.effective === false ? 'on' : ''}`} disabled={!canEdit} onClick={() => save({ effective: false, status: 'action', verifiedBy: actor, verifiedAt: todayISO() })}><X size={20} /> Not effective</button>
                </div>
                <p className="small muted">Marking "not effective" sends the NCR back to the action stage so new actions can be added.</p>
                {n.verifiedBy && <p className="small">Verified by <b>{n.verifiedBy}</b> on {fmtDate(n.verifiedAt)}</p>}
                {n.status === 'closed' && <div className="closed-stamp"><BadgeCheck size={28} /> CLOSED {fmtDate(n.closedAt)}</div>}
              </Card>
            </div>
          ),
        },
      ]}
    />
  );
}
