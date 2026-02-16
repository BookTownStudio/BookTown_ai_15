// lib/actions/ensureReadingProgress.ts

import { getFunctions, httpsCallable } from "firebase/functions";

interface EnsureReadingProgressArgs {
  userId: string;
  bookId: string;
  status_state?: "reading";
}

/**
 * ensureReadingProgress
 * --------------------------------------------------
 * Batch 2 compatibility bridge.
 *
 * Locked behavior:
 * - No direct Firestore writes from client.
 * - Progress creation is mediated by Cloud Function only.
 */
export async function ensureReadingProgress(
  args: EnsureReadingProgressArgs
): Promise<void> {
  const { userId, bookId, status_state } = args;

  if (!userId) throw new Error("ensureReadingProgress: USER_ID_REQUIRED");
  if (!bookId) throw new Error("ensureReadingProgress: BOOK_ID_REQUIRED");
  if (status_state && status_state !== "reading") {
    throw new Error("ensureReadingProgress: ONLY_READING_STATE_SUPPORTED");
  }

  const fn = httpsCallable(getFunctions(), "recordReadingProgress");
  const res = await fn({
    bookId,
    currentPage: 1,
    totalPages: 1,
    percentage: 0,
    status_state: "reading",
    lastPosition: {
      page: 1,
      totalPages: 1,
      mode: "page",
    },
  });

  const envelope = res.data as any;
  if (envelope?.success === false) {
    const code =
      typeof envelope?.error?.code === "string" ? envelope.error.code : "UNKNOWN";
    const message =
      typeof envelope?.error?.message === "string"
        ? envelope.error.message
        : "Progress ensure rejected.";
    throw new Error(`[${code}] ${message}`);
  }
}
