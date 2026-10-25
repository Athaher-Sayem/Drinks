import { beforeEach, describe, expect, it } from 'vitest';
import { checkoutIntent, clearCheckoutIntent, hasPendingCheckout, submitCheckout } from '../src/lib/checkout.ts';
import { ApiError } from '../src/lib/api.ts';
import type { Checkout } from '../src/lib/types.ts';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

describe('checkout retry identity', () => {
  let storage: MemoryStorage;
  const payload = { customer_name: 'Alex', email: 'alex@example.com', phone: '+12025550142', fulfillment: 'pickup' as const, notes: '' };
  beforeEach(() => { storage = new MemoryStorage(); });
  it('reuses one key for retries and does not store contact information', async () => {
    const a = await checkoutIntent(payload, storage);
    const b = await checkoutIntent(payload, storage);
    expect(a).toBe(b);
    expect(hasPendingCheckout(storage)).toBe(true);
    expect([...storage.data.values()].join('')).not.toContain('alex@example.com');
    expect([...storage.data.values()].join('')).not.toContain('Alex');
  });
  it('does not silently replace an uncertain attempt when details change', async () => {
    await checkoutIntent(payload, storage);
    await expect(checkoutIntent({ ...payload, notes: 'Changed' }, storage)).rejects.toThrow(/previous order/i);
  });
  it('creates a new key only after the previous outcome is known', async () => {
    const previous = await checkoutIntent(payload, storage);
    clearCheckoutIntent(storage);
    expect(hasPendingCheckout(storage)).toBe(false);
    expect(await checkoutIntent(payload, storage)).not.toBe(previous);
  });
  it('keeps an uncertain key after a denied retry and reuses the reviewed quote', async () => {
    const keys: string[] = [];
    const send = async (data: Checkout, key: string) => {
      keys.push(key);
      expect(data.quote_token).toBe('reviewed-quote');
      throw new ApiError('Offline', keys.length === 1 ? 0 : 403);
    };
    await expect(submitCheckout({ ...payload, quote_token: 'reviewed-quote' }, send, storage)).rejects.toThrow('Offline');
    await expect(submitCheckout(payload, send, storage)).rejects.toThrow('Offline');
    expect(hasPendingCheckout(storage)).toBe(true);
    expect(new Set(keys).size).toBe(1);
  });
  it('releases an initial definitive rejection so details can be corrected', async () => {
    await expect(submitCheckout({ ...payload, quote_token: 'reviewed-quote' }, async () => { throw new ApiError('Stock changed', 409); }, storage)).rejects.toThrow('Stock changed');
    expect(hasPendingCheckout(storage)).toBe(false);
  });
  it('clears a known successful outcome', async () => {
    await expect(submitCheckout({ ...payload, quote_token: 'reviewed-quote' }, async () => 'receipt', storage)).resolves.toBe('receipt');
    expect(hasPendingCheckout(storage)).toBe(false);
  });
  it('never turns a recovery resolved in another tab into a new checkout', async () => {
    let sent = false;
    await expect(submitCheckout(payload, async () => { sent = true; }, storage, 'recovery')).rejects.toThrow(/resolved/i);
    expect(sent).toBe(false);
    expect(hasPendingCheckout(storage)).toBe(false);
  });
  it('requires a reviewed quote for a new submission', async () => {
    await expect(submitCheckout(payload, async () => 'unreviewed', storage)).rejects.toThrow(/review/i);
    expect(hasPendingCheckout(storage)).toBe(false);
  });
});
