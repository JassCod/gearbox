import type { AppData, Driver, Ncr, Vehicle } from '../types';
import { byId, daysUntil } from './utils';

// ---------- Lookups (seed values; admins can edit them in Settings) ----------

export const DEFAULT_NCR_SCHEMES = [
  'HACCP', 'National Road Rules', 'NHVAS Fatigue', 'NHVAS Maintenance', 'NHVAS Mass', 'NHVR - Fines',
  'NHVR Notice to Produce', 'Speed Management', 'WAHVA Scheme',
];

export const DEFAULT_NCR_CATEGORIES = [
  'Breach (Infringement Notices)', 'Charges Court Action', 'Corrective Action Report', 'Defect Notices',
  'Non Conformance', 'Other Notices', 'Suggestion For Improvement',
];

export const DEFAULT_NCR_CATEGORY = 'Non Conformance';

export const DEFAULT_NCR_TYPES = [
  'Breach', 'Cautions', 'Court Matters', 'Defect', 'Disobeying a Directive', 'Driver Responsibility', 'Drugs - Positive',
  'Expired Licence', 'Fatigue', 'Faults', 'HACCP-Contamination', 'HACCP-Logistics & Handling', 'HACCP-Other', 'Incident',
  'Infringement', 'Internal Review', 'Maintenance', 'Mobile Phone', 'Notice to Produce', 'Overload', 'Policies and Procedures',
  'Pre Start Check', 'Records', 'Seat Belt', 'Smoking', 'Speeding', 'Training', 'Unexplained Absence', 'Unsafe Practice',
  'Work Diary Pages (Log Book)',
];

/** Tag given to every document uploaded to an NCR. */
export const NCR_DOC_TAG = 'Non Conformance';

// ---------- The four stages ----------

type StageKey = 'problem' | 'shortTerm' | 'cause' | 'longTerm';
export interface NcrStage {
  key: StageKey;
  title: string;
  date: 'reportedDate' | 'shortTermDate' | 'causeDate' | 'longTermDate';
  by: 'reportedBy' | 'shortTermBy' | 'causeBy' | 'longTermBy';
  dateLabel: string;
  byLabel: string;
  placeholder: string;
}

export const NCR_STAGES: NcrStage[] = [
  { key: 'problem', title: '1. Problem / Details of Non-conformance', date: 'reportedDate', by: 'reportedBy', dateLabel: 'Reported date', byLabel: 'Reported by',
    placeholder: 'What happened, where and when. Paste breach or notice details here – line breaks are kept.' },
  { key: 'shortTerm', title: '2. Short Term Fix / Remedial Action', date: 'shortTermDate', by: 'shortTermBy', dateLabel: 'Short term date', byLabel: 'Short term fix by',
    placeholder: 'What was done straight away to contain or correct the problem.' },
  { key: 'cause', title: '3. Cause of Problem, Reason for NCR/SFI', date: 'causeDate', by: 'causeBy', dateLabel: 'Cause date', byLabel: 'Cause by',
    placeholder: 'Why it happened – the underlying cause, not just the symptom.' },
  { key: 'longTerm', title: '4. Long Term Fix / Preventative Action', date: 'longTermDate', by: 'longTermBy', dateLabel: 'Long term date', byLabel: 'Long term fix by',
    placeholder: 'What will stop it happening again (training, procedure change, system fix…).' },
];

/** How many of the four stages have been written up. */
export const stagesDone = (n: Ncr) => NCR_STAGES.filter((s) => n[s.key].trim()).length;

export function blankNcr(number: number, actor: string, patch: Partial<Ncr> = {}): Ncr {
  return {
    id: '', number, schemeType: '', category: DEFAULT_NCR_CATEGORY, ncrType: '', pageNumber: '',
    problem: '', reportedDate: '', reportedBy: '', shortTerm: '', shortTermDate: '', shortTermBy: '',
    cause: '', causeDate: '', causeBy: '', longTerm: '', longTermDate: '', longTermBy: '',
    closed: false, closedDate: '', closedBy: '', closedPosition: '',
    createdAt: new Date().toISOString(), createdBy: actor, ...patch,
  };
}

// ---------- Labels ----------

export const ncrCode = (n: Pick<Ncr, 'number'>) => `NCR-${n.number}`;

