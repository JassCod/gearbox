-- =====================================================================
-- Torqline – Supabase schema
-- Run this once in your Supabase project: Dashboard → SQL Editor → New
-- query → paste this whole file → Run. It is safe to run again.
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  full_name    text not null default '',
  role         text not null default 'pending'
               check (role in ('admin', 'manager', 'technician', 'driver', 'viewer', 'pending')),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);

-- Every fleet record (vehicles, work orders, parts, …) lives here as JSON,
-- keyed by collection + id. This mirrors the app's data model 1:1.
create table if not exists public.records (
  collection text not null
             check (collection <> ''),
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (collection, id)
);

-- Allowed collections (kept outside CREATE TABLE so re-running this file upgrades older installs).
alter table public.records drop constraint if exists records_collection_check;
alter table public.records add constraint records_collection_check
  check (collection in ('vehicles', 'schedules', 'workOrders', 'defects', 'checks', 'parts', 'drivers', 'fuel',
                                 'ncrs', 'audits', 'attachments', 'reminders', 'notes', 'activity'));

create table if not exists public.app_settings (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  user_email text,
  action     text not null,
  collection text,
  record_id  text,
  summary    text
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);

-- ---------- Helpers ---------------------------------------------------

-- Role of the signed-in user, or null when signed out / deactivated.
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin', 'manager', 'technician', 'driver', 'viewer'), false)
$$;

-- Which collections each role may create / edit.
create or replace function public.can_write(target text)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'admin'      then true
    when 'manager'    then true
    when 'technician' then target in ('vehicles', 'schedules', 'workOrders', 'defects', 'checks', 'parts', 'fuel',
                                      'ncrs', 'audits', 'attachments', 'reminders', 'notes', 'activity')
    -- Drivers submit checks, defects and fuel; those also bump the vehicle odometer.
    when 'driver'     then target in ('vehicles', 'checks', 'defects', 'fuel', 'attachments', 'notes', 'activity')
    else false
  end
$$;

-- ---------- New sign-ups ---------------------------------------------
-- The very first account becomes the admin. Everyone after that waits in
-- "pending" until an admin approves them and picks a role.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(727274);
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when exists (select 1 from public.profiles) then 'pending' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Profile guards --------------------------------------------
-- Only admins change roles or access, and there must always be one active admin.

create or replace function public.guard_profiles()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor text := public.my_role();
begin
  if tg_op = 'UPDATE' then
    if (new.role is distinct from old.role or new.active is distinct from old.active
        or new.email is distinct from old.email or new.id is distinct from old.id)
       and coalesce(actor, '') <> 'admin' and auth.uid() is not null then
      raise exception 'Only an admin can change roles or access';
    end if;
  end if;

  if (tg_op = 'DELETE' and old.role = 'admin' and old.active)
     or (tg_op = 'UPDATE' and old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active)) then
    if (select count(*) from public.profiles where role = 'admin' and active and id <> old.id) = 0 then
      raise exception 'There must always be at least one active admin';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists guard_profiles on public.profiles;
create trigger guard_profiles
  before update or delete on public.profiles
  for each row execute function public.guard_profiles();

-- ---------- Activity log ---------------------------------------------

create or replace function public.log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  row_data jsonb;
  label    text;
  email    text;
begin
  select p.email into email from public.profiles p where p.id = auth.uid();

  if tg_table_name = 'records' then
    -- The app keeps its own per-item history in the 'activity' collection; don't echo it here.
    if (case when tg_op = 'DELETE' then old.collection else new.collection end) = 'activity' then
      return null;
    end if;
    row_data := case when tg_op = 'DELETE' then old.data else new.data end;
    label := coalesce(
      case when row_data ? 'number' then '#' || (row_data ->> 'number') || ' ' || coalesce(row_data ->> 'title', '') end,
      row_data ->> 'title', row_data ->> 'rego', row_data ->> 'name', row_data ->> 'item', row_data ->> 'sku',
      left(row_data ->> 'text', 60),
      case when row_data ? 'passed' then 'Pre-start ' || case when (row_data ->> 'passed')::boolean then 'passed' else 'failed' end end,
      case when row_data ? 'litres' then 'Fuel fill ' || (row_data ->> 'litres') || ' L' end,
      case when tg_op = 'DELETE' then old.id else new.id end);
    -- Record status changes on work orders so the log reads naturally.
    if tg_op = 'UPDATE' and new.collection = 'workOrders' and (old.data ->> 'status') is distinct from (new.data ->> 'status') then
      label := label || ' → ' || (new.data ->> 'status');
    end if;
    insert into public.audit_log (user_id, user_email, action, collection, record_id, summary)
    values (auth.uid(), email, lower(tg_op),
            case when tg_op = 'DELETE' then old.collection else new.collection end,
            case when tg_op = 'DELETE' then old.id else new.id end, label);

  elsif tg_table_name = 'profiles' then
    if tg_op = 'UPDATE' and (new.role is distinct from old.role or new.active is distinct from old.active) then
      insert into public.audit_log (user_id, user_email, action, collection, record_id, summary)
      values (auth.uid(), email, 'user', 'profiles', new.id::text,
              new.email || ': ' || old.role || case when old.active then '' else ' (inactive)' end
              || ' → ' || new.role || case when new.active then '' else ' (inactive)' end);
    elsif tg_op = 'INSERT' then
      insert into public.audit_log (user_id, user_email, action, collection, record_id, summary)
      values (new.id, new.email, 'signup', 'profiles', new.id::text, new.email || ' signed up as ' || new.role);
    elsif tg_op = 'DELETE' then
      insert into public.audit_log (user_id, user_email, action, collection, record_id, summary)
      values (auth.uid(), email, 'user', 'profiles', old.id::text, old.email || ' removed');
    end if;

  elsif tg_table_name = 'app_settings' then
    insert into public.audit_log (user_id, user_email, action, collection, record_id, summary)
    values (auth.uid(), email, 'settings', 'settings', '1', 'Settings updated');
  end if;

  return null;
