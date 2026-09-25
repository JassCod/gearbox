export type ID = string;

export type VehicleType = 'Truck' | 'Van' | 'Ute' | 'Car' | 'Trailer' | 'Forklift' | 'Excavator';
export type VehicleStatus = 'active' | 'in-workshop' | 'off-road';
export type FuelType = 'Diesel' | 'Petrol' | 'Electric' | 'Hybrid' | 'LPG' | 'None';

export interface Vehicle {
  id: ID;
  rego: string;
  name: string;
  make: string;
  model: string;
  year: number;
  type: VehicleType;
  vin: string;
  fuelType: FuelType;
  odometer: number;
  hours: number;
  depot: string;
  status: VehicleStatus;
  driverId?: ID;
  regoExpiry: string;
  insuranceExpiry: string;
  notes?: string;
}

export interface ServiceSchedule {
  id: ID;
  vehicleId: ID;
  name: string;
  intervalKm?: number;
  intervalDays?: number;
  intervalHours?: number;
  lastDoneKm: number;
  lastDoneHours: number;
  lastDoneDate: string;
}

export type WorkOrderType = 'Service' | 'Repair' | 'Inspection' | 'Tyres' | 'Other';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type WorkOrderStatus = 'open' | 'in-progress' | 'waiting-parts' | 'completed';

export interface WorkOrderPart {
  partId: ID;
  qty: number;
}

export interface WorkOrder {
  id: ID;
  number: number;
  vehicleId: ID;
  title: string;
  description: string;
  type: WorkOrderType;
  priority: Priority;
  status: WorkOrderStatus;
  assignee: string;
  dueDate: string;
  createdAt: string;
  completedAt?: string;
  labourHours: number;
  labourRate: number;
  parts: WorkOrderPart[];
  defectId?: ID;
  scheduleId?: ID;
  tasks?: TaskItem[];
  odometerAtService?: number;
}

export interface TaskItem {
  id: ID;
  text: string;
  done: boolean;
}

export type Severity = 'minor' | 'major' | 'critical';
export type DefectStatus = 'open' | 'in-workorder' | 'resolved';

export interface Defect {
  id: ID;
  vehicleId: ID;
  driverId?: ID;
  date: string;
  item: string;
  description: string;
  severity: Severity;
  status: DefectStatus;
  checkId?: ID;
  workOrderId?: ID;
}

export interface CheckItem {
  label: string;
  ok: boolean;
  note?: string;
}

export interface PrestartCheck {
  id: ID;
  vehicleId: ID;
  driverId: ID;
  date: string;
  odometer: number;
  items: CheckItem[];
  passed: boolean;
  signature: string;
}

export interface Part {
  id: ID;
  sku: string;
  name: string;
  category: string;
  qty: number;
  minQty: number;
  unitCost: number;
  location: string;
  supplier: string;
}

export interface Training {
  name: string;
  expiry: string;
}

export interface Driver {
  id: ID;
  name: string;
  phone: string;
  email: string;
  licenceClass: string;
  licenceExpiry: string;
  medicalExpiry: string;
  depot: string;
  trainings: Training[];
  /** Employee number and state, shown as NAME STATE [number] in pickers. */
  employeeNo?: string;
  state?: string;
  position?: string;
}

export interface FuelEntry {
  id: ID;
  vehicleId: ID;
  date: string;
  litres: number;
  cost: number;
  odometer: number;
  station: string;
}

export interface Settings {
  companyName: string;
  currency: string;
  labourRate: number;
  checklist: string[];
  depots: string[];
  /** NCR lookups – admin-editable. */
  ncrSchemes: string[];
  ncrCategories: string[];
  ncrTypes: string[];
}

// ---------- Compliance ----------

/** A non-conformance report (NCR / SFI). Lookup fields store the lookup's name. */
export interface Ncr {
  id: ID;
  /** Sequential, unique – shown as NCR-{number}. */
  number: number;
  schemeType: string;
  /** "Category" on screen (NCR/SFI type). */
  category: string;
  /** "Type" on screen. */
  ncrType: string;
  /** The employee the NCR is about (a person on the Drivers & staff register). */
  employeeId?: ID;
  contractorId?: ID;
  vehicleId?: ID;
  pageNumber: string;
  /** "More information": the fit-for-duty (pre-start) check and the related event. */
  fitForDutyId?: ID;
  defectId?: ID;
  auditId?: ID;
  workOrderId?: ID;
  // 1. Problem / details of non-conformance
  problem: string;
  reportedDate: string;
  reportedBy: string;
  // 2. Short term fix / remedial action
  shortTerm: string;
  shortTermDate: string;
  shortTermBy: string;
  // 3. Cause of problem
  cause: string;
  causeDate: string;
  causeBy: string;
  // 4. Long term fix / preventative action
  longTerm: string;
  longTermDate: string;
  longTermBy: string;
  // Closure
  closed: boolean;
  closedDate: string;
  closedBy: string;
  closedPosition: string;
  createdAt: string;
  createdBy: string;
}

export interface Contractor {
  id: ID;
  name: string;
  abn?: string;
  contact?: string;
  phone?: string;
  email?: string;
  notes?: string;
  active: boolean;
}

export type AuditResult = 'pass' | 'fail' | 'na' | null;

export interface AuditItem {
  id: ID;
  section: string;
  question: string;
  result: AuditResult;
  note?: string;
  ncrId?: ID;
}

export interface Audit {
  id: ID;
  number: number;
  title: string;
  type: string;
  date: string;
  auditor: string;
  depot: string;
  vehicleId?: ID;
  driverId?: ID;
  status: 'planned' | 'in-progress' | 'completed';
  items: AuditItem[];
  summary?: string;
  completedAt?: string;
}

// ---------- Shared item extras (docs, reminders, notes, history) ----------

export type EntityType = 'vehicle' | 'workOrder' | 'defect' | 'part' | 'driver' | 'schedule' | 'check' | 'fuel' | 'ncr' | 'audit';

export interface Attachment {
  id: ID;
  entityType: EntityType;
  entityId: ID;
  name: string;
  category: string;
  mime: string;
  size: number;
  /** inline: dataUrl kept with the record (local mode); cloud: file in Supabase Storage; none: reference only */
  storage: 'inline' | 'cloud' | 'none';
  dataUrl?: string;
  path?: string;
  expiry?: string;
  notes?: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface Reminder {
  id: ID;
  entityType: EntityType;
  entityId: ID;
  title: string;
  dueDate: string;
  repeat: 'none' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  priority: Priority;
  assignee: string;
  notes?: string;
  done: boolean;
  doneAt?: string;
}

export interface Note {
  id: ID;
  entityType: EntityType;
  entityId: ID;
  text: string;
  at: string;
  by: string;
  pinned?: boolean;
}

export interface ActivityEvent {
  id: ID;
  entityType: EntityType;
  entityId: ID;
  at: string;
  by: string;
  kind: 'created' | 'updated' | 'status' | 'deleted' | 'document' | 'reminder' | 'note' | 'system';
  text: string;
}

export interface AppData {
  vehicles: Vehicle[];
  schedules: ServiceSchedule[];
  workOrders: WorkOrder[];
  defects: Defect[];
  checks: PrestartCheck[];
  parts: Part[];
  drivers: Driver[];
  fuel: FuelEntry[];
  ncrs: Ncr[];
  contractors: Contractor[];
  audits: Audit[];
  attachments: Attachment[];
  reminders: Reminder[];
  notes: Note[];
  activity: ActivityEvent[];
  settings: Settings;
}

export type CollectionKey = Exclude<keyof AppData, 'settings'>;
