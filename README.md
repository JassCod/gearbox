# Torqline – Fleet Maintenance

Torqline is a web app for running a vehicle and equipment fleet. It covers servicing, workshop jobs, driver pre-start checks, defects, parts, fuel and compliance, all from one dashboard.

## Features

| Area | What you can do |
| --- | --- |
| **Dashboard** | See fleet availability and green/amber/red health at a glance, plus KPI tiles, a 6-month spend chart, upcoming services, and a "needs attention" feed |
| **Vehicles & assets** | Trucks, vans, utes, cars, trailers, forklifts and excavators, shown as a table or cards, with filters and CSV export. Each asset has its own page with service progress, work order history, defects, fuel chart and costs |
| **Service schedules** | Set intervals by **km, engine hours or days**, whichever comes first. See progress bars, book a service as a work order in one click, or mark it done |
| **Work orders** | Kanban board with drag and drop (Open → In progress → Waiting on parts → Completed) or a list view. Add parts from inventory, track labour cost and print job cards |
| **Pre-start checks** | Mobile-friendly checklist with a typed signature. Failed items **automatically become defects** |
| **Defects** | Filter by severity and status, and turn a defect into a work order in one click |
| **Parts inventory** | Stock levels, low-stock and out-of-stock alerts, and a CSV re-order list |
| **Drivers** | Licence, medical and training expiry tracking, plus each driver's pre-start pass rate |
| **Fuel log** | Record fills, spend and price per litre, and see economy (L/100 km) |
| **Calendar** | Month view of work orders, services, and vehicle and driver expiries |
| **Reports** | Cost per vehicle and per km, spend by depot and by job type, on-time completion, pre-start pass rate, most-reported defect areas, workshop productivity |
| **Settings** | Company name, currency, labour rate, depots, custom pre-start checklist, JSON backup and restore |

Everyday touches:
- Global search (Ctrl/⌘ K) and an alerts bell.
- Dark mode.
- Responsive layout for phones.
- Printable reports.

### Automations
- Completing a work order deducts the parts it used from stock, resolves the linked defect, and resets the linked service schedule.
- Fuel fills and pre-start checks update the vehicle's odometer.
- A vehicle in the workshop goes back to *active* once its last open job is completed.

## Getting started

```bash
npm install
npm run dev       # start the dev server at http://localhost:5173
npm run build     # type-check and build a production bundle into dist/
npm run preview   # serve the production build
```

The app comes loaded with demo data. Use **Settings → Start fresh** to clear it, or **Load demo data** to bring it back. Data is saved in the browser's local storage, so use **Download backup** to move it between devices.

## Tech

React 19, TypeScript, Vite, React Router, Recharts and Lucide icons. There is no backend.

## Project layout

```
src/
  components/   Layout (sidebar, search, alerts) and shared UI
  data/seed.ts  Demo data
  lib/          Date, cost, service-due and fleet-health logic, and alerts
  pages/        One file per screen
  store.tsx     App state and the cross-module automations
  types.ts      Data model
```
