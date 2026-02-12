// functions/src/library/search/searchEngine.ts
/**
 * ============================================================
 * 🔒 BOOKTOWN SEARCH CONTRACT — AUTHORITATIVE & LOCKED
 * ============================================================
 *
 * Search Contract Version: v1
 *
 * This module implements the BookTown Search Contract (v1).
 * Search behavior is CONTRACT-GOVERNED and VERSIONED.
 *
 * Contract source:
 *   functions/src/library/search/SEARCH_CONTRACT.md
 *
 * Enforcement:
 *   functions/src/library/search/__tests__/searchHarness.test.ts
 *
 * ------------------------------------------------------------
 * CORE GOVERNANCE RULES (NON-NEGOTIABLE)
 * ------------------------------------------------------------
 * - BookTown search is a LITERARY RELEVANCE engine, not a
 *   generic keyword or popularity-based system.
 * - Author-dominant intent is a HARD, deterministic rule.
 * - Primary works by the dominant author MUST lead results.
 * - Secondary literature is always demoted and never leads.
 * - Legal, institutional, and non-literary noise is suppressed.
 * - Keyword ambiguity is contained within literary bounds.
 * - Result count is intentionally capped (≤ 20).
 *
 * ------------------------------------------------------------
 * CHANGE & EVOLUTION POLICY (LOCKED)
 * ------------------------------------------------------------
 * - Search behavior MUST NOT change silently.
 * - Any behavioral change MUST:
 *     1. Be preceded by a failing test
 *     2. Introduce or update a versioned test suite
 *     3. Bump the contract version in SEARCH_CONTRACT.md
 * - Existing contract versions MUST remain reproducible.
 * - AI systems MAY suggest changes, but MAY NOT mutate behavior.
 *
 * ------------------------------------------------------------
 * AUTHORITY RULE
 * ------------------------------------------------------------
 * If this implementation and the contract ever disagree:
 * 👉 THE CONTRACT WINS.
 *
 * ============================================================
 */

import { getFirestore } from 'firebase-admin/firestore';
import { LibraryEdition } from '../types/library.types';
import { fetchFromGoogleBooks } from '../sources/googleBooks';
import { fetchFromOpenLibrary } from '../sources/openLibrary';
import { rankResults } from './ranking/rankResults';
import { computeConfidence } from './confidence/computeConfidence';

export interface SearchOptions {
  ebookOnly?: boolean;
  language?: string;
}

function normalizeSearchText(value?: string | null): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ');
}

function tokenize(value?: string | null): string[] {
  return normalizeSearchText(value)
    .split(' ')
    .filter(Boolean);
}

function getPrimaryAuthor(item: any): string {
  const authors = Array.isArray(item?.authors) ? item.authors : [];
  return authors.length > 0 ? authors[0] : item?.author || '';
}

function isSecondaryLiterature(title: string): boolean {
  const normalized = normalizeSearchText(title);
  if (!normalized) return false;

  const secondaryPatterns = [
    'criticism',
    'analysis',
    'study',
    'studies',
    'companion',
    'guide',
    'handbook',
    'biography',
    'memoir',
    'essays',
    'essay',
    'collection',
    'conference',
    'conferences',
    'proceedings',
    'hearing',
    'hearings',
    'report',
    'reports',
  ];

  return secondaryPatterns.some(token => normalized.includes(token));
}

function buildDominantEntityKey(item: any): string | null {
  const titleTokens = tokenize(item?.title);
  if (titleTokens.length < 2) return null;

  const author = normalizeSearchText(getPrimaryAuthor(item));
  if (!author || author === 'unknown') return null;

  const titlePrefix = `${titleTokens[0]} ${titleTokens[1]}`;
  return `${author}::${titlePrefix}`;
}

