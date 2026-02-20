// components/content/ReviewCard.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Review } from '../../types/entities.ts';

import { useI18n } from '../../store/i18n.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { useDeleteReview } from '../../lib/hooks/useDeleteReview.ts';

import { BookIcon } from '../icons/BookIcon.tsx';
import { StarIcon } from '../icons/StarIcon.tsx';
import { VerticalEllipsisIcon } from '../icons/VerticalEllipsisIcon.tsx';
import { cn } from '../../lib/utils.ts';

type ReviewCardProps = {
  review: Review;
  onEdit?: (review: Review) => void;
  showBookContext?: boolean;
  onOpenBook?: (review: Review) => void;
};

const ReviewCard: React.FC<ReviewCardProps> = ({
  review,
  onEdit,
  showBookContext = false,
  onOpenBook,
}) => {
  const { lang, isRTL } = useI18n();
  const { user } = useAuth();
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isBookCoverFailed, setIsBookCoverFailed] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  const isOwner = Boolean(user?.uid && user.uid === review.userId);
  const deleteReview = useDeleteReview();

  /**
   * IDENTITY RESOLUTION
   * Calculated before render to prevent flickering/overlap.
   */
  const displayName = useMemo(() => {
    return review.authorName || (lang === 'en' ? 'Anonymous' : 'مستخدم');
  }, [review.authorName, lang]);

  const displayHandle = useMemo(() => {
    if (!review.authorHandle || review.authorHandle === review.authorName) return null;
    return `@${review.authorHandle.replace('@', '')}`;
  }, [review.authorHandle, review.authorName]);

  const authorAvatar = review.authorAvatar || '/avatar.png';
  const bookTitle =
    lang === 'ar'
      ? (review.bookTitleAr || review.bookTitleEn || (lang === 'en' ? 'Unknown book' : 'كتاب غير معروف'))
      : (review.bookTitleEn || review.bookTitleAr || 'Unknown book');
  const bookAuthor =
    lang === 'ar'
      ? (review.bookAuthorAr || review.bookAuthorEn || '')
      : (review.bookAuthorEn || review.bookAuthorAr || '');
  const bookCover = review.bookCoverThumbUrl || review.bookCoverUrl || '';

  useEffect(() => {
    setIsBookCoverFailed(false);
  }, [bookCover]);

  useEffect(() => {
    if (!isActionsOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!actionsMenuRef.current?.contains(target)) {
        setIsActionsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isActionsOpen]);

  const openBook = () => {
    if (!onOpenBook || !review.bookId) return;
    onOpenBook(review);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!review.bookId || deleteReview.isPending) return;
    const confirmed = window.confirm(
      lang === 'en' ? 'Delete this review?' : 'هل تريد حذف هذه المراجعة؟'
    );
    if (!confirmed) return;
    await deleteReview.mutateAsync({ bookId: review.bookId });
    setIsActionsOpen(false);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) onEdit(review);
    setIsActionsOpen(false);
  };

  const handleToggleActions = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsActionsOpen((prev) => !prev);
  };

  return (
    <div
      className={cn(
        "py-4 border-b border-white/10 last:border-b-0 animate-fade-in group",
        onOpenBook && review.bookId ? "cursor-pointer" : ""
      )}
      role={onOpenBook && review.bookId ? "button" : undefined}
      tabIndex={onOpenBook && review.bookId ? 0 : undefined}
      onClick={openBook}
      onKeyDown={(e) => {
        if (!onOpenBook || !review.bookId) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openBook();
        }
      }}
    >
      <div className={cn('flex flex-col gap-3', isRTL && 'items-end')}>
        {showBookContext && (
          <div className={cn('flex items-center gap-3 w-full rounded-lg border border-white/10 bg-white/5 p-2', isRTL && 'flex-row-reverse')}>
            <div className="h-12 w-9 flex-shrink-0 overflow-hidden rounded-md bg-slate-800">
              {bookCover && !isBookCoverFailed ? (
                <img
                  src={bookCover}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                  onError={() => setIsBookCoverFailed(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-slate-700/50 text-slate-400">
                  <BookIcon className="h-4 w-4" />
                </div>
              )}
            </div>
            <div className={cn('min-w-0 flex-grow', isRTL && 'text-right')}>
              <p className="truncate text-sm font-bold text-white">{bookTitle}</p>
              <p className="truncate text-xs text-white/60">{bookAuthor || (lang === 'en' ? 'Unknown author' : 'مؤلف غير معروف')}</p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
              {lang === 'en' ? 'View Book' : 'عرض الكتاب'}
            </span>
          </div>
        )}
        
        {/* AUTHOR IDENTITY BLOCK: Fixed Layout to prevent reflow/overlap */}
        <div className={cn('flex items-center gap-3 w-full', isRTL && 'flex-row-reverse')}>
          <div className="h-10 w-10 flex-shrink-0">
            <img
              src={authorAvatar}
              alt=""
              className="h-full w-full rounded-full object-cover bg-slate-800 border border-white/5"
            />
          </div>

          <div className="flex flex-col justify-center min-w-0 flex-grow h-10">
            <span className={cn(
              "font-bold text-[14px] text-white truncate leading-tight block",
              isRTL && "text-right"
            )}>
              {displayName}
            </span>
            {displayHandle && (
              <span className={cn(
                "text-[10px] text-white/40 truncate leading-none block mt-0.5",
                isRTL && "text-right"
              )}>
                {displayHandle}
              </span>
            )}
          </div>

	          {/* Rating + Owner Actions */}
	          <div className={cn('relative flex flex-shrink-0 items-center gap-1.5', isRTL && 'flex-row-reverse')}>
	            <div className="flex items-center gap-0.5">
	              {Array.from({ length: 5 }).map((_, i) => (
	                <StarIcon
	                  key={i}
	                  className={cn(
	                    'h-3.5 w-3.5',
	                    i < review.rating ? 'text-yellow-400' : 'text-white/10'
	                  )}
	                />
	              ))}
	            </div>

	            {isOwner && (
	              <div ref={actionsMenuRef} className="relative">
	                <button
	                  type="button"
	                  onClick={handleToggleActions}
	                  className="rounded-full p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
	                  aria-label={lang === 'en' ? 'Review actions' : 'إجراءات المراجعة'}
	                  aria-expanded={isActionsOpen}
	                >
	                  <VerticalEllipsisIcon className="h-4 w-4" />
	                </button>
	                {isActionsOpen && (
	                  <div
	                    className={cn(
	                      'absolute top-full z-40 mt-1 w-36 overflow-hidden rounded-lg border border-white/10 bg-slate-900 shadow-xl',
	                      isRTL ? 'left-0' : 'right-0'
	                    )}
	                    onClick={(event) => event.stopPropagation()}
	                  >
	                    <button
	                      type="button"
	                      onClick={handleEdit}
	                      disabled={!onEdit}
	                      className="w-full px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
	                    >
	                      {lang === 'en' ? 'Edit review' : 'تعديل المراجعة'}
	                    </button>
	                    <button
	                      type="button"
	                      onClick={handleDelete}
	                      disabled={deleteReview.isPending}
	                      className="w-full px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-red-300 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
	                    >
	                      {deleteReview.isPending
	                        ? '...'
	                        : lang === 'en'
	                          ? 'Delete review'
	                          : 'حذف المراجعة'}
	                    </button>
	                  </div>
	                )}
	              </div>
	            )}
	          </div>
	        </div>

        {/* Text */}
        <div className={cn("w-full px-1", isRTL && "text-right")}>
          {review.text && (
            <p className="mt-1 text-[15px] text-white/80 leading-relaxed font-serif break-words">
              {review.text}
            </p>
          )}

	        </div>
	      </div>
	    </div>
  );
};

export default ReviewCard;
