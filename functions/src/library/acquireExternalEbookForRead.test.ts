import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

type DocData = Record<string, unknown>;

const store = new Map<string, DocData>();
const uploadedFiles = new Map<string, { buffer: Buffer; contentType: string }>();
let autoIds = 0;
let timestampCounter = 0;
let failStorageSave = false;

type SpecialValue =
  | { __op: "serverTimestamp" }
  | { __op: "arrayUnion"; values: unknown[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asSpecial(value: unknown): SpecialValue | null {
  if (!isRecord(value)) return null;
  if (value.__op === "serverTimestamp" || value.__op === "arrayUnion") {
    return value as SpecialValue;
  }
  return null;
}

function materialize(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...existing };

  for (const [key, raw] of Object.entries(incoming)) {
    const special = asSpecial(raw);
    if (special?.__op === "serverTimestamp") {
      timestampCounter += 1;
      next[key] = `ts-${timestampCounter}`;
      continue;
    }

    if (special?.__op === "arrayUnion") {
      const current = Array.isArray(existing[key]) ? (existing[key] as unknown[]) : [];
      next[key] = Array.from(new Set([...current, ...special.values]));
      continue;
    }

    if (isRecord(raw)) {
      const existingChild = isRecord(existing[key]) ? (existing[key] as Record<string, unknown>) : {};
      next[key] = materialize(raw, existingChild);
      continue;
    }

    next[key] = raw;
  }

  return next;
}

function setDoc(path: string, data: Record<string, unknown>, merge: boolean): void {
  const existing = store.get(path) || {};
  const resolved = materialize(data, merge ? existing : {});
  if (merge) {
    store.set(path, materialize(resolved, existing));
    return;
  }
  store.set(path, resolved);
}

function getDoc(path: string): Record<string, unknown> | null {
  const value = store.get(path);
  return value ? clone(value) : null;
}

class MockDocSnapshot {
  constructor(private readonly path: string) {}
  get exists(): boolean {
    return store.has(this.path);
  }
  data(): Record<string, unknown> | undefined {
    const value = store.get(this.path);
    return value ? clone(value) : undefined;
  }
}

class MockDocRef {
  constructor(
    public readonly collectionName: string,
    public readonly id: string
  ) {}
  get path(): string {
    return `${this.collectionName}/${this.id}`;
  }
  async get(): Promise<MockDocSnapshot> {
    return new MockDocSnapshot(this.path);
  }
  async set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void> {
    setDoc(this.path, data, Boolean(options?.merge));
  }
}

class MockCollectionRef {
  constructor(private readonly name: string) {}
  doc(id?: string): MockDocRef {
    autoIds += 1;
    return new MockDocRef(this.name, id || `${this.name}_auto_${autoIds}`);
  }
}

class MockTransaction {
  private hasWritten = false;

  async get(ref: MockDocRef): Promise<MockDocSnapshot> {
    if (this.hasWritten) {
      throw new Error("Firestore transactions require all reads to be executed before all writes.");
    }
    return new MockDocSnapshot(ref.path);
  }
  set(ref: MockDocRef, data: Record<string, unknown>, options?: { merge?: boolean }): void {
    this.hasWritten = true;
    setDoc(ref.path, data, Boolean(options?.merge));
  }
}

const firestoreMock = {
  collection(name: string): MockCollectionRef {
    return new MockCollectionRef(name);
  },
  async runTransaction<T>(handler: (tx: MockTransaction) => Promise<T>): Promise<T> {
    const tx = new MockTransaction();
    return handler(tx);
  },
};

const resolveAttachmentMock = vi.fn(async () => null);
const getOrBuildReaderManifestMock = vi.fn(async () => ({
  bookId: "book_1",
  version: 1,
}));
const hasMinimumCanonicalIdentityMock = vi.fn(() => true);
const ingestBookServerSideMock = vi.fn(async () => ({
  canonicalBookId: "book_1",
  bookId: "book_1",
  primaryEditionId: "googleBooks:ext_1",
  editionId: "googleBooks:ext_1",
  status: "MERGED",
}));
const resolveOpenLibraryReadableCandidateMock = vi.fn(async () => null);
const resolveGutenbergReadableCandidateMock = vi.fn(async () => null);
const resolveHindawiReadableCandidateMock = vi.fn(async () => null);
const resolveGallicaReadableCandidateMock = vi.fn(async () => null);

vi.mock("firebase-functions/logger", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => ({ __op: "serverTimestamp" }),
    arrayUnion: (...values: unknown[]) => ({ __op: "arrayUnion", values }),
  },
}));

