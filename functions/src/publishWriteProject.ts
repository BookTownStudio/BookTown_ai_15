import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "./firebaseAdmin";
import { materializeBookAuthorityInTransaction } from "./library/materializeBookAuthority";
import { setExternalFileManifestationInTransaction } from "./manifestations/manifestationAuthority";
import { buildSearchFieldsFromTextParts, normalizeSearchText } from "./search/normalization";
import { assertActiveAuthenticatedUser } from "./shared/auth";

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
  publishedWorkId: string;
  publishedEditionId: string;
  bookId: string;
  editionId: string;
  manifestationIds?: string[];
};

const MAX_CANONICAL_COVER_BYTES = 10 * 1024 * 1024;

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

function asNonEmptyString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stripHtmlToText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateCleanly(value: string, limit: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  const slice = trimmed.slice(0, limit + 1);
  const lastBoundary = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\n"));
  const cropped = (lastBoundary >= Math.floor(limit * 0.6) ? slice.slice(0, lastBoundary) : slice.slice(0, limit)).trim();
  return cropped.replace(/[.,;:!?-]+$/g, "").trim();
}

function extractTextFromNode(node: Record<string, unknown>): string {
  const text = asNonEmptyString(node.text);
  if (text) return text;
  const content = Array.isArray(node.content) ? node.content : [];
  return content
    .map((entry) => (asRecord(entry) ? extractTextFromNode(entry) : ""))
    .filter((entry) => entry.length > 0)
    .join(" ")
    .trim();
}

function extractSynopsisFromContentDoc(value: unknown): string {
  const doc = asRecord(value);
  const content = Array.isArray(doc?.content) ? doc?.content : [];
  for (const entry of content) {
    const node = asRecord(entry);
    if (!node) continue;
    const nodeType = asNonEmptyString(node.type).toLowerCase();
    if (!nodeType || nodeType === "heading" || nodeType === "separator" || nodeType === "horizontalrule") {
      continue;
    }
    const text = extractTextFromNode(node);
    if (text) {
      return truncateCleanly(text, 180);
    }
  }
  return "";
}

function extractSynopsisFromHtml(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const paragraphs = value
    .split(/<\/p>|<\/div>|<br\s*\/?>/i)
    .map((entry) => stripHtmlToText(entry))
    .filter((entry) => entry.length > 0);
  for (const paragraph of paragraphs) {
    if (paragraph) {
      return truncateCleanly(paragraph, 180);
    }
  }
  return "";
}

function deriveProjectSynopsis(project: Record<string, unknown>, fallbackDescription: string): string {
  const fromDoc = extractSynopsisFromContentDoc(project.contentDoc);
  if (fromDoc) return fromDoc;
  const fromHtml = extractSynopsisFromHtml(project.content);
  if (fromHtml) return fromHtml;
  if (/^published via booktown$/i.test(fallbackDescription.trim())) {
    return "";
  }
  return truncateCleanly(fallbackDescription, 180);
}

function containsArabic(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value);
}

function deriveProjectLanguage(project: Record<string, unknown>, title: string, synopsis: string): string {
  const content = Array.isArray(asRecord(project.contentDoc)?.content)
    ? (asRecord(project.contentDoc)?.content as unknown[])
    : [];
  for (const entry of content) {
    const node = asRecord(entry);
    const lang = asNonEmptyString(asRecord(node?.attrs)?.lang).toLowerCase();
    if (lang === "ar" || lang === "en") {
      return lang;
    }
  }

  const titleAr = asNonEmptyString(project.titleAr);
  const titleEn = asNonEmptyString(project.titleEn);
  if (titleAr && !titleEn) return "ar";
  if (titleEn) return "en";
  return containsArabic(`${title} ${synopsis}`) ? "ar" : "en";
}

