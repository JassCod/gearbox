import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CalendarClock, Check, History as HistoryIcon, LayoutGrid, Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import type { ServiceSchedule, WorkOrder } from '../types';
import { Badge, Card, Empty, Field, PageHeader, Progress, Select, confirmAction } from '../components/ui';
import { EditCard, ItemPage } from '../components/ItemPage';
import { addDays, byId, fmtDate, fmtMoney, fmtNum, serviceDue, todayISO, uid, workOrderCost, type DueState } from '../lib/utils';

export default function Maintenance() {
  const { data } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(params.get('vehicle') ?? 'all');
  const [state, setState] = useState<DueState | 'all'>('all');
  const perm = usePermissions();

  const rows = useMemo(() => data.schedules
    .map((s) => ({ v: byId(data.vehicles, s.vehicleId), due: serviceDue(s, byId(data.vehicles, s.vehicleId)) }))
    .filter((r) => r.v && (vehicle === 'all' || r.v.id === vehicle) && (state === 'all' || r.due.state === state))
    .sort((a, b) => b.due.progress - a.due.progress), [data, vehicle, state]);

  const counts = { overdue: 0, 'due-soon': 0, ok: 0 };
  data.schedules.forEach((s) => counts[serviceDue(s, byId(data.vehicles, s.vehicleId)).state]++);

  return (
    <>
      <PageHeader title="Service schedules" subtitle="Plan servicing by kilometres, engine hours or calendar time – whichever comes first."
        actions={perm.canWrite('schedules') && <Link className="btn btn-primary" to={`/maintenance/new${vehicle !== 'all' ? `?vehicle=${vehicle}` : ''}`}><Plus size={16} /> Add schedule</Link>} />
      <div className="stats">
        <button className="stat tone-bad" onClick={() => setState('overdue')}><div className="stat-top"><span className="stat-label">Overdue</span></div><div className="stat-value">{counts.overdue}</div></button>
        <button className="stat tone-warn" onClick={() => setState('due-soon')}><div className="stat-top"><span className="stat-label">Due soon</span></div><div className="stat-value">{counts['due-soon']}</div></button>
        <button className="stat tone-good" onClick={() => setState('ok')}><div className="stat-top"><span className="stat-label">On track</span></div><div className="stat-value">{counts.ok}</div></button>
      </div>
      <Card>
        <div className="toolbar">
          <Select label="Vehicle" value={vehicle} onChange={setVehicle}
            options={[{ value: 'all', label: 'All vehicles' }, ...data.vehicles.map((v) => ({ value: v.id, label: `${v.rego} · ${v.name}` }))]} />
          <div className="segmented">
            {(['all', 'overdue', 'due-soon', 'ok'] as const).map((k) => (
              <button key={k} className={state === k ? 'on' : ''} onClick={() => setState(k)}>{k === 'all' ? 'All' : k === 'ok' ? 'On track' : k === 'overdue' ? 'Overdue' : 'Due soon'}</button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? <Empty icon={<CalendarClock size={32} />} title="No schedules found" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Vehicle</th><th>Service</th><th>Interval</th><th>Last done</th><th style={{ minWidth: 180 }}>Progress</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map(({ v, due }) => {
                  const s = due.schedule;
                  return (
                    <tr key={s.id} className="clickable" onClick={() => navigate(`/maintenance/${s.id}`)}>
                      <td><span className="strong">{v!.rego}</span><div className="small muted">{v!.name}</div></td>
                      <td>{s.name}</td>
                      <td className="small">{intervalText(s)}</td>
                      <td className="small">{fmtDate(s.lastDoneDate)}</td>
                      <td><Progress value={due.progress} tone={due.state === 'overdue' ? 'bad' : due.state === 'due-soon' ? 'warn' : 'good'} /><span className="small muted">{due.label}</span></td>
                      <td><Badge value={due.state} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

const intervalText = (s: ServiceSchedule) =>
  [s.intervalKm && `${fmtNum(s.intervalKm)} km`, s.intervalHours && `${s.intervalHours} h`, s.intervalDays && `${s.intervalDays} days`].filter(Boolean).join(' / ') || '—';

function ScheduleFields({ s, set }: { s: ServiceSchedule; set: <K extends keyof ServiceSchedule>(k: K, v: ServiceSchedule[K]) => void }) {
  const { data } = useStore();
  const num = (x: string) => (x === '' ? undefined : Number(x));
  return (
    <>
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
    </>
  );
}

export function NewSchedule() {
  const { data, upsert } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [s, setS] = useState<ServiceSchedule>(() => {
    const v = byId(data.vehicles, params.get('vehicle') ?? undefined) ?? data.vehicles[0];
    return { id: uid(), vehicleId: v?.id ?? '', name: '', intervalKm: 10_000, intervalDays: 365, lastDoneKm: v?.odometer ?? 0, lastDoneHours: v?.hours ?? 0, lastDoneDate: todayISO() };
  });
  const set = <K extends keyof ServiceSchedule>(k: K, val: ServiceSchedule[K]) => setS((p) => ({ ...p, [k]: val }));
  const valid = !!(s.intervalKm || s.intervalDays || s.intervalHours);
  return (
    <>
      <PageHeader title="New service schedule" subtitle="Set at least one interval – the first one reached makes the service due." />
      <EditCard title="Schedule" submitLabel="Create schedule" disabled={!valid} onCancel={() => navigate(-1)} onSubmit={() => { upsert('schedules', s); navigate(`/maintenance/${s.id}`); }}>
        <ScheduleFields s={s} set={set} />
      </EditCard>
    </>
  );
}

function Ring({ value, label, sub, tone }: { value: number; label: string; sub: string; tone: 'good' | 'warn' | 'bad' }) {
  const pct = Math.min(1, Math.max(0, value));
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r={r} className="ring-track" /><circle cx="50" cy="50" r={r} className={`ring-value tone-stroke-${tone}`} strokeDasharray={c} strokeDashoffset={c * (1 - pct)} /></svg>
      <div className="ring-center"><strong>{Math.round(value * 100)}%</strong><span className="small muted">{label}</span></div>
      <div className="small muted center">{sub}</div>
    </div>
  );
}

export function ScheduleDetail() {
  const { id } = useParams();
  const { data, upsert, remove, nextNumber } = useStore();
  const perm = usePermissions();
  const navigate = useNavigate();
  const s = byId(data.schedules, id);
  const [draft, setDraft] = useState<ServiceSchedule | null>(null);
  if (!s) return <Empty title="Schedule not found"><Link to="/maintenance" className="link">Back to schedules</Link></Empty>;
  const v = byId(data.vehicles, s.vehicleId);
  const due = serviceDue(s, v);
  const canEdit = perm.canWrite('schedules');
  const history = data.workOrders.filter((w) => w.scheduleId === s.id).sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));
  const openWo = history.find((w) => w.status !== 'completed');
  const tone = due.state === 'overdue' ? 'bad' : due.state === 'due-soon' ? 'warn' : 'good';
  const set = <K extends keyof ServiceSchedule>(k: K, val: ServiceSchedule[K]) => setDraft((p) => (p ? { ...p, [k]: val } : p));
  const cur = data.settings.currency;

  const book = () => {
    const wo: WorkOrder = {
      id: uid(), number: nextNumber('workOrders'), vehicleId: s.vehicleId, title: s.name, description: 'Scheduled service',
      type: 'Service', priority: due.state === 'overdue' ? 'high' : 'medium', status: 'open', assignee: '', dueDate: addDays(todayISO(), 3), createdAt: todayISO(),
      labourHours: 2, labourRate: data.settings.labourRate, parts: [], scheduleId: s.id,
      tasks: ['Drain and replace engine oil', 'Replace filters', 'Check fluids, belts and hoses', 'Road test'].map((text) => ({ id: uid(), text, done: false })),
    };
    upsert('workOrders', wo);
    navigate(`/work-orders/${wo.id}`);
  };

  return (
    <ItemPage
      entity={{ type: 'schedule', id: s.id }}
      back={{ to: '/maintenance', label: 'All schedules' }}
      icon={<CalendarClock size={28} />}
      accent={tone === 'bad' ? 'red' : tone === 'warn' ? 'amber' : 'teal'}
      eyebrow={<>Service schedule · {v?.rego}</>}
      title={s.name}
      subtitle={<>Every {intervalText(s)} · {v ? <Link className="link-light" to={`/vehicles/${v.id}`}>{v.rego} · {v.name}</Link> : 'Unknown vehicle'}</>}
      badges={<Badge value={due.state} />}
      actions={<>
        {openWo ? <Link className="btn" to={`/work-orders/${openWo.id}`}><Wrench size={16} /> Open job #{openWo.number}</Link>
          : perm.canWrite('workOrders') && <button className="btn btn-primary" onClick={book}><Wrench size={16} /> Book service</button>}
        {canEdit && <button className="btn" onClick={() => v && confirmAction('Mark this service as done today at the current reading?') && upsert('schedules', { ...s, lastDoneDate: todayISO(), lastDoneKm: v.odometer, lastDoneHours: v.hours })}><Check size={16} /> Mark done</button>}
        {canEdit && !draft && <button className="btn" onClick={() => setDraft(s)}><Pencil size={16} /> Edit</button>}
        {perm.canDelete && <button className="icon-btn" title="Delete" onClick={() => { if (confirmAction('Delete this schedule?')) { remove('schedules', s.id); navigate('/maintenance'); } }}><Trash2 size={16} /></button>}
      </>}
      stats={[
        { label: 'Status', value: due.label || '—', tone },
        { label: 'Next due by date', value: due.nextDate ? fmtDate(due.nextDate) : '—' },
        { label: 'Next due at', value: due.nextKm ? `${fmtNum(due.nextKm)} km` : '—' },
        { label: 'Last done', value: fmtDate(s.lastDoneDate), hint: s.intervalKm ? `${fmtNum(s.lastDoneKm)} km` : undefined },
      ]}
      tabs={[
        {
          id: 'overview', label: 'Overview', icon: <LayoutGrid size={15} />, render: () => (
            <div className="stack">
              {draft && <EditCard title="Edit schedule" onCancel={() => setDraft(null)} onSubmit={() => { upsert('schedules', draft); setDraft(null); }}><ScheduleFields s={draft} set={set} /></EditCard>}
              <Card title="How close is the next service?">
                <div className="rings">
                  {s.intervalKm && v && <Ring value={(v.odometer - s.lastDoneKm) / s.intervalKm} label="of km" sub={`${fmtNum(v.odometer - s.lastDoneKm)} / ${fmtNum(s.intervalKm)} km`} tone={tone} />}
                  {s.intervalHours && v && <Ring value={(v.hours - s.lastDoneHours) / s.intervalHours} label="of hours" sub={`${fmtNum(v.hours - s.lastDoneHours)} / ${s.intervalHours} h`} tone={tone} />}
                  {s.intervalDays && <Ring value={due.daysLeft !== undefined ? (s.intervalDays - due.daysLeft) / s.intervalDays : 0} label="of time" sub={`${s.intervalDays - (due.daysLeft ?? 0)} / ${s.intervalDays} days`} tone={tone} />}
                </div>
              </Card>
            </div>
          ),
        },
        {
          id: 'services', label: 'Service history', icon: <HistoryIcon size={15} />, count: history.length, render: () => (
            <Card title="Jobs booked from this schedule">
              {history.length === 0 ? <Empty title="No jobs yet">Book a service to start the history.</Empty> : (
                <table className="table compact">
                  <thead><tr><th>Job</th><th>Status</th><th>Date</th><th>Technician</th><th className="num">Cost</th></tr></thead>
                  <tbody>{history.map((w) => (
                    <tr key={w.id} className="clickable" onClick={() => navigate(`/work-orders/${w.id}`)}><td>#{w.number} {w.title}</td><td><Badge value={w.status} /></td><td>{fmtDate(w.completedAt ?? w.dueDate)}</td><td>{w.assignee || '—'}</td><td className="num">{fmtMoney(workOrderCost(w, data).total, cur)}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </Card>
          ),
        },
      ]}
    />
  );
}
