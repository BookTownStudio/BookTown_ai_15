import type {
  NormalizedBlockNode,
  NormalizedManuscript,
} from "./normalizeProjectManuscript";

const WORDS_PER_MINUTE = 220;

export function extractNodeText(node: NormalizedBlockNode): string {
  const ownText = typeof node.text === "string" ? node.text : "";
  const childText = Array.isArray(node.content)
    ? node.content.map((entry) => extractNodeText(entry)).join(" ")
    : "";
  return `${ownText} ${childText}`.replace(/\s+/g, " ").trim();
}

function truncateCleanly(value: string, limit: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  const slice = trimmed.slice(0, limit + 1);
  const lastBoundary = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\n"));
  const cropped = (
    lastBoundary >= Math.floor(limit * 0.6)
      ? slice.slice(0, lastBoundary)
      : slice.slice(0, limit)
  ).trim();
  return cropped.replace(/[.,;:!?-]+$/g, "").trim();
}

export function deriveExcerpt(normalizedContent: NormalizedManuscript): string {
  for (const unit of normalizedContent.units) {
    for (const block of unit.content) {
      const text = extractNodeText(block);
      if (text) {
        return truncateCleanly(text, 220);
      }
    }
  }
  return "";
}

function countWordsFromText(value: string): number {
  if (!value.trim()) return 0;
  const matches = value.match(/[\p{L}\p{N}_'-]+/gu) ?? [];
  return matches.length;
}

export function deriveWordCount(normalizedContent: NormalizedManuscript): number {
  let total = 0;
  for (const unit of normalizedContent.units) {
    total += countWordsFromText(unit.title);
    for (const block of unit.content) {
      total += countWordsFromText(extractNodeText(block));
    }
  }
  return total;
}

export function deriveEstimatedReadingMinutes(wordCount: number): number {
  if (wordCount <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}

export function deriveLanguageFromNormalizedContent(params: {
  normalizedContent: NormalizedManuscript;
  titleEn?: string;
  titleAr?: string;
}): string {
  for (const unit of params.normalizedContent.units) {
    for (const block of unit.content) {
      const lang =
        typeof block.attrs?.lang === "string" ? block.attrs.lang.trim().toLowerCase() : "";
      if (lang === "ar" || lang === "en") {
        return lang;
      }
    }
  }

  const titleEn = (params.titleEn ?? "").trim();
  const titleAr = (params.titleAr ?? "").trim();
  if (titleAr && !titleEn) return "ar";
  if (titleEn) return "en";
  return /[\u0600-\u06FF]/.test(titleAr) ? "ar" : "en";
}
