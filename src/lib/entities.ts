import type { AppData, CollectionKey, EntityType, Ncr } from '../types';
import { fmtDMY, ncrSummary } from './ncr';
import { humanize } from './utils';

type AnyItem = { id: string } & Record<string, unknown>;

export interface EntityMeta {
  type: EntityType;
  collection: CollectionKey;
  singular: string;
  plural: string;
  /** Base route; the item page lives at `${route}/${id}`. */
  route: string;
  title(item: AnyItem, data: AppData): string;
}

const vehicleName = (data: AppData, id: unknown) => data.vehicles.find((v) => v.id === id)?.rego ?? 'Unknown vehicle';

export const ENTITIES: Record<EntityType, EntityMeta> = {
  vehicle: { type: 'vehicle', collection: 'vehicles', singular: 'Vehicle', plural: 'Vehicles', route: '/vehicles',
    title: (v) => `${v.rego} · ${v.name}` },
  workOrder: { type: 'workOrder', collection: 'workOrders', singular: 'Work order', plural: 'Work orders', route: '/work-orders',
    title: (w) => `#${w.number} ${w.title}` },
  defect: { type: 'defect', collection: 'defects', singular: 'Defect', plural: 'Defects', route: '/defects',
    title: (d, data) => `${d.item} – ${vehicleName(data, d.vehicleId)}` },
  part: { type: 'part', collection: 'parts', singular: 'Part', plural: 'Parts', route: '/parts',
    title: (p) => `${p.name}` },
  driver: { type: 'driver', collection: 'drivers', singular: 'Driver', plural: 'Drivers', route: '/drivers',
    title: (d) => `${d.name}` },
  schedule: { type: 'schedule', collection: 'schedules', singular: 'Service schedule', plural: 'Service schedules', route: '/maintenance',
    title: (s, data) => `${s.name} – ${vehicleName(data, s.vehicleId)}` },
  check: { type: 'check', collection: 'checks', singular: 'Pre-start check', plural: 'Pre-start checks', route: '/checks',
    title: (c, data) => `Pre-start – ${vehicleName(data, c.vehicleId)}` },
  fuel: { type: 'fuel', collection: 'fuel', singular: 'Fuel fill', plural: 'Fuel log', route: '/fuel',
    title: (f, data) => `Fuel fill – ${vehicleName(data, f.vehicleId)}` },
  ncr: { type: 'ncr', collection: 'ncrs', singular: 'NCR', plural: 'NCRs', route: '/ncr',
    title: (n) => `NCR-${n.number} ${ncrSummary(n as unknown as Ncr, 50)}` },
  audit: { type: 'audit', collection: 'audits', singular: 'Audit', plural: 'Audits', route: '/audits',
    title: (a) => `AUD-${a.number} ${a.title}` },
};

export const ENTITY_BY_COLLECTION = Object.fromEntries(
  Object.values(ENTITIES).map((m) => [m.collection, m]),
) as Partial<Record<CollectionKey, EntityMeta>>;

export function findEntity(data: AppData, type: EntityType, id: string): AnyItem | undefined {
  return (data[ENTITIES[type].collection] as unknown as AnyItem[]).find((x) => x.id === id);
}

export function entityLink(type: EntityType, id: string) {
  // Fuel fills are simple log entries without their own page.
  return type === 'fuel' ? ENTITIES.fuel.route : `${ENTITIES[type].route}/${id}`;
}

export function entityTitle(data: AppData, type: EntityType, id: string) {
  const item = findEntity(data, type, id);
  return item ? ENTITIES[type].title(item, data) : `${ENTITIES[type].singular} (removed)`;
}

// Human labels for fields that show up in the item history.
const FIELD_LABELS: Record<string, string> = {
  rego: 'registration', regoExpiry: 'registration expiry', insuranceExpiry: 'insurance expiry', driverId: 'assigned driver',
  vehicleId: 'vehicle', dueDate: 'due date', labourHours: 'labour hours', labourRate: 'labour rate', minQty: 'minimum stock',
  qty: 'stock', unitCost: 'unit cost', licenceExpiry: 'licence expiry', medicalExpiry: 'medical expiry', lastDoneDate: 'last done date',
  lastDoneKm: 'last done km', intervalKm: 'km interval', intervalDays: 'day interval', intervalHours: 'hour interval',
  schemeType: 'scheme', ncrType: 'type', employeeId: 'employee', contractorId: 'contractor', pageNumber: 'page number',
  fitForDutyId: 'fit for duty', defectId: 'event (defect)', auditId: 'event (audit)', workOrderId: 'event (work order)',
  problem: 'problem', shortTerm: 'short term fix', cause: 'cause', longTerm: 'long term fix', reportedDate: 'reported date',
  reportedBy: 'reported by', shortTermDate: 'short term date', shortTermBy: 'short term fix by', causeDate: 'cause date',
  causeBy: 'cause by', longTermDate: 'long term date', longTermBy: 'long term fix by', closedDate: 'closed date',
  closedBy: 'closed by', closedPosition: 'closed position', closed: 'completed', items: 'checklist', tasks: 'tasks', parts: 'parts',
};

const fmtValue = (v: unknown) => {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString();
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDMY(v);
  if (typeof v === 'string') return v.length > 40 ? `${v.slice(0, 40)}…` : humanize(v);
  return '';
};

/** Summarise what changed between two versions of an item, for the history tab. */
export function describeChanges(before: AnyItem, after: AnyItem): { status?: string; text: string } | null {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const parts: string[] = [];
  let status: string | undefined;
  for (const k of keys) {
    if (k === 'id' || k === 'completedAt' || k === 'closedAt' || k === 'doneAt' || k === 'createdAt' || k === 'createdBy') continue;
    const a = before[k];
    const b = after[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (k === 'status') { status = `Status changed: ${fmtValue(a)} → ${fmtValue(b)}`; continue; }
    const label = FIELD_LABELS[k] ?? humanize(k.replace(/([A-Z])/g, ' $1').toLowerCase());
    const simple = typeof a !== 'object' && typeof b !== 'object';
    const long = ['description', 'notes', 'problem', 'shortTerm', 'cause', 'longTerm'].includes(k);
    parts.push(simple && !long ? `${label} ${fmtValue(a)} → ${fmtValue(b)}` : label);
  }
  if (!status && !parts.length) return null;
  const text = [status, parts.length ? `Updated ${parts.slice(0, 4).join(', ')}${parts.length > 4 ? ` +${parts.length - 4} more` : ''}` : '']
    .filter(Boolean).join(' · ');
  return { status, text };
}
