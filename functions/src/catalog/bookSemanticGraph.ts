import { HttpsError, onCall } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import { buildCatalogBookView, isPublicReadableBook } from "./catalogBookView";
import { LITERARY_RELATIONSHIP_COLLECTIONS } from "../library/ontology/literaryRelationshipCollections";
import type { LiteraryRelationship } from "../library/ontology/literaryRelationship";
import {
  LITERARY_RELATIONSHIP_TYPE_LIST,
  isDirectionalLiteraryRelationshipType,
  normalizeLiteraryRelationshipType,
  type LiteraryRelationshipType,
} from "../library/ontology/literaryRelationshipTypes";
import { buildCanonicalLiteraryRelationshipId } from "../library/ontology/literaryRelationshipIdentity";
import { readLiteraryRelationshipDocument } from "../library/ontology/readLiteraryRelationship";
import { readBookSemanticRefs } from "../library/ontology/bookSemanticRefs";

const db = admin.firestore();
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;
const EDGE_QUERY_LIMIT = 60;
const GROUP_QUERY_LIMIT = 18;

type GraphDirection = "outgoing" | "incoming" | "undirected";
type GraphDiscoverySource =
  | "explicit_relationship"
  | "same_tradition"
  | "same_form"
  | "same_subform"
  | "same_movement";

type RelatedWorkCandidate = {
  bookId: string;
  relationshipType: LiteraryRelationshipType | "same_form" | "same_subform";
  direction: GraphDirection;
  source: GraphDiscoverySource;
  confidence: number;
  relationshipId?: string;
};

function asNonEmptyString(value: unknown, maxLen = 256): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function asPositiveInt(value: unknown, fallback: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const normalized = Math.trunc(numeric);
  if (normalized <= 0) return fallback;
  return Math.min(normalized, max);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readOntology(book: Record<string, unknown>) {
  const ontology = asRecord(book.ontology);
  return {
    form: asNonEmptyString(ontology?.form || book.literaryForm, 80),
    subForm: asNonEmptyString(ontology?.subForm, 120),
    canonicalTradition: asNonEmptyString(ontology?.canonicalTradition, 120),
  };
}

function relationRank(type: string): number {
  const ranks: Record<string, number> = {
    influenced: 10,
    influenced_by: 10,
    responds_to: 9,
    literary_response_to: 9,
    same_tradition: 8,
    same_movement: 7,
    same_period: 6,
    same_cycle: 6,
    philosophical_relation: 5,
    historical_relation: 5,
    thematic_affinity: 4,
    similar_theme: 4,
    contemporary_of: 3,
    same_subform: 2,
    same_form: 1,
  };
  return ranks[type] || 0;
}

function buildRelationshipCandidate(
  bookId: string,
  relationship: LiteraryRelationship & { relationshipId: string }
): RelatedWorkCandidate | null {
  if (relationship.fromEntityType !== "book" && relationship.toEntityType !== "book") {
    return null;
  }

  const canonicalId = buildCanonicalLiteraryRelationshipId(relationship);
  const directional = isDirectionalLiteraryRelationshipType(relationship.relationshipType);

  if (relationship.fromEntityType === "book" && relationship.fromEntityId === bookId) {
    return {
      bookId: relationship.toEntityId,
      relationshipType: relationship.relationshipType,
      direction: directional ? "outgoing" : "undirected",
      source: "explicit_relationship",
      confidence: relationship.confidence,
      relationshipId: canonicalId,
    };
  }

  if (relationship.toEntityType === "book" && relationship.toEntityId === bookId) {
    return {
      bookId: relationship.fromEntityId,
      relationshipType: relationship.relationshipType,
      direction: directional ? "incoming" : "undirected",
      source: "explicit_relationship",
      confidence: relationship.confidence,
      relationshipId: canonicalId,
    };
  }

  return null;
}

async function queryRelationshipDocs(params: {
  idField: "fromEntityId" | "toEntityId" | "sourceBookId" | "targetBookId";
  typeField?: "fromEntityType" | "toEntityType";
  bookId: string;
}): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  let query: FirebaseFirestore.Query = db
    .collection(LITERARY_RELATIONSHIP_COLLECTIONS.relationships)
    .where(params.idField, "==", params.bookId);

  if (params.typeField) {
    query = query.where(params.typeField, "==", "book");
  }

  const snap = await query.limit(EDGE_QUERY_LIMIT).get();
  return snap.docs;
}

