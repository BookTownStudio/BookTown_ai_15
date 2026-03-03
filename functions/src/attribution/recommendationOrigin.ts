import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";

const db = admin.firestore();

export type RecommendationOrigin = {
  source: "librarian";
  suggestionSessionId: string;
  suggestionId: string;
  rankPosition: number;
  mode: string;
};

type SuggestionSessionBook = {
  suggestionId: string;
  rankPosition: number;
  mode: string;
  bookId: string;
};

function sanitizeString(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function sanitizePositiveInt(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.trunc(numeric);
}

function readSessionBooks(value: unknown): SuggestionSessionBook[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      const record =
        row && typeof row === "object" && !Array.isArray(row)
          ? (row as Record<string, unknown>)
          : null;
      if (!record) return null;
      const suggestionId = sanitizeString(record.suggestionId, 96);
      const rankPosition = sanitizePositiveInt(record.rankPosition);
      const mode = sanitizeString(record.mode, 40);
      const bookId = sanitizeString(record.bookId, 128);
      if (!suggestionId || !rankPosition || !mode || !bookId) {
        return null;
      }
      return {
        suggestionId,
        rankPosition,
        mode,
        bookId,
      };
    })
    .filter((row): row is SuggestionSessionBook => Boolean(row));
}

export function sanitizeRecommendationOrigin(
  input: unknown
): RecommendationOrigin | null {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : null;
  if (!record) return null;

  const source = record.source === "librarian" ? "librarian" : null;
  const suggestionSessionId = sanitizeString(record.suggestionSessionId, 96);
  const suggestionId = sanitizeString(record.suggestionId, 96);
  const rankPosition = sanitizePositiveInt(record.rankPosition);
  const mode = sanitizeString(record.mode, 40);

  if (!source || !suggestionSessionId || !suggestionId || !rankPosition || !mode) {
    return null;
  }

  return {
    source,
    suggestionSessionId,
    suggestionId,
    rankPosition,
    mode,
  };
}

export async function resolveAuthoritativeRecommendationOrigin(params: {
  uid: string;
  bookId: string;
  input: RecommendationOrigin;
  tx?: FirebaseFirestore.Transaction;
}): Promise<RecommendationOrigin> {
  const sessionRef = db
    .collection("librarian_suggestions")
    .doc(params.input.suggestionSessionId);
  const sessionSnap = params.tx
    ? await params.tx.get(sessionRef)
    : await sessionRef.get();

  if (!sessionSnap.exists) {
    throw new HttpsError("permission-denied", "Invalid recommendation context.");
  }

  const sessionData = (sessionSnap.data() ?? {}) as Record<string, unknown>;
  const sessionUid = sanitizeString(sessionData.uid, 128);
  if (!sessionUid || sessionUid !== params.uid) {
    throw new HttpsError("permission-denied", "Invalid recommendation context.");
  }

  const books = readSessionBooks(sessionData.books);
  const matched = books.find(
    (row) =>
      row.suggestionId === params.input.suggestionId &&
      row.bookId === params.bookId
  );

  if (!matched) {
    throw new HttpsError("permission-denied", "Invalid recommendation context.");
  }

  if (
    matched.rankPosition !== params.input.rankPosition ||
    matched.mode !== params.input.mode
  ) {
    logger.warn("[ATTRIBUTION][CONTEXT_NORMALIZED]", {
      uid: params.uid,
      suggestionSessionId: params.input.suggestionSessionId,
      suggestionId: params.input.suggestionId,
      requestedRankPosition: params.input.rankPosition,
      authoritativeRankPosition: matched.rankPosition,
      requestedMode: params.input.mode,
      authoritativeMode: matched.mode,
    });
  }

  return {
    source: "librarian",
    suggestionSessionId: params.input.suggestionSessionId,
    suggestionId: matched.suggestionId,
    rankPosition: matched.rankPosition,
    mode: matched.mode,
  };
}
