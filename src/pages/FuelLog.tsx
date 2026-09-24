import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Download, Fuel, Plus, Trash2, X } from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import type { FuelEntry } from '../types';
import { Card, Empty, Field, PageHeader, Select, StatCard, confirmAction } from '../components/ui';
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
  const { data, remove } = useStore();
  const [params, setParams] = useSearchParams();
  const [vehicle, setVehicle] = useState(params.get('vehicle') ?? 'all');
  const adding = params.get('add') === '1';
  const setAdding = (on: boolean) => { const n = new URLSearchParams(params); if (on) n.set('add', '1'); else n.delete('add'); setParams(n, { replace: true }); };
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
          {perm.canWrite('fuel') && !adding && <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Add fill</button>}
        </>} />
      {adding && <QuickFill defaultVehicle={vehicle !== 'all' ? vehicle : params.get('vehicle') ?? undefined} onDone={() => setAdding(false)} />}
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
              <thead><tr><th>Date</th><th>Vehicle</th><th>Station</th><th className="num">Odometer</th><th className="num">Litres</th><th className="num">Cost</th><th className="num">$/L</th><th></th></tr></thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id}>
                    <td>{fmtDate(f.date)}</td><td className="strong">{byId(data.vehicles, f.vehicleId)?.rego}</td><td>{f.station}</td>
                    <td className="num">{f.odometer ? fmtNum(f.odometer) : '—'}</td><td className="num">{fmtNum(f.litres)}</td>
                    <td className="num">{fmtMoney(f.cost, cur)}</td><td className="num">{f.litres ? (f.cost / f.litres).toFixed(2) : '—'}</td>
                    <td>{perm.canDelete && <button className="icon-btn" aria-label="Delete fill" onClick={() => confirmAction('Delete this fill?') && remove('fuel', f.id)}><Trash2 size={15} /></button>}</td>
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

/** Inline "add a fill" panel at the top of the fuel log – fills are quick entries, not pages. */
function QuickFill({ defaultVehicle, onDone }: { defaultVehicle?: string; onDone: () => void }) {
  const { data, upsert } = useStore();
  const first = byId(data.vehicles, defaultVehicle) ?? data.vehicles.find((v) => v.fuelType !== 'None') ?? data.vehicles[0];
  const blank = (vid = first?.id ?? ''): FuelEntry => ({ id: uid(), vehicleId: vid, date: todayISO(), litres: 0, cost: 0, odometer: byId(data.vehicles, vid)?.odometer ?? 0, station: '' });
  const [f, setF] = useState<FuelEntry>(() => blank());
  const [saved, setSaved] = useState(0);
  const set = <K extends keyof FuelEntry>(k: K, v: FuelEntry[K]) => setF((x) => ({ ...x, [k]: v }));
  const stations = [...new Set(data.fuel.map((x) => x.station).filter(Boolean))];
  return (
    <form className="card quick-fill" onSubmit={(e) => { e.preventDefault(); upsert('fuel', f); setSaved((n) => n + 1); setF(blank(f.vehicleId)); }}>
      <div className="row between"><h2><Fuel size={16} /> Add a fuel fill</h2><button type="button" className="icon-btn" onClick={onDone} aria-label="Close"><X size={16} /></button></div>
      <div className="quick-grid">
        <Field label="Vehicle">
          <select className="input" value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value, odometer: byId(data.vehicles, e.target.value)?.odometer ?? 0 })}>
            {data.vehicles.filter((v) => v.fuelType !== 'None').map((v) => <option key={v.id} value={v.id}>{v.rego} · {v.name}</option>)}
          </select>
        </Field>
        <Field label="Date"><input className="input" type="date" required value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Odometer (km)"><input className="input" type="number" min={0} value={f.odometer} onChange={(e) => set('odometer', Number(e.target.value))} /></Field>
        <Field label="Litres"><input className="input" type="number" min={0} step={0.1} required value={f.litres || ''} onChange={(e) => set('litres', Number(e.target.value))} /></Field>
        <Field label="Total cost"><input className="input" type="number" min={0} step={0.01} required value={f.cost || ''} onChange={(e) => set('cost', Number(e.target.value))} /></Field>
        <Field label="Station"><input className="input" list="stations" value={f.station} onChange={(e) => set('station', e.target.value)} />
          <datalist id="stations">{stations.map((x) => <option key={x} value={x} />)}</datalist>
        </Field>
      </div>
      <div className="row between">
        <span className="small muted">{saved > 0 ? <span className="tone-text-good"><Check size={13} /> {saved} fill{saved > 1 ? 's' : ''} saved – add another or close.</span> : f.litres && f.cost ? `${(f.cost / f.litres).toFixed(2)} per litre` : 'The odometer updates the vehicle automatically.'}</span>
        <button className="btn btn-primary"><Plus size={16} /> Save fill</button>
      </div>
    </form>
  );
}
