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
import { registerPwa } from './pwa/register';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerPwa();
