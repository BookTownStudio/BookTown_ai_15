import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "./firebaseAdmin";
import { assertActiveAuthenticatedUser } from "./shared/auth";
import { normalizePublicationVisibility } from "./rights/bookRights";

function asNonEmptyString(value: unknown, max = 512): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeProjectId(value: unknown): string {
  const projectId = asNonEmptyString(value, 256);
  if (!projectId) {
    throw new HttpsError("invalid-argument", "A valid projectId is required.");
  }
  return projectId;
}

export const getProjectPublicationSettings = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const projectId = normalizeProjectId((request.data as { projectId?: unknown }).projectId);
  const db = admin.firestore();
  const projectRef = db
    .collection("users")
    .doc(caller.uid)
    .collection("projects")
    .doc(projectId);

  const projectSnap = await projectRef.get();
  if (!projectSnap.exists) {
    throw new HttpsError("not-found", "Project not found.");
  }

  const project = (projectSnap.data() ?? {}) as Record<string, unknown>;
  const publishedPublicationId = asNonEmptyString(project.publishedPublicationId, 256);
  const publishedBookId = asNonEmptyString(project.publishedBookId, 256);

  const [publicationSnap, bookSnap] = await Promise.all([
    publishedPublicationId
      ? db.collection("longform_publications").doc(publishedPublicationId).get()
      : Promise.resolve(null),
    publishedBookId ? db.collection("books").doc(publishedBookId).get() : Promise.resolve(null),
  ]);

  const result: {
    projectId: string;
    blog?: { publicationId: string; visibility: "public" | "private" };
    ebook?: { bookId: string; visibility: "public" | "private" };
  } = {
    projectId,
  };

  if (publicationSnap?.exists) {
    const publication = (publicationSnap.data() ?? {}) as Record<string, unknown>;
    const ownerUid = asNonEmptyString(publication.ownerUid, 256);
    if (ownerUid === caller.uid) {
      result.blog = {
        publicationId: publicationSnap.id,
        visibility: normalizePublicationVisibility(publication.visibility),
      };
    }
  }

  if (bookSnap?.exists) {
    const book = (bookSnap.data() ?? {}) as Record<string, unknown>;
    const ownerUid =
      asNonEmptyString(book.ownerUid, 256) || asNonEmptyString(book.ownerId, 256);
    if (ownerUid === caller.uid) {
      result.ebook = {
        bookId: bookSnap.id,
        visibility: normalizePublicationVisibility(book.visibility),
      };
    }
  }

  return result;
});
