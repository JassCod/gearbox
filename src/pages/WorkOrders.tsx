import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2, ClipboardList, Download, LayoutGrid, ListChecks, Package, Pencil, Plus, Printer, Trash2, TriangleAlert, Wrench, X,
} from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import type { Priority, WorkOrder, WorkOrderStatus, WorkOrderType } from '../types';
import { Badge, Card, Empty, Field, PageHeader, SearchInput, Select, confirmAction } from '../components/ui';
import { EditCard, ItemPage } from '../components/ItemPage';
import { celebrate } from '../components/celebrate';
import { addDays, byId, daysUntil, downloadCSV, fmtDate, fmtMoney, fmtNum, relDays, todayISO, uid, workOrderCost } from '../lib/utils';

export const WO_COLUMNS: { status: WorkOrderStatus; label: string }[] = [
  { status: 'open', label: 'Open' },
  { status: 'in-progress', label: 'In progress' },
  { status: 'waiting-parts', label: 'Waiting on parts' },
  { status: 'completed', label: 'Completed' },
];
const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default function WorkOrders() {
  const { data, setWorkOrderStatus } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [assignee, setAssignee] = useState('all');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [dragId, setDragId] = useState<string | null>(null);
  const perm = usePermissions();
  const canEdit = perm.canWrite('workOrders');

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

  const drop = (status: WorkOrderStatus) => {
    if (dragId && canEdit) {
      const wo = byId(data.workOrders, dragId);
      setWorkOrderStatus(dragId, status);
      if (status === 'completed' && wo?.status !== 'completed') celebrate(`Job #${wo?.number} complete!`);
    }
    setDragId(null);
  };

  return (
    <>
      <PageHeader title="Work orders" subtitle={canEdit ? 'Drag cards between columns to update their status, or open a job for full details.' : 'Read-only – your role cannot change work orders.'}
        actions={<>
          <button className="btn" onClick={exportCSV}><Download size={16} /> Export CSV</button>
          {canEdit && <Link className="btn btn-primary" to="/work-orders/new"><Plus size={16} /> New work order</Link>}
        </>} />
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search number, title, rego…" />
        <Select label="Assignee" value={assignee} onChange={setAssignee} options={[{ value: 'all', label: 'Everyone' }, ...assignees.map((a) => ({ value: a, label: a }))]} />
        <div className="segmented push-right">
          <button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>Board</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button>
        </div>
      </div>

      {view === 'board' ? (
        <div className="board">
          {WO_COLUMNS.map((col) => {
            const items = filtered.filter((w) => w.status === col.status);
            const shown = col.status === 'completed' ? items.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')).slice(0, 15) : items;
            return (
              <div key={col.status} className={`column col-${col.status} ${dragId ? 'droppable' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(col.status)}>
                <div className="column-head"><span>{col.label}</span><span className="pill">{items.length}</span></div>
                {shown.map((w) => {
                  const v = byId(data.vehicles, w.vehicleId);
                  const late = w.status !== 'completed' && daysUntil(w.dueDate) < 0;
                  const tasks = w.tasks ?? [];
                  const doneTasks = tasks.filter((t) => t.done).length;
                  return (
                    <button key={w.id} className={`wo-card prio-${w.priority}`} draggable={canEdit}
                      onDragStart={() => setDragId(w.id)} onDragEnd={() => setDragId(null)} onClick={() => navigate(`/work-orders/${w.id}`)}>
                      <div className="row between"><span className="small muted">#{w.number} · {w.type}</span><Badge value={w.priority} /></div>
                      <strong>{w.title}</strong>
                      <div className="small">{v?.rego} · {v?.name}</div>
                      {tasks.length > 0 && (
                        <div className="mini-progress"><div style={{ width: `${(doneTasks / tasks.length) * 100}%` }} /><span className="small muted">{doneTasks}/{tasks.length} tasks</span></div>
                      )}
                      <div className="row between small">
                        <span className={late ? 'tone-text-bad' : 'muted'}>{w.status === 'completed' ? `Done ${fmtDate(w.completedAt)}` : `Due ${relDays(w.dueDate)}`}</span>
                        <span className="muted">{w.assignee || 'Unassigned'}</span>
                      </div>
                    </button>
                  );
                })}
                {items.length > shown.length && <div className="small muted center">+{items.length - shown.length} older</div>}
                {items.length === 0 && <div className="column-empty small muted">Drop jobs here</div>}
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
                  <tr key={w.id} className="clickable" onClick={() => navigate(`/work-orders/${w.id}`)}>
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
    </>
  );
}

export function blankWorkOrder(number: number, vehicleId: string, labourRate: number): WorkOrder {
  return {
    id: uid(), number, vehicleId, title: '', description: '', type: 'Repair', priority: 'medium', status: 'open', assignee: '',
    dueDate: addDays(todayISO(), 3), createdAt: todayISO(), labourHours: 1, labourRate, parts: [], tasks: [],
  };
}

function WorkOrderFields({ w, set, withStatus = false }: { w: WorkOrder; set: <K extends keyof WorkOrder>(k: K, v: WorkOrder[K]) => void; withStatus?: boolean }) {
  const { data } = useStore();
  const assignees = [...new Set(data.workOrders.map((x) => x.assignee).filter(Boolean))];
  return (
    <>
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
      {withStatus && (
        <Field label="Status">
          <select className="input" value={w.status} onChange={(e) => set('status', e.target.value as WorkOrderStatus)}>
            {WO_COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
          </select>
        </Field>
      )}
      <Field label="Assigned to"><input className="input" list="assignees" value={w.assignee} onChange={(e) => set('assignee', e.target.value)} />
        <datalist id="assignees">{assignees.map((a) => <option key={a} value={a} />)}</datalist>
      </Field>
      <Field label="Due date"><input className="input" type="date" required value={w.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>
      <Field label="Labour hours"><input className="input" type="number" min={0} step={0.25} value={w.labourHours} onChange={(e) => set('labourHours', Number(e.target.value))} /></Field>
      <Field label="Labour rate / hour"><input className="input" type="number" min={0} value={w.labourRate} onChange={(e) => set('labourRate', Number(e.target.value))} /></Field>
      <Field label="Description" span><textarea className="input" rows={3} value={w.description} onChange={(e) => set('description', e.target.value)} /></Field>
    </>
  );
}

export function NewWorkOrder() {
  const { data, upsert, nextNumber } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [w, setW] = useState(() => blankWorkOrder(nextNumber('workOrders'), params.get('vehicle') ?? data.vehicles[0]?.id ?? '', data.settings.labourRate));
  const set = <K extends keyof WorkOrder>(k: K, v: WorkOrder[K]) => setW((p) => ({ ...p, [k]: v }));
  const templates: Record<string, string[]> = {
    Service: ['Drain and replace engine oil', 'Replace oil, fuel and air filters', 'Grease chassis points', 'Check belts, hoses and fluids', 'Road test'],
    Tyres: ['Inspect tread and sidewalls', 'Replace tyres', 'Balance and torque wheel nuts', 'Re-check torque after 50 km'],
    Inspection: ['Brakes', 'Steering & suspension', 'Lights & electrical', 'Body & cabin', 'Documentation'],
  };
  if (!data.vehicles.length) return <Empty title="Add a vehicle first"><Link className="link" to="/vehicles/new">Add a vehicle</Link></Empty>;
  return (
    <>
      <PageHeader title={`New work order #${w.number}`} subtitle="Plan the job, then open it to add parts, tasks, documents and notes." />
      <EditCard title="Job details" submitLabel="Create work order" onCancel={() => navigate(-1)} onSubmit={() => {
        const tasks = w.tasks?.length ? w.tasks : (templates[w.type] ?? []).map((text) => ({ id: uid(), text, done: false }));
        upsert('workOrders', { ...w, tasks });
        navigate(`/work-orders/${w.id}`);
      }}>
        <WorkOrderFields w={w} set={set} />
        {templates[w.type] && <p className="small muted span-2">✨ A standard {w.type.toLowerCase()} task checklist will be added automatically – you can change it on the job page.</p>}
      </EditCard>
    </>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function WorkOrderDetail() {
  const { id } = useParams();
  const { data, upsert, remove, setWorkOrderStatus } = useStore();
  const perm = usePermissions();
  const navigate = useNavigate();
  const w = byId(data.workOrders, id);
  const [draft, setDraft] = useState<WorkOrder | null>(null);
  const [newTask, setNewTask] = useState('');
  const [addPart, setAddPart] = useState('');
  if (!w) return <Empty title="Work order not found"><Link to="/work-orders" className="link">Back to work orders</Link></Empty>;

  const canEdit = perm.canWrite('workOrders');
  const v = byId(data.vehicles, w.vehicleId);
  const cost = workOrderCost(w, data);
  const cur = data.settings.currency;
  const tasks = w.tasks ?? [];
  const doneTasks = tasks.filter((t) => t.done).length;
  const defect = byId(data.defects, w.defectId);
  const schedule = byId(data.schedules, w.scheduleId);
  const ncrs = data.ncrs.filter((n) => n.workOrderId === w.id);
  const locked = w.status === 'completed';
  const late = !locked && daysUntil(w.dueDate) < 0;
  const set = <K extends keyof WorkOrder>(k: K, val: WorkOrder[K]) => setDraft((p) => (p ? { ...p, [k]: val } : p));
  const save = (patch: Partial<WorkOrder>) => upsert('workOrders', { ...w, ...patch });
  const moveTo = (status: WorkOrderStatus) => {
    setWorkOrderStatus(w.id, status);
    if (status === 'completed') celebrate(`Job #${w.number} complete!`);
  };

  const print = () => {
    const rows = w.parts.map((p) => { const part = byId(data.parts, p.partId); return `<tr><td>${part?.sku ?? ''}</td><td>${escapeHtml(part?.name ?? '')}</td><td>${p.qty}</td></tr>`; }).join('');
    const taskRows = tasks.map((t) => `<tr><td>${t.done ? '☑' : '☐'}</td><td>${escapeHtml(t.text)}</td></tr>`).join('');
    const win = window.open('', '_blank', 'width=720,height=900');
    if (!win) return;
    win.document.write(`<html><head><title>Job card #${w.number}</title><style>body{font:14px system-ui;padding:32px;color:#111}h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:8px}td,th{border:1px solid #ccc;padding:6px;text-align:left}.box{border:1px solid #ccc;min-height:120px;margin-top:8px;padding:8px}.muted{color:#666}</style></head><body>
      <h1>Job card #${w.number}</h1><div class="muted">${escapeHtml(data.settings.companyName)} · printed ${fmtDate(todayISO())}</div>
      <h2>${escapeHtml(w.title)}</h2>
      <p><b>Vehicle:</b> ${escapeHtml(v?.rego ?? '')} – ${escapeHtml(`${v?.year ?? ''} ${v?.make ?? ''} ${v?.model ?? ''}`)}<br/><b>Odometer:</b> ${v?.odometer.toLocaleString()} km · <b>Hours:</b> ${v?.hours}<br/>
      <b>Priority:</b> ${w.priority} · <b>Due:</b> ${fmtDate(w.dueDate)} · <b>Assigned:</b> ${escapeHtml(w.assignee || '—')}</p>
      <p>${escapeHtml(w.description)}</p>
      <h3>Tasks</h3><table>${taskRows || '<tr><td class="muted">None</td></tr>'}</table>
      <h3>Parts</h3><table><tr><th>SKU</th><th>Part</th><th>Qty</th></tr>${rows || '<tr><td colspan=3 class="muted">None</td></tr>'}</table>
      <h3>Technician notes</h3><div class="box"></div>
      <p style="margin-top:32px">Signed: ______________________ &nbsp; Date: ____________</p>
      <script>window.print()</script></body></html>`);
    win.document.close();
  };

  const stageIdx = WO_COLUMNS.findIndex((c) => c.status === w.status);

  return (
    <ItemPage
      entity={{ type: 'workOrder', id: w.id }}
      back={{ to: '/work-orders', label: 'All work orders' }}
      icon={<Wrench size={28} />}
      accent={w.priority === 'critical' ? 'red' : w.priority === 'high' ? 'amber' : locked ? 'teal' : 'blue'}
      eyebrow={<>Work order #{w.number} · {w.type}</>}
      title={w.title}
      subtitle={<>{v ? <Link className="link-light" to={`/vehicles/${v.id}`}>{v.rego} · {v.name}</Link> : 'Unknown vehicle'} · created {fmtDate(w.createdAt)}</>}
      badges={<><Badge value={w.priority} /><Badge value={w.status} />{late && <span className="badge tone-bad">Overdue</span>}</>}
      actions={<>
        <button className="btn" onClick={print}><Printer size={16} /> Job card</button>
        {canEdit && !draft && <button className="btn" onClick={() => setDraft(w)}><Pencil size={16} /> Edit</button>}
        {canEdit && !locked && <button className="btn btn-primary" onClick={() => moveTo('completed')}><CheckCircle2 size={16} /> Mark complete</button>}
        {perm.canDelete && <button className="icon-btn" title="Delete" onClick={() => { if (confirmAction('Delete this work order?')) { remove('workOrders', w.id); navigate('/work-orders'); } }}><Trash2 size={16} /></button>}
      </>}
      stats={[
        { label: 'Due', value: fmtDate(w.dueDate), hint: locked ? `Completed ${fmtDate(w.completedAt)}` : relDays(w.dueDate), tone: late ? 'bad' : undefined },
        { label: 'Assigned to', value: w.assignee || 'Unassigned' },
        { label: 'Tasks', value: tasks.length ? `${doneTasks}/${tasks.length}` : '—', hint: tasks.length ? `${Math.round((doneTasks / tasks.length) * 100)}% done` : 'No checklist' },
        { label: 'Labour', value: fmtMoney(cost.labour, cur), hint: `${fmtNum(w.labourHours, 2)} h × ${fmtMoney(w.labourRate, cur)}` },
        { label: 'Total cost', value: fmtMoney(cost.total, cur), hint: `${fmtMoney(cost.parts, cur)} parts` },
      ]}
      tabs={[
        {
          id: 'overview', label: 'Overview', icon: <LayoutGrid size={15} />, render: () => (
            <div className="stack">
              <Card>
                <div className="stepper">
                  {WO_COLUMNS.map((c, i) => (
                    <button key={c.status} className={`step ${i < stageIdx ? 'done' : ''} ${i === stageIdx ? 'current' : ''}`} disabled={!canEdit || c.status === w.status} onClick={() => moveTo(c.status)}>
                      <span className="step-dot">{i < stageIdx ? '✓' : i + 1}</span><span>{c.label}</span>
                    </button>
                  ))}
                </div>
                <p className="small muted">Completing a job deducts its parts from stock, resolves the linked defect and resets the linked service schedule.</p>
              </Card>
              {draft && (
                <EditCard title="Edit job" onCancel={() => setDraft(null)} onSubmit={() => { upsert('workOrders', { ...draft, status: w.status }); setDraft(null); }}>
                  <WorkOrderFields w={draft} set={set} />
                </EditCard>
              )}
              <div className="grid-2">
                <Card title="Job description"><p className="prose">{w.description || <span className="muted">No description.</span>}</p></Card>
                <Card title="Linked records">
                  <ul className="list">
                    {v && <li><span>Vehicle</span><Link className="link" to={`/vehicles/${v.id}`}>{v.rego} · {v.name}</Link></li>}
                    {defect && <li><span>Defect</span><Link className="link" to={`/defects/${defect.id}`}>{defect.item} ({defect.severity})</Link></li>}
                    {schedule && <li><span>Service schedule</span><Link className="link" to={`/maintenance/${schedule.id}`}>{schedule.name}</Link></li>}
                    {ncrs.map((n) => <li key={n.id}><span>NCR</span><Link className="link" to={`/ncr/${n.id}`}>NCR-{n.number} {n.title}</Link></li>)}
                    {!defect && !schedule && !ncrs.length && <li className="muted">No defect, schedule or NCR linked.</li>}
                  </ul>
                  {canEdit && <Link className="btn btn-sm" to={`/ncr/new?workOrder=${w.id}&vehicle=${w.vehicleId}`}><TriangleAlert size={14} /> Raise NCR from this job</Link>}
                </Card>
              </div>
            </div>
          ),
        },
        {
          id: 'tasks', label: 'Tasks', icon: <ListChecks size={15} />, count: tasks.length - doneTasks, render: () => (
            <Card title={`Task checklist · ${doneTasks}/${tasks.length}`}>
              {tasks.length > 0 && <div className="big-progress"><div style={{ width: `${tasks.length ? (doneTasks / tasks.length) * 100 : 0}%` }} /></div>}
              <ul className="task-list">
                {tasks.map((t) => (
                  <li key={t.id} className={t.done ? 'done' : ''}>
                    <label><input type="checkbox" checked={t.done} disabled={!canEdit} onChange={() => save({ tasks: tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) })} /> <span>{t.text}</span></label>
                    {canEdit && <button className="icon-btn" aria-label="Remove task" onClick={() => save({ tasks: tasks.filter((x) => x.id !== t.id) })}><X size={14} /></button>}
                  </li>
                ))}
                {tasks.length === 0 && <li className="muted">No tasks yet – break the job into steps.</li>}
              </ul>
              {canEdit && (
                <form className="row gap-sm" onSubmit={(e) => { e.preventDefault(); if (newTask.trim()) { save({ tasks: [...tasks, { id: uid(), text: newTask.trim(), done: false }] }); setNewTask(''); } }}>
                  <input className="input" placeholder="Add a task…" value={newTask} onChange={(e) => setNewTask(e.target.value)} />
                  <button className="btn"><Plus size={16} /> Add</button>
                </form>
              )}
              {tasks.length > 0 && doneTasks === tasks.length && !locked && canEdit && (
                <div className="banner tone-good row between"><span>🎉 All tasks done – ready to close this job?</span><button className="btn btn-primary btn-sm" onClick={() => moveTo('completed')}>Mark complete</button></div>
              )}
            </Card>
          ),
        },
        {
          id: 'parts', label: 'Parts & labour', icon: <Package size={15} />, count: w.parts.length, render: () => (
            <div className="grid-2">
              <Card title={<>Parts {locked && <span className="small muted">(stock already deducted)</span>}</>}>
                {w.parts.length === 0 ? <p className="muted">No parts on this job.</p> : (
                  <table className="table compact">
                    <thead><tr><th>Part</th><th className="num">Qty</th><th className="num">In stock</th><th className="num">Cost</th><th></th></tr></thead>
                    <tbody>
                      {w.parts.map((line, i) => {
                        const part = byId(data.parts, line.partId);
                        return (
                          <tr key={line.partId}>
                            <td>{part ? <Link className="link" to={`/parts/${part.id}`}>{part.name}</Link> : 'Deleted part'}<div className="small muted">{part?.sku}</div></td>
                            <td className="num"><input className="input input-xs" type="number" min={1} disabled={locked || !canEdit} value={line.qty}
                              onChange={(e) => save({ parts: w.parts.map((p, j) => (j === i ? { ...p, qty: Math.max(1, Number(e.target.value)) } : p)) })} /></td>
                            <td className={`num ${part && part.qty < line.qty && !locked ? 'tone-text-bad' : ''}`}>{part?.qty ?? 0}</td>
                            <td className="num">{fmtMoney((part?.unitCost ?? 0) * line.qty, cur)}</td>
                            <td>{!locked && canEdit && <button className="icon-btn" onClick={() => save({ parts: w.parts.filter((_, j) => j !== i) })} aria-label="Remove part"><X size={14} /></button>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {!locked && canEdit && (
                  <div className="row gap-sm">
                    <select className="input" value={addPart} onChange={(e) => setAddPart(e.target.value)} aria-label="Add part">
                      <option value="">Add a part from inventory…</option>
                      {data.parts.filter((p) => !w.parts.some((x) => x.partId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name} ({p.qty} in stock)</option>)}
                    </select>
                    <button className="btn" disabled={!addPart} onClick={() => { save({ parts: [...w.parts, { partId: addPart, qty: 1 }] }); setAddPart(''); }}>Add</button>
                  </div>
                )}
              </Card>
              <Card title="Cost summary">
                <div className="receipt">
                  <div><span>Labour ({fmtNum(w.labourHours, 2)} h × {fmtMoney(w.labourRate, cur)})</span><b>{fmtMoney(cost.labour, cur)}</b></div>
                  <div><span>Parts ({w.parts.reduce((s, p) => s + p.qty, 0)} items)</span><b>{fmtMoney(cost.parts, cur)}</b></div>
                  <div className="receipt-total"><span>Total</span><b>{fmtMoney(cost.total, cur)}</b></div>
                </div>
                {canEdit && !locked && (
                  <div className="form-grid">
                    <Field label="Labour hours"><input className="input" type="number" min={0} step={0.25} value={w.labourHours} onChange={(e) => save({ labourHours: Number(e.target.value) })} /></Field>
                    <Field label="Rate / hour"><input className="input" type="number" min={0} value={w.labourRate} onChange={(e) => save({ labourRate: Number(e.target.value) })} /></Field>
                  </div>
                )}
              </Card>
            </div>
          ),
        },
        {
          id: 'linked', label: 'Related', icon: <ClipboardList size={15} />, render: () => (
            <Card title={`Other jobs on ${v?.rego ?? 'this vehicle'}`}>
              <ul className="list">
                {data.workOrders.filter((x) => x.vehicleId === w.vehicleId && x.id !== w.id).slice(0, 12).map((x) => (
                  <li key={x.id}><div><Link className="strong" to={`/work-orders/${x.id}`}>#{x.number} {x.title}</Link><div className="small muted">{fmtDate(x.completedAt ?? x.dueDate)} · {fmtMoney(workOrderCost(x, data).total, cur)}</div></div><Badge value={x.status} /></li>
                ))}
              </ul>
            </Card>
          ),
        },
      ]}
    />
  );
}