async function ensureCanonicalCoverAsset(params: {
  bookId: string;
  sourceUrl?: string;
}): Promise<string> {
  const sourceUrl = asNonEmptyString(params.sourceUrl);
  if (!sourceUrl) {
    return "";
  }

  const storagePath = `books/${params.bookId}/covers/medium.jpg`;
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  if (exists) {
    return storagePath;
  }

  let response: Response;
  try {
    response = await fetch(sourceUrl);
  } catch (error) {
    logger.error("[WRITE][PUBLISH_COVER_FETCH_FAILED]", {
      bookId: params.bookId,
      sourceUrl,
      error: String(error),
    });
    throw new HttpsError("failed-precondition", "Cover could not be copied for canonical discovery.");
  }

  if (!response.ok) {
    logger.error("[WRITE][PUBLISH_COVER_FETCH_BAD_STATUS]", {
      bookId: params.bookId,
      sourceUrl,
      status: response.status,
    });
    throw new HttpsError("failed-precondition", "Cover could not be copied for canonical discovery.");
  }

  const contentType = asNonEmptyString(response.headers.get("content-type"));
  if (!contentType.toLowerCase().startsWith("image/")) {
    logger.error("[WRITE][PUBLISH_COVER_INVALID_TYPE]", {
      bookId: params.bookId,
      sourceUrl,
      contentType,
    });
    throw new HttpsError("failed-precondition", "Cover must resolve to an image asset.");
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength <= 0 || arrayBuffer.byteLength > MAX_CANONICAL_COVER_BYTES) {
    logger.error("[WRITE][PUBLISH_COVER_INVALID_SIZE]", {
      bookId: params.bookId,
      sourceUrl,
      size: arrayBuffer.byteLength,
    });
    throw new HttpsError("failed-precondition", "Cover asset size is invalid for canonical discovery.");
  }

  await file.save(Buffer.from(arrayBuffer), {
    resumable: false,
    contentType,
    metadata: {
      cacheControl: "public, max-age=3600",
      metadata: {
        source: "write_publish",
        sourceUrl,
        bookId: params.bookId,
      },
    },
  });

  return storagePath;
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
    typeof doc.publishedWorkId !== "string" ||
    typeof doc.publishedEditionId !== "string" ||
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
    publishedWorkId: doc.publishedWorkId,
    publishedEditionId: doc.publishedEditionId,
    bookId: doc.bookId,
    editionId: doc.editionId,
    manifestationIds: Array.isArray(doc.manifestationIds)
      ? doc.manifestationIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : undefined,
  };
}

/**
 * publishWriteProject
 * Authoritative publish finalization with idempotent operation key.
 */
