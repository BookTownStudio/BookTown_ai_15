import type { CanonicalImportRow, ParseIssue } from "../types";
import {
  buildRowKey,
  mapReservedShelf,
  normalizeReviewText,
  normalizedCanonicalTitleAndAuthor,
  parseDsarUtcTimestampToIso,
  parseRating,
  sha256Hex,
  toIdentityKey,
  trimTo,
} from "../normalization";
import { extractZipEntryBuffer, listZipEntries } from "../zip";

const MAX_REVIEW_LENGTH = 4000;
const MAX_OUTER_ZIP_ENTRY_BYTES = 30 * 1024 * 1024;

type StorageBucketLike = {
  file: (path: string) => {
    download: () => Promise<[Buffer]>;
  };
};

type DsarAggregate = {
  key: string;
  title: string;
  author: string;
  titleNorm: string;
  authorNorm: string;
  isbn10: null;
  isbn13: null;
  rating: number;
  reviewText: string;
  shelfNames: Set<string>;
  exclusiveShelf: string | null;
  dateAdded: string | null;
  dateRead: string | null;
  rawEntries: Array<{ entry: string; rowIndex: number }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isJsonEntry(fileName: string, targetName: string): boolean {
  return fileName.toLowerCase().endsWith(`/${targetName.toLowerCase()}`) || fileName.toLowerCase() === targetName.toLowerCase();
}

function loadJsonArrayFromNestedZip(params: {
  outerZipBuffer: Buffer;
  nestedZipName: string;
  jsonEntryName: string;
}): unknown[] {
  const outerEntries = listZipEntries(params.outerZipBuffer);
  const nestedEntry = outerEntries.find(
    (entry) => entry.fileName.toLowerCase() === params.nestedZipName.toLowerCase()
  );
  if (!nestedEntry) {
    return [];
  }

  const nestedBuffer = extractZipEntryBuffer(
    params.outerZipBuffer,
    nestedEntry,
    MAX_OUTER_ZIP_ENTRY_BYTES
  );
  const nestedEntries = listZipEntries(nestedBuffer);
  const jsonEntry = nestedEntries.find((entry) => isJsonEntry(entry.fileName, params.jsonEntryName));
  if (!jsonEntry) {
    return [];
  }

  const jsonBuffer = extractZipEntryBuffer(nestedBuffer, jsonEntry, MAX_OUTER_ZIP_ENTRY_BYTES);
  const parsed = JSON.parse(jsonBuffer.toString("utf8")) as unknown;
  return Array.isArray(parsed) ? parsed : [];
}

function upsertAggregate(
  map: Map<string, DsarAggregate>,
  params: {
    title: string;
    author: string;
    rating: number;
    reviewText: string;
    exclusiveShelf: string | null;
    extraShelves: string[];
    dateAdded: string | null;
    dateRead: string | null;
    entry: string;
    rowIndex: number;
  }
): DsarAggregate {
  const title = trimTo(params.title, 300);
  const author = trimTo(params.author, 240);
  const { titleNorm, authorNorm } = normalizedCanonicalTitleAndAuthor({
    title,
    author,
  });
  const fallbackAuthorNorm = authorNorm || "unknown";
  const identityKey = toIdentityKey({
    isbn13: null,
    isbn10: null,
    titleNorm,
    authorNorm: fallbackAuthorNorm,
  });
  const key = identityKey;

  const existing = map.get(key);
  if (!existing) {
    const created: DsarAggregate = {
      key,
      title,
      author: author || "Unknown",
      titleNorm,
      authorNorm: fallbackAuthorNorm,
      isbn10: null,
      isbn13: null,
      rating: params.rating,
      reviewText: params.reviewText,
      shelfNames: new Set(params.extraShelves),
      exclusiveShelf: params.exclusiveShelf,
      dateAdded: params.dateAdded,
      dateRead: params.dateRead,
      rawEntries: [{ entry: params.entry, rowIndex: params.rowIndex }],
    };
    if (params.exclusiveShelf) created.shelfNames.add(params.exclusiveShelf);
    map.set(key, created);
    return created;
  }

  existing.rating = Math.max(existing.rating, params.rating);
  if (!existing.reviewText && params.reviewText) {
    existing.reviewText = params.reviewText;
  }
  if (!existing.exclusiveShelf && params.exclusiveShelf) {
    existing.exclusiveShelf = params.exclusiveShelf;
  }
  for (const shelf of params.extraShelves) {
    existing.shelfNames.add(shelf);
  }
  if (params.exclusiveShelf) {
    existing.shelfNames.add(params.exclusiveShelf);
  }
  if (!existing.dateAdded && params.dateAdded) {
    existing.dateAdded = params.dateAdded;
  }
  if (!existing.dateRead && params.dateRead) {
    existing.dateRead = params.dateRead;
  } else if (existing.dateRead && params.dateRead && params.dateRead > existing.dateRead) {
    existing.dateRead = params.dateRead;
  }
  existing.rawEntries.push({ entry: params.entry, rowIndex: params.rowIndex });
  return existing;
}

function normalizeReadStatusToShelf(statusRaw: string): string | null {
  const mapped = mapReservedShelf(statusRaw);
  return mapped;
}

function hasStrongDsarIdentity(params: { title: string; author: string }): boolean {
  const { titleNorm, authorNorm } = normalizedCanonicalTitleAndAuthor(params);
  return titleNorm.length > 0 && authorNorm.length > 0;
}

export async function* iterateDsarCanonicalRows(params: {
  bucket: StorageBucketLike;
  sourcePath: string;
}): AsyncGenerator<CanonicalImportRow | ParseIssue> {
  const sourceFile = params.bucket.file(params.sourcePath);
  const [outerZipBuffer] = await sourceFile.download();
  const aggregates = new Map<string, DsarAggregate>();

  const reviewRows = loadJsonArrayFromNestedZip({
    outerZipBuffer,
    nestedZipName: "review.zip",
    jsonEntryName: "review.json",
  });

  let parsedRows = 0;
  for (let i = 0; i < reviewRows.length; i += 1) {
    const rowIndex = i + 1;
    const record = asRecord(reviewRows[i]);
    if (!record) continue;
    if (Array.isArray(record.explanation)) continue;

    parsedRows += 1;
    const title = asString(record.book);
    if (!title.trim()) {
      yield {
        rowIndex,
        rowKey: sha256Hex(`dsar:review:${rowIndex}:missing-title`),
        code: "ROW_VALIDATION_FAILED",
        message: "Missing book title in DSAR review row.",
      };
      continue;
    }
    if (!hasStrongDsarIdentity({ title, author: asString(record.author) })) {
      yield {
        rowIndex,
        rowKey: sha256Hex(`dsar:review:${rowIndex}:weak-identity:${title.trim().toLowerCase()}`),
        code: "LOW_CONFIDENCE_MATCH_REJECTED",
        message: "DSAR row is missing strong identity fields required for canonical matching.",
        details: {
          entry: "review.json",
          requires: ["author"],
        },
      };
      continue;
    }

    const reviewText = normalizeReviewText(asString(record.review), MAX_REVIEW_LENGTH);
    const rating = parseRating(record.rating as string | number | null);
    const statusShelf = normalizeReadStatusToShelf(asString(record.read_status));
    const dateRead = parseDsarUtcTimestampToIso(asString(record.read_at) || null);
    const dateAdded =
      parseDsarUtcTimestampToIso(asString(record.created_at) || null) ||
      parseDsarUtcTimestampToIso(asString(record.updated_at) || null);

    upsertAggregate(aggregates, {
      title,
      author: asString(record.author),
      rating,
      reviewText,
      exclusiveShelf: statusShelf,
      extraShelves: statusShelf ? [statusShelf] : [],
      dateAdded,
      dateRead,
      entry: "review.json",
      rowIndex,
    });
  }

  const ownedRows = loadJsonArrayFromNestedZip({
    outerZipBuffer,
    nestedZipName: "owned_book.zip",
    jsonEntryName: "owned_book.json",
  });

  for (let i = 0; i < ownedRows.length; i += 1) {
    const rowIndex = i + 1;
    const record = asRecord(ownedRows[i]);
    if (!record) continue;
    if (Array.isArray(record.explanation)) continue;

    parsedRows += 1;
    const title = asString(record.book);
    if (!title.trim()) {
      yield {
        rowIndex,
        rowKey: sha256Hex(`dsar:owned:${rowIndex}:missing-title`),
        code: "ROW_VALIDATION_FAILED",
        message: "Missing book title in DSAR owned_book row.",
      };
      continue;
    }
    if (!hasStrongDsarIdentity({ title, author: asString(record.author) })) {
      yield {
        rowIndex,
        rowKey: sha256Hex(`dsar:owned:${rowIndex}:weak-identity:${title.trim().toLowerCase()}`),
        code: "LOW_CONFIDENCE_MATCH_REJECTED",
        message: "DSAR row is missing strong identity fields required for canonical matching.",
        details: {
          entry: "owned_book.json",
          requires: ["author"],
        },
      };
      continue;
    }

    upsertAggregate(aggregates, {
      title,
      author: asString(record.author),
      rating: 0,
      reviewText: "",
      exclusiveShelf: null,
      extraShelves: ["owned"],
      dateAdded:
        parseDsarUtcTimestampToIso(asString(record.created_at) || null) ||
        parseDsarUtcTimestampToIso(asString(record.updated_at) || null),
      dateRead: null,
      entry: "owned_book.json",
      rowIndex,
    });
  }

  if (parsedRows === 0) {
    throw new Error("SCHEMA_VALIDATION_FAILED: DSAR source contains no supported rows.");
  }

  const ordered = Array.from(aggregates.values()).sort((a, b) =>
    a.key.localeCompare(b.key)
  );

  for (let i = 0; i < ordered.length; i += 1) {
    const row = ordered[i];
    const shelfNames = Array.from(row.shelfNames).slice(0, 24);
    const rowKey = buildRowKey({
      titleNorm: row.titleNorm,
      authorNorm: row.authorNorm,
      isbn10: row.isbn10,
      isbn13: row.isbn13,
      rating: row.rating,
      reviewText: row.reviewText,
      exclusiveShelf: row.exclusiveShelf,
      dateRead: row.dateRead,
      shelfNames,
    });

    const pointer = row.rawEntries[0] || { entry: "unknown", rowIndex: i + 1 };

    yield {
      rowIndex: i + 1,
      rowKey,
      identityKey: row.key,
      sourceKind: "DSAR_JSON",
      rawPointer: {
        sourceKind: "DSAR_JSON",
        entry: pointer.entry,
        rowIndex: pointer.rowIndex,
      },
      validationStatus: "VALID",
      title: row.title,
      author: row.author,
      titleNorm: row.titleNorm,
      authorNorm: row.authorNorm,
      isbn10: row.isbn10,
      isbn13: row.isbn13,
      rating: row.rating,
      reviewText: row.reviewText,
      shelfNames,
      exclusiveShelf: row.exclusiveShelf,
      dateAdded: row.dateAdded,
      dateRead: row.dateRead,
    };
  }
}
