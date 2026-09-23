import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Plus, Truck } from 'lucide-react';
import { useStore } from '../store';
import type { Vehicle, VehicleType } from '../types';
import { Badge, Card, Empty, Field, HealthDot, Modal, PageHeader, SearchInput, Select } from '../components/ui';
import { byId, downloadCSV, fmtDate, fmtNum, uid, vehicleHealth, addDays, todayISO, type Health } from '../lib/utils';

export const VEHICLE_TYPES: VehicleType[] = ['Truck', 'Van', 'Ute', 'Car', 'Trailer', 'Forklift', 'Excavator'];

export default function Vehicles() {
  const { data } = useStore();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [depot, setDepot] = useState('all');
  const health = (params.get('health') ?? 'all') as Health | 'all';
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [view, setView] = useState<'table' | 'cards'>('table');

  const rows = useMemo(() => data.vehicles
    .map((v) => ({ v, h: vehicleHealth(v, data) }))
    .filter(({ v, h }) => {
      const s = q.toLowerCase();
      return (!s || [v.rego, v.name, v.make, v.model, v.vin].some((f) => f.toLowerCase().includes(s)))
        && (type === 'all' || v.type === type)
        && (depot === 'all' || v.depot === depot)
        && (health === 'all' || h.health === health);
    }), [data, q, type, depot, health]);

  const exportCSV = () => downloadCSV('vehicles.csv', [
    ['Rego', 'Name', 'Make', 'Model', 'Year', 'Type', 'Odometer', 'Hours', 'Depot', 'Status', 'Health', 'Driver', 'Rego expiry', 'Insurance expiry'],
    ...rows.map(({ v, h }) => [v.rego, v.name, v.make, v.model, v.year, v.type, v.odometer, v.hours, v.depot, v.status, h.health,
      byId(data.drivers, v.driverId)?.name, v.regoExpiry, v.insuranceExpiry]),
  ]);

  return (
    <>
      <PageHeader title="Vehicles & assets" subtitle={`${data.vehicles.length} assets across ${data.settings.depots.length} depots`}
        actions={<>
          <button className="btn" onClick={exportCSV}><Download size={16} /> Export CSV</button>
          <button className="btn btn-primary" onClick={() => setEditing(blankVehicle(data.settings.depots[0]))}><Plus size={16} /> Add asset</button>
        </>} />
      <Card>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search rego, name, make, VIN…" />
          <Select label="Type" value={type} onChange={setType} options={[{ value: 'all', label: 'All types' }, ...VEHICLE_TYPES.map((t) => ({ value: t, label: t }))]} />
          <Select label="Depot" value={depot} onChange={setDepot} options={[{ value: 'all', label: 'All depots' }, ...data.settings.depots.map((d) => ({ value: d, label: d }))]} />
          <Select label="Health" value={health} onChange={(h) => { if (h === 'all') params.delete('health'); else params.set('health', h); setParams(params); }}
            options={[{ value: 'all', label: 'Any health' }, { value: 'green', label: 'Green' }, { value: 'amber', label: 'Amber' }, { value: 'red', label: 'Red' }]} />
          <div className="segmented">
            <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table</button>
            <button className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>Cards</button>
          </div>
        </div>

        {rows.length === 0 ? <Empty icon={<Truck size={32} />} title="No assets match">Try clearing the filters or add a new asset.</Empty>
          : view === 'table' ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th></th><th>Rego</th><th>Vehicle</th><th>Type</th><th className="num">Odometer / hours</th><th>Depot</th><th>Driver</th><th>Status</th><th>Rego expiry</th></tr></thead>
                <tbody>
                  {rows.map(({ v, h }) => (
                    <tr key={v.id}>
                      <td><HealthDot health={h.health} title={h.reasons.join('\n') || 'All good'} /></td>
                      <td><Link to={`/vehicles/${v.id}`} className="strong">{v.rego}</Link></td>
                      <td>{v.name}<div className="small muted">{v.year} {v.make} {v.model}</div></td>
                      <td>{v.type}</td>
                      <td className="num">{v.hours ? `${fmtNum(v.hours)} h` : `${fmtNum(v.odometer)} km`}</td>
                      <td>{v.depot}</td>
                      <td>{byId(data.drivers, v.driverId)?.name ?? <span className="muted">—</span>}</td>
                      <td><Badge value={v.status} /></td>
                      <td>{fmtDate(v.regoExpiry)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="vehicle-cards">
              {rows.map(({ v, h }) => (
                <Link key={v.id} to={`/vehicles/${v.id}`} className={`vehicle-card edge-${h.health}`}>
                  <div className="row between"><strong>{v.rego}</strong><Badge value={v.status} /></div>
                  <div>{v.name}</div>
                  <div className="small muted">{v.year} {v.make} {v.model}</div>
                  <div className="small">{v.hours ? `${fmtNum(v.hours)} h` : `${fmtNum(v.odometer)} km`} · {v.depot}</div>
                  <div className={`small tone-text-${h.health === 'red' ? 'bad' : h.health === 'amber' ? 'warn' : 'good'}`}>{h.reasons[0] ?? 'All good'}</div>
                </Link>
              ))}
            </div>
          )}
      </Card>
      {editing && <VehicleForm vehicle={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

export function blankVehicle(depot = ''): Vehicle {
  return {
    id: uid(), rego: '', name: '', make: '', model: '', year: new Date().getFullYear(), type: 'Truck', vin: '',
    fuelType: 'Diesel', odometer: 0, hours: 0, depot, status: 'active', regoExpiry: addDays(todayISO(), 365),
    insuranceExpiry: addDays(todayISO(), 365),
  };
}

export function VehicleForm({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const { data, upsert } = useStore();
  const [v, setV] = useState(vehicle);
  const isNew = !data.vehicles.some((x) => x.id === vehicle.id);
  const set = <K extends keyof Vehicle>(k: K, val: Vehicle[K]) => setV((p) => ({ ...p, [k]: val }));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    upsert('vehicles', { ...v, rego: v.rego.trim().toUpperCase(), name: v.name.trim() || v.rego.trim().toUpperCase() });
    onClose();
  };

  return (
    <Modal title={isNew ? 'Add asset' : `Edit ${vehicle.rego}`} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="vehicle-form">Save</button></>}>
      <form id="vehicle-form" className="form-grid" onSubmit={save}>
        <Field label="Registration / asset ID"><input className="input" required value={v.rego} onChange={(e) => set('rego', e.target.value)} /></Field>
        <Field label="Nickname"><input className="input" value={v.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Make"><input className="input" value={v.make} onChange={(e) => set('make', e.target.value)} /></Field>
        <Field label="Model"><input className="input" value={v.model} onChange={(e) => set('model', e.target.value)} /></Field>
        <Field label="Year"><input className="input" type="number" value={v.year} onChange={(e) => set('year', Number(e.target.value))} /></Field>
        <Field label="Type">
          <select className="input" value={v.type} onChange={(e) => set('type', e.target.value as VehicleType)}>
            {VEHICLE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="VIN / serial"><input className="input" value={v.vin} onChange={(e) => set('vin', e.target.value)} /></Field>
        <Field label="Fuel">
          <select className="input" value={v.fuelType} onChange={(e) => set('fuelType', e.target.value as Vehicle['fuelType'])}>
            {['Diesel', 'Petrol', 'Electric', 'Hybrid', 'LPG', 'None'].map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Odometer (km)"><input className="input" type="number" min={0} value={v.odometer} onChange={(e) => set('odometer', Number(e.target.value))} /></Field>
        <Field label="Engine hours"><input className="input" type="number" min={0} value={v.hours} onChange={(e) => set('hours', Number(e.target.value))} /></Field>
        <Field label="Depot">
          <select className="input" value={v.depot} onChange={(e) => set('depot', e.target.value)}>
            {data.settings.depots.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="input" value={v.status} onChange={(e) => set('status', e.target.value as Vehicle['status'])}>
            <option value="active">Active</option><option value="in-workshop">In workshop</option><option value="off-road">Off road</option>
          </select>
        </Field>
        <Field label="Assigned driver">
          <select className="input" value={v.driverId ?? ''} onChange={(e) => set('driverId', e.target.value || undefined)}>
            <option value="">Unassigned</option>
            {data.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Registration expiry"><input className="input" type="date" required value={v.regoExpiry} onChange={(e) => set('regoExpiry', e.target.value)} /></Field>
        <Field label="Insurance expiry"><input className="input" type="date" required value={v.insuranceExpiry} onChange={(e) => set('insuranceExpiry', e.target.value)} /></Field>
        <Field label="Notes" span><textarea className="input" rows={2} value={v.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}
