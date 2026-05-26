/// <reference types="vitest" />

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',

    /**
     * 🔑 DEV–PROD PARITY FIX
     * Proxy API requests to Firebase Functions during dev
     * Matches Firebase Hosting rewrites in production
     */
    proxy: {
      '/api': {
        target: 'http://localhost:5001/booktown-ai/us-central1',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  plugins: [react()],

  define: {
    // ✅ Build marker (changes every build)
    __BOOKTOWN_BUILD_ID__: JSON.stringify(`${Date.now()}`),
    // No sensitive keys injected here.
  },

  /* ----------------------------------
     🧪 Vitest Configuration
     ---------------------------------- */
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['**/node_modules/**', '**/dist/**', 'functions/lib/**'],

    coverage: {
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'dist/'],
    },
  },
});
