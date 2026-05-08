import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';

const StorefrontApp = lazy(() => import('../storefront/StorefrontApp'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div />}>
      <StorefrontApp />
    </Suspense>
  </StrictMode>,
);
