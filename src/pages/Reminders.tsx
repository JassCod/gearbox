import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Check, Repeat } from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import { Badge, Card, Empty, PageHeader } from '../components/ui';
import { ENTITIES, entityLink, entityTitle } from '../lib/entities';
import { daysUntil, fmtDate, relDays } from '../lib/utils';

export default function Reminders() {
  const { data, completeReminder } = useStore();
  const perm = usePermissions();
  const [show, setShow] = useState<'open' | 'done'>('open');
  const list = useMemo(() => data.reminders.filter((r) => (show === 'open' ? !r.done : r.done))
    .sort((a, b) => (show === 'open' ? a.dueDate.localeCompare(b.dueDate) : (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))), [data.reminders, show]);
  const groups: [string, typeof list][] = show === 'open' ? [
    ['Overdue', list.filter((r) => daysUntil(r.dueDate) < 0)],
    ['This week', list.filter((r) => daysUntil(r.dueDate) >= 0 && daysUntil(r.dueDate) <= 7)],
    ['Later', list.filter((r) => daysUntil(r.dueDate) > 7)],
  ] : [['Completed', list]];

  return (
    <>
      <PageHeader title="Reminders" subtitle="Everything you asked Torqline to remember, across every vehicle, driver, part and NCR. Add new ones from any item's Reminders tab." />
      <div className="segmented tabs">
        <button className={show === 'open' ? 'on' : ''} onClick={() => setShow('open')}>Open ({data.reminders.filter((r) => !r.done).length})</button>
        <button className={show === 'done' ? 'on' : ''} onClick={() => setShow('done')}>Completed</button>
      </div>
      {list.length === 0 ? <Card><Empty icon={<BellRing size={32} />} title="Nothing to remind you about" /></Card> : groups.filter(([, g]) => g.length).map(([title, g]) => (
        <Card key={title} title={`${title} · ${g.length}`}>
          <ul className="reminder-list">
            {g.map((r) => (
              <li key={r.id} className={!r.done && daysUntil(r.dueDate) < 0 ? 'overdue' : ''}>
                {r.done ? <span className="tick on"><Check size={14} /></span>
                  : <button className="tick" disabled={!perm.canWrite('reminders')} onClick={() => completeReminder(r.id)} aria-label={`Complete ${r.title}`}><Check size={14} /></button>}
                <div className="grow">
                  <strong>{r.title}</strong>
                  <div className="small muted">
                    <Link className="link" to={`${entityLink(r.entityType, r.entityId)}?tab=reminders`}>{ENTITIES[r.entityType].singular}: {entityTitle(data, r.entityType, r.entityId)}</Link>
                    {' · '}{r.done ? `done ${fmtDate(r.doneAt)}` : `${daysUntil(r.dueDate) < 0 ? 'overdue ' + relDays(r.dueDate).replace(' ago', '') : 'due ' + relDays(r.dueDate)} (${fmtDate(r.dueDate)})`}
                    {r.assignee && ` · ${r.assignee}`}{r.repeat !== 'none' && <> · <Repeat size={11} /> {r.repeat}</>}
                  </div>
                </div>
                <Badge value={r.priority} />
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}
