import { describe, expect, it } from "vitest";
import {
  resolveAuthorRuntimeLifecycle,
} from "../../../lib/authors/authorLifecycle.ts";
import {
  toAuthorEntitySummary,
  toCanonicalAuthorRef,
} from "../../../lib/authors/authorEntitySummaryAdapter.ts";
import {
  buildAuthorDetailsAuthorityView,
  resolveAuthorDetailsAuthorityState,
} from "../../../lib/hooks/useAuthorDetailsAuthority.ts";
import type { Author } from "../../../types/entities.ts";

const author: Author = {
  id: "provider_author_id",
  nameEn: "Octavia Butler",
  nameAr: "أوكتافيا بتلر",
  avatarUrl: "https://example.com/author.jpg",
  bioEn: "American speculative fiction author.",
  bioAr: "كاتبة خيال تأملي أمريكية.",
  lifespan: "1947-2006",
  countryEn: "United States",
  countryAr: "الولايات المتحدة",
  languageEn: "English",
  languageAr: "الإنجليزية",
  providerSource: "openLibrary",
  providerExternalId: "OL123A",
};

describe("authorEntitySummaryAdapter", () => {
  it("generates a canonical Author LiteraryEntityRef", () => {
    expect(toCanonicalAuthorRef("author_octavia_butler")).toMatchObject({
      entityType: "author",
      entityId: "author_octavia_butler",
      authorityState: "canonical",
      authoritySource: "author_authority",
    });
  });

  it("generates a canonical Author EntitySummary", () => {
    expect(toAuthorEntitySummary(author, "author_octavia_butler")).toMatchObject({
      ref: {
        entityType: "author",
        entityId: "author_octavia_butler",
        authorityState: "canonical",
        authoritySource: "author_authority",
      },
      title: "Octavia Butler",
      authorityState: "canonical",
      navigation: "openable",
      localizedTitles: {
        ar: "أوكتافيا بتلر",
      },
    });
  });

  it("keeps provider metadata as context and never as Author identity", () => {
    const summary = toAuthorEntitySummary(author, "author_octavia_butler");

    expect(summary.ref.entityId).toBe("author_octavia_butler");
    expect(summary.ref.entityId).not.toBe(author.id);
    expect(summary.typeSpecific).toMatchObject({
      providerSource: "openLibrary",
      providerExternalId: "OL123A",
    });
  });

  it("carries lifecycle metadata without converting it into display identity", () => {
    const lifecycle = resolveAuthorRuntimeLifecycle({
      authorId: "author_octavia_butler",
      author: { ...author, lifecycleState: "merged", mergeTargetAuthorId: "author_survivor" },
      isLoading: false,
      isError: false,
    });
    const summary = toAuthorEntitySummary(author, "author_octavia_butler", lifecycle);

    expect(summary.ref).toMatchObject({
      entityType: "author",
      entityId: "author_octavia_butler",
      authorityState: "merged",
      mergeTarget: {
        entityType: "author",
        entityId: "author_survivor",
      },
    });
    expect(summary.title).toBe("Octavia Butler");
    expect(summary.typeSpecific).toMatchObject({
      lifecycleState: "merged",
      mergeTargetAuthorId: "author_survivor",
    });
  });

  it("resolves authority state transitions", () => {
    expect(resolveAuthorDetailsAuthorityState("author_1", author, false, false)).toBe(
      "canonical"
    );
    expect(resolveAuthorDetailsAuthorityState("author_1", null, false, false)).toBe(
      "not_found"
    );
    expect(resolveAuthorDetailsAuthorityState("", author, false, false)).toBe(
      "unresolved"
    );
    expect(
      resolveAuthorDetailsAuthorityState(
        "author_1",
        { ...author, requiresCanonicalization: true },
        false,
        false
      )
    ).toBe("candidate");
  });

  it("builds an authority view with explicit legacy repair bibliography state", () => {
    const view = buildAuthorDetailsAuthorityView({
      authorId: "author_octavia_butler",
      author,
      authorityState: "canonical",
      bibliographyAuthority: "legacy_display_name_repair",
    });

    expect(view).toMatchObject({
      authorRef: {
        entityId: "author_octavia_butler",
        authoritySource: "author_authority",
      },
      bibliographyAuthority: "legacy_display_name_repair",
      authorityState: "canonical",
    });
  });
});
