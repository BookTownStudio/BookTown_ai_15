/**
 * Shared normalization utilities — single source of truth.
 *
 * `normalizeSearchText` and `normalizeIsbn` (pipeline Variant B) live here.
 * Do not add tokenize or canonical normalization until their respective
 * consolidation passes are complete.
 *
 * Behaviour is intentionally identical to the implementations they replace
 * in lib/books/normalization.ts and
 * functions/src/library/normalization/bookSearchNormalization.ts.
 * Do not change behaviour here without auditing all callers in both trees.
 */

/**
 * Normalizes Arabic letter variants to canonical base forms.
 * Applied only if Arabic script is detected in the text.
 *
 * Mappings:
 *   أ إ آ → ا (alef variants to plain alef)
 *   ى → ي (alef maqsura to ya)
 *   ة → ه (teh marbuta to ha)
 *   ؤ → و (hamza on waw to waw)
 *   ئ → ي (hamza on ya to ya)
 */
function normalizeArabicText(text: string): string {
  if (!text) return text;
  return text
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

/**
 * Normalises a string for search indexing and matching:
 *   1. Lowercases
 *   2. Unicode NFKD decomposition
 *   3. Strips combining diacritical marks (U+0300–U+036F, U+064B–U+065F)
 *   4. Normalizes Arabic letter variants to base forms
 *   5. Replaces runs of non-letter/non-digit characters with a single space
 *   6. Collapses whitespace and trims
 *
 * Returns an empty string for null / undefined / empty input.
 */
export function normalizeSearchText(value?: string | null): string {
  if (!value) return "";
  const lowered = value.toLowerCase();
  const decomposed = lowered.normalize("NFKD");
  const diacriticsRemoved = decomposed.replace(/[\u0300-\u036f\u064b-\u065f]/g, "");
  const arabicNormalized = normalizeArabicText(diacriticsRemoved);
  return arabicNormalized
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalises an ISBN string to its canonical digit-only form and validates it
 * against the expected length. Returns an empty string when the value is not a
 * string, is malformed, or does not match the requested ISBN format.
 *
 * This is the pipeline Variant B used by the server-side ingestion, indexing,
 * and materialization paths. It accepts `unknown` so callers can pass Firestore
 * document fields directly without a prior type cast.
 */
export function normalizeIsbn(value: unknown, length: 10 | 13): string {
  if (typeof value !== "string") return "";
  const digits = value.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (length === 10) {
    return /^\d{9}[\dX]$/.test(digits) ? digits : "";
  }
  return /^\d{13}$/.test(digits) ? digits : "";
}
