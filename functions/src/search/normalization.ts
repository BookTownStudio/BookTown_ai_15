const DIACRITIC_REGEX = /\p{M}/gu;
const TOKEN_REGEX = /[\p{L}\p{N}_]+/gu;
const HASHTAG_REGEX = /#([\p{L}\p{N}_]{2,40})/gu;

const MAX_TEXT_LENGTH = 2000;
const MAX_TOKEN_LENGTH = 40;
const MAX_PREFIX_LENGTH = 16;
const MAX_TOKENS = 80;
const MAX_PREFIXES = 240;

export function normalizeSearchText(input: unknown): string {
  if (typeof input !== "string") return "";
  const trimmed = input.trim().slice(0, MAX_TEXT_LENGTH);
  if (!trimmed) return "";

  return trimmed
    .normalize("NFKD")
    .replace(DIACRITIC_REGEX, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function tokenizeSearchText(input: unknown, maxTokens = MAX_TOKENS): string[] {
  const normalized = normalizeSearchText(input);
  if (!normalized) return [];

  const matches = normalized.match(TOKEN_REGEX) ?? [];
  const dedup = new Set<string>();
  for (const token of matches) {
    const normalizedToken = token.trim();
    if (normalizedToken.length < 2) continue;
    if (normalizedToken.length > MAX_TOKEN_LENGTH) continue;
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
