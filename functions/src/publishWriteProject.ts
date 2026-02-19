import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "./firebaseAdmin";
import { buildSearchFieldsFromTextParts, normalizeSearchText } from "./search/normalization";

type PublishResult = {
  id: string;
  projectId: string;
  authorId: string;
  authorName: string;
  title: string;
  description: string;
  coverUrl?: string;
  epubUrl?: string;
  pdfUrl?: string;
  publishedAt: string;
  formats: Array<"epub" | "pdf">;
  pageCount: number;
  versionNumber?: number;
  bookId: string;
  editionId: string;
};

function normalizeRequiredString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a non-empty string.`);
  }
  const normalized = value.trim().slice(0, max);
  if (!normalized) {
    throw new HttpsError("invalid-argument", `${field} must be a non-empty string.`);
  }
  return normalized;
}

function normalizeCoverUrl(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", "metadata.coverUrl must be a valid URL when provided.");
  }
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new HttpsError("invalid-argument", "metadata.coverUrl must be a valid URL when provided.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HttpsError("invalid-argument", "metadata.coverUrl must use http or https.");
  }
  return parsed.toString().slice(0, 2048);
}

function validateStagedExportUrl(
  input: unknown,
  fieldName: "files.epubUrl" | "files.pdfUrl",
  uid: string,
  projectId: string,
  extension: "epub" | "pdf"
): string {
  const raw = normalizeRequiredString(input, fieldName, 4096);

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new HttpsError("invalid-argument", `${fieldName} must be a valid URL.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HttpsError("invalid-argument", `${fieldName} must use http or https.`);
  }

  if (parsed.hostname !== "firebasestorage.googleapis.com") {
    throw new HttpsError(
      "permission-denied",
      `${fieldName} must reference Firebase Storage download URLs.`
    );
  }

  const expectedPath = `/o/projects/${uid}/${projectId}/exports/`;
  const encodedExpectedPath = `/o/${encodeURIComponent(`projects/${uid}/${projectId}/exports/`)}`;

  let decodedPathname = "";
  try {
    decodedPathname = decodeURIComponent(parsed.pathname);
  } catch {
    decodedPathname = parsed.pathname;
  }

  const isScopedToProject =
    parsed.pathname.includes(encodedExpectedPath) || decodedPathname.includes(expectedPath);
  if (!isScopedToProject) {
    throw new HttpsError(
      "permission-denied",
      `${fieldName} must reference staged exports owned by the authenticated project.`
    );
  }

  const lowerRaw = raw.toLowerCase();
  const lowerDecoded = decodedPathname.toLowerCase();
  if (!lowerRaw.includes(`.${extension}`) && !lowerDecoded.includes(`.${extension}`)) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must reference a .${extension} export.`
    );
  }

  return parsed.toString();
}

function mapPublishedDocToResult(doc: Record<string, unknown>): PublishResult | null {
  if (
    typeof doc.id !== "string" ||
    typeof doc.projectId !== "string" ||
    typeof doc.authorId !== "string" ||
    typeof doc.authorName !== "string" ||
    typeof doc.title !== "string" ||
    typeof doc.description !== "string" ||
    typeof doc.publishedAt !== "string" ||
    typeof doc.bookId !== "string" ||
    typeof doc.editionId !== "string"
  ) {
    return null;
  }

  const formats = Array.isArray(doc.formats)
    ? doc.formats.filter((value): value is "epub" | "pdf" => value === "epub" || value === "pdf")
    : [];

  return {
    id: doc.id,
    projectId: doc.projectId,
    authorId: doc.authorId,
    authorName: doc.authorName,
    title: doc.title,
    description: doc.description,
    coverUrl: typeof doc.coverUrl === "string" ? doc.coverUrl : undefined,
    epubUrl: typeof doc.epubUrl === "string" ? doc.epubUrl : undefined,
    pdfUrl: typeof doc.pdfUrl === "string" ? doc.pdfUrl : undefined,
    publishedAt: doc.publishedAt,
    formats,
    pageCount: typeof doc.pageCount === "number" && Number.isFinite(doc.pageCount) ? Math.max(0, Math.floor(doc.pageCount)) : 0,
    versionNumber:
      typeof doc.versionNumber === "number" && Number.isFinite(doc.versionNumber)
        ? Math.max(1, Math.floor(doc.versionNumber))
        : undefined,
    bookId: doc.bookId,
    editionId: doc.editionId,
  };
}

/**
 * publishWriteProject
 * Authoritative publish finalization with idempotent operation key.
 */
export const publishWriteProject = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const uid = request.auth.uid;
  const { projectId, operationId, metadata, files } = request.data as {
    projectId?: unknown;
    operationId?: unknown;
    metadata?: {
      title?: unknown;
      description?: unknown;
      coverUrl?: unknown;
    };
    files?: {
      epubUrl?: unknown;
      pdfUrl?: unknown;
    };
  };

  if (typeof projectId !== "string" || !projectId.trim()) {
    throw new HttpsError("invalid-argument", "A valid projectId is required.");
  }

  if (typeof operationId !== "string" || !operationId.trim()) {
    throw new HttpsError("invalid-argument", "A valid operationId is required.");
  }

  if (!metadata || typeof metadata !== "object") {
    throw new HttpsError("invalid-argument", "metadata is required.");
  }

  if (!files || typeof files !== "object") {
    throw new HttpsError("invalid-argument", "files is required.");
  }

  const canonicalProjectId = projectId.trim();
  const canonicalOperationId = operationId.trim();
  const normalizedTitle = normalizeRequiredString(metadata.title, "metadata.title", 180);
  const normalizedDescription =
    typeof metadata.description === "string"
      ? metadata.description.trim().slice(0, 4000)
      : "";
  const normalizedCoverUrl = normalizeCoverUrl(metadata.coverUrl);

  const normalizedEpubUrl = validateStagedExportUrl(
    files.epubUrl,
    "files.epubUrl",
    uid,
    canonicalProjectId,
    "epub"
  );
  const normalizedPdfUrl = validateStagedExportUrl(
    files.pdfUrl,
    "files.pdfUrl",
    uid,
    canonicalProjectId,
    "pdf"
  );

  const db = admin.firestore();
  const userRef = db.collection("users").doc(uid);
  const projectRef = userRef.collection("projects").doc(canonicalProjectId);
  const publishOpRef = userRef.collection("project_publish_ops").doc(canonicalOperationId);

  const userSnap = await userRef.get();
  const authorNameRaw =
    typeof userSnap.data()?.name === "string" ? userSnap.data()?.name : "";
  const authorName = authorNameRaw.trim().slice(0, 120) || "Anonymous";

  try {
    const result = await db.runTransaction<PublishResult>(async (tx) => {
      const opSnap = await tx.get(publishOpRef);
      if (opSnap.exists) {
        const opData = opSnap.data() as Record<string, unknown>;
        const cached =
          opData.result && typeof opData.result === "object"
            ? mapPublishedDocToResult(opData.result as Record<string, unknown>)
            : null;
        if (cached) {
          return cached;
        }
      }

      const projectSnap = await tx.get(projectRef);
      if (!projectSnap.exists) {
        throw new HttpsError("not-found", "Project was not found.");
      }

      const project = projectSnap.data() as Record<string, unknown>;
      const now = admin.firestore.Timestamp.now();
      const nowIso = now.toDate().toISOString();

      const currentRevision =
        typeof project.revision === "number" && Number.isInteger(project.revision)
          ? project.revision
          : 1;
      const nextRevision = currentRevision + 1;

      const bookId = `write_${uid}_${canonicalProjectId}`;
      const bookRef = db.collection("books").doc(bookId);
      const editionRef = db.collection("editions").doc();
      const publishedRef = userRef.collection("published_books").doc();

      const titleAr =
        typeof project.titleAr === "string" && project.titleAr.trim().length > 0
          ? project.titleAr.trim().slice(0, 180)
          : normalizedTitle;

      const searchFields = buildSearchFieldsFromTextParts([
        normalizedTitle,
        authorName,
      ]);

      tx.set(
        bookRef,
        {
          authorId: uid,
          ownerId: uid,
          projectId: canonicalProjectId,
          source: "write-publish",
          title: normalizedTitle,
          titleEn: normalizedTitle,
          titleAr,
          authorEn: authorName,
          authorAr: authorName,
          coverUrl: normalizedCoverUrl ?? "",
          descriptionEn: normalizedDescription,
          descriptionAr: normalizedDescription,
          genresEn: [],
          genresAr: [],
          rating: 0,
          ratingsCount: 0,
          isEbookAvailable: true,
          publicationDate: nowIso.slice(0, 10),
          updatedAt: now,
          createdAt: now,
        },
        { merge: true }
      );

      tx.set(editionRef, {
        editionId: editionRef.id,
        bookId,
        projectId: canonicalProjectId,
        title: normalizedTitle,
        subtitle: "",
        language: "en",
        authors: [authorName],
        translator: null,
        publisher: "BookTown",
        publishedDate: nowIso.slice(0, 10),
        otherIdentifiers: [],
        dimensions: {},
        coverImages: {
          medium: normalizedCoverUrl ?? null,
        },
        description: normalizedDescription,
        categories: ["user-generated"],
        editionFormat: "ebook",
        ebookAvailable: true,
        downloadable: true,
        source: "booktown",
        rawSourceRefs: [`users/${uid}/projects/${canonicalProjectId}`],
        searchTitleNormalized: normalizeSearchText(normalizedTitle),
        searchAuthorNormalized: normalizeSearchText(authorName),
        searchTokens: searchFields.tokens,
        searchPrefixes: searchFields.prefixes,
        files: {
          epubUrl: normalizedEpubUrl,
          pdfUrl: normalizedPdfUrl,
        },
        versionNumber: nextRevision,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      const publishedDoc: PublishResult = {
        id: publishedRef.id,
        projectId: canonicalProjectId,
        authorId: uid,
        authorName,
        title: normalizedTitle,
        description: normalizedDescription,
        coverUrl: normalizedCoverUrl,
        epubUrl: normalizedEpubUrl,
        pdfUrl: normalizedPdfUrl,
        publishedAt: nowIso,
        formats: ["epub", "pdf"],
        pageCount: 0,
        versionNumber: nextRevision,
        bookId,
        editionId: editionRef.id,
      };

      tx.set(publishedRef, {
        ...publishedDoc,
        createdAt: now,
        updatedAt: now,
      });

      tx.set(
        projectRef,
        {
          isPublished: true,
          publishedBookId: publishedRef.id,
          publishedEditionId: editionRef.id,
          publishedAt: now,
          updatedAt: now,
          revision: nextRevision,
        },
        { merge: true }
      );

      tx.set(publishOpRef, {
        operationId: canonicalOperationId,
        projectId: canonicalProjectId,
        publishedBookId: publishedRef.id,
        editionId: editionRef.id,
        bookId,
        result: publishedDoc,
        createdAt: now,
        updatedAt: now,
      });

      return publishedDoc;
    });

    return result;
  } catch (error) {
    logger.error("[WRITE][PUBLISH_FAILED]", {
      uid,
      projectId: canonicalProjectId,
      operationId: canonicalOperationId,
      error,
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError("internal", "Failed to publish project.");
  }
});
