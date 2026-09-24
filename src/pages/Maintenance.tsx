import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarClock, Check, Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import type { ServiceSchedule, WorkOrder } from '../types';
import { Badge, Card, Empty, Field, Modal, PageHeader, Progress, Select, confirmAction } from '../components/ui';
import { byId, fmtDate, serviceDue, todayISO, uid, addDays, type DueState } from '../lib/utils';

export default function Maintenance() {
  const { data, upsert, remove, nextWorkOrderNumber } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(params.get('vehicle') ?? 'all');
  const [state, setState] = useState<DueState | 'all'>('all');
  const [editing, setEditing] = useState<ServiceSchedule | null>(null);
  const perm = usePermissions();
  const canEdit = perm.canWrite('schedules');

  const rows = useMemo(() => data.schedules
    .map((s) => ({ v: byId(data.vehicles, s.vehicleId), due: serviceDue(s, byId(data.vehicles, s.vehicleId)) }))
    .filter((r) => r.v && (vehicle === 'all' || r.v.id === vehicle) && (state === 'all' || r.due.state === state))
    .sort((a, b) => b.due.progress - a.due.progress), [data, vehicle, state]);

  const openWO = (s: ServiceSchedule) =>
    data.workOrders.find((w) => w.scheduleId === s.id && w.status !== 'completed');

  const createWO = (s: ServiceSchedule) => {
    const wo: WorkOrder = {
      id: uid(), number: nextWorkOrderNumber(), vehicleId: s.vehicleId, title: s.name, description: 'Scheduled service',
      type: 'Service', priority: 'medium', status: 'open', assignee: '', dueDate: addDays(todayISO(), 3), createdAt: todayISO(),
      labourHours: 2, labourRate: data.settings.labourRate, parts: [], scheduleId: s.id,
    };
    upsert('workOrders', wo);
    navigate(`/work-orders?open=${wo.id}`);
  };

  const markDone = (s: ServiceSchedule) => {
    const v = byId(data.vehicles, s.vehicleId);
    if (!v || !confirmAction(`Mark "${s.name}" as done today at the current reading?`)) return;
    upsert('schedules', { ...s, lastDoneDate: todayISO(), lastDoneKm: v.odometer, lastDoneHours: v.hours });
  };

  const counts = { overdue: 0, 'due-soon': 0, ok: 0 };
  data.schedules.forEach((s) => counts[serviceDue(s, byId(data.vehicles, s.vehicleId)).state]++);

  return (
    <>
      <PageHeader title="Service schedules" subtitle="Plan servicing by kilometres, engine hours or calendar time – whichever comes first."
        actions={canEdit && <button className="btn btn-primary" disabled={!data.vehicles.length}
          onClick={() => setEditing(blankSchedule(vehicle !== 'all' ? vehicle : data.vehicles[0]?.id ?? ''))}><Plus size={16} /> Add schedule</button>} />
      <Card>
        <div className="toolbar">
          <Select label="Vehicle" value={vehicle} onChange={setVehicle}
            options={[{ value: 'all', label: 'All vehicles' }, ...data.vehicles.map((v) => ({ value: v.id, label: `${v.rego} · ${v.name}` }))]} />
          <div className="segmented">
            {(['all', 'overdue', 'due-soon', 'ok'] as const).map((k) => (
              <button key={k} className={state === k ? 'on' : ''} onClick={() => setState(k)}>
                {k === 'all' ? 'All' : k === 'ok' ? `On track (${counts.ok})` : k === 'overdue' ? `Overdue (${counts.overdue})` : `Due soon (${counts['due-soon']})`}
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? <Empty icon={<CalendarClock size={32} />} title="No schedules found" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Vehicle</th><th>Service</th><th>Interval</th><th>Last done</th><th style={{ minWidth: 160 }}>Progress</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map(({ v, due }) => {
                  const s = due.schedule;
                  const wo = openWO(s);
                  return (
                    <tr key={s.id}>
                      <td><Link className="strong" to={`/vehicles/${v!.id}`}>{v!.rego}</Link><div className="small muted">{v!.name}</div></td>
                      <td>{s.name}</td>
                      <td className="small">{[s.intervalKm && `${s.intervalKm.toLocaleString()} km`, s.intervalHours && `${s.intervalHours} h`, s.intervalDays && `${s.intervalDays} days`].filter(Boolean).join(' / ')}</td>
                      <td className="small">{fmtDate(s.lastDoneDate)}{s.intervalKm ? <div className="muted">{s.lastDoneKm.toLocaleString()} km</div> : null}</td>
                      <td><Progress value={due.progress} tone={due.state === 'overdue' ? 'bad' : due.state === 'due-soon' ? 'warn' : 'good'} /><span className="small muted">{due.label}</span></td>
                      <td><Badge value={due.state} /></td>
                      <td>
                        <div className="row gap-xs end">
                          {wo ? <Link className="btn btn-sm" to={`/work-orders?open=${wo.id}`}>#{wo.number}</Link>
                            : perm.canWrite('workOrders') && <button className="btn btn-sm" onClick={() => createWO(s)} title="Create work order"><Wrench size={14} /> Book</button>}
                          {canEdit && <button className="icon-btn" onClick={() => markDone(s)} title="Mark done now"><Check size={16} /></button>}
                          {canEdit && <button className="icon-btn" onClick={() => setEditing(s)} title="Edit"><Pencil size={16} /></button>}
                          {perm.canDelete && <button className="icon-btn" onClick={() => confirmAction('Delete this schedule?') && remove('schedules', s.id)} title="Delete"><Trash2 size={16} /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <ScheduleForm schedule={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function blankSchedule(vehicleId: string): ServiceSchedule {
  return { id: uid(), vehicleId, name: '', intervalKm: 10_000, intervalDays: 365, lastDoneKm: 0, lastDoneHours: 0, lastDoneDate: todayISO() };
}

function ScheduleForm({ schedule, onClose }: { schedule: ServiceSchedule; onClose: () => void }) {
  const { data, upsert } = useStore();
  const [s, setS] = useState(() => {
    const v = byId(data.vehicles, schedule.vehicleId);
    const isNew = !data.schedules.some((x) => x.id === schedule.id);
    return isNew && v ? { ...schedule, lastDoneKm: v.odometer, lastDoneHours: v.hours } : schedule;
  });
  const set = <K extends keyof ServiceSchedule>(k: K, val: ServiceSchedule[K]) => setS((p) => ({ ...p, [k]: val }));
  const num = (x: string) => (x === '' ? undefined : Number(x));
  const valid = !!(s.intervalKm || s.intervalDays || s.intervalHours);

  return (
    <Modal title={s.name || 'Service schedule'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="sched-form" disabled={!valid}>Save</button></>}>
      <form id="sched-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); upsert('schedules', s); onClose(); }}>
        <Field label="Vehicle" span>
          <select className="input" value={s.vehicleId} onChange={(e) => set('vehicleId', e.target.value)}>
            {data.vehicles.map((v) => <option key={v.id} value={v.id}>{v.rego} · {v.name}</option>)}
          </select>
        </Field>
        <Field label="Service name" span><input className="input" required value={s.name} placeholder="e.g. Oil & filter service" onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Every … km"><input className="input" type="number" min={0} value={s.intervalKm ?? ''} onChange={(e) => set('intervalKm', num(e.target.value))} /></Field>
        <Field label="Every … engine hours"><input className="input" type="number" min={0} value={s.intervalHours ?? ''} onChange={(e) => set('intervalHours', num(e.target.value))} /></Field>
        <Field label="Every … days"><input className="input" type="number" min={0} value={s.intervalDays ?? ''} onChange={(e) => set('intervalDays', num(e.target.value))} /></Field>
        <Field label="Last done on"><input className="input" type="date" required value={s.lastDoneDate} onChange={(e) => set('lastDoneDate', e.target.value)} /></Field>
        <Field label="Last done at (km)"><input className="input" type="number" min={0} value={s.lastDoneKm} onChange={(e) => set('lastDoneKm', Number(e.target.value))} /></Field>
        <Field label="Last done at (hours)"><input className="input" type="number" min={0} value={s.lastDoneHours} onChange={(e) => set('lastDoneHours', Number(e.target.value))} /></Field>
        {!valid && <p className="small tone-text-warn span-2">Set at least one interval.</p>}
      </form>
    </Modal>
  );
}
