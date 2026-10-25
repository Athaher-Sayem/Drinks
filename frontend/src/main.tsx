import { Component, lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import App from './App.tsx';
import './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <main className="error-screen"><h1>The store needs a fresh start.</h1><p>Reload the page to reconnect. If an order was being submitted, retry with the same details rather than starting another.</p><button className="button button-primary" onClick={() => location.reload()}>Reload the store</button></main> : this.props.children; }
}

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: false } } });
const AdminApp = lazy(() => import('./admin/AdminApp.tsx'));
const page = location.pathname === '/admin' || location.pathname.startsWith('/admin/') ? <AdminApp /> : <App />;
createRoot(document.getElementById('root')!).render(<ErrorBoundary><QueryClientProvider client={client}><Suspense fallback={<main className="error-screen"><p>Opening the workspace…</p></main>}>{page}</Suspense></QueryClientProvider></ErrorBoundary>);
