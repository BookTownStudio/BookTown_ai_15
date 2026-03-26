export type CanonicalCoverMode = "uploaded" | "fallback_metadata";

export type CanonicalFallbackCoverTheme =
  | "ink"
  | "emerald"
  | "gold"
  | "plum";

export type CanonicalFallbackCover = {
  title: string;
  author?: string;
  theme: CanonicalFallbackCoverTheme;
};

type CanonicalCoverKind = "blog" | "ebook";

const COVER_THEMES: readonly CanonicalFallbackCoverTheme[] = [
  "ink",
  "emerald",
  "gold",
  "plum",
];

function asNonEmptyString(value: unknown, max: number): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, max);
}

function stableHash(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function normalizeTheme(value: unknown): CanonicalFallbackCoverTheme | null {
  return value === "ink" ||
    value === "emerald" ||
    value === "gold" ||
    value === "plum"
    ? value
    : null;
}

export function buildCanonicalFallbackCover(params: {
  title: string;
  author?: string;
  kind: CanonicalCoverKind;
}): CanonicalFallbackCover {
  const title = asNonEmptyString(params.title, 180) || "Untitled";
  const author = asNonEmptyString(params.author, 180) || "";
  const themeSeed = `${params.kind}:${title}:${author || "unknown"}`;
  const theme = COVER_THEMES[stableHash(themeSeed) % COVER_THEMES.length];

  return {
    title,
    ...(author ? { author } : {}),
    theme,
  };
}

export function resolveCanonicalCoverState(params: {
  coverUrl?: string;
  title: string;
  author?: string;
  kind: CanonicalCoverKind;
}): {
  coverMode: CanonicalCoverMode;
  fallbackCover?: CanonicalFallbackCover;
} {
  if (asNonEmptyString(params.coverUrl, 2048)) {
    return { coverMode: "uploaded" };
  }

  return {
    coverMode: "fallback_metadata",
    fallbackCover: buildCanonicalFallbackCover({
      title: params.title,
      author: params.author,
      kind: params.kind,
    }),
  };
}

export function readCanonicalFallbackCover(
  value: unknown
): CanonicalFallbackCover | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const title = asNonEmptyString(raw.title, 180);
  const theme = normalizeTheme(raw.theme);
  if (!title || !theme) {
    return undefined;
  }

  const author = asNonEmptyString(raw.author, 180);
  return {
    title,
    ...(author ? { author } : {}),
    theme,
  };
}
