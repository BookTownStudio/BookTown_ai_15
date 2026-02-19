import { describe, expect, it } from "vitest";
import { buildRowKey, normalizeIsbn, parseCsvDateToIso, parseDsarUtcTimestampToIso } from "../goodreads/normalization";
import { detectSourceKind } from "../goodreads/sourceDetection";

type ZipEntryInput = {
  name: string;
  data: Buffer;
};

function createStoredZip(entries: ZipEntryInput[]): Buffer {
  const localFileRecords: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const fileNameBuffer = Buffer.from(entry.name, "utf8");
    const dataBuffer = entry.data;
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(fileNameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const localRecord = Buffer.concat([localHeader, fileNameBuffer, dataBuffer]);
    localFileRecords.push(localRecord);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(fileNameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralRecords.push(Buffer.concat([centralHeader, fileNameBuffer]));
    offset += localRecord.length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localFileRecords, centralDirectory, eocd]);
}

describe("goodreads import v2 core normalization", () => {
  it("parses supported deterministic CSV date formats", () => {
    expect(parseCsvDateToIso("02/19/2026")).toBe("2026-02-19T00:00:00.000Z");
    expect(parseCsvDateToIso("2026-02-19")).toBe("2026-02-19T00:00:00.000Z");
    expect(parseCsvDateToIso("2026/02/19")).toBeNull();
  });

  it("parses deterministic DSAR UTC timestamps", () => {
    expect(parseDsarUtcTimestampToIso("2015-11-09 15:30:10 UTC")).toBe(
      "2015-11-09T15:30:10.000Z"
    );
    expect(parseDsarUtcTimestampToIso("2015-11-09T15:30:10Z")).toBeNull();
  });

  it("validates ISBN checksum while normalizing", () => {
    expect(normalizeIsbn("9780306406157")).toBe("9780306406157");
    expect(normalizeIsbn("0-306-40615-2")).toBe("0306406152");
    expect(normalizeIsbn("9780306406158")).toBeNull();
  });

  it("builds rowKey deterministically regardless of shelf order", () => {
    const base = {
      titleNorm: "the-art-book",
      authorNorm: "phaidon",
      isbn10: null,
      isbn13: "9780714862733",
      rating: 5,
      reviewText: "Great.",
      exclusiveShelf: "read",
      dateRead: "2015-11-09T00:00:00.000Z",
    };
    const a = buildRowKey({
      ...base,
      shelfNames: ["owned", "read", "favorites"],
    });
    const b = buildRowKey({
      ...base,
      shelfNames: ["favorites", "read", "owned"],
    });
    expect(a).toBe(b);
  });
});

describe("goodreads import v2 source detection", () => {
  it("detects CSV from direct CSV source", () => {
    const csv = Buffer.from("Title,Author,Bookshelves\nThe Art Book,Phaidon,read\n", "utf8");
    const detected = detectSourceKind({
      fileType: "csv",
      buffer: csv,
    });
    expect(detected.detectedKind).toBe("CSV");
  });

  it("detects CSV from ZIP with goodreads_library_export.csv", () => {
    const csv = Buffer.from("Title,Author,Bookshelves\nThe Art Book,Phaidon,read\n", "utf8");
    const zip = createStoredZip([
      { name: "goodreads_library_export.csv", data: csv },
    ]);
    const detected = detectSourceKind({
      fileType: "zip",
      buffer: zip,
    });
    expect(detected.detectedKind).toBe("CSV");
    expect(detected.csvEntryName).toBe("goodreads_library_export.csv");
  });

  it("detects DSAR JSON bundle from nested review.zip", () => {
    const reviewJson = Buffer.from(
      JSON.stringify([
        { explanation: ["sample"] },
        { book: "The Art Book", review: "(not provided)", rating: 5, read_status: "read" },
      ]),
      "utf8"
    );
    const reviewZip = createStoredZip([{ name: "review.json", data: reviewJson }]);
    const outerZip = createStoredZip([{ name: "review.zip", data: reviewZip }]);

    const detected = detectSourceKind({
      fileType: "zip",
      buffer: outerZip,
    });
    expect(detected.detectedKind).toBe("DSAR_JSON");
  });

  it("rejects unsupported ZIP structure", () => {
    const unsupported = createStoredZip([
      { name: "notes.txt", data: Buffer.from("hello", "utf8") },
    ]);
    expect(() =>
      detectSourceKind({
        fileType: "zip",
        buffer: unsupported,
      })
    ).toThrowError(/UNSUPPORTED_SOURCE_FORMAT/);
  });
});
