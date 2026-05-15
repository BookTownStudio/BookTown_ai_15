import { describe, expect, it } from 'vitest';
import {
  canonicalizeSocialFeedFilters,
  canonicalizeSocialFeedScope,
  createSocialFeedQueryKey,
  socialFeedFilterKey,
} from '../../lib/socialFeedState.ts';

describe('social feed state canonicalization', () => {
  it('normalizes invalid scope values back to Explore', () => {
    expect(canonicalizeSocialFeedScope('explore')).toBe('explore');
    expect(canonicalizeSocialFeedScope('unknown')).toBe('explore');
    expect(canonicalizeSocialFeedScope(null)).toBe('explore');
  });

  it('deduplicates filters and applies canonical order', () => {
    expect(canonicalizeSocialFeedFilters(['quote', 'media', 'quote', 'invalid', 'book'])).toEqual([
      'media',
      'book',
      'quote',
    ]);
  });

  it('uses a stable all-filter key for the canonical global feed', () => {
    expect(socialFeedFilterKey([])).toBe('all');
    expect(createSocialFeedQueryKey('viewer-1', 'explore', [])).toEqual([
      'feed',
      'explore',
      'all',
      'viewer-1',
    ]);
  });

  it('prevents cache-key drift from repeated or reordered filters', () => {
    expect(createSocialFeedQueryKey('viewer-1', 'explore', ['quote', 'media'])).toEqual(
      createSocialFeedQueryKey('viewer-1', 'explore', ['media', 'quote', 'quote'])
    );
  });
});
