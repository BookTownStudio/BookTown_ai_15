import { Readable } from "stream";
import { StringDecoder } from "string_decoder";
import type { CanonicalImportRow, CsvRow, ParseIssue } from "../types";
import {
  buildRowKey,
  normalizeIsbn,
  normalizePlaceholder,
  normalizeReviewText,
  normalizedCanonicalTitleAndAuthor,
  parseCsvDateToIso,
  parseRating,
  parseShelfNames,
  sha256Hex,
  toIdentityKey,
  trimTo,
} from "../normalization";
import { extractZipEntryBuffer, listZipEntries } from "../zip";

const MAX_REVIEW_LENGTH = 4000;

type StorageFileLike = {
  createReadStream: () => Readable;
  download: () => Promise<[Buffer]>;
};

type StorageBucketLike = {
  file: (path: string) => StorageFileLike;
};

type CsvHeaderInfo = {
  headerMap: Map<string, number>;
  headers: string[];
};

function toHeaderKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function pickField(values: string[], headerMap: Map<string, number>, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const idx = headerMap.get(toHeaderKey(candidate));
    if (idx === undefined) continue;
    const value = values[idx];
    if (typeof value === "string") return value;
  }
  return null;
}

function validateRequiredHeaderSet(info: CsvHeaderInfo): void {
  const hasTitle = info.headerMap.has(toHeaderKey("title")) || info.headerMap.has(toHeaderKey("book title"));
  const hasAuthor =
    info.headerMap.has(toHeaderKey("author")) ||
    info.headerMap.has(toHeaderKey("author l-f")) ||
    info.headerMap.has(toHeaderKey("additional authors"));
  const hasShelves =
    info.headerMap.has(toHeaderKey("bookshelves")) ||
    info.headerMap.has(toHeaderKey("exclusive shelf"));
  if (!hasTitle || !hasAuthor || !hasShelves) {
    throw new Error("SCHEMA_VALIDATION_FAILED: Missing required Goodreads CSV columns.");
  }
}

function getHeaderInfo(header: string[]): CsvHeaderInfo {
  const headerMap = new Map<string, number>();
  header.forEach((value, index) => {
    const key = toHeaderKey(value);
    if (!headerMap.has(key)) {
      headerMap.set(key, index);
    }
  });
  return {
    headerMap,
    headers: header,
  };
}

async function* parseCsvRecordsFromStream(stream: Readable): AsyncGenerator<string[]> {
  const decoder = new StringDecoder("utf8");
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let pendingQuote = false;

  const emitRow = (): string[] | null => {
    if (row.length === 0 && field.length === 0) return null;
    const out = [...row, field];
    row = [];
    field = "";
    return out;
  };

  for await (const chunk of stream) {
    const text = decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];

      if (pendingQuote) {
        if (char === "\"") {
          field += "\"";
          pendingQuote = false;
          continue;
        }
        inQuotes = false;
        pendingQuote = false;
      }

      if (inQuotes) {
        if (char === "\"") {
          if (i + 1 < text.length) {
            if (text[i + 1] === "\"") {
              field += "\"";
              i += 1;
            } else {
              inQuotes = false;
            }
          } else {
            pendingQuote = true;
          }
          continue;
        }
        field += char;
        continue;
      }

      if (char === "\"") {
        inQuotes = true;
        continue;
      }

      if (char === ",") {
        row.push(field);
        field = "";
        continue;
      }

      if (char === "\n") {
        const out = emitRow();
        if (out) yield out;
        continue;
      }

      if (char === "\r") {
        continue;
      }

      field += char;
    }
  }

  const tail = decoder.end();
  if (tail) {
    field += tail;
  }

  if (pendingQuote) {
    inQuotes = false;
    pendingQuote = false;
  }

  if (inQuotes) {
    throw new Error("SCHEMA_VALIDATION_FAILED: Malformed CSV with unclosed quote.");
  }

  const out = row.length > 0 || field.length > 0 ? [...row, field] : null;
  if (out) yield out;
}

function selectCsvZipEntry(zipBuffer: Buffer, preferredEntryName?: string): string {
  const entries = listZipEntries(zipBuffer)
    .map((entry) => entry.fileName)
    .filter((name) => name.toLowerCase().endsWith(".csv"));
  if (entries.length === 0) {
    throw new Error("SCHEMA_VALIDATION_FAILED: ZIP does not contain a CSV entry.");
  }

  if (preferredEntryName) {
    const preferred = entries.find(
      (name) => name.toLowerCase() === preferredEntryName.toLowerCase()
    );
    if (preferred) return preferred;
  }

  const defaultEntry = entries.find(
    (name) => name.toLowerCase().endsWith("goodreads_library_export.csv")
  );
  return defaultEntry || entries[0];
}

