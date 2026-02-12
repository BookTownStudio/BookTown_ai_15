import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "./firebaseAdmin";
import * as logger from "firebase-functions/logger";

/**
 * deleteWriteProject
 * Firebase Callable Function for authoritative project deletion.
 * Guarantees that only the owner can delete their own project.
 */
export const deleteWriteProject = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    logger.error("Project deletion failed: Unauthenticated request.");
    throw new HttpsError("unauthenticated", "User must be authenticated to delete a project.");
  }

  const { projectId } = request.data;
  const uid = request.auth.uid;

  if (!projectId) {
    throw new HttpsError("invalid-argument", "The function must be called with a valid projectId.");
  }

  const db = admin.firestore();

  try {
    logger.info(`Deleting project ${projectId} for user ${uid}`);
    await db.collection('users').doc(uid).collection('projects').doc(projectId).delete();
    
    return { success: true };
  } catch (error: any) {
    logger.error(`CRITICAL: Project deletion failed for ${projectId}:`, error);
    throw new HttpsError("internal", "Failed to delete project on server.");
  }
});