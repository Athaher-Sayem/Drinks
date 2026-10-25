import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage, refreshSession } from './lib/api.ts';
import { hasPendingCheckout } from './lib/checkout.ts';
import type { Product } from './lib/types.ts';
import { AccountDialog, TrackingDialog } from './components/AccountDialog.tsx';
import { CartDialog } from './components/CartDialog.tsx';
import { Explorer } from './components/Explorer.tsx';
import { BrandMark, Icon } from './components/Icon.tsx';
import { ProductCard, ProductDialog } from './components/Products.tsx';

type Modal = 'bag' | 'account' | 'tracking' | Product | null;
const PAGE_SIZE = 12;

export default function App() {
  const client = useQueryClient();
  const [modal, setModal] = useState<Modal>(null);
  const [category, setCategory] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutationLock = useRef(false);
  const store = useQuery({ queryKey: ['store'], queryFn: ({ signal }) => api.store(signal) });
  const categories = useQuery({ queryKey: ['categories'], queryFn: ({ signal }) => api.categories(signal) });
  const snapshot = useQuery({ queryKey: ['snapshot'], queryFn: ({ signal }) => api.products('limit=100', signal) });
  const session = useQuery({ queryKey: ['session'], queryFn: refreshSession });
  const cart = useQuery({ queryKey: ['cart'], queryFn: api.cart, enabled: session.isSuccess });
  const slug = categories.data?.find(c => c.id === category)?.slug;
  const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
  if (slug) query.set('category', slug);
  if (search.trim()) query.set('search', search.trim());
  const products = useQuery({ queryKey: ['products', query.toString()], queryFn: ({ signal }) => api.products(query.toString(), signal), enabled: categories.isSuccess });
  const brand = import.meta.env.VITE_STOREFRONT_NAME || store.data?.name || 'The everyday store';
  const demoCatalog = snapshot.data?.items.some(product => product.attributes._demo_catalog === 'general-store-demo-v1');

  function selectCategory(id: number | null) { setCategory(id); setPage(0); }
  function announce(message: string) {
    setToast(message); if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 5000);
  }
  async function changeQuantity(id: number, quantity: number) {
    if (mutationLock.current) return;
    if (hasPendingCheckout()) throw new Error('Resolve your previous checkout attempt before changing your bag.');
    mutationLock.current = true; setBusy(true);
    try {
      if (quantity <= 0) { await api.removeItem(id); client.setQueryData(['cart'], await api.cart()); }
      else client.setQueryData(['cart'], await api.setQuantity(id, quantity));
    } finally { mutationLock.current = false; setBusy(false); }
  }
  async function add(id: number) {
    try {
      if (!session.isSuccess || !cart.data) throw new Error('Your bag is still connecting. Please try again in a moment.');
      const quantity = cart.data.items.find(i => i.variant_id === id)?.quantity || 0;
      await changeQuantity(id, quantity + 1); announce('A good choice. Added to your bag.');
    } catch (e) { announce(errorMessage(e)); throw e; }
  }
  async function accountChanged() {
    client.removeQueries({ queryKey: ['orders'] });
    client.removeQueries({ queryKey: ['cart'] });
    client.setQueryData<Awaited<ReturnType<typeof refreshSession>>>(['session'], previous => previous ? { ...previous, user: null } : previous);
    const fresh = await refreshSession();
    client.setQueryData(['session'], fresh);
    client.removeQueries({ queryKey: ['orders'] });
    client.setQueryData(['cart'], await api.cart());
    return fresh.user;
  }
  function ordered() {
    void client.invalidateQueries({ queryKey: ['cart'] });
    void client.invalidateQueries({ queryKey: ['orders'] });
    void client.invalidateQueries({ queryKey: ['snapshot'] });
    void client.invalidateQueries({ queryKey: ['products'] });
  }
  const bootError = store.error || categories.error || snapshot.error;
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <div className="announcement-bar"><span>A little less ordinary. A little more you.</span><a href="#collection">Discover the collection <Icon name="arrow" size={14} /></a></div>
    <header className="site-header container"><a className="brand" href="#" aria-label={`${brand} home`}><BrandMark /><span>{brand}<span className="brand-period">.</span></span></a><nav aria-label="Main navigation"><a className="nav-active" href="#collection">The collection</a><a href="#our-approach">Our approach</a><button onClick={() => setModal('tracking')}>Track an order</button></nav><div className="header-actions"><button className="account-button" onClick={() => setModal('account')} aria-label={session.data?.user ? 'Your account' : 'Sign in'}><Icon name="user" size={19} /><span>{session.data?.user ? 'Your account' : 'Sign in'}</span></button><button className="bag-button" onClick={() => setModal('bag')} aria-label={`Open bag, ${cart.data?.item_count || 0} items`}><Icon name="bag" size={19} /><span>Bag</span><span className="bag-count">{cart.data?.item_count || 0}</span></button></div></header>
    {demoCatalog && <div className="demo-catalog-notice container" role="note"><strong>Demonstration catalog</strong><span>100 example products. Prices, stock, and representative photos are for testing—not supplier offers.</span><a href="/photo-credits.html">Photo credits & licenses<Icon name="diagonal" size={14} /></a></div>}
    <main id="main">
      <section className="hero container" aria-labelledby="hero-title"><div className="hero-copy"><div className="hero-eyebrow"><span className="little-rule" />Everyday, a little better</div><h1 id="hero-title">A little good.<br />For your<br />everyday.</h1><p className="hero-description">Useful things. Small pleasures.<br className="desktop-break" /> A considered collection that makes room for both.</p><div className="hero-actions"><a className="button button-primary" href="#collection">Shop the collection <Icon name="arrow" /></a><a className="hero-secondary" href="#our-approach">A closer look <Icon name="diagonal" size={17} /></a></div><div className="hero-detail"><span className="detail-emblem"><Icon name="box" size={19} /></span><p>A few good finds.<br /><strong>A world of everyday possibilities.</strong></p></div></div>
        <div className="hero-visual">{snapshot.data && categories.data ? <Explorer products={snapshot.data.items} categories={categories.data} total={snapshot.data.total} currency={store.data?.currency || 'USD'} selected={category} onSelect={selectCategory} onView={setModal} /> : <div className="explorer-card explorer-placeholder" aria-busy={!bootError}><span className="section-kicker">Your everyday, explored.</span>{bootError ? <><h2>The collection is taking a moment.</h2><p className="muted">{errorMessage(bootError)}</p><button className="button button-secondary" onClick={() => { void store.refetch(); void categories.refetch(); void snapshot.refetch(); }}>Try again</button></> : <><div className="skeleton skeleton-chart" /><p className="muted">Connecting to the collection…</p></>}</div>}</div>
      </section>
      <section className="benefit-strip container" aria-label="A simpler way to shop"><div><span className="benefit-icon"><Icon name="box" size={22} /></span><p><strong>Good things, without the noise.</strong><span>One collection. Plenty to make your own.</span></p></div><div><span className="benefit-icon"><Icon name="heart" size={22} /></span><p><strong>Small finds. Everyday joy.</strong><span>From useful essentials to little pleasures.</span></p></div><div><span className="benefit-icon"><Icon name="shield" size={22} /></span><p><strong>Keep it simple.</strong><span>Browse, choose, and order. No payment online.</span></p></div></section>
      <section className="collection container" id="collection" aria-labelledby="collection-title"><div className="section-heading"><div><span className="section-kicker">A little something for your everyday</span><h2 id="collection-title">Meet your next good find.</h2></div><p>Considered essentials.<br />Unexpected little favorites.</p></div><div className="collection-toolbar"><div className="category-filters" role="group" aria-label="Filter by category"><button aria-pressed={category === null} className={category === null ? 'active' : ''} onClick={() => selectCategory(null)}>All goods</button>{categories.data?.map(c => <button key={c.id} aria-pressed={category === c.id} className={category === c.id ? 'active' : ''} onClick={() => selectCategory(c.id)}>{c.name}</button>)}</div><label className="search-field"><Icon name="search" size={17} /><input type="search" aria-label="Search the collection" placeholder="Find your kind of good…" maxLength={100} value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></label></div><div className="collection-meta"><span aria-live="polite">{products.data ? `${products.data.total} ${products.data.total === 1 ? 'good find' : 'good finds'}${category !== null ? ` in ${categories.data?.find(c => c.id === category)?.name}` : ' to explore'}` : 'Finding good things…'}</span><span>Thoughtfully collected. Simply yours.</span></div>
        {products.isError ? <div className="empty-state"><Icon name="box" size={32} /><h3>We couldn’t load the collection.</h3><p>{errorMessage(products.error)}</p><button className="button button-secondary" onClick={() => void products.refetch()}>Try again</button></div> : products.isPending ? <div className="product-grid" aria-busy="true" aria-label="Loading products">{[0, 1, 2].map(i => <div className="product-skeleton" key={i}><div className="skeleton" /><div className="skeleton skeleton-line" /></div>)}</div> : products.data?.items.length ? <div className="product-grid">{products.data.items.map(p => <ProductCard key={p.id} product={p} category={categories.data?.find(c => c.id === p.category_id)?.name || 'The collection'} currency={store.data?.currency || 'USD'} busy={busy || cart.isPending} onView={() => setModal(p)} onAdd={id => add(id).catch(() => {})} />)}</div> : <div className="empty-state"><Icon name="search" size={30} /><h3>Nothing here just yet.</h3><p>Try a different search or take another look at all goods.</p><button className="button button-secondary" onClick={() => { setSearch(''); selectCategory(null); }}>See all goods</button></div>}
        {products.data && products.data.total > PAGE_SIZE && <nav className="pagination" aria-label="Collection pages"><button className="button button-secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}><Icon name="back" size={16} />Previous</button><span>Page {page + 1} of {Math.ceil(products.data.total / PAGE_SIZE)}</span><button className="button button-secondary" disabled={(page + 1) * PAGE_SIZE >= products.data.total} onClick={() => setPage(p => p + 1)}>Next<Icon name="arrow" size={16} /></button></nav>}
        <p className="catalog-footnote">A live catalog, with illustrative artwork where photos aren’t available. Product details and availability come directly from the store.</p>
      </section>
      <section className="approach-section" id="our-approach"><div className="container approach-layout"><div className="approach-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="approach-star"><BrandMark /></div><span className="orbit-word word-one">Useful.</span><span className="orbit-word word-two">Joyful.</span><span className="orbit-word word-three">Yours.</span></div><div className="approach-copy"><span className="section-kicker">Less, but a little better</span><h2>Not everything.<br />Just the good things.</h2><p>Shopping doesn’t have to mean endless scrolling. Explore a collection at your own pace, take a closer look at what catches your eye, and make a little room for the things you’ll enjoy.</p><a className="text-link" href="#collection">Find something for your everyday <Icon name="arrow" size={18} /></a></div></div></section>
      <section className="how-section container" id="how-it-works"><div className="section-heading"><div><span className="section-kicker">From a good find to a good day</span><h2>A simpler kind of shopping.</h2></div></div><div className="how-grid"><article><span className="step-number">01</span><h3>Find your kind of good.</h3><p>Explore the collection, filter by category, and take a closer look at the details.</p></article><article><span className="step-number">02</span><h3>Make a little room.</h3><p>Choose your options, add favorites to your bag, and review everything in one place.</p></article><article><span className="step-number">03</span><h3>Leave the rest to the store.</h3><p>Submit your order with the available pickup or delivery option. No online payment is collected.</p></article></div></section>
      <section className="closing-note container"><span className="closing-star" aria-hidden="true"><BrandMark /></span><h2>Your everyday deserves<br />a little something good.</h2><a href="#collection" className="button button-primary">Explore the collection <Icon name="arrow" /></a></section>
    </main>
    <footer className="site-footer"><div className="container footer-top"><a href="#" className="brand"><BrandMark /><span>{brand}<span className="brand-period">.</span></span></a><p>A little good. For your everyday.</p><nav aria-label="Footer navigation"><a href="#collection">The collection</a><a href="#our-approach">Our approach</a><button onClick={() => setModal('tracking')}>Find your order</button>{store.data?.contact_email && <a href={`mailto:${store.data.contact_email}`}>Contact the store</a>}</nav></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} {brand}. A considered collection.</span><span>Payment-free ordering · {store.data?.currency || 'USD'}</span></div></footer>
    {demoCatalog && <div className="demo-credits-footer"><a href="/photo-credits.html">Photo credits and source licenses</a><span>Representative photography · Sample merchandise only</span></div>}
    {toast && <div className="toast" role="status"><span><Icon name="check" size={18} />{toast}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><Icon name="close" size={16} /></button></div>}
    {modal === 'bag' && store.data && <CartDialog cart={cart.data} store={store.data} user={session.data?.user} busy={busy} loadError={session.error || cart.error} onRetry={() => { void session.refetch().then(() => cart.refetch()); }} onClose={() => setModal(null)} onChange={changeQuantity} onOrdered={ordered} />}
    {modal === 'account' && <AccountDialog user={session.data?.user} onClose={() => setModal(null)} onChange={accountChanged} />}
    {modal === 'tracking' && <TrackingDialog onClose={() => setModal(null)} />}
    {modal && typeof modal === 'object' && store.data && <ProductDialog product={modal} store={store.data} busy={busy} onClose={() => setModal(null)} onAdd={add} />}
    {(session.isError || cart.isError) && <div className="connection-note" role="status">Your bag isn’t connected. <button className="text-button" onClick={() => { void session.refetch(); void cart.refetch(); }}>Reconnect</button></div>}
  </>;
}