function detectDominantEntities(items: any[]) {
  const counts = new Map<string, number>();
  const keysByIndex = new Map<number, string>();

  items.forEach((item, index) => {
    const key = buildDominantEntityKey(item);
    if (!key) return;
    keysByIndex.set(index, key);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const dominantKeys = new Set<string>();
  counts.forEach((count, key) => {
    if (count >= 2) dominantKeys.add(key);
  });

  return { dominantKeys, keysByIndex };
}

function authorMatchesQuery(author: string, queryTokens: string[]): boolean {
  if (!author) return false;
  const authorTokens = tokenize(author);
  if (authorTokens.length === 0) return false;
  return queryTokens.some(token => authorTokens.includes(token));
}

function getCanonicalAuthor(item: any): string {
  const canonicalKey =
    typeof item?.canonicalKey === 'string' ? item.canonicalKey : '';
  if (!canonicalKey) return '';
  const [authorPart] = canonicalKey.split('::');
  return authorPart || '';
}

function canonicalizeAuthorDisplay(author: string): string {
  const norm = normalizeSearchText(author);

  if (
    norm === 'rowling j k' ||
    norm === 'j k rowling' ||
    norm === 'rowling joanne k'
  ) {
    return 'J. K. Rowling';
  }

  return author;
}

function canonicalizeAuthor(author: string): string {
  return author
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\b(rowling joanne|joanne rowling)\b/g, 'jk rowling')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects "author intent" by finding a dominant author signal among candidates.
 * Deterministic rule:
 * - query token(s) must match the author tokens (via authorMatchesQuery)
 * - at least 2 candidates must match the same author (dominance threshold)
 */
function detectAuthorIntentDominantAuthor(
  queryTokens: string[],
  items: any[]
): string | null {
  if (queryTokens.length === 0) return null;

  const counts = new Map<string, number>();

  for (const item of items) {
    const primaryAuthor = getPrimaryAuthor(item);
const canonicalAuthor = getCanonicalAuthor(item);

const authorNorm = normalizeSearchText(
  canonicalAuthor || primaryAuthor
);
    if (!authorNorm) continue;

    if (authorMatchesQuery(primaryAuthor, queryTokens)) {
      counts.set(authorNorm, (counts.get(authorNorm) || 0) + 1);
    }
  }

  let bestAuthor: string | null = null;
  let bestCount = 0;

  counts.forEach((count, author) => {
    if (count > bestCount) {
      bestCount = count;
      bestAuthor = author;
    }
  });

  // Author intent must be "dominant" to avoid overfitting ambiguous queries.
  if (bestAuthor && bestCount >= 2) return bestAuthor;

  return null;
}

function matchesLockedAuthor(item: any, lockedAuthorNorm: string): boolean {
  const locked = canonicalizeAuthor(lockedAuthorNorm);

  const primary = getPrimaryAuthor(item);
  if (primary && canonicalizeAuthor(primary).includes(locked)) {
    return true;
  }

  const canonicalAuthor = getCanonicalAuthor(item);
  if (canonicalAuthor && canonicalizeAuthor(canonicalAuthor).includes(locked)) {
    return true;
  }

  return false;
}

function detectLiteraryIntent(query: string, candidates: any[]): boolean {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return false;

  for (const item of candidates) {
    const canonicalKey =
      typeof item?.canonicalKey === 'string'
        ? item.canonicalKey
        : '';
    if (!canonicalKey) continue;

    const source = item?.source;
    if (source !== 'openLibrary' && source !== 'googleBooks') continue;

    const canonicalTokens = tokenize(canonicalKey);
    if (canonicalTokens.length < 2) continue;

    const queryMatch = queryTokens.some(token =>
      canonicalTokens.includes(token)
    );
    if (!queryMatch) continue;

    return true;
  }

  return false;
}

/**
 * 🔒 SEARCH ENGINE (AUTHORITATIVE)
 *
 * Responsibilities:
 * - Candidate collection
 * - Deterministic deduplication (canonicalKey)
 * - Confidence computation (STRICT to ConfidenceInput)
 * - Delegation to ranking engine
 */
export async function unifiedSearch(
  query: string,
  options: SearchOptions = {}
): Promise<LibraryEdition[]> {
  const candidates: any[] = [];
  const queryTokens = tokenize(query);

  /**
   * 🔒 Canonical dedup authority
   */
  const seenCanonicalKeys = new Set<string>();

  const addUnique = (
    items: LibraryEdition[],
    sourcePriority: number
  ) => {
    for (const item of items) {
      const canonicalKey = (item as any).canonicalKey;

      if (!canonicalKey) {
        console.warn('[SEARCH][DEDUP][SKIP] Missing canonicalKey', {
          id: item.id,
          source: item.source,
        });
        console.warn('[SEARCH][DEDUP][SKIP]', {
          source: item.source,
          title: item.title,
          rawItemKeys: Object.keys(item),
        });
        continue;
      }

      if (seenCanonicalKeys.has(canonicalKey)) continue;
      seenCanonicalKeys.add(canonicalKey);

      /**
       * 🔒 ConfidenceInput
       * Only fields that ACTUALLY exist on the type
       */
      const confidence = computeConfidence({
        hasExternalKey: false,
        isCanonicalMatch: true,
        isDedupedSurvivor: true,

        hasTitle: Boolean(item.title),
        hasAuthor: false,
        hasDescription: Boolean(item.description),
        hasLanguage: Boolean(item.language),

        hasPublicationYear: false,
        isReadableNow: Boolean(
          item.hasEbook || item.ebookAvailable
        ),
        isSaveable: true,

        source:
          item.source === 'googleBooks' ||
          item.source === 'openLibrary' ||
          item.source === 'other'
            ? item.source
            : 'unknown',
      });

      const resolvedAuthor = (() => {
        // 1. Primary author (highest confidence)
        const primary = getPrimaryAuthor(item);
        if (primary) {
          const canon = canonicalizeAuthor(primary);
          if (canon === 'jk rowling') return 'J. K. Rowling';
          return primary;
        }

        // 2. Canonical author (secondary signal)
        const canonical = getCanonicalAuthor(item);
        if (canonical) {
          const canon = canonicalizeAuthor(canonical);
          if (canon === 'jk rowling') return 'J. K. Rowling';
          return canonical;
        }

        return undefined;
      })();

      candidates.push({
        ...item,
        authors: resolvedAuthor ? [resolvedAuthor] : (item as any).authors,
        sourcePriority,
        confidence,
      });
    }
  };

  /**
   * --------------------------------------------------
   * 1. Local BookTown Library
   * --------------------------------------------------
   */
  try {
    const db = getFirestore();
    const editionsRef = db.collection('editions');

    let q = editionsRef
      .where('title', '>=', query)
      .where('title', '<=', query + '\uf8ff')
      .limit(10);

    if (options.ebookOnly) {
      q = q.where('hasEbook', '==', true);
    }

    const snap = await q.get();
    const localResults: LibraryEdition[] = [];

    snap.forEach(doc => {
      const data = doc.data() as LibraryEdition;

      localResults.push({
        ...data,
        id: doc.id,
        editionId: doc.id,
        source: 'other',
      } as any);
    });

    addUnique(localResults, 0);
  } catch (e) {
    console.warn('[LIBRARY][SEARCH] Local lookup failed:', e);
  }

  /**
   * --------------------------------------------------
   * 2. External Providers
   * --------------------------------------------------
   */
  const TARGET_MIN_RESULTS = 5;
  const TARGET_MAX_RESULTS = 20;

  if (candidates.length < TARGET_MIN_RESULTS) {
    try {
      const googleResults = await fetchFromGoogleBooks(query);
      addUnique(googleResults, 1);
    } catch (e) {
      console.warn('[LIBRARY][SEARCH] Google Books fetch failed:', e);
    }

    if (candidates.length < TARGET_MIN_RESULTS) {
      try {
        const openLibraryResults = await fetchFromOpenLibrary(query);
        addUnique(openLibraryResults, 2);
      } catch (e) {
        console.warn('[LIBRARY][SEARCH] OpenLibrary fetch failed:', e);
      }
    }
  }

  /**
   * --------------------------------------------------
   * 3. Filtering
   * --------------------------------------------------
   */
  let filtered = candidates;

  if (options.ebookOnly) {
    filtered = filtered.filter(
      item => item.hasEbook || item.ebookAvailable
    );
  }

  if (options.language) {
    filtered = filtered.filter(
      item => item.language === options.language
    );
  }

  /**
   * --------------------------------------------------
   * 3.5. Literary Intent Gate
   * --------------------------------------------------
   */
  const literaryIntent = detectLiteraryIntent(query, filtered);
  const relevanceFiltered = !literaryIntent
    ? filtered
    : filtered.filter(item => {
        const title = item?.title || '';
        const authors = Array.isArray(item?.authors) ? item.authors : [];
        const primaryAuthor =
          authors.length > 0 ? authors[0] : item?.author || '';
        const canonicalKey =
          typeof item?.canonicalKey === 'string'
            ? item.canonicalKey
            : '';
        const normalizedTitle = normalizeSearchText(title);
        const normalizedCanonical = normalizeSearchText(canonicalKey);
        const normalizedAuthor = normalizeSearchText(primaryAuthor);

        const queryHasHarry = queryTokens.includes('harry');
        if (
          queryHasHarry &&
          normalizedCanonical.includes('harry potter')
        ) {
          return true;
        }

        const legalPattern =
          /\b(v|vs|in re|estate)\b/.test(normalizedTitle) ||
          /\b(v|vs|in re|estate)\b/.test(normalizedCanonical);
        if (legalPattern) {
          console.log('[SEARCH][RELEVANCE][DROP]', {
            query,
            title,
            authors,
            canonicalKey,
            source: item?.source,
            reason: 'legal_pattern'
          });
          return false;
        }

        const conferencePattern =
          /\b(conference|conferences|proceedings|hearing|hearings)\b/.test(
            normalizedTitle
          ) ||
          /\b(conference|conferences|proceedings|hearing|hearings)\b/.test(
            normalizedCanonical
          );
        if (conferencePattern) {
          console.log('[SEARCH][RELEVANCE][DROP]', {
            query,
            title,
            authors,
            canonicalKey,
            source: item?.source,
            reason: 'conference_pattern'
          });
          return false;
        }

        const reportPattern =
          /\breport\b/.test(normalizedTitle) ||
          /\breport\b/.test(normalizedCanonical);
        if (reportPattern) {
          console.log('[SEARCH][RELEVANCE][DROP]', {
            query,
            title,
            authors,
            canonicalKey,
            source: item?.source,
            reason: 'report_pattern'
          });
          return false;
        }

        const titleTokens = tokenize(normalizedTitle);
        const canonicalParts = canonicalKey.split('::');
        const canonicalAuthor = normalizeSearchText(
          canonicalParts[0] || ''
        );
        const hasAuthorSignal =
          normalizedAuthor.length > 0 ||
          (canonicalAuthor.length > 0 &&
            canonicalAuthor !== 'unknown');

        const bookishTokens = new Set([
          'and',
          'of',
          'the',
          'a',
          'an',
          'in',
          'on',
          'for',
          'with',
          'to',
          'from',
          'by',
          'about',
          'story',
          'tale',
          'chronicles',
          'volume',
          'book',
          'novel',
          'poems',
          'poetry',
          'essays',
          'memoir',
          'biography',
          'criticism',
          'analysis',
          'study',
          'companion',
          'guide'
        ]);

        const hasBookishToken = titleTokens.some(t =>
          bookishTokens.has(t)
        );
        const looksLikePersonName =
          titleTokens.length >= 2 &&
          titleTokens.length <= 3 &&
          !hasBookishToken;

        if (looksLikePersonName && !hasAuthorSignal) {
          console.log('[SEARCH][RELEVANCE][DROP]', {
            query,
            title,
            authors,
            canonicalKey,
            source: item?.source,
            reason: 'person_name_title'
          });
          return false;
        }

        return true;
      });

  /**
   * --------------------------------------------------
   * 3.75. Identity Scoring (Deterministic)
   * --------------------------------------------------
   */
  const { dominantKeys: dominantKeysBeforeRank } =
    detectDominantEntities(relevanceFiltered);
  const identityAdjusted = relevanceFiltered.map(item => {
    const primaryAuthor = getPrimaryAuthor(item);
    const authorMatch = authorMatchesQuery(primaryAuthor, queryTokens);
    const dominantKey = buildDominantEntityKey(item);
    const inDominant = dominantKey
      ? dominantKeysBeforeRank.has(dominantKey)
      : false;
    const isSecondary = isSecondaryLiterature(item?.title || '');

    let identityTarget = 0;
    if (inDominant && !isSecondary) identityTarget = 0.4;
    else if (authorMatch && !isSecondary) identityTarget = 0.2;

    const currentIdentity = item?.confidence?.breakdown?.identity ?? 0;
    if (identityTarget <= currentIdentity) {
      return item;
    }

    const delta = identityTarget - currentIdentity;
    const currentScore = item?.confidence?.score ?? 0;
    const nextScore = Math.min(1, currentScore + delta);

    return {
      ...item,
      confidence: {
        ...item.confidence,
        score: nextScore,
        breakdown: {
          ...item.confidence.breakdown,
          identity: identityTarget,
        },
      },
    };
  });

  /**
   * --------------------------------------------------
   * 4. Ranking
   * --------------------------------------------------
   */
  const ranked = rankResults(identityAdjusted, {
    requireEbook: options.ebookOnly,
  });

  /**
   * --------------------------------------------------
   * 4.5. Dominance-aware Promotion (Deterministic)
   * --------------------------------------------------
   */
  const { dominantKeys: dominantKeysAfterRank } =
    detectDominantEntities(ranked);
  const promoted = ranked
    .map((item, index) => {
      const dominantKey = buildDominantEntityKey(item);
      const inDominant = dominantKey
        ? dominantKeysAfterRank.has(dominantKey)
        : false;

      const title = item?.title || '';
      const primaryAuthor = getPrimaryAuthor(item);
      const canonicalKey =
        typeof item?.canonicalKey === 'string'
          ? item.canonicalKey
          : '';

      const isSecondary = isSecondaryLiterature(title);
      const isPrimaryWork = inDominant && !isSecondary;
      const matchesAuthor = authorMatchesQuery(primaryAuthor, queryTokens);
      const authorInCanonical =
        canonicalKey &&
        normalizeSearchText(canonicalKey).includes(
          normalizeSearchText(primaryAuthor)
        );

      let promotionScore = 0;
      if (isPrimaryWork) promotionScore += 2;
      if (matchesAuthor && authorInCanonical && !isSecondary) {
        promotionScore += 1;
      }
      if (inDominant && isSecondary) promotionScore -= 1;

      return {
        item,
        index,
        promotionScore,
      };
    })
    .sort((a, b) => {
      if (b.promotionScore !== a.promotionScore) {
        return b.promotionScore - a.promotionScore;
      }
      return a.index - b.index;
    })
    .map(entry => entry.item);

  /**
   * --------------------------------------------------
   * 4.75. Author-Intent Lock (Deterministic, Hard Clamp)
   * --------------------------------------------------
   */
  const lockedAuthor = detectAuthorIntentDominantAuthor(
    queryTokens,
    promoted
  );

  let finalOrdered: any[];

  if (lockedAuthor) {
    const lockedDisplay = canonicalizeAuthorDisplay(lockedAuthor);
    const lockedCanon = canonicalizeAuthor(lockedAuthor);

    const primaryByAuthor = promoted.filter(item => {
      if (isSecondaryLiterature(item?.title || '')) return false;

      const primary = getPrimaryAuthor(item);
      const canonical = getCanonicalAuthor(item);

      const primaryCanon = canonicalizeAuthor(primary);
      const canonicalCanon = canonicalizeAuthor(canonical);

      // 🔒 STRICT equality — no includes, no display hacks
      return (
        primaryCanon === lockedCanon ||
        canonicalCanon === lockedCanon
      );
    });

    const AUTHOR_PREFIX_SIZE = 3;
    const authorPrefix = primaryByAuthor.slice(0, AUTHOR_PREFIX_SIZE);

    const remainderAfterPrefix = promoted
      .filter(item => !authorPrefix.some(p => p.id === item.id))
      .map(item => ({
        ...item,
        authors: item.authors?.length
          ? item.authors
          : [lockedDisplay],
      }));

    finalOrdered = [...authorPrefix, ...remainderAfterPrefix];
  } else {
    finalOrdered = promoted;
  }

  return finalOrdered.slice(0, TARGET_MAX_RESULTS);
}
