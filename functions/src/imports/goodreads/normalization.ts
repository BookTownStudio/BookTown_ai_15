import { createHash } from "crypto";
import { normalizeCanonicalPart } from "../../library/persistence/canonicalKey";

const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/g;

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function trimTo(value: string, max: number): string {
  return value.trim().slice(0, max);
}

export function normalizePlaceholder(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "(not provided)") return null;
  return trimmed;
}

export function normalizeShelfToken(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function shelfIdFromName(name: string): string {
  const normalized = normalizeShelfToken(name);
  if (normalized.length > 0) {
    return normalized.slice(0, 64);
  }
  return `shelf-${sha256Hex(name).slice(0, 12)}`;
}

export function mapReservedShelf(name: string): "finished" | "want-to-read" | "currently-reading" | null {
  const token = normalizeShelfToken(name);
  if (!token) return null;
  if (token === "read" || token === "finished") return "finished";
  if (token === "to-read" || token === "want-to-read") return "want-to-read";
  if (token === "currently-reading") return "currently-reading";
  return null;
}

function isValidIsbn10(value: string): boolean {
  if (!/^[0-9]{9}[0-9X]$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += (i + 1) * Number(value[i]);
  }
  const check = value[9] === "X" ? 10 : Number(value[9]);
  return (sum + 10 * check) % 11 === 0;
}

function isValidIsbn13(value: string): boolean {
  if (!/^[0-9]{13}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(value[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(value[12]);
}

export function normalizeIsbn(value: string | null): string | null {
  const normalized = normalizePlaceholder(value);
  if (!normalized) return null;
  const stripped = normalized.toUpperCase().replace(/[^0-9X]/g, "");
  if (stripped.length === 10 && isValidIsbn10(stripped)) return stripped;
  if (stripped.length === 13 && isValidIsbn13(stripped)) return stripped;
  return null;
}

export function parseRating(value: string | number | null): number {
  if (value === null || value === undefined) return 0;
  const numeric = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(numeric)) return 0;
  const rounded = Math.trunc(numeric);
  if (rounded < 0) return 0;
  if (rounded > 5) return 5;
  return rounded;
}

function dateToIsoUtc(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const millis = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const d = new Date(millis);
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() + 1 !== month ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return d.toISOString();
}

export function parseCsvDateToIso(value: string | null): string | null {
  const normalized = normalizePlaceholder(value);
  if (!normalized) return null;

  const yyyyMmDd = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyyMmDd) {
    return dateToIsoUtc(Number(yyyyMmDd[1]), Number(yyyyMmDd[2]), Number(yyyyMmDd[3]));
  }

  const mmDdYyyy = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmDdYyyy) {
    return dateToIsoUtc(Number(mmDdYyyy[3]), Number(mmDdYyyy[1]), Number(mmDdYyyy[2]));
  }

  return null;
}

export function parseDsarUtcTimestampToIso(value: string | null): string | null {
  const normalized = normalizePlaceholder(value);
  if (!normalized) return null;
  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) UTC$/
  );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (hour > 23 || minute > 59 || second > 59) return null;

  const millis = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const d = new Date(millis);
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() + 1 !== month ||
    d.getUTCDate() !== day ||
    d.getUTCHours() !== hour ||
    d.getUTCMinutes() !== minute ||
    d.getUTCSeconds() !== second
  ) {
    return null;
  }
  return d.toISOString();
}

export function parseShelfNames(value: string | null): string[] {
  const normalized = normalizePlaceholder(value);
  if (!normalized) return [];
  return normalized
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 24);
}

export function normalizeReviewText(raw: string | null, maxLength: number): string {
  const value = normalizePlaceholder(raw);
  if (!value) return "";
  return value.replace(CONTROL_CHAR_PATTERN, "").trim().slice(0, maxLength);
}

export function toIdentityKey(params: {
  isbn13: string | null;
  isbn10: string | null;
  titleNorm: string;
  authorNorm: string;
}): string {
  if (params.isbn13) return `isbn13:${params.isbn13}`;
  if (params.isbn10) return `isbn10:${params.isbn10}`;
  return `canon:${params.authorNorm}::${params.titleNorm}`;
}

export function buildRowKey(row: {
  titleNorm: string;
  authorNorm: string;
  isbn10: string | null;
  isbn13: string | null;
  rating: number;
  reviewText: string;
  exclusiveShelf: string | null;
  dateRead: string | null;
  shelfNames: string[];
}): string {
  const payload = [
    row.titleNorm,
    row.authorNorm,
    row.isbn10 || "",
    row.isbn13 || "",
    String(row.rating),
    row.reviewText,
    row.exclusiveShelf || "",
    row.dateRead || "",
    [...new Set(row.shelfNames.map((s) => normalizeShelfToken(s)))].sort().join(","),
  ].join("|");
  return sha256Hex(payload);
}

export function normalizedCanonicalTitleAndAuthor(params: {
  title: string;
  author: string;
}): { titleNorm: string; authorNorm: string } {
  return {
    titleNorm: normalizeCanonicalPart(params.title),
    authorNorm: normalizeCanonicalPart(params.author),
  };
}
