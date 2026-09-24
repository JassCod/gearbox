import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ClipboardCheck, Package, TriangleAlert, Truck, Wrench, CalendarClock } from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import { Badge, Card, HealthDot, PageHeader, StatCard } from '../components/ui';
import { buildAlerts } from '../lib/alerts';
import { byId, fmtDate, fmtMoney, parseISO, relDays, serviceDue, todayISO, vehicleHealth, workOrderCost } from '../lib/utils';

const HEALTH_COLORS = { green: 'var(--good)', amber: 'var(--warn)', red: 'var(--bad)' };

export default function Dashboard() {
  const { data } = useStore();
  const navigate = useNavigate();
  const perm = usePermissions();
  const cur = data.settings.currency;

  const health = useMemo(() => data.vehicles.map((v) => ({ v, ...vehicleHealth(v, data) })), [data]);
  const counts = { green: 0, amber: 0, red: 0 };
  health.forEach((h) => counts[h.health]++);
  const available = data.vehicles.filter((v) => v.status === 'active').length;

  const dues = useMemo(() => data.schedules
    .map((s) => ({ due: serviceDue(s, byId(data.vehicles, s.vehicleId)), v: byId(data.vehicles, s.vehicleId) }))
    .filter((x) => x.v)
    .sort((a, b) => b.due.progress - a.due.progress), [data]);
  const overdue = dues.filter((d) => d.due.state === 'overdue').length;

  const openWOs = data.workOrders.filter((w) => w.status !== 'completed');
  const openDefects = data.defects.filter((d) => d.status !== 'resolved');
  const lowStock = data.parts.filter((p) => p.qty <= p.minQty);
  const checksToday = data.checks.filter((c) => c.date === todayISO());
  const alerts = useMemo(() => buildAlerts(data), [data]);

  const costByMonth = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(undefined, { month: 'short' }), maintenance: 0, fuel: 0 };
    });
    const bucket = (iso: string) => {
      const d = parseISO(iso);
      return months.find((m) => m.key === `${d.getFullYear()}-${d.getMonth()}`);
    };
    for (const w of data.workOrders) {
      if (w.status !== 'completed' || !w.completedAt) continue;
      const b = bucket(w.completedAt);
      if (b) b.maintenance += workOrderCost(w, data).total;
    }
    for (const f of data.fuel) {
      const b = bucket(f.date);
      if (b) b.fuel += f.cost;
    }
    return months;
  }, [data]);

  const pie = (['green', 'amber', 'red'] as const).map((k) => ({ name: k, value: counts[k] })).filter((x) => x.value);

  return (
    <>
      <PageHeader title="Fleet overview" subtitle={`${data.settings.companyName} · ${fmtDate(todayISO())}`}
        actions={<>
          {perm.canWrite('checks') && <Link className="btn" to="/checks?new=1"><ClipboardCheck size={16} /> New pre-start</Link>}
          {perm.canWrite('workOrders') && <Link className="btn btn-primary" to="/work-orders?new=1"><Wrench size={16} /> New work order</Link>}
        </>} />

      <div className="stats">
        <StatCard label="Fleet availability" icon={<Truck size={18} />}
          value={`${data.vehicles.length ? Math.round((available / data.vehicles.length) * 100) : 0}%`}
          hint={`${available} of ${data.vehicles.length} vehicles on the road`}
          tone={available / Math.max(1, data.vehicles.length) >= 0.85 ? 'good' : 'warn'} onClick={() => navigate('/vehicles')} />
        <StatCard label="Services overdue" icon={<CalendarClock size={18} />} value={overdue}
          hint={`${dues.filter((d) => d.due.state === 'due-soon').length} due soon`} tone={overdue ? 'bad' : 'good'}
          onClick={() => navigate('/maintenance')} />
        <StatCard label="Open work orders" icon={<Wrench size={18} />} value={openWOs.length}
          hint={`${openWOs.filter((w) => w.priority === 'critical').length} critical`} tone={openWOs.some((w) => w.priority === 'critical') ? 'warn' : 'neutral'}
          onClick={() => navigate('/work-orders')} />
        <StatCard label="Open defects" icon={<TriangleAlert size={18} />} value={openDefects.length}
          hint={`${openDefects.filter((d) => d.status === 'open').length} without a work order`}
          tone={openDefects.some((d) => d.severity === 'critical') ? 'bad' : openDefects.length ? 'warn' : 'good'}
          onClick={() => navigate('/defects')} />
        <StatCard label="Pre-starts today" icon={<ClipboardCheck size={18} />} value={checksToday.length}
          hint={`${checksToday.filter((c) => !c.passed).length} failed`} onClick={() => navigate('/checks')} />
        <StatCard label="Low stock parts" icon={<Package size={18} />} value={lowStock.length}
          hint={`${lowStock.filter((p) => p.qty === 0).length} out of stock`} tone={lowStock.length ? 'warn' : 'good'}
          onClick={() => navigate('/parts?low=1')} />
      </div>

      <div className="grid-3">
        <Card title="Fleet health">
          <div className="health-wrap">
            <div className="donut">
              <PieChart width={180} height={180}>
                <Pie data={pie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={82} paddingAngle={2}
                  stroke="none" isAnimationActive={false}
                  onClick={(e) => navigate(`/vehicles?health=${(e as unknown as { name: string }).name}`)}>
                  {pie.map((p) => <Cell key={p.name} fill={HEALTH_COLORS[p.name]} cursor="pointer" />)}
                </Pie>
              </PieChart>
              <div className="donut-center"><strong>{data.vehicles.length}</strong><span className="muted small">assets</span></div>
            </div>
            <ul className="legend">
              {([['green', 'Good to go'], ['amber', 'Attention soon'], ['red', 'Action required']] as const).map(([k, label]) => (
                <li key={k}><Link to={`/vehicles?health=${k}`}><HealthDot health={k} /> {label}<b>{counts[k]}</b></Link></li>
              ))}
            </ul>
          </div>
        </Card>

        <Card title="Spend – last 6 months" className="span-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={costByMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} width={56}
                tickFormatter={(v) => fmtMoney(v, cur)} />
              <Tooltip formatter={(v) => fmtMoney(Number(v), cur)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
              <Legend iconType="circle" />
              <Bar dataKey="maintenance" name="Maintenance" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="fuel" name="Fuel" fill="var(--accent-2)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Upcoming & overdue services" actions={<Link to="/maintenance" className="link small">View all</Link>}>
          <ul className="list">
            {dues.slice(0, 6).map(({ due, v }) => (
              <li key={due.schedule.id}>
                <div>
                  <Link to={`/vehicles/${v!.id}`} className="strong">{v!.rego}</Link> <span className="muted">· {due.schedule.name}</span>
                  <div className="small muted">{due.label}{due.nextDate ? ` · ${fmtDate(due.nextDate)}` : ''}</div>
                </div>
                <Badge value={due.state} />
              </li>
            ))}
            {dues.length === 0 && <li className="muted">No service schedules yet.</li>}
          </ul>
        </Card>

        <Card title="Needs attention" actions={<span className="muted small">{alerts.length} items</span>}>
          <ul className="list">
            {alerts.slice(0, 7).map((a) => (
              <li key={a.id}>
                <Link to={a.to}>
                  <span className={`small tone-text-${a.level}`}>{a.kind}</span>
                  <div>{a.text}</div>
                </Link>
              </li>
            ))}
            {alerts.length === 0 && <li className="muted">Nothing needs attention. Nice work.</li>}
          </ul>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Active work orders" actions={<Link to="/work-orders" className="link small">Open board</Link>}>
          <ul className="list">
            {openWOs.slice(0, 6).map((w) => (
              <li key={w.id}>
                <div>
                  <Link to={`/work-orders?open=${w.id}`} className="strong">#{w.number} {w.title}</Link>
                  <div className="small muted">{byId(data.vehicles, w.vehicleId)?.rego} · due {relDays(w.dueDate)}</div>
                </div>
                <div className="row gap-sm"><Badge value={w.priority} /><Badge value={w.status} /></div>
              </li>
            ))}
            {openWOs.length === 0 && <li className="muted">No open work orders.</li>}
          </ul>
        </Card>

        <Card title="Latest pre-start checks" actions={<Link to="/checks" className="link small">View all</Link>}>
          <ul className="list">
            {data.checks.slice(0, 6).map((c) => (
              <li key={c.id}>
                <div>
                  <span className="strong">{byId(data.vehicles, c.vehicleId)?.rego}</span>
                  <span className="muted"> · {byId(data.drivers, c.driverId)?.name}</span>
                  <div className="small muted">{fmtDate(c.date)}</div>
                </div>
                <Badge value={c.passed ? 'passed' : 'failed'} />
              </li>
            ))}
            {data.checks.length === 0 && <li className="muted">No checks submitted yet.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
