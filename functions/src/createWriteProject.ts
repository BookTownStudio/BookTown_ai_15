import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "./firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { assertActiveAuthenticatedUser } from "./shared/auth";

/**
 * createWriteProject
 * Authoritative materialization of writing projects.
 * Enforces FIRESTORE as the only valid authority for persistent project IDs.
 */
export const createWriteProject = onCall({ cors: true }, async (request) => {
  // 1. Log Entry (Observability Requirement)
  logger.info("[WRITE][ENTRY] Materialization request received.");

  // 2. Authentication Enforcement
  const caller = await assertActiveAuthenticatedUser(request.auth);

  const { project } = request.data as {
    project?: {
      titleEn?: unknown;
      titleAr?: unknown;
      content?: unknown;
      wordCount?: unknown;
      status?: unknown;
      typeEn?: unknown;
      typeAr?: unknown;
    };
  };
  const uid = caller.uid;

  // 3. Validation
  if (!project) {
    logger.error(`[WRITE][FAILURE] UID: ${uid} - Missing project data.`);
    throw new HttpsError("invalid-argument", "Missing project data payload.");
  }

  const db = admin.firestore();
  
  const normalizeString = (value: unknown, fallback: string, max = 300): string => {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim();
    if (!normalized) return fallback;
    return normalized.slice(0, max);
  };

  const normalizeContent = (value: unknown): string => {
    if (typeof value !== "string") return "";
    return value.slice(0, 2_000_000);
  };

  const normalizeWordCount = (value: unknown): number => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
    return Math.floor(value);
  };

  const normalizeStatus = (value: unknown): "Idea" | "Draft" | "Revision" | "Final" => {
    if (value === "Idea" || value === "Draft" || value === "Revision" || value === "Final") {
      return value;
    }
    return "Draft";
  };

  // 4. Construct Canonical Payload (Enforcement Model)
  // Ensures server-side control over timestamps and core fields
  const now = admin.firestore.Timestamp.now();
  const isoNow = now.toDate().toISOString();

  // ADHERENCE: Mapping fields to required names in spec (ownerId, status, etc)
  const projectData = {
    // Authority Fields
    ownerId: uid,
    uid: uid, // Compatibility with existing fetching logic
    
    // Identity Fields
    title: normalizeString(project.titleEn, "Untitled Project", 180),
    titleEn: normalizeString(project.titleEn, "Untitled Project", 180),
    titleAr: normalizeString(project.titleAr, "مشروع غير معنون", 180),
    
    // Content Data
    content: normalizeContent(project.content),
    wordCount: normalizeWordCount(project.wordCount),
    
    // Lifecycle Metadata
    status: normalizeStatus(project.status),
    typeEn: normalizeString(project.typeEn, "Draft", 80),
    typeAr: normalizeString(project.typeAr, "مسودة", 80),
    isPublished: false,
    revision: 1,
    
    // Timestamps (Authoritative Server Source)
    createdAt: now,
    updatedAt: now,
    
    // Audit Information
    source: "write-editor",
    version: 1
  };

  try {
    // 5. Authoritative Write (MUST exist before response)
    // We use the nested path users/{uid}/projects for ownership isolation
    const docRef = await db.collection('users').doc(uid).collection('projects').add(projectData);
    
    // 6. Post-Commit Verification
    if (!docRef.id) {
        throw new Error("Firestore write failed: No ID returned.");
    }

    logger.info(`[WRITE][COMMIT] Project materialized at ${docRef.path}`);

    // 7. Log Exit & Return
    logger.info(`[WRITE][EXIT] Materialization success. ID: ${docRef.id}`);

    // ADHERENCE: Returning documentRef.path and canonicalId
    return {
      ...projectData,
      id: docRef.id,
      canonicalId: docRef.id,
      path: docRef.path,
      createdAt: isoNow,
      updatedAt: isoNow
    };

  } catch (error: any) {
    logger.error(`[WRITE][FAILURE] Firestore commit failed: ${error.message}`, { error });
    
    // ADHERENCE: Throwing specific internal error on failure
    throw new HttpsError(
      "internal", 
      `PROJECT_NOT_PERSISTED: Project materialization failed: Firestore write not committed. ${error.message}`
    );
  }
});
