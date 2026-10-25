import type { Checkout } from './types.ts';
import { ApiError } from './api.ts';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
const KEY = 'store.checkout.intent.v1';

export function hasPendingCheckout(storage?: Storage) { try { return (storage || localStorage).getItem(KEY) !== null; } catch { return false; } }
export function clearCheckoutIntent(storage: Storage = localStorage) { storage.removeItem(KEY); }
export async function checkoutIntent(payload: Checkout, storage: Storage = localStorage) {
  const { quote_token: _quote, ...details } = payload;
  const bytes = new TextEncoder().encode(JSON.stringify(details));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const saved = storage.getItem(KEY);
  if (saved) {
    let previous: { key?: string; fingerprint?: string };
    try { previous = JSON.parse(saved); } catch { throw new Error('A previous order may still be pending. Contact the store before placing another.'); }
    if (previous.fingerprint !== fingerprint || !previous.key) throw new Error('A previous order may have been submitted. Retry with the same details, or contact the store before starting another order.');
    return previous.key;
  }
  const key = crypto.randomUUID();
  storage.setItem(KEY, JSON.stringify({ key, fingerprint, quote_token: payload.quote_token }));
  return key;
}

export async function submitCheckout<T>(payload: Checkout, send: (data: Checkout, key: string) => Promise<T>, storage?: Storage, mode: 'reviewed' | 'recovery' = 'reviewed'): Promise<T> {
  const attempt = async () => {
    const target = storage || localStorage;
    const wasPending = hasPendingCheckout(target);
    if (!wasPending && mode === 'recovery') throw new Error('This checkout was resolved in another tab. Check that tab or your account before placing another order.');
    if (!wasPending && !payload.quote_token) throw new Error('Review your bag before submitting a new order.');
    const key = await checkoutIntent(payload, target);
    const saved = JSON.parse(target.getItem(KEY)!);
    try {
      const result = await send({ ...payload, quote_token: saved.quote_token }, key);
      // A known receipt must still be shown if browser storage becomes unavailable.
      try { clearCheckoutIntent(target); } catch { /* Keep the conservative guard. */ }
      return result;
    } catch (error) {
      if (!wasPending && error instanceof ApiError && [400, 401, 403, 404, 409, 422, 429].includes(error.status)) clearCheckoutIntent(target);
      throw error;
    }
  };
  // Serialize intent creation and submission across tabs. Unsupported browsers fail closed.
  if (storage) return attempt();
  if (!navigator.locks) throw new Error('Safe checkout requires a current browser with secure storage. Please update your browser or contact the store.');
  return navigator.locks.request('store.checkout', attempt);
}
