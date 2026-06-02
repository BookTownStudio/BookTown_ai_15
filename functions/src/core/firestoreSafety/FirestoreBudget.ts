import { HttpsError } from "firebase-functions/v2/https";

import { FIRESTORE_RISK_MAX_READS } from "./FirestoreLimits";
import type { FirestoreReadBudget, FirestoreSafetyContext } from "./FirestoreTypes";

export function createFirestoreReadBudget(context: FirestoreSafetyContext): FirestoreReadBudget {
  validateFirestoreSafetyContext(context);
  return {
    operationName: context.operationName,
    maxReads: context.maxReads,
    usedReads: 0,
  };
}

export function consumeFirestoreReads(
  budget: FirestoreReadBudget,
  reads: number
): FirestoreReadBudget {
  if (!Number.isInteger(reads) || reads < 0) {
    throw new HttpsError("invalid-argument", "Firestore read consumption must be a non-negative integer.");
  }

  const usedReads = budget.usedReads + reads;
  if (usedReads > budget.maxReads) {
    throw new HttpsError("resource-exhausted", "Firestore read budget exceeded.", {
      operationName: budget.operationName,
      usedReads,
      maxReads: budget.maxReads,
    });
  }

  return {
    ...budget,
    usedReads,
  };
}

export function validateFirestoreSafetyContext(context: FirestoreSafetyContext): void {
  if (!context.operationName.trim()) {
    throw new HttpsError("invalid-argument", "Firestore operationName is required.");
  }
  if (!Number.isInteger(context.maxReads) || context.maxReads <= 0) {
    throw new HttpsError("invalid-argument", "Firestore maxReads must be a positive integer.");
  }
  if (!Number.isInteger(context.pageSize) || context.pageSize <= 0) {
    throw new HttpsError("invalid-argument", "Firestore pageSize must be a positive integer.");
  }

  const riskMaxReads = FIRESTORE_RISK_MAX_READS[context.riskClass];
  if (riskMaxReads === 0) {
    throw new HttpsError("failed-precondition", "Critical Firestore scans are prohibited in production code.", {
      operationName: context.operationName,
      riskClass: context.riskClass,
    });
  }
  if (context.maxReads > riskMaxReads) {
    throw new HttpsError("failed-precondition", "Firestore read budget exceeds risk-class limit.", {
      operationName: context.operationName,
      riskClass: context.riskClass,
      maxReads: context.maxReads,
      riskMaxReads,
    });
  }
}

