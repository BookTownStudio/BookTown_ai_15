import { HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";

const db = admin.firestore();

export type PostVisibility = "public" | "followers" | "private" | "restricted";

type PostAccessParams = {
  postId: string;
  postData: Record<string, unknown>;
  viewerUid: string;
  transaction?: FirebaseFirestore.Transaction;
};

const FORBIDDEN_ERROR = "POST_INTERACTION_FORBIDDEN";

export function resolvePostVisibility(postData: Record<string, unknown>): PostVisibility {
  const rawVisibility = postData.visibility;
  if (typeof rawVisibility === "string") {
    const normalized = rawVisibility.trim().toLowerCase();
    if (
      normalized === "public" ||
      normalized === "followers" ||
      normalized === "private" ||
      normalized === "restricted"
    ) {
      return normalized;
    }
  }

  if (
    rawVisibility &&
    typeof rawVisibility === "object" &&
    typeof (rawVisibility as { scope?: unknown }).scope === "string"
  ) {
    const normalized = (rawVisibility as { scope: string }).scope.trim().toLowerCase();
    if (
      normalized === "public" ||
      normalized === "followers" ||
      normalized === "private" ||
      normalized === "restricted"
    ) {
      return normalized;
    }
  }

  return "private";
}

function resolvePostStatus(postData: Record<string, unknown>): string {
  const rawStatus = postData.status;
  if (typeof rawStatus !== "string" || rawStatus.trim().length === 0) {
    return "published";
  }
  return rawStatus.trim().toLowerCase();
}

function resolvePostAuthorId(postData: Record<string, unknown>): string {
  const rawAuthorId = postData.authorId;
  return typeof rawAuthorId === "string" ? rawAuthorId.trim() : "";
}

async function isFollowerOfAuthor(
  authorId: string,
  viewerUid: string,
  transaction?: FirebaseFirestore.Transaction
): Promise<boolean> {
  if (!authorId || !viewerUid) return false;
  const followRef = db.collection("users").doc(authorId).collection("followers").doc(viewerUid);
  const followSnap = transaction
    ? await transaction.get(followRef)
    : await followRef.get();
  return followSnap.exists;
}

export async function assertViewerCanInteractWithPost({
  postId,
  postData,
  viewerUid,
  transaction,
}: PostAccessParams): Promise<{ authorId: string; visibility: PostVisibility }> {
  if (!viewerUid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  if (!postId || !postId.trim()) {
    throw new HttpsError("invalid-argument", "postId required.");
  }

  const authorId = resolvePostAuthorId(postData);
  if (!authorId) {
    throw new HttpsError("permission-denied", FORBIDDEN_ERROR);
  }

  const visibility = resolvePostVisibility(postData);
  const status = resolvePostStatus(postData);
  const isDeleted = postData.isDeleted === true || status === "deleted";

  if (isDeleted || status !== "published" || visibility === "restricted") {
    throw new HttpsError("permission-denied", FORBIDDEN_ERROR);
  }

  if (visibility === "public") {
    return { authorId, visibility };
  }

  if (viewerUid === authorId) {
    return { authorId, visibility };
  }

  if (visibility === "followers") {
    const followsAuthor = await isFollowerOfAuthor(authorId, viewerUid, transaction);
    if (followsAuthor) {
      return { authorId, visibility };
    }
  }

  throw new HttpsError("permission-denied", FORBIDDEN_ERROR);
}
