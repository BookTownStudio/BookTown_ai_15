// app/lib/hooks/useEbookReaderAccess.ts

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { getFunctions } from "firebase/functions";
import {
  getOfflineRecord,
  isOfflineValid,
} from "../offline/offlineManager";

/**
 * ReaderAccessResult
 *
 * Resolved reader URL + origin
 */
interface ReaderAccessResult {
  url: string;
  source: "offline" | "online";
}

export function useEbookReaderAccess(bookId?: string) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [source, setSource] = useState<
    "offline" | "online" | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function resolveAccess() {
      if (!bookId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        /**
         * ------------------------------------
         * 1. Attempt OFFLINE resolution
         * ------------------------------------
         */
        const offline = getOfflineRecord(bookId);

        if (offline && isOfflineValid(offline)) {
          const cache = await caches.open(
            "booktown_offline_ebooks"
          );
          const cached = await cache.match(bookId);

          if (cached) {
            const blob = await cached.blob();
            const url = URL.createObjectURL(blob);

            if (!isMounted) return;

            setSignedUrl(url);
            setSource("offline");
            setIsLoading(false);
            return;
          }
        }

        /**
         * ------------------------------------
         * 2. ONLINE fallback (authoritative)
         * ------------------------------------
         */
        const fn = httpsCallable(
          getFunctions(),
          "requestEbookReadAccess"
        );

        const res = await fn({ bookId });

        if (!isMounted) return;

        setSignedUrl((res.data as any).signedUrl);
        setSource("online");
      } catch (err: any) {
        if (!isMounted) return;
        setError(
          err?.message ||
            "Unable to load reader content."
        );
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    resolveAccess();

    return () => {
      isMounted = false;
    };
  }, [bookId]);

  return {
    signedUrl,
    source,
    isLoading,
    error,
  };
}
