import { FieldPath, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { admin } from "../firebaseAdmin";
import {
  INTELLIGENCE_RECONCILE_USERS_PER_RUN,
  INTELLIGENCE_SCHEMA_VERSION,
} from "./types";
import {
  rebuildUserIntelligenceProfile,
  readProfileSourceHash,
} from "./profileBuilder";

const db = admin.firestore();

const CHECKPOINT_COLLECTION = "_ops";
const CHECKPOINT_DOC_ID = "intelligence_reconcile_checkpoint";

function metricLog(params: Record<string, unknown>): void {
  logger.info("[INTELLIGENCE][METRIC]", params);
}

export const scheduledIntelligenceProfileReconciliation = onSchedule(
  {
    schedule: "40 2 * * *",
    timeZone: "UTC",
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async () => {
    const checkpointRef = db.collection(CHECKPOINT_COLLECTION).doc(CHECKPOINT_DOC_ID);
    const checkpointSnap = await checkpointRef.get();

    const lastUid =
      checkpointSnap.exists && typeof checkpointSnap.get("lastUid") === "string"
        ? String(checkpointSnap.get("lastUid"))
        : null;

    let query = db
      .collection("user_intelligence_profiles")
      .orderBy(FieldPath.documentId())
      .limit(INTELLIGENCE_RECONCILE_USERS_PER_RUN);

    if (lastUid) {
      query = query.startAfter(lastUid);
    }

    let profileSnap = await query.get();

    if (profileSnap.empty && lastUid) {
      profileSnap = await db
        .collection("user_intelligence_profiles")
        .orderBy(FieldPath.documentId())
        .limit(INTELLIGENCE_RECONCILE_USERS_PER_RUN)
        .get();
    }

    if (profileSnap.empty) {
      await checkpointRef.set(
        {
          lastUid: null,
          runAt: FieldValue.serverTimestamp(),
          schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
        },
        { merge: true }
      );
      return;
    }

    let corrections = 0;
    let processed = 0;
    const failed: Array<{ uid: string; error: string }> = [];

    for (const profileDoc of profileSnap.docs) {
      const uid = profileDoc.id;
      processed += 1;

      try {
        const beforeHash = await readProfileSourceHash(uid);
        const result = await rebuildUserIntelligenceProfile({
          uid,
          signals: [],
          reconciliationMode: true,
        });

        if (result.updated || beforeHash !== result.sourceHash) {
          corrections += 1;
        }
      } catch (error) {
        failed.push({
          uid,
          error: String(error),
        });
      }
    }

    const nextLastUid = profileSnap.docs[profileSnap.docs.length - 1]?.id ?? null;

    await checkpointRef.set(
      {
        lastUid: nextLastUid,
        runAt: FieldValue.serverTimestamp(),
        processed,
        corrections,
        failedCount: failed.length,
        schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      },
      { merge: true }
    );

    metricLog({
      metric: "reconciliation_corrections",
      processed,
      corrections,
      failedCount: failed.length,
      checkpointTo: nextLastUid,
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
    });

    if (failed.length > 0) {
      logger.warn("[INTELLIGENCE][RECONCILE][FAILED_UIDS]", {
        failed,
      });
    }
  }
);