/** First line of the problem, for one-line titles elsewhere in the app. */
export function ncrSummary(n: Ncr, max = 70) {
  const first = n.problem.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const text = first || [n.ncrType, n.schemeType].filter(Boolean).join(' · ') || 'No details yet';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export const employeeLabel = (d: Driver) =>
  [d.name.toUpperCase(), d.state, d.employeeNo ? `[${d.employeeNo}]` : ''].filter(Boolean).join(' ');

/** Fleet number: the vehicle's name/fleet id, as used on the fleet list. */
export const fleetNo = (v: Vehicle) => v.name;
export const vehicleLabel = (v: Vehicle) => `${fleetNo(v)} [${v.rego}]`;
export const vehicleDot = (v: Vehicle): 'green' | 'amber' | 'red' => (v.status === 'active' ? 'green' : v.status === 'in-workshop' ? 'amber' : 'red');

// ---------- Dates (DD/MM/YYYY on screen, ISO in data) ----------

export function fmtDMY(iso?: string) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

export function fmtDMYTime(isoDateTime: string) {
  const dt = new Date(isoDateTime);
  if (Number.isNaN(dt.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

/** Parse DD/MM/YYYY (also D/M/YY and dashes or dots). Returns '' for empty, null for invalid. */
export function parseDMY(text: string): string | null {
  const t = text.trim();
  if (!t) return '';
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]); const mo = Number(m[2]); let y = Number(m[3]);
  if (y < 100) y += 2000;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ---------- Groups / sub-groups ----------

/** Groups are depots, sub-groups are vehicle types. An NCR belongs through its vehicle, else its employee's depot. */
export function ncrGroups(n: Ncr, data: Pick<AppData, 'vehicles' | 'drivers'>) {
  const v = data.vehicles.find((x) => x.id === n.vehicleId);
  const e = data.drivers.find((x) => x.id === n.employeeId);
  return { group: v?.depot ?? e?.depot, subGroup: v?.type };
}

export function matchesGroups(n: Ncr, data: Pick<AppData, 'vehicles' | 'drivers'>, groups: string[], subGroups: string[]) {
  if (!groups.length && !subGroups.length) return true;
  const g = ncrGroups(n, data);
  return (!groups.length || (!!g.group && groups.includes(g.group))) && (!subGroups.length || (!!g.subGroup && subGroups.includes(g.subGroup)));
}

/** Days an open NCR has been open (from the reported date, else creation). */
export function ncrAge(n: Ncr) {
  const start = n.reportedDate || n.createdAt.slice(0, 10);
  return Math.max(0, -daysUntil(start));
}

// ---------- Migration from the earlier NCR format ----------

type LegacyNcr = {
  id: string; number: number; title?: string; description?: string; category?: string; source?: string; severity?: string;
  status?: string; raisedBy?: string; raisedAt?: string; owner?: string; vehicleId?: string; driverId?: string;
  defectId?: string; auditId?: string; workOrderId?: string; containment?: string; whys?: string[]; rootCause?: string;
  actions?: { type: string; description: string; owner: string; done: boolean }[]; verificationResult?: string;
  verifiedBy?: string; closedAt?: string;
};

const LEGACY_TYPE: Record<string, string> = {
  'Vehicle safety': 'Defect', Maintenance: 'Maintenance', Documentation: 'Records', 'Driver behaviour': 'Unsafe Practice',
  'Load restraint': 'Unsafe Practice', Environmental: 'Policies and Procedures', Supplier: 'Policies and Procedures', Process: 'Policies and Procedures',
};

/** Records saved by the earlier NCR screens are converted on load, so nothing is lost. */
export function migrateNcr(raw: unknown): Ncr {
  const o = raw as Partial<Ncr> & LegacyNcr;
  if (typeof o.problem === 'string') return { ...blankNcr(o.number, o.createdBy ?? ''), ...o } as Ncr;
  const whys = (o.whys ?? []).filter((w) => w.trim());
  const actions = o.actions ?? [];
  return blankNcr(o.number, o.raisedBy ?? '', {
    id: o.id,
    schemeType: o.category === 'Driver behaviour' ? 'National Road Rules' : o.category === 'Load restraint' ? 'NHVAS Mass' : 'NHVAS Maintenance',
    ncrType: LEGACY_TYPE[o.category ?? ''] ?? 'Internal Review',
    employeeId: o.driverId, vehicleId: o.vehicleId, defectId: o.defectId, auditId: o.auditId, workOrderId: o.workOrderId,
    problem: [o.title, o.description].filter(Boolean).join('\n\n'),
    reportedDate: o.raisedAt ?? '', reportedBy: o.raisedBy ?? '',
    shortTerm: o.containment ?? '',
    cause: [o.rootCause, ...whys.map((w, i) => `Why ${i + 1}: ${w}`)].filter(Boolean).join('\n'),
    longTerm: actions.map((a) => `${a.done ? '✓' : '•'} ${a.description}${a.owner ? ` (${a.owner})` : ''}`).join('\n'),
    longTermBy: o.owner ?? '',
    closed: o.status === 'closed', closedDate: o.closedAt ?? '', closedBy: o.status === 'closed' ? o.verifiedBy ?? '' : '',
    createdAt: o.raisedAt ? `${o.raisedAt}T09:00:00.000Z` : new Date().toISOString(),
  });
}


/** The label/value pairs shown at the top of the single-NCR report (shared with the on-screen version). */
export function ncrHeaderFields(n: Ncr, data: AppData): [string, string][] {
  const v = byId(data.vehicles, n.vehicleId);
  const e = byId(data.drivers, n.employeeId);
  const check = byId(data.checks, n.fitForDutyId);
  const event = n.defectId ? byId(data.defects, n.defectId)?.item : n.auditId ? byId(data.audits, n.auditId)?.title : n.workOrderId ? `#${byId(data.workOrders, n.workOrderId)?.number}` : '';
  return [
    ['Scheme', n.schemeType], ['Category', n.category], ['Type', n.ncrType],
    ['Employee', e ? employeeLabel(e) : ''], ['Contractor', byId(data.contractors, n.contractorId)?.name ?? ''], ['Page Number', n.pageNumber],
    ['Vehicle / Asset', v ? vehicleLabel(v) : ''],
    ['Fit For Duty', check ? `Pre-start ${fmtDMY(check.date)} · ${check.passed ? 'passed' : 'failed'}` : ''],
    ['Event', event ?? ''],
  ];
}

