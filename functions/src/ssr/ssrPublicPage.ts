import { onRequest } from "firebase-functions/v2/https";
import type { Request } from "express";
import { admin } from "../firebaseAdmin";

type EntityType = "book" | "author" | "post";

type ParsedRoute =
  | {
      ok: true;
      entityType: EntityType;
      entityId: string;
      pathname: string;
    }
  | {
      ok: false;
      reason: "unknown-route" | "missing-id" | "invalid-id";
      pathname: string;
    };

type BookEntityView = {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  publicationYear: string | null;
};

type AuthorEntityView = {
  id: string;
  name: string;
  biography: string | null;
  birthYear: string | null;
  nationality: string | null;
};

type PostEntityView = {
  id: string;
  content: string;
  authorName: string | null;
  createdAtIso: string | null;
};

type ShellModel = {
  statusCode: 200 | 404;
  title: string;
  canonicalUrl: string;
  heading: string;
  details: string[];
  metaDescription?: string;
  jsonLd?: Record<string, unknown>;
  isBookLayout?: boolean;
  bookDescription?: string;
  cacheControl?: string;
};

const db = admin.firestore();

const ENTITY_LABELS: Record<EntityType, string> = {
  book: "Book",
  author: "Author",
  post: "Post",
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const safeDecodeUriComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizePathname = (rawPath: string): string => {
  const pathOnly = rawPath.split("?")[0] || "/";
  if (!pathOnly.startsWith("/")) {
    return `/${pathOnly}`;
  }
  return pathOnly || "/";
};

const normalizeText = (value: unknown, maxLength: number): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
};

const firstText = (values: unknown[], maxLength: number): string => {
  for (const value of values) {
    const normalized = normalizeText(value, maxLength);
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return "";
};

const truncateText = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
};

const takeChars = (value: string, maxLength: number): string =>
  maxLength <= 0 ? "" : value.slice(0, maxLength);

const parsePublicationYear = (source: Record<string, unknown>): string | null => {
  const explicitYear = source.publicationYear;
  if (typeof explicitYear === "number" && Number.isFinite(explicitYear)) {
    const yearInt = Math.trunc(explicitYear);
    if (yearInt >= 1000 && yearInt <= 2999) {
      return String(yearInt);
    }
  }

  if (typeof explicitYear === "string") {
    const yearMatch = explicitYear.match(/(\d{4})/);
    if (yearMatch) {
      return yearMatch[1];
    }
  }

  const publicationDate = normalizeText(source.publicationDate, 64);
  const dateMatch = publicationDate.match(/(\d{4})/);
  if (dateMatch) {
    return dateMatch[1];
  }

  return null;
};

const parseBirthYear = (source: Record<string, unknown>): string | null => {
  const explicitYear = source.birthYear;
  if (typeof explicitYear === "number" && Number.isFinite(explicitYear)) {
    const yearInt = Math.trunc(explicitYear);
    if (yearInt >= 1000 && yearInt <= 2999) {
      return String(yearInt);
    }
  }

  if (typeof explicitYear === "string") {
    const yearMatch = explicitYear.match(/(\d{4})/);
    if (yearMatch) {
      return yearMatch[1];
    }
  }

  const birthDate = normalizeText(source.birthDate, 64);
  const birthDateMatch = birthDate.match(/(\d{4})/);
  if (birthDateMatch) {
    return birthDateMatch[1];
  }

  const lifespan = firstText([source.lifespan], 128);
  const lifespanMatch = lifespan.match(/(\d{4})/);
  if (lifespanMatch) {
    return lifespanMatch[1];
  }

  return null;
};

const resolvePostVisibility = (source: Record<string, unknown>): string => {
  const rawVisibility = source.visibility;
  if (typeof rawVisibility === "string") {
    return rawVisibility.trim().toLowerCase();
  }
  if (rawVisibility && typeof rawVisibility === "object") {
    const scope = (rawVisibility as Record<string, unknown>).scope;
    if (typeof scope === "string") {
      return scope.trim().toLowerCase();
    }
  }
  return "";
};

