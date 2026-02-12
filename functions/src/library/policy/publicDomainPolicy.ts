// functions/src/library/policy/publicDomainPolicy.ts

/**
 * Public Domain Policy
 * --------------------
 * This module is the SINGLE source of truth for Public Domain determination.
 *
 * Rules:
 * 1. User-originated content is NEVER evaluated (handled upstream).
 * 2. Explicit PD signals from authoritative sources always win.
 * 3. Date-based rules are applied only when the source is silent.
 * 4. Commercial / controlled sources are explicitly excluded.
 *
 * This function MUST remain:
 * - Deterministic
 * - Stateless
 * - Free of side effects
 * - Language-agnostic
 */

export interface PublicDomainInput {
  title: string;
  authors: string[];
  publicationYear: number | null;
  source?: string;
  sourcePublicDomainFlag?: boolean;
  rights?: string;
  language?: string;
}

export interface PublicDomainResult {
  isPublicDomain: boolean;
  reason: string;
}

/**
 * Authoritative PD sources.
 * If these explicitly say PD, we trust them.
 */
const EXPLICIT_PD_PROVIDERS = new Set([
  'gutenberg',
  'internet_archive',
  'wikimedia',
  'wikisource',
  'qdl', // Qatar Digital Library
  'national_library'
]);

/**
 * Sources that are NEVER considered Public Domain
 * regardless of previews or snippets.
 */
const EXCLUDED_PROVIDERS = new Set([
  'googleBooks',
  'openLibrary'
]);

/**
 * Normalized keywords that indicate public domain.
 */
const PD_KEYWORDS = [
  'public domain',
  'no known copyright restrictions',
  'pd'
];

/**
 * Entry point for evaluating Public Domain status.
 */
export function evaluatePublicDomainStatus(
  input: PublicDomainInput
): PublicDomainResult {
  const {
    source,
    rights,
    publicationYear,
    sourcePublicDomainFlag
  } = input;

  // ----------------------------
  // Rule 1: Explicit exclusion
  // ----------------------------
  if (source && EXCLUDED_PROVIDERS.has(source)) {
    return {
      isPublicDomain: false,
      reason: `Source '${source}' is explicitly excluded from Public Domain consideration`
    };
  }

  // ----------------------------
  // Rule 2: Explicit PD flag from source
  // ----------------------------
  if (sourcePublicDomainFlag === true) {
    return {
      isPublicDomain: true,
      reason: 'Trusting source provider Public Domain flag'
    };
  }

  // ----------------------------
  // Rule 3: Explicit PD keyword in rights/status
  // ----------------------------
  if (containsPDKeyword(rights)) {
    return {
      isPublicDomain: true,
      reason: 'Explicit Public Domain rights statement'
    };
  }

  // --------------------------------
  // Rule 4: Date-based fallback (95-year rule)
  // --------------------------------
  const currentYear = new Date().getUTCFullYear();
  if (
    typeof publicationYear === 'number' &&
    currentYear - publicationYear >= 95
  ) {
    return {
      isPublicDomain: true,
      reason: `Publication year (${publicationYear}) is ≥ 95 years ago`
    };
  }

  // --------------------------------
  // Default: NOT public domain
  // --------------------------------
  return {
    isPublicDomain: false,
    reason: 'No sufficient Public Domain indicators'
  };
}

/**
 * Utilities
 */

function containsPDKeyword(value?: string | null): boolean {
  if (!value) return false;

  const normalized = value.toLowerCase();
  return PD_KEYWORDS.some(keyword => normalized.includes(keyword));
}
