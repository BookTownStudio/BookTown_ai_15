import { describe, expect, it } from "vitest";
import {
  createAuthorEntityRef,
  createEditionEntityRef,
  createMovementEntityRef,
  createPeriodEntityRef,
  createPublicationEntityRef,
  createQuoteEntityRef,
  createWorkEntityRef,
  ENTITY_PLATFORM_CONTRACT_VERSION,
} from "../../../contracts/entityPlatform";

describe("Entity Platform entity ref factories", () => {
  it("wraps existing core identities without changing the identity value", () => {
    expect(createWorkEntityRef(" book_1 ")).toMatchObject({
      contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
      entityType: "work",
      entityId: " book_1 ",
      authorityState: "canonical",
      authoritySource: "work_authority",
    });
    expect(createEditionEntityRef("edition_1")).toMatchObject({
      entityType: "edition",
      entityId: "edition_1",
      authoritySource: "edition_authority",
    });
    expect(createAuthorEntityRef("author_1")).toMatchObject({
      entityType: "author",
      entityId: "author_1",
      authoritySource: "author_authority",
    });
    expect(createQuoteEntityRef("quote_1")).toMatchObject({
      entityType: "quote",
      entityId: "quote_1",
      authoritySource: "quote_authority",
    });
    expect(createPublicationEntityRef("publication_1")).toMatchObject({
      entityType: "publication",
      entityId: "publication_1",
      authoritySource: "publication_authority",
    });
  });

  it("supports movement and period candidate wrappers without creating theme or concept factories", () => {
    expect(createMovementEntityRef("modernism", { authorityState: "resolved" })).toMatchObject({
      entityType: "movement",
      entityId: "modernism",
      authorityState: "resolved",
      authoritySource: "movement_authority",
    });
    expect(createPeriodEntityRef("victorian", { authorityState: "resolved" })).toMatchObject({
      entityType: "period",
      entityId: "victorian",
      authorityState: "resolved",
      authoritySource: "period_authority",
    });
  });

  it("preserves explicit compatibility metadata", () => {
    expect(
      createWorkEntityRef("book_1", {
        authorityState: "resolved",
        authoritySource: "migration",
        canonicalId: "work_1",
        canonicalKey: "canonical:work:1",
        displayHint: "Example Work",
        languageHint: "en",
        resolutionConfidence: 0.8,
        provenance: {
          sourceClass: "migration",
          sourceSystem: "entity_platform_wave_2",
        },
      })
    ).toEqual({
      contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
      entityType: "work",
      entityId: "book_1",
      authorityState: "resolved",
      authoritySource: "migration",
      canonicalId: "work_1",
      canonicalKey: "canonical:work:1",
      displayHint: "Example Work",
      languageHint: "en",
      resolutionConfidence: 0.8,
      provenance: {
        sourceClass: "migration",
        sourceSystem: "entity_platform_wave_2",
      },
    });
  });
});
