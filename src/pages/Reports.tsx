import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Printer } from 'lucide-react';
import { useStore } from '../store';
import { Card, PageHeader, Select, StatCard } from '../components/ui';
import { daysUntil, downloadCSV, fmtMoney, fmtNum, workOrderCost } from '../lib/utils';
import { fuelEfficiency } from './FuelLog';

const PALETTE = ['var(--accent)', 'var(--accent-2)', 'var(--warn)', 'var(--info)', 'var(--bad)', 'var(--good)'];
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 };

export default function Reports() {
  const { data } = useStore();
  const [period, setPeriod] = useState('180');
  const cur = data.settings.currency;
  const inPeriod = (iso?: string) => !!iso && (period === 'all' || -daysUntil(iso) <= Number(period));

  const report = useMemo(() => {
    const done = data.workOrders.filter((w) => w.status === 'completed' && inPeriod(w.completedAt));
    const fuel = data.fuel.filter((f) => inPeriod(f.date));

    const perVehicle = data.vehicles.map((v) => {
      const wos = done.filter((w) => w.vehicleId === v.id);
      const maint = wos.reduce((s, w) => s + workOrderCost(w, data).total, 0);
      const vf = fuel.filter((f) => f.vehicleId === v.id);
      const fuelCost = vf.reduce((s, f) => s + f.cost, 0);
      const odos = vf.map((f) => f.odometer).filter(Boolean);
      const km = odos.length > 1 ? Math.max(...odos) - Math.min(...odos) : 0;
      return { v, jobs: wos.length, maint, fuelCost, total: maint + fuelCost, km, perKm: km ? (maint + fuelCost) / km : 0, eff: fuelEfficiency(vf) };
    }).sort((a, b) => b.total - a.total);

    const byType = Object.entries(done.reduce<Record<string, number>>((m, w) => {
      m[w.type] = (m[w.type] ?? 0) + workOrderCost(w, data).total;
      return m;
    }, {})).map(([name, value]) => ({ name, value: Math.round(value) }));

    const byDepot = data.settings.depots.map((depot) => {
      const rows = perVehicle.filter((r) => r.v.depot === depot);
      return { depot, Maintenance: Math.round(rows.reduce((s, r) => s + r.maint, 0)), Fuel: Math.round(rows.reduce((s, r) => s + r.fuelCost, 0)) };
    });

    const defectCounts = Object.entries(data.defects.filter((d) => inPeriod(d.date)).reduce<Record<string, number>>((m, d) => {
      m[d.item] = (m[d.item] ?? 0) + 1;
      return m;
    }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6);

    const techs = Object.entries(done.reduce<Record<string, { jobs: number; hours: number }>>((m, w) => {
      const k = w.assignee || 'Unassigned';
      m[k] = { jobs: (m[k]?.jobs ?? 0) + 1, hours: (m[k]?.hours ?? 0) + w.labourHours };
      return m;
    }, {})).sort((a, b) => b[1].jobs - a[1].jobs);

    const onTime = done.filter((w) => w.completedAt! <= w.dueDate).length;
    const checks = data.checks.filter((c) => inPeriod(c.date));
    return {
      done, perVehicle, byType, byDepot, defectCounts, techs,
      maint: perVehicle.reduce((s, r) => s + r.maint, 0), fuel: perVehicle.reduce((s, r) => s + r.fuelCost, 0),
      onTimeRate: done.length ? onTime / done.length : 0,
      passRate: checks.length ? checks.filter((c) => c.passed).length / checks.length : 0,
    };
  }, [data, period]);

  const exportCSV = () => downloadCSV('cost-per-vehicle.csv', [
    ['Rego', 'Name', 'Depot', 'Jobs', 'Maintenance', 'Fuel', 'Total', 'Km travelled', 'Cost per km', 'L/100km'],
    ...report.perVehicle.map((r) => [r.v.rego, r.v.name, r.v.depot, r.jobs, Math.round(r.maint), Math.round(r.fuelCost), Math.round(r.total), r.km, r.perKm.toFixed(2), r.eff.toFixed(1)]),
  ]);

  return (
    <>
      <PageHeader title="Reports" subtitle="Cost, reliability and compliance insights across the fleet."
        actions={<>
          <Select label="Period" value={period} onChange={setPeriod} options={[{ value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: '180', label: 'Last 6 months' }, { value: '365', label: 'Last 12 months' }, { value: 'all', label: 'All time' }]} />
          <button className="btn" onClick={() => window.print()}><Printer size={16} /> Print</button>
          <button className="btn" onClick={exportCSV}><Download size={16} /> Export CSV</button>
        </>} />
      <div className="stats">
        <StatCard label="Total spend" value={fmtMoney(report.maint + report.fuel, cur)} hint={`${fmtMoney(report.maint, cur)} maintenance · ${fmtMoney(report.fuel, cur)} fuel`} />
        <StatCard label="Jobs completed" value={report.done.length} />
        <StatCard label="Completed on time" value={`${Math.round(report.onTimeRate * 100)}%`} tone={report.onTimeRate >= 0.8 ? 'good' : 'warn'} />
        <StatCard label="Pre-start pass rate" value={`${Math.round(report.passRate * 100)}%`} tone={report.passRate >= 0.9 ? 'good' : 'warn'} />
      </div>

      <div className="grid-2">
        <Card title="Spend by depot">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={report.byDepot} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="depot" stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} width={60} tickFormatter={(x) => fmtMoney(x, cur)} />
              <Tooltip formatter={(x) => fmtMoney(Number(x), cur)} contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="Maintenance" stackId="a" fill="var(--accent)" />
              <Bar dataKey="Fuel" stackId="a" fill="var(--accent-2)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Maintenance spend by job type">
          {report.byType.length === 0 ? <p className="muted">No completed jobs in this period.</p> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={report.byType} dataKey="value" nameKey="name" outerRadius={85} innerRadius={45} stroke="none" label={({ name }) => name}>
                  {report.byType.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip formatter={(x) => fmtMoney(Number(x), cur)} contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card title="Cost per vehicle">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Vehicle</th><th>Depot</th><th className="num">Jobs</th><th className="num">Maintenance</th><th className="num">Fuel</th><th className="num">Total</th><th className="num">Km</th><th className="num">Cost / km</th><th className="num">L/100 km</th></tr></thead>
            <tbody>
              {report.perVehicle.map((r) => (
                <tr key={r.v.id}>
                  <td><Link className="strong" to={`/vehicles/${r.v.id}`}>{r.v.rego}</Link> <span className="muted small">{r.v.name}</span></td>
                  <td>{r.v.depot}</td><td className="num">{r.jobs}</td>
                  <td className="num">{fmtMoney(r.maint, cur)}</td><td className="num">{fmtMoney(r.fuelCost, cur)}</td>
                  <td className="num strong">{fmtMoney(r.total, cur)}</td><td className="num">{r.km ? fmtNum(r.km) : '—'}</td>
                  <td className="num">{r.perKm ? r.perKm.toFixed(2) : '—'}</td><td className="num">{r.eff ? fmtNum(r.eff, 1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Most reported defect areas">
          <ul className="bar-list">
            {report.defectCounts.map(([item, n]) => (
              <li key={item}><span>{item}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${(n / report.defectCounts[0][1]) * 100}%` }} /></div><b>{n}</b></li>
            ))}
            {report.defectCounts.length === 0 && <li className="muted">No defects in this period.</li>}
          </ul>
        </Card>
        <Card title="Workshop productivity">
          <table className="table compact">
            <thead><tr><th>Technician</th><th className="num">Jobs</th><th className="num">Labour hours</th></tr></thead>
            <tbody>
              {report.techs.map(([name, s]) => <tr key={name}><td>{name}</td><td className="num">{s.jobs}</td><td className="num">{fmtNum(s.hours, 1)}</td></tr>)}
              {report.techs.length === 0 && <tr><td colSpan={3} className="muted">No completed jobs.</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
