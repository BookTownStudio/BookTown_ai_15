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
