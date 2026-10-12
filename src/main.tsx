import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/michroma/400.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import './index.css';
import App from './App';
import { captureInstallPrompt } from './pwa/install';
import { registerPwa } from './pwa/register';

captureInstallPrompt();

// Dev only: `?uidemo=pirate|static|partial|event|hush|oddity|voice|secret|dial` pins the store
// into a given state for screenshots. Compiled out of production builds.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('uidemo')) {
  void import('./ui/demo').then((demo) => demo.installDemo());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerPwa();
