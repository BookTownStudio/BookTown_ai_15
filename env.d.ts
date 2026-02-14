
// FIX: The reference to vite/client is commented out to resolve a "Cannot find type definition file" error, which may be caused by an environment-specific issue. Type safety for import.meta.env will be handled via 'as any' casting where needed.
// /// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RUNTIME: string;
  // VITE_GEMINI_API_KEY removed: Secrets must not be exposed to the frontend.
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID: string;
  // FIX: Added VITE_APP_VERSION to ensure it is recognized when accessed via import.meta.env
  readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
