import {
  createQuoteEntityRef,
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntitySummary,
  type LiteraryEntityRef,
} from "../../contracts/entityPlatform";
import type { Quote } from "../../types/entities.ts";
import {
  resolveQuoteRuntimeLifecycle,
  type QuoteLifecycleResolution,
} from "./quoteLifecycle.ts";

function text(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function toCanonicalQuoteRef(
  quoteId: string,
  lifecycle?: QuoteLifecycleResolution
): LiteraryEntityRef {
  const entityId = quoteId.trim();
  return createQuoteEntityRef(entityId, {
    authorityState: lifecycle?.entityAuthorityState ?? "canonical",
    canonicalId: lifecycle?.canonicalQuoteId ?? entityId,
    ...(lifecycle?.mergeTargetQuoteId
      ? { mergeTarget: createQuoteEntityRef(lifecycle.mergeTargetQuoteId) }
      : {}),
    provenance: {
      sourceClass: "system",
      sourceSystem: "quote_authority",
      sourceId: entityId,
      ...(lifecycle
        ? { evidence: [`lifecycle:${lifecycle.lifecycleState}`, `reason:${lifecycle.reason}`] }
        : {}),
    },
  });
}

export function toQuoteEntitySummary(
  quote: Quote,
  quoteId: string = quote.canonicalQuoteId || quote.id,
  lifecycle: QuoteLifecycleResolution = resolveQuoteRuntimeLifecycle(quote)
): EntitySummary {
  const ref = toCanonicalQuoteRef(quoteId, lifecycle);
  const textEn = text(quote.textEn);
  const textAr = text(quote.textAr);
  const sourceEn = text(quote.sourceEn);
  const sourceAr = text(quote.sourceAr);
  const title = textEn || textAr || ref.entityId;

  return {
    ref,
    title,
    authorityState: ref.authorityState,
    summaryVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
    ...(sourceEn ? { subtitle: sourceEn } : {}),
    ...(textAr ? { localizedTitles: { ar: textAr } } : {}),
    navigation: "openable",
    typeSpecific: {
      ...(quote.canonicalQuoteId ? { canonicalQuoteId: quote.canonicalQuoteId } : {}),
      ...(quote.legacyQuoteId ? { legacyQuoteId: quote.legacyQuoteId } : {}),
      ...(quote.bookId ? { bookId: quote.bookId } : {}),
      ...(quote.authorId ? { authorId: quote.authorId } : {}),
      lifecycleState: lifecycle.lifecycleState,
      lifecycleReason: lifecycle.reason,
      graphEligible: lifecycle.graphEligible,
      identityGraphEligible: lifecycle.identityGraphEligible,
      attribution: lifecycle.attribution,
      ...(quote.originType ? { originType: quote.originType } : {}),
      ...(quote.mergeTargetQuoteId ? { mergeTargetQuoteId: quote.mergeTargetQuoteId } : {}),
      ...(quote.duplicateOfQuoteId ? { duplicateOfQuoteId: quote.duplicateOfQuoteId } : {}),
      ...(quote.variantOfQuoteId ? { variantOfQuoteId: quote.variantOfQuoteId } : {}),
      ...(quote.paraphraseOfQuoteId ? { paraphraseOfQuoteId: quote.paraphraseOfQuoteId } : {}),
      ...(quote.translationStatus ? { translationStatus: quote.translationStatus } : {}),
      ...(quote.translatedFrom ? { translatedFrom: quote.translatedFrom } : {}),
      ...(sourceEn ? { sourceEn } : {}),
      ...(sourceAr ? { sourceAr } : {}),
      ...(quote.provenance ? { provenance: quote.provenance } : {}),
    },
  };
}
