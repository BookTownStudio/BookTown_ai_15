import { normalizeCanonicalPart } from "./canonicalKey";

function extractYearToken(value?: string | number | null): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const year = Math.trunc(value);
    return year >= 0 && year <= 9999 ? String(year).padStart(4, "0") : "";
  }

  if (typeof value !== "string") {
    return "";
  }

  const match = value.match(/([12]\d{3}|\d{3})/);
  return match?.[1]?.padStart(4, "0") ?? "";
}

export function normalizeAuthorYear(value?: string | number | null): string {
  return extractYearToken(value);
}

export function buildCanonicalAuthorKey(params: {
  name: string;
  birthYear?: string | number | null;
}): string {
  const namePart = normalizeCanonicalPart(params.name || "unknown");
  const birthYearPart = normalizeAuthorYear(params.birthYear) || "unknown";

  return `${namePart || "unknown"}::${birthYearPart}`;
}

export function extractCanonicalAuthorKeyRoot(value?: string | null): string {
  if (typeof value !== "string") {
    return "";
  }

  const [root] = value.split("::", 1);
  return normalizeCanonicalPart(root || "");
}

export function canonicalAuthorKeysShareRoot(
  left?: string | null,
  right?: string | null
): boolean {
  const leftRoot = extractCanonicalAuthorKeyRoot(left);
  const rightRoot = extractCanonicalAuthorKeyRoot(right);
  return Boolean(leftRoot && rightRoot && leftRoot === rightRoot);
}
