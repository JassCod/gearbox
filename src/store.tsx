import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppData, CollectionKey, Defect, PrestartCheck, Settings, WorkOrder } from './types';
import { createSeed } from './data/seed';
import { todayISO, uid } from './lib/utils';

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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage full or unavailable – app keeps working in memory */
    }
  }, [data]);

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

  const value = useMemo<Store>(() => ({
    data, upsert, remove, updateSettings, submitCheck, createWorkOrderFromDefect, setWorkOrderStatus,
    nextWorkOrderNumber, replaceAll, resetDemo, clearAll,
  }), [data, upsert, remove, updateSettings, submitCheck, createWorkOrderFromDefect, setWorkOrderStatus,
    nextWorkOrderNumber, replaceAll, resetDemo, clearAll]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
