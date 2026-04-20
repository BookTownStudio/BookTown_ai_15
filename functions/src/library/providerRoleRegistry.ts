export type ProviderRole =
  | "direct_authority"
  | "restricted_authority"
  | "author_only_authority"
  | "weighted_evidence"
  | "ebook_source_only"
  | "enrichment_only";

export type RegisteredProviderId =
  | "openLibrary"
  | "googleBooks"
  | "loc"
  | "viaf"
  | "wikidata"
  | "worldcat"
  | "isbndb"
  | "gutenberg"
  | "gallica"
  | "hindawi"
  | "internetArchive"
  | "bnf"
  | "britishLibrary"
  | "dnb"
  | "ndl";

export type AcceptedAuthorityLabel =
  | "manualAuthority"
  | "openLibrary"
  | "wikidata"
  | "googleBooks";

export type ProviderAuthorityField =
  | "canonicalTitle"
  | "canonicalAuthorIds"
  | "canonicalKey"
  | "originalLanguage"
  | "workIdentity"
  | "originalTitle"
  | "locControlNumber"
  | "oclcNumber"
  | "editionCountSupport"
  | "publicationYear"
  | "publisher"
  | "languageEvidence"
  | "formatEvidence";

export type ProviderAuthorField =
  | "viafId"
  | "wikidataQid"
  | "canonicalAuthorAliases"
  | "weightedAuthorAliases"
  | "normalizedMultilingualNames"
  | "birthYear"
  | "deathYear"
  | "externalAuthorityLinks"
  | "authorityConfidenceSupport";

type ProviderRoleRecord = {
  role: ProviderRole;
  acceptedAuthority: AcceptedAuthorityLabel | null;
  authorityRank: number;
  canEnterCanonicalBookWritePath: boolean;
  canEnrichExistingCanonicalBook: boolean;
  canScoreCanonicalWork: boolean;
  canAffectAuthorLayer: boolean;
  canServeTrustedReadableSource: boolean;
  allowedAuthorityFields: ProviderAuthorityField[];
  allowedAuthorFields: ProviderAuthorField[];
};

const ACCEPTED_AUTHORITY_RANKS: Record<AcceptedAuthorityLabel, number> = {
  manualAuthority: 400,
  openLibrary: 300,
  wikidata: 200,
  googleBooks: 100,
};

export const PROVIDER_ROLE_REGISTRY: Record<
  RegisteredProviderId,
  ProviderRoleRecord
