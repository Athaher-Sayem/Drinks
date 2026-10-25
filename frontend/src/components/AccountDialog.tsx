import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api.ts';
import { hasPendingCheckout } from '../lib/checkout.ts';
import { formatMoney, friendlyStatus } from '../lib/store.ts';
import type { Order, User } from '../lib/types.ts';
import { Dialog } from './Dialog.tsx';
import { Icon } from './Icon.tsx';
import { OrderSummary } from './OrderSummary.tsx';

export function AccountDialog({ user, onClose, onChange }: {
  user: User | null | undefined; onClose: () => void; onChange: () => Promise<User | null>;
}) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);
  const orders = useQuery({ queryKey: ['orders', user?.id], queryFn: api.orders, enabled: !!user, retry: false });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true); setError(''); setNotice('');
    try {
      const email = String(fields.get('email'));
      const password = String(fields.get('password'));
      if (register) {
        await api.register(String(fields.get('name')), email, password);
        setRegister(false); form.reset(); setNotice('Your account is ready. Sign in to continue.');
      } else {
        await api.login(email, password);
        await onChange();
      }
    } catch (e) {
      setError(errorMessage(e));
      if (!register) {
        // The cookie may have rotated even if the login response was lost.
        try { if (await onChange()) setError(''); } catch { /* Keep the connection error. */ }
      }
    } finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true); setError(''); setSelected(null);
    try { await api.logout(); }
    catch (e) { setError(errorMessage(e)); }
    finally {
      // Hide private cached data before reconciling even when the mutation timed out.
      try { if (!await onChange()) setError(''); }
      catch { setError('Private account details are hidden, but sign-out could not be confirmed. Reconnect and reload before leaving a shared device.'); }
      setBusy(false);
    }
  }

  return <Dialog title={user ? 'Your account' : register ? 'A place for your favorites' : 'Welcome back'} onClose={onClose} locked={busy}>
    {user ? <>
      <div className="account-intro"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><div><h3>Hello, {user.name.split(' ')[0]}.</h3><p className="muted">{user.email}</p></div></div>
      {selected ? <>
        <button className="text-button" onClick={() => setSelected(null)}><Icon name="back" size={16} />All orders</button>
        <OrderSummary order={selected} onCancelled={() => void orders.refetch()} />
      </> : <>
        <h3 className="small-heading">Your orders</h3>
        {orders.isPending ? <p className="muted">Loading your orders…</p> : orders.isError ?
          <div className="error-message" role="alert">{errorMessage(orders.error)} <button className="text-button" onClick={() => void orders.refetch()}>Try again</button></div> :
          orders.data?.items.length ? <div className="account-orders">
            {orders.data.items.map(order => <button key={order.id} className="order-row" onClick={() => setSelected(order)}>
              <span><strong>Order {order.id.slice(0, 8)}</strong><small>{new Date(order.created_at).toLocaleDateString()} · {friendlyStatus(order.status)}</small></span>
              <span>{formatMoney(order.total, order.currency)}<Icon name="diagonal" size={16} /></span>
            </button>)}
            {orders.data.total > orders.data.items.length && <p className="fine-print">Showing your latest {orders.data.items.length} orders.</p>}
          </div> : <p className="muted">No orders yet. Your next good find is waiting in the collection.</p>}
      </>}
      {['staff', 'admin'].includes(user.role) && <a className="button button-primary full-width" href="/admin">Open store workspace<Icon name="diagonal" size={17} /></a>}
      <button className="button button-secondary full-width" disabled={busy} onClick={() => void logout()}>{busy ? 'Signing out…' : 'Sign out'}</button>
      {hasPendingCheckout() && <p className="fine-print">Signing out won’t clear your pending checkout. Recover it first if possible; otherwise contact the store before ordering again.</p>}
    </> : <>
      <p className="muted">{register ? 'Keep your collection of orders in one simple place.' : 'Your good things, all in one place.'}</p>
      <form className="account-form" onSubmit={event => void submit(event)}>
        {register && <label className="field" htmlFor="account-name">Your name<input id="account-name" name="name" autoComplete="name" required maxLength={120} /></label>}
        <label className="field" htmlFor="account-email">Email address<input id="account-email" name="email" type="email" autoComplete="email" required maxLength={254} /></label>
        <label className="field" htmlFor="account-password">Password<input id="account-password" name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 12 : 1} maxLength={128} required /></label>
        {register && <p className="fine-print">Use at least 12 characters. Avoid common or all-number passwords.</p>}
        <button className="button button-primary full-width" disabled={busy} type="submit">{busy ? 'One moment…' : register ? 'Create account' : 'Sign in'}<Icon name="arrow" /></button>
      </form>
      <p className="account-switch">{register ? 'Already have an account?' : 'New here?'} <button className="text-button" disabled={busy} onClick={() => { setRegister(!register); setError(''); setNotice(''); }}>{register ? 'Sign in' : 'Create an account'}</button></p>
    </>}
    {notice && <p className="success-message" role="status">{notice}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </Dialog>;
}

export function TrackingDialog({ onClose }: { onClose: () => void }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const key = String(fields.get('key')).trim();
      setOrder(await api.lookup(String(fields.get('reference')).trim(), key)); setToken(key);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <Dialog title="Find your order" onClose={onClose} locked={busy}>
    {order ? <>
      <button className="text-button" onClick={() => { setOrder(null); setToken(''); }}><Icon name="back" size={16} />Look up another order</button>
      <OrderSummary order={order} token={token} />
    </> : <>
      <p className="muted">Use the reference and private lookup key you saved after checkout. Signed-in customers can also check their account.</p>
      <form className="account-form" onSubmit={event => void lookup(event)}>
        <label className="field" htmlFor="order-reference">Order reference<input id="order-reference" name="reference" required maxLength={36} autoComplete="off" /></label>
        <label className="field" htmlFor="lookup-key">Private lookup key<input id="lookup-key" name="key" type="password" required maxLength={128} autoComplete="off" /></label>
        {error && <p role="alert" className="error-message">{error}</p>}
        <button className="button button-primary full-width" disabled={busy}>{busy ? 'Finding your order…' : 'Find order'}<Icon name="search" /></button>
      </form>
    </>}
  </Dialog>;
}
