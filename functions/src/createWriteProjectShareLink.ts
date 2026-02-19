import { randomBytes } from "crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "./firebaseAdmin";

const DEFAULT_SHARE_ORIGIN = "https://booktown-ai.web.app";

type ShareResult = {
  projectId: string;
  token: string;
  shareUrl: string;
  isRevoked: boolean;
  createdAt: string;
  updatedAt: string;
};

function normalizeOrigin(value: unknown): string {
  if (value == null) return DEFAULT_SHARE_ORIGIN;
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", "origin must be a valid URL when provided.");
  }

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new HttpsError("invalid-argument", "origin must be a valid URL when provided.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HttpsError("invalid-argument", "origin must use http or https.");
  }

  return `${parsed.protocol}//${parsed.host}`;
}

function buildShareUrl(origin: string, token: string): string {
  return `${origin}/project/share/${token}`;
}

function createShareToken(): string {
  return randomBytes(24).toString("hex");
}

/**
 * createWriteProjectShareLink
 * Creates or reuses a deterministic, revocable share token for a project.
 */
export const createWriteProjectShareLink = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const uid = request.auth.uid;
  const { projectId, origin } = request.data as {
    projectId?: unknown;
    origin?: unknown;
  };

  if (typeof projectId !== "string" || !projectId.trim()) {
    throw new HttpsError("invalid-argument", "A valid projectId is required.");
  }

  const canonicalProjectId = projectId.trim();
  const normalizedOrigin = normalizeOrigin(origin);

  const db = admin.firestore();
  const projectRef = db.collection("users").doc(uid).collection("projects").doc(canonicalProjectId);
  const shareRef = db
    .collection("users")
    .doc(uid)
    .collection("project_share_links")
    .doc(canonicalProjectId);

  try {
    const result = await db.runTransaction<ShareResult>(async (tx) => {
      const projectSnap = await tx.get(projectRef);
      if (!projectSnap.exists) {
        throw new HttpsError("not-found", "Project was not found.");
      }

      const now = admin.firestore.Timestamp.now();
      const nowIso = now.toDate().toISOString();

      const existingShareSnap = await tx.get(shareRef);
      const existing = existingShareSnap.exists
        ? (existingShareSnap.data() as Record<string, unknown>)
        : null;

      const hasReusableToken =
        existing != null &&
        existing.isRevoked !== true &&
        typeof existing.token === "string" &&
        existing.token.trim().length > 0;

      if (hasReusableToken) {
        const token = (existing!.token as string).trim();
        const existingCreatedAt =
          existing!.createdAt instanceof admin.firestore.Timestamp
            ? existing!.createdAt.toDate().toISOString()
            : nowIso;

        tx.set(
          shareRef,
          {
            updatedAt: now,
            shareUrl: buildShareUrl(normalizedOrigin, token),
            origin: normalizedOrigin,
            isRevoked: false,
          },
          { merge: true }
        );

        tx.set(
          db.collection("write_project_shares").doc(token),
          {
            ownerId: uid,
            projectId: canonicalProjectId,
            token,
            isRevoked: false,
            updatedAt: now,
          },
          { merge: true }
        );

        tx.set(
          projectRef,
          {
            shareEnabled: true,
            shareToken: token,
            shareUpdatedAt: now,
            updatedAt: now,
          },
          { merge: true }
        );

        return {
          projectId: canonicalProjectId,
          token,
          shareUrl: buildShareUrl(normalizedOrigin, token),
          isRevoked: false,
          createdAt: existingCreatedAt,
          updatedAt: nowIso,
        };
      }

      const previousToken =
        existing != null && typeof existing.token === "string" && existing.token.trim().length > 0
          ? existing.token.trim()
          : null;

      const token = createShareToken();
      const shareUrl = buildShareUrl(normalizedOrigin, token);
      const createdAt =
        existing != null && existing.createdAt instanceof admin.firestore.Timestamp
          ? existing.createdAt
          : now;

      if (previousToken) {
        tx.set(
          db.collection("write_project_shares").doc(previousToken),
          {
            isRevoked: true,
            revokedAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
      }

      tx.set(
        shareRef,
        {
          ownerId: uid,
          projectId: canonicalProjectId,
          token,
          shareUrl,
          origin: normalizedOrigin,
          isRevoked: false,
          createdAt,
          updatedAt: now,
        },
        { merge: true }
      );

      tx.set(
        db.collection("write_project_shares").doc(token),
        {
          ownerId: uid,
          projectId: canonicalProjectId,
          token,
          isRevoked: false,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      tx.set(
        projectRef,
        {
          shareEnabled: true,
          shareToken: token,
          shareUpdatedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      return {
        projectId: canonicalProjectId,
        token,
        shareUrl,
        isRevoked: false,
        createdAt: createdAt.toDate().toISOString(),
        updatedAt: nowIso,
      };
    });

    return result;
  } catch (error) {
    logger.error("[WRITE][SHARE_LINK_CREATE_FAILED]", {
      uid,
      projectId: canonicalProjectId,
      error,
    });
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to create project share link.");
  }
});
