import { describe, expect, it } from "vitest";
import { resolveAuthorRuntimeLifecycle } from "../../../lib/authors/authorLifecycle.ts";
import { resolveAuthorAuthorityFromRecord } from "../../../lib/authors/authorAuthorityResolution.ts";
import { toAuthorEntitySummary } from "../../../lib/authors/authorEntitySummaryAdapter.ts";
import type { Author } from "../../../types/entities.ts";

const baseAuthor: Author = {
  id: "author_1",
  nameEn: "Author One",
  nameAr: "",
  avatarUrl: "",
  bioEn: "",
  bioAr: "",
  lifespan: "",
  countryEn: "",
  countryAr: "",
  languageEn: "",
  languageAr: "",
};

function resolve(author: Author | null, authorId = "author_1") {
  return resolveAuthorRuntimeLifecycle({
    authorId,
    author,
    isLoading: false,
    isError: false,
  });
}

describe("authorLifecycle", () => {
  it("treats canonical authors as active canonical Tier-1 entities", () => {
    const lifecycle = resolve({ ...baseAuthor, lifecycleState: "canonical" });
    const summary = toAuthorEntitySummary(baseAuthor, "author_1", lifecycle);

    expect(lifecycle).toMatchObject({
      authorityState: "canonical",
      entityAuthorityState: "canonical",
      canonicalAuthorId: "author_1",
      reason: "canonical_author",
    });
    expect(summary.ref).toMatchObject({
      entityType: "author",
      entityId: "author_1",
      authorityState: "canonical",
      authoritySource: "author_authority",
      canonicalId: "author_1",
    });
  });

  it("allows canonical pseudonym authors without resolving them to user or legal identity", () => {
    const lifecycle = resolve({
      ...baseAuthor,
      lifecycleState: "canonical",
      isPseudonym: true,
      pseudonymOfAuthorId: "author_real_1",
    });

    expect(lifecycle).toMatchObject({
      authorityState: "canonical",
      isPseudonym: true,
      reason: "canonical_pseudonym_author",
    });
  });

  it("blocks candidate authors from canonical downstream use", () => {
    const lifecycle = resolve({ ...baseAuthor, requiresCanonicalization: true });

    expect(lifecycle).toMatchObject({
      authorityState: "candidate",
      entityAuthorityState: "candidate",
      canonicalAuthorId: null,
      reason: "candidate_requires_authority_acceptance",
    });
  });

  it("marks merged authors with a survivor target", () => {
    const lifecycle = resolve({
      ...baseAuthor,
      lifecycleState: "merged",
      mergeTargetAuthorId: "author_survivor",
    });
    const summary = toAuthorEntitySummary(baseAuthor, "author_1", lifecycle);

    expect(lifecycle).toMatchObject({
      authorityState: "merged",
      entityAuthorityState: "merged",
      mergeTargetAuthorId: "author_survivor",
      reason: "merged_author_requires_survivor_resolution",
    });
    expect(summary.ref.mergeTarget).toMatchObject({
      entityType: "author",
      entityId: "author_survivor",
    });
  });

  it("marks split authors as requiring target selection", () => {
    expect(
      resolve({
        ...baseAuthor,
        lifecycleState: "split",
        splitTargetAuthorIds: ["author_a", "author_b"],
      })
    ).toMatchObject({
      authorityState: "split",
      entityAuthorityState: "split",
      splitTargetAuthorIds: ["author_a", "author_b"],
      reason: "split_author_requires_target_selection",
    });
  });

  it("marks superseded authors as requiring current authority", () => {
    expect(
      resolve({
        ...baseAuthor,
        lifecycleState: "superseded",
        supersededByAuthorId: "author_current",
      })
    ).toMatchObject({
      authorityState: "superseded",
      entityAuthorityState: "superseded",
      supersededByAuthorId: "author_current",
      reason: "superseded_author_requires_current_authority",
    });
  });

  it("marks archived authors inactive", () => {
    expect(resolve({ ...baseAuthor, archived: true })).toMatchObject({
      authorityState: "archived",
      entityAuthorityState: "archived",
      reason: "archived_author_not_active",
    });
  });

  it("resolves merged author records to survivor redirect metadata", () => {
    expect(
      resolveAuthorAuthorityFromRecord({
        requestedAuthorId: "author_old",
        author: {
          ...baseAuthor,
          id: "author_old",
          lifecycleState: "merged",
          mergeTargetAuthorId: "author_survivor",
        },
      })
    ).toMatchObject({
      requestedAuthorId: "author_old",
      resolvedAuthorId: "author_survivor",
      state: "merged",
      redirect: {
        required: true,
        targetAuthorId: "author_survivor",
        reason: "merged_author_redirect",
      },
    });
  });

  it("resolves superseded author records to current authority redirect metadata", () => {
    expect(
      resolveAuthorAuthorityFromRecord({
        requestedAuthorId: "author_old",
        author: {
          ...baseAuthor,
          id: "author_old",
          lifecycleState: "superseded",
          supersededByAuthorId: "author_current",
        },
      })
    ).toMatchObject({
      resolvedAuthorId: "author_current",
      state: "superseded",
      redirect: {
        required: true,
        targetAuthorId: "author_current",
        reason: "superseded_author_redirect",
      },
    });
  });
});