export const publishWriteProject = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
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
  const canonicalBookId = `write_${uid}_${canonicalProjectId}`;
  const canonicalEditionId = `edition_${canonicalBookId}`;
  const canonicalCoverPath = await ensureCanonicalCoverAsset({
    bookId: canonicalBookId,
    sourceUrl: normalizedCoverUrl,
  });

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
      const opData = opSnap.exists ? (opSnap.data() as Record<string, unknown>) : null;
      const cached =
        opData?.result && typeof opData.result === "object"
          ? mapPublishedDocToResult(opData.result as Record<string, unknown>)
          : null;

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

      const publishedWorkId = canonicalBookId;
      const publishedWorkRef = db.collection("published_works").doc(publishedWorkId);
      const publishedEditionRef = cached
        ? db.collection("published_editions").doc(cached.publishedEditionId)
        : db.collection("published_editions").doc();
      const publishedRef = cached
        ? userRef.collection("published_books").doc(cached.id)
        : userRef.collection("published_books").doc();
      const titleEn =
        typeof project.titleEn === "string" && project.titleEn.trim().length > 0
          ? project.titleEn.trim().slice(0, 180)
          : normalizedTitle;
      const titleAr =
        typeof project.titleAr === "string" && project.titleAr.trim().length > 0
          ? project.titleAr.trim().slice(0, 180)
          : normalizedTitle;
      const synopsis = deriveProjectSynopsis(project, normalizedDescription);
      const language = deriveProjectLanguage(project, normalizedTitle, synopsis);
      const searchableTitle = titleEn || titleAr || normalizedTitle;

      const searchFields = buildSearchFieldsFromTextParts([
        searchableTitle,
        titleAr,
        authorName,
      ]);
      const canonicalDescription = synopsis || normalizedDescription;
      const canonicalCoverState = canonicalCoverPath ? "READY" : "FAILED";

      await materializeBookAuthorityInTransaction({
        tx,
        source: "write_publish",
        authorityStatus: "provisional",
        preferredBookId: canonicalBookId,
        allowIdentityReuse: false,
        createEdition: true,
        explicitEditionId: canonicalEditionId,
        ingestionKey: `write_publish:${uid}:${canonicalProjectId}`,
        extraIdentityKeys: [`source:write_publish:${uid}:${canonicalProjectId}`],
        coverCandidates: canonicalCoverPath ? [canonicalCoverPath] : [],
        literaryAuthorityClass: "standard_work",
        rawBook: {
          id: canonicalBookId,
          bookId: canonicalBookId,
          title: searchableTitle,
          titleEn,
          titleAr,
          author: authorName,
          authorEn: authorName,
          authorAr: authorName,
          authors: [authorName],
          description: canonicalDescription,
          descriptionEn: canonicalDescription,
          descriptionAr: canonicalDescription,
          language,
          source: "write_publish",
          ownerId: uid,
          ownerUid: uid,
          projectId: canonicalProjectId,
          publishedWorkId,
          publishedEditionId: publishedEditionRef.id,
          visibility: "public",
          publicationState: "published",
          coverUrl: canonicalCoverPath,
        },
      });

      const epubManifestationId = setExternalFileManifestationInTransaction(tx, {
        bookId: canonicalBookId,
        editionId: canonicalEditionId,
        sourceId: `write_publish:${uid}:${canonicalProjectId}:epub`,
        externalUrl: normalizedEpubUrl,
        format: "epub",
        now,
      });
      const pdfManifestationId = setExternalFileManifestationInTransaction(tx, {
        bookId: canonicalBookId,
        editionId: canonicalEditionId,
        sourceId: `write_publish:${uid}:${canonicalProjectId}:pdf`,
        externalUrl: normalizedPdfUrl,
        format: "pdf",
        now,
      });
      const manifestationIds = [epubManifestationId, pdfManifestationId];

      tx.set(
        db.collection("books").doc(canonicalBookId),
        {
          primaryEditionId: canonicalEditionId,
          editionId: canonicalEditionId,
          canonicalRelations: {
            primaryEditionId: canonicalEditionId,
          },
          synopsis: canonicalDescription,
          publishedAt: nowIso,
          publishedWorkId,
          publishedEditionId: publishedEditionRef.id,
          publishingEvidence: {
            publishedWorkId,
            publishedEditionId: publishedEditionRef.id,
            projectId: canonicalProjectId,
            operationId: canonicalOperationId,
            manifestationIds,
            updatedAt: now,
          },
          coverState: canonicalCoverState,
          cover: {
            state: canonicalCoverState,
            original: canonicalCoverPath,
            medium: canonicalCoverPath,
            large: canonicalCoverPath,
            small: canonicalCoverPath,
          },
          coverUrl: canonicalCoverPath,
          recentActivityAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      if (cached) {
        return cached;
      }

      tx.set(
        publishedWorkRef,
        {
          authorId: uid,
          ownerId: uid,
          projectId: canonicalProjectId,
          source: "write-publish",
          authorityRole: "workflow_evidence",
          canonicalBookId,
          canonicalWorkId: canonicalBookId,
          primaryEditionId: canonicalEditionId,
          visibility: "private",
          title: normalizedTitle,
          titleEn,
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

      tx.set(publishedEditionRef, {
        editionId: publishedEditionRef.id,
        publishedEditionId: publishedEditionRef.id,
        authorityRole: "workflow_evidence",
        evidenceKind: "edition_proposal",
        canonicalEditionId,
        bookId: canonicalBookId,
        workId: canonicalBookId,
        publishedWorkId,
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
        source: "write-publish",
        proposalTarget: {
          workId: canonicalBookId,
          editionId: canonicalEditionId,
        },
        manifestationProposal: {
          manifestationIds,
          files: {
            epubUrl: normalizedEpubUrl,
            pdfUrl: normalizedPdfUrl,
          },
        },
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
        publishedWorkId,
        publishedEditionId: publishedEditionRef.id,
        bookId: canonicalBookId,
        editionId: canonicalEditionId,
        manifestationIds,
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
          publishedEditionId: publishedEditionRef.id,
          publishedWorkId,
          publishedAt: now,
          canonicalBookId,
          primaryEditionId: canonicalEditionId,
          manifestationIds,
          updatedAt: now,
          revision: nextRevision,
        },
        { merge: true }
      );

      tx.set(publishOpRef, {
        operationId: canonicalOperationId,
        projectId: canonicalProjectId,
        publishedBookId: publishedRef.id,
        publishedEditionId: publishedEditionRef.id,
        publishedWorkId,
        canonicalEditionId,
        editionId: canonicalEditionId,
        bookId: canonicalBookId,
        manifestationIds,
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
