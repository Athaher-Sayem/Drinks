import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from '../components/Dialog.tsx';
import { Icon } from '../components/Icon.tsx';
import { formatMoney, friendlyStatus } from '../lib/store.ts';
import { adminApi } from './api.ts';
import type { AdminOrder } from './api.ts';
import { nextStatuses } from './helpers.ts';
import { ErrorNote, Pagination, Panel, useAction } from './shared.tsx';

export function Orders({ onChanged }: { onChanged: (message: string) => void }) {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const query = new URLSearchParams({ limit: '20', offset: String(page * 20) });
  if (status) query.set('status', status);
  const orders = useQuery({ queryKey: ['admin', 'orders', query.toString()], queryFn: () => adminApi.orders(query.toString()), retry: false });
  return <>
    <Panel title="From a good find to a good day" action={<label className="field">Filter orders<select value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="">All statuses</option>{['pending', 'confirmed', 'processing', 'ready', 'dispatched', 'completed', 'cancelled'].map(value => <option key={value} value={value}>{friendlyStatus(value)}</option>)}</select></label>}>
      <p className="muted admin-panel-description">Review customer details, fulfillment, and the order timeline. Order totals do not mean payment was collected.</p>
      <ErrorNote error={orders.error} />{orders.isError && <button className="text-button" onClick={() => void orders.refetch()}>Retry orders</button>}
      {orders.isPending ? <p className="muted">Loading orders…</p> : <><div className="admin-table-wrap"><table className="admin-table"><caption className="sr-only">Store orders and fulfillment statuses</caption><thead><tr><th scope="col">Reference / placed</th><th scope="col">Customer</th><th scope="col">Fulfillment</th><th scope="col">Status</th><th scope="col">Total</th><th scope="col">Action</th></tr></thead><tbody>{orders.data?.items.map(order => <tr key={order.id}><td><strong>{order.id.slice(0, 8)}</strong><small>{new Date(order.created_at).toLocaleDateString()}</small></td><td>{order.customer_name}</td><td>{order.fulfillment}</td><td><span className="admin-pill">{friendlyStatus(order.status)}</span></td><td>{formatMoney(order.total, order.currency)}</td><td><button className="text-button" aria-label={`Open order ${order.id.slice(0, 8)}`} onClick={() => setSelected(order.id)}>Open<Icon name="diagonal" size={14} /></button></td></tr>)}</tbody></table>{orders.data?.items.length === 0 && <p className="admin-empty">No matching orders. New orders will appear here.</p>}</div><Pagination page={page} total={orders.data?.total || 0} onChange={setPage} /></>}
    </Panel>
    {selected && <OrderEditor id={selected} onClose={() => setSelected(null)} onChanged={onChanged} />}
  </>;
}

function OrderEditor({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: (message: string) => void }) {
  const query = useQuery({ queryKey: ['admin', 'order', id], queryFn: () => adminApi.order(id), staleTime: 0, retry: false });
  const [updated, setUpdated] = useState<AdminOrder | null>(null);
  const [success, setSuccess] = useState('');
  const action = useAction();
  const order = updated || query.data;
  const choices = order ? nextStatuses(order.status, order.fulfillment) : [];
  return <Dialog title={`Order ${id.slice(0, 8)}`} onClose={onClose} locked={action.busy}>
    <ErrorNote error={query.error} />{query.isError && <button className="text-button" onClick={() => void query.refetch()}>Reload order</button>}
    {!order ? <p className="muted">Loading order…</p> : <>
      <div className="order-status"><span className="admin-pill">{friendlyStatus(order.status)}</span><span>{order.fulfillment}</span></div><p className="order-id">Order reference<strong>{order.id}</strong></p>
      <div className="admin-order-contact"><strong>{order.customer_name}</strong><p>{order.email}<br />{order.phone}</p>{order.address && <address>{order.address.line1}<br />{order.address.line2 && <>{order.address.line2}<br /></>}{order.address.city}, {order.address.region} {order.address.postal_code}<br />{order.address.country}</address>}{order.notes && <p><strong>Order notes:</strong> {order.notes}</p>}</div>
      <ul className="receipt-items">{order.items.map((item, index) => <li key={index}><span>{item.product_name}<small>{item.variant_name} × {item.quantity} · {item.sku}</small></span><strong>{formatMoney(item.line_total, order.currency)}</strong></li>)}</ul>
      <div className="totals"><div><span>Subtotal</span><span>{formatMoney(order.subtotal, order.currency)}</span></div><div><span>Tax</span><span>{formatMoney(order.tax, order.currency)}</span></div><div><span>Fulfillment</span><span>{formatMoney(order.fulfillment_fee, order.currency)}</span></div><div className="total-final"><strong>Order total</strong><strong>{formatMoney(order.total, order.currency)}</strong></div></div>
      {choices.length > 0 && <form className="admin-form" key={order.status} onSubmit={event => {
        event.preventDefault(); const status = String(new FormData(event.currentTarget).get('status'));
        void action.run(async () => { const result = await adminApi.status(id, status); setUpdated(result); setSuccess('Order status updated.'); onChanged('Order status updated.'); });
      }}><label className="field">Next order status<select name="status" required>{choices.map(value => <option key={value} value={value}>{friendlyStatus(value)}</option>)}</select></label><p className="fine-print">Cancelling restores reserved order inventory once. Dispatched or completed orders cannot be cancelled.</p><button className="button button-primary" disabled={action.busy}>Update order status</button></form>}
      <ErrorNote error={action.error} />{success && <p className="success-message" role="status">{success}</p>}
      <h3 className="small-heading admin-timeline-heading">Order timeline</h3><ol className="admin-timeline">{order.events.map((event, index) => <li key={index}><span>{friendlyStatus(event.status)}</span><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time></li>)}</ol>
      <p className="checkout-note"><Icon name="shield" size={16} />No payment was collected online.</p>
    </>}
  </Dialog>;
}