async function loadExplicitRelationshipCandidates(
  bookId: string
): Promise<RelatedWorkCandidate[]> {
  const snapshots = await Promise.all([
    queryRelationshipDocs({
      idField: "fromEntityId",
      typeField: "fromEntityType",
      bookId,
    }),
    queryRelationshipDocs({
      idField: "toEntityId",
      typeField: "toEntityType",
      bookId,
    }),
    queryRelationshipDocs({ idField: "sourceBookId", bookId }),
    queryRelationshipDocs({ idField: "targetBookId", bookId }),
  ]);
  const byIdentity = new Map<string, RelatedWorkCandidate>();

  for (const doc of snapshots.flat()) {
    const relationship = readLiteraryRelationshipDocument(doc.id, doc.data());
    if (!relationship) continue;
    const candidate = buildRelationshipCandidate(bookId, relationship);
    if (!candidate || candidate.bookId === bookId) continue;
    const identity =
      candidate.relationshipId ||
      `${candidate.relationshipType}:${[bookId, candidate.bookId].sort().join(":")}`;
    const existing = byIdentity.get(identity);
    if (!existing || candidate.confidence > existing.confidence) {
      byIdentity.set(identity, candidate);
    }
  }

  return Array.from(byIdentity.values());
}

async function loadBookGroupCandidates(params: {
  bookId: string;
  field: string;
  value: string;
  relationshipType: RelatedWorkCandidate["relationshipType"];
  source: GraphDiscoverySource;
  limit: number;
}): Promise<RelatedWorkCandidate[]> {
  if (!params.value) return [];

  const snap = await db
    .collection("books")
    .where(params.field, "==", params.value)
    .limit(params.limit + 1)
    .get();

  return snap.docs
    .filter((doc) => doc.id !== params.bookId)
    .map((doc) => ({
      bookId: doc.id,
      relationshipType: params.relationshipType,
      direction: "undirected" as const,
      source: params.source,
      confidence: 0.5,
    }));
}

async function loadMovementCandidates(params: {
  bookId: string;
  movementEntityIds: string[];
  limit: number;
}): Promise<RelatedWorkCandidate[]> {
  const movementIds = params.movementEntityIds.slice(0, 10);
  if (movementIds.length === 0) return [];

  const snap = await db
    .collection("books")
    .where("semanticRefs.movementEntityIds", "array-contains-any", movementIds)
    .limit(params.limit + 1)
    .get();

  return snap.docs
    .filter((doc) => doc.id !== params.bookId)
    .map((doc) => ({
      bookId: doc.id,
      relationshipType: "same_movement" as const,
      direction: "undirected" as const,
      source: "same_movement" as const,
      confidence: 0.55,
    }));
}

function mergeCandidates(
  candidates: RelatedWorkCandidate[],
  limit: number
): RelatedWorkCandidate[] {
  const byBook = new Map<string, RelatedWorkCandidate>();

  for (const candidate of candidates) {
    const existing = byBook.get(candidate.bookId);
    if (
      !existing ||
      relationRank(candidate.relationshipType) > relationRank(existing.relationshipType) ||
      (relationRank(candidate.relationshipType) === relationRank(existing.relationshipType) &&
        candidate.confidence > existing.confidence)
    ) {
      byBook.set(candidate.bookId, candidate);
    }
  }

  return Array.from(byBook.values())
    .sort((a, b) => {
      const rankDelta = relationRank(b.relationshipType) - relationRank(a.relationshipType);
      if (rankDelta !== 0) return rankDelta;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.bookId.localeCompare(b.bookId);
    })
    .slice(0, limit);
}

