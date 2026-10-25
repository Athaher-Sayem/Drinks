import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, errorMessage } from '../lib/api.ts';
import { hasPendingCheckout, submitCheckout } from '../lib/checkout.ts';
import { formatMoney, normalizePhone } from '../lib/store.ts';
import type { Checkout as CheckoutData, Quote, Receipt, Store, User } from '../lib/types.ts';
import { Icon } from './Icon.tsx';
import { OrderSummary } from './OrderSummary.tsx';

export function Checkout({ store, user, onBack, onOrdered, setLocked }: {
  store: Store; user?: User | null; onBack: () => void; onOrdered: () => void; setLocked: (locked: boolean) => void;
}) {
  const [review, setReview] = useState<{ payload: CheckoutData; quote: Quote } | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [draft, setDraft] = useState<CheckoutData | null>(null);
  const [fulfillment, setFulfillment] = useState<CheckoutData['fulfillment']>(store.pickup_enabled ? 'pickup' : store.shipping_enabled ? 'shipping' : 'delivery');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const step = useRef<HTMLDivElement>(null);
  const pending = hasPendingCheckout();

  useEffect(() => { step.current?.querySelector<HTMLElement>('h3')?.focus(); }, [review, receipt]);

  function lock(value: boolean) { setBusy(value); setLocked(value); }
  async function submit(payload: CheckoutData, mode: 'reviewed' | 'recovery' = 'reviewed') {
    const result = await submitCheckout(payload, api.placeOrder, undefined, mode);
    setReceipt(result);
    onOrdered();
  }
  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); lock(true);
    try {
      const fields = new FormData(event.currentTarget);
      const get = (name: string) => String(fields.get(name) || '').trim();
      const payload: CheckoutData = {
        customer_name: get('name'), email: get('email'), phone: normalizePhone(get('phone'), store.country), fulfillment, notes: get('notes'),
      };
      if (fulfillment !== 'pickup') payload.address = {
        line1: get('line1'), line2: get('line2'), city: get('city'), region: get('region'), postal_code: get('postal_code'), country: store.country,
      };
      setDraft(payload);
      if (hasPendingCheckout()) {
        // Replay before quoting: a successful-but-lost response may have emptied the cart.
        await submit(payload, 'recovery');
      } else {
        const quote = await api.quote(payload);
        setReview({ payload: { ...payload, quote_token: quote.quote_token }, quote });
      }
    } catch (e) { setError(errorMessage(e)); }
    finally { lock(false); }
  }
  async function place() {
    if (!review || busy) return;
    setError(''); lock(true);
    try { await submit(review.payload); }
    catch (e) { setError(errorMessage(e)); }
    finally { lock(false); }
  }

  if (receipt) return <div ref={step}><OrderSummary order={receipt} token={receipt.lookup_token} confirmation /></div>;
  if (review) return <div className="checkout-review" ref={step}>
    <button className="text-button" onClick={() => { setReview(null); setError(''); }} disabled={busy || pending}><Icon name="back" size={16} />Edit details</button>
    <h3 tabIndex={-1}>One last look.</h3>
    <p className="muted">{review.payload.customer_name} · {review.payload.email}</p>
    <p className="muted">{fulfillment === 'pickup' ? 'Pickup from the store' : fulfillment === 'shipping' ? 'Ship to your address' : 'Local delivery'}</p>
    <ul className="receipt-items">{review.quote.cart.items.map(i => <li key={i.variant_id}><span>{i.product_name}<small>{i.variant_name} × {i.quantity}</small></span><strong>{formatMoney(i.line_total, store.currency)}</strong></li>)}</ul>
    <div className="totals">
      <div><span>Subtotal</span><span>{formatMoney(review.quote.subtotal, store.currency)}</span></div>
      <div><span>Tax</span><span>{formatMoney(review.quote.tax, store.currency)}</span></div>
      <div><span>{fulfillment === 'pickup' ? 'Pickup' : 'Fulfillment'}</span><span>{formatMoney(review.quote.fulfillment_fee, store.currency)}</span></div>
      <div className="total-final"><strong>Order total</strong><strong>{formatMoney(review.quote.total, store.currency)}</strong></div>
    </div>
    <p className="checkout-note"><Icon name="shield" size={18} />No payment details needed. This submits your order to the store.</p>
    {pending && <p className="notice">A previous attempt may have reached the store. Retrying uses the same reference to avoid a duplicate. Don’t start another order until this is resolved.</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    <button className="button button-primary full-width" onClick={() => void place()} disabled={busy}>{busy ? 'Submitting your order…' : 'Place order — no payment'}<Icon name="arrow" /></button>
  </div>;

  return <form onSubmit={event => void prepare(event)} className="checkout-form">
    <button className="text-button" type="button" onClick={onBack} disabled={busy}><Icon name="back" size={16} />Back to your bag</button>
    <div><h3>{pending ? 'Recover your previous order.' : 'Let’s make it yours.'}</h3><p className="muted">{pending ? 'Re-enter the exact details from your earlier attempt.' : 'A few details, then you can review your order.'}</p></div>
    {pending && <p className="notice">An earlier order may have been submitted. Use the same details to recover its receipt. If you can’t recover it, contact the store before placing another order.</p>}
    <label className="field" htmlFor="checkout-name">Full name<input id="checkout-name" name="name" autoComplete="name" defaultValue={draft?.customer_name || user?.name} maxLength={120} required /></label>
    <label className="field" htmlFor="checkout-email">Email address<input id="checkout-email" name="email" type="email" autoComplete="email" defaultValue={draft?.email || user?.email} maxLength={254} required /></label>
    <label className="field" htmlFor="checkout-phone">Phone number<input id="checkout-phone" name="phone" type="tel" autoComplete="tel" defaultValue={draft?.phone} placeholder={store.country === 'US' ? '(202) 555-0142' : '+44 20 7946 0958'} required maxLength={30} /></label>
    <label className="field" htmlFor="fulfillment">How would you like it?<select id="fulfillment" value={fulfillment} onChange={e => setFulfillment(e.target.value as CheckoutData['fulfillment'])}>
      {(pending || store.pickup_enabled) && <option value="pickup">Pick up from the store</option>}
      {(pending || store.shipping_enabled) && <option value="shipping">Ship to my address</option>}
      {(pending || store.delivery_postal_codes.length > 0) && <option value="delivery">Local delivery</option>}
    </select></label>
    {fulfillment !== 'pickup' && <fieldset className="address-fields"><legend>{fulfillment === 'shipping' ? 'Shipping address' : 'Delivery address'}</legend>
      <label className="field" htmlFor="line1">Street address<input id="line1" name="line1" autoComplete="address-line1" defaultValue={draft?.address?.line1} maxLength={200} required /></label>
      <label className="field" htmlFor="line2">Apartment, suite, etc. <span className="optional">Optional</span><input id="line2" name="line2" autoComplete="address-line2" defaultValue={draft?.address?.line2} maxLength={200} /></label>
      <div className="field-pair"><label className="field" htmlFor="city">City<input id="city" name="city" autoComplete="address-level2" defaultValue={draft?.address?.city} maxLength={100} required /></label><label className="field" htmlFor="region">State / region<input id="region" name="region" autoComplete="address-level1" defaultValue={draft?.address?.region} maxLength={100} required /></label></div>
      <label className="field" htmlFor="postal_code">ZIP / postal code<input id="postal_code" name="postal_code" autoComplete="postal-code" defaultValue={draft?.address?.postal_code} maxLength={20} required /></label>
      <p className="fine-print">Delivering within {store.country}. Availability and fees are checked before you order.</p>
    </fieldset>}
    <label className="field" htmlFor="checkout-notes">Order notes <span className="optional">Optional</span><textarea id="checkout-notes" name="notes" defaultValue={draft?.notes} maxLength={500} rows={2} placeholder="Anything the store should know?" /></label>
    {error && <p className="error-message" role="alert">{error}</p>}
    <button className="button button-primary full-width" type="submit" disabled={busy}>{busy ? 'Checking your order…' : pending ? 'Recover previous order' : 'Review order'}<Icon name="arrow" /></button>
    <p className="fine-print centered">No payment will be requested or collected.</p>
  </form>;
}
