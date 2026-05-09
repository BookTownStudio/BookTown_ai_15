import type { FieldValue, Timestamp } from "firebase-admin/firestore";

import {
  CANONICAL_TRADITION_REGISTRY,
  type CanonicalTraditionRegistryKey,
} from "./canonicalTraditionRegistry";

export type BookForm =
  | "novel"
  | "poetry"
  | "drama"
  | "essay"
  | "philosophy"
  | "religious_text"
  | "epic"
  | "short_story"
  | "nonfiction"
  | "unknown";

export type BookOntologySource = "seed" | "admin" | "provider" | "migration";

export type BookOntologyConfidence = "verified" | "mapped" | "unknown";

export type CanonicalTradition =
  | CanonicalTraditionRegistryKey
  | "unknown";

export type BookOntology = {
  schemaVersion: 1;
  form: BookForm;
  subForm: string | null;
  canonicalTradition?: CanonicalTradition;
  source: BookOntologySource;
  confidence: BookOntologyConfidence;
  updatedAt: Timestamp | FieldValue;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: unknown): string {
  return asNonEmptyString(value)
    .toLowerCase()
    .replace(/[_-]+/gu, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizeBookForm(value: unknown): BookForm {
  const key = normalizeKey(value);

  if (!key) return "unknown";

  if (
    key === "religious text" ||
    key === "scripture" ||
    key === "sacred text"
  ) {
    return "religious_text";
  }

  if (
    key === "short story" ||
    key === "short stories" ||
    key === "story collection"
  ) {
    return "short_story";
  }

  if (
    key === "nonfiction" ||
    key === "non fiction" ||
    key === "memoir" ||
    key === "biography"
  ) {
    return "nonfiction";
  }

  if (key.includes("epic")) return "epic";

  if (
    key === "play" ||
    key === "plays" ||
    key === "tragedy" ||
    key === "comedy"
  ) {
    return "drama";
  }

  if (key.includes("drama")) return "drama";

  if (
    key.includes("poetry") ||
    key === "poem" ||
    key === "poems" ||
    key === "verse"
  ) {
    return "poetry";
  }

  if (key.includes("philosophy")) return "philosophy";

  if (key === "essay" || key === "essays") return "essay";

  if (
    key === "novel" ||
    key === "novels" ||
    key === "fiction"
  ) {
    return "novel";
  }

  return key === "unknown" ? "unknown" : "unknown";
}

export function normalizeBookOntologySource(
  value: unknown
): BookOntologySource | null {
  if (
    value === "seed" ||
    value === "admin" ||
    value === "provider" ||
    value === "migration"
  ) {
    return value;
  }

  return null;
}

export function normalizeBookOntologyConfidence(
  value: unknown
): BookOntologyConfidence | null {
  if (
    value === "verified" ||
    value === "mapped" ||
    value === "unknown"
  ) {
    return value;
  }

  return null;
}

export function normalizeCanonicalTradition(
  value: unknown
): CanonicalTradition | null {
  if (value === "unknown") {
    return "unknown";
  }

  if (
    typeof value === "string" &&
    value in CANONICAL_TRADITION_REGISTRY
  ) {
    return value as CanonicalTradition;
  }

  return null;
}

export function readBookOntology(value: unknown): BookOntology | null {
  const record = asRecord(value);

  if (!record || record.schemaVersion !== 1) {
    return null;
  }

  const form = normalizeBookForm(record.form);

  const source = normalizeBookOntologySource(record.source);

  const confidence = normalizeBookOntologyConfidence(
    record.confidence
  );

  if (!source || !confidence || record.updatedAt == null) {
    return null;
  }

  const canonicalTradition = normalizeCanonicalTradition(
    record.canonicalTradition
  );

  return {
    schemaVersion: 1,
    form,
    subForm: asNonEmptyString(record.subForm) || null,
    ...(canonicalTradition ? { canonicalTradition } : {}),
    source,
    confidence,
    updatedAt: record.updatedAt as Timestamp | FieldValue,
  };
}

export function resolveBookOntologyForm(
  data: Record<string, unknown>
): BookForm {
  const ontology = readBookOntology(data.ontology);

  return ontology?.form || normalizeBookForm(data.literaryForm);
}

export function buildBookOntology(params: {
  literaryForm: unknown;
  source: BookOntologySource;
  confidence: BookOntologyConfidence;
  updatedAt: Timestamp | FieldValue;
  canonicalTradition?: unknown;
}): BookOntology {
  const rawForm = asNonEmptyString(params.literaryForm);

  const form = normalizeBookForm(rawForm);

  const subForm =
    rawForm && normalizeKey(rawForm) !== normalizeKey(form)
      ? rawForm
      : null;

  const canonicalTradition = normalizeCanonicalTradition(
    params.canonicalTradition
  );

  return {
    schemaVersion: 1,
    form,
    subForm,
    ...(canonicalTradition ? { canonicalTradition } : {}),
    source: params.source,
    confidence: params.confidence,
    updatedAt: params.updatedAt,
  };
}