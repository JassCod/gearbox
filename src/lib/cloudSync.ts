import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppData, CollectionKey, Settings } from '../types';

export const COLLECTIONS: CollectionKey[] = ['vehicles', 'schedules', 'workOrders', 'defects', 'checks', 'parts', 'drivers', 'fuel',
  'ncrs', 'contractors', 'audits', 'attachments', 'reminders', 'notes', 'activity'];

type Row = { collection: CollectionKey; id: string; data: { id: string } };

export function emptyData(settings: Settings): AppData {
  return {
    vehicles: [], schedules: [], workOrders: [], defects: [], checks: [], parts: [], drivers: [], fuel: [],
    ncrs: [], contractors: [], audits: [], attachments: [], reminders: [], notes: [], activity: [], settings,
  };
}

/** Load the whole shared workspace. Returns settings = null when none have been saved yet. */
export async function loadAll(client: SupabaseClient, fallbackSettings: Settings) {
  const rows: Row[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await client.from('records').select('collection,id,data')
      .order('collection').order('id').range(from, from + page - 1);
    if (error) throw error;
    rows.push(...(data as Row[]));
    if (!data || data.length < page) break;
  }
  const { data: s, error } = await client.from('app_settings').select('data').eq('id', 1).maybeSingle();
  if (error) throw error;

  const out = emptyData({ ...fallbackSettings, ...(s?.data as Partial<Settings> | undefined) });
  for (const r of rows) {
    if (COLLECTIONS.includes(r.collection)) (out[r.collection] as { id: string }[]).push(r.data);
  }
  // Newest first, like the local store keeps them.
  for (const c of COLLECTIONS) (out[c] as { id: string }[]).reverse();
  return { data: out, hasSettings: !!s };
}

export interface Diff {
  upserts: Row[];
  deletes: { collection: CollectionKey; id: string }[];
  settings?: Settings;
}

/**
 * Items are replaced immutably, so an item whose object identity changed is an
 * edit – no deep comparison needed.
 */
export function diff(prev: AppData, next: AppData): Diff {
  const out: Diff = { upserts: [], deletes: [] };
  for (const c of COLLECTIONS) {
    const a = prev[c] as { id: string }[];
    const b = next[c] as { id: string }[];
    if (a === b) continue;
    const before = new Map(a.map((x) => [x.id, x]));
    for (const item of b) {
      if (before.get(item.id) !== item) out.upserts.push({ collection: c, id: item.id, data: item });
      before.delete(item.id);
    }
    for (const id of before.keys()) out.deletes.push({ collection: c, id });
  }
  if (prev.settings !== next.settings) out.settings = next.settings;
  return out;
}

export const isEmptyDiff = (d: Diff) => !d.upserts.length && !d.deletes.length && !d.settings;

export class PermissionError extends Error {}

export async function pushDiff(client: SupabaseClient, d: Diff) {
  for (let i = 0; i < d.upserts.length; i += 500) {
    const chunk = d.upserts.slice(i, i + 500);
    const { data, error } = await client.from('records').upsert(chunk, { onConflict: 'collection,id' }).select('id');
    if (error) throw error;
    // Row-level security silently skips rows you may not touch – treat that as a refusal.
    if ((data?.length ?? 0) < chunk.length) throw new PermissionError("You don't have permission to make that change.");
  }
  const byCollection = new Map<CollectionKey, string[]>();
  d.deletes.forEach((x) => byCollection.set(x.collection, [...(byCollection.get(x.collection) ?? []), x.id]));
  for (const [collection, ids] of byCollection) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data, error } = await client.from('records').delete().eq('collection', collection).in('id', chunk).select('id');
      if (error) throw error;
      if ((data?.length ?? 0) < chunk.length) throw new PermissionError("You don't have permission to delete that.");
    }
  }
  if (d.settings) {
    const { data, error } = await client.from('app_settings').upsert({ id: 1, data: d.settings, updated_at: new Date().toISOString() }).select('id');
    if (error) throw error;
    if (!data?.length) throw new PermissionError("You don't have permission to change settings.");
  }
}

/** Apply one realtime change to a snapshot, returning the same object when nothing changed. */
export function applyRemote(state: AppData, change: { type: 'upsert'; row: Row } | { type: 'delete'; collection: CollectionKey; id: string }): AppData {
  const c = change.type === 'upsert' ? change.row.collection : change.collection;
  if (!COLLECTIONS.includes(c)) return state;
  const list = state[c] as { id: string }[];
  if (change.type === 'delete') {
    return list.some((x) => x.id === change.id) ? { ...state, [c]: list.filter((x) => x.id !== change.id) } : state;
  }
  const item = change.row.data;
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) {
    if (stableStringify(list[idx]) === stableStringify(item)) return state;
    const copy = list.slice();
    copy[idx] = item;
    return { ...state, [c]: copy };
  }
  return { ...state, [c]: [item, ...list] };
}

/** JSON with sorted keys – Postgres jsonb does not keep key order, so plain JSON.stringify can't compare. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
