import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from '../components/Dialog.tsx';
import { Icon } from '../components/Icon.tsx';
import { adminApi } from './api.ts';
import type { AdminCategory } from './api.ts';
import { Area, Check, ErrorNote, Field, Panel, text, useAction } from './shared.tsx';

export function Categories({ onChanged }: { onChanged: (message: string) => void }) {
  const query = useQuery({ queryKey: ['admin', 'categories'], queryFn: adminApi.categories, retry: false });
  const [editing, setEditing] = useState<AdminCategory | null | undefined>();
  const action = useAction();
  return <>
    <Panel title="Organize your collection" action={<button className="button button-primary" onClick={() => setEditing(null)}><Icon name="plus" size={17} />New category</button>}>
      <p className="muted admin-panel-description">Inactive categories stay here so you can edit or reactivate them. Their products are hidden from the storefront.</p>
      <ErrorNote error={query.error} />
      {query.isError && <button className="text-button" onClick={() => void query.refetch()}>Retry categories</button>}
      {query.isPending ? <p className="muted">Loading categories…</p> : <div className="admin-table-wrap"><table className="admin-table"><caption className="sr-only">Store categories, including inactive records</caption><thead><tr><th scope="col">Category</th><th scope="col">Slug</th><th scope="col">Visibility</th><th scope="col">Action</th></tr></thead><tbody>{query.data?.map(category => <tr key={category.id}><td><strong>{category.name}</strong><small>{category.description}</small></td><td>{category.slug}</td><td><span className={`admin-pill ${category.active ? '' : 'admin-pill-muted'}`}>{category.active ? 'Active' : 'Inactive'}</span></td><td><button className="text-button" onClick={() => setEditing(category)} aria-label={`Edit category ${category.name}`}>Edit<Icon name="diagonal" size={14} /></button></td></tr>)}</tbody></table>{query.data?.length === 0 && <p className="admin-empty">No categories yet. Create the first one to organize your products.</p>}</div>}
    </Panel>
    {editing !== undefined && <Dialog title={editing ? 'Edit category' : 'New category'} onClose={() => setEditing(undefined)} locked={action.busy}>
      <form className="admin-form" onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        void action.run(async () => { await adminApi.saveCategory(editing?.id || null, { name: text(data, 'name'), slug: text(data, 'slug'), description: text(data, 'description'), active: data.has('active') }); onChanged('Category saved.'); setEditing(undefined); });
      }}>
        <Field label="Category name" name="name" defaultValue={editing?.name} maxLength={100} required />
        <Field label="Category slug" name="slug" defaultValue={editing?.slug} maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" required />
        <Area label="Category description" name="description" value={editing?.description} maxLength={1000} />
        <Check label="Active category" name="active" checked={editing?.active ?? true} />
        <ErrorNote error={action.error} />
        <button className="button button-primary" disabled={action.busy}>Save category<Icon name="check" size={18} /></button>
      </form>
    </Dialog>}
  </>;
}
