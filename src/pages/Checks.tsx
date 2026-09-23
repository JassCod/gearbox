import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, ClipboardCheck, Plus, X } from 'lucide-react';
import { useStore } from '../store';
import type { CheckItem, PrestartCheck } from '../types';
import { Badge, Card, Empty, Field, Modal, PageHeader, Select } from '../components/ui';
import { byId, fmtDate, fmtNum, todayISO } from '../lib/utils';

export default function Checks() {
  const { data } = useStore();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<PrestartCheck | null>(null);
  const [result, setResult] = useState<'all' | 'passed' | 'failed'>('all');
  const [vehicle, setVehicle] = useState('all');

  useEffect(() => {
    if (params.get('new')) setCreating(true);
  }, [params]);
  const closeNew = () => { setCreating(false); if (params.has('new')) setParams({}); };

  const rows = useMemo(() => data.checks
    .filter((c) => (result === 'all' || (result === 'passed') === c.passed) && (vehicle === 'all' || c.vehicleId === vehicle))
    .sort((a, b) => b.date.localeCompare(a.date)), [data.checks, result, vehicle]);

  const today = data.checks.filter((c) => c.date === todayISO());
  const notChecked = data.vehicles.filter((v) => v.status === 'active' && !today.some((c) => c.vehicleId === v.id));

  return (
    <>
      <PageHeader title="Pre-start checks" subtitle="Drivers complete a quick walk-around before each shift. Failed items become defects automatically."
        actions={<button className="btn btn-primary" disabled={!data.vehicles.length || !data.drivers.length} onClick={() => setCreating(true)}><Plus size={16} /> New pre-start</button>} />

      <div className="grid-2">
        <Card title={`Today · ${today.length} submitted`}>
          <div className="chips">
            {today.map((c) => <span key={c.id} className={`chip tone-${c.passed ? 'good' : 'bad'}`}>{byId(data.vehicles, c.vehicleId)?.rego}</span>)}
            {today.length === 0 && <span className="muted">No checks yet today.</span>}
          </div>
        </Card>
        <Card title={`Active assets not yet checked · ${notChecked.length}`}>
          <div className="chips">
            {notChecked.map((v) => <span key={v.id} className="chip">{v.rego}</span>)}
            {notChecked.length === 0 && <span className="muted">Every active asset has been checked today.</span>}
          </div>
        </Card>
      </div>

      <Card>
        <div className="toolbar">
          <Select label="Vehicle" value={vehicle} onChange={setVehicle} options={[{ value: 'all', label: 'All vehicles' }, ...data.vehicles.map((v) => ({ value: v.id, label: v.rego }))]} />
          <div className="segmented">
            {(['all', 'passed', 'failed'] as const).map((k) => <button key={k} className={result === k ? 'on' : ''} onClick={() => setResult(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}
          </div>
        </div>
        {rows.length === 0 ? <Empty icon={<ClipboardCheck size={32} />} title="No checks found" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Vehicle</th><th>Driver</th><th className="num">Odometer</th><th>Failed items</th><th>Result</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => setViewing(c)}>
                    <td>{fmtDate(c.date)}</td>
                    <td className="strong">{byId(data.vehicles, c.vehicleId)?.rego ?? '—'}</td>
                    <td>{byId(data.drivers, c.driverId)?.name ?? '—'}</td>
                    <td className="num">{c.odometer ? fmtNum(c.odometer) : '—'}</td>
                    <td className="small">{c.items.filter((i) => !i.ok).map((i) => i.label).join(', ') || <span className="muted">None</span>}</td>
                    <td><Badge value={c.passed ? 'passed' : 'failed'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {creating && <CheckForm onClose={closeNew} />}
      {viewing && (
        <Modal title={`Pre-start · ${byId(data.vehicles, viewing.vehicleId)?.rego ?? ''}`} onClose={() => setViewing(null)}>
          <p className="muted">{fmtDate(viewing.date)} · {byId(data.drivers, viewing.driverId)?.name} · signed “{viewing.signature}”</p>
          <ul className="checklist readonly">
            {viewing.items.map((i) => (
              <li key={i.label} className={i.ok ? 'ok' : 'fail'}>
                {i.ok ? <Check size={16} /> : <X size={16} />}<span>{i.label}{i.note && <em className="small muted"> – {i.note}</em>}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}

function CheckForm({ onClose }: { onClose: () => void }) {
  const { data, submitCheck } = useStore();
  const [vehicleId, setVehicleId] = useState(data.vehicles[0]?.id ?? '');
  const vehicle = byId(data.vehicles, vehicleId);
  const [driverId, setDriverId] = useState(vehicle?.driverId ?? data.drivers[0]?.id ?? '');
  const [odometer, setOdometer] = useState(vehicle?.odometer ?? 0);
  const [items, setItems] = useState<CheckItem[]>(data.settings.checklist.map((label) => ({ label, ok: true })));
  const [signature, setSignature] = useState('');

  const pickVehicle = (id: string) => {
    const v = byId(data.vehicles, id);
    setVehicleId(id);
    setOdometer(v?.odometer ?? 0);
    if (v?.driverId) setDriverId(v.driverId);
  };
  const fails = items.filter((i) => !i.ok).length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    submitCheck({ vehicleId, driverId, date: todayISO(), odometer, items, signature: signature.trim() });
    onClose();
  };

  return (
    <Modal title="New pre-start check" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="check-form">{fails ? `Submit with ${fails} defect${fails > 1 ? 's' : ''}` : 'Submit – all OK'}</button></>}>
      <form id="check-form" className="form-grid" onSubmit={submit}>
        <Field label="Vehicle">
          <select className="input" value={vehicleId} onChange={(e) => pickVehicle(e.target.value)}>
            {data.vehicles.map((v) => <option key={v.id} value={v.id}>{v.rego} · {v.name}</option>)}
          </select>
        </Field>
        <Field label="Driver">
          <select className="input" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            {data.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Odometer (km)" span><input className="input" type="number" min={0} value={odometer} onChange={(e) => setOdometer(Number(e.target.value))} /></Field>
        <ul className="checklist span-2">
          {items.map((it, i) => (
            <li key={it.label} className={it.ok ? 'ok' : 'fail'}>
              <div className="row between">
                <span>{it.label}</span>
                <div className="segmented small">
                  <button type="button" className={it.ok ? 'on good' : ''} onClick={() => setItems(items.map((x, j) => (j === i ? { ...x, ok: true, note: undefined } : x)))}><Check size={14} /> OK</button>
                  <button type="button" className={!it.ok ? 'on bad' : ''} onClick={() => setItems(items.map((x, j) => (j === i ? { ...x, ok: false } : x)))}><X size={14} /> Fault</button>
                </div>
              </div>
              {!it.ok && <input className="input" placeholder="Describe the fault" required value={it.note ?? ''}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />}
            </li>
          ))}
        </ul>
        <Field label="Driver signature (type your full name)" span><input className="input" required value={signature} onChange={(e) => setSignature(e.target.value)} /></Field>
      </form>
    </Modal>
  );
}
