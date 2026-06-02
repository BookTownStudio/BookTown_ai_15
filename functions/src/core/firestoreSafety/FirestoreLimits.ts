import type { FirestoreRiskClass } from "./FirestoreTypes";

export const FIRESTORE_BETA_MONTHLY_BUDGET_USD = 5;
export const FIRESTORE_BETA_MONTHLY_READ_LIMIT = 8_000_000;
export const FIRESTORE_BETA_DAILY_WARNING_READS = 50_000;
export const FIRESTORE_BETA_DAILY_HIGH_READS = 100_000;
export const FIRESTORE_BETA_DAILY_CRITICAL_READS = 200_000;
export const FIRESTORE_BETA_DAILY_EMERGENCY_READS = 500_000;

export const FIRESTORE_DEFAULT_PAGE_SIZE = 100;
export const FIRESTORE_MAX_PAGE_SIZE = 500;
export const FIRESTORE_MAX_PRODUCTION_SCAN_READS = 5_000;

export const FIRESTORE_RISK_MAX_READS: Record<FirestoreRiskClass, number> = {
  low: 100,
  medium: 1_000,
  high: 5_000,
  critical: 0,
};

