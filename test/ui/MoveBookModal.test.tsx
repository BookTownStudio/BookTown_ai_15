import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MoveBookModal from '../../components/modals/MoveBookModal.tsx';
import type { Book } from '../../types/entities.ts';

const {
  moveBookMock,
  enterReadingStateMock,
  removeBookFromShelfMock,
  invalidateQueriesMock,
  showToastMock,
} = vi.hoisted(() => ({
  moveBookMock: vi.fn(),
  enterReadingStateMock: vi.fn(),
  removeBookFromShelfMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock('../../components/ui/Modal.tsx', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));

vi.mock('../../components/ui/BilingualText.tsx', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../components/ui/LoadingSpinner.tsx', () => ({
  default: () => <div>loading</div>,
}));

vi.mock('../../store/i18n.tsx', () => ({
  useI18n: () => ({ lang: 'en', isRTL: false }),
}));

vi.mock('../../store/toast.tsx', () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock('../../lib/auth.tsx', () => ({
  useAuth: () => ({ effectiveUid: 'user_1' }),
}));

vi.mock('../../lib/react-query.ts', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock('../../lib/hooks/useUserShelves.ts', () => ({
  useUserShelves: () => ({
    isLoading: false,
    data: [
      {
        id: 'want-to-read',
        titleEn: 'Want to Read',
        titleAr: 'أريد قراءته',
        isSystem: true,
      },
      {
        id: 'finished',
        titleEn: 'Finished',
        titleAr: 'انتهيت منه',
        isSystem: true,
      },
    ],
  }),
}));

vi.mock('../../lib/hooks/useMoveBookBetweenShelves.ts', () => ({
  useMoveBookBetweenShelves: () => ({
    mutate: moveBookMock,
    isPending: false,
  }),
}));

vi.mock('../../lib/actions/enterReadingState.ts', () => ({
  enterReadingState: enterReadingStateMock,
}));

vi.mock('../../lib/actions/shelfActions.ts', () => ({
  removeBookFromShelf: removeBookFromShelfMock,
}));

const book: Book = {
  id: 'book_1',
  authorId: 'author_1',
  titleEn: 'Book One',
  titleAr: '',
  authorEn: 'Author One',
  authorAr: '',
  coverUrl: '',
  descriptionEn: '',
  descriptionAr: '',
  ontology: {
    schemaVersion: 1,
    form: 'unknown',
    subForm: null,
    source: 'seed',
    confidence: 'unknown',
    updatedAt: null,
  },
  genresEn: [],
  genresAr: [],
  rating: 0,
  ratingsCount: 0,
  isEbookAvailable: false,
};

describe('MoveBookModal', () => {
  beforeEach(() => {
    moveBookMock.mockReset();
    enterReadingStateMock.mockReset();
    enterReadingStateMock.mockResolvedValue(undefined);
    removeBookFromShelfMock.mockReset();
    removeBookFromShelfMock.mockResolvedValue(undefined);
    invalidateQueriesMock.mockReset();
    invalidateQueriesMock.mockResolvedValue(undefined);
    showToastMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('moves to Currently Reading through the canonical continuity initializer without target shelf writes', async () => {
    const onClose = vi.fn();
    render(
      <MoveBookModal
        isOpen
        onClose={onClose}
        bookId="book_1"
        book={book}
        fromShelfId="want-to-read"
      />
    );

    fireEvent.click(screen.getByText('Currently Reading'));

    await waitFor(() => {
      expect(enterReadingStateMock).toHaveBeenCalledWith({
        bookId: 'book_1',
        progress: 0,
        targetState: 'reading',
      });
    });

    expect(moveBookMock).not.toHaveBeenCalled();
    expect(removeBookFromShelfMock).toHaveBeenCalledWith({
      uid: 'user_1',
      shelfId: 'want-to-read',
      bookId: 'book_1',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps normal shelf moves on the shelf move mutation path', () => {
    render(
      <MoveBookModal
        isOpen
        onClose={vi.fn()}
        bookId="book_1"
        book={book}
        fromShelfId="want-to-read"
      />
    );

    fireEvent.click(screen.getByText('Finished'));

    expect(moveBookMock).toHaveBeenCalledWith(
      {
        fromShelfId: 'want-to-read',
        toShelfId: 'finished',
        book,
      },
      expect.any(Object)
    );
    expect(enterReadingStateMock).not.toHaveBeenCalled();
    expect(removeBookFromShelfMock).not.toHaveBeenCalled();
  });
});
