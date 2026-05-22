import { beforeEach, describe, expect, it, vi } from 'vitest';

const { httpsCallableMock, callableMock } = vi.hoisted(() => ({
  httpsCallableMock: vi.fn(),
  callableMock: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({ app: 'functions' })),
  httpsCallable: httpsCallableMock,
}));

describe('enterReadingState', () => {
  beforeEach(() => {
    callableMock.mockReset();
    callableMock.mockResolvedValue({ data: { ok: true } });
    httpsCallableMock.mockReset();
    httpsCallableMock.mockReturnValue(callableMock);
  });

  it('defaults manual continuity sourceType to unknown', async () => {
    const { enterReadingState } = await import(
      '../../lib/actions/enterReadingState.ts'
    );

    await enterReadingState({
      bookId: 'book_1',
      progress: 0,
      targetState: 'reading',
    });

    expect(httpsCallableMock).toHaveBeenCalledWith(
      expect.anything(),
      'recordManualReadingProgress'
    );
    expect(callableMock).toHaveBeenCalledWith({
      bookId: 'book_1',
      sourceType: 'unknown',
      progress: 0,
      status_state: 'reading',
    });
  });

  it('supports rereading as a backend-validated target state', async () => {
    const { enterReadingState } = await import(
      '../../lib/actions/enterReadingState.ts'
    );

    await enterReadingState({
      bookId: 'book_1',
      targetState: 'rereading',
      sourceType: 'physical',
    });

    expect(callableMock).toHaveBeenCalledWith({
      bookId: 'book_1',
      sourceType: 'physical',
      progress: 0,
      status_state: 'rereading',
    });
  });

  it('rejects non-mutating not_started intent on the client boundary', async () => {
    const { enterReadingState } = await import(
      '../../lib/actions/enterReadingState.ts'
    );

    await expect(
      enterReadingState({ bookId: 'book_1', targetState: 'not_started' })
    ).rejects.toThrow('NOT_STARTED_IS_NOT_A_MUTATION_TARGET');
    expect(callableMock).not.toHaveBeenCalled();
  });

  it('rejects empty book ids before calling the backend', async () => {
    const { enterReadingState } = await import(
      '../../lib/actions/enterReadingState.ts'
    );

    await expect(
      enterReadingState({ bookId: '   ' })
    ).rejects.toThrow('BOOK_ID_REQUIRED');
    expect(callableMock).not.toHaveBeenCalled();
  });
});
