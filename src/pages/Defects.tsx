import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, LayoutGrid, Plus, TriangleAlert, Wrench, ShieldAlert } from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import type { Defect, DefectStatus, Severity } from '../types';
import { Badge, Card, Empty, Field, PageHeader, Select } from '../components/ui';
import { EditCard, ItemPage } from '../components/ItemPage';
import { byId, fmtDate, relDays, todayISO, uid } from '../lib/utils';

const SEV_RANK: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };

export default function Defects() {
  const { data } = useStore();
  const navigate = useNavigate();
  const [status, setStatus] = useState<DefectStatus | 'active' | 'all'>('active');
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const perm = usePermissions();

  const rows = useMemo(() => data.defects
    .filter((d) => (status === 'all' || (status === 'active' ? d.status !== 'resolved' : d.status === status))
      && (severity === 'all' || d.severity === severity))
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.date.localeCompare(a.date)), [data.defects, status, severity]);

  const count = (s: Severity) => data.defects.filter((d) => d.status !== 'resolved' && d.severity === s).length;

  return (
    <>
      <PageHeader title="Defects" subtitle="Faults reported by drivers or found in the workshop. Open one to raise a work order or an NCR."
        actions={perm.canWrite('defects') && <Link className="btn btn-primary" to="/defects/new"><Plus size={16} /> Report defect</Link>} />
      <div className="stats">
        {(['critical', 'major', 'minor'] as const).map((s) => (
          <button key={s} className={`stat tone-${s === 'critical' ? 'bad' : s === 'major' ? 'warn' : 'neutral'}`} onClick={() => { setSeverity(s); setStatus('active'); }}>
            <div className="stat-top"><span className="stat-label">{s[0].toUpperCase() + s.slice(1)} – unresolved</span></div>
            <div className="stat-value">{count(s)}</div>
          </button>
        ))}
        <div className="stat"><div className="stat-top"><span className="stat-label">Resolved (all time)</span></div><div className="stat-value">{data.defects.filter((d) => d.status === 'resolved').length}</div></div>
      </div>
      <Card>
        <div className="toolbar">
          <Select label="Status" value={status} onChange={setStatus} options={[
            { value: 'active', label: 'Not resolved' }, { value: 'open', label: 'Open (no work order)' },
            { value: 'in-workorder', label: 'In work order' }, { value: 'resolved', label: 'Resolved' }, { value: 'all', label: 'All' }]} />
          <Select label="Severity" value={severity} onChange={setSeverity} options={[
            { value: 'all', label: 'Any severity' }, { value: 'critical', label: 'Critical' }, { value: 'major', label: 'Major' }, { value: 'minor', label: 'Minor' }]} />
        </div>
        {rows.length === 0 ? <Empty icon={<TriangleAlert size={32} />} title="No defects here">Nothing matches the current filters.</Empty> : (
          <div className="defect-list">
            {rows.map((d) => {
              const v = byId(data.vehicles, d.vehicleId);
              return (
                <article key={d.id} className={`defect sev-${d.severity} clickable`} onClick={() => navigate(`/defects/${d.id}`)}>
                  <div className="defect-main">
                    <div className="row gap-sm wrap"><Badge value={d.severity} /><Badge value={d.status} /><span className="small muted">{fmtDate(d.date)} ({relDays(d.date)})</span></div>
                    <h3>{d.item}</h3>
                    <p>{d.description}</p>
                    <div className="small muted">{v ? `${v.rego} · ${v.name}` : 'Unknown vehicle'}{d.driverId && <> · reported by {byId(data.drivers, d.driverId)?.name}</>}{d.checkId && <> · from pre-start</>}</div>
                  </div>
                  <span className="chevron">›</span>
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

function DefectFields({ d, set }: { d: Defect; set: <K extends keyof Defect>(k: K, v: Defect[K]) => void }) {
  const { data } = useStore();
  return (
    <>
      <Field label="Vehicle">
        <select className="input" value={d.vehicleId} onChange={(e) => set('vehicleId', e.target.value)}>
          {data.vehicles.map((v) => <option key={v.id} value={v.id}>{v.rego} · {v.name}</option>)}
        </select>
      </Field>
      <Field label="Reported by">
        <select className="input" value={d.driverId ?? ''} onChange={(e) => set('driverId', e.target.value || undefined)}>
          <option value="">Workshop / other</option>
          {data.drivers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
      <Field label="Component"><input className="input" list="components" required value={d.item} onChange={(e) => set('item', e.target.value)} />
        <datalist id="components">{data.settings.checklist.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <Field label="Severity">
        <select className="input" value={d.severity} onChange={(e) => set('severity', e.target.value as Severity)}>
          <option value="minor">Minor – fix at next service</option><option value="major">Major – fix soon</option><option value="critical">Critical – do not operate</option>
        </select>
      </Field>
      <Field label="Date"><input className="input" type="date" value={d.date} onChange={(e) => set('date', e.target.value)} /></Field>
      <Field label="Description" span><textarea className="input" rows={3} required value={d.description} onChange={(e) => set('description', e.target.value)} /></Field>
    </>
  );
}

export function NewDefect() {
  const { data, upsert } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [d, setD] = useState<Defect>({
    id: uid(), vehicleId: params.get('vehicle') ?? data.vehicles[0]?.id ?? '', date: todayISO(), item: data.settings.checklist[0] ?? '',
    description: '', severity: 'major', status: 'open',
  });
  const set = <K extends keyof Defect>(k: K, v: Defect[K]) => setD((p) => ({ ...p, [k]: v }));
  return (
    <>
      <PageHeader title="Report a defect" subtitle="Critical defects mark the vehicle as needing action until they're fixed." />
      <EditCard title="Defect details" submitLabel="Report defect" onCancel={() => navigate(-1)} onSubmit={() => {
        upsert('defects', d);
        if (d.severity === 'critical') {
          const v = byId(data.vehicles, d.vehicleId);
          if (v && v.status === 'active') upsert('vehicles', { ...v, status: 'off-road' });
        }
        navigate(`/defects/${d.id}`);
      }}>
        <DefectFields d={d} set={set} />
        {d.severity === 'critical' && <p className="small tone-text-bad span-2">The vehicle will be marked off-road until the defect is resolved.</p>}
      </EditCard>
    </>
  );
}

export function DefectDetail() {
  const { id } = useParams();
  const { data, upsert, remove, createWorkOrderFromDefect } = useStore();
  const perm = usePermissions();
  const navigate = useNavigate();
  const d = byId(data.defects, id);
  const [draft, setDraft] = useState<Defect | null>(null);
  if (!d) return <Empty title="Defect not found"><Link to="/defects" className="link">Back to defects</Link></Empty>;
  const v = byId(data.vehicles, d.vehicleId);
  const wo = byId(data.workOrders, d.workOrderId);
  const check = byId(data.checks, d.checkId);
  const ncrs = data.ncrs.filter((n) => n.defectId === d.id);
  const reporter = byId(data.drivers, d.driverId);
  const canEdit = perm.canWrite('defects');
  const repeats = data.defects.filter((x) => x.id !== d.id && x.vehicleId === d.vehicleId && x.item === d.item);
  const set = <K extends keyof Defect>(k: K, val: Defect[K]) => setDraft((p) => (p ? { ...p, [k]: val } : p));

  return (
    <ItemPage
      entity={{ type: 'defect', id: d.id }}
      back={{ to: '/defects', label: 'All defects' }}
      icon={<TriangleAlert size={28} />}
      accent={d.severity === 'critical' ? 'red' : d.severity === 'major' ? 'amber' : 'blue'}
      eyebrow={<>Defect · {v?.rego ?? 'Unknown vehicle'}</>}
      title={d.item}
      subtitle={<>Reported {fmtDate(d.date)} ({relDays(d.date)}) by {reporter?.name ?? 'workshop'}</>}
      badges={<><Badge value={d.severity} /><Badge value={d.status} />{repeats.length > 0 && <span className="badge tone-warn">Repeat defect ×{repeats.length + 1}</span>}</>}
      actions={<>
        {canEdit && !draft && <button className="btn" onClick={() => setDraft(d)}>Edit</button>}
        {d.status === 'open' && perm.canWrite('workOrders') && <button className="btn btn-primary" onClick={() => navigate(`/work-orders/${createWorkOrderFromDefect(d).id}`)}><Wrench size={16} /> Create work order</button>}
        {perm.canWrite('ncrs') && <Link className="btn" to={`/ncr/new?defect=${d.id}`}><ShieldAlert size={16} /> Raise NCR</Link>}
        {d.status !== 'resolved' && canEdit && <button className="btn" onClick={() => upsert('defects', { ...d, status: 'resolved' })}><CheckCircle2 size={16} /> Mark resolved</button>}
        {perm.canDelete && <button className="icon-btn" title="Delete" onClick={() => { remove('defects', d.id); navigate('/defects'); }}>✕</button>}
      </>}
      tabs={[{
        id: 'overview', label: 'Overview', icon: <LayoutGrid size={15} />, render: () => (
          <div className="stack">
            {draft && <EditCard title="Edit defect" onCancel={() => setDraft(null)} onSubmit={() => { upsert('defects', draft); setDraft(null); }}><DefectFields d={draft} set={set} /></EditCard>}
            {repeats.length > 0 && <div className="banner tone-warn">This component has failed {repeats.length + 1} times on {v?.rego}. Consider raising an NCR to find the root cause.</div>}
            <div className="grid-2">
              <Card title="What was found"><p className="prose">{d.description}</p></Card>
              <Card title="Linked records">
                <ul className="list">
                  {v && <li><span>Vehicle</span><Link className="link" to={`/vehicles/${v.id}`}>{v.rego} · {v.name}</Link></li>}
                  {check && <li><span>Pre-start check</span><Link className="link" to={`/checks/${check.id}`}>{fmtDate(check.date)}</Link></li>}
                  {wo && <li><span>Work order</span><Link className="link" to={`/work-orders/${wo.id}`}>#{wo.number} {wo.title}</Link></li>}
                  {ncrs.map((n) => <li key={n.id}><span>NCR</span><Link className="link" to={`/ncr/${n.id}`}>NCR-{n.number}</Link></li>)}
                  {reporter && <li><span>Reported by</span><Link className="link" to={`/drivers/${reporter.id}`}>{reporter.name}</Link></li>}
                </ul>
              </Card>
            </div>
            {repeats.length > 0 && (
              <Card title="Previous occurrences">
                <ul className="list">{repeats.map((r) => <li key={r.id}><Link className="link" to={`/defects/${r.id}`}>{fmtDate(r.date)} – {r.description}</Link><Badge value={r.status} /></li>)}</ul>
              </Card>
            )}
          </div>
        ),
      }]}
    />
  );
}
