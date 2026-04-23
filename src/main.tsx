import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

const path = window.location.pathname;

if (path.startsWith('/tienda')) {
  const StorefrontApp = lazy(() => import('./storefront/StorefrontApp'));
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#fdf5f7]"><div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" /></div>}>
          <StorefrontApp />
        </Suspense>
      </ErrorBoundary>
    </StrictMode>,
  );
} else {
  const App = lazy(() => import('./App.tsx'));
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <Suspense fallback={<div className="app-container flex items-center justify-center min-h-screen"><div className="w-10 h-10 border-4 border-brand border-t-transparent rounded-full animate-spin" /></div>}>
          <App />
        </Suspense>
      </ErrorBoundary>
    </StrictMode>,
  );
}
