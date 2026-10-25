import { useId, useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { errorMessage } from '../lib/api.ts';
import { Icon } from '../components/Icon.tsx';

export function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return <label className="field" htmlFor={id}>{label}<input id={id} {...props} /></label>;
}
export function Area({ label, name, value, maxLength = 5000, hint }: { label: string; name: string; value?: string; maxLength?: number; hint?: string }) {
  const id = useId();
  return <div><label className="field" htmlFor={id}>{label}<textarea id={id} name={name} defaultValue={value} rows={3} maxLength={maxLength} aria-describedby={hint ? `${id}-hint` : undefined} /></label>{hint && <p id={`${id}-hint`} className="fine-print">{hint}</p>}</div>;
}
export function Check({ label, name, checked }: { label: string; name: string; checked?: boolean }) {
  return <label className="admin-check"><input type="checkbox" name={name} defaultChecked={checked} />{label}</label>;
}
export function ErrorNote({ error }: { error: unknown }) { return error ? <p role="alert" className="error-message">{errorMessage(error)}</p> : null; }
export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="admin-panel"><div className="admin-panel-title"><h2>{title}</h2>{action}</div>{children}</section>;
}
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(null);
    try { await action(); } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return { busy, error, run };
}
export function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  if (total <= 20) return null;
  return <nav className="pagination" aria-label="Admin results pages"><button className="button button-secondary" disabled={!page} onClick={() => onChange(page - 1)}><Icon name="back" size={16} />Previous</button><span>Page {page + 1} of {Math.ceil(total / 20)}</span><button className="button button-secondary" disabled={(page + 1) * 20 >= total} onClick={() => onChange(page + 1)}>Next<Icon name="arrow" size={16} /></button></nav>;
}
export const text = (data: FormData, name: string) => String(data.get(name) || '').trim();
