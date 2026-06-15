import { HttpsError, onCall } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";

const db = admin.firestore();

type AuthorAuthorityState =
  | "canonical"
  | "merged"
  | "superseded"
  | "archived"
  | "candidate"
  | "split"
  | "not_found";

function text(value: unknown, max = 256): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function readState(author: Record<string, unknown>): AuthorAuthorityState {
  const state = text(author.lifecycleState, 64) || text(author.authorityState, 64) || text(author.status, 64);
  if (
    state === "canonical" ||
    state === "merged" ||
    state === "superseded" ||
    state === "archived" ||
    state === "candidate" ||
    state === "split"
  ) {
    return state;
  }
  if (author.requiresCanonicalization === true) return "candidate";
  if (author.archived === true) return "archived";
  return "canonical";
}

function serializeAuthor(id: string, data: Record<string, unknown>) {
  const nameEn = text(data.nameEn, 300) || text(data.authorEn, 300) || text(data.name, 300);
  const nameAr = text(data.nameAr, 300) || text(data.authorAr, 300) || nameEn;
  return {
    id,
    nameEn,
    nameAr,
    avatarUrl: text(data.avatarUrl, 2000),
    bioEn: text(data.bioEn, 5000),
    bioAr: text(data.bioAr, 5000),
    lifespan: text(data.lifespan, 120),
    countryEn: text(data.countryEn, 120),
    countryAr: text(data.countryAr, 120),
    languageEn: text(data.languageEn, 120),
    languageAr: text(data.languageAr, 120),
    ...(text(data.signatureQuoteEn, 500) ? { signatureQuoteEn: text(data.signatureQuoteEn, 500) } : {}),
    ...(text(data.signatureQuoteAr, 500) ? { signatureQuoteAr: text(data.signatureQuoteAr, 500) } : {}),
    ...(text(data.providerSource, 80) ? { providerSource: text(data.providerSource, 80) } : {}),
    ...(text(data.providerExternalId, 256) ? { providerExternalId: text(data.providerExternalId, 256) } : {}),
    ...(data.requiresCanonicalization === true ? { requiresCanonicalization: true } : {}),
    ...(text(data.lifecycleState, 64) ? { lifecycleState: text(data.lifecycleState, 64) } : {}),
    ...(text(data.authorityState, 64) ? { authorityState: text(data.authorityState, 64) } : {}),
    ...(text(data.status, 64) ? { status: text(data.status, 64) } : {}),
    ...(text(data.canonicalAuthorId, 256) ? { canonicalAuthorId: text(data.canonicalAuthorId, 256) } : {}),
    ...(text(data.mergeTargetAuthorId, 256) ? { mergeTargetAuthorId: text(data.mergeTargetAuthorId, 256) } : {}),
    ...(text(data.supersededByAuthorId, 256) ? { supersededByAuthorId: text(data.supersededByAuthorId, 256) } : {}),
    ...(Array.isArray(data.splitTargetAuthorIds)
      ? { splitTargetAuthorIds: data.splitTargetAuthorIds.map((item) => text(item)).filter(Boolean).slice(0, 8) }
      : {}),
    ...(data.archived === true ? { archived: true } : {}),
    ...(data.isPseudonym === true ? { isPseudonym: true } : {}),
    ...(text(data.pseudonymOfAuthorId, 256) ? { pseudonymOfAuthorId: text(data.pseudonymOfAuthorId, 256) } : {}),
  };
}

export async function resolveAuthorAuthorityHandler(
  data: { authorId?: unknown },
  firestore: FirebaseFirestore.Firestore = db
) {
  const requestedAuthorId = text(data.authorId);
  if (!requestedAuthorId) {
    throw new HttpsError("invalid-argument", "A valid authorId is required.");
  }

  const requestedSnap = await firestore.collection("authors").doc(requestedAuthorId).get();
  if (!requestedSnap.exists) {
    return {
      requestedAuthorId,
      resolvedAuthorId: null,
      state: "not_found" as const,
      author: null,
      redirect: {
        required: false,
        targetAuthorId: null,
        reason: "author_not_found",
      },
    };
  }

  const requestedData = requestedSnap.data() ?? {};
  const state = readState(requestedData);
  const targetAuthorId =
    state === "merged"
      ? text(requestedData.mergeTargetAuthorId)
      : state === "superseded"
        ? text(requestedData.supersededByAuthorId)
        : "";
  const resolvedAuthorId = targetAuthorId || requestedAuthorId;

  let resolvedData = requestedData;
  if (targetAuthorId) {
    const targetSnap = await firestore.collection("authors").doc(targetAuthorId).get();
    if (!targetSnap.exists) {
      throw new HttpsError("failed-precondition", "Author redirect target does not exist.");
    }
    resolvedData = targetSnap.data() ?? {};
  }

  return {
    requestedAuthorId,
    resolvedAuthorId,
    state,
    author: serializeAuthor(resolvedAuthorId, resolvedData),
    redirect: {
      required: Boolean(targetAuthorId && targetAuthorId !== requestedAuthorId),
      targetAuthorId: targetAuthorId || null,
      reason:
        state === "merged"
          ? "merged_author_redirect"
          : state === "superseded"
            ? "superseded_author_redirect"
            : "active_author",
    },
  };
}

export const resolveAuthorAuthority = onCall({ cors: true }, async (request) => {
  return resolveAuthorAuthorityHandler((request.data as { authorId?: unknown } | undefined) ?? {});
});
