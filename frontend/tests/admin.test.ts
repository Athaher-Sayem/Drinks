import { describe, expect, it } from 'vitest';
import { parsePairs, printPairs, parseImages, nextStatuses, submitInventory } from '../src/admin/helpers.ts';
import { ApiError } from '../src/lib/api.ts';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

describe('admin input and state rules', () => {
  it('parses editable attributes without dropping duplicate or malformed lines', () => {
    expect(parsePairs('material=cotton\ncolor=navy')).toEqual({ material: 'cotton', color: 'navy' });
    expect(printPairs({ material: 'cotton' })).toBe('material=cotton');
    expect(() => parsePairs('color=red\ncolor=blue')).toThrow(/duplicate/i);
    expect(() => parsePairs('not a pair')).toThrow(/key=value/i);
    expect(() => parsePairs('__proto__=bad')).toThrow();
  });
  it('allows only bounded http(s) image lists', () => {
    expect(parseImages('https://example.com/mug.jpg\n')).toEqual(['https://example.com/mug.jpg']);
    expect(() => parseImages('javascript:alert(1)')).toThrow();
    expect(() => parseImages(Array(11).fill('https://example.com/a.jpg').join('\n'))).toThrow();
  });
  it('offers only fulfillment-compatible order transitions', () => {
    expect(nextStatuses('processing', 'pickup')).toEqual(['ready', 'cancelled']);
    expect(nextStatuses('processing', 'shipping')).toEqual(['dispatched', 'cancelled']);
    expect(nextStatuses('completed', 'pickup')).toEqual([]);
  });
  it('reuses uncertain inventory adjustments after reload and a denied retry', async () => {
    const storage = new MemoryStorage();
    const payload = { delta: 3, expected_version: 1, reason: 'New shipment' };
    const keys: string[] = [];
    const send = async (_payload: typeof payload, key: string) => { keys.push(key); throw new ApiError('Offline', keys.length === 1 ? 0 : 409); };
    await expect(submitInventory(4, payload, send, storage)).rejects.toThrow();
    await expect(submitInventory(4, payload, send, storage)).rejects.toThrow();
    expect(new Set(keys).size).toBe(1);
    expect([...storage.data.values()].join('')).not.toContain('New shipment');
    await expect(submitInventory(4, { ...payload, delta: 9 }, send, storage)).rejects.toThrow(/previous/i);
  });
  it('clears known inventory results but never turns resolved recovery into a new write', async () => {
    const storage = new MemoryStorage();
    const payload = { delta: 3, expected_version: 1, reason: 'New shipment' };
    await expect(submitInventory(1, payload, async () => 'saved', storage)).resolves.toBe('saved');
    expect(storage.data.size).toBe(0);
    await expect(submitInventory(1, payload, async () => 'duplicate', storage, true)).rejects.toThrow(/resolved/i);
  });
  it('retires an uncertain key only after the server proves the old version cannot apply', async () => {
    const storage = new MemoryStorage();
    const payload = { delta: 2, expected_version: 1, reason: 'Shipment' };
    await expect(submitInventory(2, payload, async () => { throw new ApiError('Offline', 0); }, storage)).rejects.toThrow();
    await expect(submitInventory(2, payload, async () => { throw new ApiError('Reload stock', 409, 'inventory_not_applied'); }, storage, true)).rejects.toThrow('Reload stock');
    expect(storage.data.size).toBe(0);
  });
});
