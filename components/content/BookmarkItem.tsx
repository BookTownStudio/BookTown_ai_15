
import React from 'react';
import { Bookmark, BookmarkType } from '../../types/entities.ts';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { View } from '../../types/navigation.ts';
import GlassCard from '../ui/GlassCard.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { useBookmarkToggle } from '../../lib/hooks/useBookmarkToggle.ts';

// Data hooks
import { useBookCatalog } from '../../lib/hooks/useBookCatalog.ts';
import { useQuoteDetails } from '../../lib/hooks/useQuoteDetails.ts';
import { usePostDetails } from '../../lib/hooks/usePostDetails.ts';
import { useAuthorDetails } from '../../lib/hooks/useAuthorDetails.ts';
import { useVenueDetails } from '../../lib/hooks/useVenueDetails.ts';

// Icons
import { BookmarkIcon } from '../icons/BookmarkIcon.tsx';

// --- Helper Components ---

const LoadingCard = () => (
    <GlassCard className="!p-3">
        <div className="h-16 w-full bg-white/5 animate-pulse rounded-md" />
    </GlassCard>
);

interface ItemProps {
    bookmark: Bookmark;
    lang: 'en' | 'ar';
    onPress: () => void;
}

// --- Item Renderers ---

const BookItem: React.FC<ItemProps> = ({ bookmark, lang, onPress }) => {
    const { data: book, isLoading } = useBookCatalog(bookmark.entityId);
    if (isLoading) return <LoadingCard />;
    if (!book) return null;

    return (
        <div className="flex items-center gap-4">
            <img src={book.coverUrl} alt="cover" className="h-16 w-11 rounded-md object-cover flex-shrink-0" />
            <div className="overflow-hidden flex-grow">
                <BilingualText className="font-semibold truncate">{lang === 'en' ? book.titleEn : book.titleAr}</BilingualText>
                <BilingualText role="Caption" className="truncate">{lang === 'en' ? book.authorEn : book.authorAr}</BilingualText>
            </div>
        </div>
    );
};

interface QuoteItemProps extends ItemProps {
    quote?: ReturnType<typeof useQuoteDetails>['data'];
    isLoading: boolean;
}

const QuoteItem: React.FC<QuoteItemProps> = ({ lang, quote, isLoading }) => {
    if (isLoading) return <LoadingCard />;
    if (!quote) return null;

    return (
        <div className="flex-grow overflow-hidden">
            <BilingualText role="Quote" className="!text-base line-clamp-2">"{lang === 'en' ? quote.textEn : quote.textAr}"</BilingualText>
            <BilingualText role="Caption" className="mt-2 text-right truncate">— {lang === 'en' ? quote.sourceEn : quote.sourceAr}</BilingualText>
        </div>
    );
};

const PostItem: React.FC<ItemProps> = ({ bookmark, lang, onPress }) => {
    const { data: post, isLoading } = usePostDetails(bookmark.entityId);
    if (isLoading) return <LoadingCard />;
    if (!post) return null;

    return (
        <div className="flex items-start gap-3 flex-grow overflow-hidden">
            <img src={post.authorAvatar} alt={post.authorName} className="h-10 w-10 rounded-full flex-shrink-0" />
            <div className="overflow-hidden flex-grow">
                <div className="flex items-baseline gap-2">
                    <BilingualText className="font-semibold truncate">{post.authorName}</BilingualText>
                    <BilingualText role="Caption" className="truncate flex-shrink-0">{post.authorHandle}</BilingualText>
                </div>
                {/* FIX: content is now an object per POST_MODEL_V1, accessing .text property */}
                <BilingualText role="Body" className="mt-1 !text-sm line-clamp-2">{post.content.text}</BilingualText>
            </div>
        </div>
    );
};

const AuthorItem: React.FC<ItemProps> = ({ bookmark, lang, onPress }) => {
    const { data: author, isLoading } = useAuthorDetails(bookmark.entityId);
    if (isLoading) return <LoadingCard />;
    if (!author) return null;

    return (
        <div className="flex items-center gap-4 flex-grow overflow-hidden">
            <img src={author.avatarUrl} alt="avatar" className="h-12 w-12 rounded-full object-cover flex-shrink-0" />
            <div className="overflow-hidden flex-grow">
                <BilingualText className="font-semibold truncate">{lang === 'en' ? author.nameEn : author.nameAr}</BilingualText>
                <BilingualText role="Caption" className="truncate">{lang === 'en' ? author.countryEn : author.countryAr}</BilingualText>
            </div>
        </div>
    );
};

