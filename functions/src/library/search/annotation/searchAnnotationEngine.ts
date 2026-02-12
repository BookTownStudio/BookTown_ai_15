// functions/src/library/search/annotation/searchAnnotationEngine.ts

/**
 * ============================================================
 * 🔒 BOOKTOWN SEARCH ANNOTATION ENGINE — PHASE 2
 * ============================================================
 *
 * Phase 2 adds:
 * - Explainable annotations
 * - User-context-derived signals
 *
 * HARD RULES:
 * - No ranking
 * - No filtering
 * - No reordering
 * - No mutation of canonical fields
 * - No result injection
 *
 * SEARCH REMAINS THE SOURCE OF TRUTH.
 * ============================================================
 */

export interface SearchAnnotationInput<T = unknown> {
  results: T[];
  userContext?: {
    language?: string;
    shelves?: string[];
    history?: string[];
    [key: string]: unknown;
  };
}

export type SearchAnnotationPhase = 'v2_explainable_annotations';

export interface SearchAnnotation {
  phase: SearchAnnotationPhase;
  signals: {
    languageMatch?: boolean;
    fromShelf?: boolean;
    fromHistory?: boolean;
  };
  explanation?: string;
}

export type WithSearchAnnotation<T> = T & {
  discovery: SearchAnnotation;
};

export async function searchAnnotationEngine<T = unknown>(
  input: SearchAnnotationInput<T> | null
): Promise<WithSearchAnnotation<T>[]> {
  // ------------------------------------------------------------
  // 1. Hard safety
  // ------------------------------------------------------------
  if (!input || typeof input !== 'object' || !Array.isArray(input.results)) {
    return [];
  }

  const { results, userContext } = input;

  try {
    const userLanguage =
      typeof userContext?.language === 'string'
        ? userContext.language.toLowerCase()
        : null;

    const shelves = Array.isArray(userContext?.shelves)
      ? userContext!.shelves
      : [];

    const history = Array.isArray(userContext?.history)
      ? userContext!.history
      : [];

    return results.map(item => {
      const itemAny = item as any;

      const itemLanguage =
        typeof itemAny.language === 'string'
          ? itemAny.language.toLowerCase()
          : null;

      const languageMatch =
        Boolean(userLanguage && itemLanguage && userLanguage === itemLanguage);

      const fromShelf =
        typeof itemAny.id === 'string' && shelves.includes(itemAny.id);

      const fromHistory =
        typeof itemAny.id === 'string' && history.includes(itemAny.id);

      const signals = {
        languageMatch,
        fromShelf,
        fromHistory,
      };

      let explanation: string | undefined;

      // ------------------------------------------------------------
      // Phase 2 requirement: explanations are mandatory if any signal is true
      // ------------------------------------------------------------
      if (languageMatch || fromShelf || fromHistory) {
        const reasons: string[] = [];

        if (languageMatch) reasons.push('language preference');
        if (fromShelf) reasons.push('your shelf');
        if (fromHistory) reasons.push('your reading history');

        explanation = `Recommended based on ${reasons.join(', ')}.`;
      }

      return {
        ...(itemAny as T),
        discovery: {
          phase: 'v2_explainable_annotations',
          signals,
          ...(explanation ? { explanation } : {}),
        },
      };
    });
  } catch {
    // ------------------------------------------------------------
    // Fail-safe: return original results unchanged
    // ------------------------------------------------------------
    return results as WithSearchAnnotation<T>[];
  }
}
