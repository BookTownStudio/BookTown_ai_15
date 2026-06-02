export type FirestoreRiskClass = "low" | "medium" | "high" | "critical";

export type FirestoreExecutionEnvironment = "development" | "staging" | "production" | "test";

export type FirestoreScanMode = "read" | "dryRun";

export type FirestoreSafetyContext = {
  readonly operationName: string;
  readonly riskClass: FirestoreRiskClass;
  readonly environment: FirestoreExecutionEnvironment;
  readonly maxReads: number;
  readonly pageSize: number;
  readonly mode: FirestoreScanMode;
  readonly requestedBy?: string;
  readonly reason?: string;
};

export type FirestoreSafetyDecision = {
  readonly allowed: boolean;
  readonly estimatedReads: number;
  readonly maxReads: number;
  readonly reason?: string;
};

export type FirestoreReadBudget = {
  readonly operationName: string;
  readonly maxReads: number;
  readonly usedReads: number;
};

