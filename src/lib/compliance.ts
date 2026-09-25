import type { AppData, Audit, AuditItem } from '../types';
import { daysUntil, relDays, serviceDue, uid } from './utils';
import { ENTITIES, entityLink } from './entities';
import { ncrAge } from './ncr';

// ---------- Audit templates ----------

export interface AuditTemplate {
  type: string;
  description: string;
  scope: 'vehicle' | 'depot' | 'driver';
  sections: { name: string; questions: string[] }[];
}

export const AUDIT_TEMPLATES: AuditTemplate[] = [
  {
    type: 'Vehicle roadworthiness', scope: 'vehicle', description: 'Detailed safety inspection of one vehicle',
    sections: [
      { name: 'Brakes & steering', questions: ['Service brake performance within limits', 'Park brake holds on incline', 'No steering free-play or leaks'] },
      { name: 'Tyres & wheels', questions: ['Tread depth above legal minimum on all tyres', 'Wheel nuts tight, indicators aligned', 'No sidewall damage or bulges'] },
      { name: 'Lights & electrical', questions: ['All lamps and indicators working', 'Reflectors and conspicuity tape intact', 'Battery secure, terminals clean'] },
      { name: 'Cabin & safety gear', questions: ['Seatbelts latch and retract', 'Fire extinguisher in date and mounted', 'First aid kit complete'] },
      { name: 'Documentation', questions: ['Registration current and displayed', 'Service log up to date', 'Pre-starts completed for last 7 days'] },
    ],
  },
  {
    type: 'Depot safety walk', scope: 'depot', description: 'Workshop and yard housekeeping and hazards',
    sections: [
      { name: 'Housekeeping', questions: ['Walkways clear and marked', 'Spills cleaned, spill kit stocked', 'Waste oil stored in bunded area'] },
      { name: 'Equipment', questions: ['Hoists and jacks inspected and tagged', 'Electrical tools test-and-tagged', 'Compressed air lines in good condition'] },
      { name: 'People', questions: ['PPE worn in workshop', 'Inductions recorded for visitors', 'Emergency exits and assembly point signed'] },
    ],
  },
  {
    type: 'Driver compliance review', scope: 'driver', description: 'Licences, fatigue and training records',
    sections: [
      { name: 'Licensing', questions: ['Licence valid for vehicle class', 'Medical certificate current', 'No unreported demerit issues'] },
      { name: 'Fatigue & hours', questions: ['Work diary complete and legible', 'Rest breaks within limits', 'No back-to-back long shifts'] },
      { name: 'Training', questions: ['Fatigue management training current', 'Load restraint training current', 'Pre-start procedure demonstrated correctly'] },
    ],
  },
  {
    type: 'Maintenance records audit', scope: 'depot', description: 'Service history and defect close-out',
    sections: [
      { name: 'Scheduling', questions: ['No services overdue more than 10%', 'Service intervals match manufacturer', 'Upcoming services booked'] },
      { name: 'Defects', questions: ['Critical defects closed within 24 h', 'Every defect has a work order or sign-off', 'Repeat defects investigated'] },
      { name: 'Parts & suppliers', questions: ['Parts traceable to supplier', 'Low-stock items re-ordered', 'Supplier certificates on file'] },
    ],
  },
];

export function itemsFromTemplate(t: AuditTemplate): AuditItem[] {
  return t.sections.flatMap((s) => s.questions.map((q) => ({ id: uid(), section: s.name, question: q, result: null })));
}

export function auditScore(a: Audit) {
  const answered = a.items.filter((i) => i.result === 'pass' || i.result === 'fail');
  const passed = answered.filter((i) => i.result === 'pass').length;
  return {
    answered: a.items.filter((i) => i.result !== null).length,
    total: a.items.length,
    failed: answered.length - passed,
    score: answered.length ? Math.round((passed / answered.length) * 100) : null,
  };
}

// ---------- Compliance register & score ----------

export interface ComplianceItem {
  id: string;
  subject: string;
  what: string;
  date: string;
  days: number;
  state: 'expired' | 'expiring' | 'ok';
  to: string;
  kind: 'Vehicle' | 'Driver' | 'Document';
}

