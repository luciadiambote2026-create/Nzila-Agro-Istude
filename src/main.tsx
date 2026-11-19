import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

if (import.meta.env.PROD) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch(() => {
      // Ignore PWA registration errors in restricted iframes
    });
} else if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  // Unregister any stale dev Service Worker that could serve outdated Vite chunks
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      for (const reg of registrations) {
        void reg.unregister();
      }
    })
    .catch(() => {
      // Ignore SW cleanup errors
    });
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <ErrorBoundary boundaryName="Aplicação Global">
      <App />
    </ErrorBoundary>
  );
}
