import {
  createAuthorEntityRef,
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntitySummary,
  type LiteraryEntityRef,
} from "../../contracts/entityPlatform";
import type { Author } from "../../types/entities.ts";

function text(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function toCanonicalAuthorRef(authorId: string): LiteraryEntityRef {
  return createAuthorEntityRef(authorId.trim());
}

export function toAuthorEntitySummary(
  author: Author,
  authorId: string = author.id
): EntitySummary {
  const ref = toCanonicalAuthorRef(authorId);
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
    },
  };
}

