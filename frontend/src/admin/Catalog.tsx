import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from '../components/Dialog.tsx';
import { Icon } from '../components/Icon.tsx';
import { ProductArt } from '../components/ProductArt.tsx';
import { formatMoney } from '../lib/store.ts';
import { adminApi } from './api.ts';
import type { AdminCategory, AdminProduct, AdminVariant } from './api.ts';
import { parseImages, parsePairs, pendingInventory, printPairs, submitInventory } from './helpers.ts';
import { Area, Check, ErrorNote, Field, Pagination, Panel, text, useAction } from './shared.tsx';

export function Catalog({ inventory, currency, onChanged }: { inventory: boolean; currency: string; onChanged: (message: string) => void }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [active, setActive] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<AdminProduct | null | undefined>();
  const [stock, setStock] = useState<AdminVariant | null>(null);
  const query = new URLSearchParams({ limit: '20', offset: String(page * 20) });
  if (search.trim()) query.set('search', search.trim());
  if (category) query.set('category_id', category);
  if (active) query.set('active', active);
  if (lowStock) query.set('low_stock', 'true');
  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: adminApi.categories, retry: false });
  const products = useQuery({ queryKey: ['admin', 'products', query.toString()], queryFn: () => adminApi.products(query.toString()), retry: false });
  function filters(change: () => void) { change(); setPage(0); }
  return <>
    <Panel title={inventory ? 'Stock, without the guesswork' : 'Your collection, considered'} action={!inventory && <button className="button button-primary" onClick={() => setEditing(null)} disabled={!categories.data?.length}><Icon name="plus" size={17} />New product</button>}>
      <p className="muted admin-panel-description">{inventory ? 'Adjustments change stock by a signed quantity. Each write is recorded, version-checked, and safe to retry.' : 'Manage the details your customers see. Add a category first, then a product and at least one active variant.'}</p>
      <div className="admin-filters"><label className="search-field"><Icon name="search" size={17} /><input type="search" aria-label={inventory ? 'Search inventory' : 'Search products'} value={search} onChange={event => filters(() => setSearch(event.target.value))} placeholder="Search product names or slugs…" maxLength={100} /></label><label className="sr-only" htmlFor="admin-category-filter">Filter by category</label><select id="admin-category-filter" value={category} onChange={event => filters(() => setCategory(event.target.value))}><option value="">All categories</option>{categories.data?.map(c => <option key={c.id} value={c.id}>{c.name}{!c.active ? ' (inactive)' : ''}</option>)}</select><label className="sr-only" htmlFor="admin-active-filter">Filter by visibility</label><select id="admin-active-filter" value={active} onChange={event => filters(() => setActive(event.target.value))}><option value="">All visibility</option><option value="true">Active products</option><option value="false">Inactive products</option></select>{inventory && <label className="admin-check"><input type="checkbox" checked={lowStock} onChange={event => filters(() => setLowStock(event.target.checked))} />Low stock only (≤5)</label>}</div>
      <ErrorNote error={categories.error || products.error} />
      {(categories.isError || products.isError) && <button className="text-button" onClick={() => { void categories.refetch(); void products.refetch(); }}>Retry catalog</button>}
      {products.isPending ? <p className="muted">Loading the catalog…</p> : <>
        <p className="admin-result-count">{products.data?.total || 0} product records{inventory ? ' · variants shown below' : ''}</p>
        <div className="admin-table-wrap"><table className="admin-table"><caption className="sr-only">{inventory ? 'Variant inventory for the current product page' : 'Products, visibility, variants, and prices'}</caption><thead><tr>{inventory ? <><th scope="col">Product / variant</th><th scope="col">SKU</th><th scope="col">On hand</th><th scope="col">Version</th><th scope="col">Action</th></> : <><th scope="col">Product</th><th scope="col">Category</th><th scope="col">Visibility</th><th scope="col">Price from</th><th scope="col">Action</th></>}</tr></thead><tbody>
          {products.data?.items.flatMap(product => inventory ? product.variants.filter(v => !lowStock || (v.active && v.stock <= 5)).map(variant => <tr key={variant.id}><td><strong>{product.name}</strong><small>{variant.name}{!variant.active ? ' · inactive variant' : ''}</small></td><td>{variant.sku}</td><td><span className={`admin-stock ${variant.stock <= 5 ? 'admin-stock-low' : ''}`}>{variant.stock}</span></td><td>{variant.version}</td><td><button className="text-button" onClick={() => setStock(variant)} aria-label={`Adjust stock for ${variant.sku}`}>Adjust<Icon name="plus" size={14} /></button></td></tr>) : [<tr key={product.id}><td><div className="admin-product-cell"><div className="admin-thumbnail"><ProductArt slug={product.slug} name={product.name} image={product.image_urls[0]} /></div><span><strong>{product.name}</strong><small>{product.variants.length} {product.variants.length === 1 ? 'variant' : 'variants'} · {product.slug}</small></span></div></td><td>{categories.data?.find(c => c.id === product.category_id)?.name || `Category ${product.category_id}`}</td><td><span className={`admin-pill ${product.active ? '' : 'admin-pill-muted'}`}>{product.active ? 'Active' : 'Inactive'}</span></td><td>{product.variants.length ? formatMoney(String(Math.min(...product.variants.map(v => Number(v.price)))), currency) : 'No variants'}</td><td><button className="text-button" onClick={() => setEditing(product)} aria-label={`Edit product ${product.name}`}>Edit<Icon name="diagonal" size={14} /></button></td></tr>])}
        </tbody></table>{products.data?.items.length === 0 && <p className="admin-empty">No matching products. Adjust the filters or add your first product.</p>}</div>
        <Pagination page={page} total={products.data?.total || 0} onChange={setPage} />
      </>}
    </Panel>
    {editing !== undefined && categories.data && <ProductEditor initial={editing} categories={categories.data} currency={currency} onClose={() => setEditing(undefined)} onChanged={onChanged} />}
    {stock && <StockEditor variant={stock} onClose={() => setStock(null)} onChanged={onChanged} />}
  </>;
}

