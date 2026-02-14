// index.tsx

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import { initMediaGuard } from './lib/media/MediaGuard.ts';

// ✅ Firebase bootstrap (REQUIRED)
import { initializeFirebase } from './lib/firebase.ts';

// ✅ Use authoritative custom client (NOT vanilla QueryClient)
import { QueryClientProvider } from '@tanstack/react-query';
// FIX: Imported queryClient from the correct instance file (lib/query-client.ts)
import { queryClient } from './lib/query-client.ts';

/* ------------------------------------------------------------------ */
/* Bootstrap (order matters)                                           */
/* ------------------------------------------------------------------ */

// 1️⃣ Initialize Firebase exactly once before anything touches it
initializeFirebase();

// 2️⃣ Enforce MEDIA_PERMISSION_GUARD_V1 at bootstrap
initMediaGuard();

// 3️⃣ Safe build/version log
// FIX: Safely access import.meta.env to prevent runtime errors
console.log(
  'BOOKTOWN 12 BUILD',
  (import.meta as any).env?.VITE_APP_VERSION || '1.0.0-dev'
);

/* ------------------------------------------------------------------ */
/* React mount                                                        */
/* ------------------------------------------------------------------ */

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
