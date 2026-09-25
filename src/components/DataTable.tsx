import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clipboard, FileSpreadsheet, Printer } from 'lucide-react';
import { downloadCSV } from '../lib/utils';

export interface Column<T> {
  key: string;
  label: string;
  /** Plain value used for sorting, searching, copying and exporting. */
  value: (row: T) => string | number;
  render?: (row: T) => ReactNode;
  /** Sort by this instead of `value` (e.g. ISO date behind a DD/MM/YYYY label). */
  sortValue?: (row: T) => string | number;
  /** Let long text wrap onto several lines. */
  wrap?: boolean;
  width?: string;
  mono?: boolean;
  /** Keep on one line (codes, dates). */
  nowrap?: boolean;
}

const PAGE_SIZES = [10, 25, 50, 100];

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

/**
 * Register-style table: search across every column, sortable headers, pagination,
 * and Copy / CSV / Print of the rows currently matched.
 */
export function DataTable<T extends { id: string }>({ columns, rows, defaultSort, onRowClick, exportName, title, empty, rowClassName }: {
  columns: Column<T>[];
  rows: T[];
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  onRowClick?: (row: T) => void;
  exportName: string;
  title: string;
  empty?: ReactNode;
  rowClassName?: (row: T) => string;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(defaultSort ?? { key: columns[0].key, dir: 'asc' as const });
  const [size, setSize] = useState(25);
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = q ? rows.filter((r) => columns.some((c) => String(c.value(r)).toLowerCase().includes(q))) : rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return hit;
    const get = col.sortValue ?? col.value;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...hit].sort((a, b) => {
      const x = get(a); const y = get(b);
      if (x === y) return 0;
      if (x === '' || x === undefined) return 1;
      if (y === '' || y === undefined) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * dir;
    });
  }, [rows, columns, query, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / size));
  useEffect(() => { setPage(0); }, [query, size, rows.length]);
  useEffect(() => { if (page >= pages) setPage(pages - 1); }, [page, pages]);
  const shown = filtered.slice(page * size, page * size + size);

  const table = () => [columns.map((c) => c.label), ...filtered.map((r) => columns.map((c) => String(c.value(r))))];
  const copy = async () => {
    const tsv = table().map((r) => r.map((c) => c.replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t')).join('\n');
    try { await navigator.clipboard.writeText(tsv); } catch { /* clipboard blocked – nothing else to do */ }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  const print = () => {
    const [head, ...body] = table();
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>
      body{font:12px system-ui,sans-serif;color:#111;margin:24px} h1{font-size:18px;margin:0 0 4px} p{color:#666;margin:0 0 14px}
      table{border-collapse:collapse;width:100%} th,td{border:1px solid #ccc;padding:5px 7px;text-align:left;vertical-align:top;white-space:pre-wrap}
      th{background:#f1f5f9} tr:nth-child(even) td{background:#fafafa}</style></head><body>
      <h1>${escapeHtml(title)}</h1><p>${filtered.length} entries · printed ${new Date().toLocaleString()}</p>
      <table><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <script>window.onload=()=>{window.print()}</script></body></html>`);
    w.document.close();
  };
  const toggleSort = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const from = filtered.length ? page * size + 1 : 0;
  const to = Math.min(filtered.length, (page + 1) * size);
  const pageButtons = Array.from({ length: pages }, (_, i) => i).filter((i) => i === 0 || i === pages - 1 || Math.abs(i - page) <= 2);

  return (
    <div className="dt">
      <div className="dt-top">
        <div className="dt-buttons">
          <button type="button" className="btn btn-sm" onClick={copy}><Clipboard size={14} /> {copied ? 'Copied' : 'Copy'}</button>
          <button type="button" className="btn btn-sm" onClick={() => downloadCSV(`${exportName}.csv`, table())}><FileSpreadsheet size={14} /> CSV</button>
          <button type="button" className="btn btn-sm" onClick={print}><Printer size={14} /> Print</button>
        </div>
        <label className="dt-search"><span>Search:</span><input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      </div>
      <div className="dt-scroll">
        <table className="dt-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={{ width: c.width }} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => toggleSort(c.key)}>
                    {c.label}
                    {sort.key === c.key ? (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="dt-idle" />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={`${onRowClick ? 'clickable' : ''} ${rowClassName?.(r) ?? ''}`} tabIndex={onRowClick ? 0 : undefined}
                onClick={() => onRowClick?.(r)} onKeyDown={(e) => { if (onRowClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onRowClick(r); } }}>
                {columns.map((c) => <td key={c.key} className={`${c.wrap ? 'wrap' : ''} ${c.mono ? 'mono' : ''} ${c.nowrap ? 'nowrap' : ''}`}>{c.render ? c.render(r) : c.value(r)}</td>)}
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={columns.length} className="dt-empty">{query ? 'No matching records found' : empty ?? 'No data available'}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="dt-foot">
        <span className="small muted">Showing {from} to {to} of {filtered.length} entries{filtered.length !== rows.length ? ` (filtered from ${rows.length})` : ''}</span>
        <div className="row gap-sm">
          <label className="small muted row gap-sm">Show
            <select className="input input-sm" value={size} onChange={(e) => setSize(Number(e.target.value))}>{PAGE_SIZES.map((n) => <option key={n}>{n}</option>)}</select>
          </label>
          <nav className="dt-pages" aria-label="Pages">
            <button type="button" aria-label="First page" disabled={page === 0} onClick={() => setPage(0)}><ChevronsLeft size={14} /></button>
            <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></button>
            {pageButtons.map((i, k) => (
              <span key={i} className="row">
                {k > 0 && i - pageButtons[k - 1] > 1 && <span className="dt-gap">…</span>}
                <button type="button" className={i === page ? 'on' : ''} aria-current={i === page ? 'page' : undefined} onClick={() => setPage(i)}>{i + 1}</button>
              </span>
            ))}
            <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></button>
            <button type="button" aria-label="Last page" disabled={page >= pages - 1} onClick={() => setPage(pages - 1)}><ChevronsRight size={14} /></button>
          </nav>
        </div>
      </div>
    </div>
  );
}
