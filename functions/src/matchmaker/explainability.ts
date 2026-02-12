import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

export interface ExplainabilityLogParams {
  userId: string;
  profileCompletionScore: number;
  confidenceMultiplier: number;
  applied: boolean;
  reason?: "low_profile_completion";
}

/**
 * logMatchmakerExplainability
 * ------------------------------------------------
 * Authority: Read-Only diagnostic sink for recommendation logic.
 * Gated by MATCHMAKER_DEBUG env flag.
 *
 * Behavior:
 * - Async, fire-and-forget.
 * - Silent failure (swallows Firestore errors).
 * - No impact on MatchMaker latency or outcomes.
 */
export function logMatchmakerExplainability(params: ExplainabilityLogParams): void {
  // Gating Enforcement
  if (process.env.MATCHMAKER_DEBUG !== 'true') return;

  // Non-blocking execution
  (async () => {
    try {
      await db.collection("matchmaker_explainability_v1").add({
        ...params,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Passive observability failure
      logger.debug("[MATCHMAKER][EXPLAINABILITY_LOG_FAILED] Dropping dev log:", error);
    }
  })();
}
