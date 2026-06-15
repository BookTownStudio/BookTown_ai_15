import React, { useEffect, useMemo } from "react";
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
import AuthorIdentityModule from "../components/authors/AuthorIdentityModule.tsx";
import AuthorCanonModule from "../components/authors/AuthorCanonModule.tsx";
import AuthorVoiceModule from "../components/authors/AuthorVoiceModule.tsx";
import AuthorReaderMemoryModule from "../components/authors/AuthorReaderMemoryModule.tsx";
import AuthorContinueModule from "../components/authors/AuthorContinueModule.tsx";
import { buildAuthorCanonModel } from "../lib/authors/authorCanon.ts";
import { useAuthorReaderMemory } from "../lib/hooks/useAuthorReaderMemory.ts";
import { useSaveBookmark } from "../lib/hooks/useSaveQuote.ts";

const AUTHOR_DETAILS_QUOTE_LIMIT = 6;

const AuthorDetailsScreen: React.FC = () => {
  const { currentView, navigate, navigateToSocialAndHighlight } = useNavigation();
  const { lang, isRTL } = useI18n();
  const { showToast } = useToast();
  const authorId = currentView.type === "immersive" ? currentView.params?.authorId : undefined;

  const {
    data: authorityView,
    author,
    isLoading,
    isError,
    authorityState,
  } = useAuthorDetailsAuthority(authorId);
  const canonicalAuthorId = authorityView?.authorRef.entityId;
  const {
    data: books = [],
    isLoading: isBooksLoading,
    bibliographyAuthority,
    bibliography,
  } = useBooksByAuthor(canonicalAuthorId);
  const { data: quotes = [], isLoading: isQuotesLoading } = useDiscoverQuotes({
    authorId: canonicalAuthorId,
    limit: AUTHOR_DETAILS_QUOTE_LIMIT,
  });
  const { data: isAuthorFollowed = false, isLoading: isFollowStateLoading } =
    useAuthorFollowStatus(canonicalAuthorId);

  const { mutate: followAuthor, isPending: isFollowing } = useFollowAuthor();
  const { mutate: unfollowAuthor, isPending: isUnfollowing } = useUnfollowAuthor();
  const { mutate: saveBookmark } = useSaveBookmark();
  const canonicalWorks = bibliography?.canonicalWorks ?? books;
  const repairWorks = bibliography?.repairWorks ?? [];
  const visibleQuotes = quotes.slice(0, AUTHOR_DETAILS_QUOTE_LIMIT);
  const isFollowActionPending = isFollowing || isUnfollowing || isFollowStateLoading;
  const canon = useMemo(() => buildAuthorCanonModel(canonicalWorks), [canonicalWorks]);
  const { data: readerMemory, isLoading: isReaderMemoryLoading } = useAuthorReaderMemory({
    authorId: canonicalAuthorId,
    canonicalWorks,
    quotes: visibleQuotes,
    isFollowed: isAuthorFollowed,
  });

  useEffect(() => {
    const targetAuthorId = authorityView?.redirect?.targetAuthorId;
    if (!authorityView?.redirect?.required || !targetAuthorId || targetAuthorId === authorId) return;
    navigate({
      type: "immersive",
      id: "authorDetails",
      params: { ...currentView.params, authorId: targetAuthorId, redirectedFromAuthorId: authorId },
    });
  }, [authorityView?.redirect?.required, authorityView?.redirect?.targetAuthorId, authorId, currentView.params, navigate]);

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

  const handleSaveQuote = (quoteId: string) => {
    saveBookmark(
      { entityId: quoteId, type: "quote" },
      {
        onSuccess: () => {
          showToast(lang === "en" ? "Quote saved." : "تم حفظ الاقتباس.");
        },
        onError: () => {
          showToast(lang === "en" ? "Failed to save quote." : "تعذر حفظ الاقتباس.");
        },
      }
    );
  };

  const handleShareQuote = (quoteId: string) => {
    navigate({
      type: "immersive",
      id: "postComposer",
      params: {
        from: currentView,
        attachment: { type: "quote", id: quoteId },
      },
    });
  };

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
          <span className="sr-only">
            {`Author authority: ${authorityView.authorRef.authorityState}; bibliography authority: ${authorityView.bibliographyAuthority}`}
          </span>

          <AuthorIdentityModule
            author={author}
            lang={lang}
            isRTL={isRTL}
            worksCount={bibliography?.totalCanonicalCount ?? canonicalWorks.length}
            quotesCount={visibleQuotes.length}
            isFollowed={isAuthorFollowed}
            isFollowActionPending={isFollowActionPending}
            onFollow={handleFollow}
            onShare={handleShare}
            onViewBooks={handleViewBooks}
            onViewQuotes={handleViewQuotes}
          />

          <AuthorReaderMemoryModule
            memory={readerMemory}
            isLoading={isReaderMemoryLoading}
            lang={lang}
          />

          <AuthorContinueModule
            continuation={readerMemory?.continuation}
            lang={lang}
            onBookClick={handleBookClick}
          />

          <AuthorCanonModule
            canon={canon}
            isLoading={isBooksLoading}
            hasMore={bibliography?.hasMore === true}
            totalCanonicalCount={bibliography?.totalCanonicalCount ?? canonicalWorks.length}
            repairWorksCount={bibliography?.totalRepairCount ?? repairWorks.length}
            bibliographyAuthority={bibliographyAuthority}
            lang={lang}
            onBookClick={handleBookClick}
            onViewAll={handleViewBooks}
          />

          <AuthorVoiceModule
            quotes={visibleQuotes}
            isLoading={isQuotesLoading}
            lang={lang}
            onViewAll={handleViewQuotes}
            onQuoteClick={handleQuoteClick}
            onQuoteSourceClick={handleQuoteSourceClick}
            onSaveQuote={handleSaveQuote}
            onShareQuote={handleShareQuote}
          />
        </div>
      </main>
    </div>
  );
};

export default AuthorDetailsScreen;
