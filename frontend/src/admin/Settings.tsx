import { useQuery } from '@tanstack/react-query';
import { adminApi } from './api.ts';
import { Area, Check, ErrorNote, Field, Panel, text, useAction } from './shared.tsx';
import { Icon } from '../components/Icon.tsx';

export function Settings({ onChanged }: { onChanged: (message: string) => void }) {
  const query = useQuery({ queryKey: ['admin', 'store'], queryFn: adminApi.store, retry: false });
  const action = useAction();
  if (!query.data) return <><ErrorNote error={query.error} /><p className="muted">Loading store settings…</p>{query.isError && <button className="text-button" onClick={() => void query.refetch()}>Retry settings</button>}</>;
  const store = query.data;
  return <Panel title="One store. Your way.">
    <p className="muted admin-panel-description">Owner-only settings. A fixed tax rate is not a replacement for jurisdiction-specific tax advice.</p>
    <form className="admin-form admin-settings-form" key={`${store.name}-${store.currency}`} onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      void action.run(async () => {
        const payload = {
          name: text(data, 'name'), description: text(data, 'description'), currency: text(data, 'currency'), country: text(data, 'country').toUpperCase(), timezone: text(data, 'timezone'),
          ...(text(data, 'contact_email') ? { contact_email: text(data, 'contact_email') } : {}),
          ...(text(data, 'tax_rate') ? { tax_rate: (Number(text(data, 'tax_rate')) / 100).toFixed(5) } : {}),
          pickup_enabled: data.has('pickup_enabled'), shipping_enabled: data.has('shipping_enabled'), tax_fulfillment_fee: data.has('tax_fulfillment_fee'),
          shipping_fee: text(data, 'shipping_fee'), delivery_fee: text(data, 'delivery_fee'), delivery_postal_codes: text(data, 'delivery_postal_codes').split(/[\n,]+/).map(v => v.trim()).filter(Boolean),
        };
        await adminApi.saveStore(payload); onChanged('Store settings saved.');
      });
    }}>
      <fieldset><legend>Store identity</legend><div className="field-pair"><Field label="Store name" name="name" defaultValue={store.name} required maxLength={120} /><Field label="Contact email" name="contact_email" type="email" defaultValue={store.contact_email} maxLength={254} /></div><Area label="Store description" name="description" value={store.description} maxLength={1000} /><div className="field-pair"><Field label="Country code" name="country" defaultValue={store.country} maxLength={2} pattern="[A-Za-z]{2}" required /><Field label="Timezone" name="timezone" defaultValue={store.timezone} required maxLength={64} /></div><label className="field">Store currency<select name="currency" defaultValue={store.currency}>{['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'NZD', 'BDT', 'INR'].map(currency => <option key={currency}>{currency}</option>)}</select></label><p className="fine-print">Currency cannot change once variant prices exist. Use a separate deployment/database for a different store.</p></fieldset>
      <fieldset><legend>Tax and fulfillment</legend><Field label="Tax rate (%)" name="tax_rate" type="number" min="0" max="100" step="0.001" defaultValue={store.tax_rate === null ? '' : String(Number(store.tax_rate) * 100)} /><p className="fine-print">If tax is unconfigured, checkout is blocked. Leaving this blank preserves the existing value; 0 means an explicit zero rate.</p><Check label="Apply tax to fulfillment fees" name="tax_fulfillment_fee" checked={store.tax_fulfillment_fee} /><Check label="Enable store pickup" name="pickup_enabled" checked={store.pickup_enabled} /><Check label="Enable shipping within the store country" name="shipping_enabled" checked={store.shipping_enabled} /><div className="field-pair"><Field label="Shipping fee" name="shipping_fee" type="number" min="0" max="999999.99" step="0.01" defaultValue={store.shipping_fee} required /><Field label="Local delivery fee" name="delivery_fee" type="number" min="0" max="999999.99" step="0.01" defaultValue={store.delivery_fee} required /></div><Area label="Local delivery postal codes" name="delivery_postal_codes" value={store.delivery_postal_codes.join('\n')} maxLength={21000} hint="One code per line, or separated by commas. Leave empty to disable local delivery." /></fieldset>
      <ErrorNote error={action.error} /><button className="button button-primary" disabled={action.busy}>Save store settings<Icon name="check" size={18} /></button>
    </form>
  </Panel>;
}
