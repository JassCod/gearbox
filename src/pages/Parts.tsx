import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Download, LayoutGrid, Minus, Package, PackagePlus, Pencil, Plus, Trash2, Truck, History as HistoryIcon } from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import type { Part } from '../types';
import { Badge, Card, Empty, Field, PageHeader, SearchInput, Select, StatCard, confirmAction } from '../components/ui';
import { EditCard, ItemPage } from '../components/ItemPage';
import { byId, downloadCSV, fmtDate, fmtMoney, uid } from '../lib/utils';

export default function Parts() {
  const { data, upsert } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [category, setCategory] = useState('all');
  const [lowOnly, setLowOnly] = useState(params.get('low') === '1');
  const cur = data.settings.currency;
  const perm = usePermissions();
  const canEdit = perm.canWrite('parts');

  const categories = useMemo(() => [...new Set(data.parts.map((p) => p.category))].sort(), [data.parts]);
  const rows = useMemo(() => data.parts.filter((p) => {
    const s = q.toLowerCase();
    return (!s || [p.sku, p.name, p.supplier, p.location].some((f) => f.toLowerCase().includes(s)))
      && (category === 'all' || p.category === category) && (!lowOnly || p.qty <= p.minQty);
  }).sort((a, b) => a.name.localeCompare(b.name)), [data.parts, q, category, lowOnly]);

  const value = data.parts.reduce((s, p) => s + p.qty * p.unitCost, 0);
  const low = data.parts.filter((p) => p.qty <= p.minQty);

  const reorderList = () => downloadCSV('reorder-list.csv', [
    ['SKU', 'Part', 'Supplier', 'In stock', 'Minimum', 'Suggested order', 'Unit cost', 'Line total'],
    ...low.map((p) => { const order = Math.max(p.minQty * 2 - p.qty, 1); return [p.sku, p.name, p.supplier, p.qty, p.minQty, order, p.unitCost, order * p.unitCost]; }),
  ]);

  return (
    <>
      <PageHeader title="Parts inventory" subtitle="Stock is deducted automatically when a work order using the part is completed."
        actions={<>
          <button className="btn" onClick={reorderList} disabled={!low.length}><Download size={16} /> Re-order list</button>
          {canEdit && <Link className="btn btn-primary" to="/parts/new"><Plus size={16} /> Add part</Link>}
        </>} />
      <div className="stats">
        <StatCard label="Stock value" value={fmtMoney(value, cur)} hint={`${data.parts.length} part lines`} />
        <StatCard label="Low stock" value={low.length} tone={low.length ? 'warn' : 'good'} hint="At or below minimum" onClick={() => setLowOnly(true)} />
        <StatCard label="Out of stock" value={low.filter((p) => p.qty === 0).length} tone={low.some((p) => p.qty === 0) ? 'bad' : 'good'} />
        <StatCard label="Suppliers" value={new Set(data.parts.map((p) => p.supplier)).size} />
      </div>
      <Card>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search SKU, name, supplier…" />
          <Select label="Category" value={category} onChange={setCategory} options={[{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c, label: c }))]} />
          <label className="check"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only</label>
        </div>
        {rows.length === 0 ? <Empty icon={<Package size={32} />} title="No parts found" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>SKU</th><th>Part</th><th>Category</th><th>Location</th><th>Supplier</th><th className="num">Unit cost</th><th className="num">Stock</th><th>Level</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/parts/${p.id}`)}>
                    <td className="mono small">{p.sku}</td>
                    <td className="strong">{p.name}</td>
                    <td>{p.category}</td>
                    <td>{p.location}</td>
                    <td>{p.supplier}</td>
                    <td className="num">{fmtMoney(p.unitCost, cur)}</td>
                    <td className="num" onClick={(e) => e.stopPropagation()}>
                      <div className="stepper-mini">
                        <button className="icon-btn" disabled={!canEdit} aria-label="Decrease" onClick={() => upsert('parts', { ...p, qty: Math.max(0, p.qty - 1) })}><Minus size={14} /></button>
                        <b>{p.qty}</b>
                        <button className="icon-btn" disabled={!canEdit} aria-label="Increase" onClick={() => upsert('parts', { ...p, qty: p.qty + 1 })}><Plus size={14} /></button>
                      </div>
                    </td>
                    <td><StockGauge part={p} /></td>
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

function StockGauge({ part }: { part: Part }) {
  const pct = Math.min(100, (part.qty / Math.max(1, part.minQty * 2)) * 100);
  const tone = part.qty === 0 ? 'bad' : part.qty <= part.minQty ? 'warn' : 'good';
  return (
    <div className="stock-gauge" title={`${part.qty} in stock, minimum ${part.minQty}`}>
      <div className={`stock-fill tone-${tone}`} style={{ width: `${Math.max(4, pct)}%` }} />
      <span className="stock-min" style={{ left: '50%' }} />
    </div>
  );
}

function PartFields({ p, set }: { p: Part; set: <K extends keyof Part>(k: K, v: Part[K]) => void }) {
  const { data } = useStore();
  const categories = [...new Set(data.parts.map((x) => x.category))];
  const suppliers = [...new Set(data.parts.map((x) => x.supplier))];
  return (
    <>
      <Field label="SKU"><input className="input" required value={p.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
      <Field label="Name"><input className="input" required value={p.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Category"><input className="input" list="cats" value={p.category} onChange={(e) => set('category', e.target.value)} />
        <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <Field label="Location"><input className="input" value={p.location} onChange={(e) => set('location', e.target.value)} /></Field>
      <Field label="Supplier"><input className="input" list="sups" value={p.supplier} onChange={(e) => set('supplier', e.target.value)} />
        <datalist id="sups">{suppliers.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <Field label="Unit cost"><input className="input" type="number" min={0} step={0.01} value={p.unitCost} onChange={(e) => set('unitCost', Number(e.target.value))} /></Field>
      <Field label="Quantity in stock"><input className="input" type="number" min={0} value={p.qty} onChange={(e) => set('qty', Number(e.target.value))} /></Field>
      <Field label="Minimum stock"><input className="input" type="number" min={0} value={p.minQty} onChange={(e) => set('minQty', Number(e.target.value))} /></Field>
    </>
  );
}

export function NewPart() {
  const { upsert } = useStore();
  const navigate = useNavigate();
  const [p, setP] = useState<Part>({ id: uid(), sku: '', name: '', category: 'General', qty: 0, minQty: 1, unitCost: 0, location: '', supplier: '' });
  const set = <K extends keyof Part>(k: K, v: Part[K]) => setP((x) => ({ ...x, [k]: v }));
  return (
    <>
      <PageHeader title="Add a part" subtitle="Track stock, cost and where it's used." />
      <EditCard title="Part details" submitLabel="Create part" onCancel={() => navigate('/parts')} onSubmit={() => { upsert('parts', p); navigate(`/parts/${p.id}`); }}>
        <PartFields p={p} set={set} />
      </EditCard>
    </>
  );
}

export function PartDetail() {
  const { id } = useParams();
  const { data, upsert, remove } = useStore();
  const perm = usePermissions();
  const navigate = useNavigate();
  const p = byId(data.parts, id);
  const [draft, setDraft] = useState<Part | null>(null);
  const [receive, setReceive] = useState(0);
  if (!p) return <Empty title="Part not found"><Link to="/parts" className="link">Back to parts</Link></Empty>;
  const cur = data.settings.currency;
  const canEdit = perm.canWrite('parts');
  const uses = data.workOrders.filter((w) => w.parts.some((x) => x.partId === p.id)).sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));
  const consumed = uses.filter((w) => w.status === 'completed').reduce((s, w) => s + (w.parts.find((x) => x.partId === p.id)?.qty ?? 0), 0);
  const reserved = uses.filter((w) => w.status !== 'completed').reduce((s, w) => s + (w.parts.find((x) => x.partId === p.id)?.qty ?? 0), 0);
  const vehicles = [...new Set(uses.map((w) => w.vehicleId))].map((vid) => byId(data.vehicles, vid)).filter(Boolean);
  const tone = p.qty === 0 ? 'bad' : p.qty <= p.minQty ? 'warn' : 'good';
  const set = <K extends keyof Part>(k: K, v: Part[K]) => setDraft((x) => (x ? { ...x, [k]: v } : x));

  return (
    <ItemPage
      entity={{ type: 'part', id: p.id }}
      back={{ to: '/parts', label: 'All parts' }}
      icon={<Package size={28} />}
      accent={tone === 'bad' ? 'red' : tone === 'warn' ? 'amber' : 'teal'}
      eyebrow={<>Part · {p.category}</>}
      title={p.name}
      subtitle={<span className="mono">{p.sku}</span>}
      badges={<><span className={`badge tone-${tone}`}>{p.qty === 0 ? 'Out of stock' : p.qty <= p.minQty ? 'Low stock' : 'In stock'}</span><span className="badge tone-neutral">{p.location || 'No location'}</span></>}
      actions={<>
        {canEdit && !draft && <button className="btn" onClick={() => setDraft(p)}><Pencil size={16} /> Edit</button>}
        {perm.canDelete && <button className="icon-btn" title="Delete" onClick={() => { if (confirmAction(`Delete ${p.name}?`)) { remove('parts', p.id); navigate('/parts'); } }}><Trash2 size={16} /></button>}
      </>}
      stats={[
        { label: 'In stock', value: p.qty, hint: `minimum ${p.minQty}`, tone },
        { label: 'Reserved on open jobs', value: reserved, hint: reserved > p.qty ? 'More than in stock!' : 'will be deducted on completion', tone: reserved > p.qty ? 'bad' : undefined },
        { label: 'Unit cost', value: fmtMoney(p.unitCost, cur), hint: `stock value ${fmtMoney(p.unitCost * p.qty, cur)}` },
        { label: 'Used to date', value: consumed, hint: `on ${uses.filter((w) => w.status === 'completed').length} jobs` },
      ]}
      tabs={[
        {
          id: 'overview', label: 'Overview', icon: <LayoutGrid size={15} />, render: () => (
            <div className="stack">
              {draft && <EditCard title="Edit part" onCancel={() => setDraft(null)} onSubmit={() => { upsert('parts', draft); setDraft(null); }}><PartFields p={draft} set={set} /></EditCard>}
              <div className="grid-2">
                <Card title="Stock level">
                  <div className="stock-hero">
                    <div className={`stock-number tone-text-${tone}`}>{p.qty}</div>
                    <div className="grow"><StockGauge part={p} /><div className="small muted">Line marks 2× minimum. Re-order when at or below {p.minQty}.</div></div>
                  </div>
                  {canEdit && (
                    <form className="row gap-sm" onSubmit={(e) => { e.preventDefault(); if (receive > 0) { upsert('parts', { ...p, qty: p.qty + receive }); setReceive(0); } }}>
                      <input className="input" type="number" min={1} placeholder="Qty received" value={receive || ''} onChange={(e) => setReceive(Number(e.target.value))} />
                      <button className="btn btn-primary"><PackagePlus size={16} /> Receive stock</button>
                    </form>
                  )}
                </Card>
                <Card title="Supplier & storage">
                  <dl className="details">
                    <dt>Supplier</dt><dd>{p.supplier || '—'}</dd>
                    <dt>Location</dt><dd>{p.location || '—'}</dd>
                    <dt>Category</dt><dd>{p.category}</dd>
                    <dt>Suggested order</dt><dd>{p.qty <= p.minQty ? `${Math.max(p.minQty * 2 - p.qty, 1)} units (${fmtMoney(Math.max(p.minQty * 2 - p.qty, 1) * p.unitCost, cur)})` : 'Not needed'}</dd>
                  </dl>
                </Card>
              </div>
            </div>
          ),
        },
        {
          id: 'usage', label: 'Usage', icon: <HistoryIcon size={15} />, count: uses.length, render: () => (
            <div className="grid-side">
              <Card title="Jobs using this part">
                {uses.length === 0 ? <Empty title="Not used on any job yet" /> : (
                  <table className="table compact">
                    <thead><tr><th>Job</th><th>Vehicle</th><th>Status</th><th className="num">Qty</th><th>Date</th></tr></thead>
                    <tbody>{uses.map((w) => (
                      <tr key={w.id} className="clickable" onClick={() => navigate(`/work-orders/${w.id}`)}>
                        <td>#{w.number} {w.title}</td><td>{byId(data.vehicles, w.vehicleId)?.rego}</td><td><Badge value={w.status} /></td>
                        <td className="num">{w.parts.find((x) => x.partId === p.id)?.qty}</td><td>{fmtDate(w.completedAt ?? w.dueDate)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </Card>
              <Card title={<><Truck size={16} /> Fitted to</>}>
                <ul className="list">{vehicles.map((v) => <li key={v!.id}><Link className="link" to={`/vehicles/${v!.id}`}>{v!.rego} · {v!.name}</Link></li>)}{vehicles.length === 0 && <li className="muted">—</li>}</ul>
              </Card>
            </div>
          ),
        },
      ]}
    />
  );
}
