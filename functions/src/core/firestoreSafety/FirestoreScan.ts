import * as logger from "firebase-functions/logger";
import { HttpsError } from "firebase-functions/v2/https";
import { FieldPath } from "firebase-admin/firestore";

import { consumeFirestoreReads, createFirestoreReadBudget, validateFirestoreSafetyContext } from "./FirestoreBudget";
import { FIRESTORE_MAX_PAGE_SIZE, FIRESTORE_MAX_PRODUCTION_SCAN_READS } from "./FirestoreLimits";
import type { FirestoreSafetyContext } from "./FirestoreTypes";

type QueryDocumentSnapshot = FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>;

export type FirestoreSafePageResult = {
  readonly docs: QueryDocumentSnapshot[];
  readonly readsUsed: number;
  readonly nextCursor: string | null;
  readonly dryRun: boolean;
};

export async function readFirestoreCollectionPage(
  collectionRef: FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>,
  context: FirestoreSafetyContext,
  cursorDocId?: string | null
): Promise<FirestoreSafePageResult> {
  validateFirestoreSafetyContext(context);

  if (context.environment === "production" && context.maxReads > FIRESTORE_MAX_PRODUCTION_SCAN_READS) {
    throw new HttpsError("failed-precondition", "Production Firestore scan exceeds beta safety ceiling.", {
      operationName: context.operationName,
      maxReads: context.maxReads,
      ceiling: FIRESTORE_MAX_PRODUCTION_SCAN_READS,
    });
  }

  const pageSize = Math.min(context.pageSize, context.maxReads, FIRESTORE_MAX_PAGE_SIZE);
  const budget = createFirestoreReadBudget(context);

  logger.info("[FIRESTORE_SAFETY][SCAN_REQUESTED]", {
    operationName: context.operationName,
    riskClass: context.riskClass,
    environment: context.environment,
    pageSize,
    maxReads: context.maxReads,
    mode: context.mode,
    requestedBy: context.requestedBy ?? null,
    reason: context.reason ?? null,
    collectionPath: collectionRef.path,
  });

  if (context.mode === "dryRun") {
    return {
      docs: [],
      readsUsed: 0,
      nextCursor: null,
      dryRun: true,
    };
  }

  let query = collectionRef.orderBy(FieldPath.documentId()).limit(pageSize);
  if (cursorDocId) {
    query = query.startAfter(cursorDocId);
  }

  const snap = await query.get();
  const nextBudget = consumeFirestoreReads(budget, snap.size);
  const lastDoc = snap.docs[snap.docs.length - 1] ?? null;

  logger.info("[FIRESTORE_SAFETY][SCAN_COMPLETED]", {
    operationName: context.operationName,
    riskClass: context.riskClass,
    readsUsed: nextBudget.usedReads,
    maxReads: nextBudget.maxReads,
    returnedDocs: snap.size,
    nextCursor: lastDoc?.id ?? null,
  });

  return {
    docs: snap.docs,
    readsUsed: nextBudget.usedReads,
    nextCursor: lastDoc?.id ?? null,
    dryRun: false,
  };
}

