import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Download, Fuel, LayoutGrid, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import type { FuelEntry } from '../types';
import { Card, Empty, Field, PageHeader, Select, StatCard, confirmAction } from '../components/ui';
import { EditCard, ItemPage } from '../components/ItemPage';
import { byId, downloadCSV, fmtDate, fmtMoney, fmtNum, todayISO, uid, daysUntil } from '../lib/utils';

/** Average L/100 km across consecutive fills (first fill only sets the baseline). */
export function fuelEfficiency(entries: FuelEntry[]) {
  const sorted = entries.filter((e) => e.odometer > 0).sort((a, b) => a.odometer - b.odometer);
  if (sorted.length < 2) return 0;
  const km = sorted[sorted.length - 1].odometer - sorted[0].odometer;
  const litres = sorted.slice(1).reduce((s, e) => s + e.litres, 0);
  return km > 0 ? (litres / km) * 100 : 0;
}

export default function FuelLog() {
  const { data } = useStore();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState('all');
  const [period, setPeriod] = useState('90');
  const cur = data.settings.currency;
  const perm = usePermissions();

  const rows = useMemo(() => data.fuel
    .filter((f) => (vehicle === 'all' || f.vehicleId === vehicle) && (period === 'all' || -daysUntil(f.date) <= Number(period)))
    .sort((a, b) => b.date.localeCompare(a.date)), [data.fuel, vehicle, period]);

  const litres = rows.reduce((s, f) => s + f.litres, 0);
  const cost = rows.reduce((s, f) => s + f.cost, 0);
  const eff = vehicle !== 'all' ? fuelEfficiency(rows) : 0;

  return (
    <>
      <PageHeader title="Fuel log" subtitle="Track fills, spend and fuel economy per vehicle. Odometer readings keep vehicles up to date."
        actions={<>
          <button className="btn" onClick={() => downloadCSV('fuel-log.csv', [['Date', 'Vehicle', 'Litres', 'Cost', 'Odometer', 'Station'],
            ...rows.map((f) => [f.date, byId(data.vehicles, f.vehicleId)?.rego, f.litres, f.cost, f.odometer, f.station])])}><Download size={16} /> Export CSV</button>
          {perm.canWrite('fuel') && <Link className="btn btn-primary" to={`/fuel/new${vehicle !== 'all' ? `?vehicle=${vehicle}` : ''}`}><Plus size={16} /> Add fill</Link>}
        </>} />
      <div className="stats">
        <StatCard label="Fuel spend" value={fmtMoney(cost, cur)} hint={`${rows.length} fills`} />
        <StatCard label="Litres" value={fmtNum(litres)} />
        <StatCard label="Avg price / L" value={litres ? (cost / litres).toFixed(2) : '—'} hint={cur} />
        <StatCard label="Economy" value={eff ? `${fmtNum(eff, 1)} L/100 km` : '—'} hint={vehicle === 'all' ? 'Pick a vehicle to see economy' : undefined} />
      </div>
      <Card>
        <div className="toolbar">
          <Select label="Vehicle" value={vehicle} onChange={setVehicle} options={[{ value: 'all', label: 'All vehicles' },
            ...data.vehicles.filter((v) => v.fuelType !== 'None').map((v) => ({ value: v.id, label: `${v.rego} · ${v.name}` }))]} />
          <Select label="Period" value={period} onChange={setPeriod} options={[{ value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last 12 months' }, { value: 'all', label: 'All time' }]} />
        </div>
        {rows.length === 0 ? <Empty icon={<Fuel size={32} />} title="No fuel entries" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Vehicle</th><th>Station</th><th className="num">Odometer</th><th className="num">Litres</th><th className="num">Cost</th><th className="num">$/L</th></tr></thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id} className="clickable" onClick={() => navigate(`/fuel/${f.id}`)}>
                    <td>{fmtDate(f.date)}</td><td className="strong">{byId(data.vehicles, f.vehicleId)?.rego}</td><td>{f.station}</td>
                    <td className="num">{f.odometer ? fmtNum(f.odometer) : '—'}</td><td className="num">{fmtNum(f.litres)}</td>
                    <td className="num">{fmtMoney(f.cost, cur)}</td><td className="num">{f.litres ? (f.cost / f.litres).toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function FuelFields({ f, set }: { f: FuelEntry; set: <K extends keyof FuelEntry>(k: K, v: FuelEntry[K]) => void }) {
  const { data } = useStore();
  return (
    <>
      <Field label="Vehicle" span>
        <select className="input" value={f.vehicleId} onChange={(e) => { set('vehicleId', e.target.value); set('odometer', byId(data.vehicles, e.target.value)?.odometer ?? 0); }}>
          {data.vehicles.filter((v) => v.fuelType !== 'None').map((v) => <option key={v.id} value={v.id}>{v.rego} · {v.name}</option>)}
        </select>
      </Field>
      <Field label="Date"><input className="input" type="date" required value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
      <Field label="Odometer (km)"><input className="input" type="number" min={0} value={f.odometer} onChange={(e) => set('odometer', Number(e.target.value))} /></Field>
      <Field label="Litres"><input className="input" type="number" min={0} step={0.1} required value={f.litres || ''} onChange={(e) => set('litres', Number(e.target.value))} /></Field>
      <Field label="Total cost"><input className="input" type="number" min={0} step={0.01} required value={f.cost || ''} onChange={(e) => set('cost', Number(e.target.value))} /></Field>
      <Field label="Station" span><input className="input" value={f.station} onChange={(e) => set('station', e.target.value)} /></Field>
    </>
  );
}

export function NewFuel() {
  const { data, upsert } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const first = byId(data.vehicles, params.get('vehicle') ?? undefined) ?? data.vehicles.find((v) => v.fuelType !== 'None') ?? data.vehicles[0];
  const [f, setF] = useState<FuelEntry>({ id: uid(), vehicleId: first?.id ?? '', date: todayISO(), litres: 0, cost: 0, odometer: first?.odometer ?? 0, station: '' });
  const set = <K extends keyof FuelEntry>(k: K, v: FuelEntry[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <>
      <PageHeader title="Add a fuel fill" subtitle="Attach the receipt on the next page under Documents." />
      <EditCard title="Fill details" submitLabel="Save fill" onCancel={() => navigate(-1)} onSubmit={() => { upsert('fuel', f); navigate(`/fuel/${f.id}`); }}>
        <FuelFields f={f} set={set} />
      </EditCard>
    </>
  );
}

export function FuelDetail() {
  const { id } = useParams();
  const { data, upsert, remove } = useStore();
  const perm = usePermissions();
  const navigate = useNavigate();
  const f = byId(data.fuel, id);
  const [draft, setDraft] = useState<FuelEntry | null>(null);
  if (!f) return <Empty title="Fuel fill not found"><Link to="/fuel" className="link">Back to fuel log</Link></Empty>;
  const v = byId(data.vehicles, f.vehicleId);
  const cur = data.settings.currency;
  const fills = data.fuel.filter((x) => x.vehicleId === f.vehicleId && x.odometer > 0).sort((a, b) => a.odometer - b.odometer);
  const prev = [...fills].reverse().find((x) => x.odometer < f.odometer);
  const km = prev ? f.odometer - prev.odometer : 0;
  const economy = km ? (f.litres / km) * 100 : 0;
  const avg = fuelEfficiency(fills);
  const set = <K extends keyof FuelEntry>(k: K, val: FuelEntry[K]) => setDraft((x) => (x ? { ...x, [k]: val } : x));

  return (
    <ItemPage
      entity={{ type: 'fuel', id: f.id }}
      back={{ to: '/fuel', label: 'Fuel log' }}
      icon={<Fuel size={28} />}
      accent="blue"
      eyebrow={<>Fuel fill · {fmtDate(f.date)}</>}
      title={<>{fmtNum(f.litres)} L for {fmtMoney(f.cost, cur)}</>}
      subtitle={<>{v ? <Link className="link-light" to={`/vehicles/${v.id}`}>{v.rego} · {v.name}</Link> : 'Unknown vehicle'} · {f.station || 'Unknown station'}</>}
      actions={<>
        {perm.canWrite('fuel') && !draft && <button className="btn" onClick={() => setDraft(f)}>Edit</button>}
        {perm.canDelete && <button className="icon-btn" title="Delete" onClick={() => { if (confirmAction('Delete this fill?')) { remove('fuel', f.id); navigate('/fuel'); } }}><Trash2 size={16} /></button>}
      </>}
      stats={[
        { label: 'Price per litre', value: f.litres ? (f.cost / f.litres).toFixed(2) : '—', hint: cur },
        { label: 'Odometer', value: f.odometer ? `${fmtNum(f.odometer)} km` : '—' },
        { label: 'Distance since last fill', value: km ? `${fmtNum(km)} km` : '—' },
        { label: 'Economy this tank', value: economy ? `${fmtNum(economy, 1)} L/100 km` : '—', hint: avg ? `vehicle average ${fmtNum(avg, 1)}` : undefined, tone: economy && avg ? (economy > avg * 1.15 ? 'warn' : 'good') : undefined },
      ]}
      tabs={[{
        id: 'overview', label: 'Overview', icon: <LayoutGrid size={15} />, render: () => (
          <div className="stack">
            {draft && <EditCard title="Edit fill" onCancel={() => setDraft(null)} onSubmit={() => { upsert('fuel', draft); setDraft(null); }}><FuelFields f={draft} set={set} /></EditCard>}
            {economy && avg && economy > avg * 1.15 ? <div className="banner tone-warn">This tank used {Math.round((economy / avg - 1) * 100)}% more fuel than usual for {v?.rego}. Worth checking tyre pressures, driving style or a possible leak.</div> : null}
            <Card title="Recent fills for this vehicle">
              <table className="table compact">
                <thead><tr><th>Date</th><th>Station</th><th className="num">Odometer</th><th className="num">Litres</th><th className="num">Cost</th></tr></thead>
                <tbody>{[...fills].reverse().slice(0, 8).map((x) => (
                  <tr key={x.id} className={`clickable ${x.id === f.id ? 'row-current' : ''}`} onClick={() => navigate(`/fuel/${x.id}`)}><td>{fmtDate(x.date)}</td><td>{x.station}</td><td className="num">{fmtNum(x.odometer)}</td><td className="num">{fmtNum(x.litres)}</td><td className="num">{fmtMoney(x.cost, cur)}</td></tr>
                ))}</tbody>
              </table>
            </Card>
          </div>
        ),
      }]}
    />
  );
}
