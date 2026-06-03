// lib/firebase.ts
// Authoritative Firebase runtime bootstrap for BookTown
// Strict auth-first, no side effects on import

import { initializeApp } from "firebase/app";
import type { FirebaseApp } from "firebase/app";
import {
  getToken as getAppCheckToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check";

import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getFunctions, type Functions } from "firebase/functions";

/* ------------------------------------------------------------------ */
/* Internal state (module-private)                                     */
/* ------------------------------------------------------------------ */

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;
let functionsInstance: Functions | null = null;
let appCheckInstance: AppCheck | null = null;
let appCheckDisabled = false;

/* ------------------------------------------------------------------ */
/* Bootstrap                                                          */
/* ------------------------------------------------------------------ */

/**
 * Initializes Firebase exactly once.
 * Must be called before accessing any Firebase service.
 */
export function initializeFirebase(): FirebaseApp {
  if (appInstance) {
    return appInstance;
  }

  const env = import.meta.env;

  if (!env?.VITE_FIREBASE_API_KEY || !env?.VITE_FIREBASE_PROJECT_ID) {
    throw new Error(
      "[Firebase] Missing environment configuration. " +
      "Firebase cannot be initialized."
    );
  }

  appInstance = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
  });

  // Initialize App Check once at bootstrap to avoid first-request token races.
  getOrInitAppCheck();

  return appInstance;
}

/* ------------------------------------------------------------------ */
/* Guards                                                             */
/* ------------------------------------------------------------------ */

function requireApp(): FirebaseApp {
  if (!appInstance) {
    throw new Error(
      "[Firebase] Firebase has not been initialized. " +
      "Call initializeFirebase() before using Firebase services."
    );
  }
  return appInstance;
}

/* ------------------------------------------------------------------ */
/* Service getters (lazy, guarded)                                     */
/* ------------------------------------------------------------------ */

export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(requireApp());
  }
  return authInstance;
}

export function getFirebaseDb(): Firestore {
  if (!firestoreInstance) {
    firestoreInstance = getFirestore(requireApp());
  }
  return firestoreInstance;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storageInstance) {
    storageInstance = getStorage(requireApp());
  }
  return storageInstance;
}

export function getFirebaseFunctions(): Functions {
  if (!functionsInstance) {
    functionsInstance = getFunctions(requireApp());
  }
  return functionsInstance;
}

function getOrInitAppCheck(): AppCheck | null {
  if (appCheckDisabled) return null;
  if (appCheckInstance) return appCheckInstance;

  const env = (import.meta as ImportMeta).env;
  const isProd = env.PROD === true;
  const isDev = env.DEV === true;
  const siteKey = typeof env?.VITE_RECAPTCHA_SITE_KEY === "string"
    ? env.VITE_RECAPTCHA_SITE_KEY.trim()
    : "";
  if (!siteKey) {
    const message =
      "[Firebase][AppCheck] Missing VITE_RECAPTCHA_SITE_KEY.";
    if (isProd) {
      throw new Error(`${message} App Check is required in production.`);
    }
    console.warn(`${message} App Check disabled for local development.`);
    appCheckDisabled = true;
    return null;
  }

  const debugToken =
    typeof env?.VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN === "string"
      ? env.VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN.trim()
      : "";
  if (debugToken && isDev && !isProd && typeof globalThis !== "undefined") {
    (globalThis as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  } else if (debugToken && isProd) {
    console.warn(
      "[Firebase][AppCheck] Ignoring debug token in production build."
    );
  }

  appCheckInstance = initializeAppCheck(requireApp(), {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  return appCheckInstance;
}

export async function getFirebaseAppCheckToken(): Promise<string | null> {
  const appCheck = getOrInitAppCheck();
  if (!appCheck) return null;
  try {
    const result = await getAppCheckToken(appCheck, false);
    return typeof result?.token === "string" && result.token.trim().length > 0
      ? result.token.trim()
      : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Compatibility exports (READ-ONLY, guarded)                          */
/* ------------------------------------------------------------------ */

export const db: { raw: Firestore } = {
  get raw() {
    return getFirebaseDb();
  }
};

/* ------------------------------------------------------------------ */
/* Status helpers (optional, read-only)                                */
/* ------------------------------------------------------------------ */

export function isFirebaseInitialized(): boolean {
  return appInstance !== null;
}
