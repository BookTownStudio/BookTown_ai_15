import { describe, expect, it } from "vitest";
import {
  toEntityRelationshipCompatibilityFromRelatedWork,
  toEntitySummaryFromRelatedWork,
  toGraphEntityReferenceFromBookSemanticGraph,
  toGraphEntityReferenceFromRelatedWork,
  toLiteraryEntityRefFromBookSemanticGraph,
  toLiteraryEntityRefFromRelatedWork,
} from "../../../lib/domain/graph/graphEntityAdapter.ts";
import type { Book } from "../../../types/entities.ts";
import type {
  BookSemanticGraph,
  RelatedWorkGraphItem,
} from "../../../types/literaryGraph.ts";

function buildBook(overrides: Partial<Book> = {}): Book {
  return {
    id: "related_1",
    authorId: "author_1",
    title: "Related Work",
    titleEn: "Related Work",
    titleAr: "",
    authorEn: "Display Author",
    authorAr: "",
    authors: ["Display Author"],
    bookCovers: [],
    coverUrl: "https://example.test/cover.jpg",
    descriptionEn: "Description",
    descriptionAr: "",
    description: "Description",
    ontology: {
      schemaVersion: 1,
      form: "novel",
      subForm: "literary",
      source: "seed",
      confidence: "verified",
      updatedAt: null,
    },
    genresEn: [],
    genresAr: [],
    rating: 0,
    ratingsCount: 0,
    isEbookAvailable: false,
    ...overrides,
  } as Book;
}

function buildRelatedWork(
  overrides: Partial<RelatedWorkGraphItem> = {}
): RelatedWorkGraphItem {
  return {
    bookId: "related_1",
    relationshipType: "same_movement",
    direction: "undirected",
    source: "same_movement",
    confidence: 0.55,
    relationshipId: "relationship_1",
    book: buildBook(),
    ...overrides,
  };
}

function buildGraph(overrides: Partial<BookSemanticGraph> = {}): BookSemanticGraph {
  return {
    bookId: "book_1",
    ontology: {
      form: "novel",
      subForm: "literary",
      canonicalTradition: "modernism",
    },
    semanticRefs: {
      schemaVersion: 1,
      traditionEntityId: "tradition_1",
      movementEntityIds: ["movement_1"],
      philosophyEntityIds: ["philosophy_1"],
      historicalPeriodEntityIds: ["period_1"],
    },
    relatedWorks: [buildRelatedWork()],
    groups: {
      explicitRelationshipCount: 1,
      relationshipCounts: {
        same_movement: 1,
      },
      sameTraditionCount: 0,
      sameFormCount: 0,
      sameSubformCount: 0,
      sameMovementCount: 1,
    },
    ...overrides,
  };
}

describe("graphEntityAdapter", () => {
  it("maps root BookSemanticGraph to a Work LiteraryEntityRef using bookId", () => {
    expect(toLiteraryEntityRefFromBookSemanticGraph(buildGraph())).toMatchObject({
      contractVersion: 1,
      entityType: "work",
      entityId: "book_1",
      authorityState: "canonical",
      authoritySource: "work_authority",
      provenance: {
        sourceClass: "system",
        sourceSystem: "book_semantic_graph",
        sourceId: "book_1",
      },
    });
  });

  it("maps root BookSemanticGraph to a GraphEntityReference", () => {
    expect(toGraphEntityReferenceFromBookSemanticGraph(buildGraph())).toMatchObject({
      graphEligible: true,
      ref: {
        entityType: "work",
        entityId: "book_1",
      },
      eligibilityProvenance: {
        sourceClass: "system",
        sourceSystem: "book_semantic_graph",
        sourceId: "book_1",
      },
    });
  });

  it("maps related work graph items to Work LiteraryEntityRef using bookId", () => {
    expect(toLiteraryEntityRefFromRelatedWork(buildRelatedWork())).toMatchObject({
      entityType: "work",
      entityId: "related_1",
      displayHint: "Related Work",
    });
  });

  it("maps related work graph items to GraphEntityReference", () => {
    expect(toGraphEntityReferenceFromRelatedWork(buildRelatedWork())).toMatchObject({
      graphEligible: true,
      ref: {
        entityType: "work",
        entityId: "related_1",
      },
    });
  });

  it("derives EntitySummary from hydrated related book payload", () => {
    expect(toEntitySummaryFromRelatedWork(buildRelatedWork())).toMatchObject({
      title: "Related Work",
      subtitle: "Display Author",
      image: { url: "https://example.test/cover.jpg" },
      navigation: "openable",
      ref: {
        entityType: "work",
        entityId: "related_1",
      },
      typeSpecific: {
        sourceSystem: "book_semantic_graph",
        relationshipType: "same_movement",
        direction: "undirected",
        source: "same_movement",
        confidence: 0.55,
        relationshipId: "relationship_1",
      },
    });
  });

  it("keeps author strings as display subtitle and does not create Author refs", () => {
    const summary = toEntitySummaryFromRelatedWork(
      buildRelatedWork({
        book: buildBook({ authorEn: "Display Author", authors: ["Display Author"] }),
      })
    );

    expect(summary.subtitle).toBe("Display Author");
    expect(JSON.stringify(summary)).not.toContain("\"entityType\":\"author\"");
  });

  it("preserves relationship metadata in compatibility relationships", () => {
    expect(
      toEntityRelationshipCompatibilityFromRelatedWork(
        buildGraph(),
        buildRelatedWork({
          relationshipType: "influenced",
          direction: "outgoing",
          source: "explicit_relationship",
          confidence: 0.92,
          relationshipId: "explicit_1",
        })
      )
    ).toMatchObject({
      relationshipId: "explicit_1",
      relationshipType: "influenced",
      direction: "directional",
      relationshipSource: "editorial",
      confidence: 0.92,
      lifecycleState: "related",
      contractVersion: 1,
      source: {
        ref: {
          entityType: "work",
          entityId: "book_1",
        },
      },
      target: {
        ref: {
          entityType: "work",
          entityId: "related_1",
        },
      },
    });
  });

  it("keeps semantic refs as source metadata and does not turn them into graph refs", () => {
    const graph = buildGraph();

    toGraphEntityReferenceFromBookSemanticGraph(graph);

    expect(JSON.stringify(graph.semanticRefs)).toContain("movement_1");
    expect(JSON.stringify(toGraphEntityReferenceFromBookSemanticGraph(graph))).not.toContain(
      "movement_1"
    );
  });

  it("does not mutate graph DTOs or related work items", () => {
    const graph = buildGraph();
    const item = buildRelatedWork();
    const before = {
      graph: structuredClone(graph),
      item: structuredClone(item),
    };

    toLiteraryEntityRefFromBookSemanticGraph(graph);
    toGraphEntityReferenceFromBookSemanticGraph(graph);
    toLiteraryEntityRefFromRelatedWork(item);
    toGraphEntityReferenceFromRelatedWork(item);
    toEntitySummaryFromRelatedWork(item);
    toEntityRelationshipCompatibilityFromRelatedWork(graph, item);

    expect({ graph, item }).toEqual(before);
  });
});
