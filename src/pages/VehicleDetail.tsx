import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Gauge, Pencil, Trash2 } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store';
import { Badge, Card, Empty, Field, HealthDot, Modal, PageHeader, Progress, StatCard, confirmAction } from '../components/ui';
import { byId, fmtDate, fmtMoney, fmtNum, serviceDue, vehicleHealth, workOrderCost } from '../lib/utils';
import { fuelEfficiency } from './FuelLog';
import { VehicleForm } from './Vehicles';

export default function VehicleDetail() {
  const { id } = useParams();
  const { data, remove, upsert } = useStore();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [reading, setReading] = useState(false);
  const v = byId(data.vehicles, id);
  const cur = data.settings.currency;

  const stats = useMemo(() => {
    if (!v) return null;
    const wos = data.workOrders.filter((w) => w.vehicleId === v.id);
    const maint = wos.filter((w) => w.status === 'completed').reduce((s, w) => s + workOrderCost(w, data).total, 0);
    const fuel = data.fuel.filter((f) => f.vehicleId === v.id);
    const fuelCost = fuel.reduce((s, f) => s + f.cost, 0);
    return { wos, maint, fuel, fuelCost, eff: fuelEfficiency(fuel) };
  }, [data, v]);

  if (!v || !stats) return <Empty title="Asset not found"><Link to="/vehicles" className="link">Back to vehicles</Link></Empty>;

  const h = vehicleHealth(v, data);
  const schedules = data.schedules.filter((s) => s.vehicleId === v.id).map((s) => serviceDue(s, v));
  const defects = data.defects.filter((d) => d.vehicleId === v.id);
  const checks = data.checks.filter((c) => c.vehicleId === v.id);
  const driver = byId(data.drivers, v.driverId);
  const fuelChart = [...stats.fuel].sort((a, b) => a.date.localeCompare(b.date)).map((f) => ({ date: fmtDate(f.date), cost: f.cost, litres: f.litres }));

  const del = () => {
    if (confirmAction(`Delete ${v.rego} and all of its history? This cannot be undone.`)) {
      remove('vehicles', v.id);
      navigate('/vehicles');
    }
  };

  return (
    <>
      <Link to="/vehicles" className="link small back"><ArrowLeft size={14} /> All vehicles</Link>
      <PageHeader
        title={`${v.rego} · ${v.name}`}
        subtitle={<span className="row gap-sm wrap"><HealthDot health={h.health} /> {v.year} {v.make} {v.model} · {v.type} · {v.depot} <Badge value={v.status} /></span>}
        actions={<>
          <button className="btn" onClick={() => setReading(true)}><Gauge size={16} /> Update reading</button>
          <button className="btn" onClick={() => setEditing(true)}><Pencil size={16} /> Edit</button>
          <button className="btn btn-danger-ghost" onClick={del} aria-label="Delete asset"><Trash2 size={16} /></button>
        </>} />

      {h.reasons.length > 0 && (
        <div className={`banner tone-${h.health === 'red' ? 'bad' : 'warn'}`}>
          <strong>{h.health === 'red' ? 'Action required' : 'Attention soon'}:</strong> {h.reasons.join(' · ')}
        </div>
      )}

      <div className="stats">
        <StatCard label={v.hours ? 'Engine hours' : 'Odometer'} value={v.hours ? `${fmtNum(v.hours)} h` : `${fmtNum(v.odometer)} km`} />
        <StatCard label="Maintenance spend" value={fmtMoney(stats.maint, cur)} hint={`${stats.wos.filter((w) => w.status === 'completed').length} completed jobs`} />
        <StatCard label="Fuel spend" value={fmtMoney(stats.fuelCost, cur)} hint={stats.eff ? `${fmtNum(stats.eff, 1)} L/100 km average` : 'Not enough data'} />
        <StatCard label="Driver" value={driver?.name ?? '—'} hint={driver ? `Licence ${driver.licenceClass}` : 'Unassigned'} />
      </div>

      <div className="grid-2">
        <Card title="Details">
          <dl className="details">
            <dt>VIN / serial</dt><dd>{v.vin || '—'}</dd>
            <dt>Fuel</dt><dd>{v.fuelType}</dd>
            <dt>Registration expiry</dt><dd>{fmtDate(v.regoExpiry)}</dd>
            <dt>Insurance expiry</dt><dd>{fmtDate(v.insuranceExpiry)}</dd>
            {v.notes && <><dt>Notes</dt><dd>{v.notes}</dd></>}
          </dl>
        </Card>
        <Card title="Service schedules" actions={<Link to={`/maintenance?vehicle=${v.id}`} className="link small">Manage</Link>}>
          <ul className="list">
            {schedules.map((d) => (
              <li key={d.schedule.id} className="col">
                <div className="row between"><span>{d.schedule.name}</span><Badge value={d.state} /></div>
                <Progress value={d.progress} tone={d.state === 'overdue' ? 'bad' : d.state === 'due-soon' ? 'warn' : 'good'} />
                <span className="small muted">{d.label}{d.nextDate ? ` · next by ${fmtDate(d.nextDate)}` : ''}</span>
              </li>
            ))}
            {schedules.length === 0 && <li className="muted">No schedules for this asset.</li>}
          </ul>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Work order history" actions={<Link to={`/work-orders?new=1&vehicle=${v.id}`} className="link small">New work order</Link>}>
          <ul className="list">
            {stats.wos.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8).map((w) => (
              <li key={w.id}>
                <div>
                  <Link className="strong" to={`/work-orders?open=${w.id}`}>#{w.number} {w.title}</Link>
                  <div className="small muted">{fmtDate(w.completedAt ?? w.dueDate)} · {fmtMoney(workOrderCost(w, data).total, cur)}</div>
                </div>
                <Badge value={w.status} />
              </li>
            ))}
            {stats.wos.length === 0 && <li className="muted">No work orders yet.</li>}
          </ul>
        </Card>
        <Card title="Defects & pre-start checks">
          <ul className="list">
            {defects.slice(0, 4).map((d) => (
              <li key={d.id}>
                <div>{d.item}<div className="small muted">{fmtDate(d.date)} · {d.description}</div></div>
                <div className="row gap-sm"><Badge value={d.severity} /><Badge value={d.status} /></div>
              </li>
            ))}
            {checks.slice(0, 4).map((c) => (
              <li key={c.id}>
                <div>Pre-start by {byId(data.drivers, c.driverId)?.name ?? 'Unknown'}<div className="small muted">{fmtDate(c.date)}</div></div>
                <Badge value={c.passed ? 'passed' : 'failed'} />
              </li>
            ))}
            {defects.length + checks.length === 0 && <li className="muted">Nothing reported.</li>}
          </ul>
        </Card>
      </div>

      {fuelChart.length > 1 && (
        <Card title="Fuel cost per fill">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={fuelChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} minTickGap={30} />
              <YAxis stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} width={56} tickFormatter={(x) => fmtMoney(x, cur)} />
              <Tooltip formatter={(x) => fmtMoney(Number(x), cur)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
              <Line type="monotone" dataKey="cost" name="Cost" stroke="var(--accent)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {editing && <VehicleForm vehicle={v} onClose={() => setEditing(false)} />}
      {reading && <ReadingForm onClose={() => setReading(false)} initialKm={v.odometer} initialHours={v.hours}
        onSave={(km, hours) => upsert('vehicles', { ...v, odometer: km, hours })} />}
    </>
  );
}

function ReadingForm({ initialKm, initialHours, onSave, onClose }: {
  initialKm: number; initialHours: number; onSave: (km: number, h: number) => void; onClose: () => void;
}) {
  const [km, setKm] = useState(initialKm);
  const [hours, setHours] = useState(initialHours);
  return (
    <Modal title="Update meter reading" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="reading-form">Save</button></>}>
      <form id="reading-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave(km, hours); onClose(); }}>
        <Field label="Odometer (km)"><input className="input" type="number" min={0} value={km} onChange={(e) => setKm(Number(e.target.value))} /></Field>
        <Field label="Engine hours"><input className="input" type="number" min={0} value={hours} onChange={(e) => setHours(Number(e.target.value))} /></Field>
        {(km < initialKm || hours < initialHours) && <p className="small tone-text-warn span-2">The new reading is lower than the current one. Double-check before saving.</p>}
      </form>
    </Modal>
  );
}
