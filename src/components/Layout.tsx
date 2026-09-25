import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, BellRing, CalendarDays, ClipboardCheck, Fuel, Gauge, LayoutDashboard, Menu, Moon, Package, Search,
  Settings as SettingsIcon, Sun, TriangleAlert, Truck, Users, Wrench, BarChart3, CalendarClock,
  ShieldCheck, LogOut, Building2, Cloud, CloudOff, HardDrive, Loader2, FileWarning, FileSearch, BadgeCheck, CornerDownLeft, Plus, Command,
} from 'lucide-react';
import { useStore } from '../store';
import { useAuth, usePermissions } from '../auth';
import { buildAlerts } from '../lib/alerts';
import { ROLES } from '../lib/permissions';
import { complianceScore } from '../lib/compliance';
import { ncrSummary } from '../lib/ncr';

type NavItem = { to: string; label: string; icon: typeof Truck; end?: boolean; adminOnly?: boolean; count?: (d: ReturnType<typeof useStore>['data']) => number; bad?: boolean };

const NAV: { group: string; items: NavItem[] }[] = [
  { group: '', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    group: 'Operations', items: [
      { to: '/vehicles', label: 'Vehicles & assets', icon: Truck },
      { to: '/work-orders', label: 'Work orders', icon: Wrench, count: (d) => d.workOrders.filter((w) => w.status !== 'completed').length },
      { to: '/maintenance', label: 'Service schedules', icon: CalendarClock },
      { to: '/checks', label: 'Pre-start checks', icon: ClipboardCheck },
      { to: '/defects', label: 'Defects', icon: TriangleAlert, count: (d) => d.defects.filter((x) => x.status === 'open').length, bad: true },
      { to: '/parts', label: 'Parts inventory', icon: Package },
      { to: '/drivers', label: 'Drivers', icon: Users },
      { to: '/fuel', label: 'Fuel log', icon: Fuel },
    ],
  },
  {
    group: 'Compliance', items: [
      { to: '/compliance', label: 'Compliance hub', icon: BadgeCheck },
      { to: '/ncr', label: 'Non Conformances', icon: FileWarning, count: (d) => d.ncrs.filter((n) => !n.closed).length },
      { to: '/contractors', label: 'Contractors', icon: Building2 },
      { to: '/audits', label: 'Audits', icon: FileSearch, count: (d) => d.audits.filter((a) => a.status !== 'completed').length },
    ],
  },
  {
    group: 'Insights', items: [
      { to: '/reminders', label: 'Reminders', icon: BellRing, count: (d) => d.reminders.filter((r) => !r.done).length },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  {
    group: 'Workspace', items: [
      { to: '/settings', label: 'Settings', icon: SettingsIcon },
      { to: '/admin', label: 'Admin panel', icon: ShieldCheck, adminOnly: true },
    ],
  },
];

type Theme = 'light' | 'dark';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('torqline:theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* ignore */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function Layout({ children }: { children: ReactNode }) {
  const { data, sync } = useStore();
  const { isAdmin } = usePermissions();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [navOpen, setNavOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const location = useLocation();
  const score = useMemo(() => complianceScore(data), [data]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('torqline:theme', theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => { setNavOpen(false); window.scrollTo({ top: 0 }); }, [location.pathname]);

  // Never let a file dropped outside an upload area open in (and navigate away from) the tab.
  useEffect(() => {
    const block = (e: DragEvent) => { if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault(); };
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => { window.removeEventListener('dragover', block); window.removeEventListener('drop', block); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The NCR form and its printable report are full-screen pages without the sidebar.
  const fullScreen = /^\/ncr\/(?!closed$|reports$)[^/]+(\/report)?$/.test(location.pathname);
  if (fullScreen) return <div className="fs-root">{children}</div>;

  return (
    <div className={`shell ${navOpen ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Gauge size={20} /></span>
          <div>
            <strong>Torqline</strong>
            <small>{data.settings.companyName}</small>
          </div>
        </div>
        <nav>
          {NAV.map((g) => {
            const items = g.items.filter((n) => !n.adminOnly || isAdmin);
            if (!items.length) return null;
            return (
              <div key={g.group || 'main'} className="nav-group">
                {g.group && <div className="nav-group-label">{g.group}</div>}
                {items.map(({ to, label, icon: Icon, end, count, bad }) => {
                  const n = count?.(data) ?? 0;
                  return (
                    <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                      <Icon size={18} />
                      <span>{label}</span>
                      {to === '/compliance' && <span className={`nav-score grade-${score.grade}`}>{score.score}</span>}
                      {n > 0 && <span className={`nav-count ${bad ? 'bad' : ''}`}>{n}</span>}
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <UserBox />
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn only-mobile" onClick={() => setNavOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <button className="search-trigger" onClick={() => setPalette(true)}>
            <Search size={16} /><span>Search or jump to…</span><kbd><Command size={11} />K</kbd>
          </button>
          <div className="row gap-sm">
            <SyncBadge sync={sync} />
            <AlertsBell />
            <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode" title="Toggle dark mode">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>
        <main className="content" key={location.pathname}>
          {sync.error && sync.status === 'ready' && <div className="banner tone-bad">Last change was not saved: {sync.error}</div>}
          {sync.mode === 'cloud' && isAdmin && data.vehicles.length === 0 && location.pathname === '/' && (
            <div className="banner tone-info">Your shared workspace is empty. Add your first vehicle, or go to <NavLink className="link" to="/admin">Admin panel → Data</NavLink> to load demo data.</div>
          )}
          {children}
        </main>
      </div>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  );
}

interface PaletteItem { key: string; group: string; label: string; hint?: string; to: string; icon: ReactNode }

function CommandPalette({ onClose }: { onClose: () => void }) {
  const { data } = useStore();
  const perm = usePermissions();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const items = useMemo<PaletteItem[]>(() => {
    const s = q.trim().toLowerCase();
    const actions: PaletteItem[] = [
      perm.canWrite('workOrders') && { key: 'a-wo', group: 'Actions', label: 'New work order', to: '/work-orders/new', icon: <Plus size={15} /> },
      perm.canWrite('checks') && { key: 'a-check', group: 'Actions', label: 'Start a pre-start check', to: '/checks/new', icon: <Plus size={15} /> },
      perm.canWrite('defects') && { key: 'a-def', group: 'Actions', label: 'Report a defect', to: '/defects/new', icon: <Plus size={15} /> },
      perm.canWrite('ncrs') && { key: 'a-ncr', group: 'Actions', label: 'Raise an NCR', to: '/ncr/new', icon: <Plus size={15} /> },
      perm.canWrite('audits') && { key: 'a-aud', group: 'Actions', label: 'Schedule an audit', to: '/audits/new', icon: <Plus size={15} /> },
      perm.canWrite('fuel') && { key: 'a-fuel', group: 'Actions', label: 'Add a fuel fill', to: '/fuel?add=1', icon: <Plus size={15} /> },
      perm.canManage && { key: 'a-veh', group: 'Actions', label: 'Add a vehicle', to: '/vehicles/new', icon: <Plus size={15} /> },
    ].filter(Boolean) as PaletteItem[];
    const pages: PaletteItem[] = NAV.flatMap((g) => g.items.filter((n) => !n.adminOnly || perm.isAdmin).map((n) => ({ key: `p-${n.to}`, group: 'Pages', label: n.label, to: n.to, icon: <n.icon size={15} /> })));
    const hit = (...f: (string | number | undefined)[]) => !s || f.some((x) => String(x ?? '').toLowerCase().includes(s));
    const records: PaletteItem[] = s.length < 2 ? [] : [
      ...data.vehicles.filter((v) => hit(v.rego, v.name, v.make, v.model, v.vin)).map((v) => ({ key: v.id, group: 'Vehicles', label: `${v.rego} · ${v.name}`, hint: `${v.make} ${v.model}`, to: `/vehicles/${v.id}`, icon: <Truck size={15} /> })),
      ...data.workOrders.filter((w) => hit(w.number, w.title, w.assignee)).map((w) => ({ key: w.id, group: 'Work orders', label: `#${w.number} ${w.title}`, hint: w.status, to: `/work-orders/${w.id}`, icon: <Wrench size={15} /> })),
      ...data.ncrs.filter((n) => hit(`ncr-${n.number}`, n.number, n.problem, n.ncrType, n.schemeType)).map((n) => ({ key: n.id, group: 'NCRs', label: `NCR-${n.number} ${ncrSummary(n, 60)}`, hint: n.closed ? 'closed' : 'open', to: `/ncr/${n.id}`, icon: <FileWarning size={15} /> })),
      ...data.audits.filter((a) => hit(`aud-${a.number}`, a.title, a.type)).map((a) => ({ key: a.id, group: 'Audits', label: `AUD-${a.number} ${a.title}`, hint: a.status, to: `/audits/${a.id}`, icon: <FileSearch size={15} /> })),
      ...data.drivers.filter((d) => hit(d.name, d.email, d.phone)).map((d) => ({ key: d.id, group: 'Drivers', label: d.name, hint: d.depot, to: `/drivers/${d.id}`, icon: <Users size={15} /> })),
      ...data.parts.filter((p) => hit(p.sku, p.name, p.supplier)).map((p) => ({ key: p.id, group: 'Parts', label: p.name, hint: `${p.sku} · ${p.qty} in stock`, to: `/parts/${p.id}`, icon: <Package size={15} /> })),
      ...data.defects.filter((d) => hit(d.item, d.description)).map((d) => ({ key: d.id, group: 'Defects', label: d.item, hint: d.description, to: `/defects/${d.id}`, icon: <TriangleAlert size={15} /> })),
    ].slice(0, 25);
    return [...records, ...actions.filter((a) => hit(a.label)), ...pages.filter((p) => hit(p.label))];
  }, [q, data, perm]);

  useEffect(() => setSel(0), [q]);
  const go = (it?: PaletteItem) => { if (it) { navigate(it.to); onClose(); } };
  let lastGroup = '';

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <div className="palette-input">
          <Search size={18} />
          <input ref={inputRef} value={q} placeholder="Search vehicles, jobs, NCRs, drivers… or type an action" onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              if (e.key === 'Enter') go(items[sel]);
            }} />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list">
          {items.length === 0 && <div className="palette-empty muted">No matches for “{q}”</div>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? <div className="palette-group">{it.group}</div> : null;
            lastGroup = it.group;
            return (
              <div key={it.group + it.key}>
                {header}
                <button className={`palette-item ${i === sel ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => go(it)}>
                  <span className="palette-icon">{it.icon}</span>
                  <span className="grow">{it.label}{it.hint && <span className="small muted"> · {it.hint}</span>}</span>
                  {i === sel && <CornerDownLeft size={14} className="muted" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOut();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOut]);
}

export function AlertsBell() {
  const { data } = useStore();
  const alerts = useMemo(() => buildAlerts(data), [data]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useClickOutside(ref, () => setOpen(false));
  const urgent = alerts.filter((a) => a.level === 'bad').length;

  return (
    <div className="bell" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen(!open)} aria-label={`${alerts.length} alerts`}>
        <Bell size={18} />
        {alerts.length > 0 && <span className={`bell-count ${urgent ? 'bad' : ''}`}>{alerts.length}</span>}
      </button>
      {open && (
        <div className="popover popover-right">
          <div className="popover-title">Needs attention</div>
          {alerts.length === 0 && <div className="popover-empty muted">All clear 🎉</div>}
          {alerts.slice(0, 14).map((a) => (
            <button key={a.id} className="popover-item" onClick={() => { navigate(a.to); setOpen(false); }}>
              <span className={`small tone-text-${a.level}`}>{a.kind}</span>
              <span>{a.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SyncBadge({ sync }: { sync: ReturnType<typeof useStore>['sync'] }) {
  if (sync.mode === 'local') {
    return <span className="sync-badge" title="Data is stored in this browser only"><HardDrive size={14} /> <span className="hide-sm">Local</span></span>;
  }
  if (sync.saving) return <span className="sync-badge tone-info"><Loader2 size={14} className="spin" /> <span className="hide-sm">Saving…</span></span>;
  if (sync.error) return <span className="sync-badge tone-bad" title={sync.error}><CloudOff size={14} /> <span className="hide-sm">Not saved</span></span>;
  return <span className="sync-badge tone-good" title="Changes save and sync live"><span className="live-dot" /><Cloud size={14} /> <span className="hide-sm">Live</span></span>;
}

function UserBox() {
  const { mode, profile, session, signOut, role } = useAuth();
  if (mode === 'local') return <div className="sidebar-foot muted">Local mode – data is stored in this browser.</div>;
  const name = profile?.full_name || session?.user.email || '';
  return (
    <div className="sidebar-foot user-box">
      <span className="avatar sm">{name.split(/[\s@.]/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase()}</span>
      <div className="user-meta">
        <strong title={name}>{name}</strong>
        <small className="muted">{ROLES.find((r) => r.value === role)?.label ?? role}</small>
      </div>
      <button className="icon-btn" onClick={() => signOut()} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
    </div>
  );
}
