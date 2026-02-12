export const PCS_VERSION = "v1";

export function computeProfileCompletionScore(params: {
  hasAvatar: boolean;
  hasBio: boolean;
  shelvesCreated: number;
  posts: number;
  reviews: number;
  booksRead: number;
  wordsWritten: number;
}): number {
  let score = 0;

  if (params.hasAvatar) score += 15;
  if (params.hasBio) score += 15;
  if (params.shelvesCreated >= 1) score += 15;
  if (params.posts + params.reviews >= 1) score += 20;
  if (params.booksRead >= 1) score += 15;
  if (params.wordsWritten >= 500) score += 20;

  return Math.min(score, 100);
}