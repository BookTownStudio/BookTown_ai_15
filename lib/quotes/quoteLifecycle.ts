import type { EntityAuthorityState, LiteraryEntityRef } from "../../contracts/entityPlatform";
import type { Quote } from "../../types/entities.ts";

export type QuoteRuntimeLifecycleState =
  | "canonical"
  | "merged"
  | "duplicate"
  | "disputed"
  | "translation"
  | "variant"
  | "paraphrase"
  | "reader_highlight"
  | "imported"
  | "archived";

export interface QuoteAttributionResolution {
  readonly bookAttribution: "canonical" | "missing";
  readonly authorAttribution: "canonical" | "missing";
  readonly sourceAttribution: "present" | "missing";
  readonly translationAttribution: "source_language" | "translated" | "unspecified";
  readonly provenanceState: "canonical_linked" | "saved_reference" | "unverified" | "missing";
}

export interface QuoteLifecycleResolution {
  readonly lifecycleState: QuoteRuntimeLifecycleState;
  readonly entityAuthorityState: EntityAuthorityState;
  readonly canonicalQuoteId: string | null;
  readonly mergeTargetQuoteId: string | null;
  readonly duplicateOfQuoteId: string | null;
  readonly graphEligible: boolean;
  readonly identityGraphEligible: boolean;
  readonly attribution: QuoteAttributionResolution;
  readonly reason: string;
}

function text(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function readLifecycle(quote: Quote): QuoteRuntimeLifecycleState | null {
  const value = quote.lifecycleState || quote.quoteLifecycleState;
  if (
    value === "canonical" ||
    value === "merged" ||
    value === "duplicate" ||
    value === "disputed" ||
    value === "translation" ||
    value === "variant" ||
    value === "paraphrase" ||
    value === "reader_highlight" ||
    value === "imported" ||
    value === "archived"
  ) {
    return value;
  }
  return null;
}

function lifecycleToAuthorityState(lifecycle: QuoteRuntimeLifecycleState): EntityAuthorityState {
  if (lifecycle === "canonical" || lifecycle === "translation" || lifecycle === "imported") {
    return "canonical";
  }
  if (lifecycle === "reader_highlight") return "canonical";
  if (lifecycle === "merged" || lifecycle === "duplicate") return "merged";
  if (lifecycle === "archived") return "archived";
  if (lifecycle === "variant" || lifecycle === "paraphrase") return "resolved";
  return "candidate";
}

export function resolveQuoteAttribution(quote: Quote): QuoteAttributionResolution {
  const hasBook = Boolean(text(quote.bookId));
  const hasAuthor = Boolean(text(quote.authorId));
  const hasSource = Boolean(text(quote.sourceEn) || text(quote.sourceAr));
  const translationStatus = text(quote.translationStatus);
  const translatedFrom = text(quote.translatedFrom);
  const provenance = quote.provenance;

  return {
    bookAttribution: hasBook ? "canonical" : "missing",
    authorAttribution: hasAuthor ? "canonical" : "missing",
    sourceAttribution: hasSource ? "present" : "missing",
    translationAttribution:
      translationStatus || translatedFrom
        ? "translated"
        : text(quote.originalLanguage)
          ? "source_language"
          : "unspecified",
    provenanceState: provenance?.verificationStatus ?? "missing",
  };
}

export function resolveQuoteRuntimeLifecycle(quote: Quote): QuoteLifecycleResolution {
  const attribution = resolveQuoteAttribution(quote);
  const canonicalQuoteId = text(quote.canonicalQuoteId) || text(quote.id) || null;
  const mergeTargetQuoteId = text(quote.mergeTargetQuoteId) || null;
  const duplicateOfQuoteId = text(quote.duplicateOfQuoteId) || null;
  const explicitLifecycle = readLifecycle(quote);
  const lifecycleState =
    explicitLifecycle ??
    (quote.archived === true
      ? "archived"
      : mergeTargetQuoteId
        ? "merged"
        : duplicateOfQuoteId
          ? "duplicate"
          : quote.disputed === true
            ? "disputed"
            : text(quote.paraphraseOfQuoteId)
              ? "paraphrase"
              : text(quote.variantOfQuoteId)
                ? "variant"
                : quote.provenance?.readerSource
                  ? "reader_highlight"
                  : quote.originType === "dataset_import"
                    ? "imported"
                    : text(quote.translationStatus) || text(quote.translatedFrom)
                      ? "translation"
                      : "canonical");
  const entityAuthorityState = lifecycleToAuthorityState(lifecycleState);
  const attributionSafe =
    attribution.sourceAttribution === "present" &&
    (attribution.bookAttribution === "canonical" || attribution.authorAttribution === "canonical") &&
    attribution.provenanceState !== "missing";
  const activeCanonical = entityAuthorityState === "canonical" && attributionSafe;

  return {
    lifecycleState,
    entityAuthorityState,
    canonicalQuoteId,
    mergeTargetQuoteId,
    duplicateOfQuoteId,
    graphEligible: activeCanonical && lifecycleState !== "reader_highlight",
    identityGraphEligible: activeCanonical,
    attribution,
    reason: reasonFor(lifecycleState, attributionSafe),
  };
}

function reasonFor(lifecycle: QuoteRuntimeLifecycleState, attributionSafe: boolean): string {
  if (!attributionSafe) return "quote_attribution_or_provenance_incomplete";
  if (lifecycle === "merged") return "merged_quote_requires_survivor_resolution";
  if (lifecycle === "duplicate") return "duplicate_quote_requires_canonical_resolution";
  if (lifecycle === "disputed") return "disputed_quote_not_canonical";
  if (lifecycle === "variant") return "quote_variant_requires_canonical_lineage";
  if (lifecycle === "paraphrase") return "paraphrase_not_canonical_quote_text";
  if (lifecycle === "reader_highlight") return "reader_highlight_is_private_origin_evidence";
  if (lifecycle === "archived") return "archived_quote_not_active";
  return "authority_safe_quote";
}

export function buildQuoteLifecycleRefMetadata(
  resolution: QuoteLifecycleResolution
): Pick<LiteraryEntityRef, "authorityState" | "canonicalId" | "mergeTarget"> {
  return {
    authorityState: resolution.entityAuthorityState,
    ...(resolution.canonicalQuoteId ? { canonicalId: resolution.canonicalQuoteId } : {}),
  };
}
