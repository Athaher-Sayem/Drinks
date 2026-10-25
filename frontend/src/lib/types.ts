import { z } from 'zod';

const decimal = z.string().regex(/^\d+(?:\.\d+)?$/);
export const variantSchema = z.object({ id: z.number().int(), name: z.string(), sku: z.string(), price: decimal, options: z.record(z.string(), z.string()), in_stock: z.boolean() });
export const productSchema = z.object({ id: z.number().int(), category_id: z.number().int(), name: z.string(), slug: z.string(), description: z.string(), image_urls: z.array(z.string()), attributes: z.record(z.string(), z.string()), featured: z.boolean(), variants: z.array(variantSchema) });
export const categorySchema = z.object({ id: z.number().int(), name: z.string(), slug: z.string() });
export const storeSchema = z.object({ name: z.string(), description: z.string(), currency: z.string(), country: z.string(), contact_email: z.string(), tax_rate: decimal.nullable(), pickup_enabled: z.boolean(), shipping_enabled: z.boolean(), shipping_fee: decimal, delivery_postal_codes: z.array(z.string()), delivery_fee: decimal });
export const userSchema = z.object({ id: z.number().int(), name: z.string(), email: z.string(), role: z.string() });
export const sessionSchema = z.object({ csrf_token: z.string().min(1), user: userSchema.nullable() });
export const cartSchema = z.object({ items: z.array(z.object({ variant_id: z.number().int(), product_name: z.string(), product_slug: z.string(), variant_name: z.string(), options: z.record(z.string(), z.string()), quantity: z.number().int(), unit_price: decimal, line_total: decimal, available: z.boolean() })), item_count: z.number().int(), subtotal: decimal, currency: z.string() });
export const quoteSchema = z.object({ subtotal: decimal, tax: decimal, tax_rate: decimal, fulfillment_fee: decimal, total: decimal, currency: z.string() });
export const reviewedQuoteSchema = quoteSchema.extend({ quote_token: z.string().regex(/^[0-9a-f]{64}$/), cart: cartSchema });
export const orderSchema = quoteSchema.extend({ id: z.string(), customer_name: z.string(), email: z.string(), phone: z.string(), fulfillment: z.enum(['pickup', 'shipping', 'delivery']), status: z.enum(['pending', 'confirmed', 'processing', 'ready', 'dispatched', 'completed', 'cancelled']), created_at: z.string(), notes: z.string(), items: z.array(z.object({ product_name: z.string(), variant_name: z.string(), sku: z.string(), options: z.record(z.string(), z.string()), quantity: z.number().int(), unit_price: decimal, line_total: decimal })), events: z.array(z.object({ status: z.string(), created_at: z.string() })) });
export const receiptSchema = orderSchema.extend({ lookup_token: z.string().nullable() });
export function pageSchema<T extends z.ZodType>(schema: T) { return z.object({ items: z.array(schema), total: z.number().int(), offset: z.number().int(), limit: z.number().int() }); }

export type Product = z.infer<typeof productSchema>;
export type Variant = z.infer<typeof variantSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Store = z.infer<typeof storeSchema>;
export type User = z.infer<typeof userSchema>;
export type Cart = z.infer<typeof cartSchema>;
export type Quote = z.infer<typeof reviewedQuoteSchema>;
export type Order = z.infer<typeof orderSchema>;
export type Receipt = z.infer<typeof receiptSchema>;
export type Checkout = { customer_name: string; email: string; phone: string; fulfillment: 'pickup' | 'shipping' | 'delivery'; notes: string; quote_token?: string; address?: { line1: string; line2: string; city: string; region: string; postal_code: string; country: string } };
