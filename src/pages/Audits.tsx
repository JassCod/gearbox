import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CalendarCheck, ClipboardList, FileSearch, LayoutGrid, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import type { Audit, AuditResult } from '../types';
import { Badge, Card, Empty, Field, PageHeader, Select, StatCard, confirmAction } from '../components/ui';
import { EditCard, ItemPage } from '../components/ItemPage';
import { celebrate } from '../components/celebrate';
import { AUDIT_TEMPLATES, auditScore, itemsFromTemplate } from '../lib/compliance';
import { byId, daysUntil, fmtDate, relDays, todayISO, uid } from '../lib/utils';

function ScoreDial({ score, size = 72 }: { score: number | null; size?: number }) {
  const r = 30; const c = 2 * Math.PI * r;
  const tone = score === null ? 'muted' : score >= 90 ? 'good' : score >= 75 ? 'warn' : 'bad';
  return (
    <div className="score-dial" style={{ width: size, height: size }}>
      <svg viewBox="0 0 72 72"><circle cx="36" cy="36" r={r} className="ring-track" /><circle cx="36" cy="36" r={r} className={`ring-value tone-stroke-${tone}`} strokeDasharray={c} strokeDashoffset={c * (1 - (score ?? 0) / 100)} /></svg>
      <span>{score === null ? '—' : `${score}%`}</span>
    </div>
  );
}

