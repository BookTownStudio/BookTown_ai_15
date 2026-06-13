import { useMemo } from "react";
import type { EntitySummary, LiteraryEntityRef } from "../../contracts/entityPlatform";
import { toAuthorEntitySummary } from "../authors/authorEntitySummaryAdapter.ts";
import type { Author } from "../../types/entities.ts";
import { useAuthorDetails } from "./useAuthorDetails.ts";

export type AuthorDetailsAuthorityState =
  | "canonical"
  | "unresolved"
  | "legacy_repair"
  | "not_found";

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
  if (isLoading) return "unresolved";
  if (isError || !author) return "not_found";
  if (!authorId?.trim()) return "unresolved";
  if (author.requiresCanonicalization === true) return "unresolved";
  return "canonical";
}

export function buildAuthorDetailsAuthorityView(params: {
  readonly authorId: string | undefined;
  readonly author: Author | null | undefined;
  readonly authorityState: AuthorDetailsAuthorityState;
  readonly bibliographyAuthority: AuthorDetailsBibliographyAuthority;
}): AuthorDetailsAuthorityView | null {
  if (
    !params.author ||
    !params.authorId?.trim() ||
    params.authorityState !== "canonical"
  ) {
    return null;
  }

  const authorSummary = toAuthorEntitySummary(params.author, params.authorId);
  return {
    authorRef: authorSummary.ref,
    authorSummary,
    author: params.author,
    authorityState: params.authorityState,
    bibliographyAuthority: params.bibliographyAuthority,
  };
}

export function useAuthorDetailsAuthority(
  authorId: string | undefined,
  bibliographyAuthority: AuthorDetailsBibliographyAuthority = "none"
): UseAuthorDetailsAuthorityResult {
  const { data: author, isLoading, isError } = useAuthorDetails(authorId);
  const authorityState = resolveAuthorDetailsAuthorityState(
    authorId,
    author,
    isLoading,
    isError
  );

  const data = useMemo<AuthorDetailsAuthorityView | null>(() => {
    return buildAuthorDetailsAuthorityView({
      authorId,
      author,
      authorityState,
      bibliographyAuthority,
    });
  }, [author, authorId, authorityState, bibliographyAuthority]);

  return {
    data,
    author,
    isLoading,
    isError,
    authorityState,
  };
}
