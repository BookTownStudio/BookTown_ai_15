export const REVIEW_PROJECTION_VERSION = "review_projection_v1";
export const BOOK_REVIEW_PROJECTION_COLLECTION = "book_review_projection";
export const SOCIAL_REVIEW_PROJECTION_COLLECTION = "social_review_projection";
export const USER_REVIEW_PROJECTION_COLLECTION = "user_reviews";

export function canonicalReviewId(uid: string, bookId: string): string {
  return `${uid}_${bookId}`;
}

export function userReviewProjectionId(uid: string, bookId: string): string {
  return canonicalReviewId(uid, bookId);
}

export function bookReviewProjectionId(uid: string, bookId: string): string {
  return canonicalReviewId(uid, bookId);
}

export function socialReviewProjectionId(uid: string, bookId: string): string {
  return canonicalReviewId(uid, bookId);
}
