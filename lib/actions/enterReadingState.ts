import { getFunctions, httpsCallable } from 'firebase/functions';

export type ReadingStateIntent =
  | 'not_started'
  | 'reading'
  | 'paused'
  | 'completed'
  | 'abandoned'
  | 'rereading';

export type ReadingContinuitySourceType =
  | 'physical'
  | 'external_ebook'
  | 'kindle'
  | 'apple_books'
  | 'pdf_external'
  | 'unknown';

export type ReadingContinuitySource = 'manual' | 'runtime';

interface EnterReadingStateContext {
  origin?: 'search' | 'move' | 'details' | 'recommendation' | 'reader';
  initiatedBy?: 'user' | 'runtime';
}

interface EnterReadingStateArgs {
  bookId: string;
  targetState?: ReadingStateIntent;
  sourceType?: ReadingContinuitySourceType;
  continuitySource?: ReadingContinuitySource;
  progress?: number;
  context?: EnterReadingStateContext;
}

/**
 * Canonical frontend orchestration boundary for reading-state transitions.
 * The UI expresses intent only; reading_progress validation and persistence
 * remain backend-authoritative.
 */
export async function enterReadingState(
  args: EnterReadingStateArgs
): Promise<void> {
  const bookId = args.bookId.trim();
  if (!bookId) throw new Error('BOOK_ID_REQUIRED');

  const targetState = args.targetState ?? 'reading';
  if (targetState === 'not_started') {
    throw new Error('NOT_STARTED_IS_NOT_A_MUTATION_TARGET');
  }

  if (args.continuitySource && args.continuitySource !== 'manual') {
    throw new Error('RUNTIME_CONTINUITY_REQUIRES_READER_RUNTIME');
  }

  const fn = httpsCallable(getFunctions(), 'recordManualReadingProgress');
  const res = await fn({
    bookId,
    sourceType: args.sourceType ?? 'unknown',
    progress: args.progress ?? 0,
    status_state: targetState,
  });

  const envelope = res.data as any;
  if (envelope?.success === false) {
    const code =
      typeof envelope?.error?.code === 'string' ? envelope.error.code : 'UNKNOWN';
    const message =
      typeof envelope?.error?.message === 'string'
        ? envelope.error.message
        : 'Reading state transition was rejected.';
    throw new Error(`[${code}] ${message}`);
  }
}
