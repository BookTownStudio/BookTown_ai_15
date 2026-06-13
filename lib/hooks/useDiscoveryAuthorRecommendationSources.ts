import { collection, getDocs, limit, orderBy, query, Timestamp } from "firebase/firestore";
import { useMemo } from "react";
import { getFirebaseDb } from "../firebase.ts";
import { useAuth } from "../auth.tsx";
import { useQuery } from "../react-query.ts";
import { dataService } from "../../services/dataService.ts";
import { queryKeys } from "../queryKeys.ts";
import {
  AUTHOR_RECOMMENDATION_DISCOVERY_INPUT_LIMITS,
  type AuthorRecommendationInputSnapshotSources,
} from "../authorRecommendations/buildAuthorRecommendationInputSnapshot";
import { toAuthorEntitySummary } from "../authors/authorEntitySummaryAdapter.ts";
import { toAuthorFollowInteraction } from "../domain/identityGraph/userEntityInteractionAdapter";
import { toAuthorAffinityFromFollowInteraction } from "../domain/affinity/authorAffinityAdapter";

const DISCOVERY_AUTHOR_FOLLOW_SOURCE_LIMIT =
  AUTHOR_RECOMMENDATION_DISCOVERY_INPUT_LIMITS.maxDirectAffinities;

interface AuthorFollowSourceRecord {
  readonly authorId: string;
  readonly occurredAt: string;
}

function toIsoString(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return "1970-01-01T00:00:00.000Z";
}

function isCanonicalRuntimeAuthor(author: { readonly id: string; readonly requiresCanonicalization?: boolean } | null): boolean {
  return Boolean(author?.id && author.requiresCanonicalization !== true);
}

async function loadDirectAuthorFollowSources(uid: string): Promise<readonly AuthorFollowSourceRecord[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(
      collection(db, "users", uid, "follows_authors"),
      orderBy("createdAt", "desc"),
      limit(DISCOVERY_AUTHOR_FOLLOW_SOURCE_LIMIT)
    )
  );

  return snap.docs
    .map((row) => {
      const data = row.data() as Record<string, unknown>;
      const authorId =
        typeof data.authorId === "string" && data.authorId.trim().length > 0
          ? data.authorId.trim()
          : row.id.trim();
      return {
        authorId,
        occurredAt: toIsoString(data.createdAt ?? data.updatedAt),
      };
    })
    .filter((row) => row.authorId.length > 0)
    .sort((left, right) => left.authorId.localeCompare(right.authorId));
}

export function useDiscoveryAuthorRecommendationSources(enabled: boolean = true): {
  readonly inputSources: AuthorRecommendationInputSnapshotSources | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
} {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const queryResult = useQuery({
    queryKey: [...queryKeys.user.all(uid), "authorRecommendationDiscoverySources"] as unknown as any[],
    enabled: enabled && Boolean(uid),
    staleTime: 60_000,
    gcTime: 300_000,
    retry: false,
    queryFn: async () => {
      if (!uid) return null;
      const follows = await loadDirectAuthorFollowSources(uid);
      const authors = await Promise.all(
        follows.map(async (follow) => ({
          follow,
          author: await dataService.catalog.getAuthor(follow.authorId),
        }))
      );

      const directAuthorAffinities = authors
        .filter(({ author }) => isCanonicalRuntimeAuthor(author))
        .map(({ follow }) =>
          toAuthorAffinityFromFollowInteraction(
            toAuthorFollowInteraction({
              uid,
              authorId: follow.authorId,
              occurredAt: follow.occurredAt,
            })
          )
        )
        .filter((affinity): affinity is NonNullable<typeof affinity> => affinity !== null);

      const authorSummaries = authors
        .filter(({ author }) => isCanonicalRuntimeAuthor(author))
        .map(({ author }) => toAuthorEntitySummary(author!, author!.id))
        .sort((left, right) => left.ref.entityId.localeCompare(right.ref.entityId));
      const generatedAt =
        follows
          .map((follow) => follow.occurredAt)
          .sort()
          .at(-1) ?? "1970-01-01T00:00:00.000Z";

      return {
        uid,
        generatedAt,
        maxResults: 6,
        directAuthorAffinities,
        rolledAuthorAffinities: [],
        authorSummaries,
      } satisfies AuthorRecommendationInputSnapshotSources;
    },
  });

  const inputSources = useMemo(
    () => queryResult.data ?? null,
    [queryResult.data]
  );

  return {
    inputSources,
    isLoading: queryResult.isLoading,
    isError: queryResult.isError,
  };
}
