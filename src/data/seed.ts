import type {
  AppData, Defect, Driver, FuelEntry, Part, PrestartCheck, ServiceSchedule, Vehicle, WorkOrder,
} from '../types';
import { addDays, todayISO } from '../lib/utils';

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
    { id: 'd1', name: 'Maya Thompson', phone: '0412 555 101', email: 'maya@example.com', licenceClass: 'HR', licenceExpiry: d(410), medicalExpiry: d(120), depot: 'North Yard', trainings: [{ name: 'Fatigue management', expiry: d(200) }, { name: 'Forklift', expiry: d(22) }] },
    { id: 'd2', name: 'Liam Carter', phone: '0412 555 102', email: 'liam@example.com', licenceClass: 'MR', licenceExpiry: d(18), medicalExpiry: d(300), depot: 'North Yard', trainings: [{ name: 'Fatigue management', expiry: d(-5) }] },
    { id: 'd3', name: 'Priya Nair', phone: '0412 555 103', email: 'priya@example.com', licenceClass: 'HC', licenceExpiry: d(700), medicalExpiry: d(250), depot: 'South Depot', trainings: [{ name: 'Dangerous goods', expiry: d(90) }] },
    { id: 'd4', name: 'Noah Kim', phone: '0412 555 104', email: 'noah@example.com', licenceClass: 'C', licenceExpiry: d(900), medicalExpiry: d(500), depot: 'South Depot', trainings: [] },
    { id: 'd5', name: 'Sofia Rossi', phone: '0412 555 105', email: 'sofia@example.com', licenceClass: 'LR', licenceExpiry: d(330), medicalExpiry: d(-12), depot: 'City Hub', trainings: [{ name: 'First aid', expiry: d(160) }] },
    { id: 'd6', name: 'Ethan Walker', phone: '0412 555 106', email: 'ethan@example.com', licenceClass: 'HR', licenceExpiry: d(520), medicalExpiry: d(190), depot: 'City Hub', trainings: [{ name: 'Excavator ticket', expiry: d(365) }] },
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
    { id: 'w1', number: 1041, vehicleId: 'v2', title: 'Repair rear brake air leak', description: 'Replace brake chamber diaphragm and test system.', type: 'Repair', priority: 'critical', status: 'in-progress', assignee: 'Sam (Workshop)', dueDate: d(1), createdAt: d(-4), labourHours: 3, labourRate: 120, parts: [{ partId: 'p7', qty: 1 }], defectId: 'df1' },
    { id: 'w2', number: 1042, vehicleId: 'v2', title: 'A-Service (oil & filters)', description: 'Overdue scheduled service.', type: 'Service', priority: 'high', status: 'waiting-parts', assignee: 'Sam (Workshop)', dueDate: d(2), createdAt: d(-3), labourHours: 2.5, labourRate: 120, parts: [{ partId: 'p1', qty: 1 }, { partId: 'p4', qty: 1 }, { partId: 'p5', qty: 1 }], scheduleId: 's3' },
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

  return {
    vehicles, schedules, workOrders, defects, checks, parts, drivers, fuel,
    settings: {
      companyName: 'Northwind Logistics',
      currency: 'USD',
      labourRate: 120,
      checklist: DEFAULT_CHECKLIST,
      depots: ['North Yard', 'South Depot', 'City Hub'],
    },
  };
}
