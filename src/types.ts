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
}

// ---------- Compliance ----------

export type NcrStatus = 'open' | 'investigating' | 'action' | 'verification' | 'closed';
export type NcrSource = 'Defect' | 'Audit' | 'Inspection' | 'Customer complaint' | 'Incident' | 'Internal';
export type NcrCategory = 'Vehicle safety' | 'Maintenance' | 'Documentation' | 'Driver behaviour' | 'Load restraint'
  | 'Environmental' | 'Supplier' | 'Process';
export type RootCauseCategory = 'People' | 'Process' | 'Equipment' | 'Materials' | 'Environment' | 'Management';

export interface CapaAction {
  id: ID;
  type: 'corrective' | 'preventive';
  description: string;
  owner: string;
  dueDate: string;
  done: boolean;
  doneAt?: string;
}

export interface Ncr {
  id: ID;
  number: number;
  title: string;
  description: string;
  category: NcrCategory;
  source: NcrSource;
  severity: Severity;
  /** 1 (rare) … 5 (almost certain) */
  likelihood: number;
  /** 1 (negligible) … 5 (catastrophic) */
  impact: number;
  status: NcrStatus;
  raisedBy: string;
  raisedAt: string;
  dueDate: string;
  owner: string;
  vehicleId?: ID;
  driverId?: ID;
  defectId?: ID;
  auditId?: ID;
  workOrderId?: ID;
  containment: string;
  whys: string[];
  rootCause: string;
  rootCauseCategory?: RootCauseCategory;
  actions: CapaAction[];
  verificationMethod: string;
  verificationResult: string;
  effective?: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  closedAt?: string;
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
  audits: Audit[];
  attachments: Attachment[];
  reminders: Reminder[];
  notes: Note[];
  activity: ActivityEvent[];
  settings: Settings;
}

export type CollectionKey = Exclude<keyof AppData, 'settings'>;
