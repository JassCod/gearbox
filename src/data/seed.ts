import type {
  ActivityEvent, AppData, Attachment, Audit, Contractor, Defect, Driver, FuelEntry, Ncr, Note, Part, PrestartCheck, Reminder, ServiceSchedule, Vehicle, WorkOrder,
} from '../types';
import { addDays, todayISO } from '../lib/utils';
import { AUDIT_TEMPLATES } from '../lib/compliance';
import { DEFAULT_NCR_CATEGORIES, DEFAULT_NCR_SCHEMES, DEFAULT_NCR_TYPES } from '../lib/ncr';

export const DEFAULT_CHECKLIST = [
  'Tyres & wheel nuts',
  'Lights & indicators',
  'Brakes',
  'Mirrors & windows',
  'Fluid levels (oil, coolant)',
  'Horn & wipers',
  'Seatbelts',
  'Body damage',
  'Fire extinguisher & first aid',
  'Load restraints',
];

/** Deterministic pseudo-random so the demo looks the same on every reset. */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export function createSeed(): AppData {
  const t = todayISO();
  const d = (n: number) => addDays(t, n);
  const rand = rng(42);

  const drivers: Driver[] = [
    { id: 'd1', name: 'Maya Thompson', employeeNo: '717', state: 'VIC', phone: '0412 555 101', email: 'maya@example.com', licenceClass: 'HR', licenceExpiry: d(410), medicalExpiry: d(120), depot: 'North Yard', trainings: [{ name: 'Fatigue management', expiry: d(200) }, { name: 'Forklift', expiry: d(22) }] },
    { id: 'd2', name: 'Liam Carter', employeeNo: '722', state: 'VIC', phone: '0412 555 102', email: 'liam@example.com', licenceClass: 'MR', licenceExpiry: d(18), medicalExpiry: d(300), depot: 'North Yard', trainings: [{ name: 'Fatigue management', expiry: d(-5) }] },
    { id: 'd3', name: 'Priya Nair', employeeNo: '341', state: 'NSW', phone: '0412 555 103', email: 'priya@example.com', licenceClass: 'HC', licenceExpiry: d(700), medicalExpiry: d(250), depot: 'South Depot', trainings: [{ name: 'Dangerous goods', expiry: d(90) }] },
    { id: 'd4', name: 'Noah Kim', employeeNo: '356', state: 'NSW', phone: '0412 555 104', email: 'noah@example.com', licenceClass: 'C', licenceExpiry: d(900), medicalExpiry: d(500), depot: 'South Depot', trainings: [] },
    { id: 'd5', name: 'Sofia Rossi', employeeNo: '508', state: 'QLD', phone: '0412 555 105', email: 'sofia@example.com', licenceClass: 'LR', licenceExpiry: d(330), medicalExpiry: d(-12), depot: 'City Hub', trainings: [{ name: 'First aid', expiry: d(160) }] },
    { id: 'd6', name: 'Ethan Walker', employeeNo: '512', state: 'QLD', phone: '0412 555 106', email: 'ethan@example.com', licenceClass: 'HR', licenceExpiry: d(520), medicalExpiry: d(190), depot: 'City Hub', trainings: [{ name: 'Excavator ticket', expiry: d(365) }] },
  ];

  const vehicles: Vehicle[] = [
    { id: 'v1', rego: 'TRK-101', name: 'Hauler 1', make: 'Isuzu', model: 'FVR 165-300', year: 2021, type: 'Truck', vin: 'JALFVR34000101', fuelType: 'Diesel', odometer: 148_220, hours: 0, depot: 'North Yard', status: 'active', driverId: 'd1', regoExpiry: d(140), insuranceExpiry: d(200) },
    { id: 'v2', rego: 'TRK-102', name: 'Hauler 2', make: 'Hino', model: '500 FC', year: 2019, type: 'Truck', vin: 'JHDFC1JL000102', fuelType: 'Diesel', odometer: 231_950, hours: 0, depot: 'North Yard', status: 'in-workshop', driverId: 'd3', regoExpiry: d(12), insuranceExpiry: d(90) },
    { id: 'v3', rego: 'VAN-201', name: 'City Van A', make: 'Toyota', model: 'HiAce LWB', year: 2022, type: 'Van', vin: 'JTFSS22P000201', fuelType: 'Diesel', odometer: 64_300, hours: 0, depot: 'City Hub', status: 'active', driverId: 'd5', regoExpiry: d(250), insuranceExpiry: d(250) },
    { id: 'v4', rego: 'VAN-202', name: 'City Van B', make: 'Ford', model: 'E-Transit', year: 2024, type: 'Van', vin: 'WF0EXXTTG00202', fuelType: 'Electric', odometer: 18_750, hours: 0, depot: 'City Hub', status: 'active', driverId: 'd2', regoExpiry: d(320), insuranceExpiry: d(320) },
    { id: 'v5', rego: 'UTE-301', name: 'Service Ute', make: 'Toyota', model: 'HiLux SR', year: 2020, type: 'Ute', vin: 'MR0FA3CD000301', fuelType: 'Diesel', odometer: 119_480, hours: 0, depot: 'South Depot', status: 'active', driverId: 'd4', regoExpiry: d(-3), insuranceExpiry: d(60) },
    { id: 'v6', rego: 'UTE-302', name: 'Site Ute', make: 'Ford', model: 'Ranger XL', year: 2023, type: 'Ute', vin: 'MNAUMFF5000302', fuelType: 'Diesel', odometer: 41_020, hours: 0, depot: 'South Depot', status: 'active', regoExpiry: d(180), insuranceExpiry: d(24) },
    { id: 'v7', rego: 'CAR-401', name: 'Manager Car', make: 'Hyundai', model: 'Ioniq 5', year: 2023, type: 'Car', vin: 'KMHKN81AF00401', fuelType: 'Electric', odometer: 27_900, hours: 0, depot: 'City Hub', status: 'active', regoExpiry: d(210), insuranceExpiry: d(210) },
    { id: 'v8', rego: 'TRL-501', name: 'Flatbed Trailer', make: 'Krueger', model: 'Tri-axle Flat', year: 2018, type: 'Trailer', vin: 'KRU3AXFL000501', fuelType: 'None', odometer: 302_400, hours: 0, depot: 'North Yard', status: 'off-road', regoExpiry: d(75), insuranceExpiry: d(75) },
    { id: 'v9', rego: 'FLT-601', name: 'Forklift 1', make: 'Toyota', model: '8FG25', year: 2017, type: 'Forklift', vin: 'TOY8FG25000601', fuelType: 'LPG', odometer: 0, hours: 6_420, depot: 'North Yard', status: 'active', regoExpiry: d(400), insuranceExpiry: d(160) },
    { id: 'v10', rego: 'EXC-701', name: 'Mini Excavator', make: 'Kubota', model: 'KX040-4', year: 2021, type: 'Excavator', vin: 'KBTKX040000701', fuelType: 'Diesel', odometer: 0, hours: 2_185, depot: 'South Depot', status: 'active', driverId: 'd6', regoExpiry: d(290), insuranceExpiry: d(290) },
    { id: 'v11', rego: 'TRK-103', name: 'Hauler 3', make: 'Volvo', model: 'FH16', year: 2022, type: 'Truck', vin: 'YV2RT40A000103', fuelType: 'Diesel', odometer: 188_600, hours: 0, depot: 'South Depot', status: 'active', regoExpiry: d(95), insuranceExpiry: d(95) },
    { id: 'v12', rego: 'VAN-203', name: 'City Van C', make: 'Mercedes-Benz', model: 'Sprinter 316', year: 2020, type: 'Van', vin: 'WDB9066331000203', fuelType: 'Diesel', odometer: 97_150, hours: 0, depot: 'City Hub', status: 'active', regoExpiry: d(44), insuranceExpiry: d(130) },
  ];

  const schedules: ServiceSchedule[] = [
    { id: 's1', vehicleId: 'v1', name: 'A-Service (oil & filters)', intervalKm: 15_000, intervalDays: 180, lastDoneKm: 135_900, lastDoneHours: 0, lastDoneDate: d(-150) },
    { id: 's2', vehicleId: 'v1', name: 'Brake inspection', intervalKm: 40_000, lastDoneKm: 120_000, lastDoneHours: 0, lastDoneDate: d(-300) },
    { id: 's3', vehicleId: 'v2', name: 'A-Service (oil & filters)', intervalKm: 15_000, intervalDays: 180, lastDoneKm: 214_000, lastDoneHours: 0, lastDoneDate: d(-200) },
    { id: 's4', vehicleId: 'v3', name: 'Logbook service', intervalKm: 10_000, intervalDays: 365, lastDoneKm: 60_100, lastDoneHours: 0, lastDoneDate: d(-100) },
    { id: 's5', vehicleId: 'v4', name: 'EV annual check', intervalDays: 365, lastDoneKm: 4_000, lastDoneHours: 0, lastDoneDate: d(-340) },
    { id: 's6', vehicleId: 'v5', name: 'Logbook service', intervalKm: 10_000, intervalDays: 365, lastDoneKm: 110_200, lastDoneHours: 0, lastDoneDate: d(-190) },
    { id: 's7', vehicleId: 'v6', name: 'Logbook service', intervalKm: 15_000, intervalDays: 365, lastDoneKm: 30_000, lastDoneHours: 0, lastDoneDate: d(-160) },
    { id: 's8', vehicleId: 'v7', name: 'EV annual check', intervalDays: 365, lastDoneKm: 15_000, lastDoneHours: 0, lastDoneDate: d(-120) },
    { id: 's9', vehicleId: 'v8', name: 'Trailer safety inspection', intervalDays: 90, lastDoneKm: 300_000, lastDoneHours: 0, lastDoneDate: d(-104) },
    { id: 's10', vehicleId: 'v9', name: '250h service', intervalHours: 250, lastDoneKm: 0, lastDoneHours: 6_200, lastDoneDate: d(-60) },
    { id: 's11', vehicleId: 'v10', name: '500h service', intervalHours: 500, intervalDays: 365, lastDoneKm: 0, lastDoneHours: 1_720, lastDoneDate: d(-140) },
    { id: 's12', vehicleId: 'v11', name: 'A-Service (oil & filters)', intervalKm: 20_000, intervalDays: 180, lastDoneKm: 176_000, lastDoneHours: 0, lastDoneDate: d(-80) },
    { id: 's13', vehicleId: 'v12', name: 'Logbook service', intervalKm: 20_000, intervalDays: 365, lastDoneKm: 80_000, lastDoneHours: 0, lastDoneDate: d(-230) },
  ];

  const parts: Part[] = [
    { id: 'p1', sku: 'OF-1001', name: 'Oil filter (heavy)', category: 'Filters', qty: 14, minQty: 6, unitCost: 38, location: 'Shelf A1', supplier: 'Coastal Parts Co' },
    { id: 'p2', sku: 'OF-1002', name: 'Oil filter (light)', category: 'Filters', qty: 4, minQty: 6, unitCost: 16, location: 'Shelf A1', supplier: 'Coastal Parts Co' },
    { id: 'p3', sku: 'AF-2001', name: 'Air filter element', category: 'Filters', qty: 9, minQty: 4, unitCost: 72, location: 'Shelf A2', supplier: 'Coastal Parts Co' },
    { id: 'p4', sku: 'FF-3001', name: 'Fuel filter', category: 'Filters', qty: 2, minQty: 4, unitCost: 55, location: 'Shelf A2', supplier: 'Coastal Parts Co' },
    { id: 'p5', sku: 'EO-15W40', name: 'Engine oil 15W-40 (20 L)', category: 'Fluids', qty: 7, minQty: 3, unitCost: 145, location: 'Bay 2', supplier: 'LubeMax' },
    { id: 'p6', sku: 'CL-5L', name: 'Coolant concentrate (5 L)', category: 'Fluids', qty: 11, minQty: 4, unitCost: 42, location: 'Bay 2', supplier: 'LubeMax' },
    { id: 'p7', sku: 'BP-HD-F', name: 'Brake pads – heavy front', category: 'Brakes', qty: 3, minQty: 2, unitCost: 210, location: 'Shelf B1', supplier: 'StopRight' },
    { id: 'p8', sku: 'BP-LD-F', name: 'Brake pads – light front', category: 'Brakes', qty: 1, minQty: 3, unitCost: 95, location: 'Shelf B1', supplier: 'StopRight' },
    { id: 'p9', sku: 'TY-22.5', name: 'Tyre 295/80R22.5', category: 'Tyres', qty: 6, minQty: 4, unitCost: 520, location: 'Tyre rack', supplier: 'RoadGrip' },
    { id: 'p10', sku: 'TY-LT265', name: 'Tyre LT265/65R17', category: 'Tyres', qty: 8, minQty: 4, unitCost: 290, location: 'Tyre rack', supplier: 'RoadGrip' },
    { id: 'p11', sku: 'WB-24', name: 'Wiper blade 24"', category: 'Electrical', qty: 12, minQty: 6, unitCost: 18, location: 'Shelf C3', supplier: 'Coastal Parts Co' },
    { id: 'p12', sku: 'LB-H7', name: 'Headlight globe H7', category: 'Electrical', qty: 0, minQty: 4, unitCost: 14, location: 'Shelf C3', supplier: 'Coastal Parts Co' },
    { id: 'p13', sku: 'BT-12V', name: 'Battery 12V N70', category: 'Electrical', qty: 3, minQty: 2, unitCost: 240, location: 'Bay 1', supplier: 'VoltWorks' },
    { id: 'p14', sku: 'HY-68', name: 'Hydraulic oil 68 (20 L)', category: 'Fluids', qty: 5, minQty: 2, unitCost: 120, location: 'Bay 2', supplier: 'LubeMax' },
  ];

  const defects: Defect[] = [
    { id: 'df1', vehicleId: 'v2', driverId: 'd3', date: d(-4), item: 'Brakes', description: 'Air leak audible from rear brake chamber', severity: 'critical', status: 'in-workorder', workOrderId: 'w1' },
    { id: 'df2', vehicleId: 'v3', driverId: 'd5', date: d(-2), item: 'Lights & indicators', description: 'Left rear indicator not working', severity: 'minor', status: 'open' },
    { id: 'df3', vehicleId: 'v8', date: d(-9), item: 'Tyres & wheel nuts', description: 'Two tyres below legal tread depth', severity: 'critical', status: 'in-workorder', workOrderId: 'w3' },
    { id: 'df4', vehicleId: 'v11', date: d(-1), item: 'Mirrors & windows', description: 'Chip in windscreen, passenger side', severity: 'major', status: 'open' },
    { id: 'df5', vehicleId: 'v1', driverId: 'd1', date: d(-25), item: 'Horn & wipers', description: 'Wiper blades smearing', severity: 'minor', status: 'resolved', workOrderId: 'w5' },
  ];

  const workOrders: WorkOrder[] = [
    { id: 'w1', number: 1041, vehicleId: 'v2', title: 'Repair rear brake air leak', description: 'Replace brake chamber diaphragm and test system.', type: 'Repair', priority: 'critical', status: 'in-progress', assignee: 'Sam (Workshop)', dueDate: d(1), createdAt: d(-4), labourHours: 3, labourRate: 120, parts: [{ partId: 'p7', qty: 1 }], defectId: 'df1',
      tasks: [{ id: 't1', text: 'Isolate air system and chock wheels', done: true }, { id: 't2', text: 'Replace rear left brake chamber diaphragm', done: true }, { id: 't3', text: 'Leak-down test (max 20 kPa/min)', done: false }, { id: 't4', text: 'Road test and sign off', done: false }] },
    { id: 'w2', number: 1042, vehicleId: 'v2', title: 'A-Service (oil & filters)', description: 'Overdue scheduled service.', type: 'Service', priority: 'high', status: 'waiting-parts', assignee: 'Sam (Workshop)', dueDate: d(2), createdAt: d(-3), labourHours: 2.5, labourRate: 120, parts: [{ partId: 'p1', qty: 1 }, { partId: 'p4', qty: 1 }, { partId: 'p5', qty: 1 }], scheduleId: 's3',
      tasks: [{ id: 't5', text: 'Drain and replace engine oil', done: false }, { id: 't6', text: 'Replace oil and fuel filters', done: false }, { id: 't7', text: 'Grease chassis points', done: false }, { id: 't8', text: 'Check belts and hoses', done: false }] },
    { id: 'w3', number: 1043, vehicleId: 'v8', title: 'Replace worn trailer tyres', description: 'Replace two tyres and rebalance.', type: 'Tyres', priority: 'high', status: 'open', assignee: 'RoadGrip mobile', dueDate: d(3), createdAt: d(-9), labourHours: 1.5, labourRate: 110, parts: [{ partId: 'p9', qty: 2 }], defectId: 'df3' },
    { id: 'w4', number: 1044, vehicleId: 'v5', title: 'Logbook service', description: '120,000 km logbook service.', type: 'Service', priority: 'medium', status: 'open', assignee: 'Jo (Workshop)', dueDate: d(6), createdAt: d(-1), labourHours: 2, labourRate: 120, parts: [{ partId: 'p2', qty: 1 }], scheduleId: 's6' },
    { id: 'w5', number: 1038, vehicleId: 'v1', title: 'Replace wiper blades', description: '', type: 'Repair', priority: 'low', status: 'completed', assignee: 'Jo (Workshop)', dueDate: d(-22), createdAt: d(-25), completedAt: d(-23), labourHours: 0.5, labourRate: 120, parts: [{ partId: 'p11', qty: 2 }], defectId: 'df5' },
    { id: 'w6', number: 1045, vehicleId: 'v11', title: 'Windscreen chip repair', description: 'Book mobile glass repair.', type: 'Repair', priority: 'medium', status: 'open', assignee: '', dueDate: d(10), createdAt: t, labourHours: 1, labourRate: 100, parts: [] },
  ];

  // Historic completed work so the cost charts have something to show.
  const historicTitles = ['Scheduled service', 'Brake pad replacement', 'Tyre rotation', 'Battery replacement', 'Coolant flush', 'Headlight replacement'];
  let num = 1000;
  for (let m = 6; m >= 1; m--) {
    const count = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const v = vehicles[Math.floor(rand() * vehicles.length)];
      const date = d(-m * 30 + Math.floor(rand() * 25));
      const part = parts[Math.floor(rand() * parts.length)];
      workOrders.push({
        id: `wh${num}`, number: num++, vehicleId: v.id, title: historicTitles[Math.floor(rand() * historicTitles.length)],
        description: '', type: rand() > 0.5 ? 'Service' : 'Repair', priority: 'medium', status: 'completed',
        assignee: rand() > 0.5 ? 'Sam (Workshop)' : 'Jo (Workshop)', dueDate: date, createdAt: addDays(date, -3), completedAt: date,
        labourHours: 1 + Math.round(rand() * 6) / 2, labourRate: 120, parts: [{ partId: part.id, qty: 1 + Math.floor(rand() * 2) }],
      });
    }
  }

  const fuel: FuelEntry[] = [];
  const stations = ['Ampol Northside', 'BP Motorway', 'Shell City', 'United South'];
  for (const v of vehicles) {
    if (v.fuelType === 'None' || v.fuelType === 'Electric') continue;
    const perWeekKm = v.type === 'Truck' ? 900 : v.type === 'Forklift' || v.type === 'Excavator' ? 0 : 450;
    const lPer100 = v.type === 'Truck' ? 28 : v.type === 'Van' ? 11 : 10.5;
    let odo = v.odometer - perWeekKm * 26;
    for (let w = 26; w >= 1; w -= 2) {
      odo += perWeekKm * 2;
      const litres = perWeekKm ? (perWeekKm * 2 * lPer100 / 100) * (0.9 + rand() * 0.2) : 60 + rand() * 30;
      fuel.push({
        id: `f${v.id}-${w}`, vehicleId: v.id, date: d(-w * 7 + 2), litres: Math.round(litres),
        cost: Math.round(litres * (1.85 + rand() * 0.25)), odometer: Math.round(odo), station: stations[Math.floor(rand() * stations.length)],
      });
    }
  }

  const mkItems = (fail?: string, note?: string) =>
    DEFAULT_CHECKLIST.map((label) => ({ label, ok: label !== fail, note: label === fail ? note : undefined }));
  const checks: PrestartCheck[] = [
    { id: 'c1', vehicleId: 'v3', driverId: 'd5', date: d(-2), odometer: 64_120, items: mkItems('Lights & indicators', 'Left rear indicator not working'), passed: false, signature: 'Sofia Rossi' },
    { id: 'c2', vehicleId: 'v1', driverId: 'd1', date: d(-1), odometer: 148_010, items: mkItems(), passed: true, signature: 'Maya Thompson' },
    { id: 'c3', vehicleId: 'v4', driverId: 'd2', date: d(-1), odometer: 18_700, items: mkItems(), passed: true, signature: 'Liam Carter' },
    { id: 'c4', vehicleId: 'v10', driverId: 'd6', date: t, odometer: 0, items: mkItems(), passed: true, signature: 'Ethan Walker' },
    { id: 'c5', vehicleId: 'v5', driverId: 'd4', date: t, odometer: 119_480, items: mkItems(), passed: true, signature: 'Noah Kim' },
  ];

  // ---------- Compliance demo data ----------
  const fromTemplate = (i: number, results: ('pass' | 'fail' | 'na' | null)[], notes: Record<number, string> = {}) => {
    const qs = AUDIT_TEMPLATES[i].sections.flatMap((sec) => sec.questions.map((q) => ({ section: sec.name, question: q })));
    return qs.map((q, n) => ({ id: `ai${i}-${n}`, ...q, result: results[n] ?? null, note: notes[n] }));
  };
  const audits: Audit[] = [
    { id: 'a1', number: 11, title: 'TRL-501 roadworthiness inspection', type: AUDIT_TEMPLATES[0].type, date: d(-10), auditor: 'Priya Nair', depot: 'North Yard', vehicleId: 'v8', status: 'completed', completedAt: d(-10),
      items: fromTemplate(0, ['pass', 'pass', 'na', 'fail', 'pass', 'pass', 'pass', 'fail', 'pass', 'na', 'na', 'na', 'pass', 'pass', 'fail'], { 3: 'Two tyres at 1.2 mm', 7: 'Rear conspicuity tape peeling', 14: 'No pre-start records for trailer' }),
      summary: 'Trailer removed from service until tyres replaced. Documentation gap for trailer pre-starts.' },
    { id: 'a2', number: 12, title: 'North Yard monthly safety walk', type: AUDIT_TEMPLATES[1].type, date: d(-4), auditor: 'Maya Thompson', depot: 'North Yard', status: 'completed', completedAt: d(-4),
      items: fromTemplate(1, ['pass', 'fail', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass'], { 1: 'Spill kit near bay 2 empty' }) },
    { id: 'a3', number: 13, title: 'Q3 driver compliance review – City Hub', type: AUDIT_TEMPLATES[2].type, date: d(5), auditor: 'Sofia Rossi', depot: 'City Hub', status: 'planned',
      items: fromTemplate(2, []) },
    { id: 'a4', number: 14, title: 'South Depot maintenance records', type: AUDIT_TEMPLATES[3].type, date: d(-1), auditor: 'Noah Kim', depot: 'South Depot', status: 'in-progress',
      items: fromTemplate(3, ['pass', 'pass', 'fail', 'pass', null, null, null, null, null], { 2: 'UTE-301 service not yet booked' }) },
  ];

  const contractors: Contractor[] = [
    { id: 'c1', name: 'Southern Cross Linehaul', abn: '51 824 753 556', contact: 'Dev Patel', phone: '03 9555 0142', email: 'ops@southerncrosslinehaul.example', active: true },
    { id: 'c2', name: 'Ridgeway Freight Services', abn: '33 051 775 556', contact: 'Hannah Brooks', phone: '02 9555 0187', email: 'dispatch@ridgewayfreight.example', active: true },
    { id: 'c3', name: 'Bayside Express Logistics', abn: '12 004 044 937', contact: 'Tom Nguyen', phone: '07 3555 0119', email: 'hello@baysideexpress.example', active: true },
  ];

  const ncr = (x: Partial<Ncr> & Pick<Ncr, 'id' | 'number'>): Ncr => ({
    schemeType: '', category: 'Non Conformance', ncrType: '', pageNumber: '', problem: '', reportedDate: '', reportedBy: '',
    shortTerm: '', shortTermDate: '', shortTermBy: '', cause: '', causeDate: '', causeBy: '', longTerm: '', longTermDate: '', longTermBy: '',
    closed: false, closedDate: '', closedBy: '', closedPosition: '', createdAt: `${x.reportedDate ?? t}T09:00:00.000Z`, createdBy: x.reportedBy ?? 'Alex (Ops)', ...x,
  });
  const ncrs: Ncr[] = [
    ncr({ id: 'n1', number: 1561, schemeType: 'NHVAS Maintenance', category: 'Non Conformance', ncrType: 'Defect', vehicleId: 'v8', auditId: 'a1', defectId: 'df3', workOrderId: 'w3',
      problem: 'Roadworthiness inspection AUD-11 found two tyres on TRL-501 at 1.2 mm tread, below the 1.5 mm legal minimum.\nTrailer had completed 3 runs that week.',
      reportedDate: d(-10), reportedBy: 'Priya Nair',
      shortTerm: 'Trailer tagged out of service and parked in North Yard bay 4.\nAll other trailers spot-checked – no further issues.', shortTermDate: d(-10), shortTermBy: 'Maya Thompson',
      cause: 'Trailers are not on the pre-start checklist – only the prime mover is checked, so tread wear was only found at the quarterly inspection.', causeDate: d(-6), causeBy: 'Maya Thompson' }),
    ncr({ id: 'n2', number: 1562, schemeType: 'NHVAS Fatigue', category: 'Breach (Infringement Notices)', ncrType: 'Work Diary Pages (Log Book)', employeeId: 'd2', vehicleId: 'v4', pageNumber: '0048213',
      problem: 'Work diary review found the following breaches:\n\nDate        Rule                         Detail\n' + `${d(-9).split('-').reverse().join('/')}  Max work in 24 h             12 h 45 m worked (limit 12 h)\n${d(-8).split('-').reverse().join('/')}  Continuous 7 h rest          6 h 20 m rest taken\n${d(-8).split('-').reverse().join('/')}  Page not signed              Page 0048213 unsigned`,
      reportedDate: d(-7), reportedBy: 'Sofia Rossi',
      shortTerm: 'Driver interviewed and stood down for a 24 hour reset. Rosters for the week adjusted.', shortTermDate: d(-7), shortTermBy: 'Alex (Ops)' }),
    ncr({ id: 'n3', number: 1563, schemeType: 'Speed Management', category: 'Non Conformance', ncrType: 'Speeding', employeeId: 'd4', vehicleId: 'v5',
      problem: 'Telematics alert: UTE-301 recorded 78 km/h in a 60 km/h zone on Princes Hwy for 2.1 km.', reportedDate: d(-5), reportedBy: 'Alex (Ops)' }),
    ncr({ id: 'n4', number: 1564, schemeType: 'HACCP', category: 'Corrective Action Report', ncrType: 'HACCP-Logistics & Handling', vehicleId: 'v12', contractorId: 'c3',
      problem: 'Customer rejected chilled load on arrival – probe temperature 9.4 °C against a 5 °C limit.\nDoors were opened for 25 minutes at the previous drop.', reportedDate: d(-3), reportedBy: 'Liam Carter',
      shortTerm: 'Load quarantined and returned to cold store for assessment. Customer credited.', shortTermDate: d(-3), shortTermBy: 'Alex (Ops)',
      cause: 'Driver unloaded a multi-drop order with the rear doors open instead of using the side door and strip curtain.', causeDate: d(-2), causeBy: 'Sofia Rossi' }),
    ncr({ id: 'n5', number: 1565, schemeType: 'National Road Rules', category: 'Breach (Infringement Notices)', ncrType: 'Mobile Phone', employeeId: 'd6', vehicleId: 'v10',
      problem: 'Infringement notice received: driver detected by camera holding a mobile phone while driving.', reportedDate: d(-2), reportedBy: 'Alex (Ops)' }),
    ncr({ id: 'n6', number: 1566, schemeType: 'NHVAS Mass', category: 'Non Conformance', ncrType: 'Overload', employeeId: 'd3', vehicleId: 'v11', contractorId: 'c1',
      problem: 'Weighbridge docket shows drive axle group at 17.4 t against a 16.5 t limit. Load supplied by contractor.', reportedDate: d(-1), reportedBy: 'Priya Nair' }),
    ncr({ id: 'n7', number: 1560, schemeType: 'NHVAS Maintenance', category: 'Non Conformance', ncrType: 'Pre Start Check', employeeId: 'd1', vehicleId: 'v1',
      problem: 'Pre-start checks not completed for TRK-101 on three consecutive days.', reportedDate: d(-40), reportedBy: 'Alex (Ops)',
      shortTerm: 'Driver reminded of the requirement; checks completed before the next shift.', shortTermDate: d(-40), shortTermBy: 'Alex (Ops)',
      cause: 'Driver app had logged out after an update and the driver did not know how to sign back in.', causeDate: d(-38), causeBy: 'Maya Thompson',
      longTerm: 'IT pushed a fix so the app keeps drivers signed in. Toolbox talk on pre-start requirements held with all drivers.', longTermDate: d(-30), longTermBy: 'Maya Thompson',
      closed: true, closedDate: d(-28), closedBy: 'Maya Thompson', closedPosition: 'Compliance Manager' }),
    ncr({ id: 'n8', number: 1559, schemeType: 'NHVR Notice to Produce', category: 'Other Notices', ncrType: 'Notice to Produce', vehicleId: 'v2',
      problem: 'NHVR notice to produce maintenance records for TRK-102 within 14 days.', reportedDate: d(-60), reportedBy: 'Alex (Ops)',
      shortTerm: 'Service history and defect records compiled from Torqline and sent to NHVR.', shortTermDate: d(-55), shortTermBy: 'Alex (Ops)',
      cause: 'Random audit – no fault found.', causeDate: d(-55), causeBy: 'Alex (Ops)', longTerm: 'No further action required.', longTermDate: d(-50), longTermBy: 'Alex (Ops)',
      closed: true, closedDate: d(-50), closedBy: 'Alex (Ops)', closedPosition: 'Operations Manager' }),
  ];
  audits[0].items[3].ncrId = 'n1';
  audits[1].items[1].ncrId = 'n2';

  const reminders: Reminder[] = [
    { id: 'r1', entityType: 'vehicle', entityId: 'v5', title: 'Renew registration for UTE-301', dueDate: d(-3), repeat: 'yearly', priority: 'high', assignee: 'Alex (Ops)', done: false },
    { id: 'r2', entityType: 'vehicle', entityId: 'v6', title: 'Get insurance renewal quotes', dueDate: d(10), repeat: 'none', priority: 'medium', assignee: 'Alex (Ops)', done: false },
    { id: 'r3', entityType: 'driver', entityId: 'd2', title: 'Book Liam fatigue management refresher', dueDate: d(2), repeat: 'none', priority: 'high', assignee: 'Maya Thompson', done: false },
    { id: 'r4', entityType: 'part', entityId: 'p12', title: 'Chase H7 globe back-order with supplier', dueDate: d(1), repeat: 'none', priority: 'medium', assignee: 'Sam (Workshop)', done: false },
    { id: 'r5', entityType: 'ncr', entityId: 'n1', title: 'Review trailer pre-start records', dueDate: d(14), repeat: 'none', priority: 'medium', assignee: 'Maya Thompson', done: false },
    { id: 'r6', entityType: 'vehicle', entityId: 'v9', title: 'Forklift annual load test', dueDate: d(20), repeat: 'yearly', priority: 'medium', assignee: 'Sam (Workshop)', done: false },
  ];

  const notes: Note[] = [
    { id: 'no1', entityType: 'vehicle', entityId: 'v2', text: 'Air dryer was replaced last year – check warranty before buying a new one.', at: `${d(-30)}T09:12:00.000Z`, by: 'Sam (Workshop)', pinned: true },
    { id: 'no2', entityType: 'workOrder', entityId: 'w1', text: 'Diaphragm arrived from StopRight, fitting this afternoon.', at: `${d(-1)}T13:40:00.000Z`, by: 'Sam (Workshop)' },
    { id: 'no3', entityType: 'ncr', entityId: 'n1', text: 'Discussed at safety committee – agreed trailers need their own check sheet.', at: `${d(-3)}T15:05:00.000Z`, by: 'Maya Thompson', pinned: true },
    { id: 'no4', entityType: 'driver', entityId: 'd5', text: 'Doctor appointment booked for Friday to renew medical.', at: `${d(-1)}T08:20:00.000Z`, by: 'Alex (Ops)' },
  ];

  const attachments: Attachment[] = [
    { id: 'at1', entityType: 'vehicle', entityId: 'v1', name: 'TRK-101 registration certificate.pdf', category: 'Registration', mime: 'application/pdf', size: 184_000, storage: 'none', expiry: vehicles[0].regoExpiry, uploadedAt: `${d(-200)}T10:00:00.000Z`, uploadedBy: 'Alex (Ops)', notes: 'Sample document – no file attached' },
    { id: 'at2', entityType: 'vehicle', entityId: 'v1', name: 'Fleet insurance policy 2026.pdf', category: 'Insurance', mime: 'application/pdf', size: 912_000, storage: 'none', expiry: vehicles[0].insuranceExpiry, uploadedAt: `${d(-160)}T10:00:00.000Z`, uploadedBy: 'Alex (Ops)', notes: 'Sample document – no file attached' },
    { id: 'at3', entityType: 'vehicle', entityId: 'v9', name: 'Forklift load test certificate.pdf', category: 'Certificate', mime: 'application/pdf', size: 220_000, storage: 'none', expiry: d(20), uploadedAt: `${d(-345)}T10:00:00.000Z`, uploadedBy: 'Sam (Workshop)', notes: 'Sample document – no file attached' },
    { id: 'at4', entityType: 'driver', entityId: 'd1', name: 'Maya Thompson – HR licence.jpg', category: 'Licence', mime: 'image/jpeg', size: 420_000, storage: 'none', expiry: drivers[0].licenceExpiry, uploadedAt: `${d(-90)}T10:00:00.000Z`, uploadedBy: 'Alex (Ops)', notes: 'Sample document – no file attached' },
    { id: 'at5', entityType: 'ncr', entityId: 'n1', name: 'Tyre tread photos.zip', category: 'Non Conformance', mime: 'application/zip', size: 3_400_000, storage: 'none', uploadedAt: `${d(-10)}T11:30:00.000Z`, uploadedBy: 'Priya Nair', notes: 'Sample document – no file attached' },
    { id: 'at6', entityType: 'part', entityId: 'p9', name: 'RoadGrip supplier certificate.pdf', category: 'Certificate', mime: 'application/pdf', size: 150_000, storage: 'none', expiry: d(-6), uploadedAt: `${d(-371)}T10:00:00.000Z`, uploadedBy: 'Sam (Workshop)', notes: 'Sample document – no file attached' },
  ];

  const ev = (entityType: ActivityEvent['entityType'], entityId: string, day: number, by: string, kind: ActivityEvent['kind'], text: string): ActivityEvent =>
    ({ id: `ev-${entityType}-${entityId}-${day}-${kind}`, entityType, entityId, at: `${d(day)}T09:00:00.000Z`, by, kind, text });
  const activity: ActivityEvent[] = [
    ev('workOrder', 'w1', -1, 'Sam (Workshop)', 'status', 'Status changed: Open → In progress'),
    ev('workOrder', 'w1', -4, 'System', 'created', 'Work order created from defect “Brakes”'),
    ev('ncr', 'n1', -6, 'Maya Thompson', 'updated', 'Updated cause, cause date, cause by'),
    ev('ncr', 'n1', -10, 'Maya Thompson', 'updated', 'Updated short term fix, short term date, short term fix by'),
    ev('ncr', 'n1', -10, 'Priya Nair', 'created', 'Non conformance created from audit AUD-11'),
    ev('vehicle', 'v2', -4, 'Sam (Workshop)', 'status', 'Status changed: Active → In workshop'),
    ev('vehicle', 'v8', -10, 'Priya Nair', 'status', 'Status changed: Active → Off road'),
    ev('audit', 'a1', -10, 'Priya Nair', 'status', 'Status changed: In progress → Completed'),
  ];

  return {
    vehicles, schedules, workOrders, defects, checks, parts, drivers, fuel, ncrs, contractors, audits, attachments, reminders, notes, activity,
    settings: {
      companyName: 'Northwind Logistics',
      currency: 'USD',
      labourRate: 120,
      checklist: DEFAULT_CHECKLIST,
      depots: ['North Yard', 'South Depot', 'City Hub'],
      ncrSchemes: DEFAULT_NCR_SCHEMES,
      ncrCategories: DEFAULT_NCR_CATEGORIES,
      ncrTypes: DEFAULT_NCR_TYPES,
    },
  };
}
