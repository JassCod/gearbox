# Switching on logins, the shared database and the admin panel

Torqline uses [Supabase](https://supabase.com), which provides a hosted Postgres database and email logins, to store the fleet data for your whole team. The free plan is plenty for a small fleet. Setup takes about 10 minutes, and you only do it once.

## 1. Create a Supabase project

1. Sign up at <https://supabase.com> and click **New project**.
2. Pick a name (for example `torqline`), set a database password, and choose the region closest to you.
3. Wait a minute or two for the project to finish setting up.

## 2. Create the tables and security rules

1. In your project, open **SQL Editor** → **New query**.
2. Open [`schema.sql`](https://raw.githubusercontent.com/JassCod/gearbox/main/supabase/schema.sql), select all of its text (Ctrl+A), copy it (Ctrl+C), paste it into the editor, and click **Run**. Paste the file's *contents*, not its name.

This creates the tables, the role-based security rules, the activity log and live updates. It's safe to run again later.

> **Updating from an earlier version?** Run `schema.sql` again. It's safe to re-run, and it adds what the newer features need: NCRs, audits, documents, reminders, notes, item history and the private `documents` storage bucket for uploaded files.

## 3. Tell Supabase where the app lives

Open **Authentication** → **URL Configuration** and set:

- **Site URL:** `https://jasscod.github.io/gearbox/`
- **Redirect URLs:** add `https://jasscod.github.io/gearbox/` (and `http://localhost:5173/` if you develop locally)

These addresses are where the "confirm your email" and "reset password" links send people back to.

> Tip: For a quick test you can turn off **Authentication → Providers → Email → Confirm email**, so new accounts can sign in straight away. Supabase's built-in email sender only sends a few emails per hour. For real use, add your own SMTP server under **Project Settings → Authentication**.

## 4. Give the website your project's keys

1. In Supabase, open **Project Settings** → **API Keys** and copy the **Project URL** and the **publishable** key (`sb_publishable_…`). The legacy anon key also works.
2. Put them in [`.env.production`](../.env.production) in the repository and push to `main`. The site rebuilds automatically.

These two values are designed to be public. What each person can see and change is decided by the security rules from step 2, which run inside the database. **Never** put the secret key (`sb_secret_…`) or the service_role key in the repository or the app.

## 5. Become the admin

1. Open the site and click **Create account**. **The first account created becomes the admin.**
2. Go to **Admin panel → Data** and click **Load demo data** to explore, or just start adding your own vehicles.
3. Ask your team to create accounts. They'll see a "waiting for approval" screen until you approve them under **Admin panel → Users** and pick their role.

## Roles

| Role | Can do |
| --- | --- |
| **Admin** | Everything, plus the admin panel: approve or deactivate users, change roles, view the activity log, backups and demo data |
| **Manager** | Create, edit and delete all fleet records; change settings |
| **Technician** | Work orders, service schedules, parts, defects, NCRs, audits, reminders, pre-start checks, fuel, documents, notes, odometer readings |
| **Driver** | Pre-start checks, defect reports, fuel fills, documents, notes, odometer readings |
| **Viewer** | Read-only access |

There must always be at least one active admin, and nobody can change their own role.

## Local development against Supabase

```bash
cp .env.example .env.local   # fill in the two values
npm run dev
```
