# Torqline – Fleet Maintenance

Torqline is a web app for running a vehicle and equipment fleet. It supports **team logins, role-based permissions, a shared live database and an admin panel**. It covers servicing, workshop jobs, driver pre-start checks, defects, parts, fuel and compliance, all from one dashboard.

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
| **Team & admin panel** | Email and password login, and new accounts wait for an admin's approval. Five roles (admin, manager, technician, driver, viewer), each enforced by the database. Changes sync live between everyone who has the app open. The admin panel has user management, an activity log (who changed what, exportable as CSV), a role and permission overview, and backup and demo-data tools |
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

## Live site

https://jasscod.github.io/gearbox/ – redeployed automatically by `.github/workflows/deploy.yml` on every push to `main`.

## Getting started

```bash
npm install
npm run dev       # start the dev server at http://localhost:5173
npm run build     # type-check and build a production bundle into dist/
npm run preview   # serve the production build
```

### Two modes

- **Local mode** (the default): no login, and data is saved in the browser. This is great for trying the app out.
- **Team mode:** logins plus a shared Supabase database. Follow **[supabase/README.md](supabase/README.md)** to set it up (about 10 minutes, free plan).

In local mode, the app comes loaded with demo data. Use **Settings → Start fresh** to clear it, or **Load demo data** to bring it back. Data is saved in the browser's local storage, so use **Download backup** to move it between devices.

## Tech

React 19, TypeScript, Vite, React Router, Recharts and Lucide icons. Team mode adds Supabase (Postgres with row-level security, Auth, Realtime).

## Project layout

```
src/
  components/   Layout (sidebar, search, alerts) and shared UI
  data/seed.ts  Demo data
  lib/          Date, cost, service-due and fleet-health logic, and alerts
  pages/        One file per screen
  store.tsx     App state, cross-module automations, and cloud sync (diff → push, realtime → merge)
  auth.tsx      Login session, profile and role
supabase/
  schema.sql    Tables, row-level security, activity-log triggers (run once in Supabase)
  README.md     Step-by-step setup for team mode
  types.ts      Data model
```
