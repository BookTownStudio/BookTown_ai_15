import { devLog } from './lib/logging/devLog';
// index.tsx

import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

import { initMediaGuard } from './lib/media/MediaGuard.ts';

// ✅ Firebase bootstrap (REQUIRED)
import { initializeFirebase } from './lib/firebase.ts';

// ✅ Use authoritative custom client (NOT vanilla QueryClient)
import { QueryClientProvider } from '@tanstack/react-query';
// FIX: Imported queryClient from the correct instance file (lib/query-client.ts)
import { queryClient } from './lib/query-client.ts';
import { I18nProvider } from './store/i18n.tsx';

/* ------------------------------------------------------------------ */
/* Bootstrap (order matters)                                           */
/* ------------------------------------------------------------------ */

// 1️⃣ Initialize Firebase exactly once before anything touches it
const isReaderBenchmarkMode =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('readerBenchmark') === '1';
const isReaderHighlightBenchmarkMode =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('readerHighlightE2E') === '1';

if (!isReaderBenchmarkMode && !isReaderHighlightBenchmarkMode) {
  initializeFirebase();
}

// 2️⃣ Enforce MEDIA_PERMISSION_GUARD_V1 at bootstrap
if (!isReaderBenchmarkMode && !isReaderHighlightBenchmarkMode) {
  initMediaGuard();
}

// 3️⃣ Safe build/version log
// FIX: Safely access import.meta.env to prevent runtime errors
devLog(
  'BOOKTOWN BUILD',
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

async function mount() {
  if (isReaderBenchmarkMode) {
    const { default: ReaderPerfBenchmarkApp } = await import(
      './app/benchmark/ReaderPerfBenchmarkApp.tsx'
    );
    root.render(
      <React.StrictMode>
        <I18nProvider>
          <ReaderPerfBenchmarkApp />
        </I18nProvider>
      </React.StrictMode>
    );
    return;
  }

  if (isReaderHighlightBenchmarkMode) {
    const { default: ReaderHighlightBenchmarkApp } = await import(
      './app/benchmark/ReaderHighlightBenchmarkApp.tsx'
    );
    root.render(
      <React.StrictMode>
        <I18nProvider>
          <ReaderHighlightBenchmarkApp />
        </I18nProvider>
      </React.StrictMode>
    );
    return;
  }

  const { default: App } = await import('./App.tsx');
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>
  );
}

void mount();
