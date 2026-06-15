import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getDocMock,
  getDocsMock,
  collectionMock,
  queryMock,
  whereMock,
  orderByMock,
  limitMock,
  startAtMock,
  endAtMock,
  getDownloadUrlMock,
  storageRefMock,
  getFirebaseStorageMock,
  getFirebaseDbMock,
  httpsCallableMock,
  callableInvokeMock,
} = vi.hoisted(() => ({
  getDocMock: vi.fn(),
  getDocsMock: vi.fn(),
  collectionMock: vi.fn((db, path) => ({ db, path })),
  queryMock: vi.fn((...parts) => ({ parts })),
  whereMock: vi.fn((field, op, value) => ({ kind: "where", field, op, value })),
  orderByMock: vi.fn((field, direction) => ({ kind: "orderBy", field, direction })),
  limitMock: vi.fn((value) => ({ kind: "limit", value })),
  startAtMock: vi.fn((value) => ({ kind: "startAt", value })),
  endAtMock: vi.fn((value) => ({ kind: "endAt", value })),
  getDownloadUrlMock: vi.fn(),
  storageRefMock: vi.fn(),
  getFirebaseStorageMock: vi.fn(() => ({})),
  getFirebaseDbMock: vi.fn(() => ({ app: "db" })),
  httpsCallableMock: vi.fn(),
  callableInvokeMock: vi.fn(),
}));

vi.mock("../../lib/infrastructure/firebase/firestoreAdapter.ts", () => ({
  firestoreAdapter: {
    getDoc: getDocMock,
  },
}));

vi.mock("../../lib/firebase.ts", () => ({
  getFirebaseDb: getFirebaseDbMock,
  getFirebaseFunctions: vi.fn(),
  getFirebaseStorage: getFirebaseStorageMock,
}));

vi.mock("firebase/firestore", () => ({
  collection: collectionMock,
  deleteDoc: vi.fn(),
  doc: vi.fn((db, path, id) => ({ db, path, id })),
  documentId: vi.fn(() => "__name__"),
  endAt: endAtMock,
  getDoc: vi.fn(),
  getDocs: getDocsMock,
  increment: vi.fn((value) => ({ __increment: value })),
  limit: limitMock,
  orderBy: orderByMock,
  query: queryMock,
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
  startAt: startAtMock,
  where: whereMock,
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
      semanticGraphEligible: true,
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

describe("firebaseCatalogService.searchAuthors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    httpsCallableMock.mockReturnValue(callableInvokeMock);
  });

  function authorDoc(id: string) {
    return { id, data: () => ({ nameEn: id }) };
  }

  function resolverResponse(params: {
    requestedAuthorId: string;
    resolvedAuthorId: string;
    state: "canonical" | "merged" | "superseded";
    nameEn?: string;
  }) {
    return {
      success: true,
      data: {
        requestedAuthorId: params.requestedAuthorId,
        resolvedAuthorId: params.resolvedAuthorId,
        state: params.state,
        author: {
          id: params.resolvedAuthorId,
          nameEn: params.nameEn ?? "Franz Kafka",
          nameAr: params.nameEn ?? "Franz Kafka",
          avatarUrl: "",
          bioEn: "",
          bioAr: "",
          lifespan: "",
          countryEn: "",
          countryAr: "",
          languageEn: "",
          languageAr: "",
          lifecycleState: "canonical",
        },
        redirect: {
          required: params.requestedAuthorId !== params.resolvedAuthorId,
          targetAuthorId:
            params.requestedAuthorId !== params.resolvedAuthorId
              ? params.resolvedAuthorId
              : null,
          reason:
            params.state === "merged"
              ? "merged_author_redirect"
              : params.state === "superseded"
                ? "superseded_author_redirect"
                : "active_author",
        },
      },
    };
  }

  it("displays the survivor when raw search returns only a losing merged author", async () => {
    getDocsMock.mockResolvedValueOnce({ docs: [authorDoc("author_old")] });
    callableInvokeMock.mockResolvedValueOnce({
      data: resolverResponse({
        requestedAuthorId: "author_old",
        resolvedAuthorId: "author_survivor",
        state: "merged",
        nameEn: "Franz Kafka",
      }),
    });

    const authors = await firebaseCatalogService.searchAuthors("kafka");

    expect(authors).toHaveLength(1);
    expect(authors[0]).toMatchObject({
      id: "author_survivor",
      nameEn: "Franz Kafka",
    });
  });

  it("dedupes raw loser and raw survivor results into one survivor author", async () => {
    getDocsMock.mockResolvedValueOnce({
      docs: [authorDoc("author_old"), authorDoc("author_survivor")],
    });
    callableInvokeMock
      .mockResolvedValueOnce({
        data: resolverResponse({
          requestedAuthorId: "author_old",
          resolvedAuthorId: "author_survivor",
          state: "merged",
          nameEn: "Franz Kafka",
        }),
      })
      .mockResolvedValueOnce({
        data: resolverResponse({
          requestedAuthorId: "author_survivor",
          resolvedAuthorId: "author_survivor",
          state: "canonical",
          nameEn: "Franz Kafka",
        }),
      });

    const authors = await firebaseCatalogService.searchAuthors("kafka");

    expect(authors).toHaveLength(1);
    expect(authors[0]?.id).toBe("author_survivor");
    expect(callableInvokeMock).toHaveBeenCalledTimes(2);
  });
});
