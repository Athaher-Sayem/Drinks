import { describe, expect, it } from 'vitest';
import { catalogGroups, formatMoney, firstAvailable, filterProducts, normalizePhone } from '../src/lib/store.ts';

const products = [
  { id: 1, name: 'Canvas Tote', slug: 'tote', category_id: 1, description: 'Cotton carryall', image_urls: [], attributes: {}, featured: true, variants: [
    { id: 1, name: 'Natural', sku: 'TOTE', price: '12.50', options: {}, in_stock: false },
    { id: 2, name: 'Navy', sku: 'TOTE-N', price: '15.00', options: {}, in_stock: true },
  ] },
  { id: 2, name: 'Mug', slug: 'mug', category_id: 2, description: 'Stoneware', image_urls: [], attributes: {}, featured: false, variants: [] },
];

describe('catalog presentation', () => {
  it('groups only actual catalog products', () => {
    expect(catalogGroups(products, [{ id: 1, name: 'Accessories', slug: 'accessories' }, { id: 2, name: 'Home', slug: 'home' }]).map(g => g.count)).toEqual([1, 1]);
  });
  it('selects an available variant rather than the first sold-out variant', () => {
    expect(firstAvailable(products[0])?.id).toBe(2);
    expect(firstAvailable(products[1])).toBeUndefined();
  });
  it('combines category, search and price sorting without changing source data', () => {
    expect(filterProducts(products, ' cotton ', 1, 'price-asc').map(p => p.id)).toEqual([1]);
    expect(filterProducts(products, 'missing', null, 'featured')).toEqual([]);
    expect(products[0].id).toBe(1);
  });
  it('formats the configured currency', () => {
    expect(formatMoney('12.50', 'USD')).toBe('$12.50');
    expect(formatMoney('12.50', 'GBP')).toBe('£12.50');
  });
  it('accepts explicit international numbers and normalizes US input', () => {
    expect(normalizePhone('(202) 555-0142', 'US')).toBe('+12025550142');
    expect(normalizePhone('+44 20 7946 0958', 'GB')).toBe('+442079460958');
    expect(() => normalizePhone('123', 'US')).toThrow();
    expect(() => normalizePhone('02079460958', 'GB')).toThrow();
  });
});
