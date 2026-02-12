import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "./firebaseAdmin";
import * as logger from "firebase-functions/logger";

/**
 * createWriteProject
 * Authoritative materialization of writing projects.
 * Enforces FIRESTORE as the only valid authority for persistent project IDs.
 */
export const createWriteProject = onCall({ cors: true }, async (request) => {
  // 1. Log Entry (Observability Requirement)
  logger.info("[WRITE][ENTRY] Materialization request received.");

  // 2. Authentication Enforcement
  if (!request.auth) {
    logger.error("[WRITE][FAILURE] Unauthenticated materialization attempt.");
    throw new HttpsError("unauthenticated", "Project materialization failed: User is not authenticated.");
  }

  const { project } = request.data;
  const uid = request.auth.uid;

  // 3. Validation
  if (!project) {
    logger.error(`[WRITE][FAILURE] UID: ${uid} - Missing project data.`);
    throw new HttpsError("invalid-argument", "Missing project data payload.");
  }

  const db = admin.firestore();
  
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
    title: project.titleEn || project.title || 'Untitled Project',
    titleEn: project.titleEn || 'Untitled Project',
    titleAr: project.titleAr || 'مشروع غير معنون',
    
    // Content Data
    content: project.content || '',
    wordCount: project.wordCount || 0,
    
    // Lifecycle Metadata
    status: project.status || 'Draft',
    typeEn: project.typeEn || 'Draft',
    typeAr: project.typeAr || 'مسودة',
    isPublished: false,
    
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