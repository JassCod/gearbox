# Torqline – Fleet Maintenance

Torqline is a web app for running a vehicle and equipment fleet. It supports **team logins, role-based permissions, a shared live database and an admin panel**. It covers servicing, workshop jobs, driver pre-start checks, defects, parts, fuel and compliance, all from one dashboard.

## Features

**Every record has its own page.** Vehicles, work orders, defects, parts, drivers, service schedules, pre-start checks, NCRs and audits each open as a full page (fuel fills are quick entries added straight into the fuel log) with a header banner and tabs. Four tabs come with every item:

| Tab | What it does |
| --- | --- |
| **Documents** | Drag-and-drop uploads (registration papers, invoices, photos, certificates) with categories and optional expiry dates. Expiry dates feed the compliance register and alerts. |
| **Reminders** | Due dates, repeats (weekly to yearly), priority and assignee. Repeating reminders roll forward when ticked off. |
| **History** | An automatic timeline of every change (status moves, field edits, documents, notes), plus related events such as completed jobs and checks. |
| **Notes** | A team comment thread with pinning. |

**Operations**

| Area | What you can do |
| --- | --- |
| **Dashboard** | A live fleet board (every asset as a tile in its depot lane, lit by health, with a clock, compliance gauge and pre-start coverage ring), KPI tiles with count-up numbers, fleet health, spend, services due, reminders due, open NCRs and a "needs attention" feed |
| **Vehicles** | Card or table view with a health filter. Vehicle pages have Overview, Maintenance, Fuel & costs (cost per km, economy chart), Defects & checks and Compliance tabs |
| **Work orders** | A Kanban board. Job pages have a status stepper, task checklist (standard templates for services, tyres and inspections), parts & labour costing and a printable job card |
| **Schedules** | Service intervals by km, hours or days, with progress rings, service history and one-click booking |
| **Pre-starts & defects** | A full-page walk-around checklist with signature. Faults become defects automatically; repeat defects are flagged, and critical defects take the vehicle off the road |
| **Parts, drivers, fuel** | Stock gauges and receiving stock; every driver card shows a licence / medical / training timeline at a glance; an inline quick-add panel in the fuel log |

**Compliance**

| Area | What you can do |
| --- | --- |
| **Compliance hub** | An animated 0–100 score (grade A–D) that lists exactly what is costing points; a register of everything that expires; a driver compliance grid; open NCRs by scheme and type; upcoming audits |
| **Non Conformances** | Open and Closed registers with Groups (depot) / SubGroups (vehicle type) filters saved per user, Add New / Open / Closed / Reports tiles, and a searchable, sortable, paginated table with Copy, CSV and Print. Each NCR opens as a full-screen form: Scheme, Category and Type (admin-editable lists in Settings), Employee, Contractor, Page Number and Vehicle/Asset; *More Information* links a fit-for-duty (pre-start) check and a related event (defect, audit or work order). The Details tab has the four stages (Problem, Short term fix, Cause, Long term fix), each with a date (DD/MM/YYYY) and a person, plus a closing strip (closed date, by, position, **Completed**). The Documents tab takes multi-file uploads and drag and drop, and tags every file "Non Conformance". *Show History* lists locked system entries and notes you can star onto the dashboard. Reports: Open and Closed registers as **PDF or XLSX**, and a printable single-NCR report with PDF download. NCRs can still be raised from a defect, an audit finding or a work order |
| **Contractors** | A register of outside operators (ABN, contact, phone, email, active/inactive). Pick them on NCRs, or add one straight from the NCR form |
| **Audits** | Four templates (vehicle roadworthiness, depot safety walk, driver compliance review, maintenance records). Audits are scored pass/fail/N-A with notes, and **failed items raise NCRs in one click** |

**Across the app**
- A command palette (Ctrl/⌘ K) searches every record and jumps to actions.
- An alerts bell collects expiries, overdue items, reminders and NCRs.
- Calendar, reports, dark mode and phone layout.
- Celebration confetti when a job, NCR or audit is closed out.
- A real-time 3D login scene (Three.js): a truck drives a dusk highway past street lights and oncoming traffic, and the sign-in form floats in the scene as a glass heads-up display.

**Team mode** adds email/password logins with admin approval, five roles enforced by the database, live sync between users, file storage for documents, and the admin panel (users, activity log, role overview, backups).

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
