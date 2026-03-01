export type ReaderFormat = 'pdf' | 'epub' | 'unknown';
export type ReaderEngineKind =
  | 'web_pdf'
  | 'web_epub'
  | 'native_pdf'
  | 'native_epub'
  | 'unsupported';

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
}

export interface ReaderShellBootstrapResult {
  session: ReaderSessionSnapshot;
  manifest: ReaderManifestSnapshot | null;
}

export interface ReaderRuntimeSelection {
  engine: ReaderEngineKind;
  format: ReaderFormat;
}
