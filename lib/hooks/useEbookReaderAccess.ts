// lib/hooks/useEbookReaderAccess.ts

import { useCallback, useEffect, useRef, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../auth.tsx';

/**
 * useEbookReaderAccess
 * ----------------------------------
 * Tier-1 authoritative reader access hook.
 *
 * Responsibilities (LOCKED):
 * - Requests mediated read access for a book ebook
 * - Receives short-lived signed URL + expiry
 * - NEVER exposes storage paths or attachment IDs
 * - Handles auth, permission, and expiry errors
 * - In-memory cache only (no persistence)
 *
 * Source of truth:
 * Cloud Function: requestEbookReadAccessV2
 */

interface EbookReadAccessResponse {
  signedUrl: string;
  expiresAt: number; // epoch ms
}

interface UseEbookReaderAccessState {
  signedUrl: string | null;
  expiresAt: number | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const CACHE_TTL_SAFETY_WINDOW_MS = 30 * 1000; // refresh 30s before expiry

export function useEbookReaderAccess(bookId?: string): UseEbookReaderAccessState {
  const { user } = useAuth();

  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const inFlightRef = useRef<Promise<void> | null>(null);

  const requestAccess = useCallback(async () => {
    if (!bookId) {
      setError('Missing book identifier.');
      return;
    }

    if (!user) {
      setError('You must be signed in to read this book.');
      return;
    }

    // Prevent parallel calls
    if (inFlightRef.current) {
      await inFlightRef.current;
      return;
    }

    const task = (async () => {
      try {
        setIsLoading(true);
        setError(null);

        const fn = httpsCallable<{ bookId: string }, EbookReadAccessResponse>(
          getFunctions(),
          'requestEbookReadAccessV2'
        );

        const res = await fn({ bookId });

        if (!res.data?.signedUrl || !res.data?.expiresAt) {
          throw new Error('Invalid reader access response.');
        }

        setSignedUrl(res.data.signedUrl);
        setExpiresAt(res.data.expiresAt);
      } catch (err: any) {
        console.error('[READER][ACCESS_FAILED]', err);

        const code = err?.code || '';
        if (code === 'permission-denied') {
          setError('You do not have access to read this book.');
        } else if (code === 'unauthenticated') {
          setError('Please sign in to continue.');
        } else {
          setError('Failed to load book. Please try again.');
        }

        setSignedUrl(null);
        setExpiresAt(null);
      } finally {
        setIsLoading(false);
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = task;
    await task;
  }, [bookId, user]);

  // Initial load
  useEffect(() => {
    if (!bookId) return;
    requestAccess();
  }, [bookId, requestAccess]);

  // Auto-refresh before expiry
  useEffect(() => {
    if (!expiresAt) return;

    const now = Date.now();
    const refreshIn = expiresAt - now - CACHE_TTL_SAFETY_WINDOW_MS;

    if (refreshIn <= 0) {
      requestAccess();
      return;
    }

    const timer = setTimeout(() => {
      requestAccess();
    }, refreshIn);

    return () => clearTimeout(timer);
  }, [expiresAt, requestAccess]);

  return {
    signedUrl,
    expiresAt,
    isLoading,
    error,
    refresh: requestAccess
  };
}
