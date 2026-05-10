/**
 * Shared search normalization utilities — single source of truth.
 *
 * This module owns query/index normalization, Arabic letter folding,
 * diacritic cleanup, tokenization, prefix construction, and ISBN cleanup for
 * BookTown search surfaces.
 */

const MAX_TEXT_LENGTH = 2000;
const MAX_TOKEN_LENGTH = 40;
const MAX_PREFIX_LENGTH = 16;
const MAX_TOKENS = 80;
const MAX_PREFIXES = 240;
const HASHTAG_REGEX = /#([\p{L}\p{N}_]{2,40})/gu;

export const SEARCH_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "في",
  "من",
  "على",
  "الى",
  "إلى",
  "عن",
  "مع",
]);

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
export function normalizeSearchText(value?: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().slice(0, MAX_TEXT_LENGTH);
  if (!trimmed) return "";

  const lowered = trimmed.toLowerCase();
  const decomposed = lowered.normalize("NFKD");
  const diacriticsRemoved = decomposed.replace(/[\u0300-\u036f\u064b-\u065f]/g, "");
  const arabicNormalized = normalizeArabicText(diacriticsRemoved);
  return arabicNormalized
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeSearchText(value?: unknown, maxTokens = MAX_TOKENS): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];

  const dedup = new Set<string>();
  for (const token of normalized.split(" ")) {
    const normalizedToken = token.trim();
    if (normalizedToken.length < 2) continue;
    if (normalizedToken.length > MAX_TOKEN_LENGTH) continue;
    if (SEARCH_STOPWORDS.has(normalizedToken)) continue;
    dedup.add(normalizedToken);
    if (dedup.size >= Math.max(1, maxTokens)) break;
  }

  return Array.from(dedup);
}

export function buildSearchPrefixes(
  tokens: readonly string[],
  maxPrefixes = MAX_PREFIXES
): string[] {
  const prefixes = new Set<string>();

  for (const token of tokens) {
    const normalizedToken = normalizeSearchText(token);
    if (normalizedToken.length < 2) continue;

    const upper = Math.min(normalizedToken.length, MAX_PREFIX_LENGTH);
    for (let i = 2; i <= upper; i += 1) {
      prefixes.add(normalizedToken.slice(0, i));
      if (prefixes.size >= Math.max(1, maxPrefixes)) {
        return Array.from(prefixes);
      }
    }
  }

  return Array.from(prefixes);
}

export function extractHashtags(input: unknown): string[] {
  if (typeof input !== "string" || !input.trim()) return [];
  const normalized = input.normalize("NFKC");
  const tags = new Set<string>();

  for (const match of normalized.matchAll(HASHTAG_REGEX)) {
    const raw = typeof match[1] === "string" ? match[1] : "";
    const token = normalizeSearchText(raw);
    if (token.length >= 2) {
      tags.add(token.slice(0, MAX_TOKEN_LENGTH));
    }
  }

  return Array.from(tags);
}

export function buildSearchFieldsFromTextParts(parts: readonly unknown[]): {
  normalizedText: string;
  tokens: string[];
  prefixes: string[];
} {
  const joined = parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0)
    .join(" ");

  const normalizedText = normalizeSearchText(joined);
  const tokens = tokenizeSearchText(normalizedText);
  const prefixes = buildSearchPrefixes(tokens);

  return {
    normalizedText,
    tokens,
    prefixes,
  };
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
