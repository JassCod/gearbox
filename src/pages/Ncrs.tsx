import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, FileSpreadsheet, FileText, Loader2, Plus, Printer, X, Check } from 'lucide-react';
import { useStore } from '../store';
import { useAuth, usePermissions } from '../auth';
import type { AppData, Ncr } from '../types';
import { PageHeader } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { DateField, MultiSelect } from '../components/forms';
import { employeeLabel, fleetNo, fmtDMY, matchesGroups, ncrCode } from '../lib/ncr';
import { addDays, byId, todayISO } from '../lib/utils';

// ---------- Groups / sub-groups filter, remembered per user ----------

export function useNcrFilters() {
  const { session } = useAuth();
  const key = `torqline:ncr-filters:${session?.user.id ?? 'local'}`;
  const read = () => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? '{}') as { groups?: string[]; subGroups?: string[] };
      return { groups: v.groups ?? [], subGroups: v.subGroups ?? [] };
    } catch { return { groups: [], subGroups: [] }; }
  };
  const [filters, setFilters] = useState(read);
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(filters)); } catch { /* storage unavailable */ }
  }, [key, filters]);
  return {
    ...filters,
    setGroups: (groups: string[]) => setFilters((f) => ({ ...f, groups })),
    setSubGroups: (subGroups: string[]) => setFilters((f) => ({ ...f, subGroups })),
  };
}

export function GroupFilters({ f, data }: { f: ReturnType<typeof useNcrFilters>; data: AppData }) {
  const groups = data.settings.depots.map((d) => ({ value: d, label: d }));
  const types = [...new Set(data.vehicles.map((v) => v.type))].sort().map((t) => ({ value: t, label: t }));
  return (
    <>
      <label className="field"><span>Groups</span><MultiSelect ariaLabel="Groups" values={f.groups} onChange={f.setGroups} options={groups} placeholder="All Groups" /></label>
      <label className="field"><span>SubGroups</span><MultiSelect ariaLabel="SubGroups" values={f.subGroups} onChange={f.setSubGroups} options={types} placeholder="All SubGroups" /></label>
    </>
  );
}

// ---------- Register columns (shared by the lists and the exported registers) ----------

export function ncrColumns(data: AppData, closed: boolean): Column<Ncr>[] {
  const v = (n: Ncr) => byId(data.vehicles, n.vehicleId);
  const e = (n: Ncr) => byId(data.drivers, n.employeeId);
  const cols: Column<Ncr>[] = [
    { key: 'number', label: 'NCR #', value: (n) => ncrCode(n), sortValue: (n) => n.number, nowrap: true, render: (n) => <b className="mono nowrap">{ncrCode(n)}</b> },
    { key: 'scheme', label: 'Scheme', value: (n) => n.schemeType },
    { key: 'category', label: 'Category', value: (n) => n.category },
    { key: 'type', label: 'NCR Type', value: (n) => n.ncrType },
    { key: 'reported', label: 'Reported', value: (n) => fmtDMY(n.reportedDate), sortValue: (n) => n.reportedDate, nowrap: true },
    { key: 'fleet', label: 'Fleet #', value: (n) => { const x = v(n); return x ? fleetNo(x) : ''; } },
    { key: 'rego', label: 'Registration', value: (n) => v(n)?.rego ?? '', nowrap: true },
    { key: 'employee', label: 'Employee', value: (n) => { const x = e(n); return x ? employeeLabel(x) : ''; } },
    { key: 'contractor', label: 'Contractor', value: (n) => byId(data.contractors, n.contractorId)?.name ?? '' },
    { key: 'page', label: 'Page #', value: (n) => n.pageNumber },
    { key: 'problem', label: 'Problem', value: (n) => n.problem, wrap: true, width: '28%', render: (n) => <div className="dt-problem">{n.problem}</div> },
  ];
  if (closed) cols.push({ key: 'completed', label: 'Completed', value: (n) => fmtDMY(n.closedDate), sortValue: (n) => n.closedDate, nowrap: true });
  return cols;
}

// ---------- Open / closed lists ----------

export default function Ncrs({ closed = false }: { closed?: boolean }) {
  const { data } = useStore();
  const perm = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const f = useNcrFilters();
  const scoped = useMemo(() => data.ncrs.filter((n) => matchesGroups(n, data, f.groups, f.subGroups)), [data, f.groups, f.subGroups]);
  const openCount = scoped.filter((n) => !n.closed).length;
  const closedCount = scoped.length - openCount;
  const rows = useMemo(() => scoped.filter((n) => n.closed === closed), [scoped, closed]);
  const columns = useMemo(() => ncrColumns(data, closed), [data, closed]);
  const title = closed ? 'Closed Non Conformances' : 'Open Non Conformances';

  return (
    <>
      <PageHeader title={title} subtitle="Non-conformance reports, suggestions for improvement and breach notices – from the problem to the preventative action." />
      <div className="ncr-filters"><GroupFilters f={f} data={data} /></div>
      <div className="ncr-tiles">
        {perm.canWrite('ncrs')
          ? <Link to="/ncr/new" state={{ from: location.pathname }} className="ncr-tile tile-add"><Plus size={30} /><span>Add New</span></Link>
          : <div className="ncr-tile tile-add disabled" title="You don't have permission to raise NCRs"><Plus size={30} /><span>Add New</span></div>}
        <Link to="/ncr" className={`ncr-tile tile-dark ${!closed ? 'on' : ''}`}><b>{openCount}</b><span>Open / In Progress</span></Link>
        <Link to="/ncr/closed" className={`ncr-tile tile-dark ${closed ? 'on' : ''}`}><b><CheckCircle2 size={22} /> {closedCount}</b><span>Closed</span></Link>
        <Link to="/ncr/reports" className="ncr-tile tile-reports"><Printer size={28} /><span>Reports</span></Link>
      </div>
      <div className="card">
        <DataTable
          key={closed ? 'closed' : 'open'}
          title={title}
          exportName={closed ? 'closed-non-conformances' : 'open-non-conformances'}
          columns={columns}
          rows={rows}
          defaultSort={{ key: 'number', dir: 'desc' }}
          onRowClick={(n) => navigate(`/ncr/${n.id}`, { state: { from: location.pathname } })}
          empty={closed ? 'No closed non conformances' : 'No open non conformances – nice work'}
        />
      </div>
    </>
  );
}

