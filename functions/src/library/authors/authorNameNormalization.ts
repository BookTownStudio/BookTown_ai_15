import { normalizeSearchText } from "../../search/normalization";
import { normalizeAuthorYear } from "../persistence/canonicalAuthorKey";

const LIBRARY_NAME_QUALIFIERS = new Set([
  "baron",
  "baroness",
  "count",
  "graaf",
  "graf",
  "grafin",
  "lady",
  "sir",
]);

const TRUSTED_AUTHOR_BIRTH_YEARS = new Map<string, string>([
  ["dante alighieri", "1265"],
  ["fyodor dostoevsky", "1821"],
  ["gabriel garcia marquez", "1927"],
  ["leo tolstoy", "1828"],
  ["william shakespeare", "1564"],
]);

function stripLifeDate(value: string): string {
  return value
    .replace(/\b(?:born|b\.|died|d\.)\s*/gi, "")
    .replace(/\b[12]\d{3}\s*[-/]\s*(?:[12]\d{3})?\b/g, "")
    .replace(/\b[12]\d{3}\b/g, "")
    .trim();
}

function normalizeLibraryInvertedName(value: string): string {
  if (!value.includes(",")) {
    return value.trim();
  }

  const parts = value
    .split(",")
    .map((part) => stripLifeDate(part).trim())
    .filter(Boolean)
    .filter((part) => !LIBRARY_NAME_QUALIFIERS.has(normalizeSearchText(part)));

  if (parts.length < 2) {
    return stripLifeDate(value);
  }

  const [familyName, ...givenNames] = parts;
  return [...givenNames, familyName].join(" ").replace(/\s+/g, " ").trim();
}

export function isUnknownAuthorDisplayName(value: unknown): boolean {
  if (typeof value !== "string") {
    return true;
  }

  const normalized = normalizeSearchText(value);
  return !normalized || normalized === "unknown";
}

export function normalizeCanonicalAuthorDisplayName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const inverted = normalizeLibraryInvertedName(trimmed);
  const normalized = normalizeSearchText(inverted);

  if (
    normalized.includes("tolstoy") &&
    (normalized.includes("leo") || normalized.includes("lev") || normalized.includes("graf"))
  ) {
    return "Leo Tolstoy";
  }

  if (normalized.includes("dostoevsky") && normalized.includes("fyodor")) {
    return "Fyodor Dostoevsky";
  }

  if (normalized === "gabriel garcia marquez") {
    return "Gabriel Garcia Marquez";
  }

  return inverted;
}

export function getTrustedAuthorBirthYearForCanonicalRoot(root: string): string {
  return TRUSTED_AUTHOR_BIRTH_YEARS.get(normalizeSearchText(root)) || "";
}

export function isTrustedAuthorBirthYearForCanonicalRoot(
  root: string,
  birthYear: string
): boolean {
  const normalizedBirthYear = normalizeAuthorYear(birthYear);
  if (!normalizedBirthYear || normalizedBirthYear === "unknown") {
    return false;
  }

  const trustedBirthYear = getTrustedAuthorBirthYearForCanonicalRoot(root);
  return !trustedBirthYear || trustedBirthYear === normalizedBirthYear;
}
