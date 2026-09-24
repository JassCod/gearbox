import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Award, ClipboardCheck, IdCard, LayoutGrid, Mail, Pencil, Phone, Plus, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import type { Driver } from '../types';
import { Badge, Card, Empty, Field, PageHeader, SearchInput, confirmAction } from '../components/ui';
import { EditCard, ItemPage } from '../components/ItemPage';
import { addDays, byId, daysUntil, fmtDate, fmtNum, relDays, todayISO, uid } from '../lib/utils';

const expiryState = (iso: string) => { const n = daysUntil(iso); return n < 0 ? 'overdue' : n <= 30 ? 'due-soon' : 'ok'; };
const toneOf = (iso: string) => ({ overdue: 'bad', 'due-soon': 'warn', ok: 'good' } as const)[expiryState(iso)];
const initials = (name: string) => name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();

function docsOf(d: Driver): [string, string][] {
  return [['Licence', d.licenceExpiry], ['Medical', d.medicalExpiry], ...d.trainings.map((t) => [t.name, t.expiry] as [string, string])];
}

export default function Drivers() {
  const { data } = useStore();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const perm = usePermissions();
  const rows = useMemo(() => data.drivers.filter((d) => {
    const s = q.toLowerCase();
    return !s || [d.name, d.email, d.phone, d.depot].some((f) => f.toLowerCase().includes(s));
  }), [data.drivers, q]);

  return (
    <>
      <PageHeader title="Drivers" subtitle="Licences, medicals and training tickets – with expiry reminders."
        actions={perm.canWrite('drivers') && <Link className="btn btn-primary" to="/drivers/new"><Plus size={16} /> Add driver</Link>} />
      <div className="toolbar"><SearchInput value={q} onChange={setQ} placeholder="Search drivers…" /></div>
      {rows.length === 0 ? <Card><Empty icon={<Users size={32} />} title="No drivers found" /></Card> : (
        <div className="driver-grid">
          {rows.map((d) => {
            const docs = docsOf(d);
            const worst = docs.some(([, e]) => daysUntil(e) < 0) ? 'overdue' : docs.some(([, e]) => daysUntil(e) <= 30) ? 'due-soon' : 'ok';
            const checks = data.checks.filter((c) => c.driverId === d.id);
            const vehicles = data.vehicles.filter((v) => v.driverId === d.id);
            return (
              <Link key={d.id} to={`/drivers/${d.id}`} className="card driver-card">
                <div className="row between">
                  <div className="row gap-sm">
                    <span className={`avatar ring-${worst}`}>{initials(d.name)}</span>
                    <div><strong>{d.name}</strong><div className="small muted">{d.depot} · Licence {d.licenceClass}</div></div>
                  </div>
                  <Badge value={worst} label={worst === 'ok' ? 'Compliant' : worst === 'overdue' ? 'Expired docs' : 'Expiring'} />
                </div>
                <div className="doc-pills">
                  {docs.map(([name, exp]) => <span key={name} className={`doc-pill tone-${toneOf(exp)}`} title={`${name}: ${fmtDate(exp)}`}>{name}</span>)}
                </div>
                <div className="small muted">
                  {vehicles.length ? `Drives ${vehicles.map((v) => v.rego).join(', ')}` : 'No assigned vehicle'} · {checks.length} pre-starts
                  {checks.length > 0 && ` · ${Math.round((checks.filter((c) => c.passed).length / checks.length) * 100)}% pass`}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function DriverFields({ d, set }: { d: Driver; set: <K extends keyof Driver>(k: K, v: Driver[K]) => void }) {
  const { data } = useStore();
  return (
    <>
      <Field label="Full name"><input className="input" required value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Depot">
        <select className="input" value={d.depot} onChange={(e) => set('depot', e.target.value)}>{data.settings.depots.map((x) => <option key={x}>{x}</option>)}</select>
      </Field>
      <Field label="Phone"><input className="input" type="tel" value={d.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
      <Field label="Email"><input className="input" type="email" value={d.email} onChange={(e) => set('email', e.target.value)} /></Field>
      <Field label="Licence class"><input className="input" value={d.licenceClass} onChange={(e) => set('licenceClass', e.target.value)} /></Field>
      <Field label="Licence expiry"><input className="input" type="date" required value={d.licenceExpiry} onChange={(e) => set('licenceExpiry', e.target.value)} /></Field>
      <Field label="Medical expiry"><input className="input" type="date" required value={d.medicalExpiry} onChange={(e) => set('medicalExpiry', e.target.value)} /></Field>
    </>
  );
}

export function NewDriver() {
  const { data, upsert } = useStore();
  const navigate = useNavigate();
  const [d, setD] = useState<Driver>({
    id: uid(), name: '', phone: '', email: '', licenceClass: 'C', licenceExpiry: addDays(todayISO(), 365),
    medicalExpiry: addDays(todayISO(), 365), depot: data.settings.depots[0] ?? '', trainings: [],
  });
  const set = <K extends keyof Driver>(k: K, v: Driver[K]) => setD((x) => ({ ...x, [k]: v }));
  return (
    <>
      <PageHeader title="Add a driver" subtitle="Training tickets and documents can be added on the driver's page." />
      <EditCard title="Driver details" submitLabel="Create driver" onCancel={() => navigate('/drivers')} onSubmit={() => { upsert('drivers', d); navigate(`/drivers/${d.id}`); }}>
        <DriverFields d={d} set={set} />
      </EditCard>
    </>
  );
}

export function DriverDetail() {
  const { id } = useParams();
  const { data, upsert, remove } = useStore();
  const perm = usePermissions();
  const navigate = useNavigate();
  const d = byId(data.drivers, id);
  const [draft, setDraft] = useState<Driver | null>(null);
  const [training, setTraining] = useState({ name: '', expiry: addDays(todayISO(), 365) });
  if (!d) return <Empty title="Driver not found"><Link to="/drivers" className="link">Back to drivers</Link></Empty>;
  const canEdit = perm.canWrite('drivers');
  const docs = docsOf(d);
  const expired = docs.filter(([, e]) => daysUntil(e) < 0).length;
  const expiring = docs.filter(([, e]) => daysUntil(e) >= 0 && daysUntil(e) <= 30).length;
  const vehicles = data.vehicles.filter((v) => v.driverId === d.id);
  const checks = data.checks.filter((c) => c.driverId === d.id).sort((a, b) => b.date.localeCompare(a.date));
  const defects = data.defects.filter((x) => x.driverId === d.id);
  const ncrs = data.ncrs.filter((n) => n.driverId === d.id);
  const passRate = checks.length ? Math.round((checks.filter((c) => c.passed).length / checks.length) * 100) : null;
  const set = <K extends keyof Driver>(k: K, v: Driver[K]) => setDraft((x) => (x ? { ...x, [k]: v } : x));

  return (
    <ItemPage
      entity={{ type: 'driver', id: d.id }}
      back={{ to: '/drivers', label: 'All drivers' }}
      icon={<span className="hero-initials">{initials(d.name)}</span>}
      accent={expired ? 'red' : expiring ? 'amber' : 'teal'}
      eyebrow={<>Driver · {d.depot}</>}
      title={d.name}
      subtitle={<span className="row gap-sm wrap">{d.phone && <a className="link-light" href={`tel:${d.phone}`}><Phone size={13} /> {d.phone}</a>}{d.email && <a className="link-light" href={`mailto:${d.email}`}><Mail size={13} /> {d.email}</a>}</span>}
      badges={<><span className="badge tone-neutral">Licence {d.licenceClass}</span><Badge value={expired ? 'overdue' : expiring ? 'due-soon' : 'ok'} label={expired ? `${expired} expired` : expiring ? `${expiring} expiring` : 'Fully compliant'} /></>}
      actions={<>
        {canEdit && !draft && <button className="btn" onClick={() => setDraft(d)}><Pencil size={16} /> Edit</button>}
        {perm.canDelete && <button className="icon-btn" title="Delete" onClick={() => { if (confirmAction(`Remove ${d.name}?`)) { remove('drivers', d.id); navigate('/drivers'); } }}><Trash2 size={16} /></button>}
      </>}
      stats={[
        { label: 'Licence', value: fmtDate(d.licenceExpiry), hint: relDays(d.licenceExpiry), tone: toneOf(d.licenceExpiry) },
        { label: 'Medical', value: fmtDate(d.medicalExpiry), hint: relDays(d.medicalExpiry), tone: toneOf(d.medicalExpiry) },
        { label: 'Pre-starts', value: checks.length, hint: passRate !== null ? `${passRate}% passed` : 'None yet' },
        { label: 'Defects reported', value: defects.length, hint: 'good safety culture 👍' },
      ]}
      tabs={[
        {
          id: 'overview', label: 'Overview', icon: <LayoutGrid size={15} />, render: () => (
            <div className="stack">
              {draft && <EditCard title="Edit driver" onCancel={() => setDraft(null)} onSubmit={() => { upsert('drivers', draft); setDraft(null); }}><DriverFields d={draft} set={set} /></EditCard>}
              <div className="grid-2">
                <Card title="Compliance timeline">
                  <ul className="expiry-bars">
                    {docs.map(([name, exp]) => {
                      const n = daysUntil(exp);
                      return (
                        <li key={name}>
                          <div className="row between small"><span>{name}</span><span className={`tone-text-${toneOf(exp)}`}>{fmtDate(exp)} · {relDays(exp)}</span></div>
                          <div className="bar-track"><div className={`bar-fill tone-${toneOf(exp)}`} style={{ width: `${Math.max(3, Math.min(100, (n / 365) * 100))}%` }} /></div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
                <Card title="Assigned vehicles">
                  <ul className="list">
                    {vehicles.map((v) => <li key={v.id}><Link className="link" to={`/vehicles/${v.id}`}>{v.rego} · {v.name}</Link><span className="small muted">{v.year} {v.make}</span></li>)}
                    {vehicles.length === 0 && <li className="muted">No vehicle assigned.</li>}
                  </ul>
                </Card>
              </div>
            </div>
          ),
        },
        {
          id: 'training', label: 'Licences & training', icon: <Award size={15} />, count: d.trainings.length, render: () => (
            <div className="grid-side">
              <Card title="Training & tickets">
                <ul className="list">
                  <li><span><IdCard size={14} /> Driver licence ({d.licenceClass})</span><Badge value={expiryState(d.licenceExpiry)} label={fmtDate(d.licenceExpiry)} /></li>
                  <li><span><ShieldCheck size={14} /> Medical certificate</span><Badge value={expiryState(d.medicalExpiry)} label={fmtDate(d.medicalExpiry)} /></li>
                  {d.trainings.map((t, i) => (
                    <li key={i}><span><Award size={14} /> {t.name}</span>
                      <span className="row gap-sm"><Badge value={expiryState(t.expiry)} label={fmtDate(t.expiry)} />
                        {canEdit && <button className="icon-btn" aria-label="Remove" onClick={() => upsert('drivers', { ...d, trainings: d.trainings.filter((_, j) => j !== i) })}><X size={14} /></button>}</span></li>
                  ))}
                </ul>
              </Card>
              {canEdit && (
                <form className="card upload-card" onSubmit={(e) => { e.preventDefault(); if (training.name.trim()) { upsert('drivers', { ...d, trainings: [...d.trainings, { name: training.name.trim(), expiry: training.expiry }] }); setTraining({ name: '', expiry: addDays(todayISO(), 365) }); } }}>
                  <h2><Plus size={16} /> Add training</h2>
                  <label className="field"><span>Course / ticket</span><input className="input" required value={training.name} onChange={(e) => setTraining({ ...training, name: e.target.value })} placeholder="e.g. Load restraint" /></label>
                  <label className="field"><span>Expires</span><input className="input" type="date" required value={training.expiry} onChange={(e) => setTraining({ ...training, expiry: e.target.value })} /></label>
                  <button className="btn btn-primary btn-block">Add</button>
                  <p className="small muted">Tip: upload the certificate under Documents with the same expiry date.</p>
                </form>
              )}
            </div>
          ),
        },
        {
          id: 'activity', label: 'Checks & defects', icon: <ClipboardCheck size={15} />, render: () => (
            <div className="grid-2">
              <Card title="Pre-start checks">
                <ul className="list">
                  {checks.slice(0, 15).map((c) => <li key={c.id}><Link className="link" to={`/checks/${c.id}`}>{fmtDate(c.date)} · {byId(data.vehicles, c.vehicleId)?.rego} · {fmtNum(c.odometer)} km</Link><Badge value={c.passed ? 'passed' : 'failed'} /></li>)}
                  {checks.length === 0 && <li className="muted">No checks yet.</li>}
                </ul>
              </Card>
              <Card title="Defects & NCRs">
                <ul className="list">
                  {defects.map((x) => <li key={x.id}><Link className="link" to={`/defects/${x.id}`}>{x.item} – {byId(data.vehicles, x.vehicleId)?.rego}</Link><Badge value={x.status} /></li>)}
                  {ncrs.map((n) => <li key={n.id}><Link className="link" to={`/ncr/${n.id}`}>NCR-{n.number} {n.title}</Link><Badge value={n.status} /></li>)}
                  {defects.length + ncrs.length === 0 && <li className="muted">Nothing reported.</li>}
                </ul>
              </Card>
            </div>
          ),
        },
      ]}
    />
  );
}
