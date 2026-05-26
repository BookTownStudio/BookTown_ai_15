// functions/src/attachments/storageSignedUrl.ts

import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";

const LEGACY_EBOOK_ATTACHMENT_PREFIX = "attachments/";

function hasUnsafeStoragePathSegment(path: string): boolean {
  return path
    .split("/")
    .some((segment) => segment === "" || segment === "." || segment === "..");
}

export function isCanonicalReaderEbookStoragePath(path: string): boolean {
  if (!path.startsWith("ebooks/") || hasUnsafeStoragePathSegment(path)) {
    return false;
  }

  const [, bookId, ...rest] = path.split("/");
  return Boolean(bookId && rest.length > 0 && rest.join("/").trim().length > 0);
}

export function isCanonicalBookReaderEbookStoragePath(
  bookId: string,
  path: string
): boolean {
  return isCanonicalReaderEbookStoragePath(path) && path.startsWith(`ebooks/${bookId}/`);
}

export function isLegacyEbookAttachmentStoragePath(path: string): boolean {
  return path.startsWith(LEGACY_EBOOK_ATTACHMENT_PREFIX) && !hasUnsafeStoragePathSegment(path);
}

function isAllowedEbookSignedUrlPath(path: string): boolean {
  return isCanonicalReaderEbookStoragePath(path) || isLegacyEbookAttachmentStoragePath(path);
}

/**
 * SIGNED_URL_CONTRACT_V1
 * --------------------------------------------------
 * Canonical server-only signed URL generator.
 *
 * Guarantees:
 * - No public storage access
 * - Short-lived URLs only
 * - Intent-scoped TTLs
 * - Path validation (no arbitrary reads)
 * - Existence check before issuance
 *
 * Canonical reader ebook assets live under ebooks/{bookId}/...
 * attachments/... is legacy upload compatibility only.
 *
 * This is the ONLY approved read gateway for:
 * - Ebook attachments
 * - Canonical book covers
 */
export async function getSignedUrl(params: {
  bucket: string;
  path: string;
  intent: "ebook" | "cover";
}): Promise<string> {
  const { bucket, path, intent } = params;

  /**
   * 🔒 Hard guards — never trust callers
   */
  if (!bucket || typeof bucket !== "string") {
    throw new Error("[SIGNED_URL] Invalid or missing bucket");
  }

  if (!path || typeof path !== "string") {
    throw new Error("[SIGNED_URL] Invalid or missing path");
  }

  if (intent !== "ebook" && intent !== "cover") {
    throw new Error("[SIGNED_URL] Invalid intent");
  }

  /**
   * 🔒 Enforce allowed path prefixes by intent
   */
  if (intent === "ebook") {
    if (!isAllowedEbookSignedUrlPath(path)) {
      throw new Error("[SIGNED_URL] Invalid ebook path");
    }
  }

  if (intent === "cover") {
    if (!path.startsWith("books/") || !path.includes("/covers/")) {
      throw new Error("[SIGNED_URL] Invalid cover path");
    }
  }

  /**
   * ⏱ TTL policy (INTENT-BASED — LOCKED)
   * - Covers: slightly longer (browsing / scrolling)
   * - Ebooks: short-lived (active reader session only)
   */
  const expiresInSeconds =
    intent === "cover"
      ? 30 * 60 // 30 minutes
      : 10 * 60; // 10 minutes (ebooks)

  const storageBucket = admin.storage().bucket(bucket);
  const file = storageBucket.file(path);

  /**
   * 🔒 Existence check (no blind URL issuance)
   */
  const [exists] = await file.exists();
  if (!exists) {
    logger.warn("[SIGNED_URL][MISSING_FILE]", {
      intent,
      path,
    });
    throw new Error("[SIGNED_URL] File does not exist");
  }

  logger.info("[SIGNED_URL][ISSUE]", {
    intent,
    path,
    ttlSeconds: expiresInSeconds,
  });

  try {
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + expiresInSeconds * 1000,
    });

    return url;
  } catch (err) {
    logger.error("[SIGNED_URL][FAILED]", {
      intent,
      path,
      error: String(err),
    });
    throw new Error("[SIGNED_URL] Failed to issue signed URL");
  }
}
