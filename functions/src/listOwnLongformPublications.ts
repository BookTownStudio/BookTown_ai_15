import { onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "./firebaseAdmin";
import { assertActiveAuthenticatedUser } from "./shared/auth";
import { readCanonicalFallbackCover } from "./covers/canonicalFallbackCover";

function asNonEmptyString(value: unknown, max = 512): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toIso(value: unknown): string {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return ((value as { toDate: () => Date }).toDate()).toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return new Date(0).toISOString();
}

export const listOwnLongformPublications = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);

  try {
    const snap = await admin
      .firestore()
      .collection("longform_publications")
      .where("ownerUid", "==", caller.uid)
      .where("publicationType", "==", "blog_longform")
      .orderBy("lastPublishedAt", "desc")
      .limit(50)
      .get();

    const publications = snap.docs.map((docSnap) => {
      const data = (docSnap.data() ?? {}) as Record<string, unknown>;
      const coverMode =
        data.coverMode === "uploaded" || data.coverMode === "fallback_metadata"
          ? data.coverMode
          : undefined;
      const fallbackCover = readCanonicalFallbackCover(data.fallbackCover);
      return {
        publicationId:
          asNonEmptyString(data.publicationId, 256) || docSnap.id,
        title:
          asNonEmptyString(data.title, 180) || "Untitled Publication",
        excerpt: asNonEmptyString(data.excerpt, 220),
        estimatedReadingMinutes:
          typeof data.estimatedReadingMinutes === "number" &&
          Number.isFinite(data.estimatedReadingMinutes) &&
          data.estimatedReadingMinutes > 0
            ? Math.floor(data.estimatedReadingMinutes)
            : 1,
        lastPublishedAt: toIso(data.lastPublishedAt),
        publicationType:
          asNonEmptyString(data.publicationType, 64) || "blog_longform",
        ...(asNonEmptyString(data.canonicalSlug, 120)
          ? { canonicalSlug: asNonEmptyString(data.canonicalSlug, 120) }
          : {}),
        ...(asNonEmptyString(data.coverUrl, 2048)
          ? { coverUrl: asNonEmptyString(data.coverUrl, 2048) }
          : {}),
        ...(coverMode ? { coverMode } : {}),
        ...(fallbackCover ? { fallbackCover } : {}),
      };
    });

    logger.info("[PUBLICATION][SHELF_LOADED]", {
      ownerUid: caller.uid,
      count: publications.length,
    });

    return { publications };
  } catch (error) {
    logger.error("[PUBLICATION][SHELF_LOAD_FAILED]", {
      ownerUid: caller.uid,
      error,
    });
    throw error;
  }
});