> = {
  openLibrary: {
    role: "direct_authority",
    acceptedAuthority: "openLibrary",
    authorityRank: 300,
    canEnterCanonicalBookWritePath: true,
    canEnrichExistingCanonicalBook: false,
    canScoreCanonicalWork: true,
    canAffectAuthorLayer: true,
    canServeTrustedReadableSource: true,
    allowedAuthorityFields: [
      "canonicalTitle",
      "canonicalAuthorIds",
      "canonicalKey",
      "originalLanguage",
      "workIdentity",
    ],
    allowedAuthorFields: [],
  },
  googleBooks: {
    role: "direct_authority",
    acceptedAuthority: "googleBooks",
    authorityRank: 100,
    canEnterCanonicalBookWritePath: true,
    canEnrichExistingCanonicalBook: false,
    canScoreCanonicalWork: true,
    canAffectAuthorLayer: true,
    canServeTrustedReadableSource: false,
    allowedAuthorityFields: [
      "canonicalTitle",
      "canonicalAuthorIds",
      "canonicalKey",
      "originalLanguage",
      "workIdentity",
    ],
    allowedAuthorFields: [],
  },
  loc: {
    role: "restricted_authority",
    acceptedAuthority: null,
    authorityRank: 0,
    canEnterCanonicalBookWritePath: false,
    canEnrichExistingCanonicalBook: true,
    canScoreCanonicalWork: false,
    canAffectAuthorLayer: false,
    canServeTrustedReadableSource: false,
    allowedAuthorityFields: [
      "originalTitle",
      "locControlNumber",
      "publicationYear",
      "publisher",
      "languageEvidence",
    ],
    allowedAuthorFields: [],
  },
  viaf: {
    role: "author_only_authority",
    acceptedAuthority: null,
    authorityRank: 0,
    canEnterCanonicalBookWritePath: false,
    canEnrichExistingCanonicalBook: false,
    canScoreCanonicalWork: false,
    canAffectAuthorLayer: true,
    canServeTrustedReadableSource: false,
    allowedAuthorityFields: [],
    allowedAuthorFields: [
      "viafId",
      "canonicalAuthorAliases",
      "normalizedMultilingualNames",
      "birthYear",
      "deathYear",
      "authorityConfidenceSupport",
    ],
  },
  wikidata: {
    role: "weighted_evidence",
    acceptedAuthority: "wikidata",
    authorityRank: 200,
    canEnterCanonicalBookWritePath: false,
    canEnrichExistingCanonicalBook: false,
    canScoreCanonicalWork: true,
    canAffectAuthorLayer: true,
    canServeTrustedReadableSource: false,
    allowedAuthorityFields: [],
    allowedAuthorFields: [
      "wikidataQid",
      "weightedAuthorAliases",
      "normalizedMultilingualNames",
      "birthYear",
      "deathYear",
      "externalAuthorityLinks",
      "authorityConfidenceSupport",
    ],
  },
  worldcat: {
    role: "weighted_evidence",
    acceptedAuthority: null,
    authorityRank: 0,
    canEnterCanonicalBookWritePath: false,
    canEnrichExistingCanonicalBook: true,
    canScoreCanonicalWork: true,
    canAffectAuthorLayer: false,
    canServeTrustedReadableSource: false,
    allowedAuthorityFields: [
      "oclcNumber",
      "editionCountSupport",
      "publicationYear",
      "publisher",
      "languageEvidence",
      "formatEvidence",
    ],
    allowedAuthorFields: [],
  },
  isbndb: {
    role: "weighted_evidence",
    acceptedAuthority: null,
    authorityRank: 0,
    canEnterCanonicalBookWritePath: false,
    canEnrichExistingCanonicalBook: false,
    canScoreCanonicalWork: true,
    canAffectAuthorLayer: false,
    canServeTrustedReadableSource: false,
    allowedAuthorityFields: [],
    allowedAuthorFields: [],
  },
  gutenberg: {
    role: "ebook_source_only",
    acceptedAuthority: null,
    authorityRank: 0,
    canEnterCanonicalBookWritePath: false,
    canEnrichExistingCanonicalBook: false,
    canScoreCanonicalWork: false,
    canAffectAuthorLayer: false,
    canServeTrustedReadableSource: true,
    allowedAuthorityFields: [],
    allowedAuthorFields: [],
  },
  gallica: {
    role: "ebook_source_only",
    acceptedAuthority: null,
    authorityRank: 0,
    canEnterCanonicalBookWritePath: false,
    canEnrichExistingCanonicalBook: false,
    canScoreCanonicalWork: false,
    canAffectAuthorLayer: false,
    canServeTrustedReadableSource: true,
    allowedAuthorityFields: [],
    allowedAuthorFields: [],
  },
  hindawi: {
    role: "ebook_source_only",
    acceptedAuthority: null,
    authorityRank: 0,
    canEnterCanonicalBookWritePath: false,
    canEnrichExistingCanonicalBook: false,
    canScoreCanonicalWork: false,
    canAffectAuthorLayer: false,
    canServeTrustedReadableSource: true,
    allowedAuthorityFields: [],
    allowedAuthorFields: [],
  },
  internetArchive: {
    role: "ebook_source_only",
    acceptedAuthority: null,
    authorityRank: 0,
    canEnterCanonicalBookWritePath: false,
    canEnrichExistingCanonicalBook: false,
    canScoreCanonicalWork: false,
    canAffectAuthorLayer: false,
    canServeTrustedReadableSource: true,
    allowedAuthorityFields: [],
    allowedAuthorFields: [],
  },
  bnf: {
    role: "enrichment_only",
    acceptedAuthority: null,
    authorityRank: 0,
    canEnterCanonicalBookWritePath: false,
    canEnrichExistingCanonicalBook: false,
    canScoreCanonicalWork: false,
    canAffectAuthorLayer: false,
    canServeTrustedReadableSource: false,
    allowedAuthorityFields: [],
    allowedAuthorFields: [],
  },
  britishLibrary: {
    role: "enrichment_only",
    acceptedAuthority: null,
    authorityRank: 0,
    canEnterCanonicalBookWritePath: false,
    canEnrichExistingCanonicalBook: false,
    canScoreCanonicalWork: false,
    canAffectAuthorLayer: false,
    canServeTrustedReadableSource: false,
    allowedAuthorityFields: [],
    allowedAuthorFields: [],
  },
  dnb: {
    role: "enrichment_only",
    acceptedAuthority: null,
    authorityRank: 0,
    canEnterCanonicalBookWritePath: false,
    canEnrichExistingCanonicalBook: false,
    canScoreCanonicalWork: false,
    canAffectAuthorLayer: false,
    canServeTrustedReadableSource: false,
    allowedAuthorityFields: [],
    allowedAuthorFields: [],
  },
  ndl: {
    role: "enrichment_only",
    acceptedAuthority: null,
    authorityRank: 0,
    canEnterCanonicalBookWritePath: false,
    canEnrichExistingCanonicalBook: false,
    canScoreCanonicalWork: false,
    canAffectAuthorLayer: false,
    canServeTrustedReadableSource: false,
    allowedAuthorityFields: [],
    allowedAuthorFields: [],
  },
};

