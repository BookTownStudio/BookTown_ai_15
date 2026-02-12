import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { recomputeUserStats } from "../userStats/recomputeUserStats";
import * as logger from "firebase-functions/logger";

/**
 * onUserProfileUpdated
 * ------------------------------------------------
 * Trigger: onUpdate(users/{uid})
 * 
 * Ensures Profile Completion Score (PCS) is updated when bio or avatar change.
 */
export const onUserProfileUpdated = onDocumentUpdated("users/{uid}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (!before || !after) return;

  const bioChanged = before.bioEn !== after.bioEn || before.bioAr !== after.bioAr;
  const avatarChanged = before.avatarUrl !== after.avatarUrl;

  if (bioChanged || avatarChanged) {
    logger.info(`[STATS][TRIGGER] Profile change detected for ${event.params.uid}`);
    await recomputeUserStats(event.params.uid);
  }
});