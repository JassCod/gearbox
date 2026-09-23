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

export interface AppData {
  vehicles: Vehicle[];
  schedules: ServiceSchedule[];
  workOrders: WorkOrder[];
  defects: Defect[];
  checks: PrestartCheck[];
  parts: Part[];
  drivers: Driver[];
  fuel: FuelEntry[];
  settings: Settings;
}

export type CollectionKey = Exclude<keyof AppData, 'settings'>;
