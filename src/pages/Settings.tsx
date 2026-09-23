import { useRef, useState } from 'react';
import { Download, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { useStore } from '../store';
import type { AppData } from '../types';
import { Card, Field, PageHeader, confirmAction } from '../components/ui';
import { downloadBlob, todayISO } from '../lib/utils';

export default function Settings() {
  const { data, updateSettings, replaceAll, resetDemo, clearAll } = useStore();
  const s = data.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [newDepot, setNewDepot] = useState('');
  const [newItem, setNewItem] = useState('');
  const [msg, setMsg] = useState('');

  const exportJSON = () => downloadBlob(`torqline-backup-${todayISO()}.json`, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));

  const importJSON = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as AppData;
      const keys: (keyof AppData)[] = ['vehicles', 'schedules', 'workOrders', 'defects', 'checks', 'parts', 'drivers', 'fuel'];
      if (!keys.every((k) => Array.isArray(parsed[k])) || !parsed.settings) throw new Error('Missing sections');
      if (confirmAction('Replace all current data with this backup?')) {
        replaceAll(parsed);
        setMsg('Backup restored.');
      }
    } catch {
      setMsg('That file is not a valid Torqline backup.');
    }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Company details, checklists and your data." />
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

        <Card title="Your data">
          <p className="small muted">Everything is saved in this browser. Download a backup to move it to another device or keep it safe.</p>
          <div className="row gap-sm wrap">
            <button className="btn" onClick={exportJSON}><Download size={16} /> Download backup</button>
            <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={16} /> Restore backup</button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJSON(f); e.target.value = ''; }} />
          </div>
          <hr />
          <div className="row gap-sm wrap">
            <button className="btn" onClick={() => confirmAction('Replace everything with the demo data?') && (resetDemo(), setMsg('Demo data loaded.'))}><RotateCcw size={16} /> Load demo data</button>
            <button className="btn btn-danger-ghost" onClick={() => confirmAction('Delete all vehicles, work orders and records? Settings are kept.') && (clearAll(), setMsg('All records cleared.'))}><Trash2 size={16} /> Start fresh</button>
          </div>
          {msg && <p className="small tone-text-good">{msg}</p>}
        </Card>
      </div>
    </>
  );
}
