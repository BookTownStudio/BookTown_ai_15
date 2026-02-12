// components/content/ReviewCard.tsx
import React, { useMemo } from 'react';
import { Review } from '../../types/entities.ts';

import { useI18n } from '../../store/i18n.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { useDeleteReview } from '../../lib/hooks/useDeleteReview.ts';

import BilingualText from '../ui/BilingualText.tsx';
import { StarIcon } from '../icons/StarIcon.tsx';
import { cn } from '../../lib/utils.ts';

type ReviewCardProps = {
  review: Review;
  onEdit?: (review: Review) => void;
};

const ReviewCard: React.FC<ReviewCardProps> = ({ review, onEdit }) => {
  const { lang, isRTL } = useI18n();
  const { user } = useAuth();

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

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!review.bookId || deleteReview.isPending) return;
    await deleteReview.mutateAsync({ bookId: review.bookId });
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) onEdit(review);
  };

  return (
    <div className="py-4 border-b border-white/10 last:border-b-0 animate-fade-in group">
      <div className={cn('flex flex-col gap-3', isRTL && 'items-end')}>
        
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

          {/* Rating */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
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
        </div>

        {/* Text */}
        <div className={cn("w-full px-1", isRTL && "text-right")}>
          {review.text && (
            <p className="mt-1 text-[15px] text-white/80 leading-relaxed font-serif break-words">
              {review.text}
            </p>
          )}

          {/* Actions */}
          {isOwner && (
            <div className={cn('mt-3 flex gap-4 text-[11px] font-bold uppercase tracking-wider', isRTL ? 'justify-start' : 'justify-end')}>
              {onEdit && (
                <button onClick={handleEdit} className="text-white/40 hover:text-white transition-colors">
                  {lang === 'en' ? 'Edit' : 'تعديل'}
                </button>
              )}
              <button onClick={handleDelete} disabled={deleteReview.isPending} className="text-red-400/60 hover:text-red-400 transition-colors">
                {deleteReview.isPending ? '...' : (lang === 'en' ? 'Delete' : 'حذف')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReviewCard;