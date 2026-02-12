// functions/src/library/search/confidence/computeConfidence.ts

/**
 * Canonical Confidence Model — B1.1
 *
 * Confidence expresses how safe it is to act on a search result.
 * Deterministic. Explainable. Server-only.
 */

export type ConfidenceBreakdown = {
  identity: number;
  source: number;
  metadata: number;
  availability: number;
};

export type ConfidenceResult = {
  score: number; // 0.0 → 1.0
  breakdown: ConfidenceBreakdown;
};

export type ConfidenceInput = {
  // Identity
  hasExternalKey: boolean;
  isCanonicalMatch: boolean;
  isDedupedSurvivor: boolean;

  // Source
  source:
    | "googleBooks"
    | "openLibrary"
    | "other"
    | "unknown";

  // Metadata
  hasTitle: boolean;
  hasAuthor: boolean;
  hasPublicationYear: boolean;
  hasDescription: boolean;
  hasLanguage: boolean;

  // Availability
  isReadableNow: boolean;
  isSaveable: boolean;
};

/**
 * Source reliability mapping (LOCKED)
 */
const SOURCE_RELIABILITY: Record<
  ConfidenceInput["source"],
  number
> = {
  googleBooks: 0.2,
  openLibrary: 0.18,
  other: 0.12,
  unknown: 0.05,
};

/**
 * Compute canonical confidence score
 */
export function computeConfidence(
  input: ConfidenceInput
): ConfidenceResult {
  // -----------------------------
  // 1. Identity Certainty (0.0–0.4)
  // -----------------------------
  let identity = 0;

  if (
    input.hasExternalKey &&
    input.isCanonicalMatch &&
    input.isDedupedSurvivor
  ) {
    identity = 0.4;
  } else if (input.hasExternalKey && input.isCanonicalMatch) {
    identity = 0.2;
  } else {
    identity = 0.0;
  }

  // -----------------------------
  // 2. Source Reliability (0.0–0.2)
  // -----------------------------
  const source =
    SOURCE_RELIABILITY[input.source] ?? 0.05;

  // -----------------------------
  // 3. Metadata Completeness (0.0–0.2)
  // -----------------------------
  const requiredFields = [
    input.hasTitle,
    input.hasAuthor,
    input.hasLanguage,
    input.hasPublicationYear || input.hasDescription,
  ];

  const presentCount = requiredFields.filter(Boolean)
    .length;

  let metadata = 0;
  if (presentCount === requiredFields.length) {
    metadata = 0.2;
  } else if (presentCount >= requiredFields.length - 1) {
    metadata = 0.1;
  } else {
    metadata = 0.0;
  }

  // -----------------------------
  // 4. Availability Confidence (0.0–0.2)
  // -----------------------------
  let availability = 0;

  if (input.isReadableNow) {
    availability = 0.2;
  } else if (input.isSaveable) {
    availability = 0.1;
  } else {
    availability = 0.0;
  }

  // -----------------------------
  // Final score
  // -----------------------------
  const score = Math.min(
    1,
    identity + source + metadata + availability
  );

  return {
    score,
    breakdown: {
      identity,
      source,
      metadata,
      availability,
    },
  };
}
