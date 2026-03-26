export type ReaderFormat = 'pdf' | 'epub' | 'unknown';
export type ReaderEngineKind =
  | 'web_pdf'
  | 'web_epub'
  | 'native_pdf'
  | 'native_epub'
  | 'unsupported';

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
  locationMap: {
    version: 'v1';
    mode: 'page' | 'logical';
    checkpointUnit: 'page' | 'spine_item';
    status?: 'pending' | 'ready';
    docPath?: string;
    anchorSchema?: 'canonical_anchor_v1';
  };
  searchIndex: {
    status: 'pending' | 'ready';
    docPath: string;
  };
  highlightAnchors: {
    status: 'pending' | 'ready';
    docPath: string;
  };
  generatedAtMs: number;
}

export interface ReaderSessionSnapshot {
  signedUrl: string;
  resumePage: number;
  format: ReaderFormat;
  resumeAnchor?: CanonicalAnchorV1 | null;
}

export interface ReaderShellBootstrapResult {
  session: ReaderSessionSnapshot;
  manifest: ReaderManifestSnapshot | null;
}

export interface ReaderRuntimeSelection {
  engine: ReaderEngineKind;
  format: ReaderFormat;
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
