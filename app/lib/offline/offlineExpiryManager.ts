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
  getOfflineRecord,
  clearOfflineEbook,
  isOfflineValid,
} from "./offlineManager";

/**
 * OfflineEbookRecord (authoritative shape)
 * Defined implicitly by offlineManager.ts
 */
interface OfflineEbookRecord {
  ebookId: string;
  expiresAt: number;
  downloadedAt: number;
  storageKey: string;
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
    const now = Date.now();

    // localStorage namespace used by offlineManager
    const namespacePrefix = "BOOKTOWN_OFFLINE_EBOOK:";

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(namespacePrefix)) continue;

      const ebookId = key.replace(namespacePrefix, "");
      const record = getOfflineRecord(ebookId) as OfflineEbookRecord | null;

      if (!record) continue;

      // 🔒 Authoritative expiry check
      if (!isOfflineValid(record, now)) {
        await clearOfflineEbook(ebookId);
      }
    }
  } catch {
    // Silent by design — expiry enforcement must never break the app
  }
}
