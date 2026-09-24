import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppData, CollectionKey, Defect, PrestartCheck, Settings, WorkOrder } from './types';
import { createSeed } from './data/seed';
import { todayISO, uid } from './lib/utils';
import { supabase } from './lib/supabase';
import { useAuth } from './auth';
import { applyRemote, diff, emptyData, isEmptyDiff, loadAll, pushDiff, stableStringify } from './lib/cloudSync';

const STORAGE_KEY = 'torqline:data:v1';

type Item<K extends CollectionKey> = AppData[K][number];

interface Store {
  data: AppData;
  upsert<K extends CollectionKey>(key: K, item: Item<K>): void;
  remove(key: CollectionKey, id: string): void;
  updateSettings(patch: Partial<Settings>): void;
  submitCheck(check: Omit<PrestartCheck, 'id' | 'passed'>): PrestartCheck;
  createWorkOrderFromDefect(defect: Defect): WorkOrder;
  setWorkOrderStatus(id: string, status: WorkOrder['status']): void;
  nextWorkOrderNumber(): number;
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

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      if (parsed && Array.isArray(parsed.vehicles)) return parsed;
    }
  } catch {
    /* ignore corrupt or unavailable storage */
  }
  return createSeed();
}

/**
 * In local mode data lives in localStorage. In cloud mode (`cloud` = signed-in
 * member) every change is diffed against the last known server state and
 * pushed to Supabase, and other people's changes stream in over realtime.
 */
export function StoreProvider({ children, cloud = false }: { children: ReactNode; cloud?: boolean }) {
  const [data, setData] = useState<AppData>(() => (cloud ? emptyData(createSeed().settings) : load()));
  const [status, setStatus] = useState<SyncState['status']>(cloud ? 'loading' : 'ready');
  const [pending, setPending] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const { refreshProfile } = useAuth();
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
      synced.current = remote;
      setData(remote);
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
      setData((prev) => applyRemote(prev, change));
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
        setData((prev) => (same(prev.settings) ? prev : { ...prev, settings }));
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
  }, []);

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

  const replaceAll = useCallback((next: AppData) => setData(next), []);
  const resetDemo = useCallback(() => setData(createSeed()), []);
  const clearAll = useCallback(() => setData((prev) => ({
    vehicles: [], schedules: [], workOrders: [], defects: [], checks: [], parts: [], drivers: [], fuel: [],
    settings: prev.settings,
  })), []);

  const sync = useMemo<SyncState>(() => ({
    mode: cloud ? 'cloud' : 'local', status, saving: pending > 0, error: syncError,
  }), [cloud, status, pending, syncError]);

  const value = useMemo<Store>(() => ({
    data, upsert, remove, updateSettings, submitCheck, createWorkOrderFromDefect, setWorkOrderStatus,
    nextWorkOrderNumber, replaceAll, resetDemo, clearAll, sync, reload,
  }), [data, upsert, remove, updateSettings, submitCheck, createWorkOrderFromDefect, setWorkOrderStatus,
    nextWorkOrderNumber, replaceAll, resetDemo, clearAll, sync, reload]);

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
