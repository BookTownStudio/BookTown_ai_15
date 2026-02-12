// functions/src/library/persistence/canonicalKey.ts

/**
 * Canonical identity key for deterministic deduplication.
 *
 * LOCKED INVARIANTS:
 * - Work-level identity ONLY (not edition-level)
 * - Stable across sources, editions, and time
 * - No ISBN, no year, no publisher
 *
 * canonicalKey = normalize(author) :: normalize(title)
 */

export function normalizeCanonicalPart(
  value?: string | null
): string {
  if (!value) return "";

  return value
    .toLowerCase()
    .normalize("NFKD") // split accents
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^\p{L}\p{N}]+/gu, " ") // keep letters & numbers
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 🔒 AUTHORITATIVE canonical key builder
 * Used by:
 * - ingestion
 * - search dedup
 * - ranking
 * - backfill
 */
export function buildCanonicalKey(params: {
  title: string;
  author?: string | null;
}): string {
  const titlePart = normalizeCanonicalPart(params.title);
  const authorPart = normalizeCanonicalPart(
    params.author || "unknown"
  );

  return `${authorPart}::${titlePart}`;
}
