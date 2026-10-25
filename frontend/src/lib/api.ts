import { z } from 'zod';
import { cartSchema, categorySchema, orderSchema, pageSchema, productSchema, reviewedQuoteSchema, receiptSchema, sessionSchema, storeSchema, userSchema } from './types.ts';
import type { Checkout } from './types.ts';

const BASE = (import.meta.env.VITE_API_BASE || '/api/v1').replace(/\/$/, '');
let csrf = '';
let sessionRequest: Promise<z.infer<typeof sessionSchema>> | null = null;
let sessionEpoch = 0;

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) { super(message); this.status = status; this.code = code; }
}
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong. Please try again.'; }

export async function request<T>(path: string, schema: z.ZodType<T>, options: RequestInit = {}): Promise<T> {
  const method = options.method || 'GET';
  const writing = !['GET', 'HEAD'].includes(method);
  if (writing && !csrf) await refreshSession();
  const headers = new Headers(options.headers);
  if (writing) { headers.set('X-CSRF-Token', csrf); headers.set('Content-Type', 'application/json'); }
  let response: Response;
  try { response = await fetch(`${BASE}${path}`, { ...options, headers, credentials: 'include', signal: options.signal || AbortSignal.timeout(20000) }); }
  catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError('The store could not be reached. Check your connection and try again.', 0);
  }
  if (!response.ok) {
    let message = `The request could not be completed (${response.status}).`;
    try {
      const data = await response.json();
      if (typeof data.detail === 'string') message = data.detail;
      else if (Array.isArray(data.detail)) message = data.detail.map((e: { msg?: string; loc?: string[] }) => `${e.loc?.slice(1).join(' ') || 'Details'}: ${e.msg || 'Check this value.'}`).join(' ');
    } catch { /* Keep the safe HTTP fallback. */ }
    if (response.status === 403 && method !== 'GET') {
      csrf = '';
      message = 'Your session needs refreshing. Please try this action again.';
    }
    const code = response.headers.get('X-Inventory-Outcome') === 'not-applied-stale-version' ? 'inventory_not_applied' : undefined;
    throw new ApiError(message, response.status, code);
  }
  const raw: unknown = response.status === 204 ? null : await response.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApiError('The store returned an unexpected response. Please reload before continuing.', 502);
  return parsed.data;
}

export function refreshSession() {
  if (sessionRequest) return sessionRequest;
  const epoch = sessionEpoch;
  sessionRequest = request('/session', sessionSchema).then(data => { if (epoch === sessionEpoch) csrf = data.csrf_token; return data; }).finally(() => { if (epoch === sessionEpoch) sessionRequest = null; });
  return sessionRequest;
}
function notifyAuthChanged() {
  sessionEpoch++; csrf = ''; sessionRequest = null;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('store:auth-changed'));
  try { localStorage.setItem('store.auth.changed', crypto.randomUUID()); } catch { /* Focus/poll checks remain available. */ }
}
export const api = {
  store: (signal?: AbortSignal) => request('/store', storeSchema, { signal }),
  products: (query = '', signal?: AbortSignal) => request(`/products?${query}`, pageSchema(productSchema), { signal }),
  categories: async (signal?: AbortSignal) => {
    const items: z.infer<typeof categorySchema>[] = [];
    for (let offset = 0; offset < 10000; offset += 100) {
      const page = await request(`/categories?limit=100&offset=${offset}`, pageSchema(categorySchema), { signal });
      items.push(...page.items);
      if (items.length >= page.total || !page.items.length) return items;
    }
    throw new ApiError('There are too many categories to display. Contact the store.', 422);
  },
  cart: async () => { if (!csrf) await refreshSession(); return request('/cart', cartSchema); },
  setQuantity: (id: number, quantity: number) => request(`/cart/items/${id}`, cartSchema, { method: 'PUT', body: JSON.stringify({ quantity }) }),
  removeItem: (id: number) => request(`/cart/items/${id}`, z.null(), { method: 'DELETE' }),
  quote: (data: Checkout) => request('/checkout/quote', reviewedQuoteSchema, { method: 'POST', body: JSON.stringify(data) }),
  placeOrder: (data: Checkout, key: string) => request('/orders', receiptSchema, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(data) }),
  cancelOrder: (id: string, token?: string | null) => request(`/orders/${id}/cancel`, orderSchema, { method: 'POST', body: JSON.stringify({ lookup_token: token || '' }) }),
  lookup: (id: string, token: string) => request('/orders/lookup', orderSchema, { method: 'POST', body: JSON.stringify({ order_id: id, lookup_token: token }) }),
  orders: () => request('/orders?limit=100', pageSchema(orderSchema)),
  login: (email: string, password: string) => request('/auth/login', userSchema, { method: 'POST', body: JSON.stringify({ email, password }) }).finally(notifyAuthChanged),
  register: (name: string, email: string, password: string) => request('/auth/register', userSchema, { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  logout: () => request('/auth/logout', z.null(), { method: 'POST' }).finally(notifyAuthChanged),
};
