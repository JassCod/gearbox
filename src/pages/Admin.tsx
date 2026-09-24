import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Download, RefreshCw, ShieldCheck, Trash2, UserCheck, Users, History, Database, KeyRound } from 'lucide-react';
import { useStore } from '../store';
import { useAuth, type Profile } from '../auth';
import { supabase } from '../lib/supabase';
import { ROLES, canDelete, canWrite, type Role } from '../lib/permissions';
import { COLLECTIONS } from '../lib/cloudSync';
import { Badge, Card, Empty, PageHeader, SearchInput, Select, StatCard, confirmAction } from '../components/ui';
import { DataTools } from '../components/DataTools';
import { downloadCSV, fmtDate, humanize } from '../lib/utils';
import type { CollectionKey } from '../types';

type Tab = 'users' | 'activity' | 'roles' | 'data';

interface AuditRow {
  id: number;
  at: string;
  user_email: string | null;
  action: string;
  collection: string | null;
  record_id: string | null;
  summary: string | null;
}

const COLLECTION_LABELS: Record<CollectionKey, string> = {
  vehicles: 'Vehicles', schedules: 'Service schedules', workOrders: 'Work orders', defects: 'Defects',
  checks: 'Pre-start checks', parts: 'Parts', drivers: 'Drivers', fuel: 'Fuel log',
  ncrs: 'NCRs', audits: 'Audits', attachments: 'Documents', reminders: 'Reminders', notes: 'Notes', activity: 'Item history',
};

const fmtDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export default function Admin() {
  const { mode } = useAuth();
  const { data } = useStore();
  const [tab, setTab] = useState<Tab>(mode === 'cloud' ? 'users' : 'data');
  const records = COLLECTIONS.reduce((n, c) => n + data[c].length, 0);

  return (
    <>
      <PageHeader title="Admin panel" subtitle={mode === 'cloud' ? 'Manage who can use Torqline, see what changed, and look after your data.' : 'Running in local mode – connect Supabase to enable team logins.'} />
      <div className="segmented tabs">
        {([
          ['users', 'Users', Users], ['activity', 'Activity log', History], ['roles', 'Roles & permissions', KeyRound], ['data', 'Data', Database],
        ] as const).map(([k, label, Icon]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Icon size={15} /> {label}</button>
        ))}
      </div>
      {tab === 'users' && (mode === 'cloud' ? <UsersPanel /> : <LocalModeNotice />)}
      {tab === 'activity' && (mode === 'cloud' ? <ActivityPanel /> : <LocalModeNotice />)}
      {tab === 'roles' && <RolesPanel />}
      {tab === 'data' && (
        <div className="grid-2">
          <Card title="Backups & demo data"><DataTools /></Card>
          <Card title="What's stored">
            <table className="table compact">
              <tbody>
                {COLLECTIONS.map((c) => <tr key={c}><td>{COLLECTION_LABELS[c]}</td><td className="num">{data[c].length}</td></tr>)}
                <tr><td className="strong">Total records</td><td className="num strong">{records}</td></tr>
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </>
  );
}

function LocalModeNotice() {
  return (
    <Card>
      <Empty icon={<ShieldCheck size={32} />} title="Team logins aren't switched on yet">
        This copy of Torqline keeps data in one browser. To give your team logins, roles and a shared live database,
        create a free Supabase project and follow the steps in <code>supabase/README.md</code> in the repository.
      </Empty>
    </Card>
  );
}

function UsersPanel() {
  const { profile: me } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'inactive'>('all');
  const [approveRole, setApproveRole] = useState<Record<string, Role>>({});

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error: err } = await supabase.from('profiles').select('*').order('created_at');
    if (err) setError(err.message); else setUsers(data as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    if (!supabase) return;
    const client = supabase;
    const channel = client.channel('admin-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => load())
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [load]);

  const update = async (id: string, patch: Partial<Profile>) => {
    setError('');
    const { error: err } = await supabase!.from('profiles').update(patch).eq('id', id);
    if (err) setError(err.message);
    load();
  };

  const removeUser = async (u: Profile) => {
    if (!confirmAction(`Remove ${u.email} from the workspace? They will no longer be able to see any data.`)) return;
    const { error: err } = await supabase!.from('profiles').delete().eq('id', u.id);
    if (err) setError(err.message);
    load();
  };

  const pending = users.filter((u) => u.role === 'pending' && u.active);
  const rows = useMemo(() => users.filter((u) => {
    const s = q.toLowerCase();
    return (!s || u.email.toLowerCase().includes(s) || u.full_name.toLowerCase().includes(s))
      && (filter === 'all' || (filter === 'pending' ? u.role === 'pending' : filter === 'active' ? u.active && u.role !== 'pending' : !u.active));
  }), [users, q, filter]);

  const weekAgo = Date.now() - 7 * 86_400_000;
  return (
    <>
      <div className="stats">
        <StatCard label="Members" value={users.filter((u) => u.active && u.role !== 'pending').length} icon={<Users size={18} />} />
        <StatCard label="Waiting for approval" value={pending.length} tone={pending.length ? 'warn' : 'good'} icon={<UserCheck size={18} />} onClick={() => setFilter('pending')} />
        <StatCard label="Admins" value={users.filter((u) => u.role === 'admin' && u.active).length} icon={<ShieldCheck size={18} />} />
        <StatCard label="Active this week" value={users.filter((u) => u.last_seen_at && new Date(u.last_seen_at).getTime() > weekAgo).length} />
      </div>

      {error && <div className="banner tone-bad">{error}</div>}

      {pending.length > 0 && (
        <Card title={`Approve new accounts (${pending.length})`}>
          <ul className="list">
            {pending.map((u) => (
              <li key={u.id}>
                <div><span className="strong">{u.full_name || u.email}</span><div className="small muted">{u.email} · signed up {fmtDateTime(u.created_at)}</div></div>
                <div className="row gap-sm wrap">
                  <Select label="Role" value={approveRole[u.id] ?? 'driver'} onChange={(r) => setApproveRole({ ...approveRole, [u.id]: r })}
                    options={ROLES.map((r) => ({ value: r.value, label: r.label }))} />
                  <button className="btn btn-primary btn-sm" onClick={() => update(u.id, { role: approveRole[u.id] ?? 'driver' })}><Check size={14} /> Approve</button>
                  <button className="btn btn-danger-ghost btn-sm" onClick={() => update(u.id, { active: false })}>Decline</button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="All users" actions={<button className="icon-btn" onClick={load} aria-label="Refresh"><RefreshCw size={16} /></button>}>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search name or email…" />
          <div className="segmented">
            {(['all', 'active', 'pending', 'inactive'] as const).map((f) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{humanize(f)}</button>)}
          </div>
        </div>
        <p className="small muted">New people sign up on the login page with “Create account”, then appear here for approval.</p>
        {loading && !users.length ? <p className="muted">Loading…</p> : rows.length === 0 ? <Empty title="No users match" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>User</th><th>Role</th><th>Access</th><th>Joined</th><th>Last seen</th><th></th></tr></thead>
              <tbody>
                {rows.map((u) => {
                  const self = u.id === me?.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="row gap-sm">
                          <span className="avatar sm">{(u.full_name || u.email).split(/[\s@.]/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase()}</span>
                          <div><span className="strong">{u.full_name || '—'}</span>{self && <span className="small muted"> (you)</span>}<div className="small muted">{u.email}</div></div>
                        </div>
                      </td>
                      <td>
                        <select className="input input-sm" value={u.role} disabled={self} aria-label="Role"
                          onChange={(e) => update(u.id, { role: e.target.value as Role })}>
                          {u.role === 'pending' && <option value="pending">Pending</option>}
                          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <label className="switch" title={self ? "You can't deactivate yourself" : undefined}>
                          <input type="checkbox" checked={u.active} disabled={self} onChange={(e) => update(u.id, { active: e.target.checked })} />
                          <span>{u.active ? 'Active' : 'Deactivated'}</span>
                        </label>
                      </td>
                      <td className="small">{fmtDate(u.created_at.slice(0, 10))}</td>
                      <td className="small">{fmtDateTime(u.last_seen_at)}</td>
                      <td>{!self && <button className="icon-btn" onClick={() => removeUser(u)} aria-label={`Remove ${u.email}`}><Trash2 size={16} /></button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function ActivityPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState('all');
  const [area, setArea] = useState('all');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error: err } = await supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(500);
    if (err) setError(err.message); else setRows(data as AuditRow[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const users = [...new Set(rows.map((r) => r.user_email ?? 'system'))].sort();
  const areas = [...new Set(rows.map((r) => r.collection ?? ''))].filter(Boolean).sort();
  const shown = rows.filter((r) => (user === 'all' || (r.user_email ?? 'system') === user) && (area === 'all' || r.collection === area)
    && (!q || (r.summary ?? '').toLowerCase().includes(q.toLowerCase())));
  const label = (c: string | null) => (c && c in COLLECTION_LABELS ? COLLECTION_LABELS[c as CollectionKey] : humanize(c ?? ''));
  const actionTone: Record<string, string> = { insert: 'good', update: 'info', delete: 'bad', user: 'warn', signup: 'neutral', settings: 'neutral' };

  return (
    <Card title="Recent activity" actions={<div className="row gap-sm">
      <button className="btn btn-sm" onClick={() => downloadCSV('activity-log.csv', [['When', 'User', 'Action', 'Area', 'Record', 'Details'],
        ...shown.map((r) => [r.at, r.user_email ?? 'system', r.action, label(r.collection), r.record_id ?? '', r.summary ?? ''])])}><Download size={14} /> CSV</button>
      <button className="icon-btn" onClick={load} aria-label="Refresh"><RefreshCw size={16} /></button>
    </div>}>
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search details…" />
        <Select label="User" value={user} onChange={setUser} options={[{ value: 'all', label: 'Everyone' }, ...users.map((u) => ({ value: u, label: u }))]} />
        <Select label="Area" value={area} onChange={setArea} options={[{ value: 'all', label: 'All areas' }, ...areas.map((a) => ({ value: a, label: label(a) }))]} />
      </div>
      {error && <div className="banner tone-bad">{error}</div>}
      {loading && !rows.length ? <p className="muted">Loading…</p> : shown.length === 0 ? <Empty icon={<History size={32} />} title="No activity yet" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>User</th><th>Action</th><th>Area</th><th>Details</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="small nowrap">{fmtDateTime(r.at)}</td>
                  <td className="small">{r.user_email ?? 'system'}</td>
                  <td><span className={`badge tone-${actionTone[r.action] ?? 'neutral'}`}>{r.action === 'insert' ? 'Created' : r.action === 'update' ? 'Updated' : r.action === 'delete' ? 'Deleted' : humanize(r.action)}</span></td>
                  <td className="small">{label(r.collection)}</td>
                  <td>{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted">Showing the latest 500 events.</p>
    </Card>
  );
}

function RolesPanel() {
  return (
    <Card title="What each role can do">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Area</th>{ROLES.map((r) => <th key={r.value} className="center">{r.label}</th>)}</tr>
          </thead>
          <tbody>
            <tr><td>See everything</td>{ROLES.map((r) => <td key={r.value} className="center"><Badge value="ok" label="✓" /></td>)}</tr>
            {COLLECTIONS.map((c) => (
              <tr key={c}>
                <td>Add & edit {COLLECTION_LABELS[c].toLowerCase()}</td>
                {ROLES.map((r) => <td key={r.value} className="center">{canWrite(r.value, c)
                  ? (c === 'vehicles' && !canDelete(r.value) ? <span className="small muted">Odometer only</span> : <Badge value="ok" label="✓" />)
                  : <span className="muted">—</span>}</td>)}
              </tr>
            ))}
            <tr><td>Delete records</td>{ROLES.map((r) => <td key={r.value} className="center">{canDelete(r.value) ? <Badge value="ok" label="✓" /> : <span className="muted">—</span>}</td>)}</tr>
            <tr><td>Change settings</td>{ROLES.map((r) => <td key={r.value} className="center">{canDelete(r.value) ? <Badge value="ok" label="✓" /> : <span className="muted">—</span>}</td>)}</tr>
            <tr><td>Admin panel (users, activity, data)</td>{ROLES.map((r) => <td key={r.value} className="center">{r.value === 'admin' ? <Badge value="ok" label="✓" /> : <span className="muted">—</span>}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <ul className="role-notes">
        {ROLES.map((r) => <li key={r.value}><b>{r.label}</b> – {r.summary}</li>)}
      </ul>
      <p className="small muted">These rules are enforced by the database itself, not just hidden in the app. Technicians and drivers can update a vehicle's odometer (through fuel fills, pre-start checks and meter readings), but only managers and admins add or edit vehicle details.</p>
    </Card>
  );
}
