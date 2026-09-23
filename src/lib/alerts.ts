import type { AppData } from '../types';
import { daysUntil, relDays, serviceDue } from './utils';

export interface Alert {
  id: string;
  level: 'bad' | 'warn';
  kind: 'Service' | 'Defect' | 'Compliance' | 'Stock' | 'Driver';
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
      to: '/maintenance',
    });
  }
  for (const d of data.defects) {
    if (d.status !== 'open') continue;
    const v = vehicle(d.vehicleId);
    out.push({
      id: `def-${d.id}`, level: d.severity === 'critical' ? 'bad' : 'warn', kind: 'Defect',
      text: `${v?.rego ?? 'Unknown'}: ${d.severity} defect – ${d.item} (no work order)`, to: '/defects',
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
        text: `${dr.name}: ${label} ${n < 0 ? 'expired' : 'expires'} ${relDays(date)}`, to: '/drivers',
      });
    }
  }
  for (const p of data.parts) {
    if (p.qty <= p.minQty) out.push({
      id: `stk-${p.id}`, level: p.qty === 0 ? 'bad' : 'warn', kind: 'Stock',
      text: `${p.name}: ${p.qty === 0 ? 'out of stock' : `only ${p.qty} left (min ${p.minQty})`}`, to: '/parts',
    });
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'bad' ? -1 : 1));
}
