import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Plus, Printer, Trash2, X } from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import type { Priority, WorkOrder, WorkOrderStatus, WorkOrderType } from '../types';
import { Badge, Card, Field, Modal, PageHeader, SearchInput, Select, confirmAction } from '../components/ui';
import { addDays, byId, daysUntil, downloadCSV, fmtDate, fmtMoney, relDays, todayISO, uid, workOrderCost } from '../lib/utils';

const COLUMNS: { status: WorkOrderStatus; label: string }[] = [
  { status: 'open', label: 'Open' },
  { status: 'in-progress', label: 'In progress' },
  { status: 'waiting-parts', label: 'Waiting on parts' },
  { status: 'completed', label: 'Completed' },
];
const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default function WorkOrders() {
  const { data, setWorkOrderStatus, nextWorkOrderNumber } = useStore();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [assignee, setAssignee] = useState('all');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [dragId, setDragId] = useState<string | null>(null);
  const [editing, setEditing] = useState<WorkOrder | null>(null);
  const perm = usePermissions();
  const canEdit = perm.canWrite('workOrders');

  // Deep links: ?open=<id> opens a work order, ?new=1[&vehicle=<id>] starts a new one.
  useEffect(() => {
    const open = params.get('open');
    if (open) {
      const wo = byId(data.workOrders, open);
      if (wo) setEditing(wo);
    } else if (params.get('new') && canEdit) {
      setEditing(blankWorkOrder(nextWorkOrderNumber(), params.get('vehicle') ?? data.vehicles[0]?.id ?? '', data.settings.labourRate));
    }
  }, [params]);

  const close = () => { setEditing(null); if (params.has('open') || params.has('new')) setParams({}); };

  const assignees = useMemo(() => [...new Set(data.workOrders.map((w) => w.assignee).filter(Boolean))].sort(), [data.workOrders]);
  const filtered = useMemo(() => data.workOrders
    .filter((w) => {
      const s = q.toLowerCase();
      const v = byId(data.vehicles, w.vehicleId);
      return (!s || [String(w.number), w.title, w.assignee, v?.rego ?? ''].some((f) => f.toLowerCase().includes(s)))
        && (assignee === 'all' || w.assignee === assignee);
    })
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.dueDate.localeCompare(b.dueDate)), [data, q, assignee]);

  const exportCSV = () => downloadCSV('work-orders.csv', [
    ['Number', 'Vehicle', 'Title', 'Type', 'Priority', 'Status', 'Assignee', 'Due', 'Completed', 'Labour', 'Parts', 'Total'],
    ...filtered.map((w) => {
      const c = workOrderCost(w, data);
      return [w.number, byId(data.vehicles, w.vehicleId)?.rego, w.title, w.type, w.priority, w.status, w.assignee, w.dueDate, w.completedAt, c.labour, c.parts, c.total];
    }),
  ]);

  return (
    <>
      <PageHeader title="Work orders" subtitle={canEdit ? 'Drag cards between columns to update their status.' : 'Read-only – your role cannot change work orders.'}
        actions={<>
          <button className="btn" onClick={exportCSV}><Download size={16} /> Export CSV</button>
          {canEdit && <button className="btn btn-primary" disabled={!data.vehicles.length}
            onClick={() => setEditing(blankWorkOrder(nextWorkOrderNumber(), data.vehicles[0]?.id ?? '', data.settings.labourRate))}><Plus size={16} /> New work order</button>}
        </>} />
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search number, title, rego…" />
        <Select label="Assignee" value={assignee} onChange={setAssignee} options={[{ value: 'all', label: 'Everyone' }, ...assignees.map((a) => ({ value: a, label: a }))]} />
        <div className="segmented">
          <button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>Board</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button>
        </div>
      </div>

      {view === 'board' ? (
        <div className="board">
          {COLUMNS.map((col) => {
            const items = filtered.filter((w) => w.status === col.status);
            const shown = col.status === 'completed' ? items.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')).slice(0, 15) : items;
            return (
              <div key={col.status} className={`column ${dragId ? 'droppable' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId && canEdit) setWorkOrderStatus(dragId, col.status); setDragId(null); }}>
                <div className="column-head"><span>{col.label}</span><span className="pill">{items.length}</span></div>
                {shown.map((w) => {
                  const v = byId(data.vehicles, w.vehicleId);
                  const late = w.status !== 'completed' && daysUntil(w.dueDate) < 0;
                  return (
                    <button key={w.id} className={`wo-card prio-${w.priority}`} draggable={canEdit}
                      onDragStart={() => setDragId(w.id)} onDragEnd={() => setDragId(null)} onClick={() => setEditing(w)}>
                      <div className="row between"><span className="small muted">#{w.number} · {w.type}</span><Badge value={w.priority} /></div>
                      <strong>{w.title}</strong>
                      <div className="small">{v?.rego} · {v?.name}</div>
                      <div className="row between small">
                        <span className={late ? 'tone-text-bad' : 'muted'}>{w.status === 'completed' ? `Done ${fmtDate(w.completedAt)}` : `Due ${relDays(w.dueDate)}`}</span>
                        <span className="muted">{w.assignee || 'Unassigned'}</span>
                      </div>
                    </button>
                  );
                })}
                {items.length > shown.length && <div className="small muted center">+{items.length - shown.length} older</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>Title</th><th>Vehicle</th><th>Priority</th><th>Status</th><th>Assignee</th><th>Due</th><th className="num">Cost</th></tr></thead>
              <tbody>
                {filtered.map((w) => (
                  <tr key={w.id} className="clickable" onClick={() => setEditing(w)}>
                    <td>{w.number}</td><td className="strong">{w.title}</td><td>{byId(data.vehicles, w.vehicleId)?.rego}</td>
                    <td><Badge value={w.priority} /></td><td><Badge value={w.status} /></td><td>{w.assignee || '—'}</td>
                    <td>{fmtDate(w.dueDate)}</td><td className="num">{fmtMoney(workOrderCost(w, data).total, data.settings.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {editing && <WorkOrderForm key={editing.id} order={editing} onClose={close} />}
    </>
  );
}

function blankWorkOrder(number: number, vehicleId: string, labourRate: number): WorkOrder {
  return {
    id: uid(), number, vehicleId, title: '', description: '', type: 'Repair', priority: 'medium', status: 'open', assignee: '',
    dueDate: addDays(todayISO(), 3), createdAt: todayISO(), labourHours: 1, labourRate, parts: [],
  };
}

function WorkOrderForm({ order, onClose }: { order: WorkOrder; onClose: () => void }) {
  const { data, upsert, remove, setWorkOrderStatus } = useStore();
  const perm = usePermissions();
  const readOnly = !perm.canWrite('workOrders');
  const [w, setW] = useState(order);
  const [addPart, setAddPart] = useState('');
  const isNew = !data.workOrders.some((x) => x.id === order.id);
  const set = <K extends keyof WorkOrder>(k: K, val: WorkOrder[K]) => setW((p) => ({ ...p, [k]: val }));
  const cost = workOrderCost(w, data);
  const cur = data.settings.currency;
  const defect = byId(data.defects, w.defectId);
  const locked = order.status === 'completed';

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const statusChanged = !isNew && w.status !== order.status;
    // Save the fields first, then run the status transition so stock/defects/schedules update.
    upsert('workOrders', { ...w, status: statusChanged ? order.status : w.status, completedAt: statusChanged ? order.completedAt : w.completedAt });
    if (statusChanged) setWorkOrderStatus(w.id, w.status);
    onClose();
  };

  const print = () => {
    const v = byId(data.vehicles, w.vehicleId);
    const rows = w.parts.map((p) => {
      const part = byId(data.parts, p.partId);
      return `<tr><td>${part?.sku ?? ''}</td><td>${part?.name ?? ''}</td><td>${p.qty}</td></tr>`;
    }).join('');
    const win = window.open('', '_blank', 'width=720,height=900');
    if (!win) return;
    win.document.write(`<html><head><title>Job card #${w.number}</title><style>body{font:14px system-ui;padding:32px;color:#111}h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:8px}td,th{border:1px solid #ccc;padding:6px;text-align:left}.box{border:1px solid #ccc;min-height:120px;margin-top:8px;padding:8px}.muted{color:#666}</style></head><body>
      <h1>Job card #${w.number}</h1><div class="muted">${escapeHtml(data.settings.companyName)} · printed ${fmtDate(todayISO())}</div>
      <h2>${escapeHtml(w.title)}</h2>
      <p><b>Vehicle:</b> ${escapeHtml(v?.rego ?? '')} – ${escapeHtml(`${v?.year ?? ''} ${v?.make ?? ''} ${v?.model ?? ''}`)}<br/><b>Odometer:</b> ${v?.odometer.toLocaleString()} km · <b>Hours:</b> ${v?.hours}<br/>
      <b>Priority:</b> ${w.priority} · <b>Due:</b> ${fmtDate(w.dueDate)} · <b>Assigned:</b> ${escapeHtml(w.assignee || '—')}</p>
      <p>${escapeHtml(w.description)}</p>
      <h3>Parts</h3><table><tr><th>SKU</th><th>Part</th><th>Qty</th></tr>${rows || '<tr><td colspan=3 class="muted">None</td></tr>'}</table>
      <h3>Technician notes</h3><div class="box"></div>
      <p style="margin-top:32px">Signed: ______________________ &nbsp; Date: ____________</p>
      <script>window.print()</script></body></html>`);
    win.document.close();
  };

  return (
    <Modal title={isNew ? 'New work order' : `Work order #${w.number}`} onClose={onClose} wide
      footer={<>
        {!isNew && perm.canDelete && <button type="button" className="btn btn-danger-ghost push-left" onClick={() => { if (confirmAction('Delete this work order?')) { remove('workOrders', w.id); onClose(); } }}><Trash2 size={16} /> Delete</button>}
        {!isNew && <button type="button" className="btn" onClick={print}><Printer size={16} /> Job card</button>}
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        {!readOnly && <button className="btn btn-primary" form="wo-form">Save</button>}
      </>}>
      <form id="wo-form" onSubmit={save}>
      <fieldset className="plain form-grid" disabled={readOnly}>
        <Field label="Title" span><input className="input" required value={w.title} placeholder="What needs doing?" onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Vehicle">
          <select className="input" value={w.vehicleId} onChange={(e) => set('vehicleId', e.target.value)}>
            {data.vehicles.map((v) => <option key={v.id} value={v.id}>{v.rego} · {v.name}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select className="input" value={w.type} onChange={(e) => set('type', e.target.value as WorkOrderType)}>
            {['Service', 'Repair', 'Inspection', 'Tyres', 'Other'].map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className="input" value={w.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
            {['low', 'medium', 'high', 'critical'].map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="input" value={w.status} onChange={(e) => set('status', e.target.value as WorkOrderStatus)}>
            {COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Assigned to"><input className="input" list="assignees" value={w.assignee} onChange={(e) => set('assignee', e.target.value)} />
          <datalist id="assignees">{[...new Set(data.workOrders.map((x) => x.assignee).filter(Boolean))].map((a) => <option key={a} value={a} />)}</datalist>
        </Field>
        <Field label="Due date"><input className="input" type="date" required value={w.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>
        <Field label="Description" span><textarea className="input" rows={3} value={w.description} onChange={(e) => set('description', e.target.value)} /></Field>
        {defect && <p className="small span-2 muted">Linked defect: <Link className="link" to="/defects">{defect.item} – {defect.description}</Link> (resolved automatically when completed)</p>}
        {w.scheduleId && <p className="small span-2 muted">Linked to a service schedule – completing this resets the schedule.</p>}

        <div className="span-2 subsection">
          <h3>Parts {locked && <span className="small muted">(stock already deducted)</span>}</h3>
          {w.parts.length > 0 && (
            <table className="table compact">
              <thead><tr><th>Part</th><th className="num">Qty</th><th className="num">In stock</th><th className="num">Cost</th><th></th></tr></thead>
              <tbody>
                {w.parts.map((line, i) => {
                  const part = byId(data.parts, line.partId);
                  return (
                    <tr key={line.partId}>
                      <td>{part?.name ?? 'Deleted part'}<div className="small muted">{part?.sku}</div></td>
                      <td className="num"><input className="input input-xs" type="number" min={1} disabled={locked} value={line.qty}
                        onChange={(e) => set('parts', w.parts.map((p, j) => (j === i ? { ...p, qty: Math.max(1, Number(e.target.value)) } : p)))} /></td>
                      <td className={`num ${part && part.qty < line.qty && !locked ? 'tone-text-bad' : ''}`}>{part?.qty ?? 0}</td>
                      <td className="num">{fmtMoney((part?.unitCost ?? 0) * line.qty, cur)}</td>
                      <td>{!locked && <button type="button" className="icon-btn" onClick={() => set('parts', w.parts.filter((_, j) => j !== i))} aria-label="Remove part"><X size={14} /></button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!locked && (
            <div className="row gap-sm">
              <select className="input" value={addPart} onChange={(e) => setAddPart(e.target.value)} aria-label="Add part">
                <option value="">Add a part from inventory…</option>
                {data.parts.filter((p) => !w.parts.some((x) => x.partId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name} ({p.qty} in stock)</option>)}
              </select>
              <button type="button" className="btn" disabled={!addPart} onClick={() => { set('parts', [...w.parts, { partId: addPart, qty: 1 }]); setAddPart(''); }}>Add</button>
            </div>
          )}
        </div>

        <Field label="Labour hours"><input className="input" type="number" min={0} step={0.25} value={w.labourHours} onChange={(e) => set('labourHours', Number(e.target.value))} /></Field>
        <Field label="Labour rate / hour"><input className="input" type="number" min={0} value={w.labourRate} onChange={(e) => set('labourRate', Number(e.target.value))} /></Field>
        <div className="span-2 cost-summary">
          <span>Labour <b>{fmtMoney(cost.labour, cur)}</b></span>
          <span>Parts <b>{fmtMoney(cost.parts, cur)}</b></span>
          <span className="total">Total <b>{fmtMoney(cost.total, cur)}</b></span>
        </div>
      </fieldset>
      </form>
    </Modal>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
