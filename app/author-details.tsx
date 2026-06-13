import React, { useState } from "react";
import { useNavigation } from "../store/navigation.tsx";
import { useI18n } from "../store/i18n.tsx";
import { useAuthorDetailsAuthority } from "../lib/hooks/useAuthorDetailsAuthority.ts";
import { useBooksByAuthor } from "../lib/hooks/useBooksByAuthor.ts";
import { useDiscoverQuotes } from "../lib/hooks/useDiscoverQuotes.ts";
import { useAuthorFollowStatus } from "../lib/hooks/useAuthorFollowStatus.ts";
import { useFollowAuthor } from "../lib/hooks/useFollowAuthor.ts";
import { useUnfollowAuthor } from "../lib/hooks/useUnfollowAuthor.ts";
import { useToast } from "../store/toast.tsx";
import LoadingSpinner from "../components/ui/LoadingSpinner.tsx";
import BilingualText from "../components/ui/BilingualText.tsx";
import Button from "../components/ui/Button.tsx";
import { ChevronLeftIcon } from "../components/icons/ChevronLeftIcon.tsx";
import BookCard from "../components/content/BookCard.tsx";
import QuoteSnippetCard from "../components/content/QuoteSnippetCard.tsx";
import { PlusIcon } from "../components/icons/PlusIcon.tsx";
import { ShareIcon } from "../components/icons/ShareIcon.tsx";
import { BookIcon } from "../components/icons/BookIcon.tsx";
import { QuoteIcon } from "../components/icons/QuoteIcon.tsx";

const AUTHOR_DETAILS_QUOTE_LIMIT = 6;

