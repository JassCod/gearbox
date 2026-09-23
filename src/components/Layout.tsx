import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, CalendarDays, ClipboardCheck, Fuel, Gauge, LayoutDashboard, Menu, Moon, Package, Search,
  Settings as SettingsIcon, Sun, TriangleAlert, Truck, Users, Wrench, BarChart3, CalendarClock,
} from 'lucide-react';
import { useStore } from '../store';
import { buildAlerts } from '../lib/alerts';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/vehicles', label: 'Vehicles & assets', icon: Truck },
  { to: '/maintenance', label: 'Service schedules', icon: CalendarClock },
  { to: '/work-orders', label: 'Work orders', icon: Wrench },
  { to: '/checks', label: 'Pre-start checks', icon: ClipboardCheck },
  { to: '/defects', label: 'Defects', icon: TriangleAlert },
  { to: '/parts', label: 'Parts inventory', icon: Package },
  { to: '/drivers', label: 'Drivers', icon: Users },
  { to: '/fuel', label: 'Fuel log', icon: Fuel },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
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
  const { data } = useStore();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('torqline:theme', theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => setNavOpen(false), [location.pathname]);

  const openDefects = data.defects.filter((d) => d.status === 'open').length;
  const activeWOs = data.workOrders.filter((w) => w.status !== 'completed').length;

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
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon size={18} />
              <span>{label}</span>
              {to === '/defects' && openDefects > 0 && <span className="nav-count bad">{openDefects}</span>}
              {to === '/work-orders' && activeWOs > 0 && <span className="nav-count">{activeWOs}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot muted">Data is stored in this browser.</div>
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn only-mobile" onClick={() => setNavOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <GlobalSearch />
          <div className="row gap-sm">
            <AlertsBell />
            <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle dark mode" title="Toggle dark mode">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
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

function GlobalSearch() {
  const { data } = useStore();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  useClickOutside(ref, () => setOpen(false));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const hit = (...fields: (string | number | undefined)[]) => fields.some((f) => String(f ?? '').toLowerCase().includes(s));
    return [
      ...data.vehicles.filter((v) => hit(v.rego, v.name, v.make, v.model, v.vin))
        .map((v) => ({ key: v.id, group: 'Vehicle', label: `${v.rego} · ${v.name}`, to: `/vehicles/${v.id}` })),
      ...data.workOrders.filter((w) => hit(w.number, w.title, w.assignee))
        .map((w) => ({ key: w.id, group: 'Work order', label: `#${w.number} ${w.title}`, to: `/work-orders?open=${w.id}` })),
      ...data.parts.filter((p) => hit(p.sku, p.name, p.supplier))
        .map((p) => ({ key: p.id, group: 'Part', label: `${p.sku} · ${p.name}`, to: `/parts?q=${encodeURIComponent(p.sku)}` })),
      ...data.drivers.filter((d) => hit(d.name, d.email, d.phone))
        .map((d) => ({ key: d.id, group: 'Driver', label: d.name, to: `/drivers?q=${encodeURIComponent(d.name)}` })),
    ].slice(0, 10);
  }, [q, data]);

  const go = (to: string) => { navigate(to); setQ(''); setOpen(false); };

  return (
    <div className="global-search" ref={ref}>
      <Search size={16} className="global-search-icon" />
      <input ref={inputRef} className="input" placeholder="Search vehicles, work orders, parts, drivers…  (Ctrl K)"
        value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === 'Enter' && results[0] && go(results[0].to)} />
      {open && q.trim().length >= 2 && (
        <div className="popover">
          {results.length === 0 && <div className="popover-empty muted">No matches</div>}
          {results.map((r) => (
            <button key={r.group + r.key} className="popover-item" onClick={() => go(r.to)}>
              <span className="muted small">{r.group}</span>
              <span>{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertsBell() {
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
          {alerts.slice(0, 12).map((a) => (
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
