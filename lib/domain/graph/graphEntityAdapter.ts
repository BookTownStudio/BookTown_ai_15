import {
  createWorkEntityRef,
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntityRelationship,
  type EntitySummary,
  type GraphEntityReference,
  type GraphRelationshipDirection,
  type GraphRelationshipSource,
  type LiteraryEntityRef,
} from "../../../contracts/entityPlatform";
import type {
  BookSemanticGraph,
  BookSemanticGraphDirection,
  BookSemanticGraphSource,
  RelatedWorkGraphItem,
} from "../../../types/literaryGraph.ts";

function createGraphWorkRef(bookId: string, displayHint?: string): LiteraryEntityRef {
  return createWorkEntityRef(bookId, {
    displayHint,
    provenance: {
      sourceClass: "system",
      sourceSystem: "book_semantic_graph",
      sourceId: bookId,
    },
  });
}

function toGraphEntityReference(ref: LiteraryEntityRef): GraphEntityReference {
  return {
    ref,
    graphEligible: true,
    eligibilityProvenance: {
      sourceClass: "system",
      sourceSystem: "book_semantic_graph",
      sourceId: ref.entityId,
    },
  };
}

function toGraphRelationshipDirection(
  direction: BookSemanticGraphDirection
): GraphRelationshipDirection {
  return direction === "undirected" ? "undirected" : "directional";
}

function toGraphRelationshipSource(source: BookSemanticGraphSource): GraphRelationshipSource {
  return source === "explicit_relationship" ? "editorial" : "derived_ontology";
}

function relatedWorkTitle(item: RelatedWorkGraphItem): string {
  return item.book.title || item.book.titleEn || item.book.titleAr || item.bookId;
}

/**
 * Derives a Work ref from the root BookSemanticGraph identity.
 *
 * BookSemanticGraph remains the authoritative graph DTO. This adapter is pure
 * and does not imply graph API, traversal, ranking, or storage migration.
 */
export function toLiteraryEntityRefFromBookSemanticGraph(
  graph: BookSemanticGraph
): LiteraryEntityRef {
  return createGraphWorkRef(graph.bookId);
}

/**
 * Derives graph eligibility metadata from the root BookSemanticGraph identity.
 */
export function toGraphEntityReferenceFromBookSemanticGraph(
  graph: BookSemanticGraph
): GraphEntityReference {
  return toGraphEntityReference(toLiteraryEntityRefFromBookSemanticGraph(graph));
}

/**
 * Derives a Work ref from a hydrated related work graph item.
 */
export function toLiteraryEntityRefFromRelatedWork(
  item: RelatedWorkGraphItem
): LiteraryEntityRef {
  return createGraphWorkRef(item.bookId, relatedWorkTitle(item));
}

/**
 * Derives graph eligibility metadata from a hydrated related work graph item.
 */
export function toGraphEntityReferenceFromRelatedWork(
  item: RelatedWorkGraphItem
): GraphEntityReference {
  return toGraphEntityReference(toLiteraryEntityRefFromRelatedWork(item));
}

/**
 * Derives display-only EntitySummary metadata from a hydrated related Book.
 *
 * Author fields remain display strings and are not promoted into Author refs.
 */
export function toEntitySummaryFromRelatedWork(item: RelatedWorkGraphItem): EntitySummary {
  const ref = toLiteraryEntityRefFromRelatedWork(item);
  const subtitle = item.book.authorEn || item.book.authorAr || item.book.authors?.[0] || "";

  return {
    ref,
    title: relatedWorkTitle(item),
    authorityState: ref.authorityState,
    summaryVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
    ...(subtitle ? { subtitle } : {}),
    ...(item.book.description ? { description: item.book.description } : {}),
    ...(item.book.coverUrl ? { image: { url: item.book.coverUrl } } : {}),
    navigation: "openable",
    typeSpecific: {
      sourceSystem: "book_semantic_graph",
      relationshipType: item.relationshipType,
      direction: item.direction,
      source: item.source,
      confidence: item.confidence,
      ...(item.relationshipId ? { relationshipId: item.relationshipId } : {}),
    },
  };
}

/**
 * Derives an EntityRelationship-compatible view of an existing related work.
 *
 * This is compatibility metadata only. It does not replace graph storage,
 * graph traversal, graph ranking, or canonical relationship authority.
 */
export function toEntityRelationshipCompatibilityFromRelatedWork(
  graph: BookSemanticGraph,
  item: RelatedWorkGraphItem
): EntityRelationship {
  const source = toGraphEntityReferenceFromBookSemanticGraph(graph);
  const target = toGraphEntityReferenceFromRelatedWork(item);
  const relationshipId =
    item.relationshipId ||
    `${graph.bookId}:${item.relationshipType}:${item.bookId}`;

  return {
    relationshipId,
    source,
    target,
    relationshipType: item.relationshipType,
    direction: toGraphRelationshipDirection(item.direction),
    relationshipSource: toGraphRelationshipSource(item.source),
    provenance: {
      sourceClass:
        item.source === "explicit_relationship" ? "editorial" : "derived_ontology",
      sourceSystem: "book_semantic_graph",
      sourceId: relationshipId,
    },
    confidence: item.confidence,
    lifecycleState: "related",
    contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
  };
}
