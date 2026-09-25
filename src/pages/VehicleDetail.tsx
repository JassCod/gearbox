import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CalendarClock, ClipboardCheck, Fuel, Gauge, LayoutGrid, Pencil, ShieldCheck, Trash2, TriangleAlert, Wrench, Plus,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import type { ActivityEvent, Vehicle } from '../types';
import { Badge, Card, Empty, Field, HealthDot, Progress, confirmAction } from '../components/ui';
import { EditCard, ItemPage } from '../components/ItemPage';
import { VehicleIcon } from '../components/icons';
import {
  byId, daysUntil, fmtDate, fmtMoney, fmtNum, relDays, serviceDue, vehicleHealth, workOrderCost,
} from '../lib/utils';
import { fuelEfficiency } from './FuelLog';
import { VehicleFields } from './Vehicles';
import { ncrSummary } from '../lib/ncr';

const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 };

export default function VehicleDetail() {
  const { id } = useParams();
  const { data, remove, upsert } = useStore();
  const perm = usePermissions();
  const navigate = useNavigate();
  const v = byId(data.vehicles, id);
  const cur = data.settings.currency;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Vehicle | null>(null);
  const [reading, setReading] = useState<{ km: number; hours: number } | null>(null);

  const stats = useMemo(() => {
    if (!v) return null;
    const wos = data.workOrders.filter((w) => w.vehicleId === v.id).sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));
    const done = wos.filter((w) => w.status === 'completed');
    const maint = done.reduce((s, w) => s + workOrderCost(w, data).total, 0);
    const fuel = data.fuel.filter((f) => f.vehicleId === v.id).sort((a, b) => a.date.localeCompare(b.date));
    const fuelCost = fuel.reduce((s, f) => s + f.cost, 0);
    const odos = fuel.map((f) => f.odometer).filter(Boolean);
    const km = odos.length > 1 ? Math.max(...odos) - Math.min(...odos) : 0;
    return { wos, done, maint, fuel, fuelCost, km, eff: fuelEfficiency(fuel) };
  }, [data, v]);

  if (!v || !stats) return <Empty title="Asset not found"><Link to="/vehicles" className="link">Back to vehicles</Link></Empty>;

  const h = vehicleHealth(v, data);
  const schedules = data.schedules.filter((s) => s.vehicleId === v.id).map((s) => serviceDue(s, v));
  const defects = data.defects.filter((d) => d.vehicleId === v.id).sort((a, b) => b.date.localeCompare(a.date));
  const checks = data.checks.filter((c) => c.vehicleId === v.id).sort((a, b) => b.date.localeCompare(a.date));
  const ncrs = data.ncrs.filter((n) => n.vehicleId === v.id);
  const audits = data.audits.filter((a) => a.vehicleId === v.id);
  const driver = byId(data.drivers, v.driverId);
  const age = new Date().getFullYear() - v.year;
  const openWos = stats.wos.filter((w) => w.status !== 'completed');
  const healthScore = Math.max(0, 100 - h.reasons.length * 12 - (h.health === 'red' ? 20 : 0));

  const set = <K extends keyof Vehicle>(k: K, val: Vehicle[K]) => setDraft((p) => (p ? { ...p, [k]: val } : p));
  const del = () => {
    if (confirmAction(`Delete ${v.rego} and all of its history? This cannot be undone.`)) { remove('vehicles', v.id); navigate('/vehicles'); }
  };

  const historyExtras: ActivityEvent[] = [
    ...stats.done.map((w) => ({ id: `hx-${w.id}`, entityType: 'vehicle' as const, entityId: v.id, at: `${w.completedAt}T12:00:00.000Z`, by: w.assignee || 'Workshop', kind: 'system' as const, text: `Work order #${w.number} completed – ${w.title} (${fmtMoney(workOrderCost(w, data).total, cur)})` })),
    ...checks.map((c) => ({ id: `hc-${c.id}`, entityType: 'vehicle' as const, entityId: v.id, at: `${c.date}T07:00:00.000Z`, by: c.signature, kind: 'system' as const, text: `Pre-start ${c.passed ? 'passed' : 'failed'} at ${fmtNum(c.odometer)} km` })),
    ...defects.map((d) => ({ id: `hd-${d.id}`, entityType: 'vehicle' as const, entityId: v.id, at: `${d.date}T08:00:00.000Z`, by: byId(data.drivers, d.driverId)?.name ?? 'Workshop', kind: 'system' as const, text: `${d.severity[0].toUpperCase()}${d.severity.slice(1)} defect reported: ${d.item}` })),
  ];

  const docExpiry = (iso: string) => { const n = daysUntil(iso); return n < 0 ? 'bad' : n <= 30 ? 'warn' : 'good'; };

  return (
    <ItemPage
      entity={{ type: 'vehicle', id: v.id }}
      back={{ to: '/vehicles', label: 'All vehicles' }}
      icon={<VehicleIcon type={v.type} size={30} />}
      accent={h.health === 'red' ? 'red' : h.health === 'amber' ? 'amber' : 'teal'}
      eyebrow={<>{v.type} · {v.depot}</>}
      title={<>{v.rego} <span className="muted-light">· {v.name}</span></>}
      subtitle={<>{v.year} {v.make} {v.model} · VIN {v.vin || '—'}</>}
      badges={<><Badge value={v.status} /><span className={`badge tone-${h.health === 'red' ? 'bad' : h.health === 'amber' ? 'warn' : 'good'}`}><HealthDot health={h.health} /> Health {healthScore}</span>{driver && <span className="badge tone-neutral">Driver: {driver.name}</span>}</>}
      actions={<>
        {perm.canWrite('vehicles') && <button className="btn" onClick={() => setReading({ km: v.odometer, hours: v.hours })}><Gauge size={16} /> Update reading</button>}
        {perm.canManage && <button className="btn" onClick={() => { setDraft(v); setEditing(true); }}><Pencil size={16} /> Edit</button>}
        {perm.canWrite('workOrders') && <Link className="btn btn-primary" to={`/work-orders/new?vehicle=${v.id}`}><Wrench size={16} /> New work order</Link>}
        {perm.canDelete && <button className="icon-btn" onClick={del} aria-label="Delete asset" title="Delete asset"><Trash2 size={16} /></button>}
      </>}
      stats={[
        { label: v.hours ? 'Engine hours' : 'Odometer', value: v.hours ? `${fmtNum(v.hours)} h` : `${fmtNum(v.odometer)} km`, hint: `${age} year${age === 1 ? '' : 's'} old` },
        { label: 'Maintenance spend', value: fmtMoney(stats.maint, cur), hint: `${stats.done.length} jobs completed` },
        { label: 'Fuel spend', value: fmtMoney(stats.fuelCost, cur), hint: stats.eff ? `${fmtNum(stats.eff, 1)} L/100 km` : 'No economy data' },
        { label: 'Cost per km', value: stats.km ? `${fmtMoney(0, cur).replace(/[\d,.\s]/g, '')}${((stats.maint + stats.fuelCost) / stats.km).toFixed(2)}` : '—', hint: stats.km ? `over ${fmtNum(stats.km)} km logged` : 'Not enough readings' },
        { label: 'Open work', value: openWos.length, hint: `${defects.filter((d) => d.status !== 'resolved').length} open defects`, tone: openWos.some((w) => w.priority === 'critical') ? 'bad' : openWos.length ? 'warn' : 'good' },
      ]}
      banner={h.reasons.length > 0 && <div className={`banner tone-${h.health === 'red' ? 'bad' : 'warn'}`}><strong>{h.health === 'red' ? 'Action required' : 'Attention soon'}:</strong> {h.reasons.join(' · ')}</div>}
      historyExtras={historyExtras}
      tabs={[
        {
          id: 'overview', label: 'Overview', icon: <LayoutGrid size={15} />, render: () => (
            <div className="stack">
              {editing && draft && (
                <EditCard title={`Edit ${v.rego}`} onCancel={() => setEditing(false)} onSubmit={() => { upsert('vehicles', { ...draft, rego: draft.rego.trim().toUpperCase() }); setEditing(false); }}>
                  <VehicleFields v={draft} set={set} />
                </EditCard>
              )}
              {reading && (
                <EditCard title="Update meter reading" onCancel={() => setReading(null)} onSubmit={() => { upsert('vehicles', { ...v, odometer: reading.km, hours: reading.hours }); setReading(null); }}>
                  <Field label="Odometer (km)"><input className="input" type="number" min={0} value={reading.km} onChange={(e) => setReading({ ...reading, km: Number(e.target.value) })} /></Field>
                  <Field label="Engine hours"><input className="input" type="number" min={0} value={reading.hours} onChange={(e) => setReading({ ...reading, hours: Number(e.target.value) })} /></Field>
                  {(reading.km < v.odometer || reading.hours < v.hours) && <p className="small tone-text-warn span-2">The new reading is lower than the current one. Double-check before saving.</p>}
                </EditCard>
              )}
              <div className="grid-3">
                <Card title="Specifications">
                  <dl className="details">
                    <dt>Make / model</dt><dd>{v.make} {v.model}</dd>
                    <dt>Year</dt><dd>{v.year}</dd>
                    <dt>Type</dt><dd>{v.type}</dd>
                    <dt>Fuel</dt><dd>{v.fuelType}</dd>
                    <dt>VIN / serial</dt><dd className="mono small">{v.vin || '—'}</dd>
                    <dt>Depot</dt><dd>{v.depot}</dd>
                    {v.notes && <><dt>Notes</dt><dd>{v.notes}</dd></>}
                  </dl>
                </Card>
                <Card title="Compliance status">
                  <ul className="status-list">
                    <li><span>Registration</span><span className={`tone-text-${docExpiry(v.regoExpiry)}`}>{fmtDate(v.regoExpiry)} · {relDays(v.regoExpiry)}</span></li>
                    <li><span>Insurance</span><span className={`tone-text-${docExpiry(v.insuranceExpiry)}`}>{fmtDate(v.insuranceExpiry)} · {relDays(v.insuranceExpiry)}</span></li>
                    <li><span>Last pre-start</span><span>{checks[0] ? `${fmtDate(checks[0].date)} · ${checks[0].passed ? 'passed' : 'failed'}` : 'Never'}</span></li>
                    <li><span>Open NCRs</span><span className={ncrs.some((n) => !n.closed) ? 'tone-text-warn' : 'tone-text-good'}>{ncrs.filter((n) => !n.closed).length}</span></li>
                  </ul>
                </Card>
                <Card title="Assigned driver">
                  {driver ? (
                    <Link to={`/drivers/${driver.id}`} className="person-card">
                      <span className="avatar">{driver.name.split(' ').map((p) => p[0]).join('')}</span>
                      <div><strong>{driver.name}</strong><div className="small muted">Licence {driver.licenceClass} · {driver.phone}</div>
                        <div className={`small tone-text-${docExpiry(driver.licenceExpiry)}`}>Licence {relDays(driver.licenceExpiry)}</div></div>
                    </Link>
                  ) : <p className="muted">No driver assigned.</p>}
                </Card>
              </div>
              <div className="grid-2">
                <Card title="Service schedule" actions={<Link className="link small" to={`/maintenance?vehicle=${v.id}`}>Manage</Link>}>
                  <ul className="list">
                    {schedules.map((d) => (
                      <li key={d.schedule.id} className="col">
                        <div className="row between"><Link className="link" to={`/maintenance/${d.schedule.id}`}>{d.schedule.name}</Link><Badge value={d.state} /></div>
                        <Progress value={d.progress} tone={d.state === 'overdue' ? 'bad' : d.state === 'due-soon' ? 'warn' : 'good'} />
                        <span className="small muted">{d.label}{d.nextDate ? ` · next by ${fmtDate(d.nextDate)}` : ''}</span>
                      </li>
                    ))}
                    {schedules.length === 0 && <li className="muted">No schedules for this asset.</li>}
                  </ul>
                </Card>
                <Card title="Open work" actions={perm.canWrite('workOrders') && <Link className="link small" to={`/work-orders/new?vehicle=${v.id}`}>New work order</Link>}>
                  <ul className="list">
                    {openWos.map((w) => (
                      <li key={w.id}><div><Link className="strong" to={`/work-orders/${w.id}`}>#{w.number} {w.title}</Link><div className="small muted">Due {relDays(w.dueDate)} · {w.assignee || 'Unassigned'}</div></div>
                        <div className="row gap-sm"><Badge value={w.priority} /><Badge value={w.status} /></div></li>
                    ))}
                    {defects.filter((d) => d.status === 'open').map((d) => (
                      <li key={d.id}><div><Link className="strong" to={`/defects/${d.id}`}>Defect: {d.item}</Link><div className="small muted">{d.description}</div></div><Badge value={d.severity} /></li>
                    ))}
                    {openWos.length === 0 && !defects.some((d) => d.status === 'open') && <li className="muted">Nothing open – this asset is in good shape.</li>}
                  </ul>
                </Card>
              </div>
            </div>
          ),
        },
        {
          id: 'maintenance', label: 'Maintenance', icon: <Wrench size={15} />, count: openWos.length, render: () => (
            <Card title="Work order history" actions={perm.canWrite('workOrders') && <Link className="btn btn-sm" to={`/work-orders/new?vehicle=${v.id}`}><Plus size={14} /> New work order</Link>}>
              {stats.wos.length === 0 ? <Empty title="No work orders yet" /> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>#</th><th>Job</th><th>Type</th><th>Status</th><th>Date</th><th>Technician</th><th className="num">Labour</th><th className="num">Parts</th><th className="num">Total</th></tr></thead>
                    <tbody>
                      {stats.wos.map((w) => {
                        const c = workOrderCost(w, data);
                        return (
                          <tr key={w.id} className="clickable" onClick={() => navigate(`/work-orders/${w.id}`)}>
                            <td>{w.number}</td><td className="strong">{w.title}</td><td>{w.type}</td><td><Badge value={w.status} /></td>
                            <td>{fmtDate(w.completedAt ?? w.dueDate)}</td><td>{w.assignee || '—'}</td>
                            <td className="num">{fmtMoney(c.labour, cur)}</td><td className="num">{fmtMoney(c.parts, cur)}</td><td className="num strong">{fmtMoney(c.total, cur)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ),
        },
        {
          id: 'fuel', label: 'Fuel & costs', icon: <Fuel size={15} />, render: () => (
            <div className="stack">
              <div className="grid-2">
                <Card title="Fuel spend per fill">
                  {stats.fuel.length < 2 ? <p className="muted">Not enough fuel records yet.</p> : (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={stats.fuel.map((f) => ({ date: fmtDate(f.date), cost: f.cost }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <defs><linearGradient id="fuelGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--accent)" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="date" stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} minTickGap={30} />
                        <YAxis stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} width={56} tickFormatter={(x) => fmtMoney(x, cur)} />
                        <Tooltip formatter={(x) => fmtMoney(Number(x), cur)} contentStyle={tooltipStyle} />
                        <Area type="monotone" dataKey="cost" stroke="var(--accent)" strokeWidth={2} fill="url(#fuelGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </Card>
                <Card title="Lifetime cost breakdown">
                  <div className="cost-bars">
                    {[['Maintenance labour', stats.done.reduce((s, w) => s + workOrderCost(w, data).labour, 0)], ['Parts', stats.done.reduce((s, w) => s + workOrderCost(w, data).parts, 0)], ['Fuel', stats.fuelCost]].map(([label, value]) => {
                      const total = stats.maint + stats.fuelCost || 1;
                      return (
                        <div key={label as string} className="cost-bar">
                          <div className="row between small"><span>{label}</span><b>{fmtMoney(value as number, cur)}</b></div>
                          <div className="bar-track"><div className="bar-fill" style={{ width: `${((value as number) / total) * 100}%` }} /></div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="small muted">Total cost of ownership logged: <b>{fmtMoney(stats.maint + stats.fuelCost, cur)}</b></p>
                </Card>
              </div>
              <Card title="Fuel fills" actions={perm.canWrite('fuel') && <Link className="btn btn-sm" to={`/fuel?add=1&vehicle=${v.id}`}><Plus size={14} /> Add fill</Link>}>
                {stats.fuel.length === 0 ? <Empty title="No fuel fills recorded" /> : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Date</th><th>Station</th><th className="num">Odometer</th><th className="num">Litres</th><th className="num">Cost</th></tr></thead>
                      <tbody>{[...stats.fuel].reverse().map((f) => (
                        <tr key={f.id}><td>{fmtDate(f.date)}</td><td>{f.station}</td><td className="num">{f.odometer ? fmtNum(f.odometer) : '—'}</td><td className="num">{fmtNum(f.litres)}</td><td className="num">{fmtMoney(f.cost, cur)}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          ),
        },
        {
          id: 'defects', label: 'Defects & checks', icon: <ClipboardCheck size={15} />, count: defects.filter((d) => d.status !== 'resolved').length, render: () => (
            <div className="grid-2">
              <Card title="Defects">
                <ul className="list">
                  {defects.map((d) => (
                    <li key={d.id}><div><Link className="strong" to={`/defects/${d.id}`}>{d.item}</Link><div className="small muted">{fmtDate(d.date)} · {d.description}</div></div>
                      <div className="row gap-sm"><Badge value={d.severity} /><Badge value={d.status} /></div></li>
                  ))}
                  {defects.length === 0 && <li className="muted">No defects reported.</li>}
                </ul>
              </Card>
              <Card title="Pre-start checks">
                <ul className="list">
                  {checks.map((c) => (
                    <li key={c.id}><div><Link className="strong" to={`/checks/${c.id}`}>{fmtDate(c.date)}</Link><div className="small muted">{byId(data.drivers, c.driverId)?.name ?? 'Unknown'} · {fmtNum(c.odometer)} km</div></div>
                      <Badge value={c.passed ? 'passed' : 'failed'} /></li>
                  ))}
                  {checks.length === 0 && <li className="muted">No checks submitted.</li>}
                </ul>
              </Card>
            </div>
          ),
        },
        {
          id: 'compliance', label: 'Compliance', icon: <ShieldCheck size={15} />, count: ncrs.filter((n) => !n.closed).length, render: () => (
            <div className="grid-2">
              <Card title="Non-conformance reports" actions={perm.canWrite('ncrs') && <Link className="btn btn-sm" to={`/ncr/new?vehicle=${v.id}`}><TriangleAlert size={14} /> Raise NCR</Link>}>
                <ul className="list">
                  {ncrs.map((n) => (
                    <li key={n.id}><div><Link className="strong" to={`/ncr/${n.id}`}>NCR-{n.number} {n.ncrType}</Link><div className="small muted">{n.schemeType} · reported {fmtDate(n.reportedDate || n.createdAt)} · {ncrSummary(n, 40)}</div></div>
                      <Badge value={n.closed ? 'closed' : 'open'} /></li>
                  ))}
                  {ncrs.length === 0 && <li className="muted">No NCRs linked to this asset.</li>}
                </ul>
              </Card>
              <Card title="Audits & inspections" actions={perm.canWrite('audits') && <Link className="btn btn-sm" to={`/audits/new?vehicle=${v.id}`}><CalendarClock size={14} /> Schedule audit</Link>}>
                <ul className="list">
                  {audits.map((a) => (
                    <li key={a.id}><div><Link className="strong" to={`/audits/${a.id}`}>AUD-{a.number} {a.title}</Link><div className="small muted">{a.type} · {fmtDate(a.date)} · {a.auditor}</div></div><Badge value={a.status} /></li>
                  ))}
                  {audits.length === 0 && <li className="muted">No audits for this asset yet.</li>}
                </ul>
              </Card>
            </div>
          ),
        },
      ]}
    />
  );
}
