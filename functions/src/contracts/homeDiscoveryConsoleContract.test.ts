import { describe, expect, it } from "vitest";
import { apiContracts } from "./shared/apiContracts";

const responseSchema = apiContracts.callable.getHomeDiscoveryConsole.responseSchema;

function parseHomeResponse(data: unknown) {
  return responseSchema.safeParse({
    success: true,
    data,
  });
}

describe("getHomeDiscoveryConsole contract", () => {
  it("accepts canonical mixed literary signal entities", () => {
    const parsed = parseHomeResponse({
      rows: [
        {
          type: "continueReading",
          items: [
            {
              kind: "book",
              bookId: "book_active",
              title: "Active Book",
              author: "Author",
              coverUrl: "",
              source: "algorithmic",
              score: 1,
              progress: 0.4,
            },
          ],
        },
        {
          type: "fromTheTown",
          editorialCount: 0,
          items: [
            {
              kind: "townSignal",
              signalType: "post",
              signalId: "post_1",
              postId: "post_1",
              title: "A thoughtful reading note",
              subtitle: "From the Town",
              source: "algorithmic",
              score: 0.92,
              reason: "A reflective discussion from the town",
            },
            {
              kind: "townSignal",
              signalType: "quote",
              signalId: "quote_1",
              title: "A saved passage is resonating",
              subtitle: "Quote signal",
              source: "algorithmic",
              score: 0.7,
            },
            {
              kind: "townSignal",
              signalType: "shelf",
              signalId: "shelf_1",
              title: "A shelf gathered around modern poetry",
              subtitle: "Shelf signal",
              source: "algorithmic",
              score: 0.62,
            },
            {
              kind: "townSignal",
              signalType: "reflection",
              signalId: "reflection_1",
              title: "A quiet note from the reading life",
              subtitle: "Reflection",
              source: "algorithmic",
              score: 0.5,
            },
            {
              kind: "townSignal",
              signalType: "author",
              signalId: "author_1",
              title: "Readers are returning to an author",
              subtitle: "Author signal",
              source: "algorithmic",
              score: 0.48,
            },
            {
              kind: "townSignal",
              signalType: "literaryMoment",
              signalId: "moment_1",
              title: "A slow literary prompt",
              subtitle: "Literary moment",
              source: "algorithmic",
              score: 0.4,
            },
          ],
        },
      ],
      generatedAt: new Date(0).toISOString(),
      ttlSeconds: 120,
      governanceVersion: "home_discovery_console_v1",
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts degraded payloads with omitted rows", () => {
    const parsed = parseHomeResponse({
      rows: [],
      generatedAt: new Date(0).toISOString(),
      ttlSeconds: 0,
      governanceVersion: "home_discovery_console_v1",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects town signals without canonical signalId", () => {
    const parsed = parseHomeResponse({
      rows: [
        {
          type: "fromTheTown",
          editorialCount: 0,
          items: [
            {
              kind: "townSignal",
              signalType: "post",
              postId: "post_1",
              title: "Missing canonical signal id",
              subtitle: "From the Town",
              source: "algorithmic",
              score: 0.8,
            },
          ],
        },
      ],
      generatedAt: new Date(0).toISOString(),
      ttlSeconds: 120,
      governanceVersion: "home_discovery_console_v1",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects reserved empty rows", () => {
    const parsed = parseHomeResponse({
      rows: [
        {
          type: "readNow",
          items: [],
        },
      ],
      generatedAt: new Date(0).toISOString(),
      ttlSeconds: 120,
      governanceVersion: "home_discovery_console_v1",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("Home editorial governance contract", () => {
  it("accepts Read Now editorial entries and preview rows", () => {
    const entry = {
      targetType: "book",
      targetId: "book_readable",
      row: "readNow",
      slot: 0,
      mode: "hard_pin",
      boostWeight: 0.25,
      startAt: new Date(0).toISOString(),
      endAt: new Date(86_400_000).toISOString(),
      regions: [],
      languages: ["en"],
      editorialReason: "Readable literary programming",
      isActive: true,
    };

    expect(apiContracts.callable.adminUpsertHomeEditorialEntry.requestSchema.safeParse(entry).success).toBe(true);
    expect(apiContracts.callable.adminPreviewHomeEditorialConsole.responseSchema.safeParse({
      success: true,
      data: {
        preview: {
          region: null,
          language: null,
          rows: [
            { row: "readNow", editorialCount: 1, maxEditorial: 2 },
            { row: "dynamicDiscovery", editorialCount: 0, maxEditorial: 2 },
            { row: "fromTheTown", editorialCount: 0, maxEditorial: 3 },
          ],
          entries: [entry],
        },
      },
    }).success).toBe(true);
  });

  it("accepts editorial resolver and Discover stream preview DTOs", () => {
    const target = {
      targetType: "book",
      targetId: "book_hidden_gem",
      label: "A Hidden Work",
      subtitle: "Quiet Author",
      source: "canonical_search",
      preview: {
        title: "A Hidden Work",
        author: "Quiet Author",
      },
      eligibility: {
        exists: true,
        eligible: true,
        public: true,
        readable: true,
        hasEbookAttachment: true,
        moderationSafe: true,
      },
      blocking: [],
      warnings: [],
    };

    expect(apiContracts.callable.adminSearchHomeTargets.requestSchema.safeParse({
      query: "Hidden Work",
      row: "dynamicDiscovery",
      streamKey: "hiddenGems",
      limit: 5,
    }).success).toBe(true);
    expect(apiContracts.callable.adminSearchHomeTargets.responseSchema.safeParse({
      success: true,
      data: { targets: [target] },
    }).success).toBe(true);
    expect(apiContracts.callable.adminResolveHomeTarget.responseSchema.safeParse({
      success: true,
      data: { target: { ...target, source: "canonical_resolver" } },
    }).success).toBe(true);
    expect(apiContracts.callable.adminResolveHomeTarget.requestSchema.safeParse({
      candidate: {
        targetType: "book",
        targetId: "book_hidden_gem",
      },
      row: "dynamicDiscovery",
      streamKey: "hiddenGems",
    }).success).toBe(true);
    expect(apiContracts.callable.adminPreviewHomePlacement.responseSchema.safeParse({
      success: true,
      data: {
        preview: {
          target,
          eligibility: target.eligibility,
          blocking: [],
          warnings: [],
          occupancy: {
            row: "dynamicDiscovery",
            streamKey: "hiddenGems",
            streamLabel: "Hidden Gems",
            activeCount: 1,
            max: 2,
            featuredCount: 0,
            maxFeatured: 1,
          },
          conflicts: {
            slotCollisionIds: [],
            sameTargetIds: [],
            crossLayerTargetIds: [],
          },
          schedule: {
            startAt: new Date(0).toISOString(),
            endAt: new Date(86_400_000).toISOString(),
          },
          canActivate: true,
        },
      },
    }).success).toBe(true);
  });
});

describe("Home continuity book contract", () => {
  it("accepts server-selected continuity book DTOs", () => {
    const book = {
      id: "book_surprise",
      authorId: "",
      titleEn: "A Literary Surprise",
      titleAr: "A Literary Surprise",
      authorEn: "Author",
      authorAr: "Author",
      coverUrl: "",
      descriptionEn: "",
      descriptionAr: "",
      genresEn: [],
      genresAr: [],
      rating: 0,
      ratingsCount: 0,
      isEbookAvailable: true,
    };

    expect(apiContracts.callable.selectHomeContinuityBook.requestSchema.safeParse({ mode: "surprise" }).success).toBe(true);
    expect(apiContracts.callable.selectHomeContinuityBook.requestSchema.safeParse({ mode: "starter" }).success).toBe(true);
    expect(apiContracts.callable.selectHomeContinuityBook.responseSchema.safeParse({
      success: true,
      data: book,
    }).success).toBe(true);
  });
});
