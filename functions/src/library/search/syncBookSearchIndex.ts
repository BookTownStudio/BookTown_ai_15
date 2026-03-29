import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import {
  bookSearchPatchNeedsUpdate,
  buildBookSearchPatch,
} from "./searchIndexing";

export const syncBookSearchIndex = onDocumentWritten("books/{bookId}", async (event) => {
  const after = event.data?.after;
  if (!after?.exists) {
    return;
  }

  const data = after.data() as Record<string, unknown> | undefined;
  if (!data) {
    return;
  }

  const patch = buildBookSearchPatch(data);
  if (!bookSearchPatchNeedsUpdate(data, patch)) {
    return;
  }

  await after.ref.set(patch, { merge: true });
  logger.info("BOOK_SEARCH_INDEX_SYNCED", {
    bookId: event.params.bookId,
    tokenCount: Array.isArray((patch.search as { tokens?: unknown[] } | undefined)?.tokens)
      ? ((patch.search as { tokens?: unknown[] }).tokens?.length ?? 0)
      : 0,
  });
});
