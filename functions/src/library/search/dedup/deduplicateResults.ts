// functions/src/library/search/dedup/deduplicateResults.ts

import {
  ConfidenceResult,
} from "../confidence/computeConfidence";

/**
 * Canonical identity used for deduplication.
 * Must be deterministic and stable.
 */
export type CanonicalIdentity = {
  canonicalKey: string; // e.g. isbn13 || externalKey || normalizedTitle+author
};

/**
 * Minimal shape required for deduplication.
 * This intentionally avoids coupling to search DTOs.
 */
export type DedupCandidate = CanonicalIdentity & {
  id: string;                 // stable internal id (editionId / bookId)
  confidence: ConfidenceResult;
  sourcePriority: number;     // lower = better (e.g. googleBooks=1, openLibrary=2)
  createdAt?: number;         // epoch ms (optional)
};

/**
 * Deduplication result with auditability.
 */
export type DedupResult<T extends DedupCandidate> = {
  survivors: T[];
  dropped: Array<{
    id: string;
    canonicalKey: string;
    reason: string;
  }>;
};

/**
 * Deterministic deduplication
 *
 * Rules (LOCKED):
 * 1. Group by canonicalKey
 * 2. Highest confidence.score wins
 * 3. Tie → lower sourcePriority wins
 * 4. Tie → earliest createdAt wins
 * 5. Tie → lexical id order (absolute determinism)
 */
export function deduplicateResults<T extends DedupCandidate>(
  candidates: T[]
): DedupResult<T> {
  const groups = new Map<string, T[]>();

  for (const item of candidates) {
    if (!groups.has(item.canonicalKey)) {
      groups.set(item.canonicalKey, []);
    }
    groups.get(item.canonicalKey)!.push(item);
  }

  const survivors: T[] = [];
  const dropped: DedupResult<T>["dropped"] = [];

  for (const [canonicalKey, group] of groups.entries()) {
    if (group.length === 1) {
      survivors.push(group[0]);
      continue;
    }

    const sorted = [...group].sort((a, b) => {
      // 1. Confidence (desc)
      if (b.confidence.score !== a.confidence.score) {
        return b.confidence.score - a.confidence.score;
      }

      // 2. Source priority (asc)
      if (a.sourcePriority !== b.sourcePriority) {
        return a.sourcePriority - b.sourcePriority;
      }

      // 3. Creation time (asc)
      const aTime = a.createdAt ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.createdAt ?? Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) {
        return aTime - bTime;
      }

      // 4. Absolute deterministic fallback
      return a.id.localeCompare(b.id);
    });

    const winner = sorted[0];
    survivors.push(winner);

    for (let i = 1; i < sorted.length; i++) {
      dropped.push({
        id: sorted[i].id,
        canonicalKey,
        reason: "deduplicated_by_confidence",
      });
    }
  }

  return { survivors, dropped };
}
