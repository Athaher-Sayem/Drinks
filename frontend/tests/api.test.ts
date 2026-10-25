import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = { csrf_token: 'test-csrf', user: null };
const cart = { items: [], item_count: 0, subtotal: '0.00', currency: 'USD' };

describe('API session and error handling', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('single-flights initialization before writes and includes cookies and CSRF', async () => {
    const requests: { path: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
      requests.push({ path, init });
      return Response.json(path.endsWith('/session') ? session : cart);
    });
    const { api, refreshSession } = await import('../src/lib/api.ts');
    await Promise.all([refreshSession(), refreshSession(), api.cart()]);
    expect(requests.filter(r => r.path.endsWith('/session'))).toHaveLength(1);
    await api.setQuantity(1, 2);
    const write = requests.find(r => r.init?.method === 'PUT')!;
    expect(new Headers(write.init?.headers).get('X-CSRF-Token')).toBe('test-csrf');
    expect(write.init?.credentials).toBe('include');
    expect(JSON.parse(String(write.init?.body))).toEqual({ quantity: 2 });
  });

  it('rejects malformed catalog data rather than rendering invented values', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ items: [{}], total: 1, offset: 0, limit: 12 }));
    const { api } = await import('../src/lib/api.ts');
    await expect(api.products()).rejects.toMatchObject({ status: 502 });
  });

  it('does not automatically repeat failed writes and refreshes CSRF for the next attempt', async () => {
    let reads = 0;
    let writes = 0;
    vi.stubGlobal('fetch', async (path: string) => {
      if (path.endsWith('/session')) { reads++; return Response.json(session); }
      writes++;
      return Response.json({ detail: 'CSRF expired' }, { status: 403 });
    });
    const { api } = await import('../src/lib/api.ts');
    await expect(api.setQuantity(1, 1)).rejects.toMatchObject({ status: 403 });
    expect(writes).toBe(1);
    await expect(api.setQuantity(1, 1)).rejects.toMatchObject({ status: 403 });
    expect(reads).toBe(2);
    expect(writes).toBe(2);
  });

  it('turns connection failures into a safe actionable error', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('Network failed'); });
    const { api } = await import('../src/lib/api.ts');
    await expect(api.store()).rejects.toMatchObject({ status: 0, message: expect.stringContaining('connection') });
  });
});