const resolvePostContentText = (source: Record<string, unknown>): string => {
  const rawContent = source.content;
  if (typeof rawContent === "string") {
    return rawContent.trim();
  }
  if (rawContent && typeof rawContent === "object") {
    return normalizeText((rawContent as Record<string, unknown>).text, 50000);
  }
  return "";
};

const toIsoDateString = (value: unknown): string | null => {
  if (!value) return null;

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toISOString();
  }

  if (typeof value === "object") {
    const maybeTimestamp = value as { toDate?: () => Date };
    if (typeof maybeTimestamp.toDate === "function") {
      const date = maybeTimestamp.toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
  }

  return null;
};

const parsePublicRoute = (rawPath: string): ParsedRoute => {
  const pathname = normalizePathname(rawPath);
  const parts = pathname.split("/").filter((part) => part.length > 0);
  const section = (parts[0] || "").toLowerCase();
  const candidateId = parts[1] || "";
  const entityId = safeDecodeUriComponent(candidateId).trim();

  if (section !== "book" && section !== "author" && section !== "post") {
    return {
      ok: false,
      reason: "unknown-route",
      pathname,
    };
  }

  if (!entityId) {
    return {
      ok: false,
      reason: "missing-id",
      pathname,
    };
  }

  // Firestore document IDs cannot contain path separators.
  if (entityId.includes("/")) {
    return {
      ok: false,
      reason: "invalid-id",
      pathname,
    };
  }

  return {
    ok: true,
    entityType: section,
    entityId,
    pathname,
  };
};

const resolveRequestOrigin = (req: Request): string => {
  const forwardedProtoRaw = String(req.get("x-forwarded-proto") || "").trim();
  const forwardedHostRaw = String(req.get("x-forwarded-host") || "").trim();
  const protocol =
    (forwardedProtoRaw.split(",")[0] || "").trim() ||
    String(req.protocol || "").trim() ||
    "https";
  const host =
    (forwardedHostRaw.split(",")[0] || "").trim() ||
    String(req.get("host") || "").trim() ||
    "localhost";
  return `${protocol}://${host}`;
};

const buildCanonicalUrl = (req: Request, pathname: string): string => {
  const origin = resolveRequestOrigin(req);
  try {
    return new URL(pathname, origin).toString();
  } catch {
    return `${origin}${pathname}`;
  }
};

const safeJsonForHtmlScript = (value: string): string =>
  value
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

