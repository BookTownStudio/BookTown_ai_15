/**
 * Shared normalization utilities for client-side book search ranking.
 *
 * normalizeSearchText and normalizeIsbn (fixed-length path) are sourced from
 * the shared module. normalizeIsbn is re-wrapped here to preserve Variant A's
 * optional-length signature, which is needed by the client-side query path
 * that must detect whether a query string looks like any ISBN without knowing
 * the format in advance.
 *
 * tokenize is not yet consolidated; do not move it until its consolidation
 * pass is complete.
 */

// ✅ FIX: Use proper ESM named imports (shared module is now ESM)
import {
  normalizeSearchText,
  normalizeIsbn as _normalizeIsbn,
} from "../../shared/normalization/index";

export { normalizeSearchText };

/**
 * Splits a normalised string into non-empty tokens. No stopword filtering —
 * callers that need stopword suppression must filter the result themselves.
 */
export function tokenize(value?: string | null): string[] {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(" ").filter(Boolean) : [];
}

/**
 * Normalises an ISBN string to its canonical digit-only form.
 *
 * When `length` is provided, delegates to the shared pipeline implementation.
 * When omitted, accepts either a valid ISBN-10 or ISBN-13 (used by the
 * client-side query path, which must detect format without a length hint).
 * Returns an empty string for invalid or unrecognised values.
 */
export function normalizeIsbn(
  value?: string | null,
  length?: 10 | 13
): string {
  if (length !== undefined) {
    return _normalizeIsbn(value, length);
  }

  if (!value) return "";

  const digits = value.replace(/[^0-9Xx]/g, "").toUpperCase();

  return /^\d{13}$/.test(digits) || /^\d{9}[\dX]$/.test(digits)
    ? digits
    : "";
}