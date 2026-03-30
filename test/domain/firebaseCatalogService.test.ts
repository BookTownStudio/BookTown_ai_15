import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getDocMock,
  getDownloadUrlMock,
  storageRefMock,
  getFirebaseStorageMock,
  httpsCallableMock,
  callableInvokeMock,
} = vi.hoisted(() => ({
  getDocMock: vi.fn(),
  getDownloadUrlMock: vi.fn(),
  storageRefMock: vi.fn(),
  getFirebaseStorageMock: vi.fn(() => ({})),
  httpsCallableMock: vi.fn(),
  callableInvokeMock: vi.fn(),
}));

vi.mock("../../lib/infrastructure/firebase/firestoreAdapter.ts", () => ({
  firestoreAdapter: {
    getDoc: getDocMock,
  },
}));

vi.mock("../../lib/firebase.ts", () => ({
  getFirebaseDb: vi.fn(),
  getFirebaseFunctions: vi.fn(),
  getFirebaseStorage: getFirebaseStorageMock,
}));

vi.mock("firebase/storage", () => ({
  getDownloadURL: getDownloadUrlMock,
  ref: storageRefMock,
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: httpsCallableMock,
}));

const { firebaseCatalogService } = await import("../../lib/services/firebaseCatalogService.ts");

describe("firebaseCatalogService.getBook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    httpsCallableMock.mockReturnValue(callableInvokeMock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the primary Firestore book immediately when cover URL signing stalls", async () => {
    vi.useFakeTimers();
    getDocMock.mockResolvedValue({
      id: "book_1",
      titleEn: "Primary Book",
      authorEn: "Author One",
      authorId: "author_1",
      cover: {
        original: "books/book_1/covers/cover.jpg",
      },
      fallbackCover: {
        title: "Primary Book",
        author: "Author One",
        theme: "ink",
      },
    });
    getDownloadUrlMock.mockImplementation(
      () => new Promise<string>(() => {})
    );
    storageRefMock.mockReturnValue({});

    const pending = firebaseCatalogService.getBook("book_1");

    await vi.advanceTimersByTimeAsync(450);
    const book = await pending;

    expect(getDocMock).toHaveBeenCalledWith("books/book_1");
    expect(book).toMatchObject({
      id: "book_1",
      titleEn: "Primary Book",
      authorEn: "Author One",
      authorId: "author_1",
      coverUrl: "",
    });
  });

  it("surfaces permission denial as a terminal access error", async () => {
    getDocMock.mockRejectedValue({ code: "permission-denied" });
    callableInvokeMock.mockResolvedValue({
      data: {
        success: false,
        error: {
          code: "permission-denied",
          message: "Book access denied.",
        },
      },
    });

    await expect(firebaseCatalogService.getBook("book_1")).rejects.toThrow(
      "BOOK_ACCESS_DENIED"
    );
  });

  it("falls back to the backend-accessible book reader when client firestore denies access", async () => {
    getDocMock.mockRejectedValue({ code: "permission-denied" });
    callableInvokeMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: "book_1",
          authorId: "author_1",
          titleEn: "Primary Book",
          titleAr: "Primary Book",
          authorEn: "Author One",
          authorAr: "Author One",
          coverUrl: "https://cdn.example.com/book_1.jpg",
          descriptionEn: "Desc",
          descriptionAr: "",
          genresEn: [],
          genresAr: [],
          rating: 0,
          ratingsCount: 0,
          isEbookAvailable: false,
          rawBook: {
            id: "book_1",
          },
        },
      },
    });

    const book = await firebaseCatalogService.getBook("book_1");

    expect(httpsCallableMock).toHaveBeenCalled();
    expect(callableInvokeMock).toHaveBeenCalledWith({ bookId: "book_1" });
    expect(book).toMatchObject({
      id: "book_1",
      titleEn: "Primary Book",
      authorEn: "Author One",
      coverUrl: "https://cdn.example.com/book_1.jpg",
    });
  });
});
