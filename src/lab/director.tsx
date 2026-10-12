// Director lab: a developer page for auditioning this workstream in isolation.
// Served at /lab/director.html in dev and in production builds.

import { createRoot } from 'react-dom/client';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <main className="p-8 font-mono text-cream">
    <h1 className="font-display text-4xl">Director lab</h1>
    <p className="mt-2 text-cream/60">Nothing here yet.</p>
  </main>,
);
