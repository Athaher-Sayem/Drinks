import type { Category, Product } from '../lib/types.ts';
import { catalogGroups, formatMoney, startingPrice } from '../lib/store.ts';
import { Icon } from './Icon.tsx';
import { ProductArt } from './ProductArt.tsx';

const COLORS = ['#5145cd', '#9d93e8', '#d2ccf4', '#7570ac', '#b7b5ce', '#8174da', '#c5b7ea', '#66608b', '#aaa2d3', '#e3ddf5'];

export function Explorer({ products, categories, total, currency, selected, onSelect, onView }: { products: Product[]; categories: Category[]; total: number; currency: string; selected: number | null; onSelect: (id: number | null) => void; onView: (product: Product) => void }) {
  const groups = catalogGroups(products, categories);
  const count = selected === null ? products.length : products.filter(p => p.category_id === selected).length;
  const featured = products.find(p => selected === null || p.category_id === selected);
  const label = categories.find(c => c.id === selected)?.name || 'All good things';
  const featuredPrice = featured && Number.isFinite(startingPrice(featured)) ? formatMoney(String(startingPrice(featured)), currency) : 'Coming soon';
  const circumference = 2 * Math.PI * 78;
  let offset = 0;
  return <div className="explorer-wrap" id="explorer">
    <div className="explorer-card">
      <div className="explorer-heading"><div><span className="section-kicker">A different way to discover</span><h2>Your everyday, explored.</h2></div><span className="live-tag"><i />Live catalog</span></div>
      <div className="explorer-meta"><span>Collection overview</span><button onClick={() => onSelect(null)} className="text-button">Reset <Icon name="back" size={13} /></button></div>
      <div className="explorer-chart">
        <div className="donut">
          <svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="78" fill="none" stroke="#efedf8" strokeWidth="21" />{groups.map((g, i) => {
            const length = products.length ? g.count / products.length * circumference : 0;
            const current = offset; offset += length;
            return <circle key={g.id} cx="100" cy="100" r="78" fill="none" stroke={COLORS[i % COLORS.length]} opacity={selected === null || selected === g.id ? 1 : .2} strokeWidth="21" strokeDasharray={`${Math.max(0, length - 7)} ${circumference}`} strokeDashoffset={-current} transform="rotate(-90 100 100)" />;
          })}</svg>
          <div className="donut-label" aria-live="polite"><strong>{count.toString().padStart(2, '0')}</strong><span>{label}</span></div>
        </div>
        <div className="chart-legend">{groups.map((g, i) => <button className={`legend-row ${selected === g.id ? 'selected' : ''}`} key={g.id} aria-label={`Explore ${g.name}`} aria-pressed={selected === g.id} onClick={() => onSelect(selected === g.id ? null : g.id)}><span className="legend-dot" style={{ backgroundColor: COLORS[i % COLORS.length] }} /><span>{g.name}</span><strong>{g.count.toString().padStart(2, '0')}</strong><Icon name="diagonal" size={14} /></button>)}{groups.length === 0 && <p className="muted">Your next discovery is on its way.</p>}</div>
      </div>
      <p className="chart-caption">{total > products.length ? `A snapshot of ${products.length} of ${total} products. Browse the full collection below.` : 'One collection. A few different ways to make it yours.'}</p>
      {featured && <button className="explorer-product" onClick={() => onView(featured)} aria-label={`Take a closer look at ${featured.name}`}><div className="explorer-thumbnail"><ProductArt slug={featured.slug} name={featured.name} image={featured.image_urls[0]} /></div><div><span>A closer look</span><strong>{featured.name}</strong><small>{featuredPrice}</small></div><span className="round-arrow"><Icon name="arrow" size={19} /></span></button>}
    </div>
    <div className="explorer-footnote"><span className="tiny-star">✧</span><span>Find something that feels like you.</span><span className="drawn-line" /></div>
  </div>;
}
