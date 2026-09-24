import type { CollectionKey } from '../types';

export type Role = 'admin' | 'manager' | 'technician' | 'driver' | 'viewer' | 'pending';

export const ROLES: { value: Exclude<Role, 'pending'>; label: string; summary: string }[] = [
  { value: 'admin', label: 'Admin', summary: 'Everything, plus users, activity log and data tools' },
  { value: 'manager', label: 'Manager', summary: 'Create, edit and delete all fleet records and settings' },
  { value: 'technician', label: 'Technician', summary: 'Work orders, services, parts, defects, checks and fuel' },
  { value: 'driver', label: 'Driver', summary: 'Pre-start checks, defect reports and fuel fills' },
  { value: 'viewer', label: 'Viewer', summary: 'Read-only access to everything' },
];

// Keep in step with public.can_write() in supabase/schema.sql – the database is the real gatekeeper.
const WRITE: Record<Role, CollectionKey[] | 'all'> = {
  admin: 'all',
  manager: 'all',
  technician: ['vehicles', 'schedules', 'workOrders', 'defects', 'checks', 'parts', 'fuel'],
  driver: ['vehicles', 'checks', 'defects', 'fuel'],
  viewer: [],
  pending: [],
};

export function canWrite(role: Role, collection: CollectionKey) {
  const w = WRITE[role];
  return w === 'all' || w.includes(collection);
}

export const canDelete = (role: Role) => role === 'admin' || role === 'manager';
export const canManage = canDelete;
export const isAdmin = (role: Role) => role === 'admin';
