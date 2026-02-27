// lib/hooks/useBookIngestion.ts

import { useMutation } from '@tanstack/react-query';
import { ensureCanonicalBook } from '../books/ensureCanonicalBook.ts';

interface IngestionParams {
  providerExternalId: string;
  source: 'googleBooks' | 'openLibrary';
  rawBook: any;
}

interface IngestionResult {
  canonicalBookId: string;
  bookId: string;
  editionId?: string;
  status?: string;
}

/**
 * useBookIngestion
 *
 * 🔒 INTENT-ONLY INGESTION HOOK
 *
 * Responsibilities:
 * - Trigger server-side materialization
 * - Return canonical identifiers
 *
 * Explicitly DOES NOT:
 * - Populate catalog cache
 * - Return Book objects
 * - Perform optimistic writes
 *
 * Canonical data must always be read via useBookCatalog(bookId)
 */
export const useBookIngestion = () => {
  return useMutation<IngestionResult | null, unknown, IngestionParams>({
    mutationFn: async ({ providerExternalId, source, rawBook }) => {
      /**
       * Signature is intentionally object-based
       * to remain forward-compatible with ingestion contracts.
       */
      return ensureCanonicalBook({
        providerExternalId,
        source,
        rawBook,
      });
    },

    /**
     * Success handler intentionally minimal.
     * Navigation + catalog hydration are handled
     * by the caller using canonicalId.
     */
    onSuccess: (result) => {
      if (!result?.canonicalBookId) {
        console.warn(
          '[useBookIngestion] No canonicalBookId returned',
          result
        );
      }
    },

    /**
     * Never throw.
     * Ingestion failure must not break UX.
     */
    onError: (err) => {
      console.warn(
        '[useBookIngestion] Ingestion failed (non-blocking)',
        err
      );
    },
  });
};
