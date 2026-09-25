import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  ActivityEvent, AppData, Attachment, CollectionKey, Defect, EntityType, Note, PrestartCheck, Reminder, Settings, WorkOrder,
} from './types';
import { createSeed } from './data/seed';
import { addDays, todayISO, uid } from './lib/utils';
import { supabase } from './lib/supabase';
import { useAuth } from './auth';
import { applyRemote, COLLECTIONS, diff, emptyData, isEmptyDiff, loadAll, pushDiff, stableStringify } from './lib/cloudSync';
import { describeChanges, ENTITY_BY_COLLECTION } from './lib/entities';
import { migrateNcr } from './lib/ncr';

const STORAGE_KEY = 'torqline:data:v1';
/** Files larger than this can't be kept in the browser's local storage. */
export const LOCAL_FILE_LIMIT = 1024 * 1024;
const ACTIVITY_CAP = 3000;

type Item<K extends CollectionKey> = AppData[K][number];

interface Store {
  data: AppData;
  upsert<K extends CollectionKey>(key: K, item: Item<K>): void;
  remove(key: CollectionKey, id: string): void;
  updateSettings(patch: Partial<Settings>): void;
  submitCheck(check: Omit<PrestartCheck, 'id' | 'passed'>): PrestartCheck;
  createWorkOrderFromDefect(defect: Defect): WorkOrder;
  setWorkOrderStatus(id: string, status: WorkOrder['status']): void;
  nextNumber(key: 'workOrders' | 'ncrs' | 'audits'): number;
  nextWorkOrderNumber(): number;
  addNote(entityType: EntityType, entityId: string, text: string): void;
  saveReminder(reminder: Reminder): void;
  completeReminder(id: string): void;
  addAttachment(entityType: EntityType, entityId: string, file: File, meta: { category: string; expiry?: string; notes?: string }): Promise<Attachment>;
  removeAttachment(att: Attachment): Promise<void>;
  attachmentUrl(att: Attachment): Promise<string | null>;
  actor: string;
  replaceAll(data: AppData): void;
  resetDemo(): void;
  clearAll(): void;
  sync: SyncState;
  reload(): Promise<void>;
}

export interface SyncState {
  mode: 'local' | 'cloud';
  status: 'loading' | 'ready' | 'error';
  saving: boolean;
  error: string | null;
}

const Ctx = createContext<Store | null>(null);

/** Fill in collections that older saves or backups don't have yet. */
export function normalize(input: Partial<AppData>): AppData {
  const base = createSeed();
  const out = { ...emptyData(base.settings), ...input } as AppData;
  for (const c of COLLECTIONS) if (!Array.isArray(out[c])) (out[c] as unknown[]) = [];
  out.settings = { ...base.settings, ...(input.settings ?? {}) };
  // NCRs saved by the earlier screens are converted to the current format.
  if (out.ncrs.some((n) => typeof (n as { problem?: unknown }).problem !== 'string')) out.ncrs = out.ncrs.map(migrateNcr);
  return out;
}

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      if (parsed && Array.isArray(parsed.vehicles)) return normalize(parsed);
    }
  } catch {
    /* ignore corrupt or unavailable storage */
  }
  return createSeed();
}

const REPEAT_DAYS: Record<Reminder['repeat'], number> = { none: 0, weekly: 7, monthly: 30, quarterly: 91, yearly: 365 };

/**
 * Compare two snapshots and write history events for every item that was
 * created, changed or deleted – so every screen gets an audit trail for free.
 */