async function hydrateRelatedWorks(candidates: RelatedWorkCandidate[]) {
  const hydrated = await Promise.all(
    candidates.map(async (candidate) => {
      const snap = await db.collection("books").doc(candidate.bookId).get();
      if (!snap.exists) return null;
      const data = (snap.data() || {}) as Record<string, unknown>;
      if (!isPublicReadableBook(data)) return null;

      return {
        bookId: candidate.bookId,
        relationshipType: candidate.relationshipType,
        direction: candidate.direction,
        source: candidate.source,
        confidence: candidate.confidence,
        ...(candidate.relationshipId ? { relationshipId: candidate.relationshipId } : {}),
        book: await buildCatalogBookView(candidate.bookId, data),
      };
    })
  );

  return hydrated.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

export async function getBookSemanticGraphData(params: {
  bookId: string;
  limit?: number;
}) {
  const bookId = asNonEmptyString(params.bookId, 256);
  if (!bookId) {
    throw new HttpsError("invalid-argument", "A valid bookId is required.");
  }

  const limit = asPositiveInt(params.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const bookSnap = await db.collection("books").doc(bookId).get();
  if (!bookSnap.exists) {
    throw new HttpsError("not-found", "Book not found.");
  }

  const book = (bookSnap.data() || {}) as Record<string, unknown>;
  if (!isPublicReadableBook(book)) {
    throw new HttpsError("permission-denied", "Book is not publicly readable.");
  }

  const ontology = readOntology(book);
  const semanticRefs = readBookSemanticRefs(book.semanticRefs);
  const explicitCandidates = await loadExplicitRelationshipCandidates(bookId);
  const groupCandidates = await Promise.all([
    loadBookGroupCandidates({
      bookId,
      field: "ontology.canonicalTradition",
      value: ontology.canonicalTradition,
      relationshipType: "same_tradition",
      source: "same_tradition",
      limit: GROUP_QUERY_LIMIT,
    }),
    loadBookGroupCandidates({
      bookId,
      field: "ontology.form",
      value: ontology.form,
      relationshipType: "same_form",
      source: "same_form",
      limit: GROUP_QUERY_LIMIT,
    }),
    loadBookGroupCandidates({
      bookId,
      field: "ontology.subForm",
      value: ontology.subForm,
      relationshipType: "same_subform",
      source: "same_subform",
      limit: GROUP_QUERY_LIMIT,
    }),
    loadMovementCandidates({
      bookId,
      movementEntityIds: semanticRefs?.movementEntityIds || [],
      limit: GROUP_QUERY_LIMIT,
    }),
  ]);

  const candidates = mergeCandidates(
    [...explicitCandidates, ...groupCandidates.flat()],
    limit
  );
  const relatedWorks = await hydrateRelatedWorks(candidates);

  const relationshipCounts = LITERARY_RELATIONSHIP_TYPE_LIST.reduce<Record<string, number>>(
    (acc, type) => {
      acc[type] = 0;
      return acc;
    },
    {}
  );

  for (const candidate of candidates) {
    relationshipCounts[candidate.relationshipType] =
      (relationshipCounts[candidate.relationshipType] || 0) + 1;
  }

  return {
    bookId,
    ontology,
    semanticRefs: semanticRefs || null,
    relatedWorks,
    groups: {
      explicitRelationshipCount: explicitCandidates.length,
      relationshipCounts,
      sameTraditionCount: candidates.filter((item) => item.source === "same_tradition").length,
      sameFormCount: candidates.filter((item) => item.source === "same_form").length,
      sameSubformCount: candidates.filter((item) => item.source === "same_subform").length,
      sameMovementCount: candidates.filter((item) => item.source === "same_movement").length,
    },
  };
}

export const getBookSemanticGraph = onCall({ cors: true }, async (request) => {
  return getBookSemanticGraphData(
    (request.data || {}) as { bookId: string; limit?: number }
  );
});
