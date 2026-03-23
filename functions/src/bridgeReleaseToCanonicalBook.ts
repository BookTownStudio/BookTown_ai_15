import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { admin } from "./firebaseAdmin";
import type {
  NormalizedBlockNode,
  NormalizedManuscript,
} from "./publishing/normalizeProjectManuscript";
import { buildSearchFieldsFromTextParts, normalizeSearchText } from "./search/normalization";
import { assertActiveAuthenticatedUser } from "./shared/auth";
import { materializeAuthoredCanonicalAuthor } from "./library/authors/materializeAuthoredCanonicalAuthor";
import {
  attachmentVisibilityForRightsMode,
  bookVisibilityForRightsMode,
  normalizeBookRightsMode,
} from "./rights/bookRights";

type ReadyRelease = {
  releaseId: string;
  ownerUid: string;
  projectId: string;
  attachmentId: string;
  epubStoragePath: string;
  normalizedContent: NormalizedManuscript;
  title: string;
  authorDisplayName: string;
  language: string;
  coverUrl?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown, max = 512): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeReleaseId(value: unknown): string {
  const releaseId = asNonEmptyString(value, 256);
  if (!releaseId) {
    throw new HttpsError("invalid-argument", "A valid releaseId is required.");
  }
  return releaseId;
}

function deriveBookId(ownerUid: string, projectId: string): string {
  return `write_${ownerUid}_${projectId}`;
}

function deriveEditionId(ownerUid: string, projectId: string): string {
  return `edition_write_${ownerUid}_${projectId}`;
}

function normalizeCoverUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.toString().slice(0, 2048);
  } catch {
    return undefined;
  }
}

function extractNodeText(node: NormalizedBlockNode): string {
  const ownText = typeof node.text === "string" ? node.text : "";
  const childText = Array.isArray(node.content)
    ? node.content.map((entry) => extractNodeText(entry)).join(" ")
    : "";
  return `${ownText} ${childText}`.replace(/\s+/g, " ").trim();
}

function truncateCleanly(value: string, limit: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  const slice = trimmed.slice(0, limit + 1);
  const lastBoundary = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\n"));
  const cropped = (
    lastBoundary >= Math.floor(limit * 0.6)
      ? slice.slice(0, lastBoundary)
      : slice.slice(0, limit)
  ).trim();
  return cropped.replace(/[.,;:!?-]+$/g, "").trim();
}

function deriveSynopsis(normalizedContent: NormalizedManuscript): string {
  for (const unit of normalizedContent.units) {
    for (const block of unit.content) {
      if (block.type === "heading") {
        continue;
      }
      const text = extractNodeText(block);
      if (text) {
        return truncateCleanly(text, 180);
      }
    }
  }
  return "";
}

function assertNormalizedContent(value: unknown): NormalizedManuscript {
  const record = asRecord(value);
  const units = Array.isArray(record?.units) ? record.units : null;
  if (!units || units.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "Release normalizedContent is missing or empty."
    );
  }
  return record as unknown as NormalizedManuscript;
}

function assertReadyRelease(releaseId: string, release: Record<string, unknown>, callerUid: string): ReadyRelease {
  const ownerUid = asNonEmptyString(release.ownerUid, 256);
  const projectId = asNonEmptyString(release.projectId, 256);
  const attachmentId = asNonEmptyString(release.attachmentId, 256);
  const epubStoragePath = asNonEmptyString(release.epubStoragePath, 2048);
  const binaryStatus = asNonEmptyString(release.binaryStatus, 32);
  const title = asNonEmptyString(release.title, 180);
  const authorDisplayName = asNonEmptyString(release.authorDisplayName, 180);
  const language = asNonEmptyString(release.language, 12).toLowerCase();

  if (!ownerUid || !projectId) {
    throw new HttpsError(
      "failed-precondition",
      "Release is missing required project linkage."
    );
  }
  if (ownerUid !== callerUid) {
    throw new HttpsError("permission-denied", "Release ownership mismatch.");
  }
  if (binaryStatus !== "ready") {
    throw new HttpsError(
      "failed-precondition",
      "Release binary is not ready."
    );
  }
  if (!attachmentId || !epubStoragePath) {
    throw new HttpsError(
      "failed-precondition",
      "Release binary trace is incomplete."
    );
  }
  if (!title) {
    throw new HttpsError(
      "failed-precondition",
      "Release title is missing."
    );
  }
  if (!authorDisplayName) {
    throw new HttpsError(
      "failed-precondition",
      "Release authorDisplayName is missing."
    );
  }
  if (!language) {
    throw new HttpsError(
      "failed-precondition",
      "Release language is missing."
    );
  }

  return {
    releaseId,
    ownerUid,
    projectId,
    attachmentId,
    epubStoragePath,
    normalizedContent: assertNormalizedContent(release.normalizedContent),
    title,
    authorDisplayName,
    language,
    coverUrl: normalizeCoverUrl(release.coverUrl),
  };
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
}