function ProductEditor({ initial, categories, currency, onClose, onChanged }: { initial: AdminProduct | null; categories: AdminCategory[]; currency: string; onClose: () => void; onChanged: (message: string) => void }) {
  const [product, setProduct] = useState(initial);
  const [variant, setVariant] = useState<AdminVariant | null | undefined>();
  const [variantBusy, setVariantBusy] = useState(false);
  const action = useAction();
  return <Dialog title={product ? 'Edit product' : 'New product'} onClose={onClose} wide locked={action.busy || variantBusy}>
    <form className="admin-form" onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      void action.run(async () => {
        const result = await adminApi.saveProduct(product?.id || null, { name: text(data, 'name'), slug: text(data, 'slug'), category_id: Number(text(data, 'category_id')), description: text(data, 'description'), image_urls: parseImages(text(data, 'image_urls')), attributes: parsePairs(text(data, 'attributes')), active: data.has('active'), featured: data.has('featured') });
        setProduct(result); onChanged('Product saved.');
      });
    }}>
      <div className="field-pair"><Field label="Product name" name="name" defaultValue={product?.name} required maxLength={120} /><Field label="Product slug" name="slug" defaultValue={product?.slug} required maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" /></div>
      <label className="field">Product category<select name="category_id" defaultValue={product?.category_id || categories[0]?.id} required>{categories.map(c => <option key={c.id} value={c.id}>{c.name}{!c.active ? ' (inactive)' : ''}</option>)}</select></label>
      <Area label="Product description" name="description" value={product?.description} />
      <Area label="Photo URLs" name="image_urls" value={product?.image_urls.join('\n')} maxLength={20000} hint="One complete HTTPS photo URL per line, up to 10. Use only photos you have permission to publish; file uploads are not enabled." />
      <Area label="Product attributes" name="attributes" value={product ? printPairs(product.attributes) : ''} hint="One key=value pair per line, for example material=cotton. At most 20 pairs." />
      <div className="admin-checks"><Check label="Active product" name="active" checked={product?.active ?? true} /><Check label="Featured product" name="featured" checked={product?.featured ?? false} /></div>
      <ErrorNote error={action.error} /><button className="button button-primary" disabled={action.busy || variantBusy}>Save product<Icon name="check" size={18} /></button>
    </form>
    {product ? <section className="admin-variant-section"><div className="admin-panel-title"><h3>Variants & pricing</h3><button className="button button-secondary" disabled={variant !== undefined || action.busy} onClick={() => setVariant(null)}><Icon name="plus" size={16} />New variant</button></div><p className="fine-print">At least one active variant is needed to appear in the collection. Stock is adjusted separately under Inventory.</p>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th scope="col">Variant / SKU</th><th scope="col">Price</th><th scope="col">Stock</th><th scope="col">Action</th></tr></thead><tbody>{product.variants.map(v => <tr key={v.id}><td><strong>{v.name}{!v.active ? ' (inactive)' : ''}</strong><small>{v.sku}</small></td><td>{formatMoney(v.price, currency)}</td><td>{v.stock}</td><td><button className="text-button" disabled={variant !== undefined} onClick={() => setVariant(v)} aria-label={`Edit variant ${v.sku}`}>Edit</button></td></tr>)}</tbody></table></div>
      {variant !== undefined && <VariantEditor productId={product.id} variant={variant} onBusy={setVariantBusy} onCancel={() => setVariant(undefined)} onSaved={saved => { setProduct(p => p ? { ...p, variants: [...p.variants.filter(v => v.id !== saved.id), saved] } : p); setVariant(undefined); onChanged('Variant saved.'); }} />}
    </section> : <p className="notice">Save the product first, then add its variants, prices, and opening stock.</p>}
  </Dialog>;
}

