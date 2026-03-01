import { useEffect, useMemo, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type {
  ReaderManifestSnapshot,
  ReaderSessionSnapshot,
} from '../reader/runtime/contracts.ts';

interface ReaderSessionBootstrapState {
  session: ReaderSessionSnapshot | null;
  manifest: ReaderManifestSnapshot | null;
  isLoading: boolean;
  error: string | null;
}

function normalizeEnvelope<T>(value: unknown): T {
  const payload = value as any;

  if (payload?.success === false) {
    const code =
      typeof payload?.error?.code === 'string' ? payload.error.code : 'UNKNOWN';
    const message =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : 'Callable request failed.';
    throw new Error(`[${code}] ${message}`);
  }

  return (payload?.success === true ? payload.data : payload) as T;
}

export function useReaderSessionBootstrap(bookId?: string): ReaderSessionBootstrapState {
  const [session, setSession] = useState<ReaderSessionSnapshot | null>(null);
  const [manifest, setManifest] = useState<ReaderManifestSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(bookId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookId) {
      setSession(null);
      setManifest(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);
    setError(null);

    const sessionFn = httpsCallable<{ bookId: string }, ReaderSessionSnapshot>(
      getFunctions(),
      'getOrCreateReadingSession'
    );
    const manifestFn = httpsCallable<{ bookId: string }, ReaderManifestSnapshot>(
      getFunctions(),
      'getReaderManifest'
    );

    Promise.all([
      sessionFn({ bookId }),
      manifestFn({ bookId }).catch(() => null),
    ])
      .then(([sessionRes, manifestRes]) => {
        if (!active) return;
        const nextSession = normalizeEnvelope<ReaderSessionSnapshot>(sessionRes.data);
        const nextManifest = manifestRes
          ? normalizeEnvelope<ReaderManifestSnapshot>(manifestRes.data)
          : null;

        if (
          !nextSession ||
          typeof nextSession.signedUrl !== 'string' ||
          nextSession.signedUrl.trim().length === 0
        ) {
          throw new Error('Invalid reader session payload.');
        }

        setSession(nextSession);
        setManifest(nextManifest);
      })
      .catch((err: any) => {
        if (!active) return;
        setError(String(err?.message || err));
        setSession(null);
        setManifest(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [bookId]);

  return useMemo(
    () => ({
      session,
      manifest,
      isLoading,
      error,
    }),
    [session, manifest, isLoading, error]
  );
}