// ---------- Reports ----------

type Format = 'pdf' | 'xlsx';

export function NcrReports() {
  const { data } = useStore();
  const f = useNcrFilters();
  const [from, setFrom] = useState(addDays(todayISO(), -30));
  const [to, setTo] = useState(todayISO());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const scoped = data.ncrs.filter((n) => matchesGroups(n, data, f.groups, f.subGroups));
  const open = scoped.filter((n) => !n.closed).sort((a, b) => b.number - a.number);
  const closed = scoped.filter((n) => n.closed && (!from || n.closedDate >= from) && (!to || n.closedDate <= to)).sort((a, b) => b.number - a.number);
  const groupText = [
    f.groups.length ? `Groups: ${f.groups.join(', ')}` : 'All Groups',
    f.subGroups.length ? `SubGroups: ${f.subGroups.join(', ')}` : 'All SubGroups',
  ].join(' · ');

  const run = async (kind: 'open' | 'closed', format: Format) => {
    setBusy(`${kind}-${format}`); setError('');
    try {
      const ex = await import('../lib/ncrExport');
      const isClosed = kind === 'closed';
      const opts = {
        data, rows: isClosed ? closed : open, closed: isClosed,
        title: isClosed ? 'Closed Non Conformance Register' : 'Open Non Conformance Register',
        filters: isClosed ? `${groupText} · Closed ${fmtDMY(from) || 'any time'} – ${fmtDMY(to) || 'today'}` : groupText,
        fileName: `${isClosed ? 'closed' : 'open'}-non-conformance-register-${todayISO()}`,
      };
      if (format === 'pdf') await ex.registerPdf(opts); else ex.registerXlsx(opts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the report');
    } finally { setBusy(null); }
  };

  const reports = [
    { kind: 'open' as const, name: 'Open Non Conformance Register', desc: 'This report lists all open non conformances.', dated: false, count: open.length },
    { kind: 'closed' as const, name: 'Closed Non Conformance Register', desc: 'This report lists all closed non conformances.', dated: true, count: closed.length },
  ];
  const Btn = ({ kind, format }: { kind: 'open' | 'closed'; format: Format }) => (
    <button className={`btn btn-sm ${format === 'pdf' ? 'btn-pdf' : 'btn-xlsx'}`} disabled={!!busy} onClick={() => run(kind, format)}>
      {busy === `${kind}-${format}` ? <Loader2 size={14} className="spin" /> : format === 'pdf' ? <FileText size={14} /> : <FileSpreadsheet size={14} />}
      {format.toUpperCase()}
    </button>
  );

  return (
    <>
      <PageHeader title="Non Conformance Reports" subtitle={<Link className="link" to="/ncr">← Back to open non conformances</Link>} />
      <div className="ncr-filters three">
        <GroupFilters f={f} data={data} />
        <div className="field"><span>Date</span>
          <div className="date-range">
            <DateField ariaLabel="From date" value={from} onChange={setFrom} />
            <span className="muted">–</span>
            <DateField ariaLabel="To date" value={to} onChange={setTo} />
          </div>
        </div>
      </div>
      {error && <div className="banner tone-bad">{error}</div>}
      <div className="card">
        <div className="dt-scroll">
          <table className="dt-table reports-table">
            <thead><tr><th>Report Name</th><th className="center">Groups Filtered</th><th className="center">Date Filtered</th><th>File Type</th></tr></thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.kind}>
                  <td><strong>{r.name}</strong><div className="small muted">{r.desc} <span className="badge tone-neutral">{r.count} record{r.count === 1 ? '' : 's'}</span></div></td>
                  <td className="center"><Check size={18} className="tone-text-good" aria-label="Yes" /></td>
                  <td className="center">{r.dated ? <Check size={18} className="tone-text-good" aria-label="Yes" /> : <X size={18} className="tone-text-bad" aria-label="No" />}</td>
                  <td><div className="row gap-sm"><Btn kind={r.kind} format="pdf" /><Btn kind={r.kind} format="xlsx" /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted mt">The closed register only includes NCRs whose closed date falls inside the date range. A single NCR is printed from the NCR itself.</p>
      </div>
    </>
  );
}
