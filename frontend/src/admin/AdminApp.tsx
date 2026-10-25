import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, refreshSession } from '../lib/api.ts';
import { BrandMark, Icon } from '../components/Icon.tsx';
import { adminApi } from './api.ts';
import { Categories } from './Categories.tsx';
import { Catalog } from './Catalog.tsx';
import { Orders } from './Orders.tsx';
import { Settings } from './Settings.tsx';
import { ErrorNote, Field, Panel } from './shared.tsx';
import './admin.css';

type View = 'overview' | 'products' | 'categories' | 'inventory' | 'orders' | 'settings';
type Session = Awaited<ReturnType<typeof refreshSession>>;
const navigation = [
  { id: 'overview', label: 'Overview', icon: 'diagonal' },
  { id: 'products', label: 'Products', icon: 'box' },
  { id: 'categories', label: 'Categories', icon: 'leaf' },
  { id: 'inventory', label: 'Inventory', icon: 'bag' },
  { id: 'orders', label: 'Orders', icon: 'truck' },
  { id: 'settings', label: 'Store settings', icon: 'shield' },
] as const;

export default function AdminApp() {
  const client = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<View>('overview');
  const reconciling = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const staff = session?.user && ['staff', 'admin'].includes(session.user.role);
  const store = useQuery({ queryKey: ['admin', 'store'], queryFn: adminApi.store, enabled: !!staff, retry: false });

  const reconcile = useCallback(async () => {
    if (reconciling.current) return;
    reconciling.current = true;
    setLoading(true); setSession(null); setNotice('');
    await client.cancelQueries({ queryKey: ['admin'] });
    client.removeQueries({ queryKey: ['admin'] });
    try { const fresh = await refreshSession(); setSession(fresh); setError(null); }
    catch (e) { setError(e); }
    finally { setLoading(false); reconciling.current = false; }
  }, [client]);
  useEffect(() => {
    document.title = 'Store administration';
    void reconcile();
    const changed = () => { void reconcile(); };
    const storageChanged = (event: StorageEvent) => { if (event.key === 'store.auth.changed') void reconcile(); };
    window.addEventListener('store:admin-access-changed', changed);
    window.addEventListener('store:auth-changed', changed);
    window.addEventListener('storage', storageChanged);
    return () => {
      window.removeEventListener('store:admin-access-changed', changed);
      window.removeEventListener('store:auth-changed', changed);
      window.removeEventListener('storage', storageChanged);
    };
  }, [reconcile]);
  useEffect(() => {
    if (!session?.user) return;
    let active = true;
    let checking = false;
    const user = session.user;
    const verify = async () => {
      if (checking || reconciling.current) return;
      checking = true;
      try {
        const fresh = await refreshSession();
        if (active && (!fresh.user || fresh.user.id !== user.id || fresh.user.role !== user.role)) await reconcile();
      } catch { if (active) await reconcile(); }
      finally { checking = false; }
    };
    const focused = () => { void verify(); };
    const visible = () => { if (document.visibilityState === 'visible') void verify(); };
    window.addEventListener('focus', focused);
    document.addEventListener('visibilitychange', visible);
    const timer = setInterval(visible, 30000);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', focused); document.removeEventListener('visibilitychange', visible); };
  }, [session?.user, reconcile]);
  useEffect(() => { heading.current?.focus(); }, [view]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(null);
    let failure: unknown = null;
    try { await api.login(String(data.get('email')), String(data.get('password'))); }
    catch (e) { failure = e; }
    await reconcile();
    if (failure) setError(failure);
    setBusy(false);
  }
  async function logout() {
    setBusy(true); setLoading(true); setSession(null);
    try { await api.logout(); }
    catch (e) { setError(e); }
    finally { await reconcile(); setBusy(false); }
  }
  function navigate(next: View) { setNotice(''); setView(next); }
  function changed(message: string) {
    setNotice(message);
    void client.invalidateQueries({ queryKey: ['admin'] });
    void client.invalidateQueries({ queryKey: ['products'] });
    void client.invalidateQueries({ queryKey: ['snapshot'] });
    void client.invalidateQueries({ queryKey: ['categories'] });
    void client.invalidateQueries({ queryKey: ['store'] });
  }

  if (loading) return <main className="admin-login"><BrandMark /><h1>Opening your workspace.</h1><p>Checking your store access…</p></main>;
  if (!session?.user) return <main className="admin-login">
    <a className="brand" href="/"><BrandMark /><span>Store workspace.</span></a>
    <div className="admin-login-card"><span className="section-kicker">For the people behind the store</span><h1>A good place to get things done.</h1><p className="muted">Sign in with your existing staff or owner account.</p>
      <form className="account-form" onSubmit={event => void login(event)}>
        <Field label="Email address" name="email" type="email" autoComplete="username" required maxLength={254} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required maxLength={128} />
        <ErrorNote error={error} />
        <button className="button button-primary full-width" disabled={busy}>Sign in to administration<Icon name="arrow" /></button>
      </form>
      {!!error && <button className="text-button" onClick={() => void reconcile()}>Reconnect to the store</button>}
      <p className="fine-print">There is no public admin registration. Your operator creates owner accounts through the backend CLI.</p>
    </div><a className="text-button" href="/"><Icon name="back" size={16} />Back to the storefront</a>
  </main>;
  if (!staff) return <main className="admin-login"><BrandMark /><h1>Staff access required</h1><p>This customer account cannot access store administration.</p><button className="button button-secondary" onClick={() => void logout()} disabled={busy}>Sign out</button><a className="text-button" href="/">Return to the storefront</a></main>;

  return <div className="admin-layout">
    <a className="skip-link" href="#admin-main">Skip to workspace</a>
    <aside className="admin-sidebar">
      <a className="brand" href="/"><BrandMark /><span>{store.data?.name || 'Your store'}.</span></a>
      <span className="admin-workspace-label">Store workspace</span>
      <nav aria-label="Administration">{navigation.filter(item => item.id !== 'settings' || session.user?.role === 'admin').map(item => <button key={item.id} aria-label={item.label} aria-current={view === item.id ? 'page' : undefined} className={view === item.id ? 'admin-nav-active' : ''} onClick={() => navigate(item.id)}><Icon name={item.icon} size={19} />{item.label}{item.id === 'settings' && <span className="admin-owner-tag">Owner</span>}</button>)}</nav>
      <div className="admin-sidebar-bottom"><a href="/" className="text-button">View storefront<Icon name="diagonal" size={15} /></a><p>One store. Your way.</p></div>
    </aside>
    <div className="admin-workspace">
      <header className="admin-topbar"><span>Administration <span className="admin-divider">/</span> {navigation.find(item => item.id === view)?.label}</span><div><span>{session.user.name}<small>{session.user.role === 'admin' ? 'Store owner' : 'Staff'}</small></span><button className="text-button" disabled={busy} onClick={() => void logout()}>Sign out</button></div></header>
      <main id="admin-main" className="admin-main">
        <div className="admin-page-heading"><div><span className="section-kicker">A little order behind the everyday</span><h1 ref={heading} tabIndex={-1}>{view === 'overview' ? 'Store overview' : navigation.find(item => item.id === view)?.label}</h1></div><span className="admin-environment"><i />Connected to your store</span></div>
        {notice && <div className="admin-notice" role="status"><Icon name="check" size={18} />{notice}<button className="icon-button" aria-label="Dismiss update" onClick={() => setNotice('')}><Icon name="close" size={16} /></button></div>}
        <ErrorNote error={store.error} />
        {view === 'overview' && <Overview onNavigate={navigate} />}
        {view === 'categories' && <Categories onChanged={changed} />}
        {(view === 'products' || view === 'inventory') && <Catalog key={view} inventory={view === 'inventory'} currency={store.data?.currency || 'USD'} onChanged={changed} />}
        {view === 'orders' && <Orders onChanged={changed} />}
        {view === 'settings' && session.user.role === 'admin' && <Settings onChanged={changed} />}
        <footer className="admin-footer">Your store, thoughtfully managed.<span>No online payments are collected.</span></footer>
      </main>
    </div>
  </div>;
}