class MockHttpsError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "HttpsError";
  }
}

vi.mock("firebase-functions/v2/https", () => ({
  HttpsError: MockHttpsError,
  onCall: (_opts: unknown, handler: unknown) => ({
    run: handler as (request: unknown) => Promise<unknown>,
  }),
}));

vi.mock("../firebaseAdmin", () => ({
  admin: {
    firestore: () => firestoreMock,
    storage: () => ({
      bucket: () => ({
        name: "booktown-test.appspot.com",
        file: (storagePath: string) => ({
          save: async (buffer: Buffer, options: { contentType?: string }) => {
            if (failStorageSave) {
              throw new Error("STORAGE_SAVE_FAILED");
            }
            uploadedFiles.set(storagePath, {
              buffer,
              contentType: options?.contentType || "",
            });
          },
          delete: async () => {
            uploadedFiles.delete(storagePath);
          },
        }),
      }),
    }),
  },
}));

vi.mock("../attachments/resolveBookToEbookAttachment", () => ({
  resolveBookToEbookAttachment: resolveAttachmentMock,
}));

vi.mock("../reader/readerManifestService", () => ({
  getOrBuildReaderManifest: getOrBuildReaderManifestMock,
}));

vi.mock("./ingestBook", () => ({
  hasMinimumCanonicalIdentity: hasMinimumCanonicalIdentityMock,
  ingestBookServerSide: ingestBookServerSideMock,
}));

vi.mock("./providers/openLibrary", () => ({
  fetchOpenLibraryCanonicalMetadata: vi.fn(async () => ({
    id: "OL66554W",
    externalId: "OL66554W",
    source: "openLibrary",
    title: "Pride and Prejudice",
    authors: ["Jane Austen"],
    language: "en",
  })),
  resolveOpenLibraryReadableCandidate: resolveOpenLibraryReadableCandidateMock,
}));

vi.mock("./providers/gutenberg", () => ({
  resolveGutenbergReadableCandidate: resolveGutenbergReadableCandidateMock,
}));

vi.mock("./providers/hindawi", () => ({
  resolveHindawiReadableCandidate: resolveHindawiReadableCandidateMock,
}));

vi.mock("./providers/gallica", () => ({
  resolveGallicaReadableCandidate: resolveGallicaReadableCandidateMock,
}));

