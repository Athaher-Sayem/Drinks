import type { Category, Product } from './types.ts';

export function formatMoney(value: string, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value));
}
export function firstAvailable(product: Product) { return product.variants.find(v => v.in_stock); }
export function startingPrice(product: Product) {
  return product.variants.reduce((min, v) => Math.min(min, Number(v.price)), Infinity);
}
export function catalogGroups(products: Product[], categories: Category[]) {
  return categories.map(category => ({ ...category, count: products.filter(p => p.category_id === category.id).length })).filter(g => g.count > 0);
}
export function filterProducts(products: Product[], query: string, category: number | null, sort: string) {
  const text = query.trim().toLowerCase();
  return products.filter(p => (category === null || p.category_id === category) && `${p.name} ${p.description}`.toLowerCase().includes(text)).sort((a, b) => sort === 'price-asc' ? startingPrice(a) - startingPrice(b) : sort === 'featured' ? Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
}
export function normalizePhone(value: string, country: string) {
  const digits = value.replace(/[\s().-]/g, '');
  if (/^\+[1-9]\d{6,14}$/.test(digits)) return digits;
  if (country === 'US' && /^\d{10}$/.test(digits)) return `+1${digits}`;
  if (country === 'US' && /^1\d{10}$/.test(digits)) return `+${digits}`;
  throw new Error(country === 'US' ? 'Enter a 10-digit phone number or include your country code.' : 'Include a country code, for example +44 20 7946 0958.');
}
export function friendlyStatus(status: string) {
  return ({ pending: 'Awaiting confirmation', confirmed: 'Confirmed', processing: 'Being prepared', ready: 'Ready for pickup', dispatched: 'Dispatched', completed: 'Completed', cancelled: 'Cancelled' } as Record<string, string>)[status] || status;
}
