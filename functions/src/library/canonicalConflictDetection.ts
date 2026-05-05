import { getFirestore } from "firebase-admin/firestore";
import { normalizeSearchText } from "./normalization/bookSearchNormalization";
import { buildCanonicalKey } from "./persistence/canonicalKey";

const db = getFirestore();

export interface ConflictCandidate {
  bookId: string;
  title: string;
  author: string;
  canonicalKey: string;
  similarityScore: number;
}

export interface ConflictDetectionResult {
  hasExactMatch: boolean;
  exactMatchBookId?: string;
  hasSimilarConflicts: boolean;
  conflictCandidates: ConflictCandidate[];
}

/**
 * Compute Levenshtein distance between two strings (bounded for performance)
 */
function boundedLevenshteinDistance(
  a: string,
  b: string,
  maxDistance: number = 5
): number | null {
  const aLen = a.length;
  const bLen = b.length;

  if (aLen === 0) return bLen <= maxDistance ? bLen : null;
  if (bLen === 0) return aLen <= maxDistance ? aLen : null;

  const lenDiff = Math.abs(aLen - bLen);
  if (lenDiff > maxDistance) return null;

  const matrix: number[][] = [];
  for (let i = 0; i <= aLen; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bLen; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= aLen; i++) {
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[aLen][bLen];
  return distance <= maxDistance ? distance : null;
}

/**
 * Compute similarity score between two strings (0-1)
 * Uses normalized Levenshtein distance
 */
function computeStringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;

  const normalized_a = normalizeSearchText(a).trim();
  const normalized_b = normalizeSearchText(b).trim();

  if (!normalized_a || !normalized_b) return 0;
  if (normalized_a === normalized_b) return 1.0;

  const maxLen = Math.max(normalized_a.length, normalized_b.length);
  if (maxLen === 0) return 1.0;

  const distance = boundedLevenshteinDistance(normalized_a, normalized_b, maxLen);
  if (distance === null) return 0;

  return 1.0 - distance / maxLen;
}

/**
 * Compute combined similarity score for title + author
 * Uses weighted average: 70% title similarity, 30% author similarity
 */
function computeCombinedSimilarity(
  queryTitle: string,
  queryAuthor: string,
  candidateTitle: string,
  candidateAuthor: string
): number {
  const titleSim = computeStringSimilarity(queryTitle, candidateTitle);
  const authorSim = computeStringSimilarity(queryAuthor, candidateAuthor);

  return titleSim * 0.7 + authorSim * 0.3;
}

/**
 * Detect conflicts for a canonical book before creation
 * Returns exact matches and similar candidates above threshold
 */
export async function detectCanonicalConflicts(params: {
  title: string;
  author: string;
  similarityThreshold?: number;
  maxCandidates?: number;
}): Promise<ConflictDetectionResult> {
  const title = params.title.trim();
  const author = params.author.trim();
  const threshold = params.similarityThreshold ?? 0.85;
  const maxCandidates = params.maxCandidates ?? 5;

  if (!title || !author) {
    return {
      hasExactMatch: false,
      hasSimilarConflicts: false,
      conflictCandidates: [],
    };
  }

  const canonicalKey = buildCanonicalKey({
    title,
    author,
  });

  try {
    // Step 1: Check for exact canonicalKey match
    const exactMatchSnap = await db
      .collection("books")
      .where("canonicalKey", "==", canonicalKey)
      .limit(1)
      .get();

    if (!exactMatchSnap.empty) {
      const existingDoc = exactMatchSnap.docs[0];
      return {
        hasExactMatch: true,
        exactMatchBookId: existingDoc.id,
        hasSimilarConflicts: false,
        conflictCandidates: [],
      };
    }

    // Step 2: Search for similar titles
    const normalizedTitle = normalizeSearchText(title);
    const normalizedAuthor = normalizeSearchText(author);

    // Query books with similar title tokens
    const titleTokens = normalizedTitle
      .split(" ")
      .filter((t) => t.length > 2)
      .slice(0, 3);

    if (titleTokens.length === 0) {
      return {
        hasExactMatch: false,
        hasSimilarConflicts: false,
        conflictCandidates: [],
      };
    }

    // Collect candidate books by title/author proximity
    const candidates: ConflictCandidate[] = [];
    const seenBookIds = new Set<string>();

    // Search by approximate title match
    const booksSnap = await db
      .collection("books")
      .where("canonicalTitle", ">=", titleTokens[0])
      .where("canonicalTitle", "<", titleTokens[0] + "\uf8ff")
      .limit(50)
      .get();

    for (const doc of booksSnap.docs) {
      if (seenBookIds.has(doc.id)) continue;

      const data = doc.data() as Record<string, unknown>;
      const candidateTitle = String(data.canonicalTitle || data.title || "");
      const candidateAuthor = String(data.author || data.authorEn || "");

      if (!candidateTitle) continue;

      const similarity = computeCombinedSimilarity(
        title,
        author,
        candidateTitle,
        candidateAuthor
      );

      if (similarity >= threshold) {
        seenBookIds.add(doc.id);
        candidates.push({
          bookId: doc.id,
          title: candidateTitle,
          author: candidateAuthor,
          canonicalKey: String(data.canonicalKey || ""),
          similarityScore: Math.round(similarity * 1000) / 1000,
        });
      }
    }

    // Sort by similarity descending and limit results
    candidates.sort((a, b) => b.similarityScore - a.similarityScore);
    const topCandidates = candidates.slice(0, maxCandidates);

    return {
      hasExactMatch: false,
      hasSimilarConflicts: topCandidates.length > 0,
      conflictCandidates: topCandidates,
    };
  } catch (error) {
    // Log error but don't fail the operation
    console.error("Error detecting canonical conflicts:", error);
    return {
      hasExactMatch: false,
      hasSimilarConflicts: false,
      conflictCandidates: [],
    };
  }
}
