import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Plus, TriangleAlert, Wrench } from 'lucide-react';
import { useStore } from '../store';
import type { Defect, DefectStatus, Severity } from '../types';
import { Badge, Card, Empty, Field, Modal, PageHeader, Select } from '../components/ui';
import { byId, fmtDate, relDays, todayISO, uid } from '../lib/utils';

const SEV_RANK: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };

export default function Defects() {
  const { data, upsert, createWorkOrderFromDefect } = useStore();
  const navigate = useNavigate();
  const [status, setStatus] = useState<DefectStatus | 'active' | 'all'>('active');
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => data.defects
    .filter((d) => (status === 'all' || (status === 'active' ? d.status !== 'resolved' : d.status === status))
      && (severity === 'all' || d.severity === severity))
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.date.localeCompare(a.date)), [data.defects, status, severity]);

  return (
    <>
      <PageHeader title="Defects" subtitle="Faults reported by drivers or found in the workshop. Turn them into work orders in one click."
        actions={<button className="btn btn-primary" disabled={!data.vehicles.length} onClick={() => setCreating(true)}><Plus size={16} /> Report defect</button>} />
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
              const wo = byId(data.workOrders, d.workOrderId);
              return (
                <article key={d.id} className={`defect sev-${d.severity}`}>
                  <div className="defect-main">
                    <div className="row gap-sm wrap"><Badge value={d.severity} /><Badge value={d.status} /><span className="small muted">{fmtDate(d.date)} ({relDays(d.date)})</span></div>
                    <h3>{d.item}</h3>
                    <p>{d.description}</p>
                    <div className="small muted">
                      {v ? <Link className="link" to={`/vehicles/${v.id}`}>{v.rego} · {v.name}</Link> : 'Unknown vehicle'}
                      {d.driverId && <> · reported by {byId(data.drivers, d.driverId)?.name}</>}
                      {d.checkId && <> · from pre-start</>}
                    </div>
                  </div>
                  <div className="defect-actions">
                    {d.status === 'open' && (
                      <button className="btn btn-primary btn-sm" onClick={() => navigate(`/work-orders?open=${createWorkOrderFromDefect(d).id}`)}><Wrench size={14} /> Create work order</button>
                    )}
                    {wo && <Link className="btn btn-sm" to={`/work-orders?open=${wo.id}`}>Work order #{wo.number}</Link>}
                    {d.status !== 'resolved' && (
                      <button className="btn btn-sm" onClick={() => upsert('defects', { ...d, status: 'resolved' })}><CheckCircle2 size={14} /> Mark resolved</button>
                    )}
                    {d.status !== 'resolved' && (
                      <select className="input input-sm" aria-label="Severity" value={d.severity} onChange={(e) => upsert('defects', { ...d, severity: e.target.value as Severity })}>
                        <option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical</option>
                      </select>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>
      {creating && <DefectForm onClose={() => setCreating(false)} />}
    </>
  );
}

function DefectForm({ onClose }: { onClose: () => void }) {
  const { data, upsert } = useStore();
  const [d, setD] = useState<Defect>({
    id: uid(), vehicleId: data.vehicles[0]?.id ?? '', date: todayISO(), item: data.settings.checklist[0] ?? '',
    description: '', severity: 'major', status: 'open',
  });
  const set = <K extends keyof Defect>(k: K, val: Defect[K]) => setD((p) => ({ ...p, [k]: val }));
  return (
    <Modal title="Report a defect" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="defect-form">Report</button></>}>
      <form id="defect-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); upsert('defects', d); onClose(); }}>
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
        <Field label="Description" span><textarea className="input" rows={3} required value={d.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Date"><input className="input" type="date" value={d.date} onChange={(e) => set('date', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}
