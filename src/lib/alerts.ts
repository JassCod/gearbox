import type { AppData } from '../types';
import { ncrAge, ncrSummary } from './ncr';
import { daysUntil, relDays, serviceDue } from './utils';
import { ENTITIES, entityLink, entityTitle } from './entities';

export interface Alert {
  id: string;
  level: 'bad' | 'warn';
  kind: 'Service' | 'Defect' | 'Compliance' | 'Stock' | 'Driver' | 'Reminder' | 'NCR' | 'Audit' | 'Document';
  text: string;
  to: string;
}

/** Everything in the fleet that needs attention, most urgent first. */
export function buildAlerts(data: AppData): Alert[] {
  const out: Alert[] = [];
  const vehicle = (id: string) => data.vehicles.find((v) => v.id === id);

  for (const s of data.schedules) {
    const v = vehicle(s.vehicleId);
    if (!v) continue;
    const due = serviceDue(s, v);
    if (due.state === 'ok') continue;
    out.push({
      id: `svc-${s.id}`, level: due.state === 'overdue' ? 'bad' : 'warn', kind: 'Service',
      text: `${v.rego}: ${s.name} ${due.state === 'overdue' ? 'overdue' : 'due soon'} (${due.label})`,
      to: `/maintenance/${s.id}`,
    });
  }
  for (const d of data.defects) {
    if (d.status !== 'open') continue;
    const v = vehicle(d.vehicleId);
    out.push({
      id: `def-${d.id}`, level: d.severity === 'critical' ? 'bad' : 'warn', kind: 'Defect',
      text: `${v?.rego ?? 'Unknown'}: ${d.severity} defect – ${d.item} (no work order)`, to: `/defects/${d.id}`,
    });
  }
  for (const v of data.vehicles) {
    for (const [label, date] of [['Registration', v.regoExpiry], ['Insurance', v.insuranceExpiry]] as const) {
      const n = daysUntil(date);
      if (n <= 30) out.push({
        id: `cmp-${v.id}-${label}`, level: n < 0 ? 'bad' : 'warn', kind: 'Compliance',
        text: `${v.rego}: ${label} ${n < 0 ? 'expired' : 'expires'} ${relDays(date)}`, to: `/vehicles/${v.id}`,
      });
    }
  }
  for (const dr of data.drivers) {
    const docs: [string, string][] = [
      ['licence', dr.licenceExpiry], ['medical', dr.medicalExpiry],
      ...dr.trainings.map((t) => [t.name, t.expiry] as [string, string]),
    ];
    for (const [label, date] of docs) {
      const n = daysUntil(date);
      if (n <= 30) out.push({
        id: `drv-${dr.id}-${label}`, level: n < 0 ? 'bad' : 'warn', kind: 'Driver',
        text: `${dr.name}: ${label} ${n < 0 ? 'expired' : 'expires'} ${relDays(date)}`, to: `/drivers/${dr.id}`,
      });
    }
  }
  for (const p of data.parts) {
    if (p.qty <= p.minQty) out.push({
      id: `stk-${p.id}`, level: p.qty === 0 ? 'bad' : 'warn', kind: 'Stock',
      text: `${p.name}: ${p.qty === 0 ? 'out of stock' : `only ${p.qty} left (min ${p.minQty})`}`, to: `/parts/${p.id}`,
    });
  }
  for (const r of data.reminders) {
    if (r.done) continue;
    const n = daysUntil(r.dueDate);
    if (n <= 2) out.push({
      id: `rem-${r.id}`, level: n < 0 ? 'bad' : 'warn', kind: 'Reminder',
      text: `${r.title} – ${n < 0 ? 'overdue' : 'due'} ${relDays(r.dueDate)} (${ENTITIES[r.entityType].singular}: ${entityTitle(data, r.entityType, r.entityId)})`,
      to: `${entityLink(r.entityType, r.entityId)}?tab=reminders`,
    });
  }
  for (const n of data.ncrs) {
    if (n.closed) continue;
    const age = ncrAge(n);
    if (!n.shortTerm.trim() && age > 2) out.push({
      id: `ncr-${n.id}`, level: age > 7 ? 'bad' : 'warn', kind: 'NCR',
      text: `NCR-${n.number} ${n.ncrType || ncrSummary(n, 40)} – no short term fix recorded after ${age} days`, to: `/ncr/${n.id}`,
    });
    else if (age > 30) out.push({ id: `ncr-${n.id}`, level: 'warn', kind: 'NCR', text: `NCR-${n.number} ${n.ncrType || ncrSummary(n, 40)} – open for ${age} days`, to: `/ncr/${n.id}` });
  }
  for (const a of data.audits) {
    if (a.status === 'completed') continue;
    const days = daysUntil(a.date);
    if (days <= 3) out.push({ id: `aud-${a.id}`, level: days < 0 ? 'bad' : 'warn', kind: 'Audit', text: `AUD-${a.number} ${a.title} – ${days < 0 ? 'overdue' : 'scheduled'} ${relDays(a.date)}`, to: `/audits/${a.id}` });
  }
  for (const a of data.attachments) {
    if (!a.expiry) continue;
    const days = daysUntil(a.expiry);
    if (days <= 30) out.push({ id: `doc-${a.id}`, level: days < 0 ? 'bad' : 'warn', kind: 'Document', text: `${a.name} ${days < 0 ? 'expired' : 'expires'} ${relDays(a.expiry)}`, to: `${entityLink(a.entityType, a.entityId)}?tab=documents` });
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'bad' ? -1 : 1));
}
