import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import { admin } from "../firebaseAdmin";
import { normalizeIsbn } from "./normalization/bookSearchNormalization";
import { buildCanonicalKey } from "./persistence/canonicalKey";

const db = admin.firestore();

type CandidateStatus = "none" | "candidate" | "matched" | "needs_review";
type CandidateJobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

const MAX_REASON_LENGTH = 240;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeProvider(value: string | null): string | null {
  if (value === "googleBooks" || value === "openLibrary") return value;
  return null;
}

function candidatePatch(params: {
  status: CandidateStatus;
  confidence: number;
  reason: string;
  canonicalBookId?: string | null;
  canonicalEditionId?: string | null;
}): Record<string, unknown> {
  return {
    canonicalCandidate: {
      status: params.status,
      confidence: Math.max(0, Math.min(100, Math.trunc(params.confidence))),
      reason: params.reason.slice(0, MAX_REASON_LENGTH),
      canonicalBookId: params.canonicalBookId ?? null,
      canonicalEditionId: params.canonicalEditionId ?? null,
      matchedAt: params.status === "matched" ? FieldValue.serverTimestamp() : null,
    },
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function failedCandidatePatch(reason: string): Record<string, unknown> {
  return candidatePatch({
    status: "none",
    confidence: 0,
    reason,
    canonicalBookId: null,
    canonicalEditionId: null,
  });
}

function isCanonicalReadableBook(data: Record<string, unknown>): boolean {
  const source = asNonEmptyString(data.source);
  const authorityStatus = asNonEmptyString(data.authorityStatus);
  const workType = asNonEmptyString(data.workType);
  const visibility = asNonEmptyString(data.visibility) || "public";
  const rightsMode = asNonEmptyString(data.rightsMode) || "public_free";
  return (
    source !== "user_upload" &&
    visibility === "public" &&
    rightsMode !== "private" &&
    (authorityStatus === "canonical" || workType === "canonical")
  );
}

async function resolveBookFromIdentity(identityKey: string): Promise<{
  bookId: string;
  editionId: string | null;
  data: Record<string, unknown>;
} | null> {
  const identitySnap = await db.collection("book_identity").doc(identityKey).get();
  const bookId = asNonEmptyString(identitySnap.data()?.bookId);
  if (!bookId) return null;

  const bookSnap = await db.collection("books").doc(bookId).get();
  if (!bookSnap.exists) return null;
  const data = (bookSnap.data() || {}) as Record<string, unknown>;
  if (!isCanonicalReadableBook(data)) return null;

  return {
    bookId,
    editionId: asNonEmptyString(data.editionId),
    data,
  };
}

async function resolveBookByCanonicalKey(canonicalKey: string): Promise<{
  bookId: string;
  editionId: string | null;
} | null> {
  const snap = await db
    .collection("books")
    .where("canonicalKey", "==", canonicalKey)
    .limit(3)
    .get();

  const matches = snap.docs
    .map((doc) => ({ id: doc.id, data: (doc.data() || {}) as Record<string, unknown> }))
    .filter((entry) => isCanonicalReadableBook(entry.data));

  if (matches.length !== 1) return null;
  return {
    bookId: matches[0].id,
    editionId: asNonEmptyString(matches[0].data.editionId),
  };
}

async function resolveCandidate(metadata: Record<string, unknown>): Promise<Record<string, unknown>> {
  const rawIsbn = asNonEmptyString(metadata.isbn);
  const isbn13 = normalizeIsbn(rawIsbn || "", 13);
  const isbn10 = normalizeIsbn(rawIsbn || "", 10);
  for (const identityKey of [
    isbn13 ? `isbn13:${isbn13}` : "",
    isbn10 ? `isbn10:${isbn10}` : "",
  ].filter(Boolean)) {
    const match = await resolveBookFromIdentity(identityKey);
    if (match) {
      return candidatePatch({
        status: "matched",
        confidence: 100,
        reason: `isbn_exact_match:${identityKey}`,
        canonicalBookId: match.bookId,
        canonicalEditionId: match.editionId,
      });
    }
  }

  const provider = normalizeProvider(asNonEmptyString(metadata.provider));
  const providerExternalId = asNonEmptyString(metadata.providerExternalId);
  if (provider && providerExternalId) {
    const match = await resolveBookFromIdentity(`provider:${provider}:${providerExternalId}`);
    if (match) {
      return candidatePatch({
        status: "matched",
        confidence: 95,
        reason: `provider_identity_match:${provider}`,
        canonicalBookId: match.bookId,
        canonicalEditionId: match.editionId,
      });
    }
  }

  const title = asNonEmptyString(metadata.title);
  const author = asNonEmptyString(metadata.author);
  if (!title || !author) {
    return candidatePatch({
      status: "none",
      confidence: 0,
      reason: "insufficient_metadata",
    });
  }

  const canonicalKey = buildCanonicalKey({ title, author });
  const identityMatch = await resolveBookFromIdentity(`canonical:${canonicalKey}`);
  const canonicalMatch = identityMatch
    ? { bookId: identityMatch.bookId, editionId: identityMatch.editionId }
    : await resolveBookByCanonicalKey(canonicalKey);

  if (canonicalMatch) {
    return candidatePatch({
      status: "candidate",
      confidence: 80,
      reason: "canonical_key_exact_match",
      canonicalBookId: canonicalMatch.bookId,
      canonicalEditionId: canonicalMatch.editionId,
    });
  }

  return candidatePatch({
    status: "needs_review",
    confidence: 60,
    reason: "title_author_extracted_no_exact_match",
  });
}

function failureReason(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.slice(0, MAX_REASON_LENGTH);
}

export const processUserUploadCanonicalCandidateJobs = onDocumentWritten(
  {
    document: "upload_canonical_candidate_jobs/{bookId}",
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const bookId = String(event.params.bookId || "").trim();
    if (!bookId) return;

    const jobRef = after.ref;
    const bookRef = db.collection("books").doc(bookId);
    const lock = await db.runTransaction(async (tx) => {
      const jobSnap = await tx.get(jobRef);
      const data = (jobSnap.data() || {}) as Record<string, unknown>;
      if (asNonEmptyString(data.status) !== "PENDING") return null;

      tx.set(
        jobRef,
        {
          status: "PROCESSING" satisfies CandidateJobStatus,
          startedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          failureReason: null,
        },
        { merge: true }
      );
      return data;
    });

    if (!lock) return;

    try {
      const bookSnap = await bookRef.get();
      if (!bookSnap.exists) throw new Error("BOOK_NOT_FOUND");
      const book = (bookSnap.data() || {}) as Record<string, unknown>;
      if (asNonEmptyString(book.source) !== "user_upload") {
        throw new Error("INVALID_BOOK_SOURCE");
      }

      const metadata = asRecord(book.uploadMetadata);
      if (!metadata) {
        throw new Error("UPLOAD_METADATA_MISSING");
      }
      if (asNonEmptyString(metadata?.status) !== "ready") {
        const patch = candidatePatch({
          status: "none",
          confidence: 0,
          reason: "upload_metadata_not_ready",
        });
        await db.runTransaction(async (tx) => {
          tx.set(bookRef, patch, { merge: true });
          tx.set(
            jobRef,
            {
              status: "COMPLETED" satisfies CandidateJobStatus,
              completedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        });
        return;
      }

      const patch = await resolveCandidate(metadata);
      await db.runTransaction(async (tx) => {
        tx.set(bookRef, patch, { merge: true });
        tx.set(
          jobRef,
          {
            status: "COMPLETED" satisfies CandidateJobStatus,
            completedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });

      logger.info("[UPLOAD_CANONICAL_CANDIDATE][READY]", {
        bookId,
        status: asRecord(patch.canonicalCandidate)?.status,
        confidence: asRecord(patch.canonicalCandidate)?.confidence,
      });
    } catch (error) {
      const reason = failureReason(error);
      await db.runTransaction(async (tx) => {
        tx.set(bookRef, failedCandidatePatch(reason), { merge: true });
        tx.set(
          jobRef,
          {
            status: "FAILED" satisfies CandidateJobStatus,
            failureReason: reason,
            failedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
      logger.warn("[UPLOAD_CANONICAL_CANDIDATE][FAILED]", {
        bookId,
        reason,
      });
    }
  }
);
