import {
  createEditionEntityRef,
  createWorkEntityRef,
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntitySummary,
  type LiteraryEntityRef,
} from "../../../contracts/entityPlatform";
import type { ReaderContinuityDTO, ReaderRuntimeDTO } from "../../../types/readerRuntime.ts";
import type {
  ReaderFormat,
  ReaderManifestSnapshot,
} from "../../reader/runtime/contracts.ts";

export interface TrustedReaderEntityMetadata {
  readonly bookId: string;
  readonly title?: string;
  readonly authorDisplay?: string;
  readonly coverUrl?: string;
  readonly language?: string;
  readonly format?: ReaderFormat;
  readonly editionId?: string;
}

function createReaderWorkRef(bookId: string, displayHint?: string): LiteraryEntityRef {
  return createWorkEntityRef(bookId, {
    displayHint,
    provenance: {
      sourceClass: "system",
      sourceSystem: "reader",
      sourceId: bookId,
    },
  });
}

/**
 * Derives a Work ref from the Reader runtime DTO.
 *
 * ReaderRuntimeDTO remains the authoritative Reader model. This adapter is
 * pure and does not imply Reader identity migration.
 */
export function toLiteraryEntityRefFromReaderRuntime(
  runtime: ReaderRuntimeDTO
): LiteraryEntityRef {
  return createReaderWorkRef(runtime.bookId);
}

/**
 * Derives a Work ref from Reader continuity state.
 *
 * Reading continuity continues to use its existing bookId authority.
 */
export function toLiteraryEntityRefFromReaderContinuity(
  continuity: ReaderContinuityDTO
): LiteraryEntityRef {
  return createReaderWorkRef(continuity.bookId);
}

/**
 * Derives a Work ref from a Reader manifest snapshot.
 *
 * Manifest identity remains unchanged; the ref is compatibility metadata only.
 */
export function toLiteraryEntityRefFromManifest(
  manifest: ReaderManifestSnapshot
): LiteraryEntityRef {
  return createReaderWorkRef(manifest.bookId);
}

/**
 * Derives an optional Edition ref from trusted Reader display metadata.
 *
 * Edition refs are metadata only and never replace the Work ref.
 */
export function toEditionEntityRefFromReaderMetadata(
  metadata: TrustedReaderEntityMetadata
): LiteraryEntityRef | null {
  if (!metadata.editionId) return null;

  return createEditionEntityRef(metadata.editionId, {
    displayHint: metadata.title,
    languageHint: metadata.language,
    provenance: {
      sourceClass: "system",
      sourceSystem: "reader",
      sourceId: metadata.bookId,
    },
  });
}

/**
 * Derives a display summary from trusted Reader metadata.
 *
 * Title is required by EntitySummary and is not fabricated here. Author display
 * text remains a subtitle string and is not promoted into an Author ref.
 */
export function toEntitySummaryFromReaderMetadata(
  metadata: TrustedReaderEntityMetadata
): EntitySummary | null {
  if (!metadata.title) return null;

  const ref = createReaderWorkRef(metadata.bookId, metadata.title);
  const editionRef = toEditionEntityRefFromReaderMetadata(metadata);

  return {
    ref,
    title: metadata.title,
    authorityState: ref.authorityState,
    summaryVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
    ...(metadata.authorDisplay ? { subtitle: metadata.authorDisplay } : {}),
    ...(metadata.coverUrl ? { image: { url: metadata.coverUrl } } : {}),
    ...(metadata.language ? { language: metadata.language } : {}),
    navigation: "openable",
    typeSpecific: {
      sourceSystem: "reader",
      ...(metadata.format ? { format: metadata.format } : {}),
      ...(editionRef ? { editionRef } : {}),
    },
  };
}
