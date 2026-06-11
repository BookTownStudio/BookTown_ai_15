import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { DocumentReference, QuerySnapshot } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import { assertActiveAuthenticatedUser } from "../shared/auth";

const db = admin.firestore();
const bucket = admin.storage().bucket();

const MAX_BATCH_WRITES = 450;
const MAX_QUERY_DELETE_DOCS = 500;

type DeleteUserUploadBookRequest = {
  bookId?: unknown;
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function assertBookId(value: unknown): string {
  const bookId = asNonEmptyString(value);
  if (!bookId || bookId.length > 128 || bookId.includes("/")) {
    throw new HttpsError("invalid-argument", "Invalid bookId.");
  }
  return bookId;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function docRefFromPath(path: string): DocumentReference | null {
  const parts = path.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  if (parts.some((part) => part.includes(".."))) return null;
  return db.collection(parts[0]).doc(parts[1]);
}

function collectManifestDocPathRefs(
  manifest: Record<string, unknown>,
  refs: Map<string, DocumentReference>
): void {
  const fields = [
    "locationMap",
    "searchIndex",
    "highlightAnchors",
    "chapterMap",
    "sectionMap",
    "stableAnchors",
    "spineMap",
    "sectionGraph",
    "stableAnchorMap",
    "navigationIndex",
    "paginationHints",
    "literaryCoordinateMap",
    "passageIndex",
    "annotationIdentityIndex",
    "literaryMemoryPrimitives",
  ];

  for (const field of fields) {
    const record = asRecord(manifest[field]);
    const docPath = asNonEmptyString(record?.docPath);
    if (!docPath) continue;
    const ref = docRefFromPath(docPath);
    if (ref) refs.set(ref.path, ref);
  }
}

function addQueryDocs(
  refs: Map<string, DocumentReference>,
  snap: QuerySnapshot,
  predicate?: (data: Record<string, unknown>) => boolean
): void {
  if (snap.size >= MAX_QUERY_DELETE_DOCS) {
    throw new HttpsError(
      "resource-exhausted",
      "Uploaded book cleanup exceeded the bounded cascade limit."
    );
  }

  for (const doc of snap.docs) {
    if (predicate && !predicate((doc.data() || {}) as Record<string, unknown>)) {
      continue;
    }
    refs.set(doc.ref.path, doc.ref);
  }
}

async function deleteFirestoreRefs(
  refs: Iterable<DocumentReference>
): Promise<number> {
  const uniqueRefs = Array.from(new Map(Array.from(refs).map((ref) => [ref.path, ref])).values());
  let deleted = 0;

  for (let index = 0; index < uniqueRefs.length; index += MAX_BATCH_WRITES) {
    const batch = db.batch();
    const chunk = uniqueRefs.slice(index, index + MAX_BATCH_WRITES);
    for (const ref of chunk) {
      batch.delete(ref);
    }
    await batch.commit();
    deleted += chunk.length;
  }

  return deleted;
}

async function deleteStoragePrefix(prefix: string): Promise<number> {
  const [files] = await bucket.getFiles({ prefix });
  await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
  return files.length;
}

async function collectCascadeRefs(params: {
  uid: string;
  bookId: string;
}): Promise<Map<string, DocumentReference>> {
  const { uid, bookId } = params;
  const refs = new Map<string, DocumentReference>();

  const manifestRef = db.collection("reader_manifests").doc(bookId);
  const manifestSnap = await manifestRef.get();
  if (manifestSnap.exists) {
    refs.set(manifestRef.path, manifestRef);
    collectManifestDocPathRefs((manifestSnap.data() || {}) as Record<string, unknown>, refs);
  }

  const directDocRefs = [
    db.collection("books").doc(bookId),
    db.collection("editions").doc(`uploaded:${bookId}`),
    db.collection("cover_jobs").doc(bookId),
    db.collection("coverJobs").doc(bookId),
    db.collection("upload_metadata_jobs").doc(bookId),
    db.collection("upload_canonical_candidate_jobs").doc(bookId),
    db.collection("reading_progress").doc(`${uid}_${bookId}`),
    db.collection("reading_sessions").doc(`${uid}_${bookId}`),
    db.collection("reader_location_map").doc(bookId),
    db.collection("reader_search_index").doc(bookId),
    db.collection("reader_highlight_anchors").doc(bookId),
    db.collection("reader_chapter_map").doc(bookId),
    db.collection("reader_section_map").doc(bookId),
    db.collection("reader_stable_anchors").doc(bookId),
    db.collection("reader_spine_map").doc(bookId),
    db.collection("reader_section_graph").doc(bookId),
    db.collection("reader_stable_anchor_map").doc(bookId),
    db.collection("reader_navigation_index").doc(bookId),
    db.collection("reader_pagination_hints").doc(bookId),
    db.collection("reader_literary_coordinate_map").doc(bookId),
    db.collection("reader_passage_index").doc(bookId),
    db.collection("reader_annotation_identity_index").doc(bookId),
    db.collection("reader_literary_memory_primitives").doc(bookId),
  ];

  for (const ref of directDocRefs) {
    refs.set(ref.path, ref);
  }

  const [
    shelfEntriesSnap,
    readingProgressSnap,
    readingSessionsByUserIdSnap,
    readerHighlightsSnap,
    readerBookmarksSnap,
    readerEventsSnap,
    readerAuditSnap,
    readerSyncSnap,
    identitySnap,
    ingestionSnap,
  ] = await Promise.all([
    db.collection("shelf_books").where("bookId", "==", bookId).limit(MAX_QUERY_DELETE_DOCS).get(),
    db.collection("reading_progress").where("bookId", "==", bookId).limit(MAX_QUERY_DELETE_DOCS).get(),
    db.collection("reading_sessions").where("bookId", "==", bookId).limit(MAX_QUERY_DELETE_DOCS).get(),
    db.collection("reader_highlights").where("bookId", "==", bookId).limit(MAX_QUERY_DELETE_DOCS).get(),
    db.collection("reader_bookmarks").where("bookId", "==", bookId).limit(MAX_QUERY_DELETE_DOCS).get(),
    db.collection("reader_events").where("bookId", "==", bookId).limit(MAX_QUERY_DELETE_DOCS).get(),
    db.collection("reader_audit").where("bookId", "==", bookId).limit(MAX_QUERY_DELETE_DOCS).get(),
    db.collection("reader_sync_idempotency").where("bookId", "==", bookId).limit(MAX_QUERY_DELETE_DOCS).get(),
    db
      .collection("book_identity")
      .where("bookId", "==", bookId)
      .limit(MAX_QUERY_DELETE_DOCS)
      .get(),
    db
      .collection("book_ingestions")
      .where("bookId", "==", bookId)
      .limit(MAX_QUERY_DELETE_DOCS)
      .get(),
  ]);

  addQueryDocs(refs, shelfEntriesSnap, (data) => asNonEmptyString(data.ownerId) === uid);
  addQueryDocs(
    refs,
    readingProgressSnap,
    (data) => asNonEmptyString(data.uid) === uid || asNonEmptyString(data.userId) === uid
  );
  addQueryDocs(refs, readingSessionsByUserIdSnap, (data) => asNonEmptyString(data.userId) === uid);
  addQueryDocs(refs, readerHighlightsSnap, (data) => asNonEmptyString(data.uid) === uid);
  addQueryDocs(refs, readerBookmarksSnap, (data) => asNonEmptyString(data.uid) === uid);
  addQueryDocs(refs, readerEventsSnap, (data) => asNonEmptyString(data.uid) === uid);
  addQueryDocs(refs, readerAuditSnap, (data) => asNonEmptyString(data.uid) === uid);
  addQueryDocs(refs, readerSyncSnap, (data) => asNonEmptyString(data.uid) === uid);
  addQueryDocs(refs, identitySnap);
  addQueryDocs(refs, ingestionSnap);

  return refs;
}

export const deleteUserUploadBook = onCall<DeleteUserUploadBookRequest>(
  { cors: true },
  async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);
    const uid = caller.uid;
    const bookId = assertBookId(request.data?.bookId);
    const bookRef = db.collection("books").doc(bookId);
    const bookSnap = await bookRef.get();

    if (!bookSnap.exists) {
      throw new HttpsError("not-found", "Uploaded book was not found.");
    }

    const bookData = (bookSnap.data() || {}) as Record<string, unknown>;
    if (asNonEmptyString(bookData.source) !== "user_upload") {
      throw new HttpsError("failed-precondition", "Only user-uploaded books can be deleted here.");
    }

    if (asNonEmptyString(bookData.ownerUid) !== uid) {
      throw new HttpsError("permission-denied", "Only the upload owner can delete this book.");
    }

    const storagePath = asNonEmptyString(bookData.storagePath);
    if (storagePath && !storagePath.startsWith(`books/${bookId}/original/`)) {
      throw new HttpsError("failed-precondition", "Uploaded book has an invalid storage path.");
    }

    const refs = await collectCascadeRefs({ uid, bookId });
    const [sourceFileCount, coverFileCount] = await Promise.all([
      deleteStoragePrefix(`books/${bookId}/original/`),
      deleteStoragePrefix(`books/${bookId}/covers/`),
    ]);
    const firestoreDeleted = await deleteFirestoreRefs(refs.values());

    logger.info("[USER_UPLOAD][DELETED]", {
      uid,
      bookId,
      firestoreDeleted,
      sourceFileCount,
      coverFileCount,
    });

    return {
      bookId,
      deleted: true as const,
      cascade: {
        firestoreDocuments: firestoreDeleted,
        sourceFiles: sourceFileCount,
        coverFiles: coverFileCount,
      },
    };
  }
);
