import { describe, expect, it } from "vitest";
import {
  toEditionEntityRefFromReaderMetadata,
  toEntitySummaryFromReaderMetadata,
  toLiteraryEntityRefFromManifest,
  toLiteraryEntityRefFromReaderContinuity,
  toLiteraryEntityRefFromReaderRuntime,
  type TrustedReaderEntityMetadata,
} from "../../../lib/domain/reader/readerEntityAdapter.ts";
import type { ReaderContinuityDTO, ReaderRuntimeDTO } from "../../../types/readerRuntime.ts";
import type { ReaderManifestSnapshot } from "../../../lib/reader/runtime/contracts.ts";

function buildRuntime(overrides: Partial<ReaderRuntimeDTO> = {}): ReaderRuntimeDTO {
  return {
    bookId: "book_1",
    format: "epub",
    session: null,
    offlineRecord: null,
    ...overrides,
  };
}

function buildContinuity(overrides: Partial<ReaderContinuityDTO> = {}): ReaderContinuityDTO {
  return {
    bookId: "book_1",
    progress: 42,
    updatedAt: null,
    status_state: "reading",
    continuityLevel: "server",
    sourceType: "reading_progress",
    ...overrides,
  };
}

function buildManifest(overrides: Partial<ReaderManifestSnapshot> = {}): ReaderManifestSnapshot {
  return {
    bookId: "book_1",
    version: 2,
    pipelineVersion: "reader-pipeline-v1",
    format: "epub",
    estimatedPageCount: 320,
    locationMap: {
      version: "v1",
      mode: "logical",
      checkpointUnit: "spine_item",
    },
    searchIndex: {
      status: "ready",
      docPath: "reader_manifests/book_1/searchIndex",
    },
    highlightAnchors: {
      status: "ready",
      docPath: "reader_manifests/book_1/highlightAnchors",
    },
    generatedAtMs: 1_700_000_000_000,
    ...overrides,
  };
}

function buildMetadata(
  overrides: Partial<TrustedReaderEntityMetadata> = {}
): TrustedReaderEntityMetadata {
  return {
    bookId: "book_1",
    title: "Reader Book",
    authorDisplay: "Display Author",
    coverUrl: "https://example.test/cover.jpg",
    language: "en",
    format: "epub",
    editionId: "edition_1",
    ...overrides,
  };
}

describe("readerEntityAdapter", () => {
  it("maps ReaderRuntimeDTO to a Work LiteraryEntityRef using bookId", () => {
    expect(toLiteraryEntityRefFromReaderRuntime(buildRuntime())).toMatchObject({
      contractVersion: 1,
      entityType: "work",
      entityId: "book_1",
      authorityState: "canonical",
      authoritySource: "work_authority",
      provenance: {
        sourceClass: "system",
        sourceSystem: "reader",
        sourceId: "book_1",
      },
    });
  });

  it("maps ReaderContinuityDTO to a Work LiteraryEntityRef using bookId", () => {
    expect(toLiteraryEntityRefFromReaderContinuity(buildContinuity())).toMatchObject({
      entityType: "work",
      entityId: "book_1",
      authorityState: "canonical",
      authoritySource: "work_authority",
    });
  });

  it("maps ReaderManifestSnapshot to a Work LiteraryEntityRef using bookId", () => {
    expect(toLiteraryEntityRefFromManifest(buildManifest())).toMatchObject({
      entityType: "work",
      entityId: "book_1",
      authorityState: "canonical",
      authoritySource: "work_authority",
    });
  });

  it("derives EntitySummary from trusted Reader display metadata", () => {
    expect(toEntitySummaryFromReaderMetadata(buildMetadata())).toMatchObject({
      title: "Reader Book",
      subtitle: "Display Author",
      image: { url: "https://example.test/cover.jpg" },
      language: "en",
      navigation: "openable",
      ref: {
        entityType: "work",
        entityId: "book_1",
      },
      typeSpecific: {
        sourceSystem: "reader",
        format: "epub",
        editionRef: {
          entityType: "edition",
          entityId: "edition_1",
        },
      },
    });
  });

  it("does not fabricate EntitySummary when trusted title metadata is missing", () => {
    expect(toEntitySummaryFromReaderMetadata(buildMetadata({ title: undefined }))).toBeNull();
  });

  it("keeps author strings as display subtitle and does not create Author refs", () => {
    const summary = toEntitySummaryFromReaderMetadata(
      buildMetadata({ authorDisplay: "Display Author" })
    );

    expect(summary?.subtitle).toBe("Display Author");
    expect(JSON.stringify(summary)).not.toContain("\"entityType\":\"author\"");
  });

  it("derives optional Edition refs without replacing the Work ref", () => {
    const metadata = buildMetadata({
      bookId: "work_1",
      editionId: "edition_99",
    });

    const summary = toEntitySummaryFromReaderMetadata(metadata);
    const editionRef = toEditionEntityRefFromReaderMetadata(metadata);

    expect(summary?.ref).toMatchObject({
      entityType: "work",
      entityId: "work_1",
    });
    expect(editionRef).toMatchObject({
      entityType: "edition",
      entityId: "edition_99",
    });
  });

  it("returns null when no trusted edition identity exists", () => {
    expect(toEditionEntityRefFromReaderMetadata(buildMetadata({ editionId: undefined }))).toBeNull();
  });

  it("does not mutate Reader source DTOs or metadata", () => {
    const runtime = buildRuntime();
    const continuity = buildContinuity();
    const manifest = buildManifest();
    const metadata = buildMetadata();
    const before = {
      runtime: structuredClone(runtime),
      continuity: structuredClone(continuity),
      manifest: structuredClone(manifest),
      metadata: structuredClone(metadata),
    };

    toLiteraryEntityRefFromReaderRuntime(runtime);
    toLiteraryEntityRefFromReaderContinuity(continuity);
    toLiteraryEntityRefFromManifest(manifest);
    toEditionEntityRefFromReaderMetadata(metadata);
    toEntitySummaryFromReaderMetadata(metadata);

    expect({ runtime, continuity, manifest, metadata }).toEqual(before);
  });
});
