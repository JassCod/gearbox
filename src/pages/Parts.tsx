import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Minus, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import type { Part } from '../types';
import { Badge, Card, Empty, Field, Modal, PageHeader, SearchInput, Select, StatCard, confirmAction } from '../components/ui';
import { downloadCSV, fmtMoney, uid } from '../lib/utils';

export default function Parts() {
  const { data, upsert, remove } = useStore();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [category, setCategory] = useState('all');
  const [lowOnly, setLowOnly] = useState(params.get('low') === '1');
  const [editing, setEditing] = useState<Part | null>(null);
  const cur = data.settings.currency;

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
    ...low.map((p) => {
      const order = Math.max(p.minQty * 2 - p.qty, 1);
      return [p.sku, p.name, p.supplier, p.qty, p.minQty, order, p.unitCost, order * p.unitCost];
    }),
  ]);

  return (
    <>
      <PageHeader title="Parts inventory" subtitle="Stock is deducted automatically when a work order using the part is completed."
        actions={<>
          <button className="btn" onClick={reorderList} disabled={!low.length}><Download size={16} /> Re-order list</button>
          <button className="btn btn-primary" onClick={() => setEditing({ id: uid(), sku: '', name: '', category: categories[0] ?? 'General', qty: 0, minQty: 1, unitCost: 0, location: '', supplier: '' })}><Plus size={16} /> Add part</button>
        </>} />
      <div className="stats">
        <StatCard label="Stock value" value={fmtMoney(value, cur)} hint={`${data.parts.length} part lines`} />
        <StatCard label="Low stock" value={low.length} tone={low.length ? 'warn' : 'good'} hint="At or below minimum" onClick={() => setLowOnly(true)} />
        <StatCard label="Out of stock" value={low.filter((p) => p.qty === 0).length} tone={low.some((p) => p.qty === 0) ? 'bad' : 'good'} />
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
              <thead><tr><th>SKU</th><th>Part</th><th>Category</th><th>Location</th><th>Supplier</th><th className="num">Unit cost</th><th className="num">Stock</th><th></th><th></th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="mono small">{p.sku}</td>
                    <td className="strong">{p.name}</td>
                    <td>{p.category}</td>
                    <td>{p.location}</td>
                    <td>{p.supplier}</td>
                    <td className="num">{fmtMoney(p.unitCost, cur)}</td>
                    <td className="num">
                      <div className="stepper">
                        <button className="icon-btn" aria-label="Decrease" onClick={() => upsert('parts', { ...p, qty: Math.max(0, p.qty - 1) })}><Minus size={14} /></button>
                        <b>{p.qty}</b>
                        <button className="icon-btn" aria-label="Increase" onClick={() => upsert('parts', { ...p, qty: p.qty + 1 })}><Plus size={14} /></button>
                      </div>
                      <div className="small muted">min {p.minQty}</div>
                    </td>
                    <td>{p.qty === 0 ? <Badge value="critical" label="Out" /> : p.qty <= p.minQty ? <Badge value="due-soon" label="Low" /> : <Badge value="ok" label="OK" />}</td>
                    <td>
                      <div className="row gap-xs end">
                        <button className="icon-btn" onClick={() => setEditing(p)} aria-label="Edit"><Pencil size={16} /></button>
                        <button className="icon-btn" onClick={() => confirmAction(`Delete ${p.name}?`) && remove('parts', p.id)} aria-label="Delete"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <PartForm part={editing} categories={categories} onClose={() => setEditing(null)} />}
    </>
  );
}

function PartForm({ part, categories, onClose }: { part: Part; categories: string[]; onClose: () => void }) {
  const { upsert } = useStore();
  const [p, setP] = useState(part);
  const set = <K extends keyof Part>(k: K, val: Part[K]) => setP((x) => ({ ...x, [k]: val }));
  return (
    <Modal title={part.name || 'New part'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="part-form">Save</button></>}>
      <form id="part-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); upsert('parts', p); onClose(); }}>
        <Field label="SKU"><input className="input" required value={p.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
        <Field label="Name"><input className="input" required value={p.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Category"><input className="input" list="cats" value={p.category} onChange={(e) => set('category', e.target.value)} />
          <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Location"><input className="input" value={p.location} onChange={(e) => set('location', e.target.value)} /></Field>
        <Field label="Supplier"><input className="input" value={p.supplier} onChange={(e) => set('supplier', e.target.value)} /></Field>
        <Field label="Unit cost"><input className="input" type="number" min={0} step={0.01} value={p.unitCost} onChange={(e) => set('unitCost', Number(e.target.value))} /></Field>
        <Field label="Quantity in stock"><input className="input" type="number" min={0} value={p.qty} onChange={(e) => set('qty', Number(e.target.value))} /></Field>
        <Field label="Minimum stock"><input className="input" type="number" min={0} value={p.minQty} onChange={(e) => set('minQty', Number(e.target.value))} /></Field>
      </form>
    </Modal>
  );
}
