import { z } from 'zod';
import { ApiError, request } from '../lib/api.ts';
import { categorySchema, orderSchema, pageSchema, productSchema, storeSchema, variantSchema } from '../lib/types.ts';

export const adminCategorySchema = categorySchema.extend({ description: z.string(), active: z.boolean() });
export const adminVariantSchema = variantSchema.extend({ product_id: z.number().int(), stock: z.number().int(), active: z.boolean(), version: z.number().int() });
export const adminProductSchema = productSchema.extend({ active: z.boolean(), variants: z.array(adminVariantSchema) });
export const adminStoreSchema = storeSchema.extend({ timezone: z.string(), tax_fulfillment_fee: z.boolean() });
export const adminOrderSchema = orderSchema.extend({ address: z.object({ line1: z.string(), line2: z.string(), city: z.string(), region: z.string(), postal_code: z.string(), country: z.string() }).nullable() });
const overviewSchema = z.object({ products: z.number(), active_products: z.number(), categories: z.number(), pending_orders: z.number(), open_orders: z.number(), low_stock_variants: z.number() });

export type AdminCategory = z.infer<typeof adminCategorySchema>;
export type AdminProduct = z.infer<typeof adminProductSchema>;
export type AdminVariant = z.infer<typeof adminVariantSchema>;
export type AdminStore = z.infer<typeof adminStoreSchema>;
export type AdminOrder = z.infer<typeof adminOrderSchema>;
export type ProductInput = Omit<AdminProduct, 'id' | 'variants'>;
export type CategoryInput = Omit<AdminCategory, 'id'>;
export type VariantInput = { name: string; price: string; options: Record<string, string>; active: boolean };
export type StockInput = { delta: number; expected_version: number; reason: string };

async function staffRequest<T>(path: string, schema: z.ZodType<T>, options?: RequestInit) {
  try { return await request(path, schema, options); }
  catch (error) {
    if (error instanceof ApiError && [401, 403].includes(error.status)) window.dispatchEvent(new Event('store:admin-access-changed'));
    throw error;
  }
}
const write = (method: string, data: unknown): RequestInit => ({ method, body: JSON.stringify(data) });

export const adminApi = {
  overview: () => staffRequest('/admin/overview', overviewSchema),
  categories: async () => {
    const items: AdminCategory[] = [];
    for (let offset = 0; offset < 10000; offset += 100) {
      const page = await staffRequest(`/admin/categories?limit=100&offset=${offset}`, pageSchema(adminCategorySchema));
      items.push(...page.items);
      if (items.length >= page.total || !page.items.length) return items;
    }
    throw new Error('Too many categories to display. Contact your operator.');
  },
  saveCategory: (id: number | null, data: CategoryInput) => staffRequest(`/admin/categories${id ? `/${id}` : ''}`, adminCategorySchema, write(id ? 'PUT' : 'POST', data)),
  products: (query: string) => staffRequest(`/admin/products?${query}`, pageSchema(adminProductSchema)),
  saveProduct: (id: number | null, data: ProductInput) => staffRequest(`/admin/products${id ? `/${id}` : ''}`, adminProductSchema, write(id ? 'PATCH' : 'POST', data)),
  createVariant: (productId: number, data: VariantInput & { sku: string; initial_stock: number }) => staffRequest('/admin/variants', adminVariantSchema, write('POST', { ...data, product_id: productId })),
  updateVariant: (id: number, data: VariantInput & { expected_version: number }) => staffRequest(`/admin/variants/${id}`, adminVariantSchema, write('PATCH', data)),
  adjust: (id: number, data: StockInput, key: string) => staffRequest(`/admin/variants/${id}/inventory-adjustments`, z.object({ adjustment_id: z.number(), variant: adminVariantSchema }), { ...write('POST', data), headers: { 'Idempotency-Key': key } }),
  orders: (query: string) => staffRequest(`/admin/orders?${query}`, pageSchema(adminOrderSchema)),
  order: (id: string) => staffRequest(`/admin/orders/${id}`, adminOrderSchema),
  status: (id: string, status: string) => staffRequest(`/admin/orders/${id}/status`, adminOrderSchema, write('PATCH', { status })),
  store: () => staffRequest('/store', adminStoreSchema),
  saveStore: (data: Partial<AdminStore>) => staffRequest('/admin/store', adminStoreSchema, write('PATCH', data)),
};