const AuthorDetailsScreen: React.FC = () => {
  const { currentView, navigate, navigateToSocialAndHighlight } = useNavigation();
  const { lang, isRTL } = useI18n();
  const { showToast } = useToast();
  const authorId = currentView.type === "immersive" ? currentView.params?.authorId : undefined;

  const {
    data: books = [],
    isLoading: isBooksLoading,
    bibliographyAuthority,
    bibliography,
  } = useBooksByAuthor(authorId);
  const {
    data: authorityView,
    author,
    isLoading,
    isError,
    authorityState,
  } = useAuthorDetailsAuthority(authorId, bibliographyAuthority);
  const canonicalAuthorId = authorityView?.authorRef.entityId;
  const { data: quotes = [], isLoading: isQuotesLoading } = useDiscoverQuotes({
    authorId: canonicalAuthorId,
    limit: AUTHOR_DETAILS_QUOTE_LIMIT,
  });
  const { data: isAuthorFollowed = false, isLoading: isFollowStateLoading } =
    useAuthorFollowStatus(canonicalAuthorId);

  const [isBioExpanded, setBioExpanded] = useState(false);
  const { mutate: followAuthor, isPending: isFollowing } = useFollowAuthor();
  const { mutate: unfollowAuthor, isPending: isUnfollowing } = useUnfollowAuthor();
  const canonicalWorks = bibliography?.canonicalWorks ?? books;
  const repairWorks = bibliography?.repairWorks ?? [];
  const visibleQuotes = quotes.slice(0, AUTHOR_DETAILS_QUOTE_LIMIT);
  const isFollowActionPending = isFollowing || isUnfollowing || isFollowStateLoading;

  const handleBack = () => {
    const fromView = currentView.params?.from;
    const postId = currentView.params?.postId;

    if (fromView && fromView.type === "tab" && fromView.id === "social" && postId) {
      navigateToSocialAndHighlight(postId);
    } else if (fromView) {
      navigate(fromView);
    } else {
      navigate({ type: "tab", id: "home" });
    }
  };

  const handleBookClick = (bookId: string) => {
    navigate({ type: "immersive", id: "bookDetails", params: { bookId, from: currentView } });
  };

  const handleFollow = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canonicalAuthorId || isFollowActionPending) return;

    if (isAuthorFollowed) {
      const confirmed = window.confirm(
        lang === "en"
          ? "Unfollow this author?"
          : "إلغاء متابعة هذا المؤلف؟"
      );
      if (!confirmed) return;
      unfollowAuthor(canonicalAuthorId, {
        onError: () => {
          showToast(lang === "en" ? "Failed to unfollow author." : "تعذر إلغاء متابعة المؤلف.");
        },
      });
      return;
    }

    followAuthor(canonicalAuthorId, {
      onError: () => {
        showToast(lang === "en" ? "Failed to follow author." : "تعذر متابعة المؤلف.");
      },
    });
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canonicalAuthorId) return;
    navigate({
      type: "immersive",
      id: "postComposer",
      params: { from: currentView, attachment: { type: "author", id: canonicalAuthorId } },
    });
  };

  const handleViewBooks = () => {
    if (!canonicalAuthorId) return;
    navigate({ type: "immersive", id: "books", params: { authorId: canonicalAuthorId, from: currentView } });
  };

  const handleViewQuotes = () => {
    if (!canonicalAuthorId) return;
    navigate({ type: "immersive", id: "quotes", params: { authorId: canonicalAuthorId, from: currentView } });
  };

  const handleQuoteClick = (quoteId: string) => {
    navigate({
      type: "immersive",
      id: "quoteDetails",
      params: {
        quoteId,
        from: currentView,
      },
    });
  };

  const handleQuoteSourceClick = (e: React.MouseEvent, bookId: string) => {
    e.stopPropagation();
    navigate({ type: "immersive", id: "bookDetails", params: { bookId, from: currentView } });
  };

  const ActionButton: React.FC<{
    icon: React.FC<any>;
    onClick: (e: React.MouseEvent) => void;
    label: string;
    ariaLabel?: string;
    hint?: string;
    disabled?: boolean;
    active?: boolean;
  }> = ({ icon: Icon, onClick, label, ariaLabel, hint, disabled = false, active = false }) => (
    <button
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      disabled={disabled}
      className={`flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-lg border px-2 text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.1] hover:text-white focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 ${
        active ? "border-accent/50 bg-accent/15 text-white" : "border-white/10 bg-white/[0.06]"
      }`}
    >
      <Icon className="h-6 w-6" />
      <span className="text-[11px] font-semibold leading-tight">{label}</span>
      {hint ? <span className="text-[10px] leading-tight text-white/50">{hint}</span> : null}
    </button>
  );

  const SectionHeader: React.FC<{
    title: string;
    subtitle?: string;
    action?: React.ReactNode;
  }> = ({ title, subtitle, action }) => (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <BilingualText role="H1" className="!text-xl">
          {title}
        </BilingualText>
        {subtitle ? (
          <BilingualText role="Caption" className="mt-1 text-white/50">
            {subtitle}
          </BilingualText>
        ) : null}
      </div>
      {action}
    </div>
  );

  const EmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="rounded-lg border border-dashed border-white/12 bg-white/[0.03] px-4 py-5">
      <BilingualText role="Caption" className="text-white/60">
        {children}
      </BilingualText>
    </div>
  );

  if (isLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-4 bg-slate-900 px-6">
        <LoadingSpinner />
        <BilingualText role="Caption" className="text-white/50">
          {lang === "en" ? "Loading author profile..." : "جاري تحميل صفحة المؤلف..."}
        </BilingualText>
      </div>
    );
  }

  if (isError || !author || authorityState !== "canonical" || !authorityView) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-900">
        <BilingualText>Author not found.</BilingualText>
        <Button onClick={handleBack} className="mt-4">
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      <header className="fixed top-0 left-0 right-0 z-20 bg-transparent">
        <div className="app-rail app-rail--default flex h-20 items-center justify-start px-0">
          <Button
            variant="icon"
            onClick={handleBack}
            className="bg-black/40 backdrop-blur-sm !text-white"
            aria-label={lang === "en" ? "Back" : "رجوع"}
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </Button>
        </div>
      </header>
      <main className="flex-grow overflow-y-auto pt-20 pb-8">
        <div className="app-rail app-rail--default space-y-8">
          <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_18px_50px_rgba(2,8,23,0.28)]">
            <div className={`flex flex-col gap-5 sm:flex-row sm:items-end ${isRTL ? "sm:flex-row-reverse" : ""}`}>
              <img
                src={author.avatarUrl}
                alt={lang === "en" ? author.nameEn : author.nameAr}
                className="h-32 w-32 rounded-full flex-shrink-0 border-4 border-slate-700 object-cover shadow-lg"
              />
              <div className="min-w-0 flex-grow">
                <BilingualText role="Caption" className="mb-2 text-accent">
                  {lang === "en" ? "Author" : "مؤلف"}
                </BilingualText>
                <BilingualText role="H1" className="!text-4xl leading-tight">
                  {lang === "en" ? author.nameEn : author.nameAr}
                </BilingualText>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-white/60">
                  <BilingualText role="Caption">{author.lifespan}</BilingualText>
                  <span aria-hidden="true">/</span>
                  <BilingualText role="Caption">
                    {lang === "en" ? author.countryEn : author.countryAr}
                  </BilingualText>
                  <span aria-hidden="true">/</span>
                  <BilingualText role="Caption">
                    {lang === "en" ? author.languageEn : author.languageAr}
                  </BilingualText>
                </div>
                <span className="sr-only">
                  {`Author authority: ${authorityView.authorRef.authorityState}; bibliography authority: ${authorityView.bibliographyAuthority}`}
                </span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ActionButton
                icon={PlusIcon}
                onClick={handleFollow}
                label={
                  isFollowActionPending
                    ? (lang === "en" ? "Updating" : "جارٍ التحديث")
                    : isAuthorFollowed
                      ? (lang === "en" ? "Following" : "تتابعه")
                      : (lang === "en" ? "Follow" : "متابعة")
                }
                ariaLabel={isAuthorFollowed ? "Unfollow Author" : "Follow Author"}
                hint={
                  isAuthorFollowed && !isFollowActionPending
                    ? (lang === "en" ? "Tap to unfollow" : "اضغط للإلغاء")
                    : undefined
                }
                disabled={isFollowActionPending}
                active={isAuthorFollowed}
              />
              <ActionButton icon={ShareIcon} onClick={handleShare} label="Share Author" />
              <ActionButton icon={BookIcon} onClick={handleViewBooks} label="View Books" />
              <ActionButton icon={QuoteIcon} onClick={handleViewQuotes} label="View Quotes" />
            </div>
          </section>

          <section className="border-t border-white/10 pt-8">
            <SectionHeader
              title={lang === "en" ? "Biography" : "السيرة الذاتية"}
              subtitle={lang === "en" ? "A concise canonical profile." : "ملف تعريفي قانوني موجز."}
            />
            <div className="relative">
              <BilingualText
                role="Body"
                className={`text-white/75 leading-7 transition-all duration-300 ${!isBioExpanded ? "line-clamp-5" : ""}`}
              >
                {lang === "en" ? author.bioEn : author.bioAr}
              </BilingualText>
              {!isBioExpanded && (
                <button
                  onClick={() => setBioExpanded(true)}
                  className={`absolute bottom-0 bg-gradient-to-r from-transparent via-slate-900/80 to-slate-900 py-0.5 text-accent font-semibold ${isRTL ? "left-0 bg-gradient-to-l pl-1 pr-8" : "right-0 pl-8 pr-1"}`}
                >
                  {lang === "en" ? "more ..." : "... المزيد"}
                </button>
              )}
            </div>
          </section>

          <section className="border-t border-white/10 pt-8">
            <SectionHeader
              title={lang === "en" ? "Books by this Author" : "كتب هذا المؤلف"}
              subtitle={
                lang === "en"
                  ? `${bibliography?.totalCanonicalCount ?? canonicalWorks.length} canonical works`
                  : `${bibliography?.totalCanonicalCount ?? canonicalWorks.length} أعمال قانونية`
              }
              action={
                bibliography?.hasMore ? (
                  <button
                    type="button"
                    onClick={handleViewBooks}
                    className="shrink-0 text-sm font-semibold text-accent"
                  >
                    {lang === "en" ? "View all" : "عرض الكل"}
                  </button>
                ) : null
              }
            />
            <span className="sr-only">
              {`Bibliography authority: ${bibliographyAuthority}; canonical works: ${bibliography?.totalCanonicalCount ?? canonicalWorks.length}; repair works: ${bibliography?.totalRepairCount ?? repairWorks.length}; has more: ${bibliography?.hasMore === true}`}
            </span>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              {isBooksLoading ? (
                <div className="w-full py-8 flex flex-col items-center justify-center gap-3">
                  <LoadingSpinner />
                  <BilingualText role="Caption" className="text-white/50">
                    {lang === "en" ? "Loading bibliography..." : "جاري تحميل قائمة الأعمال..."}
                  </BilingualText>
                </div>
              ) : canonicalWorks.length > 0 || repairWorks.length > 0 ? (
                <div className="flex overflow-x-auto pb-2 scrollbar-hide">
                  {canonicalWorks.map((book) => (
                    <div key={book.id} onClick={() => handleBookClick(book.id)} className="cursor-pointer">
                      <BookCard bookId={book.id} layout="list" />
                    </div>
                  ))}
                  {repairWorks.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <BilingualText role="Caption" className="px-2 text-white/50">
                        {lang === "en" ? "Legacy catalog matches" : "مطابقات قديمة من الكتالوج"}
                      </BilingualText>
                      <div className="flex gap-4">
                        {repairWorks.map((book) => (
                          <div key={book.id} onClick={() => handleBookClick(book.id)} className="cursor-pointer">
                            <BookCard bookId={book.id} layout="list" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <EmptyState>
                  {lang === "en"
                    ? "No catalog books are attached to this canonical author yet."
                    : "لا توجد كتب مرتبطة بهذا المؤلف القانوني بعد."}
                </EmptyState>
              )}
            </div>
          </section>

          <section className="border-t border-white/10 pt-8">
            <SectionHeader
              title={lang === "en" ? "Quotes by this Author" : "اقتباسات هذا المؤلف"}
              subtitle={
                lang === "en"
                  ? "Public quotes from the existing quote catalog."
                  : "اقتباسات عامة من كتالوج الاقتباسات الحالي."
              }
              action={
                visibleQuotes.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleViewQuotes}
                    className="shrink-0 text-sm font-semibold text-accent"
                  >
                    {lang === "en" ? "View all" : "عرض الكل"}
                  </button>
                ) : null
              }
            />
            {isQuotesLoading ? (
              <div className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-8 flex flex-col items-center justify-center gap-3">
                <LoadingSpinner />
                <BilingualText role="Caption" className="text-white/50">
                  {lang === "en" ? "Loading public quotes..." : "جاري تحميل الاقتباسات العامة..."}
                </BilingualText>
              </div>
            ) : visibleQuotes.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleQuotes.map((quote) => {
                  const sourceTitle = lang === "en" ? quote.sourceEn : quote.sourceAr;
                  return (
                    <div key={quote.id} className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
                      <button
                        type="button"
                        onClick={() => handleQuoteClick(quote.id)}
                        aria-label={lang === "en" ? "Open quote details" : "فتح تفاصيل الاقتباس"}
                        className="w-full text-left"
                      >
                        <QuoteSnippetCard quote={quote} />
                      </button>
                      {quote.bookId && sourceTitle ? (
                        <button
                          type="button"
                          onClick={(e) => handleQuoteSourceClick(e, quote.bookId)}
                          className="text-sm font-medium text-accent"
                        >
                          {lang === "en" ? `From ${sourceTitle}` : `من ${sourceTitle}`}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState>
                {lang === "en"
                  ? "No public quotes are attached to this author yet."
                  : "لا توجد اقتباسات عامة مرتبطة بهذا المؤلف بعد."}
              </EmptyState>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default AuthorDetailsScreen;