async function buildMinimalEpub(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.folder("META-INF")?.file(
    "container.xml",
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
  );
  zip.folder("OEBPS")?.file(
    "content.opf",
    '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Test</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>'
  );
  zip.folder("OEBPS")?.file(
    "chapter.xhtml",
    '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hello BookTown.</p></body></html>'
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

describe("acquireExternalEbookForRead", () => {
  beforeEach(() => {
    store.clear();
    uploadedFiles.clear();
    autoIds = 0;
    timestampCounter = 0;
    failStorageSave = false;
    vi.clearAllMocks();
    resolveAttachmentMock.mockResolvedValue(null);
    getOrBuildReaderManifestMock.mockResolvedValue({ bookId: "book_1", version: 1 });
    hasMinimumCanonicalIdentityMock.mockReturnValue(true);
    ingestBookServerSideMock.mockResolvedValue({
      canonicalBookId: "book_1",
      bookId: "book_1",
      primaryEditionId: "googleBooks:ext_1",
      editionId: "googleBooks:ext_1",
      status: "MERGED",
    });
    resolveOpenLibraryReadableCandidateMock.mockResolvedValue(null);
    resolveGutenbergReadableCandidateMock.mockResolvedValue(null);
    resolveHindawiReadableCandidateMock.mockResolvedValue(null);
    resolveGallicaReadableCandidateMock.mockResolvedValue(null);
    setDoc(
      "books/book_1",
      {
        id: "book_1",
        titleEn: "Pride and Prejudice",
        authorEn: "Jane Austen",
        language: "en",
        rightsMode: "public_free",
        visibility: "public",
        primaryEditionId: "googleBooks:ext_1",
        downloadable: false,
        hasEbook: false,
        isEbookAvailable: false,
        providerExternalIds: ["googleBooks:ext_1"],
        externalReadableSources: [
          {
            provider: "gutenberg",
            providerExternalId: "1342",
            trust: "trusted",
          },
        ],
      },
      false
    );
    setDoc(
      "editions/googleBooks:ext_1",
      {
        id: "googleBooks:ext_1",
        editionId: "googleBooks:ext_1",
        bookId: "book_1",
        workId: "book_1",
        providerExternalIds: ["googleBooks:ext_1"],
      },
      false
    );
  });

  it("upgrades external discovery to a readable attachment only after successful storage", async () => {
    const epubBuffer = await buildMinimalEpub();
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes("gutendex.com") || url.includes("openlibrary.org") || url.includes("googleapis.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          text: async () => "",
        } as any;
      }
      return {
        ok: true,
        status: 200,
        body: {
          getReader: () => {
            let done = false;
            return {
              read: async () => {
                if (done) return { done: true, value: undefined };
                done = true;
                return { done: false, value: Uint8Array.from(epubBuffer) };
              },
            };
          },
        },
        headers: {
          get: (name: string) =>
            name === "content-length"
              ? String(epubBuffer.length)
              : name === "content-type"
                ? "application/epub+zip"
                : null,
        },
      } as any;
    }) as any;

    resolveGutenbergReadableCandidateMock.mockResolvedValue({
      provider: "gutenberg",
      providerExternalId: "1342",
      title: "Pride and Prejudice",
      language: "en",
      trust: {
        availabilityTrust: true,
        acquisitionTrust: true,
      },
      candidates: [
        {
          format: "epub",
          url: "https://www.gutenberg.org/cache/epub/1342/pg1342-images.epub",
          mimeType: "application/epub+zip",
        },
      ],
    } as any);

    const { acquireExternalEbookForReadHandler } = await import("./acquireExternalEbookForRead");
    const result = await acquireExternalEbookForReadHandler({
      auth: { uid: "reader_1" },
      data: {
        source: "openLibrary",
        providerExternalId: "OL66554W",
      },
    });

    expect(result.status).toBe("acquired");
    expect(result.provider).toBe("gutenberg");

    const book = getDoc("books/book_1");
    const edition = getDoc("editions/googleBooks:ext_1");
    const attachments = Array.from(store.entries()).filter(([path]) =>
      path.startsWith("attachments/")
    );
    const manifestations = Array.from(store.entries()).filter(([path]) =>
      path.startsWith("manifestations/")
    );

    expect(book?.ebookAttachmentId).toBeTruthy();
    expect(book?.downloadable).toBe(true);
    expect(book?.isEbookAvailable).toBe(true);
    expect(book?.providerExternalIds).toContain("gutenberg:1342");
    expect(book?.externalReadableSources).toEqual([
      {
        provider: "gutenberg",
        providerExternalId: "1342",
        trust: "trusted",
      },
    ]);
    expect(edition?.ebookAttachmentId).toBe(book?.ebookAttachmentId);
    expect(edition?.downloadable).toBe(true);
    expect(attachments).toHaveLength(1);
    expect(manifestations).toHaveLength(1);
    expect(result.manifestationId).toBeTruthy();
    expect(book?.readerAuthority).toMatchObject({
      hasReadableAttachment: true,
      manifestationId: result.manifestationId,
      source: "acquisition",
    });
    expect(book?.manifestationAvailability).toMatchObject({
      hasReadableManifestation: true,
      canReadInApp: true,
      manifestationId: result.manifestationId,
      editionId: "googleBooks:ext_1",
      source: "acquisition",
      accessMode: "in_app",
    });
    expect(manifestations[0]?.[1]).toMatchObject({
      bookId: "book_1",
      editionId: "googleBooks:ext_1",
      manifestationId: result.manifestationId,
      source: "acquisition",
      accessMode: "in_app",
      readability: {
        canReadInApp: true,
        canRender: true,
        canDownload: true,
        acquisitionEligible: false,
      },
    });
    expect(uploadedFiles.size).toBe(1);
    expect(getDoc("ebook_acquisitions/book_1__gutenberg")).toMatchObject({
      state: "acquired",
      provider: "gutenberg",
      providerExternalId: "1342",
      trust: {
        availabilityTrust: true,
        acquisitionTrust: true,
      },
      format: "epub",
    });
    expect(getOrBuildReaderManifestMock).toHaveBeenCalledWith({
      uid: "reader_1",
      bookId: "book_1",
    });
  });

  it("does not mark the book readable when storage finalization fails", async () => {
    const epubBuffer = await buildMinimalEpub();
    failStorageSave = true;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          let done = false;
          return {
            read: async () => {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: Uint8Array.from(epubBuffer) };
            },
          };
        },
      },
      headers: {
        get: (name: string) =>
          name === "content-length"
            ? String(epubBuffer.length)
            : name === "content-type"
              ? "application/epub+zip"
              : null,
      },
    })) as any;

    resolveGutenbergReadableCandidateMock.mockResolvedValue({
      provider: "gutenberg",
      providerExternalId: "1342",
      title: "Pride and Prejudice",
      language: "en",
      trust: {
        availabilityTrust: true,
        acquisitionTrust: true,
      },
      candidates: [
        {
          format: "epub",
          url: "https://www.gutenberg.org/cache/epub/1342/pg1342-images.epub",
          mimeType: "application/epub+zip",
        },
      ],
    } as any);

    const { acquireExternalEbookForReadHandler } = await import("./acquireExternalEbookForRead");

    await expect(
      acquireExternalEbookForReadHandler({
        auth: { uid: "reader_1" },
        data: {
          source: "openLibrary",
          providerExternalId: "OL66554W",
        },
      })
    ).rejects.toThrow("STORAGE_SAVE_FAILED");

    const book = getDoc("books/book_1");
    const attachments = Array.from(store.entries()).filter(([path]) =>
      path.startsWith("attachments/")
    );

    expect(book?.ebookAttachmentId).toBeUndefined();
    expect(book?.downloadable).toBe(false);
    expect(book?.isEbookAvailable).toBe(false);
    expect(attachments).toHaveLength(0);
    expect(getDoc("ebook_acquisitions/book_1__gutenberg")).toMatchObject({
      state: "failed",
      provider: "gutenberg",
      providerExternalId: "1342",
    });
    expect(getOrBuildReaderManifestMock).not.toHaveBeenCalled();
  });

  it("returns already_available without re-acquiring when a readable asset already exists", async () => {
    resolveAttachmentMock.mockResolvedValue({
      id: "attachment_1",
      visibility: "public",
      storagePath: "ebooks/book_1/canonical.epub",
    } as any);

    const { acquireExternalEbookForReadHandler } = await import("./acquireExternalEbookForRead");
    const result = await acquireExternalEbookForReadHandler({
      auth: { uid: "reader_1" },
      data: {
        bookId: "book_1",
      },
    });

    expect(result.status).toBe("already_available");
    expect(result.provider).toBe("booktown");
    expect(ingestBookServerSideMock).not.toHaveBeenCalled();
    expect(uploadedFiles.size).toBe(0);
  });

  it("does not redirect a bookId request across a shared identity when the mapped book has a different author", async () => {
    setDoc(
      "books/book_1",
      {
        id: "book_1",
        titleEn: "Pride and Prejudice",
        authorEn: "Jane Austen",
        author: "Jane Austen",
        authorNamesNormalized: ["jane austen"],
        language: "en",
        rightsMode: "public_free",
        visibility: "public",
        primaryEditionId: "googleBooks:ext_1",
        downloadable: false,
        hasEbook: false,
        isEbookAvailable: false,
        providerExternalIds: ["googleBooks:ext_1"],
      },
      false
    );
    setDoc(
      "books/book_2",
      {
        id: "book_2",
        titleEn: "Pride and Prejudice",
        authorEn: "Charlotte Bronte",
        author: "Charlotte Bronte",
        authorNamesNormalized: ["charlotte bronte"],
        language: "en",
        rightsMode: "public_free",
        visibility: "public",
        primaryEditionId: "edition_book_2",
        downloadable: false,
        hasEbook: false,
        isEbookAvailable: false,
        readability: {
          status: "trusted_external",
        },
      },
      false
    );
    setDoc(
      "editions/edition_book_2",
      {
        id: "edition_book_2",
        editionId: "edition_book_2",
        bookId: "book_2",
        workId: "book_2",
      },
      false
    );
    setDoc(
      "book_identity/provider:googleBooks:ext_1",
      {
        identityKey: "provider:googleBooks:ext_1",
        bookId: "book_2",
      },
      false
    );

    resolveAttachmentMock.mockResolvedValue({
      id: "attachment_1",
      visibility: "public",
      storagePath: "ebooks/book_1/canonical.epub",
    } as any);

    const { acquireExternalEbookForReadHandler } = await import("./acquireExternalEbookForRead");
    const result = await acquireExternalEbookForReadHandler({
      auth: { uid: "reader_1" },
      data: {
        bookId: "book_1",
      },
    });

    expect(result.status).toBe("already_available");
    expect(resolveAttachmentMock).toHaveBeenCalledWith("book_1");
    expect(resolveAttachmentMock).not.toHaveBeenCalledWith("book_2");
  });

  it("rejects concurrent acquisition for the same canonical book and provider", async () => {
    setDoc(
      "ebook_acquisitions/book_1__gutenberg",
      {
        id: "book_1__gutenberg",
        bookId: "book_1",
        provider: "gutenberg",
        providerExternalId: "1342",
        state: "acquiring",
      },
      false
    );

    resolveGutenbergReadableCandidateMock.mockResolvedValue({
      provider: "gutenberg",
      providerExternalId: "1342",
      title: "Pride and Prejudice",
      language: "en",
      trust: {
        availabilityTrust: true,
        acquisitionTrust: true,
      },
      candidates: [
        {
          format: "epub",
          url: "https://www.gutenberg.org/cache/epub/1342/pg1342-images.epub",
          mimeType: "application/epub+zip",
        },
      ],
    } as any);

    const { acquireExternalEbookForReadHandler } = await import("./acquireExternalEbookForRead");

    await expect(
      acquireExternalEbookForReadHandler({
        auth: { uid: "reader_1" },
        data: {
          bookId: "book_1",
        },
      })
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: "A readable copy is already being prepared.",
    });
  });

  it("rejects shell creation when source metadata lacks minimum canonical identity", async () => {
    hasMinimumCanonicalIdentityMock.mockReturnValue(false);

    const { acquireExternalEbookForReadHandler } = await import("./acquireExternalEbookForRead");

    await expect(
      acquireExternalEbookForReadHandler({
        auth: { uid: "reader_1" },
        data: {
          source: "openLibrary",
          providerExternalId: "OL66554W",
        },
      })
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: "Canonical acquisition requires minimum title plus author or ISBN identity.",
    });

    expect(ingestBookServerSideMock).not.toHaveBeenCalled();
  });

  it("rejects acquisition before provider lookup without validated readability authority", async () => {
    setDoc(
      "books/book_1",
      {
        id: "book_1",
        titleEn: "Pride and Prejudice",
        authorEn: "Jane Austen",
        language: "en",
        rightsMode: "public_free",
        visibility: "public",
        primaryEditionId: "googleBooks:ext_1",
        downloadable: false,
        hasEbook: false,
        isEbookAvailable: false,
        providerExternalIds: ["gutenberg:1342"],
      },
      false
    );

    const { acquireExternalEbookForReadHandler } = await import("./acquireExternalEbookForRead");

    await expect(
      acquireExternalEbookForReadHandler({
        auth: { uid: "reader_1" },
        data: { bookId: "book_1" },
      })
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: "No validated readability authority permits ebook preparation.",
    });

    expect(resolveOpenLibraryReadableCandidateMock).not.toHaveBeenCalled();
    expect(resolveGutenbergReadableCandidateMock).not.toHaveBeenCalled();
  });

  it("persists a discovered trusted external readable source on the canonical book before download", async () => {
    const epubBuffer = await buildMinimalEpub();
    setDoc(
      "books/book_1",
      {
        id: "book_1",
        titleEn: "Pride and Prejudice",
        authorEn: "Jane Austen",
        language: "en",
        rightsMode: "public_free",
        visibility: "public",
        primaryEditionId: "googleBooks:ext_1",
        downloadable: false,
        hasEbook: false,
        isEbookAvailable: false,
        readability: {
          status: "trusted_external",
        },
      },
      false
    );

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          let done = false;
          return {
            read: async () => {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: Uint8Array.from(epubBuffer) };
            },
          };
        },
      },
      headers: {
        get: (name: string) =>
          name === "content-length"
            ? String(epubBuffer.length)
            : name === "content-type"
              ? "application/epub+zip"
              : null,
      },
    })) as any;

    resolveOpenLibraryReadableCandidateMock.mockResolvedValue({
      provider: "openLibrary",
      providerExternalId: "OL66554W",
      title: "Pride and Prejudice",
      language: "en",
      trust: {
        availabilityTrust: true,
        acquisitionTrust: true,
      },
      persistedSource: {
        provider: "openLibrary",
        providerExternalId: "OL66554W",
        lendingEditionId: "OL50444320M",
        lendingIdentifier: "bwb_KS-179-237",
        trust: "trusted",
      },
      candidates: [
        {
          format: "epub",
          url: "https://archive.org/download/pride-and-prejudice-ia/pride-and-prejudice-ia.epub",
          mimeType: "application/epub+zip",
        },
      ],
    } as any);

    const { acquireExternalEbookForReadHandler } = await import("./acquireExternalEbookForRead");
    await acquireExternalEbookForReadHandler({
      auth: { uid: "reader_1" },
      data: { bookId: "book_1" },
    });

    const book = getDoc("books/book_1");
    expect(book?.providerExternalIds).toContain("openLibrary:OL66554W");
    expect(book?.externalReadableSources).toContainEqual({
      provider: "openLibrary",
      providerExternalId: "OL66554W",
      lendingEditionId: "OL50444320M",
      lendingIdentifier: "bwb_KS-179-237",
      trust: "trusted",
    });
  });
});