export function isRegisteredProvider(value: string): value is RegisteredProviderId {
  return value in PROVIDER_ROLE_REGISTRY;
}

export function getProviderRole(value: string): ProviderRole | null {
  return isRegisteredProvider(value) ? PROVIDER_ROLE_REGISTRY[value].role : null;
}

export function canProviderEnterCanonicalBookWritePath(value: string): boolean {
  return isRegisteredProvider(value)
    ? PROVIDER_ROLE_REGISTRY[value].canEnterCanonicalBookWritePath
    : false;
}

export function canProviderEnrichExistingCanonicalBook(value: string): boolean {
  return isRegisteredProvider(value)
    ? PROVIDER_ROLE_REGISTRY[value].canEnrichExistingCanonicalBook
    : false;
}

export function assertProviderCanEnterCanonicalBookWritePath(value: string): void {
  if (!canProviderEnterCanonicalBookWritePath(value)) {
    throw new Error(`[PROVIDER_ROLE] ${value} may not enter canonical book write path.`);
  }
}

export function canProviderAffectAuthorLayer(value: string): boolean {
  return isRegisteredProvider(value)
    ? PROVIDER_ROLE_REGISTRY[value].canAffectAuthorLayer
    : false;
}

export function assertProviderCanAffectAuthorLayer(value: string): void {
  if (!canProviderAffectAuthorLayer(value)) {
    throw new Error(`[PROVIDER_ROLE] ${value} may not enter canonical author write path.`);
  }
}

export function getAcceptedAuthorityForProvider(
  value: string
): AcceptedAuthorityLabel | null {
  return isRegisteredProvider(value)
    ? PROVIDER_ROLE_REGISTRY[value].acceptedAuthority
    : null;
}

export function getAcceptedAuthorityRank(
  value: AcceptedAuthorityLabel | string
): number {
  return value in ACCEPTED_AUTHORITY_RANKS
    ? ACCEPTED_AUTHORITY_RANKS[value as AcceptedAuthorityLabel]
    : 0;
}

export function getProviderAuthorityRank(value: string): number {
  return isRegisteredProvider(value) ? PROVIDER_ROLE_REGISTRY[value].authorityRank : 0;
}

export function isDirectAuthorityProvider(value: string): boolean {
  return getProviderRole(value) === "direct_authority";
}

export function isRestrictedAuthorityProvider(value: string): boolean {
  return getProviderRole(value) === "restricted_authority";
}

export function isWeightedEvidenceProvider(value: string): boolean {
  return getProviderRole(value) === "weighted_evidence";
}

export function canProviderServeTrustedReadableSource(value: string): boolean {
  return isRegisteredProvider(value)
    ? PROVIDER_ROLE_REGISTRY[value].canServeTrustedReadableSource
    : false;
}

export function getProviderAllowedAuthorityFields(
  value: string
): ProviderAuthorityField[] {
  return isRegisteredProvider(value)
    ? [...PROVIDER_ROLE_REGISTRY[value].allowedAuthorityFields]
    : [];
}

export function getProviderAllowedAuthorFields(
  value: string
): ProviderAuthorField[] {
  return isRegisteredProvider(value)
    ? [...PROVIDER_ROLE_REGISTRY[value].allowedAuthorFields]
    : [];
}
