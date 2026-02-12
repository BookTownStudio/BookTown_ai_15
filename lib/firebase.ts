// lib/firebase.ts
// Authoritative Firebase runtime bootstrap for BookTown
// Strict auth-first, no side effects on import

import { initializeApp } from "firebase/app";
import type { FirebaseApp } from "firebase/app";

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
