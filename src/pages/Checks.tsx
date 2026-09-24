import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, ClipboardCheck, LayoutGrid, PenLine, Plus, X } from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import type { CheckItem } from '../types';
import { Badge, Card, Empty, Field, PageHeader, Select } from '../components/ui';
import { ItemPage } from '../components/ItemPage';
import { celebrate } from '../components/celebrate';
import { byId, fmtDate, fmtNum, todayISO } from '../lib/utils';

export default function Checks() {
  const { data } = useStore();
  const navigate = useNavigate();
  const [result, setResult] = useState<'all' | 'passed' | 'failed'>('all');
  const [vehicle, setVehicle] = useState('all');
  const perm = usePermissions();

  const rows = useMemo(() => data.checks
    .filter((c) => (result === 'all' || (result === 'passed') === c.passed) && (vehicle === 'all' || c.vehicleId === vehicle))
    .sort((a, b) => b.date.localeCompare(a.date)), [data.checks, result, vehicle]);

  const today = data.checks.filter((c) => c.date === todayISO());
  const notChecked = data.vehicles.filter((v) => v.status === 'active' && !today.some((c) => c.vehicleId === v.id));
  const coverage = data.vehicles.filter((v) => v.status === 'active').length;

  return (
    <>
      <PageHeader title="Pre-start checks" subtitle="Drivers complete a quick walk-around before each shift. Failed items become defects automatically."
        actions={perm.canWrite('checks') && <Link className="btn btn-primary" to="/checks/new"><Plus size={16} /> New pre-start</Link>} />
      <div className="grid-2">
        <Card title={`Today · ${today.length} of ${coverage} active assets checked`}>
          <div className="big-progress"><div style={{ width: `${coverage ? (today.length / coverage) * 100 : 0}%` }} /></div>
          <div className="chips">
            {today.map((c) => <Link to={`/checks/${c.id}`} key={c.id} className={`chip tone-${c.passed ? 'good' : 'bad'}`}>{byId(data.vehicles, c.vehicleId)?.rego} {c.passed ? '✓' : '✕'}</Link>)}
            {today.length === 0 && <span className="muted">No checks yet today.</span>}
          </div>
        </Card>
        <Card title={`Still to check · ${notChecked.length}`}>
          <div className="chips">
            {notChecked.map((v) => <Link key={v.id} to={`/checks/new?vehicle=${v.id}`} className="chip">{v.rego}</Link>)}
            {notChecked.length === 0 && <span className="muted">Every active asset has been checked today. 🎉</span>}
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
                  <tr key={c.id} className="clickable" onClick={() => navigate(`/checks/${c.id}`)}>
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
    </>
  );
}