function createCanonicalCsvRow(
  row: CsvRow,
  headerMap: Map<string, number>,
  csvEntryName: string
): CanonicalImportRow | ParseIssue {
  const titleRaw = pickField(row.values, headerMap, ["title", "book title"]) || "";
  const authorRaw =
    pickField(row.values, headerMap, ["author", "author l-f", "authorlf"]) ||
    pickField(row.values, headerMap, ["additional authors"]) ||
    "";

  const isbn13 = normalizeIsbn(pickField(row.values, headerMap, ["isbn13", "isbn 13"]));
  const isbn10 = normalizeIsbn(pickField(row.values, headerMap, ["isbn", "isbn10", "isbn 10"]));
  const rating = parseRating(pickField(row.values, headerMap, ["my rating", "rating"]));
  const reviewText = normalizeReviewText(
    pickField(row.values, headerMap, ["my review", "review"]),
    MAX_REVIEW_LENGTH
  );
  const exclusiveShelfRaw = normalizePlaceholder(
    trimTo(pickField(row.values, headerMap, ["exclusive shelf"]) || "", 120)
  );
  const shelvesRaw = parseShelfNames(
    pickField(row.values, headerMap, ["bookshelves", "shelves"])
  );
  const dateAdded = parseCsvDateToIso(pickField(row.values, headerMap, ["date added"]));
  const dateRead = parseCsvDateToIso(pickField(row.values, headerMap, ["date read"]));

  const title = trimTo(titleRaw, 300);
  const author = trimTo(authorRaw, 240);
  const { titleNorm, authorNorm } = normalizedCanonicalTitleAndAuthor({
    title,
    author,
  });

  if (!titleNorm) {
    return {
      rowIndex: row.rowIndex,
      rowKey: sha256Hex(`csv:${row.rowIndex}:missing-title`),
      code: "ROW_VALIDATION_FAILED",
      message: "Missing title.",
    };
  }

  if (!isbn13 && !isbn10 && !authorNorm) {
    return {
      rowIndex: row.rowIndex,
      rowKey: sha256Hex(`csv:${row.rowIndex}:missing-author`),
      code: "LOW_CONFIDENCE_MATCH_REJECTED",
      message: "Missing author and ISBN for strict matching.",
    };
  }

  const exclusiveShelf = exclusiveShelfRaw || null;
  const shelfNames = Array.from(
    new Set([...shelvesRaw, ...(exclusiveShelf ? [exclusiveShelf] : [])])
  ).slice(0, 24);

  const rowKey = buildRowKey({
    titleNorm,
    authorNorm: authorNorm || "unknown",
    isbn10,
    isbn13,
    rating,
    reviewText,
    exclusiveShelf,
    dateRead,
    shelfNames,
  });

  return {
    rowIndex: row.rowIndex,
    rowKey,
    identityKey: toIdentityKey({
      isbn13,
      isbn10,
      titleNorm,
      authorNorm: authorNorm || "unknown",
    }),
    sourceKind: "CSV",
    rawPointer: {
      sourceKind: "CSV",
      entry: csvEntryName,
      rowIndex: row.rowIndex,
    },
    validationStatus: "VALID",
    title,
    author: author || "Unknown",
    titleNorm,
    authorNorm: authorNorm || "unknown",
    isbn10,
    isbn13,
    rating,
    reviewText,
    shelfNames,
    exclusiveShelf,
    dateAdded,
    dateRead,
  };
}

export async function* iterateCsvCanonicalRows(params: {
  bucket: StorageBucketLike;
  sourcePath: string;
  fileType: "csv" | "zip";
  preferredCsvEntryName?: string;
}): AsyncGenerator<CanonicalImportRow | ParseIssue> {
  const file = params.bucket.file(params.sourcePath);
  let csvEntryName = params.sourcePath.split("/").pop() || "source.csv";
  let stream: Readable;
  if (params.fileType === "csv") {
    stream = file.createReadStream();
  } else {
    const [zipBuffer] = await file.download();
    const selectedEntryName = selectCsvZipEntry(zipBuffer, params.preferredCsvEntryName);
    const entry = listZipEntries(zipBuffer).find(
      (item) => item.fileName.toLowerCase() === selectedEntryName.toLowerCase()
    );
    if (!entry) {
      throw new Error("SCHEMA_VALIDATION_FAILED: CSV entry not found.");
    }
    const csvBuffer = extractZipEntryBuffer(zipBuffer, entry, 30 * 1024 * 1024);
    csvEntryName = selectedEntryName;
    stream = Readable.from(csvBuffer);
  }

  let headerInfo: CsvHeaderInfo | null = null;
  let rowIndex = 0;
  for await (const values of parseCsvRecordsFromStream(stream)) {
    rowIndex += 1;
    if (!headerInfo) {
      headerInfo = getHeaderInfo(values);
      validateRequiredHeaderSet(headerInfo);
      continue;
    }

    yield createCanonicalCsvRow(
      {
        rowIndex,
        values,
      },
      headerInfo.headerMap,
      csvEntryName
    );
  }
}

export function csvBufferLooksSupported(csvBuffer: Buffer): boolean {
  const head = csvBuffer.toString("utf8", 0, Math.min(csvBuffer.length, 32 * 1024));
  const firstLine = head.split(/\r?\n/)[0] || "";
  const keys = firstLine
    .split(",")
    .map((part) => part.replace(/^"|"$/g, "").trim())
    .map((part) => toHeaderKey(part));
  const headerSet = new Set(keys);
  const hasTitle = headerSet.has(toHeaderKey("title")) || headerSet.has(toHeaderKey("book title"));
  const hasAuthor =
    headerSet.has(toHeaderKey("author")) ||
    headerSet.has(toHeaderKey("author l-f")) ||
    headerSet.has(toHeaderKey("additional authors"));
  const hasShelves =
    headerSet.has(toHeaderKey("bookshelves")) ||
    headerSet.has(toHeaderKey("exclusive shelf"));
  return hasTitle && hasAuthor && hasShelves;
}
