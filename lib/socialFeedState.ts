export type SocialFeedScope = 'explore' | 'following' | 'books' | 'discover';
export type SocialFeedFilter = 'media' | 'text' | 'book' | 'quote' | 'project';

const SOCIAL_FEED_SCOPES = new Set<SocialFeedScope>([
  'explore',
  'following',
  'books',
  'discover',
]);

export const SOCIAL_FEED_FILTER_ORDER: readonly SocialFeedFilter[] = [
  'media',
  'text',
  'book',
  'quote',
  'project',
];

export function canonicalizeSocialFeedScope(scope: unknown): SocialFeedScope {
  return typeof scope === 'string' && SOCIAL_FEED_SCOPES.has(scope as SocialFeedScope)
    ? (scope as SocialFeedScope)
    : 'explore';
}

export function canonicalizeSocialFeedFilters(filters: readonly unknown[] = []): SocialFeedFilter[] {
  const requested = new Set(
    filters.filter((filter): filter is SocialFeedFilter =>
      typeof filter === 'string' &&
      SOCIAL_FEED_FILTER_ORDER.includes(filter as SocialFeedFilter)
    )
  );

  return SOCIAL_FEED_FILTER_ORDER.filter((filter) => requested.has(filter));
}

export function socialFeedFilterKey(filters: readonly SocialFeedFilter[]): string {
  return filters.length > 0 ? filters.join('|') : 'all';
}

export function createSocialFeedQueryKey(
  uid: string | undefined,
  scope: unknown,
  filters: readonly unknown[] = []
) {
  const canonicalScope = canonicalizeSocialFeedScope(scope);
  const canonicalFilters = canonicalizeSocialFeedFilters(filters);

  return [
    'feed',
    canonicalScope,
    socialFeedFilterKey(canonicalFilters),
    uid || 'guest',
  ] as const;
}
