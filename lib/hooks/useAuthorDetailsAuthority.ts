import { useMemo } from "react";
import type { EntitySummary, LiteraryEntityRef } from "../../contracts/entityPlatform";
import { dataService } from "../../services/dataService.ts";
import { useQuery } from "../react-query.ts";
import { queryKeys } from "../queryKeys.ts";
import { toAuthorEntitySummary } from "../authors/authorEntitySummaryAdapter.ts";
import type { ResolvedAuthorAuthority } from "../authors/authorAuthorityResolution.ts";
import {
  resolveAuthorRuntimeLifecycle,
  type AuthorDetailsAuthorityState,
  type AuthorLifecycleResolution,
} from "../authors/authorLifecycle.ts";
import type { Author } from "../../types/entities.ts";

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
  readonly requestedAuthorId: string;
  readonly redirect: ResolvedAuthorAuthority["redirect"];
}

export interface UseAuthorDetailsAuthorityResult {
  readonly data: AuthorDetailsAuthorityView | null;
  readonly author: Author | null | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly authorityState: AuthorDetailsAuthorityState;
  readonly resolution: ResolvedAuthorAuthority | null | undefined;
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
  readonly requestedAuthorId?: string;
  readonly redirect?: ResolvedAuthorAuthority["redirect"];
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
    requestedAuthorId: params.requestedAuthorId ?? params.authorId,
    redirect: params.redirect ?? {
      required: false,
      targetAuthorId: null,
      reason: "active_author",
    },
  };
}

export function useAuthorDetailsAuthority(
  authorId: string | undefined,
  bibliographyAuthority: AuthorDetailsBibliographyAuthority = "none"
): UseAuthorDetailsAuthorityResult {
  const normalizedAuthorId = typeof authorId === "string" ? authorId.trim() : "";
  const {
    data: resolution,
    isLoading: isResolving,
    isError: isResolveError,
  } = useQuery<ResolvedAuthorAuthority | null>({
    queryKey: [...(queryKeys.catalog.author(normalizedAuthorId || undefined) as unknown as any[]), "authorityResolution"],
    queryFn: () => dataService.catalog.resolveAuthorAuthority(normalizedAuthorId),
    enabled: normalizedAuthorId.length > 0,
  });
  const author = resolution?.author;
  const resolvedAuthorId = resolution?.resolvedAuthorId ?? normalizedAuthorId;
  const isLoading = isResolving;
  const isError = isResolveError;
  const lifecycle = resolveAuthorRuntimeLifecycle({ authorId: resolvedAuthorId, author, isLoading, isError });
  const authorityState = lifecycle.authorityState;

  const data = useMemo<AuthorDetailsAuthorityView | null>(() => {
    return buildAuthorDetailsAuthorityView({
      authorId: resolvedAuthorId,
      author,
      authorityState,
      bibliographyAuthority,
      lifecycle,
      requestedAuthorId: normalizedAuthorId,
      redirect: resolution?.redirect,
    });
  }, [author, resolvedAuthorId, authorityState, bibliographyAuthority, lifecycle, normalizedAuthorId, resolution?.redirect]);

  return {
    data,
    author,
    isLoading,
    isError,
    authorityState,
    resolution,
  };
}
