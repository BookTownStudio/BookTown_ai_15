import * as logger from "firebase-functions/logger";

import { admin } from "../../firebaseAdmin";

const db = admin.firestore();

export async function backfillCanonicalKeys() {
  const [booksSnap, editionsSnap] = await Promise.all([
    db.collection("books").where("canonicalKey", "==", null).get(),
    db.collection("editions").where("canonicalKey", "==", null).get(),
  ]);

  logger.error("[AUTHORITY][CANONICAL_KEY_BACKFILL_BLOCKED]", {
    reason: "canonical_key_requires_authority_spine",
    missingBookCanonicalKeys: booksSnap.size,
    missingEditionCanonicalKeys: editionsSnap.size,
  });
}
