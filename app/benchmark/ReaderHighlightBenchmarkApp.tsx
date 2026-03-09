import React, { useCallback, useMemo, useState } from 'react';
import QuoteBubble from '../../components/reader/QuoteBubble.tsx';
import ReaderSurface from '../../components/reader/runtime/ReaderSurface.tsx';
import { HighlightIcon } from '../../components/icons/HighlightIcon.tsx';
import { resolveReaderEngine } from '../../lib/reader/runtime/engineSelection.ts';
import type {
  ReaderHighlightOverlay,
  ReaderTextSelection,
} from '../../lib/reader/runtime/contracts.ts';

declare global {
  interface Window {
    __readerHighlightHarness?: {
      highlights: Array<{
        highlightId: string;
        cfi: string | null;
      }>;
      reopenCount: number;
      selectedCfi: string | null;
    };
  }
}

const FIXTURE_URL = '/fixtures/reader-benchmark.pdf';

function buildHighlightId(anchor: string, page: number): string {
  let hash = 0;
  for (let i = 0; i < anchor.length; i += 1) {
    hash = (hash * 31 + anchor.charCodeAt(i)) | 0;
  }
  return `hl_${page}_${Math.abs(hash).toString(36)}`;
}

const ReaderHighlightBenchmarkApp: React.FC = () => {
  const [pendingSelection, setPendingSelection] = useState<ReaderTextSelection | null>(null);
  const [highlights, setHighlights] = useState<ReaderHighlightOverlay[]>([]);
  const [readerInstanceKey, setReaderInstanceKey] = useState(0);
  const [reopenCount, setReopenCount] = useState(0);

  const selection = useMemo(
    () =>
      resolveReaderEngine({
        platform: 'web',
        format: 'pdf',
      }),
    []
  );

  const selectedHighlight = useMemo(
    () =>
      pendingSelection
        ? highlights.find((highlight) => highlight.cfi === pendingSelection.cfi) || null
        : null,
    [highlights, pendingSelection]
  );

  const publishHarnessState = useCallback(
    (nextSelection: ReaderTextSelection | null, nextHighlights: ReaderHighlightOverlay[], nextReopenCount: number) => {
      window.__readerHighlightHarness = {
        highlights: nextHighlights.map((highlight) => ({
          highlightId: highlight.highlightId,
          cfi: highlight.cfi,
        })),
        reopenCount: nextReopenCount,
        selectedCfi: nextSelection?.cfi || null,
      };
    },
    []
  );

  const handleTextSelection = useCallback(
    (selectionState: ReaderTextSelection | null) => {
      setPendingSelection(selectionState);
      publishHarnessState(selectionState, highlights, reopenCount);
    },
    [highlights, publishHarnessState, reopenCount]
  );

  const handleHighlightToggle = useCallback(() => {
    if (!pendingSelection) return;

    setHighlights((current) => {
      const existing = current.find((highlight) => highlight.cfi === pendingSelection.cfi);
      const next = existing
        ? current.filter((highlight) => highlight.cfi !== pendingSelection.cfi)
        : [
            ...current,
            {
              highlightId: buildHighlightId(pendingSelection.cfi, pendingSelection.page),
              cfi: pendingSelection.cfi,
              color: 'yellow',
              page: pendingSelection.page,
              quote: pendingSelection.quote,
            },
          ];

      publishHarnessState(null, next, reopenCount);
      return next;
    });

    setPendingSelection(null);
  }, [pendingSelection, publishHarnessState, reopenCount]);

  const handleReopen = useCallback(() => {
    setPendingSelection(null);
    setReaderInstanceKey((current) => current + 1);
    setReopenCount((current) => {
      const next = current + 1;
      publishHarnessState(null, highlights, next);
      return next;
    });
  }, [highlights, publishHarnessState]);

  React.useEffect(() => {
    publishHarnessState(pendingSelection, highlights, reopenCount);
  }, [highlights, pendingSelection, publishHarnessState, reopenCount]);

  return (
    <div className="h-screen w-full bg-black text-white overflow-hidden">
      <div className="absolute top-3 left-3 z-20 text-xs font-mono bg-black/70 rounded px-2 py-1">
        reader-highlight-benchmark
      </div>

      <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
        <button
          type="button"
          data-testid="reader-highlight-reopen"
          onClick={handleReopen}
          className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm"
        >
          Reopen Reader
        </button>
      </div>

      <div
        data-testid="reader-highlight-shell"
        className="h-full w-full"
        onClick={() => {
          if (!pendingSelection) return;
          setPendingSelection(null);
          publishHarnessState(null, highlights, reopenCount);
        }}
      >
        <ReaderSurface
          key={readerInstanceKey}
          selection={selection}
          signedUrl={FIXTURE_URL}
          initialPage={1}
          theme="dark"
          readingMode="page"
          fontSize="md"
          fontStyle="default"
          highlights={highlights}
          onPageChange={() => {
            setPendingSelection(null);
            publishHarnessState(null, highlights, reopenCount);
          }}
          onPdfLoadError={(message) => {
            throw new Error(message);
          }}
          onEpubLoadError={(message) => {
            throw new Error(message);
          }}
          onTextSelection={handleTextSelection}
          renderUnsupported={() => (
            <div className="h-full w-full flex items-center justify-center text-red-300">
              Unsupported benchmark format
            </div>
          )}
        />
      </div>

      {pendingSelection && (
        <QuoteBubble
          rect={pendingSelection.rect}
          onSave={handleHighlightToggle}
          onDismiss={() => {
            setPendingSelection(null);
            publishHarnessState(null, highlights, reopenCount);
          }}
          saveLabel={selectedHighlight ? 'Remove Highlight' : 'Highlight'}
          icon={<HighlightIcon className="h-4 w-4 text-amber-400" />}
        />
      )}

      <div
        data-testid="reader-highlight-state"
        className="absolute bottom-3 left-3 z-20 text-xs font-mono bg-black/70 rounded px-2 py-1"
      >
        {JSON.stringify(
          {
            highlightCount: highlights.length,
            reopenCount,
            selectedCfi: pendingSelection?.cfi || null,
          },
          null,
          0
        )}
      </div>
    </div>
  );
};

export default ReaderHighlightBenchmarkApp;
