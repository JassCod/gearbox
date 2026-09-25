import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import { useStore } from '../store';
import { usePermissions } from '../auth';
import type { Contractor } from '../types';
import { Field, PageHeader } from '../components/ui';
import { EditCard } from '../components/ItemPage';
import { DataTable } from '../components/DataTable';
import { ConfirmModal } from '../components/forms';
import { uid } from '../lib/utils';

const blank = (): Contractor => ({ id: uid(), name: '', active: true });

/** Contractors register – used by NCRs (and anything else that involves outside operators). */
export default function Contractors() {
  const { data, upsert, remove } = useStore();
  const perm = usePermissions();
  const [draft, setDraft] = useState<Contractor | null>(null);
  const [deleting, setDeleting] = useState<Contractor | null>(null);
  const canEdit = perm.canWrite('contractors');
  const ncrCount = (c: Contractor) => data.ncrs.filter((n) => n.contractorId === c.id).length;
  const openNcrs = (c: Contractor) => data.ncrs.filter((n) => n.contractorId === c.id && !n.closed).length;
  const set = <K extends keyof Contractor>(k: K, v: Contractor[K]) => setDraft((p) => (p ? { ...p, [k]: v } : p));
  const isNew = draft ? !data.contractors.some((c) => c.id === draft.id) : false;

  return (
    <>
      <PageHeader title="Contractors" subtitle="Outside operators and suppliers you work with. Pick them on NCRs to track their non-conformances."
        actions={canEdit && !draft && <button className="btn btn-primary" onClick={() => setDraft(blank())}><Plus size={16} /> Add contractor</button>} />
      {draft && (
        <EditCard title={isNew ? 'New contractor' : `Edit ${draft.name}`} submitLabel={isNew ? 'Add contractor' : 'Save changes'} onCancel={() => setDraft(null)}
          onSubmit={() => { if (!draft.name.trim()) return; upsert('contractors', { ...draft, name: draft.name.trim() }); setDraft(null); }}>
          <Field label="Name"><input className="input" required autoFocus value={draft.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="ABN"><input className="input" value={draft.abn ?? ''} onChange={(e) => set('abn', e.target.value || undefined)} /></Field>
          <Field label="Contact person"><input className="input" value={draft.contact ?? ''} onChange={(e) => set('contact', e.target.value || undefined)} /></Field>
          <Field label="Phone"><input className="input" value={draft.phone ?? ''} onChange={(e) => set('phone', e.target.value || undefined)} /></Field>
          <Field label="Email"><input className="input" type="email" value={draft.email ?? ''} onChange={(e) => set('email', e.target.value || undefined)} /></Field>
          <Field label="Status">
            <select className="input" value={draft.active ? 'active' : 'inactive'} onChange={(e) => set('active', e.target.value === 'active')}>
              <option value="active">Active</option><option value="inactive">Inactive (hidden from pickers)</option>
            </select>
          </Field>
          <Field label="Notes" span><textarea className="input" rows={2} value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value || undefined)} /></Field>
          {!isNew && perm.canDelete && <div className="span-2"><button type="button" className="btn btn-danger-outline" onClick={() => setDeleting(draft)}>Delete contractor</button></div>}
        </EditCard>
      )}
      <div className="card">
        <DataTable
          title="Contractors" exportName="contractors" rows={data.contractors} defaultSort={{ key: 'name', dir: 'asc' }}
          onRowClick={canEdit ? (c) => setDraft(c) : undefined}
          empty={<span className="row gap-sm"><Building2 size={16} /> No contractors yet</span>}
          columns={[
            { key: 'name', label: 'Name', value: (c) => c.name, render: (c) => <b>{c.name}</b> },
            { key: 'abn', label: 'ABN', value: (c) => c.abn ?? '' },
            { key: 'contact', label: 'Contact', value: (c) => c.contact ?? '' },
            { key: 'phone', label: 'Phone', value: (c) => c.phone ?? '' },
            { key: 'email', label: 'Email', value: (c) => c.email ?? '' },
            { key: 'ncrs', label: 'NCRs', value: (c) => ncrCount(c), render: (c) => <>{ncrCount(c)}{openNcrs(c) > 0 && <span className="badge tone-warn ml">{openNcrs(c)} open</span>}</> },
            { key: 'status', label: 'Status', value: (c) => (c.active ? 'Active' : 'Inactive'), render: (c) => <span className={`badge ${c.active ? 'tone-good' : 'tone-neutral'}`}>{c.active ? 'Active' : 'Inactive'}</span> },
          ]}
        />
      </div>
      {deleting && (
        <ConfirmModal title={`Delete ${deleting.name}?`} onCancel={() => setDeleting(null)}
          onConfirm={() => { remove('contractors', deleting.id); setDeleting(null); setDraft(null); }}>
          <p>{ncrCount(deleting) ? `${ncrCount(deleting)} NCR(s) name this contractor – they'll keep the NCR but lose the contractor link. Consider marking it inactive instead.` : 'This contractor will be removed.'}</p>
        </ConfirmModal>
      )}
    </>
  );
}