function withActivity(prev: AppData, next: AppData, actor: string): AppData {
  const events: ActivityEvent[] = [];
  const now = new Date().toISOString();
  const push = (e: Omit<ActivityEvent, 'id' | 'at' | 'by'>) => events.push({ ...e, id: uid(), at: now, by: actor });

  for (const c of COLLECTIONS) {
    if (prev[c] === next[c] || c === 'activity') continue;
    const before = new Map((prev[c] as { id: string }[]).map((x) => [x.id, x]));
    const meta = ENTITY_BY_COLLECTION[c];
    for (const item of next[c] as unknown as ({ id: string } & Record<string, unknown>)[]) {
      const old = before.get(item.id) as ({ id: string } & Record<string, unknown>) | undefined;
      before.delete(item.id);
      if (old === item) continue;
      if (meta) {
        if (!old) push({ entityType: meta.type, entityId: item.id, kind: 'created', text: `${meta.singular} created` });
        else {
          const change = describeChanges(old, item);
          if (change) push({ entityType: meta.type, entityId: item.id, kind: change.status ? 'status' : 'updated', text: change.text });
        }
      } else if (c === 'attachments' && !old) {
        const a = item as unknown as Attachment;
        push({ entityType: a.entityType, entityId: a.entityId, kind: 'document', text: `Document added: ${a.name} (${a.category})` });
      } else if (c === 'reminders') {
        const r = item as unknown as Reminder;
        if (!old) push({ entityType: r.entityType, entityId: r.entityId, kind: 'reminder', text: `Reminder set: ${r.title} – due ${r.dueDate}` });
        else if (r.done && !(old as unknown as Reminder).done) push({ entityType: r.entityType, entityId: r.entityId, kind: 'reminder', text: `Reminder completed: ${r.title}` });
      } else if (c === 'notes' && !old) {
        const n = item as unknown as Note;
        push({ entityType: n.entityType, entityId: n.entityId, kind: 'note', text: `Note added: “${n.text.slice(0, 80)}${n.text.length > 80 ? '…' : ''}”` });
      }
    }
    for (const old of before.values()) {
      const o = old as { id: string } & Record<string, unknown>;
      if (meta) push({ entityType: meta.type, entityId: o.id, kind: 'deleted', text: `${meta.singular} deleted` });
      else if (c === 'attachments') {
        const a = o as unknown as Attachment;
        push({ entityType: a.entityType, entityId: a.entityId, kind: 'document', text: `Document removed: ${a.name}` });
      }
    }
  }
  if (!events.length) return next;
  const activity = [...events, ...next.activity];
  return { ...next, activity: activity.length > ACTIVITY_CAP ? activity.slice(0, ACTIVITY_CAP) : activity };
}

/**
 * In local mode data lives in localStorage. In cloud mode (`cloud` = signed-in
 * member) every change is diffed against the last known server state and
 * pushed to Supabase, and other people's changes stream in over realtime.
 */
