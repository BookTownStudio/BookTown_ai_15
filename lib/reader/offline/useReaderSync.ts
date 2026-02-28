import { useCallback, useState } from "react";
import { flushReaderOperations } from "./readerSyncClient.ts";
import { ReaderSyncResult } from "./types.ts";

export function useReaderSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<ReaderSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flush = useCallback(async () => {
    setIsSyncing(true);
    setError(null);
    try {
      const result = await flushReaderOperations();
      setLastResult(result);
      return result;
    } catch (err: any) {
      const message = String(err?.message || err);
      setError(message);
      throw err;
    } finally {
      setIsSyncing(false);
    }
  }, []);

  return {
    isSyncing,
    lastResult,
    error,
    flush,
  };
}
