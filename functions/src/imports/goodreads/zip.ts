import { inflateRawSync } from "zlib";

export type ZipEntry = {
  fileName: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

function findEocdOffset(zipBuffer: Buffer): number {
  for (let i = zipBuffer.length - 22; i >= 0; i -= 1) {
    if (zipBuffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      return i;
    }
  }
  return -1;
}

export function listZipEntries(zipBuffer: Buffer): ZipEntry[] {
  const eocdOffset = findEocdOffset(zipBuffer);
  if (eocdOffset < 0) {
    throw new Error("Invalid ZIP: EOCD not found.");
  }

  const cdirSize = zipBuffer.readUInt32LE(eocdOffset + 12);
  const cdirOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  const cdirEnd = cdirOffset + cdirSize;
  if (cdirOffset < 0 || cdirEnd > zipBuffer.length) {
    throw new Error("Invalid ZIP: central directory range.");
  }

  const entries: ZipEntry[] = [];
  let ptr = cdirOffset;
  while (ptr + 46 <= cdirEnd) {
    const signature = zipBuffer.readUInt32LE(ptr);
    if (signature !== CENTRAL_DIR_SIGNATURE) {
      break;
    }

    const compressionMethod = zipBuffer.readUInt16LE(ptr + 10);
    const compressedSize = zipBuffer.readUInt32LE(ptr + 20);
    const uncompressedSize = zipBuffer.readUInt32LE(ptr + 24);
    const fileNameLength = zipBuffer.readUInt16LE(ptr + 28);
    const extraLength = zipBuffer.readUInt16LE(ptr + 30);
    const commentLength = zipBuffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(ptr + 42);
    const fileName = zipBuffer
      .subarray(ptr + 46, ptr + 46 + fileNameLength)
      .toString("utf8");

    entries.push({
      fileName,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    ptr += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

export function extractZipEntryBuffer(
  zipBuffer: Buffer,
  entry: ZipEntry,
  maxUncompressedBytes: number
): Buffer {
  if (entry.localHeaderOffset + 30 > zipBuffer.length) {
    throw new Error("Invalid ZIP: local header offset.");
  }
  if (zipBuffer.readUInt32LE(entry.localHeaderOffset) !== LOCAL_FILE_SIGNATURE) {
    throw new Error("Invalid ZIP: local header signature.");
  }

  const localFileNameLength = zipBuffer.readUInt16LE(entry.localHeaderOffset + 26);
  const localExtraLength = zipBuffer.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + localFileNameLength + localExtraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > zipBuffer.length) {
    throw new Error("Invalid ZIP: compressed data range.");
  }

  const compressed = zipBuffer.subarray(dataStart, dataEnd);
  let output: Buffer;
  if (entry.compressionMethod === 0) {
    output = Buffer.from(compressed);
  } else if (entry.compressionMethod === 8) {
    output = inflateRawSync(compressed);
  } else {
    throw new Error(`Unsupported ZIP compression method: ${entry.compressionMethod}`);
  }

  if (output.length > maxUncompressedBytes) {
    throw new Error("ZIP entry exceeds uncompressed size limit.");
  }

  return output;
}
