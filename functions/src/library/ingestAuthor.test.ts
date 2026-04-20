import { beforeEach, describe, expect, it, vi } from "vitest";

type DocData = Record<string, unknown>;

const store = new Map<string, DocData>();
let uuidCounter = 0;
let timestampCounter = 0;

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
  if (value.__op === "serverTimestamp") return value as SpecialValue;
  if (value.__op === "arrayUnion") return value as SpecialValue;
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
      const existingChild = isRecord(existing[key])
        ? (existing[key] as Record<string, unknown>)
        : {};
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
}

class MockCollectionRef {
  constructor(private readonly name: string) {}

  doc(id: string): MockDocRef {
    return new MockDocRef(this.name, id);
  }
}

class MockTransaction {
  async get(ref: MockDocRef): Promise<MockDocSnapshot> {
    return new MockDocSnapshot(ref.path);
  }

  set(ref: MockDocRef, data: Record<string, unknown>, options?: { merge?: boolean }): void {
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

type MockFetchResponse = {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
};

vi.mock("firebase-functions/logger", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("uuid", () => ({
  v4: () => `author-${++uuidCounter}`,
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
  onCall: (optsOrHandler: unknown, maybeHandler?: unknown) => {
    const handler = typeof optsOrHandler === "function" ? optsOrHandler : maybeHandler;
    return {
      run: handler as (request: unknown) => Promise<unknown>,
    };
  },
}));

vi.mock("../firebaseAdmin", () => ({
  admin: {
    firestore: () => firestoreMock,
  },
}));

async function getIngestAuthorCallable() {
  const mod = await import("./ingestAuthor");
  return mod.ingestAuthor as any;
}

async function callIngest(overrides: Record<string, unknown> = {}) {
  const ingestAuthorCallable = await getIngestAuthorCallable();
  const result = await ingestAuthorCallable.run({
    data: {
      providerExternalId: "OL23919A",
      source: "openLibrary",
      rawAuthor: {
        key: "/authors/OL23919A",
        name: "Virginia Woolf",
        bio: "English writer.",
        birth_date: "1882-01-25",
        ...overrides,
      },
    },
  });

  return result as {
    canonicalAuthorId: string;
    authorId: string;
    canonicalKey: string;
    status: string;
    providerExternalId?: string;
  };
}

async function callViafIngest(overrides: Record<string, unknown> = {}) {
  const ingestAuthorCallable = await getIngestAuthorCallable();
  const {
    providerExternalId: rawProviderExternalId,
    ...rawAuthorOverrides
  } = overrides;
  const providerExternalId =
    typeof rawProviderExternalId === "string" && rawProviderExternalId.trim()
      ? rawProviderExternalId.trim()
      : "96994048";
  const result = await ingestAuthorCallable.run({
    data: {
      providerExternalId,
      source: "viaf",
      rawAuthor: {
        viaf: providerExternalId,
        name: "Virginia Woolf",
        nameEn: "Virginia Woolf",
        aliases: ["Adeline Virginia Woolf"],
        birthYear: "1882",
        deathYear: "1941",
        ...rawAuthorOverrides,
      },
    },
  });

  return result as {
    canonicalAuthorId: string;
    authorId: string;
    canonicalKey: string;
    status: string;
    providerExternalId?: string;
  };
}

async function callWikidataIngest(overrides: Record<string, unknown> = {}) {
  const ingestAuthorCallable = await getIngestAuthorCallable();
  const {
    providerExternalId: rawProviderExternalId,
    ...rawAuthorOverrides
  } = overrides;
  const providerExternalId =
    typeof rawProviderExternalId === "string" && rawProviderExternalId.trim()
      ? rawProviderExternalId.trim().toUpperCase()
      : "Q123";
  const result = await ingestAuthorCallable.run({
    data: {
      providerExternalId,
      source: "wikidata",
      rawAuthor: {
        id: providerExternalId,
        qid: providerExternalId,
        name: "Virginia Woolf",
        nameEn: "Virginia Woolf",
        nameAr: "فيرجينيا وولف",
        aliases: ["Adeline Virginia Woolf"],
        birthYear: "1882",
        deathYear: "1941",
        ...rawAuthorOverrides,
      },
    },
  });

  return result as {
    canonicalAuthorId: string;
    authorId: string;
    canonicalKey: string;
    status: string;
    providerExternalId?: string;
  };
}

describe("ingestAuthor smoke", () => {
  beforeEach(() => {
    store.clear();
    uuidCounter = 0;
    timestampCounter = 0;
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const response: MockFetchResponse = {
          ok: false,
          status: 404,
          json: async () => ({}),
        };
        return response;
      })
    );
  });

  it("identity-lock idempotency: same provider+externalId yields same authorId across calls", async () => {
    const first = await callIngest();
    const second = await callIngest({
      bio: "English novelist, essayist, and critic.",
    });

    expect(first.authorId).toBe(first.canonicalAuthorId);
    expect(second.authorId).toBe(second.canonicalAuthorId);
    expect(first.authorId).toBe(second.authorId);
    expect(first.canonicalKey).toBe("virginia woolf::1882");

    const providerIdentity = getDoc("author_identity/provider:openLibrary:OL23919A");
    const canonicalIdentity = getDoc("author_identity/canonical:virginia woolf::1882");
    const ingestion = getDoc("author_ingestions/openLibrary:OL23919A");
    const author = getDoc(`authors/${first.authorId}`);

    expect(providerIdentity?.authorId).toBe(first.authorId);
    expect(canonicalIdentity?.authorId).toBe(first.authorId);
    expect(ingestion?.authorId).toBe(first.authorId);
    expect(ingestion?.state).toBe("COMPLETE");
    expect(author?.nameEn).toBe("Virginia Woolf");
    expect(author?.canonicalKey).toBe("virginia woolf::1882");
    expect(author?.sourceRecordType).toBe("provider");
    expect(author?.enrichmentEligible).toBe(true);
    expect(Array.isArray(author?.searchPrefixes)).toBe(true);
  });

  it("fetches Open Library author metadata and enriches with Wikidata when available", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input.includes("/authors/OL23919A.json")) {
        const response: MockFetchResponse = {
          ok: true,
          json: async () => ({
            key: "/authors/OL23919A",
            name: "J. K. Rowling",
            birth_date: "31 July 1965",
            personal_name: "J. K. Rowling",
            remote_ids: {
              wikidata: "Q34660",
            },
            links: [
              {
                title: "Official Site",
                url: "https://www.jkrowling.com/",
              },
            ],
          }),
        };
        return response;
      }

      if (input.includes("/authors/OL23919A/works.json")) {
        const response: MockFetchResponse = {
          ok: true,
          json: async () => ({
            size: 406,
            entries: [
              {
                key: "/works/OL82563W",
                title: "Harry Potter and the Philosopher's Stone",
              },
            ],
          }),
        };
        return response;
      }

      if (input.includes("wbgetentities") && input.includes("Q34660")) {
        const response: MockFetchResponse = {
          ok: true,
          json: async () => ({
            entities: {
              Q34660: {
                id: "Q34660",
                labels: {
                  ar: {
                    language: "ar",
                    value: "ج. ك. رولينغ",
                  },
                },
                descriptions: {
                  en: {
                    language: "en",
                    value: "British author and philanthropist (born 1965)",
                  },
                },
                aliases: {
                  en: [
                    {
                      language: "en",
                      value: "JKR",
                    },
                  ],
                },
              },
            },
          }),
        };
        return response;
      }

      const response: MockFetchResponse = {
        ok: false,
        status: 404,
        json: async () => ({}),
      };
      return response;
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await callIngest({
      name: "Fallback Name",
      birth_date: "",
    });

    const author = getDoc(`authors/${result.authorId}`) as Record<string, any> | null;
    const wikidataIdentity = getDoc("author_identity/provider:wikidata:Q34660");

    expect(author?.nameEn).toBe("J. K. Rowling");
    expect(author?.nameAr).toBe("ج. ك. رولينغ");
    expect(author?.sourceIds?.wikidata).toBe("Q34660");
    expect(author?.sourceRecordType).toBe("provider");
    expect(author?.enrichmentEligible).toBe(true);
    expect(author?.officialLinks).toEqual(["https://www.jkrowling.com/"]);
    expect(author?.workCount).toBe(406);
    expect(author?.topWorks?.[0]?.title).toBe("Harry Potter and the Philosopher's Stone");
    expect(wikidataIdentity?.authorId).toBe(result.authorId);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("adds viafId and aliases safely to an existing canonical author", async () => {
    setDoc(
      "authors/author-existing-1",
      {
        id: "author-existing-1",
        authorId: "author-existing-1",
        canonicalKey: "virginia woolf::1882",
        canonicalName: "Virginia Woolf",
        nameEn: "Virginia Woolf",
        nameAr: "Virginia Woolf",
        nameEnNormalized: "virginia woolf",
        nameArNormalized: "virginia woolf",
        aliases: ["V. Woolf"],
        aliasesNormalized: ["v woolf"],
        birthYear: "1882",
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );
    setDoc(
      "author_identity/canonical:virginia woolf::1882",
      {
        identityKey: "canonical:virginia woolf::1882",
        authorId: "author-existing-1",
      },
      false
    );

    const result = await callViafIngest();
    const author = getDoc("authors/author-existing-1") as Record<string, any> | null;
    const viafIdentity = getDoc("author_identity/authority:viaf:96994048");

    expect(result.authorId).toBe("author-existing-1");
    expect(author?.authorityLinks?.viaf).toBe("96994048");
    expect(author?.remoteIds?.viaf).toBe("96994048");
    expect(author?.aliases).toEqual(["V. Woolf", "Adeline Virginia Woolf"]);
    expect(author?.provenance?.authorityConfidence?.viaf).toBe("high");
    expect(viafIdentity?.authorId).toBe("author-existing-1");
  });

  it("fills missing multilingual names and years from VIAF without overriding existing truth", async () => {
    setDoc(
      "authors/author-existing-2",
      {
        id: "author-existing-2",
        authorId: "author-existing-2",
        canonicalKey: "naguib mahfouz::1911",
        canonicalName: "Naguib Mahfouz",
        nameEn: "Naguib Mahfouz",
        nameAr: "",
        nameEnNormalized: "naguib mahfouz",
        nameArNormalized: "",
        aliases: [],
        aliasesNormalized: [],
        birthYear: "",
        deathYear: "",
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );
    setDoc(
      "author_identity/canonical:naguib mahfouz::1911",
      {
        identityKey: "canonical:naguib mahfouz::1911",
        authorId: "author-existing-2",
      },
      false
    );

    await callViafIngest({
      providerExternalId: "61668623",
      viaf: "61668623",
      name: "Naguib Mahfouz",
      nameEn: "Naguib Mahfouz",
      nameAr: "نجيب محفوظ",
      birthYear: "1911",
      deathYear: "2006",
      aliases: ["Najib Mahfuz"],
    });

    const author = getDoc("authors/author-existing-2") as Record<string, any> | null;

    expect(author?.nameEn).toBe("Naguib Mahfouz");
    expect(author?.nameAr).toBe("نجيب محفوظ");
    expect(author?.birthYear).toBe("1911");
    expect(author?.deathYear).toBe("2006");
    expect(author?.aliases).toContain("Najib Mahfuz");
  });

  it("rejects VIAF cross-author attachment when the existing author name conflicts", async () => {
    setDoc(
      "authors/author-existing-3",
      {
        id: "author-existing-3",
        authorId: "author-existing-3",
        canonicalKey: "author one::1882",
        canonicalName: "Author One",
        nameEn: "Author One",
        nameAr: "Author One",
        nameEnNormalized: "author one",
        nameArNormalized: "author one",
        aliases: [],
        aliasesNormalized: [],
        birthYear: "1882",
        authorityLinks: {
          viaf: "96994048",
        },
        remoteIds: {
          viaf: "96994048",
        },
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );
    setDoc(
      "author_identity/authority:viaf:96994048",
      {
        identityKey: "authority:viaf:96994048",
        authorId: "author-existing-3",
      },
      false
    );

    await expect(
      callViafIngest({
        name: "Author Two",
        nameEn: "Author Two",
        aliases: ["A. Two"],
        birthYear: "1882",
      })
    ).rejects.toThrow("AUTHOR_VIAF_AUTHOR_MISMATCH");

    const author = getDoc("authors/author-existing-3") as Record<string, any> | null;
    expect(author?.nameEn).toBe("Author One");
    expect(author?.aliases).toEqual([]);
  });

  it("adds a Wikidata qid to an existing canonical author without creating a new one", async () => {
    setDoc(
      "authors/author-existing-4",
      {
        id: "author-existing-4",
        authorId: "author-existing-4",
        canonicalKey: "virginia woolf::1882",
        canonicalName: "Virginia Woolf",
        nameEn: "Virginia Woolf",
        nameAr: "Virginia Woolf",
        nameEnNormalized: "virginia woolf",
        nameArNormalized: "virginia woolf",
        aliases: ["V. Woolf"],
        aliasesNormalized: ["v woolf"],
        birthYear: "1882",
        sourceIds: {
          openLibrary: "OL23919A",
        },
        primarySource: "openLibrary",
        sourceRecordType: "provider",
        enrichmentEligible: true,
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );
    setDoc(
      "author_identity/canonical:virginia woolf::1882",
      {
        identityKey: "canonical:virginia woolf::1882",
        authorId: "author-existing-4",
      },
      false
    );

    const result = await callWikidataIngest();
    const author = getDoc("authors/author-existing-4") as Record<string, any> | null;
    const wikidataIdentity = getDoc("author_identity/provider:wikidata:Q123");

    expect(result.authorId).toBe("author-existing-4");
    expect(result.status).toBe("MERGED");
    expect(author?.sourceIds).toEqual({
      openLibrary: "OL23919A",
      wikidata: "Q123",
      googleBooks: "",
    });
    expect(author?.authorityLinks).toMatchObject({
      openLibraryId: "OL23919A",
      wikidataId: "Q123",
    });
    expect(author?.provenance?.authorityConfidence?.wikidata).toBe("weighted");
    expect(author?.primarySource).toBe("openLibrary");
    expect(wikidataIdentity?.authorId).toBe("author-existing-4");
  });

  it("adds Wikidata aliases safely without overriding stronger canonical names", async () => {
    setDoc(
      "authors/author-existing-5",
      {
        id: "author-existing-5",
        authorId: "author-existing-5",
        canonicalKey: "virginia woolf::1882",
        canonicalName: "Virginia Woolf",
        nameEn: "Virginia Woolf",
        nameAr: "فيرجينيا وولف",
        nameEnNormalized: "virginia woolf",
        nameArNormalized: "virginia woolf",
        aliases: ["V. Woolf"],
        aliasesNormalized: ["v woolf"],
        birthYear: "1882",
        deathYear: "1941",
        sourceRecordType: "authority",
        primarySource: "openLibrary",
        authorityLinks: {
          viaf: "96994048",
        },
        createdAt: "ts-seed",
        updatedAt: "ts-seed",
      },
      false
    );
    setDoc(
      "author_identity/canonical:virginia woolf::1882",
      {
        identityKey: "canonical:virginia woolf::1882",
        authorId: "author-existing-5",
      },
      false
    );

    await callWikidataIngest({
      nameEn: "Virginia Woolf",
      nameAr: "اسم خاطئ",
      aliases: ["Adeline Virginia Woolf", "V. Woolf"],
    });

    const author = getDoc("authors/author-existing-5") as Record<string, any> | null;

    expect(author?.nameEn).toBe("Virginia Woolf");
    expect(author?.nameAr).toBe("فيرجينيا وولف");
    expect(author?.aliases).toEqual(["V. Woolf", "Adeline Virginia Woolf"]);
    expect(author?.authorityLinks).toMatchObject({
      viaf: "96994048",
      wikidataId: "Q123",
    });
  });

  it("rejects Wikidata-only author creation when no canonical author already exists", async () => {
    await expect(
      callWikidataIngest({
        providerExternalId: "Q999",
        name: "Unmapped Author",
        nameEn: "Unmapped Author",
        birthYear: "1900",
      })
    ).rejects.toThrow("AUTHOR_WIKIDATA_REQUIRES_EXISTING_AUTHOR");

    expect(getDoc("authors/author-1")).toBeNull();
    expect(getDoc("author_identity/provider:wikidata:Q999")).toBeNull();
  });
});