const buildHtmlDocument = (model: ShellModel): string => {
  const escapedTitle = escapeHtml(model.title);
  const escapedCanonical = escapeHtml(model.canonicalUrl);
  const escapedHeading = escapeHtml(model.heading);
  const detailLines = model.details
    .map((line) => `      <p>${escapeHtml(line)}</p>`)
    .join("\n");
  const metaDescription = model.metaDescription
    ? `  <meta name="description" content="${escapeHtml(model.metaDescription)}">`
    : "";
  const jsonLdScript = model.jsonLd
    ? `  <script type="application/ld+json">${safeJsonForHtmlScript(
        JSON.stringify(model.jsonLd)
      )}</script>`
    : "";
  const bookDescription =
    model.isBookLayout && model.bookDescription
      ? `    <p class="book-description">${escapeHtml(model.bookDescription)}</p>`
      : "";

  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escapedTitle}</title>`,
    metaDescription,
    `  <link rel="canonical" href="${escapedCanonical}">`,
    jsonLdScript,
    "  <style>",
    "    :root { color-scheme: light; }",
    "    * { box-sizing: border-box; }",
    '    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }',
    "    main { max-width: 760px; margin: 72px auto; padding: 0 20px; }",
    "    h1 { margin: 0 0 12px; font-size: 1.5rem; line-height: 1.2; }",
    "    p { margin: 6px 0; color: #334155; }",
    "    .book-description { margin-top: 14px; line-height: 1.6; color: #1e293b; }",
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    `    <h1>${escapedHeading}</h1>`,
    detailLines,
    bookDescription,
    "  </main>",
    "</body>",
    "</html>",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
};

const fetchBookEntity = async (bookId: string): Promise<BookEntityView | null> => {
  const snap = await db.collection("books").doc(bookId).get();
  if (!snap.exists) {
    return null;
  }

  const source = (snap.data() ?? {}) as Record<string, unknown>;
  const title = firstText([source.title, source.titleEn, source.titleAr], 300);
  const titleFallback = title || `Book ${bookId}`;

  const author = firstText(
    [source.author, source.authorEn, source.authorAr, Array.isArray(source.authors) ? source.authors[0] : ""],
    300
  );
  const description = firstText([source.description, source.descriptionEn, source.descriptionAr], 5000);

  return {
    id: bookId,
    title: titleFallback,
    author: author || null,
    description: description || null,
    publicationYear: parsePublicationYear(source),
  };
};

const fetchAuthorEntity = async (authorId: string): Promise<AuthorEntityView | null> => {
  const snap = await db.collection("authors").doc(authorId).get();
  if (!snap.exists) {
    return null;
  }

  const source = (snap.data() ?? {}) as Record<string, unknown>;
  const name = firstText([source.name, source.nameEn, source.nameAr], 300);
  const biography = firstText([source.biography, source.bioEn, source.bioAr], 5000);
  const nationality = firstText(
    [source.nationality, source.countryEn, source.countryAr, source.country],
    120
  );

  return {
    id: authorId,
    name: name || `Author ${authorId}`,
    biography: biography || null,
    birthYear: parseBirthYear(source),
    nationality: nationality || null,
  };
};

const fetchPostEntity = async (postId: string): Promise<PostEntityView | null> => {
  const postSnap = await db.collection("posts").doc(postId).get();
  if (!postSnap.exists) {
    return null;
  }

  const source = (postSnap.data() ?? {}) as Record<string, unknown>;
  if (resolvePostVisibility(source) !== "public") {
    return null;
  }

  const content = resolvePostContentText(source);
  const authorId = normalizeText(source.authorId, 128);
  const createdAtIso =
    toIsoDateString(
      (source.timestamps as Record<string, unknown> | undefined)?.createdAt
    ) ||
    toIsoDateString(source.createdAt) ||
    null;

  let authorName: string | null = null;
  if (authorId) {
    const authorSnap = await db.collection("users").doc(authorId).get();
    if (authorSnap.exists) {
      const authorSource = (authorSnap.data() ?? {}) as Record<string, unknown>;
      const resolvedName = firstText(
        [authorSource.name, authorSource.displayName, authorSource.handle],
        120
      );
      authorName = resolvedName || null;
    }
  }

  return {
    id: postId,
    content,
    authorName,
    createdAtIso,
  };
};

const buildNotFoundModel = (
  route: Extract<ParsedRoute, { ok: false }> | Extract<ParsedRoute, { ok: true }>,
  canonicalUrl: string
): ShellModel => {
  const path = route.pathname;
  const reason =
    route.ok
      ? "Requested entity not found."
      : route.reason === "missing-id"
        ? "Missing required entity id in route."
        : route.reason === "invalid-id"
          ? "Invalid entity id in route."
          : "Unsupported public route.";

  return {
    statusCode: 404,
    title: "Not Found",
    canonicalUrl,
    heading: "404 Not Found",
    details: [reason, `Path: ${path}`],
  };
};

const buildBookModel = (book: BookEntityView, canonicalUrl: string): ShellModel => {
  const title = `${book.title} | BookTown`;
  const details: string[] = [];

  if (book.author) {
    details.push(`Author: ${book.author}`);
  }
  if (book.publicationYear) {
    details.push(`Publication Year: ${book.publicationYear}`);
  }
  if (details.length === 0) {
    details.push(`Book ID: ${book.id}`);
  }

  const metaDescription = book.description
    ? truncateText(book.description, 160)
    : undefined;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    url: canonicalUrl,
  };

  if (book.author) {
    jsonLd.author = {
      "@type": "Person",
      name: book.author,
    };
  }

  if (book.description) {
    jsonLd.description = book.description;
  }

  return {
    statusCode: 200,
    title,
    canonicalUrl,
    heading: book.title,
    details,
    ...(metaDescription ? { metaDescription } : {}),
    jsonLd,
    isBookLayout: true,
    ...(book.description ? { bookDescription: book.description } : {}),
  };
};

const buildAuthorModel = (
  author: AuthorEntityView,
  canonicalUrl: string
): ShellModel => {
  const title = `${author.name} | BookTown`;
  const details: string[] = [];

  if (author.birthYear) {
    details.push(`Birth Year: ${author.birthYear}`);
  }
  if (author.nationality) {
    details.push(`Nationality: ${author.nationality}`);
  }
  if (details.length === 0) {
    details.push(`Author ID: ${author.id}`);
  }

  const metaDescription = author.biography
    ? truncateText(author.biography, 160)
    : undefined;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: author.name,
    url: canonicalUrl,
  };

  if (author.biography) {
    jsonLd.description = author.biography;
  }
  if (author.birthYear) {
    jsonLd.birthDate = `${author.birthYear}-01-01`;
  }

  return {
    statusCode: 200,
    title,
    canonicalUrl,
    heading: author.name,
    details,
    ...(metaDescription ? { metaDescription } : {}),
    jsonLd,
    isBookLayout: true,
    ...(author.biography ? { bookDescription: author.biography } : {}),
  };
};

const buildPostModel = (post: PostEntityView, canonicalUrl: string): ShellModel => {
  const bodyText = post.content;
  const headline = bodyText ? takeChars(bodyText, 120) : "Post";
  const titleBase = bodyText ? takeChars(bodyText, 60) : "Post";
  const description = bodyText ? takeChars(bodyText, 160) : "";
  const articleBody = bodyText ? takeChars(bodyText, 5000) : "";

  const details: string[] = [];
  if (post.authorName) {
    details.push(`Author: ${post.authorName}`);
  }
  if (post.createdAtIso) {
    details.push(`Published: ${post.createdAtIso}`);
  }
  if (details.length === 0) {
    details.push(`Post ID: ${post.id}`);
  }

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    url: canonicalUrl,
    articleBody,
  };

  if (post.authorName) {
    jsonLd.author = {
      "@type": "Person",
      name: post.authorName,
    };
  }
  if (post.createdAtIso) {
    jsonLd.datePublished = post.createdAtIso;
  }

  return {
    statusCode: 200,
    title: `${titleBase} | BookTown`,
    canonicalUrl,
    heading: headline,
    details,
    ...(description ? { metaDescription: description } : {}),
    jsonLd,
    isBookLayout: true,
    ...(bodyText ? { bookDescription: bodyText } : {}),
    cacheControl: "public, max-age=0, s-maxage=60",
  };
};

const buildGenericEntityModel = (
  route: Extract<ParsedRoute, { ok: true }>,
  canonicalUrl: string
): ShellModel => {
  const entityLabel = ENTITY_LABELS[route.entityType];
  return {
    statusCode: 200,
    title: `${entityLabel} – ${route.entityId}`,
    canonicalUrl,
    heading: "BookTown SSR Placeholder",
    details: [
      `Entity Type: ${entityLabel}`,
      `Entity ID: ${route.entityId}`,
      `Path: ${route.pathname}`,
    ],
  };
};

/**
 * SSR shell endpoint for public entity pages.
 * Book and author routes are entity-backed; post remains placeholder in this phase.
 */
export const ssrPublicPage = onRequest({ region: "us-central1" }, async (req, res) => {
  const route = parsePublicRoute(req.path || "/");
  const canonicalUrl = buildCanonicalUrl(req, route.pathname);

  let model: ShellModel;

  if (!route.ok) {
    model = buildNotFoundModel(route, canonicalUrl);
  } else if (route.entityType === "book") {
    const book = await fetchBookEntity(route.entityId);
    model = book
      ? buildBookModel(book, canonicalUrl)
      : buildNotFoundModel(route, canonicalUrl);
  } else if (route.entityType === "author") {
    const author = await fetchAuthorEntity(route.entityId);
    model = author
      ? buildAuthorModel(author, canonicalUrl)
      : buildNotFoundModel(route, canonicalUrl);
  } else if (route.entityType === "post") {
    const post = await fetchPostEntity(route.entityId);
    model = post
      ? buildPostModel(post, canonicalUrl)
      : buildNotFoundModel(route, canonicalUrl);
  } else {
    model = buildGenericEntityModel(route, canonicalUrl);
  }

  const html = buildHtmlDocument(model);

  res.status(model.statusCode);
  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Cache-Control", model.cacheControl || "public, max-age=0, s-maxage=300");
  res.send(html);
});
