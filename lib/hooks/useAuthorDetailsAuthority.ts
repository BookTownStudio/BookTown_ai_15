import { useMemo } from "react";
import type { EntitySummary, LiteraryEntityRef } from "../../contracts/entityPlatform";
import { toAuthorEntitySummary } from "../authors/authorEntitySummaryAdapter.ts";
import {
  resolveAuthorRuntimeLifecycle,
  type AuthorDetailsAuthorityState,
  type AuthorLifecycleResolution,
} from "../authors/authorLifecycle.ts";
import type { Author } from "../../types/entities.ts";
import { useAuthorDetails } from "./useAuthorDetails.ts";

export type AuthorDetailsBibliographyAuthority =
  | "canonical_author_id"
  | "legacy_display_name_repair"
  | "mixed"
  | "none";

export interface AuthorDetailsAuthorityView {
  readonly authorRef: LiteraryEntityRef;
  readonly authorSummary: EntitySummary;
  readonly author: Author;
  readonly authorityState: AuthorDetailsAuthorityState;
  readonly bibliographyAuthority: AuthorDetailsBibliographyAuthority;
  readonly lifecycle: AuthorLifecycleResolution;
}

export interface UseAuthorDetailsAuthorityResult {
  readonly data: AuthorDetailsAuthorityView | null;
  readonly author: Author | null | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly authorityState: AuthorDetailsAuthorityState;
}

export function resolveAuthorDetailsAuthorityState(
  authorId: string | undefined,
  author: Author | null | undefined,
  isLoading: boolean,
  isError: boolean
): AuthorDetailsAuthorityState {
  return resolveAuthorRuntimeLifecycle({ authorId, author, isLoading, isError }).authorityState;
}

export function buildAuthorDetailsAuthorityView(params: {
  readonly authorId: string | undefined;
  readonly author: Author | null | undefined;
  readonly authorityState: AuthorDetailsAuthorityState;
  readonly bibliographyAuthority: AuthorDetailsBibliographyAuthority;
  readonly lifecycle?: AuthorLifecycleResolution;
}): AuthorDetailsAuthorityView | null {
  if (
    !params.author ||
    !params.authorId?.trim() ||
    params.authorityState !== "canonical"
  ) {
    return null;
  }

  const lifecycle =
    params.lifecycle ??
    resolveAuthorRuntimeLifecycle({
      authorId: params.authorId,
      author: params.author,
      isLoading: false,
      isError: false,
    });
  const authorSummary = toAuthorEntitySummary(params.author, params.authorId, lifecycle);
  return {
    authorRef: authorSummary.ref,
    authorSummary,
    author: params.author,
    authorityState: params.authorityState,
    bibliographyAuthority: params.bibliographyAuthority,
    lifecycle,
  };
}

export function useAuthorDetailsAuthority(
  authorId: string | undefined,
  bibliographyAuthority: AuthorDetailsBibliographyAuthority = "none"
): UseAuthorDetailsAuthorityResult {
  const { data: author, isLoading, isError } = useAuthorDetails(authorId);
  const lifecycle = resolveAuthorRuntimeLifecycle({ authorId, author, isLoading, isError });
  const authorityState = lifecycle.authorityState;

  const data = useMemo<AuthorDetailsAuthorityView | null>(() => {
    return buildAuthorDetailsAuthorityView({
      authorId,
      author,
      authorityState,
      bibliographyAuthority,
      lifecycle,
    });
  }, [author, authorId, authorityState, bibliographyAuthority, lifecycle]);

  return {
    data,
    author,
    isLoading,
    isError,
    authorityState,
  };
}
