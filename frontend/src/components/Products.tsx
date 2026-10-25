import { useState } from 'react';
import { errorMessage } from '../lib/api.ts';
import type { Product, Store } from '../lib/types.ts';
import { firstAvailable, formatMoney, startingPrice } from '../lib/store.ts';
import { Dialog } from './Dialog.tsx';
import { Icon } from './Icon.tsx';
import { ProductArt } from './ProductArt.tsx';

export function ProductCard({ product, category, currency, busy, onView, onAdd }: { product: Product; category: string; currency: string; busy: boolean; onView: () => void; onAdd: (id: number) => Promise<void> }) {
  const variant = firstAvailable(product);
  return <article className="product-card">
    <button className="product-image-button" onClick={onView} aria-label={`View ${product.name}`}><ProductArt slug={product.slug} name={product.name} image={product.image_urls[0]} /><span className="image-pill">{category}</span><span className="image-open"><Icon name="diagonal" size={18} /></span></button>
    <div className="product-card-info"><div><p className="product-category">{category}</p><h3><button onClick={onView}>{product.name}</button></h3><p className="product-caption">{Object.values(product.attributes).slice(0, 2).join(' / ') || 'A little something for your everyday.'}</p></div><div className="product-price"><strong>{Number.isFinite(startingPrice(product)) ? formatMoney(String(startingPrice(product)), currency) : 'Coming soon'}</strong></div></div>
    <button className="add-button" disabled={!variant || busy} onClick={() => product.variants.length > 1 ? onView() : variant && void onAdd(variant.id)} aria-label={`Add ${product.name} to bag`}><span>{!variant ? 'Currently unavailable' : product.variants.length > 1 ? 'Choose an option' : 'Add to bag'}</span><Icon name="plus" size={18} /></button>
  </article>;
}

export function ProductDialog({ product, store, busy, onClose, onAdd }: { product: Product; store: Store; busy: boolean; onClose: () => void; onAdd: (id: number) => Promise<void> }) {
  const [variantId, setVariantId] = useState(firstAvailable(product)?.id || product.variants[0]?.id);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(false);
  const variant = product.variants.find(v => v.id === variantId);
  async function add() {
    if (!variant) return;
    setError(''); setAdded(false);
    try { await onAdd(variant.id); setAdded(true); }
    catch (e) { setError(errorMessage(e)); }
  }
  return <Dialog title={product.name} onClose={onClose} wide>
    <div className="product-detail"><ProductArt slug={product.slug} name={product.name} image={product.image_urls[0]} /><div className="product-detail-copy"><span className="section-kicker">A closer look</span><h3>{product.name}</h3><p className="detail-price">{variant ? formatMoney(variant.price, store.currency) : 'Not available yet'}</p><p className="muted">{product.description || 'Explore the details and choose the option that suits you.'}</p>{product.variants.length > 0 && <label className="field">Choose your option<select value={variantId} onChange={e => { setVariantId(Number(e.target.value)); setAdded(false); }}>{product.variants.map(v => <option key={v.id} value={v.id}>{v.name}{!v.in_stock ? ' — unavailable' : ''}</option>)}</select></label>}<dl className="attributes">{Object.entries({ ...product.attributes, ...variant?.options }).map(([key, value]) => <div key={key}><dt>{key.replace(/_/g, ' ')}</dt><dd>{value}</dd></div>)}</dl><button className="button button-primary full-width" disabled={busy || !variant?.in_stock} onClick={() => void add()}><Icon name="bag" />{variant?.in_stock ? 'Add to bag' : 'Currently unavailable'}</button>{error && <p className="error-message" role="alert">{error}</p>}{added && <p className="success-message" role="status">Added to your bag.</p>}<p className="fine-print">Artwork is illustrative when a product photo is unavailable.</p></div></div>
  </Dialog>;
}