export function NewCheck() {
  const { data, submitCheck } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [vehicleId, setVehicleId] = useState(params.get('vehicle') ?? data.vehicles[0]?.id ?? '');
  const vehicle = byId(data.vehicles, vehicleId);
  const [driverId, setDriverId] = useState(vehicle?.driverId ?? data.drivers[0]?.id ?? '');
  const [odometer, setOdometer] = useState(vehicle?.odometer ?? 0);
  const [items, setItems] = useState<CheckItem[]>(data.settings.checklist.map((label) => ({ label, ok: true })));
  const [signature, setSignature] = useState('');
  if (!data.vehicles.length || !data.drivers.length) return <Empty title="Add a vehicle and a driver first" />;

  const pickVehicle = (id: string) => {
    const v = byId(data.vehicles, id);
    setVehicleId(id); setOdometer(v?.odometer ?? 0);
    if (v?.driverId) setDriverId(v.driverId);
  };
  const fails = items.filter((i) => !i.ok).length;
  const update = (i: number, patch: Partial<CheckItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <>
      <PageHeader title="Pre-start check" subtitle="Walk around the vehicle and mark anything that isn't right." />
      <form className="check-page" onSubmit={(e) => {
        e.preventDefault();
        const c = submitCheck({ vehicleId, driverId, date: todayISO(), odometer, items, signature: signature.trim() });
        if (!fails) celebrate('All clear – safe driving!');
        navigate(`/checks/${c.id}`);
      }}>
        <Card title="Vehicle & driver">
          <div className="form-grid">
            <Field label="Vehicle">
              <select className="input" value={vehicleId} onChange={(e) => pickVehicle(e.target.value)}>{data.vehicles.map((v) => <option key={v.id} value={v.id}>{v.rego} · {v.name}</option>)}</select>
            </Field>
            <Field label="Driver">
              <select className="input" value={driverId} onChange={(e) => setDriverId(e.target.value)}>{data.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            </Field>
            <Field label="Odometer (km)"><input className="input" type="number" min={0} value={odometer} onChange={(e) => setOdometer(Number(e.target.value))} /></Field>
          </div>
        </Card>
        <Card title={`Checklist · ${items.length - fails}/${items.length} OK`}>
          <ul className="checklist big">
            {items.map((it, i) => (
              <li key={it.label} className={it.ok ? 'ok' : 'fail'}>
                <div className="row between">
                  <span className="check-label">{it.label}</span>
                  <div className="segmented">
                    <button type="button" className={it.ok ? 'on good' : ''} onClick={() => update(i, { ok: true, note: undefined })}><Check size={14} /> OK</button>
                    <button type="button" className={!it.ok ? 'on bad' : ''} onClick={() => update(i, { ok: false })}><X size={14} /> Fault</button>
                  </div>
                </div>
                {!it.ok && <input className="input" placeholder="Describe the fault" required value={it.note ?? ''} onChange={(e) => update(i, { note: e.target.value })} />}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Sign off">
          <Field label="Driver signature (type your full name)"><input className="input signature" required value={signature} onChange={(e) => setSignature(e.target.value)} /></Field>
          <div className="row gap-sm end">
            <button type="button" className="btn" onClick={() => navigate(-1)}>Cancel</button>
            <button className={`btn ${fails ? 'btn-danger' : 'btn-primary'}`}><PenLine size={16} /> {fails ? `Submit with ${fails} defect${fails > 1 ? 's' : ''}` : 'Submit – all OK'}</button>
          </div>
        </Card>
      </form>
    </>
  );
}

export function CheckDetail() {
  const { id } = useParams();
  const { data } = useStore();
  const c = byId(data.checks, id);
  if (!c) return <Empty title="Check not found"><Link to="/checks" className="link">Back to checks</Link></Empty>;
  const v = byId(data.vehicles, c.vehicleId);
  const d = byId(data.drivers, c.driverId);
  const defects = data.defects.filter((x) => x.checkId === c.id);
  const fails = c.items.filter((i) => !i.ok);

  return (
    <ItemPage
      entity={{ type: 'check', id: c.id }}
      back={{ to: '/checks', label: 'All pre-start checks' }}
      icon={<ClipboardCheck size={28} />}
      accent={c.passed ? 'teal' : 'red'}
      eyebrow={<>Pre-start check · {fmtDate(c.date)}</>}
      title={<>{v?.rego ?? 'Unknown vehicle'} {c.passed ? 'passed' : 'failed'}</>}
      subtitle={<>By {d ? <Link className="link-light" to={`/drivers/${d.id}`}>{d.name}</Link> : 'unknown driver'} · signed “{c.signature}” · {fmtNum(c.odometer)} km</>}
      badges={<Badge value={c.passed ? 'passed' : 'failed'} />}
      stats={[
        { label: 'Items checked', value: c.items.length },
        { label: 'Faults', value: fails.length, tone: fails.length ? 'bad' : 'good' },
        { label: 'Defects raised', value: defects.length },
      ]}
      tabs={[{
        id: 'overview', label: 'Checklist', icon: <LayoutGrid size={15} />, render: () => (
          <div className="grid-2">
            <Card title="Checklist results">
              <ul className="checklist readonly">
                {c.items.map((i) => (
                  <li key={i.label} className={i.ok ? 'ok' : 'fail'}>{i.ok ? <Check size={16} /> : <X size={16} />}<span>{i.label}{i.note && <em className="small muted"> – {i.note}</em>}</span></li>
                ))}
              </ul>
            </Card>
            <Card title="Defects raised">
              <ul className="list">
                {defects.map((x) => <li key={x.id}><Link className="link" to={`/defects/${x.id}`}>{x.item} – {x.description}</Link><Badge value={x.status} /></li>)}
                {defects.length === 0 && <li className="muted">No defects – vehicle cleared for use.</li>}
              </ul>
              {v && <Link className="btn btn-sm" to={`/vehicles/${v.id}`}>Open {v.rego}</Link>}
            </Card>
          </div>
        ),
      }]}
    />
  );
}
