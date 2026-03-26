import { useQuery } from "@tanstack/react-query";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useAuth } from "../auth.tsx";
import type { ReaderManifestSnapshot } from "../reader/runtime/contracts.ts";

export type ReaderManifest = ReaderManifestSnapshot;

export function useReaderManifest(bookId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["readerManifest", user?.uid, bookId],
    enabled: Boolean(user?.uid && bookId),
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    queryFn: async () => {
      if (!bookId) {
        throw new Error("bookId is required");
      }

      const fn = httpsCallable<{ bookId: string }, ReaderManifest>(
        getFunctions(),
        "getReaderManifest"
      );

      const res = await fn({ bookId });
      const envelope = res.data as any;
      if (envelope?.success === false) {
        const code =
          typeof envelope?.error?.code === "string" ? envelope.error.code : "UNKNOWN";
        const message =
          typeof envelope?.error?.message === "string"
            ? envelope.error.message
            : "Reader manifest request failed.";
        throw new Error(`[${code}] ${message}`);
      }

      return (envelope?.success === true ? envelope.data : envelope) as ReaderManifest;
    },
  });
}
