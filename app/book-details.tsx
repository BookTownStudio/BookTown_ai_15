// app/book-details.tsx

import React, { useState, useMemo, useEffect } from 'react';
import PageTransition from '../components/ui/PageTransition.tsx';
import ErrorState from '../components/ui/ErrorState.tsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.tsx';

import { useNavigation } from '../store/navigation.tsx';
import { useI18n } from '../store/i18n.tsx';
import { useToast } from '../store/toast.tsx';

import { useBookCatalog } from '../lib/hooks/useBookCatalog.ts';
import { useBookReviews } from '../lib/hooks/useBookReviews.ts';
import { useBookShelfStatus } from '../lib/hooks/useBookShelfStatus.ts';
import { useRelatedBooks } from '../lib/hooks/useRelatedBooks.ts';
import { useSubmitReview } from '../lib/hooks/useSubmitReview.ts';
import { useAuth } from '../lib/auth.tsx';

import Button from '../components/ui/Button.tsx';
import BilingualText from '../components/ui/BilingualText.tsx';
import ReviewCard from '../components/content/ReviewCard.tsx';
import SelectShelfModal from '../components/modals/SelectShelfModal.tsx';
import StarRatingInput from '../components/ui/StarRatingInput.tsx';
import GlassCard from '../components/ui/GlassCard.tsx';

import {
  XIcon,
  ShareIcon,
  EyeIcon,
  StarIcon,
  QuoteIcon,
  EllipsisIcon,
  ShelvesIcon,
  SendIcon,
  EditIcon
} from '../components/icons';

import { cn } from '../lib/utils.ts';
import { mockBooks } from '../data/mocks.ts';

const MAX_REVIEW_LENGTH = 750;

