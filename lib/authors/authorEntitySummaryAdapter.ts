import {
  createAuthorEntityRef,
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntitySummary,
  type LiteraryEntityRef,
} from "../../contracts/entityPlatform";
import type { Author } from "../../types/entities.ts";
import type { AuthorLifecycleResolution } from "./authorLifecycle.ts";

function text(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function toCanonicalAuthorRef(
  authorId: string,
  lifecycle?: AuthorLifecycleResolution
): LiteraryEntityRef {
  const entityId = authorId.trim();
  return createAuthorEntityRef(entityId, {
    authorityState: lifecycle?.entityAuthorityState ?? "canonical",
    canonicalId: lifecycle?.canonicalAuthorId ?? entityId,
    ...(lifecycle?.mergeTargetAuthorId
      ? { mergeTarget: createAuthorEntityRef(lifecycle.mergeTargetAuthorId) }
      : {}),
    provenance: {
      sourceClass: "system",
      sourceSystem: "author_authority",
      sourceId: entityId,
      ...(lifecycle ? { evidence: [`lifecycle:${lifecycle.authorityState}`, `reason:${lifecycle.reason}`] } : {}),
    },
  });
}

export function toAuthorEntitySummary(
  author: Author,
  authorId: string = author.id,
  lifecycle?: AuthorLifecycleResolution
): EntitySummary {
  const ref = toCanonicalAuthorRef(authorId, lifecycle);
  const nameEn = text(author.nameEn) || ref.entityId;
  const nameAr = text(author.nameAr);
  const countryEn = text(author.countryEn);
  const countryAr = text(author.countryAr);
  const languageEn = text(author.languageEn);
  const languageAr = text(author.languageAr);

  return {
    ref,
    title: nameEn,
    authorityState: ref.authorityState,
    summaryVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
    ...(countryEn ? { subtitle: countryEn } : {}),
    ...(text(author.bioEn) ? { description: text(author.bioEn) } : {}),
    ...(text(author.avatarUrl)
      ? { image: { url: text(author.avatarUrl), alt: nameEn, source: "author_profile" } }
      : {}),
    ...(languageEn ? { language: languageEn } : {}),
    ...(nameAr ? { localizedTitles: { ar: nameAr } } : {}),
    navigation: "openable",
    typeSpecific: {
      ...(countryEn ? { countryEn } : {}),
      ...(countryAr ? { countryAr } : {}),
      ...(languageEn ? { languageEn } : {}),
      ...(languageAr ? { languageAr } : {}),
      ...(text(author.lifespan) ? { lifespan: text(author.lifespan) } : {}),
      ...(text(author.providerSource) ? { providerSource: text(author.providerSource) } : {}),
      ...(text(author.providerExternalId)
        ? { providerExternalId: text(author.providerExternalId) }
        : {}),
      ...(author.requiresCanonicalization === true
        ? { requiresCanonicalization: true }
        : {}),
      ...(lifecycle
        ? {
            lifecycleState: lifecycle.authorityState,
            lifecycleReason: lifecycle.reason,
            isPseudonym: lifecycle.isPseudonym,
            ...(lifecycle.mergeTargetAuthorId
              ? { mergeTargetAuthorId: lifecycle.mergeTargetAuthorId }
              : {}),
            ...(lifecycle.splitTargetAuthorIds.length > 0
              ? { splitTargetAuthorIds: lifecycle.splitTargetAuthorIds }
              : {}),
            ...(lifecycle.supersededByAuthorId
              ? { supersededByAuthorId: lifecycle.supersededByAuthorId }
              : {}),
          }
        : {}),
    },
  };
}
