import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import { Card, Field, PageHeader } from '../components/ui';
import { DataTools } from '../components/DataTools';

export default function Settings() {
  const { data, updateSettings } = useStore();
  const s = data.settings;
  const [newDepot, setNewDepot] = useState('');
  const [newItem, setNewItem] = useState('');
  const { canManage, isAdmin } = usePermissions();

  return (
    <>
      <PageHeader title="Settings" subtitle={canManage ? 'Company details, depots, checklists and NCR lists.' : 'Only managers and admins can change settings.'} />
      <fieldset className="plain" disabled={!canManage}>
      <div className="grid-2">
        <Card title="Company">
          <div className="form-grid">
            <Field label="Company name" span><input className="input" value={s.companyName} onChange={(e) => updateSettings({ companyName: e.target.value })} /></Field>
            <Field label="Currency">
              <select className="input" value={s.currency} onChange={(e) => updateSettings({ currency: e.target.value })}>
                {['USD', 'AUD', 'NZD', 'GBP', 'EUR', 'CAD', 'INR', 'ZAR', 'AED', 'SGD'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Default labour rate / hour"><input className="input" type="number" min={0} value={s.labourRate} onChange={(e) => updateSettings({ labourRate: Number(e.target.value) })} /></Field>
          </div>
        </Card>

        <Card title="Depots">
          <ul className="edit-list">
            {s.depots.map((d) => (
              <li key={d}><span>{d}</span>
                <button className="icon-btn" aria-label={`Remove ${d}`} disabled={data.vehicles.some((v) => v.depot === d)}
                  title={data.vehicles.some((v) => v.depot === d) ? 'Depot has vehicles' : 'Remove'}
                  onClick={() => updateSettings({ depots: s.depots.filter((x) => x !== d) })}><X size={14} /></button>
              </li>
            ))}
          </ul>
          <form className="row gap-sm" onSubmit={(e) => { e.preventDefault(); const v = newDepot.trim(); if (v && !s.depots.includes(v)) updateSettings({ depots: [...s.depots, v] }); setNewDepot(''); }}>
            <input className="input" placeholder="New depot" value={newDepot} onChange={(e) => setNewDepot(e.target.value)} />
            <button className="btn"><Plus size={16} /> Add</button>
          </form>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Pre-start checklist">
          <p className="small muted">These items appear on every new pre-start check.</p>
          <ul className="edit-list">
            {s.checklist.map((item, i) => (
              <li key={item}><span>{i + 1}. {item}</span>
                <button className="icon-btn" aria-label={`Remove ${item}`} onClick={() => updateSettings({ checklist: s.checklist.filter((x) => x !== item) })}><X size={14} /></button>
              </li>
            ))}
          </ul>
          <form className="row gap-sm" onSubmit={(e) => { e.preventDefault(); const v = newItem.trim(); if (v && !s.checklist.includes(v)) updateSettings({ checklist: [...s.checklist, v] }); setNewItem(''); }}>
            <input className="input" placeholder="New checklist item" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
            <button className="btn"><Plus size={16} /> Add</button>
          </form>
        </Card>

        <NcrLookups />

        {isAdmin && (
          <Card title="Your data" actions={<Link className="link small" to="/admin">Open admin panel</Link>}>
            <DataTools />
          </Card>
        )}
      </div>
      </fieldset>
    </>
  );
}

type LookupKey = 'ncrSchemes' | 'ncrCategories' | 'ncrTypes';
const LOOKUPS: { key: LookupKey; label: string; field: 'schemeType' | 'category' | 'ncrType' }[] = [
  { key: 'ncrSchemes', label: 'Schemes', field: 'schemeType' },
  { key: 'ncrCategories', label: 'Categories', field: 'category' },
  { key: 'ncrTypes', label: 'Types', field: 'ncrType' },
];

/** The Scheme / Category / Type dropdowns on NCRs. Renaming an entry also updates the NCRs that use it. */
function NcrLookups() {
  const { data, updateSettings, upsert } = useStore();
  const { canManage } = usePermissions();
  const [which, setWhich] = useState<LookupKey>('ncrSchemes');
  const [adding, setAdding] = useState('');
  const [editing, setEditing] = useState<{ from: string; to: string } | null>(null);
  const meta = LOOKUPS.find((l) => l.key === which)!;
  const list = data.settings[which];
  const used = (v: string) => data.ncrs.filter((n) => n[meta.field] === v).length;
  const rename = () => {
    if (!editing) return;
    const to = editing.to.trim();
    if (to && to !== editing.from && !list.includes(to)) {
      updateSettings({ [which]: list.map((x) => (x === editing.from ? to : x)) });
      data.ncrs.filter((n) => n[meta.field] === editing.from).forEach((n) => upsert('ncrs', { ...n, [meta.field]: to }));
    }
    setEditing(null);
  };
  return (
    <Card title="NCR lists" actions={<div className="segmented small">{LOOKUPS.map((l) => <button key={l.key} type="button" className={which === l.key ? 'on' : ''} onClick={() => { setWhich(l.key); setEditing(null); }}>{l.label}</button>)}</div>}>
      <p className="small muted">Options for the {meta.label.toLowerCase().replace(/s$/, '')} dropdown on non conformances. Click a name to rename it everywhere.</p>
      <ul className="edit-list scroll-list">
        {list.map((item) => (
          <li key={item}>
            {editing?.from === item ? (
              <input className="input input-sm grow" autoFocus value={editing.to} onChange={(e) => setEditing({ ...editing, to: e.target.value })}
                onBlur={rename} onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setEditing(null); }} />
            ) : (
              <button type="button" className="link-btn grow left" disabled={!canManage} onClick={() => setEditing({ from: item, to: item })}>{item}</button>
            )}
            {used(item) > 0 && <span className="small muted">{used(item)} NCR{used(item) === 1 ? '' : 's'}</span>}
            <button className="icon-btn" aria-label={`Remove ${item}`} disabled={used(item) > 0} title={used(item) ? 'In use on NCRs – rename it instead' : 'Remove'}
              onClick={() => updateSettings({ [which]: list.filter((x) => x !== item) })}><X size={14} /></button>
          </li>
        ))}
      </ul>
      <form className="row gap-sm" onSubmit={(e) => { e.preventDefault(); const v = adding.trim(); if (v && !list.includes(v)) updateSettings({ [which]: [...list, v] }); setAdding(''); }}>
        <input className="input" placeholder={`New ${meta.label.toLowerCase().replace(/s$/, '')}`} value={adding} onChange={(e) => setAdding(e.target.value)} />
        <button className="btn"><Plus size={16} /> Add</button>
      </form>
    </Card>
  );
}