function Overview({ onNavigate }: { onNavigate: (view: View) => void }) {
  const query = useQuery({ queryKey: ['admin', 'overview'], queryFn: adminApi.overview, retry: false });
  if (query.isPending) return <p className="muted">Loading your store’s latest counts…</p>;
  if (query.isError) return <><ErrorNote error={query.error} /><button className="button button-secondary" onClick={() => void query.refetch()}>Retry overview</button></>;
  const data = query.data;
  return <>
    <p className="admin-intro">The essentials at a glance. A clear view of what needs your attention.</p>
    <div className="admin-metrics">
      <button onClick={() => onNavigate('products')}><span><Icon name="box" />Catalog products</span><strong>{data.products}</strong><small>{data.active_products} active product records</small></button>
      <button onClick={() => onNavigate('orders')}><span><Icon name="truck" />Open orders</span><strong>{data.open_orders}</strong><small>{data.pending_orders} awaiting confirmation</small></button>
      <button onClick={() => onNavigate('inventory')}><span><Icon name="bag" />Stock alerts</span><strong>{data.low_stock_variants}</strong><small>Active variants with 5 or fewer units</small></button>
    </div>
    <div className="admin-overview-grid"><Panel title="Make room for your next good find"><p className="muted">Keep product details clear, photos current, and variants easy to choose. Your storefront updates from the same catalog.</p><button className="button button-primary" onClick={() => onNavigate('products')}>Manage products<Icon name="arrow" size={18} /></button></Panel><Panel title="A few useful reminders"><ul className="admin-reminders"><li><Icon name="shield" /><span>Inventory changes are versioned and recorded with a reason.</span></li><li><Icon name="box" /><span>Deactivate products instead of deleting records linked to orders.</span></li><li><Icon name="check" /><span>Order totals are snapshots, not proof of payment.</span></li></ul></Panel></div>
  </>;
}