export default function Audits() {
  const { data } = useStore();
  const navigate = useNavigate();
  const perm = usePermissions();
  const [status, setStatus] = useState<'all' | Audit['status']>('all');
  const [type, setType] = useState('all');
  const rows = useMemo(() => data.audits.filter((a) => (status === 'all' || a.status === status) && (type === 'all' || a.type === type))
    .sort((a, b) => b.date.localeCompare(a.date)), [data.audits, status, type]);
  const completed = data.audits.filter((a) => a.status === 'completed');
  const avg = completed.length ? Math.round(completed.reduce((s, a) => s + (auditScore(a).score ?? 0), 0) / completed.length) : null;
  const findings = data.audits.reduce((s, a) => s + auditScore(a).failed, 0);

  return (
    <>
      <PageHeader title="Audits & inspections" subtitle="Run structured audits from templates. Failed items can be raised as NCRs in one click."
        actions={perm.canWrite('audits') && <Link className="btn btn-primary" to="/audits/new"><Plus size={16} /> Schedule audit</Link>} />
      <div className="stats">
        <StatCard label="Planned" value={data.audits.filter((a) => a.status === 'planned').length} icon={<CalendarCheck size={18} />} onClick={() => setStatus('planned')} />
        <StatCard label="In progress" value={data.audits.filter((a) => a.status === 'in-progress').length} onClick={() => setStatus('in-progress')} />
        <StatCard label="Average score" value={avg !== null ? `${avg}%` : '—'} tone={avg === null ? 'neutral' : avg >= 90 ? 'good' : avg >= 75 ? 'warn' : 'bad'} hint={`${completed.length} completed`} />
        <StatCard label="Findings raised" value={findings} tone={findings ? 'warn' : 'good'} hint="failed checklist items" />
      </div>
      <Card>
        <div className="toolbar">
          <Select label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, { value: 'planned', label: 'Planned' }, { value: 'in-progress', label: 'In progress' }, { value: 'completed', label: 'Completed' }]} />
          <Select label="Type" value={type} onChange={setType} options={[{ value: 'all', label: 'All types' }, ...AUDIT_TEMPLATES.map((t) => ({ value: t.type, label: t.type }))]} />
        </div>
        {rows.length === 0 ? <Empty icon={<FileSearch size={32} />} title="No audits yet" /> : (
          <div className="audit-grid">
            {rows.map((a) => {
              const s = auditScore(a);
              return (
                <article key={a.id} className="audit-card" onClick={() => navigate(`/audits/${a.id}`)}>
                  <ScoreDial score={s.score} />
                  <div className="grow">
                    <div className="row gap-sm"><span className="mono small muted">AUD-{a.number}</span><Badge value={a.status} /></div>
                    <strong>{a.title}</strong>
                    <div className="small muted">{a.type} · {fmtDate(a.date)} ({relDays(a.date)}) · {a.auditor}</div>
                    <div className="small">{s.answered}/{s.total} answered{s.failed > 0 && <span className="tone-text-bad"> · {s.failed} finding{s.failed > 1 ? 's' : ''}</span>}</div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

export function NewAudit() {
  const { data, upsert, nextNumber, actor } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [tpl, setTpl] = useState(params.get('vehicle') ? 0 : 1);
  const t = AUDIT_TEMPLATES[tpl];
  const [a, setA] = useState<Omit<Audit, 'items' | 'type'>>({
    id: uid(), number: nextNumber('audits'), title: '', date: todayISO(), auditor: actor, depot: data.settings.depots[0] ?? '',
    vehicleId: params.get('vehicle') ?? undefined, status: 'planned',
  });
  const set = <K extends keyof typeof a>(k: K, v: (typeof a)[K]) => setA((p) => ({ ...p, [k]: v }));
  return (
    <>
      <PageHeader title="Schedule an audit" subtitle="Pick a template – you'll get a ready-made checklist to work through." />
      <div className="template-grid">
        {AUDIT_TEMPLATES.map((x, i) => (
          <button key={x.type} type="button" className={`template-card ${i === tpl ? 'on' : ''}`} onClick={() => setTpl(i)}>
            <ClipboardList size={22} />
            <strong>{x.type}</strong>
            <span className="small muted">{x.description}</span>
            <span className="small">{x.sections.reduce((s, sec) => s + sec.questions.length, 0)} checks · {x.sections.length} sections</span>
          </button>
        ))}
      </div>
      <EditCard title={`${t.type} details`} submitLabel="Create audit" onCancel={() => navigate(-1)} onSubmit={() => {
        const v = byId(data.vehicles, a.vehicleId);
        const d = byId(data.drivers, a.driverId);
        const title = a.title.trim() || `${t.type}${v ? ` – ${v.rego}` : d ? ` – ${d.name}` : ` – ${a.depot}`}`;
        upsert('audits', { ...a, title, type: t.type, items: itemsFromTemplate(t) });
        navigate(`/audits/${a.id}`);
      }}>
        <Field label="Title (optional)" span><input className="input" value={a.title} placeholder={`${t.type} – …`} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Date"><input className="input" type="date" required value={a.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Auditor"><input className="input" required value={a.auditor} onChange={(e) => set('auditor', e.target.value)} /></Field>
        <Field label="Depot"><select className="input" value={a.depot} onChange={(e) => set('depot', e.target.value)}>{data.settings.depots.map((x) => <option key={x}>{x}</option>)}</select></Field>
        {t.scope === 'vehicle' && (
          <Field label="Vehicle"><select className="input" value={a.vehicleId ?? ''} onChange={(e) => set('vehicleId', e.target.value || undefined)}>
            <option value="">Choose…</option>{data.vehicles.map((v) => <option key={v.id} value={v.id}>{v.rego} · {v.name}</option>)}</select></Field>
        )}
        {t.scope === 'driver' && (
          <Field label="Driver"><select className="input" value={a.driverId ?? ''} onChange={(e) => set('driverId', e.target.value || undefined)}>
            <option value="">Whole depot</option>{data.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        )}
      </EditCard>
    </>
  );
}

export function AuditDetail() {
  const { id } = useParams();
  const { data, upsert, remove } = useStore();
  const perm = usePermissions();
  const navigate = useNavigate();
  const a = byId(data.audits, id);
  if (!a) return <Empty title="Audit not found"><Link to="/audits" className="link">Back to audits</Link></Empty>;
  const canEdit = perm.canWrite('audits') && a.status !== 'completed';
  const s = auditScore(a);
  const v = byId(data.vehicles, a.vehicleId);
  const d = byId(data.drivers, a.driverId);
  const sections = [...new Set(a.items.map((i) => i.section))];
  const fails = a.items.filter((i) => i.result === 'fail');
  const ncrs = data.ncrs.filter((n) => n.auditId === a.id);
  const setResult = (itemId: string, result: AuditResult) =>
    upsert('audits', { ...a, status: a.status === 'planned' ? 'in-progress' : a.status, items: a.items.map((i) => (i.id === itemId ? { ...i, result } : i)) });
  const setNote = (itemId: string, note: string) => upsert('audits', { ...a, items: a.items.map((i) => (i.id === itemId ? { ...i, note } : i)) });
  const complete = () => {
    upsert('audits', { ...a, status: 'completed', completedAt: todayISO() });
    if ((s.score ?? 0) >= 90) celebrate(`Audit passed with ${s.score}%!`);
  };
  const overdue = a.status !== 'completed' && daysUntil(a.date) < 0;

  return (
    <ItemPage
      entity={{ type: 'audit', id: a.id }}
      back={{ to: '/audits', label: 'All audits' }}
      icon={<FileSearch size={28} />}
      accent={a.status === 'completed' ? ((s.score ?? 0) >= 90 ? 'teal' : (s.score ?? 0) >= 75 ? 'amber' : 'red') : 'violet'}
      eyebrow={<>AUD-{a.number} · {a.type}</>}
      title={a.title}
      subtitle={<>{fmtDate(a.date)} · auditor {a.auditor} · {a.depot}{v && <> · <Link className="link-light" to={`/vehicles/${v.id}`}>{v.rego}</Link></>}{d && <> · <Link className="link-light" to={`/drivers/${d.id}`}>{d.name}</Link></>}</>}
      badges={<><Badge value={a.status} />{overdue && <span className="badge tone-bad">Overdue</span>}</>}
      actions={<>
        {canEdit && <button className="btn btn-primary" disabled={s.answered < s.total} title={s.answered < s.total ? 'Answer every item first' : ''} onClick={complete}>Complete audit</button>}
        {perm.canManage && a.status === 'completed' && <button className="btn" onClick={() => upsert('audits', { ...a, status: 'in-progress', completedAt: undefined })}>Re-open</button>}
        {perm.canDelete && <button className="icon-btn" title="Delete" onClick={() => { if (confirmAction('Delete this audit?')) { remove('audits', a.id); navigate('/audits'); } }}><Trash2 size={16} /></button>}
      </>}
      stats={[
        { label: 'Score', value: s.score !== null ? `${s.score}%` : '—', tone: s.score === null ? undefined : s.score >= 90 ? 'good' : s.score >= 75 ? 'warn' : 'bad' },
        { label: 'Answered', value: `${s.answered}/${s.total}` },
        { label: 'Findings', value: s.failed, tone: s.failed ? 'bad' : 'good' },
        { label: 'NCRs raised', value: ncrs.length },
      ]}
      tabs={[
        {
          id: 'checklist', label: 'Checklist', icon: <ClipboardList size={15} />, count: s.total - s.answered, render: () => (
            <div className="stack">
              <div className="big-progress"><div style={{ width: `${s.total ? (s.answered / s.total) * 100 : 0}%` }} /></div>
              {sections.map((sec) => (
                <Card key={sec} title={sec}>
                  <ul className="audit-items">
                    {a.items.filter((i) => i.section === sec).map((i) => (
                      <li key={i.id} className={`ai-${i.result ?? 'none'}`}>
                        <div className="ai-q">{i.question}</div>
                        <div className="ai-controls">
                          <div className="segmented small">
                            {(['pass', 'fail', 'na'] as const).map((r) => (
                              <button key={r} type="button" disabled={!canEdit} className={i.result === r ? `on ${r === 'pass' ? 'good' : r === 'fail' ? 'bad' : ''}` : ''} onClick={() => setResult(i.id, i.result === r ? null : r)}>
                                {r === 'pass' ? 'Pass' : r === 'fail' ? 'Fail' : 'N/A'}
                              </button>
                            ))}
                          </div>
                          {i.result === 'fail' && (i.ncrId
                            ? <Link className="btn btn-sm" to={`/ncr/${i.ncrId}`}><ShieldAlert size={14} /> NCR-{byId(data.ncrs, i.ncrId)?.number}</Link>
                            : perm.canWrite('ncrs') && <Link className="btn btn-sm btn-danger" to={`/ncr/new?audit=${a.id}&item=${i.id}`}><ShieldAlert size={14} /> Raise NCR</Link>)}
                        </div>
                        {(i.result === 'fail' || i.note) && (
                          canEdit ? <input className="input input-sm ai-note" placeholder="Finding / evidence…" defaultValue={i.note ?? ''} onBlur={(e) => e.target.value !== (i.note ?? '') && setNote(i.id, e.target.value)} />
                            : <div className="small muted">{i.note}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          ),
        },
        {
          id: 'summary', label: 'Summary & findings', icon: <LayoutGrid size={15} />, count: fails.length, render: () => (
            <div className="grid-2">
              <Card title="Findings">
                <ul className="list">
                  {fails.map((i) => (
                    <li key={i.id}><div><strong>{i.question}</strong><div className="small muted">{i.section}{i.note && ` · ${i.note}`}</div></div>
                      {i.ncrId ? <Link className="link" to={`/ncr/${i.ncrId}`}>NCR-{byId(data.ncrs, i.ncrId)?.number}</Link> : <span className="badge tone-warn">No NCR</span>}</li>
                  ))}
                  {fails.length === 0 && <li className="muted">No findings. 🎉</li>}
                </ul>
              </Card>
              <Card title="Auditor summary">
                {perm.canWrite('audits') ? (
                  <>
                    <textarea className="input" rows={6} defaultValue={a.summary ?? ''} placeholder="Overall observations, good practice seen, key risks…" onBlur={(e) => e.target.value !== (a.summary ?? '') && upsert('audits', { ...a, summary: e.target.value })} />
                    <p className="small muted">Saves when you click away.</p>
                  </>
                ) : <p className="prose">{a.summary || <span className="muted">No summary.</span>}</p>}
              </Card>
            </div>
          ),
        },
      ]}
    />
  );
}
