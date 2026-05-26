import type { Review } from '../../types/entities.ts';

export type ReviewCardData = {
  id: string;
  domain?: 'book';
  visibility?: 'public' | 'private';
  bookId: string;
  bookTitleEn?: string;
  bookTitleAr?: string;
  bookAuthorEn?: string;
  bookAuthorAr?: string;
  bookCoverThumbUrl?: string;
  bookCoverUrl?: string;
  userId: string;
  rating: number;
  text: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  timestamp: string;
  upvotes: number;
  downvotes: number;
  commentsCount: number;
};

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export const ReviewCardDataAdapter = {
  fromReview(review: Review): ReviewCardData {
    return {
      id: review.id,
      ...(review.domain ? { domain: review.domain } : {}),
      ...(review.visibility ? { visibility: review.visibility } : {}),
      bookId: review.bookId,
      ...(review.bookTitleEn ? { bookTitleEn: review.bookTitleEn } : {}),
      ...(review.bookTitleAr ? { bookTitleAr: review.bookTitleAr } : {}),
      ...(review.bookAuthorEn ? { bookAuthorEn: review.bookAuthorEn } : {}),
      ...(review.bookAuthorAr ? { bookAuthorAr: review.bookAuthorAr } : {}),
      ...(review.bookCoverThumbUrl ? { bookCoverThumbUrl: review.bookCoverThumbUrl } : {}),
      ...(review.bookCoverUrl ? { bookCoverUrl: review.bookCoverUrl } : {}),
      userId: review.userId,
      rating: count(review.rating),
      text: review.text,
      authorName: review.authorName,
      authorHandle: review.authorHandle,
      authorAvatar: review.authorAvatar,
      timestamp: review.timestamp,
      upvotes: count(review.upvotes),
      downvotes: count(review.downvotes),
      commentsCount: count(review.commentsCount),
    };
  },
};
