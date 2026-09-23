import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '../store';
import { Card, PageHeader } from '../components/ui';
import { byId, serviceDue, toISO, todayISO } from '../lib/utils';

interface CalEvent {
  id: string;
  date: string;
  label: string;
  kind: 'wo' | 'service' | 'compliance' | 'driver';
  to: string;
}

const KIND_LABEL = { wo: 'Work order', service: 'Service due', compliance: 'Vehicle expiry', driver: 'Driver expiry' };

export default function Calendar() {
  const { data } = useStore();
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [kinds, setKinds] = useState<Record<CalEvent['kind'], boolean>>({ wo: true, service: true, compliance: true, driver: true });

  const events = useMemo(() => {
    const out: CalEvent[] = [];
    for (const w of data.workOrders) {
      if (w.status === 'completed') continue;
      out.push({ id: `wo-${w.id}`, date: w.dueDate, kind: 'wo', label: `#${w.number} ${byId(data.vehicles, w.vehicleId)?.rego ?? ''} ${w.title}`, to: `/work-orders?open=${w.id}` });
    }
    for (const s of data.schedules) {
      const v = byId(data.vehicles, s.vehicleId);
      const due = serviceDue(s, v);
      if (due.nextDate) out.push({ id: `sv-${s.id}`, date: due.nextDate, kind: 'service', label: `${v?.rego ?? ''} ${s.name}`, to: '/maintenance' });
    }
    for (const v of data.vehicles) {
      out.push({ id: `rg-${v.id}`, date: v.regoExpiry, kind: 'compliance', label: `${v.rego} registration`, to: `/vehicles/${v.id}` });
      out.push({ id: `in-${v.id}`, date: v.insuranceExpiry, kind: 'compliance', label: `${v.rego} insurance`, to: `/vehicles/${v.id}` });
    }
    for (const d of data.drivers) {
      out.push({ id: `lc-${d.id}`, date: d.licenceExpiry, kind: 'driver', label: `${d.name} licence`, to: '/drivers' });
      out.push({ id: `md-${d.id}`, date: d.medicalExpiry, kind: 'driver', label: `${d.name} medical`, to: '/drivers' });
      d.trainings.forEach((t, i) => out.push({ id: `tr-${d.id}-${i}`, date: t.expiry, kind: 'driver', label: `${d.name} ${t.name}`, to: '/drivers' }));
    }
    return out.filter((e) => kinds[e.kind]);
  }, [data, kinds]);

  const byDate = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    events.forEach((e) => m.set(e.date, [...(m.get(e.date) ?? []), e]));
    return m;
  }, [events]);

  // Monday-first grid covering the whole month.
  const first = new Date(cursor);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const today = todayISO();
  const move = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));

  return (
    <>
      <PageHeader title="Calendar" subtitle="Work orders, services and expiries in one place."
        actions={<div className="row gap-sm">
          <button className="icon-btn" onClick={() => move(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
          <strong className="month-label">{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
          <button className="icon-btn" onClick={() => move(1)} aria-label="Next month"><ChevronRight size={18} /></button>
          <button className="btn btn-sm" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</button>
        </div>} />
      <div className="toolbar">
        {(Object.keys(KIND_LABEL) as CalEvent['kind'][]).map((k) => (
          <label key={k} className="check"><input type="checkbox" checked={kinds[k]} onChange={(e) => setKinds({ ...kinds, [k]: e.target.checked })} />
            <span className={`ev-dot ev-${k}`} /> {KIND_LABEL[k]}</label>
        ))}
      </div>
      <Card className="calendar-card">
        <div className="calendar">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="cal-head">{d}</div>)}
          {days.map((d) => {
            const iso = toISO(d);
            const evs = byDate.get(iso) ?? [];
            return (
              <div key={iso} className={`cal-day ${d.getMonth() !== cursor.getMonth() ? 'other' : ''} ${iso === today ? 'today' : ''}`}>
                <span className="cal-num">{d.getDate()}</span>
                {evs.slice(0, 3).map((e) => (
                  <Link key={e.id} to={e.to} className={`cal-ev ev-${e.kind}`} title={`${KIND_LABEL[e.kind]}: ${e.label}`}>{e.label}</Link>
                ))}
                {evs.length > 3 && <span className="small muted">+{evs.length - 3} more</span>}
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
