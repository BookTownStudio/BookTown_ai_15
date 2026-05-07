import { useMemo } from "react";
import type { InfiniteData } from "@tanstack/react-query";
import { useInfiniteQuery } from "../react-query.ts";
import { dataService } from "../../services/dataService.ts";
import { Post, User } from "../../types/entities.ts";
import { useAuth } from "../auth.tsx";

export type SocialSearchTopic = {
  topic: string;
  postCount: number;
  score: number;
};

type SocialSearchPage = {
  posts: Post[];
  users: User[];
  topics: SocialSearchTopic[];
  hasMore: boolean;
  nextCursor?: string;
  rankingVersion: string;
  queryHash: string;
};

export type SocialSearchResult = {
  posts: Post[];
  users: User[];
  topics: SocialSearchTopic[];
  hasMore: boolean;
  rankingVersion: string;
  queryHash: string;
};

const PAGE_SIZE = 20;

function dedupeById<T extends { [key: string]: any }>(
  values: readonly T[],
  key: keyof T
): T[] {
  const seen = new Set<string>();
  const output: T[] = [];

  for (const item of values) {
    const rawValue = item[key];
    const value = typeof rawValue === "string" ? rawValue : "";
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(item);
  }

  return output;
}

export const useSocialSearch = (query: string) => {
  const { user } = useAuth();
  const normalizedQuery = query.trim().toLowerCase();

  const queryKey = ["socialSearchV1", user?.uid ?? "anonymous", normalizedQuery] as const;

  const searchQuery = useInfiniteQuery<
    SocialSearchPage,
    Error,
    InfiniteData<SocialSearchPage, string | undefined>,
    typeof queryKey,
    string | undefined
  >({
    queryKey,
    queryFn: ({ pageParam }) =>
      dataService.social.search(
        normalizedQuery,
        typeof pageParam === "string" ? pageParam : undefined,
        PAGE_SIZE
      ),
    enabled: normalizedQuery.length >= 2 && !!user?.uid,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: SocialSearchPage) =>
      lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined,
    staleTime: 30_000,
  });

  const aggregated = useMemo<SocialSearchResult>(() => {
    if (normalizedQuery.length < 2 || !user?.uid) {
      return {
        posts: [],
        users: [],
        topics: [],
        hasMore: false,
        rankingVersion: "social_v1",
        queryHash: "",
      };
    }

    const pages = searchQuery.data?.pages ?? [];
    if (pages.length === 0) {
      return {
        posts: [],
        users: [],
        topics: [],
        hasMore: false,
        rankingVersion: "social_v1",
        queryHash: "",
      };
    }

    const posts = dedupeById(
      pages.flatMap((page) => page.posts ?? []),
      "id"
    );
    const users = dedupeById(
      pages.flatMap((page) => page.users ?? []),
      "uid"
    );
    const topics = dedupeById(
      pages.flatMap((page) => page.topics ?? []),
      "topic"
    );

    const last = pages[pages.length - 1];
    return {
      posts,
      users,
      topics,
      hasMore: Boolean(last?.hasMore),
      rankingVersion: last?.rankingVersion || "social_v1",
      queryHash: last?.queryHash || "",
    };
  }, [searchQuery.data, normalizedQuery, user?.uid]);

  return {
    ...searchQuery,
    results: aggregated,
  };
};
