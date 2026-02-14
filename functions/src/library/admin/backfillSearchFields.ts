import { admin } from "../../firebaseAdmin";

const SEARCH_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

function normalizeSearchText(value?: string | null): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSearch(value?: string | null): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .filter((token) => token.length > 1 && !SEARCH_STOPWORDS.has(token));
}

export async function backfillSearchFields(batchSize = 500): Promise<void> {
  const db = admin.firestore();
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  while (true) {
    let query = db.collection("editions").orderBy("__name__").limit(batchSize);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snap = await query.get();
    if (snap.empty) break;

    const batch = db.batch();

    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>;
      const title = String(data.title || data.titleEn || "").trim();
      const authors = Array.isArray(data.authors)
        ? data.authors
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [String(data.authorEn || "").trim()].filter(Boolean);

      const normalizedTitle = normalizeSearchText(title);
      const normalizedAuthor = normalizeSearchText(authors.join(" "));
      const searchTokens = Array.from(
        new Set([
          ...tokenizeSearch(normalizedTitle),
          ...authors.flatMap((author) => tokenizeSearch(author)),
        ])
      );

      const downloadable = Boolean(data.downloadable);
      const hasEbook = downloadable;

      batch.set(
        doc.ref,
        {
          title,
          authors,
          searchTitleNormalized: normalizedTitle,
          searchAuthorNormalized: normalizedAuthor,
          searchTokens,
          downloadable,
          hasEbook,
          isEbookAvailable: hasEbook,
        },
        { merge: true }
      );
    }

    await batch.commit();
    lastDoc = snap.docs[snap.docs.length - 1];
  }
}
