import type { EntityAuthorityState, LiteraryEntityRef } from "../../contracts/entityPlatform";
import type { Author } from "../../types/entities.ts";

export type AuthorRuntimeLifecycleState =
  | "candidate"
  | "canonical"
  | "merged"
  | "split"
  | "superseded"
  | "archived";

export type AuthorDetailsAuthorityState =
  | AuthorRuntimeLifecycleState
  | "unresolved"
  | "not_found";

export interface AuthorLifecycleResolution {
  readonly authorityState: AuthorDetailsAuthorityState;
  readonly entityAuthorityState: EntityAuthorityState | null;
  readonly canonicalAuthorId: string | null;
  readonly mergeTargetAuthorId: string | null;
  readonly splitTargetAuthorIds: readonly string[];
  readonly supersededByAuthorId: string | null;
  readonly isPseudonym: boolean;
  readonly reason: string;
}

function readText(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: readonly string[] | undefined): readonly string[] {
  return Array.isArray(value)
    ? value.map((item) => item.trim()).filter(Boolean)
    : [];
}

function readLifecycle(author: Author): AuthorRuntimeLifecycleState | null {
  const value = author.lifecycleState || author.authorityState || author.status;
  if (
    value === "candidate" ||
    value === "canonical" ||
    value === "merged" ||
    value === "split" ||
    value === "superseded" ||
    value === "archived"
  ) {
    return value;
  }
  return null;
}

function toEntityAuthorityState(
  lifecycle: AuthorDetailsAuthorityState
): EntityAuthorityState | null {
  if (lifecycle === "canonical") return "canonical";
  if (lifecycle === "candidate") return "candidate";
  if (lifecycle === "merged") return "merged";
  if (lifecycle === "split") return "split";
  if (lifecycle === "superseded") return "superseded";
  if (lifecycle === "archived") return "archived";
  if (lifecycle === "unresolved") return "unresolved";
  return null;
}

export function resolveAuthorRuntimeLifecycle(params: {
  readonly authorId: string | undefined;
  readonly author: Author | null | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
}): AuthorLifecycleResolution {
  const authorId = readText(params.authorId);
  if (params.isLoading) {
    return unresolved("loading");
  }
  if (params.isError || !params.author) {
    return {
      ...unresolved("not_found"),
      authorityState: "not_found",
      entityAuthorityState: null,
    };
  }
  if (!authorId) {
    return unresolved("missing_author_id");
  }

  const author = params.author;
  const mergeTargetAuthorId = readText(author.mergeTargetAuthorId);
  const splitTargetAuthorIds = readStringArray(author.splitTargetAuthorIds);
  const supersededByAuthorId = readText(author.supersededByAuthorId);
  const canonicalAuthorId = readText(author.canonicalAuthorId) || authorId;
  const isPseudonym = author.isPseudonym === true || author.pseudonymOfAuthorId !== undefined;
  const lifecycle = readLifecycle(author);

  if (author.requiresCanonicalization === true || lifecycle === "candidate") {
    return resolution("candidate", null, {
      canonicalAuthorId: null,
      splitTargetAuthorIds,
      supersededByAuthorId,
      isPseudonym,
      reason: "candidate_requires_authority_acceptance",
    });
  }

  if (lifecycle === "merged" || mergeTargetAuthorId) {
    return resolution("merged", mergeTargetAuthorId || null, {
      canonicalAuthorId,
      splitTargetAuthorIds,
      supersededByAuthorId,
      isPseudonym,
      reason: mergeTargetAuthorId
        ? "merged_author_requires_survivor_resolution"
        : "merged_author_missing_survivor",
    });
  }

  if (lifecycle === "split" || splitTargetAuthorIds.length > 0) {
    return resolution("split", null, {
      canonicalAuthorId,
      splitTargetAuthorIds,
      supersededByAuthorId,
      isPseudonym,
      reason: "split_author_requires_target_selection",
    });
  }

  if (lifecycle === "superseded" || supersededByAuthorId) {
    return resolution("superseded", supersededByAuthorId || null, {
      canonicalAuthorId,
      splitTargetAuthorIds,
      supersededByAuthorId,
      isPseudonym,
      reason: "superseded_author_requires_current_authority",
    });
  }

  if (lifecycle === "archived" || author.archived === true) {
    return resolution("archived", null, {
      canonicalAuthorId,
      splitTargetAuthorIds,
      supersededByAuthorId,
      isPseudonym,
      reason: "archived_author_not_active",
    });
  }

  return resolution("canonical", null, {
    canonicalAuthorId,
    splitTargetAuthorIds,
    supersededByAuthorId,
    isPseudonym,
    reason: isPseudonym ? "canonical_pseudonym_author" : "canonical_author",
  });
}

function unresolved(reason: string): AuthorLifecycleResolution {
  return {
    authorityState: "unresolved",
    entityAuthorityState: "unresolved",
    canonicalAuthorId: null,
    mergeTargetAuthorId: null,
    splitTargetAuthorIds: [],
    supersededByAuthorId: null,
    isPseudonym: false,
    reason,
  };
}

function resolution(
  authorityState: AuthorDetailsAuthorityState,
  mergeTargetAuthorId: string | null,
  params: Omit<AuthorLifecycleResolution, "authorityState" | "entityAuthorityState" | "mergeTargetAuthorId">
): AuthorLifecycleResolution {
  return {
    authorityState,
    entityAuthorityState: toEntityAuthorityState(authorityState),
    mergeTargetAuthorId,
    ...params,
  };
}

export function buildAuthorLifecycleRefMetadata(
  resolution: AuthorLifecycleResolution
): Pick<LiteraryEntityRef, "authorityState" | "canonicalId" | "mergeTarget"> {
  return {
    authorityState: resolution.entityAuthorityState ?? "unresolved",
    ...(resolution.canonicalAuthorId ? { canonicalId: resolution.canonicalAuthorId } : {}),
  };
}
