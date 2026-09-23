import type { AppData, ServiceSchedule, Vehicle, WorkOrder } from '../types';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const DAY = 86_400_000;

export const todayISO = () => toISO(new Date());

export function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISO(s: string) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

/** Whole days from today until `iso` (negative when in the past). */
export function daysUntil(iso: string) {
  return Math.round((parseISO(iso).getTime() - parseISO(todayISO()).getTime()) / DAY);
}

export function fmtDate(iso?: string) {
  if (!iso) return '—';
  return parseISO(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function relDays(iso: string) {
  const n = daysUntil(iso);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export const fmtNum = (n: number, digits = 0) =>
  n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });

export function fmtMoney(n: number, currency = 'USD') {
  try {
    return n.toLocaleString(undefined, { style: 'currency', currency, maximumFractionDigits: 0 });
  } catch {
    return `$${fmtNum(n)}`;
  }
}

// ---------- Service scheduling ----------

export type DueState = 'overdue' | 'due-soon' | 'ok';

export interface ServiceDue {
  schedule: ServiceSchedule;
  state: DueState;
  kmLeft?: number;
  daysLeft?: number;
  hoursLeft?: number;
  nextDate?: string;
  nextKm?: number;
  /** 0 → just done, 1 → due now, >1 overdue. */
  progress: number;
  label: string;
}

export function serviceDue(schedule: ServiceSchedule, vehicle?: Vehicle): ServiceDue {
  const parts: number[] = [];
  const labels: string[] = [];
  let state: DueState = 'ok';
  const res: ServiceDue = { schedule, state, progress: 0, label: '' };

  if (schedule.intervalKm && vehicle) {
    res.nextKm = schedule.lastDoneKm + schedule.intervalKm;
    res.kmLeft = res.nextKm - vehicle.odometer;
    parts.push((vehicle.odometer - schedule.lastDoneKm) / schedule.intervalKm);
    if (res.kmLeft < 0) state = 'overdue';
    else if (res.kmLeft <= Math.max(500, schedule.intervalKm * 0.1)) state = worst(state, 'due-soon');
    labels.push(res.kmLeft < 0 ? `${fmtNum(-res.kmLeft)} km over` : `${fmtNum(res.kmLeft)} km`);
  }
  if (schedule.intervalHours && vehicle) {
    res.hoursLeft = schedule.lastDoneHours + schedule.intervalHours - vehicle.hours;
    parts.push((vehicle.hours - schedule.lastDoneHours) / schedule.intervalHours);
    if (res.hoursLeft < 0) state = 'overdue';
    else if (res.hoursLeft <= Math.max(25, schedule.intervalHours * 0.1)) state = worst(state, 'due-soon');
    labels.push(res.hoursLeft < 0 ? `${fmtNum(-res.hoursLeft)} h over` : `${fmtNum(res.hoursLeft)} h`);
  }
  if (schedule.intervalDays) {
    res.nextDate = addDays(schedule.lastDoneDate, schedule.intervalDays);
    res.daysLeft = daysUntil(res.nextDate);
    parts.push(-daysUntil(schedule.lastDoneDate) / schedule.intervalDays);
    if (res.daysLeft < 0) state = 'overdue';
    else if (res.daysLeft <= 14) state = worst(state, 'due-soon');
    labels.push(res.daysLeft < 0 ? `${-res.daysLeft} d over` : `${res.daysLeft} d`);
  }
  res.state = state;
  res.progress = parts.length ? Math.max(...parts) : 0;
  res.label = labels.join(' · ');
  return res;
}

function worst(a: DueState, b: DueState): DueState {
  const rank = { ok: 0, 'due-soon': 1, overdue: 2 };
  return rank[a] >= rank[b] ? a : b;
}

// ---------- Traffic-light health ----------

export type Health = 'green' | 'amber' | 'red';

export interface VehicleHealth {
  health: Health;
  reasons: string[];
}

export function vehicleHealth(v: Vehicle, data: AppData): VehicleHealth {
  const red: string[] = [];
  const amber: string[] = [];

  if (v.status === 'off-road') red.push('Off road');
  if (v.status === 'in-workshop') amber.push('In workshop');

  for (const d of data.defects) {
    if (d.vehicleId !== v.id || d.status === 'resolved') continue;
    (d.severity === 'critical' ? red : amber).push(`${cap(d.severity)} defect: ${d.item}`);
  }
  for (const s of data.schedules) {
    if (s.vehicleId !== v.id) continue;
    const due = serviceDue(s, v);
    if (due.state === 'overdue') red.push(`${s.name} overdue`);
    else if (due.state === 'due-soon') amber.push(`${s.name} due soon`);
  }
  for (const [label, date] of [['Registration', v.regoExpiry], ['Insurance', v.insuranceExpiry]] as const) {
    const n = daysUntil(date);
    if (n < 0) red.push(`${label} expired`);
    else if (n <= 30) amber.push(`${label} expires ${relDays(date)}`);
  }
  if (red.length) return { health: 'red', reasons: [...red, ...amber] };
  if (amber.length) return { health: 'amber', reasons: amber };
  return { health: 'green', reasons: [] };
}

// ---------- Costs ----------

export function workOrderCost(wo: WorkOrder, data: Pick<AppData, 'parts'>) {
  const parts = wo.parts.reduce((sum, p) => {
    const part = data.parts.find((x) => x.id === p.partId);
    return sum + (part ? part.unitCost * p.qty : 0);
  }, 0);
  const labour = wo.labourHours * wo.labourRate;
  return { parts, labour, total: parts + labour };
}

// ---------- Misc ----------

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const humanize = (s: string) => cap(s.replace(/-/g, ' '));

export function downloadCSV(filename: string, rows: (string | number | undefined)[][]) {
  const csv = rows
    .map((r) => r.map((c) => {
      const s = c === undefined ? '' : String(c);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\n');
  downloadBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function byId<T extends { id: string }>(list: T[], id?: string) {
  return id ? list.find((x) => x.id === id) : undefined;
}