function VariantEditor({ productId, variant, onBusy, onCancel, onSaved }: { productId: number; variant: AdminVariant | null; onBusy: (busy: boolean) => void; onCancel: () => void; onSaved: (variant: AdminVariant) => void }) {
  const action = useAction();
  return <form className="admin-form admin-variant-form" onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    void action.run(async () => {
      onBusy(true);
      try {
        const payload = { name: text(data, 'name'), price: text(data, 'price'), options: parsePairs(text(data, 'options')), active: data.has('active') };
        const result = variant ? await adminApi.updateVariant(variant.id, { ...payload, expected_version: variant.version }) : await adminApi.createVariant(productId, { ...payload, sku: text(data, 'sku'), initial_stock: Number(text(data, 'stock')) });
        onSaved(result);
      } finally { onBusy(false); }
    });
  }}>
    <h3>{variant ? 'Edit variant' : 'New variant'}</h3>
    <div className="field-pair"><Field label="Variant name" name="name" defaultValue={variant?.name} required maxLength={100} /><Field label="SKU" name="sku" defaultValue={variant?.sku} required maxLength={80} readOnly={!!variant} /></div>
    <div className="field-pair"><Field label="Price" name="price" type="number" min="0" max="999999.99" step="0.01" defaultValue={variant?.price} required />{!variant && <Field label="Initial stock" name="stock" type="number" min="0" max="2000000000" step="1" defaultValue="0" required />}</div>
    <Area label="Variant options" name="options" value={variant ? printPairs(variant.options) : ''} hint="One key=value per line, for example size=M." />
    <Check label="Active variant" name="active" checked={variant?.active ?? true} />
    <ErrorNote error={action.error} /><div className="admin-form-actions"><button className="button button-primary" disabled={action.busy}>Save variant</button><button type="button" className="text-button" disabled={action.busy} onClick={onCancel}>Cancel variant edit</button></div>
    {variant && <p className="fine-print">Editing version {variant.version}. If it changed, close and reopen the product to load current data before retrying.</p>}
  </form>;
}

function StockEditor({ variant, onClose, onChanged }: { variant: AdminVariant; onClose: () => void; onChanged: (message: string) => void }) {
  const [saved, setSaved] = useState(() => { try { return { pending: pendingInventory(variant.id), error: null as unknown }; } catch (error) { return { pending: null, error }; } });
  const action = useAction();
  return <Dialog title={`Adjust stock · ${variant.sku}`} onClose={onClose} locked={action.busy}>
    <p className="muted">On hand: <strong>{variant.stock}</strong> · version {variant.version}. Use a positive number to add stock or a negative number to remove it.</p>
    {saved.pending && <p className="notice">A previous adjustment may have applied. Retry its original quantity and exact reason to recover the result. The original version is preserved.</p>}
    <ErrorNote error={saved.error} />
    <form className="admin-form" onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      void action.run(async () => {
        const delta = Number(text(data, 'delta'));
        if (!Number.isInteger(delta) || !delta) throw new Error('Quantity change must be a non-zero whole number.');
        try {
          await submitInventory(variant.id, { delta, expected_version: saved.pending?.expected_version || variant.version, reason: text(data, 'reason') }, (payload, key) => adminApi.adjust(variant.id, payload, key), undefined, !!saved.pending);
          onChanged('Inventory updated.'); onClose();
        } finally {
          try { setSaved({ pending: pendingInventory(variant.id), error: null }); } catch (error) { setSaved({ pending: null, error }); }
        }
      });
    }}>
      <Field label="Quantity change" name="delta" type="number" min="-2000000000" max="2000000000" step="1" defaultValue={saved.pending?.delta || ''} readOnly={!!saved.pending} required />
      <Field label="Adjustment reason" name="reason" required maxLength={250} />
      <ErrorNote error={action.error} /><button className="button button-primary" disabled={action.busy || !!saved.error}>Apply adjustment<Icon name="check" size={18} /></button>
      <p className="fine-print">After an uncertain result, don’t clear browser storage or start a different adjustment. Retry the same request or ask your operator to reconcile it.</p>
    </form>
  </Dialog>;
}