/** Every dated obligation in the fleet – registrations, insurance, licences, training and uploaded documents. */
export function complianceRegister(data: AppData): ComplianceItem[] {
  const out: ComplianceItem[] = [];
  const add = (x: Omit<ComplianceItem, 'days' | 'state'>) => {
    const days = daysUntil(x.date);
    out.push({ ...x, days, state: days < 0 ? 'expired' : days <= 30 ? 'expiring' : 'ok' });
  };
  for (const v of data.vehicles) {
    add({ id: `r-${v.id}`, subject: v.rego, what: 'Registration', date: v.regoExpiry, to: `/vehicles/${v.id}`, kind: 'Vehicle' });
    add({ id: `i-${v.id}`, subject: v.rego, what: 'Insurance', date: v.insuranceExpiry, to: `/vehicles/${v.id}`, kind: 'Vehicle' });
  }
  for (const d of data.drivers) {
    add({ id: `l-${d.id}`, subject: d.name, what: `Licence (${d.licenceClass})`, date: d.licenceExpiry, to: `/drivers/${d.id}`, kind: 'Driver' });
    add({ id: `m-${d.id}`, subject: d.name, what: 'Medical', date: d.medicalExpiry, to: `/drivers/${d.id}`, kind: 'Driver' });
    d.trainings.forEach((t, i) => add({ id: `t-${d.id}-${i}`, subject: d.name, what: t.name, date: t.expiry, to: `/drivers/${d.id}`, kind: 'Driver' }));
  }
  for (const a of data.attachments) {
    if (!a.expiry) continue;
    const meta = ENTITIES[a.entityType];
    const item = (data[meta.collection] as unknown as ({ id: string } & Record<string, unknown>)[]).find((x) => x.id === a.entityId);
    add({ id: `a-${a.id}`, subject: item ? meta.title(item, data) : meta.singular, what: `${a.category}: ${a.name}`, date: a.expiry,
      to: `${entityLink(a.entityType, a.entityId)}?tab=documents`, kind: 'Document' });
  }
  return out.sort((a, b) => a.days - b.days);
}

export interface ComplianceScore {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  factors: { label: string; detail: string; penalty: number; to: string }[];
}

/** A 0–100 health score for compliance; each problem deducts points so the causes are explainable. */
export function complianceScore(data: AppData): ComplianceScore {
  const factors: ComplianceScore['factors'] = [];
  const reg = complianceRegister(data);
  const expired = reg.filter((r) => r.state === 'expired').length;
  const expiring = reg.filter((r) => r.state === 'expiring').length;
  const openNcrs = data.ncrs.filter((n) => !n.closed);
  const staleNcrs = openNcrs.filter((n) => ncrAge(n) > 30);
  const unfixedNcrs = openNcrs.filter((n) => !n.shortTerm.trim() && ncrAge(n) > 2);
  const overdueServices = data.schedules.filter((s) => serviceDue(s, data.vehicles.find((v) => v.id === s.vehicleId)).state === 'overdue').length;
  const criticalDefects = data.defects.filter((d) => d.status !== 'resolved' && d.severity === 'critical').length;
  const recentAudits = data.audits.filter((a) => a.status === 'completed' && daysUntil(a.date) > -90);
  const avgAudit = recentAudits.length
    ? recentAudits.reduce((s, a) => s + (auditScore(a).score ?? 100), 0) / recentAudits.length : null;

  const add = (count: number, each: number, max: number, label: string, detail: string, to: string) => {
    if (count > 0) factors.push({ label, detail, penalty: Math.min(max, count * each), to });
  };
  add(expired, 6, 30, 'Expired documents', `${expired} registration, insurance, licence or training record${expired > 1 ? 's' : ''} expired`, '/compliance');
  add(expiring, 1, 8, 'Expiring soon', `${expiring} item${expiring > 1 ? 's' : ''} expire within 30 days`, '/compliance');
  add(unfixedNcrs.length, 5, 20, 'NCRs without a remedial action', `${unfixedNcrs.length} open NCR${unfixedNcrs.length > 1 ? 's have' : ' has'} no short term fix recorded after 2 days`, '/ncr');
  add(staleNcrs.length, 3, 15, 'NCRs open over 30 days', `${staleNcrs.length} NCR${staleNcrs.length > 1 ? 's' : ''} open for more than 30 days`, '/ncr');
  add(overdueServices, 3, 15, 'Services overdue', `${overdueServices} scheduled service${overdueServices > 1 ? 's' : ''} overdue`, '/maintenance');
  add(criticalDefects, 5, 15, 'Critical defects', `${criticalDefects} critical defect${criticalDefects > 1 ? 's' : ''} unresolved`, '/defects');
  if (avgAudit !== null && avgAudit < 90) {
    factors.push({ label: 'Audit results', detail: `Average audit score ${Math.round(avgAudit)}% in the last 90 days`, penalty: Math.round((90 - avgAudit) / 3), to: '/audits' });
  }
  const score = Math.max(0, 100 - factors.reduce((s, f) => s + f.penalty, 0));
  return { score, grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D', factors: factors.sort((a, b) => b.penalty - a.penalty) };
}

export const describeDue = (iso: string) => (daysUntil(iso) < 0 ? `overdue ${relDays(iso).replace(' ago', '')}` : `due ${relDays(iso)}`);