export const bridgeReleaseToCanonicalBook = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const releaseId = normalizeReleaseId((request.data as { releaseId?: unknown }).releaseId);
  const db = admin.firestore();
  const releaseRef = db.collection("project_releases").doc(releaseId);

  try {
    const result = await db.runTransaction(async (tx) => {
      const releaseSnap = await tx.get(releaseRef);
      if (!releaseSnap.exists) {
        throw new HttpsError("not-found", "Release not found.");
      }

      const release = assertReadyRelease(
        releaseId,
        (releaseSnap.data() ?? {}) as Record<string, unknown>,
        caller.uid
      );

      const attachmentRef = db.collection("attachments").doc(release.attachmentId);
      const bookId = deriveBookId(release.ownerUid, release.projectId);
      const editionId = deriveEditionId(release.ownerUid, release.projectId);
      const bookRef = db.collection("books").doc(bookId);
      const editionRef = db.collection("editions").doc(editionId);
      const projectRef = db
        .collection("users")
        .doc(release.ownerUid)
        .collection("projects")
        .doc(release.projectId);

      const [attachmentSnap, bookSnap, editionSnap] = await Promise.all([
        tx.get(attachmentRef),
        tx.get(bookRef),
        tx.get(editionRef),
      ]);

      if (!attachmentSnap.exists) {
        throw new HttpsError("failed-precondition", "Release attachment is missing.");
      }

      const attachment = (attachmentSnap.data() ?? {}) as Record<string, unknown>;
      const attachmentParentType = asNonEmptyString(attachment.parentType, 64);
      const attachmentParentId = asNonEmptyString(attachment.parentId, 256);
      const attachmentReleaseId = asNonEmptyString(attachment.releaseId, 256);
      if (
        !(
          (attachmentParentType === "project_releases" && attachmentParentId === releaseId) ||
          (attachmentParentType === "editions" && attachmentReleaseId === releaseId)
        ) ||
        asNonEmptyString(attachment.storagePath, 2048) !== release.epubStoragePath ||
        asNonEmptyString(attachment.id, 256) !== release.attachmentId
      ) {
        throw new HttpsError("failed-precondition", "Release attachment mismatch.");
      }

      const existingBook = (bookSnap.data() ?? {}) as Record<string, unknown>;
      const existingEdition = (editionSnap.data() ?? {}) as Record<string, unknown>;
      const isNewCanonicalBook = !bookSnap.exists;
      const hasExistingCanonicalPublication = bookSnap.exists || editionSnap.exists;
      const rightsMode = normalizeBookRightsMode(existingBook.rightsMode || existingEdition.rightsMode);
      const title = release.title;
      const synopsis = deriveSynopsis(release.normalizedContent);
      const authorName = release.authorDisplayName;
      const language = release.language;
      const canonicalAuthor = await materializeAuthoredCanonicalAuthor({
        tx,
        ownerUid: release.ownerUid,
        authorDisplayName: authorName,
        language,
        currentBook: {
          bookId,
          title,
        },
        isNewCanonicalBook,
      });
      const titleEn = language === "ar" ? "" : title;
      const titleAr = language === "ar" ? title : "";
      const normalizedTitle = normalizeSearchText(titleEn || titleAr || title);
      const normalizedAuthor = normalizeSearchText(authorName);
      const searchFields = buildSearchFieldsFromTextParts([
        title,
        titleEn,
        titleAr,
        authorName,
      ]);
      const canonicalKey = `${normalizedAuthor || "unknown"}::${normalizedTitle || normalizeSearchText(title)}`;
      const coverUrl = release.coverUrl;
      const now = FieldValue.serverTimestamp();
      const existingPublicationVersion =
        normalizePositiveInteger(existingBook.publicationVersion) ??
        normalizePositiveInteger(existingEdition.publicationVersion);
      const publicationVersion = hasExistingCanonicalPublication
        ? (existingPublicationVersion ?? 1) + 1
        : 1;
      const datePublished =
        existingBook.datePublished ??
        existingEdition.datePublished ??
        existingBook.createdAt ??
        existingEdition.createdAt ??
        now;

      tx.set(
        attachmentRef,
        {
          parentType: "editions",
          parentId: editionId,
          editionId,
          bookId,
          releaseId,
          visibility: attachmentVisibilityForRightsMode(rightsMode),
          updatedAt: now,
        },
        { merge: true }
      );

      tx.set(
        editionRef,
        {
          id: editionId,
          editionId,
          bookId,
          authorId: canonicalAuthor.authorId,
          canonicalKey,
          source: "write_release",
          externalId: release.projectId,
          currentReleaseId: releaseId,
          title,
          titleEn,
          titleAr,
          authors: [authorName],
          authorEn: authorName,
          authorAr: authorName,
          language,
          description: synopsis,
          descriptionEn: synopsis,
          descriptionAr: synopsis,
          hasEbook: true,
          downloadable: true,
          isEbookAvailable: true,
          ebookAttachmentId: release.attachmentId,
          epubStoragePath: release.epubStoragePath,
          searchTitleNormalized: normalizedTitle,
          searchAuthorNormalized: normalizedAuthor,
          searchTokens: searchFields.tokens,
          publicationVersion,
          datePublished,
          dateModified: now,
          lastPublishedTarget: "ebook",
          publicationState: "published",
          canonicalLocked: true,
          rightsMode,
          visibility: bookVisibilityForRightsMode(rightsMode),
          publicDomain: false,
          createdAt: existingEdition.createdAt || now,
          updatedAt: now,
          ...(coverUrl ? { coverUrl } : { coverUrl: FieldValue.delete() }),
        },
        { merge: true }
      );

      if (!bookSnap.exists) {
        tx.set(
          bookRef,
          {
            id: bookId,
            bookId,
            editionId,
            projectId: release.projectId,
            ownerId: release.ownerUid,
            ownerUid: release.ownerUid,
            authorId: canonicalAuthor.authorId,
            authorCanonicalKey: canonicalAuthor.canonicalKey,
            author: authorName,
            authorEn: authorName,
            authorAr: authorName,
            authors: [authorName],
            authorDisplayName: authorName,
            ownerDisplayName: authorName,
            source: "write_release",
            sourcePriority: "canonical",
            bookType: "authored_native",
            title,
            titleEn,
            titleAr,
            synopsis,
            description: synopsis,
            descriptionEn: synopsis,
            descriptionAr: synopsis,
            language,
            ebookAttachmentId: release.attachmentId,
            currentReleaseId: releaseId,
            normalizedTitle,
            authorNamesNormalized: [normalizedAuthor].filter((entry) => entry.length > 0),
            searchableTitleAuthor: `${normalizedTitle} ${normalizedAuthor}`.trim(),
            search: {
              tokens: searchFields.tokens,
            },
            canonicalKey,
            hasEbook: true,
            downloadable: true,
            isEbookAvailable: true,
            publicationVersion,
            datePublished,
            dateModified: now,
            lastPublishedTarget: "ebook",
            publicationState: "published",
            canonicalLocked: true,
            rightsMode,
            visibility: bookVisibilityForRightsMode(rightsMode),
            createdAt: now,
            updatedAt: now,
            ...(coverUrl
              ? {
                  coverUrl,
                  cover: {
                    original: coverUrl,
                    medium: coverUrl,
                    large: coverUrl,
                    small: coverUrl,
                  },
                }
              : {}),
          },
          { merge: true }
        );
      } else {
        const existingOwnerUid = asNonEmptyString(existingBook.ownerUid, 256);
        if (existingOwnerUid && existingOwnerUid !== release.ownerUid) {
          throw new HttpsError("failed-precondition", "Canonical book ownership mismatch.");
        }

        tx.set(
          bookRef,
          {
            editionId,
            authorId: canonicalAuthor.authorId,
            authorCanonicalKey: canonicalAuthor.canonicalKey,
            author: authorName,
            authorEn: authorName,
            authorAr: authorName,
            authors: [authorName],
            authorDisplayName: authorName,
            ownerDisplayName: authorName,
            title,
            titleEn,
            titleAr,
            synopsis,
            description: synopsis,
            descriptionEn: synopsis,
            descriptionAr: synopsis,
            language,
            ebookAttachmentId: release.attachmentId,
            currentReleaseId: releaseId,
            normalizedTitle,
            authorNamesNormalized: [normalizedAuthor].filter((entry) => entry.length > 0),
            searchableTitleAuthor: `${normalizedTitle} ${normalizedAuthor}`.trim(),
            search: {
              tokens: searchFields.tokens,
            },
            canonicalKey,
            publicationVersion,
            datePublished,
            dateModified: now,
            lastPublishedTarget: "ebook",
            publicationState: "published",
            canonicalLocked: true,
            rightsMode,
            visibility: bookVisibilityForRightsMode(rightsMode),
            ...(coverUrl
              ? {
                  coverUrl,
                  cover: {
                    original: coverUrl,
                    medium: coverUrl,
                    large: coverUrl,
                    small: coverUrl,
                  },
                }
              : {
                  coverUrl: FieldValue.delete(),
                  cover: FieldValue.delete(),
                }),
            updatedAt: now,
          },
          { merge: true }
        );
      }

      tx.set(
        projectRef,
        {
          status: "Final",
          isPublished: true,
          publishedBookId: bookId,
          lastPublishedTarget: "ebook",
          updatedAt: now,
        },
        { merge: true }
      );

      return {
        bookId,
        editionId,
        attachmentId: release.attachmentId,
        currentReleaseId: releaseId,
        publicationVersion,
      };
    });

    logger.info("[PUBLISH][CANONICAL_BOOK_BOUND]", {
      releaseId,
      bookId: result.bookId,
      editionId: result.editionId,
      attachmentId: result.attachmentId,
      currentReleaseId: result.currentReleaseId,
    });

    return result;
  } catch (error) {
    logger.error("[PUBLISH][CANONICAL_BOOK_BIND_FAILED]", {
      releaseId,
      ownerUid: caller.uid,
      error,
    });
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to bind release to canonical book.");
  }
});
