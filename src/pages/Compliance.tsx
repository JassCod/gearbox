import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarCheck, Download, FileWarning, ShieldCheck, Clock, TriangleAlert, Plus } from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import { Badge, Card, PageHeader, Select, StatCard } from '../components/ui';
import { auditScore, complianceRegister, complianceScore, describeDue } from '../lib/compliance';
import { daysUntil, downloadCSV, fmtDate, relDays } from '../lib/utils';

export function ScoreGauge({ score, grade, size = 220 }: { score: number; grade: string; size?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf = 0; const start = performance.now();
    const tick = (t: number) => { const p = Math.min(1, (t - start) / 1100); setShown(Math.round(score * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);
  const angle = -120 + (shown / 100) * 240;
  const tone = score >= 90 ? 'good' : score >= 75 ? 'warn' : 'bad';
  const arc = (from: number, to: number) => {
    const p = (deg: number) => { const r = ((deg - 90) * Math.PI) / 180; return [100 + 80 * Math.cos(r), 100 + 80 * Math.sin(r)]; };
    const [x1, y1] = p(from); const [x2, y2] = p(to);
    return `M ${x1} ${y1} A 80 80 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  return (
    <div className="gauge" style={{ width: size }}>
      <svg viewBox="0 0 200 170">
        <defs>
          <linearGradient id="gaugeGrad" x1="0" x2="1"><stop offset="0%" stopColor="var(--bad)" /><stop offset="55%" stopColor="var(--warn)" /><stop offset="100%" stopColor="var(--good)" /></linearGradient>
        </defs>
        <path d={arc(-120, 120)} className="gauge-track" />
        <path d={arc(-120, Math.max(-119, angle))} stroke="url(#gaugeGrad)" className="gauge-value" />
        {[0, 25, 50, 75, 100].map((t) => { const r = ((-120 + t * 2.4 - 90) * Math.PI) / 180; return <line key={t} x1={100 + 64 * Math.cos(r)} y1={100 + 64 * Math.sin(r)} x2={100 + 70 * Math.cos(r)} y2={100 + 70 * Math.sin(r)} className="gauge-tick" />; })}
        <g transform={`rotate(${angle} 100 100)`}><line x1="100" y1="100" x2="100" y2="36" className="gauge-needle" /><circle cx="100" cy="100" r="7" className="gauge-hub" /></g>
      </svg>
      <div className="gauge-readout"><strong className={`tone-text-${tone}`}>{shown}</strong><span className={`grade grade-${grade}`}>{grade}</span></div>
    </div>
  );
}

export default function Compliance() {
  const { data } = useStore();
  const navigate = useNavigate();
  const perm = usePermissions();
  const score = useMemo(() => complianceScore(data), [data]);
  const register = useMemo(() => complianceRegister(data), [data]);
  const [filter, setFilter] = useState<'attention' | 'all' | 'expired' | 'expiring'>('attention');
  const [kind, setKind] = useState('all');
  const rows = register.filter((r) => (filter === 'all' || (filter === 'attention' ? r.state !== 'ok' : r.state === filter)) && (kind === 'all' || r.kind === kind));
  const openNcrs = data.ncrs.filter((n) => !n.closed);
  const upcomingAudits = data.audits.filter((a) => a.status !== 'completed').sort((a, b) => a.date.localeCompare(b.date));
  const tally = (key: (n: (typeof openNcrs)[number]) => string) => Object.entries(openNcrs.reduce<Record<string, number>>((m, n) => { const k = key(n) || 'Not set'; return { ...m, [k]: (m[k] ?? 0) + 1 }; }, {})).sort((a, b) => b[1] - a[1]);
  const byScheme = tally((n) => n.schemeType);
  const byCategory = tally((n) => n.ncrType).slice(0, 8);
  const docKinds = ['Licence', 'Medical', ...new Set(data.drivers.flatMap((d) => d.trainings.map((t) => t.name)))].slice(0, 7);

  return (
    <>
      <PageHeader title="Compliance" subtitle="One place for every obligation: documents, licences, NCRs and audits."
        actions={<>
          <button className="btn" onClick={() => downloadCSV('compliance-register.csv', [['Kind', 'Subject', 'Item', 'Expiry', 'Days left', 'State'], ...register.map((r) => [r.kind, r.subject, r.what, r.date, r.days, r.state])])}><Download size={16} /> Export register</button>
          {perm.canWrite('ncrs') && <Link className="btn btn-primary" to="/ncr/new"><Plus size={16} /> Raise NCR</Link>}
        </>} />

      <div className="compliance-hero card">
        <ScoreGauge score={score.score} grade={score.grade} />
        <div className="grow">
          <h2>Compliance score</h2>
          <p className="muted">{score.score >= 90 ? 'Excellent – you would breeze through an external audit.' : score.score >= 75 ? 'Good, with a few loose ends to tidy up.' : score.score >= 60 ? 'Some real gaps. Work through the list below.' : 'At risk. Prioritise the items below today.'}</p>
          <ul className="factor-list">
            {score.factors.map((f) => (
              <li key={f.label}><Link to={f.to}><span className="factor-penalty">−{f.penalty}</span><span><strong>{f.label}</strong><span className="small muted"> · {f.detail}</span></span></Link></li>
            ))}
            {score.factors.length === 0 && <li className="tone-text-good">Nothing is dragging your score down. 🎉</li>}
          </ul>
        </div>
      </div>

      <div className="stats">
        <StatCard label="Expired items" value={register.filter((r) => r.state === 'expired').length} icon={<TriangleAlert size={18} />} tone={register.some((r) => r.state === 'expired') ? 'bad' : 'good'} onClick={() => setFilter('expired')} />
        <StatCard label="Expiring in 30 days" value={register.filter((r) => r.state === 'expiring').length} icon={<Clock size={18} />} tone="warn" onClick={() => setFilter('expiring')} />
        <StatCard label="Open NCRs" value={openNcrs.length} icon={<FileWarning size={18} />} tone={openNcrs.length ? 'warn' : 'good'} onClick={() => navigate('/ncr')} />
        <StatCard label="Audits due" value={upcomingAudits.length} icon={<CalendarCheck size={18} />} onClick={() => navigate('/audits')} />
      </div>

      <div className="grid-side-left">
        <div className="stack">
          <Card title="Open NCRs by scheme" actions={<Link className="link small" to="/ncr">Non conformances</Link>}>
            <ul className="bar-list">
              {byScheme.map(([c, n]) => <li key={c}><span>{c}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${(n / byScheme[0][1]) * 100}%` }} /></div><b>{n}</b></li>)}
              {byScheme.length === 0 && <li className="muted">No open NCRs.</li>}
            </ul>
          </Card>
          <Card title="Open NCRs by type">
            <ul className="bar-list">
              {byCategory.map(([c, n]) => <li key={c}><span>{c}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${(n / byCategory[0][1]) * 100}%` }} /></div><b>{n}</b></li>)}
              {byCategory.length === 0 && <li className="muted">No open NCRs.</li>}
            </ul>
          </Card>
          <Card title="Upcoming audits" actions={perm.canWrite('audits') && <Link className="link small" to="/audits/new">Schedule</Link>}>
            <ul className="list">
              {upcomingAudits.map((a) => {
                const s = auditScore(a);
                return <li key={a.id}><div><Link className="strong" to={`/audits/${a.id}`}>{a.title}</Link><div className="small muted">{fmtDate(a.date)} · {relDays(a.date)} · {s.answered}/{s.total}</div></div><Badge value={a.status} /></li>;
              })}
              {upcomingAudits.length === 0 && <li className="muted">No audits scheduled.</li>}
            </ul>
          </Card>
        </div>
        <div className="stack">
          <Card title="Expiry register">
            <div className="toolbar">
              <div className="segmented">
                {([['attention', 'Needs attention'], ['expired', 'Expired'], ['expiring', 'Expiring'], ['all', 'Everything']] as const).map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}
              </div>
              <Select label="Kind" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All kinds' }, { value: 'Vehicle', label: 'Vehicles' }, { value: 'Driver', label: 'Drivers' }, { value: 'Document', label: 'Documents' }]} />
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Subject</th><th>Item</th><th>Expiry</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="clickable" onClick={() => navigate(r.to)}>
                      <td><span className="strong">{r.subject}</span><div className="small muted">{r.kind}</div></td>
                      <td>{r.what}</td>
                      <td>{fmtDate(r.date)}<div className="small muted">{r.days < 0 ? `${-r.days} days ago` : `in ${r.days} days`}</div></td>
                      <td><Badge value={r.state === 'expired' ? 'overdue' : r.state === 'expiring' ? 'due-soon' : 'ok'} label={r.state === 'expired' ? 'Expired' : r.state === 'expiring' ? 'Expiring' : 'Valid'} /></td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={4} className="muted center">Nothing here – all clear.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Driver compliance matrix">
            <div className="table-wrap">
              <table className="table compact matrix">
                <thead><tr><th>Driver</th>{docKinds.map((k) => <th key={k} className="center">{k}</th>)}</tr></thead>
                <tbody>
                  {data.drivers.map((d) => (
                    <tr key={d.id} className="clickable" onClick={() => navigate(`/drivers/${d.id}`)}>
                      <td className="strong">{d.name}</td>
                      {docKinds.map((k) => {
                        const date = k === 'Licence' ? d.licenceExpiry : k === 'Medical' ? d.medicalExpiry : d.trainings.find((t) => t.name === k)?.expiry;
                        if (!date) return <td key={k} className="center muted">—</td>;
                        const n = daysUntil(date);
                        return <td key={k} className="center"><span className={`matrix-dot tone-${n < 0 ? 'bad' : n <= 30 ? 'warn' : 'good'}`} title={`${k}: ${fmtDate(date)} (${describeDue(date)})`} /></td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted"><ShieldCheck size={12} /> Green = valid, amber = expires within 30 days, red = expired.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
