import { onRequest } from "firebase-functions/v2/https";
import type { Request } from "express";
import sharp from "sharp";
import { admin } from "../firebaseAdmin";
import { isBookVisibleToPublic } from "../rights/bookRights";

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
  imageUrl: string | null;
};

type AuthorEntityView = {
  id: string;
  name: string;
  biography: string | null;
  birthYear: string | null;
  nationality: string | null;
  imageUrl: string | null;
};

type PostEntityView = {
  id: string;
  content: string;
  authorName: string | null;
  createdAtIso: string | null;
  previewImageUrl: string | null;
};

type SocialMetadata = {
  type: "article" | "website";
  siteName: "BookTown";
  url: string;
  title: string;
  description: string;
  image: string;
  twitterCard: "summary_large_image";
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
  social?: SocialMetadata;
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

const normalizeAbsoluteUrl = (value: unknown): string | null => {
  const raw = normalizeText(value, 4096);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

const firstAbsoluteUrl = (values: unknown[]): string | null => {
  for (const value of values) {
    const normalized = normalizeAbsoluteUrl(value);
    if (normalized) return normalized;
  }
  return null;
};

const buildPostSocialCardUrl = (canonicalUrl: string): string => {
  const url = new URL(canonicalUrl);
  url.searchParams.set("bt_card", "1");
  return url.toString();
};

const isSocialCardImageRequest = (req: Request): boolean =>
  String(req.query.bt_card || "").trim() === "1";

const readObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const readArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

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

  if (
    section !== "book" &&
    section !== "books" &&
    section !== "author" &&
    section !== "authors" &&
    section !== "post"
  ) {
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
    entityType:
      section === "books" ? "book" : section === "authors" ? "author" : section,
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

const buildAbsolutePublicUrl = (canonicalUrl: string, path: string): string => {
  try {
    return new URL(path, canonicalUrl).toString();
  } catch {
    return path;
  }
};

const resolveStorageSignedUrl = async (storagePath: string): Promise<string | null> => {
  const path = normalizeText(storagePath, 2048);
  if (!path || !path.startsWith("attachments/")) return null;

  try {
    const file = admin.storage().bucket().file(path);
    const [exists] = await file.exists();
    if (!exists) return null;

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    return url;
  } catch {
    return null;
  }
};

const resolveRenditionStoragePath = (
  attachment: Record<string, unknown>,
  renditionName: "large" | "feed" | "thumb" | "original"
): string => {
  const metadata = readObject(attachment.metadata);
  const metadataRenditions = readObject(metadata.renditions);
  const topLevelRenditions = readObject(attachment.renditions);
  const selected = readObject({
    ...topLevelRenditions,
    ...metadataRenditions,
  }[renditionName]);

  return firstText(
    [
      selected.storagePath,
      attachment.storagePath,
      metadata.storagePath,
    ],
    2048
  );
};

const resolveMediaAttachmentImageUrl = async (
  attachmentId: string
): Promise<string | null> => {
  const id = normalizeText(attachmentId, 128);
  if (!id) return null;

  const snap = await db.collection("attachments").doc(id).get();
  if (!snap.exists) return null;

  const attachment = (snap.data() ?? {}) as Record<string, unknown>;
  const type = normalizeText(attachment.type, 64).toUpperCase();
  const metadata = readObject(attachment.metadata);
  const mimeType = firstText([attachment.mimeType, metadata.mimeType], 120).toLowerCase();
  if (type !== "IMAGE" && !mimeType.startsWith("image/")) {
    return null;
  }

  const directUrl = firstAbsoluteUrl([
    attachment.url,
    attachment.previewUrl,
    metadata.url,
    metadata.previewUrl,
  ]);
  if (directUrl) return directUrl;

  const preferredPath =
    resolveRenditionStoragePath(attachment, "large") ||
    resolveRenditionStoragePath(attachment, "feed") ||
    resolveRenditionStoragePath(attachment, "thumb") ||
    resolveRenditionStoragePath(attachment, "original");

  return preferredPath ? resolveStorageSignedUrl(preferredPath) : null;
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
  const socialTags = model.social
    ? [
        `  <meta property="og:type" content="${escapeHtml(model.social.type)}">`,
        `  <meta property="og:site_name" content="${escapeHtml(model.social.siteName)}">`,
        `  <meta property="og:url" content="${escapeHtml(model.social.url)}">`,
        `  <meta property="og:title" content="${escapeHtml(model.social.title)}">`,
        `  <meta property="og:description" content="${escapeHtml(model.social.description)}">`,
        `  <meta property="og:image" content="${escapeHtml(model.social.image)}">`,
        `  <meta name="twitter:card" content="${escapeHtml(model.social.twitterCard)}">`,
        `  <meta name="twitter:title" content="${escapeHtml(model.social.title)}">`,
        `  <meta name="twitter:description" content="${escapeHtml(model.social.description)}">`,
        `  <meta name="twitter:image" content="${escapeHtml(model.social.image)}">`,
      ].join("\n")
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
    socialTags,
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
  if (!isBookVisibleToPublic(source)) {
    return null;
  }
  const title = firstText([source.title, source.titleEn, source.titleAr], 300);
  const titleFallback = title || `Book ${bookId}`;

  const author = firstText(
    [source.author, source.authorEn, source.authorAr, Array.isArray(source.authors) ? source.authors[0] : ""],
    300
  );
  const description = firstText([source.description, source.descriptionEn, source.descriptionAr], 5000);
  const cover = readObject(source.cover);
  const imageUrl = firstAbsoluteUrl([
    source.coverUrl,
    source.bookCover,
    cover.large,
    cover.medium,
    cover.url,
    cover.original,
  ]);

  return {
    id: bookId,
    title: titleFallback,
    author: author || null,
    description: description || null,
    publicationYear: parsePublicationYear(source),
    imageUrl,
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
  const imageUrl = firstAbsoluteUrl([
    source.avatarUrl,
    source.authorPhoto,
    source.photoUrl,
    source.imageUrl,
  ]);

  return {
    id: authorId,
    name: name || `Author ${authorId}`,
    biography: biography || null,
    birthYear: parseBirthYear(source),
    nationality: nationality || null,
    imageUrl,
  };
};

const resolveBookAttachmentImageUrl = async (bookId: string): Promise<string | null> => {
  const id = normalizeText(bookId, 256);
  if (!id) return null;
  const snap = await db.collection("books").doc(id).get();
  if (!snap.exists) return null;
  const source = (snap.data() ?? {}) as Record<string, unknown>;
  const cover = readObject(source.cover);
  return firstAbsoluteUrl([
    source.coverUrl,
    source.bookCover,
    cover.large,
    cover.medium,
    cover.url,
    cover.original,
  ]);
};

const resolveAuthorAttachmentImageUrl = async (authorId: string): Promise<string | null> => {
  const id = normalizeText(authorId, 256);
  if (!id) return null;
  const snap = await db.collection("authors").doc(id).get();
  if (!snap.exists) return null;
  const source = (snap.data() ?? {}) as Record<string, unknown>;
  return firstAbsoluteUrl([
    source.avatarUrl,
    source.authorPhoto,
    source.photoUrl,
    source.imageUrl,
  ]);
};

const resolveShelfAttachmentImageUrl = async (
  shelfId: string,
  ownerId?: string
): Promise<string | null> => {
  const id = normalizeText(shelfId, 256);
  if (!id) return null;

  const candidates = [
    db.collection("shelves").doc(id),
    ...(ownerId
      ? [db.collection("users").doc(ownerId).collection("shelves").doc(id)]
      : []),
  ];

  for (const ref of candidates) {
    const snap = await ref.get();
    if (!snap.exists) continue;
    const source = (snap.data() ?? {}) as Record<string, unknown>;
    const covers = readArray(source.covers);
    const image = firstAbsoluteUrl([
      source.coverUrl,
      source.userCoverUrl,
      source.imageUrl,
      covers[0],
    ]);
    if (image) return image;
  }

  return null;
};

const resolvePostPreviewImageUrl = async (
  source: Record<string, unknown>
): Promise<string | null> => {
  const content = readObject(source.content);
  const attachmentRefs = readArray(content.attachments);

  for (const rawRef of attachmentRefs) {
    const ref = readObject(rawRef);
    const type = normalizeText(ref.type, 64).toLowerCase();
    const attachmentId = firstText([ref.attachmentId], 256);

    if (type === "image" || type === "media" || type === "IMAGE".toLowerCase()) {
      const mediaImage = await resolveMediaAttachmentImageUrl(attachmentId);
      if (mediaImage) return mediaImage;
    }
  }

  for (const rawRef of attachmentRefs) {
    const ref = readObject(rawRef);
    const type = normalizeText(ref.type, 64).toLowerCase();
    const entityId = firstText([ref.entityId, ref.attachmentId], 256);

    if (type === "book") {
      const bookImage = await resolveBookAttachmentImageUrl(entityId);
      if (bookImage) return bookImage;
    }
    if (type === "author") {
      const authorImage = await resolveAuthorAttachmentImageUrl(entityId);
      if (authorImage) return authorImage;
    }
    if (type === "shelf") {
      const shelfImage = await resolveShelfAttachmentImageUrl(
        entityId,
        firstText([ref.entityOwnerId], 256)
      );
      if (shelfImage) return shelfImage;
    }
  }

  return null;
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
    previewImageUrl: await resolvePostPreviewImageUrl(source),
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
    : book.author
      ? `Discover ${book.title} by ${book.author} on BookTown.`
      : `Discover ${book.title} on BookTown.`;
  const socialImage =
    book.imageUrl || buildAbsolutePublicUrl(canonicalUrl, "/icons/publication-social-fallback.png");

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    url: canonicalUrl,
    image: socialImage,
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
    metaDescription,
    jsonLd,
    isBookLayout: true,
    ...(book.description ? { bookDescription: book.description } : {}),
    social: {
      type: "website",
      siteName: "BookTown",
      url: canonicalUrl,
      title,
      description: metaDescription,
      image: socialImage,
      twitterCard: "summary_large_image",
    },
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
    : author.nationality
      ? `Explore ${author.name}, ${author.nationality} author, on BookTown.`
      : `Explore ${author.name} on BookTown.`;
  const socialImage =
    author.imageUrl || buildAbsolutePublicUrl(canonicalUrl, "/icons/publication-social-fallback.png");

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: author.name,
    url: canonicalUrl,
    image: socialImage,
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
    metaDescription,
    jsonLd,
    isBookLayout: true,
    ...(author.biography ? { bookDescription: author.biography } : {}),
    social: {
      type: "website",
      siteName: "BookTown",
      url: canonicalUrl,
      title,
      description: metaDescription,
      image: socialImage,
      twitterCard: "summary_large_image",
    },
  };
};

const buildPostModel = (post: PostEntityView, canonicalUrl: string): ShellModel => {
  const bodyText = post.content;
  const headline = bodyText ? takeChars(bodyText, 120) : "Post";
  const titleBase = post.authorName ? `${post.authorName} on BookTown` : "BookTown Post";
  const description = bodyText
    ? truncateText(bodyText, 170)
    : "A public post from BookTown, a reading-first social space for books and writing.";
  const articleBody = bodyText ? takeChars(bodyText, 5000) : "";
  const socialImage = post.previewImageUrl || buildPostSocialCardUrl(canonicalUrl);

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
    title: titleBase,
    canonicalUrl,
    heading: headline,
    details,
    metaDescription: description,
    jsonLd,
    isBookLayout: true,
    ...(bodyText ? { bookDescription: bodyText } : {}),
    cacheControl: "public, max-age=0, s-maxage=60",
    social: {
      type: "article",
      siteName: "BookTown",
      url: canonicalUrl,
      title: titleBase,
      description,
      image: socialImage,
      twitterCard: "summary_large_image",
    },
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

const splitSvgTextLines = (
  text: string,
  maxCharsPerLine: number,
  maxLines: number
): string[] => {
  const words = normalizeText(text, 600).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = truncateText(lines[maxLines - 1], Math.max(12, maxCharsPerLine - 1));
  }

  return lines.length > 0 ? lines : ["A public post from BookTown"];
};

const renderPostSocialCardPng = async (post: PostEntityView): Promise<Buffer> => {
  const title = post.authorName ? `${post.authorName} on BookTown` : "BookTown Post";
  const excerpt = post.content
    ? truncateText(post.content, 220)
    : "A reading-first post from BookTown.";
  const titleLines = splitSvgTextLines(title, 34, 2);
  const excerptLines = splitSvgTextLines(excerpt, 54, 4);

  const titleTspans = titleLines
    .map((line, index) =>
      `<tspan x="96" dy="${index === 0 ? 0 : 52}">${escapeHtml(line)}</tspan>`
    )
    .join("");
  const excerptTspans = excerptLines
    .map((line, index) =>
      `<tspan x="96" dy="${index === 0 ? 0 : 38}">${escapeHtml(line)}</tspan>`
    )
    .join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop stop-color="#06111F"/>
      <stop offset="0.52" stop-color="#0B1C2E"/>
      <stop offset="1" stop-color="#102E44"/>
    </linearGradient>
    <radialGradient id="accent" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(912 130) rotate(135) scale(520 360)">
      <stop stop-color="#38BDF8" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#38BDF8" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" rx="36" fill="url(#bg)"/>
  <rect width="1200" height="630" rx="36" fill="url(#accent)"/>
  <rect x="56" y="54" width="1088" height="522" rx="32" fill="#020817" fill-opacity="0.24" stroke="#E0F2FE" stroke-opacity="0.12"/>
  <g transform="translate(96 92)">
    <rect x="0" y="0" width="54" height="54" rx="16" fill="#38BDF8" fill-opacity="0.16" stroke="#7DD3FC" stroke-opacity="0.42"/>
    <path d="M17 17H37C40.314 17 43 19.686 43 23V37C43 40.314 40.314 43 37 43H17V17Z" fill="#E0F2FE" fill-opacity="0.95"/>
    <path d="M17 17H33C36.314 17 39 19.686 39 23V39H17V17Z" fill="#0F172A"/>
    <path d="M23 25H33M23 32H31" stroke="#7DD3FC" stroke-width="3" stroke-linecap="round"/>
  </g>
  <text x="166" y="128" fill="#BAE6FD" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="5">BOOKTOWN</text>
  <text x="96" y="250" fill="#F8FAFC" font-family="Georgia, 'Times New Roman', serif" font-size="52" font-weight="700">${titleTspans}</text>
  <text x="96" y="382" fill="#CBD5E1" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="500">${excerptTspans}</text>
  <line x1="96" y1="525" x2="1098" y2="525" stroke="#E0F2FE" stroke-opacity="0.12"/>
  <text x="96" y="558" fill="#7DD3FC" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="600">A reading-first social space for books and writing</text>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
};

/**
 * SSR shell endpoint for public entity pages.
 * Book, author, and post routes are entity-backed for crawler-readable public pages.
 */
export const ssrPublicPage = onRequest({ region: "us-central1" }, async (req, res) => {
  const route = parsePublicRoute(req.path || "/");
  const canonicalUrl = buildCanonicalUrl(req, route.pathname);

  if (isSocialCardImageRequest(req)) {
    if (!route.ok || route.entityType !== "post") {
      res.status(404).send("Not Found");
      return;
    }

    const post = await fetchPostEntity(route.entityId);
    if (!post) {
      res.status(404).send("Not Found");
      return;
    }

    const png = await renderPostSocialCardPng(post);
    res.status(200);
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=0, s-maxage=86400");
    res.send(png);
    return;
  }

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