const VenueItem: React.FC<ItemProps> = ({ bookmark, lang, onPress }) => {
    const { data: venue, isLoading } = useVenueDetails(bookmark.entityId);
    if (isLoading) return <LoadingCard />;
    if (!venue) return null;

    const isEvent = 'dateTime' in venue;
    const name = isEvent ? (lang === 'en' ? venue.titleEn : venue.titleAr) : venue.name;
    const subtitle = isEvent ? (venue.isOnline ? "Online Event" : venue.venueName) : venue.address;

    return (
        <div className="flex items-center gap-4 flex-grow overflow-hidden">
            <img src={venue.imageUrl} alt="venue image" className="h-16 w-16 rounded-md object-cover flex-shrink-0" />
            <div className="overflow-hidden flex-grow">
                <BilingualText className="font-semibold truncate">{name}</BilingualText>
                <BilingualText role="Caption" className="truncate">{subtitle}</BilingualText>
            </div>
        </div>
    );
};

// --- Main Component ---
const BookmarkItem: React.FC<{ bookmark: Bookmark }> = ({ bookmark }) => {
    const { lang } = useI18n();
    const { user } = useAuth();
    const { navigate, currentView, navigateToSocialPostEntry } = useNavigation();
    const {
        data: quote,
        isLoading: isQuoteLoading,
    } = useQuoteDetails(
        bookmark.type === 'quote' ? bookmark.entityId : undefined,
        bookmark.quoteOwnerId
    );
    
    // Authoritative Toggle Hook
    const { mutate: toggleBookmark, isLoading: isToggling } = useBookmarkToggle();
    
    const handlePress = () => {
        switch(bookmark.type) {
            case 'post': 
                navigateToSocialPostEntry(bookmark.entityId, {
                    openDiscussion: true,
                    fallbackToStandalone: true,
                });
                break;
            case 'book':
                navigate({ type: 'immersive', id: 'bookDetails', params: { bookId: bookmark.entityId, from: currentView } });
                break;
            case 'quote':
                navigate({
                    type: 'immersive',
                    id: 'quoteDetails',
                    params: {
                        quoteId: quote?.id || bookmark.entityId,
                        from: currentView,
                    },
                });
                break;
            case 'author':
                navigate({ type: 'immersive', id: 'authorDetails', params: { authorId: bookmark.entityId, from: currentView } });
                break;
            case 'venue':
            case 'event':
                navigate({ type: 'immersive', id: 'venueDetails', params: { venueId: bookmark.entityId, from: currentView } });
                break;
        }
    };

    const handleUnbookmark = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!user || isToggling) return;

        // Using normalized toggle hook
        toggleBookmark({
            entityId: bookmark.entityId,
            type: bookmark.type,
            isBookmarked: true // In this list, it's always true
        });
    };

    const itemProps = { bookmark, lang, onPress: handlePress };

    const renderInner = () => {
        switch(bookmark.type) {
            case 'book': return <BookItem {...itemProps} />;
            case 'quote':
                return (
                    <QuoteItem
                        {...itemProps}
                        quote={quote}
                        isLoading={isQuoteLoading}
                    />
                );
            case 'post': return <PostItem {...itemProps} />;
            case 'author': return <AuthorItem {...itemProps} />;
            case 'venue':
            case 'event':
                return <VenueItem {...itemProps} />;
            default:
                return null;
        }
    };

    return (
        <button onClick={handlePress} className="w-full text-left group">
            <GlassCard className="!p-3 hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center gap-3">
                <div className="flex-grow overflow-hidden">
                    {renderInner()}
                </div>
                <button 
                    onClick={handleUnbookmark}
                    disabled={isToggling}
                    className="p-2 text-accent hover:scale-110 transition-transform flex-shrink-0 disabled:opacity-50"
                    aria-label={lang === 'en' ? 'Un-bookmark' : 'إزالة من المفضلة'}
                >
                    <BookmarkIcon className="h-6 w-6 fill-current" />
                </button>
            </GlassCard>
        </button>
    );
};

export default BookmarkItem;