end $$;

drop trigger if exists log_records on public.records;
create trigger log_records after insert or update or delete on public.records
  for each row execute function public.log_activity();

drop trigger if exists log_profiles on public.profiles;
create trigger log_profiles after insert or update or delete on public.profiles
  for each row execute function public.log_activity();

drop trigger if exists log_settings on public.app_settings;
create trigger log_settings after insert or update on public.app_settings
  for each row execute function public.log_activity();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists touch_records on public.records;
create trigger touch_records before insert or update on public.records
  for each row execute function public.touch_updated_at();

-- Drivers and technicians may move a vehicle's meters (fuel fills, pre-start checks) and
-- technicians may flip its workshop status, but only managers/admins add or edit vehicles.
create or replace function public.guard_vehicle_edits()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  role     text := public.my_role();
  existing jsonb;
  allowed  text[];
begin
  if new.collection <> 'vehicles' or coalesce(role, '') not in ('driver', 'technician') then
    return new;
  end if;
  allowed := case when role = 'technician' then array['odometer', 'hours', 'status'] else array['odometer', 'hours'] end;
  if tg_op = 'INSERT' then
    -- INSERT … ON CONFLICT fires this before the conflict turns it into an update.
    select data into existing from public.records where collection = new.collection and id = new.id;
    if existing is null then
      raise exception 'Only managers and admins can add vehicles';
    end if;
  else
    existing := old.data;
  end if;
  if (existing - allowed) is distinct from (new.data - allowed) then
    raise exception 'Only managers and admins can edit vehicle details';
  end if;
  return new;
end $$;

drop trigger if exists guard_vehicle_edits on public.records;
create trigger guard_vehicle_edits before insert or update on public.records
  for each row execute function public.guard_vehicle_edits();

-- ---------- Row level security ----------------------------------------

alter table public.profiles     enable row level security;
alter table public.records      enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_log    enable row level security;

drop policy if exists "profiles: read" on public.profiles;
create policy "profiles: read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_member());

drop policy if exists "profiles: update" on public.profiles;
create policy "profiles: update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.my_role() = 'admin')
  with check (id = auth.uid() or public.my_role() = 'admin');

drop policy if exists "profiles: delete" on public.profiles;
create policy "profiles: delete" on public.profiles for delete to authenticated
  using (public.my_role() = 'admin' and id <> auth.uid());

drop policy if exists "records: read" on public.records;
create policy "records: read" on public.records for select to authenticated
  using (public.is_member());

drop policy if exists "records: insert" on public.records;
create policy "records: insert" on public.records for insert to authenticated
  with check (public.can_write(collection));

drop policy if exists "records: update" on public.records;
create policy "records: update" on public.records for update to authenticated
  using (public.can_write(collection)) with check (public.can_write(collection));

drop policy if exists "records: delete" on public.records;
create policy "records: delete" on public.records for delete to authenticated
  using (public.my_role() in ('admin', 'manager'));

drop policy if exists "settings: read" on public.app_settings;
create policy "settings: read" on public.app_settings for select to authenticated
  using (public.is_member());

drop policy if exists "settings: write" on public.app_settings;
create policy "settings: write" on public.app_settings for all to authenticated
  using (public.my_role() in ('admin', 'manager')) with check (public.my_role() in ('admin', 'manager'));

drop policy if exists "audit: admin read" on public.audit_log;
create policy "audit: admin read" on public.audit_log for select to authenticated
  using (public.my_role() = 'admin');

revoke all on public.profiles, public.records, public.app_settings, public.audit_log from anon;
grant select, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.records to authenticated;
grant select, insert, update on public.app_settings to authenticated;
grant select on public.audit_log to authenticated;

-- ---------- Document storage ------------------------------------------
-- Files attached to items (registration papers, invoices, photos…) live in a
-- private bucket. Members can read; anyone who can write records can upload;
-- managers and admins can delete.

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
      on conflict (id) do nothing;

    drop policy if exists "documents: read" on storage.objects;
    create policy "documents: read" on storage.objects for select to authenticated
      using (bucket_id = 'documents' and public.is_member());

    drop policy if exists "documents: upload" on storage.objects;
    create policy "documents: upload" on storage.objects for insert to authenticated
      with check (bucket_id = 'documents' and public.my_role() in ('admin', 'manager', 'technician', 'driver'));

    drop policy if exists "documents: delete" on storage.objects;
    create policy "documents: delete" on storage.objects for delete to authenticated
      using (bucket_id = 'documents' and public.my_role() in ('admin', 'manager'));
  end if;
end $$;

-- ---------- Realtime --------------------------------------------------
-- Lets every open browser see changes the moment they are saved.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.records;      exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.app_settings; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.profiles;     exception when duplicate_object then null; end;
  end if;
end $$;
