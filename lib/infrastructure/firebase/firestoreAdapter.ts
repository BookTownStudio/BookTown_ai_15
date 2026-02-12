// lib/infrastructure/firebase/firestoreAdapter.ts
// Firestore Adapter — Infrastructure Layer Only
// Tier-1: No Firebase imports outside this boundary.

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  type Firestore,
  type DocumentData
} from 'firebase/firestore';

import { getFirebaseDb } from '../../firebase.ts';

function requireDb(): Firestore {
  const db = getFirebaseDb();
  if (!db) {
    throw new Error('[FirestoreAdapter] Firestore not initialized');
  }
  return db;
}

function resolvePath(path: string) {
  const segments = path.split('/').filter(Boolean);
  return doc(requireDb(), ...segments);
}

export const firestoreAdapter = {
  async getDoc<T = DocumentData>(path: string) {
    const ref = resolvePath(path);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as T;
  },

  async setDoc(
    path: string,
    data: DocumentData,
    options?: { merge?: boolean }
  ) {
    const ref = resolvePath(path);
    return setDoc(ref, data, options);
  },

  async updateDoc(
    path: string,
    data: DocumentData
  ) {
    const ref = resolvePath(path);
    return updateDoc(ref, data);
  },

  async deleteDoc(path: string) {
    const ref = resolvePath(path);
    return deleteDoc(ref);
  },

  serverTimestamp() {
    return serverTimestamp();
  }
};
