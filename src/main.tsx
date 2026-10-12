import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/bebas-neue/400.css';
import '@fontsource-variable/inter';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/vt323/400.css';
import '@fontsource/yellowtail/400.css';
import './index.css';
import App from './App';
import { captureInstallPrompt } from './pwa/install';
import { registerPwa } from './pwa/register';

captureInstallPrompt();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerPwa();