export function StoreProvider({ children, cloud = false }: { children: ReactNode; cloud?: boolean }) {
  const [data, setRawData] = useState<AppData>(() => (cloud ? emptyData(createSeed().settings) : load()));
  const [status, setStatus] = useState<SyncState['status']>(cloud ? 'loading' : 'ready');
  const [pending, setPending] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const { refreshProfile, profile, session, mode } = useAuth();
  const actor = mode === 'local' ? 'You' : profile?.full_name || session?.user.email || 'Someone';
  const actorRef = useRef(actor);
  actorRef.current = actor;

  /** Local edits: every change also records history events. Remote/bulk loads use setRawData. */
  const setData = useCallback((fn: (prev: AppData) => AppData) => {
    setRawData((prev) => {
      const next = fn(prev);
      return next === prev ? prev : withActivity(prev, next, actorRef.current);
    });
  }, []);
  /** Last state known to be on the server. */
  const synced = useRef<AppData | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  /** Canonical JSON of writes still expected to echo back over realtime, per record key. */
  const inFlight = useRef(new Map<string, string[]>());
  /** Returns true (and forgets it) when `json` is the echo of our own write. */
  const isOwnEcho = (key: string, json: string) => {
    const sent = inFlight.current.get(key);
    const idx = sent?.indexOf(json) ?? -1;
    if (!sent || idx < 0) return false;
    sent.splice(0, idx + 1);
    if (!sent.length) inFlight.current.delete(key);
    return true;
  };

  useEffect(() => {
    if (cloud) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage full or unavailable – app keeps working in memory */
    }
  }, [data, cloud]);

  const reload = useCallback(async () => {
    if (!cloud || !supabase) return;
    setStatus((st) => (st === 'ready' ? 'ready' : 'loading'));
    try {
      const { data: remote } = await loadAll(supabase, createSeed().settings);
      inFlight.current.clear();
      // The server snapshot and the screen must be the very same object, or the diff sees phantom edits.
      const snapshot = normalize(remote);
      synced.current = snapshot;
      setRawData(snapshot);
      setStatus('ready');
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Could not load data');
      setStatus('error');
    }
  }, [cloud]);

  useEffect(() => { reload(); }, [reload]);

  // Push local edits.
  useEffect(() => {
    if (!cloud || !supabase || status !== 'ready' || !synced.current) return;
    const changes = diff(synced.current, data);
    if (isEmptyDiff(changes)) return;
    synced.current = data;
    const remember = (key: string, value: unknown) =>
      inFlight.current.set(key, [...(inFlight.current.get(key) ?? []), stableStringify(value)].slice(-20));
    changes.upserts.forEach((u) => remember(`${u.collection}:${u.id}`, u.data));
    if (changes.settings) remember('settings', changes.settings);
    const client = supabase;
    setPending((n) => n + 1);
    queue.current = queue.current
      .then(() => pushDiff(client, changes))
      .then(() => setSyncError(null))
      .catch((err: unknown) => {
        const message = describeError(err);
        setSyncError(message);
        // A refusal usually means our role changed – pick that up, then show what the server really has.
        if (/permission/i.test(message)) refreshProfile();
        return reload();
      })
      .finally(() => setPending((n) => n - 1));
  }, [data, cloud, status, reload, refreshProfile]);

  // Pull everyone else's edits.
  useEffect(() => {
    if (!cloud || !supabase || status !== 'ready') return;
    const client = supabase;
    type Change = Parameters<typeof applyRemote>[1];
    const apply = (change: Change) => {
      if (synced.current) synced.current = applyRemote(synced.current, change);
      setRawData((prev) => applyRemote(prev, change));
    };
    const channel = client.channel('workspace')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as { collection: CollectionKey; id: string };
          apply({ type: 'delete', collection: old.collection, id: old.id });
        } else {
          const row = payload.new as Extract<Change, { type: 'upsert' }>['row'];
          // Skip echoes of our own saves so a slow echo can't undo a newer local edit.
          if (isOwnEcho(`${row.collection}:${row.id}`, stableStringify(row.data))) return;
          apply({ type: 'upsert', row });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (payload) => {
        const settings = (payload.new as { data?: Settings }).data;
        if (!settings || isOwnEcho('settings', stableStringify(settings))) return;
        const same = (a: Settings) => stableStringify(a) === stableStringify(settings);
        if (synced.current && !same(synced.current.settings)) synced.current = { ...synced.current, settings };
        setRawData((prev) => (same(prev.settings) ? prev : { ...prev, settings }));
      })
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [cloud, status]);

  const upsert = useCallback(<K extends CollectionKey>(key: K, item: Item<K>) => {
    setData((prev) => {
      const list = prev[key] as Item<K>[];
      const exists = list.some((x) => x.id === item.id);
      const next = exists ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list];
      const out = { ...prev, [key]: next };
      // Keep the vehicle odometer in step with the latest reading we receive.
      if ((key === 'fuel' || key === 'checks') && 'odometer' in item && 'vehicleId' in item) {
        out.vehicles = prev.vehicles.map((v) =>
          v.id === item.vehicleId && item.odometer > v.odometer ? { ...v, odometer: item.odometer } : v,
        );
      }
      return out;
    });
  }, [setData]);

  const remove = useCallback((key: CollectionKey, id: string) => {
    setData((prev) => {
      const out = { ...prev, [key]: (prev[key] as { id: string }[]).filter((x) => x.id !== id) } as AppData;
      if (key === 'vehicles') {
        out.schedules = prev.schedules.filter((s) => s.vehicleId !== id);
        out.defects = prev.defects.filter((s) => s.vehicleId !== id);
        out.workOrders = prev.workOrders.filter((s) => s.vehicleId !== id);
        out.checks = prev.checks.filter((s) => s.vehicleId !== id);
        out.fuel = prev.fuel.filter((s) => s.vehicleId !== id);
      }
      if (key === 'drivers') {
        out.vehicles = prev.vehicles.map((v) => (v.driverId === id ? { ...v, driverId: undefined } : v));
      }
      return out;
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setData((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
  }, []);

  const nextWorkOrderNumber = useCallback(
    () => data.workOrders.reduce((m, w) => Math.max(m, w.number), 1000) + 1,
    [data.workOrders],
  );

  const submitCheck = useCallback((input: Omit<PrestartCheck, 'id' | 'passed'>) => {
    const check: PrestartCheck = { ...input, id: uid(), passed: input.items.every((i) => i.ok) };
    const newDefects: Defect[] = input.items
      .filter((i) => !i.ok)
      .map((i) => ({
        id: uid(), vehicleId: input.vehicleId, driverId: input.driverId, date: input.date, item: i.label,
        description: i.note || `${i.label} failed pre-start check`, severity: 'major', status: 'open', checkId: check.id,
      }));
    setData((prev) => ({
      ...prev,
      checks: [check, ...prev.checks],
      defects: [...newDefects, ...prev.defects],
      vehicles: prev.vehicles.map((v) =>
        v.id === input.vehicleId && input.odometer > v.odometer ? { ...v, odometer: input.odometer } : v,
      ),
    }));
    return check;
  }, []);

  const createWorkOrderFromDefect = useCallback((defect: Defect) => {
    const wo: WorkOrder = {
      id: uid(), number: nextWorkOrderNumber(), vehicleId: defect.vehicleId, title: `Fix: ${defect.item}`,
      description: defect.description, type: 'Repair',
      priority: defect.severity === 'critical' ? 'critical' : defect.severity === 'major' ? 'high' : 'medium',
      status: 'open', assignee: '', dueDate: todayISO(), createdAt: todayISO(), labourHours: 1,
      labourRate: data.settings.labourRate, parts: [], defectId: defect.id,
    };
    setData((prev) => ({
      ...prev,
      workOrders: [wo, ...prev.workOrders],
      defects: prev.defects.map((d) => (d.id === defect.id ? { ...d, status: 'in-workorder', workOrderId: wo.id } : d)),
    }));
    return wo;
  }, [nextWorkOrderNumber, data.settings.labourRate]);

  /**
   * Moving a work order to "completed" closes the loop: parts are taken from stock,
   * the linked defect is resolved and the linked service schedule is reset.
   */
  const setWorkOrderStatus = useCallback((id: string, status: WorkOrder['status']) => {
    setData((prev) => {
      const wo = prev.workOrders.find((w) => w.id === id);
      if (!wo || wo.status === status) return prev;
      const completing = status === 'completed';
      const reopening = wo.status === 'completed';
      const sign = completing ? -1 : reopening ? 1 : 0;
      const vehicle = prev.vehicles.find((v) => v.id === wo.vehicleId);
      return {
        ...prev,
        workOrders: prev.workOrders.map((w) =>
          w.id === id ? { ...w, status, completedAt: completing ? todayISO() : undefined } : w,
        ),
        parts: sign === 0 ? prev.parts : prev.parts.map((p) => {
          const used = wo.parts.find((x) => x.partId === p.id);
          return used ? { ...p, qty: Math.max(0, p.qty + sign * used.qty) } : p;
        }),
        defects: prev.defects.map((d) =>
          d.id === wo.defectId ? { ...d, status: completing ? 'resolved' : 'in-workorder' } : d,
        ),
        schedules: completing && wo.scheduleId && vehicle
          ? prev.schedules.map((s) => s.id === wo.scheduleId
            ? { ...s, lastDoneDate: todayISO(), lastDoneKm: vehicle.odometer, lastDoneHours: vehicle.hours }
            : s)
          : prev.schedules,
        vehicles: completing && vehicle?.status === 'in-workshop'
          && !prev.workOrders.some((w) => w.id !== id && w.vehicleId === vehicle.id && w.status !== 'completed')
          ? prev.vehicles.map((v) => (v.id === vehicle.id ? { ...v, status: 'active' } : v))
          : prev.vehicles,
      };
    });
  }, []);

  const nextNumber = useCallback((key: 'workOrders' | 'ncrs' | 'audits') => {
    const start = key === 'workOrders' ? 1000 : key === 'ncrs' ? 1000 : 10;
    return (data[key] as { number: number }[]).reduce((m, x) => Math.max(m, x.number), start) + 1;
  }, [data]);

  const addNote = useCallback((entityType: EntityType, entityId: string, text: string) => {
    const note: Note = { id: uid(), entityType, entityId, text, at: new Date().toISOString(), by: actorRef.current };
    setData((prev) => ({ ...prev, notes: [note, ...prev.notes] }));
  }, [setData]);

  const saveReminder = useCallback((reminder: Reminder) => {
    setData((prev) => {
      const exists = prev.reminders.some((r) => r.id === reminder.id);
      return { ...prev, reminders: exists ? prev.reminders.map((r) => (r.id === reminder.id ? reminder : r)) : [reminder, ...prev.reminders] };
    });
  }, [setData]);

  /** Tick off a reminder; repeating reminders roll forward to their next date. */
  const completeReminder = useCallback((id: string) => {
    setData((prev) => {
      const r = prev.reminders.find((x) => x.id === id);
      if (!r || r.done) return prev;
      const done = { ...r, done: true, doneAt: todayISO() };
      const again = r.repeat !== 'none' ? [{ ...r, id: uid(), done: false, doneAt: undefined, dueDate: addDays(r.dueDate, REPEAT_DAYS[r.repeat]) }] : [];
      return { ...prev, reminders: [...again, ...prev.reminders.map((x) => (x.id === id ? done : x))] };
    });
  }, [setData]);

  const addAttachment = useCallback(async (entityType: EntityType, entityId: string, file: File, meta: { category: string; expiry?: string; notes?: string }) => {
    const base: Attachment = {
      id: uid(), entityType, entityId, name: file.name, category: meta.category, mime: file.type || 'application/octet-stream',
      size: file.size, storage: 'inline', expiry: meta.expiry || undefined, notes: meta.notes || undefined,
      uploadedAt: new Date().toISOString(), uploadedBy: actorRef.current,
    };
    let att: Attachment;
    if (cloud && supabase) {
      const path = `${entityType}/${entityId}/${base.id}-${file.name.replace(/[^\w.-]+/g, '_')}`;
      const { error } = await supabase.storage.from('documents').upload(path, file, { contentType: base.mime });
      if (error) throw new Error(/row-level|policy|permission/i.test(error.message) ? "You don't have permission to upload documents." : error.message);
      att = { ...base, storage: 'cloud', path };
    } else {
      if (file.size > LOCAL_FILE_LIMIT) {
        throw new Error('Files over 1 MB can only be stored when team mode (Supabase) is switched on.');
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Could not read the file'));
        reader.readAsDataURL(file);
      });
      att = { ...base, storage: 'inline', dataUrl };
    }
    setData((prev) => ({ ...prev, attachments: [att, ...prev.attachments] }));
    return att;
  }, [cloud, setData]);

  const removeAttachment = useCallback(async (att: Attachment) => {
    if (att.storage === 'cloud' && att.path && supabase) {
      const { error } = await supabase.storage.from('documents').remove([att.path]);
      if (error) throw new Error(error.message);
    }
    setData((prev) => ({ ...prev, attachments: prev.attachments.filter((a) => a.id !== att.id) }));
  }, [setData]);

  const attachmentUrl = useCallback(async (att: Attachment) => {
    if (att.storage === 'inline') return att.dataUrl ?? null;
    if (att.storage === 'cloud' && att.path && supabase) {
      const { data: signed, error } = await supabase.storage.from('documents').createSignedUrl(att.path, 300);
      if (error) throw new Error(error.message);
      return signed.signedUrl;
    }
    return null;
  }, []);

  // Bulk replacements skip the history logger – they aren't edits to individual items.
  const replaceAll = useCallback((next: AppData) => setRawData(normalize(next)), []);
  const resetDemo = useCallback(() => setRawData(createSeed()), []);
  const clearAll = useCallback(() => setRawData((prev) => emptyData(prev.settings)), []);

  const sync = useMemo<SyncState>(() => ({
    mode: cloud ? 'cloud' : 'local', status, saving: pending > 0, error: syncError,
  }), [cloud, status, pending, syncError]);

  const value = useMemo<Store>(() => ({
    data, upsert, remove, updateSettings, submitCheck, createWorkOrderFromDefect, setWorkOrderStatus, nextNumber,
    nextWorkOrderNumber, addNote, saveReminder, completeReminder, addAttachment, removeAttachment, attachmentUrl,
    actor, replaceAll, resetDemo, clearAll, sync, reload,
  }), [data, upsert, remove, updateSettings, submitCheck, createWorkOrderFromDefect, setWorkOrderStatus, nextNumber,
    nextWorkOrderNumber, addNote, saveReminder, completeReminder, addAttachment, removeAttachment, attachmentUrl,
    actor, replaceAll, resetDemo, clearAll, sync, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

function describeError(err: unknown) {
  const message = (err as { message?: string } | null)?.message ?? '';
  if (/row-level security|permission|42501/i.test(message)) return "You don't have permission to make that change.";
  if (/fetch|network/i.test(message)) return 'Could not reach the server – check your connection.';
  return message || 'Could not save changes';
}
