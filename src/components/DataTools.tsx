import { useRef, useState } from 'react';
import { Download, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useStore } from '../store';
import type { AppData } from '../types';
import { confirmAction } from './ui';
import { downloadBlob, todayISO } from '../lib/utils';
import { COLLECTIONS } from '../lib/cloudSync';

export function DataTools() {
  const { data, replaceAll, resetDemo, clearAll, sync } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const where = sync.mode === 'cloud' ? 'the shared workspace – everyone will see the change' : 'this browser';

  const exportJSON = () => downloadBlob(`torqline-backup-${todayISO()}.json`, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));

  const importJSON = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as AppData;
      if (!COLLECTIONS.every((k) => Array.isArray(parsed[k])) || !parsed.settings) throw new Error('Missing sections');
      if (confirmAction(`Replace all data in ${where} with this backup?`)) {
        replaceAll(parsed);
        setMsg('Backup restored.');
      }
    } catch {
      setMsg('That file is not a valid Torqline backup.');
    }
  };

  return (
    <>
      <p className="small muted">
        {sync.mode === 'cloud'
          ? 'Data is stored in your shared Supabase database. Download a backup any time to keep your own copy.'
          : 'Everything is saved in this browser. Download a backup to move it to another device or keep it safe.'}
      </p>
      <div className="row gap-sm wrap">
        <button className="btn" onClick={exportJSON}><Download size={16} /> Download backup</button>
        <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={16} /> Restore backup</button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJSON(f); e.target.value = ''; }} />
      </div>
      <hr />
      <div className="row gap-sm wrap">
        <button className="btn" onClick={() => confirmAction(`Replace everything in ${where} with the demo data?`) && (resetDemo(), setMsg('Demo data loaded.'))}><RotateCcw size={16} /> Load demo data</button>
        <button className="btn btn-danger-ghost" onClick={() => confirmAction(`Delete all vehicles, work orders and records in ${where}? Settings are kept.`) && (clearAll(), setMsg('All records cleared.'))}><Trash2 size={16} /> Start fresh</button>
      </div>
      {msg && <p className="small tone-text-good">{msg}</p>}
    </>
  );
}
