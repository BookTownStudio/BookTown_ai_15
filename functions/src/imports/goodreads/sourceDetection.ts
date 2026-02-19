import { createHash } from "crypto";
import type { ImportFileType, SourceDetectionResult } from "./types";
import { csvBufferLooksSupported } from "./adapters/csvLibraryAdapter";
import { extractZipEntryBuffer, listZipEntries } from "./zip";

function hasDsrMarkersInZipNames(entryNames: string[]): boolean {
  const set = new Set(entryNames.map((name) => name.toLowerCase()));
  return set.has("review.zip") || set.has("owned_book.zip");
}

function findCsvEntryName(entryNames: string[]): string | null {
  const csvEntries = entryNames.filter((name) => name.toLowerCase().endsWith(".csv"));
  if (csvEntries.length === 0) return null;
  const preferred = csvEntries.find((name) =>
    name.toLowerCase().endsWith("goodreads_library_export.csv")
  );
  return preferred || csvEntries[0];
}

function nestedZipContainsJsonMarkers(zipBuffer: Buffer): boolean {
  const entries = listZipEntries(zipBuffer);
  const nestedZipEntries = entries.filter((entry) =>
    entry.fileName.toLowerCase().endsWith(".zip")
  );
  for (const nestedEntry of nestedZipEntries) {
    if (
      nestedEntry.fileName.toLowerCase() !== "review.zip" &&
      nestedEntry.fileName.toLowerCase() !== "owned_book.zip"
    ) {
      continue;
    }
    const nestedBuffer = extractZipEntryBuffer(zipBuffer, nestedEntry, 30 * 1024 * 1024);
    const nestedNames = listZipEntries(nestedBuffer).map((entry) =>
      entry.fileName.toLowerCase()
    );
    if (nestedNames.includes("review.json") || nestedNames.includes("owned_book.json")) {
      return true;
    }
  }
  return false;
}

export function detectSourceKind(params: {
  fileType: ImportFileType;
  buffer: Buffer;
}): SourceDetectionResult {
  if (params.fileType === "csv") {
    if (!csvBufferLooksSupported(params.buffer)) {
      throw new Error("SCHEMA_VALIDATION_FAILED: Unsupported CSV schema.");
    }
    return { detectedKind: "CSV" };
  }

  const entries = listZipEntries(params.buffer);
  const entryNames = entries.map((entry) => entry.fileName);
  const csvEntryName = findCsvEntryName(entryNames);
  if (csvEntryName) {
    const csvEntry = entries.find((entry) => entry.fileName === csvEntryName);
    if (!csvEntry) {
      throw new Error("SCHEMA_VALIDATION_FAILED: CSV entry metadata missing.");
    }
    const csvBuffer = extractZipEntryBuffer(params.buffer, csvEntry, 30 * 1024 * 1024);
    if (csvBufferLooksSupported(csvBuffer)) {
      return {
        detectedKind: "CSV",
        csvEntryName,
      };
    }
  }

  if (hasDsrMarkersInZipNames(entryNames) && nestedZipContainsJsonMarkers(params.buffer)) {
    return { detectedKind: "DSAR_JSON" };
  }

  throw new Error("UNSUPPORTED_SOURCE_FORMAT: Could not detect supported Goodreads source.");
}

export function sha256ForBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
