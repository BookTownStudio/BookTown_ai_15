/**
 * Closed Literary Entity Platform type vocabulary for Architecture Locked v1.
 *
 * User is intentionally excluded. User identity connects to literary entities
 * through UserEntityInteraction rather than LiteraryEntityRef.
 */

export const LITERARY_ENTITY_TYPES = [
  "work",
  "edition",
  "author",
  "quote",
  "publication",
  "theme",
  "concept",
  "movement",
  "period",
  "place",
] as const;

export type LiteraryEntityType = (typeof LITERARY_ENTITY_TYPES)[number];

export const ENTITY_AUTHORITY_STATES = [
  "candidate",
  "resolved",
  "canonical",
  "enriched",
  "deprecated",
  "merged",
  "archived",
  "unresolved",
] as const;

export type EntityAuthorityState = (typeof ENTITY_AUTHORITY_STATES)[number];

export const ENTITY_AUTHORITY_SOURCES = [
  "work_authority",
  "edition_authority",
  "author_authority",
  "quote_authority",
  "publication_authority",
  "theme_authority",
  "concept_authority",
  "movement_authority",
  "period_authority",
  "place_authority",
  "provider",
  "editorial",
  "migration",
  "system",
] as const;

export type EntityAuthoritySource = (typeof ENTITY_AUTHORITY_SOURCES)[number];

