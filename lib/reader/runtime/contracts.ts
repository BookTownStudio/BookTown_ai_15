export type ReaderFormat = 'pdf' | 'epub' | 'unknown';
export type NarrationProviderKind = 'browser_speech_synthesis';
export type ReaderEngineKind =
  | 'web_pdf'
  | 'web_epub'
  | 'native_pdf'
  | 'native_epub'
  | 'unsupported';

export type ReaderManifestIndexStatus = 'pending' | 'ready';

export type EpubCanonicalLocationPayload = string | unknown[];

export interface ReaderManifestLocationIdentityV1 {
  bookId: string;
  manifestVersion: number;
  pipelineVersion: string;
  sourceSignatureHash: string;
  generationChars: number;
}

export interface ReaderManifestLocationMapV1 {
  version: 'v1';
  mode: 'page' | 'logical';
  checkpointUnit: 'page' | 'spine_item';
  status?: ReaderManifestIndexStatus;
  docPath?: string;
  anchorSchema?: 'canonical_anchor_v1';
  source?: 'server_precomputed' | 'runtime_generated';
  identity?: ReaderManifestLocationIdentityV1;
  generationChars?: number;
  locationCount?: number;
  payload?: EpubCanonicalLocationPayload;
}

export interface ReaderManifestIndexState {
  status: ReaderManifestIndexStatus;
  docPath: string;
  schemaVersion?: 'v1';
}

export type CanonicalAnchorV1 =
  | {
      kind: 'epub_point';
      manifestVersion: number;
      locationId: string;
      spineItemId: string;
      cfi: string;
    }
  | {
      kind: 'epub_range';
      manifestVersion: number;
      startLocationId: string;
      endLocationId: string;
      spineItemId: string;
      startCfi: string;
      endCfi: string;
    }
  | {
      kind: 'pdf_point';
      manifestVersion: number;
      locationId: string;
      pageIndex: number;
      textOffset: number;
    }
  | {
      kind: 'pdf_range';
      manifestVersion: number;
      startLocationId: string;
      endLocationId: string;
      pageIndex: number;
      startOffset: number;
      endOffset: number;
      quote: string;
      prefix: string;
      suffix: string;
    };

export interface ReaderManifestSnapshot {
  bookId: string;
  version: number;
  pipelineVersion: string;
  format: ReaderFormat;
  estimatedPageCount: number | null;
  locationMap: ReaderManifestLocationMapV1;
  searchIndex: ReaderManifestIndexState;
  highlightAnchors: ReaderManifestIndexState;
  chapterMap?: ReaderManifestIndexState;
  sectionMap?: ReaderManifestIndexState;
  stableAnchors?: ReaderManifestIndexState;
  spineMap?: ReaderManifestIndexState;
  sectionGraph?: ReaderManifestIndexState;
  stableAnchorMap?: ReaderManifestIndexState;
  navigationIndex?: ReaderManifestIndexState;
  paginationHints?: ReaderManifestIndexState;
  literaryCoordinateMap?: ReaderManifestIndexState;
  passageIndex?: ReaderManifestIndexState;
  annotationIdentityIndex?: ReaderManifestIndexState;
  literaryMemoryPrimitives?: ReaderManifestIndexState;
  generatedAtMs: number;
}

export interface ReaderSectionGraphNode {
  sectionId: string;
  spineIndex: number;
  href: string;
  title: string | null;
  parentSectionId: string | null;
  childSectionIds: string[];
}

export interface ReaderSectionGraphSnapshot {
  schemaVersion: 'v1';
  bookId: string;
  manifestVersion: number;
  sourceSignatureHash: string;
  sections: ReaderSectionGraphNode[];
}

export interface ReaderSessionSnapshot {
  signedUrl: string;
  resumePage: number;
  format: ReaderFormat;
  lastPosition?: ReaderLastPosition | null;
  resumeAnchor?: CanonicalAnchorV1 | null;
  continuity?: {
    mode: 'anchor' | 'approximate_position' | 'start';
    approximate: boolean;
    manifestVersion: number;
    anchorSource?: 'reading_progress' | 'reading_sessions' | null;
  };
  narration?: ReaderNarrationSessionState | null;
}

export interface ReaderShellBootstrapResult {
  session: ReaderSessionSnapshot;
  manifest: ReaderManifestSnapshot | null;
}

export interface ReaderRuntimeSelection {
  engine: ReaderEngineKind;
  format: ReaderFormat;
}

export interface ReaderNarrationSessionState {
  provider: NarrationProviderKind;
  playbackRate: number;
  paused: boolean;
}

export interface ReaderLastPosition {
  page: number;
  totalPages?: number | null;
  format?: ReaderFormat | null;
  mode?: 'scroll' | 'page' | null;
  paragraphIndex?: number | null;
}

export interface ReaderNarrationParagraph {
  id: string;
  text: string;
  page: number;
}

export interface ReaderNarrationSnapshot {
  paragraphs: ReaderNarrationParagraph[];
  currentParagraphIndex: number;
  capturedAtMs: number;
}

export interface ReaderTextSelection {
  quote: string;
  page: number;
  cfi: string;
  rect: DOMRect;
}

export interface ReaderHighlightOverlay {
  highlightId: string;
  cfi: string | null;
  color: string;
  page: number | null;
  quote: string;
}
