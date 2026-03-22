export function slugifyPublicationTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{Script=Arabic}a-z0-9\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export function buildPublicationSlugPath(title: string, publicationId: string): string {
  const normalizedId = publicationId.trim();
  if (!normalizedId) {
    return "/read/publication";
  }

  const slug = slugifyPublicationTitle(title) || `publication-${normalizedId}`;
  return `/blog/${slug}-${normalizedId}`;
}

export function extractPublicationIdFromSlugSegment(segment: string): string {
  const decoded = decodeURIComponent((segment || "").trim());
  if (!decoded) return "";

  const lastHyphen = decoded.lastIndexOf("-");
  if (lastHyphen === -1) {
    return decoded;
  }

  return decoded.slice(lastHyphen + 1).trim();
}
