export type CanonicalSource = "googleBooks" | "openLibrary";
export type AcquisitionProvider =
  | "openLibrary"
  | "gutenberg"
  | "hindawi"
  | "gallica";
export type AcquisitionFormat = "epub" | "pdf";

export interface DownloadCandidate {
  format: AcquisitionFormat;
  url: string;
  mimeType: string;
}

export interface ProviderTrust {
  availabilityTrust: true;
  acquisitionTrust: true;
}

export interface ExternalReadableSourceRecord {
  provider: AcquisitionProvider;
  providerExternalId: string;
  lendingEditionId?: string;
  lendingIdentifier?: string;
  trust: "trusted";
}

export interface ExternalReadableCandidate {
  provider: AcquisitionProvider;
  providerExternalId: string;
  title: string;
  language: string;
  trust: ProviderTrust;
  candidates: DownloadCandidate[];
  persistedSource?: ExternalReadableSourceRecord;
}

export interface SourceHint {
  source: CanonicalSource;
  providerExternalId: string;
}

export interface ProviderLookupContext {
  bookId: string;
  book: Record<string, unknown>;
  editionId: string | null;
  sourceHint: SourceHint | null;
}
