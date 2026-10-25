import { useState } from 'react';
import { api, errorMessage } from '../lib/api.ts';
import { formatMoney, friendlyStatus } from '../lib/store.ts';
import type { Order, Receipt } from '../lib/types.ts';
import { Icon } from './Icon.tsx';

export function OrderSummary({ order: initial, token, confirmation = false, onCancelled }: { order: Order; token?: string | null; confirmation?: boolean; onCancelled?: () => void }) {
  const [order, setOrder] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function cancel() {
    setBusy(true); setError('');
    try { setOrder(await api.cancelOrder(order.id, token)); onCancelled?.(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  function saveReceipt() {
    const lines = [`Order ${order.id}`, `Status: ${friendlyStatus(order.status)}`, `Total: ${formatMoney(order.total, order.currency)}`, 'No payment was taken.', ...(token ? [`Private lookup key: ${token}`, 'Keep this key private. It allows access to this order.'] : [])];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
    const link = document.createElement('a'); link.href = url; link.download = `order-${order.id.slice(0, 8)}.txt`; link.click(); URL.revokeObjectURL(url);
  }
  return <div className="order-summary">
    {confirmation && <div className="receipt-intro" role="status"><span className="success-icon"><Icon name="check" size={26} /></span><h3 tabIndex={-1}>Your good things are on their way.</h3><p>The store has received your order. No payment was taken.</p></div>}
    <div className="order-status"><span className={`status-pill status-${order.status}`}>{friendlyStatus(order.status)}</span><span>{new Date(order.created_at).toLocaleDateString()}</span></div>
    <p className="order-id">Order reference <strong>{order.id}</strong></p>
    <ul className="receipt-items">{order.items.map((item, index) => <li key={`${item.sku}-${index}`}><span>{item.product_name}<small>{item.variant_name} × {item.quantity}</small></span><strong>{formatMoney(item.line_total, order.currency)}</strong></li>)}</ul>
    <div className="totals"><div><span>Subtotal</span><span>{formatMoney(order.subtotal, order.currency)}</span></div><div><span>Tax</span><span>{formatMoney(order.tax, order.currency)}</span></div><div><span>{order.fulfillment === 'pickup' ? 'Pickup' : 'Fulfillment'}</span><span>{formatMoney(order.fulfillment_fee, order.currency)}</span></div><div className="total-final"><strong>Total</strong><strong>{formatMoney(order.total, order.currency)}</strong></div></div>
    {token && <div className="lookup-notice"><Icon name="shield" /><div><strong>Keep your order reference safe.</strong><p>Save the reference and private lookup key to check your order later. They aren’t saved in this browser.</p><button className="text-button" onClick={saveReceipt}>Save order details <Icon name="diagonal" size={15} /></button></div></div>}
    {order.status === 'cancelled' ? <p className="success-message" role="status">Order cancelled. No payment was taken.</p> : order.status === 'pending' && <button className="text-button cancel-button" onClick={() => void cancel()} disabled={busy}>{busy ? 'Cancelling…' : 'Cancel this order'}</button>}
    {error && <p role="alert" className="error-message">{error}</p>}
  </div>;
}

export function receiptToken(order: Receipt) { return order.lookup_token; }
