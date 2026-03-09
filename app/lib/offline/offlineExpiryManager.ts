// app/lib/offline/offlineExpiryManager.ts

/**
 * Offline Expiry Manager
 * ----------------------
 * Enforces expiry of offline ebooks.
 *
 * Storage backend:
 * - Cache API for binary ebook data
 * - localStorage for metadata (OfflineEbookRecord)
 *
 * This module is SAFE:
 * - Read-only scan
 * - Silent cleanup
 * - No UI side effects
 * - No network calls
 */

import {
  getAllOfflineBookIds,
  getOfflineRecord,
  clearOfflineEbook,
  isOfflineValid,
} from "./offlineManager";

/**
 * OfflineEbookRecord (authoritative shape)
 * Defined implicitly by offlineManager.ts
 */
interface OfflineEbookRecord {
  bookId: string;
  expiresAt: number;
  storedAt: number;
}

/**
 * enforceOfflineExpiry
 * --------------------
 * Iterates over all offline ebook metadata stored in localStorage
 * and silently removes expired entries.
 *
 * This function is SAFE to call:
 * - on app boot
 * - on foreground resume
 * - on scheduled background wake
 */
export async function enforceOfflineExpiry(): Promise<void> {
  try {
    for (const bookId of getAllOfflineBookIds()) {
      const record = getOfflineRecord(bookId) as OfflineEbookRecord | null;

      if (!record) continue;

      if (!isOfflineValid(record)) {
        await clearOfflineEbook(bookId);
      }
    }
  } catch {
    // Silent by design — expiry enforcement must never break the app
  }
}
