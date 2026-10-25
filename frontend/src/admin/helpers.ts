import { ApiError } from '../lib/api.ts';
import type { StockInput } from './api.ts';

export function parsePairs(text: string) {
  const pairs: Record<string, string> = {};
  for (const line of text.split(/\r?\n/).filter(line => line.trim())) {
    const separator = line.indexOf('=');
    if (separator < 1) throw new Error('Use one key=value pair per line.');
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (Object.hasOwn(pairs, key)) throw new Error(`Duplicate attribute: ${key}`);
    if (['__proto__', 'constructor', 'prototype'].includes(key) || key.length > 64 || value.length > 250) throw new Error('Attribute names must be safe and at most 64 characters; values at most 250.');
    pairs[key] = value;
  }
  if (Object.keys(pairs).length > 20) throw new Error('Use at most 20 attributes.');
  return pairs;
}
export function printPairs(pairs: Record<string, string>) { return Object.entries(pairs).map(([k, v]) => `${k}=${v}`).join('\n'); }
export function parseImages(text: string) {
  const urls = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (urls.length > 10) throw new Error('Use at most 10 photo URLs.');
  for (const url of urls) {
    try { if (!['https:', 'http:'].includes(new URL(url).protocol)) throw new Error(); }
    catch { throw new Error('Photo URLs must be complete http:// or https:// addresses.'); }
  }
  return urls;
}
export function nextStatuses(status: string, fulfillment: string): string[] {
  const transitions: Record<string, string[]> = {
    pending: ['confirmed', 'cancelled'], confirmed: ['processing', 'cancelled'],
    processing: [fulfillment === 'pickup' ? 'ready' : 'dispatched', 'cancelled'],
    ready: ['completed', 'cancelled'], dispatched: ['completed'], completed: [], cancelled: [],
  };
  return transitions[status] || [];
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Pending = { key: string; fingerprint: string; expected_version: number; delta: number };
const storageKey = (id: number) => `store.inventory.intent.v1.${id}`;
export function pendingInventory(id: number, storage?: Storage): Pending | null {
  const raw = (storage || localStorage).getItem(storageKey(id));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (typeof value.key !== 'string' || typeof value.fingerprint !== 'string' || !Number.isInteger(value.expected_version) || !Number.isInteger(value.delta)) throw new Error();
    return value;
  } catch { throw new Error('A previous inventory request cannot be read. Contact your operator before changing stock.'); }
}
export async function submitInventory<T>(id: number, data: StockInput, send: (data: StockInput, key: string) => Promise<T>, storage?: Storage, recovery = false): Promise<T> {
  const attempt = async () => {
    const target = storage || localStorage;
    const previous = pendingInventory(id, target);
    if (recovery && !previous) throw new Error('This adjustment was resolved in another tab. Reload the stock before continuing.');
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data)));
    const fingerprint = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
    if (previous && previous.fingerprint !== fingerprint) throw new Error('A previous adjustment may have applied. Retry with the same quantity, version, and reason before changing stock again.');
    const intent = previous || { key: crypto.randomUUID(), fingerprint, delta: data.delta, expected_version: data.expected_version };
    target.setItem(storageKey(id), JSON.stringify(intent));
    try {
      const result = await send(data, intent.key);
      try { target.removeItem(storageKey(id)); } catch { /* Do not hide a known success. */ }
      return result;
    } catch (error) {
      if (error instanceof ApiError && (error.code === 'inventory_not_applied' || (!previous && [400, 401, 403, 404, 409, 422, 429].includes(error.status)))) target.removeItem(storageKey(id));
      throw error;
    }
  };
  if (storage) return attempt();
  if (!navigator.locks) throw new Error('Stock changes require a current browser with secure storage and Web Locks.');
  return navigator.locks.request(`store.inventory.${id}`, attempt);
}
