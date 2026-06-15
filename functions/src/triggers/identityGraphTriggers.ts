import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import {
  toAuthorFollowInteraction,
  writeUserEntityInteractionDirect,
} from "../identityGraph/userEntityInteractionRuntime";
import { resolveAuthorAuthorityHandler } from "../catalog/resolveAuthorAuthority";

const db = admin.firestore();

function toIsoFromFirestoreValue(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value) {
    const maybeDate = (value as { toDate?: unknown }).toDate;
    if (typeof maybeDate === "function") {
      const date = maybeDate.call(value);
      if (date instanceof Date && Number.isFinite(date.getTime())) {
        return date.toISOString();
      }
    }
  }
  return new Date().toISOString();
}

export const onAuthorFollowWrittenToIdentityGraph = onDocumentWritten(
  "users/{uid}/follows_authors/{authorId}",
  async (event) => {
    const uid = typeof event.params.uid === "string" ? event.params.uid.trim() : "";
    const authorId =
      typeof event.params.authorId === "string" ? event.params.authorId.trim() : "";

    if (!uid || !authorId) {
      logger.warn("[IDENTITY_GRAPH][AUTHOR_FOLLOW_SKIP_INVALID_PARAMS]", {
        uid,
        authorId,
      });
      return;
    }

    const afterExists = event.data?.after.exists === true;
    const afterData = afterExists ? event.data?.after.data() as Record<string, unknown> : {};
    const beforeData = event.data?.before.exists
      ? event.data?.before.data() as Record<string, unknown>
      : {};
    const occurredAt = toIsoFromFirestoreValue(
      afterExists
        ? afterData.updatedAt ?? afterData.createdAt
        : beforeData.updatedAt ?? beforeData.createdAt
    );

    const resolution = await resolveAuthorAuthorityHandler({ authorId }, db);
    const resolvedAuthorId = resolution.resolvedAuthorId;
    if (!resolvedAuthorId || resolution.state === "candidate" || resolution.state === "archived" || resolution.state === "split") {
      logger.warn("[IDENTITY_GRAPH][AUTHOR_FOLLOW_SKIP_NON_CANONICAL_AUTHOR]", {
        uid,
        authorId,
        state: resolution.state,
      });
      return;
    }

    await writeUserEntityInteractionDirect(
      db,
      toAuthorFollowInteraction({
        uid,
        authorId: resolvedAuthorId,
        occurredAt,
        lifecycleState: afterExists ? "recorded" : "withdrawn",
      })
    );
  }
);