const BookDetailsScreen: React.FC = () => {
  const { currentView, navigate } = useNavigation();
  const { lang, isRTL } = useI18n();
  const { showToast } = useToast();
  const { user } = useAuth();

  const originalBookId = currentView.type === 'immersive' ? currentView.params?.bookId : undefined;
  const reviewAction = currentView.type === 'immersive' ? currentView.params?.reviewAction : undefined;

  const randomBookId = useMemo(() => {
    if (originalBookId !== 'surprise') return null;
    const keys = Object.keys(mockBooks);
    return keys[Math.floor(Math.random() * keys.length)];
  }, [originalBookId]);

  const bookId = originalBookId === 'surprise' ? randomBookId : originalBookId;

  const { data: book, isLoading: isBookLoading, isError, refetch } = useBookCatalog(bookId);
  const { data: reviews = [], isLoading: isReviewsLoading } = useBookReviews(bookId);
  const { isSaved = false } = useBookShelfStatus(bookId);
  
  useRelatedBooks(book || undefined);
  const submitReview = useSubmitReview();

  const existingUserReview = useMemo(() => {
    if (!user?.uid || !Array.isArray(reviews)) return null;
    return reviews.find(r => r.userId === user.uid) || null;
  }, [reviews, user?.uid]);

  const [isShelfModalOpen, setIsShelfModalOpen] = useState(false);
  const [isAddingReview, setIsAddingReview] = useState(false);
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [reviewText, setReviewText] = useState('');

  useEffect(() => {
    if (existingUserReview && isEditingReview) {
      setReviewText(existingUserReview.text || '');
      setUserRating(existingUserReview.rating || 0);
    } else if (!isEditingReview && !isAddingReview) {
      setReviewText('');
      setUserRating(0);
    }
  }, [existingUserReview, isEditingReview, isAddingReview]);

  useEffect(() => {
    if (reviewAction !== 'edit') return;
    if (!existingUserReview) return;
    setIsAddingReview(false);
    setIsEditingReview(true);
  }, [reviewAction, existingUserReview]);

  const hasReadableEbook = Boolean(book?.ebookAttachmentId || book?.isEbookAvailable);

  const handleBack = () => {
    const from = currentView.type === 'immersive' ? currentView.params?.from : null;
    navigate(from || { type: 'tab', id: 'home' });
  };

  const handleShare = () => {
    if (!book || !navigator.share) return;
    navigator.share({
      title: lang === 'en' ? book.titleEn : book.titleAr,
      url: window.location.href
    }).catch(() => {});
  };

  const handlePublishReview = async () => {
    if (!bookId || !user?.uid) return;
    if (!reviewText.trim() || userRating <= 0) {
        showToast(lang === 'en' ? 'Rating and text required' : 'التقييم والنص مطلوبان');
        return;
    }

    try {
      await submitReview.submitReviewAsync({ bookId, rating: userRating, text: reviewText.trim() });
      setIsAddingReview(false);
      setIsEditingReview(false);
      showToast(lang === 'en' ? 'Published.' : 'تم النشر.');
    } catch (err) {
      showToast('Error saving review.');
    }
  };

  if (isBookLoading || !book) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0B0F14] gap-4">
        <LoadingSpinner />
        <BilingualText className="text-white/40 !text-sm">
          {lang === 'en' ? 'Preparing the book…' : 'جاري تجهيز الكتاب…'}
        </BilingualText>
      </div>
    );
  }

  const showComposer = isAddingReview || isEditingReview;

  return (
    <PageTransition className="h-screen w-full bg-black text-white overflow-y-auto">
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-6 bg-gradient-to-b from-black to-transparent">
        <Button variant="icon" onClick={handleBack} className="!bg-white/10 backdrop-blur-md !p-3">
          <XIcon className="h-6 w-6" />
        </Button>
        <Button variant="icon" className="!bg-white/10 backdrop-blur-md !p-3">
          <EllipsisIcon className="h-6 w-6" />
        </Button>
      </header>

      <main className="relative z-10 px-6 pb-24 space-y-10">
        {/* Hero */}
        <section className={cn('flex items-start gap-5', isRTL && 'flex-row-reverse')}>
          <div className="w-32 md:w-56 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-slate-800 flex-shrink-0">
            {book.coverUrl && <img src={book.coverUrl} className="w-full h-full object-cover" alt="" />}
          </div>
          <div className={cn('flex-grow flex flex-col pt-1', isRTL && 'text-right')}>
            <BilingualText role="H1" className="!text-2xl md:!text-4xl !font-bold leading-tight">
              {lang === 'en' ? book.titleEn : book.titleAr}
            </BilingualText>
            <p className="text-base text-white/60 mt-1.5">{lang === 'en' ? book.authorEn : book.authorAr}</p>
            <div className={cn('flex wrap items-center gap-2 mt-4', isRTL && 'justify-end')}>
              <div className="flex items-center bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
                <StarIcon className="h-3 w-3 text-yellow-400 fill-current mr-1.5" />
                <span className="text-sm font-black mr-1.5">{(book.rating || 0).toFixed(1)}</span>
                <span className="text-[10px] text-white/30 tracking-tighter">({(book.ratingsCount || 0).toLocaleString()})</span>
              </div>
            </div>
          </div>
        </section>

        {/* Action Row */}
        <section className="grid grid-cols-4 gap-3">
          <button onClick={() => setIsShelfModalOpen(true)} className={cn('flex items-center justify-center aspect-square rounded-2xl bg-white/5 border border-white/10', isSaved && 'text-accent bg-accent/10')}><ShelvesIcon className="h-6 w-6" /></button>
          <button className="flex items-center justify-center aspect-square rounded-2xl bg-white/5 border border-white/10"><QuoteIcon className="h-6 w-6" /></button>
          <button onClick={handleShare} className="flex items-center justify-center aspect-square rounded-2xl bg-white/5 border border-white/10"><ShareIcon className="h-6 w-6" /></button>
          <button onClick={() => hasReadableEbook && navigate({ type: 'immersive', id: 'reader', params: { bookId, from: currentView } })} disabled={!hasReadableEbook} className={cn('flex items-center justify-center aspect-square rounded-2xl border bg-white/5 border-white/10', !hasReadableEbook && 'opacity-20')}><EyeIcon className="h-6 w-6" /></button>
        </section>

        {/* Summary */}
        <section className="space-y-3">
          <BilingualText role="H2" className="!text-xl !font-bold">{lang === 'en' ? 'Summary' : 'الملخص'}</BilingualText>
          <p className="text-base text-white/80 leading-relaxed font-serif">{lang === 'en' ? book.descriptionEn : book.descriptionAr || book.descriptionEn}</p>
        </section>

        {/* Reviews */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <BilingualText role="H2" className="!text-xl !font-bold">{lang === 'en' ? 'Critiques' : 'المراجعات'}</BilingualText>
            {user && !existingUserReview && !showComposer && (
                <Button variant="ghost" onClick={() => setIsAddingReview(true)} className="!h-9 !px-4 !text-xs border border-white/10 rounded-full"><EditIcon className="h-3 w-3 mr-2" />{lang === 'en' ? 'Write a review' : 'اكتب مراجعة'}</Button>
            )}
          </div>

          {user && showComposer && (
            <GlassCard className="!p-0 !bg-white/5 border-white/10 overflow-hidden animate-fade-in-up">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                <BilingualText className="text-[10px] uppercase font-black tracking-widest text-white/40">{isEditingReview ? 'Edit Review' : 'New Review'}</BilingualText>
                <StarRatingInput rating={userRating} onRatingChange={setUserRating} size="sm" />
              </div>
              <div className="p-6">
                <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="..." className="w-full bg-transparent text-white text-base font-serif resize-none focus:outline-none" rows={3} autoFocus />
                <div className="mt-4 flex justify-end gap-3">
                  <Button variant="ghost" onClick={() => { setIsAddingReview(false); setIsEditingReview(false); }} className="!text-xs">Cancel</Button>
                  <Button variant="primary" disabled={submitReview.isPending} onClick={handlePublishReview} className="rounded-full !px-6 !h-9 !text-sm">Save</Button>
                </div>
              </div>
            </GlassCard>
          )}

          <div className="space-y-4">
            {reviews.map(r => (
              <ReviewCard key={`${r.bookId}_${r.userId}`} review={r} onEdit={() => setIsEditingReview(true)} />
            ))}
          </div>
        </section>
      </main>

      <SelectShelfModal isOpen={isShelfModalOpen} onClose={() => setIsShelfModalOpen(false)} bookId={bookId!} book={book} />
    </PageTransition>
  );
};

export default BookDetailsScreen;
