# Switching on logins, the shared database and the admin panel

Torqline uses [Supabase](https://supabase.com), which provides a hosted Postgres database and email logins, to store the fleet data for your whole team. The free plan is plenty for a small fleet. Setup takes about 10 minutes, and you only do it once.

## 1. Create a Supabase project

1. Sign up at <https://supabase.com> and click **New project**.
2. Pick a name (for example `torqline`), set a database password, and choose the region closest to you.
3. Wait a minute or two for the project to finish setting up.

## 2. Create the tables and security rules

1. In your project, open **SQL Editor** → **New query**.
2. Paste in the whole of [`schema.sql`](./schema.sql) and click **Run**.

This creates the tables, the role-based security rules, the activity log and live updates. It's safe to run again later.

## 3. Tell Supabase where the app lives

Open **Authentication** → **URL Configuration** and set:

- **Site URL:** `https://jasscod.github.io/gearbox/`
- **Redirect URLs:** add `https://jasscod.github.io/gearbox/` (and `http://localhost:5173/` if you develop locally)

These addresses are where the "confirm your email" and "reset password" links send people back to.

> Tip: For a quick test you can turn off **Authentication → Providers → Email → Confirm email**, so new accounts can sign in straight away. Supabase's built-in email sender only sends a few emails per hour. For real use, add your own SMTP server under **Project Settings → Authentication**.

## 4. Give the website your project's keys

1. In Supabase, open **Project Settings** → **API** and copy the **Project URL** and the **anon public** key.
2. In GitHub, open the repository → **Settings** → **Secrets and variables** → **Actions** → **Variables** tab → **New repository variable**, and add:
   - `VITE_SUPABASE_URL` = the Project URL
   - `VITE_SUPABASE_ANON_KEY` = the anon public key
3. Go to **Actions** → **Deploy to GitHub Pages** → **Run workflow** to rebuild the site.

The anon key is designed to be public. What each person can see and change is decided by the security rules from step 2, which run inside the database.

## 5. Become the admin

1. Open the site and click **Create account**. **The first account created becomes the admin.**
2. Go to **Admin panel → Data** and click **Load demo data** to explore, or just start adding your own vehicles.
3. Ask your team to create accounts. They'll see a "waiting for approval" screen until you approve them under **Admin panel → Users** and pick their role.

## Roles

| Role | Can do |
| --- | --- |
| **Admin** | Everything, plus the admin panel: approve or deactivate users, change roles, view the activity log, backups and demo data |
| **Manager** | Create, edit and delete all fleet records; change settings |
| **Technician** | Work orders, service schedules, parts, defects, pre-start checks, fuel, odometer readings |
| **Driver** | Pre-start checks, defect reports, fuel fills, odometer readings |
| **Viewer** | Read-only access |

There must always be at least one active admin, and nobody can change their own role.

## Local development against Supabase

```bash
cp .env.example .env.local   # fill in the two values
npm run dev
```
