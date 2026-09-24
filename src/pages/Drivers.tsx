import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, Pencil, Phone, Plus, Trash2, Users, X } from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import type { Driver } from '../types';
import { Badge, Card, Empty, Field, Modal, PageHeader, SearchInput, confirmAction } from '../components/ui';
import { addDays, daysUntil, fmtDate, relDays, todayISO, uid } from '../lib/utils';

function expiryState(iso: string) {
  const n = daysUntil(iso);
  return n < 0 ? 'overdue' : n <= 30 ? 'due-soon' : 'ok';
}

export default function Drivers() {
  const { data, remove } = useStore();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [editing, setEditing] = useState<Driver | null>(null);
  const perm = usePermissions();

  const rows = useMemo(() => data.drivers.filter((d) => {
    const s = q.toLowerCase();
    return !s || [d.name, d.email, d.phone, d.depot].some((f) => f.toLowerCase().includes(s));
  }), [data.drivers, q]);

  return (
    <>
      <PageHeader title="Drivers" subtitle="Licences, medicals and training tickets – with expiry reminders."
        actions={perm.canWrite('drivers') && <button className="btn btn-primary" onClick={() => setEditing({
          id: uid(), name: '', phone: '', email: '', licenceClass: 'C', licenceExpiry: addDays(todayISO(), 365),
          medicalExpiry: addDays(todayISO(), 365), depot: data.settings.depots[0] ?? '', trainings: [],
        })}><Plus size={16} /> Add driver</button>} />
      <div className="toolbar"><SearchInput value={q} onChange={setQ} placeholder="Search drivers…" /></div>
      {rows.length === 0 ? <Card><Empty icon={<Users size={32} />} title="No drivers found" /></Card> : (
        <div className="driver-grid">
          {rows.map((d) => {
            const vehicles = data.vehicles.filter((v) => v.driverId === d.id);
            const docs: [string, string][] = [['Licence', d.licenceExpiry], ['Medical', d.medicalExpiry], ...d.trainings.map((t) => [t.name, t.expiry] as [string, string])];
            const worst = docs.some(([, e]) => daysUntil(e) < 0) ? 'overdue' : docs.some(([, e]) => daysUntil(e) <= 30) ? 'due-soon' : 'ok';
            const checks = data.checks.filter((c) => c.driverId === d.id);
            return (
              <Card key={d.id} className="driver-card">
                <div className="row between">
                  <div className="row gap-sm">
                    <span className="avatar">{d.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
                    <div><strong>{d.name}</strong><div className="small muted">{d.depot} · Licence {d.licenceClass}</div></div>
                  </div>
                  <Badge value={worst} label={worst === 'ok' ? 'Compliant' : worst === 'overdue' ? 'Expired docs' : 'Expiring'} />
                </div>
                <div className="small muted row gap-sm wrap">
                  {d.phone && <a className="link row gap-xs" href={`tel:${d.phone}`}><Phone size={12} />{d.phone}</a>}
                  {d.email && <a className="link row gap-xs" href={`mailto:${d.email}`}><Mail size={12} />{d.email}</a>}
                </div>
                <ul className="doc-list">
                  {docs.map(([name, exp]) => (
                    <li key={name}><span>{name}</span><span className={`small tone-text-${expiryState(exp) === 'overdue' ? 'bad' : expiryState(exp) === 'due-soon' ? 'warn' : 'muted'}`}>{fmtDate(exp)} · {relDays(exp)}</span></li>
                  ))}
                </ul>
                <div className="small muted">
                  {vehicles.length ? `Assigned: ${vehicles.map((v) => v.rego).join(', ')}` : 'No assigned vehicle'} · {checks.length} pre-starts
                  {checks.length > 0 && ` (${Math.round((checks.filter((c) => c.passed).length / checks.length) * 100)}% passed)`}
                </div>
                <div className="row gap-xs end">
                  {perm.canWrite('drivers') && <button className="icon-btn" onClick={() => setEditing(d)} aria-label="Edit"><Pencil size={16} /></button>}
                  {perm.canDelete && <button className="icon-btn" onClick={() => confirmAction(`Remove ${d.name}?`) && remove('drivers', d.id)} aria-label="Delete"><Trash2 size={16} /></button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {editing && <DriverForm driver={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function DriverForm({ driver, onClose }: { driver: Driver; onClose: () => void }) {
  const { data, upsert } = useStore();
  const [d, setD] = useState(driver);
  const set = <K extends keyof Driver>(k: K, val: Driver[K]) => setD((x) => ({ ...x, [k]: val }));
  return (
    <Modal title={driver.name || 'New driver'} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="driver-form">Save</button></>}>
      <form id="driver-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); upsert('drivers', d); onClose(); }}>
        <Field label="Full name"><input className="input" required value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Depot">
          <select className="input" value={d.depot} onChange={(e) => set('depot', e.target.value)}>
            {data.settings.depots.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Phone"><input className="input" type="tel" value={d.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Email"><input className="input" type="email" value={d.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Licence class"><input className="input" value={d.licenceClass} onChange={(e) => set('licenceClass', e.target.value)} /></Field>
        <Field label="Licence expiry"><input className="input" type="date" required value={d.licenceExpiry} onChange={(e) => set('licenceExpiry', e.target.value)} /></Field>
        <Field label="Medical expiry"><input className="input" type="date" required value={d.medicalExpiry} onChange={(e) => set('medicalExpiry', e.target.value)} /></Field>
        <div className="span-2 subsection">
          <h3>Training & tickets</h3>
          {d.trainings.map((t, i) => (
            <div key={i} className="row gap-sm">
              <input className="input" placeholder="Course / ticket" value={t.name} required
                onChange={(e) => set('trainings', d.trainings.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input className="input" type="date" value={t.expiry} required
                onChange={(e) => set('trainings', d.trainings.map((x, j) => (j === i ? { ...x, expiry: e.target.value } : x)))} />
              <button type="button" className="icon-btn" onClick={() => set('trainings', d.trainings.filter((_, j) => j !== i))} aria-label="Remove"><X size={14} /></button>
            </div>
          ))}
          <button type="button" className="btn btn-sm" onClick={() => set('trainings', [...d.trainings, { name: '', expiry: addDays(todayISO(), 365) }])}><Plus size={14} /> Add training</button>
        </div>
      </form>
    </Modal>
  );
}
