import { useState } from 'react';
import { errorMessage } from '../lib/api.ts';
import { hasPendingCheckout } from '../lib/checkout.ts';
import { formatMoney } from '../lib/store.ts';
import type { Cart, Store, User } from '../lib/types.ts';
import { Checkout } from './Checkout.tsx';
import { Dialog } from './Dialog.tsx';
import { Icon } from './Icon.tsx';
import { ProductArt } from './ProductArt.tsx';

export function CartDialog({ cart, store, user, busy, loadError, onRetry, onClose, onChange, onOrdered }: { cart: Cart | undefined; store: Store; user?: User | null; busy: boolean; loadError?: unknown; onRetry: () => void; onClose: () => void; onChange: (id: number, quantity: number) => Promise<void>; onOrdered: () => void }) {
  const [checkout, setCheckout] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const pending = hasPendingCheckout();
  const canOrder = store.tax_rate !== null && (store.pickup_enabled || store.shipping_enabled || store.delivery_postal_codes.length > 0);
  async function change(id: number, quantity: number) {
    setError(''); try { await onChange(id, quantity); } catch (e) { setError(errorMessage(e)); }
  }
  return <Dialog title="Your bag" onClose={onClose} locked={locked}>
    {loadError && !checkout ? <div className="error-message" role="alert"><p>{errorMessage(loadError)}</p><button className="text-button" onClick={onRetry}>Retry connection</button></div> : null}
    {checkout && cart ? <Checkout store={store} user={user} onBack={() => setCheckout(false)} onOrdered={onOrdered} setLocked={setLocked} /> : <>
      {pending && <div className="notice"><p>A previous checkout may have reached the store. Recover its receipt before placing another order.</p><button className="button button-secondary full-width" disabled={!cart} onClick={() => setCheckout(true)}>Recover previous order</button></div>}
      {!cart ? <p className="muted">Loading your bag…</p> : cart.items.length === 0 ? <div className="empty-state"><span className="empty-icon"><Icon name="bag" size={32} /></span><h3>A little room for good things.</h3><p>Your bag is empty. Find something that feels like you.</p><button className="button button-primary" onClick={onClose}>Explore the collection <Icon name="arrow" /></button></div> : <><p className="muted bag-intro">A few good choices. All in one place.</p><ul className="bag-items">{cart.items.map(item => <li key={item.variant_id}><div className="bag-art"><ProductArt slug={item.product_slug} name={item.product_name} /></div><div className="bag-item-copy"><h3>{item.product_name}</h3><p>{item.variant_name}</p><strong>{formatMoney(item.line_total, cart.currency)}</strong>{!item.available && <p className="error-inline">No longer available in this quantity.</p>}<div className="quantity-row"><div className="quantity-control"><button disabled={busy || pending} onClick={() => void change(item.variant_id, item.quantity - 1)} aria-label={`Decrease ${item.product_name} quantity`}><Icon name="minus" size={14} /></button><span aria-label={`Quantity ${item.quantity}`}>{item.quantity}</span><button disabled={busy || pending || item.quantity >= 99} onClick={() => void change(item.variant_id, item.quantity + 1)} aria-label={`Increase ${item.product_name} quantity`}><Icon name="plus" size={14} /></button></div><button className="text-button remove-button" disabled={busy || pending} onClick={() => void change(item.variant_id, 0)}>Remove</button></div></div></li>)}</ul><div className="totals"><div className="total-final"><strong>Subtotal</strong><strong>{formatMoney(cart.subtotal, cart.currency)}</strong></div></div><p className="fine-print">Tax and any fulfillment fees are calculated before you place your order.</p>{error && <p className="error-message" role="alert">{error}</p>}{!canOrder && <p className="notice">This store isn’t accepting orders just yet. Please check back soon.</p>}<button className="button button-primary full-width" disabled={busy || !canOrder || cart.items.some(i => !i.available)} onClick={() => setCheckout(true)}>Continue to checkout <Icon name="arrow" /></button><p className="checkout-note"><Icon name="shield" size={16} />No payment collected at checkout.</p></>}
    </>}
  </Dialog>;
}
