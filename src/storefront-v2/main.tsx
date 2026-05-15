import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './storefront.css';

const StorefrontApp = lazy(() => import('./StorefrontApp'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div />}>
      <StorefrontApp />
    </Suspense>
  </StrictMode>,
);
