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
      <PageHeader title="Settings" subtitle={canManage ? 'Company details, depots and checklists.' : 'Only managers and admins can change settings.'} />
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
