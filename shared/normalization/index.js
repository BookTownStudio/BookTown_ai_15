/**
 * Shared normalization utilities — single source of truth.
 * ESM-compatible version for Vite + Firebase dual usage.
 */

// ✅ REMOVE "use strict"
// ✅ REMOVE Object.defineProperty
// ✅ REMOVE exports.*

/**
 * Normalizes Arabic letter variants to canonical base forms.
 */
function normalizeArabicText(text) {
  if (!text) return text;

  return text
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

/**
 * Normalises a string for search indexing and matching.
 */
export function normalizeSearchText(value) {
  if (!value) return "";

  const lowered = value.toLowerCase();
  const decomposed = lowered.normalize("NFKD");
  const diacriticsRemoved = decomposed.replace(
    /[\u0300-\u036f\u064b-\u065f]/g,
    ""
  );

  const arabicNormalized = normalizeArabicText(diacriticsRemoved);

  return arabicNormalized
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalises ISBN
 */
export function normalizeIsbn(value, length) {
  if (typeof value !== "string") return "";

  const digits = value.replace(/[^0-9Xx]/g, "").toUpperCase();

  if (length === 10) {
    return /^\d{9}[\dX]$/.test(digits) ? digits : "";
  }

  return /^\d{13}$/.test(digits) ? digits : "";
}